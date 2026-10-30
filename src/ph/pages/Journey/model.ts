/* Client journey: the whole lifecycle of one client in twelve stages, as Neil and Stephen described
   it on the 23 Oct call. Pure selectors over the store: every status, date and number here is read
   from the sales, onboarding, programme, screening day, booking, results and retention slices.
   Nothing is invented. Where the demo holds no record for a stage (a client that was won before the
   demo starts), the stage says so plainly.

   A client is keyed by its company id (co-ibm), a lead id (LD-0020) or an onboarding id (ONB-001).
   Each stage carries one "open" link to the exact record and, when something is waiting, the next
   action. Actions are plain data: a page target, a store action, or a portal to open. */
import {
  DAY_SCREEN_LABEL, ONB_DOC_STATUS_LABEL, ONB_KIND_LABEL, ONB_STEP_LABEL, ONB_TEAM, SALES_SOURCE_LABEL, fmtDate, onbCurrentStep, programmeCounts,
  publishBlockers, retCompanyKey, salesInboundFor, salesJourney, salesLatestVersion, salesNetTotals, salesEurRange, salesRecalls, today,
} from "../../model";
import type { NavTarget, Onboarding, PhState, Programme, ProgrammeId, SalesLead, SalesRecall, ScreeningDay } from "../../model";
import { onbForLead, retReleaseQueue, retReminders } from "../Sales/onbSelect";

/* ---------------------------------------------------------------- stages */

export type JStageId =
  | "lead" | "proposal" | "won" | "onboarding" | "programme" | "day" | "invite" | "booking" | "screening" | "results" | "release" | "retention";

export const JOURNEY_STAGES: Array<{ id: JStageId; title: string; short: string }> = [
  { id: "lead", title: "Lead and first touch", short: "Lead" },
  { id: "proposal", title: "Meeting notes and proposal", short: "Proposal" },
  { id: "won", title: "Won", short: "Won" },
  { id: "onboarding", title: "Onboarding", short: "Onboarding" },
  { id: "programme", title: "Programme set up", short: "Programme" },
  { id: "day", title: "Screening day built and published", short: "Day published" },
  { id: "invite", title: "HR invites employees", short: "Invites" },
  { id: "booking", title: "Employees book and do the questionnaire", short: "Bookings" },
  { id: "screening", title: "Screening day", short: "Screening" },
  { id: "results", title: "Lab results matched or POC entered", short: "Results in" },
  { id: "release", title: "Reviewed and released", short: "Released" },
  { id: "retention", title: "Results out, invoice and rebooking", short: "Retention" },
];

/** done: finished, with a date. history: implied by later records but held before the demo starts. */
export type JStatus = "done" | "history" | "progress" | "todo" | "na" | "unrecorded";
export const J_STATUS_LABEL: Record<JStatus, string> = {
  done: "Done", history: "Done before Pulse", progress: "In progress", todo: "Not started", na: "Not applicable", unrecorded: "Not recorded in the demo",
};

export type JAction =
  | { kind: "go"; label: string; target: NavTarget }
  | { kind: "act"; label: string; action: { type: string; [k: string]: unknown }; who?: string; openResult?: "lead" }
  | { kind: "portal"; label: string; portal: "client" | "nurse" | "participant"; programmeId?: ProgrammeId }
  | { kind: "programmeTask"; label: string; leadId: string };

export interface JStage {
  n: number;
  id: JStageId;
  title: string;
  short: string;
  status: JStatus;
  /** Iso or local date for a done stage. */
  date: string | null;
  facts: string[];
  /** What happens next, in plain words. */
  next: string | null;
  open: JAction;
  actions: JAction[];
}

export type JClientKind = "client" | "lead" | "onboarding";
export interface JClient {
  key: string;
  name: string;
  kind: JClientKind;
  sub: string;
}

export interface Journey {
  client: JClient;
  stages: JStage[];
  /** Index of the first stage still waiting on something, or the last stage. */
  current: number;
  doneCount: number;
}

/* ---------------------------------------------------------------- clients */

const norm = (c: string) => retCompanyKey(c);
const clientCompanies = (s: PhState) => s.companies.filter((c) => c.kind === "client");
const companyByName = (s: PhState, name: string) => clientCompanies(s).find((c) => norm(c.name) === norm(name));

/** Every client the journey page lists: client companies, won or onboarding leads, onboardings and new inbound leads. */
export function journeyClients(s: PhState): JClient[] {
  const out: JClient[] = [];
  const order = ["co-ibm", "co-sisk", "co-sf"];
  const cos = clientCompanies(s).slice().sort((a, b) => (order.indexOf(a.id) + 99) % 99 - (order.indexOf(b.id) + 99) % 99 || a.name.localeCompare(b.name));
  for (const c of cos) {
    const p = s.programmes.find((x) => x.clientId === c.id);
    out.push({ key: c.id, name: c.name, kind: "client", sub: p ? p.name : "Client" });
  }
  const leads = s.sales.leads.filter((l) => !companyByName(s, l.company) && (l.stage === "won" || !!onbForLead(s, l.id) || !!salesInboundFor(s, l.id)));
  for (const l of leads.filter((x) => x.stage === "won" || onbForLead(s, x.id))) out.push({ key: l.id, name: l.company, kind: "lead", sub: `Won lead ${l.id}` });
  for (const o of s.onboarding.onboardings.filter((x) => (!x.leadId || !s.sales.leads.some((l) => l.id === x.leadId)) && !companyByName(s, x.details.companyName))) {
    out.push({ key: o.id, name: o.details.companyName || "New client", kind: "onboarding", sub: `${ONB_KIND_LABEL[o.kind]} onboarding ${o.id}` });
  }
  for (const l of leads.filter((x) => x.stage !== "won" && !onbForLead(s, x.id)).reverse()) out.push({ key: l.id, name: l.company, kind: "lead", sub: `New lead ${l.id}` });
  return out;
}

/** A company id, lead id, onboarding id or a client name typed by a person, to a client key. */
export function resolveClientKey(s: PhState, raw: string | undefined | null): string | null {
  const q = (raw || "").trim();
  if (!q) return null;
  if (s.companies.some((c) => c.id === q && c.kind === "client")) return q;
  const lead = s.sales.leads.find((l) => l.id.toLowerCase() === q.toLowerCase());
  if (lead) return journeyKeyForLead(s, lead.id);
  const onb = s.onboarding.onboardings.find((o) => o.id.toLowerCase() === q.toLowerCase());
  if (onb) return onb.leadId ? journeyKeyForLead(s, onb.leadId) : onb.id;
  const prog = s.programmes.find((p) => p.id === q);
  if (prog) return prog.clientId;
  const n = norm(q);
  const list = journeyClients(s);
  const exact = list.find((c) => norm(c.name) === n);
  if (exact) return exact.key;
  const part = list.find((c) => n.length > 2 && (norm(c.name).includes(n) || n.split(" ").some((w) => w.length > 2 && norm(c.name).split(" ")[0] === w)));
  return part ? part.key : null;
}

export function journeyKeyForLead(s: PhState, leadId: string): string {
  const lead = s.sales.leads.find((l) => l.id === leadId);
  if (!lead) return leadId;
  const co = companyByName(s, lead.company);
  return co ? co.id : lead.id;
}
export const journeyKeyForProgramme = (s: PhState, pid: string): string | null => s.programmes.find((p) => p.id === pid)?.clientId || null;
export function journeyKeyForOnb(s: PhState, onbId: string): string {
  const o = s.onboarding.onboardings.find((x) => x.id === onbId);
  if (!o) return onbId;
  if (o.leadId) return journeyKeyForLead(s, o.leadId);
  const co = companyByName(s, o.details.companyName);
  return co ? co.id : o.id;
}
export function journeyKeyForCompany(s: PhState, name: string): string | null {
  const co = companyByName(s, name);
  if (co) return co.id;
  const lead = [...s.sales.leads].reverse().find((l) => norm(l.company) === norm(name));
  return lead ? lead.id : null;
}

/* ---------------------------------------------------------------- one journey */

const go = (label: string, target: NavTarget): JAction => ({ kind: "go", label, target });
const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;
const latest = (xs: Array<string | null | undefined>): string | null => xs.filter((x): x is string => !!x).sort().pop() || null;

interface Ctx {
  s: PhState;
  name: string;
  /** The lead for this cycle, if the demo holds one. */
  lead: SalesLead | null;
  onb: Onboarding | null;
  prog: Programme | null;
  days: ScreeningDay[];
  recall: SalesRecall | null;
  /** Lead for next year's screening, created from the recall. */
  nextLead: SalesLead | null;
}

function context(s: PhState, key: string): Ctx | null {
  const co = s.companies.find((c) => c.id === key && c.kind === "client");
  let name = "", lead: SalesLead | null = null, onb: Onboarding | null = null, prog: Programme | null = null;
  if (co) {
    name = co.name;
    prog = s.programmes.filter((p) => p.clientId === co.id).sort((a, b) => (a.windowStart < b.windowStart ? 1 : -1))[0] || null;
    onb = s.onboarding.onboardings.find((o) => norm(o.details.companyName) === norm(co.name)) || null;
  } else if (key.startsWith("LD-")) {
    lead = s.sales.leads.find((l) => l.id === key) || null;
    if (!lead) return null;
    name = lead.company;
    onb = onbForLead(s, lead.id) || null;
  } else if (key.startsWith("ONB-")) {
    onb = s.onboarding.onboardings.find((o) => o.id === key) || null;
    if (!onb) return null;
    name = onb.details.companyName || "New client";
    if (onb.leadId) lead = s.sales.leads.find((l) => l.id === onb!.leadId) || null;
  } else return null;
  const days = prog ? s.screeningDays.days.filter((d) => d.programmeId === prog!.id).sort((a, b) => (a.date < b.date ? -1 : 1)) : [];
  const recall = prog ? salesRecalls(s).find((r) => r.programmeId === prog!.id || norm(r.company) === norm(name)) || null : null;
  const nextLead = recall?.leadId ? s.sales.leads.find((l) => l.id === recall.leadId) || null : null;
  return { s, name, lead, onb, prog, days, recall, nextLead };
}

export function journeyFor(s: PhState, rawKey: string): Journey | null {
  const key = resolveClientKey(s, rawKey) || rawKey;
  const x = context(s, key);
  if (!x) return null;
  const client = journeyClients(s).find((c) => c.key === key) || { key, name: x.name, kind: (key.startsWith("LD-") ? "lead" : key.startsWith("ONB-") ? "onboarding" : "client") as JClientKind, sub: "" };
  const parts: Array<Omit<JStage, "n" | "id" | "title" | "short">> = [
    stLead(x), stProposal(x), stWon(x), stOnboarding(x), stProgramme(x), stDay(x), stInvite(x), stBooking(x), stScreening(x), stResults(x), stRelease(x), stRetention(x),
  ];
  const stages = parts.map((p, i) => ({ n: i + 1, ...JOURNEY_STAGES[i], ...p }));
  const waiting = stages.findIndex((st) => st.status === "progress" || st.status === "todo");
  return { client, stages, current: waiting < 0 ? stages.length - 1 : waiting, doneCount: stages.filter((st) => st.status === "done" || st.status === "history").length };
}

/* ---------------------------------------------------------------- stage builders */

type Part = Omit<JStage, "n" | "id" | "title" | "short">;
const leadLink = (l: SalesLead) => ({ page: "Sales", tab: "pipeline", params: { lead: l.id } }) as NavTarget;
const noLead = (x: Ctx, what: string, open: JAction): Part => (x.prog
  ? { status: "history", date: null, facts: [`Before this demo starts. The ${what} is not held in Pulse.`], next: null, open, actions: [] }
  : { status: "unrecorded", date: null, facts: [`This onboarding was started without a lead, so there is no ${what} in the demo.`], next: null, open, actions: [] });

function stLead(x: Ctx): Part {
  const l = x.lead;
  if (!l) return noLead(x, "first enquiry", go("Open the pipeline", { page: "Sales", tab: "pipeline" }));
  const j = salesJourney(x.s, l.id);
  const inb = salesInboundFor(x.s, l.id);
  const facts = [`Came in by ${SALES_SOURCE_LABEL[l.source]}${l.sourceRef ? ` (${l.sourceRef})` : ""} on ${fmtDate(l.receivedOn)}`, `${l.contact.name}${l.contact.role ? `, ${l.contact.role.replace(/\s*\(fictional\)/, "")}` : ""}`];
  if (inb?.firstTouchAt) facts.push(`First reply ${fmtDate(inb.firstTouchAt)}, ${Math.round((inb.responseSeconds || 0) / 60)} minutes after it arrived`);
  if (j.done.reply) return { status: "done", date: l.receivedOn, facts, next: null, open: go("Open the lead", leadLink(l)), actions: [] };
  return { status: "progress", date: null, facts, next: inb ? "Send the first reply within 10 minutes: brochure, booking link and similar clients." : "Reply to the enquiry and qualify it.", open: go("Open the lead", leadLink(l)), actions: [go("Send the first reply", leadLink(l))] };
}

function stProposal(x: Ctx): Part {
  const l = x.lead;
  if (!l) return noLead(x, "proposal", go("Open proposals", { page: "Sales", tab: "proposals" }));
  const notes = x.s.salesFlow.notes[l.id];
  const props = x.s.sales.proposals.filter((p) => p.leadId === l.id);
  const p = props[props.length - 1];
  const facts: string[] = [];
  if (notes?.text) facts.push("Meeting notes added");
  if (p) {
    const v = salesLatestVersion(p);
    const net = salesNetTotals(x.s, p);
    facts.push(`${p.id} v${v.version}, ${salesEurRange(net.netLow, net.netHigh)}, ${v.status === "draft" ? "draft" : v.status}`);
  }
  const sent = p ? latest(p.versions.map((v) => v.sentAt)) : null;
  const open = p ? go("Open the proposal", { page: "Sales", tab: "proposals", params: { proposal: p.id } }) : go("Open the lead", leadLink(l));
  if (sent) return { status: "done", date: sent, facts, next: null, open, actions: [] };
  if (notes?.text || p) return { status: "progress", date: null, facts, next: p ? "Check the draft and send it." : "Build the proposal from the notes and the price list.", open, actions: [go(p ? "Send the proposal" : "Build the proposal", leadLink(l))] };
  if (l.stage === "won") return { status: "unrecorded", date: null, facts: ["Won without a proposal in Pulse."], next: null, open, actions: [] };
  return { status: "todo", date: null, facts: ["Book the meeting, add the notes, then build the proposal."], next: null, open, actions: [] };
}

function stWon(x: Ctx): Part {
  const l = x.lead;
  if (!l) return noLead(x, "won deal", go("Open the pipeline", { page: "Sales", tab: "pipeline" }));
  if (l.stage === "won") return { status: "done", date: l.stageAt, facts: [`Marked as won ${fmtDate(l.stageAt)}`], next: null, open: go("Open the lead", leadLink(l)), actions: [] };
  if (l.stage === "lost") return { status: "na", date: null, facts: [`Lost${l.lostReason ? `: ${l.lostReason}` : ""}`], next: null, open: go("Open the lead", leadLink(l)), actions: [] };
  if (l.stage === "proposal_sent") return { status: "progress", date: null, facts: ["Proposal is out. Weekly soft check-ins until they decide."], next: "When they say yes, mark it as won: agreements and onboarding start from there.", open: go("Open the lead", leadLink(l)), actions: [go("Open the lead to mark as won", leadLink(l))] };
  return { status: "todo", date: null, facts: ["Comes after the proposal is sent."], next: null, open: go("Open the lead", leadLink(l)), actions: [] };
}

function stOnboarding(x: Ctx): Part {
  const o = x.onb;
  if (o) {
    const open = go("Open the onboarding", { page: "Sales", tab: "onboarding", params: { onb: o.id } });
    const facts = [`${ONB_KIND_LABEL[o.kind]} onboarding ${o.id}`];
    facts.push(o.clientLink ? (o.clientLink.completedAt ? `Client filled in the form ${fmtDate(o.clientLink.completedAt)}` : `Form link sent ${fmtDate(o.clientLink.sentAt)}, waiting for the client`) : o.detailsSavedAt ? "Client details saved" : "Client details not in yet");
    facts.push(`DSA ${o.docs.dsa ? ONB_DOC_STATUS_LABEL[o.docs.dsa.status].toLowerCase() : "not generated"}, SLA ${o.docs.sla ? ONB_DOC_STATUS_LABEL[o.docs.sla.status].toLowerCase() : "not generated"}`);
    if (o.route) facts.push(`With the ${ONB_TEAM[o.kind].name}`);
    if (o.kind === "oh") facts.push(o.medibase.doneAt ? "MediBase set up" : "MediBase set-up to do (manual)");
    facts.push(o.xero.contactRef ? `Xero contact ${o.xero.contactRef}` : "Xero contact to create");
    if (o.completedAt) return { status: "done", date: o.completedAt, facts, next: null, open, actions: [] };
    const cur = onbCurrentStep(o);
    const acts: JAction[] = [];
    if (!o.detailsSavedAt && !o.clientLink) acts.push(go("Send the onboarding link", { page: "Sales", tab: "onboarding", params: { onb: o.id, step: "details" } }));
    else acts.push(go(`Continue: ${ONB_STEP_LABEL[cur]}`, { page: "Sales", tab: "onboarding", params: { onb: o.id, step: cur } }));
    return { status: "progress", date: null, facts, next: `Next step: ${ONB_STEP_LABEL[cur]}.`, open, actions: acts };
  }
  if (x.lead?.stage === "won") {
    const t = { page: "Sales", tab: "onboarding", params: { lead: x.lead.id } } as NavTarget;
    return { status: "todo", date: null, facts: ["Send the onboarding link, generate the DSA and SLA, hand over to the team, set up Xero."], next: "Start onboarding for this won client.", open: go("Open onboarding", t), actions: [go("Start onboarding", t)] };
  }
  if (x.prog) return { status: "history", date: null, facts: [`${x.name} was onboarded before this demo starts. Its programme is already running.`], next: null, open: go("Open onboarding", { page: "Sales", tab: "onboarding" }), actions: [] };
  return { status: "todo", date: null, facts: ["Starts when the lead is won."], next: null, open: go("Open onboarding", { page: "Sales", tab: "onboarding" }), actions: [] };
}

function stProgramme(x: Ctx): Part {
  const p = x.prog;
  if (p) {
    return {
      status: "done", date: p.windowStart,
      facts: [p.name, `Runs ${fmtDate(p.windowStart)} to ${fmtDate(p.windowEnd)}`, `${p.sites.join(", ")}`],
      next: null, open: go("Open the programme", { page: "Programmes", tab: "programmes", params: { programme: p.id } }), actions: [],
    };
  }
  const l = x.lead;
  const ready = !!x.onb?.completedAt || l?.stage === "won";
  /* One click to + New programme, prefilled from the onboarding or the client's name. */
  const create = go("Create programme", { page: "Programmes", tab: "programmes", params: { new: x.onb ? `onb:${x.onb.id}` : x.name } });
  if (l && l.handoverTaskId) {
    return { status: "progress", date: null, facts: [`Set-up task ${l.handoverTaskId} is with the operations team`], next: "The team creates the programme: package, sites, form and invite code.", open: go("Open the task", { page: "Work", tab: "tasks", params: { task: l.handoverTaskId } }), actions: [go("Open the task", { page: "Work", tab: "tasks", params: { task: l.handoverTaskId } }), create] };
  }
  if (ready && l) {
    return { status: "todo", date: null, facts: ["Package, sites, form and invite code are set up by the operations team."], next: "Ask the team to set up the programme.", open: go("Open Programmes", { page: "Programmes", tab: "programmes" }), actions: [{ kind: "programmeTask", label: "Create the programme set-up task", leadId: l.id }, create] };
  }
  if (ready || x.onb) {
    return { status: "todo", date: null, facts: ["Package, sites, window and invite code."], next: ready ? "Create the programme." : "Create the programme now, or once onboarding is finished.", open: go("Open Programmes", { page: "Programmes", tab: "programmes" }), actions: [create] };
  }
  return { status: "todo", date: null, facts: ["Starts after onboarding."], next: null, open: go("Open Programmes", { page: "Programmes", tab: "programmes" }), actions: [] };
}

function dayLine(d: ScreeningDay): string {
  return `${fmtDate(d.date)}, ${DAY_SCREEN_LABEL[d.screen].toLowerCase()}, ${d.room.trim() ? d.room : "room to confirm"}`;
}

function stDay(x: Ctx): Part {
  const p = x.prog;
  if (!p) {
    const ready = !!x.onb?.completedAt || x.lead?.stage === "won";
    const t: NavTarget = { page: "Clinics", tab: "days", params: { text: `${x.name}, first screening day` } };
    return { status: "todo", date: null, facts: ["Describe the day to the agent: date, nurse, times, breaks, room. Publish it for HR."], next: ready ? "Plan the first screening day once the programme is set up." : null, open: go("Open Screening days", { page: "Clinics", tab: "days" }), actions: ready ? [go("Plan the first screening day", t)] : [] };
  }
  const pub = x.days.filter((d) => d.status === "published");
  const drafts = x.days.filter((d) => d.status === "draft");
  const facts = [...pub.slice(0, 2).map((d) => `Published: ${dayLine(d)}`), ...drafts.slice(0, 2).map((d) => `Draft: ${dayLine(d)}`)];
  const acts: JAction[] = [];
  const d0 = drafts[0];
  if (d0) {
    if (publishBlockers(d0).length) acts.push(go(`Confirm the room for ${fmtDate(d0.date)}`, { page: "Clinics", tab: "days", params: { day: d0.id } }));
    else acts.push({ kind: "act", label: `Publish ${fmtDate(d0.date)} to the client portal`, action: { type: "days/publish", dayId: d0.id }, who: "Stephen, Liz, Brenda or Dr Neil Reddy" });
  }
  if (pub.length) acts.push({ kind: "portal", label: "See it in the client portal", portal: "client", programmeId: p.id });
  const first = pub[0] || d0;
  const open = first ? go("Open the screening day", { page: "Clinics", tab: "days", params: { day: first.id } }) : go("Open Screening days", { page: "Clinics", tab: "days" });
  if (!x.days.length) {
    const sess = x.s.sessions.filter((se) => se.programmeId === p.id && se.status !== "cancelled");
    if (sess.length) return { status: "history", date: null, facts: [`${plural(sess.length, "clinic session")} on the schedule, set up before screening days were built in Pulse`], next: null, open: go("Open the schedule", { page: "Clinics", tab: "schedule", params: { session: sess[0].id } }), actions: [go("Build the next screening day", { page: "Clinics", tab: "days", params: { ask: `${x.name} screening day` } })] };
    return { status: "todo", date: null, facts: ["No screening day yet."], next: "Build the first day with the agent.", open, actions: [go("Build the first screening day", { page: "Clinics", tab: "days", params: { ask: `${x.name} screening day` } })] };
  }
  if (pub.length) return { status: "done", date: pub.map((d) => d.publishedAt).filter((v): v is string => !!v).sort()[0] || null, facts, next: drafts.length ? `${plural(drafts.length, "more day")} in draft.` : null, open, actions: acts };
  return { status: "progress", date: null, facts, next: publishBlockers(d0!).length ? "Confirm the room with HR, then publish." : "Publish it so HR sees it in their portal.", open, actions: acts };
}

function stInvite(x: Ctx): Part {
  const p = x.prog;
  if (!p) return { status: "todo", date: null, facts: ["HR shares the invite link and code with employees."], next: null, open: go("Open Invitations", { page: "Programmes", tab: "invitations" }), actions: [] };
  const c = programmeCounts(x.s, p.id);
  const codes = x.s.invitationCodes.filter((ic) => ic.programmeId === p.id && ic.status === "active");
  const pending = x.s.invitationDrafts.filter((d) => d.programmeId === p.id && (d.status === "pending_approval" || d.status === "draft"));
  const facts = [codes[0] ? `Invite code ${codes[0].code}` : "No active invite code", `${plural(c.invited, "employee")} invited`];
  if (pending.length) facts.push(`${plural(pending.length, "invitation email")} waiting for approval`);
  const open = go("Open invitations", { page: "Programmes", tab: "invitations", params: { programme: p.id } });
  const acts: JAction[] = [];
  if (pending[0]) acts.push(go("Approve the invitation email", { page: "Programmes", tab: "invitations", params: { draft: pending[0].id } }));
  acts.push(go("Invite employees", { page: "Programmes", tab: "invitations", params: { programme: p.id } }));
  acts.push({ kind: "portal", label: "Invite link in the HR portal", portal: "client", programmeId: p.id });
  if (codes.length && c.invited > 0) return { status: "done", date: codes.map((ic) => ic.createdAt).sort()[0], facts, next: pending.length ? "Approve the waiting invitation email." : null, open, actions: acts };
  return { status: codes.length ? "progress" : "todo", date: null, facts, next: "Share the invite link and code with HR.", open, actions: acts };
}

function stBooking(x: Ctx): Part {
  const p = x.prog;
  if (!p) return { status: "todo", date: null, facts: ["Employees log in with the code, book a slot and fill in the questionnaire."], next: null, open: go("Open Appointments", { page: "Clinics", tab: "appointments" }), actions: [] };
  const c = programmeCounts(x.s, p.id);
  const facts = [`${c.booked} of ${c.invited} booked`, `${c.booked + c.readyToBook} questionnaires complete`];
  const unbooked = c.notStarted + c.drafts + c.readyToBook;
  if (unbooked) facts.push(`${c.notStarted} not started, ${c.drafts} part done, ${c.readyToBook} done but not booked`);
  const open = go("Open appointments", { page: "Clinics", tab: "appointments" });
  const acts: JAction[] = [go("See who has booked", { page: "Clinics", tab: "appointments" }), { kind: "portal", label: "Open the participant portal", portal: "participant" }];
  if (!c.invited) return { status: "todo", date: null, facts, next: null, open, actions: acts };
  const lastBooking = latest(x.s.bookings.filter((b) => b.programmeId === p.id && b.status === "confirmed").map((b) => b.createdAt));
  if (!unbooked && c.booked) return { status: "done", date: lastBooking, facts, next: null, open, actions: acts };
  return { status: c.booked ? "progress" : "todo", date: null, facts, next: unbooked ? `${plural(unbooked, "person", "people")} still to book. The portal sends reminders.` : null, open, actions: acts };
}

function stScreening(x: Ctx): Part {
  const p = x.prog;
  if (!p) return { status: "todo", date: null, facts: ["Lab bloods or point of care. The nurse records everything in the nurse portal."], next: null, open: go("Open the schedule", { page: "Clinics", tab: "schedule" }), actions: [] };
  const t = today(x.s);
  const c = programmeCounts(x.s, p.id);
  const sess = x.s.sessions.filter((se) => se.programmeId === p.id && se.status !== "cancelled").sort((a, b) => (a.date < b.date ? -1 : 1));
  const upcoming = sess.filter((se) => se.status !== "completed" && se.date >= t);
  const past = sess.filter((se) => !upcoming.includes(se));
  const eps = x.s.episodes.filter((e) => e.programmeId === p.id);
  const poc = eps.filter((e) => e.capture.variant === "poc").length;
  const methods = [eps.length - poc ? "lab bloods" : "", poc ? "point of care" : "", ...x.days.map((d) => (d.screen === "poc" ? "point of care" : "lab bloods"))];
  const method = Array.from(new Set(methods.filter(Boolean)));
  const facts = [`${c.attended} attended${c.noShow ? `, ${c.noShow} did not attend` : ""}`, `${plural(past.length, "day")} done, ${upcoming.length} to come`];
  if (method.length) facts.push(`Method: ${method.join(" and ")}`);
  const next = upcoming[0];
  const open = go("Open the schedule", { page: "Clinics", tab: "schedule", params: next ? { session: next.id } : past.length ? { session: past[past.length - 1].id } : {} });
  const acts: JAction[] = [{ kind: "portal", label: "Open the nurse portal", portal: "nurse" }];
  if (!c.attended && !past.length) return { status: "todo", date: null, facts, next: next ? `First day ${fmtDate(next.date)}.` : null, open, actions: acts };
  if (upcoming.length) return { status: "progress", date: null, facts, next: `Next day ${fmtDate(next!.date)}, ${next!.siteName}.`, open, actions: acts };
  return { status: "done", date: past[past.length - 1]?.date || null, facts, next: null, open, actions: acts };
}

/** Lab rows that could not be matched automatically and point at someone on this programme. */
export function heldRowsFor(s: PhState, pid: ProgrammeId): number {
  const eps = new Set(s.episodes.filter((e) => e.programmeId === pid).map((e) => e.id));
  const rows = s.importRows.filter((r) => r.state === "quarantined" && (r.quarantine?.candidateEpisodeIds || []).some((id) => eps.has(id)));
  const keys = new Set(rows.map((r) => r.specimenKey));
  const lab = s.labCsv.records.filter((r) => r.status === "flagged" && (!r.candidateEpisodeId || eps.has(r.candidateEpisodeId)));
  return keys.size + lab.length;
}

function stResults(x: Ctx): Part {
  const p = x.prog;
  if (!p) return { status: "todo", date: null, facts: ["Lab results arrive about 7 days later as a CSV. Point of care results are typed in on the day."], next: null, open: go("Open Imports", { page: "Results", tab: "imports" }), actions: [] };
  const c = programmeCounts(x.s, p.id);
  const held = heldRowsFor(x.s, p.id);
  const inN = c.episodes - c.awaiting;
  const facts = [`${inN} of ${c.episodes} people have results in`];
  if (c.awaiting) facts.push(`${c.awaiting} waiting for the lab file`);
  if (held) facts.push(`${plural(held, "lab row")} ${held === 1 ? "needs" : "need"} a person to match (name, date of birth and ID must all agree)`);
  const open = go("Open lab imports", { page: "Results", tab: "imports" });
  const acts: JAction[] = [];
  if (held) acts.push(go("Open the matching queue", { page: "Results", tab: "imports", params: { view: "queue" } }));
  if (c.awaiting) acts.push(go("Import the lab CSV", { page: "Results", tab: "imports" }));
  if (!c.episodes) return { status: "todo", date: null, facts, next: null, open, actions: [] };
  if (!c.awaiting && !held) return { status: "done", date: latest(x.s.episodes.filter((e) => e.programmeId === p.id).map((e) => e.readyAt)), facts, next: null, open, actions: [] };
  return { status: "progress", date: null, facts, next: held ? "Mismatches first: check each held row against the closest patient." : "Drop in the lab CSV when it arrives.", open, actions: acts };
}

function stRelease(x: Ctx): Part {
  const p = x.prog;
  if (!p) return { status: "todo", date: null, facts: ["Staff review and approve every report before release. Nothing goes out automatically."], next: null, open: go("Open Review", { page: "Results", tab: "review" }), actions: [] };
  const c = programmeCounts(x.s, p.id);
  const facts = [`${c.released} of ${c.episodes} reports released`, `HR portal shows ${c.invited} invited, ${c.booked} booked, ${c.attended} attended, ${c.released} released`];
  if (c.ready) facts.push(`${c.ready} ready for review`);
  if (c.onHold) facts.push(`${c.onHold} on hold`);
  const open = go("Open results review", { page: "Results", tab: "review" });
  const acts: JAction[] = [];
  if (c.ready) acts.push(go("Review and release", { page: "Results", tab: "review" }));
  acts.push({ kind: "portal", label: "See the counts in the HR portal", portal: "client", programmeId: p.id });
  const eps = new Set(x.s.episodes.filter((e) => e.programmeId === p.id).map((e) => e.id));
  const relAt = latest(x.s.reportVersions.filter((v) => eps.has(v.episodeId) && v.releasedAt).map((v) => v.releasedAt));
  if (!c.episodes || (!c.released && !c.ready)) return { status: "todo", date: null, facts, next: null, open, actions: acts };
  if (!c.ready && !c.onHold && !c.awaiting) return { status: "done", date: relAt, facts, next: null, open, actions: acts };
  return { status: "progress", date: null, facts, next: c.ready ? `${plural(c.ready, "report")} waiting for a clinician to approve.` : "Waiting for results before review.", open, actions: acts };
}

/** The createLead action that starts next year's screening from a recall. */
export function nextYearLeadAction(s: PhState, r: SalesRecall): { type: string; [k: string]: unknown } {
  const rem = retReminders(s).find((m) => m.recall.id === r.id);
  const who = rem?.contact || { name: r.contactName, email: r.contactEmail, role: "HR contact" };
  return {
    type: "sales/createLead", company: r.company, fictionalCompany: r.fictionalCompany, services: [r.service], contactName: who.name, contactRole: who.role || "HR contact",
    contactEmail: who.email, source: "recall", enquiry: `Next year's screening. Last screened ${fmtDate(r.screenedOn)}, anniversary ${fmtDate(r.recallOn)}. Same time next year?`,
    headcount: r.participants, origin: { kind: "recall", id: r.id },
  };
}

function stRetention(x: Ctx): Part {
  const p = x.prog;
  if (!p) return { status: "todo", date: null, facts: ["Results-out email with the feedback form and invoice note, then a rebooking reminder 3 months before next year."], next: null, open: go("Open Retention", { page: "Sales", tab: "recall" }), actions: [] };
  const c = programmeCounts(x.s, p.id);
  const item = retReleaseQueue(x.s).find((r) => r.programmeId === p.id);
  const emails = x.s.onboarding.emails.filter((e) => e.template === "results_out" && e.ref === p.id);
  const last = emails[emails.length - 1];
  const facts: string[] = [];
  if (last) facts.push(`Results-out email sent ${fmtDate(last.sentAt)} to ${last.toName}, with the feedback form and invoice note`);
  if (item) facts.push(`${plural(item.newReports, "new report")} released since HR was last told`);
  facts.push(x.onb?.xero.contactRef ? `Invoice raised in Xero, contact ${x.onb.xero.contactRef}` : "Invoice follows the results-out email (Xero, not connected in the demo)");
  const rem = x.recall ? retReminders(x.s).find((m) => m.recall.id === x.recall!.id) : undefined;
  if (x.recall) facts.push(rem ? (rem.emailId ? `Rebooking reminder sent` : `Rebooking reminder ${fmtDate(rem.dueOn)}, 3 months before ${fmtDate(x.recall.recallOn)}`) : `Anniversary ${fmtDate(x.recall.recallOn)}`);
  const open = go("Open Retention", { page: "Sales", tab: "recall" });
  const acts: JAction[] = [];
  if (item) acts.push({ kind: "act", label: "Send results-out email", action: { type: "ret/sendResultsOut", programmeId: p.id } });
  if (x.nextLead) {
    facts.push(`Next year: lead ${x.nextLead.id} is in the pipeline, back to stage 1`);
    return { status: "done", date: x.nextLead.receivedOn, facts, next: null, open: go("Open next year's lead", leadLink(x.nextLead)), actions: [go("Open next year's lead", leadLink(x.nextLead))] };
  }
  if (!c.released) return { status: "todo", date: null, facts, next: null, open, actions: acts };
  if (rem && rem.state === "due") acts.push({ kind: "act", label: "Send rebooking reminder", action: { type: "ret/sendRebooking", recallId: x.recall!.id } });
  if (x.recall && !item) acts.push({ kind: "act", label: "Start next year's screening", action: nextYearLeadAction(x.s, x.recall), who: "Stephen Kelly", openResult: "lead" });
  return { status: "progress", date: null, facts, next: item ? "Tell HR the results are out." : rem && !rem.emailId ? `Rebooking reminder goes ${fmtDate(rem.dueOn)}. Or start next year's screening now.` : "Plan next year's screening.", open, actions: acts };
}

/** Every page target a journey links to, for checks. */
export function journeyTargets(j: Journey): NavTarget[] {
  const out: NavTarget[] = [];
  for (const st of j.stages) for (const a of [st.open, ...st.actions]) if (a.kind === "go") out.push(a.target);
  return out;
}
