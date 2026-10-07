/* Portal admin, Portal content: what each programme's participant portal says and the booking
   rules it applies. Every save publishes a new numbered version and the portal reads it straight
   away: booking header, venue line, welcome text, support contact, Before you arrive, cut-offs,
   slot hold, one active booking, report delivery default and reminder lead time. Consent form and
   privacy notice versions go through a separate draft and approval step, and participants keep
   the version they accepted. */
import { useState } from "react";
import {
  DEFAULT_WELCOME, DELIVERY_MODE_LABEL, DOC_LABEL, DOC_VERSION_PATTERN, PROGRAMME_ORDER, REMINDER_LEAD_OPTIONS, contentChanges, contentErrors, contentHistory, currentDoc,
  cutoffText, docAcceptance, docVersions, fmtDate, fmtShortDateTime, ix, nextDocVersion, pendingDoc, plural, portalAct, portalContent, staffName,
} from "../../model";
import type { ContentFields, PhState, PortalDocVersion, ProgrammeId, ReportDeliveryMode } from "../../model";
import { useNav } from "../../nav-context";
import { usePersona, usePhState } from "../../store";
import { Button, Card, CardHeader, DemoTag, Field, Icon, Pill, Segmented, Select, Switch, TextInput, Textarea } from "../../ui";
import { withParams } from "./shared";
import { Note, runAction } from "./PortalAdminParts";

const fieldsOf = (c: ContentFields): ContentFields => ({
  heading: c.heading, venueLine: c.venueLine, welcome: c.welcome, supportEmail: c.supportEmail, supportPhone: c.supportPhone, prep: c.prep.slice(),
  cancelCutoffHours: c.cancelCutoffHours, rescheduleCutoffHours: c.rescheduleCutoffHours, holdMinutes: c.holdMinutes, oneActiveBooking: c.oneActiveBooking,
  reportDelivery: c.reportDelivery, reminderLeadHours: c.reminderLeadHours,
});

export default function ContentView() {
  const nav = useNav();
  const state = usePhState();
  const I = ix(state);
  const programmeId = (PROGRAMME_ORDER as string[]).includes(nav.params.programme) ? (nav.params.programme as ProgrammeId) : PROGRAMME_ORDER[0];
  const cur = portalContent(state, programmeId);
  return (
    <div className="ph-stack">
      <div className="pa-toolbar">
        <Segmented label="Programme" value={programmeId} onChange={(v) => nav.setParams(withParams(nav.params, { programme: v }))}
          options={PROGRAMME_ORDER.map((id) => ({ id, label: I.programmeById.get(id)?.clientName || id }))} />
        <span className="ph-dim" style={{ fontSize: 12 }}>{I.programmeById.get(programmeId)?.name}. Portal content v{cur.version}, published {fmtShortDateTime(cur.savedAt)} by {cur.savedBy === "system" ? "the baseline" : staffName(state, cur.savedBy)}.</span>
      </div>
      {/* Keyed by programme and version, so the form restarts from what is published. */}
      <ContentEditor key={programmeId + ":" + cur.version} state={state} programmeId={programmeId} />
    </div>
  );
}

function ContentEditor({ state, programmeId }: { state: PhState; programmeId: ProgrammeId }) {
  const p = usePersona();
  const nav = useNav();
  const I = ix(state);
  const prog = I.programmeById.get(programmeId)!;
  const cur = portalContent(state, programmeId);
  const [f, setF] = useState<ContentFields>(() => fieldsOf(cur));
  const [prepText, setPrepText] = useState(cur.prep.join("\n"));
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const canEdit = p.perms.has("portal.admin");
  const draft: ContentFields = { ...f, prep: prepText.split("\n").map((x) => x.trim()).filter(Boolean) };
  const changed = contentChanges(cur, draft);
  const errors = contentErrors(draft);
  const set = <K extends keyof ContentFields>(k: K, v: ContentFields[K]) => { setF((x) => ({ ...x, [k]: v })); setErr(null); };
  const num = (v: string) => (v.trim() === "" ? Number.NaN : Number(v));
  const publish = () => {
    const r = runAction(portalAct.saveContent(programmeId, draft, note));
    if (!r.ok) setErr(r.message || "That could not be published.");
  };
  const tpl = state.forms.templates.find((t) => t.id === prog.templateId);
  const ro = !canEdit;

  return (
    <div className="ph-split">
      <div className="ph-stack">
        {!canEdit ? <Note>{p.name} ({p.roleLabel}) can read the portal content. Changing it needs the portal administration permission (operations, programme oversight or the medical director).</Note> : null}
        <Card>
          <CardHeader title="Booking page" sub="The header and venue line sit at the top of the booking steps. The welcome line opens the participant's overview." />
          <div className="pa-form">
            <Field label="Booking page header" htmlFor="pa-heading" help="For example Comprehensive Health Screening. Shown with the venue line.">
              <TextInput id="pa-heading" value={f.heading} disabled={ro} onChange={(e) => set("heading", e.target.value)} maxLength={80} />
            </Field>
            <Field label="Venue line" htmlFor="pa-venue" help={`Leave blank to show each participant's own site (${prog.sites.join(" or ")}).`}>
              <TextInput id="pa-venue" value={f.venueLine} disabled={ro} onChange={(e) => set("venueLine", e.target.value)} placeholder="Each participant's own site" maxLength={90} />
            </Field>
            <Field label="Welcome text" htmlFor="pa-welcome" help={`Up to 160 characters. Default: ${DEFAULT_WELCOME}`}>
              <Textarea id="pa-welcome" rows={2} value={f.welcome} disabled={ro} onChange={(e) => set("welcome", e.target.value)} maxLength={160} />
            </Field>
          </div>
        </Card>
        <Card>
          <CardHeader title="Support contact and preparation" sub="The support email appears wherever the portal says contact us, including the locked account message." />
          <div className="pa-form">
            <div className="pa-form-grid">
              <Field label="Support email" htmlFor="pa-email"><TextInput id="pa-email" type="email" value={f.supportEmail} disabled={ro} onChange={(e) => set("supportEmail", e.target.value)} /></Field>
              <Field label="Support phone" htmlFor="pa-phone"><TextInput id="pa-phone" type="tel" value={f.supportPhone} disabled={ro} onChange={(e) => set("supportPhone", e.target.value)} /></Field>
            </div>
            <Field label="Before you arrive" htmlFor="pa-prep" help="One instruction per line, up to 8. Shown with the appointment and in the booking confirmation.">
              <Textarea id="pa-prep" rows={4} value={prepText} disabled={ro} onChange={(e) => { setPrepText(e.target.value); setErr(null); }} />
            </Field>
          </div>
        </Card>
        <Card>
          <CardHeader title="Booking rules" sub="Participants can change or cancel online only within these cut-offs. Staff with Manage bookings can still help after a cut-off." right={<DemoTag>Values to confirm</DemoTag>} />
          <div className="pa-form">
            <div className="pa-form-grid">
              <Field label="Cancellation cut-off (hours before)" htmlFor="pa-cx" help="0 means until check-in.">
                <TextInput id="pa-cx" type="number" min={0} max={72} inputMode="numeric" value={Number.isNaN(f.cancelCutoffHours) ? "" : String(f.cancelCutoffHours)} disabled={ro} onChange={(e) => set("cancelCutoffHours", num(e.target.value))} />
              </Field>
              <Field label="Reschedule cut-off (hours before)" htmlFor="pa-rx" help="The new time is reserved before the old one is released.">
                <TextInput id="pa-rx" type="number" min={0} max={72} inputMode="numeric" value={Number.isNaN(f.rescheduleCutoffHours) ? "" : String(f.rescheduleCutoffHours)} disabled={ro} onChange={(e) => set("rescheduleCutoffHours", num(e.target.value))} />
              </Field>
              <Field label="Slot hold (minutes)" htmlFor="pa-hold" help="The specification proposes 5.">
                <TextInput id="pa-hold" type="number" min={1} max={15} inputMode="numeric" value={Number.isNaN(f.holdMinutes) ? "" : String(f.holdMinutes)} disabled={ro} onChange={(e) => set("holdMinutes", num(e.target.value))} />
              </Field>
              <Field label="Reminder lead time" htmlFor="pa-lead" help="New bookings inside it get the confirmation only.">
                <Select id="pa-lead" value={String(f.reminderLeadHours)} disabled={ro} onChange={(e) => set("reminderLeadHours", Number(e.target.value))}>
                  {REMINDER_LEAD_OPTIONS.map((h) => <option key={h} value={h}>{h} hours before{h === 24 ? " (MSG-02)" : ""}</option>)}
                </Select>
              </Field>
            </div>
            <div className="ph-row-flex" style={{ gap: 10, alignItems: "flex-start" }}>
              <Switch on={f.oneActiveBooking} disabled={ro} onChange={(v) => set("oneActiveBooking", v)} label="One active booking per participant on this programme" />
              <div style={{ fontSize: 12.5, lineHeight: 1.45 }}>
                <div style={{ color: "var(--ink)" }}>One active booking per participant</div>
                <div className="ph-faint" style={{ fontSize: 11.5 }}>SCH-02 default. Turn off only for a programme that books more than one appointment per person.</div>
              </div>
            </div>
          </div>
        </Card>
        <Card>
          <CardHeader title="Report delivery default" sub="What a participant gets until they choose for themselves in Account. Messages never contain results." />
          <div className="pa-radios" role="radiogroup" aria-label="Report delivery default">
            {(["portal", "portal_pdf"] as ReportDeliveryMode[]).map((m) => (
              <label key={m} className={"pa-radio" + (f.reportDelivery === m ? " on" : "")}>
                <input type="radio" name="pa-delivery" checked={f.reportDelivery === m} disabled={ro} onChange={() => set("reportDelivery", m)} />
                <span>
                  <span style={{ color: "var(--ink)", fontWeight: 500 }}>{DELIVERY_MODE_LABEL[m]}</span>
                  <span className="ph-faint" style={{ display: "block", fontSize: 11.5 }}>{m === "portal" ? "The report appears in My results once a doctor releases it." : "As today: an encrypted PDF by email, with the access code by SMS through Esendex (simulated)."}</span>
                </span>
              </label>
            ))}
          </div>
        </Card>
        {canEdit ? (
          <Card className="pa-publish">
            <div className="ph-row-flex" style={{ flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
              <div className="ph-grow" style={{ minWidth: 220 }}>
                <Field label={`Change note for v${cur.version + 1} (optional)`} htmlFor="pa-note">
                  <TextInput id="pa-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: Sisk asked for a 24-hour cancellation cut-off" maxLength={200} />
                </Field>
              </div>
              <div className="ph-wrap">
                <Button variant="ghost" disabled={!changed.length} onClick={() => { setF(fieldsOf(cur)); setPrepText(cur.prep.join("\n")); setNote(""); setErr(null); }}>Discard changes</Button>
                <Button variant="primary" icon="check" disabled={!changed.length || errors.length > 0} onClick={publish}>Publish v{cur.version + 1}</Button>
              </div>
            </div>
            <div className="ph-dim" style={{ fontSize: 12, marginTop: 8 }}>
              {changed.length ? <>Changes: {changed.join(", ")}. The participant portal shows them as soon as you publish.</> : "No changes. Edit a field to publish a new version."}
            </div>
            {errors.length ? <ul className="pa-errs" role="alert">{errors.map((e) => <li key={e}>{e}</li>)}</ul> : null}
            {err ? <div className="ph-err" role="alert">{err}</div> : null}
          </Card>
        ) : null}
        <HistoryCard state={state} programmeId={programmeId} />
      </div>

      <div className="ph-stack">
        <PreviewCard state={state} programmeId={programmeId} f={draft} unsaved={changed.length > 0} />
        <DocumentsCard state={state} programmeId={programmeId} />
        <Card>
          <CardHeader title="Questionnaire in use" sub="Clinically owned and versioned in Forms & Templates. The portal asks it before a booking can be confirmed." />
          <div className="ph-row-flex" style={{ gap: 10, flexWrap: "wrap" }}>
            <span className="ph-grow" style={{ fontSize: 13, color: "var(--ink)" }}>{tpl?.name || prog.templateId} <span className="ph-faint">v{tpl?.currentVersion || "?"}</span></span>
            <Button size="sm" icon="layers" onClick={() => nav.go({ page: "Programmes", tab: "forms-templates", params: { template: prog.templateId } })}>Open in Forms & Templates</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

/** How the participant sees it, live from the form, before anything is published. */
function PreviewCard({ state, programmeId, f, unsaved }: { state: PhState; programmeId: ProgrammeId; f: ContentFields; unsaved: boolean }) {
  const prog = ix(state).programmeById.get(programmeId)!;
  const site = f.venueLine.trim() || prog.sites[0];
  const consent = currentDoc(state, programmeId, "consent")?.version;
  const privacy = currentDoc(state, programmeId, "privacy")?.version;
  const okNumbers = [f.cancelCutoffHours, f.rescheduleCutoffHours, f.holdMinutes].every((n) => Number.isFinite(n));
  return (
    <Card>
      <CardHeader title="Participant preview" sub={unsaved ? "Showing your unpublished changes." : "As participants see it now."} right={unsaved ? <Pill tone="warn" icon="edit">Unpublished</Pill> : <Pill tone="ok" icon="check">Live</Pill>} />
      <div className="pa-preview" aria-label="Participant portal preview">
        <div className="pa-preview-banner">
          <div className="pa-preview-title">{[f.heading || "Booking page header", ...site.split(", ")].join(" · ")}</div>
          <div className="pa-preview-small">Any issues, please contact us at <span className="ph-link">{f.supportEmail || "support email"}</span></div>
        </div>
        <div className="pa-preview-hello">Hello, Orla</div>
        <div className="pa-preview-small">{f.welcome || "Welcome text"}</div>
        <div className="pa-preview-box">
          <div className="pa-preview-label">Before you arrive</div>
          <ul>{f.prep.length ? f.prep.map((x, i) => <li key={i}>{x}</li>) : <li className="ph-faint">No instructions</li>}</ul>
        </div>
        <div className="pa-preview-box">
          <div className="pa-preview-label">Your appointment</div>
          <div className="pa-preview-small">{okNumbers ? cutoffText(f) : "Enter the cut-offs to see the wording."}</div>
          <div className="pa-preview-small">{okNumbers ? `A chosen time is held for ${plural(f.holdMinutes, "minute")} while you confirm. ` : ""}Reminder {f.reminderLeadHours} hours before. {f.oneActiveBooking ? "One appointment per person." : "More than one appointment allowed."}</div>
        </div>
        <div className="pa-preview-box">
          <div className="pa-preview-label">Report delivery</div>
          <div className="pa-preview-small">{DELIVERY_MODE_LABEL[f.reportDelivery]} unless you choose otherwise.</div>
        </div>
        <div className="pa-preview-small ph-faint">Consent form {consent} · Privacy notice {privacy} · Support {f.supportPhone}</div>
      </div>
    </Card>
  );
}

function DocumentsCard({ state, programmeId }: { state: PhState; programmeId: ProgrammeId }) {
  const p = usePersona();
  const acc = docAcceptance(state, programmeId);
  return (
    <Card>
      <CardHeader title="Consent and privacy notice" sub="Drafted by an administrator, published after a different approver signs off. Participants keep the version they accepted; new acceptances record the new one." />
      {(["consent", "privacy"] as Array<PortalDocVersion["kind"]>).map((kind) => (
        <DocBlock key={kind} state={state} programmeId={programmeId} kind={kind} accepted={acc[kind]} canDraft={p.perms.has("portal.admin")} canApprove={p.perms.has("portal.approve")} meId={p.id} />
      ))}
    </Card>
  );
}

function DocBlock({ state, programmeId, kind, accepted, canDraft, canApprove, meId }: {
  state: PhState; programmeId: ProgrammeId; kind: PortalDocVersion["kind"]; accepted: Array<{ version: string; n: number }>; canDraft: boolean; canApprove: boolean; meId: string;
}) {
  const cur = currentDoc(state, programmeId, kind);
  const pending = pendingDoc(state, programmeId, kind);
  const older = docVersions(state, programmeId, kind).filter((d) => d.status !== "published" && d.status !== "pending_approval").reverse();
  const [drafting, setDrafting] = useState(false);
  const [version, setVersion] = useState(() => nextDocVersion(state, programmeId, kind));
  const [summary, setSummary] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const label = DOC_LABEL[kind];
  const total = accepted.reduce((n, x) => n + x.n, 0);
  return (
    <div className="pa-doc">
      <div className="ph-row-flex" style={{ gap: 8, flexWrap: "wrap" }}>
        <span className="ph-grow" style={{ color: "var(--ink)", fontWeight: 500, fontSize: 13 }}>{label}</span>
        {cur ? <Pill tone="ok" icon="check">Current {cur.version}</Pill> : null}
        {pending ? <Pill tone="warn" icon="clock">{pending.version} awaiting approval</Pill> : null}
      </div>
      {cur ? <div className="ph-faint" style={{ fontSize: 11.5, marginTop: 3 }}>Published {fmtDate(cur.publishedAt || cur.draftedAt)}. {cur.summary}</div> : null}
      <div className="pa-accept">
        {accepted.length ? accepted.map((a) => <span key={a.version} className="pd-test"><strong>{a.version}</strong> accepted by {a.n}</span>) : <span className="ph-faint" style={{ fontSize: 12 }}>No acceptances yet.</span>}
        {total ? <span className="ph-faint" style={{ fontSize: 11.5 }}>{total} in all</span> : null}
      </div>
      {pending ? (
        <div className="pa-action-panel">
          <div className="pa-action-title">{label} {pending.version}, drafted by {staffName(state, pending.draftedBy)} on {fmtShortDateTime(pending.draftedAt)}</div>
          <div className="pa-action-body"><p>{pending.summary}</p></div>
          {canApprove && pending.draftedBy !== meId ? (
            <div className="ph-wrap">
              <Button size="sm" variant="primary" icon="check" onClick={() => runAction(portalAct.decideDocument(pending.id, true))}>Approve and publish</Button>
              <Button size="sm" variant="ghost" icon="x" onClick={() => runAction(portalAct.decideDocument(pending.id, false))}>Reject</Button>
            </div>
          ) : (
            <div className="ph-faint" style={{ fontSize: 11.5 }}>{pending.draftedBy === meId ? "You drafted this version, so a different approver decides it." : "Approval needs the medical director or programme oversight."} Switch persona from the top bar to approve it.</div>
          )}
        </div>
      ) : canDraft ? (
        drafting ? (
          <div className="pa-action-panel">
            <div className="pa-action-title">Draft a new {label.toLowerCase()} version</div>
            <div className="pa-form-grid">
              <Field label="Version" htmlFor={`pa-v-${kind}`} help={`Like ${DOC_VERSION_PATTERN[kind].example}`}>
                <TextInput id={`pa-v-${kind}`} value={version} onChange={(e) => { setVersion(e.target.value); setErr(null); }} />
              </Field>
            </div>
            <Field label="What changed" htmlFor={`pa-s-${kind}`}>
              <Textarea id={`pa-s-${kind}`} rows={2} value={summary} onChange={(e) => { setSummary(e.target.value); setErr(null); }} placeholder={kind === "consent" ? "For example: retention period confirmed by the DPO" : "For example: names the new SMS provider"} />
            </Field>
            {err ? <div className="ph-err" role="alert">{err}</div> : null}
            <div className="ph-wrap" style={{ marginTop: 10 }}>
              <Button size="sm" variant="primary" icon="send" onClick={() => { const r = runAction(portalAct.draftDocument(programmeId, kind, version, summary)); if (r.ok) { setDrafting(false); setSummary(""); } else setErr(r.message || "That could not be drafted."); }}>Send for approval</Button>
              <Button size="sm" variant="ghost" onClick={() => setDrafting(false)}>Cancel</Button>
            </div>
          </div>
        ) : <div style={{ marginTop: 8 }}><Button size="sm" icon="plus" onClick={() => { setVersion(nextDocVersion(state, programmeId, kind)); setDrafting(true); }}>Draft new version</Button></div>
      ) : null}
      {older.length ? (
        <details className="pa-older">
          <summary>Earlier and rejected versions ({older.length})</summary>
          <ul>{older.map((d) => <li key={d.id}>{d.version}: {d.status === "superseded" ? "superseded" : "rejected"}{d.decidedAt ? `, ${d.status === "superseded" ? "approved" : "rejected"} ${fmtDate(d.decidedAt)} by ${staffName(state, d.decidedBy)}` : ""}. {d.summary}</li>)}</ul>
        </details>
      ) : null}
    </div>
  );
}

function HistoryCard({ state, programmeId }: { state: PhState; programmeId: ProgrammeId }) {
  const list = contentHistory(state, programmeId);
  return (
    <Card>
      <CardHeader title="Version history" sub="Every published version is kept. The portal always shows the newest." />
      <ul className="pa-history">
        {list.map((v, i) => {
          const prev = list[i + 1];
          const changes = prev ? contentChanges(prev, v) : [];
          return (
            <li key={v.version}>
              <span className="pa-history-when"><strong>v{v.version}</strong> {fmtShortDateTime(v.savedAt)}</span>
              <span>
                {i === 0 ? <Pill tone="ok" icon="check" style={{ marginRight: 6 }}>Live</Pill> : null}
                {v.savedBy === "system" ? "Baseline" : staffName(state, v.savedBy)}{changes.length ? `: ${changes.join(", ")}` : ""}.{v.note ? <span className="ph-dim"> {v.note}</span> : null}
              </span>
            </li>
          );
        })}
      </ul>
      {list.length === 1 ? <div className="ph-faint" style={{ fontSize: 11.5, marginTop: 6 }}><Icon name="info" size={11} style={{ verticalAlign: "-1px" }} /> No changes since the baseline.</div> : null}
    </Card>
  );
}

