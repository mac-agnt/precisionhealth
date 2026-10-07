/* Nurse operations: the bookings board (Monday's "Wellness/Occ Health Screening" board), the nurse
   day brief, and the End of Day and Mileage form with pay lines (RECORDING.md sections 2 and 4).
   The EndOfDaySubmission shape is shared: the Flu module reads its cold-chain fields. Fields may be
   added; existing ones are never renamed or removed.
   Everything here is pure: types, constants, the seeded slice and the rules (readiness flags, the
   brief text, cold-chain excursions, form validation and illustrative pay lines). Handlers live in
   pages/Clinics/opsActions.ts. Contacts, addresses, phone numbers and Eircodes are fictional examples. */
import type { Hhmm, Iso, LocalDate } from "./time";
import { addDays, dublinToUtc, fmtWeekdayDate, hhmmToMinutes, minutesToHhmm } from "./time";
import type { ProgrammeId, StaffId } from "./types";
import { isRealDate } from "./capture";

/* ================================================================================================
   End of Day and Mileage form
   ================================================================================================ */

/** Job types on the End of Day form. Pay rates differ by job. */
export type JobType = "poc_screening" | "lab_screening" | "cardiac_screening" | "flu_vaccination" | "occupational_health" | "wellness_talk" | "other";

export interface EndOfDaySubmission {
  id: string; // EOD-0001
  staffId: StaffId;
  date: LocalDate;
  /** Client and site, e.g. "Sisk, Sisk Dublin Site A". */
  clientLocation: string;
  programmeId: ProgrammeId | null;
  /** Clinic session the day belongs to, when it was a Pulse session. */
  sessionId: string | null;
  jobType: JobType;
  dayLength: "full" | "half";
  screensCompleted: number | null;
  dnaCount: number | null;
  vaccinesAdministered: number | null;
  /** Cold chain, degrees Celsius. Null when no vaccines were carried. */
  preVaccineTempC: number | null;
  intermediateVaccineTempC: number | null;
  postVaccineTempC: number | null;
  vaccineBatch: string | null; // e.g. "5DE36D2 Exp 05/26"
  issues: string; // issues, comments and adverse reactions; number of PSAs and FIT kits if applicable
  outsideDublin: boolean;
  mileageKm: number | null;
  submittedAt: Iso;
  /** Number of PSA samples taken that day, when the job had them. */
  psaCount?: number | null;
  /** Number of FIT kits handed out that day. */
  fitKitCount?: number | null;
  /** Who pressed submit, when the nursing lead submitted for a nurse. Absent when the nurse submitted their own. */
  submittedBy?: StaffId | null;
  /** The board booking the day belongs to, when it was a board-only booking. */
  boardItemId?: string | null;
}

export const EOD_JOB_TYPES: JobType[] = ["lab_screening", "poc_screening", "cardiac_screening", "flu_vaccination", "occupational_health", "wellness_talk", "other"];
export const EOD_JOB_TYPE_LABEL: Record<JobType, string> = {
  lab_screening: "Lab screening (bloods)",
  poc_screening: "POC screening",
  cardiac_screening: "Cardiac screening",
  flu_vaccination: "Flu vaccination",
  occupational_health: "Doctor for occupational health",
  wellness_talk: "Wellness talk",
  other: "Other on-site work",
};

/** Cold chain safe range for vaccines, degrees Celsius, inclusive. */
export const EOD_COLD_CHAIN = { minC: 2, maxC: 8, text: "2 to 8 °C" };
/** Example batch numbers in the client's format. The Flu module's stock records are the source in production. */
export const EOD_VACCINE_BATCHES = ["7KC41F2 Exp 06/27", "8HD20A9 Exp 07/27", "6RT55B1 Exp 05/27", "TBC"];

/**
 * Illustrative pay rates in euro per day, by job and day length, and the mileage rate. Placeholders
 * so the timesheet can show a pay line; Precision Health confirms the real rates.
 */
export const EOD_PAY_RATES: Record<JobType, { full: number; half: number }> = {
  lab_screening: { full: 300, half: 165 },
  poc_screening: { full: 300, half: 165 },
  cardiac_screening: { full: 330, half: 180 },
  flu_vaccination: { full: 280, half: 155 },
  occupational_health: { full: 600, half: 330 },
  wellness_talk: { full: 220, half: 130 },
  other: { full: 260, half: 145 },
};
export const EOD_MILEAGE_RATE = 0.43;
export const EOD_RATES_NOTE = "Illustrative rates, to confirm with Precision Health. Not a payroll calculation.";

export interface EodPayLine { day: number; mileage: number; total: number; label: string }
export function eodPayLine(s: Pick<EndOfDaySubmission, "jobType" | "dayLength" | "outsideDublin" | "mileageKm">): EodPayLine {
  const day = EOD_PAY_RATES[s.jobType][s.dayLength];
  const km = s.outsideDublin && s.mileageKm ? s.mileageKm : 0;
  const mileage = Math.round(km * EOD_MILEAGE_RATE * 100) / 100;
  const total = Math.round((day + mileage) * 100) / 100;
  const label = `${EOD_JOB_TYPE_LABEL[s.jobType]}, ${s.dayLength} day €${day.toFixed(2)}${km ? ` + ${km} km at €${EOD_MILEAGE_RATE.toFixed(2)} = €${mileage.toFixed(2)}` : ""}`;
  return { day, mileage, total, label };
}
export const fmtEuro = (n: number) => `€${n.toLocaleString("en-IE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Readings outside the cold chain range. Text, never colour alone, says which reading and by how much. */
export function eodExcursions(s: Pick<EndOfDaySubmission, "preVaccineTempC" | "intermediateVaccineTempC" | "postVaccineTempC">): Array<{ key: string; label: string; value: number; text: string }> {
  const rows: Array<[string, string, number | null]> = [
    ["preVaccineTempC", "Pre-vaccine", s.preVaccineTempC],
    ["intermediateVaccineTempC", "Intermediate", s.intermediateVaccineTempC],
    ["postVaccineTempC", "Post-vaccine", s.postVaccineTempC],
  ];
  return rows.filter((r): r is [string, string, number] => r[2] !== null && (r[2] < EOD_COLD_CHAIN.minC || r[2] > EOD_COLD_CHAIN.maxC))
    .map(([key, label, value]) => ({ key, label, value, text: `${label} temperature ${value.toFixed(1)} °C is ${value > EOD_COLD_CHAIN.maxC ? "above" : "below"} the safe range of ${EOD_COLD_CHAIN.text}` }));
}

/** What the nurse fills in. The id and submission time are added on submit. */
export type EodInput = Omit<EndOfDaySubmission, "id" | "submittedAt" | "submittedBy">;

const isInt = (n: number | null) => n !== null && Number.isInteger(n);
/** Field-level problems with an End of Day form, keyed by field. Empty when it can be submitted. */
export function eodErrors(i: EodInput, today: LocalDate): Record<string, string> {
  const out: Record<string, string> = {};
  if (!isRealDate(i.date)) out.date = "Enter the date as dd/mm/yyyy.";
  else if (i.date > today) out.date = "The End of Day form is for a day that has happened. This date is in the future.";
  if (!i.clientLocation.trim()) out.clientLocation = "Enter the client and location.";
  if (!EOD_JOB_TYPES.includes(i.jobType)) out.jobType = "Choose the job completed.";
  if (i.dayLength !== "full" && i.dayLength !== "half") out.dayLength = "Choose full or half day.";
  const count = (k: "screensCompleted" | "dnaCount" | "vaccinesAdministered", label: string, max: number) => {
    const v = i[k];
    if (v === null) return;
    if (!isInt(v) || v < 0 || v > max) out[k] = `${label} must be a whole number from 0 to ${max}.`;
  };
  count("screensCompleted", "Screens completed", 300);
  count("dnaCount", "Did not attend", 300);
  count("vaccinesAdministered", "Vaccines administered", 2000);
  const screening = i.jobType === "lab_screening" || i.jobType === "poc_screening" || i.jobType === "cardiac_screening";
  if (screening && i.screensCompleted === null && !out.screensCompleted) out.screensCompleted = "Enter the number of screens completed. Write 0 if none.";
  if (screening && i.dnaCount === null && !out.dnaCount) out.dnaCount = "Enter the number who did not attend. Write 0 if none.";
  if (i.jobType === "flu_vaccination" && i.vaccinesAdministered === null && !out.vaccinesAdministered) out.vaccinesAdministered = "Enter the number of vaccines administered.";
  const vaccines = (i.vaccinesAdministered || 0) > 0;
  for (const [k, label] of [["preVaccineTempC", "Pre-vaccine temperature"], ["intermediateVaccineTempC", "Intermediate vaccine temperature"], ["postVaccineTempC", "Post-vaccine temperature"]] as const) {
    const v = i[k];
    if (v === null) { if (vaccines) out[k] = `${label} is required when vaccines were administered.`; continue; }
    if (!Number.isFinite(v) || v < -10 || v > 30) out[k] = `${label} must be between -10 and 30 °C.`;
    else if (Math.abs(v * 10 - Math.round(v * 10)) > 1e-9) out[k] = `${label} takes one decimal place.`;
  }
  if (vaccines && !(i.vaccineBatch || "").trim()) out.vaccineBatch = "Choose the vaccine batch number, or TBC.";
  if (i.issues.length > 2000) out.issues = "Keep issues and comments under 2,000 characters.";
  if (i.outsideDublin) {
    if (i.mileageKm === null) out.mileageKm = "Enter the mileage claimed for screening outside Dublin.";
    else if (!Number.isFinite(i.mileageKm) || i.mileageKm <= 0 || i.mileageKm > 1500) out.mileageKm = "Mileage must be between 1 and 1,500 km.";
  } else if (i.mileageKm !== null && i.mileageKm !== 0) out.mileageKm = "Mileage is only claimed for screening outside Dublin.";
  return out;
}

/* ================================================================================================
   Bookings board
   ================================================================================================ */

export type BoardScreeningType =
  | "Sisk Ire Screen" | "Information" | "Bloods" | "Bespoke" | "Gold 3" | "Onsite Ergo Assessment" | "Exec Health Screen"
  | "Bespoke Female" | "Bespoke Male" | "POC3" | "Cardiac";
export const BOARD_SCREENING_TYPES: BoardScreeningType[] = [
  "Sisk Ire Screen", "Information", "Bloods", "Bespoke", "Gold 3", "Onsite Ergo Assessment", "Exec Health Screen", "Bespoke Female", "Bespoke Male", "POC3", "Cardiac",
];
export type BoardStatus = "Working on it" | "Information" | "Ready to go" | "Quote in progress";
/** Board group order. */
export const BOARD_STATUSES: BoardStatus[] = ["Ready to go", "Working on it", "Information", "Quote in progress"];
/** Screens with a laboratory blood panel: the blood code goes on the blood form so the lab runs the client's tests. */
export const BOARD_BLOOD_TYPES: BoardScreeningType[] = ["Sisk Ire Screen", "Bloods", "Bespoke", "Gold 3", "Exec Health Screen", "Bespoke Female", "Bespoke Male"];
/** Point-of-care screens. No lab and no blood code; the nurse uses the POC Screen with QRISK form. */
export const BOARD_POC_TYPES: BoardScreeningType[] = ["POC3", "Cardiac"];
export const boardNeedsBloodCode = (t: BoardScreeningType | null | undefined) => !!t && BOARD_BLOOD_TYPES.includes(t);
export const isPocScreening = (t: BoardScreeningType | null | undefined) => !!t && BOARD_POC_TYPES.includes(t);
/** True when a clinic session's appointments use the POC Screen with QRISK form at check-in. */
export const sessionUsesPoc = (s: { logistics?: SessionLogistics }) => isPocScreening(s.logistics?.screeningType);

/** The End of Day job a screening type maps to. */
export function jobTypeForScreening(t: BoardScreeningType | null | undefined): JobType {
  if (t === "Cardiac") return "cardiac_screening";
  if (t === "POC3") return "poc_screening";
  if (t === "Onsite Ergo Assessment" || t === "Information") return "other";
  return "lab_screening";
}

/** The board columns a clinic session or a board-only booking carries, beyond date, time, room and staff. */
export interface SessionLogistics {
  screeningType: BoardScreeningType;
  status: BoardStatus;
  /** Service line, e.g. "Comprehensive health screening". */
  service: string;
  proposalsLink: string | null;
  /** Lab panel code written on the blood form. Needed for every bloods screen. */
  bloodCode: string | null;
  address: string | null;
  eircode: string | null;
  parking: string | null;
  contactName: string | null;
  contactPhone: string | null;
  /** Live attendance table. Not printed. */
  attendanceLink: string | null;
  /** The nurse form for the day. */
  screeningLink: string | null;
  /** Accommodation, when booked. A separate confirmation is sent. */
  accommodation: string | null;
}

/** A booking that is on the board but not (yet) a Pulse clinic session, for example a bespoke client day. */
export interface BoardItem {
  id: string; // BRD-0001
  client: string;
  /** Every screening day, ascending. A ten-day booking lists ten dates. */
  dates: LocalDate[];
  start: Hhmm | null;
  end: Hhmm | null;
  /** Staff onsite. */
  staffIds: StaffId[];
  room: string | null;
  logistics: SessionLogistics;
  note: string;
  createdAt: Iso;
  createdBy: StaffId | "system";
}

/** A nurse day brief sent (simulated) by email and WhatsApp. Sent once its scheduled time has passed on the demo clock. */
export interface DayBriefRecord {
  id: string; // BRF-0001
  target: { kind: "session" | "board"; id: string; date: LocalDate };
  staffId: StaffId;
  channels: Array<"email" | "whatsapp">;
  scheduledFor: Iso;
  createdAt: Iso;
  createdBy: StaffId | "system";
  status: "scheduled" | "cancelled";
  subject: string;
}

export interface NurseOpsState {
  version: 1;
  endOfDay: EndOfDaySubmission[];
  board: BoardItem[];
  briefs: DayBriefRecord[];
}

/** Readiness check on one board row. Text flags; colour is never the only signal. */
export interface BoardFlag { key: string; text: string }
export interface ReadinessInput {
  logistics: SessionLogistics;
  staffIds: StaffId[];
  start: Hhmm | null;
  /** Next date still to come, or null when every date has passed. */
  nextDate: LocalDate | null;
  /** A brief has been sent or scheduled for every staff member onsite. */
  briefsCovered: boolean;
}
export function boardReadiness(r: ReadinessInput, today: LocalDate): BoardFlag[] {
  if (!r.nextDate) return [];
  if (r.logistics.status === "Quote in progress") return [];
  const L = r.logistics;
  const out: BoardFlag[] = [];
  if (!r.staffIds.length) out.push({ key: "nurse", text: "No nurse assigned" });
  if (boardNeedsBloodCode(L.screeningType) && !(L.bloodCode || "").trim()) out.push({ key: "blood", text: "No blood code on a bloods screen" });
  if (!(L.contactName || "").trim()) out.push({ key: "contact", text: "No contact on the day" });
  else if (!(L.contactPhone || "").trim()) out.push({ key: "phone", text: "No phone for the contact on the day" });
  if (!(L.address || "").trim() || !(L.eircode || "").trim()) out.push({ key: "address", text: "Address or Eircode missing" });
  if (!r.start) out.push({ key: "start", text: "No start time" });
  const days = Math.round((Date.parse(r.nextDate) - Date.parse(today)) / 86400000);
  if (days >= 0 && days <= 4 && r.staffIds.length && !r.briefsCovered) out.push({ key: "brief", text: "Nurse day brief not sent" });
  if (days >= 0 && days <= 2 && L.status !== "Ready to go") out.push({ key: "status", text: `Status is ${L.status}, ${days === 0 ? "today" : days === 1 ? "tomorrow" : "in 2 days"}` });
  return out;
}

/* ================================================================================================
   Nurse day brief (Stephen's email, field for field)
   ================================================================================================ */
export interface DayBriefInput {
  company: string;
  contactName: string | null;
  contactPhone: string | null;
  address: string | null;
  eircode: string | null;
  parking: string | null;
  room: string | null;
  dates: LocalDate[];
  start: Hhmm | null;
  /** First appointment, when Pulse knows it. Falls back to the start time. */
  firstAppointment: Hhmm | null;
  attendanceLink: string | null;
  screeningType: BoardScreeningType;
  screeningLink: string | null;
  accommodation: string | null;
  nurseName: string;
}
export interface DayBrief {
  subject: string;
  intro: string;
  lines: Array<{ key: string; label: string; value: string; missing: boolean; note?: string }>;
  rules: string[];
  arriveBy: Hhmm | null;
  text: string;
}
export function briefScreenLabel(t: BoardScreeningType): string {
  if (t === "Cardiac") return "CARDIAC SCREENING";
  if (t === "Information") return "INFORMATION SESSION";
  if (t === "Onsite Ergo Assessment") return "ONSITE ERGO ASSESSMENT";
  return /screen$/i.test(t) ? t.toUpperCase() : `${t.toUpperCase()} SCREENING`;
}
export function buildDayBrief(i: DayBriefInput): DayBrief {
  const first = i.firstAppointment || i.start;
  const arriveBy = first ? minutesToHhmm(Math.max(0, hhmmToMinutes(first) - 30)) : null;
  const dateText = i.dates.length ? (i.dates.length === 1 ? fmtWeekdayDate(i.dates[0]) : `${i.dates.length} days, ${i.dates.map((d) => fmtWeekdayDate(d)).join(", ")}`) : "Date to confirm";
  const v = (x: string | null | undefined) => (x && x.trim() ? x.trim() : "");
  const line = (key: string, label: string, value: string, note?: string) => ({ key, label, value: value || "To confirm", missing: !value, note });
  const poc = isPocScreening(i.screeningType);
  const lines = [
    line("company", "Company", v(i.company)),
    line("date", "Date", dateText),
    line("contact", "Company contact", v(i.contactName)),
    line("phone", "Company contact phone", v(i.contactPhone)),
    line("address", "Address", v(i.address)),
    line("eircode", "Eircode", v(i.eircode)),
    line("parking", "Parking", v(i.parking)),
    line("room", "Room name", v(i.room)),
    line("start", "Start time", i.start || "", first && first !== i.start ? `First appointment ${first}` : undefined),
    line("attendance", "Attendance list", v(i.attendanceLink), "Live table. Do not print."),
    line("screen", "Screen type", briefScreenLabel(i.screeningType)),
    line("screening", "Screening link", v(i.screeningLink), poc ? "POC Screen with QRISK form" : "Comprehensive (LAB) nurse form"),
    { key: "accommodation", label: "Accommodation", value: v(i.accommodation) || "Not booked", missing: false, note: v(i.accommodation) ? "Separate confirmation sent" : undefined },
  ];
  const rules = [
    `Be there 30 minutes before the first appointment${arriveBy ? `: by ${arriveBy}` : ""}.`,
    "Text Brenda when you arrive.",
    "If you are delayed, ring Martina so the company can be told.",
    "Do not leave early unless the company contact confirms all staff have been seen. Then text Martina, Sinead or Brenda.",
    "Submit the End of Day form on the day, with your mileage. It is mandatory: you are not paid until it is in.",
  ];
  const subject = `Health Screening brief: ${v(i.company) || "client"}, ${i.dates.length ? fmtWeekdayDate(i.dates[0]) : "date to confirm"}`;
  const intro = `Hi ${i.nurseName.split(" ")[0]}, you are booked to carry out Health Screening for:`;
  const text = [
    intro,
    "",
    ...lines.map((l) => `${l.label}: ${l.value}${l.note ? ` (${l.note})` : ""}`),
    "",
    ...rules.map((r) => `- ${r}`),
  ].join("\n");
  return { subject, intro, lines, rules, arriveBy, text };
}

/** Default send time for a brief: 18:00 on the evening before the day. */
export const briefEveningBefore = (date: LocalDate): Iso => dublinToUtc(addDays(date, -1), "18:00");

/* ================================================================================================
   Seeded slice. Deterministic, small (well under 400 records).
   ================================================================================================ */
const LINK = "pulse.precisionhealth.example.invalid";
type Place = Pick<SessionLogistics, "address" | "eircode" | "parking">;
const SISK_A: Place = { address: "Sisk Dublin Site A, site compound, Example Road, Dublin 12", eircode: "D12 XE41", parking: "Visitor bays inside the site gate. Hi-vis and safety boots on site." };
const SISK_B: Place = { address: "Sisk Dublin Site B, Example Business Park, Dublin 24", eircode: "D24 XK72", parking: "Car park at the front of the site office. Sign in at security." };
const SF: Place = { address: "Salesforce Dublin office, Example Quay, Dublin 1", eircode: "D01 XR53", parking: "No parking on site. Public car park nearby; keep the receipt for expenses." };
const IBM: Place = { address: "IBM Dublin campus, Example Avenue, Dublin 15", eircode: "D15 XN28", parking: "Visitor car park beside reception." };
const CONTACT = {
  sisk: { contactName: "Róisín Hegarty", contactPhone: "087 555 0141" },
  sf: { contactName: "Daragh Coyle", contactPhone: "086 555 0172" },
  ibm: { contactName: "Mairéad Costello", contactPhone: "085 555 0118" },
};
function lg(o: Partial<SessionLogistics> & Pick<SessionLogistics, "screeningType" | "status" | "service">, sessionOrItem: string, poc = false): SessionLogistics {
  return {
    proposalsLink: null, bloodCode: null, address: null, eircode: null, parking: null, contactName: null, contactPhone: null, accommodation: null,
    attendanceLink: `${LINK}/attendance/${sessionOrItem}`, screeningLink: `${LINK}/nurse/${poc ? "poc-screen" : "lab-screen"}/${sessionOrItem}`,
    ...o,
  };
}
const siskLog = (id: string, o: Partial<SessionLogistics> = {}, site: Place = SISK_A) =>
  lg({ screeningType: "Sisk Ire Screen", status: "Ready to go", service: "Comprehensive health screening (LAB)", bloodCode: "PH-SISK26", proposalsLink: "drive.example.invalid/proposals/sisk-autumn-2026", ...site, ...CONTACT.sisk, ...o }, id);

/** Board columns for every seeded clinic session, by session id. Read by the roster fixtures. */
export const SESSION_LOGISTICS: Record<string, SessionLogistics> = {
  "CLN-SISK-20260914": siskLog("CLN-SISK-20260914"),
  "CLN-SISK-20260917": siskLog("CLN-SISK-20260917", {}, SISK_B),
  "CLN-SISK-20260921": siskLog("CLN-SISK-20260921"),
  "CLN-SISK-20260924": siskLog("CLN-SISK-20260924", {}, SISK_B),
  "CLN-SISK-20260928": siskLog("CLN-SISK-20260928"),
  "CLN-SISK-20261001": siskLog("CLN-SISK-20261001", {}, SISK_B),
  "CLN-SISK-20261005": siskLog("CLN-SISK-20261005"),
  "CLN-SISK-20261008": siskLog("CLN-SISK-20261008", {}, SISK_B),
  "CLN-SISK-20261012": siskLog("CLN-SISK-20261012"),
  "CLN-SISK-20261015": siskLog("CLN-SISK-20261015", { status: "Working on it", contactName: null, contactPhone: null }, SISK_B),
  "CLN-SISK-20261019": siskLog("CLN-SISK-20261019", { status: "Working on it" }),
  "CLN-SISK-20261022": siskLog("CLN-SISK-20261022", { status: "Working on it", bloodCode: null }, SISK_B),
  "CLN-SF-20260929": lg({ screeningType: "Bloods", status: "Ready to go", service: "Wellness screening with bloods (LAB)", bloodCode: "PH-SF26", proposalsLink: "drive.example.invalid/proposals/salesforce-wellness-2026", ...SF, ...CONTACT.sf }, "CLN-SF-20260929"),
  "CLN-SF-20261001": lg({ screeningType: "Bloods", status: "Ready to go", service: "Wellness screening with bloods (LAB)", bloodCode: "PH-SF26", proposalsLink: "drive.example.invalid/proposals/salesforce-wellness-2026", ...SF, ...CONTACT.sf }, "CLN-SF-20261001"),
  "CLN-SF-20261005": lg({ screeningType: "Bloods", status: "Ready to go", service: "Wellness screening with bloods (LAB)", bloodCode: "PH-SF26", proposalsLink: "drive.example.invalid/proposals/salesforce-wellness-2026", ...SF, ...CONTACT.sf }, "CLN-SF-20261005"),
  "CLN-SF-20261009": lg({ screeningType: "POC3", status: "Ready to go", service: "POC3 follow-on day (point of care, no lab)", proposalsLink: "drive.example.invalid/proposals/salesforce-wellness-2026", ...SF, ...CONTACT.sf }, "CLN-SF-20261009", true),
  "CLN-IBM-20261001": lg({ screeningType: "Bespoke", status: "Ready to go", service: "Bespoke screening with bloods (LAB)", bloodCode: "PH-IBM26", proposalsLink: "drive.example.invalid/proposals/ibm-dublin-2026", ...IBM, ...CONTACT.ibm }, "CLN-IBM-20261001"),
  "CLN-IBM-20261005": lg({ screeningType: "Bespoke", status: "Ready to go", service: "Bespoke screening with bloods (LAB)", bloodCode: "PH-IBM26", proposalsLink: "drive.example.invalid/proposals/ibm-dublin-2026", ...IBM, ...CONTACT.ibm }, "CLN-IBM-20261005"),
  "CLN-IBM-20261012": lg({ screeningType: "Bespoke", status: "Working on it", service: "Bespoke screening with bloods (LAB)", bloodCode: "PH-IBM26", proposalsLink: "drive.example.invalid/proposals/ibm-dublin-2026", ...IBM, contactName: CONTACT.ibm.contactName, contactPhone: null }, "CLN-IBM-20261012"),
};

const SEED_AT: Iso = "2026-09-25T09:00:00.000Z";
function boardSeed(): BoardItem[] {
  const item = (id: string, client: string, dates: LocalDate[], start: Hhmm | null, end: Hhmm | null, staffIds: StaffId[], room: string | null, l: Omit<SessionLogistics, "attendanceLink" | "screeningLink"> & Partial<Pick<SessionLogistics, "attendanceLink" | "screeningLink">>, note: string): BoardItem => ({
    id, client, dates, start, end, staffIds, room, note, createdAt: SEED_AT, createdBy: "system",
    logistics: { attendanceLink: `${LINK}/attendance/${id}`, screeningLink: `${LINK}/nurse/${isPocScreening(l.screeningType) ? "poc-screen" : "lab-screen"}/${id}`, ...l },
  });
  // Ten working days for Cairn Homes; Monday 26 October is the October bank holiday.
  const cairn: LocalDate[] = ["2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-11-03", "2026-11-04"];
  return [
    item("BRD-0001", "Sisk", ["2026-10-14"], "10:00", "13:00", ["ian"], "Site office, open-plan desks", {
      screeningType: "Onsite Ergo Assessment", status: "Ready to go", service: "Onsite ergonomic assessments", proposalsLink: null, bloodCode: null, ...SISK_A, ...CONTACT.sisk, accommodation: null,
    }, "Half day. Workstation assessments for the site office team."),
    item("BRD-0002", "LinkedIn", ["2026-10-16"], "09:20", "16:40", ["liz"], "Wellbeing Suite, 3rd floor", {
      screeningType: "Cardiac", status: "Ready to go", service: "Cardiac health screening (POC with ECG)", proposalsLink: "drive.example.invalid/proposals/linkedin-cardiac-2026", bloodCode: null,
      address: "LinkedIn Dublin office, Example Street, Dublin 2", eircode: "D02 XW64", parking: "No parking. Use the public car park on the next street.", contactName: "Aoibheann Farrelly", contactPhone: "086 555 0187", accommodation: null,
    }, "20-minute slots booked through the client's own booking page."),
    item("BRD-0003", "Cairn Homes", cairn, "08:30", "16:00", ["fiona"], "Site welfare unit", {
      screeningType: "Gold 3", status: "Working on it", service: "Gold 3 enhanced screening with 12-lead ECG (LAB)", proposalsLink: "drive.example.invalid/proposals/cairn-gold3-2026", bloodCode: "PH-CAIRN26",
      address: "Cairn Homes, Example Development, Leopardstown, Dublin 18", eircode: "D18 XH55", parking: "Site parking beside the welfare unit.", contactName: null, contactPhone: null, accommodation: null,
    }, "Ten days across October and November, a different site team each day."),
    item("BRD-0004", "ABP", ["2026-10-28"], "08:00", "14:00", ["liz", "neil"], "Boardroom", {
      screeningType: "Exec Health Screen", status: "Ready to go", service: "Executive Health Assessment (practitioner and doctor)", proposalsLink: "drive.example.invalid/proposals/abp-exec-2026", bloodCode: "PH-ABP-EXEC",
      address: "ABP, Example Road, Cahir, Co. Tipperary", eircode: "E21 XP36", parking: "Visitor parking at the front office.", contactName: "Declan Furlong", contactPhone: "087 555 0163",
      accommodation: "One night, 27 October, near Cahir. Separate confirmation sent.",
    }, "Six executives, one hour each: 30 minutes practitioner, 30 minutes doctor."),
    item("BRD-0005", "Dornan Group", ["2026-11-10"], "08:30", "15:30", [], "Canteen meeting room", {
      screeningType: "Bespoke Male", status: "Information", service: "Bespoke male screening (LAB)", proposalsLink: "drive.example.invalid/proposals/dornan-bespoke-2026", bloodCode: "PH-DORN-M",
      address: "Dornan Group, Example Industrial Estate, Cork", eircode: "T12 XC90", parking: "Yard parking, report to reception.", contactName: "Ciarán Moynihan", contactPhone: "086 555 0129", accommodation: null,
    }, "Several sites. Male panel on this day."),
    item("BRD-0006", "Dornan Group", ["2026-11-11"], "08:30", "15:30", ["anita"], "Training room", {
      screeningType: "Bespoke Female", status: "Information", service: "Bespoke female screening (LAB)", proposalsLink: "drive.example.invalid/proposals/dornan-bespoke-2026", bloodCode: null,
      address: "Dornan Group, Example Road, Limerick", eircode: "V94 XT15", parking: "Visitor bays at the main entrance.", contactName: "Ciarán Moynihan", contactPhone: "086 555 0129", accommodation: null,
    }, "Several sites. Female panel on this day."),
    item("BRD-0007", "O'Callaghan Collection", ["2026-11-17", "2026-11-18"], null, null, [], null, {
      screeningType: "POC3", status: "Quote in progress", service: "POC3 programme, 40 to 45 participants over 2 clinical days", proposalsLink: "drive.example.invalid/proposals/ocallaghan-poc3-2026", bloodCode: null,
      address: null, eircode: null, parking: null, contactName: null, contactPhone: null, accommodation: null,
    }, "Proposal sent with the flu add-on option. Dates held pending the quote."),
    item("BRD-0008", "IRFU", ["2026-12-01"], "09:30", "15:30", ["anita"], "Medical room", {
      screeningType: "Gold 3", status: "Working on it", service: "Gold 3 enhanced screening with 12-lead ECG (LAB)", proposalsLink: "drive.example.invalid/proposals/irfu-gold3-2026", bloodCode: "PH-IRFU-G3",
      address: "IRFU, Example Campus, Dublin 15", eircode: "D15 XA83", parking: "Visitor car park, gate B.", contactName: "Gavin Brophy", contactPhone: "085 555 0156", accommodation: null,
    }, "Up to 20 appointments, 20 minutes each."),
  ];
}

function briefSeed(): DayBriefRecord[] {
  const b = (n: number, kind: "session" | "board", id: string, date: LocalDate, staffId: StaffId, company: string, createdAt: Iso): DayBriefRecord => ({
    id: `BRF-${String(n).padStart(4, "0")}`, target: { kind, id, date }, staffId, channels: ["email", "whatsapp"], scheduledFor: briefEveningBefore(date),
    createdAt, createdBy: "stephen", status: "scheduled", subject: `Health Screening brief: ${company}, ${fmtWeekdayDate(date)}`,
  });
  return [
    b(1, "session", "CLN-SISK-20261005", "2026-10-05", "fiona", "Sisk", "2026-10-02T15:10:00.000Z"),
    b(2, "session", "CLN-SISK-20261005", "2026-10-05", "ian", "Sisk", "2026-10-02T15:11:00.000Z"),
    b(3, "session", "CLN-SF-20261005", "2026-10-05", "anita", "Salesforce", "2026-10-02T15:14:00.000Z"),
    b(4, "session", "CLN-IBM-20261005", "2026-10-05", "liz", "IBM", "2026-10-02T15:16:00.000Z"),
    b(5, "session", "CLN-SISK-20261008", "2026-10-08", "anita", "Sisk", "2026-10-02T15:20:00.000Z"),
    b(6, "board", "BRD-0001", "2026-10-14", "ian", "Sisk", "2026-10-02T15:24:00.000Z"),
  ];
}

function eodSeed(): EndOfDaySubmission[] {
  type Seed = Omit<EndOfDaySubmission, "id" | "submittedAt" | "preVaccineTempC" | "intermediateVaccineTempC" | "postVaccineTempC" | "vaccineBatch" | "vaccinesAdministered" | "outsideDublin" | "mileageKm" | "programmeId" | "sessionId">
    & Partial<Pick<EndOfDaySubmission, "preVaccineTempC" | "intermediateVaccineTempC" | "postVaccineTempC" | "vaccineBatch" | "vaccinesAdministered" | "outsideDublin" | "mileageKm" | "programmeId" | "sessionId">> & { at: Hhmm; nextDay?: boolean };
  const rows: Seed[] = [
    { staffId: "fiona", date: "2026-09-14", clientLocation: "Sisk, Sisk Dublin Site A", programmeId: "PRG-SISK-26", sessionId: "CLN-SISK-20260914", jobType: "lab_screening", dayLength: "full", screensCompleted: 25, dnaCount: 0, issues: "No issues. Courier collected the bloods at 16:30.", at: "17:05" },
    { staffId: "anita", date: "2026-09-17", clientLocation: "Sisk, Sisk Dublin Site B", programmeId: "PRG-SISK-26", sessionId: "CLN-SISK-20260917", jobType: "lab_screening", dayLength: "full", screensCompleted: 25, dnaCount: 0, issues: "Printer jammed twice in the morning. Labels reprinted, nothing lost.", at: "17:20" },
    { staffId: "anita", date: "2026-09-18", clientLocation: "Dornan Group, Cork office", jobType: "poc_screening", dayLength: "full", screensCompleted: 23, dnaCount: 2, issues: "Cholesterol machine showed an error for one participant; recorded as machine error and commented. PSAs: 0. FIT kits: 0.", outsideDublin: true, mileageKm: 258, psaCount: 0, fitKitCount: 0, at: "18:40" },
    { staffId: "anita", date: "2026-09-23", clientLocation: "Irish Life Health flu clinic, corporate client, Dublin 2", jobType: "flu_vaccination", dayLength: "full", screensCompleted: null, dnaCount: 6, vaccinesAdministered: 71, preVaccineTempC: 4.2, intermediateVaccineTempC: 5.1, postVaccineTempC: 5.8, vaccineBatch: "7KC41F2 Exp 06/27", issues: "No adverse reactions. One participant felt faint after the vaccine and recovered after 15 minutes seated.", at: "16:55" },
    { staffId: "fiona", date: "2026-09-21", clientLocation: "Sisk, Sisk Dublin Site A", programmeId: "PRG-SISK-26", sessionId: "CLN-SISK-20260921", jobType: "lab_screening", dayLength: "full", screensCompleted: 25, dnaCount: 0, issues: "No issues.", at: "09:10", nextDay: true },
    { staffId: "anita", date: "2026-09-24", clientLocation: "Sisk, Sisk Dublin Site B", programmeId: "PRG-SISK-26", sessionId: "CLN-SISK-20260924", jobType: "lab_screening", dayLength: "full", screensCompleted: 25, dnaCount: 0, issues: "No issues.", at: "17:02" },
    { staffId: "liz", date: "2026-09-25", clientLocation: "Cairn Homes, Leopardstown site office", jobType: "cardiac_screening", dayLength: "full", screensCompleted: 22, dnaCount: 3, issues: "Two irregular ECGs photographed for Neil. PSAs: 0. FIT kits: 0.", psaCount: 0, fitKitCount: 0, at: "17:35" },
    { staffId: "fiona", date: "2026-09-28", clientLocation: "Sisk, Sisk Dublin Site A", programmeId: "PRG-SISK-26", sessionId: "CLN-SISK-20260928", jobType: "lab_screening", dayLength: "full", screensCompleted: 25, dnaCount: 0, issues: "No issues.", at: "16:58" },
    { staffId: "anita", date: "2026-09-29", clientLocation: "Salesforce, Salesforce Dublin, Demo Wellness Room", programmeId: "PRG-SF-26", sessionId: "CLN-SF-20260929", jobType: "lab_screening", dayLength: "full", screensCompleted: 25, dnaCount: 0, issues: "No issues.", at: "17:12" },
    { staffId: "liz", date: "2026-09-30", clientLocation: "Irish Life Health flu clinic, corporate client, Dublin 4", jobType: "flu_vaccination", dayLength: "half", screensCompleted: null, dnaCount: 3, vaccinesAdministered: 38, preVaccineTempC: 3.9, intermediateVaccineTempC: 4.6, postVaccineTempC: 5.0, vaccineBatch: "7KC41F2 Exp 06/27", issues: "No adverse reactions.", at: "13:40" },
    { staffId: "ian", date: "2026-09-30", clientLocation: "ABP, Cahir site canteen", jobType: "wellness_talk", dayLength: "half", screensCompleted: null, dnaCount: null, issues: "Two talks, about 40 staff each. Leaflets left with the site manager.", outsideDublin: true, mileageKm: 172, at: "15:25" },
    { staffId: "fiona", date: "2026-10-01", clientLocation: "Salesforce, Salesforce Dublin, Demo Wellness Room", programmeId: "PRG-SF-26", sessionId: "CLN-SF-20261001", jobType: "lab_screening", dayLength: "full", screensCompleted: 25, dnaCount: 0, issues: "No issues.", at: "17:30" },
    { staffId: "liz", date: "2026-10-01", clientLocation: "IBM, IBM Dublin, Demo Screening Room", programmeId: "PRG-IBM-26", sessionId: "CLN-IBM-20261001", jobType: "lab_screening", dayLength: "full", screensCompleted: 25, dnaCount: 0, issues: "No issues.", at: "17:18" },
    { staffId: "fiona", date: "2026-10-02", clientLocation: "Irish Life Health flu clinic, Naas, Co. Kildare", jobType: "flu_vaccination", dayLength: "full", screensCompleted: null, dnaCount: 4, vaccinesAdministered: 54, preVaccineTempC: 4.4, intermediateVaccineTempC: 8.6, postVaccineTempC: 6.1, vaccineBatch: "8HD20A9 Exp 07/27", issues: "Cool box left near a radiator for about 20 minutes at lunch. Moved and logged. Nursing lead told on the day.", outsideDublin: true, mileageKm: 46, at: "17:48" },
  ];
  // The 21 September submission came in the next morning; 1 October at Sisk Site B (Anita) is still missing.
  return rows.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)).map((r, i) => {
    const { at, nextDay, ...rest } = r;
    return {
      id: `EOD-${String(i + 1).padStart(4, "0")}`, programmeId: null, sessionId: null, vaccinesAdministered: null, preVaccineTempC: null, intermediateVaccineTempC: null, postVaccineTempC: null,
      vaccineBatch: null, outsideDublin: false, mileageKm: null, psaCount: null, fitKitCount: null, submittedBy: null, boardItemId: null,
      ...rest, submittedAt: dublinToUtc(nextDay ? addDays(r.date, 1) : r.date, at),
    };
  });
}

export function initialNurseOpsState(): NurseOpsState {
  return { version: 1, endOfDay: eodSeed(), board: boardSeed(), briefs: briefSeed() };
}
