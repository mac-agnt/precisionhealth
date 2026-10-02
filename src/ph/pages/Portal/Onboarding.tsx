/* Portal onboarding: the generic invitation-code entry view, then details and separate consent
   choices, then the questionnaire with conditional questions and local save and resume.
   Completion records consent and unlocks booking. It never creates a booking by itself. */
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { APPOINTMENT_TYPES, act, fmtDate, fmtNumericDate, today } from "../../model";
import type { Membership } from "../../model";
import { dispatch, usePhState } from "../../store";
import { Button, Card, Checkbox, DemoTag, Field, Icon, Pill, TextInput } from "../../ui";
import type { PortalData, PortalView } from "./data";
import { SECTIONS, answerText, isBlank, sectionErrors, sectionPayload, visible } from "./questions";
import type { Answers, Question } from "./questions";

/* ---- 1. generic invitation-code entry ---- */
export function CodeEntry({ d, onAccepted }: { d: PortalData; onAccepted: () => void }) {
  const state = usePhState();
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const v = code.trim().toUpperCase();
    if (!v) { setErr("Enter the code from your invitation message."); return; }
    const expected = d.code;
    if (!expected || v !== expected.code.toUpperCase()) { setErr("That code is not recognised for this invitation. Check the code in your invitation message."); return; }
    if (expected.status !== "active" || expected.expiresOn < today(state)) { setErr("This invitation code is no longer active. Contact Precision Health support."); return; }
    setErr(null);
    onAccepted();
  };
  return (
    <div className="pp-main" style={{ maxWidth: 560, width: "100%", margin: "0 auto" }}>
      <Card>
        <div className="pp-step-dot" style={{ width: 38, height: 38, borderRadius: 12, background: "var(--accent-soft)", color: "var(--accent)", marginBottom: 14 }}><Icon name="lock" size={17} /></div>
        <h1 className="pp-title">Enter your invitation code</h1>
        <p className="pp-lead">Your invitation message includes a code. It confirms which screening programme you are invited to. This preview does not create an account or ask for a password.</p>
        <form onSubmit={submit} style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <Field label="Invitation code" htmlFor="pp-code" error={err}>
            <TextInput id="pp-code" value={code} onChange={(e) => { setCode(e.target.value); setErr(null); }} placeholder="For example DEMO-ABC-26" autoComplete="off" spellCheck={false} invalid={!!err} />
          </Field>
          <div><Button type="submit" variant="primary" icon="arrow">Continue</Button></div>
        </form>
      </Card>
      <div className="pp-banner">
        <Icon name="info" size={14} style={{ marginTop: 2, color: "var(--accent)" }} />
        <span>
          Demo only: the fictional code for this invitation is <strong style={{ color: "var(--ink)" }}>{d.code?.code || "not set"}</strong>.{" "}
          {d.code ? <button type="button" className="ph-link" onClick={() => { setCode(d.code!.code); setErr(null); }}>Use the demo code</button> : null}
          <span style={{ display: "block", marginTop: 4 }}>A simulation, not authentication. A code never reveals who else is invited.</span>
        </span>
      </div>
    </div>
  );
}

/* ---- 2 and 3. details, consent and questionnaire ---- */
export function QuestionnaireView({ d, go }: { d: PortalData; go: (v: PortalView) => void }) {
  const m = d.membership;
  if (!m) return <div className="pp-main"><Card><p className="pp-lead">No programme membership was found for this participant.</p></Card></div>;
  if (m.questionnaire === "complete") return <CompletedSummary d={d} m={m} go={go} />;
  return <QuestionnaireFlow key={d.person.id} d={d} m={m} go={go} />;
}

const PART_DETAILS = 0;
const PART_REVIEW = SECTIONS.length + 1;

function QuestionnaireFlow({ d, m, go }: { d: PortalData; m: Membership; go: (v: PortalView) => void }) {
  const personId = d.person.id;
  const done = m.draft?.sectionsDone || 0;
  const saved: Answers = m.draft?.answers || {};
  const consentSaved = saved.consentService === true && saved.consentData === true;
  const [answers, setAnswers] = useState<Answers>(() => ({ ...saved }));
  const [step, setStep] = useState(() => (!consentSaved ? PART_DETAILS : done >= SECTIONS.length ? PART_REVIEW : done + 1));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [note, setNote] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const set = (k: string, v: Answers[string]) => { setAnswers((a) => ({ ...a, [k]: v })); setErrors((e) => { const n = { ...e }; delete n[k]; return n; }); };
  const unlocked = (i: number) => i === PART_DETAILS || (consentSaved && (i === PART_REVIEW ? done >= SECTIONS.length : i <= done + 1));
  const parts = ["Details and consent", ...SECTIONS.map((s) => s.title), "Review and submit"];
  const partDone = (i: number) => (i === PART_DETAILS ? consentSaved : i === PART_REVIEW ? false : i <= done);
  const goStep = (i: number) => { setStep(i); setErrors({}); setNote(null); };
  // Each part starts at the top of the preview, so a long section never opens half-scrolled.
  const rootRef = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    rootRef.current?.closest(".pp-stage")?.scrollTo({ top: 0 });
  }, [step]);

  const saveDetails = () => {
    const errs: Record<string, string> = {};
    if (answers.consentService !== true) errs.consentService = "This consent is needed to take part in the screening service.";
    if (answers.consentData !== true) errs.consentData = "This consent is needed to process your health information for this screening.";
    if (Object.keys(errs).length) { setErrors(errs); setNote({ tone: "warn", text: "Both required consent choices are needed to continue. SMS is optional." }); return; }
    const r = dispatch(act.portalSaveDraft(personId, done, { consentService: true, consentData: true, consentSms: answers.consentSms === true }), { silent: true });
    if (!r.ok) { setNote({ tone: "warn", text: r.message || "Could not save." }); return; }
    setErrors({});
    setStep(done >= SECTIONS.length ? PART_REVIEW : done + 1);
    setNote({ tone: "ok", text: "Your consent choices are saved. They are recorded when you submit the questionnaire." });
  };

  const saveSection = (i: number, cont: boolean) => {
    const key = SECTIONS[i - 1].key;
    const errs = sectionErrors(key, answers);
    if (cont && Object.keys(errs).length) { setErrors(errs); setNote({ tone: "warn", text: "Some answers are missing or out of range." }); return; }
    const payload = sectionPayload(key, answers);
    const r = dispatch(act.portalSaveDraft(personId, cont ? Math.max(done, i) : done, payload), { silent: cont });
    if (!r.ok) { setNote({ tone: "warn", text: r.message || "Could not save." }); return; }
    setErrors({});
    if (!cont) { go("overview"); return; }
    setStep(i >= SECTIONS.length ? PART_REVIEW : i + 1);
    setNote({ tone: "ok", text: `${SECTIONS[i - 1].title} saved. You can stop at any time and resume later.` });
  };

  const submit = () => {
    const all: Answers = { ...saved, ...answers };
    const bad = SECTIONS.map((s, idx) => ({ idx, errs: sectionErrors(s.key, all) })).filter((x) => Object.keys(x.errs).length);
    if (bad.length) {
      setStep(bad[0].idx + 1);
      setErrors(bad[0].errs);
      setNote({ tone: "warn", text: `Some answers are still needed in: ${bad.map((b) => SECTIONS[b.idx].title).join(", ")}.` });
      return;
    }
    const r = dispatch(act.portalComplete(personId, { service: all.consentService === true, data: all.consentData === true, sms: all.consentSms === true }));
    if (r.ok) go("appointments");
    else setNote({ tone: "warn", text: r.message || "Could not submit." });
  };

  return (
    <div className="pp-main" ref={rootRef}>
      <div>
        <h1 className="pp-title">Your health questionnaire</h1>
        <p className="pp-lead">{done} of {SECTIONS.length} sections saved. Answers are saved as you go, so you can stop and come back. Booking opens when the questionnaire and the required consent choices are complete.</p>
      </div>
      <nav className="pp-parts" aria-label="Questionnaire parts">
        {parts.map((label, i) => (
          <button key={label} type="button" className={"pp-part" + (partDone(i) ? " done" : "")} aria-current={step === i ? "step" : undefined} disabled={!unlocked(i)} onClick={() => goStep(i)}
            title={unlocked(i) ? undefined : i === PART_REVIEW ? "Complete every section first." : "Complete the earlier parts first."}>
            {partDone(i) ? <Icon name="check" size={12} stroke={2.2} style={{ color: "var(--ok)" }} /> : !unlocked(i) ? <Icon name="lock" size={11} /> : null}
            {label}
          </button>
        ))}
      </nav>
      {note ? (
        <div className={"pp-callout" + (note.tone === "warn" ? " warn" : "")} role={note.tone === "warn" ? "alert" : "status"}>
          <Icon name={note.tone === "warn" ? "alert" : "check"} size={14} style={{ marginTop: 2, color: note.tone === "warn" ? "var(--warn)" : "var(--ok)" }} />
          <span>{note.text}</span>
        </div>
      ) : null}

      {step === PART_DETAILS ? (
        <DetailsAndConsent d={d} answers={answers} set={set} errors={errors} onSave={saveDetails} onLater={() => go("overview")} />
      ) : step === PART_REVIEW ? (
        <Review answers={{ ...saved, ...answers }} onEdit={goStep} onSubmit={submit} />
      ) : (
        <Card>
          <div className="ph-eyebrow" style={{ marginBottom: 4 }}>Section {step} of {SECTIONS.length}</div>
          <h2 className="pp-h3" style={{ fontSize: 16 }}>{SECTIONS[step - 1].title}</h2>
          {SECTIONS[step - 1].questions.every((q) => !q.required) ? <p className="pp-small" style={{ margin: "0 0 6px" }}>Every question in this section is optional.</p> : null}
          {SECTIONS[step - 1].questions.filter((q) => visible(q, answers)).map((q) => (
            <QuestionField key={q.key} q={q} value={answers[q.key]} error={errors[q.key]} onChange={(v) => set(q.key, v)} />
          ))}
          <div className="pp-wrap" style={{ marginTop: 14 }}>
            <Button variant="primary" icon="arrow" onClick={() => saveSection(step, true)}>Save and continue</Button>
            <Button onClick={() => saveSection(step, false)}>Save and finish later</Button>
            <Button variant="ghost" icon="chevronLeft" onClick={() => goStep(step - 1)}>Back</Button>
          </div>
        </Card>
      )}
    </div>
  );
}

function QuestionField({ q, value, error, onChange }: { q: Question; value: Answers[string] | undefined; error?: string; onChange: (v: Answers[string]) => void }) {
  const id = "pp-q-" + q.key;
  const label = (
    <span className="pp-q-label" id={id + "-label"}>
      {q.label} {!q.required ? <span className="pp-q-opt">(optional)</span> : null}
    </span>
  );
  let input;
  if (q.type === "choice" || q.type === "yesno") {
    const opts: Array<{ label: string; v: Answers[string] }> = q.type === "yesno" ? [{ label: "Yes", v: true }, { label: "No", v: false }] : (q.options || []).map((o) => ({ label: o, v: o }));
    input = (
      <div className="pp-options" role="radiogroup" aria-labelledby={id + "-label"}>
        {opts.map((o) => (
          <button key={o.label} type="button" role="radio" aria-checked={value === o.v} className="pp-option" onClick={() => onChange(o.v)}>{o.label}</button>
        ))}
      </div>
    );
  } else if (q.type === "number") {
    input = (
      <div className="pp-num">
        <TextInput id={id} type="number" inputMode="decimal" min={q.min} max={q.max} step={q.step || 1} value={isBlank(value) ? "" : String(value)} invalid={!!error}
          onChange={(e) => onChange(e.target.value)} aria-labelledby={id + "-label"} style={{ width: 120 }} />
        {q.unit ? <span className="pp-small">{q.unit}</span> : null}
      </div>
    );
  } else {
    input = <TextInput id={id} value={isBlank(value) ? "" : String(value)} onChange={(e) => onChange(e.target.value)} aria-labelledby={id + "-label"} invalid={!!error} />;
  }
  return (
    <div className="pp-q">
      {label}
      {input}
      {error ? <div className="ph-err" role="alert">{error}</div> : q.help ? <div className="ph-help">{q.help}</div> : null}
    </div>
  );
}

function DetailsAndConsent({ d, answers, set, errors, onSave, onLater }: { d: PortalData; answers: Answers; set: (k: string, v: Answers[string]) => void; errors: Record<string, string>; onSave: () => void; onLater: () => void }) {
  const p = d.programme;
  const at = APPOINTMENT_TYPES.find((x) => x.id === p.appointmentTypeId);
  const rows: Array<[string, string]> = [
    ["Name", `${d.person.given} ${d.person.family}`],
    ["Date of birth", fmtNumericDate(d.person.dob)],
    ["Email", d.person.email],
    ["Mobile", d.person.phone],
  ];
  return (
    <div className="pp-grid pp-grid-2">
      <Card>
        <h2 className="pp-h3">Eligibility</h2>
        <div className="pp-row" style={{ marginBottom: 8 }}><Pill tone="ok" icon="check">Eligible</Pill><span className="pp-small">You are on the programme roster.</span></div>
        <p className="pp-small" style={{ margin: 0 }}>{p.name}. {p.eligibility}</p>
        {d.code ? <p className="pp-small" style={{ margin: "6px 0 0" }}>Invitation: {d.code.label}, valid until {fmtDate(d.code.expiresOn)}.</p> : null}
        <hr className="pp-hr" />
        <h2 className="pp-h3">Your details</h2>
        <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "minmax(84px, auto) minmax(0, 1fr)", gap: "6px 12px", fontSize: 13 }}>
          {rows.map(([k, v]) => (
            <div key={k} style={{ display: "contents" }}><dt className="pp-small" style={{ margin: 0 }}>{k}</dt><dd style={{ margin: 0, color: "var(--ink)", minWidth: 0 }}>{v}</dd></div>
          ))}
        </dl>
        <p className="pp-small" style={{ margin: "10px 0 0" }}>If anything here is wrong, tell support before you book. The nurse checks two identifiers again at your appointment.</p>
      </Card>
      <Card>
        <h2 className="pp-h3">About the service</h2>
        <ul className="pp-small" style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6 }}>
          <li>{at ? `${at.name}, about ${at.minutes} minutes.` : "A screening appointment."} At {p.sites.join(" or ")}, between {fmtDate(p.windowStart)} and {fmtDate(p.windowEnd)}.</li>
          <li>A nurse measures height, weight and blood pressure and takes a blood sample.</li>
          <li>A Precision Health clinician reviews your report individually before it is released to you here.</li>
          <li>Messages tell you when something is ready. They never contain results.</li>
        </ul>
        <hr className="pp-hr" />
        <h2 className="pp-h3">Consent choices</h2>
        <div className="pp-consent">
          <div className="pp-consent-item">
            <Checkbox checked={answers.consentService === true} onChange={(v) => set("consentService", v)} label={<><strong style={{ color: "var(--ink)", fontWeight: 600 }}>Required.</strong> I agree to take part in the screening service described here.</>} />
            {errors.consentService ? <div className="ph-err">{errors.consentService}</div> : null}
          </div>
          <div className="pp-consent-item">
            <Checkbox checked={answers.consentData === true} onChange={(v) => set("consentData", v)} label={<><strong style={{ color: "var(--ink)", fontWeight: 600 }}>Required.</strong> I agree that Precision Health may process my health information to provide this screening and my report.</>} />
            {errors.consentData ? <div className="ph-err">{errors.consentData}</div> : null}
          </div>
          <div className="pp-consent-item">
            <Checkbox checked={answers.consentSms === true} onChange={(v) => set("consentSms", v)} label={<><strong style={{ color: "var(--ink)", fontWeight: 600 }}>Optional.</strong> Send me appointment messages by SMS (Esendex). Without it, messages come by email.</>} />
          </div>
        </div>
        <p className="pp-small" style={{ margin: "10px 0 0" }}>Sample consent wording for the demo. Your choices are recorded when you submit the questionnaire.</p>
        <div className="pp-wrap" style={{ marginTop: 14 }}>
          <Button variant="primary" icon="arrow" onClick={onSave}>Save and continue</Button>
          <Button onClick={onLater}>Finish later</Button>
        </div>
      </Card>
    </div>
  );
}

function Review({ answers, onEdit, onSubmit }: { answers: Answers; onEdit: (i: number) => void; onSubmit: () => void }) {
  return (
    <div className="pp-grid pp-grid-main">
      <Card>
        <h2 className="pp-h3" style={{ fontSize: 16 }}>Check your answers</h2>
        {SECTIONS.map((s, i) => (
          <div key={s.key} className="pp-q">
            <div className="pp-row" style={{ marginBottom: 6 }}>
              <span className="ph-grow" style={{ color: "var(--ink)", fontWeight: 600, fontSize: 13 }}>{s.title}</span>
              <button type="button" className="ph-link" style={{ fontSize: 12 }} onClick={() => onEdit(i + 1)}>Change</button>
            </div>
            {s.questions.filter((q) => visible(q, answers)).map((q) => (
              <div key={q.key} className="pp-small" style={{ display: "flex", gap: 10, padding: "2px 0" }}>
                <span className="ph-grow">{q.label}</span>
                <span style={{ color: isBlank(answers[q.key]) ? "var(--faint)" : "var(--ink)", textAlign: "right", maxWidth: "45%" }}>{answerText(q, answers[q.key])}</span>
              </div>
            ))}
          </div>
        ))}
      </Card>
      <Card>
        <h2 className="pp-h3">Consent</h2>
        <ul className="pp-small" style={{ margin: 0, paddingLeft: 18 }}>
          <li>Screening service: {answers.consentService === true ? "agreed" : "not agreed"}</li>
          <li>Processing of health information: {answers.consentData === true ? "agreed" : "not agreed"}</li>
          <li>SMS messages: {answers.consentSms === true ? "yes" : "no, email only"}</li>
        </ul>
        <button type="button" className="ph-link" style={{ fontSize: 12, marginTop: 6 }} onClick={() => onEdit(PART_DETAILS)}>Change consent choices</button>
        <hr className="pp-hr" />
        <p className="pp-small" style={{ marginTop: 0 }}>After you submit, you can choose an appointment. Nothing is booked until you confirm a time.</p>
        <Button variant="primary" icon="check" onClick={onSubmit}>Submit questionnaire and consent</Button>
      </Card>
    </div>
  );
}

function CompletedSummary({ d, m, go }: { d: PortalData; m: Membership; go: (v: PortalView) => void }) {
  const a = m.answers;
  const known = SECTIONS.map((s) => ({ s, qs: s.questions.filter((q) => !isBlank(a[q.key]) && visible(q, a)) })).filter((x) => x.qs.length);
  return (
    <div className="pp-main">
      <div>
        <h1 className="pp-title">Your health questionnaire</h1>
        <p className="pp-lead">Complete. It was submitted with your consent before any booking was confirmed.</p>
      </div>
      <div className="pp-grid pp-grid-main">
        <Card>
          <div className="pp-row" style={{ marginBottom: 10 }}><Pill tone="ok" icon="check">Questionnaire complete</Pill><Pill tone="ok" icon="check">Consent recorded ({m.consentVersion || "BC-3"})</Pill></div>
          {known.length ? known.map(({ s, qs }) => (
            <div key={s.key} className="pp-q">
              <div style={{ color: "var(--ink)", fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{s.title}</div>
              {qs.map((q) => (
                <div key={q.key} className="pp-small" style={{ display: "flex", gap: 10, padding: "2px 0" }}>
                  <span className="ph-grow">{q.label}</span>
                  <span style={{ color: "var(--ink)", textAlign: "right", maxWidth: "45%" }}>{answerText(q, a[q.key])}</span>
                </div>
              ))}
            </div>
          )) : <p className="pp-small">Your answers are held with your booking.</p>}
          <DemoTag>Fictional answers</DemoTag>
        </Card>
        <Card>
          <h2 className="pp-h3">Next</h2>
          <p className="pp-small" style={{ marginTop: 0 }}>{d.active ? "Your appointment is booked. If anything in your answers has changed, tell the nurse at your appointment." : d.attended.length ? "Your screening appointment is complete." : "You can now choose an appointment."}</p>
          <Button variant="primary" icon="calendar" onClick={() => go("appointments")}>{d.active ? "View appointment" : d.attended.length ? "Appointments" : "Choose an appointment"}</Button>
        </Card>
      </div>
    </div>
  );
}
