/* Small pieces shared by the Portal admin views: the account status pill, the reason field every
   audited action uses, and a confirm panel that dispatches silently and shows the outcome in place. */
import { useId, useState } from "react";
import type { ReactNode } from "react";
import { ACCOUNT_STATUS_HELP, ACCOUNT_STATUS_LABEL, act } from "../../model";
import type { Action, ActionResult, PortalAccountStatus } from "../../model";
import { dispatch } from "../../store";
import { Button, Icon, Pill, Textarea } from "../../ui";
import type { GlyphName, Tone } from "../../ui";

export const STATUS_LOOK: Record<PortalAccountStatus, { tone: Tone; icon: GlyphName }> = {
  not_invited: { tone: "neutral", icon: "mail" },
  invited: { tone: "brand", icon: "send" },
  registered: { tone: "warn", icon: "user" },
  mfa_enrolled: { tone: "ok", icon: "shield" },
  locked: { tone: "bad", icon: "lock" },
};

export function AccountStatusPill({ status }: { status: PortalAccountStatus }) {
  const l = STATUS_LOOK[status];
  return <Pill tone={l.tone} icon={l.icon} title={ACCOUNT_STATUS_HELP[status]}>{ACCOUNT_STATUS_LABEL[status]}</Pill>;
}

/** Runs an action without the global toast for failures, so the reason shows next to the button. Success still toasts. */
export function runAction(action: Action): ActionResult {
  const r = dispatch(action, { silent: true });
  if (r.ok && r.message) dispatch(act.toast(r.tone === "bad" ? "warn" : r.tone || "ok", r.message));
  return r;
}

export function ReasonField({ value, onChange, label = "Reason", hint, placeholder }: { value: string; onChange: (v: string) => void; label?: string; hint?: ReactNode; placeholder?: string }) {
  const id = useId();
  return (
    <div className="pa-field">
      <label className="ph-label" htmlFor={id}>{label}</label>
      <Textarea id={id} rows={2} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-describedby={id + "-h"} />
      <div className="ph-help" id={id + "-h"}>{hint || "Kept in the audit log. Keep clinical details out of it."}</div>
    </div>
  );
}

/**
 * One audited action: what it does, the fields it needs and a confirm button. The panel stays open
 * with the reason when the model refuses, and closes on success.
 */
export function ActionPanel({ title, children, confirmLabel, tone = "primary", onConfirm, onClose, disabled }: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  tone?: "primary" | "danger";
  onConfirm: () => ActionResult;
  onClose: () => void;
  disabled?: boolean;
}) {
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="pa-action-panel" role="group" aria-label={title}>
      <div className="pa-action-title">{title}</div>
      <div className="pa-action-body">{children}</div>
      {err ? <div className="ph-err" role="alert" style={{ marginTop: 8 }}>{err}</div> : null}
      <div className="ph-wrap" style={{ marginTop: 10 }}>
        <Button variant={tone === "danger" ? "danger" : "primary"} size="sm" disabled={disabled} onClick={() => { const r = onConfirm(); if (r.ok) onClose(); else setErr(r.message || "That could not be done."); }}>{confirmLabel}</Button>
        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
      </div>
    </div>
  );
}

export function Note({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "warn" | "bad" }) {
  return (
    <div className={"pd-callout" + (tone === "info" ? "" : " " + tone)}>
      <Icon name={tone === "info" ? "info" : "alert"} size={14} style={{ marginTop: 2, color: tone === "bad" ? "var(--bad)" : tone === "warn" ? "var(--warn)" : "var(--accent)", flex: "none" }} />
      <span>{children}</span>
    </div>
  );
}
