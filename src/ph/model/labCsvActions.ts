/* Lab CSV import handlers and the results integrity guard, registered when the model loads.

   labcsv/import   reads the file text again in the reducer (the preview on screen is only a
                   preview), attaches rows that match on name, date of birth and Unique ID, and
                   queues every other row for a person. Results already in Pulse are never
                   created twice.
   labcsv/resolve  a person matches a queued row to the suggested patient, with a reason.
   labcsv/reject   a person rejects a queued row. Nothing is attached.
   labcsv/rejectFeedRow  the same for a row held from the Eurofins feed: nothing is attached, the
                   held report goes back to waiting for that result.

   Integrity guard: an action that changes or releases results fails when it is attributed to an
   agent (action.actor.kind === "agent", or action.agentId). Agents can draft wording only. */
import type { Episode, ImportBatch, ImportRow, Observation, StaffId } from "./types";
import { ANALYTES } from "./constants";
import { bandCtxFor, classifyResult, parseResultText } from "./interpret";
import { expectedTests } from "./selectors/clinical";
import { localDateOf } from "./time";
import { registerHandlers } from "./reducer";
import { resultsHandlers } from "./actions/results";
import { pad } from "./actions/ctx";
import type { ActionResult, Ctx, Handler } from "./actions/ctx";
import { diffFor, newResultsFor, previewLabFile } from "./labCsv";
import type { LabFileIdentity, LabRecord, LabResultCell, LabUpload } from "./labCsv";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Adds the new results of one lab row to an episode as import rows and observations. Returns how many were created. */
function commitResults(c: Ctx, ep: Episode, file: LabFileIdentity, results: LabResultCell[], batchId: string, line: number, resolution: ImportRow["resolution"]): number {
  const fresh = newResultsFor(c.s, ep, results);
  if (!fresh.length) return 0;
  const person = c.ix().personById.get(ep.personId)!;
  const ctx = bandCtxFor(person, ep.collectedAt);
  const at = c.stamp();
  let seq = c.s.importRows.filter((r) => r.batchId === batchId).length;
  for (const r of fresh) {
    const parsed = parseResultText(r.code, r.valueText);
    if (!parsed) continue;
    const cl = classifyResult(r.code, parsed.value, ctx);
    const rowId = `${batchId}-R${pad(++seq, 3)}`;
    const obsId = `OBS-${pad(c.nextNo("observation"), 5)}`;
    const row: ImportRow = {
      id: rowId, batchId, line, specimenKey: ep.specimenIds[0], analyteCode: r.code, valueText: r.valueText, unit: r.unit || ANALYTES[r.code].unit, resultAt: at,
      dobInFile: file.dob, nameInFile: `${file.surname}, ${file.given}`.trim(), state: resolution ? "resolved" : "imported", episodeId: ep.id, observationId: obsId,
      quarantine: null, duplicateOfObservationId: null, resolution,
    };
    const obs: Observation = {
      id: obsId, episodeId: ep.id, specimenId: ep.specimenIds[0], code: r.code, value: parsed.value, valueText: parsed.valueText, unit: row.unit, limitText: cl.limitText, flag: cl.flag, band: cl.band,
      rangeVersion: cl.rangeVersion, legacyDisplayedFlag: null, source: { kind: "batch", batchId, rowId }, recordedAt: at, unitDiscrepancy: null, original: null, version: 1,
    };
    c.s.importRows.push(row);
    c.s.observations.push(obs);
  }
  c.inv();
  if (ep.qrisk && ep.qrisk.eligible && fresh.some((t) => t.code === "TC" || t.code === "HDL")) {
    ep.qrisk = { ...ep.qrisk, inputsComplete: true, reason: "Inputs complete. The licensed QRISK3 engine is not connected in this demo, so no output is shown for results imported in this session." };
  }
  c.settleEpisode(ep);
  c.inv();
  const allIn = expectedTests(c.s, ep).every((t) => t.status === "received");
  c.s.specimens.filter((x) => x.episodeId === ep.id).forEach((x) => { x.status = allIn ? "resulted" : "received"; });
  return fresh.length;
}

function refreshBatch(c: Ctx, uploadId: string): void {
  const up = c.s.labCsv.uploads.find((u) => u.id === uploadId);
  if (!up) return;
  const b = c.s.batches.find((x) => x.id === up.batchId);
  if (!b) return;
  const recs = c.s.labCsv.records.filter((r) => r.uploadId === uploadId);
  const open = recs.filter((r) => r.status === "flagged").length;
  const matched = recs.filter((r) => r.status === "matched" || r.status === "resolved").length;
  const rejected = recs.filter((r) => r.status === "rejected").length;
  b.status = open ? "partial" : "complete";
  b.specimenCount = matched;
  b.note = `${plural(matched, "participant row", "participant rows")} matched${rejected ? `, ${rejected} rejected` : ""}. ${open ? `${plural(open, "row needs", "rows need")} matching by a person.` : "Nothing is waiting for a person."}`;
}

function guardStaff(c: Ctx, what: string): ActionResult | null {
  return c.staffOnly(what);
}

const handlers: Record<string, Handler> = {
  "labcsv/import": (c, a: { filename: string; text: string; personId?: string | null }) => {
    const d = c.need("imports.view", "import laboratory results") || guardStaff(c, "import laboratory results"); if (d) return d;
    const filename = String(a.filename || "lab_results.csv").trim().slice(0, 120) || "lab_results.csv";
    const personId = a.personId || null;
    if (personId && !c.ix().personById.has(personId)) return c.fail("Unknown participant.");
    const pv = previewLabFile(c.s, String(a.text || ""), personId);
    if (!pv.file.ok) return c.fail(pv.file.error || "The file could not be read.");
    if (!pv.matched && !pv.flagged) {
      return c.fail(pv.duplicate ? `Nothing new in ${filename}. ${plural(pv.duplicate, "row is", "rows are")} already in Pulse or already waiting for matching, so nothing was imported twice.` : "No row in this file is for this participant. Nothing was imported.");
    }
    const at = c.stamp();
    const date = localDateOf(c.now);
    const prefix = `BATCH-${date.replace(/-/g, "")}-`;
    const batchId = `${prefix}${pad(c.s.batches.filter((b) => b.id.startsWith(prefix)).length + 1, 2)}`;
    const uploadId = `LAB-${pad(c.nextNo("labUpload"), 3)}`;
    const me = c.persona().id as StaffId;
    const batch: ImportBatch = {
      id: batchId, lab: "Eurofins", filename, receivedAt: at, processedAt: at, specimenCount: 0, kind: "upload",
      source: `CSV file uploaded in Pulse by ${c.persona().name}${personId ? ` on ${c.personName(personId)}'s record` : ""}. Read in the browser; simulated lab file.`, status: "complete", note: "",
    };
    c.s.batches.push(batch);
    const upload: LabUpload = { id: uploadId, batchId, filename, at, by: me, personId, columns: pv.file.columns.map((x) => x.header), format: pv.file.format, rows: pv.rows.length - pv.skipped, skipped: pv.skipped };
    c.s.labCsv.uploads.push(upload);
    let created = 0, n = 0;
    for (const { rec, outcome } of pv.rows) {
      if (outcome.kind === "skipped") continue;
      const record: LabRecord = {
        id: `${uploadId}-R${pad(++n, 2)}`, uploadId, line: rec.line, file: rec.file, results: rec.results, status: outcome.kind === "matched" ? "matched" : outcome.kind === "flagged" ? "flagged" : "duplicate",
        episodeId: outcome.kind === "matched" ? outcome.episode.id : outcome.kind === "duplicate" && outcome.episode ? outcome.episode.id : null,
        candidateEpisodeId: outcome.kind === "flagged" && outcome.candidate ? outcome.candidate.id : null,
        diff: outcome.kind === "flagged" ? outcome.diff : { name: false, dob: false, id: false }, created: 0, decision: null,
      };
      if (outcome.kind === "matched") {
        const ep = c.ix().episodeById.get(outcome.episode.id)!;
        record.created = commitResults(c, ep, rec.file, rec.results, batchId, rec.line, null);
        created += record.created;
      }
      c.s.labCsv.records.push(record);
    }
    c.inv();
    refreshBatch(c, uploadId);
    const text = `${plural(pv.matched, "row", "rows")} matched on name, date of birth and Precision ID (${plural(created, "result", "results")} added)${pv.flagged ? `, ${plural(pv.flagged, "row", "rows")} sent to the matching queue` : ""}${pv.duplicate ? `, ${pv.duplicate} already in Pulse` : ""}.`;
    c.emit({ verb: "labcsv.imported", summary: `${c.first()} imported ${filename} (${batchId}): ${text}`, entity: { kind: "batch", id: batchId }, personId, integrationId: "eurofins", simulated: true });
    return c.ok(`${filename} imported. ${text.charAt(0).toUpperCase()}${text.slice(1)}`, pv.flagged ? "info" : "ok", batchId);
  },

  "labcsv/resolve": (c, a: { recordId: string; episodeId: string; reason: string }) => {
    const d = c.need("identity.resolve", "match lab rows to a participant") || guardStaff(c, "match lab rows"); if (d) return d;
    const rec = c.s.labCsv.records.find((r) => r.id === a.recordId);
    if (!rec || rec.status !== "flagged") return c.fail("This row is no longer waiting for matching.");
    if (!rec.candidateEpisodeId) return c.fail("No participant in Pulse is close to this row. Reject it and ask the lab to check the request form.");
    if (a.episodeId !== rec.candidateEpisodeId) return c.fail("Match the row to the participant shown next to it.");
    const reason = String(a.reason || "").trim();
    if (reason.length < 8) return c.fail("Say briefly why this row belongs to this participant, for example \"Lab confirmed a typing error in the date of birth\".");
    const ep = c.ix().episodeById.get(rec.candidateEpisodeId);
    if (!ep) return c.fail("Unknown episode.");
    if (!newResultsFor(c.s, ep, rec.results).length) return c.fail(`${ep.id} already has these results. Reject the row instead, so nothing is imported twice.`);
    const up = c.s.labCsv.uploads.find((u) => u.id === rec.uploadId)!;
    const diff = diffFor(c.s, ep, rec.file);
    const checks = (["name", "dob", "id"] as const).filter((k) => diff[k]).map((k) => (k === "dob" ? "date of birth" : k === "id" ? "Precision ID" : "name"));
    const by = c.persona().id as StaffId;
    const at = c.stamp();
    rec.created = commitResults(c, ep, rec.file, rec.results, up.batchId, rec.line, { by, at, chosenEpisodeId: ep.id, checks: checks.map((x) => `differs: ${x}`), reason });
    rec.status = "resolved";
    rec.episodeId = ep.id;
    rec.decision = { by, at, reason, kind: "resolved" };
    refreshBatch(c, rec.uploadId);
    const st = (ep.reportState as Episode["reportState"]);
    c.emit({
      verb: "labcsv.resolved", summary: `${c.first()} matched lab row ${rec.id} to ${c.personName(ep.personId)} (${ep.id}) although the ${checks.join(" and ")} ${checks.length === 1 ? "differs" : "differ"}. Reason: ${reason.replace(/[.\s]+$/, "")}. ${plural(rec.created, "result", "results")} added once.`,
      entity: { kind: "episode", id: ep.id }, programmeId: ep.programmeId, personId: ep.personId, integrationId: "eurofins", simulated: true,
    });
    return c.ok(`Matched to ${c.personName(ep.personId)}. ${plural(rec.created, "result", "results")} added; ${ep.id} is now ${st === "ready_for_review" ? "ready for review" : "waiting for its remaining results"}.`, "ok", ep.id);
  },

  "labcsv/reject": (c, a: { recordId: string; reason?: string }) => {
    const d = c.need("identity.resolve", "reject lab rows") || guardStaff(c, "reject lab rows"); if (d) return d;
    const rec = c.s.labCsv.records.find((r) => r.id === a.recordId);
    if (!rec || rec.status !== "flagged") return c.fail("This row is no longer waiting for matching.");
    const reason = String(a.reason || "").trim() || "Does not match a Precision Health participant. Ask the lab to check the request form.";
    rec.status = "rejected";
    rec.decision = { by: c.persona().id as StaffId, at: c.stamp(), reason, kind: "rejected" };
    refreshBatch(c, rec.uploadId);
    c.emit({ verb: "labcsv.rejected", summary: `${c.first()} rejected lab row ${rec.id} (${rec.file.surname}, ${rec.file.given}, Precision ID ${rec.file.uniqueId || "missing"}). Nothing was attached. Reason: ${reason.replace(/[.\s]+$/, "")}.`, entity: { kind: "batch", id: c.s.labCsv.uploads.find((u) => u.id === rec.uploadId)!.batchId }, integrationId: "eurofins", simulated: true });
    return c.ok("Row rejected. Nothing was attached to any participant.", "info");
  },

  "labcsv/rejectFeedRow": (c, a: { rowId: string; reason?: string }) => {
    const d = c.need("identity.resolve", "reject lab rows") || guardStaff(c, "reject lab rows"); if (d) return d;
    const at = c.s.importRows.findIndex((r) => r.id === a.rowId);
    if (at < 0 || c.s.importRows[at].state !== "quarantined") return c.fail("This row is no longer waiting for matching.");
    const reason = String(a.reason || "").trim() || "Does not match a Precision Health participant. Ask the lab to check the request form.";
    // Rows are shared with the previous state: replace the element with a changed copy.
    const row: ImportRow = { ...c.s.importRows[at], state: "rejected" };
    c.s.importRows[at] = row;
    const held = c.s.episodes.find((e) => e.hold && e.hold.rowId === row.id);
    if (held) { held.hold = null; c.inv(); c.settleEpisode(held); }
    c.inv();
    const batch = c.s.batches.find((b) => b.id === row.batchId);
    if (batch) {
      const left = c.s.importRows.filter((r) => r.batchId === row.batchId && r.state === "quarantined").length;
      batch.status = left ? "partial" : "complete";
    }
    c.emit({ verb: "labcsv.rejected", summary: `${c.first()} rejected lab row ${row.id} (${row.nameInFile}, Precision ID ${row.specimenKey}). Nothing was attached.${held ? ` ${held.id} waits for the lab to send this result again.` : ""} Reason: ${reason.replace(/[.\s]+$/, "")}.`, entity: { kind: "row", id: row.id }, programmeId: held ? held.programmeId : undefined, personId: held ? held.personId : undefined, integrationId: "eurofins", simulated: true });
    return c.ok(held ? `Row rejected. Nothing was attached. ${c.personName(held.personId)}'s report waits for the lab to send this result again.` : "Row rejected. Nothing was attached to any participant.", "info");
  },
};

/* ---- results integrity: agents never change or release results ---- */
export const AGENT_RESULTS_RULE = "Agents can draft wording but cannot change results.";
/** Every action that creates, changes, matches or releases a result. Drafting advice is not on this list. */
export const RESULT_EDIT_ACTIONS = [
  "import/commitPreview", "import/resolveRow", "import/confirmUnit", "import/deliverSampleResults", "resultsui/confirmUnit",
  "review/release", "review/releaseRoutine", "correction/start", "correction/release",
  "labcsv/import", "labcsv/resolve", "labcsv/reject", "labcsv/rejectFeedRow",
];
type MaybeAgent = { actor?: { kind?: string; label?: string; id?: string }; agentId?: string };
export function agentActor(a: MaybeAgent): string | null {
  if (a && a.actor && a.actor.kind === "agent") return a.actor.label || a.actor.id || "An agent";
  if (a && typeof a.agentId === "string" && a.agentId) return a.agentId;
  return null;
}
function guarded(type: string, base: Handler): Handler {
  return (c, a) => {
    const who = agentActor(a as MaybeAgent);
    if (who) return c.fail(`${AGENT_RESULTS_RULE} ${who} cannot run "${type}": a member of staff must do this.`);
    return base(c, a);
  };
}
const results = resultsHandlers as Record<string, Handler>;
for (const t of RESULT_EDIT_ACTIONS) {
  // Wrap the shared handler in place too, so wrappers that call it directly (resultsui/confirmUnit) are covered.
  if (results[t]) results[t] = guarded(t, results[t]);
  if (handlers[t]) handlers[t] = guarded(t, handlers[t]);
}
registerHandlers({ ...handlers, ...Object.fromEntries(RESULT_EDIT_ACTIONS.filter((t) => results[t]).map((t) => [t, results[t]])) });

export const labAct = {
  importCsv: (filename: string, text: string, personId?: string | null) => ({ type: "labcsv/import", filename, text, personId: personId || null }),
  resolve: (recordId: string, episodeId: string, reason: string) => ({ type: "labcsv/resolve", recordId, episodeId, reason }),
  reject: (recordId: string, reason?: string) => ({ type: "labcsv/reject", recordId, reason }),
  rejectFeedRow: (rowId: string, reason?: string) => ({ type: "labcsv/rejectFeedRow", rowId, reason }),
};
