/* Dashboard module. Two dashboards with different jobs, plus an overview of both:
   Sales (Stephen Kelly, leads to revenue), Operations (Dr Neil Reddy and everyone else: clinics,
   results, quality, delivery) and Executive. The Dashboard opens on the right one for whoever is
   signed in, and switches when the persona changes. Old tab ids (clinic-operations,
   clinical-delivery) open Operations. */
import { useEffect, useRef } from "react";
import { registerTabDefault } from "../../model";
import { useNav } from "../../nav-context";
import { getState, usePersona } from "../../store";
import { PageHeader, RestrictedNotice } from "../../ui";
import Executive from "./Executive";
import OperationsDashboard from "./Operations";
import SalesDashboard from "./Sales";
import { dashDefaultTab, dashTabFor } from "./select";

/* #/Dashboard with no tab, and the side rail, open the signed-in person's own dashboard. */
registerTabDefault("Dashboard", () => dashDefaultTab(getState().session.personaId));

export default function DashboardPage({ tab }: { tab: string }) {
  const p = usePersona();
  const nav = useNav();
  const prev = useRef(p.id);
  useEffect(() => {
    /* The participant preview borrows the persona for a moment; coming back from it keeps the tab. */
    if (p.isParticipant || prev.current === p.id) return;
    prev.current = p.id;
    nav.setTab(dashDefaultTab(p.id));
  }, [p.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (p.isParticipant) {
    return (
      <div className="ph-page">
        <PageHeader title="Dashboard" />
        <RestrictedNotice title="Staff dashboards are not part of the participant preview">Participants see their own released data in the portal preview only.</RestrictedNotice>
      </div>
    );
  }
  switch (dashTabFor(tab, p.id)) {
    case "sales": return <SalesDashboard />;
    case "executive": return <Executive />;
    default: return <OperationsDashboard />;
  }
}
