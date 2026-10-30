/* Lab CSV import: one drop zone, one matching queue, one import log. The drop zone is also used
   on a participant's record, where rows are matched only against that participant. Files are read in the
   browser with FileReader; nothing leaves the page. Every change goes through dispatch(labAct.*).
   Deep links: #/Results/imports, #/Results/imports?view=queue, #/Results/imports?batch=<id> */
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, ReactNode } from "react";
import {
  AGENT_RESULTS_RULE, ID_RULE, PRECISION_ID_NOTE, SAMPLE_LAB_FILENAME, act, awaitingLab, awaitingLabEpisodes, fmtDateTime, fmtNumericDate, fmtShortDateTime, ix, labAct, labLog, labQueue, persona,
  newResultsFor, previewLabFile, releasedLine, sampleLabCsv, sampleLabCsvFor, staffDisplayName,
} from "../../model";
import type { Episode, LabPreview, LabUpload, MatchOutcome, PhState, QueueItem } from "../../model";
import { dispatch, usePhState } from "../../store";
import { useNav } from "../../nav-context";
import { Button, Card, CardHeader, DemoTag, EmptyState, EntityLink, Icon, Pill, TextInput } from "../../ui";
import type { GlyphName, Tone } from "../../ui";
import "./labimport.css";

const MAX_BYTES = 5 * 1024 * 1024;
export const MATCH_RULE = `${ID_RULE} Anything else waits for a person to check.`;

/* ---------- small pieces ---------- */
/** The matching rule in three steps: all three must agree before a row attaches by itself. */
export function MatchRule({ compact }: { compact?: boolean }) {
  return (
    <div className={"lab-rule" + (compact ? " is-compact" : "")} aria-label="Matching rule">
      <div className="lab-rule-steps">
        <span className="lab-rule-step"><b>1</b> Name</span>
        <span className="lab-rule-step"><b>2</b> Date of birth</span>
        <span className="lab-rule-step"><b>3</b> Precision ID</span>
      </div>
      <div className="lab-faint">{ID_RULE} Anything else waits below for a person.{compact ? null : <> {PRECISION_ID_NOTE}</>}</div>
    </div>
  );
}
export function AwaitingLabPill() {
  return <Pill tone="info" icon="flask" title="Lab bloods were taken. Results show here once the lab CSV is matched to this participant.">Awaiting lab</Pill>;
}
/** "Awaiting lab" for a lab bloods episode still waiting for its CSV, otherwise the fallback. */
export function LabAware({ state, ep, children }: { state: PhState; ep: Episode; children: ReactNode }) {
  return awaitingLab(state, ep) ? <AwaitingLabPill /> : <>{children}</>;
}

function useBlobUrl(text: string | null, type = "text/csv"): string | null {
  const url = useMemo(() => (text && typeof URL !== "undefined" && URL.createObjectURL ? URL.createObjectURL(new Blob([text], { type })) : null), [text, type]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  return url;
}

const OUTCOME: Record<MatchOutcome["kind"], { tone: Tone; icon: GlyphName }> = {
  matched: { tone: "ok", icon: "check" }, flagged: { tone: "warn", icon: "alert" }, duplicate: { tone: "neutral", icon: "layers" }, skipped: { tone: "neutral", icon: "x" },
};
/** What differs, in plain words. A blank identifier in the file is "missing", not "differs". */
function diffWords(d: { name: boolean; dob: boolean; id: boolean }, file?: { dob: string | null; uniqueId: string; surname: string }): string {
  const parts: Array<{ w: string; missing: boolean }> = [];
  if (d.name) parts.push({ w: "name", missing: !!file && !file.surname });
  if (d.dob) parts.push({ w: "date of birth", missing: !!file && !file.dob });
  if (d.id) parts.push({ w: "Precision ID", missing: !!file && !file.uniqueId });
  if (!parts.length) return "All three match";
  if (parts.length === 3 && !parts.some((p) => p.missing)) return "No identifier matches";
  const missing = parts.filter((p) => p.missing).map((p) => p.w);
  const differ = parts.filter((p) => !p.missing).map((p) => p.w);
  const say = (ws: string[], verb1: string, verbN: string) => (ws.length ? `${ws.join(" and ")} ${ws.length === 1 ? verb1 : verbN}` : "");
  const text = [say(differ, "differs", "differ"), say(missing, "missing", "missing")].filter(Boolean).join(", ");
  return text.replace(/^./, (c) => c.toUpperCase());
}
function OutcomePill({ o }: { o: MatchOutcome }) {
  const look = OUTCOME[o.kind];
  const text = o.kind === "matched" ? `Matches ${o.episode.screeningRef}` : o.kind === "flagged" ? (o.candidate ? diffWords(o.diff) : "No participant found") : o.why;
  return <Pill tone={look.tone} icon={look.icon}>{text}</Pill>;
}

/* ---------- the drop zone ---------- */
export function LabDropZone({ personId = null, onImported }: { personId?: string | null; onImported?: (batchId: string) => void }) {
  const state = usePhState();
  const p = persona(state);
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const sample = useMemo(() => (personId ? sampleLabCsvFor(state, personId) : { text: sampleLabCsv(state), filename: SAMPLE_LAB_FILENAME }), [state, personId]);
  const sampleUrl = useBlobUrl(sample ? sample.text : null);
  const pv = useMemo(() => (file ? previewLabFile(state, file.text, personId) : null), [state, file, personId]);
  const canImport = p.perms.has("imports.view") && !p.isParticipant;

  const read = (f: File | undefined | null) => {
    setError(null);
    if (!f) return;
    if (!/\.(csv|txt)$/i.test(f.name) && !/csv|text\/plain/.test(f.type)) { setError(`${f.name} is not a CSV file. Export the lab results as .csv and try again.`); return; }
    if (f.size > MAX_BYTES) { setError(`${f.name} is larger than 5 MB. Split the file and import it in parts.`); return; }
    const r = new FileReader();
    r.onload = () => setFile({ name: f.name, text: String(r.result || "") });
    r.onerror = () => setError(`${f.name} could not be read.`);
    r.readAsText(f);
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setOver(false); read(e.dataTransfer?.files?.[0]); };
  const onPick = (e: ChangeEvent<HTMLInputElement>) => { read(e.target.files?.[0]); e.target.value = ""; };
  const commit = () => {
    if (!file) return;
    const r = dispatch(labAct.importCsv(file.name, file.text, personId));
    if (r.ok) { setFile(null); if (onImported && r.id) onImported(r.id); }
  };

  if (!canImport) return null;
  return (
    <div className="lab-dz-wrap">
      {!file ? (
        <div className={"lab-dz" + (over ? " is-over" : "") + (personId ? " is-compact" : "")} role="region" aria-label="Lab CSV drop zone"
          onDragOver={(e) => { e.preventDefault(); if (!over) setOver(true); }} onDragEnter={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={(e) => { if (e.currentTarget === e.target) setOver(false); }} onDrop={onDrop}>
          <span className="lab-dz-icon"><Icon name="file" size={personId ? 18 : 22} /></span>
          <div className="lab-dz-title">{over ? "Drop to read the file" : personId ? "Drop this participant's lab CSV here" : "Drop the lab CSV here"}</div>
          <div className="lab-dz-sub">{personId ? "Rows are matched only against this participant." : "One file from the lab, any number of participants."} Read in your browser; nothing is uploaded.</div>
          <div className="lab-dz-actions">
            <Button variant="primary" icon="plus" onClick={() => inputRef.current?.click()}>Choose file</Button>
            {sample ? <Button icon="flask" onClick={() => { setError(null); setFile({ name: sample.filename, text: sample.text }); }}>Use sample lab file</Button> : null}
          </div>
          {sample && sampleUrl ? <a className="lab-dz-link" href={sampleUrl} download={sample.filename}>Download sample CSV</a> : null}
          <input ref={inputRef} type="file" accept=".csv,text/csv,text/plain" onChange={onPick} hidden data-testid="lab-file-input" />
        </div>
      ) : pv ? (
        <Preview pv={pv} filename={file.name} personId={personId} onCancel={() => setFile(null)} onCommit={commit} />
      ) : null}
      {error ? <div className="lab-error" role="alert"><Icon name="alert" size={14} /> {error}</div> : null}
    </div>
  );
}

function Preview({ pv, filename, personId, onCancel, onCommit }: { pv: LabPreview; filename: string; personId: string | null; onCancel: () => void; onCommit: () => void }) {
  const state = usePhState();
  const I = ix(state);
  if (!pv.file.ok) {
    return (
      <div className="lab-pv">
        <div className="lab-pv-head"><span className="lab-file"><Icon name="file" size={14} /> {filename}</span><Pill tone="bad" icon="alert">Could not read</Pill></div>
        <div className="lab-error" role="alert" style={{ marginTop: 10 }}><Icon name="alert" size={14} /> {pv.file.error}</div>
        <div className="lab-pv-foot"><Button onClick={onCancel}>Choose another file</Button></div>
      </div>
    );
  }
  const ident = pv.file.columns.filter((c) => c.kind === "identity");
  const tests = pv.file.columns.filter((c) => c.kind === "test");
  const ignored = pv.file.columns.filter((c) => c.kind === "ignored");
  const shown = pv.rows.filter((r) => !(personId && r.outcome.kind === "skipped"));
  const nothing = !pv.matched && !pv.flagged;
  return (
    <div className="lab-pv">
      <div className="lab-pv-head">
        <span className="lab-file"><Icon name="file" size={14} /> {filename}</span>
        <span className="lab-faint">{pv.file.lines} {pv.file.lines === 1 ? "line" : "lines"}, {pv.file.format === "wide" ? "one line per participant" : "one line per result, grouped per participant"}</span>
        <span className="ph-grow" />
        <Pill tone="info" icon="eye">Preview, nothing saved yet</Pill>
      </div>

      <div className="lab-cols" aria-label="Columns found">
        <span className="lab-cols-label">Columns</span>
        {ident.map((c) => <span key={c.header} className="lab-col"><b>{c.header}</b>{c.label !== c.header ? <> as {c.label}</> : null}</span>)}
        {tests.length ? <span className="lab-col lab-col-test" title={tests.map((c) => `${c.header}: ${c.label}`).join("\n")}><b>{tests.length} test {tests.length === 1 ? "column" : "columns"}</b> {tests.slice(0, 6).map((c) => c.header).join(", ")}{tests.length > 6 ? ", ..." : ""}</span> : null}
        {ignored.map((c) => <span key={c.header} className="lab-col lab-col-off" title="Not recognised, so not imported"><b>{c.header}</b> not used</span>)}
      </div>

      <div className="lab-tblwrap">
        <table className="lab-tbl lab-tbl-wide">
          <thead><tr><th>Line</th><th>Name in file</th><th>Date of birth</th><th>Precision ID</th><th className="num">Results</th><th>Outcome</th></tr></thead>
          <tbody>
            {shown.map(({ rec, outcome }) => {
              const cand = outcome.kind === "matched" ? outcome.episode : outcome.kind === "flagged" ? outcome.candidate : null;
              const who = cand ? I.personById.get(cand.personId) : null;
              const d = outcome.kind === "flagged" ? outcome.diff : null;
              return (
                <tr key={rec.line} className={outcome.kind === "flagged" ? "is-flag" : undefined}>
                  <td className="lab-mono">{rec.line}</td>
                  <td className={d?.name ? "is-diff" : undefined}>{rec.file.surname}{rec.file.given ? `, ${rec.file.given}` : ""}{who ? <div className="lab-faint">{outcome.kind === "matched" ? "Participant" : "Closest"}: <EntityLink kind="person" id={who.id}>{who.given} {who.family}</EntityLink></div> : null}</td>
                  <td className={"lab-mono" + (d?.dob ? " is-diff" : "")}>{rec.file.dob ? fmtNumericDate(rec.file.dob) : rec.file.dobText || "Missing"}</td>
                  <td className={"lab-mono" + (d?.id ? " is-diff" : "")}>{rec.file.uniqueId || "Missing"}</td>
                  <td className="num">{outcome.kind === "matched" ? outcome.newResults : rec.results.length}</td>
                  <td><OutcomePill o={outcome} />{rec.problems.length ? <div className="lab-faint" title={rec.problems.join("\n")}>{rec.problems.length} {rec.problems.length === 1 ? "value" : "values"} not read</div> : null}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {personId && pv.skipped ? <div className="lab-faint" style={{ marginTop: 6 }}>{pv.skipped} {pv.skipped === 1 ? "line is" : "lines are"} for other people and will be skipped. Import the whole file from Results, Imports.</div> : null}

      <div className="lab-pv-foot">
        <div className="lab-pv-sum">
          {nothing ? <>Nothing new to import. {pv.duplicate ? "These results are already in Pulse or already waiting for matching." : "No row is for this participant."}</> : <>
            <b>{pv.matched}</b> {pv.matched === 1 ? "row matches" : "rows match"} on all three identifiers{pv.matched ? <> ({pv.newResults} results go straight onto the record)</> : null}.
            {pv.flagged ? <> <b>{pv.flagged}</b> {pv.flagged === 1 ? "row goes" : "rows go"} to the matching queue.</> : null}
            {pv.duplicate ? <> {pv.duplicate} already in Pulse, not imported twice.</> : null}
          </>}
        </div>
        <div className="lab-dz-actions" style={{ marginTop: 0 }}>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button variant="primary" icon="check" disabled={nothing} onClick={onCommit}>{pv.flagged && pv.matched ? `Import ${pv.matched} and queue ${pv.flagged}` : pv.flagged ? `Send ${pv.flagged} to the queue` : `Import ${pv.matched} ${pv.matched === 1 ? "row" : "rows"}`}</Button>
        </div>
      </div>
    </div>
  );
}

/* ---------- the matching queue ---------- */
export function MatchQueue({ personId = null }: { personId?: string | null }) {
  /* Every row offers the same three actions: match, reject, open in its file. */
  const state = usePhState();
  const items = labQueue(state).filter((q) => !personId || (q.candidate && q.candidate.personId === personId));
  if (!items.length) return personId ? null : <EmptyState title="Nothing to match" icon="check">Every lab row is on the right participant's record or was rejected.</EmptyState>;
  return <div className="lab-queue">{items.map((q) => <QueueCard key={q.key} q={q} />)}</div>;
}

function QueueCard({ q }: { q: QueueItem }) {
  const state = usePhState();
  const p = persona(state);
  const nav = useNav();
  const I = ix(state);
  const [mode, setMode] = useState<"idle" | "match" | "reject">("idle");
  const [reason, setReason] = useState("");
  const can = p.perms.has("identity.resolve") && !p.isParticipant;
  const person = q.candidate ? I.personById.get(q.candidate.personId) : null;
  const ok = reason.trim().length >= 8;
  const alreadyIn = q.source === "csv" && !!q.candidate && newResultsFor(state, q.candidate, q.record!.results).length === 0;
  const confirm = () => {
    if (!q.candidate) return;
    const r = q.source === "csv" ? dispatch(labAct.resolve(q.record!.id, q.candidate.id, reason)) : dispatch(act.resolveRow(q.row!.id, q.candidate.id, ["name", "dob", "specimen"], reason));
    if (r.ok) { setMode("idle"); setReason(""); }
  };
  const reject = () => { const r = q.source === "csv" ? dispatch(labAct.reject(q.record!.id, reason)) : dispatch(labAct.rejectFeedRow(q.row!.id, reason)); if (r.ok) { setMode("idle"); setReason(""); } };
  const batchId = q.source === "csv" ? state.labCsv.uploads.find((u) => u.id === q.record!.uploadId)?.batchId : q.row!.batchId;
  const openInFile = () => { if (!batchId) return; nav.go({ page: "Results", tab: "imports", params: q.source === "feed" ? { batch: batchId, row: q.row!.id } : { batch: batchId } }); };
  const line = q.source === "csv" ? q.record!.line : q.row!.line;
  const cell = (diff: boolean, v: ReactNode) => <td data-label="In Pulse" className={diff ? "is-diff" : "is-same"}>{diff ? <Icon name="alert" size={12} /> : <Icon name="check" size={12} />} {v}</td>;
  return (
    <section className="lab-qc" aria-label={`Lab row ${line} from ${q.filename}`}>
      <div className="lab-qc-head">
        <span className="lab-qc-title">{q.file.surname}{q.file.given ? `, ${q.file.given}` : ""}</span>
        <Pill tone="warn" icon="alert">{q.candidate ? diffWords(q.diff, q.file) : "No participant found"}</Pill>
        <span className="ph-grow" />
        <span className="lab-faint">Line {line} of <span className="lab-mono">{q.filename}</span>, {q.results} {q.results === 1 ? "result" : "results"}</span>
      </div>
      <div className="lab-tblwrap">
        <table className="lab-cmp">
          <thead><tr><th></th><th>In the lab file</th><th>Closest participant in Pulse</th></tr></thead>
          <tbody>
            <tr><th>Name</th><td data-label="In the file">{q.file.surname}{q.file.given ? `, ${q.file.given}` : ""}</td>{person ? cell(q.diff.name, <>{person.family}, {person.given}</>) : <td data-label="In Pulse" className="lab-faint">None</td>}</tr>
            <tr><th>Date of birth</th><td data-label="In the file" className="lab-mono">{q.file.dob ? fmtNumericDate(q.file.dob) : q.file.dobText || "Missing"}</td>{person ? cell(q.diff.dob, <span className="lab-mono">{fmtNumericDate(person.dob)}</span>) : <td data-label="In Pulse" className="lab-faint">None</td>}</tr>
            <tr><th>Precision ID</th><td data-label="In the file" className="lab-mono">{q.file.uniqueId || "Missing"}</td>{q.candidate ? cell(q.diff.id, <span className="lab-mono">{q.source === "feed" && /^PH-S-/i.test(q.file.uniqueId) ? q.candidate.specimenIds[0] : q.candidate.screeningRef}</span>) : <td data-label="In Pulse" className="lab-faint">None</td>}</tr>
          </tbody>
        </table>
      </div>
      {q.candidate && person ? (
        <div className="lab-faint" style={{ marginTop: 6 }}>
          Closest match: <EntityLink kind="person" id={person.id}>{person.given} {person.family}</EntityLink>, Precision ID {q.candidate.screeningRef}, report {awaitingLab(state, q.candidate) ? "awaiting lab" : q.candidate.reportState.replace(/_/g, " ")}. <EntityLink kind="episode" id={q.candidate.id}>Open the report</EntityLink>
        </div>
      ) : <div className="lab-faint" style={{ marginTop: 6 }}>No participant in Pulse shares the name and date of birth or the Precision ID. Ask the lab to check the request form.</div>}
      {can ? (
        mode === "idle" ? (
          <div className="lab-dz-actions" style={{ justifyContent: "flex-start", marginTop: 10 }}>
            {q.candidate && !alreadyIn ? <Button size="sm" variant="primary" icon="check" onClick={() => setMode("match")}>Match to this participant</Button> : null}
            {alreadyIn ? <span className="lab-faint" style={{ flexBasis: "100%" }}>These results are already on {person ? `${person.given} ${person.family}'s` : "this"} record, so this row would add nothing. Reject it to clear the queue.</span> : null}
            <Button size="sm" variant="ghost" icon="x" onClick={() => setMode("reject")}>Reject row</Button>
            {batchId ? <Button size="sm" variant="ghost" icon="arrow" onClick={openInFile}>Open in the lab file</Button> : null}
          </div>
        ) : (
          <div className="lab-qc-form">
            <label className="lab-faint" htmlFor={`why-${q.key}`}>{mode === "match" ? `You checked name, date of birth and Precision ID. Why does this row belong to ${person ? `${person.given} ${person.family}` : "this participant"}? Kept in the activity log.` : "Reason for rejecting (optional). Nothing is attached to any participant."}</label>
            <TextInput id={`why-${q.key}`} autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder={mode === "match" ? "For example: lab confirmed the date of birth was typed wrongly" : "For example: not one of our participants"} />
            <div className="lab-dz-actions" style={{ justifyContent: "flex-start", marginTop: 8 }}>
              {mode === "match"
                ? <Button size="sm" variant="primary" icon="check" disabled={!ok} title={ok ? undefined : "Write a short reason first"} onClick={confirm}>Confirm match</Button>
                : <Button size="sm" variant="danger" icon="x" onClick={reject}>Reject row</Button>}
              <Button size="sm" variant="ghost" onClick={() => { setMode("idle"); setReason(""); }}>Cancel</Button>
            </div>
          </div>
        )
      ) : <div className="lab-faint" style={{ marginTop: 8 }}><Icon name="lock" size={12} /> Operations and the clinical reviewer match lab rows. {p.name} can view only.</div>}
    </section>
  );
}

/* ---------- the import log ---------- */
export function ImportLog() {
  const state = usePhState();
  const nav = useNav();
  const I = ix(state);
  const log = labLog(state);
  return (
    <div className="lab-tblwrap">
      <table className="lab-tbl lab-log">
        <thead><tr><th>File</th><th className="lab-hide-sm">Received</th><th className="lab-hide-sm">Uploaded by</th><th className="num lab-hide-sm">Matched</th><th className="num lab-hide-sm">Flagged</th><th className="num lab-hide-sm">Rejected</th></tr></thead>
        <tbody>
          {log.map((l) => (
            <tr key={l.batchId} className="is-link" tabIndex={0} onClick={() => nav.setParams({ batch: l.batchId })} onKeyDown={(e) => { if (e.key === "Enter") nav.setParams({ batch: l.batchId }); }}>
              <td>
                <div className="lab-mono lab-ink lab-trunc">{l.filename}</div>
                <div className="lab-faint">{l.batchId}{l.personId ? `, on ${I.personById.get(l.personId)?.given} ${I.personById.get(l.personId)?.family}'s record` : ""}</div>
                <div className="lab-faint lab-show-sm">{fmtShortDateTime(l.at)}, {l.by}. {l.matched} matched, {l.flagged} flagged, {l.rejected} rejected.</div>
              </td>
              <td className="lab-nowrap lab-hide-sm">{fmtShortDateTime(l.at)}</td>
              <td className="lab-hide-sm">{l.by}</td>
              <td className="num lab-hide-sm">{l.matched}</td>
              <td className="num lab-hide-sm">{l.flagged ? <Pill tone="warn" icon={null}>{l.flagged}</Pill> : 0}</td>
              <td className="num lab-hide-sm">{l.rejected}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- one uploaded file ---------- */
const REC_LOOK: Record<string, { tone: Tone; icon: GlyphName; label: string }> = {
  matched: { tone: "ok", icon: "check", label: "Matched" }, resolved: { tone: "ok", icon: "shield", label: "Matched by a person" },
  flagged: { tone: "warn", icon: "alert", label: "Needs matching" }, rejected: { tone: "neutral", icon: "x", label: "Rejected" }, duplicate: { tone: "neutral", icon: "layers", label: "Already in Pulse" },
};
export function UploadDetail({ upload, onBack }: { upload: LabUpload; onBack: () => void }) {
  const state = usePhState();
  const nav = useNav();
  const I = ix(state);
  const recs = state.labCsv.records.filter((r) => r.uploadId === upload.id);
  const open = recs.filter((r) => r.status === "flagged").length;
  return (
    <Card>
      <CardHeader title={<span className="lab-mono" style={{ fontSize: 14 }}>{upload.filename}</span>}
        sub={`${upload.batchId}. Received ${fmtDateTime(upload.at)}, uploaded by ${staffDisplayName(state, upload.by)}${upload.personId ? ` on ${I.personById.get(upload.personId)?.given} ${I.personById.get(upload.personId)?.family}'s record` : ""}. ${upload.columns.length} columns, ${upload.format === "wide" ? "one line per participant" : "one line per result"}.`}
        right={<><DemoTag>Simulated lab file</DemoTag>{open ? <Pill tone="warn" icon="alert">{open} to match</Pill> : <Pill tone="ok" icon="check">Complete</Pill>}</>} />
      <div className="lab-tblwrap">
        <table className="lab-tbl lab-tbl-wide">
          <thead><tr><th>Line</th><th>Name in file</th><th>Participant in Pulse</th><th className="num">Results added</th><th>Status</th></tr></thead>
          <tbody>
            {recs.map((r) => {
              const ep = r.episodeId ? I.episodeById.get(r.episodeId) : r.candidateEpisodeId ? I.episodeById.get(r.candidateEpisodeId) : null;
              const who = ep ? I.personById.get(ep.personId) : null;
              const look = REC_LOOK[r.status];
              return (
                <tr key={r.id}>
                  <td className="lab-mono">{r.line}</td>
                  <td>{r.file.surname}, {r.file.given}<div className="lab-faint lab-mono">{r.file.uniqueId}</div></td>
                  <td>{who && ep ? <><EntityLink kind="person" id={who.id}>{who.given} {who.family}</EntityLink><div className="lab-faint"><EntityLink kind="episode" id={ep.id}>Open the report</EntityLink></div></> : <span className="lab-faint">None</span>}</td>
                  <td className="num">{r.created}</td>
                  <td><Pill tone={look.tone} icon={look.icon}>{look.label}</Pill>{r.decision ? <div className="lab-faint" style={{ maxWidth: 260 }}>{staffDisplayName(state, r.decision.by)}, {fmtShortDateTime(r.decision.at)}: {r.decision.reason}</div> : null}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {open ? <div style={{ marginTop: 10 }}><Button icon="arrow" onClick={() => nav.setParams({ view: "queue" })}>Open the matching queue</Button></div> : null}
    </Card>
  );
}

/* ---------- the calm landing view ---------- */
export function LabImportHome() {
  const state = usePhState();
  const nav = useNav();
  const queue = labQueue(state);
  const waiting = awaitingLabEpisodes(state).length;
  const queueRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (nav.params.view === "queue" && queueRef.current) queueRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [nav.params.view]);
  return (
    <div className="lab-home">
      <Card>
        <CardHeader title="Import lab results" sub="Drop one CSV from the lab. You will see a preview before anything is saved." />
        <MatchRule />
        <LabDropZone onImported={() => nav.setParams({ view: "queue" })} />
        {waiting ? (
          <div style={{ marginTop: 10 }}>
            <Button size="sm" variant="ghost" icon="flask" onClick={() => nav.go({ page: "Results", tab: "review", params: { filter: "awaiting" } })}>{waiting} {waiting === 1 ? "participant is" : "participants are"} awaiting lab results</Button>
          </div>
        ) : null}
      </Card>
      <div ref={queueRef} style={{ scrollMarginTop: 12 }}>
        <Card>
          <CardHeader title="Rows that need matching" sub="Each row is shown next to the closest participant, with the differences highlighted. Nothing here is on a record yet."
            right={queue.length ? <Pill tone="warn" icon="alert">{queue.length} to match</Pill> : <Pill tone="ok" icon="check">All matched</Pill>} />
          <MatchQueue />
        </Card>
      </div>
      <Card>
        <CardHeader title="Import log" sub="Every lab file, newest first. Open one to see its rows." />
        <ImportLog />
      </Card>
    </div>
  );
}

/* ---------- integrity notes ---------- */
export function AgentGuardNote() {
  return (
    <div className="lab-guard" role="note">
      <Icon name="shield" size={14} />
      <span><b>{AGENT_RESULTS_RULE}</b> Results change only through a person: lab import, matching, correction and release are blocked for agents.</span>
    </div>
  );
}
export function ReadOnlyNote({ children = "Read only" }: { children?: ReactNode }) {
  return <span className="lab-ro" title="Results cannot be edited here. Only Precision Health clinicians change or release results."><Icon name="lock" size={11} /> {children}</span>;
}
export { releasedLine };
