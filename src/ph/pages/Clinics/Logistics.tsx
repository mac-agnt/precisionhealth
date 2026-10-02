/* Logistics-only appointment detail for administrators and for staff outside the clinic's
   clinical team: time, participant, questionnaire status, attendance, contact preference and
   simulated messages. No answers, measurements, specimens or results. */
import { useState } from "react";
import { act, fmtDateLong, fmtDateTime, fmtWeekdayDate, sessionStats, staffName } from "../../model";
import { dispatch, usePersona, usePhState } from "../../store";
import { useNav } from "../../nav-context";
import { Button, Card, CardHeader, DemoTag, Field, Icon, Pill, RestrictedNotice, Select, TextInput } from "../../ui";
import type { ApptRow } from "./selectors";
import { bookedInside24h, bookingMessages, checkInRule, moveTargets, placeLabel } from "./selectors";
import { APPT_META, ApptPill, ClxModal, ProgTag } from "./shared";
import { CancelledView } from "./Workspace";

const maskEmail = (e: string) => e.replace(/^(.)[^@]*/, "$1***");
const KIND_LABEL: Record<string, string> = { confirmation: "Confirmation", reminder: "Reminder", report_available: "Report available", invitation: "Invitation" };

export function LogisticsView({ row }: { row: ApptRow }) {
  const state = usePhState();
  const p = usePersona();
  const nav = useNav();
  const { person, booking: b, session: s, programme, membership } = row;
  const rule = checkInRule(state, s);
  const [moveOpen, setMoveOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const canManage = p.perms.has("bookings.manage");
  const msgs = bookingMessages(state, b.id);
  const pref = membership?.contactPreference || "email";
  const dest = pref === "sms" ? person.phone : maskEmail(person.email);
  const manageReason = canManage ? (b.attendance !== "booked" ? "Only appointments that have not started can be moved or cancelled." : "") : `${p.name} (${p.roleLabel}) cannot change bookings. Programme Operations can.`;
  const why = !p.perms.has("clinical.view")
    ? `${p.name} (${p.roleLabel}) sees logistics only: time, participant, questionnaire status, attendance and contact preference. Questionnaire answers, measurements, specimens and results are not shown.`
    : `${p.name} is not assigned to this clinic, so clinical details are limited to your own assigned clinics. Logistics are shown.`;

  if (row.status === "cancelled") return <><CancelledView row={row} /><RestrictedNotice title="Logistics view">{why}</RestrictedNotice></>;

  return (
    <>
      <Card>
        <div className="ph-row-flex" style={{ alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div className="ph-grow" style={{ minWidth: 240 }}>
            <div className="ph-wrap" style={{ gap: 8, marginBottom: 6 }}>
              <ProgTag code={programme.code} />
              <ApptPill status={row.status} />
              <Pill tone="neutral" icon="lock">Logistics view</Pill>
            </div>
            <h1 className="ph-h1" style={{ fontSize: 20 }}>{person.given} {person.family}</h1>
            <div className="ph-dim" style={{ fontSize: 12.5, marginTop: 3 }}>{fmtDateLong(s.date)}, {b.slotStart} to {row.slotEnd}. {placeLabel(s)}</div>
          </div>
          <div className="ph-wrap" style={{ justifyContent: "flex-end" }}>
            {row.status === "not_arrived" || row.status === "upcoming" ? (
              <Button variant="primary" icon="user" disabled={!rule.ok} title={rule.ok ? "Record arrival" : rule.reason} onClick={() => dispatch(act.checkIn(b.id))}>Check in</Button>
            ) : null}
            <Button icon="calendar" disabled={!!manageReason} title={manageReason || "Move to another free slot on this programme"} onClick={() => setMoveOpen(true)}>Move</Button>
            <Button variant="danger" icon="x" disabled={!!manageReason} title={manageReason || "Cancel this appointment"} onClick={() => setCancelOpen(true)}>Cancel</Button>
          </div>
        </div>
        {!rule.ok && (row.status === "not_arrived" || row.status === "upcoming") ? <div className="ph-faint" style={{ fontSize: 11.5, marginTop: 8 }}>{rule.reason}</div> : null}
      </Card>

      <div className="clx-split">
        <div className="ph-stack">
          <Card>
            <CardHeader title="Appointment" />
            <dl className="clx-kv" style={{ margin: 0 }}>
              <div><dt>Time</dt><dd>{b.slotStart} to {row.slotEnd}</dd></div>
              <div><dt>Date</dt><dd>{fmtDateLong(s.date)}</dd></div>
              <div><dt>Session</dt><dd className="ph-mono">{s.id}</dd></div>
              <div><dt>Room and site</dt><dd>{placeLabel(s)}</dd></div>
              <div><dt>Nurse</dt><dd>{staffName(state, s.nurseId)}</dd></div>
              <div><dt>Booking</dt><dd className="ph-mono">{b.id}</dd></div>
              <div><dt>Booked</dt><dd>{fmtDateTime(b.createdAt)}, via {b.createdVia === "portal" ? "the portal" : "staff"}</dd></div>
              <div><dt>Attendance</dt><dd>{APPT_META[row.status].label}</dd></div>
            </dl>
          </Card>
          <Card>
            <CardHeader title="Messages for this appointment" sub="Simulated delivery records. Message text never carries clinical details." right={<DemoTag>Simulated</DemoTag>} />
            {msgs.length ? (
              <ul className="clx-list" style={{ gap: 10 }}>
                {msgs.map((m) => {
                  const last = m.attempts[m.attempts.length - 1];
                  return (
                    <li key={m.id} className="clx-li">
                      <span className="clx-li-ico" style={{ background: m.status === "failed" ? "var(--bad-soft)" : "var(--track)", color: m.status === "failed" ? "var(--bad)" : "var(--dim)" }}><Icon name={m.channel === "sms" ? "sms" : "mail"} size={12} /></span>
                      <span className="clx-li-body">
                        <span style={{ color: "var(--ink)" }}>{KIND_LABEL[m.kind] || m.kind}, {m.channel === "sms" ? "SMS" : "email"} to {m.destination}</span>
                        <span className="clx-li-sub">{fmtDateTime(m.at)}. {m.attempts.length} attempt{m.attempts.length === 1 ? "" : "s"}{m.status === "failed" && last?.reason ? `. Last failure: ${last.reason}` : ""}.</span>
                      </span>
                      {m.status === "delivered" ? <Pill tone="ok" icon="check">Delivered</Pill> : m.status === "failed" ? <Pill tone="bad" icon="x">Failed</Pill> : <Pill tone="neutral" icon="clock">{m.status === "queued" ? "Queued" : "Cancelled"}</Pill>}
                      <Button size="sm" variant="ghost" onClick={() => nav.go({ page: "Participants", tab: "communications", params: { message: m.id } })}>Open</Button>
                    </li>
                  );
                })}
              </ul>
            ) : <div className="ph-faint" style={{ fontSize: 12.5 }}>No messages for this booking.</div>}
            {!msgs.some((m) => m.kind === "reminder") && bookedInside24h(b, s) ? <div className="ph-faint" style={{ fontSize: 11.5, marginTop: 10 }}>Booked inside 24 hours of the appointment: one confirmation, no reminder.</div> : null}
          </Card>
        </div>
        <div className="ph-stack">
          <Card>
            <CardHeader title="Participant" />
            <dl className="clx-kv" style={{ margin: 0, gridTemplateColumns: "minmax(0, 1fr)" }}>
              <div><dt>Participant ID</dt><dd className="ph-mono">{person.id}</dd></div>
              <div><dt>Programme</dt><dd>{programme.name}</dd></div>
              <div><dt>Contact preference</dt><dd>{pref === "sms" ? "SMS" : "Email"} to {dest} (verified, masked)</dd></div>
              <div><dt>Questionnaire and consent</dt><dd><Pill tone={membership?.questionnaire === "complete" ? "ok" : "warn"} icon={membership?.questionnaire === "complete" ? "check" : "alert"}>{membership?.questionnaire === "complete" ? "Complete" : "Incomplete"}</Pill> <span className="ph-faint" style={{ fontSize: 11.5 }}>Consent {b.consentVersion}, before booking. Answers are clinical and not shown here.</span></dd></div>
            </dl>
          </Card>
          <RestrictedNotice title="What this view leaves out">{why}</RestrictedNotice>
        </div>
      </div>

      <MoveModal open={moveOpen} onClose={() => setMoveOpen(false)} row={row} />
      <CancelModal open={cancelOpen} onClose={() => setCancelOpen(false)} row={row} />
    </>
  );
}

function MoveModal({ open, onClose, row }: { open: boolean; onClose: () => void; row: ApptRow }) {
  const state = usePhState();
  const nav = useNav();
  const targets = moveTargets(state, row.booking);
  const [sessionId, setSessionId] = useState("");
  const [slot, setSlot] = useState("");
  if (!open) return null;
  const sel = targets.find((t) => t.session.id === (sessionId || targets[0]?.session.id));
  const chosenSlot = sel?.free.find((x) => x.start === slot) ? slot : sel?.free[0]?.start || "";
  const confirm = () => {
    if (!sel || !chosenSlot) return;
    const r = dispatch(act.rescheduleBooking(row.booking.id, sel.session.id, chosenSlot));
    if (r.ok && r.id) { onClose(); nav.setParams({ ...nav.params, booking: r.id }); }
  };
  return (
    <ClxModal open={open} onClose={onClose} title="Move to another slot" width={520}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Keep current slot</Button>
        <Button variant="primary" icon="check" disabled={!sel || !chosenSlot} onClick={confirm}>Confirm move</Button>
      </>}>
      <div className="ph-stack" style={{ gap: 12, fontSize: 12.5, color: "var(--body)" }}>
        <div>The new slot is reserved before the current one is released, so the participant always holds one active appointment. A simulated confirmation is sent.</div>
        {targets.length ? (
          <>
            <Field label="Clinic">
              <Select value={sel?.session.id || ""} onChange={(e) => { setSessionId(e.target.value); setSlot(""); }}>
                {targets.map((t) => <option key={t.session.id} value={t.session.id}>{fmtWeekdayDate(t.session.date)}, {sessionStats(state, t.session.id).programme.code}, {placeLabel(t.session)} ({t.free.length} free)</option>)}
              </Select>
            </Field>
            <Field label="Free slot" help="Breaks and times that have passed are not offered.">
              <Select value={chosenSlot} onChange={(e) => setSlot(e.target.value)}>
                {(sel?.free || []).map((x) => <option key={x.start} value={x.start}>{x.start} to {x.end}</option>)}
              </Select>
            </Field>
          </>
        ) : <div className="clx-banner warn"><Icon name="alert" size={14} style={{ color: "var(--warn)", marginTop: 2 }} /><span>No free slots remain on this programme.</span></div>}
      </div>
    </ClxModal>
  );
}

function CancelModal({ open, onClose, row }: { open: boolean; onClose: () => void; row: ApptRow }) {
  const [reason, setReason] = useState("Participant request");
  const [note, setNote] = useState("");
  if (!open) return null;
  const text = note.trim() ? `${reason}: ${note.trim()}` : reason;
  const confirm = () => { const r = dispatch(act.cancelBooking(row.booking.id, text)); if (r.ok) onClose(); };
  return (
    <ClxModal open={open} onClose={onClose} title="Cancel this appointment?" width={500}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Keep appointment</Button>
        <Button variant="danger" icon="x" onClick={confirm}>Cancel appointment</Button>
      </>}>
      <div className="ph-stack" style={{ gap: 12, fontSize: 12.5, color: "var(--body)" }}>
        <div>{row.person.given} {row.person.family}, {fmtWeekdayDate(row.session.date)} at {row.booking.slotStart}. The slot becomes available again, capacity updates everywhere and future simulated reminder jobs are cancelled. The booking record is kept as cancelled.</div>
        <Field label="Reason">
          <Select value={reason} onChange={(e) => setReason(e.target.value)}>
            {["Participant request", "Participant unwell", "Duplicate booking", "Other"].map((r) => <option key={r} value={r}>{r}</option>)}
          </Select>
        </Field>
        <Field label="Note (optional)" help="Logistics only. Do not record health details here.">
          <TextInput value={note} maxLength={160} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </ClxModal>
  );
}
