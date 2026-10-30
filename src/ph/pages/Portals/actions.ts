/* Portals page actions, registered at import time: create a client (HR) portal, put it live, invite a
   participant, add a nurse to the nursing team. Every change writes one activity event. Invitations
   are simulated: nothing is sent. Staff only, and the same portal admin permission as Participants,
   Portal admin (Directors and Administration). */
import { PROGRAMME_BY_ID, fmtDate, portalCodeFor, PORTAL_LINK_BASE, registerHandlers, takenCodes, today } from "../../model";
import type { ActionResult, Ctx, LocalDate, ProgrammeId, Staff, StaffId } from "../../model";

const pad = (n: number, w: number) => String(n).padStart(w, "0");
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isDate = (v: unknown): v is LocalDate => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + "T12:00:00Z"));
const TINTS = ["#9DB8E0", "#E0B48F", "#B4D69A", "#D6A3C9", "#A3D6CF"];

function admin(c: Ctx, what: string): ActionResult | null {
  return c.staffOnly(what) || c.need("portal.admin", what);
}

function createClient(c: Ctx, a: { company: string; programmeName: string; hrName: string; hrEmail: string; live: boolean }): ActionResult {
  const d = admin(c, "create client portals"); if (d) return d;
  const company = String(a.company || "").trim();
  const programmeName = String(a.programmeName || "").trim();
  const hrName = String(a.hrName || "").trim();
  const hrEmail = String(a.hrEmail || "").trim().toLowerCase();
  if (company.length < 2) return c.fail("Enter the client company.");
  if (programmeName.length < 3) return c.fail("Name the programme, for example Spring Screening 2027.");
  if (hrName.length < 3) return c.fail("Enter the HR contact's name.");
  if (!EMAIL.test(hrEmail)) return c.fail("Enter a valid email for the HR contact.");
  const k = company.toLowerCase();
  const prog = Object.values(PROGRAMME_BY_ID).find((p) => p.clientName.toLowerCase() === k);
  if (prog) return c.fail(`${prog.clientName} already has a client portal for ${prog.name}.`);
  if (c.s.portalsHub.clients.some((x) => x.company.toLowerCase() === k)) return c.fail(`${company} already has a client portal.`);
  const year = Number(today(c.s).slice(0, 4));
  const code = portalCodeFor(company, year, takenCodes(c.s));
  const h = c.s.portalsHub;
  h.seq += 1;
  const id = `CP-${pad(h.seq, 3)}`;
  const at = c.stamp();
  h.clients.push({
    id, company, programmeName, hrName, hrEmail, code, link: `${PORTAL_LINK_BASE}${code}`, status: a.live ? "live" : "draft", createdAt: at, createdBy: c.persona().name,
    history: [{ at, by: c.persona().name, text: a.live ? "Created and put live" : "Created as a draft" }],
  });
  c.emit({ verb: "portals.client_created", simulated: true, summary: `${c.first()} created a client portal for ${company} (${programmeName}) with invite code ${code}. HR contact ${hrName}. ${a.live ? "Live" : "Draft"}. Simulated: no email was sent.` });
  return c.ok(`Client portal for ${company} created with code ${code}${a.live ? " and is live" : " as a draft"}.`, "ok", id);
}

function goLive(c: Ctx, a: { id: string }): ActionResult {
  const d = admin(c, "change client portals"); if (d) return d;
  const r = c.s.portalsHub.clients.find((x) => x.id === a.id);
  if (!r) return c.fail("Unknown client portal.");
  if (r.status === "live") return c.fail(`${r.company}'s portal is already live.`);
  r.status = "live";
  r.history.push({ at: c.stamp(), by: c.persona().name, text: "Put live" });
  const prog = r.programmeId ? c.s.programmes.find((p) => p.id === r.programmeId) : undefined;
  if (prog?.setup && prog.setup.status !== "live") { prog.setup.status = "live"; prog.setup.history.push({ at: c.stamp(), by: c.persona().name, text: "Put live with the client portal" }); }
  c.emit({ verb: "portals.client_live", summary: `${c.first()} put the ${r.company} client portal live. Code ${r.code}.` });
  return c.ok(`${r.company}'s portal is live. HR can now share ${r.code} with employees.`);
}

function inviteParticipant(c: Ctx, a: { given: string; family: string; email: string; dob: string; programmeId: ProgrammeId }): ActionResult {
  const d = admin(c, "invite participants"); if (d) return d;
  const given = String(a.given || "").trim(), family = String(a.family || "").trim(), email = String(a.email || "").trim().toLowerCase();
  if (!given || !family) return c.fail("Enter the participant's first and last name.");
  if (!EMAIL.test(email)) return c.fail("Enter a valid email address.");
  if (!isDate(a.dob) || a.dob > today(c.s) || a.dob < "1900-01-01") return c.fail("Enter a valid date of birth. Lab results are matched on name, date of birth and ID.");
  const prog = PROGRAMME_BY_ID[a.programmeId];
  if (!prog) return c.fail("Choose the programme.");
  if (c.s.persons.some((p) => p.email.toLowerCase() === email)) return c.fail(`${email} is already a participant. Use Resend invite on their row.`);
  const code = c.s.invitationCodes.find((x) => x.programmeId === prog.id && x.status === "active" && x.expiresOn >= today(c.s) && /MAIN$/.test(x.id))
    || c.s.invitationCodes.find((x) => x.programmeId === prog.id && x.status === "active" && x.expiresOn >= today(c.s));
  const n = Math.max(0, ...c.s.persons.map((p) => Number(p.id.slice(5)) || 0)) + 1;
  const id = `PH-P-${pad(n, 4)}`;
  const at = c.stamp();
  c.s.persons.push({ id, given, family, dob: a.dob, sex: "not_recorded", gender: "not_recorded", email, phone: "Not given yet", programmeId: prog.id, site: prog.sites[0], hasFreeText: false });
  c.s.memberships.push({
    id: `MB-${id.slice(5)}`, personId: id, programmeId: prog.id, stage: "invited", inviteCodeId: code?.id || null, invitedAt: at, consent: "not_started", consentVersion: null,
    questionnaire: "not_started", draft: null, answers: {}, eligible: true, contactPreference: "email",
  });
  const mn = c.nextNo("message");
  c.s.messages.push({
    id: `MSG-${pad(mn, 5)}`, logicalId: `LM-I-${id}-${mn}`, kind: "invitation", personId: id, bookingId: null, episodeId: null, channel: "email", destination: email.replace(/^(.)[^@]*/, "$1***"),
    subject: "Your Precision Health screening invitation", status: "delivered", attempts: [{ at, outcome: "delivered", reason: null, auto: false }], cohort: null, at, provider: "Email", simulated: true,
  });
  c.s.portalsHub.invited.push(id);
  c.inv();
  c.emit({ verb: "portals.participant_invited", entity: { kind: "person", id }, programmeId: prog.id, personId: id, simulated: true,
    summary: `${c.first()} invited ${given} ${family} to ${prog.name}${code ? ` with code ${code.code}` : ""}. Simulated: no email was sent.` });
  return c.ok(`${given} ${family} invited to ${prog.name}${code ? ` with code ${code.code}` : ""} (simulated).`, "ok", id);
}

function addNurse(c: Ctx, a: { name: string; phone: string }): ActionResult {
  const d = c.staffOnly("add nurses");
  if (d) return d;
  if (!(c.can("bookings.manage") || c.persona().role === "clinical_review")) return c.fail(`${c.persona().name} (${c.persona().roleLabel}) cannot add nurses. Directors, the nursing lead and Programme Operations can. Switch role to try it.`);
  const name = String(a.name || "").trim().replace(/\s+/g, " ");
  const phone = String(a.phone || "").replace(/[\s-]/g, "");
  if (name.split(" ").length < 2) return c.fail("Enter the nurse's first and last name.");
  if (!/^(\+353|0)8\d{8}$/.test(phone)) return c.fail("Enter an Irish mobile number, for example 087 123 4567.");
  if (c.s.staff.some((s) => s.name.toLowerCase() === name.toLowerCase())) return c.fail(`${name} is already on the team.`);
  const first = name.split(" ")[0].toLowerCase().replace(/[^a-z]/g, "") || "nurse";
  let id = `nurse-${first}`;
  for (let n = 2; c.s.staff.some((s) => s.id === id); n++) id = `nurse-${first}${n}`;
  const initials = name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const st: Staff = {
    id: id as StaffId, name, displayName: name, title: "Occupational Health and Wellness Nurse", team: "nursing", role: "clinical_capture",
    email: `demo.${first}@precisionhealth.ie`, emailVerified: false, initials, tint: TINTS[c.s.staff.length % TINTS.length], assignment: "Added on the Portals page. Nurse portal access by invitation (simulated).",
  };
  c.s.staff.push(st);
  const team = c.s.teams.find((t) => t.id === "nursing");
  if (team && !team.memberIds.includes(st.id)) team.memberIds.push(st.id);
  c.s.portalsHub.nurses.push({ id: st.id, phone: a.phone.trim(), addedAt: c.stamp(), addedBy: c.persona().name });
  c.inv();
  c.emit({ verb: "portals.nurse_added", entity: { kind: "staff", id: st.id }, simulated: true, summary: `${c.first()} added ${name} to the nursing team and sent a nurse portal invitation by text to ${a.phone.trim()} (simulated). Added on ${fmtDate(today(c.s))}.` });
  return c.ok(`${name} added to the nursing team. They can now be put on screening days, flu clinics and MediBase sessions.`, "ok", st.id);
}

registerHandlers({
  "portals/createClient": createClient,
  "portals/goLive": goLive,
  "portals/inviteParticipant": inviteParticipant,
  "portals/addNurse": addNurse,
});

export const portalsAct = {
  createClient: (company: string, programmeName: string, hrName: string, hrEmail: string, live: boolean) => ({ type: "portals/createClient", company, programmeName, hrName, hrEmail, live }),
  goLive: (id: string) => ({ type: "portals/goLive", id }),
  inviteParticipant: (given: string, family: string, email: string, dob: string, programmeId: ProgrammeId) => ({ type: "portals/inviteParticipant", given, family, email, dob, programmeId }),
  addNurse: (name: string, phone: string) => ({ type: "portals/addNurse", name, phone }),
};
