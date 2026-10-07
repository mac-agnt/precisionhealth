/* Sales actions, registered with the shared reducer when this module loads. Every change is
   permission-checked (Stephen owns sales and the price list; Martina and Brenda may also update
   Irish Life bookings), recorded on the lead where there is one, and written to the activity log.
   Help Scout, the research agent, email and Xero are simulated: nothing is read from or sent to
   any outside system, and the event text says so. Dispatch through salesAct. */
import type { ActionResult, Ctx, Handler, SalesIlhPayment, SalesIlhRequested, SalesLead, SalesProposalConfig, SalesQualifier, SalesRights, SalesService, SalesSource, SalesStage, SalesTenderStatus } from "../../model";
import {
  SALES_BUDGET_LABEL, SALES_ILH_PAYMENT_LABEL, SALES_ILH_REQUESTED_LABEL, SALES_SERVICES, SALES_SERVICE_LABEL, SALES_SOURCES, SALES_STAGE_LABEL, SALES_TENDER_STATUS_LABEL,
  addDays, fmtDate, localDateOf, registerHandlers, salesDefaultConfig, salesEur, salesEurRange, salesIlhItemName, salesIlhPriceFor, salesLatestVersion, salesNext, salesOutreachText,
  salesPad, salesPriceSnapshot, salesProposalIssues, salesProposalTotals, salesRecalls, salesResearchText, salesRights,
} from "../../model";

/* ---- helpers ---- */

function needSales(c: Ctx, right: keyof SalesRights, what: string): ActionResult | null {
  const p = c.persona();
  if (salesRights(p)[right]) return null;
  if (p.isParticipant) return c.fail(`The participant preview cannot ${what}. Sales is for Precision Health staff.`);
  const who = right === "ilh" ? "Stephen Kelly, Martina Beattie and Brenda Madden update Irish Life bookings." : right === "prices" ? "Only Stephen Kelly changes the price list." : "Stephen Kelly owns sales.";
  return c.fail(`${p.name} (${p.roleLabel}) cannot ${what}. ${who} Switch role in Settings, Experience to try it.`);
}
const todayOf = (c: Ctx) => localDateOf(c.now);
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + "T00:00:00Z"));
const isTime = (v: unknown): v is string => typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const intIn = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
const mask = (email: string) => email.replace(/^(.)[^@]*/, "$1***");
const EIRCODE = /^([AC-FHKNPRTV-Y]\d{2}|D6W) ?[0-9AC-FHKNPRTV-Y]{4}$/i;
const normEircode = (v: string) => { const t = v.trim().toUpperCase().replace(/\s+/g, ""); return `${t.slice(0, 3)} ${t.slice(3)}`; };

function leadOf(c: Ctx, id: string): SalesLead | undefined {
  return c.s.sales.leads.find((l) => l.id === id);
}
function note(c: Ctx, lead: SalesLead, text: string) {
  lead.history.push({ at: c.stamp(), by: c.persona().name, text });
}

/* ---- leads ---- */

interface CreateLead {
  company: string; fictionalCompany?: boolean; services: SalesService[]; contactName: string; contactRole?: string; contactEmail: string; contactPhone?: string;
  source: SalesSource; sourceRef?: string | null; enquiry: string; headcount?: number | null;
  origin?: { kind: "helpscout" | "recall" | "tender"; id: string } | null;
}
const createLead: Handler<CreateLead> = (c, a) => {
  const d = needSales(c, "manage", "add leads"); if (d) return d;
  const company = (a.company || "").trim();
  if (!company) return c.fail("Give the company name.");
  const services = Array.from(new Set(a.services || [])).filter((x) => SALES_SERVICES.includes(x));
  if (!services.length) return c.fail("Choose at least one service line.");
  if (!SALES_SOURCES.includes(a.source)) return c.fail("Choose where the lead came from.");
  const email = (a.contactEmail || "").trim();
  if (email && !isEmail(email)) return c.fail("That contact email does not look right.");
  if (a.headcount !== undefined && a.headcount !== null && !intIn(a.headcount, 1, 100000)) return c.fail("Headcount must be a whole number.");
  const s = c.s.sales;
  let ref = a.sourceRef ?? null;
  let simulated = false;
  if (a.origin?.kind === "helpscout") {
    const conv = s.inbox.find((x) => x.id === a.origin!.id);
    if (!conv) return c.fail("Unknown Help Scout conversation.");
    if (conv.status !== "unassigned") return c.fail(`Conversation ${conv.id} is already a lead (${conv.leadId}).`);
    ref = conv.id; simulated = true;
  }
  if (a.origin?.kind === "recall") {
    const rc = salesRecalls(c.s).find((r) => r.id === a.origin!.id);
    if (!rc) return c.fail("Unknown recall.");
    if (rc.leadId) return c.fail(`${rc.company} already has lead ${rc.leadId} in the pipeline.`);
    ref = `Recall, screened ${fmtDate(rc.screenedOn)}`;
  }
  if (a.origin?.kind === "tender") {
    const t = s.tenders.find((x) => x.id === a.origin!.id);
    if (!t) return c.fail("Unknown tender.");
    if (t.leadId) return c.fail(`${t.id} already has lead ${t.leadId}.`);
    ref = `${t.id} (fictional tender)`;
  }
  const id = `LD-${salesPad(salesNext(s, "lead"), 4)}`;
  const today = todayOf(c);
  const lead: SalesLead = {
    id, company, fictionalCompany: !!a.fictionalCompany, services,
    contact: { name: (a.contactName || "").trim() || "Contact to confirm", role: (a.contactRole || "").trim(), email, phone: (a.contactPhone || "").trim() },
    source: a.source, sourceRef: ref, receivedOn: today, enquiry: (a.enquiry || "").trim(), stage: "new", stageAt: c.stamp(), ownerId: "stephen",
    nextAction: "Reply and qualify the enquiry", nextActionOn: addDays(today, 1), invoiceName: "", invoiceEmail: "", companyDetails: "",
    qualifier: { headcount: a.headcount ?? null, sites: null, dates: "", budget: "unknown" }, research: null, files: [], history: [], lostReason: null, handoverTaskId: null,
  };
  note(c, lead, a.origin?.kind === "helpscout" ? `Created from Help Scout conversation ${ref} (simulated inbox).` : a.origin?.kind === "recall" ? "Created from the recall list." : a.origin?.kind === "tender" ? `Created from tender watch ${ref}.` : "Added to New Business Leads.");
  s.leads.push(lead);
  if (a.origin?.kind === "helpscout") { const conv = s.inbox.find((x) => x.id === a.origin!.id)!; conv.status = "converted"; conv.leadId = id; }
  if (a.origin?.kind === "recall") s.recallLeads[a.origin.id] = id;
  if (a.origin?.kind === "tender") { const t = s.tenders.find((x) => x.id === a.origin!.id)!; t.leadId = id; if (t.status === "watching") t.status = "preparing"; }
  c.emit({
    verb: "sales.lead_created", simulated, integrationId: simulated ? "helpscout" : null,
    summary: simulated
      ? `${c.first()} turned Help Scout conversation ${ref} into lead ${id}, ${company}. Simulated inbox: nothing was read from a live Help Scout account.`
      : `${c.first()} added lead ${id}, ${company} (${services.map((x) => SALES_SERVICE_LABEL[x]).join(", ")}).`,
  });
  return c.ok(`Lead ${id} added to New contact leads.`, "ok", id);
};

const moveLead: Handler<{ leadId: string; stage: SalesStage; reason?: string }> = (c, a) => {
  const d = needSales(c, "manage", "move leads"); if (d) return d;
  const lead = leadOf(c, a.leadId);
  if (!lead) return c.fail("Unknown lead.");
  if (!(a.stage in SALES_STAGE_LABEL)) return c.fail("Unknown stage.");
  if (lead.stage === a.stage) return c.fail(`${lead.company} is already in ${SALES_STAGE_LABEL[a.stage]}.`);
  const reason = (a.reason || "").trim();
  if (a.stage === "lost" && reason.length < 3) return c.fail("Say why the lead was lost. It helps the recall and tender lists later.");
  const from = lead.stage;
  lead.stage = a.stage;
  lead.stageAt = c.stamp();
  lead.lostReason = a.stage === "lost" ? reason : null;
  note(c, lead, `Moved from ${SALES_STAGE_LABEL[from]} to ${SALES_STAGE_LABEL[a.stage]}.${reason ? ` ${reason}` : ""}`);
  c.emit({ verb: "sales.lead_moved", summary: `${c.first()} moved ${lead.id}, ${lead.company}, from ${SALES_STAGE_LABEL[from]} to ${SALES_STAGE_LABEL[a.stage]}.` });
  return c.ok(`${lead.company} moved to ${SALES_STAGE_LABEL[a.stage]}.`);
};

interface LeadPatch {
  services?: SalesService[]; qualifier?: Partial<SalesQualifier>; nextAction?: string; nextActionOn?: string | null;
  invoiceName?: string; invoiceEmail?: string; companyDetails?: string;
}
const updateLead: Handler<{ leadId: string; patch: LeadPatch }> = (c, a) => {
  const d = needSales(c, "manage", "edit leads"); if (d) return d;
  const lead = leadOf(c, a.leadId);
  if (!lead) return c.fail("Unknown lead.");
  const p = a.patch || {};
  const changed: string[] = [];
  if (p.services) {
    const sv = Array.from(new Set(p.services)).filter((x) => SALES_SERVICES.includes(x));
    if (!sv.length) return c.fail("Keep at least one service line.");
    if (sv.join() !== lead.services.join()) { lead.services = sv; changed.push("services"); }
  }
  if (p.qualifier) {
    const q = p.qualifier;
    if (q.headcount !== undefined && q.headcount !== null && !intIn(q.headcount, 1, 100000)) return c.fail("Headcount must be a whole number above zero.");
    if (q.sites !== undefined && q.sites !== null && !intIn(q.sites, 1, 500)) return c.fail("Sites must be a whole number above zero.");
    if (q.budget !== undefined && !(q.budget in SALES_BUDGET_LABEL)) return c.fail("Unknown budget signal.");
    if (q.headcount !== undefined && q.headcount !== lead.qualifier.headcount) { lead.qualifier.headcount = q.headcount; changed.push("headcount"); }
    if (q.sites !== undefined && q.sites !== lead.qualifier.sites) { lead.qualifier.sites = q.sites; changed.push("sites"); }
    if (q.dates !== undefined && q.dates.trim() !== lead.qualifier.dates) { lead.qualifier.dates = q.dates.trim(); changed.push("dates"); }
    if (q.budget !== undefined && q.budget !== lead.qualifier.budget) { lead.qualifier.budget = q.budget; changed.push("budget signal"); }
  }
  if (p.nextAction !== undefined) {
    if (!p.nextAction.trim()) return c.fail("Give the next action, or write what you are waiting for.");
    if (p.nextAction.trim() !== lead.nextAction) { lead.nextAction = p.nextAction.trim(); changed.push("next action"); }
  }
  if (p.nextActionOn !== undefined) {
    if (p.nextActionOn !== null && !isDate(p.nextActionOn)) return c.fail("Use a real date for the next action.");
    if (p.nextActionOn !== lead.nextActionOn) { lead.nextActionOn = p.nextActionOn; changed.push("next action date"); }
  }
  if (p.invoiceName !== undefined && p.invoiceName.trim() !== lead.invoiceName) { lead.invoiceName = p.invoiceName.trim(); changed.push("invoice name"); }
  if (p.invoiceEmail !== undefined) {
    const e = p.invoiceEmail.trim();
    if (e && !isEmail(e)) return c.fail("That invoice email does not look right.");
    if (e !== lead.invoiceEmail) { lead.invoiceEmail = e; changed.push("invoice email"); }
  }
  if (p.companyDetails !== undefined && p.companyDetails.trim() !== lead.companyDetails) { lead.companyDetails = p.companyDetails.trim(); changed.push("company details"); }
  if (!changed.length) return { ok: false, tone: "info", message: "Nothing changed." };
  note(c, lead, `Updated ${changed.join(", ")}.`);
  c.emit({ verb: "sales.lead_updated", summary: `${c.first()} updated ${changed.join(", ")} on ${lead.id}, ${lead.company}.` });
  return c.ok("Lead saved.");
};

const research: Handler<{ leadId: string }> = (c, a) => {
  const d = needSales(c, "manage", "run lead research"); if (d) return d;
  const lead = leadOf(c, a.leadId);
  if (!lead) return c.fail("Unknown lead.");
  lead.research = salesResearchText(lead);
  note(c, lead, "Research with agent: summary added (simulated, prewritten demo text).");
  c.emit({ verb: "sales.lead_researched", simulated: true, integrationId: "perplexity",
    summary: `${c.first()} ran simulated lead research for ${lead.id}, ${lead.company}. Prewritten demo text from the lead's own fields: no network call, no outside source. Stands in for the Perplexity step.` });
  return c.ok("Research summary added. Simulated, prewritten demo text.", "info");
};

/* ---- proposals ---- */

const createProposal: Handler<{ leadId: string }> = (c, a) => {
  const d = needSales(c, "manage", "create proposals"); if (d) return d;
  const s = c.s.sales;
  const lead = leadOf(c, a.leadId);
  if (!lead) return c.fail("Unknown lead.");
  if (lead.stage === "lost") return c.fail(`${lead.company} is in Lost. Move it back to New contact leads first.`);
  const open = s.proposals.find((p) => p.leadId === lead.id && salesLatestVersion(p).status === "draft");
  if (open) return c.fail(`${open.id} is already a draft for ${lead.company}. Open it instead.`);
  const id = `PRP-${salesPad(salesNext(s, "proposal"), 4)}`;
  const config = salesDefaultConfig(lead, s.priceItems);
  s.proposals.push({ id, leadId: lead.id, versions: [{
    version: 1, config, prices: salesPriceSnapshot(config, s.priceItems), priceListVersion: s.priceVersion, status: "draft",
    createdAt: c.stamp(), createdBy: c.persona().name, sentAt: null, sentTo: null, decidedAt: null, decisionNote: "",
  }] });
  note(c, lead, `Proposal ${id} v1 started from the master template.`);
  c.emit({ verb: "sales.proposal_created", summary: `${c.first()} started proposal ${id} v1 for ${lead.company} from the master template, priced from price list v${s.priceVersion}.` });
  return c.ok(`Proposal ${id} started.`, "ok", id);
};

function cleanConfig(c: Ctx, cfg: SalesProposalConfig): { cfg: SalesProposalConfig } | { error: string } {
  const items = c.s.sales.priceItems;
  if (!cfg || typeof cfg !== "object") return { error: "Nothing to save." };
  if (!intIn(cfg.participantsLow, 1, 5000) || !intIn(cfg.participantsHigh, 1, 5000)) return { error: "Participant numbers must be whole numbers between 1 and 5,000." };
  if (cfg.participantsHigh < cfg.participantsLow) return { error: "The high estimate cannot be below the low estimate." };
  const lines = (cfg.lines || []).map((l) => ({ itemId: l.itemId, days: l.days }));
  for (const l of lines) {
    const it = items.find((i) => i.id === l.itemId);
    if (!it || it.unit !== "day") return { error: "Packages must be day-priced items from the price list." };
    if (!intIn(l.days, 1, 60)) return { error: `${it.code} needs a whole number of clinical days between 1 and 60.` };
  }
  if (new Set(lines.map((l) => l.itemId)).size !== lines.length) return { error: "Each package can appear once. Change its days instead." };
  if (cfg.flu && (!intIn(cfg.fluLow, 0, 5000) || !intIn(cfg.fluHigh, 0, 5000) || cfg.fluHigh < cfg.fluLow)) return { error: "Flu numbers need a low and a high estimate, low not above high." };
  let exec: SalesProposalConfig["exec"] = null;
  if (cfg.exec) {
    const it = items.find((i) => i.id === "exec");
    if (!intIn(cfg.exec.count, 1, 500)) return { error: "Executive assessments need a whole number of participants." };
    if (it && it.price !== null && (typeof cfg.exec.rate !== "number" || cfg.exec.rate < it.price || cfg.exec.rate > (it.priceMax ?? it.price))) {
      return { error: `The executive rate must be between ${salesEur(it.price)} and ${salesEur(it.priceMax ?? it.price)} per participant.` };
    }
    exec = { count: cfg.exec.count, rate: cfg.exec.rate };
  }
  const upsell = Array.from(new Set(cfg.upsell || [])).filter((id) => items.some((i) => i.id === id && i.unit === "day"));
  return { cfg: {
    title: String(cfg.title || "").trim(), participantsLow: cfg.participantsLow, participantsHigh: cfg.participantsHigh, locations: String(cfg.locations || "").trim(), dates: String(cfg.dates || "").trim(),
    lines, flu: !!cfg.flu, fluLow: cfg.flu ? cfg.fluLow : 0, fluHigh: cfg.flu ? cfg.fluHigh : 0, exec, upsell, notes: String(cfg.notes || "").trim(),
  } };
}

const saveProposal: Handler<{ proposalId: string; config: SalesProposalConfig }> = (c, a) => {
  const d = needSales(c, "manage", "edit proposals"); if (d) return d;
  const s = c.s.sales;
  const p = s.proposals.find((x) => x.id === a.proposalId);
  if (!p) return c.fail("Unknown proposal.");
  const v = salesLatestVersion(p);
  if (v.status !== "draft") return c.fail(`${p.id} v${v.version} is ${v.status}. Sent versions never change: start a new version.`);
  const r = cleanConfig(c, a.config);
  if ("error" in r) return c.fail(r.error);
  if (!r.cfg.title) return c.fail("Give the proposal a title.");
  v.config = r.cfg;
  v.prices = salesPriceSnapshot(r.cfg, s.priceItems);
  v.priceListVersion = s.priceVersion;
  const t = salesProposalTotals(r.cfg, s.priceItems);
  c.emit({ verb: "sales.proposal_saved", summary: `${c.first()} saved ${p.id} v${v.version} draft, estimated ${salesEurRange(t.totalLow, t.totalHigh)}.` });
  return c.ok("Draft saved.");
};

const newProposalVersion: Handler<{ proposalId: string }> = (c, a) => {
  const d = needSales(c, "manage", "start a proposal version"); if (d) return d;
  const s = c.s.sales;
  const p = s.proposals.find((x) => x.id === a.proposalId);
  if (!p) return c.fail("Unknown proposal.");
  const last = salesLatestVersion(p);
  if (last.status === "draft") return c.fail(`v${last.version} is still a draft. Edit it instead.`);
  if (last.status === "accepted") return c.fail(`v${last.version} was accepted. Start a new proposal for further work.`);
  const config = structuredClone(last.config);
  p.versions.push({ version: last.version + 1, config, prices: salesPriceSnapshot(config, s.priceItems), priceListVersion: s.priceVersion, status: "draft",
    createdAt: c.stamp(), createdBy: c.persona().name, sentAt: null, sentTo: null, decidedAt: null, decisionNote: "" });
  const lead = leadOf(c, p.leadId);
  if (lead) note(c, lead, `Proposal ${p.id} v${last.version + 1} started from v${last.version}.`);
  c.emit({ verb: "sales.proposal_version", summary: `${c.first()} started ${p.id} v${last.version + 1}${lead ? ` for ${lead.company}` : ""}. v${last.version} is kept unchanged.` });
  return c.ok(`Version ${last.version + 1} started as a draft.`);
};

const sendProposal: Handler<{ proposalId: string }> = (c, a) => {
  const d = needSales(c, "manage", "send proposals"); if (d) return d;
  const s = c.s.sales;
  const p = s.proposals.find((x) => x.id === a.proposalId);
  if (!p) return c.fail("Unknown proposal.");
  const v = salesLatestVersion(p);
  if (v.status !== "draft") return c.fail(`${p.id} v${v.version} was already ${v.status === "sent" ? "sent" : v.status}.`);
  const lead = leadOf(c, p.leadId);
  if (!lead) return c.fail("The lead for this proposal is missing.");
  if (!lead.contact.email) return c.fail(`Add a contact email for ${lead.company} before sending.`);
  const issues = salesProposalIssues(v.config, s.priceItems);
  if (issues.length) return c.fail(issues[0]);
  v.prices = salesPriceSnapshot(v.config, s.priceItems);
  v.priceListVersion = s.priceVersion;
  v.status = "sent";
  v.sentAt = c.stamp();
  v.sentTo = lead.contact.email;
  const t = salesProposalTotals(v.config, s.priceItems, v.prices);
  lead.files.push({ id: `${lead.id}-${p.id}-v${v.version}`, name: `Proposal ${p.id} v${v.version}.pdf`, kind: "proposal", proposalId: p.id, version: v.version, addedAt: v.sentAt });
  note(c, lead, `Proposal ${p.id} v${v.version} sent to ${lead.contact.email} (simulated, no email left Pulse).`);
  const moved = lead.stage === "new" || lead.stage === "lost";
  if (moved) { lead.stage = "proposal_sent"; lead.stageAt = c.stamp(); lead.lostReason = null; note(c, lead, "Moved to Proposal sent."); }
  c.emit({ verb: "sales.proposal_sent", simulated: true, integrationId: "email",
    summary: `${c.first()} marked ${p.id} v${v.version} for ${lead.company} as sent to ${mask(lead.contact.email)}, ${salesEurRange(t.totalLow, t.totalHigh)}. Simulated: no email was sent.${moved ? " Lead moved to Proposal sent." : ""}` });
  return c.ok(`${p.id} v${v.version} marked as sent (simulated, nothing was emailed).${moved ? " Lead moved to Proposal sent." : ""}`);
};

const decideProposal: Handler<{ proposalId: string; outcome: "accepted" | "declined"; note?: string }> = (c, a) => {
  const d = needSales(c, "manage", "record proposal decisions"); if (d) return d;
  const s = c.s.sales;
  const p = s.proposals.find((x) => x.id === a.proposalId);
  if (!p) return c.fail("Unknown proposal.");
  if (a.outcome !== "accepted" && a.outcome !== "declined") return c.fail("Choose accepted or declined.");
  const v = salesLatestVersion(p);
  if (v.status !== "sent") return c.fail(v.status === "draft" ? "Send the proposal before recording a decision." : `${p.id} v${v.version} is already ${v.status}.`);
  const lead = leadOf(c, p.leadId);
  v.status = a.outcome;
  v.decidedAt = c.stamp();
  v.decisionNote = (a.note || "").trim();
  if (lead) {
    note(c, lead, `Proposal ${p.id} v${v.version} ${a.outcome}.${v.decisionNote ? ` ${v.decisionNote}` : ""}`);
    if (a.outcome === "accepted" && lead.stage !== "won") { lead.stage = "won"; lead.stageAt = c.stamp(); lead.lostReason = null; note(c, lead, "Moved to Won."); }
  }
  c.emit({ verb: `sales.proposal_${a.outcome}`, summary: `${c.first()} recorded ${p.id} v${v.version}${lead ? ` for ${lead.company}` : ""} as ${a.outcome}.${a.outcome === "accepted" ? " Lead moved to Won." : ""}` });
  return c.ok(a.outcome === "accepted" ? `${lead ? lead.company : p.id} moved to Won. Create the programme next.` : "Recorded as declined. Start a new version or move the lead to Lost.", a.outcome === "accepted" ? "ok" : "info");
};

const linkHandover: Handler<{ leadId: string; taskId: string }> = (c, a) => {
  const d = needSales(c, "manage", "hand over won business"); if (d) return d;
  const lead = leadOf(c, a.leadId);
  if (!lead) return c.fail("Unknown lead.");
  if (lead.stage !== "won") return c.fail("Only won leads are handed over to programmes.");
  if (!c.s.tasks.some((t) => t.id === a.taskId)) return c.fail("Unknown task.");
  lead.handoverTaskId = a.taskId;
  note(c, lead, `Programme set-up task ${a.taskId} created. Won business moves to the Health Screening workspace.`);
  c.emit({ verb: "sales.handover", entity: { kind: "task", id: a.taskId }, summary: `${c.first()} handed ${lead.company} (${lead.id}) over to programme set-up with task ${a.taskId}.` });
  return c.ok(`Task ${a.taskId} created for programme set-up.`);
};

/* ---- price list ---- */

interface PricePatch { price?: number | null; priceMax?: number | null; minutes?: number | null; perDay?: number | null; status?: "confirmed" | "to_confirm" | "not_supplied"; note?: string }
const updatePrice: Handler<{ itemId: string; patch: PricePatch; reason: string }> = (c, a) => {
  const d = needSales(c, "prices", "change the price list"); if (d) return d;
  const s = c.s.sales;
  const it = s.priceItems.find((i) => i.id === a.itemId);
  if (!it) return c.fail("Unknown price list item.");
  const reason = (a.reason || "").trim();
  if (reason.length < 5) return c.fail("Give a reason for the change. It is kept in the price list history.");
  const p = a.patch || {};
  const money = (v: unknown) => v === null || (typeof v === "number" && Number.isFinite(v) && v > 0 && v <= 100000 && Math.round(v * 100) === v * 100);
  if (p.price !== undefined && !money(p.price)) return c.fail("Price must be a positive amount in euro, up to two decimal places, or blank when not supplied.");
  if (p.priceMax !== undefined && !money(p.priceMax)) return c.fail("The upper price must be a positive amount in euro.");
  if (p.minutes !== undefined && p.minutes !== null && !intIn(p.minutes, 5, 240)) return c.fail("Appointment length must be between 5 and 240 minutes.");
  if (p.perDay !== undefined && p.perDay !== null && !intIn(p.perDay, 1, 200)) return c.fail("Capacity must be a whole number of appointments a day.");
  const next = { ...it, ...p, note: p.note !== undefined ? p.note.trim() : it.note };
  if (next.status !== "not_supplied" && next.price === null) return c.fail("Add a price, or mark the rate as not supplied.");
  if (next.priceMax !== null && next.price !== null && next.priceMax < next.price) return c.fail("The upper price cannot be below the lower price.");
  const changes: string[] = [];
  const eur = (v: number | null) => (v === null ? "not supplied" : salesEur(v));
  if (next.price !== it.price) changes.push(`price from ${eur(it.price)} to ${eur(next.price)}`);
  if (next.priceMax !== it.priceMax) changes.push(`upper price from ${eur(it.priceMax)} to ${eur(next.priceMax)}`);
  if (next.minutes !== it.minutes) changes.push(`appointment from ${it.minutes ?? "not stated"} to ${next.minutes ?? "not stated"} min`);
  if (next.perDay !== it.perDay) changes.push(`capacity from ${it.perDay ?? "not stated"} to ${next.perDay ?? "not stated"} a day`);
  if (next.status !== it.status) changes.push(`status from ${it.status.replace("_", " ")} to ${next.status.replace("_", " ")}`);
  if (next.note !== it.note) changes.push("note");
  if (!changes.length) return { ok: false, tone: "info", message: "Nothing changed." };
  Object.assign(it, next);
  s.priceVersion += 1;
  const summary = `${it.code}: ${changes.join(", ")}.`;
  s.priceHistory.push({ version: s.priceVersion, at: c.stamp(), by: c.persona().name, itemId: it.id, summary, reason });
  c.emit({ verb: "sales.price_changed", summary: `${c.first()} published price list v${s.priceVersion}. ${summary} Draft proposals pick it up on their next save; sent proposals keep their prices.` });
  return c.ok(`Price list v${s.priceVersion} published.`);
};

/* ---- recall and tenders ---- */

const draftOutreach: Handler<{ recallId: string; kind: "recall" | "lapsed" }> = (c, a) => {
  const d = needSales(c, "manage", "draft re-engagement emails"); if (d) return d;
  const s = c.s.sales;
  const rc = salesRecalls(c.s).find((r) => r.id === a.recallId);
  if (!rc) return c.fail("Unknown recall.");
  if (!rc.contactEmail) return c.fail(`No contact email on file for ${rc.company}.`);
  const kind = a.kind === "lapsed" ? "lapsed" : "recall";
  const { subject, body } = salesOutreachText(rc, kind);
  const id = `OUT-${salesPad(salesNext(s, "outreach"), 3)}`;
  s.outreach.push({ id, engagementId: rc.engagementId, company: rc.company, kind, to: rc.contactName, toEmail: rc.contactEmail, subject, body, createdAt: c.stamp(), createdBy: c.persona().name });
  c.emit({ verb: "sales.outreach_drafted", simulated: true, integrationId: "email",
    summary: `${c.first()} drafted a ${kind === "lapsed" ? "re-engagement" : "recall"} email ${id} to ${rc.company} (${mask(rc.contactEmail)}). Simulated draft: not sent, and it holds no clinical information.` });
  return c.ok(`Draft ${id} ready. Not sent.`, "info", id);
};

const setTenderStatus: Handler<{ tenderId: string; status: SalesTenderStatus }> = (c, a) => {
  const d = needSales(c, "manage", "update the tender watch"); if (d) return d;
  const t = c.s.sales.tenders.find((x) => x.id === a.tenderId);
  if (!t) return c.fail("Unknown tender.");
  if (!(a.status in SALES_TENDER_STATUS_LABEL)) return c.fail("Unknown tender status.");
  if (t.status === a.status) return { ok: false, tone: "info", message: "Nothing changed." };
  const from = t.status;
  t.status = a.status;
  c.emit({ verb: "sales.tender_status", summary: `${c.first()} changed fictional tender ${t.id} from ${SALES_TENDER_STATUS_LABEL[from]} to ${SALES_TENDER_STATUS_LABEL[a.status]}.` });
  return c.ok(`${t.id}: ${SALES_TENDER_STATUS_LABEL[a.status]}.`);
};

/* ---- Irish Life Health ---- */

const ilhAddFromIntake: Handler<{ ref: string }> = (c, a) => {
  const d = needSales(c, "ilh", "add Irish Life bookings"); if (d) return d;
  const s = c.s.sales;
  const sub = s.ilhIntake.find((x) => x.ref === a.ref);
  if (!sub) return c.fail("Unknown booking submission.");
  if (sub.status !== "waiting") return c.fail(`${sub.ref} is already on the board.`);
  const id = `ILH-${salesPad(salesNext(s, "ilh"), 4)}`;
  s.ilh.push({
    id, item: salesIlhItemName(sub.company, sub.requested), company: sub.company, location: sub.location, eircode: sub.eircode, requested: sub.requested, date: sub.date, start: sub.start,
    group: sub.requested === "lifestyle_checkpoint" ? "lifestyle" : "pending", intakeRef: sub.ref, screened: false, payment: null, invoice: null, archived: false,
  });
  sub.status = "added";
  c.emit({ verb: "sales.ilh_booking_added", simulated: true,
    summary: `${c.first()} added Irish Life booking ${sub.ref} as ${id}: ${SALES_ILH_REQUESTED_LABEL[sub.requested]} on ${fmtDate(sub.date)}. Simulated intake from the Irish Life booking web app.` });
  return c.ok(`${id} added to Bookings pending 2026.`, "ok", id);
};

const ilhUpdate: Handler<{ bookingId: string; patch: { date?: string; start?: string; location?: string; eircode?: string } }> = (c, a) => {
  const d = needSales(c, "ilh", "update Irish Life bookings"); if (d) return d;
  const b = c.s.sales.ilh.find((x) => x.id === a.bookingId);
  if (!b) return c.fail("Unknown booking.");
  if (b.archived) return c.fail("Archived bookings do not change.");
  const p = a.patch || {};
  const changed: string[] = [];
  if (p.date !== undefined && p.date !== b.date) {
    if (b.screened) return c.fail("The screening has happened. Its date no longer changes.");
    if (!isDate(p.date)) return c.fail("Use a real date.");
    b.date = p.date; changed.push(`date to ${fmtDate(p.date)}`);
  }
  if (p.start !== undefined && p.start !== b.start) {
    if (!isTime(p.start)) return c.fail("Use a 24-hour start time, for example 09:30.");
    b.start = p.start; changed.push(`start to ${p.start}`);
  }
  if (p.location !== undefined && p.location.trim() !== b.location) {
    if (!p.location.trim()) return c.fail("Give the location.");
    b.location = p.location.trim(); changed.push("location");
  }
  if (p.eircode !== undefined && normEircode(p.eircode) !== b.eircode) {
    if (!EIRCODE.test(p.eircode.trim())) return c.fail("That Eircode does not look right. It is a routing key and four characters, for example D02 X285.");
    b.eircode = normEircode(p.eircode); changed.push("Eircode");
  }
  if (!changed.length) return { ok: false, tone: "info", message: "Nothing changed." };
  c.emit({ verb: "sales.ilh_booking_updated", summary: `${c.first()} updated Irish Life booking ${b.id}: ${changed.join(", ")}.` });
  return c.ok("Booking updated.");
};

const ilhMarkScreened: Handler<{ bookingId: string }> = (c, a) => {
  const d = needSales(c, "ilh", "mark Irish Life screenings done"); if (d) return d;
  const b = c.s.sales.ilh.find((x) => x.id === a.bookingId);
  if (!b) return c.fail("Unknown booking.");
  if (b.screened) return c.fail(`${b.id} is already marked as screened.`);
  if (b.date > todayOf(c)) return c.fail(`${b.id} is on ${fmtDate(b.date)}. Mark it after the screening.`);
  b.screened = true;
  b.payment = "draft_needs_action";
  c.emit({ verb: "sales.ilh_screened", summary: `${c.first()} marked Irish Life booking ${b.id} (${SALES_ILH_REQUESTED_LABEL[b.requested]}, ${fmtDate(b.date)}) as screened. Invoice draft needs action.` });
  return c.ok("Marked as screened. The invoice draft is next.");
};

const ilhDraftInvoice: Handler<{ bookingId: string; amount?: number | null }> = (c, a) => {
  const d = needSales(c, "ilh", "draft Irish Life invoices"); if (d) return d;
  const s = c.s.sales;
  const b = s.ilh.find((x) => x.id === a.bookingId);
  if (!b) return c.fail("Unknown booking.");
  if (!b.screened) return c.fail("Invoices are drafted after the screening. Mark it as screened first.");
  if (b.invoice) return c.fail(`${b.id} already has invoice ${b.invoice.number}.`);
  const price = salesIlhPriceFor(s, b.requested);
  let amount = price.amount;
  let source: "price_list" | "manual" = "price_list";
  let basis = price.basis;
  if (amount === null) {
    const v = a.amount;
    if (typeof v !== "number" || !Number.isFinite(v) || v <= 0 || v > 100000 || Math.round(v * 100) !== v * 100) {
      return c.fail(`${SALES_ILH_REQUESTED_LABEL[b.requested]} has no rate on the price list. Enter the agreed amount, or ask Stephen to set the rate.`);
    }
    amount = v; source = "manual"; basis = "Amount entered manually. The Irish Life partner rate is not on the price list.";
  }
  const number = `IN26-${salesNext(s, "invoice")}`;
  b.invoice = { number, amount, source, basis, priceListVersion: source === "price_list" ? s.priceVersion : null, draftedAt: c.stamp(), draftedBy: c.persona().name };
  b.payment = "in_draft";
  c.emit({ verb: "sales.ilh_invoice_drafted", simulated: true, integrationId: "xero",
    summary: `${c.first()} drafted invoice ${number} for ${salesEur(amount)} for ${b.item} (${b.id}). Simulated Xero draft: nothing was created in Xero and nothing was sent to Irish Life.` });
  return c.ok(`Invoice ${number} drafted, ${salesEur(amount)}. Simulated: not created in Xero, not sent.`, "info");
};

const ilhSetPayment: Handler<{ bookingId: string; status: SalesIlhPayment }> = (c, a) => {
  const d = needSales(c, "ilh", "update payment status"); if (d) return d;
  const b = c.s.sales.ilh.find((x) => x.id === a.bookingId);
  if (!b) return c.fail("Unknown booking.");
  if (!b.invoice) return c.fail("Draft the invoice first.");
  if (b.archived) return c.fail("Archived bookings do not change.");
  if (!["in_draft", "awaiting_payment", "paid"].includes(a.status)) return c.fail("Choose In draft, Awaiting payment or Paid.");
  if (b.payment === a.status) return { ok: false, tone: "info", message: "Nothing changed." };
  const from = b.payment;
  b.payment = a.status;
  const extra = a.status === "awaiting_payment" ? " Recorded as sent from Xero by staff; Pulse sent nothing." : "";
  c.emit({ verb: "sales.ilh_payment", summary: `${c.first()} changed ${b.invoice.number} (${b.id}) from ${from ? SALES_ILH_PAYMENT_LABEL[from] : "none"} to ${SALES_ILH_PAYMENT_LABEL[a.status]}.${extra}` });
  return c.ok(`${b.invoice.number}: ${SALES_ILH_PAYMENT_LABEL[a.status]}.`);
};

const ilhArchive: Handler<{ bookingId: string }> = (c, a) => {
  const d = needSales(c, "ilh", "archive Irish Life bookings"); if (d) return d;
  const b = c.s.sales.ilh.find((x) => x.id === a.bookingId);
  if (!b) return c.fail("Unknown booking.");
  if (b.archived) return c.fail(`${b.id} is already archived.`);
  if (b.payment !== "paid") return c.fail("Only paid bookings go to the archive.");
  b.archived = true;
  c.emit({ verb: "sales.ilh_archived", summary: `${c.first()} archived paid Irish Life booking ${b.id} (${b.invoice?.number || "no invoice"}).` });
  return c.ok(`${b.id} archived.`);
};

registerHandlers({
  "sales/createLead": createLead,
  "sales/moveLead": moveLead,
  "sales/updateLead": updateLead,
  "sales/research": research,
  "sales/createProposal": createProposal,
  "sales/saveProposal": saveProposal,
  "sales/newProposalVersion": newProposalVersion,
  "sales/sendProposal": sendProposal,
  "sales/decideProposal": decideProposal,
  "sales/linkHandover": linkHandover,
  "sales/updatePrice": updatePrice,
  "sales/draftOutreach": draftOutreach,
  "sales/setTenderStatus": setTenderStatus,
  "sales/ilhAddFromIntake": ilhAddFromIntake,
  "sales/ilhUpdate": ilhUpdate,
  "sales/ilhMarkScreened": ilhMarkScreened,
  "sales/ilhDraftInvoice": ilhDraftInvoice,
  "sales/ilhSetPayment": ilhSetPayment,
  "sales/ilhArchive": ilhArchive,
});

/** Typed action creators for the Sales module. dispatch(salesAct.moveLead("LD-0001", "won")). */
export const salesAct = {
  createLead: (a: CreateLead) => ({ type: "sales/createLead", ...a }),
  moveLead: (leadId: string, stage: SalesStage, reason?: string) => ({ type: "sales/moveLead", leadId, stage, reason }),
  updateLead: (leadId: string, patch: LeadPatch) => ({ type: "sales/updateLead", leadId, patch }),
  research: (leadId: string) => ({ type: "sales/research", leadId }),
  createProposal: (leadId: string) => ({ type: "sales/createProposal", leadId }),
  saveProposal: (proposalId: string, config: SalesProposalConfig) => ({ type: "sales/saveProposal", proposalId, config }),
  newProposalVersion: (proposalId: string) => ({ type: "sales/newProposalVersion", proposalId }),
  sendProposal: (proposalId: string) => ({ type: "sales/sendProposal", proposalId }),
  decideProposal: (proposalId: string, outcome: "accepted" | "declined", note?: string) => ({ type: "sales/decideProposal", proposalId, outcome, note }),
  linkHandover: (leadId: string, taskId: string) => ({ type: "sales/linkHandover", leadId, taskId }),
  updatePrice: (itemId: string, patch: PricePatch, reason: string) => ({ type: "sales/updatePrice", itemId, patch, reason }),
  draftOutreach: (recallId: string, kind: "recall" | "lapsed") => ({ type: "sales/draftOutreach", recallId, kind }),
  setTenderStatus: (tenderId: string, status: SalesTenderStatus) => ({ type: "sales/setTenderStatus", tenderId, status }),
  ilhAddFromIntake: (ref: string) => ({ type: "sales/ilhAddFromIntake", ref }),
  ilhUpdate: (bookingId: string, patch: { date?: string; start?: string; location?: string; eircode?: string }) => ({ type: "sales/ilhUpdate", bookingId, patch }),
  ilhMarkScreened: (bookingId: string) => ({ type: "sales/ilhMarkScreened", bookingId }),
  ilhDraftInvoice: (bookingId: string, amount?: number | null) => ({ type: "sales/ilhDraftInvoice", bookingId, amount }),
  ilhSetPayment: (bookingId: string, status: SalesIlhPayment) => ({ type: "sales/ilhSetPayment", bookingId, status }),
  ilhArchive: (bookingId: string) => ({ type: "sales/ilhArchive", bookingId }),
};
export type { CreateLead, LeadPatch, PricePatch };
export type IlhRequested = SalesIlhRequested;
