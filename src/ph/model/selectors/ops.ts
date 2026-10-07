/* Operations selectors: the six stories, tasks, approvals, reminders, jobs, activity feeds,
   invitations. Task and story status is derived from the underlying item, so closing a
   wrapper can never bypass a clinical or identity requirement. Text that carries clinical
   detail follows the same per-episode rule as the clinical pages, and the participant
   preview gets none of these staff-wide views. */
import type {
  ActivityEvent, Approval, EntityRef, Id, InvitationCode, InvitationDraft, Message, PhState, ProgrammeId, Story, StoryId, Task,
} from "../types";
import { HEALTH_INFO_PATTERN, STORY_DEFS } from "../constants";
import { fmtTime, hoursBetween, localDateOf } from "../time";
import type { NavTarget } from "../nav";
import { linkFor } from "../nav";
import { canViewEpisodeClinical, episodeIdOfEntity, ix, memo, membershipOf, persona, plural, programmeCounts, sessionStats, today, staffName } from "./core";
import { batchStats, holdQueueAll, releaseChecklist, reviewStats, reviewQueueAll } from "./clinical";
import { cohortEpisodes, cohortFromKey, cohortSizeLabel } from "./reporting";

/* ---- reminders and messages ---- */
/** Logical reminders for one clinic day. A reminder cancelled with its booking is not counted and cannot be retried. */
export interface ReminderStats { cohort: string; logical: number; delivered: number; failed: number; queued: number; attempts: number; autoRetries: number; manualRetries: number }
export function reminderStats(state: PhState, cohort?: string): ReminderStats {
  const c = cohort || today(state);
  return memo(state, "rem:" + c, () => {
    const m = state.messages.filter((x) => x.kind === "reminder" && x.cohort === c && x.status !== "cancelled");
    const attempts = m.reduce((n, x) => n + x.attempts.length, 0);
    return {
      cohort: c, logical: m.length, delivered: m.filter((x) => x.status === "delivered").length, failed: m.filter((x) => x.status === "failed").length,
      queued: m.filter((x) => x.status === "queued").length, attempts, autoRetries: m.reduce((n, x) => n + x.attempts.filter((a) => a.auto).length, 0),
      manualRetries: m.reduce((n, x) => n + x.attempts.filter((a, i) => i > 0 && !a.auto).length, 0),
    };
  });
}
export const failedReminders = (state: PhState): Message[] => state.messages.filter((m) => m.kind === "reminder" && m.status === "failed");
export const messagesSorted = (state: PhState): Message[] => memo(state, "msgs", () => state.messages.slice().sort((a, b) => (a.at < b.at ? 1 : -1)));
export const SERVICE_CONTACT_ROUTE: Record<"sms" | "email", string> = {
  sms: "Call the verified mobile number on the booking from the Programme Operations line, or send the standard email confirmation to the verified address. Do not use personal channels. Never mention clinical details.",
  email: "Send the reminder by SMS to the verified mobile on the booking, or call the verified number from the Programme Operations line. Do not use personal channels. Never mention clinical details.",
};

/* ---- stories ---- */
export interface StoryView {
  def: Story;
  open: boolean;
  headline: string;
  detail: string;
  target: NavTarget;
  ownerName: string;
  secondaryName: string | null;
  dueAt: string | null;
  tasks: Task[];
  /** Operations roles see only this for clinical stories. */
  restricted: boolean;
}
export function storyOpen(state: PhState, id: StoryId): boolean {
  switch (id) {
    case "ST-01": return state.importRows.some((r) => r.state === "quarantined");
    case "ST-02": return state.episodes.some((e) => e.reportState === "ready_for_review");
    case "ST-03": return state.invitationDrafts.some((d) => d.programmeId === "PRG-IBM-26" && (d.status === "draft" || d.status === "pending_approval"));
    case "ST-04": return state.followUps.some((f) => f.id === "FU-0001" && f.status === "open");
    case "ST-05": return state.messages.some((m) => m.kind === "reminder" && m.status === "failed");
    case "ST-06": return state.employerReports.some((r) => r.id === "ER-SISK-01" && (r.status === "draft" || r.status === "reviewed"));
  }
}
/** A clinical task as a role outside the clinical team sees it: that it exists, with no clinical wording. */
const minimalTask = (t: Task): Task => ({ ...t, title: "Clinical action assigned", detail: "A clinician owns this task. No clinical detail is shown to this role." });

export function storyView(state: PhState, id: StoryId): StoryView {
  const def = STORY_DEFS.find((s) => s.id === id)!;
  const p = persona(state);
  const open = storyOpen(state, id);
  const tasks = state.tasks.filter((t) => t.storyId === id);
  let headline = def.title, detail = def.summary, target: NavTarget = { page: "Home" };
  const clinicalViewer = p.perms.has("clinical.view") || p.perms.has("followup.view");
  if (p.isParticipant) {
    // The participant preview shows own records only. Staff stories are not part of it.
    return { def: { ...def, title: "Not shown in the participant preview", summary: "" }, open, headline: "Not shown in the participant preview", detail: "", target, ownerName: "", secondaryName: null, dueAt: null, tasks: [], restricted: true };
  }
  switch (id) {
    case "ST-01": {
      const q = state.importRows.filter((r) => r.state === "quarantined").length;
      const b = batchStats(state, "BATCH-20261002-01");
      headline = q ? `${plural(q, "laboratory identity exception")}` : "Laboratory identity exceptions resolved";
      detail = `Eurofins batch: ${b.imported} observation rows imported, ${b.duplicates} duplicates skipped, ${b.quarantined} held for review. These are rows, not people.`;
      target = { page: "Results", tab: "imports", params: { batch: "BATCH-20261002-01" } };
      break;
    }
    case "ST-02": {
      const r = reviewStats(state);
      headline = r.ready ? `${r.ready} reports ready for review, ${r.aged} waiting over 48 hours` : "Review queue is clear";
      detail = `${r.routine} routine and ${r.flagged} individually flagged. The ${r.aged} aged reports are part of the ${r.ready}, not an extra queue.`;
      target = { page: "Results", tab: "review" };
      break;
    }
    case "ST-03": {
      const s = state.sessions.find((x) => x.programmeId === "PRG-IBM-26" && x.date === today(state));
      const st = s ? sessionStats(state, s.id) : null;
      const drafts = programmeCounts(state, "PRG-IBM-26").drafts;
      headline = st ? `IBM clinic has ${st.available} available slots today` : "No IBM clinic today";
      detail = st ? `${st.booked} of ${st.slots} booked (${st.pct.toFixed(0)}%). ${plural(drafts, "invitee")} with an in-progress questionnaire ${drafts === 1 ? "has" : "have"} no confirmed booking yet. Available capacity, not lost revenue.` : "";
      target = { page: "Programmes", tab: "invitations", params: { draft: "INV-IBM-01" } };
      break;
    }
    case "ST-04": {
      const f = state.followUps.find((x) => x.id === "FU-0001");
      const due = f ? fmtTime(f.dueAt) : "09:00";
      if (!clinicalViewer) { headline = f && f.status === "open" ? "Clinical action assigned" : "Clinical action complete"; detail = "A clinician owns this item. No clinical detail is shown to this role."; target = { page: "Work", tab: "tasks" }; }
      else {
        const overdue = !!f && f.status === "open" && Date.parse(f.dueAt) < Date.parse(state.clock.nowUtc);
        headline = f && f.status === "closed" ? "Urgent follow-up closed with a documented outcome" : overdue ? `One clinical follow-up overdue since ${due}` : `One clinical follow-up due at ${due}`;
        detail = "Recording a contact attempt does not complete it. A documented outcome and acknowledgement are required. An email delivery cannot close it.";
        target = { page: "Results", tab: "follow-up", params: { followup: "FU-0001" } };
      }
      break;
    }
    case "ST-05": {
      const r = reminderStats(state);
      headline = r.failed ? `${plural(r.failed, "failed reminder")} to resolve` : "All reminders delivered";
      detail = `${r.delivered} of ${r.logical} logical reminders delivered. ${r.attempts} provider attempts in total, counted separately.`;
      target = { page: "Participants", tab: "communications", params: { filter: "failed" } };
      break;
    }
    case "ST-06": {
      const er = state.employerReports.find((x) => x.id === "ER-SISK-01");
      headline = !er ? "Employer report" : er.status === "draft" ? "Sisk employer report needs disclosure review" : er.status === "reviewed" ? "Sisk employer report awaits clinician narrative approval" : "Sisk employer report approved";
      // The last blocked selection, stated safely: a hidden size reads "fewer than 5".
      const last = er && er.lastBlockedKey ? cohortEpisodes(state, cohortFromKey(er.programmeId, er.lastBlockedKey), er.dataAsOf).length : null;
      const lastText = last === null ? "A small cohort" : `A cohort of ${cohortSizeLabel(last, state.settings.suppressionThreshold).label} participants`;
      detail = er ? `Draft built from released reports only. ${er.blockedAttempts ? `${lastText} was blocked from employer output.` : ""}`.trim() : "";
      target = { page: "Reporting", tab: "report-builder", params: { report: "ER-SISK-01" } };
      break;
    }
  }
  const restricted = def.clinical && !clinicalViewer;
  return {
    def: restricted && id === "ST-04" ? { ...def, title: "Clinical action assigned", summary: "A clinician owns this item. No clinical detail is shown to this role." } : def,
    open, headline, detail, target, ownerName: staffName(state, def.ownerId), secondaryName: def.secondaryOwnerId ? staffName(state, def.secondaryOwnerId) : null,
    dueAt: def.dueAt, tasks: clinicalViewer ? tasks : tasks.map((t) => (t.clinical ? minimalTask(t) : t)), restricted,
  };
}
/** Every story as this role sees it. Empty in the participant preview. */
export const storyViews = (state: PhState): StoryView[] => memo(state, "stories", () => (persona(state).isParticipant ? [] : STORY_DEFS.map((s) => storyView(state, s.id))));
export const openStories = (state: PhState) => storyViews(state).filter((s) => s.open);

/* ---- tasks ---- */
export interface TaskView {
  task: Task;
  title: string;
  status: "open" | "done" | "blocked";
  statusLabel: string;
  overdue: boolean;
  ownerName: string;
  target: NavTarget;
  canMarkDone: boolean;
  blockReason: string | null;
  visible: boolean;
}
function derivedTaskStatus(state: PhState, t: Task): { status: TaskView["status"]; blockReason: string | null; derived: boolean } {
  const done = (b: boolean, why: string) => ({ status: (b ? "done" : "open") as TaskView["status"], blockReason: b ? null : why, derived: true });
  switch (t.id) {
    case "TSK-0001": return done(!state.importRows.some((r) => r.state === "quarantined"), "Resolve each held row in Results, Imports.");
    case "TSK-0002": {
      const held = holdQueueAll(state).filter((h) => h.category === "identity");
      if (held.length) return { status: "blocked", blockReason: `Waiting for ${plural(held.length, "identity exception")} to be resolved.`, derived: true };
      const identityEps = ["PH-E-0102", "PH-E-0202", "PH-E-0301"].map((id) => ix(state).episodeById.get(id)!);
      return done(identityEps.every((e) => e.reportState === "released"), "Review and release the episodes that were held for identity.");
    }
    case "TSK-0003": return done(reviewQueueAll(state).length === 0, "Review and release each ready episode individually.");
    case "TSK-0004": return done(state.invitationDrafts.every((d) => d.programmeId !== "PRG-IBM-26" || (d.status !== "draft" && d.status !== "pending_approval")), "Decide the IBM invitation list in Work, Approvals.");
    case "TSK-0006": return done(!state.followUps.some((f) => f.id === "FU-0001" && f.status === "open"), "Record a documented outcome and acknowledgement in Results, Follow-up.");
    case "TSK-0007": return done(!state.messages.some((m) => m.kind === "reminder" && m.status === "failed"), "Retry or resolve each failed reminder in Participants, Communications.");
    case "TSK-0008": { const r = state.employerReports.find((x) => x.id === "ER-SISK-01"); return done(!!r && r.status !== "draft", "Complete the disclosure review in Reporting, Report Builder."); }
    case "TSK-0009": { const r = state.employerReports.find((x) => x.id === "ER-SISK-01"); return done(!!r && r.narrativeApproved, "Approve the clinical narrative in Reporting, Report Builder."); }
    case "TSK-0015":
    case "TSK-0016": { const f = state.followUps.find((x) => x.taskId === t.id); return done(!!f && f.status === "closed", "Record the follow-up outcome in Results, Follow-up."); }
  }
  // A nurse referral task closes when the referred episode's report is released after individual review.
  const referred = state.episodes.find((e) => e.nurseReferral?.taskId === t.id);
  if (referred) return done(referred.reportState === "released", "Review the referred episode individually, then release it.");
  return { status: t.status === "done" ? "done" : "open", blockReason: null, derived: false };
}
export function taskTitle(state: PhState, t: Task): string {
  switch (t.id) {
    case "TSK-0001": { const q = state.importRows.filter((r) => r.state === "quarantined").length; return q ? `Resolve ${plural(q, "laboratory identity exception")}` : "Laboratory identity exceptions resolved"; }
    case "TSK-0003": { const r = reviewStats(state); return `Clear the review queue (${r.ready} ready, ${r.aged} over 48 hours)`; }
    case "TSK-0004": { const s = state.sessions.find((x) => x.programmeId === "PRG-IBM-26" && x.date === today(state)); const a = s ? sessionStats(state, s.id).available : 0; return `Decide how to fill ${a} available IBM slots today`; }
    case "TSK-0007": { const f = failedReminders(state).length; return f ? `Review ${plural(f, "failed reminder")}` : "Failed reminders reviewed"; }
  }
  return t.title;
}
export function taskViews(state: PhState): TaskView[] {
  return memo(state, "tasks", () => {
    const p = persona(state);
    const clinicalViewer = p.perms.has("followup.view") || p.perms.has("clinical.view");
    return state.tasks.map((t) => {
      const d = derivedTaskStatus(state, t);
      const overdue = d.status !== "done" && !!t.dueAt && Date.parse(t.dueAt) < Date.parse(state.clock.nowUtc);
      const supervisor = p.perms.has("bookings.manage") || p.perms.has("clinical.review");
      return {
        task: t, title: taskTitle(state, t), status: d.status, statusLabel: d.status === "done" ? "Done" : d.status === "blocked" ? "Blocked" : overdue ? "Overdue" : "Open",
        overdue, ownerName: staffName(state, t.ownerId), target: linkFor(t.linked.kind, t.linked.id),
        canMarkDone: !p.isParticipant && !d.derived && d.status !== "done" && (t.ownerId === p.id || supervisor), blockReason: d.derived && d.status !== "done" ? d.blockReason : null,
        visible: !p.isParticipant && (!t.clinical || clinicalViewer),
      };
    });
  });
}
export const visibleTasks = (state: PhState) => taskViews(state).filter((t) => t.visible);

/* ---- invitations: prerequisites shared by the approval checklist and the decide action ---- */
/** Recipients on a draft who are no longer on the programme, no longer eligible or already have a confirmed booking on it. */
export function invitationRecipientIssues(state: PhState, draft: InvitationDraft): Array<{ personId: Id; reason: "not_on_programme" | "not_eligible" | "booked" }> {
  const I = ix(state);
  const out: Array<{ personId: Id; reason: "not_on_programme" | "not_eligible" | "booked" }> = [];
  for (const id of draft.recipientIds) {
    const m = membershipOf(state, id, draft.programmeId);
    if (!m) out.push({ personId: id, reason: "not_on_programme" });
    else if (!m.eligible) out.push({ personId: id, reason: "not_eligible" });
    else if (m.stage === "booked" || (I.bookingsByPerson.get(id) || []).some((b) => b.status === "confirmed" && b.programmeId === draft.programmeId)) out.push({ personId: id, reason: "booked" });
  }
  return out;
}

/* ---- approvals ---- */
export interface ApprovalView {
  id: Id;
  type: Approval["type"];
  title: string;
  requestedBy: string;
  reviewerId: string;
  status: Approval["status"];
  target: EntityRef;
  createdAt: string;
  checklist: Array<{ label: string; done: boolean }>;
  derived: boolean;
  canDecide: boolean;
  visible: boolean;
}
export function approvalViews(state: PhState): ApprovalView[] {
  return memo(state, "approvals", () => {
    const p = persona(state);
    const out: ApprovalView[] = [];
    for (const e of state.episodes.filter((x) => x.reportState === "ready_for_review")) {
      // Release approvals follow the per-episode rule: capture nurses see only their own clinics' episodes.
      const visible = canViewEpisodeClinical(state, e.id);
      const cl = releaseChecklist(state, e).map((c) => ({ label: !visible && c.key === "flags" ? "Review flags checked by the clinician" : c.label, done: c.done }));
      out.push({
        id: `APR-REL-${e.id}`, type: "report_release", title: `Release report ${e.id}`, requestedBy: "system", reviewerId: e.reviewAssigneeId || "neil", status: "pending",
        target: { kind: "episode", id: e.id }, createdAt: e.readyAt || state.clock.nowUtc, checklist: cl, derived: true,
        canDecide: p.perms.has("clinical.review") && visible, visible,
      });
    }
    for (const a of state.approvals) {
      let checklist: Array<{ label: string; done: boolean }> = [];
      if (a.type === "invitation_prep") {
        const d = state.invitationDrafts.find((x) => x.id === a.target.id);
        checklist = [
          { label: "Draft prepared by Programme Operations", done: !!d },
          { label: "Recipients are eligible and not already booked", done: !!d && invitationRecipientIssues(state, d).length === 0 },
          { label: "Message contains no health information", done: !!d && !HEALTH_INFO_PATTERN.test(d.message) && !HEALTH_INFO_PATTERN.test(d.title) },
          { label: "Programme oversight confirms the recipients", done: a.status === "approved" },
        ];
      } else if (a.type === "employer_report") {
        const r = state.employerReports.find((x) => x.id === a.target.id);
        checklist = [
          { label: "Cohort defined with a stated denominator", done: !!r },
          { label: "Disclosure review complete (cohort not blocked)", done: !!r && r.status !== "draft" },
          { label: "Clinical narrative approved by a clinician", done: !!r && r.narrativeApproved },
          { label: "Snapshot frozen for PDF and PowerPoint previews", done: !!r && !!r.snapshot },
        ];
      } else if (a.type === "form_publication") {
        const t = state.forms.templates.find((x) => x.id === a.target.id);
        const v = t?.versions.find((x) => x.status === "pending_approval" || x.status === "draft");
        checklist = [
          { label: "Every block is a clinically approved version", done: !!v },
          { label: "Existing episodes keep their form snapshot", done: true },
          { label: "Clinical approver sign-off", done: a.status === "approved" },
        ];
      }
      const canDecide = a.type === "invitation_prep" ? p.perms.has("invitations.approve") : a.type === "form_publication" ? p.perms.has("forms.publish") : p.perms.has("reports.approve");
      out.push({
        id: a.id, type: a.type, title: a.title, requestedBy: a.requestedBy, reviewerId: a.reviewerId, status: a.status, target: a.target, createdAt: a.createdAt, checklist, derived: false, canDecide, visible: !p.isParticipant,
      });
    }
    return out;
  });
}

/* ---- scheduled jobs: derived result text ---- */
export function jobViews(state: PhState) {
  const r = reminderStats(state);
  return state.jobs.map((j) => {
    let lastResult = j.lastResult, status = j.status;
    if (j.id === "JOB-REM-TODAY") { lastResult = `${r.delivered} of ${r.logical} logical reminders delivered, ${r.failed} failed. ${r.attempts} provider attempts, counted separately.`; status = r.failed ? "failed" : "ok"; }
    if (j.id === "JOB-IMPORT-EUROFINS") { const b = batchStats(state, "BATCH-20261002-01"); lastResult = `${b.imported} rows imported, ${b.duplicates} duplicates skipped, ${b.quarantined} held for identity resolution.`; }
    if (j.id === "JOB-REVIEW-1200" || j.id === "JOB-REVIEW-1600") { const s = reviewStats(state); lastResult = `Last checkpoint: review queue ${s.ready} ready, ${s.aged} over 48 hours (current).`; }
    if (j.id.startsWith("JOB-REM-CLN-")) {
      const q = state.messages.filter((m) => m.kind === "reminder" && m.status === "queued" && !!m.bookingId && ix(state).bookingById.get(m.bookingId)?.sessionId === j.id.slice(8)).length;
      if (q) lastResult = `Scheduled. ${plural(q, "reminder")} queued for bookings made more than 24 hours ahead.`;
    }
    return { ...j, lastResult, status };
  });
}

/* ---- activity ---- */
export interface ActivityOpts { filter?: "everything" | "people" | "agents" | "attention"; programmeId?: ProgrammeId | "all"; entityKind?: string; actor?: string; q?: string }
export interface ActivityView { event: ActivityEvent; text: string; minimal: boolean; attention: boolean }
/**
 * The activity history as this role may read it. A restricted event about an episode, report,
 * follow-up, booking or row shows its full text only to roles that may see that episode's clinical
 * content (capture nurses: their own clinics); everyone else gets its public summary, or nothing.
 * Restricted events with no episode behind them follow the role-level clinical activity permission.
 * The participant preview gets nothing: this is the staff history.
 */
export function activityFeed(state: PhState, opts: ActivityOpts = {}): ActivityView[] {
  const p = persona(state);
  if (p.isParticipant) return [];
  const roleClinical = p.perms.has("activity.clinical");
  const q = (opts.q || "").trim().toLowerCase();
  const out: ActivityView[] = [];
  for (let i = state.activity.length - 1; i >= 0; i--) {
    const e = state.activity[i];
    let clinical = roleClinical;
    if (e.restricted && clinical) {
      const epId = episodeIdOfEntity(state, e.entity);
      if (epId) clinical = canViewEpisodeClinical(state, epId);
    }
    if (e.restricted && !clinical && !e.publicSummary) continue;
    const minimal = e.restricted && !clinical;
    const text = minimal ? e.publicSummary! : e.summary;
    const attention = !!e.storyId && storyOpen(state, e.storyId);
    if (opts.filter === "people" && e.actor.kind !== "staff") continue;
    if (opts.filter === "agents" && e.actor.kind !== "agent") continue;
    if (opts.filter === "attention" && !attention) continue;
    if (opts.programmeId && opts.programmeId !== "all" && e.programmeId !== opts.programmeId) continue;
    if (opts.entityKind && opts.entityKind !== "all" && e.entity?.kind !== opts.entityKind) continue;
    if (opts.actor && opts.actor !== "all" && e.actor.id !== opts.actor) continue;
    if (q && !(text + " " + e.actor.label + " " + e.id).toLowerCase().includes(q)) continue;
    out.push({ event: e, text, minimal, attention });
  }
  return out;
}
export const agentEvents = (state: PhState, agentId?: string) => activityFeed(state, { filter: "agents" }).filter((v) => !agentId || v.event.actor.id === agentId);
export function attentionTasks(state: PhState) {
  return visibleTasks(state).filter((t) => t.status !== "done" && t.task.storyId && storyOpen(state, t.task.storyId));
}

/* ---- invitations ---- */
export interface CodeStats { code: InvitationCode; issued: number; completed: number; booked: number; expired: boolean }
export function codeStats(state: PhState, codeId: Id): CodeStats {
  const code = state.invitationCodes.find((c) => c.id === codeId)!;
  const mem = state.memberships.filter((m) => m.inviteCodeId === codeId);
  return { code, issued: mem.length, completed: mem.filter((m) => m.questionnaire === "complete").length, booked: mem.filter((m) => m.stage === "booked").length, expired: code.expiresOn < today(state) || code.status === "expired" };
}
export const programmeCodes = (state: PhState, programmeId: ProgrammeId): CodeStats[] => state.invitationCodes.filter((c) => c.programmeId === programmeId).map((c) => codeStats(state, c.id));
/** Invited = not started + in progress + ready to book + booked. Attended is part of booked. */
export function invitationFunnel(state: PhState, programmeId: ProgrammeId) {
  const c = programmeCounts(state, programmeId);
  return [
    { key: "invited", label: "Invited", n: c.invited },
    { key: "notStarted", label: "Not started", n: c.notStarted },
    { key: "drafts", label: "Questionnaire in progress", n: c.drafts },
    { key: "readyToBook", label: "Questionnaire complete, not booked", n: c.readyToBook },
    { key: "booked", label: "Booked (questionnaire and consent complete)", n: c.booked },
    { key: "attended", label: "Attended", n: c.attended },
  ];
}
/** Where an invitee stands on one programme (their own programme when none is given). */
export function inviteeStatusLabel(state: PhState, personId: Id, programmeId?: ProgrammeId): string {
  const m = membershipOf(state, personId, programmeId);
  if (!m) return "Unknown";
  const attended = (ix(state).episodesByPerson.get(personId) || []).some((e) => e.programmeId === m.programmeId);
  if (attended) return "Attended";
  if (m.stage === "booked") return "Booked";
  if (m.questionnaire === "complete") return "Questionnaire complete, not booked";
  if (m.stage === "onboarding") return "Questionnaire in progress";
  return "Not started";
}

export function hoursSince(state: PhState, iso: string) { return hoursBetween(iso, state.clock.nowUtc); }
export const isToday = (state: PhState, iso: string) => localDateOf(iso) === today(state);

/** How many open stories need attention per page, for the rail dots. Role-aware. */
export function navAttention(state: PhState): Record<string, number> {
  const p = persona(state);
  const out: Record<string, number> = {};
  if (p.isParticipant) return out;
  const clinical = p.perms.has("clinical.view") || p.perms.has("followup.view");
  const open = (id: StoryId) => storyOpen(state, id);
  out.Results = (open("ST-01") ? 1 : 0) + (clinical && open("ST-02") ? 1 : 0) + (clinical && open("ST-04") ? 1 : 0);
  out.Participants = open("ST-05") ? 1 : 0;
  out.Programmes = open("ST-03") ? 1 : 0;
  out.Reporting = open("ST-06") ? 1 : 0;
  out.Activity = openStories(state).length;
  out.Work = visibleTasks(state).filter((t) => t.status !== "done" && t.overdue).length;
  return out;
}
