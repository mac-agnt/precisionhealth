/* Pure derivations for the digital report. Everything here is computed from the ReportDocument
   that reportDocument() already returned (so the participant access rules and the frozen,
   released values stay exactly as the model decided them), plus the participant's sex and age
   at collection for sex-specific and age-specific ranges. Zones on every scale are found by
   asking the model's own classifiers (bandFor, bpCategory, bmiCategory, waistCategory,
   relativeRiskBand) across the scale, so a chart can never disagree with the flag word. */
import { ANALYTES, BP_SIGNIFICANCE, alcoholUnitsPerWeek, bandFor, bmiCategory, bpCategory, rangeFor, relativeRiskBand, waistCategory } from "../model";
import type { AnalyteCode, Answers, Band, BandCtx, RangeBound, ReportDocument, ReportRow, ReportSection, ReportSectionKey, SexRecorded } from "../model";

/* ---- buckets for "At a glance" ---- */
export type Bucket = "in_range" | "to_discuss" | "outside" | "missing";
export const BUCKETS: Bucket[] = ["in_range", "to_discuss", "outside", "missing"];
export const BUCKET_LABEL: Record<Bucket, string> = { in_range: "In range", to_discuss: "To discuss", outside: "Outside range", missing: "Not done or pending" };
export const BUCKET_BAND: Record<Bucket, Band> = { in_range: "normal", to_discuss: "borderline", outside: "abnormal", missing: "not_tested" };

/** Rows that repeat another section's result, or describe an input rather than a result. */
const NOT_COUNTED = new Set(["cv_bp", "cv_bmi", "cv_smoking", "cv_family", "cv_score", "cv_heart_age", "height", "weight"]);

export function bucketOf(r: ReportRow): Bucket | null {
  if (r.status === "not_applicable") return null;
  if (r.status !== "resulted") return "missing";
  if (r.band === "normal") return "in_range";
  if (r.band === "borderline") return "to_discuss";
  if (r.band === "abnormal") return "outside";
  return "missing";
}

export interface CountedRow { section: ReportSectionKey; row: ReportRow; bucket: Bucket | null }
/** Every test result in the report once, in report order. Not applicable rows carry bucket null. */
export function countedRows(doc: ReportDocument): CountedRow[] {
  const out: CountedRow[] = [];
  for (const s of doc.sections) for (const r of s.rows) {
    if (NOT_COUNTED.has(r.key)) continue;
    out.push({ section: s.key, row: r, bucket: bucketOf(r) });
  }
  return out;
}
export interface Summary { counts: Record<Bucket, number>; total: number; notApplicable: number }
export function summarise(rows: CountedRow[]): Summary {
  const counts: Record<Bucket, number> = { in_range: 0, to_discuss: 0, outside: 0, missing: 0 };
  let notApplicable = 0;
  for (const r of rows) {
    if (r.bucket) counts[r.bucket]++;
    else notApplicable++;
  }
  return { counts, total: counts.in_range + counts.to_discuss + counts.outside + counts.missing, notApplicable };
}

/* ---- words ---- */
export const STATUS_WORD: Record<Exclude<ReportRow["status"], "resulted">, string> = {
  pending: "PENDING", not_done: "NOT DONE", declined: "DECLINED", not_applicable: "NOT APPLICABLE",
};
/** The chip word for a row: the report's flag word, or the status in capitals. */
export function chipWord(r: ReportRow): string {
  if (r.status !== "resulted") return STATUS_WORD[r.status];
  return r.flagWord || "";
}
/** Units in screen form: umol/L as µmol/L, x10^9/L as ×10⁹/L. "n/a" and "ratio" are left out. */
export function prettyUnit(u: string): string {
  if (!u || u === "n/a" || u === "ratio") return "";
  return u.replace(/^u(mol|g)\//, "µ$1/").replace("x10^9/L", "×10⁹/L");
}
/** What a flagged result is, in a few plain words. */
function flaggedPhrase(r: ReportRow): string {
  switch (r.flagWord) {
    case "HIGHER RISK": return "is in the higher risk range";
    case "OVERWEIGHT": return "is in the overweight range";
    case "OBESE": return "is in the obese range";
    case "UNDERWEIGHT": return "is in the underweight range";
    case "RAISED": return "is raised";
    case "LOW": return "is low";
    case "POSITIVE": return "is positive";
    case "SIGNIFICANTLY RAISED": return "is significantly raised";
    case "IMMEDIATE TREATMENT": return "is in the immediate treatment range";
    case "ABNORMAL": return "needs your doctor's review";
    case "BORDERLINE": return "is borderline";
    default: return r.band === "abnormal" ? "is outside the range" : "is borderline";
  }
}
const joinList = (items: string[]) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** One plain-English line for a group of results. */
export function headlineFor(rows: ReportRow[], subject = "result"): string {
  const counted = rows.filter((r) => r.status !== "not_applicable");
  if (!counted.length) return "Nothing to show for this section.";
  const flagged = counted.filter((r) => r.status === "resulted" && (r.band === "borderline" || r.band === "abnormal"));
  const inRange = counted.filter((r) => r.status === "resulted" && r.band === "normal");
  const missing = counted.filter((r) => bucketOf(r) === "missing");
  if (counted.length === 1 && missing.length === 1) {
    const t = missing[0].resultText;
    return `${missing[0].test}: ${t.charAt(0).toLowerCase() + t.slice(1)}.`;
  }
  const groups: Array<[number, string, string]> = [
    [missing.filter((r) => r.status === "pending").length, "is still pending", "are still pending"],
    [missing.filter((r) => r.status === "declined").length, "was declined", "were declined"],
    [missing.filter((r) => r.status !== "pending" && r.status !== "declined").length, "was not done", "were not done"],
  ];
  const missingText = groups.filter(([n]) => n > 0).map(([n, one, many]) => `${n} ${plural(n, subject, subject + "s")} ${plural(n, one, many)}.`).join(" ");
  if (!flagged.length) {
    if (!inRange.length) return missingText || "No results to show yet.";
    const lead = counted.length === 1 ? `Your ${subject} is in the healthy range.`
      : inRange.length === counted.length ? (counted.length === 2 ? `Both ${subject}s are in the healthy range.` : `All ${counted.length} ${subject}s are in the healthy range.`)
      : `${inRange.length} of ${counted.length} ${subject}s are in the healthy range.`;
    return [lead, missingText].filter(Boolean).join(" ");
  }
  const lead = `${joinList(flagged.map((r) => `${r.test} ${flaggedPhrase(r)}`))}.`;
  const rest = inRange.length ? (inRange.length === 1 ? " The other result is in range." : ` The other ${inRange.length} are in range.`) : "";
  return lead + rest + (missingText ? " " + missingText : "");
}

/* ---- values ---- */
export function numericValue(r: ReportRow | undefined | null): number | null {
  if (!r || r.status !== "resulted") return null;
  const n = Number(r.resultText.replace(/%$/, ""));
  return Number.isFinite(n) ? n : null;
}
export function bpValues(r: ReportRow | undefined | null): { sys: number; dia: number } | null {
  if (!r || r.status !== "resulted") return null;
  const m = /^(\d+)\s*\/\s*(\d+)$/.exec(r.resultText.trim());
  return m ? { sys: Number(m[1]), dia: Number(m[2]) } : null;
}
export const sectionOf = (doc: ReportDocument, key: ReportSectionKey): ReportSection | undefined => doc.sections.find((s) => s.key === key);
export const rowOf = (s: ReportSection | undefined, key: string): ReportRow | undefined => s?.rows.find((r) => r.key === key);

/* ---- scales ---- */
export interface Zone { from: number; to: number; key: string; band: Band }
export interface Tick { at: number; label: string }
export interface ScaleSpec { min: number; max: number; zones: Zone[]; ticks: Tick[] }
export type Classifier = (x: number) => { key: string; band: Band };

/**
 * A horizontal scale whose zones come from a classifier sampled across the domain. The domain
 * grows to hold the participant's value, so the marker is always on the scale. Zone edges snap
 * to the nearest labelled tick, so the shading and the printed limit agree to the pixel.
 */
export function buildScale(domain: [number, number], classify: Classifier, value: number | null, ticks: Tick[], floorAtZero = true): ScaleSpec {
  let [min, max] = domain;
  const span0 = max - min;
  if (value != null && Number.isFinite(value)) {
    if (value < min + span0 * 0.03) min = value - span0 * 0.08;
    if (value > max - span0 * 0.03) max = value + span0 * 0.08;
  }
  if (floorAtZero && domain[0] >= 0 && min < 0) min = 0;
  const N = 720;
  const step = (max - min) / N;
  const zones: Zone[] = [];
  for (let i = 0; i < N; i++) {
    const c = classify(min + (i + 0.5) * step);
    const last = zones[zones.length - 1];
    if (last && last.key === c.key) last.to = min + (i + 1) * step;
    else zones.push({ from: min + i * step, to: min + (i + 1) * step, key: c.key, band: c.band });
  }
  const inTicks = ticks.filter((t) => t.at > min && t.at < max);
  for (let i = 1; i < zones.length; i++) {
    const edge = zones[i].from;
    const near = inTicks.find((t) => Math.abs(t.at - edge) <= step * 1.5);
    if (near) { zones[i].from = near.at; zones[i - 1].to = near.at; }
  }
  return { min, max, zones, ticks: inTicks };
}
export const pct = (spec: Pick<ScaleSpec, "min" | "max">, x: number) => Math.max(0, Math.min(100, ((x - spec.min) / (spec.max - spec.min)) * 100));

/** Display domains chosen so the healthy zone sits comfortably inside the bar. */
const DOMAIN: Partial<Record<AnalyteCode, [number, number]>> = {
  TC: [2, 8], HDL: [0.4, 2.6], LDL: [0, 6], NONHDL: [1, 7], TG: [0, 4], TCHDL: [1, 8], HBA1C: [20, 70],
  HB: [8, 20], WCC: [0, 15], PLT: [50, 550], BILI: [0, 40], TPROT: [45, 100], ALP: [0, 200], GGT: [0, 100], AST: [0, 60], ALT: [0, 80],
  UREA: [0, 14], CREAT: [30, 160], URATE: [100, 600], FERR: [0, 300], IRON: [0, 45], TIBC: [30, 90], FT4: [4, 26], TSH: [0, 8],
  VITD: [0, 150], B12: [0, 800], FOLATE: [0, 20], CA: [1.9, 2.9], MG: [0.5, 1.2], PO4: [0.5, 1.8], PSA: [0, 8],
};
/** Limits the client's report names besides the normal range: total cholesterol 6.0, HbA1c 42. */
const EXTRA_TICKS: Partial<Record<AnalyteCode, number[]>> = { TC: [6.0], HBA1C: [42] };

function boundTicks(rb: RangeBound | null): Tick[] {
  if (!rb) return [];
  const t = rb.text.trim();
  if (t.startsWith("<") && rb.hi !== undefined) return [{ at: rb.hi, label: t.slice(1) }];
  if (t.startsWith(">") && rb.lo !== undefined) return [{ at: rb.lo, label: t.slice(1) }];
  const parts = t.split("-");
  const out: Tick[] = [];
  if (rb.lo !== undefined && Number.isFinite(rb.lo)) out.push({ at: rb.lo, label: parts.length === 2 ? parts[0] : String(rb.lo) });
  if (rb.hi !== undefined && Number.isFinite(rb.hi)) out.push({ at: rb.hi, label: parts.length === 2 ? parts[1] : String(rb.hi) });
  return out;
}
/** Which way is good for a test with a one-sided range. */
export type Direction = "higher" | "lower" | "range" | null;
export function directionOf(code: AnalyteCode, ctx: BandCtx): Direction {
  const rb = rangeFor(code, ctx);
  if (!rb) return null;
  const lo = rb.lo !== undefined && Number.isFinite(rb.lo), hi = rb.hi !== undefined && Number.isFinite(rb.hi);
  return lo && !hi ? "higher" : hi && !lo ? "lower" : lo && hi ? "range" : null;
}
export function analyteScale(code: AnalyteCode, value: number | null, ctx: BandCtx): ScaleSpec {
  const rb = rangeFor(code, ctx);
  const dec = ANALYTES[code].decimals;
  const ticks = boundTicks(rb).concat((EXTRA_TICKS[code] || []).map((at) => ({ at, label: at.toFixed(Math.min(dec, 1)) })));
  let domain = DOMAIN[code];
  if (!domain) {
    const lo = rb?.lo ?? 0, hi = rb?.hi ?? (rb?.lo ?? 1) * 2.5;
    const pad = (hi - lo) * 0.6;
    domain = [Math.max(0, lo - pad), hi + pad];
  }
  return buildScale(domain, (x) => { const b = bandFor(code, x, ctx); return { key: b, band: b }; }, value, ticks);
}

export const BMI_CATEGORIES = [
  { key: "under", label: "Underweight", range: "below 18" },
  { key: "healthy", label: "Healthy", range: "18 to 25" },
  { key: "over", label: "Overweight", range: "25 to 30" },
  { key: "obese", label: "Obese", range: "above 30" },
];
export function bmiCategoryKey(bmi: number): string {
  return bmi < 18 ? "under" : bmi <= 25 ? "healthy" : bmi <= 30 ? "over" : "obese";
}
export function bmiScale(value: number | null): ScaleSpec {
  return buildScale([15, 40], (x) => { const b = bmiCategory(x).band; return { key: b, band: b }; }, value, [{ at: 18, label: "18" }, { at: 25, label: "25" }, { at: 30, label: "30" }]);
}
export function waistScale(value: number | null, sex: SexRecorded): ScaleSpec {
  const limit = waistCategory(80, sex).limit;
  const domain: [number, number] = sex === "male" ? [60, 125] : [55, 115];
  return buildScale(domain, (x) => { const b = waistCategory(x, sex).band; return { key: b, band: b }; }, value, [{ at: limit, label: String(limit) }]);
}
export const HBA1C_CATEGORIES = [
  { key: "normal", label: "Normal", range: "below 42" },
  { key: "borderline", label: "Higher risk", range: "42 to 47" },
  { key: "abnormal", label: "Raised", range: "48 or more" },
];

/** Blood pressure: the five significance bands of the client's report, highest of the two numbers wins. */
const BP_SYS = [120, 140, 160, 180];
const BP_DIA = [80, 90, 100, 110];
const level = (x: number, cuts: number[]) => cuts.filter((c) => x >= c).length;
export function bpLevel(sys: number, dia: number): number {
  const word = bpCategory(sys, dia).word;
  const i = BP_SIGNIFICANCE.findIndex((b) => b.word === word);
  return i < 0 ? 0 : i;
}
export function bpScale(which: "sys" | "dia", value: number | null): ScaleSpec {
  const cuts = which === "sys" ? BP_SYS : BP_DIA;
  const domain: [number, number] = which === "sys" ? [80, 200] : [50, 120];
  return buildScale(domain, (x) => { const i = level(x, cuts); return { key: "bp" + i, band: BP_SIGNIFICANCE[i].band }; }, value, cuts.map((c) => ({ at: c, label: String(c) })));
}
/** Short names for the significance bands, for tight spaces. */
export const BP_SHORT = ["Ideal", "Mild", "Raised", "Significantly raised", "Immediate treatment"];

export function relativeRiskScale(value: number | null): ScaleSpec {
  return buildScale([0, 3], (x) => { const b = relativeRiskBand(x); return { key: b, band: b }; }, value, [{ at: 1.0, label: "1.0" }, { at: 1.5, label: "1.5" }]);
}

/* ---- lifestyle ---- */
export const FREQ_STEPS = ["Never", "Less than 3 times per week", "3-6 times per week", "Daily"];
export interface LifestyleView {
  alcohol: { state: "answered" | "never" | "unanswered"; units: number | null; guide: number; frequency: string; perOccasion: string };
  exerciseDays: number | null;
  frequencies: Array<{ key: string; label: string; answer: string; index: number | null }>;
  chips: Array<{ key: string; label: string; answer: string; answered: boolean }>;
}
const FREQ_LABEL: Record<string, string> = {
  fruitVeg: "5 or more portions of fruit or vegetables",
  sugarDrinks: "Full sugar drinks",
  redMeat: "Red meat",
  addSalt: "Adding salt to food",
};
const CHIP_LABEL: Record<string, string> = {
  healthChange: "Your health in the past year",
  smokesCigarettes: "Smoking cigarettes",
  vaping: "Vaping",
  water: "Water",
  foodLabels: "Reading food labels",
  examineTesticles: "Checking your testicles",
  examineBreasts: "Checking your breasts",
};
/** The lifestyle answers as the report printed them, rebuilt into quantities where they have one. */
export function lifestyleView(doc: ReportDocument, sex: SexRecorded): LifestyleView {
  const rows = doc.lifestyle.rows;
  const by = new Map(rows.map((r) => [r.key, r]));
  const ans = (k: string) => (by.get(k)?.answered ? by.get(k)!.answer : "");
  const a: Answers = {};
  if (ans("alcoholFrequency")) a.alcoholFrequency = ans("alcoholFrequency");
  if (ans("alcoholUnits")) a.alcoholUnits = ans("alcoholUnits");
  const units = alcoholUnitsPerWeek(a);
  const guide = sex === "male" ? 17 : 11;
  const alcohol: LifestyleView["alcohol"] = {
    state: !ans("alcoholFrequency") ? "unanswered" : ans("alcoholFrequency") === "Never" ? "never" : units == null ? "unanswered" : "answered",
    units, guide, frequency: ans("alcoholFrequency"), perOccasion: ans("alcoholUnits"),
  };
  const ex = Number(ans("exerciseDays"));
  const exerciseDays = ans("exerciseDays") !== "" && Number.isFinite(ex) ? Math.max(0, Math.min(7, Math.round(ex))) : null;
  const frequencies = Object.keys(FREQ_LABEL).filter((k) => by.has(k)).map((k) => {
    const v = ans(k);
    const i = FREQ_STEPS.indexOf(v);
    return { key: k, label: FREQ_LABEL[k], answer: v || "Not answered", index: i < 0 ? null : i };
  });
  const used = new Set(["alcoholFrequency", "alcoholUnits", "exerciseDays", ...Object.keys(FREQ_LABEL)]);
  const chips = rows.filter((r) => !used.has(r.key)).map((r) => ({ key: r.key, label: CHIP_LABEL[r.key] || r.question, answer: r.answered ? r.answer.replace(/\.$/, "") : "Not answered", answered: r.answered }));
  return { alcohol, exerciseDays, frequencies, chips };
}

/* ---- text helpers ---- */
/** Splits a support line into text, web addresses, email addresses and phone numbers. */
export type Piece = { kind: "text" | "web" | "email" | "phone"; text: string };
export function linkPieces(s: string): Piece[] {
  const re = /(www\.[a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s,]*)?)|([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})|(1800 \d{3} \d{3})/gi;
  const out: Piece[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ kind: "text", text: s.slice(last, m.index) });
    let text = m[0];
    let trail = "";
    while (/[.)]$/.test(text)) { trail = text.slice(-1) + trail; text = text.slice(0, -1); }
    out.push({ kind: m[1] ? "web" : m[2] ? "email" : "phone", text });
    if (trail) out.push({ kind: "text", text: trail });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ kind: "text", text: s.slice(last) });
  return out;
}
