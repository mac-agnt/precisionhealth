/* Programmes, Overview: the snapshot reconciliation, three programme cards, week-by-week
   progress (Sisk by default), today's clinic capacity, the IBM capacity story (ST-03) and the
   next delivery milestones. Every number comes from shared selectors. */
import { useState } from "react";
import type { ProgrammeId } from "../../model";
import {
  PROGRAMME_ORDER, fmtDateLong, fmtTime, fmtWeekdayDate, ix, localDateOf, nowIso, rate, sessionStats, storyView, today, todaySessions,
  todayStats, totalCounts,
} from "../../model";
import { useNav } from "../../nav-context";
import { usePhState } from "../../store";
import { Button, Card, CardHeader, DemoTag, EntityLink, Icon, Kpi, KpiStrip, PageHeader, Pill, ProgressBar, Segmented, Stacked } from "../../ui";
import { ClinicLine, StaffLine, Stat, WindowBar } from "./common";
import { DRAFT_STATUS, ownersOf, programmeRows, programmeSessions, reportMilestoneJobs, shortSite, upcomingSessions } from "./model";
import type { ProgrammeRow } from "./model";
import { workflowSegments } from "./palette";
import { WeeklyProgress } from "./Weekly";

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

function ProgrammeCard({ row }: { row: ProgrammeRow }) {
  const s = usePhState();
  const nav = useNav();
  const { p, counts: c, win } = row;
  const up = upcomingSessions(s, p.id);
  const shown = up.slice(0, 3);
  const finalWeek = win.status === "in_progress" && win.weekNo === win.weeks;
  return (
    <Card className="prg-pcard">
      <div>
        <div className="ph-row-flex" style={{ gap: 8, marginBottom: 8 }}>
          <span className="prg-code">{p.code}</span>
          <span className="prg-id ph-grow ph-trunc">{p.id}</span>
          <Pill tone={win.status === "in_progress" ? "brand" : "neutral"} icon="calendar">{finalWeek ? `Final week, ${win.weekNo} of ${win.weeks}` : win.label}</Pill>
        </div>
        <h3 className="prg-title">{p.name}</h3>
        <div className="prg-sub">
          Client <EntityLink kind="company" id={p.clientId}>{p.clientName}</EntityLink>, {p.sites.length === 1 ? "1 site" : `${p.sites.length} sites`}, {row.clinics.total} clinics
        </div>
      </div>
      <WindowBar win={win} />
      <div className="prg-stats">
        <Stat label="Invited" value={c.invited} sub="eligible" title="Unique eligible people on the programme roster. Invited is not booked." />
        <Stat label="Booked" value={c.booked} sub={`${rate(c.booked, c.capacity)} of ${c.capacity}`}
          title={`All confirmed bookings, including completed appointments: ${c.booked} of ${c.capacity} slots across ${row.clinics.total} clinics.`} />
        <Stat label="Attended" value={c.attended} sub={`${c.upcoming} to attend`} title={`${c.booked} booked = ${c.attended} attended + ${c.upcoming} upcoming confirmed appointments.`} />
        <Stat label="Released" value={c.released} sub={`${rate(c.released, c.attended)} of ${c.attended}`} title={`Individual reports released, out of ${c.attended} attended episodes.`} />
      </div>
      <div>
        <div className="prg-label">Report workflow for {c.episodes} attended episodes</div>
        <Stacked segments={workflowSegments(c)} total={c.episodes} height={8} />
      </div>
      <div>
        <div className="prg-label"><span className="ph-grow">Upcoming clinics</span><span className="ph-num">{up.length} of {row.clinics.total}</span></div>
        {shown.length ? shown.map((x) => <ClinicLine key={x.session.id} s={x} />) : <div className="ph-faint" style={{ fontSize: 12 }}>No upcoming clinics.</div>}
        {up.length > shown.length ? (
          <button type="button" className="ph-link" style={{ fontSize: 12, marginTop: 4 }} onClick={() => nav.go({ page: "Programmes", tab: "programmes", params: { programme: p.id } })}>
            {up.length - shown.length} more in the programme detail
          </button>
        ) : null}
      </div>
      <div>
        <div className="prg-label">Accountable owners</div>
        <div className="prg-owners">
          {ownersOf(s, p).map((o) => <StaffLine key={o.role} staff={o.staff} role={o.role} compact />)}
        </div>
      </div>
      <div className="ph-wrap" style={{ marginTop: "auto" }}>
        <Button size="sm" variant="primary" icon="arrow" onClick={() => nav.go({ page: "Programmes", tab: "programmes", params: { programme: p.id } })}>Open programme</Button>
        <Button size="sm" icon="mail" onClick={() => nav.go({ page: "Programmes", tab: "invitations", params: { programme: p.id } })}>Invitations</Button>
      </div>
    </Card>
  );
}

function TodayCard() {
  const s = usePhState();
  const I = ix(s);
  const d = todayStats(s);
  const total = totalCounts(s);
  const list = todaySessions(s).map((x) => sessionStats(s, x.id));
  return (
    <Card>
      <CardHeader title="Today's clinics" sub={`${fmtDateLong(today(s))}. ${d.booked} of ${d.capacity} slots booked (${rate(d.booked, d.capacity)}), ${d.available} available.`} />
      <div className="ph-stack" style={{ gap: 12 }}>
        {list.map((x) => (
          <div key={x.session.id}>
            <div className="ph-row-flex" style={{ gap: 8, fontSize: 12.5, marginBottom: 6 }}>
              <span className="prg-code">{x.programme.code}</span>
              <span className="ph-grow" style={{ minWidth: 0 }}><EntityLink kind="session" id={x.session.id}>{shortSite(x.session)}</EntityLink></span>
              <span className="ph-num" style={{ color: "var(--ink)", fontWeight: 600 }}>{x.booked} of {x.slots}</span>
            </div>
            <ProgressBar value={x.booked} max={x.slots} label={`${x.programme.code} clinic today: ${x.booked} of ${x.slots} booked`} />
            <div className="ph-faint" style={{ fontSize: 11, marginTop: 5 }}>
              {I.staffById.get(x.session.nurseId)?.name}{x.session.supportIds.length ? `, support ${x.session.supportIds.map((id) => I.staffById.get(id)?.name.split(" ")[0]).join(", ")}` : ""}. {x.available} available capacity.
            </div>
          </div>
        ))}
        {!list.length ? <div className="ph-faint" style={{ fontSize: 12 }}>No clinics today.</div> : null}
      </div>
      <div className="ph-faint" style={{ fontSize: 11.5, marginTop: 12, lineHeight: 1.45 }}>
        Today's utilisation is a different measure from programme capacity booked ({total.booked} of {total.capacity}, {rate(total.booked, total.capacity)}).
      </div>
    </Card>
  );
}

function CapacityStory() {
  const s = usePhState();
  const nav = useNav();
  const st = storyView(s, "ST-03");
  const drafts = s.invitationDrafts.filter((d) => d.programmeId === "PRG-IBM-26");
  // The draft that carries the decision: one still pending, else the latest approved, else the latest.
  const latest = drafts.slice().reverse().find((d) => d.status === "pending_approval" || d.status === "draft")
    || drafts.slice().reverse().find((d) => d.status === "approved_simulated_sent") || drafts[drafts.length - 1];
  const decided = latest && latest.status !== "pending_approval" && latest.status !== "draft";
  return (
    <Card>
      <div className="ph-row-flex" style={{ gap: 8, marginBottom: 8 }}>
        <Pill tone={st.open ? "info" : "ok"} icon={st.open ? "flag" : "check"}>{st.open ? "Decision open" : "Decision recorded"}</Pill>
        <span className="prg-id ph-grow">{st.def.id}</span>
        {st.open && st.dueAt ? <span className="ph-faint" style={{ fontSize: 11.5 }}>Due {fmtTime(st.dueAt)}</span> : null}
      </div>
      <h3 className="prg-title">{st.headline}</h3>
      <div className="prg-sub">{st.detail}</div>
      <div className="prg-owners" style={{ marginTop: 12 }}>
        <StaffLine staff={ix(s).staffById.get(st.def.ownerId)} role="Capacity decision" compact />
        <StaffLine staff={st.def.secondaryOwnerId ? ix(s).staffById.get(st.def.secondaryOwnerId) : undefined} role="Invitation preparation" compact />
      </div>
      {latest ? (
        <div className="ph-row-flex" style={{ gap: 8, marginTop: 12, fontSize: 12 }}>
          <Icon name="mail" size={13} style={{ color: "var(--faint)" }} />
          <span className="ph-grow ph-dim" style={{ minWidth: 0 }}>{latest.id}, {latest.recipientIds.length} recipients</span>
          <Pill tone={DRAFT_STATUS[latest.status].tone}>{DRAFT_STATUS[latest.status].label}</Pill>
        </div>
      ) : null}
      <div className="ph-wrap" style={{ marginTop: 12 }}>
        <Button size="sm" variant={st.open ? "primary" : "secondary"} icon="arrow" onClick={() => nav.go(latest ? { page: "Programmes", tab: "invitations", params: { draft: latest.id } } : st.target)}>
          {decided ? "See the decision" : "Review invitation draft"}
        </Button>
      </div>
    </Card>
  );
}

function MilestonesCard() {
  const s = usePhState();
  const nav = useNav();
  const now = nowIso(s);
  const jobs = reportMilestoneJobs(s).filter((j) => (j.nextRunAt || "") >= now).slice(0, 4);
  const progOf = (id: string, kind: string) => kind === "programme" ? ix(s).programmeById.get(id) : ix(s).programmeById.get(s.employerReports.find((r) => r.id === id)?.programmeId || "");
  return (
    <Card>
      <CardHeader title="Next delivery milestones" right={<DemoTag>Simulated schedule</DemoTag>} />
      <ul className="prg-tl">
        {jobs.map((j) => {
          const p = j.linked ? progOf(j.linked.id, j.linked.kind) : undefined;
          return (
            <li key={j.id} data-state={localDateOf(j.nextRunAt!) === today(s) ? "today" : "upcoming"}>
              <span className="prg-tl-dot" aria-hidden="true" />
              <div className="prg-tl-top">
                <span>{j.name}</span>
              </div>
              <div className="prg-tl-date">{fmtWeekdayDate(j.nextRunAt!)}, {fmtTime(j.nextRunAt!)}{p ? `, ${p.code}` : ""}</div>
              <div className="prg-tl-detail">{j.lastResult}</div>
            </li>
          );
        })}
      </ul>
      {!jobs.length ? <div className="ph-faint" style={{ fontSize: 12 }}>No upcoming report milestones.</div> : null}
      <div style={{ marginTop: 10 }}>
        <Button size="sm" variant="ghost" icon="calendar" onClick={() => nav.go({ page: "Work", tab: "schedules" })}>All schedules</Button>
      </div>
    </Card>
  );
}

export default function Overview() {
  const s = usePhState();
  const nav = useNav();
  const t = totalCounts(s);
  const rows = programmeRows(s);
  const [weeksFor, setWeeksFor] = useState<ProgrammeId>("PRG-SISK-26");
  const wp = ix(s).programmeById.get(weeksFor)!;
  const wRow = rows.find((r) => r.p.id === weeksFor);
  const weeks = wRow?.win.weeks || 0;
  const slotsEach = programmeSessions(s, weeksFor)[0]?.slots || 0;
  const bookedPeople = t.invited - t.notStarted - t.drafts;
  return (
    <div className="ph-page prg-page">
      <PageHeader
        title="Programme overview"
        sub={`${rows.length} screening programmes in the current snapshot, each with its own roster, clinics and report workflow. Every count comes from the shared programme store.`}
        actions={<><DemoTag>Fictional programme data</DemoTag><Button icon="list" onClick={() => nav.go({ page: "Programmes", tab: "programmes" })}>Programme register</Button></>}
      />
      <div className="prg-cq">
        <KpiStrip>
          <Kpi label="Invited" value={t.invited} icon="users"
            sub={`${t.notStarted} not started, ${t.drafts} questionnaires in progress, ${bookedPeople} booked`}
            hint="Unique eligible people across the three programme rosters. Invited is not booked." />
          <Kpi label="Booked" value={t.booked} icon="calendar"
            sub={`of ${t.capacity} capacity (${rate(t.booked, t.capacity)}). ${t.attended} attended + ${t.upcoming} upcoming`}
            hint="All confirmed bookings, including completed appointments. It is not the number still to attend." />
          <Kpi label="Attended" value={t.attended} icon="check"
            sub={`${t.episodes} screening episodes, one per attended appointment`}
            hint="Completed appointments. Each attended appointment has one screening episode in this snapshot." />
          <Kpi label="Released" value={t.released} icon="file"
            sub={`of ${t.episodes} episodes. ${t.ready} ready, ${t.awaiting} awaiting, ${t.onHold} on hold`}
            hint="Report workflow states are mutually exclusive: released, ready for review, awaiting results and on hold add up to the attended episodes." />
        </KpiStrip>
        <div className="prg-cards">
          {rows.map((r) => <ProgrammeCard key={r.p.id} row={r} />)}
        </div>
        <div className="prg-split">
          <div>
            <Card>
              <CardHeader
                title={`${wp.name}: ${WORDS[weeks] || weeks}-week progress`}
                sub={`Window ${wRow?.win.rangeLabel}. ${wRow?.clinics.total} clinics of ${slotsEach} slots. ${wRow?.win.label}.`}
                right={<Segmented<ProgrammeId> label="Programme" value={weeksFor} onChange={setWeeksFor}
                  options={PROGRAMME_ORDER.map((id) => ({ id, label: ix(s).programmeById.get(id)?.code || id }))} />}
              />
              <WeeklyProgress pid={weeksFor} />
            </Card>
          </div>
          <div>
            <CapacityStory />
            <TodayCard />
            <MilestonesCard />
          </div>
        </div>
        <div className="ph-faint" style={{ fontSize: 11.5, lineHeight: 1.5 }}>
          Reconciliation: {t.booked} booked = {t.attended} attended + {t.upcoming} upcoming. {t.episodes} episodes = {t.released} released + {t.ready} ready + {t.awaiting} awaiting + {t.onHold} on hold.
          {" "}{t.invited} invited = {t.notStarted} not started + {t.drafts} in progress + {bookedPeople} booked. Sites, dates and schedules are illustrative.
        </div>
      </div>
    </div>
  );
}
