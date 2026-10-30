/* Portals: one place to see and create the three kinds of portal (Portals page).
   - Client (HR) portals: one per client company. The three screening programmes have one each from the
     start; new ones are created here with an invite code and link.
   - Participant portals: one account per person, read from Participants, Portal admin (accountRows).
   - Nurse portal: the nursing team and their upcoming clinic days.
   Pure module: no React, no dispatch. Handlers live in src/ph/pages/Portals/actions.ts. */
import type { Iso, LocalDate } from "./time";
import { fmtDate } from "./time";
import type { AccountRow } from "./portalAdmin";
import { accountRows } from "./portalAdmin";
import type { PhState, ProgrammeId, StaffId } from "./types";
import { CONTACTS, NURSE_ROLE_KEYS, PROGRAMMES } from "./constants";
import { programmeCounts, today } from "./selectors";

export interface ClientPortalRec {
  id: string; // CP-001
  company: string;
  programmeName: string;
  hrName: string;
  hrEmail: string;
  code: string;
  link: string;
  status: "live" | "draft";
  createdAt: Iso;
  createdBy: string;
  history: Array<{ at: Iso; by: string; text: string }>;
}
export interface PortalsHubState {
  seq: number;
  clients: ClientPortalRec[];
  /** Nurses added from the Portals page, with the phone number given. */
  nurses: Array<{ id: StaffId; phone: string; addedAt: Iso; addedBy: string }>;
  /** People invited from the Portals page, newest last. */
  invited: string[];
}
export const initialPortalsHubState = (): PortalsHubState => ({ seq: 0, clients: [], nurses: [], invited: [] });
export const PORTAL_LINK_BASE = "portal.precisionhealth.example.invalid/i/";

/** "DEMO-ACME-26" style code from a company name, unique against the codes already in use. */
export function portalCodeFor(company: string, year: number, taken: string[]): string {
  const word = company.replace(/\(fictional\)/i, "").trim().split(/\s+/)[0] || "CLIENT";
  const stem = word.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) || "CLIENT";
  const base = `DEMO-${stem}-${String(year).slice(2)}`;
  let code = base;
  for (let n = 2; taken.includes(code); n++) code = `${base}-${n}`;
  return code;
}
export const takenCodes = (s: PhState): string[] => [...s.invitationCodes.map((c) => c.code), ...(s.portalsHub?.clients || []).map((c) => c.code)];

export interface ClientPortalRow {
  id: string;
  company: string;
  programme: string;
  programmeId: ProgrammeId | null;
  hrName: string;
  hrEmail: string;
  code: string;
  link: string;
  status: "live" | "draft";
  counts: { invited: number; booked: number; attended: number; released: number };
  /** Only for portals created on the Portals page. */
  rec: ClientPortalRec | null;
}

export function clientPortalRows(s: PhState): ClientPortalRow[] {
  const rows: ClientPortalRow[] = PROGRAMMES.map((p) => {
    const ct = s.contacts.find((c) => c.companyId === p.clientId) || CONTACTS.find((c) => c.companyId === p.clientId);
    const code = s.invitationCodes.find((c) => c.programmeId === p.id && c.status === "active" && /MAIN$/.test(c.id)) || s.invitationCodes.find((c) => c.programmeId === p.id && c.status === "active");
    const k = programmeCounts(s, p.id);
    return {
      id: `prog:${p.id}`, company: p.clientName, programme: p.name, programmeId: p.id, hrName: ct?.name || "HR contact", hrEmail: ct?.email || "",
      code: code?.code || "No active code", link: code?.linkText || "", status: code ? "live" : "draft",
      counts: { invited: k.invited, booked: k.booked, attended: k.attended, released: k.released }, rec: null,
    };
  });
  for (const r of s.portalsHub?.clients || []) {
    rows.push({ id: r.id, company: r.company, programme: r.programmeName, programmeId: null, hrName: r.hrName, hrEmail: r.hrEmail, code: r.code, link: r.link, status: r.status, counts: { invited: 0, booked: 0, attended: 0, released: 0 }, rec: r });
  }
  return rows;
}

export type JourneyStatus = "not_invited" | "invited" | "registered" | "booked" | "attended" | "released";
export const JOURNEY_LABEL: Record<JourneyStatus, string> = {
  not_invited: "Not invited", invited: "Invited", registered: "Registered", booked: "Booked", attended: "Attended", released: "Results released",
};
export const JOURNEY_ORDER: JourneyStatus[] = ["invited", "registered", "booked", "attended", "released", "not_invited"];
export function journeyOf(r: AccountRow): JourneyStatus {
  if (r.report.releasedAt) return "released";
  if (r.booking.kind === "attended") return "attended";
  if (r.booking.kind === "upcoming") return "booked";
  if (r.status === "registered" || r.status === "mfa_enrolled" || r.status === "locked") return "registered";
  if (r.status === "invited") return "invited";
  return "not_invited";
}
export interface ParticipantPortalRow { row: AccountRow; journey: JourneyStatus; isNew: boolean }
/** Every participant account, newest invites first, then by name. */
export function participantPortalRows(s: PhState): ParticipantPortalRow[] {
  const invited = s.portalsHub?.invited || [];
  const out = accountRows(s).map((row) => ({ row, journey: journeyOf(row), isNew: invited.includes(row.person.id) }));
  const rank = (x: ParticipantPortalRow) => (x.isNew ? 1 + invited.indexOf(x.row.person.id) : 0);
  return out.sort((a, b) => rank(b) - rank(a) || (a.row.person.family + a.row.person.given < b.row.person.family + b.row.person.given ? -1 : 1));
}

export interface NurseDay { date: LocalDate; label: string; kind: "screening" | "flu" | "oh" }
export interface NursePortalRow { id: StaffId; name: string; title: string; initials: string; tint: string; phone: string | null; added: boolean; days: NurseDay[] }
/** Nurses and their upcoming clinic days (screening clinics, flu clinics, MediBase sessions). */
export function nursePortalRows(s: PhState): NursePortalRow[] {
  const t = today(s);
  return s.staff.filter((x) => NURSE_ROLE_KEYS.includes(x.role)).map((x) => {
    const days: NurseDay[] = [];
    for (const ses of s.sessions) {
      if (ses.status === "cancelled" || ses.date < t || (ses.nurseId !== x.id && !ses.supportIds.includes(x.id))) continue;
      const prog = PROGRAMMES.find((p) => p.id === ses.programmeId);
      days.push({ date: ses.date, label: `${fmtDate(ses.date)}, ${prog?.clientName || "Clinic"}`, kind: "screening" });
    }
    for (const f of s.flu.clinics) if (f.date && f.date >= t && f.status === "scheduled" && f.staffIds.includes(x.id)) days.push({ date: f.date, label: `${fmtDate(f.date)}, ${f.company} flu`, kind: "flu" });
    for (const d of s.occHealth.diaries) if (d.date >= t && d.clinicianStaffId === x.id) days.push({ date: d.date, label: `${fmtDate(d.date)}, occupational health`, kind: "oh" });
    days.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const added = (s.portalsHub?.nurses || []).find((n) => n.id === x.id);
    return { id: x.id, name: x.name, title: x.title, initials: x.initials, tint: x.tint, phone: added?.phone || null, added: !!added, days };
  });
}
