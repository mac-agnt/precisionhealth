/* Results handlers: laboratory imports, clinician review and release, corrections,
   follow-up and reminder retry. Every action is idempotent: a repeated click returns a
   failure and changes nothing, so no logical record is created twice. */
import type { AnalyteCode, Episode, ImportRow, Observation, ReportVersion, StaffId } from "../types";
import { ANALYTES, FOLLOW_UP_OUTCOMES, HOLD_CATEGORY, flagFor } from "../constants";
import { ADVICE_FLAGGED, ADVICE_ROUTINE, aiDraftFor } from "../advice";
import { makeRng } from "../rng";
import type { Rng } from "../rng";
import { localDateOf } from "../time";
import {
  currentReleased, draftVersion, episodeFlags, episodeHeldByRow, expectedTests, hasUnitDiscrepancy, latestObservations, releaseChecklist, reuploadPreview, routineEligibility, versionsOf,
} from "../selectors/clinical";
import { staffName } from "../selectors/core";
import { Ctx, pad } from "./ctx";
import type { Handler } from "./ctx";

const handlers: Record<string, Handler> = {};

const MG_DL_TO_MMOL: Partial<Record<string, number>> = { TC: 0.02586, HDL: 0.02586, LDL: 0.02586 };
const WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];

function epOf(c: Ctx, id: string): Episode | undefined { return c.ix().episodeById.get(id); }
/** A reason as one sentence ending in a full stop. */
const sentence = (s: string) => s.trim().replace(/[.\s]+$/, "") + ".";

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

/** Keep a batch's status and note in step with its rows once a held row is resolved. */
function refreshBatchNote(c: Ctx, batchId: string): void {
  const batch = c.s.batches.find((b) => b.id === batchId);
  if (!batch) return;
  const left = c.s.importRows.filter((r) => r.batchId === batchId && r.state === "quarantined").length;
  const head = batch.note.replace(/\s*(\w+ rows? needs? explicit identity resolution\.|Every held row was resolved[^.]*\.)$/, "");
  batch.status = left ? "partial" : "complete";
  batch.note = `${head} ${left ? `${WORDS[left] || left} ${left === 1 ? "row needs" : "rows need"} explicit identity resolution.` : "Every held row was resolved by a person with a documented two-identifier check."}`.trim();
}

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
  row.resolution = { by: c.persona().id as StaffId, at: c.stamp(), chosenEpisodeId: held.id, checks: a.checks.slice(), reason: a.reason.trim() };
  held.hold = null;
  c.inv();
  c.settleEpisode(held);
  const spec = c.s.specimens.find((x) => x.id === held.specimenIds[0]);
  if (spec && held.reportState === "ready_for_review") spec.status = "resulted";
  // A Data Quality item about this row's identifier is resolved with it.
  c.s.dqIssues.filter((x) => x.kind === "identifier" && x.status !== "resolved" && x.detail.includes(row.specimenKey)).forEach((x) => { x.status = "resolved"; });
  refreshBatchNote(c, row.batchId);
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
  const reason = a.reason.trim();
  const at = c.stamp();
  const original = { value: obs.value, unit: obs.unit };
  const converted = Math.round(obs.value * factor * 10) / 10;
  // The new version carries the confirmation reason. The received value stays on the earlier version and in original.
  const next: Observation = {
    ...obs, id: `OBS-${pad(c.nextNo("observation"), 5)}`, value: converted, unit: ANALYTES[obs.code].unit, flag: flagFor(obs.code, converted), unitDiscrepancy: { ...obs.unitDiscrepancy!, confirmed: true }, original, version: obs.version + 1, recordedAt: at,
    correction: { kind: "unit_confirmation", reason, by: c.persona().id as StaffId, at, previous: { id: obs.id, value: obs.value, unit: obs.unit, version: obs.version } },
  };
  c.s.observations.push(next);
  ep.hold = null;
  c.inv();
  c.settleEpisode(ep);
  const issue = c.s.dqIssues.find((x) => x.episodeId === ep.id && x.kind === "source_unit");
  if (issue) issue.status = "resolved";
  c.emit({ verb: "unit.confirmed", summary: `${c.first()} recorded laboratory confirmation of the source unit for ${ep.id}. Reason: ${sentence(reason)} The received value is kept and the documented conversion is shown.`, entity: { kind: "episode", id: ep.id }, programmeId: ep.programmeId, personId: ep.personId, restricted: true, publicSummary: "Data quality hold cleared on a clinical episode" });
  return c.ok(`Unit confirmed and the original value kept. ${ep.id} is now ${ep.reportState === "ready_for_review" ? "ready for review" : "awaiting results"}.`, "ok", ep.id);
};

/** Normal illustrative values for simulated sample results, deterministic per episode. Sample data, not a clinical reference. */
function sampleValue(code: AnalyteCode, r: Rng): number {
  const one = (x: number) => Math.round(x * 10) / 10;
  switch (code) {
    case "TC": return one(4.0 + r.next() * 0.8);
    case "HDL": return one(1.3 + r.next() * 0.5);
    case "LDL": return one(1.9 + r.next() * 0.8);
    case "TG": return one(0.8 + r.next() * 0.6);
    case "HBA1C": return Math.round(32 + r.next() * 6);
    case "VITD": return Math.round(60 + r.next() * 25);
    case "FERR": return Math.round(60 + r.next() * 80);
  }
}

/**
 * Simulate the laboratory returning results for an episode that is awaiting them, for example one
 * completed at a clinic in this session. A new Eurofins sample batch is recorded with one row per
 * pending expected test, each committed once as an observation with its source row. The episode
 * then moves to ready for review. Nothing is released: release stays a clinician action.
 */
handlers["import/deliverSampleResults"] = (c, a: { episodeId: string }) => {
  const d = c.need("imports.view", "load simulated laboratory results"); if (d) return d;
  const ep = epOf(c, a.episodeId);
  if (!ep) return c.fail("Unknown episode.");
  if (ep.reportState !== "awaiting_results") return c.fail(`${ep.id} is not awaiting results. ${ep.reportState === "on_hold" ? "It is on hold: resolve the hold first." : "Its results are already accounted for."}`);
  const pending = expectedTests(c.s, ep).filter((t) => t.status === "pending");
  if (!pending.length) return c.fail(hasUnitDiscrepancy(c.s, ep) ? "The remaining step is a source unit confirmation, not new results." : "Results for this episode are already accounted for.");
  const person = c.ix().personById.get(ep.personId)!;
  const date = localDateOf(c.now);
  const prefix = `BATCH-${date.replace(/-/g, "")}-`;
  const seq = c.s.batches.filter((b) => b.id.startsWith(prefix)).length + 1;
  const batchId = `${prefix}${pad(seq, 2)}`;
  const filename = seq === 1 ? `eurofins_results_${date}_demo.csv` : `eurofins_results_${date}_${pad(seq, 2)}_demo.csv`;
  const at = c.stamp();
  const r = makeRng("ph-sample-results-" + ep.id);
  pending.forEach((t, i) => {
    const value = sampleValue(t.code, r);
    const rowId = `${batchId}-R${pad(i + 1, 3)}`;
    const obsId = `OBS-${pad(c.nextNo("observation"), 5)}`;
    const row: ImportRow = {
      id: rowId, batchId, line: i + 2, specimenKey: ep.specimenIds[0], analyteCode: t.code, valueText: value.toFixed(ANALYTES[t.code].decimals), unit: ANALYTES[t.code].unit, resultAt: at,
      dobInFile: person.dob, nameInFile: `${person.family}, ${person.given[0]}`, state: "imported", episodeId: ep.id, observationId: obsId, quarantine: null, duplicateOfObservationId: null, resolution: null,
    };
    c.s.importRows.push(row);
    c.s.observations.push({
      id: obsId, episodeId: ep.id, specimenId: ep.specimenIds[0], code: t.code, value, unit: ANALYTES[t.code].unit, limitText: ANALYTES[t.code].limit.text, flag: flagFor(t.code, value),
      legacyDisplayedFlag: null, source: { kind: "batch", batchId, rowId }, recordedAt: at, unitDiscrepancy: null, original: null, version: 1,
    });
  });
  c.s.batches.push({
    id: batchId, lab: "Eurofins", filename, receivedAt: at, processedAt: at, specimenCount: 1, source: "Eurofins Dublin CSV (FTP), held in Google Workspace. Simulated.", status: "complete",
    note: `Simulated sample results for ${ep.id}, loaded in this session. Sample values for demonstration only.`,
  });
  c.inv();
  c.settleEpisode(ep);
  c.inv();
  // settleEpisode moves the episode on, so read its state again rather than the narrowed one above.
  const ready = (ep.reportState as Episode["reportState"]) === "ready_for_review";
  const allIn = expectedTests(c.s, ep).every((t) => t.status === "received");
  c.s.specimens.filter((x) => x.episodeId === ep.id).forEach((x) => { x.status = allIn ? "resulted" : "received"; });
  c.emit({
    verb: "import.processed", actor: { kind: "system", id: "system", label: "Eurofins import (simulated)" },
    summary: `Simulated Eurofins batch ${batchId} processed for ${ep.id}: ${pending.length} observation rows imported, loaded by ${c.first()}. ${ready ? "The episode is ready for clinician review. Nothing was released." : "Some expected results are still outstanding."}`,
    entity: { kind: "batch", id: batchId }, programmeId: ep.programmeId, personId: ep.personId, integrationId: "eurofins", simulated: true,
  });
  return c.ok(`${pending.length} sample results received in ${batchId}. ${ep.id} is now ${ready ? "ready for review" : "awaiting its remaining results"}. Release stays a clinician action.`, "ok", batchId);
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
    id, episodeId: ep.id, version, status: "in_review", createdAt: c.stamp(), createdBy: c.persona().id as StaffId, advice: cur ? cur.advice : "", adviceSource: "manual", releasedAt: null, releasedBy: null,
    releaseMode: null, checklist: {}, flagAcknowledged: false, correctionReason, supersedes: cur ? cur.id : null, supersededBy: null, observationRefs: [], participantNoticeAt: null, accessedAt: null,
  };
  c.s.reportVersions.push(draft);
  ep.reportVersionIds.push(id);
  c.inv();
  return draft;
}

/**
 * Review work (advice, checklist ticks, flag acknowledgement, drafting previews) happens only on an
 * episode that is ready for review, or on a released episode with a correction in review.
 */
function notReviewable(c: Ctx, ep: Episode | undefined): string | null {
  if (!ep) return "Unknown episode.";
  if (ep.reportState === "ready_for_review") return null;
  if (ep.reportState === "released") return draftVersion(c.s, ep.id) ? null : "This report is released. Start a correction first.";
  return ep.reportState === "on_hold" ? "This episode is on hold. Review starts once the hold is resolved." : "This episode is awaiting results. Review starts once every expected result is accounted for.";
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
  draft.releasedBy = c.persona().id as StaffId;
  draft.releaseMode = mode;
  draft.observationRefs = latestObservations(c.s, ep.id).map((o) => ({ id: o.id, version: o.version }));
  if (prev) { prev.status = "superseded"; prev.supersededBy = draft.id; draft.participantNoticeAt = draft.releasedAt; }
  ep.reportState = "released";
  if (episodeFlags(c.s, ep).length) ep.flagAckBy = c.persona().id as StaffId;
  delete c.s.aiDrafts[ep.id];
  // Data Quality items on this episode were reviewed as part of the release.
  c.s.dqIssues.filter((x) => x.episodeId === ep.id && x.status !== "resolved").forEach((x) => { x.status = "resolved"; });
  const { channel, destination, provider } = c.contactFor(ep.personId, ep.programmeId);
  const n = c.nextNo("message");
  c.s.messages.push({
    id: `MSG-${pad(n, 5)}`, logicalId: `LM-A-${draft.id}`, kind: "report_available", personId: ep.personId, bookingId: null, episodeId: ep.id, channel, destination,
    subject: prev ? "An updated version of your report is available" : "Your Precision Health report is ready to view", status: "delivered",
    attempts: [{ at: draft.releasedAt, outcome: "delivered", reason: null, auto: false }], cohort: null, at: draft.releasedAt, provider, simulated: true,
  });
  c.inv();
  c.emit({ verb: "report.released", summary: `${c.first()} released report ${ep.id} v${draft.version}${prev ? " (correction). v" + prev.version + " superseded" : ""}.`, entity: { kind: "report", id: draft.id }, programmeId: ep.programmeId, personId: ep.personId, storyId: prev ? null : "ST-02" });
  c.emit({ verb: "notice.queued", summary: `Report availability notice for ${ep.id} v${draft.version} sent by ${channel === "sms" ? "SMS" : "email"} (simulated). The message contains no results.`, entity: { kind: "message", id: `MSG-${pad(n, 5)}` }, programmeId: ep.programmeId, personId: ep.personId, integrationId: channel === "sms" ? "esendex" : "email", simulated: true });
}

handlers["review/setAdvice"] = (c, a: { episodeId: string; text: string }) => {
  const d = c.need("clinical.review", "edit report advice"); if (d) return d;
  const ep = epOf(c, a.episodeId);
  const why = notReviewable(c, ep); if (why) return c.fail(why);
  const draft = ep!.reportState === "released" ? draftVersion(c.s, ep!.id) : ensureDraft(c, ep!);
  if (!draft) return c.fail("Start a correction first.");
  if (draft.advice === a.text) return c.ok();
  draft.advice = a.text;
  draft.adviceSource = "manual";
  // Changed advice is reviewed and previewed again before release.
  draft.checklist.advice = false;
  draft.checklist.preview = false;
  return c.ok();
};

handlers["review/toggleCheck"] = (c, a: { episodeId: string; key: "advice" | "preview" | "rereview" }) => {
  const d = c.need("clinical.review", "complete the release checklist"); if (d) return d;
  const ep = epOf(c, a.episodeId);
  const why = notReviewable(c, ep); if (why) return c.fail(why);
  const draft = ep!.reportState === "released" ? draftVersion(c.s, ep!.id) : ensureDraft(c, ep!);
  if (!draft) return c.fail("No draft to review.");
  if (a.key === "advice" && !draft.advice.trim()) return c.fail("Write or accept advice before marking it reviewed.");
  draft.checklist[a.key] = !draft.checklist[a.key];
  return c.ok();
};

handlers["review/ackFlags"] = (c, a: { episodeId: string }) => {
  const d = c.need("clinical.review", "acknowledge review flags"); if (d) return d;
  const ep = epOf(c, a.episodeId);
  const why = notReviewable(c, ep); if (why) return c.fail(why);
  if (!episodeFlags(c.s, ep!).length) return c.fail("There are no review flags to acknowledge.");
  const draft = ep!.reportState === "released" ? draftVersion(c.s, ep!.id) : ensureDraft(c, ep!);
  if (!draft) return c.fail("No draft to review.");
  draft.flagAcknowledged = true;
  // A displayed-flag inconsistency raised by Data Quality is settled by this clinician review.
  c.s.dqIssues.filter((x) => x.episodeId === ep!.id && x.kind === "flag_inconsistency" && x.status !== "resolved").forEach((x) => { x.status = "resolved"; });
  return c.ok("Review flags acknowledged. Release still needs the rest of the checklist.", "info");
};

handlers["review/aiDraft"] = (c, a: { episodeId: string }) => {
  const d = c.need("clinical.review", "request a drafting preview"); if (d) return d;
  if (!c.s.settings.aiDraftingOn) return c.fail("AI drafting preview is off. Write advice manually. The manual workflow is unaffected.");
  const ep = epOf(c, a.episodeId);
  const why = notReviewable(c, ep); if (why) return c.fail(why);
  const flags = episodeFlags(c.s, ep!).map((f) => (f.code ? ANALYTES[f.code].name : "blood pressure"));
  const pending = expectedTests(c.s, ep!).filter((t) => t.status !== "received").map((t) => t.name);
  const text = aiDraftFor(flags, pending);
  // A repeated request for the same episode returns the same preview without a new event.
  if (c.s.aiDrafts[ep!.id]?.text === text) return c.ok("Drafting preview ready. Edit it, then approve it as your own advice.", "info");
  c.s.aiDrafts[ep!.id] = { text, at: c.stamp() };
  c.emit({ verb: "agent.drafted", actor: { kind: "agent", id: "drafting", label: "Clinical Drafting" }, summary: `Clinical Drafting prepared an advice draft preview for ${ep!.id}. Draft only, for the clinician to edit and approve. No model connected.`, entity: { kind: "episode", id: ep!.id }, programmeId: ep!.programmeId, restricted: true, publicSummary: "Drafting preview prepared on a clinical episode", simulated: true });
  return c.ok("Drafting preview ready. Edit it, then approve it as your own advice.", "info");
};

handlers["review/acceptAiDraft"] = (c, a: { episodeId: string }) => {
  const d = c.need("clinical.review", "accept a drafting preview"); if (d) return d;
  const draftText = c.s.aiDrafts[a.episodeId];
  const ep = epOf(c, a.episodeId);
  if (!draftText || !ep) return c.fail("No drafting preview for this episode.");
  const why = notReviewable(c, ep); if (why) return c.fail(why);
  const draft = ep.reportState === "released" ? draftVersion(c.s, ep.id) : ensureDraft(c, ep);
  if (!draft) return c.fail("No draft to review.");
  draft.advice = draftText.text;
  draft.adviceSource = "ai_draft_approved";
  draft.checklist.advice = false;
  draft.checklist.preview = false;
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
  if (!el.ok) return c.fail(`The routine shortcut is not available. ${el.reasons.join(". ")}.`);
  const draft = ensureDraft(c, ep);
  if (!draft.advice.trim()) draft.advice = ADVICE_ROUTINE[Number(ep.id.slice(-1)) % ADVICE_ROUTINE.length];
  // Recorded as it happened: approved routine advice, released with the one-click shortcut, no preview step.
  draft.checklist = { advice: true, routine: true };
  doRelease(c, ep, draft, "routine");
  return c.ok(`Report ${ep.id} v${draft.version} released as a routine report.`, "ok", draft.id);
};

/* ---- corrections ---- */
/**
 * Start a correction on a released report: a new draft version with a reason. Optional edits
 * correct result values: each one adds a new observation version (the released version keeps its
 * own frozen references, so v1 never changes), and the draft refers to the corrected values.
 * Re-review is required before the new version is released.
 */
handlers["correction/start"] = (c, a: { episodeId: string; reason: string; edits?: Array<{ code: string; value: number }> }) => {
  const d = c.need("clinical.review", "start a correction"); if (d) return d;
  const ep = epOf(c, a.episodeId);
  if (!ep || ep.reportState !== "released") return c.fail("Only a released report can be corrected.");
  if (draftVersion(c.s, ep.id)) return c.fail("A correction is already in progress for this episode.");
  if (!(a.reason || "").trim() || a.reason.trim().length < 8) return c.fail("Record the reason for the correction.");
  const reason = a.reason.trim();
  const edits = a.edits || [];
  const latest = latestObservations(c.s, ep.id);
  if (new Set(edits.map((e) => e.code)).size !== edits.length) return c.fail("Each result can be corrected once in a correction.");
  for (const e of edits) {
    const o = latest.find((x) => x.code === e.code);
    if (!o) return c.fail(`${e.code} is not a result on ${ep.id}.`);
    if (typeof e.value !== "number" || !Number.isFinite(e.value) || e.value < 0) return c.fail(`Enter a valid number for ${ANALYTES[o.code].name}.`);
    if (e.value === o.value) return c.fail(`${ANALYTES[o.code].name} already has that value. Nothing to correct.`);
  }
  const at = c.stamp();
  for (const e of edits) {
    const o = latest.find((x) => x.code === e.code)!;
    c.s.observations.push({
      ...o, id: `OBS-${pad(c.nextNo("observation"), 5)}`, value: e.value, flag: flagFor(o.code, e.value), legacyDisplayedFlag: null, recordedAt: at, version: o.version + 1,
      correction: { kind: "result_correction", reason, by: c.persona().id as StaffId, at, previous: { id: o.id, value: o.value, unit: o.unit, version: o.version } },
    });
  }
  if (edits.length) c.inv();
  const draft = ensureDraft(c, ep, reason);
  draft.observationRefs = latestObservations(c.s, ep.id).map((o) => ({ id: o.id, version: o.version }));
  const changed = edits.length ? ` ${edits.length === 1 ? "One result is" : `${edits.length} results are`} corrected in the draft; the released version keeps its values.` : "";
  c.emit({ verb: "correction.started", summary: `${c.first()} started a correction on ${ep.id}: draft v${draft.version}. Released v${draft.version - 1} stays unchanged until v${draft.version} is re-reviewed and released.${changed}`, entity: { kind: "report", id: draft.id }, programmeId: ep.programmeId, personId: ep.personId });
  return c.ok(`Draft v${draft.version} created.${changed} Re-review it and release it to supersede v${draft.version - 1}.`, "ok", draft.id);
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
  f.attempts.push({ at: c.stamp(), by: c.persona().id as StaffId, channel: a.channel, result: a.result, note: (a.note || "").trim() });
  c.emit({ verb: "followup.attempt", summary: `${c.first()} recorded contact attempt ${f.attempts.length} on ${f.id} (${a.channel}, ${a.result.replace("_", " ")}). The item stays open.`, entity: { kind: "followup", id: f.id }, programmeId: f.programmeId, personId: f.personId, storyId: f.id === "FU-0001" ? "ST-04" : null, restricted: true, publicSummary: "Clinical action in progress" });
  return c.ok("Contact attempt recorded. The follow-up stays open until an outcome is documented.", "info");
};

handlers["followup/escalate"] = (c, a: { followUpId: string; note: string }) => {
  const d = c.need("followup.act", "escalate a follow-up"); if (d) return d;
  const f = c.s.followUps.find((x) => x.id === a.followUpId);
  if (!f || f.status !== "open") return c.fail("This follow-up is not open.");
  if (!(a.note || "").trim()) return c.fail("Add an escalation note.");
  f.escalations.push({ at: c.stamp(), by: c.persona().id as StaffId, note: a.note.trim() });
  c.emit({ verb: "followup.escalated", summary: `${c.first()} escalated ${f.id} (illustrative workflow, not a validated escalation protocol).`, entity: { kind: "followup", id: f.id }, programmeId: f.programmeId, personId: f.personId, storyId: f.id === "FU-0001" ? "ST-04" : null, restricted: true, publicSummary: "Clinical action escalated" });
  return c.ok("Escalation recorded.", "info");
};

handlers["followup/close"] = (c, a: { followUpId: string; outcomeCode: string; note: string; acknowledge: boolean }) => {
  const d = c.need("followup.act", "close a follow-up"); if (d) return d;
  const f = c.s.followUps.find((x) => x.id === a.followUpId);
  if (!f || f.status !== "open") return c.fail("This follow-up is not open.");
  const outcome = FOLLOW_UP_OUTCOMES.find((o) => o.code === a.outcomeCode);
  if (!outcome) return c.fail("Choose a documented outcome. A delivered message or a viewed report cannot close a follow-up.");
  if (!f.attempts.length) return c.fail("Record at least one contact attempt before closing.");
  if (outcome.reached && !f.attempts.some((x) => x.result === "spoke")) return c.fail("This outcome says the participant was reached, but no recorded attempt reached them. Record the attempt where you spoke with them first.");
  // An urgent clinical contact is closed by the clinician who owns it or by a clinical reviewer.
  if (f.kind === "urgent_clinical_contact" && f.ownerId !== c.persona().id && !c.can("clinical.review")) return c.fail(`Only the owning clinician (${staffName(c.s, f.ownerId)}) or a clinical reviewer can close an urgent follow-up.`);
  if (!(a.note || "").trim() || a.note.trim().length < 5) return c.fail("Add a short note describing the outcome.");
  if (!a.acknowledge) return c.fail("An authorised acknowledgement is required to close this follow-up.");
  const me = c.persona().id as StaffId;
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
  if (m.status === "cancelled") return c.fail("This reminder was cancelled with its booking. There is nothing to retry.");
  if (m.status !== "failed") return c.fail("This reminder is not failed. A retry was already made.");
  m.attempts.push({ at: c.stamp(), outcome: "delivered", reason: null, auto: false });
  m.status = "delivered";
  c.emit({ verb: "reminder.retried", summary: `${c.first()} retried reminder ${m.logicalId} to the verified ${m.channel === "sms" ? "mobile" : "email"} destination. Delivered (simulated). Logical reminders stay at ${c.s.messages.filter((x) => x.kind === "reminder" && x.cohort === m.cohort && x.status !== "cancelled").length}.`, entity: { kind: "message", id: m.id }, personId: m.personId, storyId: "ST-05", integrationId: m.provider === "Esendex" ? "esendex" : "email", simulated: true });
  return c.ok("Retry delivered (simulated). One logical reminder moved from failed to delivered and the attempt was added to its history.", "ok");
};

/* ---- data quality ---- */
handlers["dq/acknowledge"] = (c, a: { id: string }) => {
  const d = c.need("clinical.review", "acknowledge data quality items"); if (d) return d;
  const i = c.s.dqIssues.find((x) => x.id === a.id);
  if (!i || i.status !== "open") return c.fail("Already acknowledged.");
  i.status = "acknowledged";
  return c.ok("Acknowledged. A human still has to resolve it.", "info");
};

export const resultsHandlers = handlers;
export { HOLD_CATEGORY, ADVICE_FLAGGED };
export type { ImportRow };
