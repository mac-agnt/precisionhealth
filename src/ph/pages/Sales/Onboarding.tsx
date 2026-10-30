/* Onboarding: Occupational Health and Wellness client onboarding, one simple step at a time.
   Opened from the Pipeline ("Mark as won" sends ?lead=LD-...), or started here for any won lead or a
   new client. Steps: Details, Agreements (DSA and SLA), Team, MediBase (OH only), Xero, Done.
   Deep links: #/Sales/onboarding?onb=ONB-001&step=agreements, #/Sales/onboarding?lead=LD-0013. */
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  ONB_BILLING_LABEL, ONB_DOC_STATUS_LABEL, ONB_DOC_TITLE, ONB_KIND_LABEL, ONB_STEP_LABEL, ONB_TEAM, SALES_SERVICE_LABEL, fmtDate, fmtDateTime, linkFor,
  onbBillingCodes, onbCurrentStep, onbDetailsErrors, onbMedibaseSteps, onbProgress, onbServicesFor, onbStepDone, onbStepsFor,
} from "../../model";
import type { OnbBilling, OnbDetails, OnbDocKind, OnbErrors, OnbKind, OnbPerson, OnbStepId, Onboarding, SalesLead, StaffId } from "../../model";
import { useNav } from "../../nav-context";
import { dispatch, usePersona, usePhState } from "../../store";
import { Avatar, Button, Card, CardHeader, Checkbox, DemoTag, EmptyState, Field, Icon, Modal, PageHeader, Pill, ProgressBar, Select, TextInput, Textarea } from "../../ui";
import type { GlyphName, Tone } from "../../ui";
import { onbAct } from "./onbActions";
import { onbById, onbForLead, onbInvoiceDestination, onbRenderDoc, onbSuggestedKind, onbWelcomeValues, onbWonLeads, retRender } from "./onbSelect";
import { AgreementDoc, BrandedEmail, StepTracker, agreementHtml, downloadHtml, usePrint } from "./onbShared";
import { JourneyStrip } from "../Journey/JourneyStrip";
import { OnbLinkCard, OnbNextUp } from "../Journey/OnbLink";

const KIND_ICON: Record<OnbKind, GlyphName> = { oh: "shield", wellness: "heart" };
const KIND_BLURB: Record<OnbKind, string> = {
  oh: "Pre-employment medicals, referrals and health surveillance. Set up in MediBase, billed as a yearly recurring fee (€525 or €1,050).",
  wellness: "Screening days, flu clinics and wellness talks. Invoiced once per programme.",
};

export default function Onboarding() {
  const state = usePhState();
  const nav = useNav();
  const o = onbById(state, nav.params.onb);
  if (o) return <OnboardingDetail key={o.id} o={o} />;
  return <OnboardingHome />;
}

/* ================================================================ home: start and list */

function OnboardingHome() {
  const state = usePhState();
  const nav = useNav();
  const p = usePersona();
  const leadParam = nav.params.lead;
  const lead = leadParam ? state.sales.leads.find((l) => l.id === leadParam) : undefined;
  const existing = lead ? onbForLead(state, lead.id) : undefined;
  const [starting, setStarting] = useState(!!leadParam);
  const [pick, setPick] = useState<string>(leadParam || "");

  /* "Mark as won" lands here with ?lead=. If that lead is already being onboarded, open it. */
  useEffect(() => { if (existing) nav.setParams({ onb: existing.id }); }, [existing?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (leadParam) { setStarting(true); setPick(leadParam); } }, [leadParam]);

  const list = state.onboarding.onboardings;
  const active = list.filter((x) => !x.completedAt);
  const finished = list.filter((x) => x.completedAt);
  const won = onbWonLeads(state);
  const chosenLead = pick ? state.sales.leads.find((l) => l.id === pick) : undefined;

  const start = (kind: OnbKind) => {
    const r = dispatch(onbAct.start(kind, chosenLead ? chosenLead.id : null));
    if (r.ok && r.id) nav.setParams({ onb: r.id });
  };

  return (
    <div className="ph-page">
      <PageHeader title="Onboarding" sub="From signed to set up, one simple step at a time: details, agreements, team, MediBase, Xero, welcome."
        actions={!starting && !p.isParticipant ? <Button variant="primary" icon="plus" onClick={() => { setStarting(true); setPick(won[0]?.id || ""); }}>Start onboarding</Button> : null} />
      <div className="ph-stack">
        {starting ? (
          <Card className="ob-start">
            <div className="ob-start-top">
              <div className="ph-grow">
                <div className="ph-eyebrow">New onboarding</div>
                <h2 className="ob-h">{chosenLead ? `Onboard ${chosenLead.company}` : "Who are we onboarding?"}</h2>
                {lead && lead.stage !== "won" ? <div className="ob-warn"><Icon name="alert" size={13} /> {lead.company} is not marked as won yet. Mark it as won in the Pipeline first.</div> : null}
              </div>
              <Button size="sm" variant="ghost" icon="x" onClick={() => { setStarting(false); if (leadParam) nav.setParams({}); }}>Cancel</Button>
            </div>
            <Field label="Client" htmlFor="ob-pick" help={won.length ? "Won leads that are not onboarded yet. Details are filled in from the lead." : "No won leads waiting. You can still onboard a new client."}>
              <Select id="ob-pick" value={pick} onChange={(e) => setPick(e.target.value)} style={{ maxWidth: 460 }}>
                {chosenLead && !won.some((l) => l.id === chosenLead.id) ? <option value={chosenLead.id}>{chosenLead.company} ({chosenLead.id})</option> : null}
                {won.map((l) => <option key={l.id} value={l.id}>{l.company} · won lead {l.id}</option>)}
                <option value="">A new client, not in the pipeline</option>
              </Select>
            </Field>
            {chosenLead ? <LeadSummary lead={chosenLead} /> : null}
            <div className="ob-kinds">
              {(["oh", "wellness"] as OnbKind[]).map((k) => {
                const suggested = chosenLead && onbSuggestedKind(chosenLead) === k;
                return (
                  <button key={k} type="button" className={`ob-kind ob-kind-${k}` + (suggested ? " suggested" : "")} onClick={() => start(k)} disabled={!!chosenLead && chosenLead.stage !== "won"}>
                    {suggested ? <span className="ob-kind-flag">Suggested from the lead</span> : null}
                    <span className="ob-kind-icon"><Icon name={KIND_ICON[k]} size={22} /></span>
                    <span className="ob-kind-title">{ONB_KIND_LABEL[k]}</span>
                    <span className="ob-kind-blurb">{KIND_BLURB[k]}</span>
                    <span className="ob-kind-go">Start {ONB_KIND_LABEL[k]} onboarding <Icon name="arrow" size={13} /></span>
                  </button>
                );
              })}
            </div>
          </Card>
        ) : null}

        <section>
          <div className="ob-sec-head"><h2>In progress</h2><span>{active.length}</span></div>
          {active.length ? (
            <div className="ob-cards">{active.map((x) => <OnbCard key={x.id} o={x} />)}</div>
          ) : <Card><EmptyState title="Nothing in progress" icon="check">Start an onboarding when a client signs.</EmptyState></Card>}
        </section>

        {finished.length ? (
          <section>
            <div className="ob-sec-head"><h2>Finished</h2><span>{finished.length}</span></div>
            <div className="ob-cards">{finished.map((x) => <OnbCard key={x.id} o={x} />)}</div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function LeadSummary({ lead }: { lead: SalesLead }) {
  return (
    <div className="ob-lead">
      <Icon name="user" size={14} />
      <span><b>{lead.contact.name}</b>, {lead.contact.role.replace(/\s*\(fictional\)/, "")} · {lead.contact.email}</span>
      <span className="ob-lead-tags">{lead.services.map((s) => <span key={s}>{SALES_SERVICE_LABEL[s]}</span>)}</span>
    </div>
  );
}

function OnbCard({ o }: { o: Onboarding }) {
  const nav = useNav();
  const pr = onbProgress(o);
  const cur = onbCurrentStep(o);
  return (
    <button type="button" className={`ob-card ob-card-${o.kind}`} onClick={() => nav.setParams({ onb: o.id })}>
      <div className="ob-card-top">
        <span className="ob-card-kind"><Icon name={KIND_ICON[o.kind]} size={12} />{ONB_KIND_LABEL[o.kind]}</span>
        <span className="ob-card-id">{o.id}</span>
      </div>
      <div className="ob-card-name">{o.details.companyName || "New client"}</div>
      <StepTracker o={o} small />
      <div className="ob-card-foot">
        <span>{o.completedAt ? `Finished ${fmtDate(o.completedAt)}` : <>Next: <b>{ONB_STEP_LABEL[cur]}</b></>}</span>
        <span className="ob-card-count">{pr.done} of {pr.total}</span>
      </div>
    </button>
  );
}

/* ================================================================ one onboarding */

function OnboardingDetail({ o }: { o: Onboarding }) {
  const nav = useNav();
  const state = usePhState();
  const steps = onbStepsFor(o.kind);
  const cur = onbCurrentStep(o);
  const step: OnbStepId = steps.includes(nav.params.step as OnbStepId) ? (nav.params.step as OnbStepId) : cur;
  const go = (s: OnbStepId) => nav.setParams({ onb: o.id, step: s });
  /* Pin the step being worked on, so finishing it does not jump the page away. */
  useEffect(() => { if (!steps.includes(nav.params.step as OnbStepId)) go(cur); }, [nav.params.step]); // eslint-disable-line react-hooks/exhaustive-deps
  const idx = steps.indexOf(step);
  const next = steps[idx + 1];
  const prev = steps[idx - 1];
  const lead = o.leadId ? state.sales.leads.find((l) => l.id === o.leadId) : undefined;
  const pr = onbProgress(o);
  return (
    <div className="ph-page">
      <div className="ob-back"><Button size="sm" variant="ghost" icon="chevronLeft" onClick={() => nav.setParams({})}>All onboardings</Button></div>
      <JourneyStrip onb={o.id} at="onboarding" />
      <div className={`ob-hero ob-hero-${o.kind}`}>
        <div className="ob-hero-main">
          <div className="ob-hero-kind"><Icon name={KIND_ICON[o.kind]} size={13} />{ONB_KIND_LABEL[o.kind]} onboarding · {o.id}</div>
          <h1>{o.details.companyName || "New client"}</h1>
          <div className="ob-hero-sub">
            {lead ? <>From won lead <button type="button" className="ob-link" onClick={() => nav.go({ page: "Sales", tab: "pipeline", params: { lead: lead.id } })}>{lead.id}</button> · </> : null}
            Started {fmtDate(o.createdAt)} by {o.createdBy}
          </div>
        </div>
        <div className="ob-hero-progress">
          <div className="ob-hero-num">{pr.done}<span>/{pr.total}</span></div>
          <div>{o.completedAt ? "Onboarded" : "steps done"}</div>
        </div>
      </div>
      <StepTracker o={o} active={step} onPick={go} />
      <div className="ob-panel">
        {step === "details" ? <><OnbLinkCard o={o} /><DetailsStep key={o.clientLink?.completedAt || "form"} o={o} onSaved={() => go("agreements")} /></> : null}
        {step === "agreements" ? <AgreementsStep o={o} /> : null}
        {step === "team" ? <TeamStep o={o} /> : null}
        {step === "medibase" ? <MedibaseStep o={o} /> : null}
        {step === "xero" ? <XeroStep o={o} /> : null}
        {step === "done" ? <DoneStep o={o} onGo={go} /> : null}
      </div>
      {step !== "details" ? (
        <div className="ob-stepnav">
          {prev ? <Button icon="chevronLeft" onClick={() => go(prev)}>{ONB_STEP_LABEL[prev]}</Button> : <span />}
          {next ? <Button variant={onbStepDone(o)[step] ? "primary" : "secondary"} onClick={() => go(next)}>Next: {ONB_STEP_LABEL[next]} <Icon name="chevronRight" size={13} /></Button> : null}
        </div>
      ) : null}
    </div>
  );
}

function StepHead({ title, sub, done, right }: { title: string; sub: ReactNode; done?: boolean; right?: ReactNode }) {
  return (
    <div className="ob-step-head">
      <div className="ph-grow">
        <h2 className="ob-h">{title} {done ? <Pill tone="ok">Done</Pill> : null}</h2>
        <div className="ob-step-sub">{sub}</div>
      </div>
      {right}
    </div>
  );
}

/* ---------------------------------------------------------------- 1. details */

function DetailsStep({ o, onSaved }: { o: Onboarding; onSaved: () => void }) {
  const [d, setD] = useState<OnbDetails>(() => structuredClone(o.details));
  const [tried, setTried] = useState(false);
  const errs: OnbErrors = useMemo(() => (tried ? onbDetailsErrors(o.kind, d) : {}), [tried, d, o.kind]);
  const locked = !!o.completedAt;
  const set = <K extends keyof OnbDetails>(k: K, v: OnbDetails[K]) => setD((x) => ({ ...x, [k]: v }));
  const setP = (k: "main" | "hr" | "finance" | "referralManager", f: keyof OnbPerson, v: string) => setD((x) => ({ ...x, [k]: { ...x[k], [f]: v } }));
  const save = () => {
    setTried(true);
    if (Object.keys(onbDetailsErrors(o.kind, d)).length) return;
    if (dispatch(onbAct.saveDetails(o.id, d)).ok) onSaved();
  };
  const services = onbServicesFor(o.kind);
  const person = (k: "main" | "hr" | "finance" | "referralManager", title: string, hint: string, copy?: boolean) => (
    <div className="ob-person">
      <div className="ob-person-head">
        <div><b>{title}</b><span>{hint}</span></div>
        {copy && !locked ? <Button size="sm" variant="ghost" onClick={() => setD((x) => ({ ...x, [k]: { ...x.main } }))}>Same as main contact</Button> : null}
      </div>
      <div className="ob-grid3">
        <Field label="Name" error={errs[`${k}.name`]} htmlFor={`ob-${k}-name`}><TextInput id={`ob-${k}-name`} value={d[k].name} disabled={locked} invalid={!!errs[`${k}.name`]} onChange={(e) => setP(k, "name", e.target.value)} /></Field>
        <Field label="Email" error={errs[`${k}.email`]} htmlFor={`ob-${k}-email`}><TextInput id={`ob-${k}-email`} type="email" value={d[k].email} disabled={locked} invalid={!!errs[`${k}.email`]} onChange={(e) => setP(k, "email", e.target.value)} /></Field>
        <Field label="Phone" error={errs[`${k}.phone`]} htmlFor={`ob-${k}-phone`}><TextInput id={`ob-${k}-phone`} value={d[k].phone} disabled={locked} invalid={!!errs[`${k}.phone`]} onChange={(e) => setP(k, "phone", e.target.value)} placeholder="Optional" /></Field>
      </div>
    </div>
  );
  const errCount = Object.keys(errs).length;
  return (
    <Card>
      <StepHead title="Client details" done={!!o.detailsSavedAt} sub={o.kind === "oh" ? "The occupational health onboarding form. Everything here is merged into the agreements and the Xero contact." : "The wellness onboarding form. Everything here is merged into the agreements and the Xero contact."} />
      <div className="ob-form">
        <h3 className="ob-form-h">Company</h3>
        <div className="ob-grid2">
          <Field label="Company name" error={errs.companyName} htmlFor="ob-co"><TextInput id="ob-co" value={d.companyName} disabled={locked} invalid={!!errs.companyName} onChange={(e) => set("companyName", e.target.value)} /></Field>
          <Field label="Company registration number (CRO)" error={errs.croNumber} help="4 to 7 digits, from the CRO register." htmlFor="ob-cro"><TextInput id="ob-cro" inputMode="numeric" value={d.croNumber} disabled={locked} invalid={!!errs.croNumber} onChange={(e) => set("croNumber", e.target.value)} placeholder="For example 551990" /></Field>
          <Field label="Registered address" htmlFor="ob-addr"><TextInput id="ob-addr" value={d.registeredAddress} disabled={locked} onChange={(e) => set("registeredAddress", e.target.value)} /></Field>
          <div className="ob-grid2 tight">
            <Field label="Sites" htmlFor="ob-sites"><TextInput id="ob-sites" value={d.sites} disabled={locked} onChange={(e) => set("sites", e.target.value)} placeholder="Where we will work" /></Field>
            <Field label="Employees" htmlFor="ob-hc"><TextInput id="ob-hc" inputMode="numeric" value={d.headcount} disabled={locked} onChange={(e) => set("headcount", e.target.value.replace(/\D/g, ""))} /></Field>
          </div>
        </div>

        <h3 className="ob-form-h">Contacts</h3>
        {person("main", "Main contact", "Signs the agreements and gets the welcome email.")}
        {person("hr", "HR contact", "Gets results and rebooking emails. Must be a named person.", true)}
        {person("finance", "Finance contact", "For invoices and purchase orders.", true)}
        {o.kind === "oh" ? person("referralManager", "Referral manager", "Raises management referrals in MediBase.", true) : null}

        <h3 className="ob-form-h">Invoices</h3>
        <div className="ob-radios" role="radiogroup" aria-label="Where invoices go">
          {([["portal", "Client portal", "The client downloads invoices from the Precision Health portal.", "layers"], ["ap_email", "Accounts payable email", "Invoices are emailed to the client's accounts team.", "mail"]] as const).map(([v, t, s, ic]) => (
            <button key={v} type="button" role="radio" aria-checked={d.invoiceTo === v} disabled={locked} className={"ob-radio" + (d.invoiceTo === v ? " on" : "")} onClick={() => set("invoiceTo", v)}>
              <Icon name={ic} size={16} /><span><b>{t}</b><span>{s}</span></span>
            </button>
          ))}
        </div>
        <div className="ob-grid2">
          {d.invoiceTo === "ap_email" ? <Field label="Accounts payable email" error={errs.apEmail} htmlFor="ob-ap"><TextInput id="ob-ap" type="email" value={d.apEmail} disabled={locked} invalid={!!errs.apEmail} onChange={(e) => set("apEmail", e.target.value)} placeholder="accounts@company.ie" /></Field> : <div />}
          <Field label="Purchase order number" htmlFor="ob-po"><TextInput id="ob-po" value={d.poNumber} disabled={locked} onChange={(e) => set("poNumber", e.target.value)} placeholder="Optional" /></Field>
        </div>

        <h3 className="ob-form-h">Services</h3>
        <div className="ob-chips">
          {services.map((s) => {
            const on = d.services.includes(s);
            return <button key={s} type="button" disabled={locked} className={"ob-chip" + (on ? " on" : "")} aria-pressed={on} onClick={() => set("services", on ? d.services.filter((x) => x !== s) : [...d.services, s])}>{on ? <Icon name="check" size={12} stroke={2.4} /> : <Icon name="plus" size={12} />}{s}</button>;
          })}
        </div>
        {errs.services ? <div className="ph-err">{errs.services}</div> : null}
        <Field label="Notes for the team" htmlFor="ob-notes"><Textarea id="ob-notes" rows={2} value={d.notes} disabled={locked} onChange={(e) => set("notes", e.target.value)} /></Field>
      </div>
      {!locked ? (
        <div className="ob-actions">
          {errCount ? <span className="ob-errsum"><Icon name="alert" size={13} /> {errCount === 1 ? "One thing to fix" : `${errCount} things to fix`} above.</span> : o.detailsSavedAt ? <span className="ph-dim" style={{ fontSize: 12 }}>Saved {fmtDateTime(o.detailsSavedAt)}</span> : null}
          <Button variant="primary" icon="check" onClick={save}>Save details and continue</Button>
        </div>
      ) : null}
    </Card>
  );
}

/* ---------------------------------------------------------------- 2. agreements */

const DOC_TONE: Record<string, Tone> = { draft: "neutral", sent: "info", signed: "ok" };

function AgreementsStep({ o }: { o: Onboarding }) {
  const [view, setView] = useState<OnbDocKind | null>(null);
  const [print, printNode] = usePrint();
  const needDetails = !o.detailsSavedAt;
  return (
    <>
      <Card>
        <StepHead title="Agreements" done={onbStepDone(o).agreements}
          sub="One click makes each document with the client's details filled in. Send it for signature, then record it as signed." right={<DemoTag>Simulated signing</DemoTag>} />
        {needDetails ? <div className="ob-warn"><Icon name="alert" size={13} /> Save the client's details first, so they can be filled into the agreements.</div> : null}
        <div className="ob-docs">
          {(["dsa", "sla"] as OnbDocKind[]).map((k) => {
            const d = o.docs[k];
            const st = d?.status;
            const stage = st === "signed" ? 3 : st === "sent" ? 2 : st === "draft" ? 1 : 0;
            const rendered = onbRenderDoc(o, k);
            return (
              <div key={k} className={"ob-doccard" + (st === "signed" ? " signed" : "")}>
                <div className="ob-doccard-top">
                  <span className="ob-docicon"><Icon name="file" size={18} /></span>
                  <div className="ph-grow"><div className="ob-doccard-title">{ONB_DOC_TITLE[k]}</div><div className="ob-doccard-sub">{k === "dsa" ? "What employee data is shared, and how it is kept safe." : "What we deliver, who to talk to, fees and term."}</div></div>
                  {st ? <Pill tone={DOC_TONE[st]}>{ONB_DOC_STATUS_LABEL[st]}</Pill> : <Pill tone="neutral" icon={null}>Not made yet</Pill>}
                </div>
                <div className="ob-mini">
                  {["Draft", "Sent", "Signed"].map((x, i) => <span key={x} className={stage > i ? "on" : ""}>{stage > i ? <Icon name="check" size={10} stroke={2.4} /> : null}{x}</span>)}
                </div>
                {d ? <div className="ob-doccard-when">Version {d.version} · made {fmtDateTime(d.generatedAt)}{d.sentAt ? ` · sent ${fmtDate(d.sentAt)}` : ""}{d.signedAt ? ` · signed ${fmtDate(d.signedAt)}` : ""}</div> : null}
                <div className="ob-doccard-actions">
                  {!d ? <Button variant="primary" icon="spark" disabled={needDetails} onClick={() => { if (dispatch(onbAct.generateDoc(o.id, k)).ok) setView(k); }}>Generate {k.toUpperCase()}</Button> : null}
                  {d ? <Button icon="eye" onClick={() => setView(k)}>Preview</Button> : null}
                  {st === "draft" ? <Button variant="primary" icon="send" onClick={() => dispatch(onbAct.sendDoc(o.id, k))}>Send for signature</Button> : null}
                  {st === "sent" ? <Button variant="primary" icon="check" onClick={() => dispatch(onbAct.signDoc(o.id, k))}>Mark as signed</Button> : null}
                  {st === "draft" ? <Button size="sm" variant="ghost" icon="refresh" onClick={() => dispatch(onbAct.generateDoc(o.id, k))}>Regenerate</Button> : null}
                  {rendered ? <Button size="sm" variant="ghost" icon="down" onClick={() => downloadHtml(`${o.details.companyName.replace(/[^a-z0-9]+/gi, "-")}-${k.toUpperCase()}-v${rendered.version}.html`, agreementHtml(rendered, o, d?.signedAt || null))}>Download</Button> : null}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
      {view ? (() => {
        const rendered = onbRenderDoc(o, view);
        const d = o.docs[view];
        if (!rendered || !d) return null;
        return (
          <Modal open width={860} title={`${ONB_DOC_TITLE[view]}, ${o.details.companyName}`} onClose={() => setView(null)}
            footer={<>
              <Button icon="print" onClick={() => print(<AgreementDoc doc={rendered} o={o} signedAt={d.signedAt} />)}>Print</Button>
              <Button icon="down" onClick={() => downloadHtml(`${o.details.companyName.replace(/[^a-z0-9]+/gi, "-")}-${view.toUpperCase()}-v${rendered.version}.html`, agreementHtml(rendered, o, d.signedAt))}>Download</Button>
              {d.status === "draft" ? <Button variant="primary" icon="send" onClick={() => { dispatch(onbAct.sendDoc(o.id, view)); setView(null); }}>Send for signature (simulated)</Button> : null}
              {d.status === "sent" ? <Button variant="primary" icon="check" onClick={() => { dispatch(onbAct.signDoc(o.id, view)); setView(null); }}>Mark as signed (simulated)</Button> : null}
            </>}>
            <AgreementDoc doc={rendered} o={o} signedAt={d.signedAt} />
          </Modal>
        );
      })() : null}
      {printNode}
    </>
  );
}

/* ---------------------------------------------------------------- 3. team */

function TeamStep({ o }: { o: Onboarding }) {
  const nav = useNav();
  const state = usePhState();
  const team = ONB_TEAM[o.kind];
  const task = o.route ? state.tasks.find((t) => t.id === o.route!.taskId) : undefined;
  const owner = state.staff.find((s) => s.id === team.ownerId);
  return (
    <Card>
      <StepHead title="Hand over to the team" done={!!o.route} sub={`${ONB_KIND_LABEL[o.kind]} clients are looked after by the ${team.name}. Handing over creates a task for them in Work, Tasks.`} />
      <div className="ob-team">
        <div className="ob-team-card">
          <Avatar name={team.ownerName} tint={owner?.tint} size={46} />
          <div className="ph-grow">
            <div className="ph-eyebrow">Owning team</div>
            <div className="ob-team-name">{team.name}</div>
            <div className="ob-team-who">Led by {team.ownerName}{owner ? `, ${owner.title}` : ""}</div>
            <div className="ob-team-blurb">{team.blurb}</div>
          </div>
        </div>
        {o.route ? (
          <div className="ob-done-box">
            <Icon name="check" size={16} />
            <div className="ph-grow">
              <b>With the {team.name} since {fmtDate(o.route.at)}</b>
              <div>Task {o.route.taskId}{task ? `: ${task.title}` : ""}{task?.dueAt ? `, due ${fmtDateTime(task.dueAt)}` : ""}. {task?.status === "done" ? "Done." : "Open."}</div>
            </div>
            <Button size="sm" icon="arrow" onClick={() => nav.go(linkFor("task", o.route!.taskId))}>Open in Work, Tasks</Button>
          </div>
        ) : (
          <div className="ob-actions">
            {!o.detailsSavedAt ? <span className="ob-errsum"><Icon name="alert" size={13} /> Save the client's details first.</span> : null}
            <Button variant="primary" icon="send" disabled={!o.detailsSavedAt} onClick={() => dispatch(onbAct.route(o.id))}>Send to the {team.name}</Button>
          </div>
        )}
      </div>
    </Card>
  );
}

/* ---------------------------------------------------------------- 4. MediBase (OH) */

const MB_PEOPLE: StaffId[] = ["fiona", "anita", "brenda", "stephen", "martina"];

function MedibaseStep({ o }: { o: Onboarding }) {
  const state = usePhState();
  const steps = onbMedibaseSteps(o.details);
  const ticks = o.medibase.ticks;
  const n = ticks.filter(Boolean).length;
  return (
    <Card>
      <StepHead title="Set up client in MediBase" done={!!o.medibase.doneAt}
        sub="A manual step: MediBase is not connected to Pulse. Work through the list in MediBase and tick each step here." right={<Pill tone="neutral" icon="edit">Manual task</Pill>} />
      <div className="ob-mb">
        <div className="ob-mb-side">
          <Field label="Assigned to" htmlFor="ob-mb-who">
            <Select id="ob-mb-who" value={o.medibase.assigneeId} onChange={(e) => dispatch(onbAct.medibaseAssign(o.id, e.target.value as StaffId), { silent: true })}>
              {MB_PEOPLE.map((id) => { const s = state.staff.find((x) => x.id === id); return s ? <option key={id} value={id}>{s.name}</option> : null; })}
            </Select>
          </Field>
          <div className="ob-mb-count"><b>{n}</b> of {steps.length} done</div>
          <ProgressBar value={n} max={steps.length} tone={n === steps.length ? "ok" : "brand"} label="MediBase set-up" />
          {o.medibase.doneAt ? <div className="ob-mb-done"><Icon name="check" size={13} /> Finished {fmtDateTime(o.medibase.doneAt)}</div> : null}
        </div>
        <ol className="ob-mb-list">
          {steps.map((s, i) => (
            <li key={i} className={ticks[i] ? "on" : ""}>
              <Checkbox checked={!!ticks[i]} onChange={(v) => dispatch(onbAct.medibaseTick(o.id, i, v))} label={<><span className="ob-mb-n">{i + 1}</span>{s}</>} />
            </li>
          ))}
        </ol>
      </div>
    </Card>
  );
}

/* ---------------------------------------------------------------- 5. Xero */

function XeroStep({ o }: { o: Onboarding }) {
  const d = o.details;
  const codes = onbBillingCodes(o.kind, o.xero.billing);
  const made = !!o.xero.contactRef;
  const rows: Array<[string, ReactNode]> = [
    ["Contact name", d.companyName], ["CRO number", d.croNumber || "Not given"], ["Finance contact", `${d.finance.name}, ${d.finance.email}`],
    ["Invoices go to", d.invoiceTo === "ap_email" ? <>Accounts payable: {d.apEmail}</> : "The client portal"], ["Purchase order", d.poNumber || "Not needed"],
  ];
  return (
    <Card>
      <StepHead title="Set up billing in Xero" done={made} sub="Creates the client as a Xero contact with the right billing codes." right={<DemoTag>Simulated</DemoTag>} />
      <div className="ob-xero">
        <div className="ob-xero-box">
          <div className="ph-eyebrow">Xero contact</div>
          <dl className="ob-dl">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
        </div>
        <div className="ob-xero-box">
          <div className="ph-eyebrow">Billing</div>
          {o.kind === "oh" ? (
            <Field label="Yearly recurring fee" htmlFor="ob-ret" help="Repeating invoice in Xero, once a year from the start date.">
              <Select id="ob-ret" value={o.xero.billing} disabled={made} onChange={(e) => dispatch(onbAct.setBilling(o.id, e.target.value as OnbBilling), { silent: true })}>
                <option value="retainer_525">{ONB_BILLING_LABEL.retainer_525}</option>
                <option value="retainer_1050">{ONB_BILLING_LABEL.retainer_1050}</option>
              </Select>
            </Field>
          ) : <div className="ob-perprog"><Icon name="file" size={14} /> <span><b>Per-programme invoicing.</b> One invoice for each programme, raised when its results are out.</span></div>}
          <div className="ob-codes">
            {codes.map((c) => <div key={c.code}><span className="ob-code">{c.code}</span><span className="ph-grow"><b>{c.label}</b><span>{c.basis}</span></span></div>)}
          </div>
        </div>
      </div>
      {made ? (
        <div className="ob-done-box">
          <Icon name="check" size={16} />
          <div className="ph-grow"><b>Created in Xero (simulated): {o.xero.contactRef}</b><div>{o.kind === "oh" ? `${ONB_BILLING_LABEL[o.xero.billing]}, repeating invoice set up.` : "Billing codes added. Each programme is invoiced when its results are out."} {o.xero.createdAt ? fmtDateTime(o.xero.createdAt) : ""}</div></div>
        </div>
      ) : (
        <div className="ob-actions">
          {!o.detailsSavedAt ? <span className="ob-errsum"><Icon name="alert" size={13} /> Save the client's details first.</span> : null}
          <Button variant="primary" icon="plus" disabled={!o.detailsSavedAt} onClick={() => dispatch(onbAct.createXero(o.id))}>Create in Xero (simulated)</Button>
        </div>
      )}
    </Card>
  );
}

/* ---------------------------------------------------------------- 6. done */

function DoneStep({ o, onGo }: { o: Onboarding; onGo: (s: OnbStepId) => void }) {
  const state = usePhState();
  const nav = useNav();
  const done = onbStepDone(o);
  const steps = onbStepsFor(o.kind).filter((s) => s !== "done");
  const missing = steps.filter((s) => !done[s]);
  const sent = o.welcomeEmailId ? state.onboarding.emails.find((e) => e.id === o.welcomeEmailId) : undefined;
  const preview = retRender(state, "welcome", onbWelcomeValues(state, o));
  return (
    <Card>
      {o.completedAt ? (
        <div className="ob-finish">
          <span className="ob-finish-icon"><Icon name="check" size={26} stroke={2.4} /></span>
          <div><h2 className="ob-h">{o.details.companyName} is onboarded</h2><div className="ob-step-sub">Finished {fmtDateTime(o.completedAt)}. The welcome email went to {o.details.main.name}. Invoices go to {onbInvoiceDestination(o.details)}.</div></div>
        </div>
      ) : <StepHead title="Welcome the client" sub="When every step is ticked, send the welcome email and the onboarding is finished." />}
      <div className="ob-done-grid">
        <ul className="ob-summary">
          {steps.map((s) => (
            <li key={s} className={done[s] ? "on" : ""}>
              <span className="ob-sum-dot">{done[s] ? <Icon name="check" size={11} stroke={2.4} /> : null}</span>
              <span className="ph-grow">{ONB_STEP_LABEL[s]}</span>
              {!done[s] ? <button type="button" className="ob-link" onClick={() => onGo(s)}>Go to step</button> : null}
            </li>
          ))}
        </ul>
        <div>
          <BrandedEmail to={`${o.details.main.name} <${o.details.main.email}>`} subject={sent ? sent.subject : preview.subject} body={sent ? sent.body : preview.body} sentAt={sent?.sentAt} />
        </div>
      </div>
      {!o.completedAt ? (
        <div className="ob-actions">
          {missing.length ? <span className="ob-errsum"><Icon name="alert" size={13} /> Still to do: {missing.map((s) => ONB_STEP_LABEL[s]).join(", ")}.</span> : null}
          <Button variant="primary" icon="send" disabled={!!missing.length} onClick={() => dispatch(onbAct.finish(o.id))}>Send welcome email and finish (simulated)</Button>
        </div>
      ) : (
        <div className="ob-actions">
          <OnbNextUp o={o} />
          <Button icon="mail" onClick={() => nav.go({ page: "Sales", tab: "recall" })}>See it in Retention</Button>
          <Button variant="ghost" icon="list" onClick={() => nav.setParams({})}>Back to all onboardings</Button>
        </div>
      )}
    </Card>
  );
}
