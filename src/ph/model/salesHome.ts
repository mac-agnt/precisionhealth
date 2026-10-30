/* Home for the sales owner (Stephen): the suggested questions, the Home subline and the
   deterministic answers about leads, proposals, onboarding and rebooking. Composed from the
   store by selectors, like every other Pulse answer. No model is called. */
import type { PhState } from "./types";
import type { Answer } from "./ai";
import { persona, plural } from "./selectors/core";
import { fmtDayMonth, fmtTime } from "./time";
import { SALES_PROPOSAL_STATUS_LABEL, salesEur, salesLeadViews, salesRecalls, salesRights } from "./sales";
import type { SalesLeadView } from "./sales";
import { salesPendingInbound } from "./salesFlow";
import { ONB_KIND_LABEL, onbProgress } from "./onboarding";

/** True when Home should be about sales for the signed-in person. */
export function salesHomeFor(state: PhState): boolean {
  return salesRights(persona(state)).manage;
}

export const SALES_HOME_SUBLINE = "Ask about leads, proposals, onboarding and rebooking.";

export const SALES_HOME_PROMPTS = [
  "What needs my attention this morning?",
  "Which leads need a reply today?",
  "Which proposals are waiting on the client?",
  "How are the client onboardings going?",
  "Which clients are due to rebook?",
];

/** Open leads (new or proposal sent) ordered by urgency: overdue, due today, then by date. */
export function salesOpenLeads(state: PhState): SalesLeadView[] {
  const rank = (v: SalesLeadView) => (v.overdue ? 0 : v.dueToday ? 1 : 2);
  return salesLeadViews(state)
    .filter((v) => v.lead.stage === "new" || v.lead.stage === "proposal_sent")
    .sort((a, b) => rank(a) - rank(b) || ((a.lead.nextActionOn || "9") < (b.lead.nextActionOn || "9") ? -1 : 1));
}

/** One sentence for the start of Stephen's briefing. */
export function salesBriefingLine(state: PhState): string {
  const pending = salesPendingInbound(state);
  const open = salesOpenLeads(state);
  const due = open.filter((v) => v.overdue || v.dueToday).length;
  const lead = pending.length ? state.sales.leads.find((l) => l.id === pending[0].leadId) : undefined;
  const inbound = lead ? `A new inbound lead from ${lead.company} arrived at ${fmtTime(pending[0].arrivedAt)} and needs a first reply within ${pending[0].slaMinutes} minutes.` : "Every inbound lead has had its first reply.";
  return `${inbound} ${plural(due, "lead")} ${due === 1 ? "needs" : "need"} an action today or ${due === 1 ? "is" : "are"} overdue.`;
}

const pipeline = (lead?: string) => ({ page: "Sales" as const, tab: "pipeline", params: lead ? { lead } : undefined });

/** Answers the sales questions. Returns null when the question is not about sales. */
export function salesAnswer(state: PhState, q: string): Answer | null {
  const s = q.toLowerCase();
  const kind = /rebook|recall|renew|anniversar/.test(s) ? "rebook"
    : /onboard/.test(s) ? "onboarding"
    : /proposal/.test(s) ? "proposals"
    : /\blead|pipeline|enquir|inbound/.test(s) ? "leads"
    : null;
  if (!kind) return null;
  if (!salesHomeFor(state)) {
    return { scenario: "restricted", supported: true, tool: "pulse_scope", effect: "read", text: "Leads, proposals, onboarding and rebooking are run by the sales owner. Your role sees the Sales pages without changing them.", actions: [{ label: "Open Sales", target: pipeline() }] };
  }
  if (kind === "leads") {
    const open = salesOpenLeads(state).filter((v) => v.lead.stage === "new");
    const urgent = open.filter((v) => v.overdue || v.dueToday);
    const pending = salesPendingInbound(state);
    const first = pending.length ? state.sales.leads.find((l) => l.id === pending[0].leadId) : undefined;
    const text = `${plural(urgent.length, "new lead")} ${urgent.length === 1 ? "needs" : "need"} a reply today or ${urgent.length === 1 ? "is" : "are"} overdue, out of ${open.length} open.${first ? ` Start with ${first.company}: it came in at ${fmtTime(pending[0].arrivedAt)} and the first reply is due within ${pending[0].slaMinutes} minutes.` : ""}`;
    return {
      scenario: "sales_leads", supported: true, tool: "pulse_sales", effect: "read", text,
      cols: ["Lead", "Next action", "Due"],
      rows: urgent.map((v) => [v.lead.company, v.lead.nextAction, v.overdue ? "Overdue" : "Today"]),
      actions: [{ label: first ? `Open ${first.company}` : "Open the pipeline", target: pipeline(first?.id), primary: true }, { label: "Open the pipeline", target: pipeline() }],
    };
  }
  if (kind === "proposals") {
    const sent = salesLeadViews(state).filter((v) => v.lead.stage === "proposal_sent" && v.proposal);
    const total = sent.reduce((n, v) => n + (v.totals ? v.totals.totalHigh : 0), 0);
    const chase = sent.filter((v) => v.overdue || v.dueToday);
    return {
      scenario: "sales_proposals", supported: true, tool: "pulse_sales", effect: "read",
      text: `${plural(sent.length, "proposal")} ${sent.length === 1 ? "is" : "are"} with the client, worth up to ${salesEur(total)} together.${chase.length ? ` ${chase.map((v) => v.lead.company).join(" and ")} ${chase.length === 1 ? "is" : "are"} due a follow up now.` : " None is overdue for a follow up."}`,
      cols: ["Client", "Proposal", "Status", "Next action"],
      rows: sent.map((v) => [v.lead.company, v.proposal!.id, v.version ? SALES_PROPOSAL_STATUS_LABEL[v.version.status] : "", v.lead.nextActionOn ? fmtDayMonth(v.lead.nextActionOn) : ""]),
      actions: [{ label: "Open proposals", target: { page: "Sales", tab: "proposals" }, primary: true }, { label: "Open the pipeline", target: pipeline() }],
    };
  }
  if (kind === "onboarding") {
    const list = state.onboarding.onboardings;
    const live = list.filter((o) => !o.completedAt);
    return {
      scenario: "sales_onboarding", supported: true, tool: "pulse_onboarding", effect: "read",
      text: live.length
        ? `${plural(live.length, "client")} ${live.length === 1 ? "is" : "are"} being onboarded. Each one moves through details, agreements, the team hand over and the Xero contact before the welcome email goes.`
        : "No client onboarding is in progress. Start one from a won lead.",
      cols: ["Client", "Type", "Steps done"],
      rows: list.map((o) => { const p = onbProgress(o); return [o.details.companyName, ONB_KIND_LABEL[o.kind], o.completedAt ? "Complete" : `${p.done} of ${p.total}`]; }),
      actions: [{ label: "Open onboarding", target: { page: "Sales", tab: "onboarding" }, primary: true }],
    };
  }
  const recalls = salesRecalls(state).filter((r) => r.status === "overdue" || r.status === "plan_now");
  const now = recalls.filter((r) => r.status === "plan_now");
  return {
    scenario: "sales_rebooking", supported: true, tool: "pulse_retention", effect: "read",
    text: `${plural(now.length, "client")} ${now.length === 1 ? "is" : "are"} inside the three month rebooking window, and ${recalls.length - now.length} ${recalls.length - now.length === 1 ? "is" : "are"} past the anniversary without a rebooking.`,
    cols: ["Client", "Anniversary", "Status"],
    rows: recalls.map((r) => [r.company, fmtDayMonth(r.recallOn), r.status === "overdue" ? "Past due" : "Plan now"]),
    actions: [{ label: "Open retention", target: { page: "Sales", tab: "recall" }, primary: true }],
  };
}

