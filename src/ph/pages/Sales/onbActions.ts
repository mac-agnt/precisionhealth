/* Onboarding and retention actions, registered at import time. Any staff member may run them; the
   participant preview cannot. Agreements, Xero, MediBase and every email are simulated: nothing
   leaves Pulse. Each change writes one plain activity event. */
import {
  ONB_DOC_TITLE, ONB_KIND_LABEL, ONB_TEAM, RET_DEFAULT_TEMPLATES, RET_TEMPLATE_IDS, addDays, dublinToUtc, fmtDate, localDateOf, onbBillingCodes,
  onbDetailsErrors, onbMedibaseSteps, onbMergeFields, onbStepDone, onbStepsFor, registerHandlers, retCompanyKey, today, ONB_EMAIL_RE,
} from "../../model";
import type { Ctx, OnbBilling, OnbDetails, OnbDocKind, OnbKind, Onboarding, ProgrammeId, RetContact, RetTemplateId, StaffId } from "../../model";
import {
  onbById, onbForLead, onbPrefill, onbWelcomeValues, retClientFor, retReleaseQueue, retReleaseValues, retReminderValues, retReminders, retRender,
} from "./onbSelect";

const pad = (n: number, w: number) => String(n).padStart(w, "0");
const get = (c: Ctx, id: string) => onbById(c.s, id);
const label = (o: Onboarding) => o.details.companyName;
const trimPerson = (p: { name: string; email: string; phone: string }) => ({ name: (p.name || "").trim(), email: (p.email || "").trim(), phone: (p.phone || "").trim() });

function newEmail(c: Ctx, e: { template: RetTemplateId; company: string; toName: string; toEmail: string; subject: string; body: string; ref: string }): string {
  const s = c.s.onboarding;
  s.seq.email += 1;
  const id = `EM-${pad(s.seq.email, 4)}`;
  s.emails.push({ id, ...e, sentAt: c.stamp(), sentBy: c.persona().name });
  return id;
}

registerHandlers({
  "onb/start": (c, a: { kind: OnbKind; leadId: string | null }) => {
    const so = c.staffOnly("start onboarding"); if (so) return so;
    if (a.kind !== "oh" && a.kind !== "wellness") return c.fail("Choose Occupational Health or Wellness.");
    let lead;
    if (a.leadId) {
      lead = c.s.sales.leads.find((l) => l.id === a.leadId);
      if (!lead) return c.fail("Unknown lead.");
      if (lead.stage !== "won") return c.fail(`${lead.company} is not marked as won yet. Mark the lead as won in the Pipeline first.`);
      const existing = onbForLead(c.s, lead.id);
      if (existing) return c.ok(`${lead.company} is already being onboarded.`, "info", existing.id);
    }
    const s = c.s.onboarding;
    s.seq.onboarding += 1;
    const id = `ONB-${pad(s.seq.onboarding, 3)}`;
    const details = onbPrefill(lead, a.kind);
    s.onboardings.push({
      id, kind: a.kind, leadId: lead ? lead.id : null, createdAt: c.stamp(), createdBy: c.persona().name, details, detailsSavedAt: null, docs: {}, route: null,
      medibase: { assigneeId: "fiona", ticks: a.kind === "oh" ? onbMedibaseSteps(details).map(() => false) : [], doneAt: null },
      xero: { billing: a.kind === "oh" ? "retainer_525" : "per_programme", contactRef: null, createdAt: null }, welcomeEmailId: null, completedAt: null,
    });
    c.emit({ verb: "onboarding.started", summary: `${c.first()} started ${ONB_KIND_LABEL[a.kind]} onboarding ${id}${lead ? ` for ${lead.company} (won lead ${lead.id})` : ""}.`, entity: { kind: "onboarding", id, label: lead ? lead.company : "New client" } });
    return c.ok(`${ONB_KIND_LABEL[a.kind]} onboarding started${lead ? ` for ${lead.company}` : ""}.`, "ok", id);
  },

  "onb/saveDetails": (c, a: { id: string; details: OnbDetails }) => {
    const so = c.staffOnly("change onboarding details"); if (so) return so;
    const o = get(c, a.id); if (!o) return c.fail("Unknown onboarding.");
    if (o.completedAt) return c.fail("This onboarding is finished. Details can no longer change here.");
    const d = a.details;
    const clean: OnbDetails = {
      ...d, companyName: d.companyName.trim(), croNumber: d.croNumber.replace(/\s+/g, ""), registeredAddress: d.registeredAddress.trim(), sites: d.sites.trim(),
      headcount: d.headcount.trim(), main: trimPerson(d.main), hr: trimPerson(d.hr), finance: trimPerson(d.finance), referralManager: trimPerson(d.referralManager),
      apEmail: d.apEmail.trim(), poNumber: d.poNumber.trim(), notes: d.notes.trim(), services: [...d.services],
    };
    const errs = onbDetailsErrors(o.kind, clean);
    const first = Object.values(errs)[0];
    if (first) return c.fail(`Check the form: ${first}`);
    o.details = clean;
    o.detailsSavedAt = c.stamp();
    if (o.kind === "oh") {
      const steps = onbMedibaseSteps(clean);
      o.medibase.ticks = steps.map((_, i) => o.medibase.ticks[i] || false);
    }
    c.emit({ verb: "onboarding.details_saved", summary: `${c.first()} saved the onboarding details for ${clean.companyName} (${o.id}).`, entity: { kind: "onboarding", id: o.id, label: clean.companyName } });
    return c.ok("Details saved.");
  },

  "onb/generateDoc": (c, a: { id: string; doc: OnbDocKind }) => {
    const so = c.staffOnly("generate agreements"); if (so) return so;
    const o = get(c, a.id); if (!o) return c.fail("Unknown onboarding.");
    if (a.doc !== "dsa" && a.doc !== "sla") return c.fail("Unknown agreement.");
    if (!o.detailsSavedAt) return c.fail("Save the client's details first, so they can be merged into the agreement.");
    const cur = o.docs[a.doc];
    if (cur?.status === "signed") return c.fail(`The ${ONB_DOC_TITLE[a.doc]} is already signed.`);
    const now = c.stamp();
    o.docs[a.doc] = { status: "draft", version: (cur?.version || 0) + 1, generatedAt: now, sentAt: null, signedAt: null, merged: onbMergeFields(o, localDateOf(now)) };
    c.emit({ verb: "onboarding.doc_generated", summary: `${c.first()} generated the ${ONB_DOC_TITLE[a.doc]} for ${label(o)}, version ${o.docs[a.doc]!.version}.`, entity: { kind: "onboarding", id: o.id, label: label(o) } });
    return c.ok(`${ONB_DOC_TITLE[a.doc]} ready to review.`);
  },

  "onb/sendDoc": (c, a: { id: string; doc: OnbDocKind }) => {
    const so = c.staffOnly("send agreements"); if (so) return so;
    const o = get(c, a.id); if (!o) return c.fail("Unknown onboarding.");
    const d = o.docs[a.doc];
    if (!d) return c.fail("Generate the agreement first.");
    if (d.status !== "draft") return c.fail(d.status === "sent" ? "Already sent. Waiting for the signature." : "Already signed.");
    d.status = "sent"; d.sentAt = c.stamp();
    c.emit({ verb: "onboarding.doc_sent", summary: `${c.first()} sent the ${ONB_DOC_TITLE[a.doc]} to ${o.details.main.name} at ${label(o)} for signature. Simulated: nothing was emailed.`, entity: { kind: "onboarding", id: o.id, label: label(o) }, simulated: true, integrationId: "docusign" });
    return c.ok(`Sent to ${o.details.main.name} for signature.`);
  },

  "onb/signDoc": (c, a: { id: string; doc: OnbDocKind }) => {
    const so = c.staffOnly("record signatures"); if (so) return so;
    const o = get(c, a.id); if (!o) return c.fail("Unknown onboarding.");
    const d = o.docs[a.doc];
    if (!d || d.status === "draft") return c.fail("Send the agreement before recording a signature.");
    if (d.status === "signed") return c.fail("Already signed.");
    d.status = "signed"; d.signedAt = c.stamp();
    c.emit({ verb: "onboarding.doc_signed", summary: `${label(o)} signed the ${ONB_DOC_TITLE[a.doc]}. Simulated signature.`, entity: { kind: "onboarding", id: o.id, label: label(o) }, simulated: true, integrationId: "docusign" });
    return c.ok(`${ONB_DOC_TITLE[a.doc]} signed.`);
  },

  "onb/route": (c, a: { id: string }) => {
    const so = c.staffOnly("route onboarding"); if (so) return so;
    const o = get(c, a.id); if (!o) return c.fail("Unknown onboarding.");
    if (!o.detailsSavedAt) return c.fail("Save the client's details first.");
    if (o.route) return c.fail(`Already with the ${ONB_TEAM[o.kind].name}.`);
    const team = ONB_TEAM[o.kind];
    const owner = c.s.staff.find((x) => x.id === team.ownerId);
    if (!owner) return c.fail("The team owner is not set up.");
    const n = c.nextNo("task");
    const taskId = `TSK-${pad(n, 4)}`;
    const due = dublinToUtc(addDays(today(c.s), 2), "17:00");
    const what = o.kind === "oh" ? "set up MediBase, questionnaires and referrals" : "plan the first programme dates and confirm the services";
    c.s.tasks.push({
      id: taskId, title: `Onboard ${label(o)}: ${o.kind === "oh" ? "occupational health set-up" : "wellness programme set-up"}`,
      detail: `New ${ONB_KIND_LABEL[o.kind]} client from onboarding ${o.id}. Please ${what}. Main contact: ${o.details.main.name}, ${o.details.main.email}.`,
      storyId: null, ownerId: owner.id, team: owner.team, priority: "medium", dueAt: due, status: "open", clinical: false,
      linked: { kind: "onboarding", id: o.id, label: `${label(o)} onboarding` }, createdAt: c.stamp(), completedAt: null, completedBy: null,
    });
    o.route = { taskId, at: c.stamp(), ownerId: owner.id };
    c.emit({ verb: "onboarding.routed", summary: `${c.first()} handed ${label(o)} to the ${team.name}. Task ${taskId} for ${owner.name}.`, entity: { kind: "task", id: taskId } });
    return c.ok(`Sent to the ${team.name}. Task ${taskId} created for ${owner.name}.`);
  },

  "onb/medibaseTick": (c, a: { id: string; index: number; done: boolean }) => {
    const so = c.staffOnly("update MediBase set-up"); if (so) return so;
    const o = get(c, a.id); if (!o) return c.fail("Unknown onboarding.");
    if (o.kind !== "oh") return c.fail("MediBase set-up is for occupational health clients only.");
    if (!Number.isInteger(a.index) || a.index < 0 || a.index >= o.medibase.ticks.length) return c.fail("Unknown checklist step.");
    o.medibase.ticks[a.index] = !!a.done;
    const all = o.medibase.ticks.every(Boolean);
    const wasDone = !!o.medibase.doneAt;
    o.medibase.doneAt = all ? (o.medibase.doneAt || c.stamp()) : null;
    if (all && !wasDone) {
      c.emit({ verb: "onboarding.medibase_done", summary: `MediBase set-up finished for ${label(o)}. Manual step, recorded in Pulse.`, entity: { kind: "onboarding", id: o.id, label: label(o) } });
      return c.ok("MediBase set-up complete.");
    }
    return c.ok();
  },

  "onb/medibaseAssign": (c, a: { id: string; staffId: StaffId }) => {
    const so = c.staffOnly("assign MediBase set-up"); if (so) return so;
    const o = get(c, a.id); if (!o) return c.fail("Unknown onboarding.");
    const st = c.s.staff.find((x) => x.id === a.staffId);
    if (!st) return c.fail("Choose someone to do it.");
    o.medibase.assigneeId = st.id;
    return c.ok(`MediBase set-up assigned to ${st.name}.`);
  },

  "onb/setBilling": (c, a: { id: string; billing: OnbBilling }) => {
    const so = c.staffOnly("change billing"); if (so) return so;
    const o = get(c, a.id); if (!o) return c.fail("Unknown onboarding.");
    if (o.xero.contactRef) return c.fail("Already set up in Xero. Change the repeating invoice in Xero.");
    const allowed: OnbBilling[] = o.kind === "oh" ? ["retainer_525", "retainer_1050"] : ["per_programme"];
    if (!allowed.includes(a.billing)) return c.fail(o.kind === "oh" ? "Choose the €525 or €1,050 yearly recurring fee." : "Wellness clients are invoiced per programme.");
    o.xero.billing = a.billing;
    return c.ok();
  },

  "onb/createXero": (c, a: { id: string }) => {
    const so = c.staffOnly("create Xero contacts"); if (so) return so;
    const o = get(c, a.id); if (!o) return c.fail("Unknown onboarding.");
    if (!o.detailsSavedAt) return c.fail("Save the client's details first.");
    if (o.xero.contactRef) return c.fail("Already created in Xero.");
    const s = c.s.onboarding;
    s.seq.xero += 1;
    o.xero.contactRef = `XC-DEMO-${pad(s.seq.xero + 40, 4)}`;
    o.xero.createdAt = c.stamp();
    const codes = onbBillingCodes(o.kind, o.xero.billing).map((x) => x.code).join(", ");
    c.emit({ verb: "onboarding.xero_created", summary: `${c.first()} created ${label(o)} as a Xero contact (${o.xero.contactRef}) with billing codes ${codes}. Simulated: Xero is not connected.`, entity: { kind: "onboarding", id: o.id, label: label(o) }, simulated: true, integrationId: "xero" });
    return c.ok(`Created in Xero: ${o.xero.contactRef}.`);
  },

  "onb/finish": (c, a: { id: string }) => {
    const so = c.staffOnly("finish onboarding"); if (so) return so;
    const o = get(c, a.id); if (!o) return c.fail("Unknown onboarding.");
    if (o.completedAt) return c.fail("Already finished.");
    const done = onbStepDone(o);
    const missing = onbStepsFor(o.kind).filter((s) => s !== "done" && !done[s]);
    if (missing.length) return c.fail(`Finish these steps first: ${missing.join(", ")}.`);
    const r = retRender(c.s, "welcome", onbWelcomeValues(c.s, o));
    o.welcomeEmailId = newEmail(c, { template: "welcome", company: label(o), toName: o.details.main.name, toEmail: o.details.main.email, subject: r.subject, body: r.body, ref: o.id });
    o.completedAt = c.stamp();
    if (o.leadId) {
      const lead = c.s.sales.leads.find((l) => l.id === o.leadId);
      if (lead) lead.history.push({ at: c.stamp(), by: c.persona().name, text: `Onboarding ${o.id} finished. Welcome email sent.` });
    }
    c.emit({ verb: "onboarding.finished", summary: `${label(o)} is onboarded. Welcome email sent to ${o.details.main.name}. Simulated: nothing was emailed.`, entity: { kind: "onboarding", id: o.id, label: label(o) }, simulated: true, integrationId: "email" });
    return c.ok(`${label(o)} is onboarded. Welcome email sent.`);
  },

  /* ---------------- retention ---------------- */

  "ret/sendResultsOut": (c, a: { programmeId: ProgrammeId }) => {
    const so = c.staffOnly("send client emails"); if (so) return so;
    const it = retReleaseQueue(c.s).find((x) => x.programmeId === a.programmeId);
    if (!it) return c.fail("Nothing new to tell this client.");
    if (!it.contact) return c.fail(`${it.company} has no current HR contact. Choose one under Client contacts first.`);
    const r = retRender(c.s, "results_out", retReleaseValues(c.s, it));
    const id = newEmail(c, { template: "results_out", company: it.company, toName: it.contact.name, toEmail: it.contact.email, subject: r.subject, body: r.body, ref: it.programmeId });
    c.s.onboarding.releaseNotified[it.programmeId] = it.released;
    c.emit({ verb: "retention.results_out_sent", summary: `${c.first()} sent "Results are out" to ${it.contact.name} at ${it.company} (${it.released} reports released). Simulated: nothing was emailed.`, entity: { kind: "programme", id: it.programmeId }, programmeId: it.programmeId, simulated: true, integrationId: "email" });
    return c.ok(`Sent to ${it.contact.name}.`, "ok", id);
  },

  "ret/sendRebooking": (c, a: { recallId: string }) => {
    const so = c.staffOnly("send client emails"); if (so) return so;
    const r = retReminders(c.s).find((x) => x.recall.id === a.recallId);
    if (!r) return c.fail("This client does not need a rebooking reminder.");
    if (r.emailId) return c.fail("Reminder already sent.");
    if (!r.contact) return c.fail(`${r.recall.company} has no current contact. Choose who should get it first.`);
    const m = retRender(c.s, "rebooking", retReminderValues(c.s, r));
    const id = newEmail(c, { template: "rebooking", company: r.recall.company, toName: r.contact.name, toEmail: r.contact.email, subject: m.subject, body: m.body, ref: r.recall.id });
    c.s.onboarding.rebookSent[r.recall.id] = id;
    c.emit({ verb: "retention.rebooking_sent", summary: `${c.first()} sent the rebooking reminder to ${r.contact.name} at ${r.recall.company} (anniversary ${fmtDate(r.recall.recallOn)}). Simulated: nothing was emailed.`, simulated: true, integrationId: "email" });
    return c.ok(`Reminder sent to ${r.contact.name}.`, "ok", id);
  },

  "ret/contactLeft": (c, a: { company: string; replacement: RetContact | null }) => {
    const so = c.staffOnly("update client contacts"); if (so) return so;
    const cl = retClientFor(c.s, a.company);
    if (!cl) return c.fail("Unknown client.");
    if (!cl.current) return c.fail("No current contact to mark as left.");
    const rep = a.replacement ? { name: a.replacement.name.trim(), role: (a.replacement.role || "").trim() || "HR contact", email: a.replacement.email.trim() } : null;
    if (rep) {
      if (!rep.name) return c.fail("Add the new contact's name.");
      if (!ONB_EMAIL_RE.test(rep.email)) return c.fail("Add a valid email for the new contact.");
      if (rep.email.toLowerCase() === cl.current.email.toLowerCase()) return c.fail("The new contact must be a different person.");
    }
    const key = retCompanyKey(a.company);
    const ch = c.s.onboarding.contactChanges[key] || { company: cl.company, left: [], current: null };
    ch.left.push({ name: cl.current.name, email: cl.current.email, leftOn: today(c.s) });
    ch.current = rep;
    c.s.onboarding.contactChanges[key] = ch;
    c.emit({ verb: "retention.contact_left", summary: `${c.first()} marked ${cl.current.name} as having left ${cl.company}. Reminders stop going to them${rep ? `; ${rep.name} is the new contact` : ""}.` });
    return c.ok(rep ? `${cl.current.name} marked as left. ${rep.name} gets reminders now.` : `${cl.current.name} marked as left. Choose a new contact when you know who it is.`);
  },

  "ret/setContact": (c, a: { company: string; contact: RetContact }) => {
    const so = c.staffOnly("update client contacts"); if (so) return so;
    const cl = retClientFor(c.s, a.company);
    if (!cl) return c.fail("Unknown client.");
    const rep = { name: (a.contact.name || "").trim(), role: (a.contact.role || "").trim() || "HR contact", email: (a.contact.email || "").trim() };
    if (!rep.name) return c.fail("Add the contact's name.");
    if (!ONB_EMAIL_RE.test(rep.email)) return c.fail("Add a valid email address.");
    if (cl.left.some((x) => x.email.toLowerCase() === rep.email.toLowerCase())) return c.fail(`That person has left ${cl.company}. Choose someone else.`);
    const key = retCompanyKey(a.company);
    const ch = c.s.onboarding.contactChanges[key] || { company: cl.company, left: [], current: null };
    ch.current = rep;
    c.s.onboarding.contactChanges[key] = ch;
    c.emit({ verb: "retention.contact_set", summary: `${c.first()} made ${rep.name} the contact for ${cl.company}.` });
    return c.ok(`${rep.name} is now the contact for ${cl.company}.`);
  },

  "ret/saveTemplate": (c, a: { id: RetTemplateId; subject: string; body: string }) => {
    const so = c.staffOnly("edit email templates"); if (so) return so;
    if (!RET_TEMPLATE_IDS.includes(a.id)) return c.fail("Unknown template.");
    const subject = (a.subject || "").trim(), body = (a.body || "").trim();
    if (!subject) return c.fail("The email needs a subject.");
    if (body.length < 10) return c.fail("The email needs a message.");
    const t = c.s.onboarding.templates[a.id];
    t.subject = subject; t.body = body; t.updatedAt = c.stamp(); t.updatedBy = c.persona().name;
    c.emit({ verb: "retention.template_saved", summary: `${c.first()} updated the "${t.name}" email template.` });
    return c.ok(`"${t.name}" template saved.`);
  },

  "ret/resetTemplate": (c, a: { id: RetTemplateId }) => {
    const so = c.staffOnly("edit email templates"); if (so) return so;
    if (!RET_TEMPLATE_IDS.includes(a.id)) return c.fail("Unknown template.");
    c.s.onboarding.templates[a.id] = { ...RET_DEFAULT_TEMPLATES[a.id], updatedAt: null, updatedBy: null };
    return c.ok("Template back to the standard wording.");
  },
});

export const onbAct = {
  start: (kind: OnbKind, leadId: string | null) => ({ type: "onb/start", kind, leadId }),
  saveDetails: (id: string, details: OnbDetails) => ({ type: "onb/saveDetails", id, details }),
  generateDoc: (id: string, doc: OnbDocKind) => ({ type: "onb/generateDoc", id, doc }),
  sendDoc: (id: string, doc: OnbDocKind) => ({ type: "onb/sendDoc", id, doc }),
  signDoc: (id: string, doc: OnbDocKind) => ({ type: "onb/signDoc", id, doc }),
  route: (id: string) => ({ type: "onb/route", id }),
  medibaseTick: (id: string, index: number, done: boolean) => ({ type: "onb/medibaseTick", id, index, done }),
  medibaseAssign: (id: string, staffId: StaffId) => ({ type: "onb/medibaseAssign", id, staffId }),
  setBilling: (id: string, billing: OnbBilling) => ({ type: "onb/setBilling", id, billing }),
  createXero: (id: string) => ({ type: "onb/createXero", id }),
  finish: (id: string) => ({ type: "onb/finish", id }),
  sendResultsOut: (programmeId: ProgrammeId) => ({ type: "ret/sendResultsOut", programmeId }),
  sendRebooking: (recallId: string) => ({ type: "ret/sendRebooking", recallId }),
  contactLeft: (company: string, replacement: RetContact | null) => ({ type: "ret/contactLeft", company, replacement }),
  setContact: (company: string, contact: RetContact) => ({ type: "ret/setContact", company, contact }),
  saveTemplate: (id: RetTemplateId, subject: string, body: string) => ({ type: "ret/saveTemplate", id, subject, body }),
  resetTemplate: (id: RetTemplateId) => ({ type: "ret/resetTemplate", id }),
};
