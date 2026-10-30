/* Nurse rota handlers, registered at import time. Each change is written to the record that owns the
   assignment (clinic session and its screening day, bookings board item, flu clinic, Meddbase
   session), so the Calendar, the nurse portal and the screening day drawer all show it. Leave and
   training are added with the Calendar's own action (sched/create). */
import type { ActionResult, Ctx, LocalDate, RotaItem, RotaRef, StaffId } from "../../model";
import { fmtDate, isRotaNurse, registerHandlers, rotaBusyReason, rotaItemsOn } from "../../model";

function guard(c: Ctx, what: string): ActionResult | null {
  const st = c.staffOnly(what); if (st) return st;
  if (c.can("bookings.manage") || c.persona().role === "clinical_review") return null;
  return c.fail(`${c.persona().name} (${c.persona().roleLabel}) cannot ${what}. Directors, the nursing lead and Programme Operations can. Switch role to try it.`);
}
const nameOf = (c: Ctx, id: string | null | undefined) => (id ? c.s.staff.find((s) => s.id === id)?.name || id : "nobody");
const firstOf = (c: Ctx, id: string | null | undefined) => nameOf(c, id).split(" ")[0];

function findItem(c: Ctx, ref: RotaRef, date: LocalDate): RotaItem | null {
  if (!ref || !date) return null;
  return rotaItemsOn(c.s, date).find((x) => x.ref.kind === ref.kind && x.ref.id === ref.id) || null;
}

/** Write the new lead and support list to the owning record. */
function apply(c: Ctx, item: RotaItem, lead: string | null, support: string[]): void {
  const all = [...(lead ? [lead] : []), ...support.filter((x) => x !== lead)];
  switch (item.ref.kind) {
    case "session": {
      const s = c.s.sessions.find((x) => x.id === item.ref.id)!;
      const before = s.nurseId;
      s.nurseId = (lead || "") as StaffId;
      s.supportIds = support.filter((x) => x !== lead) as StaffId[];
      const day = c.s.screeningDays.days.find((d) => d.sessionId === s.id);
      if (day && day.nurseId !== s.nurseId) {
        const from = nameOf(c, before), to = lead ? nameOf(c, lead) : "Not set";
        day.nurseId = s.nurseId;
        day.history.push({ at: c.stamp(), by: c.persona().name, kind: "edited", via: "form", summary: `Nurse changed on the nurse rota: ${from} to ${to}.`, changes: [{ field: "nurseId", label: "Nurse", from, to }] });
      }
      return;
    }
    case "board": {
      const b = c.s.nurseOps.board.find((x) => x.id === item.ref.id)!;
      b.staffIds = all as StaffId[];
      return;
    }
    case "flu": {
      const f = c.s.flu.clinics.find((x) => x.id === item.ref.id)!;
      f.staffIds = all as StaffId[];
      return;
    }
    case "oh": {
      const d = c.s.occHealth.diaries.find((x) => x.id === item.ref.id)!;
      const st = lead ? c.s.staff.find((x) => x.id === lead) : undefined;
      d.clinicianStaffId = (st?.id || null) as StaffId | null;
      if (st) { d.clinicianName = st.name; d.clinicianRole = st.title; } else { d.clinicianName = "Nurse to confirm"; d.clinicianRole = "Occupational health nurse"; }
      return;
    }
    default:
      return;
  }
}

function editable(c: Ctx, item: RotaItem | null): ActionResult | null {
  if (!item) return c.fail("That item is no longer on the rota for this day.");
  if (item.absence) return c.fail("Change leave and training in the Calendar.");
  if (item.locked) return c.fail(`${item.title} on ${fmtDate(item.date)} has already happened, so its team stays as it was.`);
  return null;
}

function emit(c: Ctx, item: RotaItem, text: string) {
  c.inv();
  c.emit({
    verb: "rota.changed", summary: `${c.first()} ${text} (${item.title}, ${fmtDate(item.date)}) on the nurse rota.`,
    entity: item.ref.kind === "session" ? { kind: "session", id: item.ref.id } : null,
    programmeId: item.ref.kind === "session" ? c.s.sessions.find((x) => x.id === item.ref.id)?.programmeId ?? null : null,
  });
}

function assign(c: Ctx, a: { ref: RotaRef; date: LocalDate; staffId: string; as?: "lead" | "support" }): ActionResult {
  const g = guard(c, "change the nurse rota"); if (g) return g;
  const item = findItem(c, a.ref, a.date);
  const bad = editable(c, item); if (bad) return bad;
  if (!isRotaNurse(c.s, a.staffId)) return c.fail("Choose someone from the nursing team.");
  if (item!.staffIds.includes(a.staffId)) return c.fail(`${nameOf(c, a.staffId)} is already on ${item!.title}.`);
  const busy = rotaBusyReason(c.s, a.staffId, item!); if (busy) return c.fail(busy);
  const asLead = a.as === "lead" || !item!.leadId;
  if (!asLead && item!.ref.kind === "oh") return c.fail("A Meddbase session has one nurse. Use Change nurse instead.");
  if (asLead) apply(c, item!, a.staffId, item!.leadId ? [item!.leadId, ...item!.supportIds] : item!.supportIds);
  else apply(c, item!, item!.leadId, [...item!.supportIds, a.staffId]);
  emit(c, item!, `put ${nameOf(c, a.staffId)} on as ${asLead ? "the nurse" : "support"}`);
  return c.ok(`${nameOf(c, a.staffId)} is on ${item!.title}, ${fmtDate(item!.date)}${asLead ? "" : " as support"}. The calendar and nurse portal show it.`);
}

function swap(c: Ctx, a: { ref: RotaRef; date: LocalDate; fromId: string; toId: string }): ActionResult {
  const g = guard(c, "change the nurse rota"); if (g) return g;
  const item = findItem(c, a.ref, a.date);
  const bad = editable(c, item); if (bad) return bad;
  if (!item!.staffIds.includes(a.fromId)) return c.fail(`${nameOf(c, a.fromId)} is not on ${item!.title}.`);
  if (!isRotaNurse(c.s, a.toId)) return c.fail("Choose someone from the nursing team.");
  if (item!.staffIds.includes(a.toId)) return c.fail(`${nameOf(c, a.toId)} is already on ${item!.title}.`);
  const busy = rotaBusyReason(c.s, a.toId, item!); if (busy) return c.fail(busy);
  const lead = item!.leadId === a.fromId ? a.toId : item!.leadId;
  const support = item!.supportIds.map((x) => (x === a.fromId ? a.toId : x));
  apply(c, item!, lead, support);
  emit(c, item!, `changed ${nameOf(c, a.fromId)} to ${nameOf(c, a.toId)}`);
  return c.ok(`${item!.title}, ${fmtDate(item!.date)}: ${firstOf(c, a.toId)} is on instead of ${firstOf(c, a.fromId)}. The calendar and nurse portal show it.`);
}

function remove(c: Ctx, a: { ref: RotaRef; date: LocalDate; staffId: string }): ActionResult {
  const g = guard(c, "change the nurse rota"); if (g) return g;
  const item = findItem(c, a.ref, a.date);
  const bad = editable(c, item); if (bad) return bad;
  if (!item!.staffIds.includes(a.staffId)) return c.fail(`${nameOf(c, a.staffId)} is not on ${item!.title}.`);
  const wasLead = item!.leadId === a.staffId;
  if (wasLead) apply(c, item!, null, item!.supportIds);
  else apply(c, item!, item!.leadId, item!.supportIds.filter((x) => x !== a.staffId));
  emit(c, item!, `took ${nameOf(c, a.staffId)} off`);
  const empty = wasLead && (item!.ref.kind === "session" || item!.ref.kind === "oh" || !item!.supportIds.length);
  return c.ok(`${firstOf(c, a.staffId)} is off ${item!.title}, ${fmtDate(item!.date)}.${empty ? " It now needs a nurse: it is in the Unstaffed row." : ""}`, empty ? "warn" : "ok");
}

registerHandlers({ "rota/assign": assign, "rota/swap": swap, "rota/remove": remove });

export const rotaAct = {
  assign: (ref: RotaRef, date: LocalDate, staffId: string, as?: "lead" | "support") => ({ type: "rota/assign", ref, date, staffId, as }),
  swap: (ref: RotaRef, date: LocalDate, fromId: string, toId: string) => ({ type: "rota/swap", ref, date, fromId, toId }),
  remove: (ref: RotaRef, date: LocalDate, staffId: string) => ({ type: "rota/remove", ref, date, staffId }),
};
