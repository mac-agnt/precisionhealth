/* Results, Imports: laboratory batches from Eurofins (CSV, simulated). Batch list, the safe
   column mapping prepared by Lab Reconciliation, a validation summary derived from the rows,
   accepted, duplicate and quarantined rows, the human reconciliation drawer and the bundled
   sample re-upload that proves nothing is imported twice.
   Deep links: #/Results/imports?batch=BATCH-20261002-01&row=BATCH-20261002-01-R010 */
import { useState } from "react";
import type { ReactNode } from "react";
import {
  ANALYTES, STORY_DEFS, act, batchList, batchRows, batchStats, fmtDateTime, fmtNumericDate, fmtShortDateTime, fmtTime, fmtWhen, persona,
  reuploadPreview, staffName,
} from "../../model";
import type { BatchStats, ImportRow } from "../../model";
import { dispatch, usePhState } from "../../store";
import { useNav } from "../../nav-context";
import {
  Button, Card, CardHeader, Chip, DataTable, DemoTag, EmptyState, EntityLink, Icon, Kpi, KpiStrip, PALETTE, PageHeader, Pill, RestrictedNotice, SearchBox,
  Split, Stacked,
} from "../../ui";
import type { Column } from "../../ui";
import { Banner, Count, HiddenValue, Kv, QUARANTINE_LABEL, RowStatePill, useWidth } from "./shared";
import { checkLabel, openUnitIssues, participantCheck, rowIndex, validationSummary } from "./select";
import type { CheckStatus } from "./select";
import { RowDrawer } from "./RowDrawer";

type RowFilter = "all" | "imported" | "resolved" | "duplicate" | "quarantined" | "unit" | "dob";
/** Columns in the bundled Eurofins CSV, in file order. */
const CSV_COLUMNS = ["Specimen ID", "Surname/Initial", "DOB", "Analyte", "Result", "Unit", "Result date"] as const;
const FILTERS: RowFilter[] = ["all", "imported", "resolved", "duplicate", "quarantined", "unit", "dob"];

export default function Imports() {
  const state = usePhState();
  const p = persona(state);
  if (!p.perms.has("imports.view")) {
    return (
      <div className="ph-page phr">
        <PageHeader title="Imports" sub="Laboratory batches and their reconciliation." />
        <RestrictedNotice title="Laboratory imports are restricted for this role">
          {p.name} ({p.roleLabel}) does not have import access. Operations, programme oversight, the nursing lead and the clinical reviewer can open import batches.
        </RestrictedNotice>
      </div>
    );
  }
  return <ImportsWorkspace />;
}

function ImportsWorkspace() {
  const state = usePhState();
  const nav = useNav();
  const batches = batchList(state);
  const fallback = (batches.find((b) => b.quarantined > 0) || batches[0]).batch.id;
  const batchId = nav.params.batch && batches.some((b) => b.batch.id === nav.params.batch) ? nav.params.batch : fallback;
  const stats = batchStats(state, batchId);
  const rowParam = nav.params.row && rowIndex(state).has(nav.params.row) ? nav.params.row : null;
  const [filter, setFilter] = useState<RowFilter>(FILTERS.find((f) => f === nav.params.filter) || "all");
  const [hidePreview, setHidePreview] = useState<string | null>(null);
  const openRow = (id: string) => nav.setParams({ ...nav.params, batch: batchId, row: id });
  const closeRow = () => { const next: Record<string, string> = { ...nav.params, batch: batchId }; delete next.row; nav.setParams(next); };
  const selectBatch = (id: string) => { setFilter("all"); nav.setParams({ batch: id }); };
  const pv = state.importPreview;
  const showPv = !!pv && hidePreview !== pv.loadedAt + pv.committed;

  return (
    <div className="ph-page phr">
      <PageHeader title="Imports"
        sub="Eurofins laboratory results arrive as a CSV over FTP (simulated here). Each row is one observation: rows, specimens and people are counted separately."
        actions={<>
          <DemoTag>Simulated source</DemoTag>
          <Button icon="refresh" onClick={() => dispatch(act.loadSampleCsv(batchId))} title={`Re-reads the bundled synthetic file for ${batchId}. No real file is uploaded.`}>Load sample Eurofins CSV</Button>
        </>} />

      <KpiStrip>
        <Kpi label="Observation rows" value={<Count n={stats.rows} unit="rows" />} sub={`In ${batchId}`} icon="list" />
        <Kpi label="Imported" value={<Count n={stats.imported} unit="rows" />} sub={stats.resolved ? `Includes ${stats.resolved} resolved by a person` : "Accepted on arrival"} icon="check" />
        <Kpi label="Duplicates skipped" value={<Count n={stats.duplicates} unit="rows" />} sub="Already imported, not created twice" icon="layers" />
        <Kpi label="Quarantined" value={<Count n={stats.quarantined} unit="rows" />} sub="Held for explicit human resolution" icon="alert" onClick={() => setFilter("quarantined")} hint="Show the quarantined rows" />
        <Kpi label="Specimen records" value={<Count n={stats.specimens} unit="specimens" />} sub="Labelled separately from rows and people" icon="flask" />
      </KpiStrip>

      {stats.quarantined ? (
        <div style={{ marginTop: 12 }}>
          <Banner tone="warn" icon="alert" action={<Button size="sm" onClick={() => setFilter("quarantined")}>Show held rows</Button>}>
            <b>{stats.quarantined === 1 ? "1 row needs" : `${stats.quarantined} rows need`} identity resolution.</b> Rows with conflicting identifiers are never attached automatically. Review each against the laboratory source before resolving.
          </Banner>
        </div>
      ) : null}
      {showPv && pv ? <div style={{ marginTop: 12 }}><ReuploadCard onHide={() => setHidePreview(pv.loadedAt + pv.committed)} /></div> : null}

      <div style={{ marginTop: 14 }}>
        <Split
          main={<><BatchSummary s={stats} /><Exceptions batchId={batchId} onOpen={openRow} /></>}
          side={<BatchListCard batches={batches} selected={batchId} onSelect={selectBatch} />}
        />
      </div>
      <div style={{ marginTop: 14 }}>
        <Split even main={<MappingCard batchId={batchId} />} side={<ValidationCard batchId={batchId} onFilter={setFilter} />} />
      </div>
      <div style={{ marginTop: 14 }}>
        <RowsCard batchId={batchId} filter={filter} setFilter={setFilter} onOpen={openRow} selected={rowParam} />
      </div>
      <RowDrawer rowId={rowParam} onClose={closeRow} />
    </div>
  );
}

/* ---- re-upload check from the bundled sample ---- */
function ReuploadCard({ onHide }: { onHide: () => void }) {
  const state = usePhState();
  const pv = state.importPreview!;
  const live = reuploadPreview(state, pv.batchId);
  const c = pv.committed ? { alreadySeen: pv.alreadySeen, unresolved: pv.unresolved, newRows: pv.newRows } : live;
  const total = c.alreadySeen + c.unresolved + c.newRows;
  return (
    <Card>
      <CardHeader title={<>Re-upload check: <span className="phr-mono" style={{ fontSize: 12.5 }}>{pv.filename}</span></>}
        sub={`Bundled synthetic content loaded ${fmtWhen(pv.loadedAt, state.clock.nowUtc)} for ${pv.batchId}. No real file is uploaded. ${pv.committed ? "These are the counts that were processed." : "Counts are derived from the current state."}`}
        right={<><DemoTag>Sample file</DemoTag>{pv.committed ? <Pill tone="ok" icon="check">Processed</Pill> : <Pill tone="info" icon="eye">Preview</Pill>}</>} />
      <Stacked total={total} segments={[
        { label: "Already seen", value: c.alreadySeen, color: PALETTE[1] },
        { label: "Still unresolved", value: c.unresolved, color: "var(--warn)" },
        { label: "New observations", value: c.newRows, color: "var(--accent)" },
      ]} />
      <div className="phr-row" style={{ marginTop: 12, justifyContent: "space-between" }}>
        <div className="phr-note ph-grow" style={{ minWidth: 220 }}>
          {c.alreadySeen} rows were already imported, skipped as duplicates or resolved, so they are not imported again. {c.unresolved} rows stay quarantined and are not committed. Confirming commits only accepted or resolved rows that are new: {c.newRows}.
        </div>
        <div className="phr-row" style={{ flex: "none" }}>
          {pv.committed ? <span className="phr-sub">No observations created twice.</span> : <Button variant="primary" icon="check" onClick={() => dispatch(act.commitImportPreview())}>Commit accepted rows ({c.newRows} new)</Button>}
          <Button variant="ghost" onClick={onHide}>Hide</Button>
        </div>
      </div>
    </Card>
  );
}

/* ---- the selected batch ---- */
function BatchSummary({ s }: { s: BatchStats }) {
  const state = usePhState();
  const v = validationSummary(state, s.batch.id);
  return (
    <Card>
      <CardHeader eyebrow={`${s.batch.lab}, ${s.partial ? "partially imported" : "imported in full"}`} title={<span className="phr-mono" style={{ fontSize: 14 }}>{s.batch.id}</span>}
        sub={<span className="phr-mono" style={{ fontSize: 11.5 }}>{s.batch.filename}</span>}
        right={<>
          {s.partial ? <Pill tone="warn" icon="alert">{s.quarantined} rows held</Pill> : <Pill tone="ok" icon="check">Complete</Pill>}
          <Button size="sm" variant="ghost" icon="list" onClick={() => document.getElementById("phr-mapping")?.scrollIntoView({ behavior: "smooth", block: "start" })}>View column mapping</Button>
        </>} />
      <Stacked total={s.rows} segments={[
        { label: "Imported on arrival", value: v.importedOnArrival, color: "var(--accent)" },
        { label: "Resolved by a person", value: v.resolved, color: "var(--ok)" },
        { label: "Duplicates skipped", value: s.duplicates, color: PALETTE[1] },
        { label: "Quarantined", value: s.quarantined, color: "var(--warn)" },
      ]} />
      <div className="phr-sub" style={{ marginTop: 8 }}>{s.rows} observation rows across {s.specimens} specimen records. These are rows, not {s.rows} people.</div>
      <div style={{ marginTop: 10 }}>
        <Kv items={[
          { k: "Received", v: fmtDateTime(s.batch.receivedAt) },
          { k: "Processed", v: fmtDateTime(s.batch.processedAt) },
          { k: "Observations created", v: <span className="ph-num">{s.observations}</span> },
          { k: "Source", v: s.batch.source, wide: true },
          { k: "Note", v: s.batch.note, wide: true },
        ]} />
      </div>
    </Card>
  );
}

function Exceptions({ batchId, onOpen }: { batchId: string; onOpen: (id: string) => void }) {
  const state = usePhState();
  const p = persona(state);
  const st = STORY_DEFS.find((x) => x.id === "ST-01")!;
  const rows = batchRows(state, batchId).filter((r) => r.quarantine);
  const units = openUnitIssues(state).filter((u) => u.rowId && u.rowId.startsWith(batchId + "-"));
  if (!rows.length && !units.length) {
    return <Card><CardHeader title="Needs a person" sub="Nothing in this batch is waiting for a decision." /></Card>;
  }
  const open = rows.filter((r) => r.state === "quarantined").length;
  return (
    <Card pad={false}>
      <div style={{ padding: "14px 16px 4px" }}>
        <CardHeader title="Needs a person"
          sub={`Identity exceptions are held for explicit human resolution with two identifiers and a reason. Owner ${staffName(state, st.ownerId)}, due ${fmtWhen(st.dueAt!, state.clock.nowUtc)}; ${staffName(state, st.secondaryOwnerId)} reviews clinically afterwards.`}
          right={open ? <Pill tone="warn" icon="alert">{open} open</Pill> : <Pill tone="ok" icon="check">All resolved</Pill>} />
      </div>
      <div className="phr-list" style={{ padding: "0 8px 10px" }}>
        {rows.map((r) => (
          <button key={r.id} type="button" className="phr-item" onClick={() => onOpen(r.id)}>
            <div className="ph-row-flex" style={{ gap: 8, flexWrap: "wrap" }}>
              <span className="phr-mono" style={{ color: "var(--ink)" }}>{r.id.replace(batchId + "-", "")}, line {r.line}</span>
              <Pill tone="warn" icon="alert">{QUARANTINE_LABEL[r.quarantine!.reason]}</Pill>
              <span className="ph-grow" />
              <RowStatePill state={r.state} />
            </div>
            <div className="phr-sub" style={{ marginTop: 4 }}>
              Specimen <span className="phr-mono">{r.specimenKey}</span>, {ANALYTES[r.analyteCode].name}.{" "}
              {r.resolution ? `Resolved by ${staffName(state, r.resolution.by)} ${fmtWhen(r.resolution.at, state.clock.nowUtc)}.` : r.quarantine!.candidateEpisodeIds.length === 0 ? "No collection record matched." : r.quarantine!.candidateEpisodeIds.length === 1 ? `One candidate: ${r.quarantine!.candidateEpisodeIds[0]}.` : `${r.quarantine!.candidateEpisodeIds.length} candidate episodes.`}
              {r.state === "quarantined" ? (p.perms.has("identity.resolve") ? " Open to resolve." : " Open to view.") : ""}
            </div>
          </button>
        ))}
        {units.map((u) => (
          <button key={u.rowId!} type="button" className="phr-item" onClick={() => onOpen(u.rowId!)}>
            <div className="ph-row-flex" style={{ gap: 8, flexWrap: "wrap" }}>
              <span className="phr-mono" style={{ color: "var(--ink)" }}>{u.rowId!.replace(batchId + "-", "")}{rowIndex(state).get(u.rowId!) ? `, line ${rowIndex(state).get(u.rowId!)!.line}` : ""}</span>
              <Pill tone="info" icon="info">Source unit to confirm</Pill>
              <span className="ph-grow" />
              <Pill tone="neutral" icon="check">Imported, episode held</Pill>
            </div>
            <div className="phr-sub" style={{ marginTop: 4 }}>
              {ANALYTES[u.observation.code].name} reported in {u.observation.unit}; the template expects {ANALYTES[u.observation.code].unit}. A data quality hold, separate from identity. {p.perms.has("clinical.review") ? "Open to record the laboratory confirmation." : "The clinical reviewer confirms it."}
            </div>
          </button>
        ))}
      </div>
    </Card>
  );
}

function BatchListCard({ batches, selected, onSelect }: { batches: BatchStats[]; selected: string; onSelect: (id: string) => void }) {
  return (
    <Card pad={false}>
      <div style={{ padding: "14px 16px 4px" }}>
        <CardHeader title="Batches" sub={`${batches.length} Eurofins files, newest first. Simulated history.`} />
      </div>
      <div className="phr-list" style={{ padding: "0 8px 10px" }}>
        {batches.map((b) => (
          <button key={b.batch.id} type="button" className="phr-item" aria-current={b.batch.id === selected} onClick={() => onSelect(b.batch.id)}>
            <div className="ph-row-flex" style={{ gap: 6 }}>
              <span className="phr-mono ph-grow ph-trunc" style={{ color: "var(--ink)" }}>{b.batch.id}</span>
              {b.quarantined ? <Pill tone="warn" icon="alert">{b.quarantined} held</Pill> : <Pill tone="ok" icon="check">Complete</Pill>}
            </div>
            <div className="phr-sub" style={{ marginTop: 3 }}>
              Received {fmtShortDateTime(b.batch.receivedAt)}. <span className="ph-num">{b.rows}</span> rows, <span className="ph-num">{b.specimens}</span> specimens{b.duplicates ? `, ${b.duplicates} duplicates skipped` : ""}.
            </div>
          </button>
        ))}
      </div>
    </Card>
  );
}

/* ---- mapping prepared by Lab Reconciliation ---- */
function MappingCard({ batchId }: { batchId: string }) {
  const state = usePhState();
  const p = persona(state);
  const [ref, w] = useWidth();
  const narrow = w > 0 && w < 560;
  const first: ImportRow | undefined = batchRows(state, batchId)[0];
  const showValue = p.perms.has("clinical.view");
  const agentEvent = state.activity.find((e) => e.actor.kind === "agent" && e.actor.id === "lab" && e.entity && e.entity.id === batchId);
  const map: Array<{ col: string; field: string; sample: ReactNode; rule: string }> = first ? [
    { col: CSV_COLUMNS[0], field: "Specimen identifier", sample: <span className="phr-mono">{first.specimenKey}</span>, rule: "Exact match to a collection record. Never fuzzy-matched." },
    { col: CSV_COLUMNS[1], field: "Name check", sample: first.nameInFile, rule: "Minimal identity check only. A name is never a key." },
    { col: CSV_COLUMNS[2], field: "Participant check", sample: first.dobInFile ? fmtNumericDate(first.dobInFile) : "None", rule: "Must equal the booking record, or the row is quarantined." },
    { col: CSV_COLUMNS[3], field: "Test code", sample: <span className="phr-mono">{first.analyteCode}</span>, rule: "Specimen plus test is the unique key. A repeat is skipped as a duplicate." },
    { col: CSV_COLUMNS[4], field: "Observation value", sample: showValue ? first.valueText : <HiddenValue label="Hidden" />, rule: "Kept exactly as received." },
    { col: CSV_COLUMNS[5], field: "Unit", sample: first.unit, rule: "Must match the template unit. A different unit holds the episode; nothing is converted silently." },
    { col: CSV_COLUMNS[6], field: "Result time", sample: `${fmtNumericDate(first.resultAt)} ${fmtTime(first.resultAt)}`, rule: "Stored in UTC, shown in Dublin time." },
  ] : [];
  return (
    <Card pad={false}>
      <div id="phr-mapping" style={{ padding: "14px 16px 4px", scrollMarginTop: 12 }}>
        <CardHeader title="Column mapping"
          sub={agentEvent ? `Draft prepared by Lab Reconciliation ${fmtWhen(agentEvent.at, state.clock.nowUtc)}. It maps columns and explains exceptions; it never matches a person or commits data.` : "Prepared by Lab Reconciliation as a draft. It maps columns only; it never matches a person or commits data."}
          right={<DemoTag>Agent draft</DemoTag>} />
      </div>
      <div ref={ref} className="phr-tblwrap" style={{ padding: "0 8px 12px" }}>
        <table className="phr-tbl">
          <thead><tr><th>CSV column</th><th>Pulse field</th><th>Line 2 sample</th>{narrow ? null : <th>Rule</th>}</tr></thead>
          <tbody>
            {map.map((m) => (
              <tr key={m.col}>
                <td className="phr-mono" style={{ whiteSpace: "nowrap" }}>{m.col}</td>
                <td style={{ color: "var(--ink)" }}>{m.field}{narrow ? <div className="phr-sub">{m.rule}</div> : null}</td>
                <td style={{ whiteSpace: "nowrap" }}>{m.sample}</td>
                {narrow ? null : <td className="phr-sub" style={{ minWidth: 170 }}>{m.rule}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ---- validation summary, derived from the rows ---- */
function ValidationCard({ batchId, onFilter }: { batchId: string; onFilter: (f: RowFilter) => void }) {
  const state = usePhState();
  const v = validationSummary(state, batchId);
  const s = batchStats(state, batchId);
  const line = (ok: boolean, title: string, detail: ReactNode, f?: RowFilter) => (
    <li className="phr-check" style={{ alignItems: "flex-start" }}>
      <span className="phr-check-box" role="img" aria-label={ok ? "Passed" : "Needs attention"} style={{ background: ok ? "var(--ok-soft)" : "var(--warn-soft)", color: ok ? "var(--ok)" : "var(--warn)" }}>
        <Icon name={ok ? "check" : "alert"} size={12} stroke={2.2} />
      </span>
      <span className="ph-grow" style={{ minWidth: 0 }}>
        <span style={{ color: "var(--ink)" }}>{title}</span>
        <span className="phr-sub" style={{ display: "block" }}>{detail}</span>
      </span>
      {f ? <Button size="sm" variant="ghost" onClick={() => onFilter(f)}>Show</Button> : null}
    </li>
  );
  return (
    <Card>
      <CardHeader title="Validation summary" sub={`Derived from the ${v.rows} rows of this batch.`} />
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        {line(true, `${v.rows} rows read, ${CSV_COLUMNS.length} columns mapped`, `${v.specimens} specimen records, ${new Set(batchRows(state, batchId).map((r) => r.analyteCode)).size} test codes. ${v.nonNumeric ? `${v.nonNumeric} non-numeric values.` : "Every value is numeric."}`)}
        {line(v.duplicates === 0, "Unique key (specimen + test)", `${v.newKeys} new keys. ${v.duplicates} rows already imported, skipped as duplicates.`, v.duplicates ? "duplicate" : undefined)}
        {line(v.dob.mismatch + v.dob.missing === 0, "Participant check (date of birth)", `${v.dob.match} match the booking record, ${v.dob.mismatch} mismatch, ${v.dob.missing} without a date of birth.`, v.dob.mismatch ? "dob" : undefined)}
        {line(v.dob.unknown === 0, "Specimen identifier", `${v.rows - v.dob.unknown} on a collection record, ${v.dob.unknown} not on any record.`, v.dob.unknown ? "quarantined" : undefined)}
        {line(v.unitDiffers.length === 0, "Unit", `${v.rows - v.unitDiffers.length} match the template unit, ${v.unitDiffers.length} reported in a different unit. No silent conversion.`, v.unitDiffers.length ? "unit" : undefined)}
        {line(s.quarantined === 0, "Outcome", `${s.imported} imported${v.resolved ? ` (${v.resolved} after a documented resolution)` : ""}, ${s.duplicates} duplicates skipped, ${s.quarantined} quarantined. Sum ${s.imported + s.duplicates + s.quarantined} of ${s.rows}.`, s.quarantined ? "quarantined" : undefined)}
      </ul>
    </Card>
  );
}

/* ---- all rows ---- */
const CHECK_TONE: Record<CheckStatus, { tone: "ok" | "warn" | "neutral"; icon: "check" | "alert" | "info" }> = {
  match: { tone: "ok", icon: "check" }, mismatch: { tone: "warn", icon: "alert" }, missing: { tone: "neutral", icon: "info" }, unknown: { tone: "warn", icon: "alert" },
};

function RowsCard({ batchId, filter, setFilter, onOpen, selected }: { batchId: string; filter: RowFilter; setFilter: (f: RowFilter) => void; onOpen: (id: string) => void; selected: string | null }) {
  const state = usePhState();
  const p = persona(state);
  const [q, setQ] = useState("");
  const [ref, w] = useWidth();
  const rows = batchRows(state, batchId);
  const v = validationSummary(state, batchId);
  const showValues = p.perms.has("clinical.view");
  const counts: Record<RowFilter, number> = {
    all: rows.length, imported: rows.filter((r) => r.state === "imported").length, resolved: rows.filter((r) => r.state === "resolved").length,
    duplicate: rows.filter((r) => r.state === "duplicate").length, quarantined: rows.filter((r) => r.state === "quarantined").length,
    unit: v.unitDiffers.length, dob: v.dob.mismatch,
  };
  const label: Record<RowFilter, string> = { all: "All", imported: "Imported", resolved: "Resolved", duplicate: "Duplicates", quarantined: "Quarantined", unit: "Unit differs", dob: "DOB mismatch" };
  const query = q.trim().toLowerCase();
  const shown = rows.filter((r) => {
    if (filter === "unit" && r.unit === ANALYTES[r.analyteCode].unit) return false;
    if (filter === "dob" && participantCheck(state, r).status !== "mismatch") return false;
    if (["imported", "resolved", "duplicate", "quarantined"].includes(filter) && r.state !== filter) return false;
    if (!query) return true;
    return `${r.id} ${r.specimenKey} ${r.nameInFile} ${r.analyteCode}`.toLowerCase().includes(query);
  });
  const narrow = w > 0 && w < 640;
  const cols: Column<ImportRow>[] = [
    { key: "line", header: "Line", align: "right", cell: (r) => <span className="ph-num">{r.line}</span>, sort: (a, b) => a.line - b.line },
    { key: "spec", header: "Specimen", cell: (r) => <div><div className="phr-mono" style={{ color: "var(--ink)" }}>{r.specimenKey}</div>{narrow ? <div className="phr-sub">{r.analyteCode}</div> : null}</div>, sort: (a, b) => (a.specimenKey < b.specimenKey ? -1 : 1) },
    ...(narrow ? [] : [
      { key: "test", header: "Test", cell: (r: ImportRow) => <span className="phr-mono">{r.analyteCode}</span> },
      { key: "val", header: "Result", align: "right" as const, cell: (r: ImportRow) => showValues ? <span className="ph-num">{r.valueText}</span> : <HiddenValue label="Hidden" /> },
      { key: "unit", header: "Unit", cell: (r: ImportRow) => r.unit === ANALYTES[r.analyteCode].unit ? r.unit : <span style={{ color: "var(--warn)" }}>{r.unit}</span> },
      { key: "check", header: "Participant check", cell: (r: ImportRow) => { const c = participantCheck(state, r); const look = c.status === "match" && c.nameMatch === false ? CHECK_TONE.mismatch : CHECK_TONE[c.status]; return <Pill tone={look.tone} icon={look.icon}>{checkLabel(c)}</Pill>; } },
      { key: "ep", header: "Episode", cell: (r: ImportRow) => r.episodeId ? <EntityLink kind="episode" id={r.episodeId} /> : <span className="ph-faint">None</span> },
    ]),
    { key: "state", header: "State", cell: (r) => <RowStatePill state={r.state} /> },
  ];
  return (
    <Card pad={false}>
      <div ref={ref} style={{ padding: "14px 16px 10px" }}>
        <CardHeader title="Rows" sub={`Every observation row in ${batchId}, exactly as received. Open a row for provenance, checks and its audit trail.`}
          right={<SearchBox value={q} onChange={setQ} placeholder="Row, specimen, name or test" width={240} />} />
        <div className="phr-row">
          {FILTERS.filter((f) => f === "all" || counts[f] > 0 || f === filter).map((f) => <Chip key={f} on={filter === f} onClick={() => setFilter(f)} count={counts[f]}>{label[f]}</Chip>)}
        </div>
      </div>
      <DataTable rows={shown} columns={cols} rowKey={(r) => r.id} onRowClick={(r) => onOpen(r.id)} selectedKey={selected} pageSize={25}
        empty={<EmptyState title="No rows match" icon="search">Clear the search or choose another filter.</EmptyState>}
        footerNote={`Matched on the unique specimen and test key; date of birth and name are cross-checked, never used to match.${showValues ? "" : " Result values are hidden for this role."}`} />
    </Card>
  );
}
