/* Employer reporting selectors. One defined cohort feeds every chart, table, narrative and
   export. Disclosure control is applied here, once, so no page can leak a hidden cell:
   blocked cohorts return no breakdowns at all, and a suppressed cell never carries its count. */
import type {
  CohortDef, EmployerMetrics, EmployerReport, Episode, GenderRecorded, Iso, MetricBreakdown, MetricCell, MetricClinical, PhState, SexRecorded,
} from "../types";
import { AGE_BANDS } from "../constants";
import { ageOn, fmtDate, fmtNumericDate, localDateOf } from "../time";
import { ix, memo, programmeCounts, rate } from "./core";
import { bpFlagged, firstReleasedAt, latestObservations } from "./clinical";

export const GENDER_LABEL: Record<GenderRecorded, string> = { woman: "Women", man: "Men", non_binary: "Non-binary", prefer_not_to_say: "Prefer not to say", not_recorded: "Not recorded" };
export const SEX_LABEL: Record<SexRecorded, string> = { female: "Female", male: "Male", not_recorded: "Not recorded" };

export function bandOfAge(age: number): (typeof AGE_BANDS)[number] {
  return age <= 34 ? "18-34" : age <= 44 ? "35-44" : age <= 54 ? "45-54" : "55+";
}
export const bandLabel = (b: string) => (b === "55+" ? "55+" : b.replace("-", "–"));

export const cohortKey = (c: CohortDef) => `${c.site}|${c.ageBand}|${c.gender}|${c.from || ""}|${c.to || ""}`;

export function defaultCohort(programmeId: CohortDef["programmeId"]): CohortDef {
  return { programmeId, site: "all", ageBand: "all", gender: "all", from: null, to: null };
}
export function cohortLabel(c: CohortDef, programmeName: string): string {
  const parts: string[] = [];
  if (c.site !== "all") parts.push(c.site);
  if (c.ageBand !== "all") parts.push(`age ${bandLabel(c.ageBand)}`);
  if (c.gender !== "all") parts.push(GENDER_LABEL[c.gender]);
  if (c.from || c.to) parts.push(`${c.from ? fmtDate(c.from) : "start"} to ${c.to ? fmtDate(c.to) : "latest"}`);
  return parts.length ? `${programmeName}: ${parts.join(", ")}` : `${programmeName}: all released reports (programme level)`;
}
export const isProgrammeLevel = (c: CohortDef) => c.site === "all" && c.ageBand === "all" && c.gender === "all" && !c.from && !c.to;

/** Released episodes meeting the cohort filters, as of a time. Only released reports are ever eligible. */
export function cohortEpisodes(state: PhState, c: CohortDef, asOf: Iso): Episode[] {
  const I = ix(state);
  return state.episodes.filter((e) => {
    if (e.programmeId !== c.programmeId || e.reportState !== "released") return false;
    const rel = firstReleasedAt(state, e.id);
    if (!rel || rel > asOf) return false;
    const p = I.personById.get(e.personId)!;
    const date = localDateOf(e.collectedAt);
    if (c.site !== "all" && p.site !== c.site) return false;
    if (c.gender !== "all" && p.gender !== c.gender) return false;
    if (c.ageBand !== "all" && bandOfAge(ageOn(p.dob, date)) !== c.ageBand) return false;
    if (c.from && date < c.from) return false;
    if (c.to && date > c.to) return false;
    return true;
  });
}

/** Small-cell suppression with complementary suppression. */
export function suppressCells(cells: Array<{ label: string; count: number }>, threshold: number): MetricCell[] {
  const out: MetricCell[] = cells.map((c) => ({ label: c.label, count: c.count, suppressed: c.count > 0 && c.count < threshold, complementary: false }));
  const hidden = () => out.filter((c) => c.suppressed);
  const sumHidden = () => hidden().reduce((n, c) => n + (cells.find((x) => x.label === c.label)?.count || 0), 0);
  const hideNext = () => {
    const cand = out.filter((c) => !c.suppressed && (cells.find((x) => x.label === c.label)?.count || 0) > 0)
      .sort((a, b) => (cells.find((x) => x.label === a.label)!.count - cells.find((x) => x.label === b.label)!.count));
    if (!cand.length) return false;
    cand[0].suppressed = true;
    cand[0].complementary = true;
    return true;
  };
  let guard = 0;
  while (hidden().length > 0 && (hidden().length === 1 || sumHidden() < threshold) && guard++ < 10) { if (!hideNext()) break; }
  return out.map((c) => (c.suppressed ? { ...c, count: null } : c));
}

export function disclosureCheck(state: PhState, size: number) {
  const min = state.settings.minCohort;
  return {
    size, min, blocked: size < min,
    reason: size < min ? `Selected cohort has ${size} participants. Employer output needs at least ${min}, so small groups cannot be identified. Use the programme-level view.` : "",
  };
}

export function employerMetrics(state: PhState, programmeId: CohortDef["programmeId"], cohort: CohortDef, asOf: Iso): EmployerMetrics {
  const key = JSON.stringify([programmeId, cohort, asOf]);
  return memo(state, "em:" + key, () => {
    const I = ix(state);
    const prog = I.programmeById.get(programmeId)!;
    const eps = cohortEpisodes(state, cohort, asOf);
    const size = eps.length;
    const d = disclosureCheck(state, size);
    const threshold = state.settings.suppressionThreshold;
    const live = programmeCounts(state, programmeId);
    const programmeLevelEligible = cohortEpisodes(state, defaultCohort(programmeId), asOf).length;
    const funnel = [
      { key: "invited", label: "Invited", n: live.invited, denominatorLabel: "of eligible invitees", rateLabel: "100%" },
      { key: "booked", label: "Booked", n: live.booked, denominatorLabel: `of ${live.invited} invited`, rateLabel: rate(live.booked, live.invited) },
      { key: "attended", label: "Attended", n: live.attended, denominatorLabel: `of ${live.booked} booked`, rateLabel: rate(live.attended, live.booked) },
      { key: "released", label: "Report-eligible (released)", n: programmeLevelEligible, denominatorLabel: `of ${live.attended} attended`, rateLabel: rate(programmeLevelEligible, live.attended) },
    ];
    const base: EmployerMetrics = {
      programmeId, cohortLabel: cohortLabel(cohort, prog.name), size, blocked: d.blocked, reason: d.reason, reportEligible: programmeLevelEligible, attendedOverall: live.attended,
      funnel, breakdowns: [], clinical: [], asOf,
      methodology: [
        "Only released reports are counted. Reports in review, awaiting results or on hold are excluded.",
        "Counts come from one defined cohort. Every table, chart and export uses the same cohort and the same numbers.",
        `Groups smaller than ${threshold} are suppressed, with complementary suppression so visible totals cannot reveal a hidden cell.`,
        `Employer output needs a cohort of at least ${state.settings.minCohort}. Smaller selections are blocked.`,
        "Age is age at screening. Sex recorded for reference ranges and gender are separate fields. Unknown or not recorded categories are shown where present.",
        "Clinical indicators use the displayed illustrative limits, which are sample content and clinician-owned. They are not diagnoses.",
        "Participant free text and identifying rows are never included.",
      ],
    };
    if (d.blocked) return base;

    const countBy = <T extends string>(keyOf: (e: Episode) => T, order: T[], labelOf: (k: T) => string) => {
      const m = new Map<T, number>();
      eps.forEach((e) => m.set(keyOf(e), (m.get(keyOf(e)) || 0) + 1));
      return order.filter((k) => (m.get(k) || 0) > 0).map((k) => ({ label: labelOf(k), count: m.get(k) || 0 }));
    };
    const age: MetricBreakdown = {
      id: "age", title: "Age at screening", denominator: size, denominatorLabel: `${size} released reports in the cohort`,
      cells: suppressCells(AGE_BANDS.map((b) => ({ label: bandLabel(b), count: eps.filter((e) => bandOfAge(ageOn(I.personById.get(e.personId)!.dob, localDateOf(e.collectedAt))) === b).length })), threshold),
      note: "Four age bands. Missing or excluded: 0.",
    };
    const gender: MetricBreakdown = {
      id: "gender", title: "Gender (as recorded)", denominator: size, denominatorLabel: `${size} released reports in the cohort`,
      cells: suppressCells(countBy((e) => I.personById.get(e.personId)!.gender, ["woman", "man", "non_binary", "prefer_not_to_say", "not_recorded"] as GenderRecorded[], (k) => GENDER_LABEL[k]), threshold),
      note: "Self-described categories as recorded, not assumed to be binary. Not recorded is shown where present.",
    };
    const sex: MetricBreakdown = {
      id: "sex", title: "Sex recorded for reference ranges", denominator: size, denominatorLabel: `${size} released reports in the cohort`,
      cells: suppressCells(countBy((e) => I.personById.get(e.personId)!.sex, ["female", "male", "not_recorded"] as SexRecorded[], (k) => SEX_LABEL[k]), threshold),
      note: "A separate field from gender. Not recorded is shown where present.",
    };
    base.breakdowns = [age, gender, sex];

    const clinical = (id: string, title: string, test: (e: Episode) => boolean | null, note: string): MetricClinical => {
      let withValue = 0, flagged = 0;
      eps.forEach((e) => { const r = test(e); if (r === null) return; withValue++; if (r) flagged++; });
      return { id, title, flagged: flagged > 0 && flagged < threshold ? null : flagged, withValue, excluded: size - withValue, note };
    };
    const obsOver = (code: string) => (e: Episode) => { const o = latestObservations(state, e.id).find((x) => x.code === code); return o ? o.flag === "review_required" : null; };
    base.clinical = [
      clinical("bp", "Blood pressure at or above the displayed limit", (e) => (e.capture.measures.bpSys.value == null ? null : bpFlagged(e.capture)), "Displayed limit <140/90 mmHg. Participants without a recorded value are excluded."),
      clinical("ldl", "LDL cholesterol above the displayed limit", obsOver("LDL"), "Displayed limit <3.0 mmol/L. Participants without a result are excluded."),
      clinical("hba1c", "HbA1c above the displayed limit", obsOver("HBA1C"), "Displayed limit <42 mmol/mol. Participants without a result are excluded."),
    ];
    return base;
  });
}

export const reportMetrics = (state: PhState, r: EmployerReport): EmployerMetrics => employerMetrics(state, r.programmeId, r.cohort, r.dataAsOf);
/** What PDF and PowerPoint previews render. The frozen snapshot wins, so both always match. */
export const exportMetrics = (state: PhState, r: EmployerReport): EmployerMetrics => (r.snapshot ? r.snapshot.metrics : reportMetrics(state, r));
/** Released reports newer than the snapshot. They wait for a refresh. */
export function newerReleases(state: PhState, r: EmployerReport) {
  const cur = cohortEpisodes(state, defaultCohort(r.programmeId), state.clock.nowUtc).length;
  const inSnap = cohortEpisodes(state, defaultCohort(r.programmeId), r.dataAsOf).length;
  return Math.max(0, cur - inSnap);
}

/** Deterministic narrative drafted from the approved aggregate only. Always a draft until a clinician approves. */
export function draftNarrative(metrics: EmployerMetrics): string {
  if (metrics.blocked) return "";
  const age = metrics.breakdowns.find((b) => b.id === "age");
  const bands = (age?.cells || []).filter((c) => !c.suppressed).map((c) => `${c.label}: ${c.count}`).join(", ");
  const att = metrics.funnel.find((f) => f.key === "attended")!, rel = metrics.funnel.find((f) => f.key === "released")!;
  const bk = metrics.funnel.find((f) => f.key === "booked")!;
  const lines = [
    `This interim report covers ${metrics.reportEligible} released screening reports. ${att.n} participants have attended so far (${att.rateLabel} ${att.denominatorLabel}), of whom ${rel.n} have a released report (${rel.rateLabel} ${rel.denominatorLabel}).`,
    `${bk.n} participants are booked (${bk.rateLabel} ${bk.denominatorLabel}).`,
    bands ? `Participants by age at screening: ${bands}.` : "",
    "Clinical indicators use displayed illustrative limits that are sample content. They are summaries for programme planning and are not diagnoses.",
    "Draft prepared from the approved aggregate snapshot. It must be reviewed and approved by a clinician before export.",
  ];
  return lines.filter(Boolean).join("\n\n");
}

export const fmtCohortDate = (d: string) => fmtNumericDate(d);
