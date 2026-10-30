/* Programme handlers, registered at import time: create a programme (with its client company if new,
   HR contact, invitation code and client (HR) portal on the Portals page), edit it, and put it live.
   Every change writes one activity event. Nothing is emailed. */
import type { ActionResult, Ctx, InvitationCode, Programme, ProgrammeStatus, StaffId } from "../../model";
import { PORTAL_LINK_BASE, fmtDate, registerHandlers, retCompanyKey, syncProgrammeRegistry, today } from "../../model";
import type { ProgForm } from "./progModel";
import { formFromProgramme, progErrors, programmeIds, serviceLabel, splitSites } from "./progModel";

const pad = (n: number, w: number) => String(n).padStart(w, "0");

/** Directors, the nursing lead, operations and programme oversight can set up programmes. */
export function canManageProgrammes(c: Ctx, what: string): ActionResult | null {
  const st = c.staffOnly(what); if (st) return st;
  if (c.can("bookings.manage") || c.can("invitations.manage") || c.persona().role === "clinical_review") return null;
  return c.fail(`${c.persona().name} (${c.persona().roleLabel}) cannot ${what}. Directors, the nursing lead and Programme Operations can. Switch role to try it.`);
}

function create(c: Ctx, a: { form: ProgForm }): ActionResult {
  const deny = canManageProgrammes(c, "set up programmes"); if (deny) return deny;
  const f = a.form;
  if (!f) return c.fail("Fill in the programme.");
  const errs = progErrors(c.s, f);
  const first = Object.values(errs)[0];
  if (first) return c.fail(first);
  const who = c.persona().name;
  const at = c.stamp();
  const companyName = f.companyName.trim();
  const start = f.windowStart as string, end = f.windowEnd as string;

  /* The client company: chosen, matched by name, or created now. */
  let co = c.s.companies.find((x) => x.id === f.clientRef && x.kind === "client")
    || c.s.companies.find((x) => x.kind === "client" && retCompanyKey(x.name) === retCompanyKey(companyName));
  let createdCompany = false;
  if (!co) {
    const slug = retCompanyKey(companyName).replace(/\s+/g, "-").slice(0, 24) || "client";
    let id = `co-${slug}`;
    for (let n = 2; c.s.companies.some((x) => x.id === id); n++) id = `co-${slug}-${n}`;
    co = { id, name: companyName, kind: "client", relationship: "Employer client", programmeIds: [], integrationIds: [], contactIds: [], note: "Created with a programme in Pulse. Fictional demo client." };
    c.s.companies.push(co);
    createdCompany = true;
  }
  const { id, code } = programmeIds(c.s, co.name, start);
  const method = f.method;
  const headcount = Number(f.headcount);
  const inviteCode = f.inviteCode.trim().toUpperCase();
  const sites = splitSites(f.sites);
  const status: ProgrammeStatus = f.status === "live" ? "live" : "draft";
  const p: Programme = {
    id, code, name: f.name.trim(), clientId: co.id, clientName: co.name, windowStart: start, windowEnd: end,
    ownerId: "stephen", clinicalLeadId: "neil", reportingLeadId: "martina", opsLeadId: "brenda",
    appointmentTypeId: "AT-COMP-LAB", templateId: "tpl-comprehensive-lab", sites,
    eligibility: `${co.name} employees invited by HR (${headcount} expected).`, inviteCode,
    setup: {
      status, serviceId: f.serviceId, serviceLabel: serviceLabel(c.s, f.serviceId), method, flu: !!f.flu, headcount, hrName: f.hrName.trim(), hrEmail: f.hrEmail.trim().toLowerCase(),
      onboardingId: f.onboardingId || null, portalId: null, createdAt: at, createdBy: who,
      history: [{ at, by: who, text: status === "live" ? "Created and put live" : "Created as a draft" }],
    },
  };
  c.s.programmes.push(p);
  co.programmeIds.push(id);

  /* HR contact on the company record. */
  const email = p.setup!.hrEmail;
  if (!c.s.contacts.some((x) => x.companyId === co!.id && x.email.toLowerCase() === email)) {
    let cid = `ct-${co.id.replace(/^co-/, "")}-hr`;
    for (let n = 2; c.s.contacts.some((x) => x.id === cid); n++) cid = `ct-${co.id.replace(/^co-/, "")}-hr${n}`;
    c.s.contacts.push({ id: cid, name: p.setup!.hrName, role: "HR contact (fictional)", companyId: co.id, email, provenance: "fictional", hasClinicalAccess: false });
    co.contactIds.push(cid);
  }

  /* Central invitation code, valid until the window closes. */
  const link = `${PORTAL_LINK_BASE}${inviteCode}`;
  const icode: InvitationCode = {
    id: `IC-${code}-MAIN`, programmeId: id, code: inviteCode, label: p.name, createdBy: c.persona().id as StaffId, createdAt: at, expiresOn: end,
    eligibility: p.eligibility, status: "active", linkText: link,
  };
  for (let n = 2; c.s.invitationCodes.some((x) => x.id === icode.id); n++) icode.id = `IC-${code}-MAIN${n}`;
  c.s.invitationCodes.push(icode);

  /* Client (HR) portal on the Portals page, Draft or Live with the programme. */
  const h = c.s.portalsHub;
  h.seq += 1;
  const portalId = `CP-${pad(h.seq, 3)}`;
  h.clients.push({
    id: portalId, company: co.name, programmeName: p.name, hrName: p.setup!.hrName, hrEmail: email, code: inviteCode, link, status, createdAt: at, createdBy: who,
    history: [{ at, by: who, text: `Created with the programme ${p.name}${status === "live" ? " and put live" : " as a draft"}` }], programmeId: id,
  });
  p.setup!.portalId = portalId;

  c.inv();
  syncProgrammeRegistry(c.s.programmes);
  c.emit({
    verb: "programme.created", entity: { kind: "programme", id }, programmeId: id, simulated: true,
    summary: `${c.first()} set up ${p.name} for ${co.name}${createdCompany ? " (new client record)" : ""}: ${p.setup!.serviceLabel}, ${method === "poc" ? "point of care" : "lab bloods"}, ${fmtDate(start)} to ${fmtDate(end)}, ${headcount} to invite. Invite code ${inviteCode}, client portal ${portalId}. ${status === "live" ? "Live" : "Draft"}. Simulated: nothing was emailed.`,
  });
  return c.ok(`${p.name} is set up${status === "live" ? " and live" : " as a draft"}. Invite code ${inviteCode}. Next: add a screening day.`, "ok", id);
}

function update(c: Ctx, a: { id: string; form: ProgForm }): ActionResult {
  const deny = canManageProgrammes(c, "edit programmes"); if (deny) return deny;
  const p = c.s.programmes.find((x) => x.id === a.id);
  if (!p) return c.fail("That programme no longer exists.");
  const f = { ...a.form, companyName: p.clientName };
  const errs = progErrors(c.s, f, p.id);
  const first = Object.values(errs)[0];
  if (first) return c.fail(first);
  const before = formFromProgramme(c.s, p);
  const changes: string[] = [];
  const set = <K extends keyof ProgForm>(k: K, label: string, apply: () => void) => {
    if (String(before[k]).trim() !== String(f[k]).trim()) { apply(); changes.push(label); }
  };
  set("name", "name", () => { p.name = f.name.trim(); });
  set("windowStart", "window", () => { p.windowStart = f.windowStart as string; });
  set("windowEnd", "window", () => { p.windowEnd = f.windowEnd as string; });
  set("sites", "sites", () => { p.sites = splitSites(f.sites); });
  set("inviteCode", "invite code", () => {
    const old = p.inviteCode;
    p.inviteCode = f.inviteCode.trim().toUpperCase();
    const ic = c.s.invitationCodes.find((x) => x.programmeId === p.id && x.code === old);
    if (ic) { ic.code = p.inviteCode; ic.linkText = `${PORTAL_LINK_BASE}${p.inviteCode}`; }
    const rec = c.s.portalsHub.clients.find((x) => x.programmeId === p.id);
    if (rec) { rec.code = p.inviteCode; rec.link = `${PORTAL_LINK_BASE}${p.inviteCode}`; }
  });
  if (p.setup) {
    const su = p.setup;
    set("serviceId", "package", () => { su.serviceId = f.serviceId; su.serviceLabel = serviceLabel(c.s, f.serviceId); });
    set("method", "screening method", () => { su.method = f.method; });
    set("flu", "flu add-on", () => { su.flu = !!f.flu; });
    set("headcount", "headcount", () => { su.headcount = Number(f.headcount); p.eligibility = `${p.clientName} employees invited by HR (${su.headcount} expected).`; });
    set("hrName", "HR contact", () => { su.hrName = f.hrName.trim(); });
    set("hrEmail", "HR contact", () => { su.hrEmail = f.hrEmail.trim().toLowerCase(); });
    const rec = c.s.portalsHub.clients.find((x) => x.programmeId === p.id);
    if (rec) { rec.programmeName = p.name; rec.hrName = su.hrName; rec.hrEmail = su.hrEmail; }
  }
  const uniq = [...new Set(changes)];
  if (!uniq.length) return c.fail("Nothing has changed.");
  const ic = c.s.invitationCodes.find((x) => x.programmeId === p.id && x.code === p.inviteCode);
  if (ic && ic.expiresOn < p.windowEnd) ic.expiresOn = p.windowEnd;
  p.setup?.history.push({ at: c.stamp(), by: c.persona().name, text: `Changed ${uniq.join(", ")}` });
  c.inv();
  c.emit({ verb: "programme.edited", entity: { kind: "programme", id: p.id }, programmeId: p.id, summary: `${c.first()} changed the ${uniq.join(", ")} of ${p.name}.` });
  return c.ok(`${p.name} saved: ${uniq.join(", ")} changed.`);
}

function setStatus(c: Ctx, a: { id: string; status: ProgrammeStatus }): ActionResult {
  const deny = canManageProgrammes(c, "change programme status"); if (deny) return deny;
  const p = c.s.programmes.find((x) => x.id === a.id);
  if (!p) return c.fail("That programme no longer exists.");
  if (!p.setup) return c.fail(`${p.name} is already live.`);
  if (p.setup.status === a.status) return c.fail(`${p.name} is already ${a.status === "live" ? "live" : "a draft"}.`);
  if (a.status === "draft" && c.s.bookings.some((b) => b.programmeId === p.id && b.status === "confirmed")) return c.fail("People have booked on this programme, so it stays live.");
  if (a.status === "live" && p.windowEnd < today(c.s)) return c.fail("The window has ended. Move the end date first.");
  p.setup.status = a.status;
  p.setup.history.push({ at: c.stamp(), by: c.persona().name, text: a.status === "live" ? "Put live" : "Moved back to draft" });
  const rec = c.s.portalsHub.clients.find((x) => x.programmeId === p.id);
  if (rec && rec.status !== a.status) { rec.status = a.status; rec.history.push({ at: c.stamp(), by: c.persona().name, text: a.status === "live" ? "Put live with the programme" : "Back to draft with the programme" }); }
  c.emit({ verb: a.status === "live" ? "programme.live" : "programme.draft", entity: { kind: "programme", id: p.id }, programmeId: p.id,
    summary: a.status === "live" ? `${c.first()} put ${p.name} live. ${p.clientName}'s HR portal is live with code ${p.inviteCode}.` : `${c.first()} moved ${p.name} back to draft.` });
  return c.ok(a.status === "live" ? `${p.name} is live. HR can now share ${p.inviteCode} with employees.` : `${p.name} is back to draft.`);
}

registerHandlers({ "prog/create": create, "prog/update": update, "prog/setStatus": setStatus });

export const progAct = {
  create: (form: ProgForm) => ({ type: "prog/create", form }),
  update: (id: string, form: ProgForm) => ({ type: "prog/update", id, form }),
  setStatus: (id: string, status: ProgrammeStatus) => ({ type: "prog/setStatus", id, status }),
};
