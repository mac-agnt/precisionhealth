/* People selectors: directory, person timeline, role-filtered global search, files,
   ontology relationships. Search and relationship drawers never reveal restricted
   clinical nodes to roles that cannot see clinical content. */
import type { Booking, Episode, Id, Membership, Person, PhState, Programme } from "../types";
import { COMPANIES, PROGRAMME_BY_ID } from "../constants";
import { fmtDate } from "../time";
import type { Iso } from "../time";
import { PAGES, linkFor } from "../nav";
import type { NavTarget } from "../nav";
import { CLINICAL_DETAIL_HIDDEN, bmiOf, versionsOf } from "./clinical";
import { canViewEpisodeClinical, ix, memo, membershipOf, persona, personName, staffName } from "./core";
import { inviteeStatusLabel } from "./ops";

/* ---- directory ---- */
export type DirectoryStage = "all" | "invited" | "onboarding" | "upcoming" | "attended";
export interface DirectoryRow {
  person: Person;
  /** The membership of the person's own programme. */
  membership: Membership;
  /** Every programme membership. A person can be on more than one programme; each keeps its own state. */
  memberships: Membership[];
  programme: Programme;
  stage: Exclude<DirectoryStage, "all">;
  stageLabel: string;
  nextBooking: Booking | null;
  nextWhen: string;
  episodeIds: Id[];
}
/** One row per person, on their own programme. Staff only: the participant preview gets nothing. */
export function directoryRows(state: PhState): DirectoryRow[] {
  return memo(state, "dir", () => {
    if (persona(state).isParticipant) return [];
    const I = ix(state);
    return state.persons.map((p) => {
      const m = membershipOf(state, p.id)!;
      const eps = I.episodesByPerson.get(p.id) || [];
      const upcoming = (I.bookingsByPerson.get(p.id) || []).filter((b) => b.status === "confirmed" && b.attendance !== "completed" && b.attendance !== "no_show")
        .sort((a, b) => (I.sessionById.get(a.sessionId)!.date < I.sessionById.get(b.sessionId)!.date ? -1 : 1))[0] || null;
      const stage: DirectoryRow["stage"] = eps.length ? "attended" : upcoming ? "upcoming" : m.stage === "onboarding" ? "onboarding" : "invited";
      return {
        person: p, membership: m, memberships: I.membershipsByPerson.get(p.id) || [m], programme: I.programmeById.get(p.programmeId)!, stage, stageLabel: inviteeStatusLabel(state, p.id),
        nextBooking: upcoming, nextWhen: upcoming ? `${fmtDate(I.sessionById.get(upcoming.sessionId)!.date)}, ${upcoming.slotStart}` : "", episodeIds: eps.map((e) => e.id),
      };
    });
  });
}
export function directoryCounts(state: PhState) {
  const rows = directoryRows(state);
  const c = (s: DirectoryRow["stage"]) => rows.filter((r) => r.stage === s).length;
  return { all: rows.length, invited: c("invited"), onboarding: c("onboarding"), upcoming: c("upcoming"), attended: c("attended") };
}
export function directory(state: PhState, f: { q?: string; stage?: DirectoryStage; programmeId?: string }): DirectoryRow[] {
  const q = (f.q || "").trim().toLowerCase();
  return directoryRows(state).filter((r) => {
    if (f.stage && f.stage !== "all" && r.stage !== f.stage) return false;
    if (f.programmeId && f.programmeId !== "all" && r.person.programmeId !== f.programmeId) return false;
    if (!q) return true;
    return (personName(r.person) + " " + r.person.id + " " + r.person.email).toLowerCase().includes(q);
  });
}

/* ---- person timeline ---- */
export interface TimelineItem { at: Iso; kind: string; title: string; detail: string; clinical: boolean; target?: NavTarget }
/**
 * A person's history across every programme they are on. Result values, calculations, correction
 * wording and follow-up detail appear only for roles that may see that episode's clinical content.
 * In the participant preview only the participant's own timeline is available, without clinical items.
 */
export function personTimeline(state: PhState, personId: Id): TimelineItem[] {
  const I = ix(state);
  const p = persona(state);
  if (p.isParticipant && personId !== state.session.portalPersonId) return [];
  const out: TimelineItem[] = [];
  for (const m of I.membershipsByPerson.get(personId) || []) out.push({ at: m.invitedAt, kind: "invitation", title: "Invited to the programme", detail: `${I.programmeById.get(m.programmeId)?.name}. Invitation code is managed centrally.`, clinical: false });
  for (const b of I.bookingsByPerson.get(personId) || []) {
    const s = I.sessionById.get(b.sessionId)!;
    out.push({ at: b.questionnaireCompletedAt, kind: "questionnaire", title: "Questionnaire and consent completed", detail: `Form ${b.formTemplateId.replace("tpl-", "")} v${b.formVersion}, consent ${b.consentVersion}. Completed before the booking was confirmed.`, clinical: false });
    out.push({ at: b.createdAt, kind: "booking", title: b.status === "cancelled" ? "Booking cancelled" : "Booking confirmed", detail: `${b.id}: ${fmtDate(s.date)} at ${b.slotStart}, ${s.siteName}.`, clinical: false, target: linkFor("booking", b.id) });
    if (b.attendance === "completed") out.push({ at: I.episodeById.get(b.episodeId || "")?.collectedAt || b.createdAt, kind: "attendance", title: "Attended and appointment completed", detail: `Episode ${b.episodeId}. Completing the appointment does not release a report.`, clinical: false });
  }
  for (const e of I.episodesByPerson.get(personId) || []) {
    const show = canViewEpisodeClinical(state, e.id);
    if (!p.isParticipant) {
      for (const o of (I.obsByEpisode.get(e.id) || [])) out.push({ at: o.recordedAt, kind: "observation", title: show ? `Result received: ${o.code}` : "Result received", detail: show ? `${o.value} ${o.unit}. Source ${o.source.kind === "batch" ? o.source.batchId : "clinic"}.` : CLINICAL_DETAIL_HIDDEN, clinical: true });
      const bmi = show ? bmiOf(e.capture) : null;
      if (bmi != null) out.push({ at: e.capture.completedAt || e.collectedAt, kind: "calculation", title: "BMI calculated", detail: `${bmi} kg/m² from recorded height and weight.`, clinical: true });
    }
    for (const v of versionsOf(state, e.id)) {
      if (v.releasedAt) out.push({ at: v.releasedAt, kind: "report", title: `Report v${v.version} released${v.status === "superseded" ? " (superseded)" : ""}`, detail: v.correctionReason ? (show ? v.correctionReason : "Correction released. The reason is limited to clinical roles.") : `Released by ${staffName(state, v.releasedBy)}.`, clinical: false, target: linkFor("episode", e.id) });
      if (v.accessedAt) out.push({ at: v.accessedAt, kind: "report_access", title: `Report v${v.version} opened in the portal`, detail: "Recorded separately from message delivery.", clinical: false });
    }
    if (!p.isParticipant) for (const f of I.followUpsByEpisode.get(e.id) || []) out.push({ at: f.dueAt, kind: "followup", title: show ? `Follow-up ${f.id} ${f.status}` : "Clinical action assigned", detail: show ? "Clinical follow-up item." : "A clinician owns this item. No clinical detail is shown to this role.", clinical: true, target: linkFor("followup", f.id) });
  }
  for (const msg of state.messages.filter((x) => x.personId === personId)) out.push({ at: msg.at, kind: "message", title: `${msg.kind.replace("_", " ")} ${msg.status}`, detail: `${msg.channel.toUpperCase()} to ${msg.destination}. Simulated.`, clinical: false });
  return out.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}

/* ---- files ---- */
export interface PhFile {
  id: string;
  name: string;
  folder: string;
  type: string;
  owner: string;
  linked: { kind: Parameters<typeof linkFor>[0]; id: string; label: string };
  version: string;
  visibility: "all_staff" | "clinical" | "reporting";
  summary: string;
}
export const PH_FILES: PhFile[] = [
  { id: "file-eurofins", name: "eurofins_results_2026-10-02_demo.csv", folder: "Imports", type: "CSV (synthetic)", owner: "Brenda Madden", linked: { kind: "batch", id: "BATCH-20261002-01", label: "BATCH-20261002-01" }, version: "1", visibility: "clinical",
    summary: "Bundled synthetic Eurofins results. 120 observation rows across 24 specimens. No real file is uploaded." },
  { id: "file-labreq", name: "lab_request_preview_PH-E-0101.pdf", folder: "Clinical documents", type: "PDF preview", owner: "Fiona Fenton", linked: { kind: "episode", id: "PH-E-0101", label: "PH-E-0101" }, version: "1", visibility: "clinical",
    summary: "A4 laboratory request and specimen label preview. Demo specimen, not for laboratory use. Printing is a local preview only." },
  { id: "file-template", name: "individual_report_template_v2.html", folder: "Report templates", type: "Template", owner: "Neil Reddy", linked: { kind: "template", id: "tpl-comprehensive-lab", label: "Comprehensive (LAB) Screen V2" }, version: "2.0", visibility: "all_staff",
    summary: "Participant report layout: concise advice page, lifestyle answers, relevant test sections, explanation and limitations, next steps. Layout inspired by the supplied sample. No source patient data." },
  { id: "file-sample", name: "approved_sample_participant_report.pdf", folder: "Report templates", type: "PDF (fictional sample)", owner: "Neil Reddy", linked: { kind: "template", id: "tpl-comprehensive-lab", label: "Comprehensive (LAB) Screen V2" }, version: "1", visibility: "clinical",
    summary: "Approved sample report with fictional values. Used for layout only." },
  { id: "file-erdraft", name: "ER-SISK-01_draft_programme_report.pdf", folder: "Programme reports", type: "Draft report", owner: "Martina Beattie", linked: { kind: "employer_report", id: "ER-SISK-01", label: "ER-SISK-01" }, version: "1 (draft)", visibility: "reporting",
    summary: "Draft employer programme report built from aggregate data only. Not approved for export." },
  { id: "file-consent", name: "booking_consent_sample.pdf", folder: "Consent", type: "PDF (sample)", owner: "Brenda Madden", linked: { kind: "programme", id: "PRG-SISK-26", label: "Sisk Autumn Screening" }, version: "BC-3", visibility: "all_staff",
    summary: "Sample booking consent. It names Esendex for SMS delivery. Retention wording is flagged for review in Governance." },
];
/** All staff files for every staff role; reporting files for roles that build employer reports; clinical files for clinical roles. */
export function fileVisible(state: PhState, f: PhFile): boolean {
  const p = persona(state);
  if (f.visibility === "all_staff") return !p.isParticipant;
  if (f.visibility === "reporting") return p.perms.has("reports.build");
  return p.perms.has("clinical.view");
}
export const visibleFiles = (state: PhState) => PH_FILES.filter((f) => fileVisible(state, f));

/* ---- ontology ---- */
export const ONTO_CLUSTER_DEFS = [
  { name: "Companies", color: "#5CA39A" },
  { name: "Programmes", color: "#97C2BC" },
  { name: "Clinics", color: "#6ad0f0" },
  { name: "People", color: "#f0c04b" },
  { name: "Episodes", color: "#b06cf0" },
  { name: "Results", color: "#f0803a" },
  { name: "Reports", color: "#5f7cf0" },
  { name: "Follow-up", color: "#f0567f" },
];
export interface OntoEntity { id: string; label: string; cluster: number; count: number; clinical: boolean; example: { label: string; target: NavTarget } | null; blurb: string }
export interface OntoRelation { id: string; from: string; to: string; label: string; count: number; clinical: boolean; example: { text: string; target: NavTarget } | null }
export interface OntoModel { entities: OntoEntity[]; relations: OntoRelation[]; totalRecords: number; totalRelationships: number; clusterCounts: number[] }
/**
 * Entity and relationship counts for the Records ontology, filtered by role. Clinical nodes need
 * clinical access, and their examples use an episode this role may see. Import batches and source
 * rows need the imports permission. The participant preview gets an empty model.
 */
export function ontologyModel(state: PhState): OntoModel {
  return memo(state, "onto:" + state.session.personaId, () => {
    const I = ix(state);
    const p = persona(state);
    if (p.isParticipant) return { entities: [], relations: [], totalRecords: 0, totalRelationships: 0, clusterCounts: ONTO_CLUSTER_DEFS.map(() => 0) };
    const clinicalOk = p.perms.has("clinical.view");
    const importsOk = p.perms.has("imports.view");
    // The example episode is Aisling's when this role may see it, otherwise the first episode it may see.
    const ex: Episode | undefined = canViewEpisodeClinical(state, "PH-E-0101") ? I.episodeById.get("PH-E-0101") : state.episodes.find((e) => canViewEpisodeClinical(state, e.id));
    const exPerson = ex ? I.personById.get(ex.personId) : undefined;
    const exObs = ex ? (I.obsByEpisode.get(ex.id) || [])[0] : undefined;
    const exBmi = ex ? bmiOf(ex.capture) : null;
    const exReport = state.reportVersions.find((v) => (v.status === "released" || v.status === "superseded") && canViewEpisodeClinical(state, v.episodeId));
    const exFollowUp = state.followUps.find((f) => canViewEpisodeClinical(state, f.episodeId));
    const exRow = state.importRows.find((r) => r.observationId);
    const confirmed = state.bookings.filter((b) => b.status === "confirmed");
    const released = state.reportVersions.filter((v) => v.status === "released" || v.status === "superseded").length;
    const assignments = state.sessions.reduce((n, s) => n + 1 + s.supportIds.length, 0);
    const reminder = state.messages.find((m) => m.kind === "reminder");
    const notice = state.messages.find((m) => m.kind === "report_available");
    const ents: OntoEntity[] = [
      { id: "company", label: "Company", cluster: 0, count: COMPANIES.length, clinical: false, example: { label: "co-sisk", target: linkFor("company", "co-sisk") }, blurb: "Precision Health, three clients, and two supplier or service records." },
      { id: "programme", label: "Programme", cluster: 1, count: state.programmes.length, clinical: false, example: { label: "PRG-SISK-26", target: linkFor("programme", "PRG-SISK-26") }, blurb: "A contracted screening programme that can span sites and weeks." },
      { id: "membership", label: "Membership", cluster: 1, count: state.memberships.length, clinical: false, example: { label: state.memberships[0].id, target: linkFor("person", state.memberships[0].personId) }, blurb: "A person's place in a programme roster. Invited is not booked." },
      { id: "session", label: "Clinic session", cluster: 2, count: state.sessions.length, clinical: false, example: { label: "CLN-SISK-20261005", target: linkFor("session", "CLN-SISK-20261005") }, blurb: "One dated session. Slots derive from the clinic day configuration." },
      { id: "booking", label: "Booking", cluster: 2, count: confirmed.length, clinical: false, example: { label: confirmed[0].id, target: linkFor("booking", confirmed[0].id) }, blurb: "A confirmed appointment. Questionnaire and consent come first." },
      { id: "staff", label: "Staff", cluster: 2, count: state.staff.length, clinical: false, example: { label: "Fiona Fenton", target: linkFor("staff", "fiona") }, blurb: "Eight demonstration profiles. Not total headcount." },
      { id: "assignment", label: "Assignment", cluster: 2, count: assignments, clinical: false, example: { label: "fiona to CLN-SISK-20261005", target: linkFor("session", "CLN-SISK-20261005") }, blurb: "Nurse or support assignment to a session." },
      { id: "person", label: "Person", cluster: 3, count: state.persons.length, clinical: false, example: { label: "PH-P-0001", target: linkFor("person", "PH-P-0001") }, blurb: "Synthetic invitee. Name and email are never keys." },
      { id: "episode", label: "Screening episode", cluster: 4, count: state.episodes.length, clinical: true, example: ex ? { label: ex.id, target: linkFor("episode", ex.id) } : null, blurb: "One episode per attended appointment in this baseline." },
      { id: "specimen", label: "Specimen", cluster: 4, count: state.specimens.length, clinical: true, example: ex ? { label: ex.specimenIds[0], target: linkFor("episode", ex.id) } : null, blurb: "Blood specimen. A specimen is not a row and not a person." },
      { id: "observation", label: "Observation", cluster: 5, count: state.observations.length, clinical: true, example: ex && exObs ? { label: exObs.id, target: linkFor("episode", ex.id) } : null, blurb: "A single result with unit, displayed limit and source row." },
      { id: "calculation", label: "Calculation", cluster: 5, count: state.episodes.filter((e) => bmiOf(e.capture) != null).length, clinical: true, example: ex ? { label: "BMI for " + ex.id, target: linkFor("episode", ex.id) } : null, blurb: "BMI is calculated locally. QRISK3 needs an approved integration." },
      { id: "batch", label: "Import batch", cluster: 5, count: state.batches.length, clinical: false, example: { label: "BATCH-20261002-01", target: linkFor("batch", "BATCH-20261002-01") }, blurb: "A laboratory file with accepted, duplicate and quarantined rows." },
      { id: "row", label: "Source row", cluster: 5, count: state.importRows.length, clinical: false, example: { label: "BATCH-20261002-01-R001", target: linkFor("row", "BATCH-20261002-01-R001") }, blurb: "One CSV observation row with provenance." },
      { id: "report", label: "Report version", cluster: 6, count: released, clinical: true, example: exReport ? { label: exReport.id, target: linkFor("report", exReport.id) } : null, blurb: "Released versions are immutable. A correction creates a new version." },
      { id: "followup", label: "Follow-up task", cluster: 7, count: state.followUps.length, clinical: true, example: exFollowUp ? { label: exFollowUp.id, target: linkFor("followup", exFollowUp.id) } : null, blurb: "Clinician-owned. Delivery receipts cannot close it." },
      { id: "notification", label: "Notification", cluster: 7, count: state.messages.length, clinical: false, example: { label: state.messages[0].id, target: linkFor("message", state.messages[0].id) }, blurb: "Confirmation, reminder or report-available message. Simulated." },
    ];
    const rel = (id: string, from: string, to: string, label: string, count: number, clinical: boolean, example: OntoRelation["example"]): OntoRelation => ({ id, from, to, label, count, clinical, example });
    const rels: OntoRelation[] = [
      rel("co-prog", "Company", "Programme", "contracts", state.programmes.length, false, { text: "co-sisk to PRG-SISK-26", target: linkFor("programme", "PRG-SISK-26") }),
      rel("prog-clinic", "Programme", "Clinic session", "runs", state.sessions.length, false, { text: "PRG-SISK-26 to CLN-SISK-20261005", target: linkFor("session", "CLN-SISK-20261005") }),
      rel("clinic-booking", "Clinic session", "Booking", "holds", confirmed.length, false, { text: `CLN-SISK-20261005 to ${confirmed.find((b) => b.sessionId === "CLN-SISK-20261005")?.id}`, target: linkFor("session", "CLN-SISK-20261005") }),
      rel("person-member", "Person", "Membership", "belongs to", state.memberships.length, false, { text: `PH-P-0001 to ${state.memberships[0].id}`, target: linkFor("person", "PH-P-0001") }),
      rel("member-prog", "Membership", "Programme", "is a member of", state.memberships.length, false, { text: `${state.memberships[0].id} to ${state.memberships[0].programmeId}`, target: linkFor("programme", state.memberships[0].programmeId) }),
      rel("staff-assign", "Staff", "Assignment", "is assigned", assignments, false, { text: "fiona to CLN-SISK-20261005", target: linkFor("session", "CLN-SISK-20261005") }),
      rel("notif-booking", "Notification", "Booking", "refers to", state.messages.filter((m) => m.bookingId).length, false, reminder ? { text: `${reminder.id} to ${reminder.bookingId}`, target: linkFor("message", reminder.id) } : null),
      rel("notif-report", "Notification", "Report version", "announces", state.messages.filter((m) => m.kind === "report_available").length, false, notice ? { text: "Report-available message carries no results", target: linkFor("message", notice.id) } : null),
      rel("batch-row", "Import batch", "Source row", "contains", state.importRows.length, false, { text: "BATCH-20261002-01 to BATCH-20261002-01-R001", target: linkFor("row", "BATCH-20261002-01-R001") }),
      rel("person-episode", "Person", "Screening episode", "has", state.episodes.length, true, ex ? { text: `${ex.personId} to ${ex.id}`, target: linkFor("episode", ex.id) } : null),
      rel("episode-specimen", "Screening episode", "Specimen", "collects", state.specimens.length, true, ex ? { text: `${ex.id} to ${ex.specimenIds[0]}`, target: linkFor("episode", ex.id) } : null),
      rel("specimen-obs", "Specimen", "Observation", "yields", state.observations.length, true, ex && exObs ? { text: `${ex.specimenIds[0]} to ${exObs.id}`, target: linkFor("episode", ex.id) } : null),
      rel("row-obs", "Source row", "Observation", "imports as", state.observations.filter((o) => o.source.kind === "batch").length, true, exRow ? { text: `${exRow.id} to ${exRow.observationId}`, target: linkFor("row", exRow.id) } : null),
      rel("obs-calc", "Observation", "Calculation", "feeds", state.episodes.filter((e) => bmiOf(e.capture) != null).length, true, ex && exBmi != null ? { text: `${exPerson ? exPerson.given : ex.id}: BMI ${exBmi}`, target: linkFor("episode", ex.id) } : null),
      rel("episode-report", "Screening episode", "Report version", "produces", released, true, exReport ? { text: `${exReport.episodeId} to ${exReport.id}`, target: linkFor("report", exReport.id) } : null),
      rel("episode-fu", "Screening episode", "Follow-up task", "may need", state.followUps.length, true, exFollowUp ? { text: `${exFollowUp.episodeId} to ${exFollowUp.id}`, target: linkFor("followup", exFollowUp.id) } : null),
    ];
    // Import batches and source rows need the imports permission, as in global search and the agents.
    const importNodes = new Set(["batch", "row"]);
    const importRels = new Set(["batch-row", "row-obs"]);
    const entities = ents.filter((e) => (!e.clinical || clinicalOk) && (importsOk || !importNodes.has(e.id)));
    const relations = rels.filter((r) => (!r.clinical || clinicalOk) && (importsOk || !importRels.has(r.id)));
    const clusterCounts = ONTO_CLUSTER_DEFS.map((_, i) => entities.filter((e) => e.cluster === i).reduce((n, e) => n + e.count, 0));
    return { entities, relations, totalRecords: entities.reduce((n, e) => n + e.count, 0), totalRelationships: relations.reduce((n, r) => n + r.count, 0), clusterCounts };
  });
}

/* ---- global search ---- */
export interface SearchHit { id: string; group: string; title: string; subtitle: string; target: NavTarget }
export function globalSearch(state: PhState, query: string, limit = 24): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const I = ix(state);
  const p = persona(state);
  const hits: SearchHit[] = [];
  const has = (...s: Array<string | undefined>) => s.join(" ").toLowerCase().includes(q);
  PAGES.forEach((pg) => {
    if (has(pg.label, pg.hint)) hits.push({ id: "pg-" + pg.id, group: "Pages", title: pg.label, subtitle: pg.hint, target: { page: pg.id } });
    pg.tabs.forEach((t) => { if (has(pg.label, t.label)) hits.push({ id: `pg-${pg.id}-${t.id}`, group: "Pages", title: `${pg.label}: ${t.label}`, subtitle: pg.hint, target: { page: pg.id, tab: t.id } }); });
  });
  if (!p.isParticipant) {
    state.programmes.forEach((x) => { if (has(x.name, x.id, x.clientName)) hits.push({ id: x.id, group: "Programmes", title: x.name, subtitle: x.id, target: linkFor("programme", x.id) }); });
    state.sessions.forEach((s) => { if (has(s.id, s.siteName, s.date)) hits.push({ id: s.id, group: "Clinics", title: `${PROGRAMME_BY_ID[s.programmeId].code} clinic ${fmtDate(s.date)}`, subtitle: `${s.id}, ${s.siteName}`, target: linkFor("session", s.id) }); });
    state.persons.forEach((x) => { if (has(personName(x), x.id)) hits.push({ id: x.id, group: "Participants", title: personName(x), subtitle: `${x.id}, ${PROGRAMME_BY_ID[x.programmeId].name}`, target: linkFor("person", x.id) }); });
    state.staff.forEach((x) => { if (has(x.name, x.title)) hits.push({ id: x.id, group: "Staff", title: x.name, subtitle: x.title, target: linkFor("staff", x.id) }); });
    COMPANIES.forEach((x) => { if (has(x.name, x.relationship)) hits.push({ id: x.id, group: "Companies", title: x.name, subtitle: x.relationship, target: linkFor("company", x.id) }); });
    visibleFiles(state).forEach((f) => { if (has(f.name, f.type, f.folder)) hits.push({ id: f.id, group: "Files", title: f.name, subtitle: `${f.type}, ${f.folder}`, target: linkFor("file", f.id) }); });
    state.forms.templates.forEach((t) => { if (has(t.name)) hits.push({ id: t.id, group: "Forms", title: t.name, subtitle: `Current v${t.currentVersion}`, target: linkFor("template", t.id) }); });
    if (p.perms.has("imports.view")) state.batches.forEach((b) => { if (has(b.id, b.filename)) hits.push({ id: b.id, group: "Imports", title: b.id, subtitle: b.filename, target: linkFor("batch", b.id) }); });
    state.tasks.forEach((t) => { if ((!t.clinical || p.perms.has("followup.view")) && has(t.title, t.id)) hits.push({ id: t.id, group: "Tasks", title: t.title, subtitle: t.id, target: linkFor("task", t.id) }); });
    // Clinical content only for roles that may see it.
    if (p.perms.has("clinical.view") && /^ph-e|^ph-s|^fu-/i.test(q)) {
      state.episodes.forEach((e) => { if (canViewEpisodeClinical(state, e.id) && has(e.id, ...e.specimenIds)) hits.push({ id: e.id, group: "Episodes", title: e.id, subtitle: personName(I.personById.get(e.personId)), target: linkFor("episode", e.id) }); });
      state.followUps.forEach((f) => { if (has(f.id)) hits.push({ id: f.id, group: "Follow-up", title: f.id, subtitle: "Clinical follow-up", target: linkFor("followup", f.id) }); });
    }
  }
  const order = ["Pages", "Participants", "Programmes", "Clinics", "Episodes", "Follow-up", "Imports", "Tasks", "Files", "Forms", "Staff", "Companies"];
  hits.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
  return hits.slice(0, limit);
}

export const knownNames = (state: PhState) => state.persons.map((p) => personName(p));
