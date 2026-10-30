/* People view: one day, one column per person, like a resource calendar, so the team can see who is
   where. Columns are the staff with something on that day (nurses first); anything with nobody on it
   sits in a "Not assigned" column. Overlaps inside one person's column sit side by side. */
import { useLayoutEffect, useRef } from "react";
import type { CSSProperties, MouseEvent as ReactMouseEvent } from "react";
import type { CalEvent, LocalDate } from "../../model";
import { calKindColor, calLayoutDay, hhmmToMinutes, localTimeOf, minutesToHhmm } from "../../model";
import { usePhState } from "../../store";
import { Avatar } from "../../ui";
import { ampm, timeLabel } from "./util";

const HOUR_PX = 48;
const NONE = "__none";
const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "AM" : "PM"}`;

export function PeopleGrid({ date, today: t, now, events, onPick, selectedId, onCreate }: {
  date: LocalDate; today: LocalDate; now: string; events: CalEvent[]; onPick: (e: CalEvent, el: HTMLElement) => void; selectedId?: string;
  onCreate?: (d: LocalDate, time: string | null) => void;
}) {
  const state = usePhState();
  const scroller = useRef<HTMLDivElement>(null);
  const day = events.filter((e) => e.date === date);
  const ids = new Set(day.flatMap((e) => e.staffIds));
  const staff = state.staff.filter((s) => ids.has(s.id))
    .sort((a, b) => (a.team === "nursing" ? 0 : 1) - (b.team === "nursing" ? 0 : 1) || a.name.localeCompare(b.name));
  const cols: Array<{ id: string; name: string; sub: string; tint?: string; evs: CalEvent[] }> = staff.map((s) => ({ id: s.id, name: s.name, sub: s.title, tint: s.tint, evs: day.filter((e) => e.staffIds.includes(s.id)) }));
  const loose = day.filter((e) => !e.staffIds.length);
  if (loose.length) cols.push({ id: NONE, name: "Not assigned", sub: "Nobody on it yet", evs: loose });
  const timed = day.filter((e) => !e.allDay && e.time);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const earliest = Math.min(...timed.map((e) => hhmmToMinutes(e.time!.start)), 7 * 60);
    el.scrollTop = Math.max(0, (earliest / 60) * HOUR_PX - 8);
  }, [date]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!cols.length) return null;
  const grid = { gridTemplateColumns: `var(--gut) repeat(${cols.length}, minmax(150px, 1fr))`, minWidth: `calc(var(--gut) + ${cols.length * 150}px)` } as CSSProperties;
  const top = (hhmm: string) => (hhmmToMinutes(hhmm) / 60) * HOUR_PX;
  const nowMin = hhmmToMinutes(localTimeOf(now));
  const click = (ev: ReactMouseEvent<HTMLDivElement>) => {
    if (!onCreate) return;
    const r = ev.currentTarget.getBoundingClientRect();
    const m = Math.floor((((ev.clientY - r.top) / HOUR_PX) * 60) / 30) * 30;
    onCreate(date, minutesToHhmm(Math.min(23 * 60, m)));
  };
  return (
    <div className="cal-tg cal-people">
      <div className="cal-tg-head" style={grid}>
        <div className="cal-tg-gutter" />
        {cols.map((c) => (
          <div key={c.id} className="cal-person">
            {c.id === NONE ? <span className="cal-person-none" aria-hidden="true">?</span> : <Avatar name={c.name} tint={c.tint} size={26} />}
            <span className="cal-person-txt"><b>{c.name}</b><span>{c.sub}</span></span>
          </div>
        ))}
      </div>
      <div className="cal-tg-all" style={grid}>
        <div className="cal-tg-gutter cal-tg-alllabel">{day.some((e) => e.allDay) ? "All day" : ""}</div>
        {cols.map((c) => (
          <div key={c.id} className="cal-tg-allcol">
            {c.evs.filter((e) => e.allDay).map((e) => (
              <button key={e.id} type="button" data-ev={e.id} className={"cal-chip solid" + (selectedId === e.id ? " sel" : "")} style={{ "--c": calKindColor(e.kind) } as CSSProperties}
                title={`${e.title}, ${timeLabel(e)}`} onClick={(ev) => { ev.stopPropagation(); onPick(e, ev.currentTarget); }}>
                <span className="cal-chip-l">{e.due ? `${ampm(e.due)} ` : ""}{e.title}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="cal-tg-scroll" ref={scroller} style={{ minWidth: grid.minWidth }}>
        <div className="cal-tg-body" style={{ ...grid, height: 24 * HOUR_PX }}>
          <div className="cal-tg-gutter">
            {Array.from({ length: 24 }, (_, h) => <div key={h} className="cal-tg-hour" style={{ top: h * HOUR_PX }}>{h ? hourLabel(h) : ""}</div>)}
          </div>
          {cols.map((c) => {
            const lay = calLayoutDay(c.evs);
            return (
              <div key={c.id} className={"cal-tg-col" + (onCreate ? " can-create" : "")} onClick={click}>
                {Array.from({ length: 24 }, (_, h) => <div key={h} className="cal-tg-line" style={{ top: h * HOUR_PX }} />)}
                {c.evs.filter((e) => !e.allDay && e.time).map((e) => {
                  const L = lay.get(e.id) || { col: 0, cols: 1, cluster: -1 };
                  const y = top(e.time!.start);
                  const h = Math.max(20, (e.time!.end ? top(e.time!.end) : y + HOUR_PX) - y - 2);
                  const st = { top: y, height: h, left: `calc(${(L.col / L.cols) * 100}% + 1px)`, width: `calc(${100 / L.cols}% - ${L.col === L.cols - 1 ? 8 : 2}px)`, "--c": calKindColor(e.kind) } as CSSProperties;
                  return (
                    <button key={e.id} type="button" data-ev={e.id} style={st} title={`${e.title}, ${timeLabel(e)}`}
                      className={"cal-block-ev" + (e.tentative ? " tentative" : "") + (e.done ? " done" : "") + (selectedId === e.id ? " sel" : "") + (h < 36 ? " short" : "")}
                      onClick={(ev) => { ev.stopPropagation(); onPick(e, ev.currentTarget); }}>
                      <span className={"cal-block-t" + (h >= 60 ? " two" : "")}>{e.title}</span>
                      <span className="cal-block-s ph-num">{timeLabel(e)}{e.location ? `, ${e.location}` : ""}</span>
                    </button>
                  );
                })}
                {date === t ? <div className="cal-now" style={{ top: (nowMin / 60) * HOUR_PX }}><span /></div> : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
