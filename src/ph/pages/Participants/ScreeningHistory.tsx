/* Participants, Screening History: an episode-centred table and a person timeline covering
   appointment, form version, observations, calculations, review, report versions and
   follow-up. Clinical roles see clinical items (capture roles for their own sessions only).
   Operations see a workflow-only view: clinical content is unavailable in that preview. */
import { useMemo, useRef, useState } from "react";
import {
  ANALYTES, PROGRAMME_ORDER, REPORT_STATE_LABEL, bmiOf, canViewEpisodeClinical, episodeFlags, expectedTests, fmtDate, fmtDateTime, ix, linkFor,
  personName, staffName, versionsOf,
} from "../../model";
import type { Episode, Id, PhState, ProgrammeId, ReportState } from "../../model";
import { useNav } from "../../nav-context";
import { usePersona, usePhState } from "../../store";
import {
  Button, Card, CardHeader, DataTable, DemoTag, EmptyState, EntityLink, Icon, PageHeader, Pill, RestrictedNotice, SearchBox, Select,
} from "../../ui";
import type { Column } from "../../ui";
import { buildHistory } from "./timeline";
import type { HistItem } from "./timeline";
import { Facts, FilterChips, SectionTitle, StatusPill, Timeline, clinicalStatus, cmp, holdLine, holdReason, opsStatus, useMeasure, withParams } from "./shared";
import type { TimelineEntry } from "./shared";

type StateFilter = "all" | ReportState;
const STATE_FILTERS: Array<{ id: StateFilter; label: string }> = [
  { id: "all", label: "All episodes" },
  { id: "released", label: "Released" },
  { id: "ready_for_review", label: "Ready for review" },
  { id: "awaiting_results", label: "Awaiting results" },
  { id: "on_hold", label: "On hold" },
];

interface EpRow { ep: Episode; name: string; date: string; slot: string }

function toEntries(state: PhState, items: HistItem[], showEpisodeIds: boolean, onGo: (t: HistItem) => void): TimelineEntry[] {
  const I = ix(state);
  return items.map((it) => ({
    id: it.id,
    when: fmtDateTime(it.at),
    title: it.title,
    detail: it.detail,
    icon: it.icon,
    tone: it.tone,
    tag: `${it.episodeId && showEpisodeIds ? it.episodeId + ", " : ""}${I.programmeById.get(it.programmeId)?.clientName || ""}`,
    action: it.target ? <button type="button" className="ph-link" style={{ fontSize: 11.5 }} onClick={() => onGo(it)}>Open</button> : undefined,
  }));
}

/** When the context panel sits below the table (narrow layouts), bring it into view after a selection. */
function revealSide(el: HTMLElement | null) {
  if (!el) return;
  const table = el.previousElementSibling as HTMLElement | null;
  if (table && el.getBoundingClientRect().top > table.getBoundingClientRect().top + 40) {
    requestAnimationFrame(() => el.scrollIntoView({ behavior: "smooth", block: "start" }));
  }
}

export default function HistoryTab() {
  const p = usePersona();
  return p.perms.has("clinical.view") ? <ClinicalHistory /> : <OpsHistory />;
}

function LaterPhase() {
  return (
    <Card>
      <div className="pd-later">
        <div className="pd-later-frame" aria-hidden="true" />
        <div className="ph-grow">
          <div className="ph-row-flex" style={{ flexWrap: "wrap", gap: 8 }}>
            <span className="ph-h2">Longitudinal trends</span>
            <DemoTag>Later-phase capability</DemoTag>
          </div>
          <div className="ph-dim" style={{ fontSize: 12, lineHeight: 1.5, marginTop: 5 }}>
            Trends across screening episodes come in a later phase. Each person here has one episode in this demo, so there is nothing to trend, and no prior health history is invented to fill a chart.
          </div>
        </div>
      </div>
    </Card>
  );
}

/* ---- clinical roles ---- */
function ClinicalHistory() {
  const nav = useNav();
  const state = usePhState();
  const p = usePersona();
  const params = nav.params;
  const I = ix(state);
  const [q, setQ] = useState(params.q || "");
  const [wrapRef, width] = useMeasure<HTMLDivElement>();
  const programmeId = (PROGRAMME_ORDER as string[]).includes(params.programme) ? (params.programme as ProgrammeId) : "all";
  const sf = (STATE_FILTERS.some((f) => f.id === params.state) ? params.state : "all") as StateFilter;
  const limited = p.role === "clinical_capture";

  const visible = useMemo(() => state.episodes.filter((e) => canViewEpisodeClinical(state, e.id)), [state]);
  const base = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return visible
      .filter((e) => programmeId === "all" || e.programmeId === programmeId)
      .map((ep): EpRow => {
        const person = I.personById.get(ep.personId)!;
        const s = I.sessionById.get(ep.sessionId)!;
        const b = I.bookingById.get(ep.bookingId);
        return { ep, name: personName(person), date: s.date, slot: b?.slotStart || "" };
      })
      .filter((r) => !needle || `${r.name} ${r.ep.personId} ${r.ep.id}`.toLowerCase().includes(needle));
  }, [visible, programmeId, q, I]);
  const counts = useMemo(() => {
    const c: Record<StateFilter, number> = { all: base.length, released: 0, ready_for_review: 0, awaiting_results: 0, on_hold: 0 };
    base.forEach((r) => c[r.ep.reportState]++);
    return c;
  }, [base]);
  const rows = useMemo(() => (sf === "all" ? base : base.filter((r) => r.ep.reportState === sf)), [base, sf]);

  // Selection: a deep-linked episode, else the person's latest visible episode, else a sensible default.
  const requested = params.episode ? I.episodeById.get(params.episode) : undefined;
  const blocked = !!requested && !canViewEpisodeClinical(state, requested.id);
  const byPerson = params.person ? visible.filter((e) => e.personId === params.person).sort((a, b) => cmp(b.collectedAt, a.collectedAt))[0] : undefined;
  const mostRecent = rows.reduce<EpRow | undefined>((best, r) => (!best || r.date + r.slot > best.date + best.slot ? r : best), undefined);
  const selected: Episode | undefined = requested && !blocked ? requested : byPerson || (rows.find((r) => r.ep.id === "PH-E-0101") || mostRecent)?.ep;
  const sideRef = useRef<HTMLDivElement>(null);
  const select = (id: Id) => {
    nav.setParams(withParams(params, { episode: id, person: null }));
    revealSide(sideRef.current);
  };

  const versionsText = (ep: Episode) => {
    const vs = versionsOf(state, ep.id).filter((v) => v.releasedAt);
    if (!vs.length) return <span className="ph-faint">Not released</span>;
    return vs.map((v) => `v${v.version} ${v.status === "superseded" ? "superseded" : "released"}`).join(", ");
  };
  const all: Column<EpRow>[] = [
    { key: "episode", header: "Episode", sort: (a, b) => cmp(a.ep.id, b.ep.id), cell: (r) => <span className="ph-mono" style={{ color: "var(--ink)" }}>{r.ep.id}</span> },
    { key: "person", header: "Person", sort: (a, b) => cmp(a.name, b.name), cell: (r) => <div className="pd-person" style={{ maxWidth: 190 }}><span className="pd-person-name">{r.name}</span><span className="pd-person-id">{r.ep.personId}</span></div> },
    { key: "programme", header: "Programme", sort: (a, b) => cmp(a.ep.programmeId, b.ep.programmeId), cell: (r) => I.programmeById.get(r.ep.programmeId)?.clientName },
    { key: "attended", header: "Attended", sort: (a, b) => cmp(a.date + a.slot, b.date + b.slot), cell: (r) => <span className="ph-num">{fmtDate(r.date)}, {r.slot}</span> },
    { key: "form", header: "Form", cell: (r) => <span className="ph-num" title={`${r.ep.formSnapshot.templateId} version ${r.ep.formSnapshot.version}`}>v{r.ep.formSnapshot.version}</span> },
    {
      key: "report", header: "Report", sort: (a, b) => cmp(a.ep.reportState, b.ep.reportState),
      cell: (r) => (
        <div className="pd-person" style={{ gap: 3, alignItems: "flex-start", maxWidth: 230 }}>
          <StatusPill s={clinicalStatus(r.ep)} />
          {r.ep.reportState === "on_hold" ? <span className="pd-person-id ph-trunc" style={{ maxWidth: 230 }}>{holdLine(r.ep)}</span> : null}
        </div>
      ),
    },
    { key: "versions", header: "Versions", cell: (r) => versionsText(r.ep) },
    { key: "followup", header: "Follow-up", cell: (r) => { const f = I.followUpsByEpisode.get(r.ep.id) || []; return f.length ? f.map((x) => `${x.id} ${x.status}`).join(", ") : <span className="ph-faint">None</span>; } },
  ];
  const keep = width && width < 520 ? ["episode", "person", "report"] : width && width < 700 ? ["episode", "person", "attended", "report"] : width && width < 880 ? ["episode", "person", "programme", "attended", "report"] : width && width < 1020 ? ["episode", "person", "programme", "attended", "report", "versions"] : null;
  const columns = keep ? all.filter((c) => keep.includes(c.key)) : all;

  return (
    <div className="ph-page">
      <PageHeader
        title="Screening history"
        sub="Episode-centred. One episode per attended appointment in this baseline. A person can hold more than one episode without programmes being merged."
        actions={<DemoTag title="Sample values. Fictional people.">Sample data</DemoTag>}
      />
      {limited ? (
        <div style={{ marginBottom: 14 }}>
          <RestrictedNotice title="Limited to your assigned sessions">
            {p.name} ({p.roleLabel}) sees the {visible.length} episodes from sessions they were assigned to, out of {state.episodes.length} in total. Reviewers and the nursing lead see all of them.
          </RestrictedNotice>
        </div>
      ) : null}
      <div className="ph-split">
        <div className="ph-stack">
          <Card pad={false}>
            <div className="pd-filters">
              <SearchBox value={q} onChange={setQ} placeholder="Search person, person ID or episode" width={260} />
              <Select value={programmeId} onChange={(e) => nav.setParams(withParams(params, { programme: e.target.value === "all" ? null : e.target.value }))} aria-label="Programme" style={{ width: 200 }}>
                <option value="all">All programmes</option>
                {PROGRAMME_ORDER.map((id) => <option key={id} value={id}>{I.programmeById.get(id)?.name}</option>)}
              </Select>
              <FilterChips label="Report state" value={sf} onChange={(v) => nav.setParams(withParams(params, { state: v === "all" ? null : v }))} options={STATE_FILTERS.map((f) => ({ id: f.id, label: f.label, count: counts[f.id] }))} />
            </div>
            <div ref={wrapRef}>
              <DataTable
                rows={rows}
                columns={columns}
                rowKey={(r) => r.ep.id}
                onRowClick={(r) => select(r.ep.id)}
                selectedKey={selected?.id || null}
                caption="Screening episodes"
                initialSort={{ key: "attended", dir: -1 }}
                pageSize={15}
                footerNote={<>episodes{sf !== "all" ? `, ${REPORT_STATE_LABEL[sf as ReportState].toLowerCase()}` : ""}. The four report states are mutually exclusive.</>}
                empty={<EmptyState title="No episodes match" icon="search">Clear the search, programme or report state filter.</EmptyState>}
              />
            </div>
          </Card>
        </div>
        <div className="ph-stack" ref={sideRef}>
          {blocked ? (
            <RestrictedNotice title={`${requested!.id} is outside your assigned sessions`}>
              {p.name} ({p.roleLabel}) cannot see clinical content for that episode. Select an episode from the table instead.
            </RestrictedNotice>
          ) : null}
          {selected ? <EpisodeSummary episode={selected} /> : <Card><EmptyState title="Select an episode" icon="layers">The person timeline appears here.</EmptyState></Card>}
          {selected ? <PersonTimeline personId={selected.personId} clinical /> : null}
          <LaterPhase />
        </div>
      </div>
    </div>
  );
}

function EpisodeSummary({ episode: ep }: { episode: Episode }) {
  const state = usePhState();
  const nav = useNav();
  const I = ix(state);
  const person = I.personById.get(ep.personId)!;
  const s = I.sessionById.get(ep.sessionId)!;
  const b = I.bookingById.get(ep.bookingId);
  const tpl = state.forms.templates.find((t) => t.id === ep.formSnapshot.templateId);
  const blocks = Object.entries(ep.formSnapshot.blocks).map(([id, v]) => `${state.forms.blocks.find((x) => x.id === id)?.name || id} ${v}`);
  const tests = expectedTests(state, ep);
  const flags = episodeFlags(state, ep);
  const bmi = bmiOf(ep.capture);
  const versions = versionsOf(state, ep.id);
  const fus = I.followUpsByEpisode.get(ep.id) || [];
  return (
    <Card>
      <CardHeader
        eyebrow="Selected episode"
        title={<span className="ph-mono">{ep.id}</span>}
        sub={<>{personName(person)} ({person.id}), {I.programmeById.get(ep.programmeId)?.name}</>}
        right={<StatusPill s={clinicalStatus(ep)} />}
      />
      {ep.hold ? (
        <div className="pd-callout warn" style={{ marginBottom: 12 }}>
          <Icon name="alert" size={15} style={{ color: "var(--warn)", marginTop: 1 }} />
          <span><strong style={{ color: "var(--ink)", fontWeight: 600 }}>{holdLine(ep)}.</strong> {holdReason(ep)}</span>
        </div>
      ) : null}
      <Facts rows={[
        ["Appointment", <>{b ? <EntityLink kind="booking" id={b.id} /> : null} {fmtDate(s.date)}, {b?.slotStart}, {s.siteName}</>],
        ["Nurse", staffName(state, s.nurseId)],
        ["Form snapshot", <>{tpl?.name || ep.formSnapshot.templateId} version {ep.formSnapshot.version}<span className="ph-faint" style={{ display: "block", fontSize: 11.5 }}>{blocks.join(", ")}</span></>],
        ["Expected tests", (
          <div className="pd-chip-row">
            {tests.map((t) => (
              <span key={t.code} className="pd-test" title={t.status === "received" ? "Received" : t.status === "quarantined" ? "Row held for identity resolution" : "Not received yet"} style={t.status === "received" ? undefined : { background: t.status === "quarantined" ? "var(--warn-soft)" : "var(--surface-2)", color: t.status === "quarantined" ? "var(--warn)" : "var(--dim)" }}>
                <Icon name={t.status === "received" ? "check" : t.status === "quarantined" ? "alert" : "clock"} size={11} stroke={2} />
                {ANALYTES[t.code].name}{t.addOn ? " (add-on)" : ""}
              </span>
            ))}
          </div>
        )],
        ["BMI", bmi != null ? `${bmi.toFixed(1)} kg/m² (calculated)` : "Not calculated: height or weight missing"],
        ["Review flags", flags.length ? <span style={{ color: "var(--warn)" }}>Review required: {flags.map((f) => f.text).join("; ")}</span> : "None against the displayed illustrative limits"],
        ["Report versions", versions.length ? versions.map((v) => `v${v.version} ${v.status.replace("_", " ")}${v.releasedAt ? ` ${fmtDate(v.releasedAt)}` : ""}`).join(", ") : "None yet"],
        ["Follow-up", fus.length ? fus.map((f) => <span key={f.id} style={{ display: "block" }}><EntityLink kind="followup" id={f.id} /> {f.status}, owner {staffName(state, f.ownerId)}</span>) : "None"],
      ]} />
      <div className="ph-wrap" style={{ marginTop: 12 }}>
        <Button size="sm" variant="primary" icon="eye" onClick={() => nav.go(linkFor("episode", ep.id))}>Open in Results review</Button>
        <Button size="sm" icon="user" onClick={() => nav.go(linkFor("person", ep.personId))}>Directory record</Button>
      </div>
      <div className="ph-faint" style={{ fontSize: 11, marginTop: 10, lineHeight: 1.45 }}>Illustrative display limits, clinician-owned. Sample values, not real results.</div>
    </Card>
  );
}

function PersonTimeline({ personId, clinical }: { personId: Id; clinical: boolean }) {
  const state = usePhState();
  const nav = useNav();
  const I = ix(state);
  const person = I.personById.get(personId);
  const items = useMemo(() => buildHistory(state, personId, (epId) => clinical && canViewEpisodeClinical(state, epId)), [state, personId, clinical]);
  const [newestFirst, setNewestFirst] = useState(false);
  if (!person) return null;
  const eps = I.episodesByPerson.get(personId) || [];
  const list = newestFirst ? items.slice().reverse() : items;
  return (
    <Card>
      <CardHeader
        title="Person timeline"
        sub={<>{personName(person)}, {eps.length} episode{eps.length === 1 ? "" : "s"}. Each item names its episode and programme.</>}
        right={<Button size="sm" variant="ghost" icon={newestFirst ? "up" : "down"} onClick={() => setNewestFirst(!newestFirst)}>{newestFirst ? "Newest first" : "Oldest first"}</Button>}
      />
      {!clinical ? (
        <div className="ph-faint" style={{ fontSize: 11.5, marginBottom: 12, lineHeight: 1.45 }}>Appointments, form versions, report release events and messages only. Observations, calculations and follow-up are limited to clinical roles.</div>
      ) : null}
      <Timeline items={toEntries(state, list, clinical, (it) => it.target && nav.go(it.target))} />
    </Card>
  );
}

/* ---- operations and other non-clinical roles ---- */
interface OpsRow { personId: Id; name: string; ep: Episode; date: string }
function OpsHistory() {
  const nav = useNav();
  const state = usePhState();
  const p = usePersona();
  const params = nav.params;
  const I = ix(state);
  const [q, setQ] = useState(params.q || "");
  const [wrapRef, width] = useMeasure<HTMLDivElement>();
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return state.episodes
      .map((ep): OpsRow => ({ personId: ep.personId, name: personName(I.personById.get(ep.personId)), ep, date: I.sessionById.get(ep.sessionId)!.date }))
      .filter((r) => !needle || `${r.name} ${r.personId}`.toLowerCase().includes(needle));
  }, [state, q, I]);
  const selectedId = params.person && I.episodesByPerson.has(params.person) ? params.person : rows.find((r) => r.personId === "PH-P-0001")?.personId || rows[0]?.personId;
  const opened = (ep: Episode) => versionsOf(state, ep.id).some((v) => v.accessedAt);
  const opsSideRef = useRef<HTMLDivElement>(null);
  const all: Column<OpsRow>[] = [
    { key: "person", header: "Person", sort: (a, b) => cmp(a.name, b.name), cell: (r) => <div className="pd-person" style={{ maxWidth: 200 }}><span className="pd-person-name">{r.name}</span><span className="pd-person-id">{r.personId}</span></div> },
    { key: "programme", header: "Programme", cell: (r) => I.programmeById.get(r.ep.programmeId)?.clientName },
    { key: "attended", header: "Attended", sort: (a, b) => cmp(a.date, b.date), cell: (r) => <span className="ph-num">{fmtDate(r.date)}</span> },
    { key: "status", header: "Report workflow", cell: (r) => <StatusPill s={opsStatus(r.ep)} /> },
    { key: "opened", header: "Opened in portal", cell: (r) => (r.ep.reportState === "released" ? (opened(r.ep) ? <Pill tone="ok" icon="eye">Opened</Pill> : <span className="ph-faint">Not yet</span>) : <span className="ph-faint">Not released</span>) },
  ];
  const keep = width && width < 520 ? ["person", "status"] : width && width < 720 ? ["person", "attended", "status"] : null;
  const columns = keep ? all.filter((c) => keep.includes(c.key)) : all;
  return (
    <div className="ph-page">
      <PageHeader title="Screening history" sub="Who attended, where each report is in its workflow, and the non-clinical timeline for each person." />
      <div style={{ marginBottom: 14 }}>
        <RestrictedNotice title="Clinical content is unavailable in the operations preview">
          {p.name} ({p.roleLabel}) sees appointments, form versions, report release events, report access and messages. Observations, calculations, flags, advice and follow-up detail are shown only to clinical roles. A clinician-assigned hold shows as "Clinical action assigned".
        </RestrictedNotice>
      </div>
      <div className="ph-split">
        <div className="ph-stack">
          <Card pad={false}>
            <div className="pd-filters">
              <SearchBox value={q} onChange={setQ} placeholder="Search person or person ID" width={260} />
              <span className="ph-faint" style={{ fontSize: 12 }}>Attended participants only. Everyone else is in the Directory.</span>
            </div>
            <div ref={wrapRef}>
              <DataTable
                rows={rows}
                columns={columns}
                rowKey={(r) => r.ep.id}
                onRowClick={(r) => { nav.setParams(withParams(params, { person: r.personId, episode: null })); revealSide(opsSideRef.current); }}
                pageSize={15}
                selectedKey={rows.find((r) => r.personId === selectedId)?.ep.id || null}
                initialSort={{ key: "attended", dir: -1 }}
                caption="Attended participants"
                footerNote="attended participants"
                empty={<EmptyState title="No one matches" icon="search">Try another name or person ID.</EmptyState>}
              />
            </div>
          </Card>
        </div>
        <div className="ph-stack" ref={opsSideRef}>
          {selectedId ? <PersonTimeline personId={selectedId} clinical={false} /> : <Card><EmptyState title="Select a person" icon="user">Their non-clinical timeline appears here.</EmptyState></Card>}
          <Card>
            <SectionTitle>What this role can see</SectionTitle>
            <div className="ph-dim" style={{ fontSize: 12, lineHeight: 1.55 }}>
              Workflow positions use the same records as the clinical view, so counts agree everywhere. Identity and data quality holds are operational and shown as such. Health classifications are never shown here.
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
