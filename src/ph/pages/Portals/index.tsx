/* Portals: one place to see, open and create every portal.
   - Client (HR) portals, one per client company: invite link and code, live counts, open as HR, new portal.
   - Participant portals, one per person: where they are on the journey, open as them, resend or invite.
   - Nurse portal: the nursing team and their upcoming clinic days, open as a nurse, add a nurse.
   Deep links: #/Portals/all, #/Portals/all?section=participants, #/Portals/all?new=client. */
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { GlyphName } from "../../ui";
import type { ClientPortalRow, JourneyStatus, ProgrammeId } from "../../model";
import { JOURNEY_LABEL, PROGRAMMES, clientPortalRows, fmtDate, nursePortalRows, participantPortalRows, portalAct } from "../../model";
import { dispatch, usePersona, usePhState } from "../../store";
import { useNav } from "../../nav-context";
import { Avatar, Button, Card, DemoTag, Field, Icon, Modal, PageHeader, Pill, RestrictedNotice, SearchBox, Select, Switch, TextInput } from "../../ui";
import type { Tone } from "../../ui";
import { requestClientPortalCustom, requestClientPortalProgramme } from "../ClientPortal/data";
import { requestNursePortalNurse } from "../NursePortal";
import { portalsAct } from "./actions";
import "./portals.css";

const JOURNEY_TONE: Record<JourneyStatus, Tone> = { not_invited: "bad", invited: "neutral", registered: "info", booked: "brand", attended: "warn", released: "ok" };
const FILTERS: Array<{ id: JourneyStatus | "all"; label: string }> = [
  { id: "all", label: "Everyone" }, { id: "invited", label: "Invited" }, { id: "registered", label: "Registered" }, { id: "booked", label: "Booked" }, { id: "released", label: "Results released" },
];
const PAGE = 8;

async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

export default function Portals() {
  const state = usePhState();
  const p = usePersona();
  const nav = useNav();
  const [dialog, setDialog] = useState<"client" | "participant" | "nurse" | null>(null);
  useEffect(() => {
    const n = nav.params.new;
    if (n === "client" || n === "participant" || n === "nurse") { setDialog(n); nav.setParams({ ...nav.params, new: "" }); }
    const sec = nav.params.section;
    if (sec) window.setTimeout(() => document.getElementById(`pt-${sec}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  }, [nav.params.new, nav.params.section]); // eslint-disable-line react-hooks/exhaustive-deps
  if (p.isParticipant) {
    return <div className="ph-page"><PageHeader title="Portals" /><RestrictedNotice title="Not available in the participant preview">Portals are managed by Precision Health staff.</RestrictedNotice></div>;
  }
  const clients = clientPortalRows(state);
  const nurses = nursePortalRows(state);
  const people = participantPortalRows(state);
  const jump = (id: string) => document.getElementById(`pt-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="ph-page">
      <PageHeader title="Portals" sub="Every portal in one place: an HR portal for each client, a portal for each participant, and the nurse portal. Open any of them as that person, or set up a new one." />
      <div className="pt-sum">
        <SumTile icon="users" n={clients.length} label="Client (HR) portals" sub={`${clients.filter((c) => c.status === "live").length} live`} onClick={() => jump("clients")} />
        <SumTile icon="user" n={people.length} label="Participant portals" sub={`${people.filter((x) => x.journey === "released").length} with results released`} onClick={() => jump("participants")} />
        <SumTile icon="heart" n={nurses.length} label="Nurses with the nurse portal" sub={`${nurses.filter((x) => x.days.length).length} with clinics coming up`} onClick={() => jump("nurses")} />
      </div>
      <div className="ph-stack">
        <ClientSection rows={clients} onNew={() => setDialog("client")} />
        <ParticipantSection onNew={() => setDialog("participant")} />
        <NurseSection onNew={() => setDialog("nurse")} />
      </div>
      {dialog === "client" ? <NewClientDialog onClose={() => setDialog(null)} /> : null}
      {dialog === "participant" ? <InviteDialog onClose={() => setDialog(null)} /> : null}
      {dialog === "nurse" ? <NurseDialog onClose={() => setDialog(null)} /> : null}
    </div>
  );
}

function SumTile({ icon, n, label, sub, onClick }: { icon: GlyphName; n: number; label: string; sub: string; onClick: () => void }) {
  return (
    <button type="button" className="pt-tile" onClick={onClick}>
      <span className="pt-tile-i"><Icon name={icon} size={17} /></span>
      <span className="pt-tile-n ph-num">{n.toLocaleString("en-IE")}</span>
      <span className="pt-tile-l">{label}<span>{sub}</span></span>
    </button>
  );
}

function SectionHead({ id, icon, title, sub, count, actions }: { id: string; icon: GlyphName; title: string; sub: string; count: number; actions: ReactNode }) {
  return (
    <div className="pt-head" id={`pt-${id}`}>
      <span className="pt-head-i"><Icon name={icon} size={17} /></span>
      <div className="ph-grow" style={{ minWidth: 0 }}>
        <h2 className="pt-head-t">{title} <span className="pt-count ph-num">{count.toLocaleString("en-IE")}</span></h2>
        <div className="pt-head-s">{sub}</div>
      </div>
      <div className="pt-head-a">{actions}</div>
    </div>
  );
}

/* ---------------------------------------------------------------- client (HR) portals */

function ClientSection({ rows, onNew }: { rows: ClientPortalRow[]; onNew: () => void }) {
  const nav = useNav();
  const [copied, setCopied] = useState<string | null>(null);
  const open = (r: ClientPortalRow) => {
    if (r.programmeId) requestClientPortalProgramme(r.programmeId); else requestClientPortalCustom(r.id);
    nav.openClientPortal?.();
  };
  const copy = async (r: ClientPortalRow) => {
    const ok = await copyText(`https://${r.link}`);
    setCopied(r.id);
    dispatch({ type: "ui/toast", tone: "ok", text: ok ? `Invite link for ${r.company} copied: ${r.link}` : `Invite link for ${r.company}: ${r.link}` });
    window.setTimeout(() => setCopied((x) => (x === r.id ? null : x)), 2000);
  };
  return (
    <Card>
      <SectionHead id="clients" icon="users" title="Client (HR) portals" count={rows.length} sub="One per client. HR shares the link and code with employees and sees live counts, never names or results."
        actions={<><Button size="sm" icon="eye" onClick={() => open(rows[0])}>Open preview</Button><Button size="sm" variant="primary" icon="plus" onClick={onNew}>New client portal</Button></>} />
      <div className="pt-list c">
        {rows.map((r) => (
          <div key={r.id} className="pt-row pt-crow">
            <div className="pt-who">
              <span className="pt-logo">{r.company.replace(/\s*\(fictional\)/i, "").slice(0, 2).toUpperCase()}</span>
              <span style={{ minWidth: 0 }}>
                <span className="pt-name">{r.company}</span>
                <span className="pt-sub">{r.programme}</span>
              </span>
            </div>
            <div className="pt-hr"><span className="pt-k">HR contact</span>{r.hrName}<span className="pt-sub">{r.hrEmail}</span></div>
            <div className="pt-code"><span className="pt-k">Invite code</span><span className="pt-mono">{r.code}</span><span className="pt-sub pt-link">{r.link}</span></div>
            <div className="pt-counts">
              {([["Invited", r.counts.invited], ["Booked", r.counts.booked], ["Attended", r.counts.attended], ["Released", r.counts.released]] as Array<[string, number]>).map(([l, n]) => (
                <span key={l}><b className="ph-num">{n.toLocaleString("en-IE")}</b>{l}</span>
              ))}
            </div>
            <div className="pt-act">
              <Pill tone={r.status === "live" ? "ok" : "warn"} icon={null}>{r.status === "live" ? "Live" : "Draft"}</Pill>
              {r.rec && r.status === "draft" ? <Button size="sm" onClick={() => dispatch(portalsAct.goLive(r.id))}>Go live</Button> : null}
              <Button size="sm" icon="link" onClick={() => copy(r)} disabled={!r.link}>{copied === r.id ? "Copied" : "Copy invite link"}</Button>
              <Button size="sm" variant="primary" icon="arrow" onClick={() => open(r)}>Open as HR</Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ---------------------------------------------------------------- participant portals */

function ParticipantSection({ onNew }: { onNew: () => void }) {
  const state = usePhState();
  const nav = useNav();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<JourneyStatus | "all">("all");
  const [prog, setProg] = useState<string>("all");
  const [limit, setLimit] = useState(PAGE);
  const all = participantPortalRows(state);
  const rows = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return all.filter((x) => (filter === "all" || x.journey === filter) && (prog === "all" || x.row.programme.id === prog)
      && words.every((w) => `${x.row.person.given} ${x.row.person.family} ${x.row.person.email} ${x.row.person.id}`.toLowerCase().includes(w)));
  }, [all, q, filter, prog]);
  useEffect(() => setLimit(PAGE), [q, filter, prog]);
  const counts = (id: JourneyStatus | "all") => (id === "all" ? all.length : all.filter((x) => x.journey === id).length);
  const sample = all.find((x) => x.journey === "released") || all[0];
  return (
    <Card>
      <SectionHead id="participants" icon="user" title="Participant portals" count={all.length} sub="Each person's own portal: questionnaire, booking, messages and their report once released."
        actions={<><Button size="sm" icon="eye" onClick={() => sample && nav.openPortal(sample.row.person.id)}>Open preview</Button><Button size="sm" variant="primary" icon="plus" onClick={onNew}>Invite participant</Button></>} />
      <div className="pt-filters">
        <SearchBox value={q} onChange={setQ} placeholder="Search by name or email" width={260} />
        <Select value={prog} onChange={(e) => setProg(e.target.value)} aria-label="Programme" style={{ width: 200 }}>
          <option value="all">All programmes</option>
          {PROGRAMMES.map((x) => <option key={x.id} value={x.id}>{x.clientName}</option>)}
        </Select>
        <div className="pt-chips" role="group" aria-label="Status">
          {FILTERS.map((x) => (
            <button key={x.id} type="button" className={"ph-chip" + (filter === x.id ? " on" : "")} aria-pressed={filter === x.id} onClick={() => setFilter(x.id)}>
              {x.label}<span className="ph-num" style={{ opacity: 0.7 }}>{counts(x.id).toLocaleString("en-IE")}</span>
            </button>
          ))}
        </div>
      </div>
      {rows.length ? (
        <div className="pt-list p">
          {rows.slice(0, limit).map(({ row, journey, isNew }) => {
            const canResend = row.status === "invited" || row.status === "not_invited";
            return (
              <div key={row.person.id} className="pt-row pt-prow">
                <div className="pt-who">
                  <Avatar name={`${row.person.given} ${row.person.family}`} size={32} />
                  <span style={{ minWidth: 0 }}>
                    <span className="pt-name">{row.person.given} {row.person.family}{isNew ? <span className="pt-new">New</span> : null}</span>
                    <span className="pt-sub">{row.programme.clientName}, {row.person.email}</span>
                  </span>
                </div>
                <div className="pt-journey">
                  <Pill tone={JOURNEY_TONE[journey]} icon={null}>{JOURNEY_LABEL[journey]}</Pill>
                  <span className="pt-sub">{journey === "booked" && row.booking.date ? `Appointment ${fmtDate(row.booking.date)} at ${row.booking.time}` : journey === "released" && row.report.releasedAt ? `Released ${fmtDate(row.report.releasedAt)}${row.report.viewedAt ? ", viewed" : ", not viewed yet"}` : row.statusDetail}</span>
                </div>
                <div className="pt-act">
                  {canResend ? <Button size="sm" icon="send" onClick={() => dispatch(portalAct.resendInvitation(row.person.id))}>Resend invite <DemoTag /></Button> : null}
                  <Button size="sm" variant="primary" icon="arrow" onClick={() => nav.openPortal(row.person.id)}>Open as participant</Button>
                </div>
              </div>
            );
          })}
        </div>
      ) : <div className="pt-empty">Nobody matches. Try another search or status.</div>}
      {rows.length > limit ? (
        <div className="pt-more"><Button size="sm" variant="ghost" icon="chevronDown" onClick={() => setLimit(limit + PAGE * 2)}>Show more ({(rows.length - limit).toLocaleString("en-IE")} more)</Button></div>
      ) : null}
    </Card>
  );
}

/* ---------------------------------------------------------------- nurse portal */

function NurseSection({ onNew }: { onNew: () => void }) {
  const state = usePhState();
  const nav = useNav();
  const rows = nursePortalRows(state);
  const open = (id: string | null) => { requestNursePortalNurse(id as never); nav.openNursePortal?.(); };
  return (
    <Card>
      <SectionHead id="nurses" icon="heart" title="Nurse portal" count={rows.length} sub="The tablet app nurses use on the day: check in, the nurse form, specimens and clinic close."
        actions={<><Button size="sm" icon="eye" onClick={() => open(null)}>Open preview</Button><Button size="sm" variant="primary" icon="plus" onClick={onNew}>Add nurse</Button></>} />
      <div className="pt-list n">
        {rows.map((r) => (
          <div key={r.id} className="pt-row pt-nrow">
            <div className="pt-who">
              <Avatar name={r.name} tint={r.tint} size={32} />
              <span style={{ minWidth: 0 }}>
                <span className="pt-name">{r.name}{r.added ? <span className="pt-new">New</span> : null}</span>
                <span className="pt-sub">{r.title}{r.phone ? `, ${r.phone}` : ""}</span>
              </span>
            </div>
            <div className="pt-days">
              {r.days.length ? <>
                {r.days.slice(0, 3).map((d) => <span key={d.date + d.label} className={"pt-day " + d.kind}>{d.label}</span>)}
                {r.days.length > 3 ? <span className="pt-sub">and {r.days.length - 3} more</span> : null}
              </> : <span className="pt-sub">No clinics booked yet. Add them on a screening day, flu clinic or in the Calendar.</span>}
            </div>
            <div className="pt-act">
              <Button size="sm" icon="calendar" onClick={() => nav.go({ page: "Calendar", tab: "all", params: { people: r.id, view: "agenda" } })}>Calendar</Button>
              <Button size="sm" variant="primary" icon="arrow" onClick={() => open(r.id)}>Open as nurse</Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ---------------------------------------------------------------- dialogs */

function NewClientDialog({ onClose }: { onClose: () => void }) {
  const state = usePhState();
  const taken = new Set(clientPortalRows(state).map((r) => r.company.toLowerCase()));
  const known = Array.from(new Set([...state.sales.leads.map((l) => l.company), ...state.occHealth.clients.map((c) => c.name)])).filter((n) => !taken.has(n.toLowerCase())).sort();
  const [company, setCompany] = useState("");
  const [programme, setProgramme] = useState("Health Screening 2027");
  const [hrName, setHrName] = useState("");
  const [hrEmail, setHrEmail] = useState("");
  const [live, setLive] = useState(true);
  const pickCompany = (v: string) => {
    setCompany(v);
    const lead = state.sales.leads.find((l) => l.company === v);
    const oh = state.occHealth.clients.find((c) => c.name === v);
    if (lead) { setHrName(lead.contact.name); setHrEmail(lead.contact.email); } else if (oh) { setHrName(oh.form.contactName); setHrEmail(oh.form.contactEmail); }
  };
  const save = () => { const r = dispatch(portalsAct.createClient(company, programme, hrName, hrEmail, live)); if (r.ok) onClose(); };
  return (
    <Modal open onClose={onClose} title="New client portal" width={540}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" icon="check" onClick={save}>Create portal</Button></>}>
      <div className="pt-form">
        <Field label="Company" help="Pick a lead or client, or type a new company name.">
          <TextInput list="pt-companies" value={company} onChange={(e) => pickCompany(e.target.value)} placeholder="Company name" autoFocus />
          <datalist id="pt-companies">{known.map((n) => <option key={n} value={n} />)}</datalist>
        </Field>
        <Field label="Programme"><TextInput value={programme} onChange={(e) => setProgramme(e.target.value)} placeholder="Spring Screening 2027" /></Field>
        <div className="pt-two">
          <Field label="HR contact name"><TextInput value={hrName} onChange={(e) => setHrName(e.target.value)} placeholder="Name" /></Field>
          <Field label="HR contact email"><TextInput type="email" value={hrEmail} onChange={(e) => setHrEmail(e.target.value)} placeholder="name@company.ie" /></Field>
        </div>
        <label className="pt-switch"><span>Put it live now<span className="pt-sub">Off keeps it as a draft until you are ready.</span></span><Switch on={live} onChange={setLive} label="Put it live now" /></label>
        <div className="pt-note"><Icon name="link" size={14} /><span>An invite code like <b>DEMO-IBM-26</b> and a booking link are made for you. Sending the welcome email is simulated.</span></div>
      </div>
    </Modal>
  );
}

function InviteDialog({ onClose }: { onClose: () => void }) {
  const [given, setGiven] = useState("");
  const [family, setFamily] = useState("");
  const [email, setEmail] = useState("");
  const [dob, setDob] = useState("");
  const [programmeId, setProgrammeId] = useState<ProgrammeId>("PRG-IBM-26");
  const save = () => { const r = dispatch(portalsAct.inviteParticipant(given, family, email, dob, programmeId)); if (r.ok) onClose(); };
  return (
    <Modal open onClose={onClose} title="Invite a participant" width={520}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" icon="send" onClick={save}>Send invite <DemoTag /></Button></>}>
      <div className="pt-form">
        <div className="pt-two">
          <Field label="First name"><TextInput value={given} onChange={(e) => setGiven(e.target.value)} autoFocus /></Field>
          <Field label="Last name"><TextInput value={family} onChange={(e) => setFamily(e.target.value)} /></Field>
        </div>
        <Field label="Email"><TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.ie" /></Field>
        <div className="pt-two">
          <Field label="Date of birth" help="Used to match lab results."><TextInput type="date" value={dob} onChange={(e) => setDob(e.target.value)} /></Field>
          <Field label="Programme">
            <Select value={programmeId} onChange={(e) => setProgrammeId(e.target.value as ProgrammeId)} aria-label="Programme">
              {PROGRAMMES.map((x) => <option key={x.id} value={x.id}>{x.clientName}: {x.name}</option>)}
            </Select>
          </Field>
        </div>
        <div className="pt-note"><Icon name="mail" size={14} /><span>They get the programme's invite code by email and appear in the list straight away. Nothing is really sent.</span></div>
      </div>
    </Modal>
  );
}

function NurseDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const save = () => { const r = dispatch(portalsAct.addNurse(name, phone)); if (r.ok) onClose(); };
  return (
    <Modal open onClose={onClose} title="Add a nurse" width={460}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" icon="check" onClick={save}>Add to nursing team</Button></>}>
      <div className="pt-form">
        <Field label="Name"><TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="First and last name" autoFocus /></Field>
        <Field label="Mobile" help="The nurse portal sign-in link goes here by text (simulated)."><TextInput type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="087 123 4567" /></Field>
        <div className="pt-note"><Icon name="heart" size={14} /><span>They join the nursing team and can be put on screening days, flu clinics and occupational health sessions.</span></div>
      </div>
    </Modal>
  );
}
