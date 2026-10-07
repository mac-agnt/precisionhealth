/* The participant pre-screening questionnaire as data. Section lifestyle carries the 14 questions
   of Precision Health's Lifestyle Questionnaire (participant report page 2) word for word. Section
   heart asks the QRISK3 inputs from the nurse form in plain participant wording, so the nurse can
   confirm them instead of asking again. Cancer and medication follow the nurse form's bowel,
   prostate and close-out questions. Conditional questions appear only when their condition holds.
   Nothing here triages or interprets an answer. No imports from constants, to keep it cycle-free. */
import type { SexRecorded } from "./types";

/** One questionnaire answer. (Named AnswerValue because Answer is the assistant answer type in ai.ts.) */
export type AnswerValue = string | number | boolean;
export type Answers = Record<string, AnswerValue>;

export interface Question {
  key: string;
  label: string;
  type: "choice" | "yesno" | "number" | "text";
  required: boolean;
  options?: string[];
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  help?: string;
  /** Shown only when another answer equals a value, or is one of several values. */
  showIf?: { key: string; equals?: AnswerValue; oneOf?: AnswerValue[] };
  /** Shown only for this sex at birth. Hidden when sex is not known. */
  showIfSex?: "male" | "female";
  /** Shown only from this age. Hidden when age is not known. */
  minAge?: number;
}

/** Who is answering. Sex- and age-conditional questions stay hidden without it. */
export interface QuestionCtx { sex?: SexRecorded; age?: number; employer?: string }

export const QUESTIONNAIRE_SECTIONS = [
  { key: "lifestyle", title: "Lifestyle" },
  { key: "heart", title: "Heart health" },
  { key: "cancer", title: "Cancer screening questions" },
  { key: "medication", title: "Medication and blood pressure" },
];

/* ---- option lists ---- */
const FREQ = ["Never", "Less than 3 times per week", "3-6 times per week", "Daily"];
export const ALCOHOL_FREQUENCY = ["Never", "Monthly or less", "2-4 times per month", "2-3 times per week", "4 or more times per week"];
export const ALCOHOL_UNITS = ["1-2", "3-4", "5-6", "7-9", "10 or more"];
export const ETHNICITY_OPTIONS = ["White or not stated", "Indian", "Pakistani", "Bangladeshi", "Other Asian", "Black African", "Black Caribbean", "Chinese", "Other ethnic group"];
/** Same wording as the nurse form, so the answer carries straight across. */
export const SMOKING_AMOUNT = ["1-10 cigarettes per day", "11-20 cigarettes per day", "more than 20 cigarettes per day"];
export const HIGH_BP_HISTORY_ANSWERS = ["No", "Yes, I take treatment for it", "Yes, but only when measured at a clinic (white coat)", "Yes"];
const SELF_EXAM = ["Yes, regularly", "Sometimes", "No"];

/** Placeholder replaced with the employer name in the mental health supports statement. */
export const EMPLOYER_TOKEN = "{employer}";

export const SECTION_QUESTIONS: Record<string, Question[]> = {
  lifestyle: [
    { key: "healthChange", label: "How do you feel your health has changed in the past year?", type: "choice", required: true, options: ["Improved", "Stayed the same", "Got worse"] },
    { key: "smokesCigarettes", label: "Do you smoke cigarettes?", type: "choice", required: true, options: ["No", "Ex-smoker", "Yes"], help: "Vaping is asked about separately." },
    { key: "vaping", label: "Do you use e-cigarettes (vaping)?", type: "choice", required: true, options: ["No", "Yes, occasionally", "Yes, daily"] },
    { key: "alcoholFrequency", label: "How often do you have an alcoholic drink?", type: "choice", required: true, options: ALCOHOL_FREQUENCY },
    { key: "alcoholUnits", label: "How many units of alcohol do you drink on those days?", type: "choice", required: true, options: ALCOHOL_UNITS,
      showIf: { key: "alcoholFrequency", oneOf: ALCOHOL_FREQUENCY.slice(1) }, help: "One unit is about half a pint of beer, a small glass of wine or a single measure of spirits." },
    { key: "fruitVeg", label: "How often do you eat 5 or more portions of fruit or vegetables?", type: "choice", required: true, options: FREQ },
    { key: "sugarDrinks", label: "How often do you drink full sugar drinks eg Coke, 7-Up?", type: "choice", required: true, options: FREQ },
    { key: "redMeat", label: "How often do you eat red meat?", type: "choice", required: true, options: FREQ },
    { key: "addSalt", label: "How often do you add salt to your food?", type: "choice", required: true, options: FREQ },
    { key: "water", label: "How often do you drink the recommended daily amount of water?", type: "choice", required: true,
      options: ["I usually drink the recommended amount.", "I sometimes drink the recommended amount.", "I usually drink less than the recommended amount."] },
    { key: "exerciseDays", label: "How many days per week do you get 30 minutes of exercise?", type: "number", required: true, min: 0, max: 7, unit: "days" },
    { key: "mentalHealthAware", label: `I am aware of the mental health supports, resources and training that ${EMPLOYER_TOKEN} has to offer.`, type: "choice", required: true,
      options: ["Strongly agree", "Agree", "Neither agree nor disagree", "Disagree", "Strongly disagree"] },
    { key: "foodLabels", label: "Do you pay attention to nutritional information on food labels?", type: "choice", required: true, options: ["Always", "Sometimes", "Never"] },
    { key: "examineTesticles", label: "Do you examine your testicles?", type: "choice", required: true, options: SELF_EXAM, showIfSex: "male" },
    { key: "examineBreasts", label: "Do you examine your breasts?", type: "choice", required: true, options: SELF_EXAM, showIfSex: "female" },
  ],
  heart: [
    { key: "ethnicity", label: "Which best describes your ethnic background?", type: "choice", required: true, options: ETHNICITY_OPTIONS, help: "Heart risk scores differ between ethnic groups." },
    { key: "smokingAmount", label: "About how many cigarettes do you smoke?", type: "choice", required: true, options: SMOKING_AMOUNT, showIf: { key: "smokesCigarettes", equals: "Yes" } },
    { key: "diabetesType2", label: "Has a doctor told you that you have type 2 diabetes?", type: "yesno", required: true },
    { key: "diabetesType1", label: "Has a doctor told you that you have type 1 diabetes?", type: "yesno", required: true },
    { key: "migraine", label: "Has a doctor told you that you have frequent migraines?", type: "yesno", required: true },
    { key: "rheumatoidArthritis", label: "Has a doctor told you that you have rheumatoid arthritis?", type: "yesno", required: true },
    { key: "sle", label: "Has a doctor told you that you have lupus (systemic lupus erythematosus)?", type: "yesno", required: true },
    { key: "ckd", label: "Has a doctor told you that you have chronic kidney disease?", type: "yesno", required: true },
    { key: "atrialFibrillation", label: "Has a doctor told you that you have atrial fibrillation (an irregular heartbeat)?", type: "yesno", required: true },
    { key: "severeMentalIllness", label: "Has a doctor told you that you have a severe mental illness, such as schizophrenia or bipolar disorder?", type: "yesno", required: true },
    { key: "treatedHypertension", label: "Do you take tablets for high blood pressure?", type: "yesno", required: true },
    { key: "atypicalAntipsychotic", label: "Do you take an atypical antipsychotic medicine (for example olanzapine, quetiapine or risperidone)?", type: "yesno", required: true },
    { key: "erectileDysfunction", label: "Have you been treated for erectile dysfunction?", type: "yesno", required: true, showIfSex: "male" },
    { key: "oralSteroids", label: "Do you take steroid tablets regularly (for example prednisolone)?", type: "yesno", required: true },
    { key: "famCvd", label: "Has a parent, brother or sister had a heart attack or stroke before the age of 60?", type: "yesno", required: true },
    { key: "strokeOrMi", label: "Have you ever had a heart attack or a stroke?", type: "yesno", required: true, help: "This questionnaire is not monitored in real time. If you have chest pain now, call 112 or 999." },
    { key: "strokeOrMiAge", label: "How old were you when it happened?", type: "number", required: true, min: 1, max: 100, unit: "years", showIf: { key: "strokeOrMi", equals: true } },
  ],
  cancer: [
    { key: "bowelScreen2y", label: "Have you done a bowel cancer screening test in the last 2 years?", type: "yesno", required: true },
    { key: "bloodInStool", label: "Have you noticed blood in your stool recently?", type: "yesno", required: true },
    { key: "bowelHabitChange", label: "Have you had a change in bowel habit lasting more than 1 month?", type: "yesno", required: true },
    { key: "famHistoryBowel", label: "Has a parent, brother or sister had bowel cancer?", type: "yesno", required: true },
    { key: "prostateFamilyHistory", label: "Has your father or brother had prostate cancer before the age of 60?", type: "yesno", required: true, showIfSex: "male", minAge: 46 },
    { key: "afroCaribbean", label: "Do you have Afro-Caribbean heritage?", type: "yesno", required: true, showIfSex: "male", minAge: 46 },
    { key: "prostateWeakStream", label: "Is your urine stream weak or dribbling?", type: "yesno", required: true, showIfSex: "male", minAge: 46 },
    { key: "prostateNocturia", label: "Do you wake to pass urine more than 3 times a night?", type: "yesno", required: true, showIfSex: "male", minAge: 46 },
    { key: "prostateDoubleVoid", label: "Do you need to go back to pass urine again straight after finishing?", type: "yesno", required: true, showIfSex: "male", minAge: 46 },
    { key: "testicularLumpsNow", label: "Do you have any undiagnosed lumps in your testicles now?", type: "yesno", required: true, showIfSex: "male" },
    { key: "breastLumpsNow", label: "Do you have any undiagnosed lumps in your breasts now?", type: "yesno", required: true, showIfSex: "female" },
    { key: "cervicalScreening", label: "Are you up to date with your cervical screening (smear test)?", type: "choice", required: true, options: ["Yes", "No", "Not sure"], showIfSex: "female", minAge: 25 },
  ],
  medication: [
    { key: "medications", label: "Which medications do you take regularly?", type: "text", required: true, help: "List each one, or write None." },
    { key: "highBpHistory", label: "Have you ever been told you have high blood pressure?", type: "choice", required: true, options: HIGH_BP_HISTORY_ANSWERS },
  ],
};

export const SECTIONS = QUESTIONNAIRE_SECTIONS.map((s) => ({ ...s, questions: SECTION_QUESTIONS[s.key] || [] }));
export const ALL_QUESTIONS: Question[] = QUESTIONNAIRE_SECTIONS.flatMap((s) => SECTION_QUESTIONS[s.key] || []);
export const QUESTION_BY_KEY: Record<string, Question> = Object.fromEntries(ALL_QUESTIONS.map((q) => [q.key, q]));
export const CONSENT_KEYS = ["consentService", "consentData", "consentSms"] as const;

export const isBlank = (v: AnswerValue | undefined | null) => v === undefined || v === null || v === "" || (typeof v === "number" && !Number.isFinite(v));

/** The question text with the employer name filled in. */
export function questionLabel(q: Question, ctx?: QuestionCtx): string {
  return q.label.replace(EMPLOYER_TOKEN, ctx?.employer || "your employer");
}

/** Whether a question is asked, given the answers so far and who is answering. */
export function visible(q: Question, a: Answers, ctx?: QuestionCtx): boolean {
  if (q.showIfSex && ctx?.sex !== q.showIfSex) return false;
  if (q.minAge !== undefined && (ctx?.age === undefined || ctx.age < q.minAge)) return false;
  if (!q.showIf) return true;
  const v = a[q.showIf.key];
  if (q.showIf.oneOf) return q.showIf.oneOf.includes(v);
  return v === q.showIf.equals;
}

/** Errors for the visible questions of one section, keyed by question. */
export function sectionErrors(sectionKey: string, a: Answers, ctx?: QuestionCtx): Record<string, string> {
  const out: Record<string, string> = {};
  for (const q of SECTION_QUESTIONS[sectionKey] || []) {
    if (!visible(q, a, ctx)) continue;
    const v = a[q.key];
    if (isBlank(v)) {
      if (q.required) out[q.key] = "Please answer this question.";
      continue;
    }
    if (q.type === "number") {
      const n = typeof v === "number" ? v : Number(v);
      if (!Number.isFinite(n)) out[q.key] = "Enter a number.";
      else if ((q.min !== undefined && n < q.min) || (q.max !== undefined && n > q.max)) out[q.key] = `Enter a number from ${q.min} to ${q.max}.`;
    }
    if (q.type === "choice" && q.options && !q.options.includes(String(v))) out[q.key] = "Choose one of the options.";
  }
  return out;
}

/** The answers to save for a section: visible answers kept, hidden conditional answers cleared. */
export function sectionPayload(sectionKey: string, a: Answers, ctx?: QuestionCtx): Answers {
  const out: Answers = {};
  for (const q of SECTION_QUESTIONS[sectionKey] || []) {
    if (!visible(q, a, ctx)) { if (a[q.key] !== undefined) out[q.key] = ""; continue; }
    const v = a[q.key];
    if (v === undefined) continue;
    out[q.key] = q.type === "number" && typeof v === "string" ? (v.trim() === "" ? "" : Number(v)) : v;
  }
  return out;
}

export function answerText(q: Question, v: AnswerValue | undefined): string {
  if (isBlank(v)) return "Not answered";
  if (q.type === "yesno") return v === true ? "Yes" : v === false ? "No" : String(v);
  if (q.type === "number") return `${v}${q.unit ? " " + q.unit : ""}`;
  return String(v);
}

/** The lifestyle questions in report order, as [question, answer] rows for one person. Hidden questions are left out. */
export function lifestyleRows(a: Answers, ctx?: QuestionCtx): Array<{ key: string; question: string; answer: string; answered: boolean }> {
  return (SECTION_QUESTIONS.lifestyle || [])
    .filter((q) => visible(q, a, ctx))
    .map((q) => ({ key: q.key, question: questionLabel(q, ctx), answer: q.key === "exerciseDays" && !isBlank(a[q.key]) ? String(a[q.key]) : answerText(q, a[q.key]), answered: !isBlank(a[q.key]) }));
}

/* ---- derived answers for the clinician viewer ---- */
const FREQ_PER_WEEK: Record<string, number> = { "Never": 0, "Monthly or less": 0.25, "2-4 times per month": 0.75, "2-3 times per week": 2.5, "4 or more times per week": 5 };
const UNITS_PER_OCCASION: Record<string, number> = { "1-2": 1.5, "3-4": 3.5, "5-6": 5.5, "7-9": 8, "10 or more": 10 };

/**
 * Estimated alcohol units a week from the two lifestyle answers (occasions a week times units on
 * those days, using the middle of each answer band). An estimate for the viewer, labelled as such.
 * Null when either answer is missing.
 */
export function alcoholUnitsPerWeek(a: Answers): number | null {
  const f = a.alcoholFrequency;
  if (typeof f !== "string" || !(f in FREQ_PER_WEEK)) return null;
  if (f === "Never") return 0;
  const u = a.alcoholUnits;
  if (typeof u !== "string" || !(u in UNITS_PER_OCCASION)) return null;
  return Math.round(FREQ_PER_WEEK[f] * UNITS_PER_OCCASION[u]);
}

/** Smoking in the nurse form's words, from the participant's answers. Null when not answered. */
export function smokingStatusFromAnswers(a: Answers): string | null {
  const s = a.smokesCigarettes;
  if (s === "No") return "No";
  if (s === "Ex-smoker") return "Ex-smoker";
  if (s === "Yes") return typeof a.smokingAmount === "string" && a.smokingAmount ? a.smokingAmount : "Yes, amount not given";
  return null;
}

/** The nurse form's history of high blood pressure option for a participant answer. */
export function highBpHistoryToNurse(v: AnswerValue | undefined): string | null {
  switch (v) {
    case "No": return "No";
    case "Yes, I take treatment for it": return "Yes (on treatment)";
    case "Yes, but only when measured at a clinic (white coat)": return "Yes (white coat)";
    case "Yes": return "Yes";
    default: return null;
  }
}

/** The answers the clinician viewer shows beside the results. Missing answers stay null, never "No". */
export interface AnswerSummary {
  smoker: string | null;
  familyHistoryCvd: boolean | null;
  diabetes: "Type 1" | "Type 2" | "No" | null;
  hypertensionTreatment: boolean | null;
  alcoholUnitsPerWeek: number | null;
  medications: string | null;
  highBpHistory: string | null;
}
export function answerSummary(a: Answers): AnswerSummary {
  const yn = (k: string): boolean | null => (typeof a[k] === "boolean" ? (a[k] as boolean) : null);
  const t1 = yn("diabetesType1"), t2 = yn("diabetesType2");
  return {
    smoker: smokingStatusFromAnswers(a),
    familyHistoryCvd: yn("famCvd"),
    diabetes: t1 ? "Type 1" : t2 ? "Type 2" : t1 === false && t2 === false ? "No" : null,
    hypertensionTreatment: yn("treatedHypertension"),
    alcoholUnitsPerWeek: alcoholUnitsPerWeek(a),
    medications: typeof a.medications === "string" && a.medications.trim() ? a.medications.trim() : null,
    highBpHistory: highBpHistoryToNurse(a.highBpHistory),
  };
}
