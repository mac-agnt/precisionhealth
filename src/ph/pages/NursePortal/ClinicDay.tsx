/* "My clinic today": the session header, the day's counts and the appointment list with the
   right action per row (Check in, Continue, View). Breaks are listed as in a clinic day sheet.
   Nobody becomes Did not arrive on their own: the clinician gives each appointment an outcome
   (Check in, Did not arrive or Cancelled), and the End of Day form waits until all have one. */
import { useState } from "react";
import type { ReactNode } from "react";
import type { ClinicSession } from "../../model";
import { PROGRAMME_BY_ID, act, fmtDateLong, fmtDateTime, fmtTime, hhmmToMinutes, sessionUsesPoc, staffName } from "../../model";
import { dispatch, usePhState } from "../../store";
import { Button, Icon, Pill } from "../../ui";
import type { GlyphName } from "../../ui";
import type { ApptRow } from "../Clinics/selectors";
import { checkInRule, placeLabel } from "../Clinics/selectors";
import { ApptPill } from "../Clinics/shared";
import { clinicCounts, clinicRows, nextOpen } from "./data";
import { ResultsPill } from "./results";

type Filter = "all" | "arrive" | "in" | "done";
type Item = { kind: "appt"; time: string; r: ApptRow } | { kind: "break"; time: string; end: string };

export function ClinicDay({ session, onOpen, receipt, onOpenEpisode }: { session: ClinicSession; onOpen: (bookingId: string) => void; receipt?: ReactNode; onOpenEpisode?: (episodeId: string) => void }) {
  const state = usePhState();
  const [filter, setFilter] = useState<Filter>("all");
  const [msg, setMsg] = useState<string | null>(null);
  const rows = clinicRows(state, session);
  const c = clinicCounts(state, session);
  const programme = PROGRAMME_BY_ID[session.programmeId];
  const poc = sessionUsesPoc(session);
  const sameDay = rows.filter((r) => r.episode && r.episode.reportState === "ready_for_review" && r.episode.capture?.variant === "poc").length;
  const now = fmtTime(state.clock.nowUtc);
  const upNext = nextOpen(rows.filter((r) => !r.slotPassed || r.status === "checked_in" || r.status === "in_progress"), null);
  const done = (r: ApptRow) => r.status === "completed" || r.status === "no_show" || r.status === "cancelled";
  const inFilter = (f: Filter, r: ApptRow) => f === "all" ? true : f === "arrive" ? r.status === "not_arrived" || r.status === "upcoming" : f === "in" ? r.status === "checked_in" || r.status === "in_progress" : done(r);
  const match = (r: ApptRow) => inFilter(filter, r);
  const items: Item[] = [
    ...rows.filter(match).map((r): Item => ({ kind: "appt", time: r.booking.slotStart, r })),
    ...(filter === "all" ? session.breaks.map((b): Item => ({ kind: "break", time: b.start, end: b.end })) : []),
  ].sort((a, b) => (a.time !== b.time ? (a.time < b.time ? -1 : 1) : a.kind === "break" ? 1 : -1));
  const count = (f: Filter) => rows.filter((r) => inFilter(f, r)).length;

  const checkIn = (r: ApptRow) => {
    const res = dispatch(act.checkIn(r.booking.id));
    if (res.ok) { setMsg(null); onOpen(r.booking.id); } else setMsg(res.message || "Not checked in.");
  };
  const action = (r: ApptRow) => {
    if (r.status === "not_arrived" || r.status === "upcoming") {
      return <OutcomeActions r={r} primary={upNext?.booking.id === r.booking.id} onCheckIn={() => checkIn(r)} onMsg={setMsg} />;
    }
    if (r.status === "checked_in" || r.status === "in_progress") return <Button variant="primary" icon="edit" onClick={() => onOpen(r.booking.id)}>Continue</Button>;
    if (r.status === "no_show") return <UndoDna r={r} onMsg={setMsg} />;
    if (r.status === "cancelled") return <span className="ph-faint" style={{ fontSize: 12 }}>Slot freed</span>;
    return <Button icon="eye" onClick={() => onOpen(r.booking.id)}>View</Button>;
  };
  /* Three tiles, each a filter on the list below. Referrals, ECG reviews and specimens show as one line only when there are any. */
  const counts: Array<{ id: Filter; label: string; value: number; sub: string; icon: GlyphName }> = [
    { id: "arrive", label: "To arrive", value: count("arrive"), sub: `${c.booked} booked today`, icon: "calendar" },
    { id: "in", label: "With me", value: count("in"), sub: c.inProgress ? `${c.inProgress} with the form open` : "Checked in", icon: "user" },
    { id: "done", label: "Done", value: count("done"), sub: c.didNotAttend || c.cancelled ? `${c.completed} seen, ${c.didNotAttend} did not arrive, ${c.cancelled} cancelled` : poc ? (sameDay ? `${sameDay} ready for same-day release` : "Results measured here") : "Bloods go to the lab", icon: "check" },
  ];
  const extras = [
    c.referrals || c.referralsPending ? `${c.referrals + c.referralsPending} doctor ${c.referrals + c.referralsPending === 1 ? "referral" : "referrals"}` : null,
    c.ecgReviews || c.ecgPending ? `${c.ecgReviews + c.ecgPending} ECG ${c.ecgReviews + c.ecgPending === 1 ? "review" : "reviews"}` : null,
    !poc && c.specimens ? `${c.specimens} ${c.specimens === 1 ? "specimen" : "specimens"} for the courier` : null,
  ].filter(Boolean) as string[];

  return (
    <>
      {receipt}
      <div className="np-card">
        <div className="np-sess">
          <div className="ph-grow" style={{ minWidth: 220 }}>
            <div className="ph-eyebrow">{fmtDateLong(session.date)}</div>
            <h1 className="np-title" style={{ marginTop: 4 }}>{programme ? programme.name : session.programmeId}</h1>
            <p className="np-lead">{placeLabel(session)}. As of {now}.</p>
          </div>
          <div className="ph-wrap" style={{ gap: 6 }}>
            {poc ? <Pill tone="brand" icon="flask">Point of care, same-day results</Pill> : <Pill tone="neutral" icon="flask">Laboratory bloods</Pill>}
            <Pill tone="brand" icon="clock">{session.start} to {session.end}</Pill>
          </div>
        </div>
        <dl className="np-kv">
          <div><dt>Site</dt><dd>{session.siteName}</dd></div>
          <div><dt>Room</dt><dd>{session.room}</dd></div>
          <div><dt>Clinic hours</dt><dd>{session.start} to {session.end}, {session.slotMinutes}-minute slots</dd></div>
          <div><dt>Breaks</dt><dd>{session.breaks.length ? session.breaks.map((b) => `${b.start} to ${b.end}`).join(", ") : "None"}</dd></div>
          <div><dt>Nurse</dt><dd>{staffName(state, session.nurseId)}{session.supportIds.length ? `, support ${session.supportIds.map((id) => staffName(state, id)).join(", ")}` : ""}</dd></div>
        </dl>
      </div>

      <div className="np-counts np-counts-3">
        {counts.map((k) => (
          <button key={k.label} type="button" className="np-count" aria-pressed={filter === k.id} onClick={() => setFilter(filter === k.id ? "all" : k.id)} title="Show these in the list">
            <div className="np-count-label"><Icon name={k.icon} size={12} />{k.label}</div>
            <div className="np-count-value">{k.value}</div>
            <div className="np-count-sub">{k.sub}</div>
          </button>
        ))}
      </div>
      {extras.length ? <div className="ph-dim" style={{ fontSize: 12.5, margin: "-4px 2px 0" }}>Raised today: {extras.join(", ")}.</div> : null}

      <div className="np-card" style={{ padding: 0 }}>
        <div className="ph-row-flex" style={{ padding: "12px 14px", flexWrap: "wrap", gap: 8 }}>
          <h2 className="ph-h2 ph-grow" style={{ minWidth: 160 }}>Appointments</h2>
          <div className="np-filters" role="group" aria-label="Show appointments">
            {([["all", "All"], ["arrive", "To arrive"], ["in", "Checked in"], ["done", "Done"]] as Array<[Filter, string]>).map(([id, label]) => (
              <button key={id} type="button" className="np-filter" aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}<span className="ph-num">{count(id)}</span></button>
            ))}
          </div>
        </div>
        {msg ? <div className="clx-banner warn" style={{ margin: "0 14px 10px" }}><Icon name="alert" size={14} style={{ color: "var(--warn)", marginTop: 2 }} /><span>{msg}</span></div> : null}
        <div className="np-list" role="table" aria-label="Appointments in this clinic">
          <div className="np-row head" role="row">
            <span role="columnheader">Time</span><span role="columnheader">Participant</span><span role="columnheader" className="np-col-q">Questionnaire</span><span role="columnheader">Attendance</span><span role="columnheader" className="np-act">Action</span>
          </div>
          {items.length ? items.map((it) => {
            if (it.kind === "break") {
              return (
                <div key={"b" + it.time} className="np-row brk" role="row">
                  <span className="np-time" role="cell">{it.time}<small>to {it.end}</small></span>
                  <span role="cell">Scheduled break, {hhmmToMinutes(it.end) - hhmmToMinutes(it.time)} minutes. Not bookable.</span>
                  <span role="cell" className="np-col-q" /><span role="cell" /><span role="cell" className="np-act" />
                </div>
              );
            }
            const r = it.r;
            const qOk = r.membership?.questionnaire === "complete" && r.membership?.consent === "complete";
            const isNext = upNext?.booking.id === r.booking.id;
            return (
              <div key={r.booking.id} className={"np-row" + (isNext ? " next" : "")} role="row">
                <span className="np-time" role="cell">{r.booking.slotStart}<small>to {r.slotEnd}</small></span>
                <span className="np-who" role="cell">
                  <b>{r.person.given} {r.person.family}{isNext ? <Pill tone="info" icon="arrow" style={{ marginLeft: 8, verticalAlign: 1 }}>Next</Pill> : null}</b>
                  <span className="np-q-inline"><Pill tone={qOk ? "ok" : "warn"} icon={qOk ? "check" : "alert"}>{qOk ? "Questionnaire submitted" : "Questionnaire to complete"}</Pill></span>
                </span>
                <span className="np-col-q" role="cell">
                  <Pill tone={qOk ? "ok" : "warn"} icon={qOk ? "check" : "alert"} title={qOk ? `Pre-visit questionnaire submitted ${fmtDateTime(r.booking.questionnaireCompletedAt)}` : "Questionnaire or consent incomplete"}>{qOk ? "Submitted" : "To complete"}</Pill>
                </span>
                <span className="np-col-att" role="cell">
                  <ApptPill status={r.status} />
                  {r.status === "completed" && r.episode ? <span style={{ display: "block", marginTop: 4 }}><ResultsPill episode={r.episode} /></span> : null}
                  {r.status === "not_arrived" && r.slotPassed ? <span className="ph-faint" style={{ display: "block", fontSize: 11, marginTop: 3 }}>Slot time passed. Choose an outcome.</span> : null}
                </span>
                <span className="np-act" role="cell">{action(r)}</span>
              </div>
            );
          }) : <div className="ph-dim" style={{ padding: "18px 14px", fontSize: 13 }}>No appointments match this filter.</div>}
        </div>
      </div>
    </>
  );
}

/** The clinician's outcome for someone not seen yet: Check in, Did not arrive or Cancelled. Cancelled asks once more. */
export function OutcomeActions({ r, primary, onCheckIn, onMsg }: { r: ApptRow; primary: boolean; onCheckIn: () => void; onMsg: (m: string | null) => void }) {
  const state = usePhState();
  const [sure, setSure] = useState(false);
  const rule = checkInRule(state, r.session);
  const record = (outcome: "did_not_arrive" | "cancelled") => {
    const res = dispatch(act.recordOutcome(r.booking.id, outcome));
    onMsg(res.ok ? null : res.message || "Outcome not recorded.");
    setSure(false);
  };
  return (
    <span className="np-outcome">
      <Button variant={primary ? "primary" : "secondary"} icon="user" disabled={!rule.ok} title={rule.ok ? "Record arrival and open the nurse form" : rule.reason} onClick={onCheckIn}>Check in</Button>
      {r.status === "not_arrived" ? (
        <span className="np-outcome-alt" role="group" aria-label={`Other outcomes for ${r.person.given} ${r.person.family}`}>
          <button type="button" className="np-outcome-btn" disabled={!rule.ok} title={rule.ok ? "They did not come to the appointment" : rule.reason} onClick={() => record("did_not_arrive")}>Did not arrive</button>
          <button type="button" className={"np-outcome-btn" + (sure ? " sure" : "")} disabled={!rule.ok} title={rule.ok ? "Cancelled on the day. The slot is freed." : rule.reason}
            onClick={() => (sure ? record("cancelled") : setSure(true))} onBlur={() => setSure(false)}>{sure ? "Confirm cancel" : "Cancelled"}</button>
        </span>
      ) : null}
    </span>
  );
}

/** Undo a Did not arrive, for someone who turns up late. They can then be checked in. */
export function UndoDna({ r, onMsg }: { r: ApptRow; onMsg: (m: string | null) => void }) {
  const state = usePhState();
  const rule = checkInRule(state, r.session);
  const undo = () => { const res = dispatch(act.recordOutcome(r.booking.id, "booked")); onMsg(res.ok ? null : res.message || "Not changed."); };
  return <Button variant="ghost" icon="refresh" disabled={!rule.ok} title={rule.ok ? "Arrived late? Undo, then check them in." : rule.reason} onClick={undo}>Undo</Button>;
}
