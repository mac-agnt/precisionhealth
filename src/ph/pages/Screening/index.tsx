/* Health Screening: reference ranges from Precision Health's table, versioned and controlled by
   superadmins, with the cohorts, calculations and open questions behind them. Every staff role can
   read the ranges; only superadmins change them. The participant preview sees nothing here.
   Handlers are registered by ./actions at import time. */
import "./screening.css";
import "./actions";
import { usePersona } from "../../store";
import { PageHeader, RestrictedNotice } from "../../ui";
import Ranges from "./Ranges";
import Check from "./Check";
import Changes from "./Changes";
import { Calculations, Cohorts, Impact, Questions } from "./Reference";

export default function Screening({ tab }: { tab: string }) {
  const p = usePersona();
  if (p.isParticipant) {
    return <div className="ph-page"><PageHeader title="Health Screening" /><RestrictedNotice>Reference ranges and change control are staff screens. The participant preview has no access.</RestrictedNotice></div>;
  }
  return (
    <div className="ph-page scr">
      {tab === "check" ? <Check /> : tab === "changes" ? <Changes /> : tab === "impact" ? <Impact /> : tab === "calculations" ? <Calculations />
        : tab === "cohorts" ? <Cohorts /> : tab === "questions" ? <Questions /> : <Ranges />}
    </div>
  );
}
