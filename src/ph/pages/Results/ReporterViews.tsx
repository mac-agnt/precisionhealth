/* Named reporter views in Results, Review (RECORDING.md section 5: Jotform Tables has views per
   reporter, "Neil Reporting" and Liz's BP Spiro, SCD Risk and Reporting views). The queue can be
   shown per reporter, an episode can be assigned to Liz or Neil, and every report shows its review
   state: Not started, Draft, AI draft, Approved (released) or Amended (a released correction). */
import { currentReleased, draftVersion, fmtShortDateTime, ix, staffName, versionsOf } from "../../model";
import type { Id, PhState, ReporterId, ReportVersion } from "../../model";
import { dispatch, usePersona, usePhState } from "../../store";
import { Button, Card, Chip, Pill } from "../../ui";
import type { Tone } from "../../ui";
import { libAct } from "./libraryActions";
import { reporterOf, reporterWorkload } from "./libraryModel";
import type { Bundle } from "./EpisodePanels";

export type ReviewView = "queue" | "approved" | "amended";
export type ReporterFilter = ReporterId | "all";

export interface ReportStateInfo { key: "not_started" | "draft" | "ai_draft" | "correction" | "approved" | "amended"; label: string; tone: Tone }
export function reportStateOf(state: PhState, episodeId: Id): ReportStateInfo {
  const d = draftVersion(state, episodeId);
  const rel = currentReleased(state, episodeId);
  if (d) {
    if (d.correctionReason) return { key: "correction", label: `Amendment draft v${d.version}`, tone: "warn" };
    if (d.adviceSource === "ai_draft_approved" || state.adviceLibrary.prepared[episodeId]) return { key: "ai_draft", label: `AI draft v${d.version}, to review`, tone: "info" };
    return { key: "draft", label: d.advice.trim() ? `Draft v${d.version}` : "Not started", tone: d.advice.trim() ? "info" : "neutral" };
  }
  if (rel) return rel.version > 1 || rel.supersedes ? { key: "amended", label: `Amended, v${rel.version} released`, tone: "brand" } : { key: "approved", label: "Approved and released", tone: "ok" };
  return { key: "not_started", label: "Not started", tone: "neutral" };
}

export function ReporterTabs({ value, onChange }: { value: ReporterFilter; onChange: (v: ReporterFilter) => void }) {
  const state = usePhState();
  const load = reporterWorkload(state);
  const total = load.reduce((n, r) => n + r.ready, 0);
  return (
    <div className="ph-wrap" style={{ gap: 4 }} role="group" aria-label="Reporter view">
      <Chip on={value === "all"} onClick={() => onChange("all")} count={total}>All</Chip>
      {load.map((r) => <Chip key={r.id} on={value === r.id} onClick={() => onChange(r.id)} count={r.ready}>{r.id === "neil" ? "Neil" : "Liz"}</Chip>)}
    </div>
  );
}

export function ViewTabs({ value, onChange }: { value: ReviewView; onChange: (v: ReviewView) => void }) {
  const state = usePhState();
  const rel = releasedEpisodes(state);
  return (
    <div className="ph-wrap" style={{ gap: 4 }} role="group" aria-label="Report state">
      <Chip on={value === "queue"} onClick={() => onChange("queue")}>To review</Chip>
      <Chip on={value === "approved"} onClick={() => onChange("approved")} count={rel.approved.length}>Approved</Chip>
      <Chip on={value === "amended"} onClick={() => onChange("amended")} count={rel.amended.length}>Amended</Chip>
    </div>
  );
}

export function ReportStatePill({ episodeId }: { episodeId: Id }) {
  const state = usePhState();
  const s = reportStateOf(state, episodeId);
  return <Pill tone={s.tone} icon={null}>{s.label}</Pill>;
}

export function releasedEpisodes(state: PhState): { approved: Array<{ id: Id; v: ReportVersion }>; amended: Array<{ id: Id; v: ReportVersion }> } {
  const approved: Array<{ id: Id; v: ReportVersion }> = [], amended: Array<{ id: Id; v: ReportVersion }> = [];
  for (const e of state.episodes) {
    if (e.reportState !== "released") continue;
    const v = currentReleased(state, e.id);
    if (!v) continue;
    const amendedNow = v.version > 1 || versionsOf(state, e.id).some((x) => x.status === "superseded");
    (amendedNow ? amended : approved).push({ id: e.id, v });
  }
  const by = (a: { v: ReportVersion }, b: { v: ReportVersion }) => ((a.v.releasedAt || "") < (b.v.releasedAt || "") ? 1 : -1);
  return { approved: approved.sort(by), amended: amended.sort(by) };
}

/** Released reports for the Approved and Amended views. Newest first. */
export function ReleasedList({ view, selectedId, onSelect, query }: { view: "approved" | "amended"; selectedId: string | null; onSelect: (id: string) => void; query: string }) {
  const state = usePhState();
  const I = ix(state);
  const rows = releasedEpisodes(state)[view].filter(({ id }) => {
    if (!query) return true;
    const e = I.episodeById.get(id)!; const p = I.personById.get(e.personId)!;
    return `${p.given} ${p.family} ${e.id} ${e.screeningRef}`.toLowerCase().includes(query);
  });
  if (!rows.length) return <div className="phr-sub" style={{ padding: "10px 4px" }}>{view === "amended" ? "No amended reports yet. A correction released from Results, Corrections shows here." : "No released reports match."}</div>;
  return (
    <div className="phr-list">
      {rows.slice(0, 40).map(({ id, v }) => {
        const e = I.episodeById.get(id)!; const p = I.personById.get(e.personId)!;
        return (
          <button key={id} type="button" className="phr-item" aria-current={id === selectedId} onClick={() => onSelect(id)}>
            <div style={{ fontSize: 12.5, color: "var(--ink)", fontWeight: 500 }}>{p.given} {p.family}</div>
            <div className="ph-row-flex" style={{ gap: 6, marginTop: 2 }}><span className="phr-mono" style={{ color: "var(--dim)" }}>{e.screeningRef}</span><span className="phr-mono ph-faint">v{v.version}</span></div>
            <div className="phr-sub">Released {v.releasedAt ? fmtShortDateTime(v.releasedAt) : ""} by {staffName(state, v.releasedBy)}</div>
          </button>
        );
      })}
      {rows.length > 40 ? <div className="phr-sub" style={{ padding: "6px 4px" }}>Showing the 40 most recent of {rows.length}. Search to find others.</div> : null}
    </div>
  );
}

/** Who reports this episode, with Assign to Liz or Neil. Assignment is for the clinical reviewer. */
export function ReporterCard({ b }: { b: Bundle }) {
  const state = usePhState();
  const p = usePersona();
  const ep = b.episode;
  if (ep.reportState !== "ready_for_review") return null;
  const cur = reporterOf(state, ep);
  const other: ReporterId = cur === "liz" ? "neil" : "liz";
  const can = p.perms.has("clinical.review");
  const st = reportStateOf(state, ep.id);
  return (
    <Card pad="sm">
      <div className="ph-row-flex" style={{ gap: 8, flexWrap: "wrap" }}>
        <div className="ph-grow" style={{ minWidth: 150 }}>
          <div className="phr-sub">Reporter</div>
          <div style={{ fontSize: 13, color: "var(--ink)", fontWeight: 600 }}>{staffName(state, cur)}</div>
          <div style={{ marginTop: 4 }}><Pill tone={st.tone} icon={null}>{st.label}</Pill></div>
        </div>
        {can ? <Button size="sm" icon="user" onClick={() => dispatch(libAct.assignReporter(ep.id, other))}>Assign to {other === "liz" ? "Liz" : "Neil"}</Button> : null}
      </div>
      {cur === "liz" ? <div className="phr-sub" style={{ marginTop: 6 }}>Liz reports POC, BP and spirometry and SCD risk screens. Release stays with the clinical reviewer.</div> : null}
    </Card>
  );
}
