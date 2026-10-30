/* Onboarding hand-offs from the 23 Oct call: the onboarding form LINK the client fills in, and what
   happens once onboarding is finished (set up the programme and the first screening day). */
import { useState } from "react";
import { ONB_KIND_LABEL, fmtDateTime } from "../../model";
import type { Onboarding } from "../../model";
import { useNav } from "../../nav-context";
import { dispatch, usePersona, usePhState } from "../../store";
import { Button, Card, DemoTag, Icon } from "../../ui";
import { createProgrammeTask } from "../Sales/LeadForms";
import { journeyAct, onbLinkUrl } from "./actions";
import { journeyKeyForOnb } from "./model";
import "./journey.css";

export function OnbLinkCard({ o }: { o: Onboarding }) {
  const p = usePersona();
  const [copied, setCopied] = useState(false);
  const link = o.clientLink;
  const url = link?.url || onbLinkUrl(o);
  const copy = () => {
    try { void navigator.clipboard?.writeText("https://" + url); } catch { /* clipboard blocked: the link is still on screen */ }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };
  if (o.completedAt) return null;
  const done = !!link?.completedAt;
  return (
    <Card className="ol-card">
      <div className="ol-head">
        <span className={"ol-ico" + (done ? " ok" : "")}><Icon name={done ? "check" : "link"} size={17} stroke={done ? 2.4 : 1.8} /></span>
        <div className="ol-text">
          <b>{done ? "The client filled in the onboarding form" : link ? "Waiting for the client to fill in the form" : `Send the ${ONB_KIND_LABEL[o.kind]} onboarding link`} <DemoTag>Simulated</DemoTag></b>
          <span>{done ? `Received ${fmtDateTime(link!.completedAt!)}. Their answers are in the form below: check them and continue.`
            : link ? `Sent to ${link.sentTo} on ${fmtDateTime(link.sentAt)}. They give the CRO number, contacts${o.kind === "oh" ? ", the referral manager" : ""} and where invoices go.`
            : `The client fills in their own details: CRO number, contacts${o.kind === "oh" ? ", referral manager" : ""} and where to send invoices. Or fill the form in below yourself.`}</span>
        </div>
      </div>
      <div className="ol-row">
        <code className="ol-url" title="Onboarding link">{url}</code>
        <Button size="sm" icon="link" onClick={copy}>{copied ? "Copied" : "Copy link"}</Button>
        {!link ? <Button size="sm" variant="primary" icon="send" disabled={p.isParticipant} onClick={() => dispatch(journeyAct.sendOnbLink(o.id))}>Send link to client</Button> : null}
        {link && !done ? <Button size="sm" variant="primary" icon="check" onClick={() => dispatch(journeyAct.clientCompletedOnb(o.id))}>Client completed the form</Button> : null}
      </div>
    </Card>
  );
}

/** After onboarding: set up the programme and plan the first screening day. */
export function OnbNextUp({ o }: { o: Onboarding }) {
  const s = usePhState();
  const nav = useNav();
  const lead = o.leadId ? s.sales.leads.find((l) => l.id === o.leadId) : undefined;
  const company = o.details.companyName.replace(/\s*\(fictional\)/, "");
  const prog = s.programmes.find((x) => x.clientName.toLowerCase() === company.toLowerCase());
  const plan = () => nav.go({ page: "Clinics", tab: "days", params: prog ? { ask: `${prog.clientName} screening day` } : { text: `${company}, first screening day: ` } });
  return (
    <>
      {lead && !lead.handoverTaskId && !prog ? <Button icon="list" onClick={() => createProgrammeTask(lead.id)}>Create the programme set-up task</Button> : null}
      {lead?.handoverTaskId ? <Button icon="list" onClick={() => nav.go({ page: "Work", tab: "tasks", params: { task: lead.handoverTaskId! } })}>Programme task {lead.handoverTaskId}</Button> : null}
      <Button variant="primary" icon="calendar" onClick={plan}>Set up the first screening day</Button>
      <Button icon="flag" onClick={() => nav.go({ page: "Clients", tab: "journey", params: { who: journeyKeyForOnb(s, o.id) } })}>See the whole journey</Button>
    </>
  );
}
