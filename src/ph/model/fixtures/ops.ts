/* Operational fixtures: messages, tasks, approvals, invitation drafts, scheduled jobs,
   the employer report draft and the seeded activity history. */
import type {
  ActivityEvent, Approval, EmployerReport, EntityRef, InvitationDraft, Message, ProgrammeId, ScheduledJob, StoryId, Task,
} from "../types";
import { PROGRAMME_BY_ID, STAFF_BY_ID } from "../constants";
import { DEMO_NOW_UTC, dublinToUtc, fmtDayMonth, fmtWeekdayDate } from "../time";
import type { Iso } from "../time";
import { pad } from "./people";
import type { RosterPlan } from "./people";
import type { ClinicalBuild } from "./clinical";
import { BASELINE_BATCH_ID } from "./clinical";

export interface OpsBuild {
  messages: Message[];
  tasks: Task[];
  approvals: Approval[];
  invitationDrafts: InvitationDraft[];
  jobs: ScheduledJob[];
  employerReports: EmployerReport[];
  activity: ActivityEvent[];
  reminderFailures: { sisk: string; sf: string };
}

const maskEmail = (e: string) => e.replace(/^(.)[^@]*/, "$1***");

export function buildOps(plan: RosterPlan, clin: ClinicalBuild): OpsBuild {
  const personById = new Map(plan.persons.map((p) => [p.id, p]));
  const memberById = new Map(plan.memberships.map((m) => [m.personId, m]));
  const sessionById = new Map(plan.sessions.map((s) => [s.id, s]));
  const epById = new Map(clin.episodes.map((e) => [e.id, e]));

  /* ---- messages ---- */
  const messages: Message[] = [];
  let msgNo = 0;
  const addMsg = (m: Omit<Message, "id" | "simulated">): Message => {
    msgNo++;
    const msg: Message = { id: `MSG-${pad(msgNo, 5)}`, simulated: true, ...m };
    messages.push(msg);
    return msg;
  };
  const destFor = (personId: string, channel: "sms" | "email") => {
    const p = personById.get(personId)!;
    return channel === "sms" ? p.phone : maskEmail(p.email);
  };
  for (const b of plan.bookings) {
    const mem = memberById.get(b.personId)!;
    const ch = mem.contactPreference;
    const at = new Date(Date.parse(b.createdAt) + 60000).toISOString();
    addMsg({
      logicalId: `LM-C-${b.id}`, kind: "confirmation", personId: b.personId, bookingId: b.id, episodeId: null, channel: ch,
      destination: destFor(b.personId, ch), subject: "Your Precision Health appointment is confirmed", status: "delivered",
      attempts: [{ at, outcome: "delivered", reason: null, auto: false }], cohort: null, at, provider: ch === "sms" ? "Esendex" : "Email",
    });
  }
  // Today's 45 logical reminders, sent 24 hours before the 09:00 clinic start.
  const todaySessions = plan.sessions.filter((s) => s.date === "2026-10-05");
  const todayBookings = plan.bookings
    .filter((b) => todaySessions.some((s) => s.id === b.sessionId))
    .sort((a, b) => (a.programmeId === b.programmeId ? (a.slotStart < b.slotStart ? -1 : 1) : a.programmeId < b.programmeId ? 1 : -1));
  const siskToday = todayBookings.filter((b) => b.programmeId === "PRG-SISK-26");
  const sfToday = todayBookings.filter((b) => b.programmeId === "PRG-SF-26");
  const failSisk = siskToday[3].personId, failSf = sfToday[6].personId;
  memberById.get(failSisk)!.contactPreference = "sms";
  memberById.get(failSf)!.contactPreference = "email";
  const REMINDER_AT: Iso = "2026-10-04T08:00:00.000Z";
  for (const b of todayBookings) {
    const mem = memberById.get(b.personId)!;
    const ch = mem.contactPreference;
    const failed = b.personId === failSisk || b.personId === failSf;
    const reason = b.personId === failSisk ? "Temporary carrier timeout (Esendex status: expired)" : "Mailbox full (soft bounce)";
    const attempts: Message["attempts"] = failed
      ? [{ at: REMINDER_AT, outcome: "failed", reason, auto: false }, { at: "2026-10-04T08:15:00.000Z", outcome: "failed", reason, auto: true }]
      : [{ at: REMINDER_AT, outcome: "delivered", reason: null, auto: false }];
    addMsg({
      logicalId: `LM-R-${b.id}`, kind: "reminder", personId: b.personId, bookingId: b.id, episodeId: null, channel: ch,
      destination: destFor(b.personId, ch), subject: "Reminder about your Precision Health appointment", status: failed ? "failed" : "delivered",
      attempts, cohort: "2026-10-05", at: REMINDER_AT, provider: ch === "sms" ? "Esendex" : "Email",
    });
  }
  // Report-available messages for released reports. They never carry results.
  for (const v of clin.reportVersions.filter((x) => x.status === "released" || x.status === "superseded")) {
    const ep = epById.get(v.episodeId)!;
    const mem = memberById.get(ep.personId)!;
    const ch = mem.contactPreference;
    const at = new Date(Date.parse(v.releasedAt || v.createdAt) + 60000).toISOString();
    addMsg({
      logicalId: `LM-A-${v.id}`, kind: "report_available", personId: ep.personId, bookingId: null, episodeId: ep.id, channel: ch,
      destination: destFor(ep.personId, ch), subject: v.version > 1 ? "An updated version of your report is available" : "Your Precision Health report is ready to view",
      status: "delivered", attempts: [{ at, outcome: "delivered", reason: null, auto: false }], cohort: null, at, provider: ch === "sms" ? "Esendex" : "Email",
    });
  }
  messages.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : 1));

  /* ---- tasks ---- */
  const ref = (kind: EntityRef["kind"], id: string, label?: string): EntityRef => ({ kind, id, label });
  const t = (n: number, title: string, detail: string, storyId: StoryId | null, ownerId: Task["ownerId"], team: Task["team"], priority: Task["priority"], dueAt: Iso | null,
    clinical: boolean, linked: EntityRef, done = false): Task => ({
    id: `TSK-${pad(n, 4)}`, title, detail, storyId, ownerId, team, priority, dueAt, status: done ? "done" : "open", clinical, linked,
    createdAt: "2026-10-05T05:35:00.000Z", completedAt: done ? "2026-10-02T15:15:00.000Z" : null, completedBy: done ? ownerId : null,
  });
  const maeveEp = clin.episodes.find((e) => e.personId === "PH-P-0003")!;
  const tasks: Task[] = [
    t(1, "Resolve laboratory identity exceptions", "Resolve each held row in the Eurofins batch with a documented two-identifier check.", "ST-01", "brenda", "programme-operations", "high", "2026-10-05T09:00:00.000Z", false, ref("batch", BASELINE_BATCH_ID)),
    t(2, "Clinical review of episodes held for identity", "Review each held episode once its identity exception is resolved.", "ST-01", "neil", "clinical-review", "medium", "2026-10-05T11:00:00.000Z", true, ref("batch", BASELINE_BATCH_ID)),
    t(3, "Clear the clinician review queue", "Review and release ready episodes individually. No bulk release.", "ST-02", "neil", "clinical-review", "high", "2026-10-05T15:00:00.000Z", true, ref("programme", "PRG-SISK-26")),
    t(4, "Decide how to fill available IBM capacity today", "Approve or reject the draft invitation list. Available capacity, not lost revenue.", "ST-03", "stephen", "client-programmes", "high", "2026-10-05T10:00:00.000Z", false, ref("invitation", "INV-IBM-01")),
    t(5, "Prepare IBM invitation list", "Draft prepared for approval.", "ST-03", "brenda", "programme-operations", "medium", "2026-10-02T15:00:00.000Z", false, ref("invitation", "INV-IBM-01"), true),
    t(6, "Urgent follow-up: contact participant", "Clinician-assigned contact due at 09:00. Record each attempt and a documented outcome.", "ST-04", "neil", "clinical-review", "high", "2026-10-05T08:00:00.000Z", true, ref("followup", "FU-0001")),
    t(7, "Review failed reminders", "Inspect the verified destination and failure reason, then retry or use the service-contact route.", "ST-05", "brenda", "programme-operations", "high", "2026-10-05T07:45:00.000Z", false, ref("programme", "PRG-SISK-26")),
    t(8, "Disclosure review: Sisk employer report", "Confirm the cohort is a safe size and the breakdowns are suppressed correctly.", "ST-06", "martina", "client-programmes", "medium", "2026-10-06T11:00:00.000Z", false, ref("employer_report", "ER-SISK-01")),
    t(9, "Approve clinical narrative: Sisk employer report", "Review the narrative and approve it before export.", "ST-06", "neil", "clinical-review", "medium", "2026-10-06T14:00:00.000Z", false, ref("employer_report", "ER-SISK-01")),
    t(10, "Print lab request pads and specimen labels: Sisk Dublin Site A", "Local preview only. Demo specimen labels are not for laboratory use.", null, "fiona", "nursing", "medium", "2026-10-05T07:45:00.000Z", false, ref("session", "CLN-SISK-20261005")),
    t(11, "Room set-up check: Salesforce Demo Wellness Room", "Chairs, privacy screen, scales and blood pressure cuff.", null, "anita", "nursing", "medium", "2026-10-05T07:30:00.000Z", false, ref("session", "CLN-SF-20261005")),
    t(12, "Check IBM screening kit and consumables", "Tubes, labels, dipsticks and disposal box.", null, "liz", "nursing", "medium", "2026-10-05T07:30:00.000Z", false, ref("session", "CLN-IBM-20261005")),
    t(13, "Confirm Site B access for Thursday 8 October", "Confirm the client contact has the access list.", null, "brenda", "programme-operations", "low", "2026-10-06T15:00:00.000Z", false, ref("session", "CLN-SISK-20261008")),
    t(14, "Refresh label stock for Site B", "Spare printer and label rolls.", null, "ian", "nursing", "low", "2026-10-07T12:00:00.000Z", false, ref("session", "CLN-SISK-20261008")),
    t(15, "Routine call-back after release", "Confirm the participant has read their advice.", null, "liz", "nursing", "medium", "2026-10-06T11:00:00.000Z", true, ref("followup", "FU-0002")),
    t(16, "Routine call-back after release", "Closed.", null, "neil", "clinical-review", "low", "2026-09-30T14:00:00.000Z", true, ref("followup", "FU-0003"), true),
  ];
  tasks[15].completedAt = "2026-09-30T13:25:00.000Z";
  void maeveEp;

  /* ---- approvals and invitation draft ---- */
  const approvals: Approval[] = [
    { id: "APR-0001", type: "invitation_prep", title: "IBM invitation list (draft)", requestedBy: "brenda", reviewerId: "stephen", status: "pending", target: ref("invitation", "INV-IBM-01"),
      createdAt: "2026-10-02T15:10:00.000Z", decidedAt: null, decidedBy: null },
    { id: "APR-0002", type: "employer_report", title: "Sisk employer report ER-SISK-01", requestedBy: "martina", reviewerId: "neil", status: "pending", target: ref("employer_report", "ER-SISK-01"),
      createdAt: "2026-10-02T15:20:00.000Z", decidedAt: null, decidedBy: null },
    { id: "APR-0003", type: "form_publication", title: "Skin Screening v1.1 publication", requestedBy: "liz", reviewerId: "neil", status: "pending", target: ref("template", "tpl-skin"),
      createdAt: "2026-10-02T14:20:00.000Z", decidedAt: null, decidedBy: null },
  ];
  const ibmMembers = plan.memberships.filter((m) => m.programmeId === "PRG-IBM-26");
  const recipients = ibmMembers.filter((m) => m.stage === "onboarding").map((m) => m.personId)
    .concat(ibmMembers.filter((m) => m.stage === "invited").slice(0, 25).map((m) => m.personId));
  const invitationDrafts: InvitationDraft[] = [{
    id: "INV-IBM-01", programmeId: "PRG-IBM-26", title: "IBM Dublin: complete your questionnaire and book a remaining slot", preparedBy: "brenda",
    preparedAt: "2026-10-02T15:10:00.000Z", recipientIds: recipients, status: "pending_approval", approvalId: "APR-0001", decidedBy: null, decidedAt: null,
    message: "Hello. You are invited to a Precision Health screening session. Complete the short health questionnaire and consent in the portal, then choose a slot. Slots remain at IBM Dublin today and on 12 October. No health information is included in this message.",
  }];

  /* ---- scheduled jobs (simulated; none call a provider) ---- */
  const jobs: ScheduledJob[] = [
    { id: "JOB-REM-TODAY", name: "24-hour reminders: today's clinics", kind: "reminder", cadence: "24 hours before each clinic", lastRunAt: "2026-10-04T08:00:00.000Z",
      nextRunAt: null, status: "failed", lastResult: "", linked: ref("session", "CLN-SISK-20261005"), simulated: true },
    { id: "JOB-IMPORT-EUROFINS", name: "Eurofins source import (simulated)", kind: "import", cadence: "Weekdays 06:30", lastRunAt: "2026-10-05T05:30:00.000Z",
      nextRunAt: "2026-10-06T05:30:00.000Z", status: "ok", lastResult: "", linked: ref("batch", BASELINE_BATCH_ID), simulated: true },
    { id: "JOB-GW-WATCH", name: "Google Workspace results folder watcher (simulated)", kind: "import", cadence: "Hourly", lastRunAt: "2026-10-05T07:00:00.000Z",
      nextRunAt: "2026-10-05T08:00:00.000Z", status: "ok", lastResult: "No new files. Simulated file events only.", linked: null, simulated: true },
    { id: "JOB-REVIEW-1200", name: "Clinical review checkpoint 12:00", kind: "review_checkpoint", cadence: "Weekdays 12:00", lastRunAt: "2026-10-02T11:00:00.000Z",
      nextRunAt: "2026-10-05T11:00:00.000Z", status: "pending", lastResult: "", linked: ref("programme", "PRG-SISK-26"), simulated: true },
    { id: "JOB-REVIEW-1600", name: "Clinical review checkpoint 16:00", kind: "review_checkpoint", cadence: "Weekdays 16:00", lastRunAt: "2026-10-02T15:00:00.000Z",
      nextRunAt: "2026-10-05T15:00:00.000Z", status: "pending", lastResult: "", linked: ref("programme", "PRG-SISK-26"), simulated: true },
    { id: "JOB-ER-SISK-INTERIM", name: "Sisk interim employer report (draft due)", kind: "report_milestone", cadence: "Milestone, Tue 6 Oct 12:00", lastRunAt: null,
      nextRunAt: "2026-10-06T11:00:00.000Z", status: "pending", lastResult: "Draft ER-SISK-01 in progress.", linked: ref("employer_report", "ER-SISK-01"), simulated: true },
    { id: "JOB-ER-SF-FINAL", name: "Salesforce employer report (draft due)", kind: "report_milestone", cadence: "Milestone, Mon 12 Oct", lastRunAt: null,
      nextRunAt: "2026-10-12T11:00:00.000Z", status: "pending", lastResult: "Not started.", linked: ref("programme", "PRG-SF-26"), simulated: true },
    { id: "JOB-ER-IBM-FINAL", name: "IBM employer report (draft due)", kind: "report_milestone", cadence: "Milestone, Fri 16 Oct", lastRunAt: null,
      nextRunAt: "2026-10-16T11:00:00.000Z", status: "pending", lastResult: "Not started.", linked: ref("programme", "PRG-IBM-26"), simulated: true },
    { id: "JOB-ER-SISK-FINAL", name: "Sisk final employer report (draft due)", kind: "report_milestone", cadence: "Milestone, Fri 30 Oct", lastRunAt: null,
      nextRunAt: "2026-10-30T11:00:00.000Z", status: "pending", lastResult: "Not started.", linked: ref("programme", "PRG-SISK-26"), simulated: true },
    { id: "JOB-PREP-1008", name: "Clinic preparation checklist: Sisk Site B, Thu 8 Oct", kind: "clinic_prep", cadence: "Day before each clinic", lastRunAt: null,
      nextRunAt: "2026-10-07T09:00:00.000Z", status: "pending", lastResult: "Scheduled.", linked: ref("session", "CLN-SISK-20261008"), simulated: true },
  ];
  for (const s of plan.sessions.filter((x) => x.date > "2026-10-05")) {
    const prog = PROGRAMME_BY_ID[s.programmeId];
    jobs.push({
      id: `JOB-REM-${s.id}`, name: `24-hour reminders: ${prog.code} ${fmtDayMonth(s.date)}`, kind: "reminder", cadence: "24 hours before the clinic",
      lastRunAt: null, nextRunAt: new Date(Date.parse(dublinToUtc(s.date, s.start)) - 24 * 3600000).toISOString(), status: "pending", lastResult: "Scheduled.",
      linked: ref("session", s.id), simulated: true,
    });
  }

  /* ---- employer report draft ---- */
  const employerReports: EmployerReport[] = [{
    id: "ER-SISK-01", programmeId: "PRG-SISK-26", title: "Sisk Autumn Screening: interim programme report", periodStart: "2026-09-14", periodEnd: "2026-10-05",
    cohort: { programmeId: "PRG-SISK-26", site: "all", ageBand: "all", gender: "all", from: null, to: null }, status: "draft", version: 1,
    narrative: "Draft note from Programme Reporting: participation is progressing across both sites. Figures below use released reports only.",
    narrativeSource: "manual", narrativeApproved: false, reviewerId: "neil", coordinatorId: "martina", approvedBy: null, approvedAt: null,
    dataAsOf: DEMO_NOW_UTC, snapshot: null, blockedAttempts: 1, lastBlockedKey: "Sisk Dublin Site B|55+|all||",
  }];

  /* ---- activity history ---- */
  const ev: Array<Omit<ActivityEvent, "id" | "seeded">> = [];
  const push = (at: Iso, actor: ActivityEvent["actor"], verb: string, summary: string, o: Partial<ActivityEvent> = {}) => {
    ev.push({
      at, actor, verb, summary, entity: o.entity ?? null, programmeId: o.programmeId ?? null, personId: o.personId ?? null, storyId: o.storyId ?? null,
      integrationId: o.integrationId ?? null, restricted: o.restricted ?? false, publicSummary: o.publicSummary ?? null, simulated: o.simulated ?? false,
    });
  };
  const staff = (id: keyof typeof STAFF_BY_ID) => ({ kind: "staff" as const, id, label: STAFF_BY_ID[id].name });
  const agent = (id: string, label: string) => ({ kind: "agent" as const, id, label });
  const system = (label: string) => ({ kind: "system" as const, id: "system", label });

  push("2026-09-04T09:00:00.000Z", staff("neil"), "form.published", "Neil published Comprehensive (LAB) Screen V2 v2.0 with 8 blocks, including Blood Pressure 1.2.", { entity: ref("template", "tpl-comprehensive-lab") });
  push("2026-09-10T09:00:00.000Z", staff("liz"), "form.published", "Liz published Skin Screening v1.0.", { entity: ref("template", "tpl-skin") });
  push("2026-09-12T10:00:00.000Z", staff("brenda"), "form.published", "Brenda published Flu Vaccination Booking v1.0 (scheduling template only).", { entity: ref("template", "tpl-flu-booking") });
  push("2026-10-02T14:20:00.000Z", staff("liz"), "form.submitted", "Liz submitted Skin Screening v1.1 draft for publication approval.", { entity: ref("template", "tpl-skin") });

  for (const s of plan.sessions.filter((x) => x.status === "completed")) {
    const n = plan.attendees[s.id].length;
    push(dublinToUtc(s.date, "16:30"), staff(s.nurseId), "clinic.completed",
      `${STAFF_BY_ID[s.nurseId].name} completed the ${PROGRAMME_BY_ID[s.programmeId].code} clinic at ${s.siteName.replace("Sisk Dublin ", "")}: ${n} of ${n} booked appointments attended.`,
      { entity: ref("session", s.id), programmeId: s.programmeId });
  }

  const rowsByBatch = new Map<string, number>();
  clin.importRows.forEach((r) => rowsByBatch.set(r.batchId, (rowsByBatch.get(r.batchId) || 0) + 1));
  for (const b of clin.batches.filter((x) => x.id !== BASELINE_BATCH_ID)) {
    push(b.processedAt, system("Eurofins import (simulated)"), "import.processed",
      `Simulated Eurofins batch ${b.id} processed: ${rowsByBatch.get(b.id) || 0} observation rows imported.`, { entity: ref("batch", b.id), integrationId: "eurofins", simulated: true });
  }
  const base = clin.importRows.filter((r) => r.batchId === BASELINE_BATCH_ID);
  const imported = base.filter((r) => r.state === "imported").length, dups = base.filter((r) => r.state === "duplicate").length, quar = base.filter((r) => r.state === "quarantined");
  push("2026-10-02T15:41:00.000Z", system("Google Workspace (simulated)"), "file.added", "Simulated file event: eurofins_results_2026-10-02_demo.csv added to the results folder.", { integrationId: "gworkspace", simulated: true });
  push("2026-10-05T05:30:00.000Z", system("Eurofins import (simulated)"), "import.partial",
    `Simulated Eurofins batch processed: ${imported} observation rows imported; ${dups} duplicates skipped; ${quar.length} identity exceptions held.`,
    { entity: ref("batch", BASELINE_BATCH_ID), integrationId: "eurofins", storyId: "ST-01", simulated: true });
  quar.forEach((r, i) => {
    const reason = r.quarantine!.reason === "dob_mismatch" ? "date of birth mismatch" : r.quarantine!.reason === "unknown_specimen" ? "unknown specimen identifier" : "two candidate episodes";
    const epId = r.quarantine!.candidateEpisodeIds[0] || "no matching episode";
    push(`2026-10-05T05:30:${pad(10 + i, 2)}.000Z`, system("Eurofins import (simulated)"), "import.quarantined",
      `Row ${r.id} held: ${reason} (${epId}).`, { entity: ref("row", r.id), integrationId: "eurofins", storyId: "ST-01", simulated: true });
  });
  push("2026-10-05T05:32:00.000Z", agent("lab", "Lab Reconciliation"), "agent.prepared", "Lab Reconciliation prepared the column mapping and validation summary for the Eurofins batch. Draft only. No row was matched.", { entity: ref("batch", BASELINE_BATCH_ID), integrationId: "eurofins", simulated: true });
  push("2026-10-05T05:40:00.000Z", agent("quality", "Data Quality"), "agent.flagged", "Data Quality flagged a displayed-flag inconsistency on PH-E-0201 (LDL 3.2 with displayed limit <3.0 shown as normal in the legacy summary).",
    { entity: ref("episode", "PH-E-0201"), restricted: true, publicSummary: "Data Quality raised an item on a clinical episode", simulated: true });
  push("2026-10-05T05:41:00.000Z", agent("quality", "Data Quality"), "agent.flagged", "Data Quality flagged a source-unit discrepancy on PH-E-0104 (LDL reported in mg/dL, template expects mmol/L).",
    { entity: ref("episode", "PH-E-0104"), restricted: true, publicSummary: "Data Quality raised an item on a clinical episode", simulated: true });

  push("2026-10-04T08:00:00.000Z", system("Reminder job (simulated)"), "reminder.ran", "24-hour reminder job ran for today's clinics: 45 logical reminders scheduled.", { integrationId: "esendex", simulated: true });
  push("2026-10-04T08:15:00.000Z", system("Esendex delivery (simulated)"), "reminder.failed", "Reminder delivery failed for 2 of 45 scheduled logical reminders.", { integrationId: "esendex", storyId: "ST-05", simulated: true });
  push("2026-10-05T06:30:00.000Z", agent("watchdog", "Ops Watchdog"), "agent.task", "Ops Watchdog opened a review task for Brenda: 2 failed reminders, due 08:45.", { storyId: "ST-05", simulated: true });
  push("2026-10-05T06:15:00.000Z", agent("watchdog", "Ops Watchdog"), "agent.checked", "Ops Watchdog checked today's three clinics: no nurse or room overlaps.", { simulated: true });
  push("2026-10-05T06:20:00.000Z", agent("watchdog", "Ops Watchdog"), "agent.flagged", "Ops Watchdog flagged available capacity at today's IBM clinic: 10 of 25 slots booked.", { programmeId: "PRG-IBM-26", storyId: "ST-03", entity: ref("session", "CLN-IBM-20261005"), simulated: true });

  push("2026-10-02T15:10:00.000Z", staff("brenda"), "invitation.prepared", "Brenda prepared a draft invitation list for IBM. Awaiting approval.", { entity: ref("invitation", "INV-IBM-01"), programmeId: "PRG-IBM-26", storyId: "ST-03" });
  push("2026-10-02T15:12:00.000Z", agent("booking", "Booking Coordinator"), "agent.drafted", "Booking Coordinator drafted the invitation message for IBM. Draft only. Nothing was sent.", { entity: ref("invitation", "INV-IBM-01"), programmeId: "PRG-IBM-26", simulated: true });
  push("2026-10-05T06:00:00.000Z", staff("brenda"), "clinic.prep", "Brenda confirmed site access for the Sisk Site B clinic on Thu 8 Oct.", { entity: ref("session", "CLN-SISK-20261008"), programmeId: "PRG-SISK-26" });
  push("2026-10-05T05:00:00.000Z", system("Scheduler (simulated)"), "clinic.prep", "Clinic preparation checklists generated for today's three clinics.", { simulated: true });

  // Recent individual releases.
  const rel = clin.reportVersions.filter((v) => v.status === "released" || v.status === "superseded").filter((v) => v.version === 1 || v.status === "released")
    .sort((a, b) => ((a.releasedAt || "") < (b.releasedAt || "") ? 1 : -1)).slice(0, 36);
  for (const v of rel) {
    const ep = epById.get(v.episodeId)!;
    push(v.releasedAt!, staff("neil"), "report.released", `Neil released report ${ep.id} v${v.version}${v.correctionReason ? " (correction). v1 superseded" : ""}.`,
      { entity: ref("report", v.id), programmeId: ep.programmeId, personId: ep.personId });
  }

  push("2026-10-05T06:45:00.000Z", agent("briefing", "Briefing"), "agent.prepared", "Briefing prepared the Monday briefing for Neil and a logistics-only version for Brenda.", { simulated: true });
  const ready = clin.episodes.filter((e) => e.reportState === "ready_for_review");
  const aged = ready.filter((e) => Date.parse(DEMO_NOW_UTC) - Date.parse(e.readyAt!) > 48 * 3600000).length;
  push("2026-10-05T06:50:00.000Z", agent("briefing", "Briefing"), "agent.flagged", `Briefing flagged the review queue: ${ready.length} reports ready for review, ${aged} waiting over 48 hours.`, { storyId: "ST-02", simulated: true });
  push("2026-10-05T06:40:00.000Z", staff("neil"), "followup.assigned", "Neil assigned urgent follow-up FU-0001 for PH-E-0103, due 09:00 today.",
    { entity: ref("followup", "FU-0001"), personId: "PH-P-0003", programmeId: "PRG-SISK-26", storyId: "ST-04", restricted: true, publicSummary: "Clinical action assigned" });

  push("2026-10-01T15:00:00.000Z", staff("martina"), "report.drafted", "Martina created draft employer report ER-SISK-01 for Sisk Autumn Screening.", { entity: ref("employer_report", "ER-SISK-01"), programmeId: "PRG-SISK-26" });
  push("2026-10-02T15:10:00.000Z", system("Disclosure control"), "export.blocked", "Sisk employer export blocked: selected cohort has 6 participants.", { entity: ref("employer_report", "ER-SISK-01"), programmeId: "PRG-SISK-26", storyId: "ST-06" });
  push("2026-10-02T15:12:00.000Z", agent("reporting", "Programme Reporting"), "agent.prepared", "Programme Reporting prepared the aggregate snapshot and suppression check for ER-SISK-01. Draft only.", { entity: ref("employer_report", "ER-SISK-01"), programmeId: "PRG-SISK-26", simulated: true });
  push("2026-10-03T09:00:00.000Z", system("Jotform (simulated)"), "import.demo", "Existing source demo import: 3 legacy form submissions mapped to Pulse template fields (sample).", { integrationId: "jotform", simulated: true });
  push("2026-10-05T06:10:00.000Z", system("Monday.com (simulated)"), "reference.linked", "Operational reference: nurse coordination note for 5 Oct linked. No clinical values included.", { integrationId: "monday", simulated: true });

  ev.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  const activity: ActivityEvent[] = ev.map((e, i) => ({ ...e, id: `EVT-${pad(i + 1, 5)}`, seeded: true }));
  void sessionById; void fmtWeekdayDate;
  return { messages, tasks, approvals, invitationDrafts, jobs, employerReports, activity, reminderFailures: { sisk: failSisk, sf: failSf } };
}

export type { ProgrammeId };
