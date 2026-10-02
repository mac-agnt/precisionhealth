/* Mounts the PH page for the current page and tab. Pages that keep the original Pulse view
   (Home, Agents conversations, Records ontology, files and contacts) are handled in AppShell. */
import { Component } from "react";
import type { ReactNode } from "react";
import { useNav } from "../nav-context";
import { Button, Card, EmptyState } from "../ui";
import Dashboard from "./Dashboard";
import Programmes from "./Programmes";
import Clinics from "./Clinics";
import Participants from "./Participants";
import Results from "./Results";
import Reporting from "./Reporting";
import Work from "./Work";
import Activity from "./Activity";
import Settings from "./Settings";
import AgentsOverview from "./Agents/Overview";
import AgentsActivity from "./Agents/AgentsActivity";
import Companies from "./Records/Companies";
import Staff from "./Records/Staff";

class Boundary extends Component<{ children: ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) { return { err }; }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="ph-page" style={{ paddingTop: 24 }}>
        <Card pad={false}>
          <EmptyState title="This screen hit a problem" icon="alert" action={<Button onClick={() => this.setState({ err: null })}>Try again</Button>}>
            {this.state.err.message}
          </EmptyState>
        </Card>
      </div>
    );
  }
}

export default function PhRouter() {
  const { page, tab } = useNav();
  let body: ReactNode = null;
  switch (page) {
    case "Dashboard": body = <Dashboard tab={tab} />; break;
    case "Programmes": body = <Programmes tab={tab} />; break;
    case "Clinics": body = <Clinics tab={tab} />; break;
    case "Participants": body = <Participants tab={tab} />; break;
    case "Results": body = <Results tab={tab} />; break;
    case "Reporting": body = <Reporting tab={tab} />; break;
    case "Work": body = <Work tab={tab} />; break;
    case "Activity": body = <Activity tab={tab} />; break;
    case "Settings": body = <Settings tab={tab} />; break;
    case "Agents": body = tab === "activity" ? <AgentsActivity /> : <AgentsOverview />; break;
    case "Records": body = tab === "staff" ? <Staff /> : <Companies />; break;
  }
  return <Boundary key={page + "/" + tab}>{body}</Boundary>;
}
