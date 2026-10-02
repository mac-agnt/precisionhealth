/* What the portal may show: one participant's own records only. Never an employer list,
   never another person, never an unreleased report. Also registers the one action this
   module adds: a participant changing their own contact preference. */
import { dublinToUtc, hoursBetween, ix, memo, registerHandlers, today, versionsOf } from "../../model";
import type { Booking, ClinicSession, Episode, Handler, Id, InvitationCode, Membership, Message, Person, PhState, Programme, ReportVersion } from "../../model";

export type PortalView = "overview" | "appointments" | "questionnaire" | "results" | "account";
export const PORTAL_VIEWS: Array<{ id: PortalView; label: string; icon: "home" | "calendar" | "edit" | "file" | "user" }> = [
  { id: "overview", label: "Overview", icon: "home" },
  { id: "appointments", label: "Appointments", icon: "calendar" },
  { id: "questionnaire", label: "Questionnaire", icon: "edit" },
  { id: "results", label: "My Results", icon: "file" },
  { id: "account", label: "Account", icon: "user" },
];

export interface PortalData {
  person: Person;
  membership: Membership | undefined;
  programme: Programme;
  code: InvitationCode | undefined;
  bookings: Booking[];
  /** Confirmed and not yet completed. At most one per programme. */
  active: Booking | null;
  attended: Booking[];
  episodes: Episode[];
  /** Messages the participant received (delivered), newest first. */
  messages: Message[];
  /** Sessions on the participant's programme still open for booking. */
  sessions: ClinicSession[];
}

export function portalData(state: PhState, personId: Id): PortalData | null {
  return memo(state, "pp:" + personId, () => {
    const I = ix(state);
    const person = I.personById.get(personId);
    if (!person) return null;
    const membership = (I.membershipsByPerson.get(personId) || [])[0];
    const programme = I.programmeById.get(person.programmeId)!;
    const code = membership ? state.invitationCodes.find((c) => c.id === membership.inviteCodeId) : undefined;
    const bookings = (I.bookingsByPerson.get(personId) || []).slice().sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    const active = bookings.find((b) => b.status === "confirmed" && b.attendance !== "completed" && b.attendance !== "no_show") || null;
    const attended = bookings.filter((b) => b.status === "confirmed" && b.attendance === "completed");
    const episodes = (I.episodesByPerson.get(personId) || []).slice().sort((a, b) => (a.collectedAt < b.collectedAt ? 1 : -1));
    const messages = state.messages.filter((m) => m.personId === personId && m.status === "delivered").sort((a, b) => (a.at < b.at ? 1 : -1));
    const t = today(state);
    const sessions = state.sessions.filter((s) => s.programmeId === person.programmeId && s.status === "scheduled" && s.date >= t).sort((a, b) => (a.date < b.date ? -1 : 1));
    return { person, membership, programme, code, bookings, active, attended, episodes, messages, sessions };
  });
}

export function requirements(m: Membership | undefined) {
  const questionnaire = m?.questionnaire === "complete";
  const consent = m?.consent === "complete";
  return { questionnaire, consent, ready: questionnaire && consent, sectionsDone: m?.questionnaire === "complete" ? 5 : m?.draft?.sectionsDone || 0 };
}

/** Released and superseded versions only. Drafts and versions in review are never shown to a participant. */
export function participantVersions(state: PhState, episodeId: Id): ReportVersion[] {
  return versionsOf(state, episodeId).filter((v) => !!v.releasedAt && (v.status === "released" || v.status === "superseded"));
}

export function apptUtc(state: PhState, b: Booking): string {
  const s = ix(state).sessionById.get(b.sessionId)!;
  return dublinToUtc(s.date, b.slotStart);
}
/** True when the booking was made inside the reminder lead time, so no reminder is created for it. */
export function bookedShortNotice(state: PhState, b: Booking): boolean {
  return hoursBetween(b.createdAt, apptUtc(state, b)) < state.settings.reminderLeadHours;
}

/** Normalise "803", "0803" or "ph-p-0803" to PH-P-0803. */
export function normalisePersonId(raw: string): string {
  const t = raw.trim().toUpperCase();
  const m = /^(?:PH-P-)?(\d{1,4})$/.exec(t);
  return m ? `PH-P-${m[1].padStart(4, "0")}` : t;
}

/* ---- the one action this module adds ---- */
const setContactPreference: Handler<{ personId: string; channel: "email" | "sms" }> = (c, a) => {
  const m = (c.ix().membershipsByPerson.get(a.personId) || [])[0];
  if (!m) return c.fail("Unknown participant.");
  const p = c.persona();
  if (p.isParticipant && c.s.session.portalPersonId !== a.personId) return c.fail("You can only change your own contact preference.");
  if (!p.isParticipant) { const d = c.need("bookings.manage", "change a participant's contact preference"); if (d) return d; }
  if (a.channel !== "email" && a.channel !== "sms") return c.fail("Choose email or SMS.");
  if (m.contactPreference === a.channel) return c.fail(`${a.channel === "sms" ? "SMS" : "Email"} is already the contact preference.`);
  const smsConsent = m.answers.consentSms ?? m.draft?.answers.consentSms;
  if (a.channel === "sms" && smsConsent === false) return c.fail("SMS was not consented to. Email stays the contact channel.");
  m.contactPreference = a.channel;
  c.emit({
    verb: "contact.preference", summary: `${c.personName(a.personId)} changed their contact preference to ${a.channel === "sms" ? "SMS" : "email"} in the portal preview. Future messages use the verified ${a.channel === "sms" ? "mobile" : "email address"}. Messages already sent are unchanged.`,
    entity: { kind: "person", id: a.personId }, programmeId: m.programmeId, personId: a.personId, simulated: true,
  });
  return c.ok(`Contact preference set to ${a.channel === "sms" ? "SMS" : "email"}. It applies to future messages only.`, "ok");
};
registerHandlers({ "participants/setContactPreference": setContactPreference });
export const setContactPreferenceAction = (personId: string, channel: "email" | "sms") => ({ type: "participants/setContactPreference", personId, channel });
