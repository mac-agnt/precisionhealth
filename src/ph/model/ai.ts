/* Deterministic, prewritten demo answers. No model is called and nothing is generated: each
   answer is composed from the current store by selectors, scoped to the signed-in role, and
   links to the records behind it. Unsupported questions ask for a supported scenario rather
   than inventing facts. */
import type { AgentId, PhState } from "./types";
import { linkFor } from "./nav";
import type { NavTarget } from "./nav";
import { PROGRAMME_BY_ID } from "./constants";
import { fmtDate, fmtDayMonth, fmtTime, fmtWeekdayDate, greetingFor, localDateOf } from "./time";
import {
  canViewEpisodeClinical, dayStats, ix, persona, personName, plural, programmeCounts, sessionStats, today, todaySessions, todayStats, firstName, staffName,
} from "./selectors/core";
import { reviewStats, reviewQueue, batchStats, episodeHeldByRow, openFollowUps, QRISK3 } from "./selectors/clinical";
import { agentEvents, failedReminders, reminderStats } from "./selectors/ops";
import { employerMetrics } from "./selectors/reporting";

export interface AnswerAction { label: string; target?: NavTarget; ask?: string; primary?: boolean }
export interface Answer {
  scenario: string;
  supported: boolean;
  text: string;
  tool: string;
  effect: "read" | "write";
  cols?: string[];
  rows?: string[][];
  actions: AnswerAction[];
}

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
const word = (n: number) => (n >= 0 && n < WORDS.length ? WORDS[n] : String(n));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const REASON: Record<string, string> = { dob_mismatch: "Date of birth mismatch", unknown_specimen: "Unknown specimen identifier", multiple_candidates: "Two candidate episodes" };

function ibmToday(state: PhState) {
  return state.sessions.find((s) => s.programmeId === "PRG-IBM-26" && s.date === today(state));
}

/* ---- the Monday briefing, scoped to the role ---- */
export function briefingText(state: PhState): string {
  const p = persona(state);
  const first = firstName(state);
  const g = greetingFor(state.clock.nowUtc);
  const D = todayStats(state);
  const sess = D.sessions;
  const b = batchStats(state, "BATCH-20261002-01");
  const rv = reviewStats(state);
  const ibm = ibmToday(state);
  const ibmAvail = ibm ? sessionStats(state, ibm.id).available : 0;
  const rem = reminderStats(state);
  const fu = state.followUps.find((f) => f.id === "FU-0001");
  const fuOpen = !!fu && fu.status === "open";
  const overdue = fuOpen && Date.parse(fu!.dueAt) < Date.parse(state.clock.nowUtc);

  const open = `${g}, ${first}. There ${D.booked === 1 ? "is" : "are"} ${plural(D.booked, "appointment")} across ${word(sess)} ${sess === 1 ? "clinic" : "clinics"} today.`;
  const imports = b.quarantined
    ? `The Eurofins batch has ${plural(b.quarantined, "identity exception")}: ${b.imported} rows imported, ${b.duplicates} ${b.duplicates === 1 ? "duplicate" : "duplicates"} skipped and ${b.quarantined} held for review.`
    : `The Eurofins batch has no open identity exceptions: ${b.imported} rows imported and ${b.duplicates} ${b.duplicates === 1 ? "duplicate" : "duplicates"} skipped.`;
  const ibmLine = `IBM has ${ibmAvail} available slots today.`;

  if (p.perms.has("clinical.review")) {
    const review = rv.ready ? `You have ${plural(rv.ready, "report")} ready to review${rv.aged ? `, including ${rv.aged} waiting over 48 hours` : ""}.` : "Your review queue is clear.";
    const fuLine = fuOpen ? (overdue ? `One clinical follow-up is overdue since ${fmtTime(fu!.dueAt)}` : `One clinical follow-up is due at ${fmtTime(fu!.dueAt)}`) : "No clinical follow-up is open";
    const remLine = rem.failed ? `Brenda has ${rem.failed} failed ${rem.failed === 1 ? "reminder" : "reminders"} to resolve.` : "no reminders are waiting.";
    return [open, imports, review, ibmLine, `${fuLine}, ${rem.failed ? "and " : "and "}${remLine}`].join(" ");
  }
  if (p.role === "operations") {
    const draft = state.invitationDrafts.find((d) => d.programmeId === "PRG-IBM-26" && d.status === "pending_approval");
    return [
      open, imports,
      rem.failed ? `You have ${plural(rem.failed, "failed reminder")} to resolve by 08:45.` : "All reminders were delivered.",
      `${ibmLine}${draft ? " A draft invitation list is waiting for Stephen's approval." : ""}`,
      "A clinical action is assigned to a clinician. No clinical detail is shown to your role.",
    ].join(" ");
  }
  if (p.role === "programme_oversight") {
    const draft = state.invitationDrafts.find((d) => d.programmeId === "PRG-IBM-26" && d.status === "pending_approval");
    const er = state.employerReports.find((r) => r.id === "ER-SISK-01");
    return [
      open, `${ibmLine}${draft ? " The draft invitation list prepared by Brenda is waiting for your approval." : ""}`,
      er && er.status !== "approved" && er.status !== "exported" ? "The Sisk employer report still needs disclosure review and clinician approval before export." : "The Sisk employer report is approved.",
      `${plural(rv.ready, "report")} ${rv.ready === 1 ? "is" : "are"} waiting for clinical review (counts only).`,
    ].join(" ");
  }
  if (p.role === "programme_reporting") {
    const er = state.employerReports.find((r) => r.id === "ER-SISK-01");
    return [open, er ? `The Sisk employer report ${er.id} is ${er.status}. ${employerMetrics(state, er.programmeId, er.cohort, er.dataAsOf).reportEligible} released reports are in the snapshot.` : "", "Employer output needs a clinician-approved narrative."].filter(Boolean).join(" ");
  }
  // Nurses and support
  const mine = todaySessions(state).filter((s) => s.nurseId === p.id || s.supportIds.includes(p.id as never));
  if (mine.length) {
    const s = mine[0];
    const st = sessionStats(state, s.id);
    return [open, `You are ${s.nurseId === p.id ? "assigned to" : "supporting"} the ${PROGRAMME_BY_ID[s.programmeId].code} clinic at ${s.siteName}: ${st.booked} of ${st.slots} slots booked, ${st.checkedIn + st.inProgress + st.completed} checked in so far.`, "Confirm identity with two identifiers before any specimen is created."].join(" ");
  }
  return open;
}

/** What this role's briefing links to. */
function briefingActions(state: PhState): AnswerAction[] {
  const p = persona(state);
  const out: AnswerAction[] = [];
  out.push({ label: "Open import exceptions", target: { page: "Results", tab: "imports", params: { batch: "BATCH-20261002-01" } }, primary: true });
  if (p.perms.has("clinical.review")) {
    out.push({ label: "Open review queue", target: { page: "Results", tab: "review" } });
    out.push({ label: "Open follow-up", target: { page: "Results", tab: "follow-up", params: { followup: "FU-0001" } } });
  }
  out.push({ label: "Open IBM capacity", target: { page: "Programmes", tab: "invitations", params: { draft: "INV-IBM-01" } } });
  out.push({ label: "Open failed reminders", target: { page: "Participants", tab: "communications", params: { filter: "failed" } } });
  if (p.role === "programme_oversight" || p.role === "programme_reporting") out.push({ label: "Open Sisk report", target: { page: "Reporting", tab: "report-builder", params: { report: "ER-SISK-01" } } });
  return out;
}

/* ---- prompts ---- */
export function suggestedPrompts(state: PhState): string[] {
  const p = persona(state);
  const quar = state.importRows.filter((r) => r.state === "quarantined").length;
  const aged = reviewStats(state).aged;
  const out = ["What needs my attention before today's clinics?"];
  if (p.perms.has("imports.view")) out.push(quar ? `Show the ${word(quar)} lab import ${quar === 1 ? "exception" : "exceptions"}.` : "Show the lab import batch.");
  if (p.perms.has("clinical.view") && p.perms.has("clinical.review")) out.push(aged ? `Why ${aged === 1 ? "is" : "are"} ${word(aged)} ${aged === 1 ? "report" : "reports"} waiting over 48 hours?` : "How is the review queue?");
  else out.push("Which reminders failed today?");
  out.push("Which clinic has spare capacity?");
  out.push(p.perms.has("reports.build") ? "Prepare the Sisk programme report." : "Which clinics run today?");
  return out;
}

/* ---- scenario matching ---- */
type Scenario = "briefing" | "imports" | "aged" | "capacity" | "report" | "reminders" | "followup" | "clinics" | "quality" | "forms" | "person" | "qrisk";
function match(q: string): Scenario | null {
  const s = q.toLowerCase();
  if (/qrisk|heart age|cardiovascular risk/.test(s)) return "qrisk";
  if (/attention|briefing|before today|this morning|what.*(need|matter)|what changed/.test(s)) return "briefing";
  if (/import|eurofins|batch|quarantin|identity|exception|lab (row|result|file)/.test(s)) return "imports";
  if (/48|waiting|aged|review queue|reports?.*(ready|review)|ready for review/.test(s)) return "aged";
  if (/capacity|spare|slots?|available|fill|ibm/.test(s)) return "capacity";
  if (/sisk.*report|programme report|employer|prepare.*report|disclosure|cohort/.test(s)) return "report";
  if (/remind|sms|delivery|failed/.test(s)) return "reminders";
  if (/follow.?up|urgent|09:00|maeve/.test(s)) return "followup";
  if (/ldl|ronan|inconsisten|legacy|3\.2|normal flag|data quality|unit/.test(s)) return "quality";
  if (/form|template|blood pressure|block/.test(s)) return "forms";
  if (/clinic|nurse|today|who is|staff|room/.test(s)) return "clinics";
  return null;
}

function personLookup(state: PhState, q: string) {
  const s = q.toLowerCase();
  const hits = state.persons.filter((p) => s.includes(p.given.toLowerCase()) && (s.includes(p.family.toLowerCase()) || ["PH-P-0001", "PH-P-0002", "PH-P-0003", "PH-P-0004", "PH-P-0501", "PH-P-0502", "PH-P-0801", "PH-P-0701"].includes(p.id)));
  return hits.slice(0, 2);
}

function unsupported(state: PhState): Answer {
  return {
    scenario: "unsupported", supported: false, tool: "pulse_help", effect: "read",
    text: "I can answer supported demo scenarios from the current records, and I will not guess beyond them. Try one of these.",
    actions: suggestedPrompts(state).map((p) => ({ label: p.replace(/\.$/, ""), ask: p })),
  };
}
const restricted = (what: string, state: PhState, who = "clinical roles"): Answer => ({
  scenario: "restricted", supported: true, tool: "pulse_scope", effect: "read",
  text: `${what} is limited to ${who}. You are previewing ${persona(state).roleLabel}, so only counts and logistics are shown.`,
  actions: [{ label: "Open Home briefing", ask: "What needs my attention before today's clinics?" }],
});

export function answerQuery(state: PhState, q: string): Answer {
  const sc = match(q);
  const p = persona(state);
  const I = ix(state);
  // Staff answers are not part of the participant preview, which shows own released data only.
  if (p.isParticipant) return { scenario: "restricted", supported: true, tool: "pulse_scope", effect: "read", text: "Staff answers are not available in the participant preview. Your own appointments and released reports are in the portal.", actions: [] };
  if (!sc) {
    const people = personLookup(state, q);
    if (people.length === 1) {
      const per = people[0];
      const eps = I.episodesByPerson.get(per.id) || [];
      const clinical = eps.length > 0 && canViewEpisodeClinical(state, eps[0].id);
      const m = (I.membershipsByPerson.get(per.id) || [])[0];
      const b = (I.bookingsByPerson.get(per.id) || []).find((x) => x.status === "confirmed");
      const base = `${personName(per)} (${per.id}) is on ${PROGRAMME_BY_ID[per.programmeId].name}. ${eps.length ? `Attended on ${fmtDate(eps[0].collectedAt)}.` : b ? `Booked for ${fmtDayMonth(I.sessionById.get(b.sessionId)!.date)} at ${b.slotStart}.` : m?.stage === "onboarding" ? "Questionnaire in progress, no confirmed booking yet." : "Invited, not started."}`;
      const extra = eps.length ? (clinical ? ` Report status for ${eps[0].id}: ${eps[0].reportState.replace(/_/g, " ")}.` : " Report workflow detail is limited to clinical roles.") : "";
      return { scenario: "person", supported: true, tool: "pulse_participants", effect: "read", text: base + extra, actions: [{ label: "Open participant", target: { page: "Participants", tab: "directory", params: { person: per.id } }, primary: true }] };
    }
    return unsupported(state);
  }
  switch (sc) {
    case "briefing":
      return { scenario: sc, supported: true, tool: "pulse_briefing", effect: "read", text: briefingText(state), actions: briefingActions(state) };
    case "imports": {
      if (!p.perms.has("imports.view")) return restricted("Laboratory import detail", state, "operations and clinical review roles");
      const b = batchStats(state, "BATCH-20261002-01");
      const rows = state.importRows.filter((r) => r.state === "quarantined");
      const text = rows.length
        ? `BATCH-20261002-01 has ${b.rows} observation rows across ${b.specimens} specimens. These are rows, not patients: ${b.imported} imported, ${b.duplicates} duplicates skipped, ${b.quarantined} quarantined. Brenda owns identity resolution, due 10:00. Nothing is matched automatically: each row needs a documented two-identifier check, then Neil reviews the episode.`
        : `All identity exceptions in BATCH-20261002-01 are resolved: ${b.imported} of ${b.rows} rows imported, ${b.duplicates} duplicates skipped. Each resolution kept its reason and audit event.`;
      return {
        scenario: sc, supported: true, tool: "pulse_imports", effect: "read", text,
        cols: ["Row", "Reason", "Episode", "Participant"],
        rows: rows.map((r) => { const ep = episodeHeldByRow(state, r.id); return [r.id.replace("BATCH-20261002-01-", ""), REASON[r.quarantine!.reason], ep ? ep.id : "unmatched", ep ? personName(I.personById.get(ep.personId)) : "Unknown"]; }),
        actions: [{ label: "Open the held rows", target: { page: "Results", tab: "imports", params: { batch: "BATCH-20261002-01" } }, primary: true }, { label: "Open Work tasks", target: { page: "Work", tab: "tasks" } }],
      };
    }
    case "aged": {
      const rv = reviewStats(state);
      if (!p.perms.has("clinical.review") && !p.perms.has("clinical.view")) {
        return { scenario: sc, supported: true, tool: "pulse_queues", effect: "read", text: `${plural(rv.ready, "report")} ${rv.ready === 1 ? "is" : "are"} ready for clinician review, ${rv.aged} waiting over 48 hours. Individual report content and the review queue are limited to clinical roles.`, actions: [{ label: "Open Dashboard", target: { page: "Dashboard", tab: "executive" } }] };
      }
      const aged = reviewQueue(state).filter((i) => i.aged);
      const oldest = aged.length ? localDateOf(aged[0].readyAt) : null;
      const text = rv.ready
        ? `${rv.aged} of the ${rv.ready} ready reports have waited more than 48 hours. They are part of the ${rv.ready}, not an extra queue. ${oldest ? `The oldest became ready on ${fmtDayMonth(oldest)}.` : ""} They come from earlier Eurofins batches, while ${rv.ready - rv.aged} became ready after this morning's import. ${rv.routine} are routine and ${rv.flagged} need individual review. Neil owns the queue and nothing can be released in bulk.`
        : "The review queue is clear. Every ready report has been reviewed and released individually.";
      return {
        scenario: sc, supported: true, tool: "pulse_review_queue", effect: "read", text,
        cols: ["Episode", "Programme", "Ready", "Review"],
        rows: aged.map((i) => [i.episode.id, i.programme.code, fmtDayMonth(i.readyAt), i.flagged ? "Review required" : "Routine"]),
        actions: [{ label: "Open review queue", target: { page: "Results", tab: "review" }, primary: true }, { label: "Open Dashboard, Clinical Delivery", target: { page: "Dashboard", tab: "clinical-delivery" } }],
      };
    }
    case "capacity": {
      const sess = todaySessions(state).map((s) => sessionStats(state, s.id));
      const ibm = sess.find((s) => s.session.programmeId === "PRG-IBM-26");
      const drafts = programmeCounts(state, "PRG-IBM-26").drafts;
      const draft = state.invitationDrafts.find((d) => d.programmeId === "PRG-IBM-26" && d.status === "pending_approval");
      const total = dayStats(state, today(state));
      return {
        scenario: sc, supported: true, tool: "pulse_capacity", effect: "read",
        text: `IBM Dublin has ${ibm ? ibm.available : 0} available slots today (${ibm ? ibm.booked : 0} of ${ibm ? ibm.slots : 0} booked, ${ibm ? ibm.pct.toFixed(0) : 0}%). ${plural(drafts, "invitee")} with an in-progress questionnaire cannot reserve a confirmed appointment yet. ${draft ? "Brenda's draft invitation list is waiting for Stephen's approval." : "No invitation draft is waiting."} Across all three clinics ${total.booked} of ${total.capacity} slots are booked (${total.pct.toFixed(0)}%). This is available capacity, not lost revenue.`,
        cols: ["Clinic", "Booked", "Slots", "Available"],
        rows: sess.map((s) => [`${s.programme.code} ${fmtDayMonth(s.session.date)}`, String(s.booked), String(s.slots), String(s.available)]),
        actions: [{ label: "Open IBM invitations", target: { page: "Programmes", tab: "invitations", params: { draft: "INV-IBM-01" } }, primary: true }, { label: "Open clinics today", target: { page: "Clinics", tab: "overview" } }],
      };
    }
    case "report": {
      if (!p.perms.has("reports.build")) return restricted("Employer reporting", state, "reporting roles");
      const er = state.employerReports[0];
      const m = employerMetrics(state, er.programmeId, er.cohort, er.dataAsOf);
      const bands = (m.breakdowns[0]?.cells || []).filter((c) => !c.suppressed);
      return {
        scenario: sc, supported: true, tool: "pulse_reporting", effect: "read",
        text: `${er.id} uses released reports only: ${m.reportEligible} of ${m.attendedOverall} attended participants are report-eligible. The cohort is ${m.cohortLabel}. A filter that returns six people (Site B, age 55+) is blocked for employer output and suppressed everywhere. The report is ${er.status}. Martina coordinates disclosure review and Neil approves the clinical narrative before any export.`,
        cols: ["Age band", "Released reports"],
        rows: bands.map((c) => [c.label, String(c.count)]),
        actions: [{ label: "Open the report builder", target: { page: "Reporting", tab: "report-builder", params: { report: er.id } }, primary: true }, { label: "Open approvals", target: { page: "Work", tab: "approvals" } }],
      };
    }
    case "reminders": {
      const r = reminderStats(state);
      const failed = failedReminders(state);
      return {
        scenario: sc, supported: true, tool: "pulse_communications", effect: "read",
        text: `${r.logical} logical reminders were due for today's clinics: ${r.delivered} delivered and ${r.failed} failed. The ${r.attempts} provider attempts are counted separately and never change the booking counts. Brenda owns the review by 08:45. Retrying one failed reminder moves one logical reminder from failed to delivered and adds an attempt to its history.`,
        cols: ["Reminder", "Participant", "Channel", "Reason"],
        rows: failed.map((m) => [m.logicalId, personName(I.personById.get(m.personId)), m.channel.toUpperCase(), m.attempts[m.attempts.length - 1].reason || ""]),
        actions: [{ label: "Open failed reminders", target: { page: "Participants", tab: "communications", params: { filter: "failed" } }, primary: true }],
      };
    }
    case "followup": {
      if (!p.perms.has("followup.view")) return { scenario: sc, supported: true, tool: "pulse_scope", effect: "read", text: "A clinical action is assigned to a clinician. Details are limited to clinical roles.", actions: [{ label: "Open Work tasks", target: { page: "Work", tab: "tasks" } }] };
      const open = openFollowUps(state);
      const fu = state.followUps.find((f) => f.id === "FU-0001");
      return {
        scenario: sc, supported: true, tool: "pulse_followup", effect: "read",
        text: fu && fu.status === "open"
          ? `FU-0001 is a clinician-assigned urgent follow-up, owner ${staffName(state, fu.ownerId)}, due ${fmtTime(fu.dueAt)} today. ${fu.attempts.length ? `${plural(fu.attempts.length, "contact attempt")} recorded.` : "No contact attempt is recorded yet."} Recording an attempt does not complete it: a documented outcome and an authorised acknowledgement are required. An email or SMS delivery cannot close it. This is a workflow demonstration, not a validated escalation protocol. ${plural(open.length, "follow-up")} open in total.`
          : "FU-0001 is closed with a documented outcome and acknowledgement.",
        actions: [{ label: "Open follow-up", target: { page: "Results", tab: "follow-up", params: { followup: "FU-0001" } }, primary: true }],
      };
    }
    case "clinics": {
      const sess = todaySessions(state);
      return {
        scenario: sc, supported: true, tool: "pulse_clinics", effect: "read",
        text: `${sess.length} clinics run today with ${todayStats(state).booked} booked appointments. Each nurse has one clinic, with no overlaps. Ian is a support resource, not a second booked nurse. The clinic day is 09:00 to 16:15 with three breaks, which gives exactly 25 fifteen-minute slots.`,
        cols: ["Clinic", "Nurse", "Support", "Booked"],
        rows: sess.map((s) => [`${PROGRAMME_BY_ID[s.programmeId].code}, ${s.siteName.replace("Sisk Dublin ", "")}`, staffName(state, s.nurseId), s.supportIds.length ? staffName(state, s.supportIds[0]) : "None", `${sessionStats(state, s.id).booked}/${sessionStats(state, s.id).slots}`]),
        actions: [{ label: "Open clinics overview", target: { page: "Clinics", tab: "overview" }, primary: true }, { label: "Open team and resources", target: { page: "Clinics", tab: "team-resources" } }],
      };
    }
    case "quality": {
      if (!p.perms.has("clinical.view")) return restricted("Data quality detail on clinical episodes", state);
      if (!canViewEpisodeClinical(state, "PH-E-0201")) return restricted("This data quality item is on an episode outside your clinic assignments. Its detail", state, "the reviewing clinician and the nurses who staffed that clinic");
      const ep = I.episodeById.get("PH-E-0201");
      const ldl = ep ? (I.obsByEpisode.get(ep.id) || []).find((o) => o.code === "LDL") : undefined;
      return {
        scenario: sc, supported: true, tool: "pulse_data_quality", effect: "read",
        text: ldl ? `Data Quality flagged PH-E-0201: LDL ${ldl.value} ${ldl.unit} with displayed limit ${ldl.limitText} appeared as normal in the legacy summary. Pulse shows Review required and a clinician must review it. No replacement threshold is proposed, and the displayed limits are illustrative sample content.` : "No data quality inconsistency is open.",
        actions: [{ label: "Open the review", target: { page: "Results", tab: "review", params: { episode: "PH-E-0201" } }, primary: true }],
      };
    }
    case "forms":
      return {
        scenario: sc, supported: true, tool: "pulse_forms", effect: "read",
        text: "Blood Pressure 1.2 is one versioned block shared by Comprehensive (LAB) Screen, Cardiovascular Screen and Sports Cardiac Screen, with the same fields, units and validation wherever it is used. A draft edit creates a new template version and never alters answers already collected: each episode keeps its form snapshot.",
        actions: [{ label: "Open Forms & Templates", target: { page: "Programmes", tab: "forms-templates" }, primary: true }],
      };
    case "qrisk":
      return { scenario: sc, supported: true, tool: "pulse_calculations", effect: "read", text: `${QRISK3.text} Pulse never calculates a score itself: it shows the engine's 10-year risk, heart age and relative risk, and episodes created in this session wait for the engine.`, actions: [{ label: "Open the review", target: { page: "Results", tab: "review" } }] };
  }
  return unsupported(state);
}

/* ---- agent conversations ---- */
export interface ThreadLine { k: string; v: string; target?: NavTarget }
export interface ThreadLink { label: string; target: NavTarget }
export interface ThreadItem { kind: "stamp" | "routine" | "agent" | "user"; text: string; routine?: string; from?: string; lines?: ThreadLine[]; links?: ThreadLink[] }
const toLinks = (actions: AnswerAction[]): ThreadLink[] => actions.filter((a) => a.target).map((a) => ({ label: a.label, target: a.target! }));

export function agentState(state: PhState, id: AgentId): "working" | "thinking" | "waiting" | "complete" | "attention" | "idle" {
  const openDq = state.dqIssues.some((d) => d.status === "open");
  switch (id) {
    case "briefing": return "complete";
    case "watchdog": return reminderStats(state).failed ? "attention" : "complete";
    case "booking": return state.invitationDrafts.some((d) => d.status === "pending_approval") ? "waiting" : "complete";
    case "lab": return state.importRows.some((r) => r.state === "quarantined") ? "attention" : "complete";
    case "drafting": return !state.settings.aiDraftingOn ? "idle" : Object.keys(state.aiDrafts).length ? "waiting" : "idle";
    case "reporting": return state.employerReports.some((r) => r.status === "draft" || r.status === "reviewed") ? "waiting" : "complete";
    case "quality": return openDq ? "attention" : "complete";
  }
}

export function agentPreview(state: PhState, id: AgentId): string {
  const r = reminderStats(state);
  switch (id) {
    case "briefing": return "monday briefing ready, linked to every queue.";
    case "watchdog": return r.failed ? `${plural(r.failed, "reminder")} failed delivery. task opened.` : "all reminders delivered.";
    case "booking": { const n = programmeCounts(state, "PRG-IBM-26").drafts; return `${plural(n, "invitee")} in progress. list drafted, nothing sent.`; }
    case "lab": { const q = state.importRows.filter((x) => x.state === "quarantined").length; return q ? `${plural(q, "row")} held. no row matched automatically.` : "all rows resolved by a person."; }
    case "drafting": return state.settings.aiDraftingOn ? "optional preview. you edit and approve." : "preview is off. manual advice unaffected.";
    case "reporting": return "snapshot prepared. narrative stays a draft.";
    case "quality": { const n = state.dqIssues.filter((d) => d.status === "open").length; return n ? `${plural(n, "issue")} open for a human to resolve.` : "no open issues.";
    }
  }
}
export function agentWhen(state: PhState, id: AgentId): string {
  const last = agentEvents(state, id)[0];
  if (!last) return "Today";
  return localDateOf(last.event.at) === today(state) ? fmtTime(last.event.at) : fmtWeekdayDate(last.event.at);
}

export function agentThread(state: PhState, id: AgentId): ThreadItem[] {
  const p = persona(state);
  const clinical = p.perms.has("clinical.view");
  const rem = reminderStats(state);
  const b = batchStats(state, "BATCH-20261002-01");
  const rv = reviewStats(state);
  const D = todayStats(state);
  const stamp = (t: string): ThreadItem => ({ kind: "stamp", text: t });
  const agent = (text: string, lines?: ThreadLine[], links?: ThreadLink[]): ThreadItem => ({ kind: "agent", text, lines, links });
  const open = (label: string, target: NavTarget): ThreadLink => ({ label, target });
  const sim = "Today 05:32 (simulated)";
  switch (id) {
    case "briefing":
      return [
        stamp("Today 06:45 (simulated)"), { kind: "routine", text: "Ran routine", routine: "Monday briefing" },
        agent(briefingText(state), undefined, toLinks(briefingActions(state))),
        agent("Linked to every queue:", [
          { k: "Imports", v: `${b.quarantined} held rows in ${b.batch.id}`, target: { page: "Results", tab: "imports", params: { batch: b.batch.id } } },
          { k: "Clinics", v: `${D.booked} appointments, ${D.available} slots available`, target: { page: "Clinics", tab: "overview" } },
          ...(clinical ? [{ k: "Review", v: `${rv.ready} ready, ${rv.aged} over 48 hours`, target: { page: "Results", tab: "review" } as NavTarget }] : []),
          { k: "Reminders", v: `${rem.failed} failed of ${rem.logical}`, target: { page: "Participants", tab: "communications", params: { filter: "failed" } } },
        ]),
      ];
    case "watchdog": {
      const ibm = ibmToday(state);
      return [
        stamp("Today 06:15 (simulated)"),
        agent("checked today's three clinics: no nurse or room overlaps. Ian is a support resource, not a second booked nurse.", undefined, [open("Open team and resources", { page: "Clinics", tab: "team-resources" })]),
        agent(`${plural(rem.failed, "reminder")} failed delivery of ${rem.logical} logical reminders. Task opened for Brenda, due 08:45. The ${rem.attempts} provider attempts are counted separately.`, undefined, [open("Open failed reminders", { page: "Participants", tab: "communications", params: { filter: "failed" } }), open("Open Work tasks", { page: "Work", tab: "tasks" })]),
        agent(`IBM has ${ibm ? sessionStats(state, ibm.id).available : 0} unused slots today. I raised it as available capacity. I do not cancel or move appointments.`, undefined, [open("Open clinics today", { page: "Clinics", tab: "overview" })]),
      ];
    }
    case "booking": {
      const d = state.invitationDrafts.find((x) => x.programmeId === "PRG-IBM-26");
      const n = programmeCounts(state, "PRG-IBM-26").drafts;
      return [
        stamp("Fri 2 Oct, 15:12 (simulated)"),
        agent(`drafted the IBM invitation message for Brenda${d ? `: ${d.recipientIds.length} recipients` : ""}. ${plural(n, "invitee")} with an in-progress questionnaire cannot reserve a confirmed slot until it is complete. Draft only, nothing sent.`, undefined, [open("Open invitation draft", { page: "Programmes", tab: "invitations", params: { draft: "INV-IBM-01" } })]),
        agent(d && d.status === "pending_approval" ? "waiting for Stephen to confirm the recipient list. Sending is simulated and needs his yes." : d && d.status === "approved_simulated_sent" ? "approved. a simulated send to the confirmed recipients was recorded." : "no invitation draft is waiting.", undefined, [open("Open approvals", { page: "Work", tab: "approvals" })]),
      ];
    }
    case "lab": {
      const rows = state.importRows.filter((r) => r.state === "quarantined");
      return [
        stamp(sim),
        agent(`prepared the column mapping for ${b.batch.id}: 7 columns mapped to Pulse fields. Validation: ${b.imported} rows imported, ${b.duplicates} duplicates already seen, ${b.quarantined} quarantined. ${b.rows} rows across ${b.specimens} specimens. Rows are not people.`, undefined, [open("Open the batch", { page: "Results", tab: "imports", params: { batch: b.batch.id } })]),
        ...rows.map((r) => agent(`row ${r.id.replace("BATCH-20261002-01-", "")} is held: ${REASON[r.quarantine!.reason].toLowerCase()}. I have not matched it. A person must confirm two identifiers.`, undefined, [open(`Open row ${r.id.replace("BATCH-20261002-01-", "")}`, linkFor("row", r.id))])),
        ...(rows.length ? [] : [agent("every held row has been resolved by a person with a documented check.")]),
      ];
    }
    case "drafting":
      if (!clinical) return [stamp("Visible to clinical roles"), agent("Drafting previews work on a selected fictional episode and are limited to clinical roles.")];
      return [
        stamp("Optional preview (P1)"),
        agent(state.settings.aiDraftingOn ? "I can draft advice wording from approved content for one fictional episode. You edit and approve it. I do not diagnose, invent measurements, decide urgency or release a report. Demo content, no model connected." : "The drafting preview is switched off in Settings, AI Controls. Manual advice is fully usable.", undefined, [open("Open AI Controls", { page: "Settings", tab: "ai-controls" })]),
        ...Object.keys(state.aiDrafts).map((epId) => agent(`a draft preview for ${epId} is waiting for clinician edit and approval.`, undefined, [open("Open the review", linkFor("episode", epId))])),
      ];
    case "reporting": {
      const er = state.employerReports[0];
      const m = employerMetrics(state, er.programmeId, er.cohort, er.dataAsOf);
      return [
        stamp("Fri 2 Oct, 15:12 (simulated)"),
        agent(`prepared the aggregate snapshot for ${er.id}: ${m.reportEligible} released reports out of ${m.attendedOverall} attended. Small groups are suppressed with complementary suppression.`, undefined, [open("Open the report builder", linkFor("employer_report", er.id))]),
        agent("a filter returning six people (Site B, age 55+) is blocked for employer output. Use the programme-level view. My narrative drafts stay drafts until a clinician approves them.", undefined, [open("Open approvals", { page: "Work", tab: "approvals" })]),
      ];
    }
    case "quality": {
      const openIssues = state.dqIssues.filter((d) => d.status === "open");
      return [
        stamp("Today 05:40 (simulated)"),
        ...(clinical
          ? openIssues.map((d) => (d.episodeId && !canViewEpisodeClinical(state, d.episodeId)
            ? agent("one data quality item is open on an episode outside your clinic assignments. Detail is limited to its clinical team.")
            : agent(`${d.title}. ${d.detail}`, undefined, d.episodeId ? [open("Open the review", linkFor("episode", d.episodeId))] : undefined)))
          : [agent(`${plural(openIssues.length, "data quality item")} open on clinical episodes. Details are limited to clinical roles.`)]),
        ...(openIssues.length ? [] : [agent("no open data quality issues.")]),
      ];
    }
  }
}

/** A deterministic reply inside an agent conversation. Out-of-scope questions are declined plainly. */
export function agentReply(state: PhState, id: AgentId, q: string): { text: string; lines?: ThreadLine[]; links?: ThreadLink[] } {
  const sc = match(q);
  const scope: Record<AgentId, Scenario[]> = {
    briefing: ["briefing", "imports", "aged", "capacity", "reminders", "followup", "clinics", "report"],
    watchdog: ["clinics", "capacity", "reminders"],
    booking: ["capacity"],
    lab: ["imports"],
    drafting: ["quality"],
    reporting: ["report"],
    quality: ["quality", "forms"],
  };
  if (!sc || !scope[id].includes(sc)) {
    return { text: "that is outside what I do. I can only answer from my own scope. Try the Briefing agent, or ask Pulse on Home for a supported scenario." };
  }
  const a = answerQuery(state, q);
  return { text: a.text, lines: a.rows ? a.rows.slice(0, 4).map((r) => ({ k: r[0], v: r.slice(1).map((c, i) => `${(a.cols?.[i + 1] || "").toLowerCase()} ${c}`.trim()).join(", ") })) : undefined, links: toLinks(a.actions) };
}

/** Suggested questions for an agent conversation. Each one resolves inside that agent's own scope. */
export function agentSuggestions(state: PhState, id: AgentId): string[] {
  const clinical = persona(state).perms.has("clinical.view");
  const quar = state.importRows.filter((r) => r.state === "quarantined").length;
  switch (id) {
    case "briefing": return ["What needs my attention before today's clinics?", clinical ? "Why are reports waiting over 48 hours?" : "Which reminders failed today?", "Which clinic has spare capacity?"];
    case "watchdog": return ["Which reminders failed today?", "Which clinics run today?", "Which clinic has spare capacity?"];
    case "booking": return ["Which clinic has spare capacity?"];
    case "lab": return persona(state).perms.has("imports.view") ? [quar ? `Show the ${word(quar)} lab import ${quar === 1 ? "exception" : "exceptions"}.` : "Show the lab import batch."] : [];
    case "drafting": return clinical && canViewEpisodeClinical(state, "PH-E-0201") ? ["Why was LDL 3.2 shown as normal?"] : [];
    case "reporting": return persona(state).perms.has("reports.build") ? ["Prepare the Sisk programme report."] : [];
    case "quality": return clinical && canViewEpisodeClinical(state, "PH-E-0201") ? ["Why was LDL 3.2 shown as normal?", "How does the Blood Pressure template block work?"] : ["How does the Blood Pressure template block work?"];
  }
}

