/* Clinics schedule: week and day calendars of the seeded sessions, a list, a rooms and resources
   timeline, and a session drawer with local edits, impact preview and overlap detection. */
import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { ClinicSession, LocalDate } from "../../model";
import {
  addDays, dayStats, fmtDate, fmtDateLong, fmtWeekdayDate, hhmmToMinutes, minutesToHhmm, plural, sessionStats, slotGrid, staffName, startOfWeek, today,
} from "../../model";
import { usePhState } from "../../store";
import { useNav } from "../../nav-context";
import { Button, Card, CardHeader, Chip, DataTable, EmptyState, Icon, PageHeader, Pill, ProgressBar, Segmented } from "../../ui";
import type { Column } from "../../ui";
import { allStaffConflicts, placeLabel, roomClashes, sessionDays, sessionsOnDay, sortSessions, staffConflicts, windowWeeks } from "./selectors";
import { ProgTag, useWidth } from "./shared";
import { SessionDrawer } from "./SessionPanel";

type View = "week" | "day" | "list" | "rooms";
const VIEWS: Array<{ id: View; label: string }> = [
  { id: "week", label: "Week" }, { id: "day", label: "Day" }, { id: "list", label: "All sessions" }, { id: "rooms", label: "Rooms and resources" },
];

export default function Schedule() {
  const state = usePhState();
  const nav = useNav();
  const t = today(state);
  const view: View = (VIEWS.find((v) => v.id === nav.params.view)?.id) || "week";
  const date: LocalDate = /^\d{4}-\d{2}-\d{2}$/.test(nav.params.date || "") ? nav.params.date : t;
  const selected = nav.params.session || "";
  const sel = selected ? state.sessions.find((s) => s.id === selected) : undefined;
  const set = (p: Record<string, string>) => nav.setParams(Object.fromEntries(Object.entries({ ...nav.params, ...p }).filter(([, v]) => v !== "")));
  const conflicted = allStaffConflicts(state);
  const clashes = state.sessions.filter((s) => roomClashes(state, s).length > 0);
  const days = sessionDays(state);

  return (
    <div className="ph-page">
      <div className="clx">
        <PageHeader
          title="Schedule"
          sub={`${plural(state.sessions.length, "session")} across ${plural(state.programmes.length, "programme")}${days.length ? `, ${fmtDate(days[0])} to ${fmtDate(days[days.length - 1])}` : ""}. Select a session to see its slots, edit it locally and preview the effect on booked participants before anything changes.`}
          actions={<Segmented value={view} options={VIEWS} onChange={(v) => set({ view: v })} label="Schedule view" />}
        />
        <div className={"clx-banner " + (conflicted.length || clashes.length ? "warn" : "info")}>
          <Icon name={conflicted.length || clashes.length ? "alert" : "shield"} size={15} style={{ color: conflicted.length || clashes.length ? "var(--warn)" : "var(--accent)", marginTop: 1 }} />
          <span>
            {conflicted.length || clashes.length
              ? `${plural(conflicted.length, "session")} with a staff overlap and ${plural(clashes.length, "session")} with a room clash. Open the sessions marked with a warning.`
              : `Overlap check: no nurse, support or room overlaps across all ${state.sessions.length} sessions. Edits that would create one are blocked before they apply.`}
          </span>
        </div>

        {view === "week" ? <WeekView date={date} selected={selected} onDate={(d) => set({ date: d })} onSelect={(id) => set({ session: id })} /> : null}
        {view === "day" ? <DayView date={date} selected={selected} onDate={(d) => set({ date: d })} onSelect={(id) => set({ session: id })} /> : null}
        {view === "list" ? <ListView selected={selected} onSelect={(id) => set({ session: id })} /> : null}
        {view === "rooms" ? <RoomsView onSelect={(id) => set({ session: id })} /> : null}
      </div>
      <SessionDrawer session={sel} onClose={() => set({ session: "" })} />
    </div>
  );
}

/* ---- week ---- */
function WeekView({ date, selected, onDate, onSelect }: { date: LocalDate; selected: string; onDate: (d: LocalDate) => void; onSelect: (id: string) => void }) {
  const state = usePhState();
  const t = today(state);
  const weekStart = startOfWeek(date);
  const weeks = windowWeeks(state);
  const all = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const days = all.filter((d, i) => i < 5 || sessionsOnDay(state, d).length > 0);
  const weekSessions = days.flatMap((d) => sessionsOnDay(state, d));
  const booked = weekSessions.reduce((n, s) => n + sessionStats(state, s.id).booked, 0);
  const slots = weekSessions.reduce((n, s) => n + sessionStats(state, s.id).slots, 0);
  return (
    <Card>
      <div className="clx-toolbar" style={{ marginBottom: 12 }}>
        <Button size="sm" variant="ghost" icon="chevronLeft" aria-label="Previous week" onClick={() => onDate(addDays(weekStart, -7))} />
        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>Week of {fmtWeekdayDate(weekStart)}</span>
        <Button size="sm" variant="ghost" icon="chevronRight" aria-label="Next week" onClick={() => onDate(addDays(weekStart, 7))} />
        {startOfWeek(t) !== weekStart ? <Button size="sm" onClick={() => onDate(t)}>This week</Button> : <Pill tone="info" icon="calendar">This week</Pill>}
        <span className="ph-grow" />
        <span className="ph-faint ph-num" style={{ fontSize: 12 }}>{plural(weekSessions.length, "session")}, {booked} of {slots} slots booked</span>
      </div>
      <div className="ph-wrap" style={{ gap: 6, marginBottom: 14 }} role="group" aria-label="Programme window weeks">
        {weeks.map((w) => (
          <Chip key={w.start} on={w.start === weekStart} onClick={() => onDate(w.start)} count={w.count}>{fmtWeekdayDate(w.start).replace(/^Mon /, "")}</Chip>
        ))}
      </div>
      <div className="clx-week" style={{ "--cols": days.length } as CSSProperties}>
        {days.map((d) => {
          const ss = sessionsOnDay(state, d);
          return (
            <div key={d} className="clx-day">
              <div className={"clx-dayhead" + (d === t ? " today" : "")}>
                <span style={{ fontWeight: d === t ? 600 : 500 }}>{fmtWeekdayDate(d)}</span>
                {d === t ? <Pill tone="info" icon={null}>Today</Pill> : null}
              </div>
              {ss.length ? ss.map((s) => <SessionBlock key={s.id} session={s} selected={selected === s.id} onSelect={onSelect} />) : <div className="clx-dayempty">No clinic</div>}
            </div>
          );
        })}
      </div>
      <div className="ph-faint" style={{ fontSize: 11.5, marginTop: 12 }}>Each bar shows booked slots out of the slots the session's own clinic day allows. A warning icon marks a staff or room overlap.</div>
    </Card>
  );
}

function SessionBlock({ session: s, selected, onSelect }: { session: ClinicSession; selected: boolean; onSelect: (id: string) => void }) {
  const state = usePhState();
  const st = sessionStats(state, s.id);
  const warn = staffConflicts(state, s).length > 0 || roomClashes(state, s).length > 0;
  const status = st.isPast ? "Completed" : st.isToday ? "Today" : "Scheduled";
  return (
    <button type="button" className={"clx-sess" + (selected ? " sel" : "") + (st.isPast ? " past" : "")} onClick={() => onSelect(s.id)} aria-pressed={selected}
      title={`${s.id}: ${st.programme.name}, ${placeLabel(s)}, ${st.booked} of ${st.slots} booked`}>
      <span className="ph-row-flex" style={{ gap: 6 }}>
        <ProgTag code={st.programme.code} />
        <span className="ph-grow" />
        {warn ? <Icon name="alert" size={13} style={{ color: "var(--warn)" }} /> : null}
        <span className="ph-faint" style={{ fontSize: 10.5 }}>{status}</span>
      </span>
      <span style={{ display: "block", fontSize: 12, color: "var(--ink)", marginTop: 7, lineHeight: 1.35, overflowWrap: "anywhere" }}>{placeLabel(s)}</span>
      <span className="ph-faint" style={{ display: "block", fontSize: 11, marginTop: 2, lineHeight: 1.35 }}>{s.start} to {s.end}, {staffName(state, s.nurseId)}</span>
      <span className="ph-row-flex" style={{ gap: 8, marginTop: 8 }}>
        <span className="ph-grow"><ProgressBar value={st.booked} max={st.slots} tone={st.isPast ? "ok" : "brand"} label={`${s.id} booked`} /></span>
        <span className="ph-num" style={{ fontSize: 11, color: "var(--body)" }}>{st.booked}/{st.slots}</span>
      </span>
    </button>
  );
}

/* ---- day: time rows by session columns ---- */
function DayView({ date, selected, onDate, onSelect }: { date: LocalDate; selected: string; onDate: (d: LocalDate) => void; onSelect: (id: string) => void }) {
  const state = usePhState();
  const nav = useNav();
  const [gridRef, gridW] = useWidth<HTMLDivElement>();
  const t = today(state);
  const days = sessionDays(state);
  const ss = sessionsOnDay(state, date);
  const prev = days.filter((d) => d < date).pop();
  const next = days.find((d) => d > date);
  const ds = dayStats(state, date);
  const weekStart = startOfWeek(date);
  const weekDays = days.filter((d) => d >= weekStart && d <= addDays(weekStart, 6));
  const header = (
    <div className="clx-toolbar" style={{ marginBottom: 12 }}>
      <Button size="sm" variant="ghost" icon="chevronLeft" disabled={!prev} onClick={() => prev && onDate(prev)} aria-label="Previous clinic day" title={prev ? `Previous clinic day: ${fmtDate(prev)}` : "No earlier clinic day"} />
      <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>{fmtDateLong(date)}</span>
      <Button size="sm" variant="ghost" icon="chevronRight" disabled={!next} onClick={() => next && onDate(next)} aria-label="Next clinic day" title={next ? `Next clinic day: ${fmtDate(next)}` : "No later clinic day"} />
      {date !== t ? <Button size="sm" onClick={() => onDate(t)}>Today</Button> : <Pill tone="info" icon="calendar">Today</Pill>}
      <span className="ph-grow" />
      <span className="ph-wrap" style={{ gap: 6 }}>
        {weekDays.map((d) => <Chip key={d} on={d === date} onClick={() => onDate(d)}>{fmtWeekdayDate(d)}</Chip>)}
      </span>
    </div>
  );
  if (!ss.length) {
    return (
      <Card>
        {header}
        <EmptyState title="No clinic on this day" icon="calendar" action={next ? <Button onClick={() => onDate(next)}>Next clinic day: {fmtWeekdayDate(next)}</Button> : undefined}>
          Sessions run on the dates in the programme window. Weekends and other days have no bookable slots.
        </EmptyState>
      </Card>
    );
  }
  const dayStart = Math.min(...ss.map((s) => hhmmToMinutes(s.start)));
  const dayEnd = Math.max(...ss.map((s) => hhmmToMinutes(s.end)));
  const rows = Math.ceil((dayEnd - dayStart) / 15);
  const rowOf = (hhmm: string) => Math.floor((hhmmToMinutes(hhmm) - dayStart) / 15) + 2; // row 1 is the header
  const spanOf = (a: string, b: string) => Math.max(1, Math.round((hhmmToMinutes(b) - hhmmToMinutes(a)) / 15));
  /* Narrow columns show the given name and family initial; the full name is in the tooltip. */
  const shortNames = gridW > 0 && (gridW - 56) / ss.length < 210;
  return (
    <Card>
      {header}
      <div className="ph-faint" style={{ fontSize: 12, marginBottom: 10 }}>
        {plural(ds.sessions, "clinic")}: {ds.booked} of {ds.capacity} slots booked, {ds.available} available. Rows are 15 minutes. Select a booked slot to open the appointment, or a column heading to open the session.
      </div>
      <div className="clx-dayscroll" ref={gridRef}>
        <div className="clx-daygrid" style={{ "--cols": ss.length, gridTemplateRows: `auto repeat(${rows}, 30px)` } as CSSProperties} aria-label={`Clinic slots on ${fmtDate(date)}`}>
          <div style={{ gridColumn: 1, gridRow: 1 }} />
          {ss.map((s, ci) => {
            const st = sessionStats(state, s.id);
            return (
              <button key={s.id} type="button" className={"clx-sess" + (selected === s.id ? " sel" : "")} style={{ gridColumn: ci + 2, gridRow: 1, marginBottom: 6, padding: "8px 10px" }} onClick={() => onSelect(s.id)}
                title={`Open ${s.id}`}>
                <span className="ph-row-flex" style={{ gap: 6 }}><ProgTag code={st.programme.code} /><span className="ph-num ph-faint" style={{ fontSize: 11 }}>{st.booked}/{st.slots}</span></span>
                <span style={{ display: "block", fontSize: 11.5, color: "var(--ink)", marginTop: 5, lineHeight: 1.35 }}>{placeLabel(s)}</span>
                <span className="ph-faint" style={{ display: "block", fontSize: 11, lineHeight: 1.35 }}>{staffName(state, s.nurseId)}{s.supportIds.length ? `, support ${s.supportIds.map((id) => staffName(state, id).split(" ")[0]).join(", ")}` : ""}</span>
              </button>
            );
          })}
          {Array.from({ length: rows }, (_, i) => {
            const tm = minutesToHhmm(dayStart + i * 15);
            return <div key={tm} className="clx-dtime" style={{ gridColumn: 1, gridRow: i + 2 }}>{tm.endsWith(":00") || tm.endsWith(":30") ? tm : ""}</div>;
          })}
          {ss.flatMap((s, ci) => {
            const cells: ReactNode[] = [];
            const grid = slotGrid(state, s.id);
            for (const v of grid) {
              const b = v.booking;
              const who = v.person ? `${v.person.given} ${v.person.family}` : "";
              const shown = v.person && shortNames ? `${v.person.given} ${v.person.family.charAt(0)}.` : who;
              const style: CSSProperties = { gridColumn: ci + 2, gridRow: `${rowOf(v.start)} / span ${spanOf(v.start, v.end)}` };
              if (b) {
                const done = b.attendance === "completed";
                const inn = b.attendance === "checked_in" || b.attendance === "in_progress";
                cells.push(
                  <button key={s.id + v.start} type="button" className={"clx-dcell " + (done ? "done" : "booked") + (v.isPast ? " past" : "")} style={style}
                    onClick={() => nav.go({ page: "Clinics", tab: "appointments", params: { booking: b.id } })} title={`${v.start} to ${v.end}: ${who} (${b.id})`}>
                    <span className="ph-num" style={{ color: "var(--faint)", fontSize: 10.5 }}>{v.start}</span>
                    <span className="ph-trunc" style={{ flex: 1 }}>{shown}</span>
                    {done ? <Icon name="check" size={12} style={{ color: "var(--ok)" }} /> : inn ? <Icon name="user" size={12} style={{ color: "var(--accent)" }} /> : null}
                  </button>,
                );
              } else {
                cells.push(
                  <div key={s.id + v.start} className={"clx-dcell" + (v.isPast ? " past" : "")} style={style} title={`${v.start} to ${v.end}: free. Bookable once a participant has completed the questionnaire and consent.`}>
                    <span className="ph-num" style={{ fontSize: 10.5 }}>{v.start}</span><span>Free</span>
                  </div>,
                );
              }
            }
            for (const br of s.breaks) {
              if (hhmmToMinutes(br.start) < hhmmToMinutes(s.start) || hhmmToMinutes(br.end) > hhmmToMinutes(s.end)) continue;
              cells.push(
                <div key={s.id + "b" + br.start} className="clx-dcell break" style={{ gridColumn: ci + 2, gridRow: `${rowOf(br.start)} / span ${spanOf(br.start, br.end)}` }} title="Break. Not bookable.">
                  Break {br.start} to {br.end}
                </div>,
              );
            }
            return cells;
          })}
        </div>
      </div>
    </Card>
  );
}

/* ---- list of every session ---- */
function ListView({ selected, onSelect }: { selected: string; onSelect: (id: string) => void }) {
  const state = usePhState();
  const [prog, setProg] = useState<string>("all");
  const [when, setWhen] = useState<"all" | "past" | "today" | "upcoming">("all");
  const t = today(state);
  const rows = state.sessions.filter((s) => (prog === "all" || s.programmeId === prog) && (when === "all" || (when === "past" ? s.date < t : when === "today" ? s.date === t : s.date > t))).sort(sortSessions);
  const cols: Column<ClinicSession>[] = [
    { key: "date", header: "Date", cell: (s) => <span className="ph-num">{fmtWeekdayDate(s.date)}</span>, sort: (a, b) => sortSessions(a, b) },
    { key: "id", header: "Session", cell: (s) => <span className="ph-mono" style={{ fontSize: 11.5 }}>{s.id}</span> },
    { key: "prog", header: "Programme", cell: (s) => <ProgTag code={sessionStats(state, s.id).programme.code} /> },
    { key: "place", header: "Room and site", nowrap: false, cell: (s) => <span style={{ display: "inline-block", minWidth: 160 }}>{placeLabel(s)}</span> },
    { key: "nurse", header: "Nurse", cell: (s) => staffName(state, s.nurseId), sort: (a, b) => (staffName(state, a.nurseId) < staffName(state, b.nurseId) ? -1 : 1) },
    { key: "support", header: "Support", cell: (s) => (s.supportIds.length ? s.supportIds.map((id) => staffName(state, id)).join(", ") : <span className="ph-faint">None</span>) },
    { key: "booked", header: "Booked", align: "right", cell: (s) => { const st = sessionStats(state, s.id); return <span className="ph-num">{st.booked} of {st.slots}</span>; }, sort: (a, b) => sessionStats(state, a.id).booked - sessionStats(state, b.id).booked },
    { key: "status", header: "Status", cell: (s) => { const st = sessionStats(state, s.id); return st.isPast ? <Pill tone="ok" icon="check">Completed</Pill> : st.isToday ? <Pill tone="info" icon="calendar">Today</Pill> : <Pill tone="neutral" icon="clock">Scheduled</Pill>; } },
  ];
  const progs = state.programmes;
  return (
    <Card pad={false}>
      <div className="ph-pad" style={{ paddingBottom: 10 }}>
        <CardHeader title="All sessions" sub="Every seeded session with its capacity, derived from the clinic day. Select a row to open it." />
        <div className="clx-toolbar">
          <Chip on={prog === "all"} onClick={() => setProg("all")} count={state.sessions.length}>All programmes</Chip>
          {progs.map((p) => <Chip key={p.id} on={prog === p.id} onClick={() => setProg(p.id)} count={state.sessions.filter((s) => s.programmeId === p.id).length}>{p.code}</Chip>)}
          <span className="ph-grow" />
          <Segmented value={when} onChange={setWhen} label="When" options={[
            { id: "all", label: "All" }, { id: "past", label: "Past", count: state.sessions.filter((s) => s.date < t).length },
            { id: "today", label: "Today", count: state.sessions.filter((s) => s.date === t).length }, { id: "upcoming", label: "Upcoming", count: state.sessions.filter((s) => s.date > t).length },
          ]} />
        </div>
      </div>
      <DataTable rows={rows} columns={cols} rowKey={(s) => s.id} onRowClick={(s) => onSelect(s.id)} selectedKey={selected || null} minWidth={860}
        empty={<EmptyState title="No sessions match">Change the programme or time filter.</EmptyState>}
        footerNote={`sessions. Capacity across these: ${rows.reduce((n, s) => n + sessionStats(state, s.id).slots, 0)} slots.`} />
    </Card>
  );
}

/* ---- rooms and resources over the programme window ---- */
function RoomsView({ onSelect }: { onSelect: (id: string) => void }) {
  const state = usePhState();
  const t = today(state);
  const dates = sessionDays(state);
  const resources = state.resources;
  const usedBy = (resId: string, kind: "room" | "printer", d: LocalDate) =>
    state.sessions.filter((s) => s.date === d && s.status !== "cancelled" && (kind === "room" ? s.room === resources.find((r) => r.id === resId)?.name : s.printerId === resId)).sort(sortSessions);
  return (
    <Card>
      <CardHeader title="Rooms and resources" sub="Which clinic uses each room and fictional label printer on each clinic day. Each session offers 25 slots from its own day configuration. Select a cell to open the session." />
      <div className="clx-dayscroll">
        <table className="clx-matrix" aria-label="Resource use by date">
          <thead>
            <tr>
              <th>Resource</th>
              {dates.map((d) => <th key={d} className="ph-num" style={{ color: d === t ? "var(--ink)" : undefined }}>{fmtWeekdayDate(d).replace(/^(\w+) /, "$1 ")}</th>)}
            </tr>
          </thead>
          <tbody>
            {resources.map((r) => (
              <tr key={r.id}>
                <th style={{ maxWidth: 220 }}>
                  <span style={{ display: "block", color: "var(--ink)", whiteSpace: "normal" }}>{r.name}</span>
                  <span className="ph-faint" style={{ fontSize: 10.5, whiteSpace: "normal" }}>{r.kind === "room" ? "Room" : "Printer"}, {r.location}</span>
                </th>
                {dates.map((d) => {
                  const ss = usedBy(r.id, r.kind, d);
                  if (!ss.length) return <td key={d}><span className="clx-mx-empty" aria-label="Not in use" /></td>;
                  return (
                    <td key={d}>
                      {ss.map((s) => {
                        const st = sessionStats(state, s.id);
                        return (
                          <button key={s.id} type="button" className={"clx-mx" + (d === t ? " today" : "")} onClick={() => onSelect(s.id)} title={`${s.id}: ${st.booked} of ${st.slots} booked`}>
                            <span style={{ fontWeight: 600, color: "var(--ink)" }}>{st.programme.code}</span>
                            <span className="ph-num ph-faint">{st.booked}/{st.slots}</span>
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
      <div className="ph-faint" style={{ fontSize: 11.5, marginTop: 10 }}>
        Rooms and printers are illustrative. Label printers produce demo specimen labels only, not for laboratory use.
      </div>
    </Card>
  );
}
