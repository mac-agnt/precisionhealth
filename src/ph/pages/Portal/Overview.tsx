/* Portal overview: the next step, onboarding progress, the participant's own messages and
   programme details. Messages never contain results. */
import { APPOINTMENT_TYPES, fmtDate, fmtDateLong, fmtDateTime, fmtWeekdayDate, greetingFor, ix } from "../../model";
import type { MessageKind, PhState } from "../../model";
import { usePhState } from "../../store";
import { Button, Card, DemoTag, Icon, Pill } from "../../ui";
import type { GlyphName, Tone } from "../../ui";
import type { PortalData, PortalView } from "./data";
import { participantVersions, requirements } from "./data";
import { SECTIONS } from "./questions";

const KIND: Record<MessageKind, { label: string; icon: GlyphName }> = {
  confirmation: { label: "Appointment confirmation", icon: "calendar" },
  reminder: { label: "Appointment reminder", icon: "clock" },
  report_available: { label: "Report notice", icon: "file" },
  invitation: { label: "Invitation", icon: "mail" },
};

interface NextStep { tone: Tone; pill: string; title: string; text: string; action: string; view: PortalView }
function nextStep(state: PhState, d: PortalData): NextStep {
  const I = ix(state);
  const req = requirements(d.membership);
  if (d.active) {
    const s = I.sessionById.get(d.active.sessionId)!;
    return { tone: "brand", pill: "Booked", title: `Your appointment is on ${fmtWeekdayDate(s.date)} at ${d.active.slotStart}`, text: `${s.siteName}. Reference ${d.active.id}. You can change or cancel it if you need to.`, action: "Manage appointment", view: "appointments" };
  }
  const ep = d.episodes[0];
  if (ep) {
    const rel = participantVersions(state, ep.id).filter((v) => v.status === "released").pop();
    if (rel) return { tone: "ok", pill: "Report ready", title: "Your report is ready to view", text: `Version ${rel.version}, released ${fmtDate(rel.releasedAt || rel.createdAt)}. Opening it is recorded separately from the message we sent.`, action: "Open My Results", view: "results" };
    return { tone: "info", pill: "In review", title: "Your report is being reviewed", text: "A clinician reviews every report individually before it is released. We will send you a message when it is ready.", action: "My Results", view: "results" };
  }
  if (req.ready) return { tone: "info", pill: "Ready to book", title: "Choose your appointment", text: "Your questionnaire and consent are complete. Pick a time that suits you.", action: "See available times", view: "appointments" };
  return { tone: "info", pill: "To do", title: "Finish your health questionnaire", text: `${req.sectionsDone} of ${SECTIONS.length} sections saved. Booking opens once it and the required consent choices are complete.`, action: req.sectionsDone ? "Continue questionnaire" : "Start questionnaire", view: "questionnaire" };
}

export function OverviewView({ d, go }: { d: PortalData; go: (v: PortalView) => void }) {
  const state = usePhState();
  const I = ix(state);
  const req = requirements(d.membership);
  const next = nextStep(state, d);
  const at = APPOINTMENT_TYPES.find((x) => x.id === d.programme.appointmentTypeId);
  const activeSession = d.active ? I.sessionById.get(d.active.sessionId) : undefined;
  const attendedSession = d.attended.length ? I.sessionById.get(d.attended[d.attended.length - 1].sessionId) : undefined;
  const released = d.episodes.some((e) => participantVersions(state, e.id).some((v) => v.status === "released"));
  // The journey follows the rules of this demo: questionnaire and consent come before a booking.
  type J = { title: string; text: string; state: "done" | "current" | "later" };
  const journey: J[] = [
    { title: "Health questionnaire and consent", text: req.ready ? "Complete" : `${req.sectionsDone} of ${SECTIONS.length} sections saved`, state: req.ready ? "done" : "current" },
    { title: "Book your appointment", text: d.active && activeSession ? `${fmtWeekdayDate(activeSession.date)} at ${d.active.slotStart}` : d.attended.length ? "Booked" : req.ready ? "Choose a time" : "After the questionnaire", state: d.active || d.attended.length ? "done" : req.ready ? "current" : "later" },
    { title: "Attend screening", text: attendedSession ? `Attended ${fmtDate(attendedSession.date)}` : d.active ? "Upcoming" : "Not booked yet", state: attendedSession ? "done" : d.active ? "current" : "later" },
    { title: "View results", text: released ? "Your report is ready" : "After clinician review", state: released ? "done" : attendedSession ? "current" : "later" },
  ];
  const jLabel = (j: J) => (j.state === "done" ? (j.title === "View results" ? "Ready" : "Complete") : j.state === "current" ? (j.title === "View results" ? "In review" : j.title === "Attend screening" ? "Upcoming" : "To do") : j.title === "View results" ? "After review" : "Later");
  return (
    <div className="pp-main">
      <div>
        <h1 className="pp-title">{greetingFor(state.clock.nowUtc)}, {d.person.given}.</h1>
        <p className="pp-lead">{d.programme.name}. Everything here is about you only.</p>
      </div>
      <div className="pp-grid pp-grid-main">
        <div className="pp-grid">
          <Card>
            <div className="pp-row" style={{ marginBottom: 8, flexWrap: "wrap" }}>
              <span className="ph-eyebrow">Your next step</span>
              <Pill tone={next.tone}>{next.pill}</Pill>
            </div>
            <h2 className="pp-h3" style={{ fontSize: 16 }}>{next.title}</h2>
            <p className="pp-small" style={{ marginTop: 0 }}>{next.text}</p>
            <div className="pp-wrap">
              <Button variant="primary" icon="arrow" onClick={() => go(next.view)}>{next.action}</Button>
              {next.view === "questionnaire" ? <span className="pp-small">About 5 to 8 minutes</span> : null}
            </div>
          </Card>
          <Card>
            <h2 className="pp-h3">Your screening journey</h2>
            <ol className="pp-journey">
              {journey.map((j, i) => (
                <li key={j.title} className={"pp-jstep " + j.state}>
                  <span className="pp-jstep-label">{String(i + 1).padStart(2, "0")} {jLabel(j)}</span>
                  <span className="pp-jstep-title">{j.title}</span>
                  <span className="pp-jstep-text">{j.text}</span>
                </li>
              ))}
            </ol>
            <p className="pp-small" style={{ margin: "12px 0 0" }}>We will let you know when your clinician-reviewed report is ready. Results will not appear before review.</p>
          </Card>
          <Card>
            <div className="pp-row" style={{ marginBottom: 4, flexWrap: "wrap" }}><h2 className="pp-h3" style={{ margin: 0 }}>Messages</h2><DemoTag>Simulated</DemoTag></div>
            {d.messages.length ? d.messages.slice(0, 5).map((m) => (
              <div key={m.id} className="pp-msg">
                <span className="pp-msg-icon"><Icon name={KIND[m.kind].icon} size={13} /></span>
                <span>
                  <span style={{ color: "var(--ink)", fontWeight: 500, display: "block" }}>{m.subject}</span>
                  <span className="pp-small">{KIND[m.kind].label}, {fmtDateTime(m.at)}, by {m.channel === "sms" ? "SMS" : "email"}</span>
                </span>
              </div>
            )) : <p className="pp-small" style={{ margin: "6px 0 0" }}>No messages yet.</p>}
            <p className="pp-small" style={{ margin: "8px 0 0" }}>Messages never contain results. A message saying your report is ready is not the same as opening the report.</p>
          </Card>
        </div>
        <div className="pp-grid">
          {d.active && activeSession ? (
            <Card>
              <div className="pp-row" style={{ marginBottom: 8 }}><h2 className="pp-h3 ph-grow" style={{ margin: 0 }}>Your appointment</h2><Pill tone="brand" icon="calendar">Confirmed</Pill></div>
              <div style={{ color: "var(--ink)", fontWeight: 600 }}>{fmtDateLong(activeSession.date)}</div>
              <div className="pp-row" style={{ alignItems: "baseline", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                <span style={{ fontSize: 24, color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>{d.active.slotStart}</span>
                <span className="pp-small">Europe/Dublin, about {at?.minutes || 15} minutes</span>
              </div>
              <dl style={{ margin: "10px 0 12px", display: "grid", gridTemplateColumns: "minmax(80px, auto) minmax(0, 1fr)", gap: "6px 12px", fontSize: 12.5 }}>
                <div style={{ display: "contents" }}><dt className="pp-small" style={{ margin: 0 }}>Location</dt><dd style={{ margin: 0, color: "var(--ink)" }}>{activeSession.siteName}</dd></div>
                <div style={{ display: "contents" }}><dt className="pp-small" style={{ margin: 0 }}>Room</dt><dd style={{ margin: 0, color: "var(--ink)" }}>{activeSession.room}</dd></div>
                <div style={{ display: "contents" }}><dt className="pp-small" style={{ margin: 0 }}>Screening</dt><dd style={{ margin: 0, color: "var(--ink)" }}>{at?.name || "Screening appointment"}</dd></div>
              </dl>
              <Button icon="calendar" onClick={() => go("appointments")}>Manage appointment</Button>
            </Card>
          ) : null}
          <Card>
            <h2 className="pp-h3">Your programme</h2>
            <ul className="pp-small" style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
              <li>{d.programme.name}, {fmtDate(d.programme.windowStart)} to {fmtDate(d.programme.windowEnd)}.</li>
              <li>{at ? `${at.name}, about ${at.minutes} minutes.` : "Screening appointment."}</li>
              <li>{d.programme.sites.join(" or ")}.</li>
            </ul>
          </Card>
          <Card>
            <h2 className="pp-h3">Your information stays personal</h2>
            <p className="pp-small" style={{ margin: 0 }}>Only you and authorised care staff can see your personal report. Your employer cannot view your results. It receives only grouped programme figures.</p>
          </Card>
          <Card>
            <h2 className="pp-h3">Need help?</h2>
            <p className="pp-small" style={{ margin: 0 }}>Contact Precision Health support about appointments or reports. This portal is not an urgent-care service. Contact details are not shown in this demo, and nothing you do here is sent anywhere.</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
