/* The last items from Stephen's 2 Oct walkthrough (RECORDING.md) that had data but no screen:
   the Bookings Pending board rows (clinic sessions and board-only bookings together), nurse
   subsistence claims and hotel requests (the "Subsistence form" and "Hotel booking form" beside the
   End of Day form), and the Flu workspace's contacts and "Flu 2026 notes" boards.
   Pure module: types, seed, rules and selectors. Handlers live in pages/Clinics/opsActions.ts and
   pages/Flu/boardsActions.ts. Names, phone numbers, hotels and amounts are fictional or illustrative. */
import type { Hhmm, Iso, LocalDate } from "./time";
import { fmtWeekdayDate } from "./time";
import type { ClinicSession, PhState, ProgrammeId, StaffId } from "./types";
import { PROGRAMME_BY_ID } from "./constants";
import type { BoardItem, DayBriefRecord, SessionLogistics } from "./nurseOps";
import { boardReadiness, buildDayBrief } from "./nurseOps";
import type { BoardFlag, DayBrief } from "./nurseOps";
import { isRealDate } from "./capture";

/* ================================================================================================
   Bookings board rows
   ================================================================================================ */

export type BoardRowKind = "session" | "board";
export interface BoardRow {
  /** "session:CLN-SISK-20261005" or "board:BRD-0003". */
  key: string;
  kind: BoardRowKind;
  id: string;
  client: string;
  programmeId: ProgrammeId | null;
  dates: LocalDate[];
  start: Hhmm | null;
  end: Hhmm | null;
  room: string | null;
  staffIds: StaffId[];
  logistics: SessionLogistics;
  /** Next date still to come (today counts), or null when every date has passed. */
  nextDate: LocalDate | null;
  flags: BoardFlag[];
  briefs: DayBriefRecord[];
  note: string;
}

export const boardRowKey = (kind: BoardRowKind, id: string) => `${kind}:${id}`;

/** Email addresses for the staff onsite. An explicit staff email on the row wins (agency or rota nurses). */
export function boardStaffEmails(state: Pick<PhState, "staff">, staffIds: StaffId[], logistics: SessionLogistics): string[] {
  const own = (logistics.staffEmail || "").trim();
  if (own) return own.split(/[,;\s]+/).filter(Boolean);
  return staffIds.map((id) => state.staff.find((s) => s.id === id)?.email || "").filter(Boolean);
}

function sessionStaff(s: ClinicSession): StaffId[] {
  return [s.nurseId, ...s.supportIds.filter((x) => x !== s.nurseId)];
}

/** Every row on the Bookings Pending board: Pulse clinic sessions with board columns, then board-only bookings. */
export function boardRows(state: PhState, today: LocalDate): BoardRow[] {
  const briefs = state.nurseOps.briefs.filter((b) => b.status === "scheduled");
  const make = (kind: BoardRowKind, id: string, base: Omit<BoardRow, "key" | "kind" | "id" | "nextDate" | "flags" | "briefs">): BoardRow => {
    const nextDate = base.dates.find((d) => d >= today) || null;
    const mine = briefs.filter((b) => b.target.kind === kind && b.target.id === id);
    const covered = !!nextDate && base.staffIds.length > 0 && base.staffIds.every((sid) => mine.some((b) => b.staffId === sid && b.target.date === nextDate));
    const flags = boardReadiness({ logistics: base.logistics, staffIds: base.staffIds, start: base.start, nextDate, briefsCovered: covered }, today);
    return { key: boardRowKey(kind, id), kind, id, ...base, nextDate, flags, briefs: mine };
  };
  const rows: BoardRow[] = [];
  for (const s of state.sessions) {
    if (!s.logistics || s.status === "cancelled") continue;
    const prog = PROGRAMME_BY_ID[s.programmeId];
    rows.push(make("session", s.id, {
      client: prog ? prog.clientName : s.programmeId, programmeId: s.programmeId, dates: [s.date], start: s.start, end: s.end, room: s.room || null,
      staffIds: sessionStaff(s), logistics: s.logistics, note: s.siteName,
    }));
  }
  for (const b of state.nurseOps.board) {
    rows.push(make("board", b.id, { client: b.client, programmeId: null, dates: b.dates, start: b.start, end: b.end, room: b.room, staffIds: b.staffIds, logistics: b.logistics, note: b.note }));
  }
  return rows.sort((a, b) => {
    const da = a.nextDate || a.dates[a.dates.length - 1] || "", db = b.nextDate || b.dates[b.dates.length - 1] || "";
    if (!!a.nextDate !== !!b.nextDate) return a.nextDate ? -1 : 1;
    if (da !== db) return a.nextDate ? (da < db ? -1 : 1) : (da > db ? -1 : 1);
    return a.client.localeCompare(b.client);
  });
}

/** The row's logistics, from the live state, for a handler to change. */
export function boardTarget(state: PhState, kind: BoardRowKind, id: string): { logistics: SessionLogistics; session?: ClinicSession; item?: BoardItem } | null {
  if (kind === "session") {
    const s = state.sessions.find((x) => x.id === id);
    return s && s.logistics ? { logistics: s.logistics, session: s } : null;
  }
  const b = state.nurseOps.board.find((x) => x.id === id);
  return b ? { logistics: b.logistics, item: b } : null;
}

/** The nurse day brief for one row, one date and one member of staff, field for field as Stephen's email. */
export function boardBrief(state: PhState, row: BoardRow, date: LocalDate, staffId: StaffId): DayBrief {
  const L = row.logistics;
  const nurse = state.staff.find((s) => s.id === staffId);
  return buildDayBrief({
    company: row.client, contactName: L.contactName, contactPhone: L.contactPhone, address: L.address, eircode: L.eircode, parking: L.parking, room: row.room,
    dates: [date], start: row.start, firstAppointment: row.start, attendanceLink: L.attendanceLink, screeningType: L.screeningType, screeningLink: L.screeningLink,
    accommodation: L.accommodation ? L.accommodation.replace(/\s*Separate confirmation sent\.?\s*$/i, "") : null, nurseName: nurse ? nurse.name : "colleague",
  });
}

/* ================================================================================================
   Subsistence claims and hotel requests
   ================================================================================================ */

export type ExpenseKind = "subsistence" | "hotel";
export type ExpenseStatus = "pending" | "approved" | "declined" | "booked";
export const EXPENSE_KIND_LABEL: Record<ExpenseKind, string> = { subsistence: "Subsistence claim", hotel: "Hotel request" };
export const EXPENSE_STATUS_LABEL: Record<ExpenseStatus, string> = { pending: "Waiting for approval", approved: "Approved", declined: "Declined", booked: "Hotel booked" };
export type Meal = "breakfast" | "lunch" | "dinner";
export const MEALS: Meal[] = ["breakfast", "lunch", "dinner"];
export const MEAL_LABEL: Record<Meal, string> = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Evening meal" };
/** Illustrative subsistence rates in euro. Precision Health confirms the real rates. */
export const MEAL_RATE: Record<Meal, number> = { breakfast: 12, lunch: 18, dinner: 30 };
export const SUBSISTENCE_NOTE = "Illustrative rates, to confirm with Precision Health. Not a payroll calculation.";
/** Who approves claims and hotel requests. */
export const EXPENSE_APPROVERS: readonly StaffId[] = ["stephen", "martina", "brenda", "liz", "neil"];

export interface ExpenseRequest {
  id: string; // EXP-0001
  kind: ExpenseKind;
  staffId: StaffId;
  /** The clinic day the claim or stay is for (the first night for a hotel). */
  date: LocalDate;
  clientLocation: string;
  /** The board row it belongs to, when there is one. A booked hotel is written to that row's accommodation. */
  target: { kind: BoardRowKind; id: string } | null;
  meals: Meal[];
  amount: number;
  nights: number;
  /** Where the nurse needs to stay, e.g. "Near Cahir, Co. Tipperary". */
  area: string;
  note: string;
  status: ExpenseStatus;
  requestedAt: Iso;
  requestedBy: StaffId;
  decidedAt: Iso | null;
  decidedBy: StaffId | null;
  decisionNote: string;
  /** Hotel and confirmation, once booked. Simulated. */
  hotel: string | null;
  bookingRef: string | null;
}

export interface ExpenseInput {
  kind: ExpenseKind;
  staffId: StaffId;
  date: LocalDate;
  clientLocation: string;
  target: { kind: BoardRowKind; id: string } | null;
  meals: Meal[];
  nights: number;
  area: string;
  note: string;
}

export const subsistenceAmount = (meals: Meal[]) => Array.from(new Set(meals)).reduce((n, m) => n + (MEAL_RATE[m] || 0), 0);

/** Field-level problems with a claim or hotel request. Empty when it can be sent. */
export function expenseErrors(i: ExpenseInput, today: LocalDate): Record<string, string> {
  const out: Record<string, string> = {};
  if (i.kind !== "subsistence" && i.kind !== "hotel") out.kind = "Choose a subsistence claim or a hotel request.";
  if (!isRealDate(i.date)) out.date = "Enter the clinic date.";
  if (!i.clientLocation.trim()) out.clientLocation = "Enter the client and location.";
  if (i.kind === "subsistence") {
    if (isRealDate(i.date) && i.date > today) out.date = "Claim subsistence once the day has happened.";
    if (!i.meals.length || i.meals.some((m) => !MEALS.includes(m))) out.meals = "Tick at least one meal.";
  }
  if (i.kind === "hotel") {
    if (isRealDate(i.date) && i.date < today) out.date = "A hotel is booked ahead of the day. This date has passed.";
    if (!Number.isInteger(i.nights) || i.nights < 1 || i.nights > 7) out.nights = "Nights must be a whole number from 1 to 7.";
    if (!i.area.trim()) out.area = "Say where you need to stay, for example near the client site.";
  }
  if (i.note.length > 1000) out.note = "Keep the note under 1,000 characters.";
  return out;
}

export function expenseSummary(e: ExpenseRequest): string {
  return e.kind === "hotel"
    ? `${e.nights} night${e.nights === 1 ? "" : "s"} from ${fmtWeekdayDate(e.date)}, ${e.area}`
    : `${e.meals.map((m) => MEAL_LABEL[m]).join(", ")}, €${e.amount.toFixed(2)}`;
}

/* ================================================================================================
   Flu workspace: contacts and Flu 2026 notes
   ================================================================================================ */

export interface FluContact {
  id: string; // FC-0001
  company: string;
  name: string;
  role: string;
  email: string;
  phone: string;
  note: string;
  updatedAt: Iso;
  updatedBy: StaffId | "system";
}
export interface FluNote {
  id: string; // FN-0001
  title: string;
  body: string;
  pinned: boolean;
  updatedAt: Iso;
  updatedBy: StaffId | "system";
}

/* ================================================================================================
   State
   ================================================================================================ */

export interface GapsState {
  version: 1;
  expenses: ExpenseRequest[];
  fluContacts: FluContact[];
  fluNotes: FluNote[];
  seq: { expense: number; fluContact: number; fluNote: number };
}

const SEED: Iso = "2026-09-30T10:00:00.000Z";
export function initialGapsState(): GapsState {
  const expenses: ExpenseRequest[] = [
    { id: "EXP-0001", kind: "subsistence", staffId: "anita", date: "2026-09-18", clientLocation: "Dornan Group, Cork office", target: null, meals: ["lunch", "dinner"], amount: 48, nights: 0, area: "",
      note: "Long day in Cork, home after 20:00.", status: "approved", requestedAt: "2026-09-18T19:05:00.000Z", requestedBy: "anita", decidedAt: "2026-09-21T09:20:00.000Z", decidedBy: "martina", decisionNote: "", hotel: null, bookingRef: null },
    { id: "EXP-0002", kind: "subsistence", staffId: "ian", date: "2026-09-30", clientLocation: "ABP, Cahir site canteen", target: null, meals: ["lunch"], amount: 18, nights: 0, area: "",
      note: "", status: "pending", requestedAt: "2026-09-30T15:40:00.000Z", requestedBy: "ian", decidedAt: null, decidedBy: null, decisionNote: "", hotel: null, bookingRef: null },
    { id: "EXP-0003", kind: "hotel", staffId: "liz", date: "2026-10-27", clientLocation: "ABP, Cahir, Co. Tipperary", target: { kind: "board", id: "BRD-0004" }, meals: [], amount: 0, nights: 1, area: "Near Cahir, Co. Tipperary",
      note: "Executive assessments start at 08:00 on 28 Oct.", status: "booked", requestedAt: "2026-10-01T11:00:00.000Z", requestedBy: "liz", decidedAt: "2026-10-01T14:30:00.000Z", decidedBy: "stephen", decisionNote: "", hotel: "Galtee View Hotel, Cahir (fictional)", bookingRef: "HB-26-0412" },
    { id: "EXP-0004", kind: "hotel", staffId: "anita", date: "2026-11-10", clientLocation: "Dornan Group, Cork", target: { kind: "board", id: "BRD-0006" }, meals: [], amount: 0, nights: 2, area: "Cork city, then Limerick",
      note: "Cork on 10 Nov and Limerick on 11 Nov, first appointment 08:30 both days.", status: "pending", requestedAt: "2026-10-02T16:10:00.000Z", requestedBy: "anita", decidedAt: null, decidedBy: null, decisionNote: "", hotel: null, bookingRef: null },
  ];
  const fluContacts: FluContact[] = [
    { id: "FC-0001", company: "Irish Life Health", name: "Corporate wellness bookings team", role: "Partner bookings (confidential)", email: "flu.bookings@example.com", phone: "01 555 0190", note: "Send weekly projected numbers by Thursday noon.", updatedAt: SEED, updatedBy: "system" },
    { id: "FC-0002", company: "Corrib Pharma Distribution (fictional)", name: "Orla Feeney", role: "Account manager", email: "orla.feeney@example.com", phone: "091 555 0133", note: "Vaccine orders and delivery dates. Ask for batch numbers on dispatch.", updatedAt: SEED, updatedBy: "system" },
    { id: "FC-0003", company: "Lough Ree Credit Union", name: "Pádraig Kenny", role: "HR officer", email: "padraig.kenny@example.com", phone: "090 555 0108", note: "Prefers mornings. Room by the staff canteen.", updatedAt: SEED, updatedBy: "system" },
    { id: "FC-0004", company: "Moyvalley Foods", name: "Sorcha Dunne", role: "Health and safety lead", email: "sorcha.dunne@example.com", phone: "045 555 0162", note: "Shift workers: two clinics, 07:30 and 14:00.", updatedAt: SEED, updatedBy: "system" },
  ];
  const fluNotes: FluNote[] = [
    { id: "FN-0001", title: "Vaccine supply", body: "Supplier says no flu vaccines in the country before 7 October. Precision booking links stay closed until the first delivery is recorded.", pinned: true, updatedAt: "2026-10-02T09:30:00.000Z", updatedBy: "stephen" },
    { id: "FN-0002", title: "Cold chain kit", body: "Two new validated cool boxes ordered. Data loggers to be checked before each clinic; record pre, intermediate and post temperatures on the End of Day form.", pinned: false, updatedAt: "2026-09-29T14:00:00.000Z", updatedBy: "liz" },
    { id: "FN-0003", title: "Irish Life weekly numbers", body: "Irish Life send projected numbers by week beginning. Compare with last year's actuals (about 80% of projected) before allocating stock.", pinned: false, updatedAt: "2026-09-25T11:15:00.000Z", updatedBy: "martina" },
  ];
  return { version: 1, expenses, fluContacts, fluNotes, seq: { expense: expenses.length, fluContact: fluContacts.length, fluNote: fluNotes.length } };
}

export function gapsNext(g: GapsState, key: keyof GapsState["seq"], prefix: string): string {
  g.seq[key] += 1;
  return `${prefix}-${String(g.seq[key]).padStart(4, "0")}`;
}
