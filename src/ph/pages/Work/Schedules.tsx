/* Work, Schedules: upcoming clinics, 24-hour reminder jobs, review checkpoints, employer report
   milestones and the existing source-import simulation, with last and next run and failures.
   Every job is simulated. None calls a provider. */
import { useMemo, useState } from "react";
import { PROGRAMME_BY_ID, fmtDateTime, fmtShortDateTime, fmtWeekdayDate, fmtWhen, jobViews, linkFor, reminderStats, sessionStats, sessionsBetween, staffName, today } from "../../model";
import type { PhState, ScheduledJob } from "../../model";
import { usePersona, usePhState } from "../../store";
import { useNav } from "../../nav-context";
import { Button, Card, CardHeader, Chip, DataTable, DemoTag, EmptyState, EntityLink, Icon, PageHeader, Pill, ProgressBar, Drawer } from "../../ui";
import type { Column, GlyphName } from "../../ui";
import { Tag, WIDE_MIN, isClinicalViewer, mergeParams, refLabel, useMeasure } from "./shared";

type Kind = ScheduledJob["kind"];
const KIND: Record<Kind, { label: string; icon: GlyphName }> = {
  reminder: { label: "24-hour reminders", icon: "sms" },
  import: { label: "Source import", icon: "refresh" },
  review_checkpoint: { label: "Review checkpoint", icon: "eye" },
  report_milestone: { label: "Employer report milestone", icon: "chart" },
  clinic_prep: { label: "Clinic preparation", icon: "calendar" },
};
const KIND_ORDER: Kind[] = ["reminder", "import", "review_checkpoint", "report_milestone", "clinic_prep"];

function JobStatus({ j }: { j: ScheduledJob }) {
  if (j.status === "failed") return <Pill tone="bad" icon="alert">Last run failed</Pill>;
  if (j.status === "ok") return <Pill tone="ok">Last run OK</Pill>;
  if (j.status === "paused") return <Pill tone="neutral" icon="lock">Paused</Pill>;
  return <Pill tone="neutral" icon="clock">Scheduled</Pill>;
}
const statusRank = (j: ScheduledJob) => (j.status === "failed" ? 0 : j.status === "pending" ? 1 : j.status === "ok" ? 2 : 3);
const byNext = (a: ScheduledJob, b: ScheduledJob) => {
  const an = a.nextRunAt || "9999", bn = b.nextRunAt || "9999";
  return an < bn ? -1 : an > bn ? 1 : a.id < b.id ? -1 : 1;
};

export default function Schedules() {
  const state = usePhState();
  const nav = useNav();
  const [measure, width] = useMeasure<HTMLDivElement>();
  const wide = width === 0 || width >= WIDE_MIN;
  const [kind, setKind] = useState<"all" | Kind>("all");

  const jobs = useMemo(() => jobViews(state) as ScheduledJob[], [state]);
  const now = state.clock.nowUtc;
  const rows = jobs.filter((j) => kind === "all" || j.kind === kind).sort((a, b) => statusRank(a) - statusRank(b) || byNext(a, b));
  const failed = jobs.filter((j) => j.status === "failed").length;
  const clinics = sessionsBetween(state, today(state), "2099-12-31");
  const nextRuns = jobs.filter((j) => j.nextRunAt && j.nextRunAt >= now).sort(byNext).slice(0, 6);

  const open = (id: string) => nav.setParams(mergeParams(nav.params, { job: id }));
  const close = () => nav.setParams(mergeParams(nav.params, { job: null }));

  const columns: Column<ScheduledJob>[] = [
    {
      key: "job", header: "Job", nowrap: false,
      cell: (j) => (
        <div style={{ minWidth: 170 }}>
          <div style={{ color: "var(--ink)", fontWeight: 500, lineHeight: 1.35 }}>{j.name}</div>
          <div className="ph-wrap" style={{ gap: 5, marginTop: 3 }}>
            <span className="phf-id">{j.id}</span>
            <Tag icon={KIND[j.kind].icon}>{KIND[j.kind].label}</Tag>
            <span className="phf-note">{j.cadence}</span>
          </div>
          <div className="phf-small" style={{ marginTop: 4, color: j.status === "failed" ? "var(--bad)" : undefined }}>{j.lastResult}</div>
        </div>
      ),
    },
    { key: "last", header: "Last run", sort: (a, b) => ((a.lastRunAt || "") < (b.lastRunAt || "") ? -1 : 1), cell: (j) => j.lastRunAt ? <span className="ph-num" title={fmtDateTime(j.lastRunAt)}>{fmtShortDateTime(j.lastRunAt)}</span> : <span className="ph-faint">Not run yet</span> },
    { key: "next", header: "Next run", sort: byNext, cell: (j) => j.nextRunAt ? <span className="ph-num" title={fmtDateTime(j.nextRunAt)}>{fmtShortDateTime(j.nextRunAt)}</span> : <span className="ph-faint">No further run</span> },
    { key: "status", header: "Status", sort: (a, b) => statusRank(a) - statusRank(b), cell: (j) => <JobStatus j={j} /> },
  ];
  /* Narrow containers: last and next run move under the job name. */
  const narrowColumns: Column<ScheduledJob>[] = [
    {
      ...columns[0],
      cell: (j) => (
        <div>
          {columns[0].cell(j)}
          <div className="phf-note ph-num" style={{ marginTop: 4 }}>
            Last run {j.lastRunAt ? fmtShortDateTime(j.lastRunAt) : "not yet"}, next {j.nextRunAt ? fmtShortDateTime(j.nextRunAt) : "none scheduled"}
          </div>
        </div>
      ),
    },
    columns[3],
  ];

  const table = (
    <Card pad={false}>
      <DataTable rows={rows} columns={wide ? columns : narrowColumns} rowKey={(j) => j.id} onRowClick={(j) => open(j.id)} selectedKey={nav.params.job || null} caption="Scheduled jobs"
        footerNote="jobs. Simulated, no provider is called."
        empty={<EmptyState title="No jobs of this kind" icon="calendar">Choose another kind.</EmptyState>} />
    </Card>
  );

  const side = (
    <>
      <Card>
        <CardHeader title="Upcoming clinics" sub={`${clinics.length} sessions from today. Illustrative sites and dates.`} />
        <ul className="phf-list">
          {clinics.map((s) => {
            const st = sessionStats(state, s.id);
            return (
              <li key={s.id}>
                <button type="button" className="phf-rowbtn" style={{ padding: "4px 2px", flexDirection: "column", alignItems: "stretch", gap: 5 }} onClick={() => nav.go(linkFor("session", s.id))}>
                  <span className="ph-row-flex" style={{ gap: 8 }}>
                    <span className="ph-num" style={{ color: "var(--ink)", fontSize: 12.5, fontWeight: 500, whiteSpace: "nowrap" }}>{fmtWeekdayDate(s.date)}</span>
                    <Tag>{PROGRAMME_BY_ID[s.programmeId].code}</Tag>
                    {st.isToday ? <Tag accent>Today</Tag> : null}
                    <span className="ph-grow" />
                    <span className="ph-num phf-small"><span style={{ color: "var(--ink)" }}>{st.booked}</span> of {st.slots} booked</span>
                  </span>
                  <ProgressBar value={st.booked} max={st.slots} label={`${st.booked} of ${st.slots} slots booked`} />
                  <span className="phf-note">{s.siteName}, {s.start} to {s.end}, nurse {staffName(state, s.nurseId)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </Card>
      <Card>
        <CardHeader title="Next runs" sub="Soonest first, from the demo clock." />
        {nextRuns.length ? (
          <ul className="phf-list">
            {nextRuns.map((j) => (
              <li key={j.id}>
                <button type="button" className="phf-rowbtn" style={{ padding: "4px 2px" }} onClick={() => open(j.id)}>
                  <Icon name={KIND[j.kind].icon} size={14} style={{ color: "var(--faint)" }} />
                  <span className="ph-grow" style={{ fontSize: 12.5, color: "var(--ink)", lineHeight: 1.35 }}>{j.name}</span>
                  <span className="ph-num phf-small" style={{ whiteSpace: "nowrap" }}>{fmtWhen(j.nextRunAt!, now)}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : <div className="phf-note">No further runs are scheduled.</div>}
      </Card>
    </>
  );

  return (
    <div className="ph-page" ref={measure}>
      <PageHeader
        eyebrow="Work"
        title="Schedules"
        sub={`${jobs.length} scheduled jobs, ${failed ? `${failed} with a failed last run` : "none with a failed last run"}. Reminder, import and report jobs here are simulations and never contact a provider.`}
        actions={<DemoTag>Simulated jobs</DemoTag>}
      />
      <div className="ph-stack">
        <div className="phf-toolbar">
          <Chip on={kind === "all"} count={jobs.length} onClick={() => setKind("all")}>All jobs</Chip>
          {KIND_ORDER.map((k) => <Chip key={k} on={kind === k} count={jobs.filter((j) => j.kind === k).length} onClick={() => setKind(k)}>{KIND[k].label}</Chip>)}
        </div>
        {wide ? (
          <div className="ph-split">
            <div className="ph-stack">{table}</div>
            <div className="ph-stack">{side}</div>
          </div>
        ) : (
          <>
            {table}
            {side}
          </>
        )}
      </div>
      {nav.params.job ? <JobDrawer state={state} id={nav.params.job} onClose={close} /> : null}
    </div>
  );
}

function JobDrawer({ state, id, onClose }: { state: PhState; id: string; onClose: () => void }) {
  const nav = useNav();
  const p = usePersona();
  const j = (jobViews(state) as ScheduledJob[]).find((x) => x.id === id);
  if (!j) {
    return (
      <Drawer open onClose={onClose} title="Job not found">
        <EmptyState title={`No job ${id}`}>The schedule lists every simulated job.</EmptyState>
      </Drawer>
    );
  }
  const r = reminderStats(state);
  const actions: Array<{ label: string; go: () => void }> = [];
  if (j.id === "JOB-REM-TODAY" && r.failed) actions.push({ label: "Review failed reminders", go: () => nav.go({ page: "Participants", tab: "communications", params: { filter: "failed" } }) });
  if (j.kind === "review_checkpoint" && isClinicalViewer(p)) actions.push({ label: "Open the review queue", go: () => nav.go({ page: "Results", tab: "review" }) });
  if (j.linked) actions.push({ label: `Open ${refLabel(state, j.linked)}`, go: () => nav.go(linkFor(j.linked!.kind, j.linked!.id)) });
  return (
    <Drawer open onClose={onClose} title={j.name} sub={<span className="ph-wrap" style={{ gap: 6 }}><span className="phf-id">{j.id}</span><Tag icon={KIND[j.kind].icon}>{KIND[j.kind].label}</Tag><DemoTag>Simulated</DemoTag></span>}
      footer={<><Button variant="ghost" onClick={onClose}>Close</Button>{actions.map((a, i) => <Button key={a.label} variant={i === 0 ? "primary" : "secondary"} icon="arrow" onClick={a.go}>{a.label}</Button>)}</>}>
      <div className="ph-stack">
        <div className="ph-wrap" style={{ gap: 8 }}><JobStatus j={j} /></div>
        <div className={"phf-callout" + (j.status === "failed" ? " warn" : "")}>
          <Icon name={j.status === "failed" ? "alert" : "info"} size={15} style={{ color: j.status === "failed" ? "var(--warn)" : "var(--dim)", marginTop: 1 }} />
          <span>{j.lastResult}</span>
        </div>
        <dl className="phf-kv">
          <dt>Cadence</dt><dd>{j.cadence}</dd>
          <dt>Last run</dt><dd className="ph-num">{j.lastRunAt ? fmtDateTime(j.lastRunAt) : "Not run yet"}</dd>
          <dt>Next run</dt><dd className="ph-num">{j.nextRunAt ? `${fmtDateTime(j.nextRunAt)} (${fmtWhen(j.nextRunAt, state.clock.nowUtc)})` : "No further run"}</dd>
          <dt>Linked record</dt><dd>{j.linked ? <EntityLink kind={j.linked.kind} id={j.linked.id}>{refLabel(state, j.linked)}</EntityLink> : "None"}</dd>
          {j.id === "JOB-REM-TODAY" ? (<><dt>Reminder cohort</dt><dd className="ph-num">{`${r.logical} logical reminders: ${r.delivered} delivered, ${r.failed} failed. ${r.attempts} provider attempts, counted separately.`}</dd></>) : null}
        </dl>
        <div className="phf-note">Simulated job. It changes only local demo state and never contacts Esendex, Eurofins, Google Workspace or an email provider.</div>
      </div>
    </Drawer>
  );
}
