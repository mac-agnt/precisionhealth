/* Booking, portal onboarding, the nurse clinical workspace, session edits and invitations.
   Required consent and questionnaire come before a booking is confirmed. Completing an
   appointment creates an episode awaiting results. It never releases a report.
   Staff book with the Manage bookings permission. The participant preview acts only on the
   participant's own record. */
import type { Booking, ClinicalCapture, Episode, InvitationCode, ProgrammeId, Specimen, StaffId } from "../types";
import { CORE_PANEL, HEALTH_INFO_PATTERN, PROGRAMME_BY_ID, QUESTIONNAIRE_SECTIONS } from "../constants";
import { captureErrors, captureMissing, isRealDate, measureError, parseIrishDate } from "../capture";
import type { MeasureKey } from "../capture";
import { dublinToUtc, fmtDate, fmtDayMonth, fmtNumericDate } from "../time";
import { sessionSlots, activeBookings, membershipOf, plural, previewSessionEdit, slotGrid, sessionStats, today } from "../selectors/core";
import type { SessionPatch } from "../selectors/core";
import { invitationRecipientIssues } from "../selectors/ops";
import { emptyCapture } from "../fixtures/clinical";
import { Ctx, pad } from "./ctx";
import type { ActionResult, Handler } from "./ctx";

const handlers: Record<string, Handler> = {};

const SECTION_COUNT = QUESTIONNAIRE_SECTIONS.length;

function addMessage(c: Ctx, o: { kind: "confirmation" | "invitation"; personId: string; bookingId: string | null; subject: string; programmeId?: ProgrammeId | null }) {
  const { channel, destination, provider } = c.contactFor(o.personId, o.programmeId);
  const n = c.nextNo("message");
  const at = c.stamp();
  c.s.messages.push({
    id: `MSG-${pad(n, 5)}`, logicalId: `LM-${o.kind === "confirmation" ? "C" : "I"}-${o.bookingId || o.personId}-${n}`, kind: o.kind, personId: o.personId, bookingId: o.bookingId, episodeId: null,
    channel, destination, subject: o.subject, status: "delivered",
    attempts: [{ at, outcome: "delivered", reason: null, auto: false }], cohort: null, at, provider, simulated: true,
  });
  return `MSG-${pad(n, 5)}`;
}

/**
 * One queued 24-hour reminder for a booking whose clinic starts more than 24 hours from now, so a
 * later cancellation has a real job to cancel. Inside 24 hours the short-notice rule applies:
 * one confirmation only, and no reminder is created or back-dated. Returns true when one was queued.
 */
function queueReminder(c: Ctx, b: Booking): boolean {
  const s = c.ix().sessionById.get(b.sessionId)!;
  const sendAt = Date.parse(dublinToUtc(s.date, s.start)) - c.s.settings.reminderLeadHours * 3600000;
  if (sendAt <= Date.parse(c.now)) return false;
  if (c.s.messages.some((m) => m.bookingId === b.id && m.kind === "reminder")) return false;
  const { channel, destination, provider } = c.contactFor(b.personId, b.programmeId);
  const n = c.nextNo("message");
  c.s.messages.push({
    id: `MSG-${pad(n, 5)}`, logicalId: `LM-R-${b.id}`, kind: "reminder", personId: b.personId, bookingId: b.id, episodeId: null, channel, destination,
    subject: "Reminder about your Precision Health appointment", status: "queued", attempts: [], cohort: s.date, at: new Date(sendAt).toISOString(), provider, simulated: true,
  });
  return true;
}

/** Withdraw a booking's reminders that have not been delivered: queued ones are cancelled, a failed one is not retried. */
function cancelReminders(c: Ctx, bookingId: string): { queued: number; failed: number } {
  const live = c.s.messages.filter((m) => m.bookingId === bookingId && m.kind === "reminder" && (m.status === "queued" || m.status === "failed"));
  const out = { queued: live.filter((m) => m.status === "queued").length, failed: live.filter((m) => m.status === "failed").length };
  live.forEach((m) => { m.status = "cancelled"; });
  return out;
}
function reminderText(r: { queued: number; failed: number }): string {
  const parts: string[] = [];
  parts.push(r.queued ? `${plural(r.queued, "future simulated reminder job")} cancelled` : "no future reminder job was scheduled for it");
  if (r.failed) parts.push(`${plural(r.failed, "failed reminder")} withdrawn, so ${r.failed === 1 ? "it is" : "they are"} not retried`);
  return parts.join(" and ");
}

/** Who may change a booking: staff with the Manage bookings permission, or the participant for their own booking. */
function bookingActor(c: Ctx, personId: string, what: string): ActionResult | null {
  if (c.persona().isParticipant) return c.selfOnly(personId, what);
  return c.need("bookings.manage", `${what} for participants`);
}

/** The questionnaire and consent belong to the participant: only the participant preview, for its own record, completes them. */
function participantOnly(c: Ctx, personId: string, what: string): ActionResult | null {
  if (!c.persona().isParticipant) return c.fail(`The questionnaire and consent are completed by the participant in the portal preview. Staff cannot ${what} on their behalf.`);
  return c.selfOnly(personId, what);
}

/* ---- portal onboarding ---- */
handlers["portal/saveDraft"] = (c, a: { personId: string; sectionsDone?: number; answers?: Record<string, string | number | boolean>; programmeId?: ProgrammeId }) => {
  const who = participantOnly(c, a.personId, "save the questionnaire"); if (who) return who;
  const m = membershipOf(c.s, a.personId, a.programmeId);
  if (!m) return c.fail(a.programmeId ? "This participant is not on that programme." : "Unknown participant.");
  if (m.questionnaire === "complete") return c.fail("The questionnaire is already complete.");
  const cur = m.draft || { sectionsDone: 0, sectionsTotal: SECTION_COUNT, answers: {} };
  m.draft = { sectionsDone: Math.max(0, Math.min(SECTION_COUNT, a.sectionsDone ?? cur.sectionsDone)), sectionsTotal: SECTION_COUNT, answers: { ...cur.answers, ...(a.answers || {}) } };
  m.questionnaire = "draft";
  if (m.stage === "invited") m.stage = "onboarding";
  return c.ok("Saved. You can resume later.", "info");
};

handlers["portal/completeQuestionnaire"] = (c, a: { personId: string; consent: { service: boolean; data: boolean; sms?: boolean }; programmeId?: ProgrammeId }) => {
  const who = participantOnly(c, a.personId, "complete the questionnaire and consent"); if (who) return who;
  const m = membershipOf(c.s, a.personId, a.programmeId);
  if (!m) return c.fail(a.programmeId ? "This participant is not on that programme." : "Unknown participant.");
  if (m.questionnaire === "complete") return c.fail("The questionnaire and consent are already complete.");
  if (!m.draft || m.draft.sectionsDone < SECTION_COUNT) return c.fail(`Complete all ${SECTION_COUNT} questionnaire sections first. ${m.draft ? m.draft.sectionsDone : 0} done.`);
  if (!a.consent?.service || !a.consent?.data) return c.fail("The two required consent choices must be given before you can continue.");
  m.questionnaire = "complete";
  m.consent = "complete";
  m.consentVersion = "BC-3";
  m.answers = { ...m.draft.answers, consentService: true, consentData: true, consentSms: !!a.consent.sms };
  m.questionnaireCompletedAt = c.stamp();
  c.emit({ verb: "portal.completed", summary: `${c.personName(a.personId)} completed the questionnaire and consent in the portal. A booking can now be confirmed.`, entity: { kind: "person", id: a.personId }, programmeId: m.programmeId, personId: a.personId, simulated: true });
  return c.ok("Questionnaire and consent complete. You can now choose an appointment.", "ok");
};

/* ---- bookings ---- */
function validateSlot(c: Ctx, sessionId: string, slotStart: string, ignoreBookingId?: string): { err: string | null } {
  const s = c.ix().sessionById.get(sessionId);
  if (!s || s.status !== "scheduled") return { err: "That clinic is not open for booking." };
  if (s.date < today(c.s)) return { err: "That clinic has already taken place." };
  if (!sessionSlots(s).some((x) => x.start === slotStart)) return { err: "That time is not a bookable slot. Breaks cannot be booked." };
  if (activeBookings(c.s, sessionId).some((b) => b.slotStart === slotStart && b.id !== ignoreBookingId)) return { err: "That slot was just taken. Choose another." };
  if (Date.parse(dublinToUtc(s.date, slotStart)) <= Date.parse(c.now)) return { err: "That time has already passed." };
  return { err: null };
}

function createBooking(c: Ctx, personId: string, sessionId: string, slotStart: string, replaces: string | null): { booking: Booking } | { err: string } {
  if (!c.ix().personById.has(personId)) return { err: "Unknown participant." };
  const session = c.ix().sessionById.get(sessionId);
  if (!session) return { err: "That clinic is not open for booking." };
  // The membership of the programme this clinic belongs to. A person can be on more than one programme.
  const m = membershipOf(c.s, personId, session.programmeId);
  if (!m) return { err: "This participant is not on that programme." };
  if (m.questionnaire !== "complete" || m.consent !== "complete") return { err: "Complete the required questionnaire and consent before confirming a booking." };
  const v = validateSlot(c, sessionId, slotStart, replaces || undefined);
  if (v.err) return { err: v.err };
  const prog = PROGRAMME_BY_ID[session.programmeId];
  const mine = c.ix().bookingsByPerson.get(personId) || [];
  const dupe = mine.find((b) => b.status === "confirmed" && b.programmeId === session.programmeId && b.appointmentTypeId === prog.appointmentTypeId && b.attendance !== "completed" && b.id !== replaces);
  if (dupe) return { err: `There is already an active appointment on this programme (${dupe.id}). Reschedule it instead.` };
  const tpl = c.s.forms.templates.find((t) => t.id === prog.templateId);
  // When the questionnaire was actually completed, not the booking time.
  const earlier = mine.filter((b) => b.programmeId === session.programmeId).map((b) => b.questionnaireCompletedAt).sort().pop();
  const completedAt = m.questionnaireCompletedAt || earlier || c.stamp();
  const n = c.nextNo("booking");
  const booking: Booking = {
    id: `PH-B-${pad(n, 4)}`, personId, programmeId: session.programmeId, sessionId, slotStart, status: "confirmed", attendance: "booked", createdAt: c.stamp(),
    createdVia: c.persona().isParticipant ? "portal" : "admin", appointmentTypeId: prog.appointmentTypeId, formTemplateId: prog.templateId, formVersion: tpl?.currentVersion || "2.0",
    consentVersion: m.consentVersion || "BC-3", questionnaireCompletedAt: completedAt, episodeId: null, replaces, replacedBy: null,
  };
  c.s.bookings.push(booking);
  m.stage = "booked";
  c.inv();
  return { booking };
}

handlers["booking/create"] = (c, a: { personId: string; sessionId: string; slotStart: string }) => {
  const who = bookingActor(c, a.personId, "book appointments"); if (who) return who;
  const r = createBooking(c, a.personId, a.sessionId, a.slotStart, null);
  if ("err" in r) return c.fail(r.err);
  const b = r.booking;
  const s = c.ix().sessionById.get(b.sessionId)!;
  addMessage(c, { kind: "confirmation", personId: b.personId, bookingId: b.id, subject: "Your Precision Health appointment is confirmed", programmeId: b.programmeId });
  const short = !queueReminder(c, b);
  c.emit({
    verb: "booking.confirmed", summary: `${c.personName(b.personId)} booked ${PROGRAMME_BY_ID[b.programmeId].name} on ${fmtDayMonth(s.date)} at ${b.slotStart} (${b.id}). Questionnaire and consent were complete before confirmation.${short ? " Booked inside 24 hours: one confirmation sent, no reminder created." : " One 24-hour reminder is queued (simulated)."}`,
    entity: { kind: "booking", id: b.id }, programmeId: b.programmeId, personId: b.personId, storyId: b.programmeId === "PRG-IBM-26" ? "ST-03" : null,
  });
  return c.ok(`Booked ${fmtDate(s.date)} at ${b.slotStart}. ${short ? "Because it is inside 24 hours, one confirmation was sent and no reminder was created." : "A confirmation was sent and a 24-hour reminder is queued (simulated)."}`, "ok", b.id);
};

handlers["booking/reschedule"] = (c, a: { bookingId: string; sessionId: string; slotStart: string }) => {
  const old = c.ix().bookingById.get(a.bookingId);
  if (!old) return c.fail("Unknown appointment.");
  const who = bookingActor(c, old.personId, "reschedule appointments"); if (who) return who;
  if (old.status !== "confirmed" || old.attendance !== "booked") return c.fail("This booking cannot be rescheduled.");
  const r = createBooking(c, old.personId, a.sessionId, a.slotStart, old.id);
  if ("err" in r) return c.fail(r.err);
  // The replacement is reserved first, then the original is released.
  old.status = "cancelled";
  old.replacedBy = r.booking.id;
  old.cancelReason = "Rescheduled";
  const withdrawn = cancelReminders(c, old.id);
  addMessage(c, { kind: "confirmation", personId: old.personId, bookingId: r.booking.id, subject: "Your Precision Health appointment has been rescheduled", programmeId: r.booking.programmeId });
  const queued = queueReminder(c, r.booking);
  const s = c.ix().sessionById.get(a.sessionId)!;
  c.emit({ verb: "booking.rescheduled", summary: `${c.personName(old.personId)} rescheduled to ${fmtDayMonth(s.date)} at ${a.slotStart} (${r.booking.id}). The original ${old.id} was released after the replacement was reserved: ${reminderText(withdrawn)}.${queued ? " One 24-hour reminder is queued for the new time." : " The new time is inside 24 hours, so no reminder was created."}`, entity: { kind: "booking", id: r.booking.id }, programmeId: old.programmeId, personId: old.personId });
  return c.ok(`Rescheduled to ${fmtDate(s.date)} at ${a.slotStart}. The original slot is free again.`, "ok", r.booking.id);
};

handlers["booking/cancel"] = (c, a: { bookingId: string; reason?: string }) => {
  const b = c.ix().bookingById.get(a.bookingId);
  if (!b) return c.fail("Unknown appointment.");
  const who = bookingActor(c, b.personId, "cancel appointments"); if (who) return who;
  if (b.status !== "confirmed" || b.attendance === "completed") return c.fail("This booking cannot be cancelled.");
  b.status = "cancelled";
  b.cancelReason = (a.reason || "Cancelled").trim();
  // A capture draft started at check-in belongs to nothing once the booking is cancelled.
  delete c.s.captureDrafts[b.id];
  const mem = membershipOf(c.s, b.personId, b.programmeId);
  c.inv();
  const stillBooked = (c.ix().bookingsByPerson.get(b.personId) || []).some((x) => x.status === "confirmed" && x.programmeId === b.programmeId);
  if (mem && !stillBooked) mem.stage = "onboarding";
  const withdrawn = cancelReminders(c, b.id);
  const s = c.ix().sessionById.get(b.sessionId)!;
  c.emit({ verb: "booking.cancelled", summary: `${c.personName(b.personId)} cancelled ${b.id} (${fmtDayMonth(s.date)} ${b.slotStart}). Capacity updated: ${reminderText(withdrawn)}.`, entity: { kind: "booking", id: b.id }, programmeId: b.programmeId, personId: b.personId, storyId: b.programmeId === "PRG-IBM-26" ? "ST-03" : null });
  const jobs = withdrawn.queued ? ` ${plural(withdrawn.queued, "future simulated reminder job")} cancelled.` : " No future reminder job was scheduled for it.";
  const failed = withdrawn.failed ? ` The failed reminder was withdrawn and will not be retried.` : "";
  return c.ok(`Appointment cancelled. The slot is available again.${jobs}${failed}`, "ok");
};

/* ---- nurse clinical workspace ---- */
function captureOf(c: Ctx, bookingId: string): ClinicalCapture | undefined { return c.s.captureDrafts[bookingId]; }
function canWork(c: Ctx, bookingId: string): string | null {
  const b = c.ix().bookingById.get(bookingId);
  if (!b || b.status !== "confirmed") return "Unknown appointment.";
  const s = c.ix().sessionById.get(b.sessionId)!;
  const p = c.persona();
  if (!p.perms.has("clinical.capture")) return `${p.name} cannot capture clinical data.`;
  if (p.role === "clinical_capture" && s.nurseId !== p.id && !s.supportIds.includes(p.id as StaffId)) return `${p.name} is not assigned to this clinic. Capture is limited to your own assignments.`;
  return null;
}

handlers["clinic/checkIn"] = (c, a: { bookingId: string }) => {
  const b = c.ix().bookingById.get(a.bookingId);
  if (!b || b.status !== "confirmed") return c.fail("Unknown appointment.");
  const p = c.persona();
  if (!p.perms.has("clinical.capture") && !p.perms.has("bookings.manage")) return c.fail(`${p.name} cannot check participants in.`);
  const s = c.ix().sessionById.get(b.sessionId)!;
  if (p.role === "clinical_capture" && !p.perms.has("bookings.manage") && s.nurseId !== p.id && !s.supportIds.includes(p.id as StaffId)) {
    return c.fail(`${p.name} is not assigned to this clinic. Its own team or Programme Operations checks participants in.`);
  }
  if (s.date !== today(c.s)) return c.fail("Check-in is only available on the day of the appointment.");
  if (b.attendance !== "booked") return c.fail("This participant is already checked in or completed.");
  b.attendance = "checked_in";
  const cap = emptyCapture("", b.id);
  cap.checkedInAt = c.stamp();
  c.s.captureDrafts[b.id] = cap;
  c.emit({ verb: "clinic.checkin", summary: `${c.first()} checked in ${c.personName(b.personId)} for ${b.slotStart} (${b.id}).`, entity: { kind: "booking", id: b.id }, programmeId: b.programmeId, personId: b.personId });
  return c.ok("Checked in. Confirm identity before any specimen is created.", "ok", b.id);
};

handlers["clinic/confirmIdentity"] = (c, a: { bookingId: string; dob: string; reference: string }) => {
  const blocked = canWork(c, a.bookingId); if (blocked) return c.fail(blocked);
  const cap = captureOf(c, a.bookingId);
  if (!cap) return c.fail("Check the participant in first.");
  const b = c.ix().bookingById.get(a.bookingId)!;
  const person = c.ix().personById.get(b.personId)!;
  const dob = parseIrishDate(a.dob);
  if (!dob || dob !== person.dob) return c.fail("The date of birth given does not match the booking record. Identity not confirmed. A name match alone is never enough.");
  if ((a.reference || "").trim().toUpperCase() !== b.id) return c.fail(`The booking reference does not match. Ask the participant to read it from their confirmation (format ${b.id.slice(0, 5)}....).`);
  cap.identity = [
    { key: "dob", label: "Date of birth", confirmedValue: fmtNumericDate(person.dob), confirmed: true },
    { key: "booking", label: "Booking reference", confirmedValue: b.id, confirmed: true },
  ];
  cap.rev++;
  cap.savedAt = c.stamp();
  return c.ok("Two identifiers confirmed. Specimen creation is unlocked.", "ok");
};

handlers["clinic/saveCapture"] = (c, a: { bookingId: string; baseRev: number; measures?: Partial<Record<MeasureKey, { value: number | null; state: "recorded" | "missing" | "not_done" | "declined"; provenance?: "measured" | "self_reported" }>>; urine?: ClinicalCapture["urine"]; notes?: string }) => {
  const blocked = canWork(c, a.bookingId); if (blocked) return c.fail(blocked);
  const cap = captureOf(c, a.bookingId);
  if (!cap) return c.fail("Check the participant in first.");
  if (a.baseRev !== cap.rev) return { ok: false, conflict: true, tone: "warn", message: `Save conflict: this record changed (revision ${cap.rev}) since you opened it. Your edits were not saved. Reload to merge.` };
  for (const [k, m] of Object.entries(a.measures || {}) as Array<[MeasureKey, NonNullable<typeof a.measures>[MeasureKey]]>) {
    if (!m) continue;
    const err = m.state === "recorded" ? measureError(k, m.value) : null;
    if (err) return c.fail(err);
    // A recorded field left blank is missing, never zero and never accounted for.
    const blank = m.state === "recorded" && (m.value === null || m.value === undefined);
    cap.measures[k] = { value: m.state === "recorded" && !blank ? m.value : null, state: blank ? "missing" : m.state, provenance: m.provenance || cap.measures[k].provenance };
  }
  const errs = captureErrors(cap);
  if (errs.bp) return c.fail(errs.bp);
  if (a.urine !== undefined) cap.urine = a.urine;
  if (a.notes !== undefined) cap.notes = a.notes;
  cap.status = "draft";
  cap.rev++;
  cap.savedAt = c.stamp();
  return c.ok("Saved.", "info");
};

handlers["clinic/toggleChecklist"] = (c, a: { bookingId: string; key: "specimens" | "labels" | "questionnaire" }) => {
  const blocked = canWork(c, a.bookingId); if (blocked) return c.fail(blocked);
  const cap = captureOf(c, a.bookingId);
  if (!cap) return c.fail("Check the participant in first.");
  if ((a.key === "specimens" || a.key === "labels") && cap.identity.some((x) => !x.confirmed)) return c.fail("Confirm identity with two identifiers before creating a specimen or labels.");
  cap.checklist[a.key] = !cap.checklist[a.key];
  cap.rev++;
  return c.ok();
};

handlers["clinic/complete"] = (c, a: { bookingId: string }) => {
  const blocked = canWork(c, a.bookingId); if (blocked) return c.fail(blocked);
  const b = c.ix().bookingById.get(a.bookingId)!;
  const cap = captureOf(c, a.bookingId);
  if (!cap) return c.fail("Check the participant in first.");
  if (b.attendance === "completed") return c.fail("This appointment is already completed.");
  const problems: string[] = [];
  if (cap.identity.some((x) => !x.confirmed)) problems.push("identity not confirmed with two identifiers");
  const missing = captureMissing(cap);
  if (missing.length) problems.push(`missing required values: ${missing.join(", ")} (record a value, or mark not done or declined)`);
  const errs = captureErrors(cap);
  if (Object.keys(errs).length) problems.push("a value is outside its allowed range");
  if (!cap.checklist.specimens) problems.push("specimen not created");
  if (!cap.checklist.labels) problems.push("labels not previewed");
  if (problems.length) return c.fail(`Cannot complete yet: ${problems.join("; ")}.`);
  const person = c.ix().personById.get(b.personId)!;
  const n = c.nextNo("episode");
  const epId = `PH-E-${pad(n, 4)}`;
  const tpl = c.s.forms.templates.find((t) => t.id === b.formTemplateId)!;
  const ver = tpl.versions.find((v) => v.version === b.formVersion) || tpl.versions.find((v) => v.version === tpl.currentVersion)!;
  const blocks: Record<string, string> = {};
  ver.blocks.forEach((x) => (blocks[x.blockId] = x.version));
  const collectedAt = c.stamp();
  const specimen: Specimen = { id: `PH-S-${pad(n, 4)}`, episodeId: epId, type: "serum", collectedAt, status: "collected", labelPrinted: true };
  cap.status = "complete";
  cap.completedAt = collectedAt;
  cap.rev++;
  cap.savedAt = collectedAt;
  const ep: Episode = {
    id: epId, personId: b.personId, programmeId: b.programmeId, bookingId: b.id, sessionId: b.sessionId, collectedAt, formSnapshot: { templateId: tpl.id, version: ver.version, blocks }, capture: cap,
    specimenIds: [specimen.id], expectedTests: CORE_PANEL.map((code) => ({ code, addOn: false })), reportState: "awaiting_results", hold: null, readyAt: null, reviewAssigneeId: null,
    reportVersionIds: [], followUpIds: [], flagAckBy: null,
  };
  c.s.episodes.push(ep);
  c.s.specimens.push(specimen);
  delete c.s.captureDrafts[b.id];
  b.attendance = "completed";
  b.episodeId = epId;
  c.inv();
  c.emit({ verb: "clinic.completed", summary: `${c.first()} completed the appointment for ${person.given} ${person.family} (${b.id}). Episode ${epId} is awaiting expected results. No report was released.`, entity: { kind: "episode", id: epId }, programmeId: b.programmeId, personId: b.personId });
  return c.ok(`Appointment completed. ${epId} is awaiting results. Completing an appointment never releases a report.`, "ok", epId);
};

/* ---- session edits ---- */
handlers["session/apply"] = (c, a: { sessionId: string; patch: { start?: string; end?: string; breaks?: Array<{ start: string; end: string }>; nurseId?: string; supportIds?: string[]; room?: string; date?: string }; moveImpacted?: boolean }) => {
  const d = c.need("bookings.manage", "edit a clinic session"); if (d) return d;
  const s = c.ix().sessionById.get(a.sessionId);
  if (!s) return c.fail("Unknown session.");
  const patch = (a.patch || {}) as SessionPatch;
  const pv = previewSessionEdit(c.s, a.sessionId, patch);
  // Completed and past sessions, invalid nurses or dates, overlaps and started appointments are refused with the reason.
  if (pv.errors.length) return c.fail(pv.errors.slice(0, 2).join(" "));
  if (pv.impacted.length && !a.moveImpacted) return c.fail(`${pv.impacted.length} booked appointment${pv.impacted.length === 1 ? "" : "s"} would no longer fit. Review the impact and choose to move them explicitly. Nothing is deleted.`);
  let moved = 0;
  if (pv.impacted.length) {
    const next = { ...s, ...patch };
    const now = Date.parse(c.now);
    const free = pv.slots.filter((sl) => !activeBookings(c.s, s.id).some((b) => b.slotStart === sl.start) && Date.parse(dublinToUtc(next.date, sl.start)) > now);
    for (const imp of pv.impacted) {
      const target = free.shift();
      if (!target) return c.fail("Not enough free valid slots to keep every booking.");
      imp.booking.slotStart = target.start;
      moved++;
      addMessage(c, { kind: "confirmation", personId: imp.booking.personId, bookingId: imp.booking.id, subject: "Your Precision Health appointment time has changed", programmeId: imp.booking.programmeId });
    }
  }
  Object.assign(s, patch);
  // Queued reminders and the reminder job follow the clinic start time.
  const sendAt = new Date(Date.parse(dublinToUtc(s.date, s.start)) - c.s.settings.reminderLeadHours * 3600000).toISOString();
  const ids = new Set(activeBookings(c.s, s.id).map((b) => b.id));
  c.s.messages.forEach((m) => { if (m.kind === "reminder" && m.status === "queued" && m.bookingId && ids.has(m.bookingId)) m.at = sendAt; });
  const job = c.s.jobs.find((j) => j.id === `JOB-REM-${s.id}`);
  if (job && job.nextRunAt) job.nextRunAt = sendAt;
  c.inv();
  c.emit({ verb: "session.edited", summary: `${c.first()} edited ${s.id}: ${pv.capacity} bookable slots${moved ? `, ${moved} appointment${moved === 1 ? "" : "s"} moved to valid slots with simulated notices` : ""}. No appointment was deleted.`, entity: { kind: "session", id: s.id }, programmeId: s.programmeId });
  return c.ok(`Session updated: ${pv.capacity} slots.${moved ? ` ${moved} appointments moved to valid slots.` : ""}`, "ok");
};

/* ---- invitations ---- */
handlers["invite/createCode"] = (c, a: { programmeId: string; label: string; expiresOn: string; eligibility: string }) => {
  const d = c.need("invitations.manage", "create invitation codes"); if (d) return d;
  const prog = PROGRAMME_BY_ID[a.programmeId as keyof typeof PROGRAMME_BY_ID];
  if (!prog) return c.fail("Choose a programme.");
  if (!(a.label || "").trim()) return c.fail("Give the code a label.");
  if (!isRealDate(a.expiresOn || "")) return c.fail("Choose an expiry date.");
  if (a.expiresOn < today(c.s)) return c.fail("The expiry date is in the past. Choose today or a later date.");
  const n = c.nextNo("code");
  const code = `DEMO-${prog.code}-26-${String.fromCharCode(64 + ((n - 5) % 26 || 26))}${n}`;
  const rec: InvitationCode = {
    id: `IC-${prog.code}-${n}`, programmeId: prog.id, code, label: a.label.trim(), createdBy: c.persona().id as StaffId, createdAt: c.stamp(), expiresOn: a.expiresOn,
    eligibility: (a.eligibility || "").trim() || prog.eligibility, status: "active", linkText: `portal.precisionhealth.example.invalid/i/${code}`,
  };
  c.s.invitationCodes.push(rec);
  c.emit({ verb: "invitation.code", summary: `${c.first()} created invitation code ${code} for ${prog.name}. Codes are created centrally. Using a code does not reveal the employer's participant list.`, entity: { kind: "programme", id: prog.id }, programmeId: prog.id });
  return c.ok(`Code ${code} created. It is a local record only. Sending is simulated and needs confirmation.`, "ok", rec.id);
};

handlers["invite/revokeCode"] = (c, a: { codeId: string }) => {
  const d = c.need("invitations.manage", "revoke invitation codes"); if (d) return d;
  const code = c.s.invitationCodes.find((x) => x.id === a.codeId);
  if (!code || code.status !== "active") return c.fail("This code is not active.");
  code.status = "revoked";
  c.emit({ verb: "invitation.revoked", summary: `${c.first()} revoked invitation code ${code.code}.`, entity: { kind: "programme", id: code.programmeId }, programmeId: code.programmeId });
  return c.ok(`Code ${code.code} revoked.`, "ok");
};

const sameSet = (x: string[], y: string[]) => x.length === y.length && new Set(x).size === new Set(y).size && x.every((id) => y.includes(id));

handlers["invite/prepareDraft"] = (c, a: { programmeId: string; title: string; recipientIds: string[]; message: string }) => {
  const d = c.need("invitations.manage", "prepare invitation drafts"); if (d) return d;
  const prog = PROGRAMME_BY_ID[a.programmeId as keyof typeof PROGRAMME_BY_ID];
  if (!prog) return c.fail("Choose a programme.");
  if (!a.recipientIds?.length) return c.fail("Choose at least one eligible recipient.");
  if (!(a.title || "").trim() || !(a.message || "").trim()) return c.fail("Add a title and a message.");
  if (HEALTH_INFO_PATTERN.test(a.message) || HEALTH_INFO_PATTERN.test(a.title)) return c.fail("Invitation messages must not contain health information.");
  const eligible = new Set(c.s.memberships.filter((m) => m.programmeId === prog.id && m.eligible && m.stage !== "booked").map((m) => m.personId));
  if (a.recipientIds.some((id) => !eligible.has(id))) return c.fail("Every recipient must be eligible for this programme and not already booked.");
  // A repeated click returns the draft already waiting instead of creating a second one.
  const same = c.s.invitationDrafts.find((x) => x.programmeId === prog.id && (x.status === "pending_approval" || x.status === "draft")
    && x.title === a.title.trim() && x.message === a.message.trim() && sameSet(x.recipientIds, a.recipientIds));
  if (same) return c.ok(`Draft ${same.id} with these recipients is already waiting for approval. Nothing new was created.`, "info", same.id);
  const n = c.nextNo("invitation");
  const apr = c.nextNo("approval");
  const id = `INV-${prog.code}-${pad(n, 2)}`;
  c.s.invitationDrafts.push({
    id, programmeId: prog.id, title: a.title.trim(), preparedBy: c.persona().id as StaffId, preparedAt: c.stamp(), recipientIds: a.recipientIds.slice(), message: a.message.trim(),
    status: "pending_approval", approvalId: `APR-${pad(apr, 4)}`, decidedBy: null, decidedAt: null,
  });
  c.s.approvals.push({ id: `APR-${pad(apr, 4)}`, type: "invitation_prep", title: `${prog.code} invitation list (draft)`, requestedBy: c.persona().id as StaffId, reviewerId: "stephen", status: "pending", target: { kind: "invitation", id }, createdAt: c.stamp(), decidedAt: null, decidedBy: null });
  c.emit({ verb: "invitation.prepared", summary: `${c.first()} prepared a draft invitation list for ${prog.name} (${a.recipientIds.length} recipients). Awaiting approval.`, entity: { kind: "invitation", id }, programmeId: prog.id, storyId: prog.id === "PRG-IBM-26" ? "ST-03" : null });
  return c.ok(`Draft ${id} prepared and sent for approval. Nothing is sent until it is approved.`, "ok", id);
};

handlers["invite/decide"] = (c, a: { draftId: string; approve: boolean; confirmedRecipientIds?: string[]; note?: string }) => {
  const d = c.need("invitations.approve", "approve invitation sends"); if (d) return d;
  const draft = c.s.invitationDrafts.find((x) => x.id === a.draftId);
  if (!draft || (draft.status !== "pending_approval" && draft.status !== "draft")) return c.fail("This invitation draft was already decided.");
  const prog = PROGRAMME_BY_ID[draft.programmeId];
  const storyId = draft.programmeId === "PRG-IBM-26" ? "ST-03" : null;
  const approval = c.s.approvals.find((x) => x.id === draft.approvalId);
  if (!a.approve) {
    draft.status = "rejected"; draft.decidedBy = c.persona().id as StaffId; draft.decidedAt = c.stamp();
    if (approval) { approval.status = "rejected"; approval.decidedAt = draft.decidedAt; approval.decidedBy = draft.decidedBy; }
    c.emit({ verb: "invitation.rejected", summary: `${c.first()} rejected the draft invitation list for ${prog.name}.`, entity: { kind: "invitation", id: draft.id }, programmeId: draft.programmeId, storyId });
    return c.ok("Draft rejected. Nothing was sent.", "info");
  }
  const confirmed = a.confirmedRecipientIds || [];
  const same = confirmed.length === draft.recipientIds.length && draft.recipientIds.every((id) => confirmed.includes(id));
  if (!same) return c.fail("Confirm the recipients in the list before sending. The confirmed recipients must match the draft.");
  // The approval's own prerequisites: every recipient still eligible and not booked, no health information.
  const issues = invitationRecipientIssues(c.s, draft);
  if (issues.length) {
    const ids = issues.slice(0, 3).map((x) => x.personId).join(", ") + (issues.length > 3 ? `, and ${issues.length - 3} more` : "");
    return c.fail(`${plural(issues.length, "recipient")} ${issues.length === 1 ? "is" : "are"} no longer eligible or already booked (${ids}). Reject this draft and prepare a new list without them.`);
  }
  if (HEALTH_INFO_PATTERN.test(draft.message) || HEALTH_INFO_PATTERN.test(draft.title)) return c.fail("The message contains health information. Reject it and prepare a new draft.");
  for (const pid of draft.recipientIds) addMessage(c, { kind: "invitation", personId: pid, bookingId: null, subject: draft.title, programmeId: draft.programmeId });
  draft.status = "approved_simulated_sent"; draft.decidedBy = c.persona().id as StaffId; draft.decidedAt = c.stamp();
  if (approval) { approval.status = "approved"; approval.decidedAt = draft.decidedAt; approval.decidedBy = draft.decidedBy; }
  c.emit({ verb: "invitation.sent", summary: `${c.first()} approved the ${prog.code} invitation list. Simulated send to ${draft.recipientIds.length} confirmed recipients. Nothing was actually sent. Invitees still need a complete questionnaire before they can confirm a booking.`, entity: { kind: "invitation", id: draft.id }, programmeId: draft.programmeId, storyId, simulated: true });
  return c.ok(`Approved. Simulated send to ${draft.recipientIds.length} recipients. No message was sent.`, "ok");
};

export const bookingHandlers = handlers;
export { slotGrid, sessionStats };
