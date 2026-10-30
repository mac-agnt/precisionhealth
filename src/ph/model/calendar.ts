/* One business calendar (Calendar page, and Clinics, Schedule prefiltered to clinics).
   Every dated thing in the store is gathered into one CalEvent shape by a list of sources.

   HOW TO ADD A SOURCE (one entry, nothing else to change):
   1. Append an object to CAL_SOURCES below: { id, kinds, collect }.
      - kinds: the event kinds this source produces, each with a friendly label, a filter group
        (one of CAL_GROUPS, or add a new group there) and a colour.
      - collect(state): returns CalEvent[] built from the state. Keep it pure and deterministic.
   2. Give every event a link (a NavTarget whose page is in PAGES) so "Open" goes to the record.
   That is all: filters, counts, colours, the legend and the verify script pick it up.

   Pure module: no React, no dispatch. Dates are Europe/Dublin local dates and HH:MM times. */
import type { Hhmm, LocalDate } from "./time";
import { addDays, fmtDate, localDateOf, localTimeOf, startOfWeek } from "./time";
import type { PhState, StaffId } from "./types";
import type { NavTarget } from "./nav";
import { SALES_ILH_REQUESTED_LABEL, SALES_RECALL_STATUS_LABEL, SALES_SERVICE_LABEL, SALES_TENDER_STATUS_LABEL, salesRecalls } from "./sales";
import { salesFollowSequence } from "./salesFlow";
import { sessionStats, today, visibleTasks } from "./selectors";
import { schedDays, schedForCalId, schedItems, schedStatusLabel, schedTemplate } from "./scheduledActions";
import { drHours } from "./dateRequests";

/* ================================================================================================
   Shape
   ================================================================================================ */

export interface CalEvent {
  /** Unique across the calendar, e.g. "session:CLN-IBM-20261106". */
  id: string;
  kind: string;
  title: string;
  /** Local date the event is on. */
  date: LocalDate;
  /** "YYYY-MM-DD" for all-day events, "YYYY-MM-DDTHH:MM" for timed ones. */
  start: string;
  /** Same format as start, when the event has an end. */
  end?: string;
  allDay: boolean;
  /** Start and end times for timed events, for display and layout. */
  time?: { start: Hhmm; end: Hhmm | null };
  /** For all-day items with a due time (tasks, automation runs): shown as "Due 09:00", kept out of the time grid. */
  due?: Hhmm;
  /** Client or company name. */
  client?: string;
  staffIds: StaffId[];
  location?: string;
  /** Short plain status, e.g. "Draft", "Published", "Completed", "Overdue". */
  status?: string;
  /** Status tone for the pill. */
  tone?: "ok" | "warn" | "bad" | "info" | "neutral";
  /** One or two short facts, e.g. "18 of 24 booked". */
  detail?: string;
  /** Where "Open" goes. */
  link: NavTarget;
  /** Label for the Open button, e.g. "Open session". */
  openLabel: string;
  /** A second place worth opening, e.g. the clinic session behind a screening day. */
  secondary?: { label: string; link: NavTarget };
  /** Clinic session behind the event, so the Schedule can open its session panel directly. */
  sessionId?: string;
  /** Screening programme behind the event, so the event card can link to it. */
  programmeId?: string;
  /** Draft and other not-yet-confirmed items are drawn with a dashed outline. */
  tentative?: boolean;
  /** Finished items are drawn quieter. */
  done?: boolean;
  /** Set when the item was scheduled from the Calendar ("+ Schedule"): its SA- id and who scheduled it. */
  schedId?: string;
  scheduledBy?: StaffId;
  /** True when the event can be dragged to another day or time. */
  movable?: boolean;
}

export interface CalGroup { id: string; label: string; color: string; hint: string }
export interface CalKind { id: string; label: string; group: string; color: string }
export interface CalSource { id: string; kinds: CalKind[]; collect: (state: PhState) => CalEvent[] }

/** Filter groups, in the order the filter panel lists them. */
export const CAL_GROUPS: CalGroup[] = [
  { id: "clinics", label: "Clinics and screening days", color: "#3E9E93", hint: "Clinic sessions, screening days and client bookings" },
  { id: "flu", label: "Flu", color: "#E0A030", hint: "Flu clinics and vaccine deliveries" },
  { id: "oh", label: "Occupational health", color: "#A06CE0", hint: "MediBase clinic diaries" },
  { id: "ilh", label: "Irish Life Health", color: "#E0608A", hint: "Partner screenings" },
  { id: "sales", label: "Sales", color: "#4FAE73", hint: "Lead actions, calls, follow ups and tenders" },
  { id: "onboarding", label: "Onboarding", color: "#2F8FB3", hint: "New clients being onboarded" },
  { id: "retention", label: "Retention", color: "#EB7F3C", hint: "Rebooking dates for past clients" },
  { id: "tasks", label: "Tasks", color: "#7E8FA3", hint: "Work tasks with a due date" },
  { id: "reporting", label: "Report deadlines", color: "#5F7FE0", hint: "Employer report drafts due" },
  { id: "team", label: "Team, training and leave", color: "#7A6FD0", hint: "Staff training and leave. Leave blocks that person from clinics." },
  { id: "automations", label: "Automations", color: "#8F9A96", hint: "Scheduled reminders, imports and checkpoints" },
];
/** Groups hidden until someone ticks them. */
export const CAL_DEFAULT_OFF = ["automations"];

/* ================================================================================================
   Helpers
   ================================================================================================ */

const dt = (d: LocalDate, t?: Hhmm | null) => (t ? `${d}T${t}` : d);
function timed(date: LocalDate, s: Hhmm | null | undefined, e?: Hhmm | null): Pick<CalEvent, "date" | "start" | "end" | "allDay" | "time"> {
  if (!s) return { date, start: date, allDay: true };
  return { date, start: dt(date, s), end: e ? dt(date, e) : undefined, allDay: false, time: { start: s, end: e || null } };
}
const addMins = (t: Hhmm, n: number): Hhmm => {
  const [h, m] = t.split(":").map(Number);
  const v = Math.min(23 * 60 + 59, h * 60 + m + n);
  return `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;
};
const isoParts = (iso: string) => ({ date: localDateOf(iso), time: localTimeOf(iso) });
/** An all-day item with a due time: listed with the day's all-day items, sorted by the time. */
const dueAt = (date: LocalDate, t: Hhmm): Pick<CalEvent, "date" | "start" | "allDay" | "due"> => ({ date, start: dt(date, t), allDay: true, due: t });

/* ================================================================================================
   Sources
   ================================================================================================ */

export const CAL_SOURCES: CalSource[] = [
  /* Clinic sessions and the screening days that sit on them: one event per session, never per booking. */
  {
    id: "sessions",
    kinds: [
      { id: "screening_day", label: "Screening day", group: "clinics", color: "#3B8FD9" },
      { id: "clinic_session", label: "Clinic session", group: "clinics", color: "#3E9E93" },
    ],
    collect: (state) => {
      const t = today(state);
      const dayBySession = new Map(state.screeningDays.days.map((d) => [d.sessionId, d]));
      return state.sessions.filter((s) => s.status !== "cancelled").map((s) => {
        const st = sessionStats(state, s.id);
        const day = dayBySession.get(s.id);
        const past = s.date < t;
        const where = [s.room, s.siteName].filter(Boolean).join(", ");
        const base = {
          ...timed(s.date, s.start, s.end), client: st.programme.clientName, staffIds: [s.nurseId, ...s.supportIds], location: where,
          detail: `${st.booked} of ${st.slots} booked`, sessionId: s.id, programmeId: s.programmeId, done: past,
        };
        const sessionLink: NavTarget = { page: "Clinics", tab: "schedule", params: { session: s.id, date: s.date } };
        if (day) {
          return {
            ...base, id: `day:${day.id}`, kind: "screening_day", title: `${st.programme.clientName} screening day`,
            status: day.status === "draft" ? "Draft" : past ? "Completed" : "Published", tone: day.status === "draft" ? "warn" : past ? "ok" : "info",
            link: { page: "Clinics", tab: "days", params: { day: day.id } }, openLabel: "Open screening day",
            secondary: { label: "Session details", link: sessionLink }, tentative: day.status === "draft",
          } as CalEvent;
        }
        return {
          ...base, id: `session:${s.id}`, kind: "clinic_session", title: `${st.programme.clientName} clinic`,
          status: past ? "Completed" : st.isToday ? "Today" : "Scheduled", tone: past ? "ok" : st.isToday ? "info" : "neutral",
          link: sessionLink, openLabel: "Open session",
        } as CalEvent;
      });
    },
  },
  /* Client days on the nurses' bookings board that are not Pulse clinic sessions yet. One event per day. */
  {
    id: "board",
    kinds: [{ id: "client_booking", label: "Client booking", group: "clinics", color: "#8FA7BF" }],
    collect: (state) => state.nurseOps.board.flatMap((b) => b.dates.map((d, i) => {
      const lead = state.sales.leads.find((l) => l.company.toLowerCase() === b.client.toLowerCase());
      const link: NavTarget = lead ? { page: "Sales", tab: "pipeline", params: { lead: lead.id } } : { page: "Clinics", tab: "overview" };
      return {
        id: `board:${b.id}:${d}`, kind: "client_booking", ...timed(d, b.start, b.end),
        title: `${b.client}: ${b.logistics.screeningType}${b.dates.length > 1 ? ` (day ${i + 1} of ${b.dates.length})` : ""}`,
        client: b.client, staffIds: b.staffIds, location: b.room || b.logistics.address || undefined,
        status: b.logistics.status, tone: b.logistics.status === "Ready to go" ? "ok" : "neutral",
        detail: b.logistics.service || undefined, link, openLabel: lead ? "Open client in Sales" : "Open Clinics", tentative: b.logistics.status !== "Ready to go",
        done: d < today(state),
      } as CalEvent;
    })),
  },
  /* Flu clinics (one per clinic) and vaccine deliveries. Requests without a date wait off the calendar. */
  {
    id: "flu",
    kinds: [
      { id: "flu_clinic", label: "Flu clinic", group: "flu", color: "#E0A030" },
      { id: "flu_delivery", label: "Vaccine delivery", group: "flu", color: "#C7882A" },
    ],
    collect: (state) => {
      const clinics = state.flu.clinics.filter((c) => c.date && c.status !== "cancelled" && c.status !== "requested").map((c) => ({
        id: `flu:${c.id}`, kind: "flu_clinic", ...timed(c.date!, c.start, null),
        title: `${c.company} flu clinic`, client: c.company, staffIds: c.staffIds, location: c.address,
        status: c.status === "completed" ? "Completed" : "Scheduled", tone: c.status === "completed" ? "ok" : "neutral",
        detail: c.actual !== null ? `${c.actual} vaccinated of ${c.projected} expected` : `${c.projected} expected${c.channel === "ilh" ? ", Irish Life Health" : ""}`,
        link: { page: "Flu", tab: "bookings", params: { clinic: c.id } }, openLabel: "Open flu bookings", done: c.status === "completed", movable: c.status === "scheduled",
      } as CalEvent));
      const orders = state.flu.orders.map((o) => {
        const on = o.deliveredOn || o.expectedOn;
        return {
          id: `fluorder:${o.id}`, kind: "flu_delivery", ...timed(on, null), title: `Vaccine delivery: ${o.quantity.toLocaleString("en-IE")} doses`,
          client: undefined, staffIds: [], location: o.supplier, status: o.deliveredOn ? "Delivered" : "Expected", tone: o.deliveredOn ? "ok" : "info",
          detail: `${o.id} from ${o.supplier}`, link: { page: "Flu", tab: "stock", params: { order: o.id } }, openLabel: "Open vaccine stock", done: !!o.deliveredOn,
        } as CalEvent;
      });
      return [...clinics, ...orders];
    },
  },
  /* Occupational health clinic days in MediBase. */
  {
    id: "oh",
    kinds: [{ id: "oh_session", label: "Occupational health", group: "oh", color: "#A06CE0" }],
    collect: (state) => state.occHealth.diaries.map((d) => {
      const client = state.occHealth.clients.find((c) => c.id === d.clientId)?.name || "Client";
      const booked = d.slots.filter((x) => x.kind === "booked").length;
      const open = d.slots.filter((x) => x.kind === "free").length;
      return {
        id: `oh:${d.id}`, kind: "oh_session", ...timed(d.date, d.start, d.end), title: `${client}: occupational health`, client,
        staffIds: d.clinicianStaffId ? [d.clinicianStaffId] : [], location: d.location,
        status: d.date < today(state) ? "Completed" : "Scheduled", tone: "neutral", detail: `${booked} booked, ${open} free, with ${d.clinicianName}`,
        link: { page: "OccHealth", tab: "sessions", params: { diary: d.id } }, openLabel: "Open MediBase session", done: d.date < today(state), movable: d.date >= today(state),
      } as CalEvent;
    }),
  },
  /* Irish Life Health partner screenings. */
  {
    id: "ilh",
    kinds: [{ id: "ilh_screening", label: "Irish Life Health screening", group: "ilh", color: "#E0608A" }],
    collect: (state) => state.sales.ilh.filter((b) => !b.archived).map((b) => ({
      id: `ilh:${b.id}`, kind: "ilh_screening", ...timed(b.date, b.start, null), title: `${b.company}: ${SALES_ILH_REQUESTED_LABEL[b.requested]}`,
      client: b.company, staffIds: [], location: `${b.location}, ${b.eircode}`,
      status: b.screened ? "Screened" : "Booked", tone: b.screened ? "ok" : "neutral", detail: `${b.id}, ${b.intakeRef}`,
      link: { page: "Sales", tab: "partners", params: { ilh: b.id } }, openLabel: "Open Irish Life Health", done: b.screened,
    } as CalEvent)),
  },
  /* Sales: each open lead's next action (calls and meetings get their own colour), proposal follow ups and tender closing dates. */
  {
    id: "sales",
    kinds: [
      { id: "sales_meeting", label: "Sales call or meeting", group: "sales", color: "#2F9E6B" },
      { id: "sales_action", label: "Lead next step", group: "sales", color: "#4FAE73" },
      { id: "sales_followup", label: "Proposal follow up", group: "sales", color: "#7CC08F" },
      { id: "sales_tender", label: "Tender deadline", group: "sales", color: "#93A85C" },
    ],
    collect: (state) => {
      const t = today(state);
      const out: CalEvent[] = [];
      for (const l of state.sales.leads) {
        if (l.stage === "lost" || !l.nextActionOn) continue;
        const meeting = /\b(meeting|call|meet|walk ?through)\b/i.test(l.nextAction);
        const overdue = l.nextActionOn < t && l.stage !== "won";
        out.push({
          id: `lead:${l.id}`, kind: meeting ? "sales_meeting" : "sales_action", ...timed(l.nextActionOn, null), title: `${l.company}: ${l.nextAction}`,
          client: l.company, staffIds: [l.ownerId], status: l.stage === "won" ? "Won" : overdue ? "Overdue" : l.stage === "proposal_sent" ? "Proposal sent" : "New lead",
          tone: l.stage === "won" ? "ok" : overdue ? "warn" : "neutral", detail: l.services.map((x) => SALES_SERVICE_LABEL[x]).join(", "),
          link: { page: "Sales", tab: "pipeline", params: { lead: l.id } }, openLabel: "Open lead", movable: l.stage !== "won",
        });
        const seq = salesFollowSequence(state, l.id);
        if (seq && !seq.stopped) {
          for (const step of seq.steps) {
            out.push({
              id: `follow:${seq.key}:${step.n}`, kind: "sales_followup", ...timed(step.due, null), title: `${l.company}: follow up ${step.n} of 4`,
              client: l.company, staffIds: [l.ownerId], status: step.status === "sent" ? "Sent" : step.status === "skipped" ? "Skipped" : seq.paused ? "Paused" : step.status === "due" ? "Due" : "Scheduled",
              tone: step.status === "sent" ? "ok" : step.status === "due" ? "warn" : "neutral", detail: `${seq.proposalId} v${seq.version}: "${step.subject}"`,
              link: { page: "Sales", tab: "pipeline", params: { lead: l.id } }, openLabel: "Open lead", done: step.status === "sent" || step.status === "skipped",
              secondary: { label: "Open proposal", link: { page: "Sales", tab: "proposals", params: { proposal: seq.proposalId } } },
            });
          }
        }
      }
      for (const x of state.sales.tenders) {
        if (x.status === "not_bidding") continue;
        out.push({
          id: `tender:${x.id}`, kind: "sales_tender", ...timed(x.closesOn, null), title: `Tender closes: ${x.title}`, client: x.buyer, staffIds: ["stephen"],
          status: SALES_TENDER_STATUS_LABEL[x.status], tone: x.closesOn < t ? "neutral" : "info", detail: x.valueText,
          link: x.leadId ? { page: "Sales", tab: "pipeline", params: { lead: x.leadId } } : { page: "Sales", tab: "pipeline", params: { tender: x.id } },
          openLabel: x.leadId ? "Open lead" : "Open Sales", done: x.closesOn < t,
        });
      }
      return out;
    },
  },
  /* Retention: the date each client is due to be screened again. */
  {
    id: "recall",
    kinds: [{ id: "recall", label: "Rebooking date", group: "retention", color: "#EB7F3C" }],
    collect: (state) => salesRecalls(state).map((r) => ({
      id: `recall:${r.id}`, kind: "recall", ...timed(r.recallOn, null), title: `${r.company}: due for rebooking`, client: r.company, staffIds: ["stephen"],
      status: SALES_RECALL_STATUS_LABEL[r.status], tone: r.status === "overdue" ? "warn" : r.status === "rebooked" ? "ok" : r.status === "plan_now" ? "info" : "neutral",
      detail: `Last screened ${fmtDate(r.screenedOn)}. Planning from ${fmtDate(r.planFrom)}.`, done: r.status === "rebooked",
      link: r.leadId ? { page: "Sales", tab: "pipeline", params: { lead: r.leadId } } : { page: "Sales", tab: "recall", params: { recall: r.id } },
      openLabel: r.leadId ? "Open lead" : "Open Retention",
    } as CalEvent)),
  },
  /* Rebooking reminders: the email to the named HR contact three months before the anniversary. */
  {
    id: "rebooking",
    kinds: [{ id: "rebooking_reminder", label: "Rebooking reminder", group: "retention", color: "#EB7F3C" }],
    collect: (state) => salesRecalls(state).filter((r) => r.status !== "rebooked").map((r) => ({
      id: `rebook:${r.id}`, kind: "rebooking_reminder", ...timed(r.planFrom, null), title: `${r.company}: send rebooking reminder`, client: r.company, staffIds: ["stephen"],
      status: state.onboarding.rebookSent[r.id] ? "Sent" : "To send", tone: state.onboarding.rebookSent[r.id] ? "ok" : "info", done: !!state.onboarding.rebookSent[r.id],
      detail: `Three months before the anniversary on ${fmtDate(r.recallOn)}. Goes to the named HR contact.`,
      link: { page: "Sales", tab: "recall", params: { recall: r.id } }, openLabel: "Open Retention",
    } as CalEvent)),
  },
  /* Client onboarding: when each started and, once finished, when it was completed. */
  {
    id: "onboarding",
    kinds: [{ id: "onboarding", label: "Onboarding", group: "onboarding", color: "#2F8FB3" }],
    collect: (state) => state.onboarding.onboardings.flatMap((o) => {
      const who = o.details.companyName || o.id;
      const kind = o.kind === "oh" ? "Occupational Health" : "Wellness";
      const link: NavTarget = { page: "Sales", tab: "onboarding", params: { onb: o.id } };
      const start = isoParts(o.createdAt);
      const out: CalEvent[] = [{ id: `onb:${o.id}`, kind: "onboarding", ...timed(start.date, null), title: `${who}: ${kind} onboarding started`, client: who, staffIds: [], status: o.completedAt ? "Complete" : "In progress", tone: o.completedAt ? "ok" : "info", detail: `${o.id}, started by ${o.createdBy}.`, link, openLabel: "Open onboarding", done: !!o.completedAt } as CalEvent];
      if (o.completedAt) { const end = isoParts(o.completedAt); out.push({ id: `onb-done:${o.id}`, kind: "onboarding", ...timed(end.date, null), title: `${who}: onboarding complete`, client: who, staffIds: [], status: "Complete", tone: "ok", detail: `${kind} client set up.`, link, openLabel: "Open onboarding", done: true } as CalEvent); }
      return out;
    }),
  },
  /* Work tasks with a due date. Clinical tasks only for people who may see them (the task list rule). */
  {
    id: "tasks",
    kinds: [{ id: "task", label: "Task", group: "tasks", color: "#7E8FA3" }],
    collect: (state) => visibleTasks(state).filter((v) => v.task.dueAt).map((v) => {
      const at = isoParts(v.task.dueAt!);
      return {
        id: `task:${v.task.id}`, kind: "task", ...dueAt(at.date, at.time), title: v.title, staffIds: [v.task.ownerId],
        status: v.statusLabel, tone: v.status === "done" ? "ok" : v.overdue ? "warn" : v.status === "blocked" ? "bad" : "neutral",
        detail: `Owner ${v.ownerName}, ${v.task.priority} priority`, link: { page: "Work", tab: "tasks", params: { task: v.task.id } }, openLabel: "Open task",
        done: v.status === "done", movable: v.status !== "done",
      } as CalEvent;
    }),
  },
  /* Things scheduled from the Calendar with "+ Schedule" that live nowhere else: client meetings and calls,
     follow up emails, results out and rebooking emails, staff training and leave (one event per day of leave).
     Tasks, flu clinics and MediBase sessions created there show through their own sources above. */
  {
    id: "scheduled",
    kinds: [
      { id: "sched_meeting", label: "Client meeting or call", group: "sales", color: "#2E8B57" },
      { id: "sched_email", label: "Scheduled follow up email", group: "sales", color: "#5BAF7A" },
      { id: "sched_retention", label: "Results out or rebooking email", group: "retention", color: "#D86A2B" },
      { id: "sched_training", label: "Staff training", group: "team", color: "#7A6FD0" },
      { id: "sched_leave", label: "Leave or holiday", group: "team", color: "#A86FA6" },
    ],
    collect: (state) => {
      const out: CalEvent[] = [];
      for (const x of schedItems(state)) {
        if (x.status === "cancelled" || x.ref) continue;
        const st = schedStatusLabel(state, x);
        const lead = x.leadId ? state.sales.leads.find((l) => l.id === x.leadId) : undefined;
        const company = x.client ? state.companies.find((c) => c.name.toLowerCase() === x.client!.toLowerCase()) : undefined;
        const clientLink: NavTarget = lead ? { page: "Sales", tab: "pipeline", params: { lead: lead.id } } : company ? { page: "Records", tab: "companies", params: { company: company.id } } : { page: "Calendar", tab: "all", params: { view: "week", date: x.date, ev: `sched:${x.id}` } };
        const staffLink = (): NavTarget => (x.staffIds[0] ? { page: "Records", tab: "staff", params: { staff: x.staffIds[0] } } : { page: "Calendar", tab: "all", params: { view: "week", date: x.date } });
        const common = { client: x.client || undefined, staffIds: x.staffIds, status: st.label, tone: st.tone, done: st.done, schedId: x.id, scheduledBy: x.createdBy, movable: !st.done || x.kind === "leave" };
        if (x.kind === "meeting" || x.kind === "call") {
          out.push({ ...common, id: `sched:${x.id}`, kind: "sched_meeting", ...timed(x.date, x.start, x.end), title: `${x.client}: ${x.kind === "call" ? "call" : "meeting"}${x.contact ? ` with ${x.contact}` : ""}`,
            location: x.kind === "call" ? "Phone or video call" : undefined, detail: x.notes || undefined, link: clientLink, openLabel: lead ? "Open lead" : company ? "Open client" : "Show in calendar" });
        } else if (x.kind === "follow_up") {
          const tpl = schedTemplate(x.template);
          out.push({ ...common, id: `sched:${x.id}`, kind: "sched_email", ...timed(x.date, x.start, x.start ? addMins(x.start, 30) : null), title: `${x.client}: follow up email`,
            detail: `"${tpl.subject}" to ${x.contact || "the contact"}${x.contactEmail ? ` <${x.contactEmail}>` : ""}. Simulated.`, link: clientLink, openLabel: lead ? "Open lead" : company ? "Open client" : "Show in calendar" });
        } else if (x.kind === "results_out" || x.kind === "rebooking") {
          out.push({ ...common, id: `sched:${x.id}`, kind: "sched_retention", ...timed(x.date, x.start, x.start ? addMins(x.start, 30) : null),
            title: `${x.client}: ${x.kind === "results_out" ? "results are out email" : "rebooking reminder"}`, detail: `To ${x.contact || "the HR contact"}${x.contactEmail ? ` <${x.contactEmail}>` : ""}. Simulated.`,
            link: { page: "Sales", tab: "recall", params: { sched: x.id } }, openLabel: "Open Retention" });
        } else if (x.kind === "training") {
          out.push({ ...common, id: `sched:${x.id}`, kind: "sched_training", ...timed(x.date, x.start, x.end), title: x.title, detail: x.notes || undefined, link: staffLink(), openLabel: "Open staff" });
        } else if (x.kind === "leave") {
          const days = schedDays(x);
          days.forEach((d, i) => out.push({ ...common, id: `sched:${x.id}:${d}`, kind: "sched_leave", ...timed(d, null), allDay: true,
            title: `${x.staffIds.map((id) => state.staff.find((s) => s.id === id)?.name.split(" ")[0] || id).join(", ")}: ${x.title.toLowerCase()}${days.length > 1 ? ` (day ${i + 1} of ${days.length})` : ""}`,
            detail: `${fmtDate(x.date)}${days.length > 1 ? ` to ${fmtDate(days[days.length - 1])}` : ""}. Blocks clinics on these days.${x.notes ? ` ${x.notes}` : ""}`, link: staffLink(), openLabel: "Open staff" }));
        }
      }
      return out;
    },
  },
  /* Scheduled jobs: employer report drafts due are deadlines; the rest are automations (off by default). */
  {
    id: "jobs",
    kinds: [
      { id: "report_deadline", label: "Report draft due", group: "reporting", color: "#5F7FE0" },
      { id: "automation", label: "Automation run", group: "automations", color: "#8F9A96" },
    ],
    collect: (state) => state.jobs.filter((j) => j.nextRunAt && j.status !== "paused").map((j) => {
      const at = isoParts(j.nextRunAt!);
      const report = j.kind === "report_milestone";
      const prog = j.linked?.kind === "programme" ? state.programmes.find((p) => p.id === j.linked!.id) : null;
      const er = j.linked?.kind === "employer_report" ? state.employerReports.find((r) => r.id === j.linked!.id) : null;
      const client = prog?.clientName || (er ? state.programmes.find((p) => p.id === er.programmeId)?.clientName : undefined);
      return {
        id: `job:${j.id}`, kind: report ? "report_deadline" : "automation", ...(report ? timed(at.date, null) : dueAt(at.date, at.time)),
        title: j.name, client, staffIds: report ? ["martina"] : [], status: j.status === "failed" ? "Failed last run" : "Scheduled",
        tone: j.status === "failed" ? "bad" : "neutral", detail: `${j.cadence}. Simulated.`,
        link: report && er ? { page: "Reporting", tab: "report-builder", params: { report: er.id } } : { page: "Work", tab: "schedules", params: { job: j.id } },
        openLabel: report ? "Open report" : "Open schedule", secondary: report && er ? { label: "Job schedule", link: { page: "Work", tab: "schedules", params: { job: j.id } } } : undefined,
      } as CalEvent;
    }),
  },
  /* Client date requests: dates HR suggested (waiting for Neil) or Neil proposed back (waiting for the
     client), drawn tentative. Approved dates become screening days and show through "sessions". */
  {
    id: "dateRequests",
    kinds: [{ id: "date_request", label: "Client date request", group: "clinics", color: "#C98A2B" }],
    collect: (state) => (state.dateRequests?.requests || []).flatMap((r) => {
      if (r.status !== "suggested" && r.status !== "countered") return [];
      const client = state.programmes.find((p) => p.id === r.programmeId)?.clientName || "Client";
      const picks = r.status === "countered" && r.counter ? r.counter.picks : r.picks;
      return picks.map((p, i) => {
        const h = drHours(p);
        const nurse = r.status === "countered" && r.counter ? r.counter.picks[i]?.nurseId : undefined;
        return {
          id: `dr:${r.id}:${p.date}`, kind: "date_request", ...timed(p.date, h.start, h.end), client, staffIds: nurse ? [nurse] : [],
          title: r.status === "countered" ? `${client}: date proposed to the client` : `${client}: suggested date`,
          location: r.room || undefined, status: r.status === "countered" ? "Waiting for the client" : "Waiting for Neil", tone: r.status === "countered" ? "info" : "warn",
          detail: `${r.id}, ${r.daysNeeded} ${r.daysNeeded === 1 ? "day" : "days"} needed. Not booked until approved.`, programmeId: r.programmeId,
          link: { page: "Clinics", tab: "days", params: { request: r.id } }, openLabel: "Open the request", tentative: true,
        } as CalEvent;
      });
    }),
  },
];

export const CAL_KINDS: CalKind[] = CAL_SOURCES.flatMap((s) => s.kinds);
export const CAL_KIND_BY_ID: Record<string, CalKind> = Object.fromEntries(CAL_KINDS.map((k) => [k.id, k]));
export const CAL_GROUP_BY_ID: Record<string, CalGroup> = Object.fromEntries(CAL_GROUPS.map((g) => [g.id, g]));
export const calKindColor = (kind: string) => CAL_KIND_BY_ID[kind]?.color || "#8F9A96";
export const calGroupOf = (kind: string) => CAL_KIND_BY_ID[kind]?.group || "tasks";
const GROUP_ALIAS: Record<string, string> = {
  clinic: "clinics", clinics: "clinics", sessions: "clinics", days: "clinics", screening: "clinics", occhealth: "oh", occupational: "oh", irishlife: "ilh",
  lead: "sales", leads: "sales", leave: "team", training: "team", staff: "team", holiday: "team", recall: "retention", rebooking: "retention", task: "tasks", report: "reporting", reports: "reporting", jobs: "automations",
};
/** A group id from a URL word: a group id, a kind id (task, flu_clinic) or a friendly alias (clinic, recall). Null when unknown. */
export function calGroupFromParam(x: string): string | null {
  const k = x.trim().toLowerCase();
  if (CAL_GROUP_BY_ID[k]) return k;
  if (CAL_KIND_BY_ID[k]) return CAL_KIND_BY_ID[k].group;
  return GROUP_ALIAS[k] || null;
}

/* ================================================================================================
   Selectors
   ================================================================================================ */

const cache = new WeakMap<PhState, CalEvent[]>();
/** Every event from every source, sorted by date, then all-day first, then start time. */
export function calendarEvents(state: PhState): CalEvent[] {
  const hit = cache.get(state);
  if (hit) return hit;
  const all = CAL_SOURCES.flatMap((s) => s.collect(state)).sort(calSort);
  /* Tasks, flu clinics and MediBase sessions created with "+ Schedule" carry who scheduled them. */
  for (const e of all) {
    if (e.schedId || !/^(task|flu|oh):/.test(e.id)) continue;
    const x = schedForCalId(state, e.id);
    if (x) { e.schedId = x.id; e.scheduledBy = x.createdBy; }
  }
  cache.set(state, all);
  return all;
}
export function calSort(a: CalEvent, b: CalEvent): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
  if (a.start !== b.start) return a.start < b.start ? -1 : 1;
  return a.title < b.title ? -1 : a.title > b.title ? 1 : 0;
}

export type CalView = "month" | "week" | "day" | "agenda" | "people" | "timeline";

/* Ready-made calendar views. Each is a set of calendar URL filters (types, view, people, mine, ...).
   "Save this view" stores the same shape under a name (state.scheduled.views). */
export interface CalPresetView { id: string; name: string; hint: string; params: Record<string, string> }
export const CAL_PRESET_VIEWS: CalPresetView[] = [
  { id: "everything", name: "Everything", hint: "Every calendar", params: {} },
  { id: "neil-ops", name: "Neil: operations", hint: "Clinics and screening days, report deadlines, OH, team and leave", params: { types: "clinics,reporting,oh,team" } },
  { id: "stephen-sales", name: "Stephen: sales", hint: "Sales, onboarding, retention, Irish Life Health and tasks", params: { types: "sales,onboarding,retention,ilh,tasks" } },
  { id: "nurse-rota", name: "Nurse rota", hint: "Who is where: clinics, flu, OH, team and leave, by person", params: { types: "clinics,flu,oh,team", view: "people" } },
  { id: "clinics-only", name: "Clinics only", hint: "Clinic sessions and screening days", params: { types: "clinics" } },
];
/** The calendar URL params a saved view controls. Anything else (date, the open event) is left alone. */
export const CAL_VIEW_KEYS = ["types", "view", "clients", "people", "mine", "byme", "status", "q"];
/** The view a persona starts on: Stephen sees sales, everyone else operations. */
export const calDefaultViewFor = (personaId: string): string => (personaId === "stephen" ? "stephen-sales" : "neil-ops");
export interface CalFilter {
  /** Groups shown. */
  groups: string[];
  /** Empty means every client. */
  clients: string[];
  /** Empty means everyone. */
  people: string[];
  q: string;
  /** Only events that include this staff id (the current persona). */
  mine: string | null;
  /** Only things this staff id scheduled from the Calendar. */
  byMe?: string | null;
  /** To do (not finished) or done. */
  status?: "todo" | "done" | null;
}
export type CalDim = "groups" | "clients" | "people";

export function calMatches(e: CalEvent, f: CalFilter, except?: CalDim): boolean {
  if (except !== "groups" && !f.groups.includes(calGroupOf(e.kind))) return false;
  if (except !== "clients" && f.clients.length && !(e.client && f.clients.includes(e.client))) return false;
  if (except !== "people" && f.people.length && !e.staffIds.some((id) => f.people.includes(id))) return false;
  if (f.mine && !e.staffIds.includes(f.mine as StaffId)) return false;
  if (f.byMe && e.scheduledBy !== f.byMe) return false;
  if (f.status === "todo" && e.done) return false;
  if (f.status === "done" && !e.done) return false;
  if (f.q.trim()) {
    const q = f.q.trim().toLowerCase();
    const hay = [e.title, e.client, e.location, e.status, e.detail, CAL_KIND_BY_ID[e.kind]?.label].filter(Boolean).join(" ").toLowerCase();
    if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
  }
  return true;
}

/** First and last date a view shows around a date. Month view shows whole weeks (Monday first). */
export function calRange(view: CalView, date: LocalDate): { from: LocalDate; to: LocalDate } {
  if (view === "day" || view === "people") return { from: date, to: date };
  if (view === "timeline") { const s = startOfWeek(date); return { from: s, to: addDays(s, 27) }; }
  if (view === "week") { const s = startOfWeek(date); return { from: s, to: addDays(s, 6) }; }
  const first = date.slice(0, 8) + "01";
  const last = addDays(addMonths(first, 1), -1);
  if (view === "agenda") return { from: first, to: last };
  return { from: startOfWeek(first), to: addDays(startOfWeek(last), 6) };
}
/** The dates that counts are taken over. Month view also draws the edges of the next and previous
    months, but counts only the month itself, so Month and Agenda always give the same numbers. */
export function calCountRange(view: CalView, date: LocalDate): { from: LocalDate; to: LocalDate } {
  return view === "month" ? calRange("agenda", date) : calRange(view, date);
}
/** Week view: at most this many overlapping events side by side; more show two and a "+N" chip. */
export const CAL_MAX_SIDE_BY_SIDE = 3;
/** Narrowest an event block may be drawn in week view, in pixels. */
export const CAL_MIN_BLOCK_PX = 80;
export function addMonths(d: LocalDate, n: number): LocalDate {
  const [y, m, day] = d.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  const dim = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(day, dim)).padStart(2, "0")}`;
}
/** Where previous and next go from a date in a view. */
export function calStep(view: CalView, date: LocalDate, dir: 1 | -1): LocalDate {
  if (view === "day" || view === "people") return addDays(date, dir);
  if (view === "timeline") return addDays(date, 14 * dir);
  if (view === "week") return addDays(date, 7 * dir);
  return addMonths(date, dir);
}

/** Distinct clients across events, most events first. */
export function calClients(events: CalEvent[]): Array<{ name: string; n: number }> {
  const m = new Map<string, number>();
  for (const e of events) if (e.client) m.set(e.client, (m.get(e.client) || 0) + 1);
  return [...m.entries()].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n || (a.name < b.name ? -1 : 1));
}

/** Side-by-side layout for timed events on one day: column index and column count per event. */
export function calLayoutDay(events: CalEvent[]): Map<string, { col: number; cols: number; cluster: number }> {
  const timedEv = events.filter((e) => !e.allDay && e.time).slice().sort((a, b) => (a.time!.start < b.time!.start ? -1 : a.time!.start > b.time!.start ? 1 : 0));
  const out = new Map<string, { col: number; cols: number; cluster: number }>();
  let clusterNo = 0;
  const endOf = (e: CalEvent) => e.time!.end || addMins(e.time!.start, 60);
  let cluster: CalEvent[] = [];
  let clusterEnd = "";
  let colsEnd: string[] = [];
  const flush = () => { const n = colsEnd.length; for (const e of cluster) out.set(e.id, { col: out.get(e.id)!.col, cols: n, cluster: clusterNo }); clusterNo += 1; cluster = []; colsEnd = []; clusterEnd = ""; };
  for (const e of timedEv) {
    if (cluster.length && e.time!.start >= clusterEnd) flush();
    let col = colsEnd.findIndex((end) => end <= e.time!.start);
    if (col < 0) { col = colsEnd.length; colsEnd.push(endOf(e)); } else colsEnd[col] = endOf(e);
    out.set(e.id, { col, cols: 1, cluster: clusterNo });
    cluster.push(e);
    if (endOf(e) > clusterEnd) clusterEnd = endOf(e);
  }
  if (cluster.length) flush();
  return out;
}
