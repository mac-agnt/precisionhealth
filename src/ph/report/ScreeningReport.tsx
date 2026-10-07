/* The participant's Health Screening Report, rendered from reportDocument(). One component is
   used everywhere the report appears: the participant portal, the clinician's preview before
   release, and the printable copy. It follows the structure of Precision Health's own report:
   cover and advice, lifestyle questionnaire, then one page per topic with "What is tested",
   "Limitations", "What should I do" and a results table with a flag word. The page is paper
   white in every theme because it is the document the participant keeps. */
import type { CSSProperties, ReactNode } from "react";
import { BRAND, reportDocument } from "../model";
import type { Id, ReportDocument, ReportRow, ReportSection } from "../model";
import { usePhState } from "../store";
import { BAND_LOOK } from "./bands";

const INK = "#1F2A28";
const DIM = "#55625F";
const RULE = "#D5DEDC";
const TEAL = BRAND.darkTeal;

export function useReportDocument(episodeId: Id | null | undefined, versionId?: Id | null): ReportDocument | null {
  const state = usePhState();
  return episodeId ? reportDocument(state, episodeId, versionId || undefined) : null;
}

const page: CSSProperties = {
  background: "#FFFFFF", color: INK, borderRadius: 4, padding: "36px 40px 28px", boxShadow: "0 1px 2px rgba(15,30,28,0.12)",
  fontFamily: "'Geist', system-ui, sans-serif", fontSize: 13.5, lineHeight: 1.6, maxWidth: 820, margin: "0 auto",
};
const h2: CSSProperties = { fontSize: 19, fontWeight: 650, margin: "0 0 12px", color: TEAL, letterSpacing: "-0.01em" };
const h3: CSSProperties = { fontSize: 13.5, fontWeight: 650, margin: "16px 0 4px", color: INK };
const p: CSSProperties = { margin: "0 0 8px" };

function Page({ children, footer, compact }: { children: ReactNode; footer?: ReactNode; compact?: boolean }) {
  return (
    <section className="phrep-page" style={{ ...page, padding: compact ? "22px 18px 18px" : page.padding }}>
      {children}
      {footer ? <div style={{ marginTop: 22, paddingTop: 10, borderTop: `1px solid ${RULE}`, fontSize: 11, color: DIM, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>{footer}</div> : null}
    </section>
  );
}

function FlagCell({ r }: { r: ReportRow }) {
  if (r.status !== "resulted") {
    const word = r.status === "pending" ? "PENDING" : r.status === "declined" ? "DECLINED" : r.status === "not_applicable" ? "N/A" : "NOT DONE";
    return <span style={{ display: "inline-block", padding: "1px 7px", borderRadius: 3, fontSize: 11, fontWeight: 650, letterSpacing: "0.03em", background: BAND_LOOK.not_tested.fill, color: BAND_LOOK.not_tested.ink }}>{word}</span>;
  }
  if (!r.flagWord) return null;
  const look = BAND_LOOK[r.band];
  return <span title={look.label} style={{ display: "inline-block", padding: "1px 7px", borderRadius: 3, fontSize: 11, fontWeight: 650, letterSpacing: "0.03em", background: look.fill, color: look.ink }}>{r.flagWord}</span>;
}

function ResultsTable({ rows }: { rows: ReportRow[] }) {
  if (!rows.length) return null;
  const th: CSSProperties = { textAlign: "left", fontWeight: 650, fontSize: 11.5, color: DIM, padding: "6px 8px", borderBottom: `1.5px solid ${TEAL}` };
  const td: CSSProperties = { padding: "7px 8px", borderBottom: `1px solid ${RULE}`, verticalAlign: "top" };
  return (
    <div style={{ overflowX: "auto", marginTop: 12 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 460 }}>
        <thead>
          <tr><th style={th}>Test</th><th style={th}>Your Result</th><th style={th}></th><th style={th}>Normal Range</th><th style={th}>Units</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td style={{ ...td, fontWeight: 550 }}>{r.test}</td>
              <td style={{ ...td, fontVariantNumeric: "tabular-nums", color: r.status === "resulted" ? INK : DIM, fontStyle: r.status === "resulted" ? "normal" : "italic" }}>{r.resultText}</td>
              <td style={td}><FlagCell r={r} /></td>
              <td style={{ ...td, color: DIM }}>{r.rangeText}</td>
              <td style={{ ...td, color: DIM }}>{r.unit}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function QaTable({ rows, head = "Question" }: { rows: Array<{ question: string; answer: string }>; head?: string }) {
  if (!rows.length) return null;
  const td: CSSProperties = { padding: "6px 8px", borderBottom: `1px solid ${RULE}`, verticalAlign: "top" };
  return (
    <div style={{ overflowX: "auto", marginTop: 12 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr>
            <th style={{ ...td, textAlign: "left", fontSize: 11.5, color: DIM, borderBottom: `1.5px solid ${TEAL}` }}>{head}</th>
            <th style={{ ...td, textAlign: "left", fontSize: 11.5, color: DIM, borderBottom: `1.5px solid ${TEAL}`, width: "34%" }}>Your Answer</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}><td style={td}>{r.question}</td><td style={{ ...td, fontWeight: 550, color: r.answer === "Not answered" ? DIM : INK }}>{r.answer}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TopicPage({ s, compact, footer }: { s: ReportSection; compact?: boolean; footer: ReactNode }) {
  const c = s.content;
  return (
    <Page compact={compact} footer={footer}>
      <h2 style={h2}>{s.title}</h2>
      {c.drafted ? <div style={{ fontSize: 11, color: "#7A5B00", background: "#FFF6CC", padding: "4px 8px", borderRadius: 3, marginBottom: 10 }}>Drafted text. Precision Health to approve before use.</div> : null}
      {c.what.length ? <><div style={h3}>What is tested and why is it important?</div>{c.what.map((t, i) => <p key={i} style={p}>{t}</p>)}</> : null}
      {c.limitations.length ? <><div style={h3}>What are the limitations?</div>{c.limitations.map((t, i) => <p key={i} style={p}>{t}</p>)}</> : null}
      {c.normal && c.normal.length ? <><div style={h3}>What is a normal result?</div>{c.normal.map((t, i) => <p key={i} style={p}>{t}</p>)}</> : null}
      {c.abnormal.length ? <><div style={h3}>What should I do about abnormal results?</div>{c.abnormal.map((t, i) => <p key={i} style={p}>{t}</p>)}</> : null}
      {c.link ? <p style={{ ...p, color: TEAL, fontWeight: 550 }}>{c.link}</p> : null}
      {s.table ? (
        <table style={{ borderCollapse: "collapse", fontSize: 12.5, margin: "10px 0 4px" }}>
          <thead><tr><th style={{ textAlign: "left", padding: "4px 14px 4px 0", color: DIM, fontWeight: 650 }}>Blood Pressure Reading</th><th style={{ textAlign: "left", padding: "4px 0", color: DIM, fontWeight: 650 }}>Significance</th></tr></thead>
          <tbody>{s.table.map((t) => <tr key={t.reading}><td style={{ padding: "3px 14px 3px 0" }}>{t.reading}</td><td style={{ padding: "3px 0" }}>{t.significance}</td></tr>)}</tbody>
        </table>
      ) : null}
      <QaTable rows={s.questions} />
      <ResultsTable rows={s.rows} />
      {s.note ? <p style={{ ...p, marginTop: 10, fontSize: 11.5, color: DIM }}>{s.note}</p> : null}
    </Page>
  );
}

export interface ScreeningReportProps {
  doc: ReportDocument;
  /** Advice typed in the clinician's editor but not yet saved, shown in the preview. */
  draftAdvice?: string;
  /** Tighter padding for narrow screens such as the 375px portal. */
  compact?: boolean;
  /** Only the first page (cover and advice), for small previews. */
  coverOnly?: boolean;
}

export function ScreeningReport({ doc, draftAdvice, compact, coverOnly }: ScreeningReportProps) {
  const h = doc.header;
  const advice = draftAdvice !== undefined ? draftAdvice : doc.advice.text;
  const status =
    doc.versionStatus === "released" ? `Report v${h.version} · released ${h.releasedText}` :
    doc.versionStatus === "superseded" ? `Report v${h.version} · superseded by a later version` :
    doc.versionStatus === "preview" ? "Preview · not released" : `Report v${h.version} · draft, not released`;
  const footer = <><span>{BRAND.legalName} · {BRAND.email}</span><span>{h.name} · {h.screeningRef} · {status}</span></>;
  const sections = doc.sections.filter((s) => s.rows.length || s.questions.length || s.key === "cancer");
  return (
    <div className="phrep" style={{ display: "grid", gap: 16 }}>
      <Page compact={compact} footer={footer}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 18 }}>
          <img src={BRAND.logoLightPath} alt="Precision Health" style={{ height: 46, width: "auto" }} onError={(e) => { (e.currentTarget as HTMLImageElement).src = BRAND.logoPath; }} />
          <div style={{ textAlign: "right", fontSize: 11, color: DIM }}>{doc.versionStatus === "released" ? "Final report" : status}<br />Sample content · fictional participant</div>
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 650, margin: "0 0 14px", textAlign: "center", color: INK, letterSpacing: "-0.01em" }}>{h.title}</h1>
        <table style={{ borderCollapse: "collapse", fontSize: 13.5, marginBottom: 16 }}>
          <tbody>
            {([["Appointment Date", h.appointmentText], ["Name", h.name], ["Date of Birth", h.dobText], ["Unique ID", h.screeningRef], ["Programme", h.programme]] as const).map(([k, v]) => (
              <tr key={k}><td style={{ padding: "3px 28px 3px 0", color: DIM }}>{k}</td><td style={{ padding: "3px 0", fontWeight: 550 }}>{v}</td></tr>
            ))}
          </tbody>
        </table>
        {doc.intro.map((t, i) => <p key={i} style={p}>{t}</p>)}
        <h2 style={{ ...h2, marginTop: 18 }}>Advice</h2>
        {advice.trim()
          ? advice.split(/\n\s*\n/).map((t, i) => <p key={i} style={p}>{t}</p>)
          : <p style={{ ...p, color: DIM, fontStyle: "italic" }}>Advice has not been written yet. It is added by the reviewing doctor before release.</p>}
        <p style={{ ...p, fontWeight: 600, marginTop: 10 }}>{doc.advice.signature}</p>
      </Page>
      {coverOnly ? null : (
        <>
          <Page compact={compact} footer={footer}>
            <h2 style={h2}>Lifestyle Questionnaire</h2>
            {doc.lifestyle.intro.map((t, i) => <p key={i} style={p}>{t}</p>)}
            {doc.lifestyle.support.map((s) => <p key={s.topic + s.text.slice(0, 12)} style={p}><strong>{s.topic}:</strong> {s.text}</p>)}
            <QaTable rows={doc.lifestyle.rows.map((r) => ({ question: r.question, answer: r.answer }))} />
          </Page>
          {sections.map((s) => s.key === "cancer"
            ? <Page key={s.key} compact={compact} footer={footer}><h2 style={h2}>{s.title}</h2>{s.content.what.map((t, i) => <p key={i} style={p}>{t}</p>)}{s.content.link ? <p style={{ ...p, color: TEAL }}>{s.content.link}</p> : null}</Page>
            : <TopicPage key={s.key} s={s} compact={compact} footer={footer} />)}
          <Page compact={compact}>
            <p style={{ ...p, fontWeight: 600 }}>{doc.notADiagnosis}</p>
            <p style={{ ...p, fontSize: 11.5, color: DIM }}>This portal and report are not an urgent-care service. If you are unwell, contact your GP or call 112 or 999.</p>
            <p style={{ ...p, fontSize: 11.5, color: DIM }}>{doc.ruleSet}</p>
          </Page>
        </>
      )}
    </div>
  );
}
