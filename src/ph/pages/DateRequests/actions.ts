/* Client date request actions, registered at import time.
   Staff ask (any person who sets up screening days); the client's HR contact suggests dates and
   accepts a proposal in the client portal; only Dr Neil Reddy approves, proposes another date or
   declines. Agents can never approve. Approving creates the screening days (and their clinic
   sessions) with the client's room and contact, as drafts or published. Every step is logged on the
   request with who and when, and in the activity feed. A failed check leaves the state untouched. */
import {
  DR_EXTRA_CHOICES, DR_STARTS, PROGRAMME_BY_ID, addDays, dayErrors, drDayForm, drDayInfo, drFreeNurses, drHours, drOpen, drPickProblem, drPickText,
  fmtDate, fmtWeekdayDate, registerHandlers, rotaBusyReason, schedStaffBlock, sessionFromDay, sessionIdForDay, today,
} from "../../model";
import type { ActionResult, Ctx, DateRequest, DayScreen, DrCounterPick, DrLogEntry, DrPick, ProgrammeId, ScreeningDay, StaffId } from "../../model";
import { clientContact } from "../ClientPortal/data";

type AgentMark = { agentId?: string; actor?: { kind?: string } };
const isAgent = (a: AgentMark) => !!a.agentId || a.actor?.kind === "agent";

function canAsk(c: Ctx): ActionResult | null {
  const p = c.persona();
  if (p.isParticipant) return c.fail("The participant preview cannot ask a client for dates. This is a staff action.");
  if (!(c.can("bookings.manage") || p.role === "clinical_review")) return c.fail(`${p.name} (${p.roleLabel}) cannot ask clients for dates. Stephen, Liz, Brenda or Dr Neil Reddy can.`);
  return null;
}
/** Only the Medical Director decides on a client's dates. */
function neilOnly(c: Ctx, a: AgentMark, what: string): ActionResult | null {
  if (isAgent(a)) return c.fail(`Agents cannot ${what}. Only Dr Neil Reddy can.`);
  const p = c.persona();
  if (p.isParticipant || p.role !== "clinical_review") return c.fail(`Only Dr Neil Reddy can ${what}. ${p.name} can ask the client and follow the request. Switch to Dr Neil Reddy to try it.`);
  return null;
}
const find = (c: Ctx, id: string) => c.s.dateRequests.requests.find((r) => r.id === id);
const clientOf = (r: Pick<DateRequest, "programmeId">) => PROGRAMME_BY_ID[r.programmeId]?.clientName || "The client";
const log = (r: DateRequest, e: Omit<DrLogEntry, "at">, at: string) => r.log.push({ at, ...e });
const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + "T12:00:00Z"));
const pickList = (picks: DrPick[]) => picks.map((p) => `${fmtWeekdayDate(p.date)} (${drPickText(p).toLowerCase()})`).join(", ");

function cleanPicks(raw: unknown): DrPick[] | null {
  if (!Array.isArray(raw)) return null;
  const out: DrPick[] = [];
  for (const x of raw as DrPick[]) {
    if (!x || !isDate(x.date) || (x.part !== "full" && x.part !== "morning") || !DR_STARTS.includes(x.start)) return null;
    if (out.some((o) => o.date === x.date)) continue;
    out.push({ date: x.date, part: x.part, start: x.start });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Creates one screening day (and its clinic session) for an approved date. Returns an error or the day. */
function createDay(c: Ctx, r: DateRequest, p: DrPick, nurseId: StaffId, publish: boolean, by: string, summary: string): string | ScreeningDay {
  const f = drDayForm(r, p, nurseId);
  const errs = dayErrors(f, { today: today(c.s), sessions: c.s.sessions, ownSessionId: null, staff: c.s.staff });
  const first = Object.values(errs)[0] || schedStaffBlock(c.s, nurseId, p.date) || rotaBusyReason(c.s, nurseId, { date: p.date, ...drHours(p), key: "dr:new" });
  if (first) return `${fmtDate(p.date)}: ${first}`;
  const n = Math.max(0, ...c.s.screeningDays.days.map((d) => Number(d.id.slice(3)) || 0)) + 1;
  const id = `SD-${String(n).padStart(4, "0")}`;
  const sessionId = sessionIdForDay(r.programmeId, p.date, new Set(c.s.sessions.map((x) => x.id)));
  const at = c.stamp();
  const day: ScreeningDay = {
    ...f, programmeId: r.programmeId, nurseId, date: p.date, id, sessionId, status: publish ? "published" : "draft",
    createdAt: at, createdBy: by, publishedAt: publish ? at : null, publishedBy: publish ? by : null,
    history: [{ at, by, kind: "created", via: "form", summary, changes: [] }],
  };
  if (publish) day.history.push({ at, by, kind: "published", via: null, summary: "Published to the client portal.", changes: [] });
  c.s.screeningDays.days.push(day);
  c.s.sessions.push(sessionFromDay(day, c.s.sessions));
  c.inv();
  return day;
}

registerHandlers({
  /** Staff ask the client's HR contact to suggest dates. The email is simulated. */
  "dr/ask": (c, a: { programmeId: ProgrammeId; daysNeeded: number; from: string; to: string; screen: DayScreen; message?: string }) => {
    const deny = canAsk(c); if (deny) return deny;
    const prog = c.s.programmes.find((p) => p.id === a.programmeId);
    if (!prog) return c.fail("Choose the client.");
    const n = Number(a.daysNeeded);
    if (!Number.isInteger(n) || n < 1 || n > 5) return c.fail("Ask for 1 to 5 days.");
    if (!isDate(a.from) || !isDate(a.to)) return c.fail("Choose the first and last date the client can pick from.");
    const t = today(c.s);
    if (a.from <= t) return c.fail("The first date must be after today.");
    if (a.to < a.from) return c.fail("The last date must be on or after the first date.");
    if (Date.parse(a.to) - Date.parse(a.from) > 120 * 86400000) return c.fail("Keep the window to four months or less.");
    if (a.screen !== "lab" && a.screen !== "poc") return c.fail("Choose lab bloods or point of care.");
    let open = 0;
    for (let d = a.from; d <= a.to; d = addDays(d, 1)) if (drDayInfo(c.s, d, null).pickable) open++;
    if (open < n) return c.fail(`Only ${plural(open, "day")} in that window ${open === 1 ? "has" : "have"} a nurse free. Widen the dates.`);
    const existing = c.s.dateRequests.requests.find((r) => r.programmeId === prog.id && drOpen(r));
    if (existing) return c.fail(`${prog.clientName} already has an open date request (${existing.id}). Open it from Requests from clients.`);
    const hr = clientContact(prog.id);
    const id = `DR-${String(Math.max(0, ...c.s.dateRequests.requests.map((r) => Number(r.id.slice(3)) || 0)) + 1).padStart(4, "0")}`;
    const at = c.stamp(), by = c.persona().name;
    const msg = String(a.message || "").trim().slice(0, 300);
    const r: DateRequest = {
      id, programmeId: prog.id, daysNeeded: n, from: a.from, to: a.to, screen: a.screen, message: msg,
      askedAt: at, askedBy: by, contactName: hr?.name || `${prog.clientName} HR`, contactEmail: hr?.email || "",
      status: "asked", picks: [], room: "", siteContactName: "", siteContactPhone: "", notes: "", suggestedAt: null, counter: null,
      decidedAt: null, decidedBy: null, declineReason: "", dayIds: [], log: [],
    };
    const what = `${plural(n, `${a.screen === "poc" ? "point of care" : "lab bloods"} day`)} between ${fmtDate(a.from)} and ${fmtDate(a.to)}`;
    log(r, { by, side: "staff", kind: "asked", text: `Asked ${prog.clientName} for ${what}. Email sent to ${r.contactName} (simulated).` }, at);
    c.s.dateRequests.requests.push(r);
    c.emit({ verb: "dr.asked", simulated: true, summary: `${c.first()} asked ${prog.clientName} to suggest dates: ${what}. ${r.contactName} was emailed a link to the client portal (simulated).`, programmeId: prog.id });
    return c.ok(`${prog.clientName} has been asked for dates. ${r.contactName} sees the request in the client portal (email simulated).`, "ok", id);
  },

  /** The client's HR contact suggests dates in the client portal. */
  "dr/suggest": (c, a: { requestId: string; picks: DrPick[]; room: string; siteContactName: string; siteContactPhone?: string; notes?: string }) => {
    const r = find(c, a.requestId);
    if (!r) return c.fail("That request was not found.");
    if (r.status !== "asked") return c.fail(r.status === "suggested" ? "Your dates are already with Precision Health." : "This request is not waiting for dates.");
    const picks = cleanPicks(a.picks);
    if (!picks || !picks.length) return c.fail("Pick at least one day on the calendar.");
    const max = r.daysNeeded + DR_EXTRA_CHOICES;
    if (picks.length > max) return c.fail(`Pick up to ${max} days.`);
    for (const p of picks) { const e = drPickProblem(c.s, p, r); if (e) return c.fail(e); }
    const room = String(a.room || "").trim(), who = String(a.siteContactName || "").trim(), phone = String(a.siteContactPhone || "").trim();
    if (room.length < 3) return c.fail("Add the room and location for the screening.");
    if (room.length > 120) return c.fail("Keep the room under 120 characters.");
    if (who.length < 2) return c.fail("Add the contact on site for the day.");
    if (phone && !/^[+\d][\d\s()-]{6,}$/.test(phone)) return c.fail("Enter a phone number, for example 087 555 0142.");
    r.picks = picks; r.room = room; r.siteContactName = who; r.siteContactPhone = phone; r.notes = String(a.notes || "").trim().slice(0, 400);
    r.status = "suggested"; r.suggestedAt = c.stamp();
    log(r, { by: r.contactName, side: "client", kind: "suggested", text: `Suggested ${pickList(picks)}. Room: ${room}. Contact on the day: ${who}${phone ? `, ${phone}` : ""}.` }, r.suggestedAt);
    c.emit({ verb: "dr.suggested", actor: { kind: "system", id: "client-portal", label: `${r.contactName} (${clientOf(r)} HR)` }, summary: `${r.contactName} (${clientOf(r)} HR) suggested ${plural(picks.length, "date")} in the client portal for ${r.id}. Waiting for Dr Neil Reddy to approve.`, programmeId: r.programmeId });
    return c.ok("Thank you. Your dates are with Precision Health. You will see here when they are confirmed.", "ok", r.id);
  },

  /** Neil approves some or all of the suggested dates, choosing a free nurse for each. */
  "dr/approve": (c, a: AgentMark & { requestId: string; picks: Array<{ date: string; nurseId: StaffId }>; publish: boolean }) => {
    const deny = neilOnly(c, a, "approve a client's dates"); if (deny) return deny;
    const r = find(c, a.requestId);
    if (!r) return c.fail("That request was not found.");
    if (r.status !== "suggested") return c.fail("This request has no suggested dates waiting.");
    const chosen = Array.isArray(a.picks) ? a.picks : [];
    if (!chosen.length) return c.fail("Tick at least one date to approve.");
    const seen = new Set<string>();
    const plan: Array<{ p: DrPick; nurseId: StaffId }> = [];
    for (const x of chosen) {
      const p = r.picks.find((y) => y.date === x.date);
      if (!p || seen.has(x.date)) return c.fail("Approve only the dates the client suggested.");
      seen.add(x.date);
      if (!x.nurseId) return c.fail(`Choose a nurse for ${fmtDate(x.date)}.`);
      plan.push({ p, nurseId: x.nurseId });
    }
    const by = c.persona().name;
    const made: ScreeningDay[] = [];
    for (const x of plan) {
      const d = createDay(c, r, x.p, x.nurseId, !!a.publish, by, `Created from ${clientOf(r)}'s date request ${r.id}, approved by ${by}.`);
      if (typeof d === "string") return c.fail(d);
      made.push(d);
    }
    r.status = "approved"; r.decidedAt = c.stamp(); r.decidedBy = by; r.dayIds = made.map((d) => d.id);
    const names = made.map((d) => `${fmtWeekdayDate(d.date)} with ${c.s.staff.find((s) => s.id === d.nurseId)?.name || d.nurseId}`).join("; ");
    log(r, { by, side: "staff", kind: "approved", text: `Approved ${names}. ${a.publish ? "Published to the client portal." : "Saved as draft screening days."}` }, r.decidedAt);
    for (const d of made) c.emit({ verb: "dr.approved", summary: `${c.first()} approved ${clientOf(r)}'s suggested date ${fmtWeekdayDate(d.date)} (${r.id}): screening day ${d.id}, ${d.room}, ${c.s.staff.find((s) => s.id === d.nurseId)?.name}. ${a.publish ? "Published to the client portal." : "Draft."}`, entity: { kind: "session", id: d.sessionId }, programmeId: r.programmeId });
    const short = made.length < r.daysNeeded ? ` ${plural(r.daysNeeded - made.length, "more day")} still to find.` : "";
    return c.ok(`${plural(made.length, "screening day")} created for ${clientOf(r)}${a.publish ? " and published to their portal" : " as drafts"}.${short}`, "ok", made[0].id);
  },

  /** Neil proposes other dates; they go back to the client portal for one-click acceptance. */
  "dr/counter": (c, a: AgentMark & { requestId: string; picks: DrCounterPick[]; note?: string }) => {
    const deny = neilOnly(c, a, "propose dates to a client"); if (deny) return deny;
    const r = find(c, a.requestId);
    if (!r) return c.fail("That request was not found.");
    if (r.status !== "suggested" && r.status !== "asked") return c.fail("This request is not waiting for a decision.");
    const picks = cleanPicks(a.picks);
    if (!picks || !picks.length) return c.fail("Choose at least one date to propose.");
    if (picks.length > r.daysNeeded) return c.fail(`Propose up to ${plural(r.daysNeeded, "date")}, the number of days needed.`);
    const out: DrCounterPick[] = [];
    for (const p of picks) {
      const e = drPickProblem(c.s, p, null); if (e) return c.fail(e);
      const want = (a.picks as DrCounterPick[]).find((x) => x.date === p.date)?.nurseId;
      const free = drFreeNurses(c.s, p.date, drHours(p).start, drHours(p).end);
      if (!want || !free.some((n) => n.id === want)) return c.fail(`Choose a free nurse for ${fmtDate(p.date)}.`);
      out.push({ ...p, nurseId: want });
    }
    const note = String(a.note || "").trim().slice(0, 300);
    const by = c.persona().name, at = c.stamp();
    r.counter = { picks: out, note, at, by };
    r.status = "countered";
    log(r, { by, side: "staff", kind: "countered", text: `Proposed ${pickList(out)} instead${note ? `: "${note}"` : ""}. Sent to ${r.contactName} in the client portal.` }, at);
    c.emit({ verb: "dr.countered", summary: `${c.first()} proposed ${plural(out.length, "other date")} to ${clientOf(r)} for ${r.id}: ${out.map((p) => fmtWeekdayDate(p.date)).join(", ")}. Waiting for ${r.contactName} to accept.`, programmeId: r.programmeId });
    return c.ok(`Your proposal is in ${clientOf(r)}'s portal. ${r.contactName} can accept it with one click.`, "ok", r.id);
  },

  /** The client accepts Neil's proposal: the days are created and published. */
  "dr/acceptCounter": (c, a: { requestId: string }) => {
    const r = find(c, a.requestId);
    if (!r) return c.fail("That request was not found.");
    if (r.status !== "countered" || !r.counter) return c.fail("There is no proposal waiting.");
    const made: ScreeningDay[] = [];
    for (const p of r.counter.picks) {
      /* Keep Neil's nurse; if they have since been booked, take another free nurse rather than fail the client. */
      const h = drHours(p);
      const free = drFreeNurses(c.s, p.date, h.start, h.end);
      const nurse = free.find((n) => n.id === p.nurseId) || free[0];
      if (!nurse) return c.fail(`${fmtWeekdayDate(p.date)} is no longer free. Please suggest other dates.`);
      const d = createDay(c, r, p, nurse.id, true, r.counter.by, `Created from ${clientOf(r)}'s date request ${r.id}: proposed by ${r.counter.by}, accepted by ${r.contactName}.`);
      if (typeof d === "string") return c.fail(d);
      made.push(d);
    }
    r.status = "approved"; r.decidedAt = c.stamp(); r.decidedBy = r.counter.by; r.dayIds = made.map((d) => d.id);
    if (!r.room) r.room = made[0]?.room || "";
    log(r, { by: r.contactName, side: "client", kind: "accepted", text: `Accepted ${pickList(r.counter.picks)}. Screening ${made.length === 1 ? "day" : "days"} created and published.` }, r.decidedAt);
    c.emit({ verb: "dr.accepted", actor: { kind: "system", id: "client-portal", label: `${r.contactName} (${clientOf(r)} HR)` }, summary: `${r.contactName} (${clientOf(r)} HR) accepted the proposed ${made.length === 1 ? "date" : "dates"} for ${r.id}: ${made.map((d) => fmtWeekdayDate(d.date)).join(", ")}. Published.`, programmeId: r.programmeId, entity: made[0] ? { kind: "session", id: made[0].sessionId } : null });
    return c.ok(`Confirmed. ${made.length === 1 ? "Your screening day is" : "Your screening days are"} booked and listed under Upcoming screening dates.`, "ok", r.id);
  },

  /** The client would rather choose other dates: the request goes back to them. */
  "dr/rejectCounter": (c, a: { requestId: string }) => {
    const r = find(c, a.requestId);
    if (!r) return c.fail("That request was not found.");
    if (r.status !== "countered") return c.fail("There is no proposal waiting.");
    r.status = "asked";
    const at = c.stamp();
    log(r, { by: r.contactName, side: "client", kind: "rejected_counter", text: "Would rather suggest other dates." }, at);
    c.emit({ verb: "dr.rejectedCounter", actor: { kind: "system", id: "client-portal", label: `${r.contactName} (${clientOf(r)} HR)` }, summary: `${r.contactName} (${clientOf(r)} HR) asked to suggest other dates for ${r.id}.`, programmeId: r.programmeId });
    return c.ok("No problem. Pick the days that suit you on the calendar.", "ok", r.id);
  },

  /** Neil declines with a reason the client sees. */
  "dr/decline": (c, a: AgentMark & { requestId: string; reason: string }) => {
    const deny = neilOnly(c, a, "decline a client's dates"); if (deny) return deny;
    const r = find(c, a.requestId);
    if (!r) return c.fail("That request was not found.");
    if (!drOpen(r)) return c.fail("This request is already closed.");
    const reason = String(a.reason || "").trim();
    if (reason.length < 8) return c.fail("Give the client a short reason, in a sentence.");
    r.status = "declined"; r.decidedAt = c.stamp(); r.decidedBy = c.persona().name; r.declineReason = reason.slice(0, 300);
    log(r, { by: r.decidedBy, side: "staff", kind: "declined", text: `Declined: "${r.declineReason}"` }, r.decidedAt);
    c.emit({ verb: "dr.declined", summary: `${c.first()} declined ${clientOf(r)}'s date request ${r.id}: ${r.declineReason}`, programmeId: r.programmeId });
    return c.ok(`${clientOf(r)}'s request is declined. They see your reason in their portal.`, "ok", r.id);
  },
});

export const drAct = {
  ask: (programmeId: string, daysNeeded: number, from: string, to: string, screen: DayScreen, message = "") => ({ type: "dr/ask", programmeId, daysNeeded, from, to, screen, message }),
  suggest: (requestId: string, picks: DrPick[], room: string, siteContactName: string, siteContactPhone = "", notes = "") => ({ type: "dr/suggest", requestId, picks, room, siteContactName, siteContactPhone, notes }),
  approve: (requestId: string, picks: Array<{ date: string; nurseId: string }>, publish: boolean) => ({ type: "dr/approve", requestId, picks, publish }),
  counter: (requestId: string, picks: DrCounterPick[], note = "") => ({ type: "dr/counter", requestId, picks, note }),
  acceptCounter: (requestId: string) => ({ type: "dr/acceptCounter", requestId }),
  rejectCounter: (requestId: string) => ({ type: "dr/rejectCounter", requestId }),
  decline: (requestId: string, reason: string) => ({ type: "dr/decline", requestId, reason }),
};
