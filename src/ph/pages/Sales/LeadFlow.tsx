/* Stephen's step-by-step flow inside the lead workspace: a progress bar (first reply, meeting
   notes, proposal, follow up, won), one clear next step with one primary action, the agent's first
   reply, meeting notes, the weekly follow ups and Mark as won. Reads src/ph/model/salesFlow.ts and
   dispatches through flowActions. Emails are simulated. */
import "./flowActions";
import { useEffect, useMemo, useState } from "react";
import {
  ONB_STEP_LABEL, onbCurrentStep, onbProgress,
  SALES_JOURNEY, SALES_SAMPLE_NOTES, fmtShortDateTime, fmtTime, fmtWeekdayDate, salesDuration, salesEurRange, salesFirstReplyDraft, salesFollowSequence, salesInboundFor, salesJourney,
  salesLatestVersion, salesNetTotals, salesParseNotes, salesTouchClock,
} from "../../model";
import type { SalesFlowInbound, SalesLead, SalesProposal } from "../../model";
import { useNav } from "../../nav-context";
import { dispatch, usePhState } from "../../store";
import { Button, DemoTag, Icon, Pill, TextInput, Textarea } from "../../ui";
import { salesAct } from "./actions";
import { flowAct } from "./flowActions";
import { liveNowIso, useLiveNow } from "./liveClock";
import { useSalesRights } from "./shared";
import { onbForLead } from "./onbSelect";

/* ---------------------------------------------------------------- mark as won */

/** Marks the lead as won and opens Onboarding on it, where a person chooses Occupational Health or
    Wellness. The onboarding itself only starts once that choice is made. */
export function useMarkWon(): (leadId: string) => boolean {
  const nav = useNav();
  return (leadId: string) => {
    const r = dispatch(flowAct.markWon(leadId));
    if (!r.ok) return false;
    nav.go({ page: "Sales", tab: "onboarding", params: { lead: leadId } });
    return true;
  };
}

/* ---------------------------------------------------------------- first-touch timer */

export function TouchTimer({ inb, big }: { inb: SalesFlowInbound; big?: boolean }) {
  const pending = !inb.firstTouchAt;
  const now = useLiveNow(pending);
  if (!pending) {
    const inTime = (inb.responseSeconds || 0) <= inb.slaMinutes * 60;
    return <Pill tone={inTime ? "ok" : "warn"} icon="check">Replied in {salesDuration(inb.responseSeconds || 0)}</Pill>;
  }
  const c = salesTouchClock(inb, now);
  if (big) {
    return (
      <span className={`lf-timer lf-${c.tone}`} role="timer" aria-live="off">
        <Icon name="clock" size={15} />
        <b className="ph-num">{c.overdue ? `-${c.label.replace("Overdue ", "")}` : c.label.replace(" left", "")}</b>
        <span>{c.overdue ? "overdue" : "left"}</span>
      </span>);
  }
  return <Pill tone={c.tone === "ok" ? "info" : c.tone} icon="clock" style={{ fontVariantNumeric: "tabular-nums" }}>{c.label}</Pill>;
}

/* ---------------------------------------------------------------- journey bar */

export function JourneyBar({ leadId }: { leadId: string }) {
  const s = usePhState();
  const j = salesJourney(s, leadId);
  return (
    <ol className={`lf-journey${j.lost ? " lost" : ""}`} aria-label="Progress">
      {SALES_JOURNEY.map((x, i) => {
        const state = j.done[x.id] ? "done" : x.id === j.current && !j.lost ? "now" : "todo";
        return (
          <li key={x.id} className={`lf-step ${state}`} aria-current={state === "now" ? "step" : undefined}>
            <span className="lf-dot">{state === "done" ? <Icon name="check" size={12} stroke={2.4} /> : i + 1}</span>
            <span className="lf-label">{x.label}</span>
          </li>);
      })}
    </ol>
  );
}

/* ---------------------------------------------------------------- next step */

export function NextStep({ lead, onBuild }: { lead: SalesLead; onBuild: () => void }) {
  const s = usePhState();
  const nav = useNav();
  const rights = useSalesRights();
  const markWon = useMarkWon();
  const j = salesJourney(s, lead.id);
  const props = s.sales.proposals.filter((p) => p.leadId === lead.id);
  const p: SalesProposal | undefined = props[props.length - 1];
  const v = p ? salesLatestVersion(p) : null;
  const inb = salesInboundFor(s, lead.id);
  const [writing, setWriting] = useState(false);
  useEffect(() => { setWriting(false); }, [lead.id]);

  if (j.lost) return <div className="lf-next"><div className="lf-next-head"><Icon name="x" size={15} /><b>This lead is lost</b></div><p>{lead.lostReason || "No reason given."} Drag it back to New contact leads on the board to pick it up again.</p></div>;
  if (!rights.manage) return null;

  if (j.current === "reply") {
    return (
      <div className="lf-next">
        <div className="lf-next-head"><span className="lf-num">1</span><b>Send the first reply</b>{inb ? <span className="ph-grow" /> : null}{inb ? <TouchTimer inb={inb} big /> : null}</div>
        {writing ? <FirstReplyEditor lead={lead} onCancel={() => setWriting(false)} /> : (
          <>
            <p>The Sales agent drafts your reply with the brochure, a link to book a call and similar clients you already work with. You check it before it goes.</p>
            <div className="lf-actions">
              <Button variant="primary" icon="spark" onClick={() => setWriting(true)}>Draft first reply</Button>
              {inb ? <Button variant="ghost" icon="phone" onClick={() => dispatch(flowAct.logFirstTouch(lead.id, "call", liveNowIso(s)))}>I called them instead</Button> : null}
            </div>
          </>)}
      </div>);
  }
  if (j.current === "meeting") {
    return (
      <div className="lf-next">
        <div className="lf-next-head"><span className="lf-num">2</span><b>Add your meeting notes</b></div>
        <p>Type or paste your notes from the call. The proposal builder picks out the headcount, sites, package, flu and dates for you.</p>
        <NotesEditor lead={lead} primary />
        {s.salesFlow.notes[lead.id] ? null : <div className="lf-actions"><Button variant="ghost" size="sm" icon="file" onClick={onBuild}>Skip and build the proposal</Button></div>}
      </div>);
  }
  if (j.current === "proposal") {
    const net = p ? salesNetTotals(s, p) : null;
    return (
      <div className="lf-next">
        <div className="lf-next-head"><span className="lf-num">3</span><b>{v && v.status === "draft" ? "Check and send the proposal" : "Build the proposal"}</b></div>
        {v && v.status === "draft" && net ? (
          <>
            <p>{p!.id} v{v.version} is ready as a draft: <b className="ph-num">{salesEurRange(net.netLow, net.netHigh)}</b>{net.discountPct ? ` after a ${net.discountPct}% discount` : ""}. Sending starts the weekly follow ups.</p>
            <div className="lf-actions">
              <Button variant="primary" icon="send" onClick={() => dispatch(salesAct.sendProposal(p!.id))}>Send proposal</Button>
              <Button icon="edit" onClick={onBuild}>Edit in builder</Button>
              <Button variant="ghost" icon="eye" onClick={() => nav.go({ page: "Sales", tab: "proposals", params: { proposal: p!.id } })}>View document</Button>
            </div>
          </>) : (
          <>
            <p>Pick the package and headcount. Prices come straight from the price list{s.salesFlow.notes[lead.id] ? ", and your meeting notes fill in the details" : ""}.</p>
            <div className="lf-actions"><Button variant="primary" icon="file" onClick={onBuild}>Build proposal</Button></div>
          </>)}
      </div>);
  }
  if (j.current === "follow") {
    return (
      <div className="lf-next">
        <div className="lf-next-head"><span className="lf-num">4</span><b>Follow up until they decide</b></div>
        <FollowUps leadId={lead.id} />
        <div className="lf-actions" style={{ marginTop: 12 }}>
          <Button variant="primary" icon="check" onClick={() => markWon(lead.id)}>Mark as won</Button>
          {p ? <Button variant="ghost" icon="eye" onClick={() => nav.go({ page: "Sales", tab: "proposals", params: { proposal: p.id } })}>View proposal</Button> : null}
        </div>
      </div>);
  }
  const onb = onbForLead(s, lead.id);
  const onbPr = onb ? onbProgress(onb) : null;
  return (
    <div className="lf-next lf-won">
      <div className="lf-next-head"><Icon name="check" size={16} /><b>{onb ? `Won. Onboarding ${onb.id}, ${onb.completedAt ? "finished" : `step ${Math.min(onbPr!.done + 1, onbPr!.total)} of ${onbPr!.total}: ${ONB_STEP_LABEL[onbCurrentStep(onb)]}`}` : "Won. Next: start onboarding."}</b></div>
      <p>{onb ? (onb.completedAt ? `${lead.company} is onboarded. Next: set up the programme and the first screening day.` : `${lead.company} is being onboarded: details, agreements, team and Xero.`) : `${lead.company} moves to onboarding: the onboarding link, DSA and SLA, team and Xero.`}</p>
      <div className="lf-actions">
        <Button variant="primary" icon="arrow" onClick={() => nav.go({ page: "Sales", tab: "onboarding", params: onb ? { onb: onb.id } : { lead: lead.id } })}>{onb ? `Open onboarding ${onb.id}` : "Start onboarding"}</Button>
        <Button variant="ghost" icon="flag" onClick={() => nav.go({ page: "Clients", tab: "journey", params: { who: lead.id } })}>See the whole journey</Button>
      </div>
    </div>);
}

/* ---------------------------------------------------------------- first reply */

function FirstReplyEditor({ lead, onCancel }: { lead: SalesLead; onCancel: () => void }) {
  const s = usePhState();
  const draft = useMemo(() => salesFirstReplyDraft(s, lead), [lead.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [files, setFiles] = useState<string[]>(draft.attachments);
  const send = () => { dispatch(flowAct.sendFirstEmail(lead.id, subject, body, files, liveNowIso(s))); };
  return (
    <div className="lf-mail">
      <div className="lf-mail-meta"><span className="ph-faint">To</span><span>{lead.contact.name} &lt;{lead.contact.email}&gt;</span><span className="ph-grow" /><Pill tone="brand" icon="spark">Agent draft</Pill></div>
      <label className="lf-mail-row"><span className="ph-faint">Subject</span><TextInput value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Subject" /></label>
      <Textarea rows={11} value={body} onChange={(e) => setBody(e.target.value)} aria-label="Email body" className="lf-mail-body" />
      <div className="lf-chips">
        {files.map((f) => <span key={f} className="lf-chip"><Icon name="file" size={12} />{f}<button type="button" aria-label={`Remove ${f}`} onClick={() => setFiles(files.filter((x) => x !== f))}><Icon name="x" size={11} /></button></span>)}
        <span className="lf-chip"><Icon name="link" size={12} />Booking link: {draft.bookingLink}</span>
        {draft.references.length ? <span className="lf-chip"><Icon name="users" size={12} />References: {draft.references.join(", ")}</span> : null}
        {!files.length ? <button type="button" className="ph-link" style={{ fontSize: 12 }} onClick={() => setFiles(draft.attachments)}>Attach the brochure again</button> : null}
      </div>
      <div className="lf-actions">
        <Button variant="primary" icon="send" onClick={send}>Send</Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <span className="ph-grow" /><DemoTag>Simulated</DemoTag>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- meeting notes */

export function NotesEditor({ lead, primary }: { lead: SalesLead; primary?: boolean }) {
  const s = usePhState();
  const rights = useSalesRights();
  const saved = s.salesFlow.notes[lead.id];
  const [text, setText] = useState(saved?.text || "");
  const [editing, setEditing] = useState(!saved);
  useEffect(() => { setText(s.salesFlow.notes[lead.id]?.text || ""); setEditing(!s.salesFlow.notes[lead.id]); }, [lead.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const facts = useMemo(() => salesParseNotes(editing ? text : saved?.text || "", s.sales.priceItems), [text, saved?.text, editing, s.sales.priceItems]);
  const save = () => { const r = dispatch(flowAct.saveNotes(lead.id, text)); if (r.ok) setEditing(false); };
  if (!editing && saved) {
    return (
      <div className="lf-notes">
        <div className="lf-notes-text">{saved.text}</div>
        <FactChips facts={facts.facts} />
        <div className="lf-actions"><span className="ph-faint" style={{ fontSize: 11.5 }}>Saved {fmtShortDateTime(saved.savedAt)}</span><span className="ph-grow" />{rights.manage ? <Button size="sm" variant="ghost" icon="edit" onClick={() => setEditing(true)}>Edit notes</Button> : null}</div>
      </div>);
  }
  if (!rights.manage) return <div className="ph-faint" style={{ fontSize: 12.5 }}>No meeting notes yet.</div>;
  return (
    <div className="lf-notes">
      <Textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} aria-label="Meeting notes"
        placeholder="For example: about 45 staff across two sites, interested in POC3, yes to flu, week of 16 November, invoice per site." />
      {text.trim() ? <FactChips facts={facts.facts} live /> : null}
      <div className="lf-actions">
        <Button variant={primary ? "primary" : "secondary"} icon="check" onClick={save} disabled={!text.trim() || text.trim() === (saved?.text || "")}>Save notes</Button>
        {!text.trim() ? <button type="button" className="ph-link" style={{ fontSize: 12 }} onClick={() => setText(SALES_SAMPLE_NOTES)}>Use example notes</button> : null}
        {saved ? <Button variant="ghost" size="sm" onClick={() => { setText(saved.text); setEditing(false); }}>Cancel</Button> : null}
      </div>
    </div>
  );
}

export function FactChips({ facts, live }: { facts: Array<{ key: string; label: string; value: string }>; live?: boolean }) {
  if (!facts.length) return live ? <div className="ph-faint" style={{ fontSize: 12 }}>The agent has not spotted headcount, sites, package, flu or dates yet.</div> : null;
  return (
    <div className="lf-facts" aria-label="Facts found in the notes">
      <span className="lf-facts-k"><Icon name="spark" size={12} />{live ? "Agent spotted" : "From your notes"}</span>
      {facts.filter((f) => f.key !== "deal").map((f) => <span key={f.key} className="lf-fact"><span>{f.label}</span>{f.value}</span>)}
    </div>
  );
}

/* ---------------------------------------------------------------- follow ups */

const STEP_LOOK = {
  sent: { tone: "ok", icon: "check", text: "Sent" },
  skipped: { tone: "neutral", icon: "x", text: "Skipped" },
  due: { tone: "warn", icon: "clock", text: "Due" },
  scheduled: { tone: "neutral", icon: "calendar", text: "Scheduled" },
  stopped: { tone: "neutral", icon: "x", text: "Stopped" },
} as const;

export function FollowUps({ leadId }: { leadId: string }) {
  const s = usePhState();
  const rights = useSalesRights();
  const q = salesFollowSequence(s, leadId);
  const [open, setOpen] = useState<number | null>(null);
  if (!q) return <div className="ph-faint" style={{ fontSize: 12.5 }}>The weekly follow ups start once the proposal is sent.</div>;
  const actionable = rights.manage && !q.stopped && !q.paused;
  return (
    <div className="lf-follow">
      <div className="lf-follow-head">
        <span className="ph-dim" style={{ fontSize: 12.5 }}>Soft weekly emails after {q.proposalId} v{q.version} went out on {fmtWeekdayDate(q.sentAt)}.</span>
        <span className="ph-grow" />
        {q.stopped ? <Pill tone={q.stopped === "won" ? "ok" : "neutral"} icon={q.stopped === "won" ? "check" : "x"}>Stopped, lead {q.stopped}</Pill>
          : rights.manage ? <Button size="sm" variant="ghost" icon={q.paused ? "refresh" : "clock"} onClick={() => dispatch(flowAct.pauseFollowUps(leadId, !q.paused))}>{q.paused ? "Resume" : "Pause sequence"}</Button> : null}
      </div>
      {q.paused ? <div className="lf-paused"><Icon name="info" size={13} />Paused. Nothing is sent until you resume.</div> : null}
      <ol className="lf-follow-list">
        {q.steps.map((st) => {
          const look = STEP_LOOK[st.status];
          const isNext = q.next?.n === st.n;
          return (
            <li key={st.n} className={`lf-fu${isNext && !q.paused ? " next" : ""}`}>
              <div className="lf-fu-row">
                <span className="lf-fu-week">Week {st.n}</span>
                <button type="button" className="lf-fu-subj" onClick={() => setOpen(open === st.n ? null : st.n)} aria-expanded={open === st.n}>
                  <span className="ph-trunc">{st.subject}</span><Icon name={open === st.n ? "chevronDown" : "chevronRight"} size={12} />
                </button>
                <span className="lf-fu-date ph-num">{fmtWeekdayDate(st.due)}</span>
                <Pill tone={look.tone} icon={look.icon}>{look.text}</Pill>
              </div>
              {open === st.n ? <div className="lf-fu-body">{st.body}</div> : null}
              {actionable && (st.status === "due" || st.status === "scheduled") && isNext ? (
                <div className="lf-fu-act">
                  <Button size="sm" variant="primary" icon="send" onClick={() => dispatch(flowAct.followUp(leadId, st.n, "send"))}>Send now</Button>
                  <Button size="sm" variant="ghost" onClick={() => dispatch(flowAct.followUp(leadId, st.n, "skip"))}>Skip</Button>
                </div>) : null}
            </li>);
        })}
      </ol>
    </div>
  );
}

/* ---------------------------------------------------------------- first-touch banner for the workspace */

export function FirstTouchNote({ lead }: { lead: SalesLead }) {
  const s = usePhState();
  const inb = salesInboundFor(s, lead.id);
  if (!inb || !inb.firstTouchAt) return null;
  return (
    <div className="lf-touched"><Icon name="check" size={13} />First touch by {inb.firstTouchVia === "call" ? "phone" : "email"} at {fmtTime(inb.firstTouchAt)}, {salesDuration(inb.responseSeconds || 0)} after the enquiry arrived at {fmtTime(inb.arrivedAt)}.</div>
  );
}

export const LEAD_FLOW_CSS = `
.lf-journey { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 0; position: relative; }
.lf-step { display: flex; flex-direction: column; align-items: center; gap: 6px; position: relative; text-align: center; }
.lf-step:not(:first-child)::before { content: ""; position: absolute; top: 13px; right: 50%; width: 100%; height: 2px; background: var(--track); z-index: 0; }
.lf-step.done:not(:first-child)::before, .lf-step.now:not(:first-child)::before { background: var(--accent); }
.lf-dot { position: relative; z-index: 1; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; background: var(--surface-2); border: 1.5px solid var(--border); color: var(--faint); }
.lf-step.done .lf-dot { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
.lf-step.now .lf-dot { border-color: var(--accent); color: var(--ink); box-shadow: 0 0 0 4px var(--accent-soft); }
.lf-label { font-size: 11.5px; color: var(--faint); line-height: 1.2; }
.lf-step.now .lf-label { color: var(--ink); font-weight: 600; }
.lf-step.done .lf-label { color: var(--dim); }
.lf-journey.lost { opacity: .55; }
.lf-next { border: 1px solid var(--accent); background: linear-gradient(180deg, var(--accent-soft), transparent 70%); border-radius: 16px; padding: 16px 18px; }
.lf-next.lf-won { border-color: var(--ok); background: linear-gradient(180deg, var(--ok-soft), transparent 70%); }
.lf-next p { margin: 6px 0 0; font-size: 13px; line-height: 1.55; color: var(--body); }
.lf-next-head { display: flex; align-items: center; gap: 10px; font-size: 14.5px; color: var(--ink); flex-wrap: wrap; }
.lf-num { width: 22px; height: 22px; border-radius: 50%; background: var(--accent); color: var(--on-accent); font-size: 12px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; }
.lf-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 12px; }
.lf-timer { display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; border-radius: 999px; font-size: 12px; font-weight: 500; }
.lf-timer b { font-size: 16px; font-weight: 700; letter-spacing: .02em; }
.lf-timer.lf-ok { background: var(--accent-soft); color: var(--accent); }
.lf-timer.lf-warn { background: var(--warn-soft); color: var(--warn); }
.lf-timer.lf-bad { background: var(--bad-soft); color: var(--bad); }
.lf-mail { margin-top: 12px; display: flex; flex-direction: column; gap: 10px; }
.lf-mail-meta { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--body); flex-wrap: wrap; }
.lf-mail-row { display: grid; grid-template-columns: 56px minmax(0, 1fr); align-items: center; gap: 8px; font-size: 12.5px; }
.lf-mail-body { font-size: 13px; line-height: 1.55; }
.ph-drawer textarea.ph-input { border-radius: 14px; padding: 10px 14px; }
.lf-chips { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.lf-chip { display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px; border-radius: 999px; background: var(--surface-2); border: 1px solid var(--border); font-size: 11.5px; color: var(--body); max-width: 100%; }
.lf-chip button { border: 0; background: none; color: var(--faint); cursor: pointer; padding: 0; display: inline-flex; }
.lf-chip button:hover { color: var(--ink); }
.lf-notes { display: flex; flex-direction: column; gap: 10px; margin-top: 10px; }
.lf-notes-text { font-size: 12.5px; line-height: 1.55; white-space: pre-wrap; color: var(--body); background: var(--surface-2); border: 1px solid var(--border); border-radius: 12px; padding: 10px 12px; }
.lf-notes .lf-actions { margin-top: 0; }
.lf-facts { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.lf-facts-k { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; color: var(--accent); text-transform: uppercase; letter-spacing: .05em; margin-right: 2px; }
.lf-fact { display: inline-flex; gap: 6px; align-items: baseline; padding: 4px 10px; border-radius: 999px; background: var(--accent-soft); color: var(--ink); font-size: 12px; }
.lf-fact span { color: var(--dim); font-size: 11px; }
.lf-follow { margin-top: 10px; }
.lf-follow-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.lf-paused { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--warn); margin-top: 8px; }
.lf-follow-list { list-style: none; margin: 10px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.lf-fu { border: 1px solid var(--border); border-radius: 12px; padding: 8px 10px; background: var(--surface); }
.lf-fu.next { border-color: var(--accent); }
.lf-fu-row { display: grid; grid-template-columns: 58px minmax(0, 1fr) auto auto; align-items: center; gap: 10px; }
.lf-fu-week { font-size: 12px; font-weight: 600; color: var(--ink); }
.lf-fu-subj { display: inline-flex; align-items: center; gap: 6px; min-width: 0; border: 0; background: none; color: var(--body); font: inherit; font-size: 12.5px; cursor: pointer; padding: 0; text-align: left; }
.lf-fu-subj:hover { color: var(--ink); }
.lf-fu-date { font-size: 12px; color: var(--dim); white-space: nowrap; }
.lf-fu-body { margin-top: 8px; white-space: pre-wrap; font-size: 12.5px; line-height: 1.55; color: var(--body); background: var(--surface-2); border-radius: 10px; padding: 10px 12px; }
.lf-fu-act { display: flex; gap: 8px; margin-top: 8px; }
.lf-touched { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--ok); }
@media (max-width: 560px) {
  .lf-label { font-size: 10px; }
  .lf-fu-row { grid-template-columns: 52px minmax(0, 1fr) auto; }
  .lf-fu-date { grid-column: 2; grid-row: 2; font-size: 11px; }
  .lf-fu-row .ph-pill { grid-column: 3; grid-row: 1 / span 2; }
  .lf-mail-row { grid-template-columns: minmax(0, 1fr); gap: 4px; }
}
`;
