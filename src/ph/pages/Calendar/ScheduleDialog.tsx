/* "+ Schedule": one dialog to schedule anything the business does. First pick what, then a short
   form prefilled with the date and time that was clicked. Saving really creates it: a task in Work,
   a flu clinic in Flu, a Meddbase session in Occupational Health, a meeting on the lead's timeline,
   an email in the outbox. A screening day opens the Screening days agent with the request typed in. */
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { GlyphName } from "../../ui";
import type { LocalDate, SchedKind, StaffId } from "../../model";
import { NURSE_ROLE_KEYS, PROGRAMMES, RET_DEFAULT_TEMPLATES, SCHED_FOLLOW_TEMPLATES, fmtDateLong, hhmmToMinutes, minutesToHhmm, schedClientOptions } from "../../model";
import { dispatch, getState, usePersona, usePhState } from "../../store";
import { useNav } from "../../nav-context";
import { Button, Chip, DemoTag, Field, Icon, Modal, Segmented, Select, TextInput, Textarea } from "../../ui";
import { schedAct } from "./schedActions";
import type { SchedForm } from "./schedActions";
import { ampm } from "./util";

type Pick = "screening" | "meeting" | "follow_up" | "retention" | "flu" | "oh" | "task" | "team";
const TYPES: Array<{ id: Pick; label: string; sub: string; icon: GlyphName; color: string }> = [
  { id: "screening", label: "Screening day", sub: "Agent drafts the day for a client", icon: "calendar", color: "#3B8FD9" },
  { id: "meeting", label: "Client meeting or call", sub: "Shows on the lead's timeline", icon: "users", color: "#2E8B57" },
  { id: "follow_up", label: "Follow up email", sub: "Sends at the time you pick", icon: "mail", color: "#5BAF7A" },
  { id: "retention", label: "Results out or rebooking", sub: "Email to the client's HR contact", icon: "send", color: "#D86A2B" },
  { id: "flu", label: "Flu clinic", sub: "Company, numbers and staff", icon: "shield", color: "#E0A030" },
  { id: "oh", label: "Occupational health", sub: "A Meddbase session at a client", icon: "heart", color: "#A06CE0" },
  { id: "task", label: "Task or reminder", sub: "Goes into Work, Tasks", icon: "check", color: "#7E8FA3" },
  { id: "team", label: "Training or leave", sub: "Leave blocks a nurse from clinics", icon: "flag", color: "#7A6FD0" },
];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const plus = (t: string, n: number) => minutesToHhmm(Math.min(23 * 60 + 45, hhmmToMinutes(t) + n));

export default function ScheduleDialog({ date, time, onClose, onCreated }: { date: LocalDate; time: string | null; onClose: () => void; onCreated: (calId: string, date: LocalDate) => void }) {
  const state = usePhState();
  const nav = useNav();
  const p = usePersona();
  const [type, setType] = useState<Pick | null>(null);
  const t0 = time || "09:00";
  const [f, setF] = useState({
    sub: "meeting" as SchedKind, date: date as string, endDate: "", start: t0, end: plus(t0, 60), client: "", contact: "", email: "", notes: "", title: "",
    template: SCHED_FOLLOW_TEMPLATES[0].id, projected: "", address: "", staff: [] as string[], owner: (p.isParticipant ? "brenda" : p.id) as string, nurse: "",
  });
  const up = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));
  const clients = useMemo(() => schedClientOptions(state), [state]);
  const nurses = state.staff.filter((s) => NURSE_ROLE_KEYS.includes(s.role));
  const fluStaff = [...nurses, ...state.staff.filter((s) => s.role === "wellness_support")];
  const ohClients = state.occHealth.clients;
  const pickClient = (name: string) => {
    const o = clients.find((c) => c.name === name);
    up({ client: name, contact: o?.contact || "", email: o?.email || "" });
  };
  const toggleStaff = (id: string) => up({ staff: f.staff.includes(id) ? f.staff.filter((x) => x !== id) : [...f.staff, id] });

  const choose = (id: Pick) => {
    setType(id);
    if (id === "meeting") up({ sub: "meeting", end: plus(f.start, 60) });
    if (id === "follow_up") up({ sub: "follow_up" });
    if (id === "retention") up({ sub: "results_out" });
    if (id === "team") up({ sub: "training", end: plus(f.start, 120), title: "" });
    if (id === "oh") up({ end: plus(f.start, 180) });
    if (id === "task") up({ start: time || "17:00" });
  };

  const screeningAsk = () => {
    const d = new Date(f.date + "T12:00:00Z");
    const nurse = state.staff.find((s) => s.id === f.nurse);
    const text = `${f.client || "IBM"}, ${d.getUTCDate()} ${MONTHS_LONG[d.getUTCMonth()]}, starting at ${f.start}${nurse ? ` with ${nurse.name.split(" ")[0]}` : ""}${f.notes.trim() ? `, ${f.notes.trim()}` : ""}`;
    return text;
  };
  const submit = () => {
    if (!type) return;
    if (type === "screening") {
      onClose();
      nav.go({ page: "Clinics", tab: "days", params: { ask: screeningAsk() } });
      return;
    }
    const kind: SchedKind = type === "meeting" || type === "retention" || type === "team" ? f.sub : type;
    const form: SchedForm = {
      kind, date: f.date as LocalDate, start: kind === "leave" ? null : f.start || null, end: ["meeting", "call", "oh", "training"].includes(kind) ? f.end || null : null,
      endDate: kind === "leave" && f.endDate ? (f.endDate as LocalDate) : null, title: f.title, client: f.client, leadId: clients.find((c) => c.name === f.client)?.leadId || null,
      contact: f.contact, contactEmail: f.email, notes: f.notes, template: f.template, projected: f.projected ? Number(f.projected) : null, address: f.address,
      staffIds: (kind === "task" ? [f.owner] : kind === "oh" ? [f.nurse].filter(Boolean) : f.staff) as StaffId[],
    };
    const r = dispatch(schedAct.create(form));
    if (!r.ok || !r.id) return;
    const s = getState();
    let calId = `sched:${r.id}`;
    if (kind === "flu") calId = `flu:${r.id}`;
    else if (kind === "oh") calId = `oh:${r.id}`;
    else if (kind === "task") { const x = s.scheduled.items.find((i) => i.id === r.id); if (x?.ref) calId = `task:${x.ref.id}`; }
    else if (kind === "leave") calId = `sched:${r.id}:${f.date}`;
    onCreated(calId, f.date as LocalDate);
  };

  const meta = type ? TYPES.find((x) => x.id === type)! : null;
  const clientSelect = (label = "Lead or client", only?: Array<{ name: string }>) => (
    <Field label={label}>
      <Select value={f.client} onChange={(e) => pickClient(e.target.value)} aria-label={label}>
        <option value="">Choose</option>
        {only ? only.map((c) => <option key={c.name} value={c.name}>{c.name}</option>) : (
          Array.from(new Set(clients.map((c) => c.group))).map((g) => (
            <optgroup key={g} label={g}>{clients.filter((c) => c.group === g).map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}</optgroup>
          ))
        )}
      </Select>
    </Field>
  );
  const dateField = (label = "Date") => <Field label={label}><TextInput type="date" value={f.date} onChange={(e) => up({ date: e.target.value })} aria-label={label} /></Field>;
  const timeField = (label: string, key: "start" | "end") => <Field label={label}><TextInput type="time" step={900} value={f[key]} onChange={(e) => up(key === "start" ? { start: e.target.value, end: f.end && f.end > e.target.value ? f.end : plus(e.target.value, 60) } : { end: e.target.value })} aria-label={label} /></Field>;
  const people = (list: typeof state.staff, label: string) => (
    <Field label={label}>
      <div className="sch-people">
        {list.map((s) => <Chip key={s.id} on={f.staff.includes(s.id)} onClick={() => toggleStaff(s.id)}>{s.name}</Chip>)}
      </div>
    </Field>
  );

  let body: ReactNode = null;
  let cta = "Schedule";
  if (type === "screening") {
    cta = "Open the Screening days agent";
    body = <>
      <div className="sch-grid">
        {clientSelect("Client", PROGRAMMES.map((x) => ({ name: x.clientName })))}
        <Field label="Nurse (optional)">
          <Select value={f.nurse} onChange={(e) => up({ nurse: e.target.value })} aria-label="Nurse">
            <option value="">Let the agent suggest</option>
            {nurses.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
          </Select>
        </Field>
        {dateField()}
        {timeField("Start", "start")}
      </div>
      <Field label="Anything else for the agent (optional)" help="For example: point of care, 12 appointments, the Trump room.">
        <TextInput value={f.notes} onChange={(e) => up({ notes: e.target.value })} placeholder="Point of care, 12 appointments" />
      </Field>
      <div className="sch-preview"><Icon name="spark" size={14} /><span>The agent will draft: <b>{screeningAsk()}</b>. You check it and save it as a draft day, then publish it to the client portal.</span></div>
    </>;
  } else if (type === "meeting") {
    body = <>
      <Segmented value={f.sub} onChange={(v) => up({ sub: v, end: plus(f.start, v === "call" ? 30 : 60) })} options={[{ id: "meeting" as SchedKind, label: "Meeting" }, { id: "call" as SchedKind, label: "Call" }]} label="Meeting or call" />
      <div className="sch-grid">
        {clientSelect()}
        <Field label="Who"><TextInput value={f.contact} onChange={(e) => up({ contact: e.target.value })} placeholder="Name at the client" /></Field>
        {dateField()}
        <div className="sch-two">{timeField("Start", "start")}{timeField("End", "end")}</div>
      </div>
      <Field label="Notes (optional)"><Textarea rows={2} value={f.notes} onChange={(e) => up({ notes: e.target.value })} placeholder="Walk through the proposal, POC3" /></Field>
    </>;
  } else if (type === "follow_up") {
    const tpl = SCHED_FOLLOW_TEMPLATES.find((x) => x.id === f.template)!;
    const first = (f.contact || "there").split(" ")[0];
    body = <>
      <div className="sch-grid">
        {clientSelect()}
        <Field label="To"><TextInput value={f.contact} onChange={(e) => up({ contact: e.target.value })} placeholder="Name" /></Field>
        <Field label="Template">
          <Select value={f.template} onChange={(e) => up({ template: e.target.value })} aria-label="Template">
            {SCHED_FOLLOW_TEMPLATES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
          </Select>
        </Field>
        <Field label="Email"><TextInput value={f.email} onChange={(e) => up({ email: e.target.value })} placeholder="name@company.ie" /></Field>
        {dateField("Send on")}
        {timeField("At", "start")}
      </div>
      <div className="sch-mail">
        <div className="sch-mail-s">{tpl.subject}</div>
        <div className="sch-mail-b">{tpl.body.replace("{first}", first).replace("{company}", f.client || "your company").replace("{sender}", p.name)}</div>
      </div>
    </>;
  } else if (type === "retention") {
    const tpl = RET_DEFAULT_TEMPLATES[f.sub === "rebooking" ? "rebooking" : "results_out"];
    body = <>
      <Segmented value={f.sub} onChange={(v) => up({ sub: v })} options={[{ id: "results_out" as SchedKind, label: "Results are out" }, { id: "rebooking" as SchedKind, label: "Rebooking reminder" }]} label="Which email" />
      <div className="sch-grid">
        {clientSelect("Client")}
        <Field label="HR contact"><TextInput value={f.contact} onChange={(e) => up({ contact: e.target.value })} placeholder="Name" /></Field>
        {dateField("Send on")}
        {timeField("At", "start")}
      </div>
      <div className="sch-preview"><Icon name="mail" size={14} /><span><b>{tpl.subject.replace("{company}", f.client || "Client")}</b>. {tpl.use} It is listed in Sales, Retention.</span></div>
    </>;
  } else if (type === "flu") {
    body = <>
      <div className="sch-grid">
        <Field label="Company">
          <TextInput list="sch-companies" value={f.client} onChange={(e) => up({ client: e.target.value })} placeholder="Company name" />
          <datalist id="sch-companies">{clients.map((c) => <option key={c.name} value={c.name} />)}</datalist>
        </Field>
        <Field label="Projected vaccinations"><TextInput type="number" min={1} inputMode="numeric" value={f.projected} onChange={(e) => up({ projected: e.target.value })} placeholder="60" /></Field>
        {dateField()}
        {timeField("Start", "start")}
      </div>
      <Field label="Address (optional)"><TextInput value={f.address} onChange={(e) => up({ address: e.target.value })} placeholder="Site address" /></Field>
      {people(fluStaff, "Staff onsite (optional, you can add them later)")}
    </>;
  } else if (type === "oh") {
    body = <>
      <div className="sch-grid">
        {clientSelect("Occupational health client", ohClients.map((c) => ({ name: c.name })))}
        <Field label="Nurse or advisor">
          <Select value={f.nurse} onChange={(e) => up({ nurse: e.target.value })} aria-label="Nurse or advisor">
            <option value="">Choose</option>
            {fluStaff.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
          </Select>
        </Field>
        {dateField()}
        <div className="sch-two">{timeField("Start", "start")}{timeField("End", "end")}</div>
      </div>
      <Field label="Location (optional)"><TextInput value={f.address} onChange={(e) => up({ address: e.target.value })} placeholder="Medical room at the client site" /></Field>
      <div className="sch-preview"><Icon name="info" size={14} /><span>Creates 15 minute free slots in the Meddbase diary. <DemoTag>Simulated</DemoTag></span></div>
    </>;
  } else if (type === "task") {
    body = <>
      <Field label="Task"><TextInput value={f.title} onChange={(e) => up({ title: e.target.value })} placeholder="Ring IBM HR about the room" autoFocus /></Field>
      <div className="sch-grid">
        <Field label="Owner">
          <Select value={f.owner} onChange={(e) => up({ owner: e.target.value })} aria-label="Owner">
            {state.staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <div className="sch-two">{dateField("Due")}{timeField("By", "start")}</div>
      </div>
      <Field label="Notes (optional)"><Textarea rows={2} value={f.notes} onChange={(e) => up({ notes: e.target.value })} /></Field>
    </>;
  } else if (type === "team") {
    const leave = f.sub === "leave";
    body = <>
      <Segmented value={f.sub} onChange={(v) => up({ sub: v })} options={[{ id: "training" as SchedKind, label: "Staff training" }, { id: "leave" as SchedKind, label: "Leave or holiday" }]} label="Training or leave" />
      <Field label={leave ? "Type of leave" : "Training"}><TextInput value={f.title} onChange={(e) => up({ title: e.target.value })} placeholder={leave ? "Annual leave" : "Phlebotomy refresher"} /></Field>
      {people(state.staff, leave ? "Who is off" : "Who is going")}
      <div className="sch-grid">
        {dateField(leave ? "First day" : "Date")}
        {leave ? <Field label="Last day (optional)"><TextInput type="date" value={f.endDate} min={f.date} onChange={(e) => up({ endDate: e.target.value })} aria-label="Last day" /></Field>
          : <div className="sch-two">{timeField("Start", "start")}{timeField("End", "end")}</div>}
      </div>
      {leave ? <div className="sch-preview"><Icon name="lock" size={14} /><span>Leave blocks them from screening days, flu clinics and occupational health sessions on those days.</span></div> : null}
    </>;
  }

  return (
    <Modal open onClose={onClose} width={type ? 600 : 640}
      title={type ? <span className="sch-title"><button type="button" className="cal-iconbtn" onClick={() => setType(null)} aria-label="Back to the list"><Icon name="chevronLeft" size={16} /></button>{meta!.label}</span> : "Schedule"}
      footer={type ? <><Button variant="ghost" onClick={() => setType(null)}>Back</Button><Button variant="primary" icon={type === "screening" ? "spark" : "check"} onClick={submit}>{cta}</Button></> : undefined}>
      {!type ? (
        <>
          <div className="sch-when"><Icon name="clock" size={14} />{fmtDateLong(date)}{time ? `, ${ampm(time)}` : ""}<span className="ph-faint">. What would you like to schedule?</span></div>
          <div className="sch-types">
            {TYPES.map((x) => (
              <button key={x.id} type="button" className="sch-type" onClick={() => choose(x.id)} style={{ ["--c" as string]: x.color }}>
                <span className="sch-type-i"><Icon name={x.icon} size={16} /></span>
                <span className="sch-type-l">{x.label}<span>{x.sub}</span></span>
              </button>
            ))}
          </div>
        </>
      ) : <div className="sch-form">{body}</div>}
    </Modal>
  );
}
