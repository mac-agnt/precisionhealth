/* Today: Stephen's list for the day. Replies inside the 10 minute rule, meetings and calls booked,
   next steps due, soft follow ups, proposals waiting for a reply and rebookings due. Every row has
   Done, Snooze (next working day) and Reschedule (pick a day). Snooze and Reschedule move the real
   record, so the Calendar shows the new day. #/Sales/today */
import { useState } from "react";
import { DESK_TODAY_GROUPS, deskNextWorkday, deskToday, fmtDateLong, fmtWeekdayDate, greetingFor, salesEur, today } from "../../model";
import type { DeskTodayGroup, DeskTodayItem } from "../../model";
import { useNav } from "../../nav-context";
import { dispatch, usePersona, usePhState } from "../../store";
import { Button, EmptyState, Icon, TextInput } from "../../ui";
import type { GlyphName } from "../../ui";
import { CompanyLink } from "../links";
import { deskAct } from "./deskActions";
import { DESK_CSS, DealDialogs, useDealDialogs } from "./DealKit";
import { TouchTimer } from "./LeadFlow";
import { salesInboundFor } from "../../model";
import { useSalesRights } from "./shared";

const GROUP_ICON: Record<DeskTodayGroup, GlyphName> = { reply: "clock", meetings: "users", calls: "phone", followups: "mail", awaiting: "file", rebook: "refresh" };

export default function Today() {
  return <DealDialogs><TodayList /></DealDialogs>;
}

function TodayList() {
  const s = usePhState();
  const p = usePersona();
  const nav = useNav();
  const items = deskToday(s);
  const t = today(s);
  const [only, setOnly] = useState<DeskTodayGroup | "all">((DESK_TODAY_GROUPS.some((g) => g.id === nav.params.group) ? nav.params.group : "all") as DeskTodayGroup | "all");
  const groups = DESK_TODAY_GROUPS.filter((g) => items.some((x) => x.group === g.id));
  const shown = only === "all" ? groups : groups.filter((g) => g.id === only);
  const value = items.filter((x) => x.value).reduce((n, x) => n + (x.value || 0), 0);
  const overdue = items.filter((x) => x.overdue).length;
  const pick = (g: DeskTodayGroup | "all") => { setOnly(g); nav.setParams(g === "all" ? {} : { group: g }); };
  return (
    <div className="ph-page">
      <style>{DESK_CSS + TODAY_CSS}</style>
      <div className="td-head">
        <div>
          <div className="ph-eyebrow">{fmtDateLong(t)}</div>
          <h1 className="ph-h1">{greetingFor(s.clock.nowUtc)}, {p.name.split(" ")[0]}</h1>
          <p className="td-sub">{items.length ? <>{items.length} thing{items.length === 1 ? "" : "s"} to do{overdue ? <>, <b className="td-bad">{overdue} overdue</b></> : null}. {value ? <>{salesEur(value)} of deals in play.</> : null}</> : "Nothing waiting. A good day to call a lapsed client."}</p>
        </div>
        <div className="td-head-acts">
          <Button icon="calendar" onClick={() => nav.go({ page: "Calendar", tab: "all", params: { view: "day", date: t } })}>Open my calendar</Button>
          <Button variant="primary" icon="arrow" onClick={() => nav.go({ page: "Sales", tab: "pipeline", params: { view: "hot" } })}>Hot deals</Button>
        </div>
      </div>
      <div className="td-chips" role="tablist" aria-label="Show">
        <button type="button" role="tab" aria-selected={only === "all"} className={`sp-view${only === "all" ? " on" : ""}`} onClick={() => pick("all")}>Everything <span className="ph-num">{items.length}</span></button>
        {groups.map((g) => <button key={g.id} type="button" role="tab" aria-selected={only === g.id} className={`sp-view${only === g.id ? " on" : ""}`} onClick={() => pick(g.id)}><Icon name={GROUP_ICON[g.id]} size={12} />{g.label} <span className="ph-num">{items.filter((x) => x.group === g.id).length}</span></button>)}
      </div>
      {!items.length ? <EmptyState icon="check" title="All clear for today">Snoozed items come back on the day you chose. The calendar shows what is next.</EmptyState> : null}
      <div className="td-groups">
        {shown.map((g) => (
          <section key={g.id} className="td-group" aria-label={g.label}>
            <header className="td-group-h"><span className={`td-gi ${g.id}`}><Icon name={GROUP_ICON[g.id]} size={14} /></span><div><b>{g.label}</b><span>{g.hint}</span></div><span className="td-n ph-num">{items.filter((x) => x.group === g.id).length}</span></header>
            {items.filter((x) => x.group === g.id).map((x) => <Row key={x.key} x={x} />)}
          </section>))}
      </div>
    </div>
  );
}

function Row({ x }: { x: DeskTodayItem }) {
  const s = usePhState();
  const nav = useNav();
  const rights = useSalesRights();
  const dlg = useDealDialogs();
  const t = today(s);
  const [picking, setPicking] = useState(false);
  const [date, setDate] = useState(deskNextWorkday(t, 3));
  const inb = x.ref.kind === "touch" && x.leadId ? salesInboundFor(s, x.leadId) : null;
  const open = () => (x.leadId ? nav.go({ page: "Sales", tab: "pipeline", params: { lead: x.leadId } }) : x.ref.kind === "recall" ? nav.go({ page: "Sales", tab: "recall" }) : nav.go({ page: "Calendar", tab: "all", params: { view: "day", date: x.due } }));
  const done = () => {
    if (x.ref.kind === "touch" && x.leadId) { dlg.open("email", x.leadId); return; }
    if (x.ref.kind === "lead" && /call|ring|phone/i.test(x.title) && x.leadId) { dlg.open("call", x.leadId); return; }
    dispatch(deskAct.today(x.key, "done"));
  };
  const doneLabel = x.ref.kind === "touch" ? "Reply now" : x.ref.kind === "follow" || x.ref.kind === "recall" || (x.ref.kind === "sched" && /Email|Rebook|rebook/.test(x.title)) ? "Send" : x.ref.kind === "await" ? "Chased" : x.ref.kind === "lead" && /call|ring|phone/i.test(x.title) ? "Log call" : "Done";
  return (
    <div className={`td-row${x.overdue ? " overdue" : ""}`}>
      <button type="button" className="td-main" onClick={open}>
        <span className="td-t">{x.time ? <span className="td-time ph-num">{x.time}</span> : null}{x.title}</span>
        <span className="td-s">{x.sub}</span>
        <span className="td-meta">
          {x.overdue ? <span className="td-bad"><Icon name="alert" size={11} />Due {fmtWeekdayDate(x.due)}</span> : null}
          {x.value ? <span className="ph-num">{salesEur(x.value)}</span> : null}
          {inb ? <TouchTimer inb={inb} /> : null}
        </span>
      </button>
      <span className="td-co"><CompanyLink name={x.company} /></span>
      {rights.manage ? (
        <span className="td-acts">
          {picking ? (
            <>
              <TextInput type="date" value={date} min={deskNextWorkday(t)} onChange={(e) => setDate(e.target.value)} aria-label="New day" style={{ width: 150 }} />
              <Button size="sm" variant="primary" onClick={() => { if (dispatch(deskAct.today(x.key, "reschedule", date)).ok) setPicking(false); }}>Move</Button>
              <Button size="sm" variant="ghost" onClick={() => setPicking(false)}>Cancel</Button>
            </>) : (
            <>
              <Button size="sm" variant="primary" icon={x.ref.kind === "touch" ? "send" : "check"} title={x.doneLabel} onClick={done}>{doneLabel}</Button>
              {x.ref.kind !== "touch" ? <Button size="sm" variant="ghost" icon="clock" title={`Snooze to ${fmtWeekdayDate(deskNextWorkday(t))}`} onClick={() => dispatch(deskAct.today(x.key, "snooze"))}>Tomorrow</Button> : null}
              {x.ref.kind !== "touch" ? <Button size="sm" variant="ghost" icon="calendar" onClick={() => setPicking(true)}>Reschedule</Button> : null}
            </>)}
        </span>) : null}
    </div>
  );
}

const TODAY_CSS = `
.td-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 14px; flex-wrap: wrap; margin: 4px 0 16px; }
.td-head .ph-h1 { font-size: 26px; margin-top: 4px; }
.td-sub { margin: 6px 0 0; font-size: 13.5px; color: var(--body); }
.td-bad { color: var(--bad); display: inline-flex; align-items: center; gap: 4px; font-weight: 600; }
.td-head-acts { display: flex; gap: 8px; flex-wrap: wrap; }
.td-chips { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 14px; }
.td-groups { display: flex; flex-direction: column; gap: 14px; }
.td-group { border: 1px solid var(--border); border-radius: 16px; background: var(--surface); overflow: hidden; }
.td-group-h { display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: var(--surface-2); }
.td-group-h b { display: block; font-size: 13.5px; color: var(--ink); }
.td-group-h div span { font-size: 11.5px; color: var(--dim); }
.td-group-h > div { flex: 1; min-width: 0; }
.td-gi { width: 30px; height: 30px; border-radius: 10px; display: inline-flex; align-items: center; justify-content: center; background: var(--accent-soft); color: var(--accent); flex: none; }
.td-gi.reply { background: var(--warn-soft); color: var(--warn); }
.td-n { font-size: 12px; color: var(--faint); }
.td-row { display: grid; grid-template-columns: minmax(0, 1fr) 190px auto; align-items: center; gap: 12px; padding: 10px 16px; border-top: 1px solid var(--border); }
.td-row.overdue { box-shadow: inset 3px 0 0 var(--bad); }
.td-main { display: flex; flex-direction: column; gap: 2px; text-align: left; border: 0; background: none; padding: 0; font: inherit; color: inherit; cursor: pointer; min-width: 0; }
.td-main:hover .td-t { color: var(--accent); }
.td-t { font-size: 13px; font-weight: 600; color: var(--ink); display: flex; gap: 8px; align-items: baseline; }
.td-time { font-size: 12px; color: var(--accent); font-weight: 700; }
.td-s { font-size: 12px; color: var(--dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.td-meta { display: flex; gap: 10px; align-items: center; font-size: 11.5px; color: var(--dim); flex-wrap: wrap; }
.td-meta:empty { display: none; }
.td-co { font-size: 12.5px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.td-acts { display: flex; gap: 6px; justify-content: flex-end; flex-wrap: wrap; align-items: center; }
@media (max-width: 900px) { .td-row { grid-template-columns: minmax(0, 1fr) auto; } .td-co { display: none; } }
@media (max-width: 560px) {
  .td-head .ph-h1 { font-size: 21px; }
  .td-head-acts { width: 100%; } .td-head-acts .ph-btn { flex: 1; justify-content: center; }
  .td-chips { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; padding-bottom: 4px; }
    .td-row { grid-template-columns: minmax(0, 1fr); gap: 8px; padding: 12px 14px; }
  .td-s { white-space: normal; }
  .td-acts { justify-content: flex-start; }
}
`;
