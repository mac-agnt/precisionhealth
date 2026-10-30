/* Reference ranges: every test from Precision Health's table in one simple table (test, normal range,
   mildly abnormal, significantly abnormal), one chip row to filter, and a drawer per test with the
   sentence for each cohort, the bands, the cells as sent, open questions, gaps and overlaps, and the
   full version history. Superadmins edit from the drawer. Deep link: #/Screening/ranges?test=tc */
import { useMemo, useState } from "react";
import {
  RR_BASIS_LABEL, RR_GROUPS, RR_QUESTIONS, RR_TESTS, RR_TEST_BY_ID, boundsShort, cohortText, fmtDate, rowFor, rowSentence, rrVersionInForce, rrVersionsOf, today,
} from "../../model";
import type { RrGroup, RrTest, RrVersion } from "../../model";
import { dispatch, getState as usePhStateSnapshot, usePersona, usePhState } from "../../store";
import { Button, Card, Chip, Drawer, Field, PageHeader, Pill, SearchBox, Section, Select, TextInput, Textarea } from "../../ui";
import { useNav } from "../../nav-context";
import { rrAct } from "./actions";
import { draftImpact, isSuperadmin, rrDiff, testStatus, versionIssues } from "./select";
import { BandsTable, Callout, RangeBar, VersionPill, staffNameOf, whoWhen } from "./shared";
import { RangeEditor } from "./Editor";

type Filter = "all" | "issues" | "confirm" | "notset" | "drafts";

export default function Ranges() {
  const s = usePhState();
  const nav = useNav();
  /* Filters live in the URL: #/Screening/ranges?status=issues&group=Cholesterol&q=hdl */
  const setP = (k: string, v: string) => { const x: Record<string, string> = { ...nav.params, [k]: v }; delete x.test; Object.keys(x).forEach((key) => { if (!x[key] || x[key] === "all") delete x[key]; }); nav.setParams(x); };
  const q = nav.params.q || "";
  const setQ = (v: string) => setP("q", v);
  const group = ((RR_GROUPS as readonly string[]).includes(nav.params.group || "") ? nav.params.group : "all") as RrGroup | "all";
  const setGroup = (g: RrGroup | "all") => setP("group", g);
  const filter: Filter = (["all", "issues", "confirm", "notset", "drafts"] as Filter[]).find((f) => f === nav.params.status) || "all";
  const setFilter = (f: Filter) => setP("status", f);
  const rows = useMemo(() => RR_TESTS.map((t) => ({ t, st: testStatus(s, t) })), [s]);
  const counts: Record<Filter, number> = {
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
  const admins = s.referenceRanges.settings.superadmins.map((id) => staffNameOf(s, id)).join(" and ");
  const LABEL: Record<Filter, string> = { all: "All tests", drafts: "Drafts", issues: "Gaps or overlaps", confirm: "To confirm", notset: "Not set" };

  return (
    <>
      <PageHeader title="Reference ranges" actions={<Button variant="primary" icon="plus" onClick={() => nav.go({ page: "Screening", tab: "new" })}>New screening</Button>}
        sub={<>The normal and abnormal ranges Pulse uses to judge every result. Open a test to see its history or change a number. Only {admins || "superadmins"} can change them.</>} />
      <Card>
        <div className="scr-filters">
          <div className="scr-chips ph-grow" role="group" aria-label="Show">
            {(["all", "drafts", "issues", "confirm", "notset"] as Filter[]).filter((f) => f === "all" || counts[f] > 0 || f === filter).map((f) => (
              <Chip key={f} on={filter === f} onClick={() => setFilter(f)} count={counts[f]}>{LABEL[f]}</Chip>
            ))}
          </div>
          <div className="scr-tools">
            <Select value={group} onChange={(e) => setGroup(e.target.value as RrGroup | "all")} aria-label="Group">
              <option value="all">All groups</option>
              {RR_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
            </Select>
            <SearchBox value={q} onChange={setQ} placeholder="Search tests" />
          </div>
        </div>
        <RangesTable rows={shown} onOpen={(id) => nav.setParams({ ...nav.params, test: id })} />
      </Card>
      {openId && RR_TEST_BY_ID[openId] ? <TestDrawer test={RR_TEST_BY_ID[openId]} onClose={() => { const x = { ...nav.params }; delete x.test; nav.setParams(x); }} /> : null}
    </>
  );
}

/** One short status word per test, only when something needs attention. */
function StatusPills({ st }: { st: ReturnType<typeof testStatus> }) {
  const out: JSX.Element[] = [];
  if (st.draft) out.push(<Pill key="d" tone="warn" icon="edit">Draft v{st.draft.version}</Pill>);
  if (st.issues.length) out.push(<Pill key="i" tone="bad" icon="alert">{st.issues.length === 1 ? "Gap or overlap" : `${st.issues.length} gaps or overlaps`}</Pill>);
  if (st.scheduled.length) out.push(<Pill key="s" tone="info" icon="calendar">v{st.scheduled[0].version} from {fmtDate(st.scheduled[0].effectiveFrom)}</Pill>);
  return out.length ? <div className="ph-row-flex ph-wrap" style={{ gap: 4, marginTop: 4 }}>{out}</div> : null;
}

export function TestDrawer({ test, onClose, fromDate }: { test: RrTest; onClose: () => void; fromDate?: string }) {
  const s = usePhState();
  const p = usePersona();
  const su = isSuperadmin(s, p.id);
  const st = testStatus(s, test);
  const t0 = today(s);
  const [editing, setEditing] = useState<null | { base: RrVersion | null }>(null);
  const [quick, setQuick] = useState(false);
  const history = rrVersionsOf(s.referenceRanges.versions, test.id);
  const v = st.v;
  const questions = RR_QUESTIONS.filter((x) => test.questions.includes(x.id));

  return (
    <Drawer open onClose={onClose} width={760} title={test.name}
      sub={<>{test.group} · {test.unit} · {RR_BASIS_LABEL[test.basis]}{test.source ? <> · {test.source.url ? <a className="ph-link" href={test.source.url} target="_blank" rel="noreferrer">{test.source.label}</a> : test.source.label}</> : null}</>}
      footer={su ? <>
        {st.draft ? <Button onClick={() => setEditing({ base: st.draft })} icon="edit">Edit draft v{st.draft.version}</Button> : null}
        <Button disabled={!!st.draft} onClick={() => setEditing({ base: v })} title={st.draft ? "Publish or reject the open draft first" : undefined}>Advanced edit</Button>
        {v && test.kind === "numeric" ? <Button variant="primary" icon="edit" disabled={!!st.draft} onClick={() => setQuick(true)} title={st.draft ? "Publish or reject the open draft first" : undefined}>Change a number</Button> : null}
      </> : <span className="ph-faint" style={{ fontSize: 12 }}>Read only. Only superadmins ({s.referenceRanges.settings.superadmins.map((id) => staffNameOf(s, id)).join(", ")}) change ranges.</span>}>
      <div className="ph-stack" style={{ gap: 16 }}>
        {quick && v ? <QuickChange test={test} base={v} fromDate={fromDate} onDone={() => setQuick(false)} /> : null}
        {st.draft ? <DraftPanel draft={st.draft} test={test} /> : null}
        {st.scheduled.map((x) => <Callout key={x.id} tone="info" icon="calendar"><strong>Version {x.version} takes effect on {fmtDate(x.effectiveFrom)}.</strong> Results with a sample date from then use it; earlier results keep version {v ? v.version : "1"}. {x.reason}</Callout>)}

        <Section title={v ? `In force today: version ${v.version}` : "No version in force"} sub={v ? `Effective from ${fmtDate(v.effectiveFrom)}. ${v.reason}` : undefined}
          right={v ? <VersionPill v={v} today={t0} /> : null}>
          {v ? v.rows.map((row) => (
            <div className="scr-cohort" key={row.id}>
              <div className="scr-cohort-title">{cohortText(row.cohort)}</div>
              <RangeBar test={test} row={row} />
              <p className="scr-sentence">{rowSentence(test, row)}</p>
              <details><summary className="ph-faint" style={{ fontSize: 12, cursor: "pointer" }}>Exact limits</summary><div style={{ marginTop: 8 }}><BandsTable test={test} row={row} /></div></details>
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

/**
 * The everyday change, in plain words: pick the number to change, type the new one, say why, save.
 * Moving a limit moves the band on both sides of it, so there are never gaps. Publishes straight
 * away (both steps are logged) unless second approval is on, when it waits as a draft.
 */
function QuickChange({ test, base, onDone, fromDate }: { test: RrTest; base: RrVersion; onDone: () => void; fromDate?: string }) {
  const s = usePhState();
  const rows = base.rows.filter((r) => r.status === "set" && r.bands.length);
  const [ri, setRi] = useState(0);
  const row = rows[ri];
  const limits = row ? [...new Set(row.bands.flatMap((b) => [b.min?.value, b.max?.value]).filter((x): x is number => x !== undefined))].sort((a, b) => a - b) : [];
  const nameOf = (val: number) => {
    const below = row.bands.find((b) => b.max?.value === val), above = row.bands.find((b) => b.min?.value === val);
    return below && above ? `${val}: between ${below.label} and ${above.label}` : below ? `${val}: top of ${below.label}` : above ? `${val}: start of ${above.label}` : String(val);
  };
  const [which, setWhich] = useState<number | null>(limits[0] ?? null);
  const [to, setTo] = useState("");
  const [why, setWhy] = useState("");
  const [from, setFrom] = useState(fromDate && fromDate < today(s) ? fromDate : today(s));
  const n = Number(to);
  const valid = which !== null && to.trim() !== "" && Number.isFinite(n) && n !== which && why.trim().length >= 10;
  const preview = useMemo(() => {
    if (!row || which === null || !Number.isFinite(n) || to.trim() === "") return null;
    const next = structuredClone(rows);
    for (const b of next[ri].bands) { if (b.min && b.min.value === which) b.min.value = n; if (b.max && b.max.value === which) b.max.value = n; }
    return next;
  }, [rows, ri, row, which, n, to]);
  const save = () => {
    if (!preview) return;
    const all = base.rows.map((r) => preview.find((p) => p.id === r.id) || r);
    const r = dispatch(rrAct.saveDraft(test.id, all, from, why, "Changed in Health Screening by a superadmin"));
    if (!r.ok) return;
    const draft = usePhStateSnapshot().referenceRanges.versions.find((v) => v.testId === test.id && v.status === "draft");
    if (draft && !s.referenceRanges.settings.secondApprover) dispatch(rrAct.publish(draft.id, "Quick change"));
    onDone();
  };
  if (!row) return null;
  return (
    <div className="scr-quick">
      <div className="ph-row-flex" style={{ marginBottom: 10 }}><strong style={{ color: "var(--ink)", fontSize: 14 }} className="ph-grow">Change a number</strong><Button size="sm" variant="ghost" onClick={onDone}>Cancel</Button></div>
      <div className="ph-stack" style={{ gap: 12 }}>
        {rows.length > 1 ? <Field label="1. Who is it for?" htmlFor="qc-who"><select id="qc-who" className="ph-input" value={ri} onChange={(e) => { setRi(Number(e.target.value)); setWhich(null); }}>{rows.map((r, i) => <option key={r.id} value={i}>{cohortText(r.cohort)}</option>)}</select></Field> : null}
        <Field label={`${rows.length > 1 ? "2" : "1"}. Which number is changing?`} htmlFor="qc-which"><select id="qc-which" className="ph-input" value={which ?? ""} onChange={(e) => setWhich(Number(e.target.value))}><option value="" disabled>Choose</option>{limits.map((l) => <option key={l} value={l}>{nameOf(l)}</option>)}</select></Field>
        <div className="scr-grid-2">
          <Field label={`${rows.length > 1 ? "3" : "2"}. New number${test.unit ? ` (${test.unit})` : ""}`} htmlFor="qc-to"><TextInput id="qc-to" inputMode="decimal" value={to} onChange={(e) => setTo(e.target.value.replace(/[^\d.]/g, ""))} placeholder={which !== null ? `Now ${which}` : ""} /></Field>
          <Field label="From which date?" help="Results sampled from this date use the new number." htmlFor="qc-from"><TextInput id="qc-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        </div>
        <Field label={`${rows.length > 1 ? "4" : "3"}. Why?`} help="Kept in the history with your name." htmlFor="qc-why"><TextInput id="qc-why" value={why} onChange={(e) => setWhy(e.target.value)} placeholder="For example: Eurofins bulletin, TSH upper limit now 4.84" /></Field>
        {preview ? <div><div className="ph-faint" style={{ fontSize: 12, marginBottom: 4 }}>How it will look:</div><RangeBar test={test} row={preview[ri]} /><p className="scr-sentence" style={{ marginTop: 6 }}>{rowSentence(test, preview[ri])}</p></div> : null}
        <div className="ph-row-flex" style={{ justifyContent: "flex-end", gap: 8 }}>
          <span className="ph-faint ph-grow" style={{ fontSize: 12 }}>{s.referenceRanges.settings.secondApprover ? "Second approval is on: this waits for another superadmin." : "Saved and published straight away. The old number is kept in the history; earlier results keep it."}</span>
          <Button variant="primary" icon="check" disabled={!valid} onClick={save}>Save</Button>
        </div>
      </div>
    </div>
  );
}

/* ---------- the ranges table: Precision Health's own columns, built live from the ranges in force ---------- */
function RangesTable({ rows, onOpen }: { rows: Array<{ t: RrTest; st: ReturnType<typeof testStatus> }>; onOpen: (id: string) => void }) {
  const s = usePhState();
  const t0 = today(s);
  const cell = (test: RrTest, sex: "male" | "female", keys: string[]): string => {
    if (test.kind === "recorded") return keys.includes("normal") ? "Recorded only, no range" : "";
    const v = rrVersionInForce(s.referenceRanges.versions, test.id, t0);
    if (!v) return "Not set";
    const row = rowFor(v.rows, { sex, age: 40, ethnicity: null, pregnant: false }).row;
    if (!row) return "Not applicable";
    if (row.status === "not_set") return "Not supplied";
    if (row.status === "not_applicable") return "Not applicable";
    if (test.kind === "qualitative") return keys.includes("normal") ? row.expected || "" : "Not defined";
    const parts = row.bands.filter((b) => keys.includes(b.key)).map((b) => boundsShort(b, test.decimals));
    return parts.length ? parts.join(" or ") : "None";
  };
  const both = (test: RrTest, keys: string[]) => {
    const m = cell(test, "male", keys), f = cell(test, "female", keys);
    return m === f ? m : `Men ${m}; women ${f}`;
  };
  if (!rows.length) return <div className="ph-faint" style={{ padding: 20 }}>No tests match.</div>;
  return (
    <div className="rr-list" role="table" aria-label="Reference ranges">
      <div className="rr-row rr-head" role="row">
        <span role="columnheader">Test</span><span role="columnheader">Normal</span><span role="columnheader">Mildly abnormal</span><span role="columnheader">Significantly abnormal</span>
      </div>
      {rows.map(({ t, st }) => (
        <button key={t.id} type="button" className="rr-row" role="row" onClick={() => onOpen(t.id)}>
          <span role="cell" className="rr-test"><b>{t.name}</b><span className="ph-faint"> {/not supplied/i.test(t.unit) ? "" : t.unit}</span><StatusPills st={st} /></span>
          <span role="cell" className="rr-n"><i>Normal</i>{both(t, ["normal"])}</span>
          <span role="cell" className="rr-m"><i>Mildly abnormal</i>{both(t, ["low_mild", "high_mild"])}</span>
          <span role="cell" className="rr-s"><i>Significantly abnormal</i>{both(t, ["low_severe", "high_severe", "high_critical"])}</span>
        </button>
      ))}
      <div className="ph-faint" style={{ fontSize: 11.5, padding: "10px 4px 0" }}>Built live from the ranges in force today, {fmtDate(t0)}. Open a test for its bands by age and sex, the cells exactly as you sent them and the version history.</div>
    </div>
  );
}
