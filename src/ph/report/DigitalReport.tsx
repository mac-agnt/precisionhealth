/* The participant's digital report: the same ReportDocument as the paper ScreeningReport, shown
   chart first. Header, an at-a-glance summary, the doctor's advice and next step, key metric
   tiles, then one card per topic with a one-line headline, a chart and a collapsed "About this
   test" holding the report's own explanations. Pending, not done, declined and not applicable
   results are grey and labelled, never drawn on a healthy zone. The paper report stays the
   download and print copy. Everything is derived from reportDocument(), which already limits a
   participant to their own released or superseded versions. */
import { useCallback, useId } from "react";
import type { CSSProperties, ReactNode } from "react";
import { BP_SIGNIFICANCE, REPORT_HEADINGS, ageOn, bandCtxFor, bpCategory, fmtDate, ix, localDateOf } from "../model";
import type { Band, BandCtx, Id, ReportDocument, ReportRow, ReportSection, ReportSectionContent, ReportSectionKey, SexRecorded } from "../model";
import { usePhState } from "../store";
import { DemoTag, Icon, Pill } from "../ui";
import type { GlyphName } from "../ui";
import {
  AnswerChip, BpLadder, CategoryKey, DayDots, FlagChip, GuideBar, HeartAgeDumbbell, IconArray, RangeScale, RowChip, ScaleLegend, StepScale, SummaryBar,
} from "./DigitalCharts";
import {
  BMI_CATEGORIES, BP_SHORT, BUCKETS, BUCKET_BAND, BUCKET_LABEL, FREQ_STEPS, HBA1C_CATEGORIES, analyteScale, bmiCategoryKey, bmiScale, bpLevel, bpScale, bpValues,
  buildScale, chipWord, countedRows, directionOf, headlineFor, lifestyleView, linkPieces, numericValue, prettyUnit, relativeRiskScale, rowOf, sectionOf, summarise, waistScale,
} from "./digitalModel";
import type { ScaleSpec } from "./digitalModel";
import { BAND_LOOK } from "./bands";
import "./digital.css";

export interface DigitalReportProps {
  doc: ReportDocument;
  episodeId: Id;
  /** The 375px portal: tighter padding. Layout itself follows the report's own width. */
  compact?: boolean;
  /** Advice typed in the clinician's editor but not saved yet, for the preview. */
  draftAdvice?: string;
}

const LAB_SECTIONS: Array<{ key: ReportSectionKey; title: string }> = [
  { key: "kidney", title: "Kidney function" },
  { key: "fbc", title: "Full blood count" },
  { key: "liver", title: "Liver function" },
  { key: "thyroid", title: "Thyroid function" },
  { key: "iron", title: "Iron and ferritin" },
  { key: "vitamins_minerals", title: "Vitamins and minerals" },
];
const SHORT_NAME: Record<string, string> = {
  TC: "Total cholesterol", HDL: "HDL (good) cholesterol", LDL: "LDL (bad) cholesterol", NONHDL: "Non-HDL cholesterol", TG: "Triglycerides", cv_tchdl: "Total to HDL ratio",
  cv_rr: "Relative heart risk", urine_blood: "Blood", urine_wcc: "White cells", urine_glucose: "Glucose", urine_protein: "Protein", ecg: "Heart tracing (ECG)",
};
const named = (r: ReportRow): ReportRow => (SHORT_NAME[r.key] ? { ...r, test: SHORT_NAME[r.key] } : r);
/** The client's band colours from bands.ts, the one source for fills and inks. */
const BAND_VARS = {
  "--dr-n": BAND_LOOK.normal.fill, "--dr-n-ink": BAND_LOOK.normal.ink,
  "--dr-b": BAND_LOOK.borderline.fill, "--dr-b-ink": BAND_LOOK.borderline.ink,
  "--dr-a": BAND_LOOK.abnormal.fill, "--dr-a-ink": BAND_LOOK.abnormal.ink,
  "--dr-x": BAND_LOOK.not_tested.fill, "--dr-x-ink": BAND_LOOK.not_tested.ink,
} as CSSProperties;

function inferSex(doc: ReportDocument): SexRecorded {
  if (doc.sections.some((s) => s.key === "testicular" || s.key === "prostate")) return "male";
  if (doc.sections.some((s) => s.key === "breast_cervical")) return "female";
  return "not_recorded";
}

export function DigitalReport({ doc, episodeId, compact, draftAdvice }: DigitalReportProps) {
  const state = usePhState();
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const I = ix(state);
  const ep = I.episodeById.get(episodeId);
  const person = ep ? I.personById.get(ep.personId) : undefined;
  const ctx: BandCtx = person && ep ? bandCtxFor(person, ep.collectedAt) : { sex: inferSex(doc), age: ageOn(doc.header.dob, localDateOf(doc.header.appointmentDate)) };
  const sid = (k: string) => `dr${uid}-${k}`;
  const jump = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const reduce = typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    el.focus({ preventScroll: true });
  }, []);

  const counted = countedRows(doc);
  const summary = summarise(counted);
  const flagged = counted.filter((c) => c.bucket === "to_discuss" || c.bucket === "outside");
  const advice = draftAdvice !== undefined ? draftAdvice : doc.advice.text;
  const sectionTarget: Partial<Record<ReportSectionKey, string>> = {
    cholesterol: "cholesterol", blood_pressure: "bp", cardiovascular_risk: "heart", hba1c: "sugar", bmi: "body", urinalysis: "urine", ecg: "urine",
    bowel: "cancer", prostate: "cancer", testicular: "cancer", breast_cervical: "cancer", cancer: "cancer",
    kidney: "kidney", fbc: "fbc", liver: "liver", thyroid: "thyroid", iron: "iron", vitamins_minerals: "vitamins_minerals",
  };

  return (
    <div className={"dr" + (compact ? " compact" : "")} style={BAND_VARS}>
      <Header doc={doc} />
      <Glance summary={summary} flagged={flagged.map((f) => ({ row: named(f.row), target: sid(sectionTarget[f.section] || f.section) }))} jump={jump} />
      <Advice doc={doc} advice={advice} anyFlagged={flagged.length > 0} />
      <KeyTiles doc={doc} ctx={ctx} jump={jump} sid={sid} />
      <Cholesterol id={sid("cholesterol")} doc={doc} ctx={ctx} />
      <BloodPressure id={sid("bp")} doc={doc} />
      <HeartHealth id={sid("heart")} doc={doc} ctx={ctx} />
      <Body id={sid("body")} doc={doc} ctx={ctx} />
      <BloodSugar id={sid("sugar")} doc={doc} ctx={ctx} />
      {LAB_SECTIONS.map((l) => { const s = sectionOf(doc, l.key); return s && s.rows.length ? <LabCard key={l.key} id={sid(l.key)} title={l.title} s={s} ctx={ctx} /> : null; })}
      <UrineEcg id={sid("urine")} doc={doc} />
      <Cancer id={sid("cancer")} doc={doc} ctx={ctx} />
      <Lifestyle id={sid("lifestyle")} doc={doc} sex={ctx.sex} />
      <Footer doc={doc} />
    </div>
  );
}

/* ---------- frame ---------- */
function Header({ doc }: { doc: ReportDocument }) {
  const h = doc.header;
  const s = doc.versionStatus;
  const pill = s === "released" ? <Pill tone="ok" icon="check">Final report</Pill>
    : s === "superseded" ? <Pill tone="neutral" icon="layers">Superseded</Pill>
    : s === "preview" ? <Pill tone="info" icon="eye">Preview, not released</Pill>
    : <Pill tone="warn" icon="clock">Draft, not released</Pill>;
  const meta: Array<[string, string]> = [
    ["Screening date", fmtDate(h.appointmentDate)],
    ["Programme", h.programme],
    ["Reviewing doctor", h.clinician || "Not assigned yet"],
    ["Released", h.releasedAt ? fmtDate(h.releasedAt) : "Not released yet"],
    ["Version", h.version ? `Version ${h.version}` : "No version yet"],
    ["Reference", h.screeningRef],
  ];
  return (
    <header className="dr-card dr-header">
      <div className="dr-header-top">
        <div className="dr-grow">
          <div className="dr-kicker">{h.title}</div>
          <h2 className="dr-name">{h.name}</h2>
        </div>
        <div className="dr-header-tags">{pill}<DemoTag title="Sample content for the demonstration. The participant is fictional.">Sample data</DemoTag></div>
      </div>
      <dl className="dr-meta">
        {meta.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
      </dl>
      {doc.intro.length ? (
        <details className="dr-about">
          <summary><Icon name="chevronDown" size={14} /><span>About this report</span></summary>
          <div className="dr-about-body">{doc.intro.map((t, i) => <p key={i}>{t}</p>)}</div>
        </details>
      ) : null}
    </header>
  );
}

function Glance({ summary, flagged, jump }: { summary: ReturnType<typeof summarise>; flagged: Array<{ row: ReportRow; target: string }>; jump: (id: string) => void }) {
  const c = summary.counts;
  const parts: string[] = [];
  if (c.to_discuss) parts.push(`${c.to_discuss} to discuss`);
  if (c.outside) parts.push(`${c.outside} outside the range`);
  if (c.missing) parts.push(`${c.missing} not done or pending`);
  const tail = parts.length ? ` ${parts.length > 1 ? parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1] : parts[0]}.` : "";
  const line = `${c.in_range} of ${summary.total} results are in the healthy range.${tail}`;
  const aria = `${summary.total} results: ${BUCKETS.map((b) => `${c[b]} ${BUCKET_LABEL[b].toLowerCase()}`).join(", ")}.`;
  return (
    <section className="dr-card dr-glance" aria-labelledby="dr-glance-title">
      <h3 id="dr-glance-title" className="dr-sec-title">At a glance</h3>
      <p className="dr-sec-line">{line}</p>
      <SummaryBar counts={c} label={aria} />
      <ul className="dr-glance-legend">
        {BUCKETS.map((b) => (
          <li key={b} className={c[b] ? "" : "zero"}>
            <i className={`dr-key b-${BUCKET_BAND[b]}`} aria-hidden="true" />
            <strong>{c[b]}</strong>
            <span>{BUCKET_LABEL[b]}</span>
          </li>
        ))}
      </ul>
      {summary.notApplicable ? <p className="dr-note">{summary.notApplicable === 1 ? "1 test did not apply to you and is" : `${summary.notApplicable} tests did not apply to you and are`} not counted.</p> : null}
      {flagged.length ? (
        <div className="dr-flagged">
          <div className="dr-flagged-title">Results to look at</div>
          <ul>
            {flagged.map((f) => (
              <li key={f.row.key}>
                <button type="button" className="dr-flagged-btn" onClick={() => jump(f.target)}>
                  <span className="dr-flagged-name">{f.row.test}</span>
                  <span className="dr-flagged-val">{f.row.resultText}{prettyUnit(f.row.unit) ? ` ${prettyUnit(f.row.unit)}` : ""}</span>
                  <RowChip row={f.row} />
                  <Icon name="chevronRight" size={13} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function Advice({ doc, advice, anyFlagged }: { doc: ReportDocument; advice: string; anyFlagged: boolean }) {
  const h = doc.header;
  return (
    <section className="dr-card dr-advice" aria-labelledby="dr-advice-title">
      <div className="dr-sec-head">
        <span className="dr-sec-icon accent" aria-hidden="true"><Icon name="user" size={16} /></span>
        <div className="dr-grow">
          <h3 id="dr-advice-title" className="dr-sec-title">Your doctor's advice</h3>
          <p className="dr-sub">{h.clinician ? `From ${h.clinician}` : "From the reviewing doctor"}{h.releasedAt ? `, ${fmtDate(h.releasedAt)}` : ""}</p>
        </div>
      </div>
      <div className="dr-advice-text">
        {advice.trim()
          ? advice.split(/\n\s*\n/).map((t, i) => <p key={i}>{t}</p>)
          : <p className="dr-muted">Advice has not been written yet. The reviewing doctor adds it before the report is released.</p>}
      </div>
      <p className="dr-sign">{doc.advice.signature}</p>
      <div className="dr-next">
        <span className="dr-next-icon" aria-hidden="true"><Icon name="arrow" size={15} /></span>
        <div>
          <h4 className="dr-next-title">Your next step</h4>
          <p>{anyFlagged
            ? "See your GP when your doctor's advice says to, and bring this report. The results marked to discuss or outside the range are the ones to talk about."
            : "No result in this report needs follow-up. Keep it for your records and share it with your GP at your next visit."}</p>
          <p className="dr-muted">Notice a new symptom, such as pain or a lump? See your GP even if your results are in range.</p>
        </div>
      </div>
    </section>
  );
}

function Footer({ doc }: { doc: ReportDocument }) {
  return (
    <footer className="dr-card dr-footer">
      <p className="dr-strong">{doc.notADiagnosis}</p>
      <p>This portal and report are not an urgent-care service. If you are unwell, contact your GP or call 112 or 999.</p>
      <p className="dr-small">{doc.ruleSet}</p>
      <p className="dr-small">Sample content. The participant and every value are fictional.</p>
    </footer>
  );
}

/* ---------- building blocks ---------- */
function Sec({ id, icon, title, headline, children, about }: { id: string; icon: GlyphName; title: string; headline: string; children: ReactNode; about?: ReactNode }) {
  return (
    <section className="dr-card dr-sec" id={id} aria-labelledby={id + "-t"} tabIndex={-1}>
      <div className="dr-sec-head">
        <span className="dr-sec-icon" aria-hidden="true"><Icon name={icon} size={16} /></span>
        <div className="dr-grow">
          <h3 id={id + "-t"} className="dr-sec-title">{title}</h3>
          <p className="dr-sec-line">{headline}</p>
        </div>
      </div>
      <div className="dr-sec-body">{children}</div>
      {about}
    </section>
  );
}

/** The report's own explanations, kept but folded away. */
function About({ items, label = "About this test" }: { items: Array<ReportSectionContent | undefined>; label?: string }) {
  const list = items.filter((x): x is ReportSectionContent => !!x);
  if (!list.length) return null;
  const many = list.length > 1;
  return (
    <details className="dr-about">
      <summary><Icon name="chevronDown" size={14} /><span>{label}</span></summary>
      <div className="dr-about-body">
        {list.map((c) => (
          <div key={c.key} className="dr-about-part">
            {many ? <h4 className="dr-about-title">{c.title}</h4> : null}
            {c.drafted ? <p className="dr-drafted">Drafted text. Precision Health to approve before use.</p> : null}
            {c.what.length ? <><h5>{REPORT_HEADINGS.what}</h5>{c.what.map((t, i) => <p key={i}>{t}</p>)}</> : null}
            {c.limitations.length ? <><h5>{REPORT_HEADINGS.limitations}</h5>{c.limitations.map((t, i) => <p key={i}>{t}</p>)}</> : null}
            {c.normal && c.normal.length ? <><h5>{REPORT_HEADINGS.normal}</h5>{c.normal.map((t, i) => <p key={i}>{t}</p>)}</> : null}
            {c.abnormal.length ? <><h5>{REPORT_HEADINGS.abnormal}</h5>{c.abnormal.map((t, i) => <p key={i}>{t}</p>)}</> : null}
            {c.link ? <p className="dr-about-link">{c.link}</p> : null}
          </div>
        ))}
      </div>
    </details>
  );
}

function valueText(r: ReportRow): string {
  const u = prettyUnit(r.unit);
  return `${r.resultText}${u ? " " + u : ""}`;
}
function scaleLabel(name: string, r: ReportRow, range: string): string {
  if (r.status !== "resulted") return `${name}: ${r.resultText}. No result is drawn on the scale.`;
  const w = chipWord(r);
  return `${name}: ${valueText(r)}${w ? `, ${w.toLowerCase()}` : ""}. Healthy range ${range}.`;
}

/** One test: name, value with unit, the flag word, and its range scale. */
function TestRow({ row, spec, rangeText, rangeLine, hint, children }: { row: ReportRow; spec: ScaleSpec | null; rangeText?: string; rangeLine?: string; hint?: ReactNode; children?: ReactNode }) {
  const v = numericValue(row);
  const range = rangeText || row.rangeText;
  const resulted = row.status === "resulted";
  return (
    <div className={"dr-test" + (resulted ? "" : " missing")}>
      <div className="dr-test-name">{row.test}{hint}</div>
      <div className="dr-test-value">
        {resulted ? <span className="dr-val"><strong>{row.resultText}</strong>{prettyUnit(row.unit) ? <span className="dr-unit">{prettyUnit(row.unit)}</span> : null}</span> : <span className="dr-missing-text">{row.resultText}</span>}
        <span className="dr-range">{rangeLine || `Healthy range: ${range}`}</span>
      </div>
      <div className="dr-test-chip"><RowChip row={row} /></div>
      <div className="dr-test-scale">
        {spec ? <RangeScale spec={spec} value={resulted ? v : null} band={row.band} label={scaleLabel(row.test, row, range)} title={resulted ? `${row.test} ${valueText(row)}` : undefined} /> : null}
        {children}
      </div>
    </div>
  );
}
function HigherIsBetter() {
  return <span className="dr-hint"><Icon name="up" size={11} stroke={2} />Higher is better</span>;
}
function LabRow({ row, ctx }: { row: ReportRow; ctx: BandCtx }) {
  const code = row.code;
  const spec = code ? analyteScale(code, numericValue(row), ctx) : null;
  return <TestRow row={named(row)} spec={spec} hint={code && directionOf(code, ctx) === "higher" ? <HigherIsBetter /> : null} />;
}

/* ---------- key metric tiles ---------- */
function Tile({ label, row, value, unit, word, band, gauge, onOpen, aria }: { label: string; row: ReportRow | undefined; value: string; unit: string; word: string; band: Band; gauge: ReactNode; onOpen: () => void; aria: string }) {
  const resulted = !!row && row.status === "resulted";
  return (
    <button type="button" className={"dr-tile" + (resulted ? "" : " missing")} onClick={onOpen} aria-label={aria}>
      <span className="dr-tile-label">{label}</span>
      <span className="dr-tile-value">{resulted ? <><strong>{value}</strong>{unit ? <span className="dr-unit">{unit}</span> : null}</> : <span className="dr-missing-text">{value}</span>}</span>
      <span className="dr-tile-chip"><FlagChip band={resulted ? band : "not_tested"} word={word} /></span>
      <span className="dr-tile-gauge" aria-hidden="true">{gauge}</span>
    </button>
  );
}
function KeyTiles({ doc, ctx, jump, sid }: { doc: ReportDocument; ctx: BandCtx; jump: (id: string) => void; sid: (k: string) => string }) {
  const bpRow = rowOf(sectionOf(doc, "blood_pressure"), "bp");
  const bmiRow = rowOf(sectionOf(doc, "bmi"), "bmi");
  const tcRow = rowOf(sectionOf(doc, "cholesterol"), "TC");
  const a1cRow = rowOf(sectionOf(doc, "hba1c"), "HBA1C");
  const heartRow = rowOf(sectionOf(doc, "cardiovascular_risk"), "cv_heart_age");
  const bp = bpValues(bpRow);
  const lvl = bp ? bpLevel(bp.sys, bp.dia) : null;
  const bpSpec = buildScale([0, 5], (x) => { const i = Math.min(4, Math.floor(x)); return { key: "l" + i, band: BP_SIGNIFICANCE[i].band }; }, lvl == null ? null : lvl + 0.5, [], true);
  const bmiV = numericValue(bmiRow), tcV = numericValue(tcRow), a1cV = numericValue(a1cRow), heart = numericValue(heartRow);
  const mini = (spec: ScaleSpec, v: number | null, r: ReportRow | undefined) => <RangeScale mini spec={spec} value={r && r.status === "resulted" ? v : null} band={r ? r.band : "not_tested"} label="" />;
  const aria = (label: string, r: ReportRow | undefined, word: string) => r && r.status === "resulted" ? `${label}: ${valueText(r)}, ${word.toLowerCase()}. Show details.` : `${label}: ${r ? r.resultText : "not available"}. Show details.`;
  const diff = heart != null ? heart - ctx.age : null;
  const heartWord = heartRow && heartRow.status === "resulted" && diff != null ? (diff === 0 ? "SAME AS YOUR AGE" : diff > 0 ? `${diff} ${diff === 1 ? "YEAR" : "YEARS"} OLDER` : `${-diff} ${diff === -1 ? "YEAR" : "YEARS"} YOUNGER`) : heartRow && heartRow.status === "pending" ? "PENDING" : "NOT CALCULATED";
  return (
    <section className="dr-tiles" aria-label="Key results">
      <Tile label="Blood pressure" row={bpRow} value={bpRow?.resultText || "Not done"} unit="mmHg" word={bpRow ? chipWord(bpRow) : "NOT DONE"} band={bpRow?.band || "not_tested"}
        gauge={mini(bpSpec, lvl == null ? null : lvl + 0.5, bpRow)} onOpen={() => jump(sid("bp"))} aria={aria("Blood pressure", bpRow, bpRow ? chipWord(bpRow) : "")} />
      <Tile label="BMI" row={bmiRow} value={bmiRow?.resultText || "Not done"} unit="" word={bmiRow ? chipWord(bmiRow) : "NOT DONE"} band={bmiRow?.band || "not_tested"}
        gauge={mini(bmiScale(bmiV), bmiV, bmiRow)} onOpen={() => jump(sid("body"))} aria={aria("BMI", bmiRow, bmiRow ? chipWord(bmiRow) : "")} />
      <Tile label="Total cholesterol" row={tcRow} value={tcRow?.resultText || "Not done"} unit="mmol/L" word={tcRow ? chipWord(tcRow) : "NOT DONE"} band={tcRow?.band || "not_tested"}
        gauge={mini(analyteScale("TC", tcV, ctx), tcV, tcRow)} onOpen={() => jump(sid("cholesterol"))} aria={aria("Total cholesterol", tcRow, tcRow ? chipWord(tcRow) : "")} />
      <Tile label="HbA1c (blood sugar)" row={a1cRow} value={a1cRow?.resultText || "Not done"} unit="mmol/mol" word={a1cRow ? chipWord(a1cRow) : "NOT DONE"} band={a1cRow?.band || "not_tested"}
        gauge={mini(analyteScale("HBA1C", a1cV, ctx), a1cV, a1cRow)} onOpen={() => jump(sid("sugar"))} aria={aria("HbA1c", a1cRow, a1cRow ? chipWord(a1cRow) : "")} />
      <Tile label="Heart age (QRISK3)" row={heartRow} value={heartRow && heartRow.status === "resulted" ? heartRow.resultText : "Not calculated"} unit={heartRow && heartRow.status === "resulted" ? "years" : ""}
        word={heartWord} band={heartRow?.band || "not_tested"}
        gauge={heart != null && heartRow?.status === "resulted" ? <HeartAgeDumbbell mini age={ctx.age} heartAge={heart} band={heartRow.band} /> : <RangeScale mini spec={{ min: 0, max: 1, zones: [], ticks: [] }} value={null} band="not_tested" label="" />}
        onOpen={() => jump(sid("heart"))} aria={heartRow && heartRow.status === "resulted" ? `Heart age ${heartRow.resultText}, your age ${ctx.age}. Show details.` : `Heart age: ${heartRow ? heartRow.resultText : "not calculated"}. Show details.`} />
    </section>
  );
}

/* ---------- topic cards ---------- */
function Cholesterol({ id, doc, ctx }: { id: string; doc: ReportDocument; ctx: BandCtx }) {
  const s = sectionOf(doc, "cholesterol");
  if (!s) return null;
  const ratio = rowOf(sectionOf(doc, "cardiovascular_risk"), "cv_tchdl");
  const rows = s.rows.concat(ratio ? [ratio] : []);
  const ratioSpec = ratio ? analyteScale("TCHDL", numericValue(ratio), ctx) : null;
  return (
    <Sec id={id} icon="flask" title="Cholesterol" headline={headlineFor(rows.map(named))} about={<About items={[s.content]} />}>
      <div className="dr-tests">
        {s.rows.map((r) => <LabRow key={r.key} row={r} ctx={ctx} />)}
      </div>
      {ratio ? (
        <div className="dr-tests dr-split">
          <TestRow row={named(ratio)} spec={ratioSpec} rangeText="less than 4 to 1" />
        </div>
      ) : null}
      <ScaleLegend />
    </Sec>
  );
}

function BloodPressure({ id, doc }: { id: string; doc: ReportDocument }) {
  const s = sectionOf(doc, "blood_pressure");
  if (!s) return null;
  const r = rowOf(s, "bp");
  const bp = bpValues(r);
  const lvl = bp ? bpLevel(bp.sys, bp.dia) : null;
  const sysBand: Band = bp ? bpCategory(bp.sys, 0).band : "not_tested";
  const diaBand: Band = bp ? bpCategory(0, bp.dia).band : "not_tested";
  const sysCat = bp ? BP_SHORT[bpLevel(bp.sys, 0)] : "";
  const diaCat = bp ? BP_SHORT[bpLevel(0, bp.dia)] : "";
  const headline = !r || !bp ? `Your blood pressure was not measured: ${r ? r.resultText.toLowerCase() : "not done"}.`
    : lvl === 0 ? `Your reading of ${r.resultText} is in the ideal band.`
    : lvl === 1 ? `Your reading of ${r.resultText} is in the mild (borderline) band.`
    : `Your reading of ${r.resultText} is in the ${BP_SHORT[lvl!].toLowerCase()} band. Have it rechecked by your GP within a month.`;
  return (
    <Sec id={id} icon="heart" title="Blood pressure" headline={headline} about={<About items={[s.content]} />}>
      <div className="dr-bp">
        <div className="dr-bp-main">
          <div className="dr-bigread">
            {r && bp ? <><strong>{r.resultText}</strong><span className="dr-unit">mmHg</span></> : <span className="dr-missing-text">{r ? r.resultText : "Not done"}</span>}
            {r ? <RowChip row={r} /> : null}
          </div>
          <div className="dr-bp-scale">
            <div className="dr-mini-head"><span>Top number (systolic)</span>{bp ? <span><strong>{bp.sys}</strong> {sysCat.toLowerCase()}</span> : null}</div>
            <RangeScale spec={bpScale("sys", bp ? bp.sys : null)} value={bp ? bp.sys : null} band={sysBand} label={bp ? `Top number ${bp.sys} mmHg, ${sysCat.toLowerCase()} band. Bands start at 120, 140, 160 and 180.` : "Top number not measured."} title={bp ? `Top number ${bp.sys}` : undefined} />
          </div>
          <div className="dr-bp-scale">
            <div className="dr-mini-head"><span>Bottom number (diastolic)</span>{bp ? <span><strong>{bp.dia}</strong> {diaCat.toLowerCase()}</span> : null}</div>
            <RangeScale spec={bpScale("dia", bp ? bp.dia : null)} value={bp ? bp.dia : null} band={diaBand} label={bp ? `Bottom number ${bp.dia} mmHg, ${diaCat.toLowerCase()} band. Bands start at 80, 90, 100 and 110.` : "Bottom number not measured."} title={bp ? `Bottom number ${bp.dia}` : undefined} />
          </div>
          <p className="dr-note">The band is set by whichever number is higher on its own scale.</p>
        </div>
        <BpLadder level={lvl} reading={bp ? `${bp.sys}/${bp.dia}` : null} />
      </div>
    </Sec>
  );
}

function HeartHealth({ id, doc, ctx }: { id: string; doc: ReportDocument; ctx: BandCtx }) {
  const s = sectionOf(doc, "cardiovascular_risk");
  if (!s) return null;
  const score = rowOf(s, "cv_score"), heart = rowOf(s, "cv_heart_age"), rr = rowOf(s, "cv_rr");
  const done = !!heart && heart.status === "resulted" && !!score && score.status === "resulted";
  const heartAge = numericValue(heart), scoreV = numericValue(score), rrV = numericValue(rr);
  const diff = heartAge != null ? heartAge - ctx.age : 0;
  const reason = heart ? heart.resultText : "Not calculated";
  const rl = reason.toLowerCase();
  const why = rl.includes("under 25") ? "Heart risk scores are not calculated for people under 25, because there is not enough data for them to be accurate."
    : rl.includes("no blood sample") ? "It needs your cholesterol results, and no blood sample was taken at your appointment."
    : rl.includes("waiting") ? "It is worked out once your cholesterol results are back from the laboratory."
    : `${reason}.`;
  const headline = done && heartAge != null
    ? `Your heart age is ${heartAge}, ${diff === 0 ? "the same as your real age" : diff > 0 ? `${diff} ${diff === 1 ? "year" : "years"} older than your real age of ${ctx.age}` : `${-diff} ${diff === -1 ? "year" : "years"} younger than your real age of ${ctx.age}`}.`
    : rl.includes("under 25") ? "Your heart age and 10-year risk were not calculated, because you are under 25."
    : rl.includes("no blood sample") ? "Your heart age and 10-year risk were not calculated, because no blood sample was taken."
    : "Your heart age and 10-year risk are not available yet.";
  const filled = scoreV != null ? Math.round(scoreV) : 0;
  const inputs = (["cv_bp", "cv_smoking", "cv_bmi", "cv_tchdl", "cv_family"] as const).map((k) => rowOf(s, k)).filter((x): x is ReportRow => !!x);
  const inputLabel: Record<string, string> = { cv_bp: "Blood pressure", cv_smoking: "Smoking", cv_bmi: "BMI", cv_tchdl: "Total to HDL ratio", cv_family: "Family history" };
  const inputValue = (r: ReportRow) => (r.status !== "resulted" ? r.resultText : r.key === "cv_family" ? (r.resultText === "TRUE" ? "Yes" : r.resultText === "FALSE" ? "No" : r.resultText) : valueText(r));
  return (
    <Sec id={id} icon="heart" title="Heart health" headline={headline} about={<About items={[s.content]} label="About heart age and QRISK3" />}>
      {done && heartAge != null ? (
        <div className="dr-heart">
          <div className="dr-panel">
            <div className="dr-panel-title">Heart age</div>
            <HeartAgeDumbbell age={ctx.age} heartAge={heartAge} band={heart!.band} />
            <p className="dr-note">If your heart age is higher than your real age, your risk is higher than average for your age.</p>
          </div>
          <div className="dr-panel dr-risk">
            <div className="dr-panel-title">10-year risk</div>
            <div className="dr-risk-body">
              <IconArray filled={filled} label={`${score!.resultText} 10-year risk: about ${filled} in 100 people with the same risk factors.`} />
              <div>
                <div className="dr-bignum">{score!.resultText}</div>
                <p className="dr-note">{filled > 0 ? `About ${filled} in 100 people` : "Fewer than 1 in 100 people"} with the same risk factors may have a heart attack or stroke in the next 10 years.</p>
              </div>
            </div>
          </div>
          {rr ? (
            <div className="dr-panel dr-wide">
              <div className="dr-tests">
                <TestRow row={{ ...rr, test: "Relative risk" }} spec={relativeRiskScale(rrV)} rangeText="less than 1.0" />
              </div>
              <p className="dr-note">Compared with a person of the same age and sex without your risk factors. 1.0 is the same risk.</p>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="dr-notcalc">
          <span className="dr-notcalc-icon" aria-hidden="true"><Icon name="info" size={16} /></span>
          <div>
            <div className="dr-strong">{heart && heart.status === "pending" ? "Not available yet" : "Not calculated"}</div>
            <p>{why}</p>
          </div>
        </div>
      )}
      <div className="dr-inputs">
        <div className="dr-panel-title">What goes into the score</div>
        <ul>
          {inputs.map((r) => (
            <li key={r.key}>
              <span className="dr-inputs-name">{inputLabel[r.key] || r.test}</span>
              <span className="dr-inputs-val">{inputValue(r)}</span>
              {r.flagWord || r.status !== "resulted" ? <RowChip row={r} /> : null}
            </li>
          ))}
        </ul>
      </div>
      {s.note ? <p className="dr-note">{s.note}</p> : null}
    </Sec>
  );
}

function Body({ id, doc, ctx }: { id: string; doc: ReportDocument; ctx: BandCtx }) {
  const s = sectionOf(doc, "bmi");
  if (!s) return null;
  const bmi = rowOf(s, "bmi"), waist = rowOf(s, "waist"), h = rowOf(s, "height"), w = rowOf(s, "weight");
  const bmiV = numericValue(bmi), waistV = numericValue(waist);
  const limit = ctx.sex === "male" ? 90 : 80;
  const waistRange = `less than ${limit} cm${ctx.sex === "male" ? " (male)" : ctx.sex === "female" ? " (female)" : ""}`;
  const stat = (r: ReportRow | undefined, label: string) => (
    <div className="dr-stat"><span className="dr-stat-label">{label}</span>{r && r.status === "resulted" ? <span className="dr-stat-val"><strong>{r.resultText}</strong><span className="dr-unit">{prettyUnit(r.unit)}</span></span> : <span className="dr-missing-text">{r ? r.resultText : "Not done"}</span>}</div>
  );
  const rows = [bmi, waist].filter((x): x is ReportRow => !!x);
  return (
    <Sec id={id} icon="user" title="Body measurements" headline={headlineFor(rows.map((r) => (r.key === "waist" ? { ...r, test: "Your waist" } : { ...r, test: "Your BMI" })))} about={<About items={[s.content]} />}>
      <div className="dr-tests">
        {bmi ? (
          <TestRow row={bmi} spec={bmiScale(bmiV)} rangeText="18 to 25">
            <CategoryKey items={BMI_CATEGORIES} current={bmiV != null && bmi.status === "resulted" ? bmiCategoryKey(bmiV) : null} label="BMI categories" />
          </TestRow>
        ) : null}
        {waist ? <TestRow row={{ ...waist, test: "Waist" }} spec={waistScale(waistV, ctx.sex)} rangeText={waistRange} /> : null}
      </div>
      <div className="dr-stats">{stat(h, "Height")}{stat(w, "Weight")}</div>
      <ScaleLegend />
    </Sec>
  );
}

function BloodSugar({ id, doc, ctx }: { id: string; doc: ReportDocument; ctx: BandCtx }) {
  const s = sectionOf(doc, "hba1c");
  if (!s) return null;
  const r = rowOf(s, "HBA1C");
  if (!r) return null;
  return (
    <Sec id={id} icon="flask" title="Blood sugar (HbA1c)" headline={headlineFor([r])} about={<About items={[s.content]} />}>
      <div className="dr-tests">
        <TestRow row={r} spec={analyteScale("HBA1C", numericValue(r), ctx)} rangeText="less than 42" rangeLine="Normal below 42. Higher risk 42 to 47.">
          <CategoryKey items={HBA1C_CATEGORIES} current={r.status === "resulted" && r.band !== "not_tested" ? r.band : null} label="HbA1c bands" />
        </TestRow>
      </div>
      <ScaleLegend />
    </Sec>
  );
}

function LabCard({ id, title, s, ctx }: { id: string; title: string; s: ReportSection; ctx: BandCtx }) {
  return (
    <Sec id={id} icon="flask" title={title} headline={headlineFor(s.rows.map(named))} about={<About items={[s.content]} />}>
      <div className="dr-tests">{s.rows.map((r) => <LabRow key={r.key} row={r} ctx={ctx} />)}</div>
      <ScaleLegend />
    </Sec>
  );
}

function CheckIcon({ r }: { r: ReportRow }) {
  const name: GlyphName = r.status === "pending" ? "clock" : r.status !== "resulted" ? "dot" : r.band === "normal" ? "check" : "alert";
  return <span className={`dr-check-icon b-${r.status === "resulted" ? r.band : "not_tested"}`} aria-hidden="true"><Icon name={name} size={13} stroke={2.2} /></span>;
}
function UrineEcg({ id, doc }: { id: string; doc: ReportDocument }) {
  const u = sectionOf(doc, "urinalysis"), e = sectionOf(doc, "ecg");
  if (!u && !e) return null;
  const urine = (u?.rows || []).map(named), ecg = (e?.rows || []).map(named);
  const item = (r: ReportRow) => (
    <li key={r.key} className={"dr-check" + (r.status === "resulted" ? "" : " missing")}>
      <CheckIcon r={r} />
      <span className="dr-check-text"><span className="dr-check-name">{r.test}</span><span className="dr-check-val">{r.resultText}{r.status === "resulted" && r.key.startsWith("urine_") ? ", normal is Nil" : ""}</span></span>
      <RowChip row={r} />
    </li>
  );
  return (
    <Sec id={id} icon="list" title="Urine test and ECG" headline={headlineFor(urine.concat(ecg))} about={<About items={[u?.content, e?.content]} label="About these tests" />}>
      <div className="dr-checkgroups">
        {urine.length ? <div><div className="dr-panel-title">Urine dipstick</div><ul className="dr-checks">{urine.map(item)}</ul></div> : null}
        {ecg.length ? <div><div className="dr-panel-title">Heart tracing</div><ul className="dr-checks">{ecg.map(item)}</ul></div> : null}
      </div>
    </Sec>
  );
}

function Cancer({ id, doc, ctx }: { id: string; doc: ReportDocument; ctx: BandCtx }) {
  const intro = sectionOf(doc, "cancer"), bowel = sectionOf(doc, "bowel"), prostate = sectionOf(doc, "prostate"), testicular = sectionOf(doc, "testicular"), breast = sectionOf(doc, "breast_cervical");
  if (!intro && !bowel && !prostate && !testicular && !breast) return null;
  const fit = rowOf(bowel, "FIT"), psa = rowOf(prostate, "PSA");
  const tests = [fit ? { ...fit, test: "Your bowel screening (FIT) result" } : null, psa ? { ...psa, test: "Your PSA result" } : null].filter((x): x is ReportRow => !!x);
  const stateLine = (r: ReportRow) => (r.status === "resulted" ? "Done." : r.status === "declined" ? "Offered, and you chose not to have it." : r.status === "pending" ? "Done. Waiting for the result." : r.status === "not_applicable" ? "Not part of your screening." : "Not done at this screening.");
  const q = (s: ReportSection | undefined, skip: RegExp) => (s ? s.questions.filter((x) => !skip.test(x.question)) : []);
  const prostateQs = q(prostate, /^(Your age|PSA test taken|PSA result interpretation)/);
  const selfQs = q(testicular, /^$/).concat(q(breast, /^$/));
  return (
    <Sec id={id} icon="shield" title="Cancer screening" headline={tests.length ? headlineFor(tests, "test") : "Your answers to the self-check questions are below."} about={<About items={[intro?.content, bowel?.content, prostate?.content, testicular?.content, breast?.content]} label="About cancer screening" />}>
      <ul className="dr-list">
        {fit ? (
          <li className="dr-item">
            <CheckIcon r={fit} />
            <div className="dr-item-body">
              <div className="dr-item-head"><span className="dr-item-name">Bowel screening (FIT test)</span></div>
              <div className="dr-item-sub">{fit.status === "resulted" ? <>Done. Result: <strong>{fit.resultText}</strong>. Normal is Negative.</> : stateLine(fit)}</div>
            </div>
            <RowChip row={fit} />
          </li>
        ) : null}
        {prostate ? (
          <li className="dr-item">
            {psa ? <CheckIcon r={psa} /> : null}
            <div className="dr-item-body">
              <div className="dr-item-head"><span className="dr-item-name">Prostate blood test (PSA)</span></div>
              {psa && psa.status === "resulted" ? (
                <div className="dr-tests dr-tests-inset">
                  <TestRow row={{ ...psa, test: `PSA for your age (${ctx.age})` }} spec={analyteScale("PSA", numericValue(psa), ctx)} />
                </div>
              ) : <div className="dr-item-sub">{psa ? stateLine(psa) : "Not done at this screening."}</div>}
              {prostateQs.length ? <ul className="dr-qa">{prostateQs.map((x) => <li key={x.question}><span>{x.question}</span><AnswerChip muted={x.answer === "Not answered"}>{x.answer}</AnswerChip></li>)}</ul> : null}
            </div>
            {psa && psa.status !== "resulted" ? <RowChip row={psa} /> : null}
          </li>
        ) : null}
        {selfQs.length ? (
          <li className="dr-item">
            <span className="dr-check-icon b-neutral" aria-hidden="true"><Icon name="user" size={13} stroke={2} /></span>
            <div className="dr-item-body">
              <div className="dr-item-head"><span className="dr-item-name">{testicular ? "Testicular self-checks" : "Breast and cervical screening"}</span></div>
              <ul className="dr-qa">{selfQs.map((x) => <li key={x.question}><span>{x.question}</span><AnswerChip muted={x.answer === "Not answered"}>{x.answer}</AnswerChip></li>)}</ul>
            </div>
          </li>
        ) : null}
      </ul>
    </Sec>
  );
}

function SupportLine({ text }: { text: string }) {
  return (
    <>
      {linkPieces(text).map((p, i) => p.kind === "web" ? <a key={i} className="ph-link" href={`https://${p.text}`} target="_blank" rel="noopener noreferrer">{p.text}</a>
        : p.kind === "email" ? <a key={i} className="ph-link" href={`mailto:${p.text}`}>{p.text}</a>
        : p.kind === "phone" ? <a key={i} className="ph-link" href={`tel:${p.text.replace(/\s/g, "")}`}>{p.text}</a>
        : <span key={i}>{p.text}</span>)}
    </>
  );
}

function Lifestyle({ id, doc, sex }: { id: string; doc: ReportDocument; sex: SexRecorded }) {
  if (!doc.lifestyle.rows.length && !doc.lifestyle.support.length) return null;
  const v = lifestyleView(doc, sex);
  const al = v.alcohol;
  const alcoholLine = al.state === "never" ? "You told us you do not drink alcohol."
    : al.state === "unanswered" ? "Not answered."
    : `About ${al.units} units a week (${al.frequency.toLowerCase()}, ${al.perOccasion} units each time). The weekly guide is ${al.guide} units${sex === "male" ? " for men" : sex === "female" ? " for women" : ""}.`;
  const alcoholPart = al.state === "never" ? "No alcohol"
    : al.state === "answered" && al.units != null ? `About ${al.units} units of alcohol a week, ${al.units > al.guide ? "above" : al.units === al.guide ? "at" : "within"} the ${al.guide} unit guide`
    : "";
  const exercisePart = v.exerciseDays != null ? `exercise on ${v.exerciseDays} of 7 days` : "";
  const summaryLine = [alcoholPart, exercisePart].filter(Boolean).join(", and ");
  const headline = !doc.lifestyle.rows.some((r) => r.answered) ? "You did not answer the lifestyle questions."
    : summaryLine ? `${summaryLine.charAt(0).toUpperCase() + summaryLine.slice(1)}.` : "Your answers to the lifestyle questions are below.";
  return (
    <Sec id={id} icon="spark" title="Lifestyle" headline={headline}
      about={doc.lifestyle.intro.length ? <details className="dr-about"><summary><Icon name="chevronDown" size={14} /><span>About these questions</span></summary><div className="dr-about-body">{doc.lifestyle.intro.map((t, i) => <p key={i}>{t}</p>)}</div></details> : null}>
      <div className="dr-life">
        <div className="dr-panel">
          <div className="dr-panel-title">Alcohol</div>
          {al.state === "answered" && al.units != null ? <GuideBar value={al.units} guide={al.guide} label={`About ${al.units} units of alcohol a week. Weekly guide ${al.guide} units.`} /> : null}
          <p className="dr-note">{alcoholLine}{al.state === "answered" ? " This is an estimate from your answers." : ""}</p>
        </div>
        <div className="dr-panel">
          <div className="dr-panel-title">Exercise</div>
          {v.exerciseDays != null ? (
            <>
              <DayDots days={v.exerciseDays} />
              <p className="dr-note"><strong className="dr-ink">{v.exerciseDays} of 7 days</strong> with 30 minutes of exercise. The report suggests 30 minutes of moderate exercise at least 3 times a week.</p>
            </>
          ) : <p className="dr-note">Not answered.</p>}
        </div>
        {v.frequencies.length ? (
          <div className="dr-panel dr-wide">
            <div className="dr-panel-title">How often</div>
            <div className="dr-freqs">
              {v.frequencies.map((f) => (
                <div key={f.key} className="dr-freq">
                  <div className="dr-freq-head"><span>{f.label}</span><strong className={f.index == null ? "dr-missing-text" : ""}>{f.answer}</strong></div>
                  {f.index != null ? <StepScale index={f.index} steps={FREQ_STEPS} label={`${f.label}: ${f.answer}, step ${f.index + 1} of 4 from never to daily.`} /> : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {v.chips.length ? (
          <div className="dr-panel dr-wide">
            <div className="dr-panel-title">Your other answers</div>
            <ul className="dr-qa">{v.chips.map((c) => <li key={c.key}><span>{c.label}</span><AnswerChip muted={!c.answered}>{c.answer}</AnswerChip></li>)}</ul>
          </div>
        ) : null}
      </div>
      {doc.lifestyle.support.length ? (
        <div className="dr-support">
          <div className="dr-panel-title">Support if you want it</div>
          <ul>
            {doc.lifestyle.support.map((s) => <li key={s.topic + s.text.slice(0, 12)}><span className="dr-support-topic">{s.topic}</span><span className="dr-support-text"><SupportLine text={s.text} /></span></li>)}
          </ul>
        </div>
      ) : null}
    </Sec>
  );
}
