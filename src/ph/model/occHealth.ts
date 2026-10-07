/* Occupational health: client onboarding, agreements, Meddbase set-up, pre-appointment
   questionnaires and Meddbase clinician diaries (RECORDING.md section 6).

   The "Complete onboarding occ health" Monday.com board is rebuilt here: one row per OH client and
   one step per owner (Aidan adds the client to Xero, Fiona's SLA and DSA go out through DocuSign,
   Stephen sets up the recurring invoice, Sinead sets up Meddbase). A client is fully completed only
   when every step is done. Aidan and Sinead are named owners in this slice, not Pulse users.

   Meddbase stays the system of record for occupational health. Pulse shows readiness: which
   employees have returned their questionnaire before their slot. Every push to Meddbase, DocuSign,
   Xero or Jotform is simulated. Client names are business references used as demo labels; every
   contact, employee, fee, invoice and registration number is fictional.

   Kept small on purpose (the reducer deep-clones state per action): 13 clients, 26 agreements,
   9 questionnaires, 3 diaries and about 60 submissions. Exported names carry an oh/OH prefix so
   they never collide with the other module slices re-exported from model/index.ts. */
import { BRAND } from "./constants";
import { DEMO_TODAY, addDays, dublinToUtc, fmtDateLong, fmtInt, hhmmToMinutes, minutesToHhmm } from "./time";
import type { Hhmm, Iso, LocalDate } from "./time";
import type { PhState, StaffId } from "./types";

/* ---------- owners and steps ---------- */
export type OhStepId = "xero" | "agreements" | "recurring_invoice" | "meddbase";
export type OhStepStatus = "not_started" | "working" | "done";

export interface OhOwnerDef {
  step: OhStepId;
  owner: string;
  /** Column heading as on the Monday board. */
  column: string;
  /** What finishing the step means. */
  doneMeans: string;
  /** Pulse user who owns the step, or null when the owner is not a Pulse user in this demo. */
  staffId: StaffId | null;
  system: "xero" | "docusign" | "meddbase";
}
export const OH_STEPS: OhOwnerDef[] = [
  { step: "xero", owner: "Aidan", column: "Added to Xero", doneMeans: "Client added as a contact in Xero with the billing details from the form.", staffId: null, system: "xero" },
  { step: "agreements", owner: "Fiona", column: "SLA and DSA", doneMeans: "Service level agreement and data sharing agreement generated, sent via DocuSign and signed.", staffId: "fiona", system: "docusign" },
  { step: "recurring_invoice", owner: "Stephen", column: "Recurring invoice", doneMeans: "Yearly Meddbase fee set up as a recurring invoice in Xero, first invoice raised.", staffId: "stephen", system: "xero" },
  { step: "meddbase", owner: "Sinead", column: "Meddbase set-up", doneMeans: "Client account, users and services set up in Meddbase, so employees can be booked and referred.", staffId: null, system: "meddbase" },
];
export const OH_STEP_BY_ID: Record<OhStepId, OhOwnerDef> = Object.fromEntries(OH_STEPS.map((s) => [s.step, s])) as Record<OhStepId, OhOwnerDef>;

/** Who manages occupational health in this demo. Clinical roles view; the participant preview sees nothing. */
export const OH_MANAGERS: StaffId[] = ["stephen", "fiona", "martina", "brenda"];
export type OhAccess = "manage" | "view" | "none";
export function ohAccess(state: PhState): OhAccess {
  const id = state.session.personaId;
  if (id === "participant") return "none";
  return OH_MANAGERS.includes(id) ? "manage" : "view";
}

/* ---------- onboarding form (their Jotform "Occupational Health Onboarding Form") ---------- */
export const OH_SERVICES = [
  "Pre-employment medicals", "Health surveillance", "Management referrals", "Night worker assessments",
  "Vision screening", "Return to work assessments", "Drug and alcohol testing", "Psychological assessment",
] as const;
export type OhInvoiceFrequency = "Annual" | "Quarterly" | "Monthly";

export interface OhOnboardingForm {
  companyName: string;
  registeredName: string;
  /** Company registration number. Always a demo value. */
  croNumber: string;
  registeredAddress: string;
  contactName: string;
  /** Contact nurse or person. */
  contactRole: string;
  contactEmail: string;
  contactPhone: string;
  meddbaseUsers: number;
  sites: string;
  services: string[];
  referralManagers: string;
  meddbaseNotes: string;
  billingContact: string;
  billingEmail: string;
  poRequired: boolean;
  poNumber: string;
  invoiceFrequency: OhInvoiceFrequency;
  vatNumber: string;
}

/** Required fields with the label shown on the form. */
export const OH_FORM_REQUIRED: Array<{ key: keyof OhOnboardingForm; label: string }> = [
  { key: "companyName", label: "Company name" },
  { key: "registeredName", label: "Registered company name" },
  { key: "croNumber", label: "Company registration number" },
  { key: "registeredAddress", label: "Registered address" },
  { key: "contactName", label: "Contact nurse or person" },
  { key: "contactEmail", label: "Contact email" },
  { key: "sites", label: "Sites" },
  { key: "billingContact", label: "Billing contact" },
  { key: "billingEmail", label: "Billing email" },
];
export const OH_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Field-level problems with a submitted form. Empty when the form can be submitted. */
export function ohFormErrors(f: OhOnboardingForm): Partial<Record<keyof OhOnboardingForm, string>> {
  const e: Partial<Record<keyof OhOnboardingForm, string>> = {};
  for (const r of OH_FORM_REQUIRED) {
    const v = f[r.key];
    if (typeof v === "string" && !v.trim()) e[r.key] = `${r.label} is required.`;
  }
  if (f.contactEmail.trim() && !OH_EMAIL_RE.test(f.contactEmail.trim())) e.contactEmail = "Enter a valid email address.";
  if (f.billingEmail.trim() && !OH_EMAIL_RE.test(f.billingEmail.trim())) e.billingEmail = "Enter a valid email address.";
  if (!Number.isFinite(f.meddbaseUsers) || f.meddbaseUsers < 1 || f.meddbaseUsers > 50) e.meddbaseUsers = "Between 1 and 50 Meddbase users.";
  if (!f.services.length) e.services = "Choose at least one service.";
  if (f.poRequired && !f.poNumber.trim()) e.poNumber = "Add the purchase order number, or untick purchase order required.";
  return e;
}

export function ohBlankForm(): OhOnboardingForm {
  return {
    companyName: "", registeredName: "", croNumber: "", registeredAddress: "", contactName: "", contactRole: "", contactEmail: "", contactPhone: "",
    meddbaseUsers: 2, sites: "", services: [], referralManagers: "", meddbaseNotes: "", billingContact: "", billingEmail: "", poRequired: false, poNumber: "",
    invoiceFrequency: "Annual", vatNumber: "",
  };
}
/** Sample answers for the preview: a fictional aviation business, as in Stephen's example lead. */
export function ohSampleForm(): OhOnboardingForm {
  return {
    companyName: "Corrib Aviation Services (fictional)", registeredName: "Corrib Aviation Services Limited (fictional)", croNumber: "700412 (demo)",
    registeredAddress: "Demo address, Shannon, Co. Clare", contactName: "Nessa Farrell", contactRole: "HR Manager", contactEmail: "nessa.farrell@example.com",
    contactPhone: "+353 61 555 0142", meddbaseUsers: 3, sites: "Shannon hangar and crew base", services: ["Pre-employment medicals", "Drug and alcohol testing", "Psychological assessment"],
    referralManagers: "Nessa Farrell, Owen Kehoe", meddbaseNotes: "Flight crew recruitment: pre-employment medicals, drug testing and psychological testing.",
    billingContact: "Owen Kehoe", billingEmail: "accounts.corrib@example.com", poRequired: true, poNumber: "PO-DEMO-3318", invoiceFrequency: "Annual", vatNumber: "IE 0000000DEMO",
  };
}

/** Yearly Meddbase account fee by number of users. Demo figures, not Precision Health's price list. */
export function ohMeddbaseFee(users: number): number {
  return users <= 3 ? 450 : users <= 6 ? 600 : users <= 10 ? 750 : 900;
}
export const ohFmtEur = (n: number) => "€" + fmtInt(n);

/* ---------- clients ---------- */
export interface OhStep {
  status: OhStepStatus;
  doneAt: Iso | null;
  /** Who ticked it in Pulse, e.g. "Brenda Madden on Aidan's behalf". */
  doneBy: string | null;
}
export interface OhInvoice { number: string; date: LocalDate; amountEur: number; simulated: boolean }
export interface OhClient {
  id: string; // OHC-01
  name: string;
  /** Demo label that picks the pre-employment questionnaire. */
  clientType: string;
  slug: string;
  submittedAt: Iso;
  /** Jotform submission reference. */
  formRef: string;
  form: OhOnboardingForm;
  steps: Record<OhStepId, OhStep>;
  meddbaseFeeEur: number;
  lastAnnualInvoice: OhInvoice | null;
  fullyCompletedAt: Iso | null;
  questionnaireIds: string[];
  inviteLink: { code: string; url: string; createdAt: Iso } | null;
}

export type OhGroup = "onboarding" | "fully_completed";
export const ohStepsDone = (c: OhClient) => OH_STEPS.filter((s) => c.steps[s.step].status === "done").length;
export const ohIsFullyCompleted = (c: OhClient) => OH_STEPS.every((s) => c.steps[s.step].status === "done");
export const ohGroupOf = (c: OhClient): OhGroup => (ohIsFullyCompleted(c) ? "fully_completed" : "onboarding");
/** Employees can only be sent questionnaires once Meddbase is set up for the client. */
export const ohMeddbaseReady = (c: OhClient) => c.steps.meddbase.status === "done";

/* ---------- agreements ---------- */
export type OhAgreementKind = "sla" | "dsa";
export type OhVersionStatus = "draft" | "sent" | "signed" | "superseded" | "voided";
export interface OhAgreementVersion {
  version: number;
  status: OhVersionStatus;
  templateVersion: string;
  generatedAt: Iso;
  generatedBy: string;
  /** The client details as merged at generation time, so history keeps what was sent. */
  merged: Record<string, string>;
  sentAt: Iso | null;
  envelopeId: string | null;
  signedAt: Iso | null;
  signedBy: string | null;
  note: string;
}
export interface OhAgreement {
  id: string; // AGR-OHC-01-SLA
  clientId: string;
  kind: OhAgreementKind;
  versions: OhAgreementVersion[];
}
export const ohCurrentVersion = (a: OhAgreement): OhAgreementVersion => a.versions[a.versions.length - 1];

/* ---------- questionnaires ---------- */
export type OhQuestionType = "yes_no" | "yes_no_unsure" | "text" | "choice" | "consent";
export interface OhSampleQuestion { q: string; type: OhQuestionType; options?: string[] }
export interface OhQuestionnaire {
  id: string;
  title: string;
  kind: "Pre-employment" | "Health surveillance" | "Fitness for work";
  audience: string;
  minutes: number;
  version: string;
  sample: Array<{ section: string; questions: OhSampleQuestion[] }>;
}
const YN: OhQuestionType = "yes_no", YNU: OhQuestionType = "yes_no_unsure";
const CONSENT = { section: "Consent", questions: [{ q: "I agree that my answers are shared with Precision Health's occupational health team for this assessment.", type: "consent" as const }] };
export const OH_QUESTIONNAIRES: OhQuestionnaire[] = [
  { id: "OHQ-PE-GEN", title: "Pre-employment medical questionnaire (general)", kind: "Pre-employment", audience: "New starters, most client types", minutes: 8, version: "4.2",
    sample: [
      { section: "About the role", questions: [{ q: "Job title you are joining as", type: "text" }, { q: "Will the role involve night work?", type: YN }, { q: "Will the role involve driving for work?", type: YN }] },
      { section: "Your health", questions: [{ q: "Is there anything about your health you think may need an adjustment at work?", type: "choice", options: ["Yes", "No", "I would prefer to discuss it with the clinician"] }, { q: "Are you currently taking any prescribed medication?", type: YN }, { q: "Anything you would like the clinician to know before your appointment", type: "text" }] },
      CONSENT,
    ] },
  { id: "OHQ-PE-HCS", title: "Pre-employment medical questionnaire: healthcare staffing", kind: "Pre-employment", audience: "Agency staff placed in health care settings", minutes: 10, version: "2.1",
    sample: [
      { section: "Placement", questions: [{ q: "Will your placements involve direct patient contact?", type: YN }, { q: "Do you have your vaccination record to hand?", type: YNU }] },
      { section: "Your health", questions: [{ q: "Is there anything about your health you think may need an adjustment at work?", type: "choice", options: ["Yes", "No", "I would prefer to discuss it with the clinician"] }] },
      CONSENT,
    ] },
  { id: "OHQ-PE-FOOD", title: "Pre-employment medical questionnaire: food group", kind: "Pre-employment", audience: "Food production and handling roles", minutes: 7, version: "1.3",
    sample: [
      { section: "Role", questions: [{ q: "Will you handle unwrapped food in this role?", type: YN }, { q: "Have you worked as a food handler before?", type: YN }] },
      { section: "Your health", questions: [{ q: "Is there anything about your health you think may need an adjustment at work?", type: "choice", options: ["Yes", "No", "I would prefer to discuss it with the clinician"] }] },
      CONSENT,
    ] },
  { id: "OHQ-PE-NURS", title: "Pre-employment medical questionnaire: nursing and health care", kind: "Pre-employment", audience: "Nursing, care and support roles", minutes: 10, version: "3.0",
    sample: [
      { section: "Role", questions: [{ q: "Will your role involve direct patient or resident care?", type: YN }, { q: "Will you work nights or rotating shifts?", type: YN }] },
      { section: "Your health", questions: [{ q: "Do you have your vaccination record to hand?", type: YNU }, { q: "Anything you would like the clinician to know before your appointment", type: "text" }] },
      CONSENT,
    ] },
  { id: "OHQ-SKIN", title: "Skin surveillance questionnaire", kind: "Health surveillance", audience: "Wet work, solvents, cement and similar exposures", minutes: 5, version: "2.0",
    sample: [
      { section: "Work", questions: [{ q: "Do you wear gloves for your usual tasks?", type: "choice", options: ["Always", "Sometimes", "Never"] }] },
      { section: "Your skin", questions: [{ q: "In the last 12 months, have you noticed dryness, redness or itching on your hands or forearms?", type: YNU }, { q: "If yes, roughly when did you first notice it?", type: "text" }] },
      CONSENT,
    ] },
  { id: "OHQ-RESP", title: "Periodic respiratory sensitisers questionnaire", kind: "Health surveillance", audience: "Dust, fumes and respiratory sensitiser exposures", minutes: 6, version: "3.1",
    sample: [
      { section: "Work", questions: [{ q: "Which substances does your employer list for your role?", type: "text" }, { q: "Do you wear respiratory protection for any tasks?", type: "choice", options: ["Always", "Sometimes", "Never"] }] },
      { section: "Your breathing", questions: [{ q: "In the last 12 months, have you had a cough, wheeze or chest tightness at work?", type: YNU }, { q: "If yes, does it ease on days away from work?", type: YNU }] },
      CONSENT,
    ] },
  { id: "OHQ-NIGHT", title: "Night worker assessment", kind: "Health surveillance", audience: "Employees who regularly work nights", minutes: 5, version: "2.2",
    sample: [
      { section: "Shift pattern", questions: [{ q: "How many nights a week do you usually work?", type: "choice", options: ["1 to 2", "3 to 4", "5 or more"] }, { q: "Do you usually get enough sleep between shifts?", type: "choice", options: ["Yes", "Mostly", "No"] }] },
      { section: "Anything else", questions: [{ q: "Is there anything about night work you would like to discuss?", type: "text" }] },
      CONSENT,
    ] },
  { id: "OHQ-VISION", title: "Vision screening questionnaire", kind: "Health surveillance", audience: "Display screen and inspection work", minutes: 4, version: "1.4",
    sample: [
      { section: "Screen use", questions: [{ q: "Do you use a screen for more than an hour at a time?", type: YN }, { q: "Do you wear glasses or contact lenses?", type: YN }] },
      { section: "Eye tests", questions: [{ q: "When did you last have an eye test?", type: "choice", options: ["In the last 2 years", "More than 2 years ago", "Never or not sure"] }] },
      CONSENT,
    ] },
  { id: "OHQ-MEDS", title: "Commencement of prescribed medications", kind: "Fitness for work", audience: "Safety-critical roles starting a new medication", minutes: 4, version: "1.1",
    sample: [
      { section: "Medication", questions: [{ q: "Have you recently started a prescribed medication?", type: YN }, { q: "Does the leaflet mention drowsiness or not operating machinery?", type: YNU }] },
      { section: "Role", questions: [{ q: "Does your role involve driving or operating machinery?", type: YN }] },
      CONSENT,
    ] },
];
export const OH_QUESTIONNAIRE_BY_ID: Record<string, OhQuestionnaire> = Object.fromEntries(OH_QUESTIONNAIRES.map((q) => [q.id, q]));

export interface OhEmployee { name: string; ref: string }
export interface OhSubmission {
  id: string; // OHS-0001
  clientId: string;
  templateId: string;
  employee: OhEmployee;
  submittedAt: Iso;
  /** Meddbase diary slot this questionnaire is for, if the appointment is booked. */
  slotId: string | null;
  meddbase: { status: "not_sent" | "sent"; at: Iso | null; by: string | null; ref: string | null };
  /** True when created by the "simulate the employee submitting it" action. */
  simulated: boolean;
}

/* ---------- Meddbase diaries ---------- */
export interface OhSlot {
  id: string; // MDB-D1-0730
  start: Hhmm;
  kind: "booked" | "free" | "break";
  employee: OhEmployee | null;
  appointmentType: string;
  /** Questionnaire expected before this appointment. */
  templateId: string | null;
  chasedAt: Iso | null;
}
export interface OhDiary {
  id: string; // MDB-D1
  clinicianName: string;
  clinicianRole: string;
  clinicianStaffId: StaffId | null;
  date: LocalDate;
  clientId: string;
  location: string;
  start: Hhmm;
  end: Hhmm;
  slotMinutes: number;
  meddbaseRef: string;
  slots: OhSlot[];
}

export interface OccHealthState {
  version: 1;
  clients: OhClient[];
  agreements: OhAgreement[];
  submissions: OhSubmission[];
  diaries: OhDiary[];
  /** Last-used sequence numbers for ids created in this slice. */
  seq: { client: number; submission: number; envelope: number; meddbaseRef: number; invoice: number; form: number };
}

/* ---------- agreement templates ---------- */
export const OH_TEMPLATE_VERSION: Record<OhAgreementKind, string> = { sla: "SLA master v3 (2026)", dsa: "DSA master v2 (2026)" };
export const OH_AGREEMENT_TITLE: Record<OhAgreementKind, string> = { sla: "Service Level Agreement", dsa: "Data Sharing Agreement" };
export const OH_AGREEMENT_SHORT: Record<OhAgreementKind, string> = { sla: "SLA", dsa: "DSA" };
/** Merge field labels, shown in the preview legend. */
export const OH_MERGE_LABELS: Record<string, string> = {
  clientName: "Client name", registeredName: "Registered name", croNumber: "Registration number", registeredAddress: "Registered address",
  contactName: "Contact", contactRole: "Contact role", contactEmail: "Contact email", services: "Services", sites: "Sites", referralManagers: "Referral managers",
  meddbaseUsers: "Meddbase users", meddbaseFee: "Yearly Meddbase fee", invoiceFrequency: "Invoice frequency", billingContact: "Billing contact",
  billingEmail: "Billing email", poLine: "Purchase order", effectiveDate: "Effective date", phLegalName: "Precision Health legal name",
  phCompanyNumber: "Precision Health company number", phAddress: "Precision Health address",
};

/** Paragraphs use {{field}} tokens. Wording is sample text; Precision Health's master templates replace it. */
const SLA_TEMPLATE: Array<{ heading: string; paragraphs: string[] }> = [
  { heading: "1. Parties", paragraphs: [
    "This Service Level Agreement is made on {{effectiveDate}} between {{phLegalName}}, trading as Precision Health, company number {{phCompanyNumber}}, of {{phAddress}} (\"Precision Health\"), and {{registeredName}}, company registration number {{croNumber}}, of {{registeredAddress}} (\"the Client\")."] },
  { heading: "2. Services", paragraphs: [
    "Precision Health will provide these occupational health services to the Client: {{services}}.",
    "Services are delivered at {{sites}}, at Precision Health clinics or by video where suitable, and are recorded in Meddbase, the occupational health system Precision Health sets up for the Client with {{meddbaseUsers}} Client users."] },
  { heading: "3. Contacts and referrals", paragraphs: [
    "The Client's nominated contact is {{contactName}} ({{contactRole}}), {{contactEmail}}. Referral managers who may raise referrals in Meddbase: {{referralManagers}}.",
    "Referrals are raised in Meddbase. Employees complete the pre-appointment questionnaire before they are seen."] },
  { heading: "4. Service levels", paragraphs: [
    "Response times for referrals, appointments and reports are set out in Schedule 1 of Precision Health's master agreement and are not changed by this document."] },
  { heading: "5. Fees and invoicing", paragraphs: [
    "The yearly Meddbase account fee is {{meddbaseFee}}, invoiced {{invoiceFrequency}} by Precision Health through Xero. Service fees are as agreed in the proposal.",
    "Billing contact: {{billingContact}}, {{billingEmail}}. {{poLine}}"] },
  { heading: "6. Term", paragraphs: [
    "This agreement starts on {{effectiveDate}} and continues for twelve months, then renews each year unless either party gives notice in writing."] },
];
const DSA_TEMPLATE: Array<{ heading: string; paragraphs: string[] }> = [
  { heading: "1. Parties", paragraphs: [
    "This Data Sharing Agreement is made on {{effectiveDate}} between {{phLegalName}}, trading as Precision Health, company number {{phCompanyNumber}}, of {{phAddress}}, and {{registeredName}}, company registration number {{croNumber}}, of {{registeredAddress}} (\"the Client\")."] },
  { heading: "2. Purpose", paragraphs: [
    "The Client shares employee information with Precision Health so Precision Health can provide these occupational health services: {{services}}."] },
  { heading: "3. Information shared", paragraphs: [
    "From the Client: employee name, date of birth, contact details, job role, work location and the reason for a referral.",
    "To the Client: fitness for work outcomes and recommended adjustments. Clinical detail is not shared with the Client unless the employee agrees."] },
  { heading: "4. Systems and access", paragraphs: [
    "Occupational health records are held in Meddbase. Client access is limited to {{meddbaseUsers}} named Meddbase users, set up by Precision Health. Pre-appointment questionnaires are collected through Precision Health's forms and added to the employee's Meddbase record."] },
  { heading: "5. Roles, retention and security", paragraphs: [
    "Each party's role under data protection law, retention periods, security measures and breach notification are set out in Precision Health's master data sharing agreement and are not changed by this document."] },
  { heading: "6. Contacts", paragraphs: [
    "Data protection contact for the Client: {{contactName}}, {{contactEmail}}. For Precision Health: {{phEmail}}."] },
];
export const OH_AGREEMENT_TEMPLATES: Record<OhAgreementKind, Array<{ heading: string; paragraphs: string[] }>> = { sla: SLA_TEMPLATE, dsa: DSA_TEMPLATE };

/** The merge values for a client on a given date. */
export function ohMergeFields(c: OhClient, onDate: LocalDate): Record<string, string> {
  const f = c.form;
  return {
    clientName: f.companyName, registeredName: f.registeredName, croNumber: f.croNumber, registeredAddress: f.registeredAddress,
    contactName: f.contactName, contactRole: f.contactRole || "Contact", contactEmail: f.contactEmail, services: f.services.join(", "), sites: f.sites,
    referralManagers: f.referralManagers || f.contactName, meddbaseUsers: String(f.meddbaseUsers), meddbaseFee: ohFmtEur(c.meddbaseFeeEur),
    invoiceFrequency: f.invoiceFrequency.toLowerCase(), billingContact: f.billingContact, billingEmail: f.billingEmail,
    poLine: f.poRequired ? `Invoices quote purchase order ${f.poNumber}.` : "No purchase order is required.",
    effectiveDate: fmtDateLong(onDate), phLegalName: BRAND.legalName, phCompanyNumber: BRAND.companyNumber, phAddress: BRAND.address, phEmail: BRAND.email,
  };
}

export type OhDocPart = { t: string } | { f: string; v: string };
export interface OhAgreementDoc {
  title: string;
  kind: OhAgreementKind;
  clientName: string;
  version: number;
  templateVersion: string;
  status: OhVersionStatus;
  sections: Array<{ heading: string; paragraphs: OhDocPart[][] }>;
  signatures: Array<{ party: string; name: string; role: string; signedAt: Iso | null }>;
}
/** Split a template paragraph into plain text and merged values, so the preview can mark what was merged. */
export function ohMergeParagraph(text: string, merged: Record<string, string>): OhDocPart[] {
  const out: OhDocPart[] = [];
  const re = /\{\{(\w+)\}\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ t: text.slice(last, m.index) });
    out.push({ f: m[1], v: merged[m[1]] ?? `[${m[1]} missing]` });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ t: text.slice(last) });
  return out;
}
/** A version of an agreement as a document. Defaults to the current version. */
export function ohRenderAgreement(a: OhAgreement, versionNo?: number): OhAgreementDoc {
  const v = a.versions.find((x) => x.version === versionNo) || ohCurrentVersion(a);
  return {
    title: OH_AGREEMENT_TITLE[a.kind], kind: a.kind, clientName: v.merged.clientName, version: v.version, templateVersion: v.templateVersion, status: v.status,
    sections: OH_AGREEMENT_TEMPLATES[a.kind].map((s) => ({ heading: s.heading, paragraphs: s.paragraphs.map((p) => ohMergeParagraph(p, v.merged)) })),
    signatures: [
      { party: "For Precision Health", name: "Stephen Kelly", role: "Sales and Operations Director", signedAt: v.status === "signed" ? v.signedAt : null },
      { party: `For ${v.merged.clientName}`, name: v.merged.contactName, role: v.merged.contactRole, signedAt: v.status === "signed" ? v.signedAt : null },
    ],
  };
}
/** Plain text of a document, for checks and search. */
export const ohDocText = (d: OhAgreementDoc) => d.sections.map((s) => [s.heading, ...s.paragraphs.map((p) => p.map((x) => ("t" in x ? x.t : x.v)).join(""))].join("\n")).join("\n");

/* ---------- selectors ---------- */
export const ohClientById = (s: PhState, id: string) => s.occHealth.clients.find((c) => c.id === id);
export const ohAgreementFor = (s: PhState, clientId: string, kind: OhAgreementKind) => s.occHealth.agreements.find((a) => a.clientId === clientId && a.kind === kind);

export type OhAgreementsStage = "not_started" | "generated" | "sent" | "part_signed" | "signed";
export const OH_AGREEMENTS_STAGE_LABEL: Record<OhAgreementsStage, string> = {
  not_started: "Not started", generated: "Generated, not sent", sent: "Sent via DocuSign", part_signed: "1 of 2 signed", signed: "Both signed",
};
/** Fiona's column: derived from the SLA and DSA. */
export function ohAgreementsStage(s: PhState, clientId: string): OhAgreementsStage {
  const vs = (["sla", "dsa"] as const).map((k) => { const a = ohAgreementFor(s, clientId, k); return a ? ohCurrentVersion(a).status : null; });
  const signed = vs.filter((x) => x === "signed").length;
  if (signed === 2) return "signed";
  if (signed === 1) return "part_signed";
  if (vs.some((x) => x === "sent")) return "sent";
  if (vs.some((x) => x === "draft")) return "generated";
  return "not_started";
}

/** The questionnaire for a diary slot, if the employee has returned it. */
export const ohSubmissionForSlot = (s: PhState, slotId: string) => s.occHealth.submissions.find((x) => x.slotId === slotId);

export interface OhSlotView { slot: OhSlot; submission: OhSubmission | null; received: boolean; inMeddbase: boolean; past: boolean }
export function ohDiarySlots(s: PhState, d: OhDiary): OhSlotView[] {
  const now = Date.parse(s.clock.nowUtc);
  return d.slots.map((slot) => {
    const sub = slot.kind === "booked" ? ohSubmissionForSlot(s, slot.id) || null : null;
    return { slot, submission: sub, received: !!sub, inMeddbase: sub?.meddbase.status === "sent", past: Date.parse(dublinToUtc(d.date, slot.start)) + d.slotMinutes * 60000 <= now };
  });
}
export function ohDiaryStats(s: PhState, d: OhDiary) {
  const v = ohDiarySlots(s, d).filter((x) => x.slot.kind === "booked");
  const received = v.filter((x) => x.received).length;
  return {
    slots: d.slots.filter((x) => x.kind !== "break").length,
    booked: v.length,
    free: d.slots.filter((x) => x.kind === "free").length,
    received,
    missing: v.length - received,
    inMeddbase: v.filter((x) => x.inMeddbase).length,
    chased: v.filter((x) => !x.received && x.slot.chasedAt).length,
  };
}

export function ohTemplateCounts(s: PhState): Record<string, { total: number; notSent: number; clients: number }> {
  const out: Record<string, { total: number; notSent: number; clients: number }> = {};
  for (const q of OH_QUESTIONNAIRES) out[q.id] = { total: 0, notSent: 0, clients: s.occHealth.clients.filter((c) => c.questionnaireIds.includes(q.id)).length };
  for (const sub of s.occHealth.submissions) {
    const o = out[sub.templateId];
    if (!o) continue;
    o.total++;
    if (sub.meddbase.status !== "sent") o.notSent++;
  }
  return out;
}

export function ohSummary(s: PhState) {
  const cs = s.occHealth.clients;
  const openByStep = Object.fromEntries(OH_STEPS.map((st) => [st.step, cs.filter((c) => c.steps[st.step].status !== "done").length])) as Record<OhStepId, number>;
  const awaitingSignature = s.occHealth.agreements.filter((a) => ohCurrentVersion(a).status === "sent").length;
  const drafts = s.occHealth.agreements.filter((a) => ohCurrentVersion(a).status === "draft").length;
  const signed = s.occHealth.agreements.filter((a) => ohCurrentVersion(a).status === "signed").length;
  const done = cs.filter(ohIsFullyCompleted);
  return {
    clients: cs.length,
    onboarding: cs.length - done.length,
    fullyCompleted: done.length,
    openSteps: Object.values(openByStep).reduce((n, x) => n + x, 0),
    openByStep,
    yearlyFees: done.reduce((n, c) => n + c.meddbaseFeeEur, 0),
    drafts, awaitingSignature, signed,
    submissions: s.occHealth.submissions.length,
    notInMeddbase: s.occHealth.submissions.filter((x) => x.meddbase.status !== "sent").length,
    withInviteLink: cs.filter((c) => !!c.inviteLink).length,
  };
}

/* ---------- fixtures ---------- */
const GIVEN = ["Aoife", "Cian", "Niamh", "Darragh", "Saoirse", "Oisín", "Clodagh", "Fiachra", "Róisín", "Tadhg", "Éabha", "Colm", "Méabh", "Rory", "Laoise", "Senan",
  "Gráinne", "Donal", "Ailbhe", "Cathal", "Muireann", "Eoin", "Sadhbh", "Ruairí"];
const FAMILY = ["Brennan", "Kavanagh", "Moloney", "Hennessy", "Lynch", "Duggan", "Mac Cárthaigh", "Phelan", "Corrigan", "Foley", "Gilmartin", "Hegarty", "Kiely", "Lacey",
  "McGuinness", "Nagle", "O'Dowd", "Prendergast", "Rafferty", "Scanlon", "Tobin", "Waldron", "Considine", "Brosnan", "Furlong"];
/** Fictional employee n. (7n mod 24, 11n mod 25) is unique for n below 600. */
const employeeName = (n: number) => `${GIVEN[(n * 7) % GIVEN.length]} ${FAMILY[(n * 11) % FAMILY.length]}`;

interface ClientSeed {
  name: string; registered: string; type: string; slug: string; contact: [string, string]; users: number; sites: string; services: string[]; qs: string[];
  submitted: LocalDate; freq: OhInvoiceFrequency; po: boolean;
  /** Steps done, in OH_STEPS order, plus "w" for working on it. */
  steps: [OhStepStatus, OhStepStatus, OhStepStatus, OhStepStatus];
  /** Agreement status per kind for clients not yet signed; signed clients may carry an earlier superseded version. */
  agr: { sla: OhVersionStatus | null; dsa: OhVersionStatus | null; reissued?: boolean };
}
const D = "done" as const, W = "working" as const, N = "not_started" as const;
const SEEDS: ClientSeed[] = [
  { name: "Pfizer", registered: "Pfizer Ireland Pharmaceuticals (demo label)", type: "Pharmaceutical manufacturing", slug: "pfizer", contact: ["Gráinne Lyons", "Occupational Health Nurse"], users: 8,
    sites: "Two manufacturing sites", services: ["Pre-employment medicals", "Health surveillance", "Management referrals", "Night worker assessments", "Vision screening"], qs: ["OHQ-PE-GEN", "OHQ-RESP", "OHQ-SKIN", "OHQ-NIGHT", "OHQ-VISION"],
    submitted: "2025-03-11", freq: "Annual", po: true, steps: [D, D, D, D], agr: { sla: "signed", dsa: "signed", reissued: true } },
  { name: "St John of God Community Services", registered: "St John of God Community Services (demo label)", type: "Nursing and health care", slug: "sjog", contact: ["Declan Moran", "HR Manager"], users: 6,
    sites: "Community services across several locations", services: ["Pre-employment medicals", "Management referrals", "Night worker assessments", "Return to work assessments"], qs: ["OHQ-PE-NURS", "OHQ-NIGHT", "OHQ-MEDS"],
    submitted: "2025-05-20", freq: "Annual", po: true, steps: [D, D, D, D], agr: { sla: "signed", dsa: "signed" } },
  { name: "Dublin Central Mission", registered: "Dublin Central Mission (demo label)", type: "Community services", slug: "dcm", contact: ["Sorcha Daly", "Operations Manager"], users: 2,
    sites: "Dublin city centre", services: ["Pre-employment medicals", "Management referrals"], qs: ["OHQ-PE-GEN", "OHQ-NIGHT"],
    submitted: "2025-07-02", freq: "Annual", po: false, steps: [D, D, D, D], agr: { sla: "signed", dsa: "signed" } },
  { name: "Barnmore Demolition", registered: "Barnmore Demolition (demo label)", type: "Construction and demolition", slug: "barnmore", contact: ["Pádraig Gallagher", "Health and Safety Manager"], users: 3,
    sites: "Project sites, screening van on site", services: ["Pre-employment medicals", "Health surveillance", "Drug and alcohol testing"], qs: ["OHQ-PE-GEN", "OHQ-RESP", "OHQ-SKIN", "OHQ-MEDS"],
    submitted: "2025-09-15", freq: "Annual", po: false, steps: [D, D, D, D], agr: { sla: "signed", dsa: "signed" } },
  { name: "Edwards Vacuum", registered: "Edwards Vacuum (demo label)", type: "Manufacturing", slug: "edwards", contact: ["Lorna Fitzgerald", "Site Nurse"], users: 4,
    sites: "Manufacturing site", services: ["Pre-employment medicals", "Health surveillance", "Night worker assessments", "Vision screening"], qs: ["OHQ-PE-GEN", "OHQ-RESP", "OHQ-NIGHT", "OHQ-VISION"],
    submitted: "2025-11-04", freq: "Annual", po: true, steps: [D, D, D, D], agr: { sla: "signed", dsa: "signed", reissued: true } },
  { name: "Helsinn Birex", registered: "Helsinn Birex Pharmaceuticals (demo label)", type: "Pharmaceutical manufacturing", slug: "helsinn", contact: ["Colm Nolan", "EHS Lead"], users: 5,
    sites: "Manufacturing site", services: ["Pre-employment medicals", "Health surveillance", "Night worker assessments", "Vision screening"], qs: ["OHQ-PE-GEN", "OHQ-RESP", "OHQ-NIGHT", "OHQ-VISION"],
    submitted: "2026-01-19", freq: "Annual", po: true, steps: [D, D, D, D], agr: { sla: "signed", dsa: "signed" } },
  { name: "Housing Association for Integrated Living", registered: "Housing Association for Integrated Living (demo label)", type: "Housing and support services", slug: "hail", contact: ["Eimear Doherty", "People and Culture Lead"], users: 2,
    sites: "Head office and supported housing services", services: ["Pre-employment medicals", "Management referrals", "Night worker assessments"], qs: ["OHQ-PE-GEN", "OHQ-NIGHT"],
    submitted: "2026-03-02", freq: "Annual", po: false, steps: [D, D, D, D], agr: { sla: "signed", dsa: "signed" } },
  { name: "Clearbrook Healthcare", registered: "Clearbrook Healthcare (demo label)", type: "Healthcare staffing", slug: "clearbrook", contact: ["Fionnuala Reid", "Compliance Manager"], users: 4,
    sites: "Candidate medicals at Precision Health clinics", services: ["Pre-employment medicals", "Night worker assessments", "Management referrals"], qs: ["OHQ-PE-HCS", "OHQ-NIGHT", "OHQ-MEDS"],
    submitted: "2026-05-12", freq: "Quarterly", po: false, steps: [D, D, D, D], agr: { sla: "signed", dsa: "signed" } },
  { name: "Cubis Systems", registered: "Cubis Systems (demo label)", type: "Manufacturing", slug: "cubis", contact: ["Mark Hutchinson", "HR Business Partner"], users: 3,
    sites: "Manufacturing site", services: ["Pre-employment medicals", "Health surveillance"], qs: ["OHQ-PE-GEN", "OHQ-RESP", "OHQ-SKIN"],
    submitted: "2026-08-24", freq: "Annual", po: true, steps: [D, W, D, W], agr: { sla: "signed", dsa: "sent" } },
  { name: "Barry M Whelan Recruitment", registered: "Barry M Whelan Recruitment (demo label)", type: "Recruitment", slug: "bmw-recruitment", contact: ["Kevin Tierney", "Recruitment Manager"], users: 2,
    sites: "Candidate medicals at Precision Health clinics", services: ["Pre-employment medicals", "Drug and alcohol testing"], qs: ["OHQ-PE-GEN"],
    submitted: "2026-09-08", freq: "Annual", po: false, steps: [D, D, W, N], agr: { sla: "signed", dsa: "signed" } },
  { name: "Canada Goose UK Retail", registered: "Canada Goose UK Retail (demo label)", type: "Retail", slug: "canada-goose", contact: ["Ellen Marsh", "Regional People Partner"], users: 2,
    sites: "Dublin store", services: ["Pre-employment medicals", "Vision screening"], qs: ["OHQ-PE-GEN", "OHQ-VISION"],
    submitted: "2026-09-22", freq: "Annual", po: true, steps: [D, W, N, N], agr: { sla: "draft", dsa: "draft" } },
  { name: "Sea Clean", registered: "Sea Clean (demo label)", type: "Not stated", slug: "sea-clean", contact: ["Tara Kinsella", "Office Manager"], users: 2,
    sites: "Head office", services: ["Pre-employment medicals", "Health surveillance"], qs: ["OHQ-PE-GEN", "OHQ-SKIN"],
    submitted: "2026-09-29", freq: "Annual", po: false, steps: [D, W, N, N], agr: { sla: "sent", dsa: "sent" } },
  { name: "4Ritz Ventures", registered: "4Ritz Ventures (demo label)", type: "Not stated", slug: "4ritz", contact: ["Shane Quigley", "Director"], users: 1,
    sites: "To confirm", services: ["Pre-employment medicals"], qs: ["OHQ-PE-GEN"],
    submitted: "2026-10-02", freq: "Annual", po: false, steps: [N, N, N, N], agr: { sla: null, dsa: null } },
];

const at = (d: LocalDate, t: Hhmm) => dublinToUtc(d, t);
/** The most recent yearly anniversary of a first invoice date, on or before the demo date. */
function latestAnniversary(first: LocalDate): LocalDate {
  let d = first;
  for (let next = `${Number(d.slice(0, 4)) + 1}${d.slice(4)}`; next <= DEMO_TODAY; next = `${Number(d.slice(0, 4)) + 1}${d.slice(4)}`) d = next;
  return d;
}
const emailOf = (name: string) => name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]/g, "").trim().replace(/\s+/g, ".") + "@example.com";

function buildDiary(id: string, ref: string, who: { name: string; role: string; staffId: StaffId | null }, date: LocalDate, clientId: string, location: string,
  start: Hhmm, end: Hhmm, breakAt: Hhmm | null, types: Array<{ label: string; templateId: string }>, free: number[], empBase: number, empPrefix: string): OhDiary {
  const slots: OhSlot[] = [];
  let booked = 0;
  for (let m = hhmmToMinutes(start), i = 0; m < hhmmToMinutes(end); m += 15, i++) {
    const t = minutesToHhmm(m);
    const sid = `${id}-${t.replace(":", "")}`;
    if (breakAt && (t === breakAt || t === minutesToHhmm(hhmmToMinutes(breakAt) + 15))) { slots.push({ id: sid, start: t, kind: "break", employee: null, appointmentType: "Break", templateId: null, chasedAt: null }); continue; }
    if (free.includes(i)) { slots.push({ id: sid, start: t, kind: "free", employee: null, appointmentType: "Free slot", templateId: null, chasedAt: null }); continue; }
    const ty = types[booked % types.length];
    const n = empBase + booked;
    slots.push({ id: sid, start: t, kind: "booked", employee: { name: employeeName(n), ref: `${empPrefix}-${String(1040 + n * 3).padStart(4, "0")}` }, appointmentType: ty.label, templateId: ty.templateId, chasedAt: null });
    booked++;
  }
  return { id, clinicianName: who.name, clinicianRole: who.role, clinicianStaffId: who.staffId, date, clientId, location, start, end, slotMinutes: 15, meddbaseRef: ref, slots };
}

export function initialOccHealthState(): OccHealthState {
  const clients: OhClient[] = [];
  const agreements: OhAgreement[] = [];
  let invoiceNo = 0;
  SEEDS.forEach((sd, i) => {
    const id = `OHC-${String(i + 1).padStart(2, "0")}`;
    const fee = ohMeddbaseFee(sd.users);
    const form: OhOnboardingForm = {
      companyName: sd.name, registeredName: sd.registered, croNumber: `${String(410233 + i * 7919).slice(0, 6)} (demo)`, registeredAddress: "Registered office on file (demo)",
      contactName: sd.contact[0], contactRole: sd.contact[1], contactEmail: emailOf(sd.contact[0]), contactPhone: `+353 1 555 01${String(10 + i)}`,
      meddbaseUsers: sd.users, sites: sd.sites, services: sd.services.slice(), referralManagers: sd.contact[0], meddbaseNotes: "",
      billingContact: "Accounts payable", billingEmail: `accounts.${sd.slug.replace(/[^a-z0-9]/g, "")}@example.com`, poRequired: sd.po, poNumber: sd.po ? `PO-DEMO-${2100 + i * 13}` : "",
      invoiceFrequency: sd.freq, vatNumber: "",
    };
    const sub = sd.submitted;
    const stepAt = (k: number) => at(addDays(sub, 3 + k * 4), "11:00");
    const steps = {} as Record<OhStepId, OhStep>;
    OH_STEPS.forEach((st, k) => {
      const status = sd.steps[k];
      steps[st.step] = { status, doneAt: status === "done" ? stepAt(k) : null, doneBy: status === "done" ? (st.staffId ? (st.step === "agreements" ? "Fiona Fenton" : "Stephen Kelly") : `${st.owner} (recorded on the Monday board)`) : null };
    });
    const full = sd.steps.every((x) => x === "done");
    const c: OhClient = {
      id, name: sd.name, clientType: sd.type, slug: sd.slug, submittedAt: at(sub, "10:20"), formRef: `JF-OH-${5101 + i * 17}`, form, steps, meddbaseFeeEur: fee,
      lastAnnualInvoice: steps.recurring_invoice.status === "done" ? { number: `INV-${String(3120 + ++invoiceNo * 37)}`, date: latestAnniversary(addDays(sub, 11)), amountEur: fee, simulated: false } : null,
      fullyCompletedAt: full ? stepAt(3) : null, questionnaireIds: sd.qs.slice(),
      inviteLink: full ? { code: `OH-${sd.slug.replace(/[^a-z0-9]/g, "").slice(0, 6).toUpperCase()}`, url: `forms.precisionhealth.example.invalid/oh/${sd.slug}`, createdAt: stepAt(3) } : null,
    };
    clients.push(c);
    (["sla", "dsa"] as const).forEach((kind, k) => {
      const st = sd.agr[kind];
      if (!st) return;
      const gen = at(addDays(sub, 4), k ? "14:10" : "14:05");
      const merged = ohMergeFields(c, addDays(sub, 4));
      const versions: OhAgreementVersion[] = [];
      if (sd.agr.reissued) {
        const oldMerged = { ...merged, registeredName: sd.name, contactName: "Accounts payable" };
        versions.push({ version: 1, status: "superseded", templateVersion: OH_TEMPLATE_VERSION[kind], generatedAt: at(addDays(sub, 3), "16:00"), generatedBy: "Fiona Fenton",
          merged: oldMerged, sentAt: null, envelopeId: null, signedAt: null, signedBy: null, note: "Replaced before sending: registered name and signatory corrected from the onboarding form." });
      }
      const sent = st === "sent" || st === "signed";
      const signed = st === "signed";
      versions.push({
        version: versions.length + 1, status: st, templateVersion: OH_TEMPLATE_VERSION[kind], generatedAt: gen, generatedBy: "Fiona Fenton", merged,
        sentAt: sent ? at(addDays(sub, 5), k ? "09:32" : "09:30") : null, envelopeId: sent ? `DS-${String(88120 + i * 2 + k)}` : null,
        signedAt: signed ? at(addDays(sub, 6), k ? "12:15" : "12:05") : null, signedBy: signed ? sd.contact[0] : null,
        note: sd.agr.reissued ? "Regenerated from the master template with the corrected details." : "",
      });
      agreements.push({ id: `AGR-${id}-${kind.toUpperCase()}`, clientId: id, kind, versions });
    });
  });
  /* Sea Clean and Canada Goose agreements are recent: anchor them near the demo date. */
  for (const a of agreements) {
    const v = ohCurrentVersion(a);
    if (v.status === "sent" && a.clientId === "OHC-12") { v.generatedAt = at("2026-10-01", a.kind === "sla" ? "15:40" : "15:42"); v.sentAt = at("2026-10-01", a.kind === "sla" ? "15:55" : "15:56"); v.merged.effectiveDate = fmtDateLong("2026-10-01"); }
    if (v.status === "draft") { v.generatedAt = at("2026-10-02", a.kind === "sla" ? "16:20" : "16:22"); v.merged.effectiveDate = fmtDateLong("2026-10-02"); }
  }

  /* Meddbase diaries: Ian Murtagh's day at a client site in the screening van, 07:30 to 16:30, 15-minute health surveillance slots. */
  const diaries: OhDiary[] = [
    buildDiary("MDB-D1", "MB-DIARY-24017", { name: "Ian Murtagh", role: "Wellness Advisor", staffId: "ian" }, DEMO_TODAY, "OHC-04", "Screening van at the client's project site",
      "07:30", "16:30", "12:00", [{ label: "Health surveillance: respiratory", templateId: "OHQ-RESP" }, { label: "Health surveillance: skin", templateId: "OHQ-SKIN" }], [6, 17, 27, 33], 0, "BMD"),
    buildDiary("MDB-D2", "MB-DIARY-24018", { name: "Anita Mulhere", role: "Occupational Health and Wellness Nurse", staffId: "anita" }, addDays(DEMO_TODAY, 1), "OHC-05", "Medical room at the client site",
      "09:00", "13:00", null, [{ label: "Health surveillance: respiratory", templateId: "OHQ-RESP" }, { label: "Night worker assessment", templateId: "OHQ-NIGHT" }, { label: "Vision screening", templateId: "OHQ-VISION" }], [5, 11, 14], 40, "EDV"),
    buildDiary("MDB-D3", "MB-DIARY-24021", { name: "Fiona Fenton", role: "Occupational Health and Wellness Nurse", staffId: "fiona" }, addDays(DEMO_TODAY, 2), "OHC-06", "Screening van at the client site",
      "08:00", "12:00", null, [{ label: "Health surveillance: respiratory", templateId: "OHQ-RESP" }, { label: "Night worker assessment", templateId: "OHQ-NIGHT" }], [3, 9], 60, "HBX"),
  ];

  /* Questionnaires returned for booked slots: most of the morning is in, gaps later in the day. */
  const submissions: OhSubmission[] = [];
  let sNo = 0;
  const pushSub = (clientId: string, templateId: string, employee: OhEmployee, submittedAt: Iso, slotId: string | null) => {
    sNo++;
    submissions.push({ id: `OHS-${String(sNo).padStart(4, "0")}`, clientId, templateId, employee, submittedAt, slotId, meddbase: { status: "not_sent", at: null, by: null, ref: null }, simulated: false });
  };
  diaries.forEach((d, di) => {
    let k = 0;
    for (const sl of d.slots) {
      if (sl.kind !== "booked" || !sl.employee || !sl.templateId) continue;
      const missing = di === 0 ? [7, 12, 18, 21, 24, 26, 29].includes(k) : di === 1 ? [3, 8, 10].includes(k) : [2, 6, 9].includes(k);
      if (!missing) pushSub(d.clientId, sl.templateId, sl.employee, at(addDays(d.date, -1 - (k % 6)), minutesToHhmm(18 * 60 + ((k * 23) % 180))), sl.id);
      k++;
    }
  });
  /* Pre-employment questionnaires for candidates not yet booked in a diary. */
  const preEmp: Array<[string, string, string, number]> = [
    ["OHC-08", "OHQ-PE-HCS", "CLB", 5], ["OHC-01", "OHQ-PE-GEN", "PFZ", 3], ["OHC-02", "OHQ-PE-NURS", "SJG", 3], ["OHC-03", "OHQ-PE-GEN", "DCM", 2], ["OHC-07", "OHQ-PE-GEN", "HAI", 2], ["OHC-01", "OHQ-NIGHT", "PFZ", 1],
  ];
  let e = 80;
  preEmp.forEach(([clientId, templateId, prefix, n]) => {
    for (let j = 0; j < n; j++, e++) pushSub(clientId, templateId, { name: employeeName(e), ref: `${prefix}-${String(2010 + e * 7).padStart(4, "0")}` }, at(addDays(DEMO_TODAY, -1 - ((e * 3) % 9)), minutesToHhmm(9 * 60 + ((e * 37) % 540))), null);
  });
  submissions.sort((a, b) => (a.submittedAt < b.submittedAt ? -1 : a.submittedAt > b.submittedAt ? 1 : a.id < b.id ? -1 : 1));
  submissions.forEach((x, i) => { x.id = `OHS-${String(i + 1).padStart(4, "0")}`; });

  return {
    version: 1, clients, agreements, submissions, diaries,
    seq: { client: clients.length, submission: submissions.length, envelope: 0, meddbaseRef: 0, invoice: invoiceNo, form: 0 },
  };
}
