/* What the portal may show: one participant's own records only. Never an employer list,
   never another person, never an unreleased report. Also registers the one action this
   module adds: a participant changing their own contact preference.

   Details and consent are kept in the questionnaire draft (portal/saveDraft) under the keys
   below, so save and resume covers them too, and they are carried onto the membership when the
   participant submits. Nothing here interprets a health answer. */
import { ageOn, dublinToUtc, hoursBetween, ix, memo, parseIrishDate, registerHandlers, today, versionsOf, APPOINTMENT_TYPES, SECTIONS } from "../../model";
import type { Answers, Booking, ClinicSession, Episode, Handler, Id, InvitationCode, LocalDate, Membership, Message, Person, PhState, Programme, QuestionCtx, ReportVersion } from "../../model";

export type PortalView = "overview" | "appointments" | "questionnaire" | "results" | "account";
export const PORTAL_VIEWS: Array<{ id: PortalView; label: string; icon: "home" | "calendar" | "edit" | "file" | "user" }> = [
  { id: "overview", label: "Overview", icon: "home" },
  { id: "appointments", label: "Appointments", icon: "calendar" },
  { id: "questionnaire", label: "Questionnaire", icon: "edit" },
  { id: "results", label: "My results", icon: "file" },
  { id: "account", label: "Account", icon: "user" },
];

export const SUPPORT_EMAIL = "support@precisionhealth.ie";

/** How the participant wants the released report delivered. Local to the preview (see the final report). */
export type ReportDelivery = "portal" | "portal_pdf";
export const DELIVERY_LABEL: Record<ReportDelivery, string> = {
  portal: "In the portal only",
  portal_pdf: "In the portal, and as an encrypted PDF by email with an access code by text",
};

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
    const sessions = state.sessions.filter((s) => s.programmeId === person.programmeId && s.status === "scheduled" && s.date >= t).sort((a, b) => (a.date === b.date ? (a.siteName < b.siteName ? -1 : 1) : a.date < b.date ? -1 : 1));
    return { person, membership, programme, code, bookings, active, attended, episodes, messages, sessions };
  });
}

/* ---- details and consent keys, stored with the questionnaire draft ---- */
export const DK = {
  first: "pdFirstName", last: "pdLastName", email: "pdEmail", mobileType: "pdMobileType", mobile: "pdMobile", dob: "pdDob", sex: "pdSex", confirmed: "pdConfirmed",
} as const;
export type MobileType = "irish" | "non_irish" | "none";
export const MOBILE_TYPES: Array<{ id: MobileType; label: string }> = [
  { id: "irish", label: "Irish mobile" },
  { id: "non_irish", label: "Non-Irish mobile" },
  { id: "none", label: "No Irish mobile" },
];

/** The four required boxes from the booking consent form, in their wording (infection, not COVID-19). */
export const CONSENT_ITEMS = [
  { key: "consentRead", label: "I have read and understood the information" },
  { key: "consentWithdraw", label: "I understand I may withdraw my consent any time before the appointment is booked" },
  { key: "consentInfection", label: "I understand I may NOT attend the appointment if I have fever or other symptoms suggestive of infection" },
  { key: "consentIsolate", label: "I understand I may NOT attend if I have been advised to self-isolate or restrict my movements" },
] as const;
export const CK = { signature: "consentSignature", screenReader: "consentSignatureScreenReader", date: "consentDate", notice: "privacyNoticeVersion", sms: "consentSms" } as const;
export const CONSENT_FORM_VERSION = "BC-3";
export const PRIVACY_NOTICE_VERSION = "v1.0";

/** The answers saved so far: submitted answers once complete, otherwise the draft. */
export function savedAnswers(m: Membership | undefined): Answers {
  if (!m) return {};
  return m.questionnaire === "complete" ? m.answers : m.draft?.answers || {};
}

const str = (v: Answers[string] | undefined) => (typeof v === "string" ? v : "");

export function consentComplete(a: Answers): boolean {
  if (!CONSENT_ITEMS.every((c) => a[c.key] === true)) return false;
  if (a[CK.screenReader] !== true && !str(a[CK.signature]).trim()) return false;
  return !!parseIrishDate(str(a[CK.date]));
}

export interface Progress {
  details: boolean;
  consent: boolean;
  sectionsDone: number;
  sectionsTotal: number;
  /** The questionnaire and consent were submitted. */
  submitted: boolean;
  /** A booking can be confirmed. */
  ready: boolean;
}
export function progressOf(m: Membership | undefined): Progress {
  const submitted = m?.questionnaire === "complete";
  const a = savedAnswers(m);
  const sectionsTotal = SECTIONS.length;
  return {
    details: submitted || a[DK.confirmed] === true,
    consent: (submitted && m?.consent === "complete") || consentComplete(a),
    sectionsDone: submitted ? sectionsTotal : Math.min(sectionsTotal, m?.draft?.sectionsDone || 0),
    sectionsTotal,
    submitted,
    ready: submitted && m?.consent === "complete",
  };
}

/** The details the participant gave, falling back to the invitation record. */
export function participantDetails(d: PortalData, a: Answers) {
  const p = d.person;
  const dobIso = parseIrishDate(str(a[DK.dob])) || p.dob;
  const sexAns = str(a[DK.sex]);
  const sex: QuestionCtx["sex"] = sexAns === "Male" ? "male" : sexAns === "Female" ? "female" : p.sex;
  const mobileType = (["irish", "non_irish", "none"] as const).find((x) => x === a[DK.mobileType]) || null;
  return {
    first: str(a[DK.first]) || p.given,
    last: str(a[DK.last]) || p.family,
    email: str(a[DK.email]) || p.email,
    mobileType,
    mobile: str(a[DK.mobile]),
    dobIso,
    sex,
  };
}

/** Who is answering, so sex- and age-dependent questions show correctly. */
export function questionCtx(state: PhState, d: PortalData, a: Answers): QuestionCtx {
  const det = participantDetails(d, a);
  return { sex: det.sex, age: ageOn(det.dobIso, today(state)), employer: d.programme.clientName };
}

/* ---- validation for the details form ---- */
export const normaliseMobile = (v: string) => v.replace(/[\s()-]/g, "");
export function mobileError(type: MobileType | null, value: string): string | null {
  if (!type) return "Choose the kind of mobile you have.";
  if (type === "none") return null;
  const v = normaliseMobile(value);
  if (!v) return type === "irish" ? "Enter your mobile number, for example 0871234567." : "Enter your mobile number with its country code.";
  if (type === "irish" && !/^08\d{8}$/.test(v)) return "Enter an Irish mobile in the format 08x1234567, for example 0871234567. If your number is not Irish, choose Non-Irish mobile.";
  if (type === "non_irish" && !/^\+\d{8,15}$/.test(v)) return "Include the country code, for example +44 7700 900123.";
  return null;
}
export function emailError(v: string): string | null {
  if (!v.trim()) return "Enter your email address. Your booking confirmation goes here.";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? null : "Enter an email address in the format name@example.com.";
}
export function dobError(v: string, todayIso: LocalDate): string | null {
  if (!v.trim()) return "Enter your date of birth.";
  const iso = parseIrishDate(v);
  if (!iso) return "Enter a real date as dd/mm/yyyy, for example 09/06/1993.";
  if (iso > todayIso) return "Your date of birth cannot be in the future.";
  const age = ageOn(iso, todayIso);
  if (age < 16) return "You need to be 16 or over to take part. Contact support if this is wrong.";
  if (age > 110) return "Check the year of your date of birth.";
  return null;
}

/* ---- programme heading in Precision Health's booking style ---- */
const PARTICIPANT_TYPE: Record<string, string> = {
  "AT-COMP-LAB": "Comprehensive Health Screening",
  "AT-CARDIO": "Cardiac Health Screening",
  "AT-SPORTS": "Sports Cardiac Screening",
  "AT-SKIN": "Skin Screening",
};
export function screeningName(p: Programme): string {
  return PARTICIPANT_TYPE[p.appointmentTypeId] || APPOINTMENT_TYPES.find((x) => x.id === p.appointmentTypeId)?.name || "Health Screening";
}
export function appointmentMinutes(p: Programme): number {
  return APPOINTMENT_TYPES.find((x) => x.id === p.appointmentTypeId)?.minutes || 15;
}
/** "Comprehensive Health Screening · IBM Dublin · Demo Screening Room". */
export function programmeHeading(d: PortalData): string {
  const p = d.programme;
  const site = p.sites.length === 1 ? p.sites[0] : d.person.site || p.sites.join(" or ");
  return [screeningName(p), ...site.split(", ")].join(" · ");
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
