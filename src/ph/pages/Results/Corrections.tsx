/* Results, Corrections: version history and the amendment workspace. Correcting a released
   report creates a new draft version with a reason, fresh calculation references and a
   required re-review. The released version stays immutable; on release of the new version it
   is shown as superseded, its history is kept and a generic participant notice is simulated.
   A correction is never a silent edit of the PDF already supplied.
   Deep link: #/Results/corrections?episode=PH-E-1051 */
import { useState } from "react";
import {
  act, canViewEpisodeClinical, correctionCandidates, episodeBundle, fmtShortDateTime, ix, persona, staffName,
} from "../../model";
import type { Episode, ReportVersion } from "../../model";
import { dispatch, usePhState } from "../../store";
import { useNav } from "../../nav-context";
import {
  Button, Card, CardHeader, Chip, DataTable, DemoTag, EmptyState, EntityLink, Field, Kpi, KpiStrip, PageHeader, Pill, RestrictedNotice, SearchBox, Split, Textarea,
} from "../../ui";
import type { Column } from "../../ui";
import { EpisodeHeader, ResultsTable } from "./EpisodePanels";
import type { Bundle } from "./EpisodePanels";
import { AdviceCard, FlagsCard, PreviewCard, ReleaseCard } from "./ReleasePanel";
import { PreviewModal } from "./ReportPreview";
import { Banner, Count, Kv, SecTitle, fmtValue, useWidth } from "./shared";
import { observationIndex } from "./select";


type Cand = ReturnType<typeof correctionCandidates>[number];
type CFilter = "all" | "corrected" | "draft" | "today";

const isCorrected = (c: Cand) => c.versions.some((v) => v.status === "superseded");

export default function Corrections() {
  const state = usePhState();
  const p = persona(state);
  if (!p.perms.has("clinical.view")) {
    const c = correctionCandidates(state);
    return (
      <div className="ph-page phr">
        <PageHeader title="Corrections" sub="Version history and amendments for released reports." />
        <KpiStrip>
          <Kpi label="Released reports" value={<Count n={c.length} unit="episodes" />} sub="Each with an immutable version history" icon="file" />
          <Kpi label="Corrected" value={<Count n={c.filter(isCorrected).length} unit="episodes" />} sub="An earlier version is superseded" icon="layers" />
        </KpiStrip>
        <div style={{ marginTop: 14 }}>
          <RestrictedNotice title="Report versions are restricted for this role">
            {p.name} ({p.roleLabel}) sees counts only. Report content, advice and version history are visible to clinical roles, and corrections are made by the clinical reviewer.
          </RestrictedNotice>
        </div>
      </div>
    );
  }
  return <CorrectionsWorkspace />;
}

function CorrectionsWorkspace() {
  const state = usePhState();
  const nav = useNav();
  const [ref, w] = useWidth();
  const cands = correctionCandidates(state).slice().sort((a, b) => ((b.current?.releasedAt || "") < (a.current?.releasedAt || "") ? -1 : 1));
  const now = state.clock.nowUtc;
  const today = (c: Cand) => c.versions.some((v) => !!v.releasedAt && v.releasedAt >= now);
  const paramId = nav.params.episode || null;
  const paramEp: Episode | undefined = paramId ? ix(state).episodeById.get(paramId) : undefined;
  const [f, setF] = useState<CFilter>(paramId && cands.some((c) => c.episode.id === paramId) ? "all" : "corrected");
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const I = ix(state);
  const rows = cands.filter((c) => {
    if (f === "corrected" && !isCorrected(c)) return false;
    if (f === "draft" && !c.draft) return false;
    if (f === "today" && !today(c)) return false;
    if (!query) return true;
    const pr = I.personById.get(c.episode.personId)!;
    return `${pr.given} ${pr.family} ${c.episode.id} ${pr.id}`.toLowerCase().includes(query);
  });
  const selectedId = paramEp ? paramEp.id : (cands.find((c) => c.draft) || cands.find(isCorrected) || cands[0])?.episode.id || null;
  const counts = { all: cands.length, corrected: cands.filter(isCorrected).length, draft: cands.filter((c) => !!c.draft).length, today: cands.filter(today).length };
  const notices = state.messages.filter((m) => m.kind === "report_available" && m.logicalId.startsWith("LM-A-") && /-v([2-9]|\d{2,})$/.test(m.logicalId)).length;
  const narrow = w > 0 && w < 560;
  const cols: Column<Cand>[] = [
    { key: "ep", header: "Episode", cell: (c) => { const pr = I.personById.get(c.episode.personId)!; return <div><div style={{ color: "var(--ink)" }}>{pr.given} {pr.family}</div><div className="phr-mono ph-faint">{c.episode.id} · {I.programmeById.get(c.episode.programmeId)!.code}</div></div>; } },
    { key: "cur", header: "Current", cell: (c) => c.current ? <span>v{c.current.version}</span> : "None" },
    ...(narrow ? [] : [
      { key: "rel", header: "Released", cell: (c: Cand) => c.current?.releasedAt ? fmtShortDateTime(c.current.releasedAt) : "", sort: (a: Cand, b: Cand) => ((a.current?.releasedAt || "") < (b.current?.releasedAt || "") ? -1 : 1) },
      { key: "hist", header: "History", cell: (c: Cand) => <span className="phr-sub">{c.versions.map((v) => `v${v.version} ${v.status === "in_review" || v.status === "draft" ? "draft" : v.status}`).join(", ")}</span> },
    ]),
    { key: "st", header: "Status", cell: (c) => c.draft ? <Pill tone="info" icon="edit">Correction in progress</Pill> : isCorrected(c) ? <Pill tone="neutral" icon="layers">Corrected</Pill> : <Pill tone="ok" icon="check">Released</Pill> },
  ];

  return (
    <div className="ph-page phr">
      <PageHeader title="Corrections" sub="Released reports are immutable. A correction is a new version with a reason and a fresh review, never an edit of the report already supplied."
        actions={<DemoTag>Sample data</DemoTag>} />
      <KpiStrip>
        <Kpi label="Released reports" value={<Count n={counts.all} unit="episodes" />} sub="Each has an immutable version history" icon="file" onClick={() => setF("all")} hint="Show all released reports" />
        <Kpi label="Corrected" value={<Count n={counts.corrected} unit="episodes" />} sub="An earlier version is superseded and kept" icon="layers" onClick={() => setF("corrected")} hint="Show corrected reports" />
        <Kpi label="In progress" value={<Count n={counts.draft} unit="drafts" />} sub="Correction drafts waiting for re-review" icon="edit" onClick={() => setF("draft")} hint="Show drafts" />
        <Kpi label="Update notices" value={<Count n={notices} unit="messages" />} sub="Generic notices for a new version, simulated" icon="mail" />
      </KpiStrip>
      <div style={{ marginTop: 14 }}>
        <Split
          main={
            <Card pad={false}>
              <div ref={ref} style={{ padding: "14px 16px 10px" }}>
                <CardHeader title="Released reports" sub="Most recently released first. Choose one to see its versions or start a correction."
                  right={<SearchBox value={q} onChange={setQ} placeholder="Name or ID" width={200} />} />
                <div className="phr-row">
                  <Chip on={f === "all"} onClick={() => setF("all")} count={counts.all}>All released</Chip>
                  <Chip on={f === "corrected"} onClick={() => setF("corrected")} count={counts.corrected}>Corrected</Chip>
                  <Chip on={f === "draft"} onClick={() => setF("draft")} count={counts.draft}>In progress</Chip>
                  <Chip on={f === "today"} onClick={() => setF("today")} count={counts.today}>Released in this demo session</Chip>
                </div>
              </div>
              <DataTable rows={rows} columns={cols} rowKey={(c) => c.episode.id} selectedKey={selectedId} pageSize={8}
                onRowClick={(c) => nav.setParams({ episode: c.episode.id })}
                empty={<EmptyState title="Nothing in this filter" icon="search">Choose another filter or clear the search.</EmptyState>} />
            </Card>
          }
          side={<><CorrectionRules /><AmendmentLog /></>}
        />
      </div>
      <div style={{ marginTop: 14 }}>
        {selectedId ? <CorrectionWorkspace key={selectedId} episodeId={selectedId} /> : null}
      </div>
    </div>
  );
}

function CorrectionRules() {
  return (
    <Card>
      <CardHeader title="A correction is a new version" />
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.6, color: "var(--body)" }}>
        <li>It starts a draft with a recorded reason and fresh calculation references.</li>
        <li>It needs a full re-review: advice, preview and the re-review tick.</li>
        <li>On release the earlier version becomes Superseded and stays readable exactly as supplied.</li>
        <li>The participant gets a generic notice that an updated version is available. It contains no results.</li>
        <li>Nothing edits the PDF already supplied, and no value changes silently.</li>
      </ul>
    </Card>
  );
}

/* Result-level corrections: documented identity resolutions and unit confirmations. Each keeps the original. */
function AmendmentLog() {
  const state = usePhState();
  const p = persona(state);
  const resolved = state.importRows.filter((r) => r.resolution);
  const units = state.observations.filter((o) => o.original && o.unitDiscrepancy && o.unitDiscrepancy.confirmed);
  return (
    <Card>
      <CardHeader title="Result amendments" sub="Identity resolutions and unit confirmations. The value as received is always kept." />
      {resolved.length || units.length ? (
        <ul className="phr-tl">
          {resolved.map((r) => (
            <li key={r.id}>
              <div className="phr-row" style={{ gap: 6 }}><span className="phr-mono ph-faint">{fmtShortDateTime(r.resolution!.at)}</span><EntityLink kind="row" id={r.id}>{r.id.replace(r.batchId + "-", "")}, line {r.line}</EntityLink></div>
              <div className="phr-note">Identity resolved by {staffName(state, r.resolution!.by)} to {r.resolution!.chosenEpisodeId}. {r.resolution!.reason}</div>
            </li>
          ))}
          {units.map((o) => (
            <li key={o.id}>
              <div className="phr-row" style={{ gap: 6 }}><span className="phr-mono ph-faint">{fmtShortDateTime(o.recordedAt)}</span><EntityLink kind="episode" id={o.episodeId} /></div>
              <div className="phr-note">
                {o.code} unit confirmed: v{o.version}{p.perms.has("clinical.view") ? ` ${fmtValue(o.code, o.value, o.unit)} ${o.unit}, as received ${o.original!.value} ${o.original!.unit} kept on v${o.version - 1}` : ", values hidden"}.
              </div>
            </li>
          ))}
        </ul>
      ) : <div className="phr-sub">None yet. Resolving a held row in Imports or confirming a source unit adds an entry here.</div>}
    </Card>
  );
}

/* ---- one episode: versions and the amendment workspace ---- */
function CorrectionWorkspace({ episodeId }: { episodeId: string }) {
  const state = usePhState();
  const p = persona(state);
  const canReview = p.perms.has("clinical.review");
  const b = episodeBundle(state, episodeId);
  const [seen, setSeen] = useState(false);
  const [open, setOpen] = useState(false);
  if (!b) return null;
  if (b.episode.reportState !== "released") {
    return (
      <Card>
        <EpisodeHeader b={b} />
        <div style={{ marginTop: 10 }}>
          <Banner tone="neutral" icon="info">{b.episode.id} has no released report yet, so there is nothing to correct. Corrections apply to released reports. <EntityLink kind="episode" id={b.episode.id}>Open it in Review</EntityLink></Banner>
        </div>
      </Card>
    );
  }
  const draft = b.draft && b.draft.correctionReason ? b.draft : null;
  const openPreview = () => { setSeen(true); setOpen(true); };
  if (!canViewEpisodeClinical(state, b.episode.id)) {
    return (
      <div className="phr-gap" style={{ gap: 14 }}>
        <EpisodeHeader b={b} />
        <RestrictedNotice title="Report content restricted for this role">
          {p.name} ({p.roleLabel}) can see clinical content only for sessions they are assigned to. The version list below shows status and dates only.
        </RestrictedNotice>
        <VersionHistory b={b} showContent={false} />
      </div>
    );
  }
  return (
    <div className="phr-gap" style={{ gap: 14 }}>
      <EpisodeHeader b={b} />
      <Split
        main={
          <>
            <VersionHistory b={b} showContent />
            {draft ? (
              <>
                <CalculationRefs b={b} draft={draft} />
                <AdviceCard b={b} editable={canReview} mode="correction" />
                <ResultsTable b={b} showValues />
              </>
            ) : canReview ? <StartCorrection b={b} /> : (
              <RestrictedNotice title="Corrections are made by the clinical reviewer">{p.name} ({p.roleLabel}) can view the version history.</RestrictedNotice>
            )}
          </>
        }
        side={draft ? (
          <>
            <ReleaseCard b={b} mode="correction" canAct={canReview} previewSeen={seen || !!draft.checklist.preview} />
            <FlagsCard b={b} canAct={canReview} />
            <PreviewCard b={b} onOpen={openPreview} seen={seen} mode="correction" />
          </>
        ) : (
          <PreviewCard b={b} onOpen={openPreview} seen={seen} mode="correction" />
        )}
      />
      {open ? (
        <PreviewModal open onClose={() => setOpen(false)} episodeId={b.episode.id}
          advice={draft ? draft.advice : b.released ? b.released.advice : ""}
          versionLabel={draft ? `Draft v${draft.version} (correction). The participant still sees v${b.released ? b.released.version : draft.version - 1} until this is released.` : `Released v${b.released ? b.released.version : 1}. Visible to the participant.`}
          reviewer={staffName(state, "neil")} />
      ) : null}
    </div>
  );
}

function StartCorrection({ b }: { b: Bundle }) {
  const [reason, setReason] = useState("");
  const last = b.versions.length ? b.versions[b.versions.length - 1].version : 1;
  return (
    <Card>
      <CardHeader title={`Start a correction: draft v${last + 1}`} sub={`v${b.released ? b.released.version : last} stays released and unchanged until v${last + 1} is re-reviewed and released.`} />
      <div className="phr-gap">
        <Field label="Reason for the correction" help="Required, at least a short sentence. Kept with the new version and in the activity log.">
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: displayed unit label corrected on the participant report." />
        </Field>
        <div><Button variant="primary" icon="edit" disabled={reason.trim().length < 8} onClick={() => dispatch(act.startCorrection(b.episode.id, reason))}>Create draft v{last + 1}</Button></div>
      </div>
    </Card>
  );
}

function statusPill(v: ReportVersion) {
  if (v.status === "released") return <Pill tone="ok" icon="check">Released, current</Pill>;
  if (v.status === "superseded") return <Pill tone="neutral" icon="layers">Superseded</Pill>;
  return <Pill tone="info" icon="edit">Draft, in review</Pill>;
}

function VersionHistory({ b, showContent }: { b: Bundle; showContent: boolean }) {
  const state = usePhState();
  const list = b.versions.slice().reverse();
  return (
    <Card>
      <CardHeader title="Version history" sub="Newest first. Released and superseded versions are immutable." />
      <ul className="phr-tl">
        {list.map((v) => {
          const msg = state.messages.find((m) => m.logicalId === `LM-A-${v.id}`);
          return (
            <li key={v.id}>
              <div className="phr-row" style={{ gap: 8 }}>
                <span style={{ fontWeight: 600, color: "var(--ink)" }}>v{v.version}</span>
                {statusPill(v)}
                <span className="phr-mono ph-faint">{v.id}</span>
              </div>
              <div style={{ marginTop: 6 }}>
                <Kv tight items={[
                  { k: "Created", v: `${fmtShortDateTime(v.createdAt)}, ${staffName(state, v.createdBy)}` },
                  { k: "Released", v: v.releasedAt ? `${fmtShortDateTime(v.releasedAt)}, ${staffName(state, v.releasedBy)}` : "Not released" },
                  { k: "Review", v: v.releaseMode === "routine" ? "Routine report, no review flags" : v.releaseMode === "individual" ? `Individual review${v.flagAcknowledged ? ", flags acknowledged" : ""}` : "Pending" },
                  v.supersededBy ? { k: "Superseded by", v: v.supersededBy.replace(v.episodeId + "-", "") } : null,
                  v.supersedes ? { k: "Supersedes", v: v.supersedes.replace(v.episodeId + "-", "") } : null,
                  { k: "Result references", v: `${v.observationRefs.length} observations` },
                  { k: "Portal access", v: v.accessedAt ? `Opened ${fmtShortDateTime(v.accessedAt)}` : v.status === "released" || v.status === "superseded" ? "Not opened" : "Not visible" },
                  v.correctionReason ? { k: "Correction reason", v: v.correctionReason, wide: true } : null,
                ]} />
              </div>
              {msg ? (
                <div className="phr-sub" style={{ marginTop: 6 }}>
                  {v.supersedes ? "Participant notice" : "Availability notice"} <EntityLink kind="message" id={msg.id} />: {msg.subject}, {msg.channel === "sms" ? "SMS" : "email"} to {msg.destination}, {msg.status} {fmtShortDateTime(msg.at)}. Contains no results. <DemoTag>Simulated</DemoTag>
                </div>
              ) : null}
              {showContent ? (
                <details style={{ marginTop: 6 }}>
                  <summary className="phr-sub" style={{ cursor: "pointer" }}>Advice in v{v.version}</summary>
                  <div className="phr-note" style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>{v.advice || "No advice text."}</div>
                </details>
              ) : null}
            </li>
          );
        })}
      </ul>
      {list.some((v) => v.status === "superseded") ? <div className="phr-sub" style={{ marginTop: 10 }}>Superseded versions stay in the history exactly as they were released, including their advice and result references.</div> : null}
    </Card>
  );
}

function CalculationRefs({ b, draft }: { b: Bundle; draft: ReportVersion }) {
  const state = usePhState();
  const obs = observationIndex(state);
  const prev = b.released ? new Map(b.released.observationRefs.map((r) => [obs.get(r.id)?.code || r.id, r])) : new Map<string, { id: string; version: number }>();
  const h = b.episode.capture.measures.heightM, wt = b.episode.capture.measures.weightKg;
  return (
    <Card>
      <CardHeader title={`Calculation references in draft v${draft.version}`} sub={`Frozen when the correction started. Reason: ${draft.correctionReason}`} />
      <div className="phr-tblwrap">
        <table className="phr-tbl">
          <thead><tr><th>Input</th><th>Reference</th><th>Compared with v{b.released ? b.released.version : draft.version - 1}</th></tr></thead>
          <tbody>
            {draft.observationRefs.map((r) => {
              const o = obs.get(r.id);
              const before = o ? prev.get(o.code) : undefined;
              const same = !!before && before.id === r.id && before.version === r.version;
              return (
                <tr key={r.id}>
                  <td>{o ? o.code : "Observation"}</td>
                  <td className="phr-mono">{r.id} v{r.version}</td>
                  <td>{same ? <span className="ph-faint">Unchanged</span> : <Pill tone="info" icon="refresh">Updated{before ? ` from ${before.id} v${before.version}` : ""}</Pill>}</td>
                </tr>
              );
            })}
            <tr>
              <td>BMI</td>
              <td>{b.bmi != null ? `${b.bmi.toFixed(1)} kg/m² from height ${h.value} m and weight ${wt.value} kg` : "Not calculated"}</td>
              <td className="ph-faint">Calculated locally each time</td>
            </tr>
            <tr>
              <td>QRISK3</td>
              <td colSpan={2} className="ph-faint">Approved integration required. No score is referenced.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}

