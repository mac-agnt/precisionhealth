/* Runs a journey action: go to a page, dispatch a store action, open a portal preview, or create the
   programme set-up task. Shared by the Clients page and the JourneyStrip. */
import { useNav } from "../../nav-context";
import { dispatch, getState } from "../../store";
import { requestClientPortalProgramme } from "../ClientPortal/data";
import { createProgrammeTask } from "../Sales/LeadForms";
import "./actions";
import "../Sales/onbActions";
import "../Clinics/daysActions";
import type { JAction } from "./model";

export function useJourneyRun(): (a: JAction) => void {
  const nav = useNav();
  return (a: JAction) => {
    if (a.kind === "go") { nav.go(a.target); return; }
    if (a.kind === "portal") {
      if (a.portal === "client") { if (a.programmeId) requestClientPortalProgramme(a.programmeId); nav.openClientPortal?.(); }
      else if (a.portal === "nurse") nav.openNursePortal?.();
      else nav.openPortal();
      return;
    }
    if (a.kind === "programmeTask") {
      if (createProgrammeTask(a.leadId)) {
        const lead = getState().sales.leads.find((l) => l.id === a.leadId);
        if (lead?.handoverTaskId) nav.go({ page: "Work", tab: "tasks", params: { task: lead.handoverTaskId } });
      }
      return;
    }
    const r = dispatch(a.action as never);
    if (r.ok && a.openResult === "lead" && r.id) nav.go({ page: "Sales", tab: "pipeline", params: { lead: r.id } });
  };
}
