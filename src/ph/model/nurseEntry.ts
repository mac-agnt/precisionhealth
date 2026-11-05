/* Nurse entry screen helpers: live bands for measurements as the nurse types them, read from Dr
   Neil Reddy's reference ranges (the version in force on the clinic date), and a plain summary of
   what the participant told us in the booking questionnaire, with the answers worth a second look
   flagged for the nurse. Nothing here diagnoses: a band only says where a value sits against the
   published table, and a flag only means "talk about this with the participant". */
import type { Band, SexRecorded } from "./types";
import type { LocalDate } from "./time";
import type { Answers } from "./questionnaire";
import { alcoholUnitsPerWeek, highBpHistoryToNurse, smokingStatusFromAnswers } from "./questionnaire";
import { bpCategory, rrClassify, waistCategory } from "./constants";
import { RR_TEST_BY_ID, activeRangeVersions } from "./referenceRangesData";
import { RR_BAND_ORDER, boundsText, rowFor, rrVersionInForce } from "./referenceRanges";
import type { RrBand, RrVersion } from "./referenceRanges";

/** Tests the nurse enters on the day, by id in Neil's reference ranges table. */
export type LiveTestId = "height" | "weight" | "bmi" | "waist" | "bpsys" | "bpdia" | "pulse" | "tc" | "hdl" | "hba1c";
export interface LivePerson { sex: SexRecorded; age: number; ethnicity?: string | null; on?: LocalDate }

export interface LiveBand {
  /** normal green, borderline yellow, abnormal orange; not_tested grey when no range applies. */
  band: Band;
  /** Plain word for the chip, for example Normal, Borderline, Outside range. */
  word: string;
  /** The table's own descriptor, for example OVERWEIGHT or HIGH MILD. */
  label: string;
  /** The normal range for this person in plain words, for example "Normal: 60 to 100 beats/min". */
  normalText: string;
  /** Which version of the ranges judged it, for example "Ranges v1, in force from 1 Jan 2026". */
  versionText: string;
  /** Height and weight have no bands: they are recorded only. */
  recordedOnly: boolean;
  /** A clinical safety threshold (for example blood pressure 180 or more). */
  urgent: boolean;
}

const WORD: Record<Band, string> = { normal: "Normal", borderline: "Borderline", abnormal: "Outside range", not_tested: "No range" };

function normalBandText(b: RrBand | undefined, decimals: number, unit: string): string {
  if (!b) return "No normal range set";
  const t = boundsText(b, decimals);
  const pretty = t.replace(/^from (\S+) up to and including (\S+)$/, "$1 to $2").replace(/^from (\S+) up to but not including (\S+)$/, "$1 to under $2");
  return `Normal: ${pretty} ${unit}`.trim();
}

/** The live band for one value, or null while the value is blank or not a number. */
export function liveBand(test: LiveTestId, value: number | null | undefined, who: LivePerson, versions: RrVersion[] = activeRangeVersions()): LiveBand | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const t = RR_TEST_BY_ID[test];
  if (!t) return null;
  const on = who.on || "9999-12-31";
  const v = rrVersionInForce(versions, t.id, on);
  const versionText = v ? `Ranges v${v.version}, in force from ${v.effectiveFrom.split("-").reverse().join("/")}` : "No published range";
  if (t.kind === "recorded") {
    return { band: "not_tested", word: "Recorded", label: "", normalText: "Recorded only. No normal range: it is used to work out BMI.", versionText, recordedOnly: true, urgent: false };
  }
  const r = rrClassify(t, value, { sex: who.sex, age: who.age, ethnicity: who.ethnicity ?? null, on: who.on, versions });
  const person = { sex: who.sex, age: who.age, ethnicity: who.ethnicity ?? null, pregnant: null };
  let normal: RrBand | undefined;
  if (v) {
    const row = rowFor(v.rows, person).row || (who.sex === "not_recorded" ? rowFor(v.rows, { ...person, sex: "male" }).row : null);
    normal = row?.bands.find((b) => b.key === "normal");
  }
  const normalText = normalBandText(normal, t.decimals, t.unit);
  if (test === "bpsys" || test === "bpdia") {
    // Blood pressure follows the report's significance table (the same rule as the clinician viewer): 121 to 140 systolic is MILD and green.
    const bp = test === "bpsys" ? bpCategory(value, 0, who.on) : bpCategory(0, value, who.on);
    const urgentBp = bp.word === "IMMEDIATE TREATMENT";
    return { band: bp.band, word: urgentBp ? "Urgent" : WORD[bp.band], label: bp.word, normalText: `${normalText.replace(/^Normal/, "Ideal")}`, versionText, recordedOnly: false, urgent: urgentBp };
  }
  if (test === "waist") {
    const w = waistCategory(value, who.sex, who.on);
    return { band: w.band, word: WORD[w.band], label: w.word, normalText, versionText, recordedOnly: false, urgent: false };
  }
  const band: Band = r.band;
  const urgent = r.outcome === "high_critical";
  // BMI says what it means (Underweight, Overweight, Obese) rather than a generic band word, as Neil asked.
  const bmiWord = test === "bmi" && /^(UNDERWEIGHT|NORMAL|OVERWEIGHT|OBESE)$/.test(r.label) ? r.label.charAt(0) + r.label.slice(1).toLowerCase() : null;
  const word = urgent ? "Urgent" : bmiWord ?? WORD[band];
  return { band, word, label: r.label, normalText, versionText, recordedOnly: false, urgent };
}

/** Every band of a test for this person, lowest first, for a small legend. */
export function bandsFor(test: LiveTestId, who: LivePerson, versions: RrVersion[] = activeRangeVersions()): Array<{ key: string; label: string; text: string }> {
  const t = RR_TEST_BY_ID[test];
  const v = t ? rrVersionInForce(versions, t.id, who.on || "9999-12-31") : null;
  if (!t || !v) return [];
  const row = rowFor(v.rows, { sex: who.sex, age: who.age, ethnicity: who.ethnicity ?? null, pregnant: null }).row;
  if (!row || row.status !== "set") return [];
  return RR_BAND_ORDER.map((k) => row.bands.find((b) => b.key === k)).filter((b): b is RrBand => !!b).map((b) => ({ key: b.key, label: b.label, text: boundsText(b, t.decimals) }));
}

/** Bands for the point-of-care outcome choice ("Normal", "Borderline", "Abnormal"), from a live band. */
export function suggestedOutcome(b: LiveBand | null): "Normal" | "Borderline" | "Abnormal" | null {
  if (!b || b.recordedOnly || b.band === "not_tested") return null;
  return b.band === "normal" ? "Normal" : b.band === "borderline" ? "Borderline" : "Abnormal";
}

/* ---------------------------------------------------------------------------------------------
   What they told us: the booking questionnaire, grouped for the nurse
   --------------------------------------------------------------------------------------------- */
export interface ToldItem { key: string; label: string; value: string; flag: boolean; note?: string }
export interface ToldGroup { key: "lifestyle" | "history" | "medications" | "family" | "symptoms"; title: string; items: ToldItem[] }

const CONDITIONS: Array<[string, string]> = [
  ["diabetesType2", "Type 2 diabetes"], ["diabetesType1", "Type 1 diabetes"], ["atrialFibrillation", "Atrial fibrillation"], ["ckd", "Chronic kidney disease"],
  ["rheumatoidArthritis", "Rheumatoid arthritis"], ["sle", "Lupus (SLE)"], ["migraine", "Frequent migraines"], ["severeMentalIllness", "Severe mental illness"],
  ["treatedHypertension", "Tablets for high blood pressure"], ["atypicalAntipsychotic", "Atypical antipsychotic medicine"], ["oralSteroids", "Regular steroid tablets"], ["erectileDysfunction", "Treated for erectile dysfunction"],
];

/**
 * The participant's own answers, grouped the way a nurse talks them through: lifestyle, medical
 * history, medications, family history and anything to ask about today. Flags mark answers worth
 * a second look; they are prompts for the conversation, never a diagnosis.
 */
export function whatTheyToldUs(a: Answers, sex: SexRecorded): ToldGroup[] {
  const has = (k: string) => a[k] !== undefined && a[k] !== null && a[k] !== "";
  const yes = (k: string) => a[k] === true;
  const lifestyle: ToldItem[] = [];
  const smoking = smokingStatusFromAnswers(a);
  if (smoking) lifestyle.push({ key: "smoking", label: "Smoking", value: smoking, flag: smoking !== "No" && smoking !== "Ex-smoker", note: smoking !== "No" && smoking !== "Ex-smoker" ? "Offer stop-smoking support" : undefined });
  if (has("vaping")) lifestyle.push({ key: "vaping", label: "Vaping", value: String(a.vaping), flag: a.vaping === "Yes, daily" });
  const units = alcoholUnitsPerWeek(a);
  if (units !== null) lifestyle.push({ key: "alcohol", label: "Alcohol", value: units === 0 ? "Does not drink" : `About ${units} units a week`, flag: units > 14, note: units > 14 ? "Above the 14 units a week guide" : undefined });
  if (has("exerciseDays")) {
    const d = Number(a.exerciseDays);
    lifestyle.push({ key: "exercise", label: "Exercise", value: `30 minutes on ${d} day${d === 1 ? "" : "s"} a week`, flag: d <= 1 });
  }
  if (has("fruitVeg")) lifestyle.push({ key: "fruitVeg", label: "5 a day fruit and veg", value: String(a.fruitVeg), flag: a.fruitVeg === "Never" });
  if (has("healthChange")) lifestyle.push({ key: "healthChange", label: "Health in the past year", value: String(a.healthChange), flag: a.healthChange === "Got worse" });

  const history: ToldItem[] = [];
  const told = CONDITIONS.filter(([k]) => yes(k)).map(([, l]) => l);
  const answeredAny = CONDITIONS.some(([k]) => typeof a[k] === "boolean");
  if (answeredAny) history.push({ key: "conditions", label: "Conditions a doctor told them about", value: told.length ? told.join(", ") : "None", flag: told.length > 0 });
  if (has("strokeOrMi")) history.push({ key: "strokeOrMi", label: "Heart attack or stroke", value: yes("strokeOrMi") ? `Yes${typeof a.strokeOrMiAge === "number" ? `, at age ${a.strokeOrMiAge}` : ""}` : "No", flag: yes("strokeOrMi") });
  const hb = highBpHistoryToNurse(a.highBpHistory);
  if (hb) history.push({ key: "highBp", label: "High blood pressure before", value: hb, flag: hb !== "No" });
  if (has("ethnicity")) history.push({ key: "ethnicity", label: "Ethnic background", value: String(a.ethnicity), flag: false, note: "Used for the BMI range and QRISK3" });

  const medications: ToldItem[] = [];
  if (typeof a.medications === "string" && a.medications.trim()) {
    const none = /^(none|nil|no)$/i.test(a.medications.trim());
    medications.push({ key: "medications", label: "Regular medications", value: none ? "None" : a.medications.trim(), flag: !none, note: none ? undefined : "Check names and doses" });
  }

  const family: ToldItem[] = [];
  if (typeof a.famCvd === "boolean") family.push({ key: "famCvd", label: "Heart attack or stroke in a parent, brother or sister under 60", value: a.famCvd ? "Yes" : "No", flag: a.famCvd === true });
  if (typeof a.famHistoryBowel === "boolean") family.push({ key: "famBowel", label: "Bowel cancer in a parent, brother or sister", value: a.famHistoryBowel ? "Yes" : "No", flag: a.famHistoryBowel === true });
  if (sex === "male" && typeof a.prostateFamilyHistory === "boolean") family.push({ key: "famProstate", label: "Prostate cancer in father or brother under 60", value: a.prostateFamilyHistory ? "Yes" : "No", flag: a.prostateFamilyHistory === true });

  const symptoms: ToldItem[] = [];
  const sym: Array<[string, string]> = [
    ["bloodInStool", "Blood in stool recently"], ["bowelHabitChange", "Change in bowel habit over a month"],
    ["testicularLumpsNow", "Lumps in testicles now"], ["breastLumpsNow", "Lumps in breasts now"],
    ["prostateWeakStream", "Weak urine stream"], ["prostateNocturia", "Up more than 3 times a night to pass urine"], ["prostateDoubleVoid", "Needs to go again straight after"],
  ];
  sym.filter(([k]) => yes(k)).forEach(([k, l]) => symptoms.push({ key: k, label: l, value: "Yes", flag: true, note: "Ask about this today" }));
  if (!symptoms.length && sym.some(([k]) => typeof a[k] === "boolean")) symptoms.push({ key: "none", label: "Symptoms to ask about", value: "None reported", flag: false });

  return ([
    { key: "lifestyle", title: "Lifestyle", items: lifestyle },
    { key: "history", title: "Medical history", items: history },
    { key: "medications", title: "Medications", items: medications },
    { key: "family", title: "Family history", items: family },
    { key: "symptoms", title: "To ask about today", items: symptoms },
  ] as ToldGroup[]).filter((g) => g.items.length);
}

export const toldUsFlagCount = (groups: ToldGroup[]) => groups.reduce((n, g) => n + g.items.filter((i) => i.flag).length, 0);
