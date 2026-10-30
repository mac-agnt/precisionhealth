/* Handlers for Stephen's sales workflow (src/ph/model/salesFlow.ts), registered at import time.
   Same rights as the rest of Sales: Stephen owns sales. Every change is written to the lead's
   timeline and the activity log. Emails are simulated: nothing leaves Pulse, and the text says so. */
import type { ActionResult, Ctx, SalesBuilderInput, SalesLead } from "../../model";
import {
  SALES_STAGE_LABEL, addDays, localDateOf, registerHandlers, salesBuilderConfig, salesDuration, salesEur, salesEurRange, salesFollowSequence, salesLatestVersion, salesNext, salesPad,
  salesParseDiscount, salesPriceSnapshot, salesProposalTotals, salesRights, salesApplyDiscount,
} from "../../model";

function needManage(c: Ctx, what: string): ActionResult | null {
  const p = c.persona();
  if (salesRights(p).manage) return null;
  if (p.isParticipant) return c.fail(`The participant preview cannot ${what}. Sales is for Precision Health staff.`);
  return c.fail(`${p.name} cannot ${what}. Stephen Kelly owns sales: use "Work as Stephen" to try it.`);
}
const leadOf = (c: Ctx, id: string): SalesLead | undefined => c.s.sales.leads.find((l) => l.id === id);
const mask = (email: string) => email.replace(/^(.)[^@]*/, "$1***");
const isIso = (v: unknown): v is string => typeof v === "string" && !Number.isNaN(Date.parse(v)) && /^\d{4}-\d{2}-\d{2}T/.test(v);

/** Records the first touch on an inbound lead. `at` is the presenter's live time, kept when sensible. */
function touch(c: Ctx, lead: SalesLead, via: "email" | "call", at?: string): string {
  const inb = c.s.salesFlow.inbound.find((x) => x.leadId === lead.id);
  if (!inb || inb.firstTouchAt) return "";
  const arrived = Date.parse(inb.arrivedAt);
  const live = isIso(at) ? Date.parse(at) : NaN;
  const when = Number.isFinite(live) && live >= arrived && live <= Date.parse(c.now) + 24 * 3600000 ? new Date(live).toISOString() : c.stamp();
  inb.firstTouchAt = when;
  inb.firstTouchBy = c.persona().name;
  inb.firstTouchVia = via;
  inb.responseSeconds = Math.max(0, Math.round((Date.parse(when) - arrived) / 1000));
  const inTime = inb.responseSeconds <= inb.slaMinutes * 60;
  return ` First touch ${inTime ? "within" : "outside"} the ${inb.slaMinutes} minute target: ${salesDuration(inb.responseSeconds)}.`;
}

registerHandlers({
  "salesFlow/sendFirstEmail": (c, a: { leadId: string; subject: string; body: string; attachments?: string[]; at?: string }) => {
    const d = needManage(c, "send the first reply"); if (d) return d;
    const lead = leadOf(c, a.leadId);
    if (!lead) return c.fail("Unknown lead.");
    if (!lead.contact.email) return c.fail(`Add a contact email for ${lead.company} first.`);
    const subject = String(a.subject || "").trim();
    const body = String(a.body || "").trim();
    if (subject.length < 3) return c.fail("Give the email a subject.");
    if (body.length < 20) return c.fail("The email is too short to send.");
    const f = c.s.salesFlow;
    const attachments = Array.from(new Set((a.attachments || []).map((x) => String(x).trim()).filter(Boolean)));
    const extra = touch(c, lead, "email", a.at);
    const at = c.s.salesFlow.inbound.find((x) => x.leadId === lead.id)?.firstTouchAt || c.stamp();
    const id = `EM-${salesPad(++f.seq.email, 3)}`;
    f.emails.push({ id, leadId: lead.id, at, by: c.persona().id, to: lead.contact.email, subject, body, attachments, kind: "first_reply" });
    for (const name of attachments) {
      if (!lead.files.some((x) => x.name === name)) lead.files.push({ id: `${lead.id}-F${lead.files.length + 1}`, name, kind: "brochure", proposalId: null, version: null, addedAt: at });
    }
    lead.history.push({ at, by: c.persona().id, text: `Email: first reply sent to ${lead.contact.email}${attachments.length ? ` with ${attachments.join(", ")}` : ""} and a booking link.${extra}` });
    if (lead.stage === "new") { lead.nextAction = "Hold the intro call and add meeting notes"; lead.nextActionOn = addDays(localDateOf(c.now), 2); }
    c.emit({ verb: "sales.first_reply", simulated: true, integrationId: "email",
      summary: `${c.first()} sent the agent-drafted first reply to ${lead.company} (${mask(lead.contact.email)}) with the brochure and booking link. Simulated: no email was sent.${extra}` });
    return c.ok(`First reply sent to ${lead.contact.name}.${extra}`, "ok", id);
  },

  "salesFlow/logFirstTouch": (c, a: { leadId: string; via: "call" | "email"; at?: string }) => {
    const d = needManage(c, "log a first touch"); if (d) return d;
    const lead = leadOf(c, a.leadId);
    if (!lead) return c.fail("Unknown lead.");
    const inb = c.s.salesFlow.inbound.find((x) => x.leadId === lead.id);
    if (!inb) return c.fail(`${lead.company} has no first-touch clock.`);
    if (inb.firstTouchAt) return c.fail(`The first touch on ${lead.company} is already logged.`);
    const via = a.via === "email" ? "email" : "call";
    const extra = touch(c, lead, via, a.at);
    lead.history.push({ at: inb.firstTouchAt!, by: c.persona().id, text: `${via === "call" ? "Call" : "Email"}: first touch logged.${extra}` });
    c.emit({ verb: "sales.first_touch", summary: `${c.first()} logged a first ${via} with ${lead.company}.${extra}` });
    return c.ok(`First touch logged.${extra}`);
  },

  "salesFlow/saveNotes": (c, a: { leadId: string; text: string }) => {
    const d = needManage(c, "save meeting notes"); if (d) return d;
    const lead = leadOf(c, a.leadId);
    if (!lead) return c.fail("Unknown lead.");
    const text = String(a.text || "").trim();
    if (text.length > 4000) return c.fail("Meeting notes are limited to 4,000 characters.");
    const prev = c.s.salesFlow.notes[lead.id]?.text || "";
    if (text === prev) return { ok: false, tone: "info", message: "Nothing changed." };
    if (!text) { delete c.s.salesFlow.notes[lead.id]; lead.history.push({ at: c.stamp(), by: c.persona().id, text: "Meeting notes cleared." }); return c.ok("Meeting notes cleared."); }
    c.s.salesFlow.notes[lead.id] = { text, savedAt: c.stamp(), savedBy: c.persona().id };
    lead.history.push({ at: c.stamp(), by: c.persona().id, text: `Meeting: notes ${prev ? "updated" : "saved"}.` });
    /* The next action moves with the step: once the notes are in, the proposal is next. */
    const hasProposal = c.s.sales.proposals.some((p) => p.leadId === lead.id);
    if (!hasProposal && lead.stage !== "won" && lead.stage !== "lost") { lead.nextAction = "Build the proposal from the meeting notes"; lead.nextActionOn = localDateOf(c.now); }
    c.emit({ verb: "sales.meeting_notes", summary: `${c.first()} ${prev ? "updated" : "saved"} meeting notes on ${lead.company}.` });
    return c.ok("Meeting notes saved. They will fill in the proposal.");
  },

  "salesFlow/buildProposal": (c, a: { leadId: string; input: SalesBuilderInput; instructions?: string }) => {
    const d = needManage(c, "build proposals"); if (d) return d;
    const s = c.s.sales;
    const lead = leadOf(c, a.leadId);
    if (!lead) return c.fail("Unknown lead.");
    if (lead.stage === "lost") return c.fail(`${lead.company} is in Lost. Move it back to New contact leads first.`);
    const i = a.input || ({} as SalesBuilderInput);
    const n = Math.floor(Number(i.headcount));
    if (!Number.isFinite(n) || n < 1 || n > 5000) return c.fail("Enter how many people, between 1 and 5,000.");
    if (i.packageId) {
      const it = s.priceItems.find((x) => x.id === i.packageId);
      if (!it || it.unit !== "day") return c.fail("Choose a package from the price list.");
      if (it.price === null) return c.fail(`${it.name} has no rate on the price list yet.`);
    }
    const exec = Math.floor(Number(i.execCount) || 0);
    if (exec < 0 || exec > 500) return c.fail("Executive medicals must be between 0 and 500 people.");
    const fluN = Math.floor(Number(i.fluCount) || 0);
    if (i.flu && (fluN < 1 || fluN > 5000)) return c.fail("Flu needs a number of vaccines between 1 and 5,000.");
    if (!i.packageId && !i.flu && !exec) return c.fail("Choose a package, flu vaccines or executive medicals.");
    const text = String(a.instructions || "").trim();
    if (text.length > 1000) return c.fail("Keep the deal instructions under 1,000 characters.");
    const input: SalesBuilderInput = { packageId: i.packageId || null, headcount: n, flu: !!i.flu, fluCount: fluN, execCount: exec, locations: String(i.locations || ""), dates: String(i.dates || "") };

    let p = s.proposals.filter((x) => x.leadId === lead.id).slice(-1)[0];
    let verb = "";
    if (p && salesLatestVersion(p).status === "accepted") return c.fail(`${p.id} was accepted. Start onboarding instead.`);
    if (!p) {
      const id = `PRP-${salesPad(salesNext(s, "proposal"), 4)}`;
      const config = salesBuilderConfig(input, s.priceItems);
      p = { id, leadId: lead.id, versions: [{ version: 1, config, prices: salesPriceSnapshot(config, s.priceItems), priceListVersion: s.priceVersion, status: "draft", createdAt: c.stamp(), createdBy: c.persona().name, sentAt: null, sentTo: null, decidedAt: null, decisionNote: "" }] };
      s.proposals.push(p);
      verb = "created";
    } else {
      const last = salesLatestVersion(p);
      const config = salesBuilderConfig(input, s.priceItems, last.config);
      if (last.status === "draft") { last.config = config; last.prices = salesPriceSnapshot(config, s.priceItems); last.priceListVersion = s.priceVersion; verb = "updated"; }
      else {
        p.versions.push({ version: last.version + 1, config, prices: salesPriceSnapshot(config, s.priceItems), priceListVersion: s.priceVersion, status: "draft", createdAt: c.stamp(), createdBy: c.persona().name, sentAt: null, sentTo: null, decidedAt: null, decisionNote: "" });
        verb = `started as v${last.version + 1}`;
      }
    }
    const pct = salesParseDiscount(text);
    if (text) c.s.salesFlow.instructions[p.id] = { text, discountPct: pct, savedAt: c.stamp(), savedBy: c.persona().id };
    else delete c.s.salesFlow.instructions[p.id];
    lead.qualifier.headcount = n;
    if (input.dates.trim()) lead.qualifier.dates = input.dates.trim();
    const v = salesLatestVersion(p);
    const t = salesProposalTotals(v.config, s.priceItems);
    const net = salesApplyDiscount(t, pct);
    const money = salesEurRange(net.netLow, net.netHigh);
    lead.history.push({ at: c.stamp(), by: c.persona().id, text: `Proposal ${p.id} v${v.version} ${verb} with the proposal builder, ${money}${pct ? ` after a ${pct}% discount` : ""}.` });
    if (lead.stage === "new") { lead.nextAction = "Check the proposal and send it"; lead.nextActionOn = localDateOf(c.now); }
    c.emit({ verb: "sales.proposal_built", summary: `${c.first()} ${verb} proposal ${p.id} v${v.version} for ${lead.company}: ${money}${pct ? `, including a ${pct}% discount of ${salesEur(net.discountHigh)}` : ""}.` });
    return c.ok(`Proposal ${p.id} ${verb}, ${money}.`, "ok", p.id);
  },

  "salesFlow/saveInstructions": (c, a: { proposalId: string; text: string }) => {
    const d = needManage(c, "change deal instructions"); if (d) return d;
    const p = c.s.sales.proposals.find((x) => x.id === a.proposalId);
    if (!p) return c.fail("Unknown proposal.");
    if (salesLatestVersion(p).status !== "draft") return c.fail("This version has been sent. Start a new version to change the deal instructions.");
    const text = String(a.text || "").trim();
    if (text.length > 1000) return c.fail("Keep the deal instructions under 1,000 characters.");
    if (text) c.s.salesFlow.instructions[p.id] = { text, discountPct: salesParseDiscount(text), savedAt: c.stamp(), savedBy: c.persona().id };
    else delete c.s.salesFlow.instructions[p.id];
    c.emit({ verb: "sales.deal_instructions", summary: `${c.first()} updated the deal instructions on ${p.id}.` });
    return c.ok("Deal instructions saved.");
  },

  "salesFlow/followUp": (c, a: { leadId: string; step: number; action: "send" | "skip" }) => {
    const d = needManage(c, "work the follow-up sequence"); if (d) return d;
    const lead = leadOf(c, a.leadId);
    if (!lead) return c.fail("Unknown lead.");
    const q = salesFollowSequence(c.s, lead.id);
    if (!q) return c.fail("Send a proposal first. The follow ups start a week after it goes out.");
    if (q.stopped) return c.fail(`The follow ups stopped because ${lead.company} is ${q.stopped === "won" ? "won" : "lost"}.`);
    if (q.paused) return c.fail("The follow ups are paused. Resume them first.");
    const step = q.steps.find((x) => x.n === a.step);
    if (!step) return c.fail("Unknown follow-up step.");
    if (step.status === "sent" || step.status === "skipped") return c.fail(`Week ${step.n} is already ${step.status}.`);
    const action = a.action === "skip" ? "skipped" : "sent";
    const seq = c.s.salesFlow.sequences[q.key] || (c.s.salesFlow.sequences[q.key] = { paused: false, steps: {} });
    const at = c.stamp();
    seq.steps[String(step.n)] = { status: action, at, by: c.persona().id };
    if (action === "sent") {
      const f = c.s.salesFlow;
      f.emails.push({ id: `EM-${salesPad(++f.seq.email, 3)}`, leadId: lead.id, at, by: c.persona().id, to: lead.contact.email, subject: step.subject, body: step.body, attachments: [], kind: "follow_up" });
    }
    lead.history.push({ at, by: c.persona().id, text: action === "sent" ? `Email: follow up week ${step.n} sent, "${step.subject}".` : `Follow up week ${step.n} skipped.` });
    const after = salesFollowSequence(c.s, lead.id);
    if (after?.next && lead.stage === "proposal_sent") { lead.nextAction = `Follow up week ${after.next.n}`; lead.nextActionOn = after.next.due; }
    c.emit({ verb: `sales.follow_up_${action}`, simulated: action === "sent", integrationId: action === "sent" ? "email" : null,
      summary: `${c.first()} ${action} follow up week ${step.n} for ${lead.company}${action === "sent" ? ` to ${mask(lead.contact.email)}. Simulated: no email was sent` : ""}.` });
    return c.ok(action === "sent" ? `Week ${step.n} follow up sent.` : `Week ${step.n} skipped.`, action === "sent" ? "ok" : "info");
  },

  "salesFlow/pauseFollowUps": (c, a: { leadId: string; paused: boolean }) => {
    const d = needManage(c, "pause follow ups"); if (d) return d;
    const lead = leadOf(c, a.leadId);
    if (!lead) return c.fail("Unknown lead.");
    const q = salesFollowSequence(c.s, lead.id);
    if (!q) return c.fail("There is no follow-up sequence yet.");
    if (q.stopped) return c.fail("The follow ups have already stopped.");
    if (q.paused === !!a.paused) return { ok: false, tone: "info", message: "Nothing changed." };
    const seq = c.s.salesFlow.sequences[q.key] || (c.s.salesFlow.sequences[q.key] = { paused: false, steps: {} });
    seq.paused = !!a.paused;
    lead.history.push({ at: c.stamp(), by: c.persona().id, text: a.paused ? "Follow-up sequence paused." : "Follow-up sequence resumed." });
    c.emit({ verb: a.paused ? "sales.follow_up_paused" : "sales.follow_up_resumed", summary: `${c.first()} ${a.paused ? "paused" : "resumed"} the follow ups for ${lead.company}.` });
    return c.ok(a.paused ? "Follow ups paused." : "Follow ups resumed.", "info");
  },

  "salesFlow/markWon": (c, a: { leadId: string }) => {
    const d = needManage(c, "mark leads as won"); if (d) return d;
    const s = c.s.sales;
    const lead = leadOf(c, a.leadId);
    if (!lead) return c.fail("Unknown lead.");
    if (lead.stage === "won") return c.fail(`${lead.company} is already won.`);
    const from = lead.stage;
    const at = c.stamp();
    const p = s.proposals.filter((x) => x.leadId === lead.id).slice(-1)[0];
    let accepted = "";
    if (p) {
      const v = salesLatestVersion(p);
      if (v.status === "sent") { v.status = "accepted"; v.decidedAt = at; v.decisionNote = "Marked as won."; accepted = ` Proposal ${p.id} v${v.version} accepted.`; }
    }
    lead.stage = "won";
    lead.stageAt = at;
    lead.lostReason = null;
    lead.nextAction = "Onboarding: confirm dates, venue and the booking page";
    lead.nextActionOn = addDays(localDateOf(c.now), 1);
    lead.history.push({ at, by: c.persona().id, text: `Marked as won from ${SALES_STAGE_LABEL[from]}.${accepted} Follow ups stopped. Next: onboarding.` });
    c.emit({ verb: "sales.lead_won", summary: `${c.first()} marked ${lead.company} (${lead.id}) as won.${accepted}` });
    return c.ok(`${lead.company} is won. Choose Occupational Health or Wellness to start onboarding.`, "ok", lead.id);
  },
});

export const flowAct = {
  sendFirstEmail: (leadId: string, subject: string, body: string, attachments: string[], at?: string) => ({ type: "salesFlow/sendFirstEmail", leadId, subject, body, attachments, at }),
  logFirstTouch: (leadId: string, via: "call" | "email", at?: string) => ({ type: "salesFlow/logFirstTouch", leadId, via, at }),
  saveNotes: (leadId: string, text: string) => ({ type: "salesFlow/saveNotes", leadId, text }),
  buildProposal: (leadId: string, input: SalesBuilderInput, instructions?: string) => ({ type: "salesFlow/buildProposal", leadId, input, instructions }),
  saveInstructions: (proposalId: string, text: string) => ({ type: "salesFlow/saveInstructions", proposalId, text }),
  followUp: (leadId: string, step: number, action: "send" | "skip") => ({ type: "salesFlow/followUp", leadId, step, action }),
  pauseFollowUps: (leadId: string, paused: boolean) => ({ type: "salesFlow/pauseFollowUps", leadId, paused }),
  markWon: (leadId: string) => ({ type: "salesFlow/markWon", leadId }),
};
