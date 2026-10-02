/* Results handlers: laboratory imports, clinician review and release, corrections,
   follow-up and reminder retry. Every action is idempotent: a repeated click returns a
   failure and changes nothing, so no logical record is created twice. */
import type { Episode, ImportRow, Observation, ReportVersion } from "../types";
import { ANALYTES, FOLLOW_UP_OUTCOMES, HOLD_CATEGORY, flagFor } from "../constants";
import { ADVICE_FLAGGED, ADVICE_ROUTINE, aiDraftFor } from "../advice";
import {
  currentReleased, draftVersion, episodeFlags, episodeHeldByRow, expectedTests, latestObservations, releaseChecklist, reuploadPreview, routineEligibility, versionsOf,
} from "../selectors/clinical";
import { Ctx, pad } from "./ctx";
import type { Handler } from "./ctx";

const handlers: Record<string, Handler> = {};

const MG_DL_TO_MMOL: Partial<Record<string, number>> = { TC: 0.02586, HDL: 0.02586, LDL: 0.02586 };

function epOf(c: Ctx, id: string): Episode | undefined { return c.ix().episodeById.get(id); }

/* ---- laboratory imports ---- */
handlers["import/loadSample"] = (c, a: { batchId: string }) => {
  const d = c.need("imports.view", "open laboratory imports"); if (d) return d;
  const batch = c.s.batches.find((b) => b.id === a.batchId);
  if (!batch) return c.fail("Unknown batch.");
  const p = reuploadPreview(c.s, a.batchId);
  c.s.importPreview = { filename: batch.filename, batchId: a.batchId, loadedAt: c.now, alreadySeen: p.alreadySeen, unresolved: p.unresolved, newRows: p.newRows, committed: false };
  return c.ok(`Sample CSV loaded as a preview: ${p.alreadySeen} rows already seen, ${p.unresolved} still unresolved, ${p.newRows} new.`, "info");
};

handlers["import/commitPreview"] = (c) => {
  const d = c.need("imports.view", "commit an import"); if (d) return d;
  const pv = c.s.importPreview;
  if (!pv) return c.fail("Load the sample CSV first.");
  if (pv.committed) return c.fail("This preview was already processed. Nothing was imported twice.");
  const p = reuploadPreview(c.s, pv.batchId);
  pv.alreadySeen = p.alreadySeen; pv.unresolved = p.unresolved; pv.newRows = p.newRows; pv.committed = true;
  const text = `Re-upload of ${pv.filename} processed: ${p.newRows} new observations, ${p.alreadySeen} rows already seen, ${p.unresolved} still unresolved. Duplicate prevention held.`;
  const last = [...c.s.activity].reverse().find((e) => e.verb === "import.rerun");
  if (!last || last.summary !== text) {
    c.emit({ verb: "import.rerun", summary: text, entity: { kind: "batch", id: pv.batchId }, storyId: "ST-01", integrationId: "eurofins", simulated: true });
  }
  return c.ok(`No new observations. ${p.alreadySeen} rows already seen and ${p.unresolved} still unresolved. Duplicates were prevented.`, "ok");
};

handlers["import/resolveRow"] = (c, a: { rowId: string; episodeId: string; checks: string[]; reason: string }) => {
  const d = c.need("identity.resolve", "resolve identity exceptions"); if (d) return d;
  const row = c.s.importRows.find((r) => r.id === a.rowId);
  if (!row || row.state !== "quarantined") return c.fail("This row is not held for review. It was already resolved.");
  if (!a.checks || !a.checks.includes("specimen") || !a.checks.includes("dob")) return c.fail("Confirm two identifiers: the specimen identifier and the date of birth from the collection record.");
  if (!(a.reason || "").trim() || a.reason.trim().length < 8) return c.fail("Record a reason for the resolution, at least a short sentence.");
  const held = episodeHeldByRow(c.s, row.id);
  if (!held) return c.fail("No held episode is linked to this row.");
  if (a.episodeId !== held.id) return c.fail("The selected episode does not match the collection record. Verify the identifiers again.");
  const code = row.analyteCode;
  const value = Number(row.valueText);
  if (!Number.isFinite(value)) return c.fail("The row value is not numeric.");
  const n = c.nextNo("observation");
  const obs: Observation = {
    id: `OBS-${pad(n, 5)}`, episodeId: held.id, specimenId: held.specimenIds[0], code, value, unit: row.unit, limitText: ANALYTES[code].limit.text, flag: flagFor(code, value),
    legacyDisplayedFlag: null, source: { kind: "batch", batchId: row.batchId, rowId: row.id }, recordedAt: c.stamp(), unitDiscrepancy: null, original: null, version: 1,
  };
  c.s.observations.push(obs);
  row.state = "resolved";
  row.episodeId = held.id;
  row.observationId = obs.id;
  row.resolution = { by: c.persona().id as never, at: c.stamp(), chosenEpisodeId: held.id, checks: a.checks.slice(), reason: a.reason.trim() };
  held.hold = null;
  c.inv();
  c.settleEpisode(held);
  const spec = c.s.specimens.find((x) => x.id === held.specimenIds[0]);
  if (spec && held.reportState === "ready_for_review") spec.status = "resulted";
  const dq = c.s.dqIssues.find((x) => x.kind === "identifier" && row.specimenKey === "PH-S-O202" && x.status === "open");
  if (dq) dq.status = "resolved";
  const person = c.personName(held.personId);
  c.emit({
    verb: "import.resolved", summary: `${c.first()} resolved the identity exception for row ${row.id} (${held.id}, ${person}) with a documented two-identifier check. Row committed once.`,
    entity: { kind: "row", id: row.id }, programmeId: held.programmeId, personId: held.personId, storyId: "ST-01", integrationId: "eurofins", simulated: true,
  });
  return c.ok(`Row committed once. ${held.id} is now ${held.reportState === "ready_for_review" ? "ready for review" : "awaiting its remaining results"}.`, "ok", held.id);
};

handlers["import/confirmUnit"] = (c, a: { episodeId: string; reason: string }) => {
  const d = c.need("clinical.review", "confirm a source unit"); if (d) return d;
  const ep = epOf(c, a.episodeId);
  if (!ep || ep.hold?.kind !== "source_unit_discrepancy") return c.fail("No source unit discrepancy is open on this episode.");
  if (!(a.reason || "").trim() || a.reason.trim().length < 8) return c.fail("Record the laboratory confirmation, at least a short sentence.");
  const obs = latestObservations(c.s, ep.id).find((o) => o.unitDiscrepancy && !o.unitDiscrepancy.confirmed);
  if (!obs || obs.unitDiscrepancy!.sourceUnit !== "mg/dL") return c.fail("Only mg/dL cholesterol confirmations are supported in this demo.");
  const factor = MG_DL_TO_MMOL[obs.code];
  if (!factor) return c.fail("No documented conversion for this analyte in the demo.");
  const original = { value: obs.value, unit: obs.unit };
  const converted = Math.round(obs.value * factor * 10) / 10;
  const next: Observation = { ...obs, id: `OBS-${pad(c.nextNo("observation"), 5)}`, value: converted, unit: ANALYTES[obs.code].unit, flag: flagFor(obs.code, converted), unitDiscrepancy: { ...obs.unitDiscrepancy!, confirmed: true }, original, version: obs.version + 1, recordedAt: c.stamp() };
  c.s.observations.push(next);
  ep.hold = null;
  c.inv();
  c.settleEpisode(ep);
  const issue = c.s.dqIssues.find((x) => x.episodeId === ep.id && x.kind === "source_unit");
  if (issue) issue.status = "resolved";
  c.emit({ verb: "unit.confirmed", summary: `${c.first()} recorded laboratory confirmation of the source unit for ${ep.id}. The received value is kept and the documented conversion is shown.`, entity: { kind: "episode", id: ep.id }, programmeId: ep.programmeId, restricted: true, publicSummary: "Data quality hold cleared on a clinical episode" });
  return c.ok(`Unit confirmed and the original value kept. ${ep.id} is now ${ep.reportState === "ready_for_review" ? "ready for review" : "awaiting results"}.`, "ok", ep.id);
};

/* ---- review and release ---- */
function ensureDraft(c: Ctx, ep: Episode, correctionReason: string | null = null): ReportVersion {
  const existing = draftVersion(c.s, ep.id);
  if (existing) return existing;
  const versions = versionsOf(c.s, ep.id);
  const version = (versions.length ? versions[versions.length - 1].version : 0) + 1;
  const id = `${ep.id}-v${version}`;
  const cur = currentReleased(c.s, ep.id);
  const draft: ReportVersion = {
    id, episodeId: ep.id, version, status: "in_review", createdAt: c.stamp(), createdBy: c.persona().id as never, advice: cur ? cur.advice : "", adviceSource: "manual", releasedAt: null, releasedBy: null,
    releaseMode: null, checklist: {}, flagAcknowledged: false, correctionReason, supersedes: cur ? cur.id : null, supersededBy: null, observationRefs: [], participantNoticeAt: null, accessedAt: null,
  };
  c.s.reportVersions.push(draft);
  ep.reportVersionIds.push(id);
  c.inv();
  return draft;
}

function releasable(c: Ctx, ep: Episode, correction: boolean): string | null {
  if (!correction && ep.reportState !== "ready_for_review") return ep.reportState === "released" ? "This report is already released." : "This episode is not ready for review.";
  const open = releaseChecklist(c.s, ep).filter((x) => !x.done);
  const draft = draftVersion(c.s, ep.id);
  if (correction && draft && !draft.checklist.rereview) open.push({ key: "rereview", label: "Re-review of the corrected report", done: false, manual: true });
  if (open.length) return `Release checklist incomplete: ${open.map((x) => x.label).join("; ")}.`;
  return null;
}

function doRelease(c: Ctx, ep: Episode, draft: ReportVersion, mode: "routine" | "individual"): void {
  const prev = draft.supersedes ? c.s.reportVersions.find((v) => v.id === draft.supersedes) : null;
  draft.status = "released";
  draft.releasedAt = c.stamp();
  draft.releasedBy = c.persona().id as never;
  draft.releaseMode = mode;
  draft.observationRefs = latestObservations(c.s, ep.id).map((o) => ({ id: o.id, version: o.version }));
  if (prev) { prev.status = "superseded"; prev.supersededBy = draft.id; draft.participantNoticeAt = draft.releasedAt; }
  ep.reportState = "released";
  if (episodeFlags(c.s, ep).length) ep.flagAckBy = c.persona().id as never;
  delete c.s.aiDrafts[ep.id];
  const person = c.ix().personById.get(ep.personId)!;
  const mem = (c.ix().membershipsByPerson.get(person.id) || [])[0];
  const channel = mem?.contactPreference || "email";
  const n = c.nextNo("message");
  c.s.messages.push({
    id: `MSG-${pad(n, 5)}`, logicalId: `LM-A-${draft.id}`, kind: "report_available", personId: person.id, bookingId: null, episodeId: ep.id, channel,
    destination: channel === "sms" ? person.phone : person.email.replace(/^(.)[^@]*/, "$1***"),
    subject: prev ? "An updated version of your report is available" : "Your Precision Health report is ready to view", status: "delivered",
    attempts: [{ at: draft.releasedAt, outcome: "delivered", reason: null, auto: false }], cohort: null, at: draft.releasedAt, provider: channel === "sms" ? "Esendex" : "Email", simulated: true,
  });
  c.inv();
  c.emit({ verb: "report.released", summary: `${c.first()} released report ${ep.id} v${draft.version}${prev ? " (correction). v" + prev.version + " superseded" : ""}.`, entity: { kind: "report", id: draft.id }, programmeId: ep.programmeId, personId: ep.personId, storyId: prev ? null : "ST-02" });
  c.emit({ verb: "notice.queued", summary: `Report availability notice for ${ep.id} v${draft.version} sent by ${channel === "sms" ? "SMS" : "email"} (simulated). The message contains no results.`, entity: { kind: "message", id: `MSG-${pad(n, 5)}` }, programmeId: ep.programmeId, personId: ep.personId, integrationId: channel === "sms" ? "esendex" : "email", simulated: true });
}

handlers["review/setAdvice"] = (c, a: { episodeId: string; text: string }) => {
  const d = c.need("clinical.review", "edit report advice"); if (d) return d;
  const ep = epOf(c, a.episodeId);
  if (!ep || ep.reportState === "awaiting_results" || ep.reportState === "on_hold") return c.fail("Advice can be written once the episode is ready for review.");
  const draft = ep.reportState === "released" ? draftVersion(c.s, ep.id) : ensureDraft(c, ep);
  if (!draft) return c.fail("Start a correction first.");
  draft.advice = a.text;
  draft.adviceSource = "manual";
  if (!a.text.trim()) draft.checklist.advice = false;
  return c.ok();
};

handlers["review/toggleCheck"] = (c, a: { episodeId: string; key: "advice" | "preview" | "rereview" }) => {
  const d = c.need("clinical.review", "complete the release checklist"); if (d) return d;
  const ep = epOf(c, a.episodeId);
  if (!ep) return c.fail("Unknown episode.");
  const draft = ep.reportState === "released" ? draftVersion(c.s, ep.id) : ensureDraft(c, ep);
  if (!draft) return c.fail("No draft to review.");
  if (a.key === "advice" && !draft.advice.trim()) return c.fail("Write or accept advice before marking it reviewed.");
  draft.checklist[a.key] = !draft.checklist[a.key];
  return c.ok();
};

handlers["review/ackFlags"] = (c, a: { episodeId: string }) => {
  const d = c.need("clinical.review", "acknowledge review flags"); if (d) return d;
  const ep = epOf(c, a.episodeId);
  if (!ep) return c.fail("Unknown episode.");
  if (!episodeFlags(c.s, ep).length) return c.fail("There are no review flags to acknowledge.");
  const draft = ep.reportState === "released" ? draftVersion(c.s, ep.id) : ensureDraft(c, ep);
  if (!draft) return c.fail("No draft to review.");
  draft.flagAcknowledged = true;
  return c.ok("Review flags acknowledged. Release still needs the rest of the checklist.", "info");
};

handlers["review/aiDraft"] = (c, a: { episodeId: string }) => {
  const d = c.need("clinical.review", "request a drafting preview"); if (d) return d;
  if (!c.s.settings.aiDraftingOn) return c.fail("AI drafting preview is off. Write advice manually. The manual workflow is unaffected.");
  const ep = epOf(c, a.episodeId);
  if (!ep) return c.fail("Unknown episode.");
  const flags = episodeFlags(c.s, ep).map((f) => (f.code ? ANALYTES[f.code].name : "blood pressure"));
  const pending = expectedTests(c.s, ep).filter((t) => t.status !== "received").map((t) => t.name);
  c.s.aiDrafts[ep.id] = { text: aiDraftFor(flags, pending), at: c.stamp() };
  c.emit({ verb: "agent.drafted", actor: { kind: "agent", id: "drafting", label: "Clinical Drafting" }, summary: `Clinical Drafting prepared an advice draft preview for ${ep.id}. Draft only, for the clinician to edit and approve. No model connected.`, entity: { kind: "episode", id: ep.id }, programmeId: ep.programmeId, restricted: true, publicSummary: "Drafting preview prepared on a clinical episode", simulated: true });
  return c.ok("Drafting preview ready. Edit it, then approve it as your own advice.", "info");
};

handlers["review/acceptAiDraft"] = (c, a: { episodeId: string }) => {
  const d = c.need("clinical.review", "accept a drafting preview"); if (d) return d;
  const draftText = c.s.aiDrafts[a.episodeId];
  const ep = epOf(c, a.episodeId);
  if (!draftText || !ep) return c.fail("No drafting preview for this episode.");
  const draft = ep.reportState === "released" ? draftVersion(c.s, ep.id) : ensureDraft(c, ep);
  if (!draft) return c.fail("No draft to review.");
  draft.advice = draftText.text;
  draft.adviceSource = "ai_draft_approved";
  draft.checklist.advice = false;
  return c.ok("Draft copied into the advice box. Review it, then tick the advice reviewed item.", "info");
};

handlers["review/release"] = (c, a: { episodeId: string }) => {
  const d = c.need("clinical.review", "release a report"); if (d) return d;
  const ep = epOf(c, a.episodeId);
  if (!ep) return c.fail("Unknown episode.");
  const why = releasable(c, ep, false);
  if (why) return c.fail(why);
  const draft = ensureDraft(c, ep);
  doRelease(c, ep, draft, episodeFlags(c.s, ep).length ? "individual" : "routine");
  return c.ok(`Report ${ep.id} v${draft.version} released. The participant can now see it in the portal.`, "ok", draft.id);
};

/** One click per episode, and only when nothing needs individual review. Never bulk. */
handlers["review/releaseRoutine"] = (c, a: { episodeId: string }) => {
  const d = c.need("clinical.review", "release a report"); if (d) return d;
  const ep = epOf(c, a.episodeId);
  if (!ep) return c.fail("Unknown episode.");
  const el = routineEligibility(c.s, ep);
  if (!el.ok) return c.fail(`The routine shortcut is not available. ${el.reasons.join(" ")}`);
  const draft = ensureDraft(c, ep);
  if (!draft.advice.trim()) draft.advice = ADVICE_ROUTINE[Number(ep.id.slice(-1)) % ADVICE_ROUTINE.length];
  draft.checklist = { advice: true, preview: true };
  doRelease(c, ep, draft, "routine");
  return c.ok(`Report ${ep.id} v${draft.version} released as a routine report.`, "ok", draft.id);
};

/* ---- corrections ---- */
handlers["correction/start"] = (c, a: { episodeId: string; reason: string }) => {
  const d = c.need("clinical.review", "start a correction"); if (d) return d;
  const ep = epOf(c, a.episodeId);
  if (!ep || ep.reportState !== "released") return c.fail("Only a released report can be corrected.");
  if (draftVersion(c.s, ep.id)) return c.fail("A correction is already in progress for this episode.");
  if (!(a.reason || "").trim() || a.reason.trim().length < 8) return c.fail("Record the reason for the correction.");
  const draft = ensureDraft(c, ep, a.reason.trim());
  draft.observationRefs = latestObservations(c.s, ep.id).map((o) => ({ id: o.id, version: o.version }));
  c.emit({ verb: "correction.started", summary: `${c.first()} started a correction on ${ep.id}: draft v${draft.version}. Released v${draft.version - 1} stays unchanged until v${draft.version} is re-reviewed and released.`, entity: { kind: "report", id: draft.id }, programmeId: ep.programmeId, personId: ep.personId });
  return c.ok(`Draft v${draft.version} created. Re-review it and release it to supersede v${draft.version - 1}.`, "ok", draft.id);
};

handlers["correction/release"] = (c, a: { episodeId: string }) => {
  const d = c.need("clinical.review", "release a corrected report"); if (d) return d;
  const ep = epOf(c, a.episodeId);
  if (!ep || ep.reportState !== "released") return c.fail("Unknown released episode.");
  const draft = draftVersion(c.s, ep.id);
  if (!draft || !draft.correctionReason) return c.fail("No correction draft is open.");
  const why = releasable(c, ep, true);
  if (why) return c.fail(why);
  if (!draft.advice.trim()) return c.fail("Release needs advice text.");
  doRelease(c, ep, draft, "individual");
  return c.ok(`v${draft.version} released. v${draft.version - 1} is superseded and kept in the history.`, "ok", draft.id);
};

/* ---- follow-up ---- */
handlers["followup/attempt"] = (c, a: { followUpId: string; channel: "phone" | "sms" | "email"; result: "no_answer" | "voicemail" | "spoke" | "wrong_number"; note: string }) => {
  const d = c.need("followup.act", "record contact attempts"); if (d) return d;
  const f = c.s.followUps.find((x) => x.id === a.followUpId);
  if (!f || f.status !== "open") return c.fail("This follow-up is not open.");
  f.attempts.push({ at: c.stamp(), by: c.persona().id as never, channel: a.channel, result: a.result, note: (a.note || "").trim() });
  c.emit({ verb: "followup.attempt", summary: `${c.first()} recorded contact attempt ${f.attempts.length} on ${f.id} (${a.channel}, ${a.result.replace("_", " ")}). The item stays open.`, entity: { kind: "followup", id: f.id }, programmeId: f.programmeId, personId: f.personId, storyId: f.id === "FU-0001" ? "ST-04" : null, restricted: true, publicSummary: "Clinical action in progress" });
  return c.ok("Contact attempt recorded. The follow-up stays open until an outcome is documented.", "info");
};

handlers["followup/escalate"] = (c, a: { followUpId: string; note: string }) => {
  const d = c.need("followup.act", "escalate a follow-up"); if (d) return d;
  const f = c.s.followUps.find((x) => x.id === a.followUpId);
  if (!f || f.status !== "open") return c.fail("This follow-up is not open.");
  if (!(a.note || "").trim()) return c.fail("Add an escalation note.");
  f.escalations.push({ at: c.stamp(), by: c.persona().id as never, note: a.note.trim() });
  c.emit({ verb: "followup.escalated", summary: `${c.first()} escalated ${f.id} (illustrative workflow, not a validated escalation protocol).`, entity: { kind: "followup", id: f.id }, programmeId: f.programmeId, personId: f.personId, storyId: f.id === "FU-0001" ? "ST-04" : null, restricted: true, publicSummary: "Clinical action escalated" });
  return c.ok("Escalation recorded.", "info");
};

handlers["followup/close"] = (c, a: { followUpId: string; outcomeCode: string; note: string; acknowledge: boolean }) => {
  const d = c.need("followup.act", "close a follow-up"); if (d) return d;
  const f = c.s.followUps.find((x) => x.id === a.followUpId);
  if (!f || f.status !== "open") return c.fail("This follow-up is not open.");
  if (!FOLLOW_UP_OUTCOMES.some((o) => o.code === a.outcomeCode)) return c.fail("Choose a documented outcome. A delivered message or a viewed report cannot close a follow-up.");
  if (!f.attempts.length) return c.fail("Record at least one contact attempt before closing.");
  if (!(a.note || "").trim() || a.note.trim().length < 5) return c.fail("Add a short note describing the outcome.");
  if (!a.acknowledge) return c.fail("An authorised acknowledgement is required to close this follow-up.");
  const me = c.persona().id as never;
  f.status = "closed";
  f.outcome = { code: a.outcomeCode, note: a.note.trim(), at: c.stamp(), by: me, acknowledgedBy: me };
  const ep = epOf(c, f.episodeId);
  if (ep && ep.hold?.kind === "urgent_follow_up" && ep.hold.followUpId === f.id) { ep.hold = null; c.inv(); c.settleEpisode(ep); }
  c.emit({ verb: "followup.closed", summary: `${c.first()} closed ${f.id} with a documented outcome and acknowledgement.`, entity: { kind: "followup", id: f.id }, programmeId: f.programmeId, personId: f.personId, storyId: f.id === "FU-0001" ? "ST-04" : null, restricted: true, publicSummary: "Clinical action complete" });
  return c.ok(`${f.id} closed with a documented outcome.${ep && ep.reportState === "ready_for_review" ? " The episode is now ready for review." : ""}`, "ok");
};

/* ---- reminders ---- */
handlers["reminder/retry"] = (c, a: { messageId: string }) => {
  const d = c.need("bookings.manage", "retry reminders"); if (d) return d;
  const m = c.s.messages.find((x) => x.id === a.messageId);
  if (!m || m.kind !== "reminder") return c.fail("Unknown reminder.");
  if (m.status !== "failed") return c.fail("This reminder is not failed. A retry was already made.");
  m.attempts.push({ at: c.stamp(), outcome: "delivered", reason: null, auto: false });
  m.status = "delivered";
  c.emit({ verb: "reminder.retried", summary: `${c.first()} retried reminder ${m.logicalId} to the verified ${m.channel === "sms" ? "mobile" : "email"} destination. Delivered (simulated). Logical reminders stay at ${c.s.messages.filter((x) => x.kind === "reminder" && x.cohort === m.cohort).length}.`, entity: { kind: "message", id: m.id }, personId: m.personId, storyId: "ST-05", integrationId: m.provider === "Esendex" ? "esendex" : "email", simulated: true });
  return c.ok("Retry delivered (simulated). One logical reminder moved from failed to delivered and the attempt was added to its history.", "ok");
};

/* ---- data quality ---- */
handlers["dq/acknowledge"] = (c, a: { id: string }) => {
  const i = c.s.dqIssues.find((x) => x.id === a.id);
  if (!i || i.status !== "open") return c.fail("Already acknowledged.");
  i.status = "acknowledged";
  return c.ok("Acknowledged. A human still has to resolve it.", "info");
};

export const resultsHandlers = handlers;
export { HOLD_CATEGORY, ADVICE_FLAGGED };
export type { ImportRow };
