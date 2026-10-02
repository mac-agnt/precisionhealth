/* Reporting Overview: employer reports by state, period, cohort and reviewer; attendance versus
   the report-eligible cohort; reporting milestones; governance activity. Only released reports
   are ever eligible for employer reporting. */
import { useState } from "react";
import {
  AGENT_DEFS, PROGRAMME_BY_ID, PROGRAMME_ORDER, activityFeed, cohortEpisodes, defaultCohort, exportMetrics, fmtDate, fmtDateTime, fmtDayMonth, fmtShortDateTime, fmtWhen, isProgrammeLevel,
  programmeCounts, staffName,
} from "../../model";
import type { EmployerReport, ProgrammeId } from "../../model";
import { useNav } from "../../nav-context";
import { usePhState } from "../../store";
import { Button, Card, CardHeader, DataTable, DemoTag, EntityLink, Kpi, KpiStrip, PALETTE, PageHeader, Pill, Segmented, Split, Stacked } from "../../ui";
import type { Column } from "../../ui";
import { sizeText } from "./disclosure";
import { newerReleasesSafe } from "./snapshot";
import { Note, STATUS_LABEL, StatusPill } from "./common";

type StateFilter = "all" | EmployerReport["status"];
const STATES: EmployerReport["status"][] = ["draft", "reviewed", "approved", "exported"];

export default function Overview() {
  const s = usePhState();
  const nav = useNav();
  const reports = s.employerReports;
  const [filter, setFilter] = useState<StateFilter>("all");
  const count = (st: EmployerReport["status"]) => reports.filter((r) => r.status === st).length;
  const rows = filter === "all" ? reports : reports.filter((r) => r.status === filter);
  const threshold = s.settings.suppressionThreshold;
  const sisk = reports.find((r) => r.programmeId === "PRG-SISK-26");
  const siskEligible = sisk ? exportMetrics(s, sisk).reportEligible : cohortEpisodes(s, defaultCohort("PRG-SISK-26"), s.clock.nowUtc).length;
  const siskAttended = programmeCounts(s, "PRG-SISK-26").attended;
  const blocked = reports.reduce((n, r) => n + r.blockedAttempts, 0);
  const open = (id: string) => nav.go({ page: "Reporting", tab: "report-builder", params: { report: id } });

  const columns: Column<EmployerReport>[] = [
    { key: "report", header: "Report", cell: (r) => (
      <span style={{ display: "block", minWidth: 0 }}>
        <span className="ph-mono" style={{ fontSize: 11, color: "var(--faint)" }}>{r.id} v{r.version}</span>
        <span style={{ display: "block", color: "var(--ink)", whiteSpace: "normal", minWidth: 200 }}>{r.title}</span>
      </span>
    ), nowrap: false },
    { key: "status", header: "State", cell: (r) => <StatusPill status={r.status} />, sort: (a, b) => STATES.indexOf(a.status) - STATES.indexOf(b.status) },
    { key: "period", header: "Reporting period", cell: (r) => `${fmtDayMonth(r.periodStart)} to ${fmtDate(r.periodEnd)}` },
    { key: "cohort", header: "Cohort", nowrap: false, cell: (r) => {
      const m = exportMetrics(s, r);
      return m.blocked
        ? <Pill tone="warn" icon="lock">Blocked, {sizeText(m.size, threshold)}</Pill>
        : <span style={{ display: "block", minWidth: 150 }}><span className="ph-num" style={{ color: "var(--ink)" }}>{m.size}</span> released reports<span className="ph-faint" style={{ display: "block", fontSize: 11 }}>{isProgrammeLevel(r.cohort) ? "Programme level" : "Filtered cohort"}</span></span>;
    } },
    { key: "reviewer", header: "People", cell: (r) => (
      <span>{staffName(s, r.reviewerId)}<span className="ph-faint" style={{ display: "block", fontSize: 11 }}>Coordinator {staffName(s, r.coordinatorId)}</span></span>
    ) },
    { key: "asof", header: "Data as of", cell: (r) => (r.snapshot ? <span>{fmtShortDateTime(r.snapshot.at)}<span className="ph-faint" style={{ display: "block", fontSize: 11 }}>Frozen at approval</span></span> : fmtShortDateTime(r.dataAsOf)) },
  ];

  return (
    <div className="ph-page">
      <PageHeader title="Employer reporting" sub="Programme reports built from released reports only, with disclosure control before anything reaches an employer."
        actions={<><DemoTag>Synthetic data</DemoTag>{sisk ? <Button variant="primary" icon="edit" onClick={() => open(sisk.id)}>Open Report Builder</Button> : null}</>} />
      <div className="ph-stack">
        <KpiStrip>
          <Kpi label="Employer reports" value={reports.length} sub={STATES.map((st) => `${count(st)} ${STATUS_LABEL[st].toLowerCase()}`).join(", ")} />
          <Kpi label="Sisk report-eligible cohort" value={siskEligible} sub={`released reports, of ${siskAttended} attended overall`} />
          <Kpi label="Blocked selections" value={blocked} sub="small-cohort filters stopped and logged" icon="lock" />
          <Kpi label="Export previews" value={s.exports.length} sub="created from approved snapshots only" icon="print" />
        </KpiStrip>
        <Card pad={false}>
          <div style={{ padding: "16px 18px 10px" }}>
            <CardHeader title="Programme reports" sub="By state, reporting period, cohort and reviewer. Select a report to open it in the builder." />
            <Segmented label="Filter by state" value={filter} onChange={setFilter}
              options={[{ id: "all", label: "All", count: reports.length }, ...STATES.map((st) => ({ id: st, label: STATUS_LABEL[st], count: count(st) }))]} />
          </div>
          <DataTable rows={rows} columns={columns} rowKey={(r) => r.id} onRowClick={(r) => open(r.id)} minWidth={820} caption="Employer programme reports"
            empty={<div style={{ padding: "18px" }}><Note>No reports in this state.</Note></div>} />
          <div style={{ padding: "0 18px 14px" }}>
            {reports.map((r) => {
              const n = newerReleasesSafe(s, r);
              return n ? <Note key={r.id} icon="refresh">{r.id}: {n} {n === 1 ? "report has" : "reports have"} been released since the data was taken at {fmtDateTime(r.dataAsOf)}. {r.snapshot ? "The approved snapshot stays frozen; a new version would include them." : `Refresh the snapshot in the builder to include ${n === 1 ? "it" : "them"}.`}</Note> : null;
            })}
          </div>
        </Card>
        <Split main={<EligibilityCard />} side={<MilestonesCard />} />
        <ActivityCard />
      </div>
    </div>
  );
}

/* ---- attendance is not the report cohort ---- */
function EligibilityCard() {
  const s = usePhState();
  return (
    <Card>
      <CardHeader title="Attendance and report eligibility" sub="Only released reports enter employer reporting. Attended episodes still in review, awaiting results or on hold are excluded." />
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {PROGRAMME_ORDER.map((id) => {
          const c = programmeCounts(s, id);
          const report = s.employerReports.find((r) => r.programmeId === id);
          const eligible = report ? exportMetrics(s, report).reportEligible : null;
          return (
            <div key={id} style={{ minWidth: 0 }}>
              <div className="ph-row-flex" style={{ fontSize: 12.5, marginBottom: 6 }}>
                <span className="ph-grow ph-trunc" style={{ color: "var(--ink)", fontWeight: 500 }} title={PROGRAMME_BY_ID[id].name}>{PROGRAMME_BY_ID[id].name}</span>
                <span className="ph-num ph-dim">{c.attended} attended</span>
              </div>
              <Stacked total={c.attended} height={10} segments={[
                { label: "Released", value: c.released, color: "var(--ok)" },
                { label: "Ready", value: c.ready, color: "var(--accent)" },
                { label: "Awaiting", value: c.awaiting, color: PALETTE[2] },
                { label: "On hold", value: c.onHold, color: "var(--warn)" },
              ]} />
              <div className="ph-faint" style={{ fontSize: 11.5, marginTop: 6, lineHeight: 1.45 }}>
                {report && eligible !== null
                  ? <>Report-eligible in <EntityLink kind="employer_report" id={report.id} />: <span className="ph-num" style={{ color: "var(--ink)" }}>{eligible}</span> released reports of {c.attended} attended.</>
                  : <>No employer report drafted yet. {c.released} released so far.</>}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ---- reporting milestones from the schedule ---- */
function MilestonesCard() {
  const s = usePhState();
  const jobs = s.jobs.filter((j) => j.kind === "report_milestone").slice().sort((a, b) => ((a.nextRunAt || "") < (b.nextRunAt || "") ? -1 : 1));
  return (
    <Card>
      <CardHeader title="Reporting milestones" sub="From the scheduled jobs. Simulated schedule, nothing is sent."
        right={<DemoTag>Simulated</DemoTag>} />
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {jobs.map((j) => {
          const er = j.linked?.kind === "employer_report" ? s.employerReports.find((r) => r.id === j.linked!.id) : undefined;
          const progId = (er?.programmeId || (j.linked?.kind === "programme" ? j.linked.id : null)) as ProgrammeId | null;
          return (
            <li key={j.id} className="ph-row-flex" style={{ alignItems: "flex-start", gap: 10, padding: "10px 0", borderTop: "1px solid var(--border)" }}>
              <div className="ph-grow">
                <div style={{ fontSize: 12.5, color: "var(--ink)", fontWeight: 500 }}>{j.name}</div>
                <div className="ph-faint" style={{ fontSize: 11.5, marginTop: 2 }}>
                  {j.nextRunAt ? `Due ${fmtWhen(j.nextRunAt, s.clock.nowUtc)}` : "No date"}{progId ? `. ${PROGRAMME_BY_ID[progId].name}` : ""}.
                </div>
              </div>
              {er ? <><StatusPill status={er.status} /><EntityLink kind="employer_report" id={er.id}>Open</EntityLink></> : <Pill tone="neutral" icon="clock">Not started</Pill>}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/* ---- governance activity on employer reports ---- */
function ActivityCard() {
  const s = usePhState();
  const feed = activityFeed(s, { entityKind: "employer_report" }).slice(0, 8);
  const agent = AGENT_DEFS.find((a) => a.id === "reporting");
  return (
    <Card>
      <CardHeader title="Reporting activity" sub="Drafts, blocked selections, reviews, approvals and exports, newest first." />
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {feed.map((v) => (
          <li key={v.event.id} style={{ padding: "9px 0", borderTop: "1px solid var(--border)" }}>
            <div style={{ fontSize: 12.5, color: "var(--body)", lineHeight: 1.45 }}>{v.text}</div>
            <div className="ph-row-flex ph-faint" style={{ fontSize: 11, marginTop: 3, gap: 8, flexWrap: "wrap" }}>
              <span>{fmtWhen(v.event.at, s.clock.nowUtc)}</span><span>{v.event.actor.label}</span>
              {v.event.simulated ? <DemoTag>Simulated</DemoTag> : null}
            </div>
          </li>
        ))}
      </ul>
      {!feed.length ? <Note>No reporting activity yet.</Note> : null}
      {agent ? <Note icon="spark"><EntityLink kind="agent" id={agent.id}>{agent.name} agent</EntityLink>: {agent.job} It cannot {agent.mayNotDo.map((x) => x.charAt(0).toLowerCase() + x.slice(1)).join(", ").replace(/, ([^,]*)$/, " or $1")}.</Note> : null}
    </Card>
  );
}
