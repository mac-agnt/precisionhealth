/* Programmes module selectors. Plain functions of PhState, memoised per state object, so every
   number on these screens comes from the shared store. Nothing here is typed in. */
import type {
  AppointmentType, ClinicSession, DirectoryRow, EmployerReport, FieldDef, FormBlock, FormTemplate, FormTemplateVersion, InvitationDraft, LocalDate,
  NavTarget, Perm, PhState, Programme, ProgrammeId, ScheduledJob, SessionStats, Staff, TemplateBlockRef,
} from "../../model";
import {
  PERM_DEFS, PROGRAMME_ORDER, addDays, daysBetween, directory, fmtDate, fmtDayMonth, hhmmToMinutes, ix, localDateOf, memo, programmeCounts, sessionSlots,
  sessionStats, startOfWeek, today,
} from "../../model";

/* ---- people and permissions ---- */

/** Staff whose role grants a permission, for "who can do this" lines. Derived from the role matrix. */
export function staffWithPerm(state: PhState, perm: Perm): Staff[] {
  const def = PERM_DEFS.find((d) => d.key === perm);
  return def ? state.staff.filter((s) => def.roles.includes(s.role)) : [];
}
export const namesOf = (list: Staff[]) => {
  const n = list.map((s) => s.name);
  return n.length <= 1 ? n.join("") : `${n.slice(0, -1).join(", ")} and ${n[n.length - 1]}`;
};

/* ---- programme window ---- */
export interface WindowInfo {
  start: LocalDate;
  end: LocalDate;
  totalDays: number;
  /** Today's day number inside the window (1-based), clamped. */
  dayNo: number;
  /** Whole days completed before today. */
  elapsed: number;
  pct: number;
  weeks: number;
  weekNo: number;
  status: "not_started" | "in_progress" | "ended";
  label: string;
  rangeLabel: string;
}
export function windowInfo(state: PhState, p: Programme): WindowInfo {
  return memo(state, "prg:win:" + p.id, () => {
    const t = today(state);
    const totalDays = daysBetween(p.windowStart, p.windowEnd) + 1;
    const raw = daysBetween(p.windowStart, t) + 1;
    const status: WindowInfo["status"] = raw < 1 ? "not_started" : raw > totalDays ? "ended" : "in_progress";
    const dayNo = Math.min(Math.max(raw, 0), totalDays);
    const elapsed = Math.min(Math.max(raw - 1, 0), totalDays);
    const w0 = startOfWeek(p.windowStart);
    const weeks = Math.floor(daysBetween(w0, p.windowEnd) / 7) + 1;
    const weekNo = Math.min(Math.max(Math.floor(daysBetween(w0, t) / 7) + 1, 1), weeks);
    const label = status === "in_progress" ? `Week ${weekNo} of ${weeks}` : status === "ended" ? "Window closed" : `Opens ${fmtDate(p.windowStart)}`;
    return {
      start: p.windowStart, end: p.windowEnd, totalDays, dayNo, elapsed, pct: totalDays ? (elapsed / totalDays) * 100 : 0, weeks, weekNo, status, label,
      rangeLabel: `${fmtDayMonth(p.windowStart)} to ${fmtDate(p.windowEnd)}`,
    };
  });
}

/* ---- sessions ---- */
export function programmeSessions(state: PhState, pid: ProgrammeId): SessionStats[] {
  return memo(state, "prg:ss:" + pid, () =>
    state.sessions.filter((s) => s.programmeId === pid && s.status !== "cancelled")
      .sort((a, b) => (a.date === b.date ? (a.start < b.start ? -1 : 1) : a.date < b.date ? -1 : 1))
      .map((s) => sessionStats(state, s.id)));
}
export const upcomingSessions = (state: PhState, pid: ProgrammeId) => programmeSessions(state, pid).filter((s) => s.session.date >= today(state));
export const sessionStatusOf = (s: SessionStats): "today" | "completed" | "scheduled" =>
  s.isToday ? "today" : s.isPast || s.session.status === "completed" ? "completed" : "scheduled";

/** The clinic-day configuration behind a programme's sessions: window, breaks, bookable minutes and slots. */
export interface SessionConfig {
  sessions: number;
  uniform: boolean;
  start: string;
  end: string;
  breaks: Array<{ start: string; end: string }>;
  slotMinutes: number;
  availableMinutes: number;
  capacity: number;
  consentVersions: string[];
}
export function sessionConfig(state: PhState, pid: ProgrammeId): SessionConfig | null {
  return memo(state, "prg:cfg:" + pid, () => {
    const ss = state.sessions.filter((x) => x.programmeId === pid && x.status !== "cancelled");
    if (!ss.length) return null;
    const ref = ss.find((x) => x.date >= today(state)) || ss[0];
    const key = (x: ClinicSession) => JSON.stringify([x.start, x.end, x.breaks, x.slotMinutes]);
    const s0 = hhmmToMinutes(ref.start), s1 = hhmmToMinutes(ref.end);
    const breakMinutes = ref.breaks.reduce((n, b) => n + Math.max(0, Math.min(hhmmToMinutes(b.end), s1) - Math.max(hhmmToMinutes(b.start), s0)), 0);
    return {
      sessions: ss.length, uniform: ss.every((x) => key(x) === key(ref)), start: ref.start, end: ref.end, breaks: ref.breaks, slotMinutes: ref.slotMinutes,
      availableMinutes: s1 - s0 - breakMinutes, capacity: sessionSlots(ref).length,
      consentVersions: [...new Set(state.bookings.filter((b) => b.programmeId === pid && b.status === "confirmed").map((b) => b.consentVersion))],
    };
  });
}

/** Short site label: "Site A" for Sisk, otherwise the room. */
export function shortSite(s: ClinicSession): string {
  if (s.siteName.startsWith("Sisk Dublin ")) return s.siteName.replace("Sisk Dublin ", "");
  return s.room;
}

/* ---- weekly progress ---- */
export interface WeekView {
  no: number;
  monday: LocalDate;
  from: LocalDate;
  to: LocalDate;
  sessions: SessionStats[];
  capacity: number;
  booked: number;
  attended: number;
  toAttend: number;
  released: number;
  ready: number;
  awaiting: number;
  onHold: number;
  current: boolean;
  past: boolean;
}
export function programmeWeeks(state: PhState, pid: ProgrammeId): WeekView[] {
  return memo(state, "prg:weeks:" + pid, () => {
    const p = ix(state).programmeById.get(pid)!;
    const w = windowInfo(state, p);
    const t = today(state);
    const w0 = startOfWeek(p.windowStart);
    const sess = programmeSessions(state, pid);
    const eps = state.episodes.filter((e) => e.programmeId === pid);
    const out: WeekView[] = [];
    for (let i = 0; i < w.weeks; i++) {
      const monday = addDays(w0, i * 7);
      const sunday = addDays(monday, 6);
      const from = monday < p.windowStart ? p.windowStart : monday;
      const to = sunday > p.windowEnd ? p.windowEnd : sunday;
      const ss = sess.filter((s) => s.session.date >= monday && s.session.date <= sunday);
      const ids = new Set(ss.map((s) => s.session.id));
      const we = eps.filter((e) => ids.has(e.sessionId));
      const capacity = ss.reduce((n, s) => n + s.slots, 0);
      const booked = ss.reduce((n, s) => n + s.booked, 0);
      const attended = ss.reduce((n, s) => n + s.completed, 0);
      out.push({
        no: i + 1, monday, from, to, sessions: ss, capacity, booked, attended, toAttend: Math.max(0, booked - attended),
        released: we.filter((e) => e.reportState === "released").length, ready: we.filter((e) => e.reportState === "ready_for_review").length,
        awaiting: we.filter((e) => e.reportState === "awaiting_results").length, onHold: we.filter((e) => e.reportState === "on_hold").length,
        current: t >= monday && t <= sunday, past: sunday < t,
      });
    }
    return out;
  });
}

/* ---- programme register rows ---- */
export interface ProgrammeRow {
  p: Programme;
  counts: ReturnType<typeof programmeCounts>;
  clinics: { total: number; past: number; today: number; upcoming: number };
  owner: Staff | undefined;
  win: WindowInfo;
  next: SessionStats | null;
}
export function programmeRows(state: PhState): ProgrammeRow[] {
  return memo(state, "prg:rows", () => {
    const I = ix(state);
    const t = today(state);
    return PROGRAMME_ORDER.map((id) => I.programmeById.get(id)).filter((p): p is Programme => !!p).map((p) => {
      const ss = programmeSessions(state, p.id);
      return {
        p, counts: programmeCounts(state, p.id),
        clinics: { total: ss.length, past: ss.filter((s) => s.session.date < t).length, today: ss.filter((s) => s.session.date === t).length, upcoming: ss.filter((s) => s.session.date > t).length },
        owner: I.staffById.get(p.ownerId), win: windowInfo(state, p), next: ss.find((s) => s.session.date >= t) || null,
      };
    });
  });
}
export function matchesProgramme(r: ProgrammeRow, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return [r.p.name, r.p.id, r.p.clientName, r.p.code, r.owner?.name || "", ...r.p.sites, r.p.inviteCode].join(" ").toLowerCase().includes(s);
}

/* ---- owners ---- */
export function ownersOf(state: PhState, p: Programme): Array<{ role: string; staff: Staff | undefined; duty: string }> {
  const I = ix(state);
  return [
    { role: "Programme owner", staff: I.staffById.get(p.ownerId), duty: "Client programme and capacity decisions" },
    { role: "Clinical lead", staff: I.staffById.get(p.clinicalLeadId), duty: "Clinical review and follow-up" },
    { role: "Reporting lead", staff: I.staffById.get(p.reportingLeadId), duty: "Employer reporting" },
    { role: "Operations lead", staff: I.staffById.get(p.opsLeadId), duty: "Bookings, invitations and imports" },
  ];
}

/* ---- milestones and report snapshots ---- */
export interface Milestone {
  key: string;
  date: LocalDate;
  label: string;
  detail: string;
  state: "done" | "today" | "upcoming";
  simulated: boolean;
  target: NavTarget | null;
}
export function reportMilestoneJobs(state: PhState, pid?: ProgrammeId): ScheduledJob[] {
  return state.jobs.filter((j) => {
    if (j.kind !== "report_milestone" || !j.linked) return false;
    if (!pid) return true;
    if (j.linked.kind === "programme") return j.linked.id === pid;
    if (j.linked.kind === "employer_report") return state.employerReports.some((r) => r.id === j.linked!.id && r.programmeId === pid);
    return false;
  }).sort((a, b) => ((a.nextRunAt || a.lastRunAt || "") < (b.nextRunAt || b.lastRunAt || "") ? -1 : 1));
}
export function milestones(state: PhState, pid: ProgrammeId): Milestone[] {
  return memo(state, "prg:ms:" + pid, () => {
    const p = ix(state).programmeById.get(pid)!;
    const t = today(state);
    const st = (d: LocalDate): Milestone["state"] => (d < t ? "done" : d === t ? "today" : "upcoming");
    const ss = programmeSessions(state, pid);
    const out: Milestone[] = [
      { key: "open", date: p.windowStart, label: "Programme window opens", detail: `Invitations live with code ${p.inviteCode}.`, state: st(p.windowStart), simulated: false, target: null },
    ];
    if (ss.length) {
      const first = ss[0], last = ss[ss.length - 1];
      out.push({ key: "first", date: first.session.date, label: "First clinic", detail: first.isPast ? `${shortSite(first.session)}, ${first.completed} of ${first.slots} attended.` : `${shortSite(first.session)}, ${first.booked} of ${first.slots} booked.`, state: st(first.session.date), simulated: false, target: { page: "Clinics", tab: "schedule", params: { session: first.session.id } } });
      const todays = ss.find((s) => s.isToday);
      if (todays) out.push({ key: "today", date: todays.session.date, label: "Clinic today", detail: `${shortSite(todays.session)}, ${todays.booked} of ${todays.slots} booked, ${todays.available} available.`, state: "today", simulated: false, target: { page: "Clinics", tab: "schedule", params: { session: todays.session.id } } });
      if (last.session.id !== first.session.id) out.push({ key: "last", date: last.session.date, label: "Last clinic", detail: `${shortSite(last.session)}, ${last.booked} of ${last.slots} booked so far.`, state: st(last.session.date), simulated: false, target: { page: "Clinics", tab: "schedule", params: { session: last.session.id } } });
    }
    out.push({ key: "close", date: p.windowEnd, label: "Programme window closes", detail: "Bookings close at the end of the window.", state: st(p.windowEnd), simulated: false, target: null });
    for (const j of reportMilestoneJobs(state, pid)) {
      const at = j.nextRunAt || j.lastRunAt;
      if (!at) continue;
      const d = localDateOf(at);
      out.push({ key: j.id, date: d, label: j.name, detail: j.lastResult, state: j.status === "ok" ? "done" : st(d), simulated: true, target: { page: "Work", tab: "schedules" } });
    }
    return out.sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? -1 : 1));
  });
}

export const REPORT_STATUS_LABEL: Record<EmployerReport["status"], string> = {
  draft: "Draft, disclosure review pending",
  reviewed: "Disclosure reviewed, awaiting clinician approval",
  approved: "Approved, snapshot frozen",
  exported: "Approved and exported",
};
export const programmeReports = (state: PhState, pid: ProgrammeId): EmployerReport[] => state.employerReports.filter((r) => r.programmeId === pid);

/* ---- forms and templates ---- */
const vnum = (v: string) => { const [a, b] = v.split(".").map(Number); return (a || 0) * 1000 + (b || 0); };
export const sortVersionsDesc = (vs: FormTemplateVersion[]) => vs.slice().sort((a, b) => vnum(b.version) - vnum(a.version));
export const draftOf = (t: FormTemplate) => t.versions.find((v) => v.status === "draft");
export const pendingOf = (t: FormTemplate) => t.versions.find((v) => v.status === "pending_approval");
export const currentOf = (t: FormTemplate) => t.versions.find((v) => v.version === t.currentVersion);
/** The version a viewer most likely wants: the open draft, then one awaiting approval, then the current one. */
export const defaultVersion = (t: FormTemplate) => (draftOf(t) || pendingOf(t) || currentOf(t) || t.versions[0]).version;
/** The number the next draft will get. Mirrors the reducer: one minor step above the highest version. */
export function nextDraftVersion(t: FormTemplate): string {
  const hi = sortVersionsDesc(t.versions)[0]?.version || t.currentVersion;
  const [maj, min] = hi.split(".").map(Number);
  return `${maj}.${(min || 0) + 1}`;
}

export interface TemplateUsage {
  episodesByVersion: Record<string, number>;
  upcomingByVersion: Record<string, number>;
  episodes: number;
  upcoming: number;
  programmes: Programme[];
  appointmentTypes: AppointmentType[];
}
export function templateUsage(state: PhState, templateId: string): TemplateUsage {
  return memo(state, "prg:tu:" + templateId, () => {
    const episodesByVersion: Record<string, number> = {};
    const upcomingByVersion: Record<string, number> = {};
    let episodes = 0, upcoming = 0;
    for (const e of state.episodes) {
      if (e.formSnapshot.templateId !== templateId) continue;
      episodesByVersion[e.formSnapshot.version] = (episodesByVersion[e.formSnapshot.version] || 0) + 1;
      episodes++;
    }
    for (const b of state.bookings) {
      if (b.formTemplateId !== templateId || b.status !== "confirmed" || b.attendance === "completed" || b.attendance === "no_show") continue;
      upcomingByVersion[b.formVersion] = (upcomingByVersion[b.formVersion] || 0) + 1;
      upcoming++;
    }
    return {
      episodesByVersion, upcomingByVersion, episodes, upcoming,
      programmes: state.programmes.filter((p) => p.templateId === templateId),
      appointmentTypes: state.appointmentTypes.filter((a) => a.templateId === templateId),
    };
  });
}

export interface BlockUse { template: FormTemplate; version: FormTemplateVersion; ref: TemplateBlockRef }
/** Every template version that references a block, newest first. */
export function blockUses(state: PhState, blockId: string): BlockUse[] {
  return memo(state, "prg:bu:" + blockId, () => {
    const out: BlockUse[] = [];
    for (const t of state.forms.templates) for (const v of sortVersionsDesc(t.versions)) {
      const ref = v.blocks.find((b) => b.blockId === blockId);
      if (ref) out.push({ template: t, version: v, ref });
    }
    return out;
  });
}
/** Templates whose live (published, draft or pending) version references this block version. */
export function sharedBy(state: PhState, block: FormBlock, blockVersion = block.version): BlockUse[] {
  const seen = new Set<string>();
  return blockUses(state, block.id).filter((u) => {
    if (u.ref.version !== blockVersion || u.version.status === "retired") return false;
    if (u.version.status !== "published" && u.template.versions.some((v) => v.status === "published" && v.blocks.some((b) => b.blockId === block.id && b.version === blockVersion))) return false;
    if (seen.has(u.template.id)) return false;
    seen.add(u.template.id);
    return true;
  });
}

export interface VersionDiff {
  added: TemplateBlockRef[];
  removed: TemplateBlockRef[];
  requiredChanged: TemplateBlockRef[];
  blockVersionChanged: Array<{ blockId: string; from: string; to: string }>;
  reordered: boolean;
  any: boolean;
}
export function versionDiff(base: FormTemplateVersion | undefined, v: FormTemplateVersion): VersionDiff {
  if (!base || base.version === v.version) return { added: [], removed: [], requiredChanged: [], blockVersionChanged: [], reordered: false, any: false };
  const bIds = base.blocks.map((b) => b.blockId);
  const vIds = v.blocks.map((b) => b.blockId);
  const added = v.blocks.filter((b) => !bIds.includes(b.blockId));
  const removed = base.blocks.filter((b) => !vIds.includes(b.blockId));
  const common = vIds.filter((id) => bIds.includes(id));
  const baseOrder = bIds.filter((id) => vIds.includes(id));
  const reordered = common.some((id, i) => baseOrder[i] !== id);
  const requiredChanged = v.blocks.filter((b) => { const o = base.blocks.find((x) => x.blockId === b.blockId); return !!o && o.required !== b.required; });
  const blockVersionChanged = v.blocks.flatMap((b) => { const o = base.blocks.find((x) => x.blockId === b.blockId); return o && o.version !== b.version ? [{ blockId: b.blockId, from: o.version, to: b.version }] : []; });
  return { added, removed, requiredChanged, blockVersionChanged, reordered, any: !!(added.length || removed.length || requiredChanged.length || blockVersionChanged.length || reordered) };
}

/**
 * Blocks that changed position relative to the base version. The longest run that kept its
 * relative order stays unmarked, so moving one block marks only that block.
 */
export function movedBlocks(base: FormTemplateVersion | undefined, v: FormTemplateVersion): Set<string> {
  if (!base) return new Set();
  const baseIds = base.blocks.map((b) => b.blockId);
  const seq = v.blocks.map((b) => b.blockId).filter((id) => baseIds.includes(id));
  const idx = seq.map((id) => baseIds.indexOf(id));
  const len = idx.map(() => 1), prev = idx.map(() => -1);
  for (let i = 0; i < idx.length; i++) for (let j = 0; j < i; j++) if (idx[j] < idx[i] && len[j] + 1 > len[i]) { len[i] = len[j] + 1; prev[i] = j; }
  let end = len.indexOf(Math.max(0, ...len));
  const keep = new Set<string>();
  while (end >= 0) { keep.add(seq[end]); end = prev[end]; }
  return new Set(seq.filter((id) => !keep.has(id)));
}

const valueText = (v: string | boolean) => (v === true ? "Yes" : v === false ? "No" : v);
/** "Smoking status is Current": the trigger for a conditional field, in words. */
export function conditionText(f: FieldDef, siblings: FieldDef[]): string | null {
  if (!f.showIf) return null;
  const trig = siblings.find((x) => x.key === f.showIf!.key);
  return `${trig ? trig.label : f.showIf.key} is ${valueText(f.showIf.equals)}`;
}

/** "14 to 20 Sep" or "28 Sep to 4 Oct". */
export function rangeShort(from: string, to: string): string {
  if (from === to) return fmtDayMonth(from);
  return from.slice(0, 7) === to.slice(0, 7) ? `${Number(from.slice(8))} to ${fmtDayMonth(to)}` : `${fmtDayMonth(from)} to ${fmtDayMonth(to)}`;
}

/** Field text such as "Height (m)". Skips a unit the label already states, and folds it into a trailing bracket. */
export function fieldShort(f: { label: string; unit?: string }): string {
  if (!f.unit || f.label.toLowerCase().includes(f.unit.toLowerCase())) return f.label;
  if (f.label.endsWith(")")) return `${f.label.slice(0, -1)}, ${f.unit})`;
  return `${f.label} (${f.unit})`;
}
export const ABSENCE_LABEL: Record<"missing" | "not_done" | "declined", string> = { missing: "Missing", not_done: "Not done", declined: "Declined" };

/* ---- invitations ---- */
export const defaultInviteMessage = (client: string) =>
  `Hello. You are invited to a Precision Health screening session for ${client} employees. Complete the short questionnaire and consent in the portal, then choose a slot. No health information is included in this message.`;

/** The same words the reducer rejects. Mirrored here so the form can explain the rule before submit. */
export const HEALTH_TERMS = /(result|diagnos|cholesterol|blood pressure)/i;
export function healthTermIn(text: string): string | null {
  const m = HEALTH_TERMS.exec(text || "");
  return m ? m[0] : null;
}

export interface StageCounts { all: number; invited: number; onboarding: number; upcoming: number; attended: number }
export function stageCounts(state: PhState, pid: ProgrammeId): StageCounts {
  return memo(state, "prg:stage:" + pid, () => {
    const rows = directory(state, { programmeId: pid });
    const c = (s: DirectoryRow["stage"]) => rows.filter((r) => r.stage === s).length;
    return { all: rows.length, invited: c("invited"), onboarding: c("onboarding"), upcoming: c("upcoming"), attended: c("attended") };
  });
}

export interface RecipientView { personId: string; name: string; status: string; inProgress: boolean; bookedNow: boolean; sectionsDone: number | null; sectionsTotal: number | null }
export function draftRecipients(state: PhState, d: InvitationDraft): RecipientView[] {
  return memo(state, "prg:rcp:" + d.id, () => {
    const I = ix(state);
    return d.recipientIds.map((id) => {
      const p = I.personById.get(id);
      const m = (I.membershipsByPerson.get(id) || [])[0];
      const bookedNow = (I.bookingsByPerson.get(id) || []).some((b) => b.status === "confirmed");
      const status = !m ? "Unknown" : (I.episodesByPerson.get(id) || []).length ? "Attended" : m.stage === "booked" ? "Booked" : m.stage === "onboarding" ? "Questionnaire in progress" : "Not started";
      return {
        personId: id, name: p ? `${p.given} ${p.family}` : id, status, inProgress: m?.stage === "onboarding", bookedNow,
        sectionsDone: m?.draft ? m.draft.sectionsDone : null, sectionsTotal: m?.draft ? m.draft.sectionsTotal : null,
      };
    });
  });
}
/** Eligible people who are not booked: who an invitation draft may go to. */
export function invitable(state: PhState, pid: ProgrammeId) {
  return memo(state, "prg:inv:" + pid, () => {
    const I = ix(state);
    return state.memberships.filter((m) => m.programmeId === pid && m.eligible && m.stage !== "booked").map((m) => {
      const p = I.personById.get(m.personId)!;
      return { personId: m.personId, name: `${p.given} ${p.family}`, inProgress: m.stage === "onboarding", sectionsDone: m.draft?.sectionsDone ?? null, sectionsTotal: m.draft?.sectionsTotal ?? null };
    });
  });
}

export const DRAFT_STATUS: Record<InvitationDraft["status"], { label: string; tone: "ok" | "warn" | "info" | "neutral" }> = {
  draft: { label: "Draft", tone: "info" },
  pending_approval: { label: "Awaiting approval", tone: "warn" },
  approved_simulated_sent: { label: "Approved, simulated send", tone: "ok" },
  rejected: { label: "Rejected, not sent", tone: "neutral" },
};
