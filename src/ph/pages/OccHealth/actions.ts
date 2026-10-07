/* Occupational health actions, registered at import time through registerHandlers. Every handler
   is permission-checked (Stephen, Fiona, Martina and Brenda manage; clinical roles view; the
   participant preview has no access), idempotent (a repeated click fails and changes nothing) and
   writes one activity event. Anything that would reach Jotform, DocuSign, Xero or Meddbase is
   simulated and says so in the event text. */
import {
  OH_AGREEMENT_SHORT, OH_MANAGERS, OH_QUESTIONNAIRE_BY_ID, OH_STEPS, OH_STEP_BY_ID, OH_TEMPLATE_VERSION, OH_EMAIL_RE,
  fmtDate, localDateOf, ohAgreementFor, ohAgreementsStage, ohCurrentVersion, ohFmtEur, ohFormErrors, ohIsFullyCompleted, ohMeddbaseFee, ohMeddbaseReady, ohMergeFields,
  registerHandlers,
} from "../../model";
import type {
  ActionResult, Ctx, Handler, OhAgreement, OhAgreementKind, OhAgreementVersion, OhClient, OhOnboardingForm, OhStepId, StaffId,
} from "../../model";

const pad = (n: number, w: number) => String(n).padStart(w, "0");
const kindsOf = (k: OhAgreementKind | "both"): OhAgreementKind[] => (k === "both" ? ["sla", "dsa"] : [k]);
const listText = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** Null when the persona may manage occupational health, otherwise the failure to return. */
function needManage(c: Ctx, what: string): ActionResult | null {
  const p = c.persona();
  if (p.isParticipant) return c.fail(`The participant preview cannot ${what}. Occupational health is a staff area.`);
  if (!OH_MANAGERS.includes(p.id as StaffId)) return c.fail(`${p.name} (${p.roleLabel}) can view occupational health but cannot ${what}. Stephen, Fiona, Martina or Brenda manage it.`);
  return null;
}
function clientOf(c: Ctx, id: string): OhClient | null {
  return c.s.occHealth.clients.find((x) => x.id === id) || null;
}
/** "Brenda Madden on Aidan's behalf", or just the name when the owner is the one ticking. */
function byLine(c: Ctx, step: OhStepId): string {
  const def = OH_STEP_BY_ID[step];
  const p = c.persona();
  return def.staffId === p.id ? p.name : `${p.name} on ${def.owner}'s behalf`;
}
/** Move a client to Fully completed when its last step is done. Returns the extra toast text. */
function settleClient(c: Ctx, client: OhClient): string {
  if (client.fullyCompletedAt || !ohIsFullyCompleted(client)) return "";
  client.fullyCompletedAt = c.now;
  c.emit({ verb: "oh.fully_completed", summary: `${client.name} is fully completed: all four onboarding steps are done, so it moves to the Fully completed group.` });
  return ` ${client.name} is now fully completed.`;
}

/* ---------- onboarding form ---------- */
const submitOnboarding: Handler<{ form: OhOnboardingForm }> = (c, a) => {
  const d = needManage(c, "submit the onboarding form preview"); if (d) return d;
  const f: OhOnboardingForm = { ...a.form, services: a.form.services.slice() };
  (Object.keys(f) as Array<keyof OhOnboardingForm>).forEach((k) => { const v = f[k]; if (typeof v === "string") (f as unknown as Record<string, unknown>)[k] = v.trim(); });
  const errors = Object.values(ohFormErrors(f));
  if (errors.length) return c.fail(`Check the form: ${errors[0]}`);
  const o = c.s.occHealth;
  if (o.clients.some((x) => x.name.toLowerCase() === f.companyName.toLowerCase())) return c.fail(`${f.companyName} is already on the onboarding board.`);
  o.seq.client++; o.seq.form++;
  const id = `OHC-${pad(o.seq.client, 2)}`;
  const slug = f.companyName.toLowerCase().replace(/\(fictional\)/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || id.toLowerCase();
  const qs = new Set<string>();
  if (f.services.includes("Pre-employment medicals")) qs.add("OHQ-PE-GEN");
  if (f.services.includes("Health surveillance")) { qs.add("OHQ-RESP"); qs.add("OHQ-SKIN"); }
  if (f.services.includes("Night worker assessments")) qs.add("OHQ-NIGHT");
  if (f.services.includes("Vision screening")) qs.add("OHQ-VISION");
  const client: OhClient = {
    id, name: f.companyName, clientType: "To confirm", slug, submittedAt: c.now, formRef: `JF-OH-SIM-${pad(o.seq.form, 3)}`, form: f,
    steps: { xero: { status: "not_started", doneAt: null, doneBy: null }, agreements: { status: "not_started", doneAt: null, doneBy: null },
      recurring_invoice: { status: "not_started", doneAt: null, doneBy: null }, meddbase: { status: "not_started", doneAt: null, doneBy: null } },
    meddbaseFeeEur: ohMeddbaseFee(f.meddbaseUsers), lastAnnualInvoice: null, fullyCompletedAt: null, questionnaireIds: Array.from(qs), inviteLink: null,
  };
  o.clients.push(client);
  c.emit({
    verb: "oh.onboarding_submitted", integrationId: "jotform", simulated: true,
    summary: `Occupational Health Onboarding Form submitted for ${client.name} (Simulated Jotform submission ${client.formRef}, previewed by ${c.first()}). Added to the onboarding board with four owner steps: ${OH_STEPS.map((s) => `${s.owner}, ${s.column}`).join("; ")}.`,
  });
  return c.ok(`${client.name} added to Onboarding with a step for Aidan, Fiona, Stephen and Sinead.`, "ok", id);
};

/* ---------- owner steps ---------- */
const startStep: Handler<{ clientId: string; step: OhStepId }> = (c, a) => {
  const d = needManage(c, "update onboarding steps"); if (d) return d;
  const client = clientOf(c, a.clientId);
  const def = OH_STEP_BY_ID[a.step];
  if (!client || !def) return c.fail("That client or step was not found.");
  if (a.step === "agreements") return c.fail("Fiona's step moves on by itself as the SLA and DSA are generated, sent and signed. Use the Agreements tab.");
  const st = client.steps[a.step];
  if (st.status === "done") return c.fail(`${def.owner}'s step for ${client.name} is already done.`);
  if (st.status === "working") return c.fail(`${def.owner}'s step for ${client.name} is already in progress.`);
  st.status = "working";
  c.emit({ verb: "oh.step_started", integrationId: def.system, summary: `${def.owner}'s step "${def.column}" for ${client.name} marked working on it by ${byLine(c, a.step)}.` });
  return c.ok(`${def.column}: working on it.`);
};

const completeStep: Handler<{ clientId: string; step: OhStepId }> = (c, a) => {
  const d = needManage(c, "tick onboarding steps"); if (d) return d;
  const client = clientOf(c, a.clientId);
  const def = OH_STEP_BY_ID[a.step];
  if (!client || !def) return c.fail("That client or step was not found.");
  const st = client.steps[a.step];
  if (st.status === "done") return c.fail(`${def.owner}'s step for ${client.name} is already done.`);
  if (a.step === "agreements") {
    const stage = ohAgreementsStage(c.s, client.id);
    if (stage !== "signed") return c.fail("Fiona's step completes when both the SLA and the DSA are signed. Generate, send and record the signatures in the Agreements tab.");
  }
  if (a.step === "recurring_invoice" && client.steps.xero.status !== "done") return c.fail(`Aidan adds ${client.name} to Xero first. The recurring invoice is set up on that Xero contact.`);
  if (a.step === "meddbase") {
    const dsa = ohAgreementFor(c.s, client.id, "dsa");
    if (!dsa || ohCurrentVersion(dsa).status !== "signed") return c.fail(`The data sharing agreement must be signed before ${client.name}'s employee information goes into Meddbase.`);
  }
  st.status = "done";
  st.doneAt = c.now;
  st.doneBy = byLine(c, a.step);
  let extra = "";
  if (a.step === "recurring_invoice") {
    const o = c.s.occHealth;
    o.seq.invoice++;
    client.lastAnnualInvoice = { number: `INV-SIM-${pad(o.seq.invoice, 4)}`, date: localDateOf(c.now), amountEur: client.meddbaseFeeEur, simulated: true };
    extra = ` First yearly invoice ${client.lastAnnualInvoice.number} for ${ohFmtEur(client.meddbaseFeeEur)} drafted (Simulated: Xero not contacted).`;
  }
  const what: Record<OhStepId, string> = {
    xero: `${client.name} added to Xero (recorded in Pulse, Simulated: Xero not contacted).`,
    agreements: `SLA and DSA signed for ${client.name}.`,
    recurring_invoice: `recurring yearly invoice of ${ohFmtEur(client.meddbaseFeeEur)} set up for ${client.name}.${extra}`,
    meddbase: `${client.name} set up in Meddbase with ${client.form.meddbaseUsers} user${client.form.meddbaseUsers === 1 ? "" : "s"} (recorded in Pulse, Simulated: Meddbase not contacted). The client's portal guides are now available.`,
  };
  c.emit({ verb: "oh.step_done", integrationId: def.system, simulated: true, summary: `${def.owner}'s step "${def.column}" done by ${st.doneBy}: ${what[a.step]}` });
  const settled = settleClient(c, client);
  return c.ok(`${def.column} done for ${client.name}.${settled}`);
};

/* ---------- agreements ---------- */
const generateAgreement: Handler<{ clientId: string; kind: OhAgreementKind | "both" }> = (c, a) => {
  const d = needManage(c, "generate agreements"); if (d) return d;
  const client = clientOf(c, a.clientId);
  if (!client) return c.fail("That client was not found.");
  const today = localDateOf(c.now);
  const made: string[] = [];
  const skipped: string[] = [];
  const voided: string[] = [];
  for (const kind of kindsOf(a.kind)) {
    let ag = ohAgreementFor(c.s, client.id, kind);
    const fresh: Omit<OhAgreementVersion, "version"> = {
      status: "draft", templateVersion: OH_TEMPLATE_VERSION[kind], generatedAt: c.now, generatedBy: c.persona().name, merged: ohMergeFields(client, today),
      sentAt: null, envelopeId: null, signedAt: null, signedBy: null, note: "",
    };
    if (!ag) {
      ag = { id: `AGR-${client.id}-${kind.toUpperCase()}`, clientId: client.id, kind, versions: [] } as OhAgreement;
      c.s.occHealth.agreements.push(ag);
    } else {
      const cur = ohCurrentVersion(ag);
      if (cur.status === "signed") { skipped.push(OH_AGREEMENT_SHORT[kind]); continue; }
      const next = ag.versions.length + 1;
      if (cur.status === "sent") { cur.status = "voided"; cur.note = `DocuSign envelope ${cur.envelopeId} voided (Simulated) and replaced by version ${next}.`; voided.push(OH_AGREEMENT_SHORT[kind]); }
      else if (cur.status === "draft") { cur.status = "superseded"; cur.note = `Replaced by version ${next} before sending.`; }
    }
    ag.versions.push({ ...fresh, version: ag.versions.length + 1 });
    made.push(`${OH_AGREEMENT_SHORT[kind]} v${ag.versions.length}`);
  }
  if (!made.length) return c.fail(`${listText(skipped)} for ${client.name} ${skipped.length === 1 ? "is" : "are"} already signed. Signed versions are kept as they are.`);
  if (client.steps.agreements.status === "not_started") client.steps.agreements.status = "working";
  c.emit({
    verb: "oh.agreement_generated",
    summary: `${c.first()} generated ${listText(made)} for ${client.name} from the master templates with the onboarding details merged in. Draft, not sent.${voided.length ? ` The earlier ${listText(voided)} DocuSign envelope was voided (Simulated).` : ""}${skipped.length ? ` ${listText(skipped)} already signed, left as it is.` : ""}`,
  });
  return c.ok(`${listText(made)} generated for ${client.name}. Review the preview, then send for signature.`);
};

const sendAgreement: Handler<{ clientId: string; kind: OhAgreementKind | "both" }> = (c, a) => {
  const d = needManage(c, "send agreements for signature"); if (d) return d;
  const client = clientOf(c, a.clientId);
  if (!client) return c.fail("That client was not found.");
  if (!OH_EMAIL_RE.test(client.form.contactEmail)) return c.fail(`${client.name} has no valid contact email to send the envelope to.`);
  const sent: string[] = [];
  const o = c.s.occHealth;
  for (const kind of kindsOf(a.kind)) {
    const ag = ohAgreementFor(c.s, client.id, kind);
    const cur = ag ? ohCurrentVersion(ag) : null;
    if (!cur || cur.status !== "draft") continue;
    o.seq.envelope++;
    cur.status = "sent";
    cur.sentAt = c.now;
    cur.envelopeId = `DS-SIM-${pad(o.seq.envelope, 4)}`;
    sent.push(`${OH_AGREEMENT_SHORT[kind]} v${cur.version} (${cur.envelopeId})`);
  }
  if (!sent.length) return c.fail(`Nothing to send for ${client.name}: generate a draft first. Sent and signed versions are not sent again.`);
  if (client.steps.agreements.status === "not_started") client.steps.agreements.status = "working";
  c.emit({
    verb: "oh.agreement_sent", integrationId: "docusign", simulated: true,
    summary: `${listText(sent)} for ${client.name} sent for signature via DocuSign to ${client.form.contactName} (Simulated: no envelope was created and nothing was emailed).`,
  });
  return c.ok(`Sent via DocuSign to ${client.form.contactName} (Simulated).`);
};

const markSigned: Handler<{ clientId: string; kind: OhAgreementKind | "both" }> = (c, a) => {
  const d = needManage(c, "record signatures"); if (d) return d;
  const client = clientOf(c, a.clientId);
  if (!client) return c.fail("That client was not found.");
  const signed: string[] = [];
  for (const kind of kindsOf(a.kind)) {
    const ag = ohAgreementFor(c.s, client.id, kind);
    const cur = ag ? ohCurrentVersion(ag) : null;
    if (!cur || cur.status !== "sent") continue;
    cur.status = "signed";
    cur.signedAt = c.now;
    cur.signedBy = client.form.contactName;
    signed.push(`${OH_AGREEMENT_SHORT[kind]} v${cur.version}`);
  }
  if (!signed.length) return c.fail(`Nothing awaiting signature for ${client.name}. Only a version sent via DocuSign can be signed.`);
  c.emit({
    verb: "oh.agreement_signed", integrationId: "docusign", simulated: true,
    summary: `DocuSign reports ${listText(signed)} for ${client.name} signed by ${client.form.contactName} (Simulated signature for the demo).`,
  });
  let extra = "";
  if (ohAgreementsStage(c.s, client.id) === "signed" && client.steps.agreements.status !== "done") {
    const st = client.steps.agreements;
    st.status = "done"; st.doneAt = c.now; st.doneBy = "DocuSign (Simulated), both agreements signed";
    c.emit({ verb: "oh.step_done", integrationId: "docusign", simulated: true, summary: `Fiona's step "SLA and DSA" done for ${client.name}: both agreements are signed.` });
    extra = " Fiona's step is done." + settleClient(c, client);
  }
  return c.ok(`${listText(signed)} signed (Simulated).${extra}`);
};

/* ---------- questionnaires ---------- */
const issueInviteLink: Handler<{ clientId: string }> = (c, a) => {
  const d = needManage(c, "issue questionnaire links"); if (d) return d;
  const client = clientOf(c, a.clientId);
  if (!client) return c.fail("That client was not found.");
  if (client.inviteLink) return c.fail(`${client.name} already has a questionnaire link.`);
  if (!ohMeddbaseReady(client)) return c.fail(`Sinead sets ${client.name} up in Meddbase first, so returned questionnaires have somewhere to go.`);
  if (!client.questionnaireIds.length) return c.fail(`${client.name} has no questionnaires assigned yet.`);
  client.inviteLink = { code: `OH-${client.slug.replace(/[^a-z0-9]/g, "").slice(0, 6).toUpperCase()}`, url: `forms.precisionhealth.example.invalid/oh/${client.slug}`, createdAt: c.now };
  c.emit({ verb: "oh.invite_link", integrationId: "jotform", simulated: true,
    summary: `${c.first()} issued the pre-appointment questionnaire link for ${client.name} (${client.questionnaireIds.length} questionnaire${client.questionnaireIds.length === 1 ? "" : "s"}). Fictional address, Simulated.` });
  return c.ok(`Questionnaire link issued for ${client.name}.`);
};

const sendToMeddbase: Handler<{ submissionIds: string[] }> = (c, a) => {
  const d = needManage(c, "send questionnaires to Meddbase"); if (d) return d;
  const o = c.s.occHealth;
  const subs = o.submissions.filter((x) => a.submissionIds.includes(x.id) && x.meddbase.status !== "sent");
  if (!subs.length) return c.fail("Those questionnaires are already in Meddbase (Simulated) or were not found.");
  const blocked = subs.filter((x) => { const cl = clientOf(c, x.clientId); return !cl || !ohMeddbaseReady(cl); });
  if (blocked.length) return c.fail("A client in this selection is not set up in Meddbase yet. Sinead's step comes first.");
  for (const x of subs) {
    o.seq.meddbaseRef++;
    x.meddbase = { status: "sent", at: c.now, by: c.persona().name, ref: `MB-SIM-${pad(o.seq.meddbaseRef, 5)}` };
  }
  const clients = Array.from(new Set(subs.map((x) => clientOf(c, x.clientId)?.name || x.clientId)));
  c.emit({
    verb: "oh.meddbase_push", integrationId: "meddbase", simulated: true,
    summary: `${subs.length} pre-appointment questionnaire${subs.length === 1 ? "" : "s"} for ${listText(clients)} sent to Meddbase (${subs.map((x) => x.id).join(", ")}). Simulated: the Meddbase API is not agreed yet, so nothing left Pulse.`,
  });
  return c.ok(`${subs.length} questionnaire${subs.length === 1 ? "" : "s"} sent to Meddbase (Simulated, API not agreed yet).`);
};

function findSlot(c: Ctx, slotId: string) {
  for (const d of c.s.occHealth.diaries) {
    const slot = d.slots.find((x) => x.id === slotId);
    if (slot) return { diary: d, slot };
  }
  return null;
}

const chaseQuestionnaire: Handler<{ slotId: string }> = (c, a) => {
  const d = needManage(c, "chase questionnaires"); if (d) return d;
  const f = findSlot(c, a.slotId);
  if (!f || f.slot.kind !== "booked" || !f.slot.employee) return c.fail("That slot has no booked employee.");
  if (c.s.occHealth.submissions.some((x) => x.slotId === a.slotId)) return c.fail("The questionnaire for this slot is already in.");
  if (f.slot.chasedAt) return c.fail(`Already chased on ${fmtDate(f.slot.chasedAt)}. One reminder per appointment in this demo.`);
  f.slot.chasedAt = c.now;
  const q = f.slot.templateId ? OH_QUESTIONNAIRE_BY_ID[f.slot.templateId]?.title : "the questionnaire";
  c.emit({ verb: "oh.questionnaire_chased", integrationId: "jotform", simulated: true,
    summary: `Reminder to complete ${q} sent to employee ${f.slot.employee.ref}, booked at ${f.slot.start} in ${f.diary.clinicianName}'s Meddbase diary on ${fmtDate(f.diary.date)} (Simulated: no email or SMS sent).` });
  return c.ok(`Reminder sent to ${f.slot.employee.name} (Simulated).`);
};

const simulateQuestionnaire: Handler<{ slotId: string }> = (c, a) => {
  const d = needManage(c, "record a questionnaire"); if (d) return d;
  const f = findSlot(c, a.slotId);
  if (!f || f.slot.kind !== "booked" || !f.slot.employee || !f.slot.templateId) return c.fail("That slot has no booked employee.");
  const o = c.s.occHealth;
  if (o.submissions.some((x) => x.slotId === a.slotId)) return c.fail("The questionnaire for this slot is already in.");
  o.seq.submission++;
  const id = `OHS-${pad(o.seq.submission, 4)}`;
  o.submissions.push({ id, clientId: f.diary.clientId, templateId: f.slot.templateId, employee: { ...f.slot.employee }, submittedAt: c.now, slotId: f.slot.id,
    meddbase: { status: "not_sent", at: null, by: null, ref: null }, simulated: true });
  c.emit({ verb: "oh.questionnaire_received", integrationId: "jotform", simulated: true,
    summary: `Questionnaire ${id} received from employee ${f.slot.employee.ref} for the ${f.slot.start} slot on ${fmtDate(f.diary.date)} (Simulated Jotform submission). Not yet in Meddbase.` });
  return c.ok(`Questionnaire received for ${f.slot.start} (Simulated).`, "ok", id);
};

registerHandlers({
  "oh/submitOnboarding": submitOnboarding,
  "oh/startStep": startStep,
  "oh/completeStep": completeStep,
  "oh/generateAgreement": generateAgreement,
  "oh/sendAgreement": sendAgreement,
  "oh/markSigned": markSigned,
  "oh/issueInviteLink": issueInviteLink,
  "oh/sendToMeddbase": sendToMeddbase,
  "oh/chaseQuestionnaire": chaseQuestionnaire,
  "oh/simulateQuestionnaire": simulateQuestionnaire,
});

/** Typed action creators for this module. */
export const ohAct = {
  submitOnboarding: (form: OhOnboardingForm) => ({ type: "oh/submitOnboarding", form }),
  startStep: (clientId: string, step: OhStepId) => ({ type: "oh/startStep", clientId, step }),
  completeStep: (clientId: string, step: OhStepId) => ({ type: "oh/completeStep", clientId, step }),
  generateAgreement: (clientId: string, kind: OhAgreementKind | "both") => ({ type: "oh/generateAgreement", clientId, kind }),
  sendAgreement: (clientId: string, kind: OhAgreementKind | "both") => ({ type: "oh/sendAgreement", clientId, kind }),
  markSigned: (clientId: string, kind: OhAgreementKind | "both") => ({ type: "oh/markSigned", clientId, kind }),
  issueInviteLink: (clientId: string) => ({ type: "oh/issueInviteLink", clientId }),
  sendToMeddbase: (submissionIds: string[]) => ({ type: "oh/sendToMeddbase", submissionIds }),
  chaseQuestionnaire: (slotId: string) => ({ type: "oh/chaseQuestionnaire", slotId }),
  simulateQuestionnaire: (slotId: string) => ({ type: "oh/simulateQuestionnaire", slotId }),
};
