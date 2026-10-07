/* My results (S10). Before a doctor releases a report the participant sees an awaiting-review
   state with no values and no draft advice. After release the frozen version is rendered as the
   chart-led DigitalReport, the same view the clinician previewed, with version history,
   superseded marking and a print or save-as-PDF copy of the paper ScreeningReport alone. Opening
   the report records access, separately from the "report available" message, which never holds
   results. */
import { useState } from "react";
import { act, fmtDate, fmtDateLong, fmtDateTime, ix } from "../../model";
import type { Episode, Id, ReportVersion } from "../../model";
import { DigitalReport } from "../../report/DigitalReport";
import { ScreeningReport, useReportDocument } from "../../report/ScreeningReport";
import { dispatch, usePhState } from "../../store";
import { Button, Card, EmptyState, Icon, Pill } from "../../ui";
import type { PortalData, PortalView, ReportDelivery } from "./data";
import { DELIVERY_LABEL, SUPPORT_EMAIL, participantVersions } from "./data";
import { UrgentCareCard, usePrintOnly } from "./parts";

export function ResultsView({ d, compact, delivery, go }: { d: PortalData; compact: boolean; delivery: ReportDelivery; go: (v: PortalView) => void }) {
  const state = usePhState();
  const [open, setOpen] = useState<{ episodeId: Id; versionId: Id } | null>(null);
  const I = ix(state);

  if (open) {
    const ep = d.episodes.find((e) => e.id === open.episodeId);
    const versions = ep ? participantVersions(state, ep.id) : [];
    const v = versions.find((x) => x.id === open.versionId);
    if (ep && v) return <ReportView d={d} ep={ep} v={v} versions={versions} compact={compact} delivery={delivery} go={go} onBack={() => setOpen(null)} onVersion={(id) => setOpen({ episodeId: ep.id, versionId: id })} />;
  }

  return (
    <div className="pp-main">
      <div>
        <div className="pp-eyebrow">My results</div>
        <h1 className="pp-title">Your screening report</h1>
        <p className="pp-lead">A Precision Health doctor reviews every report before it appears here.</p>
      </div>
      {!d.episodes.length ? (
        <Card>
          <EmptyState title="No report yet" icon="file">
            {d.active ? `Your report appears here after your appointment on ${fmtDate(I.sessionById.get(d.active.sessionId)!.date)} and the doctor's review.` : "Your report appears here after your screening appointment and the doctor's review."}
          </EmptyState>
        </Card>
      ) : d.episodes.map((ep) => {
        const versions = participantVersions(state, ep.id);
        const current = versions.filter((v) => v.status === "released").pop();
        return current
          ? <ReadyCard key={ep.id} d={d} ep={ep} v={current} versions={versions} onOpen={() => { dispatch(act.viewReportInPortal(ep.id), { silent: true }); setOpen({ episodeId: ep.id, versionId: current.id }); }} />
          : <AwaitingCard key={ep.id} ep={ep} />;
      })}
      <DeliveryNote delivery={delivery} go={go} />
    </div>
  );
}

function AwaitingCard({ ep }: { ep: Episode }) {
  const state = usePhState();
  const s = ix(state).sessionById.get(ep.sessionId)!;
  const labDone = ep.reportState === "ready_for_review";
  const steps = [
    { title: "Appointment attended", text: fmtDateLong(s.date), done: true, current: false },
    { title: "Laboratory tests", text: labDone ? "Back from the laboratory" : "At the laboratory", done: labDone, current: !labDone },
    { title: "Doctor's review", text: labDone ? "In progress" : "Waiting for the laboratory", done: false, current: labDone },
    { title: "Report released to you", text: "We will send you a message", done: false, current: false },
  ];
  return (
    <Card>
      <div className="pp-wrap" style={{ marginBottom: 10 }}><Pill tone="info" icon="clock">Awaiting review</Pill><span className="pp-small">{ix(state).programmeById.get(ep.programmeId)?.name}</span></div>
      <h2 className="pp-h3" style={{ fontSize: 16 }}>Your report is not ready yet</h2>
      <p className="pp-small" style={{ marginTop: 0 }}>A Precision Health doctor reviews every report individually before you see it. Nothing is shown here until then: no values and no draft advice. We will message you when it is ready, and that message never contains results.</p>
      <ol className="pp-steps" style={{ marginTop: 12 }}>
        {steps.map((st, i) => (
          <li key={st.title} className={"pp-step" + (st.done ? " done" : st.current ? " current" : "")}>
            <span className="pp-step-dot">{st.done ? <Icon name="check" size={13} stroke={2.2} /> : i + 1}</span>
            <span><span className="pp-step-title">{st.title}</span><span className="pp-small" style={{ display: "block" }}>{st.done ? "Done. " : st.current ? "Now. " : ""}{st.text}</span></span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function ReadyCard({ d, ep, v, versions, onOpen }: { d: PortalData; ep: Episode; v: ReportVersion; versions: ReportVersion[]; onOpen: () => void }) {
  const state = usePhState();
  const s = ix(state).sessionById.get(ep.sessionId)!;
  const staff = state.staff.find((x) => x.id === v.releasedBy);
  const notice = state.messages.filter((m) => m.kind === "report_available" && m.personId === d.person.id && (m.logicalId === "LM-A-" + v.id || m.episodeId === ep.id)).sort((a, b) => (a.at < b.at ? 1 : -1))[0];
  return (
    <section className="pp-ready">
      <div className="pp-row" style={{ flexWrap: "wrap", gap: 8, alignItems: "flex-start" }}>
        <div className="ph-grow" style={{ minWidth: 0 }}>
          <div className="pp-eyebrow">Reviewed by your doctor</div>
          <h2 className="pp-next-title">Your results are ready</h2>
          <p className="pp-small" style={{ margin: 0 }}>{staff ? staff.displayName : "Precision Health doctor"} · Released {fmtDate(v.releasedAt || v.createdAt)} · Report v{v.version} · Appointment {fmtDate(s.date)}</p>
        </div>
        <div className="pp-wrap">
          <Pill tone="ok" icon="check">Final report</Pill>
          {versions.length > 1 ? <Pill tone="info" icon="refresh">Updated to v{v.version}</Pill> : null}
        </div>
      </div>
      <ul className="pp-msglist" style={{ margin: "12px 0" }}>
        <li><Icon name="mail" size={14} /><span>{notice ? `We told you by ${notice.channel === "sms" ? "text" : "email"} on ${fmtDateTime(notice.at)} that a report was available (simulated). That message held no results.` : "The report available notice holds no results."}</span></li>
        <li><Icon name="eye" size={14} /><span>{v.accessedAt ? `You opened this report on ${fmtDateTime(v.accessedAt)}.` : "You have not opened this report yet. Opening it is recorded separately from the message."}</span></li>
      </ul>
      <Button variant="primary" icon="eye" onClick={onOpen}>Open my report</Button>
    </section>
  );
}

function ReportView({ d, ep, v, versions, compact, delivery, go, onBack, onVersion }: { d: PortalData; ep: Episode; v: ReportVersion; versions: ReportVersion[]; compact: boolean; delivery: ReportDelivery; go: (v: PortalView) => void; onBack: () => void; onVersion: (id: Id) => void }) {
  const doc = useReportDocument(ep.id, v.id);
  const [print, printNode] = usePrintOnly();
  const current = versions.filter((x) => x.status === "released").pop();
  const superseded = v.status === "superseded";
  const nextVersion = superseded ? versions.find((x) => x.id === v.supersededBy) : undefined;
  return (
    <div className="pp-main">
      <div className="pp-wrap">
        <Button variant="ghost" icon="chevronLeft" onClick={onBack}>My results</Button>
        <span className="ph-grow" />
        {doc ? <Button icon="print" onClick={() => print(<ScreeningReport doc={doc} />)} title="Opens the print dialog with the paper report. Choose Save as PDF to keep a copy.">Download or print PDF</Button> : null}
      </div>
      {superseded ? (
        <div className="pp-callout warn" role="note">
          <Icon name="alert" size={14} style={{ marginTop: 2, color: "var(--warn)" }} />
          <span>
            <strong style={{ color: "var(--ink)" }}>Superseded.</strong> Version {v.version} was replaced by version {nextVersion?.version ?? "a newer one"}{nextVersion?.releasedAt ? ` on ${fmtDate(nextVersion.releasedAt)}` : ""}. It is kept here for your records.{" "}
            {current ? <button type="button" className="ph-link" onClick={() => onVersion(current.id)}>View the current version</button> : null}
          </span>
        </div>
      ) : null}
      <div className="pp-grid pp-grid-main">
        <div className="pp-grid">
          {doc ? (
            <div role="region" style={{ minWidth: 0 }} aria-label={`Screening report, version ${v.version}`}>
              <DigitalReport doc={doc} episodeId={ep.id} compact={compact} />
            </div>
          ) : (
            <Card><EmptyState title="This report cannot be shown here" icon="lock">Only your own released reports appear in the portal. Email {SUPPORT_EMAIL} if you think something is missing.</EmptyState></Card>
          )}
          <div className="pp-banner"><Icon name="info" size={14} style={{ marginTop: 2 }} /><span>A screening result is not a diagnosis. Results are one part of your health picture. Take your report to your GP to discuss it.</span></div>
        </div>
        <div className="pp-grid">
          <VersionHistory versions={versions} openId={v.id} onVersion={onVersion} />
          <DeliveryNote delivery={delivery} go={go} />
          <Card>
            <h3 className="pp-h3">Questions about your report?</h3>
            <p className="pp-small" style={{ margin: 0 }}>Email <a className="ph-link" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> for help understanding the screening process. For medical advice about your results, see your GP.</p>
          </Card>
          <UrgentCareCard />
        </div>
      </div>
      {printNode}
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
              <span className="pp-small" style={{ display: "block" }}>Released {x.releasedAt ? fmtDateTime(x.releasedAt) : ""}{staff ? ` by ${staff.displayName}` : ""}.</span>
              {x.correctionReason ? <span className="pp-small" style={{ display: "block" }}>What changed: {x.correctionReason}</span> : null}
              {x.participantNoticeAt ? <span className="pp-small" style={{ display: "block" }}>We told you about this update on {fmtDateTime(x.participantNoticeAt)} (simulated message, no results).</span> : null}
              {x.id !== openId ? <button type="button" className="ph-link" style={{ fontSize: 12, marginTop: 4 }} onClick={() => onVersion(x.id)}>View version {x.version}</button> : <span className="pp-small" style={{ display: "block", marginTop: 4 }}>Shown now.</span>}
            </span>
          </div>
        );
      })}
    </Card>
  );
}

export function DeliveryNote({ delivery, go }: { delivery: ReportDelivery; go: (v: PortalView) => void }) {
  return (
    <Card>
      <h3 className="pp-h3">How your report is delivered</h3>
      <p className="pp-small" style={{ marginTop: 0 }}>In Pulse your report is here in the portal, once a doctor releases it. Today's process, an encrypted PDF by email with an access code by text (Esendex), can stay available as an option.</p>
      <p className="pp-small" style={{ margin: 0 }}>Your choice: <strong style={{ color: "var(--ink)" }}>{DELIVERY_LABEL[delivery]}</strong> (simulated). <button type="button" className="ph-link" onClick={() => go("account")}>Change in Account</button></p>
    </Card>
  );
}
