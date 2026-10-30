/* New screening: one participant from customer to released report, in six plain steps.
   1 Customer (pick the client, then the participant), 2 Details (who they are, what they told us,
   the nurse's measurements), 3 Results (enter or confirm values, calculations with working, live
   bands), 4 Ranges check (open any flagged test's range, change it as a superadmin, see it re-band),
   5 Approve (advice, preview, approve and release, logged with name and time), 6 Summary (the
   summary agent's draft, approved by the doctor, then shown on the report and in the employee portal).
   Everything works on the participant's real screening; nothing is created on the side.
   Deep links: #/Screening/new, #/Screening/new?programme=PRG-IBM-26, #/Screening/new?episode=PH-E-1181&step=3 */
import { useMemo, useState } from "react";
import {
  ADVICE_ROUTINE, RR_TEST_BY_ANALYTE, RR_TEST_BY_ID, act, draftVersion, episodeFlags, fmtDate, fmtNumericDate, ageOn, ix, membershipOf, persona, screeningSummary, summaryAct,
} from "../../model";
import type { AnalyteCode, Band, Episode, RrTest } from "../../model";
import { whatTheyToldUs } from "../../model/nurseEntry";
import { dispatch, getState, usePhState } from "../../store";
import { useNav } from "../../nav-context";
import { Button, Card, CardHeader, Chip, EntityLink, Icon, PageHeader, Pill, RestrictedNotice, SearchBox, Textarea } from "../../ui";
import type { Tone } from "../../ui";
import { PreviewModal } from "../Results/ReportPreview";
import { Participant, useScreening } from "./EnterResults";
import { TestDrawer } from "./Ranges";
import { Callout } from "./shared";

const STEPS = ["Customer", "Details", "Results", "Ranges check", "Approve", "Summary"] as const;
const BAND_TONE: Record<Band, Tone> = { normal: "ok", borderline: "warn", abnormal: "bad", not_tested: "neutral" };
const BAND_WORD: Record<Band, string> = { normal: "Normal", borderline: "Borderline", abnormal: "Outside range", not_tested: "Not tested" };

export default function NewScreening() {
  const s = usePhState();
  const p = persona(s);
  const nav = useNav();
  const I = ix(s);
  const episodeId = nav.params.episode && I.episodeById.has(nav.params.episode) ? nav.params.episode : null;
  const step = episodeId ? Math.min(6, Math.max(2, Number(nav.params.step) || 2)) : 1;
  const go = (n: number, extra: Record<string, string> = {}) => nav.setParams({ ...(episodeId ? { episode: episodeId } : {}), ...extra, step: String(n) });
  if (!p.perms.has("clinical.view")) return <><PageHeader title="New screening" /><RestrictedNotice title="For the clinical team">The doctors run a screening through to release. {p.name} ({p.roleLabel}) can follow it in Results.</RestrictedNotice></>;
  return (
    <>
      <PageHeader title="New screening" sub="From the customer to a released report: pick the participant, check their results against your ranges, approve, and send the summary." />
      <ol className="ns-steps" aria-label="Steps">
        {STEPS.map((label, i) => {
          const n = i + 1;
          const done = n < step, cur = n === step;
          return (
            <li key={label} className={"ns-step" + (cur ? " cur" : done ? " done" : "")}>
              <button type="button" disabled={n !== 1 && (!episodeId || n > step)} onClick={() => (n === 1 ? nav.setParams(nav.params.programme ? { programme: nav.params.programme } : {}) : go(n))} aria-current={cur ? "step" : undefined}>
                <span className="ns-dot">{done ? <Icon name="check" size={12} stroke={2.4} /> : n}</span><span className="ns-label">{label}</span>
              </button>
            </li>
          );
        })}
      </ol>
      {step === 1 ? <StepCustomer onPick={(id) => nav.setParams({ episode: id, step: "2" })} />
        : step === 2 ? <StepDetails episodeId={episodeId!} onNext={() => go(3)} />
        : step === 3 ? <Participant episodeId={episodeId!} onChange={() => nav.setParams({})} onDone={() => go(4)} doneLabel="Continue to the ranges check" />
        : step === 4 ? <StepRanges episodeId={episodeId!} onNext={() => go(5)} />
        : step === 5 ? <StepApprove episodeId={episodeId!} onNext={() => go(6)} />
        : <StepSummary episodeId={episodeId!} />}
    </>
  );
}

/* ---------- 1. Customer ---------- */
function StepCustomer({ onPick }: { onPick: (episodeId: string) => void }) {
  const s = usePhState();
  const nav = useNav();
  const I = ix(s);
  const prog = nav.params.programme || "";
  const q = nav.params.q || "";
  const setP = (next: Record<string, string>) => { const x = { ...nav.params, ...next }; Object.keys(x).forEach((k) => { if (!x[k]) delete x[k]; }); nav.setParams(x); };
  const open = (e: Episode) => e.reportState !== "released";
  const programmes = s.programmes.map((pg) => ({ pg, n: s.episodes.filter((e) => e.programmeId === pg.id && open(e)).length })).filter((x) => x.n > 0);
  const query = q.trim().toLowerCase();
  const people = s.episodes.filter((e) => open(e) && (!prog || e.programmeId === prog)).filter((e) => {
    if (!query) return true;
    const per = I.personById.get(e.personId)!;
    return `${per.given} ${per.family} ${e.screeningRef}`.toLowerCase().includes(query);
  });
  const state: Record<Episode["reportState"], { t: string; tone: Tone }> = { awaiting_results: { t: "Results to come", tone: "neutral" }, ready_for_review: { t: "Ready for review", tone: "info" }, on_hold: { t: "On hold", tone: "warn" }, released: { t: "Released", tone: "ok" } };
  return (
    <Card>
      <CardHeader title="Which customer?" sub="Pick the client, then the participant. Or search everyone with a screening in progress." />
      <div className="ns-clients">
        {programmes.map(({ pg, n }) => (
          <button key={pg.id} type="button" className="ns-client" aria-pressed={prog === pg.id} onClick={() => setP({ programme: prog === pg.id ? "" : pg.id })}>
            <b>{pg.clientName}</b><span className="ph-faint">{pg.name}</span><span className="ns-client-n">{n} in progress</span>
          </button>
        ))}
      </div>
      <div style={{ marginTop: 14 }}><SearchBox value={q} onChange={(v) => setP({ q: v })} placeholder={prog ? `Search ${I.programmeById.get(prog)?.clientName || "this client"}` : "Search all participants by name or Precision ID"} width="100%" /></div>
      <div className="er-group" style={{ marginTop: 10 }}>
        {(prog || query ? people : []).slice(0, 20).map((e) => {
          const per = I.personById.get(e.personId)!;
          return (
            <button key={e.id} type="button" className="er-pick" onClick={() => onPick(e.id)}>
              <span className="ph-grow" style={{ minWidth: 0 }}><b>{per.given} {per.family}</b><span className="ph-faint">{I.programmeById.get(e.programmeId)?.name}, Precision ID {e.screeningRef}, screened {fmtDate(e.collectedAt)}</span></span>
              <Pill tone={state[e.reportState].tone} icon={null}>{state[e.reportState].t}</Pill><Icon name="chevronRight" size={14} />
            </button>
          );
        })}
        {!prog && !query ? <div className="ph-faint" style={{ padding: "8px 4px", fontSize: 12.5 }}>Choose a client above to see their participants.</div>
          : !people.length ? <div className="ph-faint" style={{ padding: "8px 4px", fontSize: 12.5 }}>Nobody matches.</div>
          : people.length > 20 ? <div className="ph-faint" style={{ padding: "8px 4px", fontSize: 12 }}>Showing 20 of {people.length}. Search to narrow it down.</div> : null}
      </div>
    </Card>
  );
}

/* ---------- 2. Details ---------- */
function StepDetails({ episodeId, onNext }: { episodeId: string; onNext: () => void }) {
  const { s, e, person, programme, session, on, calcs } = useScreening(episodeId);
  const answers = membershipOf(s, person.id, e.programmeId)?.answers || {};
  const told = whatTheyToldUs(answers, person.sex).filter((g) => g.items.length);
  return (
    <div className="ph-stack" style={{ gap: 14 }}>
      <WhoCard e={e} />
      <Card>
        <CardHeader title="What they told us" sub="From their questionnaire before the appointment. Flags are prompts for the conversation, never a diagnosis." />
        {told.length ? <div className="ns-told">{told.map((g) => (
          <div key={g.key}><div className="er-group-title">{g.title}</div>
            {g.items.map((it) => <div key={it.key} className="ns-told-row"><span className="ph-faint">{it.label}</span><span>{it.flag ? <Pill tone="warn" icon="flag">{it.value}</Pill> : it.value}</span></div>)}</div>
        ))}</div> : <div className="ph-faint">No questionnaire answers on record.</div>}
      </Card>
      <Card>
        <CardHeader title="Measured by the nurse" sub={`${session ? session.siteName + ", " : ""}${fmtDate(on)}. ${programme ? programme.name : ""}`} />
        {calcs.length ? <CalcGrid calcs={calcs} /> : <div className="ph-faint">No measurements on record.</div>}
      </Card>
      <div><Button variant="primary" icon="arrow" className="er-big" onClick={onNext}>Continue to results</Button></div>
    </div>
  );
}

export function WhoCard({ e }: { e: Episode }) {
  const s = usePhState();
  const I = ix(s);
  const person = I.personById.get(e.personId)!;
  const programme = I.programmeById.get(e.programmeId);
  return (
    <Card>
      <div className="er-name"><EntityLink kind="person" id={person.id}>{person.given} {person.family}</EntityLink></div>
      <div className="er-ids">
        <span><i>Date of birth</i>{fmtNumericDate(person.dob)} (age {ageOn(person.dob, e.collectedAt.slice(0, 10))})</span>
        <span><i>Sex</i>{person.sex === "male" ? "Male" : person.sex === "female" ? "Female" : "Not recorded"}</span>
        <span><i>Precision ID</i><span className="ph-mono">{e.screeningRef}</span></span>
        <span><i>Customer</i>{programme ? <EntityLink kind="programme" id={programme.id}>{programme.clientName}</EntityLink> : ""}</span>
      </div>
    </Card>
  );
}

function CalcGrid({ calcs }: { calcs: Array<{ name: string; value: string; working: string; band: Band }> }) {
  return (
    <div className="er-calcs">
      {calcs.map((c) => (
        <div key={c.name} className="er-calc">
          <div className="er-calc-name">{c.name}</div><div className="er-calc-val">{c.value}</div>
          <div className="ph-faint" style={{ fontSize: 11.5 }}>{c.working}</div>
          <Pill tone={BAND_TONE[c.band]} icon={null}>{BAND_WORD[c.band]}</Pill>
        </div>
      ))}
    </div>
  );
}

/* ---------- 4. Ranges check ---------- */
const CALC_TEST: Record<string, string> = { BMI: "bmi", Waist: "waist", "Blood pressure": "bpsys", "Non-HDL cholesterol": "", "Cholesterol to HDL ratio": "" };
function StepRanges({ episodeId, onNext }: { episodeId: string; onNext: () => void }) {
  const { e, on, lines, calcs } = useScreening(episodeId);
  const [open, setOpen] = useState<RrTest | null>(null);
  const flagged = [
    ...calcs.filter((c) => c.band === "borderline" || c.band === "abnormal").map((c) => ({ key: c.name, name: c.name, value: c.value, band: c.band, test: CALC_TEST[c.name] ? RR_TEST_BY_ID[CALC_TEST[c.name]] : c.name === "Non-HDL cholesterol" ? RR_TEST_BY_ANALYTE.NONHDL : RR_TEST_BY_ANALYTE.TCHDL })),
    ...lines.filter((l) => l.value !== null && (l.band === "borderline" || l.band === "abnormal")).map((l) => ({ key: l.code, name: l.name, value: `${l.onRecord || l.typed} ${l.unit}`, band: l.band, test: RR_TEST_BY_ANALYTE[l.code as AnalyteCode] })),
  ];
  return (
    <div className="ph-stack" style={{ gap: 14 }}>
      <WhoCard e={e} />
      <Card>
        <CardHeader title={flagged.length ? `${flagged.length} ${flagged.length === 1 ? "value is" : "values are"} outside normal` : "Every value is in the normal range"}
          sub={`Judged on your ranges in force on ${fmtDate(on)}. Open a range to check it or change a number; the band here updates as soon as the change is published.`} />
        {flagged.length ? (
          <div className="er-group">
            {flagged.map((f) => (
              <div key={f.key} className="er-pick" style={{ cursor: "default" }}>
                <span className="ph-grow" style={{ minWidth: 0 }}><b>{f.name}</b><span className="ph-faint">{f.value}</span></span>
                <Pill tone={BAND_TONE[f.band]} icon={null}>{BAND_WORD[f.band]}</Pill>
                {f.test ? <Button size="sm" icon="edit" onClick={() => setOpen(f.test!)}>Open range</Button> : null}
              </div>
            ))}
          </div>
        ) : <Callout tone="ok">Nothing to check. You still approve the report yourself.</Callout>}
      </Card>
      <div><Button variant="primary" icon="arrow" className="er-big" onClick={onNext}>Continue to approve</Button></div>
      {open ? <TestDrawer test={open} fromDate={on} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}

/* ---------- 5. Approve ---------- */
function StepApprove({ episodeId, onNext }: { episodeId: string; onNext: () => void }) {
  const s = usePhState();
  const { e, person, flags } = useScreening(episodeId);
  const sum = useMemo(() => screeningSummary(s, episodeId), [s, episodeId]);
  const draft = draftVersion(s, episodeId);
  const proposed = draft && draft.advice.trim() ? draft.advice : sum && sum.attention.length
    ? `${person.given}, thank you for attending your screening. ${sum.attention.map((x) => `Your ${x.what.replace(/ [\d.]+.*$/, "").toLowerCase()} is ${x.why}.`).join(" ")} ${sum.next.join(" ")}`
    : ADVICE_ROUTINE[Number(e.id.slice(-1)) % ADVICE_ROUTINE.length];
  const [advice, setAdvice] = useState(proposed);
  const [seen, setSeen] = useState(false);
  const [preview, setPreview] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const released = e.reportState === "released";
  const approve = () => {
    const steps: Array<() => { ok: boolean; message?: string }> = [
      () => dispatch(act.setAdvice(e.id, advice.trim())),
      () => (draftVersion(getState(), e.id)?.checklist.advice ? { ok: true } : dispatch(act.toggleReviewCheck(e.id, "advice"))),
      () => (episodeFlags(getState(), ix(getState()).episodeById.get(e.id)!).length && !draftVersion(getState(), e.id)?.flagAcknowledged ? dispatch(act.ackFlags(e.id)) : { ok: true }),
      () => (draftVersion(getState(), e.id)?.checklist.preview ? { ok: true } : dispatch(act.toggleReviewCheck(e.id, "preview"))),
      () => dispatch(act.releaseReport(e.id)),
    ];
    for (const run of steps) { const r = run(); if (!r.ok) { setMsg(r.message || "Not released."); return; } }
    setMsg(null);
    onNext();
  };
  if (released) {
    return <div className="ph-stack" style={{ gap: 14 }}><WhoCard e={e} /><Card><Callout tone="ok"><strong>Released.</strong> {person.given}'s report is in the employee portal.</Callout><div style={{ marginTop: 12 }}><Button variant="primary" icon="arrow" className="er-big" onClick={onNext}>Continue to the summary</Button></div></Card></div>;
  }
  if (e.reportState !== "ready_for_review") {
    return <div className="ph-stack" style={{ gap: 14 }}><WhoCard e={e} /><Card><Callout tone="warn">Not every result is in yet, so the report cannot be approved. Go back to Results and enter the rest.</Callout></Card></div>;
  }
  return (
    <div className="ph-stack" style={{ gap: 14 }}>
      <WhoCard e={e} />
      <Card>
        <CardHeader title="Your advice" sub="Drafted from the results for you to edit. It goes on the first page of the report." right={<Pill tone="info" icon="spark">Agent draft, edit freely</Pill>} />
        <Textarea rows={6} value={advice} onChange={(ev) => { setAdvice(ev.target.value); setSeen(false); }} aria-label="Advice" />
        {flags.length ? <div className="ph-faint" style={{ fontSize: 12, marginTop: 8 }}>Approving confirms you have reviewed the {flags.length} flagged {flags.length === 1 ? "value" : "values"}.</div> : null}
        {msg ? <div className="ph-err" role="alert" style={{ marginTop: 8 }}>{msg}</div> : null}
        <div className="ph-row-flex" style={{ gap: 10, marginTop: 12, flexWrap: "wrap" }}>
          {seen
            ? <Button variant="primary" icon="check" className="er-big" disabled={advice.trim().length < 10} onClick={approve}>Approve and release</Button>
            : <Button variant="primary" icon="eye" className="er-big" disabled={advice.trim().length < 10} onClick={() => { setPreview(true); setSeen(true); }}>Preview the report</Button>}
          {seen ? <Button icon="eye" onClick={() => setPreview(true)}>Preview again</Button> : null}
          <span className="ph-faint" style={{ fontSize: 12 }}>{seen ? "Released in your name, with the time, and sent to the employee portal." : "Look at the report as the participant will see it, then approve."}</span>
        </div>
      </Card>
      {preview ? <PreviewModal open onClose={() => setPreview(false)} episodeId={e.id} advice={advice} versionLabel="Not visible to the participant until you approve it." /> : null}
    </div>
  );
}

/* ---------- 6. Summary ---------- */
function StepSummary({ episodeId }: { episodeId: string }) {
  const s = usePhState();
  const nav = useNav();
  const { e, person, programme } = useScreening(episodeId);
  const sum = screeningSummary(s, episodeId);
  const released = s.episodes.filter((x) => x.programmeId === e.programmeId && x.reportState === "released").length;
  if (!sum) return <Card><div className="ph-faint">No results to summarise yet.</div></Card>;
  return (
    <div className="ph-stack" style={{ gap: 14 }}>
      <WhoCard e={e} />
      <Card>
        <CardHeader title="Summary for the participant" right={sum.approved ? <Pill tone="ok" icon="check">Approved by {sum.approved.by}</Pill> : <Pill tone="info" icon="spark">Drafted by the summary agent</Pill>} />
        <p className="ns-summary">{sum.text}</p>
        <div className="ns-sum-cols">
          <div><div className="er-group-title">Normal</div>{sum.normal.length ? <div className="scr-chips">{sum.normal.map((x) => <Chip key={x}>{x}</Chip>)}</div> : <span className="ph-faint">None</span>}</div>
          <div><div className="er-group-title">Needs attention</div>{sum.attention.length ? <ul className="scr-list">{sum.attention.map((x) => <li key={x.what}>{x.what}: {x.why}</li>)}</ul> : <span className="ph-faint">Nothing</span>}</div>
          <div><div className="er-group-title">Next steps</div><ul className="scr-list">{sum.next.map((x) => <li key={x}>{x}</li>)}</ul></div>
        </div>
        <div className="ph-faint" style={{ fontSize: 11.5, marginTop: 10 }}>Written by the summary agent from the banded results, the same way every time. It is shown to {person.given} only once you approve it.</div>
        <div className="ph-row-flex" style={{ gap: 10, marginTop: 12, flexWrap: "wrap" }}>
          {sum.approved ? (
            <>
              <Button variant="primary" icon="user" className="er-big" onClick={() => nav.openPortal(person.id)}>Open {person.given}'s employee portal</Button>
              {nav.openClientPortal ? <Button icon="users" onClick={() => nav.openClientPortal?.()}>Open the {programme?.clientName || "client"} HR portal</Button> : null}
              <Button variant="ghost" icon="plus" onClick={() => nav.setParams({})}>Start another screening</Button>
            </>
          ) : <Button variant="primary" icon="check" className="er-big" disabled={e.reportState !== "released"} onClick={() => dispatch(summaryAct.approve(e.id))}>Approve the summary</Button>}
          <span className="ph-faint" style={{ fontSize: 12 }}>{sum.approved ? `${released} reports released for ${programme?.clientName || "this client"} so far.` : e.reportState === "released" ? "Approving adds it to the report and the employee portal." : "Approve the report first."}</span>
        </div>
      </Card>
    </div>
  );
}
