/* Results, Follow-up: clinician-assigned contact tasks with owner, due time, status, contact
   attempts, outcome and escalation history. Recording an attempt keeps the item open; only a
   documented outcome with an authorised acknowledgement closes it. A delivered message or a
   viewed report is read-only context and can never close it. Workflow demonstration only,
   not a validated escalation protocol. Deep link: #/Results/follow-up?followup=FU-0001 */
import { useState } from "react";
import {
  FOLLOW_UP_OUTCOMES, HOLD_LABEL, act, currentReleased, fmtAge, fmtDateTime, fmtShortDateTime, fmtWhen, followUpList, persona, staffName, taskViews,
} from "../../model";
import type { FollowUpView } from "../../model";
import { dispatch, usePhState } from "../../store";
import { useNav } from "../../nav-context";
import {
  Button, Card, CardHeader, Checkbox, Chip, DataTable, DemoTag, EmptyState, EntityLink, Field, Icon, Kpi, KpiStrip, PageHeader, Pill, RestrictedNotice, Select,
  Split, Textarea,
} from "../../ui";
import type { Column } from "../../ui";
import { Banner, Count, EventList, Kv, ReportStatePill, SecTitle, useWidth } from "./shared";
import { eventsFor, followUpKindLabel } from "./select";

type Channel = "phone" | "sms" | "email";
type AttemptResult = "no_answer" | "voicemail" | "spoke" | "wrong_number";
const CHANNEL_LABEL: Record<Channel, string> = { phone: "Phone call", sms: "SMS (simulated, not sent)", email: "Email (simulated, not sent)" };
const RESULT_LABEL: Record<AttemptResult, string> = { no_answer: "No answer", voicemail: "Voicemail left", spoke: "Spoke with the participant", wrong_number: "Wrong number" };
const outcomeLabel = (code: string) => FOLLOW_UP_OUTCOMES.find((o) => o.code === code)?.label || code;

function StatusPill({ v }: { v: FollowUpView }) {
  if (v.followUp.status === "closed") return <Pill tone="ok" icon="check">Closed with outcome</Pill>;
  return v.overdue ? <Pill tone="bad" icon="clock">Overdue</Pill> : <Pill tone="warn" icon="clock">Open</Pill>;
}
function dueText(v: FollowUpView, now: string) {
  const when = fmtWhen(v.followUp.dueAt, now);
  if (v.followUp.status === "closed") return when;
  return v.overdue ? `${when}, overdue by ${fmtAge(-v.dueInHours)}` : `${when}, in ${fmtAge(v.dueInHours)}`;
}

export default function FollowUp() {
  const state = usePhState();
  const p = persona(state);
  if (!p.perms.has("followup.view")) return <FollowUpMinimal />;
  return <FollowUpWorkspace />;
}

/* Operations and reporting roles see only that a clinical action is assigned. */
function FollowUpMinimal() {
  const state = usePhState();
  const p = persona(state);
  const list = followUpList(state);
  const cols: Column<FollowUpView>[] = [
    { key: "id", header: "Item", cell: (v) => <span className="phr-mono">{v.followUp.id}</span> },
    { key: "what", header: "What", cell: (v) => v.followUp.status === "open" ? "Clinical action assigned" : "Clinical action complete" },
    { key: "owner", header: "Owner", cell: (v) => staffName(state, v.followUp.ownerId) },
    { key: "due", header: "Due", cell: (v) => fmtWhen(v.followUp.dueAt, state.clock.nowUtc) },
    { key: "st", header: "Status", cell: (v) => v.followUp.status === "open" ? <Pill tone="neutral" icon="clock">Assigned</Pill> : <Pill tone="ok" icon="check">Complete</Pill> },
  ];
  return (
    <div className="ph-page phr">
      <PageHeader title="Follow-up" sub="Clinician-owned contact tasks." />
      <RestrictedNotice title="Clinical follow-up is clinician-owned">
        {p.name} ({p.roleLabel}) sees only that a clinical action is assigned, who owns it and when it is due. Participant details, the reason and contact attempts are visible to clinical roles.
      </RestrictedNotice>
      <div style={{ marginTop: 14 }}>
        <Card pad={false}>
          <DataTable rows={list} columns={cols} rowKey={(v) => v.followUp.id} empty={<EmptyState title="No clinical actions" />} />
        </Card>
      </div>
    </div>
  );
}

function FollowUpWorkspace() {
  const state = usePhState();
  const nav = useNav();
  const [ref, w] = useWidth();
  const list = followUpList(state);
  const paramId = nav.params.followup && list.some((f) => f.followUp.id === nav.params.followup) ? nav.params.followup : null;
  const paramClosed = !!paramId && list.find((f) => f.followUp.id === paramId)!.followUp.status === "closed";
  const [status, setStatus] = useState<"open" | "closed" | "all">(paramClosed ? "all" : "open");
  const rows = list.filter((f) => status === "all" || f.followUp.status === status);
  const selectedId = paramId || rows[0]?.followUp.id || list[0]?.followUp.id || null;
  const sel = list.find((f) => f.followUp.id === selectedId) || null;
  const open = list.filter((f) => f.followUp.status === "open");
  const narrow = w > 0 && w < 560;
  const cols: Column<FollowUpView>[] = [
    { key: "id", header: "Item", cell: (v) => <div><div className="phr-mono" style={{ color: "var(--ink)" }}>{v.followUp.id}</div><div className="phr-sub">{followUpKindLabel(v.followUp.kind)}</div></div> },
    { key: "who", header: "Participant", cell: (v) => <div><div>{v.person.given} {v.person.family}</div><div className="phr-mono ph-faint">{v.episode.id}</div></div> },
    ...(narrow ? [] : [
      { key: "due", header: "Due and owner", nowrap: false, cell: (v: FollowUpView) => <div><div style={{ color: v.overdue ? "var(--bad)" : undefined }}>{dueText(v, state.clock.nowUtc)}</div><div className="phr-sub">{staffName(state, v.followUp.ownerId)}</div></div>, sort: (a: FollowUpView, b: FollowUpView) => (a.followUp.dueAt < b.followUp.dueAt ? -1 : 1) },
      { key: "att", header: "Attempts", align: "right" as const, cell: (v: FollowUpView) => <span className="ph-num">{v.attempts}</span> },
    ]),
    { key: "st", header: "Status", cell: (v) => <StatusPill v={v} /> },
  ];

  return (
    <div className="ph-page phr">
      <PageHeader title="Follow-up"
        sub="Clinician-assigned contact tasks. Owner, due time, attempts, outcome and escalation are recorded here. Sending a report is not the same as completing a clinical contact."
        actions={<DemoTag>Workflow demonstration</DemoTag>} />
      <KpiStrip>
        <Kpi label="Open" value={<Count n={open.length} unit="items" />} sub="Need a documented outcome" icon="clock" onClick={() => setStatus("open")} hint="Show open items" />
        <Kpi label="Urgent, open" value={<Count n={open.filter((f) => f.followUp.kind === "urgent_clinical_contact").length} unit="items" />} sub="Clinician-assigned urgent contact" icon="flag" />
        <Kpi label="Overdue" value={<Count n={open.filter((f) => f.overdue).length} unit="items" />} sub={`At the demo clock, ${fmtShortDateTime(state.clock.nowUtc)}`} icon="alert" />
        <Kpi label="Closed" value={<Count n={list.length - open.length} unit="items" />} sub="Closed with outcome and acknowledgement" icon="check" onClick={() => setStatus("closed")} hint="Show closed items" />
      </KpiStrip>
      <div style={{ marginTop: 14 }}>
        <Split
          main={
            <>
              <Card pad={false}>
                <div ref={ref} style={{ padding: "14px 16px 10px" }}>
                  <CardHeader title="Follow-up items" sub="Assigned by a clinician. Never generated from a result by a rule or an agent." />
                  <div className="phr-row">
                    <Chip on={status === "open"} onClick={() => setStatus("open")} count={open.length}>Open</Chip>
                    <Chip on={status === "closed"} onClick={() => setStatus("closed")} count={list.length - open.length}>Closed</Chip>
                    <Chip on={status === "all"} onClick={() => setStatus("all")} count={list.length}>All</Chip>
                  </div>
                </div>
                <DataTable rows={rows} columns={cols} rowKey={(v) => v.followUp.id} selectedKey={selectedId}
                  onRowClick={(v) => nav.setParams({ followup: v.followUp.id })}
                  empty={<EmptyState title="Nothing here" icon="check">No follow-up items in this filter.</EmptyState>} />
              </Card>
              {sel ? <FollowUpDetail v={sel} /> : null}
            </>
          }
          side={sel ? <FollowUpContext v={sel} /> : <Card><EmptyState title="No follow-up selected" /></Card>}
        />
      </div>
    </div>
  );
}

function FollowUpDetail({ v }: { v: FollowUpView }) {
  const state = usePhState();
  const p = persona(state);
  const f = v.followUp;
  const task = taskViews(state).find((t) => t.task.id === f.taskId);
  const canAct = p.perms.has("followup.act");
  const ep = v.episode;
  const steps = [
    { label: "Contact attempt recorded", done: f.attempts.length > 0 },
    { label: "Outcome documented", done: !!f.outcome },
    { label: "Authorised acknowledgement", done: !!f.outcome },
  ];
  return (
    <Card>
      <CardHeader eyebrow={followUpKindLabel(f.kind)} title={<>{f.id}: {v.person.given} {v.person.family}</>}
        sub={`Assigned by ${staffName(state, f.assignedById)}. ${f.note}`}
        right={<><StatusPill v={v} /><DemoTag>Illustrative</DemoTag></>} />
      <Kv items={[
        { k: "Owner", v: staffName(state, f.ownerId) },
        { k: "Due", v: <span style={{ color: v.overdue ? "var(--bad)" : undefined }}>{dueText(v, state.clock.nowUtc)}</span> },
        { k: "Participant", v: <EntityLink kind="person" id={v.person.id}>{v.person.id}</EntityLink> },
        { k: "Episode", v: <span className="phr-row" style={{ gap: 6 }}><EntityLink kind="episode" id={ep.id} /><ReportStatePill state={ep.reportState} /></span> },
        { k: "Linked task", v: task ? <span className="phr-row" style={{ gap: 6 }}><EntityLink kind="task" id={task.task.id} /><span className="phr-sub">{task.statusLabel}</span></span> : f.taskId },
        { k: "Report hold", v: ep.hold && ep.hold.followUpId === f.id ? HOLD_LABEL[ep.hold.kind] : "No hold from this item" },
      ]} />

      <ol className="phr-row" style={{ listStyle: "none", padding: 0, margin: "14px 0 4px", gap: 8 }} aria-label="Steps to close">
        {steps.map((s, i) => (
          <li key={s.label} className="phr-row" style={{ gap: 6, padding: "5px 10px", borderRadius: 999, border: "1px solid var(--border)", background: s.done ? "var(--ok-soft)" : "var(--surface-faint)", fontSize: 12 }}>
            <Icon name={s.done ? "check" : "clock"} size={12} stroke={2.2} style={{ color: s.done ? "var(--ok)" : "var(--faint)" }} />
            <span style={{ color: s.done ? "var(--ok)" : "var(--body)" }}>{i + 1}. {s.label}</span>
          </li>
        ))}
      </ol>

      <div className="phr-gap" style={{ marginTop: 12, gap: 16 }}>
        <section>
          <SecTitle right={<span className="phr-sub ph-num">{f.attempts.length} recorded</span>}>Contact attempts</SecTitle>
          {f.attempts.length ? (
            <ul className="phr-tl">
              {f.attempts.slice().reverse().map((a, i) => (
                <li key={a.at + i}>
                  <div className="phr-row" style={{ gap: 6 }}>
                    <span className="phr-mono ph-faint">{fmtShortDateTime(a.at)}</span>
                    <span style={{ fontSize: 12.5, color: "var(--ink)" }}>{RESULT_LABEL[a.result]}</span>
                    <span className="phr-sub">{CHANNEL_LABEL[a.channel]}, by {staffName(state, a.by)}</span>
                  </div>
                  {a.note ? <div className="phr-note">{a.note}</div> : null}
                </li>
              ))}
            </ul>
          ) : <div className="phr-sub">No contact attempt recorded yet.</div>}
        </section>
        {f.escalations.length ? (
          <section>
            <SecTitle>Escalation history</SecTitle>
            <ul className="phr-tl">
              {f.escalations.slice().reverse().map((e, i) => (
                <li key={e.at + i}>
                  <div className="phr-row" style={{ gap: 6 }}><span className="phr-mono ph-faint">{fmtShortDateTime(e.at)}</span><span className="phr-sub">by {staffName(state, e.by)}</span></div>
                  <div className="phr-note">{e.note}</div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {f.outcome ? (
          <section>
            <SecTitle>Outcome</SecTitle>
            <Banner tone="ok" icon="check">
              <b>{outcomeLabel(f.outcome.code)}.</b> {f.outcome.note} Documented {fmtDateTime(f.outcome.at)} by {staffName(state, f.outcome.by)}, acknowledged by {staffName(state, f.outcome.acknowledgedBy)}.
            </Banner>
            {ep.reportState === "ready_for_review" ? (
              <div className="phr-sub" style={{ marginTop: 8 }}>The report hold is cleared and {ep.id} is ready for review. <EntityLink kind="episode" id={ep.id}>Open in Review</EntityLink></div>
            ) : null}
          </section>
        ) : null}
        {f.status === "open" ? (canAct ? <Actions key={f.id} v={v} /> : (
          <RestrictedNotice title="Recording attempts and outcomes is restricted">
            {p.name} ({p.roleLabel}) can view this follow-up. The clinical reviewer and the nursing lead record attempts, escalations and outcomes.
          </RestrictedNotice>
        )) : null}
      </div>
    </Card>
  );
}

function Actions({ v }: { v: FollowUpView }) {
  const f = v.followUp;
  const [channel, setChannel] = useState<Channel>("phone");
  const [result, setResult] = useState<AttemptResult>("no_answer");
  const [attNote, setAttNote] = useState("");
  const [escNote, setEscNote] = useState("");
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");
  const [ack, setAck] = useState(false);
  const missing: string[] = [];
  if (!f.attempts.length) missing.push("record at least one contact attempt");
  if (!code) missing.push("choose a documented outcome");
  if (note.trim().length < 5) missing.push("describe the outcome");
  if (!ack) missing.push("tick the authorised acknowledgement");
  return (
    <>
      <section style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
        <SecTitle right={<span className="phr-sub">Keeps the item open</span>}>Record a contact attempt</SecTitle>
        <div className="phr-compare" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
          <Field label="Channel">
            <Select value={channel} onChange={(e) => setChannel(e.target.value as Channel)}>
              {(Object.keys(CHANNEL_LABEL) as Channel[]).map((c) => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}
            </Select>
          </Field>
          <Field label="Result">
            <Select value={result} onChange={(e) => setResult(e.target.value as AttemptResult)}>
              {(Object.keys(RESULT_LABEL) as AttemptResult[]).map((r) => <option key={r} value={r}>{RESULT_LABEL[r]}</option>)}
            </Select>
          </Field>
        </div>
        <div style={{ marginTop: 8 }}>
          <Field label="Note (optional)" help="Even after speaking with the participant, the item stays open until an outcome is documented.">
            <Textarea rows={2} value={attNote} onChange={(e) => setAttNote(e.target.value)} placeholder="No clinical detail needed here; it sits in the clinical record." />
          </Field>
        </div>
        <div style={{ marginTop: 8 }}>
          <Button icon="phone" onClick={() => { const r = dispatch(act.logAttempt(f.id, channel, result, attNote)); if (r.ok) setAttNote(""); }}>Record attempt</Button>
        </div>
      </section>

      <section style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
        <SecTitle right={<span className="phr-sub">Illustrative, not a validated protocol</span>}>Escalate</SecTitle>
        <Field label="Escalation note">
          <Textarea rows={2} value={escNote} onChange={(e) => setEscNote(e.target.value)} placeholder="Who it is escalated to and why." />
        </Field>
        <div style={{ marginTop: 8 }}>
          <Button disabled={!escNote.trim()} onClick={() => { const r = dispatch(act.escalateFollowUp(f.id, escNote)); if (r.ok) setEscNote(""); }}>Record escalation</Button>
        </div>
      </section>

      <section style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
        <SecTitle right={<span className="phr-sub">A delivery receipt cannot close it</span>}>Close with a documented outcome</SecTitle>
        <div className="phr-gap">
          <Field label="Outcome">
            <Select value={code} onChange={(e) => setCode(e.target.value)}>
              <option value="">Choose a documented outcome</option>
              {FOLLOW_UP_OUTCOMES.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
            </Select>
          </Field>
          <Field label="Outcome note">
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What was agreed with the participant." />
          </Field>
          <Checkbox checked={ack} onChange={setAck} label="I am the responsible clinician and I acknowledge this documented outcome" hint="Authorised acknowledgement. Recorded with your name and the time." />
          <div>
            <Button variant="primary" icon="check" disabled={missing.length > 0} onClick={() => dispatch(act.closeFollowUp(f.id, code, note, ack))}>Close with documented outcome</Button>
          </div>
          {missing.length ? <div className="phr-sub">To close: {missing.join("; ")}.</div> : null}
        </div>
      </section>
    </>
  );
}

function FollowUpContext({ v }: { v: FollowUpView }) {
  const state = usePhState();
  const f = v.followUp;
  const msgs = state.messages.filter((m) => m.personId === v.person.id).slice().sort((a, b) => (a.at < b.at ? 1 : -1));
  const rel = currentReleased(state, v.episode.id);
  const events = eventsFor(state, [f.id, f.taskId], 8);
  return (
    <>
      <Card>
        <CardHeader title="What closes this item" />
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.6, color: "var(--body)" }}>
          <li>A documented outcome with an authorised acknowledgement.</li>
          <li>Not a delivered SMS or email.</li>
          <li>Not the participant opening a report in the portal.</li>
          <li>Report status and follow-up status are separate: a released report can still have an open follow-up.</li>
        </ul>
      </Card>
      <Card>
        <CardHeader title="Messages and report access" sub="Read-only context. None of this can close the follow-up." right={<DemoTag>Simulated</DemoTag>} />
        <div className="phr-gap">
          {msgs.length ? msgs.slice(0, 5).map((m) => (
            <div key={m.id} className="phr-row" style={{ gap: 6, fontSize: 12.5 }}>
              <Icon name={m.channel === "sms" ? "sms" : "mail"} size={13} style={{ color: "var(--dim)" }} />
              <span className="ph-grow" style={{ minWidth: 120 }}>{m.subject}</span>
              <Pill tone={m.status === "delivered" ? "ok" : m.status === "failed" ? "bad" : "neutral"} icon={m.status === "delivered" ? "check" : m.status === "failed" ? "x" : "clock"}>{m.status === "delivered" ? "Delivered" : m.status === "failed" ? "Failed" : m.status}</Pill>
              <span className="phr-sub" style={{ width: "100%" }}>{fmtShortDateTime(m.at)}, {m.channel === "sms" ? "SMS" : "email"} to {m.destination}</span>
            </div>
          )) : <div className="phr-sub">No messages to this participant.</div>}
          <div className="phr-banner">
            <Icon name="file" size={14} style={{ color: "var(--dim)", marginTop: 1 }} />
            <div className="ph-grow">
              {rel ? (rel.accessedAt ? `Report v${rel.version} opened in the portal ${fmtShortDateTime(rel.accessedAt)}.` : `Report v${rel.version} is released and not opened yet.`) : `No report released yet. The episode is ${v.episode.reportState === "on_hold" ? "on hold" : "not released"}.`}
            </div>
          </div>
        </div>
      </Card>
      <Card>
        <CardHeader title="Audit" sub="From the shared activity log." />
        <EventList events={events} empty="No events yet for this item." />
      </Card>
    </>
  );
}
