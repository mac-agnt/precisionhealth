/* Portal account: the participant's details, how we contact them, how the report is delivered,
   a demonstration security panel and what withdrawing consent means. No real sign-in, MFA
   enrolment or account recovery exists here. */
import { fmtDate, fmtDateTime, fmtNumericDate } from "../../model";
import { dispatch, usePhState } from "../../store";
import { Button, Card, DemoTag, Icon, Pill } from "../../ui";
import type { PortalData, ReportDelivery } from "./data";
import { CK, CONSENT_FORM_VERSION, DELIVERY_LABEL, SUPPORT_EMAIL, participantDetails, progressOf, savedAnswers, setContactPreferenceAction } from "./data";
import { KeyValues } from "./parts";

export function AccountView({ d, delivery, setDelivery, onSignOut }: { d: PortalData; delivery: ReportDelivery; setDelivery: (v: ReportDelivery) => void; onSignOut: () => void }) {
  const state = usePhState();
  const m = d.membership;
  const a = savedAnswers(m);
  const det = participantDetails(d, a);
  const prog = progressOf(m);
  const pref = m?.contactPreference || "email";
  const smsConsent = m ? (m.answers.consentSms ?? m.draft?.answers.consentSms) : undefined;
  const noMobile = det.mobileType === "none";
  const mobileText = noMobile ? "No Irish mobile (email only)" : det.mobile || `${d.person.phone} (from your invitation)`;
  const choose = (ch: "email" | "sms") => { if (ch !== pref) dispatch(setContactPreferenceAction(d.person.id, ch)); };
  return (
    <div className="pp-main">
      <div>
        <div className="pp-eyebrow">Account</div>
        <h1 className="pp-title">Your account</h1>
        <p className="pp-lead">Your details and how we contact you. This is a synthetic profile for the demonstration.</p>
      </div>
      <div className="pp-grid pp-grid-2">
        <Card>
          <div className="pp-row" style={{ marginBottom: 8, flexWrap: "wrap" }}><h2 className="pp-h3 ph-grow" style={{ margin: 0 }}>Your details</h2><DemoTag>Synthetic profile</DemoTag></div>
          <KeyValues rows={[
            ["Name", `${det.first} ${det.last}`],
            ["Date of birth", fmtNumericDate(det.dobIso)],
            ["Sex at birth", det.sex === "male" ? "Male" : det.sex === "female" ? "Female" : "Not given"],
            ["Email", det.email],
            ["Mobile", mobileText],
            ["Programme", d.programme.name],
            ["Your reference", d.person.id],
          ]} />
          <p className="pp-small" style={{ margin: "10px 0 0" }}>To correct your name or date of birth after you book, email <a className="ph-link" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. The nurse checks two identifiers at your appointment.</p>
        </Card>
        <Card>
          <h2 className="pp-h3">How we contact you</h2>
          <div className="pp-small" id="pp-pref-label" style={{ marginBottom: 6 }}>Send my appointment messages by</div>
          <div className="pp-options" role="radiogroup" aria-labelledby="pp-pref-label">
            {(["email", "sms"] as const).map((ch) => (
              <button key={ch} type="button" role="radio" aria-checked={pref === ch} className="pp-option" onClick={() => choose(ch)}
                disabled={ch === "sms" && (smsConsent === false || noMobile)} title={ch === "sms" && (smsConsent === false || noMobile) ? "You chose not to receive texts." : undefined}>
                <Icon name={ch === "sms" ? "sms" : "mail"} size={13} style={{ marginRight: 6, verticalAlign: "-2px" }} />{ch === "sms" ? "Text (SMS)" : "Email"}
              </button>
            ))}
          </div>
          <p className="pp-small" style={{ margin: "10px 0 0" }}>
            Messages go only to your verified email address or mobile, and never contain results. A change applies to future messages only.
            {smsConsent === false || noMobile ? " You chose not to receive texts." : smsConsent === true ? " You agreed to texts (Esendex)." : ""}
          </p>
        </Card>
        <Card>
          <div className="pp-row" style={{ marginBottom: 8, flexWrap: "wrap" }}><h2 className="pp-h3 ph-grow" style={{ margin: 0 }}>How you get your report</h2><DemoTag>Simulated</DemoTag></div>
          <div className="pp-radio-list" role="radiogroup" aria-label="Report delivery">
            {(["portal", "portal_pdf"] as const).map((x) => {
              const off = x === "portal_pdf" && noMobile;
              return (
                <label key={x} className={"pp-radio" + (delivery === x ? " on" : "") + (off ? " off" : "")}>
                  <input type="radio" name="pp-delivery" checked={delivery === x} disabled={off} onChange={() => setDelivery(x)} />
                  <span>
                    <span className="pp-radio-title">{x === "portal" ? "Portal only" : "Portal, and encrypted PDF by email"}</span>
                    <span className="pp-small" style={{ display: "block" }}>{x === "portal" ? "Your report appears here once a doctor releases it." : off ? "Needs a mobile for the access code. You told us you have no Irish mobile." : "As today: an encrypted PDF by email, with the access code by text (Esendex)."}</span>
                  </span>
                </label>
              );
            })}
          </div>
          <p className="pp-small" style={{ margin: "10px 0 0" }}>Current choice: {DELIVERY_LABEL[delivery]}. Saved in this preview only.</p>
        </Card>
        <Card>
          <h2 className="pp-h3">Consent and questionnaire</h2>
          <div className="pp-wrap" style={{ marginBottom: 8 }}>
            {m?.consent === "complete" ? <Pill tone="ok" icon="check">Consent recorded ({m.consentVersion || CONSENT_FORM_VERSION})</Pill> : prog.consent ? <Pill tone="info" icon="clock">Consent saved, not yet submitted</Pill> : <Pill tone="neutral" icon="clock">Consent not given yet</Pill>}
            {prog.submitted ? <Pill tone="ok" icon="check">Questionnaire complete</Pill> : <Pill tone="neutral" icon="clock">Questionnaire {prog.sectionsDone} of {prog.sectionsTotal} sections</Pill>}
          </div>
          <p className="pp-small" style={{ margin: 0 }}>
            Invited {m ? fmtDate(m.invitedAt) : ""}. Consent comes before any appointment is confirmed.
            {a[CK.date] ? ` Signed ${String(a[CK.date])}${a[CK.screenReader] === true ? " using the screen reader alternative" : ""}.` : ""}
          </p>
        </Card>
        <Card>
          <h2 className="pp-h3">Withdrawing your consent</h2>
          <p className="pp-small" style={{ marginTop: 0 }}>You can withdraw at any time by emailing <a className="ph-link" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. Withdrawing stops any future participation: we cancel upcoming appointments and do not process anything new.</p>
          <p className="pp-small" style={{ margin: 0 }}>It does not erase records we must keep by law, such as the clinical record of a screening that has already happened. Retention period: to be confirmed.</p>
        </Card>
        <Card>
          <div className="pp-row" style={{ marginBottom: 8, flexWrap: "wrap" }}><h2 className="pp-h3 ph-grow" style={{ margin: 0 }}>Security</h2><DemoTag>Demonstration</DemoTag></div>
          <ul className="pp-small" style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 5 }}>
            <li>In the live portal you would sign in with a verified account and a six-digit code from an authenticator app (multi-factor authentication).</li>
            <li>This preview uses an invitation code only. No account, password or MFA is set up, and no recovery method exists.</li>
            <li>Last activity: {fmtDateTime(state.clock.nowUtc)}, demo clock.</li>
            <li>Fictional data only. Nothing leaves this browser.</li>
          </ul>
          <div style={{ marginTop: 12 }}><Button icon="lock" onClick={onSignOut}>Sign out of the preview</Button></div>
        </Card>
      </div>
    </div>
  );
}
