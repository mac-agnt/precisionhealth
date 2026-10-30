/* Small pieces shared by the three dashboard tabs. */
import type { ReactNode } from "react";
import { fmtTime, fmtWeekdayDate, linkFor } from "../../model";
import type { NavTarget } from "../../model";
import { useNav } from "../../nav-context";
import { Button, DemoTag, Icon, PALETTE, Pill } from "../../ui";
import type { DayRow } from "./select";
import type { GlyphName } from "../../ui";

/** "As of Mon 5 Oct, 08:15" from the demo clock. Never the real clock. */
export function AsOf({ nowUtc }: { nowUtc: string }) {
  return (
    <>
      <span className="ph-demo-tag" title="Fixed demo clock, Europe/Dublin">As of {fmtWeekdayDate(nowUtc)}, {fmtTime(nowUtc)}</span>
      <DemoTag>Synthetic data</DemoTag>
    </>
  );
}

/** A quiet explanatory line under a chart: what the number counts and what it is out of. */
export function Note({ children, icon = "info" }: { children: ReactNode; icon?: GlyphName }) {
  return (
    <div className="ph-row-flex" style={{ alignItems: "flex-start", gap: 7, fontSize: 11.5, lineHeight: 1.45, color: "var(--dim)", marginTop: 10 }}>
      <Icon name={icon} size={12} style={{ color: "var(--faint)", marginTop: 2 }} />
      <span style={{ minWidth: 0 }}>{children}</span>
    </div>
  );
}

/** A link to a queue or page, rendered as a small ghost button. */
export function GoButton({ to, children, icon = "arrow", title }: { to: NavTarget; children: ReactNode; icon?: GlyphName; title?: string }) {
  const nav = useNav();
  return <Button size="sm" variant="ghost" icon={icon} title={title} onClick={() => nav.go(to)}>{children}</Button>;
}

/** Legend swatch with label and value. */
export function Swatch({ color, label, value }: { color: string; label: ReactNode; value?: ReactNode }) {
  return (
    <span className="ph-row-flex" style={{ gap: 6, fontSize: 11.5, color: "var(--dim)" }}>
      <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: 3, background: color, flex: "none" }} />
      <span>{label}</span>
      {value !== undefined ? <span className="ph-num" style={{ color: "var(--ink)" }}>{value}</span> : null}
    </span>
  );
}

/** Label and value pair for compact fact lists. */
export function Fact({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div className="ph-faint" style={{ fontSize: 11, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 12.5, color: "var(--body)", lineHeight: 1.4 }}>{children}</div>
    </div>
  );
}

/** Colours per programme, in programme order (Sisk, Salesforce, IBM), from the shared chart palette. Series only, never status. */
export const PROGRAMME_COLOR: Record<string, string> = {
  "PRG-SISK-26": PALETTE[0],
  "PRG-SF-26": PALETTE[1],
  "PRG-IBM-26": PALETTE[2],
};

/* ---- pieces for the Sales and Operations dashboards ---- */

/** Styles for the dashboard lists and tiles. Prefixed dsh- so nothing else is touched. */
export const DASH_CSS = `
.dsh-grid2 { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 14px; align-items: start; }
.dsh-grid32 { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); gap: 14px; align-items: start; }
@media (max-width: 980px) { .dsh-grid2, .dsh-grid32 { grid-template-columns: minmax(0, 1fr); } }
.dsh-group { margin-top: 16px; }
.dsh-group:first-child { margin-top: 0; }
.dsh-group-head { display: flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--dim); margin-bottom: 4px; }
.dsh-row { display: flex; align-items: center; gap: 12px; text-align: left; padding: 10px 8px; margin: 0 -8px; width: calc(100% + 16px); border: 0; border-top: 1px solid var(--border); background: none; cursor: pointer; font: inherit; color: inherit; border-radius: 10px; transition: background .15s var(--ease); min-width: 0; }
.dsh-row:hover { background: var(--surface-2); }
.dsh-row:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.dsh-row-main { flex: 1; min-width: 0; }
.dsh-row-title { display: block; font-size: 13px; font-weight: 500; color: var(--ink); line-height: 1.35; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-row-sub { display: block; font-size: 11.5px; color: var(--dim); margin-top: 2px; line-height: 1.4; }
.dsh-row-right { flex: none; display: flex; align-items: center; gap: 8px; justify-content: flex-end; flex-wrap: wrap; }
.dsh-row-chev { color: var(--faint); flex: none; }
.dsh-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(128px, 1fr)); gap: 10px; }
.dsh-stats-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.dsh-col { min-width: 0; }
.dsh-actrow { display: flex; align-items: center; gap: 8px; border-top: 1px solid var(--border); }
.dsh-actrow > .dsh-row { border-top: 0; flex: 1; width: auto; margin-right: 0; }
.dsh-actrow > .dsh-row .dsh-row-chev { display: none; }
.dsh-actrow-acts { flex: none; display: flex; gap: 6px; }
.dsh-stat { display: block; text-align: left; padding: 12px 13px; border-radius: 14px; border: 1px solid var(--border); background: transparent; font: inherit; color: inherit; cursor: pointer; min-width: 0; transition: background .15s var(--ease); }
.dsh-stat:hover { background: var(--surface-2); }
.dsh-stat:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.dsh-stat-label { font-size: 11.5px; color: var(--dim); line-height: 1.35; }
.dsh-stat-value { font-size: 24px; font-weight: 600; letter-spacing: -.6px; color: var(--ink); line-height: 1.1; margin-top: 6px; font-variant-numeric: tabular-nums; }
.dsh-stat-sub { font-size: 11px; color: var(--faint); margin-top: 4px; line-height: 1.35; }
.dsh-empty { font-size: 12.5px; color: var(--dim); padding: 10px 0 2px; display: flex; gap: 8px; align-items: center; border-top: 1px solid var(--border); }
.dsh-bar { display: grid; grid-template-columns: minmax(96px, 150px) minmax(0, 1fr) auto; align-items: center; gap: 12px; padding: 8px; margin: 0 -8px; width: calc(100% + 16px); border: 0; background: none; border-radius: 10px; cursor: pointer; font: inherit; color: inherit; text-align: left; }
.dsh-bar:hover { background: var(--surface-2); }
.dsh-bar:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.dsh-bar-track { display: block; height: 22px; border-radius: 8px; background: var(--track); overflow: hidden; }
.dsh-bar-fill { display: block; height: 100%; border-radius: 8px; transition: width .5s var(--ease); }
.dsh-bar-val { font-size: 12.5px; color: var(--ink); font-weight: 600; font-variant-numeric: tabular-nums; text-align: right; white-space: nowrap; }
.dsh-bar-val small { display: block; font-weight: 400; color: var(--faint); font-size: 11px; }
.dsh-dots { display: inline-flex; gap: 3px; }
.dsh-dot { width: 7px; height: 7px; border-radius: 99px; background: var(--track); }
.dsh-dot.on { background: var(--accent); }
.dsh-prog { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin-top: 8px; }
.dsh-prog-cell { min-width: 0; }
.dsh-prog-label { font-size: 10.5px; color: var(--faint); margin-top: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dsh-prog-label b { color: var(--ink); font-weight: 600; font-variant-numeric: tabular-nums; }
@media (max-width: 560px) {
  .dsh-row { flex-wrap: wrap; }
  .dsh-row-right { width: 100%; justify-content: flex-start; }
  .dsh-row-chev { display: none; }
  .dsh-bar { grid-template-columns: minmax(0, 1fr) auto; row-gap: 6px; }
  .dsh-bar-track { grid-column: 1 / -1; grid-row: 2; }
  .dsh-prog { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .dsh-stats-2 { grid-template-columns: minmax(0, 1fr); }
  .dsh-actrow { flex-wrap: wrap; padding-bottom: 8px; }
  .dsh-actrow > .dsh-row { flex-basis: 100%; }
}
`;

/** A clickable list row: what it is, one line of detail, and status on the right. */
export function ActRow({ title, sub, right, onClick, label }: { title: ReactNode; sub?: ReactNode; right?: ReactNode; onClick: () => void; label?: string }) {
  return (
    <button type="button" className="dsh-row" onClick={onClick} aria-label={label}>
      <span className="dsh-row-main">
        <span className="dsh-row-title">{title}</span>
        {sub ? <span className="dsh-row-sub">{sub}</span> : null}
      </span>
      {right ? <span className="dsh-row-right">{right}</span> : null}
      <Icon name="arrow" size={13} className="dsh-row-chev" />
    </button>
  );
}

/** A list row that opens its record, with its action button beside it. */
export function ActRowWith({ acts, ...row }: { title: ReactNode; sub?: ReactNode; right?: ReactNode; onClick: () => void; label?: string; acts: ReactNode }) {
  return (
    <div className="dsh-actrow">
      <ActRow {...row} />
      <span className="dsh-actrow-acts">{acts}</span>
    </div>
  );
}

/** A small group heading inside a card, with an optional count or pill on the right. */
export function Group({ title, right, children }: { title: ReactNode; right?: ReactNode; children: ReactNode }) {
  return (
    <div className="dsh-group">
      <div className="dsh-group-head"><span className="ph-grow">{title}</span>{right}</div>
      {children}
    </div>
  );
}

/** A number tile inside a card. Always clickable through to the records behind it. */
export function Stat({ label, value, sub, onClick, tone }: { label: ReactNode; value: ReactNode; sub?: ReactNode; onClick: () => void; tone?: "warn" | "bad" }) {
  const color = tone === "bad" ? "var(--bad)" : tone === "warn" ? "var(--warn)" : undefined;
  return (
    <button type="button" className="dsh-stat" onClick={onClick}>
      <div className="dsh-stat-label">{label}</div>
      <div className="dsh-stat-value" style={color ? { color } : undefined}>{value}</div>
      {sub ? <div className="dsh-stat-sub">{sub}</div> : null}
    </button>
  );
}

/** Calm line for a list with nothing in it. */
export function Empty({ children }: { children: ReactNode }) {
  return <div className="dsh-empty"><Icon name="check" size={14} style={{ color: "var(--ok)" }} />{children}</div>;
}

/** Progress as dots: done steps filled. */
export function Dots({ done, total, label }: { done: number; total: number; label: string }) {
  return (
    <span className="dsh-dots" role="img" aria-label={label}>
      {Array.from({ length: total }, (_, i) => <span key={i} className={`dsh-dot${i < done ? " on" : ""}`} />)}
    </span>
  );
}

/** Horizontal bar row that opens the records behind it when clicked. */
export function BarRow({ label, value, max, color, right, onClick, aria }: { label: ReactNode; value: number; max: number; color?: string; right: ReactNode; onClick: () => void; aria: string }) {
  const w = max ? Math.max(value ? 2 : 0, (value / max) * 100) : 0;
  return (
    <button type="button" className="dsh-bar" onClick={onClick} aria-label={aria}>
      <span style={{ fontSize: 12.5, color: "var(--body)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      <span className="dsh-bar-track"><span className="dsh-bar-fill" style={{ width: `${w}%`, background: color || PALETTE[0] }} /></span>
      <span className="dsh-bar-val">{right}</span>
    </button>
  );
}

/** One screening day: date, client, method and room, with booked against offered. */
export function DayLine({ r, showNurse }: { r: DayRow; showNurse?: boolean }) {
  const nav = useNav();
  const to: NavTarget = r.day ? { page: "Clinics", tab: "days", params: { day: r.day.id } } : linkFor("session", r.session.id);
  const where = r.roomTbc ? "Room to be confirmed" : r.session.room;
  return (
    <ActRow onClick={() => nav.go(to)} label={`Open ${r.st.programme.clientName} on ${fmtWeekdayDate(r.session.date)}`}
      title={`${fmtWeekdayDate(r.session.date)} · ${r.st.programme.clientName}`}
      sub={`${r.poc ? "Point of care" : "Lab bloods"} · ${where}${showNurse ? ` · ${r.nurse}` : ""}`}
      right={<>
        {r.status === "draft" ? <Pill tone="neutral" icon="edit">Draft</Pill> : null}
        {r.nurseClash ? <Pill tone="bad" icon="alert">Nurse double-booked</Pill> : null}
        <span className="ph-num" style={{ fontSize: 12, color: "var(--ink)", whiteSpace: "nowrap" }}>{r.st.booked} of {r.st.slots} booked</span>
      </>} />
  );
}
