/* Scheduled actions: anything a person schedules from the Calendar with "+ Schedule" that has no
   home of its own yet. Client meetings and calls, follow up emails, results out and rebooking emails,
   staff training and leave. Tasks, flu clinics and occupational health sessions are created in their
   own slices (Work, Flu, Occupational Health) and only recorded here as a reference, so the Calendar
   knows who scheduled them and keeps one history.

   Emails are simulated. A scheduled email counts as sent once the demo clock passes its send time,
   or straight away with "Send now".

   Pure module: no React, no dispatch. Handlers live in src/ph/pages/Calendar/schedActions.ts. */
import type { Hhmm, Iso, LocalDate } from "./time";
import { addDays, dublinToUtc, fmtDate } from "./time";
import type { PhState, StaffId } from "./types";
import { PROGRAMMES } from "./constants";

export type SchedKind = "meeting" | "call" | "follow_up" | "results_out" | "rebooking" | "task" | "flu" | "oh" | "training" | "leave";
export type SchedStatus = "scheduled" | "done" | "cancelled";

export const SCHED_KIND_LABEL: Record<SchedKind, string> = {
  meeting: "Client meeting", call: "Client call", follow_up: "Follow up email", results_out: "Results are out email", rebooking: "Rebooking reminder",
  task: "Task or reminder", flu: "Flu clinic", oh: "Occupational health session", training: "Staff training", leave: "Leave or holiday",
};
/** Kinds whose record lives here (not in another slice). */
export const SCHED_OWN_KINDS: SchedKind[] = ["meeting", "call", "follow_up", "results_out", "rebooking", "training", "leave"];
export const SCHED_EMAIL_KINDS: SchedKind[] = ["follow_up", "results_out", "rebooking"];

export interface SchedHistory { at: Iso; by: string; text: string }
export interface SchedItem {
  id: string; // SA-0001
  kind: SchedKind;
  title: string;
  date: LocalDate;
  /** Last day, for leave over several days. */
  endDate: LocalDate | null;
  start: Hhmm | null;
  end: Hhmm | null;
  leadId: string | null;
  /** Client or company name. */
  client: string | null;
  /** Who at the client: a name, and an email for emails. */
  contact: string | null;
  contactEmail: string | null;
  staffIds: StaffId[];
  notes: string;
  /** Email template id (follow up emails) */
  template: string | null;
  /** The record in another slice this created: a task, a flu clinic or a MediBase session. */
  ref: { kind: "task" | "flu" | "oh"; id: string } | null;
  status: SchedStatus;
  doneAt: Iso | null;
  createdAt: Iso;
  createdBy: StaffId;
  history: SchedHistory[];
}
export interface ScheduledState { seq: number; items: SchedItem[] }

/** Follow up email templates, in Stephen's soft check-in style. */
export const SCHED_FOLLOW_TEMPLATES: Array<{ id: string; label: string; subject: string; body: string }> = [
  { id: "checkin", label: "Weekly check-in", subject: "Anything more I can do?", body: "Hi {first},\n\nJust checking in. Is there anything more I can do to help with your plans for {company}? Happy to jump on a quick call.\n\n{sender}\nPrecision Health" },
  { id: "proposal", label: "Proposal follow up", subject: "Your Precision Health proposal", body: "Hi {first},\n\nI hope the proposal reached you safely. If anything needs changing on the package, numbers or dates for {company}, I can send an updated version the same day.\n\n{sender}\nPrecision Health" },
  { id: "recap", label: "Meeting recap", subject: "Thanks for the chat today", body: "Hi {first},\n\nThanks for your time today. As promised, here is a short recap and the next steps for {company}. Our brochure is attached.\n\n{sender}\nPrecision Health" },
  { id: "brochure", label: "Brochure and references", subject: "Precision Health: brochure and references", body: "Hi {first},\n\nAs promised, our brochure is attached, along with a few clients in your sector we look after. Book a time that suits with the calendar link below.\n\n{sender}\nPrecision Health" },
];
export const schedTemplate = (id: string | null) => SCHED_FOLLOW_TEMPLATES.find((t) => t.id === id) || SCHED_FOLLOW_TEMPLATES[0];

const at = (d: string, t: string) => `${d}T${t}:00.000Z`;
/** Two seeded internal items, so the Team and leave layer is not empty on first look. */
export function initialScheduledState(): ScheduledState {
  const h = (by: string, text: string, when: Iso): SchedHistory[] => [{ at: when, by, text }];
  const base = { leadId: null, contact: null, contactEmail: null, template: null, ref: null, status: "scheduled" as SchedStatus, doneAt: null };
  return {
    seq: 2,
    items: [
      { ...base, id: "SA-0001", kind: "training", title: "Phlebotomy refresher training", date: "2026-10-07", endDate: null, start: "14:00", end: "16:00", client: null,
        staffIds: ["aisling", "ciara", "liz"], notes: "Training room, Dublin office. Liz runs it.", createdAt: at("2026-09-28", "09:10"), createdBy: "liz",
        history: h("Liz Bawle", "Scheduled", at("2026-09-28", "09:10")) },
      { ...base, id: "SA-0002", kind: "leave", title: "Annual leave", date: "2026-10-12", endDate: "2026-10-14", start: null, end: null, client: null,
        staffIds: ["anita"], notes: "Booked in August.", createdAt: at("2026-08-20", "11:30"), createdBy: "brenda",
        history: h("Brenda Madden", "Scheduled", at("2026-08-20", "11:30")) },
    ],
  };
}

/* ---------------------------------------------------------------- selectors */

export const schedItems = (s: PhState): SchedItem[] => s.scheduled?.items || [];
export const schedById = (s: PhState, id: string) => schedItems(s).find((x) => x.id === id);
/** The record behind a calendar event id, e.g. "task:TSK-0040" or "sched:SA-0003". */
export function schedForCalId(s: PhState, calId: string): SchedItem | undefined {
  const m = /^sched:(SA-\d+)/.exec(calId);
  if (m) return schedById(s, m[1]);
  const [kind, id] = calId.split(":");
  const k = kind === "task" ? "task" : kind === "flu" ? "flu" : kind === "oh" ? "oh" : null;
  return k ? schedItems(s).find((x) => x.ref && x.ref.kind === k && x.ref.id === id) : undefined;
}
/** When an email goes, as an instant. */
export const schedSendAt = (x: Pick<SchedItem, "date" | "start">): Iso => dublinToUtc(x.date, x.start || "09:00");
/** Sent: marked sent, or the demo clock has passed the send time. */
export function schedEmailSent(s: PhState, x: SchedItem): boolean {
  if (!SCHED_EMAIL_KINDS.includes(x.kind)) return false;
  if (x.status === "done") return true;
  return x.status === "scheduled" && Date.parse(schedSendAt(x)) <= Date.parse(s.clock.nowUtc);
}
export function schedStatusLabel(s: PhState, x: SchedItem): { label: string; tone: "ok" | "warn" | "info" | "neutral"; done: boolean } {
  if (x.status === "cancelled") return { label: "Cancelled", tone: "neutral", done: true };
  if (SCHED_EMAIL_KINDS.includes(x.kind)) {
    if (x.status === "done") return { label: "Sent", tone: "ok", done: true };
    if (schedEmailSent(s, x)) return { label: "Sent at the scheduled time", tone: "ok", done: true };
    return { label: "Scheduled to send", tone: "info", done: false };
  }
  if (x.status === "done") return { label: "Done", tone: "ok", done: true };
  const last = x.endDate || x.date;
  if (last < s.clock.nowUtc.slice(0, 10)) return { label: "Past", tone: "neutral", done: true };
  return { label: x.kind === "leave" ? "Booked" : "Scheduled", tone: "neutral", done: false };
}

/** Every day an item covers (leave can span several days). */
export function schedDays(x: Pick<SchedItem, "date" | "endDate">): LocalDate[] {
  const out: LocalDate[] = [];
  const last = x.endDate && x.endDate > x.date ? x.endDate : x.date;
  for (let d = x.date; d <= last && out.length < 31; d = addDays(d, 1)) out.push(d);
  return out;
}

/** A sentence when a person is on leave or at training that day, else null. Used to block clinics. */
export function schedStaffBlock(s: PhState, staffId: string | null | undefined, date: LocalDate | null | undefined, exceptId?: string): string | null {
  if (!staffId || !date) return null;
  for (const x of schedItems(s)) {
    if (x.id === exceptId || x.status === "cancelled" || (x.kind !== "leave" && x.kind !== "training")) continue;
    if (!x.staffIds.includes(staffId as StaffId) || !schedDays(x).includes(date)) continue;
    const name = s.staff.find((p) => p.id === staffId)?.name || staffId;
    if (x.kind === "leave") return `${name} is on leave on ${fmtDate(date)}${x.endDate && x.endDate !== x.date ? ` (${fmtDate(x.date)} to ${fmtDate(x.endDate)})` : ""}.`;
    if (!x.start) return `${name} is at ${x.title.toLowerCase()} all day on ${fmtDate(date)}.`;
  }
  return null;
}

/** Clients and leads a person can schedule against: open leads first, then screening and OH clients, then retention. */
export function schedClientOptions(s: PhState): Array<{ name: string; leadId: string | null; contact: string; email: string; group: string }> {
  const out: Array<{ name: string; leadId: string | null; contact: string; email: string; group: string }> = [];
  const seen = new Set<string>();
  const add = (name: string, leadId: string | null, contact: string, email: string, group: string) => {
    const k = name.toLowerCase();
    if (!name || seen.has(k)) return;
    seen.add(k);
    out.push({ name, leadId, contact, email, group });
  };
  for (const l of s.sales.leads.filter((x) => x.stage !== "lost").slice().sort((a, b) => (a.company < b.company ? -1 : 1))) add(l.company, l.id, l.contact.name, l.contact.email, "Leads");
  for (const p of PROGRAMMES) {
    const ct = s.contacts.find((c) => c.companyId === p.clientId);
    add(p.clientName, null, ct?.name || "", ct?.email || "", "Screening clients");
  }
  for (const c of s.occHealth.clients) add(c.name, null, c.form?.contactName || "", c.form?.contactEmail || "","Occupational health clients");
  for (const c of s.portalsHub?.clients || []) add(c.company, null, c.hrName, c.hrEmail, "Client portals");
  return out;
}
