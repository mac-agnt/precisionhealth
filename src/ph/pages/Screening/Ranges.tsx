/* Reference ranges: every test from Precision Health's table, the version in force today, and a
   drawer per test with the generated sentence for each cohort, the bands, the cells as sent, open
   questions, gaps and overlaps, and the full version history. Superadmins edit from the drawer. */
import { useMemo, useState } from "react";
import {
  RR_BASIS_LABEL, RR_GROUPS, RR_QUESTIONS, RR_SOURCE_DOC, RR_TESTS, RR_TEST_BY_ID, cohortText, fmtDate, rowSentence, rrVersionsOf, today,
} from "../../model";
import type { RrGroup, RrTest, RrVersion } from "../../model";
import { dispatch, usePersona, usePhState } from "../../store";
import { Button, Card, Chip, DataTable, Drawer, Kpi, KpiStrip, PageHeader, Pill, SearchBox, Section, Segmented, Textarea } from "../../ui";
import type { Column } from "../../ui";
import { useNav } from "../../nav-context";
import { rrAct } from "./actions";
import { draftImpact, isSuperadmin, rowBandsShort, rrDiff, testStatus, versionIssues } from "./select";
import { BandsTable, Callout, VersionPill, staffNameOf, whoWhen } from "./shared";
import { RangeEditor } from "./Editor";

type Filter = "all" | "issues" | "confirm" | "notset" | "drafts";

export default function Ranges() {
  const s = usePhState();
  const nav = useNav();
  const [q, setQ] = useState("");
  const [group, setGroup] = useState<RrGroup | "all">("all");
  const [filter, setFilter] = useState<Filter>("all");
  const rows = useMemo(() => RR_TESTS.map((t) => ({ t, st: testStatus(s, t) })), [s]);
  const counts = {
    all: rows.length,
    issues: rows.filter((r) => r.st.issues.length).length,
    confirm: rows.filter((r) => r.st.open.length).length,
    notset: rows.filter((r) => r.st.notSet || r.st.partly).length,
    drafts: rows.filter((r) => r.st.draft).length,
  };
  const shown = rows.filter((r) => (group === "all" || r.t.group === group)
    && (!q || `${r.t.name} ${r.t.group} ${r.t.unit}`.toLowerCase().includes(q.toLowerCase()))
    && (filter === "all" || (filter === "issues" && r.st.issues.length) || (filter === "confirm" && r.st.open.length) || (filter === "notset" && (r.st.notSet || r.st.partly)) || (filter === "drafts" && r.st.draft)));
  const openId = nav.params.test || null;
  const t0 = today(s);
  const cohorts = rows.reduce((n, r) => n + (r.st.v?.rows.length || 0), 0);

  const cols: Column<(typeof rows)[number]>[] = [
    { key: "name", header: "Test", sort: (a, b) => a.t.name.localeCompare(b.t.name), cell: (r) => <div><div style={{ fontWeight: 500, color: "var(--ink)" }}>{r.t.name}</div><div className="ph-faint" style={{ fontSize: 11.5 }}>{r.t.group}</div></div> },
    { key: "unit", header: "Unit", nowrap: true, cell: (r) => <span className={/not supplied/i.test(r.t.unit) ? "ph-faint" : ""}>{r.t.unit}</span> },
    { key: "normal", header: "Normal range in force", cell: (r) => {
      const v = r.st.v;
      if (!v) return <span className="ph-faint">Not set</span>;
      if (r.t.kind === "recorded") return <span className="ph-faint">Recorded only</span>;
      return <div style={{ fontSize: 12, lineHeight: 1.45 }}>{v.rows.slice(0, 3).map((row) => <div key={row.id}>{v.rows.length > 1 ? <span className="ph-faint">{shortCohort(row.cohort)}: </span> : null}{rowBandsShort(r.t, row).split(" · ").find((x) => x.startsWith("NORMAL") || x.includes("REGULAR") || x.includes("NEGATIVE")) || rowBandsShort(r.t, row)}</div>)}{v.rows.length > 3 ? <div className="ph-faint">+{v.rows.length - 3} more</div> : null}</div>;
    } },
    { key: "ver", header: "Version", nowrap: true, cell: (r) => r.st.v ? <span className="ph-num">v{r.st.v.version} <span className="ph-faint">from {fmtDate(r.st.v.effectiveFrom)}</span></span> : "" },
    { key: "status", header: "Status", cell: (r) => (
      <div className="ph-row-flex ph-wrap" style={{ gap: 5 }}>
        {r.st.draft ? <Pill tone="warn" icon="edit">Draft v{r.st.draft.version}</Pill> : null}
        {r.st.issues.length ? <Pill tone="bad" icon="alert">{r.st.issues.length === 1 ? "1 gap or overlap" : `${r.st.issues.length} gaps or overlaps`}</Pill> : null}
        {r.st.notSet ? <Pill tone="neutral">Not set</Pill> : r.st.partly ? <Pill tone="neutral">Partly set</Pill> : null}
        {r.st.open.length ? <Pill tone="info">To confirm</Pill> : null}
        {r.st.scheduled.length ? <Pill tone="info" icon="calendar">v{r.st.scheduled[0].version} from {fmtDate(r.st.scheduled[0].effectiveFrom)}</Pill> : null}
        {r.st.recorded ? <Pill tone="neutral">Recorded only</Pill> : null}
        {!r.st.recorded && !r.st.draft && !r.st.issues.length && !r.st.notSet && !r.st.partly && !r.st.open.length ? <Pill tone="ok" icon="check">Set</Pill> : null}
      </div>) },
  ];

  return (
    <>
      <PageHeader eyebrow="Health Screening" title="Reference ranges"
        sub={<>Every test, cohort and band from {RR_SOURCE_DOC}. Each result is judged against the version in force on its sample date, and the version used is recorded. Only superadmins change ranges, always as a draft first.</>} />
      <KpiStrip>
        <Kpi label="Tests" value={rows.length} sub={`${cohorts} cohort ranges`} icon="flask" />
        <Kpi label="Gaps or overlaps found" value={counts.issues} tone={counts.issues ? "bad" : "ok"} sub="Values in no band, or in two" onClick={() => setFilter("issues")} />
        <Kpi label="To confirm" value={counts.confirm} tone={counts.confirm ? "info" : "ok"} sub="Defaults applied for now" onClick={() => setFilter("confirm")} />
        <Kpi label="Not set" value={counts.notset} tone="neutral" sub="Not supplied in the table" onClick={() => setFilter("notset")} />
        <Kpi label="Drafts waiting" value={counts.drafts} tone={counts.drafts ? "warn" : "ok"} sub="Not in use until published" onClick={() => setFilter("drafts")} />
      </KpiStrip>
      <Card>
        <div className="scr-filters">
          <SearchBox value={q} onChange={setQ} placeholder="Search tests" />
          <Segmented value={filter} onChange={setFilter} label="Filter" options={[
            { id: "all", label: "All", count: counts.all }, { id: "issues", label: "Gaps or overlaps", count: counts.issues }, { id: "confirm", label: "To confirm", count: counts.confirm },
            { id: "notset", label: "Not set", count: counts.notset }, { id: "drafts", label: "Drafts", count: counts.drafts }]} />
        </div>
        <div className="scr-chips" style={{ marginBottom: 12 }}>
          <Chip on={group === "all"} onClick={() => setGroup("all")}>All groups</Chip>
          {RR_GROUPS.map((g) => <Chip key={g} on={group === g} onClick={() => setGroup(g)} count={rows.filter((r) => r.t.group === g).length}>{g}</Chip>)}
        </div>
        <DataTable rows={shown} columns={cols} rowKey={(r) => r.t.id} pageSize={40} selectedKey={openId}
          onRowClick={(r) => nav.setParams({ test: r.t.id })} caption="Reference ranges"
          empty={<div className="ph-faint" style={{ padding: 20 }}>No tests match.</div>}
          footerNote={<>Range checks run on every save. Today in the demo: {fmtDate(t0)}.</>} />
      </Card>
      {openId && RR_TEST_BY_ID[openId] ? <TestDrawer test={RR_TEST_BY_ID[openId]} onClose={() => nav.setParams({})} /> : null}
    </>
  );
}

const shortCohort = (c: { sex: string; ageMin: number | null; ageMax: number | null; ethnicities: "any" | string[]; pregnancy: string }) =>
  [c.sex === "male" ? "M" : c.sex === "female" ? "F" : "", c.ageMin !== null || c.ageMax !== null ? `${c.ageMin ?? 0}${c.ageMax !== null ? `-${c.ageMax - 1}` : "+"}` : "", c.ethnicities !== "any" ? "ethnicity" : ""].filter(Boolean).join(" ") || "All";

export function TestDrawer({ test, onClose }: { test: RrTest; onClose: () => void }) {
  const s = usePhState();
  const p = usePersona();
  const su = isSuperadmin(s, p.id);
  const st = testStatus(s, test);
  const t0 = today(s);
  const [editing, setEditing] = useState<null | { base: RrVersion | null }>(null);
  const history = rrVersionsOf(s.referenceRanges.versions, test.id);
  const v = st.v;
  const questions = RR_QUESTIONS.filter((x) => test.questions.includes(x.id));

  return (
    <Drawer open onClose={onClose} width={760} title={test.name}
      sub={<>{test.group} · {test.unit} · {RR_BASIS_LABEL[test.basis]}{test.source ? <> · <a className="ph-link" href={test.source.url} target="_blank" rel="noreferrer">{test.source.label}</a></> : null}</>}
      footer={su ? <>
        {st.draft ? <Button onClick={() => setEditing({ base: st.draft })} icon="edit">Edit draft v{st.draft.version}</Button> : null}
        <Button variant="primary" icon="plus" disabled={!!st.draft} onClick={() => setEditing({ base: v })} title={st.draft ? "Publish or reject the open draft first" : undefined}>Propose a change</Button>
      </> : <span className="ph-faint" style={{ fontSize: 12 }}>Read only. Only superadmins ({s.referenceRanges.settings.superadmins.map((id) => staffNameOf(s, id)).join(", ")}) change ranges.</span>}>
      <div className="ph-stack" style={{ gap: 16 }}>
        {st.draft ? <DraftPanel draft={st.draft} test={test} /> : null}
        {st.scheduled.map((x) => <Callout key={x.id} tone="info" icon="calendar"><strong>Version {x.version} takes effect on {fmtDate(x.effectiveFrom)}.</strong> Results with a sample date from then use it; earlier results keep version {v ? v.version : "1"}. {x.reason}</Callout>)}

        <Section title={v ? `In force today: version ${v.version}` : "No version in force"} sub={v ? `Effective from ${fmtDate(v.effectiveFrom)}. ${v.reason}` : undefined}
          right={v ? <VersionPill v={v} today={t0} /> : null}>
          {v ? v.rows.map((row) => (
            <div className="scr-cohort" key={row.id}>
              <div className="scr-cohort-title">{cohortText(row.cohort)}</div>
              <p className="scr-sentence">{rowSentence(test, row)}</p>
              <BandsTable test={test} row={row} />
              {row.note ? <div className="ph-faint" style={{ fontSize: 11.5 }}>{row.note}</div> : null}
            </div>
          )) : <div className="ph-faint">Not set.</div>}
        </Section>

        {st.issues.length ? (
          <Callout tone="warn"><strong>Checked automatically: {st.issues.length === 1 ? "1 problem" : `${st.issues.length} problems`} in this range.</strong>
            <ul style={{ margin: "6px 0 0", paddingLeft: 16 }}>{st.issues.map((i, n) => <li key={n}>{i.row === "Cohorts" ? "" : `${i.row}: `}{i.text}{i.kind === "gap" ? " It goes to clinician review." : i.kind === "overlap" ? " The more severe band is used." : ""}</li>)}</ul>
          </Callout>) : null}

        {questions.length ? (
          <Section title="To confirm with Precision Health" sub="The default below is what this range uses until answered.">
            <ul className="scr-list">{questions.map((x) => {
              const a = s.referenceRanges.questions[x.id];
              return <li key={x.id}><div className="ph-row-flex" style={{ gap: 8 }}><strong style={{ color: "var(--ink)", fontWeight: 600 }}>{x.topic}</strong>{a.status === "answered" ? <Pill tone="ok" icon="check">Answered</Pill> : <Pill tone="info">Open</Pill>}</div>
                <div>{x.question}</div><div className="ph-dim" style={{ marginTop: 3 }}>{a.status === "answered" ? `Answer: ${a.answer}` : `Applied for now: ${x.applied}`}</div></li>;
            })}</ul>
          </Section>) : null}

        <Section title="As sent by Precision Health" sub="The table cells exactly as received, kept for audit.">
          <table className="scr-asent"><tbody>
            <tr><th>Male normal / reference range</th><td>{test.asSent.male || "(blank)"}</td></tr>
            <tr><th>Female normal / reference range</th><td>{test.asSent.female || "(blank)"}</td></tr>
            <tr><th>Mildly abnormal band</th><td>{test.asSent.mild || "(blank)"}</td></tr>
            <tr><th>Significantly abnormal / GP review band</th><td>{test.asSent.significant || "(blank)"}</td></tr>
            <tr><th>Severity-band status</th><td>{test.asSent.status || "(blank)"}</td></tr>
          </tbody></table>
        </Section>

        <Section title="Version history" sub="Nothing is overwritten. Each result keeps the version it was judged against.">
          <ul className="scr-list">{history.map((h) => {
            const prev = history.find((x) => x.version < h.version && x.status === "published") || null;
            return (
              <li key={h.id}>
                <div className="scr-ver-head"><strong style={{ color: "var(--ink)" }}>Version {h.version}</strong><VersionPill v={h} today={t0} /><span className="ph-faint">effective {fmtDate(h.effectiveFrom)}</span></div>
                <div>{h.reason}</div>
                <div className="ph-faint" style={{ fontSize: 11.5 }}>Source: {h.source}. Drafted by {whoWhen(s, h.createdBy, h.createdAt)}.{h.publishedAt ? ` ${h.status === "rejected" ? "Rejected" : "Published"} by ${whoWhen(s, h.publishedBy, h.publishedAt)}.` : ""}{h.decidedNote ? ` Note: ${h.decidedNote}` : ""}</div>
                <ul className="scr-diff">{rrDiff(test, prev, h).map((d, i) => <li key={i}>{d}</li>)}</ul>
              </li>);
          })}</ul>
        </Section>
      </div>
      {editing ? <RangeEditor test={test} base={editing.base} onClose={() => setEditing(null)} /> : null}
    </Drawer>
  );
}

function DraftPanel({ draft, test }: { draft: RrVersion; test: RrTest }) {
  const s = usePhState();
  const p = usePersona();
  const su = isSuperadmin(s, p.id);
  const [note, setNote] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const impact = useMemo(() => draftImpact(s, draft), [s, draft]);
  const prev = rrVersionsOf(s.referenceRanges.versions, test.id).find((x) => x.status === "published") || null;
  const issues = versionIssues(test, draft);
  const self = s.referenceRanges.settings.secondApprover && draft.createdBy === p.id;
  const rel = impact.changed.filter((x) => x.released).length;
  return (
    <Card flat>
      <div className="ph-stack" style={{ gap: 10 }}>
        <div className="scr-ver-head"><strong style={{ color: "var(--ink)", fontSize: 13.5 }}>Draft version {draft.version}</strong><Pill tone="warn" icon="edit">Not in use until published</Pill><span className="ph-faint">would take effect {fmtDate(draft.effectiveFrom)}</span></div>
        <div style={{ fontSize: 12.5 }}>{draft.reason} <span className="ph-faint">Source: {draft.source}. Drafted by {whoWhen(s, draft.createdBy, draft.createdAt)}.</span></div>
        <ul className="scr-diff">{rrDiff(test, prev, draft).map((d, i) => <li key={i}>{d}</li>)}</ul>
        {draft.rows.map((r) => <p key={r.id} className="scr-sentence"><strong>New:</strong> {rowSentence(test, r)}</p>)}
        {issues.length ? <Callout tone="warn">This draft has {issues.length === 1 ? "a gap or overlap" : `${issues.length} gaps or overlaps`}: {issues.map((i) => i.text).join(" ")}</Callout> : null}
        {test.analyte ? (
          <Callout tone={impact.changed.length ? "warn" : "ok"}>
            <strong>If published: {impact.changed.length} of {impact.checked} demo results change band.</strong>{" "}
            {impact.changed.length ? <>{impact.changed.length - rel} not yet released would use the new band. {rel} already released keep their original band and are listed for clinician review.</> : "No existing result changes band."}
            {impact.changed.length && p.perms.has("clinical.view") ? <div className="ph-faint" style={{ marginTop: 4, fontSize: 11.5 }}>Episodes: {impact.changed.slice(0, 8).map((x) => `${x.episodeId} (${x.from.label || x.from.outcome} → ${x.to.label || x.to.outcome})`).join(", ")}{impact.changed.length > 8 ? ` and ${impact.changed.length - 8} more` : ""}.</div> : null}
          </Callout>) : <div className="ph-faint" style={{ fontSize: 12 }}>This test is not in the demo's results yet, so no existing result is affected.</div>}
        {su ? (
          rejecting ? (
            <div className="ph-stack" style={{ gap: 8 }}>
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why is this draft rejected?" aria-label="Reason for rejecting" />
              <div className="ph-row-flex" style={{ gap: 8, justifyContent: "flex-end" }}><Button onClick={() => setRejecting(false)}>Cancel</Button><Button variant="danger" onClick={() => { if (dispatch(rrAct.reject(draft.id, note)).ok) setRejecting(false); }}>Reject draft</Button></div>
            </div>
          ) : (
            <div className="ph-row-flex ph-wrap" style={{ gap: 8, justifyContent: "flex-end" }}>
              {self ? <span className="ph-faint" style={{ fontSize: 12 }}>Second approval is on: another superadmin must publish this.</span> : null}
              <Button onClick={() => setRejecting(true)}>Reject</Button>
              <Button variant="primary" icon="check" disabled={self} onClick={() => dispatch(rrAct.publish(draft.id))}>Publish version {draft.version}</Button>
            </div>
          )
        ) : null}
      </div>
    </Card>
  );
}
