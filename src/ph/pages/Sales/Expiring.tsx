/* Expiring soon: what is about to lapse or renew. Proposals whose 30 day validity is running out
   (and quotes with no reply for 14 days or more), occupational health annual fees, annual screening
   programmes coming round again, and the Irish Life Health agreement. Each row: Renew, Send
   reminder, Extend 30 days or Mark lost. Window and type filters live in the URL. #/Sales/expiring */
import { useState } from "react";
import { DESK_EXP_KIND_LABEL, deskExpiring, fmtWeekdayDate, salesEur } from "../../model";
import type { DeskExpItem, DeskExpKind } from "../../model";
import { useNav } from "../../nav-context";
import { dispatch, usePhState } from "../../store";
import { Button, EmptyState, Icon, Kpi, KpiStrip, Pill, Segmented, TextInput } from "../../ui";
import type { GlyphName } from "../../ui";
import { CompanyLink } from "../links";
import { deskAct } from "./deskActions";
import { DESK_CSS, eurK } from "./DealKit";
import { useSalesRights } from "./shared";

const KINDS: DeskExpKind[] = ["proposal", "oh_fee", "programme", "ilh"];
const KIND_ICON: Record<DeskExpKind, GlyphName> = { proposal: "file", oh_fee: "shield", programme: "refresh", ilh: "heart" };
const RENEW_LABEL: Record<DeskExpKind, string> = { proposal: "New version", oh_fee: "Renew", programme: "Start renewal", ilh: "Renew" };

export default function Expiring() {
  const s = usePhState();
  const nav = useNav();
  const win = (["30", "60", "90"].includes(nav.params.days) ? nav.params.days : "90") as "30" | "60" | "90";
  const kind = (KINDS.includes(nav.params.kind as DeskExpKind) ? nav.params.kind : "") as DeskExpKind | "";
  const set = (patch: Record<string, string>) => {
    const next: Record<string, string> = { ...(win !== "90" ? { days: win } : {}), ...(kind ? { kind } : {}), ...patch };
    Object.keys(next).forEach((k) => { if (!next[k] || (k === "days" && next[k] === "90")) delete next[k]; });
    nav.setParams(next);
  };
  const all = deskExpiring(s, Number(win));
  const shown = all.filter((x) => !kind || x.kind === kind);
  const in30 = all.filter((x) => x.daysLeft <= 30);
  const lapsed = all.filter((x) => x.daysLeft < 0);
  const quiet = all.filter((x) => x.noReplyDays !== null);
  return (
    <div className="ph-page">
      <style>{DESK_CSS + EX_CSS}</style>
      <div className="ex-head">
        <div><div className="ph-eyebrow">Sell · Work</div><h1 className="ph-h1">Expiring soon</h1>
          <p className="ex-sub">Proposals running out of time, fees and programmes coming up for renewal. Catch them before they lapse. Proposals hold their prices for 30 days.</p></div>
        <Segmented value={win} onChange={(v) => set({ days: v })} label="Window" options={[{ id: "30", label: "30 days" }, { id: "60", label: "60 days" }, { id: "90", label: "90 days" }]} />
      </div>
      <KpiStrip>
        <Kpi label="In the next 30 days" value={in30.length} sub={`${eurK(in30.reduce((n, x) => n + (x.value || 0), 0))} of known value`} tone={in30.length ? "warn" : "ok"} onClick={() => set({ days: "30" })} />
        <Kpi label="Already lapsed" value={lapsed.length} sub={lapsed.length ? "Renew or mark lost" : "Nothing lapsed"} tone={lapsed.length ? "bad" : "ok"} />
        <Kpi label="Quotes with no reply 14+ days" value={quiet.length} sub="Send a reminder or extend" onClick={() => set({ kind: "proposal" })} />
        <Kpi label={`Renewals in ${win} days`} value={all.filter((x) => x.kind !== "proposal").length} sub="Fees, programmes and agreements" />
      </KpiStrip>
      <div className="ex-chips">
        <button type="button" className={`sp-view${!kind ? " on" : ""}`} onClick={() => set({ kind: "" })}>Everything <span className="ph-num">{all.length}</span></button>
        {KINDS.filter((k) => all.some((x) => x.kind === k) || kind === k).map((k) => <button key={k} type="button" className={`sp-view${kind === k ? " on" : ""}`} onClick={() => set({ kind: k })}><Icon name={KIND_ICON[k]} size={12} />{DESK_EXP_KIND_LABEL[k]} <span className="ph-num">{all.filter((x) => x.kind === k).length}</span></button>)}
      </div>
      {!shown.length ? <EmptyState icon="check" title="Nothing expiring in this window">Widen the window to see what comes next.</EmptyState> : null}
      {KINDS.filter((k) => shown.some((x) => x.kind === k)).map((k) => (
        <section key={k} className="ex-group" aria-label={DESK_EXP_KIND_LABEL[k]}>
          <header className="ex-group-h"><span className="ex-gi"><Icon name={KIND_ICON[k]} size={14} /></span><b>{DESK_EXP_KIND_LABEL[k]}</b><span className="ph-num">{shown.filter((x) => x.kind === k).length}</span></header>
          {shown.filter((x) => x.kind === k).map((x) => <Row key={x.key} x={x} />)}
        </section>))}
    </div>
  );
}

function Row({ x }: { x: DeskExpItem }) {
  const nav = useNav();
  const rights = useSalesRights();
  const [losing, setLosing] = useState(false);
  const [reason, setReason] = useState("");
  const tone = x.daysLeft < 0 ? "bad" : x.daysLeft <= 14 ? "warn" : "dim";
  const left = x.daysLeft < 0 ? `Lapsed ${-x.daysLeft} day${x.daysLeft === -1 ? "" : "s"} ago` : x.daysLeft === 0 ? "Lapses today" : `${x.daysLeft} day${x.daysLeft === 1 ? "" : "s"} left`;
  const renew = () => {
    const r = dispatch(deskAct.expiry(x.key, "renew"));
    if (r.ok && (x.kind === "proposal" || x.kind === "programme") && r.id) nav.go({ page: "Sales", tab: "pipeline", params: { lead: r.id } });
  };
  return (
    <div className={`ex-row ${tone}`}>
      <div className="ex-main">
        <div className="ex-t"><CompanyLink name={x.company} />{x.noReplyDays !== null ? <Pill tone="warn" icon="clock">No reply in {x.noReplyDays} days</Pill> : null}{x.reminded ? <Pill tone="ok" icon="check">Reminder sent</Pill> : null}</div>
        <div className="ex-s">{x.leadId ? <button type="button" className="ph-link" onClick={() => nav.go({ page: "Sales", tab: "pipeline", params: { lead: x.leadId! } })}>{x.title}</button> : x.title}</div>
        <div className="ex-s">{x.sub}</div>
      </div>
      <div className={`ex-when ${tone}`}><b>{left}</b><span>{x.kind === "proposal" ? "Valid until" : "Renews"} {fmtWeekdayDate(x.expires)}</span>{x.value ? <span className="ph-num">{salesEur(x.value)}</span> : null}</div>
      {rights.manage ? (
        <div className="ex-acts">
          {losing ? (
            <>
              <TextInput value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why? For example: went with another provider" aria-label="Reason" style={{ width: 240 }} autoFocus />
              <Button size="sm" variant="primary" onClick={() => { if (dispatch(deskAct.expiry(x.key, "lost", reason)).ok) setLosing(false); }}>Mark lost</Button>
              <Button size="sm" variant="ghost" onClick={() => setLosing(false)}>Cancel</Button>
            </>) : (
            <>
              <Button size="sm" variant="primary" icon="refresh" onClick={renew}>{RENEW_LABEL[x.kind]}</Button>
              <Button size="sm" icon="mail" disabled={x.reminded && x.kind === "programme"} onClick={() => dispatch(deskAct.expiry(x.key, "remind"))}>Send reminder</Button>
              <Button size="sm" variant="ghost" icon="calendar" onClick={() => dispatch(deskAct.expiry(x.key, "extend"))}>Extend 30 days</Button>
              <Button size="sm" variant="ghost" icon="x" onClick={() => setLosing(true)}>Mark lost</Button>
            </>)}
        </div>) : null}
    </div>
  );
}

const EX_CSS = `
.ex-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 14px; flex-wrap: wrap; margin: 4px 0 14px; }
.ex-sub { margin: 6px 0 0; font-size: 13px; color: var(--dim); max-width: 640px; line-height: 1.5; }
.ex-chips { display: flex; gap: 6px; flex-wrap: wrap; margin: 14px 0; }
.ex-group { border: 1px solid var(--border); border-radius: 16px; background: var(--surface); overflow: hidden; margin-bottom: 14px; }
.ex-group-h { display: flex; align-items: center; gap: 10px; padding: 11px 16px; background: var(--surface-2); font-size: 13px; color: var(--ink); }
.ex-group-h .ph-num { font-size: 12px; color: var(--faint); }
.ex-gi { width: 28px; height: 28px; border-radius: 9px; display: inline-flex; align-items: center; justify-content: center; background: var(--accent-soft); color: var(--accent); }
.ex-row { display: grid; grid-template-columns: minmax(0, 1fr) 170px auto; gap: 14px; align-items: center; padding: 12px 16px; border-top: 1px solid var(--border); }
.ex-row.bad { box-shadow: inset 3px 0 0 var(--bad); }
.ex-row.warn { box-shadow: inset 3px 0 0 var(--warn); }
.ex-main { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.ex-t { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 13.5px; font-weight: 600; }
.ex-s { font-size: 12px; color: var(--dim); }
.ex-s .ph-link { font-size: 12px; }
.ex-when { display: flex; flex-direction: column; font-size: 11.5px; color: var(--dim); }
.ex-when b { font-size: 13px; color: var(--ink); }
.ex-when.bad b { color: var(--bad); } .ex-when.warn b { color: var(--warn); }
.ex-acts { display: flex; gap: 4px; flex-wrap: wrap; justify-content: flex-end; align-items: center; }
@media (max-width: 1100px) { .ex-row { grid-template-columns: minmax(0, 1fr) 150px; } .ex-acts { grid-column: 1 / -1; justify-content: flex-start; } }
@media (max-width: 560px) {
  .ex-row { grid-template-columns: minmax(0, 1fr); gap: 8px; }
  .ex-chips { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; }
  .ex-chips .sp-view { white-space: nowrap; }
  .ex-acts .ph-input { width: 100% !important; }
}
`;
