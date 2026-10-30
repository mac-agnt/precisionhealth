/* Screening days (Clinics, Screening days). An administrator sets up a client's screening day:
   client, screen type, nurse, times and breaks, appointments, room and logistics. Every saved day is
   backed by a real ClinicSession, so it shows on the Clinics schedule with the right slots and breaks.
   A day is a Draft until someone publishes it; only published days reach the client (HR) portal.

   The "agent" here is a deterministic parser: it reads a plain English request, an edit instruction
   or a pasted HR email and proposes field values with the words it read them from. A person always
   confirms before anything is saved. Pure module: types, seed, rules and parsers. Handlers live in
   pages/Clinics/daysActions.ts. Contacts, rooms and phone numbers are fictional. */
import type { Hhmm, Iso, LocalDate } from "./time";
import { addDays, fmtDate, fmtDateLong, fmtWeekdayDate, hhmmToMinutes, minutesToHhmm, weekdayOf } from "./time";
import type { ClinicSession, PhState, ProgrammeId, Slot, Staff, StaffId } from "./types";
import { CLINIC_DAY, NURSE_ROLE_KEYS, PROGRAMME_BY_ID, PROGRAMME_ORDER, STAFF, buildSlots } from "./constants";
import type { SessionLogistics } from "./nurseOps";
import { isRealDate } from "./capture";

/* ================================================================================================
   Types
   ================================================================================================ */

export type DayScreen = "lab" | "poc";
export const DAY_SCREEN_LABEL: Record<DayScreen, string> = { lab: "Lab bloods", poc: "Point of care" };
export const DAY_SCREEN_SHORT: Record<DayScreen, string> = { lab: "Lab", poc: "Point of care" };

export interface DayBreak { start: Hhmm; minutes: number }
export type BreakKey = "first" | "lunch" | "afternoon";
export const BREAK_LABEL: Record<BreakKey, string> = { first: "First break", lunch: "Lunch", afternoon: "Afternoon break" };
export const BREAK_DEFAULT_MINUTES: Record<BreakKey, number> = { first: 15, lunch: 30, afternoon: 15 };

/** Everything a person fills in for a day. The agent proposes one of these; the manual form edits one. */
export interface DayForm {
  programmeId: ProgrammeId | "";
  screen: DayScreen;
  date: LocalDate | "";
  nurseId: StaffId | "";
  start: Hhmm;
  end: Hhmm;
  breaks: Record<BreakKey, DayBreak | null>;
  /** Appointments offered. Null while the person is typing. */
  appointments: number | null;
  slotMinutes: number;
  /** Room and building, e.g. "Room 2.14, Building B". Empty means not confirmed yet. */
  room: string;
  parking: string;
  /** Logistics notes for the nurse, e.g. "Bring the centrifuge". */
  notes: string;
  contactName: string;
  contactPhone: string;
}
export type DayField = keyof Omit<DayForm, "breaks"> | BreakKey;

export interface DayChange { field: DayField; label: string; from: string; to: string }
export interface DayHistoryEntry {
  at: Iso;
  by: string;
  /** created, edited, published, unpublished, hr_reply */
  kind: "created" | "edited" | "published" | "unpublished" | "hr_reply";
  via: "agent" | "form" | "hr_email" | null;
  summary: string;
  changes: DayChange[];
}

export interface ScreeningDay extends DayForm {
  id: string; // SD-0001
  programmeId: ProgrammeId;
  date: LocalDate;
  nurseId: StaffId;
  sessionId: string;
  status: "draft" | "published";
  createdAt: Iso;
  createdBy: string;
  publishedAt: Iso | null;
  publishedBy: string | null;
  history: DayHistoryEntry[];
}

export interface ScreeningDaysState { days: ScreeningDay[] }

/* ================================================================================================
   Labels, formatting and the standard day
   ================================================================================================ */

export const FIELD_LABEL: Record<DayField, string> = {
  programmeId: "Client", screen: "Screen type", date: "Date", nurseId: "Nurse", start: "Start", end: "Finish",
  first: "First break", lunch: "Lunch", afternoon: "Afternoon break", appointments: "Appointments", slotMinutes: "Appointment length",
  room: "Room and location", parking: "Parking", notes: "Logistics notes", contactName: "Contact on the day", contactPhone: "Contact phone",
};
/** Order fields are listed in, everywhere. */
export const FIELD_ORDER: DayField[] = ["programmeId", "date", "screen", "nurseId", "start", "first", "lunch", "afternoon", "end", "appointments", "slotMinutes", "room", "parking", "notes", "contactName", "contactPhone"];

const staffById = (id: string): Staff | undefined => STAFF.find((s) => s.id === id);
export const nurseStaff = (state?: Pick<PhState, "staff">): Staff[] => (state ? state.staff : STAFF).filter((s) => NURSE_ROLE_KEYS.includes(s.role));

/** 09:00 shown as "9:00", 16:30 as "16:30". Irish 24-hour convention, no leading zero. */
export const fmtHm = (t: string) => (t && /^\d{2}:\d{2}$/.test(t) ? t.replace(/^0/, "") : t || "");
export function breakText(b: DayBreak | null): string {
  if (!b) return "None";
  return `${fmtHm(b.start)} to ${fmtHm(minutesToHhmm(hhmmToMinutes(b.start) + b.minutes))} (${b.minutes} min)`;
}

export function fieldText(f: DayForm, k: DayField, state?: Pick<PhState, "staff">): string {
  switch (k) {
    case "programmeId": return f.programmeId ? PROGRAMME_BY_ID[f.programmeId].clientName : "Not set";
    case "screen": return DAY_SCREEN_LABEL[f.screen];
    case "date": return f.date && isRealDate(f.date) ? fmtDateLong(f.date) : "Not set";
    case "nurseId": return f.nurseId ? ((state ? state.staff.find((s) => s.id === f.nurseId) : staffById(f.nurseId))?.name || f.nurseId) : "Not set";
    case "start": return fmtHm(f.start);
    case "end": return fmtHm(f.end);
    case "first": case "lunch": case "afternoon": return breakText(f.breaks[k]);
    case "appointments": return f.appointments === null ? "Not set" : String(f.appointments);
    case "slotMinutes": return `${f.slotMinutes} minutes`;
    case "room": return f.room.trim() || "To be confirmed";
    case "parking": return f.parking.trim() || "None";
    case "notes": return f.notes.trim() || "None";
    case "contactName": return f.contactName.trim() || "Not set";
    case "contactPhone": return f.contactPhone.trim() || "Not set";
  }
}

/** Precision Health's standard clinic day, used for anything the request does not say. */
export function standardDay(programmeId: ProgrammeId | "" = ""): DayForm {
  const b = CLINIC_DAY.breaks;
  const mins = (i: number) => hhmmToMinutes(b[i].end) - hhmmToMinutes(b[i].start);
  const f: DayForm = {
    programmeId, screen: "lab", date: "", nurseId: "", start: CLINIC_DAY.start, end: CLINIC_DAY.end,
    breaks: { first: { start: b[0].start, minutes: mins(0) }, lunch: { start: b[1].start, minutes: mins(1) }, afternoon: { start: b[2].start, minutes: mins(2) } },
    appointments: null, slotMinutes: CLINIC_DAY.slotMinutes, room: "", parking: "", notes: "", contactName: "", contactPhone: "",
  };
  f.appointments = dayFit(f);
  return f;
}

export const formOf = (d: ScreeningDay): DayForm => ({
  programmeId: d.programmeId, screen: d.screen, date: d.date, nurseId: d.nurseId, start: d.start, end: d.end,
  breaks: { first: d.breaks.first ? { ...d.breaks.first } : null, lunch: d.breaks.lunch ? { ...d.breaks.lunch } : null, afternoon: d.breaks.afternoon ? { ...d.breaks.afternoon } : null },
  appointments: d.appointments, slotMinutes: d.slotMinutes, room: d.room, parking: d.parking, notes: d.notes, contactName: d.contactName, contactPhone: d.contactPhone,
});

/* ================================================================================================
   Slots, fit and validation
   ================================================================================================ */

const okTime = (t: string) => /^\d{2}:\d{2}$/.test(t) && Number(t.slice(0, 2)) < 24 && Number(t.slice(3)) < 60;

export function sessionBreaks(f: Pick<DayForm, "breaks">): Array<{ start: Hhmm; end: Hhmm }> {
  return (["first", "lunch", "afternoon"] as BreakKey[])
    .map((k) => f.breaks[k])
    .filter((b): b is DayBreak => !!b && okTime(b.start) && b.minutes > 0)
    .map((b) => ({ start: b.start, end: minutesToHhmm(hhmmToMinutes(b.start) + b.minutes) }))
    .sort((a, b) => (a.start < b.start ? -1 : 1));
}
/** Every appointment time that fits between start and finish, around the breaks. */
export function dayFitSlots(f: DayForm): Slot[] {
  if (!okTime(f.start) || !okTime(f.end) || !(f.slotMinutes >= 5) || hhmmToMinutes(f.end) <= hhmmToMinutes(f.start)) return [];
  return buildSlots(f.start, f.end, sessionBreaks(f), f.slotMinutes);
}
export const dayFit = (f: DayForm) => dayFitSlots(f).length;
/** The appointment times offered: the first N that fit. */
export function daySlots(f: DayForm): Slot[] {
  const all = dayFitSlots(f);
  return f.appointments && f.appointments > 0 ? all.slice(0, f.appointments) : all;
}

export interface DayCheckCtx {
  today: LocalDate;
  /** Other clinic sessions, to catch a nurse or room that is already busy. */
  sessions?: ClinicSession[];
  /** The session this day already owns, ignored in the clash check. */
  ownSessionId?: string | null;
  staff?: Staff[];
}

/** Field problems, keyed by field. Empty means the day can be saved. */
export function dayErrors(f: DayForm, ctx: DayCheckCtx): Partial<Record<DayField, string>> {
  const e: Partial<Record<DayField, string>> = {};
  if (!f.programmeId) e.programmeId = "Choose the client.";
  if (!f.date || !isRealDate(f.date)) e.date = "Choose the date.";
  else if (f.date < ctx.today) e.date = "This date has passed. Choose today or a later date.";
  if (!f.nurseId) e.nurseId = "Choose the nurse.";
  else if (ctx.staff && !ctx.staff.some((s) => s.id === f.nurseId && NURSE_ROLE_KEYS.includes(s.role))) e.nurseId = "Choose a nurse from the nursing team.";
  if (!okTime(f.start)) e.start = "Enter the start time.";
  if (!okTime(f.end)) e.end = "Enter the finish time.";
  const s = okTime(f.start) ? hhmmToMinutes(f.start) : NaN, en = okTime(f.end) ? hhmmToMinutes(f.end) : NaN;
  if (!e.start && !e.end && en <= s) e.end = "The finish must be after the start.";
  if (!(Number.isInteger(f.slotMinutes) && f.slotMinutes >= 5 && f.slotMinutes <= 120)) e.slotMinutes = "Appointment length must be 5 to 120 minutes.";
  let prevEnd = s, prevLabel = "the start";
  for (const k of ["first", "lunch", "afternoon"] as BreakKey[]) {
    const b = f.breaks[k];
    if (!b) continue;
    if (!okTime(b.start)) { e[k] = `Enter a time for the ${BREAK_LABEL[k].toLowerCase()}, or choose no break.`; continue; }
    if (!(b.minutes >= 5 && b.minutes <= 120)) { e[k] = "A break is 5 to 120 minutes."; continue; }
    const bs = hhmmToMinutes(b.start), be = bs + b.minutes;
    if (Number.isFinite(s) && bs < s) e[k] = `${BREAK_LABEL[k]} starts before the day starts (${fmtHm(f.start)}).`;
    else if (Number.isFinite(en) && be > en) e[k] = `${BREAK_LABEL[k]} runs past the finish (${fmtHm(f.end)}).`;
    else if (Number.isFinite(prevEnd) && bs < prevEnd) e[k] = `${BREAK_LABEL[k]} overlaps ${prevLabel}. Keep the breaks in order: first break, lunch, afternoon break.`;
    prevEnd = be; prevLabel = BREAK_LABEL[k].toLowerCase();
  }
  const fit = dayFit(f);
  if (f.appointments === null || !Number.isInteger(f.appointments) || f.appointments < 1) e.appointments = "Enter the number of appointments.";
  else if (f.appointments > fit) e.appointments = `Only ${fit} appointment${fit === 1 ? "" : "s"} of ${f.slotMinutes} minutes fit in this day. Lower the number, shorten the breaks or finish later.`;
  if (f.room.length > 120) e.room = "Keep the room under 120 characters.";
  if (f.notes.length > 600) e.notes = "Keep the notes under 600 characters.";
  if (f.contactPhone.trim() && !/^[+\d][\d\s()-]{6,}$/.test(f.contactPhone.trim())) e.contactPhone = "Enter a phone number, for example 087 555 0142.";
  // Nurse or room already busy at the same time on that date.
  if (ctx.sessions && f.date && !e.date && !e.start && !e.end) {
    const clash = ctx.sessions.filter((x) => x.id !== ctx.ownSessionId && x.date === f.date && x.status !== "cancelled"
      && hhmmToMinutes(x.start) < en && s < hhmmToMinutes(x.end));
    const nurseClash = f.nurseId ? clash.find((x) => x.nurseId === f.nurseId || x.supportIds.includes(f.nurseId as StaffId)) : undefined;
    if (nurseClash && !e.nurseId) e.nurseId = `${staffById(f.nurseId)?.name || "This nurse"} is already at ${PROGRAMME_BY_ID[nurseClash.programmeId].clientName} (${nurseClash.room}) from ${fmtHm(nurseClash.start)} to ${fmtHm(nurseClash.end)} that day.`;
    const room = normRoom(f.room);
    const roomClash = room ? clash.find((x) => normRoom(x.room) === room) : undefined;
    if (roomClash && !e.room) e.room = `${f.room} is already in use by another clinic at the same time that day.`;
  }
  return e;
}
const normRoom = (r: string) => (/^to be confirmed$/i.test(r.trim()) ? "" : r.trim().toLowerCase().replace(/\s+/g, " "));

/** Why a day cannot be published yet. Empty when it can. */
export function publishBlockers(d: DayForm): string[] {
  const out: string[] = [];
  if (!d.room.trim() || /^to be confirmed$/i.test(d.room.trim())) out.push("Confirm the room first. The client's HR contact usually confirms it by email.");
  return out;
}

/** Field-by-field difference between two forms, in display order. */
export function diffForms(a: DayForm, b: DayForm, state?: Pick<PhState, "staff">): DayChange[] {
  const out: DayChange[] = [];
  for (const k of FIELD_ORDER) {
    const x = fieldText(a, k, state), y = fieldText(b, k, state);
    if (x !== y) out.push({ field: k, label: FIELD_LABEL[k], from: x, to: y });
  }
  return out;
}

/* ================================================================================================
   Clinic session backing a day
   ================================================================================================ */

export const ROOM_TBC = "To be confirmed";

/** Short site name for a programme, e.g. "IBM Dublin". */
export const siteFor = (programmeId: ProgrammeId) => PROGRAMME_BY_ID[programmeId].sites[0].split(", ")[0];

export function sessionIdForDay(programmeId: ProgrammeId, date: LocalDate, taken: Set<string>): string {
  const base = `CLN-${PROGRAMME_BY_ID[programmeId].code}-${date.replace(/-/g, "")}`;
  if (!taken.has(base)) return base;
  for (let i = 2; i < 50; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
  return `${base}-${taken.size}`;
}

/**
 * The clinic session for a day. Logistics start from the programme's latest session (address, blood
 * code, proposal link) and take the day's own screen type, parking and contact on the day.
 */
export function sessionFromDay(d: ScreeningDay, sessions: ClinicSession[], existing?: ClinicSession): ClinicSession {
  const base = existing?.logistics || sessions.filter((x) => x.programmeId === d.programmeId && x.logistics).sort((a, b) => (a.date < b.date ? 1 : -1))[0]?.logistics;
  const logistics: SessionLogistics = {
    screeningType: d.screen === "poc" ? "POC3" : base && base.screeningType !== "POC3" && base.screeningType !== "Cardiac" ? base.screeningType : "Bloods",
    status: d.status === "published" ? "Ready to go" : "Working on it",
    service: d.screen === "poc" ? "Point of care screening (no lab)" : base?.service && !/POC|point of care/i.test(base.service) ? base.service : "Screening with bloods (LAB)",
    proposalsLink: base?.proposalsLink ?? null,
    bloodCode: d.screen === "lab" ? base?.bloodCode ?? `PH-${PROGRAMME_BY_ID[d.programmeId].code}26` : null,
    address: base?.address ?? null,
    eircode: base?.eircode ?? null,
    parking: d.parking.trim() || null,
    contactName: d.contactName.trim() || null,
    contactPhone: d.contactPhone.trim() || null,
    attendanceLink: base?.attendanceLink ?? null,
    screeningLink: base?.screeningLink ?? null,
    accommodation: base?.accommodation ?? null,
  };
  const room = d.room.trim() || ROOM_TBC;
  return {
    id: d.sessionId,
    programmeId: d.programmeId,
    date: d.date,
    siteName: siteFor(d.programmeId),
    room,
    nurseId: d.nurseId,
    supportIds: existing?.supportIds.filter((x) => x !== d.nurseId) || [],
    start: d.start,
    end: d.end,
    breaks: sessionBreaks(d),
    slotMinutes: d.slotMinutes,
    maxSlots: d.appointments || undefined,
    status: existing?.status === "completed" ? "completed" : "scheduled",
    printerId: existing?.printerId ?? null,
    note: [d.status === "published" ? "Screening day, published to the client portal." : "Screening day, draft.", d.notes.trim()].filter(Boolean).join(" "),
    logistics,
  };
}

/* ================================================================================================
   Seed: three days, one published lab day for IBM on 6 November, a published point of care day
   for Salesforce and an IBM draft waiting for HR to confirm the room.
   ================================================================================================ */

const SEED_BY = "Stephen Kelly";
const seedDay = (id: string, f: DayForm & { programmeId: ProgrammeId; date: LocalDate; nurseId: StaffId }, status: ScreeningDay["status"], createdAt: Iso, publishedAt: Iso | null, sessionId: string): ScreeningDay => ({
  ...f, id, sessionId, status, createdAt, createdBy: SEED_BY, publishedAt, publishedBy: publishedAt ? SEED_BY : null,
  history: [
    { at: createdAt, by: SEED_BY, kind: "created", via: "form", summary: `Set up ${PROGRAMME_BY_ID[f.programmeId].clientName}, ${fmtDate(f.date)} as a draft.`, changes: [] },
    ...(publishedAt ? [{ at: publishedAt, by: SEED_BY, kind: "published" as const, via: null, summary: "Published to the client portal.", changes: [] }] : []),
  ],
});

export function seedScreeningDays(baseline: ClinicSession[]): { state: ScreeningDaysState; sessions: ClinicSession[] } {
  const std = standardDay();
  const days: ScreeningDay[] = [
    seedDay("SD-0001", {
      ...std, programmeId: "PRG-IBM-26", screen: "lab", date: "2026-11-06", nurseId: "fiona", start: "09:00", end: "16:30",
      breaks: { first: { start: "10:30", minutes: 15 }, lunch: { start: "12:30", minutes: 30 }, afternoon: { start: "14:30", minutes: 15 } },
      appointments: 24, slotMinutes: 15, room: "Training Room 1, Building A", parking: "Visitor spaces at the front of Building A",
      notes: "Bring the centrifuge and two cool boxes for the lab courier.", contactName: "Declan Byrne", contactPhone: "087 555 0110",
    }, "published", "2026-10-01T09:20:00.000Z", "2026-10-02T11:05:00.000Z", "CLN-IBM-20261106"),
    seedDay("SD-0002", {
      ...std, programmeId: "PRG-SF-26", screen: "poc", date: "2026-11-11", nurseId: "anita", start: "09:00", end: "13:00",
      breaks: { first: { start: "10:30", minutes: 15 }, lunch: null, afternoon: null },
      appointments: 15, slotMinutes: 15, room: "Demo Wellness Room, Level 3", parking: "Underground car park, ask at reception for a pass",
      notes: "Point of care kit and the QRISK tablet. Results on the day.", contactName: "Daragh Coyle", contactPhone: "086 555 0177",
    }, "published", "2026-10-02T14:10:00.000Z", "2026-10-03T09:30:00.000Z", "CLN-SF-20261111"),
    seedDay("SD-0003", {
      ...std, programmeId: "PRG-IBM-26", screen: "poc", date: "2026-11-19", nurseId: "ciara", start: "09:00", end: "16:15",
      appointments: 25, slotMinutes: 15, room: "", parking: "", notes: "", contactName: "", contactPhone: "",
    }, "draft", "2026-10-04T15:40:00.000Z", null, "CLN-IBM-20261119"),
  ];
  const sessions = days.map((d) => sessionFromDay(d, baseline));
  return { state: { days }, sessions };
}
export const initialScreeningDaysState = (): ScreeningDaysState => seedScreeningDays([]).state;

/* ================================================================================================
   The agent: plain English parsing. Deterministic. Every value records the words it came from.
   ================================================================================================ */

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const MONTH_RE = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const monthNo = (m: string) => MONTHS.findIndex((x) => x.startsWith(m.toLowerCase().slice(0, 3))) + 1;
const p2 = (n: number) => String(n).padStart(2, "0");
const strip = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** A time phrase: 9, 9am, 9:30, 9.30, 16:30, 4:30pm, noon, midday. */
const TIME = "(\\d{1,2}(?:[:.]\\d{2})?\\s*(?:am|pm|a\\.m\\.|p\\.m\\.)?|noon|midday)";
/** Minutes from a time phrase. Without am or pm, 1 to 6 means afternoon. */
export function parseTime(raw: string): number | null {
  const t = raw.trim().toLowerCase();
  if (t === "noon" || t === "midday") return 720;
  const m = t.match(/^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const mm = m[2] ? Number(m[2]) : 0;
  if (h > 23 || mm > 59) return null;
  const ap = m[3] ? m[3][0] : "";
  if (ap === "p" && h < 12) h += 12;
  else if (ap === "a" && h === 12) h = 0;
  else if (!ap && h >= 1 && h <= 6) h += 12;
  return h * 60 + mm;
}
const hm = (n: number): Hhmm => minutesToHhmm(n);

function durationAfter(text: string): number | null {
  const m = text.match(/^\s*(?:break\s*)?(?:,\s*)?(?:for\s+|of\s+|lasting\s+|\()?\s*(\d{1,3})\s*(?:-\s*)?(?:min|mins|minutes|m)\b/i);
  if (m) return Number(m[1]);
  if (/^\s*(?:for\s+)?(?:half an hour|30 minutes)/i.test(text)) return 30;
  if (/^\s*(?:for\s+)?(?:an|one|1)\s+hour/i.test(text)) return 60;
  return null;
}

/** A date phrase, resolved to the next such date on or after today. */
export function parseDate(text: string, today: LocalDate): { date: LocalDate; said: string } | null {
  const t = text.toLowerCase();
  if (/\btoday\b/.test(t)) return { date: today, said: "today" };
  if (/\btomorrow\b/.test(t)) return { date: addDays(today, 1), said: "tomorrow" };
  const y0 = Number(today.slice(0, 4));
  const orig = (m: RegExpMatchArray) => text.substr(m.index || 0, m[0].length).trim();
  const build =(d: number, m: number, y: number | null, said: string) => {
    if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
    let yy = y ?? y0;
    if (yy < 100) yy += 2000;
    let iso = `${yy}-${p2(m)}-${p2(d)}`;
    if (!isRealDate(iso)) return null;
    if (y === null && iso < today) { iso = `${yy + 1}-${p2(m)}-${p2(d)}`; if (!isRealDate(iso)) return null; }
    return { date: iso as LocalDate, said };
  };
  let m = t.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_RE}\\b(?:,?\\s+(\\d{4}))?`));
  if (m) return build(Number(m[1]), monthNo(m[2]), m[3] ? Number(m[3]) : null, orig(m));
  m = t.match(new RegExp(`\\b${MONTH_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(\\d{4}))?`));
  if (m) return build(Number(m[2]), monthNo(m[1]), m[3] ? Number(m[3]) : null, orig(m));
  m = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (m) return build(Number(m[1]), Number(m[2]), m[3] ? Number(m[3]) : null, m[0]);
  m = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m) return build(Number(m[3]), Number(m[2]), Number(m[1]), m[0]);
  return null;
}

function findClient(text: string): { id: ProgrammeId; said: string } | null {
  const t = strip(text);
  const hits: Array<{ id: ProgrammeId; at: number; said: string }> = [];
  for (const id of PROGRAMME_ORDER) {
    const p = PROGRAMME_BY_ID[id];
    const names = [p.clientName, p.code, p.clientName === "Salesforce" ? "sales force" : ""].filter(Boolean);
    for (const n of names) {
      const m = t.match(new RegExp(`\\b${strip(n).replace(/\s+/g, "\\s*")}\\b`));
      if (m && m.index !== undefined) hits.push({ id, at: m.index, said: text.substr(m.index, m[0].length) });
    }
  }
  hits.sort((a, b) => a.at - b.at);
  return hits[0] || null;
}

function findScreen(text: string): { screen: DayScreen; said: string } | null {
  const t = text.toLowerCase();
  const poc = t.match(/point[\s-]*of[\s-]*care|\bpoc\s*3?\b|finger[\s-]*prick/);
  const lab = t.match(/\blab(?:oratory)?\b(?:\s+bloods?)?|\bbloods?\b|\bvenous\b|phlebotomy/);
  if (poc && (!lab || (poc.index ?? 0) <= (lab.index ?? 0))) return { screen: "poc", said: poc[0] };
  if (lab) return { screen: "lab", said: lab[0] };
  return null;
}

function findNurse(text: string, nurses: Staff[]): { id: StaffId | null; said: string; unknown?: string } | null {
  const t = strip(text);
  const named = t.match(/\bnurse(?:\s+(?:is|will be|to|should be|as))?\s+([a-z][a-z'’-]+)(?:\s+([a-z][a-z'’-]+))?/);
  const byName = (first: string, last?: string) => nurses.find((s) => {
    const [f, l] = strip(s.name).split(" ");
    return f === first && (!last || l === last || !nurses.some((o) => o !== s && strip(o.name).split(" ")[0] === first));
  });
  if (named) {
    const hit = byName(named[1], named[2]) || byName(named[1]);
    if (hit) return { id: hit.id, said: `Nurse ${hit.name.split(" ")[0]}` };
    if (!["to", "is", "the", "for", "at", "a", "change", "on"].includes(named[1])) return { id: null, said: named[0], unknown: named[1].replace(/^./, (c) => c.toUpperCase()) };
  }
  // A nurse's name on its own. The last one mentioned wins ("swap Aisling for Ciara").
  let best: { id: StaffId; said: string; at: number } | null = null;
  for (const s of nurses) {
    const [f, l] = strip(s.name).split(" ");
    const re = new RegExp(`\\b${f}(?:\\s+${l})?\\b`, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(t))) if (!best || m.index > best.at) best = { id: s.id, said: s.name.split(" ")[0], at: m.index };
  }
  return best ? { id: best.id, said: best.said } : null;
}

const ROOM_RE = /\b((?:training|meeting|board|wellness|conference|medical|first[\s-]aid|quiet|screening|consulting|treatment|interview)\s+)?(?:room|rm)\.?\s*(?:no\.?\s*|number\s*)?([a-z0-9][\w.\/-]*)(?:\s*(?:,|in|at|of|on)?\s*(?:the\s+)?(building|block|floor|level|wing)\s+([a-z0-9][\w-]*))?/i;
function findRoom(text: string): { room: string; said: string } | null {
  const m = text.match(ROOM_RE);
  const cap = (s: string) => s.replace(/(^|\s)\S/g, (c) => c.toUpperCase());
  if (m) {
    const room = `${m[1] ? cap(m[1].trim()) + " " : ""}Room ${m[2].replace(/[.,]$/, "")}`;
    const bld = m[3] ? `, ${cap(m[3])} ${m[4].toUpperCase().length <= 2 ? m[4].toUpperCase() : cap(m[4])}` : "";
    return { room: room + bld, said: m[0].trim() };
  }
  const b = text.match(/\b(boardroom|canteen|board room|medical centre|wellness centre|first aid room)\b/i);
  if (b) return { room: cap(b[1]), said: b[0] };
  const bl = text.match(/\b(building|block)\s+([a-z0-9]{1,3})\b/i);
  if (bl) return { room: `${cap(bl[1])} ${bl[2].toUpperCase()}`, said: bl[0] };
  return null;
}

const PHONE_RE = /(\+353[\s-]?\d{1,2}|\(?0\d{1,2}\)?)[\s-]?\d{3}[\s-]?\d{3,4}\b/;
function findContact(text: string): { name?: string; phone?: string; saidName?: string; saidPhone?: string } {
  const out: { name?: string; phone?: string; saidName?: string; saidPhone?: string } = {};
  const ph = text.match(PHONE_RE);
  if (ph) { out.phone = ph[0].replace(/[()]/g, "").replace(/-/g, " ").replace(/\s+/g, " ").trim(); out.saidPhone = ph[0]; }
  const NAME = "([A-ZÁÉÍÓÚ][a-záéíóú'’]+(?:\\s+(?:[OoMm]['’])?[A-ZÁÉÍÓÚ][a-záéíóú'’]+)?)";
  const pats = [
    new RegExp(`(?:[Cc]ontact|[Pp]oint of contact)(?:\\s+(?:on the day|on site|onsite|person))?\\s*(?:is|will be|:|-|=)?\\s*${NAME}`),
    new RegExp(`(?:[Aa]sk for|[Mm]eet|[Ss]peak to|[Cc]all|[Rr]ing|[Ll]ook for)\\s+${NAME}`),
    new RegExp(`${NAME}\\s*(?:\\([^)]*\\)\\s*)?(?:,\\s*[A-Za-z ]{2,30},?\\s*)?(?:will meet|will be your|is your|will look after|on|at)\\s*(?:\\+353|0\\d)`),
  ];
  for (const re of pats) {
    const m = text.match(re);
    if (m && !/^(The|Our|Your|This|Please|Thanks|Room|Building|On|We|Hi|Dear)$/.test(m[1].split(/\s+/)[0])) {
      out.name = m[1].trim(); out.saidName = m[0].trim(); break;
    }
  }
  return out;
}

function clauses(text: string): string[] {
  return text.split(/[;\n]|,(?!\d)|\.(?=\s|$)/).map((c) => c.trim()).filter(Boolean);
}
const sentence = (s: string) => { const t = s.trim().replace(/\s+/g, " "); return t ? t[0].toUpperCase() + t.slice(1) + (/[.!?]$/.test(t) ? "" : ".") : ""; };
function findParking(text: string): string | null {
  const c = clauses(text).filter((x) => /\bpark/i.test(x));
  return c.length ? c.map(sentence).join(" ").replace(/\.$/, "") : null;
}
function findNotes(text: string): string | null {
  const c = clauses(text).filter((x) => /^(?:and\s+)?(?:please\s+)?(?:bring|take|remember|pack|note|need|needs|arrive|set up|setup|collect|courier|check in|sign in)\b/i.test(x) && !/\bpark/i.test(x));
  return c.length ? c.map((x) => sentence(x.replace(/^and\s+/i, ""))).join(" ") : null;
}

/** Times and breaks from a sentence. Each found value carries the words it came from. */
interface TimeFinds {
  start?: { v: number; said: string };
  end?: { v: number; said: string };
  first?: { v: number | null; mins: number | null; said: string };
  lunch?: { v: number | null; mins: number | null; said: string };
  afternoon?: { v: number | null; mins: number | null; said: string };
}
function findTimes(text: string, mode: "create" | "edit"): TimeFinds {
  const t = text.toLowerCase().replace(ROOM_RE, " ").replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, " ");
  const out: TimeFinds = {};
  const to = mode === "edit" ? "(?:to|at|is|from|:|until)?" : "(?:at|is|from|time|:)?";
  const breakAt = (re: RegExp): { v: number | null; mins: number | null; said: string } | undefined => {
    const m = t.match(re);
    if (!m) return undefined;
    const v = m[1] ? parseTime(m[1]) : null;
    let mins: number | null = null;
    if (m[1] && m[2]) { const e = parseTime(m[2]); if (v !== null && e !== null && e > v) mins = e - v; }
    if (mins === null) mins = durationAfter(t.slice((m.index || 0) + m[0].length));
    return { v, mins, said: m[0].trim() };
  };
  const rng = `(?:\\s*(?:-|to|until|till)\\s*${TIME})?`;
  out.first = breakAt(new RegExp(`\\b(?:first|morning|coffee|tea|1st)\\s+break\\s*${to}\\s*${TIME}${rng}`));
  out.lunch = breakAt(new RegExp(`\\blunch(?:\\s*break)?\\s*${to}\\s*${TIME}${rng}`));
  out.afternoon = breakAt(new RegExp(`\\b(?:afternoon|second|2nd|last)\\s+break\\s*${to}\\s*${TIME}${rng}`));
  // Durations given without a time, e.g. "lunch for 45 minutes" or "a 20 minute lunch".
  const durOnly = (word: string): number | null => {
    const m = t.match(new RegExp(`\\b${word}[^,;.]*?\\bfor\\s+(\\d{1,3})\\s*(?:min|mins|minutes)\\b`)) || t.match(new RegExp(`\\b(\\d{1,3})[\\s-]*(?:min|mins|minute|minutes)\\s+${word}`));
    return m ? Number(m[1]) : null;
  };
  for (const [k, w] of [["first", "(?:first|morning|coffee) break"], ["lunch", "lunch"], ["afternoon", "afternoon break"]] as const) {
    const d = durOnly(w);
    if (d !== null) out[k] = out[k] ? { ...out[k]!, mins: out[k]!.mins ?? d } : { v: null, mins: d, said: `${BREAK_LABEL[k].toLowerCase()} for ${d} minutes` };
  }
  // A plain "break at 11" or "break at 3pm": morning or afternoon by the clock.
  if (!out.first || !out.afternoon) {
    const m = t.match(new RegExp(`(?<!first |morning |coffee |tea |afternoon |second |lunch |last )\\bbreak\\s*${to}\\s*${TIME}${rng}`));
    if (m) {
      const v = parseTime(m[1]);
      if (v !== null) {
        const e = m[2] ? parseTime(m[2]) : null;
        const f = { v, mins: e !== null && e > v ? e - v : durationAfter(t.slice((m.index || 0) + m[0].length)), said: m[0].trim() };
        if (v < 12 * 60 && !out.first) out.first = f; else if (v >= 13 * 60 && !out.afternoon) out.afternoon = f;
      }
    }
  }
  const st = t.match(new RegExp(`\\b(?:start(?:s|ing)?|begin(?:s|ning)?|kick(?:ing)? off|open(?:s|ing)?|first appointment)\\s*${to}\\s*${TIME}`));
  if (st) { const v = parseTime(st[1]); if (v !== null) out.start = { v, said: st[0].trim() }; }
  const en = t.match(new RegExp(`\\b(?:finish(?:es|ing)?|end(?:s|ing)?|close(?:s)?|wrap(?:ping)? up|done by|until|till|last appointment)\\s*${mode === "edit" ? "(?:to|at|is|by|:)?" : "(?:at|is|by|time|:)?"}\\s*${TIME}`));
  if (en) { const v = parseTime(en[1]); if (v !== null) out.end = { v, said: en[0].trim() }; }
  // "9 to 5" or "from 9am to 4:30pm" when no start or finish words were used.
  if (!out.start || !out.end) {
    const re = new RegExp(`(?:^|[\\s,(])(?:from\\s+)?${TIME}\\s*(?:-|to|until|till)\\s*${TIME}`, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(t))) {
      const before = t.slice(Math.max(0, m.index - 22), m.index);
      if (/(break|lunch)\s*(?:at|from|is|:)?\s*$/.test(before)) continue;
      const a = parseTime(m[1]), b = parseTime(m[2]);
      if (a !== null && b !== null && b > a) {
        if (!out.start) out.start = { v: a, said: m[0].trim() };
        if (!out.end) out.end = { v: b, said: m[0].trim() };
        break;
      }
    }
  }
  return out;
}

function findAppointments(text: string): { count?: { v: number; said: string }; length?: { v: number; said: string } } {
  const t = text.toLowerCase();
  const out: { count?: { v: number; said: string }; length?: { v: number; said: string } } = {};
  const c = t.match(/\b(\d{1,3})\s*(?:x\s*)?(?:\d{1,3}[\s-]*(?:min|mins|minute|minutes)\s+)?(?:appointments?|appts?|slots?|screens?|screenings|people|participants|bookings|employees|staff)\b/);
  if (c) out.count = { v: Number(c[1]), said: c[0] };
  const l = t.match(/\b(?:appointments?|appts?|slots?|screens?)\s*(?:of|at|lasting|each|are|,)?\s*(\d{1,3})[\s-]*(?:min|mins|minute|minutes)\b/)
    || t.match(/\b(\d{1,3})[\s-]*(?:min|mins|minute|minutes)\s*(?:appointments?|appts?|slots?|each|per person|screens?)\b/);
  if (l) out.length = { v: Number(l[1]), said: l[0] };
  return out;
}

/* ---- creating a day from a request ---- */

export type FieldSource = "said" | "assumed" | "needed";
export interface AgentDraft {
  form: DayForm;
  /** For every field: did the person say it, did the agent assume it, or does a person still need to decide. */
  source: Partial<Record<DayField, FieldSource>>;
  /** The words each said value was read from, or why a value was assumed. */
  why: Partial<Record<DayField, string>>;
  /** Plain notes for the person, e.g. an unknown nurse name or another day on the same date. */
  notes: string[];
}

export interface AgentCtx { today: LocalDate; staff: Staff[]; sessions: ClinicSession[]; days: ScreeningDay[] }

/** Nurses with nothing else on that date, in roster order. */
export function freeNurses(ctx: Pick<AgentCtx, "staff" | "sessions">, date: LocalDate | "", start: Hhmm, end: Hhmm, ignoreSessionId?: string | null): Staff[] {
  const s = hhmmToMinutes(start), e = hhmmToMinutes(end);
  return nurseStaff({ staff: ctx.staff }).filter((n) => !ctx.sessions.some((x) => x.id !== ignoreSessionId && x.date === date && x.status !== "cancelled"
    && (x.nurseId === n.id || x.supportIds.includes(n.id)) && hhmmToMinutes(x.start) < e && s < hhmmToMinutes(x.end)));
}

export function draftFromRequest(text: string, ctx: AgentCtx): AgentDraft {
  const client = findClient(text);
  const f = standardDay(client?.id || "");
  const source: AgentDraft["source"] = {};
  const why: AgentDraft["why"] = {};
  const notes: string[] = [];
  const said = (k: DayField, w: string) => { source[k] = "said"; why[k] = `"${w.trim()}"`; };
  const assumed = (k: DayField, w: string) => { source[k] = "assumed"; why[k] = w; };
  const needed = (k: DayField, w: string) => { source[k] = "needed"; why[k] = w; };

  if (client) said("programmeId", client.said); else needed("programmeId", "Which client is this for? Choose IBM, Sisk or Salesforce.");
  const d = parseDate(text, ctx.today);
  if (d) { f.date = d.date; said("date", d.said); } else needed("date", "No date in the request. Choose the day.");
  const sc = findScreen(text);
  if (sc) { f.screen = sc.screen; said("screen", sc.said); } else assumed("screen", "Lab bloods, the usual screen on this programme.");

  const tm = findTimes(text, "create");
  if (tm.start) { f.start = hm(tm.start.v); said("start", tm.start.said); } else assumed("start", "Standard start time.");
  if (tm.end) {
    let v = tm.end.v;
    if (v <= hhmmToMinutes(f.start) && v < 12 * 60) v += 12 * 60;
    f.end = hm(v); said("end", tm.end.said);
  } else assumed("end", "Standard finish time.");
  for (const k of ["first", "lunch", "afternoon"] as BreakKey[]) {
    const x = tm[k];
    if (x) {
      const cur = f.breaks[k];
      f.breaks[k] = { start: x.v !== null ? hm(x.v) : cur?.start || "12:30", minutes: x.mins ?? cur?.minutes ?? BREAK_DEFAULT_MINUTES[k] };
      said(k, x.said);
    } else if (/\bno (?:breaks?|lunch)\b/i.test(text) && (k === "lunch" ? /\bno lunch\b/i.test(text) : /\bno breaks?\b/i.test(text))) {
      f.breaks[k] = null; said(k, k === "lunch" ? "no lunch" : "no breaks");
    } else assumed(k, `Standard ${BREAK_LABEL[k].toLowerCase()}.`);
  }
  // Keep the standard breaks inside a day that starts later or finishes earlier.
  for (const k of ["first", "lunch", "afternoon"] as BreakKey[]) {
    const b = f.breaks[k];
    if (b && source[k] === "assumed" && (hhmmToMinutes(b.start) < hhmmToMinutes(f.start) || hhmmToMinutes(b.start) + b.minutes > hhmmToMinutes(f.end))) {
      f.breaks[k] = null; why[k] = "Left out: the standard break falls outside this day.";
    }
  }

  const ap = findAppointments(text);
  if (ap.length) { f.slotMinutes = ap.length.v; said("slotMinutes", ap.length.said); } else assumed("slotMinutes", "Standard appointment length.");
  const fit = dayFit(f);
  if (ap.count) {
    f.appointments = ap.count.v; said("appointments", ap.count.said);
    if (ap.count.v > fit) notes.push(`You asked for ${ap.count.v} appointments but only ${fit} fit between ${fmtHm(f.start)} and ${fmtHm(f.end)} with these breaks.`);
  } else { f.appointments = fit; assumed("appointments", `As many as fit: ${fit}.`); }
  if (ap.count && ap.count.v < fit) notes.push(`${fit} appointments fit in this day. You asked for ${ap.count.v}, so the last ${fit - ap.count.v} time${fit - ap.count.v === 1 ? "" : "s"} stay free.`);

  const nurse = findNurse(text, nurseStaff({ staff: ctx.staff }));
  const free = f.date ? freeNurses(ctx, f.date, f.start, f.end) : nurseStaff({ staff: ctx.staff });
  if (nurse?.id) { f.nurseId = nurse.id; said("nurseId", nurse.said); }
  else if (nurse?.unknown) needed("nurseId", `There is no nurse called ${nurse.unknown} on the nursing team. Choose who is going.`);
  else needed("nurseId", free.length ? `Choose who is going. Free that day: ${free.map((n) => n.name.split(" ")[0]).join(", ")}.` : "Choose who is going. Every nurse already has a clinic that day.");

  const room = findRoom(text);
  if (room) { f.room = room.room; said("room", room.said); } else needed("room", "No room yet. Leave it to be confirmed: the client's HR contact usually confirms it by email.");
  const park = findParking(text);
  if (park) { f.parking = park; said("parking", park); }
  const nt = findNotes(text);
  if (nt) { f.notes = nt; said("notes", nt); }
  const ct = findContact(text);
  if (ct.name) { f.contactName = ct.name; said("contactName", ct.saidName || ct.name); }
  if (ct.phone) { f.contactPhone = ct.phone; said("contactPhone", ct.saidPhone || ct.phone); }

  if (f.programmeId && f.date) {
    const same = ctx.days.filter((x) => x.programmeId === f.programmeId && x.date === f.date);
    if (same.length) notes.push(`${PROGRAMME_BY_ID[f.programmeId].clientName} already has ${same.length === 1 ? "a day" : `${same.length} days`} on ${fmtDate(f.date)} (${same.map((x) => `${x.room || ROOM_TBC}, ${staffById(x.nurseId)?.name.split(" ")[0] || x.nurseId}`).join("; ")}). Saving this adds another clinic room that day.`);
    const wd = weekdayOf(f.date as LocalDate);
    if (wd === 0 || wd === 6) notes.push(`${fmtWeekdayDate(f.date)} is a weekend.`);
  }
  return { form: f, source, why, notes };
}

/* ---- editing a day in plain English ---- */

export interface AgentEdit { form: DayForm; changes: DayChange[]; understood: boolean; notes: string[] }

export function editFromInstruction(text: string, cur: DayForm, ctx: AgentCtx & { ownSessionId?: string | null }): AgentEdit {
  const f: DayForm = { ...cur, breaks: { ...cur.breaks } };
  const notes: string[] = [];
  const low = text.toLowerCase();
  const tm = findTimes(text, "edit");
  if (tm.start) f.start = hm(tm.start.v);
  if (tm.end) { let v = tm.end.v; if (v <= hhmmToMinutes(f.start) && v < 12 * 60) v += 12 * 60; f.end = hm(v); }
  for (const k of ["first", "lunch", "afternoon"] as BreakKey[]) {
    const x = tm[k];
    if (x) f.breaks[k] = { start: x.v !== null ? hm(x.v) : cur.breaks[k]?.start || "12:30", minutes: x.mins ?? cur.breaks[k]?.minutes ?? BREAK_DEFAULT_MINUTES[k] };
  }
  const drop = (re: RegExp) => new RegExp(`\\b(?:no|remove|drop|cancel|delete|skip|without)\\s+(?:the\\s+|a\\s+|an\\s+)?${re.source}`).test(low);
  if (drop(/(?:first|morning|coffee) break/)) f.breaks.first = null;
  if (drop(/lunch/)) f.breaks.lunch = null;
  if (drop(/(?:afternoon|second|last) break/)) f.breaks.afternoon = null;
  if (/\b(?:add|put in|include)\s+(?:a\s+|an\s+|the\s+)?lunch\b/.test(low) && !f.breaks.lunch) f.breaks.lunch = { start: "12:30", minutes: 30 };

  const sc = findScreen(text);
  if (sc) f.screen = sc.screen;
  const nurse = findNurse(text, nurseStaff({ staff: ctx.staff }));
  if (nurse?.id) f.nurseId = nurse.id;
  else if (nurse?.unknown) notes.push(`There is no nurse called ${nurse.unknown} on the nursing team, so the nurse is unchanged.`);
  if (/\broom\b|\bbuilding\b|\bboardroom\b|\bcanteen\b/i.test(text)) {
    const r = findRoom(text);
    if (r) f.room = r.room;
  }
  const d = parseDate(text, ctx.today);
  if (d) f.date = d.date;
  const client = findClient(text);
  if (client && /\b(client|switch|change|for)\b/i.test(text) && client.id !== cur.programmeId) f.programmeId = client.id;
  const ap = findAppointments(text);
  if (ap.length) f.slotMinutes = ap.length.v;
  if (ap.count && !(ap.length && ap.count.said === ap.length.said)) f.appointments = ap.count.v;
  const park = findParking(text);
  if (park) f.parking = park.replace(/^(?:Change|Set|Make|Update) (?:the )?parking (?:to|is) /i, (x) => "").replace(/^./, (c) => c.toUpperCase());
  const nt = findNotes(text);
  if (nt) f.notes = [cur.notes.trim(), nt].filter(Boolean).join(" ");
  const ct = findContact(text);
  if (ct.name) f.contactName = ct.name;
  if (ct.phone) f.contactPhone = ct.phone;

  // If the day got shorter, offer only what fits, and say so.
  const fit = dayFit(f);
  if (f.appointments !== null && f.appointments > fit && fit > 0 && !ap.count) {
    notes.push(`Only ${fit} appointments fit now, so the number of appointments goes from ${f.appointments} to ${fit}.`);
    f.appointments = fit;
  } else if (ap.count && ap.count.v > fit) notes.push(`Only ${fit} appointments fit in this day, so ${ap.count.v} will not save until the day is longer.`);
  // If the day got longer and every time was offered before, keep offering every time.
  const oldFit = dayFit(cur);
  if (!ap.count && cur.appointments === oldFit && fit > oldFit) { f.appointments = fit; notes.push(`${fit} appointments fit now, so the extra times are offered too.`); }
  if (f.nurseId && f.nurseId !== cur.nurseId && f.date) {
    const free = freeNurses(ctx, f.date, f.start, f.end, ctx.ownSessionId);
    if (!free.some((n) => n.id === f.nurseId)) notes.push(`${staffById(f.nurseId)?.name || f.nurseId} already has a clinic at that time, so this cannot be saved as it is.`);
  }
  const changes = diffForms(cur, f, { staff: ctx.staff });
  return { form: f, changes, understood: changes.length > 0, notes };
}

/* ---- reading the client's HR email ---- */

export interface HrRead { form: DayForm; changes: DayChange[]; found: Array<{ label: string; value: string; said: string }>; notes: string[] }

export function readHrReply(text: string, cur: DayForm, ctx: Pick<AgentCtx, "today" | "staff">): HrRead {
  const f: DayForm = { ...cur, breaks: { ...cur.breaks } };
  const found: HrRead["found"] = [];
  const notes: string[] = [];
  // Ignore quoted text from our own earlier email.
  const body = text.split(/\n\s*(?:On .{5,80}wrote:|-{2,}\s*Original Message|From:\s.*Precision)/i)[0];
  const d = parseDate(body, ctx.today);
  if (d) {
    f.date = d.date; found.push({ label: "Date", value: fmtDateLong(d.date), said: d.said });
    if (cur.date && d.date !== cur.date) notes.push(`The email gives ${fmtDate(d.date)}, not ${fmtDate(cur.date)}. Check this is the right day before you confirm.`);
  }
  const r = findRoom(body);
  if (r) { f.room = r.room; found.push({ label: "Room and location", value: r.room, said: r.said }); }
  const ct = findContact(body);
  if (ct.name) { f.contactName = ct.name; found.push({ label: "Contact on the day", value: ct.name, said: ct.saidName || ct.name }); }
  if (ct.phone) { f.contactPhone = ct.phone; found.push({ label: "Contact phone", value: ct.phone, said: ct.saidPhone || ct.phone }); }
  const park = findParking(body);
  if (park) { f.parking = park; found.push({ label: "Parking", value: park, said: park }); }
  const tm = findTimes(body, "create");
  if (tm.start && tm.end) { f.start = hm(tm.start.v); f.end = hm(tm.end.v); found.push({ label: "Hours", value: `${fmtHm(f.start)} to ${fmtHm(f.end)}`, said: tm.start.said }); }
  if (!found.length) notes.push("I could not find a date, room or contact in this email. Paste the client's reply, including the body text.");
  return { form: f, changes: diffForms(cur, f, ctx), found, notes };
}

/** A realistic reply from the client's HR contact for a day, for the "Use sample HR reply" button. */
export function sampleHrReply(d: ScreeningDay, hrName: string): string {
  const client = PROGRAMME_BY_ID[d.programmeId].clientName;
  const first = hrName.split(" ")[0];
  const local = { IBM: { room: "Room 3.01, Building C", who: "Gráinne Walsh", role: "Facilities", phone: "087 555 0142", park: "Visitor parking is at the front of Building C, just give your name at the barrier." },
    Sisk: { room: "Meeting Room 2, Site Office", who: "Pádraig Ryan", role: "Site Manager", phone: "086 555 0123", park: "There is parking in the site compound, sign in at the gate." },
    Salesforce: { room: "Wellness Room 4.12, Level 4", who: "Emma Kinsella", role: "Workplace team", phone: "085 555 0198", park: "Please use the underground car park, reception will have a pass for you." } }[client]
    || { room: "Room 1.02, Building A", who: "Sam Kelly", role: "Reception", phone: "087 555 0100", park: "Parking is at the front of the building." };
  return [
    `From: ${hrName} <${first.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")}@${client.toLowerCase()}.example.com>`,
    `Subject: Re: Health screening day, ${fmtDate(d.date)}`,
    "",
    "Hi Stephen,",
    "",
    `Thanks for this. I can confirm ${fmtDateLong(d.date).replace(/ \d{4}$/, "")} works for us. We have booked ${local.room} for the screening, it's a quiet room with a sink and plenty of space.`,
    "",
    `Your contact on the day is ${local.who} (${local.role}) on ${local.phone}. ${local.park}`,
    "",
    "Looking forward to it,",
    hrName,
    `${client} HR`,
  ].join("\n");
}

/** The two example requests the presenter can try with one click. */
export const EXAMPLE_REQUEST = "IBM, 6 November, lab bloods, Nurse Aisling, start 9am, first break 10:30, lunch 12:30 for 30 mins, afternoon break 14:30, finish 4:30pm, 20 appointments of 15 minutes, Room 2.14 Building B, parking at the front, bring the centrifuge";
export const SHORT_REQUEST = "IBM, 6 November";
export const EDIT_EXAMPLES = ["Move lunch to 1pm", "Change the nurse to Ciara", "Finish at 5", "Make it point of care", "Room 3.01"];
