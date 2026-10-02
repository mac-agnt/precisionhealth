/* Shared labels and small pieces for the Reporting tabs. */
import type { ReactNode } from "react";
import type { EmployerReport } from "../../model";
import { Icon, Pill } from "../../ui";
import type { GlyphName, Tone } from "../../ui";

export const STATUS_LABEL: Record<EmployerReport["status"], string> = {
  draft: "Draft",
  reviewed: "Disclosure reviewed",
  approved: "Approved",
  exported: "Exported",
};
export const STATUS_TONE: Record<EmployerReport["status"], Tone> = { draft: "warn", reviewed: "info", approved: "ok", exported: "ok" };
const STATUS_ICON: Record<EmployerReport["status"], GlyphName> = { draft: "edit", reviewed: "shield", approved: "check", exported: "print" };

export function StatusPill({ status }: { status: EmployerReport["status"] }) {
  return <Pill tone={STATUS_TONE[status]} icon={STATUS_ICON[status]}>{STATUS_LABEL[status]}</Pill>;
}

/** A quiet explanatory line. */
export function Note({ children, icon = "info" }: { children: ReactNode; icon?: GlyphName }) {
  return (
    <div className="ph-row-flex" style={{ alignItems: "flex-start", gap: 7, fontSize: 11.5, lineHeight: 1.45, color: "var(--dim)", marginTop: 10 }}>
      <Icon name={icon} size={12} style={{ color: "var(--faint)", marginTop: 2 }} />
      <span style={{ minWidth: 0 }}>{children}</span>
    </div>
  );
}

/** Visually hidden caption for tables. */
export const srOnly = { position: "absolute" as const, width: 1, height: 1, overflow: "hidden" as const, clip: "rect(0 0 0 0)" };

/** The employer-safe output promise, stated where reports are built and exported. */
export function EmployerSafeNote() {
  return (
    <div className="ph-card-flat" role="note" style={{ padding: "12px 14px", background: "var(--accent-faint)", borderColor: "var(--accent-line)" }}>
      <div className="ph-row-flex" style={{ gap: 8, fontSize: 12.5, fontWeight: 600, color: "var(--ink)" }}>
        <Icon name="shield" size={14} style={{ color: "var(--accent)" }} />
        Employer-safe output only
      </div>
      <div style={{ fontSize: 12, color: "var(--body)", lineHeight: 1.5, marginTop: 4 }}>
        No personal results and no employee-level drill-through. Small cells and revealing comparisons are suppressed.
      </div>
    </div>
  );
}
