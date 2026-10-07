/* Portal overview (S02): the next step, the appointment, the screening journey as it really
   stands, the participant's own messages and the privacy promise. Messages never contain results. */
import { fmtDate, fmtDateLong, fmtDateTime, fmtWeekdayDate, ix } from "../../model";
import type { MessageKind, PhState } from "../../model";
import { usePhState } from "../../store";
import { Button, Card, DemoTag, Icon, Pill } from "../../ui";
import type { GlyphName } from "../../ui";
import type { PortalData, PortalView } from "./data";
import { SUPPORT_EMAIL, appointmentMinutes, participantVersions, progressOf, screeningName } from "./data";
import { downloadIcs } from "./calendar";
import { KeyValues, UrgentCareCard } from "./parts";

const KIND: Record<MessageKind, { label: string; icon: GlyphName }> = {
  confirmation: { label: "Appointment confirmation", icon: "calendar" },
  reminder: { label: "Appointment reminder", icon: "clock" },
  report_available: { label: "Report available notice", icon: "file" },
  invitation: { label: "Invitation", icon: "mail" },
};

interface NextStep { title: string; text: string; action: string; view: PortalView; hint?: string }
function nextStep(state: PhState, d: PortalData): NextStep {
  const I = ix(state);
  const prog = progressOf(d.membership);
  if (d.active) {
    const s = I.sessionById.get(d.active.sessionId)!;
    return { title: `You're booked for ${fmtWeekdayDate(s.date)} at ${d.active.slotStart}.`, text: "Bring a list of your medications and wear a top with sleeves you can roll up. You can change or cancel the time if you need to.", action: "Manage appointment", view: "appointments" };
  }
  const ep = d.episodes[0];
  if (ep) {
    const rel = participantVersions(state, ep.id).filter((v) => v.status === "released").pop();
    if (rel) return { title: "Your report is ready.", text: `A doctor reviewed it and released version ${rel.version} on ${fmtDate(rel.releasedAt || rel.createdAt)}. Take it to your GP if your doctor's advice says so.`, action: "View my report", view: "results" };
    return { title: "Your report is with the doctor.", text: "A doctor reviews every report individually before you see it. We will message you when it is ready. The message never contains results.", action: "My results", view: "results" };
  }
  if (prog.ready) return { title: "Now pick a time that suits you.", text: "Your consent and health questions are done. Choose a day and a 15-minute time.", action: "Choose a time", view: "appointments" };
  const started = prog.details || prog.sectionsDone > 0;
  return {
    title: "A little preparation. A more useful appointment.",
    text: "Confirm your details, read the consent and answer a few health questions. Then pick a time. You can save your answers and come back whenever you need.",
    action: started ? "Continue where you left off" : "Start", view: "questionnaire", hint: "About 8 to 10 minutes",
  };
}

export function OverviewView({ d, go }: { d: PortalData; go: (v: PortalView) => void }) {
  const state = usePhState();
  const I = ix(state);
  const prog = progressOf(d.membership);
  const next = nextStep(state, d);
  const activeSession = d.active ? I.sessionById.get(d.active.sessionId) : undefined;
  const attendedSession = d.attended.length ? I.sessionById.get(d.attended[d.attended.length - 1].sessionId) : undefined;
  const released = d.episodes.some((e) => participantVersions(state, e.id).some((v) => v.status === "released"));
  const booked = !!d.active || d.attended.length > 0;
  // Order follows Precision Health's rule: the questionnaire and consent come before a booking is confirmed.
  type J = { title: string; text: string; state: "done" | "current" | "later"; label: string };
  const journey: J[] = [
    { title: "Health questionnaire", text: prog.submitted ? "Done, with your consent" : `${(prog.details ? 1 : 0) + (prog.consent ? 1 : 0) + prog.sectionsDone} of ${prog.sectionsTotal + 2} parts saved`, state: prog.submitted ? "done" : "current", label: prog.submitted ? "Complete" : "To do" },
    { title: "Appointment booked", text: d.active && activeSession ? `${fmtWeekdayDate(activeSession.date)} at ${d.active.slotStart}` : booked ? "Booked" : prog.submitted ? "Choose a time" : "After the questionnaire", state: booked ? "done" : prog.submitted ? "current" : "later", label: booked ? "Complete" : prog.submitted ? "To do" : "Later" },
    { title: "Attend screening", text: attendedSession ? `Attended ${fmtDate(attendedSession.date)}` : d.active ? "Upcoming" : "Not booked yet", state: attendedSession ? "done" : d.active ? "current" : "later", label: attendedSession ? "Complete" : d.active ? "Upcoming" : "Later" },
    { title: "View results", text: released ? "Your report is ready" : attendedSession ? "With the doctor now" : "After the doctor's review", state: released ? "done" : attendedSession ? "current" : "later", label: released ? "Ready" : "After review" },
  ];
  const minutes = appointmentMinutes(d.programme);
  return (
    <div className="pp-main">
      <div className="pp-row" style={{ flexWrap: "wrap", alignItems: "flex-end", gap: 8 }}>
        <div className="ph-grow" style={{ minWidth: 0 }}>
          <div className="pp-eyebrow">Your screening</div>
          <h1 className="pp-display-sm">Hello, {d.person.given}</h1>
          <p className="pp-lead">Everything you need for your health screening, in one place.</p>
        </div>
        <span className="pp-tag">{d.programme.name}</span>
      </div>
      <div className="pp-grid pp-grid-main">
        <div className="pp-grid">
          <section className="pp-next">
            <div className="pp-eyebrow">Your next step</div>
            <h2 className="pp-next-title">{next.title}</h2>
            <p>{next.text}</p>
            <div className="pp-wrap">
              <Button variant="primary" icon="arrow" onClick={() => go(next.view)}>{next.action}</Button>
              {next.hint ? <span className="pp-small">{next.hint}</span> : null}
            </div>
          </section>
          <Card>
            <h2 className="pp-h3" style={{ fontSize: 15 }}>Your screening journey</h2>
            <ol className="pp-journey">
              {journey.map((j, i) => (
                <li key={j.title} className={"pp-jstep " + j.state}>
                  <span className="pp-jstep-label">{String(i + 1).padStart(2, "0")} · {j.label}</span>
                  <span className="pp-jstep-title">{j.title}</span>
                  <span className="pp-jstep-text">{j.text}</span>
                </li>
              ))}
            </ol>
            <p className="pp-small" style={{ margin: "12px 0 0" }}>We will let you know when your doctor-reviewed report is ready. Results never appear before that review.</p>
          </Card>
          <Card>
            <div className="pp-row" style={{ marginBottom: 4, flexWrap: "wrap" }}><h2 className="pp-h3 ph-grow" style={{ margin: 0 }}>Messages</h2><DemoTag>Simulated</DemoTag></div>
            {d.messages.length ? d.messages.slice(0, 5).map((m) => (
              <div key={m.id} className="pp-msg">
                <span className="pp-msg-icon"><Icon name={KIND[m.kind].icon} size={13} /></span>
                <span>
                  <span style={{ color: "var(--ink)", fontWeight: 500, display: "block" }}>{m.subject}</span>
                  <span className="pp-small">{KIND[m.kind].label}, {fmtDateTime(m.at)}, by {m.channel === "sms" ? "text" : "email"}</span>
                </span>
              </div>
            )) : <p className="pp-small" style={{ margin: "6px 0 0" }}>No messages yet.</p>}
            <p className="pp-small" style={{ margin: "8px 0 0" }}>Messages never contain results. A message saying your report is ready is not the same as opening it.</p>
          </Card>
        </div>
        <div className="pp-grid">
          {d.active && activeSession ? (
            <Card>
              <div className="pp-row" style={{ marginBottom: 8 }}><h2 className="pp-h3 ph-grow" style={{ margin: 0, fontSize: 15 }}>Your appointment</h2><Pill tone="ok" icon="check">Confirmed</Pill></div>
              <div style={{ color: "var(--ink)", fontWeight: 600 }}>{fmtDateLong(activeSession.date)}</div>
              <div className="pp-row" style={{ alignItems: "baseline", gap: 8, marginTop: 2, flexWrap: "wrap" }}>
                <span className="pp-appt-time">{d.active.slotStart}</span>
                <span className="pp-small">Europe/Dublin · about {minutes} minutes</span>
              </div>
              <KeyValues rows={[["Location", activeSession.siteName.split(", ")[0]], ["Room", activeSession.siteName.includes(activeSession.room) ? activeSession.siteName.split(", ").slice(-1)[0] : activeSession.room], ["Screening", screeningName(d.programme)], ["Reference", d.active.id]]} />
              <div className="pp-wrap" style={{ marginTop: 12 }}>
                <Button icon="calendar" onClick={() => go("appointments")}>Manage appointment</Button>
                <Button icon="down" onClick={() => downloadIcs(d.active!, activeSession, minutes, state.clock.nowUtc)}>Calendar</Button>
              </div>
            </Card>
          ) : null}
          <Card>
            <h2 className="pp-h3" style={{ fontSize: 15 }}>Your information stays personal</h2>
            <p className="pp-small" style={{ margin: 0 }}>Only you and authorised care staff can see your report. Your employer cannot view your results. {d.programme.clientName} gets only grouped, anonymised figures at the end of the programme.</p>
          </Card>
          <Card>
            <h2 className="pp-h3">Need help?</h2>
            <p className="pp-small" style={{ margin: 0 }}>Questions about booking or your report: <a className="ph-link" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. Nothing you do in this preview is sent anywhere.</p>
          </Card>
          <UrgentCareCard />
        </div>
      </div>
    </div>
  );
}
