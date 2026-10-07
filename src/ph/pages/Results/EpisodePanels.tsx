/* The episode's clinical picture, used by Review and Corrections: identifiers, status
   banners, laboratory values with source and previous version, risk factors and lifestyle
   answers, the nurse form as recorded, and the history. */
import type { ReactNode } from "react";
import {
  ANALYTES, HOLD_CATEGORY, HOLD_LABEL, LIMITS_DISCLAIMER, episodeBundle, fmtAge,
  fmtDateTime, fmtNumericDate, fmtShortDateTime, fmtWhen, hoursBetween, lifestyleAnswersForReport, nurseFormRows, riskFactorSummary, staffName,
} from "../../model";
import type { ExpectedTestView, PhState } from "../../model";
import { usePhState } from "../../store";
import { useNav } from "../../nav-context";
import { Button, Card, DemoTag, EntityLink, Pill } from "../../ui";
import {
  Banner, EventList, FlagPill, HoldCategoryPill, Kv, ReportStatePill, SecTitle, TestStatusPill, fmtValue, useWidth,
} from "./shared";
import { episodeEventIds, eventsFor, observationChain, openUnitIssues, rowIndex } from "./select";

export type Bundle = NonNullable<ReturnType<typeof episodeBundle>>;

/* ---- identifiers ---- */
export function EpisodeHeader({ b, right, compact }: { b: Bundle; right?: ReactNode; compact?: boolean }) {
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
            <span className="phr-mono" style={{ color: "var(--ink)" }} title="Precision Health unique ID">{b.episode.screeningRef}</span>
          </div>
          <div className="phr-sub" style={{ marginTop: 3 }}>{b.programme.name}. Fictional participant. {summary}</div>
        </div>
        {right ? <div className="phr-row" style={{ flex: "none" }}>{right}</div> : null}
      </div>
      {compact ? (
        <div className="phr-idline">
          <span><i>DOB</i> {fmtNumericDate(b.person.dob)}</span>
          <span><i>Episode</i> <span className="phr-mono">{b.episode.id}</span></span>
          <span><i>Specimen</i> <span className="phr-mono">{b.episode.specimenIds.join(", ")}</span></span>
          <span><i>Collected</i> {fmtShortDateTime(b.episode.collectedAt)}, <EntityLink kind="session" id={b.session.id}>{b.session.siteName}</EntityLink></span>
          <span><i>Ready</i> {ready ? `${fmtWhen(ready, state.clock.nowUtc)} (${fmtAge(hoursBetween(ready, state.clock.nowUtc))})` : "Not yet"}</span>
          <span><i>Reviewer</i> {staffName(state, b.episode.reviewAssigneeId)}</span>
          <span><i>Person</i> <EntityLink kind="person" id={b.person.id} /></span>
          <span><i>Booking</i> <EntityLink kind="booking" id={b.booking.id} /></span>
        </div>
      ) : (
      <div style={{ marginTop: 8 }}>
        <Kv tight items={[
          { k: "Unique ID", v: <span className="phr-mono">{b.episode.screeningRef}</span> },
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
      )}
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

export function ResultsTable({ b, showValues, collapsed }: { b: Bundle; showValues: boolean; collapsed?: boolean }) {
  const state = usePhState();
  const [ref, w] = useWidth();
  const narrow = w > 0 && w < 520;
  const dq = state.dqIssues.filter((d) => d.episodeId === b.episode.id);
  const body = (
    <>
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
                    <td>{o ? <FlagPill flag={o.flag} short={narrow} /> : <TestStatusPill status={t.status} />}</td>
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
    </>
  );
  if (collapsed) {
    return (
      <Card pad="sm">
        <details className="phr-details">
          <summary><span className="phr-sec-title" style={{ margin: 0 }}>Laboratory provenance</span> <span className="phr-sub">{b.tests.length} tests: source line, limit and earlier versions</span></summary>
          <div style={{ marginTop: 8 }}>{body}</div>
        </details>
      </Card>
    );
  }
  return (
    <Card pad="sm">
      <SecTitle right={<DemoTag>Sample data</DemoTag>}>Laboratory results</SecTitle>
      {body}
    </Card>
  );
}

/* ---- risk factors and lifestyle answers ---- */
const tfText = (v: boolean | null) => (v === true ? "TRUE" : v === false ? "FALSE" : "Not recorded");

/** Risk factors as the clinician viewer reads them (nurse form first), and the lifestyle questionnaire as the report prints it. */
export function AnswersCard({ b }: { b: Bundle }) {
  const state = usePhState();
  const rf = riskFactorSummary(state, b.episode.id);
  const life = lifestyleAnswersForReport(state, b.person.id, b.programme.id);
  if (!rf) return null;
  const src = rf.source === "nurse_form" ? "Nurse form, prefilled from the questionnaire" : rf.source === "questionnaire" ? "Questionnaire only, nurse form not yet recorded" : "Not recorded";
  return (
    <Card pad="sm">
      <SecTitle right={<span className="phr-sub">{src}</span>}>Risk factors</SecTitle>
      <Kv tight items={[
        { k: "Smoker", v: rf.smoker || "Not recorded" },
        { k: "Family history of CVD", v: tfText(rf.familyHistoryCvd) },
        { k: "Diabetes", v: rf.diabetes || "Not recorded" },
        { k: "Hypertension treatment", v: tfText(rf.hypertensionTreatment) },
        { k: "History of high BP", v: rf.highBpHistory || "Not recorded" },
        { k: "Alcohol", v: rf.alcoholUnitsPerWeek != null ? `${rf.alcoholUnitsPerWeek} units/week` : "Not answered" },
        { k: "Medications", v: rf.medications || "Not recorded" },
        { k: "Muscular physique", v: rf.muscularPhysique === null ? "Not recorded" : rf.muscularPhysique ? "Yes" : "No" },
      ]} />
      <div style={{ marginTop: 12 }}>
        <SecTitle right={<span className="phr-sub">Self-reported, as printed in the report</span>}>Lifestyle questionnaire</SecTitle>
        {life.length ? (
          <table className="phr-tbl phr-tbl-qa">
            <tbody>
              {life.map((r) => (
                <tr key={r.key}><td>{r.question}</td><td style={{ color: r.answered ? "var(--ink)" : "var(--faint)" }}>{r.answer}</td></tr>
              ))}
            </tbody>
          </table>
        ) : <div className="phr-sub">No questionnaire answers on record.</div>}
      </div>
    </Card>
  );
}

/** The nurse form exactly as recorded, section by section, collapsed by default. */
export function NurseFormCard({ b }: { b: Bundle }) {
  const state = usePhState();
  const rows = nurseFormRows(state, b.episode.id);
  if (!rows) return null;
  const sections = Array.from(new Set(rows.map((r) => r.sectionTitle)));
  const answered = rows.filter((r) => r.answered).length;
  return (
    <Card pad="sm">
      <details className="phr-details">
        <summary><span className="phr-sec-title" style={{ margin: 0 }}>Nurse form</span> <span className="phr-sub">{state.forms.templates.find((t) => t.id === b.episode.formSnapshot.templateId)?.name || "Comprehensive (LAB) screen"}, {answered} of {rows.length} fields recorded</span></summary>
        <div className="phr-gap" style={{ marginTop: 8 }}>
          {sections.map((title) => (
            <div key={title}>
              <div className="phr-sub" style={{ fontWeight: 600, color: "var(--dim)", margin: "4px 0 2px" }}>{title}</div>
              <Kv tight items={rows.filter((r) => r.sectionTitle === title).map((r) => ({
                k: r.label,
                v: <span style={{ color: r.answered ? undefined : "var(--faint)" }}>{r.value}</span>,
                wide: r.value.length > 40,
              }))} />
            </div>
          ))}
        </div>
      </details>
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
