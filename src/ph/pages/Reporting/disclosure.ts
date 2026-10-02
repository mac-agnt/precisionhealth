/* Disclosure helpers for employer reporting.

   Why a local cohort handler: the shared report/setCohort handler and disclosureCheck() put the
   exact cohort size in the toast, the block reason and the activity log. When a filter selects a
   group smaller than the suppression threshold (for example gender "Non-binary" in the Sisk cohort,
   a cell the breakdown suppresses), that text would reveal the hidden cell. This handler applies the
   same rules and the same governance logging, but never prints a size below the threshold.
   Registered at import time, as the module guidance allows. */
import { PROGRAMME_BY_ID, cohortEpisodes, cohortKey, registerHandlers } from "../../model";
import type { ActionResult, CohortDef, Ctx, MetricClinical } from "../../model";

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
    if (r.status === "approved" || r.status === "exported") return c.fail("This report is approved. Changing the cohort would invalidate the approval. Create a new version first.");
    r.cohort = { ...a.cohort, programmeId: r.programmeId };
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
      return { ok: true, tone: "warn", message: blockReason(size, min, threshold) };
    }
    // Quiet on success: the builder shows the new cohort and its size straight away.
    return c.ok();
  },
});
