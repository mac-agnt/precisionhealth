/* Snapshot freshness for employer reports.

   Why local: in-session actions are stamped a few seconds after the demo clock (Ctx.stamp), but the
   shared newerReleases() and report/refreshSnapshot use state.clock.nowUtc as the upper bound. A report
   released during the demo (Aisling at 08:15:01) is therefore never counted as newer and a refresh to
   08:15:00 never includes it. These versions count every release after the snapshot time and refresh to
   the latest stamp, so a session release is picked up. Registered at import time. */
import { cohortEpisodes, defaultCohort, registerHandlers } from "../../model";
import type { ActionResult, Ctx, EmployerReport, PhState } from "../../model";

const FAR_FUTURE = "9999-12-31T23:59:59.000Z";

/** Released reports for the programme that are newer than the report's data time. */
export function newerReleasesSafe(s: PhState, r: EmployerReport): number {
  const all = cohortEpisodes(s, defaultCohort(r.programmeId), FAR_FUTURE).length;
  const inSnap = cohortEpisodes(s, defaultCohort(r.programmeId), r.dataAsOf).length;
  return Math.max(0, all - inSnap);
}

export const REFRESH_SAFE = "reporting/refreshSnapshot";
export const refreshSnapshotSafe = (reportId: string) => ({ type: REFRESH_SAFE, reportId });

registerHandlers({
  [REFRESH_SAFE]: (c: Ctx, a: { reportId: string }): ActionResult => {
    const d = c.need("reports.build", "refresh the report snapshot"); if (d) return d;
    const r = c.s.employerReports.find((x) => x.id === a.reportId);
    if (!r) return c.fail("Unknown report.");
    if (r.status === "approved" || r.status === "exported") return c.fail("This report is approved. Create a new version to refresh it.");
    const before = cohortEpisodes(c.s, defaultCohort(r.programmeId), r.dataAsOf).length;
    // The latest stamp is never earlier than any release recorded so far in this session.
    r.dataAsOf = c.stamp();
    c.inv();
    const after = cohortEpisodes(c.s, defaultCohort(r.programmeId), r.dataAsOf).length;
    c.emit({
      verb: "report.refreshed", summary: `${c.first()} refreshed the data for ${r.id}: ${after} released reports at programme level (was ${before}). The disclosure check runs again on the new data.`,
      entity: { kind: "employer_report", id: r.id }, programmeId: r.programmeId, storyId: "ST-06",
    });
    return c.ok(`Snapshot refreshed: ${after} released reports at programme level (was ${before}).`, "info");
  },
});
