/* Agents, Activity: agent-specific events from the same global activity store. It renders the
   same feed component as Activity, Agents, so the two tabs always list exactly the same entries
   and there are no competing counts. A strip above the feed links each agent to the automations
   it supports in Work, Automations. */
import { AGENT_DEFS, automationsForAgent } from "../../model";
import { DemoTag, PageHeader } from "../../ui";
import { useNav } from "../../nav-context";
import { AgentFeed } from "../Activity/feed";
import { AutomationChip, StaffOnly } from "../Work/shared";
import "../Work/phf.css";

function AgentAutomations() {
  const nav = useNav();
  const only = AGENT_DEFS.some((a) => a.id === nav.params.agent) ? nav.params.agent : null;
  const rows = AGENT_DEFS.filter((a) => (!only || a.id === only) && automationsForAgent(a.id).length > 0);
  if (!rows.length) return null;
  return (
    <div className="ph-card-flat" style={{ padding: "11px 14px", marginBottom: 14 }}>
      <div className="phf-sectiontitle">Automations the agents support. Each agent prepares or checks; a person decides.</div>
      <div className="ph-stack" style={{ gap: 6 }}>
        {rows.map((a) => (
          <div key={a.id} className="ph-row-flex" style={{ gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12.5, color: "var(--ink)", minWidth: 150 }}>{a.name}</span>
            <span className="ph-wrap" style={{ gap: 6 }}>{automationsForAgent(a.id).map((x) => <AutomationChip key={x.id} id={x.id} withName />)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AgentsActivity() {
  return (
    <StaffOnly title="Agent activity">
      <div className="ph-page">
        <PageHeader
          eyebrow="Agents"
          title="Agent activity"
          sub="Every simulated preparation, check and flag by the seven agents, from the shared activity log. Exactly the same entries as Activity, Agents."
          actions={<DemoTag>Simulated</DemoTag>}
        />
        <AgentAutomations />
        <AgentFeed />
      </div>
    </StaffOnly>
  );
}
