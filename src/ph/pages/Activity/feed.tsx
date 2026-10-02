/* Shared activity pieces for module F: actor badges, the paginated day-grouped timeline, the
   event drawer and the agent feed used by both Activity, Agents and Agents, Activity, so the two
   tabs always list exactly the same entries. Text comes from activityFeed, which already hides
   or minimises clinical events for roles that cannot see them. */
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import AgentFace from "../../../components/AgentFace";
import {
  AGENT_DEFS, INTEGRATIONS, PROGRAMME_BY_ID, activityFeed, addDays, agentEvents, fmtDateTime, fmtTime, fmtWeekdayDate, fmtWhen, ix, linkFor, localDateOf,
  storyViews, today,
} from "../../model";
import type { ActivityEvent, ActivityView, PhState } from "../../model";
import { usePersona, usePhState } from "../../store";
import { useNav } from "../../nav-context";
import { Avatar, Button, Card, DemoTag, EmptyState, EntityLink, Icon, Pill, RestrictedNotice, SearchBox, Segmented, Drawer } from "../../ui";
import { IconBadge, KIND_LABEL, ProgTag, Tag, mergeParams, refLabel, storyLabel, storyVisible, useMeasure } from "../Work/shared";
import "../Work/phf.css";

/* ---- time windows, from the demo clock ---- */
export type TimeKey = "all" | "today" | "week" | "earlier";
export const TIME_OPTIONS: Array<{ id: TimeKey; label: string }> = [
  { id: "all", label: "All time" }, { id: "today", label: "Today" }, { id: "week", label: "Last 7 days" }, { id: "earlier", label: "Earlier" },
];
export function inWindow(state: PhState, at: string, key: TimeKey): boolean {
  if (key === "all") return true;
  const d = localDateOf(at), t = today(state);
  if (key === "today") return d === t;
  const from = addDays(t, -6);
  return key === "week" ? d >= from : d < from;
}

export function dayLabel(state: PhState, date: string): string {
  const t = today(state);
  if (date === t) return `Today, ${fmtWeekdayDate(date)}`;
  if (date === addDays(t, -1)) return `Yesterday, ${fmtWeekdayDate(date)}`;
  if (date > t) return `Upcoming, ${fmtWeekdayDate(date)}`;
  return fmtWeekdayDate(date);
}

export const ACTOR_KIND_LABEL: Record<ActivityEvent["actor"]["kind"], string> = { staff: "Staff", agent: "Agent", system: "System", participant: "Participant (portal)" };

/* ---- actor badge: staff avatar, agent face, or an icon for systems and participants ---- */
export function ActorBadge({ actor, size = 24 }: { actor: ActivityEvent["actor"]; size?: number }) {
  const state = usePhState();
  if (actor.kind === "staff") return <Avatar name={actor.label} tint={ix(state).staffById.get(actor.id)?.tint} size={size} />;
  if (actor.kind === "agent") {
    const a = AGENT_DEFS.find((x) => x.id === actor.id);
    return <span title={actor.label} style={{ display: "inline-flex" }}><AgentFace shape={a?.shape} tint={a?.tint} state="complete" size={size} /></span>;
  }
  if (actor.kind === "participant") return <IconBadge icon="user" size={size} title="Participant, portal preview" />;
  return <IconBadge icon="refresh" size={size} title="System, simulated" />;
}

/* ---- one event ---- */
export function EventRow({ v, onOpen, compact, narrow }: { v: ActivityView; onOpen: (id: string) => void; compact?: boolean; narrow?: boolean }) {
  const state = usePhState();
  const e = v.event;
  // A story hidden from this role shows neither its tag nor an attention marker.
  const sv = e.storyId ? storyViews(state).find((s) => s.def.id === e.storyId) : undefined;
  const showStory = !!sv && storyVisible(sv);
  const cls = "phf-ev" + (compact ? " compact" : narrow ? " narrow" : "");
  return (
    <div className={cls} onClick={() => onOpen(e.id)}>
      {compact ? null : <div className="phf-ev-time">{fmtTime(e.at)}</div>}
      <div className="phf-ev-actor"><ActorBadge actor={e.actor} size={compact ? 22 : 24} /></div>
      <div style={{ minWidth: 0 }}>
        <div className={"phf-ev-text" + (v.minimal ? " minimal" : "")}>
          {v.minimal ? <Icon name="lock" size={12} style={{ marginRight: 6, verticalAlign: "-1px", color: "var(--faint)" }} /> : null}
          {v.text}
        </div>
        <div className="phf-ev-meta">
          {compact ? <span className="ph-num">{fmtWhen(e.at, state.clock.nowUtc)}</span> : null}
          <span style={{ color: "var(--dim)" }}>{e.actor.label}</span>
          <span className="phf-id">{e.id}</span>
          {showStory ? <Tag mono>{e.storyId}</Tag> : null}
          {v.minimal ? null : <ProgTag id={e.programmeId} />}
          {!v.minimal && e.entity ? <EntityLink kind={e.entity.kind} id={e.entity.id}>{refLabel(state, e.entity)}</EntityLink> : null}
          {e.simulated ? <DemoTag>Simulated</DemoTag> : null}
          {!e.seeded ? <Tag accent>This session</Tag> : null}
          {v.attention && showStory ? <Pill tone="warn" icon="dot">Needs attention</Pill> : null}
        </div>
      </div>
      <div className="phf-ev-go">
        <button type="button" className="ph-btn ph-btn-ghost ph-btn-icon ph-btn-sm" aria-label={`Details for ${e.id}`} onClick={(x) => { x.stopPropagation(); onOpen(e.id); }}>
          <Icon name="chevronRight" size={14} />
        </button>
      </div>
    </div>
  );
}

/* ---- paginated, day-grouped timeline ---- */
export function Timeline({ views, onOpen, resetKey, pageSize = 30, empty, noun = "events" }: {
  views: ActivityView[]; onOpen: (id: string) => void; resetKey: string; pageSize?: number; empty?: ReactNode; noun?: string;
}) {
  const state = usePhState();
  const [measure, width] = useMeasure<HTMLDivElement>();
  const narrow = width > 0 && width < 620;
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [resetKey]);
  const pages = Math.max(1, Math.ceil(views.length / pageSize));
  const cur = Math.min(page, pages - 1);
  const slice = views.slice(cur * pageSize, cur * pageSize + pageSize);
  const groups: Array<{ date: string; items: ActivityView[] }> = [];
  for (const v of slice) {
    const d = localDateOf(v.event.at);
    const g = groups[groups.length - 1];
    if (g && g.date === d) g.items.push(v);
    else groups.push({ date: d, items: [v] });
  }
  return (
    <Card pad={false}>
      <div ref={measure}>
        {views.length === 0 ? (empty || <EmptyState title="No events match" icon="filter">Change the filters or clear the search.</EmptyState>) : (
          <>
            {groups.map((g, gi) => (
              <div key={g.date + gi} role="list" aria-label={dayLabel(state, g.date)}>
                <div className="phf-day" style={gi === 0 ? undefined : { borderTop: "1px solid var(--border)" }}>{dayLabel(state, g.date)}</div>
                {g.items.map((v) => <div role="listitem" key={v.event.id}><EventRow v={v} onOpen={onOpen} narrow={narrow} /></div>)}
              </div>
            ))}
            <div className="phf-tlfoot">
              <span className="ph-grow ph-num">Showing {cur * pageSize + 1} to {Math.min(views.length, cur * pageSize + pageSize)} of {views.length} {noun}</span>
              {pages > 1 ? (
                <span className="ph-wrap" style={{ gap: 6 }}>
                  <Button size="sm" variant="ghost" icon="chevronLeft" disabled={cur === 0} onClick={() => setPage(cur - 1)} aria-label="Newer events" />
                  <span className="ph-num">Page {cur + 1} of {pages}</span>
                  <Button size="sm" variant="ghost" icon="chevronRight" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)} aria-label="Older events" />
                </span>
              ) : null}
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

/* ---- event drawer, opened from any timeline with the event param ---- */
export function EventDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const state = usePhState();
  const p = usePersona();
  const nav = useNav();
  const all = useMemo(() => activityFeed(state, {}), [state]);
  const v = all.find((x) => x.event.id === id);
  const exists = state.activity.some((e) => e.id === id);
  if (!v) {
    return (
      <Drawer open onClose={onClose} title={exists ? "Restricted event" : "Event not found"} sub={id}>
        {exists ? (
          <RestrictedNotice>This event concerns clinical work and is not shown to {p.name} ({p.roleLabel}).</RestrictedNotice>
        ) : <EmptyState title={`No event ${id}`}>Event IDs are the same on every activity view. This one is not in the store.</EmptyState>}
      </Drawer>
    );
  }
  const e = v.event;
  const story = e.storyId ? storyViews(state).find((s) => s.def.id === e.storyId) : undefined;
  const integ = e.integrationId ? INTEGRATIONS.find((x) => x.id === e.integrationId) : undefined;
  return (
    <Drawer open onClose={onClose} title={e.id} sub={`${fmtDateTime(e.at)}, ${fmtWhen(e.at, state.clock.nowUtc)}`}
      footer={<Button variant="ghost" onClick={onClose}>Close</Button>}>
      <div className="ph-stack">
        <div className="ph-row-flex" style={{ alignItems: "flex-start", gap: 12 }}>
          <ActorBadge actor={e.actor} size={34} />
          <div style={{ minWidth: 0 }}>
            <div className="phf-strong" style={{ fontSize: 13.5 }}>{e.actor.label}</div>
            <div className="phf-note">{ACTOR_KIND_LABEL[e.actor.kind]}</div>
          </div>
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.55, color: v.minimal ? "var(--dim)" : "var(--ink)" }}>{v.text}</div>
        {v.minimal ? (
          <RestrictedNotice title="Clinical detail hidden for this role">
            {p.name} ({p.roleLabel}) sees only this summary. The clinical record stays with the clinical team.
          </RestrictedNotice>
        ) : null}
        <div className="ph-wrap" style={{ gap: 6 }}>
          {e.simulated ? <DemoTag>Simulated</DemoTag> : null}
          <DemoTag title="All people, events and records in this demo are fictional.">{e.seeded ? "Fictional demo event" : "Recorded in this session"}</DemoTag>
          {v.attention && story && storyVisible(story) ? <Pill tone="warn" icon="dot">Needs attention</Pill> : null}
        </div>
        <dl className="phf-kv">
          <dt>Event type</dt><dd className="ph-mono" style={{ fontSize: 12 }}>{v.minimal ? "Hidden for this role" : e.verb}</dd>
          <dt>Record</dt><dd>{e.entity && !v.minimal ? <><EntityLink kind={e.entity.kind} id={e.entity.id}>{refLabel(state, e.entity)}</EntityLink> <span className="phf-note">({KIND_LABEL[e.entity.kind]})</span></> : v.minimal ? "Hidden for this role" : "None"}</dd>
          <dt>Programme</dt><dd>{v.minimal ? "Hidden for this role" : e.programmeId ? <EntityLink kind="programme" id={e.programmeId}>{PROGRAMME_BY_ID[e.programmeId].name}</EntityLink> : "Not programme specific"}</dd>
          <dt>Story</dt><dd>{story && storyVisible(story) ? <><span className="phf-id">{story.def.id}</span> {storyLabel(story)}, {story.open ? "open" : "resolved"}</> : "None shown for this role"}</dd>
          <dt>System</dt><dd>{integ ? <EntityLink kind="system" id={integ.id}>{integ.name}</EntityLink> : "None"}{integ ? <div className="phf-note">{integ.statusLabel}</div> : null}</dd>
          <dt>Provenance</dt><dd>{e.seeded ? "Seeded demo history. Fictional." : "Created by an action in this session. Local demo state only, cleared by Reset demo."}{e.simulated ? " No provider, laboratory or model was contacted." : ""}</dd>
        </dl>
        {story && storyVisible(story) ? (
          <div><Button icon="arrow" onClick={() => nav.go(story.target)}>{story.open ? "Open the story item" : "Open the related item"}</Button></div>
        ) : e.entity && !v.minimal ? (
          <div><Button icon="arrow" onClick={() => nav.go(linkFor(e.entity!.kind, e.entity!.id))}>Open the record</Button></div>
        ) : null}
      </div>
    </Drawer>
  );
}

/** Open and close the event drawer through the deep-link param, keeping the other params. */
export function useEventParam() {
  const nav = useNav();
  return {
    id: nav.params.event || null,
    open: (id: string) => nav.setParams(mergeParams(nav.params, { event: id })),
    close: () => nav.setParams(mergeParams(nav.params, { event: null })),
  };
}

/* ---- the agent feed: identical entries on Activity, Agents and Agents, Activity ---- */
export function AgentFeed() {
  const state = usePhState();
  const nav = useNav();
  const ev = useEventParam();
  const views = useMemo(() => agentEvents(state), [state]);
  const agent = nav.params.agent && AGENT_DEFS.some((a) => a.id === nav.params.agent) ? nav.params.agent : "all";
  const [q, setQ] = useState("");
  const [time, setTime] = useState<TimeKey>("all");
  const query = q.trim().toLowerCase();
  const windowed = views.filter((v) => inWindow(state, v.event.at, time) && (!query || `${v.text} ${v.event.id} ${v.event.actor.label}`.toLowerCase().includes(query)));
  const rows = windowed.filter((v) => agent === "all" || v.event.actor.id === agent);
  const setAgent = (id: string) => nav.setParams(mergeParams(nav.params, { agent: id === "all" ? null : id, event: null }));
  return (
    <div className="ph-stack">
      <div className="phf-toolbar">
        <button type="button" className="phf-chipbtn plain" aria-pressed={agent === "all"} onClick={() => setAgent("all")}>
          All agents <span className="ph-num" style={{ opacity: 0.7 }}>{windowed.length}</span>
        </button>
        {AGENT_DEFS.map((a) => {
          const n = windowed.filter((v) => v.event.actor.id === a.id).length;
          return (
            <button key={a.id} type="button" className="phf-chipbtn" aria-pressed={agent === a.id} onClick={() => setAgent(a.id)} title={a.job}>
              <AgentFace shape={a.shape} tint={a.tint} state={n ? "complete" : "idle"} size={24} />
              {a.name} <span className="ph-num" style={{ opacity: 0.7 }}>{n}</span>
            </button>
          );
        })}
      </div>
      <div className="phf-toolbar">
        <Segmented label="Time" value={time} onChange={setTime} options={TIME_OPTIONS} />
        <span className="phf-spacer" />
        <SearchBox value={q} onChange={setQ} placeholder="Search agent activity" width={240} />
      </div>
      <Timeline
        views={rows}
        onOpen={ev.open}
        resetKey={`${agent}|${time}|${query}`}
        noun="agent actions"
        empty={
          <EmptyState title="No simulated actions match" icon="spark">
            {agent === "drafting" ? "Clinical Drafting acts only when a clinician asks for a drafting preview in Results, Review. Nothing runs on its own." : "Change the agent, time window or search."}
          </EmptyState>
        }
      />
      <div className="phf-note">Simulated agent actions. Each is a visible preparation or check, never an automated decision. A human approves anything that changes a record.</div>
      {ev.id ? <EventDrawer id={ev.id} onClose={ev.close} /> : null}
    </div>
  );
}
