/* Agreements: the SLA and DSA generated from the master templates with the client's details
   merged in, sent for signature through DocuSign (simulated), with version history. */
import { OH_AGREEMENT_SHORT, OH_AGREEMENT_TITLE, fmtDateTime, ohAgreementFor, ohAgreementsStage, ohCurrentVersion, ohRenderAgreement } from "../../model";
import type { OhAgreementDoc, OhAgreementKind } from "../../model";
import { dispatch, usePhState } from "../../store";
import { useNav } from "../../nav-context";
import { Button, Card, CardHeader, DemoTag, Field, PageHeader, Segmented, Select } from "../../ui";
import { OhNote, StagePill, VIEW_ONLY_TITLE, VersionPill, useOhAccess, useOhPrint } from "./shared";
import { ohAct } from "./actions";

function DocView({ doc }: { doc: OhAgreementDoc }) {
  return (
    <article className="oh-doc">
      <h2>{doc.title}</h2>
      <div className="oh-small">{doc.clientName} · Version {doc.version} · {doc.templateVersion}</div>
      {doc.sections.map((s) => (
        <section key={s.heading}>
          <h3>{s.heading}</h3>
          {s.paragraphs.map((p, i) => <p key={i}>{p.map((x, j) => ("t" in x ? <span key={j}>{x.t}</span> : <mark key={j} className="oh-merge" title={`Merged field: ${x.f}`}>{x.v}</mark>))}</p>)}
        </section>
      ))}
      <div className="oh-sigs">
        {doc.signatures.map((s) => <div key={s.party}><strong>{s.party}</strong><span>{s.name}, {s.role}</span><span>{s.signedAt ? `Signed ${fmtDateTime(s.signedAt)} (Simulated)` : "Not signed"}</span></div>)}
      </div>
      <p className="oh-small">Sample wording. Precision Health's master templates replace this text; only the merge fields are filled from the onboarding form.</p>
    </article>
  );
}

export default function Agreements() {
  const state = usePhState();
  const nav = useNav();
  const manage = useOhAccess() === "manage";
  const [print, printNode] = useOhPrint();
  const clients = state.occHealth.clients;
  const clientId = nav.params.client && clients.some((c) => c.id === nav.params.client) ? nav.params.client : clients[0]?.id;
  const kind: OhAgreementKind = nav.params.doc === "dsa" ? "dsa" : "sla";
  const c = clients.find((x) => x.id === clientId);
  const ag = c ? ohAgreementFor(state, c.id, kind) : undefined;
  const cur = ag ? ohCurrentVersion(ag) : null;
  const doc = ag ? ohRenderAgreement(ag) : null;
  const dis = { disabled: !manage, title: manage ? undefined : VIEW_ONLY_TITLE };
  return (
    <div className="ph-page">
      <PageHeader eyebrow="Occupational health" title="Agreements"
        sub="Service Level Agreement and Data Sharing Agreement generated from the master templates with the client's onboarding details merged in, then sent for signature through DocuSign. Generated here instead of written by hand." />
      <div className="ph-stack">
        <OhNote>DocuSign is not connected. Sending and signing are Simulated: no envelope is created and nothing is emailed. <DemoTag>Simulated</DemoTag></OhNote>
        <Card>
          <CardHeader title={c ? c.name : "No clients"} sub={c ? <>Fiona's step: <StagePill stage={ohAgreementsStage(state, c.id)} /></> : null}
            right={<Segmented label="Agreement" value={kind} onChange={(v) => nav.setParams({ ...nav.params, doc: v })} options={[{ id: "sla", label: "SLA" }, { id: "dsa", label: "DSA" }]} />} />
          <Field label="Client" htmlFor="oh-agr-client">
            <Select id="oh-agr-client" value={clientId || ""} onChange={(e) => nav.setParams({ ...nav.params, client: e.target.value })}>
              {clients.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </Select>
          </Field>
          {c ? (
            <div className="ph-wrap" style={{ marginTop: 12 }}>
              <VersionPill status={cur ? cur.status : null} />
              <Button size="sm" icon="refresh" {...dis} onClick={() => dispatch(ohAct.generateAgreement(c.id, kind))}>{cur ? "Regenerate" : `Generate ${OH_AGREEMENT_SHORT[kind]}`}</Button>
              <Button size="sm" icon="send" {...dis} onClick={() => dispatch(ohAct.sendAgreement(c.id, kind))}>Send via DocuSign (Simulated)</Button>
              <Button size="sm" icon="check" {...dis} onClick={() => dispatch(ohAct.markSigned(c.id, kind))}>Record signature (Simulated)</Button>
              {doc ? <Button size="sm" icon="print" onClick={() => print(<DocView doc={doc} />)}>Print or save as PDF</Button> : null}
            </div>
          ) : null}
        </Card>
        {doc ? <Card><DocView doc={doc} /></Card> : <Card><p className="oh-small" style={{ margin: 0 }}>No {OH_AGREEMENT_TITLE[kind]} generated for this client yet.</p></Card>}
        {ag ? (
          <Card>
            <CardHeader title="Version history" />
            <ul className="oh-plain">
              {ag.versions.slice().reverse().map((v) => (
                <li key={v.version} className="oh-line">
                  <span className="ph-grow">Version {v.version}, generated {fmtDateTime(v.generatedAt)} by {v.generatedBy}{v.envelopeId ? `, envelope ${v.envelopeId}` : ""}{v.note ? `. ${v.note}` : ""}</span>
                  <VersionPill status={v.status} />
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>
      {printNode}
    </div>
  );
}
