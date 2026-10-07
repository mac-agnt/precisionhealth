/* Entity types for the Precision Health demo. One synthetic store feeds every page.
   All data is fictional. IDs are stable strings; names, emails and employers are never keys. */
import type { Hhmm, Iso, LocalDate } from "./time";
export type { Hhmm, Iso, LocalDate } from "./time";

export type Id = string;

export type ProgrammeId = "PRG-SISK-26" | "PRG-SF-26" | "PRG-IBM-26";
export type StaffId = "neil" | "stephen" | "liz" | "fiona" | "anita" | "ian" | "martina" | "brenda";
export type PersonaId = StaffId | "participant";
export type TeamId = "programme-operations" | "nursing" | "clinical-review" | "client-programmes";
export type RoleKey =
  | "clinical_review"
  | "nursing_lead"
  | "clinical_capture"
  | "operations"
  | "programme_oversight"
  | "programme_reporting"
  | "wellness_support";

/* ---- permissions: a frontend visibility simulation, not server security ---- */
export type Perm =
  | "logistics.view"
  | "identity.minimal"
  | "clinical.view"
  | "clinical.capture"
  | "clinical.review"
  | "followup.view"
  | "followup.act"
  | "imports.view"
  | "identity.resolve"
  | "bookings.manage"
  | "invitations.manage"
  | "invitations.approve"
  | "forms.edit"
  | "forms.publish"
  | "reports.build"
  | "reports.approve"
  | "reports.export"
  | "settings.view"
  | "settings.edit"
  | "activity.clinical"
  | "agents.view"
  | "agents.configure";

export interface Staff {
  id: StaffId;
  name: string;
  /** How the app addresses the person in the shell, for example "Dr Neil Reddy". */
  displayName: string;
  title: string;
  team: TeamId;
  role: RoleKey;
  email: string;
  /** True only for the two publicly listed addresses. Others are demonstration aliases. */
  emailVerified: boolean;
  initials: string;
  tint: string;
  /** Fictional demo assignment text. */
  assignment: string;
}

export interface Team {
  id: TeamId;
  name: string;
  purpose: string;
  memberIds: StaffId[];
  /** Governance owner. Null renders as "Owner to confirm". */
  ownerId: StaffId | null;
}

export type CompanyKind = "self" | "client" | "supplier" | "service";
export interface Company {
  id: Id;
  name: string;
  kind: CompanyKind;
  relationship: string;
  programmeIds: ProgrammeId[];
  integrationIds: string[];
  contactIds: Id[];
  note: string;
  website?: string;
}

export interface Contact {
  id: Id;
  name: string;
  role: string;
  companyId: Id;
  email: string;
  phone?: string;
  /** "public" details come from the company website; "fictional" are demo characters. */
  provenance: "public" | "fictional";
  hasClinicalAccess: false;
}

/* ---- programmes, clinics, capacity ---- */
export interface Programme {
  id: ProgrammeId;
  code: string; // short label used in tags
  name: string;
  clientId: Id;
  clientName: string;
  windowStart: LocalDate;
  windowEnd: LocalDate;
  ownerId: StaffId; // programme oversight
  clinicalLeadId: StaffId;
  reportingLeadId: StaffId;
  opsLeadId: StaffId;
  appointmentTypeId: string;
  templateId: string;
  sites: string[];
  eligibility: string;
  inviteCode: string;
}

export interface AppointmentType {
  id: string;
  name: string;
  minutes: number;
  templateId: string;
  kind: "screening" | "service";
  note: string;
}

export interface ClinicSession {
  id: Id;
  programmeId: ProgrammeId;
  date: LocalDate;
  siteName: string;
  room: string;
  nurseId: StaffId;
  supportIds: StaffId[];
  start: Hhmm;
  end: Hhmm;
  breaks: Array<{ start: Hhmm; end: Hhmm }>;
  slotMinutes: number;
  status: "scheduled" | "completed" | "cancelled";
  printerId: Id | null;
  note: string;
}

export interface Slot {
  index: number;
  start: Hhmm;
  end: Hhmm;
}

export interface Resource {
  id: Id;
  kind: "room" | "printer";
  name: string;
  location: string;
  note: string;
}

/* ---- people ---- */
export type SexRecorded = "female" | "male" | "not_recorded";
export type GenderRecorded = "woman" | "man" | "non_binary" | "prefer_not_to_say" | "not_recorded";

export interface Person {
  id: Id; // PH-P-0001
  given: string;
  family: string;
  dob: LocalDate;
  sex: SexRecorded;
  gender: GenderRecorded;
  email: string; // example.com or example.invalid
  phone: string; // masked, fictitious
  programmeId: ProgrammeId;
  site: string;
  /** Free-text kept out of employer output. */
  hasFreeText: boolean;
}

export type MembershipStage = "invited" | "onboarding" | "booked";
export interface Membership {
  id: Id;
  personId: Id;
  programmeId: ProgrammeId;
  stage: MembershipStage;
  inviteCodeId: Id | null;
  invitedAt: Iso;
  consent: "not_started" | "complete";
  consentVersion: string | null;
  questionnaire: "not_started" | "draft" | "complete";
  /** Local save and resume for the portal onboarding scenario. */
  draft: { sectionsDone: number; sectionsTotal: number; answers: Record<string, string | number | boolean> } | null;
  answers: Record<string, string | number | boolean>;
  eligible: boolean;
  contactPreference: "email" | "sms";
  /** When the participant completed the questionnaire and consent in the portal. Absent for seeded bookings. */
  questionnaireCompletedAt?: Iso | null;
}

export interface Booking {
  id: Id; // PH-B-0001
  personId: Id;
  programmeId: ProgrammeId;
  sessionId: Id;
  slotStart: Hhmm;
  status: "confirmed" | "cancelled";
  attendance: "booked" | "checked_in" | "in_progress" | "completed" | "no_show";
  createdAt: Iso;
  createdVia: "portal" | "admin";
  appointmentTypeId: string;
  formTemplateId: string;
  formVersion: string;
  consentVersion: string;
  questionnaireCompletedAt: Iso;
  episodeId: Id | null;
  replaces: Id | null;
  replacedBy: Id | null;
  cancelReason?: string;
}

/* ---- clinical capture ---- */
export type MeasureState = "recorded" | "missing" | "not_done" | "declined";
export interface Measure {
  value: number | null;
  state: MeasureState;
  provenance: "measured" | "self_reported";
}
export interface IdentityCheck {
  key: string;
  label: string;
  /** What the nurse confirmed, e.g. the date of birth read back by the participant. */
  confirmedValue: string;
  confirmed: boolean;
}
/** One value on the nurse form that is not a measure, a urine result or the nurse comments. Null clears it. */
export type NurseFormValue = string | number | boolean | null;
export interface ClinicalCapture {
  status: "not_started" | "draft" | "complete";
  identity: IdentityCheck[];
  measures: {
    heightM: Measure;
    weightKg: Measure;
    waistCm: Measure;
    bpSys: Measure;
    bpDia: Measure;
    /** Pulse rate from the ECG machine. */
    pulse: Measure;
    /** Peak expiratory flow. Not done replaces the "write 0" convention on the paper form. */
    peakFlow: Measure;
  };
  /** Dipstick results. Options are Nil, +, ++, +++ and Not done; white cells use Nil, 10, 100, >100 and Not done. */
  urine: { protein: string; glucose: string; blood: string; wcc?: string } | null;
  /** Nurse comments (the "Nurse comments" field on the nurse form). */
  notes: string;
  /** Every other nurse-form field, keyed as in NURSE_FORM_SECTIONS (capture.ts). */
  form: Record<string, NurseFormValue>;
  /** Set once when an irregular ECG and an irregular manual pulse raised an ECG review task. */
  ecgReview?: null | { at: Iso; taskId: Id };
  checklist: Record<string, boolean>;
  savedAt: Iso | null;
  /** Bumped on each save, so a stale tab can be shown a save conflict. */
  rev: number;
  checkedInAt: Iso | null;
  completedAt: Iso | null;
}

export type AnalyteCode =
  | "TC" | "HDL" | "LDL" | "NONHDL" | "TG" | "TCHDL" | "HBA1C"
  | "HB" | "WCC" | "PLT"
  | "BILI" | "TPROT" | "ALP" | "GGT" | "AST" | "ALT"
  | "UREA" | "CREAT" | "URATE"
  | "FERR" | "IRON" | "TIBC"
  | "FT4" | "TSH"
  | "VITD" | "B12" | "FOLATE" | "CA" | "MG" | "PO4"
  | "PSA" | "FIT";
/** Report sections the analytes are grouped under, in the participant report order. */
export type AnalyteGroup = "cholesterol" | "glucose" | "kidney" | "fbc" | "liver" | "thyroid" | "iron" | "vitamins_minerals" | "cancer";
/**
 * Four-level classification shown as cell colours in the clinician viewer: green normal, yellow
 * borderline, orange abnormal or raised, grey not tested or not applicable.
 */
export type Band = "normal" | "borderline" | "abnormal" | "not_tested";
/** One reference interval. Bounds are exclusive unless marked inclusive ("less than 5.0" excludes 5.0). */
export interface RangeBound {
  lo?: number;
  loIncl?: boolean;
  hi?: number;
  hiIncl?: boolean;
  /** Compact form, for example "<5.0", ">1.0" or "13-17". */
  text: string;
}
export interface AnalyteRange {
  all?: RangeBound;
  male?: RangeBound;
  female?: RangeBound;
  /** Upper limit by age, for example PSA. maxAge is exclusive. */
  byAge?: Array<{ minAge: number; maxAge: number | null; range: RangeBound }>;
  /** The whole range as the participant report prints it, for example "13-17 (m) / 12-16 (f)". */
  text: string;
}
export interface Analyte {
  code: AnalyteCode;
  name: string;
  unit: string;
  decimals: number;
  /** Displayed illustrative decision limit. Sample content, not a validated threshold library. */
  limit: { kind: "max" | "min" | "range"; value: number; text: string };
  /** Only on the panel when the nurse form says so (PSA taken, FIT kit given). */
  addOn: boolean;
  group: AnalyteGroup;
  /** The test name as the participant report prints it. */
  reportName: string;
  range: AnalyteRange;
  /** Calculated in Pulse from other results. Never delivered by the laboratory, never an expected test. */
  calculated: null | { from: AnalyteCode[]; method: string };
  /** Qualitative result words. The stored value is 0 for the normal word and 1 for the abnormal word. */
  qualitative: null | { normal: string; abnormal: string };
  /** Nurse-form condition that puts this test on an episode's panel. */
  conditional: null | "psa_taken" | "fit_given";
  /** True when the range is an illustrative placeholder, not a value from Precision Health material. */
  illustrativeRange: boolean;
  /** Analyte-specific band rule, shown next to the range. */
  bandNote: string | null;
}

export interface Specimen {
  id: Id; // PH-S-00101
  episodeId: Id;
  type: "serum" | "edta" | "urine" | "stool";
  collectedAt: Iso;
  status: "collected" | "received" | "resulted";
  labelPrinted: boolean;
}

export type ObservationFlag = "none" | "review_required";
export interface Observation {
  id: Id;
  episodeId: Id;
  specimenId: Id;
  code: AnalyteCode;
  value: number;
  /** Result word for a qualitative test (FIT: Negative or Positive). Null for numeric results. */
  valueText?: string | null;
  unit: string;
  limitText: string;
  /** "review_required" exactly when band is borderline or abnormal. */
  flag: ObservationFlag;
  /** Four-level band under the illustrative rule set, for the participant's sex and age at collection. */
  band: Band;
  /** What the legacy spreadsheet-style summary displayed, where it differs from the rule. */
  legacyDisplayedFlag: "normal" | "review" | null;
  source: { kind: "batch"; batchId: Id; rowId: Id } | { kind: "clinic" } | { kind: "calc"; from: AnalyteCode[]; method: string };
  recordedAt: Iso;
  /** Source-unit discrepancy awaiting laboratory confirmation. */
  unitDiscrepancy: null | { sourceUnit: string; expectedUnit: string; confirmed: boolean };
  /** The value and unit exactly as received, kept after any documented correction. */
  original: null | { value: number; unit: string };
  version: number;
  /** Why this version exists when it replaced an earlier one: a unit confirmation or a result correction. */
  correction?: null | {
    kind: "unit_confirmation" | "result_correction";
    reason: string;
    by: StaffId;
    at: Iso;
    previous: { id: Id; value: number; unit: string; version: number };
  };
}

export interface ExpectedTest {
  code: AnalyteCode;
  addOn: boolean;
}

export type HoldKind =
  | "identity_dob_mismatch"
  | "identity_unknown_specimen"
  | "identity_candidates"
  | "source_unit_discrepancy"
  | "urgent_follow_up";
export interface Hold {
  kind: HoldKind;
  reason: string;
  since: Iso;
  rowId: Id | null;
  followUpId: Id | null;
}

export type ReportState = "awaiting_results" | "ready_for_review" | "released" | "on_hold";

/**
 * QRISK3 outputs. Values come from the licensed calculation engine; in this demo they are labelled
 * sample outputs and are never calculated in Pulse. Numbers are null when the engine has not
 * produced them (not eligible, inputs incomplete, or engine not connected for this episode).
 */
export interface QriskResult {
  score10y: number | null;
  heartAge: number | null;
  relativeRisk: number | null;
  source: "licensed_engine_sample";
  inputsComplete: boolean;
  eligible: boolean;
  reason?: string;
}

/** The nurse chose "No. Significantly abnormal results. Refer to doctor." on the nurse form. */
export interface NurseReferral {
  at: Iso;
  by: StaffId | null;
  reason: string;
  comment: string;
  taskId: Id | null;
}

export interface Episode {
  id: Id; // PH-E-0101
  personId: Id;
  programmeId: ProgrammeId;
  bookingId: Id;
  sessionId: Id;
  collectedAt: Iso;
  formSnapshot: { templateId: string; version: string; blocks: Record<string, string> };
  capture: ClinicalCapture;
  specimenIds: Id[];
  expectedTests: ExpectedTest[];
  reportState: ReportState;
  hold: Hold | null;
  readyAt: Iso | null;
  reviewAssigneeId: StaffId | null;
  reportVersionIds: Id[];
  followUpIds: Id[];
  /** Individual review-required acknowledgement given at release. */
  flagAckBy: StaffId | null;
  /** Precision Health unique ID in the client's format (COMP0 and four digits). Display only; id stays the key. */
  screeningRef: string;
  /** QRISK3 sample outputs, or null when no calculation has been requested yet. */
  qrisk: QriskResult | null;
  /** Visible marker of a nurse referral. Blocks the routine release shortcut. */
  nurseReferral: NurseReferral | null;
}

export interface ReportVersion {
  id: Id; // PH-E-0101-v1
  episodeId: Id;
  version: number;
  status: "draft" | "in_review" | "released" | "superseded";
  createdAt: Iso;
  createdBy: StaffId;
  advice: string;
  adviceSource: "manual" | "ai_draft_approved" | "sample_template";
  releasedAt: Iso | null;
  releasedBy: StaffId | null;
  releaseMode: "routine" | "individual" | null;
  checklist: Record<string, boolean>;
  flagAcknowledged: boolean;
  correctionReason: string | null;
  supersedes: Id | null;
  supersededBy: Id | null;
  /** Observation ids and versions frozen at the time of release. */
  observationRefs: Array<{ id: Id; version: number }>;
  participantNoticeAt: Iso | null;
  /** Participant opened the report in the portal. Recorded separately from message delivery. */
  accessedAt: Iso | null;
}

/* ---- laboratory imports ---- */
export type RowState = "imported" | "duplicate" | "quarantined" | "resolved";
export type QuarantineReason = "dob_mismatch" | "unknown_specimen" | "multiple_candidates";

export interface ImportRow {
  id: Id; // BATCH-20261002-01-R001
  batchId: Id;
  line: number;
  specimenKey: string;
  analyteCode: AnalyteCode;
  valueText: string;
  unit: string;
  resultAt: Iso;
  /** Date of birth printed on the lab row, if any. */
  dobInFile: LocalDate | null;
  nameInFile: string;
  state: RowState;
  episodeId: Id | null;
  observationId: Id | null;
  quarantine: null | {
    reason: QuarantineReason;
    detail: string;
    candidateEpisodeIds: Id[];
    suggestion: string | null;
  };
  duplicateOfObservationId: Id | null;
  resolution: null | {
    by: StaffId;
    at: Iso;
    chosenEpisodeId: Id;
    checks: string[];
    reason: string;
  };
  /** Set by the batchRows selector when the viewer may not see this row's result value (valueText is blank). */
  valueHidden?: boolean;
}

export interface ImportBatch {
  id: Id;
  lab: "Eurofins";
  filename: string;
  receivedAt: Iso;
  processedAt: Iso;
  specimenCount: number;
  source: string;
  status: "complete" | "partial";
  note: string;
  /** Lipids and HbA1c, the extended panel (every other analyte), or one in-session sample delivery. */
  kind?: "core" | "extended" | "sample";
}

export interface ImportPreview {
  filename: string;
  batchId: Id;
  loadedAt: Iso;
  /** Counts are derived from current state when the preview is built. */
  alreadySeen: number;
  unresolved: number;
  newRows: number;
  committed: boolean;
}

/* ---- follow-up, messages ---- */
export interface FollowUp {
  id: Id; // FU-0001
  episodeId: Id;
  personId: Id;
  programmeId: ProgrammeId;
  kind: "urgent_clinical_contact" | "routine_callback";
  ownerId: StaffId;
  assignedById: StaffId;
  dueAt: Iso;
  status: "open" | "closed";
  taskId: Id;
  note: string;
  attempts: Array<{ at: Iso; by: StaffId; channel: "phone" | "sms" | "email"; result: "no_answer" | "voicemail" | "spoke" | "wrong_number"; note: string }>;
  escalations: Array<{ at: Iso; by: StaffId; note: string }>;
  outcome: null | { code: string; note: string; at: Iso; by: StaffId; acknowledgedBy: StaffId };
}

export type MessageKind = "confirmation" | "reminder" | "report_available" | "invitation";
export interface Message {
  id: Id;
  logicalId: Id;
  kind: MessageKind;
  personId: Id;
  bookingId: Id | null;
  episodeId: Id | null;
  channel: "sms" | "email";
  /** Verified destination, masked. */
  destination: string;
  subject: string;
  status: "delivered" | "failed" | "queued" | "cancelled";
  attempts: Array<{ at: Iso; outcome: "delivered" | "failed"; reason: string | null; auto: boolean }>;
  cohort: string | null;
  at: Iso;
  provider: "Esendex" | "Email";
  simulated: true;
}

/* ---- invitations ---- */
export interface InvitationCode {
  id: Id;
  programmeId: ProgrammeId;
  code: string;
  label: string;
  createdBy: StaffId;
  createdAt: Iso;
  expiresOn: LocalDate;
  eligibility: string;
  status: "active" | "expired" | "revoked";
  linkText: string;
}

export interface InvitationDraft {
  id: Id;
  programmeId: ProgrammeId;
  title: string;
  preparedBy: StaffId;
  preparedAt: Iso;
  recipientIds: Id[];
  message: string;
  status: "draft" | "pending_approval" | "approved_simulated_sent" | "rejected";
  approvalId: Id | null;
  decidedBy: StaffId | null;
  decidedAt: Iso | null;
}

/* ---- work ---- */
export type StoryId = "ST-01" | "ST-02" | "ST-03" | "ST-04" | "ST-05" | "ST-06";
export interface Story {
  id: StoryId;
  title: string;
  ownerId: StaffId;
  secondaryOwnerId: StaffId | null;
  dueAt: Iso | null;
  clinical: boolean;
  agentId: string | null;
  summary: string;
}

export type EntityKind =
  | "person"
  | "episode"
  | "booking"
  | "session"
  | "programme"
  | "batch"
  | "row"
  | "task"
  | "followup"
  | "report"
  | "employer_report"
  | "template"
  | "company"
  | "staff"
  | "agent"
  | "approval"
  | "message"
  | "file"
  | "invitation"
  | "system";
export interface EntityRef {
  kind: EntityKind;
  id: Id;
  label?: string;
}

export interface Task {
  id: Id; // TSK-0001
  title: string;
  detail: string;
  storyId: StoryId | null;
  ownerId: StaffId;
  team: TeamId;
  priority: "high" | "medium" | "low";
  dueAt: Iso | null;
  /** Stored status. For story tasks the displayed status is derived from the underlying item. */
  status: "open" | "done";
  clinical: boolean;
  linked: EntityRef;
  createdAt: Iso;
  completedAt: Iso | null;
  completedBy: StaffId | null;
}

export type ApprovalType = "report_release" | "employer_report" | "invitation_prep" | "form_publication";
export interface Approval {
  id: Id;
  type: ApprovalType;
  title: string;
  requestedBy: StaffId | "system";
  reviewerId: StaffId;
  status: "pending" | "approved" | "rejected";
  target: EntityRef;
  createdAt: Iso;
  decidedAt: Iso | null;
  decidedBy: StaffId | null;
}

export interface ScheduledJob {
  id: Id;
  name: string;
  kind: "reminder" | "import" | "review_checkpoint" | "report_milestone" | "clinic_prep";
  cadence: string;
  lastRunAt: Iso | null;
  nextRunAt: Iso | null;
  status: "ok" | "failed" | "paused" | "pending";
  lastResult: string;
  linked: EntityRef | null;
  simulated: true;
}

export interface DqIssue {
  id: Id;
  title: string;
  detail: string;
  episodeId: Id | null;
  kind: "flag_inconsistency" | "source_unit" | "stale_template" | "identifier" | "missing_unit";
  status: "open" | "acknowledged" | "resolved";
  raisedByAgent: string;
  raisedAt: Iso;
}

/* ---- activity ---- */
export type ActorKind = "staff" | "agent" | "system" | "participant";
export interface ActivityEvent {
  id: Id; // EVT-00001
  at: Iso;
  actor: { kind: ActorKind; id: string; label: string };
  verb: string;
  summary: string;
  entity: EntityRef | null;
  programmeId: ProgrammeId | null;
  personId: Id | null;
  storyId: StoryId | null;
  integrationId: string | null;
  /** True when the text mentions clinical detail, so only clinical roles see it. */
  restricted: boolean;
  /** What other roles see for a restricted event, e.g. "Clinical action assigned". Null hides it entirely. */
  publicSummary: string | null;
  simulated: boolean;
  /** Seeded history rather than a result of a click in this session. */
  seeded: boolean;
}

/* ---- forms ---- */
export interface FieldDef {
  key: string;
  label: string;
  type: "number" | "text" | "choice" | "boolean" | "date";
  unit?: string;
  required: boolean;
  min?: number;
  max?: number;
  options?: string[];
  showIf?: { key: string; equals: string | boolean };
  /** Distinct reasons a value is absent. Never coerced to zero or normal. */
  absence: Array<"missing" | "not_done" | "declined">;
}
export interface FormBlock {
  id: Id;
  name: string;
  version: string;
  summary: string;
  approvedBy: string;
  fields: FieldDef[];
}
export interface TemplateBlockRef {
  blockId: Id;
  version: string;
  required: boolean;
}
export interface FormTemplateVersion {
  version: string;
  status: "published" | "draft" | "pending_approval" | "retired";
  blocks: TemplateBlockRef[];
  createdAt: Iso;
  createdBy: StaffId;
  publishedAt: Iso | null;
  note: string;
}
export interface FormTemplate {
  id: string;
  name: string;
  kind: "screening" | "service";
  purpose: string;
  versions: FormTemplateVersion[];
  currentVersion: string;
}

/* ---- employer reporting ---- */
export interface CohortDef {
  programmeId: ProgrammeId;
  /** Released episodes only. */
  site: string | "all";
  ageBand: "all" | "18-34" | "35-44" | "45-54" | "55+";
  gender: "all" | GenderRecorded;
  from: LocalDate | null;
  to: LocalDate | null;
}
/** One disclosure-controlled cell. A suppressed cell never carries its count. */
export interface MetricCell {
  label: string;
  count: number | null;
  suppressed: boolean;
  /** Hidden only so the visible totals cannot reveal another hidden cell. */
  complementary: boolean;
}
export interface MetricBreakdown {
  id: string;
  title: string;
  denominator: number;
  denominatorLabel: string;
  cells: MetricCell[];
  note: string;
}
export interface MetricClinical {
  id: string;
  title: string;
  /** Participants above the displayed limit. Null when fewer than the suppression threshold. */
  flagged: number | null;
  withValue: number;
  excluded: number;
  note: string;
}
export interface EmployerMetrics {
  programmeId: ProgrammeId;
  cohortLabel: string;
  /** Cohort size. 0 when the size is hidden (a group smaller than the suppression threshold), so printing it leaks nothing. */
  size: number;
  /** The size as safe text: "126", "6" or "fewer than 5". Prefer this over size in any rendered copy. */
  sizeLabel: string;
  /** True when the cohort is smaller than the suppression threshold, so its exact size is never stated. */
  sizeHidden: boolean;
  blocked: boolean;
  reason: string;
  reportEligible: number;
  attendedOverall: number;
  funnel: Array<{ key: string; label: string; n: number; denominatorLabel: string; rateLabel: string }>;
  breakdowns: MetricBreakdown[];
  clinical: MetricClinical[];
  methodology: string[];
  asOf: Iso;
}
export interface EmployerReport {
  id: Id;
  programmeId: ProgrammeId;
  title: string;
  periodStart: LocalDate;
  periodEnd: LocalDate;
  cohort: CohortDef;
  status: "draft" | "reviewed" | "approved" | "exported";
  version: number;
  narrative: string;
  narrativeSource: "manual" | "draft_from_aggregates";
  narrativeApproved: boolean;
  reviewerId: StaffId;
  coordinatorId: StaffId;
  approvedBy: StaffId | null;
  approvedAt: Iso | null;
  /** Released reports up to this time are in the snapshot. Newer releases wait for a refresh. */
  dataAsOf: Iso;
  /** The frozen numbers behind PDF and PowerPoint previews, set at approval. */
  snapshot: null | { at: Iso; metrics: EmployerMetrics };
  /** Filter attempts that were blocked, for the governance log. */
  blockedAttempts: number;
  /** Key of the last cohort that was blocked, so the same selection is logged once. */
  lastBlockedKey: string | null;
  /** Earlier versions, kept unchanged when a new version is created. */
  history?: Array<{
    version: number;
    status: EmployerReport["status"];
    narrative: string;
    cohort: CohortDef;
    approvedBy: StaffId | null;
    approvedAt: Iso | null;
    snapshot: EmployerReport["snapshot"];
    closedAt: Iso;
  }>;
}
export interface ExportRecord {
  id: Id;
  reportId: Id;
  format: "pdf" | "pptx";
  version: number;
  createdAt: Iso;
  createdBy: StaffId;
  kind: "print_preview" | "pptx_preview";
}

/* ---- agents, settings ---- */
export type AgentId = "briefing" | "watchdog" | "booking" | "lab" | "drafting" | "reporting" | "quality";
export interface AgentDef {
  id: AgentId;
  name: string;
  job: string;
  scope: string[];
  mayDo: string[];
  mayNotDo: string[];
  optional: boolean;
  shape: string;
  tint: string;
}

export interface GovernanceItem {
  id: string;
  group: "hosting" | "retention" | "access" | "clinical_rules" | "forms" | "dpia" | "security";
  title: string;
  detail: string;
  status: "required" | "to_confirm" | "sample_evidence" | "not_started" | "awaiting_client";
  owner: string | null;
}

export interface IntegrationDef {
  id: string;
  name: string;
  purpose: string;
  boundary: string;
  statusLabel: string;
  tone: "neutral" | "info" | "warn";
  note: string;
}

export interface Toast {
  id: number;
  tone: "ok" | "info" | "warn" | "bad";
  text: string;
}

export interface PhState {
  version: 1;
  clock: { nowUtc: Iso; preset: string };
  session: { personaId: PersonaId; portalPersonId: Id };
  staff: Staff[];
  teams: Team[];
  companies: Company[];
  contacts: Contact[];
  programmes: Programme[];
  appointmentTypes: AppointmentType[];
  sessions: ClinicSession[];
  resources: Resource[];
  persons: Person[];
  memberships: Membership[];
  bookings: Booking[];
  episodes: Episode[];
  specimens: Specimen[];
  observations: Observation[];
  batches: ImportBatch[];
  importRows: ImportRow[];
  importPreview: ImportPreview | null;
  /** In-progress clinical capture, keyed by booking id, until the appointment is completed. */
  captureDrafts: Record<Id, ClinicalCapture>;
  reportVersions: ReportVersion[];
  followUps: FollowUp[];
  messages: Message[];
  invitationCodes: InvitationCode[];
  invitationDrafts: InvitationDraft[];
  tasks: Task[];
  approvals: Approval[];
  jobs: ScheduledJob[];
  dqIssues: DqIssue[];
  activity: ActivityEvent[];
  forms: { blocks: FormBlock[]; templates: FormTemplate[] };
  employerReports: EmployerReport[];
  exports: ExportRecord[];
  settings: {
    aiDraftingOn: boolean;
    governance: GovernanceItem[];
    reminderLeadHours: number;
    minCohort: number;
    suppressionThreshold: number;
  };
  /** Staff-visible Clinical Drafting previews, keyed by episode, kept as drafts until a clinician edits and approves. */
  aiDrafts: Record<Id, { text: string; at: Iso }>;
  counters: Record<string, number>;
  toasts: Toast[];
}
