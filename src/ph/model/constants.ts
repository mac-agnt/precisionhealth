/* Static reference data for the Precision Health demo: roster, programmes, forms,
   permissions, systems register, agents. Public staff names and roles come from the
   company website. Everything operational is a fictional demo fixture. */
import type {
  AgentDef, Analyte, AnalyteCode, AnalyteGroup, AnalyteRange, AppointmentType, Band, Company, Contact, FormBlock, FormTemplate, GovernanceItem,
  HoldKind, IntegrationDef, Perm, Programme, ProgrammeId, RangeBound, ReportState, Resource, RoleKey, SexRecorded, Staff, StaffId, Story, Team,
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
  logoDarkPath: "/brand/precision-health-logo-dark.png",
  logoLightPath: "/brand/precision-health-logo-light.png",
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

/* ---- laboratory analytes: illustrative rule set, clinician-owned ---- */
/** Shown wherever a band, flag word or range is displayed. */
export const RULE_SET_LABEL = "Illustrative rule set v0.1. Clinician-owned. To be replaced by Precision Health's approved rules.";

type Bound = RangeBound;
const lt = (hi: number, text: string): Bound => ({ hi, hiIncl: false, text: `<${text}` });
const gt = (lo: number, text: string): Bound => ({ lo, loIncl: false, text: `>${text}` });
const between = (lo: number, hi: number, text: string): Bound => ({ lo, loIncl: true, hi, hiIncl: true, text });
/** One analyte. The limit field keeps the older single-limit shape for screens that still read it. */
function analyte(code: AnalyteCode, o: {
  name: string; reportName?: string; unit: string; decimals: number; group: AnalyteGroup; range: AnalyteRange;
  calculated?: Analyte["calculated"]; qualitative?: Analyte["qualitative"]; conditional?: Analyte["conditional"]; illustrativeRange?: boolean; bandNote?: string;
}): Analyte {
  const b = o.range.all || o.range.male || (o.range.byAge && o.range.byAge[0].range) || { text: o.range.text };
  const kind: Analyte["limit"]["kind"] = b.lo !== undefined && b.hi !== undefined ? "range" : b.lo !== undefined ? "min" : "max";
  const value = kind === "min" ? b.lo! : b.hi ?? 0;
  return {
    code, name: o.name, reportName: o.reportName || o.name, unit: o.unit, decimals: o.decimals, group: o.group, range: o.range,
    limit: { kind, value, text: o.range.all ? o.range.all.text : o.range.text },
    addOn: !!o.conditional, calculated: o.calculated || null, qualitative: o.qualitative || null, conditional: o.conditional || null,
    illustrativeRange: !!o.illustrativeRange, bandNote: o.bandNote || null,
  };
}

/**
 * The Comprehensive (LAB) panel with the ranges from Precision Health's sample report. Ranges marked
 * illustrativeRange are placeholders where the client material gives none. Sample content, not a
 * validated threshold library. Interpretation is clinician-owned.
 */
export const ANALYTES: Record<AnalyteCode, Analyte> = {
  TC: analyte("TC", { name: "Total cholesterol", reportName: "Total Cholesterol", unit: "mmol/L", decimals: 1, group: "cholesterol", range: { all: lt(5.0, "5.0"), text: "less than 5.0" }, bandNote: "5.0 to 6.0 borderline, above 6.0 abnormal" }),
  HDL: analyte("HDL", { name: "HDL cholesterol", reportName: "HDL Cholesterol", unit: "mmol/L", decimals: 1, group: "cholesterol", range: { all: gt(1.0, "1.0"), text: "more than 1.0" }, bandNote: "0.9 to 1.0 borderline, below 0.9 abnormal" }),
  LDL: analyte("LDL", { name: "LDL cholesterol", reportName: "LDL Cholesterol", unit: "mmol/L", decimals: 1, group: "cholesterol", range: { all: lt(3.0, "3.0"), text: "less than 3.0" } }),
  NONHDL: analyte("NONHDL", { name: "Non-HDL cholesterol", reportName: "Non-HDL Cholesterol", unit: "mmol/L", decimals: 1, group: "cholesterol", range: { all: lt(3.8, "3.8"), text: "less than 3.8" },
    calculated: { from: ["TC", "HDL"], method: "Total cholesterol minus HDL cholesterol" } }),
  TG: analyte("TG", { name: "Triglycerides", unit: "mmol/L", decimals: 1, group: "cholesterol", range: { all: lt(2.0, "2.0"), text: "less than 2.0" } }),
  TCHDL: analyte("TCHDL", { name: "Total:HDL cholesterol ratio", reportName: "Total:HDL Cholesterol", unit: "ratio", decimals: 2, group: "cholesterol", range: { all: lt(4.0, "4.0"), text: "less than 4:1" },
    calculated: { from: ["TC", "HDL"], method: "Total cholesterol divided by HDL cholesterol" } }),
  HBA1C: analyte("HBA1C", { name: "HbA1c", reportName: "HbA1c", unit: "mmol/mol", decimals: 0, group: "glucose", range: { all: lt(48, "48"), text: "less than 48" }, bandNote: "42 to 47 higher risk, 48 or more raised" }),
  HB: analyte("HB", { name: "Haemoglobin", unit: "g/dL", decimals: 1, group: "fbc", range: { male: between(13, 17, "13-17"), female: between(12, 16, "12-16"), text: "13-17 (m) / 12-16 (f)" } }),
  WCC: analyte("WCC", { name: "White cell count", reportName: "White Cell Count", unit: "x10^9/L", decimals: 1, group: "fbc", range: { all: between(3.5, 10, "3.5-10"), text: "3.5-10" } }),
  PLT: analyte("PLT", { name: "Platelets", unit: "x10^9/L", decimals: 0, group: "fbc", range: { all: between(150, 410, "150-410"), text: "150-410" } }),
  BILI: analyte("BILI", { name: "Bilirubin", unit: "umol/L", decimals: 1, group: "liver", range: { all: lt(24, "24"), text: "less than 24" } }),
  TPROT: analyte("TPROT", { name: "Total protein", reportName: "Total Protein", unit: "g/L", decimals: 0, group: "liver", range: { all: between(60, 83, "60-83"), text: "60-83" } }),
  ALP: analyte("ALP", { name: "Alkaline phosphatase", reportName: "Alkaline Phosphatase", unit: "U/L", decimals: 0, group: "liver", range: { all: between(30, 130, "30-130"), text: "30-130" }, illustrativeRange: true }),
  GGT: analyte("GGT", { name: "Gamma-GT", unit: "U/L", decimals: 0, group: "liver", range: { all: lt(55, "55"), text: "less than 55" } }),
  AST: analyte("AST", { name: "AST", reportName: "Aspartate Transferase", unit: "U/L", decimals: 0, group: "liver", range: { all: lt(34, "34"), text: "less than 34" } }),
  ALT: analyte("ALT", { name: "ALT", reportName: "Alanine Transferase", unit: "U/L", decimals: 0, group: "liver", range: { all: lt(45, "45"), text: "less than 45" } }),
  UREA: analyte("UREA", { name: "Urea", unit: "mmol/L", decimals: 1, group: "kidney", range: { all: lt(8, "8"), text: "less than 8" } }),
  CREAT: analyte("CREAT", { name: "Creatinine", unit: "umol/L", decimals: 0, group: "kidney", range: { all: lt(106, "106"), text: "less than 106" } }),
  URATE: analyte("URATE", { name: "Uric acid", reportName: "Uric Acid", unit: "umol/L", decimals: 0, group: "kidney", range: { all: between(220, 450, "220-450"), text: "220-450" } }),
  FERR: analyte("FERR", { name: "Ferritin", unit: "ug/L", decimals: 0, group: "iron", range: { male: between(15, 200, "15-200"), female: between(15, 150, "15-150"), text: "15-200 (m) / 15-150 (f)" } }),
  IRON: analyte("IRON", { name: "Iron", unit: "umol/L", decimals: 1, group: "iron", range: { all: between(9.0, 30.4, "9.0-30.4"), text: "9.0-30.4" } }),
  TIBC: analyte("TIBC", { name: "Total iron binding capacity", reportName: "Total Iron Binding Capacity (TIBC)", unit: "umol/L", decimals: 1, group: "iron", range: { all: between(44, 76, "44-76"), text: "44-76" } }),
  FT4: analyte("FT4", { name: "Free T4", unit: "pmol/L", decimals: 1, group: "thyroid", range: { all: between(9, 19, "9-19"), text: "9-19" } }),
  TSH: analyte("TSH", { name: "TSH", unit: "mIU/L", decimals: 2, group: "thyroid", range: { all: between(0.35, 4.94, "0.35-4.94"), text: "0.35-4.94" } }),
  VITD: analyte("VITD", { name: "Vitamin D (25-OH)", reportName: "Vitamin D", unit: "nmol/L", decimals: 0, group: "vitamins_minerals", range: { all: gt(50, "50"), text: "more than 50" } }),
  B12: analyte("B12", { name: "Vitamin B12", unit: "ng/L", decimals: 0, group: "vitamins_minerals", range: { all: gt(200, "200"), text: "more than 200" }, illustrativeRange: true }),
  FOLATE: analyte("FOLATE", { name: "Folate (folic acid)", reportName: "Folic Acid", unit: "ug/L", decimals: 1, group: "vitamins_minerals", range: { all: gt(3.9, "3.9"), text: "more than 3.9" }, illustrativeRange: true }),
  CA: analyte("CA", { name: "Adjusted calcium", reportName: "Adjusted Calcium", unit: "mmol/L", decimals: 2, group: "vitamins_minerals", range: { all: between(2.2, 2.6, "2.2-2.6"), text: "2.2-2.6" } }),
  MG: analyte("MG", { name: "Magnesium", unit: "mmol/L", decimals: 2, group: "vitamins_minerals", range: { all: between(0.7, 1.0, "0.7-1.0"), text: "0.7-1.0" } }),
  PO4: analyte("PO4", { name: "Phosphate", unit: "mmol/L", decimals: 2, group: "vitamins_minerals", range: { all: between(0.8, 1.5, "0.8-1.5"), text: "0.8-1.5" } }),
  PSA: analyte("PSA", { name: "PSA (total)", reportName: "PSA", unit: "ug/L", decimals: 2, group: "cancer", conditional: "psa_taken",
    range: {
      byAge: [
        { minAge: 0, maxAge: 50, range: lt(2, "2") }, { minAge: 50, maxAge: 60, range: lt(3, "3") },
        { minAge: 60, maxAge: 70, range: lt(4, "4") }, { minAge: 70, maxAge: null, range: lt(5, "5") },
      ],
      text: "under 50 years <2; 50-60 years <3; 60-70 years <4; over 70 years <5",
    } }),
  FIT: analyte("FIT", { name: "FIT (bowel screening)", reportName: "FIT result", unit: "", decimals: 0, group: "cancer", conditional: "fit_given",
    qualitative: { normal: "Negative", abnormal: "Positive" }, range: { text: "Negative" } }),
};
/** The lipid and HbA1c rows of the baseline Eurofins batch. */
export const CORE_PANEL: AnalyteCode[] = ["TC", "HDL", "LDL", "TG", "HBA1C"];
/** Conditional tests: PSA when taken, FIT when a kit was given. */
export const ADD_ON_PANEL: AnalyteCode[] = ["PSA", "FIT"];
/** Calculated in Pulse from total and HDL cholesterol. Not laboratory rows and never expected tests. */
export const CALCULATED_ANALYTES: AnalyteCode[] = ["NONHDL", "TCHDL"];
/** Every laboratory-delivered test on the Comprehensive (LAB) panel, in report order. PSA and FIT are added per episode. */
export const COMPREHENSIVE_PANEL: AnalyteCode[] = [
  "TC", "HDL", "LDL", "TG", "HBA1C", "UREA", "CREAT", "URATE", "HB", "WCC", "PLT", "BILI", "TPROT", "ALP", "GGT", "AST", "ALT",
  "FT4", "TSH", "IRON", "FERR", "TIBC", "VITD", "B12", "FOLATE", "CA", "MG", "PO4",
];
/** The Comprehensive panel minus the lipid and HbA1c rows: what the separate extended batch delivers. */
export const EXTENDED_PANEL: AnalyteCode[] = COMPREHENSIVE_PANEL.filter((c) => !CORE_PANEL.includes(c));
/** Laboratory panel per form template. Every programme in the demo uses the Comprehensive (LAB) screen. */
export const PANEL_BY_TEMPLATE: Record<string, AnalyteCode[]> = { "tpl-comprehensive-lab": COMPREHENSIVE_PANEL, "tpl-cardiovascular": COMPREHENSIVE_PANEL };
/** Expected laboratory tests for an episode: the template's panel plus PSA and FIT when the nurse form says so. */
export function expectedPanel(templateId: string, o: { psaTaken: boolean; fitGiven: boolean }): AnalyteCode[] {
  const base = PANEL_BY_TEMPLATE[templateId] || COMPREHENSIVE_PANEL;
  return base.concat(o.psaTaken ? ["PSA"] : [], o.fitGiven ? ["FIT"] : []);
}
export const ANALYTE_GROUPS: Array<{ key: AnalyteGroup; title: string }> = [
  { key: "cholesterol", title: "Cholesterol" },
  { key: "glucose", title: "Blood sugar (HbA1c)" },
  { key: "kidney", title: "Kidney function" },
  { key: "fbc", title: "Full blood count" },
  { key: "liver", title: "Liver function" },
  { key: "thyroid", title: "Thyroid function" },
  { key: "iron", title: "Iron and ferritin" },
  { key: "vitamins_minerals", title: "Vitamins and minerals" },
  { key: "cancer", title: "Cancer screening" },
];
export const LIMITS_DISCLAIMER =
  "Illustrative display limits for demonstration. Sample content, not a validated clinical threshold library. Interpretation is clinician-owned.";
/** Blood pressure at or above this is Raised in the participant report table. Borderline starts at 120/80. */
export const BP_REVIEW_LIMIT = { sys: 140, dia: 90, text: "<140/90" };

/* ---- bands and report flag words ---- */
/** Sex and age at collection. Sex-specific and age-specific ranges need both. */
export interface BandCtx { sex: SexRecorded; age: number }
export type BandDirection = "high" | "low" | null;
export type ReportFlagWord =
  | "NORMAL" | "BORDERLINE" | "RAISED" | "LOW" | "HIGHER RISK" | "NEGATIVE" | "POSITIVE" | "NOT TESTED"
  | "IDEAL" | "SIGNIFICANTLY RAISED" | "IMMEDIATE TREATMENT"
  | "UNDERWEIGHT" | "OVERWEIGHT" | "OBESE" | "ABNORMAL" | "MILD";
const DEFAULT_CTX: BandCtx = { sex: "not_recorded", age: 40 };
const EPS = 1e-9;

/**
 * The reference interval that applies to this person. When sex is not recorded the stricter
 * overlap of the male and female ranges applies, so a value is never called normal by default.
 */
export function rangeFor(code: AnalyteCode, ctx: BandCtx = DEFAULT_CTX): RangeBound | null {
  const r = ANALYTES[code].range;
  if (r.byAge) return (r.byAge.find((x) => ctx.age >= x.minAge && (x.maxAge === null || ctx.age < x.maxAge)) || r.byAge[r.byAge.length - 1]).range;
  if (r.all) return r.all;
  if (r.male && r.female) {
    if (ctx.sex === "male") return r.male;
    if (ctx.sex === "female") return r.female;
    const lo = Math.max(r.male.lo ?? -Infinity, r.female.lo ?? -Infinity), hi = Math.min(r.male.hi ?? Infinity, r.female.hi ?? Infinity);
    return { lo, loIncl: true, hi, hiIncl: true, text: `${lo}-${hi}` };
  }
  return null;
}
/** The range in compact form for this person, for example "<3.0", "13-17" or "<3" for PSA at 55. */
export function limitTextFor(code: AnalyteCode, ctx: BandCtx = DEFAULT_CTX): string {
  const a = ANALYTES[code];
  if (a.qualitative) return a.qualitative.normal;
  return rangeFor(code, ctx)?.text || a.range.text;
}
/** The range in the participant report's words for this person: "less than 3.0", "more than 1.0", "13-17 (male)". */
export function rangeTextFor(code: AnalyteCode, ctx: BandCtx = DEFAULT_CTX): string {
  const a = ANALYTES[code];
  if (a.qualitative) return a.qualitative.normal;
  if (code === "TCHDL") return a.range.text;
  const b = rangeFor(code, ctx);
  if (!b) return a.range.text;
  const words = b.text.startsWith("<") ? `less than ${b.text.slice(1)}` : b.text.startsWith(">") ? `more than ${b.text.slice(1)}` : b.text;
  if (a.range.male && a.range.female) return ctx.sex === "male" ? `${words} (male)` : ctx.sex === "female" ? `${words} (female)` : `${a.range.text}. Sex not recorded: ${words} applied`;
  if (a.range.byAge) return `${words} (age ${ctx.age})`;
  return words;
}

function genericBand(b: RangeBound, v: number): { band: Band; direction: BandDirection } {
  const below = b.lo !== undefined && (b.loIncl ? v < b.lo - EPS : v <= b.lo + EPS);
  const above = b.hi !== undefined && (b.hiIncl ? v > b.hi + EPS : v >= b.hi - EPS);
  if (!below && !above) return { band: "normal", direction: null };
  if (above) return { band: v <= b.hi! * 1.1 + EPS ? "borderline" : "abnormal", direction: "high" };
  return { band: v >= b.lo! * 0.9 - EPS ? "borderline" : "abnormal", direction: "low" };
}

/**
 * Band and direction for one result under the illustrative rule set: borderline is outside the range
 * by up to 10%, abnormal is further out. Analyte-specific rules: total cholesterol 5.0-6.0 borderline
 * and above 6.0 abnormal; HbA1c 42-47 borderline (higher risk) and 48 or more abnormal; HDL 0.9-1.0
 * borderline and below 0.9 abnormal. FIT: Negative normal, Positive abnormal.
 */
export function bandDetail(code: AnalyteCode, value: number | null | undefined, ctx: BandCtx = DEFAULT_CTX): { band: Band; direction: BandDirection } {
  if (value === null || value === undefined || !Number.isFinite(value)) return { band: "not_tested", direction: null };
  const a = ANALYTES[code];
  if (a.qualitative) return value >= 1 ? { band: "abnormal", direction: "high" } : { band: "normal", direction: null };
  if (code === "TC") return value < 5.0 - EPS ? { band: "normal", direction: null } : { band: value <= 6.0 + EPS ? "borderline" : "abnormal", direction: "high" };
  if (code === "HBA1C") return value < 42 - EPS ? { band: "normal", direction: null } : { band: value < 48 - EPS ? "borderline" : "abnormal", direction: "high" };
  if (code === "HDL") return value > 1.0 + EPS ? { band: "normal", direction: null } : { band: value >= 0.9 - EPS ? "borderline" : "abnormal", direction: "low" };
  const b = rangeFor(code, ctx);
  return b ? genericBand(b, value) : { band: "not_tested", direction: null };
}
export function bandFor(code: AnalyteCode, value: number | null | undefined, ctx: BandCtx = DEFAULT_CTX): Band {
  return bandDetail(code, value, ctx).band;
}
/** Review required exactly when the band is borderline or abnormal. */
export function flagFor(code: AnalyteCode, value: number, ctx: BandCtx = DEFAULT_CTX): "none" | "review_required" {
  const b = bandFor(code, value, ctx);
  return b === "borderline" || b === "abnormal" ? "review_required" : "none";
}
/** The participant report's word for a laboratory result: NORMAL, BORDERLINE, RAISED or LOW, with HbA1c and FIT wording. */
export function reportFlagWord(code: AnalyteCode, band: Band, direction: BandDirection = "high"): ReportFlagWord {
  if (band === "not_tested") return "NOT TESTED";
  if (ANALYTES[code].qualitative) return band === "normal" ? "NEGATIVE" : "POSITIVE";
  if (code === "HBA1C") return band === "normal" ? "NORMAL" : band === "borderline" ? "HIGHER RISK" : "RAISED";
  if (band === "normal") return "NORMAL";
  if (band === "borderline") return "BORDERLINE";
  return direction === "low" ? "LOW" : "RAISED";
}
/** Result text for display, with the analyte's decimals. Qualitative results show their word. */
export function formatResult(code: AnalyteCode, value: number, valueText?: string | null): string {
  const a = ANALYTES[code];
  if (a.qualitative) return valueText || (value >= 1 ? a.qualitative.abnormal : a.qualitative.normal);
  return value.toFixed(a.decimals);
}

/** The blood pressure significance table from the participant report. */
export const BP_SIGNIFICANCE: Array<{ reading: string; significance: string; word: ReportFlagWord; band: Band }> = [
  { reading: "Less than 120/80", significance: "Ideal", word: "IDEAL", band: "normal" },
  /* The clinician's viewer shows 128/86 green and the sample report words 139/84 "MILD":
     below 140/90 does not need individual review, so the band stays normal. */
  { reading: "120/80 to 140/90", significance: "Borderline", word: "MILD", band: "normal" },
  { reading: "140/90 to 160/100", significance: "Raised", word: "RAISED", band: "abnormal" },
  { reading: "160/100 to 180/110", significance: "Significantly raised", word: "SIGNIFICANTLY RAISED", band: "abnormal" },
  { reading: "More than 180/110", significance: "Immediate treatment", word: "IMMEDIATE TREATMENT", band: "abnormal" },
];
/** Blood pressure word and band. The higher of the systolic and diastolic categories applies. */
export function bpCategory(sys: number | null | undefined, dia: number | null | undefined): { word: ReportFlagWord; band: Band } {
  if (sys == null || dia == null || !Number.isFinite(sys) || !Number.isFinite(dia)) return { word: "NOT TESTED", band: "not_tested" };
  const level = (s: number, d: number) => (s >= 180 || d >= 110 ? 4 : s >= 160 || d >= 100 ? 3 : s >= 140 || d >= 90 ? 2 : s >= 120 || d >= 80 ? 1 : 0);
  const row = BP_SIGNIFICANCE[level(sys, dia)];
  return { word: row.word, band: row.band };
}
/** BMI word and band. Words follow the report (below 18 underweight, above 25 overweight, above 30 obese). Band: 10% outside 18-25 is borderline. */
export function bmiCategory(bmi: number | null | undefined): { word: ReportFlagWord; band: Band } {
  if (bmi == null || !Number.isFinite(bmi)) return { word: "NOT TESTED", band: "not_tested" };
  const word: ReportFlagWord = bmi < 18 ? "UNDERWEIGHT" : bmi <= 25 ? "NORMAL" : bmi <= 30 ? "OVERWEIGHT" : "OBESE";
  const band: Band = bmi >= 18 && bmi <= 25 ? "normal" : bmi > 25 ? (bmi <= 27.5 ? "borderline" : "abnormal") : bmi >= 16.2 ? "borderline" : "abnormal";
  return { word, band };
}
export const BMI_RANGE_TEXT = "18-25";
/** Waist: less than 80 cm (female), less than 90 cm (male). Sex not recorded uses the lower limit. Up to 10% over is borderline. */
export function waistCategory(cm: number | null | undefined, sex: SexRecorded): { word: ReportFlagWord; band: Band; limit: number } {
  const limit = sex === "male" ? 90 : 80;
  if (cm == null || !Number.isFinite(cm)) return { word: "NOT TESTED", band: "not_tested", limit };
  if (cm < limit) return { word: "NORMAL", band: "normal", limit };
  return cm <= limit * 1.1 ? { word: "BORDERLINE", band: "borderline", limit } : { word: "RAISED", band: "abnormal", limit };
}
export const WAIST_RANGE_TEXT = "Less than 80cm (Female) / Less than 90cm (Male)";
/** QRISK3 relative risk band: below 1.0 normal, 1.0 to 1.5 borderline, above 1.5 abnormal. */
export function relativeRiskBand(rr: number | null | undefined): Band {
  if (rr == null || !Number.isFinite(rr)) return "not_tested";
  return rr < 1.0 ? "normal" : rr <= 1.5 ? "borderline" : "abnormal";
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
/** Outcomes marked reached need at least one recorded attempt where the participant was spoken to. */
export const FOLLOW_UP_OUTCOMES: Array<{ code: string; label: string; reached: boolean }> = [
  { code: "reached_advice_given", label: "Reached participant, advice given", reached: true },
  { code: "appointment_arranged", label: "Reached participant, onward appointment arranged", reached: true },
  { code: "unable_to_reach_escalated", label: "Unable to reach after attempts, escalated per clinician", reached: false },
  { code: "declined_contact", label: "Participant declined further contact (documented)", reached: false },
];

/** Roles that can be the one booked nurse at a clinic session. Support resources are listed separately. */
export const NURSE_ROLE_KEYS: RoleKey[] = ["nursing_lead", "clinical_capture"];

/** Words that mark health information. Invitation messages must not contain them. */
export const HEALTH_INFO_PATTERN = /(result|diagnos|cholesterol|blood pressure)/i;

/** Columns of the bundled Eurofins CSV, in file order. Lab Reconciliation maps each one to a Pulse field. */
export const EUROFINS_CSV_COLUMNS = ["Specimen ID", "Surname and initial", "DOB", "Analyte", "Result", "Unit", "Result date"];
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
  { id: "blk-urine", name: "Urine", version: "1.0", summary: "Point-of-care dipstick, with the nurse form's options.", approvedBy: "Clinical Review",
    fields: [
      { key: "urineProtein", label: "Protein", type: "choice", options: ["Nil", "+", "++", "+++", "Not done"], required: true, absence: absence3 },
      { key: "urineGlucose", label: "Glucose", type: "choice", options: ["Nil", "+", "++", "+++", "Not done"], required: true, absence: absence3 },
      { key: "urineBlood", label: "Blood", type: "choice", options: ["Nil", "+", "++", "+++", "Not done"], required: true, absence: absence3 },
      { key: "urineWcc", label: "WCC", type: "choice", options: ["Nil", "10", "100", ">100", "Not done"], required: true, absence: absence3 },
    ] },
  { id: "blk-bloodpanel", name: "Blood panel selection", version: "1.3", summary: "Comprehensive (LAB) panel, with PSA and FIT added when the nurse form records them.", approvedBy: "Clinical Review",
    fields: [
      { key: "panelCore", label: "Comprehensive panel (cholesterol, HbA1c, kidney, full blood count, liver, thyroid, iron, vitamins and minerals)", type: "boolean", required: true, absence: ["missing"] },
      { key: "addPsa", label: "Add-on: PSA (when taken)", type: "boolean", required: false, absence: ["missing"] },
      { key: "addFit", label: "Add-on: FIT kit (when given)", type: "boolean", required: false, absence: ["missing"] },
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
  { id: "slack", name: "Slack", purpose: "Clinical channel for ECG photos today.",
    boundary: "Photos of an irregular ECG with an irregular pulse, sent by the nurse. In Pulse the photo stays with the clinical record and the clinician gets a review task.", statusLabel: "Replaced by Pulse alert, to confirm", tone: "warn",
    note: "Named on the nurse form: \"take photos of the ECG and send to the Slack channel\". Whether the Pulse clinical alert fully replaces it is to confirm. Nothing is posted to Slack." },
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

/** The participant questionnaire sections, defined with their questions in questionnaire.ts. */
export { QUESTIONNAIRE_SECTIONS } from "./questionnaire";
