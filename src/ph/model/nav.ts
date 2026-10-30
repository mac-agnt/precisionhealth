/* Page and tab registry plus hash routing helpers. There is no router library: pages are
   state in PulseLogic. Hashes such as #/Results/imports?batch=BATCH-20261002-01 make every
   screen linkable and let a walkthrough jump straight to a screen. */
import type { EntityKind } from "./types";

export type PageId =
  | "Home" | "Agents" | "Dashboard" | "Programmes" | "Clinics" | "Participants"
  | "Results" | "Reporting" | "Work" | "Records" | "Activity" | "Settings"
  | "Sales" | "Flu" | "OccHealth" | "Screening" | "Calendar" | "Clients" | "Portals";

export interface TabDef { id: string; label: string }
export interface PageDef { id: PageId; label: string; icon: string; hint: string; tabs: TabDef[]; /** Side-rail section heading; a labelled divider appears where it changes. */ section?: string }

/* Agents sits directly under Home and Records opens on Ontology: locked layout rules from CLAUDE.md.
   They override the order in the client brief. */
export const PAGES: PageDef[] = [
  { id: "Home", label: "Home", icon: "helios", hint: "Chat first", tabs: [] },
  { id: "Agents", label: "Agents", icon: "navAgents", hint: "Seven agents", tabs: [
    { id: "conversations", label: "Conversations" }, { id: "activity", label: "Activity" }] },
  { id: "Calendar", label: "Calendar", icon: "navCalendar", hint: "Everything with a date, in one place", tabs: [{ id: "all", label: "Everything" }] },
  { id: "Clients", label: "Clients", icon: "navClients", hint: "Every client, start to finish", tabs: [{ id: "journey", label: "Start to finish" }] },
  { id: "Dashboard", label: "Dashboard", icon: "navDash", hint: "Sales and operations", tabs: [
    { id: "sales", label: "Sales" }, { id: "operations", label: "Operations" }, { id: "executive", label: "Executive" }] },
  { id: "Sales", section: "Sell", label: "Sales", icon: "navSales", hint: "Leads, proposals, onboarding, retention", tabs: [
    { id: "pipeline", label: "Pipeline" }, { id: "proposals", label: "Proposals" }, { id: "price-list", label: "Price list" }, { id: "onboarding", label: "Onboarding" },
    { id: "recall", label: "Retention" }, { id: "partners", label: "Irish Life Health" }, { id: "tenders", label: "Tenders" }] },
  { id: "Programmes", section: "Deliver screening", label: "Programmes", icon: "navProgrammes", hint: "Screening programmes", tabs: [
    { id: "overview", label: "Overview" }, { id: "programmes", label: "All programmes" }, { id: "invitations", label: "Invitations" }, { id: "forms-templates", label: "Forms and templates" }] },
  { id: "Clinics", section: "Deliver screening", label: "Clinics", icon: "navClinics", hint: "Capacity and sessions", tabs: [
    { id: "overview", label: "Today" }, { id: "days", label: "Screening days" }, { id: "schedule", label: "Schedule" }, { id: "appointments", label: "Appointments" }, { id: "board", label: "Bookings board" }, { id: "end-of-day", label: "End of day" }, { id: "team-resources", label: "Nurse rota" }] },
  { id: "Participants", section: "Deliver screening", label: "Participants", icon: "navParticipants", hint: "People and messages", tabs: [
    { id: "directory", label: "Directory" }, { id: "screening-history", label: "Screening history" }, { id: "communications", label: "Communications" }, { id: "portal-admin", label: "Portal admin" }] },
  { id: "Portals", section: "Deliver screening", label: "Portals", icon: "navPortals", hint: "Client, participant and nurse portals", tabs: [{ id: "all", label: "All portals" }] },
  { id: "Results", section: "Deliver screening", label: "Results", icon: "navResults", hint: "Lab imports and sign-off", tabs: [
    { id: "inbox", label: "Inbox" }, { id: "imports", label: "Lab imports" }, { id: "review", label: "Review" }, { id: "follow-up", label: "Follow-up" }, { id: "corrections", label: "Corrections" }] },
  { id: "Screening", section: "Deliver screening", label: "Health Screening", icon: "navScreening", hint: "Ranges and clinical rules", tabs: [
    { id: "ranges", label: "Ranges" }, { id: "cohorts", label: "Cohorts" }, { id: "calculations", label: "Calculations" },
    { id: "check", label: "Test run" }, { id: "changes", label: "Changes" }, { id: "impact", label: "Impact" }, { id: "questions", label: "To confirm" }] },
  { id: "Flu", section: "Services", label: "Flu", icon: "navFlu", hint: "Flu clinics and vaccine stock", tabs: [
    { id: "overview", label: "Overview" }, { id: "bookings", label: "Bookings" }, { id: "stock", label: "Vaccine stock" }, { id: "cold-chain", label: "Cold chain" }, { id: "contacts", label: "Contacts and notes" }] },
  { id: "OccHealth", section: "Services", label: "Occupational Health", icon: "navOcc", hint: "OH clients, onboarding, Meddbase", tabs: [
    { id: "clients", label: "Clients and onboarding" }, { id: "questionnaires", label: "Questionnaires" }, { id: "sessions", label: "Meddbase sessions" }, { id: "agreements", label: "Agreements" }] },
  { id: "Reporting", section: "Run the business", label: "Reporting", icon: "navReporting", hint: "Employer reports", tabs: [
    { id: "overview", label: "Overview" }, { id: "report-builder", label: "Report builder" }, { id: "exports", label: "Exports" }] },
  { id: "Work", section: "Run the business", label: "Work", icon: "navWork", hint: "Tasks and approvals", tabs: [
    { id: "tasks", label: "Tasks" }, { id: "approvals", label: "Approvals" }, { id: "automations", label: "Automations" }, { id: "workflows", label: "Workflows" }, { id: "schedules", label: "Schedules" }] },
  { id: "Records", section: "Run the business", label: "Records", icon: "navRecords", hint: "Companies, staff, files", tabs: [
    { id: "ontology", label: "Ontology" }, { id: "files", label: "Files" }, { id: "contacts", label: "Contacts" }, { id: "companies", label: "Companies" }, { id: "staff", label: "Staff" }] },
  { id: "Activity", section: "Run the business", label: "Activity", icon: "pulseLine", hint: "Audit history", tabs: [
    { id: "everything", label: "Everything" }, { id: "people", label: "People" }, { id: "agents", label: "Agents" }, { id: "needs-attention", label: "Needs attention" }] },
  { id: "Settings", section: "Run the business", label: "Settings", icon: "navSettings", hint: "Organisation and governance", tabs: [
    { id: "organisation", label: "Organisation" }, { id: "teams", label: "Teams" }, { id: "permissions", label: "Permissions" },
    { id: "systems-integrations", label: "Integrations" }, { id: "governance", label: "Governance" }, { id: "ai-controls", label: "AI controls" }, { id: "experience", label: "Display" }] },
];
export const PAGE_BY_ID: Record<PageId, PageDef> = Object.fromEntries(PAGES.map((p) => [p.id, p])) as Record<PageId, PageDef>;
/** The side-rail section a page sits in, for the page breadcrumb. Empty for pages above the first section. */
export function sectionOf(page: PageId): string {
  return PAGE_BY_ID[page]?.section || "";
}
/** True when this page and tab are rendered by a PH component rather than the original Pulse view. */
export function isPhScreen(page: string, tab: string): boolean {
  if (["Dashboard", "Programmes", "Clinics", "Participants", "Results", "Reporting", "Work", "Activity", "Settings", "Sales", "Flu", "OccHealth", "Screening", "Calendar", "Clients", "Portals"].includes(page)) return true;
  if (page === "Agents") return tab === "activity";
  if (page === "Records") return tab === "companies" || tab === "staff";
  return false;
}

export interface NavTarget {
  page: PageId;
  tab?: string;
  params?: Record<string, string>;
}

/* Old tab ids that now open a different tab, so earlier deep links keep working. */
const TAB_ALIASES: Partial<Record<PageId, Record<string, string>>> = {
  Dashboard: { "clinic-operations": "operations", "clinical-delivery": "operations" },
};
/* A page can choose its own default tab, for example by who is signed in. Registered by the page module. */
const TAB_DEFAULTS: Partial<Record<PageId, () => string | undefined>> = {};
export function registerTabDefault(page: PageId, fn: () => string | undefined): void { TAB_DEFAULTS[page] = fn; }
const hasTab = (page: PageId, tab: string | undefined) => !!tab && !!PAGE_BY_ID[page]?.tabs.some((t) => t.id === tab);
export const defaultTab = (page: PageId): string | undefined => {
  const d = TAB_DEFAULTS[page]?.();
  return hasTab(page, d) ? d : PAGE_BY_ID[page]?.tabs[0]?.id;
};
/** The tab to show: the one asked for, its new id when it was renamed, or the page default. */
export function resolveTab(page: PageId, tab: string | undefined): string | undefined {
  if (hasTab(page, tab)) return tab;
  const alias = tab ? TAB_ALIASES[page]?.[tab] : undefined;
  return hasTab(page, alias) ? alias : defaultTab(page);
}
export function tabLabel(page: PageId, tab: string | undefined): string {
  return PAGE_BY_ID[page]?.tabs.find((t) => t.id === tab)?.label || "";
}

export function hashFor(t: NavTarget): string {
  const tab = resolveTab(t.page, t.tab);
  const q = t.params ? Object.entries(t.params).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&") : "";
  return `#/${t.page}${tab ? "/" + tab : ""}${q ? "?" + q : ""}`;
}

export function parseHash(hash: string): NavTarget | null {
  const m = /^#\/([A-Za-z]+)(?:\/([a-z0-9-]+))?(?:\?(.*))?$/.exec(hash || "");
  if (!m) return null;
  const page = m[1] as PageId;
  if (!PAGE_BY_ID[page]) return null;
  const tab = resolveTab(page, m[2]);
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
    case "onboarding": return { page: "Sales", tab: "onboarding", params: { onb: id } };
  }
  return { page: "Home" };
}
