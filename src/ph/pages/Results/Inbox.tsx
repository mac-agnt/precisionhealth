/* Results, Inbox: four separate actionable queues. Awaiting tests (episodes), identity
   exceptions (laboratory rows), ready for review (episodes) and held episodes, each with its
   unit, so no single unexplained risk number appears. Deep link: #/Results/inbox?queue=held */
import { useState } from "react";
import {
  HOLD_LABEL, STORY_DEFS, awaitingQueue, canViewEpisodeClinical, expectedTestCompletion, expectedTests, fmtAge, fmtDate, fmtWhen, holdCounts, holdQueue,
  hoursBetween, inboxQueues, ix, linkFor, openFollowUps, persona, reviewQueue, reviewStats, staffName, storyView, totalCounts,
} from "../../model";
import type { Episode, HoldItem, ImportRow, InboxQueue, ReviewItem } from "../../model";
import { usePhState } from "../../store";
import { useNav } from "../../nav-context";
import {
  Button, Card, CardHeader, Chip, DataTable, DemoTag, EmptyState, Icon, PALETTE, PageHeader, Pill, ProgressBar, RestrictedNotice, Split, Stacked,
} from "../../ui";
import type { Column, GlyphName } from "../../ui";
import { Banner, Count, HoldCategoryPill, QUARANTINE_LABEL, useWidth } from "./shared";
import { openUnitIssues } from "./select";

type QueueId = InboxQueue["id"];
const ICON: Record<QueueId, GlyphName> = { awaiting: "clock", identity: "alert", ready: "eye", held: "flag" };

export default function Inbox() {
  const state = usePhState();
  const p = persona(state);
  const nav = useNav();
  const queues = inboxQueues(state);
  const def: QueueId = p.perms.has("clinical.review") ? "ready" : p.perms.has("identity.resolve") ? "identity" : "awaiting";
  const queue: QueueId = queues.find((x) => x.id === nav.params.queue)?.id || def;
  const setQueue = (id: QueueId) => nav.setParams({ queue: id });
  const hc = holdCounts(state);
  const rs = reviewStats(state);
  const pendingTests = awaitingQueue(state).reduce((n, e) => n + expectedTests(state, e).filter((t) => t.status !== "received").length, 0);
  const sub: Record<QueueId, string> = {
    awaiting: `${pendingTests} expected tests not yet received in these episodes`,
    identity: `${hc.identity} episodes held for identity`,
    ready: `${rs.aged} over 48 hours, included`,
    held: `${hc.identity} identity, ${hc.dataQuality} data quality, ${hc.clinicalAction} clinical action`,
  };
  const urgent = p.perms.has("followup.view") ? openFollowUps(state).filter((f) => f.followUp.kind === "urgent_clinical_contact") : [];
  const current = queues.find((x) => x.id === queue)!;

  return (
    <div className="ph-page phr">
      <PageHeader title="Inbox" sub="Separate queues for results work. Laboratory rows and screening episodes are different units and are never added together." />
      {urgent.map((f) => (
        <div key={f.followUp.id} style={{ marginBottom: 12 }}>
          <Banner tone={f.overdue ? "bad" : "warn"} icon="flag"
            action={<Button size="sm" onClick={() => nav.go(linkFor("followup", f.followUp.id))}>Open follow-up</Button>}>
            <b>{f.overdue ? "Overdue" : "Due"} {fmtWhen(f.followUp.dueAt, state.clock.nowUtc)}:</b> clinician-assigned urgent contact {f.followUp.id} for {f.person.given} {f.person.family}, owner {staffName(state, f.followUp.ownerId)}. {f.attempts ? `${f.attempts} contact attempts recorded; still open.` : "No contact attempt recorded yet."}
          </Banner>
        </div>
      ))}
      <div className="phr-tiles" role="group" aria-label="Queues">
        {queues.map((x) => (
          <button key={x.id} type="button" className="ph-card phr-tile" aria-pressed={queue === x.id} onClick={() => setQueue(x.id)} title={x.blurb}>
            <div className="ph-row-flex" style={{ gap: 7 }}>
              <span className="ph-eyebrow ph-grow ph-trunc">{x.label}</span>
              <Icon name={ICON[x.id]} size={13} style={{ color: "var(--faint)" }} />
            </div>
            <div className="phr-big" style={{ marginTop: 8 }}><Count n={x.count} unit={x.unit} /></div>
            <div className="phr-sub" style={{ marginTop: 5 }}>{sub[x.id]}</div>
          </button>
        ))}
      </div>
      <div style={{ marginTop: 14 }}>
        <Split
          main={
            <Card pad={false}>
              <div style={{ padding: "14px 16px 4px" }}>
                <CardHeader title={<>{current.label} <span className="phr-unit">{current.count} {current.unit}</span></>} sub={current.blurb} />
              </div>
              {queue === "awaiting" ? <AwaitingQueue /> : queue === "identity" ? <IdentityQueue /> : queue === "ready" ? <ReadyQueue /> : <HeldQueue />}
            </Card>
          }
          side={<InboxContext />}
        />
      </div>
    </div>
  );
}

/* ---- awaiting tests: episodes ---- */
interface AwaitRow { e: Episode; name: string; code: string; received: number; expected: number; pending: string[]; atLab: boolean }
function AwaitingQueue() {
  const state = usePhState();
  const nav = useNav();
  const p = persona(state);
  const [ref, w] = useWidth();
  const I = ix(state);
  const rows: AwaitRow[] = awaitingQueue(state).map((e) => {
    const t = expectedTests(state, e);
    const person = I.personById.get(e.personId)!;
    const spec = state.specimens.find((s) => s.episodeId === e.id);
    return { e, name: `${person.given} ${person.family}`, code: I.programmeById.get(e.programmeId)!.code, received: t.filter((x) => x.status === "received").length, expected: t.length, pending: t.filter((x) => x.status !== "received").map((x) => x.name), atLab: !!spec && spec.status !== "collected" };
  });
  const narrow = w > 0 && w < 560;
  const cols: Column<AwaitRow>[] = [
    { key: "ep", header: "Episode", cell: (r) => <div><div style={{ color: "var(--ink)" }}>{r.name}</div><div className="phr-mono ph-faint">{r.e.id} · {r.code}</div></div>, sort: (a, b) => (a.e.id < b.e.id ? -1 : 1) },
    ...(narrow ? [] : [{ key: "col", header: "Collected", cell: (r: AwaitRow) => fmtDate(r.e.collectedAt), sort: (a: AwaitRow, b: AwaitRow) => (a.e.collectedAt < b.e.collectedAt ? -1 : 1) }]),
    { key: "rec", header: "Results", cell: (r) => <div style={{ minWidth: 90 }}><div className="ph-num" style={{ fontSize: 12 }}>{r.received} of {r.expected} tests</div><div style={{ marginTop: 4 }}><ProgressBar value={r.received} max={r.expected} label={`${r.received} of ${r.expected} tests received`} /></div></div>, sort: (a, b) => a.received / a.expected - b.received / b.expected },
    ...(narrow ? [] : [{ key: "pend", header: "Pending", nowrap: false, cell: (r: AwaitRow) => <span style={{ fontSize: 12 }}>{r.pending.join(", ")}</span> }]),
    { key: "spec", header: "Specimen", cell: (r) => r.atLab ? <Pill tone="info" icon="flask">At laboratory</Pill> : <Pill tone="neutral" icon="clock">Not yet at laboratory</Pill> },
  ];
  return (
    <div ref={ref}>
      <DataTable rows={rows} columns={cols} rowKey={(r) => r.e.id} pageSize={15}
        onRowClick={p.perms.has("clinical.view") ? (r) => nav.go(linkFor("episode", r.e.id)) : undefined}
        empty={<EmptyState title="No episodes are waiting for results" icon="check">Every attended episode has its expected results accounted for.</EmptyState>}
        footerNote="Pending tests stay pending; they are never counted as normal." />
    </div>
  );
}

/* ---- identity exceptions: laboratory rows ---- */
function IdentityQueue() {
  const state = usePhState();
  const nav = useNav();
  const p = persona(state);
  const [ref, w] = useWidth();
  if (!p.perms.has("imports.view")) {
    const n = state.importRows.filter((r) => r.state === "quarantined").length;
    return (
      <div style={{ padding: "0 16px 16px" }}>
        <RestrictedNotice title="Import rows are restricted for this role">{n} laboratory rows are held for identity resolution. {p.name} ({p.roleLabel}) sees the count only; operations and the clinical reviewer resolve them in Imports.</RestrictedNotice>
      </div>
    );
  }
  const st = STORY_DEFS.find((s) => s.id === "ST-01")!;
  const rows = state.importRows.filter((r) => r.state === "quarantined");
  const resolvedToday = state.importRows.filter((r) => r.state === "resolved").length;
  const narrow = w > 0 && w < 560;
  const open = (r: ImportRow) => nav.go({ page: "Results", tab: "imports", params: { batch: r.batchId, row: r.id } });
  const heldFor = (r: ImportRow) => fmtAge(hoursBetween(state.batches.find((b) => b.id === r.batchId)?.processedAt || state.clock.nowUtc, state.clock.nowUtc));
  const cands = (r: ImportRow) => { const n = r.quarantine!.candidateEpisodeIds.length; return n === 0 ? "No collection record matched" : n === 1 ? `One candidate, ${r.quarantine!.candidateEpisodeIds[0]}` : `${n} candidate episodes`; };
  const cols: Column<ImportRow>[] = [
    { key: "row", header: "Row", cell: (r) => <div><div className="phr-mono" style={{ color: "var(--ink)" }}>{r.id.replace(r.batchId + "-", "")}, line {r.line}</div><div className="phr-mono ph-faint">{r.specimenKey}</div></div> },
    { key: "why", header: "Reason", cell: (r) => <div><Pill tone="warn" icon="alert">{QUARANTINE_LABEL[r.quarantine!.reason]}</Pill>{narrow ? null : <div className="phr-sub" style={{ marginTop: 3 }}>{cands(r)}</div>}</div> },
    ...(narrow ? [] : [{ key: "age", header: "Held for", cell: (r: ImportRow) => <span className="ph-num">{heldFor(r)}</span> }]),
    { key: "act", header: "", align: "right", cell: (r) => <Button size="sm" variant={p.perms.has("identity.resolve") ? "primary" : "secondary"} onClick={(e) => { e.stopPropagation(); open(r); }}>{p.perms.has("identity.resolve") ? "Resolve" : "View"}</Button> },
  ];

  return (
    <div ref={ref}>
      <div style={{ padding: "0 16px 10px" }} className="phr-sub">
        Owner {staffName(state, st.ownerId)} (operations), due {fmtWhen(st.dueAt!, state.clock.nowUtc)}; {staffName(state, st.secondaryOwnerId)} reviews the episodes clinically once identity is resolved. Nothing is matched automatically.
      </div>
      <DataTable rows={rows} columns={cols} rowKey={(r) => r.id} onRowClick={open}
        empty={<EmptyState title="No identity exceptions" icon="check">Every held laboratory row has been resolved with a documented check.{resolvedToday ? ` ${resolvedToday} rows were resolved and committed once.` : ""}</EmptyState>}
        footerNote={resolvedToday ? `${resolvedToday} rows already resolved and committed once.` : "Rows, not people."} />
    </div>
  );
}

/* ---- ready for review: episodes ---- */
function ReadyQueue() {
  const state = usePhState();
  const nav = useNav();
  const p = persona(state);
  const [ref, w] = useWidth();
  const [f, setF] = useState<"all" | "aged" | "flagged" | "routine">("all");
  const rs = reviewStats(state);
  if (!p.perms.has("clinical.view")) {
    return (
      <div style={{ padding: "0 16px 16px" }}>
        <RestrictedNotice title="Clinical queue">{rs.ready} episodes are ready for clinician review, {rs.aged} of them waiting over 48 hours. {p.name} ({p.roleLabel}) sees counts only.</RestrictedNotice>
      </div>
    );
  }
  const narrow = w > 0 && w < 560;
  const routineOf = (i: ReviewItem) => i.routine;
  const rows = reviewQueue(state).filter((i) => f === "all" || (f === "aged" && i.aged) || (f === "flagged" && i.flagged) || (f === "routine" && routineOf(i)));
  const cols: Column<ReviewItem>[] = [
    { key: "ep", header: "Episode", cell: (i) => <div><div style={{ color: "var(--ink)" }}>{i.person.given} {i.person.family}</div><div className="phr-mono ph-faint">{i.episode.id} · {i.programme.code}</div></div>, sort: (a, b) => (a.person.family < b.person.family ? -1 : 1) },
    { key: "wait", header: "Waiting", cell: (i) => <div className="phr-row" style={{ gap: 5 }}><span className="ph-num">{fmtAge(i.ageHours)}</span>{i.aged ? <Pill tone="warn" icon="clock">Over 48h</Pill> : null}</div>, sort: (a, b) => a.ageHours - b.ageHours },
    { key: "flags", header: "Review flags", cell: (i) => !canViewEpisodeClinical(state, i.episode.id) ? <Pill tone="neutral" icon="lock">Restricted</Pill> : i.flagged ? <Pill tone="warn" icon="flag">Review required ({i.flags.length})</Pill> : <Pill tone="neutral" icon="dot">None</Pill> },
    ...(narrow ? [] : [
      { key: "route", header: "Release route", cell: (i: ReviewItem) => !canViewEpisodeClinical(state, i.episode.id) ? <span className="ph-faint">Restricted</span> : routineOf(i) ? "Routine, one click" : "Individual review" },
      { key: "who", header: "Reviewer", cell: (i: ReviewItem) => staffName(state, i.episode.reviewAssigneeId) },
    ]),
  ];
  return (
    <div ref={ref}>
      <div className="phr-row" style={{ padding: "0 16px 10px" }}>
        <Chip on={f === "all"} onClick={() => setF("all")} count={rs.ready}>All</Chip>
        <Chip on={f === "aged"} onClick={() => setF("aged")} count={rs.aged}>Over 48 hours</Chip>
        <Chip on={f === "flagged"} onClick={() => setF("flagged")} count={rs.flagged}>Flagged</Chip>
        <Chip on={f === "routine"} onClick={() => setF("routine")} count={rs.routine}>Routine eligible</Chip>
      </div>
      <DataTable rows={rows} columns={cols} rowKey={(i) => i.episode.id} onRowClick={(i) => nav.go(linkFor("episode", i.episode.id))}
        empty={<EmptyState title="Nothing in this filter" icon="check">The review queue has no episode in this group.</EmptyState>}
        footerNote="Oldest first. Open an episode to review it in the workspace." />
    </div>
  );
}

/* ---- held episodes: three separate categories ---- */
function HeldQueue() {
  const state = usePhState();
  const nav = useNav();
  const p = persona(state);
  const [ref, w] = useWidth();
  const [cat, setCat] = useState<"all" | "identity" | "data_quality" | "clinical_action">("all");
  const hc = holdCounts(state);
  const clinical = p.perms.has("clinical.view");
  const fuView = p.perms.has("followup.view");
  const units = openUnitIssues(state);
  const narrow = w > 0 && w < 560;
  const rows = holdQueue(state).filter((h) => cat === "all" || h.category === cat);
  const minimal = (h: HoldItem) => h.category === "clinical_action" && !fuView;
  const next = (h: HoldItem) => {
    if (h.category === "identity" && h.episode.hold?.rowId) {
      const rowId = h.episode.hold.rowId;
      return p.perms.has("imports.view") ? <Button size="sm" onClick={() => nav.go({ page: "Results", tab: "imports", params: { batch: rowId.replace(/-R\d+$/, ""), row: rowId } })}>{p.perms.has("identity.resolve") ? "Resolve row" : "View row"}</Button> : <span className="phr-sub">Resolved in Imports</span>;
    }
    if (h.category === "data_quality") {
      const u = units.find((x) => x.episode.id === h.episode.id);
      return u && u.rowId && p.perms.has("imports.view") ? <Button size="sm" onClick={() => nav.go({ page: "Results", tab: "imports", params: { batch: u.rowId!.replace(/-R\d+$/, ""), row: u.rowId! } })}>{p.perms.has("clinical.review") ? "Confirm unit" : "View row"}</Button> : <span className="phr-sub">Clinical reviewer confirms</span>;
    }
    const fu = h.episode.hold?.followUpId;
    return fu && fuView ? <Button size="sm" onClick={() => nav.go(linkFor("followup", fu))}>Open follow-up</Button> : <span className="phr-sub">Clinician-owned</span>;
  };
  const cols: Column<HoldItem>[] = [
    { key: "ep", header: "Episode", cell: (h) => minimal(h) ? <div><div style={{ color: "var(--ink)" }}>Clinical action assigned</div><div className="phr-sub">Owned by a clinician</div></div> : <div><div style={{ color: "var(--ink)" }}>{h.person.given} {h.person.family}</div><div className="phr-mono ph-faint">{h.episode.id}</div></div> },
    { key: "cat", header: "Category", cell: (h) => <HoldCategoryPill category={h.category} label={minimal(h) ? "Clinical action assigned" : undefined} /> },
    ...(narrow ? [] : [
      { key: "hold", header: "Hold", nowrap: false, cell: (h: HoldItem) => minimal(h) ? <span className="ph-faint">Details visible to clinical roles</span> : h.category === "data_quality" && !clinical ? <span>Held by the clinical team for a data quality check</span> : <span style={{ fontSize: 12 }}>{HOLD_LABEL[h.kind]}</span> },
      { key: "since", header: "Since", cell: (h: HoldItem) => <span className="ph-num">{fmtAge(h.ageHours)}</span>, sort: (a: HoldItem, b: HoldItem) => a.ageHours - b.ageHours },
    ]),
    { key: "next", header: "Next step", align: "right", cell: (h) => next(h) },
  ];
  return (
    <div ref={ref}>
      <div className="phr-row" style={{ padding: "0 16px 10px" }}>
        <Chip on={cat === "all"} onClick={() => setCat("all")} count={hc.total}>All</Chip>
        <Chip on={cat === "identity"} onClick={() => setCat("identity")} count={hc.identity}>Identity</Chip>
        <Chip on={cat === "data_quality"} onClick={() => setCat("data_quality")} count={hc.dataQuality}>Data quality</Chip>
        <Chip on={cat === "clinical_action"} onClick={() => setCat("clinical_action")} count={hc.clinicalAction}>Clinical action</Chip>
      </div>
      <DataTable rows={rows} columns={cols} rowKey={(h) => h.episode.id}
        empty={<EmptyState title="No episodes on hold" icon="check">Holds clear when their identity, data quality or clinical action is resolved.</EmptyState>}
        footerNote="Identity exceptions, data quality holds and clinical actions are separate categories with separate owners." />
    </div>
  );
}

/* ---- context panel ---- */
function InboxContext() {
  const state = usePhState();
  const nav = useNav();
  const t = totalCounts(state);
  const etc = expectedTestCompletion(state);
  const quarantined = state.importRows.filter((r) => r.state === "quarantined").length;
  const idHeld = holdCounts(state).identity;
  let inImport = 0, atLab = 0;
  for (const e of state.episodes) {
    if (e.reportState === "released") continue;
    for (const x of expectedTests(state, e)) { if (x.status === "quarantined") inImport++; else if (x.status === "pending") atLab++; }
  }
  const stories = (["ST-01", "ST-02", "ST-04"] as const).map((id) => storyView(state, id));
  return (
    <>
      <Card>
        <CardHeader title="Where the episodes are" sub={`${t.episodes} attended episodes. Each is in exactly one report state.`} />
        <Stacked total={t.episodes} segments={[
          { label: "Released", value: t.released, color: "var(--ok)" },
          { label: "Ready for review", value: t.ready, color: "var(--accent)" },
          { label: "Awaiting results", value: t.awaiting, color: PALETTE[1] },
          { label: "On hold", value: t.onHold, color: "var(--warn)" },
        ]} />
        <div className="phr-sub" style={{ marginTop: 10 }}>
          Identity exceptions are counted in laboratory rows, not episodes: {quarantined} held {quarantined === 1 ? "row belongs" : "rows belong"} to {idHeld} {idHeld === 1 ? "episode" : "episodes"} on an identity hold.
        </div>
      </Card>
      <Card>
        <CardHeader title="Expected tests" sub="Across episodes not yet released" />
        <div className="phr-row" style={{ justifyContent: "space-between", fontSize: 12.5 }}>
          <span className="ph-num" style={{ color: "var(--ink)", fontWeight: 600 }}>{etc.received} of {etc.expected} received</span>
          <span className="ph-faint ph-num">{etc.pending} outstanding</span>
        </div>
        <div style={{ marginTop: 6 }}><ProgressBar value={etc.received} max={etc.expected} label="Expected tests received" /></div>
        <div className="phr-sub" style={{ marginTop: 8 }}>{atLab} not yet received from the laboratory and {inImport} held in import as identity exceptions. Missing tests are never shown as normal.</div>
      </Card>
      <Card>
        <CardHeader title="Linked work" right={<DemoTag>Fictional demo stories</DemoTag>} />
        <div className="phr-gap">
          {stories.map((s) => (
            <button key={s.def.id} type="button" className="phr-item" style={{ padding: "8px 8px" }} onClick={() => nav.go(s.target)}>
              <div className="ph-row-flex" style={{ gap: 6 }}>
                <span className="phr-mono ph-faint">{s.def.id}</span>
                <span className="ph-grow" />
                {s.open ? <Pill tone="info" icon="clock">Open</Pill> : <Pill tone="ok" icon="check">Done</Pill>}
              </div>
              <div style={{ fontSize: 12.5, color: "var(--ink)", marginTop: 3 }}>{s.headline}</div>
              <div className="phr-sub">Owner {s.ownerName}{s.secondaryName ? `, then ${s.secondaryName}` : ""}{s.dueAt ? `, due ${fmtWhen(s.dueAt, state.clock.nowUtc)}` : ""}</div>
            </button>
          ))}
        </div>
      </Card>
    </>
  );
}

