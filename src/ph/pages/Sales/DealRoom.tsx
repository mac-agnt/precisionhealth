/* The deal room: one page per deal (#/Sales/pipeline?lead=LD-0009). What it is worth and how
   likely it is, the agent's next best action with one button, Stephen's step-by-step flow (first
   reply, notes, proposal, follow ups, won), one timeline of everything that happened and what is
   coming, the people at the company (with "left the company"), what Pulse already knows about the
   company, and its documents. Every company name links to the client's journey. */
import { useMemo, useRef, useState } from "react";
import {
  DESK_STEP_LABEL, DESK_TIME_LABEL, SALES_BUDGET_LABEL, SALES_SOURCE_LABEL, SALES_STAGE_LABEL, deskDeal, deskDocs, deskNextBest, deskResearch, deskTimeline, fmtShortDateTime,
  fmtWeekdayDate, salesEur, salesFollowSequence,
} from "../../model";
import type { DeskActionKind, DeskTimeKind, SalesLead } from "../../model";
import { useNav } from "../../nav-context";
import { dispatch, usePhState } from "../../store";
import { Button, Card, CardHeader, EmptyState, Icon, PageHeader, Pill, Segmented, TextInput, Textarea } from "../../ui";
import type { GlyphName } from "../../ui";
import { CompanyLink } from "../links";
import { JourneyStrip } from "../Journey/JourneyStrip";
import { salesAct } from "./actions";
import { crmAct, CRM_ACTIVITY_LABEL } from "./crmActions";
import type { CrmActivityKind } from "./crmActions";
import { flowAct } from "./flowActions";
import { ContactsCard, DESK_CSS, DealDialogs, ProbDial, QuickActions, dueText, useDealDialogs } from "./DealKit";
import { InvoicingCard } from "./InvoicingCard";
import { JourneyBar, LEAD_FLOW_CSS, NextStep, useMarkWon } from "./LeadFlow";
import { lastPipelineParams } from "./Pipeline";
import ProposalBuilder from "./ProposalBuilder";
import { STAGE_LOOK, useSalesRights } from "./shared";
import { onbForLead } from "./onbSelect";

export default function DealRoom({ leadId }: { leadId: string }) {
  return <DealDialogs><Room leadId={leadId} /></DealDialogs>;
}

const TIME_ICON: Record<DeskTimeKind, GlyphName> = { email: "mail", call: "phone", meeting: "users", note: "edit", proposal: "file", follow: "send", stage: "flag", system: "dot" };

function Room({ leadId }: { leadId: string }) {
  const s = usePhState();
  const nav = useNav();
  const rights = useSalesRights();
  const dlg = useDealDialogs();
  const markWon = useMarkWon();
  const lead = s.sales.leads.find((l) => l.id === leadId);
  const [building, setBuilding] = useState(false);
  const nextRef = useRef<HTMLDivElement>(null);
  const peopleRef = useRef<HTMLDivElement>(null);
  const back = () => nav.go({ page: "Sales", tab: "pipeline", params: lastPipelineParams });
  if (!lead) {
    return (
      <div className="ph-page"><PageHeader title="Deal not found" />
        <EmptyState title={`There is no deal ${leadId}`} action={<Button icon="arrow" onClick={back}>Back to the pipeline</Button>}>It may have been removed. The pipeline lists every deal.</EmptyState></div>);
  }
  const d = deskDeal(s, lead);
  const nb = deskNextBest(s, lead);
  const due = dueText(d);
  const onb = onbForLead(s, lead.id);
  const go = (k: DeskActionKind) => {
    switch (k) {
      case "reply": dlg.open("email", lead.id); break;
      case "call": dlg.open("call", lead.id); break;
      case "meeting": dlg.open("meeting", lead.id); break;
      case "notes": nextRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); nextRef.current?.querySelector("textarea")?.focus(); break;
      case "build": setBuilding(true); break;
      case "send": if (d.proposalId) dispatch(salesAct.sendProposal(d.proposalId)); break;
      case "follow": { const q = salesFollowSequence(s, lead.id); if (q?.next) dispatch(flowAct.followUp(lead.id, q.next.n, "send")); break; }
      case "won": markWon(lead.id); break;
      case "onboard": nav.go({ page: "Sales", tab: "onboarding", params: onb ? { onb: onb.id } : { lead: lead.id } }); break;
      case "reopen": dispatch(salesAct.moveLead(lead.id, "new")); break;
      case "contact": peopleRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); window.dispatchEvent(new Event("dk-add-contact")); break;
    }
  };
  const nbIcon: Record<DeskActionKind, GlyphName> = { reply: "send", call: "phone", meeting: "calendar", notes: "edit", build: "file", send: "send", follow: "mail", won: "check", onboard: "arrow", reopen: "refresh", contact: "user" };
  const staffName = s.staff.find((x) => x.id === lead.ownerId)?.name || lead.ownerId;

  return (
    <div className="ph-page dlr-room">
      <style>{DESK_CSS + LEAD_FLOW_CSS + ROOM_CSS}</style>
      <button type="button" className="dlr-back" onClick={back}><Icon name="chevronLeft" size={13} />Pipeline</button>
      <header className="dlr-head">
        <div className="dlr-title">
          <h1 className="ph-h1"><CompanyLink name={lead.company}>{lead.company}</CompanyLink></h1>
          <div className="dlr-meta">
            <Pill tone={STAGE_LOOK[lead.stage].tone} icon={STAGE_LOOK[lead.stage].icon}>{SALES_STAGE_LABEL[lead.stage]}</Pill>
            <span>{lead.services.map((x) => x.replace(/_/g, " ")).join(", ").replace(/^./, (c) => c.toUpperCase()) || "Service to confirm"}</span>
            <span>·</span><span>{SALES_SOURCE_LABEL[lead.source]}{lead.sourceRef ? ` (${lead.sourceRef})` : ""}</span>
            <span>·</span><span>Owner {staffName}</span><span className="ph-faint ph-mono">{lead.id}</span>
          </div>
        </div>
        <QuickActions d={d} size="full" />
      </header>

      <div className="dlr-stats">
        <div className="dlr-stat"><span className="dlr-k">Value</span><span className="dlr-v ph-num">{salesEur(d.value)}{d.estimated ? <span className="dk-est">est.</span> : null}</span><span className="dlr-s" title={d.basis}>{d.basis}</span></div>
        <div className="dlr-stat"><span className="dlr-k">Chance of winning</span><span className="dlr-v ph-num"><ProbDial pct={lead.stage === "won" ? 100 : d.prob} size={24} />{lead.stage === "won" ? 100 : d.prob}%</span><span className="dlr-s">{d.open ? `At ${DESK_STEP_LABEL[d.step].toLowerCase()}${lead.qualifier.budget !== "unknown" ? `, ${SALES_BUDGET_LABEL[lead.qualifier.budget].toLowerCase()}` : ""}` : SALES_STAGE_LABEL[lead.stage]}</span></div>
        <div className="dlr-stat"><span className="dlr-k">Weighted</span><span className="dlr-v ph-num">{salesEur(lead.stage === "won" ? d.value : d.weighted)}</span><span className="dlr-s">Counts towards the forecast</span></div>
        <div className="dlr-stat"><span className="dlr-k">Age</span><span className="dlr-v ph-num">{d.age} day{d.age === 1 ? "" : "s"}</span><span className="dlr-s">Since {fmtWeekdayDate(lead.receivedOn)}</span></div>
        <div className={`dlr-stat${d.overdue ? " bad" : ""}`}><span className="dlr-k">Next step</span><span className="dlr-v sm">{d.open ? lead.nextAction || "None set" : lead.stage === "won" ? "Onboarding" : "Closed"}</span><span className={`dlr-s ${due?.tone || ""}`}>{due ? due.text : d.open ? "No date" : ""}</span></div>
      </div>

      {rights.manage ? (
        <div className="dlr-nba">
          <span className="dlr-nba-icon"><Icon name="spark" size={16} /></span>
          <div className="ph-grow" style={{ minWidth: 0 }}>
            <div className="dlr-nba-k">Agent suggests</div>
            <div className="dlr-nba-t">{nb.title}</div>
            <div className="dlr-nba-w">{nb.why}</div>
          </div>
          <Button variant="primary" icon={nbIcon[nb.kind]} onClick={() => go(nb.kind)}>{nb.button}</Button>
        </div>) : null}

      <JourneyStrip lead={lead.id} at={lead.stage === "won" ? "won" : d.step === "reply" ? "lead" : "proposal"} compact />

      <div className="dlr-grid">
        <div className="dlr-main">
          <Card>
            <CardHeader title="Stephen's flow" sub="First reply, meeting notes, proposal, follow ups, won. One step at a time." />
            <JourneyBar leadId={lead.id} />
            <div ref={nextRef} style={{ marginTop: 16 }}><NextStep lead={lead} onBuild={() => setBuilding(true)} /></div>
          </Card>
          <Timeline lead={lead} />
        </div>
        <aside className="dlr-side">
          <Card>
            <div ref={peopleRef}><CardHeader title="People" sub="Who we deal with. HR people move on: mark them and pick the next person." /></div>
            <ContactsCard leadId={lead.id} />
          </Card>
          <Research lead={lead} />
          <Docs lead={lead} onBuild={() => setBuilding(true)} />
          <Card>
            <CardHeader title="Deal details" />
            <div className="dlr-kv">
              <div><span>People</span><b>{lead.qualifier.headcount ?? "To confirm"}</b></div>
              <div><span>Sites</span><b>{lead.qualifier.sites ?? "To confirm"}</b></div>
              <div><span>Dates</span><b>{lead.qualifier.dates || "To confirm"}</b></div>
              <div><span>Budget</span><b>{SALES_BUDGET_LABEL[lead.qualifier.budget]}</b></div>
            </div>
            <div className="dlr-enq"><span>Their enquiry</span>{lead.enquiry}</div>
            <InvoicingCard key={lead.id} lead={lead} />
          </Card>
          {rights.manage && d.open ? (
            <div className="dlr-close">
              <Button variant="primary" icon="check" onClick={() => markWon(lead.id)}>Mark as won</Button>
              <Button variant="ghost" icon="x" onClick={() => dlg.open("lost", lead.id)}>Mark as lost</Button>
            </div>) : null}
        </aside>
      </div>
      {building ? <ProposalBuilder lead={lead} onClose={() => setBuilding(false)} /> : null}
    </div>
  );
}

function Timeline({ lead }: { lead: SalesLead }) {
  const s = usePhState();
  const rights = useSalesRights();
  const items = useMemo(() => deskTimeline(s, lead.id), [s, lead.id]);
  const [kind, setKind] = useState<DeskTimeKind | "all">("all");
  const [open, setOpen] = useState<string | null>(null);
  const [act, setAct] = useState<CrmActivityKind>("note");
  const [text, setText] = useState("");
  const [next, setNext] = useState("");
  const [nextOn, setNextOn] = useState("");
  const kinds = (["email", "call", "meeting", "note", "proposal", "follow"] as DeskTimeKind[]).filter((k) => items.some((x) => x.kind === k));
  const shown = items.filter((x) => kind === "all" || x.kind === kind);
  const future = shown.filter((x) => x.future), past = shown.filter((x) => !x.future);
  const log = () => { if (dispatch(crmAct.logActivity(lead.id, act, text, next, nextOn || null)).ok) { setText(""); setNext(""); setNextOn(""); } };
  const row = (x: typeof items[number]) => (
    <li key={x.key} className={`dlr-tl-i ${x.kind}${x.future ? " future" : ""}`}>
      <span className="dlr-tl-dot"><Icon name={TIME_ICON[x.kind]} size={12} /></span>
      <div className="ph-grow" style={{ minWidth: 0 }}>
        {x.body ? <button type="button" className="dlr-tl-t link" aria-expanded={open === x.key} onClick={() => setOpen(open === x.key ? null : x.key)}>{x.title}<Icon name={open === x.key ? "chevronDown" : "chevronRight"} size={11} /></button> : <div className="dlr-tl-t">{x.title}</div>}
        <div className="dlr-tl-m">{fmtShortDateTime(x.at)} · {x.by}</div>
        {open === x.key && x.body ? <div className="dlr-tl-b">{x.body}</div> : null}
      </div>
    </li>);
  return (
    <Card>
      <CardHeader title="Timeline" sub="Every email, call, meeting, note and proposal, and what is coming next." />
      {rights.manage ? (
        <div className="dlr-log">
          <Segmented value={act} onChange={setAct} label="What to log" options={(Object.keys(CRM_ACTIVITY_LABEL) as CrmActivityKind[]).map((k) => ({ id: k, label: CRM_ACTIVITY_LABEL[k] }))} />
          <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder={act === "note" ? "Add a note for the team" : `What happened on the ${CRM_ACTIVITY_LABEL[act].toLowerCase()}?`} aria-label="What happened" />
          {text.trim() ? (
            <div className="dlr-log-row">
              <TextInput value={next} onChange={(e) => setNext(e.target.value)} placeholder="Next step (optional)" aria-label="Next step" />
              <TextInput type="date" value={nextOn} onChange={(e) => setNextOn(e.target.value)} aria-label="Next step date" style={{ width: 160 }} />
              <Button variant="primary" icon="check" onClick={log} disabled={text.trim().length < 3}>Log {CRM_ACTIVITY_LABEL[act].toLowerCase()}</Button>
            </div>) : null}
        </div>) : null}
      <div className="dlr-tl-filters">
        <button type="button" className={`sp-view${kind === "all" ? " on" : ""}`} onClick={() => setKind("all")}>All <span className="ph-num">{items.length}</span></button>
        {kinds.map((k) => <button key={k} type="button" className={`sp-view${kind === k ? " on" : ""}`} onClick={() => setKind(k)}>{DESK_TIME_LABEL[k]} <span className="ph-num">{items.filter((x) => x.kind === k).length}</span></button>)}
      </div>
      {future.length ? <><div className="dlr-tl-h">Coming up</div><ul className="dlr-tl">{future.map(row)}</ul></> : null}
      <div className="dlr-tl-h">History</div>
      <ul className="dlr-tl">{past.map(row)}</ul>
      {!shown.length ? <div className="ph-faint" style={{ fontSize: 12.5 }}>Nothing of this kind yet.</div> : null}
    </Card>
  );
}

function Research({ lead }: { lead: SalesLead }) {
  const s = usePhState();
  const r = deskResearch(s, lead);
  return (
    <Card>
      <CardHeader title="Company research" sub="From what Pulse already knows. No web lookup." right={<Pill tone="brand" icon="spark">Agent</Pill>} />
      <div className="dlr-kv">
        <div><span>Sector</span><b>{r.sector ? r.sector.replace(/^./, (c) => c.toUpperCase()) : "Not known"}</b></div>
        <div><span>Size</span><b>{r.size}</b></div>
        <div><span>Sites</span><b>{r.sites}</b></div>
        <div><span>Wants</span><b>{r.services}</b></div>
      </div>
      <div className="dlr-sub-h">Relationship with us</div>
      {r.relationship.length ? <ul className="dlr-list">{r.relationship.map((x, i) => <li key={i}>{x.text}</li>)}</ul> : <div className="ph-dim" style={{ fontSize: 12.5 }}>New to Precision Health.</div>}
      <div className="dlr-sub-h">Same-sector clients to mention</div>
      {r.references.length ? <div className="dlr-refs">{r.references.map((x) => <span key={x} className="dlr-ref"><CompanyLink name={x} /></span>)}</div> : <div className="ph-dim" style={{ fontSize: 12.5 }}>No clients in the same sector yet.</div>}
    </Card>
  );
}

function Docs({ lead, onBuild }: { lead: SalesLead; onBuild: () => void }) {
  const s = usePhState();
  const nav = useNav();
  const rights = useSalesRights();
  const docs = deskDocs(s, lead);
  const icon = (k: string): GlyphName => (k === "agreement" ? "shield" : k === "brochure" ? "layers" : "file");
  return (
    <Card>
      <CardHeader title="Documents" />
      <div className="dlr-docs">
        {docs.map((x) => {
          const open = x.proposalId ? () => nav.go({ page: "Sales", tab: "proposals", params: { proposal: x.proposalId! } }) : x.kind === "agreement" && x.onbId ? () => nav.go({ page: "Sales", tab: "onboarding", params: { onb: x.onbId! } }) : null;
          return (
            <div key={x.key} className="dlr-doc">
              <Icon name={icon(x.kind)} size={14} />
              <div className="ph-grow" style={{ minWidth: 0 }}>{open ? <button type="button" className="ph-link" style={{ fontSize: 12.5 }} onClick={open}>{x.name}</button> : <span style={{ fontSize: 12.5, color: "var(--ink)" }}>{x.name}</span>}<div className="ph-faint" style={{ fontSize: 11 }}>{x.status}</div></div>
            </div>);
        })}
      </div>
      {rights.manage && (lead.stage === "new" || lead.stage === "proposal_sent") && !docs.some((x) => x.kind === "proposal") ? <Button size="sm" icon="file" onClick={onBuild} style={{ marginTop: 10 }}>Build proposal</Button> : null}
    </Card>
  );
}

const ROOM_CSS = `
.dlr-back { display: inline-flex; align-items: center; gap: 4px; border: 0; background: none; color: var(--dim); font: inherit; font-size: 12.5px; cursor: pointer; padding: 4px 0; margin: 2px 0 6px; }
.dlr-back:hover { color: var(--accent); }
.dlr-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; flex-wrap: wrap; margin-bottom: 14px; }
.dlr-title { min-width: 0; }
.dlr-title .ph-h1 { font-size: 26px; }
.dlr-title .ph-h1 .ph-link { color: var(--ink); }
.dlr-title .ph-h1 .ph-link:hover { color: var(--accent); }
.dlr-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; margin-top: 8px; font-size: 12.5px; color: var(--dim); }
.dlr-stats { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 0; border: 1px solid var(--border); border-radius: 16px; background: var(--surface); margin-bottom: 12px; overflow: hidden; }
.dlr-stat { display: flex; flex-direction: column; gap: 3px; padding: 12px 16px; border-left: 1px solid var(--border); min-width: 0; }
.dlr-stat:first-child { border-left: 0; }
.dlr-stat.bad .dlr-v { color: var(--bad); }
.dlr-k { font-size: 10.5px; letter-spacing: .06em; text-transform: uppercase; color: var(--faint); }
.dlr-v { display: flex; align-items: center; gap: 6px; font-size: 20px; font-weight: 650; color: var(--ink); letter-spacing: -.3px; }
.dlr-v.sm { font-size: 13px; font-weight: 600; letter-spacing: 0; line-height: 1.35; }
.dlr-s { font-size: 11.5px; color: var(--dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dlr-s.bad { color: var(--bad); font-weight: 600; } .dlr-s.warn { color: var(--warn); font-weight: 600; }
.dlr-nba { display: flex; align-items: center; gap: 14px; padding: 14px 16px; border-radius: 16px; border: 1px solid var(--accent); background: linear-gradient(100deg, var(--accent-soft), transparent 75%); margin-bottom: 12px; flex-wrap: wrap; }
.dlr-nba-icon { width: 34px; height: 34px; border-radius: 50%; background: var(--accent); color: var(--on-accent); display: inline-flex; align-items: center; justify-content: center; flex: none; }
.dlr-nba-k { font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase; color: var(--accent); font-weight: 600; }
.dlr-nba-t { font-size: 15px; font-weight: 650; color: var(--ink); margin-top: 2px; }
.dlr-nba-w { font-size: 12.5px; color: var(--body); margin-top: 3px; line-height: 1.45; }
.dlr-room .js-strip { margin-bottom: 14px; }
.dlr-grid { display: grid; grid-template-columns: minmax(0, 1.65fr) minmax(300px, 1fr); gap: 14px; align-items: start; }
.dlr-main, .dlr-side { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.dlr-kv { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 14px; }
.dlr-kv div { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.dlr-kv span { font-size: 11px; color: var(--faint); }
.dlr-kv b { font-size: 12.5px; color: var(--ink); font-weight: 550; }
.dlr-enq { margin: 14px 0; font-size: 12.5px; color: var(--body); line-height: 1.55; padding: 10px 12px; border-radius: 12px; background: var(--surface-2); }
.dlr-enq span { display: block; font-size: 11px; color: var(--faint); margin-bottom: 3px; }
.dlr-sub-h { font-size: 11px; letter-spacing: .05em; text-transform: uppercase; color: var(--faint); margin: 14px 0 6px; }
.dlr-list { margin: 0; padding-left: 16px; font-size: 12.5px; color: var(--body); line-height: 1.6; }
.dlr-refs { display: flex; gap: 6px; flex-wrap: wrap; }
.dlr-ref { padding: 4px 10px; border-radius: 999px; background: var(--accent-soft); font-size: 12px; }
.dlr-docs { display: flex; flex-direction: column; gap: 8px; }
.dlr-doc { display: flex; gap: 10px; align-items: flex-start; color: var(--dim); }
.crm-k { font-size: 11px; color: var(--faint); margin: 0 0 3px; text-transform: uppercase; letter-spacing: .04em; }
.crm-v { margin: 0; font-size: 12.5px; color: var(--body); line-height: 1.5; }
.dlr-close { display: flex; gap: 8px; flex-wrap: wrap; }
.dlr-log { display: flex; flex-direction: column; gap: 8px; padding: 12px; border-radius: 14px; background: var(--surface-2); margin-bottom: 14px; }
.dlr-log-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.dlr-log-row > .ph-input:first-child { flex: 1 1 200px; }
.dlr-tl-filters { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 4px; }
.dlr-tl-h { font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: var(--faint); margin: 14px 0 4px; }
.dlr-tl { list-style: none; margin: 0; padding: 0; position: relative; }
.dlr-tl::before { content: ""; position: absolute; left: 12px; top: 8px; bottom: 8px; width: 1px; background: var(--border); }
.dlr-tl-i { display: flex; gap: 12px; padding: 8px 0; position: relative; }
.dlr-tl-dot { width: 25px; height: 25px; flex: none; border-radius: 50%; background: var(--surface-2); border: 1px solid var(--border); color: var(--dim); display: inline-flex; align-items: center; justify-content: center; z-index: 1; }
.dlr-tl-i.email .dlr-tl-dot, .dlr-tl-i.follow .dlr-tl-dot { color: var(--accent); }
.dlr-tl-i.call .dlr-tl-dot { color: #6ad0f0; }
.dlr-tl-i.meeting .dlr-tl-dot { color: #f0c04b; }
.dlr-tl-i.proposal .dlr-tl-dot { color: #b06cf0; }
.dlr-tl-i.stage .dlr-tl-dot { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }
.dlr-tl-i.future .dlr-tl-dot { border-style: dashed; background: transparent; }
.dlr-tl-t { font-size: 12.5px; color: var(--ink); line-height: 1.45; }
.dlr-tl-t.link { display: inline-flex; align-items: center; gap: 6px; border: 0; background: none; font: inherit; font-size: 12.5px; padding: 0; text-align: left; cursor: pointer; color: var(--ink); }
.dlr-tl-t.link:hover { color: var(--accent); }
.dlr-tl-m { font-size: 11px; color: var(--faint); margin-top: 1px; }
.dlr-tl-b { margin-top: 6px; white-space: pre-wrap; font-size: 12.5px; line-height: 1.55; color: var(--body); background: var(--surface-2); border-radius: 10px; padding: 10px 12px; }
@media (max-width: 1180px) { .dlr-stats { grid-template-columns: repeat(3, minmax(0, 1fr)); } .dlr-stat:nth-child(4) { border-left: 0; } .dlr-stat:nth-child(n+4) { border-top: 1px solid var(--border); } }
@media (max-width: 980px) { .dlr-grid { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 560px) {
  .dlr-title .ph-h1 { font-size: 21px; }
  .dlr-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .dlr-stat { border-left: 0; border-top: 1px solid var(--border); }
  .dlr-stat:nth-child(1), .dlr-stat:nth-child(2) { border-top: 0; }
  .dlr-stat:nth-child(2n) { border-left: 1px solid var(--border); }
  .dlr-stat:last-child { grid-column: 1 / -1; border-left: 0; }
  .dlr-v { font-size: 17px; }
  .dlr-nba > .ph-btn { width: 100%; justify-content: center; }
  .dlr-head .dk-qas.full { width: 100%; }
}
`;
