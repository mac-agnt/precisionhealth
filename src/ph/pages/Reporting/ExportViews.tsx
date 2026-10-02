/* The two export previews. Both take the same frozen snapshot (exportMetrics), the same approved
   narrative and the same metadata, so the print report and the PowerPoint preview always match.
   No file is generated: the print view uses the browser print dialog (Save as PDF), and the
   PowerPoint view is an on-screen preview that is labelled as such. */
import type { ReactNode } from "react";
import { BRAND, LIMITS_DISCLAIMER, fmtDate, fmtDateTime } from "../../model";
import type { EmployerMetrics, EmployerReport } from "../../model";
import { BreakdownBlock, FunnelBars, IndicatorList, MethodologyList, NarrativeText, PAPER_PAL, ScaledSlide } from "./ReportParts";
import { sizeText } from "./disclosure";

export interface ExportInput {
  report: EmployerReport;
  metrics: EmployerMetrics;
  programmeName: string;
  clientName: string;
  approverName: string;
  threshold: number;
  snapshotAt: string;
}

const P = PAPER_PAL;

function MetaGrid({ x }: { x: ExportInput }) {
  const rows: Array<[string, ReactNode]> = [
    ["Client", x.clientName],
    ["Programme", `${x.programmeName} (${x.report.programmeId})`],
    ["Reporting period", `${fmtDate(x.report.periodStart)} to ${fmtDate(x.report.periodEnd)}`],
    ["Cohort", x.metrics.cohortLabel],
    ["Report cohort", `${sizeText(x.metrics.size, x.threshold)} released reports`],
    ["Version", `v${x.report.version}`],
    ["Clinical sign-off", x.approverName],
    ["Snapshot", fmtDateTime(x.snapshotAt)],
  ];
  return (
    <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "8px 18px", margin: "16px 0 0" }}>
      {rows.map(([k, v]) => (
        <div key={k} style={{ minWidth: 0 }}>
          <dt style={{ fontSize: 10.5, letterSpacing: ".08em", textTransform: "uppercase", color: P.faint }}>{k}</dt>
          <dd style={{ margin: "2px 0 0", fontSize: 12.5, color: P.ink, lineHeight: 1.4 }}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function PaperSection({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section style={{ marginTop: 26, paddingTop: 18, borderTop: `1px solid ${P.border}` }}>
      <h2 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 600, color: P.ink }}>{n}. {title}</h2>
      {children}
    </section>
  );
}

/** The employer report as printed. Aggregate figures only, no participant rows. */
export function PrintableReport({ x }: { x: ExportInput }) {
  const m = x.metrics;
  const att = m.funnel.find((f) => f.key === "attended");
  return (
    <article style={{ background: "#ffffff", color: P.ink, padding: "36px 40px 30px", fontFamily: "var(--ui, system-ui, sans-serif)", minWidth: 0 }}>
      <header>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: ".02em", color: BRAND.darkTeal }}>Precision Health</span>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 11, color: P.dim, border: `1px dashed ${P.border}`, borderRadius: 999, padding: "2px 9px" }}>Synthetic demo data. Fictional participants.</span>
        </div>
        <div style={{ fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: P.faint, marginTop: 18 }}>Programme report for the employer</div>
        <h1 style={{ margin: "6px 0 0", fontSize: 22, lineHeight: 1.25, fontWeight: 600, color: P.ink }}>{x.report.title}</h1>
        <MetaGrid x={x} />
      </header>
      <PaperSection n={1} title="Participation">
        <FunnelBars funnel={m.funnel} pal={P} />
        <p style={{ margin: "10px 0 0", fontSize: 11.5, color: P.dim, lineHeight: 1.5 }}>
          Overall attendance ({att ? att.n : m.attendedOverall}) is not the report cohort. Only the {m.reportEligible} released reports are counted in this report.
        </p>
      </PaperSection>
      <PaperSection n={2} title="Who is in the cohort">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 22 }}>
          {m.breakdowns.map((b) => <BreakdownBlock key={b.id} b={b} pal={P} dense />)}
        </div>
      </PaperSection>
      <PaperSection n={3} title="Clinical indicators (illustrative limits)">
        <IndicatorList items={m.clinical} threshold={x.threshold} pal={P} dense />
        <p style={{ margin: "10px 0 0", fontSize: 11, color: P.faint, lineHeight: 1.5 }}>{LIMITS_DISCLAIMER}</p>
      </PaperSection>
      <PaperSection n={4} title="Summary">
        <NarrativeText text={x.report.narrative} pal={P} size={12.5} />
        <p style={{ margin: "10px 0 0", fontSize: 11, color: P.faint }}>Narrative approved by {x.approverName}.</p>
      </PaperSection>
      <PaperSection n={5} title="Methodology and disclosure control">
        <MethodologyList items={m.methodology} pal={P} size={11.5} />
      </PaperSection>
      <footer style={{ marginTop: 26, paddingTop: 12, borderTop: `1px solid ${P.border}`, fontSize: 10.5, color: P.faint, lineHeight: 1.5 }}>
        {x.report.id} v{x.report.version}. Prepared in Pulse from the approved snapshot of {fmtDateTime(x.snapshotAt)}. Aggregate figures only; no participant-level rows or free text.
        All participants, programme activity and figures are fictional demonstration data.
      </footer>
    </article>
  );
}

/* ---- PowerPoint preview ---- */
function Slide({ n, total, title, children, footer }: { n: number; total: number; title: string; children: ReactNode; footer: string }) {
  return (
    <ScaledSlide label={`Slide ${n} of ${total}: ${title}`} background="#ffffff">
      <div style={{ position: "absolute", inset: 0, padding: "34px 52px 58px", display: "flex", flexDirection: "column", color: P.ink }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: ".04em", color: BRAND.darkTeal }}>Precision Health</div>
        <h2 style={{ margin: "6px 0 20px", fontSize: 30, fontWeight: 600, letterSpacing: "-.4px", color: P.ink }}>{title}</h2>
        <div style={{ flex: 1, minHeight: 0 }}>{children}</div>
      </div>
      <div style={{ position: "absolute", left: 52, right: 52, bottom: 20, display: "flex", gap: 16, fontSize: 12, color: P.faint }}>
        <span style={{ flex: 1, minWidth: 0 }}>{footer}</span>
        <span>Slide {n} of {total}</span>
      </div>
    </ScaledSlide>
  );
}

/** Split long narrative into slide-sized chunks so no text is cut off. */
function narrativeChunks(text: string, limit = 650): string[] {
  const paras = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  let cur = "";
  for (const p of paras) {
    if (cur && cur.length + p.length > limit) { out.push(cur); cur = ""; }
    cur = cur ? `${cur}\n\n${p}` : p;
  }
  if (cur) out.push(cur);
  return out.length ? out : [""];
}

export function SlideDeck({ x }: { x: ExportInput }) {
  const m = x.metrics;
  const chunks = narrativeChunks(x.report.narrative);
  const total = 5 + chunks.length;
  const footer = `${x.report.id} v${x.report.version}. Snapshot ${fmtDateTime(x.snapshotAt)}. Aggregate figures only. Synthetic demo data.`;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <ScaledSlide label={`Slide 1 of ${total}: title`} background={BRAND.deepTeal}>
        <div style={{ position: "absolute", inset: 0, padding: "54px 60px", display: "flex", flexDirection: "column", color: "#f3f5f4" }}>
          <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: ".05em", color: BRAND.mint }}>Precision Health</div>
          <div style={{ flex: 1 }} />
          <div style={{ fontSize: 14, letterSpacing: ".12em", textTransform: "uppercase", color: BRAND.sage }}>Programme report for {x.clientName}</div>
          <h1 style={{ margin: "10px 0 0", fontSize: 40, lineHeight: 1.15, fontWeight: 600, letterSpacing: "-.8px", maxWidth: 820 }}>{x.report.title}</h1>
          <div style={{ marginTop: 18, fontSize: 17, color: BRAND.mint, lineHeight: 1.5 }}>
            {fmtDate(x.report.periodStart)} to {fmtDate(x.report.periodEnd)}. {sizeText(m.size, x.threshold)} released reports. Version {x.report.version}, clinical sign-off by {x.approverName}.
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ fontSize: 13, color: BRAND.sage }}>PowerPoint preview, not a .pptx file. Synthetic demo data with fictional participants.</div>
        </div>
      </ScaledSlide>
      <Slide n={2} total={total} title="Participation" footer={footer}>
        <FunnelBars funnel={m.funnel} pal={P} big />
        <p style={{ margin: "18px 0 0", fontSize: 15, color: P.dim, lineHeight: 1.5 }}>
          Overall attendance is not the report cohort. Only the {m.reportEligible} released reports are counted.
        </p>
      </Slide>
      <Slide n={3} total={total} title="Who is in the cohort" footer={footer}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 30 }}>
          {m.breakdowns.map((b) => <BreakdownBlock key={b.id} b={b} pal={P} dense />)}
        </div>
      </Slide>
      <Slide n={4} total={total} title="Clinical indicators (illustrative limits)" footer={footer}>
        <IndicatorList items={m.clinical} threshold={x.threshold} pal={P} />
        <p style={{ margin: "16px 0 0", fontSize: 12.5, color: P.faint, lineHeight: 1.5 }}>{LIMITS_DISCLAIMER}</p>
      </Slide>
      {chunks.map((c, i) => (
        <Slide key={i} n={5 + i} total={total} title={chunks.length > 1 ? `Summary (${i + 1} of ${chunks.length})` : "Summary"} footer={footer}>
          <NarrativeText text={c} pal={P} size={17} />
          {i === chunks.length - 1 ? <p style={{ margin: "16px 0 0", fontSize: 13, color: P.faint }}>Narrative approved by {x.approverName}.</p> : null}
        </Slide>
      ))}
      <Slide n={total} total={total} title="Methodology and disclosure control" footer={footer}>
        <MethodologyList items={m.methodology} pal={P} size={14.5} />
      </Slide>
    </div>
  );
}
