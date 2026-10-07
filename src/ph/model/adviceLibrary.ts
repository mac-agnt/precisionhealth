/* Advice library: the clinicians' cheat codes that expand to approved advice wording (RECORDING.md
   section 5). Each snippet has a short code (CHOL-HI), a title, the approved wording in Neil's voice,
   the analyte or measurement conditions it is suggested for, an owner and a version history. Only an
   approved version can be inserted. A draft change keeps the approved version in use until a clinical
   reviewer approves it.

   This file holds the types, the seeded library and pure helpers (lookup, condition text, trace).
   Matching against an episode and the action handlers live with the Results screens
   (pages/Results/libraryModel.ts and libraryActions.ts). Kept small: the reducer deep-clones state
   per action. Wording is sample content written for the demo, practical and GP-follow-up in tone,
   never diagnostic. */
import type { AnalyteCode, Band, Id, StaffId } from "./types";
import type { Iso } from "./time";
import { ANALYTES } from "./constants";

export type SnippetGroup = "Blood pressure" | "Cholesterol" | "Blood sugar" | "Weight and waist" | "Kidney" | "Lungs" | "Lifestyle" | "Heart" | "Cancer screening" | "Follow-up";

/** When a snippet is suggested for an episode. A snippet matches when any one of its conditions holds. */
export type SnippetCondition =
  | { kind: "analyte"; code: AnalyteCode; bands: Band[] }
  /** Measurement band words as printed on the report (bp MILD, bmi OVERWEIGHT) or bands (waist, ECG). */
  | { kind: "measure"; key: "bp" | "bmi" | "waist" | "ecg"; words?: string[]; bands?: Band[] }
  | { kind: "smoker" }
  /** Weekly units from the lifestyle questionnaire above the HSE low-risk limit (11 women, 17 men). */
  | { kind: "alcohol" }
  | { kind: "any_flag" }
  | { kind: "no_flags" }
  /** Never suggested automatically: inserted by code only. */
  | { kind: "manual" };

export type SnippetVersionStatus = "approved" | "draft" | "superseded" | "retired";
export interface SnippetVersion {
  version: number;
  text: string;
  status: SnippetVersionStatus;
  /** Why this version exists. */
  note: string;
  editedBy: StaffId;
  editedAt: Iso;
  approvedBy: StaffId | null;
  approvedAt: Iso | null;
}

export interface AdviceSnippet {
  code: string;
  title: string;
  group: SnippetGroup;
  /** Position in a prepared draft: findings, lifestyle, normal confirmations, then the closing line. */
  order: number;
  conditions: SnippetCondition[];
  ownerId: StaffId;
  versions: SnippetVersion[];
  retired: null | { at: Iso; by: StaffId; reason: string };
}

/** One insertion of a snippet into an episode's advice, for traceability. */
export interface SnippetUse {
  episodeId: Id;
  code: string;
  version: number;
  via: "code" | "slash" | "suggested" | "library" | "prepared";
  at: Iso;
  by: StaffId;
}

/** A draft prepared from approved snippets. Never released on its own: the clinician reviews it. */
export interface PreparedDraft {
  episodeId: Id;
  /** The report version the draft was written into, so a later correction does not inherit the marker. */
  reportVersionId: Id;
  at: Iso;
  by: StaffId;
  opening: string;
  codes: Array<{ code: string; version: number }>;
}

export type ReporterId = Extract<StaffId, "neil" | "liz">;

export interface AdviceLibraryState {
  version: 1;
  snippets: AdviceSnippet[];
  uses: SnippetUse[];
  prepared: Record<Id, PreparedDraft>;
  /** Reporter assignment per episode in the review queue. Episodes not listed use the review assignee. */
  reporters: Record<Id, ReporterId>;
}

/* ---- reporters (RECORDING.md section 5: views per reporter in Jotform Tables) ---- */
export const REPORTERS: Array<{ id: ReporterId; scope: string }> = [
  { id: "neil", scope: "All screen types. Releases every report as the clinical reviewer." },
  { id: "liz", scope: "POC screens, BP and spirometry, and sudden cardiac death risk screens." },
];
export const isReporterId = (v: unknown): v is ReporterId => v === "neil" || v === "liz";

/* ---- seed ---- */
const FEB = "2026-02-16T10:00:00.000Z";
const AUG = "2026-08-18T09:30:00.000Z";
const OCT = "2026-10-01T16:10:00.000Z";
const OCT2 = "2026-10-02T15:40:00.000Z";

const v = (version: number, text: string, status: SnippetVersionStatus, at: Iso, note = "First approved version."): SnippetVersion => ({
  version, text, status, note, editedBy: "neil", editedAt: at, approvedBy: status === "draft" ? null : "neil", approvedAt: status === "draft" ? null : at,
});
const lab = (code: AnalyteCode, bands: Band[] = ["borderline", "abnormal"]): SnippetCondition => ({ kind: "analyte", code, bands });
const sn = (code: string, title: string, group: SnippetGroup, order: number, conditions: SnippetCondition[], versions: SnippetVersion[], retired: AdviceSnippet["retired"] = null): AdviceSnippet => ({
  code, title, group, order, conditions, ownerId: "neil", versions, retired,
});

export function initialAdviceLibraryState(): AdviceLibraryState {
  return {
    version: 1,
    snippets: [
      sn("BP-RAISED", "Blood pressure raised", "Blood pressure", 10, [{ kind: "measure", key: "bp", words: ["RAISED", "SIGNIFICANTLY RAISED"] }], [
        v(1, "Your blood pressure was raised on the day. One reading is not a diagnosis, so it needs to be rechecked over several readings within the next month. In the meantime, reduce salt, stay active and keep alcohol within the low-risk limits.", "approved", FEB),
      ]),
      sn("BP-MILD", "Blood pressure mildly above ideal", "Blood pressure", 11, [{ kind: "measure", key: "bp", words: ["MILD"] }], [
        v(1, "Your blood pressure was mildly above the ideal level of 120/80. Cut back on salt, stay active and keep alcohol within the low-risk limits, and have it rechecked by your GP or pharmacist within the next year.", "approved", FEB),
      ]),
      sn("CHOL-HI", "Total cholesterol above target", "Cholesterol", 20, [lab("TC")], [
        v(1, "Your cholesterol is raised. Reduce saturated fat and increase physical activity. See your GP for a repeat test.", "superseded", FEB),
        v(2, "Your total cholesterol is above the recommended level of 5.0 mmol/L. Reduce saturated fat such as fatty meat, butter, cream and pastries, choose oily fish twice a week and add fibre from oats, beans, fruit and vegetables. Regular physical activity also helps. Discuss a repeat test with your GP.", "approved", AUG, "Added practical food examples and the target from the participant report."),
      ]),
      sn("LDL-BORD", "LDL cholesterol above target", "Cholesterol", 21, [lab("LDL")], [
        v(1, "Your LDL cholesterol, the type that can build up in artery walls, is above the target of 3.0 mmol/L. Less saturated fat, more fibre and regular activity all help. Your GP can look at this alongside your overall heart risk.", "approved", FEB),
      ]),
      sn("HDL-LOW", "Protective HDL cholesterol low", "Cholesterol", 22, [lab("HDL")], [
        v(1, "Your protective HDL cholesterol is low. Regular physical activity is the best way to raise it, along with stopping smoking if you smoke and keeping alcohol within the low-risk limits.", "approved", FEB),
      ]),
      sn("TG-HI", "Triglycerides raised", "Cholesterol", 23, [lab("TG")], [
        v(1, "Your triglycerides are raised. Cut back on sugary foods and alcohol and keep active.", "superseded", FEB),
        v(2, "Your triglycerides are raised. The sample was not fasting, which can push this result up, so treat it as a guide. Cut back on sugary foods and drinks, white bread and alcohol, and keep active. Your GP can arrange a fasting repeat if needed.", "approved", AUG, "Explains non-fasting samples. Replaces TG-FAST."),
      ]),
      sn("TG-FAST", "Repeat triglycerides fasting", "Cholesterol", 24, [lab("TG")], [
        v(1, "Please repeat your triglycerides after fasting for 12 hours, then discuss the result with your GP.", "retired", FEB),
      ], { at: AUG, by: "neil", reason: "Replaced by TG-HI v2, which explains non-fasting samples." }),
      sn("HBA1C-RISK", "HbA1c above the normal range", "Blood sugar", 30, [lab("HBA1C")], [
        v(1, "Your HbA1c, a measure of your average blood sugar over the past two to three months, is above the normal range. Reducing sugary foods and drinks, gradual weight reduction and regular activity all lower the risk of type 2 diabetes. Your GP can advise whether to repeat the test.", "approved", FEB),
      ]),
      sn("BMI-OVER", "BMI above the healthy range", "Weight and waist", 40, [{ kind: "measure", key: "bmi", words: ["OVERWEIGHT", "OBESE"] }], [
        v(1, "Your BMI is above the healthy range of 18 to 25. Aim for gradual weight reduction through smaller portions, fewer sugary foods and drinks and regular activity. BMI does not account for muscle, so your GP can put this in context.", "approved", FEB),
      ]),
      sn("WAIST-HI", "Waist above the recommended level", "Weight and waist", 41, [{ kind: "measure", key: "waist", bands: ["borderline", "abnormal"] }], [
        v(1, "Your waist measurement is above the recommended level. Weight carried around the middle is linked with a higher risk of heart disease and type 2 diabetes, so regular activity and gradual weight reduction are worthwhile.", "approved", FEB),
      ]),
      sn("UREA-HI", "Urea raised", "Kidney", 50, [lab("UREA")], [
        v(1, "Your urea is above the normal range. This is often related to how much you had to drink on the day. Maintain normal hydration and ask your GP to recheck your kidney tests at your next visit.", "approved", FEB),
      ]),
      sn("PEFR-RED", "Peak flow reduced", "Lungs", 55, [{ kind: "manual" }], [
        v(1, "Your peak flow was lower than expected on the day. This test depends on technique and can be affected by a recent cold. Discuss it with your GP, particularly if you have a cough, wheeze or breathlessness.", "draft", OCT2, "Requested for BP and spirometry screens reported by Liz Bawle. Awaiting clinical approval."),
      ]),
      sn("SMOKE", "Current smoker", "Lifestyle", 60, [{ kind: "smoker" }], [
        v(1, "Stopping smoking is the single best thing you can do for your heart and lungs. Free support is available from the HSE QUIT service at quit.ie, and your GP or pharmacist can advise on stop smoking medicines.", "approved", FEB),
      ]),
      sn("ALC-HIGH", "Alcohol above the low-risk limit", "Lifestyle", 61, [{ kind: "alcohol" }], [
        v(1, "Your reported alcohol intake is above the low-risk weekly limit of 11 standard drinks for women and 17 for men. Cutting back helps blood pressure, weight and sleep. drinkaware.ie has practical tips.", "approved", FEB),
        v(2, "Your reported alcohol intake is above the low-risk weekly limit of 11 standard drinks for women and 17 for men, spread over the week with at least two alcohol-free days. Cutting back helps blood pressure, weight, mood and sleep. drinkaware.ie has practical tips.", "draft", OCT, "Adds the HSE advice on spreading drinks across the week."),
      ]),
      sn("ECG-NORM", "ECG normal", "Heart", 70, [{ kind: "measure", key: "ecg", bands: ["normal"] }], [
        v(1, "Your ECG, a tracing of your heart rhythm, was normal on the day.", "approved", FEB),
      ]),
      sn("FIT-NEG", "Bowel screening test (FIT) negative", "Cancer screening", 80, [lab("FIT", ["normal"])], [
        v(1, "Your bowel screening test (FIT) was negative. Tell your GP about any blood in your stool or a change in bowel habit lasting more than a month, even with a negative result.", "approved", FEB),
      ]),
      sn("PSA-NORM", "PSA within the range for age", "Cancer screening", 81, [lab("PSA", ["normal"])], [
        v(1, "Your PSA is within the normal range for your age. See your GP if you notice urinary symptoms such as a weak stream or getting up at night to pass urine more often.", "approved", FEB),
      ]),
      sn("GP-REVIEW", "Arrange a GP review", "Follow-up", 90, [{ kind: "any_flag" }], [
        v(1, "Please arrange a GP review to agree follow-up, and bring this report with you.", "approved", FEB),
      ]),
      sn("ROUTINE-ALL-NORMAL", "All results normal", "Follow-up", 91, [{ kind: "no_flags" }], [
        v(1, "Your results are within the normal ranges shown in this report. Keep up regular physical activity, a balanced diet and normal hydration. Screening is a snapshot of one day, so see your GP about any new symptoms.", "approved", FEB),
      ]),
    ],
    uses: [],
    prepared: {},
    reporters: { "PH-E-1144": "liz", "PH-E-1176": "liz", "PH-E-1194": "liz" },
  };
}

/* ---- pure helpers ---- */
export type SnippetStatus = "approved" | "draft" | "retired";
export const SNIPPET_STATUS_LABEL: Record<SnippetStatus, string> = { approved: "Approved", draft: "Draft", retired: "Retired" };

export function snippetStatus(s: AdviceSnippet): SnippetStatus {
  if (s.retired) return "retired";
  return s.versions.some((x) => x.status === "approved") ? "approved" : "draft";
}
/** The version that can be inserted, or null when the snippet is retired or has never been approved. */
export function approvedVersion(s: AdviceSnippet): SnippetVersion | null {
  if (s.retired) return null;
  return s.versions.find((x) => x.status === "approved") || null;
}
/** A change waiting for approval. */
export const pendingDraft = (s: AdviceSnippet): SnippetVersion | null => s.versions.find((x) => x.status === "draft") || null;
/** The newest version that was ever approved, approved or not still in use. */
export function lastApproved(s: AdviceSnippet): SnippetVersion | null {
  const a = s.versions.filter((x) => x.approvedAt);
  return a.length ? a[a.length - 1] : null;
}
/** Exact code lookup. Codes are stored in capitals; the lookup ignores case. */
export function findSnippet(lib: AdviceLibraryState, code: string): AdviceSnippet | null {
  const k = code.trim().toUpperCase();
  return lib.snippets.find((s) => s.code === k) || null;
}
export const sortedSnippets = (lib: AdviceLibraryState): AdviceSnippet[] => lib.snippets.slice().sort((a, b) => a.order - b.order);

const BAND_WORD: Record<Band, string> = { normal: "normal", borderline: "borderline", abnormal: "abnormal", not_tested: "not tested" };
const MEASURE_LABEL = { bp: "Blood pressure", bmi: "BMI", waist: "Waist", ecg: "ECG" } as const;
/** A condition in plain words, for the library and the suggestion tooltip. */
export function conditionText(c: SnippetCondition): string {
  switch (c.kind) {
    case "analyte": return `${ANALYTES[c.code].name} ${c.bands.map((b) => BAND_WORD[b]).join(" or ")}`;
    case "measure": return `${MEASURE_LABEL[c.key]} ${c.words ? c.words.map((w) => w.toLowerCase()).join(" or ") : (c.bands || []).map((b) => BAND_WORD[b]).join(" or ")}`;
    case "smoker": return "Current smoker on the nurse form";
    case "alcohol": return "Alcohol above the low-risk weekly limit (questionnaire)";
    case "any_flag": return "Any finding needs individual review";
    case "no_flags": return "No findings flagged and every expected result in";
    case "manual": return "Not suggested automatically. Insert by code";
  }
}

/** The approved wording found in an advice text, with the version each one came from. */
export interface SnippetTrace { code: string; title: string; version: number; current: boolean }
export type AdviceSourceKind = "approved_snippets" | "mixed" | "manual" | "empty";
export const ADVICE_SOURCE_LABEL: Record<AdviceSourceKind, string> = {
  approved_snippets: "Approved snippets",
  mixed: "Approved snippets and manual text",
  manual: "Manual",
  empty: "No advice yet",
};
const residue = (t: string) => t.replace(/[\s.,;:()]+/g, "");
/**
 * Which approved snippet versions appear word for word in the advice, and whether anything else
 * was typed. Generated lines (the personalised opening of a prepared draft) do not count as manual.
 * Pure: the same text always gives the same answer, so released versions can be traced later.
 */
export function adviceTrace(lib: AdviceLibraryState, text: string, generated: string[] = []): { source: AdviceSourceKind; items: SnippetTrace[] } {
  if (!text.trim()) return { source: "empty", items: [] };
  const cands: Array<{ s: AdviceSnippet; ver: SnippetVersion }> = [];
  for (const s of lib.snippets) for (const ver of s.versions) if (ver.approvedAt && ver.text) cands.push({ s, ver });
  cands.sort((a, b) => b.ver.text.length - a.ver.text.length);
  let rest = text;
  const items: SnippetTrace[] = [];
  for (const { s, ver } of cands) {
    if (!rest.includes(ver.text)) continue;
    rest = rest.split(ver.text).join(" ");
    const cur = approvedVersion(s);
    items.push({ code: s.code, title: s.title, version: ver.version, current: !!cur && cur.version === ver.version });
  }
  for (const g of generated) if (g) rest = rest.split(g).join(" ");
  items.sort((a, b) => (lib.snippets.find((s) => s.code === a.code)?.order ?? 0) - (lib.snippets.find((s) => s.code === b.code)?.order ?? 0));
  if (!items.length) return { source: "manual", items };
  return { source: residue(rest) ? "mixed" : "approved_snippets", items };
}
