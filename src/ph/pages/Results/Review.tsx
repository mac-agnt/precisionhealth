/* Results, Review: one place for every report. A single chip row picks what the queue shows (to
   review, routine, flagged, over 48 hours, waiting for results, on hold, released), so the old Inbox
   is a filter here and #/Results/inbox still lands on it. Left, the queue: name, programme and age.
   Centre, the results viewer with the NEW ADVICE editor. Right, release. IDs sit behind Details.
   One report per release, never in bulk.
   Deep links: #/Results/review?episode=PH-E-0101, #/Results/review?filter=held, #/Results/inbox?queue=awaiting */
import { useState } from "react";
import {
  ADVICE_ROUTINE, canViewEpisodeClinical, episodeBundle, expectedTests, fmtAge, fmtWhen, holdQueue, hoursBetween, ix, labQueue, linkFor, openFollowUps, persona, reviewQueue, reviewStats, staffName,
} from "../../model";
import type { Episode, HoldItem, PhState, ReviewItem } from "../../model";
import { usePhState } from "../../store";
import { useNav } from "../../nav-context";
import { Button, Card, Chip, EmptyState, PageHeader, Pill, RestrictedNotice, SearchBox, Select } from "../../ui";
import { AnswersCard, EpisodeHeader, EpisodeHistory, NurseFormCard, ResultsTable, StateBanner } from "./EpisodePanels";
import type { Bundle } from "./EpisodePanels";
import { AdviceEditor, FlagsCard, PreviewCard, ReleaseCard, ReleaseUnavailableCard, ReleasedCard } from "./ReleasePanel";
import { PreviewModal } from "./ReportPreview";
import { ClinicalAlerts, ReviewSheet } from "./Sheet";
import { Banner } from "./shared";
import { AgentGuardNote, LabAware } from "./LabImport";
import { ReleasedList, ReporterCard, ReporterTabs, releasedEpisodes } from "./ReporterViews";
import type { ReporterFilter } from "./ReporterViews";
import { byReporter, reporterOf } from "./libraryModel";

export type QueueFilter = "all" | "routine" | "flagged" | "aged" | "awaiting" | "held" | "approved" | "amended";
const FILTERS: QueueFilter[] = ["all", "routine", "flagged", "aged", "awaiting", "held", "approved", "amended"];
const READY_FILTERS: QueueFilter[] = ["all", "routine", "flagged", "aged"];

/** The old Inbox queues, as Review filters: #/Results/inbox?queue=held opens Review on On hold. */
export function filterFromInbox(queue: string | undefined): QueueFilter {
  return queue === "awaiting" ? "awaiting" : queue === "held" || queue === "identity" ? "held" : "all";
}

export default function Review({ initial }: { initial?: QueueFilter }) {
  const state = usePhState();
  const p = persona(state);
  if (!p.perms.has("clinical.view")) return <ReviewRestricted />;
  return <ReviewWorkspace initial={initial} />;
}

/* Operations and reporting roles: counts in a sentence and the work they can do. */
function ReviewRestricted() {
  const state = usePhState();
  const p = persona(state);
  const nav = useNav();
  const s = reviewStats(state);
  const lab = p.perms.has("imports.view") ? labQueue(state).length : 0;
  return (
    <div className="ph-page phr">
      <PageHeader title="Review" sub="Doctors review and release each report here." />
      <Card>
        <div style={{ fontSize: 14, color: "var(--ink)", fontWeight: 600 }}>{s.ready} {s.ready === 1 ? "report is" : "reports are"} ready for a doctor{s.aged ? `, ${s.aged} waiting over 48 hours` : ""}.</div>
        <div className="phr-sub" style={{ marginTop: 4 }}>{p.name} ({p.roleLabel}) sees counts only. Names, results, advice and release are for the clinical team.</div>
        {p.perms.has("imports.view") ? (
          <div style={{ marginTop: 12 }}>
            <Button variant={lab ? "primary" : "secondary"} icon="arrow" onClick={() => nav.go({ page: "Results", tab: "imports", params: lab ? { view: "queue" } : {} })}>{lab ? `Match ${lab} lab ${lab === 1 ? "row" : "rows"}` : "Open Lab imports"}</Button>
          </div>
        ) : null}
      </Card>
    </div>
  );
}

/** One row in the left list: an episode with what the clinician needs to pick it. */
interface ListRow { episode: Episode; name: string; programme: string; ageHours: number; pill: { tone: "warn" | "info" | "neutral" | "bad"; text: string } | null; aged: boolean }

function ReviewWorkspace({ initial }: { initial?: QueueFilter }) {
  const state = usePhState();
  const p = persona(state);
  const nav = useNav();
  const I = ix(state);
  const canReview = p.perms.has("clinical.review");
  const stats = reviewStats(state);
  const queue = reviewQueue(state);
  const held = holdQueue(state);
  const awaiting = state.episodes.filter((e) => e.reportState === "awaiting_results");
  const released = releasedEpisodes(state);
  const filter: QueueFilter = FILTERS.find((f) => f === nav.params.filter) || initial || (nav.params.view === "approved" || nav.params.view === "amended" ? nav.params.view : "all");
  const setFilter = (f: QueueFilter) => { const next: Record<string, string> = { filter: f }; for (const k of ["reporter", "programme", "q"]) if (nav.params[k]) next[k] = nav.params[k]; nav.setParams(next); };
  const [reporter, setReporter] = useState<ReporterFilter>(nav.params.reporter === "liz" || nav.params.reporter === "neil" ? nav.params.reporter : "all");
  const q = nav.params.q || "";
  const setQ = (v: string) => { const x: Record<string, string> = { ...nav.params, q: v }; if (!v) delete x.q; nav.setParams(x); };
  const prog = nav.params.programme || "";
  const setProg = (v: string) => { const x: Record<string, string> = { ...nav.params, programme: v }; if (!v) delete x.programme; delete x.episode; nav.setParams(x); };
  const [seen, setSeen] = useState<Record<string, true>>({});
  const [previewFor, setPreviewFor] = useState<string | null>(null);
  // Advice as typed in the NEW ADVICE box, so the preview shows it before the draft save lands.
  const [typed, setTyped] = useState<Record<string, string>>({});
  const query = q.trim().toLowerCase();
  const hit = (e: Episode) => {
    if (prog && e.programmeId !== prog) return false;
    if (!query) return true;
    const per = I.personById.get(e.personId);
    return `${per?.given} ${per?.family} ${e.id} ${e.screeningRef}`.toLowerCase().includes(query);
  };

  const now = state.clock.nowUtc;
  const isReady = READY_FILTERS.includes(filter);
  const readyRows: ListRow[] = byReporter(state, queue, reporter).filter((i) => (filter === "routine" ? i.routine : filter === "flagged" ? i.flagged : filter === "aged" ? i.aged : true))
    .filter((i) => hit(i.episode)).map((i) => readyRow(state, i));
  const awaitRows: ListRow[] = awaiting.filter(hit).map((e) => {
    const per = I.personById.get(e.personId)!;
    const pending = expectedTests(state, e).filter((t) => t.status !== "received").length;
    return { episode: e, name: `${per.given} ${per.family}`, programme: I.programmeById.get(e.programmeId)?.name || "", ageHours: hoursBetween(e.collectedAt, now), pill: { tone: "neutral", text: `${pending} ${pending === 1 ? "test" : "tests"} to come` }, aged: false };
  });
  const heldRows: ListRow[] = held.filter((h) => hit(h.episode)).map((h: HoldItem) => ({
    episode: h.episode, name: `${h.person.given} ${h.person.family}`, programme: I.programmeById.get(h.episode.programmeId)?.name || "", ageHours: h.ageHours,
    pill: { tone: h.category === "clinical_action" ? "bad" : "warn", text: h.category === "identity" ? "Lab row to match" : h.category === "data_quality" ? "Unit to confirm" : "Follow-up open" }, aged: false,
  }));
  const rows = isReady ? readyRows : filter === "awaiting" ? awaitRows : filter === "held" ? heldRows : [];

  const paramId = nav.params.episode && I.episodeById.has(nav.params.episode) ? nav.params.episode : null;
  const listIds = filter === "approved" || filter === "amended" ? released[filter].filter(({ id }) => hit(I.episodeById.get(id)!)).map((r) => r.id) : rows.map((r) => r.episode.id);
  const selectedId = paramId || listIds[0] || queue[0]?.episode.id || null;
  const select = (id: string) => nav.setParams({ ...nav.params, episode: id });
  const b = selectedId ? episodeBundle(state, selectedId) : null;
  const next = queue.find((i) => i.episode.id !== selectedId) || null;
  const lab = p.perms.has("imports.view") ? labQueue(state).length : 0;
  const urgent = p.perms.has("followup.view") ? openFollowUps(state).filter((f) => f.followUp.kind === "urgent_clinical_contact") : [];
  const counts: Record<QueueFilter, number> = {
    all: stats.ready, routine: stats.routine, flagged: stats.flagged, aged: stats.aged, awaiting: awaiting.length, held: held.length, approved: released.approved.length, amended: released.amended.length,
  };
  const LABEL: Record<QueueFilter, string> = { all: "To review", routine: "Routine", flagged: "Flagged", aged: "Over 48 hours", awaiting: "Waiting for results", held: "On hold", approved: "Released", amended: "Amended" };

  return (
    <div className="ph-page phr">
      <PageHeader title="Review" sub="Pick a report, read the results, write the advice and release it. One report at a time."
        actions={<Button variant="primary" icon="plus" onClick={() => nav.go({ page: "Screening", tab: "new" })}>New screening</Button>} />
      <div className="phr-chips" role="group" aria-label="Show">
        {FILTERS.filter((f) => f !== "amended" || counts.amended > 0).map((f) => <Chip key={f} on={filter === f} onClick={() => setFilter(f)} count={counts[f]}>{LABEL[f]}</Chip>)}
      </div>
      {lab || urgent.length ? (
        <div className="phr-gap" style={{ marginTop: 10 }}>
          {urgent.map((f) => (
            <Banner key={f.followUp.id} tone={f.overdue ? "bad" : "warn"} icon="flag" action={<Button size="sm" onClick={() => nav.go(linkFor("followup", f.followUp.id))}>Open follow-up</Button>}>
              <b>Urgent contact {f.overdue ? "overdue" : "due"} {fmtWhen(f.followUp.dueAt, now)}:</b> {f.person.given} {f.person.family}, owner {staffName(state, f.followUp.ownerId)}.
            </Banner>
          ))}
          {lab ? (
            <Banner tone="warn" icon="alert" action={<Button size="sm" onClick={() => nav.go({ page: "Results", tab: "imports", params: { view: "queue" } })}>Match them</Button>}>
              <b>{lab} lab {lab === 1 ? "result needs" : "results need"} matching</b> before {lab === 1 ? "its report" : "their reports"} can be reviewed.
            </Banner>
          ) : null}
        </div>
      ) : null}

      <div className="phr-rv" style={{ marginTop: 12 }}>
        <aside className="phr-rv-pane phr-rv-queue ph-card ph-pad-sm" aria-label="Review queue">
          <div className="phr-row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink)" }}>{LABEL[filter]}</span>
            <span className="phr-sub ph-num">{listIds.length}</span>
          </div>
          <div className="phr-gap" style={{ gap: 6, marginBottom: 8 }}>
            {isReady ? <ReporterTabs value={reporter} onChange={setReporter} /> : null}
            <SearchBox value={q} onChange={setQ} placeholder="Name or Precision ID" width="100%" />
            <Select value={prog} onChange={(ev) => setProg(ev.target.value)} aria-label="Client">
              <option value="">All clients</option>
              {state.programmes.map((pg) => <option key={pg.id} value={pg.id}>{pg.clientName}</option>)}
            </Select>
          </div>
          {filter === "approved" || filter === "amended" ? <ReleasedList view={filter} selectedId={selectedId} onSelect={select} query={query} /> : rows.length ? (
            <div className="phr-list">
              {rows.map((r) => <QueueItem key={r.episode.id} r={r} selected={r.episode.id === selectedId} onSelect={() => select(r.episode.id)} />)}
            </div>
          ) : (
            <div className="phr-sub" style={{ padding: "10px 4px" }}>{query ? "Nobody matches this search." : isReady && reporter !== "all" ? `Nothing assigned to ${reporter === "liz" ? "Liz" : "Neil"} right now.` : filter === "held" ? "Nothing is on hold." : filter === "awaiting" ? "No report is waiting for results." : "Nothing to review here."}</div>
          )}
        </aside>

        {b ? (
          <>
            <section className="phr-rv-pane phr-rv-main phr-gap" aria-label="Results">
              <CentreMain b={b} canReview={canReview} onAdviceText={(t) => setTyped((x) => ({ ...x, [b.episode.id]: t }))} />
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
              <EmptyState title="Nothing to review" icon="check">Every ready report has been reviewed. New reports join when all of their results are in.</EmptyState>
            </Card>
          </div>
        )}
      </div>

      {b && previewFor === b.episode.id ? (
        <PreviewModal open onClose={() => setPreviewFor(null)} episodeId={b.episode.id}
          advice={previewAdvice(b, typed[b.episode.id])}
          versionLabel={previewLabel(b)} />
      ) : null}
    </div>
  );
}

function readyRow(state: PhState, i: ReviewItem): ListRow {
  const clinical = canViewEpisodeClinical(state, i.episode.id);
  const pill: ListRow["pill"] = !clinical ? { tone: "neutral", text: "Restricted" } : i.flagged ? { tone: "warn", text: `${i.flags.length} to check` } : i.routine ? { tone: "info", text: "All normal" } : null;
  return { episode: i.episode, name: `${i.person.given} ${i.person.family}`, programme: i.programme.name, ageHours: i.ageHours, pill, aged: i.aged };
}

/** The advice the participant would see: the released text once released, otherwise what is typed or drafted,
    or for an all normal report the approved routine wording the shortcut will use. */
function previewAdvice(b: Bundle, typed: string | undefined): string {
  if (b.episode.reportState === "released" && !b.draft) return b.released ? b.released.advice : "";
  const draft = typed ?? (b.draft ? b.draft.advice : "");
  if (draft.trim()) return draft;
  return b.routine.ok ? ADVICE_ROUTINE[Number(b.episode.id.slice(-1)) % ADVICE_ROUTINE.length] : draft;
}

function previewLabel(b: Bundle): string {
  if (b.draft) return `Draft v${b.draft.version}${b.draft.correctionReason ? " (correction)" : ""}. Not visible to the participant until released.`;
  if (b.released) return `Released v${b.released.version}. Visible to the participant in the portal.`;
  const last = b.versions.length ? b.versions[b.versions.length - 1].version : 0;
  return `Draft v${last + 1}. Not visible to the participant until released.`;
}

/** Name, programme and how long it has waited. IDs live behind Details in the header. */
function QueueItem({ r, selected, onSelect }: { r: ListRow; selected: boolean; onSelect: () => void }) {
  const state = usePhState();
  return (
    <button type="button" className="phr-item" aria-current={selected} onClick={onSelect}>
      <div className="ph-row-flex" style={{ gap: 6 }}>
        <span className="ph-grow ph-trunc" style={{ fontSize: 12.5, color: "var(--ink)", fontWeight: 500 }}>{r.name}</span>
        <span className="ph-faint ph-num" style={{ flex: "none", fontSize: 11, color: r.aged ? "var(--warn)" : undefined }} title="How long it has waited">{fmtAge(r.ageHours)}</span>
      </div>
      <div className="ph-trunc ph-faint" style={{ fontSize: 11.5, marginTop: 1 }}>{r.programme}</div>
      {r.pill || r.episode.reportState === "awaiting_results" ? (
        <div className="phr-row" style={{ gap: 4, marginTop: 5 }}>
          {r.episode.reportState === "awaiting_results" ? <LabAware state={state} ep={r.episode}><Pill tone="neutral" icon="clock">{r.pill?.text}</Pill></LabAware> : r.pill ? <Pill tone={r.pill.tone} icon={null}>{r.pill.text}</Pill> : null}
          {r.episode.reportState === "ready_for_review" && reporterOf(state, r.episode) === "liz" ? <span className="phr-sub">Liz reports</span> : null}
        </div>
      ) : null}
    </button>
  );
}

function CentreMain({ b, canReview, onAdviceText }: { b: Bundle; canReview: boolean; onAdviceText: (text: string) => void }) {
  const state = usePhState();
  const p = persona(state);
  const show = canViewEpisodeClinical(state, b.episode.id);
  const st = b.episode.reportState;
  const editable = canReview && st === "ready_for_review";
  const note = !canReview ? `Advice is written by the clinical reviewer. ${p.name} can read it.`
    : st === "on_hold" ? "Advice opens once the hold is resolved and the episode is ready for review."
    : st === "awaiting_results" ? "Advice opens once every expected result is accounted for."
    : st === "released" ? "Released advice. A change needs a correction, which creates a new version."
    : undefined;
  return (
    <>
      <EpisodeHeader b={b} compact />
      <StateBanner b={b} canResolve={p.perms.has("identity.resolve")} />
      {!show ? (
        <RestrictedNotice title="Values restricted for this role">
          {p.name} ({p.roleLabel}) can see clinical values only for sessions they are assigned to. This episode was collected at another session, so its values, measurements and answers are hidden.
        </RestrictedNotice>
      ) : (
        <>
          <ClinicalAlerts b={b} />
          <ReviewSheet b={b} advice={<AdviceEditor key={b.episode.id} b={b} variant="sheet" editable={editable} readOnlyNote={note} onTextChange={onAdviceText} />} />
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
      {show ? <NurseFormCard b={b} /> : null}
      {show ? <ResultsTable b={b} showValues collapsed /> : null}
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
  if (st === "released") return <><ReleasedCard b={b} onNext={onNext} /><AgentGuardNote /></>;
  if (st !== "ready_for_review") {
    return (
      <>
        <ReleaseUnavailableCard b={b} onNext={onNext} />
        {show ? <FlagsCard b={b} canAct={false} /> : null}
      </>
    );
  }
  return (
    <>
      <ReporterCard b={b} />
      <ReleaseCard b={b} mode="review" canAct previewSeen={previewSeen || !!b.draft?.checklist.preview} />
      <FlagsCard b={b} canAct />
      <PreviewCard b={b} onOpen={onOpenPreview} seen={previewSeen} mode="review" />
      <AgentGuardNote />
    </>
  );
}
