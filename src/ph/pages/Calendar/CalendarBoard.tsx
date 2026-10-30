/* The one business calendar: Month, Week, Day and Agenda views over every dated thing in the store
   (src/ph/model/calendar.ts), with a mini month, filters by type, client and person, a search box and
   an "Only mine" switch. Every filter lives in the URL, so a link opens the same view.
   Used by the Calendar page and, scoped to clinics, by Clinics, Schedule. */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { createPortal } from "react-dom";
import type { CalDim, CalEvent, CalFilter, CalView, LocalDate } from "../../model";
import {
  CAL_DEFAULT_OFF, CAL_GROUPS, CAL_GROUP_BY_ID, CAL_KIND_BY_ID, addDays, addMonths, calClients, calGroupFromParam, calGroupOf, calKindColor, calLayoutDay, calMatches, calRange, calStep,
  calendarEvents, fmtDateLong, fmtWeekdayDate, hhmmToMinutes, minutesToHhmm, staffName, startOfWeek, today, weekdayOf,
} from "../../model";
import { usePersona, usePhState } from "../../store";
import { useNav } from "../../nav-context";
import { Button, Icon, Pill, SearchBox, Segmented, Switch } from "../../ui";
import "./calendar.css";

const VIEWS: Array<{ id: CalView; label: string }> = [
  { id: "month", label: "Month" }, { id: "week", label: "Week" }, { id: "day", label: "Day" }, { id: "agenda", label: "Agenda" },
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
    const sm = MONTHS[Number(s.slice(5, 7)) - 1], em = MONTHS[Number(e.slice(5, 7)) - 1];
    return sm === em ? `${dayNum(s)} to ${dayNum(e)} ${em} ${e.slice(0, 4)}` : `${dayNum(s)} ${sm} to ${dayNum(e)} ${em} ${e.slice(0, 4)}`;
  }
  return monthTitle(date);
}
const timeLabel = (e: CalEvent) => (e.due ? `Due ${e.due}` : e.allDay || !e.time ? "All day" : e.time.end ? `${e.time.start} to ${e.time.end}` : `From ${e.time.start}`);
const shortTime = (e: CalEvent) => e.due || (!e.allDay && e.time ? e.time.start : null);

function useNarrow(px: number): boolean {
  const [n, setN] = useState(() => typeof window !== "undefined" && window.innerWidth < px);
  useEffect(() => {
    const h = () => setN(window.innerWidth < px);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, [px]);
  return n;
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
}

export default function CalendarBoard({ scope, defaultView = "month", onEventClick, sideFooter, selectedId }: CalendarBoardProps) {
  const state = usePhState();
  const nav = useNav();
  const p = usePersona();
  const narrow = useNarrow(760);
  const [sheet, setSheet] = useState(false);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const t = today(state);
  const P = nav.params;

  const view: CalView = (VIEWS.find((v) => v.id === P.view)?.id) || (P.view === "list" ? "agenda" : narrow ? "agenda" : defaultView);
  const date: LocalDate = isDate(P.date) ? P.date : t;
  const groupsAll = scope ? CAL_GROUPS.filter((g) => scope.includes(g.id)) : CAL_GROUPS;
  const groups = P.types !== undefined ? [...new Set(list(P.types).map(calGroupFromParam))].filter((g): g is string => !!g && groupsAll.some((x) => x.id === g)) : groupsAll.filter((g) => !CAL_DEFAULT_OFF.includes(g.id)).map((g) => g.id);
  const f: CalFilter = { groups, clients: list(P.clients), people: list(P.people), q: P.q || "", mine: P.mine === "1" && !p.isParticipant ? p.id : null };

  const set = (patch: Record<string, string | null>) => {
    const next: Record<string, string> = { ...P };
    for (const [k, v] of Object.entries(patch)) { if (v === null || v === "") delete next[k]; else next[k] = v; }
    nav.setParams(next);
  };

  const all = calendarEvents(state);
  const scoped = useMemo(() => (scope ? all.filter((e) => scope.includes(calGroupOf(e.kind))) : all), [all, scope]);
  const range = calRange(view, date);
  const inRange = useMemo(() => scoped.filter((e) => e.date >= range.from && e.date <= range.to), [scoped, range.from, range.to]);
  const shown = useMemo(() => inRange.filter((e) => calMatches(e, f)), [inRange, f.groups.join(), f.clients.join(), f.people.join(), f.q, f.mine]); // eslint-disable-line react-hooks/exhaustive-deps
  const count = (dim: CalDim, pred: (e: CalEvent) => boolean) => inRange.filter((e) => pred(e) && calMatches(e, f, dim)).length;

  const selected = P.ev ? scoped.find((e) => e.id === P.ev) || null : null;
  const pick = (e: CalEvent, el?: HTMLElement | null) => {
    if (onEventClick && onEventClick(e)) return;
    setAnchor(el ? el.getBoundingClientRect() : null);
    set({ ev: e.id });
  };
  const closePop = () => { setAnchor(null); set({ ev: null }); };
  const goDay = (d: LocalDate) => set({ view: "day", date: d, ev: null });
  const activeFilters = (P.types !== undefined ? 1 : 0) + f.clients.length + f.people.length + (f.q ? 1 : 0) + (f.mine ? 1 : 0);

  const side = (
    <FilterPanel
      date={date} today={t} scoped={scoped} f={f} groupsAll={groupsAll} inRange={inRange} count={count} set={set} scopeOnly={!!scope}
      persona={p.isParticipant ? null : { id: p.id, first: p.name.split(" ")[0] }} footer={sideFooter} onDate={(d) => set({ date: d, ev: null })}
      onReset={() => set({ types: null, clients: null, people: null, q: null, mine: null })} activeFilters={activeFilters}
    />
  );

  return (
    <div className={"cal" + (narrow ? " narrow" : "")}>
      {narrow ? null : <aside className="cal-side" aria-label="Calendar filters">{side}</aside>}
      <section className="cal-main">
        <div className="cal-toolbar">
          <div className="cal-nav">
            <Button size="sm" onClick={() => set({ date: t, ev: null })}>Today</Button>
            <Button size="sm" variant="ghost" icon="chevronLeft" aria-label="Previous" onClick={() => set({ date: calStep(view, date, -1), ev: null })} />
            <Button size="sm" variant="ghost" icon="chevronRight" aria-label="Next" onClick={() => set({ date: calStep(view, date, 1), ev: null })} />
            <h2 className="cal-title">{rangeTitle(view, date)}</h2>
            {narrow ? (
              <span style={{ marginLeft: "auto" }}><Button size="sm" icon="filter" onClick={() => setSheet(true)} aria-expanded={sheet}>Filters{activeFilters ? ` (${activeFilters})` : ""}</Button></span>
            ) : null}
          </div>
          <div className="cal-tools">
            <Segmented value={view} options={VIEWS} onChange={(v) => set({ view: v, ev: null })} label="Calendar view" />
          </div>
        </div>
        <div className="cal-summary">
          <span>{shown.length ? `${shown.length} ${shown.length === 1 ? "item" : "items"} ${view === "day" ? "on this day" : view === "week" ? "this week" : "this month"}` : "Nothing in this period with these filters"}</span>
          {activeFilters ? <button type="button" className="cal-linkbtn" onClick={() => set({ types: null, clients: null, people: null, q: null, mine: null })}>Clear filters</button> : null}
        </div>
        {view === "month" ? <MonthView date={date} today={t} events={shown} onPick={pick} onDay={goDay} selectedId={selectedId || selected?.id} compact={narrow} /> : null}
        {view === "week" ? <TimeGrid days={Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(date), i)).filter((d, i) => i < 5 || shown.some((e) => e.date === d))} today={t} events={shown} onPick={pick} onDay={goDay} selectedId={selectedId || selected?.id} /> : null}
        {view === "day" ? <TimeGrid days={[date]} today={t} events={shown} onPick={pick} onDay={goDay} selectedId={selectedId || selected?.id} wide /> : null}
        {view === "agenda" ? <AgendaView events={shown} today={t} onPick={pick} selectedId={selectedId || selected?.id} onNext={() => set({ date: calStep("agenda", date, 1) })} /> : null}
      </section>
      {narrow && sheet ? (
        <Sheet title="Filters" onClose={() => setSheet(false)}>{side}</Sheet>
      ) : null}
      {selected ? <EventCard ev={selected} anchor={anchor} onClose={closePop} narrow={narrow} /> : null}
    </div>
  );
}

/* ================================================================================================
   Filter panel
   ================================================================================================ */

function FilterPanel({ date, today: t, scoped, f, groupsAll, inRange, count, set, persona, footer, onDate, onReset, activeFilters, scopeOnly }: {
  date: LocalDate; today: LocalDate; scoped: CalEvent[]; f: CalFilter; groupsAll: typeof CAL_GROUPS; inRange: CalEvent[];
  count: (dim: CalDim, pred: (e: CalEvent) => boolean) => number; set: (p: Record<string, string | null>) => void;
  persona: { id: string; first: string } | null; footer?: ReactNode; onDate: (d: LocalDate) => void; onReset: () => void; activeFilters: number; scopeOnly: boolean;
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
      <SearchBox value={q} onChange={setQ} placeholder="Search the calendar" width="100%" />
      <MiniMonth date={date} today={t} events={scoped.filter((e) => calMatches(e, f))} onDate={onDate} />
      {persona ? (
        <label className="cal-mine">
          <span><span style={{ color: "var(--ink)", fontWeight: 500 }}>Only mine</span><span className="ph-faint" style={{ display: "block", fontSize: 11.5 }}>Things {persona.first} is on</span></span>
          <Switch on={!!f.mine} onChange={(on) => set({ mine: on ? "1" : null, ev: null })} label="Only mine" />
        </label>
      ) : null}

      {!scopeOnly || groupsAll.length > 1 ? (
        <FilterBlock title="Type">
          {groupsAll.map((g) => (
            <CheckRow key={g.id} on={f.groups.includes(g.id)} color={g.color} label={g.label} hint={g.hint}
              n={count("groups", (e) => calGroupOf(e.kind) === g.id)} onToggle={() => toggle("types", f.groups, g.id, groupsAll.map((x) => x.id))} />
          ))}
        </FilterBlock>
      ) : (
        <FilterBlock title="Showing">
          {Object.values(CAL_KIND_BY_ID).filter((k) => groupsAll.some((g) => g.id === k.group)).map((k) => (
            <div key={k.id} className="cal-legend"><span className="cal-dot" style={{ background: k.color }} />{k.label}<span className="ph-grow" /><span className="ph-num ph-faint">{inRange.filter((e) => e.kind === k.id && calMatches(e, f)).length}</span></div>
          ))}
        </FilterBlock>
      )}

      {clients.length ? (
        <FilterBlock title="Client" right={f.clients.length ? <button type="button" className="cal-linkbtn" onClick={() => set({ clients: null, ev: null })}>All clients</button> : null}>
          {shownClients.map((c) => (
            <CheckRow key={c.name} on={f.clients.includes(c.name)} label={c.name} n={count("clients", (e) => e.client === c.name)} onToggle={() => toggle("clients", f.clients, c.name)} />
          ))}
          {clients.length > 6 ? <button type="button" className="cal-linkbtn" style={{ marginTop: 4 }} onClick={() => setAllClients(!allClients)}>{allClients ? "Show fewer" : `Show all ${clients.length} clients`}</button> : null}
        </FilterBlock>
      ) : null}

      {people.length ? (
        <FilterBlock title="Person" right={f.people.length ? <button type="button" className="cal-linkbtn" onClick={() => set({ people: null, ev: null })}>Everyone</button> : null}>
          {people.map((s) => (
            <CheckRow key={s.id} on={f.people.includes(s.id)} avatar={s.initials} tint={s.tint} label={s.name} n={count("people", (e) => e.staffIds.includes(s.id))} onToggle={() => toggle("people", f.people, s.id)} />
          ))}
        </FilterBlock>
      ) : null}
      {activeFilters ? <Button size="sm" variant="ghost" icon="refresh" onClick={onReset}>Reset filters</Button> : null}
      {footer}
    </div>
  );
}

function FilterBlock({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="cal-block">
      <div className="cal-block-h">
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}>
          <Icon name={open ? "chevronDown" : "chevronRight"} size={13} />{title}
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
      <span className="cal-box" style={{ "--c": color || "var(--accent)" } as CSSProperties}>{on ? <Icon name="check" size={11} stroke={2.4} /> : null}</span>
      {avatar ? <span className="cal-av" style={{ background: tint }}>{avatar}</span> : null}
      <span className="cal-check-l">{label}</span>
      <span className="ph-num cal-n">{n}</span>
    </button>
  );
}

function MiniMonth({ date, today: t, events, onDate }: { date: LocalDate; today: LocalDate; events: CalEvent[]; onDate: (d: LocalDate) => void }) {
  const [month, setMonth] = useState(date.slice(0, 8) + "01");
  useEffect(() => { setMonth(date.slice(0, 8) + "01"); }, [date.slice(0, 7)]); // eslint-disable-line react-hooks/exhaustive-deps
  const r = calRange("month", month);
  const days: LocalDate[] = [];
  for (let d = r.from; d <= r.to; d = addDays(d, 1)) days.push(d);
  const busy = new Map<string, number>();
  for (const e of events) if (e.date >= r.from && e.date <= r.to) busy.set(e.date, (busy.get(e.date) || 0) + 1);
  return (
    <div className="cal-mini" aria-label="Pick a date">
      <div className="cal-mini-h">
        <span>{monthTitle(month)}</span>
        <span className="ph-grow" />
        <button type="button" className="cal-iconbtn" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}><Icon name="chevronLeft" size={14} /></button>
        <button type="button" className="cal-iconbtn" aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}><Icon name="chevronRight" size={14} /></button>
      </div>
      <div className="cal-mini-g">
        {DOW.map((d) => <span key={d} className="cal-mini-dow">{d.charAt(0)}</span>)}
        {days.map((d) => {
          const out = d.slice(0, 7) !== month.slice(0, 7);
          const n = busy.get(d) || 0;
          return (
            <button key={d} type="button" onClick={() => onDate(d)} aria-label={`${fmtDateLong(d)}${n ? `, ${n} items` : ""}`} aria-current={d === date ? "date" : undefined}
              className={"cal-mini-d" + (out ? " out" : "") + (d === t ? " today" : "") + (d === date ? " sel" : "")}>
              {dayNum(d)}{n ? <span className="cal-mini-dot" /> : null}
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

function Chip({ e, onPick, selected, showTime = true }: { e: CalEvent; onPick: (e: CalEvent, el: HTMLElement) => void; selected: boolean; showTime?: boolean }) {
  const c = calKindColor(e.kind);
  return (
    <button type="button" className={"cal-chip" + (e.allDay ? " allday" : "") + (e.tentative ? " tentative" : "") + (e.done ? " done" : "") + (selected ? " sel" : "")}
      style={{ "--c": c } as CSSProperties} onClick={(ev) => { ev.stopPropagation(); onPick(e, ev.currentTarget); }} title={`${e.title}, ${timeLabel(e)}`}>
      {e.allDay ? null : <span className="cal-chip-dot" />}
      {showTime && shortTime(e) ? <span className="cal-chip-t ph-num">{shortTime(e)}</span> : null}
      <span className="cal-chip-l">{e.title}</span>
    </button>
  );
}

function MonthView({ date, today: t, events, onPick, onDay, selectedId, compact }: { date: LocalDate; today: LocalDate; events: CalEvent[]; onPick: (e: CalEvent, el: HTMLElement) => void; onDay: (d: LocalDate) => void; selectedId?: string; compact?: boolean }) {
  const r = calRange("month", date);
  const days: LocalDate[] = [];
  for (let d = r.from; d <= r.to; d = addDays(d, 1)) days.push(d);
  const byDay = new Map<string, CalEvent[]>();
  for (const e of events) { const a = byDay.get(e.date) || []; a.push(e); byDay.set(e.date, a); }
  const MAX = 3;
  return (
    <div className="cal-month" role="grid" aria-label={monthTitle(date)}>
      {DOW.map((d) => <div key={d} className="cal-month-dow" role="columnheader">{d}</div>)}
      {days.map((d) => {
        const evs = byDay.get(d) || [];
        const out = d.slice(0, 7) !== date.slice(0, 7);
        const more = evs.length - MAX;
        return (
          <div key={d} role="gridcell" className={"cal-cell" + (out ? " out" : "") + (d === t ? " today" : "") + (weekdayOf(d) === 0 || weekdayOf(d) === 6 ? " wkend" : "")}>
            <button type="button" className="cal-cell-n" onClick={() => onDay(d)} aria-label={`Open ${fmtDateLong(d)}`}>{dayNum(d) === 1 && !compact ? `${dayNum(d)} ${MONTHS[Number(d.slice(5, 7)) - 1]}` : dayNum(d)}</button>
            {compact ? (
              evs.length ? (
                <button type="button" className="cal-cell-dots" onClick={() => onDay(d)} aria-label={`${evs.length} items on ${fmtDateLong(d)}`}>
                  <span className="cal-dots">{evs.slice(0, 6).map((e) => <span key={e.id} className="cal-dot" style={{ background: calKindColor(e.kind) }} />)}</span>
                  <span className="ph-num">{evs.length}</span>
                </button>
              ) : null
            ) : <div className="cal-cell-evs">
              {evs.slice(0, more > 0 ? MAX - 1 : MAX).map((e) => <Chip key={e.id} e={e} onPick={onPick} selected={selectedId === e.id} />)}
              {more > 0 ? <button type="button" className="cal-more" onClick={() => onDay(d)}>+{more + 1} more</button> : null}
            </div>}
          </div>
        );
      })}
    </div>
  );
}

const HOUR_PX = 46;
function TimeGrid({ days, today: t, events, onPick, onDay, selectedId, wide }: { days: LocalDate[]; today: LocalDate; events: CalEvent[]; onPick: (e: CalEvent, el: HTMLElement) => void; onDay: (d: LocalDate) => void; selectedId?: string; wide?: boolean }) {
  const scroller = useRef<HTMLDivElement>(null);
  const byDay = days.map((d) => events.filter((e) => e.date === d));
  const timedAll = byDay.flat().filter((e) => !e.allDay && e.time);
  const firstH = Math.min(7, ...timedAll.map((e) => Math.floor(hhmmToMinutes(e.time!.start) / 60)));
  const lastH = Math.max(19, ...timedAll.map((e) => Math.ceil(hhmmToMinutes(e.time!.end || e.time!.start) / 60) + (e.time!.end ? 0 : 1)));
  const hours = Array.from({ length: lastH - firstH }, (_, i) => firstH + i);
  const top = (hhmm: string) => ((hhmmToMinutes(hhmm) - firstH * 60) / 60) * HOUR_PX;
  const anyAllDay = byDay.some((a) => a.some((e) => e.allDay));
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const earliest = Math.min(...timedAll.map((e) => hhmmToMinutes(e.time!.start)), 8 * 60);
    el.scrollTop = Math.max(0, ((earliest - firstH * 60) / 60) * HOUR_PX - 10);
  }, [days[0]]); // eslint-disable-line react-hooks/exhaustive-deps
  const cols = { "--days": days.length } as CSSProperties;
  return (
    <div className={"cal-tg" + (wide ? " wide" : "")}>
      <div className="cal-tg-head" style={cols}>
        <div className="cal-tg-gutter" />
        {days.map((d) => (
          <button key={d} type="button" className={"cal-tg-day" + (d === t ? " today" : "")} onClick={() => onDay(d)} disabled={wide} aria-label={fmtDateLong(d)}>
            <span className="cal-tg-dow">{DOW[(weekdayOf(d) + 6) % 7]}</span>
            <span className="cal-tg-num">{dayNum(d)}</span>
          </button>
        ))}
      </div>
      {anyAllDay ? (
        <div className="cal-tg-all" style={cols}>
          <div className="cal-tg-gutter cal-tg-alllabel">All day</div>
          {byDay.map((evs, i) => (
            <div key={days[i]} className="cal-tg-allcol">
              {(() => {
                const ad = evs.filter((e) => e.allDay);
                const cap = wide ? ad.length : ad.length > 4 ? 3 : 4;
                return <>
                  {ad.slice(0, cap).map((e) => <Chip key={e.id} e={e} onPick={onPick} selected={selectedId === e.id} />)}
                  {ad.length > cap ? <button type="button" className="cal-more" onClick={() => onDay(days[i])}>+{ad.length - cap} more</button> : null}
                </>;
              })()}
            </div>
          ))}
        </div>
      ) : null}
      <div className="cal-tg-scroll" ref={scroller}>
        <div className="cal-tg-body" style={{ ...cols, height: hours.length * HOUR_PX }}>
          <div className="cal-tg-gutter">
            {hours.map((h) => <div key={h} className="cal-tg-hour" style={{ top: (h - firstH) * HOUR_PX }}>{h > firstH ? minutesToHhmm(h * 60) : ""}</div>)}
          </div>
          {byDay.map((evs, i) => {
            const lay = calLayoutDay(evs);
            return (
              <div key={days[i]} className={"cal-tg-col" + (days[i] === t ? " today" : "")}>
                {hours.map((h) => <div key={h} className="cal-tg-line" style={{ top: (h - firstH) * HOUR_PX }} />)}
                {evs.filter((e) => !e.allDay && e.time).map((e) => {
                  const L = lay.get(e.id) || { col: 0, cols: 1 };
                  const y = top(e.time!.start);
                  const h = Math.max(22, (e.time!.end ? top(e.time!.end) : y + HOUR_PX) - y - 2);
                  const thin = !wide && L.cols >= 3;
                  const st: CSSProperties = { top: y, height: h, left: `calc(${(L.col / L.cols) * 100}% + 2px)`, width: `calc(${100 / L.cols}% - 4px)`, "--c": calKindColor(e.kind) } as CSSProperties;
                  return (
                    <button key={e.id} type="button" style={st} title={`${e.title}, ${timeLabel(e)}`}
                      className={"cal-block-ev" + (e.tentative ? " tentative" : "") + (e.done ? " done" : "") + (selectedId === e.id ? " sel" : "") + (thin ? " thin" : h < 40 ? " short" : "")}
                      onClick={(ev) => onPick(e, ev.currentTarget)}>
                      <span className={"cal-block-t" + (h >= 66 ? " two" : "")}>{thin && e.client ? e.client : e.title}</span>
                      <span className="cal-block-s ph-num">{timeLabel(e)}{wide && e.location ? `, ${e.location}` : ""}</span>
                      {wide && h >= 60 && e.detail ? <span className="cal-block-s">{e.detail}</span> : null}
                    </button>
                  );
                })}
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
            <span className="cal-ag-dow">{fmtWeekdayDate(d).split(" ")[0]}{d === t ? <><br /><span className="cal-today-tag">Today</span></> : null}</span>
          </div>
          <div className="cal-ag-list">
            {evs.map((e) => (
              <button key={e.id} type="button" className={"cal-ag-row" + (selectedId === e.id ? " sel" : "") + (e.done ? " done" : "")} style={{ "--c": calKindColor(e.kind) } as CSSProperties} onClick={(ev) => onPick(e, ev.currentTarget)}>
                <span className={"cal-ag-bar" + (e.tentative ? " tentative" : "")} />
                <span className="cal-ag-time ph-num">{e.due ? `Due ${e.due}` : e.allDay ? "All day" : e.time?.start}</span>
                <span className="cal-ag-main">
                  <span className="cal-ag-title">{e.title}</span>
                  <span className="cal-ag-sub">{[CAL_KIND_BY_ID[e.kind]?.label, e.location || e.client, e.staffIds.length ? e.staffIds.map((id) => staffName(state, id).split(" ")[0]).join(", ") : null].filter(Boolean).join(" · ")}</span>
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
   Event card (popover on desktop, bottom sheet on a phone) and the filter sheet
   ================================================================================================ */

const overlayRoot = (): HTMLElement => document.querySelector<HTMLElement>("[data-theme]") || document.body;

function EventCard({ ev, anchor, onClose, narrow }: { ev: CalEvent; anchor: DOMRect | null; onClose: () => void; narrow: boolean }) {
  const state = usePhState();
  const nav = useNav();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<CSSProperties>({ visibility: "hidden" });
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    const c = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    window.addEventListener("keydown", h, true);
    const tm = window.setTimeout(() => document.addEventListener("mousedown", c), 0);
    return () => { window.removeEventListener("keydown", h, true); document.removeEventListener("mousedown", c); window.clearTimeout(tm); };
  }, [onClose]);
  useLayoutEffect(() => {
    if (narrow) { setPos({}); return; }
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth, h = el.offsetHeight, vw = window.innerWidth, vh = window.innerHeight, m = 12;
    if (!anchor) { setPos({ left: Math.max(m, (vw - w) / 2), top: Math.max(m, (vh - h) / 2) }); return; }
    let left = anchor.right + 10;
    if (left + w > vw - m) left = anchor.left - w - 10;
    if (left < m) left = Math.min(vw - w - m, Math.max(m, anchor.left));
    let top = anchor.top;
    if (left === anchor.left || (left > anchor.left && left < anchor.right)) top = anchor.bottom + 8;
    top = Math.min(Math.max(m, top), vh - h - m);
    setPos({ left, top });
    ref.current?.focus();
  }, [ev.id, anchor, narrow]);
  const kind = CAL_KIND_BY_ID[ev.kind];
  const group = CAL_GROUP_BY_ID[kind?.group || ""];
  const c = calKindColor(ev.kind);
  const people = ev.staffIds.map((id) => state.staff.find((s) => s.id === id)).filter(Boolean);
  const go = (link: CalEvent["link"]) => { onClose(); nav.go(link); };
  return createPortal(
    <>
      {narrow ? <div className="ph-scrim" onClick={onClose} /> : null}
      <div ref={ref} className={"cal-pop" + (narrow ? " sheet" : "")} style={{ ...pos, "--c": c } as CSSProperties} role="dialog" aria-label={ev.title} tabIndex={-1}>
        <div className="cal-pop-top">
          <span className="cal-pop-kind"><span className="cal-dot" style={{ background: c }} /><span>{kind?.label}{group && group.label !== kind?.label ? <span className="ph-faint">{`, ${group.label}`}</span> : null}</span></span>
          <span className="ph-grow" />
          <button type="button" className="cal-iconbtn" onClick={onClose} aria-label="Close"><Icon name="x" size={14} /></button>
        </div>
        <h3 className="cal-pop-title">{ev.title}</h3>
        <div className="cal-pop-rows">
          <div><Icon name="clock" size={14} /><span>{fmtDateLong(ev.date)}<br /><span className="ph-dim">{timeLabel(ev)}</span></span></div>
          {ev.location ? <div><Icon name="pin" size={14} /><span>{ev.location}</span></div> : null}
          {ev.client && !ev.title.toLowerCase().startsWith(ev.client.toLowerCase()) ? <div><Icon name="users" size={14} /><span>{ev.client}</span></div> : null}
          {people.length ? <div><Icon name="user" size={14} /><span>{people.map((s) => s!.name).join(", ")}</span></div> : null}
          {ev.detail ? <div><Icon name="info" size={14} /><span>{ev.detail}</span></div> : null}
        </div>
        {ev.status ? <div style={{ marginTop: 12 }}><Pill tone={ev.tone || "neutral"} icon={null}>{ev.status}</Pill></div> : null}
        <div className="cal-pop-actions">
          {ev.secondary ? <Button size="sm" onClick={() => go(ev.secondary!.link)}>{ev.secondary.label}</Button> : null}
          <Button size="sm" variant="primary" icon="arrow" onClick={() => go(ev.link)}>{ev.openLabel}</Button>
        </div>
      </div>
    </>,
    overlayRoot(),
  );
}

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
