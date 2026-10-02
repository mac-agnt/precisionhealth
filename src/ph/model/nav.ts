/* Page and tab registry plus hash routing helpers. There is no router library: pages are
   state in PulseLogic. Hashes such as #/Results/imports?batch=BATCH-20261002-01 make every
   screen linkable and let a walkthrough jump straight to a screen. */
import type { EntityKind } from "./types";

export type PageId =
  | "Home" | "Agents" | "Dashboard" | "Programmes" | "Clinics" | "Participants"
  | "Results" | "Reporting" | "Work" | "Records" | "Activity" | "Settings";

export interface TabDef { id: string; label: string }
export interface PageDef { id: PageId; label: string; icon: string; hint: string; tabs: TabDef[] }

/* Agents sits directly under Home and Records opens on Ontology: locked layout rules from CLAUDE.md.
   They override the order in the client brief. */
export const PAGES: PageDef[] = [
  { id: "Home", label: "Home", icon: "helios", hint: "Chat first", tabs: [] },
  { id: "Agents", label: "Agents", icon: "navAgents", hint: "Seven agents", tabs: [
    { id: "conversations", label: "Conversations" }, { id: "activity", label: "Activity" }] },
  { id: "Dashboard", label: "Dashboard", icon: "navDash", hint: "Executive, clinics, delivery", tabs: [
    { id: "executive", label: "Executive" }, { id: "clinic-operations", label: "Clinic Operations" }, { id: "clinical-delivery", label: "Clinical Delivery" }] },
  { id: "Programmes", label: "Programmes", icon: "navProgrammes", hint: "Screening programmes", tabs: [
    { id: "overview", label: "Overview" }, { id: "programmes", label: "Programmes" }, { id: "forms-templates", label: "Forms & Templates" }, { id: "invitations", label: "Invitations" }] },
  { id: "Clinics", label: "Clinics", icon: "navClinics", hint: "Capacity and sessions", tabs: [
    { id: "overview", label: "Overview" }, { id: "schedule", label: "Schedule" }, { id: "appointments", label: "Appointments" }, { id: "team-resources", label: "Team & Resources" }] },
  { id: "Participants", label: "Participants", icon: "navParticipants", hint: "People and messages", tabs: [
    { id: "directory", label: "Directory" }, { id: "screening-history", label: "Screening History" }, { id: "communications", label: "Communications" }] },
  { id: "Results", label: "Results", icon: "navResults", hint: "Imports and review", tabs: [
    { id: "inbox", label: "Inbox" }, { id: "imports", label: "Imports" }, { id: "review", label: "Review" }, { id: "follow-up", label: "Follow-up" }, { id: "corrections", label: "Corrections" }] },
  { id: "Reporting", label: "Reporting", icon: "navReporting", hint: "Employer reports", tabs: [
    { id: "overview", label: "Overview" }, { id: "report-builder", label: "Report Builder" }, { id: "exports", label: "Exports" }] },
  { id: "Work", label: "Work", icon: "navWork", hint: "Tasks and approvals", tabs: [
    { id: "tasks", label: "Tasks" }, { id: "approvals", label: "Approvals" }, { id: "workflows", label: "Workflows" }, { id: "schedules", label: "Schedules" }] },
  { id: "Records", label: "Records", icon: "navRecords", hint: "Companies, staff, files", tabs: [
    { id: "ontology", label: "Ontology" }, { id: "files", label: "Files" }, { id: "contacts", label: "Contacts" }, { id: "companies", label: "Companies" }, { id: "staff", label: "Staff" }] },
  { id: "Activity", label: "Activity", icon: "pulseLine", hint: "Audit history", tabs: [
    { id: "everything", label: "Everything" }, { id: "people", label: "People" }, { id: "agents", label: "Agents" }, { id: "needs-attention", label: "Needs Attention" }] },
  { id: "Settings", label: "Settings", icon: "navSettings", hint: "Organisation and governance", tabs: [
    { id: "organisation", label: "Organisation" }, { id: "teams", label: "Teams" }, { id: "permissions", label: "Permissions" },
    { id: "systems-integrations", label: "Systems & Integrations" }, { id: "governance", label: "Governance" }, { id: "ai-controls", label: "AI Controls" }, { id: "experience", label: "Experience" }] },
];
export const PAGE_BY_ID: Record<PageId, PageDef> = Object.fromEntries(PAGES.map((p) => [p.id, p])) as Record<PageId, PageDef>;
/** True when this page and tab are rendered by a PH component rather than the original Pulse view. */
export function isPhScreen(page: string, tab: string): boolean {
  if (["Dashboard", "Programmes", "Clinics", "Participants", "Results", "Reporting", "Work", "Activity", "Settings"].includes(page)) return true;
  if (page === "Agents") return tab === "activity";
  if (page === "Records") return tab === "companies" || tab === "staff";
  return false;
}

export interface NavTarget {
  page: PageId;
  tab?: string;
  params?: Record<string, string>;
}

export const defaultTab = (page: PageId): string | undefined => PAGE_BY_ID[page]?.tabs[0]?.id;
export function tabLabel(page: PageId, tab: string | undefined): string {
  return PAGE_BY_ID[page]?.tabs.find((t) => t.id === tab)?.label || "";
}

export function hashFor(t: NavTarget): string {
  const tab = t.tab || defaultTab(t.page);
  const q = t.params ? Object.entries(t.params).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&") : "";
  return `#/${t.page}${tab ? "/" + tab : ""}${q ? "?" + q : ""}`;
}

export function parseHash(hash: string): NavTarget | null {
  const m = /^#\/([A-Za-z]+)(?:\/([a-z0-9-]+))?(?:\?(.*))?$/.exec(hash || "");
  if (!m) return null;
  const page = m[1] as PageId;
  if (!PAGE_BY_ID[page]) return null;
  const tab = m[2] && PAGE_BY_ID[page].tabs.some((t) => t.id === m[2]) ? m[2] : defaultTab(page);
  const params: Record<string, string> = {};
  if (m[3]) m[3].split("&").forEach((kv) => { const [k, v] = kv.split("="); if (k) params[decodeURIComponent(k)] = decodeURIComponent(v || ""); });
  return { page, tab, params };
}

/** Where an entity lives. Role checks happen in the page, not here. */
export function linkFor(kind: EntityKind, id: string): NavTarget {
  switch (kind) {
    case "person": return { page: "Participants", tab: "directory", params: { person: id } };
    case "episode": return { page: "Results", tab: "review", params: { episode: id } };
    case "booking": return { page: "Clinics", tab: "appointments", params: { booking: id } };
    case "session": return { page: "Clinics", tab: "schedule", params: { session: id } };
    case "programme": return { page: "Programmes", tab: "programmes", params: { programme: id } };
    case "batch": return { page: "Results", tab: "imports", params: { batch: id } };
    case "row": return { page: "Results", tab: "imports", params: { batch: id.replace(/-R\d+$/, ""), row: id } };
    case "task": return { page: "Work", tab: "tasks", params: { task: id } };
    case "followup": return { page: "Results", tab: "follow-up", params: { followup: id } };
    case "report": return { page: "Results", tab: "review", params: { episode: id.replace(/-v\d+$/, "") } };
    case "employer_report": return { page: "Reporting", tab: "report-builder", params: { report: id } };
    case "template": return { page: "Programmes", tab: "forms-templates", params: { template: id } };
    case "company": return { page: "Records", tab: "companies", params: { company: id } };
    case "staff": return { page: "Records", tab: "staff", params: { staff: id } };
    case "agent": return { page: "Agents", tab: "conversations", params: { agent: id } };
    case "approval": return { page: "Work", tab: "approvals", params: { approval: id } };
    case "message": return { page: "Participants", tab: "communications", params: { message: id } };
    case "file": return { page: "Records", tab: "files", params: { file: id } };
    case "invitation": return { page: "Programmes", tab: "invitations", params: { draft: id } };
    case "system": return { page: "Settings", tab: "systems-integrations", params: { system: id } };
  }
  return { page: "Home" };
}
