/* Small pieces shared by the portal views: the programme heading, the booking steps, an
   accessible error summary, the urgent-care warning and a print helper scoped to one document. */
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { fmtDate } from "../../model";
import { Icon } from "../../ui";
import type { PortalData, Progress } from "./data";
import { SUPPORT_EMAIL, programmeHeading } from "./data";

/** "Comprehensive Health Screening · IBM Dublin · Demo Screening Room", with the support line. */
export function ProgrammeBanner({ d, compact }: { d: PortalData; compact?: boolean }) {
  const p = d.programme;
  return (
    <div className="pp-programme" aria-label="Your screening programme">
      <div className="pp-programme-title">{programmeHeading(d)}</div>
      {compact ? null : <div className="pp-small">{p.name}, {fmtDate(p.windowStart)} to {fmtDate(p.windowEnd)}.</div>}
      <div className="pp-small">Any issues, please contact us at <a className="ph-link" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a></div>
    </div>
  );
}

export type BookingStep = "details" | "consent" | "questions" | "time";
/** The four steps before a booking is confirmed. Consent and questions come before the time is confirmed. */
export function BookingSteps({ progress, current, onStep }: { progress: Progress; current: BookingStep; onStep: (s: BookingStep) => void }) {
  const steps: Array<{ id: BookingStep; label: string; done: boolean; open: boolean }> = [
    { id: "details", label: "Your details", done: progress.details, open: true },
    { id: "consent", label: "Consent", done: progress.consent, open: progress.details },
    { id: "questions", label: "Health questions", done: progress.submitted, open: progress.details && progress.consent },
    { id: "time", label: "Choose a time", done: false, open: true },
  ];
  return (
    <ol className="pp-bsteps" aria-label="Booking steps">
      {steps.map((s, i) => {
        const state = s.id === current ? "current" : s.done ? "done" : "todo";
        return (
          <li key={s.id} className={"pp-bstep " + state}>
            <button type="button" onClick={() => onStep(s.id)} disabled={!s.open} aria-current={s.id === current ? "step" : undefined}>
              <span className="pp-bstep-num">{String(i + 1).padStart(2, "0")}</span>
              <span className="pp-bstep-label">{s.label}</span>
              <span className="pp-bstep-state">{state === "done" ? <><Icon name="check" size={11} stroke={2.4} />Done</> : state === "current" ? "Now" : s.open ? "To do" : <><Icon name="lock" size={10} />Later</>}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/** Moves focus to a field from the error summary. Radio groups focus their first option. */
export function focusField(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const target = el.matches("input, textarea, select, button") ? el : el.querySelector<HTMLElement>("input, textarea, select, button");
  (target || el).focus();
  (target || el).scrollIntoView?.({ block: "center" });
}

export interface FieldError { id: string; text: string }
/** Listed at the top of a form, linked to each field, and focused when it appears. */
export function ErrorSummary({ errors, seq }: { errors: FieldError[]; seq: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (errors.length) ref.current?.focus(); }, [seq, errors.length]);
  if (!errors.length) return null;
  return (
    <div className="pp-errsum" role="alert" tabIndex={-1} ref={ref} aria-labelledby="pp-errsum-title">
      <div id="pp-errsum-title" className="pp-errsum-title"><Icon name="alert" size={14} stroke={2} />There {errors.length === 1 ? "is a problem" : `are ${errors.length} problems`}</div>
      <ul>
        {errors.map((e) => <li key={e.id}><button type="button" className="ph-link" onClick={() => focusField(e.id)}>{e.text}</button></li>)}
      </ul>
    </div>
  );
}

/** The S04 warning card. */
export function UrgentCareCard() {
  return (
    <div className="pp-urgent" role="note">
      <div className="pp-urgent-title"><Icon name="alert" size={14} stroke={2} />Not an urgent-care service</div>
      <p>Do not use this portal or questionnaire to get urgent medical help. Nobody reads your answers in real time. If you need help now, call 112 or 999, or contact your GP.</p>
    </div>
  );
}

/** A two-column list of labels and values that wraps cleanly at 375px. */
export function KeyValues({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <dl className="pp-kv">
      {rows.map(([k, v]) => <div key={k} className="pp-kv-row"><dt>{k}</dt><dd>{v}</dd></div>)}
    </dl>
  );
}

/**
 * Prints one document only. The content is mounted under body while printing and every other
 * top-level element is hidden for that print, so the rest of Pulse never appears on paper.
 * The rule is scoped by a body class, so other print views in the app are unaffected.
 */
export function usePrintOnly(): [(content: ReactNode) => void, ReactNode] {
  const [content, setContent] = useState<ReactNode>(null);
  useEffect(() => {
    if (!content) return;
    document.body.classList.add("pp-printing");
    const done = () => { document.body.classList.remove("pp-printing"); setContent(null); };
    window.addEventListener("afterprint", done, { once: true });
    const t = window.setTimeout(() => window.print(), 80);
    return () => { window.clearTimeout(t); window.removeEventListener("afterprint", done); document.body.classList.remove("pp-printing"); };
  }, [content]);
  const node = content ? createPortal(<div className="pp-print-root">{content}</div>, document.body) : null;
  return [setContent, node];
}
