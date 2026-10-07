/* Participants, Portal admin: where Precision Health staff run the participant portal. Four views:
   Accounts (status, journey and audited account actions), Portal content (per programme, versioned,
   with consent and privacy notice approvals), Message templates (email and SMS, no clinical words)
   and the Access log. Settings here drive the participant portal preview directly. The participant
   persona never reaches this screen (Participants shows a restricted notice). */
import { accountStatusCounts, accessLog, templatesOf } from "../../model";
import { useNav } from "../../nav-context";
import { usePersona, usePhState } from "../../store";
import { DemoTag, PageHeader, Pill, Segmented } from "../../ui";
import AccountsView from "./PortalAdminAccounts";
import ContentView from "./PortalAdminContent";
import LogView from "./PortalAdminLog";
import TemplatesView from "./PortalAdminTemplates";
import "./portalAdmin.css";

type View = "accounts" | "content" | "templates" | "log";
const VIEWS: View[] = ["accounts", "content", "templates", "log"];
const isView = (v: string | undefined): v is View => !!v && (VIEWS as string[]).includes(v);

export default function PortalAdminTab() {
  const nav = useNav();
  const p = usePersona();
  const state = usePhState();
  const view: View = isView(nav.params.view) ? nav.params.view : "accounts";
  const counts = accountStatusCounts(state);
  const options = [
    { id: "accounts" as View, label: "Accounts", count: counts.total },
    { id: "content" as View, label: "Portal content" },
    { id: "templates" as View, label: "Message templates", count: templatesOf(state).length },
    { id: "log" as View, label: "Access log", count: accessLog(state).length },
  ];
  return (
    <div className="ph-page">
      <PageHeader
        title="Portal admin"
        sub="Run the participant portal: accounts and sign-in, what each programme's portal says, the messages it sends and who accessed what. Dates and versions only. No result value appears on this screen."
        actions={<>{p.perms.has("portal.admin") ? null : <Pill tone="neutral" icon="eye">View only for {p.roleLabel.toLowerCase()}</Pill>}<DemoTag title="Every person is a fictional demo record. Messages are simulated.">Synthetic people</DemoTag></>}
      />
      <div className="pa-switch">
        <Segmented label="Portal admin view" value={view} onChange={(v) => nav.setParams({ view: v })} options={options} />
      </div>
      {view === "content" ? <ContentView /> : view === "templates" ? <TemplatesView /> : view === "log" ? <LogView /> : <AccountsView />}
    </div>
  );
}
