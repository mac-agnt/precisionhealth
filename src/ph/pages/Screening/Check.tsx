/* Check a result: pick a test, a person's cohort, a value and a date, and see the band, the exact
   version and cohort row used, and how the same value reads under every published version. This is
   the audit answer to "on 7 October the range was 12 to 16 and the result was normal". */
import { useMemo, useState } from "react";
import { RR_ETHNICITIES, RR_TESTS, RR_TEST_BY_ID, classify, cohortText, fmtDate, rowSentence, rrVersionsOf, today } from "../../model";
import type { RrPerson, RrVersion } from "../../model";
import { usePhState } from "../../store";
import { Button, Card, CardHeader, Field, PageHeader, Select, TextInput } from "../../ui";
import { BandWord, Callout, Swatch } from "./shared";

interface Preset { label: string; test: string; sex: RrPerson["sex"]; age: string; eth: string; preg: boolean; value: string; date: string }
const PRESETS: Preset[] = [
  { label: "Neil's example: haemoglobin 15.5 on 7 October", test: "hb", sex: "female", age: "40", eth: "", preg: false, value: "15.5", date: "2026-10-07" },
  { label: "The same result on 8 October", test: "hb", sex: "female", age: "40", eth: "", preg: false, value: "15.5", date: "2026-10-08" },
  { label: "Blood pressure 130 systolic (a gap in the table)", test: "bpsys", sex: "male", age: "52", eth: "", preg: false, value: "130", date: "2026-10-05" },
  { label: "BMI 24 with Indian ethnicity", test: "bmi", sex: "male", age: "45", eth: "Indian", preg: false, value: "24", date: "2026-10-05" },
  { label: "TSH 4.90 (draft bulletin pending)", test: "tsh", sex: "female", age: "38", eth: "", preg: false, value: "4.9", date: "2026-10-15" },
];

export default function Check() {
  const s = usePhState();
  const [f, setF] = useState<Preset>({ ...PRESETS[0] });
  const test = RR_TEST_BY_ID[f.test];
  const person: RrPerson = { sex: f.sex, age: f.age.trim() === "" ? null : Number(f.age), ethnicity: f.eth || null, pregnant: f.sex === "female" ? f.preg : null };
  const value = test.kind === "qualitative" ? f.value : Number(f.value);
  const valid = f.value.trim() !== "" && (test.kind === "qualitative" || Number.isFinite(value)) && /^\d{4}-\d{2}-\d{2}$/.test(f.date);
  const res = useMemo(() => (valid ? classify(test, s.referenceRanges.versions, person, value, f.date) : null), [valid, test, s, f]); // eslint-disable-line react-hooks/exhaustive-deps
  const published = rrVersionsOf(s.referenceRanges.versions, test.id).filter((v) => v.status === "published").sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  const draft = s.referenceRanges.versions.find((v) => v.testId === test.id && v.status === "draft") || null;
  const set = (p: Partial<Preset>) => setF((x) => ({ ...x, ...p }));
  const under = (v: RrVersion) => classify(test, s.referenceRanges.versions.filter((x) => x.testId !== test.id).concat({ ...v, status: "published", effectiveFrom: "0000-01-01" }), person, value, f.date);

  return (
    <>
      <PageHeader eyebrow="Health Screening" title="Check a result"
        sub="See exactly which range a result is judged against: the version in force on the result's date, the cohort row that matched, and why. Nothing here is saved." />
      <div className="scr-split">
        <Card>
          <CardHeader title="Result" sub="Try a preset or enter your own." />
          <div className="scr-chips" style={{ marginBottom: 14 }}>{PRESETS.map((p) => <Button key={p.label} size="sm" onClick={() => setF({ ...p })}>{p.label}</Button>)}</div>
          <div className="ph-stack" style={{ gap: 12 }}>
            <Field label="Test"><Select value={f.test} onChange={(e) => set({ test: e.target.value, value: RR_TEST_BY_ID[e.target.value].kind === "qualitative" ? "Negative" : f.value })}>
              {RR_TESTS.filter((t) => t.kind !== "recorded").map((t) => <option key={t.id} value={t.id}>{t.name} ({t.unit})</option>)}</Select></Field>
            <div className="scr-grid-2">
              <Field label={`Value${test.kind === "qualitative" ? "" : ` (${test.unit})`}`}><TextInput value={f.value} onChange={(e) => set({ value: e.target.value })} inputMode={test.kind === "qualitative" ? "text" : "decimal"} /></Field>
              <Field label="Sample date"><TextInput type="date" value={f.date} onChange={(e) => set({ date: e.target.value })} /></Field>
              <Field label="Sex"><Select value={f.sex} onChange={(e) => set({ sex: e.target.value as RrPerson["sex"] })}><option value="female">Female</option><option value="male">Male</option><option value="not_recorded">Not recorded</option></Select></Field>
              <Field label="Age on the sample date"><TextInput inputMode="numeric" value={f.age} onChange={(e) => set({ age: e.target.value.replace(/\D/g, "") })} /></Field>
              <Field label="Ethnicity"><Select value={f.eth} onChange={(e) => set({ eth: e.target.value })}><option value="">Not recorded</option>{RR_ETHNICITIES.map((e) => <option key={e}>{e}</option>)}</Select></Field>
              <Field label="Pregnant"><Select value={f.preg ? "yes" : "no"} disabled={f.sex !== "female"} onChange={(e) => set({ preg: e.target.value === "yes" })}><option value="no">No</option><option value="yes">Yes</option></Select></Field>
            </div>
          </div>
        </Card>
        <div className="ph-stack" style={{ gap: 14 }}>
          <Card>
            <CardHeader title="Outcome" sub={`Judged on ${valid ? fmtDate(f.date) : "a valid date"}, using the ${s.referenceRanges.settings.effectiveBasis === "sample" ? "sample collection date" : "date rule in Change control"}.`} />
            {res ? (
              <div className="ph-stack" style={{ gap: 12 }}>
                <div className="scr-result"><Swatch k={res.outcome} /><div><div className="scr-result-word">{res.label || "No flag"}</div><div className="ph-dim" style={{ fontSize: 12.5 }}><BandWord k={res.outcome} label="" />{res.review ? " · goes to clinician review" : ""}</div></div></div>
                <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>{res.why}</div>
                {res.version ? <div className="scr-kv">
                  <div><p className="scr-k">Version used</p><p className="scr-v">{test.name} v{res.version.version}</p></div>
                  <div><p className="scr-k">In force from</p><p className="scr-v">{fmtDate(res.version.effectiveFrom)}</p></div>
                  <div><p className="scr-k">Cohort matched</p><p className="scr-v">{res.row ? cohortText(res.row.cohort) : "None"}</p></div>
                </div> : null}
                {res.row ? <p className="scr-sentence">{rowSentence(test, res.row)}</p> : null}
              </div>) : <div className="ph-faint">Enter a value and a date.</div>}
          </Card>
          {res ? (
            <Card>
              <CardHeader title="The same result under each version" sub="Why the version used is recorded with every result." />
              <ul className="scr-timeline">
                {published.map((v) => { const r = under(v); const used = res.version?.id === v.id; return (
                  <li key={v.id}><span className="ph-num">v{v.version} from {fmtDate(v.effectiveFrom)}</span><span><BandWord k={r.outcome} label={r.label || "No flag"} /></span><span className="ph-faint" style={{ fontSize: 11.5 }}>{used ? "Used for this date" : v.effectiveFrom > f.date ? "Not yet in force" : "Superseded"}</span></li>); })}
                {draft ? (() => { const r = under(draft); return <li><span className="ph-num">Draft v{draft.version}</span><span><BandWord k={r.outcome} label={r.label || "No flag"} /></span><span className="ph-faint" style={{ fontSize: 11.5 }}>Not in use until published ({fmtDate(draft.effectiveFrom)})</span></li>; })() : null}
              </ul>
              {published.length < 2 && !draft ? <div className="ph-faint" style={{ fontSize: 12, marginTop: 6 }}>Only one version so far. Haemoglobin has two to show the change in Neil's example.</div> : null}
            </Card>) : null}
          {f.date > today(s) ? <Callout tone="info">This date is after the demo's today ({fmtDate(today(s))}). Scheduled versions are included.</Callout> : null}
        </div>
      </div>
    </>
  );
}
