/* Sales, Tenders: the Tender Watchdog board. Public tenders worth a look, with the closing date,
   status and two actions: "Make it a lead" (opens the new lead form, then the tender moves to
   Preparing a bid and links to the lead) and "Not for us". Every notice is fictional.
   Deep link: #/Sales/tenders */
import { useState } from "react";
import { SALES_SERVICE_LABEL, SALES_TENDER_STATUS_LABEL, daysBetween, fmtWeekdayDate, today } from "../../model";
import type { SalesTender, SalesTenderStatus } from "../../model";
import { dispatch, usePhState } from "../../store";
import { useNav } from "../../nav-context";
import { Button, Card, Chip, DemoTag, EmptyState, Icon, Kpi, KpiStrip, PageHeader, Pill } from "../../ui";
import type { Tone } from "../../ui";
import { salesAct } from "./actions";
import { NewLeadModal } from "./LeadForms";
import type { LeadPrefill } from "./LeadForms";
import { useSalesRights, ViewOnly } from "./shared";

const TONE: Record<SalesTenderStatus, Tone> = { watching: "info", preparing: "warn", submitted: "ok", not_bidding: "neutral" };
type Filter = "open" | "closed" | "all";

export default function Tenders() {
  const state = usePhState();
  const nav = useNav();
  const rights = useSalesRights();
  const t = today(state);
  const [filter, setFilter] = useState<Filter>("open");
  const [prefill, setPrefill] = useState<LeadPrefill | null>(null);
  const all = state.sales.tenders.slice().sort((a, b) => a.closesOn.localeCompare(b.closesOn));
  const isOpen = (x: SalesTender) => x.closesOn >= t && x.status !== "not_bidding";
  const rows = all.filter((x) => (filter === "all" ? true : filter === "open" ? isOpen(x) : !isOpen(x)));
  const soon = all.filter((x) => isOpen(x) && daysBetween(t, x.closesOn) <= 14);
  const makeLead = (x: SalesTender) => setPrefill({
    company: x.buyer, fictionalCompany: true, services: [x.service], source: "tender", sourceRef: `${x.id} (fictional tender)`, origin: { kind: "tender", id: x.id },
    enquiry: `${x.title}. ${x.valueText}. Closes ${fmtWeekdayDate(x.closesOn)}.`, title: `Make ${x.id} a lead`, simulatedNote: "From the Tender Watchdog. The notice is fictional.",
  });
  return (
    <div className="ph-page">
      <PageHeader title="Tender Watchdog" sub="Public tenders worth a look, soonest closing first. Turn one into a lead to start the bid, or mark it as not for us." actions={<DemoTag>Sample notices</DemoTag>} />
      <div className="ph-stack">
        {!rights.manage ? <ViewOnly /> : null}
        <KpiStrip>
          <Kpi label="Open tenders" value={all.filter(isOpen).length} sub="Still taking bids" icon="file" onClick={() => setFilter("open")} />
          <Kpi label="Closing in 14 days" value={soon.length} sub={soon[0] ? `Next: ${soon[0].id}, ${fmtWeekdayDate(soon[0].closesOn)}` : "Nothing urgent"} tone={soon.length ? "warn" : "ok"} icon="clock" />
          <Kpi label="Bids in progress" value={all.filter((x) => x.status === "preparing").length} sub="Preparing a bid" />
          <Kpi label="Not for us" value={all.filter((x) => x.status === "not_bidding").length} sub="Passed on" onClick={() => setFilter("closed")} />
        </KpiStrip>
        <div className="ph-wrap" style={{ gap: 6 }}>
          <Chip on={filter === "open"} onClick={() => setFilter("open")} count={all.filter(isOpen).length}>Open</Chip>
          <Chip on={filter === "closed"} onClick={() => setFilter("closed")} count={all.filter((x) => !isOpen(x)).length}>Closed or passed</Chip>
          <Chip on={filter === "all"} onClick={() => setFilter("all")} count={all.length}>All</Chip>
        </div>
        {rows.length ? rows.map((x) => {
          const days = daysBetween(t, x.closesOn);
          const closed = x.closesOn < t;
          const lead = x.leadId ? state.sales.leads.find((l) => l.id === x.leadId) : null;
          return (
            <Card key={x.id}>
              <div className="tw-row">
                <span className="tw-icon"><Icon name="file" size={17} /></span>
                <div className="tw-main">
                  <div className="tw-title">{x.title} <span className="ph-faint ph-mono" style={{ fontSize: 11 }}>{x.id}</span></div>
                  <div className="tw-sub">{x.buyer} · {SALES_SERVICE_LABEL[x.service]} · {x.valueText}</div>
                  <div className="tw-meta">
                    <Pill tone={TONE[x.status]}>{SALES_TENDER_STATUS_LABEL[x.status]}</Pill>
                    <span className={!closed && days <= 7 ? "tw-due soon" : "tw-due"}><Icon name="clock" size={12} />{closed ? `Closed ${fmtWeekdayDate(x.closesOn)}` : days === 0 ? "Closes today" : `Closes ${fmtWeekdayDate(x.closesOn)}, in ${days} day${days === 1 ? "" : "s"}`}</span>
                    {lead ? <button type="button" className="ph-link" onClick={() => nav.go({ page: "Sales", tab: "pipeline", params: { lead: lead.id } })}>Lead {lead.id}, {lead.company}</button> : null}
                  </div>
                </div>
                {rights.manage ? (
                  <div className="tw-actions">
                    {!x.leadId && !closed && x.status !== "not_bidding" ? <Button size="sm" variant="primary" icon="plus" onClick={() => makeLead(x)}>Make it a lead</Button> : null}
                    {x.status !== "not_bidding" && !closed ? <Button size="sm" variant="ghost" icon="x" onClick={() => dispatch(salesAct.setTenderStatus(x.id, "not_bidding"))}>Not for us</Button> : null}
                    {x.status === "not_bidding" && !closed ? <Button size="sm" icon="refresh" onClick={() => dispatch(salesAct.setTenderStatus(x.id, "watching"))}>Watch again</Button> : null}
                    {x.status === "preparing" && !closed ? <Button size="sm" icon="send" onClick={() => dispatch(salesAct.setTenderStatus(x.id, "submitted"))}>Bid submitted</Button> : null}
                  </div>) : null}
              </div>
            </Card>
          );
        }) : <Card pad={false}><EmptyState title="No tenders here" icon="check">Nothing in this list right now.</EmptyState></Card>}
      </div>
      {prefill ? <NewLeadModal prefill={prefill} onClose={() => setPrefill(null)} onCreated={(id) => { setPrefill(null); nav.go({ page: "Sales", tab: "pipeline", params: { lead: id } }); }} /> : null}
      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
.tw-row { display: flex; gap: 14px; align-items: flex-start; flex-wrap: wrap; }
.tw-icon { flex: none; width: 36px; height: 36px; border-radius: 11px; display: flex; align-items: center; justify-content: center; background: var(--accent-soft); color: var(--accent); }
.tw-main { flex: 1; min-width: 220px; }
.tw-title { color: var(--ink); font-weight: 600; font-size: 14px; line-height: 1.35; }
.tw-sub { color: var(--dim); font-size: 12.5px; margin-top: 3px; }
.tw-meta { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; margin-top: 8px; font-size: 12px; }
.tw-due { display: inline-flex; align-items: center; gap: 5px; color: var(--dim); }
.tw-due.soon { color: var(--warn); font-weight: 600; }
.tw-actions { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; justify-content: flex-end; }
@media (max-width: 640px) { .tw-actions { justify-content: flex-start; width: 100%; } }
`;
