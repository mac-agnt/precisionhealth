/* Programmes, Invitations: today's capacity and the invitation decision, invitation drafts,
   the central code and link inventory, participant invitation status, the questionnaire
   funnel and the message preview. Administrators (invitations.manage) create codes and
   prepare drafts; programme oversight (invitations.approve) confirms recipients and approves
   a simulated send. Deep links: ?programme=PRG-IBM-26 and ?draft=INV-IBM-01. */
import { useState } from "react";
import type { DirectoryRow, DirectoryStage, ProgrammeId } from "../../model";
import {
  PROGRAMME_ORDER, daysBetween, directory, fmtDate, fmtDateTime, fmtTime, fmtWeekdayDate, ix, plural, programmeCodes, programmeCounts, rate, storyView, today,
} from "../../model";
import { useNav } from "../../nav-context";
import { usePersona, usePhState } from "../../store";
import { Button, Card, CardHeader, Chip, DataTable, DemoTag, EntityLink, HBars, Icon, PALETTE, PageHeader, Pill, ProgressBar, SearchBox, Segmented } from "../../ui";
import type { Column } from "../../ui";
import { Note, StagePill, StaffLine } from "./common";
import { CreateCode, DraftReview, MessagePreview, PrepareDraft, RevokeCode } from "./InviteParts";
import { DRAFT_STATUS, defaultInviteMessage, draftRecipients, namesOf, programmeSessions, shortSite, stageCounts, staffWithPerm } from "./model";

const STAGE_FILTERS: Array<{ id: DirectoryStage; label: string }> = [
  { id: "all", label: "All" },
  { id: "invited", label: "Not started" },
  { id: "onboarding", label: "Questionnaire in progress" },
  { id: "upcoming", label: "Booked" },
  { id: "attended", label: "Attended" },
];

function CapacityCallout({ pid }: { pid: ProgrammeId }) {
  const s = usePhState();
  const I = ix(s);
  const t = today(s);
  const sess = programmeSessions(s, pid);
  const todays = sess.find((x) => x.isToday);
  const next = sess.find((x) => x.session.date > t);
  const c = programmeCounts(s, pid);
  const ibmStory = pid === "PRG-IBM-26" ? storyView(s, "ST-03") : null;
  const focus = todays || next;
  return (
    <Card>
      <div className="ph-row-flex" style={{ alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
        <div className="ph-grow" style={{ minWidth: 240 }}>
          <div className="ph-row-flex" style={{ gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
            {ibmStory ? <Pill tone={ibmStory.open ? "info" : "ok"} icon={ibmStory.open ? "flag" : "check"}>{ibmStory.open ? `${ibmStory.def.id}, decision open` : `${ibmStory.def.id}, decision recorded`}</Pill> : null}
            {focus ? <span className="ph-faint" style={{ fontSize: 11.5 }}>{todays ? "Clinic today" : `Next clinic ${fmtWeekdayDate(focus.session.date)}`}: {shortSite(focus.session)}</span> : null}
          </div>
          <h3 className="prg-title">{ibmStory ? ibmStory.headline : focus ? `${focus.available} available slots ${todays ? "today" : "at the next clinic"}` : "No upcoming clinics"}</h3>
          <div className="prg-sub">
            {ibmStory ? ibmStory.detail : focus ? `${focus.booked} of ${focus.slots} booked (${rate(focus.booked, focus.slots)}). ${c.drafts} invitee${c.drafts === 1 ? "" : "s"} with a questionnaire in progress; an in-progress questionnaire is not a booking.` : "The programme has no clinics left in its window."}
          </div>
        </div>
        {focus ? (
          <div style={{ width: 220, maxWidth: "100%" }}>
            <div className="ph-row-flex" style={{ fontSize: 12, marginBottom: 6 }}>
              <span className="ph-grow ph-dim">Available capacity</span>
              <span className="ph-num" style={{ color: "var(--ink)", fontWeight: 600 }}>{focus.available} of {focus.slots}</span>
            </div>
            <ProgressBar value={focus.booked} max={focus.slots} label={`${focus.booked} of ${focus.slots} booked`} />
            <div className="ph-faint" style={{ fontSize: 11, marginTop: 6 }}>{focus.booked} booked. <EntityLink kind="session" id={focus.session.id}>Open clinic</EntityLink></div>
          </div>
        ) : null}
      </div>
      {ibmStory ? (
        <div className="prg-owners" style={{ marginTop: 14, maxWidth: 520 }}>
          <StaffLine staff={I.staffById.get(ibmStory.def.ownerId)} role={`Capacity decision${ibmStory.open && ibmStory.dueAt ? `, due ${fmtTime(ibmStory.dueAt)}` : ""}`} compact />
          <StaffLine staff={ibmStory.def.secondaryOwnerId ? I.staffById.get(ibmStory.def.secondaryOwnerId) : undefined} role="Invitation preparation" compact />
        </div>
      ) : null}
    </Card>
  );
}

export default function Invitations() {
  const s = usePhState();
  const nav = useNav();
  const p = usePersona();
  const I = ix(s);
  const canManage = p.perms.has("invitations.manage");
  const canApprove = p.perms.has("invitations.approve");
  const managers = namesOf(staffWithPerm(s, "invitations.manage"));
  const approvers = namesOf(staffWithPerm(s, "invitations.approve"));

  const draftParam = s.invitationDrafts.find((d) => d.id === nav.params.draft) || null;
  const pendingProg = s.invitationDrafts.find((d) => d.status === "pending_approval")?.programmeId;
  // An open draft decides the programme, so the drawer and the page always agree.
  const pid: ProgrammeId = draftParam?.programmeId || PROGRAMME_ORDER.find((id) => id === nav.params.programme) || pendingProg || PROGRAMME_ORDER[0];
  const prog = I.programmeById.get(pid)!;

  const [stage, setStage] = useState<DirectoryStage>("all");
  const [q, setQ] = useState("");
  const [modal, setModal] = useState<null | { kind: "create" } | { kind: "prepare" } | { kind: "revoke"; id: string }>(null);

  const setProgramme = (id: ProgrammeId) => { nav.setParams({ programme: id }); setStage("all"); setQ(""); };
  const openDraft = (id: string) => nav.setParams({ programme: pid, draft: id });
  const closeDraft = () => nav.setParams({ programme: pid });

  const c = programmeCounts(s, pid);
  const st = stageCounts(s, pid);
  const drafts = s.invitationDrafts.filter((d) => d.programmeId === pid).slice().reverse();
  const codes = programmeCodes(s, pid);
  const rows = directory(s, { programmeId: pid, stage, q });
  const inProgress = s.memberships.filter((m) => m.programmeId === pid && m.stage === "onboarding");
  const previewDraft = drafts.find((d) => d.status === "pending_approval") || drafts[0];
  const portalPerson = s.session.portalPersonId;
  const codeById = (id: string | null) => (id ? s.invitationCodes.find((x) => x.id === id) : undefined);

  const roleText = canApprove
    ? `You can create and revoke codes, prepare invitation drafts, and confirm recipients to approve a simulated send.`
    : canManage
      ? `You can create and revoke codes and prepare invitation drafts. Sends are approved by ${approvers} after confirming every recipient.`
      : `Read only for ${p.name} (${p.roleLabel}). Codes and drafts are managed by administrators (${managers}); sends are approved by ${approvers}.`;

  const personCols: Column<DirectoryRow>[] = [
    {
      key: "who", header: "Participant", cell: (r) => (
        <>
          <EntityLink kind="person" id={r.person.id}>{r.person.given} {r.person.family}</EntityLink>
          <span className="prg-cell-sub prg-mono">{r.person.id}</span>
        </>
      ),
      sort: (a, b) => (a.person.family + a.person.given).localeCompare(b.person.family + b.person.given),
    },
    {
      key: "status", header: "Status and code", cell: (r) => (
        <>
          <StagePill label={r.stageLabel} />
          <span className="prg-cell-sub prg-mono">{codeById(r.membership.inviteCodeId)?.code || "No code"}</span>
        </>
      ),
    },
    {
      key: "q", header: "Questionnaire and appointment", nowrap: false, cell: (r) => {
        const m = r.membership;
        const body = m.questionnaire === "complete"
          ? <>Complete, consent {m.consentVersion || "given"}<span className="prg-cell-sub">{r.nextWhen ? `Booked ${r.nextWhen}` : r.stage === "attended" ? "Attended" : "No upcoming appointment"}</span></>
          : m.questionnaire === "draft" && m.draft
            ? <>In progress<span className="prg-cell-sub">{m.draft.sectionsDone} of {m.draft.sectionsTotal} sections, not a booking</span></>
            : <>Not started<span className="prg-cell-sub">Invited {fmtDate(m.invitedAt)}</span></>;
        return <div style={{ minWidth: 130, lineHeight: 1.35 }}>{body}</div>;
      },
    },
  ];

  const funnel = [
    { key: "all", label: "Invited", value: c.invited, sub: "Eligible people on the roster" },
    { key: "invited", label: "Not started", value: c.notStarted, sub: `${rate(c.notStarted, c.invited)} of ${c.invited} invited` },
    { key: "onboarding", label: "Questionnaire in progress", value: c.drafts, sub: `${rate(c.drafts, c.invited)} of ${c.invited} invited. Not bookings` },
    { key: "upcoming", label: "Booked", value: c.booked, sub: `${rate(c.booked, c.invited)} of ${c.invited} invited, including attended` },
    { key: "attended", label: "Attended", value: c.attended, sub: `${rate(c.attended, c.booked)} of ${c.booked} booked` },
  ];

  return (
    <div className="ph-page prg-page">
      <PageHeader
        title="Invitations"
        sub="Programme codes and links, participant invitation status, the questionnaire funnel and invitation drafts. Codes are managed centrally and sending is simulated: the approver confirms every recipient first."
        actions={<>
          <DemoTag>Sending is simulated</DemoTag>
          <Button icon="plus" disabled={!canManage} title={canManage ? undefined : `Only administrators (${managers}) create codes`} onClick={() => setModal({ kind: "create" })}>Create code</Button>
          <Button variant="primary" icon="mail" disabled={!canManage} title={canManage ? undefined : `Only administrators (${managers}) prepare drafts`} onClick={() => setModal({ kind: "prepare" })}>Prepare invitation draft</Button>
        </>}
      />
      <div className="prg-cq">
        <div className="ph-row-flex" style={{ gap: 12, flexWrap: "wrap" }}>
          <Segmented<ProgrammeId> label="Programme" value={pid} onChange={setProgramme}
            options={PROGRAMME_ORDER.map((id) => {
              const pend = s.invitationDrafts.filter((d) => d.programmeId === id && d.status === "pending_approval").length;
              return { id, label: <>{I.programmeById.get(id)?.clientName}{pend ? <span className="ph-num" style={{ marginLeft: 6, color: "var(--accent)" }}>{pend}</span> : null}</> };
            })} />
          <div className="prg-permline ph-grow" data-can={canManage || canApprove ? "1" : "0"} style={{ minWidth: 240 }}>
            <Icon name={canManage || canApprove ? "shield" : "lock"} size={13} />
            <span>{roleText}</span>
          </div>
        </div>
        <CapacityCallout pid={pid} />
        <div className="prg-split">
          <div>
            <Card>
              <CardHeader title="Invitation drafts" sub={`Prepared by administrators, approved by programme oversight. ${prog.name}.`} />
              <div className="ph-stack" style={{ gap: 10 }}>
                {drafts.map((d) => {
                  const rec = draftRecipients(s, d);
                  const prog2 = rec.filter((r) => r.inProgress).length;
                  const pending = d.status === "pending_approval" || d.status === "draft";
                  return (
                    <div key={d.id} className="prg-draft" data-open={draftParam?.id === d.id ? "1" : "0"}>
                      <div className="ph-row-flex" style={{ gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
                        <Icon name="mail" size={14} style={{ color: "var(--faint)", marginTop: 2 }} />
                        <div className="ph-grow" style={{ minWidth: 200 }}>
                          <div style={{ fontSize: 13, color: "var(--ink)", fontWeight: 500, lineHeight: 1.35 }}>{d.title}</div>
                          <div className="ph-faint" style={{ fontSize: 11.5, marginTop: 3, lineHeight: 1.45 }}>
                            <span className="prg-mono">{d.id}</span>, prepared by {I.staffById.get(d.preparedBy)?.name}, {fmtDateTime(d.preparedAt)}. {d.recipientIds.length} recipients: {prog2} in progress, {d.recipientIds.length - prog2} not started.
                          </div>
                        </div>
                        <Pill tone={DRAFT_STATUS[d.status].tone} icon={d.status === "approved_simulated_sent" ? "check" : d.status === "rejected" ? "x" : "clock"}>{DRAFT_STATUS[d.status].label}</Pill>
                      </div>
                      <div className="prg-draft-msg">{d.message}</div>
                      {d.decidedAt ? (
                        <div className="ph-dim" style={{ fontSize: 12 }}>
                          {d.status === "approved_simulated_sent" ? "Approved" : "Rejected"} by {I.staffById.get(d.decidedBy || "")?.name || d.decidedBy}, {fmtDateTime(d.decidedAt)}.
                          {d.status === "approved_simulated_sent" ? ` Simulated send to ${d.recipientIds.length} recipients. Bookings are unchanged until invitees complete the questionnaire.` : " Nothing was sent."}
                        </div>
                      ) : null}
                      <div className="ph-wrap">
                        {pending && canApprove
                          ? <Button size="sm" variant="primary" icon="check" onClick={() => openDraft(d.id)}>Confirm recipients and decide</Button>
                          : <Button size="sm" icon="eye" onClick={() => openDraft(d.id)}>Review draft</Button>}
                        {pending && !canApprove ? <span className="ph-faint" style={{ fontSize: 11.5 }}>Awaiting {approvers}.</span> : null}
                      </div>
                    </div>
                  );
                })}
                {!drafts.length ? (
                  <div className="ph-dim" style={{ fontSize: 12.5, lineHeight: 1.5 }}>
                    No invitation drafts for {prog.name}. {canManage ? "Prepare one from eligible invitees who are not booked." : `Administrators (${managers}) prepare drafts.`}
                  </div>
                ) : null}
              </div>
            </Card>
            <Card pad={false}>
              <div style={{ padding: "14px 16px 12px" }}>
                <h3 className="ph-h2">Codes and links</h3>
                <div className="ph-dim" style={{ fontSize: 12, marginTop: 3, lineHeight: 1.45 }}>
                  {plural(codes.length, "code")} for {prog.name}: {codes.filter((x) => x.code.status === "active" && !x.expired).length} active, {codes.filter((x) => x.expired && x.code.status !== "revoked").length} expired, {codes.filter((x) => x.code.status === "revoked").length} revoked. Links are fictional and lead nowhere.
                </div>
              </div>
              <ul className="prg-codes" aria-label="Invitation codes">
                {codes.map((r) => {
                  const left = daysBetween(today(s), r.code.expiresOn);
                  const live = r.code.status === "active" && !r.expired;
                  return (
                    <li key={r.code.id} className="prg-coderow">
                      <div className="ph-row-flex" style={{ gap: 8, flexWrap: "wrap" }}>
                        <span className="prg-mono" style={{ color: "var(--ink)", fontSize: 12.5, overflowWrap: "anywhere" }}>{r.code.code}</span>
                        {r.code.status === "revoked" ? <Pill tone="bad" icon="x">Revoked</Pill> : r.expired ? <Pill tone="neutral" icon="clock">Expired</Pill> : <Pill tone="ok" icon="check">Active</Pill>}
                        <span className="ph-grow" />
                        {live
                          ? <Button size="sm" variant="ghost" icon="x" disabled={!canManage} title={canManage ? `Revoke ${r.code.code}` : `Only administrators (${managers}) can revoke codes`} onClick={() => setModal({ kind: "revoke", id: r.code.id })}>Revoke</Button>
                          : null}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--body)", marginTop: 4, lineHeight: 1.45 }}>{r.code.label}. <span className="ph-dim">Eligibility: {r.code.eligibility}</span></div>
                      <div className="prg-codemeta">
                        <span>{r.code.status === "revoked" ? `Revoked, was due to expire ${fmtDate(r.code.expiresOn)}` : left < 0 ? `Expired ${fmtDate(r.code.expiresOn)}` : `Expires ${fmtDate(r.code.expiresOn)}, ${left === 0 ? "today" : `${left} day${left === 1 ? "" : "s"} left`}`}</span>
                        <span title="People on the roster who joined with this code, how many completed the questionnaire and consent, and how many booked">{r.issued} on roster, {r.completed} completed, {r.booked} booked</span>
                        <span>Created by {I.staffById.get(r.code.createdBy)?.name || r.code.createdBy}, {fmtDate(r.code.createdAt)}</span>
                        <span className="ph-faint" style={{ overflowWrap: "anywhere" }}>{r.code.linkText} (fictional link)</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
            <Card pad={false}>
              <div className="ph-row-flex" style={{ padding: "14px 16px 10px", flexWrap: "wrap", gap: 10 }}>
                <div className="ph-grow" style={{ minWidth: 220 }}>
                  <h3 className="ph-h2">Participant invitation status</h3>
                  <div className="ph-dim" style={{ fontSize: 12, marginTop: 3 }}>{rows.length} of {st.all} invitees. Minimal identity only; no clinical information.</div>
                </div>
                <SearchBox value={q} onChange={setQ} placeholder="Search name or ID" width={220} />
              </div>
              <div className="ph-wrap" style={{ padding: "0 16px 12px" }}>
                {STAGE_FILTERS.map((f) => (
                  <Chip key={f.id} on={stage === f.id} onClick={() => setStage(f.id)} count={f.id === "all" ? st.all : f.id === "invited" ? st.invited : f.id === "onboarding" ? st.onboarding : f.id === "upcoming" ? st.upcoming : st.attended}>{f.label}</Chip>
                ))}
              </div>
              <div style={{ borderTop: "1px solid var(--border)" }}>
                <DataTable rows={rows} columns={personCols} rowKey={(r) => r.person.id} pageSize={12} caption="Participant invitation status"
                  empty={<div className="ph-faint" style={{ padding: 18, fontSize: 12.5 }}>No invitee matches this filter.</div>}
                  footerNote={stage === "upcoming" ? "Booked here means a confirmed appointment still to attend." : undefined} />
              </div>
            </Card>
          </div>
          <div>
            <Card>
              <CardHeader title="Invitation funnel" sub={`${prog.name}. Select a step to filter the invitee list.`} />
              <HBars rows={funnel.map((f, i) => ({ ...f, color: i === 0 ? PALETTE[1] : f.key === "onboarding" ? "var(--warn)" : PALETTE[0] }))} max={c.invited}
                onSelect={(k) => setStage(k as DirectoryStage)} />
              <div className="ph-faint" style={{ fontSize: 11.5, marginTop: 10, lineHeight: 1.5 }}>
                {c.invited} invited = {c.notStarted} not started + {c.drafts} in progress + {c.invited - c.notStarted - c.drafts} booked. Selecting Booked lists people with an appointment still to attend.
              </div>
            </Card>
            <Card>
              <CardHeader title="Questionnaires in progress" sub="Saved drafts, not bookings. A confirmed appointment needs a complete questionnaire and consent." />
              <div className="ph-stack" style={{ gap: 10 }}>
                {inProgress.map((m) => {
                  const per = I.personById.get(m.personId)!;
                  const done = m.draft?.sectionsDone || 0, tot = m.draft?.sectionsTotal || 5;
                  return (
                    <div key={m.personId}>
                      <div className="ph-row-flex" style={{ gap: 8, fontSize: 12.5 }}>
                        <span className="ph-grow" style={{ minWidth: 0 }}><EntityLink kind="person" id={per.id}>{per.given} {per.family}</EntityLink> <span className="prg-id">{per.id}</span></span>
                        <span className="ph-num ph-dim" style={{ fontSize: 11.5 }}>{done} of {tot}</span>
                      </div>
                      <div style={{ marginTop: 5 }}><ProgressBar value={done} max={tot} label={`${per.given} ${per.family}: ${done} of ${tot} sections`} /></div>
                      {per.id === portalPerson ? (
                        <div className="ph-row-flex" style={{ gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                          <span className="ph-faint" style={{ fontSize: 11.5 }}>Portal onboarding demo participant.</span>
                          <Button size="sm" variant="ghost" icon="user" onClick={() => nav.openPortal(per.id)}>Open portal preview</Button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                {!inProgress.length ? <div className="ph-faint" style={{ fontSize: 12 }}>No questionnaires in progress for this programme.</div> : null}
              </div>
            </Card>
            <Card>
              <CardHeader title="Message preview" sub={previewDraft ? `${previewDraft.id}, ${DRAFT_STATUS[previewDraft.status].label.toLowerCase()}.` : "Standard invitation wording for this programme."} />
              <MessagePreview title={previewDraft ? previewDraft.title : `${prog.clientName} screening: complete your questionnaire and choose a slot`}
                message={previewDraft ? previewDraft.message : defaultInviteMessage(prog.clientName)}
                linkText={`Your link: portal.precisionhealth.example.invalid/i/${prog.inviteCode}`} />
            </Card>
            <Card>
              <CardHeader title="How invitations work" />
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "var(--body)", lineHeight: 1.6, display: "flex", flexDirection: "column", gap: 4 }}>
                <li>Codes and links are created and revoked centrally by administrators.</li>
                <li>A code lets an eligible person start onboarding. Completing an invitation never reveals the employer's participant list.</li>
                <li>Drafts need approval by programme oversight, who confirms every recipient before a simulated send.</li>
                <li>Messages carry logistics only, never health information.</li>
              </ul>
              <div style={{ marginTop: 10 }}><Note tone="neutral" icon="info">No message leaves this demo. Every send is recorded as simulated.</Note></div>
            </Card>
          </div>
        </div>
      </div>
      {draftParam ? <DraftReview key={draftParam.id} draft={draftParam} onClose={closeDraft} /> : null}
      {modal?.kind === "create" ? <CreateCode pid={pid} onClose={() => setModal(null)} /> : null}
      {modal?.kind === "prepare" ? <PrepareDraft pid={pid} onClose={() => setModal(null)} onCreated={(id, programmeId) => { setModal(null); nav.setParams({ programme: programmeId, draft: id }); }} /> : null}
      {modal?.kind === "revoke" ? <RevokeCode codeId={modal.id} onClose={() => setModal(null)} /> : null}
    </div>
  );
}
