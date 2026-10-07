/* Participant report and clinician viewer selectors. reportDocument returns the whole participant
   report, fully derived, for both the portal and the clinician preview. A test that is pending,
   not done, declined or not applicable says so: it is never shown as normal. Bands and flag words
   follow the illustrative rule set v0.1 (RULE_SET_LABEL), clinician-owned. */
import type { AnalyteCode, AnalyteGroup, Band, ClinicalCapture, Episode, Id, Observation, Person, PhState, ProgrammeId, ReportVersion } from "../types";
import {
  ANALYTES, BP_SIGNIFICANCE, BMI_RANGE_TEXT, COMPREHENSIVE_PANEL, PROGRAMME_BY_ID, RULE_SET_LABEL, WAIST_RANGE_TEXT, bandDetail, bmiCategory, bpCategory, formatResult,
  rangeTextFor, relativeRiskBand, reportFlagWord, waistCategory,
} from "../constants";
import type { BandCtx, ReportFlagWord } from "../constants";
import { NURSE_FORM_SECTIONS, ecgBand, nurseFieldValue, nurseFieldVisible, nurseSectionVisible, urineBand } from "../capture";
import type { NurseSectionKey } from "../capture";
import { bandCtxFor, bmiFromCapture } from "../interpret";
import { answerSummary, lifestyleRows } from "../questionnaire";
import type { AnswerSummary, Answers } from "../questionnaire";
import {
  ADVICE_SIGNATURE, EMPLOYER_SUPPORT, LIFESTYLE_INTRO, LIFESTYLE_SUPPORT, NOT_A_DIAGNOSIS, REPORT_INTRO, REPORT_SECTIONS, REPORT_TITLE,
} from "../reportContent";
import type { ReportSectionContent, ReportSectionKey, SupportLink } from "../reportContent";
import { ageOn, fmtDateLong, localDateOf } from "../time";
import type { Iso } from "../time";
import { canViewEpisodeClinical, ix, memo, membershipOf, persona } from "./core";
import { QRISK3_SOURCE_NOTE, currentReleased, draftVersion, latestObservations, versionObservations, versionsOf } from "./clinical";

/* ---- shared ---- */
export type ReportRowStatus = "resulted" | "pending" | "not_done" | "declined" | "not_applicable";
const ctxFor = (state: PhState, ep: Episode): BandCtx => bandCtxFor(ix(state).personById.get(ep.personId)!, ep.collectedAt);
const answersFor = (state: PhState, ep: Pick<Episode, "personId" | "programmeId">): Answers => (membershipOf(state, ep.personId, ep.programmeId)?.answers || {}) as Answers;

/** Who may see an episode's report or viewer: clinical staff for the episode, or the participant for their own released versions. */
function reportVisible(state: PhState, ep: Episode, v: ReportVersion | null): boolean {
  const p = persona(state);
  if (p.isParticipant) return ep.personId === state.session.portalPersonId && !!v && (v.status === "released" || v.status === "superseded");
  return canViewEpisodeClinical(state, ep.id);
}

/* ---- clinician viewer: the whole laboratory panel ---- */
export interface PanelResult {
  code: AnalyteCode;
  group: AnalyteGroup;
  name: string;
  reportName: string;
  unit: string;
  /** "calculated" for non-HDL and the ratio when both inputs are in. */
  status: "received" | "calculated" | "pending" | "quarantined" | "unit_unconfirmed" | "not_applicable";
  observation: Observation | null;
  resultText: string;
  band: Band;
  flagWord: ReportFlagWord | "";
  limitText: string;
  rangeText: string;
  illustrativeRange: boolean;
}
/**
 * Every Comprehensive panel test for an episode (plus PSA and FIT when on its panel), in report
 * order, with status, band and flag word. Null when the current role may not see the episode.
 */
export function panelResults(state: PhState, episodeId: Id): PanelResult[] | null {
  return memo(state, "pr:" + episodeId, () => {
    const ep = ix(state).episodeById.get(episodeId);
    if (!ep || !canViewEpisodeClinical(state, episodeId) || persona(state).isParticipant) return null;
    return panelRows(state, ep, latestObservations(state, ep.id));
  });
}
function panelRows(state: PhState, ep: Episode, obs: Observation[]): PanelResult[] {
  const ctx = ctxFor(state, ep);
  const by = new Map(obs.map((o) => [o.code, o]));
  const expected = new Set(ep.expectedTests.map((t) => t.code));
  const held = ep.hold?.rowId ? state.importRows.find((r) => r.id === ep.hold!.rowId) : undefined;
  const noBloods = ep.capture.form?.bloodsTaken === "No";
  const order: AnalyteCode[] = ["TC", "HDL", "LDL", "NONHDL", "TG", "TCHDL", ...COMPREHENSIVE_PANEL.filter((c) => !["TC", "HDL", "LDL", "TG"].includes(c)), "PSA", "FIT"];
  return order.filter((code) => !ANALYTES[code].conditional || expected.has(code)).map((code) => {
    const a = ANALYTES[code];
    const o = by.get(code) || null;
    const base = { code, group: a.group, name: a.name, reportName: a.reportName, unit: a.unit, limitText: o ? o.limitText : "", rangeText: rangeTextFor(code, ctx), illustrativeRange: a.illustrativeRange };
    const onPanel = a.calculated ? a.calculated.from.every((c) => expected.has(c)) : expected.has(code);
    if (!onPanel) return { ...base, status: "not_applicable" as const, observation: null, resultText: noBloods && code !== "FIT" ? "Bloods not taken" : "Not on this panel", band: "not_tested" as Band, flagWord: "" as const };
    if (!o) {
      const q = !!held && held.state === "quarantined" && (held.analyteCode === code || (!!a.calculated && a.calculated.from.includes(held.analyteCode)));
      return { ...base, status: q ? "quarantined" as const : "pending" as const, observation: null, resultText: q ? "Laboratory row held for identity check" : "Awaiting result", band: "not_tested" as Band, flagWord: "" as const };
    }
    if (o.unitDiscrepancy && !o.unitDiscrepancy.confirmed) {
      return { ...base, status: "unit_unconfirmed" as const, observation: o, resultText: `${o.value} ${o.unit} as received, unit not yet confirmed`, band: "not_tested" as Band, flagWord: "" as const };
    }
    const dir = bandDetail(code, o.value, ctx).direction;
    return { ...base, status: o.source.kind === "calc" ? "calculated" as const : "received" as const, observation: o, resultText: formatResult(code, o.value, o.valueText), band: o.band, flagWord: reportFlagWord(code, o.band, dir) };
  });
}

/* ---- answers ---- */
/** Lifestyle questionnaire answers as [question, answer] rows for the report. Empty when the role may not see them. */
export function lifestyleAnswersForReport(state: PhState, personId: Id, programmeId?: ProgrammeId): Array<{ key: string; question: string; answer: string; answered: boolean }> {
  const p = persona(state);
  if (p.isParticipant ? personId !== state.session.portalPersonId : !p.perms.has("clinical.view")) return [];
  const person = ix(state).personById.get(personId);
  const m = membershipOf(state, personId, programmeId);
  if (!person || !m) return [];
  const eps = (ix(state).episodesByPerson.get(personId) || []).filter((e) => e.programmeId === m.programmeId);
  const on = eps.length ? localDateOf(eps[eps.length - 1].collectedAt) : localDateOf(state.clock.nowUtc);
  const age = ageOn(person.dob, on);
  return lifestyleRows(m.answers as Answers, { sex: person.sex, age, employer: PROGRAMME_BY_ID[m.programmeId].clientName });
}

/** What the clinician viewer shows beside the results. The nurse form wins over the questionnaire where both exist. */
export interface RiskFactorSummary extends AnswerSummary { source: "nurse_form" | "questionnaire" | "none"; muscularPhysique: boolean | null; bloodsTaken: boolean | null }
export function riskFactorSummary(state: PhState, episodeId: Id): RiskFactorSummary | null {
  const ep = ix(state).episodeById.get(episodeId);
  if (!ep || !canViewEpisodeClinical(state, episodeId) || persona(state).isParticipant) return null;
  return summaryFor(ep.capture, answersFor(state, ep));
}
function summaryFor(c: ClinicalCapture, a: Answers): RiskFactorSummary {
  const s = answerSummary(a);
  const f = c.form || {};
  const hasForm = Object.keys(f).length > 0;
  const bool = (k: string, fallback: boolean | null) => (typeof f[k] === "boolean" ? (f[k] as boolean) : fallback);
  const t1 = bool("diabetesType1", null), t2 = bool("diabetesType2", null);
  return {
    smoker: typeof f.smoking === "string" ? f.smoking : s.smoker,
    familyHistoryCvd: bool("famHistoryCvd", s.familyHistoryCvd),
    diabetes: t1 ? "Type 1" : t2 ? "Type 2" : t1 === false && t2 === false ? "No" : s.diabetes,
    hypertensionTreatment: bool("treatedHypertension", s.hypertensionTreatment),
    alcoholUnitsPerWeek: s.alcoholUnitsPerWeek,
    medications: typeof f.medications === "string" && f.medications ? f.medications : s.medications,
    highBpHistory: typeof f.highBpHistory === "string" ? f.highBpHistory : s.highBpHistory,
    muscularPhysique: f.muscularPhysique === "Yes" ? true : f.muscularPhysique === "No" ? false : null,
    bloodsTaken: f.bloodsTaken === "Yes" ? true : f.bloodsTaken === "No" ? false : null,
    source: hasForm ? "nurse_form" : Object.keys(a).length ? "questionnaire" : "none",
  };
}

/** The nurse form for read-only display: visible sections and fields with their values as text. */
export interface NurseFormRow { section: NurseSectionKey; sectionTitle: string; key: string; label: string; value: string; answered: boolean; prefillFrom: "booking" | "questionnaire" | null }
export function nurseFormRows(state: PhState, episodeId: Id): NurseFormRow[] | null {
  const ep = ix(state).episodeById.get(episodeId);
  if (!ep || !canViewEpisodeClinical(state, episodeId) || persona(state).isParticipant) return null;
  const person = ix(state).personById.get(ep.personId)!;
  const booking = ix(state).bookingById.get(ep.bookingId);
  const ctx = ctxFor(state, ep);
  const out: NurseFormRow[] = [];
  for (const s of NURSE_FORM_SECTIONS) {
    if (!nurseSectionVisible(s, ep.capture, ctx)) continue;
    for (const f of s.fields) {
      if (!nurseFieldVisible(f, ep.capture, ctx)) continue;
      let value: string;
      if (f.store === "record") value = recordValue(person, booking ? booking.slotStart : "", ep.collectedAt, f.recordKey!);
      else if (f.store === "calc") { const b = bmiFromCapture(ep.capture); value = b == null ? "" : b.toFixed(1); }
      else if (f.store === "measure") { const m = ep.capture.measures[f.measureKey!]; value = m.state === "recorded" && m.value != null ? `${m.value} ${f.unit || ""}`.trim() : m.state === "not_done" ? "Not done" : m.state === "declined" ? "Declined" : ""; }
      else { const v = nurseFieldValue(ep.capture, f); value = v === null ? "" : typeof v === "boolean" ? (v ? "TRUE" : "FALSE") : String(v); }
      out.push({ section: s.key, sectionTitle: s.title, key: f.key, label: f.label, value: value || "Not recorded", answered: !!value, prefillFrom: f.prefillFrom });
    }
  }
  return out;
}
function recordValue(p: Person, slot: string, collectedAt: Iso, k: NonNullable<(typeof NURSE_FORM_SECTIONS)[number]["fields"][number]["recordKey"]>): string {
  switch (k) {
    case "appointment": return `${fmtDateLong(collectedAt)}${slot ? `, ${slot}` : ""}`;
    case "given": return p.given;
    case "family": return p.family;
    case "email": return p.email;
    case "phone": return p.phone;
    case "dob": return fmtDateLong(p.dob);
  }
}

/* ---- the participant report ---- */
export interface ReportRow {
  key: string;
  test: string;
  resultText: string;
  unit: string;
  rangeText: string;
  flagWord: ReportFlagWord | "";
  band: Band;
  status: ReportRowStatus;
  code?: AnalyteCode;
}
export interface ReportSection {
  key: ReportSectionKey;
  title: string;
  content: ReportSectionContent;
  rows: ReportRow[];
  /** Questions and answers shown on the cancer pages. */
  questions: Array<{ question: string; answer: string }>;
  /** The blood pressure significance table. */
  table: Array<{ reading: string; significance: string }> | null;
  note: string | null;
}
export interface ReportDocument {
  episodeId: Id;
  versionId: Id | null;
  version: number | null;
  /** "preview" when no version exists yet (clinician preview before the first draft). */
  versionStatus: ReportVersion["status"] | "preview";
  header: {
    title: string; name: string; dob: string; dobText: string; appointmentDate: Iso; appointmentText: string;
    programme: string; employer: string; screeningRef: string; version: number | null; clinician: string | null; releasedAt: Iso | null; releasedText: string | null;
  };
  intro: string[];
  advice: { text: string; written: boolean; signature: string };
  lifestyle: { intro: string[]; support: SupportLink[]; rows: Array<{ key: string; question: string; answer: string; answered: boolean }> };
  sections: ReportSection[];
  ruleSet: string;
  notADiagnosis: string;
}

const row = (key: string, test: string, resultText: string, unit: string, rangeText: string, status: ReportRowStatus, band: Band = "not_tested", flagWord: ReportFlagWord | "" = "", code?: AnalyteCode): ReportRow =>
  ({ key, test, resultText, unit, rangeText, flagWord, band, status, code });
const PENDING_TEXT: Record<Exclude<ReportRowStatus, "resulted">, string> = { pending: "Awaiting result", not_done: "Not done", declined: "Declined", not_applicable: "Not applicable" };

/**
 * The participant report for one episode and version, fully derived: header, advice, lifestyle
 * answers and the applicable sections in the sample report's order, each with its rows. Without
 * versionId it is the draft under review, else the current released version, else a preview of
 * the latest results. Participants get only their own released or superseded versions. Null when
 * the current role may not see it.
 */
export function reportDocument(state: PhState, episodeId: Id, versionId?: Id): ReportDocument | null {
  return memo(state, `rd:${episodeId}:${versionId || ""}`, () => {
    const I = ix(state);
    const ep = I.episodeById.get(episodeId);
    if (!ep) return null;
    const p = persona(state);
    const versions = versionsOf(state, episodeId);
    const v = versionId ? versions.find((x) => x.id === versionId) || null : p.isParticipant ? currentReleased(state, episodeId) : draftVersion(state, episodeId) || currentReleased(state, episodeId);
    if (versionId && !v) return null;
    if (!reportVisible(state, ep, v)) return null;
    const person = I.personById.get(ep.personId)!;
    const programme = PROGRAMME_BY_ID[ep.programmeId];
    const ctx = ctxFor(state, ep);
    const frozen = v && (v.status === "released" || v.status === "superseded");
    const obs = frozen ? versionObservations(state, v!) : latestObservations(state, episodeId);
    const panel = new Map(panelRows(state, ep, obs).map((r) => [r.code, r]));
    const lab = (code: AnalyteCode): ReportRow => {
      const r = panel.get(code);
      const a = ANALYTES[code];
      if (!r || r.status === "not_applicable") {
        // Bloods not taken at the appointment: the blood tests are not done, not "not applicable".
        if (ep.capture.form?.bloodsTaken === "No" && code !== "FIT") return row(code, a.reportName, "Not done (no blood sample taken)", a.unit, rangeTextFor(code, ctx), "not_done", "not_tested", "", code);
        return row(code, a.reportName, PENDING_TEXT.not_applicable, a.unit, rangeTextFor(code, ctx), "not_applicable", "not_tested", "", code);
      }
      if (r.status === "pending" || r.status === "quarantined" || r.status === "unit_unconfirmed") return row(code, a.reportName, PENDING_TEXT.pending, a.unit, r.rangeText, "pending", "not_tested", "", code);
      return row(code, a.reportName, r.resultText, a.unit, r.rangeText, "resulted", r.band, r.flagWord, code);
    };
    const c = ep.capture;
    const m = c.measures;
    const measured = (k: keyof ClinicalCapture["measures"]) => (m[k].state === "recorded" && m[k].value != null ? (m[k].value as number) : null);
    const measureStatus = (k: keyof ClinicalCapture["measures"]): ReportRowStatus => (m[k].state === "declined" ? "declined" : "not_done");
    const sys = measured("bpSys"), dia = measured("bpDia");
    const bp = bpCategory(sys, dia);
    const bpRow = sys != null && dia != null ? row("bp", "Blood Pressure", `${sys}/${dia}`, "mmHg", "less than 120/80", "resulted", bp.band, bp.word) : row("bp", "Blood Pressure", PENDING_TEXT[measureStatus("bpSys")], "mmHg", "less than 120/80", measureStatus("bpSys"));
    const bmi = bmiFromCapture(c);
    const bmiC = bmiCategory(bmi);
    const bmiRow = bmi != null ? row("bmi", "BMI", bmi.toFixed(1), "n/a", BMI_RANGE_TEXT, "resulted", bmiC.band, bmiC.word) : row("bmi", "BMI", "Not calculated", "n/a", BMI_RANGE_TEXT, "not_done");
    const sections: ReportSection[] = [];
    const add = (key: ReportSectionKey, rows: ReportRow[], extra: Partial<Pick<ReportSection, "questions" | "table" | "note">> = {}) =>
      sections.push({ key, title: REPORT_SECTIONS[key].title, content: REPORT_SECTIONS[key], rows, questions: extra.questions || [], table: extra.table || null, note: extra.note || null });

    add("cholesterol", (["TC", "HDL", "LDL", "NONHDL", "TG"] as AnalyteCode[]).map(lab));
    add("blood_pressure", [bpRow], { table: BP_SIGNIFICANCE.map((x) => ({ reading: x.reading, significance: x.significance })) });

    // Cardiovascular risk: the QRISK3 inputs and the licensed engine's sample outputs.
    const sum = summaryFor(c, answersFor(state, ep));
    const q = ep.qrisk;
    const qStatus: ReportRowStatus = !q ? "pending" : !q.eligible ? "not_applicable" : q.score10y == null ? "pending" : "resulted";
    const qText = (val: string) => (qStatus === "resulted" ? val : q?.reason || PENDING_TEXT[qStatus as Exclude<ReportRowStatus, "resulted">]);
    const rr = q?.relativeRisk ?? null;
    const rrBand = relativeRiskBand(rr);
    const heartBand: Band = q?.heartAge == null ? "not_tested" : q.heartAge < ctx.age ? "normal" : rrBand;
    const tcHdl = lab("TCHDL");
    add("cardiovascular_risk", [
      { ...bpRow, key: "cv_bp" },
      sum.smoker ? row("cv_smoking", "Smoking", sum.smoker, "", "n/a", "resulted") : row("cv_smoking", "Smoking", "Not recorded", "", "n/a", "not_done"),
      { ...bmiRow, key: "cv_bmi" },
      { ...tcHdl, test: "Total:HDL Cholesterol", key: "cv_tchdl" },
      sum.familyHistoryCvd === null ? row("cv_family", "Family History", "Not recorded", "", "n/a", "not_done") : row("cv_family", "Family History", sum.familyHistoryCvd ? "TRUE" : "FALSE", "", "n/a", "resulted"),
      row("cv_score", "10-year risk", qText(q?.score10y != null ? `${q.score10y.toFixed(2)}%` : ""), "", "n/a", qStatus),
      row("cv_heart_age", "Heart Age", qText(q?.heartAge != null ? String(q.heartAge) : ""), "years", "Less than your real age", qStatus, qStatus === "resulted" ? heartBand : "not_tested"),
      row("cv_rr", "Relative risk", qText(rr != null ? rr.toFixed(1) : ""), "", "less than 1.0", qStatus, qStatus === "resulted" ? rrBand : "not_tested", qStatus === "resulted" ? (rrBand === "normal" ? "NORMAL" : rrBand === "borderline" ? "BORDERLINE" : "RAISED") : ""),
    ], { note: QRISK3_SOURCE_NOTE });

    add("hba1c", [lab("HBA1C")]);
    const waist = measured("waistCm");
    const wc = waistCategory(waist, person.sex);
    const h = measured("heightM"), w = measured("weightKg");
    add("bmi", [
      bmiRow,
      h != null ? row("height", "Height", h.toFixed(2), "m", "n/a", "resulted") : row("height", "Height", PENDING_TEXT[measureStatus("heightM")], "m", "n/a", measureStatus("heightM")),
      w != null ? row("weight", "Weight", String(w), "kg", "n/a", "resulted") : row("weight", "Weight", PENDING_TEXT[measureStatus("weightKg")], "kg", "n/a", measureStatus("weightKg")),
      waist != null ? row("waist", "Waist Circumference", String(waist), "cm", WAIST_RANGE_TEXT, "resulted", wc.band, wc.word) : row("waist", "Waist Circumference", PENDING_TEXT[measureStatus("waistCm")], "cm", WAIST_RANGE_TEXT, measureStatus("waistCm")),
    ]);
    add("kidney", (["UREA", "CREAT", "URATE"] as AnalyteCode[]).map(lab));
    const urineDone = c.form?.urinalysis !== "Not done";
    add("urinalysis", ([["blood", "Urine Blood"], ["wcc", "Urine White Cells"], ["glucose", "Urine Glucose"], ["protein", "Urine Protein"]] as const).map(([k, label]) => {
      const val = c.urine ? c.urine[k] : undefined;
      if (!urineDone || !val || val === "Not done") return row(`urine_${k}`, label, urineDone && !val ? "Not recorded" : "Not done", "n/a", "Nil", "not_done");
      const b = urineBand(val, k);
      return row(`urine_${k}`, label, val, "n/a", "Nil", "resulted", b, b === "normal" ? "NORMAL" : b === "borderline" ? "BORDERLINE" : "RAISED");
    }));
    add("fbc", (["HB", "WCC", "PLT"] as AnalyteCode[]).map(lab));
    add("liver", (["BILI", "TPROT", "ALP", "GGT", "AST", "ALT"] as AnalyteCode[]).map(lab));
    const eb = ecgBand(c);
    const ecgRow = c.form?.ecg === "Done"
      ? row("ecg", "ECG", eb === "normal" ? "Normal ECG" : eb === "not_tested" ? "Not recorded" : "Reviewed by the doctor: see your advice", "n/a", "Normal ECG", eb === "not_tested" ? "not_done" : "resulted", eb, eb === "normal" ? "NORMAL" : eb === "borderline" ? "BORDERLINE" : eb === "abnormal" ? "ABNORMAL" : "")
      : row("ecg", "ECG", "Not done", "n/a", "Normal ECG", "not_done");
    add("ecg", [ecgRow]);
    add("thyroid", (["FT4", "TSH"] as AnalyteCode[]).map(lab));
    add("iron", (["IRON", "FERR", "TIBC"] as AnalyteCode[]).map(lab));
    add("vitamins_minerals", (["VITD", "B12", "FOLATE", "CA", "MG", "PO4"] as AnalyteCode[]).map(lab));

    // Cancer screening: questions and tests depend on age and sex.
    const a = answersFor(state, ep);
    const f = c.form || {};
    const yn = (v: unknown) => (v === true ? "Yes" : v === false ? "No" : typeof v === "string" && v ? v : "Not answered");
    add("cancer", []);
    const fit = String(f.fitKit || "");
    const fitRow = fit === "Yes" ? lab("FIT") : row("FIT", "FIT result", fit === "Recommended but declined" ? "Declined" : fit === "No" ? "Not done" : "Not recorded", "", "Negative", fit === "Recommended but declined" ? "declined" : "not_done", "not_tested", "", "FIT");
    add("bowel", [{ ...fitRow, test: "Your FIT (Bowel Screening) result" }], { questions: [{ question: "FIT Bowel Cancer Screening test done?", answer: fit === "Yes" ? "Yes" : fit === "Recommended but declined" ? "Recommended but declined" : fit === "No" ? "No" : "Not recorded" }] });
    const psaOnPanel = ep.expectedTests.some((t) => t.code === "PSA");
    if (person.sex === "male" && (ctx.age > 45 || psaOnPanel)) {
      const psa = String(f.psaTaken || "");
      const psaRow = psa === "Yes" ? lab("PSA") : row("PSA", "Your PSA result", psa === "Offered but declined" ? "Declined" : "Not done", "ug/L", rangeTextFor("PSA", ctx), psa === "Offered but declined" ? "declined" : "not_done", "not_tested", "", "PSA");
      const symptoms = typeof f.psaSymptoms === "string" ? f.psaSymptoms : null;
      add("prostate", [{ ...psaRow, test: "Your PSA result" }], { questions: [
        { question: "Your age (prostate cancer screening for over 45s)", answer: String(ctx.age) },
        { question: "Has your father or brother had prostate cancer before 60 years?", answer: yn(f.psaFamilyHistory ?? a.prostateFamilyHistory) },
        { question: "Do you have any symptoms suggestive of prostate enlargement?", answer: symptoms ? (symptoms === "None of these" ? "No" : `Yes: ${symptoms}`) : "Not answered" },
        { question: "PSA test taken?", answer: psa === "Yes" ? "Yes" : psa === "Offered but declined" ? "Offered but declined" : psa === "No" ? "No" : "Not recorded" },
        { question: "PSA result interpretation", answer: psaRow.status === "resulted" ? psaRow.flagWord || psaRow.resultText : psaRow.status === "pending" ? "Awaiting result" : "Not Done" },
      ] });
    }
    if (person.sex === "male") add("testicular", [], { questions: [
      { question: "Do you examine your testicles regularly for lumps?", answer: yn(a.examineTesticles) },
      { question: "Do you have any undiagnosed lumps in your testicles now?", answer: yn(a.testicularLumpsNow) },
    ] });
    if (person.sex === "female") add("breast_cervical", [], { questions: [
      { question: "Do you examine your breasts regularly for lumps?", answer: yn(a.examineBreasts) },
      { question: "Do you have any undiagnosed lumps in your breasts now?", answer: yn(a.breastLumpsNow) },
      ...(ctx.age >= 25 ? [{ question: "Are you up to date with your cervical screening (smear test)?", answer: yn(a.cervicalScreening) }] : []),
    ] });

    const clinicianId = v ? v.releasedBy || v.createdBy : null;
    const clinician = clinicianId ? I.staffById.get(clinicianId)?.displayName || null : null;
    return {
      episodeId, versionId: v ? v.id : null, version: v ? v.version : null, versionStatus: v ? v.status : "preview",
      header: {
        title: REPORT_TITLE, name: `${person.given} ${person.family}`, dob: person.dob, dobText: fmtDateLong(person.dob), appointmentDate: ep.collectedAt, appointmentText: fmtDateLong(ep.collectedAt),
        programme: programme.name, employer: programme.clientName, screeningRef: ep.screeningRef, version: v ? v.version : null, clinician,
        releasedAt: v ? v.releasedAt : null, releasedText: v && v.releasedAt ? fmtDateLong(v.releasedAt) : null,
      },
      intro: REPORT_INTRO,
      advice: { text: v ? v.advice : "", written: !!v && !!v.advice.trim(), signature: ADVICE_SIGNATURE },
      lifestyle: { intro: LIFESTYLE_INTRO, support: LIFESTYLE_SUPPORT.concat(EMPLOYER_SUPPORT[ep.programmeId] || []), rows: lifestyleRows(a, { sex: person.sex, age: ctx.age, employer: programme.clientName }) },
      sections,
      ruleSet: RULE_SET_LABEL,
      notADiagnosis: NOT_A_DIAGNOSIS,
    };
  });
}
