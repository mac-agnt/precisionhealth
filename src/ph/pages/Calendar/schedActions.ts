/* Calendar scheduling actions, registered at import time. "+ Schedule" creates the real thing:
   a task goes into Work, a flu clinic into Flu, a Meddbase session into Occupational Health, and the
   rest (meetings, calls, emails, training, leave) into state.scheduled. Every item keeps a history
   (who, when, what changed) and writes one activity event. Emails are simulated.
   Any staff member can schedule; the participant preview cannot. A failed check changes nothing. */
import {
  RET_DEFAULT_TEMPLATES, SCHED_EMAIL_KINDS, SCHED_KIND_LABEL, FLU_SEASON_CURRENT, addDays, daysBetween, dublinToUtc, fluNextId, fmtDate, fmtWeekdayDate, hhmmToMinutes,
  localDateOf, localTimeOf, minutesToHhmm, registerHandlers, schedById, schedDays, schedForCalId, schedStaffBlock, schedTemplate, today,
} from "../../model";
import type { ActionResult, Ctx, Hhmm, LocalDate, OhSlot, SchedItem, SchedKind, StaffId } from "../../model";
import { coreHandlers } from "../../model/actions/core";
import { fluStaffClashes } from "../Flu/actions";

const KINDS: SchedKind[] = ["meeting", "call", "follow_up", "results_out", "rebooking", "task", "flu", "oh", "training", "leave"];
const isDate = (v: unknown): v is LocalDate => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + "T12:00:00Z"));
const isHhmm = (v: unknown): v is Hhmm => typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const pad = (n: number, w: number) => String(n).padStart(w, "0");
const me = (c: Ctx) => c.persona().id as StaffId;
const when = (d: LocalDate, t: Hhmm | null) => `${fmtWeekdayDate(d)}${t ? ` at ${t}` : ""}`;
const staffName = (c: Ctx, id: string) => c.s.staff.find((s) => s.id === id)?.name || id;

export interface SchedForm {
  kind: SchedKind;
  date: LocalDate;
  start?: Hhmm | null;
  end?: Hhmm | null;
  endDate?: LocalDate | null;
  title?: string;
  client?: string | null;
  leadId?: string | null;
  contact?: string | null;
  contactEmail?: string | null;
  staffIds?: StaffId[];
  notes?: string;
  template?: string | null;
  projected?: number | null;
  address?: string | null;
}

function guard(c: Ctx, what: string): ActionResult | null {
  return c.staffOnly(what);
}
function hist(c: Ctx, x: SchedItem, text: string) {
  x.history.push({ at: c.stamp(), by: c.persona().name, text });
}
function leadOf(c: Ctx, id: string | null | undefined) {
  return id ? c.s.sales.leads.find((l) => l.id === id) : undefined;
}
function leadNote(c: Ctx, leadId: string | null | undefined, text: string) {
  const lead = leadOf(c, leadId);
  if (lead) lead.history.push({ at: c.stamp(), by: c.persona().id, text });
}
/** Clinics the people already have on a date (screening sessions), as a warning sentence. */
function clinicWarn(c: Ctx, ids: StaffId[], days: LocalDate[]): string {
  const hits: string[] = [];
  for (const id of ids) for (const d of days) {
    const ses = c.s.sessions.find((x) => x.date === d && x.status !== "cancelled" && (x.nurseId === id || x.supportIds.includes(id)));
    if (ses) hits.push(`${staffName(c, id)} is on the clinic at ${ses.siteName} on ${fmtDate(d)}`);
  }
  return hits.length ? ` Heads up: ${hits.slice(0, 2).join("; ")}. Move that clinic or swap the nurse.` : "";
}

function checkTimes(c: Ctx, f: SchedForm, needStart: boolean): ActionResult | null {
  if (!isDate(f.date)) return c.fail("Choose a date.");
  if (needStart && !isHhmm(f.start)) return c.fail("Choose a start time.");
  if (f.start && !isHhmm(f.start)) return c.fail("The start time is not valid.");
  if (f.end && !isHhmm(f.end)) return c.fail("The end time is not valid.");
  if (f.start && f.end && f.end <= f.start) return c.fail("The end time must be after the start time.");
  return null;
}

function newItem(c: Ctx, f: SchedForm, extra: Partial<SchedItem>): SchedItem {
  const s = c.s.scheduled;
  s.seq += 1;
  const at = c.stamp();
  const x: SchedItem = {
    id: `SA-${pad(s.seq, 4)}`, kind: f.kind, title: (f.title || "").trim() || SCHED_KIND_LABEL[f.kind], date: f.date, endDate: f.endDate && f.endDate > f.date ? f.endDate : null,
    start: f.start || null, end: f.end || null, leadId: f.leadId || null, client: (f.client || "").trim() || null, contact: (f.contact || "").trim() || null,
    contactEmail: (f.contactEmail || "").trim() || null, staffIds: Array.from(new Set(f.staffIds || [])), notes: (f.notes || "").trim(), template: f.template || null, ref: null,
    status: "scheduled", doneAt: null, createdAt: at, createdBy: me(c), history: [{ at, by: c.persona().name, text: "Scheduled from the calendar" }], ...extra,
  };
  s.items.push(x);
  return x;
}

/* ---------------------------------------------------------------- create */

function create(c: Ctx, a: { form: SchedForm }): ActionResult {
  const g = guard(c, "schedule things"); if (g) return g;
  const f = a.form;
  if (!f || !KINDS.includes(f.kind)) return c.fail("Choose what to schedule.");
  const staffIds = (f.staffIds || []).filter((id) => c.s.staff.some((s) => s.id === id));
  const client = (f.client || "").trim();
  const lead = leadOf(c, f.leadId);

  switch (f.kind) {
    case "meeting": case "call": {
      const bad = checkTimes(c, f, true); if (bad) return bad;
      if (!client) return c.fail("Choose the lead or client.");
      const end = f.end || minutesToHhmm(hhmmToMinutes(f.start!) + (f.kind === "call" ? 30 : 60));
      const x = newItem(c, { ...f, end, staffIds: staffIds.length ? staffIds : [me(c)] }, {});
      const what = f.kind === "call" ? "Call" : "Meeting";
      leadNote(c, x.leadId, `${what} booked for ${when(x.date, x.start)}${x.contact ? ` with ${x.contact}` : ""} (in the calendar)${x.notes ? `: ${x.notes}` : ""}`);
      c.emit({ verb: "calendar.scheduled", summary: `${c.first()} scheduled a ${what.toLowerCase()} with ${client} for ${when(x.date, x.start)}.` });
      return c.ok(`${what} with ${client} on ${when(x.date, x.start)} is in the calendar${lead ? " and on the lead's timeline" : ""}.`, "ok", x.id);
    }
    case "follow_up": {
      const bad = checkTimes(c, f, true); if (bad) return bad;
      if (!client) return c.fail("Choose the lead or client.");
      const tpl = schedTemplate(f.template || null);
      const x = newItem(c, { ...f, title: tpl.subject, template: tpl.id, staffIds: staffIds.length ? staffIds : [me(c)] }, {});
      leadNote(c, x.leadId, `Follow up email "${tpl.subject}" scheduled for ${when(x.date, x.start)} (in the calendar)`);
      c.emit({ verb: "calendar.scheduled", simulated: true, summary: `${c.first()} scheduled a follow up email ("${tpl.subject}") to ${client} for ${when(x.date, x.start)}. Simulated: nothing is sent.` });
      return c.ok(`Follow up email to ${client} scheduled for ${when(x.date, x.start)}. Simulated.`, "ok", x.id);
    }
    case "results_out": case "rebooking": {
      const bad = checkTimes(c, f, true); if (bad) return bad;
      if (!client) return c.fail("Choose the client.");
      const tpl = RET_DEFAULT_TEMPLATES[f.kind];
      const x = newItem(c, { ...f, title: tpl.subject.replace("{company}", client), staffIds: staffIds.length ? staffIds : [me(c)] }, {});
      c.emit({ verb: "calendar.scheduled", simulated: true, summary: `${c.first()} scheduled the ${tpl.name.toLowerCase()} email to ${client} for ${when(x.date, x.start)}. Simulated: nothing is sent.` });
      return c.ok(`${tpl.name} email to ${client} scheduled for ${when(x.date, x.start)}. It is listed in Retention. Simulated.`, "ok", x.id);
    }
    case "task": {
      const bad = checkTimes(c, f, false); if (bad) return bad;
      const title = (f.title || "").trim();
      if (title.length < 3) return c.fail("Give the task a title.");
      const owner = staffIds[0] || me(c);
      const r = coreHandlers["task/add"](c, { title, ownerId: owner, dueAt: dublinToUtc(f.date, f.start || "17:00") });
      if (!r.ok) return r;
      const task = c.s.tasks[c.s.tasks.length - 1];
      if (f.notes) task.detail = f.notes.trim();
      const x = newItem(c, { ...f, title, start: f.start || "17:00", end: null, staffIds: [owner] }, { ref: { kind: "task", id: task.id } });
      return c.ok(`Task "${title}" for ${staffName(c, owner)} due ${when(x.date, x.start)}. It is in Work, Tasks and on the calendar.`, "ok", x.id);
    }
    case "flu": {
      const bad = checkTimes(c, f, true); if (bad) return bad;
      if (!client) return c.fail("Enter the company.");
      if (f.date < today(c.s)) return c.fail("The clinic date cannot be in the past.");
      const projected = Number(f.projected);
      if (!Number.isInteger(projected) || projected < 1 || projected > 2000) return c.fail("Enter the projected number of vaccinations.");
      const clashes = fluStaffClashes(c.s, f.date, staffIds, null);
      if (clashes.length) return c.fail(`Not scheduled: ${clashes.join("; ")}.`);
      const fl = c.s.flu;
      const yy = String(FLU_SEASON_CURRENT).slice(2);
      const id = fluNextId(`FLU-${yy}-`, fl.clinics.map((x) => x.id), 3);
      const n = fl.clinics.filter((x) => x.channel === "precision" && x.season === FLU_SEASON_CURRENT).length + 1;
      fl.clinics.push({
        id, season: FLU_SEASON_CURRENT, channel: "precision", item: `Precision Flu ${yy}-${pad(n, 3)}`, company: client, address: (f.address || "").trim() || "Address to confirm with the client",
        eircode: "", projected, actual: null, date: f.date, start: f.start!, staffIds, rotaNurses: 0, status: "scheduled", intake: "board", receivedOn: today(c.s),
        preferredWeek: null, batchId: null, coldChain: null, eodId: null, recordedBy: null, recordedAt: null,
      });
      newItem(c, { ...f, client, title: `${client} flu clinic`, end: null, staffIds }, { ref: { kind: "flu", id } });
      c.emit({ verb: "flu.scheduled", summary: `${c.first()} scheduled a flu clinic for ${client} on ${when(f.date, f.start!)}: ${projected} projected${staffIds.length ? `, staff ${staffIds.map((x) => staffName(c, x)).join(", ")}` : ", staff to assign"}.` });
      return c.ok(`${client} flu clinic on ${when(f.date, f.start!)} is in Flu, Bookings and on the calendar.`, "ok", id);
    }
    case "oh": {
      const bad = checkTimes(c, f, true); if (bad) return bad;
      if (!f.end) return c.fail("Choose an end time.");
      const oc = c.s.occHealth.clients.find((x) => x.name.toLowerCase() === client.toLowerCase());
      if (!oc) return c.fail("Choose an occupational health client.");
      const adv = staffIds[0];
      if (!adv) return c.fail("Choose the nurse or advisor.");
      const block = schedStaffBlock(c.s, adv, f.date); if (block) return c.fail(block);
      const oh = c.s.occHealth;
      const n = Math.max(0, ...oh.diaries.map((d) => Number(d.id.replace("MDB-D", "")) || 0)) + 1;
      const id = `MDB-D${n}`;
      oh.seq.meddbaseRef += 1;
      const slots: OhSlot[] = [];
      for (let m = hhmmToMinutes(f.start!); m < hhmmToMinutes(f.end); m += 15) {
        const t = minutesToHhmm(m);
        slots.push({ id: `${id}-${t.replace(":", "")}`, start: t, kind: "free", employee: null, appointmentType: "Free slot", templateId: null, chasedAt: null });
      }
      const st = c.s.staff.find((s) => s.id === adv)!;
      oh.diaries.push({ id, clinicianName: st.name, clinicianRole: st.title, clinicianStaffId: st.id, date: f.date, clientId: oc.id, location: (f.address || "").trim() || "At the client site",
        start: f.start!, end: f.end, slotMinutes: 15, meddbaseRef: `MB-DIARY-${24100 + oh.seq.meddbaseRef}`, slots });
      newItem(c, { ...f, client: oc.name, title: `${oc.name}: occupational health`, staffIds: [adv] }, { ref: { kind: "oh", id } });
      c.emit({ verb: "oh.session_scheduled", simulated: true, summary: `${c.first()} scheduled an occupational health session for ${oc.name} on ${when(f.date, f.start!)} to ${f.end} with ${st.name}. ${slots.length} free 15 minute slots. Simulated: Meddbase is not connected.` });
      return c.ok(`Occupational health session for ${oc.name} on ${when(f.date, f.start!)} with ${st.name}. It is in Occupational Health, Meddbase sessions.`, "ok", id);
    }
    case "training": case "leave": {
      const bad = checkTimes(c, f, false); if (bad) return bad;
      if (!staffIds.length) return c.fail(f.kind === "leave" ? "Choose who is on leave." : "Choose who is going.");
      if (f.endDate && (!isDate(f.endDate) || f.endDate < f.date)) return c.fail("The last day must be on or after the first day.");
      if (f.endDate && daysBetween(f.date, f.endDate) > 30) return c.fail("Book leave in blocks of up to a month.");
      const title = (f.title || "").trim() || (f.kind === "leave" ? "Annual leave" : "Staff training");
      const x = newItem(c, { ...f, title, start: f.kind === "leave" ? null : f.start || null, end: f.kind === "leave" ? null : f.end || null, staffIds }, {});
      const who = staffIds.map((id) => staffName(c, id)).join(", ");
      c.emit({ verb: "calendar.scheduled", summary: `${c.first()} booked ${title.toLowerCase()} for ${who}: ${fmtDate(x.date)}${x.endDate ? ` to ${fmtDate(x.endDate)}` : ""}.` });
      const warn = f.kind === "leave" || !x.start ? clinicWarn(c, staffIds, schedDays(x)) : "";
      return c.ok(`${title} for ${who} is on the calendar${f.kind === "leave" ? " and blocks them from clinics on those days" : ""}.${warn}`, warn ? "warn" : "ok", x.id);
    }
  }
  return c.fail("Choose what to schedule.");
}

/* ---------------------------------------------------------------- move, edit, cancel, done */

/** Move anything movable on the calendar to another date (and time). Used by drag and Reschedule. */
function move(c: Ctx, a: { calId: string; date: LocalDate; start?: Hhmm | null; end?: Hhmm | null }): ActionResult {
  const g = guard(c, "reschedule"); if (g) return g;
  if (!isDate(a.date)) return c.fail("Choose a date.");
  if (a.start && !isHhmm(a.start)) return c.fail("The start time is not valid.");
  if (a.end && (!isHhmm(a.end) || (a.start && a.end <= a.start))) return c.fail("The end time must be after the start time.");
  const x = schedForCalId(c.s, a.calId);
  const [kind, rawId] = a.calId.split(":");
  const shift = (from: Hhmm, to: Hhmm, t: Hhmm) => minutesToHhmm(Math.max(0, Math.min(23 * 60 + 45, hhmmToMinutes(t) + hhmmToMinutes(to) - hhmmToMinutes(from))));

  if (kind === "sched" && x) {
    /* A day of multi-day leave was dragged: move the whole block by the same number of days. */
    const part = a.calId.split(":")[2];
    if (part && isDate(part)) a = { ...a, date: addDays(x.date, daysBetween(part, a.date)) };
    if (x.status === "cancelled") return c.fail("That item was cancelled.");
    if (SCHED_EMAIL_KINDS.includes(x.kind) && x.status === "done") return c.fail("That email has been sent, so it cannot move.");
    const before = when(x.date, x.start);
    const len = x.endDate ? daysBetween(x.date, x.endDate) : 0;
    const dur = x.start && x.end ? hhmmToMinutes(x.end) - hhmmToMinutes(x.start) : null;
    const newStart = a.start !== undefined && x.kind !== "leave" ? a.start : x.start;
    const newEnd = a.end ? a.end : x.start && newStart && dur !== null ? minutesToHhmm(Math.min(23 * 60 + 59, hhmmToMinutes(newStart) + dur)) : x.end;
    if (a.date === x.date && newStart === x.start && newEnd === x.end) return c.fail("That is already when it is.");
    x.date = a.date; x.start = newStart; x.end = newEnd; x.endDate = len ? addDays(a.date, len) : null;
    hist(c, x, `Moved from ${before} to ${when(x.date, x.start)}`);
    leadNote(c, x.leadId, `${SCHED_KIND_LABEL[x.kind]} moved to ${when(x.date, x.start)}`);
    c.emit({ verb: "calendar.rescheduled", summary: `${c.first()} moved ${x.title} (${x.client || SCHED_KIND_LABEL[x.kind]}) from ${before} to ${when(x.date, x.start)}.` });
    return c.ok(`Moved to ${when(x.date, x.start)}.`);
  }
  if (kind === "task") {
    const t = c.s.tasks.find((y) => y.id === rawId);
    if (!t) return c.fail("Unknown task.");
    if (t.status === "done") return c.fail("That task is done.");
    const time = a.start || (t.dueAt ? localTimeOf(t.dueAt) : "17:00");
    const before = t.dueAt ? when(localDateOf(t.dueAt), localTimeOf(t.dueAt)) : "no date";
    t.dueAt = dublinToUtc(a.date, time);
    if (x) { x.date = a.date; x.start = time; hist(c, x, `Due date moved from ${before} to ${when(a.date, time)}`); }
    c.emit({ verb: "task.rescheduled", summary: `${c.first()} moved task ${t.id} (${t.title}) from ${before} to ${when(a.date, time)}.`, entity: { kind: "task", id: t.id } });
    return c.ok(`Task due ${when(a.date, time)}.`);
  }
  if (kind === "flu") {
    const fc = c.s.flu.clinics.find((y) => y.id === rawId);
    if (!fc || fc.status !== "scheduled") return c.fail("Only a booked flu clinic that has not run can move.");
    if (a.date < today(c.s)) return c.fail("The clinic date cannot be in the past.");
    const clashes = fluStaffClashes(c.s, a.date, fc.staffIds, fc.id);
    if (clashes.length) return c.fail(`Not moved: ${clashes.join("; ")}.`);
    const before = when(fc.date!, fc.start);
    fc.date = a.date; if (a.start) fc.start = a.start;
    if (x) { x.date = a.date; x.start = fc.start; hist(c, x, `Moved from ${before} to ${when(a.date, fc.start)}`); }
    c.emit({ verb: "flu.rescheduled", summary: `${c.first()} moved the ${fc.company} flu clinic from ${before} to ${when(a.date, fc.start)}.` });
    return c.ok(`${fc.company} flu clinic moved to ${when(a.date, fc.start)}.`);
  }
  if (kind === "oh") {
    const d = c.s.occHealth.diaries.find((y) => y.id === rawId);
    if (!d) return c.fail("Unknown session.");
    if (d.date < today(c.s)) return c.fail("That session has passed.");
    if (a.date < today(c.s)) return c.fail("The session date cannot be in the past.");
    const block = schedStaffBlock(c.s, d.clinicianStaffId, a.date); if (block) return c.fail(block);
    const before = when(d.date, d.start);
    const to = a.start || d.start;
    d.slots = d.slots.map((sl) => ({ ...sl, start: shift(d.start, to, sl.start) }));
    d.end = shift(d.start, to, d.end); d.start = to; d.date = a.date;
    if (x) { x.date = a.date; x.start = d.start; x.end = d.end; hist(c, x, `Moved from ${before} to ${when(d.date, d.start)}`); }
    c.emit({ verb: "oh.rescheduled", simulated: true, summary: `${c.first()} moved the occupational health session ${d.id} from ${before} to ${when(d.date, d.start)}. Simulated: Meddbase is not connected.` });
    return c.ok(`Session moved to ${when(d.date, d.start)}. Simulated in Meddbase.`);
  }
  if (kind === "lead") {
    const l = leadOf(c, rawId);
    if (!l) return c.fail("Unknown lead.");
    const before = l.nextActionOn ? fmtDate(l.nextActionOn) : "no date";
    l.nextActionOn = a.date;
    l.history.push({ at: c.stamp(), by: c.persona().id, text: `Next step "${l.nextAction}" moved from ${before} to ${fmtDate(a.date)} (in the calendar)` });
    c.emit({ verb: "sales.rescheduled", summary: `${c.first()} moved the next step for ${l.company} to ${fmtDate(a.date)}.` });
    return c.ok(`${l.company}: next step moved to ${fmtWeekdayDate(a.date)}.`);
  }
  return c.fail("This item cannot be moved from the calendar. Open it to change it.");
}

function edit(c: Ctx, a: { id: string; patch: { title?: string; notes?: string; contact?: string; staffIds?: StaffId[]; template?: string } }): ActionResult {
  const g = guard(c, "edit scheduled items"); if (g) return g;
  const x = schedById(c.s, a.id);
  if (!x || x.status === "cancelled") return c.fail("That item no longer exists.");
  const changes: string[] = [];
  const p = a.patch || {};
  if (p.title !== undefined && p.title.trim() && p.title.trim() !== x.title) { changes.push(`title to "${p.title.trim()}"`); x.title = p.title.trim(); }
  if (p.notes !== undefined && p.notes.trim() !== x.notes) { changes.push("notes"); x.notes = p.notes.trim(); }
  if (p.contact !== undefined && p.contact.trim() !== (x.contact || "")) { changes.push(`contact to ${p.contact.trim() || "none"}`); x.contact = p.contact.trim() || null; }
  if (p.template && p.template !== x.template) { const t = schedTemplate(p.template); changes.push(`template to ${t.label}`); x.template = t.id; x.title = t.subject; }
  if (p.staffIds) {
    const ids = p.staffIds.filter((id) => c.s.staff.some((s) => s.id === id));
    if (!ids.length && (x.kind === "leave" || x.kind === "training")) return c.fail("Choose at least one person.");
    if (ids.join() !== x.staffIds.join()) { changes.push(`people to ${ids.map((id) => staffName(c, id)).join(", ") || "nobody"}`); x.staffIds = ids; }
  }
  if (!changes.length) return c.fail("Nothing has changed.");
  hist(c, x, `Changed ${changes.join(", ")}`);
  c.emit({ verb: "calendar.edited", summary: `${c.first()} changed ${changes.join(", ")} on ${x.title}.` });
  return c.ok("Saved.");
}

function cancel(c: Ctx, a: { id: string }): ActionResult {
  const g = guard(c, "cancel scheduled items"); if (g) return g;
  const x = schedById(c.s, a.id);
  if (!x || x.status === "cancelled") return c.fail("That item is already cancelled.");
  if (SCHED_EMAIL_KINDS.includes(x.kind) && x.status === "done") return c.fail("That email has been sent, so it cannot be cancelled.");
  if (x.ref?.kind === "task") {
    const t = c.s.tasks.find((y) => y.id === x.ref!.id);
    if (t && t.status === "done") return c.fail("That task is done.");
    c.s.tasks = c.s.tasks.filter((y) => y.id !== x.ref!.id);
  } else if (x.ref?.kind === "flu") {
    const fc = c.s.flu.clinics.find((y) => y.id === x.ref!.id);
    if (fc && fc.status === "completed") return c.fail("That clinic has run.");
    if (fc) fc.status = "cancelled";
  } else if (x.ref?.kind === "oh") {
    const d = c.s.occHealth.diaries.find((y) => y.id === x.ref!.id);
    if (d && d.slots.some((sl) => sl.kind === "booked")) return c.fail("People are booked into that session. Move them in Meddbase first.");
    c.s.occHealth.diaries = c.s.occHealth.diaries.filter((y) => y.id !== x.ref!.id);
  }
  x.status = "cancelled";
  hist(c, x, "Cancelled");
  leadNote(c, x.leadId, `${SCHED_KIND_LABEL[x.kind]} on ${when(x.date, x.start)} cancelled`);
  c.emit({ verb: "calendar.cancelled", summary: `${c.first()} cancelled ${x.title}${x.client ? ` (${x.client})` : ""} on ${when(x.date, x.start)}.` });
  return c.ok(`${x.title} cancelled.`, "info");
}

function markDone(c: Ctx, a: { id: string }): ActionResult {
  const g = guard(c, "mark items done"); if (g) return g;
  const x = schedById(c.s, a.id);
  if (!x || x.status !== "scheduled") return c.fail("That item is not open.");
  if (SCHED_EMAIL_KINDS.includes(x.kind)) return sendNow(c, a);
  if (x.ref?.kind === "task") {
    const r = coreHandlers["task/complete"](c, { taskId: x.ref.id });
    if (!r.ok) return r;
  }
  x.status = "done"; x.doneAt = c.stamp();
  hist(c, x, "Marked done");
  leadNote(c, x.leadId, `${SCHED_KIND_LABEL[x.kind]} on ${when(x.date, x.start)} done`);
  c.emit({ verb: "calendar.done", summary: `${c.first()} marked ${x.title} done.` });
  return c.ok("Marked done.");
}

function sendNow(c: Ctx, a: { id: string }): ActionResult {
  const g = guard(c, "send emails"); if (g) return g;
  const x = schedById(c.s, a.id);
  if (!x || !SCHED_EMAIL_KINDS.includes(x.kind)) return c.fail("That is not a scheduled email.");
  if (x.status !== "scheduled") return c.fail(x.status === "done" ? "Already sent." : "That email was cancelled.");
  x.status = "done"; x.doneAt = c.stamp();
  hist(c, x, "Sent now (simulated)");
  if (x.kind === "follow_up") {
    leadNote(c, x.leadId, `Email: "${x.title}" sent to ${x.contact || "the contact"} (simulated)`);
  } else {
    const o = c.s.onboarding;
    o.seq.email += 1;
    const tpl = RET_DEFAULT_TEMPLATES[x.kind as "results_out" | "rebooking"];
    o.emails.push({ id: `EM-${pad(o.seq.email, 4)}`, template: tpl.id, company: x.client || "", toName: x.contact || "HR contact", toEmail: x.contactEmail || "", subject: x.title, body: "", sentAt: x.doneAt, sentBy: c.persona().name, ref: x.id });
  }
  c.emit({ verb: "calendar.email_sent", simulated: true, summary: `${c.first()} sent "${x.title}" to ${x.contact || x.client || "the contact"}. Simulated: nothing left this demo.` });
  return c.ok(`Sent to ${x.contact || x.client} (simulated).`);
}

/** Log a call against a lead from its calendar event, optionally moving the next step date. */
function leadLogCall(c: Ctx, a: { leadId: string; note: string; nextOn?: LocalDate | null }): ActionResult {
  const g = guard(c, "log calls"); if (g) return g;
  const l = leadOf(c, a.leadId);
  if (!l) return c.fail("Unknown lead.");
  const note = String(a.note || "").trim();
  if (note.length < 3) return c.fail("Write what happened, in a few words.");
  if (a.nextOn && !isDate(a.nextOn)) return c.fail("The next date is not valid.");
  l.history.push({ at: c.stamp(), by: c.persona().id, text: `Call: ${note}` });
  if (a.nextOn) l.nextActionOn = a.nextOn;
  c.emit({ verb: "sales.activity", simulated: true, summary: `${c.first()} logged a call with ${l.company}: ${note}${a.nextOn ? ` Next step on ${fmtDate(a.nextOn)}.` : ""}` });
  return c.ok(`Call logged on ${l.company}${a.nextOn ? `. Next step ${fmtWeekdayDate(a.nextOn)}` : ""}.`);
}

registerHandlers({
  "sched/create": create,
  "sched/move": move,
  "sched/edit": edit,
  "sched/cancel": cancel,
  "sched/done": markDone,
  "sched/sendNow": sendNow,
  "sched/leadLogCall": leadLogCall,
});

export const schedAct = {
  create: (form: SchedForm) => ({ type: "sched/create", form }),
  move: (calId: string, date: LocalDate, start?: Hhmm | null, end?: Hhmm | null) => ({ type: "sched/move", calId, date, start, end }),
  edit: (id: string, patch: { title?: string; notes?: string; contact?: string; staffIds?: StaffId[]; template?: string }) => ({ type: "sched/edit", id, patch }),
  cancel: (id: string) => ({ type: "sched/cancel", id }),
  done: (id: string) => ({ type: "sched/done", id }),
  sendNow: (id: string) => ({ type: "sched/sendNow", id }),
  leadLogCall: (leadId: string, note: string, nextOn?: LocalDate | null) => ({ type: "sched/leadLogCall", leadId, note, nextOn }),
};
