/* The client's "Screening Reference Ranges: Developer Table", encoded test by test.
   asSent keeps every cell exactly as Precision Health sent it. Where a cell could not be encoded
   literally (a gap, a blank, a one-sex entry), the encoding follows the default in RR_QUESTIONS and
   the test lists that question, so the screen shows it as "To confirm". Descriptor words are
   editable defaults. Two tests carry sample history to show versioning: haemoglobin (Neil's own
   example from the 23 October call) and a TSH laboratory bulletin drafted but not published. */
import type { AnalyteCode, StaffId } from "./types";
import type { Iso, LocalDate } from "./time";
import {
  RR_BMI_ETHNIC, anyCohort, band, ge, gt, le, lt,
} from "./referenceRanges";
import type { ReferenceRangesState, RrBand, RrBasis, RrCohort, RrGroup, RrRow, RrTest, RrVersion } from "./referenceRanges";

export const RR_SOURCE_DOC = "Screening Reference Ranges: Developer Table (Precision Health)";
export const RR_SEED_EFFECTIVE: LocalDate = "2026-01-01";
const SEED_AT: Iso = "2026-10-02T09:00:00.000Z";

/* ---------- open questions: each shows the default applied until Precision Health answers ---------- */
export interface RrQuestion { id: string; topic: string; question: string; applied: string }
export const RR_QUESTIONS: RrQuestion[] = [
  { id: "Q-STRUCT", topic: "How ranges are kept", question: "Is the structured page the only place ranges are edited, with the plain-language sentence generated from it?",
    applied: "Yes. Ranges are edited as numbers and descriptor words; the sentence on every test is generated, so it cannot disagree with the numbers." },
  { id: "Q-BANDS", topic: "Band names", question: "Up to five bands per test (low severe, low mild, normal, high mild, high severe), each with its own descriptor word and colour?",
    applied: "Five bands plus a red clinical safety band for blood pressure. Colours follow your report: green normal, yellow mild, orange significant, grey not set. Descriptor words are editable per test." },
  { id: "Q-EDGES", topic: "Edge values", question: "Should every limit be marked as included or excluded, as your table does with ≥ and >?",
    applied: "Yes. Every limit is stored as included or excluded exactly as in your table. Gaps and overlaps this creates are listed on each test." },
  { id: "Q-AGE", topic: "Age", question: "Fixed age bands across all tests, or a free minimum and maximum age per range?",
    applied: "Free per range. The minimum age is included and the maximum is excluded, so PSA 50-60 means 50 to 59." },
  { id: "Q-ETH", topic: "Ethnicity", question: "Which ethnicity categories, and what if ethnicity is not recorded?",
    applied: "The QRISK3 categories already on the nurse form. If ethnicity is not recorded, the all-ethnicities range applies." },
  { id: "Q-PREG", topic: "Pregnancy", question: "Is pregnancy a fourth cohort field, or are pregnant participants sent to clinician review?",
    applied: "A cohort field. Ranges marked non-pregnant do not apply to a pregnant participant, so the result has no range and goes to clinician review." },
  { id: "Q-OVERLAP", topic: "Overlapping cohorts", question: "If two ranges match one person, does the most specific win?",
    applied: "Yes. Two equally specific ranges that could match the same person are flagged on the test and the result goes to review rather than being guessed." },
  { id: "Q-DATE", topic: "Which date decides the range", question: "Sample date, laboratory report date or review date?",
    applied: "Sample collection date. A superadmin can change this in Change control." },
  { id: "Q-RERUN", topic: "What a change affects", question: "Do released results stay on the old version, and are unreleased results re-banded?",
    applied: "Released results keep the version they were judged against. Unreleased results use whatever is in force on their effective date. Before publishing, the draft lists the results it would change." },
  { id: "Q-APPROVE", topic: "Approval", question: "Can one superadmin publish, or must a second approve? Who are the superadmins?",
    applied: "Dr Neil Reddy is the only superadmin. One superadmin may draft and publish. Second approval can be switched on in Change control once another superadmin is added." },
  { id: "Q-BP", topic: "Blood pressure", question: "Normal ends at 120/80 but mild starts above 140, so 121 to 140 systolic has no band. The mild diastolic cell reads ≤90: should it be >90?",
    applied: "121 to 140 systolic and 81 to 90 diastolic are left with no band, so they go to clinician review. Mild diastolic is encoded as above 90 up to 100." },
  { id: "Q-ONESEX", topic: "One-sex entries", question: "LDL normal is filled in for males only; non-HDL and HbA1c normal for females only; testosterone for males only. Do the first three apply to both?",
    applied: "Encoded exactly as sent. Where a sex has no normal range, a result outside the mild and significant bands goes to clinician review." },
  { id: "Q-MISSING", topic: "Missing values", question: "Units are missing for B12, folate and FIT; glucose, mean platelet volume, adjusted calcium and the cholesterol ratios are not supplied.",
    applied: "Shown as Range not set (grey) until supplied. Results for them are not flagged." },
  { id: "Q-NOBAND", topic: "Outside normal with no band", question: "Where mild and significant are Not defined (Clinical interpretation), what does a result outside normal show?",
    applied: "Orange, OUTSIDE BANDS, and it goes to clinician review. Risk scores with no normal interval (QRISK3, relative risk) show no flag." },
  { id: "Q-CALC", topic: "Calculated values", question: "Which values does Pulse calculate, and with which formulas from your workbook?",
    applied: "BMI, waist-to-height, non-HDL, total:HDL, HDL as % of total and heart-age difference use the standard formulas on Calculations. Globulin, UIBC and adjusted calcium wait for your workbook formulas." },
  { id: "Q-BMI-ETH", topic: "Ethnicity-specific BMI", question: "The ethnicity-specific BMI row has no normal or low band. Is normal 18.5 to 23 and underweight below 18.5?",
    applied: "Normal 18.5 up to 23 and underweight below 18.5, as in the general row, marked to confirm. Middle Eastern is not a separate QRISK3 category; it falls under Other ethnic group, which uses the general row." },
  { id: "Q-WHTR", topic: "Waist-to-height ratio", question: "The ratio applies to adults with BMI under 35. What should show when BMI is 35 or more?",
    applied: "The ratio is still calculated and banded; the note is shown beside it. A BMI condition on a range is not built yet." },
  { id: "Q-PSA", topic: "PSA age bands", question: "Is a 60 year old in the 50-60 band or the 60-70 band?",
    applied: "The higher band: 50 to 59, 60 to 69, 70 and over. Females: not applicable." },
];

/* ---------- calculations ---------- */
export interface RrCalculation { id: string; name: string; formula: string; inputs: string; output: string; status: "standard" | "to_confirm"; note: string }
export const RR_CALCULATIONS: RrCalculation[] = [
  { id: "bmi", name: "BMI", formula: "weight (kg) ÷ height (m)²", inputs: "Weight, height (nurse form)", output: "bmi", status: "standard", note: "Rounded to one decimal place before banding." },
  { id: "whtr", name: "Waist-to-height ratio", formula: "waist (cm) ÷ (height (m) × 100)", inputs: "Waist, height (nurse form)", output: "whtr", status: "standard", note: "Rounded to two decimal places before banding." },
  { id: "nonhdl", name: "Non-HDL cholesterol", formula: "total cholesterol − HDL cholesterol", inputs: "Total cholesterol, HDL (laboratory)", output: "nonhdl", status: "standard", note: "Already calculated in the demo results." },
  { id: "tchdl", name: "Total cholesterol / HDL ratio", formula: "total cholesterol ÷ HDL cholesterol", inputs: "Total cholesterol, HDL (laboratory)", output: "tchdl", status: "standard", note: "Already calculated in the demo results. Range not supplied." },
  { id: "hdlpct", name: "HDL as % of total cholesterol", formula: "HDL ÷ total cholesterol × 100", inputs: "Total cholesterol, HDL (laboratory)", output: "hdlpct", status: "standard", note: "Range not supplied." },
  { id: "heartdiff", name: "Heart-age difference", formula: "QRISK3 heart age − actual age", inputs: "QRISK3 heart age, date of birth", output: "heartdiff", status: "standard", note: "0 or below is normal, as in your table." },
  { id: "glob", name: "Globulin", formula: "total protein − albumin (to confirm)", inputs: "Total protein, albumin (laboratory)", output: "glob", status: "to_confirm", note: "Your table lists globulin as a result. Confirm whether the laboratory supplies it or the workbook calculates it." },
  { id: "uibc", name: "UIBC", formula: "TIBC − iron (to confirm)", inputs: "TIBC, iron (laboratory)", output: "uibc", status: "to_confirm", note: "Confirm whether the laboratory supplies UIBC or the workbook calculates it." },
  { id: "adjca", name: "Adjusted calcium", formula: "Waiting for your workbook formula", inputs: "Calcium, albumin (laboratory)", output: "adjca", status: "to_confirm", note: "Your table marks the workbook field as not confirmed. Send the formula your sheet uses." },
];

/* ---------- builders ---------- */
type RowSpec = { cohort?: Partial<RrCohort>; bands?: RrBand[]; status?: RrRow["status"]; expected?: string; note?: string };
const ALL = (bands: RrBand[], note?: string): RowSpec => ({ bands, note });
const M = (bands: RrBand[], extra: Partial<RrCohort> = {}, note?: string): RowSpec => ({ cohort: { sex: "male", ...extra }, bands, note });
const F = (bands: RrBand[], extra: Partial<RrCohort> = {}, note?: string): RowSpec => ({ cohort: { sex: "female", ...extra }, bands, note });
const NOTSET = (cohort: Partial<RrCohort> = {}, note?: string): RowSpec => ({ cohort, status: "not_set", note });
const N = (min: number | null, max: number | null, opts: { minInc?: boolean; maxInc?: boolean } = {}) =>
  band("normal", min === null ? null : opts.minInc === false ? gt(min) : ge(min), max === null ? null : opts.maxInc === false ? lt(max) : le(max));

interface TestSpec {
  id: string; name: string; group: RrGroup; unit: string; decimals: number;
  kind?: RrTest["kind"]; basis?: RrBasis; analyte?: AnalyteCode; calc?: string; outside?: RrTest["outside"];
  src?: [string, string]; q?: string[];
  asSent: [string, string, string, string, string];
  rows: RowSpec[];
}
const NHS_HSE = "https://digital.nhs.uk/data-and-information/publications/statistical/health-survey-for-england/2022-part-2/adult-overweight-and-obesity";
const NICE_NG246 = "https://www.nice.org.uk/guidance/ng246/chapter/Identifying-and-assessing-overweight-obesity-and-central-adiposity";
const BARTS = "https://www.bartshealth.nhs.uk/haematology-advice-guidance/";
const ND = "Not defined";

const SPECS: TestSpec[] = [
  /* Body measurements */
  { id: "bmi", name: "BMI", group: "Body measurements", unit: "kg/m²", decimals: 1, calc: "bmi", src: ["NHS Health Survey for England 2022 and NICE NG246", NHS_HSE], q: ["Q-BMI-ETH", "Q-ETH"], basis: "ethnicity_specific",
    asSent: ["≥18.5 and <25 (general); blank (ethnicity-specific)", "≥18.5 and <25 (general); blank (ethnicity-specific)", "General: ≥25 and <30 or <18.5. Ethnicity-specific: ≥23 and <27.5", "General: ≥30. Ethnicity-specific: ≥27.5", "Ethnicity-specific (second row)"],
    rows: [
      ALL([band("low_mild", null, lt(18.5), "UNDERWEIGHT"), band("normal", ge(18.5), lt(25)), band("high_mild", ge(25), lt(30), "OVERWEIGHT"), band("high_severe", ge(30), null, "OBESE")], "General adult classification."),
      { cohort: { ethnicities: RR_BMI_ETHNIC }, bands: [band("low_mild", null, lt(18.5), "UNDERWEIGHT"), band("normal", ge(18.5), lt(23)), band("high_mild", ge(23), lt(27.5), "OVERWEIGHT"), band("high_severe", ge(27.5), null, "OBESE")],
        note: "South Asian, Chinese, other Asian, Black African and African-Caribbean (NICE NG246). Normal and underweight bands to confirm." },
    ] },
  { id: "waist", name: "Waist circumference", group: "Body measurements", unit: "cm", decimals: 0, src: ["NHS Health Survey for England 2022", NHS_HSE],
    asSent: ["<94; lower limit not defined", "<80; lower limit not defined", "Male: ≥94 and ≤102; female: ≥80 and ≤88", "Male: >102; female: >88", ""],
    rows: [M([N(null, 94, { maxInc: false }), band("high_mild", ge(94), le(102), "INCREASED"), band("high_severe", gt(102), null, "HIGH")]),
      F([N(null, 80, { maxInc: false }), band("high_mild", ge(80), le(88), "INCREASED"), band("high_severe", gt(88), null, "HIGH")])] },
  { id: "whtr", name: "Waist-to-height ratio", group: "Body measurements", unit: "ratio", decimals: 2, calc: "whtr", src: ["NICE NG246, adults with BMI under 35", NICE_NG246], q: ["Q-WHTR"],
    asSent: ["≥0.40 and <0.50", "≥0.40 and <0.50", "≥0.50 and <0.60", "≥0.60", ""],
    rows: [ALL([N(0.4, 0.5, { maxInc: false }), band("high_mild", ge(0.5), lt(0.6), "INCREASED"), band("high_severe", ge(0.6), null, "HIGH")], "Applies to adults with BMI under 35.")] },
  { id: "height", name: "Height", group: "Body measurements", unit: "m", decimals: 2, kind: "recorded", basis: "no_severity_bands", outside: "neutral",
    asSent: [ND, ND, ND, ND, "No severity bands"], rows: [{ status: "not_applicable", note: "Recorded only; used to calculate BMI and waist-to-height." }] },
  { id: "weight", name: "Weight", group: "Body measurements", unit: "kg", decimals: 1, kind: "recorded", basis: "no_severity_bands", outside: "neutral",
    asSent: [ND, ND, ND, ND, "No severity bands"], rows: [{ status: "not_applicable", note: "Recorded only; used to calculate BMI." }] },

  /* Blood pressure and heart */
  { id: "bpsys", name: "Blood pressure, systolic", group: "Blood pressure and heart", unit: "mmHg", decimals: 0, basis: "safety_threshold", q: ["Q-BP"],
    src: ["NW London ICB (ideal comparator); NICE NG136 (severe threshold)", "https://www.nice.org.uk/guidance/ng136/chapter/recommendations"],
    asSent: ["Systolic ≥90 and ≤120", "Systolic ≥90 and ≤120", "Systolic >140 and ≤160", "Systolic >160. Severe threshold: systolic ≥180", "Clinical safety threshold (severe row)"],
    rows: [ALL([N(90, 120), band("high_mild", gt(140), le(160)), band("high_severe", gt(160), lt(180)), band("high_critical", ge(180), null, "URGENT")], "121 to 140 has no band in the table: to confirm.")] },
  { id: "bpdia", name: "Blood pressure, diastolic", group: "Blood pressure and heart", unit: "mmHg", decimals: 0, basis: "safety_threshold", q: ["Q-BP"],
    src: ["NW London ICB (ideal comparator); NICE NG136 (severe threshold)", "https://www.nice.org.uk/guidance/ng136/chapter/recommendations"],
    asSent: ["Diastolic ≥60 and ≤80", "Diastolic ≥60 and ≤80", "Diastolic ≤90 (as sent)", "Diastolic >100. Severe threshold: diastolic ≥120", "Clinical safety threshold (severe row)"],
    rows: [ALL([N(60, 80), band("high_mild", gt(90), le(100)), band("high_severe", gt(100), lt(120)), band("high_critical", ge(120), null, "URGENT")], "Mild encoded as above 90 up to 100; the table cell reads ≤90. 81 to 90 has no band: to confirm.")] },
  { id: "pulse", name: "Resting pulse", group: "Blood pressure and heart", unit: "beats/min", decimals: 0, basis: "clinical_interpretation", q: ["Q-NOBAND"],
    src: ["British Heart Foundation", "https://www.bhf.org.uk/informationsupport/how-a-healthy-heart-works/your-heart-rate"],
    asSent: ["≥60 and ≤100", "≥60 and ≤100", ND, ND, "Clinical interpretation"], rows: [ALL([N(60, 100)])] },
  { id: "pulsereg", name: "Manual pulse regularity", group: "Blood pressure and heart", unit: "Qualitative", decimals: 0, kind: "qualitative",
    asSent: ["Regular", "Regular", ND, ND, ""], rows: [{ expected: "Regular", bands: [band("normal", null, null, "REGULAR")], note: "Irregular: photos to the clinical channel and a doctor review task (nurse form rule)." }] },
  { id: "ecg", name: "ECG interpretation", group: "Blood pressure and heart", unit: "Qualitative", decimals: 0, kind: "qualitative", basis: "clinical_interpretation",
    asSent: ["Clinician-confirmed normal", "Clinician-confirmed normal", ND, ND, "Clinical interpretation"], rows: [{ expected: "Normal", bands: [band("normal", null, null, "NORMAL")], note: "Normal only when a clinician confirms it." }] },

  /* Cholesterol */
  { id: "tc", name: "Total cholesterol", group: "Cholesterol", unit: "mmol/L", decimals: 1, analyte: "TC", src: ["NICE CG71", "https://www.nice.org.uk/guidance/cg71/chapter/Recommendations"],
    asSent: ["<5.0; lower limit not supplied", "<5.0; lower limit not supplied", "≥5.0 and ≤7.5", ">7.5", ""],
    rows: [ALL([N(null, 5.0, { maxInc: false }), band("high_mild", ge(5.0), le(7.5)), band("high_severe", gt(7.5), null)])] },
  { id: "ldl", name: "LDL cholesterol", group: "Cholesterol", unit: "mmol/L", decimals: 1, analyte: "LDL", q: ["Q-ONESEX", "Q-EDGES"],
    asSent: ["<3.0; lower limit not supplied", "Not supplied", ">3.0 and ≤4.9", ">4.9", ""],
    rows: [M([N(null, 3.0, { maxInc: false }), band("high_mild", gt(3.0), le(4.9)), band("high_severe", gt(4.9), null)]),
      F([band("high_mild", gt(3.0), le(4.9)), band("high_severe", gt(4.9), null)], {}, "Female normal range not supplied.")] },
  { id: "nonhdl", name: "Non-HDL cholesterol", group: "Cholesterol", unit: "mmol/L", decimals: 1, analyte: "NONHDL", calc: "nonhdl", q: ["Q-ONESEX"],
    asSent: ["Not supplied", "<4.0; lower limit not supplied", ">4.0 and ≤5.0", ">5.0;", ""],
    rows: [M([band("high_mild", gt(4.0), le(5.0)), band("high_severe", gt(5.0), null)], {}, "Male normal range not supplied."),
      F([N(null, 4.0, { maxInc: false }), band("high_mild", gt(4.0), le(5.0)), band("high_severe", gt(5.0), null)])] },
  { id: "hdl", name: "HDL cholesterol", group: "Cholesterol", unit: "mmol/L", decimals: 2, analyte: "HDL",
    asSent: [">1.00; upper limit not supplied", ">1.00; upper limit not supplied", "<1.0: low flag", "", ""],
    rows: [ALL([band("low_mild", null, lt(1.0), "LOW"), N(1.0, null, { minInc: false })])] },
  { id: "tg", name: "Triglycerides", group: "Cholesterol", unit: "mmol/L", decimals: 2, analyte: "TG",
    asSent: ["≥0.60 and ≤1.70", "≥0.60 and ≤1.70", "≥1.70 and <5.0", "≥5.0", ""],
    rows: [ALL([N(0.6, 1.7), band("high_mild", ge(1.7), lt(5.0)), band("high_severe", ge(5.0), null)])] },
  { id: "tchdl", name: "Total cholesterol / HDL ratio", group: "Cholesterol", unit: "ratio", decimals: 2, analyte: "TCHDL", calc: "tchdl", basis: "no_severity_bands", q: ["Q-MISSING"],
    asSent: ["Not supplied", "Not supplied", ND, ND, "No severity bands"], rows: [NOTSET()] },
  { id: "hdlpct", name: "HDL / total cholesterol", group: "Cholesterol", unit: "%", decimals: 0, calc: "hdlpct", basis: "no_severity_bands", q: ["Q-MISSING"],
    asSent: ["Not supplied", "Not supplied", ND, ND, "No severity bands"], rows: [NOTSET()] },

  /* Blood sugar */
  { id: "hba1c", name: "HbA1c", group: "Blood sugar", unit: "mmol/mol", decimals: 0, analyte: "HBA1C", q: ["Q-ONESEX", "Q-PREG"],
    src: ["HSE pre-diabetes and Integrated Model of Care for Type 2 Diabetes", "https://www2.hse.ie/conditions/pre-diabetes/"],
    asSent: ["Not supplied", "≥20 and ≤41", "≥42 and ≤47", "≥48", ""],
    rows: [M([band("high_mild", ge(42), le(47), "RAISED"), band("high_severe", ge(48), null, "HIGH")], { pregnancy: "not_pregnant" }, "Male normal range not supplied. Non-pregnant adults."),
      F([N(20, 41), band("high_mild", ge(42), le(47), "RAISED"), band("high_severe", ge(48), null, "HIGH")], { pregnancy: "not_pregnant" }, "Non-pregnant adults.")] },
  { id: "glucose", name: "Glucose", group: "Blood sugar", unit: "Not supplied", decimals: 1, q: ["Q-MISSING"],
    asSent: ["Not supplied", "Not supplied", ND, ND, ""], rows: [NOTSET()] },

  /* Kidney */
  { id: "urea", name: "Urea", group: "Kidney", unit: "mmol/L", decimals: 1, analyte: "UREA", basis: "clinical_interpretation", q: ["Q-NOBAND"],
    asSent: ["≥3.2 and ≤7.4", "≥2.5 and ≤6.7", ND, ND, "Clinical interpretation"], rows: [M([N(3.2, 7.4)]), F([N(2.5, 6.7)])] },
  { id: "creat", name: "Creatinine", group: "Kidney", unit: "µmol/L", decimals: 0, analyte: "CREAT", q: ["Q-NOBAND"],
    asSent: ["≥64 and ≤104", "≥49 and ≤90", ND, ND, ""], rows: [M([N(64, 104)]), F([N(49, 90)])] },
  { id: "urate", name: "Uric acid", group: "Kidney", unit: "µmol/L", decimals: 0, analyte: "URATE", basis: "clinical_interpretation", q: ["Q-NOBAND"],
    asSent: ["≥220 and ≤450", "≥150 and ≤370", ND, ND, "Clinical interpretation"], rows: [M([N(220, 450)]), F([N(150, 370)])] },

  /* Liver and protein */
  { id: "tprot", name: "Total protein", group: "Liver and protein", unit: "g/L", decimals: 0, analyte: "TPROT", basis: "clinical_interpretation", q: ["Q-NOBAND"],
    asSent: ["≥64 and ≤83", "≥64 and ≤83", ND, ND, "Clinical interpretation"], rows: [ALL([N(64, 83)])] },
  { id: "alb", name: "Albumin", group: "Liver and protein", unit: "g/L", decimals: 0, basis: "clinical_interpretation", q: ["Q-NOBAND"],
    asSent: ["≥35 and ≤50", "≥35 and ≤50", ND, ND, "Clinical interpretation"], rows: [ALL([N(35, 50)])] },
  { id: "glob", name: "Globulin", group: "Liver and protein", unit: "g/L", decimals: 0, calc: "glob", basis: "clinical_interpretation", q: ["Q-NOBAND", "Q-CALC"],
    asSent: ["≥21 and ≤36", "≥21 and ≤36", ND, ND, "Clinical interpretation"], rows: [ALL([N(21, 36)])] },
  { id: "bili", name: "Total bilirubin", group: "Liver and protein", unit: "µmol/L", decimals: 1, analyte: "BILI",
    asSent: ["≥5.1 and ≤20.5", "≥5.1 and ≤20.5", ">20.5 and ≤41", ">41", ""],
    rows: [ALL([N(5.1, 20.5), band("high_mild", gt(20.5), le(41)), band("high_severe", gt(41), null)])] },
  { id: "alt", name: "ALT", group: "Liver and protein", unit: "IU/L", decimals: 0, analyte: "ALT", basis: "agreed",
    asSent: ["≥0 and ≤45", "≥0 and ≤34", "Male: >45 and ≤90; female: >34 and ≤68", "Male: >90; female: >68", "Agreed"],
    rows: [M([N(0, 45), band("high_mild", gt(45), le(90)), band("high_severe", gt(90), null)]), F([N(0, 34), band("high_mild", gt(34), le(68)), band("high_severe", gt(68), null)])] },
  { id: "ast", name: "AST", group: "Liver and protein", unit: "IU/L", decimals: 0, analyte: "AST",
    asSent: ["≥11 and ≤34", "≥11 and ≤34", ">34 and ≤68", ">68", ""],
    rows: [ALL([N(11, 34), band("high_mild", gt(34), le(68)), band("high_severe", gt(68), null)])] },
  { id: "ggt", name: "GGT", group: "Liver and protein", unit: "IU/L", decimals: 0, analyte: "GGT", basis: "agreed",
    asSent: ["≥0 and ≤55", "≥0 and ≤38", "Male: >55 and ≤110; female: >38 and ≤76", "Male: >110; female: >76", "Agreed"],
    rows: [M([N(0, 55), band("high_mild", gt(55), le(110)), band("high_severe", gt(110), null)]), F([N(0, 38), band("high_mild", gt(38), le(76)), band("high_severe", gt(76), null)])] },
  { id: "alp", name: "Alkaline phosphatase", group: "Liver and protein", unit: "IU/L", decimals: 0, analyte: "ALP",
    asSent: ["≥50 and ≤116", "≥46 and ≤122", "Male: >116 and ≤232; female: >122 and ≤244", "Male: >232; female: >244", ""],
    rows: [M([N(50, 116), band("high_mild", gt(116), le(232)), band("high_severe", gt(232), null)]), F([N(46, 122), band("high_mild", gt(122), le(244)), band("high_severe", gt(244), null)])] },

  /* Iron */
  { id: "ferr", name: "Ferritin", group: "Iron", unit: "ng/mL", decimals: 0, analyte: "FERR",
    asSent: ["≥15 and ≤200", "≥15 and ≤150", "Male: >200 and ≤400; female: >150 and ≤400", ">400", ""],
    rows: [M([N(15, 200), band("high_mild", gt(200), le(400)), band("high_severe", gt(400), null)]), F([N(15, 150), band("high_mild", gt(150), le(400)), band("high_severe", gt(400), null)])] },
  { id: "iron", name: "Iron", group: "Iron", unit: "µmol/L", decimals: 1, analyte: "IRON", basis: "clinical_interpretation", q: ["Q-NOBAND"],
    asSent: ["≥11.6 and ≤31.3", "≥9.0 and ≤30.4", ND, ND, "Clinical interpretation"], rows: [M([N(11.6, 31.3)]), F([N(9.0, 30.4)])] },
  { id: "tibc", name: "TIBC", group: "Iron", unit: "µmol/L", decimals: 1, analyte: "TIBC", basis: "clinical_interpretation", q: ["Q-NOBAND"],
    asSent: ["≥44.8 and ≤76.1", "≥44.8 and ≤76.1", ND, ND, "Clinical interpretation"], rows: [ALL([N(44.8, 76.1)])] },
  { id: "uibc", name: "UIBC", group: "Iron", unit: "µmol/L", decimals: 1, calc: "uibc", basis: "clinical_interpretation", q: ["Q-NOBAND", "Q-CALC"],
    asSent: ["≥12.4 and ≤43.0", "≥12.5 and ≤55.5", ND, ND, "Clinical interpretation"], rows: [M([N(12.4, 43.0)]), F([N(12.5, 55.5)])] },

  /* Thyroid */
  { id: "tsh", name: "TSH", group: "Thyroid", unit: "µIU/mL", decimals: 3, analyte: "TSH", q: ["Q-PREG"], src: ["NICE NG145, non-pregnant adults", "https://www.nice.org.uk/guidance/ng145/chapter/recommendations"],
    asSent: ["≥0.350 and ≤4.940", "≥0.350 and ≤4.940", "(blank)", "<0.10 OR ≥10", ""],
    rows: [ALL([band("low_severe", null, lt(0.1)), N(0.35, 4.94), band("high_severe", ge(10), null)], "Non-pregnant adults. 0.100 to 0.349 and 4.941 to 9.999 have no band (mild is blank in the table).")] },
  { id: "ft4", name: "Free T4", group: "Thyroid", unit: "pmol/L", decimals: 1, analyte: "FT4", basis: "clinical_interpretation", q: ["Q-NOBAND"],
    asSent: ["≥9.0 and ≤19.0", "≥9.0 and ≤19.0", ND, ND, "Clinical interpretation"], rows: [ALL([N(9.0, 19.0)])] },

  /* Vitamins and minerals */
  { id: "vitd", name: "Vitamin D (25-OH D2+D3)", group: "Vitamins and minerals", unit: "nmol/L", decimals: 1, analyte: "VITD", src: ["NW London Pathology", "https://www.nwlpathology.nhs.uk/test/vitamin-d-25-hydroxy/"],
    asSent: ["≥30.0 and ≤125.0", "≥30.0 and ≤125.0", "≥25 and <30", "<25", ""],
    rows: [ALL([band("low_severe", null, lt(25), "DEFICIENT"), band("low_mild", ge(25), lt(30), "INSUFFICIENT"), N(30, 125)])] },
  { id: "ca", name: "Calcium (laboratory test)", group: "Vitamins and minerals", unit: "mmol/L", decimals: 2,
    asSent: ["≥2.10 and ≤2.60", "≥2.10 and ≤2.60", ND, ND, ""], rows: [ALL([N(2.1, 2.6)])] },
  { id: "adjca", name: "Adjusted calcium (workbook field)", group: "Vitamins and minerals", unit: "mmol/L", decimals: 2, analyte: "CA", calc: "adjca", q: ["Q-MISSING", "Q-CALC"],
    asSent: ["Not confirmed", "Not supplied", ND, ND, ""], rows: [NOTSET()] },
  { id: "mg", name: "Magnesium", group: "Vitamins and minerals", unit: "mmol/L", decimals: 2, analyte: "MG", basis: "clinical_interpretation", q: ["Q-NOBAND"],
    asSent: ["≥0.66 and ≤1.07", "≥0.66 and ≤1.07", ND, ND, "Clinical interpretation"], rows: [ALL([N(0.66, 1.07)])] },
  { id: "po4", name: "Phosphate", group: "Vitamins and minerals", unit: "mmol/L", decimals: 2, analyte: "PO4", basis: "clinical_interpretation", q: ["Q-NOBAND"],
    asSent: ["≥0.81 and ≤1.45", "≥0.81 and ≤1.45", ND, ND, "Clinical interpretation"], rows: [ALL([N(0.81, 1.45)])] },
  { id: "b12", name: "Vitamin B12", group: "Vitamins and minerals", unit: "Unit not supplied", decimals: 0, analyte: "B12", q: ["Q-MISSING"],
    asSent: ["≥200 and ≤883", "≥200 and ≤883", ND, ND, ""], rows: [ALL([N(200, 883)], "Unit missing from the table: to confirm.")] },
  { id: "folate", name: "Folate", group: "Vitamins and minerals", unit: "Unit not supplied", decimals: 1, analyte: "FOLATE", q: ["Q-MISSING"],
    asSent: ["≥3.1 and ≤20.5", "≥3.1 and ≤20.5", ND, ND, ""], rows: [ALL([N(3.1, 20.5)], "Unit missing from the table: to confirm.")] },

  /* Inflammation and hormones */
  { id: "crp", name: "High-sensitivity CRP", group: "Inflammation and hormones", unit: "mg/L", decimals: 1, basis: "clinical_interpretation", q: ["Q-NOBAND"],
    asSent: ["<5.0; lower limit not supplied", "<5.0; lower limit not supplied", ND, ND, "Clinical interpretation"], rows: [ALL([N(null, 5.0, { maxInc: false })])] },
  { id: "testo", name: "Total testosterone", group: "Inflammation and hormones", unit: "nmol/L", decimals: 2, basis: "clinical_interpretation", q: ["Q-ONESEX", "Q-NOBAND"],
    asSent: ["≥8.33 and ≤30.19", "(blank)", ND, ND, "Clinical interpretation"], rows: [M([N(8.33, 30.19)]), NOTSET({ sex: "female" }, "Female range not supplied.")] },

  /* Full blood count */
  { id: "hb", name: "Haemoglobin", group: "Full blood count", unit: "g/dL", decimals: 1, analyte: "HB", q: ["Q-PREG", "Q-AGE"],
    src: ["WHO haemoglobin thresholds, ages 15 to 65, non-pregnant women", "https://iris.who.int/server/api/core/bitstreams/f9f74397-1440-478d-a63c-26f29a01552f/content"],
    asSent: ["≥13.0 and ≤17.0", "≥12.0 and ≤15.0", "Male: ≥11.0 and <13.0; female: ≥11.0 and <12.0", "<11.0", "Severity bands for ages 15 to 65; non-pregnant women"],
    rows: [M([band("low_severe", null, lt(11)), band("low_mild", ge(11), lt(13)), N(13, 17)], { ageMin: 15, ageMax: 66 }),
      F([band("low_severe", null, lt(11)), band("low_mild", ge(11), lt(12)), N(12, 15)], { ageMin: 15, ageMax: 66, pregnancy: "not_pregnant" })] },
  { id: "rbc", name: "Red cell count", group: "Full blood count", unit: "×10¹²/L", decimals: 2, basis: "clinical_interpretation", q: ["Q-NOBAND"],
    asSent: ["≥4.50 and ≤5.50", "≥3.80 and ≤4.80", ND, ND, "Clinical interpretation"], rows: [M([N(4.5, 5.5)]), F([N(3.8, 4.8)])] },
  { id: "hct", name: "Haematocrit", group: "Full blood count", unit: "L/L", decimals: 3, basis: "clinical_interpretation", q: ["Q-NOBAND"],
    asSent: ["≥0.400 and ≤0.500", "≥0.400 and ≤0.500", ND, ND, "Clinical interpretation"], rows: [ALL([N(0.4, 0.5)])] },
  { id: "mcv", name: "MCV", group: "Full blood count", unit: "fL", decimals: 1, basis: "clinical_interpretation", q: ["Q-NOBAND"],
    asSent: ["≥83.0 and ≤101.0", "≥83.0 and ≤101.0", ND, ND, "Clinical interpretation"], rows: [ALL([N(83, 101)])] },
  { id: "mch", name: "MCH", group: "Full blood count", unit: "pg", decimals: 1, basis: "clinical_interpretation", q: ["Q-NOBAND"],
    asSent: ["≥27.0 and ≤32.0", "≥27.0 and ≤32.0", ND, ND, "Clinical interpretation"], rows: [ALL([N(27, 32)])] },
  { id: "mchc", name: "MCHC", group: "Full blood count", unit: "g/dL", decimals: 1, basis: "clinical_interpretation", q: ["Q-NOBAND"],
    asSent: ["≥31.5 and ≤34.5", "≥31.5 and ≤34.5", ND, ND, "Clinical interpretation"], rows: [ALL([N(31.5, 34.5)])] },
  { id: "rdw", name: "RDW", group: "Full blood count", unit: "%", decimals: 1, basis: "clinical_interpretation", q: ["Q-NOBAND"],
    asSent: ["≥11.6 and ≤14.0", "≥11.6 and ≤14.0", ND, ND, "Clinical interpretation"], rows: [ALL([N(11.6, 14)])] },
  { id: "plt", name: "Platelets", group: "Full blood count", unit: "×10⁹/L", decimals: 0, analyte: "PLT", src: ["Barts Health haematology guidance", BARTS],
    asSent: ["≥150 and ≤410", "≥150 and ≤410", "(>100 and <150) OR (>410 and ≤450)", "≤100 OR >450", ""],
    rows: [ALL([band("low_severe", null, le(100)), band("low_mild", gt(100), lt(150)), N(150, 410), band("high_mild", gt(410), le(450)), band("high_severe", gt(450), null)])] },
  { id: "mpv", name: "Mean platelet volume", group: "Full blood count", unit: "fL", decimals: 1, q: ["Q-MISSING"],
    asSent: ["Not supplied", "Not supplied", ND, ND, ""], rows: [NOTSET()] },
  { id: "wcc", name: "White cell count", group: "Full blood count", unit: "×10⁹/L", decimals: 2, analyte: "WCC", q: ["Q-NOBAND"],
    asSent: ["≥4.00 and ≤10.00", "≥4.00 and ≤10.00", "(blank)", ND, ""], rows: [ALL([N(4, 10)])] },
  { id: "neut", name: "Neutrophils", group: "Full blood count", unit: "×10⁹/L", decimals: 2, src: ["Barts Health haematology guidance", BARTS],
    asSent: ["≥2.00 and ≤7.00", "≥2.00 and ≤7.00", "≥1.00 and <2.00", "<1.00", ""],
    rows: [ALL([band("low_severe", null, lt(1)), band("low_mild", ge(1), lt(2)), N(2, 7)])] },
  { id: "lymph", name: "Lymphocytes", group: "Full blood count", unit: "×10⁹/L", decimals: 2, q: ["Q-NOBAND"],
    asSent: ["≥1.00 and ≤3.00", "≥1.00 and ≤3.00", ND, ND, ""], rows: [ALL([N(1, 3)])] },
  { id: "mono", name: "Monocytes", group: "Full blood count", unit: "×10⁹/L", decimals: 2, q: ["Q-NOBAND"],
    asSent: ["≥0.20 and ≤1.00", "≥0.20 and ≤1.00", ND, ND, ""], rows: [ALL([N(0.2, 1)])] },
  { id: "eos", name: "Eosinophils", group: "Full blood count", unit: "×10⁹/L", decimals: 2, src: ["Barts Health haematology guidance", BARTS],
    asSent: ["≥0.02 and ≤0.50", "≥0.02 and ≤0.50", ">0.50 and ≤1.50", ">1.50", ""],
    rows: [ALL([N(0.02, 0.5), band("high_mild", gt(0.5), le(1.5)), band("high_severe", gt(1.5), null)])] },
  { id: "baso", name: "Basophils", group: "Full blood count", unit: "×10⁹/L", decimals: 2, basis: "clinical_interpretation", q: ["Q-NOBAND"],
    asSent: ["≥0.01 and ≤0.08", "≥0.01 and ≤0.08", ND, ND, "Clinical interpretation"], rows: [ALL([N(0.01, 0.08)])] },

  /* Cancer screening */
  { id: "psa", name: "PSA", group: "Cancer screening", unit: "µg/L", decimals: 2, analyte: "PSA", q: ["Q-PSA", "Q-AGE"],
    asSent: ["Under 50 years: <2; 50-60 years: <3; 60-70 years: <4; over 70 years: <5", "(blank)", ND, ND, ""],
    rows: [M([N(null, 2, { maxInc: false })], { ageMax: 50 }), M([N(null, 3, { maxInc: false })], { ageMin: 50, ageMax: 60 }),
      M([N(null, 4, { maxInc: false })], { ageMin: 60, ageMax: 70 }), M([N(null, 5, { maxInc: false })], { ageMin: 70 }),
      { cohort: { sex: "female" }, status: "not_applicable" }] },
  { id: "fit", name: "FIT", group: "Cancer screening", unit: "Unit not supplied", decimals: 0, q: ["Q-MISSING"],
    asSent: ["<25", "<25", ND, ND, ""], rows: [ALL([N(null, 25, { maxInc: false })], "Unit missing from the table (usually µg Hb/g faeces): to confirm.")] },

  /* Urine */
  ...(["leuk", "prot", "gluc", "blood"] as const).map((k): TestSpec => ({
    id: `urine-${k}`, name: `Urine ${({ leuk: "leukocytes", prot: "protein", gluc: "glucose", blood: "blood" })[k]}, dipstick`, group: "Urine", unit: "Qualitative", decimals: 0, kind: "qualitative",
    asSent: ["Negative", "Negative", ND, ND, ""], rows: [{ expected: "Negative", bands: [band("normal", null, null, "NEGATIVE")] }],
  })),

  /* Cardiovascular risk */
  { id: "qrisk", name: "QRISK3 10-year risk", group: "Cardiovascular risk", unit: "%", decimals: 1, outside: "neutral", src: ["NICE NG238", "https://www.nice.org.uk/guidance/ng238/chapter/Recommendations"],
    asSent: ["No normal interval defined", "No normal interval defined", ND, "≥10: risk-discussion flag", ""],
    rows: [ALL([band("high_severe", ge(10), null, "DISCUSS RISK")], "Below 10 is shown without a flag. Not calculated under 26 (report rule).")] },
  { id: "relrisk", name: "Relative cardiovascular risk", group: "Cardiovascular risk", unit: "ratio", decimals: 1, outside: "neutral", basis: "no_severity_bands",
    asSent: [ND, ND, ND, ND, "No severity bands"], rows: [{ status: "not_applicable", note: "Shown without bands." }] },
  { id: "heartdiff", name: "Heart-age difference", group: "Cardiovascular risk", unit: "years", decimals: 0, calc: "heartdiff", basis: "no_severity_bands",
    asSent: ["Should be 0 or negative", "Should be 0 or negative", ND, ND, "No severity bands"],
    rows: [ALL([N(null, 0)], "Heart age should be the same as or less than actual age. Above 0 goes to clinician review.")] },

  /* Lungs */
  { id: "peakflow", name: "Peak flow", group: "Lungs", unit: "% of predicted", decimals: 0,
    asSent: [">80%", ">80%", "50%-80%", "<50%", ""],
    rows: [ALL([band("low_severe", null, lt(50), "REDUCED"), band("low_mild", ge(50), le(80), "REDUCED MILD"), N(80, null, { minInc: false })])] },
];

const mkRows = (testId: string, specs: RowSpec[]): RrRow[] => specs.map((s, i) => ({
  id: `${testId}-${i + 1}`, cohort: anyCohort(s.cohort), status: s.status || "set", bands: s.bands || [], expected: s.expected, note: s.note,
}));

export const RR_TESTS: RrTest[] = SPECS.map((s) => ({
  id: s.id, name: s.name, group: s.group, unit: s.unit, kind: s.kind || "numeric", basis: s.basis || "standard", decimals: s.decimals,
  source: s.src ? { label: s.src[0], url: s.src[1] } : null, analyte: s.analyte || null, calc: s.calc || null, outside: s.outside || "review",
  asSent: { male: s.asSent[0], female: s.asSent[1], mild: s.asSent[2], significant: s.asSent[3], status: s.asSent[4] }, questions: s.q || [],
}));
export const RR_TEST_BY_ID: Record<string, RrTest> = Object.fromEntries(RR_TESTS.map((t) => [t.id, t]));
export const RR_TEST_BY_ANALYTE: Partial<Record<AnalyteCode, RrTest>> = Object.fromEntries(RR_TESTS.filter((t) => t.analyte).map((t) => [t.analyte!, t]));

/* ---------- seeded versions ---------- */
const seedVersion = (testId: string, version: number, rows: RrRow[], over: Partial<RrVersion> = {}): RrVersion => ({
  id: `RRV-${testId.toUpperCase()}-${version}`, testId, version, status: "published", effectiveFrom: RR_SEED_EFFECTIVE, rows,
  reason: "Loaded from Precision Health's reference ranges table.", source: RR_SOURCE_DOC,
  createdBy: "neil" as StaffId, createdAt: SEED_AT, publishedBy: "neil" as StaffId, publishedAt: SEED_AT, decidedNote: null, ...over,
});

export function initialReferenceRangesState(): ReferenceRangesState {
  const versions: RrVersion[] = [];
  for (const s of SPECS) {
    const rows = mkRows(s.id, s.rows);
    if (s.id === "hb") {
      /* Neil's example from the call: female upper limit 16 until 7 October, 15 from 8 October. */
      const old = structuredClone(rows);
      const f = old.find((r) => r.cohort.sex === "female")!;
      f.bands = f.bands.map((b) => (b.key === "normal" ? { ...b, max: le(16) } : b));
      versions.push(seedVersion("hb", 1, old, { reason: "Sample history for the walkthrough: female normal 12.0 to 16.0, the range in use before the change.", source: "Previous ranges worksheet (sample)" }));
      versions.push(seedVersion("hb", 2, rows, { effectiveFrom: "2026-10-08", reason: "Female upper limit lowered from 16.0 to 15.0 to match Precision Health's table (Neil's example from the 23 October call).",
        createdAt: "2026-10-02T09:05:00.000Z", publishedAt: "2026-10-02T09:06:00.000Z" }));
      continue;
    }
    versions.push(seedVersion(s.id, 1, rows));
    if (s.id === "tsh") {
      /* A laboratory bulletin drafted and waiting for a superadmin: TSH upper limit 4.940 to 4.840. */
      const next = structuredClone(rows);
      next[0].bands = next[0].bands.map((b) => (b.key === "normal" ? { ...b, max: le(4.84) } : b));
      versions.push(seedVersion("tsh", 2, next, { status: "draft", effectiveFrom: "2026-10-12", publishedBy: null, publishedAt: null, createdAt: "2026-10-03T14:20:00.000Z",
        reason: "Laboratory bulletin (sample): TSH upper reference limit changes from 4.940 to 4.840 µIU/mL.", source: "Eurofins laboratory bulletin (sample)" }));
    }
  }
  const questions: ReferenceRangesState["questions"] = {};
  for (const q of RR_QUESTIONS) questions[q.id] = { status: "open", answer: "", by: null, at: null };
  return { versions, settings: { superadmins: ["neil"], secondApprover: false, effectiveBasis: "sample" }, questions };
}
