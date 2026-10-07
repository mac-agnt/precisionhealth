/* Chart pieces for the digital report: hand-rolled HTML and CSS so text keeps its real size at
   375px and on desktop. Every chart has role="img" and an aria-label that says the value, the
   unit, the range and the word, and the same numbers are printed beside it, so colour is never
   the only signal. Band colours are the client's viewer colours; surfaces and text come from the
   app's theme tokens (see digital.css). */
import type { CSSProperties, ReactNode } from "react";
import type { Band, ReportRow } from "../model";
import { BP_SIGNIFICANCE } from "../model";
import { BAND_LOOK } from "./bands";
import type { Bucket, ScaleSpec } from "./digitalModel";
import { BUCKETS, BUCKET_BAND, BUCKET_LABEL, chipWord, pct } from "./digitalModel";

/* ---- chips ---- */
/** The flag word on the band's own colour, or a grey status word. Ink always clears contrast. */
export function FlagChip({ band, word, title }: { band: Band; word: string; title?: string }) {
  if (!word) return null;
  return <span className={`dr-chip b-${band}`} title={title || BAND_LOOK[band].label}>{word}</span>;
}
export function RowChip({ row }: { row: ReportRow }) {
  const word = chipWord(row);
  if (!word) return null;
  return <FlagChip band={row.status === "resulted" ? row.band : "not_tested"} word={word} title={row.status === "resulted" ? BAND_LOOK[row.band].label : row.resultText} />;
}
/** A neutral answer chip for questionnaire answers, which nobody bands. */
export function AnswerChip({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return <span className={"dr-answer" + (muted ? " muted" : "")}>{children}</span>;
}

/* ---- range scale ---- */
const edge = (p: number) => (p < 7 ? " start" : p > 93 ? " end" : "");
/**
 * One value on a horizontal scale. Healthy zone shaded green, borderline zone yellow, the rest
 * a plain track, with a 2px gap between zones. With no value the whole bar is grey and has no
 * zones, so a missing result can never read as in range.
 */
export function RangeScale({ spec, value, band, label, mini, title }: { spec: ScaleSpec; value: number | null; band: Band; label: string; mini?: boolean; title?: string }) {
  const n = spec.zones.length;
  return (
    <div className={"dr-scale" + (mini ? " mini" : "")} role={label ? "img" : undefined} aria-label={label || undefined} aria-hidden={label ? undefined : true}>
      <div className="dr-scale-bar">
        {value == null ? <span className="dr-seg none first last" style={{ left: 0, width: "100%" }} /> : spec.zones.map((z, i) => {
          const l = pct(spec, z.from), w = pct(spec, z.to) - l;
          const inL = i === 0 ? 0 : 1, inR = i === n - 1 ? 0 : 1;
          const style: CSSProperties = { left: `calc(${l}% + ${inL}px)`, width: `max(0px, calc(${w}% - ${inL + inR}px))` };
          return <span key={i} className={`dr-seg z-${z.band}${i === 0 ? " first" : ""}${i === n - 1 ? " last" : ""}`} style={style} />;
        })}
        {value != null ? <span className={`dr-marker b-${band}`} style={{ left: `${pct(spec, value)}%` }} title={title} /> : null}
      </div>
      {!mini && spec.ticks.length ? (
        <div className="dr-ticks" aria-hidden="true">
          {spec.ticks.map((t) => { const p = pct(spec, t.at); return <span key={t.at} className={"dr-tick" + edge(p)} style={{ left: `${p}%` }}>{t.label}</span>; })}
        </div>
      ) : null}
    </div>
  );
}

/** The key under the scales: what the shading and the dot mean. */
export function ScaleLegend({ borderline = true }: { borderline?: boolean }) {
  return (
    <div className="dr-legend" aria-hidden="true">
      <span><i className="dr-key z-normal" />Healthy range</span>
      {borderline ? <span><i className="dr-key z-borderline" />Borderline</span> : null}
      <span><i className="dr-key z-abnormal" />Outside range</span>
      <span><i className="dr-key-dot" />Your result</span>
    </div>
  );
}

/** Named categories under a scale (BMI, HbA1c), the participant's one marked. */
export function CategoryKey({ items, current, label }: { items: Array<{ key: string; label: string; range: string }>; current: string | null; label: string }) {
  return (
    <ul className="dr-catkey" data-n={items.length} aria-label={label}>
      {items.map((c) => (
        <li key={c.key} className={c.key === current ? "on" : ""} aria-current={c.key === current ? "true" : undefined}>
          <span className="dr-catkey-name">{c.label}</span>
          <span className="dr-catkey-range">{c.range}</span>
          {c.key === current ? <span className="dr-sr">(your result)</span> : null}
        </li>
      ))}
    </ul>
  );
}

/* ---- at a glance ---- */
export function SummaryBar({ counts, label }: { counts: Record<Bucket, number>; label: string }) {
  const segs = BUCKETS.filter((b) => counts[b] > 0);
  return (
    <div className="dr-stack" role="img" aria-label={label}>
      {segs.map((b, i) => (
        <span key={b} className={`dr-stack-seg b-${BUCKET_BAND[b]}${i === 0 ? " first" : ""}${i === segs.length - 1 ? " last" : ""}`} style={{ flexGrow: counts[b] }} title={`${counts[b]} ${BUCKET_LABEL[b].toLowerCase()}`} />
      ))}
    </div>
  );
}

/* ---- blood pressure ---- */
/** The five significance bands of the client's report as a ladder, with the reading placed on its band. */
export function BpLadder({ level, reading }: { level: number | null; reading: string | null }) {
  return (
    <ol className="dr-ladder" aria-label="Blood pressure bands, from ideal to immediate treatment">
      {BP_SIGNIFICANCE.map((b, i) => {
        const on = level === i;
        return (
          <li key={b.reading} className={on ? "on" : ""} aria-current={on ? "true" : undefined}>
            <span className="dr-ladder-steps" aria-hidden="true">
              {[0, 1, 2, 3, 4].map((k) => <i key={k} className={k <= i ? `f b-${b.band}` : ""} style={{ height: `${6 + k * 3}px` }} />)}
            </span>
            <span className="dr-ladder-text">
              <span className="dr-ladder-name">{b.significance === "Borderline" ? "Mild (borderline)" : b.significance}</span>
              <span className="dr-ladder-range">{b.reading}</span>
            </span>
            {on && reading ? <span className={`dr-ladder-you b-${b.band}`}><span className="dr-sr">Your reading: </span>{reading}</span> : null}
          </li>
        );
      })}
    </ol>
  );
}

/* ---- heart age ---- */
/** Real age and heart age on one age axis: a dumbbell, not two bars from zero. */
export function HeartAgeDumbbell({ age, heartAge, band, mini }: { age: number; heartAge: number; band: Band; mini?: boolean }) {
  const lo = Math.max(18, Math.floor((Math.min(age, heartAge) - 9) / 5) * 5);
  const hi = Math.ceil((Math.max(age, heartAge) + 9) / 5) * 5;
  const spec = { min: lo, max: hi };
  const a = pct(spec, age), h = pct(spec, heartAge);
  const diff = heartAge - age;
  const label = `Heart age ${heartAge} compared with your age ${age}: ${diff === 0 ? "the same" : diff > 0 ? `${diff} years older` : `${-diff} years younger`}.`;
  return (
    <div className={"dr-dumb" + (mini ? " mini" : "")} role="img" aria-label={label}>
      {!mini ? <span className={"dr-dumb-label top" + edge(h)} style={{ left: `${h}%` }}>Heart age <strong>{heartAge}</strong></span> : null}
      <div className="dr-dumb-plot">
        <span className="dr-dumb-axis" />
        <span className="dr-dumb-link" style={{ left: `${Math.min(a, h)}%`, width: `${Math.abs(h - a)}%` }} />
        <span className="dr-dumb-dot age" style={{ left: `${a}%` }} title={`Your age ${age}`} />
        <span className={`dr-marker b-${band}`} style={{ left: `${h}%` }} title={`Heart age ${heartAge}`} />
      </div>
      {!mini ? <span className={"dr-dumb-label bottom" + edge(a)} style={{ left: `${a}%` }}>Your age <strong>{age}</strong></span> : null}
    </div>
  );
}

/** 100 people, the risk count filled: "about 5 in 100". */
export function IconArray({ filled, label }: { filled: number; label: string }) {
  return (
    <div className="dr-icons" role="img" aria-label={label}>
      {Array.from({ length: 100 }, (_, i) => <i key={i} className={i < filled ? "f" : ""} />)}
    </div>
  );
}

/* ---- lifestyle ---- */
export function DayDots({ days }: { days: number }) {
  return (
    <div className="dr-days" role="img" aria-label={`${days} of 7 days with 30 minutes of exercise`}>
      {Array.from({ length: 7 }, (_, i) => <i key={i} className={i < days ? "f" : ""} />)}
    </div>
  );
}
/** Position of a frequency answer on its four steps. Neutral colour: answers are not banded. */
export function StepScale({ index, steps, label }: { index: number | null; steps: string[]; label: string }) {
  return (
    <div className="dr-steps" role="img" aria-label={label}>
      <div className="dr-steps-bar">
        {steps.map((s, i) => <i key={s} className={(i === index ? "f" : "") + (i === 0 ? " first" : "") + (i === steps.length - 1 ? " last" : "")} />)}
      </div>
      <div className="dr-steps-ends" aria-hidden="true"><span>{steps[0]}</span><span>{steps[steps.length - 1]}</span></div>
    </div>
  );
}
/** Weekly alcohol units against the guide line. Bar grows from a baseline; no filled track. */
export function GuideBar({ value, guide, label }: { value: number; guide: number; label: string }) {
  const max = Math.max(guide * 1.6, value * 1.15, 4);
  const spec = { min: 0, max };
  const g = pct(spec, guide);
  return (
    <div className="dr-guide" role="img" aria-label={label}>
      <span className={"dr-guide-tag" + edge(g)} style={{ left: `${g}%` }}>Guide {guide}</span>
      <div className="dr-guide-plot">
        <span className="dr-guide-bar" style={{ width: `${pct(spec, value)}%` }} />
        <span className="dr-guide-line" style={{ left: `${g}%` }} />
      </div>
      <div className="dr-ticks" aria-hidden="true">
        <span className="dr-tick start" style={{ left: 0 }}>0</span>
        <span className="dr-tick end" style={{ left: "100%" }}>{Math.round(max)} units</span>
      </div>
    </div>
  );
}
