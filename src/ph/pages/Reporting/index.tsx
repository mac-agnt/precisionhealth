/* Reporting module: Overview, Report Builder and Exports for disclosure-controlled employer
   programme reports. Importing ./disclosure and ./snapshot registers the local cohort and snapshot handlers. */
import { usePersona } from "../../store";
import { PageHeader, RestrictedNotice } from "../../ui";
import "./disclosure";
import "./snapshot";
import Overview from "./Overview";
import ReportBuilder from "./ReportBuilder";
import Exports from "./Exports";

export default function ReportingPage({ tab }: { tab: string }) {
  const p = usePersona();
  if (p.isParticipant) {
    return (
      <div className="ph-page">
        <PageHeader title="Reporting" />
        <RestrictedNotice title="Employer reporting is not part of the participant preview">Participants see their own released data in the portal preview only.</RestrictedNotice>
      </div>
    );
  }
  switch (tab) {
    case "report-builder": return <ReportBuilder />;
    case "exports": return <Exports />;
    default: return <Overview />;
  }
}
