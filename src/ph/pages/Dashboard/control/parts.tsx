/* Small building blocks for the control panel: the row with inline buttons, a group with
   "show more", and the styles. Prefixed ctl- so nothing else is touched. */
import { useState } from "react";
import type { ReactNode } from "react";
import { Icon } from "../../../ui";

export const CTL_CSS = `
.ctl-quick { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.ctl-quick-label { font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--dim); margin-right: 4px; }
.ctl-filters { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
.ctl-filters .ph-input { width: auto; min-width: 170px; }
.ctl-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 14px; align-items: start; }
.ctl-grid.one { grid-template-columns: minmax(0, 1fr); }
@media (max-width: 1100px) { .ctl-grid { grid-template-columns: minmax(0, 1fr); } }
.ctl-group { margin-top: 16px; }
.ctl-group:first-of-type { margin-top: 4px; }
.ctl-group-head { display: flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--dim); margin-bottom: 2px; }
.ctl-count { display: inline-flex; min-width: 20px; height: 18px; padding: 0 6px; border-radius: 99px; align-items: center; justify-content: center; font-size: 11px; font-weight: 600; letter-spacing: 0; background: var(--track); color: var(--ink); font-variant-numeric: tabular-nums; }
.ctl-count.warn { background: color-mix(in srgb, var(--warn) 22%, transparent); }
.ctl-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; padding: 10px 0; border-top: 1px solid var(--border); min-width: 0; }
.ctl-row.urgent { box-shadow: inset 3px 0 0 var(--warn); padding-left: 10px; }
.ctl-main { flex: 1 1 230px; min-width: 0; }
.ctl-title { display: block; font-size: 13px; font-weight: 500; color: var(--ink); line-height: 1.35; text-align: left; background: none; border: 0; padding: 0; font: inherit; font-weight: 500; cursor: pointer; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ctl-title:hover { text-decoration: underline; text-underline-offset: 2px; }
.ctl-title:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 4px; }
.ctl-sub { display: block; font-size: 11.5px; color: var(--dim); margin-top: 2px; line-height: 1.4; }
.ctl-tags { display: inline-flex; gap: 6px; flex-wrap: wrap; margin-top: 5px; }
.ctl-acts { flex: none; display: flex; gap: 6px; align-items: center; justify-content: flex-end; flex-wrap: wrap; }
.ctl-more { margin-top: 6px; font-size: 12px; color: var(--accent); background: none; border: 0; padding: 4px 0; cursor: pointer; font: inherit; font-size: 12px; }
.ctl-more:hover { text-decoration: underline; }
.ctl-empty { font-size: 12.5px; color: var(--dim); padding: 10px 0 2px; display: flex; gap: 8px; align-items: center; border-top: 1px solid var(--border); }
.ctl-stock { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin: 8px 0 4px; }
.ctl-stock div { border: 1px solid var(--border); border-radius: 12px; padding: 8px 10px; min-width: 0; }
.ctl-stock b { display: block; font-size: 18px; font-weight: 600; color: var(--ink); font-variant-numeric: tabular-nums; letter-spacing: -.3px; }
.ctl-stock span { font-size: 11px; color: var(--dim); }
.ctl-cand { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-top: 1px solid var(--border); }
.ctl-cand:first-child { border-top: 0; }
.ctl-form { display: grid; gap: 12px; }
.ctl-form-2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.ctl-form-3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.ctl-compare { display: grid; grid-template-columns: auto minmax(0, 1fr) minmax(0, 1fr); gap: 6px 12px; font-size: 12.5px; }
.ctl-compare .h { font-size: 11px; color: var(--dim); }
.ctl-compare .bad { color: var(--warn); font-weight: 600; }
.ctl-seg { max-width: 100%; overflow-x: auto; scrollbar-width: none; }
@media (max-width: 640px) {
  .ctl-quick { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; padding-bottom: 2px; }
  .ctl-quick .ph-btn { flex: none; white-space: nowrap; }
  .ctl-quick-label { display: none; }
  .ctl-seg { width: 100%; }
  .ctl-row { flex-wrap: wrap; }
  .ctl-acts { width: 100%; justify-content: flex-start; }
  .ctl-filters .ph-input { min-width: 0; flex: 1; }
  .ctl-stock { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .ctl-form-3 { grid-template-columns: minmax(0, 1fr); }
}
`;

/** One thing to act on: what it is (click to open the record), detail, and its buttons. */
export function CtlLine({ title, sub, tags, acts, onOpen, urgent, label }: { title: ReactNode; sub?: ReactNode; tags?: ReactNode; acts?: ReactNode; onOpen?: () => void; urgent?: boolean; label?: string }) {
  return (
    <div className={`ctl-row${urgent ? " urgent" : ""}`}>
      <div className="ctl-main">
        {onOpen ? <button type="button" className="ctl-title" onClick={onOpen} aria-label={label} title={label}>{title}</button> : <span className="ctl-title" style={{ cursor: "default" }}>{title}</span>}
        {sub ? <span className="ctl-sub">{sub}</span> : null}
        {tags ? <span className="ctl-tags">{tags}</span> : null}
      </div>
      {acts ? <div className="ctl-acts">{acts}</div> : null}
    </div>
  );
}

/** A titled list inside a service card. Shows the first few rows, the rest behind "Show all". */
export function CtlGroup({ title, count, warn, children, empty, shown = 4, right }: { title: string; count: number; warn?: boolean; children: ReactNode[]; empty: string; shown?: number; right?: ReactNode }) {
  const [all, setAll] = useState(false);
  const list = all ? children : children.slice(0, shown);
  return (
    <div className="ctl-group">
      <div className="ctl-group-head">
        <span className="ph-grow">{title}</span>
        {right}
        <span className={`ctl-count${warn && count ? " warn" : ""}`} aria-label={`${count} to do`}>{count}</span>
      </div>
      {children.length ? list : empty ? <div className="ctl-empty"><Icon name="check" size={14} style={{ color: "var(--ok)" }} />{empty}</div> : null}
      {children.length > shown ? (
        <button type="button" className="ctl-more" onClick={() => setAll((v) => !v)}>{all ? "Show fewer" : `Show all ${children.length}`}</button>
      ) : null}
    </div>
  );
}
