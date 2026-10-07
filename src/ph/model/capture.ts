/* Clinical capture rules shared by the nurse workspace and the reducer.
   Legitimate abnormal values are accepted and flagged for review later. They are never
   forced into a normal range. A blank is not zero, and missing, not done and declined
   stay distinct. */
import type { Band, ClinicalCapture, Measure, NurseFormValue, SexRecorded } from "./types";
import type { Answers } from "./questionnaire";
import { highBpHistoryToNurse, smokingStatusFromAnswers } from "./questionnaire";

export type MeasureKey = keyof ClinicalCapture["measures"];

/** Entry limits and the completion gate. The nurse form schema below lists the client's full required set. */
export const MEASURE_RULES: Record<MeasureKey, { label: string; unit: string; min: number; max: number; required: boolean; decimals: number }> = {
  heightM: { label: "Height", unit: "m", min: 1.0, max: 2.3, required: true, decimals: 2 },
  weightKg: { label: "Weight", unit: "kg", min: 25, max: 300, required: true, decimals: 1 },
  waistCm: { label: "Waist", unit: "cm", min: 40, max: 220, required: false, decimals: 0 },
  bpSys: { label: "Systolic blood pressure", unit: "mmHg", min: 60, max: 260, required: true, decimals: 0 },
  bpDia: { label: "Diastolic blood pressure", unit: "mmHg", min: 30, max: 160, required: true, decimals: 0 },
  pulse: { label: "Pulse", unit: "bpm", min: 30, max: 220, required: false, decimals: 0 },
  peakFlow: { label: "Peak flow", unit: "L/min", min: 50, max: 900, required: false, decimals: 0 },
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

/* ================================================================================================
   Nurse form: "SISK Comprehensive (LAB) Screen V2", field for field, in the client's order and
   wording. A declarative schema the nurse workspace renders and the model validates. Fields are
   stored in four places: the person and booking record (read only here), capture.measures,
   capture.urine, capture.notes (Nurse comments) and capture.form (everything else).
   ================================================================================================ */

export const URINE_DIPSTICK_OPTIONS = ["Nil", "+", "++", "+++", "Not done"];
export const URINE_WCC_OPTIONS = ["Nil", "10", "100", ">100", "Not done"];
/** The ECG machine's advice codes, verbatim from the nurse form. */
export const ECG_ADVICE_OPTIONS = [
  "a Stable waveform (normal)", "B Fast heart rate", "F Slow heart rate", "H Slow heart rate and deviating waveform",
  "J Irregular heart rate", "K Irregular heart rate and deviating waveform", "L Deviating waveform", "M Analysis impossible",
  "12-Lead normal", "12-Lead borderline", "12-Lead abnormal", "Other message (in the comment box)",
];
/** Irregular-rhythm advice codes. With an irregular manual pulse they raise an ECG review. */
export const ECG_IRREGULAR_ADVICE = ["J Irregular heart rate", "K Irregular heart rate and deviating waveform"];
export const NURSE_REFERRAL_VALUE = "No. Significantly abnormal results. Refer to doctor.";
export const APPROVE_OPTIONS = ["Yes", NURSE_REFERRAL_VALUE];
export const SMOKING_OPTIONS = ["No", "Ex-smoker", "1-10 cigarettes per day", "11-20 cigarettes per day", "more than 20 cigarettes per day"];
export const HIGH_BP_HISTORY_OPTIONS = ["Yes (white coat)", "Yes (on treatment)", "Yes", "No"];
export const FIT_KIT_OPTIONS = ["No", "Recommended but declined", "Yes"];
export const PSA_TAKEN_OPTIONS = ["No", "Offered but declined", "Yes"];
export const PSA_SYMPTOM_OPTIONS = ["Dribbling stream", "Waking to urinate more than 3 times per night", "Needing to go back to urinate again immediately after finishing", "None of these"];
/** Company picklist: the client's Sisk sites and groups, then the demo programme sites. */
export const COMPANY_OPTIONS = [
  "SISK Adare Bypass", "SISK Amgen", "SISK Analog Devices", "SISK Astellas", "SISK AstraZeneca", "SISK Center Parcs", "SISK CityWest", "SISK Cork Office",
  "SISK DAA", "SISK Galway Office", "SISK Glass Bottle", "SISK Grand Canal Quay", "SISK Intel", "SISK Janssen", "SISK Limerick Office",
  "SISK National Cricket Centre", "SISK O'Devaney Gardens", "SISK Project Opera", "SISK Shanganagh WWTP", "SISK Sligo", "SISK Surgical Hub MPUH",
  "SISK UCD Student Residences", "SISK UHL Limerick", "SISK Vantage", "SISK VisionCare", "SISK Europe sites", "Farrans sites",
  "Sisk Dublin Site A", "Sisk Dublin Site B", "Salesforce Dublin, Demo Wellness Room", "IBM Dublin, Demo Screening Room",
  "Other, if not listed please advise Brenda",
];
/** Screening clinician picklist, from the staff roster. */
export const SCREENING_CLINICIANS = ["Fiona Fenton", "Anita Mulhere", "Liz Bawle", "Ian Murtagh"];
export const FIT_INFORMED_CHOICE_TEXT = "If you don't have any risks, a positive FIT result is more likely to be due to a benign reason (haemorrhoids, polyps, infection) than bowel cancer. To prove this you would need further testing (rectal examination, colonoscopy). Do you still want the FIT test?";
export const PSA_INFORMED_CHOICE_TEXT = "If you don't have any risk factors, a raised PSA result is more likely to be due to a benign reason than prostate cancer. To prove this you would need further testing (rectal examination, more PSA tests, an MRI scan and possibly a biopsy). Do you still want the PSA test?";

export type NurseFieldType = "choice" | "boolean" | "number" | "text" | "date" | "time" | "multi";
/** Where a field's value lives. "record" fields come from the person and booking and are read only here. */
export type NurseFieldStore = "record" | "form" | "measure" | "urine" | "notes" | "calc";
export type RecordKey = "appointment" | "given" | "family" | "email" | "phone" | "dob";
export type NurseShowIf =
  | { field: string; equals?: NurseFormValue; oneOf?: NurseFormValue[]; notEquals?: NurseFormValue }
  | { sex: "male" | "female" }
  | { minAge: number }
  | { maxAge: number }
  | { all: NurseShowIf[] }
  | { any: NurseShowIf[] };
export interface NurseFormField {
  key: string;
  label: string;
  type: NurseFieldType;
  store: NurseFieldStore;
  options?: string[];
  unit?: string;
  min?: number;
  max?: number;
  required: boolean;
  help?: string;
  showIf?: NurseShowIf;
  /** Where the participant already answered this, so the UI can show it for the nurse to confirm. */
  prefillFrom: "booking" | "questionnaire" | null;
  readOnly?: boolean;
  measureKey?: MeasureKey;
  urineKey?: "protein" | "glucose" | "blood" | "wcc";
  recordKey?: RecordKey;
}
export type NurseSectionKey = "registration" | "cv_risk" | "bowel" | "psa" | "measurements" | "ecg" | "urinalysis" | "closeout";
export interface NurseFormSection { key: NurseSectionKey; title: string; showIf?: NurseShowIf; note?: string; fields: NurseFormField[] }
/** Sex at birth and age at the appointment, for conditional fields. variant picks the form (absent means the lab form). */
export interface NurseFormCtx { sex: SexRecorded; age: number; variant?: "lab" | "poc" }

const yesNo = ["Yes", "No"];
const f = (key: string, label: string, type: NurseFieldType, o: Partial<NurseFormField> = {}): NurseFormField =>
  ({ key, label, type, store: "form", required: false, prefillFrom: null, ...o });
const rec = (key: string, label: string, recordKey: RecordKey, type: NurseFieldType = "text"): NurseFormField =>
  ({ key, label, type, store: "record", recordKey, required: true, prefillFrom: "booking", readOnly: true });
const meas = (key: MeasureKey, label: string, o: Partial<NurseFormField> = {}): NurseFormField =>
  ({ key, label, type: "number", store: "measure", measureKey: key, unit: MEASURE_RULES[key].unit, min: MEASURE_RULES[key].min, max: MEASURE_RULES[key].max, required: true, prefillFrom: null, ...o });
const bool = (key: string, label: string): NurseFormField => f(key, label, "boolean", { required: true, prefillFrom: "questionnaire" });

const BOWEL_NO_RISK: NurseShowIf = { all: [{ field: "bloodInStool", notEquals: "Yes" }, { field: "bowelHabitChange", notEquals: "Yes" }, { field: "famHistoryBowel", notEquals: "Yes" }] };
const PSA_ASKED: NurseShowIf = { any: [{ minAge: 46 }, { field: "psaRequested", equals: true }] };
const PSA_NO_RISK: NurseShowIf = { all: [{ field: "psaFamilyHistory", notEquals: true }, { field: "psaAfroCaribbean", notEquals: true }, { any: [{ field: "psaSymptoms", equals: null }, { field: "psaSymptoms", equals: "None of these" }] }] };

export const NURSE_FORM_SECTIONS: NurseFormSection[] = [
  { key: "registration", title: "Registration", fields: [
    rec("appointment", "Appointment date and time", "appointment"),
    rec("firstName", "First name", "given"),
    rec("lastName", "Last name", "family"),
    rec("email", "Email", "email"),
    rec("mobile", "Mobile", "phone"),
    f("emailE", "Email E", "text", { help: "A second email address, if the participant gives one." }),
    rec("dob", "Date of birth", "dob", "date"),
    f("sexAtBirth", "Sex at birth", "choice", { options: ["Male", "Female"], required: true, prefillFrom: "booking" }),
    f("company", "Company", "choice", { options: COMPANY_OPTIONS, required: true, prefillFrom: "booking" }),
    f("walkIn", "Walk-in?", "choice", { options: ["No", "Yes"], required: true, prefillFrom: "booking" }),
    f("employer", "Employer", "text", { prefillFrom: "booking" }),
  ] },
  { key: "cv_risk", title: "Cardiovascular Risk Questionnaire", note: "QRISK3 inputs. Prefilled from the participant questionnaire where answered; the nurse confirms.", fields: [
    f("ethnicity", "Ethnicity", "choice", { options: ["White or not stated", "Indian", "Pakistani", "Bangladeshi", "Other Asian", "Black African", "Black Caribbean", "Chinese", "Other ethnic group"], prefillFrom: "questionnaire" }),
    f("smoking", "Do you smoke", "choice", { options: SMOKING_OPTIONS, required: true, prefillFrom: "questionnaire", help: "Vaping is not smoking." }),
    f("smokingHistory", "Smoking history", "text"),
    bool("diabetesType2", "Diabetes Type 2"),
    bool("diabetesType1", "Diabetes Type 1"),
    bool("migraine", "Frequent migraine"),
    bool("rheumatoidArthritis", "Rheumatoid arthritis"),
    bool("sle", "Systemic lupus erythematosus"),
    bool("ckd", "Chronic kidney disease"),
    bool("atrialFibrillation", "Chronic atrial fibrillation"),
    bool("severeMentalIllness", "Severe mental illness"),
    bool("treatedHypertension", "Treated hypertension"),
    bool("atypicalAntipsychotic", "Atypical antipsychotic medication"),
    { ...bool("erectileDysfunction", "Treatment for erectile dysfunction"), showIf: { sex: "male" } },
    bool("oralSteroids", "Regular oral steroid medication"),
    bool("famHistoryCvd", "Family history of stroke/MI under 60 years?"),
    f("strokeOrMi", "Stroke or MI?", "choice", { options: ["No", "Yes"], required: true, prefillFrom: "questionnaire" }),
    f("strokeOrMiAge", "Age", "number", { unit: "years", min: 1, max: 100, required: true, prefillFrom: "questionnaire", showIf: { field: "strokeOrMi", equals: "Yes" } }),
  ] },
  { key: "bowel", title: "Bowel Cancer Risk Questionnaire", fields: [
    f("bowelScreen2y", "Bowel cancer screen in last 2 years?", "choice", { options: yesNo, prefillFrom: "questionnaire" }),
    f("bloodInStool", "Blood in stool recently?", "choice", { options: yesNo, prefillFrom: "questionnaire" }),
    f("bowelHabitChange", "Change in bowel habit lasting more than 1 month?", "choice", { options: yesNo, prefillFrom: "questionnaire" }),
    f("famHistoryBowel", "Family history of bowel cancer (parent or sibling)?", "choice", { options: yesNo, prefillFrom: "questionnaire" }),
    f("fitKit", "Fit kit given?", "choice", { options: FIT_KIT_OPTIONS, required: true }),
    f("fitInformedChoice", "Informed choice (no risk factors): Do you still want the FIT test?", "choice", { options: yesNo, required: true, help: FIT_INFORMED_CHOICE_TEXT,
      showIf: { all: [BOWEL_NO_RISK, { field: "fitKit", equals: "Yes" }] } }),
  ] },
  { key: "psa", title: "Prostate Specific Antigen Test", showIf: { sex: "male" }, note: "Men over 45, or younger men who ask. Informed choice when there are no risk factors.", fields: [
    f("psaRequested", "Aged 45 or under and asks for a PSA test", "boolean", { showIf: { maxAge: 45 } }),
    f("psaFamilyHistory", "Father or brother had prostate cancer under 60?", "boolean", { required: true, prefillFrom: "questionnaire", showIf: PSA_ASKED }),
    f("psaAfroCaribbean", "Afro-Caribbean heritage?", "boolean", { required: true, prefillFrom: "questionnaire", showIf: PSA_ASKED }),
    f("psaSymptoms", "Symptoms of bladder outflow obstruction", "multi", { options: PSA_SYMPTOM_OPTIONS, required: true, prefillFrom: "questionnaire", showIf: PSA_ASKED }),
    f("psaTaken", "PSA taken?", "choice", { options: PSA_TAKEN_OPTIONS, required: true, showIf: PSA_ASKED }),
    f("psaInformedChoice", "Informed choice (no risk factors): Do you still want the PSA test?", "choice", { options: yesNo, required: true, help: PSA_INFORMED_CHOICE_TEXT,
      showIf: { all: [PSA_ASKED, PSA_NO_RISK, { field: "psaTaken", equals: "Yes" }] } }),
  ] },
  { key: "measurements", title: "Measurements", fields: [
    meas("heightM", "Height"),
    meas("weightKg", "Weight"),
    f("bmi", "BMI", "number", { store: "calc", readOnly: true, unit: "kg/m²", help: "Calculated from height and weight. Never typed." }),
    meas("waistCm", "Waist circumference", { help: "In cm, for example 088." }),
    f("muscularPhysique", "Muscular physique?", "choice", { options: ["No", "Yes"], required: true }),
    meas("bpSys", "Systolic BP"),
    meas("bpDia", "Diastolic BP"),
    f("highBpHistory", "History of high BP?", "choice", { options: HIGH_BP_HISTORY_OPTIONS, prefillFrom: "questionnaire" }),
    meas("peakFlow", "Peak flow", { help: "Write 0 or Not Done if not part of screen. In Pulse, mark it Not done rather than 0." }),
  ] },
  { key: "ecg", title: "ECG", fields: [
    f("ecg", "ECG", "choice", { options: ["Done", "Not Done"], required: true }),
    meas("pulse", "Pulse rate (from the ECG machine)"),
    f("ecgAdvice", "ECG machine advice", "choice", { options: ECG_ADVICE_OPTIONS, required: true, showIf: { field: "ecg", equals: "Done" },
      help: "Irregular ECG and irregular pulse: take photos of the ECG and send them to the clinical channel." }),
    f("ecgComment", "ECG comment (symptoms, cardiac history)", "text", { required: true }),
    f("manualPulse", "Manual pulse", "choice", { options: ["Regular", "Irregular", "Other"], required: true }),
    f("ecgTime", "ECG time", "time", { required: true, showIf: { field: "ecg", equals: "Done" } }),
    f("ecgMachine", "ECG machine", "text", { required: true, showIf: { field: "ecg", equals: "Done" } }),
  ] },
  { key: "urinalysis", title: "Urinalysis", fields: [
    f("urinalysis", "Urinalysis", "choice", { options: ["Not done", "Complete"], required: true }),
    { key: "urineGlucose", label: "Glucose", type: "choice", store: "urine", urineKey: "glucose", options: URINE_DIPSTICK_OPTIONS, required: true, prefillFrom: null, showIf: { field: "urinalysis", equals: "Complete" } },
    { key: "urineProtein", label: "Protein", type: "choice", store: "urine", urineKey: "protein", options: URINE_DIPSTICK_OPTIONS, required: true, prefillFrom: null, showIf: { field: "urinalysis", equals: "Complete" } },
    { key: "urineBlood", label: "Blood", type: "choice", store: "urine", urineKey: "blood", options: URINE_DIPSTICK_OPTIONS, required: true, prefillFrom: null, showIf: { field: "urinalysis", equals: "Complete" } },
    { key: "urineWcc", label: "WCC", type: "choice", store: "urine", urineKey: "wcc", options: URINE_WCC_OPTIONS, required: true, prefillFrom: null, showIf: { field: "urinalysis", equals: "Complete" } },
    f("menstruating", "Menstruating?", "boolean", { showIf: { all: [{ sex: "female" }, { field: "urinalysis", equals: "Complete" }] }, help: "Shown in the clinician viewer. Blood in urine is common during menstruation." }),
  ] },
  { key: "closeout", title: "Close-out", fields: [
    f("bloodsTaken", "Bloods taken?", "choice", { options: yesNo, required: true }),
    f("approve", "Approve?", "choice", { options: APPROVE_OPTIONS, required: true, help: "Choosing the referral creates a doctor review task. The report cannot use the routine release shortcut." }),
    { key: "nurseComments", label: "Nurse comments", type: "text", store: "notes", required: true, prefillFrom: null, help: "Problems with the screening, symptoms, relevant information for abnormal measurements." },
    f("medications", "Medications", "text", { required: true, prefillFrom: "questionnaire", help: "Write \"nil\" if no meds." }),
    f("screeningClinician", "Screening clinician", "choice", { options: SCREENING_CLINICIANS, required: true, prefillFrom: "booking" }),
    f("advice", "Advice", "text", { readOnly: true, help: "Advice is the doctor's field. Do not write anything here; use Nurse comments instead." }),
  ] },
];
export const NURSE_FORM_FIELDS: NurseFormField[] = NURSE_FORM_SECTIONS.flatMap((s) => s.fields);
export const NURSE_FIELD_BY_KEY: Record<string, NurseFormField> = Object.fromEntries(NURSE_FORM_FIELDS.map((x) => [x.key, x]));

/** The value a field shows, read from wherever the field lives. Record and calculated fields return null here. */
export function nurseFieldValue(c: ClinicalCapture, field: NurseFormField): NurseFormValue {
  switch (field.store) {
    case "form": { const v = c.form?.[field.key]; return v === undefined ? null : v; }
    case "measure": { const m = c.measures[field.measureKey!]; return m && m.state === "recorded" ? m.value : null; }
    case "urine": { const v = c.urine ? c.urine[field.urineKey!] : undefined; return v === undefined || v === "" ? null : v; }
    case "notes": return c.notes ? c.notes : null;
    default: return null;
  }
}

function cond(x: NurseShowIf, c: ClinicalCapture, ctx: NurseFormCtx): boolean {
  if ("all" in x) return x.all.every((y) => cond(y, c, ctx));
  if ("any" in x) return x.any.some((y) => cond(y, c, ctx));
  if ("sex" in x) {
    const s = c.form?.sexAtBirth === "Male" ? "male" : c.form?.sexAtBirth === "Female" ? "female" : ctx.sex;
    return s === x.sex;
  }
  if ("minAge" in x) return ctx.age >= x.minAge;
  if ("maxAge" in x) return ctx.age <= x.maxAge;
  const field = NURSE_FIELD_BY_KEY[x.field] || POC_FIELD_BY_KEY[x.field];
  const raw = field ? nurseFieldValue(c, field) : c.form?.[x.field] ?? null;
  const v = raw === "" ? null : raw;
  if (x.oneOf) return x.oneOf.includes(v);
  if ("notEquals" in x) return v !== x.notEquals;
  return v === (x.equals === undefined ? null : x.equals);
}
export function nurseSectionVisible(section: NurseFormSection, c: ClinicalCapture, ctx: NurseFormCtx): boolean {
  return !section.showIf || cond(section.showIf, c, ctx);
}
/** Whether a field is asked for this participant, given the other answers. Hidden fields are never missing. */
export function nurseFieldVisible(field: NurseFormField, c: ClinicalCapture, ctx: NurseFormCtx): boolean {
  const section = NURSE_FORM_SECTIONS.find((s) => s.fields.includes(field));
  if (section && !nurseSectionVisible(section, c, ctx)) return false;
  return !field.showIf || cond(field.showIf, c, ctx);
}

/** Required nurse-form fields still blank. Measures marked not done or declined count as accounted for. */
export function nurseFormMissing(c: ClinicalCapture, ctx: NurseFormCtx): Array<{ section: NurseSectionKey; key: string; label: string }> {
  const out: Array<{ section: NurseSectionKey; key: string; label: string }> = [];
  for (const s of NURSE_FORM_SECTIONS) {
    if (!nurseSectionVisible(s, c, ctx)) continue;
    for (const field of s.fields) {
      if (!field.required || field.readOnly || field.store === "record" || field.store === "calc") continue;
      if (!nurseFieldVisible(field, c, ctx)) continue;
      const blank = field.store === "measure" ? isBlankMeasure(c.measures[field.measureKey!]) : (() => { const v = nurseFieldValue(c, field); return v === null || v === ""; })();
      if (blank) out.push({ section: s.key, key: field.key, label: field.label });
    }
  }
  return out;
}

/** Why one value is not acceptable for a field, or null. Null and blank are allowed here (that is "missing"). */
export function nurseValueError(field: NurseFormField, v: NurseFormValue | undefined): string | null {
  if (v === null || v === undefined || v === "") return null;
  switch (field.type) {
    case "boolean": return typeof v === "boolean" ? null : `${field.label}: answer yes or no.`;
    case "number": {
      if (typeof v !== "number" || !Number.isFinite(v)) return `${field.label} must be a number.`;
      if ((field.min !== undefined && v < field.min) || (field.max !== undefined && v > field.max)) return `${field.label} must be between ${field.min} and ${field.max}${field.unit ? " " + field.unit : ""}.`;
      return null;
    }
    case "choice": return typeof v === "string" && (field.options || []).includes(v) ? null : `${field.label}: choose one of the listed options.`;
    case "multi": {
      if (typeof v !== "string") return `${field.label}: choose from the listed options.`;
      const parts = v.split("; ");
      if (!parts.every((x) => (field.options || []).includes(x))) return `${field.label}: choose from the listed options.`;
      if (parts.length > 1 && parts.includes("None of these")) return `${field.label}: "None of these" cannot be combined with a symptom.`;
      return null;
    }
    case "date": return typeof v === "string" && isRealDate(v) ? null : `${field.label} must be a real date.`;
    case "time": return typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? null : `${field.label} must be a time as HH:MM.`;
    case "text": return typeof v === "string" ? null : `${field.label} must be text.`;
  }
  return null;
}

/** Invalid values across the visible nurse form, keyed by field. Includes the measure checks and the systolic and diastolic rule. */
export function nurseFormErrors(c: ClinicalCapture, ctx: NurseFormCtx): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of NURSE_FORM_FIELDS) {
    if (field.store === "record" || field.store === "calc" || field.store === "measure") continue;
    if (field.readOnly) {
      const v = c.form?.[field.key];
      if (v !== undefined && v !== null && v !== "") out[field.key] = `${field.label} is written by the doctor at review. Use Nurse comments instead.`;
      continue;
    }
    if (!nurseFieldVisible(field, c, ctx)) continue;
    const e = nurseValueError(field, nurseFieldValue(c, field));
    if (e) out[field.key] = e;
  }
  const m = captureErrors(c);
  for (const [k, e] of Object.entries(m)) if (e) out[k] = e;
  return out;
}

/** Problems with a patch to capture.form: unknown keys, read-only fields and invalid values. */
export function nurseFormPatchError(patch: Record<string, NurseFormValue>): string | null {
  for (const [k, v] of Object.entries(patch)) {
    // Lab form fields first, then the POC Screen with QRISK fields. Shared QRISK3 keys mean the same thing on both.
    const field = NURSE_FIELD_BY_KEY[k] || POC_FIELD_BY_KEY[k];
    if (!field || field.store !== "form") return `"${k}" is not a nurse-form field stored on the form.`;
    if (field.readOnly && v !== null && v !== "") return `${field.label} is written by the doctor at review. Use Nurse comments instead.`;
    const e = nurseValueError(field, v);
    if (e) return e;
  }
  return null;
}

/* ---- automations and bands read from the nurse form ---- */
export const isNurseReferral = (c: ClinicalCapture) => c.form?.approve === NURSE_REFERRAL_VALUE;
/** ECG advice J or K together with an irregular manual pulse: photos of the ECG go to the clinical channel. */
export const needsEcgReview = (c: ClinicalCapture) => typeof c.form?.ecgAdvice === "string" && ECG_IRREGULAR_ADVICE.includes(c.form.ecgAdvice) && c.form?.manualPulse === "Irregular";
export const psaTaken = (c: ClinicalCapture) => c.form?.psaTaken === "Yes";
export const fitKitGiven = (c: ClinicalCapture) => c.form?.fitKit === "Yes";

const ECG_NORMAL = ["a Stable waveform (normal)", "12-Lead normal"];
const ECG_ABNORMAL = ["H Slow heart rate and deviating waveform", "J Irregular heart rate", "K Irregular heart rate and deviating waveform", "L Deviating waveform", "12-Lead abnormal"];
/**
 * ECG band under the illustrative rule set: normal waveform codes are normal; rate-only codes,
 * borderline, analysis impossible and other messages are borderline; irregular or deviating
 * waveforms and 12-lead abnormal are abnormal. An irregular or other manual pulse is at least
 * borderline. Not done is not tested.
 */
export function ecgBand(c: ClinicalCapture): Band {
  if (c.form?.ecg !== "Done") return "not_tested";
  const advice = typeof c.form?.ecgAdvice === "string" ? c.form.ecgAdvice : "";
  let band: Band = !advice ? "not_tested" : ECG_NORMAL.includes(advice) ? "normal" : ECG_ABNORMAL.includes(advice) ? "abnormal" : "borderline";
  if ((c.form?.manualPulse === "Irregular" || c.form?.manualPulse === "Other") && (band === "normal" || band === "not_tested")) band = "borderline";
  return band;
}
/** Dipstick band: Nil normal; + (or white cells 10) borderline; more abnormal; Not done or blank not tested. */
export function urineBand(v: string | undefined | null, key: "protein" | "glucose" | "blood" | "wcc"): Band {
  if (!v || v === "Not done" || v === "Not Done" || v === "Declined") return "not_tested";
  if (v === "Nil" || v === "Negative") return "normal";
  if (key === "wcc") return v === "10" ? "borderline" : "abnormal";
  return v === "+" || v === "Trace" ? "borderline" : "abnormal";
}

/**
 * Nurse-form values the participant already gave: questionnaire answers mapped to the nurse form's
 * options, plus the booking's company, employer and walk-in. The nurse confirms each one.
 */
export function nurseFormPrefill(a: Answers, booking: { site: string; employer: string; sex: SexRecorded; walkIn?: boolean; clinician?: string | null }): Record<string, NurseFormValue> {
  const out: Record<string, NurseFormValue> = {};
  const yn = (k: string): string | null => (a[k] === true ? "Yes" : a[k] === false ? "No" : null);
  const bool = (k: string): boolean | null => (typeof a[k] === "boolean" ? (a[k] as boolean) : null);
  out.sexAtBirth = booking.sex === "male" ? "Male" : booking.sex === "female" ? "Female" : null;
  out.company = COMPANY_OPTIONS.includes(booking.site) ? booking.site : "Other, if not listed please advise Brenda";
  out.employer = booking.employer;
  out.walkIn = booking.walkIn ? "Yes" : "No";
  if (booking.clinician && SCREENING_CLINICIANS.includes(booking.clinician)) out.screeningClinician = booking.clinician;
  if (typeof a.ethnicity === "string") out.ethnicity = a.ethnicity;
  const smoking = smokingStatusFromAnswers(a);
  if (smoking && SMOKING_OPTIONS.includes(smoking)) out.smoking = smoking;
  for (const k of ["diabetesType2", "diabetesType1", "migraine", "rheumatoidArthritis", "sle", "ckd", "atrialFibrillation", "severeMentalIllness", "treatedHypertension", "atypicalAntipsychotic", "erectileDysfunction", "oralSteroids"]) {
    const v = bool(k); if (v !== null) out[k] = v;
  }
  if (bool("famCvd") !== null) out.famHistoryCvd = bool("famCvd");
  if (yn("strokeOrMi")) out.strokeOrMi = yn("strokeOrMi");
  if (a.strokeOrMi === true && typeof a.strokeOrMiAge === "number") out.strokeOrMiAge = a.strokeOrMiAge;
  for (const [k, q] of [["bowelScreen2y", "bowelScreen2y"], ["bloodInStool", "bloodInStool"], ["bowelHabitChange", "bowelHabitChange"], ["famHistoryBowel", "famHistoryBowel"]] as const) {
    const v = yn(q); if (v) out[k] = v;
  }
  if (bool("prostateFamilyHistory") !== null) out.psaFamilyHistory = bool("prostateFamilyHistory");
  if (bool("afroCaribbean") !== null) out.psaAfroCaribbean = bool("afroCaribbean");
  const symptoms = ([["prostateWeakStream", PSA_SYMPTOM_OPTIONS[0]], ["prostateNocturia", PSA_SYMPTOM_OPTIONS[1]], ["prostateDoubleVoid", PSA_SYMPTOM_OPTIONS[2]]] as const);
  if (symptoms.some(([k]) => typeof a[k] === "boolean")) {
    const yes = symptoms.filter(([k]) => a[k] === true).map(([, label]) => label);
    out.psaSymptoms = yes.length ? yes.join("; ") : "None of these";
  }
  const hb = highBpHistoryToNurse(a.highBpHistory);
  if (hb) out.highBpHistory = hb;
  if (typeof a.medications === "string" && a.medications.trim()) out.medications = /^none$/i.test(a.medications.trim()) ? "nil" : a.medications.trim();
  return out;
}
