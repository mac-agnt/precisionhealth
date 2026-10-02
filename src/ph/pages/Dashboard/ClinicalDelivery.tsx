/* Clinical Delivery dashboard: the authorised clinical view of report workflow. 225 episodes
   partitioned into released, ready, awaiting and held; reviewer workload; ageing buckets derived
   from timestamps; expected-test completion; follow-up tasks. Every queue has a real link.
   Roles without clinical access get counts only, with no names, flags or values. */
import {
  HOLD_CATEGORY_LABEL, HOLD_LABEL, PROGRAMME_BY_ID, PROGRAMME_ORDER, canViewEpisodeClinical, expectedTests, fmtAge, fmtWhen, followUpList, holdCounts, holdQueue, linkFor,
  personName, programmeCounts, rate, reviewQueue, reviewStats, staffName,
} from "../../model";
import type { HoldCategory, NavTarget, PhState, ProgrammeId, ReportState } from "../../model";
import { useNav } from "../../nav-context";
import { usePersona, usePhState } from "../../store";
import {
  Card, CardHeader, Columns, EntityLink, HBars, Kpi, KpiStrip, PALETTE, PageHeader, Pill, ProgressBar, RestrictedNotice, Split, Stacked,
} from "../../ui";
import type { Tone } from "../../ui";
import { KpiBand } from "./KpiBand";
import type { BandKpi } from "./KpiBand";
import { AsOf, GoButton, Note } from "./shared";

type QueueKey = "released" | "ready" | "awaiting" | "held";
const QUEUE_LABEL: Record<QueueKey, string> = { released: "Released", ready: "Ready for review", awaiting: "Awaiting results", held: "On hold" };
const QUEUE_COLOR: Record<QueueKey, string> = { released: "var(--ok)", ready: "var(--accent)", awaiting: PALETTE[2], held: "var(--warn)" };
const QUEUE_ORDER: QueueKey[] = ["released", "ready", "awaiting", "held"];

/** Where each queue is worked. Released episodes are listed in Results, Corrections. */
function queueTarget(q: QueueKey, programmeId?: ProgrammeId): NavTarget {
  const extra: Record<string, string> = programmeId ? { programme: programmeId } : {};
  switch (q) {
    case "released": return { page: "Results", tab: "corrections", params: extra };
    case "ready": return { page: "Results", tab: "review", params: extra };
    case "awaiting": return { page: "Results", tab: "inbox", params: { queue: "awaiting", ...extra } };
    case "held": return { page: "Results", tab: "inbox", params: { queue: "held", ...extra } };
  }
}

export default function ClinicalDelivery() {
  const p = usePersona();
  if (!p.perms.has("clinical.view")) return <RestrictedView />;
  return <ClinicalView />;
}

/* ---- roles without clinical access: counts they may see, no clinical detail ---- */
function RestrictedView() {
  const s = usePhState();
  const p = usePersona();
  const T = programmeCounts(s);
  const H = holdCounts(s);
  return (
    <div className="ph-page">
      <PageHeader title="Clinical Delivery" sub="Report workflow for clinical reviewers and nurses." actions={<AsOf nowUtc={s.clock.nowUtc} />} />
      <div className="ph-stack">
        <RestrictedNotice title="Clinical detail is limited to clinical roles">
          {p.name} ({p.roleLabel}) sees queue counts only. Results, flags, participant names and reviewer workload are shown to clinical reviewers and nurses.
          This is a frontend visibility simulation, not production security.
        </RestrictedNotice>
        <KpiStrip>
          <Kpi label="Screening episodes" value={T.episodes} sub={`One per attended appointment (${T.attended} attended)`} />
          <Kpi label="Released" value={T.released} sub={`of ${T.episodes} episodes (${rate(T.released, T.episodes)})`} />
          <Kpi label="Ready for review" value={T.ready} sub={`of ${T.episodes} episodes, awaiting clinician review`} />
          <Kpi label="Awaiting results" value={T.awaiting} sub={`of ${T.episodes} episodes`} />
          <Kpi label="On hold" value={T.onHold} sub={`${H.identity} identity, ${H.dataQuality} data quality${H.clinicalAction ? ", clinical action assigned" : ""}`} />
        </KpiStrip>
        <Card>
          <CardHeader title="What you can open" sub="Queues and pages available to this role." />
          <div className="ph-wrap">
            {p.perms.has("imports.view") ? <GoButton to={{ page: "Results", tab: "imports", params: { batch: "BATCH-20261002-01" } }}>{`Identity exceptions (${H.identity} held episodes)`}</GoButton> : null}
            <GoButton to={{ page: "Dashboard", tab: "executive" }}>Executive dashboard</GoButton>
            <GoButton to={{ page: "Dashboard", tab: "clinic-operations" }}>Clinic Operations</GoButton>
            {p.perms.has("reports.build") ? <GoButton to={{ page: "Reporting", tab: "overview" }}>Employer reporting</GoButton> : null}
          </div>
          <Note icon="lock">Holds have separate categories: identity, data quality and clinical action. Clinical action detail stays with clinicians.</Note>
        </Card>
      </div>
    </div>
  );
}

/* ---- the clinical view ---- */
function ClinicalView() {
  const s = usePhState();
  const nav = useNav();
  const T = programmeCounts(s);
  const RS = reviewStats(s);
  const fu = followUpList(s);
  const openFu = fu.filter((f) => f.followUp.status === "open");
  const overdueFu = openFu.filter((f) => f.overdue);
  const urgent = openFu.find((f) => f.followUp.kind === "urgent_clinical_contact");

  const items: BandKpi[] = [
    { key: "episodes", label: "Screening episodes", value: T.episodes, icon: "layers", sub: `One per attended appointment (${T.attended} attended)` },
    { key: "released", label: "Released", value: T.released, icon: "check", sub: `of ${T.episodes} episodes (${rate(T.released, T.episodes)})`, onClick: () => nav.go(queueTarget("released")), hint: "Open released episodes" },
    { key: "ready", label: "Ready for review", value: RS.ready, icon: "file", sub: `${RS.routine} routine, ${RS.flagged} individually flagged`, onClick: () => nav.go(queueTarget("ready")), hint: "Open the review queue" },
    { key: "aged", label: "Waiting over 48 hours", value: RS.aged, icon: "clock", tone: RS.aged ? "warn" : "ok", status: `${RS.aged} of ${RS.ready} ready`,
      sub: "Part of the ready queue, not an extra queue", onClick: () => nav.go(queueTarget("ready")), hint: "Open the review queue" },
    { key: "followup", label: "Open follow-up", value: openFu.length, icon: "phone", tone: overdueFu.length ? "bad" : openFu.length ? "warn" : "ok",
      status: overdueFu.length ? `${overdueFu.length} overdue` : urgent ? `Urgent, due ${fmtWhen(urgent.followUp.dueAt, s.clock.nowUtc)}` : "None urgent",
      sub: `${fu.length - openFu.length} closed with a documented outcome`, onClick: () => nav.go(urgent ? linkFor("followup", urgent.followUp.id) : { page: "Results", tab: "follow-up" }), hint: "Open follow-up" },
  ];

  return (
    <div className="ph-page">
      <KpiBand eyebrow="Clinical delivery" title="Report workflow and review" right={<AsOf nowUtc={s.clock.nowUtc} />} items={items} />
      <div className="ph-stack" style={{ marginTop: 14 }}>
        <PartitionCard />
        <Split main={<AgeingCard />} side={<WorkloadCard />} />
        <Split even main={<ExpectedTestsCard />} side={<FollowUpCard />} />
        <HoldsCard />
      </div>
    </div>
  );
}

/* ---- 225 episodes, one primary state each ---- */
function PartitionCard() {
  const s = usePhState();
  const nav = useNav();
  const T = programmeCounts(s);
  const count = (q: QueueKey, id?: ProgrammeId) => {
    const c = id ? programmeCounts(s, id) : T;
    return q === "released" ? c.released : q === "ready" ? c.ready : q === "awaiting" ? c.awaiting : c.onHold;
  };
  const cell = (q: QueueKey, id?: ProgrammeId) => {
    const n = count(q, id);
    const who = id ? PROGRAMME_BY_ID[id].clientName : "all programmes";
    return <button type="button" className="ph-link ph-num" onClick={() => nav.go(queueTarget(q, id))} aria-label={`${QUEUE_LABEL[q]}, ${who}: ${n} episodes. Open queue`}>{n}</button>;
  };
  return (
    <Card>
      <CardHeader title="Report workflow" sub={`${T.episodes} screening episodes, each in exactly one primary state: ${T.released} + ${T.ready} + ${T.awaiting} + ${T.onHold} = ${T.released + T.ready + T.awaiting + T.onHold}.`} />
      <Stacked total={T.episodes} height={16} segments={QUEUE_ORDER.map((q) => ({ label: QUEUE_LABEL[q], value: count(q), color: QUEUE_COLOR[q] }))} />
      <div className="ph-tablewrap" style={{ marginTop: 14 }}>
        <table className="ph-table" style={{ minWidth: 520, whiteSpace: "nowrap" }}>
          <caption style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Episodes by report state and programme. Each count opens its queue.</caption>
          <thead>
            <tr>
              <th>Programme</th><th style={{ textAlign: "right" }}>Episodes</th>
              {QUEUE_ORDER.map((q) => <th key={q} style={{ textAlign: "right" }}><span className="ph-row-flex" style={{ gap: 6, justifyContent: "flex-end" }}><span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 3, background: QUEUE_COLOR[q] }} />{QUEUE_LABEL[q]}</span></th>)}
            </tr>
          </thead>
          <tbody>
            {PROGRAMME_ORDER.map((id) => (
              <tr key={id}>
                <td><EntityLink kind="programme" id={id}>{PROGRAMME_BY_ID[id].name}</EntityLink></td>
                <td className="num">{programmeCounts(s, id).episodes}</td>
                {QUEUE_ORDER.map((q) => <td key={q} className="num">{cell(q, id)}</td>)}
              </tr>
            ))}
            <tr style={{ background: "var(--surface-faint)" }}>
              <td style={{ fontWeight: 600, color: "var(--ink)" }}>All programmes</td>
              <td className="num" style={{ fontWeight: 600 }}>{T.episodes}</td>
              {QUEUE_ORDER.map((q) => <td key={q} className="num" style={{ fontWeight: 600 }}>{cell(q)}</td>)}
            </tr>
          </tbody>
        </table>
      </div>
      <Note>Select any count to open that queue. Released reports can still have an open follow-up task; report state and follow-up state are separate fields.</Note>
    </Card>
  );
}

/* ---- ageing derived from the time each report became ready ---- */
function AgeingCard() {
  const s = usePhState();
  const nav = useNav();
  const RS = reviewStats(s);
  const q = reviewQueue(s);
  const oldest = q.slice().sort((a, b) => b.ageHours - a.ageHours).slice(0, 6);
  const data = [
    { key: "lt24", label: "Under 24h", value: RS.buckets.lt24, color: "var(--accent)" },
    { key: "h24to48", label: "24 to 48h", value: RS.buckets.h24to48, color: PALETTE[1] },
    { key: "h48to72", label: "48 to 72h", value: RS.buckets.h48to72, color: "var(--warn)" },
    { key: "gt72", label: "Over 72h", value: RS.buckets.gt72, color: "var(--bad)" },
  ];
  return (
    <Card>
      <CardHeader title="Review queue ageing" sub={`Hours since each of the ${RS.ready} ready reports became ready. ${RS.aged} have waited over 48 hours.`}
        right={<GoButton to={queueTarget("ready")}>Review queue</GoButton>} />
      <Columns data={data} height={128} onSelect={() => nav.go(queueTarget("ready"))} caption={`Ready reports by waiting time, out of ${RS.ready}: ${data.map((d) => `${d.label} ${d.value}`).join(", ")}`} />
      <div className="ph-eyebrow" style={{ marginTop: 16, marginBottom: 6 }}>Longest waiting</div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {oldest.map((i) => {
          const ok = canViewEpisodeClinical(s, i.episode.id);
          return (
            <li key={i.episode.id} className="ph-row-flex" style={{ gap: 10, padding: "8px 0", borderTop: "1px solid var(--border)", fontSize: 12.5 }}>
              <EntityLink kind="episode" id={i.episode.id} />
              <span className="ph-grow ph-trunc" style={{ color: "var(--body)" }}>{ok ? `${personName(i.person)}, ${i.programme.clientName}` : `${i.programme.clientName}, another clinic team`}</span>
              <span className="ph-num ph-dim" style={{ flex: "none" }}>{fmtAge(i.ageHours)}</span>
              {!ok ? <Pill tone="neutral" icon="lock">Restricted</Pill> : i.flagged ? <Pill tone="warn" icon="flag">Review required</Pill> : <Pill tone="ok">Routine</Pill>}
            </li>
          );
        })}
      </ul>
      <Note>Buckets come from each episode's ready time against the demo clock. Every report is reviewed and released individually.</Note>
    </Card>
  );
}

/* ---- reviewer workload ---- */
function WorkloadCard() {
  const s = usePhState();
  const RS = reviewStats(s);
  const rows = RS.byAssignee.map((a) => ({
    key: a.staffId || "unassigned", label: a.staffId ? staffName(s, a.staffId) : "Unassigned", value: a.ready,
    sub: `${a.routine} routine, ${a.flagged} flagged, ${a.aged} over 48 hours`,
  }));
  return (
    <Card>
      <CardHeader title="Reviewer workload" sub={`${RS.ready} ready reports by assigned reviewer.`} />
      {rows.length ? <HBars rows={rows} max={Math.max(1, RS.ready)} valueFmt={(n) => `${n} of ${RS.ready}`} /> : <Note icon="check">No reports are waiting for review.</Note>}
      <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 6 }}>
        <div className="ph-row-flex" style={{ fontSize: 12 }}><span className="ph-grow ph-dim">Routine (eligible for one-click release)</span><span className="ph-num" style={{ color: "var(--ink)" }}>{RS.routine}</span></div>
        <div className="ph-row-flex" style={{ fontSize: 12 }}><span className="ph-grow ph-dim">Individually flagged</span><span className="ph-num" style={{ color: "var(--ink)" }}>{RS.flagged}</span></div>
      </div>
      <div className="ph-wrap" style={{ marginTop: 12, marginLeft: -8, gap: 4 }}>
        <GoButton to={queueTarget("ready")}>Review queue</GoButton>
        <GoButton to={{ page: "Work", tab: "approvals" }} icon="check">Approvals</GoButton>
      </div>
    </Card>
  );
}

/* ---- expected tests across unreleased episodes ---- */
function testGroups(s: PhState) {
  return (["ready_for_review", "awaiting_results", "on_hold"] as ReportState[]).map((st) => {
    const eps = s.episodes.filter((e) => e.reportState === st);
    let expected = 0, received = 0, quarantined = 0;
    for (const e of eps) {
      const t = expectedTests(s, e);
      expected += t.length;
      received += t.filter((x) => x.status === "received").length;
      quarantined += t.filter((x) => x.status === "quarantined").length;
    }
    return { st, episodes: eps.length, expected, received, quarantined, pending: expected - received - quarantined };
  });
}

function ExpectedTestsCard() {
  const s = usePhState();
  const groups = testGroups(s);
  const expected = groups.reduce((n, g) => n + g.expected, 0);
  const received = groups.reduce((n, g) => n + g.received, 0);
  const label: Record<string, string> = { ready_for_review: "Ready for review", awaiting_results: "Awaiting results", on_hold: "On hold" };
  const target: Record<string, NavTarget> = { ready_for_review: queueTarget("ready"), awaiting_results: queueTarget("awaiting"), on_hold: queueTarget("held") };
  return (
    <Card>
      <CardHeader title="Expected-test completion" sub={`Results received against tests expected for the ${groups.reduce((n, g) => n + g.episodes, 0)} unreleased episodes.`}
        right={<GoButton to={queueTarget("awaiting")}>Awaiting tests</GoButton>} />
      <div className="ph-row-flex" style={{ alignItems: "baseline", gap: 8 }}>
        <span className="ph-num" style={{ fontSize: 24, fontWeight: 600, color: "var(--ink)", letterSpacing: "-.6px" }}>{received}</span>
        <span className="ph-dim" style={{ fontSize: 12.5 }}>of {expected} expected tests received ({rate(received, expected)})</span>
      </div>
      <div style={{ marginTop: 8 }}><ProgressBar value={received} max={expected} label={`${received} of ${expected} expected tests received`} /></div>
      <div className="ph-tablewrap" style={{ marginTop: 14 }}>
        <table className="ph-table" style={{ minWidth: 400, whiteSpace: "nowrap" }}>
          <caption style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Expected tests by report state</caption>
          <thead><tr><th>State</th><th style={{ textAlign: "right" }}>Episodes</th><th style={{ textAlign: "right" }}>Received</th><th style={{ textAlign: "right" }}>Pending</th><th style={{ textAlign: "right" }}>Held rows</th></tr></thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.st}>
                <td><EntityLinkLike to={target[g.st]}>{label[g.st]}</EntityLinkLike></td>
                <td className="num">{g.episodes}</td>
                <td className="num">{g.received} of {g.expected}</td>
                <td className="num">{g.pending}</td>
                <td className="num">{g.quarantined}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Note>Pending tests stay pending. A missing or not-done result never counts as received or normal. Held rows wait in the laboratory import quarantine.</Note>
    </Card>
  );
}

function EntityLinkLike({ to, children }: { to: NavTarget; children: string }) {
  const nav = useNav();
  return <button type="button" className="ph-link" onClick={() => nav.go(to)}>{children}</button>;
}

/* ---- follow-up tasks ---- */
function FollowUpCard() {
  const s = usePhState();
  const list = followUpList(s);
  return (
    <Card>
      <CardHeader title="Follow-up tasks" sub="Clinician-owned. A contact attempt or a delivery receipt never closes one."
        right={<GoButton to={{ page: "Results", tab: "follow-up" }}>Follow-up</GoButton>} />
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {list.map((f) => {
          const open = f.followUp.status === "open";
          const tone: Tone = !open ? "ok" : f.overdue ? "bad" : f.followUp.kind === "urgent_clinical_contact" ? "warn" : "info";
          return (
            <li key={f.followUp.id} className="ph-row-flex" style={{ alignItems: "flex-start", gap: 10, padding: "10px 0", borderTop: "1px solid var(--border)" }}>
              <div className="ph-grow">
                <div className="ph-row-flex" style={{ gap: 8, flexWrap: "wrap" }}>
                  <EntityLink kind="followup" id={f.followUp.id} />
                  <span style={{ fontSize: 12.5, color: "var(--ink)", fontWeight: 500 }}>{f.followUp.kind === "urgent_clinical_contact" ? "Urgent clinical contact" : "Routine call-back"}</span>
                </div>
                <div className="ph-dim" style={{ fontSize: 11.5, marginTop: 3, lineHeight: 1.45 }}>
                  {canViewEpisodeClinical(s, f.episode.id) ? personName(f.person) : "Participant detail restricted to the clinic team"}, <EntityLink kind="episode" id={f.episode.id} />. Owner {staffName(s, f.followUp.ownerId)}.
                  {open ? ` Due ${fmtWhen(f.followUp.dueAt, s.clock.nowUtc)}.` : ""} {f.attempts} contact {f.attempts === 1 ? "attempt" : "attempts"} recorded.
                </div>
              </div>
              <Pill tone={tone}>{!open ? "Closed with outcome" : f.overdue ? "Overdue" : "Open"}</Pill>
            </li>
          );
        })}
      </ul>
      {!list.length ? <Note icon="check">No follow-up tasks.</Note> : null}
    </Card>
  );
}

/* ---- holds, each with its category and next step ---- */
const CATEGORY_TONE: Record<HoldCategory, Tone> = { identity: "warn", data_quality: "info", clinical_action: "bad" };
function HoldsCard() {
  const s = usePhState();
  const holds = holdQueue(s).slice().sort((a, b) => (a.category === b.category ? a.episode.id.localeCompare(b.episode.id) : a.category.localeCompare(b.category)));
  const H = holdCounts(s);
  const next = (h: (typeof holds)[number]): { to: NavTarget; label: string } => {
    if (h.category === "identity") return { to: h.episode.hold?.rowId ? linkFor("row", h.episode.hold.rowId) : linkFor("batch", "BATCH-20261002-01"), label: "Resolve identity" };
    if (h.category === "clinical_action" && h.episode.hold?.followUpId) return { to: linkFor("followup", h.episode.hold.followUpId), label: "Open follow-up" };
    return { to: linkFor("episode", h.episode.id), label: "Open episode" };
  };
  return (
    <Card pad={false}>
      <div style={{ padding: "16px 18px 4px" }}>
        <CardHeader title="Held episodes" sub={`${H.total} held: ${H.identity} identity, ${H.dataQuality} data quality, ${H.clinicalAction} clinical action. Different categories with different owners.`}
          right={<GoButton to={queueTarget("held")}>Held queue</GoButton>} />
      </div>
      <div className="ph-tablewrap">
        <table className="ph-table" style={{ minWidth: 640, whiteSpace: "nowrap" }}>
          <caption style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Held episodes with category, reason and next step</caption>
          <thead><tr><th>Episode</th><th>Participant</th><th>Category</th><th>Reason</th><th style={{ textAlign: "right" }}>Held for</th><th>Next step</th></tr></thead>
          <tbody>
            {holds.map((h) => {
              const n = next(h);
              // Capture nurses see participant detail for their own clinics only (canViewEpisodeClinical).
              const ok = canViewEpisodeClinical(s, h.episode.id);
              return (
                <tr key={h.episode.id}>
                  <td><EntityLink kind="episode" id={h.episode.id} /></td>
                  <td>{ok ? personName(h.person) : <span className="ph-faint">Restricted</span>}<span className="ph-faint" style={{ display: "block", fontSize: 11 }}>{PROGRAMME_BY_ID[h.episode.programmeId].clientName}</span></td>
                  <td><Pill tone={CATEGORY_TONE[h.category]}>{HOLD_CATEGORY_LABEL[h.category]}</Pill></td>
                  <td style={{ whiteSpace: "normal", minWidth: 180 }}>{ok || h.category !== "clinical_action" ? HOLD_LABEL[h.kind] : "Clinical action assigned"}</td>
                  <td className="num">{fmtAge(h.ageHours)}</td>
                  <td><EntityLinkLike to={n.to}>{n.label}</EntityLinkLike></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!holds.length ? <div style={{ padding: "0 18px 16px" }}><Note icon="check">No episodes are on hold.</Note></div> : <div style={{ padding: "4px 18px 14px" }}><Note>Held time runs from when the hold was raised. Identity holds clear only through the documented two-identifier resolution in Results, Imports.</Note></div>}
    </Card>
  );
}
