/* The lead's invoicing details (the Monday board's invoice name, invoice email and company details
   columns), shown on the lead and edited in place. Saved through sales/updateLead, so the change is
   on the lead's timeline and in the activity log. */
import { useState } from "react";
import type { SalesLead } from "../../model";
import { dispatch } from "../../store";
import { Button, Field, Icon, TextInput, Textarea } from "../../ui";
import { salesAct } from "./actions";
import { useSalesRights } from "./shared";

export function InvoicingCard({ lead }: { lead: SalesLead }) {
  const rights = useSalesRights();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(lead.invoiceName);
  const [email, setEmail] = useState(lead.invoiceEmail);
  const [details, setDetails] = useState(lead.companyDetails);
  const start = () => { setName(lead.invoiceName); setEmail(lead.invoiceEmail); setDetails(lead.companyDetails); setEditing(true); };
  const save = () => {
    const r = dispatch(salesAct.updateLead(lead.id, { invoiceName: name, invoiceEmail: email, companyDetails: details }));
    if (r.ok || r.tone === "info") setEditing(false);
  };
  const missing = !lead.invoiceName.trim() || !lead.invoiceEmail.trim();
  return (
    <div className="inv-card">
      <div className="inv-head">
        <span className="inv-title"><Icon name="file" size={14} />Invoicing</span>
        {missing && !editing ? <span className="inv-warn">Needed before the first invoice</span> : null}
        <span className="ph-grow" />
        {rights.manage && !editing ? <Button size="sm" variant="ghost" icon="edit" onClick={start}>Edit</Button> : null}
      </div>
      {editing ? (
        <div className="inv-form">
          <Field label="Invoice name"><TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Registered company name" /></Field>
          <Field label="Invoice email"><TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="accounts@company.ie" /></Field>
          <div className="inv-span"><Field label="Company details"><Textarea rows={3} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Registered address, company number, purchase order rules" /></Field></div>
          <div className="inv-span ph-wrap" style={{ gap: 8, justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            <Button variant="primary" icon="check" onClick={save}>Save invoicing details</Button>
          </div>
        </div>
      ) : (
        <div className="inv-kv">
          <div><p className="crm-k">Invoice name</p><p className="crm-v">{lead.invoiceName || <span className="ph-faint">Not given yet</span>}</p></div>
          <div><p className="crm-k">Invoice email</p><p className="crm-v">{lead.invoiceEmail || <span className="ph-faint">Not given yet</span>}</p></div>
          <div className="inv-span"><p className="crm-k">Company details</p><p className="crm-v">{lead.companyDetails || <span className="ph-faint">Not given yet</span>}</p></div>
        </div>
      )}
      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
.inv-card { border: 1px solid var(--border); border-radius: 14px; padding: 12px 14px; background: var(--surface-2); }
.inv-head { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; flex-wrap: wrap; }
.inv-title { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; font-size: 13px; color: var(--ink); }
.inv-warn { font-size: 11.5px; color: var(--warn); }
.inv-kv, .inv-form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 16px; }
.inv-kv .crm-v { overflow-wrap: anywhere; }
.inv-span { grid-column: 1 / -1; }
@media (max-width: 640px) { .inv-kv, .inv-form { grid-template-columns: minmax(0, 1fr); } }
`;
