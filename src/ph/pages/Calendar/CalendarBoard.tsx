/* The one business calendar, laid out like Google Calendar: a round "+ Schedule" button, a mini month
   and the type layers on the left, and Week (default), Day, Month and Agenda views over every dated
   thing in the store (src/ph/model/calendar.ts). Week and Day show a full 24 hour grid that opens at
   7 AM, with a red line at the demo clock. Click an empty slot to schedule at that time, click an
   event for its actions, drag an event to move it. Every filter lives in the URL, so a link opens
   the same view. Used by the Calendar page and, scoped to clinics, by Clinics, Schedule. */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import type { CalDim, CalEvent, CalFilter, CalView, LocalDate } from "../../model";
import {
  CAL_DEFAULT_OFF, CAL_GROUPS, CAL_KIND_BY_ID, addDays, addMonths, calClients, calGroupFromParam, calGroupOf, calKindColor, calLayoutDay, calMatches, calRange, calStep,
  calendarEvents, dublinOffsetMinutes, dublinToUtc, fmtDateLong, fmtWeekdayDate, hhmmToMinutes, localTimeOf, minutesToHhmm, staffName, startOfWeek, today, weekdayOf,
} from "../../model";
import { dispatch, usePersona, usePhState } from "../../store";
import { useNav } from "../../nav-context";
import { Button, Icon, Pill, SearchBox, Segmented, Switch } from "../../ui";
import { schedAct } from "./schedActions";
import ScheduleDialog from "./ScheduleDialog";
import EventCard from "./EventCard";
import { ampm, overlayRoot, timeLabel } from "./util";
import "./calendar.css";

const VIEWS: Array<{ id: CalView; label: string }> = [
  { id: "day", label: "Day" }, { id: "week", label: "Week" }, { id: "month", label: "Month" }, { id: "agenda", label: "Agenda" },
];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const isDate = (v: string | undefined): v is LocalDate => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
const list = (v: string | undefined) => (v ? v.split(",").map((x) => x.trim()).filter(Boolean) : []);
const dayNum = (d: LocalDate) => Number(d.slice(8, 10));
const monthTitle = (d: LocalDate) => `${MONTHS_LONG[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;
function rangeTitle(view: CalView, date: LocalDate): string {
  if (view === "day") return fmtDateLong(date);
  if (view === "week") {
    const s = startOfWeek(date), e = addDays(s, 6);
    if (s.slice(0, 7) === e.slice(0, 7)) return monthTitle(s);
    const sm = MONTHS[Number(s.slice(5, 7)) - 1], em = MONTHS[Number(e.slice(5, 7)) - 1];
    return s.slice(0, 4) === e.slice(0, 4) ? `${sm} to ${em} ${e.slice(0, 4)}` : `${sm} ${s.slice(0, 4)} to ${em} ${e.slice(0, 4)}`;
  }
  return monthTitle(date);
}
const shortTime = (e: CalEvent) => (e.due ? ampm(e.due) : !e.allDay && e.time ? ampm(e.time.start) : null);
const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "AM" : "PM"}`;
const tzLabel = (d: LocalDate) => { const o = dublinOffsetMinutes(Date.parse(dublinToUtc(d, "12:00"))) / 60; return `GMT+${String(o).padStart(2, "0")}`; };

function useNarrow(px: number): boolean {
  const [n, setN] = useState(() => typeof window !== "undefined" && window.innerWidth < px);
  useEffect(() => {
    const h = () => setN(window.innerWidth < px);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, [px]);
  return n;
}

/* Drag state for moving events. One drag at a time, so a module variable is enough. */
let dragging: { ev: CalEvent; offsetMin: number } | null = null;
function startDrag(e: CalEvent, ev: ReactDragEvent<HTMLElement>, hourPx?: number) {
  if (!e.movable) { ev.preventDefault(); return; }
  const rect = ev.currentTarget.getBoundingClientRect();
  dragging = { ev: e, offsetMin: hourPx ? ((ev.clientY - rect.top) / hourPx) * 60 : 0 };
  ev.dataTransfer.effectAllowed = "move";
  ev.dataTransfer.setData("text/plain", e.id);
}
function dropOn(date: LocalDate, start?: string | null) {
  const d = dragging;
  dragging = null;
  if (!d) return;
  const e = d.ev;
  const keepTime = e.due || (!e.allDay && e.time ? e.time.start : null);
  const sameStart = start === undefined ? keepTime : start;
  if (e.date === date && (sameStart || null) === (keepTime || null)) return;
  dispatch(schedAct.move(e.id, date, start === undefined ? undefined : start));
}

export interface CalendarBoardProps {
  /** Only these groups exist in this calendar (Clinics, Schedule passes ["clinics"]). */
  scope?: string[];
  /** View when the URL does not say. */
  defaultView?: CalView;
  /** Return true when the click was handled (Schedule opens its session panel). */
  onEventClick?: (e: CalEvent) => boolean;
  /** Shown at the bottom of the filter panel. */
  sideFooter?: ReactNode;
  /** Id of the event to show as selected without a popover. */
  selectedId?: string;
  /** Show "+ Schedule" and let empty slots and drags create and move things. On by default for the full calendar. */
  schedule?: boolean;
}

export default function CalendarBoard({ scope, defaultView = "week", onEventClick, sideFooter, selectedId, schedule }: CalendarBoardProps) {
  const state = usePhState();
  const nav = useNav();
  const p = usePersona();
  const narrow = useNarrow(760);
  const canSchedule = (schedule ?? !scope) && !p.isParticipant;
  const [sheet, setSheet] = useState(false);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [creating, setCreating] = useState<{ date: LocalDate; time: string | null } | null>(null);
  const t = today(state);
  const P = nav.params;

  const view: CalView = (VIEWS.find((v) => v.id === P.view)?.id) || (P.view === "list" ? "agenda" : narrow ? "agenda" : defaultView);
  const date: LocalDate = isDate(P.date) ? P.date : t;
  const groupsAll = scope ? CAL_GROUPS.filter((g) => scope.includes(g.id)) : CAL_GROUPS;
  const groups = P.types !== undefined ? [...new Set(list(P.types).map(calGroupFromParam))].filter((g): g is string => !!g && groupsAll.some((x) => x.id === g)) : groupsAll.filter((g) => !CAL_DEFAULT_OFF.includes(g.id)).map((g) => g.id);
  const status = P.status === "todo" || P.status === "done" ? P.status : null;
  const f: CalFilter = { groups, clients: list(P.clients), people: list(P.people), q: P.q || "", mine: P.mine === "1" && !p.isParticipant ? p.id : null, byMe: P.byme === "1" && !p.isParticipant ? p.id : null, status };

  const set = (patch: Record<string, string | null>) => {
    const next: Record<string, string> = { ...P };
    for (const [k, v] of Object.entries(patch)) { if (v === null || v === "") delete next[k]; else next[k] = v; }
    nav.setParams(next);
  };

  const all = calendarEvents(state);
  const scoped = useMemo(() => (scope ? all.filter((e) => scope.includes(calGroupOf(e.kind))) : all), [all, scope]);
  const range = calRange(view, date);
  const inRange = useMemo(() => scoped.filter((e) => e.date >= range.from && e.date <= range.to), [scoped, range.from, range.to]);
  const shown = useMemo(() => inRange.filter((e) => calMatches(e, f)), [inRange, f.groups.join(), f.clients.join(), f.people.join(), f.q, f.mine, f.byMe, f.status]); // eslint-disable-line react-hooks/exhaustive-deps
  const count = (dim: CalDim, pred: (e: CalEvent) => boolean) => inRange.filter((e) => pred(e) && calMatches(e, f, dim)).length;

  const selected = P.ev ? scoped.find((e) => e.id === P.ev) || null : null;
  /* An event selected by link (or just created) has no click position: anchor it to its block once drawn. */
  useLayoutEffect(() => {
    if (!selected || anchor || narrow) return;
    const el = document.querySelector<HTMLElement>(`[data-ev="${CSS.escape(selected.id)}"]`);
    if (el) { el.scrollIntoView({ block: "nearest" }); setAnchor(el.getBoundingClientRect()); }
  }, [selected?.id, view, date]); // eslint-disable-line react-hooks/exhaustive-deps
  const pick = (e: CalEvent, el?: HTMLElement | null) => {
    if (onEventClick && onEventClick(e)) return;
    setAnchor(el ? el.getBoundingClientRect() : null);
    set({ ev: e.id });
  };
  const closePop = () => { setAnchor(null); set({ ev: null }); };
  const goDay = (d: LocalDate) => set({ view: "day", date: d, ev: null });
  const createAt = canSchedule ? (d: LocalDate, time: string | null) => { setAnchor(null); if (P.ev) set({ ev: null }); setCreating({ date: d, time }); } : undefined;
  const onMove = canSchedule ? dropOn : undefined;
  const activeFilters = (P.types !== undefined ? 1 : 0) + f.clients.length + f.people.length + (f.q ? 1 : 0) + (f.mine ? 1 : 0) + (f.byMe ? 1 : 0) + (status ? 1 : 0);
  const resetFilters = () => set({ types: null, clients: null, people: null, q: null, mine: null, byme: null, status: null, ev: null });

  const side = (
    <FilterPanel
      date={date} today={t} scoped={scoped} f={f} groupsAll={groupsAll} inRange={inRange} count={count} set={set} scopeOnly={!!scope}
      persona={p.isParticipant ? null : { id: p.id, first: p.name.split(" ")[0] }} footer={sideFooter} onDate={(d) => set({ date: d, ev: null })}
      onReset={resetFilters} activeFilters={activeFilters} narrow={narrow}
      create={canSchedule && !narrow ? <button type="button" className="cal-create" onClick={() => setCreating({ date: date < t ? t : date, time: null })}><Icon name="plus" size={20} stroke={2.2} /><span>Schedule</span></button> : null}
    />
  );

  return (
    <div className={"cal" + (narrow ? " narrow" : "")}>
      {narrow ? null : <aside className="cal-side" aria-label="Calendar filters">{side}</aside>}
      <section className="cal-main">
        <div className="cal-toolbar">
          <div className="cal-nav">
            <button type="button" className="cal-today" onClick={() => set({ date: t, ev: null })}>Today</button>
            <button type="button" className="cal-iconbtn lg" aria-label="Previous" onClick={() => set({ date: calStep(view, date, -1), ev: null })}><Icon name="chevronLeft" size={18} /></button>
            <button type="button" className="cal-iconbtn lg" aria-label="Next" onClick={() => set({ date: calStep(view, date, 1), ev: null })}><Icon name="chevronRight" size={18} /></button>
            <h2 className="cal-title">{narrow && view !== "day" ? rangeTitle(view, date).replace(/^(\w{3})\w* /, "$1 ") : rangeTitle(view, date)}</h2>
            {narrow ? <button type="button" className="cal-iconbtn lg cal-filterbtn" onClick={() => setSheet(true)} aria-expanded={sheet} aria-label="Filters"><Icon name="filter" size={17} />{activeFilters ? <span className="cal-badge">{activeFilters}</span> : null}</button> : null}
          </div>
          <div className="cal-tools">
            {activeFilters && !narrow ? <button type="button" className="cal-linkbtn" onClick={resetFilters}>Clear filters ({activeFilters})</button> : null}
            <Segmented value={view} options={VIEWS} onChange={(v) => set({ view: v, ev: null })} label="Calendar view" />
          </div>
        </div>
        {view === "month" ? <MonthView date={date} today={t} events={shown} onPick={pick} onDay={goDay} selectedId={selectedId || selected?.id} compact={narrow} onCreate={createAt} onMove={onMove} /> : null}
        {view === "week" ? <TimeGrid days={Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(date), i))} today={t} now={state.clock.nowUtc} events={shown} onPick={pick} onDay={goDay} selectedId={selectedId || selected?.id} onCreate={createAt} onMove={onMove} narrow={narrow} /> : null}
        {view === "day" ? <TimeGrid days={[date]} today={t} now={state.clock.nowUtc} events={shown} onPick={pick} onDay={goDay} selectedId={selectedId || selected?.id} wide onCreate={createAt} onMove={onMove} narrow={narrow} /> : null}
        {view === "agenda" ? <AgendaView events={shown} today={t} onPick={pick} selectedId={selectedId || selected?.id} onNext={() => set({ date: calStep("agenda", date, 1) })} /> : null}
        {!shown.length && view !== "agenda" ? <div className="cal-none">Nothing {view === "day" ? "on this day" : view === "week" ? "this week" : "this month"} with these filters.{activeFilters ? <> <button type="button" className="cal-linkbtn" onClick={resetFilters}>Clear filters</button></> : null}</div> : null}
      </section>
      {narrow && sheet ? <Sheet title="Filters" onClose={() => setSheet(false)}>{side}</Sheet> : null}
      {narrow && canSchedule ? <button type="button" className="cal-fab" aria-label="Schedule" onClick={() => setCreating({ date: date < t ? t : date, time: null })}><Icon name="plus" size={24} stroke={2.2} /></button> : null}
      {selected ? <EventCard ev={selected} anchor={anchor} onClose={closePop} narrow={narrow} canAct={canSchedule} /> : null}
      {creating ? (
        <ScheduleDialog date={creating.date} time={creating.time} onClose={() => setCreating(null)}
          onCreated={(calId, d) => { setCreating(null); setAnchor(null); set({ date: d, ev: calId }); }} />
      ) : null}
    </div>
  );
}

/* ================================================================================================
   Filter panel
   ================================================================================================ */

function FilterPanel({ date, today: t, scoped, f, groupsAll, inRange, count, set, persona, footer, onDate, onReset, activeFilters, scopeOnly, create, narrow }: {
  date: LocalDate; today: LocalDate; scoped: CalEvent[]; f: CalFilter; groupsAll: typeof CAL_GROUPS; inRange: CalEvent[];
  count: (dim: CalDim, pred: (e: CalEvent) => boolean) => number; set: (p: Record<string, string | null>) => void;
  persona: { id: string; first: string } | null; footer?: ReactNode; onDate: (d: LocalDate) => void; onReset: () => void; activeFilters: number; scopeOnly: boolean; create: ReactNode; narrow: boolean;
}) {
  const state = usePhState();
  const [q, setQ] = useState(f.q);
  const [allClients, setAllClients] = useState(false);
  useEffect(() => { setQ(f.q); }, [f.q]);
  useEffect(() => {
    if (q === f.q) return;
    const h = window.setTimeout(() => set({ q: q || null, ev: null }), 220);
    return () => window.clearTimeout(h);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (key: "types" | "clients" | "people", cur: string[], id: string, allIds?: string[]) => {
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    if (key === "types" && allIds) {
      const def = allIds.filter((g) => !CAL_DEFAULT_OFF.includes(g));
      const same = next.length === def.length && def.every((g) => next.includes(g));
      set({ types: same ? null : next.join(",") || "none", ev: null });
    } else set({ [key]: next.join(",") || null, ev: null });
  };
  const clients = calClients(inRange.length ? inRange : scoped);
  for (const c of f.clients) if (!clients.some((x) => x.name === c)) clients.push({ name: c, n: 0 });
  const shownClients = allClients ? clients : clients.slice(0, 6);
  const staffIds = new Set<string>(scoped.flatMap((e) => e.staffIds));
  const people = state.staff.filter((s) => staffIds.has(s.id));

  return (
    <div className="cal-side-in">
      {create}
      <MiniMonth date={date} today={t} events={scoped.filter((e) => calMatches(e, f))} onDate={onDate} />
      {narrow ? <SearchBox value={q} onChange={setQ} placeholder="Search the calendar" width="100%" /> : null}

      {!scopeOnly || groupsAll.length > 1 ? (
        <FilterBlock title="My calendars">
          {groupsAll.map((g) => (
            <CheckRow key={g.id} on={f.groups.includes(g.id)} color={g.color} label={g.label} hint={g.hint}
              n={count("groups", (e) => calGroupOf(e.kind) === g.id)} onToggle={() => toggle("types", f.groups, g.id, groupsAll.map((x) => x.id))} />
          ))}
        </FilterBlock>
      ) : (
        <FilterBlock title="Showing">
          {Object.values(CAL_KIND_BY_ID).filter((k) => groupsAll.some((g) => g.id === k.group)).map((k) => (
            <div key={k.id} className="cal-legend"><span className="cal-sq" style={{ background: k.color }} />{k.label}<span className="ph-grow" /><span className="ph-num ph-faint">{inRange.filter((e) => e.kind === k.id && calMatches(e, f)).length}</span></div>
          ))}
        </FilterBlock>
      )}

      {persona ? (
        <FilterBlock title="Show">
          <label className="cal-mine">
            <span>Only mine<span className="cal-mine-sub">Things {persona.first} is on</span></span>
            <Switch on={!!f.mine} onChange={(on) => set({ mine: on ? "1" : null, ev: null })} label="Only mine" />
          </label>
          {!scopeOnly ? (
            <label className="cal-mine">
              <span>Scheduled by me<span className="cal-mine-sub">What {persona.first} put in the calendar</span></span>
              <Switch on={!!f.byMe} onChange={(on) => set({ byme: on ? "1" : null, ev: null })} label="Scheduled by me" />
            </label>
          ) : null}
          <div className="cal-status">
            <Segmented value={f.status || "all"} label="Status" onChange={(v) => set({ status: v === "all" ? null : v, ev: null })}
              options={[{ id: "all", label: "All" }, { id: "todo", label: "To do" }, { id: "done", label: "Done" }]} />
          </div>
        </FilterBlock>
      ) : null}

      {clients.length ? (
        <FilterBlock title="Client" right={f.clients.length ? <button type="button" className="cal-linkbtn" onClick={() => set({ clients: null, ev: null })}>All clients</button> : null} startOpen={false}>
          {shownClients.map((c) => (
            <CheckRow key={c.name} on={f.clients.includes(c.name)} label={c.name} n={count("clients", (e) => e.client === c.name)} onToggle={() => toggle("clients", f.clients, c.name)} />
          ))}
          {clients.length > 6 ? <button type="button" className="cal-linkbtn" style={{ marginTop: 4, alignSelf: "flex-start" }} onClick={() => setAllClients(!allClients)}>{allClients ? "Show fewer" : `Show all ${clients.length} clients`}</button> : null}
        </FilterBlock>
      ) : null}

      {people.length ? (
        <FilterBlock title="Person" right={f.people.length ? <button type="button" className="cal-linkbtn" onClick={() => set({ people: null, ev: null })}>Everyone</button> : null} startOpen={false}>
          {people.map((s) => (
            <CheckRow key={s.id} on={f.people.includes(s.id)} avatar={s.initials} tint={s.tint} label={s.name} n={count("people", (e) => e.staffIds.includes(s.id))} onToggle={() => toggle("people", f.people, s.id)} />
          ))}
        </FilterBlock>
      ) : null}
      {!narrow ? <SearchBox value={q} onChange={setQ} placeholder="Search the calendar" width="100%" /> : null}
      {activeFilters ? <Button size="sm" variant="ghost" icon="refresh" onClick={onReset}>Reset filters</Button> : null}
      {footer}
    </div>
  );
}

function FilterBlock({ title, right, children, startOpen = true }: { title: string; right?: ReactNode; children: ReactNode; startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  return (
    <div className="cal-block">
      <div className="cal-block-h">
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}>
          {title}<Icon name={open ? "chevronDown" : "chevronRight"} size={14} />
        </button>
        <span className="ph-grow" />{right}
      </div>
      {open ? <div className="cal-block-b">{children}</div> : null}
    </div>
  );
}

function CheckRow({ on, color, avatar, tint, label, hint, n, onToggle }: { on: boolean; color?: string; avatar?: string; tint?: string; label: string; hint?: string; n: number; onToggle: () => void }) {
  return (
    <button type="button" role="checkbox" aria-checked={on} className={"cal-check" + (on ? " on" : "")} onClick={onToggle} title={hint || label}>
      <span className="cal-box" style={{ "--c": color || "var(--accent)" } as CSSProperties}>{on ? <Icon name="check" size={12} stroke={2.6} /> : null}</span>
      {avatar ? <span className="cal-av" style={{ background: tint }}>{avatar}</span> : null}
      <span className="cal-check-l">{label}</span>
      <span className="ph-num cal-n">{n || ""}</span>
    </button>
  );
}

function MiniMonth({ date, today: t, events, onDate }: { date: LocalDate; today: LocalDate; events: CalEvent[]; onDate: (d: LocalDate) => void }) {
  const [month, setMonth] = useState(date.slice(0, 8) + "01");
  useEffect(() => { setMonth(date.slice(0, 8) + "01"); }, [date.slice(0, 7)]); // eslint-disable-line react-hooks/exhaustive-deps
  const r = calRange("month", month);
  const days: LocalDate[] = [];
  for (let d = r.from; d <= r.to; d = addDays(d, 1)) days.push(d);
  const busy = new Set<string>();
  for (const e of events) if (e.date >= r.from && e.date <= r.to) busy.add(e.date);
  return (
    <div className="cal-mini" aria-label="Pick a date">
      <div className="cal-mini-h">
        <span>{monthTitle(month)}</span>
        <span className="ph-grow" />
        <button type="button" className="cal-iconbtn" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}><Icon name="chevronLeft" size={15} /></button>
        <button type="button" className="cal-iconbtn" aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}><Icon name="chevronRight" size={15} /></button>
      </div>
      <div className="cal-mini-g">
        {DOW.map((d) => <span key={d} className="cal-mini-dow">{d.charAt(0)}</span>)}
        {days.map((d) => {
          const out = d.slice(0, 7) !== month.slice(0, 7);
          return (
            <button key={d} type="button" onClick={() => onDate(d)} aria-label={fmtDateLong(d)} aria-current={d === date ? "date" : undefined}
              className={"cal-mini-d" + (out ? " out" : "") + (d === t ? " today" : "") + (d === date && d !== t ? " sel" : "") + (busy.has(d) ? " busy" : "")}>
              {dayNum(d)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ================================================================================================
   Views
   ================================================================================================ */

function Chip({ e, onPick, selected, showTime = true, draggable }: { e: CalEvent; onPick: (e: CalEvent, el: HTMLElement) => void; selected: boolean; showTime?: boolean; draggable?: boolean }) {
  const c = calKindColor(e.kind);
  const solid = e.allDay && !e.due;
  return (
    <button type="button" data-ev={e.id} className={"cal-chip" + (solid ? " solid" : "") + (e.tentative ? " tentative" : "") + (e.done ? " done" : "") + (selected ? " sel" : "")}
      style={{ "--c": c } as CSSProperties} onClick={(ev) => { ev.stopPropagation(); onPick(e, ev.currentTarget); }} title={`${e.title}, ${timeLabel(e)}`}
      draggable={!!draggable && !!e.movable} onDragStart={(ev) => startDrag(e, ev)}>
      {solid ? null : <span className="cal-chip-dot" />}
      {showTime && shortTime(e) ? <span className="cal-chip-t ph-num">{shortTime(e)}</span> : null}
      <span className="cal-chip-l">{e.title}</span>
    </button>
  );
}

function MonthView({ date, today: t, events, onPick, onDay, selectedId, compact, onCreate, onMove }: {
  date: LocalDate; today: LocalDate; events: CalEvent[]; onPick: (e: CalEvent, el: HTMLElement) => void; onDay: (d: LocalDate) => void; selectedId?: string; compact?: boolean;
  onCreate?: (d: LocalDate, time: string | null) => void; onMove?: (d: LocalDate, start?: string | null) => void;
}) {
  const r = calRange("month", date);
  const days: LocalDate[] = [];
  for (let d = r.from; d <= r.to; d = addDays(d, 1)) days.push(d);
  const byDay = new Map<string, CalEvent[]>();
  for (const e of events) { const a = byDay.get(e.date) || []; a.push(e); byDay.set(e.date, a); }
  const [over, setOver] = useState<string | null>(null);
  const MAX = 4;
  return (
    <div className="cal-month" role="grid" aria-label={monthTitle(date)}>
      {DOW.map((d) => <div key={d} className="cal-month-dow" role="columnheader">{d}</div>)}
      {days.map((d) => {
        const evs = byDay.get(d) || [];
        const out = d.slice(0, 7) !== date.slice(0, 7);
        const more = evs.length - MAX;
        return (
          <div key={d} role="gridcell" className={"cal-cell" + (out ? " out" : "") + (d === t ? " today" : "") + (over === d ? " over" : "") + (onCreate ? " can-create" : "")}
            onClick={onCreate ? () => onCreate(d, null) : undefined}
            onDragOver={onMove ? (ev) => { if (dragging) { ev.preventDefault(); setOver(d); } } : undefined} onDragLeave={() => setOver((x) => (x === d ? null : x))}
            onDrop={onMove ? (ev) => { ev.preventDefault(); setOver(null); onMove(d); } : undefined}>
            <button type="button" className="cal-cell-n" onClick={(ev) => { ev.stopPropagation(); onDay(d); }} aria-label={`Open ${fmtDateLong(d)}`}>{dayNum(d) === 1 && !compact ? `${dayNum(d)} ${MONTHS[Number(d.slice(5, 7)) - 1]}` : dayNum(d)}</button>
            {compact ? (
              evs.length ? (
                <button type="button" className="cal-cell-dots" onClick={(ev) => { ev.stopPropagation(); onDay(d); }} aria-label={`${evs.length} items on ${fmtDateLong(d)}`}>
                  <span className="cal-dots">{evs.slice(0, 6).map((e) => <span key={e.id} className="cal-dot" style={{ background: calKindColor(e.kind) }} />)}</span>
                  <span className="ph-num">{evs.length}</span>
                </button>
              ) : null
            ) : <div className="cal-cell-evs">
              {evs.slice(0, more > 0 ? MAX - 1 : MAX).map((e) => <Chip key={e.id} e={e} onPick={onPick} selected={selectedId === e.id} draggable={!!onMove} />)}
              {more > 0 ? <button type="button" className="cal-more" onClick={(ev) => { ev.stopPropagation(); onDay(d); }}>{more + 1} more</button> : null}
            </div>}
          </div>
        );
      })}
    </div>
  );
}

const HOUR_PX = 48;
function TimeGrid({ days, today: t, now, events, onPick, onDay, selectedId, wide, onCreate, onMove, narrow }: {
  days: LocalDate[]; today: LocalDate; now: string; events: CalEvent[]; onPick: (e: CalEvent, el: HTMLElement) => void; onDay: (d: LocalDate) => void; selectedId?: string; wide?: boolean;
  onCreate?: (d: LocalDate, time: string | null) => void; onMove?: (d: LocalDate, start?: string | null) => void; narrow?: boolean;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [ghost, setGhost] = useState<{ d: LocalDate; min: number } | null>(null);
  const [overAll, setOverAll] = useState<string | null>(null);
  const byDay = days.map((d) => events.filter((e) => e.date === d));
  const timedAll = byDay.flat().filter((e) => !e.allDay && e.time);
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const top = (hhmm: string) => (hhmmToMinutes(hhmm) / 60) * HOUR_PX;
  const nowMin = hhmmToMinutes(localTimeOf(now));
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const earliest = Math.min(...timedAll.map((e) => hhmmToMinutes(e.time!.start)), 7 * 60);
    el.scrollTop = Math.max(0, (earliest / 60) * HOUR_PX - 8);
  }, [days[0]]); // eslint-disable-line react-hooks/exhaustive-deps
  const cols = { "--days": days.length } as CSSProperties;
  const minAt = (ev: { clientY: number; currentTarget: HTMLElement }, offset = 0) => {
    const r = ev.currentTarget.getBoundingClientRect();
    const m = ((ev.clientY - r.top) / HOUR_PX) * 60 - offset;
    return Math.max(0, Math.min(23 * 60 + 30, Math.round(m / 15) * 15));
  };
  const clickSlot = (d: LocalDate, ev: ReactMouseEvent<HTMLDivElement>) => {
    if (!onCreate) return;
    const r = ev.currentTarget.getBoundingClientRect();
    const m = Math.floor((((ev.clientY - r.top) / HOUR_PX) * 60) / 30) * 30;
    onCreate(d, minutesToHhmm(Math.min(23 * 60, m)));
  };
  return (
    <div className={"cal-tg" + (wide ? " wide" : "")}>
      <div className="cal-tg-head" style={cols}>
        <div className="cal-tg-gutter cal-tz" title="Dublin time">{tzLabel(days[0])}</div>
        {days.map((d) => (
          <button key={d} type="button" className={"cal-tg-day" + (d === t ? " today" : "") + (d < t ? " past" : "")} onClick={() => onDay(d)} disabled={wide} aria-label={fmtDateLong(d)}>
            <span className="cal-tg-dow">{DOW[(weekdayOf(d) + 6) % 7]}</span>
            <span className="cal-tg-num">{dayNum(d)}</span>
          </button>
        ))}
      </div>
      <div className="cal-tg-all" style={cols}>
        <div className="cal-tg-gutter cal-tg-alllabel">{byDay.some((a) => a.some((e) => e.allDay)) ? "All day" : ""}</div>
        {byDay.map((evs, i) => {
          const ad = evs.filter((e) => e.allDay);
          const cap = wide ? ad.length : narrow ? 2 : ad.length > 3 ? 2 : 3;
          return (
            <div key={days[i]} className={"cal-tg-allcol" + (overAll === days[i] ? " over" : "")}
              onClick={onCreate ? () => onCreate(days[i], null) : undefined}
              onDragOver={onMove ? (ev) => { if (dragging) { ev.preventDefault(); setOverAll(days[i]); } } : undefined} onDragLeave={() => setOverAll(null)}
              onDrop={onMove ? (ev) => { ev.preventDefault(); setOverAll(null); onMove(days[i]); } : undefined}>
              {ad.slice(0, cap).map((e) => <Chip key={e.id} e={e} onPick={onPick} selected={selectedId === e.id} showTime={!narrow} draggable={!!onMove} />)}
              {ad.length > cap ? <button type="button" className="cal-more" onClick={(ev) => { ev.stopPropagation(); onDay(days[i]); }}>{narrow ? `+${ad.length - cap}` : `${ad.length - cap} more`}</button> : null}
            </div>
          );
        })}
      </div>
      <div className="cal-tg-scroll" ref={scroller}>
        <div className="cal-tg-body" style={{ ...cols, height: 24 * HOUR_PX }}>
          <div className="cal-tg-gutter">
            {hours.map((h) => <div key={h} className="cal-tg-hour" style={{ top: h * HOUR_PX }}>{h ? hourLabel(h) : ""}</div>)}
          </div>
          {byDay.map((evs, i) => {
            const d = days[i];
            const lay = calLayoutDay(evs);
            return (
              <div key={d} className={"cal-tg-col" + (onCreate ? " can-create" : "")} onClick={(ev) => clickSlot(d, ev)}
                onDragOver={onMove ? (ev) => { if (!dragging) return; ev.preventDefault(); const m = minAt(ev, dragging.offsetMin); setGhost((g) => (g && g.d === d && g.min === m ? g : { d, min: m })); } : undefined}
                onDragLeave={() => setGhost(null)}
                onDrop={onMove ? (ev) => { ev.preventDefault(); const m = minAt(ev, dragging?.offsetMin || 0); setGhost(null); onMove(d, minutesToHhmm(m)); } : undefined}>
                {hours.map((h) => <div key={h} className="cal-tg-line" style={{ top: h * HOUR_PX }} />)}
                {ghost && ghost.d === d ? <div className="cal-ghost" style={{ top: (ghost.min / 60) * HOUR_PX, height: HOUR_PX / 2 }}>{ampm(minutesToHhmm(ghost.min))}</div> : null}
                {evs.filter((e) => !e.allDay && e.time).map((e) => {
                  const L = lay.get(e.id) || { col: 0, cols: 1 };
                  const y = top(e.time!.start);
                  const h = Math.max(20, (e.time!.end ? top(e.time!.end) : y + HOUR_PX) - y - 2);
                  const thin = !wide && (L.cols >= 3 || (narrow && L.cols >= 2));
                  const st: CSSProperties = { top: y, height: h, left: `calc(${(L.col / L.cols) * 100}% + 1px)`, width: `calc(${100 / L.cols}% - ${L.col === L.cols - 1 ? 8 : 2}px)`, "--c": calKindColor(e.kind) } as CSSProperties;
                  return (
                    <button key={e.id} type="button" data-ev={e.id} style={st} title={`${e.title}, ${timeLabel(e)}`}
                      className={"cal-block-ev" + (e.tentative ? " tentative" : "") + (e.done ? " done" : "") + (selectedId === e.id ? " sel" : "") + (thin ? " thin" : h < 36 ? " short" : "")}
                      draggable={!!onMove && !!e.movable} onDragStart={(ev) => startDrag(e, ev, HOUR_PX)}
                      onClick={(ev) => { ev.stopPropagation(); onPick(e, ev.currentTarget); }}>
                      <span className={"cal-block-t" + (h >= 60 ? " two" : "")}>{thin && e.client ? e.client : e.title}</span>
                      <span className="cal-block-s ph-num">{timeLabel(e)}{wide && e.location ? `, ${e.location}` : ""}</span>
                      {wide && h >= 70 && e.detail ? <span className="cal-block-s">{e.detail}</span> : null}
                    </button>
                  );
                })}
                {d === t ? <div className="cal-now" style={{ top: (nowMin / 60) * HOUR_PX }} aria-label={`Now, ${ampm(localTimeOf(now))}`}><span /></div> : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function AgendaView({ events, today: t, onPick, selectedId, onNext }: { events: CalEvent[]; today: LocalDate; onPick: (e: CalEvent, el: HTMLElement) => void; selectedId?: string; onNext: () => void }) {
  const state = usePhState();
  const [earlier, setEarlier] = useState(false);
  const all: Array<[LocalDate, CalEvent[]]> = [];
  for (const e of events) { const last = all[all.length - 1]; if (last && last[0] === e.date) last[1].push(e); else all.push([e.date, [e]]); }
  /* In the current month, days already gone fold away under one button so today is at the top. */
  const past = all.filter(([d]) => d < t);
  const fold = !earlier && past.length > 0 && past.length < all.length;
  const days = fold ? all.filter(([d]) => d >= t) : all;
  if (!all.length) {
    return (
      <div className="cal-empty">
        <Icon name="calendar" size={18} />
        <div style={{ color: "var(--ink)", fontWeight: 500, marginTop: 8 }}>Nothing this month</div>
        <div className="ph-dim" style={{ fontSize: 12.5, marginTop: 4 }}>Try another month or clear a filter.</div>
        <Button size="sm" style={{ marginTop: 12 }} onClick={onNext}>Next month</Button>
      </div>
    );
  }
  return (
    <div className="cal-agenda">
      {fold ? (
        <button type="button" className="cal-earlier" onClick={() => setEarlier(true)}>
          <Icon name="up" size={13} />Show {past.length} earlier {past.length === 1 ? "day" : "days"} this month
        </button>
      ) : null}
      {days.map(([d, evs]) => (
        <div key={d} className={"cal-ag-day" + (d === t ? " today" : "") + (d < t ? " past" : "")}>
          <div className="cal-ag-date">
            <span className="cal-ag-num">{dayNum(d)}</span>
            <span className="cal-ag-dow">{fmtWeekdayDate(d).split(" ")[0]}</span>
          </div>
          <div className="cal-ag-list">
            {evs.map((e) => (
              <button key={e.id} type="button" data-ev={e.id} className={"cal-ag-row" + (selectedId === e.id ? " sel" : "") + (e.done ? " done" : "")} style={{ "--c": calKindColor(e.kind) } as CSSProperties} onClick={(ev) => onPick(e, ev.currentTarget)}>
                <span className={"cal-ag-bar" + (e.tentative ? " tentative" : "")} />
                <span className="cal-ag-time ph-num">{e.due ? `Due ${ampm(e.due)}` : e.allDay ? "All day" : e.time ? ampm(e.time.start) : ""}</span>
                <span className="cal-ag-main">
                  <span className="cal-ag-title">{e.title}</span>
                  <span className="cal-ag-sub">{[CAL_KIND_BY_ID[e.kind]?.label, e.location || e.client, e.staffIds.length ? e.staffIds.map((id) => staffName(state, id).split(" ")[0]).join(", ") : null].filter(Boolean).join(", ")}</span>
                </span>
                {e.status ? <span className="cal-ag-status"><Pill tone={e.tone || "neutral"} icon={null}>{e.status}</Pill></span> : null}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ================================================================================================
   Filter sheet on a phone
   ================================================================================================ */


function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return createPortal(
    <>
      <div className="ph-scrim" onClick={onClose} />
      <div className="cal-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="cal-sheet-h">
          <span style={{ fontWeight: 600, color: "var(--ink)", fontSize: 15 }}>{title}</span>
          <span className="ph-grow" />
          <Button size="sm" variant="primary" onClick={onClose}>Done</Button>
        </div>
        <div className="cal-sheet-b">{children}</div>
      </div>
    </>,
    overlayRoot(),
  );
}
