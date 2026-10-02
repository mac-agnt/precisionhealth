/* Disclosure helpers for employer reporting.

   Why a local cohort handler: the shared report/setCohort handler and disclosureCheck() put the
   exact cohort size in the toast, the block reason and the activity log. When a filter selects a
   group smaller than the suppression threshold (for example gender "Non-binary" in the Sisk cohort,
   a cell the breakdown suppresses), that text would reveal the hidden cell. This handler applies the
   same rules and the same governance logging, but never prints a size below the threshold. Cohorts of
   5 to 9 keep their count (the six-person Site B, 55+ example in the brief). Changing the cohort after
   the disclosure review returns the report to draft and clears any approval, so the new cohort is
   reviewed again. Registered at import time, as the module guidance allows. */
import { PROGRAMME_BY_ID, cohortEpisodes, cohortKey, registerHandlers } from "../../model";
import type { ActionResult, CohortDef, Ctx, EmployerMetrics, MetricClinical } from "../../model";

/** A cohort size safe to show: below the suppression threshold it becomes "fewer than N". */
export function sizeText(size: number, threshold: number): string {
  return size > 0 && size < threshold ? `fewer than ${threshold}` : String(size);
}

/** Why employer output is blocked, without revealing a small count. */
export function blockReason(size: number, minCohort: number, threshold: number): string {
  const head = size === 0 ? "The selected cohort has no released reports." : `The selected cohort has ${sizeText(size, threshold)} participants.`;
  return `${head} Employer output needs at least ${minCohort}, so small groups cannot be identified. Use the programme-level view.`;
}

/**
 * The block reason to display. The model's own reason is preferred; if it would reveal a cohort
 * smaller than the suppression threshold (the model before its disclosure hardening), a safe
 * wording is used instead. The size itself is never rendered by the caller.
 */
export function safeReason(m: EmployerMetrics, minCohort: number, threshold: number): string {
  const small = typeof m.size === "number" && m.size > 0 && m.size < threshold;
  if (small || !m.reason) return blockReason(typeof m.size === "number" ? m.size : 0, minCohort, threshold);
  return m.reason;
}

/**
 * Whether a clinical indicator can be shown. The model already hides a flagged count below the
 * threshold. This also hides it when the complement (with a value but not flagged) is a small
 * group, so the visible figure and its denominator cannot reveal that group either.
 */
export function indicatorVisible(m: MetricClinical, threshold: number): boolean {
  if (m.flagged === null) return false;
  const rest = m.withValue - m.flagged;
  return !(rest > 0 && rest < threshold);
}

export const SET_COHORT_SAFE = "reporting/setCohort";
export const setCohortSafe = (reportId: string, cohort: CohortDef) => ({ type: SET_COHORT_SAFE, reportId, cohort });

registerHandlers({
  [SET_COHORT_SAFE]: (c: Ctx, a: { reportId: string; cohort: CohortDef }): ActionResult => {
    const d = c.need("reports.build", "build employer reports"); if (d) return d;
    const r = c.s.employerReports.find((x) => x.id === a.reportId);
    if (!r) return c.fail("Unknown report.");
    if (r.status === "exported") return c.fail("This report was exported. Create a new version to change its cohort.");
    const next = { ...a.cohort, programmeId: r.programmeId };
    if (cohortKey(next) === cohortKey(r.cohort)) return c.ok();
    const wasReviewed = r.status === "reviewed" || r.status === "approved";
    r.cohort = next;
    if (wasReviewed) {
      // The disclosure review and any approval covered a different cohort.
      r.status = "draft";
      r.narrativeApproved = false;
      r.approvedBy = null;
      r.approvedAt = null;
      r.snapshot = null;
      const ap = c.s.approvals.find((x) => x.type === "employer_report" && x.target.id === r.id && x.status === "approved");
      if (ap) { ap.status = "pending"; ap.decidedAt = null; ap.decidedBy = null; }
    }
    c.inv();
    const size = cohortEpisodes(c.s, r.cohort, r.dataAsOf).length;
    const min = c.s.settings.minCohort, threshold = c.s.settings.suppressionThreshold;
    if (size < min) {
      const key = cohortKey(r.cohort);
      if (r.lastBlockedKey !== key) {
        r.blockedAttempts += 1;
        r.lastBlockedKey = key;
        c.emit({
          verb: "export.blocked", actor: { kind: "system", id: "system", label: "Disclosure control" },
          summary: `${PROGRAMME_BY_ID[r.programmeId].clientName} employer export blocked: selected cohort has ${size === 0 ? "no released reports" : `${sizeText(size, threshold)} participants`}.`,
          entity: { kind: "employer_report", id: r.id }, programmeId: r.programmeId, storyId: "ST-06",
        });
      }
      return { ok: true, tone: "warn", message: blockReason(size, min, threshold) + (wasReviewed ? " The report is back in draft." : "") };
    }
    // Quiet on success unless the review was reset: the builder shows the new cohort straight away.
    return wasReviewed ? c.ok("Cohort changed. The report is back in draft and needs a new disclosure review.", "info") : c.ok();
  },
});
