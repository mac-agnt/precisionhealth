/* The client (HR) side of a date request, inside the client portal preview.
   - ClientDateBanner: the notification at the top of every portal page, in each state: asked, waiting
     for Precision Health, a new date proposed (accept with one click), confirmed, or declined.
   - ClientDatesPage: a simple month calendar of the days Precision Health can do (a nurse free, never
     weekends or bank holidays). HR picks days, morning or full day and a start time, adds the room
     and the contact on site, and sends them. Neil approves in Pulse.
   No names of employees, no results: this is the employer's view. */
import { useState } from "react";
import {
  DAY_SCREEN_LABEL, DR_EXTRA_CHOICES, DR_PART_LABEL, DR_STARTS, PROGRAMME_BY_ID, drDayInfo, drForProgramme, drPickText, fmtDate, fmtDateTime, fmtWeekdayDate, monthOf,
} from "../../model";
import type { DateRequest, DrPart, DrPick, LocalDate, ProgrammeId } from "../../model";
import { dispatch, usePhState } from "../../store";
import { Button, Card, DemoTag, Field, Icon, Segmented, Select, TextInput, Textarea } from "../../ui";
import { MonthPicker } from "./MonthPicker";
import { drAct } from "./actions";
import "./dq.css";

const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;
const shortDate = (d: string) => fmtWeekdayDate(d);
function DateList({ picks, room }: { picks: DrPick[]; room?: string }) {
  return (
    <ul className="dq-dates">
      {picks.map((p) => <li key={p.date}><b>{shortDate(p.date)}</b>{drPickText(p)}{room ? <span>{room}</span> : null}</li>)}
    </ul>
  );
}

export function ClientDateBanner({ programmeId, onOpen }: { programmeId: ProgrammeId; onOpen: () => void }) {
  const s = usePhState();
  const r = drForProgramme(s, programmeId);
  const [msg, setMsg] = useState<string | null>(null);
  if (!r) return null;
  const what = `${plural(r.daysNeeded, `${r.screen === "poc" ? "point of care" : "lab bloods"} day`)} between ${fmtDate(r.from)} and ${fmtDate(r.to)}`;
  if (r.status === "asked") {
    return (
      <section className="dq-banner" role="status" aria-label="Date request from Precision Health">
        <span className="dq-banner-ico"><Icon name="calendar" size={20} /></span>
        <div className="dq-banner-body">
          <h2>Precision Health asks you to suggest dates for your screening</h2>
          <p>We need {what}. Pick the days that suit you from our calendar, then add the room and who will meet our nurse.{r.message ? ` "${r.message}"` : ""}</p>
          <div className="dq-banner-acts"><Button variant="primary" icon="calendar" onClick={onOpen}>Suggest dates</Button></div>
        </div>
      </section>
    );
  }
  if (r.status === "suggested") {
    return (
      <section className="dq-banner t-wait" role="status" aria-label="Your suggested dates">
        <span className="dq-banner-ico"><Icon name="clock" size={20} /></span>
        <div className="dq-banner-body">
          <h2>Waiting for Precision Health to confirm</h2>
          <p>You suggested {plural(r.picks.length, "date")} on {r.suggestedAt ? fmtDate(r.suggestedAt) : "today"}. Dr Neil Reddy confirms them, usually within a working day.</p>
          <DateList picks={r.picks} />
          <div className="dq-banner-acts"><Button size="sm" variant="ghost" icon="eye" onClick={onOpen}>View your request</Button></div>
        </div>
      </section>
    );
  }
  if (r.status === "countered" && r.counter) {
    const accept = () => { const x = dispatch(drAct.acceptCounter(r.id), { silent: true }); setMsg(x.ok ? null : x.message || "That did not work."); };
    const other = () => { const x = dispatch(drAct.rejectCounter(r.id), { silent: true }); if (x.ok) onOpen(); else setMsg(x.message || null); };
    return (
      <section className="dq-banner" role="status" aria-label="New date proposed">
        <span className="dq-banner-ico"><Icon name="spark" size={20} /></span>
        <div className="dq-banner-body">
          <h2>Precision Health proposed {r.counter.picks.length === 1 ? "another date" : "other dates"}</h2>
          <p>{r.counter.note ? `"${r.counter.note}" ` : ""}Accept and the {r.counter.picks.length === 1 ? "day is" : "days are"} booked straight away{r.room ? ` in ${r.room}` : ""}.</p>
          <DateList picks={r.counter.picks} />
          {msg ? <p className="dq-err">{msg}</p> : null}
          <div className="dq-banner-acts">
            <Button variant="primary" icon="check" onClick={accept}>Accept {r.counter.picks.length === 1 ? "this date" : "these dates"}</Button>
            <Button icon="calendar" onClick={other}>Suggest other dates</Button>
          </div>
        </div>
      </section>
    );
  }
  if (r.status === "approved") {
    const days = r.dayIds.map((id) => s.screeningDays.days.find((d) => d.id === id)).filter((d): d is NonNullable<typeof d> => !!d);
    const pub = days.filter((d) => d.status === "published");
    return (
      <section className="dq-banner t-ok" role="status" aria-label="Dates confirmed">
        <span className="dq-banner-ico"><Icon name="check" size={20} /></span>
        <div className="dq-banner-body">
          <h2>{pub.length ? `Confirmed: ${pub.length === 1 ? "your screening day is" : "your screening days are"} booked` : "Approved: Precision Health is finalising your dates"}</h2>
          <p>{pub.length ? "They are listed under Upcoming screening dates with the room. Share the booking link so employees can pick a time." : "They appear here as soon as Precision Health publishes them."}</p>
          {pub.length ? (
            <ul className="dq-dates">{pub.map((d) => <li key={d.id}><b>{shortDate(d.date)}</b>{d.start.replace(/^0/, "")} to {d.end.replace(/^0/, "")}<span>{d.room}</span></li>)}</ul>
          ) : null}
        </div>
      </section>
    );
  }
  return (
    <section className="dq-banner t-bad" role="status" aria-label="Date request declined">
      <span className="dq-banner-ico"><Icon name="info" size={20} /></span>
      <div className="dq-banner-body">
        <h2>Precision Health could not take these dates</h2>
        <p>{r.declineReason} {r.decidedBy ? `(${r.decidedBy})` : ""}</p>
      </div>
    </section>
  );
}

export function ClientDatesPage({ programmeId, onDone }: { programmeId: ProgrammeId; onDone: () => void }) {
  const s = usePhState();
  const r = drForProgramme(s, programmeId);
  if (!r) {
    return (
      <Card>
        <h2 className="pp-h3">No date request open</h2>
        <p className="pp-small">Precision Health asks here when they need dates from you.</p>
        <Button onClick={onDone}>Back to the overview</Button>
      </Card>
    );
  }
  if (r.status !== "asked") return <RequestSummary r={r} onDone={onDone} />;
  return <SuggestForm key={r.id} r={r} onDone={onDone} />;
}

function SuggestForm({ r, onDone }: { r: DateRequest; onDone: () => void }) {
  const s = usePhState();
  const p = PROGRAMME_BY_ID[r.programmeId];
  const lastRoom = s.screeningDays.days.filter((d) => d.programmeId === r.programmeId && d.room.trim()).sort((a, b) => b.date.localeCompare(a.date))[0];
  const t = s.clock.nowUtc.slice(0, 10);
  const minMonth = monthOf(t > r.from ? t : r.from);
  const [month, setMonth] = useState(minMonth);
  const [picks, setPicks] = useState<DrPick[]>([]);
  const [room, setRoom] = useState(lastRoom?.room || "");
  const [who, setWho] = useState(lastRoom?.contactName || "");
  const [phone, setPhone] = useState(lastRoom?.contactPhone || "");
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const max = r.daysNeeded + DR_EXTRA_CHOICES;
  const toggle = (d: LocalDate) => setPicks((xs) => (xs.some((x) => x.date === d) ? xs.filter((x) => x.date !== d) : [...xs, { date: d, part: "full" as DrPart, start: "09:00" }].sort((a, b) => a.date.localeCompare(b.date))));
  const set = (i: number, patch: Partial<DrPick>) => setPicks((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const send = () => {
    const x = dispatch(drAct.suggest(r.id, picks, room, who, phone, notes), { silent: true });
    if (x.ok) { setErr(null); onDone(); } else setErr(x.message || "That did not work.");
  };
  const ready = picks.length > 0 && room.trim().length >= 3 && who.trim().length >= 2;
  return (
    <>
      <div>
        <div className="pp-eyebrow">Screening dates</div>
        <h1 className="pp-title">Suggest dates for your screening</h1>
        <p className="pp-lead">Precision Health needs {plural(r.daysNeeded, "day")} of {DAY_SCREEN_LABEL[r.screen].toLowerCase()} for {p.name}, between {fmtDate(r.from)} and {fmtDate(r.to)}. Green days have a nurse free. Pick {r.daysNeeded === 1 ? "the day that suits you" : `${r.daysNeeded} days`}, plus up to {DR_EXTRA_CHOICES} back-ups if you like.</p>
      </div>
      <div className="dq-suggest">
        <Card>
          <h2 className="dq-step-h"><span className="dq-step-n">1</span>Pick your days</h2>
          <p className="dq-hint" style={{ marginBottom: 12 }}>{picks.length ? `${plural(picks.length, "day")} chosen, up to ${max}.` : "Tap a green day to choose it. Tap it again to remove it."}</p>
          <MonthPicker month={month} setMonth={setMonth} minMonth={minMonth} maxMonth={monthOf(r.to) < minMonth ? minMonth : monthOf(r.to)} info={(d) => drDayInfo(s, d, r)}
            selected={picks.map((x) => x.date)} onPick={toggle} full={picks.length >= max} />
        </Card>
        <div className="pp-col" style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          <Card>
            <h2 className="dq-step-h"><span className="dq-step-n">2</span>Morning or full day</h2>
            {picks.length ? (
              <ul className="dq-picked" style={{ marginTop: 10 }}>
                {picks.map((x, i) => (
                  <li key={x.date}>
                    <div className="dq-picked-top"><b>{shortDate(x.date)}</b><button type="button" className="dq-x" aria-label={`Remove ${shortDate(x.date)}`} onClick={() => toggle(x.date)}><Icon name="x" size={14} /></button></div>
                    <div className="dq-picked-row">
                      <Segmented label={`Part of the day, ${shortDate(x.date)}`} value={x.part} onChange={(v) => set(i, { part: v })} options={(["full", "morning"] as DrPart[]).map((k) => ({ id: k, label: DR_PART_LABEL[k] }))} />
                      <Select aria-label={`Preferred start, ${shortDate(x.date)}`} value={x.start} onChange={(e) => set(i, { start: e.target.value })}>{DR_STARTS.map((v) => <option key={v} value={v}>Start {v.replace(/^0/, "")}</option>)}</Select>
                    </div>
                    <span className="dq-hint">{drPickText(x)}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="dq-hint" style={{ marginTop: 6 }}>Your chosen days appear here.</p>}
          </Card>
          <Card>
            <h2 className="dq-step-h"><span className="dq-step-n">3</span>Room and contact on the day</h2>
            <div className="dq-fields" style={{ marginTop: 10 }}>
              <Field label="Room and location" htmlFor="dq-room"><TextInput id="dq-room" value={room} placeholder="For example: Room 3.01, Building C" onChange={(e) => setRoom(e.target.value)} /></Field>
              <Field label="Who meets our nurse" htmlFor="dq-who"><TextInput id="dq-who" value={who} placeholder="Name" onChange={(e) => setWho(e.target.value)} /></Field>
              <Field label="Their phone (optional)" htmlFor="dq-phone"><TextInput id="dq-phone" value={phone} placeholder="087 555 0142" onChange={(e) => setPhone(e.target.value)} /></Field>
              <Field label="Anything else (optional)" htmlFor="dq-notes"><Textarea id="dq-notes" rows={2} value={notes} placeholder="Parking, access, quiet times" onChange={(e) => setNotes(e.target.value)} /></Field>
            </div>
          </Card>
          {err ? <p className="dq-err" role="alert">{err}</p> : null}
          <div className="pp-wrap" style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <Button variant="primary" icon="send" disabled={!ready} onClick={send}>Send to Precision Health</Button>
            <Button variant="ghost" onClick={onDone}>Not now</Button>
          </div>
          <p className="pp-small" style={{ margin: 0 }}>{ready ? "Nothing is booked until Precision Health confirms." : "Choose at least one day, then add the room and the contact on site."}</p>
        </div>
      </div>
    </>
  );
}

function RequestSummary({ r, onDone }: { r: DateRequest; onDone: () => void }) {
  const p = PROGRAMME_BY_ID[r.programmeId];
  return (
    <>
      <div>
        <div className="pp-eyebrow">Screening dates</div>
        <h1 className="pp-title">Your date request</h1>
        <p className="pp-lead">{p.name}: {plural(r.daysNeeded, "day")} of {DAY_SCREEN_LABEL[r.screen].toLowerCase()} between {fmtDate(r.from)} and {fmtDate(r.to)}.</p>
      </div>
      <Card>
        <h2 className="pp-h3">What you sent</h2>
        <DateList picks={r.picks} />
        <div className="pp-small" style={{ marginTop: 10 }}>Room: <strong style={{ color: "var(--ink)" }}>{r.room || "Not given"}</strong> · Contact on the day: <strong style={{ color: "var(--ink)" }}>{r.siteContactName || "Not given"}{r.siteContactPhone ? `, ${r.siteContactPhone}` : ""}</strong></div>
        {r.notes ? <div className="pp-small" style={{ marginTop: 4 }}>Note: {r.notes}</div> : null}
      </Card>
      <Card>
        <h2 className="pp-h3">What happened</h2>
        <ol className="dq-log">
          {r.log.slice().reverse().map((e, i) => <li key={i}><small>{fmtDateTime(e.at)} · {e.side === "client" ? e.by : "Precision Health"}</small>{e.side === "client" ? e.text : e.kind === "asked" ? `Asked you for ${plural(r.daysNeeded, "day")} between ${fmtDate(r.from)} and ${fmtDate(r.to)}.` : e.kind === "approved" ? "Confirmed your dates." : e.kind === "countered" ? "Proposed another date." : `Could not take these dates: ${r.declineReason}`}</li>)}
        </ol>
      </Card>
      <div><Button onClick={onDone}>Back to the overview</Button> <DemoTag>Simulated</DemoTag></div>
    </>
  );
}
