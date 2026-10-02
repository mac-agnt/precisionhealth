/* Activity: Everything, People, Agents and Needs Attention, all read from the one append-only
   activity store with the same event IDs. Clinical events are hidden or shown as a public
   summary for roles that cannot see clinical work. Resolved stories leave Needs Attention while
   their events stay in Everything. */
import { useMemo, useState } from "react";
import { PROGRAMME_BY_ID, PROGRAMME_ORDER, activityFeed, attentionTasks, fmtDateTime, fmtWhen } from "../../model";
import type { ActivityEvent, ActivityView, PhState, ProgrammeId, StoryView, TaskView } from "../../model";
import { usePersona, usePhState } from "../../store";
import { useNav } from "../../nav-context";
import { Avatar, Button, Card, CardHeader, Chip, DemoTag, EmptyState, Icon, PageHeader, Pill, SearchBox, Segmented, Select } from "../../ui";
import { KIND_LABEL, StaffCell, StaffOnly, TaskStatusPill, WIDE_MIN, isClinicalViewer, mergeParams, useMeasure, visibleStories } from "../Work/shared";
import { AgentFeed, EventDrawer, EventRow, TIME_OPTIONS, Timeline, inWindow, useEventParam } from "./feed";
import type { TimeKey } from "./feed";
import "../Work/phf.css";

type ProgFilter = "all" | ProgrammeId;
type ActorKind = ActivityEvent["actor"]["kind"];
const ACTOR_KINDS: ActorKind[] = ["staff", "agent", "system", "participant"];
const ACTOR_CHIP: Record<ActorKind, string> = { staff: "Staff", agent: "Agents", system: "Systems", participant: "Participants (portal)" };

export default function ActivityPage({ tab }: { tab: string }) {
  return (
    <StaffOnly title="Activity">
      {tab === "people" ? <PeopleTab /> : tab === "agents" ? <AgentsTab /> : tab === "needs-attention" ? <AttentionTab /> : <EverythingTab />}
    </StaffOnly>
  );
}

/* ---- shared filter controls ---- */
function ProgrammeSelect({ value, onChange }: { value: ProgFilter; onChange: (v: ProgFilter) => void }) {
  return (
    <Select className="phf-sel" aria-label="Programme" value={value} onChange={(e) => onChange(e.target.value as ProgFilter)} style={{ maxWidth: 210 }}>
      <option value="all">All programmes</option>
      {PROGRAMME_ORDER.map((id) => <option key={id} value={id}>{PROGRAMME_BY_ID[id].name}</option>)}
    </Select>
  );
}
const isProg = (v: string | undefined): v is ProgrammeId => !!v && (PROGRAMME_ORDER as string[]).includes(v);

/* ---- Everything ---- */
function EverythingTab() {
  const state = usePhState();
  const nav = useNav();
  const ev = useEventParam();
  const [q, setQ] = useState("");
  const [prog, setProg] = useState<ProgFilter>(isProg(nav.params.programme) ? nav.params.programme : "all");
  const [kind, setKind] = useState<string>("all");
  const [actor, setActor] = useState<"all" | ActorKind>("all");
  const [time, setTime] = useState<TimeKey>("all");
  const story = nav.params.story && /^ST-0[1-6]$/.test(nav.params.story) ? nav.params.story : null;

  const everything = useMemo(() => activityFeed(state, {}), [state]);
  const kinds = useMemo(() => Array.from(new Set(everything.filter((v) => !v.minimal && v.event.entity).map((v) => v.event.entity!.kind))).sort((a, b) => (KIND_LABEL[a] < KIND_LABEL[b] ? -1 : 1)), [everything]);
  const base = useMemo(() => activityFeed(state, { programmeId: prog, entityKind: kind, q }), [state, prog, kind, q]);
  // A minimised clinical event never reveals its programme or record type through a filter.
  const scoped = base.filter((v) => (!v.minimal || (prog === "all" && kind === "all")) && (!story || v.event.storyId === story) && inWindow(state, v.event.at, time));
  const rows = actor === "all" ? scoped : scoped.filter((v) => v.event.actor.kind === actor);
  const simulated = rows.filter((v) => v.event.simulated).length;

  return (
    <div className="ph-page">
      <PageHeader
        eyebrow="Activity"
        title="Everything"
        sub={`One timeline for staff, agents, simulated systems and the participant portal. ${rows.length} of ${everything.length} events shown, ${simulated} of them simulated. Event IDs are the same on every view.`}
        actions={<DemoTag>Fictional demo events</DemoTag>}
      />
      <div className="ph-stack">
        <div className="phf-toolbar">
          <Chip on={actor === "all"} count={scoped.length} onClick={() => setActor("all")}>All actors</Chip>
          {ACTOR_KINDS.map((k) => <Chip key={k} on={actor === k} count={scoped.filter((v) => v.event.actor.kind === k).length} onClick={() => setActor(k)}>{ACTOR_CHIP[k]}</Chip>)}
          {story ? (
            <Chip on onClick={() => nav.setParams(mergeParams(nav.params, { story: null }))}>
              Story {story} <Icon name="x" size={11} />
            </Chip>
          ) : null}
        </div>
        <div className="phf-toolbar">
          <ProgrammeSelect value={prog} onChange={setProg} />
          <Select className="phf-sel" aria-label="Record type" value={kind} onChange={(e) => setKind(e.target.value)} style={{ maxWidth: 200 }}>
            <option value="all">Every record type</option>
            {kinds.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </Select>
          <Segmented label="Time" value={time} onChange={setTime} options={TIME_OPTIONS} />
          <span className="phf-spacer" />
          <SearchBox value={q} onChange={setQ} placeholder="Search events or IDs" width={220} />
        </div>
        <Timeline views={rows} onOpen={ev.open} resetKey={`${prog}|${kind}|${actor}|${time}|${q}|${story || ""}`} />
      </div>
      {ev.id ? <EventDrawer id={ev.id} onClose={ev.close} /> : null}
    </div>
  );
}

/* ---- People: staff actions only, the eight demonstration profiles ---- */
function PeopleTab() {
  const state = usePhState();
  const nav = useNav();
  const ev = useEventParam();
  const [measure, width] = useMeasure<HTMLDivElement>();
  const wide = width === 0 || width >= WIDE_MIN;
  const [q, setQ] = useState("");
  const [prog, setProg] = useState<ProgFilter>("all");
  const [time, setTime] = useState<TimeKey>("all");
  const base = useMemo(() => activityFeed(state, { filter: "people", programmeId: prog, q }), [state, prog, q]);
  const windowed = base.filter((v) => (!v.minimal || prog === "all") && inWindow(state, v.event.at, time));
  const sel = nav.params.staff && state.staff.some((s) => s.id === nav.params.staff) ? nav.params.staff : "all";
  const rows = sel === "all" ? windowed : windowed.filter((v) => v.event.actor.id === sel);
  const per = state.staff.map((s) => {
    const mine = windowed.filter((v) => v.event.actor.id === s.id);
    return { s, n: mine.length, last: mine[0] };
  });
  const pick = (id: string) => nav.setParams(mergeParams(nav.params, { staff: id === "all" ? null : id, event: null }));

  const staffList = (
    <Card>
      <CardHeader title="Staff" sub="The eight demonstration profiles. Not total headcount." />
      <div className="ph-stack" style={{ gap: 2 }}>
        <button type="button" className="phf-rowbtn" aria-pressed={sel === "all"} onClick={() => pick("all")}>
          <span className="phf-badge" style={{ width: 26, height: 26 }}><Icon name="users" size={14} /></span>
          <span className="ph-grow" style={{ fontSize: 12.5, color: "var(--ink)" }}>All staff</span>
          <span className="ph-num phf-small">{windowed.length}</span>
        </button>
        {per.map(({ s, n, last }) => (
          <button key={s.id} type="button" className="phf-rowbtn" aria-pressed={sel === s.id} onClick={() => pick(s.id)}>
            <Avatar name={s.name} tint={s.tint} size={26} />
            <span className="ph-grow" style={{ minWidth: 0, lineHeight: 1.3 }}>
              <span className="ph-trunc" style={{ display: "block", fontSize: 12.5, color: "var(--ink)" }}>{s.name}</span>
              <span className="ph-trunc" style={{ display: "block", fontSize: 11, color: "var(--faint)" }}>{last ? `Last: ${fmtWhen(last.event.at, state.clock.nowUtc)}` : s.title}</span>
            </span>
            <span className="ph-num phf-small">{n}</span>
          </button>
        ))}
      </div>
    </Card>
  );

  const main = (
    <div className="ph-stack">
      <div className="phf-toolbar">
        <ProgrammeSelect value={prog} onChange={setProg} />
        <Segmented label="Time" value={time} onChange={setTime} options={TIME_OPTIONS} />
        <span className="phf-spacer" />
        <SearchBox value={q} onChange={setQ} placeholder="Search staff actions" width={wide ? 200 : "100%"} />
      </div>
      <Timeline views={rows} onOpen={ev.open} resetKey={`${sel}|${prog}|${time}|${q}`} noun="staff actions" />
    </div>
  );

  return (
    <div className="ph-page" ref={measure}>
      <PageHeader
        eyebrow="Activity"
        title="People"
        sub="Staff actions only, by the eight demonstration staff. The same event IDs appear in Everything."
        actions={<DemoTag>Fictional demo events</DemoTag>}
      />
      {wide ? (
        <div className="ph-split">
          {main}
          <div className="ph-stack">{staffList}</div>
        </div>
      ) : (
        <div className="ph-stack">
          <div className="phf-toolbar">
            <Chip on={sel === "all"} count={windowed.length} onClick={() => pick("all")}>All staff</Chip>
            {per.map(({ s, n }) => <Chip key={s.id} on={sel === s.id} count={n} onClick={() => pick(s.id)}>{s.name}</Chip>)}
          </div>
          {main}
        </div>
      )}
      {ev.id ? <EventDrawer id={ev.id} onClose={ev.close} /> : null}
    </div>
  );
}

/* ---- Agents: exactly the same entries as Agents, Activity ---- */
function AgentsTab() {
  return (
    <div className="ph-page">
      <PageHeader
        eyebrow="Activity"
        title="Agents"
        sub="Simulated agent actions from the shared activity store. Exactly the same entries as the Agents page, Activity tab."
        actions={<DemoTag>Simulated</DemoTag>}
      />
      <AgentFeed />
    </div>
  );
}

/* ---- Needs Attention: unresolved story events and their linked open tasks ---- */
function AttentionTab() {
  const state = usePhState();
  const p = usePersona();
  const nav = useNav();
  const ev = useEventParam();
  const [measure, width] = useMeasure<HTMLDivElement>();
  const wide = width === 0 || width >= WIDE_MIN;
  const clinical = isClinicalViewer(p);
  const stories = visibleStories(state);
  const open = stories.filter((s) => s.open);
  const resolved = stories.filter((s) => !s.open);
  const events = useMemo(() => activityFeed(state, { filter: "attention" }), [state]);
  const tasks = useMemo(() => attentionTasks(state), [state]);
  const groups = open.map((s) => ({ s, evs: events.filter((v) => v.event.storyId === s.def.id), ts: tasks.filter((t) => t.task.storyId === s.def.id) }));
  const evCount = groups.reduce((n, g) => n + g.evs.length, 0);
  const taskCount = groups.reduce((n, g) => n + g.ts.length, 0);

  return (
    <div className="ph-page" ref={measure}>
      <PageHeader
        eyebrow="Activity"
        title="Needs attention"
        sub={`${open.length} open ${open.length === 1 ? "story" : "stories"}, ${evCount} unresolved ${evCount === 1 ? "event" : "events"} and ${taskCount} linked open ${taskCount === 1 ? "task" : "tasks"}. When a story is resolved it leaves this view; its events stay in Everything.`}
        actions={<Button icon="list" onClick={() => nav.go({ page: "Activity", tab: "everything" })}>Everything</Button>}
      />
      <div className="ph-stack">
        {groups.length === 0 ? (
          <Card pad={false}>
            <EmptyState title="Nothing needs attention" icon="check">Every story visible to this role is resolved. The full history is in Everything.</EmptyState>
          </Card>
        ) : groups.map((g) => <StoryGroup key={g.s.def.id} state={state} s={g.s} evs={g.evs} ts={g.ts} wide={wide} clinical={clinical} onOpenEvent={ev.open} />)}

        {resolved.length ? (
          <Card>
            <CardHeader title="Resolved stories" sub="Moved out of this view when the underlying work was completed. The events remain in Everything." />
            <ul className="phf-list">
              {resolved.map((s) => (
                <li key={s.def.id} className="ph-row-flex" style={{ gap: 10, flexWrap: "wrap" }}>
                  <span className="phf-id">{s.def.id}</span>
                  <Pill tone="ok">Resolved</Pill>
                  <span className="ph-grow" style={{ fontSize: 12.5, color: "var(--ink)", minWidth: 160 }}>{s.headline}</span>
                  <Button size="sm" variant="ghost" icon="arrow" onClick={() => nav.go({ page: "Activity", tab: "everything", params: { story: s.def.id } })}>Events in Everything</Button>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>
      {ev.id ? <EventDrawer id={ev.id} onClose={ev.close} /> : null}
    </div>
  );
}

function StoryGroup({ state, s, evs, ts, wide, clinical, onOpenEvent }: { state: PhState; s: StoryView; evs: ActivityView[]; ts: TaskView[]; wide: boolean; clinical: boolean; onOpenEvent: (id: string) => void }) {
  const nav = useNav();
  const shown = evs.slice(0, 4);
  const hiddenTasks = s.tasks.filter((t) => t.clinical && t.status === "open").length > 0 && !clinical;
  return (
    <Card>
      <div className="ph-row-flex" style={{ gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <span className="phf-id">{s.def.id}</span>
        <span className="ph-h2">{s.restricted ? "Clinical action" : s.def.title}</span>
        <Pill tone="warn" icon="dot">Open</Pill>
        <span className="ph-grow" />
        <Button size="sm" icon="arrow" onClick={() => nav.go(s.target)}>Open item</Button>
      </div>
      <div style={{ fontSize: 15, color: "var(--ink)", fontWeight: 500, letterSpacing: "-.1px" }}>{s.headline}</div>
      <div className="phf-small" style={{ marginTop: 3 }}>{s.detail}</div>
      <div className="phf-note" style={{ marginTop: 4 }}>
        Owner {s.ownerName}{s.secondaryName ? `, with ${s.secondaryName}` : ""}{s.dueAt ? `, due ${fmtDateTime(s.dueAt)} (${fmtWhen(s.dueAt, state.clock.nowUtc)})` : ""}
      </div>
      <div className={"phf-cols2" + (wide ? "" : " narrow")} style={{ marginTop: 14 }}>
        <div style={{ minWidth: 0 }}>
          <div className="phf-sectiontitle">Unresolved events, {evs.length}</div>
          {evs.length ? (
            <Card flat pad={false}>
              {shown.map((v) => <EventRow key={v.event.id} v={v} onOpen={onOpenEvent} compact />)}
            </Card>
          ) : <div className="phf-note">No events recorded for this story yet.</div>}
          {evs.length > shown.length ? (
            <Button size="sm" variant="ghost" icon="arrow" onClick={() => nav.go({ page: "Activity", tab: "everything", params: { story: s.def.id } })} style={{ marginTop: 6 }}>
              All {evs.length} events in Everything
            </Button>
          ) : null}
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="phf-sectiontitle">Linked open tasks, {ts.length}</div>
          {ts.length ? (
            <Card flat pad={false}>
              {ts.map((t, i) => (
                <div key={t.task.id} className="ph-row-flex" style={{ gap: 10, padding: "10px 12px", borderTop: i ? "1px solid var(--border)" : 0, alignItems: "flex-start", flexWrap: "wrap" }}>
                  <div className="ph-grow" style={{ minWidth: 180 }}>
                    <div style={{ fontSize: 12.5, color: "var(--ink)", fontWeight: 500, lineHeight: 1.35 }}>{t.title}</div>
                    <div className="ph-wrap" style={{ gap: 6, marginTop: 5 }}>
                      <TaskStatusPill tv={t} />
                      <span className="phf-id">{t.task.id}</span>
                      <span className="phf-note">{t.task.dueAt ? `Due ${fmtDateTime(t.task.dueAt)}` : "No due date"}</span>
                    </div>
                    <div style={{ marginTop: 6 }}><StaffCell state={state} id={t.task.ownerId} size={20} /></div>
                  </div>
                  <Button size="sm" icon="arrow" onClick={() => nav.go({ page: "Work", tab: "tasks", params: { task: t.task.id } })}>Open task</Button>
                </div>
              ))}
            </Card>
          ) : <div className="phf-note">{hiddenTasks || s.restricted ? "Linked tasks are clinical and visible to clinical roles only." : "No open tasks are linked to this story."}</div>}
        </div>
      </div>
    </Card>
  );
}
