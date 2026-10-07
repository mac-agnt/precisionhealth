/* Portal onboarding, in the order Precision Health asked for: invitation code, then your details,
   then consent, then the health questionnaire, all saved as you go. Only after that can a time be
   confirmed (Appointments). Submitting records the questionnaire and consent. It never creates a
   booking by itself. */
import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { act, fmtDate, fmtNumericDate, parseIrishDate, today } from "../../model";
import type { Membership } from "../../model";
import { dispatch, usePhState } from "../../store";
import { Button, Card, DemoTag, Field, Icon, Pill, ProgressBar, TextInput, Textarea } from "../../ui";
import type { MobileType, PortalData, PortalView } from "./data";
import {
  CK, CONSENT_FORM_VERSION, CONSENT_ITEMS, DK, MOBILE_TYPES, PRIVACY_NOTICE_VERSION, SUPPORT_EMAIL, consentComplete, dobError, emailError, mobileError, normaliseMobile,
  participantDetails, progressOf, questionCtx, savedAnswers,
} from "./data";
import type { BookingStep, FieldError } from "./parts";
import { BookingSteps, ErrorSummary, KeyValues, ProgrammeBanner, UrgentCareCard } from "./parts";
import { SECTIONS, answerText, isBlank, questionLabel, sectionErrors, sectionPayload, visible } from "./questions";
import type { Answers, Question, QuestionCtx } from "./questions";

/* ---- 1. invitation-code entry (S01) ---- */
export function CodeEntry({ d, onAccepted }: { d: PortalData; onAccepted: () => void }) {
  const state = usePhState();
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const v = code.trim().toUpperCase();
    if (!v) { setErr("Enter the code from your invitation message."); return; }
    const expected = d.code;
    if (!expected || v !== expected.code.toUpperCase()) { setErr("That code is not recognised. Check the code in your invitation message, including the dashes."); return; }
    if (expected.status !== "active" || expected.expiresOn < today(state)) { setErr(`This invitation code is no longer active. Email ${SUPPORT_EMAIL} and we will sort it out.`); return; }
    setErr(null);
    onAccepted();
  };
  return (
    <div className="pp-entry">
      <div className="pp-entry-intro">
        <div className="pp-eyebrow">Your screening, in one place</div>
        <h1 className="pp-display">A clearer picture of your health.</h1>
        <p className="pp-lead">Book your screening, prepare for your appointment and see your report once a doctor has reviewed it.</p>
        <div className="pp-entry-private">
          <strong>Private by design</strong>
          <span>Your employer receives approved group-level reports only, never your personal health information.</span>
        </div>
      </div>
      <Card className="pp-entry-card">
        <div className="pp-eyebrow">Participant portal · step 1 of 2</div>
        <h2 className="pp-title" style={{ marginTop: 6 }}>Enter your invitation code</h2>
        <p className="pp-lead">It is in your invitation email and tells us which screening programme you are booking.</p>
        <form onSubmit={submit} style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }} noValidate>
          <Field label="Invitation code" htmlFor="pp-code" error={err}>
            <TextInput id="pp-code" value={code} onChange={(e) => { setCode(e.target.value); setErr(null); }} placeholder="For example DEMO-ABC-26" autoComplete="off" spellCheck={false} invalid={!!err} aria-describedby={err ? undefined : "pp-code-help"} />
          </Field>
          <Button type="submit" variant="primary" icon="arrow" className="pp-btn-block">Continue</Button>
        </form>
        <div className="pp-banner" style={{ marginTop: 14 }} id="pp-code-help">
          <Icon name="info" size={14} style={{ marginTop: 2, color: "var(--accent)" }} />
          <span>
            Design preview. The fictional code for this invitation is <strong style={{ color: "var(--ink)" }}>{d.code?.code || "not set"}</strong>.{" "}
            {d.code ? <button type="button" className="ph-link" onClick={() => { setCode(d.code!.code); setErr(null); }}>Use the demo code</button> : null}
            <span style={{ display: "block", marginTop: 4 }}>No account, password or authentication is created. A code never shows who else is invited.</span>
          </span>
        </div>
        <p className="pp-small" style={{ margin: "14px 0 0" }}>Need help? Email <a className="ph-link" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</p>
      </Card>
    </div>
  );
}

/* ---- 2 to 4. details, consent, questionnaire, then check and submit ---- */
export function QuestionnaireView({ d, go }: { d: PortalData; go: (v: PortalView) => void }) {
  const m = d.membership;
  if (!m) return <div className="pp-main"><Card><p className="pp-lead">No programme membership was found for this participant.</p></Card></div>;
  if (m.questionnaire === "complete") return <CompletedSummary d={d} m={m} go={go} />;
  return <QuestionnaireFlow key={d.person.id} d={d} m={m} go={go} />;
}

const N = SECTIONS.length;
const PART_DETAILS = 0;
const PART_CONSENT = 1;
const PART_REVIEW = N + 2;
const sectionPart = (k: number) => k + 2;

/** The answers to start from: what was saved, with your details pre-filled from the invitation. */
function initialAnswers(d: PortalData, saved: Answers, todayIso: string): Answers {
  const a: Answers = { ...saved };
  const p = d.person;
  if (isBlank(a[DK.first])) a[DK.first] = p.given;
  if (isBlank(a[DK.last])) a[DK.last] = p.family;
  if (isBlank(a[DK.email])) a[DK.email] = p.email;
  if (isBlank(a[DK.dob])) a[DK.dob] = fmtNumericDate(p.dob);
  if (isBlank(a[DK.sex]) && p.sex !== "not_recorded") a[DK.sex] = p.sex === "male" ? "Male" : "Female";
  if (isBlank(a[DK.mobileType])) a[DK.mobileType] = "irish";
  if (isBlank(a[CK.date])) a[CK.date] = fmtNumericDate(todayIso);
  return a;
}

function QuestionnaireFlow({ d, m, go }: { d: PortalData; m: Membership; go: (v: PortalView) => void }) {
  const state = usePhState();
  const personId = d.person.id;
  const todayIso = today(state);
  const saved = savedAnswers(m);
  const prog = progressOf(m);
  const done = prog.sectionsDone;
  const [answers, setAnswers] = useState<Answers>(() => initialAnswers(d, saved, todayIso));
  const firstOpen = !prog.details ? PART_DETAILS : !prog.consent ? PART_CONSENT : done >= N ? PART_REVIEW : sectionPart(done);
  const [step, setStep] = useState(firstOpen);
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [errSeq, setErrSeq] = useState(0);
  const [note, setNote] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const ctx = questionCtx(state, d, answers);

  const set = (k: string, v: Answers[string]) => {
    setAnswers((a) => ({ ...a, [k]: v }));
    setErrors((e) => e.filter((x) => x.id !== fieldId(k)));
  };
  const showErrors = (errs: FieldError[]) => { setErrors(errs); setErrSeq((n) => n + 1); setNote(null); };
  const errFor = (k: string) => errors.find((e) => e.id === fieldId(k))?.text;
  const unlocked = (i: number) => i === PART_DETAILS || (i === PART_CONSENT ? prog.details : prog.details && prog.consent && (i === PART_REVIEW ? done >= N : i - 2 <= done));
  const goStep = (i: number) => { setStep(i); setErrors([]); setNote(null); };

  // Each part starts at the top of the preview, so a long section never opens half-scrolled.
  const rootRef = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    rootRef.current?.closest(".pp-stage")?.scrollTo({ top: 0 });
  }, [step]);

  const save = (sectionsDone: number, payload: Answers, silent = true): boolean => {
    const r = dispatch(act.portalSaveDraft(personId, sectionsDone, payload), { silent });
    if (!r.ok) { setNote({ tone: "warn", text: r.message || "That could not be saved. Try again." }); return false; }
    return true;
  };
  const nextAfterConsent = () => (done >= N ? PART_REVIEW : sectionPart(done));

  /* details */
  const detailsPayload = (confirmed: boolean): Answers => ({
    [DK.first]: String(answers[DK.first] || "").trim(), [DK.last]: String(answers[DK.last] || "").trim(), [DK.email]: String(answers[DK.email] || "").trim(),
    [DK.mobileType]: String(answers[DK.mobileType] || ""), [DK.mobile]: answers[DK.mobileType] === "none" ? "" : normaliseMobile(String(answers[DK.mobile] || "")),
    [DK.dob]: String(answers[DK.dob] || "").trim(), [DK.sex]: String(answers[DK.sex] || ""), ...(confirmed ? { [DK.confirmed]: true } : {}),
  });
  const saveDetails = () => {
    const e: FieldError[] = [];
    if (!String(answers[DK.first] || "").trim()) e.push({ id: fieldId(DK.first), text: "Enter your first name." });
    if (!String(answers[DK.last] || "").trim()) e.push({ id: fieldId(DK.last), text: "Enter your last name." });
    const em = emailError(String(answers[DK.email] || "")); if (em) e.push({ id: fieldId(DK.email), text: em });
    const mt = (answers[DK.mobileType] as MobileType | undefined) || null;
    const mo = mobileError(mt, String(answers[DK.mobile] || "")); if (mo) e.push({ id: fieldId(mt ? DK.mobile : DK.mobileType), text: mo });
    const db = dobError(String(answers[DK.dob] || ""), todayIso); if (db) e.push({ id: fieldId(DK.dob), text: db });
    if (answers[DK.sex] !== "Male" && answers[DK.sex] !== "Female") e.push({ id: fieldId(DK.sex), text: "Choose your sex at birth." });
    if (e.length) { showErrors(e); return; }
    if (!save(done, detailsPayload(true))) return;
    setErrors([]);
    setStep(prog.consent ? nextAfterConsent() : PART_CONSENT);
    setNote({ tone: "ok", text: "Your details are saved." });
  };

  /* consent */
  const saveConsent = () => {
    const e: FieldError[] = [];
    CONSENT_ITEMS.forEach((c) => { if (answers[c.key] !== true) e.push({ id: fieldId(c.key), text: `Tick to confirm: ${c.label}.` }); });
    const sr = answers[CK.screenReader] === true;
    const sig = String(answers[CK.signature] || "").trim();
    const det = participantDetails(d, answers);
    if (!sr && !sig) e.push({ id: fieldId(CK.signature), text: "Type your full name to sign, or tick the screen reader option." });
    else if (!sr && !(sig.toLowerCase().includes(det.first.toLowerCase()) && sig.toLowerCase().includes(det.last.toLowerCase()))) e.push({ id: fieldId(CK.signature), text: `Type your full name as you gave it in Your details: ${det.first} ${det.last}.` });
    const dateIso = parseIrishDate(String(answers[CK.date] || ""));
    if (!dateIso) e.push({ id: fieldId(CK.date), text: "Enter the date as dd/mm/yyyy." });
    else if (dateIso > todayIso) e.push({ id: fieldId(CK.date), text: "The date cannot be in the future." });
    if (e.length) { showErrors(e); return; }
    const payload: Answers = {
      ...Object.fromEntries(CONSENT_ITEMS.map((c) => [c.key, true])),
      consentService: true, consentData: true, [CK.sms]: answers[CK.sms] === true,
      [CK.signature]: sr ? "" : sig, [CK.screenReader]: sr, [CK.date]: String(answers[CK.date]).trim(), [CK.notice]: PRIVACY_NOTICE_VERSION,
    };
    if (!save(done, payload)) return;
    setErrors([]);
    setStep(nextAfterConsent());
    setNote({ tone: "ok", text: "Consent saved. It is recorded with your answers when you submit." });
  };

  /* questionnaire sections */
  const saveSection = (k: number, cont: boolean) => {
    const key = SECTIONS[k].key;
    const errs = sectionErrors(key, answers, ctx);
    const list = SECTIONS[k].questions.filter((q) => errs[q.key]).map((q) => ({ id: fieldId(q.key), text: `${questionLabel(q, ctx)} ${errs[q.key]}` }));
    if (cont && list.length) { showErrors(list); return; }
    if (!save(cont ? Math.max(done, k + 1) : done, sectionPayload(key, answers, ctx), cont)) return;
    setErrors([]);
    if (!cont) { go("overview"); return; }
    setStep(k + 1 >= N ? PART_REVIEW : sectionPart(k + 1));
    setNote({ tone: "ok", text: `${SECTIONS[k].title} saved. You can stop at any time and pick up where you left off.` });
  };

  const submit = () => {
    const all: Answers = { ...saved, ...answers };
    if (!prog.details) { goStep(PART_DETAILS); return; }
    if (!consentComplete(all)) { goStep(PART_CONSENT); return; }
    const bad = SECTIONS.map((s, k) => ({ k, errs: sectionErrors(s.key, all, ctx) })).filter((x) => Object.keys(x.errs).length);
    if (bad.length) {
      setStep(sectionPart(bad[0].k));
      showErrors(SECTIONS[bad[0].k].questions.filter((q) => bad[0].errs[q.key]).map((q) => ({ id: fieldId(q.key), text: `${questionLabel(q, ctx)} ${bad[0].errs[q.key]}` })));
      return;
    }
    const r = dispatch(act.portalComplete(personId, { service: true, data: true, sms: all[CK.sms] === true }));
    if (r.ok) go("appointments");
    else setNote({ tone: "warn", text: r.message || "That could not be submitted. Try again." });
  };

  const stage: BookingStep = step === PART_DETAILS ? "details" : step === PART_CONSENT ? "consent" : "questions";
  const onStep = (s: BookingStep) => {
    if (s === "time") go("appointments");
    else goStep(s === "details" ? PART_DETAILS : s === "consent" ? PART_CONSENT : done >= N ? PART_REVIEW : sectionPart(done));
  };
  const totalParts = N + 2;
  const partsDone = (prog.details ? 1 : 0) + (prog.consent ? 1 : 0) + done;
  const titles: Record<BookingStep, string> = { details: "Your details", consent: "Consent", questions: step === PART_REVIEW ? "Check your answers" : "A few health questions", time: "" };

  return (
    <div className="pp-main" ref={rootRef}>
      <ProgrammeBanner d={d} compact />
      <BookingSteps progress={prog} current={stage} onStep={onStep} />
      <div className="pp-row" style={{ flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
        <div className="ph-grow" style={{ minWidth: 0 }}>
          <div className="pp-eyebrow">Before you book</div>
          <h1 className="pp-title">{titles[stage]}</h1>
        </div>
        {m.draft ? <Pill tone="info" icon="check">Draft saved</Pill> : null}
      </div>
      <div>
        <div className="pp-small" style={{ marginBottom: 6 }}>{partsDone} of {totalParts} parts saved. Booking opens when your details, consent and health questions are complete.</div>
        <ProgressBar value={partsDone} max={totalParts} label="Questionnaire progress" />
      </div>
      {note ? (
        <div className={"pp-callout" + (note.tone === "warn" ? " warn" : "")} role={note.tone === "warn" ? "alert" : "status"}>
          <Icon name={note.tone === "warn" ? "alert" : "check"} size={14} style={{ marginTop: 2, color: note.tone === "warn" ? "var(--warn)" : "var(--ok)" }} />
          <span>{note.text}</span>
        </div>
      ) : null}
      <ErrorSummary errors={errors} seq={errSeq} />

      <div className="pp-grid pp-grid-main">
        <div className="pp-grid">
          {step === PART_DETAILS ? (
            <DetailsForm d={d} answers={answers} set={set} errFor={errFor} todayIso={todayIso} onSave={saveDetails}
              onLater={() => { save(done, detailsPayload(false), false); go("overview"); }} />
          ) : step === PART_CONSENT ? (
            <ConsentForm d={d} answers={answers} set={set} errFor={errFor} onSave={saveConsent} onBack={() => goStep(PART_DETAILS)}
              onLater={() => go("overview")} />
          ) : step === PART_REVIEW ? (
            <Review d={d} answers={{ ...saved, ...answers }} ctx={ctx} onEdit={goStep} onSubmit={submit} />
          ) : (
            <SectionForm k={step - 2} answers={answers} ctx={ctx} set={set} errFor={errFor} unlocked={unlocked} goStep={goStep} done={done}
              onContinue={() => saveSection(step - 2, true)} onLater={() => saveSection(step - 2, false)} onBack={() => goStep(step === 2 ? PART_CONSENT : step - 1)} />
          )}
        </div>
        <div className="pp-grid">
          <UrgentCareCard />
          <Card>
            <h2 className="pp-h3">Why we ask first</h2>
            <p className="pp-small" style={{ margin: 0 }}>Your answers help the nurse and doctor prepare, so your appointment is about you rather than paperwork. Your answers are saved as you go: stop whenever you like and pick up where you left off.</p>
          </Card>
        </div>
      </div>
    </div>
  );
}

const fieldId = (k: string) => "pp-f-" + k;

type SetFn = (k: string, v: Answers[string]) => void;
type ErrFn = (k: string) => string | undefined;

function Options({ id, labelId, value, options, onChange, invalid, describedBy: desc }: { id: string; labelId: string; value: Answers[string] | undefined; options: Array<{ label: string; v: Answers[string] }>; onChange: (v: Answers[string]) => void; invalid?: boolean; describedBy?: string }) {
  return (
    <div className="pp-options" role="radiogroup" aria-labelledby={labelId} id={id} aria-invalid={invalid || undefined} aria-describedby={desc}>
      {options.map((o) => (
        <button key={o.label} type="button" role="radio" aria-checked={value === o.v} className="pp-option" onClick={() => onChange(o.v)}>{o.label}</button>
      ))}
    </div>
  );
}

/** The error, when there is one, above the hint. The hint stays visible so the expected format is never hidden. */
function Err({ text, help, id }: { text?: string; help?: ReactNode; id: string }) {
  return (
    <>
      {text ? <div className="ph-err" id={id + "-err"}>{text}</div> : null}
      {help ? <div className="ph-help" id={id + "-help"}>{help}</div> : null}
    </>
  );
}
const describedBy = (id: string, err?: string, help?: unknown) => [err ? id + "-err" : "", help ? id + "-help" : ""].filter(Boolean).join(" ") || undefined;

/* ---- your details ---- */
function DetailsForm({ d, answers, set, errFor, todayIso, onSave, onLater }: { d: PortalData; answers: Answers; set: SetFn; errFor: ErrFn; todayIso: string; onSave: () => void; onLater: () => void }) {
  const text = (k: string, label: string, opts: { type?: string; auto?: string; help?: ReactNode; placeholder?: string; inputMode?: "numeric" | "tel" | "email" } = {}) => {
    const id = fieldId(k);
    const err = errFor(k);
    return (
      <div className="pp-field">
        <label className="pp-q-label" htmlFor={id}>{label}</label>
        <TextInput id={id} type={opts.type || "text"} autoComplete={opts.auto} inputMode={opts.inputMode} placeholder={opts.placeholder} value={String(answers[k] ?? "")} invalid={!!err}
          aria-describedby={describedBy(id, err, opts.help)} onChange={(e) => set(k, e.target.value)} />
        <Err text={err} help={opts.help} id={id} />
      </div>
    );
  };
  const mt = (answers[DK.mobileType] as MobileType | undefined) || null;
  const dobIso = parseIrishDate(String(answers[DK.dob] || ""));
  const dobDiffers = !!dobIso && dobIso !== d.person.dob && dobIso <= todayIso;
  return (
    <Card>
      <p className="pp-small" style={{ marginTop: 0 }}>We filled in what your invitation already told us. Check each line and correct anything that is wrong. Questions marked with a star are needed.</p>
      <div className="pp-form-grid">
        {text(DK.first, "First name *", { auto: "given-name" })}
        {text(DK.last, "Last name *", { auto: "family-name" })}
      </div>
      {text(DK.email, "Email *", { type: "email", auto: "email", inputMode: "email", help: "Your booking confirmation goes here." })}
      <div className="pp-field">
        <span className="pp-q-label" id={fieldId(DK.mobileType) + "-label"}>Mobile *</span>
        <Options id={fieldId(DK.mobileType)} labelId={fieldId(DK.mobileType) + "-label"} value={answers[DK.mobileType]} invalid={!!errFor(DK.mobileType)}
          options={MOBILE_TYPES.map((x) => ({ label: x.label, v: x.id }))} onChange={(v) => set(DK.mobileType, v)} />
        <Err text={errFor(DK.mobileType)} id={fieldId(DK.mobileType)} />
        {mt === "none" ? (
          <p className="ph-help" style={{ marginTop: 8 }}>No problem. We will contact you by email only, and nothing is sent by text.</p>
        ) : mt ? (
          <div style={{ marginTop: 10 }}>
            <label className="ph-label" htmlFor={fieldId(DK.mobile)}>{mt === "irish" ? "Irish mobile number" : "Mobile number with country code"}</label>
            <TextInput id={fieldId(DK.mobile)} type="tel" inputMode="tel" autoComplete="tel" placeholder={mt === "irish" ? "08x1234567" : "+44 7700 900123"} value={String(answers[DK.mobile] ?? "")}
              invalid={!!errFor(DK.mobile)} aria-describedby={describedBy(fieldId(DK.mobile), errFor(DK.mobile), true)} onChange={(e) => set(DK.mobile, e.target.value)} style={{ maxWidth: 260 }} />
            <Err text={errFor(DK.mobile)} id={fieldId(DK.mobile)} help={<>{mt === "irish" ? "Format 08x1234567, for example 0871234567. Spaces are fine." : "Start with + and your country code."} On your invitation: {d.person.phone}. <button type="button" className="ph-link" onClick={() => set(DK.mobile, mt === "irish" ? "0871234567" : "+447700900123")}>Use a fictional demo number</button></>} />
          </div>
        ) : null}
      </div>
      {text(DK.dob, "Date of birth *", { placeholder: "dd/mm/yyyy", inputMode: "numeric", auto: "bday", help: "As dd/mm/yyyy, for example 09/06/1993." })}
      {dobDiffers ? <div className="pp-callout" role="note" style={{ marginBottom: 12 }}><Icon name="info" size={14} style={{ marginTop: 2, color: "var(--accent)" }} /><span>This is different from your invitation record ({fmtNumericDate(d.person.dob)}). If it is right, keep it and email {SUPPORT_EMAIL} so we can correct the record before your appointment. The nurse checks your date of birth on the day.</span></div> : null}
      <div className="pp-field">
        <span className="pp-q-label" id={fieldId(DK.sex) + "-label"}>Sex at birth *</span>
        <Options id={fieldId(DK.sex)} labelId={fieldId(DK.sex) + "-label"} value={answers[DK.sex]} invalid={!!errFor(DK.sex)}
          options={[{ label: "Male", v: "Male" }, { label: "Female", v: "Female" }]} onChange={(v) => set(DK.sex, v)} describedBy={describedBy(fieldId(DK.sex), errFor(DK.sex), true)} />
        <Err text={errFor(DK.sex)} id={fieldId(DK.sex)} help="We ask because some tests and their normal ranges depend on sex at birth, for example haemoglobin and waist size, and so do some cancer screening questions. It is kept separate from gender." />
      </div>
      <div className="pp-wrap" style={{ marginTop: 6 }}>
        <Button variant="primary" icon="arrow" onClick={onSave}>Save and continue to consent</Button>
        <Button onClick={onLater}>Save and finish later</Button>
      </div>
    </Card>
  );
}

/* ---- consent: their form's wording in readable sections ---- */
function ConsentForm({ d, answers, set, errFor, onSave, onBack, onLater }: { d: PortalData; answers: Answers; set: SetFn; errFor: ErrFn; onSave: () => void; onBack: () => void; onLater: () => void }) {
  const state = usePhState();
  const threshold = state.settings.suppressionThreshold;
  const sr = answers[CK.screenReader] === true;
  const box = (key: string, label: ReactNode, required: boolean) => {
    const id = fieldId(key);
    const err = errFor(key);
    return (
      <div className={"pp-consent-item" + (err ? " invalid" : "")}>
        <label htmlFor={id} className="pp-check">
          <input id={id} type="checkbox" checked={answers[key] === true} onChange={(e) => set(key, e.target.checked)} aria-invalid={!!err || undefined} aria-describedby={err ? id + "-err" : undefined} />
          <span>{required ? null : <span className="pp-q-opt">Optional. </span>}{label}{required ? <span aria-hidden="true"> *</span> : null}</span>
        </label>
        <Err text={err} id={id} />
      </div>
    );
  };
  return (
    <Card>
      <h2 className="pp-h3" style={{ fontSize: 15 }}>Please read this important information carefully</h2>
      <div className="pp-terms">
        <details open>
          <summary>General terms</summary>
          <ul>
            <li>Screening is a snapshot of a limited range of measurements, taken on a single occasion.</li>
            <li>It is not a substitute for your GP or specialist. Take your results to your GP or specialist before you change any treatment.</li>
            <li>Every test has a margin of error. Abnormal results are generally repeated on a different day, in a different setting.</li>
            <li>Precision Health is not responsible for events outside its control.</li>
          </ul>
        </details>
        <details>
          <summary>How we process your information</summary>
          <ul>
            <li>Your information is encrypted when it is sent and when it is stored, and it is stored in the EU.</li>
            <li>Your name, email and mobile are shared with Esendex only to send you a text, such as a report access code.</li>
            <li>Your report is shown in this portal. If you ask for it, it is also sent by email as an encrypted file.</li>
            <li>Retention period: to be confirmed.</li>
            <li>We never share information that identifies you without your consent, except where the law or Medical Council ethical guidance requires it.</li>
            <li>Precision Health is registered with the Data Protection Commissioner as a Data Controller.</li>
          </ul>
        </details>
        <details>
          <summary>Sharing with your employer</summary>
          <ul>
            <li>{d.programme.clientName} receives aggregated, anonymised figures only, at the end of the programme.</li>
            <li>Groups smaller than {threshold} people are hidden, so nobody can be picked out.</li>
            <li>{d.programme.clientName} never sees your answers, your measurements or your report.</li>
          </ul>
        </details>
      </div>
      <p className="pp-small" style={{ margin: "10px 0 14px" }}>Questions about this form: <a className="ph-link" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</p>
      <fieldset className="pp-fieldset">
        <legend className="pp-q-label">Please confirm *</legend>
        <div className="pp-consent">
          {CONSENT_ITEMS.map((c) => <div key={c.key}>{box(c.key, c.label, true)}</div>)}
          {box(CK.sms, "Send my appointment messages by text as well as email (Esendex).", false)}
        </div>
      </fieldset>
      <div className="pp-form-grid" style={{ marginTop: 14 }}>
        <div className="pp-field">
          <label className="pp-q-label" htmlFor={fieldId(CK.signature)}>Signature *</label>
          <TextInput id={fieldId(CK.signature)} className="pp-signature" value={String(answers[CK.signature] ?? "")} disabled={sr} placeholder={sr ? "Not needed" : "Type your full name"} autoComplete="name"
            invalid={!!errFor(CK.signature)} aria-describedby={describedBy(fieldId(CK.signature), errFor(CK.signature), true)} onChange={(e) => set(CK.signature, e.target.value)} />
          <Err text={errFor(CK.signature)} id={fieldId(CK.signature)} help="Typing your full name here counts as your signature." />
        </div>
        <div className="pp-field">
          <label className="pp-q-label" htmlFor={fieldId(CK.date)}>Date *</label>
          <TextInput id={fieldId(CK.date)} inputMode="numeric" placeholder="dd/mm/yyyy" value={String(answers[CK.date] ?? "")} invalid={!!errFor(CK.date)}
            aria-describedby={describedBy(fieldId(CK.date), errFor(CK.date), true)} onChange={(e) => set(CK.date, e.target.value)} />
          <Err text={errFor(CK.date)} id={fieldId(CK.date)} help="Filled in with today. You can change it." />
        </div>
      </div>
      <label className="pp-check" style={{ marginTop: 4 }}>
        <input type="checkbox" checked={sr} onChange={(e) => set(CK.screenReader, e.target.checked)} />
        <span>I'm using a screen reader and can't complete the signature box</span>
      </label>
      <p className="pp-small" style={{ margin: "14px 0 0" }}>Consent form {CONSENT_FORM_VERSION} · Privacy notice {PRIVACY_NOTICE_VERSION}. Sample wording based on the current booking form; it needs Precision Health clinical and data protection approval before use.</p>
      <div className="pp-wrap" style={{ marginTop: 14 }}>
        <Button variant="primary" icon="arrow" onClick={onSave}>Agree and continue</Button>
        <Button onClick={onLater}>Finish later</Button>
        <Button variant="ghost" icon="chevronLeft" onClick={onBack}>Back</Button>
      </div>
    </Card>
  );
}

/* ---- one questionnaire section ---- */
function SectionForm({ k, answers, ctx, set, errFor, unlocked, goStep, done, onContinue, onLater, onBack }: {
  k: number; answers: Answers; ctx: QuestionCtx; set: SetFn; errFor: ErrFn; unlocked: (i: number) => boolean; goStep: (i: number) => void; done: number;
  onContinue: () => void; onLater: () => void; onBack: () => void;
}) {
  const s = SECTIONS[k];
  const qs = s.questions.filter((q) => visible(q, answers, ctx));
  return (
    <Card>
      <nav className="pp-parts" aria-label="Questionnaire sections">
        {SECTIONS.map((x, i) => (
          <button key={x.key} type="button" className={"pp-part" + (i < done ? " done" : "")} aria-current={i === k ? "step" : undefined} disabled={!unlocked(sectionPart(i))} onClick={() => goStep(sectionPart(i))}>
            {i < done ? <Icon name="check" size={12} stroke={2.2} style={{ color: "var(--ok)" }} /> : !unlocked(sectionPart(i)) ? <Icon name="lock" size={11} /> : null}
            {x.title}
          </button>
        ))}
      </nav>
      <div className="pp-eyebrow" style={{ margin: "14px 0 4px" }}>Section {k + 1} of {SECTIONS.length}</div>
      <h2 className="pp-h3" style={{ fontSize: 16 }}>{s.title}</h2>
      <p className="pp-small" style={{ margin: "0 0 4px" }}>Please answer as accurately as you can. The nurse goes through anything important with you on the day.</p>
      {qs.map((q) => <QuestionField key={q.key} q={q} ctx={ctx} value={answers[q.key]} error={errFor(q.key)} onChange={(v) => set(q.key, v)} />)}
      {s.questions.some((q) => q.showIf || q.showIfSex || q.minAge !== undefined) ? (
        <div className="pp-banner" style={{ marginTop: 4 }}><Icon name="info" size={13} style={{ marginTop: 2 }} /><span>Some questions appear only when they apply to you, for example because of your age, your sex at birth or an earlier answer.</span></div>
      ) : null}
      <div className="pp-wrap" style={{ marginTop: 14 }}>
        <Button variant="primary" icon="arrow" onClick={onContinue}>{k + 1 >= SECTIONS.length ? "Save and check your answers" : `Save and continue to ${SECTIONS[k + 1].title.toLowerCase()}`}</Button>
        <Button onClick={onLater}>Save and finish later</Button>
        <Button variant="ghost" icon="chevronLeft" onClick={onBack}>Back</Button>
      </div>
    </Card>
  );
}

function QuestionField({ q, ctx, value, error, onChange }: { q: Question; ctx: QuestionCtx; value: Answers[string] | undefined; error?: string; onChange: (v: Answers[string]) => void }) {
  const id = fieldId(q.key);
  const label = <span className="pp-q-label" id={id + "-label"}>{questionLabel(q, ctx)}{q.required ? <span aria-hidden="true"> *</span> : <span className="pp-q-opt"> (optional)</span>}</span>;
  let input: ReactNode;
  if (q.type === "choice" || q.type === "yesno") {
    const opts: Array<{ label: string; v: Answers[string] }> = q.type === "yesno" ? [{ label: "Yes", v: true }, { label: "No", v: false }] : (q.options || []).map((o) => ({ label: o, v: o }));
    input = <Options id={id} labelId={id + "-label"} value={value} options={opts} onChange={onChange} invalid={!!error} describedBy={describedBy(id, error, q.help)} />;
  } else if (q.type === "number") {
    input = (
      <div className="pp-num">
        <TextInput id={id} type="number" inputMode="numeric" min={q.min} max={q.max} step={q.step || 1} value={isBlank(value) ? "" : String(value)} invalid={!!error}
          onChange={(e) => onChange(e.target.value)} aria-labelledby={id + "-label"} aria-describedby={describedBy(id, error, q.help)} style={{ width: 120 }} />
        {q.unit ? <span className="pp-small">{q.unit}</span> : null}
      </div>
    );
  } else {
    input = <Textarea id={id} rows={3} value={isBlank(value) ? "" : String(value)} onChange={(e) => onChange(e.target.value)} aria-labelledby={id + "-label"} aria-describedby={describedBy(id, error, q.help)} invalid={!!error} />;
  }
  return (
    <div className={"pp-q" + (error ? " invalid" : "")}>
      {label}
      {input}
      <Err text={error} help={q.help} id={id} />
    </div>
  );
}

/* ---- check and submit ---- */
function DetailsRows({ d, a }: { d: PortalData; a: Answers }) {
  const det = participantDetails(d, a);
  const mobile = det.mobileType === "none" ? "No Irish mobile (email only)" : det.mobile ? `${det.mobile}${det.mobileType === "non_irish" ? " (non-Irish)" : ""}` : "Not given";
  return <KeyValues rows={[["Name", `${det.first} ${det.last}`], ["Email", det.email], ["Mobile", mobile], ["Date of birth", fmtNumericDate(det.dobIso)], ["Sex at birth", det.sex === "male" ? "Male" : det.sex === "female" ? "Female" : "Not given"]]} />;
}

function ConsentRows({ a, version }: { a: Answers; version?: string | null }) {
  return (
    <>
      <ul className="pp-small pp-ticks">
        {CONSENT_ITEMS.map((c) => <li key={c.key}><Icon name={a[c.key] === true ? "check" : "x"} size={12} stroke={2.2} />{c.label}</li>)}
        <li><Icon name={a[CK.sms] === true ? "check" : "x"} size={12} stroke={2.2} />{a[CK.sms] === true ? "Texts as well as email" : "Email only, no texts"}</li>
      </ul>
      <KeyValues rows={[
        ["Signed", a[CK.screenReader] === true ? "Screen reader alternative used" : String(a[CK.signature] || "Not signed")],
        ["Date", String(a[CK.date] || "")],
        ["Versions", `Consent form ${version || CONSENT_FORM_VERSION}, privacy notice ${String(a[CK.notice] || PRIVACY_NOTICE_VERSION)}`],
      ]} />
    </>
  );
}

function AnswerList({ a, ctx, keys }: { a: Answers; ctx: QuestionCtx; keys: Question[] }) {
  return (
    <dl className="pp-answers">
      {keys.map((q) => (
        <div key={q.key}><dt>{questionLabel(q, ctx)}</dt><dd className={isBlank(a[q.key]) ? "blank" : ""}>{answerText(q, a[q.key])}</dd></div>
      ))}
    </dl>
  );
}

function Review({ d, answers, ctx, onEdit, onSubmit }: { d: PortalData; answers: Answers; ctx: QuestionCtx; onEdit: (i: number) => void; onSubmit: () => void }) {
  const head = (title: string, i: number) => (
    <div className="pp-row" style={{ marginBottom: 6 }}>
      <span className="ph-grow" style={{ color: "var(--ink)", fontWeight: 600, fontSize: 13.5 }}>{title}</span>
      <button type="button" className="ph-link" style={{ fontSize: 12 }} onClick={() => onEdit(i)}>Change<span className="pp-sr"> {title}</span></button>
    </div>
  );
  return (
    <Card>
      <p className="pp-small" style={{ marginTop: 0 }}>Check everything once. You can still change an answer here. After you submit, tell the nurse on the day if anything changes.</p>
      <div className="pp-q">{head("Your details", PART_DETAILS)}<DetailsRows d={d} a={answers} /></div>
      <div className="pp-q">{head("Consent", PART_CONSENT)}<ConsentRows a={answers} /></div>
      {SECTIONS.map((s, k) => (
        <div key={s.key} className="pp-q">{head(s.title, sectionPart(k))}<AnswerList a={answers} ctx={ctx} keys={s.questions.filter((q) => visible(q, answers, ctx))} /></div>
      ))}
      <hr className="pp-hr" />
      <p className="pp-small" style={{ marginTop: 0 }}>When you submit, your consent and answers are recorded. Then you choose a time. Nothing is booked until you confirm it.</p>
      <Button variant="primary" icon="check" onClick={onSubmit}>Submit and choose a time</Button>
    </Card>
  );
}

function CompletedSummary({ d, m, go }: { d: PortalData; m: Membership; go: (v: PortalView) => void }) {
  const state = usePhState();
  const a = m.answers;
  const ctx = questionCtx(state, d, a);
  const known = SECTIONS.map((s) => ({ s, qs: s.questions.filter((q) => !isBlank(a[q.key]) && visible(q, a, ctx)) })).filter((x) => x.qs.length);
  const hasConsentRecord = CONSENT_ITEMS.some((c) => a[c.key] === true);
  return (
    <div className="pp-main">
      <div>
        <div className="pp-eyebrow">Health questionnaire</div>
        <h1 className="pp-title">Your answers are in</h1>
        <p className="pp-lead">Submitted {m.questionnaireCompletedAt ? fmtDate(m.questionnaireCompletedAt) : "before your booking"}, with your consent, before any appointment was confirmed.</p>
      </div>
      <div className="pp-grid pp-grid-main">
        <Card>
          <div className="pp-wrap" style={{ marginBottom: 10 }}><Pill tone="ok" icon="check">Questionnaire complete</Pill><Pill tone="ok" icon="check">Consent recorded ({m.consentVersion || CONSENT_FORM_VERSION})</Pill></div>
          {known.length ? known.map(({ s, qs }) => (
            <div key={s.key} className="pp-q">
              <div style={{ color: "var(--ink)", fontWeight: 600, fontSize: 13.5, marginBottom: 4 }}>{s.title}</div>
              <AnswerList a={a} ctx={ctx} keys={qs} />
            </div>
          )) : <p className="pp-small">Your answers are held with your booking.</p>}
          <DemoTag>Fictional answers</DemoTag>
        </Card>
        <div className="pp-grid">
          <Card>
            <h2 className="pp-h3">Your consent</h2>
            {hasConsentRecord ? <ConsentRows a={a} version={m.consentVersion} /> : <p className="pp-small" style={{ margin: 0 }}>Consent form {m.consentVersion || CONSENT_FORM_VERSION} was recorded with your booking.</p>}
          </Card>
          <Card>
            <h2 className="pp-h3">Next</h2>
            <p className="pp-small" style={{ marginTop: 0 }}>{d.active ? "Your appointment is booked. If anything in your answers changes, tell the nurse on the day." : d.attended.length ? "Your screening appointment is complete." : "You can now choose a time."}</p>
            <Button variant="primary" icon="calendar" onClick={() => go("appointments")}>{d.active ? "View appointment" : d.attended.length ? "Appointments" : "Choose a time"}</Button>
          </Card>
          <UrgentCareCard />
        </div>
      </div>
    </div>
  );
}
