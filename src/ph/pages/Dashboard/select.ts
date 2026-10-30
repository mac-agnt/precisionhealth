/* Dashboard selectors. Pure functions over PhState for the Sales dashboard (Stephen) and the
   Operations dashboard (Neil and everyone else). Every figure is derived from the live store, so a
   reply sent, a proposal won or a report released moves the dashboard straight away.
   Used by the dashboard pages and by tools/verify-dash.mjs. */
import {
  ONB_RETAINER_EUR, ONB_STEP_LABEL, OH_STEPS, PROGRAMME_BY_ID, PROGRAMME_ORDER, RR_QUESTIONS, SALES_FIRST_TOUCH_MINUTES,
  addDays, awaitingLabEpisodes, correctionCandidates, daysBetween, firstReleasedAt, holdCounts, ix, labQueue, localDateOf, ohIsFullyCompleted, ohStepsDone,
  onbCurrentStep, onbProgress, onbStepsFor, openFollowUps, programmeCounts, reviewStats, salesFollowSequence, salesInboundFor, salesLatestVersion,
  salesNetTotals, salesPendingInbound, salesShiftMonths, scheduleOverlaps, sessionStats, sessionUsesPoc, sessionsBetween, startOfWeek, today, todaySessions,
} from "../../model";
import type {
  ClinicSession, LocalDate, OnbKind, OnbStepId, Onboarding, PhState, ProgrammeId, SalesFlowInbound, SalesLead, SalesProposal, SalesStage, ScreeningDay, SessionStats,
} from "../../model";
import { retClients, retRebookingRate, retReleaseQueue, retReminders } from "../Sales/onbSelect";
import type { RetReminder } from "../Sales/onbSelect";

/* ================================================================ tabs */

export type DashTab = "sales" | "operations" | "executive";
export const DASH_TABS: DashTab[] = ["sales", "operations", "executive"];
/** Old tab ids still open the nearest new tab, so earlier deep links keep working. */
export const DASH_TAB_ALIASES: Record<string, DashTab> = { "clinic-operations": "operations", "clinical-delivery": "operations" };
/** Stephen runs sales, so his dashboard opens on Sales. Everyone else opens on Operations. */
export const dashDefaultTab = (personaId: string): DashTab => (personaId === "stephen" ? "sales" : "operations");
export function dashTabFor(tab: string | undefined, personaId: string): DashTab {
  if (tab && (DASH_TABS as string[]).includes(tab)) return tab as DashTab;
  if (tab && DASH_TAB_ALIASES[tab]) return DASH_TAB_ALIASES[tab];
  return dashDefaultTab(personaId);
}

/* ================================================================ sales */

export type DashPeriod = "30d" | "month";
export const DASH_PERIOD_LABEL: Record<DashPeriod, string> = { "30d": "Last 30 days", month: "This month" };
export function periodRange(s: PhState, p: DashPeriod): { from: LocalDate; to: LocalDate; label: string } {
  const t = today(s);
  return p === "month" ? { from: `${t.slice(0, 8)}01`, to: t, label: DASH_PERIOD_LABEL.month } : { from: addDays(t, -29), to: t, label: DASH_PERIOD_LABEL["30d"] };
}
const inRange = (d: LocalDate | null | undefined, r: { from: LocalDate; to: LocalDate }) => !!d && d >= r.from && d <= r.to;

/**
 * First-touch times recorded for leads that arrived before the live 10 minute clock was switched on,
 * in minutes from the enquiry to the first reply or call (synthetic, taken as if from the Help Scout
 * conversation timestamps). A lead with a live first-touch record always uses the live record.
 */
export const RECORDED_FIRST_TOUCH: Record<string, number> = {
  "LD-0001": 6, "LD-0002": 4, "LD-0003": 23, "LD-0004": 9, "LD-0005": 7, "LD-0006": 3, "LD-0007": 14, "LD-0008": 8,
  "LD-0009": 5, "LD-0010": 12, "LD-0011": 6, "LD-0012": 9, "LD-0013": 4, "LD-0014": 8, "LD-0015": 11, "LD-0016": 17, "LD-0017": 6,
};
export interface FirstTouch { seconds: number | null; pending: boolean; live: boolean }
export function firstTouchFor(s: PhState, lead: SalesLead): FirstTouch {
  const inb = salesInboundFor(s, lead.id);
  if (inb) return { seconds: inb.firstTouchAt ? inb.responseSeconds ?? 0 : null, pending: !inb.firstTouchAt, live: true };
  const m = RECORDED_FIRST_TOUCH[lead.id];
  return { seconds: m === undefined ? null : m * 60, pending: false, live: false };
}

/** The proposal behind a lead: the latest one. Null when there is none. */
export function leadProposal(s: PhState, leadId: string): SalesProposal | null {
  const ps = s.sales.proposals.filter((p) => p.leadId === leadId);
  return ps.length ? ps[ps.length - 1] : null;
}
/** Value of a lead's latest proposal after any deal discount, upper estimate. 0 when there is no proposal. */
export function leadValue(s: PhState, leadId: string): number {
  const p = leadProposal(s, leadId);
  return p ? salesNetTotals(s, p).netHigh : 0;
}

/** When the meeting happened: meeting notes, a logged meeting, or the proposal written from it. */
export function meetingDate(s: PhState, lead: SalesLead): LocalDate | null {
  const dates: string[] = [];
  const notes = s.salesFlow?.notes[lead.id];
  if (notes) dates.push(notes.savedAt);
  const logged = lead.history.find((h) => /^Meeting:/.test(h.text));
  if (logged) dates.push(logged.at);
  const p = leadProposal(s, lead.id);
  if (p) dates.push(p.versions[0].createdAt);
  return dates.length ? localDateOf(dates.sort()[0]) : null;
}

export interface SalesPeriodStats {
  from: LocalDate; to: LocalDate; label: string;
  leads: SalesLead[];
  touched: number; withinTarget: number; touchPct: number | null; avgTouchSec: number | null; waiting: number;
  meetings: number;
  proposalsSent: Array<{ proposal: SalesProposal; lead: SalesLead; value: number }>;
  proposalsValue: number;
  won: Array<{ lead: SalesLead; value: number }>;
  wonValue: number;
  lost: number;
  winRate: number | null;
}
export function salesPeriodStats(s: PhState, period: DashPeriod): SalesPeriodStats {
  const r = periodRange(s, period);
  const leadById = new Map(s.sales.leads.map((l) => [l.id, l]));
  const leads = s.sales.leads.filter((l) => inRange(l.receivedOn, r));
  const touches = leads.map((l) => firstTouchFor(s, l));
  const done = touches.filter((t) => t.seconds !== null) as Array<FirstTouch & { seconds: number }>;
  const within = done.filter((t) => t.seconds <= SALES_FIRST_TOUCH_MINUTES * 60).length;
  const meetings = s.sales.leads.filter((l) => inRange(meetingDate(s, l), r)).length;
  const proposalsSent = s.sales.proposals
    .filter((p) => p.versions.some((v) => v.sentAt && inRange(localDateOf(v.sentAt), r)))
    .map((p) => ({ proposal: p, lead: leadById.get(p.leadId)!, value: salesNetTotals(s, p).netHigh }))
    .filter((x) => !!x.lead);
  const decided = s.sales.leads.filter((l) => (l.stage === "won" || l.stage === "lost") && inRange(localDateOf(l.stageAt), r));
  const won = decided.filter((l) => l.stage === "won").map((l) => ({ lead: l, value: leadValue(s, l.id) }));
  const lost = decided.length - won.length;
  return {
    ...r, leads, touched: done.length, withinTarget: within, touchPct: done.length ? Math.round((within / done.length) * 100) : null,
    avgTouchSec: done.length ? Math.round(done.reduce((n, t) => n + t.seconds, 0) / done.length) : null, waiting: touches.filter((t) => t.pending).length,
    meetings, proposalsSent, proposalsValue: proposalsSent.reduce((n, x) => n + x.value, 0),
    won, wonValue: won.reduce((n, x) => n + x.value, 0), lost, winRate: decided.length ? Math.round((won.length / decided.length) * 100) : null,
  };
}

export const PIPELINE_STAGES: SalesStage[] = ["new", "proposal_sent", "won", "lost"];
export function pipelineByStage(s: PhState): Array<{ stage: SalesStage; count: number; value: number }> {
  return PIPELINE_STAGES.map((stage) => {
    const ls = s.sales.leads.filter((l) => l.stage === stage);
    return { stage, count: ls.length, value: ls.reduce((n, l) => n + leadValue(s, l.id), 0) };
  });
}

/* ---- needs Stephen now ---- */
export interface WaitingProposal { lead: SalesLead; proposal: SalesProposal; value: number; sentOn: LocalDate; daysOut: number; followDue: LocalDate | null; followN: number | null; followDueThisWeek: boolean }
export interface DueAction { lead: SalesLead; text: string; due: LocalDate; overdue: boolean }
export interface StuckOnboarding { o: Onboarding; step: OnbStepId; since: LocalDate; days: number; what: string }
export interface SalesNeeds {
  inbound: Array<{ inb: SalesFlowInbound; lead: SalesLead }>;
  proposals: WaitingProposal[];
  followUpsThisWeek: number;
  actions: DueAction[];
  stuck: StuckOnboarding[];
}
/** Days an onboarding can sit on one step before it counts as stuck. */
export const ONB_STUCK_DAYS = 3;
export function onbLastMove(o: Onboarding): string {
  const t = [o.createdAt, o.detailsSavedAt, o.route?.at, o.medibase.doneAt, o.xero.createdAt, o.completedAt, o.clientLink?.sentAt, o.clientLink?.completedAt];
  for (const d of Object.values(o.docs)) if (d) t.push(d.generatedAt, d.sentAt, d.signedAt);
  return t.filter((x): x is string => !!x).sort().pop() || o.createdAt;
}
const STEP_WHAT: Record<OnbStepId, string> = {
  details: "Client details to complete", agreements: "Waiting for the DSA and SLA to be signed", team: "Hand over to the delivery team",
  medibase: "MediBase set-up to finish", xero: "Add to Xero with billing codes", done: "Send the welcome email and close",
};
export function onbStuck(s: PhState): StuckOnboarding[] {
  const t = today(s);
  return s.onboarding.onboardings.filter((o) => !o.completedAt).map((o) => {
    const since = localDateOf(onbLastMove(o));
    const step = onbCurrentStep(o);
    let what = STEP_WHAT[step];
    if (step === "agreements") {
      const unsigned = (["dsa", "sla"] as const).filter((k) => o.docs[k]?.status !== "signed").map((k) => k.toUpperCase());
      what = unsigned.length ? `Waiting for the ${unsigned.join(" and ")} to be signed` : what;
    }
    return { o, step, since, days: daysBetween(since, t), what };
  }).filter((x) => x.days > ONB_STUCK_DAYS).sort((a, b) => b.days - a.days);
}
export function salesNeeds(s: PhState): SalesNeeds {
  const t = today(s);
  const weekEnd = addDays(startOfWeek(t), 6);
  const leadById = new Map(s.sales.leads.map((l) => [l.id, l]));
  const inbound = salesPendingInbound(s).map((inb) => ({ inb, lead: leadById.get(inb.leadId)! })).filter((x) => !!x.lead);
  const proposals: WaitingProposal[] = [];
  for (const lead of s.sales.leads) {
    if (lead.stage !== "proposal_sent") continue;
    const p = leadProposal(s, lead.id);
    if (!p) continue;
    const v = salesLatestVersion(p);
    if (v.status !== "sent" || !v.sentAt) continue;
    const seq = salesFollowSequence(s, lead.id);
    const next = seq && !seq.paused && !seq.stopped ? seq.next : null;
    const sentOn = localDateOf(v.sentAt);
    proposals.push({ lead, proposal: p, value: salesNetTotals(s, p).netHigh, sentOn, daysOut: daysBetween(sentOn, t), followDue: next ? next.due : null, followN: next ? next.n : null, followDueThisWeek: !!next && next.due <= weekEnd });
  }
  proposals.sort((a, b) => (a.followDue || "9").localeCompare(b.followDue || "9") || b.daysOut - a.daysOut);
  const pending = new Set(inbound.map((x) => x.lead.id));
  const actions: DueAction[] = s.sales.leads
    .filter((l) => l.stage === "new" && !pending.has(l.id) && !!l.nextActionOn && l.nextActionOn <= weekEnd)
    .map((l) => ({ lead: l, text: l.nextAction, due: l.nextActionOn!, overdue: l.nextActionOn! < t }))
    .sort((a, b) => a.due.localeCompare(b.due));
  return { inbound, proposals, followUpsThisWeek: proposals.filter((p) => p.followDueThisWeek).length, actions, stuck: onbStuck(s) };
}

/* ---- onboarding in progress ---- */
export interface OnbRow { id: string; name: string; kind: OnbKind; stepLabel: string; done: number; total: number; source: "sales" | "occ"; link: { page: "Sales" | "OccHealth"; tab: string; params: Record<string, string> } }
export function onboardingRows(s: PhState): Record<OnbKind, OnbRow[]> {
  const out: Record<OnbKind, OnbRow[]> = { oh: [], wellness: [] };
  for (const o of s.onboarding.onboardings) {
    if (o.completedAt) continue;
    const pr = onbProgress(o);
    const step = onbCurrentStep(o);
    out[o.kind].push({ id: o.id, name: o.details.companyName.replace(/\s*\(fictional\)/, "") || o.id, kind: o.kind, stepLabel: ONB_STEP_LABEL[step], done: pr.done, total: onbStepsFor(o.kind).length, source: "sales", link: { page: "Sales", tab: "onboarding", params: { onb: o.id } } });
  }
  for (const c of s.occHealth.clients) {
    if (ohIsFullyCompleted(c)) continue;
    const next = OH_STEPS.find((st) => c.steps[st.step].status !== "done");
    out.oh.push({ id: c.id, name: c.name, kind: "oh", stepLabel: next ? next.column : "Done", done: ohStepsDone(c), total: OH_STEPS.length, source: "occ", link: { page: "OccHealth", tab: "clients", params: { client: c.id } } });
  }
  return out;
}

/* ---- retention ---- */
export interface RetentionStats {
  rate: ReturnType<typeof retRebookingRate>;
  remindersDue: RetReminder[];
  resultsOut: ReturnType<typeof retReleaseQueue>;
  left: Array<{ company: string; name: string; leftOn: LocalDate; replaced: boolean }>;
}
export function retentionStats(s: PhState): RetentionStats {
  const t = today(s);
  const horizon = salesShiftMonths(t, 3);
  const remindersDue = retReminders(s).filter((r) => r.state !== "sent" && r.dueOn <= horizon);
  const left = retClients(s).flatMap((c) => c.left.map((x) => ({ company: c.company, name: x.name, leftOn: x.leftOn, replaced: !!c.current })));
  return { rate: retRebookingRate(s), remindersDue, resultsOut: retReleaseQueue(s), left };
}

/* ---- revenue ---- */
export interface RevenueStats {
  year: number;
  wonYear: number; wonScreening: number; wonOther: number; wonCount: number; wonNoPrice: number;
  ohActive: number; ohActiveClients: number; ohPending: number; ohPendingClients: number;
  ilhAwaiting: number; ilhAwaitingCount: number;
}
export function revenueStats(s: PhState): RevenueStats {
  const t = today(s);
  const year = Number(t.slice(0, 4));
  const won = s.sales.leads.filter((l) => l.stage === "won" && localDateOf(l.stageAt).startsWith(String(year)));
  let wonScreening = 0, wonOther = 0, wonNoPrice = 0;
  for (const l of won) {
    const v = leadValue(s, l.id);
    if (!leadProposal(s, l.id)) wonNoPrice++;
    if (l.services.includes("health_screening")) wonScreening += v; else wonOther += v;
  }
  const ohDone = s.occHealth.clients.filter(ohIsFullyCompleted);
  const ohOpen = s.occHealth.clients.filter((c) => !ohIsFullyCompleted(c));
  const onbOh = s.onboarding.onboardings.filter((o) => o.kind === "oh" && ONB_RETAINER_EUR[o.xero.billing] > 0);
  const onbActive = onbOh.filter((o) => !!o.completedAt);
  const onbPending = onbOh.filter((o) => !o.completedAt);
  const awaiting = s.sales.ilh.filter((b) => !b.archived && b.payment === "awaiting_payment" && b.invoice);
  return {
    year, wonYear: wonScreening + wonOther, wonScreening, wonOther, wonCount: won.length, wonNoPrice,
    ohActive: ohDone.reduce((n, c) => n + c.meddbaseFeeEur, 0) + onbActive.reduce((n, o) => n + ONB_RETAINER_EUR[o.xero.billing], 0),
    ohActiveClients: ohDone.length + onbActive.length,
    ohPending: ohOpen.reduce((n, c) => n + c.meddbaseFeeEur, 0) + onbPending.reduce((n, o) => n + ONB_RETAINER_EUR[o.xero.billing], 0),
    ohPendingClients: ohOpen.length + onbPending.length,
    ilhAwaiting: awaiting.reduce((n, b) => n + (b.invoice?.amount || 0), 0), ilhAwaitingCount: awaiting.length,
  };
}

/* ---- clinic days ---- */
export interface DayRow { session: ClinicSession; st: SessionStats; poc: boolean; day: ScreeningDay | null; status: "draft" | "published"; nurse: string; nurseClash: boolean; roomTbc: boolean }
export function dayRows(s: PhState, from: LocalDate, to: LocalDate): DayRow[] {
  const I = ix(s);
  const clash = new Set(scheduleOverlaps(s).filter((o) => o.kind === "nurse").flatMap((o) => [o.a, o.b]));
  return sessionsBetween(s, from, to).map((x) => {
    const day = s.screeningDays.days.find((d) => d.sessionId === x.id) || null;
    return {
      session: x, st: sessionStats(s, x.id), poc: sessionUsesPoc(x), day, status: day ? day.status : "published",
      nurse: I.staffById.get(x.nurseId)?.name || "No nurse yet", nurseClash: clash.has(x.id), roomTbc: !x.room || /to be confirmed/i.test(x.room),
    };
  });
}
/** Screening days still to come this month (after today). */
export const salesUpcomingDays = (s: PhState): DayRow[] => {
  const t = today(s);
  const monthEnd = addDays(salesShiftMonths(`${t.slice(0, 8)}01`, 1), -1);
  return dayRows(s, addDays(t, 1), monthEnd);
};

/* ================================================================ operations */

export interface OpsStats {
  today: DayRow[];
  todayBooked: number; todayCapacity: number; todayPoc: number; todayLab: number;
  labRows: ReturnType<typeof labQueue>;
  awaitingLab: number;
  ready: number; over48: number; buckets: { lt24: number; h24to48: number; h48to72: number; gt72: number };
  releasedWeek: number; sameDayPoc: number;
  next14: DayRow[]; next14Booked: number; next14Capacity: number; next14Drafts: number; next14CoverGaps: number;
  dataQuality: number; corrections: number; followUps: number; followUpsOverdue: number; rangeQuestions: number;
  programmes: Array<{ id: ProgrammeId; name: string; client: string; invited: number; booked: number; attended: number; released: number }>;
}
export function opsStats(s: PhState): OpsStats {
  const t = today(s);
  const I = ix(s);
  const todayRows = todaySessions(s).map((x) => dayRows(s, t, t).find((r) => r.session.id === x.id)!).filter(Boolean);
  const rv = reviewStats(s);
  /* Released in the last 7 days, and of those, point of care reports released on the clinic day. */
  const weekFrom = addDays(t, -6);
  let releasedWeek = 0, sameDayPoc = 0;
  for (const e of s.episodes) {
    if (e.reportState !== "released") continue;
    const at = firstReleasedAt(s, e.id);
    if (!at) continue;
    const d = localDateOf(at);
    if (d < weekFrom || d > t) continue;
    releasedWeek++;
    const sess = I.sessionById.get(e.sessionId);
    if (sess && sessionUsesPoc(sess) && d === sess.date) sameDayPoc++;
  }
  const next14 = dayRows(s, addDays(t, 1), addDays(t, 14));
  const fu = openFollowUps(s);
  const answered = s.referenceRanges.questions;
  return {
    today: todayRows,
    todayBooked: todayRows.reduce((n, r) => n + r.st.booked, 0), todayCapacity: todayRows.reduce((n, r) => n + r.st.slots, 0),
    todayPoc: todayRows.filter((r) => r.poc).length, todayLab: todayRows.filter((r) => !r.poc).length,
    labRows: labQueue(s), awaitingLab: awaitingLabEpisodes(s).length,
    ready: rv.ready, over48: rv.aged, buckets: rv.buckets, releasedWeek, sameDayPoc,
    next14, next14Booked: next14.reduce((n, r) => n + r.st.booked, 0), next14Capacity: next14.reduce((n, r) => n + r.st.slots, 0),
    next14Drafts: next14.filter((r) => r.status === "draft").length, next14CoverGaps: next14.filter((r) => r.nurseClash || !r.session.nurseId).length,
    dataQuality: holdCounts(s).dataQuality,
    corrections: correctionCandidates(s).filter((c) => !!c.draft).length,
    followUps: fu.length, followUpsOverdue: fu.filter((f) => f.overdue).length,
    rangeQuestions: RR_QUESTIONS.filter((q) => answered[q.id]?.status !== "answered").length,
    programmes: PROGRAMME_ORDER.map((id) => {
      const c = programmeCounts(s, id);
      return { id, name: PROGRAMME_BY_ID[id].name, client: PROGRAMME_BY_ID[id].clientName, invited: c.invited, booked: c.booked, attended: c.attended, released: c.released };
    }),
  };
}

/** "€12,400" with no decimals. */
export const eur = (n: number) => "€" + Math.round(n).toLocaleString("en-IE");
/** "4m 12s" or "38s". */
export function fmtSecs(sec: number): string {
  const v = Math.max(0, Math.round(sec));
  const h = Math.floor(v / 3600), m = Math.floor((v % 3600) / 60), x = v % 60;
  return h ? `${h}h ${m}m` : m ? `${m}m ${String(x).padStart(2, "0")}s` : `${x}s`;
}
