/* Nurse portal data: who is working today, their clinic, its appointments and the day's counts.
   Everything is derived from the shared store through the Clinics selectors, so the portal and the
   staff app always agree. */
import type { ClinicSession, Episode, PhState, StaffId } from "../../model";
import { isNurseReferral, ix, needsEcgReview, today } from "../../model";
import type { ApptRow } from "../Clinics/selectors";
import { apptRow } from "../Clinics/selectors";

/** The clinic nurses in the demo, in the order the picker shows them. */
export const PORTAL_NURSES: StaffId[] = ["fiona", "anita", "liz"];

/** The nurse's clinic today: the session where they are the nurse, else one they support. */
export function nurseSessionToday(state: PhState, staffId: string): ClinicSession | null {
  const t = today(state);
  const mine = state.sessions.filter((s) => s.date === t && s.status !== "cancelled");
  return mine.find((s) => s.nurseId === staffId) || mine.find((s) => s.supportIds.some((x) => x === staffId)) || null;
}

/** Confirmed appointments in a clinic, in slot order. */
export function clinicRows(state: PhState, session: ClinicSession): ApptRow[] {
  return state.bookings
    .filter((b) => b.sessionId === session.id && b.status === "confirmed")
    .map((b) => apptRow(state, b))
    .filter((r): r is ApptRow => !!r)
    .sort((a, b) => (a.booking.slotStart < b.booking.slotStart ? -1 : a.booking.slotStart > b.booking.slotStart ? 1 : a.booking.id < b.booking.id ? -1 : 1));
}

export interface ClinicCounts {
  booked: number;
  checkedIn: number;
  inProgress: number;
  completed: number;
  notArrived: number;
  /** Booked, not checked in, and the slot time has passed. */
  didNotAttend: number;
  referrals: number;
  referralsPending: number;
  ecgReviews: number;
  ecgPending: number;
  specimens: number;
}

export function clinicEpisodes(state: PhState, session: ClinicSession): Episode[] {
  return state.episodes.filter((e) => e.sessionId === session.id);
}

export function clinicCounts(state: PhState, session: ClinicSession): ClinicCounts {
  const rows = clinicRows(state, session);
  const eps = clinicEpisodes(state, session);
  const drafts = rows.map((r) => r.draft).filter((d): d is NonNullable<typeof d> => !!d);
  const epIds = new Set(eps.map((e) => e.id));
  return {
    booked: rows.length,
    checkedIn: rows.filter((r) => r.status === "checked_in" || r.status === "in_progress").length,
    inProgress: rows.filter((r) => r.status === "in_progress").length,
    completed: rows.filter((r) => r.status === "completed").length,
    notArrived: rows.filter((r) => r.status === "not_arrived" || r.status === "upcoming").length,
    didNotAttend: rows.filter((r) => r.status === "no_show" || (r.status === "not_arrived" && r.slotPassed)).length,
    referrals: eps.filter((e) => !!e.nurseReferral).length,
    referralsPending: drafts.filter((d) => isNurseReferral(d)).length,
    ecgReviews: eps.filter((e) => !!e.capture.ecgReview).length + drafts.filter((d) => !!d.ecgReview).length,
    ecgPending: drafts.filter((d) => !d.ecgReview && needsEcgReview(d)).length,
    specimens: state.specimens.filter((s) => epIds.has(s.episodeId)).length,
  };
}

/** The next appointment to work on after the given one: later in the day first, then earlier ones still open. */
export function nextOpen(rows: ApptRow[], afterBookingId: string | null): ApptRow | null {
  const open = (r: ApptRow) => r.status === "not_arrived" || r.status === "checked_in" || r.status === "in_progress" || r.status === "upcoming";
  const i = afterBookingId ? rows.findIndex((r) => r.booking.id === afterBookingId) : -1;
  const later = rows.slice(i + 1).find(open);
  if (later) return later;
  return rows.slice(0, Math.max(0, i)).find(open) || null;
}

export const personLabel = (state: PhState, personId: string) => {
  const p = ix(state).personById.get(personId);
  return p ? `${p.given} ${p.family}` : personId;
};

/* A nurse asked for by the staff app (for example "Open in nurse portal" on a clinic card). The
   preview reads it once when it opens. */
let requested: StaffId | null = null;
export function requestNursePortalNurse(id: StaffId | null): void { requested = id; }
export function takeRequestedNurse(): StaffId | null { const r = requested; requested = null; return r; }
