/* Invitation overlays: draft review with recipient confirmation and simulated send (approver),
   draft preparation (administrators), code creation and revocation, and the message preview.
   Nothing is ever sent: approval records a simulated send. Messages carry no health information. */
import { useMemo, useState } from "react";
import type { InvitationDraft, ProgrammeId } from "../../model";
import { PROGRAMME_ORDER, act, activityFeed, approvalViews, fmtDate, fmtDateTime, ix, today } from "../../model";
import { useNav } from "../../nav-context";
import { dispatch, usePersona, usePhState } from "../../store";
import { Button, Checklist, Chip, DemoTag, Drawer, Field, Icon, Modal, Pill, SearchBox, Select, TextInput, Textarea } from "../../ui";
import { Note, StagePill } from "./common";
import { DRAFT_STATUS, defaultInviteMessage, draftRecipients, healthTermIn, invitable, namesOf, staffWithPerm } from "./model";

/* ---- message preview ---- */
export function MessagePreview({ title, message, linkText, note }: { title: string; message: string; linkText?: string; note?: string }) {
  const term = healthTermIn(title + " " + message);
  return (
    <div className="prg-msg" aria-label="Message preview">
      <div className="prg-msg-head">
        <b>From</b><span>Precision Health (simulated sender)</span>
        <b>Channel</b><span>Each recipient's contact preference, email or SMS</span>
        <b>Subject</b><span>{title || "No subject yet"}</span>
      </div>
      <div className="prg-msg-body">{message || "No message yet."}{linkText ? `\n\n${linkText}` : ""}</div>
      <div className="prg-msg-foot">
        <DemoTag>Simulated</DemoTag>
        {term
          ? <Pill tone="bad" icon="x">Contains "{term}": health information is not allowed</Pill>
          : <Pill tone="ok" icon="check">No health information</Pill>}
        <span>{note || "Nothing is sent from this demo."}</span>
      </div>
    </div>
  );
}

/* ---- review a draft: confirm recipients, approve or reject ---- */
export function DraftReview({ draft, onClose }: { draft: InvitationDraft; onClose: () => void }) {
  const s = usePhState();
  const nav = useNav();
  const p = usePersona();
  const I = ix(s);
  const canApprove = p.perms.has("invitations.approve");
  const pending = draft.status === "pending_approval" || draft.status === "draft";
  const approverMode = canApprove && pending;
  const rec = draftRecipients(s, draft);
  const [checked, setChecked] = useState<Set<string>>(() => new Set());
  const [rejecting, setRejecting] = useState(false);
  const prog = I.programmeById.get(draft.programmeId)!;
  const approval = approvalViews(s).find((a) => a.id === draft.approvalId);
  const approvers = namesOf(staffWithPerm(s, "invitations.approve"));
  const term = healthTermIn(draft.title + " " + draft.message);
  const bookedNow = rec.filter((r) => r.bookedNow);
  const all = draft.recipientIds.length;
  const confirmedAll = checked.size === all && draft.recipientIds.every((id) => checked.has(id));
  const blockReason = term ? "The message contains health information." : bookedNow.length ? `${bookedNow.length} recipient${bookedNow.length === 1 ? " has" : "s have"} booked since this draft was prepared. Return it so a new list can be prepared.` : !confirmedAll ? `Confirm all ${all} recipients first (${checked.size} confirmed).` : null;
  const groups = [
    { label: "Questionnaire in progress", rows: rec.filter((r) => r.inProgress) },
    { label: "Not started", rows: rec.filter((r) => !r.inProgress && !r.bookedNow) },
    { label: "Booked since the draft was prepared", rows: rec.filter((r) => !r.inProgress && r.bookedNow) },
  ].filter((g) => g.rows.length);
  const toggle = (id: string) => setChecked((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const events = activityFeed(s, { entityKind: "invitation" }).filter((v) => v.event.entity?.id === draft.id);
  const approve = () => { dispatch(act.decideInvitation(draft.id, true, draft.recipientIds.filter((id) => checked.has(id)))); };
  const reject = () => { const r = dispatch(act.decideInvitation(draft.id, false)); if (r.ok) setRejecting(false); };
  const preparer = I.staffById.get(draft.preparedBy)?.name || draft.preparedBy;
  const decider = draft.decidedBy ? I.staffById.get(draft.decidedBy)?.name || draft.decidedBy : null;

  const footer = approverMode ? (
    <>
      <span className="ph-faint" style={{ fontSize: 11.5, marginRight: "auto", alignSelf: "center", maxWidth: 300, lineHeight: 1.4 }}>{blockReason || `All ${all} recipients confirmed. Approval records a simulated send.`}</span>
      <Button variant="danger" icon="x" onClick={() => setRejecting(true)}>Reject</Button>
      <Button variant="primary" icon="send" disabled={!!blockReason} title={blockReason || undefined} onClick={approve}>Approve simulated send</Button>
    </>
  ) : (
    <>
      {draft.status === "approved_simulated_sent" ? <Button icon="mail" onClick={() => nav.go({ page: "Participants", tab: "communications" })}>See simulated messages</Button> : null}
      <Button onClick={onClose}>Close</Button>
    </>
  );

  return (
    <>
      <Drawer open onClose={onClose} width={640} title={draft.title}
        sub={`${draft.id}, ${prog.name}. Prepared by ${preparer}, ${fmtDateTime(draft.preparedAt)}.`} footer={footer}>
        <div className="ph-stack" style={{ gap: 16 }}>
          <div className="ph-row-flex" style={{ gap: 8, flexWrap: "wrap" }}>
            <Pill tone={DRAFT_STATUS[draft.status].tone} icon={draft.status === "approved_simulated_sent" ? "check" : draft.status === "rejected" ? "x" : "clock"}>{DRAFT_STATUS[draft.status].label}</Pill>
            <span className="ph-dim" style={{ fontSize: 12 }}>{all} recipients: {rec.filter((r) => r.inProgress).length} with a questionnaire in progress, {rec.filter((r) => !r.inProgress).length} not started.</span>
          </div>
          {draft.status === "approved_simulated_sent" ? (
            <Note tone="ok">Approved by {decider} on {fmtDateTime(draft.decidedAt!)}. Simulated send to {all} confirmed recipients; nothing was actually sent. Invitees still need a complete questionnaire and consent before they can confirm a booking, so capacity is unchanged until they book.</Note>
          ) : draft.status === "rejected" ? (
            <Note tone="neutral">Rejected by {decider} on {fmtDateTime(draft.decidedAt!)}. Nothing was sent.</Note>
          ) : approverMode ? (
            <Note tone="info">You approve invitation sends for this programme. Confirm each recipient below, then approve. The send is simulated.</Note>
          ) : (
            <Note tone="neutral" icon="lock">Awaiting approval by {approvers}. The approver confirms every recipient before a simulated send.{p.perms.has("invitations.manage") ? " You can prepare drafts but not approve them." : ""}</Note>
          )}
          <div>
            <div className="prg-label">Message preview</div>
            <MessagePreview title={draft.title} message={draft.message} linkText={`Your link: portal.precisionhealth.example.invalid/i/${prog.inviteCode}`} />
          </div>
          {approval ? (
            <div>
              <div className="prg-label"><span className="ph-grow">Approval checklist</span><span className="prg-mono">{approval.id}</span></div>
              <Checklist items={approval.checklist.map((c) => ({ label: c.label, done: c.done }))} />
            </div>
          ) : null}
          <div>
            <div className="prg-label">
              <span className="ph-grow">Recipients{approverMode ? `: ${checked.size} of ${all} confirmed` : ""}</span>
              {approverMode ? (
                confirmedAll
                  ? <Button size="sm" variant="ghost" onClick={() => setChecked(new Set())}>Clear confirmations</Button>
                  : <Button size="sm" onClick={() => setChecked(new Set(draft.recipientIds))} icon="check">Confirm all {all}</Button>
              ) : null}
            </div>
            <div className="prg-rcp" role="group" aria-label="Recipients">
              {groups.map((g) => (
                <div key={g.label}>
                  <div className="prg-rcp-group"><span className="ph-grow">{g.label}</span><span className="ph-num">{g.rows.length}</span></div>
                  {g.rows.map((r) => (
                    <label key={r.personId} className="prg-rcp-row" style={{ cursor: approverMode ? "pointer" : "default" }}>
                      {approverMode ? <input type="checkbox" checked={checked.has(r.personId)} onChange={() => toggle(r.personId)} aria-label={`Confirm ${r.name}`} /> : null}
                      <span className="prg-rcp-name">{r.name}</span>
                      <span className="prg-id">{r.personId}</span>
                      {r.sectionsDone != null ? <span className="ph-faint ph-num" style={{ fontSize: 11 }}>{r.sectionsDone} of {r.sectionsTotal}</span> : null}
                      <StagePill label={r.status} />
                    </label>
                  ))}
                </div>
              ))}
            </div>
            <div className="ph-faint" style={{ fontSize: 11.5, marginTop: 6, lineHeight: 1.45 }}>
              Minimal identity only. The employer never receives this list, and using an invitation does not reveal who else was invited.
            </div>
          </div>
          {events.length ? (
            <div>
              <div className="prg-label">Draft history</div>
              <div className="ph-stack" style={{ gap: 6 }}>
                {events.map((v) => (
                  <div key={v.event.id} style={{ fontSize: 12, color: "var(--dim)", lineHeight: 1.45 }}>
                    <span className="ph-faint ph-num">{fmtDateTime(v.event.at)}</span> {v.text}{v.event.simulated ? <> <DemoTag>Simulated</DemoTag></> : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </Drawer>
      <Modal open={rejecting} onClose={() => setRejecting(false)} title="Reject this invitation draft?"
        footer={<><Button onClick={() => setRejecting(false)}>Cancel</Button><Button variant="danger" icon="x" onClick={reject}>Reject draft</Button></>}>
        <div style={{ fontSize: 12.5, color: "var(--body)", lineHeight: 1.5 }}>
          Nothing is sent. {preparer} can prepare a new list from eligible invitees who are not booked.
        </div>
      </Modal>
    </>
  );
}

/* ---- prepare a draft (administrators) ---- */
export function PrepareDraft({ pid, onClose, onCreated }: { pid: ProgrammeId; onClose: () => void; onCreated: (id: string, programmeId: ProgrammeId) => void }) {
  const s = usePhState();
  const I = ix(s);
  const [programmeId, setProgrammeId] = useState<ProgrammeId>(pid);
  const prog = I.programmeById.get(programmeId)!;
  const pool = invitable(s, programmeId);
  const [title, setTitle] = useState(`${prog.clientName} screening: complete your questionnaire and choose a slot`);
  const [message, setMessage] = useState(defaultInviteMessage(prog.clientName));
  const [sel, setSel] = useState<Set<string>>(() => new Set(pool.filter((x) => x.inProgress).map((x) => x.personId)));
  const [filter, setFilter] = useState<"all" | "progress" | "not_started">("all");
  const [q, setQ] = useState("");
  const changeProgramme = (id: ProgrammeId) => {
    const np = I.programmeById.get(id)!;
    setProgrammeId(id);
    setSel(new Set(invitable(s, id).filter((x) => x.inProgress).map((x) => x.personId)));
    setTitle(`${np.clientName} screening: complete your questionnaire and choose a slot`);
    setMessage(defaultInviteMessage(np.clientName));
  };
  const shown = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return pool.filter((x) => (filter === "all" || (filter === "progress" ? x.inProgress : !x.inProgress)) && (!qq || (x.name + " " + x.personId).toLowerCase().includes(qq)));
  }, [pool, filter, q]);
  const term = healthTermIn(title + " " + message);
  const problem = !sel.size ? "Choose at least one eligible recipient." : !title.trim() || !message.trim() ? "Add a subject and a message." : term ? `Remove "${term}": invitation messages must not contain health information.` : null;
  const submit = () => {
    const r = dispatch(act.prepareInvitationDraft(programmeId, title, [...sel], message));
    if (r.ok && r.id) onCreated(r.id, programmeId);
  };
  const progressCount = pool.filter((x) => x.inProgress).length;
  return (
    <Drawer open onClose={onClose} width={640} title="Prepare an invitation draft"
      sub="Choose eligible invitees who are not booked, write a message without health information, then send the draft for approval. Nothing is sent until it is approved, and then only as a simulation."
      footer={<>
        <span className="ph-faint" style={{ fontSize: 11.5, marginRight: "auto", alignSelf: "center", maxWidth: 300, lineHeight: 1.4 }}>{problem || `${sel.size} recipients selected. The draft goes to programme oversight for approval.`}</span>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" icon="send" disabled={!!problem} title={problem || undefined} onClick={submit}>Send for approval</Button>
      </>}>
      <div className="ph-stack" style={{ gap: 14 }}>
        <Field label="Programme" htmlFor="prg-prep-prog">
          <Select id="prg-prep-prog" value={programmeId} onChange={(e) => changeProgramme(e.target.value as ProgrammeId)}>
            {PROGRAMME_ORDER.map((id) => <option key={id} value={id}>{I.programmeById.get(id)?.name}</option>)}
          </Select>
        </Field>
        <div>
          <div className="prg-label"><span className="ph-grow">Recipients: {sel.size} selected of {pool.length} eligible and not booked</span></div>
          <div className="ph-row-flex" style={{ gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            <Chip on={filter === "all"} onClick={() => setFilter("all")} count={pool.length}>All</Chip>
            <Chip on={filter === "progress"} onClick={() => setFilter("progress")} count={progressCount}>Questionnaire in progress</Chip>
            <Chip on={filter === "not_started"} onClick={() => setFilter("not_started")} count={pool.length - progressCount}>Not started</Chip>
            <span className="ph-grow" />
            <SearchBox value={q} onChange={setQ} placeholder="Search name or ID" width={190} />
          </div>
          <div className="ph-row-flex" style={{ gap: 8, marginBottom: 8 }}>
            <Button size="sm" icon="check" onClick={() => setSel((cur) => new Set([...cur, ...shown.map((x) => x.personId)]))}>Select {shown.length} shown</Button>
            <Button size="sm" variant="ghost" onClick={() => setSel((cur) => { const n = new Set(cur); shown.forEach((x) => n.delete(x.personId)); return n; })}>Clear shown</Button>
          </div>
          <div className="prg-rcp" style={{ maxHeight: 260 }}>
            {shown.map((x) => (
              <label key={x.personId} className="prg-rcp-row" style={{ cursor: "pointer" }}>
                <input type="checkbox" checked={sel.has(x.personId)} onChange={() => setSel((cur) => { const n = new Set(cur); if (n.has(x.personId)) n.delete(x.personId); else n.add(x.personId); return n; })} aria-label={`Select ${x.name}`} />
                <span className="prg-rcp-name">{x.name}</span>
                <span className="prg-id">{x.personId}</span>
                <StagePill label={x.inProgress ? "Questionnaire in progress" : "Not started"} />
              </label>
            ))}
            {!shown.length ? <div className="ph-faint" style={{ fontSize: 12, padding: 12 }}>No eligible invitee matches.</div> : null}
          </div>
        </div>
        <Field label="Subject" htmlFor="prg-prep-title">
          <TextInput id="prg-prep-title" value={title} onChange={(e) => setTitle(e.target.value)} invalid={!title.trim()} />
        </Field>
        <Field label="Message" htmlFor="prg-prep-msg" help="Plain logistics only. Words such as result, diagnosis, cholesterol or blood pressure are refused." error={term ? `Contains "${term}". Invitation messages must not contain health information.` : null}>
          <Textarea id="prg-prep-msg" rows={4} value={message} onChange={(e) => setMessage(e.target.value)} invalid={!!term} />
        </Field>
        <div>
          <div className="prg-label">Preview</div>
          <MessagePreview title={title} message={message} linkText={`Your link: portal.precisionhealth.example.invalid/i/${prog.inviteCode}`} note="Shown to recipients only after approval, as a simulated send." />
        </div>
      </div>
    </Drawer>
  );
}

/* ---- create a code (administrators) ---- */
export function CreateCode({ pid, onClose }: { pid: ProgrammeId; onClose: () => void }) {
  const s = usePhState();
  const I = ix(s);
  const t = today(s);
  const [programmeId, setProgrammeId] = useState<ProgrammeId>(pid);
  const prog = I.programmeById.get(programmeId)!;
  const [label, setLabel] = useState("");
  const [expires, setExpires] = useState(prog.windowEnd >= t ? prog.windowEnd : t);
  const [eligibility, setEligibility] = useState("");
  const [tried, setTried] = useState(false);
  const labelErr = !label.trim() ? "Give the code a label, for example the site or group it is for." : null;
  const dateErr = !/^\d{4}-\d{2}-\d{2}$/.test(expires) ? "Choose an expiry date." : expires < t ? `Choose ${fmtDate(t)} or later.` : null;
  const submit = () => {
    setTried(true);
    if (labelErr || dateErr) return;
    const r = dispatch(act.createCode(programmeId, label, expires, eligibility));
    if (r.ok) onClose();
  };
  return (
    <Modal open onClose={onClose} title="Create an invitation code" width={520}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" icon="plus" onClick={submit}>Create code</Button></>}>
      <div className="ph-stack" style={{ gap: 12 }}>
        <div className="ph-dim" style={{ fontSize: 12.5, lineHeight: 1.5 }}>
          Codes are created centrally. A code lets an eligible person start onboarding in the portal; it never reveals the employer's participant list. This creates a local record only. Nothing is sent.
        </div>
        <Field label="Programme" htmlFor="prg-code-prog">
          <Select id="prg-code-prog" value={programmeId} onChange={(e) => { const id = e.target.value as ProgrammeId; setProgrammeId(id); const np = I.programmeById.get(id)!; setExpires(np.windowEnd >= t ? np.windowEnd : t); }}>
            {PROGRAMME_ORDER.map((id) => <option key={id} value={id}>{I.programmeById.get(id)?.name}</option>)}
          </Select>
        </Field>
        <Field label="Label" htmlFor="prg-code-label" error={tried ? labelErr : null} help="Shown to administrators only.">
          <TextInput id="prg-code-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="For example: Late joiners" invalid={tried && !!labelErr} />
        </Field>
        <Field label="Expires on" htmlFor="prg-code-exp" error={tried ? dateErr : null} help={`Programme window ends ${fmtDate(prog.windowEnd)}.`}>
          <TextInput id="prg-code-exp" type="date" value={expires} min={t} onChange={(e) => setExpires(e.target.value)} invalid={tried && !!dateErr} />
        </Field>
        <Field label="Eligibility" htmlFor="prg-code-elig" help="Leave blank to use the programme rule.">
          <TextInput id="prg-code-elig" value={eligibility} onChange={(e) => setEligibility(e.target.value)} placeholder={prog.eligibility} />
        </Field>
      </div>
    </Modal>
  );
}

export function RevokeCode({ codeId, onClose }: { codeId: string; onClose: () => void }) {
  const s = usePhState();
  const code = s.invitationCodes.find((c) => c.id === codeId);
  if (!code) return null;
  const go = () => { const r = dispatch(act.revokeCode(code.id)); if (r.ok) onClose(); };
  return (
    <Modal open onClose={onClose} title={`Revoke ${code.code}?`}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="danger" icon="x" onClick={go}>Revoke code</Button></>}>
      <div className="ph-stack" style={{ gap: 8, fontSize: 12.5, color: "var(--body)", lineHeight: 1.5 }}>
        <div>The code stops working for new onboarding. People already on the roster keep their place and their bookings.</div>
        <div className="ph-dim"><Icon name="info" size={12} /> This changes a local demo record only. Nothing is sent.</div>
      </div>
    </Modal>
  );
}
