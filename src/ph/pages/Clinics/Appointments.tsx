/* Appointments: a searchable day list. Selecting a row opens the nurse clinical workspace for
   clinical roles on that clinic, or the logistics-only view for everyone else. */
import { useState } from "react";
import type { LocalDate } from "../../model";
import { act, canViewClinicalForSession, dayStats, fmtDate, fmtDateLong, fmtDateTime, fmtWeekdayDate, ix, persona, plural, sessionStats, staffName, today } from "../../model";
import { dispatch, usePersona, usePhState } from "../../store";
import { useNav } from "../../nav-context";
import { Button, Card, Chip, DataTable, EmptyState, Icon, PageHeader, Pill, SearchBox, Segmented } from "../../ui";
import type { Column } from "../../ui";
import type { ApptRow, ApptStatus } from "./selectors";
import { apptRow, captureRule, checkInRule, dayAppointments, placeLabel, sessionDays, sessionsOnDay } from "./selectors";
import { APPT_META, ApptPill, ProgTag, useWidth } from "./shared";
import { Workspace } from "./Workspace";
import { LogisticsView } from "./Logistics";

type StatusFilter = "active" | "arrive" | "in" | "done" | "cancelled";
const STATUS_OF: Record<StatusFilter, ApptStatus[]> = {
  active: ["upcoming", "not_arrived", "checked_in", "in_progress", "completed", "no_show"],
  arrive: ["upcoming", "not_arrived"],
  in: ["checked_in", "in_progress"],
  done: ["completed", "no_show"],
  cancelled: ["cancelled"],
};
const isDate = (d: string | undefined): d is LocalDate => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d);

export default function Appointments() {
  const nav = useNav();
  return nav.params.booking ? <Detail bookingId={nav.params.booking} /> : <DayList />;
}

function DayList() {
  const state = usePhState();
  const nav = useNav();
  const p = usePersona();
  const t = today(state);
  const date = isDate(nav.params.date) ? nav.params.date : t;
  const sessionFilter = nav.params.session || "all";
  const [q, setQ] = useState("");
  const [sf, setSf] = useState<StatusFilter>("active");
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const narrow = width > 0 && width < 700;
  const days = sessionDays(state);
  const prev = days.filter((d) => d < date).pop();
  const next = days.find((d) => d > date);
  const sessions = sessionsOnDay(state, date);
  const all = dayAppointments(state, date);
  const inSession = all.filter((r) => sessionFilter === "all" || r.session.id === sessionFilter);
  const query = q.trim().toLowerCase();
  const rows = inSession
    .filter((r) => STATUS_OF[sf].includes(r.status))
    .filter((r) => !query || `${r.person.given} ${r.person.family} ${r.person.id} ${r.booking.id}`.toLowerCase().includes(query));
  const count = (f: StatusFilter) => inSession.filter((r) => STATUS_OF[f].includes(r.status)).length;
  const ds = dayStats(state, date);
  const go = (params: Record<string, string>) => nav.setParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v !== "" && v !== "all")));
  const open = (r: ApptRow) => nav.setParams({ date, ...(sessionFilter !== "all" ? { session: sessionFilter } : {}), booking: r.booking.id });

  const checkIn = (r: ApptRow) => {
    const res = dispatch(act.checkIn(r.booking.id));
    if (res.ok && captureRule(state, r.session).ok && canViewClinicalForSession(state, r.session.id)) open(r);
  };
  const action = (r: ApptRow) => {
    const rule = checkInRule(state, r.session);
    if (r.status === "not_arrived") {
      return <Button size="sm" variant="primary" icon="user" disabled={!rule.ok} title={rule.ok ? "Record arrival" : rule.reason} onClick={(e) => { e.stopPropagation(); checkIn(r); }}>Check in</Button>;
    }
    const clinical = canViewClinicalForSession(state, r.session.id);
    const label = clinical && (r.status === "checked_in" || r.status === "in_progress") ? (captureRule(state, r.session).ok ? "Continue" : "View") : "Open";
    return <Button size="sm" variant={label === "Continue" ? "primary" : "ghost"} onClick={(e) => { e.stopPropagation(); open(r); }}>{label}</Button>;
  };
  const qPill = (r: ApptRow) => {
    const ok = r.membership?.questionnaire === "complete" && r.membership?.consent === "complete";
    return <Pill tone={ok ? "ok" : "warn"} icon={ok ? "check" : "alert"} title={ok ? `Questionnaire and consent ${r.booking.consentVersion} completed ${fmtDateTime(r.booking.questionnaireCompletedAt)}, before the booking was confirmed` : "Questionnaire or consent incomplete"}>{ok ? "Complete" : "Incomplete"}</Pill>;
  };
  const attendance = (r: ApptRow) => (
    <span className="ph-row-flex" style={{ gap: 6 }}>
      <ApptPill status={r.status} rescheduled={!!r.booking.replacedBy} />
      {r.status === "not_arrived" && r.slotPassed ? <span className="ph-faint" style={{ fontSize: 11 }}>slot time passed</span> : null}
    </span>
  );
  const time = (r: ApptRow) => <span className="ph-num"><span style={{ color: "var(--ink)", fontWeight: 600 }}>{r.booking.slotStart}</span><span className="ph-faint" style={{ display: "block", fontSize: 11 }}>to {r.slotEnd}</span></span>;
  const who = (r: ApptRow, extra?: boolean) => (
    <span style={{ display: "block", minWidth: 0 }}>
      <span style={{ color: "var(--ink)" }}>{r.person.given} {r.person.family}</span>
      <span className="ph-faint ph-mono" style={{ display: "block", fontSize: 10.5 }}>{r.person.id}, {r.booking.id}</span>
      {extra ? <span className="ph-faint" style={{ display: "block", fontSize: 11 }}>{r.programme.code}, {staffName(state, r.session.nurseId)}. Questionnaire {r.membership?.questionnaire === "complete" ? "complete" : "incomplete"}</span> : null}
    </span>
  );
  const wide: Column<ApptRow>[] = [
    { key: "time", header: "Time", cell: time, sort: (a, b) => (a.booking.slotStart < b.booking.slotStart ? -1 : a.booking.slotStart > b.booking.slotStart ? 1 : 0) },
    { key: "who", header: "Participant", cell: (r) => who(r), sort: (a, b) => (a.person.family < b.person.family ? -1 : a.person.family > b.person.family ? 1 : 0) },
    { key: "clinic", header: "Clinic", cell: (r) => <span className="ph-row-flex" style={{ gap: 6 }}><ProgTag code={r.programme.code} /><span className="ph-trunc ph-dim" style={{ maxWidth: 150, fontSize: 12 }}>{r.session.room}</span></span> },
    { key: "q", header: "Questionnaire", cell: qPill },
    { key: "att", header: "Attendance", cell: attendance, sort: (a, b) => APPT_META[a.status].label.localeCompare(APPT_META[b.status].label) },
    { key: "nurse", header: "Nurse", cell: (r) => staffName(state, r.session.nurseId) },
    { key: "act", header: "", align: "right", cell: action },
  ];
  const compact: Column<ApptRow>[] = [
    { key: "time", header: "Time", cell: time },
    { key: "who", header: "Participant", cell: (r) => who(r, true), nowrap: false },
    { key: "att", header: "Attendance", cell: attendance },
    { key: "act", header: "", align: "right", cell: action },
  ];
  const mine = sessions.filter((s) => s.nurseId === p.id || s.supportIds.some((x) => x === p.id));

  return (
    <div className="ph-page">
      <div className="clx" ref={wrapRef}>
        <PageHeader
          eyebrow={date === t ? "Today" : date < t ? "Past clinic day" : "Upcoming clinic day"}
          title="Appointments"
          sub={sessions.length
            ? `${fmtDateLong(date)}: ${plural(ds.booked, "booked appointment")} in ${plural(ds.sessions, "clinic")}, ${ds.checkedIn} checked in, ${ds.completed} completed. Times are Europe/Dublin. Select an appointment to open the clinical workspace or, for logistics roles, the appointment details.`
            : `${fmtDateLong(date)}: no clinics on this day.`}
        />
        <Card>
          <div className="clx-toolbar">
            <Button size="sm" variant="ghost" icon="chevronLeft" disabled={!prev} aria-label="Previous clinic day" title={prev ? `Previous clinic day: ${fmtDate(prev)}` : "No earlier clinic day"} onClick={() => prev && go({ date: prev })} />
            <span className="ph-num" style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)", whiteSpace: "nowrap" }}>{fmtWeekdayDate(date)}</span>
            <Button size="sm" variant="ghost" icon="chevronRight" disabled={!next} aria-label="Next clinic day" title={next ? `Next clinic day: ${fmtDate(next)}` : "No later clinic day"} onClick={() => next && go({ date: next })} />
            {date !== t ? <Button size="sm" onClick={() => go({ date: t })}>Today</Button> : null}
            <input type="date" className="ph-input" value={date} aria-label="Choose a date" onChange={(e) => isDate(e.target.value) && go({ date: e.target.value })} style={{ width: 150 }} />
            <span className="ph-grow" />
            <SearchBox value={q} onChange={setQ} placeholder="Search name, PH-P or PH-B" width={250} />
          </div>
          {sessions.length ? (
            <div className="clx-toolbar" style={{ marginTop: 12 }}>
              <Chip on={sessionFilter === "all"} onClick={() => go({ date })} count={all.filter((r) => r.status !== "cancelled").length}>All clinics</Chip>
              {sessions.map((s) => {
                const st = sessionStats(state, s.id);
                return (
                  <Chip key={s.id} on={sessionFilter === s.id} onClick={() => go({ date, session: s.id })} count={st.booked}>
                    {st.programme.code}, {staffName(state, s.nurseId).split(" ")[0]}{mine.some((m) => m.id === s.id) ? " (yours)" : ""}
                  </Chip>
                );
              })}
              <span className="ph-grow" />
              <Segmented value={sf} onChange={setSf} label="Attendance filter" options={[
                { id: "active", label: "All", count: count("active") },
                { id: "arrive", label: "To arrive", count: count("arrive") },
                { id: "in", label: "Checked in", count: count("in") },
                { id: "done", label: "Completed", count: count("done") },
                { id: "cancelled", label: "Cancelled", count: count("cancelled") },
              ]} />
            </div>
          ) : null}
        </Card>

        {sessions.length ? (
          <Card pad={false}>
            <DataTable rows={rows} columns={narrow ? compact : wide} rowKey={(r) => r.booking.id} onRowClick={open} caption={`Appointments on ${fmtDate(date)}`}
              empty={<EmptyState title="No appointments match" icon="search">{query ? `Nothing on ${fmtDate(date)} matches "${q}".` : "Change the clinic or attendance filter."}</EmptyState>}
              footerNote={`appointments on ${fmtDate(date)}${sessionFilter !== "all" ? ` in ${sessionFilter}` : ""}.`} />
          </Card>
        ) : (
          <Card>
            <EmptyState title="No clinics on this day" icon="calendar" action={next ? <Button onClick={() => go({ date: next })}>Next clinic day: {fmtWeekdayDate(next)}</Button> : undefined}>
              Appointments exist only on clinic days in the programme window.
            </EmptyState>
          </Card>
        )}
      </div>
    </div>
  );
}

function Detail({ bookingId }: { bookingId: string }) {
  const state = usePhState();
  const nav = useNav();
  const b = ix(state).bookingById.get(bookingId);
  const row = b ? apptRow(state, b) : null;
  const back = () => {
    const rest: Record<string, string> = {};
    Object.entries(nav.params).forEach(([k, v]) => { if (k !== "booking") rest[k] = v; });
    if (row && !rest.date) rest.date = row.session.date;
    nav.setParams(rest);
  };
  if (!b || !row) {
    return (
      <div className="ph-page">
        <div className="clx" style={{ paddingTop: 18 }}>
          <Card><EmptyState title="Appointment not found" icon="search" action={<Button onClick={back}>Back to the day list</Button>}>{bookingId} is not a booking in this demo.</EmptyState></Card>
        </div>
      </div>
    );
  }
  const clinical = canViewClinicalForSession(state, row.session.id);
  const siblings = dayAppointments(state, row.session.date).filter((r) => r.session.id === row.session.id && r.booking.status === "confirmed");
  const idx = siblings.findIndex((r) => r.booking.id === bookingId);
  const prev = idx > 0 ? siblings[idx - 1] : null;
  const next = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null;
  const step = (r: ApptRow) => nav.setParams({ ...nav.params, date: r.session.date, booking: r.booking.id });
  const p = persona(state);
  return (
    <div className="ph-page">
      <div className="clx">
        <div className="clx-detailnav">
          <Button size="sm" variant="ghost" icon="chevronLeft" onClick={back}>Day list, {fmtWeekdayDate(row.session.date)}</Button>
          <span className="ph-faint" style={{ fontSize: 12 }}>{sessionStats(state, row.session.id).programme.code} clinic, {placeLabel(row.session)}</span>
          <span className="ph-grow" />
          <span className="ph-faint" style={{ fontSize: 11.5 }}>{clinical ? "Clinical workspace" : "Logistics view"} for {p.name}</span>
          <Button size="sm" variant="ghost" icon="chevronLeft" disabled={!prev} onClick={() => prev && step(prev)} aria-label="Previous appointment in this clinic"
            title={prev ? `Previous: ${prev.booking.slotStart} ${prev.person.given} ${prev.person.family}` : "First appointment in this clinic"}>{prev ? `Previous ${prev.booking.slotStart}` : "Previous"}</Button>
          <Button size="sm" variant="ghost" onClick={() => next && step(next)} disabled={!next} aria-label="Next appointment in this clinic"
            title={next ? `Next: ${next.booking.slotStart} ${next.person.given} ${next.person.family}` : "Last appointment in this clinic"}>{next ? `Next ${next.booking.slotStart}` : "Next"}<Icon name="chevronRight" size={13} /></Button>
        </div>
        {clinical ? <Workspace row={row} /> : <LogisticsView row={row} />}
      </div>
    </div>
  );
}
