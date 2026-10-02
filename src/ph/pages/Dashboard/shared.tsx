/* Small pieces shared by the three dashboard tabs. */
import type { ReactNode } from "react";
import { fmtTime, fmtWeekdayDate } from "../../model";
import type { NavTarget } from "../../model";
import { useNav } from "../../nav-context";
import { Button, DemoTag, Icon, PALETTE } from "../../ui";
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
