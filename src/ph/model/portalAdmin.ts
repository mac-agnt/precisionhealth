/* Participant portal administration: accounts, programme content, consent and privacy notice
   versions, message templates and the portal access log.

   Account status is derived per person from the records that already exist (programme membership,
   invitation code, questionnaire, consent, bookings, report access) plus a small account record for
   what staff or the participant change: a lock, an MFA reset, a personal invitation link, assisted
   onboarding, a withdrawal or a report delivery choice. Baseline programme counts are untouched.

   Pure: no reducer import, so booking actions can read the settings without an import cycle.
   Handlers live in actions/portalAdmin.ts. Nothing here reads or shows a clinical value. */
import type {
  AssistedMethod, Booking, Id, Iso, LocalDate, Membership, MessageKind, MessageTemplate, Person, PhState, PortalAccountRecord, PortalAccountStatus,
  PortalAdminState, PortalContent, PortalDocVersion, Programme, ProgrammeId, ReportDeliveryMode,
} from "./types";
import { BRAND, HEALTH_INFO_PATTERN, PROGRAMMES, PROGRAMME_ORDER, QUESTIONNAIRE_SECTIONS } from "./constants";
import { ix, memo, membershipOf, persona, plural, today } from "./selectors/core";
import { addDays, dublinToUtc, fmtDate, hoursBetween, localDateOf } from "./time";

/* ---- baseline ---- */
export const PORTAL_BASELINE_AT: Iso = "2026-09-01T08:00:00.000Z";
export const BASE_CONSENT_VERSION = "BC-3";
export const BASE_PRIVACY_VERSION = "v1.0";
/** Seeded accounts: three people created an account but never set up a second factor. */
export const SEEDED_REGISTERED: Array<{ personId: Id; at: Iso }> = [
  { personId: "PH-P-0006", at: "2026-08-26T19:12:00.000Z" },
  { personId: "PH-P-0505", at: "2026-09-10T12:40:00.000Z" },
  { personId: "PH-P-0708", at: "2026-09-16T08:05:00.000Z" },
];
/** Seeded lock: the first portal booking at the Sisk Site B clinic on Thu 8 Oct, locked after failed sign-ins. */
export const SEEDED_LOCK_SESSION = "CLN-SISK-20261008";
export const SEEDED_LOCK_AT: Iso = "2026-10-04T19:41:00.000Z";
export const FAILED_SIGNIN_LIMIT = 5;
export const PERSONAL_INVITE_DAYS = 14;

export const ACCOUNT_STATUS_ORDER: PortalAccountStatus[] = ["not_invited", "invited", "registered", "mfa_enrolled", "locked"];
export const ACCOUNT_STATUS_LABEL: Record<PortalAccountStatus, string> = {
  not_invited: "Not invited",
  invited: "Invited",
  registered: "Registered",
  mfa_enrolled: "MFA enrolled",
  locked: "Locked",
};
export const ACCOUNT_STATUS_HELP: Record<PortalAccountStatus, string> = {
  not_invited: "No usable invitation: the programme code was revoked or has expired and no personal link was sent.",
  invited: "A programme code or a personal link was sent. No account yet.",
  registered: "Account created, second factor not set up yet. A reset sign-in also lands here until the participant sets it up again.",
  mfa_enrolled: "Account with a second factor. Everyone who started the questionnaire signed in this way.",
  locked: "Sign-in blocked until staff unlock it. Records and bookings are unchanged.",
};
export const DELIVERY_MODE_LABEL: Record<ReportDeliveryMode, string> = {
  portal: "Portal only",
  portal_pdf: "Portal, plus encrypted PDF by email with the access code by SMS",
};
export const ASSISTED_METHOD_LABEL: Record<AssistedMethod, string> = {
  phone: "By phone",
  in_person: "In person at a clinic",
  paper: "Paper form, entered by staff",
};

const SCREENING_NAME: Record<string, string> = {
  "AT-COMP-LAB": "Comprehensive Health Screening",
  "AT-CARDIO": "Cardiac Health Screening",
  "AT-SPORTS": "Sports Cardiac Screening",
  "AT-SKIN": "Skin Screening",
};
export const DEFAULT_PREP = [
  "Bring a list of your medications.",
  "Wear a top with sleeves you can roll up.",
  "You can eat and drink as normal unless we tell you otherwise.",
];
export const DEFAULT_WELCOME = "Everything you need for your health screening, in one place.";

function baseContent(p: Programme): PortalContent {
  return {
    version: 1, heading: SCREENING_NAME[p.appointmentTypeId] || "Health Screening", venueLine: "", welcome: DEFAULT_WELCOME,
    supportEmail: BRAND.email, supportPhone: BRAND.phone, prep: DEFAULT_PREP.slice(),
    cancelCutoffHours: 2, rescheduleCutoffHours: 2, holdMinutes: 5, oneActiveBooking: true, reportDelivery: "portal", reminderLeadHours: 24,
    savedAt: PORTAL_BASELINE_AT, savedBy: "system", note: "Baseline from the current booking form. Sample wording and cut-offs for Precision Health to confirm.",
  };
}

/* ---- message templates ---- */
export interface MergeField { key: string; label: string; kinds: MessageKind[] }
const ALL_KINDS: MessageKind[] = ["confirmation", "reminder", "report_available", "invitation"];
export const MERGE_FIELDS: MergeField[] = [
  { key: "first_name", label: "First name", kinds: ALL_KINDS },
  { key: "programme_name", label: "Programme name", kinds: ALL_KINDS },
  { key: "screening_name", label: "Screening type", kinds: ALL_KINDS },
  { key: "appointment_date", label: "Appointment date", kinds: ["confirmation", "reminder"] },
  { key: "appointment_time", label: "Appointment time (24-hour)", kinds: ["confirmation", "reminder"] },
  { key: "venue", label: "Venue and room", kinds: ["confirmation", "reminder"] },
  { key: "booking_reference", label: "Booking reference", kinds: ["confirmation", "reminder"] },
  { key: "invitation_code", label: "Invitation code", kinds: ["invitation"] },
  { key: "portal_link", label: "Portal link", kinds: ALL_KINDS },
  { key: "support_email", label: "Support email", kinds: ALL_KINDS },
];
export const REQUIRED_MERGE_FIELDS: Record<MessageKind, string[]> = {
  confirmation: ["appointment_date", "appointment_time", "booking_reference"],
  reminder: ["appointment_date", "appointment_time", "booking_reference"],
  report_available: ["portal_link"],
  invitation: ["portal_link", "invitation_code"],
};
export const TEMPLATE_KIND_LABEL: Record<MessageKind, string> = {
  confirmation: "Booking confirmation",
  reminder: "Appointment reminder",
  report_available: "Report available",
  invitation: "Invitation",
};
export const PORTAL_LINK_SAMPLE = "portal.precisionhealth.example.invalid";

const T = (kind: MessageKind, channel: "email" | "sms", subject: string, body: string): MessageTemplate => ({
  id: `MT-${kind}-${channel}`, kind, channel, subject, body, version: 1, updatedAt: PORTAL_BASELINE_AT, updatedBy: "system", history: [],
});
function baseTemplates(): MessageTemplate[] {
  return [
    T("confirmation", "email", "Your Precision Health appointment is confirmed",
      "Hello {{first_name}},\n\nYour {{screening_name}} is confirmed for {{appointment_date}} at {{appointment_time}}, {{venue}}. Your booking reference is {{booking_reference}}.\n\nRead the preparation steps and change or cancel your appointment in the portal: {{portal_link}}\n\nQuestions: {{support_email}}\n\nPrecision Health"),
    T("confirmation", "sms", "",
      "Precision Health: your appointment is confirmed for {{appointment_date}} at {{appointment_time}}, {{venue}}. Ref {{booking_reference}}. Manage it at {{portal_link}}"),
    T("reminder", "email", "Reminder about your Precision Health appointment",
      "Hello {{first_name}},\n\nA reminder that your {{screening_name}} is on {{appointment_date}} at {{appointment_time}}, {{venue}}. Your booking reference is {{booking_reference}}.\n\nIf you cannot attend, change or cancel it in the portal so someone else can have the time: {{portal_link}}\n\nPrecision Health"),
    T("reminder", "sms", "",
      "Precision Health reminder: {{appointment_date}} at {{appointment_time}}, {{venue}}. Ref {{booking_reference}}. Can't attend? Change it at {{portal_link}}"),
    T("report_available", "email", "A document is ready in your Precision Health portal",
      "Hello {{first_name}},\n\nA document from your screening is ready in your Precision Health portal. Sign in to read it: {{portal_link}}\n\nThis email contains no health details. Questions: {{support_email}}\n\nPrecision Health"),
    T("report_available", "sms", "",
      "Precision Health: a document is ready in your portal. Sign in at {{portal_link}} to read it."),
    T("invitation", "email", "Your Precision Health screening invitation",
      "Hello {{first_name}},\n\nYou are invited to a {{screening_name}} with Precision Health as part of {{programme_name}}.\n\nGo to {{portal_link}} and enter the code {{invitation_code}}. Confirm your details, read the consent and answer a few health questions, then choose a time.\n\nQuestions: {{support_email}}\n\nPrecision Health"),
    T("invitation", "sms", "",
      "Precision Health: you're invited to book your screening. Go to {{portal_link}} and use the code {{invitation_code}}."),
  ];
}

/* ---- baseline state ---- */
/** Deterministic baseline. Called once by createInitialState, and as a fallback for a state without it. */
export function buildPortalBaseline(s: Pick<PhState, "bookings" | "memberships">): PortalAdminState {
  const accounts: Record<Id, PortalAccountRecord> = {};
  for (const r of SEEDED_REGISTERED) accounts[r.personId] = { registeredAt: r.at, registeredVia: "portal", lastSignInAt: r.at };
  const lockBooking = s.bookings
    .filter((b) => b.sessionId === SEEDED_LOCK_SESSION && b.status === "confirmed" && b.createdVia === "portal")
    .sort((a, b) => (a.slotStart < b.slotStart ? -1 : 1))[0];
  if (lockBooking) {
    accounts[lockBooking.personId] = {
      failedSignIns: FAILED_SIGNIN_LIMIT, lastSignInAt: lockBooking.createdAt,
      lock: { at: SEEDED_LOCK_AT, by: "system", reason: `${FAILED_SIGNIN_LIMIT} failed sign-in attempts in ten minutes` },
    };
  }
  const content = Object.fromEntries(PROGRAMMES.map((p) => [p.id, [baseContent(p)]])) as Record<ProgrammeId, PortalContent[]>;
  const documents: PortalDocVersion[] = [];
  for (const id of PROGRAMME_ORDER) {
    documents.push({ id: `DOC-${id}-consent-1`, programmeId: id, kind: "consent", version: BASE_CONSENT_VERSION, status: "published", summary: "Precision Health booking consent: general terms, data processing and the four confirmations.", draftedBy: "system", draftedAt: "2026-09-01T09:00:00.000Z", decidedBy: "neil", decidedAt: "2026-09-04T09:00:00.000Z", publishedAt: "2026-09-04T09:00:00.000Z" });
    documents.push({ id: `DOC-${id}-privacy-1`, programmeId: id, kind: "privacy", version: BASE_PRIVACY_VERSION, status: "published", summary: "Privacy notice: EU storage, Esendex for the access code text, employer sees aggregates only. Retention period to confirm.", draftedBy: "system", draftedAt: "2026-09-01T09:00:00.000Z", decidedBy: "neil", decidedAt: "2026-09-04T09:00:00.000Z", publishedAt: "2026-09-04T09:00:00.000Z" });
  }
  return { accounts, content, documents, templates: baseTemplates() };
}

/** The portal admin state, or the baseline when a state was built without it. Read only. */
export function portalState(state: PhState): PortalAdminState {
  return state.portal ?? memo(state, "portal-fallback", () => buildPortalBaseline(state));
}
/** For handlers: makes sure the working copy carries portal admin state before it is changed. */
export function ensurePortal(state: PhState): PortalAdminState {
  if (!state.portal) state.portal = buildPortalBaseline(state);
  return state.portal;
}
export const accountRecord = (state: PhState, personId: Id): PortalAccountRecord => portalState(state).accounts[personId] || {};

/* ---- programme content ---- */
export function portalContent(state: PhState, programmeId: ProgrammeId): PortalContent {
  const list = portalState(state).content[programmeId];
  const p = PROGRAMMES.find((x) => x.id === programmeId) || PROGRAMMES[0];
  return list && list.length ? list[list.length - 1] : baseContent(p);
}
export const contentHistory = (state: PhState, programmeId: ProgrammeId): PortalContent[] => (portalState(state).content[programmeId] || []).slice().reverse();
export const reminderLeadHoursFor = (state: PhState, programmeId: ProgrammeId): number => portalState(state).content[programmeId]?.length ? portalContent(state, programmeId).reminderLeadHours : state.settings.reminderLeadHours;
export const oneActiveBookingFor = (state: PhState, programmeId: ProgrammeId): boolean => portalContent(state, programmeId).oneActiveBooking;

export type ContentFields = Omit<PortalContent, "version" | "savedAt" | "savedBy" | "note">;
export const CONTENT_FIELD_LABEL: Record<keyof ContentFields, string> = {
  heading: "Booking page header", venueLine: "Venue line", welcome: "Welcome text", supportEmail: "Support email", supportPhone: "Support phone",
  prep: "Before you arrive", cancelCutoffHours: "Cancellation cut-off", rescheduleCutoffHours: "Reschedule cut-off", holdMinutes: "Slot hold",
  oneActiveBooking: "One active booking", reportDelivery: "Report delivery default", reminderLeadHours: "Reminder lead time",
};
export const REMINDER_LEAD_OPTIONS = [24, 48];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isInt = (n: unknown, lo: number, hi: number) => typeof n === "number" && Number.isInteger(n) && n >= lo && n <= hi;

/** Every reason a content change would be refused. */
export function contentErrors(c: ContentFields): string[] {
  const e: string[] = [];
  if (!c.heading.trim()) e.push("Add a booking page header.");
  else if (c.heading.length > 80) e.push("Keep the booking page header to 80 characters.");
  if (c.venueLine.length > 90) e.push("Keep the venue line to 90 characters.");
  if (!c.welcome.trim()) e.push("Add a welcome line.");
  else if (c.welcome.length > 160) e.push("Keep the welcome line to 160 characters.");
  if (!EMAIL_RE.test(c.supportEmail.trim())) e.push("Enter a support email in the format name@example.com.");
  if (!/^\+?[\d\s()-]{7,20}$/.test(c.supportPhone.trim())) e.push("Enter a support phone number, for example +353 1 910 4024.");
  const prep = c.prep.map((x) => x.trim()).filter(Boolean);
  if (!prep.length) e.push("Add at least one line to Before you arrive.");
  if (prep.length > 8) e.push("Keep Before you arrive to 8 lines.");
  if (prep.some((x) => x.length > 140)) e.push("Keep each Before you arrive line to 140 characters.");
  if (!isInt(c.cancelCutoffHours, 0, 72)) e.push("The cancellation cut-off is a whole number of hours from 0 to 72.");
  if (!isInt(c.rescheduleCutoffHours, 0, 72)) e.push("The reschedule cut-off is a whole number of hours from 0 to 72.");
  if (!isInt(c.holdMinutes, 1, 15)) e.push("The slot hold is a whole number of minutes from 1 to 15. The specification proposes 5.");
  if (!REMINDER_LEAD_OPTIONS.includes(c.reminderLeadHours)) e.push("Choose a reminder lead time of 24 or 48 hours.");
  if (c.reportDelivery !== "portal" && c.reportDelivery !== "portal_pdf") e.push("Choose a report delivery default.");
  if ([c.heading, c.welcome, c.venueLine, ...prep].some((x) => x.includes("!"))) e.push("Precision Health copy does not use exclamation marks.");
  return e;
}

/** Fields that differ between two content versions, by label. */
export function contentChanges(a: ContentFields, b: ContentFields): string[] {
  return (Object.keys(CONTENT_FIELD_LABEL) as Array<keyof ContentFields>)
    .filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]))
    .map((k) => CONTENT_FIELD_LABEL[k]);
}

const hrs = (n: number) => plural(n, "hour");
/** Participant-facing wording of the change and cancellation rules. */
export function cutoffText(c: Pick<PortalContent, "cancelCutoffHours" | "rescheduleCutoffHours" | "supportEmail">): string {
  const { cancelCutoffHours: cx, rescheduleCutoffHours: rx } = c;
  if (!cx && !rx) return "You can change or cancel your appointment online until you check in.";
  if (cx === rx) return `You can change or cancel online up to ${hrs(cx)} before your appointment. After that, email ${c.supportEmail}.`;
  const part = (n: number, what: string) => (n ? `${what} online up to ${hrs(n)} before` : `${what} online until you check in`);
  return `${part(rx, "Change the time")}, and ${part(cx, "cancel").toLowerCase()}. After that, email ${c.supportEmail}.`;
}

/**
 * Why a participant cannot change or cancel this booking online right now, or null. Staff with
 * Manage bookings are not bound by the cut-off; the booking actions record who acted.
 */
export function participantChangeBlock(state: PhState, b: Booking, kind: "cancel" | "reschedule"): string | null {
  const c = portalContent(state, b.programmeId);
  const limit = kind === "cancel" ? c.cancelCutoffHours : c.rescheduleCutoffHours;
  if (limit <= 0) return null;
  const s = ix(state).sessionById.get(b.sessionId);
  if (!s) return null;
  const left = hoursBetween(state.clock.nowUtc, dublinToUtc(s.date, b.slotStart));
  if (left >= limit) return null;
  return `Online ${kind === "cancel" ? "cancellation" : "changes"} close ${hrs(limit)} before the appointment. Email ${c.supportEmail} or call ${c.supportPhone} and the screening team will help.`;
}

/* ---- consent form and privacy notice versions ---- */
export const DOC_LABEL: Record<PortalDocVersion["kind"], string> = { consent: "Consent form", privacy: "Privacy notice" };
export const docVersions = (state: PhState, programmeId: ProgrammeId, kind: PortalDocVersion["kind"]): PortalDocVersion[] =>
  portalState(state).documents.filter((d) => d.programmeId === programmeId && d.kind === kind);
export function currentDoc(state: PhState, programmeId: ProgrammeId, kind: PortalDocVersion["kind"]): PortalDocVersion | null {
  return docVersions(state, programmeId, kind).filter((d) => d.status === "published").pop() || null;
}
export const pendingDoc = (state: PhState, programmeId: ProgrammeId, kind: PortalDocVersion["kind"]): PortalDocVersion | null =>
  docVersions(state, programmeId, kind).find((d) => d.status === "pending_approval") || null;
export const consentVersionFor = (state: PhState, programmeId: ProgrammeId): string => currentDoc(state, programmeId, "consent")?.version || BASE_CONSENT_VERSION;
export const privacyVersionFor = (state: PhState, programmeId: ProgrammeId): string => currentDoc(state, programmeId, "privacy")?.version || BASE_PRIVACY_VERSION;
/** Answer keys the portal stores with the consent step. */
export const CONSENT_FORM_KEY = "consentFormVersion";
export const PRIVACY_NOTICE_KEY = "privacyNoticeVersion";

/** The privacy notice version a membership accepted. Seeded completions accepted the baseline notice. */
export function acceptedPrivacy(m: Membership): string | null {
  if (m.consent !== "complete") return null;
  const v = m.answers[PRIVACY_NOTICE_KEY];
  return typeof v === "string" && v ? v : BASE_PRIVACY_VERSION;
}
/** How many participants accepted each version. Accepted versions never change when a new one is published. */
export function docAcceptance(state: PhState, programmeId: ProgrammeId): { consent: Array<{ version: string; n: number }>; privacy: Array<{ version: string; n: number }> } {
  return memo(state, "pa-accept:" + programmeId, () => {
    const c = new Map<string, number>(), p = new Map<string, number>();
    for (const m of state.memberships) {
      if (m.programmeId !== programmeId || m.consent !== "complete") continue;
      const cv = m.consentVersion || BASE_CONSENT_VERSION;
      c.set(cv, (c.get(cv) || 0) + 1);
      const pv = acceptedPrivacy(m) || BASE_PRIVACY_VERSION;
      p.set(pv, (p.get(pv) || 0) + 1);
    }
    const list = (m: Map<string, number>) => [...m.entries()].map(([version, n]) => ({ version, n })).sort((a, b) => (a.version < b.version ? -1 : 1));
    return { consent: list(c), privacy: list(p) };
  });
}
export const DOC_VERSION_PATTERN: Record<PortalDocVersion["kind"], { re: RegExp; example: string }> = {
  consent: { re: /^BC-\d{1,3}$/, example: "BC-4" },
  privacy: { re: /^v\d{1,2}\.\d{1,2}$/, example: "v1.1" },
};
/** The next version label to suggest: BC-3 becomes BC-4, v1.0 becomes v1.1. */
export function nextDocVersion(state: PhState, programmeId: ProgrammeId, kind: PortalDocVersion["kind"]): string {
  const all = docVersions(state, programmeId, kind).map((d) => d.version);
  if (kind === "consent") {
    const n = Math.max(3, ...all.map((v) => Number(v.replace(/^BC-/, "")) || 0));
    return `BC-${n + 1}`;
  }
  const minors = all.map((v) => /^v(\d+)\.(\d+)$/.exec(v)).filter((x): x is RegExpExecArray => !!x).map((x) => Number(x[1]) * 100 + Number(x[2]));
  const top = Math.max(100, ...minors);
  return `v${Math.floor(top / 100)}.${(top % 100) + 1}`;
}

/* ---- accounts ---- */
export interface AccountRow {
  person: Person;
  membership: Membership;
  programme: Programme;
  status: PortalAccountStatus;
  /** Plain words behind the status, with a date where there is one. */
  statusDetail: string;
  record: PortalAccountRecord;
  /** True when the participant must set up a second factor at the next sign-in. */
  needsMfa: boolean;
  consentVersion: string | null;
  privacyVersion: string | null;
  questionnaire: Membership["questionnaire"];
  sectionsDone: number;
  sectionsTotal: number;
  booking: { kind: "none" | "upcoming" | "attended"; bookingId: Id | null; date: LocalDate | null; time: string | null };
  /** Release and portal access dates only. Never a result value. */
  report: { releasedAt: Iso | null; viewedAt: Iso | null; versionLabel: string | null };
  withdrawn: boolean;
  lastActivityAt: Iso | null;
}

/** True when an invitation code still works on the demo clock. */
function codeWorks(state: PhState, codeId: Id | null): { ok: boolean; code: string | null; why: string } {
  const code = codeId ? state.invitationCodes.find((c) => c.id === codeId) : undefined;
  if (!code) return { ok: false, code: null, why: "no programme code" };
  if (code.status === "revoked") return { ok: false, code: code.code, why: `code ${code.code} was revoked` };
  if (code.status === "expired" || code.expiresOn < today(state)) return { ok: false, code: code.code, why: `code ${code.code} expired on ${fmtDate(code.expiresOn)}` };
  return { ok: true, code: code.code, why: "" };
}
export const personalInviteWorks = (state: PhState, r: PortalAccountRecord): boolean => !!r.personalInvite && r.personalInvite.expiresOn >= today(state);

export function needsMfa(r: PortalAccountRecord, started: boolean): boolean {
  if (r.mfaReset && (!r.mfaReenrolledAt || r.mfaReenrolledAt < r.mfaReset.at)) return true;
  return !!r.registeredAt && !started && !r.mfaReenrolledAt;
}

function deriveRow(state: PhState, person: Person): AccountRow | null {
  const I = ix(state);
  const m = membershipOf(state, person.id);
  const programme = I.programmeById.get(person.programmeId);
  if (!m || !programme) return null;
  const r = accountRecord(state, person.id);
  const started = m.questionnaire !== "not_started";
  const hasAccount = started || !!r.registeredAt;
  const mfa = hasAccount && needsMfa(r, started);
  let status: PortalAccountStatus;
  let detail: string;
  if (r.lock) {
    status = "locked";
    detail = `Locked ${fmtDate(r.lock.at)}${r.lock.by === "system" ? " automatically" : ""}: ${r.lock.reason}`;
  } else if (hasAccount && mfa) {
    status = "registered";
    detail = r.mfaReset && (!r.mfaReenrolledAt || r.mfaReenrolledAt < r.mfaReset.at)
      ? `Sign-in and MFA reset ${fmtDate(r.mfaReset.at)}. Sets up a second factor at the next sign-in.`
      : r.registeredVia === "assisted" ? `Set up with staff help ${fmtDate(r.registeredAt || r.assisted?.at || state.clock.nowUtc)}. Second factor or accessible alternative still to agree.`
        : `Account created ${fmtDate(r.registeredAt || state.clock.nowUtc)}. Second factor not set up.`;
  } else if (hasAccount) {
    status = "mfa_enrolled";
    const since = r.mfaReenrolledAt || m.questionnaireCompletedAt || r.registeredAt;
    detail = r.mfaReenrolledAt ? `Second factor set up ${fmtDate(r.mfaReenrolledAt)}` : since ? `Since ${fmtDate(since)}` : "Questionnaire in progress";
  } else {
    const code = codeWorks(state, m.inviteCodeId);
    if (personalInviteWorks(state, r)) { status = "invited"; detail = `Personal link sent ${fmtDate(r.personalInvite!.sentAt)}, valid to ${fmtDate(r.personalInvite!.expiresOn)}`; }
    else if (code.ok) { status = "invited"; detail = `Code ${code.code} sent ${fmtDate(m.invitedAt)}`; }
    else { status = "not_invited"; detail = `No usable invitation: ${code.why}${r.personalInvite ? ", and the personal link has expired" : ""}.`; }
  }
  const bookings = I.bookingsByPerson.get(person.id) || [];
  const upcoming = bookings.filter((b) => b.status === "confirmed" && b.attendance !== "completed" && b.attendance !== "no_show")
    .sort((a, b) => (I.sessionById.get(a.sessionId)!.date + a.slotStart < I.sessionById.get(b.sessionId)!.date + b.slotStart ? -1 : 1))[0];
  const attended = bookings.filter((b) => b.status === "confirmed" && b.attendance === "completed").pop();
  const bk = upcoming || attended;
  const bs = bk ? I.sessionById.get(bk.sessionId) : undefined;
  const eps = (I.episodesByPerson.get(person.id) || []).slice().sort((a, b) => (a.collectedAt < b.collectedAt ? -1 : 1));
  let releasedAt: Iso | null = null, viewedAt: Iso | null = null, versionLabel: string | null = null;
  const ep = eps[eps.length - 1];
  if (ep) {
    const vs = (I.versionsByEpisode.get(ep.id) || []).filter((v) => v.releasedAt && (v.status === "released" || v.status === "superseded"));
    const cur = vs.filter((v) => v.status === "released").pop();
    if (cur) { releasedAt = cur.releasedAt; versionLabel = `v${cur.version}`; }
    const seen = vs.map((v) => v.accessedAt).filter((x): x is string => !!x).sort();
    viewedAt = seen.length ? seen[seen.length - 1] : null;
  }
  const portalTimes = [m.questionnaireCompletedAt, r.lastSignInAt, r.registeredAt, r.mfaReenrolledAt, viewedAt, ...bookings.filter((b) => b.createdVia === "portal").map((b) => b.createdAt)]
    .filter((x): x is string => !!x).sort();
  return {
    person, membership: m, programme, status, statusDetail: detail, record: r, needsMfa: mfa,
    consentVersion: m.consent === "complete" ? m.consentVersion || BASE_CONSENT_VERSION : null,
    privacyVersion: acceptedPrivacy(m),
    questionnaire: m.questionnaire,
    sectionsDone: m.questionnaire === "complete" ? QUESTIONNAIRE_SECTIONS.length : m.draft?.sectionsDone || 0,
    sectionsTotal: QUESTIONNAIRE_SECTIONS.length,
    booking: bk && bs ? { kind: upcoming ? "upcoming" : "attended", bookingId: bk.id, date: bs.date, time: bk.slotStart } : { kind: "none", bookingId: null, date: null, time: null },
    report: { releasedAt, viewedAt, versionLabel },
    withdrawn: !!r.withdrawn,
    lastActivityAt: portalTimes.length ? portalTimes[portalTimes.length - 1] : null,
  };
}

/** One row per person on their own programme. Staff only: the participant preview gets nothing. */
export function accountRows(state: PhState): AccountRow[] {
  return memo(state, "pa-rows", () => {
    if (persona(state).isParticipant) return [];
    return state.persons.map((p) => deriveRow(state, p)).filter((r): r is AccountRow => !!r);
  });
}
/** A single person's account, for any role. The participant preview may read only its own. */
export function accountRow(state: PhState, personId: Id): AccountRow | null {
  return memo(state, "pa-row:" + personId, () => {
    const p = persona(state);
    if (p.isParticipant && personId !== state.session.portalPersonId) return null;
    const person = ix(state).personById.get(personId);
    return person ? deriveRow(state, person) : null;
  });
}
export type AccountCounts = Record<PortalAccountStatus, number> & { total: number; withdrawn: number; needsMfa: number };
/** Counts by status. Every invitee is in exactly one status, so the statuses sum to the roster. */
export function accountStatusCounts(state: PhState, programmeId?: ProgrammeId | "all"): AccountCounts {
  return memo(state, "pa-counts:" + (programmeId || "all"), () => {
    const out: AccountCounts = { not_invited: 0, invited: 0, registered: 0, mfa_enrolled: 0, locked: 0, total: 0, withdrawn: 0, needsMfa: 0 };
    const rows = persona(state).isParticipant ? [] : state.persons.map((p) => deriveRow(state, p));
    for (const r of rows) {
      if (!r || (programmeId && programmeId !== "all" && r.programme.id !== programmeId)) continue;
      out[r.status]++;
      out.total++;
      if (r.withdrawn) out.withdrawn++;
      if (r.needsMfa) out.needsMfa++;
    }
    return out;
  });
}

/* ---- what the participant portal shows ---- */
export interface PortalAccess {
  /** "ok" lets the participant in. Withdrawn participants can still sign in to read their own records. */
  state: "ok" | "locked" | "needs_mfa";
  message: string;
}
export function portalAccessFor(state: PhState, personId: Id): PortalAccess {
  const m = membershipOf(state, personId);
  const programmeId = m?.programmeId || ix(state).personById.get(personId)?.programmeId || PROGRAMME_ORDER[0];
  const c = portalContent(state, programmeId);
  const r = accountRecord(state, personId);
  if (r.lock) return { state: "locked", message: `Your account is locked, contact ${c.supportEmail}` };
  const started = !!m && m.questionnaire !== "not_started";
  if ((started || !!r.registeredAt) && needsMfa(r, started)) return { state: "needs_mfa", message: "Set up your second sign-in step to continue." };
  return { state: "ok", message: "" };
}

/** Why an invitation code cannot be used to sign in, or null when it can. */
export function portalCodeProblem(state: PhState, personId: Id, raw: string): string | null {
  const m = membershipOf(state, personId);
  const programmeId = m?.programmeId || PROGRAMME_ORDER[0];
  const c = portalContent(state, programmeId);
  const v = raw.trim().toUpperCase();
  if (!v) return "Enter the code from your invitation message.";
  const r = accountRecord(state, personId);
  if (r.lock) return `Your account is locked, contact ${c.supportEmail}`;
  const personal = r.personalInvite;
  if (personal && v === personal.code.toUpperCase()) return personalInviteWorks(state, r) ? null : `This personal link expired on ${fmtDate(personal.expiresOn)}. Email ${c.supportEmail} for a new one.`;
  const code = m?.inviteCodeId ? state.invitationCodes.find((x) => x.id === m.inviteCodeId) : undefined;
  if (!code || v !== code.code.toUpperCase()) return "That code is not recognised. Check the code in your invitation message, including the dashes.";
  if (code.status !== "active" || code.expiresOn < today(state)) return `This invitation code is no longer active. Email ${c.supportEmail} and we will sort it out.`;
  return null;
}

export interface PortalView {
  content: PortalContent;
  consentVersion: string;
  privacyVersion: string;
  /** Effective report delivery for this participant: their own choice, or the programme default. */
  delivery: ReportDeliveryMode;
  deliveryChosen: boolean;
  cutoffText: string;
  access: PortalAccess;
  withdrawn: PortalAccountRecord["withdrawn"];
  /** The code to show in the design preview: a personal link if one was sent, otherwise the programme code. */
  demoCode: string | null;
}
/** Everything the participant portal reads from the portal admin settings, for one participant. */
export function portalView(state: PhState, personId: Id): PortalView | null {
  return memo(state, "pa-view:" + personId, () => {
    const person = ix(state).personById.get(personId);
    if (!person) return null;
    const m = membershipOf(state, personId);
    const programmeId = m?.programmeId || person.programmeId;
    const content = portalContent(state, programmeId);
    const r = accountRecord(state, personId);
    const code = m?.inviteCodeId ? state.invitationCodes.find((x) => x.id === m.inviteCodeId) : undefined;
    return {
      content, consentVersion: consentVersionFor(state, programmeId), privacyVersion: privacyVersionFor(state, programmeId),
      delivery: r.reportDelivery || content.reportDelivery, deliveryChosen: !!r.reportDelivery,
      cutoffText: cutoffText(content), access: portalAccessFor(state, personId), withdrawn: r.withdrawn || null,
      demoCode: personalInviteWorks(state, r) ? r.personalInvite!.code : code?.code || null,
    };
  });
}
export const isWithdrawn = (state: PhState, personId: Id): boolean => !!accountRecord(state, personId).withdrawn;

/* ---- message templates ---- */
export const templatesOf = (state: PhState): MessageTemplate[] => portalState(state).templates;
export const templateById = (state: PhState, id: Id): MessageTemplate | undefined => templatesOf(state).find((t) => t.id === id);
/** Current template for a message kind and channel. */
export const templateFor = (state: PhState, kind: MessageKind, channel: "email" | "sms"): MessageTemplate | undefined =>
  templatesOf(state).find((t) => t.kind === kind && t.channel === channel);

const CLINICAL_EXTRA = /\b(abnormal\w*|borderline|glucose|hba1c|ldl|hdl|psa|ecg|diabet\w*|cancer\w*|tumou?r\w*|bmi|triglycerid\w*|haemoglobin|anaemi\w*|positive|negative)\b/gi;
/** Clinical words found in a message, using the shared health-information rule plus a short list of test names and flags. */
export function clinicalWords(text: string): string[] {
  const found = new Set<string>();
  const base = new RegExp(`[A-Za-z]*(?:${HEALTH_INFO_PATTERN.source})[A-Za-z]*`, "gi");
  for (const m of text.matchAll(base)) found.add(m[0].toLowerCase());
  for (const m of text.matchAll(CLINICAL_EXTRA)) found.add(m[0].toLowerCase());
  return [...found];
}
export const mergeKeys = (text: string): string[] => [...text.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)].map((m) => m[1]);
export const SMS_SEGMENT = 160;

export interface TemplateCheck {
  errors: string[];
  warnings: string[];
  clinical: string[];
  /** Rendered with the sample values. */
  preview: { subject: string; body: string };
  smsSegments: number;
}
/** Sample merge values from a synthetic participant and the programme's current portal content. */
export function sampleMergeValues(state: PhState, programmeId: ProgrammeId = "PRG-IBM-26"): Record<string, string> {
  const p = PROGRAMMES.find((x) => x.id === programmeId) || PROGRAMMES[0];
  const c = portalContent(state, p.id);
  const code = state.invitationCodes.find((x) => x.programmeId === p.id && x.status === "active");
  return {
    first_name: "Orla", programme_name: p.name, screening_name: c.heading, appointment_date: "Monday 12 October 2026", appointment_time: "11:15",
    venue: c.venueLine || p.sites[0], booking_reference: "PH-B-0366", invitation_code: code?.code || "DEMO-IBM-26", portal_link: PORTAL_LINK_SAMPLE, support_email: c.supportEmail,
  };
}
export function renderTemplate(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (all, k: string) => (k in values ? values[k] : all));
}
/** Validation for a template edit. Errors block saving. Clinical words are always an error: no results in messages. */
export function checkTemplate(state: PhState, kind: MessageKind, channel: "email" | "sms", subject: string, body: string, programmeId?: ProgrammeId): TemplateCheck {
  const errors: string[] = [], warnings: string[] = [];
  const all = `${channel === "email" ? subject : ""}\n${body}`;
  const clinical = clinicalWords(all);
  if (clinical.length) errors.push(`Remove clinical words: ${clinical.join(", ")}. Messages never carry results, diagnoses or test names (MSG-02).`);
  if (channel === "email" && !subject.trim()) errors.push("Add an email subject.");
  if (!body.trim()) errors.push("Add the message text.");
  if ((all.match(/\{\{/g) || []).length !== (all.match(/\}\}/g) || []).length) errors.push("A merge field is not closed. Fields look like {{first_name}}.");
  const used = mergeKeys(all);
  const unknown = [...new Set(used.filter((k) => !MERGE_FIELDS.some((f) => f.key === k)))];
  if (unknown.length) errors.push(`Unknown merge field${unknown.length === 1 ? "" : "s"}: ${unknown.map((k) => `{{${k}}}`).join(", ")}.`);
  const notHere = [...new Set(used.filter((k) => MERGE_FIELDS.some((f) => f.key === k && !f.kinds.includes(kind))))];
  if (notHere.length) errors.push(`Not available in ${TEMPLATE_KIND_LABEL[kind].toLowerCase()} messages: ${notHere.map((k) => `{{${k}}}`).join(", ")}.`);
  const missing = REQUIRED_MERGE_FIELDS[kind].filter((k) => !used.includes(k));
  if (missing.length) errors.push(`Include ${missing.map((k) => `{{${k}}}`).join(", ")}.`);
  if (all.includes("!")) warnings.push("Precision Health copy avoids exclamation marks.");
  const values = sampleMergeValues(state, programmeId);
  const preview = { subject: renderTemplate(subject, values), body: renderTemplate(body, values) };
  const smsSegments = channel === "sms" ? Math.max(1, Math.ceil(preview.body.length / SMS_SEGMENT)) : 0;
  if (channel === "sms" && smsSegments > 3) errors.push(`At ${preview.body.length} characters this SMS needs ${smsSegments} segments. Keep it to 3 or fewer.`);
  else if (channel === "sms" && smsSegments > 1) warnings.push(`About ${preview.body.length} characters with sample values: sent as ${smsSegments} SMS segments.`);
  return { errors, warnings, clinical, preview, smsSegments };
}

/* ---- access log ---- */
export type AccessKind = "signin" | "signin_failed" | "consent" | "report_view" | "account_action" | "support_access" | "settings";
export const ACCESS_KIND_LABEL: Record<AccessKind, string> = {
  signin: "Sign-in",
  signin_failed: "Failed sign-in",
  consent: "Consent accepted",
  report_view: "Report viewed",
  account_action: "Account action",
  support_access: "Support access",
  settings: "Portal settings",
};
export interface AccessLogRow {
  id: string;
  at: Iso;
  kind: AccessKind;
  personId: Id | null;
  programmeId: ProgrammeId | null;
  actor: string;
  actorKind: "participant" | "staff" | "system" | "agent";
  text: string;
  /** "audit" rows are activity events. "record" rows are read from a stored record that predates this session's log. */
  source: "audit" | "record";
}
const VERB_KIND: Record<string, AccessKind> = {
  "portal.signin": "signin",
  "portal.mfa_enrolled": "signin",
  "portal.signin_failed": "signin_failed",
  "portal.locked": "account_action",
  "portal.completed": "consent",
  "report.accessed": "report_view",
  "portal.delivery_preference": "account_action",
  "contact.preference": "account_action",
  "portaladmin.preview": "support_access",
  "portaladmin.invitation_resent": "account_action",
  "portaladmin.mfa_reset": "account_action",
  "portaladmin.locked": "account_action",
  "portaladmin.unlocked": "account_action",
  "portaladmin.assisted": "account_action",
  "portaladmin.contact_updated": "account_action",
  "portaladmin.withdrawn": "account_action",
  "portaladmin.content_saved": "settings",
  "portaladmin.document_drafted": "settings",
  "portaladmin.document_decided": "settings",
  "portaladmin.template_saved": "settings",
  "portaladmin.template_test": "settings",
};
/**
 * Portal sign-ins, consent acceptances, report views and staff account actions. Activity events
 * come first; records from before this session's log (seeded consent and report access) are added
 * once each. Text is operational only: never a result value. Staff only.
 */
export function accessLog(state: PhState): AccessLogRow[] {
  return memo(state, "pa-log", () => {
    if (persona(state).isParticipant) return [];
    const I = ix(state);
    const out: AccessLogRow[] = [];
    const consentEvents = new Set<string>(), viewEvents = new Set<string>();
    for (const e of state.activity) {
      const kind = VERB_KIND[e.verb];
      if (!kind || e.restricted) continue;
      if (e.verb === "portal.completed" && e.personId) consentEvents.add(e.personId);
      if (e.verb === "report.accessed" && e.entity) viewEvents.add(e.entity.id);
      out.push({ id: e.id, at: e.at, kind, personId: e.personId, programmeId: e.programmeId, actor: e.actor.label, actorKind: e.actor.kind, text: e.summary, source: "audit" });
    }
    for (const m of state.memberships) {
      if (m.consent !== "complete" || consentEvents.has(m.personId)) continue;
      const at = m.questionnaireCompletedAt || (I.bookingsByPerson.get(m.personId) || []).filter((b) => b.programmeId === m.programmeId).map((b) => b.questionnaireCompletedAt).sort()[0];
      if (!at) continue;
      const p = I.personById.get(m.personId);
      out.push({ id: `REC-C-${m.id}`, at, kind: "consent", personId: m.personId, programmeId: m.programmeId, actor: p ? `${p.given} ${p.family}` : m.personId, actorKind: "participant",
        text: `Accepted consent form ${m.consentVersion || BASE_CONSENT_VERSION} and privacy notice ${acceptedPrivacy(m)} in the portal, before booking.`, source: "record" });
    }
    for (const v of state.reportVersions) {
      if (!v.accessedAt || viewEvents.has(v.id)) continue;
      const ep = I.episodeById.get(v.episodeId);
      if (!ep) continue;
      const p = I.personById.get(ep.personId);
      out.push({ id: `REC-V-${v.id}`, at: v.accessedAt, kind: "report_view", personId: ep.personId, programmeId: ep.programmeId, actor: p ? `${p.given} ${p.family}` : ep.personId, actorKind: "participant",
        text: `Opened report ${ep.id} v${v.version} in the portal. Recorded separately from the report-available message.`, source: "record" });
    }
    const accounts = portalState(state).accounts;
    for (const [pid, r] of Object.entries(accounts)) {
      const p = I.personById.get(pid);
      if (!p) continue;
      const name = `${p.given} ${p.family}`;
      if (r.registeredAt && r.registeredVia === "portal" && !state.activity.some((e) => e.verb === "portal.signin" && e.personId === pid)) {
        out.push({ id: `REC-R-${pid}`, at: r.registeredAt, kind: "signin", personId: pid, programmeId: p.programmeId, actor: name, actorKind: "participant", text: "Created a portal account with the programme code. Second factor not set up.", source: "record" });
      }
      if (r.lock && r.lock.by === "system" && r.lock.at === SEEDED_LOCK_AT) {
        out.push({ id: `REC-L-${pid}`, at: r.lock.at, kind: "account_action", personId: pid, programmeId: p.programmeId, actor: "Portal sign-in", actorKind: "system", text: `Account locked after ${r.lock.reason}.`, source: "record" });
      }
    }
    return out.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : a.id < b.id ? 1 : -1));
  });
}

/* ---- small helpers shared by handlers and pages ---- */
export const IRISH_MOBILE = /^08\d{8}$/;
/** "0871234567" becomes "+353 87 ••• 4567", the masked form used everywhere for a verified mobile. */
export function maskIrishMobile(v: string): string {
  const n = v.replace(/[\s()-]/g, "");
  return `+353 ${n.slice(1, 3)} ••• ${n.slice(-4)}`;
}
/** The demo roster uses synthetic addresses only. */
export const SYNTHETIC_EMAIL = /^[^\s@]+@example\.(com|invalid)$/i;
export const personalInviteCode = (personId: Id, n: number) => `DEMO-P${personId.slice(5)}-${n}`;
export const inviteExpiry = (fromIso: Iso): LocalDate => addDays(localDateOf(fromIso), PERSONAL_INVITE_DAYS);
