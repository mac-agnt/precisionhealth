/* Appointments: a searchable day list. Selecting a row opens the nurse clinical workspace for
   clinical roles on that clinic, or the logistics-only view for everyone else. */
import { useState } from "react";
import type { ClinicSession, LocalDate } from "../../model";
import { act, canViewClinicalForSession, fmtDate, fmtDateLong, fmtDateTime, fmtTime, fmtWeekdayDate, hhmmToMinutes, ix, persona, plural, sessionStats, staffName, today } from "../../model";
import { dispatch, usePersona, usePhState } from "../../store";
import { useNav } from "../../nav-context";
import { Button, Card, Chip, DataTable, EmptyState, Icon, Kpi, KpiStrip, PageHeader, Pill, SearchBox, Segmented } from "../../ui";
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

/** A day-list row: an appointment, or a scheduled break shown when one clinic is listed. */
type ListRow = { kind: "appt"; key: string; time: string; r: ApptRow } | { kind: "break"; key: string; time: string; end: string; session: ClinicSession };

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
  const shown = sessions.filter((s) => sessionFilter === "all" || s.id === sessionFilter);
  const all = dayAppointments(state, date);
  const inSession = all.filter((r) => sessionFilter === "all" || r.session.id === sessionFilter);
  const query = q.trim().toLowerCase();
  const appts = inSession
    .filter((r) => STATUS_OF[sf].includes(r.status))
    .filter((r) => !query || `${r.person.given} ${r.person.family} ${r.person.id} ${r.booking.id}`.toLowerCase().includes(query));
  /* Breaks are listed when one clinic is shown, as in a clinic day sheet. */
  const showBreaks = shown.length === 1 && sf === "active" && !query;
  const rows: ListRow[] = [
    ...appts.map((r): ListRow => ({ kind: "appt", key: r.booking.id, time: r.booking.slotStart, r })),
    ...(showBreaks ? shown[0].breaks.filter((b) => b.start >= shown[0].start && b.end <= shown[0].end).map((b): ListRow => ({ kind: "break", key: `${shown[0].id}-break-${b.start}`, time: b.start, end: b.end, session: shown[0] })) : []),
  ].sort((a, b) => (a.time !== b.time ? (a.time < b.time ? -1 : 1) : a.kind === b.kind ? 0 : a.kind === "break" ? 1 : -1));
  const count = (f: StatusFilter) => inSession.filter((r) => STATUS_OF[f].includes(r.status)).length;
  const stats = shown.map((s) => sessionStats(state, s.id));
  const k = {
    booked: stats.reduce((n, s) => n + s.booked, 0), slots: stats.reduce((n, s) => n + s.slots, 0), available: stats.reduce((n, s) => n + s.available, 0),
    inRoom: stats.reduce((n, s) => n + s.checkedIn + s.inProgress, 0), inProgress: stats.reduce((n, s) => n + s.inProgress, 0), completed: stats.reduce((n, s) => n + s.completed, 0),
  };
  const drafting = all.filter((r) => r.status === "in_progress" && (sessionFilter === "all" || r.session.id === sessionFilter)).length;
  const go = (params: Record<string, string>) => nav.setParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v !== "" && v !== "all")));
  const open = (r: ApptRow) => nav.setParams({ date, ...(sessionFilter !== "all" ? { session: sessionFilter } : {}), booking: r.booking.id });
  const clinicalAnywhere = p.perms.has("clinical.view");

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
    const label = clinical && (r.status === "checked_in" || r.status === "in_progress") ? (captureRule(state, r.session).ok ? "Continue" : "View") : "Details";
    return <Button size="sm" variant={label === "Continue" ? "primary" : "secondary"} onClick={(e) => { e.stopPropagation(); open(r); }}>{label}</Button>;
  };
  const qPill = (r: ApptRow) => {
    const ok = r.membership?.questionnaire === "complete" && r.membership?.consent === "complete";
    return <Pill tone={ok ? "ok" : "warn"} icon={ok ? "check" : "alert"} title={ok ? `Questionnaire and consent ${r.booking.consentVersion} completed ${fmtDateTime(r.booking.questionnaireCompletedAt)}, before the booking was confirmed` : "Questionnaire or consent incomplete"}>{ok ? "Complete" : "To complete"}</Pill>;
  };
  const breakLen = (row: Extract<ListRow, { kind: "break" }>) => `${hhmmToMinutes(row.end) - hhmmToMinutes(row.time)} minutes`;
  const cTime = (row: ListRow) => (
    <span className="ph-num">
      <span style={{ color: row.kind === "appt" ? "var(--ink)" : "var(--dim)", fontWeight: 600 }}>{row.time}</span>
      <span className="ph-faint" style={{ display: "block", fontSize: 11 }}>to {row.kind === "appt" ? row.r.slotEnd : row.end}</span>
    </span>
  );
  const cWho = (row: ListRow, extra?: boolean) => {
    if (row.kind === "break") return <span className="ph-dim">Scheduled break<span className="ph-faint" style={{ display: "block", fontSize: 11 }}>{breakLen(row)}, not bookable</span></span>;
    const r = row.r;
    return (
      <span style={{ display: "block", minWidth: 0 }}>
        <span style={{ color: "var(--ink)" }}>{r.person.given} {r.person.family}</span>
        <span className="ph-faint ph-mono" style={{ display: "block", fontSize: 10.5 }}>{r.person.id}, {r.booking.id}</span>
        {extra ? <span className="ph-faint" style={{ display: "block", fontSize: 11 }}>{r.programme.code}, {staffName(state, r.session.nurseId)}. Questionnaire {r.membership?.questionnaire === "complete" ? "complete" : "to complete"}</span> : null}
      </span>
    );
  };
  const cClinic = (row: ListRow) => {
    const s = row.kind === "appt" ? row.r.session : row.session;
    return <span className="ph-row-flex" style={{ gap: 6 }}><ProgTag code={sessionStats(state, s.id).programme.code} /><span className="ph-dim" style={{ maxWidth: 190, fontSize: 12, lineHeight: 1.35 }}>{s.room}</span></span>;
  };
  const cAtt = (row: ListRow) => row.kind === "break" ? <span className="ph-faint">No bookings</span> : (
    <span className="ph-row-flex" style={{ gap: 6 }}>
      <ApptPill status={row.r.status} rescheduled={!!row.r.booking.replacedBy} />
      {row.r.status === "not_arrived" && row.r.slotPassed ? <span className="ph-faint" style={{ fontSize: 11 }}>slot time passed</span> : null}
    </span>
  );
  const cAct = (row: ListRow) => (row.kind === "break" ? <span className="ph-faint" style={{ fontSize: 12 }}>{breakLen(row)}</span> : action(row.r));
  const byTime = (a: ListRow, b: ListRow) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0);
  const wide: Column<ListRow>[] = [
    { key: "time", header: "Time", cell: cTime, sort: byTime },
    { key: "who", header: "Participant", cell: (row) => cWho(row), sort: (a, b) => (a.kind === "appt" && b.kind === "appt" ? a.r.person.family.localeCompare(b.r.person.family) : byTime(a, b)) },
    { key: "clinic", header: "Room", nowrap: false, cell: cClinic },
    { key: "q", header: "Questionnaire", cell: (row) => (row.kind === "appt" ? qPill(row.r) : <span className="ph-faint">Not bookable</span>) },
    { key: "att", header: "Attendance", cell: cAtt },
    { key: "nurse", header: "Nurse", cell: (row) => (row.kind === "appt" ? staffName(state, row.r.session.nurseId) : "") },
    { key: "act", header: "Action", align: "right", cell: cAct },
  ];
  const compact: Column<ListRow>[] = [
    { key: "time", header: "Time", cell: cTime },
    { key: "who", header: "Participant", cell: (row) => cWho(row, true), nowrap: false },
    { key: "att", header: "Attendance", cell: cAtt },
    { key: "act", header: "Action", align: "right", cell: cAct },
  ];
  const mine = sessions.filter((s) => s.nurseId === p.id || s.supportIds.some((x) => x === p.id));
  const scope = shown.length === 1 ? `${sessionStats(state, shown[0].id).programme.code} clinic` : plural(shown.length, "clinic");

  return (
    <div className="ph-page">
      <div className="clx" ref={wrapRef}>
        <PageHeader
          eyebrow={date === t ? "Today" : date < t ? "Past clinic day" : "Upcoming clinic day"}
          title="Appointments"
          sub={sessions.length
            ? `${fmtDateLong(date)}. Times are Europe/Dublin${date === t ? `, as of ${fmtTime(state.clock.nowUtc)}` : ""}. Select an appointment to open the clinical workspace or, for logistics roles, the appointment details.`
            : `${fmtDateLong(date)}: no clinics on this day.`}
        />
        {sessions.length ? (
          <KpiStrip>
            <Kpi label="Booked" value={k.booked} sub={`of ${k.slots} slots, ${scope}`} hint="Confirmed bookings divided by bookable slots in the clinics shown. Breaks are not slots." />
            <Kpi label="Checked in" value={k.inRoom} icon="user" sub={drafting ? `${drafting} with capture in progress` : "Awaiting or with the nurse"} />
            <Kpi label="Completed" value={k.completed} icon="check" tone={k.completed ? "ok" : undefined} sub="Appointments completed. No report is released by this." />
            <Kpi label="Available" value={k.available} icon="calendar" tone="info" sub="Remaining bookable slots, breaks excluded" />
          </KpiStrip>
        ) : null}
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
            <DataTable rows={rows} columns={narrow ? compact : wide} rowKey={(row) => row.key} onRowClick={(row) => { if (row.kind === "appt") open(row.r); }} caption={`Appointments on ${fmtDate(date)}`}
              empty={<EmptyState title="No appointments match" icon="search">{query ? `Nothing on ${fmtDate(date)} matches "${q}".` : "Change the clinic or attendance filter."}</EmptyState>}
              footerNote={`rows: ${plural(appts.length, "appointment")}${showBreaks ? ` and ${plural(rows.length - appts.length, "break")}` : ""}.${clinicalAnywhere ? "" : " Clinical details are not visible to administrative users."}`} />
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
    Object.entries(nav.params).forEach(([key, v]) => { if (key !== "booking") rest[key] = v; });
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
