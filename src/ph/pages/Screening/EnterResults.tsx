/* Enter results: the real thing for the doctor. Pick one participant whose screening is in progress,
   see what the nurse and the questionnaire already captured, type the results from the lab report
   (or drop the lab file for that participant), watch each value banded live against the reference
   ranges with the calculations worked out, then save them onto that participant's own screening.
   Saving uses the same results path as a lab import (labAct.enterValues): each result is added once,
   with who and when, and agents cannot do it. Then Review and release opens the report in Results.
   Deep links: #/Screening/check, #/Screening/check?episode=PH-E-1181 */
import { useMemo, useState } from "react";
import {
  ANALYTES, CALCULATED_ANALYTES, ageOn, bandCtxFor, bandDetail, bmiCategory, bpCategory, expectedTests, fmtDate, fmtNumericDate, ix, labAct, labQueue, latestObservations,
  limitTextFor, localDateOf, parseResultText, persona, reportFlagWord, roundHalfUp, waistCategory,
} from "../../model";
import type { AnalyteCode, Band, BandCtx, Episode, PhState } from "../../model";
import { dispatch, usePhState } from "../../store";
import { useNav } from "../../nav-context";
import { Button, Card, CardHeader, EntityLink, Icon, PageHeader, Pill, RestrictedNotice, SearchBox, TextInput } from "../../ui";
import type { Tone } from "../../ui";
import { LabDropZone } from "../Results/LabImport";
import { Callout } from "./shared";

const BAND_TONE: Record<Band, Tone> = { normal: "ok", borderline: "warn", abnormal: "bad", not_tested: "neutral" };
const BAND_WORD: Record<Band, string> = { normal: "Normal", borderline: "Borderline", abnormal: "Outside range", not_tested: "Not tested" };

interface Pick { e: Episode; name: string; programme: string; why: string; tone: Tone }

/** Screenings still in progress: waiting for lab results, ready today from the point-of-care machine, or with a lab row waiting to be matched. */
function inProgress(s: PhState): { awaiting: Pick[]; ready: Pick[]; matching: Pick[] } {
  const I = ix(s);
  const mk = (e: Episode, why: string, tone: Tone): Pick => {
    const p = I.personById.get(e.personId)!;
    return { e, name: `${p.given} ${p.family}`, programme: I.programmeById.get(e.programmeId)?.name || "", why, tone };
  };
  const awaiting = s.episodes.filter((e) => e.reportState === "awaiting_results").map((e) => {
    const n = expectedTests(s, e).filter((t) => t.status === "pending").length;
    return mk(e, `${n} ${n === 1 ? "result" : "results"} to come`, "neutral");
  });
  const ready = s.episodes.filter((e) => e.reportState === "ready_for_review" && e.capture?.variant === "poc").map((e) => mk(e, "Measured at the clinic, ready today", "info"));
  const seen = new Set<string>();
  const matching = labQueue(s).filter((q) => q.candidate && !seen.has(q.candidate.id) && seen.add(q.candidate.id)).map((q) => mk(q.candidate!, "Lab row to match", "warn"));
  return { awaiting, ready, matching };
}

export default function EnterResults() {
  const s = usePhState();
  const p = persona(s);
  const nav = useNav();
  const id = nav.params.episode && ix(s).episodeById.has(nav.params.episode) ? nav.params.episode : null;
  if (!p.perms.has("clinical.view")) {
    return <><PageHeader title="Enter results" /><RestrictedNotice title="For the clinical team">Results are entered by the doctors. {p.name} ({p.roleLabel}) can import lab files in Results, Lab imports.</RestrictedNotice></>;
  }
  return (
    <>
      <PageHeader title="Enter results" sub="Pick a participant, type the results from the lab report and save them to their record. Each value is checked against your ranges as you type." />
      {id ? <Participant episodeId={id} onChange={() => nav.setParams({})} /> : <Chooser onPick={(eid) => nav.setParams({ episode: eid })} />}
    </>
  );
}

function Chooser({ onPick }: { onPick: (episodeId: string) => void }) {
  const s = usePhState();
  const [q, setQ] = useState("");
  const groups = useMemo(() => inProgress(s), [s]);
  const I = ix(s);
  const query = q.trim().toLowerCase();
  const found: Pick[] = query.length >= 2 ? s.episodes.filter((e) => e.reportState !== "released").filter((e) => {
    const per = I.personById.get(e.personId)!;
    return `${per.given} ${per.family} ${e.screeningRef}`.toLowerCase().includes(query);
  }).slice(0, 12).map((e) => {
    const per = I.personById.get(e.personId)!;
    return { e, name: `${per.given} ${per.family}`, programme: I.programmeById.get(e.programmeId)?.name || "", why: e.reportState.replace(/_/g, " "), tone: "neutral" as Tone };
  }) : [];
  const list = (title: string, rows: Pick[], limit = 8) => rows.length ? (
    <div className="er-group">
      <div className="er-group-title">{title} <span className="ph-faint ph-num">{rows.length}</span></div>
      {rows.slice(0, limit).map((r) => <PickRow key={r.e.id + title} r={r} onPick={onPick} />)}
      {rows.length > limit ? <div className="ph-faint" style={{ fontSize: 12, padding: "6px 4px" }}>Search to find the other {rows.length - limit}.</div> : null}
    </div>
  ) : null;
  return (
    <Card>
      <CardHeader title="Who are you entering results for?" sub="Search by name or Precision ID, or pick from the screenings waiting for results." />
      <SearchBox value={q} onChange={setQ} placeholder="Name or Precision ID" width="100%" />
      {query.length >= 2 ? (
        <div className="er-group" style={{ marginTop: 12 }}>
          {found.length ? found.map((r) => <PickRow key={r.e.id} r={r} onPick={onPick} />) : <div className="ph-faint" style={{ padding: 10 }}>Nobody with a screening in progress matches "{q}".</div>}
        </div>
      ) : (
        <div className="er-groups">
          {list("Lab rows to match", groups.matching)}
          {list("Waiting for lab results", groups.awaiting)}
          {list("Measured at the clinic", groups.ready)}
        </div>
      )}
    </Card>
  );
}

function PickRow({ r, onPick }: { r: Pick; onPick: (episodeId: string) => void }) {
  return (
    <button type="button" className="er-pick" onClick={() => onPick(r.e.id)}>
      <span className="ph-grow" style={{ minWidth: 0 }}><b>{r.name}</b><span className="ph-faint">{r.programme}, Precision ID {r.e.screeningRef}</span></span>
      <Pill tone={r.tone} icon={null}>{r.why}</Pill>
      <Icon name="chevronRight" size={14} />
    </button>
  );
}

interface Line { code: AnalyteCode; name: string; unit: string; onRecord: string | null; typed: string; value: number | null; band: Band; word: string; limit: string; invalid: boolean }

function Participant({ episodeId, onChange }: { episodeId: string; onChange: () => void }) {
  const s = usePhState();
  const nav = useNav();
  const I = ix(s);
  const e = I.episodeById.get(episodeId)!;
  const person = I.personById.get(e.personId)!;
  const programme = I.programmeById.get(e.programmeId);
  const session = I.sessionById.get(e.sessionId);
  const on = localDateOf(e.collectedAt);
  const eth = typeof e.capture.form?.ethnicity === "string" ? e.capture.form.ethnicity : null;
  const ctx: BandCtx = { ...bandCtxFor(person, e.collectedAt), ethnicity: eth };
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [showFile, setShowFile] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const onRecord = new Map(latestObservations(s, e.id).map((o) => [o.code, o]));
  const tests = expectedTests(s, e).filter((t) => !CALCULATED_ANALYTES.includes(t.code));
  const queued = labQueue(s).some((q) => q.candidate && q.candidate.id === e.id);

  const lines: Line[] = tests.map((t) => {
    const o = onRecord.get(t.code);
    const a = ANALYTES[t.code];
    const raw = o ? (o.valueText ?? String(o.value)) : typed[t.code] || "";
    const parsed = raw.trim() ? parseResultText(t.code, raw.trim()) : null;
    const value = o ? o.value : parsed ? parsed.value : null;
    const d = bandDetail(t.code, value, ctx);
    return { code: t.code, name: a.name, unit: a.unit, onRecord: o ? raw : null, typed: o ? "" : typed[t.code] || "", value, band: d.band, word: value === null ? "" : reportFlagWord(t.code, d.band, d.direction), limit: limitTextFor(t.code, ctx), invalid: !o && !!raw.trim() && !parsed };
  });
  const val = (c: AnalyteCode) => lines.find((l) => l.code === c)?.value ?? null;
  const toSave = lines.filter((l) => !l.onRecord && l.typed.trim() && !l.invalid);
  const invalid = lines.filter((l) => l.invalid);
  const pendingCount = lines.filter((l) => !l.onRecord).length;

  /* The calculations, with their working, from what is on record and what is typed. */
  const m = e.capture.measures;
  const mv = (k: keyof typeof m) => (m[k].state === "recorded" && m[k].value != null ? (m[k].value as number) : null);
  const h = mv("heightM"), w = mv("weightKg"), waist = mv("waistCm"), sys = mv("bpSys"), dia = mv("bpDia");
  const calcs: Array<{ name: string; value: string; working: string; band: Band; word: string }> = [];
  if (h && w) { const raw = w / (h * h); const b = roundHalfUp(raw, 1); const c = bmiCategory(b, eth, on); calcs.push({ name: "BMI", value: `${b.toFixed(1)} kg/m²`, working: `${w} kg ÷ (${h} m)² = ${roundHalfUp(raw, 3)}`, band: c.band, word: c.word }); }
  if (waist != null) { const c = waistCategory(waist, person.sex, on); calcs.push({ name: "Waist", value: `${waist} cm`, working: "Measured by the nurse", band: c.band, word: c.word }); }
  if (sys != null && dia != null) { const c = bpCategory(sys, dia, on); calcs.push({ name: "Blood pressure", value: `${sys}/${dia} mmHg`, working: "Measured by the nurse; the higher band of the two applies", band: c.band, word: c.word }); }
  const tc = val("TC"), hdl = val("HDL");
  if (tc != null && hdl != null && hdl > 0) {
    const nh = roundHalfUp(tc - hdl, 1), ra = roundHalfUp(tc / hdl, 2);
    const dn = bandDetail("NONHDL", nh, ctx), dr = bandDetail("TCHDL", ra, ctx);
    calcs.push({ name: "Non-HDL cholesterol", value: `${nh.toFixed(1)} mmol/L`, working: `${tc} minus ${hdl}`, band: dn.band, word: reportFlagWord("NONHDL", dn.band, dn.direction) });
    calcs.push({ name: "Cholesterol to HDL ratio", value: ra.toFixed(2), working: `${tc} divided by ${hdl}`, band: dr.band, word: reportFlagWord("TCHDL", dr.band, dr.direction) });
  }
  const flags = [...lines.filter((l) => l.value !== null && (l.band === "borderline" || l.band === "abnormal")).map((l) => `${l.name} ${l.onRecord || l.typed} ${l.unit}`),
    ...calcs.filter((c) => c.band === "borderline" || c.band === "abnormal").map((c) => `${c.name} ${c.value}`)];

  const save = () => {
    const r = dispatch(labAct.enterValues(e.id, toSave.map((l) => ({ code: l.code, valueText: l.typed.trim() }))));
    setMsg(r.ok ? null : r.message || "Not saved.");
    if (r.ok) setTyped({});
  };
  const ready = e.reportState === "ready_for_review";
  const released = e.reportState === "released";

  return (
    <div className="ph-stack" style={{ gap: 14 }}>
      <Card>
        <div className="er-who">
          <div className="ph-grow" style={{ minWidth: 220 }}>
            <div className="er-name"><EntityLink kind="person" id={person.id}>{person.given} {person.family}</EntityLink></div>
            <div className="er-ids">
              <span><i>Date of birth</i>{fmtNumericDate(person.dob)} (age {ageOn(person.dob, on)})</span>
              <span><i>Sex</i>{person.sex === "male" ? "Male" : person.sex === "female" ? "Female" : "Not recorded"}</span>
              <span><i>Precision ID</i><span className="ph-mono">{e.screeningRef}</span></span>
              <span><i>Screened</i>{fmtDate(e.collectedAt)}{session ? `, ${session.siteName}` : ""}</span>
              {programme ? <span><i>Programme</i><EntityLink kind="programme" id={programme.id}>{programme.name}</EntityLink></span> : null}
            </div>
          </div>
          <div className="ph-row-flex" style={{ gap: 8, flexWrap: "wrap", alignSelf: "flex-start" }}>
            <Pill tone={ready ? "info" : released ? "ok" : e.reportState === "on_hold" ? "warn" : "neutral"} icon={null}>{ready ? "Ready for review" : released ? "Released" : e.reportState === "on_hold" ? "On hold" : `${pendingCount} ${pendingCount === 1 ? "result" : "results"} to come`}</Pill>
            <Button size="sm" variant="ghost" icon="chevronLeft" onClick={onChange}>Choose someone else</Button>
          </div>
        </div>
        {queued ? <div style={{ marginTop: 12 }}><Callout tone="warn">A lab row for {person.given} waits to be matched. <button type="button" className="ph-link" onClick={() => nav.go({ page: "Results", tab: "imports", params: { view: "queue" } })}>Match it in Lab imports</button></Callout></div> : null}
        {e.reportState === "on_hold" ? <div style={{ marginTop: 12 }}><Callout tone="warn">This screening is on hold. <EntityLink kind="episode" id={e.id}>Open it in Review</EntityLink> to see why and resolve it first.</Callout></div> : null}
      </Card>

      {calcs.length ? (
        <Card>
          <CardHeader title="From the nurse and the calculations" sub="Already on the record. Worked out by Pulse, never typed." />
          <div className="er-calcs">
            {calcs.map((c) => (
              <div key={c.name} className="er-calc">
                <div className="er-calc-name">{c.name}</div>
                <div className="er-calc-val">{c.value}</div>
                <div className="ph-faint" style={{ fontSize: 11.5 }}>{c.working}</div>
                <Pill tone={BAND_TONE[c.band]} icon={null}>{BAND_WORD[c.band]}</Pill>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Lab results" sub={pendingCount ? "Type each value from the lab report. Values already on the record are shown, not changed here." : "Every result for this screening is on the record."}
          right={!released && pendingCount ? <Button size="sm" icon="file" onClick={() => setShowFile(!showFile)}>{showFile ? "Type them instead" : "Import from lab file"}</Button> : null} />
        {showFile ? <div style={{ marginBottom: 12 }}><LabDropZone personId={person.id} onImported={() => setShowFile(false)} /></div> : null}
        <div className="er-lines">
          {lines.map((l) => (
            <div key={l.code} className={"er-line" + (l.onRecord ? " on" : "")}>
              <label className="er-line-name" htmlFor={`er-${l.code}`}>{l.name}<span className="ph-faint">{l.limit ? `Normal ${l.limit}` : ""}</span></label>
              {l.onRecord ? <span className="er-line-val">{l.onRecord} <small>{l.unit}</small></span> : (
                <span className="er-line-input"><TextInput id={`er-${l.code}`} inputMode={ANALYTES[l.code].qualitative ? "text" : "decimal"} value={l.typed} invalid={l.invalid} disabled={released || e.reportState === "on_hold"}
                  placeholder={ANALYTES[l.code].qualitative ? "Negative or Positive" : "Value"} onChange={(ev) => setTyped((x) => ({ ...x, [l.code]: ev.target.value }))} /><small>{l.unit}</small></span>
              )}
              <span className="er-line-band">{l.invalid ? <Pill tone="bad" icon="alert">Not a number</Pill> : l.value !== null ? <Pill tone={BAND_TONE[l.band]} icon={null}>{BAND_WORD[l.band]}</Pill> : null}{l.onRecord ? <span className="ph-faint" style={{ fontSize: 11 }}>On record</span> : null}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        {flags.length ? <Callout tone="warn"><strong>{flags.length} {flags.length === 1 ? "value needs" : "values need"} your review:</strong> {flags.join("; ")}.</Callout>
          : lines.some((l) => l.value !== null) ? <Callout tone="ok"><strong>Everything so far is in the normal range.</strong> You still release the report yourself.</Callout> : null}
        {msg ? <div className="ph-err" role="alert" style={{ marginTop: 10 }}>{msg}</div> : null}
        {invalid.length ? <div className="ph-err" style={{ marginTop: 10 }}>Check {invalid.map((l) => l.name).join(", ")}: Pulse cannot read {invalid.length === 1 ? "that value" : "those values"}.</div> : null}
        <div className="ph-row-flex" style={{ gap: 10, marginTop: 12, flexWrap: "wrap" }}>
          {toSave.length ? (
            <Button variant="primary" icon="check" className="er-big" disabled={!!invalid.length} onClick={save}>Save {toSave.length} {toSave.length === 1 ? "result" : "results"} to their record</Button>
          ) : ready || released ? (
            <Button variant="primary" icon="arrow" className="er-big" onClick={() => nav.go({ page: "Results", tab: "review", params: { episode: e.id } })}>{released ? "Open the released report" : "Review and release"}</Button>
          ) : (
            <Button variant="primary" icon="check" className="er-big" disabled>Save to their record</Button>
          )}
          <span className="ph-faint" style={{ fontSize: 12 }}>
            {toSave.length ? `Saved as entered by you, with the time. ${pendingCount - toSave.length ? `${pendingCount - toSave.length} still to come after this.` : "Then it is ready for your review."}`
              : ready ? "All results are in. Review the report, write the advice and release it." : released ? "This report is already released." : "Type a value above to save it."}
          </span>
        </div>
      </Card>
    </div>
  );
}
