/* Test run: put a test patient through the whole results process and see what happens behind the
   screen at each step. Patient and sample date, the calculations with their working, the range
   version and cohort row each result is judged against with the exact limit checks, the review
   decision, and the record the system would store. Nothing is saved to any patient; logging a
   test run writes one activity event so the audit trail can be shown too. */
import { useMemo, useState } from "react";
import {
  ANALYTES, RR_BAND_META, RR_BAND_ORDER, RR_ETHNICITIES, RR_TEST_BY_ANALYTE, RR_TEST_BY_ID, ageOn, bandDetail, bmiCategory, boundsShort, bpCategory,
  cohortText, fmtDate, inBand, latestObservations, limitTextFor, rangeFor, today, reportFlagWord, roundHalfUp, rowSentence, rrClassify, rrVersionsOf, waistCategory,
} from "../../model";
import type { AnalyteCode, Band, BandCtx, RrResult, RrTest, SexRecorded } from "../../model";
import { dispatch, usePhState } from "../../store";
import { Button, Card, CardHeader, Field, Icon, PageHeader, Pill, SearchBox, Select, TextInput } from "../../ui";
import { useNav } from "../../nav-context";
import { PreviewModal } from "../Results/ReportPreview";
import type { Tone } from "../../ui";
import { Callout, Swatch } from "./shared";

const LAB: AnalyteCode[] = ["TC", "HDL", "LDL", "TG", "HBA1C", "HB", "FERR", "TSH", "ALT", "VITD", "CREAT", "PSA"];
type Meas = "heightM" | "weightKg" | "waistCm" | "bpSys" | "bpDia";
const MEAS: Array<{ k: Meas; label: string; unit: string }> = [
  { k: "heightM", label: "Height", unit: "m" }, { k: "weightKg", label: "Weight", unit: "kg" }, { k: "waistCm", label: "Waist", unit: "cm" },
  { k: "bpSys", label: "BP systolic", unit: "mmHg" }, { k: "bpDia", label: "BP diastolic", unit: "mmHg" },
];
interface Patient { personId?: string; name: string; sex: SexRecorded; dob: string; eth: string; preg: boolean; date: string; meas: Record<Meas, string>; lab: Partial<Record<AnalyteCode, string>> }
const P = (name: string, sex: SexRecorded, dob: string, eth: string, date: string, m: [string, string, string, string, string], lab: Partial<Record<AnalyteCode, string>>): Patient =>
  ({ name, sex, dob, eth, preg: false, date, meas: { heightM: m[0], weightKg: m[1], waistCm: m[2], bpSys: m[3], bpDia: m[4] }, lab });
const PRESETS: Array<{ label: string; p: Patient }> = [
  { label: "All normal", p: P("Test Patient A", "female", "1986-03-14", "White or not stated", "2026-10-05", ["1.65", "60", "72", "116", "76"],
    { TC: "4.6", HDL: "1.50", LDL: "2.6", TG: "1.10", HBA1C: "36", HB: "13.5", FERR: "60", TSH: "1.8", ALT: "20", VITD: "55", CREAT: "70" }) },
  { label: "Some borderline", p: P("Test Patient B", "male", "1976-09-21", "White or not stated", "2026-10-05", ["1.78", "85", "96", "132", "84"],
    { TC: "5.6", HDL: "1.10", LDL: "3.2", TG: "1.90", HBA1C: "43", HB: "14.5", FERR: "210", TSH: "2.1", ALT: "48", VITD: "27", CREAT: "98", PSA: "2.4" }) },
  { label: "Several significant", p: P("Test Patient C", "male", "1968-02-02", "Indian", "2026-10-05", ["1.72", "92", "108", "168", "104"],
    { TC: "7.8", HDL: "0.85", LDL: "5.2", TG: "5.40", HBA1C: "52", HB: "12.0", FERR: "450", TSH: "11", ALT: "95", VITD: "22", CREAT: "120", PSA: "4.5" }) },
  { label: "Neil's haemoglobin example", p: P("Test Patient D", "female", "1986-03-14", "", "2026-10-07", ["", "", "", "", ""], { HB: "15.5" }) },
];

const num = (s: string | undefined) => (s === undefined || s.trim() === "" ? null : Number(s));
const BAND_TONE: Record<Band, Tone> = { normal: "ok", borderline: "warn", abnormal: "bad", not_tested: "neutral" };
const BAND_COLOUR: Record<Band, string> = { normal: "green", borderline: "yellow", abnormal: "orange", not_tested: "grey" };

interface Line { key: string; name: string; value: number; unit: string; test: RrTest; r: RrResult; band: Band; word: string; limit: string; calc?: string }

export default function TestRun() {
  const s = usePhState();
  const nav = useNav();
  const [p, setP] = useState<Patient>(structuredClone(PRESETS[1].p));
  const [find, setFind] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  /* Participants who have attended a screening: picking one fills in their details and latest results. */
  const people = useMemo(() => {
    const seen = new Map<string, { id: string; name: string; company: string; ep: string; at: string }>();
    for (const e of s.episodes) {
      const cur = seen.get(e.personId);
      if (cur && cur.at >= e.collectedAt) continue;
      const pr = s.persons.find((x) => x.id === e.personId);
      if (!pr) continue;
      seen.set(e.personId, { id: pr.id, name: `${pr.given} ${pr.family}`, company: s.programmes.find((g) => g.id === e.programmeId)?.name || "", ep: e.id, at: e.collectedAt });
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [s]);
  const matches = find.trim().length >= 2 ? people.filter((x) => `${x.name} ${x.id} ${x.company}`.toLowerCase().includes(find.toLowerCase())).slice(0, 8) : [];
  const pick = (id: string) => {
    const pr = s.persons.find((x) => x.id === id), row = people.find((x) => x.id === id);
    const ep = row ? s.episodes.find((e) => e.id === row.ep) : undefined;
    if (!pr || !ep) return;
    const m = ep.capture.measures;
    const mv = (k: Meas) => (m[k].state === "recorded" && m[k].value != null ? String(m[k].value) : "");
    const lab: Partial<Record<AnalyteCode, string>> = {};
    for (const o of latestObservations(s, ep.id)) if (LAB.includes(o.code)) lab[o.code] = String(o.value);
    const eth = typeof ep.capture.form?.ethnicity === "string" ? ep.capture.form.ethnicity : "";
    setP({ personId: pr.id, name: `${pr.given} ${pr.family}`, sex: pr.sex, dob: pr.dob, eth, preg: false, date: today(s), meas: { heightM: mv("heightM"), weightKg: mv("weightKg"), waistCm: mv("waistCm"), bpSys: mv("bpSys"), bpDia: mv("bpDia") }, lab });
    setFind(""); setOpen(null); setLogged(false); setSent(null);
  };
  const [open, setOpen] = useState<string | null>(null);
  const [logged, setLogged] = useState(false);
  const set = (x: Partial<Patient>) => { setP((o) => ({ ...o, ...x })); setLogged(false); setSent(null); };
  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(p.date) && /^\d{4}-\d{2}-\d{2}$/.test(p.dob) && p.dob <= p.date;
  const age = dateOk ? ageOn(p.dob, p.date) : null;

  const run = useMemo(() => {
    if (!dateOk || age === null) return null;
    const ctx: BandCtx = { sex: p.sex, age, on: p.date, ethnicity: p.eth || null, pregnant: p.sex === "female" ? p.preg : null };
    const m = Object.fromEntries(MEAS.map((x) => [x.k, num(p.meas[x.k])])) as Record<Meas, number | null>;
    const lab = Object.fromEntries(LAB.map((c) => [c, num(p.lab[c])])) as Record<AnalyteCode, number | null>;
    const calcs: Array<{ name: string; working: string; value: number | null; unit: string }> = [];
    const lines: Line[] = [];
    const addLab = (code: AnalyteCode, value: number, calc?: string) => {
      const test = RR_TEST_BY_ANALYTE[code]!;
      const d = bandDetail(code, value, ctx);
      lines.push({ key: code, name: ANALYTES[code].name, value, unit: ANALYTES[code].unit, test, r: rrClassify(test, value, ctx), band: d.band,
        word: reportFlagWord(code, d.band, d.direction), limit: limitTextFor(code, ctx), calc });
    };
    /* step 2: calculations */
    let bmi: number | null = null;
    if (m.heightM && m.weightKg) {
      const raw = m.weightKg / (m.heightM * m.heightM);
      bmi = roundHalfUp(raw, 1);
      calcs.push({ name: "BMI", working: `${m.weightKg} ÷ ${m.heightM}² = ${m.weightKg} ÷ ${roundHalfUp(m.heightM * m.heightM, 4)} = ${roundHalfUp(raw, 4)} → ${bmi.toFixed(1)} (1 decimal place)`, value: bmi, unit: "kg/m²" });
    } else calcs.push({ name: "BMI", working: "Needs height and weight", value: null, unit: "kg/m²" });
    if (m.waistCm && m.heightM) {
      const raw = m.waistCm / (m.heightM * 100);
      calcs.push({ name: "Waist-to-height ratio", working: `${m.waistCm} ÷ (${m.heightM} × 100) = ${roundHalfUp(raw, 4)} → ${roundHalfUp(raw, 2).toFixed(2)}`, value: roundHalfUp(raw, 2), unit: "ratio" });
    }
    if (lab.TC != null && lab.HDL != null && lab.HDL > 0) {
      const nh = roundHalfUp(lab.TC - lab.HDL, 1), ratio = roundHalfUp(lab.TC / lab.HDL, 2);
      calcs.push({ name: "Non-HDL cholesterol", working: `${lab.TC} − ${lab.HDL} = ${roundHalfUp(lab.TC - lab.HDL, 4)} → ${nh.toFixed(1)}`, value: nh, unit: "mmol/L" });
      calcs.push({ name: "Total / HDL ratio", working: `${lab.TC} ÷ ${lab.HDL} = ${roundHalfUp(lab.TC / lab.HDL, 4)} → ${ratio.toFixed(2)}`, value: ratio, unit: "ratio" });
    }
    /* step 3: ranges, measurements first as on the viewer */
    const meas: Line[] = [];
    const addMeas = (key: string, name: string, test: RrTest, value: number, band: Band, word: string, unit: string, calc?: string) =>
      meas.push({ key, name, value, unit, test, r: rrClassify(test, value, ctx), band, word, limit: "", calc });
    if (bmi != null) { const c = bmiCategory(bmi, ctx.ethnicity, p.date); addMeas("BMI", "BMI", RR_TEST_BY_ID.bmi, bmi, c.band, c.word, "kg/m²", "Calculated in step 2"); }
    if (m.waistCm != null) { const c = waistCategory(m.waistCm, p.sex, p.date); addMeas("WAIST", "Waist", RR_TEST_BY_ID.waist, m.waistCm, c.band, c.word, "cm"); }
    const bp = m.bpSys != null && m.bpDia != null ? bpCategory(m.bpSys, m.bpDia, p.date) : null;
    if (bp && m.bpSys != null && m.bpDia != null) {
      addMeas("BPSYS", "BP systolic", RR_TEST_BY_ID.bpsys, m.bpSys, bpCategory(m.bpSys, 0, p.date).band, bpCategory(m.bpSys, 0, p.date).word, "mmHg");
      addMeas("BPDIA", "BP diastolic", RR_TEST_BY_ID.bpdia, m.bpDia, bpCategory(0, m.bpDia, p.date).band, bpCategory(0, m.bpDia, p.date).word, "mmHg");
    }
    for (const c of LAB) { const v = lab[c]; if (v != null && Number.isFinite(v) && !(c === "PSA" && p.sex === "female")) addLab(c, v); }
    const nh = calcs.find((c) => c.name === "Non-HDL cholesterol")?.value, ra = calcs.find((c) => c.name === "Total / HDL ratio")?.value;
    if (nh != null) addLab("NONHDL", nh, "Calculated in step 2");
    if (ra != null) addLab("TCHDL", ra, "Calculated in step 2");
    const all = meas.concat(lines);
    return { ctx, calcs, all, flagged: all.filter((l) => l.band === "borderline" || l.band === "abnormal") };
  }, [p, dateOk, age, s]); // eslint-disable-line react-hooks/exhaustive-deps

  const record = run ? {
    testRun: true, patient: { name: p.name, sex: p.sex, dob: p.dob, ageOnSampleDate: age, ethnicity: p.eth || null, pregnant: p.sex === "female" ? p.preg : null }, sampleDate: p.date,
    results: run.all.map((l) => ({ code: l.key, value: l.value, unit: l.unit, band: l.band, flag: l.band === "borderline" || l.band === "abnormal" ? "review_required" : "none",
      word: l.word, displayedLimit: l.limit || null, rangeVersion: l.r.version?.id || null, cohort: l.r.row ? cohortText(l.r.row.cohort) : null, source: l.calc ? "calculated" : "entered" })),
    review: run.flagged.length ? { route: "individual_review", reasons: run.flagged.map((l) => `${l.name} ${l.value} ${l.word}`) } : { route: "routine_release_eligible", reasons: [] },
  } : null;

  return (
    <>
      <style>{`.mb{position:relative;display:flex;gap:2px;width:150px;height:8px;border-radius:5px;overflow:visible;margin-bottom:6px}.mb .scr-bar-seg{flex:1;border-radius:3px;height:8px}.mb i{position:absolute;top:50%;width:13px;height:13px;border-radius:50%;background:var(--ink);border:2px solid var(--surface);transform:translate(-50%,-50%);box-shadow:0 1px 4px rgba(0,0,0,.4)}.tr-pick{position:absolute;z-index:5;left:0;right:0;top:calc(100% + 4px);background:var(--surface);border:1px solid var(--border-strong);border-radius:12px;box-shadow:0 12px 30px rgba(0,0,0,.25);overflow:hidden}.tr-pick button{display:flex;flex-direction:column;align-items:flex-start;gap:2px;width:100%;padding:9px 12px;background:none;border:0;border-top:1px solid var(--border);color:inherit;font:inherit;text-align:left;cursor:pointer}.tr-pick button:first-child{border-top:0}.tr-pick button:hover{background:var(--accent-soft)}.tr-pick b{color:var(--ink);font-size:13px}.tr-pick span{color:var(--faint);font-size:11.5px}.tr-chosen{display:flex;align-items:center;gap:8px;padding:9px 12px;border-radius:12px;background:var(--accent-soft);font-size:12.5px;margin-bottom:8px}.tr-chosen b{color:var(--ink)}`}</style>
      <PageHeader eyebrow="Health Screening" title="Test run"
        sub="Choose a participant, enter or adjust their results, and see every step: the calculations, the range used for each result and why, the review decision. Then send it to Results as a report for review." />
      <div className="scr-split">
        <div className="ph-stack" style={{ gap: 14 }}>
          <Card>
            <CardHeader title="1. Choose a participant" sub="Search by name, Precision ID or programme. Their details and latest results fill in; change any number to try it." />
            <div style={{ position: "relative", marginBottom: 12 }}>
              <SearchBox value={find} onChange={setFind} placeholder="Search participants, e.g. Ronan or PH-P-0501" width="100%" />
              {matches.length ? <div className="tr-pick">{matches.map((x) => <button key={x.id} type="button" onClick={() => pick(x.id)}><b>{x.name}</b><span>{x.id} · {x.company}</span></button>)}</div> : null}
            </div>
            {p.personId ? <div className="tr-chosen"><Icon name="user" size={14} /><span className="ph-grow"><b>{p.name}</b> · {p.personId}</span><Button size="sm" variant="ghost" onClick={() => set({ personId: undefined })}>Clear</Button></div> : null}
            <div className="ph-faint" style={{ fontSize: 11.5, margin: "4px 0 6px" }}>Or try an example:</div>
            <div className="scr-chips" style={{ marginBottom: 12 }}>{PRESETS.map((x) => <Button key={x.label} size="sm" onClick={() => { setP(structuredClone(x.p)); setOpen(null); setLogged(false); setSent(null); }}>{x.label}</Button>)}</div>
            <div className="scr-grid-2">
              <Field label="Name"><TextInput value={p.name} onChange={(e) => set({ name: e.target.value })} /></Field>
              <Field label="Sample date" help="Decides which range version applies."><TextInput type="date" value={p.date} onChange={(e) => set({ date: e.target.value })} /></Field>
              <Field label="Sex"><Select value={p.sex} onChange={(e) => set({ sex: e.target.value as SexRecorded })}><option value="female">Female</option><option value="male">Male</option><option value="not_recorded">Not recorded</option></Select></Field>
              <Field label="Date of birth"><TextInput type="date" value={p.dob} onChange={(e) => set({ dob: e.target.value })} /></Field>
              <Field label="Ethnicity (nurse form)"><Select value={p.eth} onChange={(e) => set({ eth: e.target.value })}><option value="">Not recorded</option>{RR_ETHNICITIES.map((x) => <option key={x}>{x}</option>)}</Select></Field>
              <Field label="Pregnant"><Select value={p.preg ? "yes" : "no"} disabled={p.sex !== "female"} onChange={(e) => set({ preg: e.target.value === "yes" })}><option value="no">No</option><option value="yes">Yes</option></Select></Field>
            </div>
          </Card>
          <Card>
            <CardHeader title="Nurse measurements" />
            <div className="scr-grid-2">{MEAS.map((x) => <Field key={x.k} label={`${x.label} (${x.unit})`}><TextInput inputMode="decimal" value={p.meas[x.k]} onChange={(e) => set({ meas: { ...p.meas, [x.k]: e.target.value } })} /></Field>)}</div>
          </Card>
          <Card>
            <CardHeader title="Laboratory results" right={<Button size="sm" variant="primary" icon="spark" onClick={() => {
              /* As if the laboratory has just reported: realistic values around each normal range, about one in four outside it. */
              const lab: Partial<Record<AnalyteCode, string>> = {};
              for (const c of LAB) {
                if (c === "PSA" && p.sex === "female") continue;
                const b = rangeFor(c, { sex: p.sex, age: age ?? 45, on: p.date });
                const d = ANALYTES[c].decimals;
                const lo = b?.lo ?? (b?.hi ?? 1) * 0.4, hi = b?.hi ?? (b?.lo ?? 1) * 2.2;
                const r = Math.random();
                const v = r < 0.15 ? hi * (1.04 + Math.random() * 0.35) : r < 0.25 && b?.lo !== undefined ? lo * (0.75 + Math.random() * 0.2) : lo + (hi - lo) * (0.2 + Math.random() * 0.6);
                lab[c] = v.toFixed(d);
              }
              set({ lab });
            }}>Simulate lab results</Button>} />
            <div className="scr-grid-2">{LAB.map((c) => <Field key={c} label={`${ANALYTES[c].name} (${ANALYTES[c].unit})`}><TextInput inputMode="decimal" value={p.lab[c] || ""} disabled={c === "PSA" && p.sex === "female"} onChange={(e) => set({ lab: { ...p.lab, [c]: e.target.value } })} placeholder={c === "PSA" && p.sex === "female" ? "Males only" : "Not tested"} /></Field>)}</div>
          </Card>
        </div>

        <div className="ph-stack" style={{ gap: 14 }}>
          {!run ? <Callout tone="bad">Enter a valid date of birth and sample date (the birth date must be before the sample date).</Callout> : <>
            <Card>
              <CardHeader title="Step 1: who the ranges are chosen for" />
              <div className="scr-kv">
                <div><p className="scr-k">Sex</p><p className="scr-v">{p.sex === "not_recorded" ? "Not recorded (judged as both, the more severe wins)" : p.sex === "male" ? "Male" : "Female"}</p></div>
                <div><p className="scr-k">Age on sample date</p><p className="scr-v">{age} <span className="ph-faint">(born {fmtDate(p.dob)}, sampled {fmtDate(p.date)})</span></p></div>
                <div><p className="scr-k">Ethnicity</p><p className="scr-v">{p.eth || "Not recorded: all-ethnicities ranges apply"}</p></div>
                <div><p className="scr-k">Range versions used</p><p className="scr-v">Those in force on {fmtDate(p.date)}</p></div>
              </div>
            </Card>

            <Card>
              <CardHeader title="Step 2: calculations" sub="Rounded half up at the reported decimal places, as on paper." />
              <ul className="scr-list">{run.calcs.map((c) => <li key={c.name}><strong style={{ color: "var(--ink)" }}>{c.name}</strong><div className="ph-mono" style={{ fontSize: 12.5 }}>{c.working}{c.value != null ? ` ${c.unit}` : ""}</div></li>)}</ul>
            </Card>

            <Card pad={false}>
              <div style={{ padding: "16px 18px 6px" }}><CardHeader title="Step 3: each result against its range" sub="Click a result to see the backend checks." /></div>
              <div className="ph-tablewrap"><table className="ph-table">
                <thead><tr><th>Result</th><th style={{ textAlign: "right" }}>Value</th><th>Range used</th><th>Outcome</th><th /></tr></thead>
                <tbody>{run.all.map((l) => [
                  <tr key={l.key} onClick={() => setOpen(open === l.key ? null : l.key)} style={{ cursor: "pointer" }} aria-expanded={open === l.key}>
                    <td><div style={{ color: "var(--ink)", fontWeight: 500 }}>{l.name}</div>{l.calc ? <div className="ph-faint" style={{ fontSize: 11 }}>Calculated</div> : null}</td>
                    <td className="ph-num" style={{ textAlign: "right" }}>{l.value} <span className="ph-faint">{l.unit}</span></td>
                    <td style={{ fontSize: 12 }}>{l.r.version ? `${l.test.name} v${l.r.version.version}` : "None"}<div className="ph-faint">{l.r.row ? cohortText(l.r.row.cohort) : "No cohort"}</div></td>
                    <td><MarkerBar l={l} /><Pill tone={BAND_TONE[l.band]}>{l.word || l.band}</Pill></td>
                    <td><Icon name={open === l.key ? "chevronDown" : "chevronRight"} size={14} /></td>
                  </tr>,
                  open === l.key ? <tr key={l.key + "-detail"}><td colSpan={5} style={{ padding: 0, background: "var(--surface-2)" }}><Backend l={l} date={p.date} ctx={run.ctx} /></td></tr> : null,
                ])}</tbody>
              </table></div>
            </Card>

            <Card>
              <CardHeader title="Step 4: review decision" />
              {run.flagged.length ? (
                <Callout tone="warn"><strong>Individual clinician review.</strong> {run.flagged.length} {run.flagged.length === 1 ? "result is" : "results are"} outside normal, so this report cannot use the routine release shortcut:
                  <ul style={{ margin: "6px 0 0", paddingLeft: 16 }}>{run.flagged.map((l) => <li key={l.key}>{l.name} {l.value} {l.unit}: {l.word} ({BAND_COLOUR[l.band]})</li>)}</ul></Callout>
              ) : <Callout tone="ok"><strong>Routine release eligible.</strong> Every result is normal. A clinician still releases it, one report at a time.</Callout>}
            </Card>

            <Card>
              <CardHeader title="Step 5: what the system stores" sub="The record behind the screen. Each result keeps the range version it was judged against, so it can be traced later even if the range changes."
                right={<Button size="sm" icon="file" onClick={() => { try { void navigator.clipboard.writeText(JSON.stringify(record, null, 2)); } catch { /* clipboard unavailable */ } }}>Copy</Button>} />
              <pre className="ph-mono" style={{ fontSize: 11.5, lineHeight: 1.5, maxHeight: 320, overflow: "auto", margin: 0, padding: 12, borderRadius: 10, background: "var(--surface-2)", border: "1px solid var(--border)", whiteSpace: "pre" }}>{JSON.stringify(record, null, 2)}</pre>
            </Card>

            <Card>
              <CardHeader title="Step 6: create the report" sub={p.personId ? `Creates ${p.name}'s report from these results, banded by the ranges: download it as a PDF, and it waits in Dr Reddy's review queue in Results.` : "Choose a participant in step 1 to create their report."} />
              {sent ? (
                <div className="ph-row-flex ph-wrap" style={{ gap: 10 }}><Pill tone="ok" icon="check">{p.name}'s report {sent} is in Results</Pill>
                  <Button icon="print" onClick={() => setPreview(sent)}>View and download report</Button>
                  <Button variant="primary" icon="arrow" onClick={() => nav.go({ page: "Results", tab: "review", params: { episode: sent } })}>Open in Results</Button></div>
              ) : (
                <Button variant="primary" icon="send" disabled={!p.personId} onClick={() => {
                  const lab: Partial<Record<AnalyteCode, number>> = {};
                  for (const c of LAB) { const v = num(p.lab[c]); if (v != null && Number.isFinite(v)) lab[c] = v; }
                  const measures: Partial<Record<Meas, number>> = {};
                  for (const x of MEAS) { const v = num(p.meas[x.k]); if (v != null && Number.isFinite(v)) measures[x.k] = v; }
                  const r = dispatch({ type: "rr/createTestReport", personId: p.personId, date: p.date, measures, lab });
                  if (r.ok && r.id) { setSent(r.id); setPreview(r.id); }
                }}>Create the report</Button>)}
            </Card>

            <Card>
              <CardHeader title="Step 7: audit trail" sub="In live use every result and release is logged. Log this test run to see it in Activity; nothing is added to any patient." />
              <div className="ph-row-flex" style={{ gap: 10 }}>
                <Button variant="primary" icon="check" disabled={logged} onClick={() => { if (dispatch({ type: "rr/logTestRun", name: p.name, results: run.all.length, flagged: run.flagged.length, date: p.date, versions: [...new Set(run.all.map((l) => l.r.version?.id).filter(Boolean))] }).ok) setLogged(true); }}>{logged ? "Logged" : "Log this test run"}</Button>
                {logged ? <span className="ph-faint" style={{ fontSize: 12 }}>Written to Activity, Everything.</span> : null}
              </div>
            </Card>
          </>}
        </div>
      </div>
      {preview ? <PreviewModal open onClose={() => setPreview(null)} episodeId={preview} versionLabel={`${p.name} · ${preview} · test report, not yet reviewed`}
        footer={<Button variant="primary" icon="arrow" onClick={() => { const id = preview; setPreview(null); nav.go({ page: "Results", tab: "review", params: { episode: id } }); }}>Open in Results</Button>} /> : null}
    </>
  );
}

/** The backend checks for one result: version chosen, cohort matched, every band's limits tested. */
function Backend({ l, date, ctx }: { l: Line; date: string; ctx: BandCtx }) {
  const s = usePhState();
  const row = l.r.row;
  const versions = rrVersionsOf(s.referenceRanges.versions, l.test.id).filter((v) => v.status === "published");
  return (
    <div style={{ padding: "4px 18px 18px" }}>
      <div className="ph-stack" style={{ gap: 10, marginTop: 12 }}>
        <div style={{ fontSize: 12.5 }}><strong style={{ color: "var(--ink)" }}>{l.name} {l.value} {l.unit}</strong></div>
        <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.7 }}>
          <li>Versions published for {l.test.name}: {versions.map((v) => `v${v.version} from ${fmtDate(v.effectiveFrom)}`).join(", ")}. Sample date {fmtDate(date)}, so <strong>{l.r.version ? `v${l.r.version.version}` : "none"}</strong> applies.</li>
          <li>Cohort matched: <strong>{row ? cohortText(row.cohort) : "none"}</strong>{ctx.sex === "not_recorded" ? " (sex not recorded: judged as male and female, the more severe used)" : ""}.</li>
          <li>Band checks:
            {row && row.status === "set" && l.test.kind !== "qualitative" ? (
              <table className="scr-bands" style={{ marginTop: 6 }}><tbody>
                {RR_BAND_ORDER.map((k) => row.bands.find((b) => b.key === k)).filter((b): b is NonNullable<typeof b> => !!b).map((b) => {
                  const hit = inBand(b, l.value);
                  return <tr key={b.key}><td><span className="ph-row-flex" style={{ gap: 6 }}><Swatch k={b.key} />{RR_BAND_META[b.key].name}</span></td><td className="num">{l.value} {boundsShort(b, l.test.decimals)}?</td><td>{hit ? <strong style={{ color: "var(--ink)" }}>Yes</strong> : <span className="ph-faint">No</span>}</td></tr>;
                })}</tbody></table>) : <span className="ph-faint"> no numeric bands for this cohort.</span>}
          </li>
          <li>Outcome: <strong>{l.r.label || "no flag"}</strong>. {l.r.why}</li>
          <li>Shown on the report as <strong>{l.word}</strong> ({BAND_COLOUR[l.band]}){l.limit ? `, normal range ${l.limit}` : ""}. {l.band === "borderline" || l.band === "abnormal" ? "Marked Review required." : "No flag."}</li>
        </ol>
        {row ? <p className="scr-sentence" style={{ margin: 0 }}><span className="ph-faint">The range in words: </span>{rowSentence(l.test, row)}</p> : null}
      </div>
    </div>
  );
}

/** The person's value as a dot on the coloured range bar, so where it sits is obvious at a glance. */
function MarkerBar({ l }: { l: Line }) {
  const row = l.r.row;
  if (!row || row.status !== "set" || !row.bands.length) return null;
  const bands = RR_BAND_ORDER.map((k) => row.bands.find((b) => b.key === k)).filter((b): b is NonNullable<typeof b> => !!b);
  let idx = bands.findIndex((b) => inBand(b, l.value));
  let frac = 0.5;
  if (idx < 0) {
    const firstMin = bands[0].min?.value, lastMax = bands[bands.length - 1].max?.value;
    if (firstMin !== undefined && l.value < firstMin) { idx = 0; frac = 0.02; }
    else if (lastMax !== undefined && l.value > lastMax) { idx = bands.length - 1; frac = 0.98; }
    else { idx = bands.findIndex((b) => b.min && l.value < b.min.value); if (idx < 0) idx = bands.length - 1; frac = 0.04; }
  } else {
    const b = bands[idx];
    if (b.min && b.max) frac = (l.value - b.min.value) / Math.max(1e-9, b.max.value - b.min.value);
    else if (b.max) frac = 0.75;
    else if (b.min) frac = 0.25;
  }
  const pos = ((idx + Math.min(0.96, Math.max(0.04, frac))) / bands.length) * 100;
  return (
    <div className="mb" aria-hidden="true">
      {bands.map((b) => <span key={b.key} className="scr-bar-seg" data-k={b.key} />)}
      <i style={{ left: `${pos}%` }} />
    </div>
  );
}
