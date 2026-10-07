/* Flu actions, registered at import time through registerHandlers. Every handler is
   permission-checked (Stephen, Martina and Brenda manage flu; only Stephen opens Precision's own
   flu bookings), validates its input, changes only state.flu and writes one activity event whose
   wording says what was simulated. A failed check leaves the state untouched. */
import {
  FLU_ILH_SAMPLES, FLU_PRECISION_SAMPLES, FLU_SEASON_CURRENT, FLU_SUPPLY_OWNER, FLU_SUPPORT, FLU_VACCINATORS, FLU_FOLLOWUP_ACTIONS,
  fluAccessFor, fluBatchLabel, fluBatchUse, fluColdChainRows, fluExcursionsOf, fluNextId, fluStock, fmtInt, fmtWeekdayDate, plural, registerHandlers,
  startOfWeek, today, weekdayOf,
} from "../../model";
import type { ActionResult, Ctx, FluClinic, FluColdChain, FluFollowUpAction, LocalDate, PhState, StaffId } from "../../model";

const isDate = (v: unknown): v is LocalDate => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + "T12:00:00Z"));
const isHhmm = (v: unknown): v is string => typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const isTemp = (v: unknown): v is number | null => v === null || (typeof v === "number" && Number.isFinite(v) && v >= -10 && v <= 30);
const fmtTemp = (v: number) => `${v.toFixed(1)} °C`;
const yy = (season: number) => String(season).slice(2);

function manage(c: Ctx, what: string): ActionResult | null {
  const p = c.persona();
  if (p.isParticipant) return c.fail(`The participant preview cannot ${what}. This is a staff action.`);
  if (fluAccessFor(p.id) !== "manage") {
    return c.fail(`${p.name} (${p.roleLabel}) cannot ${what}. Stephen, Martina and Brenda manage flu in this demo. Switch role in Settings, Experience to try it.`);
  }
  return null;
}
const me = (c: Ctx) => c.persona().id as StaffId;
const clinicOf = (c: Ctx, id: unknown): FluClinic | undefined => c.s.flu.clinics.find((x) => x.id === id);
const staffLabel = (c: Ctx, id: StaffId) => c.ix().staffById.get(id)?.name || id;
function staffSummary(c: Ctx, ids: StaffId[], rota: number): string {
  const parts = ids.map((id) => staffLabel(c, id));
  if (rota) parts.push(plural(rota, "rota nurse"));
  return parts.length ? parts.join(", ") : "nobody yet";
}

/** Clashes for staff on a date: another flu clinic, or a screening session in Clinics. */
export function fluStaffClashes(s: PhState, date: LocalDate, ids: StaffId[], exceptClinicId: string | null): string[] {
  const out: string[] = [];
  const name = (id: StaffId) => s.staff.find((x) => x.id === id)?.name || id;
  for (const id of ids) {
    const flu = s.flu.clinics.find((x) => x.id !== exceptClinicId && x.date === date && x.status !== "cancelled" && x.staffIds.includes(id));
    if (flu) out.push(`${name(id)} is already on the ${flu.company} flu clinic that day`);
    const ses = s.sessions.find((x) => x.date === date && x.status !== "cancelled" && (x.nurseId === id || x.supportIds.includes(id)));
    if (ses) out.push(`${name(id)} is on a screening clinic at ${ses.siteName} that day`);
  }
  return out;
}

registerHandlers({
  /* Precision's own flu bookings: closed while waiting for vaccine supply. Stephen decides. */
  "flu/setPrecisionLive": (c, a: { live: boolean }) => {
    const deny = manage(c, "change whether Precision flu bookings are live");
    if (deny) return deny;
    if (me(c) !== FLU_SUPPLY_OWNER) return c.fail("Stephen Kelly decides when Precision flu bookings go live. Switch to Stephen in Settings, Experience to try it.");
    if (typeof a.live !== "boolean") return c.fail("Choose live or waiting for vaccine supply.");
    const f = c.s.flu;
    if (f.precisionLive === a.live) return c.fail(a.live ? "Precision flu bookings are already live." : "Precision flu bookings are already waiting for vaccine supply.");
    f.precisionLive = a.live;
    f.liveChange = { at: c.now, by: me(c), live: a.live };
    const st = fluStock(f, FLU_SEASON_CURRENT);
    const waiting = f.clinics.filter((x) => x.season === FLU_SEASON_CURRENT && x.status === "requested");
    if (a.live) {
      c.emit({ verb: "flu.precision_live", simulated: true, summary: `${c.first()} marked flu vaccine supply as arrived and opened Precision flu bookings. ${plural(waiting.length, "waiting request")} can now be slotted into weeks. Simulated: no booking link outside this demo was changed.` });
      return st.onHand > 0
        ? c.ok(`Precision flu bookings are live (Simulated). ${plural(waiting.length, "request")} ready to slot on Bookings by week.`)
        : c.ok(`Precision flu bookings are live (Simulated). No vaccines are recorded in stock yet: record the delivery on Vaccine stock so allocations are covered.`, "warn");
    }
    c.emit({ verb: "flu.precision_paused", simulated: true, summary: `${c.first()} set Precision flu bookings back to waiting for vaccine supply. Simulated: booking links would show the waiting message.` });
    return c.ok("Precision flu bookings are waiting for vaccine supply again (Simulated).", "info");
  },

  /* A submission from the Irish Life Health flu booking form lands on the Irish Life Flu board. */
  "flu/intakeIlh": (c) => {
    const deny = manage(c, "take in flu bookings");
    if (deny) return deny;
    const f = c.s.flu;
    const sample = FLU_ILH_SAMPLES[f.intake.ilh];
    if (!sample) return c.fail("All the sample ILH Flu booking form submissions in this demo have been received.");
    if (sample.date < today(c.s)) return c.fail("That sample submission is for a date that has passed.");
    const id = fluNextId(`FLU-${yy(FLU_SEASON_CURRENT)}-`, f.clinics.map((x) => x.id), 3);
    const n = f.clinics.filter((x) => x.channel === "ilh" && x.season === FLU_SEASON_CURRENT).length + 1;
    f.clinics.push({
      id, season: FLU_SEASON_CURRENT, channel: "ilh", item: `ILH Flu ${yy(FLU_SEASON_CURRENT)}-${String(n).padStart(3, "0")}`, company: sample.company, address: sample.address,
      eircode: sample.eircode, projected: sample.projected, actual: null, date: sample.date, start: sample.start, staffIds: [], rotaNurses: 0, status: "scheduled",
      intake: "ilh_form", receivedOn: today(c.s), preferredWeek: null, batchId: null, coldChain: null, eodId: null, recordedBy: null, recordedAt: null,
    });
    f.intake.ilh += 1;
    c.emit({ verb: "flu.ilh_booking", simulated: true, summary: `ILH Flu booking form: ${sample.company} booked ${sample.projected} projected vaccinations for ${fmtWeekdayDate(sample.date)} at ${sample.start}. Added to the Irish Life Flu board under week beginning ${fmtWeekdayDate(startOfWeek(sample.date))}, nurse to assign. Simulated submission.` });
    return c.ok(`ILH Flu booking received for ${sample.company}: ${sample.projected} projected on ${fmtWeekdayDate(sample.date)} (Simulated).`, "ok", id);
  },

  /* A request through Precision's own flu booking link. Blocked until supply arrives. */
  "flu/intakePrecision": (c) => {
    const deny = manage(c, "take in flu bookings");
    if (deny) return deny;
    const f = c.s.flu;
    if (!f.precisionLive) return c.fail("Precision flu bookings are waiting for vaccine supply. The booking link stays closed until Stephen opens it on Flu, Overview.");
    const sample = FLU_PRECISION_SAMPLES[f.intake.precision];
    if (!sample) return c.fail("All the sample Precision flu booking requests in this demo have been received.");
    const id = fluNextId(`FLU-${yy(FLU_SEASON_CURRENT)}-`, f.clinics.map((x) => x.id), 3);
    const n = f.clinics.filter((x) => x.channel === "precision" && x.season === FLU_SEASON_CURRENT).length + 1;
    f.clinics.push({
      id, season: FLU_SEASON_CURRENT, channel: "precision", item: `Precision Flu ${yy(FLU_SEASON_CURRENT)}-${String(n).padStart(3, "0")}`, company: sample.company, address: sample.address,
      eircode: sample.eircode, projected: sample.projected, actual: null, date: null, start: null, staffIds: [], rotaNurses: 0, status: "requested",
      intake: "precision_link", receivedOn: today(c.s), preferredWeek: sample.preferredWeek, batchId: null, coldChain: null, eodId: null, recordedBy: null, recordedAt: null,
    });
    f.intake.precision += 1;
    c.emit({ verb: "flu.precision_request", simulated: true, summary: `Precision flu booking link: ${sample.company} asked for ${sample.projected} vaccinations in the week beginning ${fmtWeekdayDate(sample.preferredWeek)}. Waiting to be slotted. Simulated request.` });
    return c.ok(`Precision flu request received from ${sample.company} (Simulated). Slot it into a week from the request list.`, "ok", id);
  },

  /* Slot a Precision request into a day and start time once bookings are live. */
  "flu/slotRequest": (c, a: { clinicId: string; date: string; start: string }) => {
    const deny = manage(c, "slot flu requests");
    if (deny) return deny;
    const f = c.s.flu;
    const cl = clinicOf(c, a.clinicId);
    if (!cl || cl.channel !== "precision") return c.fail("That Precision flu request was not found.");
    if (cl.status !== "requested") return c.fail(`${cl.company} is already slotted.`);
    if (!f.precisionLive) return c.fail("Precision flu bookings are waiting for vaccine supply. Stephen opens them on Flu, Overview once stock arrives.");
    if (!isDate(a.date)) return c.fail("Enter the clinic date.");
    if (a.date < today(c.s)) return c.fail("The clinic date cannot be in the past.");
    const dow = weekdayOf(a.date);
    if (dow === 0 || dow === 6) return c.fail("Flu clinics run Monday to Friday.");
    if (!isHhmm(a.start) || a.start < "07:00" || a.start > "17:00") return c.fail("Enter a start time between 07:00 and 17:00.");
    cl.date = a.date; cl.start = a.start; cl.status = "scheduled";
    c.emit({ verb: "flu.slotted", summary: `${c.first()} slotted ${cl.company} (${cl.projected} projected) into ${fmtWeekdayDate(a.date)} at ${a.start}, week beginning ${fmtWeekdayDate(startOfWeek(a.date))}. Nurse to assign.` });
    return c.ok(`${cl.company} slotted for ${fmtWeekdayDate(a.date)} at ${a.start}.`);
  },

  /* Staff onsite: demo nurses plus other rota nurses. No double-booking across flu and screening clinics. */
  "flu/assignStaff": (c, a: { clinicId: string; staffIds: StaffId[]; rotaNurses: number }) => {
    const deny = manage(c, "assign staff to flu clinics");
    if (deny) return deny;
    const cl = clinicOf(c, a.clinicId);
    if (!cl) return c.fail("That flu clinic was not found.");
    if (cl.status !== "scheduled" || !cl.date) return c.fail(cl.status === "requested" ? "Slot the request into a day before assigning staff." : "Staff can only change on a booked clinic that has not run yet.");
    if (cl.date < today(c.s)) return c.fail("That clinic date has passed. Record the actuals instead.");
    const allowed = [...FLU_VACCINATORS, ...FLU_SUPPORT] as StaffId[];
    if (!Array.isArray(a.staffIds) || a.staffIds.some((id) => !allowed.includes(id))) return c.fail("Choose staff from the nursing team.");
    const ids = Array.from(new Set(a.staffIds));
    if (!isInt(a.rotaNurses) || a.rotaNurses < 0 || a.rotaNurses > 4) return c.fail("Rota nurses must be a whole number from 0 to 4.");
    if (ids.length && ids.every((id) => (FLU_SUPPORT as readonly StaffId[]).includes(id)) && a.rotaNurses === 0) return c.fail("Add a vaccinator: Ian goes as support and does not vaccinate.");
    const clashes = fluStaffClashes(c.s, cl.date, ids, cl.id);
    if (clashes.length) return c.fail(`Not assigned: ${clashes.join("; ")}.`);
    const same = ids.length === cl.staffIds.length && ids.every((id) => cl.staffIds.includes(id)) && a.rotaNurses === cl.rotaNurses;
    if (same) return c.fail("Staff onsite is already set to that.");
    cl.staffIds = ids; cl.rotaNurses = a.rotaNurses;
    c.emit({ verb: "flu.staffed", summary: `${c.first()} set staff onsite for ${cl.company} on ${fmtWeekdayDate(cl.date)}: ${staffSummary(c, ids, a.rotaNurses)}. Simulated: the nurse day brief would be prepared from the board.` });
    return c.ok(`Staff onsite for ${cl.company}: ${staffSummary(c, ids, a.rotaNurses)}.`);
  },

  /* After the clinic: actual numbers, the batch used and the cold-chain readings, usually from the End of Day form. */
  "flu/recordActuals": (c, a: { clinicId: string; actual: number; batchId: string | null; preC: number | null; intermediateC: number | null; postC: number | null; eodId?: string | null }) => {
    const deny = manage(c, "record flu clinic actuals");
    if (deny) return deny;
    const f = c.s.flu;
    const cl = clinicOf(c, a.clinicId);
    if (!cl) return c.fail("That flu clinic was not found.");
    if (cl.status === "completed") return c.fail(`Actuals for ${cl.company} were already recorded.`);
    if (cl.status !== "scheduled" || !cl.date) return c.fail("Only a booked clinic can have actuals recorded.");
    if (cl.date > today(c.s)) return c.fail(`Actuals open on the clinic day, ${fmtWeekdayDate(cl.date)}.`);
    if (!isInt(a.actual) || a.actual < 0 || a.actual > 2000) return c.fail("Enter the number of vaccines given as a whole number.");
    if (![a.preC, a.intermediateC, a.postC].every(isTemp)) return c.fail("Temperatures must be numbers in degrees Celsius, or left blank when not recorded.");
    let batchId: string | null = null;
    if (a.actual > 0) {
      if (!a.batchId) return c.fail("Choose the vaccine batch used, from the batches received.");
      const use = fluBatchUse(f, a.batchId);
      if (!use || use.batch.season !== cl.season) return c.fail("That batch was not received this season.");
      if (use.remaining < a.actual) return c.fail(`Batch ${fluBatchLabel(use.batch)} has ${fmtInt(use.remaining)} doses left, fewer than ${fmtInt(a.actual)}. Check the batch on the End of Day form.`);
      batchId = use.batch.id;
    }
    const eods = c.s.nurseOps?.endOfDay || [];
    const eodId = a.eodId ? (eods.some((e) => e.id === a.eodId) ? a.eodId : null) : null;
    if (a.eodId && !eodId) return c.fail("That End of Day submission was not found.");
    const cc: FluColdChain = { preC: a.preC, intermediateC: a.intermediateC, postC: a.postC };
    cl.status = "completed"; cl.actual = a.actual; cl.batchId = batchId; cl.coldChain = cc; cl.eodId = eodId; cl.recordedBy = me(c); cl.recordedAt = c.now;
    const exc = fluExcursionsOf(cc);
    const excText = exc.length ? ` Cold chain excursion: ${exc.map((x) => `${x.reading} ${fmtTemp(x.value)}`).join(", ")}, outside 2 to 8 °C. Follow-up needed.` : "";
    c.emit({ verb: "flu.actuals", summary: `${c.first()} recorded ${fmtInt(a.actual)} of ${fmtInt(cl.projected)} projected vaccinations for ${cl.company} on ${fmtWeekdayDate(cl.date)}${batchId ? `, batch ${fluBatchLabel(f.batches.find((b) => b.id === batchId)!)}` : ""}${eodId ? `, from End of Day form ${eodId}` : ""}.${excText}` });
    return exc.length
      ? c.ok(`Actuals recorded for ${cl.company}. Cold chain excursion recorded: log the follow-up on Cold chain.`, "warn", cl.id)
      : c.ok(`Actuals recorded for ${cl.company}: ${fmtInt(a.actual)} of ${fmtInt(cl.projected)}.`, "ok", cl.id);
  },

  /* A vaccine delivery arrives: the order is received and its batch goes into stock. */
  "flu/recordDelivery": (c, a: { orderId: string; deliveredOn: string; batchCode: string; expiry: string }) => {
    const deny = manage(c, "record vaccine deliveries");
    if (deny) return deny;
    const f = c.s.flu;
    const o = f.orders.find((x) => x.id === a.orderId);
    if (!o) return c.fail("That vaccine order was not found.");
    if (o.status === "delivered") return c.fail(`Order ${o.id} is already recorded as delivered.`);
    if (!isDate(a.deliveredOn)) return c.fail("Enter the delivery date.");
    if (a.deliveredOn > today(c.s)) return c.fail("A delivery cannot be recorded for a future date.");
    if (a.deliveredOn < o.orderedOn) return c.fail("The delivery date is before the order date.");
    const code = String(a.batchCode || "").trim().toUpperCase();
    if (!/^[A-Z0-9]{5,10}$/.test(code)) return c.fail("Enter the batch number from the delivery label, 5 to 10 letters or digits, for example 5DE36D2.");
    if (f.batches.some((b) => b.code === code)) return c.fail(`Batch ${code} is already in stock records.`);
    const exp = String(a.expiry || "").trim();
    const m = /^(0[1-9]|1[0-2])\/(\d{2})$/.exec(exp);
    if (!m) return c.fail("Enter the expiry as MM/YY, for example 06/27.");
    if (`20${m[2]}-${m[1]}` < a.deliveredOn.slice(0, 7)) return c.fail("That batch has already expired.");
    const id = fluNextId(`FB-${yy(o.season)}-`, f.batches.map((b) => b.id), 2);
    f.batches.push({ id, season: o.season, orderId: o.id, code, expiry: exp, quantity: o.quantity, receivedOn: a.deliveredOn });
    o.status = "delivered"; o.deliveredOn = a.deliveredOn;
    const st = fluStock(f, o.season);
    c.emit({ verb: "flu.delivery", simulated: true, summary: `${c.first()} recorded delivery of order ${o.id}: ${fmtInt(o.quantity)} doses, batch ${code} Exp ${exp}, received ${fmtWeekdayDate(a.deliveredOn)}. Stock on hand ${fmtInt(st.onHand)}, allocated ${fmtInt(st.allocated)}. Simulated: recorded from the delivery docket, no supplier system was contacted.` });
    return c.ok(`Delivery recorded: ${fmtInt(o.quantity)} doses of batch ${code} Exp ${exp} (Simulated). Stock on hand ${fmtInt(st.onHand)}.`, st.onHand < st.allocated ? "warn" : "ok", id);
  },

  /* A new line in the Flu Vaccine Order Records. */
  "flu/addOrder": (c, a: { supplier: string; quantity: number; expectedOn: string; note?: string }) => {
    const deny = manage(c, "add vaccine orders");
    if (deny) return deny;
    const f = c.s.flu;
    if (!isInt(a.quantity) || a.quantity < 10 || a.quantity > 10000) return c.fail("Enter a quantity between 10 and 10,000 doses.");
    if (!isDate(a.expectedOn)) return c.fail("Enter the expected delivery date.");
    if (a.expectedOn < today(c.s)) return c.fail("The expected delivery date cannot be in the past.");
    const supplier = String(a.supplier || "").trim().slice(0, 80) || "Supplier to confirm";
    const id = fluNextId(`FVO-${yy(FLU_SEASON_CURRENT)}-`, f.orders.map((o) => o.id), 2);
    f.orders.push({ id, season: FLU_SEASON_CURRENT, supplier, quantity: a.quantity, orderedOn: today(c.s), expectedOn: a.expectedOn, status: "on_order", deliveredOn: null, sampleBatch: null, note: String(a.note || "").trim().slice(0, 200) });
    c.emit({ verb: "flu.order", simulated: true, summary: `${c.first()} added vaccine order ${id}: ${fmtInt(a.quantity)} doses from ${supplier}, expected ${fmtWeekdayDate(a.expectedOn)}. Simulated: no order was sent to a supplier.` });
    return c.ok(`Order ${id} added: ${fmtInt(a.quantity)} doses expected ${fmtWeekdayDate(a.expectedOn)} (Simulated).`, "ok", id);
  },

  /* Doses lost: damaged, drawn up and not used, or discarded after an excursion. */
  "flu/logWastage": (c, a: { batchId: string; doses: number; reason: string }) => {
    const deny = manage(c, "log vaccine wastage");
    if (deny) return deny;
    const f = c.s.flu;
    const use = fluBatchUse(f, a.batchId);
    if (!use) return c.fail("Choose a batch that has been received.");
    if (!isInt(a.doses) || a.doses < 1) return c.fail("Enter the number of doses wasted as a whole number.");
    if (a.doses > use.remaining) return c.fail(`Batch ${fluBatchLabel(use.batch)} has ${fmtInt(use.remaining)} doses left.`);
    const reason = String(a.reason || "").trim();
    if (reason.length < 4) return c.fail("Give a short reason for the wastage.");
    const id = fluNextId(`FW-${yy(use.batch.season)}-`, f.wastage.map((w) => w.id), 2);
    f.wastage.push({ id, season: use.batch.season, batchId: use.batch.id, doses: a.doses, reason: reason.slice(0, 200), on: today(c.s), by: me(c), sourceKey: null });
    c.emit({ verb: "flu.wastage", summary: `${c.first()} logged ${plural(a.doses, "wasted dose")} from batch ${fluBatchLabel(use.batch)}: ${reason.replace(/[.\s]+$/, "")}.` });
    return c.ok(`${plural(a.doses, "dose")} logged as wastage from ${fluBatchLabel(use.batch)}.`);
  },

  /* The follow-up after a reading outside 2 to 8 °C. Discarded doses become wastage on the batch. */
  "flu/logFollowUp": (c, a: { key: string; action: FluFollowUpAction; note: string; dosesDiscarded: number }) => {
    const deny = manage(c, "log cold chain follow-up");
    if (deny) return deny;
    const f = c.s.flu;
    const row = fluColdChainRows(f, c.s.nurseOps?.endOfDay || []).find((r) => r.key === a.key);
    if (!row) return c.fail("Those cold chain readings were not found.");
    if (!row.excursions.length) return c.fail("All readings for that clinic are inside 2 to 8 °C. No follow-up is needed.");
    if (!FLU_FOLLOWUP_ACTIONS.some((x) => x.id === a.action)) return c.fail("Choose the action taken.");
    const note = String(a.note || "").trim();
    if (note.length < 10) return c.fail("Describe what was done in a sentence or two.");
    if (!isInt(a.dosesDiscarded) || a.dosesDiscarded < 0) return c.fail("Doses discarded must be a whole number, 0 if none.");
    const last = row.followUps[row.followUps.length - 1];
    if (last && last.action === a.action && last.note === note && last.dosesDiscarded === a.dosesDiscarded) return c.fail("That follow-up is already logged.");
    if (a.dosesDiscarded > 0) {
      const use = row.batchId ? fluBatchUse(f, row.batchId) : null;
      if (!use) return c.fail("The batch for these readings is not in stock records, so discarded doses cannot be taken off stock. Log the follow-up with 0 doses and record the wastage on Vaccine stock.");
      if (a.dosesDiscarded > use.remaining) return c.fail(`Batch ${fluBatchLabel(use.batch)} has ${fmtInt(use.remaining)} doses left.`);
      f.wastage.push({ id: fluNextId(`FW-${yy(use.batch.season)}-`, f.wastage.map((w) => w.id), 2), season: use.batch.season, batchId: use.batch.id, doses: a.dosesDiscarded,
        reason: `Cold chain excursion at ${row.company}: discarded`, on: today(c.s), by: me(c), sourceKey: row.key });
    }
    const id = fluNextId("FCF-", f.followUps.map((x) => x.id), 3);
    f.followUps.push({ id, key: row.key, action: a.action, note: note.slice(0, 400), dosesDiscarded: a.dosesDiscarded, at: c.now, by: me(c) });
    const label = FLU_FOLLOWUP_ACTIONS.find((x) => x.id === a.action)!.label;
    c.emit({ verb: "flu.cold_chain_followup", summary: `${c.first()} logged cold chain follow-up for ${row.company} on ${fmtWeekdayDate(row.date)} (${row.excursions.map((x) => fmtTemp(x.value)).join(", ")}): ${label.toLowerCase()}${a.dosesDiscarded ? `, ${plural(a.dosesDiscarded, "dose")} discarded` : ""}.` });
    return c.ok(`Follow-up logged for ${row.company}.`, "ok", id);
  },
});

/** Action creators for the Flu pages. dispatch(fluAct.setPrecisionLive(true)). */
export const fluAct = {
  setPrecisionLive: (live: boolean) => ({ type: "flu/setPrecisionLive", live }),
  intakeIlh: () => ({ type: "flu/intakeIlh" }),
  intakePrecision: () => ({ type: "flu/intakePrecision" }),
  slotRequest: (clinicId: string, date: string, start: string) => ({ type: "flu/slotRequest", clinicId, date, start }),
  assignStaff: (clinicId: string, staffIds: StaffId[], rotaNurses: number) => ({ type: "flu/assignStaff", clinicId, staffIds, rotaNurses }),
  recordActuals: (clinicId: string, v: { actual: number; batchId: string | null; preC: number | null; intermediateC: number | null; postC: number | null; eodId?: string | null }) => ({ type: "flu/recordActuals", clinicId, ...v }),
  recordDelivery: (orderId: string, deliveredOn: string, batchCode: string, expiry: string) => ({ type: "flu/recordDelivery", orderId, deliveredOn, batchCode, expiry }),
  addOrder: (supplier: string, quantity: number, expectedOn: string, note?: string) => ({ type: "flu/addOrder", supplier, quantity, expectedOn, note }),
  logWastage: (batchId: string, doses: number, reason: string) => ({ type: "flu/logWastage", batchId, doses, reason }),
  logFollowUp: (key: string, action: FluFollowUpAction, note: string, dosesDiscarded: number) => ({ type: "flu/logFollowUp", key, action, note, dosesDiscarded }),
};

