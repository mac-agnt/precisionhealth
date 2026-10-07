/* Preview of the client-facing "Occupational Health Onboarding Form" (Jotform today). The client
   fills it in from the onboarding link; here staff preview it and simulate the submission, which
   adds the client to the onboarding board with a step for each owner. */
import { useState } from "react";
import { OH_SERVICES, ohBlankForm, ohFmtEur, ohFormErrors, ohMeddbaseFee, ohSampleForm } from "../../model";
import type { OhInvoiceFrequency, OhOnboardingForm } from "../../model";
import { dispatch } from "../../store";
import { Button, Checkbox, DemoTag, Drawer, Field, Select, TextInput, Textarea } from "../../ui";
import { OhNote, VIEW_ONLY_TITLE, useOhAccess } from "./shared";
import { ohAct } from "./actions";

type Errors = Partial<Record<keyof OhOnboardingForm, string>>;

export default function OnboardingForm({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const manage = useOhAccess() === "manage";
  const [f, setF] = useState<OhOnboardingForm>(ohBlankForm);
  const [tried, setTried] = useState(false);
  const errors: Errors = tried ? ohFormErrors(f) : {};
  const set = <K extends keyof OhOnboardingForm>(k: K, v: OhOnboardingForm[K]) => setF((x) => ({ ...x, [k]: v }));
  const text = (k: keyof OhOnboardingForm, label: string, opts: { type?: string; help?: string; placeholder?: string; required?: boolean } = {}) => (
    <Field label={<>{label}{opts.required ? <span aria-hidden="true" className="oh-req"> *</span> : null}</>} htmlFor={`ohf-${k}`} error={errors[k]} help={opts.help}>
      <TextInput id={`ohf-${k}`} type={opts.type || "text"} value={String(f[k] ?? "")} placeholder={opts.placeholder} invalid={!!errors[k]} aria-required={opts.required || undefined}
        onChange={(e) => set(k, e.target.value as never)} />
    </Field>
  );
  const submit = () => {
    setTried(true);
    if (Object.keys(ohFormErrors(f)).length) return;
    const r = dispatch(ohAct.submitOnboarding(f));
    if (r.ok && r.id) { setF(ohBlankForm()); setTried(false); onCreated(r.id); }
  };
  const errorCount = Object.keys(errors).length;

  return (
    <Drawer open={open} onClose={onClose} width={640} title="Occupational Health Onboarding Form"
      sub="What the new client fills in from their onboarding link. Jotform today; previewed here with a simulated submission."
      footer={
        <>
          <Button variant="ghost" onClick={() => { setF(ohSampleForm()); setTried(false); }}>Fill sample answers</Button>
          <Button variant="ghost" onClick={() => { setF(ohBlankForm()); setTried(false); }}>Clear</Button>
          <Button variant="primary" icon="send" disabled={!manage} title={manage ? undefined : VIEW_ONLY_TITLE} onClick={submit}>Submit (Simulated)</Button>
        </>
      }>
      <div className="ph-stack">
        <OhNote>Submitting adds the client to the Onboarding group with a step for Aidan (Xero), Fiona (SLA and DSA), Stephen (recurring invoice) and Sinead (Meddbase set-up). Nothing is sent to Jotform. <DemoTag>Simulated</DemoTag></OhNote>
        {tried && errorCount ? <div className="ph-err" role="alert">{errorCount} {errorCount === 1 ? "answer needs" : "answers need"} attention before this can be submitted.</div> : null}

        <fieldset className="oh-fieldset">
          <legend>Company</legend>
          <div className="oh-form-grid">
            {text("companyName", "Company name", { required: true })}
            {text("registeredName", "Registered company name", { required: true })}
            {text("croNumber", "Company registration number", { required: true, help: "CRO number. Demo values only." })}
            {text("registeredAddress", "Registered address", { required: true })}
          </div>
        </fieldset>

        <fieldset className="oh-fieldset">
          <legend>Contact</legend>
          <div className="oh-form-grid">
            {text("contactName", "Contact nurse or person", { required: true })}
            {text("contactRole", "Their role", { placeholder: "For example Occupational Health Nurse" })}
            {text("contactEmail", "Contact email", { type: "email", required: true })}
            {text("contactPhone", "Contact phone", { type: "tel" })}
          </div>
        </fieldset>

        <fieldset className="oh-fieldset">
          <legend>Meddbase set-up requirements</legend>
          <div className="oh-form-grid">
            <Field label={<>Number of Meddbase users<span aria-hidden="true" className="oh-req"> *</span></>} htmlFor="ohf-users" error={errors.meddbaseUsers}
              help={`Sets the yearly Meddbase fee: ${ohFmtEur(ohMeddbaseFee(f.meddbaseUsers || 1))} (demo figure).`}>
              <TextInput id="ohf-users" type="number" min={1} max={50} value={Number.isFinite(f.meddbaseUsers) ? f.meddbaseUsers : ""} invalid={!!errors.meddbaseUsers}
                onChange={(e) => set("meddbaseUsers", e.target.value === "" ? Number.NaN : Number(e.target.value))} />
            </Field>
            {text("sites", "Sites", { required: true, placeholder: "Where employees are seen" })}
          </div>
          <div style={{ marginTop: 12 }}>
            <div className="ph-label" id="ohf-services-label">Services needed<span aria-hidden="true" className="oh-req"> *</span></div>
            <div className="oh-checks" role="group" aria-labelledby="ohf-services-label">
              {OH_SERVICES.map((s) => (
                <Checkbox key={s} label={s} checked={f.services.includes(s)} onChange={(on) => set("services", on ? [...f.services, s] : f.services.filter((x) => x !== s))} />
              ))}
            </div>
            {errors.services ? <div className="ph-err" role="alert">{errors.services}</div> : null}
          </div>
          <div className="oh-form-grid" style={{ marginTop: 12 }}>
            {text("referralManagers", "Referral managers", { help: "People who may raise referrals in Meddbase." })}
            <Field label="Anything else for the Meddbase set-up" htmlFor="ohf-notes">
              <Textarea id="ohf-notes" rows={2} value={f.meddbaseNotes} onChange={(e) => set("meddbaseNotes", e.target.value)} />
            </Field>
          </div>
        </fieldset>

        <fieldset className="oh-fieldset">
          <legend>Account and billing</legend>
          <div className="oh-form-grid">
            {text("billingContact", "Billing contact", { required: true })}
            {text("billingEmail", "Billing email", { type: "email", required: true })}
            <Field label="Invoice frequency" htmlFor="ohf-freq">
              <Select id="ohf-freq" value={f.invoiceFrequency} onChange={(e) => set("invoiceFrequency", e.target.value as OhInvoiceFrequency)}>
                <option>Annual</option><option>Quarterly</option><option>Monthly</option>
              </Select>
            </Field>
            {text("vatNumber", "VAT number")}
          </div>
          <div style={{ marginTop: 12 }} className="oh-form-grid">
            <Checkbox label="A purchase order is required on invoices" checked={f.poRequired} onChange={(on) => set("poRequired", on)} />
            {f.poRequired ? text("poNumber", "Purchase order number", { required: true }) : <span />}
          </div>
        </fieldset>
        <p className="oh-small" style={{ margin: 0 }}>Fields marked * are required. Use fictional details only: this is a demo.</p>
      </div>
    </Drawer>
  );
}
