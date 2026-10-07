/* Lead creation (manual, from the simulated Help Scout inbox, a recall or a tender), the
   lost-reason prompt and the won-business handover. */
import { useState } from "react";
import { SALES_SERVICES, SALES_SERVICE_LABEL, SALES_SOURCES, SALES_SOURCE_LABEL, act, addDays, dublinToUtc, today } from "../../model";
import type { SalesService, SalesSource } from "../../model";
import { dispatch, getState } from "../../store";
import { Button, Checkbox, DemoTag, Field, Modal, Select, TextInput, Textarea } from "../../ui";
import { salesAct } from "./actions";
import type { CreateLead } from "./actions";
import { toInt } from "./shared";

export interface LeadPrefill {
  company?: string; fictionalCompany?: boolean; services?: SalesService[]; contactName?: string; contactRole?: string; contactEmail?: string; contactPhone?: string;
  source?: SalesSource; sourceRef?: string; enquiry?: string; headcount?: number | null; origin?: CreateLead["origin"]; title?: string; simulatedNote?: string;
}

export function NewLeadModal({ prefill, onClose, onCreated }: { prefill: LeadPrefill; onClose: () => void; onCreated: (leadId: string) => void }) {
  const [company, setCompany] = useState(prefill.company || "");
  const [fictional, setFictional] = useState(!!prefill.fictionalCompany);
  const [services, setServices] = useState<SalesService[]>(prefill.services || []);
  const [contactName, setContactName] = useState(prefill.contactName || "");
  const [contactRole, setContactRole] = useState(prefill.contactRole || "");
  const [contactEmail, setContactEmail] = useState(prefill.contactEmail || "");
  const [contactPhone, setContactPhone] = useState(prefill.contactPhone || "");
  const [source, setSource] = useState<SalesSource>(prefill.source || "website");
  const [sourceRef, setSourceRef] = useState(prefill.sourceRef || "");
  const [enquiry, setEnquiry] = useState(prefill.enquiry || "");
  const [headcount, setHeadcount] = useState(prefill.headcount ? String(prefill.headcount) : "");
  const [err, setErr] = useState<string | null>(null);
  const locked = !!prefill.origin;

  const toggle = (s: SalesService) => setServices(services.includes(s) ? services.filter((x) => x !== s) : [...services, s]);
  const submit = () => {
    const hc = toInt(headcount);
    if (hc !== null && (Number.isNaN(hc) || hc < 1)) { setErr("Headcount must be a whole number above zero, or blank."); return; }
    const r = dispatch(salesAct.createLead({
      company, fictionalCompany: fictional, services, contactName, contactRole, contactEmail, contactPhone, source, sourceRef: sourceRef || null, enquiry, headcount: hc, origin: prefill.origin || null,
    }));
    if (r.ok && r.id) onCreated(r.id);
    else if (!r.ok) setErr(r.message || "That lead could not be added.");
  };

  return (
    <Modal open onClose={onClose} title={prefill.title || "Add a lead"} width={620}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" icon="plus" onClick={submit}>Add to New contact leads</Button></>}>
      <div className="ph-stack" style={{ gap: 12 }}>
        {prefill.simulatedNote ? <div className="sl-note"><DemoTag>Simulated</DemoTag><span>{prefill.simulatedNote}</span></div> : null}
        <div className="sl-form2">
          <Field label="Company" htmlFor="sl-nl-co"><TextInput id="sl-nl-co" value={company} onChange={(e) => setCompany(e.target.value)} /></Field>
          <Field label="Headcount (if known)" htmlFor="sl-nl-hc"><TextInput id="sl-nl-hc" inputMode="numeric" value={headcount} onChange={(e) => setHeadcount(e.target.value)} /></Field>
        </div>
        <Checkbox checked={fictional} onChange={setFictional} label="Invented company name (demo)" />
        <div>
          <div className="ph-label">Service lines</div>
          <div className="ph-wrap" style={{ gap: 14 }}>
            {SALES_SERVICES.map((s) => <Checkbox key={s} checked={services.includes(s)} onChange={() => toggle(s)} label={SALES_SERVICE_LABEL[s]} />)}
          </div>
        </div>
        <div className="sl-form2">
          <Field label="Contact name" htmlFor="sl-nl-cn"><TextInput id="sl-nl-cn" value={contactName} onChange={(e) => setContactName(e.target.value)} /></Field>
          <Field label="Contact role" htmlFor="sl-nl-cr"><TextInput id="sl-nl-cr" value={contactRole} onChange={(e) => setContactRole(e.target.value)} /></Field>
          <Field label="Email" htmlFor="sl-nl-ce" help="Demo contacts use example.com."><TextInput id="sl-nl-ce" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} /></Field>
          <Field label="Phone" htmlFor="sl-nl-cp"><TextInput id="sl-nl-cp" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="+353 1 555 0100" /></Field>
          <Field label="Source" htmlFor="sl-nl-src">
            <Select id="sl-nl-src" value={source} disabled={locked} onChange={(e) => setSource(e.target.value as SalesSource)}>
              {SALES_SOURCES.map((s) => <option key={s} value={s}>{SALES_SOURCE_LABEL[s]}</option>)}
            </Select>
          </Field>
          <Field label="Reference" htmlFor="sl-nl-ref" help={source === "helpscout" ? "Help Scout conversation number." : undefined}>
            <TextInput id="sl-nl-ref" value={sourceRef} disabled={locked} onChange={(e) => setSourceRef(e.target.value)} />
          </Field>
        </div>
        <Field label="Enquiry" htmlFor="sl-nl-enq"><Textarea id="sl-nl-enq" rows={3} value={enquiry} onChange={(e) => setEnquiry(e.target.value)} /></Field>
        {err ? <div className="ph-err" role="alert">{err}</div> : null}
      </div>
    </Modal>
  );
}

export function LostReasonModal({ company, onClose, onConfirm }: { company: string; onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  return (
    <Modal open onClose={onClose} title={`Move ${company} to Lost`} width={480}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="danger" icon="x" disabled={reason.trim().length < 3} onClick={() => onConfirm(reason.trim())}>Move to Lost</Button></>}>
      <Field label="Why was it lost?" htmlFor="sl-lost" help="Kept on the lead. It helps the recall and tender lists later.">
        <Textarea id="sl-lost" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: chose a lower-cost provider" />
      </Field>
    </Modal>
  );
}

/**
 * Won business: create a programme set-up task for Stephen through the shared task action, then
 * link it to the lead. Programme records themselves are created in Programmes, not here.
 */
export function createProgrammeTask(leadId: string): boolean {
  const st = getState();
  const lead = st.sales.leads.find((l) => l.id === leadId);
  if (!lead) return false;
  const due = dublinToUtc(addDays(today(st), 2), "17:00");
  const r = dispatch(act.addTask(`Set up programme for ${lead.company} (won lead ${lead.id})`, "stephen", due), { silent: true });
  if (!r.ok) { dispatch(act.toast("warn", r.message || "The task could not be added.")); return false; }
  const tasks = getState().tasks;
  return dispatch(salesAct.linkHandover(leadId, tasks[tasks.length - 1].id)).ok;
}
