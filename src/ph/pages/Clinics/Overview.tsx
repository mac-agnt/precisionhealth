/* Clinics overview: today's three clinics with derived readiness, the slot board, upcoming
   staffing and what needs attention. Every number comes from the shared store. */
import type { ClinicSession } from "../../model";
import {
  act, activeBookings, dublinToUtc, fmtDateLong, fmtTime, fmtWeekdayDate, plural, programmeCounts, rate, sessionStats, staffName, storyView,
  today, todaySessions, todayStats, totalCounts,
} from "../../model";
import { dispatch, usePersona, usePhState } from "../../store";
import { useNav } from "../../nav-context";
import { Avatar, Button, Card, CardHeader, DemoTag, Icon, InfoTip, Kpi, KpiStrip, PageHeader, Pill, ProgressBar } from "../../ui";
import {
  bookableMinutes, minutesLabel, onboardingInvitees, placeLabel, reminderByBooking, reminderJob, roomClashes, sessionReadiness, sessionTasks, shortSite, staffConflicts,
  upcomingSessions,
} from "./selectors";
import { ProgTag, SlotLegend, SlotTimeline, StateIcon } from "./shared";
import { requestNursePortalNurse } from "../NursePortal/data";

export default function Overview() {
  const state = usePhState();
  const nav = useNav();
  const t = today(state);
  const sessions = todaySessions(state);
  const ds = todayStats(state);
  const total = totalCounts(state);
  const openAppt = (bookingId: string) => nav.go({ page: "Clinics", tab: "appointments", params: { booking: bookingId } });

  return (
    <div className="ph-page">
      <div className="clx">
        <PageHeader
          eyebrow={fmtDateLong(t)}
          title="Today's clinics"
          sub={`${plural(ds.sessions, "clinic")} today, ${ds.booked} of ${ds.capacity} slots booked. Slots come from each clinic day: 09:00 to 16:15 in 15-minute slots around breaks that are never bookable. Sites, rooms and assignments are illustrative.`}
          actions={<>
            {nav.openNursePortal ? <Button icon="heart" onClick={nav.openNursePortal} title="Open the tablet nurse portal preview: check in, the nurse form, specimens and clinic close">Open nurse portal</Button> : null}
            <Button icon="calendar" onClick={() => nav.go({ page: "Clinics", tab: "schedule", params: { date: t } })}>Schedule</Button>
            <Button variant="primary" icon="list" onClick={() => nav.go({ page: "Clinics", tab: "appointments", params: { date: t } })}>Today's appointments</Button>
          </>}
        />

        <KpiStrip>
          <Kpi label="Booked today" value={`${ds.booked} of ${ds.capacity}`} sub={`${rate(ds.booked, ds.capacity)} of today's bookable slots across ${plural(ds.sessions, "clinic")}`}
            hint="Confirmed bookings in today's sessions divided by today's bookable slots. Breaks are not slots." />
          <Kpi label="Available today" value={ds.available} tone="info" icon="calendar" sub="Unbooked slots left in today's clinics. Available capacity, not lost revenue."
            hint="Bookable slots today minus confirmed bookings today." />
          <Kpi label="Checked in today" value={ds.checkedIn} icon="user" sub={`${ds.completed} completed and ${ds.notArrived} not arrived, of ${ds.booked} booked today`}
            hint="Checked in includes appointments where capture is in progress." />
          <Kpi label="Programme capacity booked" value={rate(total.booked, total.capacity)} sub={`${total.booked} of ${total.capacity} slots across all ${state.sessions.length} sessions. A different measure from today's.`}
            hint="All confirmed bookings, including completed ones, divided by the slots in every programme session." />
        </KpiStrip>

        <div className="clx-cards">
          {sessions.map((s) => <ClinicCard key={s.id} session={s} />)}
        </div>
        {!sessions.length ? <Card><div className="ph-dim" style={{ fontSize: 13 }}>No clinics today.</div></Card> : null}

        <div className="clx-split">
          <div className="ph-stack">
            {sessions.length ? (
              <Card>
                <CardHeader title="Today's slots" sub="One bar per clinic, 09:00 to 16:15. Select a booked slot to open the appointment." />
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
            ) : null}
            <UpcomingStaffing />
          </div>
          <AttentionPanel />
        </div>
      </div>
    </div>
  );
}

function ClinicCard({ session: s }: { session: ClinicSession }) {
  const state = usePhState();
  const nav = useNav();
  const p = usePersona();
  const st = sessionStats(state, s.id);
  const ready = sessionReadiness(state, s.id);
  const now = Date.parse(state.clock.nowUtc);
  const next = activeBookings(state, s.id).find((b) => b.attendance === "booked" && Date.parse(dublinToUtc(s.date, b.slotStart)) > now);
  const nextPerson = next ? state.persons.find((x) => x.id === next.personId) : null;
  const drafts = st.available > 0 ? programmeCounts(state, s.programmeId).drafts : 0;
  const tone = st.pct >= 75 ? "ok" : st.pct >= 50 ? "brand" : "warn";
  const nurse = state.staff.find((x) => x.id === s.nurseId);
  const printer = state.resources.find((r) => r.id === s.printerId);
  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <div className="ph-row-flex" style={{ gap: 8, marginBottom: 5 }}>
          <ProgTag code={st.programme.code} />
          <span className="ph-faint ph-mono ph-trunc" style={{ fontSize: 10.5 }}>{s.id}</span>
        </div>
        <h3 className="ph-h2" style={{ lineHeight: 1.3 }}>{st.programme.name}</h3>
        <div className="ph-dim" style={{ fontSize: 12, marginTop: 2 }}>{placeLabel(s)}, {s.start} to {s.end}</div>
      </div>

      <div>
        <div className="ph-row-flex" style={{ marginBottom: 6, alignItems: "baseline" }}>
          <span className="ph-num" style={{ fontSize: 22, fontWeight: 600, color: "var(--ink)", letterSpacing: "-.5px" }}>{st.booked}<span className="ph-faint" style={{ fontSize: 13, fontWeight: 500 }}> of {st.slots} booked</span></span>
          <span className="ph-grow" />
          <span className="ph-num ph-dim" style={{ fontSize: 12 }}>{rate(st.booked, st.slots)}</span>
          <InfoTip text={`${st.booked} confirmed bookings divided by ${st.slots} bookable slots in this clinic. Breaks are excluded.`} />
        </div>
        <ProgressBar value={st.booked} max={st.slots} tone={tone} label={`${s.id} booked`} />
        <div className="ph-wrap" style={{ marginTop: 8, gap: 6 }}>
          <Pill tone={st.available ? "info" : "neutral"} icon="calendar">{st.available} available</Pill>
          <Pill tone={st.checkedIn + st.inProgress ? "info" : "neutral"} icon="user">{st.checkedIn + st.inProgress} checked in</Pill>
          <Pill tone={st.completed ? "ok" : "neutral"} icon="check">{st.completed} completed</Pill>
        </div>
      </div>

      <div className="clx-kv" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
        <div><div className="clx-k">Nurse</div><div className="clx-v ph-row-flex" style={{ gap: 6 }}><Avatar name={staffName(state, s.nurseId)} tint={nurse?.tint} size={20} /><span className="ph-trunc">{staffName(state, s.nurseId)}</span></div></div>
        <div><div className="clx-k">Support</div><div className="clx-v">{s.supportIds.length ? s.supportIds.map((id) => staffName(state, id)).join(", ") : "None assigned"}</div></div>
        <div><div className="clx-k">Next appointment</div><div className="clx-v">{next ? `${next.slotStart}, ${nextPerson ? `${nextPerson.given} ${nextPerson.family}` : next.personId}` : "None left today"}</div></div>
        <div><div className="clx-k">Label printer</div><div className="clx-v">{printer ? printer.name.replace(" (fictional)", "") : "None"} {printer ? <DemoTag>Fictional</DemoTag> : null}</div></div>
      </div>

      <div>
        <div className="ph-eyebrow" style={{ marginBottom: 8 }}>Readiness</div>
        <ul className="clx-list">
          {ready.map((r) => (
            <li key={r.key} className="clx-li">
              <StateIcon state={r.state} />
              <span className="clx-li-body">
                <span style={{ color: "var(--ink)" }}>{r.label}</span>
                <span className="clx-li-sub">{r.detail}</span>
              </span>
              {r.task && r.task.status !== "done" ? (
                <Button size="sm" variant="ghost" disabled={!r.task.canMarkDone} onClick={() => dispatch(act.completeTask(r.task!.task.id))}
                  title={r.task.canMarkDone ? "Mark this preparation task done" : `Only ${r.task.ownerName} or a supervisor can mark this done. You are previewing as ${p.name}.`}>Mark done</Button>
              ) : r.target ? (
                <Button size="sm" variant="ghost" onClick={() => nav.go(r.target!)}>Review</Button>
              ) : null}
            </li>
          ))}
        </ul>
      </div>

      {drafts > 0 ? (
        <div className="clx-banner info">
          <Icon name="info" size={14} style={{ color: "var(--accent)", marginTop: 2 }} />
          <span style={{ flex: 1 }}>
            {st.available} slots are free. {plural(drafts, "invitee")} on this programme {drafts === 1 ? "has" : "have"} a questionnaire in progress. They are not bookings until the questionnaire and consent are complete.
            <span style={{ display: "block", marginTop: 6 }}>
              <button type="button" className="ph-link" onClick={() => nav.go({ page: "Programmes", tab: "invitations", params: { programme: s.programmeId } })}>Open invitations</button>
            </span>
          </span>
        </div>
      ) : null}

      <div className="ph-wrap" style={{ marginTop: "auto" }}>
        <Button size="sm" variant="primary" icon="list" onClick={() => nav.go({ page: "Clinics", tab: "appointments", params: { date: s.date, session: s.id } })}>Day list</Button>
        <Button size="sm" icon="calendar" onClick={() => nav.go({ page: "Clinics", tab: "schedule", params: { view: "day", date: s.date, session: s.id } })}>Session</Button>
        {nav.openNursePortal ? <Button size="sm" icon="heart" title={`Open ${staffName(state, s.nurseId)}'s clinic in the nurse portal preview`} onClick={() => { requestNursePortalNurse(s.nurseId); nav.openNursePortal?.(); }}>Nurse portal</Button> : null}
      </div>
    </Card>
  );
}

function UpcomingStaffing() {
  const state = usePhState();
  const nav = useNav();
  const up = upcomingSessions(state);
  const days = Array.from(new Set(up.map((s) => s.date)));
  const overlaps = up.filter((s) => staffConflicts(state, s).length > 0 || roomClashes(state, s).length > 0).length;
  const loads = up.map((s) => sessionStats(state, s.id).booked * s.slotMinutes);
  const minLoad = loads.length ? Math.min(...loads) : 0, maxLoad = loads.length ? Math.max(...loads) : 0;
  return (
    <Card>
      <CardHeader title="Upcoming sessions and staffing" sub={up.length
        ? `${plural(up.length, "upcoming session")} on ${plural(days.length, "day")}, each needing one nurse: ${up.every((s) => !!s.nurseId) ? "all assigned" : "some unassigned"}, ${overlaps ? `${plural(overlaps, "overlap")} found` : "no overlapping assignments"}. Booked time per nurse-day ranges from ${minutesLabel(minLoad)} to ${minutesLabel(maxLoad)}.`
        : "No upcoming sessions in the programme window."} />
      <div style={{ display: "flex", flexDirection: "column" }}>
        {up.map((s) => {
          const st = sessionStats(state, s.id);
          const open = sessionTasks(state, s.id).filter((x) => x.status !== "done");
          const job = reminderJob(state, s.id);
          return (
            <button key={s.id} type="button" className="ph-row clx-uprow" onClick={() => nav.go({ page: "Clinics", tab: "schedule", params: { session: s.id, date: s.date } })}
              title={`Open ${s.id} in the schedule`}>
              <span className="ph-num" style={{ fontSize: 12, color: "var(--ink)" }}>{fmtWeekdayDate(s.date)}</span>
              <span style={{ minWidth: 0 }}>
                <span className="ph-row-flex" style={{ gap: 7 }}><ProgTag code={st.programme.code} /><span className="ph-trunc" style={{ fontSize: 12.5, color: "var(--body)" }}>{placeLabel(s)}</span></span>
                <span className="ph-faint ph-trunc" style={{ display: "block", fontSize: 11.5, marginTop: 3 }}>
                  {staffName(state, s.nurseId)}{s.supportIds.length ? `, support ${s.supportIds.map((id) => staffName(state, id)).join(", ")}` : ""}
                  {job?.nextRunAt ? `. Reminders ${fmtWeekdayDate(job.nextRunAt)} ${fmtTime(job.nextRunAt)} (simulated)` : ""}
                </span>
              </span>
              <span style={{ textAlign: "right" }}>
                <span className="ph-num" style={{ display: "block", fontSize: 12.5, color: "var(--ink)" }} title={`${st.booked} appointments of ${s.slotMinutes} minutes, out of ${minutesLabel(bookableMinutes(s))} bookable`}>{st.booked} of {st.slots}, {minutesLabel(st.booked * s.slotMinutes)}</span>
                <span style={{ display: "inline-block", marginTop: 3 }}>{open.length ? <Pill tone="neutral" icon="clock" title={open.map((x) => x.title).join("; ")}>{plural(open.length, "prep task")} open</Pill> : <Pill tone="ok" icon="check">No open prep tasks</Pill>}</span>
              </span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function AttentionPanel() {
  const state = usePhState();
  const nav = useNav();
  const t = today(state);
  const sessions = todaySessions(state);
  const ibm = sessions.find((s) => s.programmeId === "PRG-IBM-26");
  const st03 = storyView(state, "ST-03");
  const invitees = ibm ? onboardingInvitees(state, "PRG-IBM-26") : [];
  const rm = reminderByBooking(state);
  const failed = sessions.flatMap((s) => activeBookings(state, s.id).map((b) => ({ b, s, m: rm.get(b.id) }))).filter((x) => x.m && x.m.status === "failed");
  const overlaps = sessions.filter((s) => staffConflicts(state, s).length > 0);
  const roomClash = sessions.some((s) => roomClashes(state, s).length > 0);
  const openPrep = sessions.flatMap((s) => sessionTasks(state, s.id)).filter((x) => x.status !== "done");
  const support = sessions.filter((s) => s.supportIds.length);
  return (
    <Card>
      <CardHeader title="Needs attention today" sub="Derived from bookings, reminders, assignments and preparation tasks." />
      <ul className="clx-list" style={{ gap: 12 }}>
        {ibm ? (
          <li className="clx-li">
            <StateIcon state={sessionStats(state, ibm.id).available ? "info" : "done"} />
            <span className="clx-li-body">
              <span style={{ color: "var(--ink)" }}>{st03.headline}</span>
              <span className="clx-li-sub">{st03.detail} Owners: {st03.ownerName}{st03.secondaryName ? ` and ${st03.secondaryName}` : ""}.</span>
              {invitees.length ? (
                <span style={{ display: "block", marginTop: 8 }}>
                  <span className="ph-faint" style={{ display: "block", fontSize: 11, marginBottom: 5 }}>Questionnaire in progress (sections done). Select one to open the portal preview as that invitee.</span>
                  <span className="ph-wrap" style={{ gap: 5 }}>
                    {invitees.map((x) => (
                      <button key={x.person.id} type="button" className="ph-chip" style={{ height: 24, padding: "0 9px", fontSize: 11.5 }} onClick={() => nav.openPortal(x.person.id)}
                        title={`Open the participant portal preview as ${x.person.given} ${x.person.family} (${x.person.id})`}>
                        {x.person.given} {x.person.family}
                        <span className="ph-num ph-faint">{x.membership.draft ? `${x.membership.draft.sectionsDone}/${x.membership.draft.sectionsTotal}` : "draft"}</span>
                      </button>
                    ))}
                  </span>
                </span>
              ) : null}
              <span className="ph-wrap" style={{ marginTop: 8 }}>
                <Button size="sm" onClick={() => nav.go({ page: "Clinics", tab: "appointments", params: { date: t, session: ibm.id } })}>IBM day list</Button>
                <Button size="sm" variant="ghost" onClick={() => nav.go(st03.target)}>Invitation decision</Button>
              </span>
            </span>
          </li>
        ) : null}
        <li className="clx-li">
          <StateIcon state={failed.length ? "warn" : "done"} />
          <span className="clx-li-body">
            <span style={{ color: "var(--ink)" }}>{failed.length ? `${plural(failed.length, "reminder")} failed for today's appointments` : "Every reminder for today's appointments was delivered"}</span>
            {failed.map((x) => {
              const person = state.persons.find((pp) => pp.id === x.b.personId);
              const last = x.m!.attempts[x.m!.attempts.length - 1];
              return (
                <span key={x.m!.id} className="clx-li-sub" style={{ marginTop: 3 }}>
                  {person ? `${person.given} ${person.family}` : x.b.personId}, {sessionStats(state, x.s.id).programme.code} {x.b.slotStart}: {last?.reason || "failed"}.{" "}
                  <button type="button" className="ph-link" style={{ fontSize: 11.5 }} onClick={() => nav.go({ page: "Participants", tab: "communications", params: { message: x.m!.id } })}>Review</button>
                  {" "}<DemoTag>Simulated</DemoTag>
                </span>
              );
            })}
          </span>
        </li>
        <li className="clx-li">
          <StateIcon state={openPrep.length ? "open" : "done"} />
          <span className="clx-li-body">
            <span style={{ color: "var(--ink)" }}>{openPrep.length ? `${plural(openPrep.length, "preparation task")} open for today's clinics` : "Preparation tasks done for today's clinics"}</span>
            {openPrep.map((x) => <span key={x.task.id} className="clx-li-sub">{x.title} ({x.ownerName})</span>)}
          </span>
        </li>
        <li className="clx-li">
          <StateIcon state={overlaps.length || roomClash ? "warn" : "done"} />
          <span className="clx-li-body">
            <span style={{ color: "var(--ink)" }}>{overlaps.length || roomClash ? "Assignment overlap found today" : "No nurse, support or room overlaps today"}</span>
            <span className="clx-li-sub">
              Checked against all {state.sessions.length} sessions.
              {support.map((s) => ` ${s.supportIds.map((id) => staffName(state, id)).join(", ")} is a support resource at ${shortSite(s)} (${sessionStats(state, s.id).programme.code}), not a second booked nurse.`).join("")}
            </span>
          </span>
        </li>
      </ul>
    </Card>
  );
}
