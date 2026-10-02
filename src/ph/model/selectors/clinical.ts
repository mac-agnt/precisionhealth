/* Clinical selectors: episodes, flags, review queue, release rules, holds, follow-up,
   laboratory imports, report versions. Interpretation is illustrative and clinician-owned. */
import type {
  AnalyteCode, Booking, ClinicalCapture, ClinicSession, Episode, FollowUp, HoldKind, Id, ImportBatch, ImportRow, Observation, Person, PhState, Programme, ReportVersion, Specimen,
} from "../types";
import { ANALYTES, BP_REVIEW_LIMIT, HOLD_CATEGORY, HOLD_LABEL, REPORT_STATE_LABEL } from "../constants";
import type { HoldCategory } from "../constants";
import { hoursBetween, roundHalfUp } from "../time";
import type { Iso } from "../time";
import { canViewEpisodeClinical, ix, memo, persona, personName } from "./core";

/** Shown in place of clinical detail the current role may not see. */
export const CLINICAL_DETAIL_HIDDEN = "Detail limited to clinical roles assigned to this episode.";

/* ---- calculations ---- */
export function bmiOf(c: ClinicalCapture | null | undefined): number | null {
  if (!c) return null;
  const h = c.measures.heightM, w = c.measures.weightKg;
  if (h.state !== "recorded" || w.state !== "recorded" || h.value == null || w.value == null) return null;
  if (h.value < 1.0 || h.value > 2.3 || w.value < 25 || w.value > 300) return null;
  return roundHalfUp(w.value / (h.value * h.value), 1);
}
/** QRISK3 needs an approved integration and Irish input mappings. Nothing is computed or scraped here. */
export const QRISK3 = {
  state: "approved_integration_required" as const,
  title: "QRISK3 cardiovascular risk",
  text: "Approved integration required. No score or heart age is calculated in this demo. A clinically approved QRISK3 integration and agreed Irish input mappings are needed first.",
  inputsNeeded: ["Age, sex and ethnicity as agreed", "Smoking status", "Diabetes status", "Blood pressure", "Total and HDL cholesterol", "Height and weight (BMI)", "Family history and medication fields as agreed"],
};

export function bpFlagged(c: ClinicalCapture | null | undefined): boolean {
  if (!c) return false;
  const s = c.measures.bpSys, d = c.measures.bpDia;
  return (s.state === "recorded" && s.value != null && s.value >= BP_REVIEW_LIMIT.sys) || (d.state === "recorded" && d.value != null && d.value >= BP_REVIEW_LIMIT.dia);
}

/** Latest version of each observation code for an episode. */
export function latestObservations(state: PhState, episodeId: Id): Observation[] {
  return memo(state, "lo:" + episodeId, () => {
    const by = new Map<AnalyteCode, Observation>();
    for (const o of ix(state).obsByEpisode.get(episodeId) || []) {
      const cur = by.get(o.code);
      if (!cur || o.version > cur.version) by.set(o.code, o);
    }
    return Array.from(by.values());
  });
}

export interface FlagReason { kind: "observation" | "blood_pressure"; code?: AnalyteCode; text: string }
export function episodeFlags(state: PhState, ep: Episode): FlagReason[] {
  return memo(state, "ef:" + ep.id, () => {
    const out: FlagReason[] = [];
    for (const o of latestObservations(state, ep.id)) {
      if (o.flag === "review_required") out.push({ kind: "observation", code: o.code, text: `${ANALYTES[o.code].name} ${o.value} ${o.unit}, displayed limit ${o.limitText}` });
    }
    if (bpFlagged(ep.capture)) {
      out.push({ kind: "blood_pressure", text: `Blood pressure ${ep.capture.measures.bpSys.value}/${ep.capture.measures.bpDia.value} mmHg, displayed limit ${BP_REVIEW_LIMIT.text}` });
    }
    return out;
  });
}

export interface ExpectedTestView {
  code: AnalyteCode;
  name: string;
  unit: string;
  addOn: boolean;
  status: "received" | "pending" | "quarantined";
  observation: Observation | null;
  rowId: Id | null;
}
export function expectedTests(state: PhState, ep: Episode): ExpectedTestView[] {
  return memo(state, "et:" + ep.id, () => {
    const obs = new Map(latestObservations(state, ep.id).map((o) => [o.code, o]));
    const held = ep.hold?.rowId ? state.importRows.find((r) => r.id === ep.hold!.rowId) : undefined;
    return ep.expectedTests.map((t) => {
      const o = obs.get(t.code) || null;
      const quarantined = !o && !!held && held.state === "quarantined" && held.analyteCode === t.code;
      return { code: t.code, name: ANALYTES[t.code].name, unit: ANALYTES[t.code].unit, addOn: t.addOn, status: o ? "received" : quarantined ? "quarantined" : "pending", observation: o, rowId: quarantined ? held!.id : null };
    });
  });
}
export const pendingTests = (state: PhState, ep: Episode) => expectedTests(state, ep).filter((t) => t.status !== "received");
export const hasUnitDiscrepancy = (state: PhState, ep: Episode) => latestObservations(state, ep.id).some((o) => o.unitDiscrepancy && !o.unitDiscrepancy.confirmed);
/** A result on this episode was converted from the laboratory's source unit (the received value is kept as original). */
export const hasSourceUnitConversion = (state: PhState, ep: Episode) => latestObservations(state, ep.id).some((o) => !!o.original);

/* ---- report versions ---- */
export function versionsOf(state: PhState, episodeId: Id): ReportVersion[] {
  return (ix(state).versionsByEpisode.get(episodeId) || []).slice().sort((a, b) => a.version - b.version);
}
export const currentReleased = (state: PhState, episodeId: Id): ReportVersion | null => {
  const v = versionsOf(state, episodeId).filter((x) => x.status === "released");
  return v.length ? v[v.length - 1] : null;
};
export const draftVersion = (state: PhState, episodeId: Id): ReportVersion | null => {
  const v = versionsOf(state, episodeId).filter((x) => x.status === "draft" || x.status === "in_review");
  return v.length ? v[v.length - 1] : null;
};
export const firstReleasedAt = (state: PhState, episodeId: Id): Iso | null => {
  const v = versionsOf(state, episodeId).filter((x) => x.releasedAt).sort((a, b) => (a.releasedAt! < b.releasedAt! ? -1 : 1));
  return v.length ? v[0].releasedAt : null;
};
/** The observations frozen into the current released report version. A correction in progress does not change them. */
export function releasedObservations(state: PhState, episodeId: Id): Observation[] {
  const v = currentReleased(state, episodeId);
  if (!v) return [];
  const byId = new Map((ix(state).obsByEpisode.get(episodeId) || []).map((o) => [o.id, o]));
  return v.observationRefs.map((r) => byId.get(r.id)).filter((o): o is Observation => !!o);
}

/* ---- review queue ---- */
export interface ReviewItem {
  episode: Episode;
  person: Person;
  programme: Programme;
  session: ClinicSession;
  readyAt: Iso;
  ageHours: number;
  aged: boolean;
  flags: FlagReason[];
  flagged: boolean;
  routine: boolean;
  tests: ExpectedTestView[];
  /** False when the current role may not see this episode's clinical values: flag text and results are then withheld. */
  clinicalVisible: boolean;
}
export function routineEligibility(state: PhState, ep: Episode): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (ep.reportState === "released") reasons.push("Already released");
  else if (ep.reportState === "on_hold") reasons.push(`On hold: ${ep.hold ? HOLD_LABEL[ep.hold.kind] : "hold"}`);
  else if (ep.reportState !== "ready_for_review") reasons.push("Not ready for review");
  const pend = pendingTests(state, ep);
  if (pend.length) reasons.push(`Expected tests not accounted for: ${pend.map((t) => t.name).join(", ")}`);
  if (hasUnitDiscrepancy(state, ep)) reasons.push("Source unit discrepancy not confirmed");
  else if (hasSourceUnitConversion(state, ep)) reasons.push("A result was converted from the laboratory's source unit. Review individually");
  const flags = episodeFlags(state, ep);
  if (flags.length) reasons.push(`Review required: ${flags.map((f) => f.text).join("; ")}`);
  // A clinician-assigned follow-up, open or closed, means this episode is reviewed individually.
  if ((ix(state).followUpsByEpisode.get(ep.id) || []).length) reasons.push("A clinician-assigned follow-up is on record. Review individually");
  if (ep.capture.status !== "complete") reasons.push("Clinical capture not complete");
  if (ep.capture.identity.some((c) => !c.confirmed)) reasons.push("Identity check not confirmed at the appointment");
  return { ok: reasons.length === 0, reasons };
}
/** Every ready episode with its flags and tests, for counts and rules. Pages read reviewQueue, which applies role visibility. */
export function reviewQueueAll(state: PhState): ReviewItem[] {
  return memo(state, "rq", () => {
    const I = ix(state);
    return state.episodes
      .filter((e) => e.reportState === "ready_for_review")
      .map((e) => {
        const flags = episodeFlags(state, e);
        const readyAt = e.readyAt || state.clock.nowUtc;
        const ageHours = hoursBetween(readyAt, state.clock.nowUtc);
        return {
          episode: e, person: I.personById.get(e.personId)!, programme: I.programmeById.get(e.programmeId)!, session: I.sessionById.get(e.sessionId)!, readyAt, ageHours,
          aged: ageHours > 48, flags, flagged: flags.length > 0, routine: routineEligibility(state, e).ok, tests: expectedTests(state, e), clinicalVisible: true,
        };
      })
      .sort((a, b) => (a.readyAt < b.readyAt ? -1 : a.readyAt > b.readyAt ? 1 : a.episode.id < b.episode.id ? -1 : 1));
  });
}
/** Flag reasons with the values and analytes removed, for a role that may not see them. */
const hiddenFlags = (flags: FlagReason[]): FlagReason[] => flags.map((f) => ({ kind: f.kind, text: `Review required. ${CLINICAL_DETAIL_HIDDEN}` }));
/** Expected tests with their result values removed. The received, pending or quarantined status stays. */
const hiddenTests = (tests: ExpectedTestView[]): ExpectedTestView[] => tests.map((t) => ({ ...t, observation: null }));
/**
 * The review queue as the current role may see it. Counts and order are the same for everyone. For
 * episodes the role may not see (capture nurses outside their own clinics, operations, programme
 * roles), flag text and result values are withheld. The participant preview gets nothing.
 */
export function reviewQueue(state: PhState): ReviewItem[] {
  return memo(state, "rqv", () => {
    if (persona(state).isParticipant) return [];
    return reviewQueueAll(state).map((i) => canViewEpisodeClinical(state, i.episode.id) ? i : { ...i, flags: hiddenFlags(i.flags), tests: hiddenTests(i.tests), clinicalVisible: false });
  });
}
export interface ReviewStats {
  ready: number;
  routine: number;
  flagged: number;
  aged: number;
  buckets: { lt24: number; h24to48: number; h48to72: number; gt72: number };
  byAssignee: Array<{ staffId: string | null; ready: number; routine: number; flagged: number; aged: number }>;
}
export function reviewStats(state: PhState): ReviewStats {
  return memo(state, "rs", () => {
    const q = reviewQueueAll(state);
    const by = new Map<string | null, ReviewItem[]>();
    q.forEach((i) => { const k = i.episode.reviewAssigneeId; (by.get(k) || by.set(k, []).get(k)!).push(i); });
    return {
      ready: q.length, routine: q.filter((i) => i.routine).length, flagged: q.filter((i) => i.flagged).length, aged: q.filter((i) => i.aged).length,
      buckets: {
        lt24: q.filter((i) => i.ageHours < 24).length, h24to48: q.filter((i) => i.ageHours >= 24 && i.ageHours <= 48).length,
        h48to72: q.filter((i) => i.ageHours > 48 && i.ageHours <= 72).length, gt72: q.filter((i) => i.ageHours > 72).length,
      },
      byAssignee: Array.from(by.entries()).map(([staffId, items]) => ({ staffId, ready: items.length, routine: items.filter((i) => i.routine).length, flagged: items.filter((i) => i.flagged).length, aged: items.filter((i) => i.aged).length })),
    };
  });
}

/* ---- release checklist ---- */
export interface ChecklistItem { key: string; label: string; done: boolean; manual: boolean; note?: string }
export function releaseChecklist(state: PhState, ep: Episode): ChecklistItem[] {
  const draft = draftVersion(state, ep.id);
  const flags = episodeFlags(state, ep);
  const pend = pendingTests(state, ep);
  const idHold = ep.hold && HOLD_CATEGORY[ep.hold.kind] === "identity";
  const identityOk = !idHold && ep.capture.identity.every((c) => c.confirmed);
  return [
    { key: "identity", label: "Identity confirmed at the appointment and in the laboratory import", done: identityOk, manual: false, note: identityOk ? undefined : "Identity is not confirmed or an exception is open." },
    { key: "results", label: "All expected results accounted for", done: pend.length === 0 && !hasUnitDiscrepancy(state, ep), manual: false, note: pend.length ? `Pending: ${pend.map((t) => t.name).join(", ")}` : undefined },
    { key: "flags", label: flags.length ? "Review required flags acknowledged by the clinician" : "No review required flags", done: flags.length === 0 || !!draft?.flagAcknowledged, manual: flags.length > 0 },
    { key: "advice", label: "Advice written or reviewed by the clinician", done: !!draft?.checklist.advice && !!draft.advice.trim(), manual: true },
    { key: "preview", label: "Participant report preview viewed", done: !!draft?.checklist.preview, manual: true },
  ];
}
export const releaseReady = (state: PhState, ep: Episode) => ep.reportState === "ready_for_review" && releaseChecklist(state, ep).every((c) => c.done);

/* ---- holds ---- */
export interface HoldItem {
  episode: Episode;
  person: Person;
  kind: HoldKind;
  category: HoldCategory;
  label: string;
  reason: string;
  since: Iso;
  ageHours: number;
  /** False when the label and reason were reduced to what this role may see. */
  clinicalVisible: boolean;
}
/** Every held episode with its full hold label and reason, for counts and rules. Pages read holdQueue. */
export function holdQueueAll(state: PhState): HoldItem[] {
  return memo(state, "hq", () => {
    const I = ix(state);
    return state.episodes.filter((e) => e.reportState === "on_hold" && e.hold).map((e) => ({
      episode: e, person: I.personById.get(e.personId)!, kind: e.hold!.kind, category: HOLD_CATEGORY[e.hold!.kind], label: HOLD_LABEL[e.hold!.kind], reason: e.hold!.reason, since: e.hold!.since,
      ageHours: hoursBetween(e.hold!.since, state.clock.nowUtc), clinicalVisible: true,
    }));
  });
}
/**
 * Held episodes as the current role may see them. A clinical action hold reads only "Clinical action
 * assigned" for roles outside the episode's clinical team. Identity holds keep their operational
 * reason: resolving them is operations work. The participant preview gets nothing.
 */
export function holdQueue(state: PhState): HoldItem[] {
  return memo(state, "hqv", () => {
    if (persona(state).isParticipant) return [];
    return holdQueueAll(state).map((h) => {
      if (canViewEpisodeClinical(state, h.episode.id)) return h;
      if (h.category === "clinical_action") return { ...h, label: "Clinical action assigned", reason: "A clinician owns this item. No clinical detail is shown to this role.", clinicalVisible: false };
      if (h.category === "data_quality") return { ...h, reason: "A laboratory result needs confirmation before clinical review. Detail is limited to clinical roles.", clinicalVisible: false };
      return { ...h, clinicalVisible: false };
    });
  });
}
export function holdCounts(state: PhState) {
  const q = holdQueueAll(state);
  return { total: q.length, identity: q.filter((h) => h.category === "identity").length, dataQuality: q.filter((h) => h.category === "data_quality").length, clinicalAction: q.filter((h) => h.category === "clinical_action").length };
}
export const awaitingQueue = (state: PhState) => state.episodes.filter((e) => e.reportState === "awaiting_results");

/** Expected-test completion across episodes not yet released. */
export function expectedTestCompletion(state: PhState) {
  return memo(state, "etc", () => {
    let expected = 0, received = 0;
    for (const e of state.episodes) {
      if (e.reportState === "released") continue;
      const t = expectedTests(state, e);
      expected += t.length;
      received += t.filter((x) => x.status === "received").length;
    }
    return { expected, received, pending: expected - received, pct: expected ? (received / expected) * 100 : 0 };
  });
}

/* ---- inbox queues ---- */
export interface InboxQueue { id: "awaiting" | "identity" | "ready" | "held"; label: string; unit: "episodes" | "rows"; count: number; blurb: string }
export function inboxQueues(state: PhState): InboxQueue[] {
  const quarantined = state.importRows.filter((r) => r.state === "quarantined").length;
  return [
    { id: "awaiting", label: "Awaiting tests", unit: "episodes", count: awaitingQueue(state).length, blurb: "Expected laboratory results not yet received or accounted for." },
    { id: "identity", label: "Identity exceptions", unit: "rows", count: quarantined, blurb: "Laboratory rows held for explicit human identity resolution." },
    { id: "ready", label: "Ready for review", unit: "episodes", count: reviewQueueAll(state).length, blurb: "All expected results accounted for. Waiting for individual clinician review." },
    { id: "held", label: "Held episodes", unit: "episodes", count: holdQueueAll(state).length, blurb: "Identity, data quality and clinical action holds. Different categories, shown separately." },
  ];
}

/* ---- laboratory imports ---- */
export interface BatchStats {
  batch: ImportBatch;
  rows: number;
  imported: number;
  duplicates: number;
  quarantined: number;
  resolved: number;
  specimens: number;
  observations: number;
  partial: boolean;
}
/** Every row of a batch exactly as stored, for counts and rules. Pages read batchRows. */
export function batchRowsAll(state: PhState, batchId: Id): ImportRow[] {
  return memo(state, "br:" + batchId, () => state.importRows.filter((r) => r.batchId === batchId));
}
/** Whether the current role may see the result value on a laboratory row. */
export function rowValueVisible(state: PhState, row: ImportRow): boolean {
  if (!persona(state).perms.has("clinical.view")) return false;
  const epId = row.episodeId || episodeHeldByRow(state, row.id)?.id;
  return epId ? canViewEpisodeClinical(state, epId) : true;
}
/**
 * Rows of a batch as the current role may see them. Identity fields (specimen key, name and date of
 * birth in the file) stay for identity resolution. The result value is blanked, with valueHidden set,
 * for roles that may not see it. The participant preview gets nothing.
 */
export function batchRows(state: PhState, batchId: Id): ImportRow[] {
  return memo(state, "brv:" + batchId, () => {
    if (persona(state).isParticipant) return [];
    return batchRowsAll(state, batchId).map((r) => (rowValueVisible(state, r) ? r : { ...r, valueText: "", valueHidden: true }));
  });
}
export function batchStats(state: PhState, batchId: Id): BatchStats {
  return memo(state, "bs:" + batchId, () => {
    const batch = state.batches.find((b) => b.id === batchId)!;
    const rows = batchRowsAll(state, batchId);
    const imported = rows.filter((r) => r.state === "imported" || r.state === "resolved").length;
    const quarantined = rows.filter((r) => r.state === "quarantined").length;
    return {
      batch, rows: rows.length, imported, duplicates: rows.filter((r) => r.state === "duplicate").length, quarantined, resolved: rows.filter((r) => r.state === "resolved").length,
      specimens: new Set(rows.filter((r) => r.episodeId).map((r) => r.episodeId)).size, observations: rows.filter((r) => r.observationId).length, partial: quarantined > 0,
    };
  });
}
export const batchList = (state: PhState): BatchStats[] => state.batches.map((b) => batchStats(state, b.id)).sort((a, b) => (a.batch.processedAt < b.batch.processedAt ? 1 : -1));
/** Re-upload of an unchanged batch: nothing new is imported. Counts come from current state. */
export function reuploadPreview(state: PhState, batchId: Id) {
  const rows = batchRowsAll(state, batchId);
  const unresolved = rows.filter((r) => r.state === "quarantined").length;
  return { rows: rows.length, alreadySeen: rows.length - unresolved, unresolved, newRows: 0 };
}
export function rowCandidates(state: PhState, row: ImportRow) {
  const I = ix(state);
  return (row.quarantine?.candidateEpisodeIds || []).map((id) => {
    const ep = I.episodeById.get(id);
    return ep ? { episode: ep, person: I.personById.get(ep.personId)! } : null;
  }).filter(Boolean) as Array<{ episode: Episode; person: Person }>;
}
/** The episode a quarantined row will be linked to if resolved: the held episode that points at this row. */
export function episodeHeldByRow(state: PhState, rowId: Id): Episode | undefined {
  return state.episodes.find((e) => e.hold?.rowId === rowId);
}

/* ---- follow-up ---- */
export interface FollowUpView { followUp: FollowUp; person: Person; episode: Episode; overdue: boolean; dueInHours: number; attempts: number }
export function followUpList(state: PhState): FollowUpView[] {
  return memo(state, "fu", () => {
    const I = ix(state);
    if (persona(state).isParticipant) return [];
    return state.followUps.map((f) => ({
      followUp: f, person: I.personById.get(f.personId)!, episode: I.episodeById.get(f.episodeId)!,
      dueInHours: hoursBetween(state.clock.nowUtc, f.dueAt), overdue: f.status === "open" && Date.parse(f.dueAt) < Date.parse(state.clock.nowUtc), attempts: f.attempts.length,
    })).sort((a, b) => (a.followUp.status === b.followUp.status ? (a.followUp.dueAt < b.followUp.dueAt ? -1 : 1) : a.followUp.status === "open" ? -1 : 1));
  });
}
export const openFollowUps = (state: PhState) => followUpList(state).filter((f) => f.followUp.status === "open");

/* ---- corrections ---- */
export function correctionCandidates(state: PhState) {
  return state.episodes.filter((e) => e.reportState === "released").map((e) => {
    const vs = versionsOf(state, e.id);
    return { episode: e, versions: vs, current: currentReleased(state, e.id), draft: draftVersion(state, e.id) };
  });
}
export const reportStateLabel = (s: Episode["reportState"]) => REPORT_STATE_LABEL[s];

/* ---- a whole episode in one object ---- */
/** The capture with every measured value, urine result and note removed. Absence states stay. */
function hiddenCapture(c: ClinicalCapture): ClinicalCapture {
  const m = c.measures;
  const blank = (x: ClinicalCapture["measures"]["heightM"]) => ({ ...x, value: null });
  return { ...c, measures: { heightM: blank(m.heightM), weightKg: blank(m.weightKg), waistCm: blank(m.waistCm), bpSys: blank(m.bpSys), bpDia: blank(m.bpDia), pulse: blank(m.pulse) }, urine: null, notes: "" };
}
/** A report version with its advice and correction wording withheld. Status, dates and version numbers stay. */
const hiddenVersion = (v: ReportVersion): ReportVersion => ({ ...v, advice: "", correctionReason: v.correctionReason ? CLINICAL_DETAIL_HIDDEN : null });

export interface EpisodeBundle {
  episode: Episode;
  person: Person;
  programme: Programme;
  session: ClinicSession;
  booking: Booking;
  observations: Observation[];
  tests: ExpectedTestView[];
  flags: FlagReason[];
  bmi: number | null;
  versions: ReportVersion[];
  draft: ReportVersion | null;
  released: ReportVersion | null;
  followUps: FollowUp[];
  checklist: ChecklistItem[];
  routine: { ok: boolean; reasons: string[] };
  name: string;
  specimens: Specimen[];
  /** False when values, flag text, advice and follow-up notes were withheld for this role. */
  clinicalVisible: boolean;
}
/**
 * Everything about one episode in one object. For a role that may not see the episode's clinical
 * content (and in the participant preview) the shape is the same but values, flag text, advice and
 * follow-up notes are withheld and clinicalVisible is false. Pages should still gate on it.
 */
export function episodeBundle(state: PhState, episodeId: Id): EpisodeBundle | null {
  const I = ix(state);
  const episode = I.episodeById.get(episodeId);
  if (!episode) return null;
  const person = I.personById.get(episode.personId)!;
  const full: EpisodeBundle = {
    episode, person, programme: I.programmeById.get(episode.programmeId)!, session: I.sessionById.get(episode.sessionId)!, booking: I.bookingById.get(episode.bookingId)!,
    observations: latestObservations(state, episodeId), tests: expectedTests(state, episode), flags: episodeFlags(state, episode), bmi: bmiOf(episode.capture),
    versions: versionsOf(state, episodeId), draft: draftVersion(state, episodeId), released: currentReleased(state, episodeId), followUps: I.followUpsByEpisode.get(episodeId) || [],
    checklist: releaseChecklist(state, episode), routine: routineEligibility(state, episode), name: personName(person),
    specimens: state.specimens.filter((s) => s.episodeId === episodeId),
    clinicalVisible: true,
  };
  if (canViewEpisodeClinical(state, episodeId)) return full;
  return {
    ...full,
    episode: { ...episode, capture: hiddenCapture(episode.capture) },
    observations: [], tests: hiddenTests(full.tests), flags: hiddenFlags(full.flags), bmi: null,
    versions: full.versions.map(hiddenVersion), draft: full.draft ? hiddenVersion(full.draft) : null, released: full.released ? hiddenVersion(full.released) : null,
    followUps: full.followUps.map((f): FollowUp => ({ ...f, note: "", attempts: f.attempts.map((x) => ({ ...x, note: "" })), outcome: f.outcome ? { ...f.outcome, note: "" } : null })),
    checklist: full.checklist.map((c) => ({ ...c, label: c.key === "flags" ? "Review flags checked by the clinician" : c.label, note: undefined })),
    routine: { ok: full.routine.ok, reasons: full.routine.ok ? [] : [CLINICAL_DETAIL_HIDDEN] },
    clinicalVisible: false,
  };
}
