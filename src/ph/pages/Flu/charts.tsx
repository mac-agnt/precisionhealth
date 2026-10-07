/* Charts for the Flu module, hand-built in SVG (no charting library is installed). They follow the
   dataviz method: thin marks with 4px rounded data ends, hairline solid grid, a legend for two or more
   series, text in text tokens (never the series colour), a hover and focus tooltip on every mark, and
   a table view beside each chart so no value is reachable only by hovering. Series colours come from
   the validated --flu-s1..3 tokens in flu.css; status (out of range, short) uses status tokens plus text. */
import { useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode, RefObject } from "react";
import { FLU_SAFE_MAX_C, FLU_SAFE_MIN_C } from "../../model";
import type { FluColdChainRow, FluReading } from "../../model";

export function useWidth<T extends HTMLElement>(): [RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => { const e = entries[0]; if (e) setW(Math.round(e.contentRect.width)); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** Clean axis ticks from zero: 0, 250, 500 and so on. */
export function niceTicks(max: number, count = 4): number[] {
  if (!(max > 0)) return [0, 1];
  const raw = max / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const top = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = 0; v <= top + step / 1000; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}
const fmtTick = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** Column with a 4px rounded data end and a square base on the baseline. */
function colPath(x: number, y: number, w: number, h: number, r = 4): string {
  if (h <= 0) return "";
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

function Tip({ x, y, width, children }: { x: number; y: number; width: number; children: ReactNode }) {
  const tipW = 220;
  const left = Math.max(0, Math.min(width - tipW, x - tipW / 2));
  return <div className="flu-tip" style={{ left, top: y, width: tipW }} role="status" aria-live="polite">{children}</div>;
}
export function TipRow({ color, name, value, line }: { color?: string; name: ReactNode; value: ReactNode; line?: boolean }) {
  return (
    <div className="flu-tip-row">
      {color ? <span className={line ? "flu-key-line" : "flu-key-rect"} style={{ background: color, width: line ? 12 : 8, height: line ? 2 : 8 }} /> : null}
      <b>{value}</b><span className="flu-tip-name">{name}</span>
    </div>
  );
}

export function Legend({ items }: { items: Array<{ label: ReactNode; color?: string; kind: "rect" | "line" | "node"; node?: ReactNode }> }) {
  return (
    <div className="flu-legend">
      {items.map((it, i) => (
        <span key={i}>
          {it.kind === "node" ? it.node : <span className={it.kind === "line" ? "flu-key-line" : "flu-key-rect"} style={{ background: it.color }} />}
          {it.label}
        </span>
      ))}
    </div>
  );
}

const onEnter = (fn: () => void) => (e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); } };

/* ---------- grouped columns: one group per week, one column per series ---------- */
export function GroupedColumns({ groups, series, height = 230, caption, tip }: {
  groups: Array<{ key: string; label: string; sub?: string; values: number[] }>;
  series: Array<{ label: string; color: string }>;
  height?: number;
  caption: string;
  tip: (i: number) => ReactNode;
}) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const hasSub = groups.some((g) => g.sub);
  const pad = { l: 44, r: 6, t: 12, b: hasSub ? 36 : 22 };
  const plotW = Math.max(10, w - pad.l - pad.r), plotH = height - pad.t - pad.b;
  const ticks = niceTicks(Math.max(1, ...groups.flatMap((g) => g.values)));
  const top = ticks[ticks.length - 1];
  const y = (v: number) => pad.t + plotH - (v / top) * plotH;
  const band = plotW / Math.max(1, groups.length);
  const k = series.length, gap = 2;
  const barW = Math.max(3, Math.min(24, (band * 0.72 - gap * (k - 1)) / k));
  const groupW = k * barW + (k - 1) * gap;
  return (
    <div>
      <Legend items={series.map((s) => ({ label: s.label, color: s.color, kind: "rect" as const }))} />
      <div className="flu-chart" ref={ref} onMouseLeave={() => setHover(null)}>
        {w > 0 ? (
          <svg width={w} height={height} role="img" aria-label={caption}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--border-strong)" : "var(--border)"} strokeWidth={1} />
                <text className="flu-axis" x={pad.l - 8} y={y(t) + 3.5} textAnchor="end">{fmtTick(t)}</text>
              </g>
            ))}
            {groups.map((g, i) => {
              const cx = pad.l + band * i + band / 2;
              const x0 = cx - groupW / 2;
              return (
                <g key={g.key}>
                  {hover === i ? <rect x={pad.l + band * i + 2} y={pad.t} width={band - 4} height={plotH} rx={6} fill="var(--track)" opacity={0.55} /> : null}
                  {g.values.map((v, si) => <path key={si} d={colPath(x0 + si * (barW + gap), y(v), barW, y(0) - y(v))} fill={series[si].color} />)}
                  <text className="flu-axis-strong" x={cx} y={height - pad.b + 15} textAnchor="middle">{g.label}</text>
                  {g.sub ? <text className="flu-axis" x={cx} y={height - pad.b + 28} textAnchor="middle">{g.sub}</text> : null}
                  <rect className="flu-hit" x={pad.l + band * i} y={pad.t} width={band} height={plotH} tabIndex={0}
                    aria-label={`${g.label}: ${g.values.map((v, si) => `${series[si].label} ${fmtTick(v)}`).join(", ")}`}
                    onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} />
                </g>
              );
            })}
          </svg>
        ) : <div style={{ height }} />}
        {hover !== null && w > 0 ? <Tip x={pad.l + band * hover + band / 2} y={4} width={w}>{tip(hover)}</Tip> : null}
      </div>
    </div>
  );
}

/* ---------- lines: cumulative series over weeks, with a crosshair ---------- */
export function LinesChart({ points, series, height = 230, caption, tip, flags }: {
  points: Array<{ key: string; label: string; values: number[] }>;
  series: Array<{ label: string; color: string }>;
  height?: number;
  caption: string;
  tip: (i: number) => ReactNode;
  /** Status annotations, e.g. a short week. Drawn with the status colour and text. */
  flags?: Array<{ index: number; text: string }>;
}) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const endLabels = w >= 560;
  const pad = { l: 48, r: endLabels ? 112 : 10, t: 22, b: 24 };
  const plotW = Math.max(10, w - pad.l - pad.r), plotH = height - pad.t - pad.b;
  const ticks = niceTicks(Math.max(1, ...points.flatMap((p) => p.values)));
  const top = ticks[ticks.length - 1];
  const n = points.length;
  const x = (i: number) => pad.l + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => pad.t + plotH - (v / top) * plotH;
  const band = n <= 1 ? plotW : plotW / (n - 1);
  /* Keep end labels apart when the two series finish close together. */
  const ends = series.map((s, si) => ({ si, y: y(points[n - 1]?.values[si] ?? 0) })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 14) ends[i].y = ends[i - 1].y + 14;
  return (
    <div>
      <Legend items={series.map((s) => ({ label: s.label, color: s.color, kind: "line" as const }))} />
      <div className="flu-chart" ref={ref} onMouseLeave={() => setHover(null)}>
        {w > 0 && n > 0 ? (
          <svg width={w} height={height} role="img" aria-label={caption}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={pad.l} x2={pad.l + plotW} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--border-strong)" : "var(--border)"} strokeWidth={1} />
                <text className="flu-axis" x={pad.l - 8} y={y(t) + 3.5} textAnchor="end">{fmtTick(t)}</text>
              </g>
            ))}
            {points.map((p, i) => <text key={p.key} className="flu-axis-strong" x={x(i)} y={height - 6} textAnchor="middle">{p.label}</text>)}
            {hover !== null ? <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + plotH} stroke="var(--border-strong)" strokeWidth={1} /> : null}
            {series.map((s, si) => (
              <polyline key={si} points={points.map((p, i) => `${x(i)},${y(p.values[si])}`).join(" ")} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            ))}
            {series.map((s, si) => points.map((p, i) => (
              <circle key={`${si}-${i}`} cx={x(i)} cy={y(p.values[si])} r={hover === i ? 5 : 4} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
            )))}
            {(flags || []).map((f) => {
              const v = Math.max(...points[f.index].values);
              const fy = Math.max(pad.t - 6, y(v) - 14);
              return (
                <g key={`f${f.index}`}>
                  <path d={`M${x(f.index) - 5},${fy - 9}L${x(f.index) + 5},${fy - 9}L${x(f.index)},${fy - 1}Z`} fill="var(--bad)" />
                  <text x={x(f.index) + 8} y={fy - 2} fontSize={11} fontWeight={600} fill="var(--bad)">{f.text}</text>
                </g>
              );
            })}
            {endLabels ? ends.map((e) => (
              <text key={e.si} x={pad.l + plotW + 10} y={e.y + 4} fontSize={11} fill="var(--body)">{series[e.si].label.split(" (")[0]}</text>
            )) : null}
            {points.map((p, i) => (
              <rect key={`h${i}`} className="flu-hit" x={Math.max(pad.l - band / 2, x(i) - band / 2)} y={pad.t} width={band} height={plotH} tabIndex={0}
                aria-label={`${p.label}: ${p.values.map((v, si) => `${series[si].label} ${fmtTick(v)}`).join(", ")}`}
                onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} />
            ))}
          </svg>
        ) : <div style={{ height }} />}
        {hover !== null && w > 0 ? <Tip x={x(hover)} y={4} width={w}>{tip(hover)}</Tip> : null}
      </div>
    </div>
  );
}

/* ---------- cold chain: three readings per clinic against the 2 to 8 °C safe range ---------- */
const READINGS: FluReading[] = ["pre", "intermediate", "post"];
export function ReadingShape({ reading, cx, cy, fill, ring = true, size = 4 }: { reading: FluReading; cx: number; cy: number; fill: string; ring?: boolean; size?: number }) {
  const common = { fill, stroke: ring ? "var(--surface)" : "none", strokeWidth: ring ? 2 : 0, paintOrder: "stroke" as const };
  if (reading === "pre") return <circle cx={cx} cy={cy} r={size} {...common} />;
  if (reading === "intermediate") return <rect x={cx - size} y={cy - size} width={size * 2} height={size * 2} rx={1.5} {...common} />;
  return <path d={`M${cx},${cy - size - 1}L${cx + size + 1},${cy + size}L${cx - size - 1},${cy + size}Z`} {...common} />;
}
export function ShapeKey({ reading, color }: { reading: FluReading; color: string }) {
  return <svg width={12} height={12} aria-hidden="true"><ReadingShape reading={reading} cx={6} cy={6} fill={color} ring={false} /></svg>;
}

export function ColdChainChart({ rows, height = 250, caption, tip, onSelect, tickLabel }: {
  rows: FluColdChainRow[];
  height?: number;
  caption: string;
  tip: (row: FluColdChainRow) => ReactNode;
  onSelect?: (row: FluColdChainRow) => void;
  tickLabel: (row: FluColdChainRow) => string;
}) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const vals = rows.flatMap((r) => [r.readings.preC, r.readings.intermediateC, r.readings.postC]).filter((v): v is number => v !== null);
  const lo = Math.min(0, Math.floor((vals.length ? Math.min(...vals) : 0) - 0.5));
  const hi = Math.max(10, Math.ceil((vals.length ? Math.max(...vals) : 10) + 0.5));
  const pad = { l: 40, r: 8, t: 18, b: 24 };
  const plotW = Math.max(10, w - pad.l - pad.r), plotH = height - pad.t - pad.b;
  const y = (v: number) => pad.t + plotH - ((v - lo) / (hi - lo)) * plotH;
  const band = plotW / Math.max(1, rows.length);
  const off = band >= 16 ? 4 : band >= 10 ? 2 : 0;
  const ticks: number[] = [];
  for (let t = Math.ceil(lo / 2) * 2; t <= hi; t += 2) ticks.push(t);
  /* Week ticks: first clinic of each week, thinned so labels never collide. */
  const tickIdx: number[] = [];
  let lastX = -999, lastLabel = "";
  rows.forEach((r, i) => {
    const lab = tickLabel(r);
    const xx = pad.l + band * i + band / 2;
    if (lab !== lastLabel && xx - lastX >= 52) { tickIdx.push(i); lastX = xx; }
    lastLabel = lab;
  });
  return (
    <div className="flu-chart" ref={ref} onMouseLeave={() => setHover(null)}>
      {w > 0 && rows.length ? (
        <svg width={w} height={height} role="img" aria-label={caption}>
          <rect x={pad.l} y={y(FLU_SAFE_MAX_C)} width={plotW} height={y(FLU_SAFE_MIN_C) - y(FLU_SAFE_MAX_C)} fill="var(--ok-soft)" />
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={pad.l + plotW} y1={y(t)} y2={y(t)} stroke={t === FLU_SAFE_MIN_C || t === FLU_SAFE_MAX_C ? "var(--ok)" : "var(--border)"} strokeOpacity={t === FLU_SAFE_MIN_C || t === FLU_SAFE_MAX_C ? 0.55 : 1} strokeWidth={1} />
              <text className={t === FLU_SAFE_MIN_C || t === FLU_SAFE_MAX_C ? "flu-axis-strong" : "flu-axis"} x={pad.l - 8} y={y(t) + 3.5} textAnchor="end">{t} °C</text>
            </g>
          ))}
          <text x={pad.l + 6} y={y(FLU_SAFE_MAX_C) + 13} fontSize={10.5} fill="var(--dim)">Safe range 2 to 8 °C</text>
          {tickIdx.map((i) => <text key={`t${i}`} className="flu-axis" x={pad.l + band * i + band / 2} y={height - 6} textAnchor="middle">{tickLabel(rows[i])}</text>)}
          {rows.map((r, i) => {
            const cx = pad.l + band * i + band / 2;
            const vs = [r.readings.preC, r.readings.intermediateC, r.readings.postC];
            return (
              <g key={r.key}>
                {hover === i ? <rect x={pad.l + band * i} y={pad.t} width={band} height={plotH} fill="var(--track)" opacity={0.6} /> : null}
                {READINGS.map((rd, k) => {
                  const v = vs[k];
                  if (v === null) return null;
                  const out = v < FLU_SAFE_MIN_C || v > FLU_SAFE_MAX_C;
                  return <ReadingShape key={rd} reading={rd} cx={cx + (k - 1) * off} cy={y(v)} fill={out ? "var(--bad)" : "var(--flu-s1)"} size={out ? 5 : 4} />;
                })}
                {r.excursions.map((e) => (
                  <text key={e.reading} x={cx} y={e.kind === "high" ? y(e.value) - 10 : y(e.value) + 18} textAnchor={i > rows.length * 0.8 ? "end" : i < rows.length * 0.2 ? "start" : "middle"} fontSize={10.5} fontWeight={600} fill="var(--bad)">
                    {`${e.value.toFixed(1)} °C, out of range`}
                  </text>
                ))}
                <rect className="flu-hit" x={pad.l + band * i} y={pad.t} width={band} height={plotH} tabIndex={0} style={{ cursor: onSelect ? "pointer" : "default" }}
                  aria-label={`${r.company}, ${r.date}: ${READINGS.map((rd, k) => `${rd} ${vs[k] === null ? "not recorded" : `${vs[k]!.toFixed(1)} degrees`}`).join(", ")}${r.excursions.length ? ", out of range" : ""}`}
                  onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
                  onClick={onSelect ? () => onSelect(r) : undefined} onKeyDown={onSelect ? onEnter(() => onSelect(r)) : undefined} />
              </g>
            );
          })}
        </svg>
      ) : <div style={{ height }} />}
      {hover !== null && w > 0 && rows[hover] ? <Tip x={pad.l + band * hover + band / 2} y={4} width={w}>{tip(rows[hover])}</Tip> : null}
    </div>
  );
}
