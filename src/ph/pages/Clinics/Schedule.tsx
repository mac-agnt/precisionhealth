/* Clinics schedule: the business calendar (pages/Calendar) scoped to clinics and screening days, so
   there is one calendar, not two. Selecting a session opens the session drawer with local edits,
   impact preview and overlap detection. The rooms and resources timeline stays as a second view. */
import type { LocalDate } from "../../model";
import { calendarEvents, fmtDate, fmtWeekdayDate, plural, sessionStats, today } from "../../model";
import { usePhState } from "../../store";
import { useNav } from "../../nav-context";
import { Button, Card, CardHeader, Icon, PageHeader, Segmented } from "../../ui";
import { allStaffConflicts, roomClashes, sessionDays, sortSessions } from "./selectors";
import { SessionDrawer } from "./SessionPanel";
import CalendarBoard from "../Calendar/CalendarBoard";

type Mode = "calendar" | "rooms";

export default function Schedule() {
  const state = usePhState();
  const nav = useNav();
  const mode: Mode = nav.params.view === "rooms" ? "rooms" : "calendar";
  const selected = nav.params.session || "";
  const sel = selected ? state.sessions.find((s) => s.id === selected) : undefined;
  const set = (p: Record<string, string>) => nav.setParams(Object.fromEntries(Object.entries({ ...nav.params, ...p }).filter(([, v]) => v !== "")));
  const conflicted = allStaffConflicts(state);
  const clashes = state.sessions.filter((s) => roomClashes(state, s).length > 0);
  const days = sessionDays(state);
  const selectedEvent = sel ? calendarEvents(state).find((e) => e.sessionId === sel.id)?.id : undefined;
  const openCalendar = () => nav.go({ page: "Calendar", tab: "all", params: { view: nav.params.view && nav.params.view !== "rooms" ? nav.params.view : "week", ...(nav.params.date ? { date: nav.params.date } : {}) } });

  return (
    <div className="ph-page">
      <div className="clx">
        <PageHeader
          title="Schedule"
          sub={`${plural(state.sessions.length, "session")} across ${plural(state.programmes.length, "programme")}${days.length ? `, ${fmtDate(days[0])} to ${fmtDate(days[days.length - 1])}` : ""}. The same calendar as the Calendar page, showing clinics and screening days. Select a session to see its slots and edit it.`}
          actions={<>
            <Segmented value={mode} options={[{ id: "calendar", label: "Calendar" }, { id: "rooms", label: "Rooms and resources" }]} onChange={(v) => set({ view: v === "rooms" ? "rooms" : "", ev: "" })} label="Schedule view" />
            <Button size="sm" icon="calendar" onClick={openCalendar}>Open full calendar</Button>
          </>}
        />
        <div className={"clx-banner " + (conflicted.length || clashes.length ? "warn" : "info")}>
          <Icon name={conflicted.length || clashes.length ? "alert" : "shield"} size={15} style={{ color: conflicted.length || clashes.length ? "var(--warn)" : "var(--accent)", marginTop: 1 }} />
          <span>
            {conflicted.length || clashes.length
              ? `${plural(conflicted.length, "session")} with a staff overlap and ${plural(clashes.length, "session")} with a room clash. Open the sessions marked with a warning.`
              : `Overlap check: no nurse, support or room overlaps across all ${state.sessions.length} sessions. Edits that would create one are blocked before they apply.`}
          </span>
        </div>

        {mode === "rooms" ? <RoomsView onSelect={(id) => set({ session: id })} /> : (
          <CalendarBoard scope={["clinics"]} defaultView="week" selectedId={selectedEvent}
            onEventClick={(e) => { if (!e.sessionId) return false; set({ session: e.sessionId, ev: "" }); return true; }}
            sideFooter={<button type="button" className="cal-linkbtn" style={{ textAlign: "left" }} onClick={openCalendar}>See flu, occupational health, sales and tasks in the full calendar</button>} />
        )}
      </div>
      <SessionDrawer session={sel} onClose={() => set({ session: "" })} />
    </div>
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
