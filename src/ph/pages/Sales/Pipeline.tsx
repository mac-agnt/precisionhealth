/* Pipeline: Stephen's board. Value and weighted forecast per stage, and on every card the value,
   how likely it is, how old the deal is, the next step and when it is due (overdue in red), with
   quick actions (log call, follow up, book meeting, move stage). Saved views, search and filters
   live in the URL, so a view can be shared or bookmarked. A list view adds bulk actions.
   A card opens the deal room: #/Sales/pipeline?lead=LD-0009. */
import { useMemo, useState } from "react";
import type { DragEvent } from "react";
import {
  DESK_STEP_LABEL, DESK_VIEWS, SALES_SERVICE_LABEL, SALES_SOURCES, SALES_SOURCE_LABEL, SALES_STAGE_LABEL, deskDeals, deskFilterFrom, deskFilterParams, deskForecast, deskInView, deskMatches,
  fmtWeekdayDate, salesEur, today,
} from "../../model";
import type { DeskDeal, DeskFilter, DeskViewId, SalesService, SalesStage, StaffId } from "../../model";
import { useNav } from "../../nav-context";
import { dispatch, usePersona, usePhState } from "../../store";
import { Button, Card, Icon, Pill, SearchBox, Segmented, Select, Switch, TextInput } from "../../ui";
import { salesAct } from "./actions";
import { deskAct } from "./deskActions";
import { DESK_CSS, DealDialogs, QuickActions, ValueLine, dueText, eurK, useDealDialogs } from "./DealKit";
import { NewLeadModal } from "./LeadForms";
import type { LeadPrefill } from "./LeadForms";
import { TouchTimer, useMarkWon } from "./LeadFlow";
import { salesInboundFor, salesNextFollowLabel } from "../../model";
import { STAGE_LOOK, useSalesRights } from "./shared";

const STAGES: SalesStage[] = ["new", "proposal_sent", "won", "lost"];
/** Last pipeline filters, so "Back to pipeline" from a deal returns to the same view. */
export let lastPipelineParams: Record<string, string> = {};

export default function Pipeline() {
  return <DealDialogs><Board /></DealDialogs>;
}

function Board() {
  const s = usePhState();
  const nav = useNav();
  const p = usePersona();
  const rights = useSalesRights();
  const dlg = useDealDialogs();
  const markWon = useMarkWon();
  const t = today(s);
  const f = deskFilterFrom(nav.params);
  const mode = nav.params.mode === "list" ? "list" : "board";
  const set = (patch: Partial<DeskFilter>, m = mode) => { const next = deskFilterParams({ ...f, ...patch }, m === "list" ? { mode: "list" } : {}); lastPipelineParams = next; nav.setParams(next); };
  lastPipelineParams = deskFilterParams(f, mode === "list" ? { mode: "list" } : {});
  const all = useMemo(() => deskDeals(s), [s]);
  const shown = all.filter((d) => deskMatches(d, f, p.id));
  const fc = useMemo(() => deskForecast(s), [s]);
  const month = fc.months.find((m) => m.current)!;
  const open = all.filter((d) => d.open);
  const [adding, setAdding] = useState<LeadPrefill | null>(null);
  const [dragOver, setDragOver] = useState<SalesStage | null>(null);
  const inbox = s.sales.inbox.filter((x) => x.status === "unassigned");
  const openDeal = (id: string) => nav.go({ page: "Sales", tab: "pipeline", params: { lead: id } });
  const move = (id: string, to: SalesStage) => {
    const d = all.find((x) => x.lead.id === id);
    if (!d || d.lead.stage === to) return;
    if (to === "won") markWon(id); else if (to === "lost") dlg.open("lost", id); else dispatch(salesAct.moveLead(id, to));
  };
  const onDrop = (e: DragEvent, to: SalesStage) => { e.preventDefault(); setDragOver(null); const id = e.dataTransfer.getData("text/plain"); if (id) move(id, to); };
  const viewCount = (v: DeskViewId) => all.filter((d) => deskInView(d, v, p.id) && (v === "all" || d.open || v === "mine")).length;
  const services = Array.from(new Set(all.flatMap((d) => d.lead.services))) as SalesService[];

  return (
    <div className="ph-page">
      <style>{DESK_CSS + PIPE_CSS}</style>
      <div className="sp-head">
        <div style={{ minWidth: 0 }}>
          <div className="ph-eyebrow">Sell</div>
          <h1 className="ph-h1">Pipeline</h1>
          <p className="sp-sub">Every deal from first enquiry to won. Click a deal to open its room; drag it to move it on.</p>
        </div>
        {rights.manage ? <Button variant="primary" icon="plus" onClick={() => setAdding({ source: "website" })}>Add lead</Button> : null}
      </div>

      <div className="sp-kpis">
        <button type="button" className="sp-kpi" onClick={() => set({ view: "all", overdue: false })}>
          <span className="sp-k">Open pipeline</span><span className="sp-v ph-num">{eurK(fc.openValue)}</span><span className="sp-s">{open.length} open deals</span>
        </button>
        <button type="button" className="sp-kpi" onClick={() => nav.go({ page: "Sales", tab: "forecast" })}>
          <span className="sp-k">Weighted forecast</span><span className="sp-v ph-num">{eurK(fc.openWeighted)}</span><span className="sp-s">Value times the chance of winning</span>
        </button>
        <button type="button" className="sp-kpi" onClick={() => nav.go({ page: "Sales", tab: "forecast" })}>
          <span className="sp-k">{month.label.replace(/ \d+$/, "")}: won against target</span>
          <span className="sp-v ph-num">{eurK(month.won)} <small>of {eurK(month.target)}</small></span>
          <span className="sp-bar"><span style={{ width: `${Math.min(100, (month.won / month.target) * 100)}%` }} /><span className="w" style={{ width: `${Math.min(100 - Math.min(100, (month.won / month.target) * 100), (month.weighted / month.target) * 100)}%` }} /></span>
          <span className="sp-s">{eurK(month.weighted)} more weighted to close this month</span>
        </button>
        <button type="button" className={`sp-kpi${open.some((d) => d.overdue) ? " bad" : ""}`} onClick={() => set({ overdue: !f.overdue })} aria-pressed={f.overdue}>
          <span className="sp-k">Overdue next steps</span><span className="sp-v ph-num">{open.filter((d) => d.overdue).length}</span><span className="sp-s">{f.overdue ? "Showing only these. Click to clear" : `As of ${fmtWeekdayDate(t)}. Click to show`}</span>
        </button>
      </div>

      {inbox.length && rights.manage ? (
        <div className="sp-inbox">
          <span className="sp-inbox-k"><Icon name="mail" size={13} />Help Scout <span className="ph-num">{inbox.length}</span></span>
          {inbox.map((x) => (
            <button key={x.id} type="button" className="sp-inbox-item" onClick={() => setAdding({ company: x.company, fictionalCompany: x.fictionalCompany, services: x.services, contactName: x.contactName, contactRole: x.contactRole, contactEmail: x.contactEmail, contactPhone: x.phone, source: "helpscout", sourceRef: x.id, enquiry: x.body, headcount: x.headcount, origin: { kind: "helpscout", id: x.id }, title: `Create lead from ${x.company}`, simulatedNote: "Prefilled from a sample Help Scout conversation. Nothing was read from a live inbox." })}>
              <b>{x.company}</b><span>{x.subject}</span><span className="sp-inbox-go"><Icon name="plus" size={12} />Make it a lead</span>
            </button>))}
        </div>) : null}

      <div className="sp-views" role="tablist" aria-label="Saved views">
        {DESK_VIEWS.map((v) => (
          <button key={v.id} type="button" role="tab" aria-selected={f.view === v.id} className={`sp-view${f.view === v.id ? " on" : ""}`} title={v.hint} onClick={() => set({ view: v.id })}>
            {v.id === "hot" ? <Icon name="spark" size={12} /> : null}{v.label}<span className="ph-num">{viewCount(v.id)}</span>
          </button>))}
      </div>
      <div className="sp-tools">
        <Segmented value={mode} onChange={(m) => set({}, m)} label="Layout" options={[{ id: "board", label: "Board" }, { id: "list", label: "List" }]} />
        <SearchBox value={f.q} onChange={(q) => set({ q })} placeholder="Search company, person or enquiry" width={280} />
        <Select aria-label="Service" value={f.svc} onChange={(e) => set({ svc: e.target.value })} style={{ width: 170 }}>
          <option value="">All services</option>{services.map((x) => <option key={x} value={x}>{SALES_SERVICE_LABEL[x]}</option>)}
        </Select>
        <Select aria-label="Source" value={f.src} onChange={(e) => set({ src: e.target.value })} style={{ width: 150 }}>
          <option value="">All sources</option>{SALES_SOURCES.map((x) => <option key={x} value={x}>{SALES_SOURCE_LABEL[x]}</option>)}
        </Select>
        <span className="ph-row-flex" style={{ gap: 8, fontSize: 12.5 }}><Switch on={f.overdue} onChange={(v) => set({ overdue: v })} label="Overdue only" />Overdue only</span>
        {f.q || f.svc || f.src || f.overdue || f.view !== "all" ? <button type="button" className="ph-link" style={{ fontSize: 12.5 }} onClick={() => set({ view: "all", q: "", svc: "", src: "", overdue: false })}>Clear</button> : null}
      </div>

      {mode === "board" ? (
        <div className="sp-board">
          {STAGES.map((st) => {
            const items = shown.filter((d) => d.lead.stage === st).sort((a, b) => Number(b.waiting) - Number(a.waiting) || Number(b.overdue) - Number(a.overdue) || (a.lead.nextActionOn || "9").localeCompare(b.lead.nextActionOn || "9") || b.value - a.value);
            const total = items.reduce((n, d) => n + d.value, 0);
            const weighted = items.reduce((n, d) => n + d.weighted, 0);
            const closed = st === "won" || st === "lost";
            return (
              <section key={st} className={`sp-col ${st}${dragOver === st ? " over" : ""}`} aria-label={SALES_STAGE_LABEL[st]}
                onDragOver={(e) => { if (rights.manage) { e.preventDefault(); setDragOver(st); } }} onDragLeave={() => setDragOver(null)} onDrop={(e) => onDrop(e, st)}>
                <header className="sp-col-head">
                  <span className="sp-col-title"><Icon name={STAGE_LOOK[st].icon} size={13} />{SALES_STAGE_LABEL[st]}<span className="sp-count ph-num">{items.length}</span></span>
                  <span className="sp-col-sum"><b className="ph-num">{salesEur(total)}</b>{closed ? null : <span className="ph-num">{salesEur(weighted)} weighted</span>}</span>
                </header>
                <div className="sp-cards">
                  {items.map((d) => <DealCard key={d.lead.id} d={d} onOpen={() => openDeal(d.lead.id)} draggable={rights.manage} />)}
                  {!items.length ? <div className="sp-empty">{rights.manage ? "Drop a deal here" : "None"}</div> : null}
                </div>
              </section>);
          })}
        </div>
      ) : <ListView deals={shown} onOpen={openDeal} />}

      {adding ? <NewLeadModal prefill={adding} onClose={() => setAdding(null)} onCreated={(id) => { setAdding(null); openDeal(id); }} /> : null}
    </div>
  );
}

function DealCard({ d, onOpen, draggable }: { d: DeskDeal; onOpen: () => void; draggable: boolean }) {
  const s = usePhState();
  const L = d.lead;
  const due = dueText(d);
  const inb = salesInboundFor(s, L.id);
  const fu = salesNextFollowLabel(s, L.id);
  return (
    <article className={`sp-card${d.overdue ? " overdue" : ""}${d.waiting ? " waiting" : ""}`} draggable={draggable} onDragStart={(e) => e.dataTransfer.setData("text/plain", L.id)}
      onClick={onOpen} onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }} tabIndex={0} role="button" aria-label={`Open ${L.company}`}>
      <div className="sp-card-top">
        <span className="sp-card-co">{L.company}</span>
        {d.hot && d.open ? <span className="sp-hot" title="Hot this week"><Icon name="spark" size={11} /></span> : null}
      </div>
      <div className="sp-card-sub">{L.contact.name} · {SALES_SOURCE_LABEL[L.source]} · {d.age === 0 ? "today" : `${d.age} day${d.age === 1 ? "" : "s"}`}</div>
      <div className="sp-card-val"><ValueLine d={d} /></div>
      <div className="sp-tags">{L.services.map((x) => <span key={x} className="sp-tag">{SALES_SERVICE_LABEL[x]}</span>)}{d.open ? <span className="sp-tag step">{DESK_STEP_LABEL[d.step]}</span> : null}</div>
      {d.waiting && inb ? <div><TouchTimer inb={inb} /></div> : null}
      {d.open && L.nextAction ? (
        <div className="sp-next">
          <span className="sp-next-t">{L.nextAction}</span>
          {due ? <span className={`sp-due ${due.tone}`}><Icon name="clock" size={11} />{due.text}</span> : null}
        </div>) : null}
      {d.open && fu ? <div className={`sp-fu${fu.overdue ? " late" : ""}`}><Icon name="mail" size={11} />{fu.text}</div> : null}
      {!d.open && L.stage === "lost" && L.lostReason ? <div className="sp-card-sub">{L.lostReason}</div> : null}
      <div className="sp-card-acts"><span className="sp-owner" title={`Owner: ${d.owner}`}>{d.owner.split(" ").map((x) => x[0]).join("")}</span><QuickActions d={d} /></div>
    </article>
  );
}

function ListView({ deals, onOpen }: { deals: DeskDeal[]; onOpen: (id: string) => void }) {
  const s = usePhState();
  const rights = useSalesRights();
  const [sel, setSel] = useState<string[]>([]);
  const [sort, setSort] = useState<{ k: "co" | "val" | "w" | "age" | "next"; dir: 1 | -1 }>({ k: "next", dir: 1 });
  const [lostReason, setLostReason] = useState("");
  const [askLost, setAskLost] = useState(false);
  const rows = deals.slice().sort((a, b) => {
    const v = sort.k === "co" ? a.lead.company.localeCompare(b.lead.company) : sort.k === "val" ? a.value - b.value : sort.k === "w" ? a.weighted - b.weighted : sort.k === "age" ? a.age - b.age
      : (a.open ? a.lead.nextActionOn || "9" : "99").localeCompare(b.open ? b.lead.nextActionOn || "9" : "99");
    return v * sort.dir;
  });
  const ids = sel.filter((id) => rows.some((r) => r.lead.id === id));
  const all = rows.length > 0 && ids.length === rows.length;
  const toggle = (id: string) => setSel(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  const bulk = (op: "move" | "snooze" | "owner" | "follow", extra: Parameters<typeof deskAct.bulk>[2] = {}) => { if (dispatch(deskAct.bulk(ids, op, extra)).ok) { setSel([]); setAskLost(false); setLostReason(""); } };
  const head = (k: typeof sort.k, label: string, cls = "") => (
    <button type="button" className={`pl-h ${cls}`} onClick={() => setSort({ k, dir: sort.k === k ? (sort.dir === 1 ? -1 : 1) : k === "val" || k === "w" ? -1 : 1 })}>
      {label}{sort.k === k ? <Icon name={sort.dir === 1 ? "up" : "down"} size={11} /> : null}
    </button>);
  const sum = rows.filter((r) => ids.includes(r.lead.id)).reduce((n, r) => n + r.value, 0);
  return (
    <Card pad={false}>
      {rights.manage && ids.length ? (
        <div className="pl-bulk" role="toolbar" aria-label="Bulk actions">
          <b>{ids.length} selected</b><span className="ph-dim ph-num">{salesEur(sum)}</span>
          <span className="ph-grow" />
          {askLost ? (
            <>
              <TextInput value={lostReason} onChange={(e) => setLostReason(e.target.value)} placeholder="Why were they lost?" style={{ width: 220 }} autoFocus />
              <Button size="sm" variant="primary" onClick={() => bulk("move", { stage: "lost", reason: lostReason })}>Mark lost</Button>
              <Button size="sm" variant="ghost" onClick={() => setAskLost(false)}>Cancel</Button>
            </>) : (
            <>
              <Select aria-label="Move selected to" value="" onChange={(e) => { const v = e.target.value as SalesStage; if (v === "lost") setAskLost(true); else if (v) bulk("move", { stage: v }); }} style={{ width: 150 }}>
                <option value="">Move to...</option><option value="new">New contact leads</option><option value="proposal_sent">Proposal sent</option><option value="lost">Lost</option>
              </Select>
              <Select aria-label="Give selected to" value="" onChange={(e) => { if (e.target.value) bulk("owner", { owner: e.target.value as StaffId }); }} style={{ width: 150 }}>
                <option value="">Give to...</option>{s.staff.filter((x) => ["stephen", "martina", "brenda"].includes(x.id)).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </Select>
              <Button size="sm" icon="clock" onClick={() => bulk("snooze", { days: 7 })}>Push a week</Button>
              <Button size="sm" icon="mail" onClick={() => bulk("follow")}>Send due follow ups</Button>
              <Button size="sm" variant="ghost" onClick={() => setSel([])}>Clear</Button>
            </>)}
        </div>) : null}
      <div className="pl-table" role="table" aria-label="Deals">
        <div className="pl-row pl-head" role="row">
          {rights.manage ? <label className="pl-cb"><input type="checkbox" aria-label="Select all" checked={all} onChange={() => setSel(all ? [] : rows.map((r) => r.lead.id))} /></label> : <span />}
          {head("co", "Deal")}<span className="pl-h">Stage</span>{head("val", "Value", "r")}{head("w", "Weighted", "r")}{head("age", "Age", "r")}{head("next", "Next step")}<span />
        </div>
        {rows.map((d) => {
          const due = dueText(d);
          return (
            <div key={d.lead.id} className={`pl-row${ids.includes(d.lead.id) ? " sel" : ""}${d.overdue ? " overdue" : ""}`} role="row" onClick={() => onOpen(d.lead.id)}>
              {rights.manage ? <label className="pl-cb" onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label={`Select ${d.lead.company}`} checked={ids.includes(d.lead.id)} onChange={() => toggle(d.lead.id)} /></label> : <span />}
              <span className="pl-co"><b>{d.lead.company}</b><span>{d.lead.contact.name} · {d.lead.services.map((x) => SALES_SERVICE_LABEL[x]).join(", ")}</span></span>
              <span className="pl-stage"><Pill tone={STAGE_LOOK[d.lead.stage].tone} icon={STAGE_LOOK[d.lead.stage].icon}>{SALES_STAGE_LABEL[d.lead.stage]}</Pill></span>
              <span className="pl-num r"><b className="ph-num">{salesEur(d.value)}</b>{d.estimated ? <span className="dk-est">est.</span> : null}</span>
              <span className="pl-num r ph-num">{d.open ? <>{salesEur(d.weighted)}<small>{d.prob}%</small></> : <span className="ph-faint">Closed</span>}</span>
              <span className="pl-num r ph-num">{d.age}d</span>
              <span className="pl-next">{d.open ? <><span>{d.lead.nextAction || "No next step"}</span>{due ? <span className={`sp-due ${due.tone}`}>{due.text}</span> : null}</> : <span className="ph-faint">{d.lead.stage === "won" ? "Won" : d.lead.lostReason || "Lost"}</span>}</span>
              <span className="pl-acts"><QuickActions d={d} /></span>
            </div>);
        })}
        {!rows.length ? <div className="sp-empty" style={{ margin: 16 }}>No deals match this view.</div> : null}
      </div>
      <div className="pl-foot ph-faint">{rows.length} deal{rows.length === 1 ? "" : "s"}, {salesEur(rows.reduce((n, r) => n + r.value, 0))}. Estimates come from the price list until a proposal is built. Contacts are fictional.</div>
    </Card>
  );
}

const PIPE_CSS = `
.sp-head { display: flex; align-items: flex-end; gap: 16px; justify-content: space-between; margin: 4px 0 16px; flex-wrap: wrap; }
.sp-sub { margin: 6px 0 0; font-size: 13px; color: var(--dim); max-width: 640px; line-height: 1.5; }
.sp-kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-bottom: 14px; }
.sp-kpi { display: flex; flex-direction: column; gap: 4px; text-align: left; padding: 14px 16px; border-radius: 16px; border: 1px solid var(--border); background: var(--surface); color: inherit; font: inherit; cursor: pointer; min-width: 0; transition: border-color .15s, background .15s; }
.sp-kpi:hover { border-color: var(--accent); }
.sp-kpi[aria-pressed="true"] { border-color: var(--bad); background: var(--bad-soft); }
.sp-kpi.bad .sp-v { color: var(--bad); }
.sp-k { font-size: 11px; letter-spacing: .05em; text-transform: uppercase; color: var(--faint); }
.sp-v { font-size: 26px; font-weight: 650; letter-spacing: -.6px; color: var(--ink); line-height: 1.1; }
.sp-v small { font-size: 13px; font-weight: 500; color: var(--dim); letter-spacing: 0; }
.sp-s { font-size: 11.5px; color: var(--dim); }
.sp-bar { display: flex; height: 6px; border-radius: 99px; background: var(--track); overflow: hidden; margin: 2px 0; }
.sp-bar span { background: var(--accent); height: 100%; }
.sp-bar span.w { background: var(--accent); opacity: .35; }
.sp-inbox { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 10px 12px; border-radius: 14px; border: 1px dashed var(--border); margin-bottom: 14px; }
.sp-inbox-k { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; color: var(--ink); margin-right: 4px; }
.sp-inbox-k .ph-num { background: var(--accent-soft); color: var(--accent); border-radius: 99px; padding: 0 7px; font-size: 11px; }
.sp-inbox-item { display: inline-flex; align-items: center; gap: 8px; border: 1px solid var(--border); background: var(--surface); color: var(--body); font: inherit; font-size: 12px; padding: 6px 10px; border-radius: 10px; cursor: pointer; max-width: 100%; min-width: 0; }
.sp-inbox-item b { color: var(--ink); white-space: nowrap; }
.sp-inbox-item > span:not(.sp-inbox-go) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.sp-inbox-go { display: inline-flex; gap: 4px; align-items: center; color: var(--accent); white-space: nowrap; }
.sp-inbox-item:hover { border-color: var(--accent); }
.sp-views { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
.sp-tools { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 14px; }
.sp-board { display: grid; grid-template-columns: repeat(2, minmax(250px, 1.25fr)) repeat(2, minmax(220px, 1fr)); gap: 12px; align-items: start; overflow-x: auto; padding-bottom: 6px; }
.sp-col { background: var(--surface-2); border: 1px solid var(--border); border-radius: 16px; padding: 10px; min-height: 260px; transition: border-color .15s, background .15s; }
.sp-col.over { border-color: var(--accent); background: var(--accent-soft); }
.sp-col-head { display: flex; flex-direction: column; gap: 3px; padding: 4px 4px 10px; }
.sp-col-title { display: flex; align-items: center; gap: 7px; font-weight: 600; font-size: 13px; color: var(--ink); }
.sp-count { margin-left: auto; font-size: 11.5px; color: var(--faint); font-weight: 500; }
.sp-col-sum { display: flex; gap: 8px; align-items: baseline; font-size: 12px; color: var(--dim); flex-wrap: wrap; }
.sp-col-sum b { color: var(--ink); font-size: 15px; font-weight: 650; }
.sp-cards { display: flex; flex-direction: column; gap: 8px; }
.sp-card { display: flex; flex-direction: column; gap: 6px; padding: 12px; border-radius: 13px; border: 1px solid var(--border); background: var(--surface); cursor: pointer; transition: border-color .15s, transform .15s, box-shadow .15s; min-width: 0; position: relative; }
.sp-card:hover { border-color: var(--accent); transform: translateY(-1px); box-shadow: 0 8px 22px rgba(0,0,0,.14); }
.sp-card:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.sp-card.overdue { box-shadow: inset 3px 0 0 var(--bad); }
.sp-card.waiting { box-shadow: inset 3px 0 0 var(--warn); }
.sp-card[draggable="true"] { cursor: grab; }
.sp-card-top { display: flex; align-items: center; gap: 6px; }
.sp-card-co { font-weight: 650; font-size: 13.5px; color: var(--ink); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
.sp-hot { display: inline-flex; width: 20px; height: 20px; border-radius: 50%; align-items: center; justify-content: center; background: var(--warn-soft); color: var(--warn); flex: none; }
.sp-card-sub { font-size: 11.5px; color: var(--faint); line-height: 1.4; }
.sp-tags { display: flex; flex-wrap: wrap; gap: 4px; }
.sp-tag { font-size: 10.5px; padding: 2px 7px; border-radius: 999px; background: var(--track); color: var(--dim); }
.sp-tag.step { background: var(--accent-soft); color: var(--accent); }
.sp-next { display: flex; flex-direction: column; gap: 3px; border-top: 1px dashed var(--border); padding-top: 7px; }
.sp-next-t { font-size: 12px; color: var(--body); line-height: 1.4; }
.sp-due { display: inline-flex; align-items: center; gap: 4px; font-size: 11.5px; font-weight: 500; white-space: nowrap; }
.sp-due.bad { color: var(--bad); } .sp-due.warn { color: var(--warn); } .sp-due.dim { color: var(--dim); }
.sp-fu { display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; color: var(--accent); }
.sp-fu.late { color: var(--warn); }
.sp-card-acts { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-top: 2px; }
.sp-owner { width: 24px; height: 24px; border-radius: 50%; background: var(--track); color: var(--dim); font-size: 10px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; flex: none; }
.sp-empty { font-size: 12px; color: var(--faint); text-align: center; padding: 22px 8px; border: 1px dashed var(--border); border-radius: 12px; }
.sp-col.won .sp-card, .sp-col.lost .sp-card { opacity: .9; }
.pl-bulk { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 10px 14px; background: var(--accent-soft); border-bottom: 1px solid var(--border); border-radius: 16px 16px 0 0; font-size: 12.5px; color: var(--ink); }
.pl-table { display: flex; flex-direction: column; }
.pl-row { display: grid; grid-template-columns: 34px minmax(200px, 2.2fr) 140px 110px 110px 56px minmax(180px, 2fr) 136px; align-items: center; gap: 10px; padding: 9px 14px; border-top: 1px solid var(--border); cursor: pointer; min-width: 0; }
.pl-row:hover:not(.pl-head) { background: var(--surface-2); }
.pl-row.sel { background: var(--accent-soft); }
.pl-row.overdue { box-shadow: inset 3px 0 0 var(--bad); }
.pl-head { border-top: 0; cursor: default; font-size: 11px; letter-spacing: .05em; text-transform: uppercase; color: var(--faint); }
.pl-h { display: inline-flex; align-items: center; gap: 4px; border: 0; background: none; color: inherit; font: inherit; padding: 0; cursor: pointer; text-transform: inherit; letter-spacing: inherit; }
.pl-h.r { justify-content: flex-end; }
.pl-cb { display: flex; align-items: center; justify-content: center; }
.pl-cb input { width: 15px; height: 15px; accent-color: var(--accent); cursor: pointer; }
.pl-co { display: flex; flex-direction: column; min-width: 0; }
.pl-co b { font-size: 13px; color: var(--ink); font-weight: 600; }
.pl-co span { font-size: 11.5px; color: var(--faint); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pl-num { font-size: 12.5px; color: var(--body); display: flex; flex-direction: column; align-items: flex-end; }
.pl-num small { font-size: 11px; color: var(--faint); }
.pl-num.r { text-align: right; }
.pl-next { display: flex; flex-direction: column; gap: 2px; font-size: 12px; color: var(--body); min-width: 0; }
.pl-next > span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pl-acts { display: flex; justify-content: flex-end; }
.pl-foot { font-size: 11.5px; padding: 10px 14px; border-top: 1px solid var(--border); }
@media (max-width: 1180px) { .sp-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 1100px) {
  .pl-row { grid-template-columns: 34px minmax(0, 1fr) 110px 100px; }
  .pl-row > :nth-child(3), .pl-row > :nth-child(5), .pl-row > :nth-child(6) { display: none; }
  .pl-row > .pl-next { grid-column: 2 / 4; }
  .pl-row > .pl-acts { grid-column: 4; }
  .pl-head > :nth-child(7), .pl-head > :nth-child(8) { display: none; }
}
@media (max-width: 900px) { .sp-board { grid-template-columns: repeat(4, 270px); } }
@media (max-width: 560px) {
  .sp-kpis { gap: 8px; }
  .sp-kpi { padding: 11px 12px; }
  .sp-v { font-size: 20px; }
  .sp-views { flex-wrap: nowrap; overflow-x: auto; padding-bottom: 4px; scrollbar-width: none; }
  .sp-inbox-item { width: 100%; } .sp-inbox-item b { overflow: hidden; text-overflow: ellipsis; } .sp-inbox-item > span:not(.sp-inbox-go) { display: none; } .sp-inbox-go { margin-left: auto; }
  .sp-view { white-space: nowrap; }
  .sp-tools > * { flex: 1 1 100%; width: 100% !important; }
  .sp-tools > .ph-seg { flex: none; width: auto !important; }
  .sp-board { grid-template-columns: repeat(4, 84vw); scroll-snap-type: x mandatory; }
  .sp-col { scroll-snap-align: start; }
  .pl-row { grid-template-columns: 28px minmax(0, 1fr) auto; padding: 10px 12px; }
  .pl-row > .pl-stage, .pl-row > .pl-num:nth-child(5), .pl-row > .pl-num:nth-child(6) { display: none; }
  .pl-row > .pl-next, .pl-row > .pl-acts { grid-column: 2 / 4; }
  .pl-row > .pl-acts { justify-content: flex-start; }
  .pl-head > :not(:first-child):not(:nth-child(2)):not(:nth-child(4)) { display: none; }
  .pl-bulk .ph-input { width: 100% !important; }
}
`;
