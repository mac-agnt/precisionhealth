/* Work: Automations, Tasks, Approvals, Workflows and Schedules, all derived from the shared store. */
import "./phf.css";
import Automations from "./Automations";
import Tasks from "./Tasks";
import Approvals from "./Approvals";
import Workflows from "./Workflows";
import Schedules from "./Schedules";
import { StaffOnly } from "./shared";

function body(tab: string) {
  switch (tab) {
    case "tasks": return <Tasks />;
    case "approvals": return <Approvals />;
    case "workflows": return <Workflows />;
    case "schedules": return <Schedules />;
    default: return <Automations />;
  }
}

export default function WorkPage({ tab }: { tab: string }) {
  return <StaffOnly title="Work">{body(tab)}</StaffOnly>;
}
