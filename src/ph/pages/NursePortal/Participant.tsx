/* One participant in the nurse portal: arrival and check-in, the nurse form while they are with
   the nurse, and the read-only record with what the automations created once completed. */
import { useState } from "react";
import type { ReactNode } from "react";
import { act, ageOn, fmtDateTime, ix } from "../../model";
import { dispatch, usePhState } from "../../store";
import { Button, Icon, Pill } from "../../ui";
import type { ApptRow } from "../Clinics/selectors";
import { checkInRule } from "../Clinics/selectors";
import { ApptPill } from "../Clinics/shared";
import { AutomationReceipt, NurseCapture, NurseFormReadOnly } from "../Clinics/NurseForm";
import { SpecimenLabelPreview } from "../Clinics/LabelPreview";
import { prefillFor } from "../Clinics/captureForm";

export function ParticipantView({ row, rows, onSelect, onBack, onCompleted, onOpenTask, receipt }: {
  row: ApptRow; rows: ApptRow[]; onSelect: (bookingId: string) => void; onBack: () => void; onCompleted: (bookingId: string) => void; onOpenTask: (taskId: string) => void; receipt?: ReactNode;
}) {
  const i = rows.findIndex((r) => r.booking.id === row.booking.id);
  const prev = i > 0 ? rows[i - 1] : null;
  const next = i >= 0 && i < rows.length - 1 ? rows[i + 1] : null;
  const qOk = row.membership?.questionnaire === "complete" && row.membership?.consent === "complete";
  const identityOk = !!row.draft && row.draft.identity.every((x) => x.confirmed);
  return (
    <>
      {receipt}
      <div className="np-card">
        <div className="np-phead">
          <div className="ph-grow" style={{ minWidth: 220 }}>
            <div className="ph-wrap" style={{ gap: 6, marginBottom: 6 }}>
              <ApptPill status={row.status} />
              <Pill tone={qOk ? "ok" : "warn"} icon={qOk ? "check" : "alert"} title={qOk ? `Submitted ${fmtDateTime(row.booking.questionnaireCompletedAt)}` : undefined}>{qOk ? "Pre-visit questionnaire submitted" : "Questionnaire not submitted"}</Pill>
            </div>
            <h2>{row.person.given} {row.person.family}</h2>
            <div className="ph-dim" style={{ fontSize: 12.5, marginTop: 3 }}>
              {row.booking.slotStart} to {row.slotEnd}. Booking <span className="ph-mono">{row.booking.id}</span>. {identityOk || row.status === "completed" ? `Age ${ageOn(row.person.dob, row.session.date)}.` : "Date of birth shown after the identity check."}
            </div>
          </div>
          <div className="np-steps">
            <Button variant="ghost" icon="list" onClick={onBack}>My clinic</Button>
            <Button variant="ghost" icon="chevronLeft" disabled={!prev} onClick={() => prev && onSelect(prev.booking.id)} aria-label="Previous participant"
              title={prev ? `${prev.booking.slotStart} ${prev.person.given} ${prev.person.family}` : "First appointment"}>{prev ? prev.booking.slotStart : "Previous"}</Button>
            <Button variant="ghost" disabled={!next} onClick={() => next && onSelect(next.booking.id)} aria-label="Next participant"
              title={next ? `${next.booking.slotStart} ${next.person.given} ${next.person.family}` : "Last appointment"}>{next ? next.booking.slotStart : "Next"}<Icon name="chevronRight" size={14} /></Button>
          </div>
        </div>
      </div>
      {row.status === "completed" && row.episode ? (
        <>
          <AutomationReceipt episode={row.episode} onOpenTask={onOpenTask} title={`Completed. ${row.person.given} ${row.person.family} is awaiting results`} />
          <div className="np-card">
            <h3 className="ph-h2" style={{ marginBottom: 10 }}>Specimen label</h3>
            <SpecimenLabelPreview row={row} episode={row.episode} />
          </div>
          <div className="np-card">
            <h3 className="ph-h2" style={{ marginBottom: 10 }}>Nurse form as recorded</h3>
            <NurseFormReadOnly episode={row.episode} />
          </div>
        </>
      ) : row.draft && (row.status === "checked_in" || row.status === "in_progress") ? (
        <NurseCapture key={row.booking.id + ":" + (row.draft.checkedInAt || "")} row={row} draft={row.draft} variant="portal" onCompleted={onCompleted} onOpenTask={onOpenTask} />
      ) : row.status === "not_arrived" || row.status === "upcoming" ? (
        <Arrival row={row} />
      ) : (
        <div className="np-card"><div className="ph-dim" style={{ fontSize: 13 }}>{row.status === "cancelled" ? "This appointment was cancelled or rescheduled." : "Recorded as did not attend."}</div></div>
      )}
    </>
  );
}

function Arrival({ row }: { row: ApptRow }) {
  const state = usePhState();
  const [msg, setMsg] = useState<string | null>(null);
  const rule = checkInRule(state, row.session);
  const prefill = prefillFor(state, row);
  const fromQ = Object.keys(prefill).filter((k) => prefill[k] !== null && prefill[k] !== undefined).length;
  const nurse = ix(state).staffById.get(row.session.nurseId);
  const checkIn = () => { const r = dispatch(act.checkIn(row.booking.id)); setMsg(r.ok ? null : r.message || "Not checked in."); };
  return (
    <div className="np-card">
      <div className="ph-row-flex" style={{ alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
        <span className="nf-id-ico" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}><Icon name="user" size={16} /></span>
        <div className="ph-grow" style={{ minWidth: 220 }}>
          <h3 className="ph-h2">Waiting to arrive{row.slotPassed ? ". The slot time has passed" : ""}</h3>
          <ul className="np-mini" style={{ marginTop: 10 }}>
            <li><Icon name="check" size={13} /><span>Check in when the participant arrives. The nurse form opens with {fromQ} answers carried over from the booking and the pre-visit questionnaire for you to confirm.</span></li>
            <li><Icon name="shield" size={13} /><span>Then confirm identity with two identifiers, date of birth and booking reference, before anything clinical.</span></li>
            <li><Icon name="clock" size={13} /><span>The form saves as you go. Completing never releases a report.</span></li>
          </ul>
          {msg ? <div className="clx-banner warn" style={{ marginTop: 10 }}><Icon name="alert" size={14} style={{ color: "var(--warn)", marginTop: 2 }} /><span>{msg}</span></div> : null}
          {!rule.ok ? <div className="ph-faint" style={{ fontSize: 12, marginTop: 10 }}>{rule.reason}</div> : null}
        </div>
        <Button variant="primary" icon="user" className="nf-big" style={{ width: "auto", minWidth: 180 }} disabled={!rule.ok} onClick={checkIn}>Check in</Button>
      </div>
      <div className="ph-faint" style={{ fontSize: 11.5, marginTop: 12 }}>Screening clinician on the form: {nurse ? nurse.name : "the clinic nurse"}. Walk-in is recorded on the form itself.</div>
    </div>
  );
}
