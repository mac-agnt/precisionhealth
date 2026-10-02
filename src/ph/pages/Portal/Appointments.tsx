/* Portal appointments: choose an available slot, confirm, reschedule or cancel. A slot can be
   confirmed only after the questionnaire and required consent are complete; before that,
   Confirm explains what is missing. Reschedule reserves the new time before the old one is
   released. Breaks and taken slots are never bookable. Other people are never shown. */
import { useState } from "react";
import type { ReactNode } from "react";
import { act, addHours, fmtDate, fmtDateLong, fmtDateTime, fmtWeekdayDate, fmtWhen, freeSlots, ix, slotGrid } from "../../model";
import type { Booking } from "../../model";
import { dispatch, usePhState } from "../../store";
import { Button, Card, DemoTag, EmptyState, Icon, Pill, Select } from "../../ui";
import type { PortalData, PortalView } from "./data";
import { apptUtc, bookedShortNotice, requirements } from "./data";
import { SECTIONS } from "./questions";

type Pick = { sessionId: string; start: string };

export function AppointmentsView({ d, go }: { d: PortalData; go: (v: PortalView) => void }) {
  const state = usePhState();
  const [mode, setMode] = useState<"idle" | "reschedule" | "cancel">("idle");
  const [notice, setNotice] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const req = requirements(d.membership);
  const past = d.bookings.filter((b) => b !== d.active).slice().reverse();
  const attendedHere = d.attended.length > 0;

  // Results are shown inline next to the action, so these dispatches are silent (no duplicate toast).
  const book = (sel: Pick): string | null => {
    const r = dispatch(act.createBooking(d.person.id, sel.sessionId, sel.start), { silent: true });
    if (r.ok) { setNotice({ tone: "ok", text: r.message || "Booked." }); return null; }
    return r.message || "That time could not be confirmed.";
  };
  const reschedule = (sel: Pick): string | null => {
    if (!d.active) return "There is no appointment to change.";
    const r = dispatch(act.rescheduleBooking(d.active.id, sel.sessionId, sel.start), { silent: true });
    if (r.ok) { setNotice({ tone: "ok", text: r.message || "Rescheduled." }); setMode("idle"); return null; }
    return r.message || "That time could not be confirmed.";
  };

  return (
    <div className="pp-main">
      <div>
        <h1 className="pp-title">Appointments</h1>
        <p className="pp-lead">{d.programme.name}. One appointment per programme. Times shown are Dublin time.</p>
      </div>
      {notice ? (
        <div className={"pp-callout " + notice.tone} role="status">
          <Icon name={notice.tone === "ok" ? "check" : "alert"} size={14} style={{ marginTop: 2, color: notice.tone === "ok" ? "var(--ok)" : "var(--warn)" }} />
          <span>{notice.text}</span>
        </div>
      ) : null}

      {d.active ? (
        <>
          <ActiveCard b={d.active} onReschedule={() => { setMode(mode === "reschedule" ? "idle" : "reschedule"); setNotice(null); }} onCancel={() => { setMode(mode === "cancel" ? "idle" : "cancel"); setNotice(null); }} mode={mode} />
          {mode === "reschedule" ? (
            <SlotPicker d={d} current={d.active} confirmLabel="Confirm new time" ready onConfirm={reschedule}
              intro="Pick a new time. It is reserved before your current time is released, so you never lose your place." />
          ) : null}
          {mode === "cancel" ? <CancelPanel b={d.active} onDone={(text) => { setNotice({ tone: "ok", text }); setMode("idle"); }} onKeep={() => setMode("idle")} /> : null}
        </>
      ) : attendedHere ? (
        <Card>
          <div className="pp-row" style={{ marginBottom: 8 }}><Pill tone="ok" icon="check">Attended</Pill></div>
          <h2 className="pp-h3">Your screening appointment is complete</h2>
          <p className="pp-small" style={{ margin: 0 }}>There is nothing more to book for this programme. Your report appears in My Results once a clinician has released it.</p>
          <div style={{ marginTop: 12 }}><Button icon="file" onClick={() => go("results")}>My Results</Button></div>
        </Card>
      ) : (
        <>
          <RequirementsCard d={d} go={go} />
          <SlotPicker d={d} current={null} confirmLabel="Confirm appointment" ready={req.ready} onConfirm={book} go={go}
            intro={req.ready ? "Choose a day and a time, then confirm." : "You can look at available times now. Confirming needs the questionnaire and consent first."} />
        </>
      )}

      {past.length ? (
        <Card>
          <h2 className="pp-h3">Earlier appointments</h2>
          {past.map((b) => <PastRow key={b.id} b={b} />)}
        </Card>
      ) : null}
      <p className="pp-small" style={{ margin: 0 }}>Confirmations and reminders in this preview are simulated. Nothing is sent. {state.settings.reminderLeadHours}-hour reminders are not created for bookings made inside that window.</p>
    </div>
  );
}

function RequirementsCard({ d, go }: { d: PortalData; go: (v: PortalView) => void }) {
  const req = requirements(d.membership);
  const items = [
    { done: req.questionnaire, title: "Health questionnaire", text: req.questionnaire ? "Complete." : `${req.sectionsDone} of ${SECTIONS.length} sections saved.` },
    { done: req.consent, title: "Required consent choices", text: req.consent ? "Recorded." : "Not recorded yet. They are recorded when you submit the questionnaire." },
  ];
  return (
    <Card>
      <h2 className="pp-h3">Before you can confirm</h2>
      <ol className="pp-steps">
        {items.map((it, i) => (
          <li key={it.title} className={"pp-step" + (it.done ? " done" : "")}>
            <span className="pp-step-dot">{it.done ? <Icon name="check" size={13} stroke={2.2} /> : i + 1}</span>
            <span><span className="pp-step-title">{it.title}</span><span className="pp-small" style={{ display: "block" }}>{it.text}</span></span>
          </li>
        ))}
      </ol>
      {!req.ready ? <div style={{ marginTop: 12 }}><Button variant="primary" icon="edit" onClick={() => go("questionnaire")}>Continue questionnaire</Button></div> : null}
    </Card>
  );
}

function ActiveCard({ b, onReschedule, onCancel, mode }: { b: Booking; onReschedule: () => void; onCancel: () => void; mode: string }) {
  const state = usePhState();
  const I = ix(state);
  const s = I.sessionById.get(b.sessionId)!;
  const confirmation = state.messages.filter((m) => m.bookingId === b.id && m.kind === "confirmation").sort((x, y) => (x.at < y.at ? 1 : -1))[0];
  const reminder = state.messages.find((m) => m.bookingId === b.id && m.kind === "reminder");
  const short = bookedShortNotice(state, b);
  const reminderAt = addHours(apptUtc(state, b), -state.settings.reminderLeadHours);
  const canChange = b.attendance === "booked";
  return (
    <Card>
      <div className="pp-row" style={{ marginBottom: 10, flexWrap: "wrap" }}>
        <Pill tone="brand" icon="calendar">Confirmed</Pill>
        {b.replaces ? <Pill tone="neutral" icon="refresh">Rescheduled</Pill> : null}
        <DemoTag>Fictional appointment</DemoTag>
      </div>
      <div style={{ fontSize: 18, fontWeight: 600, color: "var(--ink)", lineHeight: 1.3 }}>{fmtDateLong(s.date)}, {b.slotStart}</div>
      <div className="pp-small" style={{ marginTop: 4 }}>{s.siteName}. About 15 minutes. Reference <strong style={{ color: "var(--ink)" }}>{b.id}</strong>.</div>
      <hr className="pp-hr" />
      <ul className="pp-small" style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
        <li>{confirmation ? `Confirmation sent ${fmtDateTime(confirmation.at)} by ${confirmation.channel === "sms" ? "SMS" : "email"} (simulated).` : "Confirmation recorded."}</li>
        <li>
          {reminder ? `Reminder sent ${fmtDateTime(reminder.attempts[0]?.at || reminder.at)} (simulated).`
            : short ? "Booked inside 24 hours, so one confirmation was sent now and no reminder will be sent. No reminder is back-dated."
              : `A reminder is planned for ${fmtWhen(reminderAt, state.clock.nowUtc)} (simulated).`}
        </li>
      </ul>
      {canChange ? (
        <div className="pp-wrap" style={{ marginTop: 14 }}>
          <Button variant={mode === "reschedule" ? "primary" : "secondary"} icon="refresh" onClick={onReschedule}>Change time</Button>
          <Button variant={mode === "cancel" ? "danger" : "ghost"} icon="x" onClick={onCancel}>Cancel appointment</Button>
        </div>
      ) : <p className="pp-small" style={{ marginBottom: 0 }}>You are checked in. Changes are made at the clinic.</p>}
    </Card>
  );
}

function CancelPanel({ b, onDone, onKeep }: { b: Booking; onDone: (text: string) => void; onKeep: () => void }) {
  const [reason, setReason] = useState("I can no longer attend");
  const [err, setErr] = useState<string | null>(null);
  return (
    <Card>
      <h2 className="pp-h3">Cancel this appointment?</h2>
      <p className="pp-small" style={{ marginTop: 0 }}>Your time is released for someone else, and any planned reminder for it is cancelled. You can book again while the programme is open.</p>
      <label className="ph-label" htmlFor="pp-cancel-reason">Reason</label>
      <Select id="pp-cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} style={{ maxWidth: 320 }}>
        <option>I can no longer attend</option>
        <option>I will choose another date later</option>
        <option>Other reason</option>
      </Select>
      <div className="pp-wrap" style={{ marginTop: 14 }}>
        <Button variant="danger" icon="x" onClick={() => { const r = dispatch(act.cancelBooking(b.id, reason), { silent: true }); if (r.ok) onDone(r.message || "Cancelled."); else setErr(r.message || "This appointment could not be cancelled."); }}>Confirm cancellation</Button>
        <Button onClick={onKeep}>Keep the appointment</Button>
      </div>
      {err ? <div className="ph-err" role="alert">{err}</div> : null}
    </Card>
  );
}

function PastRow({ b }: { b: Booking }) {
  const state = usePhState();
  const s = ix(state).sessionById.get(b.sessionId)!;
  const status = b.status === "cancelled" ? (b.replacedBy ? "Moved to a new time" : "Cancelled") : b.attendance === "completed" ? "Attended" : "Confirmed";
  return (
    <div className="pp-msg">
      <span className="pp-msg-icon"><Icon name={b.status === "cancelled" ? "x" : "check"} size={13} /></span>
      <span>
        <span style={{ color: "var(--ink)", fontWeight: 500 }}>{fmtWeekdayDate(s.date)} {fmtDate(s.date).slice(-4)}, {b.slotStart}</span>
        <span className="pp-small" style={{ display: "block" }}>{status}. {s.siteName}. Reference {b.id}.</span>
      </span>
    </div>
  );
}

function SlotPicker({ d, current, confirmLabel, ready, onConfirm, intro, go }: { d: PortalData; current: Booking | null; confirmLabel: string; ready: boolean; onConfirm: (p: Pick) => string | null; intro: string; go?: (v: PortalView) => void }) {
  const state = usePhState();
  const [sessionId, setSessionId] = useState<string | null>(d.sessions[0]?.id || null);
  const [pick, setPick] = useState<Pick | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const req = requirements(d.membership);
  if (!d.sessions.length) return <Card><EmptyState title="No dates open" icon="calendar">No more clinic dates are open for booking on this programme.</EmptyState></Card>;
  const session = d.sessions.find((s) => s.id === sessionId) || d.sessions[0];
  const grid = slotGrid(state, session.id);
  const choose = (start: string) => { setPick({ sessionId: session.id, start }); setErr(null); };
  const confirm = () => {
    if (!ready) { setBlocked(true); return; }
    if (!pick) { setErr("Choose a time first."); return; }
    const failure = onConfirm(pick);
    if (!failure) setPick(null);
    else setErr(failure);
  };
  const pickedSession = pick ? d.sessions.find((s) => s.id === pick.sessionId) : undefined;
  const cells: ReactNode[] = [];
  grid.forEach((sl, i) => {
    const prev = grid[i - 1];
    if (prev && prev.end !== sl.start) cells.push(<div key={"br" + i} className="pp-break">Break {prev.end} to {sl.start}, not bookable</div>);
    const mine = !!current && sl.booking?.id === current.id;
    const taken = !!sl.booking;
    const selected = pick?.sessionId === session.id && pick.start === sl.start;
    cells.push(
      <button key={sl.start} type="button" className="pp-slot" disabled={taken || sl.isPast} aria-pressed={selected} onClick={() => choose(sl.start)}
        aria-label={`${sl.start}${mine ? ", your current time" : taken ? ", taken" : sl.isPast ? ", passed" : ", available"}`}>
        {sl.start}
        {mine ? <small>Yours</small> : taken ? <small>Taken</small> : sl.isPast ? <small>Passed</small> : null}
      </button>,
    );
  });
  return (
    <Card>
      <h2 className="pp-h3">{current ? "Choose a new time" : "Available times"}</h2>
      <p className="pp-small" style={{ marginTop: 0 }}>{intro}</p>
      <div className="pp-days" role="group" aria-label="Clinic dates">
        {d.sessions.map((s) => {
          const free = freeSlots(state, s.id).length;
          return (
            <button key={s.id} type="button" className="pp-day" aria-pressed={s.id === session.id} onClick={() => { setSessionId(s.id); }}>
              <span style={{ fontWeight: 600, color: "var(--ink)" }}>{fmtWeekdayDate(s.date)}</span>
              <span className="pp-small">{free} available</span>
            </button>
          );
        })}
      </div>
      <div className="pp-small" style={{ margin: "12px 0 8px" }}>{session.siteName}. Taken times are not available and never show who has them.</div>
      <div className="pp-slots">{cells}</div>
      <hr className="pp-hr" />
      <div className="pp-wrap" style={{ alignItems: "center" }}>
        <span className="ph-grow" style={{ minWidth: 180, color: pick ? "var(--ink)" : "var(--faint)", fontSize: 13 }}>
          {pick && pickedSession ? <>Selected: <strong>{fmtWeekdayDate(pickedSession.date)} at {pick.start}</strong>, {pickedSession.siteName}</> : "No time selected."}
        </span>
        <Button variant="primary" icon="check" onClick={confirm}>{confirmLabel}</Button>
      </div>
      {err ? <div className="ph-err" role="alert">{err}</div> : null}
      {blocked && !ready ? (
        <div className="pp-callout warn" role="alert" style={{ marginTop: 12 }}>
          <Icon name="alert" size={14} style={{ marginTop: 2, color: "var(--warn)" }} />
          <span>
            <strong style={{ color: "var(--ink)" }}>You cannot confirm an appointment yet.</strong> Still needed:
            <ul style={{ margin: "4px 0 6px", paddingLeft: 18 }}>
              {!req.questionnaire ? <li>The health questionnaire: {req.sectionsDone} of {SECTIONS.length} sections saved.</li> : null}
              {!req.consent ? <li>The two required consent choices, recorded when you submit the questionnaire.</li> : null}
            </ul>
            The time you picked is not held. {go ? <button type="button" className="ph-link" onClick={() => go("questionnaire")}>Continue the questionnaire</button> : null}
          </span>
        </div>
      ) : null}
    </Card>
  );
}
