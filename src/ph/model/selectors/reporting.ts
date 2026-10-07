/* Employer reporting selectors. One defined cohort feeds every chart, table, narrative and
   export. Disclosure control is applied here, once, so no page can leak a hidden cell:
   blocked cohorts return no breakdowns at all, and a suppressed cell never carries its count. */
import type {
  CohortDef, EmployerMetrics, EmployerReport, Episode, GenderRecorded, Iso, MetricBreakdown, MetricCell, MetricClinical, PhState, SexRecorded,
} from "../types";
import { AGE_BANDS } from "../constants";
import { ageOn, fmtDate, fmtNumericDate, localDateOf } from "../time";
import { ix, memo, programmeCounts, rate } from "./core";
import { bpRaised, firstReleasedAt, releasedObservations } from "./clinical";

export const GENDER_LABEL: Record<GenderRecorded, string> = { woman: "Women", man: "Men", non_binary: "Non-binary", prefer_not_to_say: "Prefer not to say", not_recorded: "Not recorded" };
export const SEX_LABEL: Record<SexRecorded, string> = { female: "Female", male: "Male", not_recorded: "Not recorded" };

export function bandOfAge(age: number): (typeof AGE_BANDS)[number] {
  return age <= 34 ? "18-34" : age <= 44 ? "35-44" : age <= 54 ? "45-54" : "55+";
}
export const bandLabel = (b: string) => (b === "55+" ? "55+" : b.replace("-", "–"));

export const cohortKey = (c: CohortDef) => `${c.site}|${c.ageBand}|${c.gender}|${c.from || ""}|${c.to || ""}`;
/** The cohort a cohortKey was made from, for example the last blocked selection on a report. */
export function cohortFromKey(programmeId: CohortDef["programmeId"], key: string): CohortDef {
  const [site, ageBand, gender, from, to] = key.split("|");
  return { programmeId, site: site || "all", ageBand: (ageBand || "all") as CohortDef["ageBand"], gender: (gender || "all") as CohortDef["gender"], from: from || null, to: to || null };
}

export function defaultCohort(programmeId: CohortDef["programmeId"]): CohortDef {
  return { programmeId, site: "all", ageBand: "all", gender: "all", from: null, to: null };
}
const PROGRAMME_LEVEL_SUFFIX = "all released reports (programme level)";
export function cohortLabel(c: CohortDef, programmeName: string): string {
  const parts: string[] = [];
  if (c.site !== "all") parts.push(c.site);
  if (c.ageBand !== "all") parts.push(`age ${bandLabel(c.ageBand)}`);
  if (c.gender !== "all") parts.push(GENDER_LABEL[c.gender]);
  if (c.from || c.to) parts.push(`${c.from ? fmtDate(c.from) : "start"} to ${c.to ? fmtDate(c.to) : "latest"}`);
  return parts.length ? `${programmeName}: ${parts.join(", ")}` : `${programmeName}: ${PROGRAMME_LEVEL_SUFFIX}`;
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

/**
 * A cohort size as safe text. Below the suppression threshold the exact number is never stated:
 * "fewer than 5". From the threshold upwards the number is shown, as in the brief's six-person example.
 */
export function cohortSizeLabel(size: number, threshold: number): { label: string; hidden: boolean } {
  const hidden = size > 0 && size < threshold;
  return { label: hidden ? `fewer than ${threshold}` : String(size), hidden };
}

/**
 * Whether a cohort of this size may go to the employer. The returned size is 0 when the real size
 * is hidden, so a caller that prints it leaks nothing and a size check still blocks. The reason
 * never states a hidden size.
 */
export function disclosureCheck(state: PhState, size: number) {
  const min = state.settings.minCohort;
  const { label, hidden } = cohortSizeLabel(size, state.settings.suppressionThreshold);
  const blocked = size < min;
  const head = size === 0 ? "The selected cohort has no released reports." : `Selected cohort has ${label} participants.`;
  return {
    size: hidden ? 0 : size, sizeLabel: label, sizeHidden: hidden, min, blocked,
    reason: blocked ? `${head} Employer output needs at least ${min}, so small groups cannot be identified. Use the programme-level view.` : "",
  };
}

/** Governance text for a blocked employer export, safe for every role: "selected cohort has 6 participants". */
export function blockedExportText(state: PhState, clientName: string, size: number): string {
  const { label } = cohortSizeLabel(size, state.settings.suppressionThreshold);
  return `${clientName} employer export blocked: selected cohort has ${size === 0 ? "no released reports" : `${label} participants`}.`;
}

/** The brief's six-person example (Sisk Dublin Site B, age 55+) described from current data. */
export function exampleBlockedCohort(state: PhState, programmeId: CohortDef["programmeId"], asOf: Iso): { label: string; sizeLabel: string; blocked: boolean } | null {
  const prog = ix(state).programmeById.get(programmeId);
  const site = prog && prog.sites.length > 1 ? prog.sites[prog.sites.length - 1] : null;
  if (!site) return null;
  const c: CohortDef = { ...defaultCohort(programmeId), site, ageBand: "55+" };
  const size = cohortEpisodes(state, c, asOf).length;
  return { label: `${site.replace(/^.*?(Site [A-Z])$/, "$1")}, age 55+`, sizeLabel: cohortSizeLabel(size, state.settings.suppressionThreshold).label, blocked: size < state.settings.minCohort };
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
      programmeId, cohortLabel: cohortLabel(cohort, prog.name), size: d.size, sizeLabel: d.sizeLabel, sizeHidden: d.sizeHidden, blocked: d.blocked, reason: d.reason,
      reportEligible: programmeLevelEligible, attendedOverall: live.attended, funnel, breakdowns: [], clinical: [], asOf,
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
    // Released values only: a correction still in review does not change the employer figures.
    const obsOver = (code: string) => (e: Episode) => { const o = releasedObservations(state, e.id).find((x) => x.code === code); return o ? o.flag === "review_required" : null; };
    base.clinical = [
      clinical("bp", "Blood pressure at or above the displayed limit", (e) => (e.capture.measures.bpSys.value == null ? null : bpRaised(e.capture)), "Displayed limit <140/90 mmHg (Raised or worse in the report table). Participants without a recorded value are excluded."),
      clinical("ldl", "LDL cholesterol above the displayed limit", obsOver("LDL"), "Displayed limit <3.0 mmol/L. Participants without a result are excluded."),
      clinical("hba1c", "HbA1c at higher risk or raised", obsOver("HBA1C"), "Higher risk from 42 mmol/mol, raised from 48 (illustrative rule set). Participants without a result are excluded."),
    ];
    return base;
  });
}

export const reportMetrics = (state: PhState, r: EmployerReport): EmployerMetrics => employerMetrics(state, r.programmeId, r.cohort, r.dataAsOf);
/** What PDF and PowerPoint previews render. The frozen snapshot wins, so both always match. */
export const exportMetrics = (state: PhState, r: EmployerReport): EmployerMetrics => (r.snapshot ? r.snapshot.metrics : reportMetrics(state, r));
/** Upper bound for "every release so far". In-session releases are stamped a few seconds after the demo clock. */
const LATEST: Iso = "9999-12-31T23:59:59.000Z";
/** Released reports newer than the snapshot, including releases made in this session. They wait for a refresh. */
export function newerReleases(state: PhState, r: EmployerReport) {
  const cur = cohortEpisodes(state, defaultCohort(r.programmeId), LATEST).length;
  const inSnap = cohortEpisodes(state, defaultCohort(r.programmeId), r.dataAsOf).length;
  return Math.max(0, cur - inSnap);
}

/**
 * Deterministic narrative drafted from the approved aggregate only. Always a draft until a clinician
 * approves. Every figure is the selected cohort's own. Programme-level participation is added only
 * when the cohort is the whole programme, so a filtered cohort never mixes in programme totals.
 */
export function draftNarrative(metrics: EmployerMetrics): string {
  if (metrics.blocked) return "";
  const age = metrics.breakdowns.find((b) => b.id === "age");
  const bands = (age?.cells || []).filter((c) => !c.suppressed).map((c) => `${c.label}: ${c.count}`).join(", ");
  const hiddenBands = (age?.cells || []).filter((c) => c.suppressed).length;
  const programmeLevel = metrics.size === metrics.reportEligible && metrics.cohortLabel.endsWith(PROGRAMME_LEVEL_SUFFIX);
  const att = metrics.funnel.find((f) => f.key === "attended")!, rel = metrics.funnel.find((f) => f.key === "released")!;
  const bk = metrics.funnel.find((f) => f.key === "booked")!;
  const lines = [
    programmeLevel
      ? `This interim report covers ${metrics.sizeLabel} released screening reports. ${att.n} participants have attended so far (${att.rateLabel} ${att.denominatorLabel}), of whom ${rel.n} have a released report (${rel.rateLabel} ${rel.denominatorLabel}).`
      : `This interim report covers ${metrics.sizeLabel} released screening reports in the selected cohort (${metrics.cohortLabel}). Every figure below uses this cohort of ${metrics.sizeLabel} as its denominator.`,
    programmeLevel ? `${bk.n} participants are booked (${bk.rateLabel} ${bk.denominatorLabel}).` : "",
    bands ? `Participants by age at screening: ${bands}${hiddenBands ? ` (${hiddenBands} ${hiddenBands === 1 ? "band" : "bands"} suppressed to protect small numbers)` : ""}.` : "",
    "Clinical indicators use displayed illustrative limits that are sample content. They are summaries for programme planning and are not diagnoses.",
    "Draft prepared from the approved aggregate snapshot. It must be reviewed and approved by a clinician before export.",
  ];
  return lines.filter(Boolean).join("\n\n");
}

export const fmtCohortDate = (d: string) => fmtNumericDate(d);
