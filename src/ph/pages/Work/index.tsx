/* Work: Tasks, Approvals, Workflows and Schedules, all derived from the shared store. */
import "./phf.css";
import Tasks from "./Tasks";
import Approvals from "./Approvals";
import Workflows from "./Workflows";
import Schedules from "./Schedules";
import { StaffOnly } from "./shared";

export default function WorkPage({ tab }: { tab: string }) {
  return <StaffOnly title="Work">{tab === "approvals" ? <Approvals /> : tab === "workflows" ? <Workflows /> : tab === "schedules" ? <Schedules /> : <Tasks />}</StaffOnly>;
}
