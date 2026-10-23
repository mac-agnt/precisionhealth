/* Sales CRM: every lead and client in one clean list, filtered by stage, service, source and owner,
   with search and an overdue switch. A row opens the lead: contact, enquiry, proposal value, next
   action and history. Same records as the Pipeline board. */
import { useMemo, useState } from "react";
import { SALES_SERVICE_LABEL, SALES_SOURCES, SALES_SOURCE_LABEL, SALES_STAGE_LABEL, fmtDate, fmtShortDateTime, salesEurRange, salesLeadViews, today } from "../../model";
import type { SalesLeadView, SalesService, SalesSource, SalesStage } from "../../model";
import { usePhState } from "../../store";
import { Card, Chip, DataTable, Drawer, Kpi, KpiStrip, PageHeader, Pill, SearchBox, Section, Select, Switch } from "../../ui";
import type { Column, Tone } from "../../ui";

const STAGES: SalesStage[] = ["new", "proposal_sent", "won", "lost"];
const STAGE_TONE: Record<SalesStage, Tone> = { new: "info", proposal_sent: "warn", won: "ok", lost: "neutral" };

export default function Crm() {
  const s = usePhState();
  const t = today(s);
  const views = useMemo(() => salesLeadViews(s), [s]);
  const [q, setQ] = useState("");
  const [stage, setStage] = useState<SalesStage | "all">("all");
  const [service, setService] = useState<SalesService | "all">("all");
  const [source, setSource] = useState<SalesSource | "all">("all");
  const [overdue, setOverdue] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const services = [...new Set(views.flatMap((v) => v.lead.services))] as SalesService[];
  const shown = views.filter((v) => (stage === "all" || v.lead.stage === stage) && (service === "all" || v.lead.services.includes(service))
    && (source === "all" || v.lead.source === source) && (!overdue || v.overdue)
    && (!q || `${v.lead.company} ${v.lead.contact.name} ${v.lead.contact.email} ${v.lead.enquiry}`.toLowerCase().includes(q.toLowerCase())));
  const pipeline = views.filter((v) => v.lead.stage === "proposal_sent" && v.totals);
  const value = (v: SalesLeadView) => (v.totals ? v.totals.totalHigh : 0);

  const cols: Column<SalesLeadView>[] = [
    { key: "co", header: "Company", sort: (a, b) => a.lead.company.localeCompare(b.lead.company),
      cell: (v) => <div><div style={{ color: "var(--ink)", fontWeight: 500 }}>{v.lead.company}</div><div className="ph-faint" style={{ fontSize: 11.5 }}>{v.lead.contact.name}</div></div> },
    { key: "svc", header: "Service", cell: (v) => <span style={{ fontSize: 12 }}>{v.lead.services.map((x) => SALES_SERVICE_LABEL[x]).join(", ") || "To confirm"}</span> },
    { key: "src", header: "Source", nowrap: true, cell: (v) => <span style={{ fontSize: 12 }}>{SALES_SOURCE_LABEL[v.lead.source]}</span> },
    { key: "stage", header: "Stage", sort: (a, b) => STAGES.indexOf(a.lead.stage) - STAGES.indexOf(b.lead.stage), cell: (v) => <Pill tone={STAGE_TONE[v.lead.stage]}>{SALES_STAGE_LABEL[v.lead.stage]}</Pill> },
    { key: "val", header: "Value", align: "right", nowrap: true, sort: (a, b) => value(a) - value(b), cell: (v) => v.totals ? <span className="ph-num">{salesEurRange(v.totals.totalLow, v.totals.totalHigh)}</span> : <span className="ph-faint">No proposal</span> },
    { key: "next", header: "Next action", sort: (a, b) => (a.lead.nextActionOn || "9").localeCompare(b.lead.nextActionOn || "9"),
      cell: (v) => <div style={{ fontSize: 12 }}><div>{v.lead.nextAction || <span className="ph-faint">None</span>}</div>{v.lead.nextActionOn ? <div style={{ color: v.overdue ? "var(--bad)" : v.dueToday ? "var(--warn)" : "var(--faint)" }}>{v.overdue ? "Overdue: " : v.dueToday ? "Today: " : ""}{fmtDate(v.lead.nextActionOn)}</div> : null}</div> },
  ];
  const lead = open ? views.find((v) => v.lead.id === open) : null;

  return (
    <div className="ph-page">
      <PageHeader title="Sales CRM" sub="Every lead and client in one list. Filter, search, and click a company to see everything about it." />
      <KpiStrip>
        <Kpi label="Open leads" value={views.filter((v) => v.lead.stage === "new" || v.lead.stage === "proposal_sent").length} onClick={() => { setStage("all"); setOverdue(false); }} />
        <Kpi label="Proposals out" value={pipeline.length} sub={salesEurRange(pipeline.reduce((n, v) => n + v.totals!.totalLow, 0), pipeline.reduce((n, v) => n + v.totals!.totalHigh, 0))} onClick={() => setStage("proposal_sent")} />
        <Kpi label="Won" value={views.filter((v) => v.lead.stage === "won").length} tone="ok" onClick={() => setStage("won")} />
        <Kpi label="Overdue next actions" value={views.filter((v) => v.overdue).length} tone="bad" onClick={() => setOverdue(true)} />
      </KpiStrip>
      <Card>
        <div className="ph-row-flex ph-wrap" style={{ gap: 8, marginBottom: 10 }}>
          <SearchBox value={q} onChange={setQ} placeholder="Search company, contact or enquiry" width={300} />
          <Select value={service} onChange={(e) => setService(e.target.value as SalesService | "all")} style={{ width: 190 }} aria-label="Service">
            <option value="all">All services</option>{services.map((x) => <option key={x} value={x}>{SALES_SERVICE_LABEL[x]}</option>)}
          </Select>
          <Select value={source} onChange={(e) => setSource(e.target.value as SalesSource | "all")} style={{ width: 170 }} aria-label="Source">
            <option value="all">All sources</option>{SALES_SOURCES.map((x) => <option key={x} value={x}>{SALES_SOURCE_LABEL[x]}</option>)}
          </Select>
          <span className="ph-row-flex" style={{ gap: 8, fontSize: 12.5 }}><Switch on={overdue} onChange={setOverdue} label="Overdue only" />Overdue only</span>
        </div>
        <div className="ph-row-flex ph-wrap" style={{ gap: 6, marginBottom: 12 }}>
          <Chip on={stage === "all"} onClick={() => setStage("all")} count={views.length}>All stages</Chip>
          {STAGES.map((x) => <Chip key={x} on={stage === x} onClick={() => setStage(x)} count={views.filter((v) => v.lead.stage === x).length}>{SALES_STAGE_LABEL[x]}</Chip>)}
        </div>
        <DataTable rows={shown} columns={cols} rowKey={(v) => v.lead.id} onRowClick={(v) => setOpen(v.lead.id)} selectedKey={open} pageSize={25}
          initialSort={{ key: "next", dir: 1 }} caption="Sales CRM" empty={<div className="ph-faint" style={{ padding: 20 }}>No leads match these filters.</div>}
          footerNote={<>{shown.length} of {views.length} shown. Contacts and references are fictional. Today in the demo: {fmtDate(t)}.</>} />
      </Card>
      {lead ? (
        <Drawer open onClose={() => setOpen(null)} width={620} title={lead.lead.company} sub={<>{lead.lead.services.map((x) => SALES_SERVICE_LABEL[x]).join(", ")} · {SALES_SOURCE_LABEL[lead.lead.source]} · received {fmtDate(lead.lead.receivedOn)}</>}>
          <div className="ph-stack" style={{ gap: 16 }}>
            <div className="ph-row-flex" style={{ gap: 8 }}><Pill tone={STAGE_TONE[lead.lead.stage]}>{SALES_STAGE_LABEL[lead.lead.stage]}</Pill>{lead.overdue ? <Pill tone="bad" icon="clock">Next action overdue</Pill> : null}</div>
            <Section title="Contact">
              <div style={{ fontSize: 12.5, lineHeight: 1.6 }}><strong style={{ color: "var(--ink)" }}>{lead.lead.contact.name}</strong>, {lead.lead.contact.role}<br />{lead.lead.contact.email} · {lead.lead.contact.phone}</div>
            </Section>
            <Section title="Enquiry"><div style={{ fontSize: 12.5, lineHeight: 1.55 }}>{lead.lead.enquiry}</div></Section>
            <Section title="Proposal">
              <div style={{ fontSize: 12.5 }}>{lead.totals ? <>Version {lead.version?.version}: <strong className="ph-num" style={{ color: "var(--ink)" }}>{salesEurRange(lead.totals.totalLow, lead.totals.totalHigh)}</strong> ({lead.version?.status})</> : "No proposal yet."}</div>
            </Section>
            <Section title="Next action"><div style={{ fontSize: 12.5 }}>{lead.lead.nextAction || "None"}{lead.lead.nextActionOn ? ` · ${fmtDate(lead.lead.nextActionOn)}` : ""}</div></Section>
            <Section title="History">
              <ul className="scr-list" style={{ listStyle: "none", margin: 0, padding: 0 }}>{lead.lead.history.slice().reverse().map((h, i) => <li key={i} style={{ fontSize: 12.5, padding: "7px 0", borderTop: i ? "1px solid var(--border)" : 0 }}><span className="ph-faint">{fmtShortDateTime(h.at)}</span> {h.text}</li>)}</ul>
            </Section>
          </div>
        </Drawer>) : null}
    </div>
  );
}
