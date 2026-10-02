/* Results, Review: a compact three-pane workspace. Left, the assigned queue. Centre, values
   with units, source, previous version and text-labelled flags, plus measurements and answers.
   Right, the release checklist, flag acknowledgement, advice and the participant preview.
   One episode per release, never in bulk. Deep link: #/Results/review?episode=PH-E-0101 */
import { useState } from "react";
import {
  canViewEpisodeClinical, episodeBundle, fmtAge, ix, persona, reviewQueue, reviewStats, staffName,
} from "../../model";
import type { ReviewItem } from "../../model";
import { usePhState } from "../../store";
import { useNav } from "../../nav-context";
import { Button, Card, DemoTag, EmptyState, Kpi, KpiStrip, PageHeader, Pill, RestrictedNotice, SearchBox, Select } from "../../ui";
import { AnswersCard, EpisodeHeader, EpisodeHistory, MeasuresCard, ResultsTable, StateBanner } from "./EpisodePanels";
import type { Bundle } from "./EpisodePanels";
import { AdviceCard, FlagsCard, PreviewCard, ReleaseCard, ReleasedCard } from "./ReleasePanel";
import { PreviewModal } from "./ReportPreview";
import { Count } from "./shared";

type QueueFilter = "all" | "routine" | "flagged" | "aged";

export default function Review() {
  const state = usePhState();
  const p = persona(state);
  if (!p.perms.has("clinical.view")) return <ReviewRestricted />;
  return <ReviewWorkspace />;
}

/* Operations and reporting roles: counts only. */
function ReviewRestricted() {
  const state = usePhState();
  const p = persona(state);
  const nav = useNav();
  const s = reviewStats(state);
  return (
    <div className="ph-page phr">
      <PageHeader title="Review" sub="Clinician review and release of completed screening episodes." />
      <KpiStrip>
        <Kpi label="Ready for review" value={<Count n={s.ready} unit="episodes" />} sub="Waiting for individual clinician review" icon="eye" />
        <Kpi label="Over 48 hours" value={<Count n={s.aged} unit="episodes" />} sub={`Included in the ${s.ready}, not an extra queue`} icon="clock" />
      </KpiStrip>
      <div style={{ marginTop: 14 }}>
        <RestrictedNotice title="Clinical review is restricted for this role">
          {p.name} ({p.roleLabel}) sees queue counts only. Participant names in the queue, result values, review flags, advice and participant reports are visible to clinical roles, and release is for the clinical reviewer.
          {p.perms.has("identity.resolve") ? " You can still resolve laboratory identity exceptions in Imports." : ""}
        </RestrictedNotice>
      </div>
      {p.perms.has("identity.resolve") ? <div style={{ marginTop: 12 }}><Button icon="arrow" onClick={() => nav.go({ page: "Results", tab: "imports" })}>Open Imports</Button></div> : null}
    </div>
  );
}

function ReviewWorkspace() {
  const state = usePhState();
  const p = persona(state);
  const nav = useNav();
  const canReview = p.perms.has("clinical.review");
  const stats = reviewStats(state);
  const queue = reviewQueue(state);
  const initialFilter = (["routine", "flagged", "aged"] as const).find((f) => f === nav.params.filter) || "all";
  const [filter, setFilter] = useState<QueueFilter>(initialFilter);
  const [q, setQ] = useState("");
  const [seen, setSeen] = useState<Record<string, true>>({});
  const [previewFor, setPreviewFor] = useState<string | null>(null);

  const routineOf = (i: ReviewItem) => i.routine;
  const query = q.trim().toLowerCase();
  const filtered = queue.filter((i) => {
    if (filter === "routine" && !routineOf(i)) return false;
    if (filter === "flagged" && !i.flagged) return false;
    if (filter === "aged" && !i.aged) return false;
    if (!query) return true;
    return `${i.person.given} ${i.person.family} ${i.episode.id} ${i.person.id} ${i.programme.code}`.toLowerCase().includes(query);
  });
  const paramId = nav.params.episode && ix(state).episodeById.has(nav.params.episode) ? nav.params.episode : null;
  const selectedId = paramId || (filtered[0] || queue[0])?.episode.id || null;
  const select = (id: string) => nav.setParams({ ...nav.params, episode: id });
  const b = selectedId ? episodeBundle(state, selectedId) : null;
  const inQueue = !!selectedId && queue.some((i) => i.episode.id === selectedId);
  const next = queue.find((i) => i.episode.id !== selectedId) || null;
  const setF = (f: QueueFilter) => setFilter(f === filter ? "all" : f);

  return (
    <div className="ph-page phr">
      <PageHeader title="Review"
        sub={`Assigned queue for ${stats.byAssignee.map((a) => staffName(state, a.staffId)).join(", ") || "the clinical reviewer"}. Each report is reviewed and released individually; the routine shortcut is one click for one eligible episode, never bulk.`}
        actions={<DemoTag>Sample data</DemoTag>} />
      <KpiStrip>
        <Kpi label="Ready for review" value={<Count n={stats.ready} unit="episodes" />} sub="All expected results accounted for" icon="eye" onClick={() => setFilter("all")} hint="Show the whole queue" />
        <Kpi label="Routine eligible" value={<Count n={stats.routine} unit="episodes" />} sub="No flags, holds or pending tests" icon="check" onClick={() => setF("routine")} hint="Filter the queue" />
        <Kpi label="Individually flagged" value={<Count n={stats.flagged} unit="episodes" />} sub="At least one value marked Review required" icon="flag" onClick={() => setF("flagged")} hint="Filter the queue" />
        <Kpi label="Over 48 hours" value={<Count n={stats.aged} unit="episodes" />} sub={`A subset of the ${stats.ready}, not an extra queue`} icon="clock" onClick={() => setF("aged")} hint="Filter the queue" />
      </KpiStrip>

      <div className="phr-rv" style={{ marginTop: 12 }}>
        <aside className="phr-rv-pane phr-rv-queue ph-card ph-pad-sm" aria-label="Review queue">
          <div className="phr-row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink)" }}>Assigned queue</span>
            <span className="phr-sub ph-num">{filtered.length} of {queue.length}</span>
          </div>
          <div className="phr-gap" style={{ gap: 6, marginBottom: 8 }}>
            <Select value={filter} onChange={(e) => setFilter(e.target.value as QueueFilter)} aria-label="Filter the queue">
              <option value="all">All ready ({stats.ready})</option>
              <option value="routine">Routine eligible ({stats.routine})</option>
              <option value="flagged">Individually flagged ({stats.flagged})</option>
              <option value="aged">Over 48 hours ({stats.aged})</option>
            </Select>
            <SearchBox value={q} onChange={setQ} placeholder="Name or ID" width="100%" />
          </div>
          {filtered.length ? (
            <div className="phr-list">
              {filtered.map((i) => <QueueItem key={i.episode.id} i={i} selected={i.episode.id === selectedId} routine={routineOf(i)} onSelect={() => select(i.episode.id)} />)}
            </div>
          ) : (
            <div className="phr-sub" style={{ padding: "10px 4px" }}>{queue.length ? "No episode matches this filter." : "The review queue is clear."}</div>
          )}
        </aside>

        {b ? (
          <>
            <section className="phr-rv-pane phr-rv-main phr-gap" aria-label="Episode values">
              <CentreMain b={b} inQueue={inQueue} />
            </section>
            <aside className="phr-rv-pane phr-rv-side phr-gap" aria-label="Review actions">
              <Actions b={b} canReview={canReview} previewSeen={!!seen[b.episode.id]} onOpenPreview={() => { setSeen((s) => ({ ...s, [b.episode.id]: true })); setPreviewFor(b.episode.id); }}
                onNext={next ? () => select(next.episode.id) : undefined} />
            </aside>
            <section className="phr-rv-pane phr-rv-more phr-gap" aria-label="Answers and history">
              <CentreMore b={b} />
            </section>
          </>
        ) : (
          <div className="phr-rv-pane phr-rv-main">
            <Card pad={false}>
              <EmptyState title="The review queue is clear" icon="check">Every ready episode has been reviewed. New episodes join when all of their expected results are accounted for.</EmptyState>
            </Card>
          </div>
        )}
      </div>

      {b && previewFor === b.episode.id ? (
        <PreviewModal open onClose={() => setPreviewFor(null)} episodeId={b.episode.id}
          advice={b.draft ? b.draft.advice : b.released ? b.released.advice : ""}
          versionLabel={previewLabel(b)} reviewer={staffName(state, b.episode.reviewAssigneeId)} />
      ) : null}
    </div>
  );
}

function previewLabel(b: Bundle): string {
  if (b.draft) return `Draft v${b.draft.version}${b.draft.correctionReason ? " (correction)" : ""}. Not visible to the participant until released.`;
  if (b.released) return `Released v${b.released.version}. Visible to the participant in the portal.`;
  const last = b.versions.length ? b.versions[b.versions.length - 1].version : 0;
  return `Draft v${last + 1}. Not visible to the participant until released.`;
}

function QueueItem({ i, selected, routine, onSelect }: { i: ReviewItem; selected: boolean; routine: boolean; onSelect: () => void }) {
  const state = usePhState();
  const clinical = canViewEpisodeClinical(state, i.episode.id);
  return (
    <button type="button" className="phr-item" aria-current={selected} onClick={onSelect}>
      <div className="ph-row-flex" style={{ gap: 6 }}>
        <span className="ph-grow ph-trunc" style={{ fontSize: 12.5, color: "var(--ink)", fontWeight: 500 }}>{i.person.given} {i.person.family}</span>
        <span className="phr-mono ph-faint" style={{ flex: "none" }} title="Time since the episode became ready">{fmtAge(i.ageHours)}</span>
      </div>
      <div className="ph-row-flex" style={{ gap: 6, marginTop: 2 }}>
        <span className="phr-mono ph-faint">{i.episode.id}</span>
        <span className="ph-faint" style={{ fontSize: 11 }}>{i.programme.code}</span>
      </div>
      <div className="phr-row" style={{ gap: 4, marginTop: 5 }}>
        {!clinical ? <Pill tone="neutral" icon="lock">Flags restricted</Pill>
          : i.flagged ? <Pill tone="warn" icon="flag">Review required</Pill>
          : routine ? <Pill tone="info" icon="check">Routine eligible</Pill>
          : <Pill tone="neutral" icon="eye">Individual review</Pill>}
        {i.aged ? <Pill tone="warn" icon="clock">Over 48h</Pill> : null}
      </div>
    </button>
  );
}

function CentreMain({ b, inQueue }: { b: Bundle; inQueue: boolean }) {
  const state = usePhState();
  const p = persona(state);
  const show = canViewEpisodeClinical(state, b.episode.id);
  return (
    <>
      <EpisodeHeader b={b} />
      {!inQueue && b.episode.reportState !== "ready_for_review" ? <div className="phr-sub">Opened from a link. This episode is not in the review queue.</div> : null}
      <StateBanner b={b} canResolve={p.perms.has("identity.resolve")} />
      {!show ? (
        <RestrictedNotice title="Values restricted for this role">
          {p.name} ({p.roleLabel}) can see clinical values only for sessions they are assigned to. This episode was collected at another session, so its values, measurements and answers are hidden.
        </RestrictedNotice>
      ) : (
        <>
          <ResultsTable b={b} showValues />
          <MeasuresCard b={b} showValues />
        </>
      )}
    </>
  );
}

function CentreMore({ b }: { b: Bundle }) {
  const state = usePhState();
  const show = canViewEpisodeClinical(state, b.episode.id);
  return (
    <>
      {show ? <AnswersCard b={b} /> : null}
      <EpisodeHistory b={b} />
    </>
  );
}

function Actions({ b, canReview, previewSeen, onOpenPreview, onNext }: { b: Bundle; canReview: boolean; previewSeen: boolean; onOpenPreview: () => void; onNext?: () => void }) {
  const state = usePhState();
  const p = persona(state);
  const show = canViewEpisodeClinical(state, b.episode.id);
  const st = b.episode.reportState;
  if (!canReview) {
    return (
      <>
        <RestrictedNotice title="Review actions are for the clinical reviewer">
          {p.name} ({p.roleLabel}) can view this workspace. Advice, the release checklist and release are restricted to the clinical review role.
        </RestrictedNotice>
        {show && (st === "ready_for_review" || st === "released") ? <PreviewCard b={b} onOpen={onOpenPreview} seen={previewSeen} mode="review" /> : null}
      </>
    );
  }
  if (st === "released") return <ReleasedCard b={b} onNext={onNext} />;
  if (st !== "ready_for_review") {
    return (
      <Card pad="sm">
        <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink)" }}>Release not available</div>
        <div className="phr-note" style={{ marginTop: 6 }}>
          {st === "on_hold" ? "This episode is on hold. Resolve the hold first; the episode then joins the review queue." : "Expected results are still missing. Missing tests are never treated as normal."}
        </div>
        {onNext ? <div style={{ marginTop: 10 }}><Button size="sm" icon="arrow" onClick={onNext}>Back to the queue</Button></div> : null}
      </Card>
    );
  }
  return (
    <>
      <ReleaseCard b={b} mode="review" canAct previewSeen={previewSeen || !!b.draft?.checklist.preview} />
      <FlagsCard b={b} canAct />
      <AdviceCard b={b} editable mode="review" />
      <PreviewCard b={b} onOpen={onOpenPreview} seen={previewSeen} mode="review" />
    </>
  );
}
