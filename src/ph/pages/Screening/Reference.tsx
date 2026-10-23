/* Results impact, Calculations, Cohorts and To confirm. */
import { useMemo, useState } from "react";
import {
  RR_BMI_ETHNIC, RR_CALCULATIONS, RR_ETHNICITIES, RR_QUESTIONS, RR_TESTS, RR_TEST_BY_ID, fmtShortDateTime, rrVersionInForce, today,
} from "../../model";
import type { Band } from "../../model";
import { useNav } from "../../nav-context";
import { dispatch, usePersona, usePhState } from "../../store";
import { Button, Card, CardHeader, DataTable, Field, Kpi, KpiStrip, PageHeader, Pill, TextInput, Textarea } from "../../ui";
import type { Column } from "../../ui";
import { rrAct } from "./actions";
import { compareWithCurrentRules, isSuperadmin } from "./select";
import type { AnalyteComparison } from "./select";
import { Callout, staffNameOf } from "./shared";

const BAND_WORD: Record<Band, string> = { normal: "normal", borderline: "borderline", abnormal: "abnormal", not_tested: "no range" };

/* ---------- Results impact ---------- */
export function Impact() {
  const s = usePhState();
  const nav = useNav();
  const rows = useMemo(() => compareWithCurrentRules(s), [s]);
  const total = rows.reduce((n, r) => n + r.results, 0), differ = rows.reduce((n, r) => n + r.differ, 0);
  const cols: Column<AnalyteComparison>[] = [
    { key: "t", header: "Test", cell: (r) => <button type="button" className="ph-link" onClick={() => nav.go({ page: "Screening", tab: "ranges", params: { test: r.test.id } })}>{r.test.name}</button> },
    { key: "n", header: "Demo results", align: "right", cell: (r) => <span className="ph-num">{r.results}</span>, sort: (a, b) => a.results - b.results },
    { key: "same", header: "Same band", align: "right", cell: (r) => <span className="ph-num">{r.same}</span> },
    { key: "diff", header: "Different band", align: "right", sort: (a, b) => a.differ - b.differ, cell: (r) => r.differ ? <Pill tone="warn">{r.differ}</Pill> : <span className="ph-faint">0</span> },
    { key: "moves", header: "What moves", cell: (r) => <span style={{ fontSize: 12 }}>{r.moves.sort((a, b) => b.n - a.n).slice(0, 3).map((m) => `${m.n} ${BAND_WORD[m.from]} → ${BAND_WORD[m.to]}`).join("; ") || "No change"}</span> },
  ];
  return (
    <>
      <PageHeader eyebrow="Health Screening" title="Results impact"
        sub="The demo's results are still banded by the illustrative rule set (v0.1). This compares every demo result with Precision Health's table, so you can see what switching over would change before anything changes. Counts only; no names." />
      <KpiStrip>
        <Kpi label="Demo results compared" value={total.toLocaleString("en-IE")} icon="flask" />
        <Kpi label="Would change band" value={differ.toLocaleString("en-IE")} tone={differ ? "warn" : "ok"} sub={total ? `${Math.round((differ / total) * 100)}% of results` : ""} />
        <Kpi label="Tests compared" value={rows.length} sub={`of ${RR_TESTS.filter((t) => t.analyte).length} mapped to demo results`} />
      </KpiStrip>
      <Callout tone="info"><strong>Nothing has been switched over.</strong> Results, reports and the clinician viewer keep using the illustrative rules until Precision Health signs off the ranges and the open questions. Then each result records the range version it was judged against. Ethnicity is not yet on the demo's participant records, so the all-ethnicities range applies.</Callout>
      <Card style={{ marginTop: 14 }}>
        <DataTable rows={rows} columns={cols} rowKey={(r) => r.test.id} pageSize={40} initialSort={{ key: "diff", dir: -1 }} caption="Band changes by test"
          footerNote={<>Most of the change comes from questions still open: adjusted calcium has no range yet, the male normal range for HbA1c and the female one for LDL were not supplied, so those results land outside every band. "No range" also covers participants whose sex is not recorded or who fall outside a range's age cohort.</>} />
      </Card>
    </>
  );
}

/* ---------- Calculations ---------- */
export function Calculations() {
  const [w, setW] = useState("82"), [h, setH] = useState("1.76"), [waist, setWaist] = useState("94"), [tc, setTc] = useState("5.4"), [hdl, setHdl] = useState("1.2");
  const n = (x: string) => Number(x);
  const ok = (...x: string[]) => x.every((v) => v.trim() !== "" && Number.isFinite(n(v)) && n(v) > 0);
  const out = [
    { k: "BMI", v: ok(w, h) ? (n(w) / n(h) ** 2).toFixed(1) : "" },
    { k: "Waist-to-height", v: ok(waist, h) ? (n(waist) / (n(h) * 100)).toFixed(2) : "" },
    { k: "Non-HDL", v: ok(tc, hdl) ? (n(tc) - n(hdl)).toFixed(1) : "" },
    { k: "Total / HDL", v: ok(tc, hdl) ? (n(tc) / n(hdl)).toFixed(2) : "" },
    { k: "HDL % of total", v: ok(tc, hdl) ? ((n(hdl) / n(tc)) * 100).toFixed(0) + "%" : "" },
  ];
  return (
    <>
      <PageHeader eyebrow="Health Screening" title="Calculations"
        sub="Values Pulse works out before banding. Each formula is shown so it can be checked against the workbook it replaces. Calculated values are banded with the same versioned ranges." />
      <div className="scr-split">
        <Card>
          <CardHeader title="Formulas" />
          <ul className="scr-list">{RR_CALCULATIONS.map((c) => (
            <li key={c.id}>
              <div className="ph-row-flex" style={{ gap: 8 }}><strong style={{ color: "var(--ink)" }}>{c.name}</strong>{c.status === "standard" ? <Pill tone="ok" icon="check">Standard formula</Pill> : <Pill tone="info">To confirm</Pill>}</div>
              <div className="ph-mono" style={{ fontSize: 12.5, margin: "3px 0" }}>{c.formula}</div>
              <div className="ph-faint" style={{ fontSize: 11.5 }}>Inputs: {c.inputs}. Banded with: {RR_TEST_BY_ID[c.output]?.name || c.output}. {c.note}</div>
            </li>))}</ul>
        </Card>
        <Card>
          <CardHeader title="Try it" sub="A quick check that the formulas give the numbers your sheet gives." />
          <div className="scr-grid-2">
            <Field label="Weight (kg)"><TextInput value={w} onChange={(e) => setW(e.target.value)} inputMode="decimal" /></Field>
            <Field label="Height (m)"><TextInput value={h} onChange={(e) => setH(e.target.value)} inputMode="decimal" /></Field>
            <Field label="Waist (cm)"><TextInput value={waist} onChange={(e) => setWaist(e.target.value)} inputMode="decimal" /></Field>
            <Field label="Total cholesterol (mmol/L)"><TextInput value={tc} onChange={(e) => setTc(e.target.value)} inputMode="decimal" /></Field>
            <Field label="HDL (mmol/L)"><TextInput value={hdl} onChange={(e) => setHdl(e.target.value)} inputMode="decimal" /></Field>
          </div>
          <div className="scr-kv" style={{ marginTop: 14 }}>{out.map((o) => <div key={o.k}><p className="scr-k">{o.k}</p><p className="scr-v ph-num" style={{ fontSize: 16 }}>{o.v || "Not enough data"}</p></div>)}</div>
          <div style={{ marginTop: 14 }}><Callout tone="info">Send the workbook formulas for adjusted calcium, globulin and UIBC and they are added here the same way.</Callout></div>
        </Card>
      </div>
    </>
  );
}

/* ---------- Cohorts ---------- */
export function Cohorts() {
  const s = usePhState();
  const t0 = today(s);
  const inForce = RR_TESTS.map((t) => ({ t, v: rrVersionInForce(s.referenceRanges.versions, t.id, t0) })).filter((x) => x.v);
  const uses = (f: (c: NonNullable<(typeof inForce)[number]["v"]>["rows"][number]["cohort"]) => boolean) => inForce.filter((x) => x.v!.rows.some((r) => f(r.cohort))).map((x) => x.t.name);
  const bySex = uses((c) => c.sex !== "any"), byAge = uses((c) => c.ageMin !== null || c.ageMax !== null), byEth = uses((c) => c.ethnicities !== "any"), byPreg = uses((c) => c.pregnancy !== "any");
  const block = (title: string, rule: string, list: string[]) => (
    <Card><CardHeader title={title} sub={rule} /><div className="ph-faint" style={{ fontSize: 12 }}>{list.length ? `Used by ${list.length}: ${list.join(", ")}.` : "Not used by any test yet."}</div></Card>);
  return (
    <>
      <PageHeader eyebrow="Health Screening" title="Cohorts"
        sub="A range applies to a defined cohort of patients. Each cohort row on a test says which sex, ages, ethnicities and pregnancy status it covers. When more than one row matches, the most specific one is used." />
      <div className="scr-grid-2">
        {block("Sex", "Male, female or everyone. If sex is not recorded, only an 'everyone' range applies.", bySex)}
        {block("Age", "Whole years on the result's date. 'Aged 15 to 65' includes both 15 and 65.", byAge)}
        {block("Ethnicity", "The QRISK3 categories already on the nurse form. If ethnicity is not recorded, the all-ethnicities range applies.", byEth)}
        {block("Pregnancy", "A range marked 'not pregnant' does not apply to a pregnant participant, so the result goes to clinician review.", byPreg)}
      </div>
      <Card style={{ marginTop: 14 }}>
        <CardHeader title="Ethnicity groups" sub="Groups in the ethnicity-specific BMI range are marked." />
        <div className="scr-chips">{RR_ETHNICITIES.map((e) => <Pill key={e} tone={RR_BMI_ETHNIC.includes(e) ? "brand" : "neutral"}>{e}{RR_BMI_ETHNIC.includes(e) ? " · BMI specific" : ""}</Pill>)}</div>
        <div className="ph-faint" style={{ fontSize: 12, marginTop: 10 }}>Middle Eastern, named in your BMI row, is not a separate QRISK3 category. It falls under Other ethnic group, which uses the general BMI range (to confirm).</div>
      </Card>
      <Card style={{ marginTop: 14 }}>
        <CardHeader title="How a cohort is chosen" />
        <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.7 }}>
          <li>Take the version in force on the result's date.</li>
          <li>Keep the cohort rows that match the person's sex, age, ethnicity and pregnancy status.</li>
          <li>Use the most specific match (each of sex, age, ethnicity and pregnancy that is set counts once).</li>
          <li>If two rows are equally specific, nothing is guessed: the result goes to clinician review and the clash is shown on the test.</li>
          <li>If no row matches, the result has no range and goes to clinician review.</li>
        </ol>
      </Card>
    </>
  );
}

/* ---------- To confirm ---------- */
export function Questions() {
  const s = usePhState();
  const p = usePersona();
  const su = isSuperadmin(s, p.id);
  const qs = s.referenceRanges.questions;
  const open = RR_QUESTIONS.filter((q) => qs[q.id].status !== "answered").length;
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  return (
    <>
      <PageHeader eyebrow="Health Screening" title="To confirm"
        sub="Questions from your reference ranges table. Until each is answered, the default shown is what Pulse uses, and the affected tests are marked To confirm." />
      <KpiStrip>
        <Kpi label="Open" value={open} tone={open ? "info" : "ok"} />
        <Kpi label="Answered" value={RR_QUESTIONS.length - open} tone="ok" />
      </KpiStrip>
      <div className="ph-stack" style={{ gap: 12 }}>
        {RR_QUESTIONS.map((q, i) => {
          const a = qs[q.id];
          const tests = RR_TESTS.filter((t) => t.questions.includes(q.id)).map((t) => t.name);
          return (
            <Card key={q.id}>
              <div className="ph-row-flex" style={{ gap: 8, marginBottom: 6 }}>
                <span className="ph-num ph-faint">{i + 1}</span><strong style={{ color: "var(--ink)", fontSize: 13.5 }}>{q.topic}</strong>
                <span className="ph-grow" />{a.status === "answered" ? <Pill tone="ok" icon="check">Answered</Pill> : <Pill tone="info">Open</Pill>}
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.5 }}>{q.question}</div>
              <div className="ph-dim" style={{ fontSize: 12.5, marginTop: 6 }}><strong style={{ fontWeight: 600 }}>Applied for now:</strong> {q.applied}</div>
              {tests.length ? <div className="ph-faint" style={{ fontSize: 11.5, marginTop: 6 }}>Affects: {tests.join(", ")}</div> : null}
              {a.status === "answered" ? (
                <div style={{ marginTop: 10 }}><Callout tone="ok"><strong>Answer:</strong> {a.answer} <span className="ph-faint">({staffNameOf(s, a.by)}, {a.at ? fmtShortDateTime(a.at) : ""})</span></Callout>
                  {su ? <div style={{ marginTop: 8 }}><Button size="sm" onClick={() => dispatch(rrAct.answerQuestion(q.id, "", true))}>Reopen</Button></div> : null}</div>
              ) : su ? (
                <div className="ph-stack" style={{ gap: 8, marginTop: 10 }}>
                  <Textarea rows={2} value={drafts[q.id] || ""} onChange={(e) => setDrafts((d) => ({ ...d, [q.id]: e.target.value }))} placeholder="Your answer, or 'Agreed' to keep the default" aria-label={`Answer: ${q.topic}`} />
                  <div className="ph-row-flex" style={{ gap: 8, justifyContent: "flex-end" }}>
                    <Button size="sm" onClick={() => { if (dispatch(rrAct.answerQuestion(q.id, "Agreed: keep the default.")).ok) setDrafts((d) => ({ ...d, [q.id]: "" })); }}>Agree with default</Button>
                    <Button size="sm" variant="primary" onClick={() => { if (dispatch(rrAct.answerQuestion(q.id, drafts[q.id] || "")).ok) setDrafts((d) => ({ ...d, [q.id]: "" })); }}>Record answer</Button>
                  </div>
                </div>
              ) : null}
            </Card>);
        })}
      </div>
    </>
  );
}
