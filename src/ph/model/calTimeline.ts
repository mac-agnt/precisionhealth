/* The calendar's Programmes view and multi-day bars. A programme runs over a window of days, with
   screening days inside it; flu campaigns run over the dates of a client's flu clinics. The timeline
   draws each as one row with a full bar from first to last day and the actual days as solid blocks,
   so overlapping programmes are easy to see. Month view uses calSpans to draw programme windows and
   leave as continuous bars across days. Pure module: no React, no dispatch. */
import type { LocalDate } from "./time";
import { addDays } from "./time";
import type { PhState } from "./types";
import type { NavTarget } from "./nav";
import type { CalEvent } from "./calendar";
import { programmeList } from "./programmeRegistry";

export interface TimelineDay { date: LocalDate; label: string; link: NavTarget; tentative: boolean; done: boolean; count: number }
export interface TimelineRow {
  id: string;
  kind: "programme" | "flu";
  label: string;
  sub: string;
  client: string;
  color: string;
  from: LocalDate;
  to: LocalDate;
  link: NavTarget;
  days: TimelineDay[];
}

/** Days shown by the Programmes view: whole weeks from the Monday of `date`. */
export function calTimelineRange(date: LocalDate, weeks: number): { from: LocalDate; to: LocalDate } {
  const d = new Date(date + "T12:00:00Z");
  const back = (d.getUTCDay() + 6) % 7;
  const from = addDays(date, -back);
  return { from, to: addDays(from, weeks * 7 - 1) };
}
export const CAL_TIMELINE_ZOOMS = [2, 4, 8];

/** Programme and flu rows that touch the range, earliest first. `groups` decides which kinds appear. */
export function calTimelineRows(s: PhState, from: LocalDate, to: LocalDate, opts: { groups: string[]; clients: string[]; q: string }): TimelineRow[] {
  const rows: TimelineRow[] = [];
  const q = opts.q.trim().toLowerCase();
  const keep = (client: string, label: string) => (!opts.clients.length || opts.clients.includes(client)) && (!q || `${client} ${label}`.toLowerCase().includes(q));
  if (opts.groups.includes("clinics")) {
    const dayBySession = new Map(s.screeningDays.days.map((d) => [d.sessionId, d]));
    for (const p of programmeList(s)) {
      const sessions = s.sessions.filter((x) => x.programmeId === p.id && x.status !== "cancelled");
      const first = [p.windowStart, ...sessions.map((x) => x.date)].sort()[0];
      const last = [p.windowEnd, ...sessions.map((x) => x.date)].sort().slice(-1)[0];
      if (last < from || first > to || !keep(p.clientName, p.name)) continue;
      const byDate = new Map<LocalDate, TimelineDay>();
      for (const x of sessions) {
        const sd = dayBySession.get(x.id);
        const cur = byDate.get(x.date);
        if (cur) { cur.count += 1; continue; }
        byDate.set(x.date, {
          date: x.date, label: `${p.clientName} screening day`, count: 1, done: x.date < (s.clock.nowUtc.slice(0, 10) as LocalDate),
          tentative: !!sd && sd.status !== "published",
          link: sd ? { page: "Clinics", tab: "days", params: { day: sd.id } } : { page: "Clinics", tab: "schedule", params: { session: x.id, date: x.date } },
        });
      }
      rows.push({
        id: p.id, kind: "programme", label: p.name, sub: `${p.clientName} · ${byDate.size} screening ${byDate.size === 1 ? "day" : "days"}`, client: p.clientName, color: "#3E9E93",
        from: first, to: last, link: { page: "Programmes", tab: "programmes", params: { programme: p.id } },
        days: [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1)),
      });
    }
  }
  if (opts.groups.includes("flu")) {
    const byCo = new Map<string, typeof s.flu.clinics>();
    for (const c of s.flu.clinics.filter((x) => x.date && x.status !== "cancelled" && x.status !== "requested")) byCo.set(c.company, [...(byCo.get(c.company) || []), c]);
    for (const [co, cs] of byCo) {
      const dates = cs.map((c) => c.date as LocalDate).sort();
      if (dates[dates.length - 1] < from || dates[0] > to || !keep(co, "flu")) continue;
      const byDate = new Map<LocalDate, TimelineDay>();
      for (const c of cs) {
        const cur = byDate.get(c.date as LocalDate);
        if (cur) { cur.count += 1; continue; }
        byDate.set(c.date as LocalDate, { date: c.date as LocalDate, label: `${co} flu clinic`, count: 1, done: c.status === "completed", tentative: false, link: { page: "Flu", tab: "bookings", params: { clinic: c.id } } });
      }
      rows.push({
        id: `flu-${co}`, kind: "flu", label: `${co} flu`, sub: `${byDate.size} flu clinic ${byDate.size === 1 ? "day" : "days"}`, client: co, color: "#E0A030",
        from: dates[0], to: dates[dates.length - 1], link: { page: "Flu", tab: "bookings" }, days: [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1)),
      });
    }
  }
  /* Screening programmes first, then flu campaigns; earliest first within each. */
  return rows.sort((a, b) => (a.kind !== b.kind ? (a.kind === "programme" ? -1 : 1) : a.from < b.from ? -1 : a.from > b.from ? 1 : a.label.localeCompare(b.label)));
}

/** How many programme or flu rows are running on each day: two or more means they overlap. */
export function calTimelineLoad(rows: TimelineRow[], from: LocalDate, to: LocalDate): Map<LocalDate, number> {
  const out = new Map<LocalDate, number>();
  for (let d = from; d <= to; d = addDays(d, 1)) out.set(d, rows.filter((r) => r.days.some((x) => x.date === d)).length);
  return out;
}

/* ---- multi-day bars for Month view ---- */

export interface CalSpan { id: string; label: string; color: string; from: LocalDate; to: LocalDate; link: NavTarget; evId?: string }

/** Programme windows (when the clinics layer is on) and leave over several days, as continuous spans. */
export function calSpans(s: PhState, shown: CalEvent[], opts: { groups: string[]; clients: string[] }): CalSpan[] {
  const out: CalSpan[] = [];
  if (opts.groups.includes("clinics")) {
    for (const p of programmeList(s)) {
      if (opts.clients.length && !opts.clients.includes(p.clientName)) continue;
      if (p.windowEnd <= p.windowStart) continue;
      out.push({ id: `prog:${p.id}`, label: p.name, color: "#3E9E93", from: p.windowStart, to: p.windowEnd, link: { page: "Programmes", tab: "programmes", params: { programme: p.id } } });
    }
  }
  const leave = new Map<string, CalEvent[]>();
  for (const e of shown) if (e.kind === "sched_leave" && e.schedId) leave.set(e.schedId, [...(leave.get(e.schedId) || []), e]);
  for (const [id, evs] of leave) {
    if (evs.length < 2) continue;
    const ds = evs.map((e) => e.date).sort();
    out.push({ id: `leave:${id}`, label: evs[0].title.replace(/\s*\(day \d+ of \d+\)$/, ""), color: "#A86FA6", from: ds[0], to: ds[ds.length - 1], link: evs[0].link, evId: evs[0].id });
  }
  return out.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
}

/** Lanes so spans in one week never collide: span id to lane index. */
export function calSpanLanes(spans: CalSpan[]): Map<string, number> {
  const ends: LocalDate[] = [];
  const out = new Map<string, number>();
  for (const sp of spans) {
    let lane = ends.findIndex((e) => e < sp.from);
    if (lane < 0) { lane = ends.length; ends.push(sp.to); } else ends[lane] = sp.to;
    out.set(sp.id, lane);
  }
  return out;
}
