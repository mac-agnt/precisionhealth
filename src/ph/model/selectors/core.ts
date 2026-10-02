/* Core selectors: indexes, persona and permissions, programme counts, session capacity.
   Every number on every page comes from here or the other selector modules. Nothing is typed in. */
import type {
  Booking, ClinicSession, EntityRef, Episode, FollowUp, Id, Membership, Observation, Perm, Person, PersonaId, PhState, Programme, ProgrammeId, ReportVersion, Slot, Staff,
} from "../types";
import { NURSE_ROLE_KEYS, PERM_DEFS, PROGRAMME_ORDER, ROLE_LABEL, buildSlots } from "../constants";
import { isRealDate } from "../capture";
import { hhmmToMinutes, localDateOf, dublinToUtc } from "../time";
import type { Hhmm, LocalDate } from "../time";

const cache = new WeakMap<PhState, Map<string, unknown>>();
/** Memoise a derived value for one state object. A new state (after any action) starts empty. */
export function memo<T>(state: PhState, key: string, fn: () => T): T {
  let m = cache.get(state);
  if (!m) { m = new Map(); cache.set(state, m); }
  if (m.has(key)) return m.get(key) as T;
  const v = fn();
  m.set(key, v);
  return v;
}

/** Drop memoised values for a state object. The reducer calls this after in-place edits. */
export function invalidate(state: PhState): void {
  cache.delete(state);
}

function group<T>(list: T[], key: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of list) { const k = key(x); const a = m.get(k); if (a) a.push(x); else m.set(k, [x]); }
  return m;
}

export interface Ix {
  personById: Map<Id, Person>;
  episodeById: Map<Id, Episode>;
  bookingById: Map<Id, Booking>;
  sessionById: Map<Id, ClinicSession>;
  staffById: Map<string, Staff>;
  programmeById: Map<string, Programme>;
  membershipsByPerson: Map<Id, Membership[]>;
  bookingsBySession: Map<Id, Booking[]>;
  bookingsByPerson: Map<Id, Booking[]>;
  episodesByPerson: Map<Id, Episode[]>;
  obsByEpisode: Map<Id, Observation[]>;
  versionsByEpisode: Map<Id, ReportVersion[]>;
  followUpsByEpisode: Map<Id, FollowUp[]>;
}

export function ix(state: PhState): Ix {
  return memo(state, "ix", () => ({
    personById: new Map(state.persons.map((p) => [p.id, p])),
    episodeById: new Map(state.episodes.map((e) => [e.id, e])),
    bookingById: new Map(state.bookings.map((b) => [b.id, b])),
    sessionById: new Map(state.sessions.map((s) => [s.id, s])),
    staffById: new Map(state.staff.map((s) => [s.id, s])),
    programmeById: new Map(state.programmes.map((p) => [p.id, p])),
    membershipsByPerson: group(state.memberships, (m) => m.personId),
    bookingsBySession: group(state.bookings, (b) => b.sessionId),
    bookingsByPerson: group(state.bookings, (b) => b.personId),
    episodesByPerson: group(state.episodes, (e) => e.personId),
    obsByEpisode: group(state.observations, (o) => o.episodeId),
    versionsByEpisode: group(state.reportVersions, (v) => v.episodeId),
    followUpsByEpisode: group(state.followUps, (f) => f.episodeId),
  }));
}

/* ---- clock ---- */
export const nowIso = (state: PhState) => state.clock.nowUtc;
export const today = (state: PhState): LocalDate => localDateOf(state.clock.nowUtc);

/* ---- persona and permissions (frontend visibility simulation, not server security) ---- */
export interface Persona {
  id: PersonaId;
  name: string;
  /** For the shell, for example "Dr Neil Reddy". Activity text uses the plain name. */
  displayName: string;
  title: string;
  role: Staff["role"] | "participant";
  roleLabel: string;
  initials: string;
  isParticipant: boolean;
  perms: Set<Perm>;
  staff: Staff | null;
}
export function persona(state: PhState): Persona {
  return memo(state, "persona", () => {
    const id = state.session.personaId;
    if (id === "participant") {
      const p = ix(state).personById.get(state.session.portalPersonId);
      const name = p ? `${p.given} ${p.family}` : "Participant";
      return { id, name, displayName: name, title: "Participant preview", role: "participant", roleLabel: ROLE_LABEL.participant, initials: name.split(" ").map((w) => w[0]).join(""), isParticipant: true, perms: new Set<Perm>(), staff: null };
    }
    const s = ix(state).staffById.get(id)!;
    return {
      id, name: s.name, displayName: s.displayName, title: s.title, role: s.role, roleLabel: ROLE_LABEL[s.role], initials: s.initials, isParticipant: false, staff: s,
      perms: new Set(PERM_DEFS.filter((d) => d.roles.includes(s.role)).map((d) => d.key)),
    };
  });
}
export const can = (state: PhState, perm: Perm): boolean => persona(state).perms.has(perm);
export const firstName = (state: PhState) => persona(state).name.split(" ")[0];

/** Staff who may view clinical content for a given session: reviewers and nursing leads always, capture roles for their own sessions. */
export function canViewClinicalForSession(state: PhState, sessionId: Id): boolean {
  const p = persona(state);
  if (!p.perms.has("clinical.view")) return false;
  if (p.role === "clinical_review" || p.role === "nursing_lead") return true;
  const s = ix(state).sessionById.get(sessionId);
  return !!s && (s.nurseId === p.id || s.supportIds.includes(p.id as never));
}
export function canViewEpisodeClinical(state: PhState, episodeId: Id): boolean {
  const e = ix(state).episodeById.get(episodeId);
  return !!e && canViewClinicalForSession(state, e.sessionId);
}

/**
 * The screening episode behind an entity reference, or null. Restricted activity events, drawers
 * and relationship panels use it to apply the per-assignment rule to reports, follow-ups,
 * bookings, rows and messages as well as to episodes.
 */
export function episodeIdOfEntity(state: PhState, ref: EntityRef | null | undefined): Id | null {
  if (!ref) return null;
  const I = ix(state);
  switch (ref.kind) {
    case "episode": return I.episodeById.has(ref.id) ? ref.id : null;
    case "report": {
      const v = state.reportVersions.find((x) => x.id === ref.id);
      const id = v ? v.episodeId : ref.id.replace(/-v\d+$/, "");
      return I.episodeById.has(id) ? id : null;
    }
    case "followup": return state.followUps.find((f) => f.id === ref.id)?.episodeId || null;
    case "booking": return I.bookingById.get(ref.id)?.episodeId || null;
    case "row": {
      const row = state.importRows.find((r) => r.id === ref.id);
      return row?.episodeId || state.episodes.find((e) => e.hold?.rowId === ref.id)?.id || null;
    }
    case "message": return state.messages.find((m) => m.id === ref.id)?.episodeId || null;
    default: return null;
  }
}

/**
 * A person's membership of one programme. Without a programme it is the membership for the
 * person's own programme record, then the first one. People can belong to more than one programme.
 */
export function membershipOf(state: PhState, personId: Id, programmeId?: ProgrammeId | null): Membership | undefined {
  const list = ix(state).membershipsByPerson.get(personId) || [];
  if (programmeId) return list.find((m) => m.programmeId === programmeId);
  const home = ix(state).personById.get(personId)?.programmeId;
  return list.find((m) => m.programmeId === home) || list[0];
}

/* ---- helpers ---- */
export const pct = (n: number, d: number): number | null => (d > 0 ? (n / d) * 100 : null);
/** "76.8%" or "n/a" when the denominator is zero. */
export const rate = (n: number, d: number, digits = 1): string => (d > 0 ? ((n / d) * 100).toFixed(digits) + "%" : "n/a");
export const personName = (p: Person | undefined | null) => (p ? `${p.given} ${p.family}` : "Unknown");
export const plural = (n: number, one: string, many?: string) => `${n} ${n === 1 ? one : many || one + "s"}`;

/* ---- sessions and capacity ---- */
export function sessionSlots(s: Pick<ClinicSession, "start" | "end" | "breaks" | "slotMinutes">): Slot[] {
  return buildSlots(s.start, s.end, s.breaks, s.slotMinutes);
}
export function activeBookings(state: PhState, sessionId: Id): Booking[] {
  return (ix(state).bookingsBySession.get(sessionId) || []).filter((b) => b.status === "confirmed").sort((a, b) => (a.slotStart < b.slotStart ? -1 : 1));
}

export interface SessionStats {
  session: ClinicSession;
  programme: Programme;
  slots: number;
  booked: number;
  available: number;
  pct: number;
  checkedIn: number;
  inProgress: number;
  completed: number;
  notArrived: number;
  isToday: boolean;
  isPast: boolean;
}
export function sessionStats(state: PhState, sessionId: Id): SessionStats {
  return memo(state, "ss:" + sessionId, () => {
    const I = ix(state);
    const session = I.sessionById.get(sessionId)!;
    const slots = sessionSlots(session).length;
    const bk = activeBookings(state, sessionId);
    const booked = bk.length;
    const t = today(state);
    return {
      session, programme: I.programmeById.get(session.programmeId)!, slots, booked, available: Math.max(0, slots - booked),
      pct: slots ? (booked / slots) * 100 : 0,
      checkedIn: bk.filter((b) => b.attendance === "checked_in").length,
      inProgress: bk.filter((b) => b.attendance === "in_progress").length,
      completed: bk.filter((b) => b.attendance === "completed").length,
      notArrived: bk.filter((b) => b.attendance === "booked").length,
      isToday: session.date === t,
      isPast: session.date < t,
    };
  });
}

export const sessionsOn = (state: PhState, date: LocalDate): ClinicSession[] =>
  state.sessions.filter((s) => s.date === date && s.status !== "cancelled").sort((a, b) => (a.programmeId < b.programmeId ? 1 : -1));
export const todaySessions = (state: PhState) => sessionsOn(state, today(state));
export function sessionsBetween(state: PhState, from: LocalDate, to: LocalDate): ClinicSession[] {
  return state.sessions.filter((s) => s.date >= from && s.date <= to && s.status !== "cancelled").sort((a, b) => (a.date === b.date ? (a.programmeId < b.programmeId ? 1 : -1) : a.date < b.date ? -1 : 1));
}

export interface DayStats { sessions: number; booked: number; capacity: number; available: number; pct: number; checkedIn: number; completed: number; notArrived: number }
export function dayStats(state: PhState, date: LocalDate): DayStats {
  return memo(state, "ds:" + date, () => {
    const ss = sessionsOn(state, date).map((s) => sessionStats(state, s.id));
    const capacity = ss.reduce((n, s) => n + s.slots, 0);
    const booked = ss.reduce((n, s) => n + s.booked, 0);
    return {
      sessions: ss.length, booked, capacity, available: capacity - booked, pct: capacity ? (booked / capacity) * 100 : 0,
      checkedIn: ss.reduce((n, s) => n + s.checkedIn + s.inProgress, 0), completed: ss.reduce((n, s) => n + s.completed, 0), notArrived: ss.reduce((n, s) => n + s.notArrived, 0),
    };
  });
}
export const todayStats = (state: PhState) => dayStats(state, today(state));

export interface SlotView { index: number; start: Hhmm; end: Hhmm; booking: Booking | null; person: Person | null; isPast: boolean }
export function slotGrid(state: PhState, sessionId: Id): SlotView[] {
  return memo(state, "sg:" + sessionId, () => {
    const I = ix(state);
    const s = I.sessionById.get(sessionId)!;
    const bk = new Map(activeBookings(state, sessionId).map((b) => [b.slotStart, b]));
    const now = Date.parse(state.clock.nowUtc);
    return sessionSlots(s).map((sl) => {
      const b = bk.get(sl.start) || null;
      return { ...sl, booking: b, person: b ? I.personById.get(b.personId) || null : null, isPast: Date.parse(dublinToUtc(s.date, sl.start)) <= now };
    });
  });
}
export const freeSlots = (state: PhState, sessionId: Id): SlotView[] => slotGrid(state, sessionId).filter((s) => !s.booking && !s.isPast);

/* ---- programme counts: one definition used everywhere ---- */
export interface Counts {
  invited: number;
  capacity: number;
  booked: number;
  attended: number;
  upcoming: number;
  released: number;
  ready: number;
  awaiting: number;
  onHold: number;
  episodes: number;
  /** Invitees without a confirmed booking who have not started the questionnaire. */
  notStarted: number;
  /** Invitees without a confirmed booking whose questionnaire is in progress. A draft is not a booking. */
  drafts: number;
  /** Invitees without a confirmed booking whose questionnaire and consent are complete, for example after a cancellation. */
  readyToBook: number;
  noShow: number;
  bookedPct: number | null;
  attendedPct: number | null;
  releasedPct: number | null;
}
export function programmeCounts(state: PhState, programmeId?: ProgrammeId): Counts {
  return memo(state, "pc:" + (programmeId || "ALL"), () => {
    const inProg = <T extends { programmeId: ProgrammeId }>(x: T) => !programmeId || x.programmeId === programmeId;
    const members = state.memberships.filter((m) => inProg(m) && m.eligible);
    const invited = programmeId ? members.length : new Set(members.map((m) => m.personId)).size;
    const sessions = state.sessions.filter((s) => inProg(s) && s.status !== "cancelled");
    const capacity = sessions.reduce((n, s) => n + sessionSlots(s).length, 0);
    const bookings = state.bookings.filter((b) => inProg(b) && b.status === "confirmed");
    const attended = bookings.filter((b) => b.attendance === "completed").length;
    const noShow = bookings.filter((b) => b.attendance === "no_show").length;
    const eps = state.episodes.filter(inProg);
    const c = (st: Episode["reportState"]) => eps.filter((e) => e.reportState === st).length;
    const booked = bookings.length;
    const released = c("released");
    // invited = booked + drafts + readyToBook + notStarted. Unbooked invitees split by questionnaire state.
    const unbooked = members.filter((m) => m.stage !== "booked");
    return {
      invited, capacity, booked, attended, noShow, upcoming: booked - attended - noShow, released, ready: c("ready_for_review"), awaiting: c("awaiting_results"), onHold: c("on_hold"),
      episodes: eps.length,
      notStarted: unbooked.filter((m) => m.questionnaire === "not_started").length,
      drafts: unbooked.filter((m) => m.questionnaire === "draft").length,
      readyToBook: unbooked.filter((m) => m.questionnaire === "complete").length,
      bookedPct: pct(booked, capacity), attendedPct: pct(attended, booked), releasedPct: pct(released, attended),
    };
  });
}
export const totalCounts = (state: PhState) => programmeCounts(state);
export const allProgrammeCounts = (state: PhState) => PROGRAMME_ORDER.map((id) => ({ id, counts: programmeCounts(state, id) }));

/** Past and upcoming session counts for a programme. */
export function sessionCounts(state: PhState, programmeId: ProgrammeId) {
  const t = today(state);
  const ss = state.sessions.filter((s) => s.programmeId === programmeId && s.status !== "cancelled");
  return { total: ss.length, past: ss.filter((s) => s.date < t).length, today: ss.filter((s) => s.date === t).length, upcoming: ss.filter((s) => s.date > t).length };
}

/* ---- scheduling conflicts ---- */
/**
 * One clash between two sessions at overlapping times on the same day. Staff clashes are "nurse"
 * (booked nurse at both) or "support" (any pairing that involves a support role). A "room" clash
 * has no staff member: staffId is empty and room names the shared room.
 */
export interface Overlap { kind: "nurse" | "support" | "room"; staffId: string; a: Id; b: Id; date: LocalDate; room?: string }
function overlapsTime(a: Pick<ClinicSession, "start" | "end">, b: Pick<ClinicSession, "start" | "end">) {
  return hhmmToMinutes(a.start) < hhmmToMinutes(b.end) && hhmmToMinutes(b.start) < hhmmToMinutes(a.end);
}
const staffRoles = (s: ClinicSession) => [{ id: s.nurseId as string, role: "nurse" as const }, ...s.supportIds.map((id) => ({ id: id as string, role: "support" as const }))];
/**
 * Overlapping staff and room assignments across the schedule, or for one candidate session.
 * Every role pairing is compared in both directions: nurse and nurse, support and nurse, nurse
 * and support, support and support.
 */
export function findOverlaps(sessions: ClinicSession[], candidate?: ClinicSession): Overlap[] {
  const out: Overlap[] = [];
  const pool = candidate ? sessions.filter((s) => s.id !== candidate.id).concat(candidate) : sessions;
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const a = pool[i], b = pool[j];
      if (a.date !== b.date || a.status === "cancelled" || b.status === "cancelled") continue;
      if (candidate && a.id !== candidate.id && b.id !== candidate.id) continue;
      if (!overlapsTime(a, b)) continue;
      for (const x of staffRoles(a)) {
        for (const y of staffRoles(b)) {
          if (x.id === y.id) out.push({ kind: x.role === "nurse" && y.role === "nurse" ? "nurse" : "support", staffId: x.id, a: a.id, b: b.id, date: a.date });
        }
      }
      if (a.room && a.room === b.room) out.push({ kind: "room", staffId: "", room: a.room, a: a.id, b: b.id, date: a.date });
    }
  }
  return out;
}
/** Every staff and room clash in the schedule. Empty at baseline. */
export const scheduleOverlaps = (state: PhState) => memo(state, "overlaps", () => findOverlaps(state.sessions));
/** Staff clashes only, for copy that talks about people. */
export const staffOverlaps = (state: PhState) => scheduleOverlaps(state).filter((o) => o.kind !== "room");
/** Plain words for one clash, seen from the session being edited. */
export function overlapText(state: PhState, o: Overlap, fromSessionId?: Id): string {
  const other = fromSessionId && o.a === fromSessionId ? o.b : o.a;
  if (o.kind === "room") return `${o.room} is already in use by ${other} at the same time.`;
  return `${staffName(state, o.staffId)} is already assigned to ${other} at the same time.`;
}

export interface SessionEditPreview {
  slots: Slot[];
  capacity: number;
  booked: number;
  impacted: Array<{ booking: Booking; person: Person | undefined; reason: string }>;
  overlaps: Overlap[];
  ok: boolean;
  messages: string[];
  /** Why this session cannot be edited at all (completed, cancelled or in the past), or null. */
  locked: string | null;
  /** Every reason the edit would be refused, apart from confirming the move of impacted bookings. */
  errors: string[];
}
export type SessionPatch = Partial<Pick<ClinicSession, "start" | "end" | "breaks" | "slotMinutes" | "nurseId" | "supportIds" | "date" | "room">>;

/** Why a session cannot be edited: completed, cancelled or already in the past. History is never rewritten. */
export function sessionLockReason(state: PhState, s: ClinicSession): string | null {
  if (s.status === "completed") return `${s.id} is completed. A completed session cannot be edited, so its history and participant messages stay as they were.`;
  if (s.status === "cancelled") return `${s.id} is cancelled and cannot be edited.`;
  if (s.date < today(state)) return `${s.id} has already taken place. A past session cannot be edited.`;
  return null;
}

/** Input problems in a session patch: who can be the nurse, support resources, date and clinic times. */
export function sessionPatchErrors(state: PhState, cur: ClinicSession, patch: SessionPatch): string[] {
  const errs: string[] = [];
  const I = ix(state);
  const okTime = (t: string | undefined) => !!t && /^\d{2}:\d{2}$/.test(t) && hhmmToMinutes(t) < 24 * 60 && Number(t.slice(3)) < 60;
  if (patch.nurseId !== undefined) {
    const n = I.staffById.get(patch.nurseId);
    if (!n) errs.push("Choose a nurse from the staff list.");
    else if (!NURSE_ROLE_KEYS.includes(n.role)) errs.push(`${n.name} (${ROLE_LABEL[n.role]}) is not a nurse. The booked nurse must be a nursing lead or a clinic nurse.`);
  }
  const nurseId = patch.nurseId ?? cur.nurseId;
  const support = patch.supportIds ?? cur.supportIds;
  if (patch.supportIds !== undefined) {
    if (support.some((id) => !I.staffById.has(id))) errs.push("A support resource is not on the staff list.");
    if (new Set(support).size !== support.length) errs.push("A support resource is listed twice.");
  }
  if (support.includes(nurseId)) errs.push("The booked nurse cannot also be a support resource at the same session.");
  if (patch.date !== undefined) {
    if (!isRealDate(patch.date)) errs.push("Choose a valid date.");
    else if (patch.date < today(state)) errs.push("A session cannot move into the past.");
  }
  if (patch.room !== undefined && !patch.room.trim()) errs.push("Choose a room.");
  const start = patch.start ?? cur.start, end = patch.end ?? cur.end;
  if (!okTime(start) || !okTime(end)) errs.push("Enter the start and end as HH:MM.");
  else if (hhmmToMinutes(start) >= hhmmToMinutes(end)) errs.push("The clinic must end after it starts.");
  for (const b of patch.breaks || []) {
    if (!okTime(b.start) || !okTime(b.end) || hhmmToMinutes(b.start) >= hhmmToMinutes(b.end)) { errs.push("Each break needs a valid start and end, with the end after the start."); break; }
  }
  return errs;
}

/** Preview a session edit. Nothing is deleted: bookings that no longer fit are listed, never silently dropped. */
export function previewSessionEdit(state: PhState, sessionId: Id, patch: SessionPatch): SessionEditPreview {
  const I = ix(state);
  const cur = I.sessionById.get(sessionId)!;
  const next: ClinicSession = { ...cur, ...patch };
  const slots = sessionSlots(next);
  const starts = new Set(slots.map((s) => s.start));
  const bk = activeBookings(state, sessionId);
  const impacted = bk.filter((b) => !starts.has(b.slotStart)).map((b) => ({ booking: b, person: I.personById.get(b.personId), reason: `${b.slotStart} is not a bookable slot after this change` }));
  const overlaps = findOverlaps(state.sessions, next);
  const locked = sessionLockReason(state, cur);
  const errors: string[] = [];
  if (locked) errors.push(locked);
  errors.push(...sessionPatchErrors(state, cur, patch));
  const messages: string[] = [];
  if (slots.length < bk.length) messages.push(`${bk.length} bookings but only ${slots.length} slots after the change.`);
  if (overlaps.length) {
    messages.push("Staff assignment overlaps another session at the same time.");
    overlaps.forEach((o) => errors.push(overlapText(state, o, next.id)));
  }
  const moving = patch.date && patch.date !== cur.date && bk.length;
  if (moving) {
    messages.push("Moving the date reschedules every booked participant. They are listed, not deleted, and each needs a confirmed new slot.");
    errors.push("A session with bookings cannot change date. Participants are not silently moved or deleted. Reschedule them individually.");
  }
  // People already checked in, in progress, completed or marked absent keep their slot.
  const started = impacted.filter((x) => x.booking.attendance !== "booked");
  if (started.length) errors.push(`${plural(started.length, "impacted appointment")} ${started.length === 1 ? "has" : "have"} already started or finished (${started.map((x) => x.booking.id).join(", ")}), so ${started.length === 1 ? "it" : "they"} cannot move to another slot.`);
  if (slots.length < bk.length) errors.push("There would be fewer slots than bookings.");
  messages.push(...errors.filter((e) => !messages.includes(e)));
  return { slots, capacity: slots.length, booked: bk.length, impacted, overlaps, locked, errors, ok: impacted.length === 0 && errors.length === 0, messages };
}

/** Booked minutes per nurse on a date, using each session's own slot length. */
export function nurseWorkload(state: PhState, date: LocalDate) {
  return state.staff.map((s) => {
    const ss = state.sessions.filter((x) => x.date === date && (x.nurseId === s.id || x.supportIds.includes(s.id)) && x.status !== "cancelled");
    const own = ss.filter((x) => x.nurseId === s.id);
    const appts = own.reduce((n, x) => n + activeBookings(state, x.id).length, 0);
    const minutes = own.reduce((n, x) => n + activeBookings(state, x.id).length * x.slotMinutes, 0);
    return { staff: s, sessions: ss, appointments: appts, minutes };
  });
}

export const staffName = (state: PhState, id: string | null | undefined) => (id ? ix(state).staffById.get(id)?.name || id : "Unassigned");
export const programmeName = (state: PhState, id: ProgrammeId) => ix(state).programmeById.get(id)?.name || id;
