/* Pieces of an employer report, shared by the Report Builder canvas, the printable report and the
   PowerPoint preview, so every surface renders the same numbers the same way.
   Disclosure rules: a suppressed cell shows the word "Suppressed" and nothing else. No count, no bar
   length, no tooltip and no aria label carries a hidden value. Blocked cohorts have no breakdowns. */
import { useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { BRAND, rate } from "../../model";
import type { EmployerMetrics, MetricBreakdown, MetricClinical } from "../../model";
import { indicatorVisible } from "./disclosure";

/** Colours for a surface: the app theme on screen, or brand colours on white paper and slides. */
export interface Pal { ink: string; body: string; dim: string; faint: string; track: string; fill: string; border: string }
export const THEME_PAL: Pal = { ink: "var(--ink)", body: "var(--body)", dim: "var(--dim)", faint: "var(--faint)", track: "var(--track)", fill: "var(--accent)", border: "var(--border-strong)" };
export const PAPER_PAL: Pal = { ink: BRAND.deepTeal, body: "#2d3b38", dim: "#56635f", faint: "#6f7c78", track: "#e2e9e7", fill: BRAND.darkTeal, border: "#b9c6c2" };

const pctOf = (n: number, d: number) => (d > 0 ? Math.min(100, (n / d) * 100) : 0);

/** One breakdown: label, count and share of the stated denominator, or "Suppressed". */
export function BreakdownList({ b, pal = THEME_PAL, dense }: { b: MetricBreakdown; pal?: Pal; dense?: boolean }) {
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: dense ? 7 : 9 }}>
      {b.cells.map((c) => {
        const hidden = c.suppressed || c.count === null;
        return (
          <li key={c.label} style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: dense ? 12 : 12.5, lineHeight: 1.35 }}>
              <span style={{ flex: 1, minWidth: 0, color: pal.body }}>{c.label}</span>
              {hidden || c.count === null
                ? <span style={{ color: pal.dim, fontStyle: "italic", flex: "none" }}>Suppressed</span>
                : <span className="ph-num" style={{ color: pal.ink, fontWeight: 600, flex: "none" }}>{c.count} <span style={{ color: pal.faint, fontWeight: 400 }}>({rate(c.count, b.denominator)})</span></span>}
            </div>
            {hidden || c.count === null
              ? <div className="phr-bar-supp" aria-hidden="true" style={{ height: dense ? 6 : 8, marginTop: 4, borderRadius: 999, border: `1px dashed ${pal.border}` }} />
              : (
                <div className="phr-bar" aria-hidden="true" style={{ height: dense ? 6 : 8, marginTop: 4, borderRadius: 999, background: pal.track, overflow: "hidden" }}>
                  <div className="phr-bar-fill" style={{ width: pctOf(c.count, b.denominator) + "%", height: "100%", borderRadius: 999, background: pal.fill }} />
                </div>
              )}
          </li>
        );
      })}
    </ul>
  );
}

/** A breakdown block with its title, denominator and note. */
export function BreakdownBlock({ b, pal = THEME_PAL, dense }: { b: MetricBreakdown; pal?: Pal; dense?: boolean }) {
  const hiddenCount = b.cells.filter((c) => c.suppressed).length;
  return (
    <div className="phr-avoid" style={{ minWidth: 0 }}>
      <div style={{ fontSize: dense ? 12.5 : 13, fontWeight: 600, color: pal.ink }}>{b.title}</div>
      <div style={{ fontSize: 11.5, color: pal.dim, margin: "2px 0 10px", lineHeight: 1.4 }}>Denominator: {b.denominatorLabel}.</div>
      <BreakdownList b={b} pal={pal} dense={dense} />
      <div style={{ fontSize: 11, color: pal.faint, marginTop: 8, lineHeight: 1.45 }}>
        {b.note}{hiddenCount ? " Suppressed cells protect groups smaller than the threshold; where needed another cell is also suppressed so totals cannot reveal them." : ""}
      </div>
    </div>
  );
}

/** Clinical indicators with their own denominators and exclusions. Illustrative limits only. */
export function IndicatorList({ items, threshold, pal = THEME_PAL, dense }: { items: MetricClinical[]; threshold: number; pal?: Pal; dense?: boolean }) {
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: dense ? 10 : 14 }}>
      {items.map((m) => {
        const show = indicatorVisible(m, threshold) && m.flagged !== null;
        return (
          <li key={m.id} className="phr-avoid" style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", fontSize: dense ? 12 : 12.5 }}>
              <span style={{ flex: "1 1 180px", minWidth: 0, color: pal.ink, fontWeight: 500 }}>{m.title}</span>
              {show && m.flagged !== null
                ? <span className="ph-num" style={{ color: pal.ink, fontWeight: 600 }}>{m.flagged} of {m.withValue} <span style={{ color: pal.faint, fontWeight: 400 }}>({rate(m.flagged, m.withValue)})</span></span>
                : <span style={{ color: pal.dim, fontStyle: "italic" }}>Suppressed (small group)</span>}
            </div>
            {show && m.flagged !== null ? (
              <div className="phr-bar" aria-hidden="true" style={{ height: 6, marginTop: 5, borderRadius: 999, background: pal.track, overflow: "hidden" }}>
                <div className="phr-bar-fill" style={{ width: pctOf(m.flagged, m.withValue) + "%", height: "100%", borderRadius: 999, background: pal.fill }} />
              </div>
            ) : <div className="phr-bar-supp" aria-hidden="true" style={{ height: 6, marginTop: 5, borderRadius: 999, border: `1px dashed ${pal.border}` }} />}
            <div style={{ fontSize: 11, color: pal.dim, marginTop: 5, lineHeight: 1.45 }}>
              Denominator: {m.withValue} participants with a value. Excluded without a value: {m.excluded}. {m.note}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Participation funnel as labelled bars, for paper and slides. Programme level, never a subgroup. */
export function FunnelBars({ funnel, pal = PAPER_PAL, big }: { funnel: EmployerMetrics["funnel"]; pal?: Pal; big?: boolean }) {
  const max = Math.max(1, ...funnel.map((f) => f.n));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: big ? 14 : 9 }}>
      {funnel.map((f) => (
        <div key={f.key} className="phr-avoid" style={{ display: "grid", gridTemplateColumns: big ? "210px 1fr 170px" : "minmax(110px, 160px) 1fr minmax(96px, auto)", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: big ? 17 : 12.5, color: pal.body }}>{f.label}</span>
          <div className="phr-bar" style={{ height: big ? 26 : 16, borderRadius: 6, background: pal.track, overflow: "hidden" }}>
            <div className="phr-bar-fill" style={{ width: pctOf(f.n, max) + "%", height: "100%", borderRadius: 6, background: pal.fill }} />
          </div>
          <span className="ph-num" style={{ fontSize: big ? 15 : 12, color: pal.ink, textAlign: "right", lineHeight: 1.3 }}>
            <strong style={{ fontSize: big ? 20 : 13 }}>{f.n}</strong> {f.rateLabel}<br /><span style={{ color: pal.faint, fontSize: big ? 13 : 11 }}>{f.denominatorLabel}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

/** Narrative text as paragraphs. */
export function NarrativeText({ text, pal = THEME_PAL, size = 13 }: { text: string; pal?: Pal; size?: number }) {
  const paras = text.split(/\n{2,}|\r\n\r\n/).map((x) => x.trim()).filter(Boolean);
  if (!paras.length) return <p style={{ margin: 0, color: pal.dim, fontStyle: "italic", fontSize: size }}>No narrative.</p>;
  return <>{paras.map((p, i) => <p key={i} style={{ margin: i ? "10px 0 0" : 0, color: pal.body, fontSize: size, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{p}</p>)}</>;
}

export function MethodologyList({ items, pal = THEME_PAL, size = 12 }: { items: string[]; pal?: Pal; size?: number }) {
  return (
    <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 5 }}>
      {items.map((m, i) => <li key={i} style={{ color: pal.body, fontSize: size, lineHeight: 1.5 }}>{m}</li>)}
    </ul>
  );
}

/** A fixed 960 by 540 slide scaled to fit its container, so nothing clips at narrow widths. */
export function ScaledSlide({ children, label, background }: { children: ReactNode; label: string; background: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(480);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setW(el.clientWidth || 480);
    update();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const scale = Math.min(1, w / 960);
  return (
    <div ref={ref} role="group" aria-label={label} style={{ width: "100%", height: Math.round(540 * scale), position: "relative" }}>
      <div style={{ position: "absolute", top: 0, left: Math.max(0, (w - 960 * scale) / 2), width: 960, height: 540, transform: `scale(${scale})`, transformOrigin: "top left",
        background, borderRadius: 14, overflow: "hidden", boxShadow: "0 10px 30px rgba(0,0,0,.28)", fontFamily: "var(--ui, system-ui, sans-serif)" }}>
        {children}
      </div>
    </div>
  );
}
