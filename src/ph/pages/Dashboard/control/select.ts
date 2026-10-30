/* Control panel selectors. Everything Neil can act on, across every service, as plain rows: what it
   is, which service and client it belongs to, whether it is urgent, and the record it acts on. The
   page turns each row kind into its inline buttons. Pure functions over PhState, so a click that
   changes the store changes the counts on the next render. Used by ControlPanel.tsx and
   tools/verify-control.mjs. */
import {
  FLU_ILH_SAMPLES, FLU_SEASON_CURRENT, PROGRAMME_BY_ID, RR_QUESTIONS,
  addDays, awaitingLabEpisodes, fluBatchUse, fluColdChainRows, fluStock, ix, labQueue, ohAgreementsStage, ohDiarySlots, ohIsFullyCompleted,
  ohStepsDone, onbCurrentStep, publishBlockers, openFollowUps, OH_STEPS, ONB_STEP_LABEL, routineEligibility, rotaConflictsBetween, rotaItemsOn, rotaUnstaffed, startOfWeek, today,
} from "../../../model";
import type {
  Episode, ExpenseRequest, FluBatch, FluClinic, FluColdChainRow, FluStock, LocalDate, OhAgreementsStage, OhClient, OhDiary, Onboarding, PhState, RotaConflict, RotaItem, ScreeningDay,
} from "../../../model";
import type { FollowUpView } from "../../../model";
import { missingEods } from "../../Clinics/EndOfDay";
import type { MissingEod } from "../../Clinics/EndOfDay";
import { dayRows } from "../select";
import type { DayRow } from "../select";

export type Service = "screening" | "flu" | "oh" | "team";
export const SERVICES: Service[] = ["screening", "flu", "oh", "team"];
export const SERVICE_LABEL: Record<Service, string> = { screening: "Screening", flu: "Flu", oh: "Occupational health", team: "Team" };
export type ServiceFilter = "all" | Service;
export const isServiceFilter = (v: unknown): v is ServiceFilter => v === "all" || SERVICES.includes(v as Service);

/* ---- the row kinds, one per inline action set ---- */
type Base = { id: string; service: Service; group: string; client: string; urgent: boolean };
export type CtlRow = Base & (
  | { kind: "lab"; item: ReturnType<typeof labQueue>[number] }
  | { kind: "enter"; episode: Episode; name: string }
  | { kind: "review"; episode: Episode; name: string; routine: boolean; hours: number }
  | { kind: "followup"; fu: FollowUpView }
  | { kind: "day"; day: DayRow; screeningDay: ScreeningDay | null; rota: RotaItem | null; blocked: string | null }
  | { kind: "rrq"; q: (typeof RR_QUESTIONS)[number] }
  | { kind: "flu"; clinic: FluClinic; rota: RotaItem | null; canRecord: boolean }
  | { kind: "stock"; stock: FluStock; short: number; nextOrderId: string | null }
  | { kind: "cold"; row: FluColdChainRow }
  | { kind: "ilh"; sample: (typeof FLU_ILH_SAMPLES)[number]; remaining: number }
  | { kind: "ohSession"; diary: OhDiary; missing: string[]; toSend: string[]; booked: number }
  | { kind: "ohClient"; name: string; step: string; done: number; total: number; ohClientId: string | null; onbId: string | null }
  | { kind: "ohAgreement"; oh: OhClient; stage: OhAgreementsStage }
  | { kind: "onbDoc"; onb: Onboarding; doc: "dsa" | "sla"; status: "draft" | "sent" }
  | { kind: "conflict"; conflict: RotaConflict; staffName: string }
  | { kind: "unstaffed"; item: RotaItem }
  | { kind: "expense"; expense: ExpenseRequest; staffName: string }
  | { kind: "eod"; eod: MissingEod; staffName: string; chasedAt: string | null }
);

/** The groups inside each service, in the order they are shown. */
export const GROUPS: Record<Service, Array<{ id: string; title: string; empty: string }>> = {
  screening: [
    { id: "lab", title: "Lab rows to match", empty: "Every lab row is matched." },
    { id: "review", title: "Ready for review", empty: "No reports waiting for review." },
    { id: "followup", title: "Urgent follow-ups", empty: "No urgent calls open." },
    { id: "enter", title: "Results waiting", empty: "No results waiting." },
    { id: "day", title: "Screening days", empty: "No screening days in the next 14 days." },
    { id: "rrq", title: "Range questions to confirm", empty: "Every range question is answered." },
  ],
  flu: [
    { id: "flu", title: "Flu clinics, next 14 days", empty: "No flu clinics in the next 14 days." },
    { id: "stock", title: "Vaccine stock", empty: "" },
    { id: "cold", title: "Cold chain alerts", empty: "No cold chain readings outside 2 to 8 °C waiting." },
    { id: "ilh", title: "Irish Life flu bookings", empty: "No new Irish Life flu bookings to accept." },
  ],
  oh: [
    { id: "ohSession", title: "MediBase sessions this week", empty: "No MediBase sessions this week." },
    { id: "ohAgreement", title: "Agreements to sign", empty: "Every agreement is signed." },
    { id: "ohClient", title: "Clients onboarding", empty: "No clients onboarding." },
  ],
  team: [
    { id: "conflict", title: "Rota conflicts", empty: "No nurse is double-booked or booked on leave." },
    { id: "unstaffed", title: "Work with no nurse", empty: "Every clinic in the next 14 days has a nurse." },
    { id: "expense", title: "Hotel and subsistence approvals", empty: "No claims waiting." },
    { id: "eod", title: "End of day forms missing", empty: "Every past clinic day has its form." },
  ],
};

const progClient = (id: string) => PROGRAMME_BY_ID[id as keyof typeof PROGRAMME_BY_ID]?.clientName || id;
const staffName = (s: PhState, id: string | null | undefined) => (id ? s.staff.find((x) => x.id === id)?.name || id : "Nobody");
export const rotaItemFor = (s: PhState, key: string, date: LocalDate | null): RotaItem | null => (date ? rotaItemsOn(s, date).find((x) => x.key === key) || null : null);

/** Batches received this season with doses left, for recording actuals. */
export function fluBatchesLeft(s: PhState): Array<{ batch: FluBatch; remaining: number }> {
  return s.flu.batches.filter((b) => b.season === FLU_SEASON_CURRENT).map((b) => ({ batch: b, remaining: fluBatchUse(s.flu, b.id)?.remaining || 0 })).filter((x) => x.remaining > 0);
}

/** Every row on the control panel, for every service. */
export function controlRows(s: PhState): CtlRow[] {
  const t = today(s);
  const I = ix(s);
  const out: CtlRow[] = [];
  const name = (personId: string) => { const p = I.personById.get(personId); return p ? `${p.given} ${p.family}` : personId; };

  /* ---------- screening ---------- */
  for (const q of labQueue(s)) {
    out.push({ id: `lab:${q.key}`, service: "screening", group: "lab", client: q.candidate ? progClient(q.candidate.programmeId) : "", urgent: true, kind: "lab", item: q });
  }
  const now = Date.parse(s.clock.nowUtc);
  const ready = s.episodes.filter((e) => e.reportState === "ready_for_review")
    .map((e) => ({ e, hours: e.readyAt ? Math.floor((now - Date.parse(e.readyAt)) / 3600000) : 0 }))
    .sort((a, b) => b.hours - a.hours);
  for (const { e, hours } of ready) {
    out.push({ id: `review:${e.id}`, service: "screening", group: "review", client: progClient(e.programmeId), urgent: hours >= 48, kind: "review", episode: e, name: name(e.personId), routine: routineEligibility(s, e).ok, hours });
  }
  for (const f of openFollowUps(s)) {
    out.push({ id: `followup:${f.followUp.id}`, service: "screening", group: "followup", client: progClient(f.followUp.programmeId), urgent: true, kind: "followup", fu: f });
  }
  for (const e of awaitingLabEpisodes(s)) {
    out.push({ id: `enter:${e.id}`, service: "screening", group: "enter", client: progClient(e.programmeId), urgent: false, kind: "enter", episode: e, name: name(e.personId) });
  }
  const horizon = addDays(t, 14);
  const days = dayRows(s, addDays(t, 1), horizon);
  const seen = new Set(days.map((d) => d.session.id));
  /* Drafts further out are still waiting to be published, so they show too. */
  for (const d of s.screeningDays.days) {
    if (d.status !== "draft" || d.date <= t || seen.has(d.sessionId)) continue;
    const r = dayRows(s, d.date, d.date).find((x) => x.session.id === d.sessionId);
    if (r) { days.push(r); seen.add(r.session.id); }
  }
  for (const r of days.sort((a, b) => a.session.date.localeCompare(b.session.date))) {
    const sd = s.screeningDays.days.find((d) => d.sessionId === r.session.id) || null;
    const rota = rotaItemFor(s, `session:${r.session.id}`, r.session.date);
    const soon = r.session.date <= addDays(t, 7);
    out.push({ id: `day:${r.session.id}`, service: "screening", group: "day", client: r.st.programme.clientName, urgent: soon && (r.status === "draft" || !r.session.nurseId || r.nurseClash), kind: "day", day: r, screeningDay: sd, rota, blocked: sd && sd.status === "draft" ? publishBlockers(sd)[0] || null : null });
  }
  for (const q of RR_QUESTIONS) {
    if (s.referenceRanges.questions[q.id]?.status === "answered") continue;
    out.push({ id: `rrq:${q.id}`, service: "screening", group: "rrq", client: "", urgent: false, kind: "rrq", q });
  }

  /* ---------- flu ---------- */
  const fluTo = addDays(t, 13);
  const eods = s.nurseOps.endOfDay;
  for (const c of s.flu.clinics) {
    if (c.season !== FLU_SEASON_CURRENT || c.status !== "scheduled" || !c.date) continue;
    const due = c.date <= t;
    if (!due && c.date > fluTo) continue;
    const rota = rotaItemFor(s, `flu:${c.id}`, c.date);
    out.push({ id: `flu:${c.id}`, service: "flu", group: "flu", client: c.company, urgent: due || (!c.staffIds.length && !c.rotaNurses && c.date <= addDays(t, 7)), kind: "flu", clinic: c, rota, canRecord: due });
  }
  const st = fluStock(s.flu, FLU_SEASON_CURRENT);
  const next = s.flu.orders.filter((o) => o.season === FLU_SEASON_CURRENT && o.status === "on_order").sort((a, b) => a.expectedOn.localeCompare(b.expectedOn))[0] || null;
  const short = Math.max(0, st.allocated + st.requested - (st.onHand + st.onOrder));
  out.push({ id: "stock", service: "flu", group: "stock", client: "", urgent: st.free < 0 && (!next || next.expectedOn <= addDays(t, 7)) || short > 0, kind: "stock", stock: st, short, nextOrderId: next ? next.id : null });
  for (const r of fluColdChainRows(s.flu, eods)) {
    if (!r.excursions.length || r.followUps.length) continue;
    out.push({ id: `cold:${r.key}`, service: "flu", group: "cold", client: r.company.split(",")[0], urgent: r.season === FLU_SEASON_CURRENT, kind: "cold", row: r });
  }
  const sample = FLU_ILH_SAMPLES[s.flu.intake.ilh];
  if (sample && sample.date >= t) {
    out.push({ id: `ilh:${s.flu.intake.ilh}`, service: "flu", group: "ilh", client: sample.company, urgent: false, kind: "ilh", sample, remaining: FLU_ILH_SAMPLES.length - s.flu.intake.ilh });
  }

  /* ---------- occupational health ---------- */
  const wkFrom = startOfWeek(t), wkTo = addDays(wkFrom, 6);
  for (const d of s.occHealth.diaries) {
    if (d.date < wkFrom || d.date > wkTo) continue;
    const v = ohDiarySlots(s, d).filter((x) => x.slot.kind === "booked");
    const missing = v.filter((x) => !x.received).map((x) => x.slot.id);
    const toSend = v.filter((x) => x.received && !x.inMeddbase).map((x) => x.submission!.id);
    const client = s.occHealth.clients.find((c) => c.id === d.clientId)?.name || d.clientId;
    out.push({ id: `ohs:${d.id}`, service: "oh", group: "ohSession", client, urgent: d.date <= addDays(t, 1) && (missing.length > 0 || toSend.length > 0), kind: "ohSession", diary: d, missing, toSend, booked: v.length });
  }
  for (const c of s.occHealth.clients) {
    if (ohIsFullyCompleted(c)) continue;
    const stage = ohAgreementsStage(s, c.id);
    if (stage !== "signed") out.push({ id: `oha:${c.id}`, service: "oh", group: "ohAgreement", client: c.name, urgent: false, kind: "ohAgreement", oh: c, stage });
    const nextStep = OH_STEPS.find((x) => c.steps[x.step].status !== "done");
    out.push({ id: `ohc:${c.id}`, service: "oh", group: "ohClient", client: c.name, urgent: false, kind: "ohClient", name: c.name, step: nextStep ? nextStep.column : "Done", done: ohStepsDone(c), total: OH_STEPS.length, ohClientId: c.id, onbId: null });
  }
  for (const o of s.onboarding.onboardings) {
    if (o.completedAt) continue;
    const company = o.details.companyName.replace(/\s*\(fictional\)/, "") || o.id;
    for (const k of ["dsa", "sla"] as const) {
      const d = o.docs[k];
      if (d && (d.status === "draft" || d.status === "sent")) out.push({ id: `onbdoc:${o.id}:${k}`, service: "oh", group: "ohAgreement", client: company, urgent: false, kind: "onbDoc", onb: o, doc: k, status: d.status });
    }
    const step = onbCurrentStep(o);
    out.push({ id: `onb:${o.id}`, service: "oh", group: "ohClient", client: company, urgent: false, kind: "ohClient", name: company, step: `${o.kind === "oh" ? "Occupational health" : "Wellness"}: ${ONB_STEP_LABEL[step]}`, done: 0, total: 0, ohClientId: null, onbId: o.id });
  }

  /* ---------- team ---------- */
  const teamTo = addDays(t, 13);
  for (const c of rotaConflictsBetween(s, t, teamTo)) {
    out.push({ id: `conflict:${c.staffId}:${c.date}:${c.keys.join("|")}`, service: "team", group: "conflict", client: "", urgent: true, kind: "conflict", conflict: c, staffName: staffName(s, c.staffId) });
  }
  for (const it of rotaUnstaffed(s, t, teamTo)) {
    out.push({ id: `unstaffed:${it.key}`, service: "team", group: "unstaffed", client: it.client, urgent: it.date <= addDays(t, 7), kind: "unstaffed", item: it });
  }
  for (const e of s.gaps.expenses) {
    if (e.status !== "pending") continue;
    out.push({ id: `expense:${e.id}`, service: "team", group: "expense", client: e.clientLocation.split(",")[0], urgent: e.date <= addDays(t, 7) && e.date >= t, kind: "expense", expense: e, staffName: staffName(s, e.staffId) });
  }
  const chased = s.control?.chased || {};
  for (const m of missingEods(s)) {
    out.push({ id: `eod:${m.key}`, service: "team", group: "eod", client: m.label.split(",")[0], urgent: false, kind: "eod", eod: m, staffName: staffName(s, m.staffId), chasedAt: chased[m.key]?.at || null });
  }
  return out;
}

export interface ControlFilter { service: ServiceFilter; client: string; urgent: boolean }
export function filterRows(rows: CtlRow[], f: ControlFilter): CtlRow[] {
  return rows.filter((r) => (f.service === "all" || r.service === f.service) && (!f.client || r.client === f.client) && (!f.urgent || r.urgent));
}

/** Rows that need someone to act. The stock summary row counts only when stock is short. */
export const isOpen = (r: CtlRow) => r.kind !== "stock" || r.urgent;

export interface ServiceCount { open: number; urgent: number }
export function serviceCounts(rows: CtlRow[]): Record<Service, ServiceCount> {
  const out = Object.fromEntries(SERVICES.map((x) => [x, { open: 0, urgent: 0 }])) as Record<Service, ServiceCount>;
  for (const r of rows) {
    if (!isOpen(r)) continue;
    out[r.service].open++;
    if (r.urgent) out[r.service].urgent++;
  }
  return out;
}

/** Client names on the rows, for the client filter. */
export const clientOptions = (rows: CtlRow[]) => Array.from(new Set(rows.map((r) => r.client).filter(Boolean))).sort((a, b) => a.localeCompare(b));

