/* Forecast and targets: won against target by month, with the weighted pipeline expected to close
   in each month; the quarter; win rate by service and by source; average deal size; sales cycle;
   and the first-touch league (Stephen's 10 minute rule). Targets are edited in place.
   Closed deals before Pulse are fictional history. #/Sales/forecast */
import { useMemo, useState } from "react";
import { deskForecast, salesEur } from "../../model";
import type { DeskRate } from "../../model";
import { useNav } from "../../nav-context";
import { dispatch, usePhState } from "../../store";
import { Button, Card, CardHeader, Icon, Kpi, KpiStrip, TextInput } from "../../ui";
import { deskAct } from "./deskActions";
import { DESK_CSS, eurK } from "./DealKit";
import { useSalesRights } from "./shared";

export default function Forecast() {
  const s = usePhState();
  const nav = useNav();
  const rights = useSalesRights();
  const fc = useMemo(() => deskForecast(s), [s]);
  const [pick, setPick] = useState<string | null>(null);
  const max = Math.max(...fc.months.map((m) => Math.max(m.target, m.won + m.weighted)), 1);
  const q = fc.quarter;
  const qPct = Math.round((q.won / Math.max(1, q.target)) * 100);
  const sel = fc.months.find((m) => m.key === pick) || fc.months.find((m) => m.current)!;
  return (
    <div className="ph-page">
      <style>{DESK_CSS + FC_CSS}</style>
      <div className="fc-head">
        <div><div className="ph-eyebrow">Sell</div><h1 className="ph-h1">Forecast and targets</h1>
          <p className="fc-sub">What is won, what is likely, and how far from target. Weighted pipeline is each open deal's value times its chance of winning.</p></div>
        <Button icon="arrow" onClick={() => nav.go({ page: "Sales", tab: "pipeline", params: { mode: "list" } })}>Open deals list</Button>
      </div>
      <KpiStrip>
        <Kpi label={`${q.label} won`} value={eurK(q.won)} sub={`${qPct}% of the ${eurK(q.target)} target`} tone={qPct >= 100 ? "ok" : undefined} />
        <Kpi label={`${q.label} weighted still to close`} value={eurK(q.weighted)} sub={q.gap ? `${eurK(q.gap)} short if nothing else comes in` : "On track to hit the target"} tone={q.gap ? "warn" : "ok"} onClick={() => nav.go({ page: "Sales", tab: "pipeline", params: { view: "hot" } })} />
        <Kpi label="Win rate" value={fc.winRate === null ? "None yet" : `${fc.winRate}%`} sub="Of closed deals since April" />
        <Kpi label="Average deal" value={salesEur(fc.avgDeal)} sub={`Median ${fc.cycleDays} days from enquiry to won`} />
      </KpiStrip>

      <Card>
        <CardHeader title="Won against target, by month" sub="Solid is won. Light is the weighted pipeline expected to close that month. The line is the target. Click a month." />
        <div className="fc-chart" role="img" aria-label="Monthly won, weighted pipeline and target">
          {fc.months.map((m) => {
            const h = (v: number) => `${(v / max) * 100}%`;
            return (
              <button key={m.key} type="button" className={`fc-col${m.key === sel.key ? " on" : ""}${m.current ? " now" : ""}`} onClick={() => setPick(m.key)} aria-label={`${m.label}: won ${salesEur(m.won)}, weighted ${salesEur(m.weighted)}, target ${salesEur(m.target)}`}>
                <span className="fc-val ph-num">{m.won + m.weighted ? eurK(m.won + m.weighted) : ""}</span>
                <span className="fc-plot">
                  <span className="fc-target" style={{ bottom: h(m.target) }} />
                  <span className="fc-stack">
                    <span className="fc-won" style={{ height: h(m.won) }} />
                    <span className="fc-w" style={{ height: h(m.weighted) }} />
                  </span>
                </span>
                <span className="fc-lab">{m.label}{m.current ? <em>now</em> : null}</span>
              </button>);
          })}
        </div>
        <div className="fc-legend"><span><i className="won" />Won</span><span><i className="w" />Weighted pipeline</span><span><i className="t" />Target</span></div>
        <div className="fc-detail">
          <b>{sel.label}</b>
          <span>Target <b className="ph-num">{salesEur(sel.target)}</b></span>
          <span>Won <b className="ph-num">{salesEur(sel.won)}</b></span>
          {!sel.past ? <span>Weighted to close <b className="ph-num">{salesEur(sel.weighted)}</b> of {salesEur(sel.best)} in play</span> : null}
          <span>{sel.won >= sel.target ? <span className="fc-ok"><Icon name="check" size={12} />Target hit</span> : sel.past ? <span className="fc-bad">Missed by {salesEur(sel.target - sel.won)}</span> : sel.won + sel.weighted >= sel.target ? "On track if the weighted deals close" : `Needs ${salesEur(sel.target - sel.won - sel.weighted)} more`}</span>
          {rights.manage && !sel.past ? <TargetEdit month={sel.key} value={sel.target} /> : null}
        </div>
      </Card>

      <div className="fc-grid">
        <Card><CardHeader title="Win rate by service" sub="Closed deals since April: won out of won plus lost." /><Rates rows={fc.byService} /></Card>
        <Card><CardHeader title="Win rate by source" sub="Where the business that closes comes from." /><Rates rows={fc.bySource} /></Card>
      </div>

      <Card>
        <CardHeader title="First touch league" sub="Stephen's rule: a first reply within 10 minutes of the enquiry. Closed deals since April." />
        <div className="fc-league">
          {fc.league.map((r, i) => (
            <div key={r.by} className="fc-lrow">
              <span className={`fc-rank${i === 0 ? " gold" : ""}`}>{i + 1}</span>
              <span className="fc-who"><b>{r.name}</b><span>{r.n} first replies</span></span>
              <span className="fc-ltrack"><span style={{ width: `${r.pct}%` }} /><i style={{ left: "80%" }} title="80% goal" /></span>
              <span className="fc-lpct ph-num"><b>{r.pct}%</b> in 10 min</span>
              <span className="fc-lmed ph-num">Median {r.median} min</span>
            </div>))}
        </div>
        <div className="ph-faint" style={{ fontSize: 11.5, marginTop: 10 }}>The line marks the 80% goal. Live first replies from the pipeline count as soon as the deal closes.</div>
      </Card>
    </div>
  );
}

function Rates({ rows }: { rows: DeskRate[] }) {
  return (
    <div className="fc-rates">
      {rows.map((r) => (
        <div key={r.key} className="fc-rate">
          <div className="fc-rate-top"><span>{r.label}</span><b className="ph-num">{r.pct === null ? "None" : `${r.pct}%`}</b></div>
          <div className="fc-rtrack"><span style={{ width: `${r.pct ?? 0}%` }} /></div>
          <div className="fc-rate-sub">{r.won} won, {r.lost} lost · {salesEur(r.value)} won</div>
        </div>))}
    </div>
  );
}

function TargetEdit({ month, value }: { month: string; value: number }) {
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState(String(value));
  if (!edit) return <Button size="sm" variant="ghost" icon="edit" onClick={() => { setV(String(value)); setEdit(true); }}>Change target</Button>;
  return (
    <span className="ph-row-flex" style={{ gap: 6 }}>
      <TextInput type="number" min={1000} step={1000} value={v} onChange={(e) => setV(e.target.value)} aria-label="Monthly target in euro" style={{ width: 120 }} />
      <Button size="sm" variant="primary" onClick={() => { if (dispatch(deskAct.setTarget(month, Number(v))).ok) setEdit(false); }}>Save</Button>
      <Button size="sm" variant="ghost" onClick={() => setEdit(false)}>Cancel</Button>
    </span>
  );
}

const FC_CSS = `
.fc-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 14px; flex-wrap: wrap; margin: 4px 0 16px; }
.fc-sub { margin: 6px 0 0; font-size: 13px; color: var(--dim); max-width: 640px; line-height: 1.5; }
.fc-chart { display: grid; grid-template-columns: repeat(9, minmax(0, 1fr)); gap: 8px; height: 240px; margin-top: 6px; }
.fc-col { display: flex; flex-direction: column; align-items: stretch; gap: 6px; border: 0; background: none; padding: 6px 4px; border-radius: 12px; cursor: pointer; font: inherit; color: inherit; min-width: 0; }
.fc-col:hover, .fc-col.on { background: var(--surface-2); }
.fc-val { font-size: 11px; color: var(--ink); text-align: center; min-height: 14px; }
.fc-plot { position: relative; flex: 1; display: flex; justify-content: center; }
.fc-stack { position: absolute; bottom: 0; width: 62%; max-width: 46px; height: 100%; display: flex; flex-direction: column-reverse; }
.fc-won { background: var(--accent); border-radius: 4px; transition: height .5s var(--ease); }
.fc-w { background: #97C2BC; opacity: .45; border-radius: 4px; margin-bottom: 2px; transition: height .5s var(--ease); }
.fc-target { position: absolute; left: 8%; right: 8%; height: 0; border-top: 2px dashed var(--ink); opacity: .55; z-index: 2; }
.fc-lab { font-size: 11px; color: var(--dim); text-align: center; white-space: nowrap; }
.fc-lab em { display: block; font-style: normal; font-size: 9.5px; color: var(--accent); text-transform: uppercase; letter-spacing: .06em; }
.fc-col.now .fc-lab { color: var(--ink); font-weight: 600; }
.fc-legend { display: flex; gap: 14px; flex-wrap: wrap; font-size: 11.5px; color: var(--dim); margin-top: 8px; }
.fc-legend span { display: inline-flex; gap: 6px; align-items: center; }
.fc-legend i { display: inline-block; width: 12px; height: 9px; border-radius: 3px; background: var(--accent); }
.fc-legend i.w { background: #97C2BC; opacity: .45; }
.fc-legend i.t { height: 0; border-top: 2px dashed var(--ink); background: none; opacity: .55; border-radius: 0; }
.fc-detail { display: flex; align-items: center; gap: 8px 18px; flex-wrap: wrap; margin-top: 12px; padding: 10px 12px; border-radius: 12px; background: var(--surface-2); font-size: 12.5px; color: var(--dim); }
.fc-detail > b { color: var(--ink); font-size: 13.5px; }
.fc-detail span b { color: var(--ink); }
.fc-ok { color: var(--ok); display: inline-flex; gap: 4px; align-items: center; font-weight: 600; }
.fc-bad { color: var(--bad); font-weight: 600; }
.fc-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 14px; margin: 14px 0; }
.fc-rates { display: flex; flex-direction: column; gap: 12px; }
.fc-rate-top { display: flex; justify-content: space-between; font-size: 12.5px; color: var(--body); margin-bottom: 5px; }
.fc-rate-top b { color: var(--ink); }
.fc-rtrack, .fc-ltrack { height: 8px; border-radius: 99px; background: var(--track); overflow: hidden; position: relative; }
.fc-rtrack span, .fc-ltrack span { display: block; height: 100%; background: var(--accent); border-radius: 99px; }
.fc-rate-sub { font-size: 11px; color: var(--faint); margin-top: 4px; }
.fc-league { display: flex; flex-direction: column; }
.fc-lrow { display: grid; grid-template-columns: 28px minmax(140px, 1fr) minmax(120px, 2fr) 110px 100px; gap: 12px; align-items: center; padding: 10px 0; border-top: 1px solid var(--border); }
.fc-lrow:first-child { border-top: 0; }
.fc-rank { width: 26px; height: 26px; border-radius: 50%; background: var(--track); color: var(--dim); font-size: 12px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; }
.fc-rank.gold { background: var(--accent); color: var(--on-accent); }
.fc-who { display: flex; flex-direction: column; }
.fc-who b { font-size: 13px; color: var(--ink); }
.fc-who span { font-size: 11.5px; color: var(--faint); }
.fc-ltrack { height: 10px; overflow: visible; }
.fc-ltrack i { position: absolute; top: -3px; bottom: -3px; width: 2px; background: var(--ink); opacity: .45; }
.fc-lpct { font-size: 12px; color: var(--dim); text-align: right; } .fc-lpct b { color: var(--ink); font-size: 14px; }
.fc-lmed { font-size: 12px; color: var(--dim); text-align: right; }
@media (max-width: 860px) { .fc-grid { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 560px) {
  .fc-chart { height: 200px; gap: 2px; }
  .fc-val { font-size: 9px; }
  .fc-lab { font-size: 9.5px; }
  .fc-lrow { grid-template-columns: 26px minmax(0, 1fr) auto; }
  .fc-ltrack { grid-column: 2 / -1; grid-row: 2; }
  .fc-lmed { display: none; }
}
`;
