/* Nurse clinical workspace: check-in, identity check with two identifiers, questionnaire review,
   measurements with units and provenance, urine dipstick, specimen and labels, a completion
   checklist and autosave. Completing creates an episode awaiting results and never releases a
   report. Clinical reviewers see the same record read-only. */
import { useId, useState } from "react";
import type { ReactNode } from "react";
import type { ClinicalCapture, Episode, MeasureKey, NavTarget } from "../../model";
import {
  BP_REVIEW_LIMIT, IDENTITY_HELP, LIMITS_DISCLAIMER, MEASURE_RULES, QRISK3, REPORT_STATE_LABEL, act, ageOn, expectedTests, fmtDateLong, fmtDateTime, fmtNumericDate,
  fmtTime, linkFor, parseIrishDate, staffName,
} from "../../model";
import { dispatch, usePhState } from "../../store";
import { useNav } from "../../nav-context";
import { Button, Card, CardHeader, Checklist, DemoTag, EntityLink, Field, Icon, Pill, RestrictedNotice, Select, TextInput, Textarea } from "../../ui";
import type { Tone } from "../../ui";
import type { ApptRow } from "./selectors";
import { bookingForm, captureRule, checkInRule, nextEpisodeNumber, pad4, placeLabel, urineRequired } from "./selectors";
import { ApptPill, ClxModal, ProgTag } from "./shared";
import { QuestionnaireReview, consentSummary } from "./Questionnaire";
import { LabelPreviewModal } from "./LabelPreview";
import {
  MEASURE_HINT, URINE_ABSENT, URINE_KEYS, URINE_LABEL, URINE_RESULTS, formBmi, formErrors, formMissing, fromCapture, numericValue, positiveDipstick, useCaptureForm,
} from "./captureForm";
import type { FormValues, MeasureField, Mode, SaveStatus } from "./captureForm";

const SEX: Record<string, string> = { female: "Female", male: "Male", not_recorded: "Not recorded" };

export function Workspace({ row }: { row: ApptRow }) {
  if (row.status === "completed" && row.episode) return <CompletedView row={row} episode={row.episode} />;
  if (row.status === "cancelled") return <CancelledView row={row} />;
  if (!row.draft) return <PreVisit row={row} />;
  return <LiveCapture key={row.booking.id + ":" + (row.draft.checkedInAt || "")} row={row} draft={row.draft} />;
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
        <div><dt>Date of birth</dt><dd>{dobConfirmed ? `${fmtNumericDate(person.dob)} (age ${ageOn(person.dob, s.date)})` : "Confirm with the participant"}</dd></div>
        <div><dt>Sex recorded</dt><dd>{SEX[person.sex] || person.sex}</dd></div>
        <div><dt>Form version</dt><dd>{template ? template.name : b.formTemplateId} v{b.formVersion}</dd></div>
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
        actions={<Button variant="primary" icon="user" disabled={!rule.ok} title={rule.ok ? "Record arrival and open the capture form" : rule.reason} onClick={checkIn}>Check in</Button>}>
        {!rule.ok ? <div className="clx-banner"><Icon name="info" size={14} style={{ color: "var(--faint)", marginTop: 2 }} /><span>{rule.reason}</span></div> : null}
        {msg ? <div className="clx-banner warn"><Icon name="alert" size={14} style={{ color: "var(--warn)", marginTop: 2 }} /><span>{msg}</span></div> : null}
      </WsHeader>
      <div className="clx-ws">
        <div className="ph-stack">
          <Card>
            <CardHeader title="Questionnaire" sub="Completed by the participant before the booking was confirmed. Review it together at the appointment." />
            <QuestionnaireReview booking={row.booking} membership={row.membership} />
          </Card>
        </div>
        <div className="ph-stack">
          <PlannedCard row={row} />
          <Card>
            <CardHeader title="At arrival" />
            <Checklist items={[
              { label: "Check the participant in", done: false },
              { label: "Confirm identity with two identifiers: date of birth and booking reference", done: false, note: "A name match alone is never enough. Required before any specimen or label." },
              { label: "Record measurements, urine and the nurse note", done: false },
              { label: "Create the specimen and check the labels", done: false },
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
  const b = row.booking;
  const rule = captureRule(state, row.session);
  const editable = rule.ok;
  const f = useCaptureForm(b.id, draft, editable);
  const values = editable ? f.values : fromCapture(draft);
  const errors = formErrors(values);
  const needUrine = urineRequired(state, b);
  const missing = formMissing(values, needUrine);
  const identityOk = draft.identity.every((x) => x.confirmed);
  const specimens = !!draft.checklist.specimens;
  const labels = !!draft.checklist.labels;
  const reviewed = !!draft.checklist.questionnaire;
  const [labelOpen, setLabelOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);
  const next = nextEpisodeNumber(state);
  const qComplete = row.membership?.questionnaire === "complete" && row.membership?.consent === "complete";
  const measuresMissing = missing.filter((m) => !m.startsWith("Urine") && !m.startsWith("Nurse note"));
  const urineMissing = missing.filter((m) => m.startsWith("Urine") || m.startsWith("Nurse note"));
  const hasErrors = Object.keys(errors).length > 0;
  const saveBlocked = f.status.kind === "conflict" || f.status.kind === "error" || f.stale;

  const run = f.runOwn;
  const toggle = (key: "specimens" | "labels" | "questionnaire") => run(act.toggleChecklist(b.id, key));

  const lcFirst = (x: string) => x.charAt(0).toLowerCase() + x.slice(1);
  const blockers: string[] = [];
  if (!identityOk) blockers.push("confirm identity");
  if (measuresMissing.length) blockers.push(`record ${measuresMissing.map(lcFirst).join(", ")}`);
  if (urineMissing.length) blockers.push(urineMissing.map(lcFirst).join(", "));
  if (hasErrors) blockers.push("correct the highlighted value");
  if (!specimens) blockers.push("create the specimen");
  if (!labels) blockers.push("check the labels");
  if (saveBlocked) blockers.push("resolve the save problem");
  const canComplete = editable && blockers.length === 0;

  const steps: Array<{ done: boolean; text: string }> = [
    { done: identityOk, text: "Confirm identity with date of birth and booking reference." },
    { done: measuresMissing.length === 0 && !hasErrors, text: "Record the required measurements, or mark them not done or declined." },
    { done: urineMissing.length === 0, text: "Record the urine dipstick, or mark it not done or declined." },
    { done: specimens, text: "Create the specimen record." },
    { done: labels, text: "Preview and check the labels and lab request." },
  ];
  const nextStep = steps.find((x) => !x.done);

  const complete = () => {
    if (!f.flush()) { setConfirmOpen(false); return; }
    const r = dispatch(act.completeAppointment(b.id));
    setConfirmOpen(false);
    if (!r.ok) setDoneMsg(r.message || "Not completed.");
  };

  return (
    <>
      <WsHeader row={row} dobConfirmed={identityOk}
        episodeLabel={<span><span className="ph-faint">Issued on completion.</span> Next in sequence: <span className="ph-mono">PH-E-{pad4(next)}</span></span>}
        pills={<SavePill status={f.status} editable={editable} dirty={f.dirty} />}
        actions={editable ? <>
          <Button icon="print" disabled={!identityOk} title={identityOk ? "Preview the specimen label and A4 lab request" : "Confirm identity first. Labels carry the participant's identifiers."} onClick={() => setLabelOpen(true)}>Preview labels</Button>
          <Button variant="primary" icon="check" disabled={!canComplete} title={canComplete ? "Complete the appointment" : `Still needed: ${blockers.join("; ")}`} onClick={() => setConfirmOpen(true)}>Complete appointment</Button>
        </> : undefined}>
        {!editable ? <RestrictedNotice title="Read only">{rule.reason}</RestrictedNotice> : null}
        {editable && nextStep ? (
          <div className="clx-banner info"><Icon name="arrow" size={14} style={{ color: "var(--accent)", marginTop: 2 }} /><span><strong style={{ color: "var(--ink)" }}>Next:</strong> {nextStep.text}</span></div>
        ) : editable ? (
          <div className="clx-banner info"><Icon name="check" size={14} style={{ color: "var(--ok)", marginTop: 2 }} /><span>Everything required is recorded. Complete the appointment when the participant has finished.</span></div>
        ) : null}
        {editable && f.restored ? <div className="clx-banner info"><Icon name="refresh" size={14} style={{ color: "var(--accent)", marginTop: 2 }} /><span>Unsaved entries from earlier in this session were restored.</span></div> : null}
        {editable ? <SaveProblems f={f} /> : null}
        {doneMsg ? <div className="clx-banner warn"><Icon name="alert" size={14} style={{ color: "var(--warn)", marginTop: 2 }} /><span>{doneMsg}</span></div> : null}
      </WsHeader>

      <div className="clx-ws">
        <div className="ph-stack">
          <IdentityCard row={row} cap={draft} editable={editable} run={run} />
          <MeasuresCard row={row} values={values} errors={errors} editable={editable}
            onField={(k, field) => f.update((v) => ({ ...v, measures: { ...v.measures, [k]: field } }))} cap={draft} />
          <UrineCard row={row} values={values} editable={editable} needUrine={needUrine}
            onUrine={(k, val) => f.update((v) => ({ ...v, urine: { ...v.urine, [k]: val } }))}
            onNotes={(t) => f.update((v) => ({ ...v, notes: t }))} />
          <Card>
            <CardHeader title="Questionnaire" sub="Self-reported before booking. Read it back with the participant." right={
              <Button size="sm" variant={reviewed ? "ghost" : "secondary"} icon={reviewed ? "check" : undefined} disabled={!editable} onClick={() => toggle("questionnaire")}
                title={editable ? (reviewed ? "Mark as not reviewed" : "Mark the questionnaire as reviewed with the participant") : rule.reason}>{reviewed ? "Reviewed" : "Mark reviewed"}</Button>
            } />
            <QuestionnaireReview booking={b} membership={row.membership} />
          </Card>
        </div>

        <div className="ph-stack">
          <Card>
            <CardHeader title="Completion checklist" sub="Completing creates the episode in Awaiting results. It never releases a report." />
            <Checklist items={[
              { label: `Checked in at ${draft.checkedInAt ? fmtTime(draft.checkedInAt) : "arrival"}`, done: true },
              { label: "Identity confirmed with two identifiers", done: identityOk, note: identityOk ? "Date of birth and booking reference" : "Required before any specimen or label" },
              { label: consentSummary(row.membership, b.consentVersion), done: qComplete },
              { label: "Questionnaire reviewed with the participant", done: reviewed, note: "Recommended, not required to complete", onToggle: editable ? () => toggle("questionnaire") : undefined },
              { label: "Required measurements recorded, or marked not done or declined", done: measuresMissing.length === 0, note: measuresMissing.length ? `Missing: ${measuresMissing.join(", ")}` : undefined },
              ...(needUrine || urineMissing.length ? [{ label: "Urine dipstick recorded, or marked not done or declined", done: urineMissing.length === 0, note: urineMissing.length ? `Missing: ${urineMissing.join(", ")}` : undefined }] : []),
              { label: "Values within entry limits", done: !hasErrors, note: hasErrors ? Object.values(errors)[0] : "Abnormal values are kept and flagged for review, never forced into range" },
              { label: "Specimen created", done: specimens, note: identityOk ? undefined : "Unlocks after identity is confirmed" },
              { label: "Labels and lab request checked", done: labels, note: identityOk ? undefined : "Unlocks after identity is confirmed" },
              ...(editable ? [{ label: "All changes saved", done: !f.dirty && !saveBlocked && f.status.kind !== "invalid" }] : []),
            ]} />
            {editable ? (
              <div style={{ marginTop: 14 }}>
                <Button variant="primary" icon="check" disabled={!canComplete} onClick={() => setConfirmOpen(true)} style={{ width: "100%" }}>Complete appointment</Button>
                {!canComplete ? <div className="ph-faint" style={{ fontSize: 11.5, marginTop: 6, lineHeight: 1.45 }}>Still needed: {blockers.join("; ")}.</div> : null}
              </div>
            ) : null}
          </Card>
          <SpecimenCard row={row} identityOk={identityOk} specimens={specimens} labels={labels} editable={editable} onToggle={toggle} onPreview={() => setLabelOpen(true)} next={next} />
          <CalcCard values={values} cap={draft} />
          {editable ? <SaveCard f={f} /> : null}
        </div>
      </div>

      <LabelPreviewModal open={labelOpen} onClose={() => setLabelOpen(false)} row={row} episode={null} marked={labels}
        onMarkChecked={editable ? () => { if (!labels) toggle("labels"); setLabelOpen(false); } : undefined} />
      <ClxModal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Complete this appointment?" width={520}
        footer={<>
          <Button variant="ghost" onClick={() => setConfirmOpen(false)}>Not yet</Button>
          <Button variant="primary" icon="check" disabled={!canComplete} onClick={complete}>Complete appointment</Button>
        </>}>
        <div className="ph-stack" style={{ gap: 10, fontSize: 13, lineHeight: 1.5, color: "var(--body)" }}>
          <div>{row.person.given} {row.person.family} ({b.id}) will be marked attended.</div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>Episode <span className="ph-mono">PH-E-{pad4(next)}</span> is created in Awaiting results, with the five core panel tests expected.</li>
            <li>Specimen <span className="ph-mono">PH-S-{pad4(next)}</span> is recorded as collected.</li>
            <li>No report is released. Review happens in Results once the laboratory results arrive.</li>
          </ul>
          {f.dirty ? <div className="ph-faint" style={{ fontSize: 12 }}>Unsaved changes are saved first.</div> : null}
        </div>
      </ClxModal>
    </>
  );
}

/* ---- save state ---- */
function SavePill({ status, editable, dirty }: { status: SaveStatus; editable: boolean; dirty: boolean }) {
  if (!editable) return <Pill tone="neutral" icon="lock">Read only</Pill>;
  const map: Record<SaveStatus["kind"], { tone: Tone; icon: "check" | "clock" | "alert" | "x" | "dot"; text: string }> = {
    idle: { tone: "neutral", icon: "dot", text: "Nothing saved yet" },
    pending: { tone: "neutral", icon: "clock", text: "Saving" },
    saved: { tone: "ok", icon: "check", text: status.kind === "saved" && status.at ? `Saved ${fmtTime(status.at)}` : "Saved" },
    invalid: { tone: "bad", icon: "alert", text: "Not saved: check a value" },
    error: { tone: "bad", icon: "x", text: "Not saved" },
    conflict: { tone: "warn", icon: "alert", text: "Save conflict" },
  };
  const m = dirty && status.kind === "saved" ? map.pending : map[status.kind];
  return <Pill tone={m.tone} icon={m.icon} title="Changes save automatically about a second after you stop typing">{m.text}</Pill>;
}

type FormApi = ReturnType<typeof useCaptureForm>;
function SaveProblems({ f }: { f: FormApi }) {
  if (f.status.kind === "conflict") {
    return (
      <div className="clx-banner warn" role="alert">
        <Icon name="alert" size={14} style={{ color: "var(--warn)", marginTop: 2 }} />
        <div style={{ flex: 1 }}>
          <div style={{ color: "var(--ink)" }}>{f.status.message}</div>
          <div className="ph-faint" style={{ fontSize: 11.5, marginTop: 3 }}>Your entries are still on this screen. Merging keeps every field you changed and takes the other copy for the rest.</div>
          <div className="ph-wrap" style={{ marginTop: 8 }}>
            <Button size="sm" variant="primary" icon="refresh" onClick={f.mergeAndSave}>Merge my edits and save</Button>
            <Button size="sm" variant="ghost" onClick={f.discardMine}>Discard my edits</Button>
          </div>
        </div>
      </div>
    );
  }
  if (f.stale) {
    return (
      <div className="clx-banner info" role="status">
        <Icon name="refresh" size={14} style={{ color: "var(--accent)", marginTop: 2 }} />
        <div style={{ flex: 1 }}>
          <div style={{ color: "var(--ink)" }}>This record was saved somewhere else since you opened it.</div>
          <div className="ph-faint" style={{ fontSize: 11.5, marginTop: 3 }}>{f.dirty ? "You have unsaved entries. Your next save will ask how to combine them." : "Load the latest copy before you continue."}</div>
          <div className="ph-wrap" style={{ marginTop: 8 }}>
            {f.dirty ? <Button size="sm" variant="primary" icon="refresh" onClick={f.mergeAndSave}>Merge my edits and save</Button> : null}
            <Button size="sm" variant={f.dirty ? "ghost" : "primary"} onClick={f.discardMine}>{f.dirty ? "Discard my edits" : "Load latest"}</Button>
          </div>
        </div>
      </div>
    );
  }
  if (f.status.kind === "error") {
    return <div className="clx-banner bad" role="alert"><Icon name="x" size={14} style={{ color: "var(--bad)", marginTop: 2 }} /><span>{f.status.message} Your entries are kept on this screen.</span></div>;
  }
  if (f.status.kind === "invalid") {
    return <div className="clx-banner bad" role="alert"><Icon name="alert" size={14} style={{ color: "var(--bad)", marginTop: 2 }} /><span>Not saved: {f.status.message} Your entry is kept here until you correct it.</span></div>;
  }
  return null;
}

function SaveCard({ f }: { f: FormApi }) {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <CardHeader title="Saving" sub="Changes save automatically about a second after you stop typing. Unsaved entries stay on screen, and are kept if you leave and come back." />
      <button type="button" className="ph-link" style={{ fontSize: 12 }} onClick={() => setOpen(!open)} aria-expanded={open}>{open ? "Hide" : "Show"} the save conflict demonstration</button>
      {open ? (
        <div className="ph-stack" style={{ gap: 8, marginTop: 10 }}>
          <div className="ph-wrap" style={{ gap: 6 }}><DemoTag>Simulated</DemoTag><span className="ph-faint" style={{ fontSize: 11.5 }}>Another tab saves this record. This screen then holds an older revision.</span></div>
          <div className="ph-faint" style={{ fontSize: 11.5, lineHeight: 1.45 }}>After it runs, type a value: the save is refused as a conflict and you choose to merge or discard. Nothing is overwritten silently.</div>
          <div><Button size="sm" icon="refresh" onClick={f.simulateOtherTab}>Simulate a save from another tab</Button></div>
        </div>
      ) : null}
    </Card>
  );
}

/* ---- identity ---- */
function IdentityCard({ row, cap, editable, run }: { row: ApptRow; cap: ClinicalCapture; editable: boolean; run: FormApi["runOwn"] }) {
  const [dob, setDob] = useState("");
  const [ref, setRef] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [hint, setHint] = useState(false);
  const dobId = useId(), refId = useId();
  const confirmed = cap.identity.every((x) => x.confirmed);
  const dobFmt = dob.trim() && !parseIrishDate(dob) ? "Use dd/mm/yyyy, for example 09/06/1993." : null;
  const refFmt = ref.trim() && !/^PH-B-\d{4}$/i.test(ref.trim()) ? "Booking references look like PH-B-0001." : null;
  const submit = () => {
    const r = run(act.confirmIdentity(row.booking.id, dob, ref));
    setErr(r.ok ? null : r.message || "Identity not confirmed.");
  };
  return (
    <Card>
      <CardHeader title="Identity check" sub={IDENTITY_HELP} right={confirmed ? <Pill tone="ok" icon="shield">Confirmed</Pill> : <Pill tone="warn" icon="alert">Not confirmed</Pill>} />
      {confirmed ? (
        <ul className="clx-list">
          {cap.identity.map((x) => (
            <li key={x.key} className="clx-li">
              <span className="clx-li-ico" style={{ background: "var(--ok-soft)", color: "var(--ok)" }}><Icon name="check" size={12} stroke={2.2} /></span>
              <span className="clx-li-body"><span style={{ color: "var(--ink)" }}>{x.label}</span><span className="clx-li-sub">{x.confirmedValue}, read back by the participant and matched to the booking record</span></span>
            </li>
          ))}
        </ul>
      ) : editable ? (
        <div className="clx-cq">
          <div className="clx-idrow">
            <Field label="Date of birth, as the participant states it" htmlFor={dobId} error={dobFmt}>
              <TextInput id={dobId} value={dob} placeholder="dd/mm/yyyy" inputMode="numeric" invalid={!!dobFmt} onChange={(e) => setDob(e.target.value)} />
            </Field>
            <Field label="Booking reference from their confirmation" htmlFor={refId} error={refFmt}>
              <TextInput id={refId} value={ref} placeholder="PH-B-0000" invalid={!!refFmt} onChange={(e) => setRef(e.target.value)} />
            </Field>
            <div style={{ paddingBottom: dobFmt || refFmt ? 20 : 0 }}>
              <Button variant="primary" icon="shield" disabled={!dob.trim() || !ref.trim() || !!dobFmt || !!refFmt} onClick={submit}>Confirm identity</Button>
            </div>
          </div>
          {err ? <div className="clx-banner bad" style={{ marginTop: 10 }}><Icon name="x" size={14} style={{ color: "var(--bad)", marginTop: 2 }} /><span>{err}</span></div> : null}
          <div className="ph-row-flex" style={{ marginTop: 10, gap: 8 }}>
            <DemoTag>Demo helper</DemoTag>
            <button type="button" className="ph-link" style={{ fontSize: 11.5 }} onClick={() => setHint(!hint)} aria-expanded={hint}>{hint ? "Hide" : "Show"} the expected answers for the presenter</button>
          </div>
          {hint ? <div className="ph-faint" style={{ fontSize: 11.5, marginTop: 6 }}>Fictional record: date of birth {fmtNumericDate(row.person.dob)}, booking reference {row.booking.id}. In practice the participant states these and the nurse compares.</div> : null}
        </div>
      ) : (
        <div className="ph-faint" style={{ fontSize: 12.5 }}>Not confirmed yet. The clinic nurse confirms two identifiers before any specimen or label.</div>
      )}
    </Card>
  );
}

/* ---- measurements ---- */
const ANTHRO: MeasureKey[] = ["heightM", "weightKg", "waistCm"];
const BP: MeasureKey[] = ["bpSys", "bpDia", "pulse"];

function MeasuresCard({ row, values, errors, editable, onField, cap }: {
  row: ApptRow; values: FormValues; errors: Partial<Record<MeasureKey | "bp", string>>; editable: boolean; onField: (k: MeasureKey, f: MeasureField) => void; cap: ClinicalCapture;
}) {
  const state = usePhState();
  const { version } = bookingForm(state, row.booking);
  const ver = (id: string) => version?.blocks.find((x) => x.blockId === id)?.version;
  const bmi = formBmi(values, cap);
  const sys = numericValue(values, "bpSys"), dia = numericValue(values, "bpDia");
  const bpReview = (sys !== null && sys >= BP_REVIEW_LIMIT.sys) || (dia !== null && dia >= BP_REVIEW_LIMIT.dia);
  const h = numericValue(values, "heightM"), w = numericValue(values, "weightKg");
  return (
    <Card>
      <CardHeader title="Measurements" sub="Numbers with units and source. Choose Not done or Declined when a value is not taken. A blank is not zero." right={<DemoTag>Sample data</DemoTag>} />
      <div className="clx-cq">
        <div className="ph-eyebrow" style={{ margin: "2px 0 4px" }}>Anthropometrics {ver("blk-anthro") || ""}</div>
        {ANTHRO.map((k) => <MeasureRow key={k} k={k} field={values.measures[k]} error={errors[k]} disabled={!editable} onChange={(fd) => onField(k, fd)} />)}
        <div className="clx-banner" style={{ marginTop: 8 }}>
          <Icon name="chart" size={14} style={{ color: "var(--accent)", marginTop: 2 }} />
          <span>
            <strong style={{ color: "var(--ink)" }}>BMI (calculated): {bmi.bmi !== null ? `${bmi.bmi.toFixed(1)} kg/m²` : "not calculated"}</strong>
            <span className="ph-faint" style={{ display: "block", fontSize: 11.5 }}>
              {bmi.bmi !== null && h !== null && w !== null ? `${w} kg ÷ (${h} m)² = ${(w / (h * h)).toFixed(3)}, rounded half up to one decimal. Calculated, never typed.` : bmi.reason}
            </span>
          </span>
        </div>
        <div className="ph-eyebrow" style={{ margin: "16px 0 4px" }}>Blood pressure {ver("blk-bp") || ""}</div>
        {BP.map((k) => <MeasureRow key={k} k={k} field={values.measures[k]} error={errors[k] || (k === "bpDia" ? errors.bp : undefined)} disabled={!editable} onChange={(fd) => onField(k, fd)}
          flag={bpReview && (k === "bpSys" || k === "bpDia") && !errors.bp ? `Review required at the displayed limit of ${BP_REVIEW_LIMIT.text}. Kept as entered for clinician review.` : undefined} />)}
      </div>
    </Card>
  );
}

function MeasureRow({ k, field, error, disabled, onChange, flag }: { k: MeasureKey; field: MeasureField; error?: string; disabled: boolean; onChange: (f: MeasureField) => void; flag?: string }) {
  const r = MEASURE_RULES[k];
  const id = useId();
  const blank = field.mode === "value" && !field.text.trim();
  let msg: ReactNode = null;
  if (error) msg = <div className="ph-err" role="alert">{error}</div>;
  else if (field.mode === "not_done") msg = <div className="ph-help">Recorded as not done. Not counted as a value.</div>;
  else if (field.mode === "declined") msg = <div className="ph-help">Recorded as declined by the participant. Not counted as a value.</div>;
  else if (flag) msg = <div className="ph-help" style={{ color: "var(--warn)" }}><Icon name="flag" size={11} style={{ verticalAlign: "-1px", marginRight: 4 }} />{flag}</div>;
  else if (blank) msg = <div className="ph-help">{r.required ? "Missing. Record a value, or choose Not done or Declined. " : ""}{MEASURE_HINT[k]}.</div>;
  return (
    <div className="clx-mrow">
      <label className="clx-mlabel" htmlFor={id}>{r.label}<small>{r.required ? "Required" : "Optional"}, accepted {r.min} to {r.max} {r.unit}</small></label>
      <div className="clx-mvalue">
        <TextInput id={id} value={field.mode === "value" ? field.text : ""} placeholder={field.mode === "value" ? "" : field.mode === "not_done" ? "Not done" : "Declined"}
          disabled={disabled || field.mode !== "value"} inputMode="decimal" invalid={!!error} onChange={(e) => onChange({ ...field, text: e.target.value })} />
        <span className="clx-unit">{r.unit}</span>
      </div>
      <Select aria-label={`${r.label}: status`} value={field.mode} disabled={disabled} onChange={(e) => onChange({ ...field, mode: (e.target.value === "not_done" || e.target.value === "declined" ? e.target.value : "value") as Mode })}>
        <option value="value">Recorded</option>
        <option value="not_done">Not done</option>
        <option value="declined">Declined</option>
      </Select>
      <Select aria-label={`${r.label}: source`} value={field.provenance} disabled={disabled} onChange={(e) => onChange({ ...field, provenance: e.target.value === "self_reported" ? "self_reported" : "measured" })}>
        <option value="measured">Measured</option>
        <option value="self_reported">Self-reported</option>
      </Select>
      {msg ? <div className="clx-mmsg">{msg}</div> : null}
    </div>
  );
}

/* ---- urine and nurse note ---- */
function UrineCard({ row, values, editable, needUrine, onUrine, onNotes }: {
  row: ApptRow; values: FormValues; editable: boolean; needUrine: boolean; onUrine: (k: (typeof URINE_KEYS)[number], v: string) => void; onNotes: (t: string) => void;
}) {
  const state = usePhState();
  const { version } = bookingForm(state, row.booking);
  const ver = version?.blocks.find((x) => x.blockId === "blk-urine")?.version;
  const positive = positiveDipstick(values);
  const noteId = useId();
  return (
    <Card>
      <CardHeader title="Urine dipstick and nurse note" sub={`Urine ${ver || ""}: point-of-care, measured. ${needUrine ? "Required by this form version." : "Optional for this form version."} Coded results.`} />
      <div className="clx-cq">
        <div className="clx-urine">
          {URINE_KEYS.map((k) => (
            <Field key={k} label={URINE_LABEL[k]}>
              <Select value={values.urine[k]} disabled={!editable} aria-label={`Urine ${URINE_LABEL[k].toLowerCase()}`} onChange={(e) => onUrine(k, e.target.value)}>
                <option value="">Not recorded</option>
                {URINE_RESULTS.map((o) => <option key={o} value={o}>{o}</option>)}
                {URINE_ABSENT.map((o) => <option key={o} value={o}>{o}</option>)}
              </Select>
            </Field>
          ))}
        </div>
      </div>
      {positive ? (
        <div className="clx-banner warn" style={{ marginTop: 12 }}>
          <Icon name="flag" size={14} style={{ color: "var(--warn)", marginTop: 2 }} />
          <span>Positive dipstick result. The result is kept as recorded for clinician review, and a nurse note for the reviewing clinician is now required.</span>
        </div>
      ) : null}
      <div style={{ marginTop: 12 }}>
        <Field label={positive ? "Nurse note (required for a positive dipstick)" : "Nurse note (optional)"} htmlFor={noteId} help="Free text for the reviewing clinician. Not used in employer reporting.">
          <Textarea id={noteId} rows={3} maxLength={1000} value={values.notes} disabled={!editable} invalid={positive && !values.notes.trim()} onChange={(e) => onNotes(e.target.value)} />
        </Field>
      </div>
    </Card>
  );
}

/* ---- specimen and labels ---- */
function SpecimenCard({ row, identityOk, specimens, labels, editable, onToggle, onPreview, next }: {
  row: ApptRow; identityOk: boolean; specimens: boolean; labels: boolean; editable: boolean; onToggle: (k: "specimens" | "labels") => void; onPreview: () => void; next: number;
}) {
  const state = usePhState();
  const printer = state.resources.find((r) => r.id === row.session.printerId);
  const lockReason = "Confirm identity with two identifiers first.";
  return (
    <Card>
      <CardHeader title="Specimen and labels" sub="Created only after identity is confirmed. Demo specimen, not for laboratory use." />
      <ul className="clx-list" style={{ gap: 12 }}>
        <li className="clx-li">
          <span className="clx-li-ico" style={{ background: specimens ? "var(--ok-soft)" : "var(--track)", color: specimens ? "var(--ok)" : "var(--faint)" }}><Icon name={specimens ? "check" : "flask"} size={12} /></span>
          <span className="clx-li-body">
            <span style={{ color: "var(--ink)" }}>{specimens ? "Serum specimen recorded" : "Serum specimen"}</span>
            <span className="clx-li-sub">Core panel: total cholesterol, HDL, LDL, triglycerides, HbA1c. Issued as <span className="ph-mono">PH-S-{pad4(next)}</span> on completion.</span>
          </span>
          <Button size="sm" variant={specimens ? "ghost" : "secondary"} disabled={!editable || !identityOk} title={!identityOk ? lockReason : undefined} onClick={() => onToggle("specimens")}>{specimens ? "Undo" : "Record collected"}</Button>
        </li>
        <li className="clx-li">
          <span className="clx-li-ico" style={{ background: labels ? "var(--ok-soft)" : "var(--track)", color: labels ? "var(--ok)" : "var(--faint)" }}><Icon name={labels ? "check" : "print"} size={12} /></span>
          <span className="clx-li-body">
            <span style={{ color: "var(--ink)" }}>{labels ? "Labels and lab request checked" : "Labels and A4 lab request"}</span>
            <span className="clx-li-sub">{printer ? `${printer.name}. ` : ""}Local preview only.</span>
          </span>
          <Button size="sm" variant="secondary" disabled={!identityOk} title={!identityOk ? lockReason : undefined} onClick={onPreview}>{labels ? "Preview again" : "Preview"}</Button>
        </li>
      </ul>
    </Card>
  );
}

/* ---- calculations ---- */
function CalcCard({ values, cap }: { values: FormValues; cap: ClinicalCapture }) {
  const bmi = formBmi(values, cap);
  return (
    <Card>
      <CardHeader title="Calculations" />
      <div className="ph-row-flex" style={{ alignItems: "baseline" }}>
        <span className="ph-num" style={{ fontSize: 24, fontWeight: 600, color: "var(--ink)" }}>{bmi.bmi !== null ? bmi.bmi.toFixed(1) : "Not calculated"}</span>
        {bmi.bmi !== null ? <span className="ph-faint" style={{ fontSize: 12 }}>kg/m², BMI from valid height and weight</span> : null}
      </div>
      {bmi.bmi === null ? <div className="ph-faint" style={{ fontSize: 11.5, marginTop: 4 }}>{bmi.reason}</div> : null}
      <div className="ph-card-flat" style={{ padding: "12px 14px", marginTop: 12 }}>
        <div className="ph-row-flex" style={{ marginBottom: 6 }}>
          <span className="ph-grow" style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink)" }}>{QRISK3.title}</span>
          <Pill tone="neutral" icon="lock">Approved integration required</Pill>
        </div>
        <div className="ph-dim" style={{ fontSize: 12, lineHeight: 1.5 }}>{QRISK3.text}</div>
        <div className="ph-faint" style={{ fontSize: 11.5, marginTop: 6 }}>Inputs it would need: {QRISK3.inputsNeeded.join("; ")}.</div>
      </div>
      <div className="ph-faint" style={{ fontSize: 11, marginTop: 10, lineHeight: 1.45 }}>{LIMITS_DISCLAIMER}</div>
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
  const values = fromCapture(cap);
  const bmi = formBmi(values, cap);
  return (
    <>
      <WsHeader row={row} dobConfirmed={cap.identity.every((x) => x.confirmed)}
        episodeLabel={<EntityLink kind="episode" id={ep.id} />}
        pills={<Pill tone={STATE_TONE[ep.reportState]} icon={ep.reportState === "released" ? "check" : ep.reportState === "on_hold" ? "alert" : "clock"}>{REPORT_STATE_LABEL[ep.reportState]}</Pill>}
        actions={<>
          <Button icon="print" onClick={() => setLabelOpen(true)}>Label and request</Button>
          <Button variant="primary" icon="arrow" onClick={() => nav.go(resultsTarget(ep))}>Open in Results</Button>
        </>}>
        <div className="clx-banner info">
          <Icon name="info" size={14} style={{ color: "var(--accent)", marginTop: 2 }} />
          <span>Appointment completed {cap.completedAt ? fmtDateTime(cap.completedAt) : ""}. Completing an appointment never releases a report. Report state: {REPORT_STATE_LABEL[ep.reportState]}.</span>
        </div>
      </WsHeader>
      <div className="clx-ws">
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
            <CardHeader title="Recorded at the appointment" sub="As captured by the nurse. Values are kept as entered; flags are for clinician review." right={<DemoTag>Sample data</DemoTag>} />
            <RecordedValues cap={cap} />
            <div className="ph-faint" style={{ fontSize: 11.5, marginTop: 10 }}>BMI {bmi.bmi !== null ? `${bmi.bmi.toFixed(1)} kg/m², calculated from height and weight` : bmi.reason}</div>
          </Card>
          <Card>
            <CardHeader title="Questionnaire" />
            <QuestionnaireReview booking={row.booking} membership={row.membership} />
          </Card>
        </div>
        <div className="ph-stack">
          <Card>
            <CardHeader title="Episode" />
            <dl className="clx-kv" style={{ margin: 0, gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
              <div><dt>Episode</dt><dd className="ph-mono">{ep.id}</dd></div>
              <div><dt>Report state</dt><dd>{REPORT_STATE_LABEL[ep.reportState]}</dd></div>
              <div><dt>Collected</dt><dd>{fmtDateTime(ep.collectedAt)}</dd></div>
              <div><dt>Form snapshot</dt><dd>v{ep.formSnapshot.version}, {Object.keys(ep.formSnapshot.blocks).length} blocks</dd></div>
            </dl>
            <div className="ph-eyebrow" style={{ margin: "14px 0 6px" }}>Specimens</div>
            {specs.map((x) => <div key={x.id} style={{ fontSize: 12.5 }}><span className="ph-mono">{x.id}</span> <span className="ph-faint">{x.type}, {x.status}{x.labelPrinted ? ", label printed" : ""}</span></div>)}
          </Card>
          <Card>
            <CardHeader title="Identity at the appointment" />
            <Checklist items={cap.identity.map((x) => ({ label: `${x.label}: ${x.confirmedValue || "not recorded"}`, done: x.confirmed }))} />
          </Card>
        </div>
      </div>
      <LabelPreviewModal open={labelOpen} onClose={() => setLabelOpen(false)} row={row} episode={ep} />
    </>
  );
}

function RecordedValues({ cap }: { cap: ClinicalCapture }) {
  const keys: MeasureKey[] = ["heightM", "weightKg", "waistCm", "bpSys", "bpDia", "pulse"];
  const stateText = { recorded: "", missing: "Missing", not_done: "Not done", declined: "Declined" } as const;
  return (
    <div className="clx-qa">
      {keys.map((k) => {
        const m = cap.measures[k], r = MEASURE_RULES[k];
        return [
          <span key={k + "l"}>{r.label}</span>,
          <span key={k + "v"}>{m.state === "recorded" && m.value != null ? `${m.value} ${r.unit}` : stateText[m.state]} <span className="ph-faint" style={{ fontSize: 11 }}>{m.provenance === "self_reported" ? "self-reported" : "measured"}</span></span>,
        ];
      })}
      <span>Urine (protein, glucose, blood)</span>
      <span>{cap.urine ? `${cap.urine.protein || "Not recorded"}, ${cap.urine.glucose || "Not recorded"}, ${cap.urine.blood || "Not recorded"}` : "Not recorded"}</span>
      <span>Nurse note</span>
      <span style={{ whiteSpace: "pre-wrap" }}>{cap.notes || "None"}</span>
    </div>
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
