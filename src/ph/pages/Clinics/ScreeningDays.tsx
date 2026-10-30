/* Screening days: set up a client's screening day in a sentence. The agent reads the request and
   fills the form, showing what it read, what it assumed and what still needs a person. A person
   checks and saves; that creates the clinic session. Publishing puts the day on the client portal.
   Below, every screening day with its status, and a drawer per day for plain English edits, the
   client's HR reply and the history. */
import { forwardRef, useEffect, useRef, useState } from "react";
import {
  DAY_SCREEN_SHORT, EXAMPLE_REQUEST, PROGRAMME_BY_ID, SHORT_REQUEST, activeBookings, draftFromRequest, fmtHm, fmtWeekdayDate, standardDay, today,
} from "../../model";
import type { AgentDraft, DayField, DayForm, ScreeningDay } from "../../model";
import { dispatch, usePersona, usePhState } from "../../store";
import { useNav } from "../../nav-context";
import { Button, Chip, DemoTag, EmptyState, Icon, PageHeader, Pill } from "../../ui";
import "./days.css";
import "./daysActions";
import { daysAct } from "./daysActions";
import { DayEditor, useDayCheck } from "./DayParts";
import type { Sources } from "./DayParts";
import { DayDrawer, canManageDays } from "./DayDrawer";

interface Draft { form: DayForm; sources: Sources; why: AgentDraft["why"]; notes: string[]; via: "agent" | "form"; request: string }
type Filter = "all" | "draft" | "published";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function ScreeningDays() {
  const state = usePhState();
  const nav = useNav();
  const p = usePersona();
  const [text, setText] = useState("");
  const [working, setWorking] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const draftRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | null>(null);
  const t = today(state);
  const manage = canManageDays(p);
  const days = state.screeningDays.days;
  const selected = days.find((d) => d.id === nav.params.day) || null;

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);
  /* Asked from the Pulse button: #/Clinics/days?ask=IBM, 6 November builds the draft straight away. */
  useEffect(() => { if (nav.params.ask && manage) { build(nav.params.ask); nav.setParams({ ...nav.params, ask: "" }); } }, [nav.params.ask]); // eslint-disable-line react-hooks/exhaustive-deps
  /* From onboarding or the Clients journey: #/Clinics/days?text=... fills the box for a person to finish. */
  useEffect(() => { if (nav.params.text) { setText(nav.params.text); nav.setParams({ ...nav.params, text: "" }); } }, [nav.params.text]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (draft) draftRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [draft?.request, draft?.via]); // eslint-disable-line react-hooks/exhaustive-deps

  const build = (request: string) => {
    const q = request.trim();
    if (!q) return;
    setText(q);
    setWorking(true);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const d = draftFromRequest(q, { today: t, staff: state.staff, sessions: state.sessions, days });
      setDraft({ form: d.form, sources: d.source, why: d.why, notes: d.notes, via: "agent", request: q });
      setWorking(false);
    }, 650);
  };
  const manual = () => {
    const f = standardDay("");
    setDraft({ form: f, sources: {}, why: {}, notes: [], via: "form", request: "manual " + Date.now() });
  };
  const change = (f: DayForm, field: DayField) => setDraft((d) => (d ? { ...d, form: f, sources: { ...d.sources, [field]: "person" } } : d));
  const save = () => {
    if (!draft) return;
    const r = dispatch(daysAct.save(draft.form, draft.via));
    if (r.ok && r.id) { setDraft(null); setText(""); nav.setParams({ day: r.id }); }
  };

  const sorted = days.slice().sort((a, b) => {
    const pa = a.date < t ? 1 : 0, pb = b.date < t ? 1 : 0;
    if (pa !== pb) return pa - pb;
    return (pa ? -1 : 1) * (a.date === b.date ? (a.start < b.start ? -1 : 1) : a.date < b.date ? -1 : 1);
  });
  const shown = sorted.filter((d) => filter === "all" || d.status === filter);
  const count = (f: Filter) => days.filter((d) => f === "all" || d.status === f).length;

  return (
    <div className="ph-page">
      <div className="sd">
        <PageHeader title="Screening days" sub="Describe the day in a sentence. The agent fills in the form, you check it and save. Publish it and the client's HR team sees it in their portal."
          actions={<Button size="sm" icon="calendar" onClick={() => nav.go({ page: "Calendar", tab: "all", params: { view: "month", date: (sorted.find((d) => d.date >= t) || sorted[0])?.date || t, types: "clinics" } })}>Open in Calendar</Button>} />

        <section className="sd-hero" aria-labelledby="sd-ask-title">
          <div className="sd-hero-top">
            <span className="sd-agent-ico"><Icon name="spark" size={22} /></span>
            <div style={{ minWidth: 0 }}>
              <h2 id="sd-ask-title">Tell the agent about the day</h2>
              <p>Client, date, lab bloods or point of care, nurse, times and breaks, appointments, room and anything the nurse should bring. Leave out what you don't know: it fills sensible defaults and tells you what still needs a person.</p>
            </div>
          </div>
          <div className="sd-ask">
            <textarea aria-label="Describe the screening day" value={text} placeholder={`For example: ${EXAMPLE_REQUEST}`}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); build(text); } }} />
            <div className="sd-ask-row">
              <button type="button" className="sd-try" onClick={() => build(EXAMPLE_REQUEST)}><Icon name="spark" size={13} />Try the example</button>
              <button type="button" className="sd-try alt" onClick={() => build(SHORT_REQUEST)}>Try a short one: "{SHORT_REQUEST}"</button>
              <span className="ph-grow" />
              {working ? <span className="sd-working" role="status"><span className="sd-dots"><i /><i /><i /></span>Reading your request</span> : null}
              <Button variant="ghost" icon="edit" onClick={manual}>Fill in the form myself</Button>
              <Button variant="primary" icon="spark" className="sd-big" disabled={!text.trim() || working} onClick={() => build(text)}>Build the day</Button>
            </div>
          </div>
          <div className="sd-steps" aria-label="How it works">
            {[["Describe", "Type the day in your own words."], ["Check", "The agent fills the form. Fix anything it got wrong."], ["Save", "It goes on the Clinics schedule with every slot and break."], ["Publish", "The client's HR team sees the date and room."]].map(([a, b], i) => (
              <div key={a} className="sd-step"><span className="sd-step-n">{i + 1}</span><span><b>{a}</b>{b}</span></div>
            ))}
          </div>
        </section>

        {draft ? <DraftCard ref={draftRef} draft={draft} onChange={change} onSave={save} onCancel={() => setDraft(null)} manage={manage} denyText={`${p.name} (${p.roleLabel}) cannot set up screening days. Switch to Stephen, Liz, Brenda or Dr Neil Reddy.`} /> : null}

        <div className="sd-list-head">
          <h2 className="ph-grow">Screening days</h2>
          <div className="ph-wrap" style={{ gap: 6 }}>
            <Chip on={filter === "all"} onClick={() => setFilter("all")} count={count("all")}>All</Chip>
            <Chip on={filter === "draft"} onClick={() => setFilter("draft")} count={count("draft")}>Drafts</Chip>
            <Chip on={filter === "published"} onClick={() => setFilter("published")} count={count("published")}>Published</Chip>
          </div>
        </div>
        {shown.length ? (
          <div className="sd-list">
            {shown.map((d) => <DayRow key={d.id} d={d} past={d.date < t} current={selected?.id === d.id} onOpen={() => nav.setParams({ day: d.id })} />)}
          </div>
        ) : <EmptyState title={filter === "all" ? "No screening days yet" : `No ${filter === "draft" ? "drafts" : "published days"}`} icon="calendar">Describe a day to the agent above to set one up.</EmptyState>}
      </div>
      <DayDrawer day={selected} onClose={() => nav.setParams({})} />
    </div>
  );
}

function DayRow({ d, past, current, onOpen }: { d: ScreeningDay; past: boolean; current: boolean; onOpen: () => void }) {
  const state = usePhState();
  const booked = activeBookings(state, d.sessionId).length;
  const nurse = state.staff.find((s) => s.id === d.nurseId)?.name || d.nurseId;
  const [y, m, dd] = d.date.split("-").map(Number);
  const wd = WD[new Date(Date.UTC(y, m - 1, dd)).getUTCDay()];
  const room = d.room.trim();
  return (
    <button type="button" className={"sd-row" + (past ? " past" : "")} aria-current={current} onClick={onOpen} aria-label={`${PROGRAMME_BY_ID[d.programmeId].clientName}, ${wd} ${dd} ${MONTHS[m - 1]}, ${d.status}. Open`}>
      <span className="sd-cal" aria-hidden="true"><small>{wd}</small><b>{dd}</b><small>{MONTHS[m - 1]}</small></span>
      <span className="sd-row-main">
        <span className="sd-row-title">
          {PROGRAMME_BY_ID[d.programmeId].clientName}
          <Pill tone={d.screen === "poc" ? "info" : "neutral"} icon={d.screen === "poc" ? "heart" : "flask"}>{DAY_SCREEN_SHORT[d.screen]}</Pill>
        </span>
        <span className="sd-row-sub">{fmtHm(d.start)} to {fmtHm(d.end)} · {room || <span style={{ color: "var(--warn)" }}>Room to be confirmed</span>}</span>
        <span className="sd-mini">{nurse} · {booked} of {d.appointments} booked</span>
      </span>
      <span className="sd-row-cell"><small>Nurse</small><b>{nurse}</b></span>
      <span className="sd-row-cell">
        <small>Booked</small><b>{booked} of {d.appointments}</b>
        <span className="sd-bar" aria-hidden="true"><i style={{ width: `${d.appointments ? Math.min(100, (booked / d.appointments) * 100) : 0}%` }} /></span>
      </span>
      <span className="sd-row-end">
        {d.status === "published" ? <Pill tone="ok" icon="check">Published</Pill> : <Pill tone="warn" icon="edit">Draft</Pill>}
        <Icon name="chevronRight" size={16} style={{ color: "var(--faint)" }} />
      </span>
    </button>
  );
}

const DraftCard = forwardRef<HTMLDivElement, { draft: Draft; onChange: (f: DayForm, k: DayField) => void; onSave: () => void; onCancel: () => void; manage: boolean; denyText: string }>(
  function DraftCard({ draft, onChange, onSave, onCancel, manage, denyText }, ref) {
    const errs = useDayCheck(draft.form, null);
    const blocking = Object.keys(errs).length;
    const counts = { said: 0, assumed: 0, needed: 0 };
    Object.values(draft.sources).forEach((s) => { if (s === "said" || s === "assumed" || s === "needed") counts[s]++; });
    const agent = draft.via === "agent";
    return (
      <section className="sd-draft" ref={ref} aria-label={agent ? "The agent's draft" : "New screening day"}>
        <div className="sd-draft-head">
          <div className="ph-grow" style={{ minWidth: 220 }}>
            <div className="ph-eyebrow" style={{ marginBottom: 4 }}>{agent ? "Agent's draft. Check it, then save" : "New screening day"}</div>
            <h3>{draft.form.programmeId ? PROGRAMME_BY_ID[draft.form.programmeId].clientName : "New day"}{draft.form.date ? `, ${fmtWeekdayDate(draft.form.date)}` : ""}</h3>
            {agent ? <div className="ph-dim" style={{ fontSize: 12.5, marginTop: 4, lineHeight: 1.45 }}>From: "{draft.request}"</div> : null}
          </div>
          {agent ? (
            <div className="sd-legend">
              <Pill tone="ok" icon="check">{counts.said} from your words</Pill>
              {counts.assumed ? <Pill tone="info" icon="spark">{counts.assumed} assumed</Pill> : null}
              {counts.needed ? <Pill tone="warn" icon="alert">{counts.needed} need{counts.needed === 1 ? "s" : ""} a person</Pill> : null}
            </div>
          ) : null}
        </div>
        <DayEditor idPrefix="sd-new" form={draft.form} onChange={onChange} sources={draft.sources} why={draft.why} notes={draft.notes}
          footer={!manage ? <div className="ph-err">{denyText}</div> : null}
          actions={(
            <>
              <Button variant="primary" icon="check" disabled={!manage || blocking > 0} title={blocking ? "Fix the items above first" : "Save as a draft day on the Clinics schedule"} onClick={onSave}>Save the day</Button>
              <Button variant="ghost" onClick={onCancel}>Discard</Button>
            </>
          )} />
        <div className="ph-faint" style={{ fontSize: 11.5, marginTop: 12 }}>Nothing is saved until you press Save. Saving adds the day to the Clinics schedule as a draft; the client sees it only after you publish. <DemoTag>Simulated agent</DemoTag></div>
      </section>
    );
  },
);
