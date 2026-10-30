/* The small forms the control panel opens when an action needs a word or a number from the person:
   match a lab row, log a call, escalate, answer a range question, record flu actuals, order
   vaccines, log a cold chain follow-up, decline a claim, pick a nurse. Each one dispatches the
   owning module's existing action and closes only when it worked. */
import { useState } from "react";
import {
  FLU_FOLLOWUP_ACTIONS, FLU_SEASON_CURRENT, addDays, act, fluEodForClinic, fmtWeekdayDate, ix, rotaCandidates, rotaTimeText, today,
} from "../../../model";
import type { ExpenseRequest, FluClinic, FluColdChainRow, FluFollowUpAction, FollowUpView, RotaItem } from "../../../model";
import { dispatch, usePhState } from "../../../store";
import { Button, Field, Modal, Pill, Select, TextInput, Textarea } from "../../../ui";
import { fluAct } from "../../Flu/actions";
import { opsAct } from "../../Clinics/opsActions";
import { rotaAct } from "../../Clinics/rotaActions";
import { rrAct } from "../../Screening/actions";
import { labAct } from "../../../model/labCsvActions";
import { fluBatchesLeft } from "./select";
import type { CtlRow } from "./select";

export type CtlDialog =
  | null
  | { kind: "match"; row: Extract<CtlRow, { kind: "lab" }> }
  | { kind: "call"; fu: FollowUpView }
  | { kind: "escalate"; fu: FollowUpView }
  | { kind: "answer"; q: Extract<CtlRow, { kind: "rrq" }>["q"] }
  | { kind: "actuals"; clinic: FluClinic }
  | { kind: "order"; short: number }
  | { kind: "cold"; row: FluColdChainRow }
  | { kind: "decline"; expense: ExpenseRequest; staffName: string }
  | { kind: "assign"; item: RotaItem };

/** Run an action; close the dialog only if it worked. The store shows the toast either way. */
const run = (a: { type: string; [k: string]: unknown }, close: () => void) => { if (dispatch(a).ok) close(); };

export function ControlDialog({ d, onClose }: { d: CtlDialog; onClose: () => void }) {
  if (!d) return null;
  switch (d.kind) {
    case "match": return <MatchDialog row={d.row} onClose={onClose} />;
    case "call": return <CallDialog fu={d.fu} onClose={onClose} />;
    case "escalate": return <EscalateDialog fu={d.fu} onClose={onClose} />;
    case "answer": return <AnswerDialog q={d.q} onClose={onClose} />;
    case "actuals": return <ActualsDialog clinic={d.clinic} onClose={onClose} />;
    case "order": return <OrderDialog short={d.short} onClose={onClose} />;
    case "cold": return <ColdDialog row={d.row} onClose={onClose} />;
    case "decline": return <DeclineDialog e={d.expense} staffName={d.staffName} onClose={onClose} />;
    case "assign": return <AssignDialog item={d.item} onClose={onClose} />;
  }
}

/* ---- lab row: name, date of birth and Unique ID side by side, then a reason ---- */
function MatchDialog({ row, onClose }: { row: Extract<CtlRow, { kind: "lab" }>; onClose: () => void }) {
  const s = usePhState();
  const q = row.item;
  const ep = q.candidate!;
  const p = ix(s).personById.get(ep.personId)!;
  const [spec, setSpec] = useState(false);
  const [dob, setDob] = useState(false);
  const [reason, setReason] = useState("");
  const cell = (bad: boolean, v: string) => <span className={bad ? "bad" : undefined}>{v || "Missing"}</span>;
  const go = () => q.source === "csv"
    ? run(labAct.resolve(q.record!.id, ep.id, reason), onClose)
    : run(act.resolveRow(q.row!.id, ep.id, [...(spec ? ["specimen"] : []), ...(dob ? ["dob"] : [])], reason), onClose);
  return (
    <Modal open onClose={onClose} title="Match lab row" width={520}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" icon="check" onClick={go}>Match to {p.given} {p.family}</Button></>}>
      <div className="ctl-form">
        <div className="ph-dim" style={{ fontSize: 12.5 }}>Nothing attaches automatically. Check the differences against the collection record, then say why this row belongs to this person.</div>
        <div className="ctl-compare">
          <span className="h" /> <span className="h">In the lab file</span><span className="h">In Pulse</span>
          <span className="h">Name</span>{cell(q.diff.name, `${q.file.surname}${q.file.given ? `, ${q.file.given}` : ""}`)}<span>{p.family}, {p.given}</span>
          <span className="h">Date of birth</span>{cell(q.diff.dob, q.file.dobText || q.file.dob || "")}<span>{p.dob}</span>
          <span className="h">Unique ID</span>{cell(q.diff.id, q.file.uniqueId)}<span>{ep.id}</span>
        </div>
        {q.source === "feed" ? (
          <div className="ph-stack" style={{ gap: 6 }}>
            <label className="ph-row-flex" style={{ gap: 8, fontSize: 12.5 }}><input type="checkbox" checked={spec} onChange={(e) => setSpec(e.target.checked)} /> Specimen identifier checked against the collection record</label>
            <label className="ph-row-flex" style={{ gap: 8, fontSize: 12.5 }}><input type="checkbox" checked={dob} onChange={(e) => setDob(e.target.checked)} /> Date of birth checked against the collection record</label>
          </div>
        ) : null}
        <Field label="Why does this row belong to this person?">
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: lab confirmed a typing error in the date of birth" />
        </Field>
        <div className="ph-row-flex" style={{ gap: 6, flexWrap: "wrap" }}>
          {["Lab confirmed a typing error in the name", "Lab confirmed a typing error in the date of birth"].map((x) => <Button key={x} size="sm" variant="ghost" onClick={() => setReason(x)}>{x}</Button>)}
        </div>
      </div>
    </Modal>
  );
}

/* ---- urgent follow-up ---- */
function CallDialog({ fu, onClose }: { fu: FollowUpView; onClose: () => void }) {
  const [result, setResult] = useState<"no_answer" | "voicemail" | "spoke" | "wrong_number">("no_answer");
  const [note, setNote] = useState("");
  return (
    <Modal open onClose={onClose} title={`Log a call to ${fu.person.given} ${fu.person.family}`} width={460}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" icon="phone" onClick={() => run(act.logAttempt(fu.followUp.id, "phone", result, note), onClose)}>Log call</Button></>}>
      <div className="ctl-form">
        <Field label="What happened?">
          <Select value={result} onChange={(e) => setResult(e.target.value as typeof result)}>
            <option value="no_answer">No answer</option><option value="voicemail">Left a voicemail</option><option value="spoke">Spoke to them</option><option value="wrong_number">Wrong number</option>
          </Select>
        </Field>
        <Field label="Note" help="The follow-up stays open until an outcome is recorded on Results, Follow-up."><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
function EscalateDialog({ fu, onClose }: { fu: FollowUpView; onClose: () => void }) {
  const [note, setNote] = useState("Two attempts with no answer. Escalating to the GP on file.");
  return (
    <Modal open onClose={onClose} title={`Escalate ${fu.person.given} ${fu.person.family}`} width={460}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="danger" icon="flag" onClick={() => run(act.escalateFollowUp(fu.followUp.id, note), onClose)}>Escalate</Button></>}>
      <Field label="Escalation note"><Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
    </Modal>
  );
}

/* ---- range question ---- */
function AnswerDialog({ q, onClose }: { q: Extract<CtlRow, { kind: "rrq" }>["q"]; onClose: () => void }) {
  const [answer, setAnswer] = useState("Agreed.");
  return (
    <Modal open onClose={onClose} title={q.topic} width={540}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" icon="check" onClick={() => run(rrAct.answerQuestion(q.id, answer), onClose)}>Save answer</Button></>}>
      <div className="ctl-form">
        <div style={{ fontSize: 13, color: "var(--ink)" }}>{q.question}</div>
        <div className="ph-dim" style={{ fontSize: 12.5 }}><b>What Pulse does now:</b> {q.applied}</div>
        <Field label="Your answer" help="Write 'Agreed.' to keep what Pulse does now. Any range change is made as a draft."><Textarea rows={2} value={answer} onChange={(e) => setAnswer(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

/* ---- flu actuals ---- */
const num = (v: string) => (v.trim() === "" ? null : Number(v));
function ActualsDialog({ clinic, onClose }: { clinic: FluClinic; onClose: () => void }) {
  const s = usePhState();
  const eod = fluEodForClinic(clinic, s.nurseOps.endOfDay);
  const batches = fluBatchesLeft(s);
  const [actual, setActual] = useState(String(eod?.vaccinesAdministered ?? clinic.projected));
  const [batchId, setBatchId] = useState(batches[0]?.batch.id || "");
  const [pre, setPre] = useState(eod?.preVaccineTempC != null ? String(eod.preVaccineTempC) : "");
  const [mid, setMid] = useState(eod?.intermediateVaccineTempC != null ? String(eod.intermediateVaccineTempC) : "");
  const [post, setPost] = useState(eod?.postVaccineTempC != null ? String(eod.postVaccineTempC) : "");
  const save = () => run(fluAct.recordActuals(clinic.id, { actual: Number(actual), batchId: batchId || null, preC: num(pre), intermediateC: num(mid), postC: num(post), eodId: eod?.id || null }), onClose);
  return (
    <Modal open onClose={onClose} title={`Actual numbers: ${clinic.company}`} width={500}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" icon="check" onClick={save}>Record actuals</Button></>}>
      <div className="ctl-form">
        <div className="ph-dim" style={{ fontSize: 12.5 }}>{fmtWeekdayDate(clinic.date!)}, {clinic.projected} projected.{eod ? ` Filled in from End of Day form ${eod.id}.` : ""}</div>
        <div className="ctl-form-2">
          <Field label="Vaccines given"><TextInput inputMode="numeric" value={actual} onChange={(e) => setActual(e.target.value)} /></Field>
          <Field label="Batch used" help={batches.length ? undefined : "No batch in stock yet. Record the vaccine delivery first."}>
            <Select value={batchId} onChange={(e) => setBatchId(e.target.value)}>
              {batches.length ? batches.map((b) => <option key={b.batch.id} value={b.batch.id}>{b.batch.code} Exp {b.batch.expiry} ({b.remaining} left)</option>) : <option value="">None in stock</option>}
            </Select>
          </Field>
        </div>
        <div className="ctl-form-3">
          <Field label="Pre-vaccine °C"><TextInput inputMode="decimal" value={pre} onChange={(e) => setPre(e.target.value)} /></Field>
          <Field label="Intermediate °C"><TextInput inputMode="decimal" value={mid} onChange={(e) => setMid(e.target.value)} /></Field>
          <Field label="Post-vaccine °C"><TextInput inputMode="decimal" value={post} onChange={(e) => setPost(e.target.value)} /></Field>
        </div>
      </div>
    </Modal>
  );
}

/* ---- vaccine order ---- */
function OrderDialog({ short, onClose }: { short: number; onClose: () => void }) {
  const s = usePhState();
  const last = s.flu.orders.filter((o) => o.season === FLU_SEASON_CURRENT).slice(-1)[0];
  const [supplier, setSupplier] = useState(last?.supplier || "Corrib Pharma Distribution (fictional)");
  const [qty, setQty] = useState(String(Math.max(100, Math.ceil((short || 500) / 100) * 100)));
  const [on, setOn] = useState(addDays(today(s), 14));
  return (
    <Modal open onClose={onClose} title="Order vaccines" width={480}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" icon="plus" onClick={() => run(fluAct.addOrder(supplier, Number(qty), on, "Ordered from the control panel."), onClose)}>Add order</Button></>}>
      <div className="ctl-form">
        <div className="ph-dim" style={{ fontSize: 12.5 }}>Adds a line to the Flu Vaccine Order Records. Simulated: nothing is sent to the supplier.</div>
        <Field label="Supplier"><TextInput value={supplier} onChange={(e) => setSupplier(e.target.value)} /></Field>
        <div className="ctl-form-2">
          <Field label="Doses"><TextInput inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
          <Field label="Expected delivery"><TextInput type="date" value={on} onChange={(e) => setOn(e.target.value)} /></Field>
        </div>
      </div>
    </Modal>
  );
}

/* ---- cold chain ---- */
function ColdDialog({ row, onClose }: { row: FluColdChainRow; onClose: () => void }) {
  const [action, setAction] = useState<FluFollowUpAction>("rechecked");
  const [note, setNote] = useState("");
  const [doses, setDoses] = useState("0");
  return (
    <Modal open onClose={onClose} title="Acknowledge cold chain alert" width={500}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" icon="check" onClick={() => run(fluAct.logFollowUp(row.key, action, note, Number(doses)), onClose)}>Acknowledge</Button></>}>
      <div className="ctl-form">
        <div style={{ fontSize: 12.5 }}>{row.company}, {fmtWeekdayDate(row.date)}: {row.excursions.map((x) => `${x.reading} ${x.value.toFixed(1)} °C`).join(", ")}, outside 2 to 8 °C.</div>
        <Field label="Action taken">
          <Select value={action} onChange={(e) => setAction(e.target.value as FluFollowUpAction)}>{FLU_FOLLOWUP_ACTIONS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</Select>
        </Field>
        <Field label="What was done"><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: cool box thermometer checked, reading confirmed at 7.9 °C" /></Field>
        <Field label="Doses discarded"><TextInput inputMode="numeric" value={doses} onChange={(e) => setDoses(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

/* ---- expense decline ---- */
function DeclineDialog({ e, staffName, onClose }: { e: ExpenseRequest; staffName: string; onClose: () => void }) {
  const [note, setNote] = useState("");
  return (
    <Modal open onClose={onClose} title={`Decline ${staffName.split(" ")[0]}'s request`} width={440}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="danger" icon="x" onClick={() => run(opsAct.decideExpense(e.id, false, note), onClose)}>Decline</Button></>}>
      <Field label="Why, in a few words" help="The nurse sees this."><TextInput value={note} onChange={(ev) => setNote(ev.target.value)} placeholder="For example: day trip, no overnight needed" /></Field>
    </Modal>
  );
}

/* ---- nurse picker for any rota item ---- */
function AssignDialog({ item, onClose }: { item: RotaItem; onClose: () => void }) {
  const s = usePhState();
  const live = item;
  const cands = rotaCandidates(s, live).filter((c) => !c.on);
  const pick = (id: string) => run(live.leadId ? rotaAct.swap(live.ref, live.date, live.leadId, id) : rotaAct.assign(live.ref, live.date, id, "lead"), onClose);
  const lead = live.leadId ? s.staff.find((x) => x.id === live.leadId)?.name : null;
  return (
    <Modal open onClose={onClose} title={lead ? "Change nurse" : "Assign a nurse"} width={480}>
      <div className="ph-dim" style={{ fontSize: 12.5, marginBottom: 8 }}>{live.title}, {fmtWeekdayDate(live.date)}, {rotaTimeText(live)}.{lead ? ` Now: ${lead}.` : " Nobody on it yet."}</div>
      {cands.map((c) => (
        <div key={c.staff.id} className="ctl-cand">
          <div className="ph-grow" style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, color: "var(--ink)" }}>{c.staff.name}</div>
            <div className="ph-faint" style={{ fontSize: 11.5 }}>{c.busy || "Free"}</div>
          </div>
          {c.busy ? <Pill tone="neutral" icon="clock">Busy</Pill> : <Button size="sm" variant="primary" icon="user" onClick={() => pick(c.staff.id)}>{lead ? "Swap in" : "Assign"}</Button>}
        </div>
      ))}
    </Modal>
  );
}
