/* Nurse rota (Clinics, Nurse rota). One view of who is working where, built from the records that
   already hold each assignment, so nothing is copied:
   - clinic sessions and the screening days on them (ClinicSession.nurseId and supportIds),
   - client bookings on the nurses' bookings board (BoardItem.staffIds),
   - flu clinics (FluClinic.staffIds),
   - occupational health sessions in Meddbase (OhDiary.clinicianStaffId),
   - leave and training scheduled from the Calendar (state.scheduled).
   Conflicts: a nurse booked on two things that overlap, or working on a day they are on leave or at
   training. Flu clinics only record a start time, so they count as three hours for overlaps.

   Pure module: no React, no dispatch. Handlers live in src/ph/pages/Clinics/rotaActions.ts. */
import type { Hhmm, LocalDate } from "./time";
import { addDays, fmtDate, hhmmToMinutes, minutesToHhmm, startOfWeek } from "./time";
import type { PhState, Staff } from "./types";
import type { NavTarget } from "./nav";
import { NURSE_ROLE_KEYS } from "./constants";
import { memo } from "./selectors";
import { schedDays, schedItems } from "./scheduledActions";

export type RotaKind = "screening_day" | "clinic" | "booking" | "flu" | "oh" | "leave" | "training";
export type RotaRefKind = "session" | "board" | "flu" | "oh" | "sched";
export interface RotaRef { kind: RotaRefKind; id: string }

export const ROTA_KIND_LABEL: Record<RotaKind, string> = {
  screening_day: "Screening day", clinic: "Clinic session", booking: "Client booking", flu: "Flu clinic", oh: "Occupational health", leave: "Leave", training: "Training",
};
/** Minutes a flu clinic is assumed to run, since only its start is recorded. */
export const ROTA_FLU_MINUTES = 180;

export interface RotaItem {
  /** "session:CLN-IBM-20261106", "flu:FLU-26-004", "board:BRD-0003:2026-10-20", "sched:SA-0002:2026-10-12" */
  key: string;
  kind: RotaKind;
  ref: RotaRef;
  date: LocalDate;
  /** Null start means all day. */
  start: Hhmm | null;
  end: Hhmm | null;
  title: string;
  client: string;
  where: string;
  /** The lead nurse (clinic sessions and Meddbase sessions), else the first person on it. */
  leadId: string | null;
  /** Everyone on it, lead first. */
  staffIds: string[];
  supportIds: string[];
  /** Work that has nobody on it yet. */
  unstaffed: boolean;
  absence: boolean;
  status: string;
  link: NavTarget;
  dayId: string | null;
  /** Past or completed: shown but not changed from the rota. */
  locked: boolean;
}

export interface RotaConflict { staffId: string; date: LocalDate; keys: string[]; text: string; kind: "leave" | "double" }

/** People on the rota: the nursing lead, nurses and wellness support, in roster order. */
export function rotaNurses(s: Pick<PhState, "staff">): Staff[] {
  return s.staff.filter((x) => NURSE_ROLE_KEYS.includes(x.role) || x.role === "wellness_support");
}
export const isRotaNurse = (s: Pick<PhState, "staff">, id: string) => rotaNurses(s).some((x) => x.id === id);

/** Monday to Sunday of the week holding a date. */
export function rotaWeek(date: LocalDate): LocalDate[] {
  const mon = startOfWeek(date);
  return Array.from({ length: 7 }, (_, i) => addDays(mon, i));
}

const span = (x: Pick<RotaItem, "start" | "end">): [number, number] => {
  if (!x.start) return [0, 24 * 60];
  const a = hhmmToMinutes(x.start);
  return [a, x.end ? hhmmToMinutes(x.end) : a + ROTA_FLU_MINUTES];
};
export const rotaOverlap = (a: Pick<RotaItem, "start" | "end">, b: Pick<RotaItem, "start" | "end">) => {
  const [a0, a1] = span(a), [b0, b1] = span(b);
  return a0 < b1 && b0 < a1;
};
export const rotaTimeText = (x: Pick<RotaItem, "start" | "end" | "kind">) =>
  !x.start ? "All day" : x.end ? `${x.start} to ${x.end}` : `From ${x.start}`;

/** Every rota item on one date. Memoised per state object. */
export function rotaItemsOn(s: PhState, date: LocalDate): RotaItem[] {
  return memo(s, "rota:on:" + date, () => {
    const t = s.clock.nowUtc.slice(0, 10);
    const out: RotaItem[] = [];
    const known = new Set<string>(s.staff.map((x) => x.id));
    const ok = (id: string | null | undefined): id is string => !!id && known.has(id);
    const dayBySession = new Map(s.screeningDays.days.map((d) => [d.sessionId, d]));
    for (const x of s.sessions) {
      if (x.date !== date || x.status === "cancelled") continue;
      const prog = s.programmes.find((p) => p.id === x.programmeId);
      const day = dayBySession.get(x.id);
      const lead = ok(x.nurseId) ? x.nurseId : null;
      const support = x.supportIds.filter(ok);
      out.push({
        key: `session:${x.id}`, kind: day ? "screening_day" : "clinic", ref: { kind: "session", id: x.id }, date, start: x.start, end: x.end,
        title: `${prog?.clientName || "Clinic"} ${day ? "screening day" : "clinic"}`, client: prog?.clientName || "", where: [x.room, x.siteName].filter(Boolean).join(", "),
        leadId: lead, staffIds: [...(lead ? [lead] : []), ...support], supportIds: support, unstaffed: !lead, absence: false,
        status: day ? (day.status === "draft" ? "Draft" : "Published") : x.status === "completed" ? "Completed" : "Scheduled",
        link: day ? { page: "Clinics", tab: "days", params: { day: day.id } } : { page: "Clinics", tab: "schedule", params: { session: x.id, date } },
        dayId: day?.id || null, locked: date < t || x.status === "completed",
      });
    }
    for (const b of s.nurseOps.board) {
      if (!b.dates.includes(date)) continue;
      const staff = b.staffIds.filter(ok);
      out.push({
        key: `board:${b.id}:${date}`, kind: "booking", ref: { kind: "board", id: b.id }, date, start: b.start, end: b.end,
        title: `${b.client}: ${b.logistics.screeningType || "client booking"}`, client: b.client, where: b.room || b.logistics.address || "",
        leadId: staff[0] || null, staffIds: staff, supportIds: staff.slice(1), unstaffed: !staff.length, absence: false, status: b.logistics.status || "Booked",
        link: { page: "Clinics", tab: "board", params: { edit: `board:${b.id}` } }, dayId: null, locked: date < t,
      });
    }
    for (const c of s.flu.clinics) {
      if (c.date !== date || c.status === "cancelled" || c.status === "requested") continue;
      const staff = c.staffIds.filter(ok);
      out.push({
        key: `flu:${c.id}`, kind: "flu", ref: { kind: "flu", id: c.id }, date, start: c.start, end: c.start ? minutesToHhmm(hhmmToMinutes(c.start) + ROTA_FLU_MINUTES) : null,
        title: `${c.company} flu clinic`, client: c.company, where: c.address, leadId: staff[0] || null, staffIds: staff, supportIds: staff.slice(1),
        unstaffed: !staff.length, absence: false, status: c.status === "completed" ? "Completed" : "Scheduled",
        link: { page: "Flu", tab: "bookings", params: { clinic: c.id } }, dayId: null, locked: date < t || c.status === "completed",
      });
    }
    for (const d of s.occHealth.diaries) {
      if (d.date !== date) continue;
      const client = s.occHealth.clients.find((c) => c.id === d.clientId)?.name || "Client";
      const lead = ok(d.clinicianStaffId) ? d.clinicianStaffId : null;
      out.push({
        key: `oh:${d.id}`, kind: "oh", ref: { kind: "oh", id: d.id }, date, start: d.start, end: d.end, title: `${client}: occupational health`, client, where: d.location,
        leadId: lead, staffIds: lead ? [lead] : [], supportIds: [], unstaffed: !lead, absence: false, status: "Meddbase",
        link: { page: "OccHealth", tab: "sessions", params: { diary: d.id } }, dayId: null, locked: date < t,
      });
    }
    for (const x of schedItems(s)) {
      if ((x.kind !== "leave" && x.kind !== "training") || x.status === "cancelled" || !schedDays(x).includes(date)) continue;
      const staff = x.staffIds.filter(ok);
      out.push({
        key: `sched:${x.id}:${date}`, kind: x.kind, ref: { kind: "sched", id: x.id }, date, start: x.kind === "leave" ? null : x.start, end: x.kind === "leave" ? null : x.end,
        title: x.title, client: "", where: x.notes, leadId: null, staffIds: staff, supportIds: [], unstaffed: false, absence: true, status: x.kind === "leave" ? "Leave" : "Training",
        link: { page: "Calendar", tab: "all", params: { view: "week", date } }, dayId: null, locked: false,
      });
    }
    return out.sort((a, b) => span(a)[0] - span(b)[0] || a.title.localeCompare(b.title));
  });
}

export function rotaItemsBetween(s: PhState, from: LocalDate, to: LocalDate): RotaItem[] {
  const out: RotaItem[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(...rotaItemsOn(s, d));
  return out;
}

/** One nurse's items on a date. */
export const rotaCellItems = (s: PhState, staffId: string, date: LocalDate) => rotaItemsOn(s, date).filter((x) => x.staffIds.includes(staffId));

/** Conflicts for one nurse on one date: work while on leave or at training, and overlapping work. */
export function rotaConflicts(s: PhState, staffId: string, date: LocalDate): RotaConflict[] {
  return memo(s, `rota:cf:${staffId}:${date}`, () => {
    const items = rotaCellItems(s, staffId, date);
    const work = items.filter((x) => !x.absence);
    const away = items.filter((x) => x.absence);
    const out: RotaConflict[] = [];
    for (const a of away) {
      const hit = work.filter((w) => rotaOverlap(a, w));
      if (hit.length) out.push({ staffId, date, keys: [a.key, ...hit.map((h) => h.key)], kind: "leave",
        text: `${a.kind === "leave" ? "On leave" : `At ${a.title.toLowerCase()}`} but booked on ${hit.map((h) => h.title).join(" and ")}` });
    }
    for (let i = 0; i < work.length; i++) for (let j = i + 1; j < work.length; j++) {
      if (rotaOverlap(work[i], work[j])) out.push({ staffId, date, keys: [work[i].key, work[j].key], kind: "double", text: `Double-booked: ${work[i].title} and ${work[j].title}` });
    }
    return out;
  });
}
export const rotaConflictKeys = (s: PhState, staffId: string, date: LocalDate) => new Set(rotaConflicts(s, staffId, date).flatMap((c) => c.keys));

/** Every conflict in a date range, for the summary line. */
export function rotaConflictsBetween(s: PhState, from: LocalDate, to: LocalDate): RotaConflict[] {
  const out: RotaConflict[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) for (const n of rotaNurses(s)) out.push(...rotaConflicts(s, n.id, d));
  return out;
}

/** Work with nobody on it, from a date range. Past work is left out. */
export function rotaUnstaffed(s: PhState, from: LocalDate, to: LocalDate): RotaItem[] {
  return rotaItemsBetween(s, from, to).filter((x) => x.unstaffed && !x.locked);
}

/** Why a nurse cannot take an item, or null when they are free for it. */
export function rotaBusyReason(s: PhState, staffId: string, item: Pick<RotaItem, "date" | "start" | "end" | "key">): string | null {
  const name = s.staff.find((x) => x.id === staffId)?.name.split(" ")[0] || staffId;
  for (const x of rotaCellItems(s, staffId, item.date)) {
    if (x.key === item.key || !rotaOverlap(x, item)) continue;
    if (x.kind === "leave") return `${name} is on leave on ${fmtDate(item.date)}.`;
    if (x.kind === "training") return `${name} is at ${x.title.toLowerCase()} then.`;
    return `${name} is on ${x.title} (${rotaTimeText(x)}) then.`;
  }
  return null;
}

/** Nurses for an item: free ones first, with the reason a busy one cannot take it. */
export function rotaCandidates(s: PhState, item: RotaItem): Array<{ staff: Staff; busy: string | null; on: boolean }> {
  return rotaNurses(s)
    .map((st) => ({ staff: st, on: item.staffIds.includes(st.id), busy: item.staffIds.includes(st.id) ? null : rotaBusyReason(s, st.id, item) }))
    .sort((a, b) => Number(a.on) - Number(b.on) || Number(!!a.busy) - Number(!!b.busy));
}

/** Work on a date that a nurse could be put on from an empty cell: unstaffed work first, then work to support. */
export function rotaOpenWork(s: PhState, staffId: string, date: LocalDate): Array<{ item: RotaItem; busy: string | null; as: "lead" | "support" }> {
  return rotaItemsOn(s, date)
    .filter((x) => !x.absence && !x.locked && !x.staffIds.includes(staffId))
    .map((x) => ({ item: x, busy: rotaBusyReason(s, staffId, x), as: (x.unstaffed ? "lead" : "support") as "lead" | "support" }))
    .sort((a, b) => Number(b.item.unstaffed) - Number(a.item.unstaffed) || Number(!!a.busy) - Number(!!b.busy));
}
