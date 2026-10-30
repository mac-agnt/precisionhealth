/* Follow-ups: every follow up across the deals in one place, grouped Overdue, Today, This week and
   Later. The soft sequence emails after a proposal, each deal's next step, and follow-up emails
   scheduled in the calendar. Send, Snooze, Reschedule and Done on every row; snooze and reschedule
   move the real record so the Calendar agrees. Filters live in the URL. #/Sales/follow-ups */
import { useState } from "react";
import { DESK_FOLLOW_KIND_LABEL, DESK_WHEN_LABEL, deskFollowUps, deskNextWorkday, fmtWeekdayDate, salesEur, today } from "../../model";
import type { DeskFollowItem, DeskFollowKind, DeskWhen } from "../../model";
import { useNav } from "../../nav-context";
import { dispatch, usePersona, usePhState } from "../../store";
import { Button, EmptyState, Icon, Pill, SearchBox, Segmented, TextInput } from "../../ui";
import type { GlyphName } from "../../ui";
import { CompanyLink } from "../links";
import { deskAct } from "./deskActions";
import { flowAct } from "./flowActions";
import { DESK_CSS, DealDialogs, useDealDialogs } from "./DealKit";
import { useSalesRights } from "./shared";

const WHENS: DeskWhen[] = ["overdue", "today", "week", "later"];
const KIND_ICON: Record<DeskFollowKind, GlyphName> = { sequence: "mail", next: "flag", scheduled: "calendar" };

export default function FollowUps() {
  return <DealDialogs><List /></DealDialogs>;
}

function List() {
  const s = usePhState();
  const nav = useNav();
  const p = usePersona();
  const all = deskFollowUps(s);
  const kind = (["sequence", "next", "scheduled"].includes(nav.params.kind) ? nav.params.kind : "") as DeskFollowKind | "";
  const who = nav.params.who === "all" ? "all" : "mine";
  const q = nav.params.q || "";
  const set = (patch: Record<string, string>) => {
    const next: Record<string, string> = { ...(kind ? { kind } : {}), ...(who === "all" ? { who } : {}), ...(q ? { q } : {}), ...patch };
    Object.keys(next).forEach((k) => { if (!next[k] || (k === "who" && next[k] === "mine")) delete next[k]; });
    nav.setParams(next);
  };
  const base = all.filter((x) => who === "all" || x.ownerId === p.id);
  const shown = base.filter((x) => (!kind || x.kind === kind) && (!q || `${x.company} ${x.title} ${x.sub}`.toLowerCase().includes(q.toLowerCase())));
  const count = (w: DeskWhen) => shown.filter((x) => x.when === w).length;
  return (
    <div className="ph-page">
      <style>{DESK_CSS + FU_CSS}</style>
      <div className="fu-head">
        <div><div className="ph-eyebrow">Sell · Work</div><h1 className="ph-h1">Follow-ups</h1>
          <p className="fu-sub">Every follow up on every deal. Soft and regular: nobody goes quiet by accident.</p></div>
        <div className="fu-sum">
          {WHENS.map((w) => <span key={w} className={`fu-sum-i ${w}`}><b className="ph-num">{base.filter((x) => x.when === w).length}</b>{DESK_WHEN_LABEL[w]}</span>)}
        </div>
      </div>
      <div className="fu-tools">
        <Segmented value={who} onChange={(v) => set({ who: v })} label="Whose" options={[{ id: "mine", label: "Mine" }, { id: "all", label: "Everyone" }]} />
        <div className="fu-chips">
          <button type="button" className={`sp-view${!kind ? " on" : ""}`} onClick={() => set({ kind: "" })}>All <span className="ph-num">{base.length}</span></button>
          {(Object.keys(DESK_FOLLOW_KIND_LABEL) as DeskFollowKind[]).map((k) => <button key={k} type="button" className={`sp-view${kind === k ? " on" : ""}`} onClick={() => set({ kind: k })}><Icon name={KIND_ICON[k]} size={12} />{DESK_FOLLOW_KIND_LABEL[k]} <span className="ph-num">{base.filter((x) => x.kind === k).length}</span></button>)}
        </div>
        <SearchBox value={q} onChange={(v) => set({ q: v })} placeholder="Search company or email" width={240} />
      </div>
      {!shown.length ? <EmptyState icon="check" title="No follow ups here">{who === "mine" ? "Try Everyone to see the team's follow ups." : "Clear the filters to see everything."}</EmptyState> : null}
      {WHENS.filter((w) => count(w)).map((w) => (
        <section key={w} className={`fu-group ${w}`} aria-label={DESK_WHEN_LABEL[w]}>
          <header className="fu-group-h"><b>{DESK_WHEN_LABEL[w]}</b><span className="ph-num">{count(w)}</span>{w === "overdue" ? <span className="fu-hint">Clear these first</span> : null}</header>
          {shown.filter((x) => x.when === w).map((x) => <Row key={x.key} x={x} />)}
        </section>))}
    </div>
  );
}

function Row({ x }: { x: DeskFollowItem }) {
  const s = usePhState();
  const nav = useNav();
  const rights = useSalesRights();
  const dlg = useDealDialogs();
  const t = today(s);
  const [picking, setPicking] = useState(false);
  const [date, setDate] = useState(deskNextWorkday(x.due > t ? x.due : t, 2));
  const send = () => {
    if (x.kind === "next" && x.leadId) { dlg.open(/call|ring|phone/i.test(x.title) ? "call" : "email", x.leadId); return; }
    dispatch(deskAct.follow(x.key, "send"));
  };
  const sendLabel = x.kind === "next" ? (/call|ring|phone/i.test(x.title) ? "Log call" : "Email") : "Send";
  return (
    <div className={`fu-row ${x.when}`}>
      <span className={`fu-ic ${x.kind}`}><Icon name={KIND_ICON[x.kind]} size={13} /></span>
      <button type="button" className="fu-main" onClick={() => (x.leadId ? nav.go({ page: "Sales", tab: "pipeline", params: { lead: x.leadId } }) : nav.go({ page: "Calendar", tab: "all", params: { view: "day", date: x.due } }))}>
        <span className="fu-t">{x.title}</span>
        <span className="fu-s">{x.sub}</span>
      </button>
      <span className="fu-co"><CompanyLink name={x.company} />{x.value ? <span className="ph-num ph-faint">{salesEur(x.value)}</span> : null}</span>
      <span className={`fu-due ${x.when}`}>{x.when === "today" ? "Today" : fmtWeekdayDate(x.due)}</span>
      {rights.manage ? (
        <span className="fu-acts">
          {picking ? (
            <>
              <TextInput type="date" value={date} min={deskNextWorkday(t)} onChange={(e) => setDate(e.target.value)} aria-label="New day" style={{ width: 150 }} />
              <Button size="sm" variant="primary" onClick={() => { if (dispatch(deskAct.follow(x.key, "reschedule", date)).ok) setPicking(false); }}>Move</Button>
              <Button size="sm" variant="ghost" onClick={() => setPicking(false)}>Cancel</Button>
            </>) : x.paused && x.leadId ? (
            <><Pill tone="neutral" icon="clock">Paused</Pill><Button size="sm" icon="refresh" onClick={() => dispatch(flowAct.pauseFollowUps(x.leadId!, false))}>Resume</Button></>
          ) : (
            <>
              <Button size="sm" variant="primary" icon={sendLabel === "Log call" ? "phone" : "send"} onClick={send}>{sendLabel}</Button>
              <Button size="sm" variant="ghost" icon="clock" title="Snooze to the next working day" onClick={() => dispatch(deskAct.follow(x.key, "snooze"))}>Snooze</Button>
              <Button size="sm" variant="ghost" icon="calendar" onClick={() => setPicking(true)}>Reschedule</Button>
              <Button size="sm" variant="ghost" icon="check" title={x.kind === "scheduled" ? "No longer needed: cancel it" : "Done another way"} onClick={() => dispatch(deskAct.follow(x.key, "done"))}>Done</Button>
            </>)}
        </span>) : null}
    </div>
  );
}

const FU_CSS = `
.fu-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 14px; flex-wrap: wrap; margin: 4px 0 14px; }
.fu-sub { margin: 6px 0 0; font-size: 13px; color: var(--dim); }
.fu-sum { display: flex; gap: 8px; flex-wrap: wrap; }
.fu-sum-i { display: flex; flex-direction: column; align-items: flex-start; padding: 8px 14px; border-radius: 12px; border: 1px solid var(--border); background: var(--surface); font-size: 11px; color: var(--dim); min-width: 84px; }
.fu-sum-i b { font-size: 20px; color: var(--ink); font-weight: 650; }
.fu-sum-i.overdue b { color: var(--bad); }
.fu-sum-i.today b { color: var(--warn); }
.fu-tools { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 14px; }
.fu-chips { display: flex; gap: 6px; flex-wrap: wrap; }
.fu-group { border: 1px solid var(--border); border-radius: 16px; background: var(--surface); overflow: hidden; margin-bottom: 14px; }
.fu-group.overdue { border-color: color-mix(in oklab, var(--bad) 45%, var(--border)); }
.fu-group-h { display: flex; align-items: center; gap: 8px; padding: 11px 16px; background: var(--surface-2); font-size: 13px; color: var(--ink); }
.fu-group-h .ph-num { font-size: 12px; color: var(--faint); }
.fu-group.overdue .fu-group-h b { color: var(--bad); }
.fu-hint { margin-left: auto; font-size: 11.5px; color: var(--dim); }
.fu-row { display: grid; grid-template-columns: 30px minmax(0, 1fr) 190px 90px auto; gap: 12px; align-items: center; padding: 10px 16px; border-top: 1px solid var(--border); }
.fu-ic { width: 28px; height: 28px; border-radius: 9px; display: inline-flex; align-items: center; justify-content: center; background: var(--accent-soft); color: var(--accent); }
.fu-ic.next { background: var(--track); color: var(--dim); }
.fu-main { display: flex; flex-direction: column; gap: 2px; text-align: left; border: 0; background: none; padding: 0; font: inherit; color: inherit; cursor: pointer; min-width: 0; }
.fu-main:hover .fu-t { color: var(--accent); }
.fu-t { font-size: 13px; font-weight: 600; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fu-s { font-size: 12px; color: var(--dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fu-co { display: flex; flex-direction: column; font-size: 12.5px; min-width: 0; }
.fu-co .ph-num { font-size: 11.5px; }
.fu-due { font-size: 12px; color: var(--dim); white-space: nowrap; }
.fu-due.overdue { color: var(--bad); font-weight: 600; }
.fu-due.today { color: var(--warn); font-weight: 600; }
.fu-acts { display: flex; gap: 4px; justify-content: flex-end; flex-wrap: wrap; align-items: center; }
@media (max-width: 1100px) { .fu-row { grid-template-columns: 30px minmax(0, 1fr) 90px; } .fu-co { display: none; } .fu-acts { grid-column: 2 / -1; justify-content: flex-start; } }
@media (max-width: 560px) {
  .fu-sum { width: 100%; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .fu-sum-i { min-width: 0; padding: 8px 10px; }
  .fu-chips { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; max-width: 100%; }
  .fu-chips .sp-view { white-space: nowrap; }
  .fu-tools > div:last-child { width: 100% !important; }
  .fu-row { grid-template-columns: 28px minmax(0, 1fr) auto; padding: 10px 12px; }
  .fu-t, .fu-s { white-space: normal; }
}
`;
