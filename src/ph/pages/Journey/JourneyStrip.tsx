/* The client's twelve stages as a small breadcrumb, placed at the top of the key records so every
   screen links backwards and forwards. The stage this screen belongs to is highlighted; each stage
   opens that stage's record for the same client; "See the whole journey" opens Clients. */
import { useMemo } from "react";
import { useNav } from "../../nav-context";
import { usePhState } from "../../store";
import { Icon } from "../../ui";
import { J_STATUS_LABEL, journeyFor, journeyKeyForCompany, journeyKeyForLead, journeyKeyForOnb, journeyKeyForProgramme } from "./model";
import type { JStageId } from "./model";
import { useJourneyRun } from "./run";
import "./journey.css";

export interface JourneyStripProps {
  /** Who: a client key (co-ibm, LD-0020, ONB-001) or one of lead, programme, onb, company name. */
  client?: string;
  lead?: string;
  programme?: string;
  onb?: string;
  company?: string;
  /** The stage this screen is about. Defaults to the client's current stage. */
  at?: JStageId;
  compact?: boolean;
  /** Dots only, for list rows. */
  mini?: boolean;
}

export function JourneyStrip(p: JourneyStripProps) {
  const s = usePhState();
  const nav = useNav();
  const run = useJourneyRun();
  const key = useMemo(() => p.client || (p.lead ? journeyKeyForLead(s, p.lead) : p.programme ? journeyKeyForProgramme(s, p.programme) : p.onb ? journeyKeyForOnb(s, p.onb) : p.company ? journeyKeyForCompany(s, p.company) : null), [s, p.client, p.lead, p.programme, p.onb, p.company]);
  const j = useMemo(() => (key ? journeyFor(s, key) : null), [s, key]);
  if (!j) return null;
  const atIdx = p.at ? j.stages.findIndex((x) => x.id === p.at) : j.current;
  return (
    <nav className={"js-strip" + (p.compact ? " compact" : "") + (p.mini ? " mini" : "")} aria-label={`${j.client.name}: start to finish`}>
      {p.mini ? null : <span className="js-who"><Icon name="flag" size={12} />{j.client.name}</span>}
      <ol className="js-steps">
        {j.stages.map((st, i) => {
          const tone = st.status === "done" || st.status === "history" ? "done" : st.status === "progress" ? "prog" : st.status === "todo" ? "todo" : "off";
          return (
            <li key={st.id} className={`js-step ${tone}${i === atIdx ? " here" : ""}`}>
              <button type="button" onClick={() => run(st.open)} title={`${st.n}. ${st.title}: ${J_STATUS_LABEL[st.status]}. ${st.open.label}`} aria-current={i === atIdx ? "step" : undefined}>
                <span className="js-dot">{tone === "done" ? <Icon name="check" size={9} stroke={2.6} /> : st.n}</span>
                <span className="js-label">{st.short}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <button type="button" className="js-all" onClick={() => nav.go({ page: "Clients", tab: "journey", params: { who: j.client.key } })}>See the whole journey <Icon name="arrow" size={12} /></button>
    </nav>
  );
}

export default JourneyStrip;
