/* Shared pieces for the Sales module: rights, status pills (text, icon and colour together),
   small tags and the view-only notice. */
import type { ReactNode } from "react";
import {
  SALES_ILH_PAYMENT_LABEL, SALES_PROPOSAL_STATUS_LABEL, SALES_RECALL_STATUS_LABEL, SALES_SERVICE_LABEL, SALES_SOURCE_LABEL, SALES_STAGE_LABEL, SALES_TENDER_STATUS_LABEL,
  salesRights,
} from "../../model";
import type { SalesIlhPayment, SalesProposalStatus, SalesRecallStatus, SalesRights, SalesService, SalesSource, SalesStage, SalesTenderStatus } from "../../model";
import { usePersona } from "../../store";
import { Icon, Pill } from "../../ui";
import type { GlyphName, Tone } from "../../ui";

export function useSalesRights(): SalesRights {
  return salesRights(usePersona());
}

export const STAGE_LOOK: Record<SalesStage, { tone: Tone; icon: GlyphName }> = {
  new: { tone: "info", icon: "plus" },
  proposal_sent: { tone: "warn", icon: "send" },
  won: { tone: "ok", icon: "check" },
  lost: { tone: "neutral", icon: "x" },
};
export function StagePill({ stage }: { stage: SalesStage }) {
  const l = STAGE_LOOK[stage];
  return <Pill tone={l.tone} icon={l.icon}>{SALES_STAGE_LABEL[stage]}</Pill>;
}

const PROPOSAL_LOOK: Record<SalesProposalStatus, { tone: Tone; icon: GlyphName }> = {
  draft: { tone: "neutral", icon: "edit" },
  sent: { tone: "warn", icon: "send" },
  accepted: { tone: "ok", icon: "check" },
  declined: { tone: "bad", icon: "x" },
};
export function ProposalStatusPill({ status, superseded }: { status: SalesProposalStatus; superseded?: boolean }) {
  if (superseded) return <Pill tone="neutral" icon="layers" title="A later version replaced this one">Superseded</Pill>;
  const l = PROPOSAL_LOOK[status];
  return <Pill tone={l.tone} icon={l.icon}>{SALES_PROPOSAL_STATUS_LABEL[status]}</Pill>;
}

const PAYMENT_LOOK: Record<SalesIlhPayment, { tone: Tone; icon: GlyphName }> = {
  draft_needs_action: { tone: "bad", icon: "alert" },
  in_draft: { tone: "warn", icon: "edit" },
  awaiting_payment: { tone: "info", icon: "clock" },
  paid: { tone: "ok", icon: "check" },
};
export function PaymentPill({ status }: { status: SalesIlhPayment | null }) {
  if (!status) return <Pill tone="neutral" icon="calendar">Not yet screened</Pill>;
  const l = PAYMENT_LOOK[status];
  return <Pill tone={l.tone} icon={l.icon}>{SALES_ILH_PAYMENT_LABEL[status]}</Pill>;
}

const RECALL_LOOK: Record<SalesRecallStatus, { tone: Tone; icon: GlyphName }> = {
  overdue: { tone: "bad", icon: "alert" },
  plan_now: { tone: "warn", icon: "calendar" },
  upcoming: { tone: "neutral", icon: "clock" },
  in_pipeline: { tone: "info", icon: "send" },
  rebooked: { tone: "ok", icon: "check" },
};
export function RecallPill({ status }: { status: SalesRecallStatus }) {
  const l = RECALL_LOOK[status];
  return <Pill tone={l.tone} icon={l.icon}>{SALES_RECALL_STATUS_LABEL[status]}</Pill>;
}

const TENDER_LOOK: Record<SalesTenderStatus, { tone: Tone; icon: GlyphName }> = {
  watching: { tone: "neutral", icon: "eye" },
  preparing: { tone: "warn", icon: "edit" },
  submitted: { tone: "info", icon: "send" },
  not_bidding: { tone: "neutral", icon: "x" },
};
export function TenderPill({ status }: { status: SalesTenderStatus }) {
  const l = TENDER_LOOK[status];
  return <Pill tone={l.tone} icon={l.icon}>{SALES_TENDER_STATUS_LABEL[status]}</Pill>;
}

export function ServiceTags({ services }: { services: SalesService[] }) {
  return (
    <span className="sl-tags">
      {services.map((s) => <span key={s} className="sl-tag">{SALES_SERVICE_LABEL[s]}</span>)}
    </span>
  );
}
const SOURCE_ICON: Record<SalesSource, GlyphName> = { helpscout: "mail", website: "link", referral: "users", irish_life: "shield", recall: "refresh", tender: "file" };
export function SourceTag({ source, sourceRef }: { source: SalesSource; sourceRef?: string | null }) {
  return (
    <span className="sl-source" title={sourceRef ? `${SALES_SOURCE_LABEL[source]}, ${sourceRef}` : SALES_SOURCE_LABEL[source]}>
      <Icon name={SOURCE_ICON[source]} size={11} />
      <span className="ph-trunc">{SALES_SOURCE_LABEL[source]}{sourceRef && source === "helpscout" ? ` ${sourceRef}` : ""}</span>
    </span>
  );
}
export function FictionalTag({ show }: { show: boolean }) {
  return show ? <span className="sl-fict" title="Invented company name for the demo">Fictional company</span> : null;
}

/** Shown on Sales screens to roles that can look but not change. */
export function ViewOnly({ children }: { children?: ReactNode }) {
  return (
    <div className="sl-note" role="note">
      <Icon name="lock" size={13} />
      <span>{children || "View only. Stephen Kelly owns sales in this demo. Switch role in Settings, Experience to make changes."}</span>
    </div>
  );
}

export function KV({ rows }: { rows: Array<[ReactNode, ReactNode]> }) {
  return (
    <dl className="sl-kv">
      {rows.map(([k, v], i) => (
        <div key={i} className="sl-kv-row"><dt>{k}</dt><dd>{v}</dd></div>
      ))}
    </dl>
  );
}

export function mergeParams(current: Record<string, string>, patch: Record<string, string | null | undefined>): Record<string, string> {
  const next: Record<string, string> = { ...current };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined || v === "") delete next[k];
    else next[k] = v;
  }
  return next;
}

/** Parses a whole number from an input, or null when blank. */
export function toInt(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n) : NaN;
}
