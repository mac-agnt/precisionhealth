/* Shared pieces for the Occupational Health module: access, status pills (text, icon and colour
   together, never colour alone), container width and a print helper scoped to one document. */
import { useEffect, useLayoutEffect, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { OH_AGREEMENTS_STAGE_LABEL, ohAccess } from "../../model";
import type { OhAccess, OhAgreementsStage, OhStepStatus, OhVersionStatus } from "../../model";
import { usePhState } from "../../store";
import { Icon, Pill } from "../../ui";
import type { GlyphName, Tone } from "../../ui";

export function useOhAccess(): OhAccess {
  return ohAccess(usePhState());
}
/** Why a button is disabled for a view-only role. */
export const VIEW_ONLY_TITLE = "View only for this role. Stephen, Fiona, Martina or Brenda manage occupational health.";

/** Width of an element, kept current with ResizeObserver, so layouts follow the container. */
export function useWidth<T extends HTMLElement>(): [(el: T | null) => void, number] {
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

const STEP: Record<OhStepStatus, { label: string; tone: Tone; icon: GlyphName }> = {
  done: { label: "Done", tone: "ok", icon: "check" },
  working: { label: "Working on it", tone: "info", icon: "clock" },
  not_started: { label: "Not started", tone: "neutral", icon: "dot" },
};
export function StepPill({ status }: { status: OhStepStatus }) {
  const s = STEP[status];
  return <Pill tone={s.tone} icon={s.icon}>{s.label}</Pill>;
}

const STAGE: Record<OhAgreementsStage, { tone: Tone; icon: GlyphName }> = {
  not_started: { tone: "neutral", icon: "dot" },
  generated: { tone: "info", icon: "edit" },
  sent: { tone: "info", icon: "send" },
  part_signed: { tone: "info", icon: "clock" },
  signed: { tone: "ok", icon: "check" },
};
export function StagePill({ stage }: { stage: OhAgreementsStage }) {
  const s = STAGE[stage];
  return <Pill tone={s.tone} icon={s.icon}>{OH_AGREEMENTS_STAGE_LABEL[stage]}</Pill>;
}

const VERSION: Record<OhVersionStatus, { label: string; tone: Tone; icon: GlyphName }> = {
  draft: { label: "Draft", tone: "neutral", icon: "edit" },
  sent: { label: "Sent, awaiting signature", tone: "info", icon: "send" },
  signed: { label: "Signed", tone: "ok", icon: "check" },
  superseded: { label: "Superseded", tone: "neutral", icon: "refresh" },
  voided: { label: "Voided", tone: "bad", icon: "x" },
};
export function VersionPill({ status, short }: { status: OhVersionStatus | null; short?: boolean }) {
  if (!status) return <Pill tone="neutral" icon="dot">Not generated</Pill>;
  const s = VERSION[status];
  return <Pill tone={s.tone} icon={s.icon}>{short && status === "sent" ? "Sent" : s.label}</Pill>;
}

export function ReceivedPill({ received, chased }: { received: boolean; chased?: boolean }) {
  if (received) return <Pill tone="ok" icon="check">Yes</Pill>;
  return <Pill tone="warn" icon="alert">{chased ? "No, chased" : "No"}</Pill>;
}
export function MeddbasePill({ sent }: { sent: boolean }) {
  return sent ? <Pill tone="ok" icon="check" title="Simulated push. The Meddbase API is not agreed yet.">In Meddbase (Simulated)</Pill> : <Pill tone="neutral" icon="dot">Not sent</Pill>;
}

/** A note band for honest caveats: simulated integrations and sample wording. */
export function OhNote({ children, icon = "info" }: { children: ReactNode; icon?: GlyphName }) {
  return (
    <div className="oh-note" role="note">
      <Icon name={icon} size={14} />
      <div>{children}</div>
    </div>
  );
}

/** Two-column definition list that wraps on narrow screens. */
export function Facts({ items }: { items: Array<[string, ReactNode]> }) {
  return (
    <dl className="oh-facts">
      {items.map(([k, v]) => (
        <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
      ))}
    </dl>
  );
}

/**
 * Print one document only: the content is portalled to the body and everything else is hidden
 * while the browser's print dialogue is open. Save as PDF from there. No dependency.
 */
export function useOhPrint(): [(content: ReactNode) => void, ReactNode] {
  const [content, setContent] = useState<ReactNode>(null);
  useEffect(() => {
    if (!content) return;
    document.body.classList.add("oh-printing");
    const done = () => { document.body.classList.remove("oh-printing"); setContent(null); };
    window.addEventListener("afterprint", done, { once: true });
    const t = window.setTimeout(() => window.print(), 80);
    return () => { window.clearTimeout(t); window.removeEventListener("afterprint", done); document.body.classList.remove("oh-printing"); };
  }, [content]);
  const node = content ? createPortal(<div className="oh-print-root">{content}</div>, document.body) : null;
  return [setContent, node];
}
