/* The top of a programme's detail: status, what was sold, the counts that matter (screening days,
   invited, booked, attended, released), its screening days, and the actions: Edit, Set live,
   Add screening day and Open as HR. */
import { useState } from "react";
import type { LocalDate, Programme, ProgrammeId } from "../../model";
import {
  PROGRAMME_METHOD_LABEL, addDays, fmtDate, fmtHm, fmtWeekdayDate, ix, programmeCounts, programmeStatus, rate, today,
} from "../../model";
import { useNav } from "../../nav-context";
import { dispatch, usePhState } from "../../store";
import { Button, Card, Icon, Pill } from "../../ui";
import { requestClientPortalProgramme } from "../ClientPortal/data";
import { NewProgrammeDialog } from "./NewProgramme";
import { progAct } from "./progActions";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** The first weekday on or after the later of today and the window start, inside the window when it can be. */
export function suggestDayFor(p: Programme, t: LocalDate): LocalDate {
  let d = p.windowStart > t ? p.windowStart : addDays(t, 7);
  for (let i = 0; i < 7; i++) {
    const wd = new Date(d + "T12:00:00Z").getUTCDay();
    if (wd !== 0 && wd !== 6) break;
    d = addDays(d, 1);
  }
  return d;
}
/** A plain request the screening days agent understands, e.g. "Acme Engineering, 26 October, point of care". */
export function dayRequestFor(p: Programme, t: LocalDate): string {
  const d = suggestDayFor(p, t);
  const [y, m, dd] = d.split("-").map(Number);
  const method = p.setup?.method === "poc" ? "point of care" : "lab bloods";
  return `${p.clientName}, ${dd} ${MONTHS[m - 1]}${String(y) !== t.slice(0, 4) ? ` ${y}` : ""}, ${method}`;
}

export function ProgrammeManage({ pid }: { pid: ProgrammeId }) {
  const s = usePhState();
  const nav = useNav();
  const [editing, setEditing] = useState(false);
  const p = ix(s).programmeById.get(pid);
  if (!p) return null;
  const t = today(s);
  const st = programmeStatus(p);
  const c = programmeCounts(s, pid);
  const invited = c.invited || p.setup?.headcount || 0;
  const days = s.screeningDays.days.filter((d) => d.programmeId === pid).sort((a, b) => (a.date < b.date ? -1 : 1));
  const upcomingDays = days.filter((d) => d.date >= t);
  const sessions = s.sessions.filter((x) => x.programmeId === pid && x.status !== "cancelled");
  const nextSession = sessions.filter((x) => x.date >= t).sort((a, b) => (a.date < b.date ? -1 : 1))[0];
  const nurse = (id: string) => ix(s).staffById.get(id)?.name || "Nurse needed";
  const addDay = () => nav.go({ page: "Clinics", tab: "days", params: { ask: dayRequestFor(p, t) } });
  const openHr = () => { requestClientPortalProgramme(pid); nav.openClientPortal?.(); };

  return (
    <Card className="pm-card">
      <div className="pm-top">
        <div className="pm-title">
          <Pill tone={st === "live" ? "ok" : "warn"} icon={st === "live" ? "check" : "edit"}>{st === "live" ? "Live" : "Draft"}</Pill>
          <span className="pm-what">
            {p.setup ? <>{p.setup.serviceLabel}{/point of care|lab/i.test(p.setup.serviceLabel) ? "" : `, ${PROGRAMME_METHOD_LABEL[p.setup.method].toLowerCase()}`}{p.setup.flu ? ", with flu" : ""}</> : "Comprehensive lab screen"}
            {" "}<span className="pm-dim">Code <b className="pm-mono">{p.inviteCode}</b>{p.setup ? `, HR ${p.setup.hrName}` : ""}</span>
          </span>
        </div>
        <div className="pm-actions">
          <Button size="sm" icon="edit" onClick={() => setEditing(true)}>Edit</Button>
          {p.setup && st === "draft" ? <Button size="sm" icon="check" onClick={() => dispatch(progAct.setStatus(pid, "live"))}>Set live</Button> : null}
          <Button size="sm" icon="eye" onClick={openHr}>Open as HR</Button>
          <Button size="sm" variant="primary" icon="plus" onClick={addDay}>Add screening day</Button>
        </div>
      </div>
      <div className="pm-counts">
        <button type="button" className="pm-count" onClick={() => nav.go({ page: "Clinics", tab: "days" })}>
          <b>{days.length || sessions.length}</b><span>{days.length || !sessions.length ? "Screening days" : "Clinic sessions"}</span>
          <i>{nextSession ? `Next ${fmtDate(nextSession.date)}` : "None booked yet"}</i>
        </button>
        <button type="button" className="pm-count" onClick={() => nav.go({ page: "Programmes", tab: "invitations", params: { programme: pid } })}>
          <b>{invited.toLocaleString("en-IE")}</b><span>Invited</span><i>{c.invited ? "On the roster" : "Expected headcount"}</i>
        </button>
        <button type="button" className="pm-count" onClick={() => nav.go({ page: "Clinics", tab: "appointments" })}>
          <b>{c.booked}</b><span>Booked</span><i>{invited ? `${rate(c.booked, invited)} of invited` : "No invites yet"}</i>
        </button>
        <div className="pm-count pm-static"><b>{c.attended}</b><span>Attended</span><i>{c.upcoming} still to come</i></div>
        <button type="button" className="pm-count" onClick={() => nav.go({ page: "Results", tab: "review" })}>
          <b>{c.released}</b><span>Released</span><i>{c.attended ? `${rate(c.released, c.attended)} of attended` : "Nothing to release yet"}</i>
        </button>
      </div>
      {days.length || !sessions.length ? (
        <div className="pm-days">
          <div className="pm-days-h">Screening days</div>
          {upcomingDays.length ? upcomingDays.slice(0, 4).map((d) => (
            <button key={d.id} type="button" className="pm-day" onClick={() => nav.go({ page: "Clinics", tab: "days", params: { day: d.id } })}>
              <Icon name="calendar" size={14} />
              <span className="pm-day-d">{fmtWeekdayDate(d.date)}</span>
              <span className="pm-day-x">{fmtHm(d.start)} to {fmtHm(d.end)}, {d.room.trim() || "room to confirm"}, {nurse(d.nurseId)}</span>
              <Pill tone={d.status === "published" ? "ok" : "warn"} icon={null}>{d.status === "published" ? "Published" : "Draft"}</Pill>
            </button>
          )) : (
            <div className="pm-empty">
              <span>No screening day yet. Describe it to the agent: date, nurse, times and room.</span>
              <Button size="sm" variant="ghost" icon="plus" onClick={addDay}>Add screening day</Button>
            </div>
          )}
          {upcomingDays.length > 4 ? <div className="pm-dim" style={{ fontSize: 12 }}>{upcomingDays.length - 4} more in Clinics, Screening days.</div> : null}
        </div>
      ) : null}
      {editing ? <NewProgrammeDialog edit={p} onClose={() => setEditing(false)} onDone={() => setEditing(false)} /> : null}
    </Card>
  );
}
