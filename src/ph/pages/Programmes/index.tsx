/* Programmes module: Overview, Programmes (register and detail), Forms & Templates (composer)
   and Invitations. Tab ids come from the page registry in src/ph/model/nav.ts. */
import "./programmes.css";
import { usePersona } from "../../store";
import { PageHeader, RestrictedNotice } from "../../ui";
import FormsTemplates from "./FormsTemplates";
import Invitations from "./Invitations";
import Overview from "./Overview";
import Register from "./Register";

export default function ProgrammesPage({ tab }: { tab: string }) {
  const p = usePersona();
  // While the participant preview is open the demo acts as the participant: no staff data renders behind it.
  if (p.isParticipant) {
    return (
      <div className="ph-page prg-page">
        <PageHeader title="Programmes" />
        <RestrictedNotice title="Not available in the participant preview">
          Programme, form and invitation management is for Precision Health staff. The participant preview shows only the participant's own information.
        </RestrictedNotice>
      </div>
    );
  }
  switch (tab) {
    case "programmes":
      return <Register />;
    case "forms-templates":
      return <FormsTemplates />;
    case "invitations":
      return <Invitations />;
    case "overview":
    default:
      return <Overview />;
  }
}
