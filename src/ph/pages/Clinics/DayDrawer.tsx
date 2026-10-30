/* One screening day: the obvious next step, the day drawn to scale, plain English changes with a
   before and after, the client's HR reply read by the agent, and the history of who changed what. */
import { useEffect, useState } from "react";
import {
  DAY_SCREEN_LABEL, EDIT_EXAMPLES, PROGRAMME_BY_ID, activeBookings, breakText, dayErrors, editFromInstruction, fmtDateLong, fmtDateTime, fmtHm,
  formOf, publishBlockers, readHrReply, sampleHrReply, today,
} from "../../model";
import type { AgentEdit, DayChange, DayField, DayForm, HrRead, Persona, ScreeningDay } from "../../model";
import { dispatch, usePersona, usePhState } from "../../store";
import { useNav } from "../../nav-context";
import { Button, DemoTag, Drawer, Icon, Pill, Textarea, TextInput } from "../../ui";
import { clientContact, requestClientPortalProgramme } from "../ClientPortal/data";
import { daysAct } from "./daysActions";
import { DayEditor, DayStrip } from "./DayParts";
import type { Sources } from "./DayParts";

export const canManageDays = (p: Persona) => !p.isParticipant && (p.perms.has("bookings.manage") || p.role === "clinical_review");

export function DiffTable({ changes }: { changes: DayChange[] }) {
  return (
    <table className="sd-diff">
      <thead><tr><th>What</th><th>Before</th><th>After</th></tr></thead>
      <tbody>
        {changes.map((c) => <tr key={c.field + c.label}><td>{c.label}</td><td className="was">{c.from}</td><td className="now">{c.to}</td></tr>)}
      </tbody>
    </table>
  );
}

export function DayDrawer({ day, onClose }: { day: ScreeningDay | null; onClose: () => void }) {
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [form, setForm] = useState<DayForm | null>(null);
  const [sources, setSources] = useState<Sources>({});
  const id = day?.id;
  useEffect(() => { setMode("view"); setForm(null); setSources({}); }, [id]);
  if (!day) return null;
  const client = PROGRAMME_BY_ID[day.programmeId].clientName;
  const editing = mode === "edit" && form;
  return (
    <Drawer key={day.id + mode} open={!!day} onClose={onClose} width={780}
      title={`${client}, ${fmtDateLong(day.date)}`}
      sub={<span className="ph-wrap" style={{ gap: 6 }}>{day.status === "published" ? <Pill tone="ok" icon="check">Published</Pill> : <Pill tone="warn" icon="edit">Draft</Pill>}<Pill tone={day.screen === "poc" ? "info" : "neutral"} icon={day.screen === "poc" ? "heart" : "flask"}>{DAY_SCREEN_LABEL[day.screen]}</Pill><span className="ph-faint">{day.id} · session {day.sessionId}</span></span>}
      footer={editing ? null : <ViewFooter day={day} onEdit={() => { setForm(formOf(day)); setSources({}); setMode("edit"); }} />}>
      {editing ? (
        <EditMode day={day} form={form} sources={sources}
          onChange={(f, k) => { setForm(f); setSources((s) => ({ ...s, [k]: "person" })); }}
          onDone={() => { setMode("view"); setForm(null); }} />
      ) : <ViewMode day={day} />}
    </Drawer>
  );
}

function ViewFooter({ day, onEdit }: { day: ScreeningDay; onEdit: () => void }) {
  const nav = useNav();
  const p = usePersona();
  const manage = canManageDays(p);
  const deny = manage ? "" : `${p.name} (${p.roleLabel}) cannot change screening days.`;
  const block = publishBlockers(day);
  return (
    <>
      <Button icon="calendar" onClick={() => nav.go({ page: "Clinics", tab: "schedule", params: { view: "day", date: day.date, session: day.sessionId } })}>Open in schedule</Button>
      <Button icon="edit" disabled={!manage} title={deny || "Change any field with the form"} onClick={onEdit}>Edit with the form</Button>
      {day.status === "published"
        ? <Button variant="ghost" disabled={!manage} title={deny || "Take it off the client portal"} onClick={() => dispatch(daysAct.unpublish(day.id))}>Unpublish</Button>
        : <Button variant="primary" icon="send" disabled={!manage || block.length > 0} title={deny || block[0] || "Show this day on the client portal"} onClick={() => dispatch(daysAct.publish(day.id))}>Publish to client portal</Button>}
    </>
  );
}

function NextStep({ day }: { day: ScreeningDay }) {
  const nav = useNav();
  const p = usePersona();
  const manage = canManageDays(p);
  const block = publishBlockers(day);
  const client = PROGRAMME_BY_ID[day.programmeId].clientName;
  const openPortal = () => { requestClientPortalProgramme(day.programmeId); nav.openClientPortal?.(); };
  if (day.status === "published") {
    return (
      <div className="sd-next ok">
        <span className="sd-next-ico"><Icon name="check" size={17} stroke={2.2} /></span>
        <div className="sd-next-text"><b>Live on the {client} client portal</b>Published by {day.publishedBy} on {day.publishedAt ? fmtDateTime(day.publishedAt) : ""}. HR sees the date, time, room and screen type. Never names or results.</div>
        {nav.openClientPortal ? <Button icon="users" onClick={openPortal}>See it in the client portal</Button> : null}
      </div>
    );
  }
  if (block.length) {
    return (
      <div className="sd-next">
        <span className="sd-next-ico"><Icon name="mail" size={16} /></span>
        <div className="sd-next-text"><b>Next: confirm the room</b>Paste {client} HR's reply below (or use the sample) and the agent fills in the room and the contact on the day. Then publish.</div>
        <Button onClick={() => document.getElementById("sd-hr")?.scrollIntoView({ behavior: "smooth", block: "start" })}>Go to the HR reply</Button>
      </div>
    );
  }
  return (
    <div className="sd-next">
      <span className="sd-next-ico"><Icon name="send" size={16} /></span>
      <div className="sd-next-text"><b>Next: publish to the client portal</b>Everything is in place. Publishing shows this date and room to {client}'s HR team.</div>
      <Button variant="primary" icon="send" disabled={!manage} onClick={() => dispatch(daysAct.publish(day.id))}>Publish to client portal</Button>
    </div>
  );
}

function ViewMode({ day }: { day: ScreeningDay }) {
  const state = usePhState();
  const booked = activeBookings(state, day.sessionId).length;
  const nurse = state.staff.find((s) => s.id === day.nurseId)?.name || day.nurseId;
  return (
    <div className="sd-d">
      <NextStep day={day} />
      <section className="sd-sec" aria-labelledby="sd-day-h">
        <h3 id="sd-day-h"><Icon name="clock" size={15} />The day</h3>
        <DayStrip form={day} booked={booked} />
        <dl className="sd-kv">
          <div><dt>Time</dt><dd>{fmtHm(day.start)} to {fmtHm(day.end)}</dd></div>
          <div><dt>Nurse</dt><dd>{nurse}</dd></div>
          <div><dt>Appointments</dt><dd>{booked} of {day.appointments} booked, {day.slotMinutes} min each</dd></div>
          <div><dt>First break</dt><dd>{breakText(day.breaks.first)}</dd></div>
          <div><dt>Lunch</dt><dd>{breakText(day.breaks.lunch)}</dd></div>
          <div><dt>Afternoon break</dt><dd>{breakText(day.breaks.afternoon)}</dd></div>
          <div><dt>Room and location</dt><dd>{day.room || <span style={{ color: "var(--warn)" }}>To be confirmed</span>}</dd></div>
          <div><dt>Parking</dt><dd>{day.parking || "None given"}</dd></div>
          <div><dt>Contact on the day</dt><dd>{day.contactName ? `${day.contactName}${day.contactPhone ? `, ${day.contactPhone}` : ""}` : "Not yet"}</dd></div>
          <div style={{ gridColumn: "1 / -1" }}><dt>Logistics notes</dt><dd>{day.notes || "None"}</dd></div>
        </dl>
      </section>
      <ChangeInWords day={day} />
      <HrReply day={day} />
      <History day={day} />
    </div>
  );
}

function ChangeInWords({ day }: { day: ScreeningDay }) {
  const state = usePhState();
  const p = usePersona();
  const manage = canManageDays(p);
  const [text, setText] = useState("");
  const [res, setRes] = useState<(AgentEdit & { asked: string }) | null>(null);
  useEffect(() => { setText(""); setRes(null); }, [day.id]);
  const ask = (q: string) => {
    if (!q.trim()) return;
    setText(q);
    setRes({ ...editFromInstruction(q, formOf(day), { today: today(state), staff: state.staff, sessions: state.sessions, days: state.screeningDays.days, ownSessionId: day.sessionId }), asked: q });
  };
  const errs = res && res.understood ? dayErrors(res.form, { today: today(state), sessions: state.sessions, ownSessionId: day.sessionId, staff: state.staff }) : {};
  const firstErr = Object.values(errs)[0];
  const confirm = () => {
    if (!res) return;
    const r = dispatch(daysAct.save(res.form, "agent", day.id));
    if (r.ok) { setRes(null); setText(""); }
  };
  return (
    <section className="sd-sec" aria-labelledby="sd-words-h">
      <h3 id="sd-words-h"><Icon name="spark" size={15} />Change it in plain English</h3>
      <p>Tell the agent what to change. It shows the before and after, and nothing changes until you confirm.</p>
      <div className="sd-inline">
        <TextInput aria-label="What should change?" value={text} placeholder="For example: move lunch to 1pm" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") ask(text); }} />
        <Button variant="primary" icon="spark" disabled={!text.trim()} onClick={() => ask(text)}>Suggest the change</Button>
      </div>
      <div className="sd-chips">{EDIT_EXAMPLES.map((x) => <button key={x} type="button" className="sd-try alt" onClick={() => ask(x)}>{x}</button>)}</div>
      {res ? (
        res.understood ? (
          <div style={{ marginTop: 12 }}>
            <div className="ph-eyebrow">The agent suggests</div>
            <DiffTable changes={res.changes} />
            {res.notes.length ? <ul className="sd-notes" style={{ marginTop: 10 }}>{res.notes.map((n) => <li key={n}><Icon name="spark" size={13} />{n}</li>)}</ul> : null}
            {firstErr ? <div className="ph-err" role="alert" style={{ marginTop: 8 }}>{firstErr}</div> : null}
            <div className="sd-actions" style={{ marginTop: 12 }}>
              <Button variant="primary" icon="check" disabled={!manage || !!firstErr} title={firstErr || ""} onClick={confirm}>Confirm change</Button>
              <Button variant="ghost" onClick={() => setRes(null)}>Discard</Button>
            </div>
          </div>
        ) : (
          <ul className="sd-notes" style={{ marginTop: 12 }}>
            <li><Icon name="info" size={13} />{res.notes[0] || `I could not find a change in "${res.asked}". Try something like "move lunch to 1pm", "finish at 5" or "room 3.01".`}</li>
          </ul>
        )
      ) : null}
    </section>
  );
}

function HrReply({ day }: { day: ScreeningDay }) {
  const state = usePhState();
  const p = usePersona();
  const manage = canManageDays(p);
  const [text, setText] = useState("");
  const [res, setRes] = useState<HrRead | null>(null);
  useEffect(() => { setText(""); setRes(null); }, [day.id]);
  const hr = clientContact(day.programmeId);
  const client = PROGRAMME_BY_ID[day.programmeId].clientName;
  const read = (q: string) => { if (q.trim()) setRes(readHrReply(q, formOf(day), { today: today(state), staff: state.staff })); };
  const errs = res && res.changes.length ? dayErrors(res.form, { today: today(state), sessions: state.sessions, ownSessionId: day.sessionId, staff: state.staff }) : {};
  const firstErr = Object.values(errs)[0];
  const confirm = () => {
    if (!res) return;
    const r = dispatch(daysAct.save(res.form, "hr_email", day.id));
    if (r.ok) { setRes(null); setText(""); }
  };
  return (
    <section className="sd-sec" id="sd-hr" aria-labelledby="sd-hr-h" style={{ scrollMarginTop: 10 }}>
      <h3 id="sd-hr-h"><Icon name="mail" size={15} />Reply from {client} HR</h3>
      <p>Paste the email from {hr ? `${hr.name}, ` : ""}{client}'s HR contact. The agent picks out the date, room and contact on the day for you to confirm.</p>
      <Textarea className="sd-mail" aria-label="Paste the HR email" value={text} placeholder="Paste the email here" onChange={(e) => { setText(e.target.value); setRes(null); }} />
      <div className="sd-actions" style={{ marginTop: 8 }}>
        <Button icon="mail" onClick={() => { const s = sampleHrReply(day, hr?.name || `${client} HR`); setText(s); setRes(null); }}>Use sample HR reply</Button>
        <Button variant="primary" icon="spark" disabled={!text.trim()} onClick={() => read(text)}>Read the email</Button>
        <DemoTag>Simulated</DemoTag>
      </div>
      {res ? (
        <div style={{ marginTop: 12 }}>
          {res.found.length ? (
            <>
              <div className="ph-eyebrow">What the agent found</div>
              <ul className="sd-found">{res.found.map((f) => <li key={f.label}><Icon name="check" size={13} stroke={2} /><span><b style={{ color: "var(--ink)" }}>{f.label}:</b> {f.value} {f.said !== f.value ? <q>{f.said}</q> : null}</span></li>)}</ul>
            </>
          ) : null}
          {res.notes.length ? <ul className="sd-notes" style={{ marginTop: 10 }}>{res.notes.map((n) => <li key={n}><Icon name="info" size={13} />{n}</li>)}</ul> : null}
          {res.changes.length ? (
            <>
              <DiffTable changes={res.changes} />
              {firstErr ? <div className="ph-err" role="alert" style={{ marginTop: 8 }}>{firstErr}</div> : null}
              <div className="sd-actions" style={{ marginTop: 12 }}>
                <Button variant="primary" icon="check" disabled={!manage || !!firstErr} onClick={confirm}>Confirm and update the day</Button>
                <Button variant="ghost" onClick={() => setRes(null)}>Discard</Button>
              </div>
            </>
          ) : res.found.length ? <div className="sd-fit-ok" style={{ marginTop: 10 }}><Icon name="check" size={13} />The day already matches the email. Nothing to change.</div> : null}
        </div>
      ) : null}
    </section>
  );
}

function History({ day }: { day: ScreeningDay }) {
  const items = day.history.slice().reverse();
  const via: Record<string, string> = { agent: "via the agent", form: "with the form", hr_email: "from the HR email" };
  return (
    <section className="sd-sec" aria-labelledby="sd-hist-h">
      <h3 id="sd-hist-h"><Icon name="list" size={15} />History</h3>
      <p>Who changed what, and when. Kept for every day.</p>
      <ul className="sd-hist">
        {items.map((h, i) => (
          <li key={h.at + i}>
            <span className="sd-hist-dot" aria-hidden="true" />
            <div style={{ minWidth: 0 }}>
              <div style={{ color: "var(--ink)" }}>{h.summary}</div>
              <div className="sd-hist-meta">{h.by}, {fmtDateTime(h.at)}{h.via && h.kind !== "created" ? `, ${via[h.via]}` : ""}</div>
              {h.changes.length && h.kind !== "published" && h.kind !== "unpublished" ? <ul>{h.changes.map((c) => <li key={c.label}>{c.label}: {c.from} to {c.to}</li>)}</ul> : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function EditMode({ day, form, sources, onChange, onDone }: { day: ScreeningDay; form: DayForm; sources: Sources; onChange: (f: DayForm, k: DayField) => void; onDone: () => void }) {
  const state = usePhState();
  const p = usePersona();
  const manage = canManageDays(p);
  const booked = activeBookings(state, day.sessionId).length;
  const errs = dayErrors(form, { today: today(state), sessions: state.sessions, ownSessionId: day.sessionId, staff: state.staff });
  const save = () => { const r = dispatch(daysAct.save(form, "form", day.id)); if (r.ok) onDone(); };
  return (
    <div className="sd" style={{ gap: 12 }}>
      <div className="ph-dim" style={{ fontSize: 12.5 }}>Change any field. The summary updates as you type; nothing is saved until you press Save changes.</div>
      <DayEditor idPrefix="sd-edit" form={form} onChange={onChange} sources={sources} ownSessionId={day.sessionId} booked={booked}
        actions={(
          <>
            <Button variant="primary" icon="check" disabled={!manage || Object.keys(errs).length > 0} onClick={save}>Save changes</Button>
            <Button variant="ghost" onClick={onDone}>Cancel</Button>
          </>
        )} />
    </div>
  );
}
