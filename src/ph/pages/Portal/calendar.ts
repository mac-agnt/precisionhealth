/* Add to calendar: an iCalendar (.ics) file built in the browser and handed to the participant
   as a download. The entry carries no clinical detail: the title is only "Precision Health
   appointment", and the description holds the booking reference and the support address. */
import { addMinutes, dublinToUtc } from "../../model";
import type { Booking, ClinicSession, Iso } from "../../model";
import { SUPPORT_EMAIL } from "./data";

const icsStamp = (iso: Iso) => iso.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
/** RFC 5545 folds content lines longer than 75 octets. The text here is ASCII, so characters are octets. */
const fold = (line: string) => {
  if (line.length <= 75) return line;
  const parts = [line.slice(0, 75)];
  for (let i = 75; i < line.length; i += 74) parts.push(" " + line.slice(i, i + 74));
  return parts.join("\r\n");
};

export function bookingIcs(b: Booking, s: ClinicSession, minutes: number, nowIso: Iso): string {
  const start = dublinToUtc(s.date, b.slotStart);
  const end = addMinutes(start, minutes);
  const where = s.siteName.includes(s.room) ? s.siteName : `${s.siteName}, ${s.room}`;
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Precision Health//Pulse participant portal demo//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${b.id}@portal.precisionhealth.example.invalid`,
    `DTSTAMP:${icsStamp(nowIso)}`,
    `DTSTART:${icsStamp(start)}`,
    `DTEND:${icsStamp(end)}`,
    "SUMMARY:Precision Health appointment",
    `LOCATION:${icsText(where)}`,
    `DESCRIPTION:${icsText(`Booking reference ${b.id}. To change or cancel, use the participant portal or email ${SUPPORT_EMAIL}.`)}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT1H",
    "ACTION:DISPLAY",
    "DESCRIPTION:Precision Health appointment",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].map(fold).join("\r\n") + "\r\n";
}

/** Hands the file to the browser. Nothing is uploaded or sent. */
export function downloadIcs(b: Booking, s: ClinicSession, minutes: number, nowIso: Iso): void {
  const blob = new Blob([bookingIcs(b, s, minutes, nowIso)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "precision-health-appointment.ics";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
