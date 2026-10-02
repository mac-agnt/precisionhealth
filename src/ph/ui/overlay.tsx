/* Drawer, modal and the toast host. Escape closes. The scrim click closes. Focus moves
   into the panel when it opens. */
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { dispatch, usePh } from "../store";
import { act } from "../model";
import { Icon } from "./icons";
import { TONE } from "./primitives";

/* Overlays render at the shell root, not inside the page. Any ancestor with a filter, transform or
   backdrop-filter (every glass card) would otherwise become the containing block of a fixed panel.
   The shell root also carries the theme, density and reduced-motion attributes the panel needs. */
const overlayRoot = (): HTMLElement => document.querySelector<HTMLElement>("[data-theme]") || document.body;

function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, [open, onClose]);
}

export function Drawer({ open, onClose, title, sub, children, footer, width }: { open: boolean; onClose: () => void; title: ReactNode; sub?: ReactNode; children: ReactNode; footer?: ReactNode; width?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEscape(open, onClose);
  useEffect(() => { if (open) ref.current?.focus(); }, [open]);
  if (!open) return null;
  return createPortal(
    <>
      <div className="ph-scrim" onClick={onClose} />
      <div className="ph-drawer" role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : "Details"} tabIndex={-1} ref={ref} style={width ? { width: `min(${width}px, 100vw)` } : undefined}>
        <div style={{ flex: "none", display: "flex", alignItems: "flex-start", gap: 12, padding: "20px 22px 16px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 className="ph-h1" style={{ fontSize: 17 }}>{title}</h2>
            {sub ? <div className="ph-dim" style={{ fontSize: 12.5, marginTop: 4, lineHeight: 1.45 }}>{sub}</div> : null}
          </div>
          <button type="button" className="ph-btn ph-btn-ghost ph-btn-icon ph-btn-sm" onClick={onClose} aria-label="Close"><Icon name="x" size={15} /></button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "18px 22px" }}>{children}</div>
        {footer ? <div style={{ flex: "none", padding: "14px 22px", borderTop: "1px solid var(--border)", display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>{footer}</div> : null}
      </div>
    </>,
    overlayRoot(),
  );
}

export function Modal({ open, onClose, title, children, footer, width }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; width?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEscape(open, onClose);
  useEffect(() => { if (open) ref.current?.focus(); }, [open]);
  if (!open) return null;
  return createPortal(
    <>
      <div className="ph-scrim" onClick={onClose} />
      <div className="ph-modal" role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : "Dialog"} tabIndex={-1} ref={ref} style={width ? { width: `min(${width}px, calc(100vw - 28px))` } : undefined}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "18px 20px 12px" }}>
          <h2 className="ph-h1" style={{ fontSize: 16, flex: 1 }}>{title}</h2>
          <button type="button" className="ph-btn ph-btn-ghost ph-btn-icon ph-btn-sm" onClick={onClose} aria-label="Close"><Icon name="x" size={15} /></button>
        </div>
        <div style={{ padding: "4px 20px 18px" }}>{children}</div>
        {footer ? <div style={{ padding: "12px 20px 18px", display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>{footer}</div> : null}
      </div>
    </>,
    overlayRoot(),
  );
}

/** Mounted once in the app shell. Toasts come from dispatch() results. */
export function ToastHost() {
  const toasts = usePh((s) => s.toasts);
  useEffect(() => {
    if (!toasts.length) return;
    const t = setTimeout(() => dispatch(act.dismissToast(toasts[0].id)), 5200);
    return () => clearTimeout(t);
  }, [toasts]);
  return (
    <div className="ph-toasts" aria-live="polite" role="status">
      {toasts.map((t) => {
        const tone = TONE[t.tone === "bad" ? "bad" : t.tone === "warn" ? "warn" : t.tone === "info" ? "info" : "ok"];
        return (
          <div key={t.id} className="ph-toast" style={{ borderLeft: `3px solid ${tone.fg}` }}>
            <Icon name={tone.icon} size={15} stroke={2} style={{ color: tone.fg, marginTop: 1 }} />
            <span style={{ flex: 1 }}>{t.text}</span>
            <button type="button" className="ph-btn ph-btn-ghost ph-btn-icon ph-btn-sm" style={{ width: 22, height: 22 }} onClick={() => dispatch(act.dismissToast(t.id))} aria-label="Dismiss"><Icon name="x" size={12} /></button>
          </div>
        );
      })}
    </div>
  );
}
