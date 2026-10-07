/* Pre-appointment questionnaires: the library with submission counts, invite links per client and
   the submissions with a simulated "Send to Meddbase" (the Meddbase API is not agreed yet). */
import { OH_QUESTIONNAIRES, OH_QUESTIONNAIRE_BY_ID, fmtDateTime, ohMeddbaseReady, ohTemplateCounts } from "../../model";
import type { OhSubmission } from "../../model";
import { dispatch, usePhState } from "../../store";
import { Button, Card, CardHeader, DataTable, DemoTag, PageHeader } from "../../ui";
import type { Column } from "../../ui";
import { MeddbasePill, OhNote, VIEW_ONLY_TITLE, useOhAccess } from "./shared";
import { ohAct } from "./actions";

export default function Questionnaires() {
  const state = usePhState();
  const manage = useOhAccess() === "manage";
  const counts = ohTemplateCounts(state);
  const clientName = (id: string) => state.occHealth.clients.find((c) => c.id === id)?.name || id;
  const dis = { disabled: !manage, title: manage ? undefined : VIEW_ONLY_TITLE };
  const unsent = state.occHealth.submissions.filter((x) => x.meddbase.status !== "sent");
  const cols: Column<OhSubmission>[] = [
    { key: "id", header: "Submission", cell: (x) => <span className="ph-mono">{x.id}</span> },
    { key: "emp", header: "Employee (fictional)", cell: (x) => <span>{x.employee.name} <span className="ph-faint">{x.employee.ref}</span></span> },
    { key: "client", header: "Client", cell: (x) => clientName(x.clientId) },
    { key: "q", header: "Questionnaire", nowrap: false, cell: (x) => OH_QUESTIONNAIRE_BY_ID[x.templateId]?.title || x.templateId },
    { key: "at", header: "Submitted", cell: (x) => fmtDateTime(x.submittedAt) },
    { key: "mb", header: "Meddbase", cell: (x) => <MeddbasePill sent={x.meddbase.status === "sent"} /> },
    { key: "act", header: <span className="ph-faint">Action</span>, align: "right", cell: (x) => x.meddbase.status === "sent" ? <span className="ph-faint">{x.meddbase.ref}</span> : <Button size="sm" icon="send" {...dis} onClick={() => dispatch(ohAct.sendToMeddbase([x.id]))}>Send to Meddbase</Button> },
  ];
  return (
    <div className="ph-page">
      <PageHeader eyebrow="Occupational health" title="Pre-appointment questionnaires"
        sub="The forms each client's employees complete before they are seen in Meddbase. Jotform today. Precision Health wants each submission pushed into Meddbase by API."
        actions={<Button variant="primary" icon="send" {...dis} onClick={() => dispatch(ohAct.sendToMeddbase(unsent.map((x) => x.id)))}>Send all not sent ({unsent.length})</Button>} />
      <div className="ph-stack">
        <OhNote icon="alert">Meddbase API not agreed yet. "Send to Meddbase" is Simulated: nothing leaves Pulse. <DemoTag>Simulated</DemoTag></OhNote>
        <Card>
          <CardHeader title="Questionnaire library" sub="Sample questions only; Precision Health's own forms replace them." />
          <ul className="oh-plain">
            {OH_QUESTIONNAIRES.map((q) => (
              <li key={q.id} className="oh-line">
                <span className="ph-grow"><strong>{q.title}</strong> <span className="ph-faint">{q.kind}, v{q.version}, about {q.minutes} min</span></span>
                <span className="oh-small">{counts[q.id].clients} clients · {counts[q.id].total} submissions · {counts[q.id].notSent} not in Meddbase</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Invite links per client" sub="Fictional addresses. A link is issued once the client is set up in Meddbase." />
          <ul className="oh-plain">
            {state.occHealth.clients.map((c) => (
              <li key={c.id} className="oh-line">
                <span className="ph-grow">{c.name}</span>
                {c.inviteLink ? <span className="ph-mono oh-small">{c.inviteLink.url}</span>
                  : ohMeddbaseReady(c) ? <Button size="sm" icon="link" {...dis} onClick={() => dispatch(ohAct.issueInviteLink(c.id))}>Issue link</Button>
                    : <span className="oh-small">Waiting for Meddbase set-up</span>}
              </li>
            ))}
          </ul>
        </Card>
        <Card pad={false}>
          <DataTable rows={state.occHealth.submissions.slice().reverse()} columns={cols} rowKey={(x) => x.id} pageSize={20} caption="Questionnaire submissions" />
        </Card>
      </div>
    </div>
  );
}
