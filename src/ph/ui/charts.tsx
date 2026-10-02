/* Small SVG and CSS charts in the Pulse language. No charting library is installed, so these
   are hand-built. Every chart states its denominator in the caption or labels. */
import type { ReactNode } from "react";

export const PALETTE = ["var(--accent)", "#97C2BC", "#6ad0f0", "#f0c04b", "#b06cf0", "#f0803a"];

/** Horizontal bars with a label, value and optional sub line. Good for comparisons. */
export function HBars({ rows, max, onSelect, valueFmt }: { rows: Array<{ label: ReactNode; value: number; sub?: ReactNode; color?: string; key?: string }>; max?: number; onSelect?: (key: string) => void; valueFmt?: (n: number) => string }) {
  const m = max ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
      {rows.map((r, i) => {
        const inner = (
          <>
            <div className="ph-row-flex" style={{ fontSize: 12.5, marginBottom: 5 }}>
              <span className="ph-grow ph-trunc" style={{ color: "var(--body)" }}>{r.label}</span>
              <span className="ph-num" style={{ color: "var(--ink)", fontWeight: 600 }}>{valueFmt ? valueFmt(r.value) : r.value}</span>
            </div>
            <div className="ph-track"><div className="ph-fill" style={{ width: Math.min(100, (r.value / m) * 100) + "%", background: r.color || PALETTE[0] }} /></div>
            {r.sub ? <div className="ph-faint" style={{ fontSize: 11, marginTop: 4 }}>{r.sub}</div> : null}
          </>
        );
        return onSelect && r.key ? (
          <button key={r.key || i} type="button" onClick={() => onSelect(r.key!)} className="ph-row" style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: 0, padding: 0, cursor: "pointer", font: "inherit", color: "inherit" }}>{inner}</button>
        ) : <div key={r.key || i}>{inner}</div>;
      })}
    </div>
  );
}

/** Vertical columns, one per category. */
export function Columns({ data, height = 150, onSelect, caption }: { data: Array<{ label: string; value: number; color?: string; key?: string; sub?: string }>; height?: number; onSelect?: (key: string) => void; caption?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div role="img" aria-label={caption || "Column chart"}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height }}>
        {data.map((d, i) => {
          const h = Math.max(3, (d.value / max) * (height - 22));
          const bar = (
            <>
              <span className="ph-num" style={{ fontSize: 11, color: "var(--ink)", marginBottom: 4 }}>{d.value}</span>
              <span style={{ width: "100%", height: h, borderRadius: "7px 7px 3px 3px", background: d.color || PALETTE[0], opacity: d.value === 0 ? 0.25 : 1, transition: "height .5s var(--ease)" }} />
            </>
          );
          return (
            <div key={d.key || i} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", height: "100%" }}>
              {onSelect && d.key ? <button type="button" onClick={() => onSelect(d.key!)} style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%", background: "none", border: 0, padding: 0, cursor: "pointer", font: "inherit", color: "inherit" }}>{bar}</button> : <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>{bar}</div>}
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 7 }}>
        {data.map((d, i) => <div key={d.key || i} className="ph-faint ph-trunc" style={{ flex: 1, textAlign: "center", fontSize: 10.5 }} title={d.sub ? `${d.label}: ${d.sub}` : d.label}>{d.label}</div>)}
      </div>
    </div>
  );
}

/** A single stacked horizontal bar with a legend. The total is the denominator. */
export function Stacked({ segments, total, height = 14 }: { segments: Array<{ label: string; value: number; color?: string }>; total?: number; height?: number }) {
  const t = total ?? segments.reduce((n, s) => n + s.value, 0);
  return (
    <div>
      <div role="img" aria-label={segments.map((s) => `${s.label} ${s.value}`).join(", ") + ` of ${t}`} style={{ display: "flex", height, borderRadius: 999, overflow: "hidden", background: "var(--track)", gap: 2 }}>
        {segments.map((s, i) => s.value > 0 ? <span key={i} title={`${s.label}: ${s.value} of ${t}`} style={{ flex: s.value, background: s.color || PALETTE[i % PALETTE.length], minWidth: 3 }} /> : null)}
      </div>
      <div className="ph-wrap" style={{ gap: "6px 14px", marginTop: 9 }}>
        {segments.map((s, i) => (
          <span key={i} className="ph-row-flex" style={{ gap: 6, fontSize: 11.5, color: "var(--dim)" }}>
            <span style={{ width: 8, height: 8, borderRadius: 3, background: s.color || PALETTE[i % PALETTE.length], flex: "none" }} />
            {s.label} <span className="ph-num" style={{ color: "var(--ink)" }}>{s.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Funnel with the step count, its rate and the denominator for that rate. */
export function Funnel({ steps, onSelect }: { steps: Array<{ key?: string; label: string; n: number; rateLabel?: string; denominatorLabel?: string }>; onSelect?: (key: string) => void }) {
  const max = Math.max(1, ...steps.map((s) => s.n));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {steps.map((s, i) => {
        const row = (
          <div style={{ display: "grid", gridTemplateColumns: "minmax(110px, 170px) 1fr minmax(88px, auto)", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 12.5, color: "var(--body)" }}>{s.label}</span>
            <div className="ph-track" style={{ height: 22, borderRadius: 8 }}>
              <div style={{ width: Math.max(2, (s.n / max) * 100) + "%", height: "100%", borderRadius: 8, background: PALETTE[0], opacity: 1 - i * 0.14, display: "flex", alignItems: "center", paddingLeft: 9 }}>
                <span className="ph-num" style={{ fontSize: 12, fontWeight: 600, color: "var(--on-accent)" }}>{s.n}</span>
              </div>
            </div>
            <span className="ph-faint ph-num" style={{ fontSize: 11, textAlign: "right" }}>{s.rateLabel}{s.denominatorLabel ? <><br />{s.denominatorLabel}</> : null}</span>
          </div>
        );
        return onSelect && s.key ? <button key={i} type="button" className="ph-row" onClick={() => onSelect(s.key!)} style={{ background: "none", border: 0, padding: 0, textAlign: "left", cursor: "pointer", font: "inherit", color: "inherit" }}>{row}</button> : <div key={i}>{row}</div>;
      })}
    </div>
  );
}

/** Ring with a centre label. */
export function Donut({ segments, size = 120, center, sub }: { segments: Array<{ label: string; value: number; color?: string }>; size?: number; center?: ReactNode; sub?: ReactNode }) {
  const total = segments.reduce((n, s) => n + s.value, 0) || 1;
  const r = size / 2 - 10, c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div style={{ position: "relative", width: size, height: size, flex: "none" }} role="img" aria-label={segments.map((s) => `${s.label} ${s.value}`).join(", ")}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--track)" strokeWidth={10} />
        {segments.map((s, i) => {
          const len = (s.value / total) * c;
          const el = <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color || PALETTE[i % PALETTE.length]} strokeWidth={10} strokeDasharray={`${Math.max(0, len - 2)} ${c}`} strokeDashoffset={-acc} />;
          acc += len;
          return el;
        })}
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
        <span className="ph-num" style={{ fontSize: size / 4.6, fontWeight: 600, color: "var(--ink)", lineHeight: 1 }}>{center}</span>
        {sub ? <span className="ph-faint" style={{ fontSize: 10.5, marginTop: 3 }}>{sub}</span> : null}
      </div>
    </div>
  );
}

/** Tiny inline trend. */
export function Spark({ values, width = 90, height = 26 }: { values: number[]; width?: number; height?: number }) {
  const max = Math.max(1, ...values), min = Math.min(...values);
  const pts = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * (width - 2) + 1},${height - 2 - ((v - min) / Math.max(1, max - min)) * (height - 4)}`).join(" ");
  return <svg width={width} height={height} aria-hidden="true"><polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
