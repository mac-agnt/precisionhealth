/* Exports: approved report snapshots with programme, period, cohort definition, version, reviewer
   and format. The print preview (browser Save as PDF) and the PowerPoint preview both read
   exportMetrics(), the frozen snapshot, so they always match. No file is produced and nothing is
   downloaded: Print opens the browser dialog and the PowerPoint view is a labelled preview. */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { PROGRAMME_BY_ID, act, exportMetrics, fmtDate, fmtDateTime, fmtDayMonth, fmtShortDateTime, staffName } from "../../model";
import type { EmployerReport, ExportRecord } from "../../model";
import { useNav } from "../../nav-context";
import { dispatch, usePersona, usePhState } from "../../store";
import { Button, Card, CardHeader, DataTable, DemoTag, EmptyState, Pill, PageHeader, RestrictedNotice, Segmented } from "../../ui";
import type { Column } from "../../ui";
import { PrintableReport, SlideDeck } from "./ExportViews";
import type { ExportInput } from "./ExportViews";
import { PAPER_PAL } from "./ReportParts";
import { sizeText } from "./disclosure";
import { EmployerSafeNote, Note, StatusPill } from "./common";

type Format = "pdf" | "pptx";
const FORMAT_LABEL: Record<Format, string> = { pdf: "Browser print preview (Save as PDF)", pptx: "PowerPoint preview (not a .pptx file)" };

/* Print only the report: hide the app, let the report flow across A4 pages, keep bar colours.
   The shared print rule makes every background transparent, so the bars are restored here. */
const PRINT_CSS = `
@media print {
  @page { size: A4; margin: 12mm; }
  html, body { height: auto !important; overflow: visible !important; background: #ffffff !important; }
  body > *:not(.phr-print-root) { display: none !important; }
  .phr-print-root { position: static !important; padding: 0 !important; width: auto !important; }
  .phr-print-root .phr-bar { background: ${PAPER_PAL.track} !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .phr-print-root .phr-bar-fill { background: ${PAPER_PAL.fill} !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .phr-print-root .phr-bar-supp { border: 1px dashed ${PAPER_PAL.border} !important; }
  .phr-print-root .phr-avoid, .phr-print-root section { break-inside: avoid; }
}`;

function isApproved(r: EmployerReport) {
  return !!r.snapshot && (r.status === "approved" || r.status === "exported");
}

export default function Exports() {
  const s = usePhState();
  const nav = useNav();
  const p = usePersona();
  const approved = s.employerReports.filter(isApproved);
  const paramId = nav.params.report;
  const selected = approved.find((r) => r.id === paramId) || approved[0];
  const canExport = p.perms.has("reports.export");
  const threshold = s.settings.suppressionThreshold;

  const columns: Column<EmployerReport>[] = [
    { key: "report", header: "Report", nowrap: false, cell: (r) => (
      <span style={{ display: "block", minWidth: 180 }}>
        <span className="ph-mono" style={{ fontSize: 11, color: "var(--faint)" }}>{r.id}</span>
        <span style={{ display: "block", color: "var(--ink)", whiteSpace: "normal" }}>{r.title}</span>
        <span className="ph-faint" style={{ display: "block", fontSize: 11, whiteSpace: "normal" }}>Programme: {PROGRAMME_BY_ID[r.programmeId].name} ({r.programmeId})</span>
      </span>
    ) },
    { key: "period", header: "Period", cell: (r) => `${fmtDayMonth(r.periodStart)} to ${fmtDate(r.periodEnd)}` },
    { key: "cohort", header: "Cohort definition", nowrap: false, cell: (r) => (
      <span style={{ display: "block", minWidth: 170, whiteSpace: "normal" }}>{r.snapshot!.metrics.cohortLabel}<span className="ph-faint" style={{ display: "block", fontSize: 11 }}>{sizeText(r.snapshot!.metrics.size, threshold)} released reports</span></span>
    ) },
    { key: "version", header: "Version", cell: (r) => `v${r.version}` },
    { key: "reviewer", header: "Approved by", cell: (r) => <span>{staffName(s, r.approvedBy)}<span className="ph-faint" style={{ display: "block", fontSize: 11 }}>{r.approvedAt ? fmtShortDateTime(r.approvedAt) : ""}</span></span> },
    { key: "formats", header: "Formats", cell: (r) => <Formats records={s.exports.filter((e) => e.reportId === r.id && e.version === r.version)} /> },
    { key: "state", header: "State", cell: (r) => <StatusPill status={r.status} /> },
  ];

  return (
    <div className="ph-page">
      <PageHeader title="Exports" sub="Approved report snapshots only. The print preview and the PowerPoint preview read the same frozen snapshot, so their numbers always match."
        actions={<DemoTag>Synthetic data</DemoTag>} />
      <div className="ph-stack">
        {!approved.length ? <NoSnapshot /> : (
          <>
            <Card pad={false}>
              <div style={{ padding: "16px 18px 6px" }}>
                <CardHeader title="Approved snapshots" sub="Select a snapshot to preview it." />
              </div>
              <DataTable rows={approved} columns={columns} rowKey={(r) => r.id} selectedKey={selected?.id || null} minWidth={860} caption="Approved employer report snapshots"
                onRowClick={(r) => nav.setParams({ report: r.id })} />
            </Card>
            {selected ? (canExport ? <Preview key={selected.id} r={selected} /> : (
              <RestrictedNotice title="Export previews are limited to reporting roles">
                {p.name} ({p.roleLabel}) can see which snapshots are approved. Previews and export records are available to programme reporting, programme oversight and clinical review roles.
              </RestrictedNotice>
            )) : null}
            {canExport ? <HistoryCard /> : null}
          </>
        )}
      </div>
    </div>
  );
}

function Formats({ records }: { records: ExportRecord[] }) {
  const has = (f: Format) => records.some((r) => r.format === f);
  return (
    <span className="ph-wrap" style={{ gap: 6 }}>
      <Pill tone={has("pdf") ? "ok" : "neutral"} icon={has("pdf") ? "check" : "dot"}>PDF print</Pill>
      <Pill tone={has("pptx") ? "ok" : "neutral"} icon={has("pptx") ? "check" : "dot"}>PowerPoint</Pill>
    </span>
  );
}

/* ---- honest empty state: nothing is approved yet ---- */
function NoSnapshot() {
  const s = usePhState();
  const nav = useNav();
  const first = s.employerReports[0];
  return (
    <Card pad={false}>
      <EmptyState title="No approved snapshot yet" icon="print"
        action={first ? <Button variant="primary" icon="edit" onClick={() => nav.go({ page: "Reporting", tab: "report-builder", params: { report: first.id } })}>Open Report Builder</Button> : undefined}>
        Exports come only from an approved snapshot. {s.employerReports.length
          ? s.employerReports.map((r) => `${r.id} is ${r.status === "draft" ? "a draft awaiting disclosure review" : r.status === "reviewed" ? "awaiting clinician approval" : r.status}`).join("; ") + "."
          : "No employer report has been drafted."} Complete the disclosure review and clinician approval in the Report Builder first.
      </EmptyState>
    </Card>
  );
}

/* ---- preview area: same snapshot, two formats ---- */
function Preview({ r }: { r: EmployerReport }) {
  const s = usePhState();
  const nav = useNav();
  const [format, setFormat] = useState<Format>(nav.params.format === "pptx" ? "pptx" : "pdf");
  const m = exportMetrics(s, r);
  const prog = PROGRAMME_BY_ID[r.programmeId];
  const x: ExportInput = {
    report: r, metrics: m, programmeName: prog.name, clientName: prog.clientName, approverName: staffName(s, r.approvedBy),
    threshold: s.settings.suppressionThreshold, snapshotAt: r.snapshot ? r.snapshot.at : r.dataAsOf,
  };
  const records = s.exports.filter((e) => e.reportId === r.id && e.version === r.version);
  const rec = (f: Format) => records.find((e) => e.format === f);
  const choose = (f: Format) => { setFormat(f); nav.setParams({ ...nav.params, report: r.id, format: f }); };
  const printPdf = () => {
    const res = dispatch(act.createExport(r.id, "pdf"));
    if (res.ok) window.setTimeout(() => window.print(), 60);
  };
  return (
    <Card>
      <CardHeader title={`Preview: ${r.title}`}
        sub={`Snapshot ${fmtDateTime(x.snapshotAt)}. ${sizeText(m.size, x.threshold)} released reports. Version ${r.version}, approved by ${x.approverName}.`}
        right={<Segmented label="Preview format" value={format} onChange={choose} options={[{ id: "pdf", label: "Print preview (PDF)" }, { id: "pptx", label: "PowerPoint preview" }]} />} />
      {format === "pdf" ? (
        <>
          <div className="ph-row-flex" style={{ gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
            <Button variant="primary" icon="print" onClick={printPdf}>Print or Save as PDF</Button>
            <span className="ph-dim ph-grow" style={{ fontSize: 12, lineHeight: 1.45, minWidth: 220 }}>Opens the browser print dialog. Choose Save as PDF there. Pulse does not generate a file in this demo.</span>
            {rec("pdf") ? <Pill tone="ok" icon="check">Recorded {fmtDateTime(rec("pdf")!.createdAt)} by {staffName(s, rec("pdf")!.createdBy)}</Pill> : null}
          </div>
          <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid var(--border-strong)", maxWidth: 860, margin: "0 auto", boxShadow: "0 18px 50px rgba(0,0,0,.28)" }}>
            <PrintableReport x={x} />
          </div>
          <PrintPortal x={x} />
        </>
      ) : (
        <>
          <div className="ph-row-flex" style={{ gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
            <Pill tone="info" icon="info">PowerPoint preview, not a .pptx file</Pill>
            <Button variant={rec("pptx") ? "secondary" : "primary"} icon="check" disabled={!!rec("pptx")} onClick={() => dispatch(act.createExport(r.id, "pptx"))}>
              {rec("pptx") ? "PowerPoint preview recorded" : "Record PowerPoint preview"}
            </Button>
            <span className="ph-dim ph-grow" style={{ fontSize: 12, lineHeight: 1.45, minWidth: 220 }}>
              {rec("pptx") ? `Recorded ${fmtDateTime(rec("pptx")!.createdAt)} by ${staffName(s, rec("pptx")!.createdBy)}. ` : ""}No .pptx file is created or downloaded. The slides below are an on-screen preview.
            </span>
          </div>
          <SlideDeck x={x} />
        </>
      )}
      <Note icon="shield">
        Both formats read the same snapshot ({fmtDateTime(x.snapshotAt)}): the same cohort of {sizeText(m.size, x.threshold)}, the same funnel, the same suppressed cells and the same approved narrative.
      </Note>
      <div style={{ marginTop: 12 }}><EmployerSafeNote /></div>
    </Card>
  );
}

/** A print-only copy of the report placed directly under body, so the browser prints just the report. */
function PrintPortal({ x }: { x: ExportInput }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => { setHost(document.body); }, []);
  if (!host) return null;
  return createPortal(
    <div className="ph-printable ph-print-only phr-print-root" aria-hidden="true">
      <style>{PRINT_CSS}</style>
      <PrintableReport x={x} />
    </div>,
    host,
  );
}

/* ---- export history ---- */
function HistoryCard() {
  const s = usePhState();
  const rows = s.exports.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const columns: Column<ExportRecord>[] = [
    { key: "id", header: "Record", cell: (e) => <span className="ph-mono" style={{ fontSize: 11.5 }}>{e.id}</span> },
    { key: "report", header: "Report", cell: (e) => `${e.reportId} v${e.version}` },
    { key: "format", header: "Format", cell: (e) => FORMAT_LABEL[e.format] },
    { key: "by", header: "Created by", cell: (e) => staffName(s, e.createdBy) },
    { key: "at", header: "Created", cell: (e) => fmtDateTime(e.createdAt) },
  ];
  return (
    <Card pad={false}>
      <div style={{ padding: "16px 18px 6px" }}>
        <CardHeader title="Export records" sub="Each preview is recorded once per report version. Nothing was sent or downloaded." right={<DemoTag>Simulated</DemoTag>} />
      </div>
      <DataTable rows={rows} columns={columns} rowKey={(e) => e.id} minWidth={600} caption="Export records"
        empty={<div style={{ padding: "4px 18px 16px" }}><Note>No previews recorded yet. Use Print or Save as PDF, or Record PowerPoint preview, above.</Note></div>} />
    </Card>
  );
}
