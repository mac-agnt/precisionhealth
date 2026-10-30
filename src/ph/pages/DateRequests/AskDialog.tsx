/* "Ask the client for dates": staff choose how many days, the window and lab or point of care. The
   client's HR contact is emailed (simulated) and sees the request at the top of their portal. */
import { useMemo, useState } from "react";
import { DAY_SCREEN_LABEL, PROGRAMME_BY_ID, addDays, drDayInfo, drOpen, fmtDate, today } from "../../model";
import type { DayScreen, ProgrammeId } from "../../model";
import { dispatch, usePersona, usePhState } from "../../store";
import { useNav } from "../../nav-context";
import { Button, DemoTag, Field, Icon, Modal, Segmented, Select, TextInput, Textarea } from "../../ui";
import { clientContact, requestClientPortalProgramme } from "../ClientPortal/data";
import { canManageDays } from "../Clinics/DayDrawer";
import { drAct } from "./actions";
import "./dq.css";

export function AskDatesDialog({ open, onClose, programmeId }: { open: boolean; onClose: () => void; programmeId?: ProgrammeId | "" }) {
  if (!open) return null;
  return <AskBody onClose={onClose} initial={programmeId || ""} />;
}

function AskBody({ onClose, initial }: { onClose: () => void; initial: ProgrammeId | "" }) {
  const s = usePhState();
  const p = usePersona();
  const nav = useNav();
  const t = today(s);
  const [pid, setPid] = useState<ProgrammeId | "">(initial);
  const [days, setDays] = useState("1");
  const [from, setFrom] = useState(addDays(t, 21));
  const [to, setTo] = useState(addDays(t, 52));
  const [screen, setScreen] = useState<DayScreen>("lab");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const manage = canManageDays(p);
  const prog = pid ? PROGRAMME_BY_ID[pid] : null;
  const hr = pid ? clientContact(pid) : undefined;
  const openReq = pid ? s.dateRequests.requests.find((r) => r.programmeId === pid && drOpen(r)) : undefined;
  const openDays = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from) return 0;
    let n = 0;
    for (let d = from; d <= to && n < 400; d = addDays(d, 1)) if (drDayInfo(s, d, null).pickable) n++;
    return n;
  }, [s, from, to]);

  const send = () => {
    if (!pid) return;
    const r = dispatch(drAct.ask(pid, Number(days), from, to, screen, message));
    if (r.ok) setSent(pid);
  };
  const seePortal = () => { if (sent) requestClientPortalProgramme(sent as ProgrammeId); onClose(); nav.openClientPortal?.(); };

  if (sent) {
    return (
      <Modal open onClose={onClose} title="Request sent" width={520}
        footer={<><Button variant="ghost" onClick={onClose}>Done</Button><Button variant="primary" icon="users" onClick={seePortal}>See it in the client portal</Button></>}>
        <div className="dq-note" style={{ display: "flex", gap: 10 }}>
          <Icon name="check" size={18} style={{ color: "var(--ok)", flex: "none", marginTop: 1 }} />
          <span><strong style={{ color: "var(--ink)" }}>{hr?.name || "The HR contact"}</strong> at {PROGRAMME_BY_ID[sent as ProgrammeId].clientName} has been emailed a link. They see the request at the top of their client portal, pick days when a nurse is free, and you approve them. <DemoTag>Simulated</DemoTag></span>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} title="Ask the client for dates" width={600}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" icon="send" disabled={!pid || !manage || !!openReq} onClick={send}>Send request</Button></>}>
      <div className="dq-fields">
        <p className="dq-hint">The client's HR contact picks days from your real availability: days a nurse is free, never weekends or bank holidays. Nothing is booked until Dr Neil Reddy approves.</p>
        <Field label="Client" htmlFor="dq-client">
          <Select id="dq-client" value={pid} onChange={(e) => setPid(e.target.value as ProgrammeId)}>
            <option value="">Choose the client</option>
            {s.programmes.map((x) => <option key={x.id} value={x.id}>{x.clientName}: {x.name}</option>)}
          </Select>
        </Field>
        {openReq ? <p className="dq-err">{prog?.clientName} already has an open request ({openReq.id}). Open it from Requests from clients.</p> : null}
        <Field label="How many days do you need?">
          <Segmented label="Days needed" value={days} onChange={setDays} options={["1", "2", "3", "4", "5"].map((x) => ({ id: x, label: x }))} />
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          <Field label="From" htmlFor="dq-from"><TextInput id="dq-from" type="date" value={from} min={addDays(t, 1)} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To" htmlFor="dq-to"><TextInput id="dq-to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field>
        </div>
        <p className="dq-hint"><strong style={{ color: openDays >= Number(days) ? "var(--ok)" : "var(--bad)" }}>{openDays} {openDays === 1 ? "day" : "days"}</strong> between {fmtDate(from)} and {fmtDate(to)} {openDays === 1 ? "has" : "have"} a nurse free on the rota.</p>
        <Field label="Screen type">
          <Segmented label="Screen type" value={screen} onChange={setScreen} options={(["lab", "poc"] as DayScreen[]).map((x) => ({ id: x, label: DAY_SCREEN_LABEL[x] }))} />
        </Field>
        <Field label="Note for HR (optional)" htmlFor="dq-msg">
          <Textarea id="dq-msg" rows={2} value={message} placeholder="For example: Two more days for employees who missed the first dates." onChange={(e) => setMessage(e.target.value)} />
        </Field>
        {pid ? <p className="dq-hint"><Icon name="mail" size={13} style={{ verticalAlign: -2 }} /> Goes to {hr ? <><strong style={{ color: "var(--ink)" }}>{hr.name}</strong>, {hr.role}</> : `${prog?.clientName} HR`}, by email and in their client portal. <DemoTag>Simulated</DemoTag></p> : null}
        {!manage ? <p className="dq-err">{p.name} ({p.roleLabel}) cannot ask clients for dates. Switch to Stephen, Liz, Brenda or Dr Neil Reddy.</p> : null}
      </div>
    </Modal>
  );
}
