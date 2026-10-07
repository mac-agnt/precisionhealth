/* Clinical workspace in the staff app (Clinics > Appointments detail): check-in, then the same
   nurse form as the nurse portal (NurseForm.tsx), section by section in the client's order, with
   the identity check first, autosave, specimens, labels and a completion checklist. Completing
   creates an episode awaiting results and never releases a report. Clinical reviewers see the
   same record read-only. */
import { useState } from "react";
import type { ReactNode } from "react";
import type { ClinicalCapture, Episode, NavTarget } from "../../model";
import { REPORT_STATE_LABEL, act, ageOn, expectedTests, fmtDateLong, fmtDateTime, fmtNumericDate, linkFor, staffName } from "../../model";
import { dispatch, getState, usePhState } from "../../store";
import { useNav } from "../../nav-context";
import { Button, Card, CardHeader, Checklist, DemoTag, EntityLink, Icon, Pill } from "../../ui";
import type { Tone } from "../../ui";
import type { ApptRow } from "./selectors";
import { bookingForm, captureRule, checkInRule, nextEpisodeNumber, pad4, placeLabel } from "./selectors";
import { ApptPill, ProgTag } from "./shared";
import { QuestionnaireReview, consentSummary } from "./Questionnaire";
import { LabelPreviewModal } from "./LabelPreview";
import { AutomationReceipt, NurseCapture, NurseFormReadOnly } from "./NurseForm";
import { requestNursePortalNurse } from "../NursePortal/data";

const SEX: Record<string, string> = { female: "Female", male: "Male", not_recorded: "Not recorded" };

export function Workspace({ row }: { row: ApptRow }) {
  if (row.status === "completed" && row.episode) return <CompletedView row={row} episode={row.episode} />;
  if (row.status === "cancelled") return <CancelledView row={row} />;
  if (!row.draft) return <PreVisit row={row} />;
  return <LiveCapture key={row.booking.id + ":" + (row.draft.checkedInAt || "")} row={row} draft={row.draft} />;
}

/** Opens the same appointment's clinic in the nurse portal, when the shell provides the portal. */
function NursePortalButton({ row }: { row: ApptRow }) {
  const nav = useNav();
  if (!nav.openNursePortal) return null;
  const open = nav.openNursePortal;
  return (
    <Button icon="heart" title="Open this clinic in the tablet nurse portal preview. The demo acts as the clinic nurse while it is open."
      onClick={() => { requestNursePortalNurse(row.session.nurseId); open(); }}>Open in nurse portal</Button>
  );
}

/* ---- shared header ---- */
function WsHeader({ row, episodeLabel, dobConfirmed, pills, actions, children }: {
  row: ApptRow; episodeLabel: ReactNode; dobConfirmed: boolean; pills?: ReactNode; actions?: ReactNode; children?: ReactNode;
}) {
  const state = usePhState();
  const { person, booking: b, session: s, programme } = row;
  const { template } = bookingForm(state, b);
  return (
    <Card>
      <div className="ph-row-flex" style={{ alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div className="ph-grow" style={{ minWidth: 240 }}>
          <div className="ph-wrap" style={{ gap: 8, marginBottom: 6 }}>
            <ProgTag code={programme.code} />
            <ApptPill status={row.status} rescheduled={!!b.replacedBy} />
            {pills}
          </div>
          <h1 className="ph-h1" style={{ fontSize: 20 }}>{person.given} {person.family}</h1>
          <div className="ph-dim" style={{ fontSize: 12.5, marginTop: 3 }}>{fmtDateLong(s.date)}, {b.slotStart} to {row.slotEnd}. {placeLabel(s)}, nurse {staffName(state, s.nurseId)}</div>
        </div>
        {actions ? <div className="ph-wrap" style={{ justifyContent: "flex-end" }}>{actions}</div> : null}
      </div>
      <dl className="clx-kv" style={{ margin: "14px 0 0", paddingTop: 12, borderTop: "1px solid var(--border)" }}>
        <div><dt>Participant ID</dt><dd className="ph-mono">{person.id}</dd></div>
        <div><dt>Booking</dt><dd className="ph-mono">{b.id}</dd></div>
        <div><dt>Episode</dt><dd>{episodeLabel}</dd></div>
        <div><dt>Programme</dt><dd>{programme.name}</dd></div>
        <div><dt>Date of birth</dt><dd>{dobConfirmed ? `${fmtNumericDate(person.dob)} (age ${ageOn(person.dob, s.date)})` : "Shown after the identity check"}</dd></div>
        <div><dt>Sex recorded</dt><dd>{SEX[person.sex] || person.sex}</dd></div>
        <div><dt>Nurse form</dt><dd>{template ? template.name : b.formTemplateId} v{b.formVersion}</dd></div>
        <div><dt>Consent</dt><dd>{b.consentVersion}, before booking</dd></div>
      </dl>
      {children ? <div className="ph-stack" style={{ gap: 10, marginTop: 12 }}>{children}</div> : null}
    </Card>
  );
}

/* ---- before check-in ---- */
function PreVisit({ row }: { row: ApptRow }) {
  const state = usePhState();
  const rule = checkInRule(state, row.session);
  const [msg, setMsg] = useState<string | null>(null);
  const checkIn = () => { const r = dispatch(act.checkIn(row.booking.id)); if (!r.ok) setMsg(r.message || "Not checked in."); };
  return (
    <>
      <WsHeader row={row} dobConfirmed={false} episodeLabel={<span className="ph-faint">Issued when the appointment is completed</span>}
        actions={<>
          <NursePortalButton row={row} />
          <Button variant="primary" icon="user" disabled={!rule.ok} title={rule.ok ? "Record arrival and open the nurse form" : rule.reason} onClick={checkIn}>Check in</Button>
        </>}>
        {!rule.ok ? <div className="clx-banner"><Icon name="info" size={14} style={{ color: "var(--faint)", marginTop: 2 }} /><span>{rule.reason}</span></div> : null}
        {msg ? <div className="clx-banner warn"><Icon name="alert" size={14} style={{ color: "var(--warn)", marginTop: 2 }} /><span>{msg}</span></div> : null}
      </WsHeader>
      <div className="clx-ws">
        <div className="ph-stack">
          <Card>
            <CardHeader title="Pre-visit questionnaire" sub="Completed by the participant before the booking was confirmed. Its answers carry onto the nurse form at check-in for the nurse to confirm." />
            <QuestionnaireReview booking={row.booking} membership={row.membership} />
          </Card>
        </div>
        <div className="ph-stack">
          <PlannedCard row={row} />
          <Card>
            <CardHeader title="At arrival" />
            <Checklist items={[
              { label: "Check the participant in", done: false },
              { label: "Confirm identity with two identifiers: date of birth and booking reference", done: false, note: "A name match alone is never enough. Required before anything clinical." },
              { label: "Work through the nurse form, confirming the questionnaire answers", done: false, note: "Registration, cardiovascular risk, bowel, PSA, measurements, ECG, urinalysis, close-out." },
              { label: "Record the blood specimen and check the label and lab request", done: false },
              { label: "Complete the appointment", done: false, note: "Creates the episode awaiting results. It never releases a report." },
            ]} />
          </Card>
        </div>
      </div>
    </>
  );
}

function PlannedCard({ row }: { row: ApptRow }) {
  const state = usePhState();
  const { version } = bookingForm(state, row.booking);
  const blocks = (version?.blocks || []).map((r) => ({ r, b: state.forms.blocks.find((x) => x.id === r.blockId) })).filter((x) => !!x.b);
  return (
    <Card>
      <CardHeader title="Planned at this appointment" sub={`From the form version on the booking (v${row.booking.formVersion}). Later template versions do not change it.`} />
      <ul className="clx-list">
        {blocks.map(({ r, b }) => (
          <li key={r.blockId} className="clx-li">
            <span className="clx-li-ico" style={{ background: "var(--track)", color: "var(--dim)" }}><Icon name="file" size={11} /></span>
            <span className="clx-li-body">
              <span style={{ color: "var(--ink)" }}>{b!.name} {r.version}</span>{r.required ? null : <span className="ph-faint"> (optional)</span>}
              <span className="clx-li-sub">{b!.summary}</span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ---- capture in progress ---- */
function LiveCapture({ row, draft }: { row: ApptRow; draft: ClinicalCapture }) {
  const state = usePhState();
  const identityOk = draft.identity.every((x) => x.confirmed);
  const editable = captureRule(state, row.session).ok;
  const next = nextEpisodeNumber(state);
  return (
    <>
      <WsHeader row={row} dobConfirmed={identityOk}
        episodeLabel={<span><span className="ph-faint">Issued on completion.</span> Next in sequence: <span className="ph-mono">PH-E-{pad4(next)}</span></span>}
        actions={<NursePortalButton row={row} />}>
        <div className="ph-faint" style={{ fontSize: 12 }}>
          Checked in {draft.checkedInAt ? fmtDateTime(draft.checkedInAt) : ""}. This is the same nurse form the clinic nurse sees in the nurse portal: one record, saved as you go.
        </div>
      </WsHeader>
      <NurseCapture row={row} draft={draft} variant="staff" />
      {editable ? <SaveCard bookingId={row.booking.id} /> : null}
    </>
  );
}

/** Presenter control for the save-conflict behaviour. */
function SaveCard({ bookingId }: { bookingId: string }) {
  const [open, setOpen] = useState(false);
  const simulate = () => {
    const c = getState().captureDrafts[bookingId];
    if (!c) return;
    const line = "Note saved from another tab (simulated).";
    dispatch(act.saveCapture(bookingId, c.rev, { notes: c.notes ? `${c.notes}\n${line}` : line }), { silent: true });
  };
  return (
    <Card>
      <CardHeader title="Saving" sub="Changes save automatically about a second after you stop typing. Unsaved entries stay on screen, and are kept if you leave and come back." />
      <button type="button" className="ph-link" style={{ fontSize: 12 }} onClick={() => setOpen(!open)} aria-expanded={open}>{open ? "Hide" : "Show"} the save conflict demonstration</button>
      {open ? (
        <div className="ph-stack" style={{ gap: 8, marginTop: 10 }}>
          <div className="ph-wrap" style={{ gap: 6 }}><DemoTag>Simulated</DemoTag><span className="ph-faint" style={{ fontSize: 11.5 }}>Another tab saves this record. This screen then holds an older revision.</span></div>
          <div className="ph-faint" style={{ fontSize: 11.5, lineHeight: 1.45 }}>After it runs, type a value: the save is refused as a conflict and you choose to merge or discard. Nothing is overwritten silently.</div>
          <div><Button size="sm" icon="refresh" onClick={simulate}>Simulate a save from another tab</Button></div>
        </div>
      ) : null}
    </Card>
  );
}

/* ---- completed ---- */
function resultsTarget(ep: Episode): NavTarget {
  if (ep.reportState === "ready_for_review" || ep.reportState === "released") return linkFor("episode", ep.id);
  if (ep.reportState === "on_hold") return { page: "Results", tab: "inbox", params: { queue: "held", episode: ep.id } };
  return { page: "Results", tab: "inbox", params: { queue: "awaiting", episode: ep.id } };
}
const STATE_TONE: Record<Episode["reportState"], Tone> = { awaiting_results: "neutral", ready_for_review: "info", released: "ok", on_hold: "warn" };

function CompletedView({ row, episode: ep }: { row: ApptRow; episode: Episode }) {
  const state = usePhState();
  const nav = useNav();
  const [labelOpen, setLabelOpen] = useState(false);
  const cap = ep.capture;
  const tests = expectedTests(state, ep);
  const pending = tests.filter((t) => t.status !== "received");
  const specs = state.specimens.filter((x) => x.episodeId === ep.id);
  return (
    <>
      <WsHeader row={row} dobConfirmed={cap.identity.every((x) => x.confirmed)}
        episodeLabel={<EntityLink kind="episode" id={ep.id} />}
        pills={<>
          <Pill tone={STATE_TONE[ep.reportState]} icon={ep.reportState === "released" ? "check" : ep.reportState === "on_hold" ? "alert" : "clock"}>{REPORT_STATE_LABEL[ep.reportState]}</Pill>
          {ep.nurseReferral ? <Pill tone="bad" icon="alert">Nurse referral</Pill> : null}
          {cap.ecgReview ? <Pill tone="warn" icon="flag">ECG review</Pill> : null}
        </>}
        actions={<>
          <Button icon="print" onClick={() => setLabelOpen(true)}>Label and request</Button>
          <Button variant="primary" icon="arrow" onClick={() => nav.go(resultsTarget(ep))}>Open in Results</Button>
        </>}>
        <div className="clx-banner info">
          <Icon name="info" size={14} style={{ color: "var(--accent)", marginTop: 2 }} />
          <span>Appointment completed {cap.completedAt ? fmtDateTime(cap.completedAt) : ""}. Unique ID <span className="ph-mono">{ep.screeningRef}</span>. Completing an appointment never releases a report. Report state: {REPORT_STATE_LABEL[ep.reportState]}.</span>
        </div>
      </WsHeader>
      {ep.nurseReferral || cap.ecgReview ? <AutomationReceipt episode={ep} title="Raised from the nurse form at this appointment" /> : null}
      <div className="clx-ws">
        <div className="ph-stack">
          <Card>
            <CardHeader title="Nurse form as recorded" sub="SISK Comprehensive (LAB) Screen V2, in the client's section order. Values are kept as entered; bands are for clinician review." right={<DemoTag>Sample data</DemoTag>} />
            <NurseFormReadOnly episode={ep} />
          </Card>
          <Card>
            <CardHeader title="Pre-visit questionnaire" />
            <QuestionnaireReview booking={row.booking} membership={row.membership} />
          </Card>
        </div>
        <div className="ph-stack">
          <Card>
            <CardHeader title="Expected results" sub={pending.length ? `${pending.length} of ${tests.length} still pending. Pending results stay visible here after completion.` : `All ${tests.length} expected results are accounted for.`} right={<DemoTag>Sample data</DemoTag>} />
            <div className="clx-qa">
              {tests.map((t) => [
                <span key={t.code + "n"}>{t.name}{t.addOn ? " (add-on)" : ""}</span>,
                <span key={t.code + "s"}>{t.status === "received" ? <Pill tone="ok" icon="check">Received</Pill> : t.status === "quarantined" ? <Pill tone="warn" icon="alert">Held in import</Pill> : <Pill tone="neutral" icon="clock">Pending</Pill>}</span>,
              ])}
            </div>
          </Card>
          <Card>
            <CardHeader title="Episode" />
            <dl className="clx-kv" style={{ margin: 0, gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
              <div><dt>Episode</dt><dd className="ph-mono">{ep.id}</dd></div>
              <div><dt>Unique ID</dt><dd className="ph-mono">{ep.screeningRef}</dd></div>
              <div><dt>Report state</dt><dd>{REPORT_STATE_LABEL[ep.reportState]}</dd></div>
              <div><dt>Collected</dt><dd>{fmtDateTime(ep.collectedAt)}</dd></div>
              <div><dt>Form snapshot</dt><dd>v{ep.formSnapshot.version}, {Object.keys(ep.formSnapshot.blocks).length} blocks</dd></div>
            </dl>
            <div className="ph-eyebrow" style={{ margin: "14px 0 6px" }}>Specimens</div>
            {specs.map((x) => <div key={x.id} style={{ fontSize: 12.5 }}><span className="ph-mono">{x.id}</span> <span className="ph-faint">{x.type}, {x.status}{x.labelPrinted ? ", label printed" : ""}</span></div>)}
          </Card>
          <Card>
            <CardHeader title="Pre-screening checks" />
            <Checklist items={[
              { label: "Identity confirmed using two identifiers", done: cap.identity.every((x) => x.confirmed), note: cap.identity.map((x) => `${x.label}: ${x.confirmedValue || "not recorded"}`).join("; ") },
              { label: consentSummary(row.membership, row.booking.consentVersion), done: row.membership?.questionnaire === "complete" && row.membership?.consent === "complete" },
              { label: "Questionnaire reviewed at the appointment", done: !!cap.checklist.questionnaire, note: cap.checklist.questionnaire ? undefined : "Not recorded as reviewed" },
              { label: "All expected results accounted for", done: pending.length === 0, note: pending.length ? `${pending.length} pending: ${pending.map((x) => x.code).join(", ")}` : undefined },
            ]} />
          </Card>
        </div>
      </div>
      <LabelPreviewModal open={labelOpen} onClose={() => setLabelOpen(false)} row={row} episode={ep} />
    </>
  );
}

/* ---- cancelled ---- */
export function CancelledView({ row }: { row: ApptRow }) {
  const nav = useNav();
  const b = row.booking;
  return (
    <WsHeader row={row} dobConfirmed={false} episodeLabel={<span className="ph-faint">None</span>}>
      <div className="clx-banner">
        <Icon name="x" size={14} style={{ color: "var(--faint)", marginTop: 2 }} />
        <span>
          {b.replacedBy ? "Rescheduled. " : "Cancelled. "}{b.cancelReason ? `Reason: ${b.cancelReason}. ` : ""}The slot is free again and future simulated reminder jobs were cancelled.
          {b.replacedBy ? <> The replacement booking is <button type="button" className="ph-link" onClick={() => nav.setParams({ booking: b.replacedBy! })}>{b.replacedBy}</button>.</> : null}
        </span>
      </div>
    </WsHeader>
  );
}
