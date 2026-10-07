/* Interpretation shared by fixtures, selectors and actions, so a band means the same thing on every
   screen: one classifier per result, the calculated cholesterol values, measurement bands and the
   list of reasons an episode needs individual clinician review. Illustrative rule set v0.1,
   clinician-owned (RULE_SET_LABEL). Pure functions: no state, no randomness. */
import type { AnalyteCode, Band, ClinicalCapture, Iso, NurseReferral, Observation, ObservationFlag, Person, QriskResult } from "./types";
import { ANALYTES, bandDetail, bmiCategory, bpCategory, formatResult, limitTextFor, relativeRiskBand, waistCategory } from "./constants";
import type { BandCtx, BandDirection } from "./constants";
import { ecgBand, isNurseReferral, urineBand } from "./capture";
import { ageOn, localDateOf, roundHalfUp } from "./time";

/** Sex and age at collection for one episode. */
export function bandCtxFor(person: Pick<Person, "sex" | "dob">, collectedAt: Iso): BandCtx {
  return { sex: person.sex, age: ageOn(person.dob, localDateOf(collectedAt)) };
}

/** Band, flag and the applicable limit text for one result. Use this wherever an observation is created. */
export function classifyResult(code: AnalyteCode, value: number, ctx: BandCtx): { band: Band; flag: ObservationFlag; limitText: string; direction: BandDirection } {
  const d = bandDetail(code, value, ctx);
  return { band: d.band, direction: d.direction, flag: d.band === "borderline" || d.band === "abnormal" ? "review_required" : "none", limitText: limitTextFor(code, ctx) };
}

/** A qualitative result word as received (FIT "Negative" or "Positive") to its stored number, or null. */
export function parseResultText(code: AnalyteCode, text: string): { value: number; valueText: string | null } | null {
  const q = ANALYTES[code].qualitative;
  if (q) {
    const t = text.trim().toLowerCase();
    if (t === q.normal.toLowerCase()) return { value: 0, valueText: q.normal };
    if (t === q.abnormal.toLowerCase()) return { value: 1, valueText: q.abnormal };
    return null;
  }
  const n = Number(text);
  return Number.isFinite(n) ? { value: n, valueText: null } : null;
}
/** The text a laboratory row carries for a value. */
export const resultRowText = (code: AnalyteCode, value: number, valueText?: string | null) => formatResult(code, value, valueText);

/**
 * Non-HDL cholesterol (total minus HDL) and the total to HDL ratio, calculated from the latest total
 * and HDL results. Never stored and never an expected test: present only when both inputs are
 * results in mmol/L with no unconfirmed unit question.
 */
export function calculatedObservations(episodeId: string, latest: Observation[], ctx: BandCtx): Observation[] {
  const tc = latest.find((o) => o.code === "TC"), hdl = latest.find((o) => o.code === "HDL");
  if (!tc || !hdl) return [];
  const ok = (o: Observation) => o.unit === "mmol/L" && !(o.unitDiscrepancy && !o.unitDiscrepancy.confirmed);
  if (!ok(tc) || !ok(hdl) || hdl.value <= 0) return [];
  const version = Math.max(tc.version, hdl.version);
  const recordedAt = tc.recordedAt > hdl.recordedAt ? tc.recordedAt : hdl.recordedAt;
  const make = (code: "NONHDL" | "TCHDL", value: number): Observation => {
    const c = classifyResult(code, value, ctx);
    const a = ANALYTES[code];
    return {
      id: `CALC-${episodeId}-${code}`, episodeId, specimenId: tc.specimenId, code, value, valueText: null, unit: a.unit, limitText: c.limitText, flag: c.flag, band: c.band,
      legacyDisplayedFlag: null, source: { kind: "calc", from: ["TC", "HDL"], method: a.calculated!.method }, recordedAt, unitDiscrepancy: null, original: null, version,
    };
  };
  return [make("NONHDL", roundHalfUp(tc.value - hdl.value, 1)), make("TCHDL", roundHalfUp(tc.value / hdl.value, 2))];
}

/* ---- measurements ---- */
export interface MeasurementBand { key: "bp" | "bmi" | "waist" | "ecg" | "urine_glucose" | "urine_protein" | "urine_blood" | "urine_wcc"; label: string; band: Band; word: string; text: string }
export function bmiFromCapture(c: ClinicalCapture | null | undefined): number | null {
  if (!c) return null;
  const h = c.measures.heightM, w = c.measures.weightKg;
  if (h.state !== "recorded" || w.state !== "recorded" || h.value == null || w.value == null) return null;
  if (h.value < 1.0 || h.value > 2.3 || w.value < 25 || w.value > 300) return null;
  return roundHalfUp(w.value / (h.value * h.value), 1);
}
/** Bands for blood pressure, BMI, waist, ECG and each dipstick result, under the illustrative rule set. */
export function measurementBands(c: ClinicalCapture, sex: Person["sex"]): MeasurementBand[] {
  const m = c.measures;
  const sys = m.bpSys.state === "recorded" ? m.bpSys.value : null, dia = m.bpDia.state === "recorded" ? m.bpDia.value : null;
  const bp = bpCategory(sys, dia);
  const bmi = bmiFromCapture(c);
  const b = bmiCategory(bmi);
  const waist = waistCategory(m.waistCm.state === "recorded" ? m.waistCm.value : null, sex);
  const out: MeasurementBand[] = [
    { key: "bp", label: "Blood pressure", band: bp.band, word: bp.word, text: sys != null && dia != null ? `${sys}/${dia} mmHg` : "Not recorded" },
    { key: "bmi", label: "BMI", band: b.band, word: b.word, text: bmi != null ? bmi.toFixed(1) : "Not calculated" },
    { key: "waist", label: "Waist", band: waist.band, word: waist.word, text: m.waistCm.state === "recorded" && m.waistCm.value != null ? `${m.waistCm.value} cm` : "Not recorded" },
  ];
  const e = ecgBand(c);
  out.push({ key: "ecg", label: "ECG", band: e, word: e === "normal" ? "NORMAL" : e === "borderline" ? "BORDERLINE" : e === "abnormal" ? "ABNORMAL" : "NOT TESTED",
    text: c.form?.ecg === "Done" ? String(c.form?.ecgAdvice || "Advice not recorded") + (c.form?.manualPulse ? `, manual pulse ${String(c.form.manualPulse).toLowerCase()}` : "") : c.form?.ecg === "Not Done" ? "Not done" : "Not recorded" });
  const u = c.urine;
  for (const [k, label] of [["glucose", "Urine glucose"], ["protein", "Urine protein"], ["blood", "Urine blood"], ["wcc", "Urine white cells"]] as const) {
    const v = u ? u[k] : undefined;
    const band = urineBand(v, k);
    out.push({ key: `urine_${k}`, label, band, word: band === "normal" ? "NORMAL" : band === "borderline" ? "BORDERLINE" : band === "abnormal" ? "RAISED" : "NOT TESTED", text: v || "Not recorded" });
  }
  return out;
}

/* ---- why an episode needs individual review ---- */
export interface FlagReason {
  kind: "observation" | "blood_pressure" | "measurement" | "urinalysis" | "ecg" | "qrisk" | "nurse_referral";
  code?: AnalyteCode;
  /** Measurement key for non-laboratory reasons. */
  key?: string;
  band?: Band;
  /** Short name, for example "LDL cholesterol" or "Blood pressure". */
  label: string;
  text: string;
}
/**
 * Every reason an episode is not "all normal": a laboratory result (including the calculated
 * cholesterol values) that is borderline or abnormal, a blood pressure, BMI, waist, ECG or dipstick
 * result outside normal, a QRISK3 relative risk of 1.0 or more, or a nurse referral. Any reason means
 * individual review: no routine release shortcut.
 */
export function reviewReasons(input: { capture: ClinicalCapture; observations: Observation[]; sex: Person["sex"]; qrisk: QriskResult | null; nurseReferral: NurseReferral | null }): FlagReason[] {
  const out: FlagReason[] = [];
  for (const o of input.observations) {
    if (o.flag !== "review_required") continue;
    const a = ANALYTES[o.code];
    const value = formatResult(o.code, o.value, o.valueText);
    out.push({ kind: "observation", code: o.code, band: o.band, label: a.name, text: `${a.name} ${value}${a.unit && a.unit !== "ratio" ? " " + o.unit : ""}, ${o.band === "abnormal" ? "abnormal" : "borderline"}, displayed limit ${o.limitText}` });
  }
  for (const mb of measurementBands(input.capture, input.sex)) {
    if (mb.band !== "borderline" && mb.band !== "abnormal") continue;
    const kind: FlagReason["kind"] = mb.key === "bp" ? "blood_pressure" : mb.key === "ecg" ? "ecg" : mb.key.startsWith("urine_") ? "urinalysis" : "measurement";
    out.push({ kind, key: mb.key, band: mb.band, label: mb.label, text: `${mb.label} ${mb.text}, ${mb.word.toLowerCase()}` });
  }
  const rr = input.qrisk?.relativeRisk ?? null;
  const rrBand = relativeRiskBand(rr);
  if (rrBand === "borderline" || rrBand === "abnormal") out.push({ kind: "qrisk", key: "qrisk_rr", band: rrBand, label: "QRISK3 relative risk", text: `QRISK3 relative risk ${rr!.toFixed(1)} (sample output), ${rrBand}` });
  if (input.nurseReferral || isNurseReferral(input.capture)) out.push({ kind: "nurse_referral", key: "nurse_referral", band: "abnormal", label: "Nurse referral", text: "Nurse referral at screening: review before release" });
  return out;
}
