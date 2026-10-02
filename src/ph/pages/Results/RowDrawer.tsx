/* Human reconciliation drawer for one laboratory row: the row exactly as received, source
   provenance, the unique key, the participant check, and for a held row the collection
   record ("requisition") of each candidate so a person can compare identifiers. A suggestion
   is only ever shown as a suggestion. Resolution needs two identifiers and a reason, and
   commits the row once. A source-unit row can be confirmed by the clinical reviewer, keeping
   the value as received. Values are hidden, not blurred, for roles without clinical access. */
import { useState } from "react";
import {
  ANALYTES, act, canViewEpisodeClinical, fmtDateTime, fmtNumericDate, fmtShortDateTime, fmtTime, ix, latestObservations, persona,
  reportStateLabel, rowCandidates, staffName,
} from "../../model";
import type { Episode, ImportRow, Observation, PhState } from "../../model";
import { dispatch, usePhState } from "../../store";
import { Button, Checkbox, DemoTag, Drawer, EntityLink, Field, Pill, RestrictedNotice, Select, TextInput, Textarea } from "../../ui";
import { Banner, EventList, HiddenValue, Kv, OverlayPortal, QUARANTINE_LABEL, ReportStatePill, RowStatePill, SecTitle, fmtValue } from "./shared";
import { CHECK_LABEL, collectionRecord, episodeBySpecimen, eventsFor, observationIndex, participantCheck, rowIndex } from "./select";
import { confirmUnitWithReason } from "./actions";

const METHODS = [
  { id: "requisition", label: "Signed collection requisition checked against the row" },
  { id: "lab-call", label: "Laboratory confirmed the identifiers by phone (simulated)" },
  { id: "participant", label: "Participant confirmed through the verified contact route (simulated)" },
];

export function RowDrawer({ rowId, onClose }: { rowId: string | null; onClose: () => void }) {
  const state = usePhState();
  const row = rowId ? rowIndex(state).get(rowId) || null : null;
  return (
    <OverlayPortal>
      <Drawer open={!!row} onClose={onClose} width={640}
        title={row ? `Row ${row.id.replace(row.batchId + "-", "")}, line ${row.line}` : "Row"}
        sub={row ? <span className="phr-row" style={{ gap: 6 }}><RowStatePill state={row.state} /><span className="phr-mono">{row.id}</span></span> : undefined}>
        {row ? <RowBody row={row} /> : null}
      </Drawer>
    </OverlayPortal>
  );
}

function valueVisible(state: PhState, row: ImportRow, episodeId: string | null): boolean {
  const p = persona(state);
  if (!p.perms.has("clinical.view")) return false;
  return episodeId ? canViewEpisodeClinical(state, episodeId) : true;
}

function RowBody({ row }: { row: ImportRow }) {
  const state = usePhState();
  const batch = state.batches.find((b) => b.id === row.batchId)!;
  const check = participantCheck(state, row);
  const showValue = valueVisible(state, row, row.episodeId || (check.episode ? check.episode.id : null));
  const obsIx = observationIndex(state);
  const obs = row.observationId ? obsIx.get(row.observationId) || null : null;
  const dupOf = row.duplicateOfObservationId ? obsIx.get(row.duplicateOfObservationId) || null : null;
  const dupRow = dupOf && dupOf.source.kind === "batch" ? rowIndex(state).get(dupOf.source.rowId) || null : null;
  const unitDiffers = row.unit !== ANALYTES[row.analyteCode].unit;
  const valueText = showValue ? row.valueText : "[hidden]";
  const csv = `Specimen ID,Surname/Initial,DOB,Analyte,Result,Unit,Result date\n${row.specimenKey},"${row.nameInFile}",${row.dobInFile ? fmtNumericDate(row.dobInFile) : ""},${row.analyteCode},${valueText},${row.unit},${fmtNumericDate(row.resultAt)} ${fmtTime(row.resultAt)}`;
  const events = eventsFor(state, [row.id], 6);

  return (
    <div className="phr-gap" style={{ gap: 16 }}>
      <StatusLine row={row} obs={obs} dupOf={dupOf} dupRowLine={dupRow ? `${dupRow.batchId}, line ${dupRow.line}` : null} />

      <section>
        <SecTitle right={<DemoTag>Synthetic file</DemoTag>}>As received</SecTitle>
        <div className="phr-csv">{csv}</div>
        <div style={{ marginTop: 8 }}>
          <Kv tight items={[
            { k: "Specimen ID", v: <span className="phr-mono">{row.specimenKey}</span> },
            { k: "Name in file", v: row.nameInFile },
            { k: "Date of birth in file", v: row.dobInFile ? fmtNumericDate(row.dobInFile) : "Not supplied" },
            { k: "Test", v: `${ANALYTES[row.analyteCode].name} (${row.analyteCode})` },
            { k: "Result", v: showValue ? <span className="ph-num" style={{ fontWeight: 600 }}>{row.valueText}</span> : <HiddenValue /> },
            { k: "Unit", v: unitDiffers ? <span style={{ color: "var(--warn)" }}>{row.unit} (template {ANALYTES[row.analyteCode].unit})</span> : row.unit },
          ]} />
        </div>
      </section>

      <section>
        <SecTitle>Source provenance</SecTitle>
        <Kv tight items={[
          { k: "Batch", v: <EntityLink kind="batch" id={row.batchId} /> },
          { k: "File", v: <span className="phr-mono" style={{ fontSize: 11 }}>{batch.filename}</span> },
          { k: "Line in file", v: <span className="ph-num">{row.line}</span> },
          { k: "Laboratory", v: batch.lab },
          { k: "Received", v: fmtDateTime(batch.receivedAt) },
          { k: "Processed", v: fmtDateTime(batch.processedAt) },
          { k: "Source", v: batch.source, wide: true },
        ]} />
      </section>

      <section>
        <SecTitle>Checks</SecTitle>
        <Kv items={[
          { k: "Unique key (specimen + test)", v: <><span className="phr-mono">{row.specimenKey} + {row.analyteCode}</span><div className="phr-sub">{row.state === "duplicate" ? "Already imported. Skipped, no second observation." : row.state === "quarantined" ? "Not imported while held." : "New key, imported once."}</div></> },
          { k: "Participant check", v: <><CheckPill status={check.status} /><div className="phr-sub">{check.fileDob || check.recordDob ? `File ${check.fileDob ? fmtNumericDate(check.fileDob) : "none"}, record ${check.recordDob ? fmtNumericDate(check.recordDob) : "none"}` : "No record to compare"}</div></> },
          { k: "Specimen identifier", v: check.episode ? <>On collection record <span className="phr-mono">{check.episode.specimenIds[0]}</span></> : <span style={{ color: "var(--warn)" }}>Not on any collection record</span> },
          { k: "Unit", v: unitDiffers ? <span style={{ color: "var(--warn)" }}>Differs from the template. No silent conversion.</span> : "Matches the template unit" },
        ]} />
      </section>

      {row.state === "quarantined" ? <ResolveForm row={row} /> : null}
      {row.resolution ? <ResolutionRecord row={row} /> : null}
      {obs && obs.unitDiscrepancy ? <UnitPanel obs={obs} /> : null}

      <section>
        <SecTitle>Audit trail</SecTitle>
        <EventList events={events} empty="No events reference this row yet." />
        <div className="phr-sub" style={{ marginTop: 8 }}>The row as received is never edited. Resolutions and confirmations are added alongside it.</div>
      </section>
    </div>
  );
}

function CheckPill({ status }: { status: ReturnType<typeof participantCheck>["status"] }) {
  const look = status === "match" ? { tone: "ok" as const, icon: "check" as const } : status === "missing" ? { tone: "neutral" as const, icon: "info" as const } : { tone: "warn" as const, icon: "alert" as const };
  return <Pill tone={look.tone} icon={look.icon}>{CHECK_LABEL[status]}</Pill>;
}

function StatusLine({ row, obs, dupOf, dupRowLine }: { row: ImportRow; obs: Observation | null; dupOf: Observation | null; dupRowLine: string | null }) {
  if (row.state === "quarantined" && row.quarantine) {
    return (
      <Banner tone="warn" icon="alert">
        <b>Quarantined: {QUARANTINE_LABEL[row.quarantine.reason]}.</b> {row.quarantine.detail}
      </Banner>
    );
  }
  if (row.state === "duplicate") {
    return (
      <Banner tone="neutral" icon="layers">
        <b>Duplicate, skipped.</b> The same specimen and test were already imported as <span className="phr-mono">{dupOf ? dupOf.id : row.duplicateOfObservationId}</span>{dupRowLine ? ` from ${dupRowLine}` : ""}. No second observation was created.
      </Banner>
    );
  }
  if (row.state === "resolved") {
    return <Banner tone="ok" icon="shield"><b>Resolved and committed once</b> as <span className="phr-mono">{row.observationId}</span> after a documented identity check.</Banner>;
  }
  return <Banner tone="ok" icon="check"><b>Imported</b> as <span className="phr-mono">{obs ? obs.id : row.observationId}</span>{row.episodeId ? <> for <EntityLink kind="episode" id={row.episodeId} /></> : null}.</Banner>;
}

/* ---- resolution of a quarantined row ---- */
function ResolveForm({ row }: { row: ImportRow }) {
  const state = usePhState();
  const p = persona(state);
  const canResolve = p.perms.has("identity.resolve");
  const cands = rowCandidates(state, row).map((c) => c.episode.id);
  const suggested = row.quarantine && row.quarantine.suggestion ? (/PH-S-\d{4}/.exec(row.quarantine.suggestion) || [null])[0] : null;
  const [lookup, setLookup] = useState("");
  const [choice, setChoice] = useState<string | null>(null);
  const [method, setMethod] = useState(METHODS[0].id);
  const [chkSpec, setChkSpec] = useState(false);
  const [chkDob, setChkDob] = useState(false);
  const [reason, setReason] = useState("");
  const looked = lookup.trim() ? episodeBySpecimen(state, lookup) : null;
  const options = cands.concat(looked && !cands.includes(looked.id) ? [looked.id] : []);
  const missing: string[] = [];
  if (!choice) missing.push("select the collection record you compared");
  if (!chkSpec || !chkDob) missing.push("confirm both identifiers");
  if (reason.trim().length < 8) missing.push("record a reason of at least a short sentence");
  const ready = canResolve && missing.length === 0;
  const submit = () => {
    if (!choice) return;
    const m = METHODS.find((x) => x.id === method)!;
    const r = dispatch(act.resolveRow(row.id, choice, ["specimen", "dob"], `${m.label}. ${reason.trim()}`));
    if (!r.ok) { setChkSpec(false); setChkDob(false); }
  };

  return (
    <section>
      <SecTitle right={<span className="phr-sub">Nothing is matched automatically</span>}>Resolve the identity exception</SecTitle>
      <div className="phr-gap">
        {row.quarantine && row.quarantine.suggestion ? (
          <Banner tone="info" icon="info">
            <b>From Lab Reconciliation:</b> {row.quarantine.suggestion}
          </Banner>
        ) : null}
        {cands.length === 0 ? (
          <Field label="Look up a collection record by its exact specimen ID" help="Exact match only. A near match is never accepted automatically.">
            <div className="phr-row" style={{ flexWrap: "nowrap" }}>
              <TextInput value={lookup} onChange={(e) => { setLookup(e.target.value); setChoice(null); }} placeholder="For example PH-S-0202" aria-label="Specimen ID to look up" />
              {suggested ? <Button size="sm" onClick={() => { setLookup(suggested); setChoice(null); }}>Use {suggested}</Button> : null}
            </div>
            {lookup.trim() && !looked ? <div className="ph-err">No collection record has the specimen ID {lookup.trim()}.</div> : null}
          </Field>
        ) : null}
        {options.length ? (
          <div role="radiogroup" aria-label="Collection records to compare" className="phr-compare">
            {options.map((id) => <CandidateCard key={id} row={row} episodeId={id} selected={choice === id} onSelect={() => { setChoice(id); setChkSpec(false); setChkDob(false); }} />)}
          </div>
        ) : null}
        {canResolve ? (
          <div className="phr-gap" style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
            <Field label="How did you verify? (mock identity check)">
              <Select value={method} onChange={(e) => setMethod(e.target.value)}>
                {METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </Select>
            </Field>
            <Checkbox checked={chkSpec} onChange={setChkSpec} disabled={!choice}
              label={choice ? `The specimen on this row is the specimen on ${choice}'s collection record` : "The specimen on this row is the specimen on the selected collection record"}
              hint="First identifier." />
            <Checkbox checked={chkDob} onChange={setChkDob} disabled={!choice}
              label="The date of birth is confirmed against the collection record" hint="Second identifier. A name alone is never enough." />
            <Field label="Reason" help="Kept with the row and in the activity log.">
              <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What you checked and why this row belongs to the selected episode." />
            </Field>
            <div className="phr-row">
              <Button variant="primary" icon="shield" disabled={!ready} onClick={submit}>Resolve and commit the row once</Button>
            </div>
            {!ready ? <div className="phr-sub">To resolve: {missing.join("; ")}.</div> : <div className="phr-sub">The row is committed once to the selected episode. The row as received is kept unchanged.</div>}
          </div>
        ) : (
          <RestrictedNotice title="Resolution needs identity resolution access">
            {p.name} ({p.roleLabel}) can view this row. Operations and the clinical reviewer resolve identity exceptions.
          </RestrictedNotice>
        )}
      </div>
    </section>
  );
}

function CandidateCard({ row, episodeId, selected, onSelect }: { row: ImportRow; episodeId: string; selected: boolean; onSelect: () => void }) {
  const state = usePhState();
  const rec = collectionRecord(state, episodeId);
  if (!rec) return null;
  const spec = rec.specimens.map((s) => s.id);
  const specMatch = spec.includes(row.specimenKey);
  const dobMatch = row.dobInFile ? row.dobInFile === rec.person.dob : null;
  const nameOnRecord = `${rec.person.family}, ${rec.person.given}`;
  const capId = rec.episode.capture.identity;
  const cmp = (ok: boolean | null, yes: string, no: string, none: string) => (
    <span className="phr-sub" style={{ display: "block", color: ok === null ? "var(--faint)" : ok ? "var(--ok)" : "var(--warn)" }}>{ok === null ? none : ok ? yes : no}</span>
  );
  return (
    <button type="button" role="radio" aria-checked={selected} className="phr-choice" onClick={onSelect}>
      <div className="phr-row" style={{ justifyContent: "space-between" }}>
        <span style={{ fontWeight: 600, color: "var(--ink)" }}>{rec.person.given} {rec.person.family}</span>
        <ReportStatePill state={rec.episode.reportState} />
      </div>
      <div className="phr-mono ph-faint" style={{ marginTop: 2 }}>{rec.episode.id}, {rec.programme.code}</div>
      <dl style={{ margin: "8px 0 0", fontSize: 12, lineHeight: 1.45 }}>
        <dt className="ph-faint" style={{ fontSize: 10.5 }}>Specimen on record</dt>
        <dd style={{ margin: 0 }}><span className="phr-mono">{spec.join(", ")}</span>{cmp(specMatch, "Same as the row", `Row says ${row.specimenKey}`, "")}</dd>
        <dt className="ph-faint" style={{ fontSize: 10.5, marginTop: 5 }}>Date of birth on record</dt>
        <dd style={{ margin: 0 }}>{fmtNumericDate(rec.person.dob)}{cmp(dobMatch, "Same as the row", `Row says ${row.dobInFile ? fmtNumericDate(row.dobInFile) : ""}`, "Row has no date of birth")}</dd>
        <dt className="ph-faint" style={{ fontSize: 10.5, marginTop: 5 }}>Name on record</dt>
        <dd style={{ margin: 0 }}>{nameOnRecord}<span className="phr-sub" style={{ display: "block" }}>Row says {row.nameInFile}. A name is never a key.</span></dd>
        <dt className="ph-faint" style={{ fontSize: 10.5, marginTop: 5 }}>Collected</dt>
        <dd style={{ margin: 0 }}>{fmtShortDateTime(rec.episode.collectedAt)}, {rec.session.siteName}</dd>
        <dt className="ph-faint" style={{ fontSize: 10.5, marginTop: 5 }}>Checked at the appointment</dt>
        <dd style={{ margin: 0 }}>{capId.filter((c) => c.confirmed).map((c) => `${c.label} ${c.confirmedValue}`).join("; ") || "Not confirmed"}</dd>
      </dl>
      <div className="phr-sub" style={{ marginTop: 8 }}>{selected ? "Selected for comparison" : "Select to compare"}</div>
    </button>
  );
}

function ResolutionRecord({ row }: { row: ImportRow }) {
  const state = usePhState();
  const r = row.resolution!;
  const ep: Episode | undefined = ix(state).episodeById.get(r.chosenEpisodeId);
  const p = persona(state);
  return (
    <section>
      <SecTitle>Resolution record</SecTitle>
      <Kv items={[
        { k: "Resolved by", v: `${staffName(state, r.by)}, ${fmtDateTime(r.at)}` },
        { k: "Identifiers confirmed", v: r.checks.map((c) => (c === "dob" ? "date of birth" : c === "specimen" ? "specimen identifier" : c)).join(" and ") },
        { k: "Episode", v: <EntityLink kind="episode" id={r.chosenEpisodeId} /> },
        { k: "Episode now", v: ep ? <ReportStatePill state={ep.reportState} /> : "Unknown" },
        { k: "Reason", v: r.reason, wide: true },
        { k: "Observation created", v: <span className="phr-mono">{row.observationId}</span> },
      ]} />
      {ep && ep.reportState === "ready_for_review" ? (
        <div className="phr-sub" style={{ marginTop: 8 }}>
          {ep.id} is now {reportStateLabel(ep.reportState).toLowerCase()}. {p.perms.has("clinical.review") ? "Open it to review." : `${staffName(state, "neil")} reviews it clinically.`}
          {p.perms.has("clinical.view") ? <> <EntityLink kind="episode" id={ep.id}>Open in Review</EntityLink></> : null}
        </div>
      ) : null}
    </section>
  );
}

/* ---- source unit confirmation ---- */
function UnitPanel({ obs }: { obs: Observation }) {
  const state = usePhState();
  const p = persona(state);
  const [reason, setReason] = useState("");
  const latest = latestObservations(state, obs.episodeId).find((o) => o.code === obs.code);
  const showValue = p.perms.has("clinical.view") && canViewEpisodeClinical(state, obs.episodeId);
  const confirmed = latest && latest.id !== obs.id && latest.unitDiscrepancy && latest.unitDiscrepancy.confirmed ? latest : null;
  const unitEvents = eventsFor(state, [obs.episodeId], 12).filter((v) => v.event.verb.startsWith("unit."));
  return (
    <section>
      <SecTitle right={<Pill tone={confirmed ? "ok" : "info"} icon={confirmed ? "check" : "info"}>{confirmed ? "Confirmed" : "Data quality hold"}</Pill>}>Source unit</SecTitle>
      {confirmed ? (
        <div className="phr-gap">
          <Banner tone="ok" icon="check">
            Laboratory confirmation recorded. New version v{confirmed.version}{showValue ? `: ${fmtValue(confirmed.code, confirmed.value, confirmed.unit)} ${confirmed.unit}` : ""}. The value as received{showValue && confirmed.original ? ` (${confirmed.original.value} ${confirmed.original.unit})` : ""} stays on v{obs.version}.
          </Banner>
          <EventList events={unitEvents} />
        </div>
      ) : (
        <div className="phr-gap">
          <Banner tone="info" icon="info">
            The file reports {ANALYTES[obs.code].name} in {obs.unitDiscrepancy!.sourceUnit}; the template expects {obs.unitDiscrepancy!.expectedUnit}. The episode is held as a data quality item and nothing is converted until the laboratory confirms the unit.
          </Banner>
          {p.perms.has("clinical.review") ? (
            <>
              <Field label="Laboratory confirmation" help="At least a short sentence. The documented conversion is applied only after this, and the value as received is kept.">
                <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Who confirmed the unit and how (simulated)." />
              </Field>
              <div><Button variant="primary" icon="check" disabled={reason.trim().length < 8} onClick={() => dispatch(confirmUnitWithReason(obs.episodeId, reason))}>Record laboratory confirmation</Button></div>
            </>
          ) : (
            <div className="phr-sub">The clinical reviewer records the laboratory confirmation. {p.name} ({p.roleLabel}) can view the row only.</div>
          )}
        </div>
      )}
    </section>
  );
}
