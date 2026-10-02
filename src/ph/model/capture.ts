/* Clinical capture rules shared by the nurse workspace and the reducer.
   Legitimate abnormal values are accepted and flagged for review later. They are never
   forced into a normal range. A blank is not zero, and missing, not done and declined
   stay distinct. */
import type { ClinicalCapture, Measure } from "./types";

export type MeasureKey = keyof ClinicalCapture["measures"];

export const MEASURE_RULES: Record<MeasureKey, { label: string; unit: string; min: number; max: number; required: boolean; decimals: number }> = {
  heightM: { label: "Height", unit: "m", min: 1.0, max: 2.3, required: true, decimals: 2 },
  weightKg: { label: "Weight", unit: "kg", min: 25, max: 300, required: true, decimals: 1 },
  waistCm: { label: "Waist", unit: "cm", min: 40, max: 220, required: false, decimals: 0 },
  bpSys: { label: "Systolic blood pressure", unit: "mmHg", min: 60, max: 260, required: true, decimals: 0 },
  bpDia: { label: "Diastolic blood pressure", unit: "mmHg", min: 30, max: 160, required: true, decimals: 0 },
  pulse: { label: "Pulse", unit: "bpm", min: 30, max: 220, required: false, decimals: 0 },
};
export const MEASURE_KEYS = Object.keys(MEASURE_RULES) as MeasureKey[];

/** Why a typed value is not acceptable, or null. Blank is allowed here and handled as missing. */
export function measureError(key: MeasureKey, value: number | null): string | null {
  if (value === null) return null;
  const r = MEASURE_RULES[key];
  if (!Number.isFinite(value)) return `${r.label} must be a number.`;
  if (value < r.min || value > r.max) return `${r.label} must be between ${r.min} and ${r.max} ${r.unit}.`;
  return null;
}

export function captureErrors(c: ClinicalCapture): Partial<Record<MeasureKey | "bp", string>> {
  const out: Partial<Record<MeasureKey | "bp", string>> = {};
  for (const k of MEASURE_KEYS) {
    const m = c.measures[k];
    if (m.state === "recorded") { const e = measureError(k, m.value); if (e) out[k] = e; }
  }
  const s = c.measures.bpSys, d = c.measures.bpDia;
  if (s.state === "recorded" && d.state === "recorded" && s.value != null && d.value != null && s.value <= d.value) out.bp = "Systolic must be higher than diastolic.";
  return out;
}

/** A recorded state with no value is a blank, and a blank is missing, never zero. */
export const isBlankMeasure = (m: Measure): boolean => m.state === "missing" || (m.state === "recorded" && (m.value === null || m.value === undefined));

/** Required fields that are still missing. Not done and declined count as accounted for. */
export function captureMissing(c: ClinicalCapture): MeasureKey[] {
  return MEASURE_KEYS.filter((k) => MEASURE_RULES[k].required && isBlankMeasure(c.measures[k]));
}

export const measure = (value: number | null, state: Measure["state"] = "recorded", provenance: Measure["provenance"] = "measured"): Measure => ({ value, state, provenance });

export const IDENTITY_HELP = "Confirm two identifiers from the participant. A name match alone is never enough.";

/** True for a real calendar date in YYYY-MM-DD form. 2026-02-31 is not one. */
export function isRealDate(iso: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  if (!m) return false;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

/** dd/mm/yyyy typed by a nurse to an ISO date, or null. Impossible dates such as 31/02 are rejected. */
export function parseIrishDate(s: string): string | null {
  const m = /^\s*(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\s*$/.exec(s);
  if (!m) return null;
  const d = Number(m[1]), mo = Number(m[2]), y = Number(m[3]);
  const iso = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return isRealDate(iso) ? iso : null;
}
