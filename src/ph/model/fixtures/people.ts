/* Deterministic roster: sessions, 850 people, memberships, bookings and the plan that
   decides which attended person ends in which report state. Named cases are applied
   first, then each programme and state allocation is filled. Nothing is appended after. */
import type {
  Booking, ClinicSession, GenderRecorded, Id, InvitationCode, Membership, Person, ProgrammeId, SexRecorded, StaffId,
} from "../types";
import {
  CLINIC_DAY, FIRST_NAMES_F, FIRST_NAMES_M, INVITED, PERSON_START, PROGRAMME_BY_ID, PROGRAMME_ORDER, RESERVED_FULL_NAMES, SURNAMES,
  buildSlots,
} from "../constants";
import { dublinToUtc } from "../time";
import type { Hhmm, Iso, LocalDate } from "../time";
import { makeRng } from "../rng";
import type { Rng } from "../rng";

export type EpRole =
  | "released"
  | "ready_batch_routine"
  | "ready_batch_flagged"
  | "ready_aged_routine"
  | "ready_aged_flagged"
  | "await_none"
  | "await_partial"
  | "hold_dob"
  | "hold_specimen"
  | "hold_candidates"
  | "hold_unit"
  | "hold_followup";

export const pad = (n: number, w: number) => String(n).padStart(w, "0");
export const personId = (n: number) => `PH-P-${pad(n, 4)}`;
const ymd = (d: LocalDate) => d.replace(/-/g, "");

/* ---- sessions ---- */
interface SessionSeed {
  programmeId: ProgrammeId;
  date: LocalDate;
  site: string;
  room: string;
  nurse: StaffId;
  support?: StaffId[];
  printer: string;
  booked: number; // confirmed bookings (25 for completed sessions)
  past: boolean;
}
const A = "Sisk Dublin Site A", B = "Sisk Dublin Site B";
const SF_SITE = "Salesforce Dublin, Demo Wellness Room";
const IBM_SITE = "IBM Dublin, Demo Screening Room";
const SESSION_SEEDS: SessionSeed[] = [
  { programmeId: "PRG-SISK-26", date: "2026-09-14", site: A, room: "Sisk Site A, Welfare Cabin 2", nurse: "fiona", printer: "pr-1", booked: 25, past: true },
  { programmeId: "PRG-SISK-26", date: "2026-09-17", site: B, room: "Sisk Site B, Meeting Room 1", nurse: "anita", printer: "pr-1", booked: 25, past: true },
  { programmeId: "PRG-SISK-26", date: "2026-09-21", site: A, room: "Sisk Site A, Welfare Cabin 2", nurse: "fiona", printer: "pr-1", booked: 25, past: true },
  { programmeId: "PRG-SISK-26", date: "2026-09-24", site: B, room: "Sisk Site B, Meeting Room 1", nurse: "anita", printer: "pr-1", booked: 25, past: true },
  { programmeId: "PRG-SISK-26", date: "2026-09-28", site: A, room: "Sisk Site A, Welfare Cabin 2", nurse: "fiona", printer: "pr-1", booked: 25, past: true },
  { programmeId: "PRG-SISK-26", date: "2026-10-01", site: B, room: "Sisk Site B, Meeting Room 1", nurse: "anita", printer: "pr-1", booked: 25, past: true },
  { programmeId: "PRG-SISK-26", date: "2026-10-05", site: A, room: "Sisk Site A, Welfare Cabin 2", nurse: "fiona", support: ["ian"], printer: "pr-1", booked: 20, past: false },
  { programmeId: "PRG-SISK-26", date: "2026-10-08", site: B, room: "Sisk Site B, Meeting Room 1", nurse: "anita", printer: "pr-1", booked: 14, past: false },
  { programmeId: "PRG-SISK-26", date: "2026-10-12", site: A, room: "Sisk Site A, Welfare Cabin 2", nurse: "fiona", printer: "pr-1", booked: 14, past: false },
  { programmeId: "PRG-SISK-26", date: "2026-10-15", site: B, room: "Sisk Site B, Meeting Room 1", nurse: "anita", printer: "pr-1", booked: 14, past: false },
  { programmeId: "PRG-SISK-26", date: "2026-10-19", site: A, room: "Sisk Site A, Welfare Cabin 2", nurse: "fiona", printer: "pr-1", booked: 14, past: false },
  { programmeId: "PRG-SISK-26", date: "2026-10-22", site: B, room: "Sisk Site B, Meeting Room 1", nurse: "anita", printer: "pr-1", booked: 14, past: false },
  { programmeId: "PRG-SF-26", date: "2026-09-29", site: SF_SITE, room: "Demo Wellness Room", nurse: "anita", printer: "pr-2", booked: 25, past: true },
  { programmeId: "PRG-SF-26", date: "2026-10-01", site: SF_SITE, room: "Demo Wellness Room", nurse: "fiona", printer: "pr-2", booked: 25, past: true },
  { programmeId: "PRG-SF-26", date: "2026-10-05", site: SF_SITE, room: "Demo Wellness Room", nurse: "anita", printer: "pr-2", booked: 15, past: false },
  { programmeId: "PRG-SF-26", date: "2026-10-09", site: SF_SITE, room: "Demo Wellness Room", nurse: "anita", printer: "pr-2", booked: 15, past: false },
  { programmeId: "PRG-IBM-26", date: "2026-10-01", site: IBM_SITE, room: "Demo Screening Room", nurse: "liz", printer: "pr-3", booked: 25, past: true },
  { programmeId: "PRG-IBM-26", date: "2026-10-05", site: IBM_SITE, room: "Demo Screening Room", nurse: "liz", printer: "pr-3", booked: 10, past: false },
  { programmeId: "PRG-IBM-26", date: "2026-10-12", site: IBM_SITE, room: "Demo Screening Room", nurse: "liz", printer: "pr-3", booked: 10, past: false },
];

export function sessionIdFor(programmeId: ProgrammeId, date: LocalDate): Id {
  return `CLN-${PROGRAMME_BY_ID[programmeId].code}-${ymd(date)}`;
}

export function buildSessions(): ClinicSession[] {
  return SESSION_SEEDS.map((s) => ({
    id: sessionIdFor(s.programmeId, s.date),
    programmeId: s.programmeId,
    date: s.date,
    siteName: s.site,
    room: s.room,
    nurseId: s.nurse,
    supportIds: s.support || [],
    start: CLINIC_DAY.start,
    end: CLINIC_DAY.end,
    breaks: CLINIC_DAY.breaks.map((b) => ({ ...b })),
    slotMinutes: CLINIC_DAY.slotMinutes,
    status: s.past ? "completed" : "scheduled",
    printerId: s.printer,
    note: s.past ? "Completed. Illustrative session." : "Illustrative session.",
  }));
}

/* ---- role allocation per session ---- */
interface RoleAlloc { role: EpRole; n: number }
const ALLOC: Record<string, { named: Array<{ role: EpRole; personNo: number }>; others: RoleAlloc[] }> = {
  "CLN-SISK-20261001": {
    named: [
      { role: "ready_batch_routine", personNo: 1 }, // Aisling
      { role: "hold_dob", personNo: 2 }, // Ciara
      { role: "hold_followup", personNo: 3 }, // Maeve
      { role: "hold_unit", personNo: 4 }, // Dara
    ],
    others: [
      { role: "ready_batch_routine", n: 5 }, { role: "ready_batch_flagged", n: 2 },
      { role: "await_partial", n: 2 }, { role: "await_none", n: 7 }, { role: "released", n: 5 },
    ],
  },
  "CLN-SISK-20260924": { named: [], others: [{ role: "ready_aged_flagged", n: 1 }, { role: "ready_aged_routine", n: 1 }, { role: "released", n: 23 }] },
  "CLN-SISK-20260928": { named: [], others: [{ role: "ready_aged_routine", n: 2 }, { role: "released", n: 23 }] },
  "CLN-SF-20261001": {
    named: [{ role: "ready_batch_flagged", personNo: 501 }, { role: "hold_specimen", personNo: 502 }],
    others: [
      { role: "ready_batch_routine", n: 2 }, { role: "ready_batch_flagged", n: 1 },
      { role: "await_partial", n: 1 }, { role: "await_none", n: 2 }, { role: "released", n: 17 },
    ],
  },
  "CLN-SF-20260929": { named: [], others: [{ role: "ready_aged_flagged", n: 1 }, { role: "ready_aged_routine", n: 1 }, { role: "released", n: 23 }] },
  "CLN-IBM-20261001": {
    named: [{ role: "hold_candidates", personNo: 701 }, { role: "await_none", personNo: 702 }],
    others: [
      { role: "ready_batch_routine", n: 2 }, { role: "ready_batch_flagged", n: 1 },
      { role: "await_partial", n: 1 }, { role: "await_none", n: 1 }, { role: "released", n: 18 },
    ],
  },
};

/* ---- names ---- */
const strip = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z]/g, "").toLowerCase();

interface Named { no: number; given: string; family: string; dob: LocalDate; gender: GenderRecorded; sex: SexRecorded }
const NAMED: Named[] = [
  { no: 1, given: "Aisling", family: "Byrne", dob: "1991-03-18", gender: "woman", sex: "female" },
  { no: 2, given: "Ciara", family: "Doyle", dob: "1988-07-12", gender: "woman", sex: "female" },
  { no: 3, given: "Maeve", family: "Ryan", dob: "1979-11-02", gender: "woman", sex: "female" },
  { no: 4, given: "Dara", family: "Quinn", dob: "1985-05-29", gender: "man", sex: "male" },
  { no: 501, given: "Ronan", family: "Walsh", dob: "1976-09-21", gender: "man", sex: "male" },
  { no: 502, given: "Niamh", family: "Keane", dob: "1994-01-30", gender: "woman", sex: "female" },
  { no: 701, given: "Eoin", family: "Daly", dob: "1985-03-12", gender: "man", sex: "male" },
  { no: 702, given: "Eoin", family: "Daly", dob: "1991-11-28", gender: "man", sex: "male" },
  { no: 801, given: "Orla", family: "Kavanagh", dob: "1993-06-09", gender: "woman", sex: "female" },
];

export interface RosterPlan {
  persons: Person[];
  memberships: Membership[];
  sessions: ClinicSession[];
  bookings: Booking[];
  codes: InvitationCode[];
  /** Attended persons by session, in slot order. */
  attendees: Record<Id, Id[]>;
  roleOf: Record<Id, EpRole>;
  /** Today's three sessions, upcoming sessions, and drafts. */
  draftPersonIds: Id[];
}

function maskedPhone(rng: Rng) {
  return `+353 8${rng.int(3, 9)} ••• ${String(rng.int(1000, 9999))}`;
}

function dobForAge(rng: Rng, age: number, visit: LocalDate): LocalDate {
  const [vy, vm, vd] = visit.split("-").map(Number);
  const m = rng.int(1, 12), d = rng.int(1, 28);
  const later = m > vm || (m === vm && d > vd);
  const y = vy - age - (later ? 1 : 0);
  return `${y}-${pad(m, 2)}-${pad(d, 2)}`;
}

const BAND_RANGE: Record<string, [number, number]> = { "18-34": [21, 34], "35-44": [35, 44], "45-54": [45, 54], "55+": [55, 66] };

export function buildRoster(): RosterPlan {
  const rng = makeRng("ph-demo-roster-v1");
  const sessions = buildSessions();
  const sessionById = new Map(sessions.map((s) => [s.id, s]));
  const slotsOf = (s: ClinicSession) => buildSlots(s.start, s.end, s.breaks, s.slotMinutes);

  /* 1. choose who attends, who has an upcoming booking, who is a draft */
  const attendedByProg: Record<string, number[]> = {};
  const upcomingByProg: Record<string, number[]> = {};
  const draftNos = [801, 802, 803, 804, 805];
  const namedNos = new Set(NAMED.map((n) => n.no));
  const need = { "PRG-SISK-26": { att: 150, up: 90 }, "PRG-SF-26": { att: 50, up: 30 }, "PRG-IBM-26": { att: 25, up: 20 } } as const;
  for (const pid of PROGRAMME_ORDER) {
    const start = PERSON_START[pid], end = start + INVITED[pid] - 1;
    const pool: number[] = [];
    for (let n = start; n <= end; n++) if (!namedNos.has(n) && !(pid === "PRG-IBM-26" && draftNos.includes(n))) pool.push(n);
    const sh = rng.shuffle(pool);
    const namedAttended = NAMED.filter((x) => x.no >= start && x.no <= end && x.no !== 801).map((x) => x.no);
    const att = namedAttended.concat(sh.slice(0, need[pid].att - namedAttended.length));
    const up = sh.slice(need[pid].att - namedAttended.length, need[pid].att - namedAttended.length + need[pid].up);
    attendedByProg[pid] = att;
    upcomingByProg[pid] = up;
  }

  /* 2. attendees per past session and their roles */
  const attendees: Record<Id, Id[]> = {};
  const roleOf: Record<Id, EpRole> = {};
  for (const pid of PROGRAMME_ORDER) {
    const past = sessions.filter((s) => s.programmeId === pid && s.status === "completed");
    const pool = attendedByProg[pid].filter((n) => !NAMED.some((x) => x.no === n)).slice();
    let cursor = 0;
    const takeOthers = (count: number) => pool.slice(cursor, (cursor += count));
    // Latest session first so the named cases land in the 1 Oct clinics.
    const ordered = past.slice().sort((a, b) => (a.date < b.date ? 1 : -1));
    const per: Record<Id, number[]> = {};
    for (const s of ordered) {
      const al = ALLOC[s.id];
      const namedHere = al ? al.named.map((x) => x.personNo) : [];
      const fill = 25 - namedHere.length;
      const others = takeOthers(fill);
      per[s.id] = namedHere.concat(others);
      if (al) {
        al.named.forEach((x) => (roleOf[personId(x.personNo)] = x.role));
        const roles: EpRole[] = [];
        al.others.forEach((o) => { for (let i = 0; i < o.n; i++) roles.push(o.role); });
        while (roles.length < fill) roles.push("released");
        const shuffled = rng.shuffle(roles);
        others.forEach((n, i) => (roleOf[personId(n)] = shuffled[i]));
      } else {
        others.forEach((n) => (roleOf[personId(n)] = "released"));
      }
    }
    // Persist in chronological order, each session's people in a stable shuffled slot order.
    for (const s of past) attendees[s.id] = rng.shuffle(per[s.id]).map((n) => personId(n));
  }

  /* 3. demographics. Sisk released cohort uses exact quotas: bands 28/29/38/31, six at Site B aged 55+. */
  const visitDateOf = new Map<Id, LocalDate>();
  const siteOf = new Map<Id, string>();
  for (const s of sessions.filter((x) => x.status === "completed")) {
    for (const id of attendees[s.id]) { visitDateOf.set(id, s.date); siteOf.set(id, s.siteName); }
  }
  const bandOf = new Map<Id, string>();
  const siskReleased = (site: string) =>
    Object.keys(roleOf).filter((id) => id.startsWith("PH-P-") && Number(id.slice(5)) <= 500 && roleOf[id] === "released" && siteOf.get(id) === site);
  const quota: Record<string, Record<string, number>> = {
    [A]: { "18-34": 14, "35-44": 14, "45-54": 20, "55+": 25 },
    [B]: { "18-34": 14, "35-44": 15, "45-54": 18, "55+": 6 },
  };
  for (const site of [A, B]) {
    const ids = rng.shuffle(siskReleased(site));
    const bands: string[] = [];
    Object.entries(quota[site]).forEach(([band, n]) => { for (let i = 0; i < n; i++) bands.push(band); });
    ids.forEach((id, i) => bandOf.set(id, bands[i]));
  }
  // Gender and sex for the Sisk released cohort: exact categories, including small cells.
  const genderOf = new Map<Id, GenderRecorded>();
  const sexOf = new Map<Id, SexRecorded>();
  {
    const ids = rng.shuffle(siskReleased(A).concat(siskReleased(B)));
    const g: GenderRecorded[] = [];
    ([["woman", 53], ["man", 65], ["non_binary", 3], ["prefer_not_to_say", 2], ["not_recorded", 3]] as Array<[GenderRecorded, number]>).forEach(([k, n]) => { for (let i = 0; i < n; i++) g.push(k); });
    const sx: SexRecorded[] = [];
    ([["female", 55], ["male", 67], ["not_recorded", 4]] as Array<[SexRecorded, number]>).forEach(([k, n]) => { for (let i = 0; i < n; i++) sx.push(k); });
    const gs = rng.shuffle(g), ss = rng.shuffle(sx);
    ids.forEach((id, i) => { genderOf.set(id, gs[i]); sexOf.set(id, ss[i]); });
  }

  /* 4. persons */
  const used = new Set<string>(RESERVED_FULL_NAMES);
  const persons: Person[] = [];
  const todayVisit: LocalDate = "2026-10-05";
  for (const pid of PROGRAMME_ORDER) {
    const prog = PROGRAMME_BY_ID[pid];
    const start = PERSON_START[pid];
    for (let n = start; n < start + INVITED[pid]; n++) {
      const id = personId(n);
      const named = NAMED.find((x) => x.no === n);
      let given: string, family: string, dob: LocalDate, gender: GenderRecorded, sex: SexRecorded;
      if (named) {
        ({ given, family, dob, gender, sex } = named);
      } else {
        const r = rng.fork("p" + n);
        let tries = 0;
        do {
          given = r.chance(0.5) ? r.pick(FIRST_NAMES_F) : r.pick(FIRST_NAMES_M);
          family = r.pick(SURNAMES);
        } while (used.has(given + " " + family) && tries++ < 50);
        used.add(given + " " + family);
        // Ages for people who are not in a quota cohort.
        const visit = visitDateOf.get(id) || todayVisit;
        const band = bandOf.get(id);
        let age: number;
        if (band) {
          const [lo, hi] = BAND_RANGE[band];
          age = r.int(lo, hi);
        } else {
          age = r.int(21, 64);
        }
        dob = dobForAge(r, age, visit);
        if (genderOf.has(id)) {
          gender = genderOf.get(id)!;
          sex = sexOf.get(id)!;
        } else {
          const x = r.next();
          gender = x < 0.47 ? "woman" : x < 0.95 ? "man" : x < 0.97 ? "non_binary" : x < 0.985 ? "prefer_not_to_say" : "not_recorded";
          sex = gender === "woman" ? "female" : gender === "man" ? "male" : r.chance(0.5) ? "not_recorded" : r.pick(["female", "male"] as SexRecorded[]);
        }
      }
      const r2 = rng.fork("c" + n);
      const site = siteOf.get(id) || prog.sites[r2.int(0, prog.sites.length - 1)];
      persons.push({
        id, given, family, dob, sex, gender,
        email: `${strip(given)}.${strip(family)}${r2.chance(0.1) ? r2.int(2, 9) : ""}@${r2.chance(0.88) ? "example.com" : "example.invalid"}`,
        phone: maskedPhone(r2),
        programmeId: pid, site, hasFreeText: r2.chance(0.3),
      });
    }
  }

  /* 5. invitation codes */
  const codes = buildCodes();
  const codeFor = (pid: ProgrammeId, site: string, r: Rng): Id => {
    if (pid === "PRG-SISK-26") return site === B && r.chance(0.5) ? "IC-SISK-B" : "IC-SISK-MAIN";
    if (pid === "PRG-SF-26") return "IC-SF-MAIN";
    return "IC-IBM-MAIN";
  };

  /* 6. bookings */
  const bookings: Booking[] = [];
  let bookingNo = 0;
  const completedAtOf = (r: Rng, createdIso: Iso): Iso => new Date(Date.parse(createdIso) - r.int(6, 45) * 60000).toISOString();
  const personById = new Map(persons.map((p) => [p.id, p]));
  const bookedPersons = new Set<Id>();
  const pushBooking = (pid: Id, sess: ClinicSession, slot: Hhmm, attended: boolean) => {
    const person = personById.get(pid)!;
    const prog = PROGRAMME_BY_ID[sess.programmeId];
    const r = rng.fork("b" + pid);
    const invited = invitedAtFor(sess.programmeId);
    const earliest = Date.parse(invited) + 86400000;
    const latest = Math.min(Date.parse(dublinToUtc(sess.date, "08:00")) - 6 * 3600000, Date.parse("2026-10-04T16:00:00.000Z"));
    const created = new Date(earliest + Math.floor(r.next() * Math.max(3600000, latest - earliest))).toISOString();
    bookingNo++;
    bookings.push({
      id: `PH-B-${pad(bookingNo, 4)}`, personId: pid, programmeId: sess.programmeId, sessionId: sess.id, slotStart: slot,
      status: "confirmed", attendance: attended ? "completed" : "booked", createdAt: created,
      createdVia: r.chance(0.8) ? "portal" : "admin", appointmentTypeId: prog.appointmentTypeId, formTemplateId: prog.templateId,
      formVersion: "2.0", consentVersion: "BC-3", questionnaireCompletedAt: completedAtOf(r, created), episodeId: null, replaces: null, replacedBy: null,
    });
    bookedPersons.add(pid);
  };
  // Completed sessions: every slot attended.
  for (const s of sessions.filter((x) => x.status === "completed").sort((a, b) => (a.date === b.date ? (a.id < b.id ? -1 : 1) : a.date < b.date ? -1 : 1))) {
    const slots = slotsOf(s);
    attendees[s.id].forEach((pid, i) => pushBooking(pid, s, slots[i].start, true));
  }
  // Upcoming sessions: random slot subsets.
  const upcomingSessions = sessions.filter((x) => x.status === "scheduled").sort((a, b) => (a.date === b.date ? (a.id < b.id ? -1 : 1) : a.date < b.date ? -1 : 1));
  const upPool: Record<string, Id[]> = {};
  for (const pid of PROGRAMME_ORDER) upPool[pid] = upcomingByProg[pid].map(personId);
  const upCursor: Record<string, number> = { "PRG-SISK-26": 0, "PRG-SF-26": 0, "PRG-IBM-26": 0 };
  for (const s of upcomingSessions) {
    const seed = SESSION_SEEDS.find((x) => sessionIdFor(x.programmeId, x.date) === s.id)!;
    const slots = slotsOf(s);
    const idxs = rng.shuffle(slots.map((_, i) => i)).slice(0, seed.booked).sort((a, b) => a - b);
    const ids = upPool[s.programmeId].slice(upCursor[s.programmeId], upCursor[s.programmeId] + seed.booked);
    upCursor[s.programmeId] += seed.booked;
    idxs.forEach((si, i) => pushBooking(ids[i], s, slots[si].start, false));
  }

  /* 7. memberships */
  const draftPersonIds = draftNos.map(personId);
  const memberships: Membership[] = persons.map((p) => {
    const r = rng.fork("m" + p.id);
    const draft = draftPersonIds.includes(p.id);
    const booked = bookedPersons.has(p.id);
    const stage = booked ? "booked" : draft ? "onboarding" : "invited";
    return {
      id: `MB-${p.id.slice(5)}`, personId: p.id, programmeId: p.programmeId, stage,
      inviteCodeId: codeFor(p.programmeId, p.site, r), invitedAt: invitedAtFor(p.programmeId),
      consent: booked ? "complete" : "not_started", consentVersion: booked ? "BC-3" : null,
      questionnaire: booked ? "complete" : draft ? "draft" : "not_started",
      draft: draft
        ? { sectionsDone: p.id === "PH-P-0801" ? 2 : r.int(1, 3), sectionsTotal: 5, answers: (p.id === "PH-P-0801" ? { smoking: "Never", alcohol: 6 } : { smoking: "Former" }) as Record<string, string | number | boolean> }
        : null,
      answers: booked ? makeAnswers(r) : {},
      eligible: true,
      contactPreference: r.chance(0.55) ? "email" : "sms",
    };
  });
  // Make sure the people with reminder failures have clear preferences later (set in ops fixtures).
  return { persons, memberships, sessions, bookings, codes, attendees, roleOf, draftPersonIds };
}

function makeAnswers(r: Rng): Record<string, string | number | boolean> {
  return {
    smoking: r.pick(["Never", "Never", "Former", "Current"]),
    alcohol: r.int(0, 18),
    activity: r.int(0, 6),
    sleep: r.int(5, 9),
    famCvd: r.chance(0.2),
    chestPain: false,
    knownDiabetes: r.chance(0.04),
    famCancer: r.chance(0.18),
    medication: r.pick(["None", "None", "None", "Regular prescription"]),
    allergies: r.pick(["None", "None", "Penicillin", "Latex"]),
  };
}

export function invitedAtFor(pid: ProgrammeId): Iso {
  return pid === "PRG-SISK-26" ? "2026-08-24T09:00:00.000Z" : pid === "PRG-SF-26" ? "2026-09-08T09:00:00.000Z" : "2026-09-14T09:00:00.000Z";
}

function buildCodes(): InvitationCode[] {
  const mk = (id: string, programmeId: ProgrammeId, code: string, label: string, expires: LocalDate, status: InvitationCode["status"], elig: string, created: Iso): InvitationCode => ({
    id, programmeId, code, label, createdBy: "brenda", createdAt: created, expiresOn: expires, eligibility: elig, status,
    linkText: `portal.precisionhealth.example.invalid/i/${code}`,
  });
  return [
    mk("IC-SISK-MAIN", "PRG-SISK-26", "DEMO-SISK-26", "Sisk Autumn Screening, all sites", "2026-10-23", "active", "Employees on the Sisk programme roster", "2026-08-24T09:00:00.000Z"),
    mk("IC-SISK-B", "PRG-SISK-26", "DEMO-SISK-26-SITEB", "Sisk Dublin Site B", "2026-10-23", "active", "Site B employees", "2026-08-24T09:05:00.000Z"),
    mk("IC-SISK-PILOT", "PRG-SISK-26", "DEMO-SISK-26-PILOT", "Pilot group (closed)", "2026-09-12", "expired", "Pilot cohort, now closed", "2026-08-10T09:00:00.000Z"),
    mk("IC-SF-MAIN", "PRG-SF-26", "DEMO-SF-26", "Salesforce Dublin Wellness", "2026-10-09", "active", "Dublin office employees on the roster", "2026-09-08T09:00:00.000Z"),
    mk("IC-SF-OLD", "PRG-SF-26", "DEMO-SF-26-EARLY", "Early access link (revoked)", "2026-10-09", "revoked", "Revoked after a forwarded link", "2026-09-01T09:00:00.000Z"),
    mk("IC-IBM-MAIN", "PRG-IBM-26", "DEMO-IBM-26", "IBM Dublin Screening", "2026-10-12", "active", "Dublin site employees on the roster", "2026-09-14T09:00:00.000Z"),
  ];
}

