/* Shared pieces for the Participants module and the portal preview: container measuring,
   role-aware status labels, fact lists and the timeline list. Labels keep health
   classifications, identity holds and communication failures in separate categories. */
import { useLayoutEffect, useState } from "react";
import type { ReactNode } from "react";
import { HOLD_CATEGORY, HOLD_LABEL, REPORT_STATE_LABEL } from "../../model";
import type { DirectoryRow, DirectoryStage, Episode, Membership, MessageKind } from "../../model";
import { Chip, Icon, Pill } from "../../ui";
import type { GlyphName, Tone } from "../../ui";
import "./participants.css";

/** Width of an element, kept current with ResizeObserver. Layouts follow the container, not only the window. */
export function useMeasure<T extends HTMLElement>(): [(el: T | null) => void, number] {
  const [el, setEl] = useState<T | null>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    if (!el) return;
    const read = () => setWidth(Math.round(el.getBoundingClientRect().width));
    read();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, width];
}

/** Merge or remove deep-link params without losing the others. */
export function withParams(current: Record<string, string>, patch: Record<string, string | null | undefined>): Record<string, string> {
  const next: Record<string, string> = { ...current };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined || v === "") delete next[k];
    else next[k] = v;
  }
  return next;
}

export const cmp = (a: string | number, b: string | number) => (a < b ? -1 : a > b ? 1 : 0);

/* ---- directory stages: invited is not booked, booked is not attended ---- */
export interface StageDef { id: DirectoryStage; label: string; help: string; tone: Tone; icon: GlyphName }
export const STAGES: StageDef[] = [
  { id: "all", label: "All invitees", help: "Everyone on the three programme rosters. Not everyone here is a patient.", tone: "neutral", icon: "users" },
  { id: "invited", label: "Invited, not started", help: "Invited. No questionnaire and no booking yet.", tone: "neutral", icon: "mail" },
  { id: "onboarding", label: "Onboarding", help: "Questionnaire in progress. A draft is never counted as a booking.", tone: "info", icon: "edit" },
  { id: "upcoming", label: "Upcoming booking", help: "Confirmed appointment still to come. Questionnaire and consent were complete before confirmation.", tone: "brand", icon: "calendar" },
  { id: "attended", label: "Attended", help: "Attended an appointment. Each has one screening episode in this baseline.", tone: "ok", icon: "check" },
];
export const STAGE_BY_ID = Object.fromEntries(STAGES.map((s) => [s.id, s])) as Record<DirectoryStage, StageDef>;

/** What the onboarding position of a membership is, in plain words. */
export function onboardingText(m: Membership): string {
  if (m.questionnaire === "complete") return "Questionnaire and consent complete, not booked";
  if (m.draft) return `Questionnaire ${m.draft.sectionsDone} of ${m.draft.sectionsTotal} sections saved`;
  return "Not started";
}

export function stageDetail(r: DirectoryRow): string {
  switch (r.stage) {
    case "attended": return "Attended";
    case "upcoming": return r.nextWhen ? `Booked for ${r.nextWhen}` : "Booked";
    case "onboarding": return onboardingText(r.membership);
    default: return "Not started";
  }
}

export function StagePill({ stage }: { stage: Exclude<DirectoryStage, "all"> }) {
  const d = STAGE_BY_ID[stage];
  const label = stage === "invited" ? "Not started" : stage === "upcoming" ? "Booked" : d.label;
  return <Pill tone={d.tone} icon={d.icon} title={d.help}>{label}</Pill>;
}

/* ---- report workflow status, role-aware ---- */
export interface StatusView { text: string; tone: Tone; icon: GlyphName; title: string }

/** Clinical roles see the workflow state and the hold reason. */
export function clinicalStatus(ep: Episode): StatusView {
  switch (ep.reportState) {
    case "released": return { text: "Released", tone: "ok", icon: "check", title: "A clinician released this report." };
    case "ready_for_review": return { text: "Ready for review", tone: "info", icon: "eye", title: "All expected results accounted for. Waiting for individual clinician review." };
    case "awaiting_results": return { text: "Awaiting results", tone: "neutral", icon: "clock", title: "Expected laboratory results are not yet received or accounted for." };
    case "on_hold": return { text: "On hold", tone: "warn", icon: "alert", title: ep.hold ? `${HOLD_LABEL[ep.hold.kind]}. ${ep.hold.reason}` : "On hold." };
  }
}

/** Operations see workflow position only. A clinician-assigned hold is shown as "Clinical action assigned". */
export function opsStatus(ep: Episode): StatusView {
  if (ep.reportState === "on_hold") {
    const cat = ep.hold ? HOLD_CATEGORY[ep.hold.kind] : "identity";
    if (cat === "clinical_action") return { text: "Clinical action assigned", tone: "neutral", icon: "lock", title: "A clinician owns this item. No clinical detail is shown to this role." };
    if (cat === "data_quality") return { text: "Held: data quality check", tone: "warn", icon: "alert", title: "A source data question must be confirmed before review." };
    return { text: "Held: identity exception", tone: "warn", icon: "alert", title: "A laboratory row needs explicit identity resolution by a person." };
  }
  switch (ep.reportState) {
    case "released": return { text: "Report released", tone: "ok", icon: "check", title: "A clinician released the report." };
    case "ready_for_review": return { text: "With clinician for review", tone: "info", icon: "clock", title: "Results are in. Waiting for clinician review." };
    default: return { text: "Awaiting laboratory results", tone: "neutral", icon: "clock", title: "Expected results are not all in yet." };
  }
}

export function StatusPill({ s }: { s: StatusView }) {
  return <Pill tone={s.tone} icon={s.icon} title={s.title}>{s.text}</Pill>;
}

export const holdLine = (ep: Episode) => (ep.hold ? HOLD_LABEL[ep.hold.kind] : REPORT_STATE_LABEL[ep.reportState]);
/** The hold reason without repeating its label, which some reasons already start with. */
export function holdReason(ep: Episode): string {
  if (!ep.hold) return "";
  const label = HOLD_LABEL[ep.hold.kind];
  const r = ep.hold.reason.trim();
  return r.toLowerCase().startsWith(label.toLowerCase()) ? r.slice(label.length).replace(/^[.,:;\s]+/, "") : r;
}

/* ---- messages ---- */
export const KIND_LABEL: Record<MessageKind, string> = {
  confirmation: "Confirmation",
  reminder: "Reminder",
  report_available: "Report available",
  invitation: "Invitation",
};
export const KIND_ICON: Record<MessageKind, GlyphName> = {
  confirmation: "calendar",
  reminder: "clock",
  report_available: "file",
  invitation: "mail",
};

export function MessageStatusPill({ status }: { status: "delivered" | "failed" | "queued" | "cancelled" }) {
  if (status === "delivered") return <Pill tone="ok" title="Delivery receipt received (simulated).">Delivered</Pill>;
  if (status === "failed") return <Pill tone="bad" title="The provider reported a failure (simulated).">Failed</Pill>;
  if (status === "queued") return <Pill tone="info" icon="clock" title="Scheduled, not sent yet (simulated).">Queued</Pill>;
  return <Pill tone="neutral" icon="x" title="Cancelled before sending (simulated).">Cancelled</Pill>;
}

/* ---- layout pieces ---- */
/** Wrapping filter chips with counts. Unlike a segmented control they never clip at narrow widths. */
export function FilterChips<T extends string>({ value, options, onChange, label }: { value: T; options: Array<{ id: T; label: string; count?: number }>; onChange: (v: T) => void; label: string }) {
  return (
    <div className="pd-chip-row" role="group" aria-label={label}>
      {options.map((o) => (
        <Chip key={o.id} on={value === o.id} onClick={() => onChange(o.id)} count={o.count}>{o.label}</Chip>
      ))}
    </div>
  );
}

export function Facts({ rows }: { rows: Array<[ReactNode, ReactNode] | null | false> }) {
  return (
    <dl className="pd-facts">
      {rows.filter(Boolean).map((r, i) => {
        const [k, v] = r as [ReactNode, ReactNode];
        return (
          <div key={i} className="pd-fact">
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        );
      })}
    </dl>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="pd-sec-title">
      <span className="ph-grow">{children}</span>
      {right}
    </div>
  );
}

export interface TimelineEntry {
  id: string;
  when: string;
  title: ReactNode;
  detail?: ReactNode;
  icon: GlyphName;
  tone?: Tone;
  tag?: ReactNode;
  action?: ReactNode;
}
const TONE_DOT: Record<Tone, { bg: string; fg: string }> = {
  ok: { bg: "var(--ok-soft)", fg: "var(--ok)" },
  warn: { bg: "var(--warn-soft)", fg: "var(--warn)" },
  bad: { bg: "var(--bad-soft)", fg: "var(--bad)" },
  info: { bg: "var(--accent-soft)", fg: "var(--accent)" },
  brand: { bg: "var(--accent-soft)", fg: "var(--accent)" },
  neutral: { bg: "var(--track)", fg: "var(--dim)" },
};
export function Timeline({ items }: { items: TimelineEntry[] }) {
  return (
    <ol className="pd-timeline">
      {items.map((it) => {
        const t = TONE_DOT[it.tone || "neutral"];
        return (
          <li key={it.id} className="pd-tl-item">
            <span className="pd-tl-dot" style={{ background: t.bg, color: t.fg }}><Icon name={it.icon} size={11} stroke={2} /></span>
            <div className="pd-tl-body">
              <div className="pd-tl-head">
                <span className="pd-tl-title">{it.title}</span>
                {it.tag ? <span className="pd-tl-tag">{it.tag}</span> : null}
              </div>
              <div className="pd-tl-when ph-num">{it.when}</div>
              {it.detail ? <div className="pd-tl-detail">{it.detail}</div> : null}
              {it.action ? <div style={{ marginTop: 6 }}>{it.action}</div> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
