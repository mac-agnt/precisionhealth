/* Portal admin actions. Staff actions need the portal.admin permission, give a reason where the
   specification asks for one (MFA reset, lock, unlock, assisted onboarding, contact change, support
   preview, withdrawal) and write one activity event each. Consent and privacy notice versions are
   drafted by an administrator and published only after a different approver signs off. The
   participant preview adds its own sign-in, second-factor and report delivery events.
   Registered with registerHandlers, the same pattern page modules use. Nothing is sent. */
import type { AssistedMethod, Id, PortalAccountRecord, PortalDocVersion, ProgrammeId, ReportDeliveryMode, StaffId } from "../types";
import { PROGRAMME_BY_ID } from "../constants";
import { registerHandlers } from "../reducer";
import { membershipOf, plural } from "../selectors/core";
import { fmtDate, fmtTime, hoursBetween } from "../time";
import {
  ACCOUNT_STATUS_LABEL, ASSISTED_METHOD_LABEL, DELIVERY_MODE_LABEL, DOC_LABEL, DOC_VERSION_PATTERN, FAILED_SIGNIN_LIMIT, IRISH_MOBILE, SYNTHETIC_EMAIL,
  TEMPLATE_KIND_LABEL, accountRow, checkTemplate, clinicalWords, contentChanges, contentErrors, currentDoc, docAcceptance, docVersions, ensurePortal,
  inviteExpiry, maskIrishMobile, pendingDoc, personalInviteCode, personalInviteWorks, portalAccessFor, portalCodeProblem, portalContent, templateById,
  templateFor,
} from "../portalAdmin";
import type { ContentFields } from "../portalAdmin";
import { pad } from "./ctx";
import type { ActionResult, Ctx, Handler } from "./ctx";

const REASON_MIN = 5;

function staffAdmin(c: Ctx, what: string): ActionResult | null {
  return c.staffOnly(what) || c.need("portal.admin", what);
}
/** A reason is required and kept in the audit log, so it must not carry clinical detail. */
function reasonProblem(c: Ctx, reason: string | undefined, what: string): ActionResult | null {
  const r = (reason || "").trim();
  if (r.length < REASON_MIN) return c.fail(`Give a reason to ${what}. It is kept in the audit log.`);
  if (r.length > 240) return c.fail("Keep the reason to 240 characters.");
  const words = clinicalWords(r);
  if (words.length) return c.fail(`Keep clinical details out of the reason (${words.join(", ")}). The audit log is read by non-clinical staff.`);
  return null;
}
function participantSelf(c: Ctx, personId: Id, what: string): ActionResult | null {
  if (!c.persona().isParticipant) return c.fail(`Only the participant can ${what}, in the portal preview.`);
  return c.selfOnly(personId, what);
}
function recordOf(c: Ctx, personId: Id): PortalAccountRecord {
  const p = ensurePortal(c.s);
  if (!p.accounts[personId]) p.accounts[personId] = {};
  return p.accounts[personId];
}
const me = (c: Ctx) => c.persona().id as StaffId;
const person = (personId: Id) => ({ kind: "person" as const, id: personId });

/* ---- account actions (staff) ---- */
const resendInvitation: Handler<{ personId: Id }> = (c, a) => {
  const d = staffAdmin(c, "resend portal invitations"); if (d) return d;
  const row = accountRow(c.s, a.personId);
  if (!row) return c.fail("Unknown participant.");
  const name = c.personName(a.personId);
  if (row.withdrawn) return c.fail(`${name} withdrew from the programme. Invitations stop after a withdrawal.`);
  if (row.status === "mfa_enrolled" || row.status === "locked") return c.fail(`${name} already has a portal account (${ACCOUNT_STATUS_LABEL[row.status]}). Use Reset sign-in and MFA or Unlock instead.`);
  const r = recordOf(c, a.personId);
  const at = c.stamp();
  if (r.personalInvite && personalInviteWorks(c.s, r) && hoursBetween(r.personalInvite.sentAt, at) < 1) {
    return c.fail(`A personal link went to ${name} at ${fmtTime(r.personalInvite.sentAt)}. Wait an hour before sending another, so the participant is not sent duplicates.`);
  }
  const { channel, destination, provider } = c.contactFor(a.personId, row.programme.id);
  const n = c.nextNo("message");
  const id = `MSG-${pad(n, 5)}`;
  const code = personalInviteCode(a.personId, c.nextNo("personalInvite"));
  c.s.messages.push({
    id, logicalId: `LM-I-${a.personId}-${n}`, kind: "invitation", personId: a.personId, bookingId: null, episodeId: null, channel, destination,
    subject: templateFor(c.s, "invitation", "email")?.subject || "Your Precision Health screening invitation", status: "delivered",
    attempts: [{ at, outcome: "delivered", reason: null, auto: false }], cohort: null, at, provider, simulated: true,
  });
  r.personalInvite = { code, sentAt: at, expiresOn: inviteExpiry(at), messageId: id, by: me(c) };
  c.emit({
    verb: "portaladmin.invitation_resent", entity: person(a.personId), programmeId: row.programme.id, personId: a.personId, simulated: true,
    summary: `${c.first()} resent the portal invitation to ${name} by ${channel === "sms" ? "SMS" : "email"} (simulated). Personal link ${code}, valid to ${fmtDate(r.personalInvite.expiresOn)}. Nothing was sent.`,
  });
  return c.ok(`Invitation resent to ${name} by ${channel === "sms" ? "SMS" : "email"} (simulated). Personal link ${code} works until ${fmtDate(r.personalInvite.expiresOn)}.`, "ok", id);
};

const resetMfa: Handler<{ personId: Id; reason: string }> = (c, a) => {
  const d = staffAdmin(c, "reset portal sign-in and MFA"); if (d) return d;
  const row = accountRow(c.s, a.personId);
  if (!row) return c.fail("Unknown participant.");
  const name = c.personName(a.personId);
  if (row.status === "invited" || row.status === "not_invited") return c.fail(`${name} has no portal account yet, so there is nothing to reset.`);
  const why = reasonProblem(c, a.reason, "reset sign-in and MFA"); if (why) return why;
  const r = recordOf(c, a.personId);
  r.mfaReset = { at: c.stamp(), by: me(c), reason: a.reason.trim() };
  r.mfaReenrolledAt = null;
  r.failedSignIns = 0;
  c.emit({
    verb: "portaladmin.mfa_reset", entity: person(a.personId), programmeId: row.programme.id, personId: a.personId,
    summary: `${c.first()} reset portal sign-in and MFA for ${name}. Reason: ${a.reason.trim()}. Every portal session is signed out and a second factor must be set up again at the next sign-in.${r.lock ? " The account stays locked until someone unlocks it." : ""}`,
  });
  return c.ok(`Sign-in and MFA reset for ${name}. They set up a second factor again at the next sign-in.`, "ok");
};

const lockAccount: Handler<{ personId: Id; reason: string }> = (c, a) => {
  const d = staffAdmin(c, "lock portal accounts"); if (d) return d;
  const row = accountRow(c.s, a.personId);
  if (!row) return c.fail("Unknown participant.");
  const name = c.personName(a.personId);
  if (row.status === "locked") return c.fail(`${name}'s account is already locked.`);
  const why = reasonProblem(c, a.reason, "lock the account"); if (why) return why;
  const r = recordOf(c, a.personId);
  r.lock = { at: c.stamp(), by: me(c), reason: a.reason.trim() };
  c.emit({
    verb: "portaladmin.locked", entity: person(a.personId), programmeId: row.programme.id, personId: a.personId,
    summary: `${c.first()} locked ${name}'s portal account. Reason: ${a.reason.trim()}. Sign-in is blocked; bookings and records are unchanged.`,
  });
  return c.ok(`${name}'s portal account is locked. Bookings and records are unchanged.`, "ok");
};

const unlockAccount: Handler<{ personId: Id; reason: string }> = (c, a) => {
  const d = staffAdmin(c, "unlock portal accounts"); if (d) return d;
  const row = accountRow(c.s, a.personId);
  if (!row) return c.fail("Unknown participant.");
  const name = c.personName(a.personId);
  if (row.status !== "locked") return c.fail(`${name}'s account is not locked.`);
  const why = reasonProblem(c, a.reason, "unlock the account"); if (why) return why;
  const r = recordOf(c, a.personId);
  const was = r.lock;
  r.lock = null;
  r.failedSignIns = 0;
  c.emit({
    verb: "portaladmin.unlocked", entity: person(a.personId), programmeId: row.programme.id, personId: a.personId,
    summary: `${c.first()} unlocked ${name}'s portal account${was ? `, locked since ${fmtDate(was.at)}` : ""}. Reason: ${a.reason.trim()}. Failed sign-in count reset.`,
  });
  return c.ok(`${name} can sign in again.`, "ok");
};

const ASSISTED: AssistedMethod[] = ["phone", "in_person", "paper"];
const assistedOnboarding: Handler<{ personId: Id; reason: string; method: AssistedMethod }> = (c, a) => {
  const d = staffAdmin(c, "start assisted onboarding"); if (d) return d;
  const row = accountRow(c.s, a.personId);
  if (!row) return c.fail("Unknown participant.");
  const name = c.personName(a.personId);
  if (row.withdrawn) return c.fail(`${name} withdrew from the programme.`);
  if (row.status !== "invited" && row.status !== "not_invited") return c.fail(`${name} already has a portal account (${ACCOUNT_STATUS_LABEL[row.status]}). Assisted onboarding is for people who have not started.`);
  if (!ASSISTED.includes(a.method)) return c.fail("Choose how you are helping: by phone, in person or with a paper form.");
  const why = reasonProblem(c, a.reason, "start assisted onboarding"); if (why) return why;
  const r = recordOf(c, a.personId);
  const at = c.stamp();
  r.assisted = { at, by: me(c), reason: a.reason.trim(), method: a.method };
  r.registeredAt = at;
  r.registeredVia = "assisted";
  c.emit({
    verb: "portaladmin.assisted", entity: person(a.personId), programmeId: row.programme.id, personId: a.personId,
    summary: `${c.first()} started assisted onboarding for ${name} (${ASSISTED_METHOD_LABEL[a.method].toLowerCase()}). Reason: ${a.reason.trim()}. The participant gives consent and answers the questionnaire themselves with staff help; staff never answer for them.`,
  });
  return c.ok(`Assisted onboarding started for ${name}. The account is set up; consent and the questionnaire stay with the participant.`, "ok");
};

const updateContact: Handler<{ personId: Id; email?: string; mobile?: string; reason: string; verified: boolean }> = (c, a) => {
  const d = staffAdmin(c, "update participant contact details"); if (d) return d;
  const p = c.ix().personById.get(a.personId);
  if (!p) return c.fail("Unknown participant.");
  const name = `${p.given} ${p.family}`;
  const changes: string[] = [];
  const email = (a.email ?? "").trim().toLowerCase();
  const mobile = (a.mobile ?? "").replace(/[\s()-]/g, "");
  if (email && email !== p.email.toLowerCase()) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return c.fail("Enter an email address in the format name@example.com.");
    if (!SYNTHETIC_EMAIL.test(email)) return c.fail("This demo holds synthetic people only. Use an address at example.com or example.invalid.");
    changes.push("email");
  }
  if (mobile) {
    if (!IRISH_MOBILE.test(mobile)) return c.fail("Enter an Irish mobile in the format 08x1234567, for example 0871234567.");
    if (maskIrishMobile(mobile) !== p.phone) changes.push("mobile");
  }
  if (!changes.length) return c.fail("Nothing changed. Enter a new email or mobile.");
  if (!a.verified) return c.fail("Confirm the participant read back the verification code before saving. Contact details are verified before they are used.");
  const why = reasonProblem(c, a.reason, "change contact details"); if (why) return why;
  if (changes.includes("email")) p.email = email;
  if (changes.includes("mobile")) p.phone = maskIrishMobile(mobile);
  recordOf(c, a.personId).contactUpdatedAt = c.stamp();
  c.inv();
  const m = membershipOf(c.s, a.personId);
  c.emit({
    verb: "portaladmin.contact_updated", entity: person(a.personId), programmeId: m?.programmeId || p.programmeId, personId: a.personId,
    summary: `${c.first()} updated ${name}'s verified ${changes.join(" and ")} after a verification code was confirmed (simulated). Reason: ${a.reason.trim()}. Future messages use the new details; messages already sent are unchanged.`,
  });
  return c.ok(`${name}'s ${changes.join(" and ")} updated and verified. Future messages use the new details.`, "ok");
};

const recordPreview: Handler<{ personId: Id; reason: string }> = (c, a) => {
  const d = staffAdmin(c, "preview the portal as a participant"); if (d) return d;
  const row = accountRow(c.s, a.personId);
  if (!row) return c.fail("Unknown participant.");
  const name = c.personName(a.personId);
  if (row.report.releasedAt && !c.can("clinical.view")) {
    return c.fail(`${name} has a released report, and the portal preview would show its values. ${c.persona().name} (${c.persona().roleLabel}) cannot see clinical values, so a clinical colleague needs to do this preview.`);
  }
  const why = reasonProblem(c, a.reason, "open a support preview"); if (why) return why;
  c.emit({
    verb: "portaladmin.preview", entity: person(a.personId), programmeId: row.programme.id, personId: a.personId,
    summary: `${c.first()} opened the participant portal preview as ${name} for support. Reason: ${a.reason.trim()}. Recorded as support access; anything done in the preview is logged as the participant preview.`,
  });
  return c.ok(`Support preview recorded. Opening the portal as ${name}.`, "info");
};

const withdraw: Handler<{ personId: Id; reason: string }> = (c, a) => {
  const d = staffAdmin(c, "record a withdrawal"); if (d) return d;
  const row = accountRow(c.s, a.personId);
  if (!row) return c.fail("Unknown participant.");
  const name = c.personName(a.personId);
  if (row.withdrawn) return c.fail(`${name} has already withdrawn.`);
  const mine = c.s.bookings.filter((b) => b.personId === a.personId && b.programmeId === row.programme.id && b.status === "confirmed");
  if (mine.some((b) => b.attendance === "checked_in" || b.attendance === "in_progress")) return c.fail(`${name} is at a clinic now. Finish or close the appointment first.`);
  const why = reasonProblem(c, a.reason, "record the withdrawal"); if (why) return why;
  const cancelled: Id[] = [];
  let reminders = 0;
  for (const b of mine.filter((x) => x.attendance === "booked")) {
    b.status = "cancelled";
    b.cancelReason = "Withdrawn from programme";
    delete c.s.captureDrafts[b.id];
    for (const m of c.s.messages) if (m.bookingId === b.id && m.kind === "reminder" && (m.status === "queued" || m.status === "failed")) { m.status = "cancelled"; reminders++; }
    cancelled.push(b.id);
  }
  // Same rule as a cancellation: with no confirmed booking left the membership is back to onboarding.
  const mem = c.s.memberships.find((m) => m.id === row.membership.id);
  if (mem && cancelled.length && !c.s.bookings.some((b) => b.personId === a.personId && b.programmeId === row.programme.id && b.status === "confirmed")) mem.stage = "onboarding";
  recordOf(c, a.personId).withdrawn = { at: c.stamp(), by: me(c), reason: a.reason.trim(), cancelledBookingIds: cancelled };
  c.inv();
  const bk = cancelled.length ? ` ${plural(cancelled.length, "upcoming appointment")} cancelled (${cancelled.join(", ")})${reminders ? ` and ${plural(reminders, "reminder")} withdrawn` : ""}.` : " No upcoming appointment to cancel.";
  c.emit({
    verb: "portaladmin.withdrawn", entity: person(a.personId), programmeId: row.programme.id, personId: a.personId,
    summary: `${c.first()} recorded ${name}'s withdrawal from ${row.programme.name}. Reason: ${a.reason.trim()}.${bk} Future participation stops. Nothing was erased: consent, questionnaire, screening and report records stay under the retention schedule.`,
  });
  return c.ok(`Withdrawal recorded for ${name}.${bk} Records are kept under the retention schedule.`, "ok");
};

/* ---- programme content (staff) ---- */
const saveContent: Handler<{ programmeId: ProgrammeId; fields: ContentFields; note?: string }> = (c, a) => {
  const d = staffAdmin(c, "change portal content"); if (d) return d;
  const prog = PROGRAMME_BY_ID[a.programmeId];
  if (!prog) return c.fail("Choose a programme.");
  const f = a.fields;
  const fields: ContentFields = {
    heading: f.heading.trim(), venueLine: f.venueLine.trim(), welcome: f.welcome.trim(), supportEmail: f.supportEmail.trim(), supportPhone: f.supportPhone.trim(),
    prep: f.prep.map((x) => x.trim()).filter(Boolean), cancelCutoffHours: f.cancelCutoffHours, rescheduleCutoffHours: f.rescheduleCutoffHours, holdMinutes: f.holdMinutes,
    oneActiveBooking: f.oneActiveBooking, reportDelivery: f.reportDelivery, reminderLeadHours: f.reminderLeadHours,
  };
  const errs = contentErrors(fields);
  if (errs.length) return c.fail(errs.slice(0, 2).join(" "));
  const cur = portalContent(c.s, prog.id);
  const changed = contentChanges(cur, fields);
  if (!changed.length) return c.fail("Nothing changed. The portal already shows this content.");
  const note = (a.note || "").trim();
  if (note.length > 200) return c.fail("Keep the change note to 200 characters.");
  const p = ensurePortal(c.s);
  const list = p.content[prog.id] || (p.content[prog.id] = [structuredClone(cur)]);
  const version = cur.version + 1;
  list.push({ ...fields, version, savedAt: c.stamp(), savedBy: me(c), note });
  c.emit({
    verb: "portaladmin.content_saved", entity: { kind: "programme", id: prog.id }, programmeId: prog.id,
    summary: `${c.first()} published participant portal content v${version} for ${prog.name}: ${changed.join(", ")}.${note ? ` Note: ${note}.` : ""} Participants see it now; earlier versions are kept.`,
  });
  return c.ok(`Portal content v${version} published for ${prog.clientName}: ${changed.join(", ")}.`, "ok");
};

/* ---- consent form and privacy notice versions ---- */
const draftDocument: Handler<{ programmeId: ProgrammeId; kind: PortalDocVersion["kind"]; version: string; summary: string }> = (c, a) => {
  const d = staffAdmin(c, "draft consent and privacy notice versions"); if (d) return d;
  const prog = PROGRAMME_BY_ID[a.programmeId];
  if (!prog) return c.fail("Choose a programme.");
  if (a.kind !== "consent" && a.kind !== "privacy") return c.fail("Choose the consent form or the privacy notice.");
  const label = DOC_LABEL[a.kind];
  const version = (a.version || "").trim();
  const pat = DOC_VERSION_PATTERN[a.kind];
  if (!pat.re.test(version)) return c.fail(`Name the ${label.toLowerCase()} version like ${pat.example}.`);
  if (docVersions(c.s, prog.id, a.kind).some((x) => x.version === version)) return c.fail(`${label} ${version} already exists for ${prog.clientName}. Choose a new version number.`);
  const waiting = pendingDoc(c.s, prog.id, a.kind);
  if (waiting) return c.fail(`${label} ${waiting.version} is already waiting for approval. Decide it first.`);
  const summary = (a.summary || "").trim();
  if (summary.length < 10) return c.fail("Describe what changed in this version, in a sentence.");
  if (summary.length > 300) return c.fail("Keep the summary to 300 characters.");
  const p = ensurePortal(c.s);
  const id = `DOC-${prog.id}-${a.kind}-${docVersions(c.s, prog.id, a.kind).length + 1}`;
  p.documents.push({ id, programmeId: prog.id, kind: a.kind, version, status: "pending_approval", summary, draftedBy: me(c), draftedAt: c.stamp(), decidedBy: null, decidedAt: null, publishedAt: null });
  c.emit({
    verb: "portaladmin.document_drafted", entity: { kind: "programme", id: prog.id }, programmeId: prog.id,
    summary: `${c.first()} drafted ${label.toLowerCase()} ${version} for ${prog.name} and sent it for approval: ${summary} Participants keep seeing the current version until it is approved.`,
  });
  return c.ok(`${label} ${version} drafted and waiting for approval. Nothing changes for participants yet.`, "ok", id);
};

const decideDocument: Handler<{ docId: Id; approve: boolean }> = (c, a) => {
  const s = c.staffOnly("approve consent and privacy notice versions"); if (s) return s;
  const d = c.need("portal.approve", "approve consent and privacy notice versions"); if (d) return d;
  const p = ensurePortal(c.s);
  const doc = p.documents.find((x) => x.id === a.docId);
  if (!doc || doc.status !== "pending_approval") return c.fail("This version was already decided.");
  if (doc.draftedBy === me(c)) return c.fail(`You drafted ${doc.version}. A different approver decides it, so no one approves their own wording.`);
  const prog = PROGRAMME_BY_ID[doc.programmeId];
  const label = DOC_LABEL[doc.kind];
  const at = c.stamp();
  doc.decidedBy = me(c);
  doc.decidedAt = at;
  if (!a.approve) {
    doc.status = "rejected";
    c.emit({ verb: "portaladmin.document_decided", entity: { kind: "programme", id: prog.id }, programmeId: prog.id, summary: `${c.first()} rejected ${label.toLowerCase()} ${doc.version} for ${prog.name}. Participants keep the current version.` });
    return c.ok(`${label} ${doc.version} rejected. Nothing changed for participants.`, "info");
  }
  const prev = currentDoc(c.s, prog.id, doc.kind);
  const acc = docAcceptance(c.s, prog.id)[doc.kind].find((x) => x.version === prev?.version)?.n || 0;
  if (prev) prev.status = "superseded";
  doc.status = "published";
  doc.publishedAt = at;
  c.inv();
  c.emit({
    verb: "portaladmin.document_decided", entity: { kind: "programme", id: prog.id }, programmeId: prog.id,
    summary: `${c.first()} approved ${label.toLowerCase()} ${doc.version} for ${prog.name}. New acceptances record ${doc.version}.${prev ? ` The ${plural(acc, "participant")} who accepted ${prev.version} keep that version.` : ""}`,
  });
  return c.ok(`${label} ${doc.version} published for ${prog.clientName}. Earlier acceptances keep their version.`, "ok");
};

/* ---- message templates ---- */
const saveTemplate: Handler<{ templateId: Id; subject: string; body: string }> = (c, a) => {
  const d = staffAdmin(c, "edit message templates"); if (d) return d;
  const p = ensurePortal(c.s);
  const t = p.templates.find((x) => x.id === a.templateId);
  if (!t) return c.fail("Unknown template.");
  const subject = t.channel === "email" ? (a.subject || "").trim() : "";
  const body = (a.body || "").replace(/\r\n/g, "\n").trim();
  const check = checkTemplate(c.s, t.kind, t.channel, subject, body);
  if (check.errors.length) return c.fail(check.errors[0]);
  if (subject === t.subject && body === t.body) return c.fail("Nothing changed.");
  t.history.push({ version: t.version, subject: t.subject, body: t.body, at: t.updatedAt, by: t.updatedBy });
  t.version += 1;
  t.subject = subject;
  t.body = body;
  t.updatedAt = c.stamp();
  t.updatedBy = me(c);
  c.emit({
    verb: "portaladmin.template_saved", entity: null,
    summary: `${c.first()} saved the ${TEMPLATE_KIND_LABEL[t.kind].toLowerCase()} ${t.channel === "sms" ? "SMS" : "email"} template v${t.version}. Checked for clinical words and merge fields. Messages already sent are unchanged.`,
  });
  return c.ok(`Template v${t.version} saved.`, "ok");
};

const testSendTemplate: Handler<{ templateId: Id }> = (c, a) => {
  const d = staffAdmin(c, "send template tests"); if (d) return d;
  const t = templateById(c.s, a.templateId);
  if (!t) return c.fail("Unknown template.");
  const check = checkTemplate(c.s, t.kind, t.channel, t.subject, t.body);
  if (check.errors.length) return c.fail(check.errors[0]);
  c.emit({
    verb: "portaladmin.template_test", entity: null, simulated: true,
    summary: `${c.first()} sent a test of the ${TEMPLATE_KIND_LABEL[t.kind].toLowerCase()} ${t.channel === "sms" ? "SMS" : "email"} template v${t.version} to their own demo ${t.channel === "sms" ? "mobile" : "inbox"}, with sample values (simulated). Nothing was sent.`,
  });
  return c.ok(`Test ${t.channel === "sms" ? "SMS" : "email"} simulated with sample values. Nothing was sent.`, "info");
};

/* ---- the participant preview ---- */
const signIn: Handler<{ personId: Id; code: string }> = (c, a) => {
  const who = participantSelf(c, a.personId, "sign in"); if (who) return who;
  const problem = portalCodeProblem(c.s, a.personId, a.code || "");
  if (problem) return c.fail(problem);
  const m = membershipOf(c.s, a.personId);
  const r = recordOf(c, a.personId);
  const at = c.stamp();
  const personal = !!r.personalInvite && (a.code || "").trim().toUpperCase() === r.personalInvite.code.toUpperCase();
  const first = (!m || m.questionnaire === "not_started") && !r.registeredAt;
  if (first) { r.registeredAt = at; r.registeredVia = "portal"; }
  r.lastSignInAt = at;
  r.failedSignIns = 0;
  c.emit({
    verb: "portal.signin", entity: person(a.personId), programmeId: m?.programmeId || null, personId: a.personId, simulated: true,
    summary: `${c.personName(a.personId)} signed in to the participant portal with ${personal ? "a personal invitation link" : "the programme code"}${first ? " and created an account" : ""} (preview).`,
  });
  return c.ok();
};

const signInFailed: Handler<{ personId: Id }> = (c, a) => {
  const who = participantSelf(c, a.personId, "sign in"); if (who) return who;
  const r = recordOf(c, a.personId);
  if (r.lock) return c.fail(portalAccessFor(c.s, a.personId).message);
  const m = membershipOf(c.s, a.personId);
  r.failedSignIns = (r.failedSignIns || 0) + 1;
  const name = c.personName(a.personId);
  if (r.failedSignIns >= FAILED_SIGNIN_LIMIT) {
    r.lock = { at: c.stamp(), by: "system", reason: `${FAILED_SIGNIN_LIMIT} failed sign-in attempts` };
    c.emit({
      verb: "portal.locked", actor: { kind: "system", id: "system", label: "Portal sign-in" }, entity: person(a.personId), programmeId: m?.programmeId || null, personId: a.personId, simulated: true,
      summary: `${name}'s portal account locked automatically after ${FAILED_SIGNIN_LIMIT} failed sign-in attempts. Staff can unlock it in Participants, Portal admin.`,
    });
    c.inv();
    return c.ok(portalAccessFor(c.s, a.personId).message, "bad");
  }
  c.emit({
    verb: "portal.signin_failed", actor: { kind: "system", id: "system", label: "Portal sign-in" }, entity: person(a.personId), programmeId: m?.programmeId || null, personId: a.personId, simulated: true,
    summary: `A sign-in to ${name}'s portal account failed: the code was not recognised (attempt ${r.failedSignIns} of ${FAILED_SIGNIN_LIMIT}).`,
  });
  return c.ok(`Attempt ${r.failedSignIns} of ${FAILED_SIGNIN_LIMIT}.`, "warn");
};

const reenrolMfa: Handler<{ personId: Id }> = (c, a) => {
  const who = participantSelf(c, a.personId, "set up a second sign-in step"); if (who) return who;
  const access = portalAccessFor(c.s, a.personId);
  if (access.state === "locked") return c.fail(access.message);
  if (access.state !== "needs_mfa") return c.fail("Your second sign-in step is already set up.");
  const r = recordOf(c, a.personId);
  const wasReset = !!r.mfaReset;
  r.mfaReenrolledAt = c.stamp();
  const m = membershipOf(c.s, a.personId);
  c.emit({
    verb: "portal.mfa_enrolled", entity: person(a.personId), programmeId: m?.programmeId || null, personId: a.personId, simulated: true,
    summary: `${c.personName(a.personId)} ${wasReset ? "set up a second sign-in step again after a reset" : "set up a second sign-in step"} in the portal (simulated authenticator app).`,
  });
  return c.ok("Second sign-in step set up.", "ok");
};

const setReportDelivery: Handler<{ personId: Id; mode: ReportDeliveryMode }> = (c, a) => {
  const who = participantSelf(c, a.personId, "choose how the report is delivered"); if (who) return who;
  if (a.mode !== "portal" && a.mode !== "portal_pdf") return c.fail("Choose how you want your report.");
  const m = membershipOf(c.s, a.personId);
  const ans = m ? (m.questionnaire === "complete" ? m.answers : m.draft?.answers || {}) : {};
  if (a.mode === "portal_pdf" && ans.pdMobileType === "none") return c.fail("The encrypted PDF needs a mobile for the access code. You told us you have no Irish mobile.");
  const r = recordOf(c, a.personId);
  const cur = r.reportDelivery || portalContent(c.s, m?.programmeId || "PRG-SISK-26").reportDelivery;
  if (cur === a.mode && r.reportDelivery) return c.fail("That is already your choice.");
  r.reportDelivery = a.mode;
  c.emit({
    verb: "portal.delivery_preference", entity: person(a.personId), programmeId: m?.programmeId || null, personId: a.personId, simulated: true,
    summary: `${c.personName(a.personId)} chose report delivery: ${DELIVERY_MODE_LABEL[a.mode].toLowerCase()} (preview).`,
  });
  return c.ok(`Report delivery set: ${DELIVERY_MODE_LABEL[a.mode]}.`, "ok");
};

registerHandlers({
  "portalAdmin/resendInvitation": resendInvitation,
  "portalAdmin/resetMfa": resetMfa,
  "portalAdmin/lock": lockAccount,
  "portalAdmin/unlock": unlockAccount,
  "portalAdmin/assistedOnboarding": assistedOnboarding,
  "portalAdmin/updateContact": updateContact,
  "portalAdmin/recordPreview": recordPreview,
  "portalAdmin/withdraw": withdraw,
  "portalAdmin/saveContent": saveContent,
  "portalAdmin/draftDocument": draftDocument,
  "portalAdmin/decideDocument": decideDocument,
  "portalAdmin/saveTemplate": saveTemplate,
  "portalAdmin/testSendTemplate": testSendTemplate,
  "portalAdmin/signIn": signIn,
  "portalAdmin/signInFailed": signInFailed,
  "portalAdmin/reenrolMfa": reenrolMfa,
  "portalAdmin/setReportDelivery": setReportDelivery,
});

/** Typed action creators for the portal admin screens and the participant preview. */
export const portalAct = {
  resendInvitation: (personId: Id) => ({ type: "portalAdmin/resendInvitation", personId }),
  resetMfa: (personId: Id, reason: string) => ({ type: "portalAdmin/resetMfa", personId, reason }),
  lock: (personId: Id, reason: string) => ({ type: "portalAdmin/lock", personId, reason }),
  unlock: (personId: Id, reason: string) => ({ type: "portalAdmin/unlock", personId, reason }),
  assistedOnboarding: (personId: Id, reason: string, method: AssistedMethod) => ({ type: "portalAdmin/assistedOnboarding", personId, reason, method }),
  updateContact: (personId: Id, patch: { email?: string; mobile?: string }, reason: string, verified: boolean) => ({ type: "portalAdmin/updateContact", personId, ...patch, reason, verified }),
  recordPreview: (personId: Id, reason: string) => ({ type: "portalAdmin/recordPreview", personId, reason }),
  withdraw: (personId: Id, reason: string) => ({ type: "portalAdmin/withdraw", personId, reason }),
  saveContent: (programmeId: ProgrammeId, fields: ContentFields, note?: string) => ({ type: "portalAdmin/saveContent", programmeId, fields, note }),
  draftDocument: (programmeId: ProgrammeId, kind: PortalDocVersion["kind"], version: string, summary: string) => ({ type: "portalAdmin/draftDocument", programmeId, kind, version, summary }),
  decideDocument: (docId: Id, approve: boolean) => ({ type: "portalAdmin/decideDocument", docId, approve }),
  saveTemplate: (templateId: Id, subject: string, body: string) => ({ type: "portalAdmin/saveTemplate", templateId, subject, body }),
  testSendTemplate: (templateId: Id) => ({ type: "portalAdmin/testSendTemplate", templateId }),
  signIn: (personId: Id, code: string) => ({ type: "portalAdmin/signIn", personId, code }),
  signInFailed: (personId: Id) => ({ type: "portalAdmin/signInFailed", personId }),
  reenrolMfa: (personId: Id) => ({ type: "portalAdmin/reenrolMfa", personId }),
  setReportDelivery: (personId: Id, mode: ReportDeliveryMode) => ({ type: "portalAdmin/setReportDelivery", personId, mode }),
};
