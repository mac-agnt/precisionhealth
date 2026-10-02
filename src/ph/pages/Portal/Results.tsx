/* My Results. Before a clinician releases a report the participant sees an awaiting-review
   state with no values and no draft advice. After release the frozen version shows the
   clinician, date, version, values with units, approved sample advice, only applicable
   sections, tests not included, version history with superseded marking, and a print
   preview. Opening it records report access, separately from message delivery. */
import { useState } from "react";
import { ANALYTES, BP_REVIEW_LIMIT, LIMITS_DISCLAIMER, act, bmiOf, fmtDate, fmtDateLong, fmtDateTime, fmtNumericDate, ix } from "../../model";
import type { AnalyteCode, Episode, Id, Measure, Observation, PhState, ReportVersion } from "../../model";
import { dispatch, usePhState } from "../../store";
import { Button, Card, DemoTag, EmptyState, Icon, Pill } from "../../ui";
import type { PortalData } from "./data";
import { participantVersions } from "./data";

type Marker = "above" | "below" | "within" | "not_included";
interface TestRow { code: AnalyteCode; name: string; value: string | null; unit: string; range: string; marker: Marker; note: string | null; addOn: boolean }
interface MeasureRow { label: string; value: string; note: string | null; flagged: boolean }
interface ReportModel {
  clinician: string;
  releasedAt: string;
  advice: string;
  adviceSource: string;
  measures: MeasureRow[];
  tests: TestRow[];
  lifestyle: Array<{ label: string; value: string }>;
  anyFlag: boolean;
}

const STATE_TEXT: Record<Measure["state"], string> = { recorded: "", missing: "Not recorded", not_done: "Not done", declined: "Declined" };
const ADVICE_SOURCE: Record<ReportVersion["adviceSource"], string> = {
  sample_template: "Prewritten sample advice, approved by your clinician",
  manual: "Approved by your clinician",
  ai_draft_approved: "Drafted from approved wording, then edited and approved by your clinician",
};

function measureValue(m: Measure, unit: string, decimals: number): string {
  return m.state === "recorded" && m.value != null ? `${m.value.toFixed(decimals)} ${unit}` : STATE_TEXT[m.state];
}

/** Everything shown in a released report version, frozen at release through observationRefs. */
function reportModel(state: PhState, d: PortalData, ep: Episode, v: ReportVersion): ReportModel {
  const I = ix(state);
  const staff = state.staff.find((s) => s.id === v.releasedBy);
  const cap = ep.capture.measures;
  const bmi = bmiOf(ep.capture);
  const bpRecorded = cap.bpSys.state === "recorded" && cap.bpDia.state === "recorded";
  const bpFlag = bpRecorded && ((cap.bpSys.value ?? 0) >= BP_REVIEW_LIMIT.sys || (cap.bpDia.value ?? 0) >= BP_REVIEW_LIMIT.dia);
  const measures: MeasureRow[] = [
    { label: "Height", value: measureValue(cap.heightM, "m", 2), note: cap.heightM.provenance === "self_reported" && cap.heightM.state === "recorded" ? "Self-reported" : null, flagged: false },
    { label: "Weight", value: measureValue(cap.weightKg, "kg", 1), note: null, flagged: false },
    { label: "BMI", value: bmi != null ? `${bmi.toFixed(1)} kg/m²` : "Not calculated", note: bmi != null ? "Calculated from height and weight" : "Height or weight was not recorded", flagged: false },
    { label: "Waist", value: measureValue(cap.waistCm, "cm", 0), note: null, flagged: false },
    { label: "Blood pressure", value: bpRecorded ? `${cap.bpSys.value}/${cap.bpDia.value} mmHg` : STATE_TEXT[cap.bpSys.state === "recorded" ? cap.bpDia.state : cap.bpSys.state], note: bpRecorded ? `Displayed range ${BP_REVIEW_LIMIT.text}` : null, flagged: bpFlag },
    { label: "Pulse", value: measureValue(cap.pulse, "bpm", 0), note: null, flagged: false },
  ];
  const released = new Map<AnalyteCode, Observation>();
  for (const ref of v.observationRefs) {
    const o = state.observations.find((x) => x.id === ref.id);
    if (o) released.set(o.code, o);
  }
  const codes: AnalyteCode[] = Array.from(new Set<AnalyteCode>([...ep.expectedTests.map((t) => t.code), ...released.keys()]));
  const tests: TestRow[] = codes.map((code) => {
    const a = ANALYTES[code];
    const o = released.get(code);
    const addOn = !!ep.expectedTests.find((t) => t.code === code)?.addOn;
    if (!o) return { code, name: a.name, value: null, unit: a.unit, range: a.limit.text, marker: "not_included", note: "Not available when this version was released. It is not counted as normal.", addOn };
    const marker: Marker = o.flag === "review_required" ? (a.limit.kind === "max" ? "above" : "below") : "within";
    const note = o.original && o.unitDiscrepancy?.confirmed ? `Converted from ${o.original.value} ${o.original.unit} as received, after laboratory confirmation` : null;
    return { code, name: a.name, value: o.value.toFixed(a.decimals), unit: o.unit, range: o.limitText, marker, note, addOn };
  });
  const ans = (d.membership?.answers || {}) as Record<string, string | number | boolean>;
  const lifestyle: Array<{ label: string; value: string }> = [];
  if (ans.smoking !== undefined && ans.smoking !== "") lifestyle.push({ label: "Smoking", value: String(ans.smoking) });
  if (ans.alcohol !== undefined && ans.alcohol !== "") lifestyle.push({ label: "Alcohol", value: `${ans.alcohol} units a week` });
  if (ans.activity !== undefined && ans.activity !== "") lifestyle.push({ label: "Active days", value: `${ans.activity} a week` });
  if (ans.sleep !== undefined && ans.sleep !== "") lifestyle.push({ label: "Sleep", value: `${ans.sleep} hours a night` });
  void I;
  return {
    clinician: staff ? `${staff.name}, ${staff.title}` : "Precision Health clinician",
    releasedAt: v.releasedAt || v.createdAt,
    advice: v.advice,
    adviceSource: ADVICE_SOURCE[v.adviceSource],
    measures, tests, lifestyle,
    anyFlag: bpFlag || tests.some((t) => t.marker === "above" || t.marker === "below"),
  };
}

function MarkerText({ m }: { m: Marker }) {
  if (m === "within") return <span className="pp-marker" style={{ color: "var(--ok)" }}><Icon name="check" size={12} stroke={2.2} />Within the displayed range</span>;
  if (m === "not_included") return <span className="pp-marker" style={{ color: "var(--dim)" }}><Icon name="clock" size={12} />Not included</span>;
  return <span className="pp-marker" style={{ color: "var(--warn)" }}><Icon name="alert" size={12} stroke={2} />{m === "above" ? "Above" : "Below"} the displayed range. Reviewed by your clinician</span>;
}

export function ResultsView({ d }: { d: PortalData }) {
  const state = usePhState();
  const [open, setOpen] = useState<{ episodeId: Id; versionId: Id } | null>(null);
  const [print, setPrint] = useState(false);
  const I = ix(state);

  if (open) {
    const ep = d.episodes.find((e) => e.id === open.episodeId);
    const versions = ep ? participantVersions(state, ep.id) : [];
    const v = versions.find((x) => x.id === open.versionId);
    if (ep && v) {
      return <ReportView d={d} ep={ep} v={v} versions={versions} print={print} setPrint={setPrint} onBack={() => { setOpen(null); setPrint(false); }} onVersion={(id) => { setOpen({ episodeId: ep.id, versionId: id }); setPrint(false); }} />;
    }
  }

  return (
    <div className="pp-main">
      <div>
        <h1 className="pp-title">My Results</h1>
        <p className="pp-lead">Reports appear here only after a Precision Health clinician has reviewed and released them.</p>
      </div>
      {!d.episodes.length ? (
        <Card>
          <EmptyState title="No results yet" icon="file">
            {d.active ? `Your results appear here after your appointment on ${fmtDate(I.sessionById.get(d.active.sessionId)!.date)} and a clinician's review.` : "Your results appear here after your screening appointment and a clinician's review."}
          </EmptyState>
        </Card>
      ) : d.episodes.map((ep) => {
        const versions = participantVersions(state, ep.id);
        const current = versions.filter((v) => v.status === "released").pop();
        return current
          ? <ReportCard key={ep.id} d={d} ep={ep} v={current} versions={versions} onOpen={() => { dispatch(act.viewReportInPortal(ep.id), { silent: true }); setOpen({ episodeId: ep.id, versionId: current.id }); }} />
          : <AwaitingCard key={ep.id} ep={ep} />;
      })}
    </div>
  );
}

function AwaitingCard({ ep }: { ep: Episode }) {
  const state = usePhState();
  const s = ix(state).sessionById.get(ep.sessionId)!;
  const labDone = ep.reportState === "ready_for_review";
  const steps = [
    { title: "Appointment attended", text: fmtDateLong(s.date), done: true, current: false },
    { title: "Laboratory results", text: labDone ? "Received" : "In progress", done: labDone, current: !labDone },
    { title: "Clinician review", text: labDone ? "In progress" : "Waiting for results", done: false, current: labDone },
    { title: "Report released to you", text: "You will get a message", done: false, current: false },
  ];
  return (
    <Card>
      <div className="pp-row" style={{ marginBottom: 10 }}><Pill tone="info" icon="clock">Not ready yet</Pill><span className="pp-small">{ix(state).programmeById.get(ep.programmeId)?.name}</span></div>
      <h2 className="pp-h3" style={{ fontSize: 16 }}>Your report is not ready yet</h2>
      <p className="pp-small" style={{ marginTop: 0 }}>A Precision Health clinician reviews every report individually before it is released to you. We will send you a message when it is ready. Results will not appear before review, and no draft advice is shown here.</p>
      <ol className="pp-steps" style={{ marginTop: 12 }}>
        {steps.map((st, i) => (
          <li key={st.title} className={"pp-step" + (st.done ? " done" : st.current ? " current" : "")}>
            <span className="pp-step-dot">{st.done ? <Icon name="check" size={13} stroke={2.2} /> : i + 1}</span>
            <span><span className="pp-step-title">{st.title}</span><span className="pp-small" style={{ display: "block" }}>{st.text}</span></span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function ReportCard({ d, ep, v, versions, onOpen }: { d: PortalData; ep: Episode; v: ReportVersion; versions: ReportVersion[]; onOpen: () => void }) {
  const state = usePhState();
  const s = ix(state).sessionById.get(ep.sessionId)!;
  const staff = state.staff.find((x) => x.id === v.releasedBy);
  const notice = state.messages.filter((m) => m.kind === "report_available" && m.logicalId === "LM-A-" + v.id)[0];
  return (
    <Card>
      <div className="pp-row" style={{ marginBottom: 10, flexWrap: "wrap" }}>
        <Pill tone="ok" icon="check">Report ready</Pill>
        {versions.length > 1 ? <Pill tone="info" icon="refresh">Updated: version {v.version}</Pill> : null}
        <DemoTag>Fictional sample</DemoTag>
      </div>
      <h2 className="pp-h3" style={{ fontSize: 16 }}>Screening report, version {v.version}</h2>
      <p className="pp-small" style={{ marginTop: 0 }}>{d.programme.name}, appointment {fmtDate(s.date)}. Released {fmtDateTime(v.releasedAt || v.createdAt)} by {staff ? `${staff.name}, ${staff.title}` : "a Precision Health clinician"}.</p>
      <ul className="pp-small" style={{ margin: "0 0 12px", paddingLeft: 18 }}>
        <li>{notice ? `We told you by ${notice.channel === "sms" ? "SMS" : "email"} on ${fmtDateTime(notice.at)} (simulated). The message did not include any results.` : "Release notice recorded."}</li>
        <li>{v.accessedAt ? `You opened this report on ${fmtDateTime(v.accessedAt)}.` : "You have not opened this report yet."}</li>
      </ul>
      <Button variant="primary" icon="eye" onClick={onOpen}>Open report</Button>
    </Card>
  );
}

function ReportView({ d, ep, v, versions, print, setPrint, onBack, onVersion }: { d: PortalData; ep: Episode; v: ReportVersion; versions: ReportVersion[]; print: boolean; setPrint: (b: boolean) => void; onBack: () => void; onVersion: (id: Id) => void }) {
  const state = usePhState();
  const s = ix(state).sessionById.get(ep.sessionId)!;
  const r = reportModel(state, d, ep, v);
  const current = versions.filter((x) => x.status === "released").pop();
  const superseded = v.status === "superseded";
  const nextVersion = superseded ? versions.find((x) => x.id === v.supersededBy) : undefined;
  return (
    <div className="pp-main">
      <div className="pp-wrap">
        <Button variant="ghost" icon="chevronLeft" onClick={onBack}>My Results</Button>
        <span className="ph-grow" />
        <Button icon="print" onClick={() => setPrint(!print)}>{print ? "Close print preview" : "Print or save as PDF"}</Button>
      </div>
      {superseded ? (
        <div className="pp-callout warn" role="note">
          <Icon name="alert" size={14} style={{ marginTop: 2, color: "var(--warn)" }} />
          <span>
            <strong style={{ color: "var(--ink)" }}>Superseded.</strong> Version {v.version} was replaced by version {nextVersion?.version ?? "a newer version"}{nextVersion?.releasedAt ? ` on ${fmtDate(nextVersion.releasedAt)}` : ""}. It is kept here for your records.{" "}
            {current ? <button type="button" className="ph-link" onClick={() => onVersion(current.id)}>View the current version</button> : null}
          </span>
        </div>
      ) : null}
      {print ? (
        <>
          <div className="pp-banner"><Icon name="print" size={14} style={{ marginTop: 2 }} /><span>Print preview. Print, or choose Save as PDF in the print dialogue. The printout keeps the fictional-sample label.</span></div>
          <div className="ph-printable pp-paper">
            <PaperReport d={d} ep={ep} v={v} r={r} sessionDate={s.date} />
          </div>
          <div className="pp-wrap"><Button variant="primary" icon="print" onClick={() => window.print()}>Print</Button><Button onClick={() => setPrint(false)}>Close preview</Button></div>
        </>
      ) : (
        <div className="pp-grid pp-grid-main">
          <div className="pp-grid">
            <div className="pp-banner"><Icon name="info" size={14} style={{ marginTop: 2, color: "var(--accent)" }} /><span>Fictional sample report for a demonstration. The values are synthetic and this is not medical advice. Ranges are illustrative display limits, interpreted by a clinician.</span></div>
            <Card>
              <div className="pp-row" style={{ flexWrap: "wrap", gap: 8, marginBottom: 4 }}>
                <span className="ph-eyebrow ph-grow">Reviewed by your clinician</span>
                {superseded ? <Pill tone="neutral" icon="layers">Superseded version</Pill> : <Pill tone="ok" icon="check">Current version</Pill>}
              </div>
              <h2 className="pp-title" style={{ fontSize: 17 }}>{superseded ? "An earlier version of your report" : "Your results are ready"}</h2>
              <p className="pp-small" style={{ margin: "4px 0 0" }}>{r.clinician}. Released {fmtDateTime(r.releasedAt)}. Report version {v.version}.</p>
              <p className="pp-small" style={{ margin: "4px 0 0" }}>{d.person.given} {d.person.family}, date of birth {fmtNumericDate(d.person.dob)}. {d.programme.name}, appointment {fmtDate(s.date)}. Reference {ep.id}.</p>
            </Card>
            <Card>
              <div className="pp-row" style={{ flexWrap: "wrap", marginBottom: 8 }}><h3 className="pp-h3" style={{ margin: 0 }}>Your clinician's advice</h3><DemoTag>Sample content</DemoTag></div>
              <div className="pp-advice">{r.advice || "No advice text was recorded."}</div>
              <p className="pp-small" style={{ margin: "8px 0 0" }}>{r.adviceSource}. Sample wording prepared for the demonstration, not live medical advice.</p>
            </Card>
            <Card>
              <h3 className="pp-h3">Your measurements</h3>
              <table className="pp-results">
                <thead><tr><th>Measure</th><th>Result</th><th>Note</th></tr></thead>
                <tbody>
                  {r.measures.map((m) => (
                    <tr key={m.label}>
                      <td>{m.label}</td>
                      <td className="val">{m.value}</td>
                      <td className="span">{m.flagged ? <MarkerText m="above" /> : <span className="pp-small">{m.note || ""}</span>}{m.flagged && m.note ? <span className="pp-small" style={{ display: "block" }}>{m.note}</span> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
            <Card>
              <h3 className="pp-h3">Blood tests</h3>
              <p className="pp-small" style={{ marginTop: 0 }}>Only the tests that apply to you are shown. A test that was not available is listed as not included, never as normal.</p>
              <table className="pp-results">
                <thead><tr><th>Test</th><th>Result</th><th>Displayed range</th><th>Note</th></tr></thead>
                <tbody>
                  {r.tests.map((t) => (
                    <tr key={t.code}>
                      <td>{t.name}{t.addOn ? <span className="pp-small"> (add-on)</span> : null}</td>
                      <td className="val">{t.value != null ? `${t.value} ${t.unit}` : "Not included"}</td>
                      <td className="pp-small"><span className="pp-phone-only">Displayed range </span>{t.range} {t.unit}</td>
                      <td className="span"><MarkerText m={t.marker} />{t.note ? <span className="pp-small" style={{ display: "block" }}>{t.note}</span> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
            {r.lifestyle.length ? (
              <Card>
                <h3 className="pp-h3">Your lifestyle answers</h3>
                <div className="pp-grid pp-grid-2" style={{ gap: 8 }}>
                  {r.lifestyle.map((l) => <div key={l.label} className="pp-small"><span style={{ display: "block" }}>{l.label}</span><span style={{ color: "var(--ink)", fontSize: 13.5 }}>{l.value}</span></div>)}
                </div>
              </Card>
            ) : null}
            <Card>
              <h3 className="pp-h3">About these results</h3>
              <p className="pp-small" style={{ marginTop: 0 }}>{LIMITS_DISCLAIMER} Results are compared with the displayed ranges only. Your clinician interprets them with your answers and measurements.</p>
              <h3 className="pp-h3" style={{ marginTop: 12 }}>Next steps</h3>
              <p className="pp-small" style={{ margin: 0 }}>
                {r.anyFlag ? "Your clinician has marked some results for discussion. Please arrange a routine appointment with your GP. Bring your report with you: print it or save a copy." : "No further action is needed from this screening. Keep this report for your records."}{" "}
                If you feel unwell, contact your GP. In an emergency, call 112 or 999.
              </p>
            </Card>
            <div className="pp-banner"><Icon name="info" size={14} style={{ marginTop: 2 }} /><span>A screening result is not a diagnosis. Results are one part of your health picture and should be discussed with your GP.</span></div>
          </div>
          <div className="pp-grid">
            <VersionHistory versions={versions} openId={v.id} onVersion={onVersion} />
            <Card>
              <h3 className="pp-h3">Questions about your report?</h3>
              <p className="pp-small" style={{ margin: 0 }}>Contact Precision Health for help understanding the screening process. This portal is not an urgent-care service.</p>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function VersionHistory({ versions, openId, onVersion }: { versions: ReportVersion[]; openId: Id; onVersion: (id: Id) => void }) {
  const state = usePhState();
  const list = versions.slice().reverse();
  return (
    <Card>
      <h3 className="pp-h3">Version history</h3>
      <p className="pp-small" style={{ marginTop: 0 }}>A released report is never overwritten. A correction creates a new version and the earlier one is kept, marked superseded.</p>
      {list.map((x) => {
        const staff = state.staff.find((s) => s.id === x.releasedBy);
        return (
          <div key={x.id} className="pp-msg">
            <span className="pp-msg-icon" style={x.status === "released" ? { background: "var(--ok-soft)", color: "var(--ok)" } : undefined}><Icon name={x.status === "released" ? "check" : "layers"} size={13} /></span>
            <span>
              <span className="pp-row" style={{ flexWrap: "wrap", gap: 6 }}>
                <span style={{ color: "var(--ink)", fontWeight: 600 }}>Version {x.version}</span>
                {x.status === "released" ? <Pill tone="ok" icon="check">Current</Pill> : <Pill tone="neutral" icon="layers">Superseded</Pill>}
              </span>
              <span className="pp-small" style={{ display: "block" }}>Released {x.releasedAt ? fmtDateTime(x.releasedAt) : ""}{staff ? ` by ${staff.name}` : ""}.</span>
              {x.correctionReason ? <span className="pp-small" style={{ display: "block" }}>What changed: {x.correctionReason}</span> : null}
              {x.participantNoticeAt ? <span className="pp-small" style={{ display: "block" }}>You were told about this update on {fmtDateTime(x.participantNoticeAt)} (simulated message, no results).</span> : null}
              {x.id !== openId ? <button type="button" className="ph-link" style={{ fontSize: 12, marginTop: 4 }} onClick={() => onVersion(x.id)}>View version {x.version}</button> : <span className="pp-small" style={{ display: "block", marginTop: 4 }}>Shown now.</span>}
            </span>
          </div>
        );
      })}
    </Card>
  );
}

function PaperReport({ d, ep, v, r, sessionDate }: { d: PortalData; ep: Episode; v: ReportVersion; r: ReportModel; sessionDate: string }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div>
          <div className="muted" style={{ fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase" }}>Precision Health</div>
          <h2>Screening report</h2>
          <div className="muted">Version {v.version}{v.status === "superseded" ? ", superseded" : ""}. Reference {ep.id}.</div>
        </div>
        <div style={{ border: "1px dashed #9aa8a5", borderRadius: 6, padding: "4px 8px", fontSize: 11 }} className="muted">Fictional sample. Not a medical document.</div>
      </div>
      <h3>Participant</h3>
      <table><tbody>
        <tr><th>Name</th><td>{d.person.given} {d.person.family}</td></tr>
        <tr><th>Date of birth</th><td>{fmtNumericDate(d.person.dob)}</td></tr>
        <tr><th>Programme</th><td>{d.programme.name}, appointment {fmtDate(sessionDate)}</td></tr>
        <tr><th>Released</th><td>{fmtDateTime(r.releasedAt)} by {r.clinician}</td></tr>
      </tbody></table>
      <h3>Clinician's advice (sample content)</h3>
      <div style={{ whiteSpace: "pre-line" }}>{r.advice}</div>
      <h3>Measurements</h3>
      <table><tbody>
        {r.measures.map((m) => <tr key={m.label}><th>{m.label}</th><td>{m.value}{m.flagged ? ", above the displayed range" : ""}{m.note ? <span className="muted"> ({m.note})</span> : null}</td></tr>)}
      </tbody></table>
      <h3>Blood tests</h3>
      <table>
        <thead><tr><th>Test</th><th>Result</th><th>Displayed range</th><th>Note</th></tr></thead>
        <tbody>
          {r.tests.map((t) => (
            <tr key={t.code}>
              <td>{t.name}</td>
              <td>{t.value != null ? `${t.value} ${t.unit}` : "Not included"}</td>
              <td>{t.range} {t.unit}</td>
              <td>{t.marker === "within" ? "Within the displayed range" : t.marker === "not_included" ? "Not available at release" : `${t.marker === "above" ? "Above" : "Below"} the displayed range, reviewed by your clinician`}{t.note ? `. ${t.note}` : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {r.lifestyle.length ? (<><h3>Lifestyle answers</h3><table><tbody>{r.lifestyle.map((l) => <tr key={l.label}><th>{l.label}</th><td>{l.value}</td></tr>)}</tbody></table></>) : null}
      <h3>About these results</h3>
      <p className="muted" style={{ margin: 0 }}>{LIMITS_DISCLAIMER}</p>
      <h3>Next steps</h3>
      <p style={{ margin: 0 }}>{r.anyFlag ? "Your clinician has marked some results for discussion. Please arrange a routine appointment with your GP and bring this report." : "No further action is needed from this screening. Keep this report for your records."} If you feel unwell, contact your GP. In an emergency, call 112 or 999.</p>
      <p style={{ marginTop: 12 }}>A screening result is not a diagnosis. Results are one part of your health picture and should be discussed with your GP.</p>
      <p className="muted" style={{ marginTop: 16, fontSize: 11 }}>Demo · synthetic data. Generated from the participant portal preview. Fictional values for demonstration only.</p>
    </div>
  );
}
