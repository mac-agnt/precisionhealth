/* Deterministic clinical fixtures: episodes, specimens, observations, laboratory import
   batches and rows, report versions, follow-ups and data quality issues.
   Sample values are illustrative and labelled as such in the UI.
   Lipids and HbA1c arrive in the per-day core batches (the baseline batch BATCH-20261002-01 keeps
   exactly its 120 rows); every other Comprehensive panel analyte arrives in a separate, fully
   imported extended batch per lab day. New values come from separate seeded generators, so the
   earlier per-episode sequences (and with them the baseline story) are unchanged. */
import type {
  AnalyteCode, ClinicalCapture, DqIssue, Episode, FollowUp, Hold, Id, ImportBatch, ImportRow, Measure, NurseFormValue, Observation, Person, QriskResult, ReportVersion, Specimen,
} from "../types";
import { ANALYTES, CORE_PANEL, EXTENDED_PANEL, FORM_TEMPLATES, PROGRAMME_BY_ID, STAFF_BY_ID, expectedPanel, rangeFor, waistCategory } from "../constants";
import type { BandCtx } from "../constants";
import { NURSE_REFERRAL_VALUE, nurseFormPrefill } from "../capture";
import { bandCtxFor, calculatedObservations, classifyResult, resultRowText, reviewReasons } from "../interpret";
import { dublinToUtc, fmtNumericDate, localTimeOf } from "../time";
import type { Iso } from "../time";
import { makeRng } from "../rng";
import type { Rng } from "../rng";
import { ADVICE_FLAGGED, ADVICE_ROUTINE } from "../advice";
import type { Answers } from "../questionnaire";
import { healthyArchetype, pad } from "./people";
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

/** The extended panel batch for each lab day, with times just before that day's core batch. */
export const EXTENDED_BATCH_ID = "BATCH-20261002-02";
const extendedBatchFor = (coreBatchId: string) => (coreBatchId === EARLY_BATCH_ID || coreBatchId === BASELINE_BATCH_ID ? EXTENDED_BATCH_ID : coreBatchId.replace(/-01$/, "-02"));
const EXT_BATCH_TIMES: Record<string, { received: Iso; processed: Iso }> = {};
for (const [id, t] of Object.entries(BATCH_TIMES)) {
  if (id === EARLY_BATCH_ID || id === BASELINE_BATCH_ID) continue;
  EXT_BATCH_TIMES[extendedBatchFor(id)] = { received: new Date(Date.parse(t.received) - 25 * 60000).toISOString(), processed: new Date(Date.parse(t.processed) - 25 * 60000).toISOString() };
}
// The 1 October clinics: extended results processed on 2 October, before any of those reports was released.
EXT_BATCH_TIMES[EXTENDED_BATCH_ID] = { received: "2026-10-02T09:40:00.000Z", processed: "2026-10-02T10:05:00.000Z" };

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;
const fmtValue = (code: AnalyteCode, v: number) => resultRowText(code, v);

/** The lipid and HbA1c values. VITD and FERR are still drawn so each episode's sequence matches earlier versions; the extended generator sets their reported values. */
type Panel = Record<"TC" | "HDL" | "LDL" | "TG" | "HBA1C" | "VITD" | "FERR", number>;
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
/** All five core values normal, including the calculated non-HDL (below 3.8) and total to HDL ratio (below 4.0). */
function routinePanel(r: Rng): Panel {
  const p = drawPanel(r);
  p.TC = Math.min(p.TC, 4.9);
  p.HDL = Math.max(p.HDL, 1.1, Math.ceil((p.TC / 3.85) * 10) / 10);
  if (p.TC - p.HDL > 3.6) p.TC = r1(p.HDL + 3.6);
  p.LDL = Math.min(p.LDL, 2.9);
  p.TG = Math.min(p.TG, 1.6);
  p.HBA1C = Math.min(p.HBA1C, 41);
  return p;
}
/** LDL is part of non-HDL cholesterol: keep LDL at or below total minus HDL minus TG/2.2, raising total cholesterol when LDL was forced high. */
function harmonise(p: Panel, ldlForced: boolean): void {
  const room = r1(p.TC - p.HDL - p.TG / 2.2);
  if (ldlForced) { if (p.LDL > room) p.TC = r1(p.LDL + p.HDL + p.TG / 2.2); }
  else if (p.LDL > room) p.LDL = Math.max(0.5, room);
}
const FORCE: Record<"TC" | "HDL" | "LDL" | "TG" | "HBA1C", (r: Rng) => number> = {
  TC: (r) => r1(5.3 + r.next() * 0.8),
  HDL: (r) => r1(0.7 + r.next() * 0.25),
  LDL: (r) => r1(3.2 + r.next() * 0.9),
  TG: (r) => r1(2.1 + r.next() * 0.9),
  HBA1C: (r) => Math.round(43 + r.next() * 6),
};
const FLAG_SETS: Array<Array<keyof typeof FORCE>> = [["LDL"], ["TG", "HBA1C"], ["TC", "LDL"], ["HDL"], ["HBA1C"], ["TG"], ["LDL", "TG"]];

/* ---- extended panel generator: realistic centres, a safe normal interval and the usual direction when out of range ---- */
interface Gen { mean: number | ((ctx: BandCtx) => number); sd: number; off: number; dir: "high" | "low" }
const GEN: Partial<Record<AnalyteCode, Gen>> = {
  UREA: { mean: 5.0, sd: 1.1, off: 0.012, dir: "high" },
  CREAT: { mean: (c) => (c.sex === "male" ? 85 : 68), sd: 11, off: 0.01, dir: "high" },
  URATE: { mean: (c) => (c.sex === "male" ? 340 : 270), sd: 45, off: 0.02, dir: "high" },
  HB: { mean: (c) => (c.sex === "male" ? 15.0 : c.sex === "female" ? 13.6 : 14.5), sd: 0.8, off: 0.012, dir: "low" },
  WCC: { mean: 6.4, sd: 1.4, off: 0.01, dir: "high" },
  PLT: { mean: 260, sd: 50, off: 0.008, dir: "high" },
  BILI: { mean: 9, sd: 4, off: 0.015, dir: "high" },
  TPROT: { mean: 72, sd: 4, off: 0.005, dir: "high" },
  ALP: { mean: 75, sd: 18, off: 0.01, dir: "high" },
  GGT: { mean: (c) => (c.sex === "male" ? 28 : 20), sd: 10, off: 0.03, dir: "high" },
  AST: { mean: 22, sd: 5, off: 0.015, dir: "high" },
  ALT: { mean: (c) => (c.sex === "male" ? 26 : 19), sd: 8, off: 0.03, dir: "high" },
  FT4: { mean: 14, sd: 1.8, off: 0.01, dir: "low" },
  TSH: { mean: 1.9, sd: 0.7, off: 0.02, dir: "high" },
  IRON: { mean: 18, sd: 5, off: 0.012, dir: "low" },
  FERR: { mean: (c) => (c.sex === "male" ? 140 : 70), sd: 40, off: 0.03, dir: "low" },
  TIBC: { mean: 60, sd: 6, off: 0.008, dir: "high" },
  VITD: { mean: 66, sd: 15, off: 0.08, dir: "low" },
  B12: { mean: 420, sd: 120, off: 0.012, dir: "low" },
  FOLATE: { mean: 8, sd: 3, off: 0.012, dir: "low" },
  CA: { mean: 2.38, sd: 0.07, off: 0.006, dir: "high" },
  MG: { mean: 0.85, sd: 0.06, off: 0.006, dir: "low" },
  PO4: { mean: 1.1, sd: 0.15, off: 0.006, dir: "low" },
  PSA: { mean: (c) => (c.age < 50 ? 0.7 : c.age < 60 ? 1.0 : c.age < 70 ? 1.4 : 1.8), sd: 0.35, off: 0.04, dir: "high" },
};
const roundTo = (code: AnalyteCode, v: number) => { const f = Math.pow(10, ANALYTES[code].decimals); return Math.round(v * f) / f; };
/** A value strictly inside this person's normal range, with a margin, or (mixed mode, by chance) just outside it. */
function extendedValue(code: AnalyteCode, x: Rng, ctx: BandCtx, mixed: boolean): number {
  if (code === "FIT") return mixed && x.next() < 0.03 ? 1 : 0;
  const g = GEN[code]!;
  const b = rangeFor(code, ctx)!;
  const mean = typeof g.mean === "function" ? g.mean(ctx) : g.mean;
  const hi = b.hi !== undefined ? b.hi : mean * 3, lo = b.lo !== undefined ? b.lo : mean * 0.25;
  const off = mixed && x.next() < g.off;
  const draw = x.normal(mean, g.sd);
  if (off) {
    const v = g.dir === "high" && b.hi !== undefined ? b.hi * (1.03 + x.next() * 0.3) : b.lo !== undefined ? b.lo * (0.97 - x.next() * 0.3) : b.hi! * (1.03 + x.next() * 0.3);
    return roundTo(code, v);
  }
  const w = hi - lo;
  return roundTo(code, clamp(draw, lo + w * 0.06, hi - w * 0.06));
}

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
      peakFlow: measure(null, "missing"),
    },
    urine: null, notes: "", form: {}, ecgReview: null, checklist: {}, savedAt: null, rev: 0, checkedInAt: null, completedAt: null,
  };
  void personDob; void bookingId;
}

/**
 * A completed nurse capture. The draws from r keep their earlier order. routine keeps every
 * measurement in its normal band (ideal blood pressure, BMI 19.5 to 24.5, waist under the limit).
 */
function completedCapture(r: Rng, person: Person, bookingId: string, collectedAt: Iso, o: { routine: boolean; x: Rng; bp?: { sys: number; dia: number }; fixed?: { h: number; w: number; sys: number; dia: number } }): ClinicalCapture {
  const { fixed, bp } = o;
  const h = fixed ? fixed.h : r2(clamp(r.normal(person.sex === "female" ? 1.65 : 1.76, 0.07), 1.5, 2.0));
  let w = fixed ? fixed.w : r1(clamp(r.normal(person.sex === "female" ? 70 : 84, 12), 48, 130));
  let sys = fixed ? fixed.sys : bp ? bp.sys : Math.round(clamp(r.normal(118, 10), 98, 138));
  let dia = fixed ? fixed.dia : bp ? bp.dia : Math.round(clamp(r.normal(75, 7), 58, 88));
  let waist = Math.round(clamp(r.normal(person.sex === "male" ? 92 : 82, 10), 62, 130));
  const pulse = Math.round(clamp(r.normal(70, 9), 50, 100));
  if (o.routine) {
    w = r1(clamp(w, 19.6 * h * h, 24.4 * h * h));
    waist = Math.min(waist, waistCategory(null, person.sex).limit - 4 - Math.round(o.x.next() * 6));
    sys = Math.min(sys, 112 + Math.round(o.x.next() * 6));
    dia = Math.min(dia, 70 + Math.round(o.x.next() * 7));
  }
  const peak = person.sex === "female" ? clamp(o.x.normal(420, 50), 280, 560) : clamp(o.x.normal(560, 65), 350, 750);
  const peakNotDone = !o.routine && o.x.next() < 0.08;
  const done = new Date(Date.parse(collectedAt) + 11 * 60000).toISOString();
  return {
    status: "complete",
    identity: [
      { key: "dob", label: "Date of birth", confirmedValue: fmtNumericDate(person.dob), confirmed: true },
      { key: "booking", label: "Booking reference", confirmedValue: bookingId, confirmed: true },
    ],
    measures: {
      heightM: measure(h, "recorded", "self_reported"), weightKg: measure(w), waistCm: measure(waist),
      bpSys: measure(sys), bpDia: measure(dia), pulse: measure(pulse),
      peakFlow: peakNotDone ? measure(null, "not_done") : measure(Math.round(peak / 10) * 10),
    },
    urine: { protein: "Nil", glucose: "Nil", blood: "Nil", wcc: "Nil" },
    notes: "",
    form: {},
    ecgReview: null,
    checklist: { identity: true, questionnaire: true, measurements: true, specimens: true, labels: true },
    savedAt: done, rev: 3, checkedInAt: collectedAt, completedAt: done,
  };
}

/**
 * The rest of the nurse form for a seeded episode: questionnaire answers carried across, and the
 * nurse's own fields (ECG, urinalysis, FIT and PSA decisions, close-out). Deterministic per episode.
 */
function seedNurseForm(cap: ClinicalCapture, x: Rng, o: { person: Person; answers: Answers; age: number; site: string; employer: string; nurseName: string; routine: boolean; mixed: boolean; collectedAt: Iso }): void {
  const { person, answers: a, age } = o;
  const form: Record<string, NurseFormValue> = { ...nurseFormPrefill(a, { site: o.site, employer: o.employer, sex: person.sex, clinician: o.nurseName }) };
  form.emailE = null;
  form.smokingHistory = a.smokesCigarettes === "Ex-smoker" ? `Stopped ${x.int(2, 15)} years ago.` : a.smokesCigarettes === "Yes" ? "Current smoker." : null;
  // Bowel: FIT for those over 50 or with a risk factor; an informed choice otherwise.
  const bowelRisk = a.bloodInStool === true || a.bowelHabitChange === true || a.famHistoryBowel === true;
  const fitRoll = x.next();
  form.fitKit = bowelRisk ? "Yes" : age >= 50 ? (fitRoll < 0.6 ? "Yes" : fitRoll < 0.7 ? "Recommended but declined" : "No") : fitRoll < 0.04 ? "Yes" : "No";
  if (form.fitKit === "Yes" && !bowelRisk) form.fitInformedChoice = "Yes";
  // PSA: men over 45, or a younger man who asks.
  if (person.sex === "male") {
    const psaRoll = x.next();
    if (age <= 45) {
      form.psaRequested = psaRoll < 0.03;
      if (form.psaRequested) { form.psaFamilyHistory = false; form.psaAfroCaribbean = false; form.psaSymptoms = "None of these"; form.psaTaken = "Yes"; form.psaInformedChoice = "Yes"; }
    } else {
      const risk = form.psaFamilyHistory === true || form.psaAfroCaribbean === true || (typeof form.psaSymptoms === "string" && form.psaSymptoms !== "None of these");
      form.psaTaken = risk ? "Yes" : psaRoll < 0.45 ? "Yes" : psaRoll < 0.6 ? "Offered but declined" : "No";
      if (form.psaTaken === "Yes" && !risk) form.psaInformedChoice = "Yes";
    }
  }
  // Measurements.
  form.muscularPhysique = !o.routine && x.next() < (person.sex === "male" ? 0.08 : 0.02) ? "Yes" : "No";
  // ECG.
  const pulse = cap.measures.pulse.value ?? 70;
  const ecgDone = o.routine || x.next() > 0.03;
  form.ecg = ecgDone ? "Done" : "Not Done";
  if (ecgDone) {
    const roll = x.next();
    form.ecgAdvice = pulse > 100 ? "B Fast heart rate" : pulse < 50 ? "F Slow heart rate" : o.mixed && roll < 0.02 ? "L Deviating waveform" : o.mixed && roll < 0.03 ? "12-Lead borderline" : "a Stable waveform (normal)";
    form.ecgTime = localTimeOf(new Date(Date.parse(o.collectedAt) + 6 * 60000).toISOString());
    form.ecgMachine = "ECG unit 2 (demo)";
  }
  form.ecgComment = a.strokeOrMi === true ? "Previous cardiac event reported. No current symptoms." : "No symptoms. No cardiac history.";
  form.manualPulse = "Regular";
  // Urinalysis.
  const urineDone = o.routine || x.next() > 0.05;
  form.urinalysis = urineDone ? "Complete" : "Not done";
  if (!urineDone) cap.urine = { protein: "Not done", glucose: "Not done", blood: "Not done", wcc: "Not done" };
  else if (o.mixed) {
    const u = cap.urine!;
    if (a.diabetesType2 === true || a.diabetesType1 === true) u.glucose = "+";
    if (person.sex === "female" && x.next() < 0.04) { u.blood = "+"; form.menstruating = true; }
    if (x.next() < 0.02) u.protein = "+";
  }
  if (person.sex === "female" && form.urinalysis === "Complete" && form.menstruating === undefined) form.menstruating = false;
  // Close-out.
  form.bloodsTaken = "Yes";
  form.approve = "Yes";
  if (!form.medications) form.medications = "nil";
  form.advice = null;
  cap.form = form;
  const comments: string[] = [];
  if ((cap.measures.bpSys.value ?? 0) >= 140 || (cap.measures.bpDia.value ?? 0) >= 90) comments.push("Blood pressure repeated after five minutes seated; second reading recorded.");
  if (form.muscularPhysique === "Yes") comments.push("Muscular build noted, so BMI is less informative.");
  if (form.ecg === "Not Done") comments.push("ECG not done: participant short of time.");
  if (form.urinalysis === "Not done") comments.push("Unable to provide a urine sample today.");
  cap.notes = comments.length ? comments.join(" ") : "No problems with the screening.";
}

/* ---- QRISK3 sample outputs ----
   Fixture-only heuristic so the sample outputs of the licensed engine look coherent (smokers,
   higher blood pressure and a higher total to HDL ratio get higher scores; heart age follows the
   relative risk). It is not QRISK3, it is never shown as a calculation and it never runs on data
   entered in a session. */
const HEALTHY: Record<"male" | "female", { a: number; b: number }> = { male: { a: 0.464, b: 0.0838 }, female: { a: 0.15, b: 0.09 } };
function sampleQrisk(x: Rng, o: { age: number; sex: Person["sex"]; answers: Answers; form: Record<string, NurseFormValue>; sbp: number | null; tc: number | null; hdl: number | null; bmi: number | null; routine: boolean }): QriskResult {
  const base = { source: "licensed_engine_sample" as const };
  if (o.age < 25) return { ...base, score10y: null, heartAge: null, relativeRisk: null, inputsComplete: o.tc !== null && o.hdl !== null, eligible: false, reason: "Not calculated under 25" };
  if (o.tc === null || o.hdl === null || o.sbp === null) return { ...base, score10y: null, heartAge: null, relativeRisk: null, inputsComplete: false, eligible: true, reason: "Waiting for cholesterol results" };
  const f = o.form, a = o.answers;
  let rr = 0.82;
  rr *= f.smoking === "Ex-smoker" ? 1.25 : f.smoking === "1-10 cigarettes per day" ? 1.8 : f.smoking === "11-20 cigarettes per day" ? 2.1 : f.smoking === "more than 20 cigarettes per day" ? 2.4 : 1;
  rr *= Math.exp(0.012 * Math.max(0, o.sbp - 115));
  rr *= 1 + 0.18 * Math.max(0, o.tc / o.hdl - 3.5);
  rr *= 1 + 0.03 * Math.max(0, (o.bmi ?? 24) - 24);
  const mult: Array<[string, number]> = [["famHistoryCvd", 1.45], ["diabetesType2", 1.8], ["diabetesType1", 2.5], ["treatedHypertension", 1.35], ["atrialFibrillation", 2.0], ["rheumatoidArthritis", 1.3], ["ckd", 1.6], ["severeMentalIllness", 1.2], ["oralSteroids", 1.3], ["migraine", 1.2], ["sle", 1.6], ["atypicalAntipsychotic", 1.3], ["erectileDysfunction", 1.3]];
  for (const [k, m] of mult) if (f[k] === true) rr *= m;
  if (f.strokeOrMi === "Yes") rr *= 1.5;
  rr *= 0.95 + x.next() * 0.1;
  if (o.routine) rr = Math.min(rr, 0.9);
  rr = Math.round(rr * 10) / 10;
  const h = HEALTHY[o.sex === "female" ? "female" : "male"];
  const healthy = h.a * Math.exp(h.b * (o.age - 25));
  const score = Math.round(clamp(healthy * rr, 0.1, 60) * 100) / 100;
  const heartAge = Math.round(clamp(25 + Math.log(score / h.a) / h.b, 18, 100));
  void a;
  return { ...base, score10y: score, heartAge, relativeRisk: rr, inputsComplete: true, eligible: true };
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

/** Unique ID in Precision Health's format, COMP0 and four digits, in episode order. */
export const screeningRefFor = (n: number) => `COMP0${pad(n, 4)}`;
export const FIRST_SCREENING_REF = 2601;
/** Expected tests the await_partial episodes are still waiting for (send-away tests). */
const PARTIAL_PENDING: AnalyteCode[] = ["VITD", "B12", "FOLATE", "PSA", "FIT"];

export function buildClinical(plan: RosterPlan): ClinicalBuild {
  const rng = makeRng("ph-demo-clinical-v1");
  const personById = new Map(plan.persons.map((p) => [p.id, p]));
  const bookingBy = new Map(plan.bookings.map((b) => [b.personId + "|" + b.sessionId, b]));
  const answersBy = new Map(plan.memberships.map((m) => [m.personId + "|" + m.programmeId, m.answers]));
  const sessionById = new Map(plan.sessions.map((x) => [x.id, x]));
  /** Extended-panel values and where they go, delivered after the core rows so core observation ids keep their numbers. */
  const extQueue: Array<{ ep: Episode; person: Person; values: Partial<Record<AnalyteCode, number>>; batchId: string; codes: AnalyteCode[] }> = [];
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

  const ctxOf = (ep: Episode) => bandCtxFor(personById.get(ep.personId)!, ep.collectedAt);
  const newObs = (ep: Episode, code: AnalyteCode, value: number, unit: string, source: Observation["source"], at: Iso, extra?: Partial<Observation>): Observation => {
    obsNo++;
    const c = classifyResult(code, value, ctxOf(ep));
    const q = ANALYTES[code].qualitative;
    const o: Observation = {
      id: `OBS-${pad(obsNo, 5)}`, episodeId: ep.id, specimenId: ep.specimenIds[0], code, value, valueText: q ? (value >= 1 ? q.abnormal : q.normal) : null, unit,
      limitText: c.limitText, flag: c.flag, band: c.band, legacyDisplayedFlag: null, source, recordedAt: at,
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

      // Routine review episodes, and the healthy share of released ones, are all-normal across the whole record.
      const routineRole = role === "ready_batch_routine" || role === "ready_aged_routine" || (role === "released" && healthyArchetype(pid));
      const x = makeRng("ph-demo-extended-v1-" + epId);
      const ctx = bandCtxFor(person, collectedAt);
      const answers = answersBy.get(pid + "|" + s.programmeId) || {};

      // Clinical capture with fixed values for the two demonstration people.
      let capture: ClinicalCapture;
      if (pid === "PH-P-0001") capture = completedCapture(r, person, booking.id, collectedAt, { routine: true, x, fixed: { h: 1.7, w: 65, sys: 116, dia: 74 } });
      else if (pid === "PH-P-0501") capture = completedCapture(r, person, booking.id, collectedAt, { routine: false, x, fixed: { h: 1.78, w: 84.5, sys: 126, dia: 80 } });
      else if (flaggedRole && !bpFlaggedDone && role === "ready_batch_flagged") { bpFlaggedDone = true; capture = completedCapture(r, person, booking.id, collectedAt, { routine: false, x, bp: { sys: 148, dia: 94 } }); }
      else {
        const hiBp = r.chance(0.04);
        capture = completedCapture(r, person, booking.id, collectedAt, { routine: routineRole, x, bp: hiBp && !routineRole ? { sys: 142, dia: 91 } : undefined });
      }
      const mixed = role === "released" && !routineRole;
      seedNurseForm(capture, x, { person, answers, age: ctx.age, site: person.site, employer: PROGRAMME_BY_ID[s.programmeId].clientName, nurseName: STAFF_BY_ID[s.nurseId].name, routine: routineRole, mixed, collectedAt });

      // The earlier add-on draw is kept so this episode's random sequence is unchanged. Every Comprehensive episode now has the full panel.
      if (role === "released") r.chance(0.1);
      const codes = expectedPanel(FORM_SNAPSHOT().templateId, { psaTaken: capture.form.psaTaken === "Yes", fitGiven: capture.form.fitKit === "Yes" });
      const expected = codes.map((code) => ({ code, addOn: ANALYTES[code].addOn }));

      const reportState: Episode["reportState"] =
        role === "released" ? "released" : role.startsWith("ready") ? "ready_for_review" : role.startsWith("await") ? "awaiting_results" : "on_hold";

      const ep: Episode = {
        id: epId, personId: pid, programmeId: s.programmeId, bookingId: booking.id, sessionId: s.id, collectedAt,
        formSnapshot: FORM_SNAPSHOT(), capture, specimenIds: [specId], expectedTests: expected, reportState, hold: null, readyAt: null,
        reviewAssigneeId: reportState === "ready_for_review" || reportState === "on_hold" ? "neil" : null,
        reportVersionIds: [], followUpIds: [], flagAckBy: null,
        screeningRef: screeningRefFor(FIRST_SCREENING_REF + episodes.length), qrisk: null, nurseReferral: null,
      };
      episodes.push(ep);
      specimens.push({ id: specId, episodeId: epId, type: "serum", collectedAt, status: role === "await_none" ? "collected" : "received", labelPrinted: true });

      // Values for this person.
      let panel: Panel;
      if (pid === "PH-P-0001") panel = { TC: 4.4, HDL: 1.6, LDL: 2.3, TG: 0.9, HBA1C: 34, VITD: 70, FERR: 95 };
      else if (pid === "PH-P-0501") panel = { TC: 4.9, HDL: 1.3, LDL: 3.2, TG: 1.2, HBA1C: 37, VITD: 70, FERR: 95 };
      else if (role === "released" && !routineRole) { panel = drawPanel(r); harmonise(panel, false); }
      else {
        panel = routinePanel(r);
        if (flagSet) flagSet.forEach((c) => (panel[c] = FORCE[c](r)));
        harmonise(panel, !!flagSet && flagSet.includes("LDL"));
      }
      // Extended panel: all normal except on released episodes, where an occasional value is out of range.
      const ext: Partial<Record<AnalyteCode, number>> = {};
      for (const code of codes) if (!CORE_PANEL.includes(code)) ext[code] = extendedValue(code, x, ctx, mixed);

      // QRISK3 sample output once total and HDL cholesterol are in (not for Eoin, whose HDL row is held).
      const lipidsIn = role !== "await_none" && pid !== "PH-P-0701";
      const bmi = capture.measures.heightM.value && capture.measures.weightKg.value ? capture.measures.weightKg.value / (capture.measures.heightM.value * capture.measures.heightM.value) : null;
      ep.qrisk = sampleQrisk(x, { age: ctx.age, sex: person.sex, answers, form: capture.form, sbp: capture.measures.bpSys.value, tc: lipidsIn ? panel.TC : null, hdl: lipidsIn ? panel.HDL : null, bmi, routine: routineRole || pid === "PH-P-0001" });
      if (pid === "PH-P-0701" && ep.qrisk.eligible) ep.qrisk.reason = "Waiting for the HDL cholesterol result held in the laboratory import";

      if (role === "released" || role.startsWith("ready_aged")) {
        const batchId = BATCH_FOR_SESSION[s.id];
        const t = BATCH_TIMES[batchId];
        CORE_PANEL.forEach((code) => {
          const row = addRow(batchId, {
            specimenKey: specId, analyteCode: code, valueText: fmtValue(code, panel[code as keyof Panel]), unit: ANALYTES[code].unit, resultAt: t.received,
            dobInFile: person.dob, nameInFile: `${person.family}, ${person.given[0]}`, state: "imported", episodeId: epId, observationId: null,
            quarantine: null, duplicateOfObservationId: null, resolution: null,
          });
          const o = newObs(ep, code, panel[code as keyof Panel], ANALYTES[code].unit, { kind: "batch", batchId, rowId: row.id }, t.processed);
          row.observationId = o.id;
        });
        extQueue.push({ ep, person, values: ext, batchId: extendedBatchFor(batchId), codes: codes.filter((c) => !CORE_PANEL.includes(c)) });
        const off = role.startsWith("ready_aged") ? 4 + (episodes.length % 7) : 0;
        ep.readyAt = new Date(Date.parse(t.processed) + off * 60000).toISOString();
      } else if (isBatch) {
        inBatch.push({ ep, role, dupHba1c: false, flagSet });
        (ep as Episode & { _panel?: Panel })._panel = panel;
        const pending = role === "await_partial" ? PARTIAL_PENDING : [];
        extQueue.push({ ep, person, values: ext, batchId: EXTENDED_BATCH_ID, codes: codes.filter((c) => !CORE_PANEL.includes(c) && !pending.includes(c)) });
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
      let valueText = fmtValue(code, panel[code as keyof Panel]);
      let unit = ANALYTES[code].unit;
      let specimenKey = specId;
      let dobInFile: string | null = person.dob;
      let nameInFile = name;
      let state: ImportRow["state"] = "imported";
      let quarantine: ImportRow["quarantine"] = null;
      let dupOf: string | null = null;
      let unitDisc: Observation["unitDiscrepancy"] = null;
      let original: Observation["original"] = null;
      let obsValue = panel[code as keyof Panel];

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
        // A value in an unconfirmed source unit is not classified until the laboratory confirms the unit.
        if (unitDisc) { o.flag = "none"; o.band = "not_tested"; o.limitText = ANALYTES[code].range.all?.text || o.limitText; }
        // The legacy spreadsheet-style summary showed this combination as normal.
        if (ep.personId === "PH-P-0501" && code === "LDL") o.legacyDisplayedFlag = "normal";
        row.observationId = o.id;
        imported++;
      }
    }
    if (x.role.startsWith("ready_batch")) ep.readyAt = new Date(Date.parse(T.processed) + rankSeconds++ * 3000).toISOString();
    void imported;
  }

  /* ---- extended panel batches: every other analyte, fully imported, one batch per lab day ---- */
  for (const q of extQueue) {
    const t = EXT_BATCH_TIMES[q.batchId];
    for (const code of q.codes) {
      const value = q.values[code]!;
      const row = addRow(q.batchId, {
        specimenKey: q.ep.specimenIds[0], analyteCode: code, valueText: fmtValue(code, value), unit: ANALYTES[code].unit, resultAt: t.received,
        dobInFile: q.person.dob, nameInFile: `${q.person.family}, ${q.person.given[0]}`, state: "imported", episodeId: q.ep.id, observationId: null,
        quarantine: null, duplicateOfObservationId: null, resolution: null,
      });
      row.observationId = newObs(q.ep, code, value, ANALYTES[code].unit, { kind: "batch", batchId: q.batchId, rowId: row.id }, t.processed).id;
    }
  }
  const obsByEp = new Map<Id, Observation[]>();
  for (const o of observations) { const l = obsByEp.get(o.episodeId); if (l) l.push(o); else obsByEp.set(o.episodeId, [o]); }
  // Specimen status from the expected tests now accounted for.
  for (const ep of episodes) {
    const have = new Set((obsByEp.get(ep.id) || []).map((o) => o.code));
    const spec = specimens.find((x) => x.id === ep.specimenIds[0])!;
    const n = ep.expectedTests.filter((t) => have.has(t.code)).length;
    spec.status = n === ep.expectedTests.length ? "resulted" : n > 0 || spec.status === "received" ? "received" : "collected";
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
  // Maeve: the nurse referred her to the doctor at screening. A symptom, not a number.
  {
    const m = holdFor("PH-P-0003");
    const nurse = sessionById.get(m.sessionId)!.nurseId;
    m.capture.form.approve = NURSE_REFERRAL_VALUE;
    m.capture.notes = "Participant reported intermittent chest tightness on exertion over the past two weeks. Referred to the doctor for review before any report is released.";
    m.capture.form.ecgComment = "Intermittent chest tightness on exertion for two weeks. No known cardiac history.";
    m.nurseReferral = { at: m.capture.completedAt || m.collectedAt, by: nurse, reason: NURSE_REFERRAL_VALUE, comment: m.capture.notes, taskId: "TSK-0006" };
  }

  /* ---- report versions for released episodes ---- */
  const releasedEps = episodes.filter((e) => e.reportState === "released");
  const sessionDate = (e: Episode) => plan.sessions.find((x) => x.id === e.sessionId)!.date;
  releasedEps.forEach((ep, i) => {
    const r = rng.fork("rv" + ep.id);
    const obs = obsByEp.get(ep.id) || [];
    const person = personById.get(ep.personId)!;
    const all = obs.concat(calculatedObservations(ep.id, obs, bandCtxFor(person, ep.collectedAt)));
    const flagged = reviewReasons({ capture: ep.capture, observations: all, sex: person.sex, qrisk: ep.qrisk, nurseReferral: ep.nurseReferral }).length > 0;
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
  const coreIds = Object.keys(BATCH_TIMES);
  const extIds = Object.keys(EXT_BATCH_TIMES);
  const batchIds = coreIds.concat(extIds);
  const dateOf = (id: string) => `${id.slice(6, 10)}-${id.slice(10, 12)}-${id.slice(12, 14)}`;
  const batches: ImportBatch[] = batchIds.map((id) => {
    const rows = rowsByBatch[id] || [];
    const spec = new Set(rows.map((r) => r.episodeId || r.specimenKey));
    const baseline = id === BASELINE_BATCH_ID;
    const extended = extIds.includes(id);
    const t = extended ? EXT_BATCH_TIMES[id] : BATCH_TIMES[id];
    return {
      id, lab: "Eurofins",
      filename: baseline ? "eurofins_results_2026-10-02_demo.csv" : extended ? `eurofins_extended_${dateOf(id)}_demo.csv` : `eurofins_results_${dateOf(id)}_demo.csv`,
      receivedAt: t.received, processedAt: t.processed,
      specimenCount: baseline ? 24 : spec.size, source: "Eurofins Dublin CSV (FTP), held in Google Workspace. Simulated.",
      status: baseline ? "partial" : "complete",
      note: baseline ? "File dated 2 October, processed Monday morning. Three rows need explicit identity resolution."
        : extended ? "Extended panel (full blood count, kidney, liver, thyroid, iron, vitamins and minerals, PSA and FIT where taken). Imported in full. Simulated history."
        : "Lipids and HbA1c. Imported in full. Simulated history.",
      kind: extended ? "extended" : "core",
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
