/* Client onboarding and retention (Sales, Onboarding and Sales, Retention).

   Onboarding: two forms, Occupational Health and Wellness. Each onboarding walks the same simple
   path: Details, Agreements (DSA and SLA generated with the client's details merged in), Team (routed
   to the OH operations team or the Wellness team, with a task in Work, Tasks), MediBase set-up (OH
   only, a manual checklist), Xero (contact and billing codes, simulated) and Done (welcome email).

   Retention: branded Precision Health email templates with merge fields, the emails sent from Pulse
   (results out, rebooking reminders, welcome), which client contacts have left their company, and
   the release counts already told to each client. Selectors that read other slices live in
   src/ph/pages/Sales/onbSelect.ts; handlers in src/ph/pages/Sales/onbActions.ts.

   Everything here is fictional demo content. Nothing is emailed, signed or pushed to Xero or
   MediBase. Exported names carry an onb/ONB or ret/RET prefix so they never collide with the other
   model slices re-exported from model/index.ts. */
import type { Iso, LocalDate } from "./time";
import type { ProgrammeId, StaffId } from "./types";
import { OH_SERVICES } from "./occHealth";
import { BRAND } from "./constants";
import { fmtDateLong } from "./time";

/* ---------------------------------------------------------------- onboarding */

export type OnbKind = "oh" | "wellness";
export const ONB_KIND_LABEL: Record<OnbKind, string> = { oh: "Occupational Health", wellness: "Wellness" };

export type OnbStepId = "details" | "agreements" | "team" | "medibase" | "xero" | "done";
export const ONB_STEP_LABEL: Record<OnbStepId, string> = {
  details: "Details", agreements: "Agreements", team: "Team", medibase: "MediBase", xero: "Xero", done: "Done",
};
export const onbStepsFor = (k: OnbKind): OnbStepId[] => (k === "oh" ? ["details", "agreements", "team", "medibase", "xero", "done"] : ["details", "agreements", "team", "xero", "done"]);

export const ONB_WELLNESS_SERVICES = [
  "Health screening days", "Flu vaccination clinics", "Wellness talks", "Executive health assessments", "Heart health checks", "Mental health and resilience workshops",
] as const;
export const onbServicesFor = (k: OnbKind): readonly string[] => (k === "oh" ? OH_SERVICES : ONB_WELLNESS_SERVICES);

export interface OnbPerson { name: string; email: string; phone: string }
export type OnbInvoiceTo = "portal" | "ap_email";

export interface OnbDetails {
  companyName: string;
  /** Companies Registration Office number. Demo values only. */
  croNumber: string;
  registeredAddress: string;
  sites: string;
  headcount: string;
  main: OnbPerson;
  hr: OnbPerson;
  finance: OnbPerson;
  /** OH only: the manager who raises referrals in MediBase. */
  referralManager: OnbPerson;
  invoiceTo: OnbInvoiceTo;
  apEmail: string;
  services: string[];
  poNumber: string;
  notes: string;
}

export type OnbDocKind = "dsa" | "sla";
export const ONB_DOC_TITLE: Record<OnbDocKind, string> = { dsa: "Data Sharing Agreement", sla: "Service Level Agreement" };
export type OnbDocStatus = "draft" | "sent" | "signed";
export const ONB_DOC_STATUS_LABEL: Record<OnbDocStatus, string> = { draft: "Draft", sent: "Sent for signature", signed: "Signed" };
export interface OnbDoc {
  status: OnbDocStatus;
  version: number;
  generatedAt: Iso;
  sentAt: Iso | null;
  signedAt: Iso | null;
  /** Client details as merged when generated, so the document keeps what was sent. */
  merged: Record<string, string>;
}

export type OnbBilling = "retainer_525" | "retainer_1050" | "per_programme";
export const ONB_BILLING_LABEL: Record<OnbBilling, string> = {
  retainer_525: "Yearly recurring fee, €525 a year",
  retainer_1050: "Yearly recurring fee, €1,050 a year",
  per_programme: "Invoice per programme",
};
export const ONB_RETAINER_EUR: Record<OnbBilling, number> = { retainer_525: 525, retainer_1050: 1050, per_programme: 0 };
export interface OnbBillingCode { code: string; label: string; basis: string }
export function onbBillingCodes(kind: OnbKind, billing: OnbBilling): OnbBillingCode[] {
  if (kind === "oh") {
    const r = billing === "retainer_1050" ? 1050 : 525;
    return [
      { code: `OH-RET-${r}`, label: "Occupational health retainer", basis: `€${r === 1050 ? "1,050" : "525"} a year, repeating invoice` },
      { code: "OH-MB", label: "MediBase account", basis: "Included in the retainer" },
      { code: "OH-XTRA", label: "Extra appointments", basis: "Billed as used, at the agreed rates" },
    ];
  }
  return [
    { code: "WEL-PROG", label: "Screening programme", basis: "One invoice per programme, after results are out" },
    { code: "WEL-FLU", label: "Flu vaccination", basis: "Per vaccine given" },
    { code: "WEL-TALK", label: "Wellness talks and workshops", basis: "Per session" },
  ];
}

export const ONB_TEAM: Record<OnbKind, { name: string; ownerId: StaffId; ownerName: string; blurb: string }> = {
  oh: { name: "Occupational Health operations team", ownerId: "fiona", ownerName: "Fiona Fenton", blurb: "Sets up MediBase, questionnaires and referrals, and looks after the client day to day." },
  wellness: { name: "Wellness team", ownerId: "martina", ownerName: "Martina Beattie", blurb: "Plans screening days, flu clinics and talks, and owns the client's programme." },
};

export function onbMedibaseSteps(d: OnbDetails): string[] {
  return [
    "Create the client account in MediBase",
    `Add sites and departments${d.sites.trim() ? `: ${d.sites.trim()}` : ""}`,
    `Add ${d.referralManager.name.trim() || "the referral manager"} as a MediBase referral manager`,
    "Switch on the agreed services",
    "Attach the pre-employment and surveillance questionnaires",
    `Email MediBase log-in details to ${d.main.name.trim() || "the main contact"}`,
  ];
}

export interface Onboarding {
  id: string; // ONB-001
  kind: OnbKind;
  leadId: string | null;
  createdAt: Iso;
  createdBy: string;
  details: OnbDetails;
  detailsSavedAt: Iso | null;
  docs: Partial<Record<OnbDocKind, OnbDoc>>;
  route: { taskId: string; at: Iso; ownerId: StaffId } | null;
  medibase: { assigneeId: StaffId; ticks: boolean[]; doneAt: Iso | null };
  xero: { billing: OnbBilling; contactRef: string | null; createdAt: Iso | null };
  welcomeEmailId: string | null;
  completedAt: Iso | null;
}

export function onbStepDone(o: Onboarding): Record<OnbStepId, boolean> {
  const signed = (k: OnbDocKind) => o.docs[k]?.status === "signed";
  const details = !!o.detailsSavedAt;
  const agreements = signed("dsa") && signed("sla");
  const team = !!o.route;
  const medibase = o.kind !== "oh" || (o.medibase.ticks.length > 0 && o.medibase.ticks.every(Boolean));
  const xero = !!o.xero.contactRef;
  return { details, agreements, team, medibase, xero, done: !!o.completedAt };
}
/** The first step not yet done, or done when everything is. */
export function onbCurrentStep(o: Onboarding): OnbStepId {
  const d = onbStepDone(o);
  return onbStepsFor(o.kind).find((s) => !d[s]) || "done";
}
export function onbProgress(o: Onboarding): { done: number; total: number } {
  const steps = onbStepsFor(o.kind);
  const d = onbStepDone(o);
  return { done: steps.filter((s) => d[s]).length, total: steps.length };
}

export const ONB_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const ONB_PHONE_RE = /^\+?[\d\s()]{7,}$/;
export type OnbErrors = Partial<Record<string, string>>;

/** Field problems keyed by a dotted path (main.email). Empty when the details can be saved. */
export function onbDetailsErrors(kind: OnbKind, d: OnbDetails): OnbErrors {
  const e: OnbErrors = {};
  if (!d.companyName.trim()) e.companyName = "Company name is required.";
  const cro = d.croNumber.replace(/\s+/g, "");
  if (!cro) e.croNumber = "CRO number is required.";
  else if (!/^\d{4,7}$/.test(cro)) e.croNumber = "A CRO number is 4 to 7 digits, for example 551990.";
  const person = (key: "main" | "hr" | "finance" | "referralManager", label: string, needEmail: boolean) => {
    const p = d[key];
    if (!p.name.trim()) e[`${key}.name`] = `${label} name is required.`;
    if (needEmail && !p.email.trim()) e[`${key}.email`] = `${label} email is required.`;
    else if (p.email.trim() && !ONB_EMAIL_RE.test(p.email.trim())) e[`${key}.email`] = "Enter a valid email address.";
    if (p.phone.trim() && !ONB_PHONE_RE.test(p.phone.trim())) e[`${key}.phone`] = "Enter a valid phone number.";
  };
  person("main", "Main contact", true);
  person("hr", "HR contact", true);
  person("finance", "Finance contact", true);
  if (kind === "oh") person("referralManager", "Referral manager", false);
  if (d.invoiceTo === "ap_email") {
    if (!d.apEmail.trim()) e.apEmail = "Add the accounts payable email address.";
    else if (!ONB_EMAIL_RE.test(d.apEmail.trim())) e.apEmail = "Enter a valid email address, for example accounts@company.ie.";
  }
  if (!d.services.length) e.services = "Choose at least one service.";
  return e;
}

const P = (name = "", email = "", phone = ""): OnbPerson => ({ name, email, phone });
export function onbBlankDetails(): OnbDetails {
  return {
    companyName: "", croNumber: "", registeredAddress: "", sites: "", headcount: "", main: P(), hr: P(), finance: P(), referralManager: P(),
    invoiceTo: "portal", apEmail: "", services: [], poNumber: "", notes: "",
  };
}

/* ---------------------------------------------------------------- agreements */

/** Paragraphs use {{field}} tokens, rendered with ohMergeParagraph. Sample wording, not legal text. */
type Tpl = Array<{ heading: string; paragraphs: string[] }>;
const DSA: Tpl = [
  { heading: "1. Parties", paragraphs: [
    "This Data Sharing Agreement is made on {{effectiveDate}} between {{phLegalName}}, trading as Precision Health, company number {{phCompanyNumber}}, of {{phAddress}}, and {{clientName}}, CRO number {{croNumber}}, of {{registeredAddress}} (\"the Client\")."] },
  { heading: "2. Purpose", paragraphs: [
    "The Client shares employee information with Precision Health only so that Precision Health can provide these {{serviceKind}} services: {{services}}."] },
  { heading: "3. What is shared", paragraphs: [
    "From the Client: employee name, date of birth, work email, job role and work location{{referralLine}}.",
    "To the Client: {{returnLine}} Individual clinical results are never shared with the Client without the employee's consent."] },
  { heading: "4. Keeping it safe", paragraphs: [
    "Information is held in {{systemLine}} Access is limited to named staff. Retention, security and breach notification follow Precision Health's master data sharing terms."] },
  { heading: "5. Contacts", paragraphs: [
    "Data protection contact for the Client: {{hrContact}}, {{hrEmail}}. For Precision Health: {{phEmail}}."] },
];
const SLA: Tpl = [
  { heading: "1. Parties", paragraphs: [
    "This Service Level Agreement is made on {{effectiveDate}} between {{phLegalName}}, trading as Precision Health, company number {{phCompanyNumber}}, of {{phAddress}}, and {{clientName}}, CRO number {{croNumber}}, of {{registeredAddress}} (\"the Client\")."] },
  { heading: "2. Services", paragraphs: [
    "Precision Health will provide these {{serviceKind}} services: {{services}}. Delivered at {{sites}}, at Precision Health clinics, or by video where suitable."] },
  { heading: "3. Who to talk to", paragraphs: [
    "Main contact: {{mainContact}}, {{mainEmail}}. HR contact: {{hrContact}}, {{hrEmail}}. Finance contact: {{financeContact}}, {{financeEmail}}.{{referralSentence}}",
    "Precision Health's {{teamName}} looks after the Client day to day."] },
  { heading: "4. Service levels", paragraphs: [
    "{{serviceLevelLine}}"] },
  { heading: "5. Fees and invoicing", paragraphs: [
    "{{feeLine}} Invoices are raised in Xero and sent to {{invoiceDestination}}. {{poLine}}"] },
  { heading: "6. Term", paragraphs: [
    "This agreement starts on {{effectiveDate}} and runs for twelve months. It renews each year unless either party gives notice in writing."] },
];
export const ONB_DOC_TEMPLATES: Record<OnbDocKind, Tpl> = { dsa: DSA, sla: SLA };

/* ---------------------------------------------------------------- retention: templates and emails */

export type RetTemplateId = "results_out" | "feedback" | "invoice_coming" | "rebooking" | "welcome";
export const RET_TEMPLATE_IDS: RetTemplateId[] = ["results_out", "feedback", "invoice_coming", "rebooking", "welcome"];
export interface RetTemplate { id: RetTemplateId; name: string; use: string; subject: string; body: string; updatedAt: Iso | null; updatedBy: string | null }

export const RET_MERGE_FIELDS: Array<{ key: string; label: string; sample: string }> = [
  { key: "company", label: "Company", sample: "Athlone Medtech Services" },
  { key: "contact_first_name", label: "Contact first name", sample: "Kevin" },
  { key: "contact_name", label: "Contact full name", sample: "Kevin Brophy" },
  { key: "programme", label: "Programme", sample: "Autumn Screening 2026" },
  { key: "reports_released", label: "Reports released", sample: "48" },
  { key: "feedback_link", label: "Feedback form link", sample: "precisionhealth.ie/feedback/DEMO" },
  { key: "last_screened", label: "Last screened", sample: "26 November 2025" },
  { key: "anniversary", label: "Anniversary", sample: "26 November 2026" },
  { key: "team_name", label: "Looked after by", sample: "Wellness team" },
  { key: "invoice_destination", label: "Invoices go to", sample: "the client portal" },
  { key: "sender_name", label: "Sender", sample: "Stephen Kelly" },
];

export const RET_DEFAULT_TEMPLATES: Record<RetTemplateId, Omit<RetTemplate, "updatedAt" | "updatedBy">> = {
  results_out: {
    id: "results_out", name: "Results are out", use: "Sent to the HR contact when results are released for a programme.",
    subject: "{company}: your screening results are out",
    body: "Hi {contact_first_name},\n\nGood news: results from {programme} are out. {reports_released} people can now see their personal report in the Precision Health portal.\n\nHow did we do? Our feedback form takes two minutes: {feedback_link}\n\nYour invoice for the programme is on its way and will follow from our accounts team in the next few days.\n\nThank you for choosing Precision Health.\n\n{sender_name}\nPrecision Health",
  },
  feedback: {
    id: "feedback", name: "Feedback", use: "A gentle nudge a week later if the feedback form is not back.",
    subject: "How did we do, {company}?",
    body: "Hi {contact_first_name},\n\nWe hope your team found the screening useful. Could you spare two minutes to tell us how it went?\n\n{feedback_link}\n\nEvery answer is read by our team and helps us plan next year's programme with you.\n\nMany thanks,\n{sender_name}\nPrecision Health",
  },
  invoice_coming: {
    id: "invoice_coming", name: "Invoice coming", use: "Sent when the invoice is raised, so it is expected.",
    subject: "Your Precision Health invoice is on its way",
    body: "Hi {contact_first_name},\n\nA quick note to say the invoice for {programme} has been raised and will reach {invoice_destination} shortly.\n\nIf you need a purchase order number on it, just reply to this email.\n\nThank you,\n{sender_name}\nPrecision Health",
  },
  rebooking: {
    id: "rebooking", name: "Rebooking reminder", use: "Sent to the named HR contact three months before the anniversary.",
    subject: "{company}: time to plan your next screening",
    body: "Hi {contact_first_name},\n\nIt is almost a year since we screened your team on {last_screened}. To keep the same time next year, around {anniversary}, it is worth booking now: our clinic days fill about three months ahead.\n\nReply to this email and we will hold dates for you, or we can talk through any changes to last year's programme.\n\nKind regards,\n{sender_name}\nPrecision Health",
  },
  welcome: {
    id: "welcome", name: "Welcome", use: "Sent to the main contact when onboarding is finished.",
    subject: "Welcome to Precision Health, {company}",
    body: "Hi {contact_first_name},\n\nWelcome aboard. Your onboarding is complete: agreements are signed and your account is set up.\n\nThe {team_name} will look after you from here, and invoices will go to {invoice_destination}.\n\nIf you need anything at all, reply to this email or call us on +353 1 910 4024.\n\n{sender_name}\nPrecision Health",
  },
};

export type RetEmailKind = "results_out" | "rebooking" | "welcome";
export interface RetEmail {
  id: string; // EM-0001
  template: RetTemplateId;
  company: string;
  toName: string;
  toEmail: string;
  subject: string;
  body: string;
  sentAt: Iso;
  sentBy: string;
  /** What the email was about: a programme, a recall or an onboarding. */
  ref: string;
}

/** Replace {field} tokens. Unknown fields stay visible so a typo is easy to spot. */
export function retMerge(text: string, values: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (m, k) => (values[k] !== undefined ? values[k] : m));
}
export const retSampleValues = (): Record<string, string> => Object.fromEntries(RET_MERGE_FIELDS.map((f) => [f.key, f.sample]));

export interface RetContact { name: string; role: string; email: string }
export interface RetContactChange { company: string; left: Array<{ name: string; email: string; leftOn: LocalDate }>; current: RetContact | null }

export const retCompanyKey = (c: string) => c.toLowerCase().replace(/\(fictional\)/g, "").replace(/[^a-z0-9&]+/g, " ").trim();

/* ---------------------------------------------------------------- state and seeds */

export interface OnboardingState {
  seq: { onboarding: number; email: number; xero: number };
  onboardings: Onboarding[];
  templates: Record<RetTemplateId, RetTemplate>;
  emails: RetEmail[];
  /** Released report count already told to each programme's client. */
  releaseNotified: Partial<Record<ProgrammeId, number>>;
  /** Recall id to the rebooking email sent for it. */
  rebookSent: Record<string, string>;
  /** Keyed by retCompanyKey. */
  contactChanges: Record<string, RetContactChange>;
}

const at = (d: string, t = "10:00") => `${d}T${t}:00.000Z`;

function seedOh(): Onboarding {
  const details: OnbDetails = {
    companyName: "Shannon Aero Engineering (fictional)", croNumber: "684217", registeredAddress: "Demo address, Shannon Free Zone, Co. Clare",
    sites: "Shannon hangar and Limerick office", headcount: "220",
    main: P("Nessa Farrell", "nessa.farrell@example.com", "+353 61 555 0142"),
    hr: P("Nessa Farrell", "nessa.farrell@example.com", "+353 61 555 0142"),
    finance: P("Owen Kehoe", "owen.kehoe@example.com", "+353 61 555 0149"),
    referralManager: P("Dermot Hayes", "dermot.hayes@example.com", ""),
    invoiceTo: "ap_email", apEmail: "accounts.payable@example.com",
    services: ["Pre-employment medicals", "Health surveillance", "Management referrals", "Drug and alcohol testing"], poNumber: "PO-DEMO-4410", notes: "Licensed engineers need annual health surveillance.",
  };
  const o: Onboarding = {
    id: "ONB-001", kind: "oh", leadId: null, createdAt: at("2026-09-28", "09:15"), createdBy: "Stephen Kelly", details, detailsSavedAt: at("2026-09-28", "09:40"),
    docs: {}, route: null, medibase: { assigneeId: "fiona", ticks: onbMedibaseSteps(details).map(() => false), doneAt: null },
    xero: { billing: "retainer_525", contactRef: null, createdAt: null }, welcomeEmailId: null, completedAt: null,
  };
  return o;
}
function seedWellness(): Onboarding {
  const details: OnbDetails = {
    companyName: "Wicklow Biologics (fictional)", croNumber: "702955", registeredAddress: "Demo address, Arklow Business Park, Co. Wicklow",
    sites: "Arklow manufacturing site", headcount: "140",
    main: P("Aisling Doran", "aisling.doran@example.com", "+353 402 555 0117"),
    hr: P("Ruairí Byrne", "ruairi.byrne@example.com", "+353 402 555 0121"),
    finance: P("Gillian Nolan", "gillian.nolan@example.com", ""),
    referralManager: P(),
    invoiceTo: "portal", apEmail: "",
    services: ["Health screening days", "Flu vaccination clinics", "Wellness talks"], poNumber: "", notes: "Two screening days in spring, flu in October.",
  };
  return {
    id: "ONB-002", kind: "wellness", leadId: null, createdAt: at("2026-09-21", "11:05"), createdBy: "Stephen Kelly", details, detailsSavedAt: at("2026-09-21", "11:30"),
    docs: {}, route: null, medibase: { assigneeId: "fiona", ticks: [], doneAt: null },
    xero: { billing: "per_programme", contactRef: null, createdAt: null }, welcomeEmailId: null, completedAt: null,
  };
}

export function initialOnboardingState(): OnboardingState {
  const templates = Object.fromEntries(RET_TEMPLATE_IDS.map((id) => [id, { ...RET_DEFAULT_TEMPLATES[id], updatedAt: null, updatedBy: null }])) as Record<RetTemplateId, RetTemplate>;
  const sent = (n: number, template: RetTemplateId, company: string, toName: string, toEmail: string, subject: string, d: string, ref: string): RetEmail => ({
    id: `EM-${String(n).padStart(4, "0")}`, template, company, toName, toEmail, subject, body: "", sentAt: at(d, "08:30"), sentBy: "Stephen Kelly", ref,
  });
  const emails: RetEmail[] = [
    sent(1, "rebooking", "Midleton Logistics", "Fergus Lyne", "fergus.lyne@example.com", "Midleton Logistics: time to plan your next screening", "2025-12-03", "RC-ENG-11"),
    sent(2, "rebooking", "Navan Print Works", "Yvonne Clinton", "yvonne.clinton@example.com", "Navan Print Works: time to plan your next screening", "2026-06-22", "RC-ENG-12"),
    sent(3, "rebooking", "ABP", "Lisa Mangan", "lisa.mangan@example.com", "ABP: time to plan your next screening", "2026-07-21", "RC-ENG-06"),
    sent(4, "rebooking", "Cairn Homes", "Peadar Grehan", "peadar.grehan@example.com", "Cairn Homes: time to plan your next screening", "2026-08-04", "RC-ENG-05"),
    sent(5, "results_out", "Sisk", "Róisín Hegarty", "roisin.hegarty@example.com", "Sisk: your screening results are out", "2026-10-02", "PRG-SISK-26"),
    sent(6, "results_out", "Salesforce", "Daragh Coyle", "daragh.coyle@example.com", "Salesforce: your screening results are out", "2026-10-03", "PRG-SF-26"),
  ];
  const SEED_VALUES: Record<string, Record<string, string>> = {
    "EM-0001": { last_screened: "3 March 2025", anniversary: "3 March 2026" },
    "EM-0002": { last_screened: "22 September 2025", anniversary: "22 September 2026" },
    "EM-0003": { last_screened: "21 October 2025", anniversary: "21 October 2026" },
    "EM-0004": { last_screened: "4 November 2025", anniversary: "4 November 2026" },
    "EM-0005": { programme: "Sisk Autumn Screening", reports_released: "126", feedback_link: "precisionhealth.ie/feedback/sisk" },
    "EM-0006": { programme: "Salesforce Dublin Wellness", reports_released: "40", feedback_link: "precisionhealth.ie/feedback/sf" },
  };
  for (const e of emails) {
    const t = RET_DEFAULT_TEMPLATES[e.template];
    const v = { company: e.company, contact_first_name: e.toName.split(" ")[0], contact_name: e.toName, sender_name: "Stephen Kelly", ...SEED_VALUES[e.id] };
    e.subject = retMerge(t.subject, v);
    e.body = retMerge(t.body, v);
  }
  return {
    seq: { onboarding: 2, email: emails.length, xero: 0 },
    onboardings: [
      seedDocs(seedOh(), { dsa: ["signed", at("2026-09-28", "10:00"), at("2026-09-28", "10:05"), at("2026-10-01", "14:20")], sla: ["sent", at("2026-09-28", "10:02"), at("2026-09-28", "10:06"), null] }),
      seedDocs(seedWellness(), { dsa: ["signed", at("2026-09-21", "12:00"), at("2026-09-21", "12:05"), at("2026-09-23", "09:40")], sla: ["signed", at("2026-09-21", "12:01"), at("2026-09-21", "12:05"), at("2026-09-24", "16:10")] }),
    ],
    templates,
    emails,
    releaseNotified: { "PRG-SISK-26": 126, "PRG-SF-26": 40 },
    rebookSent: { "RC-ENG-11": "EM-0001", "RC-ENG-12": "EM-0002", "RC-ENG-06": "EM-0003", "RC-ENG-05": "EM-0004" },
    contactChanges: {
      [retCompanyKey("ABP")]: { company: "ABP", left: [{ name: "Lisa Mangan", email: "lisa.mangan@example.com", leftOn: "2026-09-12" }], current: { name: "Conor Delahunt", role: "HR Manager", email: "conor.delahunt@example.com" } },
    },
  };
}

/** The merge values for an onboarding's agreements on a given date. */
export function onbMergeFields(o: Onboarding, onDate: LocalDate): Record<string, string> {
  const d = o.details;
  const oh = o.kind === "oh";
  const services = d.services.length ? d.services.join(", ").toLowerCase() : "the services in the proposal";
  const retainer = ONB_RETAINER_EUR[o.xero.billing];
  return {
    clientName: d.companyName, croNumber: d.croNumber.replace(/\s+/g, ""), registeredAddress: d.registeredAddress || "the Client's registered address",
    serviceKind: oh ? "occupational health" : "wellness and health screening", services, sites: d.sites || "the Client's sites",
    mainContact: d.main.name, mainEmail: d.main.email, hrContact: d.hr.name, hrEmail: d.hr.email, financeContact: d.finance.name, financeEmail: d.finance.email,
    referralSentence: oh && d.referralManager.name ? ` Referral manager: ${d.referralManager.name}, who raises referrals in MediBase.` : "",
    referralLine: oh ? " and, for a referral, the reason for it" : "",
    returnLine: oh ? "fitness for work outcomes and recommended adjustments." : "anonymised group reports only, never fewer than ten people in any group.",
    systemLine: oh ? "MediBase, Precision Health's occupational health system." : "Pulse, Precision Health's screening platform.",
    teamName: ONB_TEAM[o.kind].name,
    serviceLevelLine: oh ? "Management referrals are offered an appointment within five working days, and reports are returned within two working days of the appointment."
      : "Screening days are confirmed at least four weeks ahead, and individual results are released to each employee within ten working days of their screening.",
    feeLine: oh && retainer ? `A yearly recurring fee of €${retainer === 1050 ? "1,050" : "525"} covers the MediBase account and the agreed service. Extra appointments are billed as used.`
      : "Each programme is invoiced once its results are out, at the prices in the agreed proposal.",
    invoiceDestination: d.invoiceTo === "ap_email" ? d.apEmail : "the Precision Health client portal",
    poLine: d.poNumber.trim() ? `Invoices quote purchase order ${d.poNumber.trim()}.` : "No purchase order is needed.",
    effectiveDate: fmtDateLong(onDate).replace(/^[A-Za-z]+day /, ""), phLegalName: BRAND.legalName, phCompanyNumber: BRAND.companyNumber, phAddress: BRAND.address, phEmail: BRAND.email,
  };
}

function seedDocs(o: Onboarding, docs: Partial<Record<OnbDocKind, [OnbDocStatus, string, string | null, string | null]>>): Onboarding {
  for (const k of ["dsa", "sla"] as OnbDocKind[]) {
    const x = docs[k];
    if (!x) continue;
    o.docs[k] = { status: x[0], version: 1, generatedAt: x[1], sentAt: x[2], signedAt: x[3], merged: onbMergeFields(o, x[1].slice(0, 10)) };
  }
  return o;
}
