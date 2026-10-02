/* Results module: Inbox, Imports, Review, Follow-up and Corrections. Every count comes from
   the shared selectors and every change goes through dispatch(act.*), so the other screens
   (Home, Dashboard, Work, Activity, the portal) update from the same state. */
import "./results.css";
import "./actions";
import { usePersona } from "../../store";
import { PageHeader, RestrictedNotice } from "../../ui";
import Inbox from "./Inbox";
import Imports from "./Imports";
import Review from "./Review";
import FollowUp from "./FollowUp";
import Corrections from "./Corrections";

export default function ResultsPage({ tab }: { tab: string }) {
  const p = usePersona();
  if (p.isParticipant) {
    // While the participant preview is open the demo acts as the participant: no staff data at all.
    return (
      <div className="ph-page phr">
        <PageHeader title="Results" />
        <RestrictedNotice title="Staff screen hidden during the participant preview">
          A participant sees only their own released data, in the portal preview. Close the preview to return to the staff view.
        </RestrictedNotice>
      </div>
    );
  }
  switch (tab) {
    case "imports": return <Imports />;
    case "review": return <Review />;
    case "follow-up": return <FollowUp />;
    case "corrections": return <Corrections />;
    default: return <Inbox />;
  }
}
