/* Dashboard module: three tabs with different jobs and different chart forms.
   Executive (programme performance), Clinic Operations (today and this week) and
   Clinical Delivery (report workflow, clinical roles only). */
import { usePersona } from "../../store";
import { PageHeader, RestrictedNotice } from "../../ui";
import Executive from "./Executive";
import ClinicOperations from "./ClinicOperations";
import ClinicalDelivery from "./ClinicalDelivery";

export default function DashboardPage({ tab }: { tab: string }) {
  const p = usePersona();
  if (p.isParticipant) {
    return (
      <div className="ph-page">
        <PageHeader title="Dashboard" />
        <RestrictedNotice title="Staff dashboards are not part of the participant preview">Participants see their own released data in the portal preview only.</RestrictedNotice>
      </div>
    );
  }
  switch (tab) {
    case "clinic-operations": return <ClinicOperations />;
    case "clinical-delivery": return <ClinicalDelivery />;
    default: return <Executive />;
  }
}
