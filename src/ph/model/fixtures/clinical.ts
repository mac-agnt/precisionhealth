/* Deterministic clinical fixtures: episodes, specimens, observations, laboratory import
   batches and rows, report versions, follow-ups and data quality issues.
   Sample values are illustrative and labelled as such in the UI. */
import type {
  AnalyteCode, ClinicalCapture, DqIssue, Episode, FollowUp, Hold, Id, ImportBatch, ImportRow, Measure, Observation, ReportVersion, Specimen,
} from "../types";
import { ANALYTES, BP_REVIEW_LIMIT, CORE_PANEL, FORM_TEMPLATES, flagFor } from "../constants";
import { dublinToUtc, fmtNumericDate } from "../time";
import type { Iso } from "../time";
import { makeRng } from "../rng";
import type { Rng } from "../rng";
import { ADVICE_FLAGGED, ADVICE_ROUTINE } from "../advice";
import { pad } from "./people";
import type { EpRole, RosterPlan } from "./people";

export const BASELINE_BATCH_ID = "BATCH-20261002-01";
export const EARLY_BATCH_ID = "BATCH-20261002-00";
export const BASELINE_PROCESSED_AT: Iso = "2026-10-05T05:30:00.000Z";

const NAMED_EP: Record<string, string> = {
  "PH-P-0001": "PH-E-0101", "PH-P-0002": "PH-E-0102", "PH-P-0003": "PH-E-0103", "PH-P-0004": "PH-E-0104",
  "PH-P-0501": "PH-E-0201", "PH-P-0502": "PH-E-0202", "PH-P-0701": "PH-E-0301",
};

const BATCH_FOR_SESSION: Record<string, string> = {
  "CLN-SISK-20260914": "BATCH-20260915-01", "CLN-SISK-20260917": "BATCH-20260918-01", "CLN-SISK-20260921": "BATCH-20260922-01",
  "CLN-SISK-20260924": "BATCH-20260925-01", "CLN-SISK-20260928": "BATCH-20260929-01", "CLN-SF-20260929": "BATCH-20260930-01",
  "CLN-SISK-20261001": EARLY_BATCH_ID, "CLN-SF-20261001": EARLY_BATCH_ID, "CLN-IBM-20261001": EARLY_BATCH_ID,
};
const BATCH_TIMES: Record<string, { received: Iso; processed: Iso }> = {
  "BATCH-20260915-01": { received: "2026-09-15T08:40:00.000Z", processed: "2026-09-15T09:05:00.000Z" },
  "BATCH-20260918-01": { received: "2026-09-18T08:40:00.000Z", processed: "2026-09-18T09:05:00.000Z" },
  "BATCH-20260922-01": { received: "2026-09-22T08:40:00.000Z", processed: "2026-09-22T09:05:00.000Z" },
  "BATCH-20260925-01": { received: "2026-09-25T08:40:00.000Z", processed: "2026-09-25T09:05:00.000Z" },
  "BATCH-20260929-01": { received: "2026-09-29T08:40:00.000Z", processed: "2026-09-29T09:05:00.000Z" },
  "BATCH-20260930-01": { received: "2026-09-30T08:40:00.000Z", processed: "2026-09-30T09:05:00.000Z" },
  [EARLY_BATCH_ID]: { received: "2026-10-02T08:10:00.000Z", processed: "2026-10-02T08:30:00.000Z" },
  [BASELINE_BATCH_ID]: { received: "2026-10-02T15:40:00.000Z", processed: BASELINE_PROCESSED_AT },
};

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;
const fmtValue = (code: AnalyteCode, v: number) => v.toFixed(ANALYTES[code].decimals);

type Panel = Record<AnalyteCode, number>;
function drawPanel(r: Rng): Panel {
  return {
    TC: r1(clamp(r.normal(4.3, 0.55), 3.0, 6.8)),
    HDL: r1(clamp(r.normal(1.5, 0.3), 0.7, 2.4)),
    LDL: r1(clamp(r.normal(2.3, 0.5), 1.0, 4.4)),
    TG: r1(clamp(r.normal(1.05, 0.4), 0.4, 3.2)),
    HBA1C: Math.round(clamp(r.normal(35, 3.5), 26, 52)),
    VITD: Math.round(clamp(r.normal(62, 18), 25, 110)),
    FERR: Math.round(clamp(r.normal(90, 45), 12, 260)),
  };
}
function routinePanel(r: Rng): Panel {
  const p = drawPanel(r);
  p.TC = Math.min(p.TC, 4.9);
  p.HDL = Math.max(p.HDL, 1.1);
  p.LDL = Math.min(p.LDL, 2.9);
  p.TG = Math.min(p.TG, 1.6);
  p.HBA1C = Math.min(p.HBA1C, 41);
  p.VITD = Math.max(p.VITD, 55);
  p.FERR = Math.max(p.FERR, 35);
  return p;
}
const FORCE: Record<AnalyteCode, (r: Rng) => number> = {
  TC: (r) => r1(5.3 + r.next() * 0.8),
  HDL: (r) => r1(0.7 + r.next() * 0.25),
  LDL: (r) => r1(3.2 + r.next() * 0.9),
  TG: (r) => r1(1.9 + r.next() * 0.9),
  HBA1C: (r) => Math.round(43 + r.next() * 6),
  VITD: (r) => Math.round(30 + r.next() * 15),
  FERR: (r) => Math.round(14 + r.next() * 12),
};
const FLAG_SETS: AnalyteCode[][] = [["LDL"], ["TG", "HBA1C"], ["TC", "LDL"], ["HDL"], ["HBA1C"], ["TG"], ["LDL", "TG"]];

function measure(value: number | null, state: Measure["state"] = "recorded", provenance: Measure["provenance"] = "measured"): Measure {
  return { value, state, provenance };
}

export function emptyCapture(personDob: string, bookingId: string): ClinicalCapture {
  return {
    status: "not_started",
    identity: [
      { key: "dob", label: "Date of birth", confirmedValue: "", confirmed: false },
      { key: "booking", label: "Booking reference", confirmedValue: "", confirmed: false },
    ],
    measures: {
      heightM: measure(null, "missing", "self_reported"), weightKg: measure(null, "missing", "measured"),
      waistCm: measure(null, "missing"), bpSys: measure(null, "missing"), bpDia: measure(null, "missing"), pulse: measure(null, "missing"),
    },
    urine: null, notes: "", checklist: {}, savedAt: null, rev: 0, checkedInAt: null, completedAt: null,
  };
  void personDob; void bookingId;
}

function completedCapture(r: Rng, dob: string, bookingId: string, collectedAt: Iso, bp?: { sys: number; dia: number }, fixed?: { h: number; w: number; sys: number; dia: number }): ClinicalCapture {
  const h = fixed ? fixed.h : r2(clamp(r.normal(1.72, 0.09), 1.5, 2.0));
  const w = fixed ? fixed.w : r1(clamp(r.normal(78, 13), 50, 130));
  const sys = fixed ? fixed.sys : bp ? bp.sys : Math.round(clamp(r.normal(121, 10), 98, 136));
  const dia = fixed ? fixed.dia : bp ? bp.dia : Math.round(clamp(r.normal(76, 7), 58, 86));
  const done = new Date(Date.parse(collectedAt) + 11 * 60000).toISOString();
  return {
    status: "complete",
    identity: [
      { key: "dob", label: "Date of birth", confirmedValue: fmtNumericDate(dob), confirmed: true },
      { key: "booking", label: "Booking reference", confirmedValue: bookingId, confirmed: true },
    ],
    measures: {
      heightM: measure(h, "recorded", "self_reported"), weightKg: measure(w), waistCm: measure(Math.round(clamp(r.normal(88, 11), 62, 130))),
      bpSys: measure(sys), bpDia: measure(dia), pulse: measure(Math.round(clamp(r.normal(70, 9), 50, 100))),
    },
    urine: { protein: "Negative", glucose: "Negative", blood: "Negative" },
    notes: "",
    checklist: { identity: true, questionnaire: true, measurements: true, specimens: true, labels: true },
    savedAt: done, rev: 3, checkedInAt: collectedAt, completedAt: done,
  };
}

export interface ClinicalBuild {
  episodes: Episode[];
  specimens: Specimen[];
  observations: Observation[];
  batches: ImportBatch[];
  importRows: ImportRow[];
  reportVersions: ReportVersion[];
  followUps: FollowUp[];
  dqIssues: DqIssue[];
  /** Ids of the three episodes whose HbA1c row is a duplicate in the baseline batch. */
  duplicateEpisodeIds: Id[];
  episodeByPerson: Record<Id, Id>;
}

const FORM_SNAPSHOT = () => {
  const t = FORM_TEMPLATES.find((x) => x.id === "tpl-comprehensive-lab")!;
  const v = t.versions.find((x) => x.version === "2.0")!;
  const blocks: Record<string, string> = {};
  v.blocks.forEach((b) => (blocks[b.blockId] = b.version));
  return { templateId: t.id, version: "2.0", blocks };
};

export function buildClinical(plan: RosterPlan): ClinicalBuild {
  const rng = makeRng("ph-demo-clinical-v1");
  const personById = new Map(plan.persons.map((p) => [p.id, p]));
  const bookingBy = new Map(plan.bookings.map((b) => [b.personId + "|" + b.sessionId, b]));
  const episodes: Episode[] = [];
  const specimens: Specimen[] = [];
  const observations: Observation[] = [];
  const reportVersions: ReportVersion[] = [];
  const followUps: FollowUp[] = [];
  const dqIssues: DqIssue[] = [];
  const rowsByBatch: Record<string, ImportRow[]> = {};
  const episodeByPerson: Record<Id, Id> = {};
  const inBatch: Array<{ ep: Episode; role: EpRole; dupHba1c: boolean; flagSet: AnalyteCode[] | null }> = [];
  let obsNo = 0, genSeq = 1001, flaggedCount = 0, bpFlaggedDone = false;
  const duplicateEpisodeIds: Id[] = [];

  const newObs = (ep: Episode, code: AnalyteCode, value: number, unit: string, source: Observation["source"], at: Iso, extra?: Partial<Observation>): Observation => {
    obsNo++;
    const a = ANALYTES[code];
    const o: Observation = {
      id: `OBS-${pad(obsNo, 5)}`, episodeId: ep.id, specimenId: ep.specimenIds[0], code, value, unit,
      limitText: a.limit.text, flag: flagFor(code, value), legacyDisplayedFlag: null, source, recordedAt: at,
      unitDiscrepancy: null, original: null, version: 1, ...extra,
    };
    observations.push(o);
    return o;
  };
  const addRow = (batchId: string, base: Omit<ImportRow, "id" | "line" | "batchId">): ImportRow => {
    const list = rowsByBatch[batchId] || (rowsByBatch[batchId] = []);
    const line = list.length + 2; // line 1 is the CSV header
    const row: ImportRow = { id: `${batchId}-R${pad(list.length + 1, 3)}`, batchId, line, ...base };
    list.push(row);
    return row;
  };

  const past = plan.sessions.filter((s) => s.status === "completed").sort((a, b) => (a.date === b.date ? (a.programmeId < b.programmeId ? -1 : 1) : a.date < b.date ? -1 : 1));
  for (const s of past) {
    plan.attendees[s.id].forEach((pid) => {
      const person = personById.get(pid)!;
      const booking = bookingBy.get(pid + "|" + s.id)!;
      const role = plan.roleOf[pid];
      const r = rng.fork("e" + pid);
      const epId = NAMED_EP[pid] || `PH-E-${genSeq++}`;
      booking.episodeId = epId;
      episodeByPerson[pid] = epId;
      const collectedAt = dublinToUtc(s.date, booking.slotStart);
      const specId = `PH-S-${epId.slice(5)}`;
      const isBatch = role.startsWith("ready_batch") || role.startsWith("hold_") || role === "await_partial";
      const flaggedRole = role === "ready_batch_flagged" || role === "ready_aged_flagged";
      const flagSet = flaggedRole ? FLAG_SETS[flaggedCount++ % FLAG_SETS.length] : null;

      // Clinical capture with fixed values for the two demonstration people.
      let capture: ClinicalCapture;
      if (pid === "PH-P-0001") capture = completedCapture(r, person.dob, booking.id, collectedAt, undefined, { h: 1.7, w: 65, sys: 116, dia: 74 });
      else if (pid === "PH-P-0501") capture = completedCapture(r, person.dob, booking.id, collectedAt, undefined, { h: 1.78, w: 84.5, sys: 126, dia: 80 });
      else if (flaggedRole && !bpFlaggedDone && role === "ready_batch_flagged") { bpFlaggedDone = true; capture = completedCapture(r, person.dob, booking.id, collectedAt, { sys: 148, dia: 94 }); }
      else capture = completedCapture(r, person.dob, booking.id, collectedAt, r.chance(0.04) ? { sys: 142, dia: 91 } : undefined);

      const expected = CORE_PANEL.map((code) => ({ code, addOn: false }));
      const hasVitD = role === "await_partial" || (role === "released" && r.chance(0.1));
      if (hasVitD) expected.push({ code: "VITD" as AnalyteCode, addOn: true });

      const reportState: Episode["reportState"] =
        role === "released" ? "released" : role.startsWith("ready") ? "ready_for_review" : role.startsWith("await") ? "awaiting_results" : "on_hold";

      const ep: Episode = {
        id: epId, personId: pid, programmeId: s.programmeId, bookingId: booking.id, sessionId: s.id, collectedAt,
        formSnapshot: FORM_SNAPSHOT(), capture, specimenIds: [specId], expectedTests: expected, reportState, hold: null, readyAt: null,
        reviewAssigneeId: reportState === "ready_for_review" || reportState === "on_hold" ? "neil" : null,
        reportVersionIds: [], followUpIds: [], flagAckBy: null,
      };
      episodes.push(ep);
      specimens.push({ id: specId, episodeId: epId, type: "serum", collectedAt, status: role === "await_none" ? "collected" : "received", labelPrinted: true });

      // Values for this person.
      let panel: Panel;
      if (pid === "PH-P-0001") panel = { TC: 4.4, HDL: 1.6, LDL: 2.3, TG: 0.9, HBA1C: 34, VITD: 70, FERR: 95 };
      else if (pid === "PH-P-0501") panel = { TC: 4.9, HDL: 1.3, LDL: 3.2, TG: 1.2, HBA1C: 37, VITD: 70, FERR: 95 };
      else if (role === "released") panel = drawPanel(r);
      else {
        panel = routinePanel(r);
        if (flagSet) flagSet.forEach((c) => (panel[c] = FORCE[c](r)));
      }

      if (role === "released" || role.startsWith("ready_aged")) {
        const batchId = BATCH_FOR_SESSION[s.id];
        const t = BATCH_TIMES[batchId];
        const codes: AnalyteCode[] = hasVitD ? [...CORE_PANEL, "VITD"] : CORE_PANEL;
        codes.forEach((code) => {
          const row = addRow(batchId, {
            specimenKey: specId, analyteCode: code, valueText: fmtValue(code, panel[code]), unit: ANALYTES[code].unit, resultAt: t.received,
            dobInFile: person.dob, nameInFile: `${person.family}, ${person.given[0]}`, state: "imported", episodeId: epId, observationId: null,
            quarantine: null, duplicateOfObservationId: null, resolution: null,
          });
          const o = newObs(ep, code, panel[code], ANALYTES[code].unit, { kind: "batch", batchId, rowId: row.id }, t.processed);
          row.observationId = o.id;
        });
        const off = role.startsWith("ready_aged") ? 4 + (episodes.length % 7) : 0;
        ep.readyAt = new Date(Date.parse(t.processed) + off * 60000).toISOString();
        specimens[specimens.length - 1].status = "resulted";
      } else if (isBatch) {
        inBatch.push({ ep, role, dupHba1c: false, flagSet });
        (ep as Episode & { _panel?: Panel })._panel = panel;
      }
    });
  }

  /* ---- the baseline batch: 24 specimens x 5 rows = 120 observation rows ---- */
  // Order the batch Sisk, Salesforce, IBM, then by episode id.
  const progRank = (p: string) => (p === "PRG-SISK-26" ? 0 : p === "PRG-SF-26" ? 1 : 2);
  inBatch.sort((a, b) => (progRank(a.ep.programmeId) - progRank(b.ep.programmeId)) || (a.ep.id < b.ep.id ? -1 : 1));
  // The first routine batch episode in each programme (not Aisling) carries one HbA1c row already imported earlier.
  const dupSeen: Record<string, boolean> = {};
  inBatch.forEach((x) => {
    if (x.role === "ready_batch_routine" && x.ep.personId !== "PH-P-0001" && !dupSeen[x.ep.programmeId]) {
      dupSeen[x.ep.programmeId] = true;
      x.dupHba1c = true;
      duplicateEpisodeIds.push(x.ep.id);
    }
  });

  const T = BATCH_TIMES[BASELINE_BATCH_ID];
  const early = BATCH_TIMES[EARLY_BATCH_ID];
  let rankSeconds = 0;
  for (const x of inBatch) {
    const ep = x.ep;
    const panel = (ep as Episode & { _panel?: Panel })._panel as Panel;
    delete (ep as Episode & { _panel?: Panel })._panel;
    const person = personById.get(ep.personId)!;
    const specId = ep.specimenIds[0];
    let imported = 0;
    for (const code of CORE_PANEL) {
      const name = `${person.family}, ${person.given[0]}`;
      let valueText = fmtValue(code, panel[code]);
      let unit = ANALYTES[code].unit;
      let specimenKey = specId;
      let dobInFile: string | null = person.dob;
      let nameInFile = name;
      let state: ImportRow["state"] = "imported";
      let quarantine: ImportRow["quarantine"] = null;
      let dupOf: string | null = null;
      let unitDisc: Observation["unitDiscrepancy"] = null;
      let original: Observation["original"] = null;
      let obsValue = panel[code];

      if (x.dupHba1c && code === "HBA1C") {
        // Delivered earlier the same day: observation exists from the early batch.
        const eRow = addRow(EARLY_BATCH_ID, {
          specimenKey: specId, analyteCode: code, valueText, unit, resultAt: early.received, dobInFile, nameInFile: name, state: "imported",
          episodeId: ep.id, observationId: null, quarantine: null, duplicateOfObservationId: null, resolution: null,
        });
        const eObs = newObs(ep, code, obsValue, unit, { kind: "batch", batchId: EARLY_BATCH_ID, rowId: eRow.id }, early.processed);
        eRow.observationId = eObs.id;
        state = "duplicate";
        dupOf = eObs.id;
      }
      if (ep.personId === "PH-P-0002" && code === "HBA1C") {
        const [y, m, d] = person.dob.split("-");
        dobInFile = `${y}-${d}-${m}`; // day and month transposed
        state = "quarantined";
        quarantine = {
          reason: "dob_mismatch",
          detail: `Date of birth on the row (${fmtNumericDate(dobInFile)}) does not match the booking record (${fmtNumericDate(person.dob)}). Day and month look transposed. Not matched automatically.`,
          candidateEpisodeIds: [ep.id], suggestion: null,
        };
      }
      if (ep.personId === "PH-P-0502" && code === "TG") {
        specimenKey = "PH-S-O202";
        state = "quarantined";
        quarantine = {
          reason: "unknown_specimen",
          detail: "Specimen identifier PH-S-O202 is not on any collection record. It contains the letter O where a zero may be expected.",
          candidateEpisodeIds: [],
          suggestion: "Closest collection record: PH-S-0202 (PH-E-0202). Suggestion only. A person must confirm two identifiers before the row is accepted.",
        };
      }
      if (ep.personId === "PH-P-0701" && code === "HDL") {
        dobInFile = null;
        nameInFile = "Daly, E";
        state = "quarantined";
        const twin = plan.persons.find((p) => p.id === "PH-P-0702")!;
        void twin;
        quarantine = {
          reason: "multiple_candidates",
          detail: "The row has no date of birth, and the name \"Daly, E\" matches two episodes in the IBM Dublin programme. Manual identity resolution needed.",
          candidateEpisodeIds: [ep.id, episodeByPerson["PH-P-0702"]], suggestion: null,
        };
      }
      if (ep.personId === "PH-P-0004" && code === "LDL") {
        valueText = "112";
        unit = "mg/dL";
        obsValue = 112;
        unitDisc = { sourceUnit: "mg/dL", expectedUnit: "mmol/L", confirmed: false };
        original = { value: 112, unit: "mg/dL" };
      }

      const row = addRow(BASELINE_BATCH_ID, {
        specimenKey, analyteCode: code, valueText, unit, resultAt: T.received, dobInFile, nameInFile, state,
        episodeId: state === "quarantined" ? null : ep.id, observationId: null, quarantine, duplicateOfObservationId: dupOf, resolution: null,
      });
      if (state === "imported") {
        const extra: Partial<Observation> = { unitDiscrepancy: unitDisc, original };
        const o = newObs(ep, code, obsValue, unit, { kind: "batch", batchId: BASELINE_BATCH_ID, rowId: row.id }, T.processed, extra);
        if (unitDisc) o.flag = "none";
        // The legacy spreadsheet-style summary showed this combination as normal.
        if (ep.personId === "PH-P-0501" && code === "LDL") o.legacyDisplayedFlag = "normal";
        row.observationId = o.id;
        imported++;
      }
    }
    // Specimen and episode state for the batch.
    const spec = specimens.find((s) => s.id === specId)!;
    const allIn = ep.expectedTests.every((t) => observations.some((o) => o.episodeId === ep.id && o.code === t.code));
    spec.status = allIn ? "resulted" : "received";
    if (x.role.startsWith("ready_batch")) ep.readyAt = new Date(Date.parse(T.processed) + rankSeconds++ * 3000).toISOString();
    void imported;
  }

  /* ---- holds ---- */
  const holdFor = (personNo: string): Episode => episodes.find((e) => e.personId === personNo)!;
  const setHold = (personNo: string, h: Hold) => { holdFor(personNo).hold = h; };
  const ciaraRow = rowsByBatch[BASELINE_BATCH_ID].find((r) => r.quarantine?.reason === "dob_mismatch")!;
  const niamhRow = rowsByBatch[BASELINE_BATCH_ID].find((r) => r.quarantine?.reason === "unknown_specimen")!;
  const eoinRow = rowsByBatch[BASELINE_BATCH_ID].find((r) => r.quarantine?.reason === "multiple_candidates")!;
  setHold("PH-P-0002", { kind: "identity_dob_mismatch", reason: "A laboratory row for this specimen has a different date of birth. Identity must be resolved by a person before review.", since: T.processed, rowId: ciaraRow.id, followUpId: null });
  setHold("PH-P-0502", { kind: "identity_unknown_specimen", reason: "A laboratory row carries a specimen identifier that matches no collection record.", since: T.processed, rowId: niamhRow.id, followUpId: null });
  setHold("PH-P-0701", { kind: "identity_candidates", reason: "A laboratory row matches two candidate episodes and needs manual identity resolution.", since: T.processed, rowId: eoinRow.id, followUpId: null });
  setHold("PH-P-0004", { kind: "source_unit_discrepancy", reason: "The laboratory file reports LDL in mg/dL where the template expects mmol/L. No silent conversion.", since: T.processed, rowId: null, followUpId: null });
  setHold("PH-P-0003", { kind: "urgent_follow_up", reason: "Clinician-assigned urgent follow-up. The report cannot be released until the contact outcome is documented.", since: "2026-10-05T06:40:00.000Z", rowId: null, followUpId: "FU-0001" });

  /* ---- report versions for released episodes ---- */
  const releasedEps = episodes.filter((e) => e.reportState === "released");
  const sessionDate = (e: Episode) => plan.sessions.find((x) => x.id === e.sessionId)!.date;
  releasedEps.forEach((ep, i) => {
    const r = rng.fork("rv" + ep.id);
    const obs = observations.filter((o) => o.episodeId === ep.id);
    const flagged = obs.some((o) => o.flag === "review_required") || (ep.capture.measures.bpSys.value! >= BP_REVIEW_LIMIT.sys || ep.capture.measures.bpDia.value! >= BP_REVIEW_LIMIT.dia);
    const batchId = BATCH_FOR_SESSION[ep.sessionId];
    const processed = Date.parse(BATCH_TIMES[batchId].processed);
    const early1Oct = batchId === EARLY_BATCH_ID;
    const relMs = early1Oct ? Date.parse("2026-10-02T12:00:00.000Z") + Math.floor(r.next() * 4.5 * 3600000) : processed + (6 + Math.floor(r.next() * 52)) * 3600000;
    const releasedAt = new Date(Math.min(relMs, Date.parse("2026-10-04T10:00:00.000Z"))).toISOString();
    ep.readyAt = ep.readyAt || BATCH_TIMES[batchId].processed;
    const id = `${ep.id}-v1`;
    const advice = flagged ? ADVICE_FLAGGED[i % ADVICE_FLAGGED.length] : ADVICE_ROUTINE[i % ADVICE_ROUTINE.length];
    const accessed = r.chance(0.45) ? new Date(Date.parse(releasedAt) + (2 + Math.floor(r.next() * 40)) * 3600000).toISOString() : null;
    reportVersions.push({
      id, episodeId: ep.id, version: 1, status: "released", createdAt: new Date(Date.parse(releasedAt) - 30 * 60000).toISOString(), createdBy: "neil",
      advice, adviceSource: "sample_template", releasedAt, releasedBy: "neil", releaseMode: flagged ? "individual" : "routine",
      checklist: { identity: true, results: true, flags: true, advice: true, preview: true }, flagAcknowledged: flagged, correctionReason: null,
      supersedes: null, supersededBy: null, observationRefs: obs.map((o) => ({ id: o.id, version: o.version })), participantNoticeAt: null,
      accessedAt: accessed && Date.parse(accessed) < Date.parse("2026-10-05T07:00:00.000Z") ? accessed : null,
    });
    ep.reportVersionIds.push(id);
    if (flagged) ep.flagAckBy = "neil";
  });
  // One historical correction: v1 superseded by v2, kept as history.
  const corrEp = releasedEps.find((e) => sessionDate(e) === "2026-09-21")!;
  {
    const v1 = reportVersions.find((v) => v.episodeId === corrEp.id)!;
    const v2id = `${corrEp.id}-v2`;
    v1.status = "superseded";
    v1.supersededBy = v2id;
    reportVersions.push({
      ...v1, id: v2id, version: 2, status: "released", createdAt: "2026-10-02T09:10:00.000Z", releasedAt: "2026-10-02T11:25:00.000Z", releasedBy: "neil",
      correctionReason: "Displayed unit label for HbA1c corrected on the participant report (mmol/mol). Values unchanged. Sample correction for demonstration.",
      supersedes: v1.id, supersededBy: null, participantNoticeAt: "2026-10-02T11:26:00.000Z", accessedAt: null, releaseMode: "individual", flagAcknowledged: true,
      observationRefs: v1.observationRefs.map((x) => ({ ...x })),
    });
    corrEp.reportVersionIds.push(v2id);
  }

  /* ---- follow-ups ---- */
  const maeve = holdFor("PH-P-0003");
  followUps.push({
    id: "FU-0001", episodeId: maeve.id, personId: maeve.personId, programmeId: maeve.programmeId, kind: "urgent_clinical_contact", ownerId: "neil", assignedById: "neil",
    dueAt: "2026-10-05T08:00:00.000Z", status: "open", taskId: "TSK-0006",
    note: "Clinician-assigned contact after a nurse escalation at screening. Illustrative workflow, not a validated escalation protocol. Details sit in the clinical record.",
    attempts: [], escalations: [], outcome: null,
  });
  maeve.followUpIds.push("FU-0001");
  const sisk28 = releasedEps.filter((e) => sessionDate(e) === "2026-09-28");
  followUps.push({
    id: "FU-0002", episodeId: sisk28[0].id, personId: sisk28[0].personId, programmeId: sisk28[0].programmeId, kind: "routine_callback", ownerId: "liz", assignedById: "neil",
    dueAt: "2026-10-06T11:00:00.000Z", status: "open", taskId: "TSK-0015",
    note: "Routine call-back after release. Confirm the participant has read their advice. The report is released; this follow-up is a separate item.",
    attempts: [], escalations: [], outcome: null,
  });
  sisk28[0].followUpIds.push("FU-0002");
  followUps.push({
    id: "FU-0003", episodeId: sisk28[1].id, personId: sisk28[1].personId, programmeId: sisk28[1].programmeId, kind: "routine_callback", ownerId: "neil", assignedById: "neil",
    dueAt: "2026-09-30T14:00:00.000Z", status: "closed", taskId: "TSK-0016",
    note: "Routine call-back after release.",
    attempts: [{ at: "2026-09-30T13:20:00.000Z", by: "neil", channel: "phone", result: "spoke", note: "Spoke with participant." }], escalations: [],
    outcome: { code: "reached_advice_given", note: "Participant reached and advice discussed.", at: "2026-09-30T13:25:00.000Z", by: "neil", acknowledgedBy: "neil" },
  });
  sisk28[1].followUpIds.push("FU-0003");

  /* ---- batches ---- */
  const batchIds = Object.keys(BATCH_TIMES);
  const batches: ImportBatch[] = batchIds.map((id) => {
    const rows = rowsByBatch[id] || [];
    const spec = new Set(rows.map((r) => r.episodeId || r.specimenKey));
    const baseline = id === BASELINE_BATCH_ID;
    return {
      id, lab: "Eurofins", filename: baseline ? "eurofins_results_2026-10-02_demo.csv" : `eurofins_results_${id.slice(6, 10)}-${id.slice(10, 12)}-${id.slice(12, 14)}_demo.csv`,
      receivedAt: BATCH_TIMES[id].received, processedAt: BATCH_TIMES[id].processed,
      specimenCount: baseline ? 24 : spec.size, source: "Eurofins Dublin CSV (FTP), held in Google Workspace. Simulated.",
      status: baseline ? "partial" : "complete",
      note: baseline ? "File dated 2 October, processed Monday morning. Three rows need explicit identity resolution." : "Imported in full. Simulated history.",
    };
  });
  const importRows = batchIds.flatMap((id) => rowsByBatch[id] || []);

  /* ---- data quality issues ---- */
  dqIssues.push(
    { id: "DQ-0001", title: "Displayed flag inconsistent with displayed limit", detail: "PH-E-0201: LDL 3.2 mmol/L with displayed limit <3.0 appeared as normal in the legacy summary. Pulse shows Review required. A clinician must review. No replacement threshold is proposed.",
      episodeId: "PH-E-0201", kind: "flag_inconsistency", status: "open", raisedByAgent: "quality", raisedAt: "2026-10-05T05:40:00.000Z" },
    { id: "DQ-0002", title: "Source unit differs from template unit", detail: "PH-E-0104: LDL reported in mg/dL where the template expects mmol/L. The value is held as received until the laboratory confirms the unit.",
      episodeId: "PH-E-0104", kind: "source_unit", status: "open", raisedByAgent: "quality", raisedAt: "2026-10-05T05:41:00.000Z" },
    { id: "DQ-0003", title: "Incompatible specimen identifier", detail: "Row BATCH-20261002-01 specimen key PH-S-O202 does not match any collection record format. Possible letter O for zero. Suggestion only.",
      episodeId: null, kind: "identifier", status: "open", raisedByAgent: "quality", raisedAt: "2026-10-05T05:42:00.000Z" },
    { id: "DQ-0004", title: "Retired template version references an older block", detail: "Comprehensive (LAB) Screen v1.0 references Blood Pressure 1.1. The current block is 1.2. No active episode uses v1.0.",
      episodeId: null, kind: "stale_template", status: "acknowledged", raisedByAgent: "quality", raisedAt: "2026-09-28T10:00:00.000Z" },
  );

  return { episodes, specimens, observations, batches, importRows, reportVersions, followUps, dqIssues, duplicateEpisodeIds, episodeByPerson };
}
