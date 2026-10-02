/* Time helpers for the Precision Health demo.
   Timestamps are UTC ISO strings. Calendar dates and clinic wall-clock times are
   Europe/Dublin. The Irish DST rule is computed directly (last Sunday of March to
   last Sunday of October, 01:00 UTC), so formatting is fast and deterministic. */

export type Iso = string;
export type LocalDate = string; // YYYY-MM-DD, Europe/Dublin
export type Hhmm = string; // HH:MM, 24-hour, Europe/Dublin

export const TZ = "Europe/Dublin";

/** The fixed demo clock: Monday 5 October 2026, 08:15 Europe/Dublin (07:15 UTC). */
export const DEMO_NOW_UTC: Iso = "2026-10-05T07:15:00.000Z";
export const DEMO_TODAY: LocalDate = "2026-10-05";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const p2 = (n: number) => (n < 10 ? "0" + n : String(n));

function lastSundayUtc(y: number, month0: number): number {
  const last = new Date(Date.UTC(y, month0 + 1, 0));
  const day = last.getUTCDate() - last.getUTCDay();
  return Date.UTC(y, month0, day, 1, 0, 0);
}

/** Offset of Europe/Dublin from UTC in minutes at the given instant. */
export function dublinOffsetMinutes(ms: number): number {
  const y = new Date(ms).getUTCFullYear();
  return ms >= lastSundayUtc(y, 2) && ms < lastSundayUtc(y, 9) ? 60 : 0;
}

export interface DublinParts {
  y: number;
  m: number; // 1-12
  d: number;
  h: number;
  mi: number;
  dow: number; // 0 = Sunday
  date: LocalDate;
  time: Hhmm;
}

export function toDublin(iso: Iso | number): DublinParts {
  const ms = typeof iso === "number" ? iso : Date.parse(iso);
  const t = new Date(ms + dublinOffsetMinutes(ms) * 60000);
  const y = t.getUTCFullYear(), m = t.getUTCMonth() + 1, d = t.getUTCDate();
  const h = t.getUTCHours(), mi = t.getUTCMinutes();
  return { y, m, d, h, mi, dow: t.getUTCDay(), date: `${y}-${p2(m)}-${p2(d)}`, time: `${p2(h)}:${p2(mi)}` };
}

/** A Dublin wall-clock date and time to a UTC ISO string. */
export function dublinToUtc(date: LocalDate, time: Hhmm = "00:00"): Iso {
  const [y, m, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const naive = Date.UTC(y, m - 1, d, h, mi, 0);
  const guess = naive - dublinOffsetMinutes(naive - 3600000) * 60000;
  const ms = naive - dublinOffsetMinutes(guess) * 60000;
  return new Date(ms).toISOString();
}

export function localDateOf(iso: Iso): LocalDate {
  return toDublin(iso).date;
}
export function localTimeOf(iso: Iso): Hhmm {
  return toDublin(iso).time;
}

function parseLocal(date: LocalDate) {
  const [y, m, d] = date.split("-").map(Number);
  return { y, m, d, dow: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}

export function weekdayOf(date: LocalDate): number {
  return parseLocal(date).dow;
}

export function addDays(date: LocalDate, n: number): LocalDate {
  const { y, m, d } = parseLocal(date);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${p2(t.getUTCMonth() + 1)}-${p2(t.getUTCDate())}`;
}

export function daysBetween(a: LocalDate, b: LocalDate): number {
  const pa = parseLocal(a), pb = parseLocal(b);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86400000);
}

/** Monday of the week containing the date. */
export function startOfWeek(date: LocalDate): LocalDate {
  const dow = weekdayOf(date);
  return addDays(date, dow === 0 ? -6 : 1 - dow);
}

/* ---- formatting (Irish conventions: day first, 24-hour time) ---- */

/** 5 Oct 2026 */
export function fmtDate(v: Iso | LocalDate): string {
  const p = v.length === 10 ? parseLocal(v) : toDublin(v);
  return `${p.d} ${MONTHS[p.m - 1]} ${p.y}`;
}
/** 5 Oct */
export function fmtDayMonth(v: Iso | LocalDate): string {
  const p = v.length === 10 ? parseLocal(v) : toDublin(v);
  return `${p.d} ${MONTHS[p.m - 1]}`;
}
/** Mon 5 Oct */
export function fmtWeekdayDate(v: Iso | LocalDate): string {
  const p = v.length === 10 ? parseLocal(v) : toDublin(v);
  return `${DAYS[p.dow]} ${p.d} ${MONTHS[p.m - 1]}`;
}
/** Monday 5 October 2026 */
export function fmtDateLong(v: Iso | LocalDate): string {
  const p = v.length === 10 ? parseLocal(v) : toDublin(v);
  return `${DAYS_LONG[p.dow]} ${p.d} ${MONTHS_LONG[p.m - 1]} ${p.y}`;
}
/** 05/10/2026 */
export function fmtNumericDate(v: Iso | LocalDate): string {
  const p = v.length === 10 ? parseLocal(v) : toDublin(v);
  return `${p2(p.d)}/${p2(p.m)}/${p.y}`;
}
/** 08:15 */
export function fmtTime(iso: Iso): string {
  return toDublin(iso).time;
}
/** 5 Oct 2026, 08:15 */
export function fmtDateTime(iso: Iso): string {
  return `${fmtDate(iso)}, ${fmtTime(iso)}`;
}
/** 5 Oct, 08:15 */
export function fmtShortDateTime(iso: Iso): string {
  return `${fmtDayMonth(iso)}, ${fmtTime(iso)}`;
}
/** Today 09:00 / Tomorrow 09:00 / Fri 2 Oct, 16:40 relative to the given clock. */
export function fmtWhen(iso: Iso, nowIso: Iso): string {
  const d = localDateOf(iso), n = localDateOf(nowIso);
  const diff = daysBetween(n, d);
  const t = fmtTime(iso);
  if (diff === 0) return `Today ${t}`;
  if (diff === 1) return `Tomorrow ${t}`;
  if (diff === -1) return `Yesterday ${t}`;
  return `${fmtWeekdayDate(iso)}, ${t}`;
}

export function addMinutes(iso: Iso, n: number): Iso {
  return new Date(Date.parse(iso) + n * 60000).toISOString();
}
export function addHours(iso: Iso, n: number): Iso {
  return addMinutes(iso, n * 60);
}
export function hoursBetween(fromIso: Iso, toIso: Iso): number {
  return (Date.parse(toIso) - Date.parse(fromIso)) / 3600000;
}
export function minutesBetween(fromIso: Iso, toIso: Iso): number {
  return (Date.parse(toIso) - Date.parse(fromIso)) / 60000;
}

/** 35m, 2h, 3d 4h. Used for waiting times. */
export function fmtAge(hours: number): string {
  if (hours < 0) return "due in " + fmtAge(-hours);
  if (hours < 1) return Math.max(1, Math.round(hours * 60)) + "m";
  if (hours < 24) return Math.floor(hours) + "h";
  const d = Math.floor(hours / 24), h = Math.floor(hours - d * 24);
  return h ? `${d}d ${h}h` : `${d}d`;
}

/** Age in whole years on a given calendar date. */
export function ageOn(dob: LocalDate, on: LocalDate): number {
  const a = parseLocal(dob), b = parseLocal(on);
  let age = b.y - a.y;
  if (b.m < a.m || (b.m === a.m && b.d < a.d)) age--;
  return age;
}

export function hhmmToMinutes(t: Hhmm): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
export function minutesToHhmm(n: number): Hhmm {
  return `${p2(Math.floor(n / 60))}:${p2(n % 60)}`;
}

/** Greeting for the demo clock. */
export function greetingFor(iso: Iso): string {
  const h = toDublin(iso).h;
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

/** Irish number formatting with a thousands separator. */
export function fmtInt(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
export function fmtPct(n: number, d = 1): string {
  return n.toFixed(d) + "%";
}
/** Round half away from zero to a fixed number of decimals (BMI and similar). */
export function roundHalfUp(x: number, decimals = 1): number {
  const f = Math.pow(10, decimals);
  return Math.round((x + Number.EPSILON) * f) / f;
}
