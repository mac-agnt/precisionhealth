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
import type { ReactNode } from "react";
import {
  ANALYTES, ANALYTE_GROUPS, MEASURE_RULES, QRISK3_SOURCE_NOTE, RULE_SET_LABEL, ageOn, bmiCategory, bpCategory, ecgBand, fmtDate, fmtShortDateTime,
  isNurseReferral, localDateOf, membershipOf, needsEcgReview, panelResults, relativeRiskBand, riskFactorSummary, staffName, urineBand, waistCategory,
} from "../../model";
import type { AnalyteCode, AnalyteGroup, Band, MeasureKey, PanelResult, PhState } from "../../model";
import { usePhState } from "../../store";
import { DemoTag, Switch } from "../../ui";
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
}

const plain = (label: string, value: string | null | undefined, detail: string, long?: boolean): ViewerCell =>
  value === null || value === undefined || value === ""
    ? { label, value: "Not recorded", tone: "plain", flag: "", detail: `${label}: not recorded. ${detail}`, long }
    : { label, value, tone: "plain", flag: "", detail: `${label}: ${value}. ${detail}`, long };
const grey = (label: string, value: string, flag: string, detail: string): ViewerCell => ({ label, value, tone: "not_tested", flag, detail });
const banded = (label: string, value: string, band: Band, flag: string, detail: string): ViewerCell =>
  band === "not_tested" ? grey(label, value, flag || "NOT TESTED", detail) : { label, value, tone: band, flag: flag || BAND_LOOK[band].label.toUpperCase(), detail };
const keyed = (key: string, c: ViewerCell): ViewerCell => ({ ...c, key });
const tf = (v: boolean | null | undefined) => (v === true ? "TRUE" : v === false ? "FALSE" : null);
const yesNo = (v: unknown) => (v === true ? "Yes" : v === false ? "No" : typeof v === "string" && v ? v : null);

/** One laboratory row from panelResults. Pending, held and unconfirmed results are grey, never normal. */
function labCell(label: string, r: PanelResult | undefined, code: AnalyteCode, lineOf: (rowId: string) => string): ViewerCell {
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
  return cell(banded(label, r.resultText, r.band, flag,
    `${a.name} ${r.resultText}${unit}. Normal range ${r.rangeText}${r.illustrativeRange ? " (illustrative, to confirm)" : ""}. ${src}${o.version > 1 ? `, version ${o.version}` : ""}.${legacy}`));
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
  const lab = (label: string, code: AnalyteCode) => labCell(label, by.get(code), code, lineOf);
  const ep = b.episode, c = ep.capture, f = c.form || {}, m = c.measures, person = b.person;
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
  const heartAge = q && q.eligible && q.heartAge != null ? keyed("qrisk_rr", banded("Qrisk Heart Age", String(q.heartAge), heartBand, q.heartAge < age ? "BELOW AGE" : heartBand === "normal" ? "NORMAL" : heartBand === "borderline" ? "BORDERLINE" : "RAISED", `QRISK3 heart age ${q.heartAge}, real age ${age}. ${qNote}`)) : qMissing("Qrisk Heart Age");
  const score = q && q.eligible && q.score10y != null ? plain("Qrisk score", `${q.score10y.toFixed(2)}%`, `10-year cardiovascular risk. ${qNote}`) : qMissing("Qrisk score");
  const relRisk = q && q.eligible && rr != null ? keyed("qrisk_rr", banded("Qrisk Rel Risk", rr.toFixed(1), rrBand, rrBand === "normal" ? "NORMAL" : rrBand === "borderline" ? "BORDERLINE" : "RAISED", `QRISK3 relative risk ${rr.toFixed(1)}, normal less than 1.0. ${qNote}`)) : qMissing("Qrisk Rel Risk");

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
    sys != null && bpS ? keyed("bp", banded("BP Systolic", String(sys), bpS.band, bpS.word, `Systolic ${sys} mmHg. Ideal less than 120; 140 or more is raised. ${NURSE}`)) : absent("bpSys", "BP Systolic"),
    dia != null && bpD ? keyed("bp", banded("BP Diastolic", String(dia), bpD.band, bpD.word, `Diastolic ${dia} mmHg. Ideal less than 80; 90 or more is raised. ${NURSE}`)) : absent("bpDia", "BP Diastolic"),
    bmi != null ? keyed("bmi", banded("BMI", bmi.toFixed(1), bmiC.band, bmiC.word, `BMI ${bmi.toFixed(1)} kg/m², normal 18 to 25. Calculated from height and weight.`)) : grey("BMI", "Not calculated", "MISSING", "BMI: height or weight missing."),
    waist != null ? keyed("waist", banded("Waist", String(waist), wc.band, wc.word, `Waist ${waist} cm, normal less than ${wc.limit} cm for this participant. ${NURSE}`)) : absent("waistCm", "Waist"),
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
function ValueCell({ c, onInspect }: { c: ViewerCell; onInspect: (c: ViewerCell) => void }) {
  const look = c.tone === "plain" ? null : BAND_LOOK[c.tone];
  // A grey cell that already says "Not done" or "Pending" needs no second word.
  const flag = c.flag && c.flag.toLowerCase() !== c.value.toLowerCase() ? c.flag : "";
  return (
    <dd className={"phr-vw-v" + (look ? " is-banded" : "") + (c.long ? " is-long" : "")} title={c.detail}
      style={look ? { background: look.fill, color: look.ink } : undefined}
      onMouseEnter={() => onInspect(c)} onClick={() => onInspect(c)}
      aria-label={`${c.label}: ${c.value}${c.flag ? `, ${c.flag.toLowerCase()}` : ""}`}>
      <span className="phr-vw-val">{c.value}</span>
      {flag ? <span className="phr-vw-flag">{flag}</span> : null}
    </dd>
  );
}

const LEGEND: Array<{ band: Band; text: string }> = [
  { band: "normal", text: "Normal" }, { band: "borderline", text: "Borderline" }, { band: "abnormal", text: "Abnormal or raised" }, { band: "not_tested", text: "Not tested, pending or N/A" },
];

export function ReviewSheet({ b, advice }: { b: Bundle; advice: ReactNode }) {
  const state = usePhState();
  const [expandedOn, setExpandedOn] = useState(false);
  const [inspect, setInspect] = useState<ViewerCell | null>(null);
  const v = buildViewer(state, b);
  if (!v) return null;
  const extra = v.expanded.reduce((n, g) => n + g.cells.length, 0);
  return (
    <section className="ph-card phr-vw" aria-label="Results viewer">
      <div className="phr-vw-head">
        <div className="ph-grow" style={{ minWidth: 0 }}>
          <h3 className="phr-sec-title" style={{ margin: 0 }}>Results viewer <span className="phr-mono ph-faint" style={{ fontWeight: 500 }}>{b.episode.screeningRef}</span></h3>
          <div className="phr-vw-legend" aria-label="Colour key">
            {LEGEND.map((l) => <span key={l.band}><i style={{ background: BAND_LOOK[l.band].fill }} />{l.text}</span>)}
            <span><i className="is-plain" />Recorded, not graded</span>
          </div>
        </div>
        <label className="phr-vw-toggle">
          <span>Expanded panel{extra ? <span className="ph-faint ph-num"> +{extra}</span> : null}</span>
          <Switch on={expandedOn} onChange={setExpandedOn} label="Expanded panel" />
        </label>
        <DemoTag>Sample data</DemoTag>
      </div>

      <div className="phr-vw-grid">
        {v.cols.map((col, i) => (
          <dl key={i} className="phr-vw-col">
            {col.map((c) => (
              <div key={c.label} className="phr-vw-row">
                <dt className="phr-vw-l">{c.label}</dt>
                <ValueCell c={c} onInspect={setInspect} />
              </div>
            ))}
          </dl>
        ))}
      </div>

      {expandedOn ? (
        <div className="phr-vw-more" aria-label="Expanded panel">
          {v.expanded.map((g) => (
            <div key={g.group} className="phr-vw-group">
              <div className="phr-vw-group-title">{g.title}</div>
              <dl className="phr-vw-col">
                {g.cells.map(({ cell, range }) => (
                  <div key={cell.label} className="phr-vw-row phr-vw-row-x">
                    <dt className="phr-vw-l">{cell.label}</dt>
                    <ValueCell c={cell} onInspect={setInspect} />
                    <span className="phr-vw-range">{range}</span>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      ) : null}

      <div className="phr-vw-inspect" aria-hidden="true">{inspect ? inspect.detail : "Point at a value to see its unit, range and source."}</div>
      <div className="phr-vw-note">
        <span title={QRISK3_SOURCE_NOTE}>QRISK3 rows: Licensed engine, sample output.</span>
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
