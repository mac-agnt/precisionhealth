/* Participant report preview: the same ScreeningReport document the participant sees in the
   portal, rendered from reportDocument() for the draft under review (or the released version),
   with the advice exactly as typed in the editor. Print or save as PDF prints only the report:
   a print copy is mounted directly under <body> while the preview is open and the print rules
   in results.css hide everything else. No new dependencies. */
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button, DemoTag, EmptyState, Icon } from "../../ui";
import { ScreeningReport, useReportDocument } from "../../report/ScreeningReport";
import { OverlayPortal } from "./shared";

/** Centred dialog that stays centred after its entrance animation. Escape and the backdrop close it. */
export function Dialog({ open, onClose, title, children, footer, width = 860 }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; width?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    ref.current?.focus();
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); close.current(); } };
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, [open]);
  if (!open) return null;
  return (
    <OverlayPortal>
      <div className="ph-scrim" />
      <div className="phr-dialog-wrap" onMouseDown={(e) => { if (e.target === e.currentTarget) close.current(); }}>
        <div className="phr-dialog" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref} style={{ width: `min(${width}px, 100%)` }}>
          <div className="phr-dialog-head">
            <h2 className="ph-h1" style={{ fontSize: 16, flex: 1 }}>{title}</h2>
            <button type="button" className="ph-btn ph-btn-ghost ph-btn-icon ph-btn-sm" onClick={() => close.current()} aria-label="Close"><Icon name="x" size={15} /></button>
          </div>
          <div className="phr-dialog-body">{children}</div>
          {footer ? <div className="phr-dialog-foot">{footer}</div> : null}
        </div>
      </div>
    </OverlayPortal>
  );
}

/**
 * Full participant report preview. advice is the text typed in the editor (it may be ahead of the
 * saved draft); versionLabel says which version this is and whether the participant can see it.
 */
export function PreviewModal({ open, onClose, episodeId, advice, versionLabel, footer }: { open: boolean; onClose: () => void; episodeId: string; advice?: string; versionLabel: ReactNode; footer?: ReactNode }) {
  const doc = useReportDocument(open ? episodeId : null);
  // Scope the print rules to this preview while it is open.
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    root.classList.add("phr-print-report");
    return () => root.classList.remove("phr-print-report");
  }, [open]);
  if (!open) return null;
  return (
    <>
      <Dialog open onClose={onClose} title="Participant report preview" width={900}
        footer={<>
          {footer}
          <Button icon="print" disabled={!doc} onClick={() => window.print()} title="Opens the browser print dialog with only the report. Choose Save as PDF to keep a copy.">Print or save as PDF</Button>
          <Button onClick={onClose}>Close preview</Button>
        </>}>
        <div className="phr-row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
          <span className="phr-sub">{versionLabel} The participant sees this same document in the portal.</span>
          <DemoTag>Fictional participant</DemoTag>
        </div>
        {doc ? <ScreeningReport doc={doc} draftAdvice={advice} /> : (
          <EmptyState title="Report not available" icon="lock">This role cannot open the participant report for this episode.</EmptyState>
        )}
      </Dialog>
      {doc && typeof document !== "undefined"
        ? createPortal(<div className="phr-print-sheet" aria-hidden="true"><ScreeningReport doc={doc} draftAdvice={advice} /></div>, document.body)
        : null}
    </>
  );
}
