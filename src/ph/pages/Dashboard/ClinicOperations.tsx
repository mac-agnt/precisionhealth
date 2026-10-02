/* Clinic Operations dashboard: today's three clinics, day and week capacity, resource
   assignments, the attendance pipeline and reminder delivery. At 08:15 nothing is checked in or
   completed; historical attendance stays with past sessions. Future appointments are never shown
   as completed. Logical reminders and provider attempts are counted separately. */
import { useState } from "react";
import {
  PROGRAMME_BY_ID, PROGRAMME_ORDER, STORY_DEFS, addDays, failedReminders, fmtDayMonth, fmtTime, fmtWeekdayDate, fmtWhen, ix, linkFor,
  nurseWorkload, personName, programmeCounts, rate, reminderStats, scheduleOverlaps, sessionStats, sessionsBetween, slotGrid, staffName, startOfWeek, today,
  todaySessions, todayStats,
} from "../../model";
import type { LocalDate, PhState } from "../../model";
import { useNav } from "../../nav-context";
import { usePhState } from "../../store";
import { Avatar, Button, Card, CardHeader, DemoTag, EntityLink, Icon, Pill, ProgressBar, Segmented, Split, Stacked } from "../../ui";
import { KpiBand } from "./KpiBand";
import type { BandKpi } from "./KpiBand";
import { AsOf, Fact, GoButton, Note, PROGRAMME_COLOR, Swatch } from "./shared";

function weekTotals(s: PhState, weekStart: LocalDate) {
  const ss = sessionsBetween(s, weekStart, addDays(weekStart, 6)).map((x) => sessionStats(s, x.id));
  return { sessions: ss.length, booked: ss.reduce((n, x) => n + x.booked, 0), capacity: ss.reduce((n, x) => n + x.slots, 0) };
}

/** Today's reminders for one session, from the logical reminder records. */
function sessionReminders(s: PhState, sessionId: string) {
  const I = ix(s);
  const t = today(s);
  const m = s.messages.filter((x) => x.kind === "reminder" && x.cohort === t && !!x.bookingId && I.bookingById.get(x.bookingId)?.sessionId === sessionId);
  return { logical: m.length, delivered: m.filter((x) => x.status === "delivered").length, failed: m.filter((x) => x.status === "failed").length };
}

export default function ClinicOperations() {
  const s = usePhState();
  const nav = useNav();
  const D = todayStats(s);
  const R = reminderStats(s);
  const sessions = todaySessions(s);
  const stats = sessions.map((x) => sessionStats(s, x.id));
  const firstStart = sessions.map((x) => x.start).sort()[0];
  const checkedIn = stats.reduce((n, x) => n + x.checkedIn + x.inProgress, 0);
  const wk = weekTotals(s, startOfWeek(today(s)));

  const items: BandKpi[] = [
    { key: "booked", label: "Booked today", value: D.booked, icon: "calendar", sub: `of ${D.capacity} slots (${rate(D.booked, D.capacity)}) at ${D.sessions} clinics` },
    { key: "available", label: "Available today", value: D.available, icon: "layers", sub: "Unfilled slots in today's clinics. Potential capacity, not revenue." },
    { key: "arrived", label: "Checked in now", value: checkedIn, icon: "user",
      sub: `${D.completed} completed, ${D.notArrived} not yet arrived.${firstStart ? ` First clinic opens at ${firstStart}.` : ""}` },
    { key: "reminders", label: "Reminders delivered", value: `${R.delivered} of ${R.logical}`, icon: "sms", tone: R.failed ? "bad" : "ok", status: R.failed ? `${R.failed} failed` : "All delivered",
      sub: `${R.attempts} provider attempts, counted separately`, hint: "Open failed reminders in Participants, Communications",
      onClick: () => nav.go({ page: "Participants", tab: "communications", params: { filter: "failed" } }) },
    { key: "week", label: "Booked this week", value: `${wk.booked} of ${wk.capacity}`, icon: "chart", sub: `${rate(wk.booked, wk.capacity)} across ${wk.sessions} sessions, week of ${fmtDayMonth(startOfWeek(today(s)))}` },
  ];

  return (
    <div className="ph-page">
      <KpiBand eyebrow="Clinic operations" title="Today's clinics and capacity" right={<AsOf nowUtc={s.clock.nowUtc} />} items={items} />
      <div className="ph-stack" style={{ marginTop: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 14 }}>
          {sessions.map((x) => <ClinicCard key={x.id} sessionId={x.id} />)}
        </div>
        <Split main={<CapacityCard />} side={<AttendanceCard />} />
        <Split even main={<AssignmentsCard />} side={<RemindersCard />} />
      </div>
    </div>
  );
}

/* ---- one card per clinic today ---- */
function ClinicCard({ sessionId }: { sessionId: string }) {
  const s = usePhState();
  const st = sessionStats(s, sessionId);
  const sess = st.session;
  const rem = sessionReminders(s, sessionId);
  const printer = s.resources.find((r) => r.id === sess.printerId);
  const color = PROGRAMME_COLOR[sess.programmeId];
  return (
    <Card>
      <div className="ph-row-flex" style={{ alignItems: "flex-start", gap: 10 }}>
        <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 3, background: color, flex: "none", marginTop: 5 }} />
        <div className="ph-grow">
          <h3 className="ph-h2">{st.programme.name}</h3>
          <div className="ph-dim" style={{ fontSize: 12, marginTop: 2, lineHeight: 1.4 }}>{sess.siteName.includes(sess.room) ? sess.siteName : `${sess.siteName}, ${sess.room}`}</div>
        </div>
        <DemoTag>Fictional</DemoTag>
      </div>
      <div className="ph-row-flex" style={{ alignItems: "baseline", gap: 8, marginTop: 14 }}>
        <span className="ph-num" style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-.8px", color: "var(--ink)" }}>{st.booked}</span>
        <span className="ph-dim" style={{ fontSize: 12.5 }}>of {st.slots} slots booked</span>
        <span className="ph-grow" />
        <span className="ph-num ph-dim" style={{ fontSize: 12 }}>{rate(st.booked, st.slots)}</span>
      </div>
      <div style={{ marginTop: 8 }}><ProgressBar value={st.booked} max={st.slots} label={`${st.programme.clientName}: ${st.booked} of ${st.slots} slots booked`} /></div>
      <div className="ph-faint" style={{ fontSize: 11.5, marginTop: 6 }}>{st.available} available. {sess.start} to {sess.end}, three breaks not bookable.</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "10px 14px", marginTop: 14 }}>
        <Fact label="Nurse"><EntityLink kind="staff" id={sess.nurseId}>{staffName(s, sess.nurseId)}</EntityLink></Fact>
        <Fact label="Support">{sess.supportIds.length ? sess.supportIds.map((id) => staffName(s, id)).join(", ") : "None"}</Fact>
        <Fact label="Arrivals">{st.checkedIn + st.inProgress} checked in, {st.completed} completed</Fact>
        <Fact label="Label printer">{printer ? printer.name.replace(" (fictional)", "").replace(/^Label printer /, "") : "Not assigned"}</Fact>
      </div>
      <div className="ph-row-flex" style={{ gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <Pill tone={rem.failed ? "bad" : "ok"} icon="sms">{rem.delivered} of {rem.logical} reminders delivered{rem.failed ? `, ${rem.failed} failed` : ""}</Pill>
      </div>
      <div className="ph-row-flex" style={{ gap: 4, marginTop: 10, marginLeft: -8, flexWrap: "wrap" }}>
        <GoButton to={{ page: "Clinics", tab: "appointments", params: { session: sessionId, date: sess.date } }}>Appointments</GoButton>
        <GoButton to={linkFor("session", sessionId)} icon="calendar">Schedule</GoButton>
      </div>
    </Card>
  );
}

/* ---- day and week capacity ---- */
function CapacityCard() {
  const s = usePhState();
  const [view, setView] = useState<"day" | "week">("day");
  const t = today(s);
  const all = s.sessions.filter((x) => x.status !== "cancelled").map((x) => x.date).sort();
  const minWeek = startOfWeek(all[0] || t), maxWeek = startOfWeek(all[all.length - 1] || t);
  const [week, setWeek] = useState<LocalDate>(startOfWeek(t));
  return (
    <Card>
      <CardHeader title="Capacity" sub={view === "day" ? `Slot by slot for ${fmtWeekdayDate(t)}. Each block is a 15-minute slot derived from the clinic day.` : "Booked or attended against capacity for each session in the week."}
        right={<Segmented label="Capacity view" value={view} onChange={setView} options={[{ id: "day", label: "Day" }, { id: "week", label: "Week" }]} />} />
      {view === "day" ? <DayTimeline /> : (
        <WeekView weekStart={week} onPrev={week > minWeek ? () => setWeek(addDays(week, -7)) : undefined} onNext={week < maxWeek ? () => setWeek(addDays(week, 7)) : undefined} />
      )}
    </Card>
  );
}

function DayTimeline() {
  const s = usePhState();
  const sessions = todaySessions(s);
  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {sessions.map((x) => {
          const grid = slotGrid(s, x.id);
          const st = sessionStats(s, x.id);
          const color = PROGRAMME_COLOR[x.programmeId];
          return (
            <div key={x.id} style={{ minWidth: 0 }}>
              <div className="ph-row-flex" style={{ fontSize: 12, marginBottom: 5 }}>
                <span className="ph-grow ph-trunc" style={{ color: "var(--body)" }}>{st.programme.clientName}: {x.siteName.replace(`${st.programme.clientName} Dublin, `, "")}</span>
                <span className="ph-num" style={{ color: "var(--ink)", fontWeight: 600 }}>{st.booked}/{st.slots}</span>
              </div>
              <div role="img" aria-label={`${st.programme.clientName} clinic: ${st.booked} of ${st.slots} slots booked, ${st.available} available`} style={{ display: "flex", gap: 2, alignItems: "stretch" }}>
                {grid.map((sl, i) => {
                  const gap = i > 0 && grid[i - 1].end !== sl.start;
                  return (
                    <span key={sl.start} style={{ display: "contents" }}>
                      {gap ? <span aria-hidden="true" style={{ flex: "0 0 7px" }} /> : null}
                      <span title={`${sl.start} to ${sl.end}: ${sl.booking ? "booked" : "available"}`}
                        style={{ flex: "1 1 0", minWidth: 4, height: 20, borderRadius: 4, background: sl.booking ? color : "var(--track)", opacity: sl.isPast ? 0.55 : 1 }} />
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="ph-row-flex ph-faint ph-num" style={{ fontSize: 10.5, marginTop: 6, justifyContent: "space-between" }}>
        <span>{sessions[0]?.start || "09:00"}</span><span>{sessions[0]?.end || "16:15"}</span>
      </div>
      <div className="ph-wrap" style={{ gap: "6px 14px", marginTop: 10 }}>
        <Swatch color="var(--accent)" label="Booked (colour by programme)" />
        <Swatch color="var(--track)" label="Available" />
        <span className="ph-faint" style={{ fontSize: 11.5 }}>Gaps are breaks, 10:30 to 10:45, 12:30 to 13:00 and 14:30 to 14:45. They are not bookable.</span>
      </div>
    </div>
  );
}

function WeekView({ weekStart, onPrev, onNext }: { weekStart: LocalDate; onPrev?: () => void; onNext?: () => void }) {
  const s = usePhState();
  const nav = useNav();
  const t = today(s);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const tot = weekTotals(s, weekStart);
  const sessions = sessionsBetween(s, weekStart, addDays(weekStart, 6));
  const past = sessions.filter((x) => x.date < t).length;
  return (
    <div>
      <div className="ph-row-flex" style={{ gap: 8, marginBottom: 12 }}>
        <Button size="sm" variant="ghost" icon="chevronLeft" aria-label="Previous week" disabled={!onPrev} onClick={onPrev} />
        <span className="ph-grow" style={{ fontSize: 12.5, color: "var(--ink)", fontWeight: 500, textAlign: "center" }}>Week of {fmtWeekdayDate(weekStart)}</span>
        <Button size="sm" variant="ghost" icon="chevronRight" aria-label="Next week" disabled={!onNext} onClick={onNext} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 6 }}>
        {days.map((d) => {
          const ds = sessionsBetween(s, d, d).map((x) => sessionStats(s, x.id));
          const isToday = d === t;
          const isPast = d < t;
          const shown = ds.reduce((n, x) => n + (isPast ? x.completed : x.booked), 0);
          const cap = ds.reduce((n, x) => n + x.slots, 0);
          return (
            <div key={d} style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 6, padding: "8px 4px", borderRadius: 12, background: isToday ? "var(--accent-faint)" : "transparent", border: isToday ? "1px solid var(--accent-line)" : "1px solid transparent" }}>
              <div className="ph-trunc" style={{ fontSize: 11, textAlign: "center", color: isToday ? "var(--ink)" : "var(--dim)", fontWeight: isToday ? 600 : 400 }}>{fmtWeekdayDate(d).replace(/ \w+$/, "")}</div>
              <div style={{ height: 112, display: "flex", gap: 3, alignItems: "flex-end", justifyContent: "center" }}>
                {ds.length ? ds.map((x) => {
                  const n = isPast ? x.completed : x.booked;
                  const label = `${x.programme.clientName}, ${fmtWeekdayDate(d)}: ${n} of ${x.slots} ${isPast ? "attended" : "booked"}`;
                  return (
                    <button key={x.session.id} type="button" onClick={() => nav.go(linkFor("session", x.session.id))} aria-label={label} title={label}
                      style={{ flex: "1 1 0", maxWidth: 20, height: "100%", padding: 0, border: 0, borderRadius: 6, background: "var(--track)", position: "relative", cursor: "pointer", overflow: "hidden" }}>
                      <span style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: (x.slots ? (n / x.slots) * 100 : 0) + "%", background: PROGRAMME_COLOR[x.session.programmeId], opacity: isPast ? 0.6 : 1 }} />
                    </button>
                  );
                }) : <span className="ph-faint" style={{ fontSize: 10.5, alignSelf: "center", textAlign: "center" }}>No clinic</span>}
              </div>
              <div className="ph-num" style={{ fontSize: 11, textAlign: "center", color: "var(--ink)" }}>{ds.length ? `${shown}/${cap}` : " "}</div>
            </div>
          );
        })}
      </div>
      <div className="ph-wrap" style={{ gap: "6px 14px", marginTop: 12 }}>
        {PROGRAMME_ORDER.map((id) => <Swatch key={id} color={PROGRAMME_COLOR[id]} label={PROGRAMME_BY_ID[id].clientName} />)}
      </div>
      <Note>
        Week total: {tot.booked} booked of {tot.capacity} slots ({rate(tot.booked, tot.capacity)}) across {tot.sessions} {tot.sessions === 1 ? "session" : "sessions"}.
        {past ? ` Past sessions show attended appointments, faded.` : ""} Upcoming sessions show confirmed bookings only. Select a bar to open the session.
      </Note>
    </div>
  );
}

/* ---- attendance pipeline ---- */
function AttendanceCard() {
  const s = usePhState();
  const stats = todaySessions(s).map((x) => sessionStats(s, x.id));
  const sum = (f: (x: (typeof stats)[number]) => number) => stats.reduce((n, x) => n + f(x), 0);
  const booked = sum((x) => x.booked);
  const T = programmeCounts(s);
  return (
    <Card>
      <CardHeader title="Attendance pipeline" sub={`Today's ${booked} bookings by arrival state, then programme bookings to date.`} />
      <Stacked total={booked} segments={[
        { label: "Completed", value: sum((x) => x.completed), color: "var(--ok)" },
        { label: "In progress", value: sum((x) => x.inProgress), color: PROGRAMME_COLOR["PRG-SF-26"] },
        { label: "Checked in", value: sum((x) => x.checkedIn), color: "var(--accent)" },
        { label: "Not yet arrived", value: sum((x) => x.notArrived), color: "var(--neutral, var(--track))" },
      ]} />
      <Note icon="clock">{`At ${fmtTime(s.clock.nowUtc)} today, ${sum((x) => x.checkedIn + x.inProgress)} checked in and ${sum((x) => x.completed)} completed. Appointments are completed only by the nurse at the clinic, never in advance.`}</Note>
      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="ph-eyebrow">Programme bookings to date</div>
        {PROGRAMME_ORDER.map((id) => {
          const c = programmeCounts(s, id);
          return (
            <div key={id} style={{ minWidth: 0 }}>
              <div className="ph-row-flex" style={{ fontSize: 12, marginBottom: 5 }}>
                <span className="ph-grow ph-trunc" style={{ color: "var(--body)" }}>{PROGRAMME_BY_ID[id].name}</span>
                <span className="ph-num ph-faint">{c.booked} booked</span>
              </div>
              <Stacked total={c.booked} height={10} segments={[
                { label: "Attended", value: c.attended, color: PROGRAMME_COLOR[id] },
                { label: "Upcoming", value: c.upcoming, color: "var(--track)" },
                ...(c.noShow ? [{ label: "No-show", value: c.noShow, color: "var(--warn)" }] : []),
              ]} />
            </div>
          );
        })}
      </div>
      <Note>Historical attendance: {T.attended} attended + {T.upcoming} upcoming confirmed = {T.booked} booked{T.noShow ? `, plus ${T.noShow} no-show` : ""}.</Note>
    </Card>
  );
}

/* ---- resource assignments ---- */
function AssignmentsCard() {
  const s = usePhState();
  const t = today(s);
  const rows = nurseWorkload(s, t).filter((w) => w.sessions.length);
  const overlaps = scheduleOverlaps(s).filter((o) => o.date === t);
  return (
    <Card>
      <CardHeader title="Resource assignments today" sub="Nurses and support per clinic. Booked minutes count 15 minutes per confirmed appointment." />
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }} aria-label="Staff assignments to today's clinics">
        {rows.map((w) => {
          const sess = w.sessions[0];
          const nurse = w.sessions.some((x) => x.nurseId === w.staff.id);
          return (
            <li key={w.staff.id} className="ph-row-flex" style={{ alignItems: "flex-start", gap: 10, padding: "10px 0", borderTop: "1px solid var(--border)", flexWrap: "wrap" }}>
              <Avatar name={w.staff.name} tint={w.staff.tint} size={28} />
              <div style={{ flex: "1 1 170px", minWidth: 0 }}>
                <EntityLink kind="staff" id={w.staff.id}>{w.staff.name}</EntityLink>
                <div className="ph-faint" style={{ fontSize: 11.5, lineHeight: 1.4, marginTop: 1 }}>{w.staff.title}</div>
              </div>
              <div style={{ flex: "1 1 150px", minWidth: 0, fontSize: 12.5 }}>
                <EntityLink kind="session" id={sess.id}>{PROGRAMME_BY_ID[sess.programmeId].clientName} clinic</EntityLink>
                <div className="ph-faint" style={{ fontSize: 11.5, lineHeight: 1.4, marginTop: 1 }}>{sess.room}</div>
              </div>
              <div style={{ flex: "0 0 auto", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                {nurse ? <Pill tone="info" icon="heart">Nurse</Pill> : <Pill tone="neutral" icon="users">Support</Pill>}
                <span className="ph-num ph-dim" style={{ fontSize: 11.5 }}>{nurse ? `${w.appointments} appointments, ${w.minutes} min` : "Not a booked nurse"}</span>
              </div>
            </li>
          );
        })}
      </ul>
      {overlaps.length
        ? <Note icon="alert">{overlaps.length} overlapping {overlaps.length === 1 ? "assignment" : "assignments"} today. Resolve in Clinics, Schedule.</Note>
        : <Note icon="check">No overlapping assignments today. Each nurse holds one clinic. Support staff are not a second booked nurse.</Note>}
    </Card>
  );
}

/* ---- reminder delivery ---- */
function RemindersCard() {
  const s = usePhState();
  const R = reminderStats(s);
  const failed = failedReminders(s);
  const I = ix(s);
  const story = STORY_DEFS.find((x) => x.id === "ST-05");
  return (
    <Card>
      <CardHeader title="Reminder delivery" sub={`${R.logical} logical reminders for today's confirmed appointments.`}
        right={<GoButton to={{ page: "Participants", tab: "communications", params: { filter: "failed" } }}>Communications</GoButton>} />
      <Stacked total={R.logical} segments={[
        { label: "Delivered", value: R.delivered, color: "var(--ok)" },
        { label: "Failed", value: R.failed, color: "var(--bad)" },
        ...(R.queued ? [{ label: "Queued", value: R.queued, color: "var(--track)" }] : []),
      ]} />
      <Note>Provider attempts: {R.attempts} in total, including {R.autoRetries} automatic and {R.manualRetries} manual {R.autoRetries + R.manualRetries === 1 ? "retry" : "retries"}. Attempts never change the {R.logical} logical reminders or any booking count.</Note>
      <div style={{ marginTop: 12 }}>
        {failed.length ? (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {failed.map((m) => {
              const p = I.personById.get(m.personId);
              const last = m.attempts[m.attempts.length - 1];
              return (
                <li key={m.id} className="ph-row-flex" style={{ alignItems: "flex-start", gap: 10, padding: "10px 0", borderTop: "1px solid var(--border)" }}>
                  <Icon name={m.channel === "sms" ? "sms" : "mail"} size={15} style={{ color: "var(--bad)", marginTop: 2 }} />
                  <div className="ph-grow">
                    <div style={{ fontSize: 12.5, color: "var(--ink)", fontWeight: 500 }}>
                      {personName(p)} <span className="ph-faint" style={{ fontWeight: 400 }}>({p ? PROGRAMME_BY_ID[p.programmeId].clientName : ""})</span>
                    </div>
                    <div className="ph-dim" style={{ fontSize: 11.5, marginTop: 2, lineHeight: 1.4 }}>{m.channel === "sms" ? "SMS" : "Email"} to {m.destination}. {last?.reason || "Failed"}. {m.attempts.length} attempts.</div>
                  </div>
                  <div className="ph-wrap" style={{ flex: "none", gap: 6 }}>
                    <DemoTag>Simulated</DemoTag>
                    <EntityLink kind="message" id={m.id} params={{ filter: "failed" }}>Review</EntityLink>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : <Note icon="check">No failed reminders for today's appointments.</Note>}
      </div>
      {story ? <Note icon="user">{staffName(s, story.ownerId)} owns the review{story.dueAt ? `, due ${fmtWhen(story.dueAt, s.clock.nowUtc)}` : ""}. Retries happen in Participants, Communications.</Note> : null}
    </Card>
  );
}
