/* Shared pieces for the Results screens: status labels (text, icon and colour together),
   a portal for overlays, a width hook for narrow layouts and a compact audit list.
   Nothing here keeps its own copy of the data; everything reads the shared store. */
import { useEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { createPortal } from "react-dom";
import { ANALYTES, HOLD_CATEGORY_LABEL, REPORT_STATE_LABEL, fmtShortDateTime } from "../../model";
import type { ActivityView, AnalyteCode, Episode, HoldCategory, ImportRow, Observation, QuarantineReason } from "../../model";
import { DemoTag, Icon, Pill, TONE } from "../../ui";
import type { GlyphName, Tone } from "../../ui";

/* ---- layout helpers ---- */

/** Width of an element, kept current with a ResizeObserver. 0 until measured. */
export function useWidth<T extends HTMLElement = HTMLDivElement>(): [RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => { for (const e of entries) setW(e.contentRect.width); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/**
 * Drawers and modals are position: fixed. The page entrance animation leaves a filter on
 * .ph-page and cards use backdrop-filter, and either would trap a fixed overlay inside the
 * page box. Rendering through a portal into the themed root keeps the overlay on the viewport
 * and keeps the theme tokens.
 */
export function OverlayPortal({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") return null;
  const host = (document.querySelector("[data-theme]") as HTMLElement | null) || document.body;
  return createPortal(children, host);
}

/* ---- labels ---- */

export const QUARANTINE_LABEL: Record<QuarantineReason, string> = {
  dob_mismatch: "Date of birth mismatch",
  unknown_specimen: "Unknown specimen identifier",
  multiple_candidates: "Two candidate episodes",
};

const STATE_LOOK: Record<Episode["reportState"], { tone: Tone; icon: GlyphName }> = {
  awaiting_results: { tone: "neutral", icon: "clock" },
  ready_for_review: { tone: "info", icon: "eye" },
  released: { tone: "ok", icon: "check" },
  on_hold: { tone: "warn", icon: "flag" },
};
export function ReportStatePill({ state }: { state: Episode["reportState"] }) {
  const l = STATE_LOOK[state];
  return <Pill tone={l.tone} icon={l.icon}>{REPORT_STATE_LABEL[state]}</Pill>;
}

const HOLD_LOOK: Record<HoldCategory, { tone: Tone; icon: GlyphName }> = {
  identity: { tone: "warn", icon: "alert" },
  data_quality: { tone: "info", icon: "info" },
  clinical_action: { tone: "bad", icon: "flag" },
};
export function HoldCategoryPill({ category, label }: { category: HoldCategory; label?: string }) {
  const l = HOLD_LOOK[category];
  return <Pill tone={l.tone} icon={l.icon}>{label || HOLD_CATEGORY_LABEL[category]}</Pill>;
}

const ROW_LOOK: Record<ImportRow["state"], { tone: Tone; icon: GlyphName; label: string }> = {
  imported: { tone: "ok", icon: "check", label: "Imported" },
  resolved: { tone: "ok", icon: "shield", label: "Resolved, committed once" },
  duplicate: { tone: "neutral", icon: "layers", label: "Duplicate, skipped" },
  quarantined: { tone: "warn", icon: "alert", label: "Quarantined" },
};
export function RowStatePill({ state }: { state: ImportRow["state"] }) {
  const l = ROW_LOOK[state];
  return <Pill tone={l.tone} icon={l.icon}>{l.label}</Pill>;
}

/** Text-labelled flag. Never "normal": the limits are illustrative and clinician-owned. */
export function FlagPill({ flag, short }: { flag: Observation["flag"]; short?: boolean }) {
  return flag === "review_required"
    ? <Pill tone="warn" icon="flag">Review required</Pill>
    : <Pill tone="neutral" icon="dot">{short ? "Within limit" : "Within displayed limit"}</Pill>;
}

export function TestStatusPill({ status }: { status: "received" | "pending" | "quarantined" }) {
  if (status === "pending") return <Pill tone="neutral" icon="clock">Pending, not received</Pill>;
  if (status === "quarantined") return <Pill tone="warn" icon="alert">Held in import</Pill>;
  return <Pill tone="ok" icon="check">Received</Pill>;
}

/** A value as the laboratory sent it when the unit is not the template unit, otherwise to the analyte's decimals. */
export function fmtValue(code: AnalyteCode, value: number, unit: string): string {
  const a = ANALYTES[code];
  return unit === a.unit ? value.toFixed(a.decimals) : String(value);
}

/** Shown in place of a clinical value for roles that cannot see it. Hidden, not blurred. */
export function HiddenValue({ label = "Hidden for this role" }: { label?: string }) {
  return (
    <span className="ph-faint" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, whiteSpace: "nowrap" }}>
      <Icon name="lock" size={11} /> {label}
    </span>
  );
}

/* ---- small components ---- */

export function Kv({ items, tight }: { items: Array<{ k: ReactNode; v: ReactNode; wide?: boolean } | null | false>; tight?: boolean }) {
  return (
    <dl className={"phr-kv" + (tight ? " phr-kv-tight" : "")}>
      {items.filter(Boolean).map((it, i) => {
        const x = it as { k: ReactNode; v: ReactNode; wide?: boolean };
        return (
          <div key={i} style={x.wide ? { gridColumn: "1 / -1" } : undefined}>
            <dt>{x.k}</dt>
            <dd>{x.v}</dd>
          </div>
        );
      })}
    </dl>
  );
}

export function Banner({ tone = "neutral", icon, children, action }: { tone?: Tone; icon?: GlyphName; children: ReactNode; action?: ReactNode }) {
  const t = TONE[tone];
  return (
    <div className="phr-banner" style={tone === "neutral" ? undefined : { borderColor: "color-mix(in srgb, " + t.fg + " 34%, transparent)", background: t.bg }}>
      <Icon name={icon || t.icon} size={15} stroke={2} style={{ color: t.fg, marginTop: 1 }} />
      <div className="ph-grow">{children}</div>
      {action ? <div style={{ flex: "none" }}>{action}</div> : null}
    </div>
  );
}

/** Number with its unit, so a count is never unexplained. */
export function Count({ n, unit }: { n: number; unit: string }) {
  return <><span className="ph-num">{n}</span><span className="phr-unit">{n === 1 ? unit.replace(/s$/, "") : unit}</span></>;
}

/** Compact audit list from the shared activity log. Role filtering happens in activityFeed. */
export function EventList({ events, empty = "No events recorded yet." }: { events: ActivityView[]; empty?: string }) {
  if (!events.length) return <div className="phr-sub">{empty}</div>;
  return (
    <ul className="phr-tl">
      {events.map((v) => (
        <li key={v.event.id}>
          <div className="phr-row" style={{ gap: 6 }}>
            <span className="phr-mono ph-faint">{fmtShortDateTime(v.event.at)}</span>
            <span style={{ fontSize: 11.5, color: "var(--dim)" }}>{v.event.actor.label}</span>
            {v.event.simulated ? <DemoTag>Simulated</DemoTag> : null}
            {v.event.seeded ? <span className="ph-faint" style={{ fontSize: 10.5 }}>Seeded history</span> : null}
          </div>
          <div style={{ fontSize: 12.5, color: "var(--body)", lineHeight: 1.45, marginTop: 2 }}>{v.text}</div>
        </li>
      ))}
    </ul>
  );
}

/** Section heading inside a card. */
export function SecTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="ph-row-flex" style={{ marginBottom: 8, gap: 8 }}>
      <h4 className="phr-sec-title ph-grow" style={{ margin: 0 }}>{children}</h4>
      {right ? <div className="phr-row" style={{ flex: "none", justifyContent: "flex-end" }}>{right}</div> : null}
    </div>
  );
}
