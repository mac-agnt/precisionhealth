/* Static reference data for the Precision Health demo: roster, programmes, forms,
   permissions, systems register, agents. Public staff names and roles come from the
   company website. Everything operational is a fictional demo fixture. */
import type {
  AgentDef, Analyte, AnalyteCode, AppointmentType, Company, Contact, FormBlock, FormTemplate, GovernanceItem,
  HoldKind, IntegrationDef, Perm, Programme, ProgrammeId, ReportState, Resource, RoleKey, Staff, StaffId, Story, Team,
} from "./types";
import { hhmmToMinutes, minutesToHhmm } from "./time";
import type { Hhmm } from "./time";

export const BRAND = {
  org: "Precision Health",
  legalName: "Precision Healthcare Ltd",
  product: "Pulse",
  title: "Precision Health | Pulse",
  website: "https://www.precisionhealth.ie/",
  address: "238 Blanchardstown Corporate Park 2, Blanchardstown, Dublin 15, D15 KV21",
  email: "support@precisionhealth.ie",
  phone: "+353 1 910 4024",
  companyNumber: "551990",
  teal: "#5CA39A",
  sage: "#97C2BC",
  mint: "#C0E0DC",
  darkTeal: "#3D6D67",
  deepTeal: "#1F3633",
  logoPath: "/brand/precision-health-logo.png",
  demoLabel: "Demo · synthetic data",
};

/* ---- staff: eight demonstration profiles, not total headcount ---- */
export const STAFF: Staff[] = [
  { id: "neil", name: "Neil Reddy", displayName: "Dr Neil Reddy", title: "Medical Director", team: "clinical-review", role: "clinical_review",
    email: "neil.reddy@precisionhealth.ie", emailVerified: true, initials: "NR", tint: "#5CA39A",
    assignment: "Clinical reviewer. Owns the review queue and clinical follow-up in this demo." },
  { id: "stephen", name: "Stephen Kelly", displayName: "Stephen Kelly", title: "Sales and Operations Director", team: "client-programmes", role: "programme_oversight",
    email: "stephen.kelly@precisionhealth.ie", emailVerified: true, initials: "SK", tint: "#97C2BC",
    assignment: "Programme oversight. Owns capacity decisions and client programmes in this demo." },
  { id: "liz", name: "Liz Bawle", displayName: "Liz Bawle", title: "Director of Nursing", team: "nursing", role: "nursing_lead",
    email: "demo.liz@precisionhealth.ie", emailVerified: false, initials: "LB", tint: "#C0E0DC",
    assignment: "Clinical resource coordination. Assigned to the IBM clinic today in this demo." },
  { id: "fiona", name: "Fiona Fenton", displayName: "Fiona Fenton", title: "Occupational Health and Wellness Nurse", team: "nursing", role: "clinical_capture",
    email: "demo.fiona@precisionhealth.ie", emailVerified: false, initials: "FF", tint: "#7DB8B0",
    assignment: "Clinical capture. Assigned to the Sisk clinic today in this demo." },
  { id: "anita", name: "Anita Mulhere", displayName: "Anita Mulhere", title: "Occupational Health and Wellness Nurse", team: "nursing", role: "clinical_capture",
    email: "demo.anita@precisionhealth.ie", emailVerified: false, initials: "AM", tint: "#6FB0A6",
    assignment: "Clinical capture. Assigned to the Salesforce clinic today in this demo." },
  { id: "ian", name: "Ian Murtagh", displayName: "Ian Murtagh", title: "Wellness Advisor", team: "nursing", role: "wellness_support",
    email: "demo.ian@precisionhealth.ie", emailVerified: false, initials: "IM", tint: "#A9CFC9",
    assignment: "Support resource at the Sisk clinic today. Not a second booked nurse." },
  { id: "martina", name: "Martina Beattie", displayName: "Martina Beattie", title: "Wellness Business Manager", team: "client-programmes", role: "programme_reporting",
    email: "demo.martina@precisionhealth.ie", emailVerified: false, initials: "MB", tint: "#8FBFB8",
    assignment: "Programme reporting coordination in this demo." },
  { id: "brenda", name: "Brenda Madden", displayName: "Brenda Madden", title: "Administration Support", team: "programme-operations", role: "operations",
    email: "demo.brenda@precisionhealth.ie", emailVerified: false, initials: "BM", tint: "#B4D8D2",
    assignment: "Bookings and import operations. No access to clinical values." },
];
export const STAFF_BY_ID: Record<StaffId, Staff> = Object.fromEntries(STAFF.map((s) => [s.id, s])) as Record<StaffId, Staff>;

export const TEAMS: Team[] = [
  { id: "programme-operations", name: "Programme Operations", purpose: "Bookings, invitations, import operations and reminders.", memberIds: ["brenda"], ownerId: null },
  { id: "nursing", name: "Nursing", purpose: "Clinic delivery and clinical capture at screening sessions.", memberIds: ["liz", "fiona", "anita", "ian"], ownerId: "liz" },
  { id: "clinical-review", name: "Clinical Review", purpose: "Clinician review, advice and release of individual reports.", memberIds: ["neil"], ownerId: "neil" },
  { id: "client-programmes", name: "Client Programmes", purpose: "Client relationships, programme oversight and employer reporting.", memberIds: ["stephen", "martina"], ownerId: "stephen" },
];

/* ---- permission simulation ---- */
export const PERM_DEFS: Array<{ key: Perm; label: string; group: "Operations" | "Clinical" | "Reporting" | "Admin"; roles: RoleKey[] }> = [
  { key: "logistics.view", label: "View programme and clinic logistics", group: "Operations",
    roles: ["clinical_review", "nursing_lead", "clinical_capture", "operations", "programme_oversight", "programme_reporting", "wellness_support"] },
  { key: "identity.minimal", label: "View minimal participant identity", group: "Operations",
    roles: ["clinical_review", "nursing_lead", "clinical_capture", "operations", "programme_oversight", "programme_reporting", "wellness_support"] },
  { key: "imports.view", label: "View import batches and counts", group: "Operations",
    roles: ["clinical_review", "nursing_lead", "operations", "programme_oversight"] },
  { key: "identity.resolve", label: "Resolve laboratory identity exceptions", group: "Operations", roles: ["clinical_review", "operations"] },
  { key: "bookings.manage", label: "Manage bookings and edit sessions", group: "Operations", roles: ["nursing_lead", "operations", "programme_oversight"] },
  { key: "invitations.manage", label: "Create invitation codes and prepare invitations (administrators)", group: "Operations", roles: ["operations", "programme_oversight"] },
  { key: "invitations.approve", label: "Approve invitation sends and capacity actions", group: "Operations", roles: ["programme_oversight"] },
  { key: "clinical.view", label: "View clinical values, results and reports", group: "Clinical", roles: ["clinical_review", "nursing_lead", "clinical_capture"] },
  { key: "clinical.capture", label: "Capture clinical data at appointments", group: "Clinical", roles: ["nursing_lead", "clinical_capture"] },
  { key: "clinical.review", label: "Review, release and correct individual reports", group: "Clinical", roles: ["clinical_review"] },
  { key: "followup.view", label: "View clinical follow-up tasks", group: "Clinical", roles: ["clinical_review", "nursing_lead", "clinical_capture"] },
  { key: "followup.act", label: "Record follow-up outcomes", group: "Clinical", roles: ["clinical_review", "nursing_lead"] },
  { key: "activity.clinical", label: "See clinical events in activity feeds", group: "Clinical", roles: ["clinical_review", "nursing_lead", "clinical_capture"] },
  { key: "reports.build", label: "Build employer reports", group: "Reporting", roles: ["clinical_review", "programme_oversight", "programme_reporting"] },
  { key: "reports.approve", label: "Approve employer report narrative", group: "Reporting", roles: ["clinical_review"] },
  { key: "reports.export", label: "Export approved employer reports", group: "Reporting", roles: ["clinical_review", "programme_oversight", "programme_reporting"] },
  { key: "forms.edit", label: "Edit form templates (form admin)", group: "Admin", roles: ["clinical_review", "nursing_lead"] },
  { key: "forms.publish", label: "Approve form template publication", group: "Admin", roles: ["clinical_review"] },
  { key: "settings.view", label: "View settings and governance", group: "Admin",
    roles: ["clinical_review", "nursing_lead", "clinical_capture", "operations", "programme_oversight", "programme_reporting", "wellness_support"] },
  { key: "settings.edit", label: "Change settings and AI controls", group: "Admin", roles: ["clinical_review", "programme_oversight"] },
  { key: "agents.view", label: "View agents and their activity", group: "Admin",
    roles: ["clinical_review", "nursing_lead", "clinical_capture", "operations", "programme_oversight", "programme_reporting", "wellness_support"] },
  { key: "agents.configure", label: "Configure agents", group: "Admin", roles: ["clinical_review", "programme_oversight"] },
];

export const ROLE_LABEL: Record<RoleKey | "participant", string> = {
  clinical_review: "Clinical reviewer",
  nursing_lead: "Nursing lead",
  clinical_capture: "Clinical capture",
  operations: "Operations",
  programme_oversight: "Programme oversight",
  programme_reporting: "Programme reporting",
  wellness_support: "Wellness support",
  participant: "Participant (own released data only)",
};

/* ---- companies and contacts ---- */
export const COMPANIES: Company[] = [
  { id: "co-ph", name: "Precision Health", kind: "self", relationship: "Screening provider (Precision Healthcare Ltd)",
    programmeIds: ["PRG-SISK-26", "PRG-SF-26", "PRG-IBM-26"], integrationIds: [],
    contactIds: ["ct-neil", "ct-stephen", "ct-general"], website: BRAND.website,
    note: "Workplace screening, corporate wellness, occupational health, vaccination, cardiac services and mobile onsite services. Public details only." },
  { id: "co-sisk", name: "Sisk", kind: "client", relationship: "Employer client (demo programme label)", programmeIds: ["PRG-SISK-26"], integrationIds: [],
    contactIds: ["ct-sisk-hr"], note: "Client name is a real reference. Contact, programme activity and dates are fictional demo content." },
  { id: "co-sf", name: "Salesforce", kind: "client", relationship: "Employer client (demo programme label)", programmeIds: ["PRG-SF-26"], integrationIds: [],
    contactIds: ["ct-sf-hr"], note: "Client name is a real reference. Contact, programme activity and dates are fictional demo content." },
  { id: "co-ibm", name: "IBM", kind: "client", relationship: "Employer client (demo programme label)", programmeIds: ["PRG-IBM-26"], integrationIds: [],
    contactIds: ["ct-ibm-hr"], note: "Client name is a real reference. Contact, programme activity and dates are fictional demo content." },
  { id: "co-eurofins", name: "Eurofins (Dublin)", kind: "supplier", relationship: "Laboratory supplier", programmeIds: [], integrationIds: ["eurofins"], contactIds: [],
    note: "Provides laboratory results as an FTP-accessible CSV today. Direct API integration is a later option." },
  { id: "co-esendex", name: "Esendex", kind: "service", relationship: "SMS delivery service named in the booking consent", programmeIds: [], integrationIds: ["esendex"], contactIds: [],
    note: "Named in the current booking consent for SMS delivery. Delivery is simulated in this demo." },
];

export const CONTACTS: Contact[] = [
  { id: "ct-neil", name: "Neil Reddy", role: "Co-founder & Medical Director", companyId: "co-ph", email: "neil.reddy@precisionhealth.ie", provenance: "public", hasClinicalAccess: false },
  { id: "ct-stephen", name: "Stephen Kelly", role: "Co-founder & Sales and Operations Director", companyId: "co-ph", email: "stephen.kelly@precisionhealth.ie", provenance: "public", hasClinicalAccess: false },
  { id: "ct-general", name: "Precision Health general contact", role: "Support line", companyId: "co-ph", email: "support@precisionhealth.ie", phone: "+353 1 910 4024", provenance: "public", hasClinicalAccess: false },
  { id: "ct-sisk-hr", name: "Róisín Hegarty", role: "HR Business Partner (fictional)", companyId: "co-sisk", email: "roisin.hegarty@example.com", provenance: "fictional", hasClinicalAccess: false },
  { id: "ct-sf-hr", name: "Daragh Coyle", role: "People Operations Lead (fictional)", companyId: "co-sf", email: "daragh.coyle@example.com", provenance: "fictional", hasClinicalAccess: false },
  { id: "ct-ibm-hr", name: "Mairéad Costello", role: "Wellbeing Programme Coordinator (fictional)", companyId: "co-ibm", email: "mairead.costello@example.com", provenance: "fictional", hasClinicalAccess: false },
];

/* ---- programmes and clinic configuration ---- */
export const APPOINTMENT_TYPES: AppointmentType[] = [
  { id: "AT-COMP-LAB", name: "Comprehensive (LAB) Screen", minutes: 15, templateId: "tpl-comprehensive-lab", kind: "screening", note: "Nurse form, blood panel and questionnaire." },
  { id: "AT-CARDIO", name: "Cardiovascular Screen", minutes: 15, templateId: "tpl-cardiovascular", kind: "screening", note: "Includes ECG block." },
  { id: "AT-SPORTS", name: "Sports Cardiac Screen", minutes: 20, templateId: "tpl-sports-cardiac", kind: "screening", note: "Includes ECG block." },
  { id: "AT-SKIN", name: "Skin Screening", minutes: 15, templateId: "tpl-skin", kind: "screening", note: "Lifestyle and clinically approved cancer questions." },
  { id: "AT-FLU", name: "Flu Vaccination Booking", minutes: 10, templateId: "tpl-flu-booking", kind: "service", note: "Scheduling template only. Vaccination administration is not built." },
  { id: "AT-TRAIN", name: "Training Booking", minutes: 45, templateId: "tpl-training-booking", kind: "service", note: "Scheduling template only. Training certification is not built." },
];

export const PROGRAMMES: Programme[] = [
  { id: "PRG-SISK-26", code: "SISK", name: "Sisk Autumn Screening", clientId: "co-sisk", clientName: "Sisk",
    windowStart: "2026-09-14", windowEnd: "2026-10-23", ownerId: "stephen", clinicalLeadId: "neil", reportingLeadId: "martina", opsLeadId: "brenda",
    appointmentTypeId: "AT-COMP-LAB", templateId: "tpl-comprehensive-lab", sites: ["Sisk Dublin Site A", "Sisk Dublin Site B"],
    eligibility: "Employees and site staff on the programme roster (fictional).", inviteCode: "DEMO-SISK-26" },
  { id: "PRG-SF-26", code: "SF", name: "Salesforce Dublin Wellness", clientId: "co-sf", clientName: "Salesforce",
    windowStart: "2026-09-29", windowEnd: "2026-10-09", ownerId: "stephen", clinicalLeadId: "neil", reportingLeadId: "martina", opsLeadId: "brenda",
    appointmentTypeId: "AT-COMP-LAB", templateId: "tpl-comprehensive-lab", sites: ["Salesforce Dublin, Demo Wellness Room"],
    eligibility: "Dublin office employees on the programme roster (fictional).", inviteCode: "DEMO-SF-26" },
  { id: "PRG-IBM-26", code: "IBM", name: "IBM Dublin Screening", clientId: "co-ibm", clientName: "IBM",
    windowStart: "2026-10-01", windowEnd: "2026-10-12", ownerId: "stephen", clinicalLeadId: "neil", reportingLeadId: "martina", opsLeadId: "brenda",
    appointmentTypeId: "AT-COMP-LAB", templateId: "tpl-comprehensive-lab", sites: ["IBM Dublin, Demo Screening Room"],
    eligibility: "Dublin site employees on the programme roster (fictional).", inviteCode: "DEMO-IBM-26" },
];
export const PROGRAMME_BY_ID: Record<ProgrammeId, Programme> = Object.fromEntries(PROGRAMMES.map((p) => [p.id, p])) as Record<ProgrammeId, Programme>;
export const PROGRAMME_ORDER: ProgrammeId[] = ["PRG-SISK-26", "PRG-SF-26", "PRG-IBM-26"];

/** Baseline roster sizes: invited persons per programme. */
export const INVITED: Record<ProgrammeId, number> = { "PRG-SISK-26": 500, "PRG-SF-26": 200, "PRG-IBM-26": 150 };
/** First person number for each programme (PH-P-0001, PH-P-0501, PH-P-0701). */
export const PERSON_START: Record<ProgrammeId, number> = { "PRG-SISK-26": 1, "PRG-SF-26": 501, "PRG-IBM-26": 701 };

export const CLINIC_DAY = {
  start: "09:00" as Hhmm,
  end: "16:15" as Hhmm,
  slotMinutes: 15,
  breaks: [
    { start: "10:30" as Hhmm, end: "10:45" as Hhmm },
    { start: "12:30" as Hhmm, end: "13:00" as Hhmm },
    { start: "14:30" as Hhmm, end: "14:45" as Hhmm },
  ],
};

/** Derive bookable slots from a window, breaks and slot length. Breaks are never bookable. */
export function buildSlots(start: Hhmm, end: Hhmm, breaks: Array<{ start: Hhmm; end: Hhmm }>, slotMinutes: number) {
  const slots: Array<{ index: number; start: Hhmm; end: Hhmm }> = [];
  const b = breaks.map((x) => ({ s: hhmmToMinutes(x.start), e: hhmmToMinutes(x.end) })).sort((x, y) => x.s - y.s);
  let t = hhmmToMinutes(start);
  const stop = hhmmToMinutes(end);
  let guard = 0;
  while (t + slotMinutes <= stop && guard++ < 500) {
    const hit = b.find((x) => t < x.e && t + slotMinutes > x.s);
    if (hit) {
      t = hit.e;
      continue;
    }
    slots.push({ index: slots.length, start: minutesToHhmm(t), end: minutesToHhmm(t + slotMinutes) });
    t += slotMinutes;
  }
  return slots;
}

export const RESOURCES: Resource[] = [
  { id: "rm-sisk-a", kind: "room", name: "Sisk Site A, Welfare Cabin 2", location: "Sisk Dublin Site A", note: "Illustrative room." },
  { id: "rm-sisk-b", kind: "room", name: "Sisk Site B, Meeting Room 1", location: "Sisk Dublin Site B", note: "Illustrative room." },
  { id: "rm-sf", kind: "room", name: "Demo Wellness Room", location: "Salesforce Dublin", note: "Illustrative room." },
  { id: "rm-ibm", kind: "room", name: "Demo Screening Room", location: "IBM Dublin", note: "Illustrative room." },
  { id: "pr-1", kind: "printer", name: "Label printer LP-01 (fictional)", location: "Sisk clinics", note: "Demo specimen labels only. Not for laboratory use." },
  { id: "pr-2", kind: "printer", name: "Label printer LP-02 (fictional)", location: "Salesforce clinics", note: "Demo specimen labels only. Not for laboratory use." },
  { id: "pr-3", kind: "printer", name: "Label printer LP-03 (fictional)", location: "IBM clinics", note: "Demo specimen labels only. Not for laboratory use." },
  { id: "pr-4", kind: "printer", name: "Label printer LP-04 (fictional)", location: "Spare, Blanchardstown office", note: "Spare unit." },
];

/* ---- laboratory analytes: illustrative display limits, clinician-owned ---- */
export const ANALYTES: Record<AnalyteCode, Analyte> = {
  TC: { code: "TC", name: "Total cholesterol", unit: "mmol/L", decimals: 1, limit: { kind: "max", value: 5.0, text: "<5.0" }, addOn: false },
  HDL: { code: "HDL", name: "HDL cholesterol", unit: "mmol/L", decimals: 1, limit: { kind: "min", value: 1.0, text: ">1.0" }, addOn: false },
  LDL: { code: "LDL", name: "LDL cholesterol", unit: "mmol/L", decimals: 1, limit: { kind: "max", value: 3.0, text: "<3.0" }, addOn: false },
  TG: { code: "TG", name: "Triglycerides", unit: "mmol/L", decimals: 1, limit: { kind: "max", value: 1.7, text: "<1.7" }, addOn: false },
  HBA1C: { code: "HBA1C", name: "HbA1c", unit: "mmol/mol", decimals: 0, limit: { kind: "max", value: 42, text: "<42" }, addOn: false },
  VITD: { code: "VITD", name: "Vitamin D (25-OH)", unit: "nmol/L", decimals: 0, limit: { kind: "min", value: 50, text: ">50" }, addOn: true },
  FERR: { code: "FERR", name: "Ferritin", unit: "ug/L", decimals: 0, limit: { kind: "min", value: 30, text: ">30" }, addOn: true },
};
export const CORE_PANEL: AnalyteCode[] = ["TC", "HDL", "LDL", "TG", "HBA1C"];
export const ADD_ON_PANEL: AnalyteCode[] = ["VITD", "FERR"];
export const LIMITS_DISCLAIMER =
  "Illustrative display limits for demonstration. Sample content, not a validated clinical threshold library. Interpretation is clinician-owned.";
export const BP_REVIEW_LIMIT = { sys: 140, dia: 90, text: "<140/90" };

export function flagFor(code: AnalyteCode, value: number): "none" | "review_required" {
  const l = ANALYTES[code].limit;
  if (l.kind === "max") return value > l.value ? "review_required" : "none";
  return value < l.value ? "review_required" : "none";
}

/* ---- labels ---- */
export const REPORT_STATE_LABEL: Record<ReportState, string> = {
  awaiting_results: "Awaiting results",
  ready_for_review: "Ready for review",
  released: "Released",
  on_hold: "On hold",
};
export const HOLD_LABEL: Record<HoldKind, string> = {
  identity_dob_mismatch: "Identity: date of birth mismatch",
  identity_unknown_specimen: "Identity: unknown specimen identifier",
  identity_candidates: "Identity: two candidate episodes",
  source_unit_discrepancy: "Source unit discrepancy",
  urgent_follow_up: "Clinician-assigned urgent follow-up",
};
export type HoldCategory = "identity" | "data_quality" | "clinical_action";
export const HOLD_CATEGORY: Record<HoldKind, HoldCategory> = {
  identity_dob_mismatch: "identity",
  identity_unknown_specimen: "identity",
  identity_candidates: "identity",
  source_unit_discrepancy: "data_quality",
  urgent_follow_up: "clinical_action",
};
export const HOLD_CATEGORY_LABEL: Record<HoldCategory, string> = {
  identity: "Identity exception",
  data_quality: "Data quality hold",
  clinical_action: "Clinical action",
};
export const FOLLOW_UP_OUTCOMES: Array<{ code: string; label: string }> = [
  { code: "reached_advice_given", label: "Reached participant, advice given" },
  { code: "appointment_arranged", label: "Reached participant, onward appointment arranged" },
  { code: "unable_to_reach_escalated", label: "Unable to reach after attempts, escalated per clinician" },
  { code: "declined_contact", label: "Participant declined further contact (documented)" },
];
export const AGE_BANDS = ["18-34", "35-44", "45-54", "55+"] as const;

/* ---- form blocks and templates (versioned, clinically approved content) ---- */
const absence3: Array<"missing" | "not_done" | "declined"> = ["missing", "not_done", "declined"];
export const FORM_BLOCKS: FormBlock[] = [
  { id: "blk-bp", name: "Blood Pressure", version: "1.2", summary: "Seated blood pressure and pulse. Same fields, units and validation wherever it is used.", approvedBy: "Clinical Review",
    fields: [
      { key: "bpSys", label: "Systolic", type: "number", unit: "mmHg", required: true, min: 60, max: 260, absence: absence3 },
      { key: "bpDia", label: "Diastolic", type: "number", unit: "mmHg", required: true, min: 30, max: 160, absence: absence3 },
      { key: "pulse", label: "Pulse", type: "number", unit: "bpm", required: false, min: 30, max: 220, absence: absence3 },
      { key: "bpArm", label: "Arm used", type: "choice", options: ["Left", "Right"], required: false, absence: ["missing"] },
    ] },
  { id: "blk-anthro", name: "Anthropometrics", version: "1.1", summary: "Height, weight and waist. BMI is calculated, never typed.", approvedBy: "Clinical Review",
    fields: [
      { key: "heightM", label: "Height", type: "number", unit: "m", required: true, min: 1.0, max: 2.3, absence: absence3 },
      { key: "weightKg", label: "Weight", type: "number", unit: "kg", required: true, min: 25, max: 300, absence: absence3 },
      { key: "waistCm", label: "Waist", type: "number", unit: "cm", required: false, min: 40, max: 220, absence: absence3 },
      { key: "bmi", label: "BMI (calculated)", type: "number", unit: "kg/m²", required: false, absence: ["missing"] },
    ] },
  { id: "blk-lifestyle", name: "Lifestyle", version: "2.0", summary: "Smoking, alcohol, activity and sleep, self-reported.", approvedBy: "Clinical Review",
    fields: [
      { key: "smoking", label: "Smoking status", type: "choice", options: ["Never", "Former", "Current"], required: true, absence: absence3 },
      { key: "cigsPerDay", label: "Cigarettes per day", type: "number", unit: "per day", required: false, min: 0, max: 100, showIf: { key: "smoking", equals: "Current" }, absence: ["missing"] },
      { key: "alcohol", label: "Alcohol", type: "number", unit: "units/week", required: true, min: 0, max: 200, absence: absence3 },
      { key: "activity", label: "Moderate activity", type: "number", unit: "days/week", required: true, min: 0, max: 7, absence: absence3 },
      { key: "sleep", label: "Sleep", type: "number", unit: "hours/night", required: false, min: 2, max: 14, absence: absence3 },
    ] },
  { id: "blk-cvhist", name: "Cardiovascular history", version: "1.0", summary: "Personal and family history with conditional follow-up questions.", approvedBy: "Clinical Review",
    fields: [
      { key: "famCvd", label: "Family history of heart disease before age 60", type: "boolean", required: true, absence: absence3 },
      { key: "chestPain", label: "Chest pain or tightness on exertion", type: "boolean", required: true, absence: absence3 },
      { key: "chestPainFreq", label: "How often", type: "choice", options: ["Rarely", "Monthly", "Weekly", "Daily"], required: true, showIf: { key: "chestPain", equals: true }, absence: ["missing"] },
      { key: "palpitations", label: "Palpitations", type: "boolean", required: false, absence: absence3 },
    ] },
  { id: "blk-diabetes", name: "Diabetes", version: "1.0", summary: "Known diabetes and symptom questions.", approvedBy: "Clinical Review",
    fields: [
      { key: "knownDiabetes", label: "Diagnosed diabetes", type: "boolean", required: true, absence: absence3 },
      { key: "diabetesType", label: "Type", type: "choice", options: ["Type 1", "Type 2", "Other"], required: true, showIf: { key: "knownDiabetes", equals: true }, absence: ["missing"] },
      { key: "famDiabetes", label: "Family history of diabetes", type: "boolean", required: false, absence: absence3 },
    ] },
  { id: "blk-ecg", name: "ECG", version: "1.0", summary: "Resting 12-lead ECG record. Interpretation stays with the clinician.", approvedBy: "Clinical Review",
    fields: [
      { key: "ecgDone", label: "ECG performed", type: "choice", options: ["Yes", "No", "Declined"], required: true, absence: ["missing"] },
      { key: "ecgRate", label: "Heart rate", type: "number", unit: "bpm", required: false, min: 20, max: 250, showIf: { key: "ecgDone", equals: "Yes" }, absence: ["missing"] },
    ] },
  { id: "blk-urine", name: "Urine", version: "1.0", summary: "Point-of-care dipstick.", approvedBy: "Clinical Review",
    fields: [
      { key: "urineProtein", label: "Protein", type: "choice", options: ["Negative", "Trace", "+", "++", "+++"], required: true, absence: absence3 },
      { key: "urineGlucose", label: "Glucose", type: "choice", options: ["Negative", "Trace", "+", "++", "+++"], required: true, absence: absence3 },
      { key: "urineBlood", label: "Blood", type: "choice", options: ["Negative", "Trace", "+", "++", "+++"], required: true, absence: absence3 },
    ] },
  { id: "blk-bloodpanel", name: "Blood panel selection", version: "1.3", summary: "Core panel (lipids and HbA1c) and optional add-ons, each with its specimen.", approvedBy: "Clinical Review",
    fields: [
      { key: "panelCore", label: "Core panel (TC, HDL, LDL, TG, HbA1c)", type: "boolean", required: true, absence: ["missing"] },
      { key: "addVitD", label: "Add-on: Vitamin D (25-OH)", type: "boolean", required: false, absence: ["missing"] },
      { key: "addFerritin", label: "Add-on: Ferritin", type: "boolean", required: false, absence: ["missing"] },
    ] },
  { id: "blk-cancer", name: "Cancer questions", version: "1.0", summary: "Clinically approved symptom and family history questions.", approvedBy: "Clinical Review",
    fields: [
      { key: "famCancer", label: "Close relative with cancer before age 50", type: "boolean", required: true, absence: absence3 },
      { key: "famCancerType", label: "Type, if known", type: "text", required: false, showIf: { key: "famCancer", equals: true }, absence: ["missing"] },
      { key: "skinChange", label: "New or changing skin lesion", type: "boolean", required: true, absence: absence3 },
    ] },
];

const ref = (blockId: string, version: string, required = true) => ({ blockId, version, required });
const NOW0 = "2026-09-01T09:00:00.000Z";
export const FORM_TEMPLATES: FormTemplate[] = [
  { id: "tpl-comprehensive-lab", name: "Comprehensive (LAB) Screen V2", kind: "screening",
    purpose: "Nurse form, questionnaire and blood panel for employer screening programmes.", currentVersion: "2.0",
    versions: [
      { version: "1.0", status: "retired", createdAt: "2026-03-02T09:00:00.000Z", createdBy: "neil", publishedAt: "2026-03-05T09:00:00.000Z", note: "Initial template.",
        blocks: [ref("blk-anthro", "1.0"), ref("blk-bp", "1.1"), ref("blk-lifestyle", "1.0"), ref("blk-bloodpanel", "1.0")] },
      { version: "2.0", status: "published", createdAt: NOW0, createdBy: "neil", publishedAt: "2026-09-04T09:00:00.000Z", note: "Current template used by all three programmes.",
        blocks: [ref("blk-anthro", "1.1"), ref("blk-bp", "1.2"), ref("blk-lifestyle", "2.0"), ref("blk-cvhist", "1.0"), ref("blk-diabetes", "1.0"), ref("blk-urine", "1.0"), ref("blk-bloodpanel", "1.3"), ref("blk-cancer", "1.0", false)] },
    ] },
  { id: "tpl-cardiovascular", name: "Cardiovascular Screen", kind: "screening",
    purpose: "Cardiovascular risk questions, blood pressure, ECG and blood panel.", currentVersion: "1.4",
    versions: [
      { version: "1.4", status: "published", createdAt: NOW0, createdBy: "neil", publishedAt: "2026-09-04T09:00:00.000Z", note: "Shares Blood Pressure 1.2 with the other cardiac templates.",
        blocks: [ref("blk-anthro", "1.1"), ref("blk-bp", "1.2"), ref("blk-lifestyle", "2.0"), ref("blk-cvhist", "1.0"), ref("blk-ecg", "1.0"), ref("blk-bloodpanel", "1.3")] },
    ] },
  { id: "tpl-sports-cardiac", name: "Sports Cardiac Screen", kind: "screening",
    purpose: "Pre-participation cardiac screen.", currentVersion: "1.1",
    versions: [
      { version: "1.1", status: "published", createdAt: NOW0, createdBy: "neil", publishedAt: "2026-09-04T09:00:00.000Z", note: "Shares Blood Pressure 1.2 with the other cardiac templates.",
        blocks: [ref("blk-anthro", "1.1"), ref("blk-bp", "1.2"), ref("blk-cvhist", "1.0"), ref("blk-ecg", "1.0")] },
    ] },
  { id: "tpl-skin", name: "Skin Screening", kind: "screening",
    purpose: "Skin screening questionnaire and clinically approved cancer questions.", currentVersion: "1.0",
    versions: [
      { version: "1.0", status: "published", createdAt: NOW0, createdBy: "liz", publishedAt: "2026-09-10T09:00:00.000Z", note: "Initial template.",
        blocks: [ref("blk-lifestyle", "2.0"), ref("blk-cancer", "1.0")] },
      { version: "1.1", status: "pending_approval", createdAt: "2026-10-02T14:20:00.000Z", createdBy: "liz", publishedAt: null, note: "Draft: adds Anthropometrics 1.1 for height and weight context.",
        blocks: [ref("blk-anthro", "1.1"), ref("blk-lifestyle", "2.0"), ref("blk-cancer", "1.0")] },
    ] },
  { id: "tpl-flu-booking", name: "Flu Vaccination Booking", kind: "service",
    purpose: "Scheduling template only. Reuses the booking pattern. No vaccination administration module.", currentVersion: "1.0",
    versions: [{ version: "1.0", status: "published", createdAt: NOW0, createdBy: "brenda", publishedAt: "2026-09-12T09:00:00.000Z", note: "Scheduling only.", blocks: [] }] },
  { id: "tpl-training-booking", name: "Training Booking", kind: "service",
    purpose: "Scheduling template only. Reuses the booking pattern. No training certification module.", currentVersion: "1.0",
    versions: [{ version: "1.0", status: "published", createdAt: NOW0, createdBy: "brenda", publishedAt: "2026-09-12T09:00:00.000Z", note: "Scheduling only.", blocks: [] }] },
];

/* ---- stories ---- */
export const STORY_DEFS: Story[] = [
  { id: "ST-01", title: "Laboratory identity exceptions", ownerId: "brenda", secondaryOwnerId: "neil", dueAt: "2026-10-05T09:00:00.000Z", clinical: false, agentId: "lab",
    summary: "Held rows from the Eurofins batch need explicit human identity resolution. Clinical review follows resolution." },
  { id: "ST-02", title: "Reports waiting for clinician review", ownerId: "neil", secondaryOwnerId: null, dueAt: null, clinical: true, agentId: "briefing",
    summary: "Completed screening work waiting for individual clinician review and release." },
  { id: "ST-03", title: "IBM clinic capacity today", ownerId: "stephen", secondaryOwnerId: "brenda", dueAt: "2026-10-05T10:00:00.000Z", clinical: false, agentId: "booking",
    summary: "Available capacity at today's IBM clinic and incomplete questionnaires that block confirmed bookings." },
  { id: "ST-04", title: "Urgent clinical follow-up", ownerId: "neil", secondaryOwnerId: null, dueAt: "2026-10-05T08:00:00.000Z", clinical: true, agentId: null,
    summary: "Clinician-assigned contact due at 09:00 today. An email delivery cannot close it." },
  { id: "ST-05", title: "Failed appointment reminders", ownerId: "brenda", secondaryOwnerId: null, dueAt: "2026-10-05T07:45:00.000Z", clinical: false, agentId: "watchdog",
    summary: "Reminders that failed delivery for today's confirmed appointments." },
  { id: "ST-06", title: "Sisk employer report disclosure review", ownerId: "martina", secondaryOwnerId: "neil", dueAt: "2026-10-06T11:00:00.000Z", clinical: false, agentId: "reporting",
    summary: "Employer output needs disclosure review and clinician-approved narrative before export." },
];

/* ---- agents ---- */
export const AGENT_DEFS: AgentDef[] = [
  { id: "briefing", name: "Briefing", job: "Summarises the day and open stories using shared counts. Role-scoped, with a link behind every claim.",
    scope: ["Programme and clinic counts", "Queue sizes", "Task and approval status"], mayDo: ["Summarise open stories", "Link each claim to its queue"],
    mayNotDo: ["Read clinical values for operations roles", "Release or change any record"], optional: false, shape: "crown-pebble", tint: "#191c1f" },
  { id: "watchdog", name: "Ops Watchdog", job: "Detects resource conflicts, capacity gaps, late operational tasks and failed jobs.",
    scope: ["Sessions and assignments", "Capacity", "Reminder delivery", "Scheduled jobs"], mayDo: ["Flag nurse overlaps", "Flag failed reminders and late tasks"],
    mayNotDo: ["Triage a medical result", "Cancel appointments"], optional: false, shape: "shield", tint: "#2b1b1e" },
  { id: "booking", name: "Booking Coordinator", job: "Prepares eligibility-based invitation and reminder drafts and capacity actions.",
    scope: ["Invitations and eligibility", "Questionnaire completion status", "Available slots"], mayDo: ["Draft invitation lists", "Propose capacity actions"],
    mayNotDo: ["Send without human confirmation", "Cancel an appointment on its own"], optional: false, shape: "offset-pebble", tint: "#16241f" },
  { id: "lab", name: "Lab Reconciliation", job: "Prepares column mappings and explains validation exceptions for laboratory imports.",
    scope: ["Import batches", "Row validation results", "Minimal identity fields"], mayDo: ["Map columns", "Explain why a row was held"],
    mayNotDo: ["Fuzzy-match a person", "Resolve conflicting identifiers", "Commit clinical data without the authorised workflow"], optional: false, shape: "control-cube", tint: "#1b2430" },
  { id: "drafting", name: "Clinical Drafting", job: "Optional P1 preview. Drafts advice wording from a selected fictional episode and approved content.",
    scope: ["Selected fictional episode", "Approved advice content"], mayDo: ["Draft advice for the clinician to edit and approve"],
    mayNotDo: ["Diagnose", "Invent measurements", "Decide urgency", "Release a report"], optional: true, shape: "glass-visor", tint: "#241b2e" },
  { id: "reporting", name: "Programme Reporting", job: "Prepares charts and narrative from the disclosure-controlled aggregate snapshot.",
    scope: ["Aggregate snapshot only", "Methodology and denominators"], mayDo: ["Draft a narrative from approved aggregates", "Explain suppression"],
    mayNotDo: ["Access participant free text", "Expose a suppressed cell", "Approve its own draft"], optional: false, shape: "executive-capsule", tint: "#2a2118" },
  { id: "quality", name: "Data Quality", job: "Identifies missing units, stale template references, incompatible identifiers and inconsistent displayed flags.",
    scope: ["Observation display fields", "Template references", "Identifiers"], mayDo: ["Raise a data quality issue", "Point to the record"],
    mayNotDo: ["Invent replacement clinical thresholds", "Edit a result"], optional: false, shape: "precision-brow", tint: "#191c1f" },
];

/* ---- systems register: statuses are explicitly simulated or unconfirmed ---- */
export const INTEGRATIONS: IntegrationDef[] = [
  { id: "jotform", name: "Jotform", purpose: "Existing booking, nurse-data and report-related forms, with prefilled links between steps.",
    boundary: "Form submissions and prefilled link fields. Staff perform the manual handoffs today.", statusLabel: "Existing source · demo import", tone: "info",
    note: "Pulse Forms and Templates replace the three separate forms. Permanent two-way synchronisation is not assumed in the agreed end state." },
  { id: "eurofins", name: "Eurofins CSV / FTP", purpose: "Current laboratory results source: an FTP-accessible CSV from Eurofins in Dublin.",
    boundary: "Observation rows by specimen. No clinical values leave Pulse.", statusLabel: "CSV reconciliation demonstrated; automated retrieval to confirm", tone: "warn",
    note: "Transport is FTP today. It is not described as SFTP and no live API is claimed. A direct API integration is a later option." },
  { id: "gworkspace", name: "Google Workspace", purpose: "Current location for result files and documents.",
    boundary: "File metadata only in this demo. No Drive contents are exposed.", statusLabel: "Existing source · simulated file events", tone: "info",
    note: "Files are held in Google Workspace today. Events here are simulated." },
  { id: "excel", name: "Excel", purpose: "Current calculation, screening classification and clinician review display.",
    boundary: "Legacy rules and classifications to convert into approved templates.", statusLabel: "Legacy rules to validate", tone: "warn",
    note: "No live spreadsheet connector. Legacy rules are to be validated by the clinical rule owner before any are carried over." },
  { id: "monday", name: "Monday.com", purpose: "Business operations and nurse coordination. Not the patient clinical record.",
    boundary: "Operational references only. Sample events never carry clinical values.", statusLabel: "Operational reference · integration to confirm", tone: "neutral",
    note: "Whether and how Monday.com connects to Pulse has not been agreed." },
  { id: "esendex", name: "Esendex", purpose: "SMS delivery service named in the current booking consent.",
    boundary: "Message text and verified mobile destinations. Clinical details never appear in SMS.", statusLabel: "Delivery simulation", tone: "info",
    note: "No messages are sent. Failed reminders and retry history are simulated." },
  { id: "email", name: "Email", purpose: "Notification channel for confirmations, reminders and report availability.",
    boundary: "Message text only. Report access is separate from delivery.", statusLabel: "Notification channel; production provider and transport to confirm", tone: "warn",
    note: "No Gmail API or Microsoft Graph connection is claimed. Google Workspace being used for files does not imply an email integration." },
  { id: "meddbase", name: "Meddbase", purpose: "Occupational-health platform identified on the public website.",
    boundary: "Outside this screening demo. No records, sync events or replacement promise.", statusLabel: "Existing separate system · outside this screening demo integration scope", tone: "neutral",
    note: "Its replacement or integration has not been agreed for this project." },
];

export const GOVERNANCE_ITEMS: GovernanceItem[] = [
  { id: "gov-hosting", group: "hosting", title: "EU hosting for production data", detail: "Proposed requirement in the supplier brief. Hosting region and provider are not yet chosen.", status: "required", owner: null },
  { id: "gov-processors", group: "hosting", title: "Processor and sub-processor list", detail: "Laboratory, SMS and hosting suppliers to be listed with their data flows.", status: "to_confirm", owner: null },
  { id: "gov-retention", group: "retention", title: "Retention period for screening records", detail: "Awaiting client approval. The existing booking consent mentions a two-year period. It is flagged for review and not hard-coded into future records.", status: "awaiting_client", owner: null },
  { id: "gov-access", group: "access", title: "Quarterly access review register", detail: "A sample register entry shows who can see what. It is illustrative, not a completed review.", status: "sample_evidence", owner: null },
  { id: "gov-rules", group: "clinical_rules", title: "Clinical rule owner", detail: "Who approves classification limits and advice content. Illustrative display limits in this demo are not validated.", status: "to_confirm", owner: null },
  { id: "gov-forms", group: "forms", title: "Form version history", detail: "Every published and draft template version is listed in Programmes, Forms and Templates.", status: "sample_evidence", owner: "Clinical Review" },
  { id: "gov-dpia", group: "dpia", title: "Data protection impact assessment", detail: "A DPIA is required before production use. None has been completed for this prototype.", status: "required", owner: null },
  { id: "gov-assurance", group: "dpia", title: "Security assurance evidence pack", detail: "Corporate client security review is the first hurdle named by the client. Evidence must cover each supplier and data flow.", status: "required", owner: null },
  { id: "gov-pentest", group: "security", title: "Independent security testing", detail: "Not started. This prototype has not been independently tested.", status: "not_started", owner: null },
  { id: "gov-vuln", group: "security", title: "Vulnerability management process", detail: "Patching cadence and disclosure route to be defined with the hosting supplier.", status: "to_confirm", owner: null },
];

export const GOVERNANCE_STATUS_LABEL: Record<GovernanceItem["status"], string> = {
  required: "Required",
  to_confirm: "To confirm",
  sample_evidence: "Sample evidence",
  not_started: "Not started",
  awaiting_client: "Awaiting client approval",
};

export const PLANNING_ASSUMPTIONS = [
  { label: "Annual participant accounts", value: "20,000 (provisional sizing assumption from the supplier brief)" },
  { label: "Peak concurrent users", value: "To confirm" },
  { label: "Annual patient throughput", value: "Not supplied. Not modelled." },
  { label: "Total headcount", value: "Not supplied. The eight profiles are a demonstration roster only." },
];

/* ---- name pools for deterministic synthetic people ---- */
export const FIRST_NAMES_F = ["Aoife", "Siobhán", "Róisín", "Gráinne", "Sinéad", "Caoimhe", "Sorcha", "Éabha", "Clodagh", "Deirdre", "Eimear", "Fionnuala", "Grace", "Hannah", "Isobel", "Jennifer", "Karen", "Laura", "Maria", "Nora", "Orlaith", "Patricia", "Rachel", "Sarah", "Tara", "Úna", "Vivienne", "Yvonne", "Zoe", "Bridget", "Catherine", "Dervla", "Emer", "Gemma", "Helen", "Ita", "Joanne", "Kathleen", "Lisa", "Mary", "Nuala", "Olivia", "Paula", "Rebecca", "Sheila", "Teresa", "Valerie", "Áine", "Blathnaid", "Cliona", "Denise", "Edel", "Finola", "Lorna", "Megan", "Noreen", "Pauline", "Sadhbh", "Tríona", "Wendy"];
export const FIRST_NAMES_M = ["Seán", "Cian", "Conor", "Darragh", "Eoghan", "Fergal", "Cathal", "Donal", "Eamon", "Finn", "Gearóid", "Hugh", "Ivan", "Jack", "Kevin", "Liam", "Michael", "Niall", "Oisín", "Pádraig", "Shane", "Tadhg", "Vincent", "William", "Aidan", "Barry", "Colm", "Declan", "Enda", "Fintan", "Gerard", "Henry", "John", "Kieran", "Lorcan", "Martin", "Noel", "Oliver", "Paul", "Rory", "Thomas", "Alan", "Brian", "Damien", "Edmund", "Frank", "Greg", "Ivor", "James", "Keith", "Leo", "Mark", "Nicholas", "Owen", "Peter", "Ruairí", "Stephen", "Tom", "Vinny"];
export const SURNAMES = ["Murphy", "Walsh", "O'Brien", "Byrne", "O'Sullivan", "McCarthy", "Gallagher", "Doherty", "Kennedy", "Lynch", "Murray", "Quinn", "Moore", "McLoughlin", "O'Connor", "Clarke", "Johnston", "Hughes", "O'Donnell", "Gordon", "Doyle", "Brady", "Fitzgerald", "Mooney", "Healy", "Farrell", "Burke", "Duffy", "Kavanagh", "Keane", "Nolan", "Dunne", "Whelan", "Foley", "Reilly", "Flood", "Cullen", "Maguire", "Hayes", "Fahey", "Egan", "Cahill", "Delaney", "Devlin", "Dillon", "Donovan", "Dwyer", "Ennis", "Finnegan", "Gleeson", "Griffin", "Hanley", "Hennessy", "Kearney", "Lawlor", "Lennon", "Mahon", "Malone", "McDonagh", "Moran", "Mulcahy", "Neville", "O'Neill", "O'Reilly", "Phelan", "Power", "Regan", "Rooney", "Scully", "Sheridan", "Slattery", "Tierney", "Travers", "Treacy", "Vaughan", "Wall", "Ward", "Cassidy", "Coffey", "Connolly", "Costigan", "Crowley", "Curran", "Daly", "Dalton", "Hogan", "Kiely", "Larkin", "Madden", "Naughton", "O'Dwyer", "Ryan", "Sweeney", "Teehan", "Whyte", "Hickey", "Lyons"];
/** Names reserved for named cases and staff, never generated at random. */
export const RESERVED_FULL_NAMES = ["Aisling Byrne", "Ciara Doyle", "Maeve Ryan", "Dara Quinn", "Ronan Walsh", "Niamh Keane", "Eoin Daly", "Orla Kavanagh", "Neil Reddy", "Stephen Kelly", "Liz Bawle", "Fiona Fenton", "Anita Mulhere", "Ian Murtagh", "Martina Beattie", "Brenda Madden"];

export const QUESTIONNAIRE_SECTIONS = [
  { key: "about", title: "About you" },
  { key: "lifestyle", title: "Lifestyle" },
  { key: "heart", title: "Heart health" },
  { key: "family", title: "Family history" },
  { key: "medication", title: "Medication and allergies" },
];
