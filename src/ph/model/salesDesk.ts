/* Stephen's sales desk: the layer that turns the sales records into a working sales system.
   Deal value and probability (weighted pipeline), deal age, saved views, the next best action,
   one timeline per deal, several contacts per company (with "left the company"), company
   research from what Pulse already knows, the Today list, monthly targets and the forecast, and
   the closed deals history behind the win rates.
   Pure types, deterministic fixtures and selectors. Handlers live in src/ph/pages/Sales/deskActions.ts.
   Every person, company and number added here is fictional demo data. */
import type { Iso, LocalDate, Hhmm } from "./time";
import { addDays, daysBetween, dublinToUtc, fmtWeekdayDate, localDateOf, weekdayOf } from "./time";
import type { PhState, StaffId } from "./types";
import type { SalesLead, SalesProposalConfig, SalesService, SalesSource } from "./sales";
import { SALES_SERVICE_LABEL, SALES_SOURCE_LABEL, salesDefaultConfig, salesEur, salesLatestVersion, salesPriceSnapshot, salesProposalTotals, salesRecalls, salesBlankConfig } from "./sales";
import type { SalesJourneyStep, SalesSeqTemplate } from "./salesFlow";
import {
  SALES_SECTOR_LABEL, salesFollowDueDates, salesFollowSequence, salesInboundFor, salesJourney, salesNetTotals, salesNormCompany, salesSectorOf, salesSectorReferences, salesSequenceKey,
} from "./salesFlow";

/* ---------------------------------------------------------------- state */

export type DeskRole = "decision_maker" | "champion" | "finance" | "influencer" | "user";
export const DESK_ROLE_LABEL: Record<DeskRole, string> = {
  decision_maker: "Decision maker", champion: "Champion", finance: "Finance and invoices", influencer: "Influencer", user: "Day-to-day contact",
};
export interface DeskContact {
  id: string; // CT-001
  leadId: string;
  name: string;
  title: string;
  email: string;
  phone: string;
  role: DeskRole;
  left: boolean;
  leftOn: LocalDate | null;
}

/** A closed deal from before Pulse, so the forecast has a history. Fictional. */
export interface DeskClosed {
  id: string; // CD-01
  company: string;
  service: SalesService;
  source: SalesSource;
  value: number;
  outcome: "won" | "lost";
  openedOn: LocalDate;
  closedOn: LocalDate;
  /** Minutes from the enquiry to the first reply. */
  firstTouchMin: number;
  by: StaffId;
  reason: string;
}

export interface DeskEmail { id: string; leadId: string; at: Iso; by: string; to: string; subject: string; body: string; purpose: DeskEmailPurpose }
export type DeskEmailPurpose = "checkin" | "recap" | "chase" | "references" | "onboarding";

export interface SalesDeskState {
  version: 1;
  seq: { contact: number; email: number };
  contacts: DeskContact[];
  /** Left-company flag on the main contact held on the lead. */
  primaryLeft: Record<string, LocalDate>;
  /** Monthly target in euro, by "YYYY-MM". Months without an entry use the default. */
  targets: Record<string, number>;
  defaultTarget: number;
  /** Today list: items marked done or snoozed, by item key. */
  today: Record<string, { done?: Iso; until?: LocalDate }>;
  /** The weekly soft follow-up template. Null until Stephen edits it. */
  follow: SalesSeqTemplate | null;
  /** Rebooking sequence paused for a recall id. */
  rebookPaused: Record<string, boolean>;
  emails: DeskEmail[];
  closed: DeskClosed[];
  /** Recurring contracts and agreements that come up for renewal (fictional). */
  contracts: DeskContract[];
  /** Expiring soon: per item, extended to a date, reminded, snoozed or marked lost. */
  expiry: Record<string, { extendedTo?: LocalDate; remindedAt?: Iso; until?: LocalDate; lost?: string; renewedAt?: Iso }>;
}

export interface DeskContract {
  id: string; // CON-01
  company: string;
  kind: "oh_fee" | "ilh";
  title: string;
  amount: number | null;
  startedOn: LocalDate;
  renewsOn: LocalDate;
  contactName: string;
  contactEmail: string;
}

/* ---------------------------------------------------------------- deal value, probability, age */

/** Chance of winning by where the deal is in Stephen's flow. Shown on every card. */
export const DESK_STEP_PROB: Record<SalesJourneyStep, number> = { reply: 10, meeting: 25, proposal: 40, follow: 60, won: 100 };
export const DESK_STEP_LABEL: Record<SalesJourneyStep, string> = { reply: "First reply", meeting: "Meeting", proposal: "Proposal", follow: "Following up", won: "Won" };

export interface DeskDeal {
  lead: SalesLead;
  open: boolean;
  step: SalesJourneyStep;
  value: number;
  /** True when there is no proposal yet and the value comes from the price list. */
  estimated: boolean;
  basis: string;
  prob: number;
  weighted: number;
  /** Days since the enquiry arrived (to the close for won and lost deals). */
  age: number;
  overdue: boolean;
  dueToday: boolean;
  /** Days until the next step, negative when overdue. Null with no date. */
  dueIn: number | null;
  hot: boolean;
  waiting: boolean;
  proposalId: string | null;
  inSequence: "active" | "paused" | null;
  sector: string | null;
  owner: string;
}

const OH_ONLY = (l: SalesLead) => l.services.length > 0 && l.services.every((x) => x === "occupational_health");
const TALK_ONLY = (l: SalesLead) => l.services.length > 0 && l.services.every((x) => x === "wellness_talk");

/** What the deal is worth: the latest proposal after any discount, else an estimate from the price list. */
export function deskValue(state: PhState, lead: SalesLead): { value: number; estimated: boolean; basis: string } {
  const props = state.sales.proposals.filter((p) => p.leadId === lead.id);
  if (props.length) {
    const p = props[props.length - 1];
    const n = salesNetTotals(state, p);
    return { value: n.netHigh, estimated: false, basis: `${p.id} v${salesLatestVersion(p).version}${n.discountPct ? `, after ${n.discountPct}% off` : ""}` };
  }
  const n = lead.qualifier.headcount || 0;
  const oh = n >= 50 ? 1050 : 525;
  if (OH_ONLY(lead)) return { value: oh, estimated: true, basis: `Occupational health, ${salesEur(oh)} a year` };
  if (TALK_ONLY(lead)) return { value: 650, estimated: true, basis: "One wellness talk at the usual rate" };
  const cfg = salesDefaultConfig(lead, state.sales.priceItems);
  const t = salesProposalTotals(cfg, state.sales.priceItems);
  const extra = lead.services.includes("occupational_health") ? oh : 0;
  const what = t.lines.map((l) => `${l.code} ${l.days} day${l.days === 1 ? "" : "s"}`).concat(t.flu ? [`flu x ${t.flu.highQty}`] : [], t.exec ? [`${t.exec.count} executive`] : [], extra ? ["OH"] : []).join(", ");
  return { value: t.totalHigh + extra, estimated: true, basis: `Estimate from the price list: ${what || "to confirm"}` };
}

export function deskDeal(state: PhState, lead: SalesLead): DeskDeal {
  const t = localDateOf(state.clock.nowUtc);
  const j = salesJourney(state, lead.id);
  const open = lead.stage === "new" || lead.stage === "proposal_sent";
  const v = deskValue(state, lead);
  let prob = lead.stage === "lost" ? 0 : DESK_STEP_PROB[j.current];
  if (open) {
    if (lead.qualifier.budget === "approved") prob += 10;
    if (lead.qualifier.budget === "price_sensitive") prob -= 10;
    prob = Math.max(5, Math.min(90, prob));
  }
  const end = open ? t : localDateOf(lead.stageAt);
  const inb = salesInboundFor(state, lead.id);
  const waiting = !!inb && !inb.firstTouchAt && lead.stage === "new";
  const dueIn = lead.nextActionOn ? daysBetween(t, lead.nextActionOn) : null;
  const seq = salesFollowSequence(state, lead.id);
  const props = state.sales.proposals.filter((p) => p.leadId === lead.id);
  const staff = state.staff.find((s) => s.id === lead.ownerId);
  return {
    lead, open, step: j.current, value: v.value, estimated: v.estimated, basis: v.basis, prob, weighted: Math.round((v.value * prob) / 100),
    age: Math.max(0, daysBetween(lead.receivedOn, end)),
    overdue: open && dueIn !== null && dueIn < 0, dueToday: open && dueIn === 0, dueIn,
    hot: open && (waiting || (prob >= 40 && dueIn !== null && dueIn <= 7)),
    waiting, proposalId: props.length ? props[props.length - 1].id : null,
    inSequence: seq && !seq.stopped && seq.next ? (seq.paused ? "paused" : "active") : null,
    sector: salesSectorOf(lead), owner: staff ? staff.name : lead.ownerId,
  };
}

export function deskDeals(state: PhState): DeskDeal[] {
  return state.sales.leads.map((l) => deskDeal(state, l));
}

/* ---------------------------------------------------------------- saved views and filters */

export type DeskViewId = "all" | "mine" | "hot" | "oh" | "wellness" | "big";
export const DESK_VIEWS: Array<{ id: DeskViewId; label: string; hint: string }> = [
  { id: "all", label: "Everything", hint: "Every lead and client" },
  { id: "mine", label: "My deals", hint: "Deals you own" },
  { id: "hot", label: "Hot this week", hint: "Waiting for a reply, or likely to close with a step due this week" },
  { id: "oh", label: "Occupational health", hint: "Deals that include occupational health" },
  { id: "wellness", label: "Wellness", hint: "Health screening, flu, executive and talks" },
  { id: "big", label: "Over €10k", hint: "Deals worth more than €10,000" },
];
export interface DeskFilter { view: DeskViewId; q: string; svc: string; src: string; overdue: boolean }
export function deskFilterFrom(p: Record<string, string>): DeskFilter {
  const view = (DESK_VIEWS.some((v) => v.id === p.view) ? p.view : "all") as DeskViewId;
  return { view, q: p.q || "", svc: p.svc || "", src: p.src || "", overdue: p.overdue === "1" };
}
export function deskFilterParams(f: DeskFilter, extra: Record<string, string> = {}): Record<string, string> {
  const o: Record<string, string> = { ...extra };
  if (f.view !== "all") o.view = f.view;
  if (f.q) o.q = f.q;
  if (f.svc) o.svc = f.svc;
  if (f.src) o.src = f.src;
  if (f.overdue) o.overdue = "1";
  return o;
}
export function deskInView(d: DeskDeal, view: DeskViewId, me: string): boolean {
  switch (view) {
    case "mine": return d.lead.ownerId === me;
    case "hot": return d.hot;
    case "oh": return d.lead.services.includes("occupational_health");
    case "wellness": return d.lead.services.some((x) => x !== "occupational_health");
    case "big": return d.value > 10000;
    default: return true;
  }
}
export function deskMatches(d: DeskDeal, f: DeskFilter, me: string): boolean {
  if (!deskInView(d, f.view, me)) return false;
  if (f.svc && !d.lead.services.includes(f.svc as SalesService)) return false;
  if (f.src && d.lead.source !== f.src) return false;
  if (f.overdue && !d.overdue) return false;
  if (f.q) {
    const hay = `${d.lead.company} ${d.lead.contact.name} ${d.lead.contact.email} ${d.lead.enquiry} ${d.lead.id}`.toLowerCase();
    if (!f.q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w))) return false;
  }
  return true;
}

/* ---------------------------------------------------------------- next best action */

export type DeskActionKind = "reply" | "call" | "meeting" | "notes" | "build" | "send" | "follow" | "won" | "onboard" | "reopen" | "contact";
export interface DeskNextBest { kind: DeskActionKind; title: string; why: string; button: string }

/** The agent's suggestion for this deal. Deterministic rules from the record, for a person to act on. */
export function deskNextBest(state: PhState, lead: SalesLead): DeskNextBest {
  const d = deskDeal(state, lead);
  const first = lead.contact.name.split(" ")[0];
  if (lead.stage === "lost") return { kind: "reopen", title: `Reopen ${lead.company} in the spring`, why: lead.lostReason ? `Lost: ${lead.lostReason}` : "Lost with no reason given.", button: "Reopen lead" };
  if (lead.stage === "won") return { kind: "onboard", title: "Start or finish onboarding", why: "Won deals move to onboarding: details, DSA and SLA, team and Xero.", button: "Open onboarding" };
  if (deskPrimaryLeft(state, lead.id)) return { kind: "contact", title: `${lead.contact.name} has left ${lead.company}`, why: "Find the next person before the deal goes quiet. Add a contact and make them the main one.", button: "Add contact" };
  if (d.waiting) return { kind: "reply", title: "Reply within 10 minutes", why: "First touch inside 10 minutes is Stephen's rule. The agent has drafted the reply with the brochure, booking link and same-sector references.", button: "Draft first reply" };
  if (d.step === "reply") return { kind: "call", title: `Call ${first} to qualify`, why: "No conversation logged yet. A short call confirms headcount, sites, dates and budget.", button: "Log call" };
  if (d.step === "meeting") {
    const booked = (state.scheduled?.items || []).some((x) => x.leadId === lead.id && (x.kind === "meeting" || x.kind === "call") && x.status === "scheduled");
    return booked || /meeting/i.test(lead.nextAction)
      ? { kind: "notes", title: "Add the meeting notes", why: "The proposal builder reads the notes and fills in headcount, sites, package, flu and dates.", button: "Add notes" }
      : { kind: "meeting", title: `Book a meeting with ${first}`, why: "Leads that meet are far more likely to buy. Send a time from the calendar.", button: "Book meeting" };
  }
  if (d.step === "proposal") {
    const draft = d.proposalId ? state.sales.proposals.find((p) => p.id === d.proposalId) : null;
    return draft && salesLatestVersion(draft).status === "draft"
      ? { kind: "send", title: "Send the proposal", why: `${draft.id} is ready as a draft at ${salesEur(d.value)}. Sending starts the weekly soft follow ups.`, button: "Send proposal" }
      : { kind: "build", title: "Build the proposal", why: `Priced from the price list${state.salesFlow.notes[lead.id] ? " and your meeting notes" : ""}. About ${salesEur(d.value)}.`, button: "Build proposal" };
  }
  const seq = salesFollowSequence(state, lead.id);
  if (seq && seq.next && !seq.paused && seq.next.due <= localDateOf(state.clock.nowUtc)) return { kind: "follow", title: `Send follow up ${seq.next.n}: "${seq.next.subject}"`, why: `Due ${fmtWeekdayDate(seq.next.due)}. A soft check-in, not a hard push.`, button: "Send follow up" };
  if (d.prob >= 60 && d.age > 21) return { kind: "call", title: `Call ${first} for a decision`, why: `The proposal has been out ${d.age} days. A call often unlocks it: offer to hold provisional dates.`, button: "Log call" };
  return { kind: "won", title: "Ask for the decision", why: seq?.next ? `Next soft follow up goes ${fmtWeekdayDate(seq.next.due)}. When they say yes, one button starts onboarding.` : "When they say yes, one button starts onboarding.", button: "Mark as won" };
}

/* ---------------------------------------------------------------- contacts */

export interface DeskPerson { key: string; id: string | null; name: string; title: string; email: string; phone: string; role: DeskRole; primary: boolean; left: boolean; leftOn: LocalDate | null }
export const deskPrimaryLeft = (state: PhState, leadId: string) => !!state.salesDesk?.primaryLeft[leadId];
export function deskContacts(state: PhState, leadId: string): DeskPerson[] {
  const lead = state.sales.leads.find((l) => l.id === leadId);
  if (!lead) return [];
  const leftOn = state.salesDesk?.primaryLeft[leadId] || null;
  const main: DeskPerson = { key: `${leadId}:main`, id: null, name: lead.contact.name, title: lead.contact.role, email: lead.contact.email, phone: lead.contact.phone, role: "decision_maker", primary: true, left: !!leftOn, leftOn };
  const extra = (state.salesDesk?.contacts || []).filter((c) => c.leadId === leadId).map((c): DeskPerson => ({ key: c.id, id: c.id, name: c.name, title: c.title, email: c.email, phone: c.phone, role: c.role, primary: false, left: c.left, leftOn: c.leftOn }));
  return [main, ...extra.sort((a, b) => Number(a.left) - Number(b.left) || a.name.localeCompare(b.name))];
}

/* ---------------------------------------------------------------- company research */

export interface DeskResearch {
  sector: string | null;
  size: string;
  sites: string;
  relationship: Array<{ text: string; company: string }>;
  references: string[];
  services: string;
}
/** Everything Pulse already knows about the company. No network call. */
export function deskResearch(state: PhState, lead: SalesLead): DeskResearch {
  const k = salesNormCompany(lead.company);
  const sector = salesSectorOf(lead);
  const rel: Array<{ text: string; company: string }> = [];
  for (const e of state.sales.engagements) if (salesNormCompany(e.company) === k) rel.push({ text: `${SALES_SERVICE_LABEL[e.service]} on ${fmtWeekdayDate(e.screenedOn)}: ${e.packageText}${e.participants ? `, ${e.participants} people` : ""}`, company: e.company });
  for (const p of state.programmes) if (salesNormCompany(p.clientName) === k) rel.push({ text: `Screening programme ${p.code} running now`, company: p.clientName });
  for (const b of state.sales.ilh) if (salesNormCompany(b.company) === k) { rel.push({ text: `Irish Life Health partner client (${b.location})`, company: b.company }); break; }
  for (const o of state.sales.leads) if (o.id !== lead.id && salesNormCompany(o.company) === k) rel.push({ text: `Earlier lead ${o.id}, ${o.stage === "won" ? "won" : o.stage === "lost" ? "lost" : "open"}`, company: o.company });
  const n = lead.qualifier.headcount;
  return {
    sector: sector ? SALES_SECTOR_LABEL[sector] : null,
    size: n ? `About ${n} people` : "Headcount to confirm",
    sites: lead.qualifier.sites ? `${lead.qualifier.sites} site${lead.qualifier.sites > 1 ? "s" : ""}` : "Sites to confirm",
    relationship: rel,
    references: salesSectorReferences(state, lead, 3),
    services: lead.services.map((x) => SALES_SERVICE_LABEL[x]).join(", ") || "To confirm",
  };
}

/* ---------------------------------------------------------------- timeline */

export type DeskTimeKind = "email" | "call" | "meeting" | "note" | "proposal" | "follow" | "stage" | "system";
export const DESK_TIME_LABEL: Record<DeskTimeKind, string> = { email: "Emails", call: "Calls", meeting: "Meetings", note: "Notes", proposal: "Proposals", follow: "Follow ups", stage: "Stage", system: "System" };
export interface DeskTimeItem { key: string; at: Iso; kind: DeskTimeKind; title: string; body?: string; by: string; future?: boolean }
const kindOf = (t: string): DeskTimeKind => {
  if (/^Call\b/i.test(t)) return "call";
  if (/^Meeting\b|Meeting booked|Call booked/i.test(t)) return "meeting";
  if (/follow up/i.test(t)) return "follow";
  if (/^Email\b|first reply/i.test(t)) return "email";
  if (/^Note\b|notes/i.test(t)) return "note";
  if (/Proposal|PRP-/i.test(t)) return "proposal";
  if (/sent to .*@/i.test(t)) return "email";
  if (/Moved to|Marked as|won|lost|Reopened/i.test(t)) return "stage";
  return "system";
};
/** One timeline for a deal: history, emails with their text, meeting notes, proposal versions and the follow ups still to come. Newest first. */
export function deskTimeline(state: PhState, leadId: string): DeskTimeItem[] {
  const lead = state.sales.leads.find((l) => l.id === leadId);
  if (!lead) return [];
  const staff = (id: string) => state.staff.find((s) => s.id === id)?.name || id;
  const out: DeskTimeItem[] = [];
  const emailBodies = [...(state.salesFlow?.emails || []).filter((e) => e.leadId === leadId).map((e) => ({ at: e.at, subject: e.subject, body: e.body })),
    ...(state.salesDesk?.emails || []).filter((e) => e.leadId === leadId).map((e) => ({ at: e.at, subject: e.subject, body: e.body }))];
  lead.history.forEach((h, i) => {
    const em = emailBodies.find((e) => e.at === h.at);
    out.push({ key: `h${i}`, at: h.at, kind: kindOf(h.text), title: h.text.replace(/^(Call|Email|Meeting|Note): /, "").replace(/^./, (ch) => ch.toUpperCase()), body: em?.body, by: staff(h.by) });
  });
  const notes = state.salesFlow?.notes[leadId];
  if (notes) out.push({ key: "notes", at: notes.savedAt, kind: "meeting", title: "Meeting notes saved", body: notes.text, by: staff(notes.savedBy) });
  for (const p of state.sales.proposals.filter((x) => x.leadId === leadId)) {
    for (const v of p.versions) {
      if (v.status === "draft") out.push({ key: `${p.id}v${v.version}`, at: v.createdAt, kind: "proposal", title: `Proposal ${p.id} v${v.version} drafted`, by: v.createdBy });
    }
  }
  const t = localDateOf(state.clock.nowUtc);
  const seq = salesFollowSequence(state, leadId);
  if (seq && !seq.stopped && !seq.paused) for (const st of seq.steps) if (st.status === "scheduled" || (st.status === "due" && st.due >= t)) {
    out.push({ key: `fu${st.n}`, at: dublinToUtc(st.due, "09:00"), kind: "follow", title: `Follow up ${st.n} goes out: "${st.subject}"`, body: st.body, by: "Sequence", future: true });
  }
  for (const x of state.scheduled?.items || []) if (x.leadId === leadId && x.status === "scheduled" && x.date >= t && (x.kind === "meeting" || x.kind === "call")) {
    out.push({ key: x.id, at: dublinToUtc(x.date, x.start || "09:00"), kind: "meeting", title: `${x.kind === "call" ? "Call" : "Meeting"} booked${x.contact ? ` with ${x.contact}` : ""}`, body: x.notes || undefined, by: staff(x.createdBy), future: true });
  }
  const seen = new Set<string>();
  return out.filter((x) => { const k = `${x.at}|${x.title}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => (Number(!!b.future) - Number(!!a.future)) || (a.future ? (a.at < b.at ? -1 : 1) : a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

/* ---------------------------------------------------------------- documents */

export interface DeskDoc { key: string; name: string; kind: "brochure" | "proposal" | "agreement" | "notes" | "other"; status: string; proposalId?: string; onbId?: string }
export function deskDocs(state: PhState, lead: SalesLead): DeskDoc[] {
  const out: DeskDoc[] = [];
  const oh = lead.services.includes("occupational_health");
  const svcOnly = lead.services.length === 1 ? lead.services[0] : null;
  out.push({ key: "brochure", name: svcOnly === "occupational_health" ? "Occupational health brochure.pdf" : svcOnly === "flu" ? "Workplace flu brochure.pdf" : "Corporate health brochure.pdf", kind: "brochure", status: lead.history.some((h) => /brochure|first reply/i.test(h.text)) ? "Sent" : "Ready to send" });
  for (const p of state.sales.proposals.filter((x) => x.leadId === lead.id)) {
    const v = salesLatestVersion(p);
    out.push({ key: p.id, name: `Proposal ${p.id} v${v.version}.pdf`, kind: "proposal", status: v.status === "draft" ? "Draft" : v.status === "sent" ? "Sent, waiting" : v.status === "accepted" ? "Accepted" : "Declined", proposalId: p.id });
  }
  for (const f of lead.files.filter((x) => x.kind === "other" || (x.kind === "proposal" && !x.proposalId))) out.push({ key: f.id, name: f.name, kind: "other", status: "On file" });
  const onb = state.onboarding?.onboardings.find((o) => o.leadId === lead.id);
  const docs = onb as unknown as { id: string; docs?: Record<string, { status?: string } | undefined> } | undefined;
  const st = (k: string) => { const d = docs?.docs?.[k]; return d?.status ? d.status.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) : onb ? "Not generated yet" : "After the win"; };
  out.push({ key: "dsa", name: oh ? "Data sharing agreement (DSA)" : "Data sharing agreement (DSA)", kind: "agreement", status: st("dsa"), onbId: onb?.id });
  out.push({ key: "sla", name: "Service level agreement (SLA)", kind: "agreement", status: st("sla"), onbId: onb?.id });
  return out;
}

/* ---------------------------------------------------------------- Today */

export type DeskTodayGroup = "reply" | "calls" | "followups" | "meetings" | "awaiting" | "rebook";
export const DESK_TODAY_GROUPS: Array<{ id: DeskTodayGroup; label: string; hint: string }> = [
  { id: "reply", label: "Reply now", hint: "New enquiries inside the 10 minute rule" },
  { id: "meetings", label: "Meetings and calls booked", hint: "In the calendar today" },
  { id: "calls", label: "Calls and next steps", hint: "Due today or overdue" },
  { id: "followups", label: "Follow ups due", hint: "Soft weekly check-ins after a proposal" },
  { id: "awaiting", label: "Proposals waiting for a reply", hint: "Out more than a week with no decision" },
  { id: "rebook", label: "Rebookings due", hint: "Clients to contact three months before their anniversary" },
];
export interface DeskTodayItem {
  key: string;
  group: DeskTodayGroup;
  title: string;
  sub: string;
  company: string;
  leadId: string | null;
  due: LocalDate;
  time: Hhmm | null;
  overdue: boolean;
  value: number | null;
  /** What Done does, in words, for the button title. */
  doneLabel: string;
  ref: { kind: "lead" | "follow" | "sched" | "await" | "recall" | "touch"; id: string; n?: number };
}
/** Everything Stephen should do today, from the same records the calendar reads. Snoozed and done items drop out. */
export function deskToday(state: PhState): DeskTodayItem[] {
  const t = localDateOf(state.clock.nowUtc);
  const marks = state.salesDesk?.today || {};
  const hidden = (key: string) => { const m = marks[key]; return !!m && (!!m.done || (!!m.until && m.until > t)); };
  const out: DeskTodayItem[] = [];
  const push = (x: DeskTodayItem) => { if (!hidden(x.key)) out.push(x); };
  for (const l of state.sales.leads) {
    const open = l.stage === "new" || l.stage === "proposal_sent";
    if (!open) continue;
    const d = deskDeal(state, l);
    if (d.waiting) {
      push({ key: `touch:${l.id}`, group: "reply", title: `Reply to ${l.contact.name}`, sub: `${l.company}: ${l.enquiry.slice(0, 90)}${l.enquiry.length > 90 ? "..." : ""}`, company: l.company, leadId: l.id, due: t, time: null, overdue: false, value: d.value, doneLabel: "Open the deal and send the agent's reply", ref: { kind: "touch", id: l.id } });
      continue;
    }
    if (l.nextActionOn && l.nextActionOn <= t) {
      push({ key: `lead:${l.id}:${l.nextActionOn}`, group: "calls", title: l.nextAction || "Next step", sub: `${l.company}, ${l.contact.name}${l.contact.phone ? `, ${l.contact.phone}` : ""}`, company: l.company, leadId: l.id, due: l.nextActionOn, time: null, overdue: l.nextActionOn < t, value: d.value, doneLabel: "Mark done and set the next step", ref: { kind: "lead", id: l.id } });
    }
    const seq = salesFollowSequence(state, l.id);
    if (seq && !seq.stopped && !seq.paused && seq.next && seq.next.due <= t) {
      push({ key: `follow:${seq.key}:${seq.next.n}`, group: "followups", title: `Follow up ${seq.next.n}: "${seq.next.subject}"`, sub: `${l.company}, to ${l.contact.name}`, company: l.company, leadId: l.id, due: seq.next.due, time: null, overdue: seq.next.due < t, value: d.value, doneLabel: "Send it now", ref: { kind: "follow", id: l.id, n: seq.next.n } });
    }
    if (l.stage === "proposal_sent" && d.proposalId) {
      const p = state.sales.proposals.find((x) => x.id === d.proposalId)!;
      const v = salesLatestVersion(p);
      if (v.status === "sent" && v.sentAt && daysBetween(localDateOf(v.sentAt), t) >= 7) {
        push({ key: `await:${p.id}v${v.version}`, group: "awaiting", title: `${p.id} v${v.version}, out ${daysBetween(localDateOf(v.sentAt), t)} days`, sub: `${l.company}, ${salesEur(d.value)}, ${d.prob}% likely`, company: l.company, leadId: l.id, due: addDays(localDateOf(v.sentAt), 7), time: null, overdue: false, value: d.value, doneLabel: "Log a chase call", ref: { kind: "await", id: l.id } });
      }
    }
  }
  for (const x of state.scheduled?.items || []) {
    if (x.status !== "scheduled" || x.date !== t || (x.kind !== "meeting" && x.kind !== "call" && x.kind !== "follow_up" && x.kind !== "rebooking")) continue;
    const g: DeskTodayGroup = x.kind === "follow_up" ? "followups" : x.kind === "rebooking" ? "rebook" : "meetings";
    push({ key: `sched:${x.id}`, group: g, title: x.kind === "follow_up" ? `Email: "${x.title}"` : x.kind === "rebooking" ? x.title : `${x.kind === "call" ? "Call" : "Meeting"} with ${x.contact || x.client}`, sub: `${x.client || ""}${x.start ? `, ${x.start}${x.end ? ` to ${x.end}` : ""}` : ""}`, company: x.client || "", leadId: x.leadId, due: x.date, time: x.start, overdue: false, value: null, doneLabel: x.kind === "follow_up" || x.kind === "rebooking" ? "Send it now" : "Mark the meeting done", ref: { kind: "sched", id: x.id } });
  }
  for (const r of salesRecalls(state)) {
    if (r.status !== "plan_now" && r.status !== "overdue") continue;
    if (state.onboarding?.rebookSent?.[r.id] || state.salesDesk?.rebookPaused[r.id]) continue;
    push({ key: `recall:${r.id}`, group: "rebook", title: `Rebook ${r.company}`, sub: `Screened ${fmtWeekdayDate(r.screenedOn)}, anniversary ${fmtWeekdayDate(r.recallOn)}. ${r.contactName}`, company: r.company, leadId: r.leadId, due: r.planFrom, time: null, overdue: r.status === "overdue", value: null, doneLabel: "Send the rebooking email", ref: { kind: "recall", id: r.id } });
  }
  const order = DESK_TODAY_GROUPS.map((g) => g.id);
  return out.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group) || (a.time || "99").localeCompare(b.time || "99") || (a.due < b.due ? -1 : a.due > b.due ? 1 : a.company.localeCompare(b.company)));
}

/** The next working day after a date (Mon to Fri). */
export function deskNextWorkday(d: LocalDate, n = 1): LocalDate {
  let x = d;
  let left = n;
  while (left > 0) { x = addDays(x, 1); const w = weekdayOf(x); if (w !== 0 && w !== 6) left--; }
  return x;
}

/* ---------------------------------------------------------------- forecast and targets */

export const deskMonthKey = (d: LocalDate) => d.slice(0, 7);
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const deskMonthLabel = (k: string) => `${MONTH_NAMES[Number(k.slice(5, 7)) - 1]} ${k.slice(2, 4)}`;
export const deskTarget = (state: PhState, k: string) => state.salesDesk?.targets[k] ?? state.salesDesk?.defaultTarget ?? 30000;

/** Every closed deal: the history from before Pulse and the leads closed in Pulse. */
export interface DeskClosedRow { id: string; company: string; service: SalesService; source: SalesSource; value: number; outcome: "won" | "lost"; openedOn: LocalDate; closedOn: LocalDate; firstTouchMin: number | null; by: StaffId; leadId: string | null }
export const DESK_RECORDED_TOUCH: Record<string, number> = {
  "LD-0013": 4, "LD-0014": 8, "LD-0015": 11, "LD-0016": 17, "LD-0017": 6,
};
export function deskClosedRows(state: PhState): DeskClosedRow[] {
  const hist: DeskClosedRow[] = (state.salesDesk?.closed || []).map((c) => ({ ...c, leadId: null }));
  const live: DeskClosedRow[] = state.sales.leads.filter((l) => l.stage === "won" || l.stage === "lost").map((l) => {
    const inb = salesInboundFor(state, l.id);
    return {
      id: l.id, company: l.company, service: l.services[0] || "health_screening", source: l.source, value: deskValue(state, l).value, outcome: l.stage as "won" | "lost",
      openedOn: l.receivedOn, closedOn: localDateOf(l.stageAt), firstTouchMin: inb?.responseSeconds != null ? Math.round(inb.responseSeconds / 60) : DESK_RECORDED_TOUCH[l.id] ?? null, by: l.ownerId, leadId: l.id,
    };
  });
  return [...hist, ...live].sort((a, b) => (a.closedOn < b.closedOn ? -1 : 1));
}

export interface DeskMonth { key: string; label: string; target: number; won: number; weighted: number; best: number; current: boolean; past: boolean }
export interface DeskRate { key: string; label: string; won: number; lost: number; pct: number | null; value: number }
export interface DeskLeague { by: StaffId; name: string; n: number; within: number; pct: number; median: number }
export interface DeskForecast {
  months: DeskMonth[];
  quarter: { label: string; target: number; won: number; weighted: number; gap: number };
  byService: DeskRate[];
  bySource: DeskRate[];
  avgDeal: number;
  cycleDays: number;
  winRate: number | null;
  openValue: number;
  openWeighted: number;
  league: DeskLeague[];
}
const median = (xs: number[]) => { if (!xs.length) return 0; const s = xs.slice().sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };

/**
 * Six months back and three ahead. Won is closed business by month. Weighted pipeline sits in the
 * month of the deal's expected close: the proposal's dates when known, else 30 days after the next step.
 */
export function deskForecast(state: PhState): DeskForecast {
  const t = localDateOf(state.clock.nowUtc);
  const rows = deskClosedRows(state);
  const deals = deskDeals(state).filter((d) => d.open);
  const nowKey = deskMonthKey(t);
  const keys: string[] = [];
  for (let i = -6; i <= 2; i++) {
    const [y, m] = nowKey.split("-").map(Number);
    const tm = m - 1 + i; const ny = y + Math.floor(tm / 12); const nm = ((tm % 12) + 12) % 12 + 1;
    keys.push(`${ny}-${String(nm).padStart(2, "0")}`);
  }
  const closeKey = (d: DeskDeal): string => {
    const base = d.lead.nextActionOn && d.lead.nextActionOn > t ? d.lead.nextActionOn : t;
    const days = d.step === "follow" ? 14 : d.step === "proposal" ? 30 : 45;
    const k = deskMonthKey(addDays(base, days));
    return k < nowKey ? nowKey : k;
  };
  const months: DeskMonth[] = keys.map((k) => {
    const won = rows.filter((r) => r.outcome === "won" && deskMonthKey(r.closedOn) === k).reduce((n, r) => n + r.value, 0);
    const inMonth = deals.filter((d) => closeKey(d) === k);
    return { key: k, label: deskMonthLabel(k), target: deskTarget(state, k), won, weighted: inMonth.reduce((n, d) => n + d.weighted, 0), best: inMonth.reduce((n, d) => n + d.value, 0), current: k === nowKey, past: k < nowKey };
  });
  const q = Math.floor((Number(nowKey.slice(5, 7)) - 1) / 3);
  const qKeys = [1, 2, 3].map((i) => `${nowKey.slice(0, 4)}-${String(q * 3 + i).padStart(2, "0")}`);
  const qm = months.filter((m) => qKeys.includes(m.key));
  const qTarget = qKeys.reduce((n, k) => n + deskTarget(state, k), 0);
  const qWon = qm.reduce((n, m) => n + m.won, 0);
  const qWeighted = qm.reduce((n, m) => n + m.weighted, 0);
  const rate = (key: string, label: string, list: DeskClosedRow[]): DeskRate => {
    const won = list.filter((r) => r.outcome === "won");
    return { key, label, won: won.length, lost: list.length - won.length, pct: list.length ? Math.round((won.length / list.length) * 100) : null, value: won.reduce((n, r) => n + r.value, 0) };
  };
  const services = Array.from(new Set(rows.map((r) => r.service)));
  const sources = Array.from(new Set(rows.map((r) => r.source)));
  const won = rows.filter((r) => r.outcome === "won");
  const touched = rows.filter((r) => r.firstTouchMin !== null);
  const people = Array.from(new Set(touched.map((r) => r.by)));
  const league = people.map((by) => {
    const mine = touched.filter((r) => r.by === by).map((r) => r.firstTouchMin as number);
    const within = mine.filter((m) => m <= 10).length;
    return { by, name: state.staff.find((s) => s.id === by)?.name || by, n: mine.length, within, pct: Math.round((within / mine.length) * 100), median: median(mine) };
  }).sort((a, b) => b.pct - a.pct || a.median - b.median);
  return {
    months, quarter: { label: `Q${q + 1} ${nowKey.slice(0, 4)}`, target: qTarget, won: qWon, weighted: qWeighted, gap: Math.max(0, qTarget - qWon - qWeighted) },
    byService: services.map((s) => rate(s, SALES_SERVICE_LABEL[s], rows.filter((r) => r.service === s))).sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1)),
    bySource: sources.map((s) => rate(s, SALES_SOURCE_LABEL[s], rows.filter((r) => r.source === s))).sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1)),
    avgDeal: won.length ? Math.round(won.reduce((n, r) => n + r.value, 0) / won.length) : 0,
    cycleDays: median(won.map((r) => daysBetween(r.openedOn, r.closedOn))),
    winRate: rows.length ? Math.round((won.length / rows.length) * 100) : null,
    openValue: deals.reduce((n, d) => n + d.value, 0),
    openWeighted: deals.reduce((n, d) => n + d.weighted, 0),
    league,
  };
}

/* ---------------------------------------------------------------- email drafts (agent) */

export function deskEmailPurpose(state: PhState, lead: SalesLead): DeskEmailPurpose {
  const j = salesJourney(state, lead.id);
  if (lead.stage === "won") return "onboarding";
  if (j.current === "reply" || j.current === "meeting") return state.salesFlow?.notes[lead.id] ? "recap" : "references";
  if (j.current === "follow") return "chase";
  return "checkin";
}
export const DESK_PURPOSE_LABEL: Record<DeskEmailPurpose, string> = { checkin: "Soft check-in", recap: "Meeting recap", chase: "Proposal check-in", references: "Brochure and references", onboarding: "Welcome and next steps" };
/** The agent's draft, written in Stephen's soft style. Deterministic from the record. */
export function deskEmailDraft(state: PhState, lead: SalesLead, purpose: DeskEmailPurpose): { subject: string; body: string } {
  const first = lead.contact.name.split(" ")[0] || "there";
  const sign = "Kind regards,\nStephen Kelly\nSales and Operations Director, Precision Health";
  const refs = salesSectorReferences(state, lead);
  const prop = state.sales.proposals.filter((p) => p.leadId === lead.id).slice(-1)[0];
  switch (purpose) {
    case "references": return { subject: `${lead.company} and Precision Health`, body: `Hi ${first},\n\nThank you again for getting in touch. I have attached our brochure, which sets out the packages and what each one includes.${refs.length ? ` We already look after ${refs.join(" and ")}, so we know how to fit around your team's working day.` : ""}\n\nWould a short call this week suit, so I can understand your numbers, sites and dates?\n\n${sign}` };
    case "recap": return { subject: "Thanks for the chat", body: `Hi ${first},\n\nThanks for your time. As promised, here is a short recap: ${(state.salesFlow?.notes[lead.id]?.text || "").split(/(?<=\.)\s/).slice(0, 2).join(" ")}\n\nI will put the proposal together and send it over shortly. If anything changes in the meantime, just let me know.\n\n${sign}` };
    case "chase": return { subject: "Anything more I can do?", body: `Hi ${first},\n\nJust checking in on the proposal${prop ? ` (${prop.id})` : ""} for ${lead.company}. Is there anything more I can do to help, or anything you would like changed? Happy to jump on a quick call, or to hold provisional dates while you decide.\n\n${sign}` };
    case "onboarding": return { subject: `Welcome to Precision Health, ${lead.company}`, body: `Hi ${first},\n\nThank you for choosing Precision Health. Our team will send two short onboarding links shortly, so we can set up your account, your agreements and invoicing.\n\nI will be in touch to agree the screening dates.\n\n${sign}` };
    default: return { subject: "Anything more I can do?", body: `Hi ${first},\n\nJust checking in. Is there anything more I can do to help with your plans for ${lead.company}? Happy to jump on a quick call.\n\n${sign}` };
  }
}

/* ---------------------------------------------------------------- fixtures */

const at = (d: LocalDate, t: Hhmm): Iso => dublinToUtc(d, t);

const CLOSED_SEED: DeskClosed[] = [
  ["CD-01", "Rathmore Credit Union", "health_screening", "website", 3820, "won", "2026-03-30", "2026-04-14", 6, "stephen", ""],
  ["CD-02", "Barrow Valley Dairies", "flu", "helpscout", 2250, "won", "2026-04-02", "2026-04-20", 9, "martina", ""],
  ["CD-03", "Clonmel Precision Tools", "health_screening", "referral", 11460, "won", "2026-03-18", "2026-04-28", 4, "stephen", ""],
  ["CD-04", "Liffey Legal Partners", "executive", "referral", 6900, "lost", "2026-04-08", "2026-05-06", 22, "brenda", "Chose a private hospital package."],
  ["CD-05", "Ballyhale Builders", "health_screening", "helpscout", 9550, "won", "2026-04-20", "2026-05-19", 7, "stephen", ""],
  ["CD-06", "Mallow Freight Services", "occupational_health", "website", 1050, "won", "2026-04-27", "2026-05-27", 12, "martina", ""],
  ["CD-07", "Dunboyne Data Centres", "health_screening", "tender", 15250, "lost", "2026-04-15", "2026-06-03", 31, "stephen", "Lost the tender on price."],
  ["CD-08", "Kinsale Marine Hotels", "health_screening", "helpscout", 4420, "won", "2026-05-11", "2026-06-09", 5, "stephen", ""],
  ["CD-09", "Tullamore Meats", "flu", "irish_life", 3150, "won", "2026-05-25", "2026-06-16", 8, "brenda", ""],
  ["CD-10", "Portlaoise Print Group", "wellness_talk", "website", 650, "won", "2026-06-02", "2026-06-23", 3, "martina", ""],
  ["CD-11", "Galway Bay Software", "health_screening", "referral", 18600, "won", "2026-05-14", "2026-07-07", 6, "stephen", ""],
  ["CD-12", "Ennis Engineering", "occupational_health", "helpscout", 525, "lost", "2026-06-10", "2026-07-14", 26, "brenda", "Stayed with their current provider."],
  ["CD-13", "Carlow Brewing Collective", "health_screening", "website", 5730, "won", "2026-06-22", "2026-07-21", 9, "stephen", ""],
  ["CD-14", "Sligo Medtech Assembly", "executive", "referral", 9200, "won", "2026-06-30", "2026-07-30", 4, "stephen", ""],
  ["CD-15", "Drogheda Port Logistics", "occupational_health", "tender", 1050, "won", "2026-07-06", "2026-08-11", 15, "martina", ""],
  ["CD-16", "Wexford Fresh Foods", "health_screening", "helpscout", 7640, "lost", "2026-07-08", "2026-08-18", 19, "brenda", "No budget this year."],
  ["CD-17", "Naas Retail Park Management", "flu", "website", 1800, "won", "2026-08-03", "2026-08-25", 7, "martina", ""],
  ["CD-18", "Athlone Insurance Services", "health_screening", "irish_life", 7100, "won", "2026-08-05", "2026-09-08", 6, "stephen", ""],
  ["CD-19", "Kilkenny Craft Studios", "wellness_talk", "helpscout", 650, "lost", "2026-08-20", "2026-09-15", 14, "brenda", "Event cancelled."],
  ["CD-20", "Cork Harbour Engineering", "health_screening", "referral", 12400, "won", "2026-08-12", "2026-09-24", 5, "stephen", ""],
  ["CD-21", "Leixlip Semiconductor Services", "health_screening", "referral", 8640, "won", "2026-09-03", "2026-10-01", 7, "stephen", ""],
  ["CD-22", "Bray Coastal Hotels", "flu", "helpscout", 2100, "won", "2026-09-17", "2026-10-02", 9, "martina", ""],
].map(([id, company, service, source, value, outcome, openedOn, closedOn, firstTouchMin, by, reason]) => ({
  id, company, service, source, value, outcome, openedOn, closedOn, firstTouchMin, by, reason,
}) as DeskClosed);

const CONTACT_SEED: Array<[string, string, string, string, string, DeskRole, LocalDate | null]> = [
  ["LD-0009", "Colm Fennessy", "Finance Manager", "colm.fennessy@example.com", "+353 1 555 0184", "finance", null],
  ["LD-0009", "Ruairí Dowling", "General Manager, city hotel", "ruairi.dowling@example.com", "+353 1 555 0185", "influencer", null],
  ["LD-0010", "Avril Mangan", "Executive Assistant to the CEO", "avril.mangan@example.com", "+353 1 555 0188", "user", null],
  ["LD-0012", "Fiachra Moran", "Site Manager", "fiachra.moran@example.com", "+353 1 555 0195", "influencer", null],
  ["LD-0011", "Nuala Brady", "HR Coordinator", "nuala.brady@example.com", "+353 1 555 0192", "champion", null],
  ["LD-0011", "Pat Gilsenan", "HR Manager", "pat.gilsenan@example.com", "+353 1 555 0193", "decision_maker", "2026-09-04"],
  ["LD-0021", "Declan Furlong", "Financial Controller", "declan.furlong@example.com", "+353 59 555 0141", "finance", null],
  ["LD-0021", "Sinéad Kirwan", "Site Safety Lead, Athy", "sinead.kirwan@example.com", "+353 59 555 0142", "influencer", null],
  ["LD-0022", "Owen Phelan", "Chief Financial Officer", "owen.phelan@example.com", "+353 61 555 0151", "decision_maker", null],
  ["LD-0022", "Gavin Stokes", "HR Manager", "gavin.stokes@example.com", "+353 61 555 0152", "champion", "2026-09-14"],
  ["LD-0023", "Gráinne Tuite", "Operations Manager", "grainne.tuite@example.com", "+353 41 555 0161", "user", null],
];

const CONTRACT_SEED: DeskContract[] = [
  { id: "CON-01", company: "Portarlington Plastics", kind: "oh_fee", title: "Occupational health service, annual fee", amount: 525, startedOn: "2025-10-12", renewsOn: "2026-10-12", contactName: "Eilís Dunne", contactEmail: "eilis.dunne@example.com" },
  { id: "CON-02", company: "Kildare Glass Works", kind: "oh_fee", title: "Occupational health service, annual fee", amount: 1050, startedOn: "2025-10-27", renewsOn: "2026-10-27", contactName: "Rory Kinsella", contactEmail: "rory.kinsella@example.com" },
  { id: "CON-03", company: "Athy Precast Concrete", kind: "oh_fee", title: "Occupational health service, annual fee", amount: 1050, startedOn: "2025-12-14", renewsOn: "2026-12-14", contactName: "Brian Tynan", contactEmail: "brian.tynan@example.com" },
  { id: "CON-04", company: "Irish Life Health", kind: "ilh", title: "Corporate wellness partner agreement (confidential)", amount: null, startedOn: "2026-01-01", renewsOn: "2026-12-31", contactName: "Partner manager", contactEmail: "partners.ilh@example.com" },
];

export function initialSalesDeskState(): SalesDeskState {
  return {
    version: 1, seq: { contact: CONTACT_SEED.length, email: 0 },
    contacts: CONTACT_SEED.map(([leadId, name, title, email, phone, role, leftOn], i) => ({ id: `CT-${String(i + 1).padStart(3, "0")}`, leadId, name, title, email, phone, role, left: !!leftOn, leftOn })),
    primaryLeft: {}, targets: { "2026-10": 35000, "2026-11": 35000, "2026-12": 25000 }, defaultTarget: 30000, today: {}, follow: null, rebookPaused: {}, emails: [],
    closed: structuredClone(CLOSED_SEED),
    contracts: structuredClone(CONTRACT_SEED), expiry: {},
  };
}

/**
 * Three larger deals so the board shows the range of Precision Health's work: a pharma group at
 * the proposal stage, a software company with a Gold proposal out (owned by Martina), and a
 * logistics company with a meeting this week. All fictional. Called once from createInitialState.
 */
export function seedSalesDesk(state: PhState): void {
  const s = state.sales;
  if (s.leads.some((l) => l.id === "LD-0021")) return;
  const mk = (x: { id: string; company: string; services: SalesService[]; contact: [string, string, string, string]; source: SalesSource; ref: string | null; on: LocalDate; enquiry: string; stage: SalesLead["stage"]; next: string; nextOn: LocalDate; details: string; q: SalesLead["qualifier"]; owner: StaffId; extra: Array<[LocalDate, Hhmm, string, string]> }): SalesLead => ({
    id: x.id, company: x.company, fictionalCompany: true, services: x.services, contact: { name: x.contact[0], role: x.contact[1], email: x.contact[2], phone: x.contact[3] },
    source: x.source, sourceRef: x.ref, receivedOn: x.on, enquiry: x.enquiry, stage: x.stage, stageAt: at(x.on, "16:00"), ownerId: x.owner, nextAction: x.next, nextActionOn: x.nextOn,
    invoiceName: `${x.company} Ltd`, invoiceEmail: `accounts.${x.id.toLowerCase().replace("-", "")}@example.com`, companyDetails: x.details, qualifier: x.q, research: null, files: [],
    history: [{ at: at(x.on, "09:40"), by: x.source === "helpscout" ? "Help Scout" : "stephen", text: x.source === "helpscout" ? `Enquiry received in Help Scout, conversation ${x.ref}.` : `Enquiry received via ${SALES_SOURCE_LABEL[x.source].toLowerCase()}.` },
      { at: at(x.on, "09:47"), by: x.owner, text: "Added to New Business Leads." }, ...x.extra.map(([d, t, by, text]) => ({ at: at(d, t), by, text }))],
    lostReason: null, handoverTaskId: null,
  });
  s.leads.push(
    mk({ id: "LD-0021", company: "Ballinacor Pharma", services: ["health_screening", "flu", "occupational_health"], contact: ["Niamh Gorman", "HR Director", "niamh.gorman@example.com", "+353 59 555 0140"],
      source: "referral", ref: null, on: "2026-09-21", stage: "new", next: "Build the proposal and send it", nextOn: "2026-10-05",
      enquiry: "We are reviewing health and wellbeing across our three Irish sites, about 320 people. Could we meet to talk about screening, flu and an occupational health service?",
      details: "Fictional pharma manufacturer for the demo. Sites in Carlow, Athy and Naas.", q: { headcount: 320, sites: 3, dates: "Late November into January", budget: "approved" }, owner: "stephen",
      extra: [["2026-09-21", "09:52", "stephen", "Email: first reply sent with the brochure and the booking link."], ["2026-09-24", "10:00", "stephen", "Meeting: discovery meeting with Niamh and the site leads in Carlow."]] }),
    mk({ id: "LD-0022", company: "Shannonside Software", services: ["health_screening", "flu"], contact: ["Ruth Harnett", "People and Culture Lead", "ruth.harnett@example.com", "+353 61 555 0150"],
      source: "website", ref: null, on: "2026-09-08", stage: "proposal_sent", next: "Call Ruth about Gold 1 against Silver 2", nextOn: "2026-10-06",
      enquiry: "Enhanced screening with bloods for about 210 staff in Limerick, ideally with flu at the same visit.",
      details: "Fictional software company for the demo. One campus in Limerick.", q: { headcount: 210, sites: 1, dates: "November and December", budget: "within_range" }, owner: "martina",
      extra: [["2026-09-08", "09:55", "martina", "Email: first reply sent with the brochure and references."], ["2026-09-15", "14:00", "martina", "Meeting: video call with Ruth and Owen. Gold 1 with flu preferred."]] }),
    mk({ id: "LD-0023", company: "Boyne Valley Logistics", services: ["health_screening"], contact: ["Paul Clarke", "Head of HR", "paul.clarke@example.com", "+353 41 555 0160"],
      source: "helpscout", ref: "HS-58712", on: "2026-09-30", stage: "new", next: "Discovery meeting with Paul on site in Drogheda", nextOn: "2026-10-07",
      enquiry: "We have about 150 drivers and warehouse staff across two depots and would like a screening programme early in the new year.",
      details: "Fictional logistics company for the demo. Depots in Drogheda and Dublin Port.", q: { headcount: 150, sites: 2, dates: "January or February", budget: "unknown" }, owner: "stephen",
      extra: [["2026-09-30", "09:49", "stephen", "Email: first reply sent with the brochure and references."], ["2026-10-01", "11:20", "stephen", "Call: spoke to Paul. Meeting booked for Wednesday 7 October in Drogheda."]] }),
  );
  s.seq.lead = Math.max(s.seq.lead, 23);
  state.salesFlow.notes["LD-0021"] = { text: "Met Niamh and the site leads in Carlow. About 320 staff across three sites: Carlow, Athy and Naas. Interested in POC3 for everyone, maybe Gold 1 for the senior team. Yes to flu, around 250. Late November into January. Occupational health for pre-employment medicals and management referrals. Budget approved for screening.", savedAt: at("2026-09-24", "11:30"), savedBy: "stephen" };
  const items = s.priceItems;
  const cfg: SalesProposalConfig = { ...salesBlankConfig(), participantsLow: 190, participantsHigh: 210, lines: [{ itemId: "gold1", days: 9 }], flu: true, fluLow: 150, fluHigh: 210, locations: "Limerick campus, two rooms", dates: "November and December 2026", upsell: ["gold2", "gold3"] };
  s.proposals.push({ id: "PRP-0009", leadId: "LD-0022", versions: [{ version: 1, config: cfg, prices: salesPriceSnapshot(cfg, items), priceListVersion: 1, status: "sent", createdAt: at("2026-09-21", "15:00"), createdBy: "Martina Beattie", sentAt: at("2026-09-22", "10:30"), sentTo: "ruth.harnett@example.com", decidedAt: null, decisionNote: "" }] });
  s.seq.proposal = Math.max(s.seq.proposal, 9);
  const lead = s.leads.find((l) => l.id === "LD-0022")!;
  lead.files.push({ id: "LD-0022-PRP-0009-v1", name: "Proposal PRP-0009 v1.pdf", kind: "proposal", proposalId: "PRP-0009", version: 1, addedAt: at("2026-09-22", "10:30") });
  lead.history.push({ at: at("2026-09-22", "10:30"), by: "martina", text: "Proposal PRP-0009 v1 sent to ruth.harnett@example.com." });
  lead.stageAt = at("2026-09-22", "10:30");
  const p = s.proposals[s.proposals.length - 1];
  const v = p.versions[0];
  const today = localDateOf(state.clock.nowUtc);
  const steps: Record<string, { status: "sent"; at: Iso; by: string }> = {};
  salesFollowDueDates(v.sentAt!).forEach((d, i) => { if (d < today) steps[String(i + 1)] = { status: "sent", at: `${d}T09:30:00.000Z`, by: "martina" }; });
  state.salesFlow.sequences[salesSequenceKey(p, v)] = { paused: false, steps };
  for (const l of s.leads.filter((x) => ["LD-0021", "LD-0022", "LD-0023"].includes(x.id))) l.history.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}

export function deskRecordCount(d: SalesDeskState): number {
  return d.contacts.length + d.closed.length + d.emails.length + Object.keys(d.today).length;
}

/* ---------------------------------------------------------------- follow-ups */

export type DeskFollowKind = "sequence" | "next" | "scheduled";
export const DESK_FOLLOW_KIND_LABEL: Record<DeskFollowKind, string> = { sequence: "Sequence emails", next: "Next steps", scheduled: "Scheduled emails" };
export type DeskWhen = "overdue" | "today" | "week" | "later";
export const DESK_WHEN_LABEL: Record<DeskWhen, string> = { overdue: "Overdue", today: "Today", week: "This week", later: "Later" };
export interface DeskFollowItem {
  key: string;
  kind: DeskFollowKind;
  when: DeskWhen;
  due: LocalDate;
  title: string;
  sub: string;
  company: string;
  leadId: string | null;
  ownerId: string;
  value: number | null;
  /** Sequence step number, for sending. */
  n?: number;
  schedId?: string;
  paused?: boolean;
}
/** Overdue, today, this week (to Sunday) or later. */
export function deskWhen(t: LocalDate, due: LocalDate): DeskWhen {
  if (due < t) return "overdue";
  if (due === t) return "today";
  return due <= addDays(t, (7 - weekdayOf(t)) % 7) ? "week" : "later";
}
/** Every follow up across the deals: the soft sequence emails, each deal's next step, and follow-up emails scheduled in the calendar. */
export function deskFollowUps(state: PhState): DeskFollowItem[] {
  const t = localDateOf(state.clock.nowUtc);
  const out: DeskFollowItem[] = [];
  for (const l of state.sales.leads) {
    if (l.stage !== "new" && l.stage !== "proposal_sent") continue;
    const d = deskDeal(state, l);
    const seq = salesFollowSequence(state, l.id);
    if (seq && !seq.stopped) {
      for (const st of seq.steps) {
        if (st.status !== "due" && st.status !== "scheduled") continue;
        out.push({ key: `seq:${l.id}:${st.n}`, kind: "sequence", when: deskWhen(t, st.due), due: st.due, title: `Follow up ${st.n}: "${st.subject}"`, sub: `${seq.proposalId} to ${l.contact.name}${seq.paused ? ". Sequence paused" : ""}`,
          company: l.company, leadId: l.id, ownerId: l.ownerId, value: d.value, n: st.n, paused: seq.paused });
      }
    }
    if (l.nextActionOn && !d.waiting) {
      out.push({ key: `next:${l.id}`, kind: "next", when: deskWhen(t, l.nextActionOn), due: l.nextActionOn, title: l.nextAction || "Next step", sub: `${l.contact.name}${l.contact.phone ? `, ${l.contact.phone}` : ""}`, company: l.company, leadId: l.id, ownerId: l.ownerId, value: d.value });
    }
  }
  for (const x of state.scheduled?.items || []) {
    if (x.kind !== "follow_up" || x.status !== "scheduled") continue;
    out.push({ key: `sched:${x.id}`, kind: "scheduled", when: deskWhen(t, x.date), due: x.date, title: `Email: "${x.title}"`, sub: `To ${x.contact || "the contact"}${x.start ? ` at ${x.start}` : ""}`, company: x.client || "", leadId: x.leadId, ownerId: x.createdBy, value: null, schedId: x.id });
  }
  return out.sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : a.company.localeCompare(b.company)));
}

/* ---------------------------------------------------------------- expiring soon */

/** Proposals are valid for 30 days from the day they are sent, unless extended. */
export const DESK_PROPOSAL_VALID_DAYS = 30;
export type DeskExpKind = "proposal" | "oh_fee" | "programme" | "ilh";
export const DESK_EXP_KIND_LABEL: Record<DeskExpKind, string> = { proposal: "Proposals and quotes", oh_fee: "Occupational health fees", programme: "Annual screening programmes", ilh: "Irish Life Health" };
export interface DeskExpItem {
  key: string;
  kind: DeskExpKind;
  company: string;
  title: string;
  sub: string;
  expires: LocalDate;
  daysLeft: number;
  value: number | null;
  leadId: string | null;
  /** Quote out with no reply for this many days, when 14 or more. */
  noReplyDays: number | null;
  reminded: boolean;
  ref: string;
  contactName: string;
}
export function deskProposalExpiry(state: PhState, proposalId: string): LocalDate | null {
  const p = state.sales.proposals.find((x) => x.id === proposalId);
  const v = p ? salesLatestVersion(p) : null;
  if (!v || !v.sentAt) return null;
  return state.salesDesk?.expiry[`prop:${proposalId}`]?.extendedTo || addDays(localDateOf(v.sentAt), DESK_PROPOSAL_VALID_DAYS);
}
/** What lapses or renews in the next `days` days, plus anything lapsed in the last 60 days and still open. */
export function deskExpiring(state: PhState, days = 90): DeskExpItem[] {
  const t = localDateOf(state.clock.nowUtc);
  const marks = state.salesDesk?.expiry || {};
  const hidden = (k: string) => { const m = marks[k]; return !!m && (!!m.lost || (!!m.until && m.until > t)); };
  const out: DeskExpItem[] = [];
  const add = (x: DeskExpItem) => { if (!hidden(x.key) && x.daysLeft <= days && x.daysLeft >= -60) out.push(x); };
  for (const p of state.sales.proposals) {
    const v = salesLatestVersion(p);
    const lead = state.sales.leads.find((l) => l.id === p.leadId);
    if (!lead || v.status !== "sent" || !v.sentAt || lead.stage === "won" || lead.stage === "lost") continue;
    const exp = deskProposalExpiry(state, p.id)!;
    const since = daysBetween(localDateOf(v.sentAt), t);
    const k = `prop:${p.id}`;
    const net = salesNetTotals(state, p).netHigh;
    add({ key: k, kind: "proposal", company: lead.company, title: `${p.id} v${v.version}, ${salesEur(net)}`, sub: `Sent ${fmtWeekdayDate(v.sentAt)} to ${lead.contact.name}${marks[k]?.extendedTo ? ". Validity extended" : ""}`,
      expires: exp, daysLeft: daysBetween(t, exp), value: net, leadId: lead.id, noReplyDays: since >= 14 ? since : null, reminded: !!marks[k]?.remindedAt, ref: p.id, contactName: lead.contact.name });
  }
  for (const c of state.salesDesk?.contracts || []) {
    const k = `con:${c.id}`;
    const exp = marks[k]?.extendedTo || c.renewsOn;
    add({ key: k, kind: c.kind, company: c.company, title: c.title, sub: `${c.amount ? `${salesEur(c.amount)} a year. ` : ""}Since ${fmtWeekdayDate(c.startedOn)}. Contact ${c.contactName}`, expires: exp, daysLeft: daysBetween(t, exp), value: c.amount, leadId: null, noReplyDays: null, reminded: !!marks[k]?.remindedAt, ref: c.id, contactName: c.contactName });
  }
  for (const r of salesRecalls(state)) {
    if (r.status === "rebooked" || r.status === "in_pipeline" || r.lapsed) continue;
    const k = `prg:${r.id}`;
    const exp = marks[k]?.extendedTo || r.recallOn;
    add({ key: k, kind: "programme", company: r.company, title: `${SALES_SERVICE_LABEL[r.service]}: ${r.packageText}`, sub: `Last screened ${fmtWeekdayDate(r.screenedOn)}${r.participants ? `, ${r.participants} people` : ""}. Contact ${r.contactName}`, expires: exp, daysLeft: daysBetween(t, exp), value: null, leadId: r.leadId, noReplyDays: null, reminded: !!marks[k]?.remindedAt || !!state.onboarding?.rebookSent?.[r.id], ref: r.id, contactName: r.contactName });
  }
  return out.sort((a, b) => a.daysLeft - b.daysLeft || a.company.localeCompare(b.company));
}
