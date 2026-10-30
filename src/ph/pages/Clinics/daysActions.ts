/* Screening day actions, registered at import time. Saving a day creates or updates its clinic
   session, so the Clinics schedule, appointments and the client portal all read the same record.
   Every change is logged on the day (who, when, what changed) and in the activity feed. A failed
   check leaves the state untouched. The agent only proposes: these handlers run when a person confirms. */
import { PROGRAMME_BY_ID, activeBookings, dayErrors, diffForms, fmtDate, fmtHm, formOf, publishBlockers, registerHandlers, sessionFromDay, sessionIdForDay, sessionSlots, today } from "../../model";
import type { ActionResult, Ctx, DayChange, DayForm, DayHistoryEntry, ProgrammeId, ScreeningDay, StaffId } from "../../model";

type Via = "agent" | "form" | "hr_email";

function canManage(c: Ctx, what: string): ActionResult | null {
  const p = c.persona();
  if (p.isParticipant) return c.fail(`The participant preview cannot ${what}. This is a staff action.`);
  if (!(c.can("bookings.manage") || p.role === "clinical_review")) {
    return c.fail(`${p.name} (${p.roleLabel}) cannot ${what}. Directors, the nursing lead and Programme Operations can. Switch role to try it.`);
  }
  return null;
}

const nextDayId = (c: Ctx) => `SD-${String(Math.max(0, ...c.s.screeningDays.days.map((d) => Number(d.id.slice(3)) || 0)) + 1).padStart(4, "0")}`;
const label = (d: Pick<ScreeningDay, "programmeId" | "date">) => `${PROGRAMME_BY_ID[d.programmeId].clientName}, ${fmtDate(d.date)}`;
const clean = (f: DayForm): DayForm => ({
  ...f, room: f.room.trim(), parking: f.parking.trim(), notes: f.notes.trim(), contactName: f.contactName.trim(), contactPhone: f.contactPhone.trim(),
  breaks: { first: f.breaks.first ? { ...f.breaks.first } : null, lunch: f.breaks.lunch ? { ...f.breaks.lunch } : null, afternoon: f.breaks.afternoon ? { ...f.breaks.afternoon } : null },
});
const changeText = (ch: DayChange[]) => ch.map((x) => `${x.label.toLowerCase()} ${x.from} to ${x.to}`).join("; ");

registerHandlers({
  /** Create a day (no dayId) or update one. via says whether the agent, the form or an HR email proposed it. */
  "days/save": (c, a: { dayId?: string | null; form: DayForm; via?: Via }) => {
    const deny = canManage(c, "set up screening days");
    if (deny) return deny;
    const via: Via = a.via === "agent" || a.via === "hr_email" ? a.via : "form";
    const f = clean(a.form);
    const existing = a.dayId ? c.s.screeningDays.days.find((d) => d.id === a.dayId) : undefined;
    if (a.dayId && !existing) return c.fail("That screening day no longer exists.");
    const errs = dayErrors(f, { today: today(c.s), sessions: c.s.sessions, ownSessionId: existing?.sessionId ?? null, staff: c.s.staff });
    const first = Object.values(errs)[0];
    if (first) return c.fail(first);
    const who = c.persona().name;

    if (!existing) {
      const id = nextDayId(c);
      const sessionId = sessionIdForDay(f.programmeId as ProgrammeId, f.date, new Set(c.s.sessions.map((x) => x.id)));
      const day: ScreeningDay = {
        ...f, programmeId: f.programmeId as ProgrammeId, nurseId: f.nurseId as StaffId, date: f.date, id, sessionId, status: "draft",
        createdAt: c.stamp(), createdBy: who, publishedAt: null, publishedBy: null, history: [],
      };
      day.history.push({ at: day.createdAt, by: who, kind: "created", via, summary: via === "agent" ? "Set up from the agent's draft, checked and saved." : "Set up with the form.", changes: [] });
      c.s.screeningDays.days.push(day);
      c.s.sessions.push(sessionFromDay(day, c.s.sessions));
      c.inv();
      c.emit({ verb: "days.created", summary: `${c.first()} set up a screening day: ${label(day)}, ${fmtHm(day.start)} to ${fmtHm(day.end)}, ${day.appointments} appointments, ${day.room || "room to be confirmed"}. Draft, not yet on the client portal.`, entity: { kind: "session", id: sessionId }, programmeId: day.programmeId });
      return c.ok(`${label(day)} saved as a draft with ${day.appointments} appointments. It is on the Clinics schedule. Publish it when you are ready for the client to see it.`, "ok", id);
    }

    const before = formOf(existing);
    const changes = diffForms(before, f, c.s);
    if (!changes.length) return c.fail("Nothing has changed.");
    const session = c.ix().sessionById.get(existing.sessionId);
    if (session) {
      const booked = activeBookings(c.s, session.id);
      if (booked.length && f.date !== existing.date) return c.fail(`${booked.length} people are booked on this day, so the date cannot move here. Reschedule them first in Clinics, Appointments. Nobody is moved silently.`);
      const next = sessionFromDay({ ...existing, ...f } as ScreeningDay, c.s.sessions, session);
      const starts = new Set(sessionSlots(next).map((x) => x.start));
      const lost = booked.filter((b) => !starts.has(b.slotStart));
      if (lost.length) return c.fail(`${lost.length} booked appointment${lost.length === 1 ? "" : "s"} (${lost.map((b) => b.slotStart).join(", ")}) would no longer fit. Move ${lost.length === 1 ? "it" : "them"} first in Clinics, Appointments. Nobody is moved or cancelled silently.`);
    }
    Object.assign(existing, f, { programmeId: f.programmeId as ProgrammeId, nurseId: f.nurseId as StaffId });
    const entry: DayHistoryEntry = {
      at: c.stamp(), by: who, kind: via === "hr_email" ? "hr_reply" : "edited", via,
      summary: via === "hr_email" ? "Updated from the client's HR email." : via === "agent" ? "Changed in plain English with the agent." : "Changed with the form.",
      changes,
    };
    existing.history.push(entry);
    const idx = c.s.sessions.findIndex((x) => x.id === existing.sessionId);
    const fresh = sessionFromDay(existing, c.s.sessions, idx >= 0 ? c.s.sessions[idx] : undefined);
    if (idx >= 0) c.s.sessions[idx] = fresh; else c.s.sessions.push(fresh);
    c.inv();
    c.emit({ verb: "days.edited", summary: `${c.first()} changed the ${label(existing)} screening day${via === "hr_email" ? " from the client's HR email" : ""}: ${changeText(changes)}.`, entity: { kind: "session", id: existing.sessionId }, programmeId: existing.programmeId });
    const pub = existing.status === "published" ? " The client portal shows the new details." : "";
    return c.ok(`${label(existing)} updated: ${changes.length} change${changes.length === 1 ? "" : "s"}.${pub}`, "ok", existing.id);
  },

  "days/publish": (c, a: { dayId: string }) => {
    const deny = canManage(c, "publish screening days");
    if (deny) return deny;
    const d = c.s.screeningDays.days.find((x) => x.id === a.dayId);
    if (!d) return c.fail("That screening day no longer exists.");
    if (d.status === "published") return c.fail("This day is already on the client portal.");
    const block = publishBlockers(d);
    if (block.length) return c.fail(block[0]);
    d.status = "published";
    d.publishedAt = c.stamp();
    d.publishedBy = c.persona().name;
    d.history.push({ at: d.publishedAt, by: d.publishedBy, kind: "published", via: null, summary: "Published to the client portal. The client's HR team can now see the date, time, room and screen type.", changes: [{ field: "programmeId", label: "Status", from: "Draft", to: "Published" }] });
    const idx = c.s.sessions.findIndex((x) => x.id === d.sessionId);
    if (idx >= 0) c.s.sessions[idx] = sessionFromDay(d, c.s.sessions, c.s.sessions[idx]);
    c.inv();
    c.emit({ verb: "days.published", summary: `${c.first()} published the ${label(d)} screening day to the ${PROGRAMME_BY_ID[d.programmeId].clientName} client portal.`, entity: { kind: "session", id: d.sessionId }, programmeId: d.programmeId });
    return c.ok(`${label(d)} is published. ${PROGRAMME_BY_ID[d.programmeId].clientName}'s HR team now sees it in their portal.`, "ok", d.id);
  },

  "days/unpublish": (c, a: { dayId: string }) => {
    const deny = canManage(c, "unpublish screening days");
    if (deny) return deny;
    const d = c.s.screeningDays.days.find((x) => x.id === a.dayId);
    if (!d) return c.fail("That screening day no longer exists.");
    if (d.status !== "published") return c.fail("This day is not published.");
    d.status = "draft";
    const at = c.stamp(), by = c.persona().name;
    d.history.push({ at, by, kind: "unpublished", via: null, summary: "Taken off the client portal and back to draft.", changes: [{ field: "programmeId", label: "Status", from: "Published", to: "Draft" }] });
    const idx = c.s.sessions.findIndex((x) => x.id === d.sessionId);
    if (idx >= 0) c.s.sessions[idx] = sessionFromDay(d, c.s.sessions, c.s.sessions[idx]);
    c.inv();
    c.emit({ verb: "days.unpublished", summary: `${c.first()} took the ${label(d)} screening day off the client portal.`, entity: { kind: "session", id: d.sessionId }, programmeId: d.programmeId });
    return c.ok(`${label(d)} is back to draft and no longer on the client portal.`, "ok", d.id);
  },
});

export const daysAct = {
  save: (form: DayForm, via: Via, dayId?: string | null) => ({ type: "days/save", form, via, dayId: dayId || null }),
  publish: (dayId: string) => ({ type: "days/publish", dayId }),
  unpublish: (dayId: string) => ({ type: "days/unpublish", dayId }),
};
