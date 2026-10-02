/* The participant questionnaire shown in the portal preview. Sections follow
   QUESTIONNAIRE_SECTIONS from the model. Conditional questions appear only when their
   condition holds, and hidden answers are cleared on save. Wording is plain and
   prewritten. Nothing here triages or interprets an answer. */
import { QUESTIONNAIRE_SECTIONS } from "../../model";

export type Answer = string | number | boolean;
export type Answers = Record<string, Answer>;

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
  showIf?: { key: string; equals: Answer };
}

export const SECTION_QUESTIONS: Record<string, Question[]> = {
  about: [
    { key: "workPattern", label: "Which best describes your working day?", type: "choice", required: false, options: ["Mostly seated", "Mixed", "Mostly on my feet"] },
    { key: "hasGp", label: "Do you have a GP?", type: "yesno", required: false, help: "Your report may suggest discussing a result with your GP." },
    { key: "gpName", label: "GP practice name", type: "text", required: false, showIf: { key: "hasGp", equals: true } },
    { key: "knownDiabetes", label: "Have you been diagnosed with diabetes?", type: "yesno", required: false },
    { key: "diabetesType", label: "Which type?", type: "choice", required: false, options: ["Type 1", "Type 2", "Other or not sure"], showIf: { key: "knownDiabetes", equals: true } },
  ],
  lifestyle: [
    { key: "smoking", label: "Do you smoke?", type: "choice", required: true, options: ["Never", "Former", "Current"] },
    { key: "cigsPerDay", label: "About how many cigarettes a day?", type: "number", required: true, unit: "per day", min: 1, max: 100, showIf: { key: "smoking", equals: "Current" } },
    { key: "alcohol", label: "About how many units of alcohol do you drink in a typical week?", type: "number", required: true, unit: "units a week", min: 0, max: 200, help: "One unit is about half a pint of beer or a single measure of spirits." },
    { key: "activity", label: "On how many days a week are you active for 30 minutes or more?", type: "number", required: false, unit: "days a week", min: 0, max: 7 },
    { key: "sleep", label: "How many hours do you usually sleep a night?", type: "number", required: false, unit: "hours", min: 2, max: 14 },
  ],
  heart: [
    { key: "chestPain", label: "Do you get chest pain or tightness when you exert yourself?", type: "yesno", required: true, help: "This questionnaire is not monitored in real time. If you have chest pain now, call 112 or 999." },
    { key: "chestPainFreq", label: "How often does it happen?", type: "choice", required: true, options: ["Rarely", "Monthly", "Weekly", "Daily"], showIf: { key: "chestPain", equals: true } },
    { key: "palpitations", label: "Do you notice a racing or irregular heartbeat (palpitations)?", type: "yesno", required: true },
    { key: "highBp", label: "Have you ever been told you have high blood pressure?", type: "choice", required: true, options: ["No", "Yes", "Not sure"] },
  ],
  family: [
    { key: "famCvd", label: "Has a parent, brother or sister had heart disease before age 60?", type: "yesno", required: true },
    { key: "famDiabetes", label: "Does anyone in your close family have diabetes?", type: "yesno", required: true },
    { key: "famCancer", label: "Has a close relative had cancer before age 50?", type: "yesno", required: true },
    { key: "famCancerType", label: "Type of cancer, if you know it", type: "text", required: false, showIf: { key: "famCancer", equals: true } },
  ],
  medication: [
    { key: "medication", label: "Do you take any medication?", type: "choice", required: true, options: ["None", "Occasional", "Regular prescription"] },
    { key: "medicationDetail", label: "Which regular medication? (optional)", type: "text", required: false, showIf: { key: "medication", equals: "Regular prescription" } },
    { key: "allergies", label: "Do you have any allergies?", type: "choice", required: true, options: ["None", "Yes"] },
    { key: "allergyDetail", label: "What are you allergic to?", type: "text", required: true, showIf: { key: "allergies", equals: "Yes" } },
  ],
};

export const SECTIONS = QUESTIONNAIRE_SECTIONS.map((s) => ({ ...s, questions: SECTION_QUESTIONS[s.key] || [] }));
export const CONSENT_KEYS = ["consentService", "consentData", "consentSms"] as const;

export const isBlank = (v: Answer | undefined) => v === undefined || v === "" || (typeof v === "number" && !Number.isFinite(v));

export function visible(q: Question, a: Answers): boolean {
  return !q.showIf || a[q.showIf.key] === q.showIf.equals;
}

/** Errors for the visible questions of one section, keyed by question. */
export function sectionErrors(sectionKey: string, a: Answers): Record<string, string> {
  const out: Record<string, string> = {};
  for (const q of SECTION_QUESTIONS[sectionKey] || []) {
    if (!visible(q, a)) continue;
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
  }
  return out;
}

/** The answers to save for a section: visible answers kept, hidden conditional answers cleared. */
export function sectionPayload(sectionKey: string, a: Answers): Answers {
  const out: Answers = {};
  for (const q of SECTION_QUESTIONS[sectionKey] || []) {
    if (!visible(q, a)) { if (a[q.key] !== undefined) out[q.key] = ""; continue; }
    const v = a[q.key];
    if (v === undefined) continue;
    out[q.key] = q.type === "number" && typeof v === "string" ? (v.trim() === "" ? "" : Number(v)) : v;
  }
  return out;
}

export function answerText(q: Question, v: Answer | undefined): string {
  if (isBlank(v)) return "Not answered";
  if (q.type === "yesno") return v === true ? "Yes" : v === false ? "No" : String(v);
  if (q.type === "number") return `${v}${q.unit ? " " + q.unit : ""}`;
  return String(v);
}
