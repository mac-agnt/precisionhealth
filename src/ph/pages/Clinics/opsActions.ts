/* Nurse operations actions, registered at import time: the Bookings Pending board (status and
   column edits), the nurse day brief (simulated send), the End of Day and Mileage form, and
   subsistence claims and hotel requests with their approval. Board edits need "bookings.manage"
   (Stephen, Liz, Brenda). A nurse submits their own End of Day form and claims; the office can submit
   one for a nurse. Approvers are Stephen, Martina, Brenda and Liz, never for their own request.
   Every change writes one activity event. Dispatch through opsAct. */
import type { ActionResult, BoardRowKind, BoardStatus, BoardScreeningType, Ctx, EodInput, ExpenseInput, SessionLogistics, StaffId } from "../../model";
import {
  BOARD_SCREENING_TYPES, BOARD_STATUSES, EOD_JOB_TYPE_LABEL, EXPENSE_APPROVERS, EXPENSE_KIND_LABEL, boardTarget, briefEveningBefore, eodErrors, eodPayLine, expenseErrors,
  expenseSummary, fmtEuro, fmtWeekdayDate, gapsNext, localDateOf, registerHandlers, staffName, subsistenceAmount,
} from "../../model";
import { clinicOutcomes } from "../NursePortal/data";

const me = (c: Ctx) => c.persona().id as StaffId;
const todayOf = (c: Ctx) => localDateOf(c.now);
const EIRCODE = /^([AC-FHKNPRTV-Y]\d{2}|D6W) ?[0-9AC-FHKNPRTV-Y]{4}$/i;
const normEircode = (v: string) => { const t = v.trim().toUpperCase().replace(/\s+/g, ""); return `${t.slice(0, 3)} ${t.slice(3)}`; };
const isTime = (v: unknown): v is string => typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const NURSE_ROLES = ["nursing_lead", "clinical_capture", "wellness_support", "clinical_review"];

function staffOnly(c: Ctx, what: string): ActionResult | null {
  return c.staffOnly(what);
}
function manageBoard(c: Ctx, what: string): ActionResult | null {
  return staffOnly(c, what) || c.need("bookings.manage", what);
}
function rowLabel(c: Ctx, kind: BoardRowKind, id: string): string {
  const t = boardTarget(c.s, kind, id);
  if (!t) return id;
  return t.item ? `${t.item.client} (${id})` : `${t.session!.siteName} (${id})`;
}

export interface BoardPatch {
  screeningType?: BoardScreeningType; service?: string; bloodCode?: string; address?: string; eircode?: string; parking?: string; contactName?: string; contactPhone?: string;
  staffEmail?: string; staffIds?: StaffId[]; attendanceLink?: string; screeningLink?: string; proposalsLink?: string; accommodation?: string; room?: string; start?: string;
}
const TEXT_FIELDS: Array<[keyof BoardPatch & keyof SessionLogistics, string]> = [
  ["service", "service"], ["bloodCode", "blood code"], ["address", "address"], ["parking", "parking"], ["contactName", "contact on the day"], ["contactPhone", "contact's phone"],
  ["attendanceLink", "attendance link"], ["screeningLink", "screening link"], ["proposalsLink", "proposal link"], ["accommodation", "accommodation"],
];

/** Who may submit or claim for this member of staff. */
function forStaff(c: Ctx, staffId: StaffId, what: string): ActionResult | null {
  const deny = staffOnly(c, what); if (deny) return deny;
  const target = c.s.staff.find((s) => s.id === staffId);
  if (!target || !NURSE_ROLES.includes(target.role)) return c.fail("Choose a nurse or member of the clinical team.");
  if (staffId === me(c)) return null;
  if (c.can("bookings.manage")) return null;
  return c.fail(`${c.persona().name} can ${what} only for themselves. The office (Stephen, Liz, Brenda) can do it for a nurse.`);
}

registerHandlers({
  "ops/setBoardStatus": (c, a: { kind: BoardRowKind; id: string; status: BoardStatus }) => {
    const deny = manageBoard(c, "change the bookings board"); if (deny) return deny;
    if (!BOARD_STATUSES.includes(a.status)) return c.fail("Choose a board status.");
    const t = boardTarget(c.s, a.kind, a.id);
    if (!t) return c.fail("That booking is not on the board.");
    if (t.logistics.status === a.status) return { ok: false, tone: "info", message: "Nothing changed." };
    const from = t.logistics.status;
    t.logistics.status = a.status;
    c.emit({ verb: "board.status", summary: `${c.first()} moved ${rowLabel(c, a.kind, a.id)} from ${from} to ${a.status} on the Bookings Pending board.`, programmeId: t.session?.programmeId ?? null });
    return c.ok(`Status: ${a.status}.`);
  },

  "ops/updateBoardRow": (c, a: { kind: BoardRowKind; id: string; patch: BoardPatch }) => {
    const deny = manageBoard(c, "change the bookings board"); if (deny) return deny;
    const t = boardTarget(c.s, a.kind, a.id);
    if (!t) return c.fail("That booking is not on the board.");
    const p = a.patch || {};
    const L = t.logistics;
    const changed: string[] = [];
    if (p.screeningType !== undefined && p.screeningType !== L.screeningType) {
      if (!BOARD_SCREENING_TYPES.includes(p.screeningType)) return c.fail("Choose a screening type.");
      L.screeningType = p.screeningType; changed.push("screening type");
    }
    if (p.eircode !== undefined) {
      const e = p.eircode.trim();
      if (e && !EIRCODE.test(e)) return c.fail("That Eircode does not look right. It is seven characters, for example D02 XW64.");
      const v = e ? normEircode(e) : null;
      if (v !== L.eircode) { L.eircode = v; changed.push("Eircode"); }
    }
    if (p.staffEmail !== undefined) {
      const list = p.staffEmail.split(/[,;\s]+/).filter(Boolean);
      if (list.some((x) => !isEmail(x))) return c.fail("A staff email does not look right. Separate several with commas.");
      const v = list.join(", ") || null;
      if (v !== (L.staffEmail || null)) { L.staffEmail = v; changed.push("staff email"); }
    }
    for (const [k, label] of TEXT_FIELDS) {
      const raw = p[k];
      if (raw === undefined) continue;
      const v = String(raw).trim();
      if (k === "service" && !v) return c.fail("Give the service, for example Comprehensive health screening.");
      if (v.length > 300) return c.fail(`Keep the ${label} under 300 characters.`);
      const next = v || (k === "service" ? L.service : null);
      if (next !== L[k]) { (L as unknown as Record<string, string | null>)[k] = next; changed.push(label); }
    }
    if (p.room !== undefined) {
      const v = p.room.trim();
      if (t.session) { if (!v) return c.fail("A clinic session needs a room."); if (v !== t.session.room) { t.session.room = v; changed.push("room name"); } }
      else if ((v || null) !== t.item!.room) { t.item!.room = v || null; changed.push("room name"); }
    }
    if (p.staffIds !== undefined) {
      const ids = Array.from(new Set(p.staffIds));
      if (t.session) { const cur = [t.session.nurseId, ...t.session.supportIds]; if (ids.join() !== cur.join()) return c.fail("Change who is onsite for a clinic session on Clinics, Schedule."); }
      else {
        if (ids.some((id) => !c.s.staff.some((x) => x.id === id && NURSE_ROLES.includes(x.role)))) return c.fail("Choose nurses or members of the clinical team.");
        if (ids.join() !== t.item!.staffIds.join()) { t.item!.staffIds = ids; changed.push(ids.length ? `staff onsite (${ids.map((id) => staffName(c.s, id)).join(", ")})` : "staff onsite (none)"); }
      }
    }
    if (p.start !== undefined) {
      if (t.session) { if (p.start !== t.session.start) return c.fail("Change a clinic session's times on Clinics, Schedule, so appointments move with it."); }
      else {
        const v = p.start.trim();
        if (v && !isTime(v)) return c.fail("Enter the start time as HH:MM, for example 09:30.");
        if ((v || null) !== t.item!.start) { t.item!.start = v || null; changed.push("start time"); }
      }
    }
    if (!changed.length) return { ok: false, tone: "info", message: "Nothing changed." };
    c.emit({ verb: "board.updated", summary: `${c.first()} updated ${changed.join(", ")} for ${rowLabel(c, a.kind, a.id)} on the Bookings Pending board.`, programmeId: t.session?.programmeId ?? null });
    return c.ok(`Saved: ${changed.join(", ")}.`);
  },

  "ops/sendBrief": (c, a: { kind: BoardRowKind; id: string; date: string; staffId: StaffId; subject: string }) => {
    const deny = manageBoard(c, "send nurse day briefs"); if (deny) return deny;
    const t = boardTarget(c.s, a.kind, a.id);
    if (!t) return c.fail("That booking is not on the board.");
    const dates = t.session ? [t.session.date] : t.item!.dates;
    if (!dates.includes(a.date)) return c.fail("Choose one of the booking's dates.");
    if (a.date < todayOf(c)) return c.fail("That day has passed. Briefs are for days still to come.");
    const staff = t.session ? [t.session.nurseId, ...t.session.supportIds] : t.item!.staffIds;
    if (!staff.includes(a.staffId)) return c.fail("Choose someone who is onsite that day.");
    const ops = c.s.nurseOps;
    if (ops.briefs.some((b) => b.status === "scheduled" && b.target.kind === a.kind && b.target.id === a.id && b.target.date === a.date && b.staffId === a.staffId)) {
      return c.fail(`${staffName(c.s, a.staffId)} already has the brief for ${fmtWeekdayDate(a.date)}.`);
    }
    const n = ops.briefs.reduce((m, b) => Math.max(m, Number(b.id.slice(4)) || 0), 0) + 1;
    const evening = briefEveningBefore(a.date);
    const id = `BRF-${String(n).padStart(4, "0")}`;
    ops.briefs.push({ id, target: { kind: a.kind, id: a.id, date: a.date }, staffId: a.staffId, channels: ["email", "whatsapp"], scheduledFor: evening < c.now ? c.now : evening,
      createdAt: c.now, createdBy: me(c), status: "scheduled", subject: String(a.subject || "").slice(0, 200) || `Health Screening brief, ${fmtWeekdayDate(a.date)}` });
    c.emit({ verb: "board.brief", simulated: true, integrationId: "email", summary: `${c.first()} sent the nurse day brief for ${rowLabel(c, a.kind, a.id)}, ${fmtWeekdayDate(a.date)}, to ${staffName(c.s, a.staffId)} by email and WhatsApp. Simulated: nothing left Pulse.` });
    return c.ok(`Brief ${id} to ${staffName(c.s, a.staffId)}. It goes out at 18:00 the evening before.`, "ok", id);
  },

  "ops/submitEod": (c, a: { input: EodInput }) => {
    const i = a.input;
    if (!i) return c.fail("Fill in the End of Day form.");
    const deny = forStaff(c, i.staffId, "submit the End of Day form"); if (deny) return deny;
    const errs = eodErrors(i, todayOf(c));
    const first = Object.values(errs)[0];
    if (first) return c.fail(first);
    // On the clinic day every appointment needs an outcome (completed, did not arrive or cancelled) before the form goes in.
    const session = i.sessionId ? c.s.sessions.find((x) => x.id === i.sessionId) : undefined;
    if (session && session.date === todayOf(c)) {
      const left = clinicOutcomes(c.s, session).open.length;
      if (left) return c.fail(`${left} appointment${left === 1 ? " is" : "s are"} not accounted for yet. Check in, Did not arrive or Cancelled for each one first.`);
    }
    const ops = c.s.nurseOps;
    const dup = ops.endOfDay.find((e) => e.staffId === i.staffId && e.date === i.date && ((i.sessionId && e.sessionId === i.sessionId) || (i.boardItemId && e.boardItemId === i.boardItemId) || (!i.sessionId && !i.boardItemId && e.clientLocation.trim().toLowerCase() === i.clientLocation.trim().toLowerCase())));
    if (dup) return c.fail(`${staffName(c.s, i.staffId)} already submitted the End of Day form for this day (${dup.id}).`);
    const n = ops.endOfDay.reduce((m, e) => Math.max(m, Number(e.id.slice(4)) || 0), 0) + 1;
    const id = `EOD-${String(n).padStart(4, "0")}`;
    ops.endOfDay.push({
      ...i, id, clientLocation: i.clientLocation.trim(), issues: i.issues.trim(), vaccineBatch: i.vaccineBatch ? i.vaccineBatch.trim() : null, mileageKm: i.outsideDublin ? i.mileageKm : null,
      submittedAt: c.now, submittedBy: i.staffId === me(c) ? null : me(c),
    });
    const pay = eodPayLine(i);
    const by = i.staffId === me(c) ? "" : ` (submitted by ${c.first()})`;
    c.emit({ verb: "eod.submitted", summary: `${staffName(c.s, i.staffId)} submitted End of Day ${id}${by}: ${i.clientLocation.trim()}, ${fmtWeekdayDate(i.date)}, ${EOD_JOB_TYPE_LABEL[i.jobType]}, ${i.dayLength} day${i.outsideDublin ? `, ${i.mileageKm} km mileage` : ""}. Pay line ${fmtEuro(pay.total)} (illustrative).`, programmeId: i.programmeId });
    return c.ok(`End of Day ${id} submitted.${i.outsideDublin ? ` Mileage ${i.mileageKm} km, ${fmtEuro(pay.mileage)}.` : ""}`, "ok", id);
  },

  "ops/requestExpense": (c, a: { input: ExpenseInput }) => {
    const i = a.input;
    if (!i) return c.fail("Fill in the form.");
    const deny = forStaff(c, i.staffId, i.kind === "hotel" ? "request a hotel" : "claim subsistence"); if (deny) return deny;
    const errs = expenseErrors(i, todayOf(c));
    const first = Object.values(errs)[0];
    if (first) return c.fail(first);
    const g = c.s.gaps;
    if (i.kind === "subsistence" && g.expenses.some((e) => e.kind === "subsistence" && e.staffId === i.staffId && e.date === i.date && e.status !== "declined")) {
      return c.fail(`${staffName(c.s, i.staffId)} already has a subsistence claim for ${fmtWeekdayDate(i.date)}.`);
    }
    if (i.target && !boardTarget(c.s, i.target.kind, i.target.id)) return c.fail("That booking is not on the board.");
    const id = gapsNext(g, "expense", "EXP");
    const meals = i.kind === "subsistence" ? Array.from(new Set(i.meals)) : [];
    g.expenses.push({
      id, kind: i.kind, staffId: i.staffId, date: i.date, clientLocation: i.clientLocation.trim(), target: i.target, meals, amount: i.kind === "subsistence" ? subsistenceAmount(meals) : 0,
      nights: i.kind === "hotel" ? i.nights : 0, area: i.kind === "hotel" ? i.area.trim() : "", note: i.note.trim(), status: "pending", requestedAt: c.now, requestedBy: me(c),
      decidedAt: null, decidedBy: null, decisionNote: "", hotel: null, bookingRef: null,
    });
    const e = g.expenses[g.expenses.length - 1];
    c.emit({ verb: "expense.requested", summary: `${staffName(c.s, i.staffId)}: ${EXPENSE_KIND_LABEL[i.kind].toLowerCase()} ${id} for ${e.clientLocation}, ${expenseSummary(e)}. Waiting for approval in Work, Approvals.` });
    return c.ok(`${EXPENSE_KIND_LABEL[i.kind]} ${id} sent for approval.`, "ok", id);
  },

  "ops/decideExpense": (c, a: { id: string; approve: boolean; note?: string }) => {
    const deny = staffOnly(c, "approve expenses"); if (deny) return deny;
    if (!EXPENSE_APPROVERS.includes(me(c))) return c.fail(`${c.persona().name} cannot approve expenses. Stephen, Martina, Brenda or Liz approve them.`);
    const e = c.s.gaps.expenses.find((x) => x.id === a.id);
    if (!e) return c.fail("Unknown request.");
    if (e.status !== "pending") return c.fail(`${e.id} is already ${e.status === "booked" ? "booked" : e.status}.`);
    if (e.staffId === me(c)) return c.fail("You cannot approve your own request. Another approver decides it.");
    const note = String(a.note || "").trim();
    if (!a.approve && note.length < 3) return c.fail("Say why it is declined, in a few words. The nurse sees it.");
    e.status = a.approve ? "approved" : "declined";
    e.decidedAt = c.now; e.decidedBy = me(c); e.decisionNote = note;
    c.emit({ verb: a.approve ? "expense.approved" : "expense.declined", summary: `${c.first()} ${a.approve ? "approved" : "declined"} ${EXPENSE_KIND_LABEL[e.kind].toLowerCase()} ${e.id} for ${staffName(c.s, e.staffId)}${note ? `: ${note}` : ""}.` });
    return c.ok(`${e.id} ${a.approve ? "approved" : "declined"}.${a.approve && e.kind === "hotel" ? " Book the hotel next." : ""}`);
  },

  "ops/bookHotel": (c, a: { id: string; hotel: string }) => {
    const deny = staffOnly(c, "book hotels"); if (deny) return deny;
    if (!EXPENSE_APPROVERS.includes(me(c))) return c.fail(`${c.persona().name} cannot book hotels. Stephen, Martina, Brenda or Liz do.`);
    const e = c.s.gaps.expenses.find((x) => x.id === a.id);
    if (!e || e.kind !== "hotel") return c.fail("Unknown hotel request.");
    if (e.status !== "approved") return c.fail(e.status === "booked" ? `${e.id} is already booked.` : "Approve the request before booking the hotel.");
    const hotel = String(a.hotel || "").trim();
    if (hotel.length < 3) return c.fail("Give the hotel name.");
    e.status = "booked"; e.hotel = hotel;
    e.bookingRef = `HB-26-${String(400 + c.s.gaps.expenses.filter((x) => x.bookingRef).length + 13).padStart(4, "0")}`;
    let wrote = "";
    if (e.target) {
      const t = boardTarget(c.s, e.target.kind, e.target.id);
      if (t) { t.logistics.accommodation = `${e.nights} night${e.nights === 1 ? "" : "s"} from ${fmtWeekdayDate(e.date)}, ${hotel}.`; wrote = " Added to the board row, so the nurse day brief shows it."; }
    }
    c.emit({ verb: "expense.hotel_booked", simulated: true, summary: `${c.first()} booked ${hotel} for ${staffName(c.s, e.staffId)}, ${expenseSummary(e)}, reference ${e.bookingRef}. Simulated booking.${wrote}` });
    return c.ok(`Hotel booked, reference ${e.bookingRef}.${wrote}`, "ok", e.id);
  },
});

export const opsAct = {
  setBoardStatus: (kind: BoardRowKind, id: string, status: BoardStatus) => ({ type: "ops/setBoardStatus", kind, id, status }),
  updateBoardRow: (kind: BoardRowKind, id: string, patch: BoardPatch) => ({ type: "ops/updateBoardRow", kind, id, patch }),
  sendBrief: (kind: BoardRowKind, id: string, date: string, staffId: StaffId, subject: string) => ({ type: "ops/sendBrief", kind, id, date, staffId, subject }),
  submitEod: (input: EodInput) => ({ type: "ops/submitEod", input }),
  requestExpense: (input: ExpenseInput) => ({ type: "ops/requestExpense", input }),
  decideExpense: (id: string, approve: boolean, note?: string) => ({ type: "ops/decideExpense", id, approve, note }),
  bookHotel: (id: string, hotel: string) => ({ type: "ops/bookHotel", id, hotel }),
};
