/* Automation registry: Precision Health's automation flows as they run today, and how Pulse runs
   each one. The "today" text comes from the client material (docs/client-source/INPUTS.md). Anything
   that is not in that material is labelled "to_confirm_with_client", at the automation or the step.
   Live numbers come from metrics(state), which reads the shared store: no count here is typed in.
   Everything is simulated: no message is sent, no file is fetched and no channel is posted to. */
import type { ActivityEvent, AgentId, EntityKind, Id, IntegrationDef, PhState, RoleKey, ScheduledJob, StaffId, Task } from "./types";
import type { NavTarget } from "./nav";
import { linkFor } from "./nav";
import { INTEGRATIONS, PROGRAMME_BY_ID } from "./constants";
import { fmtDayMonth, fmtShortDateTime, localDateOf } from "./time";
import {
  activityFeed, batchList, canViewEpisodeClinical, expectedTestCompletion, followUpList, jobViews, persona, programmeCounts, reminderStats, reviewStats, scheduleOverlaps,
  sessionStats, sessionsBetween, staffName, today, todaySessions, todayStats, visibleTasks,
} from "./selectors";
import type { TaskView } from "./selectors";

/* ---- types ---- */
export type AutomationStage = "Invite and book" | "Clinic day" | "Laboratory" | "Clinical review" | "Report delivery" | "Employer reporting" | "Operations";
/** The participant journey in order. Operations runs alongside it. */
export const AUTOMATION_STAGES: AutomationStage[] = ["Invite and book", "Clinic day", "Laboratory", "Clinical review", "Report delivery", "Employer reporting", "Operations"];
export const AUTOMATION_STAGE_NOTE: Record<AutomationStage, string> = {
  "Invite and book": "Codes, consent, booking, confirmation and reminders.",
  "Clinic day": "Check-in, the nurse form and the nurse's escalations.",
  Laboratory: "Specimens out to Eurofins, results back in.",
  "Clinical review": "Classification, the review queue and clinical follow-up.",
  "Report delivery": "Release, notices to the participant and corrections.",
  "Employer reporting": "Disclosure-controlled aggregate output for the employer.",
  Operations: "Clinic scheduling and nurse coordination, alongside the journey.",
};

/**
 * Where an automation or a step comes from. client_material: how Precision Health works today, from
 * the material they sent. client_spec: their ten-page specification. to_confirm_with_client: neither
 * describes it, so it is a Pulse proposal until Precision Health confirms it.
 */
export type AutomationSource = "client_material" | "client_spec" | "to_confirm_with_client";
export const AUTOMATION_SOURCE_LABEL: Record<AutomationSource, string> = {
  client_material: "Client material",
  client_spec: "Client spec",
  to_confirm_with_client: "To confirm with client",
};
export const AUTOMATION_SOURCES: AutomationSource[] = ["client_material", "client_spec", "to_confirm_with_client"];

export interface AutomationActor {
  kind: "system" | "staff" | "participant" | "agent" | "external";
  label: string;
  role?: RoleKey;
  agentId?: AgentId;
}
export interface AutomationStep {
  actor: AutomationActor;
  action: string;
  /** Where it happens: the Pulse screen, channel or outside tool. */
  channel: string;
  output: string;
  /** Set when this step has a different basis from the automation as a whole. */
  source?: AutomationSource;
}
export interface AutomationToday {
  /** Tools used today, as named in the client material. "(to confirm)" when the material does not say. */
  tools: string[];
  /** How it is done today, in plain words. */
  how: string;
}
export type AutomationSystemRelation = "replaces" | "uses" | "to_confirm";
export interface AutomationSystemTouch { systemId: string; relation: AutomationSystemRelation; note: string }

export type AutomationTone = "ok" | "warn" | "bad" | "info" | "neutral";
export interface AutomationMetric {
  key: string;
  label: string;
  value: number;
  tone: AutomationTone;
  /** Only clinical roles see the number. Other roles see that it exists. */
  clinical?: boolean;
}
export interface AutomationMetrics {
  /** What the automation has done, with its own label. */
  runs: AutomationMetric;
  /** Open exceptions waiting for a person. */
  exceptions: AutomationMetric;
  more: AutomationMetric[];
}
export type AutomationLinkGroup = "Tasks" | "Scheduled jobs" | "Messages" | "Import batches" | "Clinical records" | "Clinic sessions" | "Records" | "Screens";
export interface AutomationLink { group: AutomationLinkGroup; id: string; label: string; sub?: string; target: NavTarget; tone?: AutomationTone }

export interface AutomationDef {
  id: string;
  name: string;
  stage: AutomationStage;
  trigger: string;
  conditions: string[];
  steps: AutomationStep[];
  outputs: string[];
  /** What it never does. */
  guardrails: string[];
  today: AutomationToday;
  /** One line: what Pulse does instead. */
  inPulse: string;
  owner: StaffId;
  source: AutomationSource;
  /** The exact basis, for example "INPUTS §1 step 2; spec MSG-01". */
  sourceRef: string;
  /** Questions to settle with Precision Health before this runs for real. */
  openQuestions: string[];
  systems: AutomationSystemTouch[];
  agents: AgentId[];
  /** Activity events this automation produces or responds to. */
  events: (e: ActivityEvent) => boolean;
  jobs?: (j: ScheduledJob) => boolean;
  tasks?: (t: Task, state: PhState) => boolean;
  metrics: (state: PhState) => AutomationMetrics;
  /** Records other than tasks and jobs, already limited to what the current role may open. */
  links: (state: PhState) => AutomationLink[];
}

/* ---- helpers ---- */
const metric = (key: string, label: string, value: number, tone: AutomationTone = "neutral", clinical = false): AutomationMetric => (clinical ? { key, label, value, tone, clinical } : { key, label, value, tone });
/** An exception count: green at zero, otherwise the given tone. */
const exception = (key: string, label: string, value: number, tone: AutomationTone = "warn", clinical = false): AutomationMetric => metric(key, label, value, value ? tone : "ok", clinical);
const entity = (group: AutomationLinkGroup, kind: EntityKind, id: Id, label: string, sub?: string, tone?: AutomationTone): AutomationLink => ({ group, id, label, sub, target: linkFor(kind, id), tone });
const screen = (id: string, label: string, target: NavTarget, sub?: string): AutomationLink => ({ group: "Screens", id, label, sub, target });
const isToday = (state: PhState, iso: string | null | undefined) => !!iso && localDateOf(iso) === today(state);
const newest = <T extends { at: string }>(xs: T[], n: number): T[] => xs.slice().sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, n);
/** Same rule as the story and task selectors: clinical review or clinical follow-up roles. */
const clinicalViewer = (state: PhState) => { const p = persona(state); return p.perms.has("clinical.view") || p.perms.has("followup.view"); };
/** Task ids of every ECG review raised, on completed episodes and on open capture drafts. */
function ecgTaskIds(state: PhState): Set<Id> {
  const ids = new Set<Id>();
  state.episodes.forEach((e) => { if (e.capture.ecgReview) ids.add(e.capture.ecgReview.taskId); });
  Object.values(state.captureDrafts).forEach((c) => { if (c.ecgReview) ids.add(c.ecgReview.taskId); });
  return ids;
}
const LABEL_TASK = /label|lab request/i;

/* ---- the registry ---- */
export const AUTOMATIONS: AutomationDef[] = [
  {
    id: "AUT-01", name: "Invitation code to programme booking page", stage: "Invite and book",
    trigger: "An administrator issues an invitation code for a programme",
    conditions: [
      "Only administrators (Programme Operations and programme oversight) create or revoke codes",
      "Each code has an expiry date and an eligibility rule",
      "Any invitation list is approved by programme oversight before a simulated send",
    ],
    steps: [
      { actor: { kind: "staff", label: "Programme Operations", role: "operations" }, action: "Issues the code centrally with a label, expiry date and eligibility rule", channel: "Programmes, Invitations", output: "Active invitation code" },
      { actor: { kind: "system", label: "Pulse" }, action: "Builds one programme booking link from the code, in place of a separate booking page per clinic day", channel: "Participant portal", output: "Programme booking link" },
      { actor: { kind: "staff", label: "Programme Operations", role: "operations" }, action: "Prepares an invitation list of eligible people who are not yet booked", channel: "Programmes, Invitations", output: "Draft list sent for approval" },
      { actor: { kind: "staff", label: "Programme oversight", role: "programme_oversight" }, action: "Confirms the recipients and approves the send", channel: "Work, Approvals", output: "Simulated send to the confirmed recipients" },
      { actor: { kind: "participant", label: "Participant" }, action: "Opens the link and joins the programme. The code never reveals the employer's participant list", channel: "Participant portal", output: "Programme membership" },
    ],
    outputs: ["One booking link per programme code", "Programme membership for each invitee", "An approval record for every invitation send"],
    guardrails: [
      "Never lets a role outside the administrators issue or revoke a code",
      "Never sends an invitation list without approval of the confirmed recipients",
      "Never reveals the employer's participant list through a code",
      "Never puts health information in an invitation message",
    ],
    today: { tools: ["Jotform"], how: "Each employer programme gets a Jotform booking page per clinic day, for example \"Cardiac Health Screening, LinkedIn, 16th October 2026\". The participant picks a date and a time slot on that page. How the link reaches employees is not described in the client material." },
    inPulse: "One centrally issued code per programme opens a single booking page covering every clinic day.",
    owner: "brenda", source: "client_spec", sourceRef: "INPUTS §6 (participant journey, administrator role); spec ENR-01. Today's booking page: INPUTS §1 step 1",
    openQuestions: ["Who issues booking links today and how they reach employees", "Whether one booking page per programme suits every employer"],
    systems: [{ systemId: "jotform", relation: "replaces", note: "A Jotform booking page per clinic day" }],
    agents: ["booking"],
    events: (e) => e.verb.startsWith("invitation."),
    tasks: (t) => t.linked.kind === "invitation",
    metrics: (s) => {
      const t = today(s);
      return {
        runs: metric("joined", "invitees joined through a code", s.memberships.filter((m) => !!m.inviteCodeId).length),
        exceptions: exception("approval", "invitation lists awaiting approval", s.invitationDrafts.filter((d) => d.status === "pending_approval" || d.status === "draft").length),
        more: [
          metric("active", "codes active", s.invitationCodes.filter((c) => c.status === "active" && c.expiresOn >= t).length, "info"),
          metric("closed", "codes expired or revoked", s.invitationCodes.filter((c) => c.status !== "active" || c.expiresOn < t).length),
          metric("notStarted", "invitees not started", programmeCounts(s).notStarted),
        ],
      };
    },
    links: (s) => [
      screen("invitations", "Invitation codes and funnel", { page: "Programmes", tab: "invitations" }, `${s.invitationCodes.length} codes across ${new Set(s.invitationCodes.map((c) => c.programmeId)).size} programmes`),
      ...s.invitationDrafts.filter((d) => d.status === "pending_approval" || d.status === "draft").map((d) => entity("Records", "invitation", d.id, `${d.id}, ${PROGRAMME_BY_ID[d.programmeId].code} invitation list`, `${d.recipientIds.length} recipients, awaiting approval`, "warn")),
    ],
  },
  {
    id: "AUT-02", name: "Consent and questionnaire gate before booking", stage: "Invite and book",
    trigger: "A participant chooses a slot on the programme booking page",
    conditions: [
      "Consent and the pre-screening questionnaire are both complete",
      "The slot is open, inside the clinic window and not in a break",
      "One active booking per participant per programme",
    ],
    steps: [
      { actor: { kind: "participant", label: "Participant" }, action: "Reads the information and consent and gives the required consent choices", channel: "Participant portal, Consent", output: "Versioned consent record" },
      { actor: { kind: "participant", label: "Participant" }, action: "Completes the questionnaire, with save and resume", channel: "Participant portal, Questionnaire", output: "Questionnaire snapshot for the screening episode" },
      { actor: { kind: "system", label: "Pulse" }, action: "Checks consent and questionnaire before the slot can be confirmed", channel: "Pulse booking rules", output: "Booking confirmed, or the reason it cannot be" },
    ],
    outputs: ["Booking confirmed only after consent and questionnaire", "Consent version recorded on the booking"],
    guardrails: [
      "Never confirms a booking while the questionnaire or consent is incomplete",
      "Staff never complete the questionnaire or consent on a participant's behalf",
      "A questionnaire draft is never counted as a booking",
    ],
    today: { tools: ["Jotform"], how: "The participant reads the consent form on the Jotform booking page, ticks the four required boxes, signs, dates and submits. The risk questions sit on the nurse form at the appointment. Neil's decision: consent and the pre-screening questionnaire must be complete before the booking is confirmed, because completion drops when they are left until afterwards." },
    inPulse: "Consent and the questionnaire are completed in the portal first. Only then can a slot be confirmed.",
    owner: "brenda", source: "client_material", sourceRef: "INPUTS §2 (consent form and Neil's decision from the earlier call)",
    openQuestions: ["Which questionnaire items, if any, may move after booking, and their deadline", "Retention period for consent records (shown as to confirm)"],
    systems: [{ systemId: "jotform", relation: "replaces", note: "Consent form on the Jotform booking page" }],
    agents: ["booking"],
    events: (e) => e.verb === "portal.completed" || e.verb === "booking.confirmed",
    metrics: (s) => {
      const c = programmeCounts(s);
      return {
        runs: metric("booked", "bookings confirmed after the gate", c.booked),
        exceptions: exception("drafts", "questionnaires in progress, cannot book yet", c.drafts, "info"),
        more: [
          metric("ready", "complete, not yet booked", c.readyToBook, "info"),
          metric("notStarted", "invitees not started", c.notStarted),
          metric("portal", "completed in the portal this session", s.memberships.filter((m) => !!m.questionnaireCompletedAt).length, "info"),
        ],
      };
    },
    links: () => [
      screen("onboarding", "Invitees with a questionnaire in progress", { page: "Participants", tab: "directory", params: { stage: "onboarding" } }),
      screen("funnel", "Invitation funnel", { page: "Programmes", tab: "invitations" }),
    ],
  },
  {
    id: "AUT-03", name: "Booking confirmation with preparation instructions", stage: "Invite and book",
    trigger: "A booking is confirmed or rescheduled",
    conditions: [
      "Sent to the verified email and mobile on the booking",
      "Logistics only: date, time, venue and preparation instructions",
      "A retried confirmation job sends no duplicate logical message",
    ],
    steps: [
      { actor: { kind: "system", label: "Pulse" }, action: "Writes the confirmation from the approved template", channel: "Pulse messages", output: "One logical confirmation per booking" },
      { actor: { kind: "system", label: "Pulse" }, action: "Sends it by email with the preparation instructions", channel: "Email (provider to confirm)", output: "Email confirmation (simulated)" },
      { actor: { kind: "system", label: "Pulse" }, action: "Sends a short SMS confirmation", channel: "SMS through Esendex", output: "SMS confirmation (simulated)", source: "client_spec" },
      { actor: { kind: "system", label: "Pulse" }, action: "Adds a calendar entry with no clinical detail in the title", channel: "Calendar (ICS) entry", output: "Calendar entry", source: "client_spec" },
    ],
    outputs: ["Email confirmation", "SMS confirmation", "Calendar entry", "Activity record"],
    guardrails: [
      "Never includes clinical details, results or sensitive programme details in email, SMS or the calendar title",
      "Never sends a duplicate logical confirmation when a job is retried",
      "A reschedule sends one updated confirmation for the new time",
    ],
    today: { tools: ["Jotform"], how: "Jotform sends a confirmation email \"with instructions before attending\". No SMS confirmation or calendar entry is described today." },
    inPulse: "Pulse sends one confirmation by email and SMS with the preparation instructions and a calendar entry.",
    owner: "brenda", source: "client_material", sourceRef: "INPUTS §1 step 2; spec MSG-01 for SMS and the calendar entry",
    openQuestions: ["Exact preparation instructions wording", "Production email provider"],
    systems: [
      { systemId: "jotform", relation: "replaces", note: "The Jotform confirmation email" },
      { systemId: "esendex", relation: "uses", note: "SMS confirmation" },
      { systemId: "email", relation: "uses", note: "Email confirmation" },
    ],
    agents: [],
    events: (e) => e.verb === "booking.confirmed" || e.verb === "booking.rescheduled",
    metrics: (s) => {
      const conf = s.messages.filter((m) => m.kind === "confirmation" && m.status !== "cancelled");
      return {
        runs: metric("sent", "confirmations sent (simulated)", conf.filter((m) => m.status === "delivered").length),
        exceptions: exception("failed", "confirmations failed", conf.filter((m) => m.status === "failed").length, "bad"),
        more: [
          metric("sms", "by SMS", conf.filter((m) => m.channel === "sms").length),
          metric("email", "by email", conf.filter((m) => m.channel === "email").length),
          metric("today", "sent today", conf.filter((m) => isToday(s, m.at)).length, "info"),
        ],
      };
    },
    links: (s) => [
      screen("comms", "Confirmations in Communications", { page: "Participants", tab: "communications", params: { filter: "confirmation" } }),
      ...newest(s.messages.filter((m) => m.kind === "confirmation"), 4).map((m) => entity("Messages", "message", m.id, m.logicalId, `${m.channel === "sms" ? "SMS" : "Email"} to ${m.destination}, ${fmtShortDateTime(m.at)}`)),
    ],
  },
  {
    id: "AUT-04", name: "24-hour reminder with failed-delivery queue", stage: "Invite and book",
    trigger: "24 hours before each clinic starts (Europe/Dublin time)",
    conditions: [
      "Only bookings made more than 24 hours ahead. Inside 24 hours the short-notice rule applies: confirmation only",
      "A cancelled or rescheduled booking has its reminder withdrawn",
      "One automatic retry, then a staff queue",
    ],
    steps: [
      { actor: { kind: "system", label: "Pulse" }, action: "Queues one reminder per booking when the booking is made", channel: "Pulse scheduler", output: "Queued reminder job" },
      { actor: { kind: "system", label: "Pulse" }, action: "Sends it 24 hours before the clinic", channel: "SMS through Esendex, or email", output: "Delivered or failed status per logical reminder" },
      { actor: { kind: "system", label: "Pulse" }, action: "Retries a failed delivery once", channel: "Provider retry", output: "Attempt history, counted separately from logical reminders" },
      { actor: { kind: "agent", label: "Ops Watchdog", agentId: "watchdog" }, action: "Opens a review task for Programme Operations when reminders fail", channel: "Work, Tasks", output: "Task with a due time" },
      { actor: { kind: "staff", label: "Programme Operations", role: "operations" }, action: "Retries each remaining failure or uses the service contact route", channel: "Participants, Communications", output: "Delivered on retry, or contact recorded" },
    ],
    outputs: ["One logical reminder per booking", "Failed-delivery queue with reasons", "Review task when reminders fail"],
    guardrails: [
      "Never sends a reminder for a cancelled booking",
      "Never creates or back-dates a reminder for a short-notice booking",
      "Never mentions clinical details in a reminder",
      "Never counts provider attempts as extra reminders",
    ],
    today: { tools: ["Esendex (to confirm)"], how: "Not described in the client material. Esendex is named today for the report access code text. Whether reminders go out today, and through which tool, is to confirm." },
    inPulse: "Pulse queues a reminder per booking, sends it 24 hours ahead, retries once and puts failures in a staff queue.",
    owner: "brenda", source: "client_spec", sourceRef: "INPUTS §6 (reminder 24 hours before); spec MSG-02",
    openQuestions: ["Whether reminders are sent today and through which provider", "The short-notice rule: provisionally confirmation only inside 24 hours"],
    systems: [
      { systemId: "esendex", relation: "to_confirm", note: "SMS reminders, provider to confirm" },
      { systemId: "email", relation: "uses", note: "Email reminders" },
    ],
    agents: ["watchdog"],
    events: (e) => e.verb.startsWith("reminder.") || (e.storyId === "ST-05" && e.actor.kind === "agent"),
    jobs: (j) => j.kind === "reminder",
    tasks: (t) => t.storyId === "ST-05",
    metrics: (s) => {
      const r = reminderStats(s);
      const rem = s.messages.filter((m) => m.kind === "reminder");
      return {
        runs: metric("logical", "logical reminders for today's clinics", r.logical),
        exceptions: exception("failed", "failed, in the staff queue", r.failed, "bad"),
        more: [
          metric("delivered", "delivered", r.delivered, "ok"),
          metric("attempts", "provider attempts", r.attempts),
          metric("queued", "queued for later clinics", rem.filter((m) => m.status === "queued").length, "info"),
          metric("withdrawn", "withdrawn with a cancelled booking", rem.filter((m) => m.status === "cancelled").length),
        ],
      };
    },
    links: (s) => [
      screen("queue", "Failed-delivery queue", { page: "Participants", tab: "communications", params: { filter: "failed" } }),
      ...s.messages.filter((m) => m.kind === "reminder" && m.attempts.some((a) => a.outcome === "failed")).map((m) =>
        entity("Messages", "message", m.id, m.logicalId, `${m.status === "failed" ? "Failed" : m.status === "delivered" ? "Delivered on retry" : "Withdrawn"}, ${m.channel === "sms" ? "SMS" : "email"} to ${m.destination}`, m.status === "failed" ? "bad" : "ok")),
    ],
  },
  {
    id: "AUT-05", name: "Booking to nurse form prefill", stage: "Clinic day",
    trigger: "The participant is checked in at the clinic",
    conditions: [
      "The booking is confirmed for today's clinic",
      "The assigned nurse or Programme Operations checks the participant in",
      "Two identifiers are confirmed before any specimen is created",
    ],
    steps: [
      { actor: { kind: "staff", label: "Nurse", role: "clinical_capture" }, action: "Checks the participant in", channel: "Clinics, Appointments", output: "Nurse form opened for the appointment" },
      { actor: { kind: "system", label: "Pulse" }, action: "Prefills registration from the booking: name, email, mobile, date of birth, company or site, employer, sex at birth and screening clinician", channel: "Pulse nurse form", output: "Registration filled from the booking" },
      { actor: { kind: "system", label: "Pulse" }, action: "Carries the questionnaire answers onto the risk sections for the nurse to confirm", channel: "Pulse nurse form", output: "Answers marked as prefilled from the questionnaire" },
      { actor: { kind: "staff", label: "Nurse", role: "clinical_capture" }, action: "Confirms date of birth and booking reference, then confirms or corrects each prefilled answer", channel: "Pulse nurse form", output: "Confirmed registration and risk answers" },
    ],
    outputs: ["Prefilled nurse form", "Two-identifier check", "Prefilled answers shown as such until confirmed"],
    guardrails: [
      "Never treats a prefilled answer as confirmed until the nurse confirms it",
      "Never creates a specimen before two identifiers are confirmed",
      "Never fills the doctor's advice field from the nurse form",
    ],
    today: { tools: ["Jotform"], how: "On the day the nurse fills the SISK Comprehensive (LAB) Screen V2 nurse form, prefilled from the booking where possible through Jotform prefilled links. The form is the clinical record." },
    inPulse: "Check-in opens the nurse form already filled from the booking and the questionnaire, for the nurse to confirm.",
    owner: "liz", source: "client_material", sourceRef: "INPUTS §1 step 3 and §3 (nurse form fields)",
    openQuestions: ["Which fields the Jotform prefilled link carries today"],
    systems: [{ systemId: "jotform", relation: "replaces", note: "Prefilled links from the booking to the nurse form" }],
    agents: [],
    events: (e) => e.verb === "clinic.checkin",
    metrics: (s) => {
      const sessions = todaySessions(s).map((x) => x.id);
      const todays = s.bookings.filter((b) => b.status === "confirmed" && sessions.includes(b.sessionId));
      const noAnswers = todays.filter((b) => {
        const m = s.memberships.find((x) => x.personId === b.personId && x.programmeId === b.programmeId);
        return !m || Object.keys(m.answers || {}).length === 0;
      }).length;
      return {
        runs: metric("prefilled", "prefilled at check-in today", todays.filter((b) => b.attendance !== "booked" && b.attendance !== "no_show").length),
        exceptions: exception("noAnswers", "today's bookings with no answers to prefill", noAnswers),
        more: [
          metric("waiting", "waiting for check-in today", todayStats(s).notArrived, "info"),
          metric("open", "nurse forms open now", Object.keys(s.captureDrafts).length),
        ],
      };
    },
    links: (s) => todaySessions(s).map((x) => {
      const st = sessionStats(s, x.id);
      return entity("Clinic sessions", "session", x.id, `${PROGRAMME_BY_ID[x.programmeId].code} clinic today, ${x.siteName}`, `Nurse ${staffName(s, x.nurseId)}. ${st.booked} booked, ${st.checkedIn + st.inProgress} in clinic, ${st.completed} completed`);
    }),
  },
  {
    id: "AUT-06", name: "Nurse referral to the doctor", stage: "Clinic day",
    trigger: "The nurse chooses Approve? = \"No. Significantly abnormal results. Refer to doctor.\"",
    conditions: ["The appointment is completed with identity confirmed", "Raised once per screening episode"],
    steps: [
      { actor: { kind: "staff", label: "Nurse", role: "clinical_capture" }, action: "Selects the referral answer and writes the nurse comments", channel: "Pulse nurse form, close-out", output: "Referral and comments in the clinical record" },
      { actor: { kind: "system", label: "Pulse" }, action: "Creates a doctor review task for the programme's clinical lead, due within 24 hours", channel: "Work, Tasks", output: "Clinical task linked to the episode" },
      { actor: { kind: "system", label: "Pulse" }, action: "Marks the episode with a visible referral and blocks the routine release shortcut", channel: "Results, Review", output: "Episode reviewed individually" },
      { actor: { kind: "staff", label: "Clinician", role: "clinical_review" }, action: "Reviews the episode individually and releases it with individual advice", channel: "Results, Review", output: "Task closes on release" },
    ],
    outputs: ["Doctor review task", "Referral marker on the episode", "Routine release shortcut blocked"],
    guardrails: [
      "Never allows the routine release shortcut for a referred episode",
      "Never closes the referral task until the report is released after individual review",
      "Referral detail is visible to clinical roles only",
    ],
    today: { tools: ["Jotform"], how: "The nurse picks \"No. Significantly abnormal results. Refer to doctor.\" in the Approve field of the nurse form. How the doctor is told today is not described in the client material." },
    inPulse: "The referral answer creates a doctor review task and blocks routine release for that episode.",
    owner: "neil", source: "client_material", sourceRef: "INPUTS §1 step 4 and §3 (close-out)",
    openQuestions: ["How the doctor is alerted today and the expected response time"],
    systems: [{ systemId: "jotform", relation: "replaces", note: "The Approve field on the Jotform nurse form" }],
    agents: [],
    events: (e) => e.verb === "clinic.nurse_referral",
    tasks: (t, s) => s.episodes.some((e) => e.nurseReferral?.taskId === t.id) || t.title.startsWith("Nurse referral"),
    metrics: (s) => {
      const referred = s.episodes.filter((e) => !!e.nurseReferral);
      return {
        runs: metric("referred", "referrals recorded", referred.length, "neutral", true),
        exceptions: exception("open", "awaiting individual review", referred.filter((e) => e.reportState !== "released").length, "warn", true),
        more: [metric("released", "released after individual review", referred.filter((e) => e.reportState === "released").length, "ok", true)],
      };
    },
    links: (s) => s.episodes.filter((e) => !!e.nurseReferral && canViewEpisodeClinical(s, e.id)).map((e) =>
      entity("Clinical records", "episode", e.id, `${e.id} (${e.screeningRef})`, e.reportState === "released" ? "Released after individual review" : "Referral open, routine release blocked", e.reportState === "released" ? "ok" : "warn")),
  },
  {
    id: "AUT-07", name: "Irregular ECG and pulse to ECG review", stage: "Clinic day",
    trigger: "ECG machine advice J or K and a manual pulse of Irregular on the nurse form",
    conditions: ["Both together: an irregular ECG with a regular pulse raises nothing", "Raised once per appointment"],
    steps: [
      { actor: { kind: "staff", label: "Nurse", role: "clinical_capture" }, action: "Records the ECG machine advice and manual pulse, and photographs the ECG", channel: "Pulse nurse form, ECG", output: "ECG fields saved" },
      { actor: { kind: "system", label: "Pulse" }, action: "Shares the ECG photo to the clinical channel", channel: "Pulse clinical alert, in place of Slack", output: "Photo kept with the clinical record (simulated)", source: "to_confirm_with_client" },
      { actor: { kind: "system", label: "Pulse" }, action: "Creates an ECG review task for the clinical lead, due within 4 hours", channel: "Work, Tasks", output: "Clinical task linked to the booking, then the episode" },
      { actor: { kind: "staff", label: "Clinician", role: "clinical_review" }, action: "Reviews the ECG photo and decides next steps", channel: "Results", output: "Task closed by the clinician" },
    ],
    outputs: ["ECG review task", "Clinical channel alert (simulated)", "Restricted activity record"],
    guardrails: [
      "Never posts the ECG photo or any identifiable detail to a general chat channel",
      "Never raises a second task for the same appointment",
      "Never interprets the ECG automatically: a clinician reviews it",
      "Visible to clinical roles only",
    ],
    today: { tools: ["Jotform", "Slack"], how: "Irregular ECG and irregular pulse: the nurse takes photos of the ECG and sends them to the Slack channel, as the nurse form instructs." },
    inPulse: "The two answers together raise an ECG review task and keep the photo inside the clinical record instead of Slack.",
    owner: "neil", source: "client_material", sourceRef: "INPUTS §1 step 4 and §3 (ECG)",
    openQuestions: ["Whether a Pulse clinical alert fully replaces the Slack channel", "Expected review time for an ECG photo"],
    systems: [
      { systemId: "slack", relation: "replaces", note: "ECG photos sent to the Slack channel (replacement to confirm)" },
      { systemId: "jotform", relation: "replaces", note: "The ECG section of the Jotform nurse form" },
    ],
    agents: [],
    events: (e) => e.verb === "clinic.ecg_review",
    tasks: (t, s) => ecgTaskIds(s).has(t.id),
    metrics: (s) => {
      const ids = ecgTaskIds(s);
      const tasks = s.tasks.filter((t) => ids.has(t.id));
      return {
        runs: metric("raised", "ECG reviews requested", ids.size, "neutral", true),
        exceptions: exception("open", "ECG review tasks open", tasks.filter((t) => t.status !== "done").length, "warn", true),
        more: [metric("drafts", "raised on an appointment still in progress", Object.values(s.captureDrafts).filter((c) => !!c.ecgReview).length, "info", true)],
      };
    },
    links: () => [],
  },
  {
    id: "AUT-08", name: "Bloods to specimen label, lab request and courier manifest", stage: "Laboratory",
    trigger: "The nurse records Bloods taken? = Yes and completes the appointment",
    conditions: [
      "Identity confirmed with two identifiers",
      "Specimen created and label previewed before completion",
      "PSA taken = Yes or FIT kit given = Yes adds that test to the expected tests",
    ],
    steps: [
      { actor: { kind: "staff", label: "Nurse", role: "clinical_capture" }, action: "Creates the specimen and previews the label", channel: "Pulse nurse form, completion checklist", output: "Specimen record with label", source: "client_spec" },
      { actor: { kind: "system", label: "Pulse" }, action: "Builds the laboratory request from the verified episode: identifiers, tests, collection time and requesting clinician", channel: "Pulse lab request", output: "Lab request (preview)", source: "client_spec" },
      { actor: { kind: "system", label: "Pulse" }, action: "Adds the specimen to the Eurofins courier manifest for the clinic day", channel: "Courier manifest", output: "Manifest line per specimen", source: "to_confirm_with_client" },
      { actor: { kind: "system", label: "Pulse" }, action: "Sets the expected tests: the programme panel, plus PSA when taken and FIT when a kit is given", channel: "Pulse screening episode", output: "Episode awaiting results" },
    ],
    outputs: ["Specimen label", "Lab request", "Courier manifest line (to confirm)", "Expected tests on the episode"],
    guardrails: [
      "Never creates a specimen before identity is confirmed",
      "Never treats a lab request as proof the laboratory received the sample",
      "Completing an appointment never releases a report",
      "Demo labels are not for laboratory use",
    ],
    today: { tools: ["Jotform", "Eurofins"], how: "Bloods go to Eurofins in Dublin. The nurse records Bloods taken?, Fit kit given? and PSA taken? on the nurse form. Label printing, request forms and courier paperwork are not described in the client material." },
    inPulse: "Completing the appointment creates the specimen, label and lab request, and sets the expected tests including PSA and FIT.",
    owner: "liz", source: "client_material", sourceRef: "INPUTS §1 step 5 and §3; spec LAB-01 for labels and requests",
    openQuestions: ["Eurofins request form and label format", "How couriers are booked today and whether a manifest is used", "Printer and label stock at each site"],
    systems: [
      { systemId: "eurofins", relation: "uses", note: "Laboratory request and courier, formats to confirm" },
      { systemId: "jotform", relation: "replaces", note: "Bloods taken, PSA taken and Fit kit given on the Jotform nurse form" },
    ],
    agents: [],
    events: (e) => e.verb === "clinic.completed",
    tasks: (t) => t.linked.kind === "session" && LABEL_TASK.test(t.title),
    metrics: (s) => {
      const add = (code: "PSA" | "FIT") => s.episodes.filter((e) => e.expectedTests.some((t) => t.code === code)).length;
      return {
        runs: metric("labels", "specimen labels generated", s.specimens.filter((x) => x.labelPrinted).length),
        exceptions: exception("collected", "specimens not yet received by the laboratory", s.specimens.filter((x) => x.status === "collected").length, "info"),
        more: [
          metric("psa", "episodes with PSA added", add("PSA"), "info"),
          metric("fit", "episodes with FIT added", add("FIT"), "info"),
          metric("pending", "expected tests still pending", expectedTestCompletion(s).pending),
        ],
      };
    },
    links: () => [screen("awaiting", "Episodes awaiting tests", { page: "Results", tab: "inbox", params: { queue: "awaiting" } })],
  },
  {
    id: "AUT-09", name: "Eurofins CSV import with identity matching", stage: "Laboratory",
    trigger: "A Eurofins results CSV arrives over FTP",
    conditions: [
      "The file has not been seen before (checksum)",
      "Columns match the versioned Eurofins mapping",
      "Each row matches on the Unique ID (COMP format) or specimen ID, cross-checked with date of birth and name",
    ],
    steps: [
      { actor: { kind: "external", label: "Eurofins" }, action: "Places the results CSV on FTP", channel: "Eurofins FTP", output: "Results file" },
      { actor: { kind: "system", label: "Pulse" }, action: "Copies the file to staging and records checksum, time and source", channel: "Pulse import staging", output: "Staged batch", source: "client_spec" },
      { actor: { kind: "agent", label: "Lab Reconciliation", agentId: "lab" }, action: "Prepares the column mapping and validation summary", channel: "Lab Reconciliation agent", output: "Mapping for a person to accept", source: "client_spec" },
      { actor: { kind: "system", label: "Pulse" }, action: "Matches each row on the Unique ID, then cross-checks date of birth and name", channel: "Pulse matching rules", output: "Accepted, duplicate or held, per row" },
      { actor: { kind: "system", label: "Pulse" }, action: "Commits accepted rows once, skips duplicates and holds conflicts", channel: "Results, Imports", output: "Observations linked to their source row" },
      { actor: { kind: "staff", label: "Programme Operations", role: "operations" }, action: "Resolves each held row with a documented two-identifier check", channel: "Results, Imports", output: "Row committed once, with the reason" },
    ],
    outputs: ["Observations linked to source rows", "Duplicate rows skipped", "Held rows for a person to resolve"],
    guardrails: [
      "Never fuzzy-matches a person",
      "Never commits a row with a date of birth or name conflict",
      "Never creates a duplicate observation on re-upload",
      "Never treats a partly imported file as fully successful",
      "Never converts a unit silently",
    ],
    today: { tools: ["Eurofins FTP", "Google Workspace"], how: "Results come back from Eurofins as CSV over FTP and are held in Google Workspace. Staff match rows to people by the Unique ID (format COMP02988) and fill the hidden lab fields on the nurse form." },
    inPulse: "Pulse stages each file, matches rows on the Unique ID with date of birth and name checks, commits accepted rows and holds conflicts for a person.",
    owner: "brenda", source: "client_material", sourceRef: "INPUTS §1 step 5; spec LAB-02 and LAB-03",
    openQuestions: ["Automated FTP retrieval (CSV reconciliation is demonstrated, retrieval is to confirm)", "Whether the file carries the Unique ID, the Eurofins specimen ID or both"],
    systems: [
      { systemId: "eurofins", relation: "uses", note: "The results CSV over FTP" },
      { systemId: "gworkspace", relation: "replaces", note: "Holding result files and matching rows by hand" },
    ],
    agents: ["lab", "quality"],
    events: (e) => e.integrationId === "eurofins" || e.integrationId === "gworkspace" || e.verb.startsWith("import.") || e.verb === "unit.confirmed",
    jobs: (j) => j.id === "JOB-IMPORT-EUROFINS" || j.id === "JOB-GW-WATCH",
    tasks: (t) => t.storyId === "ST-01",
    metrics: (s) => {
      const bl = batchList(s);
      const sum = (f: (b: (typeof bl)[number]) => number) => bl.reduce((n, b) => n + f(b), 0);
      return {
        runs: metric("batches", "batches processed", bl.length),
        exceptions: exception("held", "rows held for identity", sum((b) => b.quarantined)),
        more: [
          metric("today", "rows received today", sum((b) => (isToday(s, b.batch.processedAt) ? b.rows : 0)), "info"),
          metric("imported", "rows imported", sum((b) => b.imported), "ok"),
          metric("dups", "duplicates skipped", sum((b) => b.duplicates)),
        ],
      };
    },
    links: (s) => [
      ...batchList(s).filter((b) => b.quarantined > 0 || isToday(s, b.batch.processedAt)).concat(batchList(s).filter((b) => !b.quarantined && !isToday(s, b.batch.processedAt)).slice(0, 2)).map((b) =>
        entity("Import batches", "batch", b.batch.id, b.batch.id, `${b.rows} rows: ${b.imported} imported, ${b.duplicates} duplicates, ${b.quarantined} held`, b.quarantined ? "warn" : "ok")),
      ...s.importRows.filter((r) => r.state === "quarantined").map((r) => entity("Import batches", "row", r.id, `Held row ${r.id}`, r.quarantine ? r.quarantine.detail : undefined, "warn")),
    ],
  },
  {
    id: "AUT-10", name: "Results classified, QRISK3 added, ready for review", stage: "Clinical review",
    trigger: "Every expected result for an episode is received or accounted for",
    conditions: [
      "No identity or source unit hold is open",
      "Classification uses the clinician-owned rule set version",
      "QRISK3 only for eligible ages with complete inputs, from the licensed engine",
    ],
    steps: [
      { actor: { kind: "system", label: "Pulse" }, action: "Classifies each result into four bands with text labels: green normal, yellow borderline, orange abnormal or raised, grey not tested", channel: "Pulse rule set (illustrative v0.1)", output: "Band and label per result" },
      { actor: { kind: "system", label: "Pulse" }, action: "Takes the QRISK3 score, heart age and relative risk from the licensed engine", channel: "Licensed QRISK3 engine (sample outputs)", output: "Score with inputs and engine version, or the reason it is not calculated", source: "client_spec" },
      { actor: { kind: "agent", label: "Data Quality", agentId: "quality" }, action: "Flags displayed-flag inconsistencies, for example LDL 3.2 shown as normal against <3.0", channel: "Data Quality agent", output: "Data quality issue for a clinician" },
      { actor: { kind: "system", label: "Pulse" }, action: "Moves the episode to ready for review for its assigned clinician", channel: "Results, Review", output: "Review queue entry", source: "client_spec" },
    ],
    outputs: ["A band and a text label for every result", "QRISK3 sample output or the reason there is none", "Ready-for-review queue entry"],
    guardrails: [
      "Never shows a missing result as normal",
      "Never calculates QRISK3 in Pulse or from the public calculator",
      "Never labels a value normal when it is outside the displayed limit",
      "Never releases a report: release stays a clinician action",
    ],
    today: { tools: ["Excel"], how: "The clinician reviews in an Excel-style viewer. Cells are colour-coded: green normal, yellow borderline, orange abnormal or raised, grey not tested or not applicable. QRISK3 score, heart age and relative risk are produced today. Advice goes in the red NEW ADVICE box." },
    inPulse: "Pulse classifies every result with the same four colours plus text, adds QRISK3 from the licensed engine and queues the episode for its clinician.",
    owner: "neil", source: "client_material", sourceRef: "INPUTS §1 steps 6 and 7, §4; spec CAL-02, CAL-03 and REV-01",
    openQuestions: ["Approved thresholds per test (Medical Director)", "QRISK3 licence and integration route"],
    systems: [{ systemId: "excel", relation: "replaces", note: "Colour-coded review viewer and classification" }],
    agents: ["quality"],
    events: (e) => e.actor.kind === "agent" && e.actor.id === "quality",
    metrics: (s) => {
      const q = s.episodes.flatMap((e) => (e.qrisk ? [e.qrisk] : []));
      return {
        runs: metric("classified", "results classified", s.observations.length),
        exceptions: exception("dq", "classification issues open", s.dqIssues.filter((i) => i.status !== "resolved" && (i.kind === "flag_inconsistency" || i.kind === "source_unit" || i.kind === "missing_unit")).length),
        more: [
          metric("ready", "episodes ready for review", reviewStats(s).ready, "info"),
          metric("qrisk", "QRISK3 sample outputs", q.filter((x) => x.score10y !== null).length),
          metric("noQrisk", "QRISK3 not calculated, with a reason", q.filter((x) => x.score10y === null).length),
          metric("borderline", "borderline results", s.observations.filter((o) => o.band === "borderline").length),
          metric("abnormal", "abnormal or raised results", s.observations.filter((o) => o.band === "abnormal").length),
        ],
      };
    },
    links: (s) => [
      screen("review", "Review queue", { page: "Results", tab: "review" }, `${reviewStats(s).ready} ready for review`),
      screen("rules", "Clinical rule owner", { page: "Settings", tab: "governance", params: { item: "gov-rules" } }, "Thresholds are illustrative until approved"),
      ...(clinicalViewer(s) ? s.dqIssues.flatMap((i) => (i.status !== "resolved" && i.episodeId && canViewEpisodeClinical(s, i.episodeId)
        ? [entity("Clinical records", "episode", i.episodeId, `${i.id}: ${i.title}`, `Episode ${i.episodeId}`, "warn")] : [])) : []),
    ],
  },
  {
    id: "AUT-11", name: "Review ageing escalation", stage: "Clinical review",
    trigger: "An episode waits in the review queue for more than 48 hours",
    conditions: ["Ready for review and not released", "Age counted from when the last expected result arrived"],
    steps: [
      { actor: { kind: "system", label: "Pulse" }, action: "Counts the queue at the 12:00 and 16:00 review checkpoints", channel: "Pulse scheduler", output: "Ageing: under 24 hours, 24 to 48, 48 to 72, over 72" },
      { actor: { kind: "agent", label: "Briefing", agentId: "briefing" }, action: "Puts the aged count on the Medical Director's briefing with a link to the queue", channel: "Briefing agent", output: "Briefing line linked to Results, Review" },
      { actor: { kind: "staff", label: "Clinician", role: "clinical_review" }, action: "Reviews and releases each aged episode individually", channel: "Results, Review", output: "Queue shortens" },
    ],
    outputs: ["Aged count on the briefing", "Review checkpoint result", "Open story until the queue is clear"],
    guardrails: ["Never releases a report to shorten the queue", "Never bulk releases", "Ageing changes priority, never the clinical decision"],
    today: { tools: [], how: "Not described in the client material. How the review backlog is tracked today is to confirm." },
    inPulse: "Episodes waiting over 48 hours are counted at each review checkpoint and raised on the Medical Director's briefing.",
    owner: "neil", source: "to_confirm_with_client", sourceRef: "Spec REV-01 asks for ageing in the queue; the 48-hour threshold and the briefing escalation are Pulse proposals",
    openQuestions: ["The ageing threshold (48 hours proposed)", "Who covers the queue when the Medical Director is away"],
    systems: [],
    agents: ["briefing"],
    events: (e) => e.actor.kind === "agent" && e.actor.id === "briefing",
    jobs: (j) => j.kind === "review_checkpoint",
    tasks: (t) => t.storyId === "ST-02",
    metrics: (s) => {
      const r = reviewStats(s);
      return {
        runs: metric("ready", "in the review queue", r.ready, "info"),
        exceptions: exception("aged", "waiting over 48 hours", r.aged),
        more: [
          metric("lt24", "under 24 hours", r.buckets.lt24),
          metric("h24", "24 to 48 hours", r.buckets.h24to48),
          metric("h48", "48 to 72 hours", r.buckets.h48to72, r.buckets.h48to72 ? "warn" : "neutral"),
          metric("gt72", "over 72 hours", r.buckets.gt72, r.buckets.gt72 ? "warn" : "neutral"),
        ],
      };
    },
    links: (s) => [
      screen("aged", "Aged episodes in the review queue", { page: "Results", tab: "review", params: { filter: "aged" } }, `${reviewStats(s).aged} over 48 hours`),
      { group: "Screens", id: "briefing", label: "Briefing agent", target: linkFor("agent", "briefing") },
    ],
  },
  {
    id: "AUT-12", name: "Clinician release to report delivery", stage: "Report delivery",
    trigger: "A clinician releases a report after individual review",
    conditions: [
      "Release checklist complete: identity, every expected result, flags acknowledged, advice written, preview viewed",
      "One episode at a time, never in bulk",
    ],
    steps: [
      { actor: { kind: "staff", label: "Clinician", role: "clinical_review" }, action: "Releases the report version", channel: "Results, Review", output: "Released report version" },
      { actor: { kind: "system", label: "Pulse" }, action: "Generates the participant report from the released version", channel: "Pulse report (browser print in this demo)", output: "Report with version, clinician and release time" },
      { actor: { kind: "system", label: "Pulse" }, action: "Sends an availability notice with no results", channel: "Portal notice by email or SMS", output: "Notice delivered (simulated)", source: "client_spec" },
      { actor: { kind: "system", label: "Pulse" }, action: "Optionally emails the encrypted PDF and texts the access code, as today", channel: "Email, and SMS through Esendex", output: "Encrypted PDF and access code (simulated)", source: "to_confirm_with_client" },
      { actor: { kind: "participant", label: "Participant" }, action: "Opens the report in the portal", channel: "Participant portal", output: "Access recorded separately from delivery" },
    ],
    outputs: ["Released report version", "Availability notice without results", "Access record, separate from delivery"],
    guardrails: [
      "Never puts results, flags or advice in an email or SMS",
      "Never sends a notice before the report is published",
      "Never treats a delivery receipt as the participant having read the report",
      "Never closes a clinical follow-up on a delivery receipt",
    ],
    today: { tools: ["Headless Chrome", "Email", "Esendex"], how: "A PDF report is generated with headless Chrome and emailed to the participant as an encrypted file. The access code goes by SMS through Esendex." },
    inPulse: "Release publishes the report in the portal and sends a notice with no results. The encrypted PDF by email can stay as today's method.",
    owner: "neil", source: "client_material", sourceRef: "INPUTS §1 step 8; spec RPT-01 and RPT-02",
    openQuestions: ["Whether the encrypted PDF by email continues alongside the portal", "Retention period for released reports (to confirm)"],
    systems: [
      { systemId: "esendex", relation: "uses", note: "Access code SMS today; notice SMS in Pulse" },
      { systemId: "email", relation: "uses", note: "Encrypted PDF today; notice email in Pulse" },
    ],
    agents: ["drafting"],
    events: (e) => e.verb === "report.released" || e.verb === "notice.queued" || e.verb === "report.accessed",
    metrics: (s) => {
      const rel = s.reportVersions.filter((v) => v.status === "released");
      const notices = s.messages.filter((m) => m.kind === "report_available" && m.status !== "cancelled");
      return {
        runs: metric("released", "reports released", rel.length),
        exceptions: exception("failed", "notices failed", notices.filter((m) => m.status === "failed").length, "bad"),
        more: [
          metric("today", "released today", rel.filter((v) => isToday(s, v.releasedAt)).length, "info"),
          metric("notices", "notices sent, no results in them", notices.filter((m) => m.status === "delivered").length),
          metric("opened", "opened in the portal", rel.filter((v) => !!v.accessedAt).length, "ok"),
          metric("unopened", "not yet opened", rel.filter((v) => !v.accessedAt).length),
        ],
      };
    },
    links: (s) => [
      screen("notices", "Report notices in Communications", { page: "Participants", tab: "communications", params: { filter: "report_available" } }),
      ...newest(s.messages.filter((m) => m.kind === "report_available"), 4).map((m) => entity("Messages", "message", m.id, m.logicalId, `${m.channel === "sms" ? "SMS" : "Email"} to ${m.destination}, ${fmtShortDateTime(m.at)}`)),
    ],
  },
  {
    id: "AUT-13", name: "Correction of a released result", stage: "Report delivery",
    trigger: "A clinician starts a correction on a released report, or the laboratory sends a corrected result",
    conditions: ["A reason is recorded", "One correction in progress per episode"],
    steps: [
      { actor: { kind: "staff", label: "Clinician", role: "clinical_review" }, action: "Records the reason and the corrected values", channel: "Results, Corrections", output: "New result version; the previous value is kept" },
      { actor: { kind: "system", label: "Pulse" }, action: "Creates a new draft report version; the released version stays unchanged", channel: "Pulse report versions", output: "Draft linked to the released version" },
      { actor: { kind: "staff", label: "Clinician", role: "clinical_review" }, action: "Re-reviews and releases the new version", channel: "Results, Corrections", output: "New version released; old version superseded and kept" },
      { actor: { kind: "system", label: "Pulse" }, action: "Sends an updated-report notice with no results", channel: "Portal notice by email or SMS", output: "Notice (simulated)" },
    ],
    outputs: ["New report version", "Superseded version kept with its history", "Participant notice"],
    guardrails: ["Never edits a released report in place", "Never deletes the previous version or value", "Never releases a correction without re-review"],
    today: { tools: [], how: "Not described in the client material. How a released report is corrected and re-sent today is to confirm." },
    inPulse: "A correction creates a new version for re-review. The old version is kept and the participant gets a notice.",
    owner: "neil", source: "client_spec", sourceRef: "INPUTS §6 (amended state); spec CLN-04, LAB-03 and RPT-02",
    openQuestions: ["Contact plan for clinically significant corrections"],
    systems: [],
    agents: [],
    events: (e) => e.verb === "correction.started" || (e.verb === "report.released" && e.summary.includes("(correction)")),
    metrics: (s) => ({
      runs: metric("released", "corrections released", s.reportVersions.filter((v) => !!v.correctionReason && v.status !== "in_review" && v.status !== "draft").length),
      exceptions: exception("review", "corrections in re-review", s.reportVersions.filter((v) => !!v.correctionReason && (v.status === "in_review" || v.status === "draft")).length),
      more: [
        metric("superseded", "superseded versions kept", s.reportVersions.filter((v) => v.status === "superseded").length),
        metric("values", "corrected result values", s.observations.filter((o) => o.correction?.kind === "result_correction").length),
      ],
    }),
    links: (s) => [
      screen("corrections", "Corrections", { page: "Results", tab: "corrections" }),
      ...s.reportVersions.filter((v) => !!v.correctionReason && canViewEpisodeClinical(s, v.episodeId)).map((v) =>
        entity("Clinical records", "report", v.id, `${v.id}`, v.status === "released" ? `Released, supersedes ${v.supersedes || "the earlier version"}` : "In re-review", v.status === "released" ? "ok" : "warn")),
    ],
  },
  {
    id: "AUT-14", name: "Urgent clinical follow-up", stage: "Clinical review",
    trigger: "A clinician assigns an urgent clinical contact for a critical finding",
    conditions: ["An owner and a due time are set", "The episode's report is held while the follow-up is open"],
    steps: [
      { actor: { kind: "staff", label: "Clinician", role: "clinical_review" }, action: "Assigns the follow-up with an owner and a due time", channel: "Results, Follow-up", output: "Follow-up and linked clinical task" },
      { actor: { kind: "staff", label: "Follow-up owner", role: "clinical_review" }, action: "Records each contact attempt: channel, result and note", channel: "Results, Follow-up", output: "Attempt history; the item stays open" },
      { actor: { kind: "staff", label: "Follow-up owner", role: "clinical_review" }, action: "Escalates if it is not resolved", channel: "Results, Follow-up", output: "Escalation recorded (illustrative)" },
      { actor: { kind: "staff", label: "Follow-up owner", role: "clinical_review" }, action: "Closes it with a documented outcome and acknowledgement", channel: "Results, Follow-up", output: "Hold lifted; the episode returns to review" },
    ],
    outputs: ["Owned follow-up with a due time", "Contact attempt history", "Documented outcome"],
    guardrails: [
      "Only a documented outcome with acknowledgement closes it",
      "Never closed by a delivered message, an email receipt or a portal view",
      "Detail visible to clinical roles only",
    ],
    today: { tools: [], how: "Not described in the client material. The urgent follow-up protocol is a Medical Director decision the specification lists as needed before contract." },
    inPulse: "A follow-up has an owner and a due time, logs every attempt and closes only with a documented outcome.",
    owner: "neil", source: "client_spec", sourceRef: "INPUTS §6 (critical results start an escalation a notification cannot close); spec REV-03",
    openQuestions: ["The approved urgent follow-up protocol and escalation route"],
    systems: [],
    agents: [],
    events: (e) => e.verb.startsWith("followup."),
    tasks: (t) => t.linked.kind === "followup",
    metrics: (s) => {
      const all = followUpList(s);
      const urgent = all.filter((f) => f.followUp.kind === "urgent_clinical_contact");
      return {
        runs: metric("urgent", "urgent follow-ups assigned", urgent.length, "neutral", true),
        exceptions: exception("overdue", "urgent and overdue", urgent.filter((f) => f.followUp.status === "open" && f.overdue).length, "bad", true),
        more: [
          metric("open", "urgent and open", urgent.filter((f) => f.followUp.status === "open").length, "warn", true),
          metric("attempts", "contact attempts recorded", all.reduce((n, f) => n + f.followUp.attempts.length, 0), "neutral", true),
          metric("routine", "routine call-backs open", all.filter((f) => f.followUp.kind === "routine_callback" && f.followUp.status === "open").length, "info", true),
        ],
      };
    },
    links: (s) => (clinicalViewer(s) ? followUpList(s).filter((f) => canViewEpisodeClinical(s, f.episode.id)).map((f) =>
      entity("Clinical records", "followup", f.followUp.id, `${f.followUp.id}, ${f.followUp.kind === "urgent_clinical_contact" ? "urgent contact" : "routine call-back"}`, `${f.followUp.status === "open" ? (f.overdue ? "Overdue" : "Open") : "Closed"}, owner ${staffName(s, f.followUp.ownerId)}, due ${fmtShortDateTime(f.followUp.dueAt)}`, f.followUp.status === "open" ? (f.overdue ? "bad" : "warn") : "ok"))
      : [screen("followup", "Clinical follow-up", { page: "Results", tab: "follow-up" }, "Detail limited to clinical roles")]),
  },
  {
    id: "AUT-15", name: "Programme end to employer report", stage: "Employer reporting",
    trigger: "A programme reaches its interim or final report milestone",
    conditions: [
      "Released reports only, up to the data-as-of time",
      "Cohort at or above the minimum size",
      "Cells below the threshold suppressed, with complementary suppression",
    ],
    steps: [
      { actor: { kind: "system", label: "Pulse" }, action: "Builds the aggregate draft from released reports", channel: "Reporting, Report Builder", output: "Draft with denominators and methodology" },
      { actor: { kind: "agent", label: "Programme Reporting", agentId: "reporting" }, action: "Prepares charts and an optional narrative from the disclosure-controlled snapshot", channel: "Programme Reporting agent", output: "Draft narrative for clinician approval" },
      { actor: { kind: "staff", label: "Programme reporting", role: "programme_reporting" }, action: "Completes the disclosure review", channel: "Reporting, Report Builder", output: "Cohort confirmed safe to share" },
      { actor: { kind: "staff", label: "Clinician", role: "clinical_review" }, action: "Approves the figures and the narrative", channel: "Work, Approvals", output: "Snapshot frozen" },
      { actor: { kind: "staff", label: "Programme reporting", role: "programme_reporting" }, action: "Exports PDF and PowerPoint from the same snapshot for the employer", channel: "Reporting, Exports", output: "Employer files (browser previews in this demo)", source: "client_spec" },
    ],
    outputs: ["Approved aggregate snapshot", "PDF and PowerPoint with the same numbers", "Log of blocked selections"],
    guardrails: [
      "Never exports a cohort under the minimum size",
      "Never shows a suppressed cell or a total that reveals one",
      "Never includes identifiable records, free text or row-level results",
      "Never exports before clinician approval",
    ],
    today: { tools: [], how: "At the end of the programme, anonymised aggregate data goes to the employer. The tools used to prepare it are not described in the client material." },
    inPulse: "Pulse drafts the employer report from released reports, suppresses small cells and exports PDF and PowerPoint only after clinician approval.",
    owner: "martina", source: "client_material", sourceRef: "INPUTS §1 step 9; spec ANA-01 to ANA-04",
    openQuestions: ["Minimum cohort and suppression rule (DPO approval)", "Employer report template and recipient"],
    systems: [],
    agents: ["reporting"],
    events: (e) => e.entity?.kind === "employer_report" || e.verb === "export.blocked",
    jobs: (j) => j.kind === "report_milestone",
    tasks: (t) => t.linked.kind === "employer_report",
    metrics: (s) => ({
      runs: metric("drafts", "employer reports drafted", s.employerReports.length),
      exceptions: exception("signoff", "awaiting sign-off", s.approvals.filter((a) => a.type === "employer_report" && a.status === "pending").length),
      more: [
        metric("blocked", "small-cohort selections blocked", s.employerReports.reduce((n, r) => n + r.blockedAttempts, 0), "info"),
        metric("exports", "exports created", s.exports.length),
        metric("milestones", "milestones still to come", s.jobs.filter((j) => j.kind === "report_milestone" && !!j.nextRunAt && j.nextRunAt >= s.clock.nowUtc).length),
      ],
    }),
    links: (s) => s.employerReports.map((r) => entity("Records", "employer_report", r.id, `${r.id}, ${r.title}`, `Status ${r.status}, version ${r.version}`, r.status === "approved" || r.status === "exported" ? "ok" : "warn")),
  },
  {
    id: "AUT-16", name: "Clinic scheduled to nurse assignment", stage: "Operations",
    trigger: "A clinic day is scheduled or edited",
    conditions: ["A nurse and any support staff are assigned", "No nurse, support or room overlap", "Edits that affect bookings show the impact first"],
    steps: [
      { actor: { kind: "staff", label: "Programme Operations", role: "operations" }, action: "Schedules the clinic: date, site, room, times and breaks", channel: "Clinics, Schedule", output: "Clinic session with bookable slots", source: "client_spec" },
      { actor: { kind: "staff", label: "Director of Nursing", role: "nursing_lead" }, action: "Assigns the nurse and support staff", channel: "Clinics, Team & Resources", output: "Assignment on the session" },
      { actor: { kind: "system", label: "Pulse" }, action: "Checks nurse, support and room overlaps across sessions before saving", channel: "Pulse schedule rules", output: "Overlap list, empty when clear" },
      { actor: { kind: "agent", label: "Ops Watchdog", agentId: "watchdog" }, action: "Re-checks each morning and flags clashes and capacity gaps", channel: "Ops Watchdog agent", output: "Flag for a person" },
      { actor: { kind: "system", label: "Pulse" }, action: "Generates the clinic preparation checklist the day before", channel: "Work, Schedules", output: "Preparation tasks" },
      { actor: { kind: "external", label: "Monday.com" }, action: "Holds the nurse coordination reference, with no clinical values", channel: "Monday.com", output: "Operational reference", source: "to_confirm_with_client" },
    ],
    outputs: ["Assigned clinic session", "Overlap check", "Preparation checklist"],
    guardrails: ["Never deletes a booking when a session is edited", "Never saves a session with a nurse or room overlap", "Never puts clinical values into Monday.com"],
    today: { tools: ["Monday.com"], how: "Monday.com is used for business operations and nurse coordination. It is not the clinical record. How nurses are assigned to clinic days and how clashes are caught is not described." },
    inPulse: "Each clinic carries its nurse and support assignment, with overlaps checked before saving.",
    owner: "liz", source: "to_confirm_with_client", sourceRef: "INPUTS §1 step 10 (Monday.com); spec SCH-01. The assignment flow itself is not described",
    openQuestions: ["What Monday.com does for nurse coordination today and whether it stays", "Who assigns nurses to clinic days"],
    systems: [{ systemId: "monday", relation: "to_confirm", note: "Nurse coordination today; its role alongside Pulse is to confirm" }],
    agents: ["watchdog"],
    events: (e) => e.verb === "session.edited" || e.verb === "clinic.prep" || e.integrationId === "monday" || (e.actor.kind === "agent" && e.actor.id === "watchdog" && e.verb === "agent.checked"),
    jobs: (j) => j.kind === "clinic_prep",
    tasks: (t) => t.linked.kind === "session" && !LABEL_TASK.test(t.title),
    metrics: (s) => {
      const upcoming = sessionsBetween(s, today(s), "2099-12-31");
      return {
        runs: metric("sessions", "clinic sessions from today", upcoming.length),
        exceptions: exception("overlaps", "staff or room overlaps", scheduleOverlaps(s).length, "bad"),
        more: [
          metric("today", "clinics today", todaySessions(s).length, "info"),
          metric("support", "upcoming sessions with support staff", upcoming.filter((x) => x.supportIds.length > 0).length),
        ],
      };
    },
    links: (s) => sessionsBetween(s, today(s), "2099-12-31").slice(0, 6).map((x) =>
      entity("Clinic sessions", "session", x.id, `${PROGRAMME_BY_ID[x.programmeId].code} clinic, ${fmtDayMonth(x.date)}`, `${x.siteName}, nurse ${staffName(s, x.nurseId)}${x.supportIds.length ? `, support ${x.supportIds.map((id) => staffName(s, id)).join(", ")}` : ""}`)),
  },
];

/* ---- lookups ---- */
export const AUTOMATION_BY_ID: Record<string, AutomationDef> = Object.fromEntries(AUTOMATIONS.map((a) => [a.id, a]));
export const automationById = (id: string | null | undefined): AutomationDef | undefined => (id ? AUTOMATION_BY_ID[id] : undefined);
/** The automation a scheduled job belongs to, when one is obvious. */
export const automationForJob = (j: ScheduledJob): AutomationDef | undefined => AUTOMATIONS.find((a) => !!a.jobs && a.jobs(j));
export const automationsForSystem = (systemId: string): Array<{ automation: AutomationDef; touch: AutomationSystemTouch }> =>
  AUTOMATIONS.flatMap((a) => a.systems.filter((x) => x.systemId === systemId).map((touch) => ({ automation: a, touch })));
export const automationsForAgent = (agentId: AgentId): AutomationDef[] => AUTOMATIONS.filter((a) => a.agents.includes(agentId));
export const automationTarget = (id: string): NavTarget => ({ page: "Work", tab: "automations", params: { automation: id } });

/** Activity events for one automation, as the current role may read them. Newest first. */
export const automationEvents = (state: PhState, a: AutomationDef) => activityFeed(state).filter((v) => a.events(v.event));
/** Scheduled jobs for one automation, with their derived result text. */
export const automationJobs = (state: PhState, a: AutomationDef) => { const f = a.jobs; return f ? jobViews(state).filter((j) => f(j)) : []; };
/** Tasks for one automation that the current role may see. */
export const automationTasks = (state: PhState, a: AutomationDef): TaskView[] => { const f = a.tasks; return f ? visibleTasks(state).filter((t) => f(t.task, state)) : []; };

/** Every linked record for one automation: tasks, jobs and its own links, limited to the current role. */
export function automationRecords(state: PhState, a: AutomationDef): AutomationLink[] {
  const tasks: AutomationLink[] = automationTasks(state, a).map((t) => ({
    group: "Tasks", id: t.task.id, label: `${t.task.id}: ${t.title}`, sub: `${t.statusLabel}, ${t.ownerName}`,
    target: { page: "Work", tab: "tasks", params: { task: t.task.id } }, tone: t.status === "done" ? "ok" : t.overdue ? "bad" : t.status === "blocked" ? "warn" : "info",
  }));
  const jobs: AutomationLink[] = automationJobs(state, a).map((j) => ({
    group: "Scheduled jobs", id: j.id, label: j.name, sub: j.nextRunAt ? `Next run ${fmtShortDateTime(j.nextRunAt)}` : j.lastRunAt ? `Last run ${fmtShortDateTime(j.lastRunAt)}` : j.cadence,
    target: { page: "Work", tab: "schedules", params: { job: j.id } }, tone: j.status === "failed" ? "bad" : j.status === "ok" ? "ok" : "neutral",
  }));
  return [...tasks, ...jobs, ...a.links(state)];
}

/* ---- systems register addition ---- */
/**
 * Slack, as named on the nurse form today. It belongs in the systems register (INTEGRATIONS in
 * constants.ts); until it is added there, Settings, Systems appends it from here. No Slack
 * connection is built or claimed.
 */
/** Slack now lives in the systems register; kept as a named export for existing imports. */
export const SLACK_SYSTEM: IntegrationDef = INTEGRATIONS.find((x) => x.id === "slack")!;
