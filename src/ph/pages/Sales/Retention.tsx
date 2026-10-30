/* Retention: keep clients coming back. The rebooking rate on top, then the outbox ("Results are out"
   emails queued when results are released for a programme), rebooking reminders three months before
   each anniversary to the named HR contact, client contacts (with "left the company"), the branded
   email templates, and what has been sent. Every email is simulated.
   Deep links: #/Sales/recall, #/Sales/recall?template=rebooking. */
import { useMemo, useState } from "react";
import { RET_MERGE_FIELDS, RET_TEMPLATE_IDS, fmtDate, fmtDateLong, retSampleValues } from "../../model";
import type { RetContact, RetEmail, RetTemplateId } from "../../model";
import { useNav } from "../../nav-context";
import { dispatch, usePersona, usePhState } from "../../store";
import { Button, Card, CardHeader, DemoTag, EmptyState, Field, Icon, Modal, PageHeader, Pill, TextInput, Textarea } from "../../ui";
import type { Tone } from "../../ui";
import { salesAct } from "./actions";
import { onbAct } from "./onbActions";
import {
  RET_REMINDER_MONTHS, longDate, retClients, retRebookingRate, retReleaseQueue, retReleaseValues, retReminderValues, retReminders, retRender,
} from "./onbSelect";
import type { RetClient, RetReleaseItem, RetReminder, RetReminderState } from "./onbSelect";
import { BrandedEmail } from "./onbShared";
import { salesRecalls } from "../../model";
import { useSalesRights } from "./shared";
import { JourneyStrip } from "../Journey/JourneyStrip";
import { nextYearLeadAction } from "../Journey/model";

type Preview = { to: string; subject: string; body: string; sentAt?: string | null; action?: { label: string; run: () => void } };

const REM_LOOK: Record<RetReminderState, { tone: Tone; label: string }> = {
  due: { tone: "warn", label: "Due now" }, scheduled: { tone: "neutral", label: "Scheduled" }, sent: { tone: "ok", label: "Sent" }, no_contact: { tone: "bad", label: "No contact" },
};

export default function Retention() {
  const state = usePhState();
  const nav = useNav();
  const p = usePersona();
  const rate = retRebookingRate(state);
  const queue = retReleaseQueue(state);
  const reminders = retReminders(state);
  const clients = retClients(state);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [showRate, setShowRate] = useState(false);
  const [leftFor, setLeftFor] = useState<{ client: RetClient; mode: "left" | "choose" } | null>(null);
  const [showAllRem, setShowAllRem] = useState(false);
  const [showAllContacts, setShowAllContacts] = useState(false);
  const editing = RET_TEMPLATE_IDS.includes(nav.params.template as RetTemplateId) ? (nav.params.template as RetTemplateId) : null;
  const due = reminders.filter((r) => r.state === "due" || r.state === "no_contact");
  const noContact = clients.filter((c) => !c.current);
  const remShown = showAllRem ? reminders : reminders.filter((r) => r.state !== "sent").slice(0, 6);
  const staff = !p.isParticipant;

  const previewRelease = (it: RetReleaseItem) => {
    const r = retRender(state, "results_out", retReleaseValues(state, it));
    setPreview({ to: it.contact ? `${it.contact.name} <${it.contact.email}>` : "No contact chosen", ...r, action: it.contact && staff ? { label: "Send (simulated)", run: () => dispatch(onbAct.sendResultsOut(it.programmeId)) } : undefined });
  };
  const previewReminder = (r: RetReminder) => {
    const sent = r.emailId ? state.onboarding.emails.find((e) => e.id === r.emailId) : undefined;
    if (sent) { setPreview({ to: `${sent.toName} <${sent.toEmail}>`, subject: sent.subject, body: sent.body, sentAt: sent.sentAt }); return; }
    const m = retRender(state, "rebooking", retReminderValues(state, r));
    setPreview({ to: r.contact ? `${r.contact.name} <${r.contact.email}>` : "No contact chosen", ...m, action: r.contact && staff ? { label: "Send (simulated)", run: () => dispatch(onbAct.sendRebooking(r.recall.id)) } : undefined });
  };
  const previewSent = (e: RetEmail) => setPreview({ to: `${e.toName} <${e.toEmail}>`, subject: e.subject, body: e.body, sentAt: e.sentAt });
  const clientOf = (company: string) => clients.find((c) => c.company === company);

  return (
    <div className="ph-page">
      <PageHeader title="Retention" sub="Keep clients coming back: tell them when results are out, remind the right person to rebook, and keep contacts up to date." />
      <div className="ph-stack">
        {/* ---------------- rebooking rate ---------------- */}
        <div className="rt-top">
          <div className="rt-rate">
            <div className="rt-rate-label">Rebooking rate</div>
            <div className="rt-rate-num">{rate.pct}<span>%</span></div>
            <div className="rt-rate-sub"><b>{rate.rebooked} of {rate.base}</b> clients screened in {rate.year} have booked again.</div>
            <div className="rt-rate-bar"><span style={{ width: `${rate.pct}%` }} /></div>
            <button type="button" className="rt-rate-more" onClick={() => setShowRate((v) => !v)}>{showRate ? "Hide the numbers" : "See the numbers"} <Icon name={showRate ? "up" : "down"} size={12} /></button>
          </div>
          <div className="rt-kpis">
            <button type="button" className="rt-kpi" onClick={() => document.getElementById("rt-outbox")?.scrollIntoView({ behavior: "smooth" })}><span className="rt-kpi-n">{queue.length}</span><span>Results emails waiting</span></button>
            <button type="button" className="rt-kpi" onClick={() => document.getElementById("rt-rem")?.scrollIntoView({ behavior: "smooth" })}><span className="rt-kpi-n">{due.length}</span><span>Rebooking reminders due</span></button>
            <button type="button" className="rt-kpi" onClick={() => document.getElementById("rt-contacts")?.scrollIntoView({ behavior: "smooth" })}><span className="rt-kpi-n">{noContact.length}</span><span>Clients with no contact</span></button>
          </div>
        </div>
        {showRate ? (
          <Card>
            <CardHeader title={`${rate.year} clients and whether they rebooked`} sub="A client counts as rebooked when they were screened again, or a new lead from them was won, after their last screening." />
            <div className="rt-rate-rows">
              {rate.rows.map((r) => (
                <div key={r.company} className="rt-rate-row">
                  <span className={"rt-dot" + (r.rebooked ? " on" : "")}>{r.rebooked ? <Icon name="check" size={10} stroke={2.4} /> : null}</span>
                  <b className="ph-grow">{r.company}</b>
                  <span className="ph-dim">Screened {fmtDate(r.screenedOn)}</span>
                  <span className={r.rebooked ? "rt-ok" : "ph-faint"}>{r.rebooked ? r.how : `Not yet. Anniversary ${fmtDate(r.anniversary)}`}</span>
                </div>
              ))}
            </div>
          </Card>
        ) : null}

        {/* ---------------- outbox ---------------- */}
        <Card>
          <div id="rt-outbox" />
          <CardHeader title={<>Outbox: results are out <DemoTag>Simulated sending</DemoTag></>} sub="When results are released for a programme, an email to the client's HR contact waits here: results are out, a feedback form link and a note that the invoice is coming." />
          {queue.length ? (
            <div className="rt-list">
              {queue.map((it) => (
                <div key={it.programmeId} className="rt-item">
                  <span className="rt-item-icon"><Icon name="mail" size={16} /></span>
                  <div className="ph-grow">
                    <div className="rt-item-title">{it.company}: {it.programme}</div>
                    <div className="rt-item-sub">{it.newReports} new report{it.newReports === 1 ? "" : "s"} released ({it.released} in total) · To {it.contact ? <b>{it.contact.name}</b> : <span className="rt-bad">no contact chosen</span>}</div>
                    <JourneyStrip programme={it.programmeId} at="retention" mini />
                  </div>
                  <div className="rt-item-act">
                    <Button size="sm" icon="eye" onClick={() => previewRelease(it)}>Preview</Button>
                    {it.contact ? <Button size="sm" variant="primary" icon="send" disabled={!staff} onClick={() => dispatch(onbAct.sendResultsOut(it.programmeId))}>Send (simulated)</Button>
                      : <Button size="sm" onClick={() => { const c = clientOf(it.company); if (c) setLeftFor({ client: c, mode: "choose" }); }}>Choose contact</Button>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="Nothing waiting" icon="check" action={<Button size="sm" icon="arrow" onClick={() => nav.go({ page: "Results", tab: "review" })}>Go to Results, Review</Button>}>
              When a report is released in Results, Review, an email to that client's HR contact appears here.
            </EmptyState>
          )}
        </Card>

        {/* ---------------- rebooking reminders ---------------- */}
        <Card>
          <div id="rt-rem" />
          <CardHeader title="Rebooking reminders" sub={<>Sent to the named HR contact, never a shared inbox, <b>{RET_REMINDER_MONTHS} months before</b> the anniversary of their last screening.</>} />
          <div className="rt-rule"><Icon name="info" size={14} /><span><b>Rule updated:</b> reminders now go 3 months before the anniversary, not about 1 month as before. Neil and Stephen asked for this so clients can hold the same dates.</span></div>
          <div className="rt-list">
            {remShown.map((r) => {
              const look = REM_LOOK[r.state];
              return (
                <div key={r.recall.id} className="rt-item">
                  <div className="rt-date"><span>{fmtDate(r.dueOn).split(" ").slice(0, 2).join(" ")}</span><b>{r.dueOn.slice(0, 4)}</b></div>
                  <div className="ph-grow">
                    <div className="rt-item-title">{r.recall.company} <Pill tone={look.tone}>{look.label}</Pill></div>
                    <div className="rt-item-sub">
                      Anniversary {longDate(r.recall.recallOn)} · {r.contact ? <>To <b>{r.contact.name}</b>, {r.contact.role}</> : <span className="rt-bad">contact left, choose a new one</span>}
                      {r.state === "scheduled" ? ` · in ${r.daysToDue} day${r.daysToDue === 1 ? "" : "s"}` : r.state === "due" && r.daysToDue < 0 ? ` · ${-r.daysToDue} days late` : ""}
                    </div>
                    <JourneyStrip company={r.recall.company} at="retention" mini />
                  </div>
                  <div className="rt-item-act">
                    {r.state === "no_contact" ? <Button size="sm" variant="primary" icon="user" onClick={() => { const c = clientOf(r.recall.company); if (c) setLeftFor({ client: c, mode: "choose" }); }}>Choose contact</Button> : null}
                    <Button size="sm" icon="eye" onClick={() => previewReminder(r)}>Preview</Button>
                    {r.state === "due" || r.state === "scheduled" ? <Button size="sm" variant={r.state === "due" ? "primary" : "secondary"} icon="send" disabled={!staff} onClick={() => dispatch(onbAct.sendRebooking(r.recall.id))}>{r.state === "due" ? "Send (simulated)" : "Send early"}</Button> : null}
                    <Button size="sm" variant={r.state === "sent" ? "primary" : "ghost"} icon="refresh" disabled={!staff} title="Creates a lead in the pipeline for next year's screening" onClick={() => { const x = dispatch(nextYearLeadAction(state, r.recall) as never); if (x.ok && x.id) nav.go({ page: "Sales", tab: "pipeline", params: { lead: x.id } }); }}>Start next year's screening</Button>
                  </div>
                </div>
              );
            })}
          </div>
          {reminders.length > remShown.length || showAllRem ? <div className="rt-more"><Button size="sm" variant="ghost" onClick={() => setShowAllRem((v) => !v)}>{showAllRem ? "Show fewer" : `Show all ${reminders.length}, including sent`}</Button></div> : null}
        </Card>

        <LapsedClients onPreview={setPreview} />

        {/* ---------------- client contacts ---------------- */}
        <Card>
          <div id="rt-contacts" />
          <CardHeader title="Client contacts" sub="Who our emails go to at each client. If someone has left, mark it: reminders stop going to them and you choose who gets them instead." />
          <div className="rt-contacts">
            {(showAllContacts ? clients : clients.filter((c) => !c.current).concat(clients.filter((c) => c.current)).slice(0, 6)).map((c) => (
              <div key={c.key} className={"rt-contact" + (!c.current ? " missing" : "")}>
                <div className="ph-grow">
                  <div className="rt-contact-co">{c.company}</div>
                  {c.current ? <div className="rt-contact-who"><b>{c.current.name}</b> · {c.current.role}<span>{c.current.email}</span></div> : <div className="rt-contact-who rt-bad">No contact. Reminders are on hold.</div>}
                  {c.left.length ? <div className="rt-contact-left">{c.left.map((x) => `${x.name} left ${fmtDate(x.leftOn)}`).join(" · ")}</div> : null}
                </div>
                {staff ? (c.current
                  ? <Button size="sm" variant="ghost" icon="x" onClick={() => setLeftFor({ client: c, mode: "left" })}>Left the company</Button>
                  : <Button size="sm" variant="primary" icon="user" onClick={() => setLeftFor({ client: c, mode: "choose" })}>Choose contact</Button>) : null}
              </div>
            ))}
          </div>
          {clients.length > 6 ? <div className="rt-more"><Button size="sm" variant="ghost" onClick={() => setShowAllContacts((v) => !v)}>{showAllContacts ? "Show fewer" : `Show all ${clients.length} clients`}</Button></div> : null}
        </Card>

        {/* ---------------- templates ---------------- */}
        <Card>
          <CardHeader title="Email templates" sub="Precision Health branded. Edit the words and use merge fields like {company} and {contact_first_name}; they fill in for each client." />
          <div className="rt-tpls">
            {RET_TEMPLATE_IDS.map((id) => {
              const t = state.onboarding.templates[id];
              const r = retRender(state, id, retSampleValues());
              return (
                <button key={id} type="button" className="rt-tpl" onClick={() => nav.setParams({ template: id })}>
                  <div className="rt-tpl-mini"><div className="rt-tpl-head"><Icon name="heart" size={10} /> Precision Health</div><div className="rt-tpl-sub">{r.subject}</div><div className="rt-tpl-lines"><span /><span /><span /></div></div>
                  <div className="rt-tpl-name">{t.name}{t.updatedAt ? <Pill tone="info" icon={null}>Edited</Pill> : null}</div>
                  <div className="rt-tpl-use">{t.use}</div>
                  <span className="rt-tpl-edit"><Icon name="edit" size={12} /> Preview and edit</span>
                </button>
              );
            })}
          </div>
        </Card>

        {/* ---------------- sent ---------------- */}
        <Card>
          <CardHeader title="Sent from Pulse" sub={<>Every client email sent here, newest first. <DemoTag>Simulated</DemoTag></>} />
          <div className="rt-sent">
            {state.onboarding.emails.slice().reverse().slice(0, 12).map((e) => (
              <button key={e.id} type="button" className="rt-sent-row" onClick={() => previewSent(e)}>
                <Icon name="mail" size={13} />
                <span className="ph-grow ph-trunc"><b>{e.subject}</b><span>To {e.toName}</span></span>
                <span className="rt-sent-date">{fmtDate(e.sentAt)}</span>
              </button>
            ))}
          </div>
        </Card>
      </div>

      {preview ? (
        <Modal open width={680} title="Email preview" onClose={() => setPreview(null)}
          footer={<>
            <Button onClick={() => setPreview(null)}>Close</Button>
            {preview.action ? <Button variant="primary" icon="send" onClick={() => { preview.action!.run(); setPreview(null); }}>{preview.action.label}</Button> : null}
          </>}>
          <BrandedEmail to={preview.to} subject={preview.subject} body={preview.body} sentAt={preview.sentAt} />
        </Modal>
      ) : null}
      {leftFor ? <ContactModal client={leftFor.client} mode={leftFor.mode} onClose={() => setLeftFor(null)} /> : null}
      {editing ? <TemplateEditor id={editing} onClose={() => nav.setParams({})} /> : null}
    </div>
  );
}

/* ---------------------------------------------------------------- contact left / choose contact */

function ContactModal({ client, mode, onClose }: { client: RetClient; mode: "left" | "choose"; onClose: () => void }) {
  const state = usePhState();
  const [name, setName] = useState("");
  const [role, setRole] = useState("HR Manager");
  const [email, setEmail] = useState("");
  const leftEmails = new Set(client.left.map((x) => x.email.toLowerCase()));
  if (mode === "left" && client.current) leftEmails.add(client.current.email.toLowerCase());
  /* People we already know at this company: lead contacts and the contact on record. */
  const known: RetContact[] = useMemo(() => {
    const out: RetContact[] = [];
    const key = client.key;
    const add = (c: RetContact) => { if (c.email && !leftEmails.has(c.email.toLowerCase()) && !out.some((x) => x.email === c.email)) out.push(c); };
    for (const l of state.sales.leads) if (l.company.toLowerCase().replace(/[^a-z0-9&]+/g, " ").trim() === key) add({ name: l.contact.name, role: l.contact.role.replace(/\s*\(fictional\)/, ""), email: l.contact.email });
    add(client.base);
    return out;
  }, [state, client]); // eslint-disable-line react-hooks/exhaustive-deps
  const contact = { name, role, email };
  const submit = (rep: RetContact | null) => {
    const r = mode === "left" ? dispatch(onbAct.contactLeft(client.company, rep)) : dispatch(onbAct.setContact(client.company, rep!));
    if (r.ok) onClose();
  };
  return (
    <Modal open width={520} title={mode === "left" ? `${client.current?.name} has left ${client.company}` : `Choose a contact at ${client.company}`} onClose={onClose}
      footer={<>
        {mode === "left" ? <Button onClick={() => submit(null)}>Mark as left, choose later</Button> : <Button onClick={onClose}>Cancel</Button>}
        <Button variant="primary" icon="check" disabled={!name.trim() || !email.trim()} onClick={() => submit(contact)}>{mode === "left" ? "Mark as left and use this contact" : "Use this contact"}</Button>
      </>}>
      {mode === "left" ? <p className="rt-modal-p">Reminders and results emails stop going to {client.current?.name}. Who should get them now?</p> : <p className="rt-modal-p">Rebooking reminders and results emails go to this named person.</p>}
      {known.length ? (
        <div className="rt-known">
          {known.map((k) => <button key={k.email} type="button" className={"rt-known-btn" + (email === k.email ? " on" : "")} onClick={() => { setName(k.name); setRole(k.role); setEmail(k.email); }}><b>{k.name}</b><span>{k.role}</span></button>)}
        </div>
      ) : null}
      <div className="rt-modal-grid">
        <Field label="Name" htmlFor="rt-c-name"><TextInput id="rt-c-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" /></Field>
        <Field label="Role" htmlFor="rt-c-role"><TextInput id="rt-c-role" value={role} onChange={(e) => setRole(e.target.value)} /></Field>
        <Field label="Email" htmlFor="rt-c-email"><TextInput id="rt-c-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.ie" /></Field>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- template editor */

function TemplateEditor({ id, onClose }: { id: RetTemplateId; onClose: () => void }) {
  const state = usePhState();
  const t = state.onboarding.templates[id];
  const [subject, setSubject] = useState(t.subject);
  const [body, setBody] = useState(t.body);
  const [focus, setFocus] = useState<"subject" | "body">("body");
  const sample = retSampleValues();
  const merge = (x: string) => x.replace(/\{(\w+)\}/g, (m, k) => (sample[k] !== undefined ? sample[k] : m));
  const insert = (key: string) => (focus === "subject" ? setSubject((s) => `${s}{${key}}`) : setBody((b) => `${b}{${key}}`));
  const dirty = subject !== t.subject || body !== t.body;
  return (
    <Modal open width={1040} title={`Email template: ${t.name}`} onClose={onClose}
      footer={<>
        <Button variant="ghost" icon="refresh" onClick={() => { if (dispatch(onbAct.resetTemplate(id)).ok) { const d = state.onboarding.templates[id]; void d; onClose(); } }}>Back to standard wording</Button>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" icon="check" disabled={!dirty} onClick={() => { if (dispatch(onbAct.saveTemplate(id, subject, body)).ok) onClose(); }}>Save template</Button>
      </>}>
      <div className="rt-ed">
        <div className="rt-ed-form">
          <div className="rt-ed-use">{t.use}</div>
          <Field label="Subject" htmlFor="rt-ed-subj"><TextInput id="rt-ed-subj" value={subject} onFocus={() => setFocus("subject")} onChange={(e) => setSubject(e.target.value)} /></Field>
          <Field label="Message" htmlFor="rt-ed-body"><Textarea id="rt-ed-body" rows={13} value={body} onFocus={() => setFocus("body")} onChange={(e) => setBody(e.target.value)} /></Field>
          <div className="rt-ed-fields">
            <div className="ph-label">Merge fields: click to add to the {focus === "subject" ? "subject" : "message"}</div>
            <div className="rt-ed-chips">{RET_MERGE_FIELDS.map((f) => <button key={f.key} type="button" title={`${f.label}, for example ${f.sample}`} onClick={() => insert(f.key)}>{`{${f.key}}`}</button>)}</div>
          </div>
        </div>
        <div className="rt-ed-preview">
          <div className="ph-label">Preview with sample details</div>
          <BrandedEmail subject={merge(subject)} body={merge(body)} compact />
        </div>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- lapsed clients */

function LapsedClients({ onPreview }: { onPreview: (p: Preview) => void }) {
  const state = usePhState();
  const rights = useSalesRights();
  const lapsed = salesRecalls(state).filter((r) => r.lapsed);
  if (!lapsed.length) return null;
  const outreachFor = (id: string | null) => (id ? state.sales.outreach.find((o) => o.id === id) : undefined);
  const show = (id: string | null) => { const o = outreachFor(id); if (o) onPreview({ to: `${o.to} <${o.toEmail}>`, subject: o.subject, body: o.body }); };
  const reach = (recallId: string) => { const r = dispatch(salesAct.draftOutreach(recallId, "lapsed")); if (r.ok && r.id) show(r.id); };
  return (
    <Card>
      <div id="rt-lapsed" />
      <CardHeader title={`Lapsed clients (${lapsed.length})`} sub="The Lapsed Clients board: no screening in over 13 months and nothing in the pipeline. Reach out with a personal win-back email." />
      <div className="rt-list">
        {lapsed.map((r) => (
          <div key={r.id} className="rt-item">
            <span className="rt-item-icon muted"><Icon name="clock" size={15} /></span>
            <div className="ph-grow"><div className="rt-item-title">{r.company} {r.outreachId ? <Pill tone="ok">Email drafted</Pill> : null}</div><div className="rt-item-sub">Last screened {longDate(r.screenedOn)} · {r.packageText} · {r.contactName}</div></div>
            <div className="rt-item-act">
              {r.outreachId ? <Button size="sm" icon="eye" onClick={() => show(r.outreachId)}>View email</Button>
                : rights.manage ? <Button size="sm" variant="primary" icon="mail" onClick={() => reach(r.id)}>Reach out</Button> : null}
            </div>
          </div>
        ))}
      </div>
      <div className="ph-faint" style={{ fontSize: 11.5, marginTop: 8 }}>Drafts only: nothing is sent. <DemoTag>Simulated</DemoTag></div>
    </Card>
  );
}
