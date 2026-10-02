/* Portal account: a synthetic profile, contact preferences and a demonstration security
   information panel. No real sign-in, MFA enrolment or account recovery exists here. */
import { fmtDate, fmtDateTime, fmtNumericDate } from "../../model";
import { dispatch, usePhState } from "../../store";
import { Button, Card, DemoTag, Icon, Pill } from "../../ui";
import type { PortalData } from "./data";
import { setContactPreferenceAction } from "./data";

export function AccountView({ d, onSignOut }: { d: PortalData; onSignOut: () => void }) {
  const state = usePhState();
  const m = d.membership;
  const pref = m?.contactPreference || "email";
  const smsConsent = m ? (m.answers.consentSms ?? m.draft?.answers.consentSms) : undefined;
  const rows: Array<[string, string]> = [
    ["Name", `${d.person.given} ${d.person.family}`],
    ["Date of birth", fmtNumericDate(d.person.dob)],
    ["Your reference", d.person.id],
    ["Programme", d.programme.name],
    ["Site", d.person.site],
  ];
  const choose = (ch: "email" | "sms") => { if (ch !== pref) dispatch(setContactPreferenceAction(d.person.id, ch)); };
  return (
    <div className="pp-main">
      <div>
        <h1 className="pp-title">Account</h1>
        <p className="pp-lead">Your profile and how we contact you. This is a synthetic profile for the demonstration.</p>
      </div>
      <div className="pp-grid pp-grid-2">
        <Card>
          <div className="pp-row" style={{ marginBottom: 8, flexWrap: "wrap" }}><h2 className="pp-h3" style={{ margin: 0 }}>Profile</h2><DemoTag>Synthetic profile</DemoTag></div>
          <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "minmax(96px, auto) minmax(0, 1fr)", gap: "7px 12px", fontSize: 13 }}>
            {rows.map(([k, v]) => <div key={k} style={{ display: "contents" }}><dt className="pp-small" style={{ margin: 0 }}>{k}</dt><dd style={{ margin: 0, color: "var(--ink)", minWidth: 0 }}>{v}</dd></div>)}
          </dl>
          <p className="pp-small" style={{ margin: "10px 0 0" }}>To correct your name or date of birth, contact support. The nurse checks two identifiers at your appointment.</p>
        </Card>
        <Card>
          <h2 className="pp-h3">Contact preferences</h2>
          <dl style={{ margin: "0 0 12px", display: "grid", gridTemplateColumns: "minmax(96px, auto) minmax(0, 1fr)", gap: "7px 12px", fontSize: 13 }}>
            <div style={{ display: "contents" }}><dt className="pp-small" style={{ margin: 0 }}>Email</dt><dd style={{ margin: 0, color: "var(--ink)", minWidth: 0 }}>{d.person.email}</dd></div>
            <div style={{ display: "contents" }}><dt className="pp-small" style={{ margin: 0 }}>Mobile</dt><dd style={{ margin: 0, color: "var(--ink)", minWidth: 0 }}>{d.person.phone}</dd></div>
          </dl>
          <div className="pp-small" id="pp-pref-label" style={{ marginBottom: 6 }}>Send my messages by</div>
          <div className="pp-options" role="radiogroup" aria-labelledby="pp-pref-label">
            {(["email", "sms"] as const).map((ch) => (
              <button key={ch} type="button" role="radio" aria-checked={pref === ch} className="pp-option" onClick={() => choose(ch)}
                disabled={ch === "sms" && smsConsent === false} title={ch === "sms" && smsConsent === false ? "You chose not to receive SMS messages." : undefined}>
                <Icon name={ch === "sms" ? "sms" : "mail"} size={13} style={{ marginRight: 6, verticalAlign: "-2px" }} />{ch === "sms" ? "SMS" : "Email"}
              </button>
            ))}
          </div>
          <p className="pp-small" style={{ margin: "10px 0 0" }}>
            Messages go only to your verified email address or mobile. A change applies to future messages only.
            {smsConsent === false ? " You chose not to receive SMS messages." : smsConsent === true ? " You agreed to SMS messages (Esendex)." : ""}
          </p>
        </Card>
        <Card>
          <h2 className="pp-h3">Consent and questionnaire</h2>
          <div className="pp-wrap" style={{ marginBottom: 8 }}>
            {m?.consent === "complete" ? <Pill tone="ok" icon="check">Consent recorded ({m.consentVersion || "BC-3"})</Pill> : <Pill tone="neutral" icon="clock">Consent not recorded yet</Pill>}
            {m?.questionnaire === "complete" ? <Pill tone="ok" icon="check">Questionnaire complete</Pill> : <Pill tone="neutral" icon="clock">Questionnaire {m?.draft ? `${m.draft.sectionsDone} of ${m.draft.sectionsTotal}` : "not started"}</Pill>}
          </div>
          <p className="pp-small" style={{ margin: 0 }}>Invited {m ? fmtDate(m.invitedAt) : ""}. Consent is given before any appointment is confirmed. Sample consent wording for the demo.</p>
        </Card>
        <Card>
          <div className="pp-row" style={{ marginBottom: 8, flexWrap: "wrap" }}><h2 className="pp-h3" style={{ margin: 0 }}>Security information</h2><DemoTag>Demonstration</DemoTag></div>
          <ul className="pp-small" style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 5 }}>
            <li>You entered this preview with an invitation code. No account or password was created.</li>
            <li>Multi-factor authentication is not set up in this demonstration. It would be designed and tested before any production use.</li>
            <li>Account recovery is not available in this preview.</li>
            <li>Last activity: {fmtDateTime(state.clock.nowUtc)}, demo clock.</li>
            <li>Fictional data only. Nothing leaves this browser.</li>
          </ul>
          <div style={{ marginTop: 12 }}><Button icon="lock" onClick={onSignOut}>Sign out of the preview</Button></div>
        </Card>
      </div>
    </div>
  );
}
