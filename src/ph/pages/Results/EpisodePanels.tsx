/* The episode's clinical picture, used by Review and Corrections: identifiers, status
   banners, laboratory values with source and previous version, measurements and
   calculations, questionnaire answers, the QRISK3 dependency state and the history. */
import type { ReactNode } from "react";
import {
  ANALYTES, BP_REVIEW_LIMIT, HOLD_CATEGORY, HOLD_LABEL, LIMITS_DISCLAIMER, MEASURE_RULES, QRISK3, bpFlagged, episodeBundle, fmtAge,
  fmtDateTime, fmtNumericDate, fmtShortDateTime, fmtWhen, hoursBetween, ix, staffName,
} from "../../model";
import type { ExpectedTestView, Measure, MeasureKey, PhState } from "../../model";
import { usePhState } from "../../store";
import { useNav } from "../../nav-context";
import { Button, Card, DemoTag, EntityLink, Pill } from "../../ui";
import {
  Banner, EventList, FlagPill, HoldCategoryPill, Kv, ReportStatePill, SecTitle, TestStatusPill, fmtValue, useWidth,
} from "./shared";
import { episodeEventIds, eventsFor, observationChain, openUnitIssues, rowIndex } from "./select";

export type Bundle = NonNullable<ReturnType<typeof episodeBundle>>;

/* ---- identifiers ---- */
export function EpisodeHeader({ b, right }: { b: Bundle; right?: ReactNode }) {
  const state = usePhState();
  const ready = b.episode.readyAt;
  const idHold = !!b.episode.hold && HOLD_CATEGORY[b.episode.hold.kind] === "identity";
  const idOk = !idHold && b.episode.capture.identity.every((c) => c.confirmed);
  const visible = b.episode.reportState === "released" && !!b.released;
  const summary = b.episode.reportState === "ready_for_review"
    ? `${b.flags.length ? `${b.flags.length === 1 ? "One finding requires" : `${b.flags.length} findings require`} individual review` : "No findings are flagged for review"}. No report is visible to the participant yet.`
    : visible ? `Report v${b.released!.version} is visible to the participant.` : "No report is visible to the participant.";
  return (
    <Card pad="sm">
      <div className="ph-row-flex" style={{ alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
        <div className="ph-grow" style={{ minWidth: 180 }}>
          <div className="phr-row" style={{ gap: 8 }}>
            <h2 className="ph-h1" style={{ fontSize: 18 }}>{b.name}</h2>
            <ReportStatePill state={b.episode.reportState} />
            {idOk ? <Pill tone="ok" icon="shield">Identity verified</Pill> : <Pill tone="warn" icon="alert">Identity not verified</Pill>}
            <Pill tone="neutral" icon={null}>{b.programme.code}</Pill>
          </div>
          <div className="phr-sub" style={{ marginTop: 3 }}>{b.programme.name}. Fictional participant. {summary}</div>
        </div>
        {right ? <div className="phr-row" style={{ flex: "none" }}>{right}</div> : null}
      </div>
      <div style={{ marginTop: 8 }}>
        <Kv tight items={[
          { k: "Episode", v: <span className="phr-mono">{b.episode.id}</span> },
          { k: "Person", v: <EntityLink kind="person" id={b.person.id} /> },
          { k: "Date of birth", v: fmtNumericDate(b.person.dob) },
          { k: "Booking", v: <EntityLink kind="booking" id={b.booking.id} /> },
          { k: "Specimen", v: <span className="phr-mono">{b.episode.specimenIds.join(", ")}</span> },
          { k: "Collected", v: <>{fmtShortDateTime(b.episode.collectedAt)}, <EntityLink kind="session" id={b.session.id}>{b.session.siteName}</EntityLink></> },
          { k: "Ready for review", v: ready ? `${fmtWhen(ready, state.clock.nowUtc)} (${fmtAge(hoursBetween(ready, state.clock.nowUtc))})` : "Not yet" },
          { k: "Reviewer", v: staffName(state, b.episode.reviewAssigneeId) },
          { k: "Form", v: `${state.forms.templates.find((t) => t.id === b.episode.formSnapshot.templateId)?.name || b.episode.formSnapshot.templateId}, v${b.episode.formSnapshot.version}` },
        ]} />
      </div>
    </Card>
  );
}

/* ---- why this episode can or cannot be reviewed ---- */
export function StateBanner({ b, canResolve }: { b: Bundle; canResolve?: boolean }) {
  const state = usePhState();
  const nav = useNav();
  const ep = b.episode;
  if (ep.reportState === "on_hold" && ep.hold) {
    const cat = HOLD_CATEGORY[ep.hold.kind];
    const fu = ep.hold.followUpId;
    const unit = openUnitIssues(state).find((u) => u.episode.id === ep.id);
    const target = ep.hold.rowId
      ? { label: "Open the held row", go: () => nav.go({ page: "Results", tab: "imports", params: { batch: ep.hold!.rowId!.replace(/-R\d+$/, ""), row: ep.hold!.rowId! } }) }
      : fu ? { label: "Open follow-up " + fu, go: () => nav.go({ page: "Results", tab: "follow-up", params: { followup: fu } }) }
      : unit && unit.rowId ? { label: "Open the row in Imports", go: () => nav.go({ page: "Results", tab: "imports", params: { batch: unit.rowId!.replace(/-R\d+$/, ""), row: unit.rowId! } }) }
      : null;
    return (
      <Banner tone={cat === "clinical_action" ? "bad" : cat === "identity" ? "warn" : "info"} icon="flag"
        action={target ? <Button size="sm" onClick={target.go}>{target.label}</Button> : undefined}>
        <div className="phr-row" style={{ gap: 6, marginBottom: 3 }}><HoldCategoryPill category={cat} /><b>{HOLD_LABEL[ep.hold.kind]}</b></div>
        {ep.hold.reason} On hold since {fmtWhen(ep.hold.since, state.clock.nowUtc)}. Release is not available while the hold is open.
        {cat === "identity" && canResolve === false ? " Identity resolution needs a role with identity resolution access." : ""}
      </Banner>
    );
  }
  if (ep.reportState === "awaiting_results") {
    const pend = b.tests.filter((t) => t.status !== "received");
    return (
      <Banner tone="neutral" icon="clock">
        <b>Awaiting results.</b> {pend.length} of {b.tests.length} expected tests are not yet received: {pend.map((t) => t.name).join(", ")}. They stay listed as pending, never as normal. The episode joins the review queue when every expected result is accounted for.
      </Banner>
    );
  }
  if (ep.reportState === "released" && b.released) {
    return (
      <Banner tone="ok" icon="check"
        action={<Button size="sm" onClick={() => nav.go({ page: "Results", tab: "corrections", params: { episode: ep.id } })}>Version history</Button>}>
        <b>Released v{b.released.version}</b> on {fmtDateTime(b.released.releasedAt!)} by {staffName(state, b.released.releasedBy)} ({b.released.releaseMode === "routine" ? "routine report, no review flags" : "individually reviewed"}).
        {b.draft ? ` Correction draft v${b.draft.version} is in progress.` : " A change needs a correction, which creates a new version and a new review."}
      </Banner>
    );
  }
  return null;
}

/* ---- laboratory values ---- */
function sourceCell(state: PhState, t: ExpectedTestView): ReactNode {
  const o = t.observation;
  const rowId = o ? (o.source.kind === "batch" ? o.source.rowId : null) : t.rowId;
  if (o && o.source.kind === "clinic") return <span className="ph-faint">Clinic</span>;
  if (!rowId) return <span className="ph-faint">None yet</span>;
  const row = rowIndex(state).get(rowId);
  return (
    <span title={`${rowId}${row ? `, ${row.batchId}` : ""}`}>
      <EntityLink kind="row" id={rowId}>{row ? `line ${row.line}` : rowId}</EntityLink>
    </span>
  );
}

export function ResultsTable({ b, showValues }: { b: Bundle; showValues: boolean }) {
  const state = usePhState();
  const [ref, w] = useWidth();
  const narrow = w > 0 && w < 520;
  const dq = state.dqIssues.filter((d) => d.episodeId === b.episode.id);
  return (
    <Card pad="sm">
      <SecTitle right={<DemoTag>Sample data</DemoTag>}>Laboratory results</SecTitle>
      <div ref={ref}>{showValues ? (
        <div className="phr-tblwrap">
          <table className={"phr-tbl" + (narrow ? " phr-tbl-tight" : "")}>
            <thead>
              <tr><th>Test</th><th className="num">Result</th><th>Limit</th><th>Flag</th>{narrow ? null : <th>Source</th>}</tr>
            </thead>
            <tbody>
              {b.tests.map((t) => {
                const o = t.observation;
                const chain = o ? observationChain(state, b.episode.id, t.code) : [];
                const prev = chain.length > 1 ? chain[chain.length - 2] : null;
                const legacy = o && o.legacyDisplayedFlag === "normal" && o.flag === "review_required";
                const issue = legacy ? dq.find((d) => d.kind === "flag_inconsistency") : undefined;
                return (
                  <tr key={t.code} className={o && o.flag === "review_required" ? "phr-flagged" : undefined}>
                    <td style={{ minWidth: narrow ? 92 : 104 }}>
                      <div style={{ color: "var(--ink)" }}>{t.name}</div>
                      <div className="phr-mono ph-faint">{t.code}{t.addOn ? ", add-on" : ""}</div>
                      {prev ? <div className="phr-sub">Previous v{prev.version}: {fmtValue(prev.code, prev.value, prev.unit)} {prev.unit} as received</div> : null}
                      {o && o.unitDiscrepancy && !o.unitDiscrepancy.confirmed ? <div className="phr-sub" style={{ color: "var(--warn)" }}>Unit {o.unit} differs from the template unit {o.unitDiscrepancy.expectedUnit}. Not converted.</div> : null}
                      {legacy ? <div className="phr-sub" style={{ color: "var(--warn)" }}>Legacy summary displayed this as normal. Inconsistent with the displayed limit{issue ? ` (${issue.id})` : ""}.</div> : null}
                      {narrow ? <div className="phr-sub">Source: {sourceCell(state, t)}</div> : null}
                    </td>
                    <td className="num">
                      {o ? <><b style={{ color: "var(--ink)", fontWeight: 600 }}>{fmtValue(o.code, o.value, o.unit)}</b> <span className="ph-faint">{o.unit}</span>{o.version > 1 ? <div className="phr-sub">v{o.version}</div> : null}</>
                        : <span className="ph-faint" style={{ whiteSpace: "normal" }}>{t.status === "pending" ? "Not yet received" : "Not accounted for"}</span>}
                    </td>
                    <td className="ph-faint" style={{ whiteSpace: "nowrap" }}>{ANALYTES[t.code].limit.text}</td>
                    <td>{o ? <FlagPill flag={o.flag} /> : <TestStatusPill status={t.status} />}</td>
                    {narrow ? null : <td style={{ whiteSpace: "nowrap" }}>{sourceCell(state, t)}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Banner tone="neutral" icon="lock">Values are hidden for this role. {b.tests.filter((t) => t.status === "received").length} of {b.tests.length} expected results are received.</Banner>
      )}</div>
      <div className="phr-sub" style={{ marginTop: 8 }}>{LIMITS_DISCLAIMER} Units are shown as received. Missing tests stay missing.</div>
    </Card>
  );
}

/* ---- measurements and calculations ---- */
function measureText(m: Measure, key: MeasureKey): string {
  const r = MEASURE_RULES[key];
  if (m.state === "recorded" && m.value != null) return `${m.value.toFixed(r.decimals)} ${r.unit}`;
  return m.state === "not_done" ? "Not done" : m.state === "declined" ? "Declined" : "Missing";
}

export function MeasuresCard({ b, showValues }: { b: Bundle; showValues: boolean }) {
  const c = b.episode.capture;
  const m = c.measures;
  const bp = bpFlagged(c);
  return (
    <Card pad="sm">
      <SecTitle right={<DemoTag>Sample data</DemoTag>}>Measurements and calculations</SecTitle>
      {showValues ? (
        <Kv tight items={[
          { k: "Height" + (m.heightM.provenance === "self_reported" ? " (self-reported)" : ""), v: measureText(m.heightM, "heightM") },
          { k: "Weight", v: measureText(m.weightKg, "weightKg") },
          { k: "BMI (calculated locally)", v: b.bmi != null ? `${b.bmi.toFixed(1)} kg/m²` : "Not calculated: height or weight missing" },
          { k: "Waist", v: measureText(m.waistCm, "waistCm") },
          { k: "Blood pressure", v: <>{m.bpSys.state === "recorded" && m.bpDia.state === "recorded" ? `${m.bpSys.value}/${m.bpDia.value} mmHg` : `${measureText(m.bpSys, "bpSys")}`}{bp ? <div style={{ marginTop: 3 }}><Pill tone="warn" icon="flag">Review required, limit {BP_REVIEW_LIMIT.text}</Pill></div> : null}</> },
          { k: "Pulse", v: measureText(m.pulse, "pulse") },
          { k: "Urine (protein, glucose, blood)", v: c.urine ? `${c.urine.protein}, ${c.urine.glucose}, ${c.urine.blood}` : "Not recorded" },
          { k: "Identity at appointment", v: c.identity.every((x) => x.confirmed) ? "Two identifiers confirmed" : "Not confirmed" },
          { k: "Capture", v: c.status === "complete" ? `Complete ${c.completedAt ? fmtShortDateTime(c.completedAt) : ""}` : c.status === "draft" ? "Draft" : "Not started" },
        ]} />
      ) : (
        <Banner tone="neutral" icon="lock">Measurements are hidden for this role.</Banner>
      )}
      <div className="phr-banner" style={{ marginTop: 10, alignItems: "flex-start" }}>
        <div className="ph-grow">
          <div className="phr-row" style={{ gap: 6 }}><b>{QRISK3.title}</b><Pill tone="neutral" icon="lock">Approved integration required</Pill></div>
          <div className="phr-note" style={{ marginTop: 4 }}>{QRISK3.text} Integration is gated on licensing, validated inputs and approval for the intended population. No score has been generated.</div>
          <div className="phr-sub" style={{ marginTop: 4 }}>Inputs the integration would need: {QRISK3.inputsNeeded.join("; ")}.</div>
        </div>
      </div>
    </Card>
  );
}

/* ---- questionnaire answers ---- */
const ANSWERS: Array<{ key: string; label: string; unit?: string }> = [
  { key: "smoking", label: "Smoking" }, { key: "alcohol", label: "Alcohol", unit: "units/week" }, { key: "activity", label: "Activity", unit: "days/week" },
  { key: "sleep", label: "Sleep", unit: "hours/night" }, { key: "famCvd", label: "Family history, heart disease" }, { key: "chestPain", label: "Chest pain on exertion" },
  { key: "knownDiabetes", label: "Diagnosed diabetes" }, { key: "famCancer", label: "Family history, cancer" }, { key: "medication", label: "Medication" }, { key: "allergies", label: "Allergies" },
];
export function AnswersCard({ b }: { b: Bundle }) {
  const state = usePhState();
  const mem = (ix(state).membershipsByPerson.get(b.person.id) || [])[0];
  const a = mem ? mem.answers : {};
  const fmt = (v: string | number | boolean | undefined, unit?: string) => (v === undefined || v === "" ? "Not answered" : typeof v === "boolean" ? (v ? "Yes" : "No") : unit ? `${v} ${unit}` : String(v));
  return (
    <Card pad="sm">
      <SecTitle right={<span className="phr-sub">Self-reported</span>}>Questionnaire answers</SecTitle>
      <Kv tight items={ANSWERS.map((x) => ({ k: x.label, v: fmt(a[x.key], x.unit) }))} />
    </Card>
  );
}

/* ---- versions, follow-ups and audit ---- */
export function EpisodeHistory({ b }: { b: Bundle }) {
  const state = usePhState();
  const events = eventsFor(state, episodeEventIds(state, b.episode), 6);
  return (
    <Card pad="sm">
      <SecTitle>History</SecTitle>
      <div className="phr-gap">
        <div className="phr-row" style={{ gap: 6 }}>
          <span className="phr-sub">Report versions:</span>
          {b.versions.length ? b.versions.map((v) => (
            <Pill key={v.id} tone={v.status === "released" ? "ok" : v.status === "superseded" ? "neutral" : "info"} icon={v.status === "released" ? "check" : v.status === "superseded" ? "layers" : "edit"}>
              v{v.version} {v.status === "in_review" || v.status === "draft" ? "draft" : v.status}
            </Pill>
          )) : <span className="phr-sub">None yet</span>}
        </div>
        {b.followUps.length ? (
          <div className="phr-row" style={{ gap: 6 }}>
            <span className="phr-sub">Follow-up:</span>
            {b.followUps.map((f) => <span key={f.id} className="phr-row" style={{ gap: 4 }}><EntityLink kind="followup" id={f.id} /><span className="phr-sub">{f.status === "open" ? `open, due ${fmtWhen(f.dueAt, state.clock.nowUtc)}` : "closed"}</span></span>)}
          </div>
        ) : null}
        <EventList events={events} empty="No events for this episode yet." />
      </div>
    </Card>
  );
}
