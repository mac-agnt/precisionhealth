/* Sequences: the weekly soft follow-up after a proposal, editable as a template (emails, wait
   days, wording with merge fields), and the rebooking sequence for past clients. Shows which deals
   and clients are in each, with pause and resume. Sending is simulated. #/Sales/sequences */
import { useMemo, useRef, useState } from "react";
import {
  SALES_SEQ_DEFAULT, SALES_SEQ_MERGE_FIELDS, fmtWeekdayDate, salesFollowSequence, salesSeqMerge, salesSeqSteps,
} from "../../model";
import type { SalesSeqStep } from "../../model";
import { useNav } from "../../nav-context";
import { dispatch, usePhState } from "../../store";
import { Button, Card, CardHeader, Icon, Pill, Select, TextInput, Textarea } from "../../ui";
import { CompanyLink } from "../links";
import { deskAct } from "./deskActions";
import { flowAct } from "./flowActions";
import { onbAct } from "./onbActions";
import { retReminders } from "./onbSelect";
import { DESK_CSS } from "./DealKit";
import { useSalesRights } from "./shared";

export default function Sequences() {
  const s = usePhState();
  const nav = useNav();
  const [tab, setTab] = useState<"follow" | "rebook">(nav.params.seq === "rebook" ? "rebook" : "follow");
  const pick = (t: "follow" | "rebook") => { setTab(t); nav.setParams(t === "rebook" ? { seq: "rebook" } : {}); };
  const following = s.sales.leads.filter((l) => { const q = salesFollowSequence(s, l.id); return q && !q.stopped; }).length;
  const rebook = retReminders(s).filter((r) => r.state !== "sent").length;
  return (
    <div className="ph-page">
      <style>{DESK_CSS + SEQ_CSS}</style>
      <div className="sq-head">
        <div><div className="ph-eyebrow">Sell</div><h1 className="ph-h1">Sequences</h1>
          <p className="sq-sub">Soft, regular emails so nobody is forgotten. Edit the wording once and every deal in the sequence uses it. Sending is simulated.</p></div>
      </div>
      <div className="sq-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "follow"} className={`sq-tab${tab === "follow" ? " on" : ""}`} onClick={() => pick("follow")}>
          <Icon name="mail" size={15} /><span><b>Weekly follow up</b><small>After a proposal goes out · {following} deal{following === 1 ? "" : "s"}</small></span></button>
        <button type="button" role="tab" aria-selected={tab === "rebook"} className={`sq-tab${tab === "rebook" ? " on" : ""}`} onClick={() => pick("rebook")}>
          <Icon name="refresh" size={15} /><span><b>Rebooking</b><small>Three months before the anniversary · {rebook} client{rebook === 1 ? "" : "s"}</small></span></button>
      </div>
      {tab === "follow" ? <FollowSeq /> : <RebookSeq />}
    </div>
  );
}

function FollowSeq() {
  const s = usePhState();
  const rights = useSalesRights();
  const current = salesSeqSteps(s);
  const [steps, setSteps] = useState<SalesSeqStep[]>(current);
  const [open, setOpen] = useState(0);
  const leads = useMemo(() => s.sales.leads.map((l) => ({ l, q: salesFollowSequence(s, l.id) })).filter((x) => x.q && !x.q.stopped), [s]);
  const [previewId, setPreviewId] = useState(leads[0]?.l.id || "");
  const lastField = useRef<{ i: number; f: "subject" | "body"; el: HTMLInputElement | HTMLTextAreaElement | null }>({ i: 0, f: "body", el: null });
  const dirty = JSON.stringify(steps) !== JSON.stringify(current);
  const edited = !!s.salesDesk.follow;
  const upd = (i: number, patch: Partial<SalesSeqStep>) => setSteps(steps.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const insert = (key: string) => {
    const { i, f, el } = lastField.current;
    const tok = `{${key}}`;
    const cur = steps[i][f];
    const at = el && typeof el.selectionStart === "number" ? el.selectionStart : cur.length;
    upd(i, { [f]: cur.slice(0, at) + tok + cur.slice(at) } as Partial<SalesSeqStep>);
  };
  const pv = leads.find((x) => x.l.id === previewId)?.l || leads[0]?.l;
  const pvVals = pv ? { first: pv.contact.name.split(" ")[0], company: pv.company, proposal: leads.find((x) => x.l.id === pv.id)?.q?.proposalId || "PRP-0001" } : { first: "Bríd", company: "O'Callaghan Collection", proposal: "PRP-0001" };
  let day = 0;
  return (
    <div className="sq-grid">
      <Card>
        <CardHeader title="The emails" sub="Each one waits a number of days after the one before (the first after the proposal goes out)." right={edited ? <Pill tone="info">Edited</Pill> : <Pill>Original</Pill>} />
        <ol className="sq-steps">
          {steps.map((x, i) => {
            day += x.wait;
            return (
              <li key={i} className={`sq-step${open === i ? " open" : ""}`}>
                <button type="button" className="sq-step-h" onClick={() => setOpen(open === i ? -1 : i)} aria-expanded={open === i}>
                  <span className="sq-n">{i + 1}</span>
                  <span className="sq-step-t"><b>{x.subject || "No subject"}</b><small>Day {day} · {x.wait} day{x.wait === 1 ? "" : "s"} after {i ? `email ${i}` : "the proposal"}</small></span>
                  <Icon name={open === i ? "chevronDown" : "chevronRight"} size={13} />
                </button>
                {open === i ? (
                  <div className="sq-step-b">
                    <div className="sq-row">
                      <label className="sq-wait"><span>Wait</span><TextInput type="number" min={1} max={60} value={x.wait} disabled={!rights.manage} onChange={(e) => upd(i, { wait: Number(e.target.value) })} aria-label={`Email ${i + 1} wait in days`} /><span>days</span></label>
                      <TextInput value={x.subject} disabled={!rights.manage} onChange={(e) => upd(i, { subject: e.target.value })} onFocus={(e) => { lastField.current = { i, f: "subject", el: e.currentTarget }; }} aria-label={`Email ${i + 1} subject`} />
                    </div>
                    <Textarea rows={7} value={x.body} disabled={!rights.manage} onChange={(e) => upd(i, { body: e.target.value })} onFocus={(e) => { lastField.current = { i, f: "body", el: e.currentTarget }; }} aria-label={`Email ${i + 1} message`} />
                    {rights.manage ? (
                      <div className="sq-merge">
                        <span>Insert</span>{SALES_SEQ_MERGE_FIELDS.map((m) => <button key={m.key} type="button" className="sq-chip" onMouseDown={(e) => e.preventDefault()} onClick={() => insert(m.key)} title={m.label}>{`{${m.key}}`}</button>)}
                        <span className="ph-grow" />
                        {steps.length > 1 ? <Button size="sm" variant="ghost" icon="x" onClick={() => { setSteps(steps.filter((_, j) => j !== i)); setOpen(-1); }}>Remove email</Button> : null}
                      </div>) : null}
                  </div>) : null}
              </li>);
          })}
        </ol>
        {rights.manage ? (
          <div className="sq-acts">
            {steps.length < 6 ? <Button size="sm" icon="plus" onClick={() => { setSteps([...steps, { wait: 7, subject: "Checking in", body: "Hi {first},\n\nJust checking in on the proposal for {company}. Is there anything more I can do?\n\n{signature}" }]); setOpen(steps.length); }}>Add an email</Button> : null}
            <span className="ph-grow" />
            {edited ? <Button size="sm" variant="ghost" onClick={() => { if (dispatch(deskAct.resetFollowTemplate()).ok) setSteps(SALES_SEQ_DEFAULT); }}>Back to original</Button> : null}
            {dirty ? <Button size="sm" variant="ghost" onClick={() => setSteps(current)}>Undo changes</Button> : null}
            <Button size="sm" variant="primary" icon="check" disabled={!dirty} onClick={() => dispatch(deskAct.saveFollowTemplate(steps))}>Save sequence</Button>
          </div>) : null}
      </Card>
      <div className="sq-side">
        <Card>
          <CardHeader title="Preview" sub="As it would read for a real deal." right={leads.length ? <Select value={pv?.id || ""} onChange={(e) => setPreviewId(e.target.value)} aria-label="Preview for" style={{ width: 170 }}>{leads.map((x) => <option key={x.l.id} value={x.l.id}>{x.l.company}</option>)}</Select> : null} />
          {open >= 0 && steps[open] ? (
            <div className="sq-mail">
              <div className="sq-mail-to">To {pv ? `${pv.contact.name} <${pv.contact.email}>` : "the client"}</div>
              <div className="sq-mail-s">{salesSeqMerge(steps[open].subject, pvVals)}</div>
              <div className="sq-mail-b">{salesSeqMerge(steps[open].body, pvVals)}</div>
            </div>) : <div className="ph-dim" style={{ fontSize: 12.5 }}>Open an email on the left to preview it.</div>}
        </Card>
        <Card>
          <CardHeader title="Deals in this sequence" sub="It stops on its own when a deal is won or lost." />
          <div className="sq-list">
            {leads.map(({ l, q }) => (
              <div key={l.id} className="sq-item">
                <div className="ph-grow" style={{ minWidth: 0 }}>
                  <div className="sq-item-t"><CompanyLink name={l.company} /> <span className="ph-faint ph-mono" style={{ fontSize: 11 }}>{q!.proposalId}</span></div>
                  <div className="sq-dots" aria-label="Progress">{q!.steps.map((st) => <span key={st.n} className={`sq-dot ${st.status}`} title={`Email ${st.n}: ${st.status}, ${fmtWeekdayDate(st.due)}`} />)}
                    <span className="sq-item-s">{q!.paused ? "Paused" : q!.next ? `Next: email ${q!.next.n}, ${fmtWeekdayDate(q!.next.due)}` : "Finished"}</span></div>
                </div>
                {rights.manage && q!.next ? (
                  <span className="sq-item-a">
                    {!q!.paused && q!.next.status === "due" ? <Button size="sm" variant="primary" icon="send" onClick={() => dispatch(flowAct.followUp(l.id, q!.next!.n, "send"))}>Send</Button> : null}
                    <Button size="sm" variant="ghost" icon={q!.paused ? "refresh" : "clock"} onClick={() => dispatch(flowAct.pauseFollowUps(l.id, !q!.paused))}>{q!.paused ? "Resume" : "Pause"}</Button>
                  </span>) : null}
              </div>))}
            {!leads.length ? <div className="ph-dim" style={{ fontSize: 12.5 }}>No proposals are out right now.</div> : null}
          </div>
        </Card>
      </div>
    </div>
  );
}

function RebookSeq() {
  const s = usePhState();
  const nav = useNav();
  const rights = useSalesRights();
  const rows = retReminders(s);
  const tpl = s.onboarding.templates.rebooking;
  const LOOK = { due: ["warn", "Due now"], scheduled: ["neutral", "Scheduled"], sent: ["ok", "Sent"], no_contact: ["bad", "No contact"] } as const;
  return (
    <div className="sq-grid">
      <Card>
        <CardHeader title="The steps" sub="Stephen's yearly rule: contact the named person three months before the anniversary. Martina runs it." />
        <ol className="sq-steps">
          <li className="sq-step open"><div className="sq-step-h static"><span className="sq-n">1</span><span className="sq-step-t"><b>{tpl.subject.replace("{company}", "Company")}</b><small>Three months before the anniversary · email</small></span></div>
            <div className="sq-step-b"><div className="sq-mail-b small">{tpl.body}</div>
              <div className="sq-acts"><span className="ph-grow" /><Button size="sm" icon="edit" onClick={() => nav.go({ page: "Sales", tab: "recall", params: { template: "rebooking" } })}>Edit this email</Button></div></div></li>
          <li className="sq-step"><div className="sq-step-h static"><span className="sq-n">2</span><span className="sq-step-t"><b>Call the contact</b><small>Ten days later if there is no reply · Today list</small></span></div></li>
          <li className="sq-step"><div className="sq-step-h static"><span className="sq-n">3</span><span className="sq-step-t"><b>Find the next person if they have left</b><small>HR people move on · Retention, contacts</small></span></div></li>
        </ol>
      </Card>
      <Card>
        <CardHeader title="Clients in this sequence" sub="Past clients who have not rebooked yet, soonest first." right={<Button size="sm" variant="ghost" icon="arrow" onClick={() => nav.go({ page: "Sales", tab: "recall" })}>Retention</Button>} />
        <div className="sq-list">
          {rows.map((r) => {
            const paused = !!s.salesDesk.rebookPaused[r.recall.id];
            const look = LOOK[r.state];
            return (
              <div key={r.recall.id} className="sq-item">
                <div className="ph-grow" style={{ minWidth: 0 }}>
                  <div className="sq-item-t"><CompanyLink name={r.recall.company} /> <Pill tone={paused ? "neutral" : look[0]}>{paused ? "Paused" : look[1]}</Pill></div>
                  <div className="sq-item-s">Anniversary {fmtWeekdayDate(r.recall.recallOn)} · reminder {fmtWeekdayDate(r.dueOn)}{r.contact ? ` · to ${r.contact.name}` : ""}</div>
                </div>
                {rights.manage && r.state !== "sent" ? (
                  <span className="sq-item-a">
                    {!paused && r.state === "due" ? <Button size="sm" variant="primary" icon="send" onClick={() => dispatch(onbAct.sendRebooking(r.recall.id))}>Send</Button> : null}
                    {r.state === "no_contact" ? <Button size="sm" onClick={() => nav.go({ page: "Sales", tab: "recall" })}>Choose contact</Button> : null}
                    <Button size="sm" variant="ghost" icon={paused ? "refresh" : "clock"} onClick={() => dispatch(deskAct.rebookPause(r.recall.id, !paused))}>{paused ? "Resume" : "Pause"}</Button>
                  </span>) : null}
              </div>);
          })}
        </div>
      </Card>
    </div>
  );
}

const SEQ_CSS = `
.sq-head { margin: 4px 0 14px; }
.sq-sub { margin: 6px 0 0; font-size: 13px; color: var(--dim); max-width: 660px; line-height: 1.5; }
.sq-tabs { display: grid; grid-template-columns: repeat(2, minmax(0, 320px)); gap: 10px; margin-bottom: 14px; }
.sq-tab { display: flex; gap: 12px; align-items: center; text-align: left; padding: 12px 14px; border-radius: 14px; border: 1px solid var(--border); background: var(--surface); color: var(--dim); font: inherit; cursor: pointer; }
.sq-tab span { display: flex; flex-direction: column; min-width: 0; }
.sq-tab b { color: var(--ink); font-size: 13.5px; }
.sq-tab small { font-size: 11.5px; }
.sq-tab.on { border-color: var(--accent); background: var(--accent-soft); color: var(--accent); }
.sq-grid { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(300px, 1fr); gap: 14px; align-items: start; }
.sq-side { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.sq-steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; position: relative; }
.sq-step { border: 1px solid var(--border); border-radius: 14px; background: var(--surface); }
.sq-step.open { border-color: var(--accent); }
.sq-step-h { display: flex; align-items: center; gap: 12px; width: 100%; text-align: left; border: 0; background: none; padding: 12px 14px; font: inherit; color: inherit; cursor: pointer; }
.sq-step-h.static { cursor: default; }
.sq-n { width: 26px; height: 26px; border-radius: 50%; background: var(--accent); color: var(--on-accent); font-size: 12px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; flex: none; }
.sq-step-t { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.sq-step-t b { font-size: 13px; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sq-step-t small { font-size: 11.5px; color: var(--dim); }
.sq-step-b { padding: 0 14px 14px; display: flex; flex-direction: column; gap: 10px; }
.sq-row { display: grid; grid-template-columns: 170px minmax(0, 1fr); gap: 10px; align-items: center; }
.sq-wait { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--dim); }
.sq-wait .ph-input { width: 64px !important; text-align: center; }
.sq-merge { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 11.5px; color: var(--faint); }
.sq-chip { border: 1px solid var(--border); background: var(--surface-2); color: var(--accent); border-radius: 8px; padding: 3px 8px; font-family: var(--mono); font-size: 11px; cursor: pointer; }
.sq-chip:hover { border-color: var(--accent); }
.sq-acts { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
.sq-mail { border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
.sq-mail-to { font-size: 11.5px; color: var(--faint); padding: 8px 12px; border-bottom: 1px solid var(--border); }
.sq-mail-s { font-size: 13.5px; font-weight: 600; color: var(--ink); padding: 10px 12px 0; }
.sq-mail-b { white-space: pre-wrap; font-size: 12.5px; line-height: 1.6; color: var(--body); padding: 8px 12px 12px; }
.sq-mail-b.small { padding: 10px 12px; border-radius: 10px; background: var(--surface-2); }
.sq-list { display: flex; flex-direction: column; }
.sq-item { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-top: 1px solid var(--border); }
.sq-item:first-child { border-top: 0; }
.sq-item-t { display: flex; align-items: center; gap: 8px; font-size: 13px; flex-wrap: wrap; }
.sq-item-s { font-size: 11.5px; color: var(--dim); margin-left: 6px; }
.sq-item > div > .sq-item-s { margin-left: 0; display: block; margin-top: 3px; }
.sq-item-a { display: flex; gap: 4px; flex: none; }
.sq-dots { display: flex; align-items: center; gap: 4px; margin-top: 5px; flex-wrap: wrap; }
.sq-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--track); }
.sq-dot.sent { background: var(--accent); }
.sq-dot.skipped { background: var(--faint); }
.sq-dot.due { background: var(--warn); }
@media (max-width: 980px) { .sq-grid { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 560px) {
  .sq-tabs { grid-template-columns: minmax(0, 1fr); }
  .sq-row { grid-template-columns: minmax(0, 1fr); }
  .sq-item { flex-wrap: wrap; }
  .sq-item-a { width: 100%; }
}
`;
