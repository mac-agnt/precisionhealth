/* Portal admin, Message templates: confirmation, reminder, report available and invitation, each
   with an email and an SMS variant and merge fields. A save is blocked when the text has clinical
   words (the shared health-information rule plus test names and flags), an unknown or unavailable
   merge field, or a missing required field. Test sends are simulated. */
import { useRef, useState } from "react";
import {
  MERGE_FIELDS, REQUIRED_MERGE_FIELDS, SMS_SEGMENT, TEMPLATE_KIND_LABEL, checkTemplate, fmtShortDateTime, portalAct, staffName, templateById, templatesOf,
} from "../../model";
import type { MessageKind, MessageTemplate, PhState } from "../../model";
import { useNav } from "../../nav-context";
import { usePersona, usePhState } from "../../store";
import { Button, Card, CardHeader, DemoTag, Field, Icon, Pill, TextInput } from "../../ui";
import { KIND_ICON } from "./shared";
import { Note, runAction } from "./PortalAdminParts";

const KIND_ORDER: MessageKind[] = ["invitation", "confirmation", "reminder", "report_available"];
const KIND_WHEN: Record<MessageKind, string> = {
  invitation: "Sent when staff invite or re-invite someone.",
  confirmation: "Sent when a booking is confirmed or moved.",
  reminder: "Sent before the appointment, at the programme's reminder lead time.",
  report_available: "Sent when a doctor releases a report. Says only that a document is ready.",
};

export default function TemplatesView() {
  const nav = useNav();
  const state = usePhState();
  const all = templatesOf(state);
  const selected = templateById(state, nav.params.template || "") || all[0];
  const pick = (id: string) => nav.setParams({ ...nav.params, template: id });
  return (
    <div className="ph-split pa-tpl-split">
      <div className="ph-stack">
        <Card pad="sm">
          <div className="pa-tpl-list" role="listbox" aria-label="Message templates">
            {KIND_ORDER.map((k) => (
              <div key={k} className="pa-tpl-group">
                <div className="pa-tpl-kind"><Icon name={KIND_ICON[k]} size={13} />{TEMPLATE_KIND_LABEL[k]}</div>
                <div className="pa-tpl-row">
                  {all.filter((t) => t.kind === k).sort((a, b) => (a.channel === b.channel ? 0 : a.channel === "email" ? -1 : 1)).map((t) => (
                    <button key={t.id} type="button" role="option" aria-selected={t.id === selected.id} className={"pa-tpl-item" + (t.id === selected.id ? " on" : "")} onClick={() => pick(t.id)}>
                      <Icon name={t.channel === "sms" ? "sms" : "mail"} size={13} />
                      <span className="ph-grow">{t.channel === "sms" ? "SMS" : "Email"}</span>
                      <span className="ph-faint ph-num" style={{ fontSize: 11 }}>v{t.version}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <CardHeader title="Rules every template follows" />
          <ul className="ph-dim pa-rules">
            <li>No results, diagnoses, test names or abnormality flags (MSG-02). The check uses the same health-information rule as invitations, plus test names such as LDL, PSA and ECG.</li>
            <li>A notification is not proof the participant read anything. Report access is recorded only when they open it.</li>
            <li>Only verified destinations, through Esendex for SMS. Delivery is simulated.</li>
            <li>Every save is a new version. Messages already sent keep the wording they went out with.</li>
          </ul>
        </Card>
      </div>
      <TemplateEditor key={selected.id + ":" + selected.version} state={state} t={selected} />
    </div>
  );
}

function TemplateEditor({ state, t }: { state: PhState; t: MessageTemplate }) {
  const p = usePersona();
  const canEdit = p.perms.has("portal.admin");
  const [subject, setSubject] = useState(t.subject);
  const [body, setBody] = useState(t.body);
  const [err, setErr] = useState<string | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const check = checkTemplate(state, t.kind, t.channel, subject, body);
  const dirty = subject !== t.subject || body !== t.body;
  const fields = MERGE_FIELDS.filter((f) => f.kinds.includes(t.kind));
  const insert = (key: string) => {
    const el = bodyRef.current;
    const token = `{{${key}}}`;
    if (!el) { setBody((b) => b + token); return; }
    const at = el.selectionStart ?? body.length, end = el.selectionEnd ?? at;
    const next = body.slice(0, at) + token + body.slice(end);
    setBody(next);
    setErr(null);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(at + token.length, at + token.length); });
  };
  const save = () => { const r = runAction(portalAct.saveTemplate(t.id, subject, body)); if (!r.ok) setErr(r.message || "That could not be saved."); };
  const ch = t.channel === "sms" ? "SMS" : "email";
  return (
    <div className="ph-stack">
      <Card>
        <CardHeader
          eyebrow={`${TEMPLATE_KIND_LABEL[t.kind]} · ${t.channel === "sms" ? "SMS" : "Email"}`}
          title={`${TEMPLATE_KIND_LABEL[t.kind]} ${ch} template`}
          sub={<>{KIND_WHEN[t.kind]} Version {t.version}, saved {fmtShortDateTime(t.updatedAt)} by {t.updatedBy === "system" ? "the baseline" : staffName(state, t.updatedBy)}.</>}
          right={<>{dirty ? <Pill tone="warn" icon="edit">Unsaved</Pill> : <Pill tone="ok" icon="check">v{t.version} in use</Pill>}</>}
        />
        {!canEdit ? <div style={{ marginBottom: 12 }}><Note>{p.name} ({p.roleLabel}) can read templates. Editing needs the portal administration permission.</Note></div> : null}
        <div className="pa-form">
          {t.channel === "email" ? (
            <Field label="Subject" htmlFor="pa-tpl-subject">
              <TextInput id="pa-tpl-subject" value={subject} disabled={!canEdit} onChange={(e) => { setSubject(e.target.value); setErr(null); }} maxLength={120} />
            </Field>
          ) : null}
          <Field label="Message" htmlFor="pa-tpl-body" help={t.channel === "sms" ? `${SMS_SEGMENT} characters per SMS segment, counted with sample values.` : "Plain text. Line breaks are kept."}>
            <textarea id="pa-tpl-body" ref={bodyRef} className="ph-input" style={{ width: "100%" }} rows={t.channel === "sms" ? 4 : 9} value={body} disabled={!canEdit} onChange={(e) => { setBody(e.target.value); setErr(null); }} aria-invalid={check.errors.length > 0 || undefined} />
          </Field>
          {canEdit ? (
            <div>
              <div className="ph-label">Insert a merge field</div>
              <div className="pd-chip-row">
                {fields.map((f) => (
                  <button key={f.key} type="button" className="ph-chip pa-merge" onClick={() => insert(f.key)} title={f.label}>
                    {`{{${f.key}}}`}{REQUIRED_MERGE_FIELDS[t.kind].includes(f.key) ? <span className="ph-faint" style={{ fontSize: 10.5 }}>required</span> : null}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
        {check.errors.length || check.warnings.length ? (
          <ul className="pa-errs" role={check.errors.length ? "alert" : "status"}>
            {check.errors.map((e) => <li key={e}><Icon name="x" size={11} stroke={2.2} style={{ color: "var(--bad)", marginRight: 6, verticalAlign: "-1px" }} />{e}</li>)}
            {check.warnings.map((w) => <li key={w} className="warn"><Icon name="alert" size={11} stroke={2.2} style={{ color: "var(--warn)", marginRight: 6, verticalAlign: "-1px" }} />{w}</li>)}
          </ul>
        ) : <div className="pa-ok"><Icon name="check" size={12} stroke={2.2} /> No clinical words. Every merge field is known and the required ones are present.</div>}
        {err ? <div className="ph-err" role="alert">{err}</div> : null}
        {canEdit ? (
          <div className="ph-wrap" style={{ marginTop: 12 }}>
            <Button variant="primary" icon="check" disabled={!dirty || check.errors.length > 0} onClick={save}>Save as v{t.version + 1}</Button>
            <Button variant="ghost" disabled={!dirty} onClick={() => { setSubject(t.subject); setBody(t.body); setErr(null); }}>Discard changes</Button>
            <Button icon="send" disabled={dirty || check.errors.length > 0} title={dirty ? "Save first, so the test uses the saved version." : undefined} onClick={() => runAction(portalAct.testSendTemplate(t.id))}>Send test to me (simulated)</Button>
          </div>
        ) : null}
      </Card>
      <Card>
        <CardHeader title="Preview with sample values" sub="A fictional participant on the IBM programme. Real messages use the participant's own details." right={<DemoTag>Sample</DemoTag>} />
        <div className={"pa-msg-preview " + t.channel}>
          {t.channel === "email" ? <div className="pa-msg-subject">{check.preview.subject || <span className="ph-faint">No subject</span>}</div> : null}
          <div className="pa-msg-body">{check.preview.body || <span className="ph-faint">No message</span>}</div>
          {t.channel === "sms" ? <div className="pa-msg-meta ph-num">{check.preview.body.length} characters, {check.smsSegments} segment{check.smsSegments === 1 ? "" : "s"}</div> : null}
        </div>
      </Card>
      {t.history.length ? (
        <Card>
          <CardHeader title="Earlier versions" sub="Kept unchanged for the audit trail." />
          <ul className="pa-history">
            {t.history.slice().reverse().map((h) => (
              <li key={h.version}>
                <span className="pa-history-when"><strong>v{h.version}</strong> {fmtShortDateTime(h.at)}</span>
                <span className="ph-dim">{h.by === "system" ? "Baseline" : staffName(state, h.by)}. {h.subject ? `"${h.subject}". ` : ""}{h.body.length > 140 ? h.body.slice(0, 140) + "..." : h.body}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
