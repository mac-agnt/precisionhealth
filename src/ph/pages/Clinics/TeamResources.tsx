/* Team and resources: eight demonstration staff profiles (not headcount) with role-appropriate
   clinic assignments, nurse day workload, the assignment matrix, clinic rooms and fictional
   label printers. Workload is booked appointments times slot length. No live workforce tracking. */
import type { Resource, Staff } from "../../model";
import { ROLE_LABEL, addDays, fmtDate, fmtDateLong, fmtWeekdayDate, nurseWorkload, plural, sessionStats, today, todaySessions } from "../../model";
import { usePhState } from "../../store";
import { useNav } from "../../nav-context";
import { Avatar, Button, Card, CardHeader, DataTable, DemoTag, EntityLink, Kpi, KpiStrip, PageHeader, Pill, ProgressBar } from "../../ui";
import type { Column } from "../../ui";
import { assignmentsOf, bookableMinutes, clinicAccess, minutesLabel, nursingStaff, placeLabel, sessionDays, sortSessions } from "./selectors";
import { ClxDrawer, ProgTag, slotCount, useWidth } from "./shared";

export default function TeamResources() {
  const state = usePhState();
  const nav = useNav();
  const t = today(state);
  const days = sessionDays(state);
  const date = days.includes(nav.params.date || "") ? nav.params.date! : t;
  const selectedStaff = state.staff.find((s) => s.id === nav.params.staff);
  const set = (p: Record<string, string>) => nav.setParams(Object.fromEntries(Object.entries({ ...nav.params, ...p }).filter(([, v]) => v !== "")));
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const narrow = width > 0 && width < 700;

  const todays = todaySessions(state);
  const nursesToday = new Set(todays.map((s) => s.nurseId)).size;
  const supportToday = new Set(todays.flatMap((s) => s.supportIds)).size;
  const bookedMin = todays.reduce((n, s) => n + sessionStats(state, s.id).booked * s.slotMinutes, 0);
  const bookableMin = todays.reduce((n, s) => n + bookableMinutes(s), 0);
  const rooms = state.resources.filter((r) => r.kind === "room");
  const printers = state.resources.filter((r) => r.kind === "printer");
  const roomsToday = rooms.filter((r) => todays.some((s) => s.room === r.name)).length;
  const printersToday = printers.filter((r) => todays.some((s) => s.printerId === r.id)).length;

  const todayOf = (st: Staff) => assignmentsOf(state, st.id).filter((a) => a.session.date === t);
  const upcomingOf = (st: Staff) => assignmentsOf(state, st.id).filter((a) => a.session.date > t && a.session.date <= addDays(t, 14));
  const cols: Column<Staff>[] = [
    { key: "who", header: "Staff profile", cell: (st) => (
      <span className="ph-row-flex" style={{ gap: 9 }}>
        <Avatar name={st.name} tint={st.tint} size={26} />
        <span style={{ minWidth: 0 }}><span style={{ display: "block", color: "var(--ink)" }}>{st.name}</span><span className="ph-faint" style={{ display: "block", fontSize: 11 }}>{st.title}</span></span>
      </span>
    ) },
    { key: "team", header: "Team and role", cell: (st) => <span><span style={{ display: "block" }}>{state.teams.find((x) => x.id === st.team)?.name || st.team}</span><span className="ph-faint" style={{ fontSize: 11 }}>{ROLE_LABEL[st.role]}</span></span> },
    { key: "access", header: "In clinics", cell: (st) => <span className="ph-dim" style={{ fontSize: 12 }}>{clinicAccess(st.role)}</span> },
    { key: "today", header: "Today", cell: (st) => {
      const a = todayOf(st);
      if (!a.length) return <span className="ph-faint">No clinic assignment</span>;
      return <span className="ph-row-flex" style={{ gap: 6 }}>{a.map((x) => <span key={x.session.id} className="ph-row-flex" style={{ gap: 5 }}><ProgTag code={sessionStats(state, x.session.id).programme.code} /><span>{x.role === "nurse" ? "Nurse" : "Support"}</span></span>)}</span>;
    } },
    { key: "next", header: "Next 14 days", align: "right", cell: (st) => { const n = upcomingOf(st).length; return n ? <span className="ph-num">{plural(n, "session")}</span> : <span className="ph-faint">None</span>; } },
  ];
  const compactCols: Column<Staff>[] = [cols[0], cols[3]];

  return (
    <div className="ph-page">
      <div className="clx" ref={wrapRef}>
        <PageHeader title="Team and resources"
          sub="Eight demonstration staff profiles, not total headcount. Names and titles come from the public website; clinic assignments, rooms and printers are fictional. Workload is booked appointments times the slot length. Nothing here tracks people live." />
        <KpiStrip>
          <Kpi label="Staff profiles" value={state.staff.length} icon="users" sub="A demonstration roster, not company headcount" />
          <Kpi label="Rostered at clinics today" value={`${plural(nursesToday, "nurse")}, ${supportToday} support`} sub={`One booked nurse per clinic across ${plural(todays.length, "clinic")}. Support is not booked.`} />
          <Kpi label="Booked nurse time today" value={minutesLabel(bookedMin)} sub={`Of ${minutesLabel(bookableMin)} bookable across today's clinics`} hint="Confirmed appointments today times 15 minutes, against bookable slot time." />
          <Kpi label="Resources in use today" value={`${roomsToday} of ${rooms.length} rooms`} sub={`${printersToday} of ${printers.length} fictional label printers`} />
        </KpiStrip>

        <div className="clx-split">
          <Card pad={false}>
            <div className="ph-pad" style={{ paddingBottom: 8 }}>
              <CardHeader title="Staff and clinic assignments" sub="Select a profile to see every assignment. Clinic access follows the role, a frontend visibility simulation." />
            </div>
            <DataTable rows={state.staff} columns={narrow ? compactCols : cols} rowKey={(st) => st.id} onRowClick={(st) => set({ staff: st.id })} selectedKey={selectedStaff?.id || null}
              footerNote="profiles. The demonstration roster, not headcount." />
          </Card>
          <WorkloadCard date={date} days={days} onDate={(d) => set({ date: d })} />
        </div>

        <AssignmentMatrix onSession={(id, d) => nav.go({ page: "Clinics", tab: "schedule", params: { session: id, date: d } })} />

        <div className="clx-split-even">
          <ResourceList title="Clinic rooms" sub="Each session offers the slots its own clinic day allows: 25 with the standard 09:00 to 16:15 day and three breaks." items={rooms} />
          <ResourceList title="Label printers" sub="Fictional devices. Demo specimen labels only, not for laboratory use." items={printers} />
        </div>
      </div>
      <StaffDrawer staff={selectedStaff} onClose={() => set({ staff: "" })} />
    </div>
  );
}

function WorkloadCard({ date, days, onDate }: { date: string; days: string[]; onDate: (d: string) => void }) {
  const state = usePhState();
  const t = today(state);
  const wl = nurseWorkload(state, date).filter((w) => w.sessions.length > 0);
  const off = state.staff.filter((s) => !wl.some((w) => w.staff.id === s.id));
  const prev = days.filter((d) => d < date).pop();
  const next = days.find((d) => d > date);
  return (
    <Card>
      <CardHeader title="Nurse day workload" sub="Booked appointments times 15 minutes, against the bookable time in that clinic." />
      <div className="ph-row-flex" style={{ marginBottom: 12, gap: 6 }}>
        <Button size="sm" variant="ghost" icon="chevronLeft" disabled={!prev} aria-label="Previous clinic day" onClick={() => prev && onDate(prev)} />
        <span className="ph-grow" style={{ textAlign: "center", fontSize: 12.5, color: "var(--ink)", fontWeight: 600 }}>{fmtWeekdayDate(date)}{date === t ? ", today" : ""}</span>
        <Button size="sm" variant="ghost" icon="chevronRight" disabled={!next} aria-label="Next clinic day" onClick={() => next && onDate(next)} />
      </div>
      {wl.length ? (
        <div className="ph-stack" style={{ gap: 14 }}>
          {wl.map((w) => {
            const asNurse = w.sessions.filter((s) => s.nurseId === w.staff.id);
            const bookable = asNurse.reduce((n, s) => n + bookableMinutes(s), 0);
            return (
              <div key={w.staff.id}>
                <div className="ph-row-flex" style={{ gap: 8, marginBottom: 5 }}>
                  <Avatar name={w.staff.name} tint={w.staff.tint} size={22} />
                  <span className="ph-grow ph-trunc" style={{ fontSize: 12.5, color: "var(--ink)" }}>{w.staff.name}</span>
                  {w.sessions.map((s) => <ProgTag key={s.id} code={sessionStats(state, s.id).programme.code} />)}
                </div>
                {asNurse.length ? (
                  <>
                    <ProgressBar value={w.minutes} max={bookable} label={`${w.staff.name} booked time`} />
                    <div className="ph-faint" style={{ fontSize: 11.5, marginTop: 4 }}>
                      {plural(w.appointments, "appointment")}, {minutesLabel(w.minutes)} of {minutesLabel(bookable)} booked.
                      {asNurse.map((s) => { const st = sessionStats(state, s.id); return ` ${st.completed} completed, ${st.checkedIn + st.inProgress} checked in.`; }).join("")}
                    </div>
                  </>
                ) : <div className="ph-faint" style={{ fontSize: 11.5 }}>Support resource at {w.sessions.map((s) => placeLabel(s)).join(", ")}. Not booked, so no appointment load.</div>}
              </div>
            );
          })}
          <div className="ph-faint" style={{ fontSize: 11.5, borderTop: "1px solid var(--border)", paddingTop: 10 }}>No clinic assignment: {off.map((s) => s.name.split(" ")[0]).join(", ")}.</div>
        </div>
      ) : <div className="ph-faint" style={{ fontSize: 12.5 }}>No clinics on {fmtDate(date)}.</div>}
    </Card>
  );
}

function AssignmentMatrix({ onSession }: { onSession: (id: string, date: string) => void }) {
  const state = usePhState();
  const t = today(state);
  const days = sessionDays(state);
  const team = nursingStaff(state);
  return (
    <Card>
      <CardHeader title="Assignments across the programme window" sub={`Who is assigned to each of the ${state.sessions.length} sessions. N is the booked nurse, S is support. Select a cell to open the session.`} />
      <div className="clx-dayscroll">
        <table className="clx-matrix" aria-label="Staff assignments by date">
          <thead>
            <tr>
              <th>Staff</th>
              {days.map((d) => <th key={d} className="ph-num" style={{ color: d === t ? "var(--ink)" : undefined }}>{fmtWeekdayDate(d).replace(/^(\w+) /, "$1 ")}</th>)}
            </tr>
          </thead>
          <tbody>
            {team.map((st) => (
              <tr key={st.id}>
                <th><span style={{ color: "var(--ink)" }}>{st.name}</span><span className="ph-faint" style={{ display: "block", fontSize: 10.5 }}>{ROLE_LABEL[st.role]}</span></th>
                {days.map((d) => {
                  const a = assignmentsOf(state, st.id).filter((x) => x.session.date === d);
                  if (!a.length) return <td key={d}><span className="clx-mx-empty" aria-label="Not assigned" /></td>;
                  return (
                    <td key={d}>
                      {a.map((x) => {
                        const ss = sessionStats(state, x.session.id);
                        return (
                          <button key={x.session.id} type="button" className={"clx-mx" + (d === t ? " today" : "")} onClick={() => onSession(x.session.id, d)}
                            title={`${x.session.id}: ${x.role}, ${ss.booked} of ${ss.slots} booked`}>
                            <span style={{ fontWeight: 600, color: "var(--ink)" }}>{ss.programme.code} {x.role === "nurse" ? "N" : "S"}</span>
                            <span className="ph-num ph-faint">{ss.booked}/{ss.slots}</span>
                          </button>
                        );
                      })}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ResourceList({ title, sub, items }: { title: string; sub: string; items: Resource[] }) {
  const state = usePhState();
  const nav = useNav();
  const t = today(state);
  return (
    <Card>
      <CardHeader title={title} sub={sub} right={<DemoTag>Fictional</DemoTag>} />
      <ul className="clx-list" style={{ gap: 12 }}>
        {items.map((r) => {
          const ss = state.sessions.filter((s) => s.status !== "cancelled" && (r.kind === "room" ? s.room === r.name : s.printerId === r.id)).sort(sortSessions);
          const past = ss.filter((s) => s.date < t).length;
          const todayS = ss.filter((s) => s.date === t);
          const upcoming = ss.filter((s) => s.date > t);
          const slotSet = Array.from(new Set(ss.map((s) => slotCount(s))));
          return (
            <li key={r.id} className="clx-li" style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
              <span className="clx-li-body">
                <span className="ph-row-flex" style={{ gap: 8 }}>
                  <span className="ph-grow" style={{ color: "var(--ink)" }}>{r.name}</span>
                  {todayS.length ? <Pill tone="info" icon="calendar">In use today</Pill> : ss.length ? <Pill tone="neutral" icon="clock">Not today</Pill> : <Pill tone="neutral" icon="dot">Spare</Pill>}
                </span>
                <span className="clx-li-sub">{r.location}. {ss.length ? `${plural(ss.length, "session")}: ${past} completed, ${todayS.length} today, ${upcoming.length} upcoming. ${slotSet.length ? `${slotSet.join(" or ")} slots per session.` : ""}` : "No sessions assigned."}</span>
                {todayS.map((s) => {
                  const st = sessionStats(state, s.id);
                  return (
                    <span key={s.id} className="clx-li-sub" style={{ marginTop: 3 }}>
                      Today: <button type="button" className="ph-link" style={{ fontSize: 11.5 }} onClick={() => nav.go({ page: "Clinics", tab: "schedule", params: { session: s.id, date: s.date } })}>{st.programme.code} {s.start} to {s.end}</button>, {st.booked} of {st.slots} booked
                    </span>
                  );
                })}
                {upcoming[0] ? <span className="clx-li-sub">Next: {fmtWeekdayDate(upcoming[0].date)}, {sessionStats(state, upcoming[0].id).programme.code}</span> : null}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function StaffDrawer({ staff, onClose }: { staff: Staff | undefined; onClose: () => void }) {
  const state = usePhState();
  const nav = useNav();
  const t = today(state);
  const a = staff ? assignmentsOf(state, staff.id) : [];
  return (
    <ClxDrawer open={!!staff} onClose={onClose} width={560} title={staff ? staff.name : "Staff"} sub={staff ? `${staff.title}. ${ROLE_LABEL[staff.role]}` : undefined}
      footer={staff ? <><Button variant="ghost" onClick={onClose}>Close</Button><Button icon="user" onClick={() => nav.go({ page: "Records", tab: "staff", params: { staff: staff.id } })}>Open in Records</Button></> : undefined}>
      {staff ? (
        <div className="ph-stack" style={{ gap: 16 }}>
          <dl className="clx-kv" style={{ margin: 0 }}>
            <div><dt>Team</dt><dd>{state.teams.find((x) => x.id === staff.team)?.name}</dd></div>
            <div><dt>In clinics</dt><dd>{clinicAccess(staff.role)}</dd></div>
            <div><dt>Email</dt><dd>{staff.email} <span className="ph-faint" style={{ fontSize: 11 }}>{staff.emailVerified ? "(public address)" : "(demonstration alias)"}</span></dd></div>
            <div><dt>Demo assignment</dt><dd>{staff.assignment}</dd></div>
          </dl>
          <div>
            <div className="ph-eyebrow" style={{ marginBottom: 8 }}>Clinic assignments ({a.length})</div>
            {a.length ? (
              <div style={{ border: "1px solid var(--border)", borderRadius: 12 }}>
                {a.map((x) => {
                  const st = sessionStats(state, x.session.id);
                  return (
                    <button key={x.session.id} type="button" className="ph-row clx-uprow" style={{ gridTemplateColumns: "84px minmax(0,1fr) auto", padding: "8px 10px" }}
                      onClick={() => nav.go({ page: "Clinics", tab: "schedule", params: { session: x.session.id, date: x.session.date } })}>
                      <span className="ph-num" style={{ fontSize: 12, color: x.session.date === t ? "var(--ink)" : "var(--body)" }}>{fmtWeekdayDate(x.session.date)}</span>
                      <span className="ph-row-flex" style={{ gap: 6, minWidth: 0 }}><ProgTag code={st.programme.code} /><span className="ph-trunc" style={{ fontSize: 12 }}>{x.role === "nurse" ? "Nurse" : "Support"}, {placeLabel(x.session)}</span></span>
                      <span className="ph-num ph-faint" style={{ fontSize: 11.5 }}>{x.role === "nurse" ? `${st.booked} of ${st.slots}` : "not booked"}</span>
                    </button>
                  );
                })}
              </div>
            ) : <div className="ph-faint" style={{ fontSize: 12.5 }}>No clinic sessions. {staff.name.split(" ")[0]}'s work in this demo happens outside clinic sessions.</div>}
          </div>
          {a.some((x) => x.session.date === t) ? (
            <div className="ph-faint" style={{ fontSize: 11.5 }}>
              Today, {fmtDateLong(t)}: {a.filter((x) => x.session.date === t).map((x) => `${x.role} at ${x.session.id}, ${x.session.start} to ${x.session.end}`).join("; ")}.
            </div>
          ) : null}
          <div className="ph-faint" style={{ fontSize: 11.5 }}>Profile records live in Records, Staff: <EntityLink kind="staff" id={staff.id}>{staff.name}</EntityLink>.</div>
        </div>
      ) : null}
    </ClxDrawer>
  );
}
