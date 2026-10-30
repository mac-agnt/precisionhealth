/* Health Screening: reference ranges from Precision Health's table, versioned and controlled by
   superadmins, with the cohorts, calculations and open questions behind them. Every staff role can
   read the ranges; only superadmins change them. The participant preview sees nothing here.
   Handlers are registered by ./actions at import time. */
import "./screening.css";
import "./actions";
import { usePersona } from "../../store";
import { useNav } from "../../nav-context";
import { PageHeader, RestrictedNotice, Segmented } from "../../ui";
import Ranges from "./Ranges";
import EnterResults from "./EnterResults";
import NewScreening from "./NewScreening";
import Changes from "./Changes";
import { Calculations, Cohorts, Impact, Questions } from "./Reference";

/* Four tabs in the top bar (Ranges, Enter results, Changes, More). The rest stay reachable, and keep
   their own links, through a small switch at the top of Changes and More. */
const GROUPS: Array<Array<{ id: string; label: string }>> = [
  [{ id: "changes", label: "Changes" }, { id: "impact", label: "Results impact" }],
  [{ id: "cohorts", label: "Cohorts" }, { id: "calculations", label: "Calculations" }, { id: "questions", label: "To confirm" }],
];
function SubNav({ tab }: { tab: string }) {
  const nav = useNav();
  const g = GROUPS.find((x) => x.some((t) => t.id === tab));
  if (!g) return null;
  return <div className="scr-subnav"><Segmented label="Section" value={tab} onChange={(id) => nav.go({ page: "Screening", tab: id })} options={g} /></div>;
}

export default function Screening({ tab }: { tab: string }) {
  const p = usePersona();
  if (p.isParticipant) {
    return <div className="ph-page"><PageHeader title="Health Screening" /><RestrictedNotice>Reference ranges and change control are staff screens. The participant preview has no access.</RestrictedNotice></div>;
  }
  return (
    <div className="ph-page scr">
      <SubNav tab={tab} />
      {tab === "new" ? <NewScreening /> : tab === "check" ? <EnterResults /> : tab === "changes" ? <Changes /> : tab === "impact" ? <Impact /> : tab === "calculations" ? <Calculations />
        : tab === "cohorts" ? <Cohorts /> : tab === "questions" ? <Questions /> : <Ranges />}
    </div>
  );
}
