/* Work, Tasks: owner, absolute due date and time, priority, team, status and linked record for
   every task, as a table or a board. Story tasks take their status from the underlying item, so
   closing a wrapper never bypasses an identity or clinical requirement. Clinical tasks are
   visible to clinical roles only. */
import { useMemo, useState } from "react";
import { act, addDays, dublinToUtc, fmtDateTime, fmtShortDateTime, fmtWhen, staffName, storyViews, taskViews, today } from "../../model";
import type { PhState, StaffId, TaskView } from "../../model";
import { dispatch, usePersona, usePhState } from "../../store";
import { useNav } from "../../nav-context";
import { Button, Card, Chip, DataTable, EmptyState, EntityLink, Field, Icon, PageHeader, Pill, RestrictedNotice, SearchBox, Segmented, Select, TextInput } from "../../ui";
import type { Column } from "../../ui";
import {
  PRIORITY, PriorityPill, StaffCell, TEAM_NAME, Tag, TaskStatusPill, WIDE_MIN, isClinicalViewer, mergeParams, openTarget, refLabel, relDue, storyVisible,
  taskStatusRank, useMeasure, SafeDrawer as Drawer } from "./shared";

type StatusFilter = "open" | "overdue" | "blocked" | "done" | "all";
const STATUS_FILTERS: StatusFilter[] = ["open", "overdue", "blocked", "done", "all"];
const isStatusFilter = (v: string | undefined): v is StatusFilter => !!v && (STATUS_FILTERS as string[]).includes(v);
type View = "table" | "board";
type GroupBy = "team" | "status";

const dueSort = (a: TaskView, b: TaskView) => {
  const ad = a.task.dueAt || "9999", bd = b.task.dueAt || "9999";
  return ad < bd ? -1 : ad > bd ? 1 : a.task.id < b.task.id ? -1 : 1;
};
const defaultSort = (a: TaskView, b: TaskView) => {
  const da = a.status === "done" ? 1 : 0, db = b.status === "done" ? 1 : 0;
  return da !== db ? da - db : dueSort(a, b);
};

export default function Tasks() {
  const state = usePhState();
  const p = usePersona();
  const nav = useNav();
  const [measure, width] = useMeasure<HTMLDivElement>();
  const wide = width === 0 || width >= WIDE_MIN;
  const clinical = isClinicalViewer(p);

  const [view, setView] = useState<View>(nav.params.view === "board" ? "board" : "table");
  const [groupBy, setGroupBy] = useState<GroupBy>("team");
  const [status, setStatus] = useState<StatusFilter>(isStatusFilter(nav.params.status) ? nav.params.status : "open");
  const [story, setStory] = useState<string>(nav.params.story || "all");
  const [owner, setOwner] = useState<string>("all");
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);

  const all = useMemo(() => taskViews(state), [state]);
  const visible = useMemo(() => all.filter((t) => t.visible), [all]);
  const stories = storyViews(state).filter(storyVisible);
  const now = state.clock.nowUtc;

  const query = q.trim().toLowerCase();
  const base = visible.filter((t) => {
    if (story !== "all" && (story === "routine" ? !!t.task.storyId : t.task.storyId !== story)) return false;
    if (owner === "me" && t.task.ownerId !== p.id) return false;
    if (owner !== "all" && owner !== "me" && t.task.ownerId !== owner) return false;
    if (query && !`${t.title} ${t.task.id} ${t.ownerName} ${t.task.detail} ${t.task.storyId || ""}`.toLowerCase().includes(query)) return false;
    return true;
  });
  const counts: Record<StatusFilter, number> = {
    open: base.filter((t) => t.status !== "done").length,
    overdue: base.filter((t) => t.overdue).length,
    blocked: base.filter((t) => t.status === "blocked").length,
    done: base.filter((t) => t.status === "done").length,
    all: base.length,
  };
  const rows = base.filter((t) => {
    if (status === "open") return t.status !== "done";
    if (status === "overdue") return t.overdue;
    if (status === "blocked") return t.status === "blocked";
    if (status === "done") return t.status === "done";
    return true;
  }).sort(defaultSort);

  const openTask = (id: string) => nav.setParams(mergeParams(nav.params, { task: id }));
  const closeTask = () => nav.setParams(mergeParams(nav.params, { task: null }));
  const storyName = (id: string) => stories.find((s) => s.def.id === id)?.def.title || id;

  const columns: Column<TaskView>[] = [
    {
      key: "task", header: "Task", nowrap: false, sort: (a, b) => (a.task.id < b.task.id ? -1 : 1),
      cell: (t) => (
        <div style={{ minWidth: 220, maxWidth: 380 }}>
          <div style={{ color: "var(--ink)", fontWeight: 500, lineHeight: 1.35 }}>{t.title}</div>
          <div className="ph-wrap" style={{ gap: 5, marginTop: 4 }}>
            <span className="phf-id">{t.task.id}</span>
            {t.task.storyId ? <Tag mono title={storyName(t.task.storyId)}>{t.task.storyId}</Tag> : <Tag>Routine</Tag>}
            {t.task.clinical ? <Tag icon="lock" title="Visible to clinical roles only">Clinical</Tag> : null}
          </div>
        </div>
      ),
    },
    {
      key: "status", header: "Status and priority", sort: (a, b) => taskStatusRank(a) - taskStatusRank(b) || PRIORITY[a.task.priority].rank - PRIORITY[b.task.priority].rank,
      cell: (t) => <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4 }}><TaskStatusPill tv={t} /><PriorityPill p={t.task.priority} /></div>,
    },
    {
      key: "due", header: "Due", sort: dueSort,
      cell: (t) => t.task.dueAt ? (
        <div>
          <div className="ph-num" style={{ color: "var(--ink)" }}>{fmtDateTime(t.task.dueAt)}</div>
          <div className="phf-note" style={{ color: t.overdue ? "var(--bad)" : undefined }}>{t.status === "done" ? "Complete" : relDue(t.task.dueAt, now)}</div>
        </div>
      ) : <span className="ph-faint">No due date</span>,
    },
    { key: "owner", header: "Owner and team", sort: (a, b) => (a.ownerName < b.ownerName ? -1 : 1), cell: (t) => <StaffCell state={state} id={t.task.ownerId} sub={TEAM_NAME(state, t.task.team)} /> },
    {
      key: "linked", header: "Linked record", nowrap: false,
      cell: (t) => <div style={{ maxWidth: 170, lineHeight: 1.35 }}><EntityLink kind={t.task.linked.kind} id={t.task.linked.id}>{refLabel(state, t.task.linked)}</EntityLink></div>,
    },
    { key: "action", header: <span className="ph-faint">Action</span>, align: "right", cell: (t) => <TaskAction state={state} tv={t} compact /> },
  ];
  /* Narrow containers: due, owner and team move under the title, so the identifier, status and
     primary action stay visible without scrolling. The linked record is in the drawer. */
  const narrowColumns: Column<TaskView>[] = [
    {
      key: "task", header: "Task", nowrap: false,
      cell: (t) => (
        <div style={{ minWidth: 170 }}>
          <div style={{ color: "var(--ink)", fontWeight: 500, lineHeight: 1.35 }}>{t.title}</div>
          <div className="ph-wrap" style={{ gap: 5, marginTop: 4 }}>
            <span className="phf-id">{t.task.id}</span>
            {t.task.storyId ? <Tag mono title={storyName(t.task.storyId)}>{t.task.storyId}</Tag> : <Tag>Routine</Tag>}
            {t.task.clinical ? <Tag icon="lock" title="Visible to clinical roles only">Clinical</Tag> : null}
          </div>
          <div className="phf-note" style={{ marginTop: 4 }}>
            {t.task.dueAt ? <>Due <span className="ph-num" style={{ color: "var(--body)" }}>{fmtDateTime(t.task.dueAt)}</span>{t.status === "done" ? "" : <span style={{ color: t.overdue ? "var(--bad)" : undefined }}>{`, ${relDue(t.task.dueAt, now)}`}</span>}</> : "No due date"}
          </div>
          <div className="phf-note">{t.ownerName}, {TEAM_NAME(state, t.task.team)}</div>
        </div>
      ),
    },
    columns[1],
    columns[columns.length - 1],
  ];

  return (
    <div className="ph-page" ref={measure}>
      <PageHeader
        eyebrow="Work"
        title="Tasks"
        sub="Story tasks close only when their underlying item is complete, so a wrapper can never bypass an identity or clinical step. Routine tasks can be marked done here."
        actions={
          <>
            <Segmented label="Task view" value={view} onChange={setView} options={[{ id: "table", label: "Table" }, { id: "board", label: "Board" }]} />
            <Button variant="primary" icon="plus" onClick={() => setAdding(!adding)} aria-expanded={adding}>Add task</Button>
          </>
        }
      />
      <div className="ph-stack">
        {adding ? <AddTask state={state} narrow={!wide} onDone={() => setAdding(false)} /> : null}

        <section aria-label="Stories">
          <div className="phf-stories">
            {stories.map((s) => {
              const n = visible.filter((t) => t.task.storyId === s.def.id && t.status !== "done").length;
              return (
                <button key={s.def.id} type="button" className="phf-story" aria-pressed={story === s.def.id}
                  title={`${s.def.title}. Filter tasks to this story.`} onClick={() => setStory(story === s.def.id ? "all" : s.def.id)}>
                  <span className="ph-row-flex" style={{ gap: 6 }}>
                    <span className="phf-id">{s.def.id}</span>
                    <span className="ph-grow" />
                    {s.open ? <Pill tone="warn" icon="dot">Open</Pill> : <Pill tone="ok">Resolved</Pill>}
                  </span>
                  <span style={{ fontSize: 12.5, color: "var(--ink)", lineHeight: 1.35 }}>{s.headline}</span>
                  <span className="ph-grow" />
                  <span className="phf-note">{s.ownerName}</span>
                  <span className="phf-note">
                    {s.dueAt ? `Due ${fmtWhen(s.dueAt, now)}, ` : ""}{s.restricted ? "clinician owned" : `${n} open task${n === 1 ? "" : "s"}`}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <div className="phf-toolbar">
          {STATUS_FILTERS.map((f) => (
            <Chip key={f} on={status === f} count={counts[f]} onClick={() => setStatus(f)}>
              {f === "open" ? "Open" : f === "overdue" ? "Overdue" : f === "blocked" ? "Blocked" : f === "done" ? "Done" : "All"}
            </Chip>
          ))}
          <span className="phf-spacer" />
          <Select className="phf-sel" aria-label="Story" value={story} onChange={(e) => setStory(e.target.value)} style={{ maxWidth: 200 }}>
            <option value="all">All stories</option>
            {stories.map((s) => <option key={s.def.id} value={s.def.id}>{s.def.id}: {s.def.title}</option>)}
            <option value="routine">Routine work (no story)</option>
          </Select>
          <Select className="phf-sel" aria-label="Owner" value={owner} onChange={(e) => setOwner(e.target.value)} style={{ maxWidth: 170 }}>
            <option value="all">Every owner</option>
            {p.staff ? <option value="me">Assigned to me</option> : null}
            {state.staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <SearchBox value={q} onChange={setQ} placeholder="Search tasks" width={wide ? 180 : "100%"} />
        </div>

        {view === "table" ? (
          <Card pad={false}>
            <DataTable
              rows={rows}
              columns={wide ? columns : narrowColumns}
              rowKey={(t) => t.task.id}
              onRowClick={(t) => openTask(t.task.id)}
              selectedKey={nav.params.task || null}
              caption="Tasks"
              minWidth={wide ? 860 : undefined}
              footerNote={clinical ? "tasks. Story tasks show the state of their underlying item." : "tasks. Clinical tasks are visible to clinical roles only."}
              empty={<EmptyState title="No tasks match these filters" icon="filter">Change the status, story or owner filter, or clear the search.</EmptyState>}
            />
          </Card>
        ) : (
          <Board state={state} rows={rows} groupBy={groupBy} setGroupBy={setGroupBy} onOpen={openTask} clinical={clinical} />
        )}
      </div>
      {nav.params.task ? <TaskDrawer state={state} id={nav.params.task} onClose={closeTask} /> : null}
    </div>
  );
}

/* ---- primary action: "Mark done" for routine work, "Open item" for story tasks ---- */
function TaskAction({ state, tv, compact }: { state: PhState; tv: TaskView; compact?: boolean }) {
  const nav = useNav();
  if (tv.status === "done") {
    if (!compact) return <Button icon="arrow" onClick={() => nav.go(openTarget(state, tv))}>Open linked item</Button>;
    return <span className="phf-note">{tv.task.completedAt ? `${staffName(state, tv.task.completedBy)}, ${fmtShortDateTime(tv.task.completedAt)}` : "Item complete"}</span>;
  }
  if (tv.blockReason) {
    return (
      <Button size={compact ? "sm" : undefined} variant={compact ? "secondary" : "primary"} icon="arrow" title={tv.blockReason}
        onClick={(e) => { e.stopPropagation(); nav.go(openTarget(state, tv)); }}>Open item</Button>
    );
  }
  if (tv.canMarkDone) {
    return (
      <Button size={compact ? "sm" : undefined} variant={compact ? "secondary" : "primary"} icon="check"
        onClick={(e) => { e.stopPropagation(); dispatch(act.completeTask(tv.task.id)); }}>Mark done</Button>
    );
  }
  return (
    <Button size={compact ? "sm" : undefined} variant="ghost" icon="check" disabled title={`Only ${tv.ownerName} or a supervisor can mark this done.`}>Mark done</Button>
  );
}

/* ---- board ---- */
function Board({ state, rows, groupBy, setGroupBy, onOpen, clinical }: { state: PhState; rows: TaskView[]; groupBy: GroupBy; setGroupBy: (g: GroupBy) => void; onOpen: (id: string) => void; clinical: boolean }) {
  const lanes = groupBy === "team"
    ? state.teams.map((t) => ({ key: t.id, title: t.name, items: rows.filter((r) => r.task.team === t.id) }))
    : [
      { key: "overdue", title: "Overdue", items: rows.filter((r) => r.overdue && r.status === "open") },
      { key: "open", title: "Open", items: rows.filter((r) => r.status === "open" && !r.overdue) },
      { key: "blocked", title: "Blocked by another step", items: rows.filter((r) => r.status === "blocked") },
      { key: "done", title: "Done", items: rows.filter((r) => r.status === "done") },
    ].filter((l) => l.items.length > 0);
  const now = state.clock.nowUtc;
  return (
    <div className="ph-stack" style={{ gap: 10 }}>
      <div className="phf-toolbar">
        <span className="phf-small">Group by</span>
        <Segmented label="Group board by" value={groupBy} onChange={setGroupBy} options={[{ id: "team", label: "Team" }, { id: "status", label: "Status" }]} />
        <span className="phf-spacer" />
        <span className="phf-note">{clinical ? `${rows.length} task${rows.length === 1 ? "" : "s"} shown` : `${rows.length} task${rows.length === 1 ? "" : "s"} shown. Clinical tasks are visible to clinical roles only.`}</span>
      </div>
      {rows.length === 0 ? (
        <Card pad={false}><EmptyState title="No tasks match these filters" icon="filter">Change the status, story or owner filter, or clear the search.</EmptyState></Card>
      ) : (
        <div className="phf-board">
          {lanes.map((l) => (
            <div key={l.key} className="phf-lane">
              <div className="phf-lane-head">
                <span className="ph-grow ph-trunc" style={{ color: "var(--ink)", fontWeight: 500 }}>{l.title}</span>
                <span className="ph-num">{l.items.length}</span>
              </div>
              {l.items.length === 0 ? <div className="phf-note" style={{ padding: "6px 4px 8px" }}>No tasks for this team with these filters.</div> : null}
              {l.items.map((t) => (
                <button key={t.task.id} type="button" className="phf-card" onClick={() => onOpen(t.task.id)} aria-label={`${t.task.id}: ${t.title}`}>
                  <span style={{ color: "var(--ink)", fontWeight: 500, fontSize: 12.5, lineHeight: 1.35 }}>{t.title}</span>
                  <span className="ph-wrap" style={{ gap: 5 }}>
                    <TaskStatusPill tv={t} />
                    <PriorityPill p={t.task.priority} />
                    {t.task.storyId ? <Tag mono>{t.task.storyId}</Tag> : null}
                  </span>
                  <span className="phf-small">
                    {t.task.dueAt ? <>Due <span className="ph-num" style={{ color: "var(--ink)" }}>{fmtDateTime(t.task.dueAt)}</span></> : "No due date"}
                    {t.task.dueAt && t.status !== "done" ? <span style={{ color: t.overdue ? "var(--bad)" : undefined }}>{`, ${relDue(t.task.dueAt, now)}`}</span> : null}
                  </span>
                  <span className="ph-row-flex" style={{ gap: 8 }}>
                    <span className="ph-grow" style={{ minWidth: 0 }}><StaffCell state={state} id={t.task.ownerId} sub={groupBy === "status" ? TEAM_NAME(state, t.task.team) : undefined} size={20} /></span>
                    <span className="phf-id">{t.task.id}</span>
                  </span>
                  <span className="phf-note ph-trunc">Linked: {refLabel(state, t.task.linked)}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---- quick add ---- */
function duePresets(state: PhState) {
  const t = today(state);
  const now = state.clock.nowUtc;
  const tomorrow = addDays(t, 1);
  const cands = [
    { id: "t-1200", iso: dublinToUtc(t, "12:00"), when: "today" },
    { id: "t-1700", iso: dublinToUtc(t, "17:00"), when: "today" },
    { id: "n-0900", iso: dublinToUtc(tomorrow, "09:00"), when: "tomorrow" },
    { id: "n-1700", iso: dublinToUtc(tomorrow, "17:00"), when: "tomorrow" },
    { id: "w-1700", iso: dublinToUtc(addDays(t, 3), "17:00"), when: "" },
  ].filter((x) => x.iso > now);
  const out: Array<{ id: string; iso: string | null; label: string }> = cands.map((x) => ({ id: x.id, iso: x.iso, label: `${fmtDateTime(x.iso)}${x.when ? ` (${x.when})` : ""}` }));
  out.push({ id: "none", iso: null, label: "No due date" });
  return out;
}

function AddTask({ state, narrow, onDone }: { state: PhState; narrow: boolean; onDone: () => void }) {
  const p = usePersona();
  const presets = duePresets(state);
  const [title, setTitle] = useState("");
  const [owner, setOwner] = useState<string>(p.staff ? p.id : state.staff[0].id);
  const [due, setDue] = useState<string>(presets.length > 2 ? presets[1].id : presets[0].id);
  const [err, setErr] = useState<string | null>(null);
  const submit = () => {
    if (!title.trim()) { setErr("Give the task a title."); return; }
    const preset = presets.find((x) => x.id === due);
    const r = dispatch(act.addTask(title.trim(), owner as StaffId, preset ? preset.iso : null));
    if (r.ok) { setTitle(""); setErr(null); onDone(); }
  };
  return (
    <Card>
      <div className="ph-row-flex" style={{ marginBottom: 10, gap: 8 }}>
        <Icon name="plus" size={14} style={{ color: "var(--accent)" }} />
        <span className="ph-h2">Add a routine task</span>
        <span className="phf-note">Recorded in the activity log. Story work is created by the underlying item, not here.</span>
      </div>
      <form className={"phf-addform" + (narrow ? " narrow" : "")} onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <Field label="Title" error={err} htmlFor="phf-add-title">
          <TextInput id="phf-add-title" value={title} onChange={(e) => { setTitle(e.target.value); if (err) setErr(null); }} placeholder="For example, confirm room access for Thursday" invalid={!!err} />
        </Field>
        <Field label="Owner" htmlFor="phf-add-owner">
          <Select id="phf-add-owner" value={owner} onChange={(e) => setOwner(e.target.value)}>
            {state.staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label="Due" htmlFor="phf-add-due">
          <Select id="phf-add-due" value={due} onChange={(e) => setDue(e.target.value)}>
            {presets.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
          </Select>
        </Field>
        <div className="ph-row-flex" style={{ gap: 8 }}>
          <Button type="submit" variant="primary" icon="check">Add task</Button>
          <Button variant="ghost" onClick={onDone}>Cancel</Button>
        </div>
      </form>
    </Card>
  );
}

/* ---- detail drawer ---- */
function TaskDrawer({ state, id, onClose }: { state: PhState; id: string; onClose: () => void }) {
  const p = usePersona();
  const nav = useNav();
  const tv = taskViews(state).find((t) => t.task.id === id);
  if (!tv) {
    return (
      <Drawer open onClose={onClose} title="Task not found">
        <EmptyState title={`No task ${id}`}>It may have been added in another session. The task list shows every task this role can see.</EmptyState>
      </Drawer>
    );
  }
  if (!tv.visible) {
    return (
      <Drawer open onClose={onClose} title="Clinical action assigned" sub={tv.task.id}>
        <RestrictedNotice title="Clinical action assigned">
          A clinician owns this task. {p.name} ({p.roleLabel}) sees no clinical detail. The owner and the clinical team can open it.
        </RestrictedNotice>
      </Drawer>
    );
  }
  const t = tv.task;
  const sv = t.storyId ? storyViews(state).find((s) => s.def.id === t.storyId) : undefined;
  const now = state.clock.nowUtc;
  return (
    <Drawer open onClose={onClose} width={560} title={tv.title}
      sub={<span className="ph-wrap" style={{ gap: 6 }}><span className="phf-id">{t.id}</span>{t.storyId ? <Tag mono>{t.storyId}</Tag> : <Tag>Routine</Tag>}{t.clinical ? <Tag icon="lock">Clinical</Tag> : null}</span>}
      footer={<><Button variant="ghost" onClick={onClose}>Close</Button><TaskAction state={state} tv={tv} /></>}>
      <div className="ph-stack">
        <div className="ph-wrap" style={{ gap: 8 }}>
          <TaskStatusPill tv={tv} />
          <PriorityPill p={t.priority} />
          {t.dueAt && tv.status !== "done" ? <span className="phf-small" style={{ color: tv.overdue ? "var(--bad)" : undefined }}>{relDue(t.dueAt, now)}</span> : null}
        </div>
        {tv.blockReason ? (
          <div className="phf-callout warn">
            <Icon name="lock" size={15} style={{ color: "var(--warn)", marginTop: 1 }} />
            <span><span className="phf-strong">Closes with its underlying item.</span> {tv.blockReason} This task cannot be ticked off here, so no identity or clinical step is skipped.</span>
          </div>
        ) : null}
        {tv.status === "done" ? (
          <div className="phf-callout ok">
            <Icon name="check" size={15} style={{ color: "var(--ok)", marginTop: 1 }} />
            <span>{t.completedAt ? `Marked done by ${staffName(state, t.completedBy)} on ${fmtDateTime(t.completedAt)}.` : "The underlying item is complete, so this task is done."}</span>
          </div>
        ) : null}
        <dl className="phf-kv">
          <dt>Owner</dt><dd><StaffCell state={state} id={t.ownerId} sub={state.staff.find((s) => s.id === t.ownerId)?.title} /></dd>
          <dt>Team</dt><dd>{TEAM_NAME(state, t.team)}</dd>
          <dt>Due</dt><dd>{t.dueAt ? <span className="ph-num">{fmtDateTime(t.dueAt)}</span> : "No due date"}</dd>
          <dt>Created</dt><dd className="ph-num">{fmtDateTime(t.createdAt)}</dd>
          <dt>Linked record</dt><dd><EntityLink kind={t.linked.kind} id={t.linked.id}>{refLabel(state, t.linked)}</EntityLink></dd>
          <dt>What to do</dt><dd>{t.detail}</dd>
        </dl>
        {sv && storyVisible(sv) ? (
          <Card flat pad="sm">
            <div className="ph-row-flex" style={{ gap: 8, marginBottom: 6 }}>
              <span className="phf-id">{sv.def.id}</span>
              <span className="ph-grow ph-trunc" style={{ fontSize: 12.5, color: "var(--ink)", fontWeight: 500 }}>{sv.def.title}</span>
              {sv.open ? <Pill tone="warn" icon="dot">Open</Pill> : <Pill tone="ok">Resolved</Pill>}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--ink)" }}>{sv.headline}</div>
            <div className="phf-small" style={{ marginTop: 4 }}>{sv.detail}</div>
            <div className="ph-wrap" style={{ marginTop: 8, gap: 8 }}>
              <span className="phf-note">Owner {sv.ownerName}{sv.secondaryName ? `, with ${sv.secondaryName}` : ""}{sv.dueAt ? `, due ${fmtDateTime(sv.dueAt)}` : ""}</span>
              <span className="ph-grow" />
              <Button size="sm" variant="ghost" icon="arrow" onClick={() => nav.go(sv.target)}>Open story item</Button>
            </div>
          </Card>
        ) : null}
      </div>
    </Drawer>
  );
}
