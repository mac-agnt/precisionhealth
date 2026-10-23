/* Sales CRM. Two views of the same leads: a pipeline board with the stages of Precision Health's
   Monday "New Business Leads" board (New contact leads, Proposal sent, Won, Lost), where a card is
   dragged to move it, and a filterable list. A lead opens a workspace: move stage, log a call,
   email, meeting or note, set the next action, research with the agent, start a proposal, and the
   full timeline. Same records as the Pipeline and Proposals tabs. */
import "./crmActions";
import { useMemo, useState } from "react";
import type { DragEvent } from "react";
import { SALES_BUDGET_LABEL, SALES_SERVICE_LABEL, SALES_SOURCES, SALES_SOURCE_LABEL, SALES_STAGE_LABEL, act, fmtDate, fmtShortDateTime, salesEur, salesEurRange, salesLeadViews, today } from "../../model";
import type { SalesLeadView, SalesService, SalesSource, SalesStage } from "../../model";
import { useNav } from "../../nav-context";
import { dispatch, usePersona, usePhState } from "../../store";
import { Button, Card, Chip, DataTable, Drawer, Field, Icon, Kpi, KpiStrip, PageHeader, Pill, SearchBox, Section, Segmented, Select, Switch, TextInput, Textarea } from "../../ui";
import type { Column } from "../../ui";
import { salesAct } from "./actions";
import { CRM_ACTIVITY_LABEL, crmAct } from "./crmActions";
import type { CrmActivityKind } from "./crmActions";
import { LostReasonModal, NewLeadModal } from "./LeadForms";
import type { LeadPrefill } from "./LeadForms";
import { STAGE_LOOK, StagePill, useSalesRights } from "./shared";

const STAGES: SalesStage[] = ["new", "proposal_sent", "won", "lost"];
const value = (v: SalesLeadView) => (v.totals ? v.totals.totalHigh : 0);
const valueText = (v: SalesLeadView) => (v.totals ? salesEurRange(v.totals.totalLow, v.totals.totalHigh) : "");

export default function Crm() {
  const s = usePhState();
  const p = usePersona();
  const rights = useSalesRights();
  const t = today(s);
  const views = useMemo(() => salesLeadViews(s), [s]);
  const [mode, setMode] = useState<"board" | "list">("board");
  const [q, setQ] = useState("");
  const [stage, setStage] = useState<SalesStage | "all">("all");
  const [service, setService] = useState<SalesService | "all">("all");
  const [source, setSource] = useState<SalesSource | "all">("all");
  const [overdue, setOverdue] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState<LeadPrefill | null>(null);
  const [lost, setLost] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<SalesStage | null>(null);

  const services = [...new Set(views.flatMap((v) => v.lead.services))] as SalesService[];
  const match = (v: SalesLeadView) => (service === "all" || v.lead.services.includes(service)) && (source === "all" || v.lead.source === source) && (!overdue || v.overdue)
    && (!q || `${v.lead.company} ${v.lead.contact.name} ${v.lead.contact.email} ${v.lead.enquiry}`.toLowerCase().includes(q.toLowerCase()));
  const filtered = views.filter(match);
  const shown = filtered.filter((v) => stage === "all" || v.lead.stage === stage);
  const openDeals = views.filter((v) => v.lead.stage === "proposal_sent" && v.totals);
  const won = views.filter((v) => v.lead.stage === "won").length, lostN = views.filter((v) => v.lead.stage === "lost").length;
  const move = (leadId: string, to: SalesStage) => {
    const lead = views.find((v) => v.lead.id === leadId)?.lead;
    if (!lead || lead.stage === to) return;
    if (to === "lost") setLost(leadId); else dispatch(salesAct.moveLead(leadId, to));
  };
  const onDrop = (e: DragEvent, to: SalesStage) => { e.preventDefault(); setDragOver(null); const id = e.dataTransfer.getData("text/plain"); if (id) move(id, to); };
  const lostLead = lost ? s.sales.leads.find((l) => l.id === lost) : null;
  const lead = open ? views.find((v) => v.lead.id === open) || null : null;

  const cols: Column<SalesLeadView>[] = [
    { key: "co", header: "Company", sort: (a, b) => a.lead.company.localeCompare(b.lead.company),
      cell: (v) => <div><div style={{ color: "var(--ink)", fontWeight: 500 }}>{v.lead.company}</div><div className="ph-faint" style={{ fontSize: 11.5 }}>{v.lead.contact.name}</div></div> },
    { key: "svc", header: "Service", cell: (v) => <span style={{ fontSize: 12 }}>{v.lead.services.map((x) => SALES_SERVICE_LABEL[x]).join(", ") || "To confirm"}</span> },
    { key: "src", header: "Source", nowrap: true, cell: (v) => <span style={{ fontSize: 12 }}>{SALES_SOURCE_LABEL[v.lead.source]}</span> },
    { key: "stage", header: "Stage", sort: (a, b) => STAGES.indexOf(a.lead.stage) - STAGES.indexOf(b.lead.stage), cell: (v) => <StagePill stage={v.lead.stage} /> },
    { key: "val", header: "Value", align: "right", nowrap: true, sort: (a, b) => value(a) - value(b), cell: (v) => v.totals ? <span className="ph-num">{valueText(v)}</span> : <span className="ph-faint">No proposal</span> },
    { key: "next", header: "Next action", sort: (a, b) => (a.lead.nextActionOn || "9").localeCompare(b.lead.nextActionOn || "9"), cell: (v) => <NextAction v={v} /> },
  ];

  return (
    <div className="ph-page">
      <style>{CSS}</style>
      <PageHeader title="Sales CRM" sub="Every lead and client, from first enquiry to won. Stages match the Monday New Business Leads board. Drag a card to move it; click it to work the lead."
        actions={rights.manage ? <Button variant="primary" icon="plus" onClick={() => setAdding({ source: "website" })}>Add lead</Button> : null} />
      {!rights.manage ? (
        <div className="crm-banner"><Icon name="info" size={15} /><span className="ph-grow">You are viewing as {p.name}. Stephen Kelly owns sales, so leads are view only.</span>
          <Button size="sm" variant="primary" onClick={() => dispatch(act.setPersona("stephen"))}>Work as Stephen</Button></div>) : null}
      <KpiStrip>
        <Kpi label="Open leads" value={views.filter((v) => v.lead.stage === "new" || v.lead.stage === "proposal_sent").length} sub={`${views.filter((v) => v.lead.stage === "new").length} new, ${openDeals.length} with a proposal out`} />
        <Kpi label="Pipeline value" value={salesEur(openDeals.reduce((n, v) => n + v.totals!.totalHigh, 0))} sub="Proposals out, high estimate" />
        <Kpi label="Win rate" value={won + lostN ? `${Math.round((won / (won + lostN)) * 100)}%` : "No decisions"} sub={`${won} won, ${lostN} lost`} tone="ok" />
        <Kpi label="Overdue next actions" value={views.filter((v) => v.overdue).length} tone={views.some((v) => v.overdue) ? "bad" : "ok"} onClick={() => setOverdue(true)} sub={`As of ${fmtDate(t)}`} />
      </KpiStrip>

      <Card>
        <div className="crm-filters">
          <Segmented value={mode} onChange={setMode} label="View" options={[{ id: "board", label: "Pipeline board" }, { id: "list", label: "List" }]} />
          <SearchBox value={q} onChange={setQ} placeholder="Search company, contact or enquiry" width={280} />
          <Select value={service} onChange={(e) => setService(e.target.value as SalesService | "all")} style={{ width: 180 }} aria-label="Service">
            <option value="all">All services</option>{services.map((x) => <option key={x} value={x}>{SALES_SERVICE_LABEL[x]}</option>)}
          </Select>
          <Select value={source} onChange={(e) => setSource(e.target.value as SalesSource | "all")} style={{ width: 160 }} aria-label="Source">
            <option value="all">All sources</option>{SALES_SOURCES.map((x) => <option key={x} value={x}>{SALES_SOURCE_LABEL[x]}</option>)}
          </Select>
          <span className="ph-row-flex" style={{ gap: 8, fontSize: 12.5 }}><Switch on={overdue} onChange={setOverdue} label="Overdue only" />Overdue only</span>
        </div>

        {mode === "board" ? (
          <div className="crm-board">
            {STAGES.map((st) => {
              const items = filtered.filter((v) => v.lead.stage === st).sort((a, b) => (a.lead.nextActionOn || "9").localeCompare(b.lead.nextActionOn || "9"));
              const total = items.reduce((n, v) => n + value(v), 0);
              return (
                <div key={st} className={`crm-col${dragOver === st ? " over" : ""}`} onDragOver={(e) => { if (rights.manage) { e.preventDefault(); setDragOver(st); } }} onDragLeave={() => setDragOver(null)} onDrop={(e) => onDrop(e, st)}>
                  <div className="crm-col-head">
                    <span className="crm-col-title"><Icon name={STAGE_LOOK[st].icon} size={13} />{SALES_STAGE_LABEL[st]}</span>
                    <span className="ph-num ph-faint">{items.length}</span>
                  </div>
                  <div className="crm-col-sum">{total ? salesEur(total) : "No value yet"}</div>
                  <div className="crm-cards">
                    {items.map((v) => (
                      <button key={v.lead.id} type="button" className="crm-card" draggable={rights.manage} onDragStart={(e) => e.dataTransfer.setData("text/plain", v.lead.id)} onClick={() => setOpen(v.lead.id)}>
                        <span className="crm-card-co">{v.lead.company}</span>
                        <span className="crm-card-sub">{v.lead.contact.name} · {SALES_SOURCE_LABEL[v.lead.source]}</span>
                        <span className="crm-tags">{v.lead.services.map((x) => <span key={x} className="crm-tag">{SALES_SERVICE_LABEL[x]}</span>)}</span>
                        {v.totals ? <span className="crm-card-val ph-num">{valueText(v)}</span> : null}
                        {v.lead.stage === "new" || v.lead.stage === "proposal_sent" ? <span className="crm-card-next"><NextAction v={v} compact /></span> : null}
                      </button>))}
                    {!items.length ? <div className="crm-empty">{rights.manage ? "Drop a lead here" : "None"}</div> : null}
                  </div>
                </div>);
            })}
          </div>
        ) : (
          <>
            <div className="ph-row-flex ph-wrap" style={{ gap: 6, marginBottom: 12 }}>
              <Chip on={stage === "all"} onClick={() => setStage("all")} count={filtered.length}>All stages</Chip>
              {STAGES.map((x) => <Chip key={x} on={stage === x} onClick={() => setStage(x)} count={filtered.filter((v) => v.lead.stage === x).length}>{SALES_STAGE_LABEL[x]}</Chip>)}
            </div>
            <DataTable rows={shown} columns={cols} rowKey={(v) => v.lead.id} onRowClick={(v) => setOpen(v.lead.id)} selectedKey={open} pageSize={25}
              initialSort={{ key: "next", dir: 1 }} caption="Sales CRM" empty={<div className="ph-faint" style={{ padding: 20 }}>No leads match these filters.</div>}
              footerNote={<>{shown.length} of {views.length} shown. Contacts and references are fictional.</>} />
          </>
        )}
      </Card>

      {lead ? <LeadWorkspace v={lead} onClose={() => setOpen(null)} onMove={(to) => move(lead.lead.id, to)} /> : null}
      {adding ? <NewLeadModal prefill={adding} onClose={() => setAdding(null)} onCreated={(id) => { setAdding(null); setOpen(id); }} /> : null}
      {lostLead ? <LostReasonModal company={lostLead.company} onClose={() => setLost(null)} onConfirm={(reason) => { if (dispatch(salesAct.moveLead(lostLead.id, "lost", reason)).ok) setLost(null); }} /> : null}
    </div>
  );
}

function NextAction({ v, compact }: { v: SalesLeadView; compact?: boolean }) {
  if (!v.lead.nextAction) return <span className="ph-faint" style={{ fontSize: 12 }}>No next action</span>;
  const tone = v.overdue ? "var(--bad)" : v.dueToday ? "var(--warn)" : "var(--faint)";
  return (
    <span style={{ fontSize: 12, display: "block" }}>
      {compact ? null : <span style={{ display: "block" }}>{v.lead.nextAction}</span>}
      {v.lead.nextActionOn ? <span style={{ color: tone, display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name="clock" size={11} />{v.overdue ? "Overdue " : v.dueToday ? "Today " : ""}{fmtDate(v.lead.nextActionOn)}</span> : null}
      {compact ? <span style={{ display: "block", color: "var(--dim)" }}>{v.lead.nextAction}</span> : null}
    </span>
  );
}

function LeadWorkspace({ v, onClose, onMove }: { v: SalesLeadView; onClose: () => void; onMove: (to: SalesStage) => void }) {
  const s = usePhState();
  const nav = useNav();
  const rights = useSalesRights();
  const L = v.lead;
  const [kind, setKind] = useState<CrmActivityKind>("call");
  const [text, setText] = useState("");
  const [next, setNext] = useState("");
  const [nextOn, setNextOn] = useState("");
  const log = () => { if (dispatch(crmAct.logActivity(L.id, kind, text, next, nextOn || null)).ok) { setText(""); setNext(""); setNextOn(""); } };
  const staff = (id: string) => s.staff.find((x) => x.id === id)?.name || id;
  return (
    <Drawer open onClose={onClose} width={680} title={L.company}
      sub={<>{L.services.map((x) => SALES_SERVICE_LABEL[x]).join(", ") || "Service to confirm"} · {SALES_SOURCE_LABEL[L.source]}{L.sourceRef ? ` (${L.sourceRef})` : ""} · received {fmtDate(L.receivedOn)} · owner {staff(L.ownerId)}</>}>
      <div className="ph-stack" style={{ gap: 18 }}>
        <div className="crm-stages" role="group" aria-label="Stage">
          {STAGES.map((st) => (
            <button key={st} type="button" className={`crm-stage${L.stage === st ? " on" : ""}`} disabled={!rights.manage || L.stage === st} onClick={() => onMove(st)}>
              <Icon name={STAGE_LOOK[st].icon} size={12} />{SALES_STAGE_LABEL[st]}
            </button>))}
        </div>
        {L.lostReason ? <div className="crm-banner"><Icon name="x" size={14} /><span>Lost: {L.lostReason}</span></div> : null}

        <div className="crm-kv">
          <div><p className="crm-k">Contact</p><p className="crm-v"><strong>{L.contact.name}</strong>, {L.contact.role}<br />{L.contact.email}<br />{L.contact.phone}</p></div>
          <div><p className="crm-k">Deal</p><p className="crm-v">{v.totals ? <><strong className="ph-num">{valueText(v)}</strong><br />Proposal v{v.version?.version}, {v.version?.status}</> : "No proposal yet"}</p></div>
          <div><p className="crm-k">Qualifier</p><p className="crm-v">{L.qualifier.headcount ? `${L.qualifier.headcount} people` : "Headcount unknown"}{L.qualifier.sites ? `, ${L.qualifier.sites} site${L.qualifier.sites > 1 ? "s" : ""}` : ""}<br />{L.qualifier.dates || "Dates to confirm"}<br />Budget: {SALES_BUDGET_LABEL[L.qualifier.budget]}</p></div>
          <div><p className="crm-k">Next action</p><p className="crm-v"><NextAction v={v} /></p></div>
        </div>

        <div className="ph-row-flex ph-wrap" style={{ gap: 8 }}>
          {rights.manage && !L.research ? <Button size="sm" icon="spark" onClick={() => dispatch(salesAct.research(L.id))}>Research with agent</Button> : null}
          {rights.manage && !v.proposal && L.stage !== "won" && L.stage !== "lost" ? <Button size="sm" icon="file" onClick={() => { if (dispatch(salesAct.createProposal(L.id)).ok) nav.go({ page: "Sales", tab: "proposals" }); }}>Start proposal</Button> : null}
          {v.proposal ? <Button size="sm" icon="file" onClick={() => nav.go({ page: "Sales", tab: "proposals" })}>Open proposal</Button> : null}
          <Button size="sm" icon="mail" onClick={() => { try { window.location.href = `mailto:${L.contact.email}`; } catch { /* ignore */ } }}>Email contact</Button>
        </div>

        <Section title="Enquiry"><div style={{ fontSize: 12.5, lineHeight: 1.55 }}>{L.enquiry}</div></Section>
        {L.research ? <Section title="Agent research" sub="Prepared by the Sales agent for Stephen to check. Demo text."><div style={{ fontSize: 12.5, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{L.research}</div></Section> : null}

        {rights.manage ? (
          <Section title="Log activity">
            <div className="ph-stack" style={{ gap: 10 }}>
              <Segmented value={kind} onChange={setKind} label="Activity type" options={(Object.keys(CRM_ACTIVITY_LABEL) as CrmActivityKind[]).map((k) => ({ id: k, label: CRM_ACTIVITY_LABEL[k] }))} />
              <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="What happened? For example: spoke to Gráinne, they want two flu days in early November." aria-label="What happened" />
              <div className="crm-next">
                <Field label="Next action (optional)"><TextInput value={next} onChange={(e) => setNext(e.target.value)} placeholder="Send revised proposal" /></Field>
                <Field label="Due"><TextInput type="date" value={nextOn} onChange={(e) => setNextOn(e.target.value)} /></Field>
              </div>
              <div className="ph-row-flex" style={{ justifyContent: "flex-end" }}><Button variant="primary" icon="check" onClick={log} disabled={text.trim().length < 3}>Log {CRM_ACTIVITY_LABEL[kind].toLowerCase()}</Button></div>
            </div>
          </Section>) : null}

        <Section title="Timeline">
          <ul className="crm-timeline">{L.history.slice().reverse().map((h, i) => (
            <li key={i}><span className="crm-dot" /><div><div style={{ fontSize: 12.5, lineHeight: 1.5 }}>{h.text}</div><div className="ph-faint" style={{ fontSize: 11.5 }}>{fmtShortDateTime(h.at)} · {staff(h.by)}</div></div></li>))}</ul>
        </Section>
      </div>
    </Drawer>
  );
}

const CSS = `
.crm-filters { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 14px; }
.crm-banner { display: flex; align-items: center; gap: 10px; padding: 10px 14px; margin-bottom: 14px; border-radius: var(--r-md, 14px); background: var(--accent-soft); color: var(--body); font-size: 12.5px; }
.crm-board { display: grid; grid-template-columns: repeat(4, minmax(220px, 1fr)); gap: 12px; overflow-x: auto; padding-bottom: 4px; }
.crm-col { background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--r-md, 14px); padding: 12px; min-height: 320px; display: flex; flex-direction: column; transition: border-color .15s, background .15s; }
.crm-col.over { border-color: var(--accent); background: var(--accent-soft); }
.crm-col-head { display: flex; align-items: center; justify-content: space-between; }
.crm-col-title { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; font-size: 13px; color: var(--ink); }
.crm-col-sum { font-size: 12px; color: var(--dim); margin: 2px 0 10px; font-variant-numeric: tabular-nums; }
.crm-cards { display: flex; flex-direction: column; gap: 8px; flex: 1; }
.crm-card { display: flex; flex-direction: column; gap: 5px; text-align: left; padding: 11px 12px; border-radius: 12px; border: 1px solid var(--border); background: var(--surface); color: inherit; font: inherit; cursor: pointer; transition: border-color .15s, transform .15s, box-shadow .15s; }
.crm-card:hover { border-color: var(--accent); transform: translateY(-1px); box-shadow: 0 6px 18px rgba(0,0,0,.12); }
.crm-card[draggable="true"] { cursor: grab; }
.crm-card:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.crm-card-co { font-weight: 600; font-size: 13px; color: var(--ink); }
.crm-card-sub { font-size: 11.5px; color: var(--faint); }
.crm-tags { display: flex; flex-wrap: wrap; gap: 4px; }
.crm-tag { font-size: 10.5px; padding: 2px 7px; border-radius: 999px; background: var(--track); color: var(--dim); }
.crm-card-val { font-size: 12.5px; font-weight: 600; color: var(--ink); }
.crm-card-next { border-top: 1px dashed var(--border); padding-top: 6px; }
.crm-empty { font-size: 12px; color: var(--faint); text-align: center; padding: 18px 8px; border: 1px dashed var(--border); border-radius: 12px; }
.crm-stages { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
.crm-stage { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 8px 6px; border-radius: 10px; border: 1px solid var(--border); background: var(--surface-2); color: var(--dim); font: inherit; font-size: 12px; cursor: pointer; }
.crm-stage.on { background: var(--accent); color: var(--on-accent); border-color: var(--accent); font-weight: 600; }
.crm-stage:disabled { cursor: default; }
.crm-stage:not(.on):not(:disabled):hover { border-color: var(--accent); color: var(--ink); }
.crm-kv { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 18px; }
.crm-k { font-size: 11px; color: var(--faint); margin: 0 0 3px; text-transform: uppercase; letter-spacing: .04em; }
.crm-v { margin: 0; font-size: 12.5px; color: var(--body); line-height: 1.5; }
.crm-v strong { color: var(--ink); }
.crm-next { display: grid; grid-template-columns: minmax(0, 1fr) 170px; gap: 10px; }
.crm-timeline { list-style: none; margin: 0; padding: 0; }
.crm-timeline li { display: flex; gap: 10px; padding: 8px 0; }
.crm-dot { flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--accent); margin-top: 6px; }
@media (max-width: 900px) { .crm-board { grid-template-columns: repeat(4, 240px); } .crm-kv { grid-template-columns: minmax(0, 1fr); } }
`;
