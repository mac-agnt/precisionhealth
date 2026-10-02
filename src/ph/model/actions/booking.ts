/* Booking, portal onboarding, the nurse clinical workspace, session edits and invitations.
   Required consent and questionnaire come before a booking is confirmed. Completing an
   appointment creates an episode awaiting results. It never releases a report. */
import type { Booking, ClinicalCapture, Episode, InvitationCode, Specimen } from "../types";
import { CORE_PANEL, PROGRAMME_BY_ID, QUESTIONNAIRE_SECTIONS } from "../constants";
import { captureErrors, captureMissing, measureError, parseIrishDate } from "../capture";
import type { MeasureKey } from "../capture";
import { dublinToUtc, fmtDate, fmtDayMonth, fmtNumericDate, hoursBetween } from "../time";
import { sessionSlots, activeBookings, previewSessionEdit, slotGrid, sessionStats, today } from "../selectors/core";
import { emptyCapture } from "../fixtures/clinical";
import { Ctx, pad } from "./ctx";
import type { Handler } from "./ctx";

const handlers: Record<string, Handler> = {};

const SECTION_COUNT = QUESTIONNAIRE_SECTIONS.length;

function addMessage(c: Ctx, o: { kind: "confirmation" | "invitation"; personId: string; bookingId: string | null; subject: string }) {
  const person = c.ix().personById.get(o.personId)!;
  const mem = (c.ix().membershipsByPerson.get(o.personId) || [])[0];
  const ch = mem?.contactPreference || "email";
  const n = c.nextNo("message");
  const at = c.stamp();
  c.s.messages.push({
    id: `MSG-${pad(n, 5)}`, logicalId: `LM-${o.kind === "confirmation" ? "C" : "I"}-${o.bookingId || o.personId}-${n}`, kind: o.kind, personId: o.personId, bookingId: o.bookingId, episodeId: null,
    channel: ch, destination: ch === "sms" ? person.phone : person.email.replace(/^(.)[^@]*/, "$1***"), subject: o.subject, status: "delivered",
    attempts: [{ at, outcome: "delivered", reason: null, auto: false }], cohort: null, at, provider: ch === "sms" ? "Esendex" : "Email", simulated: true,
  });
  return `MSG-${pad(n, 5)}`;
}

/* ---- portal onboarding ---- */
handlers["portal/saveDraft"] = (c, a: { personId: string; sectionsDone?: number; answers?: Record<string, string | number | boolean> }) => {
  const m = (c.ix().membershipsByPerson.get(a.personId) || [])[0];
  if (!m) return c.fail("Unknown participant.");
  if (m.questionnaire === "complete") return c.fail("The questionnaire is already complete.");
  const cur = m.draft || { sectionsDone: 0, sectionsTotal: SECTION_COUNT, answers: {} };
  m.draft = { sectionsDone: Math.max(0, Math.min(SECTION_COUNT, a.sectionsDone ?? cur.sectionsDone)), sectionsTotal: SECTION_COUNT, answers: { ...cur.answers, ...(a.answers || {}) } };
  m.questionnaire = "draft";
  if (m.stage === "invited") m.stage = "onboarding";
  return c.ok("Saved. You can resume later.", "info");
};

handlers["portal/completeQuestionnaire"] = (c, a: { personId: string; consent: { service: boolean; data: boolean; sms?: boolean } }) => {
  const m = (c.ix().membershipsByPerson.get(a.personId) || [])[0];
  if (!m) return c.fail("Unknown participant.");
  if (m.questionnaire === "complete") return c.fail("The questionnaire and consent are already complete.");
  if (!m.draft || m.draft.sectionsDone < SECTION_COUNT) return c.fail(`Complete all ${SECTION_COUNT} questionnaire sections first. ${m.draft ? m.draft.sectionsDone : 0} done.`);
  if (!a.consent?.service || !a.consent?.data) return c.fail("The two required consent choices must be given before you can continue.");
  m.questionnaire = "complete";
  m.consent = "complete";
  m.consentVersion = "BC-3";
  m.answers = { ...m.draft.answers, consentService: true, consentData: true, consentSms: !!a.consent.sms };
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
  const m = (c.ix().membershipsByPerson.get(personId) || [])[0];
  if (!m) return { err: "Unknown participant." };
  if (m.questionnaire !== "complete" || m.consent !== "complete") return { err: "Complete the required questionnaire and consent before confirming a booking." };
  const v = validateSlot(c, sessionId, slotStart, replaces || undefined);
  if (v.err) return { err: v.err };
  const session = c.ix().sessionById.get(sessionId)!;
  if (session.programmeId !== m.programmeId) return { err: "This participant is not on that programme." };
  const prog = PROGRAMME_BY_ID[session.programmeId];
  const dupe = (c.ix().bookingsByPerson.get(personId) || []).find((b) => b.status === "confirmed" && b.programmeId === session.programmeId && b.appointmentTypeId === prog.appointmentTypeId && b.attendance !== "completed" && b.id !== replaces);
  if (dupe) return { err: `There is already an active appointment on this programme (${dupe.id}). Reschedule it instead.` };
  const tpl = c.s.forms.templates.find((t) => t.id === prog.templateId);
  const n = c.nextNo("booking");
  const booking: Booking = {
    id: `PH-B-${pad(n, 4)}`, personId, programmeId: session.programmeId, sessionId, slotStart, status: "confirmed", attendance: "booked", createdAt: c.stamp(),
    createdVia: c.persona().isParticipant ? "portal" : "admin", appointmentTypeId: prog.appointmentTypeId, formTemplateId: prog.templateId, formVersion: tpl?.currentVersion || "2.0",
    consentVersion: m.consentVersion || "BC-3", questionnaireCompletedAt: c.stamp(), episodeId: null, replaces, replacedBy: null,
  };
  c.s.bookings.push(booking);
  m.stage = "booked";
  c.inv();
  return { booking };
}

handlers["booking/create"] = (c, a: { personId: string; sessionId: string; slotStart: string }) => {
  const r = createBooking(c, a.personId, a.sessionId, a.slotStart, null);
  if ("err" in r) return c.fail(r.err);
  const b = r.booking;
  const s = c.ix().sessionById.get(b.sessionId)!;
  addMessage(c, { kind: "confirmation", personId: b.personId, bookingId: b.id, subject: "Your Precision Health appointment is confirmed" });
  const hrs = hoursBetween(c.now, dublinToUtc(s.date, b.slotStart));
  const short = hrs < c.s.settings.reminderLeadHours;
  c.emit({
    verb: "booking.confirmed", summary: `${c.personName(b.personId)} booked ${PROGRAMME_BY_ID[b.programmeId].name} on ${fmtDayMonth(s.date)} at ${b.slotStart} (${b.id}). Questionnaire and consent were complete before confirmation.${short ? " Booked inside 24 hours: one confirmation sent, no reminder created." : ""}`,
    entity: { kind: "booking", id: b.id }, programmeId: b.programmeId, personId: b.personId, storyId: b.programmeId === "PRG-IBM-26" ? "ST-03" : null,
  });
  return c.ok(`Booked ${fmtDate(s.date)} at ${b.slotStart}. ${short ? "Because it is inside 24 hours, one confirmation was sent and no reminder was created." : "A confirmation was sent (simulated)."}`, "ok", b.id);
};

handlers["booking/reschedule"] = (c, a: { bookingId: string; sessionId: string; slotStart: string }) => {
  const old = c.ix().bookingById.get(a.bookingId);
  if (!old || old.status !== "confirmed" || old.attendance !== "booked") return c.fail("This booking cannot be rescheduled.");
  const r = createBooking(c, old.personId, a.sessionId, a.slotStart, old.id);
  if ("err" in r) return c.fail(r.err);
  // The replacement is reserved first, then the original is released.
  old.status = "cancelled";
  old.replacedBy = r.booking.id;
  old.cancelReason = "Rescheduled";
  c.s.messages.filter((m) => m.bookingId === old.id && m.status === "queued").forEach((m) => { m.status = "cancelled"; });
  addMessage(c, { kind: "confirmation", personId: old.personId, bookingId: r.booking.id, subject: "Your Precision Health appointment has been rescheduled" });
  const s = c.ix().sessionById.get(a.sessionId)!;
  c.emit({ verb: "booking.rescheduled", summary: `${c.personName(old.personId)} rescheduled to ${fmtDayMonth(s.date)} at ${a.slotStart} (${r.booking.id}). The original ${old.id} was released after the replacement was reserved.`, entity: { kind: "booking", id: r.booking.id }, programmeId: old.programmeId, personId: old.personId });
  return c.ok(`Rescheduled to ${fmtDate(s.date)} at ${a.slotStart}. The original slot is free again.`, "ok", r.booking.id);
};

handlers["booking/cancel"] = (c, a: { bookingId: string; reason?: string }) => {
  const b = c.ix().bookingById.get(a.bookingId);
  if (!b || b.status !== "confirmed" || b.attendance === "completed") return c.fail("This booking cannot be cancelled.");
  b.status = "cancelled";
  b.cancelReason = (a.reason || "Cancelled").trim();
  const mem = (c.ix().membershipsByPerson.get(b.personId) || [])[0];
  c.inv();
  const stillBooked = (c.ix().bookingsByPerson.get(b.personId) || []).some((x) => x.status === "confirmed" && x.programmeId === b.programmeId);
  if (mem && !stillBooked) mem.stage = "onboarding";
  const cancelled = c.s.messages.filter((m) => m.bookingId === b.id && m.status === "queued");
  cancelled.forEach((m) => { m.status = "cancelled"; });
  const s = c.ix().sessionById.get(b.sessionId)!;
  c.emit({ verb: "booking.cancelled", summary: `${c.personName(b.personId)} cancelled ${b.id} (${fmtDayMonth(s.date)} ${b.slotStart}). Capacity updated and ${cancelled.length} future simulated reminder job${cancelled.length === 1 ? "" : "s"} cancelled.`, entity: { kind: "booking", id: b.id }, programmeId: b.programmeId, personId: b.personId, storyId: b.programmeId === "PRG-IBM-26" ? "ST-03" : null });
  return c.ok("Appointment cancelled. The slot is available again and future simulated jobs were cancelled.", "ok");
};

/* ---- nurse clinical workspace ---- */
function captureOf(c: Ctx, bookingId: string): ClinicalCapture | undefined { return c.s.captureDrafts[bookingId]; }
function canWork(c: Ctx, bookingId: string): string | null {
  const b = c.ix().bookingById.get(bookingId);
  if (!b || b.status !== "confirmed") return "Unknown appointment.";
  const s = c.ix().sessionById.get(b.sessionId)!;
  const p = c.persona();
  if (!p.perms.has("clinical.capture")) return `${p.name} cannot capture clinical data.`;
  if (p.role === "clinical_capture" && s.nurseId !== p.id && !s.supportIds.includes(p.id as never)) return `${p.name} is not assigned to this clinic. Capture is limited to your own assignments.`;
  return null;
}

handlers["clinic/checkIn"] = (c, a: { bookingId: string }) => {
  const b = c.ix().bookingById.get(a.bookingId);
  if (!b || b.status !== "confirmed") return c.fail("Unknown appointment.");
  const p = c.persona();
  if (!p.perms.has("clinical.capture") && !p.perms.has("bookings.manage")) return c.fail(`${p.name} cannot check participants in.`);
  const s = c.ix().sessionById.get(b.sessionId)!;
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
    cap.measures[k] = { value: m.state === "recorded" ? m.value : null, state: m.state, provenance: m.provenance || cap.measures[k].provenance };
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
  const s = c.ix().sessionById.get(b.sessionId)!;
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
  void s;
  return c.ok(`Appointment completed. ${epId} is awaiting results. Completing an appointment never releases a report.`, "ok", epId);
};

/* ---- session edits ---- */
handlers["session/apply"] = (c, a: { sessionId: string; patch: { start?: string; end?: string; breaks?: Array<{ start: string; end: string }>; nurseId?: string; supportIds?: string[]; room?: string; date?: string }; moveImpacted?: boolean }) => {
  const d = c.need("bookings.manage", "edit a clinic session"); if (d) return d;
  const s = c.ix().sessionById.get(a.sessionId);
  if (!s) return c.fail("Unknown session.");
  const pv = previewSessionEdit(c.s, a.sessionId, a.patch as never);
  if (pv.overlaps.length) return c.fail("That assignment overlaps another session at the same time. Choose a different nurse or support resource.");
  if (a.patch.date && a.patch.date !== s.date && pv.booked) return c.fail("A session with bookings cannot change date. Participants are not silently moved or deleted. Reschedule them individually.");
  if (pv.impacted.length && !a.moveImpacted) return c.fail(`${pv.impacted.length} booked appointment${pv.impacted.length === 1 ? "" : "s"} would no longer fit. Review the impact and choose to move them explicitly. Nothing is deleted.`);
  if (pv.slots.length < pv.booked) return c.fail("There would be fewer slots than bookings.");
  let moved = 0;
  if (pv.impacted.length) {
    const free = pv.slots.filter((sl) => !activeBookings(c.s, s.id).some((b) => b.slotStart === sl.start));
    for (const imp of pv.impacted) {
      const target = free.shift();
      if (!target) return c.fail("Not enough free valid slots to keep every booking.");
      imp.booking.slotStart = target.start;
      moved++;
      addMessage(c, { kind: "confirmation", personId: imp.booking.personId, bookingId: imp.booking.id, subject: "Your Precision Health appointment time has changed" });
    }
  }
  Object.assign(s, a.patch);
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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a.expiresOn || "")) return c.fail("Choose an expiry date.");
  const n = c.nextNo("code");
  const code = `DEMO-${prog.code}-26-${String.fromCharCode(64 + ((n - 5) % 26 || 26))}${n}`;
  const rec: InvitationCode = {
    id: `IC-${prog.code}-${n}`, programmeId: prog.id, code, label: a.label.trim(), createdBy: c.persona().id as never, createdAt: c.stamp(), expiresOn: a.expiresOn,
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

handlers["invite/prepareDraft"] = (c, a: { programmeId: string; title: string; recipientIds: string[]; message: string }) => {
  const d = c.need("invitations.manage", "prepare invitation drafts"); if (d) return d;
  const prog = PROGRAMME_BY_ID[a.programmeId as keyof typeof PROGRAMME_BY_ID];
  if (!prog) return c.fail("Choose a programme.");
  if (!a.recipientIds?.length) return c.fail("Choose at least one eligible recipient.");
  if (!(a.title || "").trim() || !(a.message || "").trim()) return c.fail("Add a title and a message.");
  if (/(result|diagnos|cholesterol|blood pressure)/i.test(a.message)) return c.fail("Invitation messages must not contain health information.");
  const eligible = new Set(c.s.memberships.filter((m) => m.programmeId === prog.id && m.eligible && m.stage !== "booked").map((m) => m.personId));
  if (a.recipientIds.some((id) => !eligible.has(id))) return c.fail("Every recipient must be eligible for this programme and not already booked.");
  const n = c.nextNo("invitation");
  const apr = c.nextNo("approval");
  const id = `INV-${prog.code}-${pad(n, 2)}`;
  c.s.invitationDrafts.push({
    id, programmeId: prog.id, title: a.title.trim(), preparedBy: c.persona().id as never, preparedAt: c.stamp(), recipientIds: a.recipientIds.slice(), message: a.message.trim(),
    status: "pending_approval", approvalId: `APR-${pad(apr, 4)}`, decidedBy: null, decidedAt: null,
  });
  c.s.approvals.push({ id: `APR-${pad(apr, 4)}`, type: "invitation_prep", title: `${prog.code} invitation list (draft)`, requestedBy: c.persona().id as never, reviewerId: "stephen", status: "pending", target: { kind: "invitation", id }, createdAt: c.stamp(), decidedAt: null, decidedBy: null });
  c.emit({ verb: "invitation.prepared", summary: `${c.first()} prepared a draft invitation list for ${prog.name} (${a.recipientIds.length} recipients). Awaiting approval.`, entity: { kind: "invitation", id }, programmeId: prog.id });
  return c.ok(`Draft ${id} prepared and sent for approval. Nothing is sent until it is approved.`, "ok", id);
};

handlers["invite/decide"] = (c, a: { draftId: string; approve: boolean; confirmedRecipientIds?: string[]; note?: string }) => {
  const d = c.need("invitations.approve", "approve invitation sends"); if (d) return d;
  const draft = c.s.invitationDrafts.find((x) => x.id === a.draftId);
  if (!draft || (draft.status !== "pending_approval" && draft.status !== "draft")) return c.fail("This invitation draft was already decided.");
  const approval = c.s.approvals.find((x) => x.id === draft.approvalId);
  if (!a.approve) {
    draft.status = "rejected"; draft.decidedBy = c.persona().id as never; draft.decidedAt = c.stamp();
    if (approval) { approval.status = "rejected"; approval.decidedAt = draft.decidedAt; approval.decidedBy = draft.decidedBy; }
    c.emit({ verb: "invitation.rejected", summary: `${c.first()} rejected the draft invitation list for ${PROGRAMME_BY_ID[draft.programmeId].name}.`, entity: { kind: "invitation", id: draft.id }, programmeId: draft.programmeId, storyId: "ST-03" });
    return c.ok("Draft rejected. Nothing was sent.", "info");
  }
  const confirmed = a.confirmedRecipientIds || [];
  const same = confirmed.length === draft.recipientIds.length && draft.recipientIds.every((id) => confirmed.includes(id));
  if (!same) return c.fail("Confirm the recipients in the list before sending. The confirmed recipients must match the draft.");
  for (const pid of draft.recipientIds) addMessage(c, { kind: "invitation", personId: pid, bookingId: null, subject: draft.title });
  draft.status = "approved_simulated_sent"; draft.decidedBy = c.persona().id as never; draft.decidedAt = c.stamp();
  if (approval) { approval.status = "approved"; approval.decidedAt = draft.decidedAt; approval.decidedBy = draft.decidedBy; }
  c.emit({ verb: "invitation.sent", summary: `${c.first()} approved the IBM invitation list. Simulated send to ${draft.recipientIds.length} confirmed recipients. Nothing was actually sent. Invitees still need a complete questionnaire before they can confirm a booking.`, entity: { kind: "invitation", id: draft.id }, programmeId: draft.programmeId, storyId: "ST-03", simulated: true });
  return c.ok(`Approved. Simulated send to ${draft.recipientIds.length} recipients. No message was sent.`, "ok");
};

export const bookingHandlers = handlers;
export { slotGrid, sessionStats };
