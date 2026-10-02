/* Settings: Organisation, Teams, Permissions, Systems & Integrations, Governance, AI Controls and
   Experience. The top-bar tabs come from the page registry; this component renders the tab body. */
import { usePersona } from "../../store";
import { RestrictedNotice } from "../../ui";
import Organisation from "./Organisation";
import Teams from "./Teams";
import Permissions from "./Permissions";
import Systems from "./Systems";
import Governance from "./Governance";
import AiControls from "./AiControls";
import Experience from "./Experience";
import { SettingsHeader } from "./common";

export default function SettingsPage({ tab }: { tab: string }) {
  const p = usePersona();
  if (!p.perms.has("settings.view")) {
    return (
      <div className="ph-page">
        <SettingsHeader gated={false} title="Settings" sub="Organisation, teams, permissions, systems, governance, AI controls and experience." />
        <RestrictedNotice title="Settings are not available in this preview">
          The participant preview shows the participant's own released data only. Close the portal preview to return to a staff role.
        </RestrictedNotice>
      </div>
    );
  }
  switch (tab) {
    case "teams": return <Teams />;
    case "permissions": return <Permissions />;
    case "systems-integrations": return <Systems />;
    case "governance": return <Governance />;
    case "ai-controls": return <AiControls />;
    case "experience": return <Experience />;
    default: return <Organisation />;
  }
}
