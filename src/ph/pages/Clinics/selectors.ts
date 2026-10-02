/* Clinics selectors: plain functions of PhState, memoised per state object with a "clx:" key
   prefix. Every count, status and readiness item is derived from the shared store. */
import type {
  Booking, ClinicalCapture, ClinicSession, Episode, FormTemplate, FormTemplateVersion, Hhmm, LocalDate, Membership, Message, NavTarget, Person, PhState,
  Programme, ProgrammeId, ScheduledJob, SessionEditPreview, SlotView, Staff, StaffId, TaskView,
} from "../../model";
import {
  PROGRAMME_ORDER, activeBookings, addDays, dublinToUtc, fmtWhen, freeSlots, hhmmToMinutes, ix, memo, minutesToHhmm, persona, scheduleOverlaps, sessionSlots,
  staffName, startOfWeek, taskViews, today,
} from "../../model";

/* ---- ordering and small helpers ---- */
export const progRank = (id: ProgrammeId) => PROGRAMME_ORDER.indexOf(id);
export const sortSessions = (a: ClinicSession, b: ClinicSession) =>
  a.date === b.date ? progRank(a.programmeId) - progRank(b.programmeId) : a.date < b.date ? -1 : 1;
export const pad4 = (n: number) => String(n).padStart(4, "0");

export function slotEndOf(s: ClinicSession, start: Hhmm): Hhmm {
  const sl = sessionSlots(s).find((x) => x.start === start);
  return sl ? sl.end : minutesToHhmm(hhmmToMinutes(start) + s.slotMinutes);
}
/** Booked minutes: appointments times the slot length. */
export const bookableMinutes = (s: ClinicSession) => sessionSlots(s).length * s.slotMinutes;
export function minutesLabel(n: number): string {
  const h = Math.floor(n / 60), m = n % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}
export const shortSite = (s: ClinicSession) => s.siteName.replace(/^Sisk Dublin /, "").replace(/, Demo .*$/, "");
/** Room and site in one short phrase, without repeating the site. */
export const placeLabel = (s: ClinicSession) => (s.room.includes(shortSite(s)) ? s.room : `${s.room}, ${shortSite(s)}`);
export function timesOverlap(a: Pick<ClinicSession, "start" | "end">, b: Pick<ClinicSession, "start" | "end">) {
  return hhmmToMinutes(a.start) < hhmmToMinutes(b.end) && hhmmToMinutes(b.start) < hhmmToMinutes(a.end);
}

/** All dates that have a session, ascending. */
export function sessionDays(state: PhState): LocalDate[] {
  return memo(state, "clx:days", () => Array.from(new Set(state.sessions.filter((s) => s.status !== "cancelled").map((s) => s.date))).sort());
}
export function sessionsOnDay(state: PhState, date: LocalDate): ClinicSession[] {
  return state.sessions.filter((s) => s.date === date && s.status !== "cancelled").sort(sortSessions);
}
/** Mondays of every week that holds a session, with the number of sessions in it. */
export function windowWeeks(state: PhState): Array<{ start: LocalDate; count: number }> {
  return memo(state, "clx:weeks", () => {
    const days = sessionDays(state);
    if (!days.length) return [];
    const out: Array<{ start: LocalDate; count: number }> = [];
    const last = startOfWeek(days[days.length - 1]);
    for (let w = startOfWeek(days[0]); w <= last; w = addDays(w, 7)) {
      const end = addDays(w, 6);
      out.push({ start: w, count: state.sessions.filter((s) => s.status !== "cancelled" && s.date >= w && s.date <= end).length });
    }
    return out;
  });
}

/* ---- appointments ---- */
export type ApptStatus = "upcoming" | "not_arrived" | "checked_in" | "in_progress" | "completed" | "no_show" | "cancelled";

export function apptStatus(state: PhState, b: Booking, s: ClinicSession): ApptStatus {
  if (b.status === "cancelled") return "cancelled";
  if (b.attendance === "completed") return "completed";
  if (b.attendance === "no_show") return "no_show";
  if (b.attendance === "checked_in" || b.attendance === "in_progress") {
    const d = state.captureDrafts[b.id];
    const started = b.attendance === "in_progress" || (!!d && (d.status === "draft" || d.identity.some((x) => x.confirmed) || Object.values(d.checklist).some(Boolean)));
    return started ? "in_progress" : "checked_in";
  }
  return s.date > today(state) ? "upcoming" : "not_arrived";
}

export interface ApptRow {
  booking: Booking;
  session: ClinicSession;
  person: Person;
  membership: Membership | null;
  programme: Programme;
  status: ApptStatus;
  slotEnd: Hhmm;
  /** The slot start has passed on the demo clock. */
  slotPassed: boolean;
  draft: ClinicalCapture | null;
  episode: Episode | null;
}

export function apptRow(state: PhState, b: Booking): ApptRow | null {
  const I = ix(state);
  const session = I.sessionById.get(b.sessionId);
  const person = I.personById.get(b.personId);
  const programme = I.programmeById.get(b.programmeId);
  if (!session || !person || !programme) return null;
  return {
    booking: b, session, person, programme,
    membership: (I.membershipsByPerson.get(b.personId) || [])[0] || null,
    status: apptStatus(state, b, session),
    slotEnd: slotEndOf(session, b.slotStart),
    slotPassed: Date.parse(dublinToUtc(session.date, b.slotStart)) <= Date.parse(state.clock.nowUtc),
    draft: state.captureDrafts[b.id] || null,
    episode: b.episodeId ? I.episodeById.get(b.episodeId) || null : null,
  };
}

/** Every booking in the sessions on a date, including cancelled ones (the list filters them). */
export function dayAppointments(state: PhState, date: LocalDate): ApptRow[] {
  return memo(state, "clx:day:" + date, () => {
    const ids = new Set(state.sessions.filter((s) => s.date === date).map((s) => s.id));
    return state.bookings
      .filter((b) => ids.has(b.sessionId))
      .map((b) => apptRow(state, b))
      .filter((r): r is ApptRow => !!r)
      .sort((a, b) =>
        a.booking.slotStart !== b.booking.slotStart ? (a.booking.slotStart < b.booking.slotStart ? -1 : 1)
          : progRank(a.programme.id) !== progRank(b.programme.id) ? progRank(a.programme.id) - progRank(b.programme.id)
            : a.booking.status === b.booking.status ? (a.booking.id < b.booking.id ? -1 : 1) : a.booking.status === "confirmed" ? -1 : 1);
  });
}

export function reminderByBooking(state: PhState): Map<string, Message> {
  return memo(state, "clx:rem", () => {
    const m = new Map<string, Message>();
    for (const x of state.messages) if (x.kind === "reminder" && x.bookingId) m.set(x.bookingId, x);
    return m;
  });
}
export function bookingMessages(state: PhState, bookingId: string): Message[] {
  return state.messages.filter((m) => m.bookingId === bookingId).sort((a, b) => (a.at < b.at ? -1 : 1));
}
/** Booked less than 24 hours before the appointment: one confirmation, no reminder. */
export function bookedInside24h(b: Booking, s: ClinicSession): boolean {
  return Date.parse(dublinToUtc(s.date, b.slotStart)) - Date.parse(b.createdAt) < 24 * 3600000;
}

/* ---- who may do what here (mirrors the model's own checks, so buttons can explain) ---- */
export function checkInRule(state: PhState, s: ClinicSession): { ok: boolean; reason: string } {
  const p = persona(state);
  const t = today(state);
  if (s.date > t) return { ok: false, reason: "Check-in opens on the day of the appointment." };
  if (s.date < t) return { ok: false, reason: "This clinic has already taken place." };
  if (p.isParticipant) return { ok: false, reason: "Participants cannot check in from the staff view." };
  if (p.role === "clinical_capture" && s.nurseId !== p.id && !s.supportIds.includes(p.id as StaffId)) {
    return { ok: false, reason: `${p.name} is not assigned to this clinic. Its own team or Programme Operations checks participants in.` };
  }
  if (!p.perms.has("clinical.capture") && !p.perms.has("bookings.manage")) {
    return { ok: false, reason: `${p.name} (${p.roleLabel}) cannot check participants in. Clinic nurses and Programme Operations can.` };
  }
  return { ok: true, reason: "" };
}
export function captureRule(state: PhState, s: ClinicSession): { ok: boolean; reason: string } {
  const p = persona(state);
  if (!p.perms.has("clinical.capture")) return { ok: false, reason: `${p.name} (${p.roleLabel}) can view this record. Capture is done by the clinic nurse.` };
  if (p.role === "clinical_capture" && s.nurseId !== p.id && !s.supportIds.includes(p.id as StaffId)) {
    return { ok: false, reason: `${p.name} is not assigned to this clinic. Capture is limited to your own assignments.` };
  }
  return { ok: true, reason: "" };
}

/* ---- form version of a booking ---- */
export function bookingForm(state: PhState, b: Booking): { template: FormTemplate | undefined; version: FormTemplateVersion | undefined } {
  const template = state.forms.templates.find((t) => t.id === b.formTemplateId);
  const version = template?.versions.find((v) => v.version === b.formVersion);
  return { template, version };
}
export function urineRequired(state: PhState, b: Booking): boolean {
  const v = bookingForm(state, b).version;
  return !!v && v.blocks.some((x) => x.blockId === "blk-urine" && x.required);
}

/** The episode and specimen identifiers the next completed appointment will receive. */
export function nextEpisodeNumber(state: PhState): number {
  return (state.counters.episode || 0) + 1;
}

/* ---- session readiness, derived from assignments, bookings, reminders and prep tasks ---- */
export type ReadyState = "done" | "open" | "warn" | "info";
export interface ReadyItem { key: string; label: string; detail: string; state: ReadyState; target?: NavTarget; task?: TaskView }

export function roomClashes(state: PhState, candidate: ClinicSession): ClinicSession[] {
  if (candidate.status === "cancelled") return [];
  return state.sessions.filter((x) => x.id !== candidate.id && x.status !== "cancelled" && x.date === candidate.date && x.room === candidate.room && timesOverlap(x, candidate));
}

export function sessionTasks(state: PhState, sessionId: string): TaskView[] {
  return taskViews(state).filter((x) => x.visible && x.task.linked.kind === "session" && x.task.linked.id === sessionId);
}
export function reminderJob(state: PhState, sessionId: string): ScheduledJob | undefined {
  return state.jobs.find((j) => j.id === `JOB-REM-${sessionId}`);
}

export function sessionReadiness(state: PhState, sessionId: string): ReadyItem[] {
  return memo(state, "clx:ready:" + sessionId, () => {
    const I = ix(state);
    const s = I.sessionById.get(sessionId)!;
    const t = today(state);
    const bk = activeBookings(state, s.id);
    const out: ReadyItem[] = [];
    const conf = staffConflicts(state, s);
    const nurseOv = conf.filter((c) => c.mine === "nurse");
    out.push({
      key: "nurse", label: "Nurse assigned", state: nurseOv.length ? "warn" : "done",
      detail: nurseOv.length ? `${staffName(state, s.nurseId)} is also assigned to ${nurseOv[0].other.id} at the same time` : `${staffName(state, s.nurseId)}, no overlapping assignment`,
    });
    if (s.supportIds.length) {
      const supOv = conf.filter((c) => c.mine === "support");
      out.push({
        key: "support", label: "Support resource", state: supOv.length ? "warn" : "done",
        detail: `${s.supportIds.map((id) => staffName(state, id)).join(", ")}. Support only, not a second booked nurse${supOv.length ? `. Also assigned to ${supOv[0].other.id} at the same time` : ""}`,
      });
    }
    const clash = roomClashes(state, s);
    out.push({ key: "room", label: "Room assigned", state: !s.room ? "open" : clash.length ? "warn" : "done", detail: clash.length ? `${s.room} is also used by ${clash[0].id}` : s.room || "No room assigned" });
    const printer = state.resources.find((r) => r.id === s.printerId);
    out.push({ key: "printer", label: "Label printer assigned", state: printer ? "done" : "open", detail: printer ? printer.name : "No printer assigned" });
    const complete = bk.filter((b) => {
      const m = (I.membershipsByPerson.get(b.personId) || [])[0];
      return !!m && m.questionnaire === "complete" && m.consent === "complete";
    }).length;
    out.push({ key: "questionnaire", label: "Questionnaire and consent complete", state: complete === bk.length ? "done" : "warn", detail: `${complete} of ${bk.length} bookings, completed before each booking was confirmed` });
    if (s.date > t) {
      const job = reminderJob(state, s.id);
      out.push({
        key: "reminders", label: "Reminders scheduled", state: job ? "info" : "open",
        detail: job?.nextRunAt ? `Simulated job runs ${fmtWhen(job.nextRunAt, state.clock.nowUtc)}, 24 hours before the clinic` : "No reminder job scheduled",
      });
    } else if (s.date === t) {
      const rm = reminderByBooking(state);
      const rems = bk.map((b) => rm.get(b.id)).filter((m): m is Message => !!m);
      const failed = rems.filter((m) => m.status === "failed").length;
      const delivered = rems.filter((m) => m.status === "delivered").length;
      const late = bk.filter((b) => !rm.has(b.id)).length;
      out.push({
        key: "reminders", label: failed ? "Reminder delivery needs review" : "Reminders delivered", state: failed ? "warn" : "done",
        detail: `${delivered} of ${rems.length} delivered${failed ? `, ${failed} failed` : ""}${late ? `. ${late} booked inside 24 hours: confirmation only, no reminder` : ""}`,
        target: failed ? { page: "Participants", tab: "communications", params: { filter: "failed" } } : undefined,
      });
    }
    for (const x of sessionTasks(state, s.id)) {
      out.push({
        key: x.task.id, label: x.title, state: x.status === "done" ? "done" : x.overdue ? "warn" : "open", task: x,
        detail: `${x.ownerName}${x.status === "done" ? ", done" : x.task.dueAt ? `, due ${fmtWhen(x.task.dueAt, state.clock.nowUtc)}` : ""}`,
      });
    }
    return out;
  });
}

/* ---- staffing ---- */
export interface Assignment { session: ClinicSession; role: "nurse" | "support" }
export function assignmentsOf(state: PhState, staffId: string): Assignment[] {
  return state.sessions
    .filter((s) => s.status !== "cancelled" && (s.nurseId === staffId || s.supportIds.includes(staffId as StaffId)))
    .sort(sortSessions)
    .map((s) => ({ session: s, role: s.nurseId === staffId ? "nurse" : "support" }));
}
export function upcomingSessions(state: PhState): ClinicSession[] {
  const t = today(state);
  return state.sessions.filter((s) => s.date > t && s.status === "scheduled").sort(sortSessions);
}
export const NURSE_ROLES: Array<Staff["role"]> = ["nursing_lead", "clinical_capture"];
export function nursingStaff(state: PhState): Staff[] {
  return state.staff.filter((s) => s.team === "nursing");
}
/** What each role can do in Clinics, in plain words. */
export function clinicAccess(role: Staff["role"]): string {
  switch (role) {
    case "nursing_lead": return "Captures at any clinic, manages sessions";
    case "clinical_capture": return "Captures at own assigned clinics";
    case "clinical_review": return "Views clinical capture, no capture";
    case "operations": return "Logistics, check-in and session edits";
    case "programme_oversight": return "Logistics and session edits";
    case "wellness_support": return "Logistics only, support at clinics";
    default: return "Logistics only";
  }
}

/* ---- staff conflicts, checked both ways ----
   The shared findOverlaps only compares one direction, so a support resource who is the nurse at
   another session at the same time can slip through. This check covers every role pairing. */
export interface StaffConflict { staffId: StaffId; other: ClinicSession; mine: "nurse" | "support"; theirs: "nurse" | "support" }
export function staffConflicts(state: PhState, candidate: ClinicSession): StaffConflict[] {
  if (candidate.status === "cancelled") return [];
  const out: StaffConflict[] = [];
  const roles = (s: ClinicSession) => [{ id: s.nurseId, role: "nurse" as const }, ...s.supportIds.map((id) => ({ id, role: "support" as const }))];
  for (const x of state.sessions) {
    if (x.id === candidate.id || x.status === "cancelled" || x.date !== candidate.date || !timesOverlap(x, candidate)) continue;
    for (const a of roles(candidate)) for (const b of roles(x)) if (a.id === b.id) out.push({ staffId: a.id, other: x, mine: a.role, theirs: b.role });
  }
  return out;
}
export function allStaffConflicts(state: PhState): Array<{ session: ClinicSession; conflicts: StaffConflict[] }> {
  return memo(state, "clx:conflicts", () => state.sessions.map((s) => ({ session: s, conflicts: staffConflicts(state, s) })).filter((x) => x.conflicts.length > 0));
}

/* ---- session edit impact: mirrors how the model moves impacted bookings ---- */
export interface ImpactMove { booking: Booking; person: Person | undefined; from: Hhmm; to: Hhmm | null }
export function impactMoves(state: PhState, sessionId: string, pv: SessionEditPreview): ImpactMove[] {
  const occupied = new Set(activeBookings(state, sessionId).map((b) => b.slotStart));
  const free = pv.slots.filter((sl) => !occupied.has(sl.start));
  return pv.impacted.map((imp, i) => ({ booking: imp.booking, person: imp.person, from: imp.booking.slotStart, to: free[i] ? free[i].start : null }));
}

/* ---- individual reschedule targets: same programme, open sessions, free future slots ---- */
export function moveTargets(state: PhState, b: Booking): Array<{ session: ClinicSession; free: SlotView[] }> {
  const t = today(state);
  return state.sessions
    .filter((s) => s.programmeId === b.programmeId && s.status === "scheduled" && s.date >= t)
    .sort(sortSessions)
    .map((s) => ({ session: s, free: freeSlots(state, s.id) }))
    .filter((x) => x.free.length > 0);
}

/* ---- capacity context: invitees part-way through onboarding (not bookings) ---- */
export function onboardingInvitees(state: PhState, programmeId: ProgrammeId): Array<{ person: Person; membership: Membership }> {
  const I = ix(state);
  return state.memberships
    .filter((m) => m.programmeId === programmeId && m.stage === "onboarding")
    .map((m) => ({ person: I.personById.get(m.personId)!, membership: m }))
    .filter((x) => !!x.person)
    .sort((a, b) => (a.person.id < b.person.id ? -1 : 1));
}
