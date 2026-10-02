/* Programme detail: header and owners, weekly progress, clinic instances, the approved
   template, invitations, delivery milestones, report snapshots and recent activity. It links
   out to the module that owns each record instead of duplicating it. */
import type { ProgrammeId } from "../../model";
import {
  activityFeed, fmtDate, fmtDateTime, fmtTime, fmtWeekdayDate, fmtWhen, ix, linkFor, nowIso, plural, programmeCodes, programmeCounts, rate,
} from "../../model";
import { useNav } from "../../nav-context";
import { usePhState } from "../../store";
import { Button, Card, CardHeader, DataTable, DemoTag, EntityLink, Icon, Pill, Stacked } from "../../ui";
import type { Column } from "../../ui";
import type { SessionStats } from "../../model";
import { Note, SessionStatusPill, StaffLine, Stat, VersionPill, WindowBar } from "./common";
import {
  DRAFT_STATUS, REPORT_STATUS_LABEL, currentOf, draftOf, milestones, ownersOf, pendingOf, programmeReports, programmeSessions, reportMilestoneJobs,
  sessionConfig, shortSite, stageCounts, windowInfo,
} from "./model";
import { workflowSegments } from "./palette";
import { WeeklyProgress } from "./Weekly";

const vnum = (v: string) => { const [a, b] = v.split(".").map(Number); return (a || 0) * 1000 + (b || 0); };

function Header({ pid }: { pid: ProgrammeId }) {
  const s = usePhState();
  const nav = useNav();
  const p = ix(s).programmeById.get(pid)!;
  const c = programmeCounts(s, pid);
  const win = windowInfo(s, p);
  const at = s.appointmentTypes.find((a) => a.id === p.appointmentTypeId);
  const next = programmeSessions(s, pid).find((x) => !x.isPast);
  return (
    <Card>
      <div className="ph-row-flex" style={{ gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <span className="prg-code">{p.code}</span>
        <span className="prg-id ph-grow">{p.id}</span>
        <Pill tone={win.status === "in_progress" ? "brand" : "neutral"} icon="calendar">{win.label}</Pill>
      </div>
      <div className="ph-row-flex" style={{ alignItems: "flex-start", flexWrap: "wrap", gap: 14 }}>
        <div className="ph-grow" style={{ minWidth: 240 }}>
          <h2 className="ph-h1" style={{ fontSize: 19 }}>{p.name}</h2>
          <div className="prg-sub" style={{ fontSize: 12.5 }}>
            Client: <EntityLink kind="company" id={p.clientId}>{p.clientName}</EntityLink> (company record in Records).
            {" "}{at ? `Appointment type: ${at.name}, ${at.minutes} minutes. ` : ""}{p.sites.length === 1 ? "Site" : "Sites"}: {p.sites.join(" and ")}.
          </div>
          <div className="ph-faint" style={{ fontSize: 11.5, marginTop: 4 }}>Eligibility: {p.eligibility} Central invitation code {p.inviteCode}.</div>
        </div>
        <div className="ph-wrap">
          <Button size="sm" icon="mail" onClick={() => nav.go({ page: "Programmes", tab: "invitations", params: { programme: p.id } })}>Invitations</Button>
          <Button size="sm" icon="layers" onClick={() => nav.go({ page: "Programmes", tab: "forms-templates", params: { template: p.templateId } })}>Template</Button>
          <Button size="sm" icon="calendar" onClick={() => nav.go(next ? linkFor("session", next.session.id) : { page: "Clinics", tab: "schedule" })}>Clinic schedule</Button>
        </div>
      </div>
      <div style={{ marginTop: 14 }}><WindowBar win={win} /></div>
      <div className="prg-two" style={{ marginTop: 16 }}>
        <div>
          <div className="prg-label">Accountable owners</div>
          <div className="prg-owners">
            {ownersOf(s, p).map((o) => <StaffLine key={o.role} staff={o.staff} role={o.role} compact />)}
          </div>
        </div>
        <div>
          <div className="prg-label"><span className="ph-grow">Report workflow</span><span className="ph-num">{c.episodes} attended episodes</span></div>
          <Stacked segments={workflowSegments(c)} total={c.episodes} height={10} />
          <div className="ph-faint" style={{ fontSize: 11.5, marginTop: 8, lineHeight: 1.45 }}>
            {c.booked} booked of {c.capacity} slots ({rate(c.booked, c.capacity)}): {c.attended} attended and {c.upcoming} upcoming. Counts only; clinical detail stays in Results.
          </div>
        </div>
      </div>
    </Card>
  );
}

function ClinicTable({ pid }: { pid: ProgrammeId }) {
  const s = usePhState();
  const nav = useNav();
  const I = ix(s);
  const rows = programmeSessions(s, pid);
  const cols: Column<SessionStats>[] = [
    { key: "date", header: "Date", cell: (r) => <><EntityLink kind="session" id={r.session.id}>{fmtWeekdayDate(r.session.date)}</EntityLink><span className="prg-cell-sub">{r.session.start} to {r.session.end}</span></> },
    {
      key: "site", header: "Site and team", nowrap: false, cell: (r) => (
        <div style={{ minWidth: 110, lineHeight: 1.35 }}>
          <span style={{ color: "var(--ink)" }}>{shortSite(r.session)}</span>
          <span className="prg-cell-sub">{I.staffById.get(r.session.nurseId)?.name}{r.session.supportIds.length ? ` with ${r.session.supportIds.map((x) => I.staffById.get(x)?.name).join(", ")}` : ""}</span>
        </div>
      ),
    },
    {
      key: "booked", header: "Booked", align: "right", cell: (r) => (
        <>
          <span className="ph-num" style={{ color: "var(--ink)" }}>{r.booked} of {r.slots}</span>
          <span className="prg-cell-sub">{r.isPast ? `${r.completed} attended` : `${r.available} available`}</span>
        </>
      ),
    },
    { key: "status", header: "Status", cell: (r) => <SessionStatusPill s={r} /> },
  ];
  const past = rows.filter((r) => r.isPast).length;
  return (
    <Card pad={false}>
      <div style={{ padding: "14px 16px 12px" }}>
        <h3 className="ph-h2">Clinic instances</h3>
        <div className="ph-dim" style={{ fontSize: 12, marginTop: 3 }}>{rows.length} sessions: {past} completed, {rows.length - past} today or later. Select a session to open it in Clinics. Breaks are never bookable; sites and dates are illustrative.</div>
      </div>
      <div style={{ borderTop: "1px solid var(--border)" }}>
        <DataTable rows={rows} columns={cols} rowKey={(r) => r.session.id} pageSize={25} caption="Clinic instances" onRowClick={(r) => nav.go(linkFor("session", r.session.id))} />
      </div>
    </Card>
  );
}

/** The clinic-day configuration every session of the programme is generated from. */
function SessionPreview({ pid }: { pid: ProgrammeId }) {
  const s = usePhState();
  const p = ix(s).programmeById.get(pid)!;
  const cfg = sessionConfig(s, pid);
  if (!cfg) return null;
  const at = s.appointmentTypes.find((a) => a.id === p.appointmentTypeId);
  const t = s.forms.templates.find((x) => x.id === p.templateId);
  return (
    <Card>
      <CardHeader title="Session preview" sub={cfg.uniform ? `The clinic day used by all ${cfg.sessions} sessions. Slots are derived from it.` : "The next session's clinic day. Sessions in this programme differ."} />
      <div className="prg-stats prg-stats-2">
        <Stat label="Available time" value={cfg.availableMinutes} sub="bookable minutes per session" />
        <Stat label="Capacity" value={cfg.capacity} sub={`${cfg.slotMinutes}-minute appointments`} />
      </div>
      <div className="prg-kv">
        <div><span>Clinic window</span><span>{cfg.start} to {cfg.end}</span></div>
        <div><span>Breaks</span><span>{cfg.breaks.length ? cfg.breaks.map((b) => `${b.start} to ${b.end}`).join(", ") : "None"}</span></div>
        <div><span>Appointment type</span><span>{at ? `${at.name}, ${at.minutes} minutes` : p.appointmentTypeId}</span></div>
        <div><span>Questionnaire and form</span><span>{t ? `${t.name} v${t.currentVersion}` : p.templateId}</span></div>
        <div><span>Consent</span><span>{cfg.consentVersions.length ? cfg.consentVersions.join(", ") : "No bookings yet"}</span></div>
        <div><span>Booking access</span><span>Invitation only, code {p.inviteCode}</span></div>
        <div><span>Reminder</span><span>{s.settings.reminderLeadHours} hours before</span></div>
      </div>
      <div style={{ marginTop: 10 }}>
        <Note tone="neutral" icon="info">Slots are generated around breaks, and breaks are never bookable. A session with bookings cannot be changed silently: an edit lists the affected appointments first and nothing is deleted.</Note>
      </div>
    </Card>
  );
}

function TemplateCard({ pid }: { pid: ProgrammeId }) {
  const s = usePhState();
  const p = ix(s).programmeById.get(pid)!;
  const t = s.forms.templates.find((x) => x.id === p.templateId);
  if (!t) return null;
  const cur = currentOf(t);
  const draft = draftOf(t), pending = pendingOf(t);
  const eps: Record<string, number> = {}, ups: Record<string, number> = {};
  s.episodes.forEach((e) => { if (e.programmeId === pid && e.formSnapshot.templateId === t.id) eps[e.formSnapshot.version] = (eps[e.formSnapshot.version] || 0) + 1; });
  s.bookings.forEach((b) => { if (b.programmeId === pid && b.formTemplateId === t.id && b.status === "confirmed" && b.attendance !== "completed" && b.attendance !== "no_show") ups[b.formVersion] = (ups[b.formVersion] || 0) + 1; });
  const blockName = (id: string) => s.forms.blocks.find((b) => b.id === id)?.name || id;
  return (
    <Card>
      <CardHeader title="Approved template" right={cur ? <VersionPill status={cur.status} /> : null} />
      <div style={{ fontSize: 13, color: "var(--ink)", fontWeight: 500 }}>{t.name} <span className="ph-faint" style={{ fontWeight: 400 }}>v{t.currentVersion}</span></div>
      <div className="ph-dim" style={{ fontSize: 12, marginTop: 4, lineHeight: 1.45 }}>
        {cur ? `${cur.blocks.length} blocks: ${cur.blocks.map((b) => `${blockName(b.blockId)} ${b.version}`).join(", ")}.` : ""}
      </div>
      <div className="ph-stack" style={{ gap: 4, marginTop: 10, fontSize: 12 }}>
        {Object.keys({ ...eps, ...ups }).sort((a, b) => vnum(b) - vnum(a)).map((v) => (
          <div key={v} className="ph-row-flex" style={{ gap: 8 }}>
            <span className="prg-tag prg-tag-on">v{v}</span>
            <span className="ph-dim">{plural(eps[v] || 0, "episode")} collected, {plural(ups[v] || 0, "upcoming booking")}</span>
          </div>
        ))}
      </div>
      <div className="ph-faint" style={{ fontSize: 11.5, marginTop: 8, lineHeight: 1.45 }}>
        New bookings use v{t.currentVersion}. Existing episodes keep the version they were collected on.
        {draft ? ` Draft v${draft.version} is being edited and is not used until approved.` : ""}
        {pending ? ` v${pending.version} is awaiting publication approval.` : ""}
      </div>
      <div style={{ marginTop: 10, fontSize: 12.5 }}><EntityLink kind="template" id={t.id}>Open in Forms and Templates</EntityLink></div>
    </Card>
  );
}

function InvitationsCard({ pid }: { pid: ProgrammeId }) {
  const s = usePhState();
  const nav = useNav();
  const codes = programmeCodes(s, pid);
  const drafts = s.invitationDrafts.filter((d) => d.programmeId === pid);
  const st = stageCounts(s, pid);
  return (
    <Card>
      <CardHeader title="Invitations" sub="Codes are managed centrally. Using a code never reveals the employer's participant list." />
      <div className="ph-stack" style={{ gap: 8 }}>
        {codes.map((c) => (
          <div key={c.code.id} className="ph-row-flex" style={{ gap: 8, fontSize: 12, alignItems: "flex-start" }}>
            <span className="prg-mono" style={{ color: "var(--ink)", minWidth: 0, overflowWrap: "anywhere" }}>{c.code.code}</span>
            <span className="ph-grow" />
            <Pill tone={c.code.status === "active" && !c.expired ? "ok" : c.code.status === "revoked" ? "bad" : "neutral"} icon={c.code.status === "revoked" ? "x" : c.expired ? "clock" : "check"}>
              {c.code.status === "revoked" ? "Revoked" : c.expired ? "Expired" : "Active"}
            </Pill>
          </div>
        ))}
      </div>
      <div className="ph-faint" style={{ fontSize: 11.5, marginTop: 8 }}>
        Invitees: {st.invited} not started, {st.onboarding} questionnaire in progress, {st.upcoming} booked, {st.attended} attended.
      </div>
      <div className="prg-divider" style={{ margin: "12px 0 10px" }} />
      {drafts.length ? drafts.slice().reverse().map((d) => (
        <div key={d.id} className="ph-row-flex" style={{ gap: 8, fontSize: 12, marginBottom: 6 }}>
          <Icon name="mail" size={13} style={{ color: "var(--faint)" }} />
          <span className="ph-grow ph-dim" style={{ minWidth: 0 }}><EntityLink kind="invitation" id={d.id}>{d.id}</EntityLink>, {d.recipientIds.length} recipients</span>
          <Pill tone={DRAFT_STATUS[d.status].tone}>{DRAFT_STATUS[d.status].label}</Pill>
        </div>
      )) : <div className="ph-faint" style={{ fontSize: 12 }}>No invitation drafts for this programme.</div>}
      <div style={{ marginTop: 10 }}>
        <Button size="sm" variant="ghost" icon="arrow" onClick={() => nav.go({ page: "Programmes", tab: "invitations", params: { programme: pid } })}>Open invitations</Button>
      </div>
    </Card>
  );
}

function MilestoneCard({ pid }: { pid: ProgrammeId }) {
  const s = usePhState();
  const nav = useNav();
  const list = milestones(s, pid);
  return (
    <Card>
      <CardHeader title="Delivery milestones" right={<DemoTag>Illustrative</DemoTag>} />
      <ul className="prg-tl">
        {list.map((m) => (
          <li key={m.key} data-state={m.state}>
            <span className="prg-tl-dot" aria-hidden="true" />
            <div className="prg-tl-top">
              {m.target ? <button type="button" className="ph-link" onClick={() => nav.go(m.target!)}>{m.label}</button> : <span>{m.label}</span>}
              <span className="prg-tl-date">{fmtWeekdayDate(m.date)}{m.state === "done" ? ", done" : m.state === "today" ? ", today" : ""}</span>
              {m.simulated ? <span className="prg-tag">Simulated job</span> : null}
            </div>
            <div className="prg-tl-detail">{m.detail}</div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ReportsCard({ pid }: { pid: ProgrammeId }) {
  const s = usePhState();
  const reps = programmeReports(s, pid);
  const next = reportMilestoneJobs(s, pid).find((j) => j.nextRunAt && j.nextRunAt >= nowIso(s));
  return (
    <Card>
      <CardHeader title="Report snapshots" sub="Employer reports use released reports only and a disclosure-controlled snapshot." />
      {reps.length ? reps.map((r) => {
        const ex = s.exports.filter((e) => e.reportId === r.id);
        return (
          <div key={r.id} className="ph-stack" style={{ gap: 5, fontSize: 12 }}>
            <div className="ph-row-flex" style={{ gap: 8 }}>
              <EntityLink kind="employer_report" id={r.id}>{r.id}</EntityLink>
              <span className="ph-faint">v{r.version}</span>
              <span className="ph-grow" />
              <Pill tone={r.status === "approved" || r.status === "exported" ? "ok" : r.status === "reviewed" ? "info" : "warn"} icon={r.status === "draft" ? "clock" : "check"}>
                {r.status === "draft" ? "Draft" : r.status === "reviewed" ? "Reviewed" : r.status === "approved" ? "Approved" : "Exported"}
              </Pill>
            </div>
            <div style={{ color: "var(--ink)" }}>{r.title}</div>
            <div className="ph-dim" style={{ lineHeight: 1.45 }}>{REPORT_STATUS_LABEL[r.status]}. Period {fmtDate(r.periodStart)} to {fmtDate(r.periodEnd)}. Data as of {fmtDateTime(r.dataAsOf)}.</div>
            <div className="ph-faint" style={{ lineHeight: 1.45 }}>
              {r.snapshot ? `Snapshot frozen ${fmtDateTime(r.snapshot.at)}, so print and PowerPoint previews match.` : "Snapshot is frozen at clinician approval."}
              {" "}{ex.length ? `${ex.length} export preview${ex.length === 1 ? "" : "s"} created.` : "No exports yet."}
            </div>
          </div>
        );
      }) : (
        <div className="ph-dim" style={{ fontSize: 12, lineHeight: 1.5 }}>
          No employer report has been started.{next ? ` Next milestone: ${next.name}, ${fmtWeekdayDate(next.nextRunAt!)}.` : ""}
        </div>
      )}
    </Card>
  );
}

function ActivityCard({ pid }: { pid: ProgrammeId }) {
  const s = usePhState();
  const now = nowIso(s);
  const list = activityFeed(s, { programmeId: pid }).slice(0, 6);
  return (
    <Card>
      <CardHeader title="Recent programme activity" sub="From the append-only activity history. Clinical events show only what this role may see." />
      <div className="ph-stack" style={{ gap: 10 }}>
        {list.map((v) => (
          <div key={v.event.id} className="ph-row-flex" style={{ alignItems: "flex-start", gap: 10, fontSize: 12 }}>
            <span className="ph-faint ph-num" style={{ flex: "none", width: 92 }}>{fmtWhen(v.event.at, now).replace(/^(\w+ \d+ \w+), /, "$1 ")}</span>
            <span className="ph-grow" style={{ color: "var(--body)", lineHeight: 1.45 }}>
              {v.text}
              {v.event.simulated ? <> <DemoTag>Simulated</DemoTag></> : null}
            </span>
          </div>
        ))}
        {!list.length ? <div className="ph-faint" style={{ fontSize: 12 }}>No activity recorded for this programme yet.</div> : null}
      </div>
      <div className="ph-faint" style={{ fontSize: 11, marginTop: 10 }}>Times are Europe/Dublin. Demo clock {fmtTime(now)}.</div>
    </Card>
  );
}

export function ProgrammeDetail({ pid }: { pid: ProgrammeId }) {
  const s = usePhState();
  const p = ix(s).programmeById.get(pid);
  if (!p) return null;
  return (
    <>
      <Header pid={pid} />
      <div className="prg-split">
        <div>
          <Card>
            <CardHeader title="Weekly progress" sub="Capacity, bookings, attendance and the report workflow for each week of the programme window." />
            <WeeklyProgress pid={pid} height={130} />
          </Card>
          <ClinicTable pid={pid} />
          <ActivityCard pid={pid} />
        </div>
        <div>
          <SessionPreview pid={pid} />
          <TemplateCard pid={pid} />
          <InvitationsCard pid={pid} />
          <MilestoneCard pid={pid} />
          <ReportsCard pid={pid} />
        </div>
      </div>
    </>
  );
}
