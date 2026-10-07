/* Results viewer: Precision Health's Excel-style Reporting Viewer, rebuilt in the Pulse glass
   style. Three label and value column pairs with the client's own row labels in their order
   (INPUTS.md section 4), compact rows, and value cells filled with the band colour from the
   shared report bands: green normal, yellow borderline, orange abnormal or raised, grey not
   tested, pending or not applicable. Every filled cell also prints a small flag word, so colour
   is never the only signal. Plain values (identity, history, comments) carry no fill.
   The client's sheet repeats Medications and Menstruating in column 2 and PSA in column 3: each
   is kept once, and the second PSA row becomes the nurse form's "PSA taken?" question.
   The Expanded panel toggle adds the rest of the Comprehensive panel, grouped.
   Under the grid sits the red NEW ADVICE box; the advice editor is passed in by Review. */
import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  ANALYTES, ANALYTE_GROUPS, MEASURE_RULES, QRISK3_SOURCE_NOTE, RULE_SET_LABEL, ageOn, bandCtxFor, bmiCategory, bpCategory, ecgBand, fmtDate, fmtShortDateTime,
  isNurseReferral, localDateOf, membershipOf, needsEcgReview, panelResults, rangeFor, relativeRiskBand, riskFactorSummary, staffName, urineBand, waistCategory,
} from "../../model";
import type { AnalyteCode, AnalyteGroup, Band, BandCtx, MeasureKey, PanelResult, PhState } from "../../model";
import { usePhState } from "../../store";
import { DemoTag, Icon, Segmented, Switch } from "../../ui";
import { BAND_LOOK } from "../../report/bands";
import type { Bundle } from "./EpisodePanels";
import { Banner } from "./shared";
import { rowIndex } from "./select";

/* ---- cells ---- */
type CellTone = Band | "plain";
export interface ViewerCell {
  label: string;
  value: string;
  tone: CellTone;
  /** Small text flag printed in the cell, for example NORMAL, BORDERLINE, PENDING or N/A. */
  flag: string;
  /** Unit, range and source, shown in the inspector line and as a tooltip. */
  detail: string;
  /** Laboratory code, for the pending check and to match the model's review flags. */
  code?: AnalyteCode;
  /** Measurement key as used by the model's review flags (bp, bmi, waist, ecg, urine_*, qrisk_rr). */
  key?: string;
  /** Long free text: clamped in the grid, full text in the inspector. */
  long?: boolean;
  /** Numeric value, unit and the person's reference interval, for the inspector's range gauge. */
  num?: number;
  unit?: string;
  range?: { lo?: number; hi?: number };
  /** Axis for the gauge when zero-based does not suit, for example blood pressure. */
  scale?: [number, number];
}

const plain = (label: string, value: string | null | undefined, detail: string, long?: boolean): ViewerCell =>
  value === null || value === undefined || value === ""
    ? { label, value: "Not recorded", tone: "plain", flag: "", detail: `${label}: not recorded. ${detail}`, long }
    : { label, value, tone: "plain", flag: "", detail: `${label}: ${value}. ${detail}`, long };
const grey = (label: string, value: string, flag: string, detail: string): ViewerCell => ({ label, value, tone: "not_tested", flag, detail });
const banded = (label: string, value: string, band: Band, flag: string, detail: string): ViewerCell =>
  band === "not_tested" ? grey(label, value, flag || "NOT TESTED", detail) : { label, value, tone: band, flag: flag || BAND_LOOK[band].label.toUpperCase(), detail };
const keyed = (key: string, c: ViewerCell): ViewerCell => ({ ...c, key });
const gauged = (num: number, range: { lo?: number; hi?: number }, unit: string | undefined, c: ViewerCell, scale?: [number, number]): ViewerCell => ({ ...c, num, range, unit, scale });
const tf = (v: boolean | null | undefined) => (v === true ? "TRUE" : v === false ? "FALSE" : null);
const yesNo = (v: unknown) => (v === true ? "Yes" : v === false ? "No" : typeof v === "string" && v ? v : null);

/** One laboratory row from panelResults. Pending, held and unconfirmed results are grey, never normal. */
function labCell(label: string, r: PanelResult | undefined, code: AnalyteCode, lineOf: (rowId: string) => string, ctx: BandCtx): ViewerCell {
  const a = ANALYTES[code];
  const cell = (c: ViewerCell): ViewerCell => ({ ...c, code });
  if (!r || r.status === "not_applicable") return cell(grey(label, "N/A", "N/A", `${a.name}: not on this episode's panel.`));
  if (r.status === "pending") return cell(grey(label, "Pending", "PENDING", `${a.name}: awaiting the laboratory result. A missing result is never shown as normal.`));
  if (r.status === "quarantined") return cell(grey(label, "Held", "HELD", `${a.name}: the laboratory row is held for an identity check in Imports.`));
  if (r.status === "unit_unconfirmed") return cell(grey(label, r.observation ? String(r.observation.value) : "Unit", "UNIT CHECK", `${a.name}: ${r.resultText}. Not interpreted until the laboratory confirms the unit.`));
  const o = r.observation!;
  const unit = a.unit && a.unit !== "ratio" ? ` ${a.unit}` : "";
  const src = o.source.kind === "batch" ? `Eurofins ${lineOf(o.source.rowId)}` : o.source.kind === "calc" ? `Calculated in Pulse: ${o.source.method}` : "Recorded at the clinic";
  const legacy = o.legacyDisplayedFlag === "normal" && o.flag === "review_required" ? " The legacy summary showed this as normal, which is inconsistent with the range." : "";
  // A qualitative result already reads as its flag word (FIT Negative), so the cell flag gives the band instead.
  const flag = a.qualitative ? (r.band === "normal" ? "NORMAL" : "ABNORMAL") : r.flagWord;
  const bound = a.qualitative ? null : rangeFor(code, ctx);
  return {
    ...cell(banded(label, r.resultText, r.band, flag,
      `${a.name} ${r.resultText}${unit}. Normal range ${r.rangeText}${r.illustrativeRange ? " (illustrative, to confirm)" : ""}. ${src}${o.version > 1 ? `, version ${o.version}` : ""}.${legacy}`)),
    unit: unit.trim() || undefined,
    ...(bound ? { num: o.value, range: { lo: bound.lo, hi: bound.hi } } : {}),
  };
}

const CONDITIONS: Array<[string, string]> = [
  ["diabetesType1", "Diabetes type 1"], ["diabetesType2", "Diabetes type 2"], ["migraine", "Frequent migraine"], ["rheumatoidArthritis", "Rheumatoid arthritis"],
  ["sle", "SLE"], ["ckd", "Chronic kidney disease"], ["atrialFibrillation", "Atrial fibrillation"], ["severeMentalIllness", "Severe mental illness"],
];
const QRISK_MEDS: Array<[string, string]> = [["atypicalAntipsychotic", "Atypical antipsychotic"], ["erectileDysfunction", "Erectile dysfunction treatment"], ["oralSteroids", "Regular oral steroids"]];

/* ---- the whole viewer as data ---- */
export interface ViewerModel {
  cols: ViewerCell[][];
  expanded: Array<{ group: AnalyteGroup; title: string; cells: Array<{ cell: ViewerCell; range: string }> }>;
  /** Cells with a borderline or abnormal band, across the grid and the expanded panel. */
  nonNormal: ViewerCell[];
  /** Laboratory cells still pending, held or awaiting unit confirmation. */
  pending: ViewerCell[];
  referral: boolean;
  ecgReview: boolean;
}

/** The viewer for one episode, or null when the current role may not see its values. */
export function buildViewer(state: PhState, b: Bundle): ViewerModel | null {
  const panel = panelResults(state, b.episode.id);
  const rf = riskFactorSummary(state, b.episode.id);
  if (!panel || !rf) return null;
  const rows = rowIndex(state);
  const lineOf = (rowId: string) => { const r = rows.get(rowId); return r ? `${r.batchId}, line ${r.line}` : rowId; };
  const by = new Map(panel.map((r) => [r.code, r]));
  const ep = b.episode, c = ep.capture, f = c.form || {}, m = c.measures, person = b.person;
  const ctx = bandCtxFor(person, ep.collectedAt);
  const lab = (label: string, code: AnalyteCode) => labCell(label, by.get(code), code, lineOf, ctx);
  const answers = (membershipOf(state, person.id, ep.programmeId)?.answers || {}) as Record<string, unknown>;
  const age = ageOn(person.dob, localDateOf(ep.collectedAt));
  const sex = person.sex;
  const NURSE = "Nurse form.";
  const val = (k: MeasureKey) => (m[k].state === "recorded" && m[k].value != null ? (m[k].value as number) : null);
  const absent = (k: MeasureKey, label: string): ViewerCell =>
    m[k].state === "declined" ? grey(label, "Declined", "DECLINED", `${label}: declined by the participant.`) : m[k].state === "not_done" ? grey(label, "Not done", "NOT DONE", `${label}: not done at the screen.`) : grey(label, "Missing", "MISSING", `${label}: not recorded. A blank is never zero.`);

  /* QRISK3: sample outputs from the licensed engine, never calculated in Pulse */
  const q = ep.qrisk;
  const qNote = `${QRISK3_SOURCE_NOTE}`;
  const qMissing = (label: string): ViewerCell => !q ? grey(label, "Pending", "PENDING", `${label}: no engine output yet. ${qNote}`)
    : !q.eligible ? grey(label, "N/A", "N/A", `${label}: ${q.reason || "not calculated for this participant"}. ${qNote}`)
    : grey(label, "Pending", "PENDING", `${label}: awaiting the licensed engine. ${qNote}`);
  const rr = q?.relativeRisk ?? null;
  const rrBand = relativeRiskBand(rr);
  const heartBand: Band = q?.heartAge == null ? "not_tested" : q.heartAge < age ? "normal" : rrBand;
  const heartAge = q && q.eligible && q.heartAge != null ? keyed("qrisk_rr", gauged(q.heartAge, { hi: age }, "years", banded("Qrisk Heart Age", String(q.heartAge), heartBand, q.heartAge < age ? "BELOW AGE" : heartBand === "normal" ? "NORMAL" : heartBand === "borderline" ? "BORDERLINE" : "RAISED", `QRISK3 heart age ${q.heartAge}, real age ${age}. ${qNote}`), [Math.max(18, age - 25), age + 30])) : qMissing("Qrisk Heart Age");
  const score = q && q.eligible && q.score10y != null ? plain("Qrisk score", `${q.score10y.toFixed(2)}%`, `10-year cardiovascular risk. ${qNote}`) : qMissing("Qrisk score");
  const relRisk = q && q.eligible && rr != null ? keyed("qrisk_rr", gauged(rr, { hi: 1.0 }, undefined, banded("Qrisk Rel Risk", rr.toFixed(1), rrBand, rrBand === "normal" ? "NORMAL" : rrBand === "borderline" ? "BORDERLINE" : "RAISED", `QRISK3 relative risk ${rr.toFixed(1)}, normal less than 1.0. ${qNote}`), [0, 3])) : qMissing("Qrisk Rel Risk");

  /* measurements */
  const sys = val("bpSys"), dia = val("bpDia");
  const bpS = sys != null ? bpCategory(sys, 0) : null, bpD = dia != null ? bpCategory(0, dia) : null;
  const bmi = b.bmi, bmiC = bmiCategory(bmi);
  const waist = val("waistCm"), wc = waistCategory(waist, sex);
  const smoker = rf.smoker;

  /* history */
  const cond = CONDITIONS.map(([k, label]) => ({ label, v: typeof f[k] === "boolean" ? (f[k] as boolean) : typeof answers[k] === "boolean" ? (answers[k] as boolean) : null }));
  const condText = cond.some((x) => x.v !== null) ? (cond.filter((x) => x.v).map((x) => x.label).join("; ") || "None") : null;
  const strokeYes = f.strokeOrMi === "Yes" || answers.strokeOrMi === true;
  const strokeAge = typeof f.strokeOrMiAge === "number" ? f.strokeOrMiAge : typeof answers.strokeOrMiAge === "number" ? answers.strokeOrMiAge : null;
  const meds = QRISK_MEDS.filter(([k]) => f[k] === true).map(([, l]) => l);
  const relevant = [strokeYes ? `Stroke or MI${strokeAge ? ` at ${strokeAge}` : ""}` : null, rf.highBpHistory && rf.highBpHistory !== "No" ? `High BP: ${rf.highBpHistory}` : null, ...meds].filter(Boolean) as string[];
  const relevantText = relevant.length ? relevant.join("; ") : (f.strokeOrMi || rf.highBpHistory ? "None" : null);

  /* ECG and urine */
  const eb = ecgBand(c);
  const ecg = f.ecg === "Done"
    ? keyed("ecg", { long: true, ...banded("ECG", String(f.ecgAdvice || "Advice not recorded"), eb, eb === "normal" ? "NORMAL" : eb === "borderline" ? "BORDERLINE" : eb === "abnormal" ? "ABNORMAL" : "NOT TESTED", `ECG machine advice: ${String(f.ecgAdvice || "not recorded")}${f.manualPulse ? `. Manual pulse ${String(f.manualPulse).toLowerCase()}` : ""}. ${NURSE}`) })
    : grey("ECG", f.ecg === "Not Done" ? "Not done" : "Not recorded", f.ecg === "Not Done" ? "NOT DONE" : "MISSING", `ECG ${f.ecg === "Not Done" ? "not done" : "not recorded"} at the screen.`);
  const urineDone = f.urinalysis !== "Not done";
  const urine = (label: string, key: "glucose" | "wcc" | "blood" | "protein"): ViewerCell => {
    const v = c.urine ? c.urine[key] : undefined;
    if (!urineDone || !v || v === "Not done") return grey(label, urineDone && !v ? "Missing" : "Not done", urineDone && !v ? "MISSING" : "NOT DONE", `${label}: ${urineDone && !v ? "not recorded" : "not done"}. Dipstick.`);
    const ub = urineBand(v, key);
    return keyed(`urine_${key}`, banded(label, v, ub, ub === "normal" ? "NORMAL" : ub === "borderline" ? "BORDERLINE" : "RAISED", `${label} ${v}, normal Nil. Point-of-care dipstick.`));
  };
  const notDone: string[] = (Object.keys(m) as MeasureKey[]).filter((k) => m[k].state === "not_done" || m[k].state === "declined").map((k) => `${MEASURE_RULES[k].label} ${m[k].state === "declined" ? "declined" : "not done"}`);
  if (f.ecg === "Not Done") notDone.push("ECG not done");
  if (f.urinalysis === "Not done") notDone.push("Urinalysis not done");
  if (f.bloodsTaken === "No") notDone.push("Bloods not taken");

  const female = sex === "female", male = sex === "male";
  const sexNa = (label: string, who: string) => grey(label, "N/A", "N/A", `${label}: asked of ${who} only.`);
  const fit = String(f.fitKit || "");
  const psaTaken = String(f.psaTaken || "");

  const col1: ViewerCell[] = [
    plain("FirstName", person.given, "Booking record."),
    plain("Age", String(age), `Age on the date of screen, from the date of birth.`),
    heartAge,
    score,
    relRisk,
    plain("Family History of CVD", tf(rf.familyHistoryCvd), "Stroke or MI in a parent or sibling under 60. Nurse form, prefilled from the questionnaire."),
    plain("Diabetes", rf.diabetes, "Nurse form, prefilled from the questionnaire."),
    plain("Hypertension Treatment", tf(rf.hypertensionTreatment), "Treated hypertension. Nurse form."),
    smoker === "No" ? banded("Smoker", "No", "normal", "NORMAL", "Do you smoke: No. Nurse form.") : plain("Smoker", smoker, "Do you smoke. Nurse form. Vaping is not smoking.", true),
    sys != null && bpS ? keyed("bp", gauged(sys, { hi: 140 }, "mmHg", banded("BP Systolic", String(sys), bpS.band, bpS.word, `Systolic ${sys} mmHg. Ideal less than 120; 140 or more is raised. ${NURSE}`), [80, 200])) : absent("bpSys", "BP Systolic"),
    dia != null && bpD ? keyed("bp", gauged(dia, { hi: 90 }, "mmHg", banded("BP Diastolic", String(dia), bpD.band, bpD.word, `Diastolic ${dia} mmHg. Ideal less than 80; 90 or more is raised. ${NURSE}`), [40, 130])) : absent("bpDia", "BP Diastolic"),
    bmi != null ? keyed("bmi", gauged(bmi, { lo: 18, hi: 25 }, "kg/m²", banded("BMI", bmi.toFixed(1), bmiC.band, bmiC.word, `BMI ${bmi.toFixed(1)} kg/m², normal 18 to 25. Calculated from height and weight.`), [14, 42])) : grey("BMI", "Not calculated", "MISSING", "BMI: height or weight missing."),
    waist != null ? keyed("waist", gauged(waist, { hi: wc.limit }, "cm", banded("Waist", String(waist), wc.band, wc.word, `Waist ${waist} cm, normal less than ${wc.limit} cm for this participant. ${NURSE}`), [50, 140])) : absent("waistCm", "Waist"),
    plain("Muscular/Fit", yesNo(rf.muscularPhysique), "Muscular physique. Nurse form."),
    rf.bloodsTaken === true ? banded("Bloods Taken?", "Yes", "normal", "NORMAL", "Bloods taken at the screen. Nurse form.") : rf.bloodsTaken === false ? grey("Bloods Taken?", "No", "NOT TAKEN", "Bloods not taken. Nurse form.") : grey("Bloods Taken?", "Not recorded", "MISSING", "Bloods taken: not recorded."),
    lab("Cholesterol total", "TC"),
    lab("Cholesterol HDL", "HDL"),
    lab("Cholesterol Non-HDL", "NONHDL"),
    lab("Cholesterol LDL", "LDL"),
    lab("Triglycerides", "TG"),
    plain("Relevant History", relevantText, "Stroke or MI, history of high blood pressure and the QRISK3 medication fields. Nurse form.", true),
    plain("Nurse Comments", c.notes.trim() || null, NURSE, true),
  ];
  const col2: ViewerCell[] = [
    plain("LastName", person.family, "Booking record."),
    plain("Gender", sex === "male" ? "Male" : sex === "female" ? "Female" : null, "Sex at birth as recorded."),
    val("peakFlow") != null ? plain("PEFR", String(val("peakFlow")), "Peak flow in L/min. Nurse form.") : absent("peakFlow", "PEFR"),
    val("peakFlow") != null ? plain("PEFR Result", "Not graded", "No peak flow rule in the illustrative rule set. Interpret against the predicted value.") : grey("PEFR Result", "N/A", "N/A", "Peak flow not recorded."),
    lab("HBA1c", "HBA1C"),
    plain("Medical History", condText, "QRISK3 medical conditions answered TRUE on the nurse form.", true),
    plain("Smoking History", typeof f.smokingHistory === "string" ? f.smokingHistory : null, NURSE, true),
    plain("Medications", rf.medications, "Nurse form, prefilled from the questionnaire.", true),
    ecg,
    plain("ECG Comments", typeof f.ecgComment === "string" ? f.ecgComment : null, "Symptoms and cardiac history. Nurse form.", true),
    plain("Manual Pulse", typeof f.manualPulse === "string" ? f.manualPulse : null, NURSE),
    plain("Alcohol units", rf.alcoholUnitsPerWeek != null ? String(rf.alcoholUnitsPerWeek) : null, "Units per week, from the lifestyle questionnaire."),
    lab("Urea", "UREA"),
    lab("Creatinine", "CREAT"),
    female ? plain("Menstruating?", tf(typeof f.menstruating === "boolean" ? f.menstruating : null), "Blood in urine is common during menstruation. Nurse form.") : sexNa("Menstruating?", "female participants"),
    urine("Urine Glucose", "glucose"),
    urine("Urine WCC", "wcc"),
    urine("Urine RCC", "blood"),
    urine("Urine Protein", "protein"),
    plain("Unable to complete?", notDone.length ? notDone.join("; ") : "No", "Measurements not done or declined, from the nurse form.", true),
  ];
  const col3: ViewerCell[] = [
    plain("Unique ID", ep.screeningRef, `Precision Health unique ID. Episode ${ep.id}.`),
    plain("Date of Screen", fmtDate(ep.collectedAt), b.session.siteName + "."),
    lab("Haemoglobin", "HB"),
    lab("White Cell Count", "WCC"),
    lab("Platelets", "PLT"),
    lab("Uric Acid", "URATE"),
    lab("PSA", "PSA"),
    lab("Free T4", "FT4"),
    lab("TSH", "TSH"),
    lab("Bilirubin", "BILI"),
    lab("Protein", "TPROT"),
    lab("GGT", "GGT"),
    lab("ALT", "ALT"),
    lab("AST", "AST"),
    lab("Iron", "IRON"),
    lab("Ferritin", "FERR"),
    lab("TIBC", "TIBC"),
    female && age >= 25 ? plain("Cervical Smears", yesNo(answers.cervicalScreening), "Up to date with cervical screening. Questionnaire.") : sexNa("Cervical Smears", "female participants aged 25 or over"),
    female ? plain("Breast Lumps", yesNo(answers.breastLumpsNow), "Undiagnosed breast lumps now. Questionnaire.") : sexNa("Breast Lumps", "female participants"),
    male ? plain("Testicular Lumps", yesNo(answers.testicularLumpsNow), "Undiagnosed testicular lumps now. Questionnaire.") : sexNa("Testicular Lumps", "male participants"),
    male ? (psaTaken ? plain("PSA taken?", psaTaken, "PSA taken at the screen. Nurse form.") : grey("PSA taken?", age > 45 ? "Not recorded" : "N/A", age > 45 ? "MISSING" : "N/A", "PSA is offered to men over 45, or younger men who ask.")) : sexNa("PSA taken?", "male participants"),
    fit === "Yes" ? lab("FIT Result", "FIT") : grey("FIT Result", fit === "Recommended but declined" ? "Declined" : fit === "No" ? "Not done" : "Not recorded", fit === "Recommended but declined" ? "DECLINED" : fit === "No" ? "NOT DONE" : "MISSING", `FIT kit given: ${fit || "not recorded"}. Nurse form.`),
  ];

  /* expanded: every panel test not already in the grid, grouped */
  const inGrid = new Set<AnalyteCode>([...col1, ...col2, ...col3].map((x) => x.code).filter((x): x is AnalyteCode => !!x));
  const expanded = ANALYTE_GROUPS.map((g) => ({
    group: g.key, title: g.title,
    cells: panel.filter((r) => r.group === g.key && !inGrid.has(r.code)).map((r) => ({ cell: lab(r.name, r.code), range: `${r.rangeText}${r.unit && r.unit !== "ratio" ? ` ${r.unit}` : ""}${r.illustrativeRange ? " (illustrative)" : ""}` })),
  })).filter((g) => g.cells.length);
  const all = [...col1, ...col2, ...col3, ...expanded.flatMap((g) => g.cells.map((x) => x.cell))];
  return {
    cols: [col1, col2, col3], expanded,
    nonNormal: all.filter((x) => x.tone === "borderline" || x.tone === "abnormal"),
    pending: all.filter((x) => !!x.code && ["PENDING", "HELD", "UNIT CHECK"].includes(x.flag)),
    referral: !!ep.nurseReferral || isNurseReferral(c),
    ecgReview: !!c.ecgReview || needsEcgReview(c),
  };
}

/* ---- rendering ---- */
/* Three ways to read the same cells, picked in the header and remembered per browser:
   Ranges plots each value against its normal range, grouped by body system; Tiles shows the
   numbers large; Sheet is the client's reporting viewer layout. Severity sets the visual weight
   in all three: normal values stay quiet, borderline and abnormal values carry the colour, and
   anything not graded is hatched grey. Hue order is the client's (green, yellow, orange, grey) and
   no state relies on colour alone: borderline and abnormal print their flag word, normal prints a
   tick (or its word when it is not plain NORMAL, such as IDEAL). The band bar above doubles as a
   filter, each out-of-range chip spotlights its value, and the inspector gives unit, range and source. */
type ViewMode = "ranges" | "tiles" | "sheet";
const VIEW_KEY = "phr-results-view";
function readView(): ViewMode {
  try { const v = window.localStorage.getItem(VIEW_KEY); return v === "tiles" || v === "sheet" ? v : "ranges"; } catch { return "ranges"; }
}
function saveView(v: ViewMode) {
  try { window.localStorage.setItem(VIEW_KEY, v); } catch { /* storage blocked: the choice lasts for this visit */ }
}

const BANDS: Array<{ band: Band; text: string; hint: string }> = [
  { band: "normal", text: "Normal", hint: "Within the displayed limit" },
  { band: "borderline", text: "Borderline", hint: "Just outside the displayed limit" },
  { band: "abnormal", text: "Abnormal", hint: "Abnormal or raised" },
  { band: "not_tested", text: "Not tested", hint: "Not tested, pending, held or not applicable" },
];
const isFinding = (c: ViewerCell) => c.tone === "borderline" || c.tone === "abnormal";
/** A grey cell that already says "Not done" or "Pending" needs no second word. */
const flagOf = (c: ViewerCell) => (c.flag && c.flag.toLowerCase() !== c.value.toLowerCase() ? c.flag : "");
const prettyUnit = (u: string) => u.replace("x10^9/L", "×10⁹/L").replace("umol/L", "µmol/L").replace("ug/L", "µg/L");

/* body-system sections for the Ranges and Tiles views; laboratory cells follow their analyte group */
type SectKey = AnalyteGroup | "profile" | "body" | "heart" | "urine" | "history" | "checks" | "notes";
const SECTIONS: Array<{ key: SectKey; title: string }> = [
  { key: "body", title: "Body measurements" }, { key: "heart", title: "Heart" }, { key: "cholesterol", title: "Cholesterol" },
  { key: "glucose", title: "Blood sugar" }, { key: "kidney", title: "Kidney" }, { key: "fbc", title: "Full blood count" },
  { key: "liver", title: "Liver" }, { key: "thyroid", title: "Thyroid" }, { key: "iron", title: "Iron" },
  { key: "vitamins_minerals", title: "Vitamins and minerals" }, { key: "cancer", title: "Cancer screening" }, { key: "urine", title: "Urine dipstick" },
  { key: "history", title: "History and lifestyle" }, { key: "checks", title: "Self-checks" }, { key: "notes", title: "Screening notes" },
];
const SECT_OF: Record<string, SectKey> = {
  FirstName: "profile", LastName: "profile", Age: "profile", Gender: "profile", "Unique ID": "profile", "Date of Screen": "profile",
  "BP Systolic": "body", "BP Diastolic": "body", BMI: "body", Waist: "body", PEFR: "body", "PEFR Result": "body", "Muscular/Fit": "body",
  "Qrisk Heart Age": "heart", "Qrisk score": "heart", "Qrisk Rel Risk": "heart", ECG: "heart", "ECG Comments": "heart", "Manual Pulse": "heart",
  "Urine Glucose": "urine", "Urine WCC": "urine", "Urine RCC": "urine", "Urine Protein": "urine", "Menstruating?": "urine",
  "Family History of CVD": "history", Diabetes: "history", "Hypertension Treatment": "history", Smoker: "history", "Smoking History": "history",
  "Medical History": "history", Medications: "history", "Relevant History": "history", "Alcohol units": "history",
  "Cervical Smears": "checks", "Breast Lumps": "checks", "Testicular Lumps": "checks", "PSA taken?": "checks", "FIT Result": "cancer",
};
const sectOf = (c: ViewerCell): SectKey => (c.code ? ANALYTES[c.code].group : SECT_OF[c.label] || "notes");

/** Pointer handlers and highlight state shared by every view. */
interface ItemProps { cls: (c: ViewerCell) => string; onInspect: (c: ViewerCell) => void }

/** Value with its unit. Grey cells carry their status word instead of a number, so no unit. */
function Val({ c }: { c: ViewerCell }) {
  return <>{c.value}{c.unit && c.tone !== "not_tested" ? <small className="phr-u">{prettyUnit(c.unit)}</small> : null}</>;
}

/** Tick for plain normal, the word for anything else graded. */
function Mark({ c }: { c: ViewerCell }) {
  if (c.tone === "normal") {
    return c.flag && c.flag !== "NORMAL"
      ? <span className="phr-mark">{c.flag}</span>
      : <span className="phr-mark is-tick" role="img" aria-label="Normal" title="Normal"><Icon name="check" size={12} stroke={2.4} /></span>;
  }
  return isFinding(c) ? <span className="phr-mark is-word">{c.flag}</span> : null;
}

function ValueCell({ c, onInspect }: { c: ViewerCell; onInspect: (c: ViewerCell) => void }) {
  const flag = flagOf(c);
  const cls = "phr-vw-v" + (c.tone === "plain" ? (c.value === "Not recorded" ? " is-empty" : "") : " is-banded") + (c.long ? " is-long" : "");
  return (
    <dd className={cls} data-band={c.tone} title={c.detail}
      onMouseEnter={() => onInspect(c)} onClick={() => onInspect(c)}
      aria-label={`${c.label}: ${c.value}${c.flag ? `, ${c.flag.toLowerCase()}` : ""}`}>
      <span className="phr-vw-val">{c.value}</span>
      {flag ? <span className="phr-vw-flag">{flag}</span> : null}
    </dd>
  );
}

/** The gauge axis for a cell, or null when it has no numeric value or no limit. */
function gaugeOf(c: ViewerCell): { pos: number; zl: number; zr: number; lo?: number; hi?: number; tick: (x: number) => string } | null {
  const v = c.num;
  const lo = c.range && Number.isFinite(c.range.lo) ? c.range.lo : undefined;
  const hi = c.range && Number.isFinite(c.range.hi) ? c.range.hi : undefined;
  if (v === undefined || !Number.isFinite(v) || (lo === undefined && hi === undefined)) return null;
  let a: number, z: number;
  if (c.scale) [a, z] = c.scale;
  else if (lo !== undefined && hi !== undefined) { const s = hi - lo || Math.abs(hi) || 1; a = Math.max(0, lo - s * 0.6); z = hi + s * 0.6; }
  else if (hi !== undefined) { a = 0; z = hi * 1.7; }
  else { a = 0; z = (lo as number) * 2.2; }
  const pad = (z - a) * 0.06;
  if (v < a) a = v - pad;
  if (v > z) z = v + pad;
  if (!(z > a)) return null;
  const pct = (x: number) => Math.max(0, Math.min(100, ((x - a) / (z - a)) * 100));
  return {
    pos: pct(v), zl: lo !== undefined ? pct(lo) : 0, zr: hi !== undefined ? pct(hi) : 100, lo, hi,
    tick: (x: number) => (c.code ? x.toFixed(ANALYTES[c.code].decimals) : String(x)),
  };
}

/** Where a value sits against its limits. The shaded zone is the normal range. */
function RangeGauge({ c, mini }: { c: ViewerCell; mini?: boolean }) {
  const g = gaugeOf(c);
  if (!g) return null;
  return (
    <div className={"phr-gauge" + (mini ? " is-mini" : "")} aria-hidden="true">
      <div className="phr-gauge-track">
        <span className="phr-gauge-zone" style={{ left: `${g.zl}%`, width: `${g.zr - g.zl}%` }} />
        <span className="phr-gauge-pos" style={{ "--p": g.pos.toFixed(2) } as CSSProperties} />
      </div>
      {mini ? null : (
        <div className="phr-gauge-ticks">
          {g.lo !== undefined ? <span style={{ left: `${g.zl}%` }}>{g.tick(g.lo)}</span> : null}
          {g.hi !== undefined ? <span style={{ left: `${g.zr}%` }}>{g.tick(g.hi)}</span> : null}
        </div>
      )}
    </div>
  );
}

function Inspector({ c }: { c: ViewerCell | null }) {
  if (!c) return <div className="phr-vw-insp is-empty" aria-hidden="true"><Icon name="eye" size={14} />Point at a value for its unit, range and source.</div>;
  return (
    <div className="phr-vw-insp" data-band={c.tone} aria-hidden="true">
      <div className="phr-vw-insp-head">
        <span className="phr-vw-insp-label">{c.label}</span>
        {c.long ? null : <span className="phr-vw-insp-val"><Val c={c} /></span>}
        {flagOf(c) && c.tone !== "plain" ? <span className="phr-vw-insp-flag">{flagOf(c)}</span> : null}
      </div>
      <div className="phr-vw-insp-body">
        <RangeGauge c={c} />
        <p>{c.detail}</p>
      </div>
    </div>
  );
}

/* ---- Ranges: one row per value, plotted against its limits ---- */
function RangeRow({ c, i, p }: { c: ViewerCell; i: number; p: ItemProps }) {
  const g = gaugeOf(c);
  return (
    <div className={"phr-rg-row " + p.cls(c) + (g ? " has-gauge" : "") + (c.long ? " is-long" : "")} data-band={c.tone} style={{ "--i": i } as CSSProperties}
      title={c.detail} onMouseEnter={() => p.onInspect(c)} onClick={() => p.onInspect(c)}>
      <span className="phr-rg-l">{c.label}</span>
      {g ? <RangeGauge c={c} /> : null}
      <span className={"phr-rg-v" + (c.tone === "not_tested" ? " is-na" : c.value === "Not recorded" ? " is-empty" : "")}><Val c={c} /><Mark c={c} /></span>
    </div>
  );
}

/* ---- Tiles: the number first ---- */
function Tile({ c, i, p }: { c: ViewerCell; i: number; p: ItemProps }) {
  return (
    <div className={"phr-tv-tile " + p.cls(c)} data-band={c.tone} style={{ "--i": i } as CSSProperties}
      title={c.detail} onMouseEnter={() => p.onInspect(c)} onClick={() => p.onInspect(c)}>
      <span className="phr-tv-l">{c.label}</span>
      <span className={"phr-tv-v" + (c.value === "Not recorded" ? " is-empty" : "")}><Val c={c} /></span>
      <span className="phr-tv-foot"><RangeGauge c={c} mini /><Mark c={c} /></span>
    </div>
  );
}

/** Ranges and Tiles: profile facts on one line, then a panel per body system. */
function Sections({ cells, mode, p }: { cells: ViewerCell[]; mode: "ranges" | "tiles"; p: ItemProps }) {
  const profile = cells.filter((c) => sectOf(c) === "profile");
  const groups = SECTIONS.map((s) => ({ ...s, cells: cells.filter((c) => sectOf(c) === s.key) })).filter((s) => s.cells.length);
  return (
    <>
      <dl className="phr-facts">
        {profile.map((c) => <div key={c.label}><dt>{c.label}</dt><dd>{c.value}</dd></div>)}
      </dl>
      <div className={mode === "ranges" ? "phr-rg" : "phr-rg phr-tv"}>
        {groups.map((s, si) => {
          const finds = s.cells.filter(isFinding);
          const graded = s.cells.filter((c) => c.tone !== "plain" && c.tone !== "not_tested");
          const worst = finds.some((c) => c.tone === "abnormal") ? "abnormal" : "borderline";
          const tiles = s.cells.filter((c) => !c.long), notes = s.cells.filter((c) => c.long);
          return (
            <section key={s.key} className="phr-rg-panel" style={{ "--c": si } as CSSProperties} aria-label={s.title}>
              <header className="phr-rg-head">
                <h4>{s.title}</h4>
                {finds.length ? <span className="phr-rg-count" data-band={worst}>{finds.length} to review</span>
                  : graded.length ? <span className="phr-rg-ok" role="img" aria-label="All graded values normal" title="All graded values normal"><Icon name="check" size={13} stroke={2.4} /></span> : null}
              </header>
              {mode === "ranges" ? s.cells.map((c, i) => <RangeRow key={c.label} c={c} i={i} p={p} />) : (
                <>
                  {tiles.length ? <div className="phr-tv-grid">{tiles.map((c, i) => <Tile key={c.label} c={c} i={i} p={p} />)}</div> : null}
                  {notes.map((c, i) => <RangeRow key={c.label} c={c} i={tiles.length + i} p={p} />)}
                </>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}

export function ReviewSheet({ b, advice }: { b: Bundle; advice: ReactNode }) {
  const state = usePhState();
  const [view, setView] = useState<ViewMode>(readView);
  const [expandedOn, setExpandedOn] = useState(false);
  const [inspect, setInspect] = useState<ViewerCell | null>(null);
  const [focus, setFocus] = useState<Band | null>(null);
  const [spot, setSpot] = useState<string | null>(null);
  // A new episode drops the previous one's inspected and spotlit value; the view and band filter carry over.
  const [epId, setEpId] = useState(b.episode.id);
  if (epId !== b.episode.id) { setEpId(b.episode.id); setInspect(null); setSpot(null); }
  const v = buildViewer(state, b);
  if (!v) return null;

  const extraCells = v.expanded.flatMap((g) => g.cells.map((x) => x.cell));
  const shown = expandedOn ? [...v.cols.flat(), ...extraCells] : v.cols.flat();
  const graded = shown.filter((c) => c.tone !== "plain");
  const count = (band: Band) => graded.filter((c) => c.tone === band).length;
  const active = focus && count(focus) ? focus : null;
  const findings = shown.filter(isFinding).sort((x, y) => (x.tone === y.tone ? 0 : x.tone === "abnormal" ? -1 : 1));
  const hiddenFindings = expandedOn ? 0 : extraCells.filter(isFinding).length;
  const dim = !!spot || !!active;
  const point = (c: ViewerCell) => { setSpot(c.label); setInspect(c); };
  const p: ItemProps = {
    cls: (c) => "phr-it" + (dim && (spot ? c.label === spot : c.tone === active) ? " is-lit" : ""),
    onInspect: setInspect,
  };
  const pickView = (m: ViewMode) => { setView(m); saveView(m); };

  const row = (c: ViewerCell, i: number, col: number, extra?: ReactNode, cls = "") => (
    <div key={c.label} className={"phr-vw-row " + p.cls(c) + cls} data-band={c.tone} style={{ "--i": i, "--c": col } as CSSProperties}>
      <dt className="phr-vw-l">{c.label}</dt>
      <ValueCell c={c} onInspect={setInspect} />
      {extra}
    </div>
  );

  return (
    <section className="ph-card phr-vw" aria-label="Results viewer">
      <div className="phr-vw-head">
        <div className="phr-vw-titlebox">
          <h3 className="phr-vw-title">Results <span className="phr-mono">{b.episode.screeningRef}</span></h3>
          <DemoTag>Sample data</DemoTag>
        </div>
        <Segmented<ViewMode> value={view} onChange={pickView} label="How to show the results" options={[
          { id: "ranges", label: <span className="phr-vw-mode"><Icon name="chart" size={13} />Ranges</span> },
          { id: "tiles", label: <span className="phr-vw-mode"><Icon name="grip" size={13} />Tiles</span> },
          { id: "sheet", label: <span className="phr-vw-mode"><Icon name="list" size={13} />Sheet</span> },
        ]} />
      </div>

      <div className="phr-vw-sum" key={"sum-" + b.episode.id}>
        <div className="phr-vw-bar" aria-hidden="true">
          {BANDS.map((x) => count(x.band) ? <span key={x.band} data-band={x.band} className={active && active !== x.band ? "is-off" : undefined} style={{ flexGrow: count(x.band) }} /> : null)}
        </div>
        <div className="phr-vw-keys" role="group" aria-label="Show one band">
          {BANDS.map((x) => {
            const n = count(x.band);
            return (
              <button key={x.band} type="button" className="phr-vw-key" data-band={x.band} aria-pressed={active === x.band} disabled={!n}
                onClick={() => setFocus(active === x.band ? null : x.band)} title={active === x.band ? "Show every value" : `${x.hint}. Click to show only these.`}>
                <i /><b>{n}</b>{x.text}
              </button>
            );
          })}
          {active ? <button type="button" className="phr-vw-link" onClick={() => setFocus(null)}>Show all</button> : null}
          <label className="phr-vw-toggle" title="Add the rest of the Comprehensive panel">
            <span>Expanded panel{extraCells.length ? <span className="ph-faint ph-num"> +{extraCells.length}</span> : null}</span>
            <Switch on={expandedOn} onChange={setExpandedOn} label="Expanded panel" />
          </label>
        </div>
      </div>

      {findings.length || hiddenFindings ? (
        <div className="phr-vw-finds" aria-label="Borderline and abnormal values">
          <span className="phr-vw-finds-title"><Icon name="flag" size={12} stroke={2} />To review</span>
          {findings.map((c) => (
            <button key={c.label} type="button" className="phr-vw-find" data-band={c.tone}
              onMouseEnter={() => point(c)} onMouseLeave={() => setSpot(null)} onFocus={() => point(c)} onBlur={() => setSpot(null)} onClick={() => point(c)}
              aria-label={`${c.label} ${c.value}${c.unit ? ` ${c.unit}` : ""}, ${c.flag.toLowerCase()}`}>
              <span className="phr-vw-find-l">{c.label}</span>
              <b>{c.value}</b>
              <span className="phr-vw-find-f">{c.flag}</span>
            </button>
          ))}
          {hiddenFindings ? <button type="button" className="phr-vw-link" onClick={() => setExpandedOn(true)}>{hiddenFindings} more in the expanded panel</button> : null}
        </div>
      ) : (
        <div className="phr-vw-finds is-clear"><Icon name="check" size={13} stroke={2} />Nothing borderline or abnormal.</div>
      )}

      <div className={"phr-vw-body" + (dim ? " is-dim" : "")} key={"body-" + view + "-" + b.episode.id}>
        {view === "sheet" ? (
          <>
            <div className="phr-vw-grid">
              {v.cols.map((col, ci) => <dl key={ci} className="phr-vw-col">{col.map((c, i) => row(c, i, ci))}</dl>)}
            </div>
            {expandedOn ? (
              <div className="phr-vw-more" aria-label="Expanded panel">
                {v.expanded.map((g, gi) => (
                  <div key={g.group} className="phr-vw-group">
                    <div className="phr-vw-group-title">{g.title}</div>
                    <dl className="phr-vw-col">
                      {g.cells.map(({ cell, range }, i) => row(cell, i, gi, <span className="phr-vw-range">{range}</span>, " phr-vw-row-x"))}
                    </dl>
                  </div>
                ))}
              </div>
            ) : null}
          </>
        ) : <Sections cells={shown} mode={view} p={p} />}
      </div>

      <Inspector c={inspect} />
      <div className="phr-vw-note">
        <span title={QRISK3_SOURCE_NOTE}>QRISK3: licensed engine, sample output.</span>
        <span>{RULE_SET_LABEL}</span>
      </div>

      <div className="phr-vw-advice">
        <div className="phr-vw-advice-label">NEW ADVICE</div>
        <div className="phr-vw-advice-body">{advice}</div>
      </div>
    </section>
  );
}

/* ---- clinical alerts above the viewer ---- */
export function ClinicalAlerts({ b }: { b: Bundle }) {
  const state = usePhState();
  const c = b.episode.capture;
  const ref = b.episode.nurseReferral;
  const referral = !!ref || isNurseReferral(c);
  const ecg = !!c.ecgReview || needsEcgReview(c);
  if (!referral && !ecg) return null;
  const comment = (ref && ref.comment) || c.notes.trim();
  return (
    <>
      {referral ? (
        <Banner tone="bad" icon="flag">
          <b>Nurse referral: significantly abnormal results, refer to doctor.</b>
          {ref ? <span className="phr-sub" style={{ marginLeft: 6 }}>{ref.by ? `${staffName(state, ref.by)}, ` : ""}{fmtShortDateTime(ref.at)}</span> : null}
          {comment ? <div style={{ marginTop: 4 }}>Nurse comment: &ldquo;{comment}&rdquo;</div> : null}
          <div className="phr-sub" style={{ marginTop: 3 }}>Individual review only. The all normal shortcut is not available for this episode.</div>
        </Banner>
      ) : null}
      {ecg ? (
        <Banner tone="warn" icon="heart">
          <b>ECG review requested.</b> Irregular ECG ({String(c.form?.ecgAdvice || "advice not recorded")}) with an irregular manual pulse.
          {c.ecgReview ? ` ECG photo shared to the clinical channel ${fmtShortDateTime(c.ecgReview.at)} (simulated).` : " ECG photo to be shared to the clinical channel."}
        </Banner>
      ) : null}
    </>
  );
}
