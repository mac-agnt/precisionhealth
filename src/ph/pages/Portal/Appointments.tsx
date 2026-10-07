/* Portal appointments (S03): choose a day on the calendar and a 15-minute time, see it summarised,
   then confirm. Confirming needs consent and the questionnaire first; before that, Confirm says
   exactly what is missing. A picked time shows a simulated five-minute hold. After booking: the
   reference, an add-to-calendar file with no clinical detail, the simulated confirmation and the
   24-hour reminder. Reschedule reserves the new time before the old one is released. Taken times
   never show who has them. */
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { act, addHours, fmtDate, fmtDateLong, fmtDateTime, fmtWeekdayDate, fmtWhen, freeSlots, ix, slotGrid, weekdayOf } from "../../model";
import type { Booking, ClinicSession, LocalDate } from "../../model";
import { dispatch, usePhState } from "../../store";
import { Button, Card, DemoTag, EmptyState, Icon, Pill, Select } from "../../ui";
import type { PortalData, PortalView } from "./data";
import { SUPPORT_EMAIL, apptUtc, appointmentMinutes, bookedShortNotice, progressOf, screeningName } from "./data";
import { downloadIcs } from "./calendar";
import type { BookingStep } from "./parts";
import { BookingSteps, KeyValues, ProgrammeBanner } from "./parts";

type Pick = { sessionId: string; start: string };
const HOLD_SECONDS = 300;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function AppointmentsView({ d, go }: { d: PortalData; go: (v: PortalView) => void }) {
  const state = usePhState();
  const [mode, setMode] = useState<"idle" | "reschedule" | "cancel">("idle");
  const [notice, setNotice] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const [justBooked, setJustBooked] = useState<string | null>(null);
  const prog = progressOf(d.membership);
  const past = d.bookings.filter((b) => b !== d.active).slice().reverse();
  // A confirmed booking opens at the top, so the confirmation is the first thing seen.
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (justBooked) rootRef.current?.closest(".pp-stage")?.scrollTo({ top: 0 }); }, [justBooked]);

  // Results are shown inline next to the action, so these dispatches are silent (no duplicate toast).
  const book = (sel: Pick): string | null => {
    const r = dispatch(act.createBooking(d.person.id, sel.sessionId, sel.start), { silent: true });
    if (r.ok) { setJustBooked(r.id || "new"); setNotice(null); return null; }
    return r.message || "That time could not be confirmed. Choose another.";
  };
  const reschedule = (sel: Pick): string | null => {
    if (!d.active) return "There is no appointment to change.";
    const r = dispatch(act.rescheduleBooking(d.active.id, sel.sessionId, sel.start), { silent: true });
    if (r.ok) { setNotice({ tone: "ok", text: r.message || "Your appointment has moved." }); setMode("idle"); setJustBooked(null); return null; }
    return r.message || "That time could not be confirmed. Choose another.";
  };
  const onStep = (s: BookingStep) => { if (s !== "time") go("questionnaire"); };

  return (
    <div className="pp-main" ref={rootRef}>
      {!d.active && !d.attended.length ? (
        <>
          <ProgrammeBanner d={d} compact />
          <BookingSteps progress={prog} current="time" onStep={onStep} />
        </>
      ) : null}
      <div>
        <div className="pp-eyebrow">Appointments</div>
        <h1 className="pp-title">{d.active ? (justBooked ? "You're booked" : "Your appointment") : d.attended.length ? "Your appointment" : "Choose a time that suits you"}</h1>
        <p className="pp-lead">{screeningName(d.programme)} · {d.programme.name}. One appointment per person. Times are Irish time (Europe/Dublin).</p>
      </div>
      {notice ? (
        <div className={"pp-callout " + notice.tone} role="status">
          <Icon name={notice.tone === "ok" ? "check" : "alert"} size={14} style={{ marginTop: 2, color: notice.tone === "ok" ? "var(--ok)" : "var(--warn)" }} />
          <span>{notice.text}</span>
        </div>
      ) : null}

      {d.active ? (
        <>
          <ConfirmationCard d={d} b={d.active} fresh={!!justBooked} mode={mode}
            onReschedule={() => { setMode(mode === "reschedule" ? "idle" : "reschedule"); setNotice(null); }}
            onCancel={() => { setMode(mode === "cancel" ? "idle" : "cancel"); setNotice(null); }} />
          {mode === "reschedule" ? (
            <SlotPicker d={d} current={d.active} confirmLabel="Confirm new time" ready onConfirm={reschedule} go={go}
              intro="Pick a new time. It is reserved before your current time is released, so you never lose your place." />
          ) : null}
          {mode === "cancel" ? <CancelPanel b={d.active} onDone={(text) => { setNotice({ tone: "ok", text }); setMode("idle"); setJustBooked(null); }} onKeep={() => setMode("idle")} /> : null}
        </>
      ) : d.attended.length ? (
        <Card>
          <div className="pp-row" style={{ marginBottom: 8 }}><Pill tone="ok" icon="check">Attended</Pill></div>
          <h2 className="pp-h3">Your screening appointment is done</h2>
          <p className="pp-small" style={{ margin: 0 }}>There is nothing more to book on this programme. Your report appears in My results once a doctor has reviewed and released it.</p>
          <div style={{ marginTop: 12 }}><Button icon="file" onClick={() => go("results")}>My results</Button></div>
        </Card>
      ) : (
        <SlotPicker d={d} current={null} confirmLabel="Confirm appointment" ready={prog.ready} onConfirm={book} go={go}
          intro={prog.ready ? "Choose a day, then a time, then confirm." : "You can look at times now. Confirming opens once your consent and health questions are done."} />
      )}

      {past.length ? (
        <Card>
          <h2 className="pp-h3">Earlier appointments</h2>
          {past.map((b) => <PastRow key={b.id} b={b} />)}
        </Card>
      ) : null}
      <p className="pp-small" style={{ margin: 0 }}>Confirmations and reminders in this preview are simulated. Nothing is sent. A {state.settings.reminderLeadHours}-hour reminder is not created for a booking made inside that window.</p>
    </div>
  );
}

function BeforeYouArrive() {
  return (
    <div className="pp-prep">
      <div className="pp-prep-title">Before you arrive</div>
      <ul>
        <li>Bring a list of your medications.</li>
        <li>Wear a top with sleeves you can roll up.</li>
        <li>You can eat and drink as normal unless we tell you otherwise.</li>
      </ul>
      <div className="pp-small" style={{ marginTop: 6 }}>Sample text for Precision Health to confirm.</div>
    </div>
  );
}

const roomOf = (s: ClinicSession) => (s.siteName.includes(s.room) ? s.siteName.split(", ").slice(-1)[0] : s.room);
const placeOf = (s: ClinicSession) => s.siteName.split(", ")[0];

function ConfirmationCard({ d, b, fresh, mode, onReschedule, onCancel }: { d: PortalData; b: Booking; fresh: boolean; mode: string; onReschedule: () => void; onCancel: () => void }) {
  const state = usePhState();
  const s = ix(state).sessionById.get(b.sessionId)!;
  const confirmation = state.messages.filter((m) => m.bookingId === b.id && m.kind === "confirmation").sort((x, y) => (x.at < y.at ? 1 : -1))[0];
  const reminder = state.messages.find((m) => m.bookingId === b.id && m.kind === "reminder");
  const short = bookedShortNotice(state, b);
  const reminderAt = addHours(apptUtc(state, b), -state.settings.reminderLeadHours);
  const canChange = b.attendance === "booked";
  const minutes = appointmentMinutes(d.programme);
  const [icsNote, setIcsNote] = useState(false);
  const rows: Array<[string, ReactNode]> = [
    ["Location", placeOf(s)],
    ["Room", roomOf(s)],
    ["Screening", screeningName(d.programme)],
    ["Booking reference", <strong key="ref" className="pp-ref">{b.id}</strong>],
  ];
  return (
    <div className="pp-grid pp-grid-main">
      <Card className={fresh ? "pp-confirmed" : undefined}>
        <div className="pp-wrap" style={{ marginBottom: 10 }}>
          <Pill tone="ok" icon="check">Confirmed</Pill>
          {b.replaces ? <Pill tone="neutral" icon="refresh">Rescheduled</Pill> : null}
          <DemoTag>Fictional appointment</DemoTag>
        </div>
        <div className="pp-appt-date">{fmtDateLong(s.date)}</div>
        <div className="pp-row" style={{ alignItems: "baseline", gap: 8, flexWrap: "wrap", marginTop: 2 }}>
          <span className="pp-appt-time">{b.slotStart}</span>
          <span className="pp-small">Europe/Dublin · about {minutes} minutes</span>
        </div>
        <KeyValues rows={rows} />
        <div className="pp-wrap" style={{ marginTop: 12 }}>
          <Button variant="primary" icon="down" onClick={() => { downloadIcs(b, s, minutes, state.clock.nowUtc); setIcsNote(true); }}>Add to calendar (.ics)</Button>
          {canChange ? <Button variant={mode === "reschedule" ? "primary" : "secondary"} icon="refresh" onClick={onReschedule} aria-expanded={mode === "reschedule"}>Change time</Button> : null}
          {canChange ? <Button variant={mode === "cancel" ? "danger" : "ghost"} icon="x" onClick={onCancel} aria-expanded={mode === "cancel"}>Cancel</Button> : null}
        </div>
        <p className="pp-small" style={{ margin: "8px 0 0" }} role={icsNote ? "status" : undefined}>
          {icsNote ? "Calendar file created in your browser. " : ""}The calendar entry says only "Precision Health appointment", with the place, time and your booking reference. No health details.
        </p>
        {!canChange ? <p className="pp-small" style={{ marginBottom: 0 }}>You are checked in. Any change is made at the clinic.</p> : null}
      </Card>
      <div className="pp-grid">
        <Card>
          <h2 className="pp-h3">Confirmation and reminder</h2>
          <ul className="pp-msglist">
            <li>
              <Icon name={confirmation?.channel === "sms" ? "sms" : "mail"} size={14} />
              <span>{confirmation ? <>Confirmation sent by {confirmation.channel === "sms" ? "text" : "email"} to {confirmation.destination}, {fmtDateTime(confirmation.at)}.</> : "Confirmation recorded."} <DemoTag>Simulated</DemoTag></span>
            </li>
            <li>
              <Icon name="clock" size={14} />
              <span>
                {reminder ? (reminder.status === "queued" ? `Reminder due ${fmtWhen(reminder.at, state.clock.nowUtc)}, 24 hours before.` : reminder.status === "cancelled" ? "The reminder for this time was cancelled." : `Reminder sent ${fmtDateTime(reminder.attempts[0]?.at || reminder.at)}.`)
                  : short ? "Booked inside 24 hours, so this confirmation is all you get. No reminder is sent late."
                    : `Reminder planned for ${fmtWhen(reminderAt, state.clock.nowUtc)}, 24 hours before.`}{" "}<DemoTag>Simulated</DemoTag>
              </span>
            </li>
          </ul>
          <p className="pp-small" style={{ margin: "8px 0 0" }}>Pulse confirms by email, and by text where you agreed to texts. This preview records one simulated message on your preferred channel.</p>
        </Card>
        <Card><BeforeYouArrive /></Card>
      </div>
    </div>
  );
}

function CancelPanel({ b, onDone, onKeep }: { b: Booking; onDone: (text: string) => void; onKeep: () => void }) {
  const [reason, setReason] = useState("I can no longer attend");
  const [err, setErr] = useState<string | null>(null);
  return (
    <Card>
      <h2 className="pp-h3">Cancel this appointment?</h2>
      <p className="pp-small" style={{ marginTop: 0 }}>Your time is released for someone else and the planned reminder is cancelled. You can book again while the programme is open, and your answers stay saved.</p>
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
        <span style={{ color: "var(--ink)", fontWeight: 500 }}>{fmtDate(s.date)}, {b.slotStart}</span>
        <span className="pp-small" style={{ display: "block" }}>{status}. {placeOf(s)}. Reference {b.id}.</span>
      </span>
    </div>
  );
}

/* ---- calendar and slots ---- */
function monthGrid(month: string): Array<LocalDate | null> {
  const [y, m] = month.split("-").map(Number);
  const first = `${month}-01`;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (weekdayOf(first) + 6) % 7; // Monday first
  const cells: Array<LocalDate | null> = Array.from({ length: lead }, () => null);
  for (let i = 1; i <= days; i++) cells.push(`${month}-${String(i).padStart(2, "0")}`);
  while (cells.length % 7) cells.push(null);
  return cells;
}

function useHold(pick: Pick | null): number {
  const [left, setLeft] = useState(HOLD_SECONDS);
  useEffect(() => {
    if (!pick) return;
    const start = Date.now();
    setLeft(HOLD_SECONDS);
    const t = window.setInterval(() => setLeft(Math.max(0, HOLD_SECONDS - Math.floor((Date.now() - start) / 1000))), 1000);
    return () => window.clearInterval(t);
  }, [pick?.sessionId, pick?.start]);
  return left;
}

function SlotPicker({ d, current, confirmLabel, ready, onConfirm, intro, go }: { d: PortalData; current: Booking | null; confirmLabel: string; ready: boolean; onConfirm: (p: Pick) => string | null; intro: string; go: (v: PortalView) => void }) {
  const state = usePhState();
  const sites = Array.from(new Set(d.sessions.map((s) => s.siteName)));
  const homeSite = sites.includes(d.person.site) ? d.person.site : sites[0];
  const [site, setSite] = useState<string>(homeSite || "");
  const siteSessions = d.sessions.filter((s) => s.siteName === site);
  const firstOpen = siteSessions.find((s) => freeSlots(state, s.id).length) || siteSessions[0];
  const [sessionId, setSessionId] = useState<string | null>(firstOpen?.id || null);
  const session = siteSessions.find((s) => s.id === sessionId) || firstOpen;
  const [month, setMonth] = useState<string>((session?.date || d.programme.windowStart).slice(0, 7));
  const [pick, setPick] = useState<Pick | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const left = useHold(pick);
  const prog = progressOf(d.membership);
  useEffect(() => { if (pick && left === 0) { setPick(null); setExpired(true); } }, [left, pick]);

  if (!d.sessions.length || !session) return <Card><EmptyState title="No dates open" icon="calendar">No more clinic dates are open for booking on this programme. Email {SUPPORT_EMAIL} if you still need an appointment.</EmptyState></Card>;
  const grid = slotGrid(state, session.id);
  const byDate = new Map(siteSessions.map((s) => [s.date, s]));
  const months = Array.from(new Set(siteSessions.map((s) => s.date.slice(0, 7)))).sort();
  const mi = months.indexOf(month);
  const choose = (start: string) => { setPick({ sessionId: session.id, start }); setErr(null); setExpired(false); };
  const confirm = () => {
    if (!pick) { setErr("Choose a time first."); return; }
    if (!ready) { setBlocked(true); return; }
    const failure = onConfirm(pick);
    if (!failure) setPick(null);
    else setErr(failure);
  };
  const pickedSession = pick ? d.sessions.find((s) => s.id === pick.sessionId) : undefined;
  const pickedSlot = pick && pickedSession ? slotGrid(state, pickedSession.id).find((x) => x.start === pick.start) : undefined;
  const holdText = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  const cells: ReactNode[] = [];
  grid.forEach((sl, i) => {
    const prev = grid[i - 1];
    if (prev && prev.end !== sl.start) cells.push(<div key={"br" + i} className="pp-break">Break {prev.end} to {sl.start}</div>);
    const mine = !!current && sl.booking?.id === current.id;
    const taken = !!sl.booking;
    const selected = pick?.sessionId === session.id && pick.start === sl.start;
    cells.push(
      <button key={sl.start} type="button" className={"pp-slot" + (taken ? " taken" : "")} disabled={taken || sl.isPast} aria-pressed={selected} onClick={() => choose(sl.start)}
        aria-label={`${sl.start} to ${sl.end}${mine ? ", your current time" : taken ? ", taken" : sl.isPast ? ", passed" : selected ? ", selected and held for you" : ", available"}`}>
        <span className="pp-slot-time">{sl.start}</span>
        {mine ? <small>Yours</small> : taken ? <small>Taken</small> : sl.isPast ? <small>Passed</small> : selected ? <small>Held {holdText}</small> : null}
      </button>,
    );
  });
  const free = freeSlots(state, session.id).length;
  const mm = Number(month.slice(5, 7));

  return (
    <div className="pp-grid pp-grid-main">
      <Card>
        <p className="pp-small" style={{ marginTop: 0 }}>{intro}</p>
        <div className="pp-form-grid">
          <div className="pp-field">
            <label className="ph-label" htmlFor="pp-site">Location</label>
            {sites.length > 1 ? (
              <Select id="pp-site" value={site} onChange={(e) => { const v = e.target.value; setSite(v); const first = d.sessions.find((s) => s.siteName === v && freeSlots(state, s.id).length) || d.sessions.find((s) => s.siteName === v); setSessionId(first?.id || null); if (first) setMonth(first.date.slice(0, 7)); setPick(null); }}>
                {sites.map((x) => <option key={x} value={x}>{x}</option>)}
              </Select>
            ) : <div className="pp-static" id="pp-site">{site}</div>}
          </div>
          <div className="pp-field">
            <span className="ph-label">Appointment type</span>
            <div className="pp-static">{screeningName(d.programme)} · {appointmentMinutes(d.programme)} min</div>
          </div>
        </div>
        <div className="pp-cal">
          <div className="pp-cal-head">
            <h2 className="pp-h3" style={{ margin: 0 }} id="pp-cal-title">{MONTHS[mm - 1]} {month.slice(0, 4)}</h2>
            <div className="pp-wrap" style={{ gap: 4 }}>
              <button type="button" className="pp-cal-nav" aria-label="Previous month" disabled={mi <= 0} onClick={() => setMonth(months[mi - 1])}><Icon name="chevronLeft" size={14} /></button>
              <button type="button" className="pp-cal-nav" aria-label="Next month" disabled={mi < 0 || mi >= months.length - 1} onClick={() => setMonth(months[mi + 1])}><Icon name="chevronRight" size={14} /></button>
            </div>
          </div>
          <div className="pp-cal-grid" role="group" aria-labelledby="pp-cal-title">
            {["M", "T", "W", "T", "F", "S", "S"].map((x, i) => <span key={i} className="pp-cal-dow" aria-hidden="true">{x}</span>)}
            {monthGrid(month).map((date, i) => {
              if (!date) return <span key={"e" + i} />;
              const s = byDate.get(date);
              const day = Number(date.slice(8));
              if (!s) return <span key={date} className="pp-cal-day off" aria-hidden="true">{day}</span>;
              const n = freeSlots(state, s.id).length;
              return (
                <button key={date} type="button" className={"pp-cal-day open" + (n ? "" : " full")} aria-pressed={s.id === session.id} disabled={!n && !(current && current.sessionId === s.id)}
                  aria-label={`${fmtDateLong(date)}, ${n ? `${n} times available` : "fully booked"}`} onClick={() => { setSessionId(s.id); setErr(null); }}>
                  {day}
                </button>
              );
            })}
          </div>
          <div className="pp-small pp-cal-legend"><span className="pp-cal-key open" aria-hidden="true" />Outlined dates have clinics. Other dates have none.</div>
        </div>
        <hr className="pp-hr" />
        <div className="pp-row" style={{ flexWrap: "wrap", gap: 6, alignItems: "baseline" }}>
          <h3 className="pp-h3 ph-grow" style={{ margin: 0 }}>{fmtDateLong(session.date).replace(/ \d{4}$/, "")}</h3>
          <span className="pp-small">{free} of {grid.length} times free</span>
        </div>
        <div className="pp-small" style={{ margin: "2px 0 10px" }}>Times shown in Europe/Dublin. {placeOf(session)}, {roomOf(session)}. Taken times never show who has them.</div>
        <div className="pp-slots">{cells}</div>
        {pick && pickedSession ? (
          <div className="pp-picked">
            <Icon name="check" size={13} stroke={2.2} />
            <span><strong>{fmtWeekdayDate(pickedSession.date)}, {pick.start}</strong> selected and held for {holdText} (simulated).</span>
            <button type="button" className="ph-link" onClick={() => { const b = document.getElementById("pp-confirm"); b?.scrollIntoView({ block: "center" }); b?.focus(); }}>Review and confirm</button>
          </div>
        ) : null}
      </Card>

      <div className="pp-grid">
        <Card>
          <h2 className="pp-h3" style={{ fontSize: 15 }}>Your selected appointment</h2>
          {pick && pickedSession && pickedSlot ? (
            <>
              <KeyValues rows={[
                ["Date", fmtWeekdayDate(pickedSession.date) + " " + pickedSession.date.slice(0, 4)],
                ["Time", `${pick.start} to ${pickedSlot.end}`],
                ["Location", `${placeOf(pickedSession)} · ${roomOf(pickedSession)}`],
                ["Programme", d.programme.name],
              ]} />
              <div className="pp-hold" role="timer" aria-live="off">
                <Icon name="clock" size={13} />
                <span><strong>Held for you for {holdText}</strong> <span className="pp-small">Simulated hold. In this preview nobody else is blocked; the live service holds a time for five minutes while you confirm.</span></span>
              </div>
            </>
          ) : (
            <p className="pp-small" style={{ margin: 0 }}>{expired ? "Your five-minute hold ended, so the time was released. Choose a time again." : "No time selected yet. Choose a date, then a time."}</p>
          )}
          <BeforeYouArrive />
          <div style={{ marginTop: 12 }}>
            <Button id="pp-confirm" variant="primary" icon="check" onClick={confirm} className="pp-btn-block" aria-describedby={blocked && !ready ? "pp-blocked" : undefined}>{confirmLabel}</Button>
          </div>
          {err ? <div className="ph-err" role="alert">{err}</div> : null}
          {blocked && !ready ? (
            <div className="pp-callout warn" role="alert" id="pp-blocked" style={{ marginTop: 12 }}>
              <Icon name="alert" size={14} style={{ marginTop: 2, color: "var(--warn)" }} />
              <span>
                <strong style={{ color: "var(--ink)" }}>You can't confirm a time yet.</strong> Consent and your health questions come first, so the nurse has what they need on the day. Still to do:
                <ul style={{ margin: "4px 0 6px", paddingLeft: 18 }}>
                  {!prog.details ? <li>Your details</li> : null}
                  {!prog.consent ? <li>Consent</li> : null}
                  {!prog.submitted ? <li>Health questions: {prog.sectionsDone} of {prog.sectionsTotal} sections saved{prog.sectionsDone >= prog.sectionsTotal ? ", then submit" : ""}</li> : null}
                </ul>
                Your chosen time stays selected while the hold lasts. <button type="button" className="ph-link" onClick={() => go("questionnaire")}>Continue where you left off</button>
              </span>
            </div>
          ) : null}
          <p className="pp-small" style={{ margin: "10px 0 0" }}>
            {current ? "We confirm your new time by email (simulated)." : "We confirm by email and, if you agreed, by text (simulated). You also get a reminder 24 hours before your visit."}
          </p>
        </Card>
        <div className="pp-banner">
          <Icon name="info" size={14} style={{ marginTop: 2 }} />
          <span>Can't find a time that suits you? Email <a className="ph-link" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> and the screening team will help. Changes follow your programme's booking rules.</span>
        </div>
      </div>
    </div>
  );
}

