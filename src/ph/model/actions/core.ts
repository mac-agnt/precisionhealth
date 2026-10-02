/* Session, clock, settings, tasks and portal access. */
import type { PersonaId, StaffId, TeamId } from "../types";
import { DEMO_NOW_UTC, dublinToUtc } from "../time";
import { currentReleased } from "../selectors/clinical";
import { taskViews } from "../selectors/ops";
import { Ctx, pad } from "./ctx";
import type { Handler } from "./ctx";

const handlers: Record<string, Handler> = {};

export const CLOCK_PRESETS: Array<{ id: string; label: string; iso: string }> = [
  { id: "baseline", label: "Mon 5 Oct, 08:15 (baseline)", iso: DEMO_NOW_UTC },
  { id: "0850", label: "Mon 5 Oct, 08:50", iso: dublinToUtc("2026-10-05", "08:50") },
  { id: "0905", label: "Mon 5 Oct, 09:05 (follow-up overdue)", iso: dublinToUtc("2026-10-05", "09:05") },
  { id: "1005", label: "Mon 5 Oct, 10:05 (identity due passed)", iso: dublinToUtc("2026-10-05", "10:05") },
  { id: "1400", label: "Mon 5 Oct, 14:00", iso: dublinToUtc("2026-10-05", "14:00") },
];

handlers["session/setPersona"] = (c, a: { personaId: PersonaId }) => {
  c.s.session.personaId = a.personaId;
  c.inv();
  return c.ok(`Previewing as ${c.persona().name}. This is a frontend visibility simulation, not production security.`, "info");
};

handlers["session/setPortalPerson"] = (c, a: { personId: string }) => {
  if (!c.ix().personById.has(a.personId)) return c.fail("Unknown participant.");
  c.s.session.portalPersonId = a.personId;
  c.inv();
  return c.ok();
};

handlers["session/setClock"] = (c, a: { preset: string }) => {
  const p = CLOCK_PRESETS.find((x) => x.id === a.preset);
  if (!p) return c.fail("Unknown clock preset.");
  c.s.clock = { nowUtc: p.iso, preset: p.id };
  c.inv();
  return c.ok(`Demo clock set to ${p.label}.`, "info");
};

handlers["ui/toast"] = (c, a: { tone: "ok" | "info" | "warn" | "bad"; text: string }) => {
  const n = c.nextNo("toast");
  c.s.toasts = c.s.toasts.concat([{ id: n, tone: a.tone, text: a.text }]).slice(-4);
  return { ok: true };
};
handlers["ui/dismissToast"] = (c, a: { id: number }) => {
  c.s.toasts = c.s.toasts.filter((t) => t.id !== a.id);
  return { ok: true };
};

handlers["settings/aiDrafting"] = (c, a: { on: boolean }) => {
  const d = c.need("settings.edit", "change AI controls"); if (d) return d;
  c.s.settings.aiDraftingOn = a.on;
  c.emit({ verb: "settings.ai", summary: `${c.first()} turned the AI drafting preview ${a.on ? "on" : "off"}. Manual advice and manual employer narrative authoring are unaffected.`, entity: { kind: "system", id: "ai-controls" } });
  return c.ok(a.on ? "Drafting preview on. A human still approves everything." : "Drafting preview off. Manual workflows are fully usable.", "info");
};

handlers["settings/assignTeam"] = (c, a: { staffId: StaffId; team: TeamId }) => {
  const d = c.need("settings.edit", "change team assignments"); if (d) return d;
  const st = c.s.staff.find((x) => x.id === a.staffId);
  if (!st) return c.fail("Unknown staff profile.");
  if (st.team === a.team) return c.fail("Already on that team.");
  c.s.teams.forEach((t) => { t.memberIds = t.memberIds.filter((m) => m !== a.staffId); });
  c.s.teams.find((t) => t.id === a.team)!.memberIds.push(a.staffId);
  st.team = a.team;
  c.inv();
  c.emit({ verb: "settings.team", summary: `${c.first()} moved ${st.name} to ${c.s.teams.find((t) => t.id === a.team)!.name}.`, entity: { kind: "staff", id: st.id } });
  return c.ok(`${st.name} moved. Related references updated.`, "ok");
};

handlers["governance/setOwner"] = (c, a: { id: string; owner: string }) => {
  const d = c.need("settings.edit", "assign governance owners"); if (d) return d;
  const g = c.s.settings.governance.find((x) => x.id === a.id);
  if (!g) return c.fail("Unknown governance item.");
  g.owner = (a.owner || "").trim() || null;
  return c.ok(g.owner ? "Owner recorded. The status is unchanged until evidence exists." : "Owner cleared.", "info");
};

handlers["task/complete"] = (c, a: { taskId: string }) => {
  const tv = taskViews(c.s).find((t) => t.task.id === a.taskId);
  if (!tv) return c.fail("Unknown task.");
  if (tv.status === "done") return c.fail("Already done.");
  if (!tv.canMarkDone) return c.fail(tv.blockReason || "This task completes when its underlying item is complete. Open it to continue.");
  const t = c.s.tasks.find((x) => x.id === a.taskId)!;
  t.status = "done";
  t.completedAt = c.stamp();
  t.completedBy = c.persona().id as never;
  c.emit({ verb: "task.done", summary: `${c.first()} completed task ${t.id}: ${t.title}.`, entity: { kind: "task", id: t.id } });
  return c.ok("Task completed.", "ok");
};

handlers["task/add"] = (c, a: { title: string; ownerId: StaffId; dueAt: string | null }) => {
  if (!(a.title || "").trim()) return c.fail("Give the task a title.");
  const n = c.nextNo("task");
  const owner = c.s.staff.find((x) => x.id === a.ownerId);
  if (!owner) return c.fail("Choose an owner.");
  c.s.tasks.push({ id: `TSK-${pad(n, 4)}`, title: a.title.trim(), detail: "Added in this session.", storyId: null, ownerId: owner.id, team: owner.team, priority: "medium", dueAt: a.dueAt, status: "open", clinical: false, linked: { kind: "staff", id: owner.id }, createdAt: c.stamp(), completedAt: null, completedBy: null });
  c.emit({ verb: "task.added", summary: `${c.first()} added task ${`TSK-${pad(n, 4)}`} for ${owner.name}.`, entity: { kind: "task", id: `TSK-${pad(n, 4)}` } });
  return c.ok("Task added.", "ok");
};

/** The participant opens a released report. Recorded separately from message delivery. */
handlers["portal/viewReport"] = (c, a: { episodeId: string }) => {
  const v = currentReleased(c.s, a.episodeId);
  if (!v) return c.fail("No released report to view.");
  if (v.accessedAt) return c.ok();
  v.accessedAt = c.stamp();
  const ep = c.ix().episodeById.get(a.episodeId)!;
  c.emit({ verb: "report.accessed", summary: `${c.personName(ep.personId)} opened report ${ep.id} v${v.version} in the portal. Recorded separately from message delivery.`, entity: { kind: "report", id: v.id }, programmeId: ep.programmeId, personId: ep.personId, simulated: true });
  return c.ok();
};

export const coreHandlers = handlers;
export type { Ctx };
