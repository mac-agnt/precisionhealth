/* Clinics, Today: a list to work through, not a page of numbers. First everything that needs a
   person today (preparation tasks, failed reminders, free slots to fill, overlaps), each with one
   button; then one card per clinic and the slot board. Numbers and KPIs live on the Dashboard. */
import type { ReactNode } from "react";
import type { ClinicSession, NavTarget } from "../../model";
import {
  act, activeBookings, dublinToUtc, fmtDateLong, fmtTime, fmtWeekdayDate, plural, programmeCounts, rate, sessionStats, staffName, storyView,
  today, todaySessions, todayStats,
} from "../../model";
import { dispatch, usePersona, usePhState } from "../../store";
import { useNav } from "../../nav-context";
import { Avatar, Button, Card, CardHeader, Icon, InfoTip, PageHeader, Pill, ProgressBar } from "../../ui";
import {
  bookableMinutes, minutesLabel, onboardingInvitees, placeLabel, reminderByBooking, reminderJob, roomClashes, sessionReadiness, sessionTasks, staffConflicts,
  upcomingSessions,
} from "./selectors";
import type { ReadyItem } from "./selectors";
import { ProgTag, SlotLegend, SlotTimeline, StateIcon } from "./shared";
import { requestNursePortalNurse } from "../NursePortal/data";
import { PersonLink, ProgrammeLink } from "../links";

export default function Overview() {
  const state = usePhState();
  const nav = useNav();
  const t = today(state);
  const sessions = todaySessions(state);
  const ds = todayStats(state);
  const openAppt = (bookingId: string) => nav.go({ page: "Clinics", tab: "appointments", params: { booking: bookingId } });

  return (
    <div className="ph-page">
      <div className="clx">
        <PageHeader
          eyebrow={fmtDateLong(t)}
          title="Today's clinics"
          sub={sessions.length ? `${plural(ds.sessions, "clinic")} today, ${ds.booked} of ${ds.capacity} appointments booked. Work through the list, then open a clinic's day list.` : "No clinics today."}
          actions={<>
            {nav.openNursePortal ? <Button icon="heart" onClick={nav.openNursePortal} title="Open the tablet nurse portal: check in, the nurse form, specimens and clinic close">Open nurse portal</Button> : null}
            <Button icon="calendar" onClick={() => nav.go({ page: "Clinics", tab: "schedule", params: { date: t } })}>Schedule</Button>
            <Button variant="primary" icon="list" onClick={() => nav.go({ page: "Clinics", tab: "appointments", params: { date: t } })}>Today's appointments</Button>
          </>}
        />

        <TodoList />

        {sessions.length ? (
          <div className="clx-cards">
            {sessions.map((s) => <ClinicCard key={s.id} session={s} />)}
          </div>
        ) : null}

        <div className="clx-split">
          {sessions.length ? (
            <Card>
              <CardHeader title="Today's slots" sub="One bar per clinic. Select a booked slot to open the appointment." />
              <div className="ph-stack" style={{ gap: 14 }}>
                {sessions.map((s) => {
                  const st = sessionStats(state, s.id);
                  return (
                    <div key={s.id} className="clx-tlrow">
                      <div style={{ minWidth: 0 }}>
                        <div className="ph-row-flex" style={{ gap: 7 }}>
                          <ProgTag code={st.programme.code} />
                          <span className="ph-num" style={{ fontSize: 12, color: "var(--ink)" }}>{st.booked} of {st.slots}</span>
                        </div>
                        <div className="ph-faint ph-trunc" style={{ fontSize: 11, marginTop: 3 }}>{staffName(state, s.nurseId)}</div>
                      </div>
                      <SlotTimeline session={s} onSlot={openAppt} />
                    </div>
                  );
                })}
                <SlotLegend />
              </div>
            </Card>
          ) : <div />}
          <UpcomingStaffing />
        </div>
      </div>
    </div>
  );
}

/* ---- the to-do list ---- */

interface Todo { key: string; state: ReadyItem["state"]; title: ReactNode; sub?: ReactNode; clinic?: string; action?: ReactNode }

function useTodos(): Todo[] {
  const state = usePhState();
  const nav = useNav();
  const p = usePersona();
  const t = today(state);
  const sessions = todaySessions(state);
  const out: Todo[] = [];
  const rm = reminderByBooking(state);

  // Free slots in today's IBM clinic and the invitees part-way through the questionnaire.
  const ibm = sessions.find((s) => s.programmeId === "PRG-IBM-26");
  if (ibm) {
    const st = sessionStats(state, ibm.id);
    const st03 = storyView(state, "ST-03");
    const invitees = onboardingInvitees(state, "PRG-IBM-26");
    if (st.available > 0) {
      out.push({
        key: "ibm-free", state: "info", clinic: st.programme.code,
        title: `${plural(st.available, "free slot")} in today's IBM clinic`,
        sub: invitees.length ? (
          <>
            {plural(invitees.length, "invitee")} {invitees.length === 1 ? "is" : "are"} part-way through the questionnaire:{" "}
            {invitees.map((x, i) => (
              <span key={x.person.id}>{i ? ", " : ""}<button type="button" className="ph-link" onClick={() => nav.openPortal(x.person.id)} title={`Open the participant portal as ${x.person.given} ${x.person.family}`}>{x.person.given} {x.person.family}</button></span>
            ))}. They are not bookings until the questionnaire and consent are done.
          </>
        ) : "Fill them from the invitation list.",
        action: <Button size="sm" variant="primary" onClick={() => nav.go(st03.target)}>Decide on invitations</Button>,
      });
    }
  }

  for (const s of sessions) {
    const code = sessionStats(state, s.id).programme.code;
    // Failed reminders, one row per person.
    for (const b of activeBookings(state, s.id)) {
      const m = rm.get(b.id);
      if (!m || m.status !== "failed") continue;
      const last = m.attempts[m.attempts.length - 1];
      out.push({
        key: m.id, state: "warn", clinic: code,
        title: <>Reminder failed for <PersonLink id={b.personId} /> at {b.slotStart}</>,
        sub: last?.reason ? `${last.reason}.` : undefined,
        action: <Button size="sm" onClick={() => nav.go({ page: "Participants", tab: "communications", params: { message: m.id } })}>Review</Button>,
      });
    }
    // Readiness problems that are not tasks or reminders (tasks get their own rows below).
    for (const r of sessionReadiness(state, s.id)) {
      if (r.task || r.key === "reminders" || r.state === "done" || r.state === "info") continue;
      out.push({ key: `${s.id}-${r.key}`, state: r.state, clinic: code, title: r.label === "Questionnaire and consent complete" ? "Questionnaires or consent missing" : r.label, sub: r.detail,
        action: r.target ? <Button size="sm" onClick={() => nav.go(r.target as NavTarget)}>Review</Button> : <Button size="sm" variant="ghost" onClick={() => nav.go({ page: "Clinics", tab: "schedule", params: { view: "day", date: s.date, session: s.id } })}>Open session</Button> });
    }
    // Preparation tasks.
    for (const x of sessionTasks(state, s.id).filter((x) => x.status !== "done")) {
      out.push({
        key: x.task.id, state: x.overdue ? "warn" : "open", clinic: code, title: x.title,
        sub: <>{x.ownerName}{x.task.dueAt ? `, due ${fmtTime(x.task.dueAt)}` : ""}{x.overdue ? ", overdue" : ""}</>,
        action: <Button size="sm" disabled={!x.canMarkDone} onClick={() => dispatch(act.completeTask(x.task.id))}
          title={x.canMarkDone ? "Mark this preparation task done" : `Only ${x.ownerName} or a supervisor can mark this done. You are viewing as ${p.name}.`}>Mark done</Button>,
      });
    }
  }
  void t;
  return out.sort((a, b) => rank(a.state) - rank(b.state));
}
const rank = (s: ReadyItem["state"]) => (s === "warn" ? 0 : s === "open" ? 1 : 2);

function TodoList() {
  const todos = useTodos();
  return (
    <Card>
      <CardHeader title={todos.length ? `To do today, ${todos.length}` : "To do today"} sub={todos.length ? "Most urgent first. Each item has one button that does it or opens where it is done." : undefined} />
      {todos.length ? (
        <ul className="clx-todo">
          {todos.map((x) => (
            <li key={x.key}>
              <StateIcon state={x.state} />
              <span className="clx-todo-body">
                <span className="clx-todo-title">{x.clinic ? <ProgTag code={x.clinic} /> : null}<span>{x.title}</span></span>
                {x.sub ? <span className="clx-li-sub">{x.sub}</span> : null}
              </span>
              {x.action ? <span className="clx-todo-act">{x.action}</span> : null}
            </li>
          ))}
        </ul>
      ) : (
        <div className="clx-todo-done"><Icon name="check" size={15} /> Everything for today's clinics is done or on track.</div>
      )}
    </Card>
  );
}

/* ---- one clinic ---- */

function ClinicCard({ session: s }: { session: ClinicSession }) {
  const state = usePhState();
  const nav = useNav();
  const st = sessionStats(state, s.id);
  const ready = sessionReadiness(state, s.id);
  const toDo = ready.filter((r) => r.state === "warn" || r.state === "open").length;
  const now = Date.parse(state.clock.nowUtc);
  const next = activeBookings(state, s.id).find((b) => b.attendance === "booked" && Date.parse(dublinToUtc(s.date, b.slotStart)) > now);
  const drafts = st.available > 0 ? programmeCounts(state, s.programmeId).drafts : 0;
  const tone = st.pct >= 75 ? "ok" : st.pct >= 50 ? "brand" : "warn";
  const nurse = state.staff.find((x) => x.id === s.nurseId);
  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <div className="ph-row-flex" style={{ gap: 8, marginBottom: 5 }}>
          <ProgTag code={st.programme.code} />
          <span className="ph-grow" />
          {toDo ? <Pill tone="warn" icon="clock">{toDo} to do</Pill> : <Pill tone="ok" icon="check">Ready</Pill>}
        </div>
        <h3 className="ph-h2" style={{ lineHeight: 1.3 }}><ProgrammeLink id={s.programmeId} /></h3>
        <div className="ph-dim" style={{ fontSize: 12, marginTop: 2 }}>{placeLabel(s)}, {s.start} to {s.end}</div>
      </div>

      <div>
        <div className="ph-row-flex" style={{ marginBottom: 6, alignItems: "baseline" }}>
          <span className="ph-num" style={{ fontSize: 22, fontWeight: 600, color: "var(--ink)", letterSpacing: "-.5px" }}>{st.booked}<span className="ph-faint" style={{ fontSize: 13, fontWeight: 500 }}> of {st.slots} booked</span></span>
          <span className="ph-grow" />
          <span className="ph-num ph-dim" style={{ fontSize: 12 }}>{rate(st.booked, st.slots)}</span>
          <InfoTip text={`${st.booked} confirmed bookings out of ${st.slots} bookable slots in this clinic. Breaks are not slots.`} />
        </div>
        <ProgressBar value={st.booked} max={st.slots} tone={tone} label={`${st.programme.code} booked`} />
        <div className="ph-wrap" style={{ marginTop: 8, gap: 6 }}>
          <Pill tone={st.available ? "info" : "neutral"} icon="calendar">{st.available} free</Pill>
          <Pill tone={st.checkedIn + st.inProgress ? "info" : "neutral"} icon="user">{st.checkedIn + st.inProgress} checked in</Pill>
          <Pill tone={st.completed ? "ok" : "neutral"} icon="check">{st.completed} done</Pill>
        </div>
      </div>

      <div className="clx-kv" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
        <div><div className="clx-k">Nurse</div><div className="clx-v ph-row-flex" style={{ gap: 6 }}><Avatar name={staffName(state, s.nurseId)} tint={nurse?.tint} size={20} /><span className="ph-trunc">{staffName(state, s.nurseId)}</span></div></div>
        <div><div className="clx-k">Next appointment</div><div className="clx-v">{next ? <>{next.slotStart}, <PersonLink id={next.personId} /></> : "None left today"}</div></div>
      </div>

      {drafts > 0 ? (
        <div className="ph-faint" style={{ fontSize: 12 }}>
          {plural(drafts, "invitee")} part-way through the questionnaire. <button type="button" className="ph-link" onClick={() => nav.go({ page: "Programmes", tab: "invitations", params: { programme: s.programmeId } })}>Open invitations</button>
        </div>
      ) : null}

      <div className="ph-wrap" style={{ marginTop: "auto" }}>
        <Button size="sm" variant="primary" icon="list" onClick={() => nav.go({ page: "Clinics", tab: "appointments", params: { date: s.date, session: s.id } })}>Day list</Button>
        <Button size="sm" icon="calendar" onClick={() => nav.go({ page: "Clinics", tab: "schedule", params: { view: "day", date: s.date, session: s.id } })}>Session</Button>
        {nav.openNursePortal ? <Button size="sm" icon="heart" title={`Open ${staffName(state, s.nurseId)}'s clinic in the nurse portal`} onClick={() => { requestNursePortalNurse(s.nurseId); nav.openNursePortal?.(); }}>Nurse portal</Button> : null}
      </div>
    </Card>
  );
}

/* ---- coming up ---- */

function UpcomingStaffing() {
  const state = usePhState();
  const nav = useNav();
  const up = upcomingSessions(state);
  const overlaps = up.filter((s) => staffConflicts(state, s).length > 0 || roomClashes(state, s).length > 0).length;
  return (
    <Card>
      <CardHeader title="Coming up" sub={up.length
        ? `${plural(up.length, "clinic")} after today. ${up.every((s) => !!s.nurseId) ? "Every one has a nurse" : "Some still need a nurse"}${overlaps ? `, ${plural(overlaps, "overlap")} to fix` : ", no overlaps"}.`
        : "No more clinics in the programme window."} />
      <div style={{ display: "flex", flexDirection: "column" }}>
        {up.map((s) => {
          const st = sessionStats(state, s.id);
          const open = sessionTasks(state, s.id).filter((x) => x.status !== "done");
          const job = reminderJob(state, s.id);
          return (
            <button key={s.id} type="button" className="ph-row clx-uprow" onClick={() => nav.go({ page: "Clinics", tab: "schedule", params: { session: s.id, date: s.date } })}
              title="Open this clinic in the schedule">
              <span className="ph-num" style={{ fontSize: 12, color: "var(--ink)" }}>{fmtWeekdayDate(s.date)}</span>
              <span style={{ minWidth: 0 }}>
                <span className="ph-row-flex" style={{ gap: 7 }}><ProgTag code={st.programme.code} /><span className="ph-trunc" style={{ fontSize: 12.5, color: "var(--body)" }}>{placeLabel(s)}</span></span>
                <span className="ph-faint ph-trunc" style={{ display: "block", fontSize: 11.5, marginTop: 3 }}>
                  {staffName(state, s.nurseId)}{s.supportIds.length ? `, with ${s.supportIds.map((id) => staffName(state, id)).join(", ")}` : ""}
                  {job?.nextRunAt ? `. Reminders go ${fmtWeekdayDate(job.nextRunAt)} ${fmtTime(job.nextRunAt)}` : ""}
                </span>
              </span>
              <span style={{ textAlign: "right" }}>
                <span className="ph-num" style={{ display: "block", fontSize: 12.5, color: "var(--ink)" }} title={`${st.booked} appointments of ${s.slotMinutes} minutes, out of ${minutesLabel(bookableMinutes(s))} bookable`}>{st.booked} of {st.slots} booked</span>
                <span style={{ display: "inline-block", marginTop: 3 }}>{open.length ? <Pill tone="neutral" icon="clock" title={open.map((x) => x.title).join("; ")}>{plural(open.length, "task")} to do</Pill> : <Pill tone="ok" icon="check">Ready</Pill>}</span>
              </span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
