/* Shared pieces for the sales desk: the quick actions every deal has (log a call, send a follow
   up, book a meeting, move stage), the dialogs behind them, small value and due badges, and the
   desk styles. Used by the pipeline board and list, the deal room and Today. */
import "./deskActions";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  DESK_PURPOSE_LABEL, DESK_ROLE_LABEL, SALES_STAGE_LABEL, deskContacts, deskDeal, deskEmailDraft, deskEmailPurpose, deskNextWorkday, fmtWeekdayDate, salesEur,
  salesFirstReplyDraft, salesFollowSequence, salesInboundFor, today,
} from "../../model";
import type { DeskDeal, DeskEmailPurpose, DeskRole, SalesStage } from "../../model";
import { dispatch, usePhState } from "../../store";
import { Button, Field, Icon, Modal, Pill, Segmented, Select, TextInput, Textarea } from "../../ui";
import type { GlyphName } from "../../ui";
import { crmAct } from "./crmActions";
import { deskAct } from "./deskActions";
import { flowAct } from "./flowActions";
import { salesAct } from "./actions";
import { LostReasonModal } from "./LeadForms";
import { useMarkWon } from "./LeadFlow";
import { liveNowIso } from "./liveClock";
import { useSalesRights } from "./shared";

/* ---------------------------------------------------------------- formatting */

export const eurK = (n: number) => (n >= 10000 ? `€${(n / 1000).toFixed(n >= 100000 ? 0 : 1).replace(/\.0$/, "")}k` : salesEur(n));
export function dueText(d: DeskDeal): { text: string; tone: "bad" | "warn" | "dim" } | null {
  if (!d.lead.nextActionOn || !d.open) return null;
  if (d.dueIn !== null && d.dueIn < 0) return { text: `${-d.dueIn} day${d.dueIn === -1 ? "" : "s"} overdue`, tone: "bad" };
  if (d.dueIn === 0) return { text: "Due today", tone: "warn" };
  if (d.dueIn === 1) return { text: "Tomorrow", tone: "dim" };
  return { text: fmtWeekdayDate(d.lead.nextActionOn), tone: "dim" };
}
export function ProbDial({ pct, size = 26 }: { pct: number; size?: number }) {
  const r = size / 2 - 3, c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" style={{ flex: "none" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--track)" strokeWidth="3" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${(pct / 100) * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
    </svg>
  );
}

/* ---------------------------------------------------------------- dialogs, one host per page */

type DialogKind = "call" | "email" | "meeting" | "lost";
interface DialogApi { open: (kind: DialogKind, leadId: string, opts?: { purpose?: DeskEmailPurpose }) => void }
const DialogCtx = createContext<DialogApi>({ open: () => {} });
export const useDealDialogs = () => useContext(DialogCtx);

export function DealDialogs({ children }: { children: ReactNode }) {
  const [d, setD] = useState<{ kind: DialogKind; leadId: string; purpose?: DeskEmailPurpose } | null>(null);
  const api = useMemo<DialogApi>(() => ({ open: (kind, leadId, opts) => setD({ kind, leadId, purpose: opts?.purpose }) }), []);
  const s = usePhState();
  const lead = d ? s.sales.leads.find((l) => l.id === d.leadId) : undefined;
  const close = () => setD(null);
  return (
    <DialogCtx.Provider value={api}>
      {children}
      {d && lead && d.kind === "call" ? <CallDialog leadId={lead.id} onClose={close} /> : null}
      {d && lead && d.kind === "email" ? <EmailDialog leadId={lead.id} purpose={d.purpose} onClose={close} /> : null}
      {d && lead && d.kind === "meeting" ? <MeetingDialog leadId={lead.id} onClose={close} /> : null}
      {d && lead && d.kind === "lost" ? <LostReasonModal company={lead.company} onClose={close} onConfirm={(reason) => { if (dispatch(salesAct.moveLead(lead.id, "lost", reason)).ok) close(); }} /> : null}
    </DialogCtx.Provider>
  );
}

function CallDialog({ leadId, onClose }: { leadId: string; onClose: () => void }) {
  const s = usePhState();
  const lead = s.sales.leads.find((l) => l.id === leadId)!;
  const t = today(s);
  const [outcome, setOutcome] = useState<"spoke" | "voicemail" | "none">("spoke");
  const [text, setText] = useState("");
  const [next, setNext] = useState(lead.nextAction || "");
  const [nextOn, setNextOn] = useState(deskNextWorkday(t, 2));
  const [err, setErr] = useState<string | null>(null);
  const lead0 = { spoke: `Spoke to ${lead.contact.name.split(" ")[0]}.`, voicemail: "Left a voicemail.", none: "No answer." }[outcome];
  const save = () => {
    const body = `${lead0}${text.trim() ? ` ${text.trim()}` : ""}`;
    const r = dispatch(crmAct.logActivity(lead.id, "call", body, next, nextOn || null));
    if (r.ok) onClose(); else setErr(r.message || "Could not log the call.");
  };
  return (
    <Modal open onClose={onClose} title={`Log a call with ${lead.company}`} width={520}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" icon="check" onClick={save}>Log call</Button></>}>
      <div className="ph-stack" style={{ gap: 12 }}>
        <div className="dk-callto"><Icon name="phone" size={15} /><span><b>{lead.contact.name}</b>, {lead.contact.role}</span><a className="ph-link ph-num" href={`tel:${lead.contact.phone.replace(/\s/g, "")}`}>{lead.contact.phone}</a></div>
        <Segmented value={outcome} onChange={setOutcome} label="How did it go" options={[{ id: "spoke", label: "Spoke to them" }, { id: "voicemail", label: "Voicemail" }, { id: "none", label: "No answer" }]} />
        <Field label="What happened (optional)"><Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="For example: happy with the numbers, waiting on finance sign-off." /></Field>
        <div className="dk-two">
          <Field label="Next step"><TextInput value={next} onChange={(e) => setNext(e.target.value)} placeholder="Send revised proposal" /></Field>
          <Field label="By"><TextInput type="date" value={nextOn} min={t} onChange={(e) => setNextOn(e.target.value)} /></Field>
        </div>
        {err ? <div className="dk-err">{err}</div> : null}
      </div>
    </Modal>
  );
}

function EmailDialog({ leadId, purpose: p0, onClose }: { leadId: string; purpose?: DeskEmailPurpose; onClose: () => void }) {
  const s = usePhState();
  const lead = s.sales.leads.find((l) => l.id === leadId)!;
  const inb = salesInboundFor(s, lead.id);
  const first = !!inb && !inb.firstTouchAt;
  const [purpose, setPurpose] = useState<DeskEmailPurpose>(p0 || deskEmailPurpose(s, lead));
  const people = deskContacts(s, lead.id).filter((c) => !c.left);
  const [to, setTo] = useState(people[0]?.email || lead.contact.email);
  const draft: { subject: string; body: string; attachments?: string[] } = useMemo(() => (first ? salesFirstReplyDraft(s, lead) : deskEmailDraft(s, lead, purpose)), [purpose, first]); // eslint-disable-line react-hooks/exhaustive-deps
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  useEffect(() => { setSubject(draft.subject); setBody(draft.body); }, [draft]);
  const [err, setErr] = useState<string | null>(null);
  const send = () => {
    const r = first ? dispatch(flowAct.sendFirstEmail(lead.id, subject, body, draft.attachments || [], liveNowIso(s))) : dispatch(deskAct.sendEmail(lead.id, purpose, subject, body, to));
    if (r.ok) onClose(); else setErr(r.message || "Could not send.");
  };
  return (
    <Modal open onClose={onClose} title={first ? `First reply to ${lead.company}` : `Email ${lead.company}`} width={620}
      footer={<><span className="ph-faint" style={{ fontSize: 11.5, marginRight: "auto" }}>Simulated: nothing leaves Pulse.</span><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" icon="send" onClick={send}>Send</Button></>}>
      <div className="ph-stack" style={{ gap: 12 }}>
        <div className="ph-row-flex ph-wrap" style={{ gap: 8 }}>
          <Pill tone="brand" icon="spark">Agent draft, check before sending</Pill>
          {first ? <Pill tone="warn" icon="clock">First touch, 10 minute rule</Pill> : null}
        </div>
        {!first ? <Segmented value={purpose} onChange={setPurpose} label="Kind of email" options={(Object.keys(DESK_PURPOSE_LABEL) as DeskEmailPurpose[]).map((k) => ({ id: k, label: DESK_PURPOSE_LABEL[k] }))} /> : null}
        <div className="dk-two">
          <Field label="To">{people.length > 1 && !first ? (
            <Select value={to} onChange={(e) => setTo(e.target.value)}>{people.map((c) => <option key={c.key} value={c.email}>{c.name}, {c.title}</option>)}</Select>
          ) : <TextInput value={`${lead.contact.name} <${lead.contact.email}>`} readOnly />}</Field>
          <Field label="Subject"><TextInput value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>
        </div>
        <Textarea rows={10} value={body} onChange={(e) => setBody(e.target.value)} aria-label="Email" />
        {draft.attachments?.length ? <div className="ph-faint" style={{ fontSize: 12 }}><Icon name="file" size={12} /> {draft.attachments.join(", ")}</div> : null}
        {err ? <div className="dk-err">{err}</div> : null}
      </div>
    </Modal>
  );
}

function MeetingDialog({ leadId, onClose }: { leadId: string; onClose: () => void }) {
  const s = usePhState();
  const lead = s.sales.leads.find((l) => l.id === leadId)!;
  const t = today(s);
  const people = deskContacts(s, lead.id).filter((c) => !c.left);
  const [kind, setKind] = useState<"meeting" | "call">("meeting");
  const [date, setDate] = useState(deskNextWorkday(t, 1));
  const [start, setStart] = useState("10:00");
  const [mins, setMins] = useState("60");
  const [who, setWho] = useState(people[0]?.name || lead.contact.name);
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const clash = (s.scheduled?.items || []).filter((x) => x.status === "scheduled" && x.date === date && x.start && x.staffIds.includes("stephen"));
  const book = () => {
    const r = dispatch(deskAct.bookMeeting(lead.id, { kind, date, start, minutes: Number(mins), contact: who, notes }));
    if (r.ok) onClose(); else setErr(r.message || "Could not book.");
  };
  return (
    <Modal open onClose={onClose} title={`Book a ${kind} with ${lead.company}`} width={540}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" icon="calendar" onClick={book}>Book and add to calendar</Button></>}>
      <div className="ph-stack" style={{ gap: 12 }}>
        <Segmented value={kind} onChange={setKind} label="Meeting or call" options={[{ id: "meeting", label: "Meeting" }, { id: "call", label: "Call" }]} />
        <div className="dk-three">
          <Field label="Day"><TextInput type="date" value={date} min={t} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Start"><TextInput type="time" value={start} step={900} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label="Length"><Select value={mins} onChange={(e) => setMins(e.target.value)}>{["15", "30", "45", "60", "90"].map((m) => <option key={m} value={m}>{m} minutes</option>)}</Select></Field>
        </div>
        <Field label="With"><Select value={who} onChange={(e) => setWho(e.target.value)}>{people.map((c) => <option key={c.key} value={c.name}>{c.name}, {c.title}</option>)}</Select></Field>
        <Field label="Agenda (optional)"><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Numbers, sites, dates and which package suits." /></Field>
        {clash.length ? <div className="ph-faint" style={{ fontSize: 12 }}><Icon name="calendar" size={12} /> You already have {clash.map((x) => `${x.start} ${x.client || x.title}`).join(", ")} that day.</div> : null}
        {err ? <div className="dk-err">{err}</div> : null}
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- quick actions */

/** Log call, send follow up, book meeting and move stage, for one deal. Stops clicks reaching the card. */
export function QuickActions({ d, size = "icon" }: { d: DeskDeal; size?: "icon" | "full" }) {
  const s = usePhState();
  const rights = useSalesRights();
  const dlg = useDealDialogs();
  const markWon = useMarkWon();
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!menu) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setMenu(false); };
    window.addEventListener("mousedown", h);
    return () => window.removeEventListener("mousedown", h);
  }, [menu]);
  if (!rights.manage) return null;
  const L = d.lead;
  const seq = salesFollowSequence(s, L.id);
  const canSeq = !!seq && !seq.stopped && !seq.paused && !!seq.next;
  const follow = () => { if (canSeq) dispatch(flowAct.followUp(L.id, seq!.next!.n, "send")); else dlg.open("email", L.id); };
  const move = (to: SalesStage) => {
    setMenu(false);
    if (to === L.stage) return;
    if (to === "won") markWon(L.id);
    else if (to === "lost") dlg.open("lost", L.id);
    else dispatch(salesAct.moveLead(L.id, to));
  };
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
  const btn = (icon: GlyphName, label: string, run: () => void, primary?: boolean) => size === "icon"
    ? <button type="button" className="dk-qa" title={label} aria-label={`${label}: ${L.company}`} onClick={(e) => { e.stopPropagation(); run(); }}><Icon name={icon} size={13} /></button>
    : <Button size="sm" variant={primary ? "primary" : "secondary"} icon={icon} onClick={(e) => { e.stopPropagation(); run(); }}>{label}</Button>;
  return (
    <span className={`dk-qas ${size}`} onClick={stop} onKeyDown={stop} ref={ref}>
      {d.open ? btn("phone", "Log call", () => dlg.open("call", L.id)) : null}
      {d.open ? btn("mail", canSeq ? `Send follow up ${seq!.next!.n}` : "Email", follow) : null}
      {d.open ? btn("calendar", "Book meeting", () => dlg.open("meeting", L.id)) : null}
      <span style={{ position: "relative", display: "inline-flex" }}>
        {btn("arrow", "Move stage", () => setMenu(!menu))}
        {menu ? (
          <span className="dk-menu" role="menu">
            {(["new", "proposal_sent", "won", "lost"] as SalesStage[]).map((st) => (
              <button key={st} type="button" role="menuitem" className={st === L.stage ? "on" : ""} disabled={st === L.stage} onClick={(e) => { e.stopPropagation(); move(st); }}>
                {st === L.stage ? <Icon name="check" size={12} /> : <span style={{ width: 12 }} />}{SALES_STAGE_LABEL[st]}
              </button>))}
          </span>) : null}
      </span>
    </span>
  );
}

/** Contact list and add form, used in the deal room. */
export function ContactsCard({ leadId }: { leadId: string }) {
  const s = usePhState();
  const rights = useSalesRights();
  const people = deskContacts(s, leadId);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ name: "", title: "", email: "", phone: "", role: "champion" as DeskRole, primary: false });
  const [err, setErr] = useState<string | null>(null);
  const add = () => { const r = dispatch(deskAct.addContact(leadId, f)); if (r.ok) { setAdding(false); setF({ name: "", title: "", email: "", phone: "", role: "champion", primary: false }); setErr(null); } else setErr(r.message || ""); };
  useEffect(() => { const open = () => setAdding(true); window.addEventListener("dk-add-contact", open); return () => window.removeEventListener("dk-add-contact", open); }, []);
  return (
    <div className="dk-people">
      {people.map((c) => (
        <div key={c.key} className={`dk-person${c.left ? " left" : ""}`}>
          <span className="dk-av" aria-hidden="true">{c.name.split(" ").map((x) => x[0]).slice(0, 2).join("")}</span>
          <div className="ph-grow" style={{ minWidth: 0 }}>
            <div className="dk-person-name">{c.name}{c.primary ? <Pill tone="brand">Main contact</Pill> : null}{c.left ? <Pill tone="bad" icon="x">Left{c.leftOn ? ` ${fmtWeekdayDate(c.leftOn).replace(/^\w+ /, "")}` : ""}</Pill> : null}</div>
            <div className="dk-person-sub">{c.title} · {DESK_ROLE_LABEL[c.role]}</div>
            {!c.left ? <div className="dk-person-sub"><a className="ph-link" href={`mailto:${c.email}`}>{c.email}</a>{c.phone ? <> · <span className="ph-num">{c.phone}</span></> : null}</div> : null}
          </div>
          {rights.manage ? (
            <span className="dk-person-acts">
              {!c.primary && !c.left && c.id ? <Button size="sm" variant="ghost" onClick={() => dispatch(deskAct.makePrimary(leadId, c.id!))}>Make main</Button> : null}
              <Button size="sm" variant="ghost" onClick={() => dispatch(deskAct.contactLeft(leadId, c.key, !c.left))}>{c.left ? "Still there" : "Left company"}</Button>
            </span>) : null}
        </div>))}
      {rights.manage ? (adding ? (
        <div className="dk-addform">
          <div className="dk-two"><Field label="Name"><TextInput value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></Field><Field label="Job title"><TextInput value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field></div>
          <div className="dk-two"><Field label="Email"><TextInput type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="name@example.com" /></Field><Field label="Phone"><TextInput value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field></div>
          <div className="dk-two"><Field label="Role in the deal"><Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as DeskRole })}>{(Object.keys(DESK_ROLE_LABEL) as DeskRole[]).map((r) => <option key={r} value={r}>{DESK_ROLE_LABEL[r]}</option>)}</Select></Field>
            <label className="dk-check"><input type="checkbox" checked={f.primary} onChange={(e) => setF({ ...f, primary: e.target.checked })} /> Make them the main contact</label></div>
          {err ? <div className="dk-err">{err}</div> : null}
          <div className="ph-row-flex" style={{ gap: 8, justifyContent: "flex-end" }}><Button size="sm" variant="ghost" onClick={() => { setAdding(false); setErr(null); }}>Cancel</Button><Button size="sm" variant="primary" icon="plus" onClick={add}>Add contact</Button></div>
        </div>) : <button type="button" className="dk-addbtn" onClick={() => setAdding(true)}><Icon name="plus" size={13} />Add a contact</button>) : null}
    </div>
  );
}

/** A deal's value with "estimate" marked, and its probability. */
export function ValueLine({ d, big }: { d: DeskDeal; big?: boolean }) {
  return (
    <span className={`dk-val${big ? " big" : ""}`} title={d.basis}>
      <b className="ph-num">{salesEur(d.value)}</b>{d.estimated ? <span className="dk-est">est.</span> : null}
      {d.open ? <span className="dk-prob"><ProbDial pct={d.prob} size={big ? 22 : 16} />{d.prob}%</span> : null}
    </span>
  );
}

export const dealOf = (s: ReturnType<typeof usePhState>, leadId: string) => { const l = s.sales.leads.find((x) => x.id === leadId); return l ? deskDeal(s, l) : null; };

export const DESK_CSS = `
.sp-view { display: inline-flex; align-items: center; gap: 6px; padding: 7px 12px; border-radius: 999px; border: 1px solid var(--border); background: transparent; color: var(--dim); font: inherit; font-size: 12.5px; cursor: pointer; }
.sp-view .ph-num { font-size: 11px; opacity: .75; }
.sp-view:hover { color: var(--ink); border-color: var(--accent); }
.sp-view.on { background: var(--accent); border-color: var(--accent); color: var(--on-accent); font-weight: 600; }
.dk-qas { display: inline-flex; gap: 4px; align-items: center; flex-wrap: wrap; }
.dk-qas.full { gap: 8px; }
.dk-qa { width: 28px; height: 28px; border-radius: 9px; border: 1px solid var(--border); background: var(--surface); color: var(--dim); display: inline-flex; align-items: center; justify-content: center; cursor: pointer; transition: color .15s, border-color .15s, background .15s; }
.dk-qa:hover { color: var(--accent); border-color: var(--accent); background: var(--accent-soft); }
.dk-qa:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.sp-card:has(.dk-menu), .pl-row:has(.dk-menu), .dlr-head:has(.dk-menu) { z-index: 40; position: relative; }
.dk-menu { position: absolute; right: 0; top: calc(100% + 6px); z-index: 30; min-width: 190px; padding: 6px; border-radius: 12px; border: 1px solid var(--border); background: var(--overlay, var(--surface)); box-shadow: 0 18px 40px rgba(0,0,0,.35); display: flex; flex-direction: column; }
.dk-menu button { display: flex; align-items: center; gap: 8px; text-align: left; border: 0; background: none; color: var(--body); font: inherit; font-size: 12.5px; padding: 8px 10px; border-radius: 8px; cursor: pointer; }
.dk-menu button:hover:not(:disabled) { background: var(--surface-2); color: var(--ink); }
.dk-menu button.on { color: var(--accent); cursor: default; }
.dk-two { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 10px; align-items: end; }
.dk-three { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr) minmax(0, 1fr); gap: 10px; }
.dk-err { font-size: 12.5px; color: var(--bad); }
.dk-callto { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 10px 12px; border-radius: 12px; background: var(--surface-2); font-size: 13px; color: var(--body); }
.dk-callto b { color: var(--ink); }
.dk-person-sub .ph-num { white-space: nowrap; }
.ph-page textarea.ph-input, .ph-modal textarea.ph-input { border-radius: 14px; padding: 10px 14px; line-height: 1.5; }
.dk-val { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--ink); }
.dk-val b { font-weight: 650; }
.dk-val.big b { font-size: 22px; letter-spacing: -.4px; }
.dk-est { font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: var(--faint); border: 1px solid var(--border); border-radius: 6px; padding: 0 5px; }
.dk-prob { display: inline-flex; align-items: center; gap: 4px; color: var(--dim); font-size: 11.5px; font-variant-numeric: tabular-nums; }
.dk-people { display: flex; flex-direction: column; }
.dk-person { display: flex; gap: 10px; align-items: flex-start; padding: 10px 0; border-top: 1px solid var(--border); }
.dk-person:first-child { border-top: 0; padding-top: 0; }
.dk-person.left { opacity: .62; }
.dk-av { width: 30px; height: 30px; flex: none; border-radius: 50%; background: var(--accent-soft); color: var(--accent); font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; }
.dk-person-name { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 13px; font-weight: 600; color: var(--ink); }
.dk-person-sub { font-size: 11.5px; color: var(--dim); margin-top: 2px; overflow-wrap: anywhere; }
.dk-person-acts { display: flex; flex-direction: column; gap: 2px; align-items: flex-end; }
.dk-addbtn { margin-top: 8px; display: inline-flex; gap: 6px; align-items: center; border: 1px dashed var(--border); background: none; color: var(--dim); border-radius: 10px; padding: 8px 12px; font: inherit; font-size: 12.5px; cursor: pointer; }
.dk-addbtn:hover { color: var(--accent); border-color: var(--accent); }
.dk-addform { margin-top: 10px; display: flex; flex-direction: column; gap: 10px; padding: 12px; border-radius: 12px; background: var(--surface-2); }
.dk-check { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--body); padding-bottom: 10px; }
@media (max-width: 560px) {
  .dk-two, .dk-three { grid-template-columns: minmax(0, 1fr); }
  .dk-person { flex-wrap: wrap; }
  .dk-person-acts { flex-direction: row; width: 100%; justify-content: flex-end; }
}
`;
