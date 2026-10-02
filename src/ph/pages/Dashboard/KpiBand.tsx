/* KPI band for the three Dashboard tabs. It copies the look of the original Pulse dashboard
   band (glass cards over an abstract teal backdrop, see src/views/pages/DashboardKpiBand.tsx and
   KpiBackdrop.tsx) but is rebuilt here so every figure comes straight from PH selectors.
   Status is always icon plus text plus colour. Every value carries its denominator line. */
import { useId } from "react";
import type { ReactNode } from "react";
import { Icon, TONE } from "../../ui";
import type { GlyphName, Tone } from "../../ui";
import { useNav } from "../../nav-context";

export interface BandKpi {
  key: string;
  label: string;
  value: ReactNode;
  /** Denominator or definition line. Required so a figure is never unexplained. */
  sub: ReactNode;
  tone?: Tone;
  /** Short status text shown with the tone icon, for example "2 failed". */
  status?: string;
  icon?: GlyphName;
  hint?: string;
  onClick?: () => void;
}

/** Themes with a light page background. The band drops the dark backdrop there. */
const LIGHT_THEMES = new Set(["light", "warm", "mist", "sand"]);

function prefersReducedMotion(): boolean {
  try { return typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
}

export function KpiBand({ eyebrow, title, right, items }: { eyebrow: string; title: string; right?: ReactNode; items: BandKpi[] }) {
  const nav = useNav();
  const light = LIGHT_THEMES.has(nav.shell?.theme || "harbour");
  const animate = !(nav.shell?.reduceMotion || prefersReducedMotion());
  return (
    <section aria-label={title} style={{
      position: "relative", isolation: "isolate", overflow: "hidden", marginTop: 16, borderRadius: "var(--card-r, 24px)", padding: "22px 22px 20px",
      background: light ? "var(--surface)" : "var(--surface-faint)", border: "1px solid var(--border)",
    }}>
      {light ? null : <BandBackdrop animate={animate} />}
      <div className="ph-row-flex" style={{ position: "relative", alignItems: "flex-end", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
        <div className="ph-grow" style={{ minWidth: 200 }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 9.5, letterSpacing: ".13em", textTransform: "uppercase", color: "var(--dim)" }}>{eyebrow}</div>
          <h1 className="ph-h1" style={{ marginTop: 7, fontSize: 25, letterSpacing: "-.6px" }}>{title}</h1>
        </div>
        {right ? <div className="ph-wrap" style={{ justifyContent: "flex-end" }}>{right}</div> : null}
      </div>
      <div style={{ position: "relative", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(178px, 1fr))", gap: 12 }}>
        {items.map((k) => <BandCard key={k.key} k={k} light={light} />)}
      </div>
    </section>
  );
}

function BandCard({ k, light }: { k: BandKpi; light: boolean }) {
  const t = k.tone ? TONE[k.tone] : null;
  const glass = light
    ? { background: "var(--surface-strong)", border: "1px solid var(--border)", boxShadow: "0 1px 3px rgba(20,22,28,.06)" }
    : {
      background: "linear-gradient(160deg, rgba(255,255,255,.075), rgba(255,255,255,.015) 55%)", border: "1px solid rgba(255,255,255,.1)",
      backdropFilter: "blur(22px) saturate(1.5)", WebkitBackdropFilter: "blur(22px) saturate(1.5)",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,.12), inset 0 -1px 0 rgba(0,0,0,.2), 0 10px 30px rgba(0,0,0,.22)",
    };
  const inner = (
    <>
      <div className="ph-row-flex" style={{ gap: 8, alignItems: "flex-start" }}>
        <span className="ph-grow" style={{ fontSize: 10.5, fontWeight: 500, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--dim)", lineHeight: 1.35 }}>{k.label}</span>
        {k.icon ? <Icon name={k.icon} size={14} style={{ color: t ? t.fg : "var(--faint)", marginTop: 1 }} /> : null}
      </div>
      <div className="ph-num" style={{ fontSize: 30, fontWeight: "var(--fig-weight, 600)" as never, letterSpacing: "-1.1px", lineHeight: 1.05, marginTop: 10, color: "var(--ink)" }}>{k.value}</div>
      {t && k.status ? (
        <div className="ph-row-flex" style={{ gap: 6, marginTop: 8, fontSize: 11.5, color: t.fg, fontWeight: 500 }}>
          <Icon name={t.icon} size={12} stroke={2.2} />
          <span>{k.status}</span>
        </div>
      ) : null}
      <div style={{ fontSize: 11.5, marginTop: t && k.status ? 4 : 8, lineHeight: 1.4, color: "var(--dim)" }}>{k.sub}</div>
    </>
  );
  const style = { position: "relative" as const, minWidth: 0, padding: "16px 16px 15px", borderRadius: 20, color: "var(--ink)", textAlign: "left" as const, font: "inherit", ...glass };
  if (k.onClick) {
    return (
      <button type="button" className="ph-row" onClick={k.onClick} title={k.hint} style={{ ...style, display: "block", width: "100%", cursor: "pointer" }}>
        {inner}
      </button>
    );
  }
  return <div title={k.hint} style={style}>{inner}</div>;
}

/** The abstract backdrop from the original band, with its own ids and the theme accent as the base colour. */
function BandBackdrop({ animate }: { animate: boolean }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const r1 = `${id}r1`, r2 = `${id}r2`, r3 = `${id}r3`, bloom = `${id}bloom`, shadow = `${id}shadow`, edge = `${id}edge`, sheen = `${id}sheen`, grain = `${id}grain`, vig = `${id}vig`;
  const mix = (pct: number, base = "#050806") => `color-mix(in oklab, var(--accent) ${pct}%, ${base})`;
  const drift = (values: string, dur: string) => animate
    ? <animateTransform attributeName="transform" type="translate" values={values} dur={dur} repeatCount="indefinite" calcMode="spline" keyTimes="0;.5;1" keySplines=".45 0 .55 1;.45 0 .55 1" />
    : null;
  return (
    <div aria-hidden="true" style={{ position: "absolute", inset: 0, zIndex: -1, pointerEvents: "none" }}>
      <svg viewBox="0 0 1400 520" preserveAspectRatio="xMidYMid slice" width="100%" height="100%" style={{ position: "absolute", inset: 0, display: "block" }}>
        <defs>
          <linearGradient id={r1} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" style={{ stopColor: mix(62) }} /><stop offset="0.55" style={{ stopColor: mix(26) }} /><stop offset="1" style={{ stopColor: mix(10) }} />
          </linearGradient>
          <linearGradient id={r2} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: mix(74) }} /><stop offset="0.35" style={{ stopColor: mix(36) }} /><stop offset="1" style={{ stopColor: mix(8) }} />
          </linearGradient>
          <linearGradient id={r3} x1="1" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: mix(80) }} /><stop offset="0.5" style={{ stopColor: mix(40) }} /><stop offset="1" style={{ stopColor: mix(12) }} />
          </linearGradient>
          <filter id={bloom} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="70" /></filter>
          <filter id={shadow} x="-10%" y="-20%" width="120%" height="160%"><feGaussianBlur stdDeviation="26" /></filter>
          <filter id={edge} x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="1.6" /></filter>
          <filter id={sheen} x="-10%" y="-50%" width="120%" height="200%"><feGaussianBlur stdDeviation="7" /></filter>
          <filter id={grain}>
            <feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" stitchTiles="stitch" />
            <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .5 0" />
          </filter>
          <radialGradient id={vig} cx=".45" cy=".5" r=".8"><stop offset=".5" stopColor="#000" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity=".5" /></radialGradient>
        </defs>
        <rect width="1400" height="520" style={{ fill: mix(8) }} />
        <g filter={`url(#${bloom})`}>
          <circle cx="170" cy="110" r="250" style={{ fill: mix(58) }} opacity=".85">{drift("0 0;40 24;0 0", "34s")}</circle>
          <circle cx="1260" cy="400" r="270" style={{ fill: mix(64) }} opacity=".8">{drift("0 0;-36 -20;0 0", "28s")}</circle>
          <circle cx="760" cy="560" r="230" style={{ fill: mix(42) }} opacity=".6">{drift("0 0;24 -18;0 0", "38s")}</circle>
        </g>
        <g>
          {drift("0 0;26 10;0 0", "26s")}
          <path d="M-120 118 C120 58 360 66 560 138 S960 262 1520 84 L1520 -40 H-120 Z" fill="#000" opacity=".5" filter={`url(#${shadow})`} transform="translate(0 18)" />
          <path d="M-120 118 C120 58 360 66 560 138 S960 262 1520 84 L1520 -40 H-120 Z" fill={`url(#${r1})`} filter={`url(#${edge})`} />
          <path d="M-120 118 C120 58 360 66 560 138 S960 262 1520 84" fill="none" stroke={mix(60, "#fff")} strokeOpacity=".32" strokeWidth="10" strokeLinecap="round" filter={`url(#${sheen})`} />
        </g>
        <g>
          {drift("0 0;-30 -12;0 0", "22s")}
          <path d="M-120 330 C180 248 420 226 700 296 S1160 424 1520 290 L1520 432 C1180 548 920 440 700 424 S220 400 -120 478 Z" fill="#000" opacity=".5" filter={`url(#${shadow})`} transform="translate(0 18)" />
          <path d="M-120 330 C180 248 420 226 700 296 S1160 424 1520 290 L1520 432 C1180 548 920 440 700 424 S220 400 -120 478 Z" fill={`url(#${r2})`} filter={`url(#${edge})`} />
          <path d="M-120 330 C180 248 420 226 700 296 S1160 424 1520 290" fill="none" stroke={mix(60, "#fff")} strokeOpacity=".32" strokeWidth="10" strokeLinecap="round" filter={`url(#${sheen})`} />
        </g>
        <g>
          {drift("0 0;-18 14;0 0", "30s")}
          <path d="M1520 150 C1310 164 1140 262 1090 404 C1052 512 1130 600 1260 640 H1520 Z" fill="#000" opacity=".5" filter={`url(#${shadow})`} transform="translate(0 18)" />
          <path d="M1520 150 C1310 164 1140 262 1090 404 C1052 512 1130 600 1260 640 H1520 Z" fill={`url(#${r3})`} filter={`url(#${edge})`} />
          <path d="M1520 150 C1310 164 1140 262 1090 404 C1052 512 1130 600 1260 640" fill="none" stroke={mix(60, "#fff")} strokeOpacity=".32" strokeWidth="10" strokeLinecap="round" filter={`url(#${sheen})`} />
        </g>
        <rect width="1400" height="520" fill={`url(#${vig})`} />
        <rect width="1400" height="520" filter={`url(#${grain})`} opacity=".05" />
      </svg>
      {/* A scrim keeps glass cards and text readable over the brightest part of the backdrop. */}
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(5,8,8,.18), rgba(5,8,8,.42))" }} />
    </div>
  );
}
