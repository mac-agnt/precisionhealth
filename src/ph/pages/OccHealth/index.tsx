/* Occupational Health: OH clients and onboarding, agreements, pre-appointment questionnaires and
   Meddbase sessions, rebuilt from Stephen's walkthrough (RECORDING.md section 6). Meddbase stays
   the system of record for OH; Pulse tracks onboarding and shows readiness. */
import "./actions";
import "./oh.css";
import { PageHeader, RestrictedNotice } from "../../ui";
import { useOhAccess } from "./shared";
import Clients from "./Clients";
import Agreements from "./Agreements";
import Questionnaires from "./Questionnaires";
import Sessions from "./Sessions";

export default function OccHealth({ tab }: { tab: string }) {
  const access = useOhAccess();
  if (access === "none") {
    return (
      <div className="ph-page">
        <PageHeader eyebrow="Occupational health" title="Occupational health" />
        <RestrictedNotice>The participant preview has no access to occupational health. Switch to a staff role in Settings, Experience.</RestrictedNotice>
      </div>
    );
  }
  switch (tab) {
    case "agreements": return <Agreements />;
    case "questionnaires": return <Questionnaires />;
    case "sessions": return <Sessions />;
    default: return <Clients />;
  }
}
