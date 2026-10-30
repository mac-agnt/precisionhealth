/* Stephen's sales workflow, from the first enquiry to the win: the 10 minute first-touch clock on
   new inbound leads, the agent's first reply (brochure, booking link, same-sector references),
   meeting notes that feed the proposal, the proposal builder, deal instructions with a discount
   line, and the weekly soft follow-up sequence after a proposal goes out.
   Pure types, deterministic text and selectors only. Handlers live in src/ph/pages/Sales/flowActions.ts.
   Nothing here calls a model or a network: the "agent" parts are plain TypeScript parsers and
   templates that a person checks before anything is used. */
import type { Iso, LocalDate } from "./time";
import { addDays, addMinutes, fmtWeekdayDate, localDateOf } from "./time";
import type { PhState } from "./types";
import type { SalesLead, SalesPriceItem, SalesProposal, SalesProposalConfig, SalesProposalVersion, SalesService, SalesState, SalesTotals } from "./sales";
import { SALES_SERVICE_LABEL, salesCapacity, salesEur, salesLatestVersion, salesSuggestedDays, salesVersionTotals } from "./sales";

/* ---------------------------------------------------------------- state */

export interface SalesFlowInbound {
  leadId: string;
  arrivedAt: Iso;
  /** First-touch target in minutes. */
  slaMinutes: number;
  firstTouchAt: Iso | null;
  firstTouchBy: string | null;
  firstTouchVia: "email" | "call" | null;
  /** Seconds from arrival to the first touch. */
  responseSeconds: number | null;
}

export interface SalesFlowEmail {
  id: string; // EM-001
  leadId: string;
  at: Iso;
  by: string;
  to: string;
  subject: string;
  body: string;
  attachments: string[];
  kind: "first_reply" | "follow_up";
}

export interface SalesFlowNotes { text: string; savedAt: Iso; savedBy: string }

export interface SalesFlowInstructions { text: string; discountPct: number | null; savedAt: Iso; savedBy: string }

export type SalesFollowStatus = "sent" | "skipped";
export interface SalesFlowSequenceState {
  paused: boolean;
  steps: Record<string, { status: SalesFollowStatus; at: Iso; by: string }>;
}

export interface SalesFlowState {
  version: 1;
  seq: { email: number };
  inbound: SalesFlowInbound[];
  emails: SalesFlowEmail[];
  /** Meeting notes per lead. */
  notes: Record<string, SalesFlowNotes>;
  /** Deal instructions per proposal. */
  instructions: Record<string, SalesFlowInstructions>;
  /** Follow-up progress per sent proposal version, keyed "PRP-0001-v2". */
  sequences: Record<string, SalesFlowSequenceState>;
}

export const SALES_FIRST_TOUCH_MINUTES = 10;
export const SALES_INBOUND_LEAD_ID = "LD-0020";
export const SALES_BOOKING_LINK = "precisionhealth.ie/book/stephen-kelly";

export function initialSalesFlowState(): SalesFlowState {
  return { version: 1, seq: { email: 0 }, inbound: [], emails: [], notes: {}, instructions: {}, sequences: {} };
}

/**
 * Seeds the demo's new inbound lead into the sales slice, three minutes before the demo clock, and
 * marks the weekly follow-ups that fell before the demo clock on the already-sent proposals as sent.
 * Called once from createInitialState. Deterministic.
 */
export function seedSalesFlow(state: PhState): void {
  const s = state.sales;
  const f = state.salesFlow;
  const now = state.clock.nowUtc;
  if (!s.leads.some((l) => l.id === SALES_INBOUND_LEAD_ID)) {
    const arrivedAt = addMinutes(now, -3);
    const lead: SalesLead = {
      id: SALES_INBOUND_LEAD_ID, company: "Brennan Build Group", fictionalCompany: true, services: ["health_screening", "flu"],
      contact: { name: "Aoife Brennan", role: "HR and Safety Manager", email: "aoife.brennan@example.com", phone: "+353 45 555 0188" },
      source: "website", sourceRef: "Website enquiry form", receivedOn: localDateOf(arrivedAt),
      enquiry: "Hi, we are a construction company with about 45 staff between our Naas office and a site in Kildare. We would like health screening for the team and flu vaccines if possible, ideally in November. Could someone call me back?",
      stage: "new", stageAt: arrivedAt, ownerId: "stephen", nextAction: "First reply within 10 minutes", nextActionOn: localDateOf(arrivedAt),
      invoiceName: "Brennan Build Group Ltd", invoiceEmail: "accounts.ld0020@example.com",
      companyDetails: "Fictional construction company for the demo. Office in Naas and one site in Kildare.",
      qualifier: { headcount: 45, sites: 2, dates: "November", budget: "unknown" }, research: null, files: [],
      history: [
        { at: arrivedAt, by: "Website form", text: "Enquiry received from the website form." },
        { at: arrivedAt, by: "Sales agent", text: "Added to New contact leads. First reply due within 10 minutes." },
      ],
      lostReason: null, handoverTaskId: null,
    };
    s.leads.push(lead);
    s.seq.lead = Math.max(s.seq.lead, 20);
    f.inbound.push({ leadId: lead.id, arrivedAt, slaMinutes: SALES_FIRST_TOUCH_MINUTES, firstTouchAt: null, firstTouchBy: null, firstTouchVia: null, responseSeconds: null });
  }
  const today = localDateOf(now);
  for (const p of s.proposals) {
    const v = salesLatestVersion(p);
    if (v.status !== "sent" || !v.sentAt) continue;
    const key = salesSequenceKey(p, v);
    const steps: SalesFlowSequenceState["steps"] = {};
    salesFollowDueDates(v.sentAt).forEach((d, i) => { if (d < today) steps[String(i + 1)] = { status: "sent", at: `${d}T09:30:00.000Z`, by: "stephen" }; });
    f.sequences[key] = { paused: false, steps };
  }
}

/* ---------------------------------------------------------------- live first-touch clock */

export interface SalesTouchClock { remainingSec: number; elapsedSec: number; overdue: boolean; tone: "ok" | "warn" | "bad"; label: string }

/** mm:ss for a number of seconds, never negative. */
export function salesMmSs(sec: number): string {
  const v = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;
}
/** "5m 12s" */
export function salesDuration(sec: number): string {
  const v = Math.max(0, Math.round(sec));
  const h = Math.floor(v / 3600), m = Math.floor((v % 3600) / 60), x = v % 60;
  return h ? `${h}h ${m}m` : m ? `${m}m ${String(x).padStart(2, "0")}s` : `${x}s`;
}

/** Countdown for a pending inbound lead at a given moment (milliseconds since epoch). */
export function salesTouchClock(inb: SalesFlowInbound, nowMs: number): SalesTouchClock {
  const elapsedSec = Math.max(0, (nowMs - Date.parse(inb.arrivedAt)) / 1000);
  const remainingSec = inb.slaMinutes * 60 - elapsedSec;
  const overdue = remainingSec <= 0;
  const tone = overdue ? "bad" : remainingSec < 180 ? "warn" : "ok";
  return { remainingSec, elapsedSec, overdue, tone, label: overdue ? `Overdue ${salesMmSs(-remainingSec)}` : `${salesMmSs(remainingSec)} left` };
}

export function salesInboundFor(state: PhState, leadId: string): SalesFlowInbound | null {
  return state.salesFlow?.inbound.find((x) => x.leadId === leadId) || null;
}
/** Inbound leads still waiting for their first touch, oldest first. */
export function salesPendingInbound(state: PhState): SalesFlowInbound[] {
  const f = state.salesFlow;
  if (!f) return [];
  return f.inbound.filter((x) => !x.firstTouchAt && state.sales.leads.some((l) => l.id === x.leadId && l.stage === "new"))
    .sort((a, b) => (a.arrivedAt < b.arrivedAt ? -1 : 1));
}

/* ---------------------------------------------------------------- sectors and references */

export type SalesSector = "construction" | "technology" | "hospitality" | "pharma" | "food" | "sport" | "logistics" | "professional" | "public" | "energy";
export const SALES_SECTOR_LABEL: Record<SalesSector, string> = {
  construction: "construction", technology: "technology", hospitality: "hospitality", pharma: "pharma and medtech", food: "food and drink",
  sport: "sport", logistics: "logistics and manufacturing", professional: "professional services", public: "public sector", energy: "energy",
};
const SECTOR_BY_COMPANY: Record<string, SalesSector> = {
  "sisk": "construction", "cairn homes": "construction", "dornan group": "construction", "collen construction": "construction", "pj edwards": "construction", "brennan build group": "construction",
  "salesforce": "technology", "ibm": "technology", "linkedin": "technology", "bluestack software": "technology", "kilbarry data services": "technology",
  "o callaghan collection": "hospitality", "kerry coast hotels": "hospitality", "tralee bay hotels": "hospitality", "glenmara hotels": "hospitality",
  "j&j": "pharma", "athlone medtech services": "pharma", "fernhill pharma services": "pharma",
  "abp": "food", "aryzta ireland": "food", "shannon estuary foods": "food", "eskerline foods": "food",
  "irfu": "sport", "midleton logistics": "logistics", "navan print works": "logistics", "ardmore freight": "logistics",
  "ibec": "professional", "iq resource": "professional", "utmost": "professional", "dunmore insurance brokers": "professional",
  "comreg": "public", "issu": "public", "limerick twenty thirty": "public", "rwe": "energy",
};
const SECTOR_WORDS: Array<[RegExp, SalesSector]> = [
  [/\b(construct|build|builders|contractor|civil|site compound|homes)\b/i, "construction"],
  [/\b(hotel|hospitality|restaurant|leisure)\b/i, "hospitality"],
  [/\b(software|tech|data|digital|it services)\b/i, "technology"],
  [/\b(pharma|medtech|medical device|laborator)\b/i, "pharma"],
  [/\b(food|bakery|dairy|meat|drinks|brewery)\b/i, "food"],
  [/\b(logistic|freight|transport|warehouse|print|manufactur)\b/i, "logistics"],
  [/\b(council|agency|authority|semi-state|public body)\b/i, "public"],
];
export const salesNormCompany = (c: string) => c.toLowerCase().replace(/\(fictional\)/g, "").replace(/[^a-z0-9&]+/g, " ").trim();

/** Sector from a known company name, otherwise from words in the name, details or enquiry. */
export function salesSectorOf(lead: Pick<SalesLead, "company" | "companyDetails" | "enquiry">): SalesSector | null {
  const known = SECTOR_BY_COMPANY[salesNormCompany(lead.company)];
  if (known) return known;
  const text = `${lead.company} ${lead.companyDetails} ${lead.enquiry}`;
  for (const [re, sec] of SECTOR_WORDS) if (re.test(text)) return sec;
  return null;
}

/**
 * Up to two existing clients in the same sector: companies with a past engagement, a current
 * programme or a won lead. Stronger relationships first (more engagements), then by name.
 */
export function salesSectorReferences(state: PhState, lead: SalesLead, max = 2): string[] {
  const sector = salesSectorOf(lead);
  if (!sector) return [];
  const score = new Map<string, { name: string; n: number }>();
  const add = (name: string) => {
    const k = salesNormCompany(name);
    if (k === salesNormCompany(lead.company) || SECTOR_BY_COMPANY[k] !== sector) return;
    const cur = score.get(k) || { name, n: 0 };
    cur.n += 1;
    score.set(k, cur);
  };
  state.sales.engagements.forEach((e) => add(e.company));
  state.programmes.forEach((p) => add(p.clientName));
  state.sales.leads.filter((l) => l.stage === "won" && l.id !== lead.id).forEach((l) => add(l.company));
  return [...score.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)).slice(0, max).map((x) => x.name);
}

/* ---------------------------------------------------------------- first reply (agent draft) */

export interface SalesFirstDraft { to: string; subject: string; body: string; attachments: string[]; references: string[]; sector: SalesSector | null; bookingLink: string }

export function salesBrochureFor(services: SalesService[]): string {
  if (services.length === 1 && services[0] === "occupational_health") return "Precision Health occupational health brochure.pdf";
  if (services.length === 1 && services[0] === "flu") return "Precision Health workplace flu brochure.pdf";
  return "Precision Health corporate health brochure.pdf";
}

const listJoin = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** The agent's first reply. Deterministic from the lead and the client list. */
export function salesFirstReplyDraft(state: PhState, lead: SalesLead): SalesFirstDraft {
  const first = lead.contact.name.split(" ")[0] || "there";
  const svc = listJoin(lead.services.map((x) => SALES_SERVICE_LABEL[x].toLowerCase())) || "our services";
  const refs = salesSectorReferences(state, lead);
  const sector = salesSectorOf(lead);
  const people = lead.qualifier.headcount ? ` for your team of about ${lead.qualifier.headcount}` : "";
  const brochure = salesBrochureFor(lead.services);
  const refLine = refs.length && sector
    ? `We already look after ${SALES_SECTOR_LABEL[sector]} employers such as ${listJoin(refs)}, so we know how to work around site rotas and shift patterns.`
    : "We run screening on site for employers across Ireland, so your team does not need to travel.";
  const body = [
    `Hi ${first},`,
    `Thank you for getting in touch about ${svc}${people} at ${lead.company}. I have attached our brochure, which sets out the packages and what each one includes.`,
    refLine,
    `The easiest next step is a short call so I can understand your numbers, sites and dates. You can pick a time that suits you here: ${SALES_BOOKING_LINK}`,
    "Kind regards,\nStephen Kelly\nSales and Operations Director, Precision Health",
  ].join("\n\n");
  return { to: lead.contact.email, subject: `${lead.company} and Precision Health: ${svc}`, body, attachments: [brochure], references: refs, sector, bookingLink: SALES_BOOKING_LINK };
}

/* ---------------------------------------------------------------- meeting notes parser */

export interface SalesNoteFact { key: "headcount" | "sites" | "package" | "flu" | "dates" | "deal"; label: string; value: string; quote: string }
export interface SalesNoteFacts {
  headcount: number | null;
  headcountHigh: number | null;
  sites: number | null;
  packageId: string | null;
  /** Other packages mentioned. */
  alsoAsked: string[];
  flu: boolean | null;
  fluCount: number | null;
  exec: number | null;
  dates: string;
  /** Sentences about invoicing, discounts or terms, offered for the deal instructions. */
  deal: string[];
  facts: SalesNoteFact[];
}

const WORD_NUM: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100,
  single: 1, both: 2, a: 1, an: 1,
};
const NUM = String.raw`(\d{1,4}|(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[\s-](?:one|two|three|four|five|six|seven|eight|nine))?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|a hundred|hundred)`;
function numOf(t: string): number | null {
  const s = t.toLowerCase().trim();
  if (/^\d+$/.test(s)) return Number(s);
  if (s === "a hundred" || s === "hundred") return 100;
  const parts = s.split(/[\s-]+/);
  let n = 0;
  for (const p of parts) { if (WORD_NUM[p] === undefined) return null; n += WORD_NUM[p]; }
  return n || null;
}
const PEOPLE = String.raw`(?:staff|people|employees|participants|workers|heads|team members|colleagues|personnel|of them)`;
const PACKAGE_RES: Array<[RegExp, string]> = [
  [/\bpoc\s?-?3\b/i, "poc3"], [/\bpoc\s?-?4\b/i, "poc4"], [/\bpoc\s?-?5\b/i, "poc5"],
  [/\bsilver\s?-?1\b/i, "silver1"], [/\bsilver\s?-?2\b/i, "silver2"], [/\bsilver\s?-?3\b/i, "silver3"],
  [/\bgold\s?-?1\b/i, "gold1"], [/\bgold\s?-?2\b/i, "gold2"], [/\bgold\s?-?3\b/i, "gold3"],
  [/\bpoint of care\b/i, "poc3"],
];
const MONTH = String.raw`(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)`;
const sentences = (t: string) => t.split(/(?<=[.;\n])\s*|\n+/).map((x) => x.trim()).filter(Boolean);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Pulls the facts a proposal needs out of free meeting notes: headcount (or a range), sites,
 * package interest, flu interest and numbers, executive medicals, dates, and deal terms. Works on
 * digits and number words ("about forty-five staff", "45 to 50 people", "two sites", "no flu").
 */
export function salesParseNotes(text: string, items?: SalesPriceItem[]): SalesNoteFacts {
  const t = String(text || "");
  const lower = t.toLowerCase();
  const sents = sentences(t);
  const quoteOf = (re: RegExp) => sents.find((x) => re.test(x)) || "";
  const out: SalesNoteFacts = { headcount: null, headcountHigh: null, sites: null, packageId: null, alsoAsked: [], flu: null, fluCount: null, exec: null, dates: "", deal: [], facts: [] };
  if (!t.trim()) return out;

  /* headcount: "45 to 50 people", "headcount of 45", "about 45 staff", then the largest people count */
  const range = new RegExp(String.raw`\b${NUM}\s*(?:to|-|or)\s*${NUM}\s+${PEOPLE}`, "i").exec(lower);
  const named = new RegExp(String.raw`\b(?:headcount|head count|numbers?|total)\s*(?:of|is|are|about|around|roughly|approx\.?|approximately|:|=)?\s*(?:about|around|roughly|approx\.?|approximately)?\s*${NUM}\b`, "i").exec(lower);
  let headQuote = "";
  if (range && numOf(range[1]) && (numOf(range[2]) || 0) > (numOf(range[1]) || 0)) {
    out.headcount = numOf(range[1]); out.headcountHigh = numOf(range[2]); headQuote = quoteOf(new RegExp(range[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  } else if (named && numOf(named[1])) {
    out.headcount = numOf(named[1]); headQuote = quoteOf(/headcount|head count|numbers?|total/i);
  } else {
    const all = [...lower.matchAll(new RegExp(String.raw`\b${NUM}\s+(?:\w+\s+)?${PEOPLE}`, "gi"))].map((m) => ({ n: numOf(m[1]), m: m[0] })).filter((x) => x.n && x.n >= 2 && x.n < 10000);
    const fluOnly = (m: string) => /flu|vaccin|jab/.test(m);
    const best = all.filter((x) => !fluOnly(x.m)).sort((a, b) => b.n! - a.n!)[0];
    if (best) { out.headcount = best.n; headQuote = quoteOf(new RegExp(best.m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")); }
  }
  if (out.headcount) out.facts.push({ key: "headcount", label: "Headcount", value: out.headcountHigh && out.headcountHigh !== out.headcount ? `${out.headcount} to ${out.headcountHigh} people` : `${out.headcount} people`, quote: headQuote });

  /* sites: "two sites", "3 locations", "single site", "both sites", "office and a site" */
  const sm = new RegExp(String.raw`\b(${NUM.slice(1, -1)}|single|both)\s+(?:separate\s+|different\s+)?(?:sites?|locations?|offices|premises|depots|plants|hotels)\b`, "i").exec(lower);
  if (sm && numOf(sm[1])) { out.sites = numOf(sm[1]); }
  else if (/\boffice\b[^.]{0,40}\b(?:and|plus)\b[^.]{0,12}\bsites?\b|\bsite\b[^.]{0,40}\b(?:and|plus)\b[^.]{0,12}\boffice\b/i.test(t)) out.sites = 2;
  else if (/\b(one|single) (site|location|office)\b|\ball in one place\b/i.test(t)) out.sites = 1;
  if (out.sites) out.facts.push({ key: "sites", label: "Sites", value: out.sites === 1 ? "One site" : `${out.sites} sites`, quote: quoteOf(/sites?|locations?|offices|office|premises|depots|plants|hotels/i) });

  /* packages, in the order they are mentioned */
  const found: Array<{ id: string; at: number }> = [];
  for (const [re, id] of PACKAGE_RES) { const m = re.exec(t); if (m && !found.some((f) => f.id === id)) found.push({ id, at: m.index }); }
  if (!found.length && /\bbloods?\b|blood (test|panel)|cholesterol panel/i.test(t)) found.push({ id: "gold1", at: 0 });
  if (!found.length && /\b(ecg|heart trace)\b/i.test(t)) found.push({ id: "silver3", at: 0 });
  if (!found.length && /\b(af|atrial fibrillation)\b/i.test(t)) found.push({ id: "silver2", at: 0 });
  if (!found.length && /\b(silver)\b/i.test(t)) found.push({ id: "silver2", at: 0 });
  if (!found.length && /\b(gold)\b/i.test(t)) found.push({ id: "gold1", at: 0 });
  if (!found.length && /\b(screening|health check|health checks|medicals?)\b/i.test(t) && !/\bexecutive\b/i.test(t)) found.push({ id: "poc3", at: 0 });
  found.sort((a, b) => a.at - b.at);
  if (found.length) {
    out.packageId = found[0].id; out.alsoAsked = found.slice(1).map((f) => f.id);
    const name = (id: string) => items?.find((i) => i.id === id)?.name || id.toUpperCase();
    out.facts.push({ key: "package", label: "Package interest", value: `${name(out.packageId)}${out.alsoAsked.length ? `, also asked about ${out.alsoAsked.map(name).join(", ")}` : ""}`, quote: quoteOf(/poc|silver|gold|bloods?|ecg|point of care|screening|health check|medical/i) });
  }

  /* executive medicals */
  const ex = new RegExp(String.raw`\b${NUM}\s+(?:\w+\s+){0,3}?(?:executive|exec|senior|directors?|partners|leadership)`, "i").exec(lower)
    || new RegExp(String.raw`(?:executive|exec)\s+(?:medicals?|health|assessments?)[^.]{0,30}?\b(?:for\s+)?${NUM}\b`, "i").exec(lower);
  if (ex && numOf(ex[1]) && /executive|exec\b/i.test(t)) out.exec = numOf(ex[1]);

  /* flu: negation first, then interest and a number */
  if (/flu|vaccin|\bjabs?\b/i.test(t)) {
    const neg = /\b(no|not|without|don'?t|do not|doesn'?t|does not|won'?t|skip|skipping|decline[ds]?|not interested in)\b[^.]{0,30}\b(flu|vaccin|jabs?)|\b(flu|vaccin\w*|jabs?)\b[^.]{0,20}\b(not needed|not required|no thanks|not this year|done elsewhere|already (booked|covered|done))|flu\s*:\s*no\b/i.test(t);
    out.flu = !neg;
    if (out.flu) {
      const fn = new RegExp(String.raw`\b${NUM}\s+(?:\w+\s+){0,3}?(?:flu|vaccines?|vaccinations?|jabs?)`, "i").exec(lower)
        || new RegExp(String.raw`(?:flu|vaccines?|vaccinations?|jabs?)[^.\d]{0,30}?\b(?:for|about|around|roughly|maybe|of the|all)\s+${NUM}\b`, "i").exec(lower);
      if (fn && numOf(fn[1])) out.fluCount = numOf(fn[1]);
      else if (/\b(everyone|all of them|whole team|all staff)\b/i.test(t) && out.headcount) out.fluCount = out.headcountHigh || out.headcount;
    }
    out.facts.push({ key: "flu", label: "Flu vaccines", value: out.flu ? (out.fluCount ? `Yes, about ${out.fluCount}` : "Yes, interested") : "Not wanted", quote: quoteOf(/flu|vaccin|jabs?/i) });
  }

  /* dates: "the week of 16 November", "early November", "before Christmas", "16/11" */
  const dateRes = [
    new RegExp(String.raw`\b(?:(?:early|mid|late|end of|start of|beginning of|the week of|week of|w/c|week commencing|from|by|on|before|after)\s+)?(?:the\s+)?(?:\d{1,2}(?:st|nd|rd|th)?(?:\s+of)?\s+)?${MONTH}\b(?:\s+\d{1,2}(?:st|nd|rd|th)?)?(?:\s+20\d\d)?`, "gi"),
    /\b(?:before|after|around|by)\s+(?:christmas|easter|the new year|year end|the summer)\b/gi,
    /\b(?:next|this)\s+(?:week|month|quarter|spring|summer|autumn|winter)\b/gi,
    /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g,
  ];
  const dates: string[] = [];
  for (const re of dateRes) for (const m of t.matchAll(re)) {
    const v = m[0].trim().replace(/^(on|from)\s+/i, "");
    if (/^(may|mar|march|june?|july?)$/i.test(v) && !/\b(in|of|early|mid|late|end|start|by|before|after)\s+$/i.test(t.slice(Math.max(0, (m.index || 0) - 12), m.index))) continue;
    if (!dates.some((d) => d.toLowerCase() === v.toLowerCase())) dates.push(v);
  }
  if (dates.length) { out.dates = cap(dates.slice(0, 2).join(", or ")); out.facts.push({ key: "dates", label: "Dates", value: out.dates, quote: quoteOf(new RegExp(dates[0].replace(/[.*+?^${}()|[\]\\/]/g, "\\$&"), "i")) }); }

  /* deal terms for the instructions box */
  out.deal = sents.filter((x) => /invoice|discount|%|per cent|percent|multi-?year|purchase order|\bpo\b|payment terms|split|pay(ment)? in|budget/i.test(x));
  if (out.deal.length) out.facts.push({ key: "deal", label: "Deal notes", value: out.deal.join(" "), quote: out.deal[0] });
  void lower;
  return out;
}

export const SALES_SAMPLE_NOTES =
  "Call with Aoife Brennan. About 45 staff in total, 30 in the Naas office and 15 on the Kildare site, so two sites. " +
  "Interested in POC3 and asked whether Gold 1 adds bloods. Yes to flu jabs at the same visit, most of the 45 will take one. " +
  "Ideally the week of 16 November, before Christmas at the latest. Wants one invoice per site.";

/* ---------------------------------------------------------------- deal instructions */

/** A percentage discount in free text: "10% multi-year discount", "ten per cent off". Null when none. */
export function salesParseDiscount(text: string): number | null {
  const t = String(text || "").toLowerCase();
  const m = /(\d{1,2}(?:\.\d{1,2})?)\s*(?:%|per\s?cent|percent)/.exec(t)
    || new RegExp(String.raw`\b(five|ten|fifteen|twenty|twenty-five|twenty five)\s*(?:%|per\s?cent|percent)`).exec(t);
  if (!m) return null;
  const n = /^\d/.test(m[1]) ? Number(m[1]) : numOf(m[1].replace(" ", "-"));
  if (!n || n <= 0 || n > 50) return null;
  if (!/discount|off\b|reduc|less\b|saving|multi|loyalty|rebate/.test(t) && !/%\s*(off|discount)/.test(t)) return null;
  return n;
}

export interface SalesNetTotals { discountPct: number | null; discountLow: number; discountHigh: number; netLow: number; netHigh: number; instructions: string }
const cents = (n: number) => Math.round(n * 100) / 100;
export function salesApplyDiscount(t: Pick<SalesTotals, "totalLow" | "totalHigh">, pct: number | null): { discountLow: number; discountHigh: number; netLow: number; netHigh: number } {
  const dl = pct ? cents((t.totalLow * pct) / 100) : 0;
  const dh = pct ? cents((t.totalHigh * pct) / 100) : 0;
  return { discountLow: dl, discountHigh: dh, netLow: cents(t.totalLow - dl), netHigh: cents(t.totalHigh - dh) };
}
/** Totals for a proposal version after any discount in its deal instructions. */
export function salesNetTotals(state: PhState, p: SalesProposal, v?: SalesProposalVersion): SalesNetTotals & { totals: SalesTotals } {
  const ver = v || salesLatestVersion(p);
  const totals = salesVersionTotals(state.sales, ver);
  const ins = state.salesFlow?.instructions[p.id];
  const pct = ins ? ins.discountPct : null;
  return { totals, discountPct: pct, ...salesApplyDiscount(totals, pct), instructions: ins ? ins.text : "" };
}

/* ---------------------------------------------------------------- proposal builder */

export interface SalesBuilderInput { packageId: string | null; headcount: number; flu: boolean; fluCount: number; execCount: number; locations: string; dates: string }

/** Proposal config from the builder: days = ceil(headcount / per day capacity), flu per vaccine. */
export function salesBuilderConfig(input: SalesBuilderInput, items: SalesPriceItem[], base?: SalesProposalConfig): SalesProposalConfig {
  const n = Math.max(1, Math.floor(input.headcount || 1));
  const it = input.packageId ? items.find((i) => i.id === input.packageId && i.unit === "day") : undefined;
  const lines = it ? [{ itemId: it.id, days: salesSuggestedDays(n, salesCapacity(it).perDay) }] : [];
  const execItem = items.find((i) => i.id === "exec");
  const exec = input.execCount > 0 ? { count: Math.floor(input.execCount), rate: execItem?.price ?? 575 } : null;
  const upsell = it ? salesUpgradeIds(it.id, items) : [];
  const title = !it && exec ? "Executive Health Assessment Programme" : !it && input.flu ? "Workplace Flu Vaccination Programme" : "Corporate Health Screening Programme";
  const fluN = Math.max(0, Math.floor(input.fluCount || n));
  return {
    title: base?.title && base.title !== "Corporate Health Screening Programme" ? base.title : title,
    participantsLow: n, participantsHigh: n, locations: input.locations.trim() || "One site, room to confirm", dates: input.dates.trim() || "To agree",
    lines, flu: input.flu, fluLow: input.flu ? fluN : 0, fluHigh: input.flu ? fluN : 0, exec, upsell, notes: base?.notes || "",
  };
}

const TIER = ["poc3", "poc4", "poc5", "silver1", "silver2", "silver3", "gold1", "gold2", "gold3"];
/** Higher packages shown as upgrade options in the proposal document. */
export function salesUpgradeIds(pkg: string, items: SalesPriceItem[]): string[] {
  const i = TIER.indexOf(pkg);
  const ups = i < 0 ? [] : TIER.slice(i + 1).filter((id) => ["silver2", "silver3", "gold1", "gold2", "gold3"].includes(id));
  return ups.filter((id) => items.some((x) => x.id === id && x.price !== null)).slice(0, 4);
}

export interface SalesUpsell { id: string; title: string; detail: string; delta: number; apply: Partial<SalesBuilderInput> }
/** One-click suggestions for the builder, with what each adds to the total. */
/* Names a client understands, with one line on what is in it. The price list code stays in brackets
   so Stephen can still match it to the price list. */
const PACKAGE_COPY: Record<string, [string, string]> = {
  poc3: ["Point-of-care health check", "Finger-prick tests with results on the day. No lab visit needed."],
  poc4: ["Point-of-care health check plus", "A wider point-of-care check. Contents to confirm."],
  poc5: ["Point-of-care health check premium", "The widest point-of-care check. Contents to confirm."],
  silver1: ["Silver health screening", "Lab bloods with a full health check and a doctor-reviewed report."],
  silver2: ["Silver with heart rhythm check", "Silver, plus a quick screen for an irregular heartbeat."],
  silver3: ["Silver with full ECG", "Silver, plus a full 12-lead ECG of the heart."],
  gold1: ["Gold health screening", "Everything in Silver, plus a wider blood panel: blood count, iron, uric acid and kidneys."],
  gold2: ["Gold with heart rhythm check", "Gold, plus a quick screen for an irregular heartbeat."],
  gold3: ["Gold with full ECG", "Gold, plus a full 12-lead ECG of the heart."],
  exec: ["Executive health assessment", "One hour each: 30 minutes with a practitioner and 30 with a doctor."],
  flu: ["Flu vaccination", "Seasonal flu vaccine given on site."],
};
/** Client-facing package name, for example "Gold health screening (Gold 1)". */
export function salesPackageTitle(it: Pick<SalesPriceItem, "id" | "code" | "name">): string {
  const c = PACKAGE_COPY[it.id];
  return c ? `${c[0]} (${it.code})` : it.name;
}
/** One plain line on what the package includes. */
export function salesPackageBlurb(it: Pick<SalesPriceItem, "id" | "includes">): string {
  return PACKAGE_COPY[it.id]?.[1] || it.includes;
}

export function salesUpsells(input: SalesBuilderInput, items: SalesPriceItem[]): SalesUpsell[] {
  const out: SalesUpsell[] = [];
  const by = (id: string) => items.find((i) => i.id === id);
  const n = Math.max(1, Math.floor(input.headcount || 1));
  const daysOf = (id: string) => { const it = by(id); return it ? salesSuggestedDays(n, salesCapacity(it).perDay) : 0; };
  const cost = (id: string | null) => { const it = id ? by(id) : undefined; return it && it.price !== null ? daysOf(it.id) * it.price : 0; };
  const fluRate = by("flu")?.price ?? 15;
  if (!input.flu) out.push({ id: "flu", title: "Add flu vaccines at the same visit", detail: `${n} vaccines at ${salesEur(fluRate)} each, conditional on vaccine supply`, delta: n * fluRate, apply: { flu: true, fluCount: n } });
  const pkg = input.packageId;
  const next: Record<string, string> = { poc3: "gold1", poc4: "gold1", poc5: "gold1", silver1: "gold1", silver2: "gold2", silver3: "gold3", gold1: "gold3", gold2: "gold3" };
  const up = pkg ? next[pkg] : null;
  const upItem = up ? by(up) : undefined;
  if (pkg && upItem && upItem.price !== null && cost(up) > cost(pkg)) {
    const isSilver = pkg.startsWith("silver");
    out.push({ id: `upgrade-${up}`, title: isSilver ? `Silver to Gold: ${salesPackageTitle(upItem)}` : `Upgrade to ${salesPackageTitle(upItem)}`, detail: salesPackageBlurb(upItem), delta: cost(up) - cost(pkg), apply: { packageId: up } });
  }
  const ex = by("exec");
  if (ex && ex.price !== null && input.execCount === 0) {
    const k = Math.max(2, Math.min(8, Math.round(n / 10)));
    out.push({ id: "exec", title: `Executive medicals for ${k} senior leaders`, detail: `One hour each with a practitioner and a doctor, from ${salesEur(ex.price)} per person`, delta: k * ex.price, apply: { execCount: k } });
  }
  return out;
}

/* ---------------------------------------------------------------- weekly follow-up sequence */

export interface SalesFollowStep { n: number; due: LocalDate; subject: string; body: string; status: "sent" | "skipped" | "due" | "scheduled" | "stopped"; at: Iso | null }
export interface SalesFollowSequence {
  key: string;
  proposalId: string;
  version: number;
  sentAt: Iso;
  paused: boolean;
  /** Set when the lead is won or lost: the remaining steps stop on their own. */
  stopped: "won" | "lost" | null;
  steps: SalesFollowStep[];
  next: SalesFollowStep | null;
}

export const salesSequenceKey = (p: SalesProposal, v: SalesProposalVersion) => `${p.id}-v${v.version}`;
/** Weekly from the day the proposal went out: weeks 1 to 4, or the waits of an edited template. */
export function salesFollowDueDates(sentAt: Iso, waits: number[] = [7, 7, 7, 7]): LocalDate[] {
  const d = localDateOf(sentAt);
  let total = 0;
  return waits.map((w) => { total += Math.max(1, Math.round(w)); return addDays(d, total); });
}

/* ---- the follow-up template Stephen can edit (Sales, Sequences). The default reads exactly like
   the built-in weekly emails below, so an untouched template changes nothing. */
export interface SalesSeqStep { wait: number; subject: string; body: string }
export interface SalesSeqTemplate { steps: SalesSeqStep[]; updatedAt: Iso | null; updatedBy: string | null }
export const SALES_SEQ_MERGE_FIELDS: Array<{ key: string; label: string }> = [
  { key: "first", label: "Contact first name" }, { key: "company", label: "Company" }, { key: "proposal", label: "Proposal number" }, { key: "signature", label: "Your signature" },
];
const SEQ_SIGN = "Kind regards,\nStephen Kelly\nSales and Operations Director, Precision Health";
export const SALES_SEQ_DEFAULT: SalesSeqStep[] = [
  { wait: 7, subject: "Your Precision Health proposal", body: "Hi {first},\n\nI hope the week is going well. I just wanted to check that the proposal ({proposal}) reached you and that it all makes sense. I am happy to walk through it on a short call if that helps.\n\n{signature}" },
  { wait: 7, subject: "Any questions on the proposal?", body: "Hi {first},\n\nA quick note in case any questions have come up on the package, the dates or the numbers for {company}. If anything needs changing, I can send an updated version the same day.\n\n{signature}" },
  { wait: 7, subject: "Holding dates for {company}", body: "Hi {first},\n\nOur nurses' diary is filling up for the coming weeks. If you would like me to pencil in provisional dates for {company} while you decide, just let me know and I will hold them without any commitment.\n\n{signature}" },
  { wait: 7, subject: "Checking in", body: "Hi {first},\n\nI do not want to fill your inbox, so this is my last note for now. If the timing is not right, no problem at all; just tell me when suits and I will get back in touch then.\n\n{signature}" },
];
/** Fills {first}, {company}, {proposal} and {signature}. Unknown fields are left as typed. */
export function salesSeqMerge(text: string, v: { first: string; company: string; proposal: string; signature?: string }): string {
  const m: Record<string, string> = { first: v.first, company: v.company, proposal: v.proposal, signature: v.signature || SEQ_SIGN };
  return text.replace(/\{([a-z_]+)\}/g, (all, k: string) => (k in m ? m[k] : all));
}
/** The template in use: the edited one when there is one, else the default. */
export function salesSeqSteps(state: PhState): SalesSeqStep[] {
  const t = (state as { salesDesk?: { follow?: SalesSeqTemplate } }).salesDesk?.follow;
  return t && t.steps.length ? t.steps : SALES_SEQ_DEFAULT;
}

export function salesFollowText(lead: SalesLead, n: number, proposalId: string): { subject: string; body: string } {
  const first = lead.contact.name.split(" ")[0] || "there";
  const sign = "Kind regards,\nStephen Kelly\nSales and Operations Director, Precision Health";
  const T: Array<{ subject: string; body: string }> = [
    { subject: `Your Precision Health proposal`, body: `Hi ${first},\n\nI hope the week is going well. I just wanted to check that the proposal (${proposalId}) reached you and that it all makes sense. I am happy to walk through it on a short call if that helps.\n\n${sign}` },
    { subject: `Any questions on the proposal?`, body: `Hi ${first},\n\nA quick note in case any questions have come up on the package, the dates or the numbers for ${lead.company}. If anything needs changing, I can send an updated version the same day.\n\n${sign}` },
    { subject: `Holding dates for ${lead.company}`, body: `Hi ${first},\n\nOur nurses' diary is filling up for the coming weeks. If you would like me to pencil in provisional dates for ${lead.company} while you decide, just let me know and I will hold them without any commitment.\n\n${sign}` },
    { subject: `Checking in`, body: `Hi ${first},\n\nI do not want to fill your inbox, so this is my last note for now. If the timing is not right, no problem at all; just tell me when suits and I will get back in touch then.\n\n${sign}` },
  ];
  return T[Math.max(0, Math.min(3, n - 1))];
}

/** The follow-up sequence for a lead's latest sent (or decided) proposal version. Null before a proposal is sent. */
export function salesFollowSequence(state: PhState, leadId: string): SalesFollowSequence | null {
  const s = state.sales;
  const lead = s.leads.find((l) => l.id === leadId);
  if (!lead) return null;
  const props = s.proposals.filter((p) => p.leadId === leadId);
  let pick: { p: SalesProposal; v: SalesProposalVersion } | null = null;
  for (const p of props) for (const v of p.versions) if (v.sentAt && (!pick || v.sentAt > pick.v.sentAt!)) pick = { p, v };
  if (!pick) return null;
  const key = salesSequenceKey(pick.p, pick.v);
  const st = state.salesFlow?.sequences[key] || { paused: false, steps: {} };
  const today = localDateOf(state.clock.nowUtc);
  const stopped = lead.stage === "won" ? "won" : lead.stage === "lost" ? "lost" : pick.v.status === "accepted" ? "won" : pick.v.status === "declined" ? "lost" : null;
  const tpl = salesSeqSteps(state);
  const first = lead.contact.name.split(" ")[0] || "there";
  const steps: SalesFollowStep[] = salesFollowDueDates(pick.v.sentAt!, tpl.map((x) => x.wait)).map((due, i) => {
    const n = i + 1;
    const done = st.steps[String(n)];
    const vals = { first, company: lead.company, proposal: pick!.p.id };
    const txt = { subject: salesSeqMerge(tpl[i].subject, vals), body: salesSeqMerge(tpl[i].body, vals) };
    const status: SalesFollowStep["status"] = done ? done.status : stopped ? "stopped" : due <= today ? "due" : "scheduled";
    return { n, due, subject: txt.subject, body: txt.body, status, at: done ? done.at : null };
  });
  const next = stopped ? null : steps.find((x) => x.status === "due" || x.status === "scheduled") || null;
  return { key, proposalId: pick.p.id, version: pick.v.version, sentAt: pick.v.sentAt!, paused: st.paused, stopped, steps, next };
}

/** "Next follow up: Tue 13 Oct" for the board card, or null. */
export function salesNextFollowLabel(state: PhState, leadId: string): { text: string; overdue: boolean } | null {
  const q = salesFollowSequence(state, leadId);
  if (!q || q.stopped) return null;
  if (q.paused) return { text: "Follow ups paused", overdue: false };
  if (!q.next) return { text: "Follow ups finished", overdue: false };
  const today = localDateOf(state.clock.nowUtc);
  return { text: `Next follow up: ${fmtWeekdayDate(q.next.due)}`, overdue: q.next.due < today };
}

/* ---------------------------------------------------------------- journey */

export type SalesJourneyStep = "reply" | "meeting" | "proposal" | "follow" | "won";
export const SALES_JOURNEY: Array<{ id: SalesJourneyStep; label: string }> = [
  { id: "reply", label: "First reply" }, { id: "meeting", label: "Meeting notes" }, { id: "proposal", label: "Proposal" }, { id: "follow", label: "Follow up" }, { id: "won", label: "Won" },
];

/** Where the lead is in Stephen's flow, and which steps are done. */
export function salesJourney(state: PhState, leadId: string): { current: SalesJourneyStep; done: Record<SalesJourneyStep, boolean>; lost: boolean } {
  const s = state.sales;
  const lead = s.leads.find((l) => l.id === leadId)!;
  const props = s.proposals.filter((p) => p.leadId === leadId);
  const anySent = props.some((p) => p.versions.some((v) => v.sentAt));
  const hasProposal = props.length > 0;
  const inb = salesInboundFor(state, leadId);
  const touched = inb ? !!inb.firstTouchAt : true;
  const talked = lead.history.some((h) => /^(Call|Email|Meeting):/.test(h.text)) || (state.salesFlow?.emails || []).some((e) => e.leadId === leadId);
  const won = lead.stage === "won";
  const done: Record<SalesJourneyStep, boolean> = {
    reply: won || anySent || hasProposal || lead.stage !== "new" || (inb ? touched : talked || lead.history.length > 2),
    meeting: won || anySent || hasProposal || !!state.salesFlow?.notes[leadId]?.text,
    proposal: won || anySent,
    follow: won,
    won,
  };
  const current = (SALES_JOURNEY.find((x) => !done[x.id])?.id || "won") as SalesJourneyStep;
  return { current, done, lost: lead.stage === "lost" };
}

export function salesFlowRecordCount(f: SalesFlowState): number {
  return f.inbound.length + f.emails.length + Object.keys(f.notes).length + Object.keys(f.instructions).length + Object.keys(f.sequences).length;
}
