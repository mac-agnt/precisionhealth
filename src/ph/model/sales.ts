/* Sales: new business leads, proposals priced from the client's own price list, recall and repeat
   business, and the Irish Life Health partner channel (RECORDING.md sections 1 and 7).
   Types, deterministic fixtures and pure selectors live here. The action handlers are registered
   by the Sales page module (src/ph/pages/Sales/actions.ts) through registerHandlers.
   Everything is fictional demo content: contact people, emails (example.com), phone numbers,
   Help Scout references, Irish Life corporate partners, invoices and tenders. Client company
   names from the walkthrough are business references used as demo labels only.
   The slice stays small (well under 300 records) because the reducer deep-clones state per action. */
import type { Iso, LocalDate, Hhmm } from "./time";
import { addDays, daysBetween, dublinToUtc, fmtDate, localDateOf } from "./time";
import type { PhState, ProgrammeId, StaffId } from "./types";

/* ---------------------------------------------------------------- labels */

export type SalesService = "health_screening" | "flu" | "occupational_health" | "wellness_talk" | "executive";
export const SALES_SERVICES: SalesService[] = ["health_screening", "flu", "occupational_health", "wellness_talk", "executive"];
export const SALES_SERVICE_LABEL: Record<SalesService, string> = {
  health_screening: "Health screening",
  flu: "Flu",
  occupational_health: "Occupational health",
  wellness_talk: "Wellness talk",
  executive: "Executive",
};

export type SalesStage = "new" | "proposal_sent" | "won" | "lost";
export const SALES_STAGES: SalesStage[] = ["new", "proposal_sent", "won", "lost"];
/** Group names from the Monday "New Business Leads" board. */
export const SALES_STAGE_LABEL: Record<SalesStage, string> = {
  new: "New contact leads",
  proposal_sent: "Proposal sent",
  won: "Won",
  lost: "Lost",
};

export type SalesSource = "helpscout" | "website" | "referral" | "irish_life" | "recall" | "tender";
export const SALES_SOURCES: SalesSource[] = ["helpscout", "website", "referral", "irish_life", "recall", "tender"];
export const SALES_SOURCE_LABEL: Record<SalesSource, string> = {
  helpscout: "Help Scout",
  website: "Website",
  referral: "Referral",
  irish_life: "Irish Life",
  recall: "Recall",
  tender: "Tender",
};

export type SalesBudget = "unknown" | "price_sensitive" | "within_range" | "approved";
export const SALES_BUDGET_LABEL: Record<SalesBudget, string> = {
  unknown: "Not known yet",
  price_sensitive: "Price sensitive",
  within_range: "Within our range",
  approved: "Budget approved",
};

/* ---------------------------------------------------------------- leads */

export interface SalesHistoryEntry { at: Iso; by: string; text: string }

export interface SalesLeadFile {
  id: string;
  name: string;
  kind: "proposal" | "brochure" | "other";
  proposalId: string | null;
  version: number | null;
  addedAt: Iso;
}

export interface SalesQualifier {
  headcount: number | null;
  sites: number | null;
  /** Free text, for example "Early November". */
  dates: string;
  budget: SalesBudget;
}

export interface SalesLead {
  id: string; // LD-0001
  company: string;
  /** True for invented company names. Others are real business names used as demo labels. */
  fictionalCompany: boolean;
  services: SalesService[];
  contact: { name: string; role: string; email: string; phone: string };
  source: SalesSource;
  /** Help Scout conversation, tender or recall reference. Fictional. */
  sourceRef: string | null;
  receivedOn: LocalDate;
  enquiry: string;
  stage: SalesStage;
  stageAt: Iso;
  ownerId: StaffId;
  nextAction: string;
  nextActionOn: LocalDate | null;
  invoiceName: string;
  invoiceEmail: string;
  companyDetails: string;
  qualifier: SalesQualifier;
  /** Filled by "Research with agent". Prewritten demo text, never fetched. */
  research: string | null;
  files: SalesLeadFile[];
  history: SalesHistoryEntry[];
  lostReason: string | null;
  /** Work task created by "Create programme" after a win. */
  handoverTaskId: string | null;
}

/** A sales enquiry waiting in the shared Help Scout inbox. Simulated sample, Help Scout is not connected. */
export interface SalesInboxItem {
  id: string; // HS-58744
  receivedAt: Iso;
  company: string;
  fictionalCompany: boolean;
  contactName: string;
  contactRole: string;
  contactEmail: string;
  phone: string;
  subject: string;
  body: string;
  services: SalesService[];
  headcount: number | null;
  status: "unassigned" | "converted";
  leadId: string | null;
}

/* ---------------------------------------------------------------- price list */

export type SalesPriceFamily = "poc" | "silver" | "gold" | "executive" | "vaccination" | "partner";
export const SALES_FAMILY_LABEL: Record<SalesPriceFamily, string> = {
  poc: "Point of care (POC)",
  silver: "Silver packages",
  gold: "Gold packages (enhanced screening)",
  executive: "Executive Health Assessment",
  vaccination: "Vaccination",
  partner: "Irish Life partner services",
};
export type SalesPriceUnit = "day" | "participant" | "vaccine" | "session";
export const SALES_UNIT_LABEL: Record<SalesPriceUnit, string> = { day: "per clinical day", participant: "per participant", vaccine: "per vaccine administered", session: "per session" };
export type SalesPriceStatus = "confirmed" | "to_confirm" | "not_supplied";
export const SALES_PRICE_STATUS_LABEL: Record<SalesPriceStatus, string> = { confirmed: "Client figure", to_confirm: "To confirm", not_supplied: "Rate not supplied" };

export interface SalesPriceItem {
  id: string;
  code: string;
  name: string;
  family: SalesPriceFamily;
  includes: string;
  unit: SalesPriceUnit;
  /** Euro per unit. Null when the rate has not been supplied. For a range, the lower end. */
  price: number | null;
  /** Upper end of a price range (Executive Health Assessment). */
  priceMax: number | null;
  minutes: number | null;
  /** Appointments per clinical day. Null when not stated. */
  perDay: number | null;
  status: SalesPriceStatus;
  note: string;
}

export interface SalesPriceChange {
  version: number;
  at: Iso;
  by: string;
  itemId: string | null;
  summary: string;
  reason: string;
}

/** Capacity used to plan clinic days. 25 a day is assumed when the package does not state one. */
export function salesCapacity(item: SalesPriceItem): { perDay: number; assumed: boolean } {
  return item.perDay === null ? { perDay: 25, assumed: true } : { perDay: item.perDay, assumed: false };
}

/* ---------------------------------------------------------------- proposals */

export interface SalesProposalLine { itemId: string; days: number }
export interface SalesProposalConfig {
  title: string;
  participantsLow: number;
  participantsHigh: number;
  locations: string;
  dates: string;
  /** Day-priced packages from the price list. */
  lines: SalesProposalLine[];
  /** Flu add-on: per vaccine administered, conditional on vaccine supply. */
  flu: boolean;
  fluLow: number;
  fluHigh: number;
  exec: { count: number; rate: number } | null;
  /** Packages shown as upgrade options in the proposal. */
  upsell: string[];
  notes: string;
}
export type SalesProposalStatus = "draft" | "sent" | "accepted" | "declined";
export const SALES_PROPOSAL_STATUS_LABEL: Record<SalesProposalStatus, string> = { draft: "Draft", sent: "Sent", accepted: "Accepted", declined: "Declined" };
export interface SalesProposalVersion {
  version: number;
  config: SalesProposalConfig;
  /** Unit prices used, keyed by price item id. Frozen once the version is sent. */
  prices: Record<string, number>;
  priceListVersion: number;
  status: SalesProposalStatus;
  createdAt: Iso;
  createdBy: string;
  sentAt: Iso | null;
  sentTo: string | null;
  decidedAt: Iso | null;
  decisionNote: string;
}
export interface SalesProposal { id: string; leadId: string; versions: SalesProposalVersion[] }

/* ---------------------------------------------------------------- recall, tenders */

export interface SalesEngagement {
  id: string; // ENG-01
  company: string;
  fictionalCompany: boolean;
  service: SalesService;
  screenedOn: LocalDate;
  participants: number | null;
  packageText: string;
  contactName: string;
  contactEmail: string;
}

export interface SalesOutreach {
  id: string; // OUT-001
  engagementId: string;
  company: string;
  kind: "recall" | "lapsed";
  to: string;
  toEmail: string;
  subject: string;
  body: string;
  createdAt: Iso;
  createdBy: string;
}

export type SalesTenderStatus = "watching" | "preparing" | "submitted" | "not_bidding";
export const SALES_TENDER_STATUS_LABEL: Record<SalesTenderStatus, string> = { watching: "Watching", preparing: "Preparing a bid", submitted: "Bid submitted", not_bidding: "Not bidding" };
export interface SalesTender {
  id: string; // TW-01
  title: string;
  buyer: string;
  service: SalesService;
  publishedOn: LocalDate;
  closesOn: LocalDate;
  valueText: string;
  status: SalesTenderStatus;
  leadId: string | null;
}

/* ---------------------------------------------------------------- Irish Life Health */

export type SalesIlhRequested = "cancer_screening" | "wellness_talk" | "poc3" | "lifestyle_checkpoint";
export const SALES_ILH_REQUESTED_LABEL: Record<SalesIlhRequested, string> = {
  cancer_screening: "Cancer screening",
  wellness_talk: "Wellness talk",
  poc3: "POC 3",
  lifestyle_checkpoint: "Lifestyle Check Point",
};
/** Price list item behind each requested screening. */
export const SALES_ILH_PRICE_ITEM: Record<SalesIlhRequested, string> = {
  cancer_screening: "ilh-cancer",
  wellness_talk: "ilh-talk",
  poc3: "poc3",
  lifestyle_checkpoint: "ilh-lcp",
};
export type SalesIlhPayment = "draft_needs_action" | "in_draft" | "awaiting_payment" | "paid";
export const SALES_ILH_PAYMENT_LABEL: Record<SalesIlhPayment, string> = {
  draft_needs_action: "Draft needs action",
  in_draft: "In draft",
  awaiting_payment: "Awaiting payment",
  paid: "Paid",
};
export interface SalesIlhInvoice {
  number: string; // IN26-561
  amount: number;
  source: "price_list" | "manual";
  basis: string;
  priceListVersion: number | null;
  draftedAt: Iso;
  draftedBy: string;
}
export interface SalesIlhBooking {
  id: string; // ILH-0101
  item: string;
  company: string;
  location: string;
  eircode: string;
  requested: SalesIlhRequested;
  date: LocalDate;
  start: Hhmm;
  group: "pending" | "lifestyle";
  /** Reference from the Irish Life booking web app. Fictional. */
  intakeRef: string;
  screened: boolean;
  /** Null until the screening has happened. */
  payment: SalesIlhPayment | null;
  invoice: SalesIlhInvoice | null;
  archived: boolean;
}
/** A submission waiting in the Irish Life booking web app. Simulated intake. */
export interface SalesIlhSubmission {
  ref: string; // ILH-WEB-2291
  submittedAt: Iso;
  company: string;
  location: string;
  eircode: string;
  requested: SalesIlhRequested;
  date: LocalDate;
  start: Hhmm;
  status: "waiting" | "added";
}

/* ---------------------------------------------------------------- state */

export interface SalesState {
  version: 1;
  seq: { lead: number; proposal: number; ilh: number; invoice: number; outreach: number };
  leads: SalesLead[];
  inbox: SalesInboxItem[];
  proposals: SalesProposal[];
  priceItems: SalesPriceItem[];
  priceVersion: number;
  priceHistory: SalesPriceChange[];
  engagements: SalesEngagement[];
  /** Recall item id to the lead created from it. */
  recallLeads: Record<string, string>;
  outreach: SalesOutreach[];
  tenders: SalesTender[];
  ilh: SalesIlhBooking[];
  ilhIntake: SalesIlhSubmission[];
}

/* ---------------------------------------------------------------- permissions (frontend simulation) */

export interface SalesRights {
  /** See the Sales pages. Every staff role. */
  view: boolean;
  /** Leads, proposals, recall and tenders. Stephen (programme oversight) owns sales. */
  manage: boolean;
  /** Change the price list. Stephen only. */
  prices: boolean;
  /** Update Irish Life bookings and invoices. Stephen, Martina and Brenda. */
  ilh: boolean;
}
export function salesRights(p: { isParticipant: boolean; role: string }): SalesRights {
  if (p.isParticipant) return { view: false, manage: false, prices: false, ilh: false };
  const owner = p.role === "programme_oversight";
  return { view: true, manage: owner, prices: owner, ilh: owner || p.role === "programme_reporting" || p.role === "operations" };
}

/* ---------------------------------------------------------------- formatting and dates */

/** €3,820 or €1,234.50 */
export function salesEur(n: number): string {
  const v = Math.abs(n);
  const cents = Math.round(v * 100);
  const body = cents % 100 === 0 ? String(Math.round(v)) : (cents / 100).toFixed(2);
  return (n < 0 ? "-" : "") + "€" + body.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
/** "€4,420" or "€4,420 to €4,495" */
export function salesEurRange(low: number, high: number): string {
  return low === high ? salesEur(low) : `${salesEur(low)} to ${salesEur(high)}`;
}

const p2 = (n: number) => String(n).padStart(2, "0");
/** Same day n months later, clamped to the end of a shorter month. */
export function salesShiftMonths(d: LocalDate, n: number): LocalDate {
  const [y, m, day] = d.split("-").map(Number);
  const t = m - 1 + n;
  const ny = y + Math.floor(t / 12);
  const nm = ((t % 12) + 12) % 12 + 1;
  const dim = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${p2(nm)}-${p2(Math.min(day, dim))}`;
}

const normCompany = (c: string) => c.toLowerCase().replace(/\(fictional\)/g, "").replace(/[^a-z0-9&]+/g, " ").trim();

/* ---------------------------------------------------------------- proposal arithmetic */

export function salesSuggestedDays(participants: number, perDay: number): number {
  return Math.max(1, Math.ceil(Math.max(0, participants) / Math.max(1, perDay)));
}

export interface SalesTotalsLine { itemId: string; code: string; name: string; days: number; rate: number; perDay: number; assumedCapacity: boolean; total: number; capacity: number }
export interface SalesTotals {
  lines: SalesTotalsLine[];
  programme: number;
  /** Appointments the booked days allow, summed over the day-priced packages. */
  capacity: number;
  /** Participants above capacity at the high estimate. */
  shortfall: number;
  flu: { rate: number; low: number; high: number; lowQty: number; highQty: number } | null;
  exec: { count: number; rate: number; total: number; days: number } | null;
  totalLow: number;
  totalHigh: number;
  /** Item ids in the config that are missing from the price list or have no rate. */
  missing: string[];
}

/**
 * Totals exactly as the client's proposal works them out: day-priced packages are days times the
 * day rate (unused capacity does not reduce the day rate); flu is €15 per vaccine administered,
 * shown at the low and high estimate; executive assessments are per participant.
 * prices, when given, override the current price list (a sent version keeps its own prices).
 */
export function salesProposalTotals(cfg: SalesProposalConfig, items: SalesPriceItem[], prices?: Record<string, number>): SalesTotals {
  const byId = new Map(items.map((i) => [i.id, i]));
  const rateOf = (id: string): number | null => (prices && prices[id] !== undefined ? prices[id] : byId.get(id)?.price ?? null);
  const missing: string[] = [];
  const lines: SalesTotalsLine[] = [];
  for (const l of cfg.lines) {
    const item = byId.get(l.itemId);
    const rate = rateOf(l.itemId);
    if (!item || rate === null) { missing.push(l.itemId); continue; }
    const cap = salesCapacity(item);
    const days = Math.max(0, Math.floor(l.days));
    lines.push({ itemId: item.id, code: item.code, name: item.name, days, rate, perDay: cap.perDay, assumedCapacity: cap.assumed, total: days * rate, capacity: days * cap.perDay });
  }
  const programme = lines.reduce((n, l) => n + l.total, 0);
  const capacity = lines.reduce((n, l) => n + l.capacity, 0);
  let flu: SalesTotals["flu"] = null;
  if (cfg.flu) {
    const rate = rateOf("flu");
    if (rate === null) missing.push("flu");
    else flu = { rate, lowQty: Math.max(0, cfg.fluLow), highQty: Math.max(0, cfg.fluHigh), low: Math.max(0, cfg.fluLow) * rate, high: Math.max(0, cfg.fluHigh) * rate };
  }
  let exec: SalesTotals["exec"] = null;
  if (cfg.exec && cfg.exec.count > 0) {
    const item = byId.get("exec");
    const perDay = item ? salesCapacity(item).perDay : 12;
    exec = { count: cfg.exec.count, rate: cfg.exec.rate, total: cfg.exec.count * cfg.exec.rate, days: Math.ceil(cfg.exec.count / perDay) };
  }
  const base = programme + (exec ? exec.total : 0);
  const shortfall = lines.length ? Math.max(0, cfg.participantsHigh - capacity) : 0;
  return { lines, programme, capacity, shortfall, flu, exec, totalLow: base + (flu ? flu.low : 0), totalHigh: base + (flu ? flu.high : 0), missing };
}

/** Problems that block sending a proposal. Empty when it can be sent. */
export function salesProposalIssues(cfg: SalesProposalConfig, items: SalesPriceItem[]): string[] {
  const out: string[] = [];
  const t = salesProposalTotals(cfg, items);
  if (!cfg.title.trim()) out.push("Give the proposal a title.");
  if (cfg.participantsLow < 1 || cfg.participantsHigh < cfg.participantsLow) out.push("Participant numbers need a low and a high estimate, low not above high.");
  if (!cfg.lines.length && !cfg.flu && !cfg.exec) out.push("Add at least one package, the flu add-on or executive assessments.");
  if (cfg.lines.some((l) => !Number.isFinite(l.days) || l.days < 1)) out.push("Every package needs at least one clinical day.");
  if (t.missing.length) out.push(`No rate on the price list for ${t.missing.join(", ")}.`);
  if (t.shortfall > 0) out.push(`The booked days hold ${t.capacity} appointments, ${t.shortfall} short of the high estimate. Add a day or lower the estimate.`);
  if (cfg.flu && (cfg.fluLow < 1 || cfg.fluHigh < cfg.fluLow)) out.push("Flu numbers need a low and a high estimate, low not above high.");
  if (cfg.exec) {
    const item = items.find((i) => i.id === "exec");
    if (cfg.exec.count < 1) out.push("Executive assessments need at least one participant.");
    if (item && item.price !== null && (cfg.exec.rate < item.price || cfg.exec.rate > (item.priceMax ?? item.price))) out.push(`The executive rate must be between ${salesEur(item.price)} and ${salesEur(item.priceMax ?? item.price)} per participant.`);
  }
  return out;
}

export function salesLatestVersion(p: SalesProposal): SalesProposalVersion {
  return p.versions[p.versions.length - 1];
}
export function salesVersionTotals(s: SalesState, v: SalesProposalVersion): SalesTotals {
  return salesProposalTotals(v.config, s.priceItems, v.status === "draft" ? undefined : v.prices);
}
/** Unit prices a version uses, snapshot from the current price list. */
export function salesPriceSnapshot(cfg: SalesProposalConfig, items: SalesPriceItem[]): Record<string, number> {
  const out: Record<string, number> = {};
  const add = (id: string) => { const it = items.find((i) => i.id === id); if (it && it.price !== null) out[id] = it.price; };
  cfg.lines.forEach((l) => add(l.itemId));
  cfg.upsell.forEach(add);
  if (cfg.flu) add("flu");
  if (cfg.exec) add("exec");
  return out;
}

/** A first draft from what the lead qualifier knows. */
export function salesDefaultConfig(lead: SalesLead, items: SalesPriceItem[]): SalesProposalConfig {
  const n = lead.qualifier.headcount && lead.qualifier.headcount > 0 ? lead.qualifier.headcount : 25;
  const poc = items.find((i) => i.id === "poc3");
  const screening = lead.services.includes("health_screening");
  const exec = lead.services.includes("executive");
  const flu = lead.services.includes("flu");
  const lines: SalesProposalLine[] = screening && poc ? [{ itemId: "poc3", days: salesSuggestedDays(n, salesCapacity(poc).perDay) }] : [];
  const title = exec && !screening ? "Executive Health Assessment Programme" : flu && !screening ? "Workplace Flu Vaccination Programme" : "Corporate Health Screening Programme";
  return {
    title, participantsLow: n, participantsHigh: n, locations: lead.qualifier.sites && lead.qualifier.sites > 1 ? `${lead.qualifier.sites} sites, to confirm` : "One site, room to confirm",
    dates: lead.qualifier.dates || "To agree", lines, flu, fluLow: n, fluHigh: n, exec: exec ? { count: n, rate: items.find((i) => i.id === "exec")?.price ?? 575 } : null,
    upsell: screening ? ["silver2", "silver3", "gold1", "gold2", "gold3"] : [], notes: "",
  };
}

/* ---------------------------------------------------------------- selectors */

export interface SalesLeadView {
  lead: SalesLead;
  proposal: SalesProposal | null;
  version: SalesProposalVersion | null;
  totals: SalesTotals | null;
  overdue: boolean;
  dueToday: boolean;
}
export function salesLeadViews(state: PhState): SalesLeadView[] {
  const s = state.sales;
  const today = localDateOf(state.clock.nowUtc);
  return s.leads.map((lead) => {
    const props = s.proposals.filter((p) => p.leadId === lead.id);
    const proposal = props.length ? props[props.length - 1] : null;
    const version = proposal ? salesLatestVersion(proposal) : null;
    const open = lead.stage === "new" || lead.stage === "proposal_sent";
    return {
      lead, proposal, version, totals: version ? salesVersionTotals(s, version) : null,
      overdue: open && !!lead.nextActionOn && lead.nextActionOn < today,
      dueToday: open && lead.nextActionOn === today,
    };
  });
}

/** What the lead qualifier still needs before a proposal can be priced well. */
export function salesQualifierGaps(lead: SalesLead): string[] {
  const q = lead.qualifier;
  const gaps: string[] = [];
  if (!lead.services.length) gaps.push("service");
  if (!q.headcount) gaps.push("headcount");
  if (!q.sites) gaps.push("sites");
  if (!q.dates.trim()) gaps.push("dates");
  if (q.budget === "unknown") gaps.push("budget signal");
  return gaps;
}

/** Rough sizing shown in the qualifier: what the price list says for this headcount. */
export function salesQualifierSizing(lead: SalesLead, items: SalesPriceItem[]): string[] {
  const n = lead.qualifier.headcount;
  if (!n) return [];
  const out: string[] = [];
  const by = (id: string) => items.find((i) => i.id === id);
  if (lead.services.includes("health_screening")) {
    const poc = by("poc3"); const g1 = by("gold1");
    if (poc && poc.price !== null) { const d = salesSuggestedDays(n, salesCapacity(poc).perDay); out.push(`POC3: ${d} clinical day${d === 1 ? "" : "s"} at up to ${salesCapacity(poc).perDay} a day, ${salesEur(d * poc.price)}.`); }
    if (g1 && g1.price !== null) { const d = salesSuggestedDays(n, salesCapacity(g1).perDay); out.push(`Gold 1 with bloods: ${d} day${d === 1 ? "" : "s"}, ${salesEur(d * g1.price)}.`); }
  }
  if (lead.services.includes("flu")) {
    const f = by("flu");
    if (f && f.price !== null) out.push(`Flu: ${salesEur(f.price)} per vaccine administered, ${salesEur(n * f.price)} if all ${n} are vaccinated. Conditional on vaccine supply.`);
  }
  if (lead.services.includes("executive")) {
    const e = by("exec");
    if (e && e.price !== null) out.push(`Executive Health Assessment: ${salesEurRange(n * e.price, n * (e.priceMax ?? e.price))} for ${n}, up to ${salesCapacity(e).perDay} a day.`);
  }
  if (lead.services.includes("occupational_health")) out.push("Occupational health is quoted as a service proposal with a Meddbase appendix, not from this price list.");
  if (lead.services.includes("wellness_talk")) out.push("Wellness talks are not on the price list. Quote the agreed rate.");
  return out;
}

/* ---- recall ---- */

export type SalesRecallStatus = "overdue" | "plan_now" | "upcoming" | "in_pipeline" | "rebooked";
export const SALES_RECALL_STATUS_LABEL: Record<SalesRecallStatus, string> = {
  overdue: "Overdue",
  plan_now: "Plan now",
  upcoming: "Upcoming",
  in_pipeline: "In pipeline",
  rebooked: "Rebooked",
};
export interface SalesRecall {
  id: string; // RC-ENG-05 or RC-PRG-SISK-26
  engagementId: string;
  company: string;
  fictionalCompany: boolean;
  service: SalesService;
  packageText: string;
  participants: number | null;
  screenedOn: LocalDate;
  recallOn: LocalDate;
  planFrom: LocalDate;
  status: SalesRecallStatus;
  daysToRecall: number;
  leadId: string | null;
  programmeId: ProgrammeId | null;
  contactName: string;
  contactEmail: string;
  outreachId: string | null;
  lapsed: boolean;
}

/** Seeded past engagements plus the current programmes, as engagements. */
export function salesAllEngagements(state: PhState): Array<SalesEngagement & { programmeId: ProgrammeId | null }> {
  const fromProgrammes = state.programmes.map((p) => {
    const company = state.companies.find((c) => c.id === p.clientId);
    const ct = state.contacts.find((c) => c.id === company?.contactIds[0]) || state.contacts.find((c) => c.companyId === p.clientId);
    return {
      id: p.id, company: p.clientName, fictionalCompany: false, service: "health_screening" as SalesService, screenedOn: p.windowStart, participants: null,
      packageText: `Programme ${p.code}`, contactName: ct?.name || "Client contact", contactEmail: ct?.email || "", programmeId: p.id,
    };
  });
  return [...state.sales.engagements.map((e) => ({ ...e, programmeId: null })), ...fromProgrammes];
}

/**
 * Stephen's rule: a client screened on a date is re-contacted for the same date next year, and the
 * planning conversation starts about a month before (J&J screened 5 Feb, recall 5 Feb next year,
 * conversation from early January). One recall per company, from its latest engagement.
 * Lapsed: no engagement in the last 13 months and nothing in the pipeline.
 */
export function salesRecalls(state: PhState): SalesRecall[] {
  const s = state.sales;
  const today = localDateOf(state.clock.nowUtc);
  const latest = new Map<string, SalesEngagement & { programmeId: ProgrammeId | null }>();
  for (const e of salesAllEngagements(state)) {
    const k = normCompany(e.company);
    const cur = latest.get(k);
    if (!cur || e.screenedOn > cur.screenedOn) latest.set(k, e);
  }
  const out: SalesRecall[] = [];
  for (const e of latest.values()) {
    const id = `RC-${e.id}`;
    const recallOn = salesShiftMonths(e.screenedOn, 12);
    const planFrom = salesShiftMonths(recallOn, -1);
    const linked = s.recallLeads[id] ? s.leads.find((l) => l.id === s.recallLeads[id]) : undefined;
    const later = s.leads.filter((l) => normCompany(l.company) === normCompany(e.company) && l.receivedOn >= e.screenedOn && l.stage !== "lost");
    const lead = linked && linked.stage !== "lost" ? linked : later[later.length - 1];
    let status: SalesRecallStatus;
    if (lead) status = lead.stage === "won" ? "rebooked" : "in_pipeline";
    else if (today > recallOn) status = "overdue";
    else if (today >= planFrom) status = "plan_now";
    else status = "upcoming";
    const lapsed = !lead && daysBetween(e.screenedOn, today) > 395;
    const draft = [...s.outreach].reverse().find((o) => o.engagementId === e.id);
    out.push({
      id, engagementId: e.id, company: e.company, fictionalCompany: e.fictionalCompany, service: e.service, packageText: e.packageText, participants: e.participants,
      screenedOn: e.screenedOn, recallOn, planFrom, status, daysToRecall: daysBetween(today, recallOn), leadId: lead ? lead.id : null, programmeId: e.programmeId,
      contactName: e.contactName, contactEmail: e.contactEmail, outreachId: draft ? draft.id : null, lapsed,
    });
  }
  return out.sort((a, b) => (a.recallOn < b.recallOn ? -1 : a.recallOn > b.recallOn ? 1 : a.company < b.company ? -1 : 1));
}

/** Clients with engagements in more than one year. */
export function salesRepeatBusiness(state: PhState): Array<{ company: string; fictionalCompany: boolean; years: number[]; count: number; last: LocalDate; service: SalesService }> {
  const groups = new Map<string, Array<SalesEngagement & { programmeId: ProgrammeId | null }>>();
  for (const e of salesAllEngagements(state)) {
    const k = normCompany(e.company);
    groups.set(k, [...(groups.get(k) || []), e]);
  }
  const out: Array<{ company: string; fictionalCompany: boolean; years: number[]; count: number; last: LocalDate; service: SalesService }> = [];
  for (const list of groups.values()) {
    const years = Array.from(new Set(list.map((e) => Number(e.screenedOn.slice(0, 4))))).sort();
    if (years.length < 2) continue;
    const last = list.reduce((m, e) => (e.screenedOn > m.screenedOn ? e : m), list[0]);
    out.push({ company: last.company, fictionalCompany: last.fictionalCompany, years, count: list.length, last: last.screenedOn, service: last.service });
  }
  return out.sort((a, b) => b.count - a.count || (a.company < b.company ? -1 : 1));
}

/** The re-engagement email. No clinical information: dates, service and a planning call only. */
export function salesOutreachText(r: { company: string; contactName: string; screenedOn: LocalDate; recallOn: LocalDate; service: SalesService }, kind: "recall" | "lapsed"): { subject: string; body: string } {
  const fmt = fmtDate;
  const first = r.contactName.split(" ")[0] || "there";
  const svc = SALES_SERVICE_LABEL[r.service].toLowerCase();
  if (kind === "lapsed") {
    return {
      subject: `Precision Health: planning ${svc} at ${r.company} for next year`,
      body: `Hi ${first},\n\nWe last ran ${svc} with ${r.company} on ${fmt(r.screenedOn)} and it would be good to work with your team again. We have added new screening packages since then, including options with an atrial fibrillation screen and a full 12-lead ECG.\n\nWould you be open to a short call over the next couple of weeks to talk through dates and numbers?\n\nKind regards,\nStephen Kelly\nSales and Operations Director, Precision Health`,
    };
  }
  return {
    subject: `Precision Health: ${svc} at ${r.company}, ${fmt(r.recallOn)}`,
    body: `Hi ${first},\n\nIt is almost a year since we ran ${svc} with ${r.company} on ${fmt(r.screenedOn)}. We would like to hold the same week this year, around ${fmt(r.recallOn)}, before the diary fills.\n\nCould we have a short planning call to confirm dates, numbers, the venue and any changes to the package?\n\nKind regards,\nStephen Kelly\nSales and Operations Director, Precision Health`,
  };
}

/* ---- Irish Life ---- */

export function salesIlhPriceFor(s: SalesState, requested: SalesIlhRequested): { item: SalesPriceItem | null; amount: number | null; basis: string } {
  const item = s.priceItems.find((i) => i.id === SALES_ILH_PRICE_ITEM[requested]) || null;
  if (!item || item.price === null) return { item, amount: null, basis: `${SALES_ILH_REQUESTED_LABEL[requested]}: rate not on the price list` };
  const unit = item.unit === "day" ? "clinical day" : "session";
  return { item, amount: item.price, basis: `1 ${unit} x ${salesEur(item.price)} (${item.code}, price list v${s.priceVersion})` };
}

/** Rough record count for the size guard. */
export function salesRecordCount(s: SalesState): number {
  return s.leads.length + s.leads.reduce((n, l) => n + l.history.length + l.files.length, 0) + s.inbox.length
    + s.proposals.reduce((n, p) => n + p.versions.length, 0) + s.priceItems.length + s.priceHistory.length + s.engagements.length
    + s.outreach.length + s.tenders.length + s.ilh.length + s.ilhIntake.length;
}

/* ---------------------------------------------------------------- research (simulated agent) */

const RESEARCH_EXTRA: Record<string, string> = {
  "ibec": "The enquiry is flu only and the numbers are large enough for a dedicated clinic day. Ask whether staff work from one office, and whether a second date is needed for people who miss the first.",
  "aryzta ireland": "Shift work across two sites means early clinics. Ask for shift start times so the vaccinators arrive before the first break.",
  "collen construction": "Site and office staff suggests a POC3 day at the office plus a site visit. Ask about a room at the site compound and parking for the clinic vehicle.",
  "utmost": "Occupational health, not screening: pre-employment medicals and management referrals. Send the OH brochure, then a service proposal with the Meddbase appendix and the onboarding link.",
  "corrib air charter": "Recruitment testing for flight crew: psychological assessment and drug testing, delivered as occupational health. Brochure, meeting, then a service proposal with the Meddbase appendix.",
  "comreg": "A single lunchtime talk during a wellbeing week. A good route to a screening day later in the year.",
  "issu": "Audience is student officers, so a talk rather than screening. Keep the content general.",
  "limerick twenty thirty": "Referred through Irish Life. A small team suits one POC3 day.",
  "o callaghan collection": "Hotel teams, 40 to 45 people, screening and flu at one visit. Two POC3 days hold up to 50 appointments.",
  "rwe": "Executive health assessments for a small senior group. Up to 12 a day, so one day covers 8 people.",
  "iq resource": "Asked for bloods, which points to the Gold packages. Gold 1 adds full blood count, uric acid, ferritin and kidney profile.",
  "pj edwards": "Site staff, 60 to 70 people, screening and flu. Three POC3 days hold up to 75.",
};
/**
 * Deterministic research summary standing in for the Perplexity step. Prewritten from the lead's own
 * fields: no network call, no company facts looked up. A live agent would cite public sources.
 */
export function salesResearchText(lead: SalesLead): string {
  const svc = lead.services.map((x) => SALES_SERVICE_LABEL[x].toLowerCase()).join(" and ") || "a service to confirm";
  const q = lead.qualifier;
  const parts = [
    `Simulated research, prewritten demo text. No network call was made and no company facts were looked up.`,
    `${lead.company} asked about ${svc} on ${fmtDate(lead.receivedOn)} via ${SALES_SOURCE_LABEL[lead.source]}.${q.headcount ? ` The enquiry mentions about ${q.headcount} people.` : " Headcount is not known yet."}`,
    RESEARCH_EXTRA[normCompany(lead.company)] || "Confirm the decision maker, the number of people and sites, and preferred dates before pricing.",
    `Suggested reply: thank them, confirm what they need, and offer a short call this week. Questions to ask: ${salesQualifierGaps(lead).length ? salesQualifierGaps(lead).join(", ") : "none outstanding, ready to build a proposal"}.`,
  ];
  return parts.join("\n\n");
}

/* ---------------------------------------------------------------- fixtures */

const at = (d: LocalDate, t: Hhmm): Iso => dublinToUtc(d, t);
const STEPHEN = "Stephen Kelly";
const HS = "Help Scout (simulated)";

export const SALES_PRICE_SEED: SalesPriceItem[] = [
  { id: "poc3", code: "POC3", name: "POC3 programme", family: "poc", includes: "Point-of-care screening day. No laboratory needed.", unit: "day", price: 1910, priceMax: null, minutes: null, perDay: 25, status: "confirmed",
    note: "Up to 25 POC3 appointments a day. Unused capacity does not reduce the day rate." },
  { id: "poc4", code: "POC4", name: "POC4 programme", family: "poc", includes: "Contents to confirm.", unit: "day", price: 1675, priceMax: null, minutes: null, perDay: null, status: "to_confirm",
    note: "Seen on screen as a 2-day total of €3,350. Day rate derived. Contents and daily capacity to confirm." },
  { id: "poc5", code: "POC5", name: "POC5 programme", family: "poc", includes: "Contents to confirm.", unit: "day", price: 2140, priceMax: null, minutes: null, perDay: null, status: "to_confirm",
    note: "Seen on screen as a 2-day total of €4,280. Day rate derived. Contents and daily capacity to confirm." },
  { id: "silver1", code: "Silver 1", name: "Silver 1", family: "silver", includes: "Silver base package. Components to confirm.", unit: "day", price: 2995, priceMax: null, minutes: null, perDay: null, status: "to_confirm",
    note: "Seen on screen as a 2-day total of €5,990. Day rate derived. Appointment length and daily capacity to confirm." },
  { id: "silver2", code: "Silver 2", name: "Silver 2", family: "silver", includes: "Silver 1 + atrial fibrillation screen", unit: "day", price: 3100, priceMax: null, minutes: 15, perDay: 25, status: "confirmed", note: "15 minutes, up to 25 a day." },
  { id: "silver3", code: "Silver 3", name: "Silver 3", family: "silver", includes: "Silver 1 + full 12-lead ECG", unit: "day", price: 3700, priceMax: null, minutes: 20, perDay: 20, status: "confirmed", note: "20 minutes, up to 20 a day." },
  { id: "gold1", code: "Gold 1", name: "Gold 1", family: "gold", includes: "All Silver 1 components + extended blood panel: full blood count, uric acid, ferritin, kidney profile", unit: "day", price: 3585, priceMax: null, minutes: 15, perDay: 25, status: "confirmed", note: "15 minutes, up to 25 a day." },
  { id: "gold2", code: "Gold 2", name: "Gold 2", family: "gold", includes: "Gold 1 + atrial fibrillation screen", unit: "day", price: 3755, priceMax: null, minutes: 15, perDay: 25, status: "confirmed", note: "15 minutes, up to 25 a day." },
  { id: "gold3", code: "Gold 3", name: "Gold 3", family: "gold", includes: "Gold 1 + full 12-lead ECG", unit: "day", price: 3930, priceMax: null, minutes: 20, perDay: 20, status: "confirmed", note: "20 minutes, up to 20 a day." },
  { id: "exec", code: "EHA", name: "Executive Health Assessment", family: "executive", includes: "One hour: 30 minutes with a practitioner and 30 minutes with a doctor. Tailored biomarker panel, examination and discussion.", unit: "participant", price: 575, priceMax: 920, minutes: 60, perDay: 12, status: "confirmed",
    note: "€575 to €920 per participant depending on the biomarker panel. Up to 12 a day." },
  { id: "flu", code: "Flu", name: "Flu vaccination add-on", family: "vaccination", includes: "Seasonal flu vaccine administered onsite.", unit: "vaccine", price: 15, priceMax: null, minutes: null, perDay: null, status: "confirmed",
    note: "€15 per vaccine administered. Conditional on vaccine supply." },
  { id: "ilh-cancer", code: "ILH Cancer", name: "Cancer screening (Irish Life)", family: "partner", includes: "Booked through the Irish Life booking web app.", unit: "session", price: null, priceMax: null, minutes: null, perDay: null, status: "not_supplied",
    note: "Irish Life partner rate is confidential and was not supplied. Enter the agreed amount when drafting the invoice, or set the rate here." },
  { id: "ilh-talk", code: "ILH Talk", name: "Wellness talk (Irish Life)", family: "partner", includes: "Booked through the Irish Life booking web app.", unit: "session", price: null, priceMax: null, minutes: null, perDay: null, status: "not_supplied",
    note: "Irish Life partner rate is confidential and was not supplied." },
  { id: "ilh-lcp", code: "ILH LCP", name: "Lifestyle Check Point (Irish Life)", family: "partner", includes: "Weekly Lifestyle Check Point session.", unit: "session", price: null, priceMax: null, minutes: null, perDay: null, status: "not_supplied",
    note: "Irish Life partner rate is confidential and was not supplied." },
];

interface LeadSeed {
  id: string; company: string; fictional?: boolean; services: SalesService[]; contact: [string, string, string, string]; source: SalesSource; ref: string | null; on: LocalDate;
  enquiry: string; stage: SalesStage; stageOn: LocalDate; next: string; nextOn: LocalDate | null; details: string; q: [number | null, number | null, string, SalesBudget];
  lost?: string; files?: Array<[string, SalesLeadFile["kind"], LocalDate]>; extra?: Array<[LocalDate, Hhmm, string, string]>;
}

const LEAD_SEEDS: LeadSeed[] = [
  { id: "LD-0001", company: "IBEC", services: ["flu"], contact: ["Gráinne Lacey", "HR Manager (fictional)", "grainne.lacey@example.com", "+353 1 555 0141"], source: "helpscout", ref: "HS-58731", on: "2026-10-01",
    enquiry: "We would like to run flu vaccinations for our staff this autumn. We have about 115 employees, mostly in our Dublin office. Could you send pricing and the dates you have in October or November?",
    stage: "new", stageOn: "2026-10-01", next: "Reply with flu pricing and confirm when vaccine supply is expected", nextOn: "2026-10-05",
    details: "Dublin office. About 115 employees (from the enquiry). Registered details to confirm.", q: [115, 1, "October or November", "unknown"] },
  { id: "LD-0002", company: "ARYZTA Ireland", services: ["flu"], contact: ["Ciarán Mulvey", "Facilities and Safety Lead (fictional)", "ciaran.mulvey@example.com", "+353 1 555 0147"], source: "website", ref: null, on: "2026-09-29",
    enquiry: "Looking for onsite flu vaccination across two sites for shift staff, including an early-morning clinic. Roughly 180 staff in total.",
    stage: "new", stageOn: "2026-09-29", next: "Ask for site addresses and shift start times", nextOn: "2026-10-06",
    details: "Two sites with shift work (from the enquiry). Addresses to confirm.", q: [180, 2, "Late October, early shifts", "within_range"] },
  { id: "LD-0003", company: "Collen Construction", services: ["health_screening"], contact: ["Aoibheann Tracey", "HR Advisor (fictional)", "aoibheann.tracey@example.com", "+353 1 555 0152"], source: "helpscout", ref: "HS-58702", on: "2026-09-24",
    enquiry: "We are interested in health screening for site and office staff, around 60 people, possibly across our Dublin office and one site compound.",
    stage: "new", stageOn: "2026-09-24", next: "Finish the draft proposal (POC3, 3 days) and send", nextOn: "2026-10-07",
    details: "Office plus one site compound (from the enquiry).", q: [60, 2, "November", "unknown"] },
  { id: "LD-0004", company: "Utmost", services: ["occupational_health"], contact: ["Lorcan Breslin", "Head of People (fictional)", "lorcan.breslin@example.com", "+353 1 555 0158"], source: "referral", ref: null, on: "2026-09-18",
    enquiry: "We need an occupational health provider for pre-employment medicals and management referrals. Can you outline how onboarding works?",
    stage: "new", stageOn: "2026-09-18", next: "Send the OH brochure and book an introductory meeting", nextOn: "2026-10-02",
    details: "Referral from an existing client contact. Headcount to confirm.", q: [null, 1, "From January 2027", "unknown"] },
  { id: "LD-0005", company: "Corrib Air Charter", fictional: true, services: ["occupational_health"], contact: ["Saoirse Kinsella", "Recruitment Manager (fictional)", "saoirse.kinsella@example.com", "+353 91 555 0163"], source: "helpscout", ref: "HS-58690", on: "2026-09-22",
    enquiry: "We are recruiting flight crew and need psychological assessment and drug testing as part of recruitment. About 20 candidates per intake.",
    stage: "new", stageOn: "2026-09-22", next: "Meeting to scope recruitment testing", nextOn: "2026-10-09",
    details: "Fictional aviation business for the demo. Recruitment intakes several times a year.", q: [20, 1, "Next intake in November", "within_range"],
    files: [["Occupational health brochure.pdf", "brochure", "2026-09-23"]] },
  { id: "LD-0006", company: "ComReg", services: ["wellness_talk"], contact: ["Méabh Carolan", "Wellbeing Committee Chair (fictional)", "meabh.carolan@example.com", "+353 1 555 0169"], source: "website", ref: null, on: "2026-09-30",
    enquiry: "Could you deliver a lunchtime wellness talk on heart health during our wellbeing week in November?",
    stage: "new", stageOn: "2026-09-30", next: "Propose two talk dates in wellbeing week", nextOn: "2026-10-08",
    details: "Dublin office. Wellbeing week in mid November (from the enquiry).", q: [80, 1, "Wellbeing week, mid November", "unknown"] },
  { id: "LD-0007", company: "ISSU", services: ["wellness_talk"], contact: ["Tomás Breathnach", "Welfare Officer (fictional)", "tomas.breathnach@example.com", "+353 1 555 0172"], source: "helpscout", ref: "HS-58719", on: "2026-09-28",
    enquiry: "We are planning a wellbeing event for student officers and would like a talk on looking after your health, with information about screening.",
    stage: "new", stageOn: "2026-09-28", next: "Reply with talk options and confirm audience size", nextOn: "2026-10-06",
    details: "Event for student officers. Venue to confirm.", q: [null, 1, "", "unknown"] },
  { id: "LD-0008", company: "Limerick Twenty Thirty", services: ["health_screening"], contact: ["Clíodhna Hartigan", "Office Manager (fictional)", "cliodhna.hartigan@example.com", "+353 61 555 0178"], source: "irish_life", ref: "Irish Life referral", on: "2026-09-26",
    enquiry: "Irish Life suggested we contact you about health screening for our team of about 30.",
    stage: "new", stageOn: "2026-09-26", next: "Call to qualify package and dates", nextOn: "2026-10-05",
    details: "Limerick office. About 30 staff (from the enquiry).", q: [30, 1, "", "unknown"] },
  { id: "LD-0009", company: "O'Callaghan Collection", services: ["health_screening", "flu"], contact: ["Bríd Fennelly", "Group HR Manager (fictional)", "brid.fennelly@example.com", "+353 1 555 0183"], source: "helpscout", ref: "HS-58544", on: "2026-09-15",
    enquiry: "We would like a health screening day for our hotel teams, around 40 to 45 people, and flu vaccines at the same visit if possible.",
    stage: "proposal_sent", stageOn: "2026-09-18", next: "Follow up on proposal v2 and confirm flu numbers", nextOn: "2026-10-06",
    details: "Hotel group. One site for the clinic, room to confirm.", q: [45, 1, "Early November", "within_range"],
    extra: [["2026-09-25", "15:10", STEPHEN, "Client asked to add flu vaccines at the same visit. Proposal v2 to follow."]] },
  { id: "LD-0010", company: "RWE", services: ["executive"], contact: ["Hugh Dempsey", "HR Director (fictional)", "hugh.dempsey@example.com", "+353 1 555 0187"], source: "referral", ref: null, on: "2026-09-10",
    enquiry: "Executive health assessments for our senior leadership team, about 8 people, ideally before year end.",
    stage: "proposal_sent", stageOn: "2026-09-21", next: "Chase a decision on executive assessments", nextOn: "2026-10-03",
    details: "Senior leadership team of about 8 (from the enquiry).", q: [8, 1, "Before year end", "approved"] },
  { id: "LD-0011", company: "IQ Resource", services: ["health_screening"], contact: ["Eimear Cosgrave", "Operations Director (fictional)", "eimear.cosgrave@example.com", "+353 1 555 0191"], source: "website", ref: null, on: "2026-09-08",
    enquiry: "Enhanced health screening with bloods for about 25 staff.",
    stage: "proposal_sent", stageOn: "2026-09-17", next: "Call to discuss Gold 1 against Silver 2", nextOn: "2026-10-08",
    details: "One office, about 25 staff.", q: [25, 1, "October", "price_sensitive"] },
  { id: "LD-0012", company: "PJ Edwards", services: ["health_screening", "flu"], contact: ["Diarmuid Lenihan", "Health and Safety Manager (fictional)", "diarmuid.lenihan@example.com", "+353 1 555 0194"], source: "helpscout", ref: "HS-58611", on: "2026-09-16",
    enquiry: "Screening and flu for our site staff, 60 to 70 people.",
    stage: "proposal_sent", stageOn: "2026-09-25", next: "Confirm site access and parking for the clinic days", nextOn: "2026-10-12",
    details: "Site staff. Access and parking to confirm.", q: [70, 1, "November", "within_range"] },
  { id: "LD-0013", company: "LinkedIn", services: ["health_screening"], contact: ["Orlagh Prendergast", "Wellbeing Lead (fictional)", "orlagh.prendergast@example.com", "+353 1 555 0136"], source: "referral", ref: null, on: "2026-08-27",
    enquiry: "Cardiac health screening for staff in October.",
    stage: "won", stageOn: "2026-09-09", next: "Booking page live. Clinic on 16 Oct", nextOn: "2026-10-16",
    details: "Dublin office. Cardiac screening, booking by time slot.", q: [40, 1, "16 October", "approved"] },
  { id: "LD-0014", company: "IRFU", services: ["health_screening"], contact: ["Colm Brannigan", "Operations Manager (fictional)", "colm.brannigan@example.com", "+353 1 555 0131"], source: "referral", ref: null, on: "2026-09-03",
    enquiry: "A Gold 3 screening day on 1 December.",
    stage: "won", stageOn: "2026-09-19", next: "Confirm room and parking for 1 Dec, 09:30 start", nextOn: "2026-11-17",
    details: "One site. Gold 3, 09:30 start.", q: [20, 1, "1 December", "approved"] },
  { id: "LD-0015", company: "Dornan Group", services: ["health_screening"], contact: ["Rhona Keaveney", "HR Partner (fictional)", "rhona.keaveney@example.com", "+353 1 555 0127"], source: "helpscout", ref: "HS-58377", on: "2026-08-12",
    enquiry: "Bespoke male and female screening across several sites.",
    stage: "won", stageOn: "2026-09-02", next: "Site schedule agreed with Martina", nextOn: "2026-10-20",
    details: "Several sites. Bespoke male and female packages.", q: [140, 4, "October and November", "approved"],
    files: [["Bespoke proposal, sent before Pulse.pdf", "proposal", "2026-08-21"]] },
  { id: "LD-0016", company: "Shannon Estuary Foods", fictional: true, services: ["health_screening"], contact: ["Gerry Mullane", "Plant Manager (fictional)", "gerry.mullane@example.com", "+353 61 555 0123"], source: "website", ref: null, on: "2026-07-14",
    enquiry: "Health screening for about 100 production staff over two shifts.",
    stage: "lost", stageOn: "2026-08-20", next: "Revisit in spring 2027", nextOn: null,
    details: "Fictional company for the demo. Production site, two shifts.", q: [100, 1, "September", "price_sensitive"], lost: "Chose a lower-cost provider." },
  { id: "LD-0017", company: "Kilbarry Data Services", fictional: true, services: ["flu"], contact: ["Ailbhe Rourke", "Office Manager (fictional)", "ailbhe.rourke@example.com", "+353 21 555 0119"], source: "helpscout", ref: "HS-58402", on: "2026-08-19",
    enquiry: "Do you offer flu vaccination for a small office of about 25?",
    stage: "lost", stageOn: "2026-09-01", next: "Revisit next autumn", nextOn: null,
    details: "Fictional company for the demo. Cork office.", q: [25, 1, "October", "price_sensitive"], lost: "No budget this year. Revisit in 2027." },
];

interface ProposalSeed { id: string; leadId: string; versions: Array<{ cfg: Partial<SalesProposalConfig> & Pick<SalesProposalConfig, "participantsLow" | "participantsHigh" | "lines">; status: SalesProposalStatus; on: LocalDate; sentOn?: LocalDate; decidedOn?: LocalDate; note?: string }> }

const UPSELL_ALL = ["silver2", "silver3", "gold1", "gold2", "gold3"];
const PROPOSAL_SEEDS: ProposalSeed[] = [
  { id: "PRP-0001", leadId: "LD-0009", versions: [
    { cfg: { participantsLow: 40, participantsHigh: 45, lines: [{ itemId: "poc3", days: 2 }], locations: "One hotel site, room to confirm", dates: "Early November 2026", upsell: UPSELL_ALL }, status: "sent", on: "2026-09-17", sentOn: "2026-09-18" },
    { cfg: { participantsLow: 40, participantsHigh: 45, lines: [{ itemId: "poc3", days: 2 }], flu: true, fluLow: 40, fluHigh: 45, locations: "One hotel site, room to confirm", dates: "Early November 2026", upsell: UPSELL_ALL, notes: "Flu added at the client's request." }, status: "sent", on: "2026-09-28", sentOn: "2026-09-29" },
  ] },
  { id: "PRP-0002", leadId: "LD-0010", versions: [
    { cfg: { title: "Executive Health Assessment Programme", participantsLow: 8, participantsHigh: 8, lines: [], exec: { count: 8, rate: 750 }, locations: "Our clinic or your office, to agree", dates: "November or December 2026", upsell: [] }, status: "sent", on: "2026-09-20", sentOn: "2026-09-21" },
  ] },
  { id: "PRP-0003", leadId: "LD-0011", versions: [
    { cfg: { participantsLow: 22, participantsHigh: 25, lines: [{ itemId: "gold1", days: 1 }], locations: "One office", dates: "October 2026", upsell: ["silver2", "gold2", "gold3"] }, status: "sent", on: "2026-09-16", sentOn: "2026-09-17" },
  ] },
  { id: "PRP-0004", leadId: "LD-0012", versions: [
    { cfg: { participantsLow: 60, participantsHigh: 70, lines: [{ itemId: "poc3", days: 3 }], flu: true, fluLow: 60, fluHigh: 70, locations: "Site canteen, to confirm", dates: "November 2026", upsell: UPSELL_ALL }, status: "sent", on: "2026-09-24", sentOn: "2026-09-25" },
  ] },
  { id: "PRP-0005", leadId: "LD-0013", versions: [
    { cfg: { title: "Cardiac Health Screening Programme", participantsLow: 35, participantsHigh: 40, lines: [{ itemId: "silver3", days: 2 }], locations: "Dublin office", dates: "16 October 2026", upsell: ["gold3"] }, status: "accepted", on: "2026-09-01", sentOn: "2026-09-02", decidedOn: "2026-09-09", note: "Accepted by email." },
  ] },
  { id: "PRP-0006", leadId: "LD-0014", versions: [
    { cfg: { participantsLow: 18, participantsHigh: 20, lines: [{ itemId: "gold3", days: 1 }], locations: "One site", dates: "1 December 2026, 09:30 start", upsell: [] }, status: "accepted", on: "2026-09-08", sentOn: "2026-09-09", decidedOn: "2026-09-19", note: "Accepted by phone, confirmed by email." },
  ] },
  { id: "PRP-0007", leadId: "LD-0003", versions: [
    { cfg: { participantsLow: 55, participantsHigh: 60, lines: [{ itemId: "poc3", days: 3 }], locations: "Dublin office and one site compound", dates: "November 2026", upsell: UPSELL_ALL }, status: "draft", on: "2026-10-02" },
  ] },
  { id: "PRP-0008", leadId: "LD-0016", versions: [
    { cfg: { participantsLow: 90, participantsHigh: 100, lines: [{ itemId: "poc3", days: 4 }], locations: "Production site, two shifts", dates: "September 2026", upsell: UPSELL_ALL }, status: "declined", on: "2026-07-21", sentOn: "2026-07-22", decidedOn: "2026-08-20", note: "Chose a lower-cost provider." },
  ] },
];

const ENGAGEMENT_SEEDS: SalesEngagement[] = [
  { id: "ENG-01", company: "J&J", fictionalCompany: false, service: "health_screening", screenedOn: "2025-02-05", participants: 60, packageText: "POC3, 3 days", contactName: "Treasa Moloney", contactEmail: "treasa.moloney@example.com" },
  { id: "ENG-02", company: "J&J", fictionalCompany: false, service: "health_screening", screenedOn: "2026-02-05", participants: 64, packageText: "POC3, 3 days", contactName: "Treasa Moloney", contactEmail: "treasa.moloney@example.com" },
  { id: "ENG-03", company: "Sisk", fictionalCompany: false, service: "health_screening", screenedOn: "2025-09-15", participants: 460, packageText: "Comprehensive (LAB) screen", contactName: "Róisín Hegarty", contactEmail: "roisin.hegarty@example.com" },
  { id: "ENG-04", company: "Salesforce", fictionalCompany: false, service: "health_screening", screenedOn: "2025-09-30", participants: 75, packageText: "Silver 2, 3 days", contactName: "Daragh Coyle", contactEmail: "daragh.coyle@example.com" },
  { id: "ENG-05", company: "Cairn Homes", fictionalCompany: false, service: "health_screening", screenedOn: "2025-11-04", participants: 85, packageText: "Silver 2, 4 days", contactName: "Peadar Grehan", contactEmail: "peadar.grehan@example.com" },
  { id: "ENG-06", company: "ABP", fictionalCompany: false, service: "health_screening", screenedOn: "2025-10-21", participants: 120, packageText: "POC3, 5 days", contactName: "Lisa Mangan", contactEmail: "lisa.mangan@example.com" },
  { id: "ENG-07", company: "IRFU", fictionalCompany: false, service: "health_screening", screenedOn: "2025-12-01", participants: 18, packageText: "Gold 3, 1 day", contactName: "Colm Brannigan", contactEmail: "colm.brannigan@example.com" },
  { id: "ENG-08", company: "Dornan Group", fictionalCompany: false, service: "health_screening", screenedOn: "2025-09-10", participants: 140, packageText: "Bespoke male and female, several sites", contactName: "Rhona Keaveney", contactEmail: "rhona.keaveney@example.com" },
  { id: "ENG-09", company: "LinkedIn", fictionalCompany: false, service: "health_screening", screenedOn: "2025-10-16", participants: 38, packageText: "Silver 3, 2 days", contactName: "Orlagh Prendergast", contactEmail: "orlagh.prendergast@example.com" },
  { id: "ENG-10", company: "Kerry Coast Hotels", fictionalCompany: true, service: "health_screening", screenedOn: "2024-06-18", participants: 45, packageText: "POC3, 2 days", contactName: "Bernie Scanlon", contactEmail: "bernie.scanlon@example.com" },
  { id: "ENG-11", company: "Midleton Logistics", fictionalCompany: true, service: "flu", screenedOn: "2025-03-03", participants: 70, packageText: "Flu clinic, 1 day", contactName: "Fergus Lyne", contactEmail: "fergus.lyne@example.com" },
  { id: "ENG-12", company: "Navan Print Works", fictionalCompany: true, service: "health_screening", screenedOn: "2025-09-22", participants: 30, packageText: "Gold 1, 2 days", contactName: "Yvonne Clinton", contactEmail: "yvonne.clinton@example.com" },
  { id: "ENG-13", company: "Athlone Medtech Services", fictionalCompany: true, service: "health_screening", screenedOn: "2025-11-26", participants: 50, packageText: "Silver 2, 2 days", contactName: "Kevin Brophy", contactEmail: "kevin.brophy@example.com" },
];

const TENDER_SEEDS: SalesTender[] = [
  { id: "TW-01", title: "Employee health screening framework (fictional notice)", buyer: "A national semi-state body (fictional)", service: "health_screening", publishedOn: "2026-09-21", closesOn: "2026-10-30", valueText: "Framework, value not stated", status: "watching", leadId: null },
  { id: "TW-02", title: "Occupational health services, regional council (fictional notice)", buyer: "A regional local authority (fictional)", service: "occupational_health", publishedOn: "2026-09-28", closesOn: "2026-11-13", valueText: "Estimated value not stated", status: "watching", leadId: null },
  { id: "TW-03", title: "Staff flu vaccination 2026 (fictional notice)", buyer: "A third-level institute (fictional)", service: "flu", publishedOn: "2026-09-14", closesOn: "2026-10-16", valueText: "About 600 staff", status: "preparing", leadId: null },
  { id: "TW-04", title: "Wellness talks programme 2027 (fictional notice)", buyer: "A public agency (fictional)", service: "wellness_talk", publishedOn: "2026-10-01", closesOn: "2026-12-04", valueText: "12 talks over the year", status: "watching", leadId: null },
  { id: "TW-05", title: "Executive health assessments (fictional notice)", buyer: "A state company (fictional)", service: "executive", publishedOn: "2026-08-24", closesOn: "2026-09-25", valueText: "Up to 40 assessments", status: "not_bidding", leadId: null },
];

const INBOX_SEEDS: SalesInboxItem[] = [
  { id: "HS-58744", receivedAt: at("2026-10-03", "14:20"), company: "Slaney Valley Credit Union", fictionalCompany: true, contactName: "Muireann Kehoe", contactRole: "Operations Manager (fictional)", contactEmail: "muireann.kehoe@example.com", phone: "+353 53 555 0114",
    subject: "Screening morning and a talk for our staff", body: "Could you quote for a health screening morning and a short wellness talk for 22 staff? We are flexible on dates before Christmas.",
    services: ["health_screening", "wellness_talk"], headcount: 22, status: "unassigned", leadId: null },
  { id: "HS-58751", receivedAt: at("2026-10-04", "09:05"), company: "Tralee Bay Hotels", fictionalCompany: true, contactName: "Séamus Brosnan", contactRole: "General Manager (fictional)", contactEmail: "seamus.brosnan@example.com", phone: "+353 66 555 0117",
    subject: "Flu jabs for hotel staff", body: "Are you able to do flu jabs for about 70 hotel staff in late October? Mornings suit us best.",
    services: ["flu"], headcount: 70, status: "unassigned", leadId: null },
  { id: "HS-58753", receivedAt: at("2026-10-05", "07:48"), company: "Athenry Engineering", fictionalCompany: true, contactName: "Niall Furey", contactRole: "Health and Safety Officer (fictional)", contactEmail: "niall.furey@example.com", phone: "+353 91 555 0121",
    subject: "Night worker assessments and skin surveillance", body: "We need a provider for night worker assessments and skin surveillance for about 40 staff. Can you tell us how you would set this up?",
    services: ["occupational_health"], headcount: 40, status: "unassigned", leadId: null },
];

interface IlhSeed { id: string; company: string; loc: string; eir: string; req: SalesIlhRequested; date: LocalDate; start: Hhmm; group?: "pending" | "lifestyle"; inv?: [number, number, SalesIlhPayment, "price_list" | "manual"]; screened?: boolean; archived?: boolean }
const ILH_SEEDS: IlhSeed[] = [
  { id: "ILH-0090", company: "Glenmara Hotels", loc: "Galway", eir: "H91 KD2E", req: "poc3", date: "2026-02-11", start: "09:30", inv: [541, 1910, "paid", "price_list"], archived: true },
  { id: "ILH-0091", company: "Ardmore Freight", loc: "Cork", eir: "T12 RX4P", req: "cancer_screening", date: "2026-03-18", start: "10:00", inv: [544, 2400, "paid", "manual"], archived: true },
  { id: "ILH-0092", company: "Dunmore Insurance Brokers", loc: "Dublin 2", eir: "D02 HY81", req: "wellness_talk", date: "2026-04-22", start: "12:30", inv: [547, 650, "paid", "manual"], archived: true },
  { id: "ILH-0101", company: "Ardmore Freight", loc: "Cork", eir: "T12 RX4P", req: "poc3", date: "2026-09-08", start: "09:30", inv: [549, 1910, "paid", "price_list"] },
  { id: "ILH-0102", company: "Glenmara Hotels", loc: "Galway", eir: "H91 KD2E", req: "cancer_screening", date: "2026-09-15", start: "10:00", inv: [552, 2400, "paid", "manual"] },
  { id: "ILH-0103", company: "Carrow Engineering", loc: "Limerick", eir: "V94 T6CW", req: "poc3", date: "2026-09-22", start: "09:00", inv: [555, 1910, "awaiting_payment", "price_list"] },
  { id: "ILH-0104", company: "Dunmore Insurance Brokers", loc: "Dublin 2", eir: "D02 HY81", req: "wellness_talk", date: "2026-09-24", start: "12:30", inv: [557, 650, "awaiting_payment", "manual"] },
  { id: "ILH-0105", company: "Fernhill Pharma Services", loc: "Athlone", eir: "N37 F2X9", req: "poc3", date: "2026-09-29", start: "09:30", inv: [558, 1910, "in_draft", "price_list"] },
  { id: "ILH-0106", company: "Holloway Retail Group", loc: "Waterford", eir: "X91 P8KD", req: "cancer_screening", date: "2026-10-01", start: "10:00", screened: true },
  { id: "ILH-0107", company: "Eskerline Foods", loc: "Kilkenny", eir: "R95 W3NH", req: "poc3", date: "2026-10-02", start: "09:00", screened: true },
  { id: "ILH-0108", company: "Ardmore Freight", loc: "Cork", eir: "T12 RX4P", req: "wellness_talk", date: "2026-10-05", start: "12:30" },
  { id: "ILH-0109", company: "Glenmara Hotels", loc: "Galway", eir: "H91 KD2E", req: "poc3", date: "2026-10-14", start: "09:30" },
  { id: "ILH-0110", company: "Carrow Engineering", loc: "Limerick", eir: "V94 T6CW", req: "cancer_screening", date: "2026-10-21", start: "10:00" },
  { id: "ILH-0111", company: "Dunmore Insurance Brokers", loc: "Dublin 2", eir: "D02 HY81", req: "poc3", date: "2026-11-04", start: "09:00" },
  { id: "ILH-0112", company: "Fernhill Pharma Services", loc: "Athlone", eir: "N37 F2X9", req: "wellness_talk", date: "2026-11-18", start: "13:00" },
  { id: "ILH-0113", company: "Holloway Retail Group", loc: "Waterford", eir: "X91 P8KD", req: "poc3", date: "2026-12-02", start: "09:30" },
  { id: "ILH-0120", company: "Bluestack Software", loc: "Dublin 4", eir: "D04 E5N2", req: "lifestyle_checkpoint", date: "2026-09-16", start: "10:00", group: "lifestyle", inv: [550, 380, "paid", "manual"] },
  { id: "ILH-0121", company: "Bluestack Software", loc: "Dublin 4", eir: "D04 E5N2", req: "lifestyle_checkpoint", date: "2026-09-23", start: "10:00", group: "lifestyle", inv: [554, 380, "awaiting_payment", "manual"] },
  { id: "ILH-0122", company: "Bluestack Software", loc: "Dublin 4", eir: "D04 E5N2", req: "lifestyle_checkpoint", date: "2026-09-30", start: "10:00", group: "lifestyle", inv: [560, 380, "in_draft", "manual"] },
  { id: "ILH-0123", company: "Bluestack Software", loc: "Dublin 4", eir: "D04 E5N2", req: "lifestyle_checkpoint", date: "2026-10-07", start: "10:00", group: "lifestyle" },
  { id: "ILH-0124", company: "Bluestack Software", loc: "Dublin 4", eir: "D04 E5N2", req: "lifestyle_checkpoint", date: "2026-10-14", start: "10:00", group: "lifestyle" },
  { id: "ILH-0125", company: "Bluestack Software", loc: "Dublin 4", eir: "D04 E5N2", req: "lifestyle_checkpoint", date: "2026-10-21", start: "10:00", group: "lifestyle" },
  { id: "ILH-0126", company: "Bluestack Software", loc: "Dublin 4", eir: "D04 E5N2", req: "lifestyle_checkpoint", date: "2026-10-28", start: "10:00", group: "lifestyle" },
];

const ILH_INTAKE_SEEDS: SalesIlhSubmission[] = [
  { ref: "ILH-WEB-2291", submittedAt: at("2026-10-04", "19:12"), company: "Glenmara Hotels", location: "Galway", eircode: "H91 KD2E", requested: "wellness_talk", date: "2026-11-11", start: "11:00", status: "waiting" },
  { ref: "ILH-WEB-2294", submittedAt: at("2026-10-05", "07:31"), company: "Bluestack Software", location: "Dublin 4", eircode: "D04 E5N2", requested: "cancer_screening", date: "2026-11-25", start: "10:00", status: "waiting" },
];

export function salesIlhItemName(company: string, requested: SalesIlhRequested): string {
  return `${company}, ${SALES_ILH_REQUESTED_LABEL[requested]}`;
}

function baseConfig(): SalesProposalConfig {
  return { title: "Corporate Health Screening Programme", participantsLow: 25, participantsHigh: 25, locations: "", dates: "", lines: [], flu: false, fluLow: 0, fluHigh: 0, exec: null, upsell: [], notes: "" };
}

export function initialSalesState(): SalesState {
  const items: SalesPriceItem[] = structuredClone(SALES_PRICE_SEED);
  const leads: SalesLead[] = LEAD_SEEDS.map((x) => {
    const history: SalesHistoryEntry[] = [];
    if (x.source === "helpscout") history.push({ at: at(x.on, "09:40"), by: HS, text: `Enquiry received in Help Scout, conversation ${x.ref}.` });
    else history.push({ at: at(x.on, "09:40"), by: STEPHEN, text: `Enquiry received via ${SALES_SOURCE_LABEL[x.source].toLowerCase()}.` });
    history.push({ at: at(x.on, "11:05"), by: STEPHEN, text: "Added to New Business Leads." });
    (x.extra || []).forEach(([d, t, by, text]) => history.push({ at: at(d, t), by, text }));
    if (x.stage === "won") history.push({ at: at(x.stageOn, "16:00"), by: STEPHEN, text: "Moved to Won." });
    if (x.stage === "lost") history.push({ at: at(x.stageOn, "16:00"), by: STEPHEN, text: `Moved to Lost. ${x.lost || ""}`.trim() });
    const files: SalesLeadFile[] = (x.files || []).map(([name, kind, d], i) => ({ id: `${x.id}-F${i + 1}`, name, kind, proposalId: null, version: null, addedAt: at(d, "12:00") }));
    return {
      id: x.id, company: x.company, fictionalCompany: !!x.fictional, services: x.services,
      contact: { name: x.contact[0], role: x.contact[1], email: x.contact[2], phone: x.contact[3] },
      source: x.source, sourceRef: x.ref, receivedOn: x.on, enquiry: x.enquiry, stage: x.stage, stageAt: at(x.stageOn, "16:00"), ownerId: "stephen",
      nextAction: x.next, nextActionOn: x.nextOn,
      invoiceName: x.fictional ? `${x.company} Ltd (fictional)` : `${x.company} (invoice entity to confirm)`,
      invoiceEmail: `accounts.${x.id.toLowerCase().replace("-", "")}@example.com`,
      companyDetails: x.details, qualifier: { headcount: x.q[0], sites: x.q[1], dates: x.q[2], budget: x.q[3] },
      research: null, files, history, lostReason: x.lost || null, handoverTaskId: null,
    };
  });
  const proposals: SalesProposal[] = PROPOSAL_SEEDS.map((p) => {
    const lead = leads.find((l) => l.id === p.leadId)!;
    const versions = p.versions.map((v, i): SalesProposalVersion => {
      const config: SalesProposalConfig = { ...baseConfig(), ...v.cfg };
      const ver: SalesProposalVersion = {
        version: i + 1, config, prices: salesPriceSnapshot(config, items), priceListVersion: 1, status: v.status,
        createdAt: at(v.on, "10:15"), createdBy: STEPHEN, sentAt: v.sentOn ? at(v.sentOn, "11:30") : null, sentTo: v.sentOn ? lead.contact.email : null,
        decidedAt: v.decidedOn ? at(v.decidedOn, "15:00") : null, decisionNote: v.note || "",
      };
      if (v.sentOn) {
        lead.files.push({ id: `${lead.id}-${p.id}-v${i + 1}`, name: `Proposal ${p.id} v${i + 1}.pdf`, kind: "proposal", proposalId: p.id, version: i + 1, addedAt: ver.sentAt! });
        lead.history.push({ at: ver.sentAt!, by: STEPHEN, text: `Proposal ${p.id} v${i + 1} sent to ${lead.contact.email}.` });
      }
      if (v.decidedOn) lead.history.push({ at: ver.decidedAt!, by: STEPHEN, text: `Proposal ${p.id} v${i + 1} ${v.status === "accepted" ? "accepted" : "declined"}. ${v.note || ""}`.trim() });
      return ver;
    });
    return { id: p.id, leadId: p.leadId, versions };
  });
  leads.forEach((l) => { l.history.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0)); l.files.sort((a, b) => (a.addedAt < b.addedAt ? -1 : 1)); });
  const ilh: SalesIlhBooking[] = ILH_SEEDS.map((x) => {
    const screened = !!x.inv || !!x.screened;
    const invoice: SalesIlhInvoice | null = x.inv ? {
      number: `IN26-${x.inv[0]}`, amount: x.inv[1], source: x.inv[3],
      basis: x.inv[3] === "price_list" ? `1 clinical day x ${salesEur(x.inv[1])} (POC3, price list v1)` : "Demo amount entered manually. Irish Life partner rates are confidential and not supplied.",
      priceListVersion: x.inv[3] === "price_list" ? 1 : null, draftedAt: at(addDays(x.date, 1), "10:00"), draftedBy: "Martina Beattie",
    } : null;
    return {
      id: x.id, item: salesIlhItemName(x.company, x.req), company: x.company, location: x.loc, eircode: x.eir, requested: x.req, date: x.date, start: x.start,
      group: x.group || "pending", intakeRef: `ILH-WEB-${2100 + Number(x.id.slice(4))}`, screened,
      payment: x.inv ? x.inv[2] : screened ? "draft_needs_action" : null, invoice, archived: !!x.archived,
    };
  });
  return {
    version: 1,
    seq: { lead: leads.length, proposal: proposals.length, ilh: 126, invoice: 560, outreach: 0 },
    leads,
    inbox: structuredClone(INBOX_SEEDS),
    proposals,
    priceItems: items,
    priceVersion: 1,
    priceHistory: [{ version: 1, at: at("2026-10-02", "17:30"), by: STEPHEN, itemId: null, summary: "Price list imported from the O'Callaghan Collection proposal (client figures).", reason: "Figures as shown in the 2 Oct walkthrough. Silver 1, POC4 and POC5 derived from 2-day totals and marked to confirm." }],
    engagements: structuredClone(ENGAGEMENT_SEEDS),
    recallLeads: {},
    outreach: [],
    tenders: structuredClone(TENDER_SEEDS),
    ilh,
    ilhIntake: structuredClone(ILH_INTAKE_SEEDS),
  };
}

/** Next sequence value, stored in the slice so no other module's counters change. */
export function salesNext(s: SalesState, key: keyof SalesState["seq"]): number {
  s.seq[key] += 1;
  return s.seq[key];
}
export const salesPad = (n: number, w: number) => String(n).padStart(w, "0");
export const salesBlankConfig = baseConfig;
