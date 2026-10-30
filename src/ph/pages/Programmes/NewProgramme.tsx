/* + New programme (and Edit programme): one dialog. Client, package from the Sales price list,
   screening method, window, headcount, sites, HR contact, invite code and Draft or Live. Creating it
   also makes the client (HR) portal on the Portals page and the invitation code. */
import { useMemo, useState } from "react";
import type { Programme, ProgrammeMethod, ProgrammeStatus } from "../../model";
import { PROGRAMME_METHOD_LABEL } from "../../model";
import { dispatch, usePhState } from "../../store";
import { Button, DemoTag, Field, Icon, Modal, Segmented, Select, Switch, TextInput } from "../../ui";
import { progAct } from "./progActions";
import type { ProgErrors, ProgField, ProgForm } from "./progModel";
import { autoCode, blankForm, clientChoices, defaultName, formFromProgramme, prefillFor, progErrors, serviceOptions } from "./progModel";

const NEW = "__new__";

/** from: "co-ibm", "onb:ONB-003" or a typed company name, to prefill. */
export function NewProgrammeDialog({ from, edit, onClose, onDone }: { from?: string; edit?: Programme; onClose: () => void; onDone: (id: string) => void }) {
  const s = usePhState();
  const choices = useMemo(() => clientChoices(s), [s]);
  const services = useMemo(() => serviceOptions(s), [s]);
  const [f, setF] = useState<ProgForm>(() => {
    if (edit) return formFromProgramme(s, edit);
    const base = blankForm(s);
    if (!from) return base;
    if (s.companies.some((c) => c.id === from) || from.startsWith("onb:")) return prefillFor(s, base, from);
    const onb = s.onboarding.onboardings.find((o) => o.id === from);
    if (onb) return prefillFor(s, base, `onb:${onb.id}`);
    const match = choices.find((c) => c.name.toLowerCase() === from.toLowerCase());
    return match ? prefillFor(s, base, match.ref) : prefillFor(s, base, "", from);
  });
  const [isNew, setIsNew] = useState(!edit && !!f.companyName && !f.clientRef);
  const [tried, setTried] = useState(false);
  const errs: ProgErrors = tried ? progErrors(s, f, edit?.id) : {};
  const err = (k: ProgField) => errs[k] || null;

  /* Fields that follow the client and dates until a person types their own. */
  const follow = (next: ProgForm, prev: ProgForm): ProgForm => {
    const out = { ...next };
    if (!edit && (prev.name === "" || prev.name === defaultName(prev.companyName, prev.method, prev.windowStart))) out.name = defaultName(out.companyName, out.method, out.windowStart);
    if (!edit && !out.codeTouched) out.inviteCode = autoCode(s, out.companyName, out.windowStart);
    return out;
  };
  const set = <K extends keyof ProgForm>(k: K, v: ProgForm[K]) => setF((prev) => follow({ ...prev, [k]: v }, prev));
  const pickClient = (ref: string) => {
    if (ref === NEW) { setIsNew(true); setF((prev) => follow({ ...prev, clientRef: "", companyName: "", onboardingId: null }, prev)); return; }
    setIsNew(false);
    setF((prev) => { const next = prefillFor(s, { ...prev, codeTouched: prev.codeTouched }, ref); return { ...next, name: prev.name && prev.name !== defaultName(prev.companyName, prev.method, prev.windowStart) ? prev.name : next.name }; });
  };
  const pickService = (id: string) => {
    const o = services.find((x) => x.id === id);
    setF((prev) => follow({ ...prev, serviceId: id, method: o ? o.method : prev.method }, prev));
  };
  const save = () => {
    setTried(true);
    if (Object.keys(progErrors(s, f, edit?.id)).length) return;
    const r = dispatch(edit ? progAct.update(edit.id, f) : progAct.create(f));
    if (r.ok) onDone(edit ? edit.id : r.id || "");
  };
  const svc = services.find((o) => o.id === f.serviceId);
  const groups = (["Clients", "Onboarded clients"] as const).map((g) => ({ g, list: choices.filter((c) => c.group === g) })).filter((x) => x.list.length);

  return (
    <Modal open onClose={onClose} title={edit ? `Edit ${edit.name}` : "New programme"} width={640}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" icon="check" onClick={save}>{edit ? "Save changes" : "Create programme"}</Button></>}>
      <div className="pn-form prg-modal">
        {edit ? (
          <div className="pn-client-fixed"><span className="pn-k">Client</span><b>{edit.clientName}</b></div>
        ) : (
          <div className="pn-two">
            <Field label="Client" help={f.onboardingId ? `Details taken from onboarding ${f.onboardingId}.` : "An existing client, an onboarded client, or a new company."}>
              <Select value={isNew ? NEW : f.clientRef} onChange={(e) => pickClient(e.target.value)} aria-label="Client" aria-invalid={!!err("companyName") || undefined}>
                <option value="" disabled>Choose a client</option>
                {groups.map(({ g, list }) => (
                  <optgroup key={g} label={g}>{list.map((c) => <option key={c.ref} value={c.ref}>{c.name}</option>)}</optgroup>
                ))}
                <option value={NEW}>New client, type the name</option>
              </Select>
            </Field>
            {isNew ? (
              <Field label="Company name" error={err("companyName")} help="Creates the company record.">
                <TextInput value={f.companyName} onChange={(e) => set("companyName", e.target.value)} placeholder="e.g. Acme Engineering" autoFocus invalid={!!err("companyName")} />
              </Field>
            ) : <Field label="Programme name" error={err("name")}><TextInput value={f.name} onChange={(e) => set("name", e.target.value)} invalid={!!err("name")} /></Field>}
          </div>
        )}
        {isNew || edit ? <Field label="Programme name" error={err("name")}><TextInput value={f.name} onChange={(e) => set("name", e.target.value)} invalid={!!err("name")} /></Field> : null}
        {!edit && !isNew && err("companyName") ? <div className="pn-err">{err("companyName")}</div> : null}

        <div className="pn-two">
          <Field label="Package" help={svc?.note} error={err("serviceId")}>
            <Select value={f.serviceId} onChange={(e) => pickService(e.target.value)} aria-label="Package">
              {services.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </Select>
          </Field>
          <Field label="Screening method" help={f.method === "poc" ? "Finger prick on the day. Reports can go the same day." : "Bloods to the lab. Results about 7 days later."}>
            <Segmented<ProgrammeMethod> label="Screening method" value={f.method} onChange={(v) => set("method", v)}
              options={(["poc", "lab"] as ProgrammeMethod[]).map((id) => ({ id, label: PROGRAMME_METHOD_LABEL[id] }))} />
          </Field>
        </div>
        <label className="pn-switch"><span>Flu vaccination add-on<span className="pn-sub">From the price list, per vaccine given.</span></span><Switch on={f.flu} onChange={(v) => set("flu", v)} label="Flu vaccination add-on" /></label>

        <div className="pn-two">
          <Field label="Window opens" error={err("windowStart")}><TextInput type="date" value={f.windowStart} onChange={(e) => set("windowStart", e.target.value)} invalid={!!err("windowStart")} /></Field>
          <Field label="Window closes" error={err("windowEnd")}><TextInput type="date" value={f.windowEnd} onChange={(e) => set("windowEnd", e.target.value)} invalid={!!err("windowEnd")} /></Field>
        </div>
        <div className="pn-two">
          <Field label="Headcount invited" error={err("headcount")}><TextInput inputMode="numeric" value={f.headcount} onChange={(e) => set("headcount", e.target.value.replace(/[^\d]/g, ""))} placeholder="e.g. 120" invalid={!!err("headcount")} /></Field>
          <Field label="Sites" error={err("sites")} help="Separate sites with a semicolon."><TextInput value={f.sites} onChange={(e) => set("sites", e.target.value)} placeholder="Dublin office; Cork plant" invalid={!!err("sites")} /></Field>
        </div>
        <div className="pn-two">
          <Field label="HR contact" error={err("hrName")}><TextInput value={f.hrName} onChange={(e) => set("hrName", e.target.value)} placeholder="Name" invalid={!!err("hrName")} /></Field>
          <Field label="HR email" error={err("hrEmail")}><TextInput type="email" value={f.hrEmail} onChange={(e) => set("hrEmail", e.target.value)} placeholder="name@company.ie" invalid={!!err("hrEmail")} /></Field>
        </div>
        <div className="pn-two">
          <Field label="Invite code" error={err("inviteCode")} help={f.codeTouched ? "Your own code." : "Made for you. You can change it."}>
            <TextInput className="pn-mono" value={f.inviteCode} onChange={(e) => setF((prev) => ({ ...prev, inviteCode: e.target.value.toUpperCase().replace(/\s+/g, "-"), codeTouched: true }))} invalid={!!err("inviteCode")} />
          </Field>
          {edit ? null : (
            <Field label="Status" help={f.status === "live" ? "HR can share the code straight away." : "Nothing is shared until you set it live."}>
              <Segmented<ProgrammeStatus> label="Status" value={f.status} onChange={(v) => set("status", v)} options={[{ id: "draft", label: "Draft" }, { id: "live", label: "Live" }]} />
            </Field>
          )}
        </div>
        {!edit ? (
          <div className="pn-note"><Icon name="link" size={14} /><span>Also creates the client (HR) portal on the Portals page with this code and booking link. <DemoTag>Simulated</DemoTag> nothing is emailed.</span></div>
        ) : null}
        {tried && Object.keys(errs).length ? <div className="pn-err" role="alert"><Icon name="alert" size={13} /> {Object.keys(errs).length === 1 ? "One thing to fix" : `${Object.keys(errs).length} things to fix`} before saving.</div> : null}
      </div>
    </Modal>
  );
}
