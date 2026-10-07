/* Sales module: Pipeline (New Business Leads), Proposals, Price list, Recall & repeat and the
   Irish Life Health partner channel. Importing ./actions registers the sales handlers. */
import { useState } from "react";
import "./actions";
import {
  SALES_FAMILY_LABEL, SALES_ILH_REQUESTED_LABEL, SALES_PRICE_STATUS_LABEL, SALES_STAGES, SALES_STAGE_LABEL, SALES_UNIT_LABEL,
  fmtDate, salesEur, salesEurRange, salesLatestVersion, salesLeadViews, salesProposalTotals, salesRecalls, salesVersionTotals, today,
} from "../../model";
import type { SalesStage } from "../../model";
import { dispatch, usePersona, usePhState } from "../../store";
import { Button, Card, CardHeader, DataTable, DemoTag, EmptyState, Kpi, KpiStrip, PageHeader, Pill, RestrictedNotice, Select } from "../../ui";
import { salesAct } from "./actions";
import { LostReasonModal, NewLeadModal, createProgrammeTask } from "./LeadForms";
import type { LeadPrefill } from "./LeadForms";
import { PaymentPill, ProposalStatusPill, RecallPill, ServiceTags, SourceTag, StagePill, ViewOnly, useSalesRights } from "./shared";

export default function Sales({ tab }: { tab: string }) {
  const p = usePersona();
  if (p.isParticipant) {
    return (
      <div className="ph-page">
        <PageHeader title="Sales" />
        <RestrictedNotice title="Not available in the participant preview">Sales is for Precision Health staff. The participant preview shows only the participant's own information.</RestrictedNotice>
      </div>
    );
  }
  switch (tab) {
    case "proposals": return <Proposals />;
    case "price-list": return <PriceList />;
    case "recall": return <Recall />;
    case "partners": return <IrishLife />;
    default: return <Pipeline />;
  }
}

function Pipeline() {
  const state = usePhState();
  const rights = useSalesRights();
  const views = salesLeadViews(state);
  const [prefill, setPrefill] = useState<LeadPrefill | null>(null);
  const [lost, setLost] = useState<string | null>(null);
  const t = today(state);
  const open = views.filter((v) => v.lead.stage === "new" || v.lead.stage === "proposal_sent");
  const sent = views.filter((v) => v.lead.stage === "proposal_sent" && v.totals);
  const inbox = state.sales.inbox.filter((x) => x.status === "unassigned");
  const move = (leadId: string, stage: SalesStage) => { if (stage === "lost") setLost(leadId); else dispatch(salesAct.moveLead(leadId, stage)); };
  const lostLead = lost ? state.sales.leads.find((l) => l.id === lost) : null;
  return (
    <div className="ph-page">
      <PageHeader title="New Business Leads" sub="Leads grouped as on the Monday board: New contact leads, Proposal sent, Won and Lost. Contacts, references and phone numbers are fictional." actions={rights.manage ? <Button variant="primary" icon="plus" onClick={() => setPrefill({ source: "website" })}>Add lead</Button> : null} />
      <div className="ph-stack">
        {!rights.manage ? <ViewOnly /> : null}
        <KpiStrip>
          <Kpi label="New contact leads" value={views.filter((v) => v.lead.stage === "new").length} sub="Waiting for a reply or a proposal" />
          <Kpi label="Proposals out" value={sent.length} sub={salesEurRange(sent.reduce((n, v) => n + v.totals!.totalLow, 0), sent.reduce((n, v) => n + v.totals!.totalHigh, 0))} />
          <Kpi label="Won" value={views.filter((v) => v.lead.stage === "won").length} sub="Leads in the Won group" tone="ok" />
          <Kpi label="Next actions due" value={open.filter((v) => v.overdue || v.dueToday).length} sub={`${open.filter((v) => v.overdue).length} overdue as of ${fmtDate(t)}`} tone="warn" />
        </KpiStrip>
        <Card>
          <CardHeader title="Help Scout inbox" sub="Sales enquiries waiting in the shared inbox. Simulated sample: Help Scout is not connected." right={<DemoTag>Simulated</DemoTag>} />
          {inbox.length ? inbox.map((x) => (
            <div key={x.id} className="ph-row-flex" style={{ padding: "8px 0", borderTop: "1px solid var(--border)" }}>
              <div className="ph-grow"><div style={{ color: "var(--ink)", fontWeight: 500 }}>{x.company}: {x.subject}</div><div className="ph-dim" style={{ fontSize: 12 }}>{x.id}, {x.contactName}. {x.body}</div></div>
              {rights.manage ? <Button size="sm" icon="plus" onClick={() => setPrefill({ company: x.company, fictionalCompany: x.fictionalCompany, services: x.services, contactName: x.contactName, contactRole: x.contactRole, contactEmail: x.contactEmail, contactPhone: x.phone, source: "helpscout", sourceRef: x.id, enquiry: x.body, headcount: x.headcount, origin: { kind: "helpscout", id: x.id }, title: `Create lead from ${x.id}`, simulatedNote: "Prefilled from a sample Help Scout conversation. Nothing was read from a live inbox." })}>Create lead</Button> : null}
            </div>
          )) : <div className="ph-dim" style={{ fontSize: 12.5 }}>No unassigned sales enquiries.</div>}
        </Card>
        <Card pad={false}>
          <DataTable rows={views} rowKey={(v) => v.lead.id} caption="Leads" minWidth={980}
            columns={[
              { key: "lead", header: "Lead", nowrap: false, sort: (a, b) => a.lead.company.localeCompare(b.lead.company), cell: (v) => (
                <div style={{ minWidth: 200 }}><div style={{ color: "var(--ink)", fontWeight: 500 }}>{v.lead.company} <span className="ph-faint ph-mono" style={{ fontSize: 11 }}>{v.lead.id}</span></div><ServiceTags services={v.lead.services} /><div className="ph-dim" style={{ fontSize: 11.5 }}>{v.lead.contact.name}, {v.lead.contact.phone}</div></div>) },
              { key: "stage", header: "Group", sort: (a, b) => SALES_STAGES.indexOf(a.lead.stage) - SALES_STAGES.indexOf(b.lead.stage), cell: (v) => <StagePill stage={v.lead.stage} /> },
              { key: "source", header: "Source", cell: (v) => <SourceTag source={v.lead.source} sourceRef={v.lead.sourceRef} /> },
              { key: "next", header: "Next action", nowrap: false, cell: (v) => <div style={{ maxWidth: 260 }}><div>{v.lead.nextAction}</div><div className="ph-faint" style={{ fontSize: 11.5, color: v.overdue ? "var(--bad)" : undefined }}>{v.lead.nextActionOn ? `${fmtDate(v.lead.nextActionOn)}${v.overdue ? ", overdue" : v.dueToday ? ", today" : ""}` : "No date"}</div></div> },
              { key: "value", header: "Estimate", align: "right", cell: (v) => v.totals ? salesEurRange(v.totals.totalLow, v.totals.totalHigh) : <span className="ph-faint">No proposal</span> },
              { key: "move", header: "Move to", cell: (v) => rights.manage ? (
                <Select aria-label={`Move ${v.lead.company}`} value={v.lead.stage} onChange={(e) => move(v.lead.id, e.target.value as SalesStage)} style={{ width: 170 }}>
                  {SALES_STAGES.map((s) => <option key={s} value={s}>{SALES_STAGE_LABEL[s]}</option>)}
                </Select>) : null },
              { key: "handover", header: "", cell: (v) => rights.manage && v.lead.stage === "won" && !v.lead.handoverTaskId ? <Button size="sm" icon="arrow" onClick={() => createProgrammeTask(v.lead.id)}>Create programme</Button> : v.lead.handoverTaskId ? <span className="ph-faint">Task {v.lead.handoverTaskId}</span> : null },
            ]} />
        </Card>
      </div>
      {prefill ? <NewLeadModal prefill={prefill} onClose={() => setPrefill(null)} onCreated={() => setPrefill(null)} /> : null}
      {lostLead ? <LostReasonModal company={lostLead.company} onClose={() => setLost(null)} onConfirm={(r) => { dispatch(salesAct.moveLead(lostLead.id, "lost", r)); setLost(null); }} /> : null}
    </div>
  );
}

function Proposals() {
  const state = usePhState();
  const rights = useSalesRights();
  const s = state.sales;
  const rows = s.proposals.map((p) => ({ p, v: salesLatestVersion(p), lead: s.leads.find((l) => l.id === p.leadId) }));
  return (
    <div className="ph-page">
      <PageHeader title="Proposals" sub="Priced from the price list exactly as the client's proposal: days times the day rate (unused capacity does not reduce the day rate), flu at €15 per vaccine administered and conditional on vaccine supply. Sending is simulated: no email leaves Pulse." />
      <div className="ph-stack">
        {!rights.manage ? <ViewOnly /> : null}
        <Card pad={false}>
          <DataTable rows={rows} rowKey={(r) => r.p.id} caption="Proposals" minWidth={900}
            columns={[
              { key: "id", header: "Proposal", cell: (r) => <div><div style={{ color: "var(--ink)", fontWeight: 500 }}>{r.lead?.company || r.p.leadId}</div><div className="ph-faint ph-mono" style={{ fontSize: 11 }}>{r.p.id} v{r.v.version}, {r.v.config.title}</div></div> },
              { key: "status", header: "Status", cell: (r) => <ProposalStatusPill status={r.v.status} /> },
              { key: "basis", header: "Programme", nowrap: false, cell: (r) => { const t = salesVersionTotals(s, r.v); return <div className="ph-dim" style={{ fontSize: 12, maxWidth: 300 }}>{t.lines.map((l) => `${l.code} ${l.days} day${l.days === 1 ? "" : "s"} x ${salesEur(l.rate)} = ${salesEur(l.total)}`).join("; ")}{t.flu ? `; flu ${t.flu.lowQty} to ${t.flu.highQty} x ${salesEur(t.flu.rate)}` : ""}{t.exec ? `; executive ${t.exec.count} x ${salesEur(t.exec.rate)}` : ""}</div>; } },
              { key: "total", header: "Estimated total", align: "right", cell: (r) => { const t = salesVersionTotals(s, r.v); return salesEurRange(t.totalLow, t.totalHigh); } },
              { key: "act", header: "", cell: (r) => !rights.manage ? null : r.v.status === "draft" ? <Button size="sm" icon="send" onClick={() => dispatch(salesAct.sendProposal(r.p.id))}>Send (simulated)</Button>
                : r.v.status === "sent" ? <span className="ph-wrap"><Button size="sm" icon="check" onClick={() => dispatch(salesAct.decideProposal(r.p.id, "accepted"))}>Accepted</Button><Button size="sm" icon="x" onClick={() => dispatch(salesAct.decideProposal(r.p.id, "declined"))}>Declined</Button><Button size="sm" onClick={() => dispatch(salesAct.newProposalVersion(r.p.id))}>New version</Button></span>
                : r.v.status === "declined" ? <Button size="sm" onClick={() => dispatch(salesAct.newProposalVersion(r.p.id))}>New version</Button> : null },
            ]} />
        </Card>
        {(() => { const p = s.proposals[0]; const v = p && p.versions[p.versions.length - 1]; if (!v) return null; const t = salesProposalTotals(v.config, s.priceItems, v.prices); return (
          <Card><CardHeader title={`Worked example: ${p.id} v${v.version}`} sub="Recommended programme and flu scenarios as they appear in the proposal." />
            <div style={{ fontSize: 13, lineHeight: 1.7 }}>{t.lines.map((l) => <div key={l.itemId}>{l.code}: {l.days} days x {salesEur(l.rate)} = {salesEur(l.total)} (up to {l.capacity} appointments)</div>)}
              {t.flu ? <><div>If {t.flu.lowQty} are vaccinated: {salesEur(t.flu.low)}, total {salesEur(t.totalLow)}</div><div>If {t.flu.highQty} are vaccinated: {salesEur(t.flu.high)}, total {salesEur(t.totalHigh)}</div></> : null}</div></Card>); })()}
      </div>
    </div>
  );
}

function PriceList() {
  const state = usePhState();
  const rights = useSalesRights();
  const s = state.sales;
  return (
    <div className="ph-page">
      <PageHeader title="Price list" sub={`Price list v${s.priceVersion}. The client's own figures from the O'Callaghan Collection proposal. Items marked to confirm were derived from 2-day totals seen on screen.`} />
      <div className="ph-stack">
        {!rights.prices ? <ViewOnly>View only. Only Stephen Kelly changes the price list.</ViewOnly> : null}
        <Card pad={false}>
          <DataTable rows={s.priceItems} rowKey={(i) => i.id} caption="Price list" minWidth={900}
            columns={[
              { key: "code", header: "Package", nowrap: false, cell: (i) => <div style={{ minWidth: 160 }}><div style={{ color: "var(--ink)", fontWeight: 500 }}>{i.code}</div><div className="ph-faint" style={{ fontSize: 11 }}>{SALES_FAMILY_LABEL[i.family]}</div></div> },
              { key: "inc", header: "Includes", nowrap: false, cell: (i) => <div style={{ maxWidth: 320, fontSize: 12 }}>{i.includes}</div> },
              { key: "len", header: "Appointment", cell: (i) => i.minutes ? `${i.minutes} min` : <span className="ph-faint">Not stated</span> },
              { key: "cap", header: "Per day", cell: (i) => i.perDay ?? <span className="ph-faint">Not stated</span> },
              { key: "price", header: "Price", align: "right", cell: (i) => i.price === null ? <span className="ph-faint">Not supplied</span> : <span>{i.priceMax ? salesEurRange(i.price, i.priceMax) : salesEur(i.price)} <span className="ph-faint" style={{ fontSize: 11 }}>{SALES_UNIT_LABEL[i.unit]}</span></span> },
              { key: "status", header: "Status", cell: (i) => <Pill tone={i.status === "confirmed" ? "ok" : "warn"}>{SALES_PRICE_STATUS_LABEL[i.status]}</Pill> },
            ]} />
        </Card>
        <Card><CardHeader title="Version history" />{s.priceHistory.slice().reverse().map((h) => <div key={h.version} style={{ fontSize: 12.5, padding: "4px 0" }}>v{h.version}, {fmtDate(h.at)}, {h.by}: {h.summary} {h.reason}</div>)}</Card>
      </div>
    </div>
  );
}

function Recall() {
  const state = usePhState();
  const rights = useSalesRights();
  const recalls = salesRecalls(state);
  return (
    <div className="ph-page">
      <PageHeader title="Recall & repeat" sub="Stephen's rule: a client screened on a date is re-contacted for the same date next year, with planning about a month before. J&J screened 5 Feb, recall 5 Feb next year, conversation from early January. Engagement history is fictional." />
      <Card pad={false}>
        <DataTable rows={recalls} rowKey={(r) => r.id} caption="Recalls" minWidth={860}
          columns={[
            { key: "co", header: "Client", cell: (r) => <div><div style={{ color: "var(--ink)", fontWeight: 500 }}>{r.company}</div><div className="ph-faint" style={{ fontSize: 11 }}>{r.packageText}{r.lapsed ? ", lapsed" : ""}</div></div> },
            { key: "last", header: "Last screened", cell: (r) => fmtDate(r.screenedOn) },
            { key: "recall", header: "Recall date", cell: (r) => fmtDate(r.recallOn) },
            { key: "plan", header: "Planning from", cell: (r) => fmtDate(r.planFrom) },
            { key: "status", header: "Status", cell: (r) => <RecallPill status={r.status} /> },
            { key: "act", header: "", cell: (r) => rights.manage && !r.leadId ? <Button size="sm" icon="mail" onClick={() => dispatch(salesAct.draftOutreach(r.id, r.lapsed ? "lapsed" : "recall"))}>Draft email (simulated)</Button> : null },
          ]} />
      </Card>
    </div>
  );
}

function IrishLife() {
  const state = usePhState();
  const rights = useSalesRights();
  const rows = state.sales.ilh.filter((b) => !b.archived);
  return (
    <div className="ph-page">
      <PageHeader title="Irish Life Health" eyebrow="Confidential partner channel" sub="Current Screening Irish Life. The Irish Life relationship is confidential: do not share partner names, volumes or rates outside Precision Health. Corporate partners and invoices are fictional. Xero drafts are simulated and never sent." />
      <div className="ph-stack">
        {!rights.ilh ? <ViewOnly>View only. Stephen, Martina and Brenda update Irish Life bookings.</ViewOnly> : null}
        <Card pad={false}>
          <DataTable rows={rows} rowKey={(b) => b.id} caption="Irish Life bookings" minWidth={980}
            empty={<EmptyState title="No bookings" />}
            columns={[
              { key: "item", header: "Item", cell: (b) => <div><div style={{ color: "var(--ink)", fontWeight: 500 }}>{b.item}</div><div className="ph-faint" style={{ fontSize: 11 }}>{b.id}, {b.group === "lifestyle" ? "Lifestyle Checkpoint (weekly)" : "Bookings pending 2026"}</div></div> },
              { key: "date", header: "Date screening", cell: (b) => `${fmtDate(b.date)}, ${b.start}` },
              { key: "req", header: "Requested", cell: (b) => SALES_ILH_REQUESTED_LABEL[b.requested] },
              { key: "loc", header: "Location", cell: (b) => `${b.location}, ${b.eircode}` },
              { key: "inv", header: "Invoice", cell: (b) => b.invoice ? `${b.invoice.number}, ${salesEur(b.invoice.amount)}` : <span className="ph-faint">None</span> },
              { key: "pay", header: "Payment status", cell: (b) => <PaymentPill status={b.payment} /> },
              { key: "act", header: "", cell: (b) => !rights.ilh ? null : !b.screened ? (b.date <= today(state) ? <Button size="sm" onClick={() => dispatch(salesAct.ilhMarkScreened(b.id))}>Mark screened</Button> : null)
                : !b.invoice ? <Button size="sm" icon="file" onClick={() => { const need = b.requested !== "poc3"; const v = need ? Number(window.prompt("Agreed amount in euro (rate not on the price list)", "") || "") : null; dispatch(salesAct.ilhDraftInvoice(b.id, v)); }}>Draft invoice in Xero (simulated)</Button>
                : b.payment === "in_draft" ? <Button size="sm" onClick={() => dispatch(salesAct.ilhSetPayment(b.id, "awaiting_payment"))}>Mark sent from Xero</Button>
                : b.payment === "awaiting_payment" ? <Button size="sm" icon="check" onClick={() => dispatch(salesAct.ilhSetPayment(b.id, "paid"))}>Mark paid</Button>
                : <Button size="sm" onClick={() => dispatch(salesAct.ilhArchive(b.id))}>Archive</Button> },
            ]} />
        </Card>
      </div>
    </div>
  );
}
