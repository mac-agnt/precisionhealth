/* Client date requests. Precision Health asks a client's HR contact to suggest screening dates; HR
   picks days from Precision Health's own availability in the client portal; Dr Neil Reddy approves
   them (which creates the screening days), proposes another date, or declines with a reason.

   Availability is real: a day is open when at least one nurse is free all day on the nurse rota
   (not on leave or at training, not already on a clinic, flu clinic or client booking). Weekends and
   Irish bank holidays are never offered. Pending requests hold nothing: the nurse is only taken when
   Neil approves, so the calendar shows them as tentative.

   Pure module: types, seed, availability and the day form an approved date becomes. Handlers live in
   pages/DateRequests/actions.ts. Contacts, rooms and phone numbers are fictional. */
import type { Hhmm, Iso, LocalDate } from "./time";
import { addDays, fmtDate, hhmmToMinutes, minutesToHhmm, weekdayOf } from "./time";
import type { PhState, ProgrammeId, Staff, StaffId } from "./types";
import type { DayForm, DayScreen } from "./screeningDays";
import { BREAK_LABEL, dayFit, nurseStaff, standardDay } from "./screeningDays";
import type { BreakKey } from "./screeningDays";
import { rotaBusyReason } from "./rota";

/* ================================================================================================
   Types
   ================================================================================================ */

export type DrStatus = "asked" | "suggested" | "countered" | "approved" | "declined";
export type DrPart = "full" | "morning";
export const DR_PART_LABEL: Record<DrPart, string> = { full: "Full day", morning: "Morning" };
export const DR_STARTS: Hhmm[] = ["08:00", "08:30", "09:00", "09:30", "10:00"];
/** Up to this many dates more than the number of days needed, as back-ups. */
export const DR_EXTRA_CHOICES = 2;

/** One date the client suggests, or one Neil proposes back. */
export interface DrPick { date: LocalDate; part: DrPart; start: Hhmm }
/** A proposed date with the nurse Neil chose for it. */
export interface DrCounterPick extends DrPick { nurseId: StaffId }

export interface DrLogEntry {
  at: Iso;
  /** The person's name: a staff member or the client's HR contact. */
  by: string;
  side: "staff" | "client";
  kind: "asked" | "suggested" | "approved" | "countered" | "accepted" | "rejected_counter" | "declined";
  text: string;
}

export interface DateRequest {
  id: string; // DR-0001
  programmeId: ProgrammeId;
  /** How many screening days Precision Health needs. */
  daysNeeded: number;
  /** Window the client may choose from. */
  from: LocalDate;
  to: LocalDate;
  screen: DayScreen;
  /** Short note from Precision Health shown to HR. */
  message: string;
  askedAt: Iso;
  askedBy: string;
  /** The HR contact the (simulated) email went to. */
  contactName: string;
  contactEmail: string;
  status: DrStatus;
  /* What the client sent back. */
  picks: DrPick[];
  room: string;
  siteContactName: string;
  siteContactPhone: string;
  notes: string;
  suggestedAt: Iso | null;
  /** Neil's proposal, while countered and kept after for the record. */
  counter: { picks: DrCounterPick[]; note: string; at: Iso; by: string } | null;
  decidedAt: Iso | null;
  decidedBy: string | null;
  declineReason: string;
  /** Screening days created on approval. */
  dayIds: string[];
  log: DrLogEntry[];
}

export interface DateRequestsState { requests: DateRequest[] }

export const DR_STATUS_LABEL: Record<DrStatus, string> = {
  asked: "Waiting for the client",
  suggested: "Waiting for Neil",
  countered: "New date proposed, waiting for the client",
  approved: "Approved",
  declined: "Declined",
};
export const DR_STATUS_TONE: Record<DrStatus, "ok" | "warn" | "bad" | "info" | "neutral"> = {
  asked: "neutral", suggested: "warn", countered: "info", approved: "ok", declined: "bad",
};
export const drOpen = (r: Pick<DateRequest, "status">) => r.status === "asked" || r.status === "suggested" || r.status === "countered";

/* ================================================================================================
   Irish bank holidays, weekends and the day's hours
   ================================================================================================ */

export const IE_BANK_HOLIDAYS: Record<LocalDate, string> = {
  "2026-01-01": "New Year's Day", "2026-02-02": "St Brigid's Day", "2026-03-17": "St Patrick's Day", "2026-04-06": "Easter Monday",
  "2026-05-04": "May bank holiday", "2026-06-01": "June bank holiday", "2026-08-03": "August bank holiday", "2026-10-26": "October bank holiday",
  "2026-12-25": "Christmas Day", "2026-12-26": "St Stephen's Day",
  "2027-01-01": "New Year's Day", "2027-02-01": "St Brigid's Day", "2027-03-17": "St Patrick's Day", "2027-03-29": "Easter Monday",
  "2027-05-03": "May bank holiday", "2027-06-07": "June bank holiday", "2027-08-02": "August bank holiday", "2027-10-25": "October bank holiday",
  "2027-12-25": "Christmas Day", "2027-12-26": "St Stephen's Day", "2027-12-27": "Christmas holiday", "2027-12-28": "St Stephen's Day holiday",
};
export const bankHoliday = (d: LocalDate): string | null => IE_BANK_HOLIDAYS[d] || null;
export const isWeekend = (d: LocalDate) => { const w = weekdayOf(d); return w === 0 || w === 6; };

/** Start and finish for a part of the day: a full day runs 7.5 hours, a morning 4 hours. */
export function drHours(p: Pick<DrPick, "part" | "start">): { start: Hhmm; end: Hhmm } {
  const s = hhmmToMinutes(p.start);
  return { start: p.start, end: minutesToHhmm(Math.min(19 * 60, s + (p.part === "morning" ? 240 : 450))) };
}
export const drPickText = (p: DrPick) => { const h = drHours(p); return `${DR_PART_LABEL[p.part]}, ${h.start.replace(/^0/, "")} to ${h.end.replace(/^0/, "")}`; };

/* ================================================================================================
   Availability, from the nurse rota
   ================================================================================================ */

export interface NurseAvail { staff: Staff; free: boolean; reason: string | null }

/** Every nurse on the team for a date and hours: free ones first, busy ones with the reason. */
export function drNurses(s: PhState, date: LocalDate, start: Hhmm, end: Hhmm): NurseAvail[] {
  const item = { date, start, end, key: "dr:probe" };
  return nurseStaff(s)
    .map((n) => { const reason = rotaBusyReason(s, n.id, item); return { staff: n, free: !reason, reason }; })
    .sort((a, b) => Number(b.free) - Number(a.free));
}
export const drFreeNurses = (s: PhState, date: LocalDate, start: Hhmm, end: Hhmm) => drNurses(s, date, start, end).filter((x) => x.free).map((x) => x.staff);

export type DrDayState = "past" | "outside" | "weekend" | "holiday" | "full" | "limited" | "open";
export interface DrDayInfo { date: LocalDate; state: DrDayState; free: number; label: string; pickable: boolean }

/**
 * What the client sees for one date: open, limited (one nurse left), fully booked, a weekend, a bank
 * holiday, too soon, or outside the window. A day needs a nurse free for the full standard day.
 */
export function drDayInfo(s: PhState, date: LocalDate, window: { from: LocalDate; to: LocalDate } | null): DrDayInfo {
  const t = s.clock.nowUtc.slice(0, 10);
  const base = { date, free: 0 };
  if (date <= t) return { ...base, state: "past", label: "Not available", pickable: false };
  if (window && (date < window.from || date > window.to)) return { ...base, state: "outside", label: "Outside the dates asked for", pickable: false };
  if (isWeekend(date)) return { ...base, state: "weekend", label: "Weekend", pickable: false };
  const hol = bankHoliday(date);
  if (hol) return { ...base, state: "holiday", label: `Bank holiday: ${hol}`, pickable: false };
  const free = drFreeNurses(s, date, "09:00", "16:30").length;
  if (!free) return { ...base, state: "full", label: "Fully booked", pickable: false };
  return { date, free, state: free === 1 ? "limited" : "open", label: free === 1 ? "Available, limited" : "Available", pickable: true };
}

/** Why a pick cannot be offered, or null. */
export function drPickProblem(s: PhState, p: DrPick, window: { from: LocalDate; to: LocalDate } | null): string | null {
  const info = drDayInfo(s, p.date, window);
  if (!info.pickable) return `${fmtDate(p.date)}: ${info.label.toLowerCase()}.`;
  if (!DR_STARTS.includes(p.start)) return "Choose a start time from the list.";
  if (p.part !== "full" && p.part !== "morning") return "Choose a morning or a full day.";
  const h = drHours(p);
  if (!drFreeNurses(s, p.date, h.start, h.end).length) return `${fmtDate(p.date)} is no longer free at those times.`;
  return null;
}

/** Month grid (Monday first) covering a month: leading and trailing days are null. */
export function drMonthGrid(month: string): Array<LocalDate | null> {
  const first = `${month}-01` as LocalDate;
  const lead = (weekdayOf(first) + 6) % 7;
  const out: Array<LocalDate | null> = Array.from({ length: lead }, () => null);
  for (let d = first; d.slice(0, 7) === month; d = addDays(d, 1)) out.push(d);
  while (out.length % 7) out.push(null);
  return out;
}
export const monthOf = (d: LocalDate) => d.slice(0, 7);
export function drAddMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const v = y * 12 + (m - 1) + n;
  return `${Math.floor(v / 12)}-${String((v % 12) + 1).padStart(2, "0")}`;
}
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const monthLabel = (month: string) => `${MONTH_NAMES[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`;

/* ================================================================================================
   The screening day an approved date becomes
   ================================================================================================ */

/** The day form for an approved date: standard breaks that fit, as many appointments as fit, the client's room and contact. */
export function drDayForm(r: Pick<DateRequest, "programmeId" | "screen" | "room" | "siteContactName" | "siteContactPhone" | "notes" | "id">, p: DrPick, nurseId: StaffId): DayForm {
  const f = standardDay(r.programmeId);
  const h = drHours(p);
  f.screen = r.screen; f.date = p.date; f.nurseId = nurseId; f.start = h.start; f.end = h.end;
  const s = hhmmToMinutes(h.start), e = hhmmToMinutes(h.end);
  for (const k of Object.keys(BREAK_LABEL) as BreakKey[]) {
    const b = f.breaks[k];
    if (!b) continue;
    const bs = hhmmToMinutes(b.start);
    if (bs < s + 30 || bs + b.minutes > e - 15 || (p.part === "morning" && k !== "first")) f.breaks[k] = null;
  }
  f.appointments = dayFit(f);
  f.room = r.room.trim();
  f.contactName = r.siteContactName.trim();
  f.contactPhone = r.siteContactPhone.trim();
  f.notes = [`From client date request ${r.id}.`, r.notes.trim() ? `HR note: ${r.notes.trim()}` : ""].filter(Boolean).join(" ").slice(0, 600);
  return f;
}

/* ================================================================================================
   Seed: IBM has been asked for two more days in November and has not answered yet; Salesforce has
   suggested two dates and is waiting for Neil.
   ================================================================================================ */

export function initialDateRequestsState(): DateRequestsState {
  const ibm: DateRequest = {
    id: "DR-0001", programmeId: "PRG-IBM-26", daysNeeded: 2, from: "2026-11-02", to: "2026-11-27", screen: "lab",
    message: "Two more screening days for employees who missed the October dates.",
    askedAt: "2026-10-02T10:05:00.000Z", askedBy: "Stephen Kelly", contactName: "Mairéad Costello", contactEmail: "mairead.costello@example.com",
    status: "asked", picks: [], room: "", siteContactName: "", siteContactPhone: "", notes: "", suggestedAt: null, counter: null,
    decidedAt: null, decidedBy: null, declineReason: "", dayIds: [],
    log: [{ at: "2026-10-02T10:05:00.000Z", by: "Stephen Kelly", side: "staff", kind: "asked", text: "Asked IBM for 2 lab bloods days between 2 and 27 November. Email sent to Mairéad Costello (simulated)." }],
  };
  const sf: DateRequest = {
    id: "DR-0002", programmeId: "PRG-SF-26", daysNeeded: 1, from: "2026-11-09", to: "2026-11-30", screen: "poc",
    message: "One point of care day for the new starters.",
    askedAt: "2026-09-30T13:20:00.000Z", askedBy: "Brenda Madden", contactName: "Daragh Coyle", contactEmail: "daragh.coyle@example.com",
    status: "suggested",
    picks: [{ date: "2026-11-17", part: "full", start: "09:00" }, { date: "2026-11-18", part: "morning", start: "09:30" }],
    room: "Wellness Room 4.12, Level 4", siteContactName: "Emma Kinsella", siteContactPhone: "085 555 0198",
    notes: "Lunchtime is quiet, so a full day suits us best.", suggestedAt: "2026-10-03T08:40:00.000Z", counter: null,
    decidedAt: null, decidedBy: null, declineReason: "", dayIds: [],
    log: [
      { at: "2026-09-30T13:20:00.000Z", by: "Brenda Madden", side: "staff", kind: "asked", text: "Asked Salesforce for 1 point of care day between 9 and 30 November. Email sent to Daragh Coyle (simulated)." },
      { at: "2026-10-03T08:40:00.000Z", by: "Daragh Coyle", side: "client", kind: "suggested", text: "Suggested Tue 17 Nov (full day from 9:00) and Wed 18 Nov (morning from 9:30). Room: Wellness Room 4.12, Level 4. Contact on the day: Emma Kinsella." },
    ],
  };
  return { requests: [ibm, sf] };
}

/** The request the client portal should show for a programme: the open one, else the latest decided in the last 21 days. */
export function drForProgramme(s: PhState, programmeId: ProgrammeId): DateRequest | null {
  const list = (s.dateRequests?.requests || []).filter((r) => r.programmeId === programmeId);
  const open = list.filter(drOpen);
  if (open.length) return open[open.length - 1];
  const now = Date.parse(s.clock.nowUtc);
  const recent = list.filter((r) => r.decidedAt && now - Date.parse(r.decidedAt) < 21 * 86400000);
  return recent.length ? recent[recent.length - 1] : null;
}
