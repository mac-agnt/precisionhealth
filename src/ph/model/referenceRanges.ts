/* Health Screening reference ranges (client material: "Screening Reference Ranges: Developer Table",
   sent by Dr Neil Reddy after the 23 October 2026 call, kept in docs/client-source/REFERENCE_RANGES.md).

   One source of truth. Each test has versions; a version holds one row per patient cohort (sex, age,
   ethnicity, pregnancy) and each row holds up to six bands with explicit limits, each limit marked
   included or excluded, plus the descriptor word and colour printed for that band. The plain-language
   sentence ("Females, all ages, all ethnicities: below 15 LOW ...") is generated from the numbers, so
   it can never disagree with what the system uses.

   Rules the clinician asked for on the call:
   - A result is judged against the version in force on its effective date (sample date by default),
     and the version used is recorded, so a later change never silently re-labels an old result.
   - Only superadmins change ranges. Every change is a draft first, with a reason and a source,
     and is published by a superadmin. Old versions are kept, never overwritten.
   - Nothing here is decided by an agent.

   Defaults chosen where Precision Health has not answered yet are listed in RR_QUESTIONS and shown
   as "To confirm" on screen. Pure functions only: no state, no randomness. */
import type { AnalyteCode, Band, StaffId } from "./types";
import type { Iso, LocalDate } from "./time";

/* ---------- types ---------- */

export type RrBandKey = "low_severe" | "low_mild" | "normal" | "high_mild" | "high_severe" | "high_critical";
export const RR_BAND_ORDER: RrBandKey[] = ["low_severe", "low_mild", "normal", "high_mild", "high_severe", "high_critical"];

export interface RrBound { value: number; inclusive: boolean }
export interface RrBand {
  key: RrBandKey;
  /** Null: no lower limit. */
  min: RrBound | null;
  /** Null: no upper limit. */
  max: RrBound | null;
  /** The word printed on the report for this band, e.g. NORMAL, HIGH MILD, OVERWEIGHT. */
  label: string;
}

export type RrSex = "any" | "male" | "female";
export type RrPregnancy = "any" | "not_pregnant" | "pregnant";
export interface RrCohort {
  sex: RrSex;
  /** Age in whole years at the effective date. ageMin is included, ageMax is excluded. Null: open. */
  ageMin: number | null;
  ageMax: number | null;
  /** "any" or a list of ethnicity groups from RR_ETHNICITIES. */
  ethnicities: "any" | string[];
  pregnancy: RrPregnancy;
}

export interface RrRow {
  id: string;
  cohort: RrCohort;
  /** set: bands below apply. not_set: the client has not supplied this range yet. not_applicable: test not done for this cohort. */
  status: "set" | "not_set" | "not_applicable";
  bands: RrBand[];
  /** Qualitative tests: the expected (normal) result, e.g. Negative. */
  expected?: string;
  note?: string;
}

export type RrGroup = "Body measurements" | "Blood pressure and heart" | "Cholesterol" | "Blood sugar" | "Kidney" | "Liver and protein"
  | "Iron" | "Thyroid" | "Vitamins and minerals" | "Inflammation and hormones" | "Full blood count" | "Cancer screening" | "Urine" | "Cardiovascular risk" | "Lungs";
export const RR_GROUPS: RrGroup[] = ["Body measurements", "Blood pressure and heart", "Cholesterol", "Blood sugar", "Kidney", "Liver and protein", "Iron", "Thyroid",
  "Vitamins and minerals", "Inflammation and hormones", "Full blood count", "Cancer screening", "Urine", "Cardiovascular risk", "Lungs"];

/** The severity-band status column in the client's table. */
export type RrBasis = "standard" | "ethnicity_specific" | "safety_threshold" | "clinical_interpretation" | "agreed" | "no_severity_bands";
export const RR_BASIS_LABEL: Record<RrBasis, string> = {
  standard: "Bands from source",
  ethnicity_specific: "Ethnicity-specific",
  safety_threshold: "Clinical safety threshold",
  clinical_interpretation: "Clinical interpretation",
  agreed: "Agreed",
  no_severity_bands: "No severity bands",
};

export interface RrTest {
  id: string;
  name: string;
  group: RrGroup;
  unit: string;
  kind: "numeric" | "qualitative" | "recorded";
  basis: RrBasis;
  /** Decimal places results are reported to. Used to find real gaps between bands. */
  decimals: number;
  source: { label: string; url: string } | null;
  /** The existing demo analyte this test maps to, when there is one. */
  analyte: AnalyteCode | null;
  /** Id in RR_CALCULATIONS when Pulse calculates the value. */
  calc: string | null;
  /**
   * What a value outside every band means. review: orange and goes to clinician review (default).
   * neutral: shown without a flag (risk scores with no normal interval).
   */
  outside: "review" | "neutral";
  /** The client's table cells exactly as sent, kept for audit. */
  asSent: { male: string; female: string; mild: string; significant: string; status: string };
  /** Ids of open questions in RR_QUESTIONS that affect this test. */
  questions: string[];
}

export type RrVersionStatus = "published" | "draft" | "rejected" | "withdrawn";
export interface RrVersion {
  id: string; // RRV-TSH-2
  testId: string;
  version: number;
  status: RrVersionStatus;
  /** First day this version applies, by the effective-date rule in settings. */
  effectiveFrom: LocalDate;
  rows: RrRow[];
  /** Why this version exists. */
  reason: string;
  /** Where the numbers came from: lab bulletin, guideline, the client's table. */
  source: string;
  createdBy: StaffId;
  createdAt: Iso;
  publishedBy: StaffId | null;
  publishedAt: Iso | null;
  decidedNote: string | null;
}

export type RrEffectiveBasis = "sample" | "reported" | "reviewed";
export const RR_EFFECTIVE_LABEL: Record<RrEffectiveBasis, string> = {
  sample: "Sample collection date",
  reported: "Date the laboratory reported the result",
  reviewed: "Date the clinician reviewed the result",
};

export interface RrQuestionState { status: "open" | "answered"; answer: string; by: StaffId | null; at: Iso | null }

export interface ReferenceRangesState {
  versions: RrVersion[];
  settings: {
    superadmins: StaffId[];
    /** When on, a different superadmin must publish a draft. */
    secondApprover: boolean;
    effectiveBasis: RrEffectiveBasis;
  };
  questions: Record<string, RrQuestionState>;
}

/* ---------- cohort vocabulary ---------- */

/** QRISK3 ethnicity categories already collected on the nurse form and the participant questionnaire. */
export const RR_ETHNICITIES = ["White or not stated", "Indian", "Pakistani", "Bangladeshi", "Other Asian", "Black African", "Black Caribbean", "Chinese", "Other ethnic group"];
/** The client's ethnicity-specific BMI row: South Asian, Chinese, other Asian, Middle Eastern, Black African, African-Caribbean. */
export const RR_BMI_ETHNIC = ["Indian", "Pakistani", "Bangladeshi", "Other Asian", "Black African", "Black Caribbean", "Chinese"];

export const RR_BAND_META: Record<RrBandKey | "no_band" | "not_set" | "no_cohort", { name: string; colour: string; tone: "ok" | "warn" | "bad" | "neutral"; band: Band }> = {
  normal: { name: "Normal", colour: "Green", tone: "ok", band: "normal" },
  low_mild: { name: "Low, mild", colour: "Yellow", tone: "warn", band: "borderline" },
  high_mild: { name: "High, mild", colour: "Yellow", tone: "warn", band: "borderline" },
  low_severe: { name: "Low, significant (GP review)", colour: "Orange", tone: "bad", band: "abnormal" },
  high_severe: { name: "High, significant (GP review)", colour: "Orange", tone: "bad", band: "abnormal" },
  high_critical: { name: "Clinical safety threshold", colour: "Red", tone: "bad", band: "abnormal" },
  no_band: { name: "Outside normal, no band", colour: "Yellow", tone: "warn", band: "borderline" },
  not_set: { name: "Range not set", colour: "Grey", tone: "neutral", band: "not_tested" },
  no_cohort: { name: "No range for this person", colour: "Grey", tone: "neutral", band: "not_tested" },
};

/* ---------- helpers ---------- */

export const anyCohort = (over: Partial<RrCohort> = {}): RrCohort => ({ sex: "any", ageMin: null, ageMax: null, ethnicities: "any", pregnancy: "any", ...over });

export function fmtRrNum(v: number, decimals: number): string {
  return v.toFixed(Math.max(decimals, (String(v).split(".")[1] || "").length));
}

/** Whether a value sits inside a band's limits. */
export function inBand(b: RrBand, v: number): boolean {
  if (b.min && (b.min.inclusive ? v < b.min.value : v <= b.min.value)) return false;
  if (b.max && (b.max.inclusive ? v > b.max.value : v >= b.max.value)) return false;
  return true;
}

export interface RrPerson { sex: "male" | "female" | "not_recorded"; age: number | null; ethnicity: string | null; pregnant: boolean | null }

/** How specific a cohort is. The most specific matching row wins. */
export function cohortSpecificity(c: RrCohort): number {
  return (c.sex !== "any" ? 1 : 0) + (c.ageMin !== null || c.ageMax !== null ? 1 : 0) + (c.ethnicities !== "any" ? 1 : 0) + (c.pregnancy !== "any" ? 1 : 0);
}

export function cohortMatches(c: RrCohort, p: RrPerson): boolean {
  if (c.sex !== "any" && c.sex !== p.sex) return false;
  if (c.ageMin !== null && (p.age === null || p.age < c.ageMin)) return false;
  if (c.ageMax !== null && (p.age === null || p.age >= c.ageMax)) return false;
  /* Ethnicity not recorded: only an "all ethnicities" row can apply (the fallback). */
  if (c.ethnicities !== "any" && (!p.ethnicity || !c.ethnicities.includes(p.ethnicity))) return false;
  if (c.pregnancy === "not_pregnant" && p.pregnant === true) return false;
  if (c.pregnancy === "pregnant" && p.pregnant !== true) return false;
  return true;
}

/** The row for a person, or why there is none. Ties between equally specific rows are reported, never guessed. */
export function rowFor(rows: RrRow[], p: RrPerson): { row: RrRow | null; tie: RrRow[] } {
  const m = rows.filter((r) => cohortMatches(r.cohort, p));
  if (!m.length) return { row: null, tie: [] };
  const best = Math.max(...m.map((r) => cohortSpecificity(r.cohort)));
  const top = m.filter((r) => cohortSpecificity(r.cohort) === best);
  return top.length === 1 ? { row: top[0], tie: [] } : { row: null, tie: top };
}

/* ---------- versions ---------- */

/** Published version in force for a test on a date. A later effective date wins; on the same date, the higher version. */
export function rrVersionInForce(versions: RrVersion[], testId: string, on: LocalDate): RrVersion | null {
  let best: RrVersion | null = null;
  for (const v of versions) {
    if (v.testId !== testId || v.status !== "published" || v.effectiveFrom > on) continue;
    if (!best || v.effectiveFrom > best.effectiveFrom || (v.effectiveFrom === best.effectiveFrom && v.version > best.version)) best = v;
  }
  return best;
}
export function rrVersionsOf(versions: RrVersion[], testId: string): RrVersion[] {
  return versions.filter((v) => v.testId === testId).sort((a, b) => b.version - a.version);
}
export const rrScheduled = (versions: RrVersion[], testId: string, on: LocalDate) =>
  versions.filter((v) => v.testId === testId && v.status === "published" && v.effectiveFrom > on).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));

/* ---------- classification ---------- */

export interface RrResult {
  outcome: RrBandKey | "no_band" | "not_set" | "no_cohort";
  /** Printed word: the band's descriptor, or the reason there is none. */
  label: string;
  tone: "ok" | "warn" | "bad" | "neutral";
  colour: string;
  band: Band;
  /** True when a clinician must look at it. */
  review: boolean;
  version: RrVersion | null;
  row: RrRow | null;
  why: string;
}

export function classify(test: RrTest, versions: RrVersion[], p: RrPerson, value: number | string, on: LocalDate): RrResult {
  const v = rrVersionInForce(versions, test.id, on);
  const mk = (outcome: RrResult["outcome"], label: string, row: RrRow | null, why: string, reviewOverride?: boolean): RrResult => {
    const m = RR_BAND_META[outcome];
    const neutral = outcome === "no_band" && test.outside === "neutral";
    return { outcome, label, tone: neutral ? "neutral" : m.tone, colour: neutral ? "None" : m.colour, band: neutral ? "normal" : m.band,
      review: reviewOverride ?? (outcome === "no_band" ? !neutral : outcome !== "normal" && outcome !== "not_set" && outcome !== "no_cohort"), version: v, row, why };
  };
  if (!v) return mk("not_set", "Range not set", null, `No published range for ${test.name} on ${on}.`, false);
  const { row, tie } = rowFor(v.rows, p);
  if (tie.length) return mk("no_cohort", "Two ranges match", null, `${tie.length} equally specific ranges match this person. A superadmin must resolve the overlap.`, true);
  if (!row) return mk("no_cohort", "No range for this person", null, "No cohort in this version covers this person's sex, age, ethnicity or pregnancy status.", true);
  if (row.status !== "set") return mk("not_set", row.status === "not_applicable" ? "Not applicable" : "Range not set", row, row.status === "not_applicable" ? "This test is not done for this cohort." : "Precision Health has not supplied this range yet.", false);
  if (test.kind === "qualitative") {
    const ok = String(value).trim().toLowerCase() === String(row.expected || "").trim().toLowerCase();
    return ok ? mk("normal", row.bands.find((b) => b.key === "normal")?.label || "NORMAL", row, `Matches the expected result: ${row.expected}.`)
      : mk("no_band", String(value).toUpperCase(), row, `Expected ${row.expected}. Any other result goes to the clinician.`);
  }
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return mk("not_set", "No value", row, "No numeric value to compare.", false);
  const hit = RR_BAND_ORDER.map((k) => row.bands.find((b) => b.key === k)).filter((b): b is RrBand => !!b && inBand(b, n));
  if (!hit.length) return mk("no_band", test.outside === "neutral" ? "" : "OUTSIDE NORMAL", row, `${fmtRrNum(n, test.decimals)} is outside normal and not inside a defined band for this cohort, so it goes to clinician review.`);
  /* Overlapping bands (shown as a warning on the range page): the more severe band is used, so nothing is under-called. */
  const pick = hit.slice().sort((a, b) => severity(b.key) - severity(a.key))[0];
  return mk(pick.key, pick.label, row, `${fmtRrNum(n, test.decimals)} is ${boundsText(pick, test.decimals)}.${hit.length > 1 ? " It also sits in another band; the more severe band is used." : ""}`);
}
const severity = (k: RrBandKey) => ({ normal: 0, low_mild: 1, high_mild: 1, low_severe: 2, high_severe: 2, high_critical: 3 })[k];

/* ---------- checks: gaps and overlaps ---------- */

export interface RrIssue { kind: "gap" | "overlap" | "order"; text: string }

/** Real gaps (a reportable value that falls in no band) and overlaps between bands in a row. */
export function bandIssues(row: RrRow, decimals: number): RrIssue[] {
  if (row.status !== "set" || row.bands.length < 2) return [];
  const out: RrIssue[] = [];
  const step = 1 / 10 ** decimals;
  const lo = (b: RrBand) => (b.min ? b.min.value : -Infinity);
  const sorted = row.bands.slice().sort((a, b) => lo(a) - lo(b) || (a.min && b.min ? Number(b.min.inclusive) - Number(a.min.inclusive) : 0));
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i], b = sorted[i + 1];
    if (!a.max) { out.push({ kind: "overlap", text: `${a.label} has no upper limit but ${b.label} starts above it.` }); continue; }
    if (!b.min) continue;
    const aTop = a.max.value, bLow = b.min.value;
    const touchOk = aTop === bLow && a.max.inclusive !== b.min.inclusive;
    if (aTop > bLow || (aTop === bLow && a.max.inclusive && b.min.inclusive)) {
      out.push({ kind: "overlap", text: `${a.label} and ${b.label} both include ${aTop === bLow ? fmtRrNum(aTop, decimals) : `${fmtRrNum(bLow, decimals)} to ${fmtRrNum(aTop, decimals)}`}.` });
    } else if (!touchOk) {
      /* First reportable value above a's top, compared with b's lowest. */
      const firstAbove = a.max.inclusive ? round(aTop + step, decimals) : aTop;
      const firstInB = b.min.inclusive ? bLow : round(bLow + step, decimals);
      if (firstAbove < firstInB) {
        const lastGap = b.min.inclusive ? round(bLow - step, decimals) : bLow;
        out.push({ kind: "gap", text: firstAbove === lastGap ? `A result of ${fmtRrNum(firstAbove, decimals)} falls in no band.` : `Results from ${fmtRrNum(firstAbove, decimals)} to ${fmtRrNum(lastGap, decimals)} fall in no band.` });
      }
    }
  }
  return out;
}
const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;

/** Two rows whose cohorts are equally specific and can both match the same person. */
export function cohortOverlaps(rows: RrRow[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
    const a = rows[i].cohort, b = rows[j].cohort;
    if (cohortSpecificity(a) !== cohortSpecificity(b)) continue;
    const sex = a.sex === "any" || b.sex === "any" || a.sex === b.sex;
    const age = (a.ageMax === null || b.ageMin === null || b.ageMin < a.ageMax) && (b.ageMax === null || a.ageMin === null || a.ageMin < b.ageMax);
    const eth = a.ethnicities === "any" || b.ethnicities === "any" || a.ethnicities.some((e) => (b.ethnicities as string[]).includes(e));
    const preg = a.pregnancy === "any" || b.pregnancy === "any" || a.pregnancy === b.pregnancy;
    if (sex && age && eth && preg) out.push(`${cohortText(a)} and ${cohortText(b)} can both apply to the same person.`);
  }
  return out;
}

/* ---------- plain language ---------- */

export function cohortText(c: RrCohort): string {
  const sex = c.sex === "male" ? "Males" : c.sex === "female" ? "Females" : "Everyone";
  const age = c.ageMin === null && c.ageMax === null ? "all ages"
    : c.ageMin !== null && c.ageMax !== null ? `aged ${c.ageMin} to ${c.ageMax - 1}`
    : c.ageMin !== null ? `aged ${c.ageMin} and over` : `under ${c.ageMax}`;
  const eth = c.ethnicities === "any" ? "all ethnicities" : c.ethnicities.length === 1 ? `${c.ethnicities[0]} ethnicity` : `${c.ethnicities.length} ethnicity groups (${c.ethnicities.join(", ")})`;
  const preg = c.pregnancy === "not_pregnant" ? ", not pregnant" : c.pregnancy === "pregnant" ? ", pregnant" : "";
  return `${sex}, ${age}, ${eth}${preg}`;
}

export function boundsText(b: RrBand, decimals: number): string {
  const f = (x: RrBound) => fmtRrNum(x.value, decimals);
  if (b.min && b.max) {
    return `${b.min.inclusive ? "from" : "above"} ${f(b.min)} ${b.max.inclusive ? "up to and including" : "up to but not including"} ${f(b.max)}`;
  }
  if (b.min) return b.min.inclusive ? `${f(b.min)} or more` : `above ${f(b.min)}`;
  if (b.max) return b.max.inclusive ? `${f(b.max)} or less` : `below ${f(b.max)}`;
  return "any value";
}

/** Short symbolic form for tables: ≥15 and ≤150, <25, >500. */
export function boundsShort(b: RrBand, decimals: number): string {
  const f = (x: RrBound) => fmtRrNum(x.value, decimals);
  if (b.min && b.max) return `${b.min.inclusive ? "≥" : ">"}${f(b.min)} and ${b.max.inclusive ? "≤" : "<"}${f(b.max)}`;
  if (b.min) return `${b.min.inclusive ? "≥" : ">"}${f(b.min)}`;
  if (b.max) return `${b.max.inclusive ? "≤" : "<"}${f(b.max)}`;
  return "any";
}

/** The generated sentence for one cohort, e.g. "Females, all ages, all ethnicities: below 15 LOW; from 15 up to and including 150 NORMAL." */
export function rowSentence(test: RrTest, row: RrRow): string {
  const who = cohortText(row.cohort);
  if (row.status === "not_set") return `${who}: range not set yet.`;
  if (row.status === "not_applicable") return `${who}: not applicable.`;
  if (test.kind === "qualitative") return `${who}: ${row.expected} is ${row.bands.find((b) => b.key === "normal")?.label || "NORMAL"}; any other result goes to the clinician.`;
  const parts = RR_BAND_ORDER.map((k) => row.bands.find((b) => b.key === k)).filter((b): b is RrBand => !!b)
    .map((b) => `${boundsText(b, test.decimals)} ${b.label}`);
  const unit = test.unit && test.unit !== "Qualitative" ? ` (${test.unit})` : "";
  return `${who}${unit}: ${parts.join("; ")}.`;
}

/* ---------- band constructors for the seeded table ---------- */
export const ge = (value: number): RrBound => ({ value, inclusive: true });
export const gt = (value: number): RrBound => ({ value, inclusive: false });
export const le = (value: number): RrBound => ({ value, inclusive: true });
export const lt = (value: number): RrBound => ({ value, inclusive: false });
export const band = (key: RrBandKey, min: RrBound | null, max: RrBound | null, label?: string): RrBand => ({ key, min, max, label: label || RR_DEFAULT_LABEL[key] });
export const RR_DEFAULT_LABEL: Record<RrBandKey, string> = {
  low_severe: "LOW SEVERE", low_mild: "LOW", normal: "NORMAL", high_mild: "HIGH MILD", high_severe: "HIGH SEVERE", high_critical: "URGENT",
};

/** Whether a value sits below or above the normal band of a row (null when inside or no normal band). */
export function rrDirection(row: RrRow | null, v: number): "low" | "high" | null {
  const nb = row?.bands.find((b) => b.key === "normal");
  if (!nb) return null;
  if (nb.min && !inBand({ ...nb, max: null }, v)) return "low";
  if (nb.max && !inBand({ ...nb, min: null }, v)) return "high";
  return null;
}
