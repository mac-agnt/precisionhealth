/* What the client (employer) portal may show: programme-level aggregates only. Every number comes
   from the shared selectors (programmeCounts, sessionStats, the employer report snapshot), so it
   matches the Dashboard and Reporting. Small groups are suppressed with the same rule and threshold
   as employer reporting. No participant name, row or result ever reaches this module's output. */
import { CONTACTS, PROGRAMME_BY_ID, PROGRAMME_ORDER, addDays, fmtDayMonth, fmtInt, localDateOf, programmeCounts, rate, sessionStats, sessionUsesPoc, startOfWeek, suppressCells, today } from "../../model";
import type { Contact, EmployerMetrics, EmployerReport, LocalDate, PhState, ProgrammeId } from "../../model";

export type ClientView = "overview" | "share" | "reports" | "support";
export const CLIENT_VIEWS: Array<{ id: ClientView; label: string; icon: "chart" | "link" | "file" | "mail" }> = [
  { id: "overview", label: "Programme overview", icon: "chart" },
  { id: "share", label: "Share booking link", icon: "link" },
  { id: "reports", label: "Reports", icon: "file" },
  { id: "support", label: "Support", icon: "mail" },
];

export const CLIENT_PROGRAMMES: ProgrammeId[] = PROGRAMME_ORDER;

/** The client's fictional HR or wellbeing contact from the Records contacts. */
export function clientContact(programmeId: ProgrammeId): Contact | undefined {
  const p = PROGRAMME_BY_ID[programmeId];
  return CONTACTS.find((c) => c.companyId === p.clientId);
}
export const precisionContacts = (): Contact[] => CONTACTS.filter((c) => c.companyId === "co-ph");

/** A count as safe text: below the suppression threshold the exact number is never shown. */
export function safeCount(n: number, threshold: number): string {
  return n > 0 && n < threshold ? `fewer than ${threshold}` : fmtInt(n);
}

export interface FunnelTile { key: string; label: string; value: string; sub: string; rate: string | null }
/** Invited, booked, attended and reports released, each with its denominator. Same figures as the Dashboard. */
export function programmeFunnel(state: PhState, programmeId: ProgrammeId): { tiles: FunnelTile[]; notBooked: string; capacity: number } {
  const c = programmeCounts(state, programmeId);
  const t = state.settings.suppressionThreshold;
  const tiles: FunnelTile[] = [
    { key: "invited", label: "Invited", value: safeCount(c.invited, t), sub: "Employees on the programme roster", rate: null },
    { key: "booked", label: "Booked", value: safeCount(c.booked, t), sub: `of ${fmtInt(c.invited)} invited`, rate: rate(c.booked, c.invited) },
    { key: "attended", label: "Attended", value: safeCount(c.attended, t), sub: `of ${fmtInt(c.booked)} booked`, rate: rate(c.attended, c.booked) },
    { key: "released", label: "Reports released", value: safeCount(c.released, t), sub: `of ${fmtInt(c.attended)} attended`, rate: rate(c.released, c.attended) },
  ];
  return { tiles, notBooked: safeCount(Math.max(0, c.invited - c.booked), t), capacity: c.capacity };
}

export interface UptakeWeek { weekStart: LocalDate; label: string; count: number | null; suppressed: boolean; complementary: boolean }
/**
 * Confirmed bookings by the week they were made (Monday start, Irish time). The weeks sum to the
 * Booked figure. Weeks with fewer than the threshold are suppressed, with complementary suppression,
 * exactly as employer report cells are.
 */
export function bookingUptake(state: PhState, programmeId: ProgrammeId): { weeks: UptakeWeek[]; total: number; max: number; anySuppressed: boolean } {
  const bookings = state.bookings.filter((b) => b.programmeId === programmeId && b.status === "confirmed");
  const by = new Map<LocalDate, number>();
  bookings.forEach((b) => { const w = startOfWeek(localDateOf(b.createdAt)); by.set(w, (by.get(w) || 0) + 1); });
  const keys = Array.from(by.keys()).sort();
  const weeks: LocalDate[] = [];
  if (keys.length) for (let w = keys[0]; w <= keys[keys.length - 1]; w = addDays(w, 7)) weeks.push(w);
  const cells = suppressCells(weeks.map((w) => ({ label: w, count: by.get(w) || 0 })), state.settings.suppressionThreshold);
  const out = cells.map((c) => ({ weekStart: c.label, label: `w/c ${fmtDayMonth(c.label)}`, count: c.count, suppressed: c.suppressed, complementary: c.complementary }));
  return { weeks: out, total: bookings.length, max: Math.max(1, ...out.map((w) => w.count || 0)), anySuppressed: out.some((w) => w.suppressed) };
}

export interface ClinicDay { id: string; date: LocalDate; site: string; room: string; slots: number; available: number; isToday: boolean; start: string; end: string; poc: boolean;
  /** Outside the programme's original window: a date added later. */ added: boolean;
  /** Published to the portal in the last seven days. */ isNew: boolean }
/**
 * Upcoming clinic days with free capacity per site. Capacity only: who booked is never part of it.
 * A screening day still in draft (Clinics, Screening days) is never shown; it appears once published.
 */
export function upcomingClinicDays(state: PhState, programmeId: ProgrammeId): ClinicDay[] {
  const t = today(state);
  const sdays = state.screeningDays?.days || [];
  const drafts = new Set(sdays.filter((d) => d.status !== "published").map((d) => d.sessionId));
  const p = PROGRAMME_BY_ID[programmeId];
  const nowMs = Date.parse(state.clock.nowUtc);
  const freshlyPublished = new Set(sdays.filter((d) => d.status === "published" && d.publishedAt && nowMs - Date.parse(d.publishedAt) < 7 * 86400000).map((d) => d.sessionId));
  return state.sessions
    .filter((s) => s.programmeId === programmeId && s.status === "scheduled" && s.date >= t && !drafts.has(s.id))
    .sort((a, b) => (a.date === b.date ? (a.start === b.start ? (a.siteName < b.siteName ? -1 : 1) : a.start < b.start ? -1 : 1) : a.date < b.date ? -1 : 1))
    .map((s) => {
      const st = sessionStats(state, s.id);
      const parts = s.siteName.split(", ");
      return { id: s.id, date: s.date, site: parts[0], room: s.siteName.includes(s.room) ? parts.slice(1).join(", ") || s.room : s.room, slots: st.slots, available: st.available, isToday: st.isToday,
        start: s.start, end: s.end, poc: sessionUsesPoc(s), added: s.date > p.windowEnd || s.date < p.windowStart, isNew: freshlyPublished.has(s.id) };
    });
}

/* The Screening days page asks the preview to open on a given client. Read once when the preview opens. */
let requested: ProgrammeId | null = null;
export function requestClientPortalProgramme(id: ProgrammeId): void { requested = id; }
export function takeRequestedProgramme(): ProgrammeId | null { const p = requested; requested = null; return p; }
/* The Portals page asks the preview to open on a client portal created there (CP-001). */
let requestedCustom: string | null = null;
export function requestClientPortalCustom(id: string): void { requestedCustom = id; }
export function takeRequestedCustom(): string | null { const p = requestedCustom; requestedCustom = null; return p; }

export const isApprovedReport = (r: EmployerReport) => !!r.snapshot && (r.status === "approved" || r.status === "exported");

/** Disclosure notices for an approved snapshot, without any hidden number. */
export function suppressionNotices(m: EmployerMetrics, threshold: number): string[] {
  const cells = m.breakdowns.reduce((n, b) => n + b.cells.filter((c) => c.suppressed).length, 0);
  const hiddenIndicators = m.clinical.filter((c) => c.flagged === null).length;
  const out: string[] = [];
  if (m.blocked) out.push("This cohort is too small to report on, so no breakdowns are included.");
  if (cells) out.push(`${cells} small ${cells === 1 ? "group is" : "groups are"} hidden (fewer than ${threshold} people), together with any cell that would let someone work it out.`);
  if (hiddenIndicators) out.push(`${hiddenIndicators} ${hiddenIndicators === 1 ? "indicator is" : "indicators are"} hidden because the count is fewer than ${threshold}.`);
  if (!out.length) out.push(`No groups needed hiding in this snapshot. Any group smaller than ${threshold} would be hidden.`);
  return out;
}

/** The ready-to-send employee announcement. No health information. */
export function announcementText(o: { client: string; window: string; place: string; link: string; code: string; minutes: number; sender: string; role: string; support: string }): string {
  return [
    "Subject: Book your health screening with Precision Health",
    "",
    "Hi all,",
    "",
    `${o.client} is offering a confidential health screening with Precision Health, our screening partner, between ${o.window} at ${o.place}.`,
    "",
    `The appointment takes about ${o.minutes} minutes with a nurse. Afterwards you get a personal report, reviewed by a Precision Health doctor.`,
    "",
    "To book:",
    `1. Go to ${o.link}`,
    `2. Enter the code ${o.code}`,
    "3. Confirm your details, read the consent and answer a short health questionnaire, then pick a time.",
    "",
    `Your health information stays private. ${o.client} never sees anything about you individually, only anonymised, grouped figures at the end of the programme.`,
    "",
    `Questions about booking: ${o.support}`,
    "",
    o.sender,
    o.role,
  ].join("\n");
}
