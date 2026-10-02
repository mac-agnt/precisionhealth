/* Selectors local to the Results screens. Plain functions of PhState, memoised per state
   object like the shared ones, so every count here is derived from the same records. */
import {
  ANALYTES, activityFeed, batchRows, hasUnitDiscrepancy, ix, latestObservations, memo, versionsOf,
} from "../../model";
import type { ActivityView, Episode, Id, ImportRow, Observation, Person, PhState, Specimen } from "../../model";

export function specimenIndex(state: PhState): Map<Id, Specimen> {
  return memo(state, "phr:spec", () => new Map(state.specimens.map((s) => [s.id, s])));
}
export function observationIndex(state: PhState): Map<Id, Observation> {
  return memo(state, "phr:obs", () => new Map(state.observations.map((o) => [o.id, o])));
}
export function rowIndex(state: PhState): Map<Id, ImportRow> {
  return memo(state, "phr:rows", () => new Map(state.importRows.map((r) => [r.id, r])));
}

/* ---- participant check: the date of birth on the row against the booking record ---- */
export type CheckStatus = "match" | "mismatch" | "missing" | "unknown";
export interface ParticipantCheck { status: CheckStatus; fileDob: string | null; recordDob: string | null; episode: Episode | null; person: Person | null; nameMatch: boolean | null }
/** Exact specimen lookup only. A name is never used to find a person; it is only cross-checked. */
export function participantCheck(state: PhState, row: ImportRow): ParticipantCheck {
  const spec = specimenIndex(state).get(row.specimenKey);
  const I = ix(state);
  const episode = spec ? I.episodeById.get(spec.episodeId) || null : null;
  const person = episode ? I.personById.get(episode.personId) || null : null;
  if (!person) return { status: "unknown", fileDob: row.dobInFile, recordDob: null, episode: null, person: null, nameMatch: null };
  const nameMatch = row.nameInFile.trim().toLowerCase() === `${person.family}, ${person.given[0]}`.toLowerCase();
  if (!row.dobInFile) return { status: "missing", fileDob: null, recordDob: person.dob, episode, person, nameMatch };
  return { status: row.dobInFile === person.dob ? "match" : "mismatch", fileDob: row.dobInFile, recordDob: person.dob, episode, person, nameMatch };
}
export const CHECK_LABEL: Record<CheckStatus, string> = {
  match: "DOB and name match",
  mismatch: "Date of birth differs",
  missing: "Identity not verified",
  unknown: "Specimen not recognised",
};
/** Wording in the style of the supplier concept: date of birth first, name as a cross-check only. */
export function checkLabel(c: ParticipantCheck): string {
  if (c.status === "match") return c.nameMatch ? "DOB and name match" : "DOB matches, name differs";
  if (c.status === "missing") return "Identity not verified: no date of birth";
  return CHECK_LABEL[c.status];
}

/* ---- validation summary for one batch, derived from its rows ---- */
export interface Validation {
  rows: number;
  specimens: number;
  dob: Record<CheckStatus, number>;
  unitDiffers: ImportRow[];
  nonNumeric: number;
  duplicates: number;
  exceptions: number;
  open: number;
  resolved: number;
  importedOnArrival: number;
  newKeys: number;
}
export function validationSummary(state: PhState, batchId: Id): Validation {
  return memo(state, "phr:val:" + batchId, () => {
    const rows = batchRows(state, batchId);
    const dob: Record<CheckStatus, number> = { match: 0, mismatch: 0, missing: 0, unknown: 0 };
    rows.forEach((r) => { dob[participantCheck(state, r).status]++; });
    const duplicates = rows.filter((r) => r.state === "duplicate").length;
    return {
      rows: rows.length,
      specimens: new Set(rows.filter((r) => r.episodeId).map((r) => r.episodeId)).size,
      dob,
      unitDiffers: rows.filter((r) => r.unit !== ANALYTES[r.analyteCode].unit),
      nonNumeric: rows.filter((r) => !Number.isFinite(Number(r.valueText))).length,
      duplicates,
      exceptions: rows.filter((r) => r.quarantine).length,
      open: rows.filter((r) => r.state === "quarantined").length,
      resolved: rows.filter((r) => r.state === "resolved").length,
      importedOnArrival: rows.filter((r) => r.state === "imported").length,
      newKeys: rows.length - duplicates,
    };
  });
}

/* ---- collection record ("requisition") for an episode, used to compare identifiers ---- */
export function collectionRecord(state: PhState, episodeId: Id) {
  const I = ix(state);
  const episode = I.episodeById.get(episodeId);
  if (!episode) return null;
  return {
    episode,
    person: I.personById.get(episode.personId)!,
    programme: I.programmeById.get(episode.programmeId)!,
    session: I.sessionById.get(episode.sessionId)!,
    booking: I.bookingById.get(episode.bookingId)!,
    specimens: state.specimens.filter((s) => s.episodeId === episodeId),
  };
}
export function episodeBySpecimen(state: PhState, specimenId: string): Episode | null {
  const s = specimenIndex(state).get(specimenId.trim().toUpperCase());
  return s ? ix(state).episodeById.get(s.episodeId) || null : null;
}

/* ---- source unit discrepancies (data quality holds) ---- */
export interface UnitIssue { episode: Episode; observation: Observation; rowId: Id | null }
export function openUnitIssues(state: PhState): UnitIssue[] {
  return memo(state, "phr:units", () => state.episodes.filter((e) => hasUnitDiscrepancy(state, e)).map((e) => {
    const o = latestObservations(state, e.id).find((x) => x.unitDiscrepancy && !x.unitDiscrepancy.confirmed)!;
    return { episode: e, observation: o, rowId: o.source.kind === "batch" ? o.source.rowId : null };
  }));
}
/** Every version of one observation code on an episode, oldest first. */
export function observationChain(state: PhState, episodeId: Id, code: Observation["code"]): Observation[] {
  return (ix(state).obsByEpisode.get(episodeId) || []).filter((o) => o.code === code).sort((a, b) => a.version - b.version);
}

/* ---- audit trail from the shared activity log ---- */
/** Events that point at any of the ids, newest first. activityFeed applies the role filter. */
export function eventsFor(state: PhState, ids: Array<string | null | undefined>, limit = 8): ActivityView[] {
  const want = ids.filter((x): x is string => !!x);
  if (!want.length) return [];
  const out: ActivityView[] = [];
  for (const v of activityFeed(state)) {
    const e = v.event;
    if ((e.entity && want.includes(e.entity.id)) || want.some((id) => v.text.includes(id))) out.push(v);
    if (out.length >= limit) break;
  }
  return out;
}
export function episodeEventIds(state: PhState, ep: Episode): string[] {
  return [ep.id, ...versionsOf(state, ep.id).map((v) => v.id), ...ep.followUpIds, ep.hold?.rowId || null].filter((x): x is string => !!x);
}

/* ---- follow-up context ---- */
export const followUpKindLabel = (k: "urgent_clinical_contact" | "routine_callback") => (k === "urgent_clinical_contact" ? "Urgent clinical contact" : "Routine call-back");
/** An episode with a clinician-assigned urgent follow-up is always released individually in this screen. */
export function hasUrgentFollowUp(state: PhState, ep: Episode): boolean {
  return state.followUps.some((f) => f.episodeId === ep.id && f.kind === "urgent_clinical_contact");
}
