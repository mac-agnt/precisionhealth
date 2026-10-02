/* Portal overview: the next step, onboarding progress, the participant's own messages and
   programme details. Messages never contain results. */
import { APPOINTMENT_TYPES, fmtDate, fmtDateTime, fmtWeekdayDate, greetingFor, ix } from "../../model";
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
  const draftAnswers = d.membership?.draft?.answers || {};
  const consentChosen = req.consent || (draftAnswers.consentService === true && draftAnswers.consentData === true);
  const at = APPOINTMENT_TYPES.find((x) => x.id === d.programme.appointmentTypeId);
  const activeSession = d.active ? I.sessionById.get(d.active.sessionId) : undefined;
  const steps = [
    { title: "Invitation code accepted", text: d.code ? d.code.label : "Invitation recorded", done: true },
    { title: "Details and consent choices", text: req.consent ? "Recorded" : consentChosen ? "Chosen. Recorded when you submit the questionnaire." : "Not done yet", done: consentChosen },
    { title: "Health questionnaire", text: req.questionnaire ? "Complete" : `${req.sectionsDone} of ${SECTIONS.length} sections saved`, done: req.questionnaire },
    { title: "Appointment", text: d.active && activeSession ? `${fmtWeekdayDate(activeSession.date)} at ${d.active.slotStart}` : d.attended.length ? "Attended" : "Not booked yet", done: !!d.active || d.attended.length > 0 },
  ];
  const currentIdx = steps.findIndex((s) => !s.done);
  return (
    <div className="pp-main">
      <div>
        <h1 className="pp-title">{greetingFor(state.clock.nowUtc)}, {d.person.given}.</h1>
        <p className="pp-lead">{d.programme.name}. Everything here is about you only.</p>
      </div>
      <div className="pp-grid pp-grid-main">
        <div className="pp-grid">
          <Card>
            <div className="pp-row" style={{ marginBottom: 8 }}><Pill tone={next.tone}>{next.pill}</Pill></div>
            <h2 className="pp-h3" style={{ fontSize: 16 }}>{next.title}</h2>
            <p className="pp-small" style={{ marginTop: 0 }}>{next.text}</p>
            <Button variant="primary" icon="arrow" onClick={() => go(next.view)}>{next.action}</Button>
          </Card>
          {!d.episodes.length ? (
            <Card>
              <h2 className="pp-h3">Your steps</h2>
              <ol className="pp-steps">
                {steps.map((s, i) => (
                  <li key={s.title} className={"pp-step" + (s.done ? " done" : i === currentIdx ? " current" : "")}>
                    <span className="pp-step-dot">{s.done ? <Icon name="check" size={13} stroke={2.2} /> : i + 1}</span>
                    <span><span className="pp-step-title">{s.title}</span><span className="pp-small" style={{ display: "block" }}>{s.text}</span></span>
                  </li>
                ))}
              </ol>
            </Card>
          ) : null}
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
          <Card>
            <h2 className="pp-h3">Your programme</h2>
            <ul className="pp-small" style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
              <li>{d.programme.name}, {fmtDate(d.programme.windowStart)} to {fmtDate(d.programme.windowEnd)}.</li>
              <li>{at ? `${at.name}, about ${at.minutes} minutes.` : "Screening appointment."}</li>
              <li>{d.programme.sites.join(" or ")}.</li>
              <li>Your employer receives only grouped programme figures, never your individual report.</li>
            </ul>
          </Card>
          <Card>
            <h2 className="pp-h3">Need help?</h2>
            <p className="pp-small" style={{ margin: 0 }}>Contact Precision Health support about appointments or reports. Contact details are not shown in this demo, and nothing you do here is sent anywhere.</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
