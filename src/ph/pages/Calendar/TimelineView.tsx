/* Programmes view: a Gantt-style timeline. One row per programme (and per client flu campaign), a full
   bar from the first to the last day it runs, and its screening days as solid full-day blocks on the
   bar. The "Running at once" row counts how many are on each day, so overlapping days stand out.
   Zoom: 2, 4 or 8 weeks. A bar opens the programme, a day block opens that screening day. */
import type { CSSProperties } from "react";
import type { LocalDate } from "../../model";
import { addDays, fmtDate, fmtDateLong } from "../../model";
import { calTimelineLoad, calTimelineRange, calTimelineRows, CAL_TIMELINE_ZOOMS } from "../../model/calTimeline";
import { usePhState } from "../../store";
import { useNav } from "../../nav-context";
import { Icon, Segmented } from "../../ui";

const DOW1 = ["M", "T", "W", "T", "F", "S", "S"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function TimelineView({ date, today: t, weeks, onZoom, groups, clients, q }: {
  date: LocalDate; today: LocalDate; weeks: number; onZoom: (w: number) => void; groups: string[]; clients: string[]; q: string;
}) {
  const state = usePhState();
  const nav = useNav();
  const r = calTimelineRange(date, weeks);
  const days: LocalDate[] = [];
  for (let d = r.from; d <= r.to; d = addDays(d, 1)) days.push(d);
  const n = days.length;
  const rows = calTimelineRows(state, r.from, r.to, { groups, clients, q });
  const load = calTimelineLoad(rows, r.from, r.to);
  const idx = (d: LocalDate) => Math.max(0, Math.min(n, days.indexOf(d) >= 0 ? days.indexOf(d) : d < r.from ? 0 : n));
  const pct = (i: number) => `${(i / n) * 100}%`;
  const minCol = weeks <= 2 ? 44 : weeks <= 4 ? 26 : 16;
  const grid = { gridTemplateColumns: `minmax(120px, 220px) minmax(${n * minCol}px, 1fr)` } as CSSProperties;
  const ti = days.indexOf(t);
  const overlapDays = [...load.values()].filter((x) => x >= 2).length;
  return (
    <div className="cal-tl">
      <div className="cal-tl-bar">
        <span className="ph-dim" style={{ fontSize: 12.5 }}>
          {rows.length ? `${rows.length} running between ${fmtDate(r.from)} and ${fmtDate(r.to)}${overlapDays ? `. ${overlapDays} ${overlapDays === 1 ? "day has" : "days have"} more than one on.` : "."}` : "Nothing running in these weeks with these filters."}
        </span>
        <span className="ph-grow" />
        <Segmented label="Zoom" value={String(weeks)} onChange={(v) => onZoom(Number(v))} options={CAL_TIMELINE_ZOOMS.map((w) => ({ id: String(w), label: `${w} weeks` }))} />
      </div>
      <div className="cal-tl-scroll">
        <div className="cal-tl-grid" style={grid}>
          <div className="cal-tl-corner" />
          <div className="cal-tl-head">
            {days.map((d, i) => {
              const wd = i % 7;
              /* Month names: on the first column, then on the 1st (or, at 8 weeks, on the Monday a new month starts) so labels never collide. */
              const first = i === 0 || (weeks <= 4 ? d.slice(8) === "01" : wd === 0 && d.slice(5, 7) !== days[i - 7]?.slice(5, 7));
              return (
                <div key={d} className={"cal-tl-day" + (wd >= 5 ? " wkend" : "") + (d === t ? " today" : "") + (wd === 0 ? " mon" : "")} style={{ left: pct(i), width: pct(1) }} title={fmtDateLong(d)}>
                  <span className="cal-tl-mon">{first ? MON[Number(d.slice(5, 7)) - 1] : ""}</span>
                  {weeks <= 4 ? <span className="cal-tl-dow">{DOW1[wd]}</span> : null}
                  <span className="cal-tl-num">{weeks <= 4 || wd === 0 ? Number(d.slice(8)) : ""}</span>
                </div>
              );
            })}
          </div>

          <div className="cal-tl-label load"><b>Running at once</b><span>Two or more means they overlap</span></div>
          <div className="cal-tl-track load">
            {days.map((d, i) => {
              const v = load.get(d) || 0;
              return v ? <span key={d} className={"cal-tl-load" + (v >= 2 ? " over" : "")} style={{ left: pct(i), width: pct(1) }} title={`${fmtDateLong(d)}: ${v} running`}>{v}</span> : null;
            })}
          </div>

          {rows.map((row) => {
            const a = idx(row.from < r.from ? r.from : row.from), b = idx(row.to > r.to ? r.to : row.to) + 1;
            return (
              <div key={row.id} className="cal-tl-row" style={{ display: "contents" }}>
                <button type="button" className="cal-tl-label" onClick={() => nav.go(row.link)} title={`Open ${row.label}`}>
                  <b>{row.label}</b><span>{row.sub}</span>
                </button>
                <div className="cal-tl-track" style={{ "--c": row.color } as CSSProperties}>
                  {days.map((d, i) => (i % 7 >= 5 ? <span key={d} className="cal-tl-wk" style={{ left: pct(i), width: pct(1) }} /> : null))}
                  <button type="button" className={"cal-tl-span" + (row.from < r.from ? " cont-l" : "") + (row.to > r.to ? " cont-r" : "")} style={{ left: pct(a), width: `calc(${pct(b - a)} - 2px)` }}
                    onClick={() => nav.go(row.link)} title={`${row.label}: ${fmtDate(row.from)} to ${fmtDate(row.to)}`} aria-label={`${row.label}, ${fmtDate(row.from)} to ${fmtDate(row.to)}`} />
                  {row.days.filter((x) => x.date >= r.from && x.date <= r.to).map((x) => (
                    <button key={x.date} type="button" className={"cal-tl-block" + (x.tentative ? " tentative" : "") + (x.done ? " done" : "") + ((load.get(x.date) || 0) >= 2 ? " clash" : "")}
                      style={{ left: `calc(${pct(idx(x.date))} + 1px)`, width: `calc(${pct(1)} - 3px)` }}
                      onClick={(e) => { e.stopPropagation(); nav.go(x.link); }} title={`${x.label}, ${fmtDateLong(x.date)}${x.count > 1 ? `, ${x.count} rooms` : ""}${x.tentative ? ", draft" : ""}`}
                      aria-label={`${x.label}, ${fmtDateLong(x.date)}`}>
                      {x.count > 1 && weeks <= 4 ? x.count : ""}
                    </button>
                  ))}
                  {ti >= 0 ? <span className="cal-tl-now" style={{ left: `calc(${pct(ti)} + ${pct(0.5)})` }} /> : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="cal-tl-legend">
        <span><i className="cal-tl-k bar" />Programme window</span>
        <span><i className="cal-tl-k day" />Screening day</span>
        <span><i className="cal-tl-k draft" />Draft day</span>
        <span><i className="cal-tl-k clash" />Day with more than one on</span>
        <span><Icon name="dot" size={10} style={{ color: "var(--bad)" }} />Today</span>
      </div>
    </div>
  );
}
