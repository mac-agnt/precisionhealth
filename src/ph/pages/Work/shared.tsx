/* Shared helpers for module F: Work, Activity and the Agents Overview and Activity tabs.
   Everything reads the shared store through selectors. No count is typed in here. */
import { useLayoutEffect, useState } from "react";
import type { ComponentProps, ReactNode } from "react";
import { createPortal } from "react-dom";
import { INTEGRATIONS, PROGRAMME_BY_ID, fmtAge, fmtDayMonth, hoursBetween, ix, staffName, storyViews } from "../../model";
import type { EntityKind, EntityRef, NavTarget, Persona, PhState, StoryView, TaskView, TeamId } from "../../model";
import { Avatar, Drawer, Icon, PageHeader, Pill, RestrictedNotice } from "../../ui";
import { usePersona } from "../../store";
import type { GlyphName, Tone } from "../../ui";
import "./phf.css";

/** Width of an element, kept current with ResizeObserver. Layouts follow the container, not only the window. */
export function useMeasure<T extends HTMLElement>(): [(el: T | null) => void, number] {
  const [el, setEl] = useState<T | null>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    if (!el) return;
    const read = () => setWidth(Math.round(el.getBoundingClientRect().width));
    read();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, width];
}

/** Content width below which the two-thirds split and side panels stack. */
export const WIDE_MIN = 900;

/** Merge or remove deep-link params without losing the others. */
export function mergeParams(current: Record<string, string>, patch: Record<string, string | null | undefined>): Record<string, string> {
  const next: Record<string, string> = { ...current };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined || v === "") delete next[k];
    else next[k] = v;
  }
  return next;
}

/** Same rule the shared story selector uses: clinical review or clinical follow-up roles. */
export const isClinicalViewer = (p: Persona) => p.perms.has("clinical.view") || p.perms.has("followup.view");

/**
 * Which stories a role sees, matching the header notifications: a clinical story is hidden from
 * other roles, except the urgent follow-up, which they see only as "Clinical action assigned".
 */
export const storyVisible = (s: StoryView) => !s.restricted || s.def.id === "ST-04";
export const visibleStories = (state: PhState) => storyViews(state).filter(storyVisible);

export const TEAM_NAME = (state: PhState, id: TeamId) => state.teams.find((t) => t.id === id)?.name || id;

export const KIND_LABEL: Record<EntityKind, string> = {
  person: "Participant", episode: "Screening episode", booking: "Booking", session: "Clinic session", programme: "Programme",
  batch: "Import batch", row: "Import row", task: "Task", followup: "Follow-up", report: "Report version", employer_report: "Employer report",
  template: "Form template", company: "Company", staff: "Staff profile", agent: "Agent", approval: "Approval", message: "Message",
  file: "File", invitation: "Invitation list", system: "System or setting",
};

/** A readable label for a linked record. Identifiers stay visible; clinical values never appear. */
export function refLabel(state: PhState, r: EntityRef): string {
  if (r.label) return r.label;
  const I = ix(state);
  switch (r.kind) {
    case "programme": return I.programmeById.get(r.id)?.name || r.id;
    case "session": {
      const s = I.sessionById.get(r.id);
      return s ? `${PROGRAMME_BY_ID[s.programmeId].code} clinic, ${fmtDayMonth(s.date)}` : r.id;
    }
    case "staff": return staffName(state, r.id);
    case "person": {
      const p = I.personById.get(r.id);
      return p ? `${p.given} ${p.family}` : r.id;
    }
    case "invitation": {
      const d = state.invitationDrafts.find((x) => x.id === r.id);
      return d ? `${r.id}, ${PROGRAMME_BY_ID[d.programmeId].code} invitation list` : r.id;
    }
    case "template": return state.forms.templates.find((t) => t.id === r.id)?.name || r.id;
    case "company": return state.companies.find((c) => c.id === r.id)?.name || r.id;
    case "system": return INTEGRATIONS.find((x) => x.id === r.id)?.name || r.id;
    case "batch": return r.id;
    default: return r.id;
  }
}

export const PRIORITY: Record<"high" | "medium" | "low", { label: string; tone: Tone; icon: GlyphName; rank: number }> = {
  high: { label: "High", tone: "warn", icon: "flag", rank: 0 },
  medium: { label: "Medium", tone: "neutral", icon: "dot", rank: 1 },
  low: { label: "Low", tone: "neutral", icon: "down", rank: 2 },
};
export function PriorityPill({ p }: { p: "high" | "medium" | "low" }) {
  const d = PRIORITY[p];
  return <Pill tone={d.tone} icon={d.icon}>{d.label}</Pill>;
}

export const taskStatusRank = (t: TaskView) => (t.status === "done" ? 3 : t.status === "blocked" ? 1 : t.overdue ? 0 : 2);
export function TaskStatusPill({ tv }: { tv: TaskView }) {
  if (tv.status === "done") return <Pill tone="ok">Done</Pill>;
  if (tv.status === "blocked") return <Pill tone="warn" icon="lock" title={tv.blockReason || undefined}>Blocked</Pill>;
  if (tv.overdue) return <Pill tone="bad" icon="alert">Overdue</Pill>;
  return <Pill tone="info" icon="clock">Open</Pill>;
}

/** "due in 45m" or "2h overdue", relative to the demo clock. */
export function relDue(dueIso: string, nowIso: string): string {
  const h = hoursBetween(nowIso, dueIso);
  return h >= 0 ? `due in ${fmtAge(h)}` : `${fmtAge(-h)} overdue`;
}

/** Where "Open item" goes: the story's own queue for story tasks, otherwise the linked record. */
export function openTarget(state: PhState, tv: TaskView): NavTarget {
  // Once the identity exceptions are resolved, the held episodes wait in the review queue.
  if (tv.task.id === "TSK-0002" && tv.status === "open") return { page: "Results", tab: "review" };
  if (tv.task.storyId) {
    const sv = storyViews(state).find((s) => s.def.id === tv.task.storyId);
    if (sv) return sv.target;
  }
  return tv.target;
}

export function Tag({ children, title, mono, accent, icon }: { children: ReactNode; title?: string; mono?: boolean; accent?: boolean; icon?: GlyphName }) {
  return (
    <span className={"phf-tag" + (mono ? " mono" : "") + (accent ? " accent" : "")} title={title}>
      {icon ? <Icon name={icon} size={10} stroke={2} /> : null}
      <span className="ph-trunc">{children}</span>
    </span>
  );
}

export function ProgTag({ id }: { id: string | null | undefined }) {
  if (!id) return null;
  const p = PROGRAMME_BY_ID[id as keyof typeof PROGRAMME_BY_ID];
  return p ? <Tag title={p.name}>{p.code}</Tag> : null;
}

/** Avatar, name and an optional second line (team or role). */
export function StaffCell({ state, id, sub, size = 24 }: { state: PhState; id: string; sub?: ReactNode; size?: number }) {
  const s = ix(state).staffById.get(id);
  const name = s?.name || staffName(state, id);
  return (
    <span className="ph-row-flex" style={{ gap: 8, minWidth: 0 }}>
      <Avatar name={name} tint={s?.tint} size={size} />
      <span style={{ minWidth: 0, lineHeight: 1.3 }}>
        <span className="ph-trunc" style={{ display: "block", color: "var(--ink)", fontSize: 12.5 }}>{name}</span>
        {sub ? <span className="ph-trunc" style={{ display: "block", color: "var(--faint)", fontSize: 11 }}>{sub}</span> : null}
      </span>
    </span>
  );
}

/** Small square icon badge for system and participant actors. */
export function IconBadge({ icon, size = 24, title }: { icon: GlyphName; size?: number; title?: string }) {
  return (
    <span className="phf-badge" title={title} style={{ width: size, height: size }} aria-hidden={title ? undefined : true}>
      <Icon name={icon} size={Math.round(size * 0.55)} />
    </span>
  );
}

/**
 * Renders overlays at the themed app root instead of inside the page. ".ph-page" keeps a transform
 * and filter from its entry animation, which would make it the containing block for
 * position: fixed, so a drawer inside it would span the page instead of the viewport.
 * The themed root keeps the theme and density tokens.
 */
export function InTheme({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    setHost((document.querySelector("[data-theme]") as HTMLElement | null) || document.body);
  }, []);
  return host ? createPortal(children, host) : null;
}

/** The shared Drawer, mounted at the themed app root so it always covers the viewport edge. */
export function SafeDrawer(props: ComponentProps<typeof Drawer>) {
  return <InTheme><Drawer {...props} /></InTheme>;
}

/** Work, Activity and Agents are staff workspaces. The participant preview never shows them. */
export function StaffOnly({ title, children }: { title: string; children: ReactNode }) {
  const p = usePersona();
  if (!p.isParticipant) return <>{children}</>;
  return (
    <div className="ph-page">
      <PageHeader title={title} />
      <RestrictedNotice title="Staff workspace">
        The participant preview shows only the participant's own released data. Switch back to a staff role from the profile menu.
      </RestrictedNotice>
    </div>
  );
}
