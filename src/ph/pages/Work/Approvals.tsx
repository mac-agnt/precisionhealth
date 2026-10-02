/* Work, Approvals: clinician report release, employer report sign-off, invitation preparation and
   form-template publication. Each shows its type, requester, reviewer and prerequisite checklist
   and opens the actual underlying item. Decisions are made there, never with a generic approve
   button here. Report releases are visible to clinical roles only. */
import { useMemo, useState } from "react";
import { approvalViews, canViewEpisodeClinical, fmtAge, fmtDateTime, hoursBetween, linkFor, reviewQueue, staffName } from "../../model";
import type { ApprovalType, ApprovalView, PhState, ReviewItem } from "../../model";
import { usePersona, usePhState } from "../../store";
import { useNav } from "../../nav-context";
import { Button, Card, CardHeader, Checklist, Chip, DataTable, EmptyState, Icon, PageHeader, Pill, ProgressBar, Segmented, Drawer } from "../../ui";
import type { Column, GlyphName } from "../../ui";
import { StaffCell, Tag, WIDE_MIN, isClinicalViewer, mergeParams, useMeasure } from "./shared";

const TYPE: Record<ApprovalType, { label: string; icon: GlyphName; open: string; where: string }> = {
  report_release: { label: "Clinician report release", icon: "file", open: "Open the episode in Review", where: "Results, Review" },
  employer_report: { label: "Employer report sign-off", icon: "chart", open: "Open the report in Report Builder", where: "Reporting, Report Builder" },
  invitation_prep: { label: "Invitation preparation", icon: "send", open: "Open the draft in Invitations", where: "Programmes, Invitations" },
  form_publication: { label: "Form template publication", icon: "layers", open: "Open the template in Forms & Templates", where: "Programmes, Forms & Templates" },
};
const TYPE_ORDER: ApprovalType[] = ["report_release", "employer_report", "invitation_prep", "form_publication"];
type StatusFilter = "pending" | "decided" | "all";

const doneCount = (a: ApprovalView) => a.checklist.filter((c) => c.done).length;
const requesterName = (state: PhState, a: ApprovalView) => (a.requestedBy === "system" ? "Pulse review queue" : staffName(state, a.requestedBy));

function StatusPill({ a }: { a: ApprovalView }) {
  if (a.status === "approved") return <Pill tone="ok">Approved</Pill>;
  if (a.status === "rejected") return <Pill tone="neutral" icon="x">Rejected</Pill>;
  return <Pill tone="warn" icon="clock">Pending</Pill>;
}

/** Routine, review required and aged markers for a report release, from the review queue. */
function ReleaseTags({ item }: { item: ReviewItem | undefined }) {
  if (!item) return null;
  return (
    <>
      {item.flagged ? <Tag icon="flag" title={item.flags.map((f) => f.text).join("; ")}>Review required</Tag> : item.routine ? <Tag>Routine eligible</Tag> : <Tag>Individual review</Tag>}
      {item.aged ? <Tag icon="clock" title="Waiting more than 48 hours. Part of the ready queue, not an extra queue.">Over 48 hours</Tag> : null}
    </>
  );
}

export default function Approvals() {
  const state = usePhState();
  const p = usePersona();
  const nav = useNav();
  const [measure, width] = useMeasure<HTMLDivElement>();
  const wide = width === 0 || width >= WIDE_MIN;
  const clinical = isClinicalViewer(p);
  const [type, setType] = useState<"all" | ApprovalType>("all");
  const [status, setStatus] = useState<StatusFilter>("pending");

  const all = useMemo(() => approvalViews(state).filter((a) => a.visible), [state]);
  // Capture roles see clinical detail for their own sessions only, as everywhere else in the model.
  const queue = useMemo(() => new Map(reviewQueue(state).filter((i) => canViewEpisodeClinical(state, i.episode.id)).map((i) => [i.episode.id, i])), [state]);
  const byStatus = all.filter((a) => (status === "pending" ? a.status === "pending" : status === "decided" ? a.status !== "pending" : true));
  const typeCounts = (t: ApprovalType) => byStatus.filter((a) => a.type === t).length;
  const rows = byStatus.filter((a) => type === "all" || a.type === type).sort((a, b) => {
    if ((a.status === "pending") !== (b.status === "pending")) return a.status === "pending" ? -1 : 1;
    return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : 1;
  });
  const pending = all.filter((a) => a.status === "pending").length;
  const decided = all.length - pending;

  const paramId = nav.params.approval;
  const selected = (paramId && all.find((a) => a.id === paramId)) || (wide ? rows[0] : undefined);
  const select = (id: string) => nav.setParams(mergeParams(nav.params, { approval: id }));
  const close = () => nav.setParams(mergeParams(nav.params, { approval: null }));
  const missing = !!paramId && !all.some((a) => a.id === paramId);

  const columns: Column<ApprovalView>[] = [
    {
      key: "approval", header: "Approval", nowrap: false, sort: (a, b) => (a.createdAt < b.createdAt ? -1 : 1),
      cell: (a) => {
        const item = a.type === "report_release" ? queue.get(a.target.id) : undefined;
        return (
          <div style={{ minWidth: 200 }}>
            <div style={{ color: "var(--ink)", fontWeight: 500, lineHeight: 1.35 }}>
              {a.title}{item ? <span className="ph-dim" style={{ fontWeight: 400 }}>{`, ${item.person.given} ${item.person.family}`}</span> : null}
            </div>
            <div className="ph-wrap" style={{ gap: 5, marginTop: 4 }}>
              <Tag icon={TYPE[a.type].icon}>{TYPE[a.type].label}</Tag>
              <ReleaseTags item={item} />
            </div>
            <div className="phf-note" style={{ marginTop: 4 }}>
              Since <span className="ph-num">{fmtDateTime(a.createdAt)}</span>{a.status === "pending" ? `, ${fmtAge(Math.max(0, hoursBetween(a.createdAt, state.clock.nowUtc)))} waiting` : ""}
            </div>
          </div>
        );
      },
    },
    {
      key: "people", header: "Requester and reviewer",
      cell: (a) => (
        <div style={{ lineHeight: 1.4 }}>
          <div className="phf-small">From <span style={{ color: "var(--ink)" }}>{requesterName(state, a)}</span></div>
          <div className="phf-small">Reviewer <span style={{ color: "var(--ink)" }}>{staffName(state, a.reviewerId)}</span></div>
        </div>
      ),
    },
    {
      key: "prereq", header: "Prerequisites", sort: (a, b) => doneCount(a) / a.checklist.length - doneCount(b) / b.checklist.length,
      cell: (a) => (
        <div style={{ width: 96 }}>
          <div className="ph-num phf-small" style={{ marginBottom: 4 }}><span style={{ color: "var(--ink)" }}>{doneCount(a)}</span> of {a.checklist.length} met</div>
          <ProgressBar value={doneCount(a)} max={a.checklist.length} tone={doneCount(a) === a.checklist.length ? "ok" : "brand"} label={`${doneCount(a)} of ${a.checklist.length} prerequisites met`} />
        </div>
      ),
    },
    { key: "status", header: "Status", cell: (a) => <StatusPill a={a} /> },
  ];
  /* Narrow containers: requester, reviewer and prerequisites move under the title and status, so
     the identifier, status and the link to the underlying item stay visible without scrolling. */
  const narrowColumns: Column<ApprovalView>[] = [
    {
      ...columns[0],
      cell: (a) => (
        <div style={{ minWidth: 170 }}>
          {columns[0].cell(a)}
          <div className="phf-note">From {requesterName(state, a)}, reviewer {staffName(state, a.reviewerId)}</div>
        </div>
      ),
    },
    {
      key: "status", header: "Status",
      cell: (a) => <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4 }}><StatusPill a={a} /><span className="phf-note ph-num">{doneCount(a)} of {a.checklist.length} met</span></div>,
    },
    { key: "open", header: <span className="ph-faint">Item</span>, align: "right", cell: (a) => <Button size="sm" icon="arrow" onClick={(e) => { e.stopPropagation(); nav.go(linkFor(a.target.kind, a.target.id)); }}>Open</Button> },
  ];

  const table = (
    <Card pad={false}>
      <DataTable
        rows={rows}
        columns={wide ? columns : narrowColumns}
        rowKey={(a) => a.id}
        onRowClick={(a) => select(a.id)}
        selectedKey={selected?.id || null}
        caption="Approvals"
        footerNote={status === "decided" ? "approvals. Report releases leave this list once released, and the release is in Activity." : "approvals, oldest first."}
        empty={
          <EmptyState title={status === "pending" ? "Nothing is waiting for approval" : "No decided approvals yet"} icon="check">
            {status === "pending" ? "Every approval has been decided on its underlying screen." : "Decisions made on the underlying screens appear here."}
          </EmptyState>
        }
      />
    </Card>
  );

  return (
    <div className="ph-page" ref={measure}>
      <PageHeader
        eyebrow="Work"
        title="Approvals"
        sub="Each approval lists its prerequisites and opens the item it concerns. The decision is made there, after the checks, never with a shortcut here."
      />
      <div className="ph-stack">
        <div className="phf-toolbar">
          <Segmented label="Approval status" value={status} onChange={setStatus}
            options={[{ id: "pending", label: "Pending", count: pending }, { id: "decided", label: "Decided", count: decided }, { id: "all", label: "All", count: all.length }]} />
          <span className="phf-spacer" />
          <Chip on={type === "all"} count={byStatus.length} onClick={() => setType("all")}>All types</Chip>
          {TYPE_ORDER.filter((t) => t !== "report_release" || clinical).map((t) => (
            <Chip key={t} on={type === t} count={typeCounts(t)} onClick={() => setType(t)}>{TYPE[t].label}</Chip>
          ))}
        </div>
        {!clinical ? <div className="phf-note"><Icon name="lock" size={11} style={{ verticalAlign: "-1px", marginRight: 5 }} />Clinician report releases are visible to clinical roles only.</div> : null}
        {missing ? <div className="phf-callout"><Icon name="info" size={15} style={{ color: "var(--dim)", marginTop: 1 }} /><span>Approval {paramId} is not in this list for {p.name}. It may have been decided already, or it belongs to a clinical role.</span></div> : null}

        {wide ? (
          <div className="ph-split">
            <div className="ph-stack">{table}</div>
            <div className="ph-stack">
              {selected ? <ApprovalDetail state={state} a={selected} item={queue.get(selected.target.id)} /> : (
                <Card pad={false}><EmptyState title="Select an approval" icon="list">Its prerequisites and the link to the underlying item appear here.</EmptyState></Card>
              )}
            </div>
          </div>
        ) : table}
      </div>
      {!wide && selected ? (
        <Drawer open onClose={close} title={selected.title} sub={TYPE[selected.type].label}>
          <ApprovalDetail state={state} a={selected} item={queue.get(selected.target.id)} bare />
        </Drawer>
      ) : null}
    </div>
  );
}

function ApprovalDetail({ state, a, item, bare }: { state: PhState; a: ApprovalView; item?: ReviewItem; bare?: boolean }) {
  const p = usePersona();
  const nav = useNav();
  const stored = state.approvals.find((x) => x.id === a.id);
  const met = doneCount(a);
  const body = (
    <div className="ph-stack" style={{ gap: 12 }}>
      {item ? (
        <div className="ph-wrap" style={{ gap: 6 }}>
          <span className="phf-small">For <span style={{ color: "var(--ink)" }}>{item.person.given} {item.person.family}</span> ({item.person.id}), {item.programme.clientName}</span>
          <ReleaseTags item={item} />
        </div>
      ) : null}
      <dl className="phf-kv">
        <dt>Type</dt><dd>{TYPE[a.type].label}</dd>
        <dt>Requested by</dt><dd>{a.requestedBy === "system" ? "Pulse review queue (ready for review)" : <StaffCell state={state} id={a.requestedBy} size={20} />}</dd>
        <dt>Reviewer</dt><dd><StaffCell state={state} id={a.reviewerId} size={20} /></dd>
        <dt>Waiting since</dt><dd className="ph-num">{fmtDateTime(a.createdAt)}</dd>
        {stored && stored.decidedAt ? (<><dt>Decided</dt><dd>{`${a.status === "approved" ? "Approved" : "Rejected"} by ${staffName(state, stored.decidedBy)}, ${fmtDateTime(stored.decidedAt)}`}</dd></>) : null}
        <dt>Decided in</dt><dd>{TYPE[a.type].where}</dd>
      </dl>
      <div>
        <div className="phf-sectiontitle">Prerequisites, {met} of {a.checklist.length} met</div>
        <Checklist items={a.checklist.map((c) => ({ label: c.label, done: c.done }))} />
      </div>
      <div className="phf-callout">
        <Icon name={a.status === "pending" ? (a.canDecide ? "shield" : "lock") : "check"} size={15} style={{ color: "var(--dim)", marginTop: 1 }} />
        <span>
          {a.status !== "pending"
            ? "This approval is decided. Open the item to see its history."
            : a.canDecide
              ? `${p.name} can decide this on the underlying screen once every prerequisite is met.`
              : `Reviewer: ${staffName(state, a.reviewerId)}. ${p.name} (${p.roleLabel}) can open the item but cannot decide it.`}
        </span>
      </div>
      <div>
        <Button variant="primary" icon="arrow" onClick={() => nav.go(linkFor(a.target.kind, a.target.id))}>{TYPE[a.type].open}</Button>
      </div>
    </div>
  );
  if (bare) return body;
  return (
    <Card>
      <CardHeader eyebrow={TYPE[a.type].label} title={a.title} sub={<span className="phf-id">{a.id}</span>} right={<StatusPill a={a} />} />
      {body}
    </Card>
  );
}
