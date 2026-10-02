/* Agents, Activity: agent-specific events from the same global activity store. It renders the
   same feed component as Activity, Agents, so the two tabs always list exactly the same entries
   and there are no competing counts. */
import { DemoTag, PageHeader } from "../../ui";
import { AgentFeed } from "../Activity/feed";
import { StaffOnly } from "../Work/shared";

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
        <AgentFeed />
      </div>
    </StaffOnly>
  );
}
