/* Agents, Overview: the seven agents with their job, permitted data scope, what each may and may
   not do, the last simulated action and the items waiting for a human. "AI handled" means a visible
   simulated preparation or check, never an automated decision. Every figure is derived from the
   shared store, and the action counts are the same entries as the Activity feeds. */
import { useMemo } from "react";
import AgentFace from "../../../components/AgentFace";
import {
  AGENT_DEFS, agentEvents, batchStats, canViewEpisodeClinical, fmtWhen, jobViews, linkFor, localDateOf, plural, programmeCounts, reminderStats, scheduleOverlaps, sessionStats, staffName,
  storyViews, today, todaySessions, visibleTasks,
} from "../../model";
import type { ActivityView, AgentDef, NavTarget, PhState } from "../../model";
import { usePersona, usePhState } from "../../store";
import { useNav } from "../../nav-context";
import { Button, Card, DemoTag, Icon, Kpi, KpiStrip, PageHeader, Pill, Drawer } from "../../ui";
import type { GlyphName, Tone } from "../../ui";
import { StaffOnly, Tag, WIDE_MIN, isClinicalViewer, mergeParams, storyVisible, useMeasure } from "../Work/shared";
import { EventDrawer, EventRow, useEventParam } from "../Activity/feed";
import "../Work/phf.css";

type FaceState = "working" | "thinking" | "waiting" | "complete" | "attention" | "idle";
interface AgentItem { key: string; label: string; detail?: string; tone: Tone; target?: NavTarget }
interface AgentInfo {
  def: AgentDef;
  events: ActivityView[];
  last: ActivityView | null;
  todayCount: number;
  pending: number;
  itemsTitle: string;
  items: AgentItem[];
  context: string[];
  face: FaceState;
  statusLabel: string;
  statusTone: Tone;
}

const ROW_REASON: Record<"dob_mismatch" | "unknown_specimen" | "multiple_candidates", string> = {
  dob_mismatch: "date of birth mismatch", unknown_specimen: "unknown specimen identifier", multiple_candidates: "two candidate episodes",
};
/** The optional flag is shown as a tag, so the job text does not repeat it. */
const jobText = (d: AgentDef) => d.job.replace(/^Optional P1 preview\.\s*/, "");
const TONE_ICON: Record<Tone, GlyphName> = { ok: "check", warn: "alert", bad: "alert", info: "info", neutral: "dot", brand: "dot" };
const TONE_COLOR: Record<Tone, string> = { ok: "var(--ok)", warn: "var(--warn)", bad: "var(--bad)", info: "var(--accent)", neutral: "var(--faint)", brand: "var(--accent)" };

function agentInfo(state: PhState, def: AgentDef, feed: ActivityView[], clinical: boolean): AgentInfo {
  const events = feed.filter((v) => v.event.actor.id === def.id);
  const last = events[0] || null;
  const t = today(state);
  const todayCount = events.filter((v) => localDateOf(v.event.at) === t).length;
  const items: AgentItem[] = [];
  const context: string[] = [];
  let pending = 0;
  let itemsTitle = "Waiting for a human";
  switch (def.id) {
    case "briefing": {
      itemsTitle = "Claims in today's briefing, each linked to its queue";
      const open = storyViews(state).filter((s) => s.open && storyVisible(s));
      open.forEach((s) => items.push({ key: s.def.id, label: s.headline, detail: `${s.def.id}, owner ${s.ownerName}`, tone: "info", target: s.target }));
      if (!open.length) items.push({ key: "none", label: "No open stories. Everything visible to this role is resolved.", tone: "ok" });
      context.push("Prepares summaries only, so nothing waits for approval. Operations roles get a logistics-only version without clinical detail.");
      break;
    }
    case "watchdog": {
      const r = reminderStats(state);
      const failedJobs = jobViews(state).filter((j) => j.status === "failed");
      const late = visibleTasks(state).filter((x) => !x.task.clinical && x.status !== "done" && x.overdue);
      const overlaps = scheduleOverlaps(state);
      const ibm = todaySessions(state).find((s) => s.programmeId === "PRG-IBM-26");
      const ibmSt = ibm ? sessionStats(state, ibm.id) : null;
      items.push(r.failed
        ? { key: "rem", label: `${plural(r.failed, "failed reminder")} for today's clinics, ${r.delivered} of ${r.logical} delivered`, tone: "bad", target: { page: "Participants", tab: "communications", params: { filter: "failed" } } }
        : { key: "rem", label: `All ${r.logical} of today's reminders delivered`, tone: "ok" });
      failedJobs.forEach((j) => items.push({ key: j.id, label: `${j.name}: last run failed`, tone: "bad", target: { page: "Work", tab: "schedules", params: { job: j.id } } }));
      items.push(late.length
        ? { key: "late", label: `${plural(late.length, "late operational task")}`, tone: "warn", target: { page: "Work", tab: "tasks", params: { status: "overdue" } } }
        : { key: "late", label: "No late operational tasks", tone: "ok" });
      items.push(overlaps.length
        ? { key: "ovl", label: `${plural(overlaps.length, "staff overlap")} between sessions`, tone: "bad", target: { page: "Clinics", tab: "schedule" } }
        : { key: "ovl", label: `No nurse or support overlaps across ${state.sessions.length} sessions`, tone: "ok" });
      if (ibm && ibmSt && ibmSt.available) items.push({ key: "cap", label: `IBM clinic has ${ibmSt.available} available slots today, ${ibmSt.booked} of ${ibmSt.slots} booked`, tone: "info", target: linkFor("session", ibm.id) });
      pending = r.failed + late.length + overlaps.length;
      context.push("Flags problems for a person to act on. It never triages a medical result and never cancels an appointment.");
      break;
    }
    case "booking": {
      const pend = state.approvals.filter((a) => a.type === "invitation_prep" && a.status === "pending");
      pend.forEach((a) => items.push({ key: a.id, label: `${a.title}, awaiting ${staffName(state, a.reviewerId)}`, tone: "warn", target: linkFor(a.target.kind, a.target.id) }));
      if (!pend.length) items.push({ key: "none", label: "No invitation list is waiting for approval", tone: "ok" });
      const st3 = storyViews(state).find((s) => s.def.id === "ST-03");
      if (st3 && st3.open) items.push({ key: "cap", label: st3.headline, tone: "info", target: st3.target });
      const ibmC = programmeCounts(state, "PRG-IBM-26");
      if (ibmC.drafts) items.push({ key: "drafts", label: `${plural(ibmC.drafts, "IBM invitee")} with a questionnaire in progress cannot confirm a booking yet`, tone: "info", target: { page: "Participants", tab: "directory" } });
      pending = pend.length;
      context.push("Drafts lists and messages only. A person confirms the recipients before any simulated send.");
      break;
    }
    case "lab": {
      const held = state.importRows.filter((r) => r.state === "quarantined");
      held.forEach((r) => items.push({ key: r.id, label: `Row ${r.id}: ${r.quarantine ? ROW_REASON[r.quarantine.reason] : "held"}`, tone: "warn", target: linkFor("row", r.id) }));
      if (!held.length) items.push({ key: "none", label: "No held rows. Each exception was resolved by a person with a two-identifier check.", tone: "ok" });
      const b = batchStats(state, "BATCH-20261002-01");
      context.push(`Batch BATCH-20261002-01: ${b.imported} rows imported, ${b.duplicates} duplicates skipped and ${b.quarantined} held, of ${b.rows}. It explains why a row is held and never matches a person itself.`);
      pending = held.length;
      break;
    }
    case "drafting": {
      const on = state.settings.aiDraftingOn;
      const drafts = Object.keys(state.aiDrafts);
      const mine = clinical ? drafts.filter((id) => canViewEpisodeClinical(state, id)) : [];
      mine.forEach((id) => items.push({ key: id, label: `Drafting preview for ${id}, awaiting clinician edit and approval`, tone: "warn", target: linkFor("episode", id) }));
      if (drafts.length > mine.length) items.push({ key: "n", label: `${plural(drafts.length - mine.length, "drafting preview")} awaiting a clinician`, tone: "warn" });
      if (!drafts.length) {
        items.push(on
          ? { key: "none", label: "No drafting preview is waiting. It runs only when a clinician asks for one in Results, Review.", tone: "ok" }
          : { key: "none", label: "Preview switched off in Settings, AI Controls. Clinicians write advice manually and the workflow is unaffected.", tone: "neutral" });
      }
      pending = drafts.length;
      context.push(on ? "Preview on. The clinician edits and approves every word. No diagnosis, invented measurement, urgency decision or release." : "Preview off.");
      break;
    }
    case "reporting": {
      const pend = state.approvals.filter((a) => a.type === "employer_report" && a.status === "pending");
      pend.forEach((a) => items.push({ key: a.id, label: `${a.title}, sign-off awaiting ${staffName(state, a.reviewerId)}`, tone: "warn", target: linkFor(a.target.kind, a.target.id) }));
      if (!pend.length) items.push({ key: "none", label: "No employer report is waiting for sign-off", tone: "ok" });
      const er = state.employerReports.find((r) => r.id === "ER-SISK-01");
      if (er && er.blockedAttempts) items.push({ key: "blocked", label: `${plural(er.blockedAttempts, "small-cohort selection")} blocked from employer output on ${er.id}`, tone: "info", target: linkFor("employer_report", er.id) });
      pending = pend.length;
      context.push("Works from the disclosure-controlled aggregate snapshot only. It cannot see participant free text and cannot approve its own draft.");
      break;
    }
    case "quality": {
      const open = state.dqIssues.filter((i) => i.status === "open");
      open.forEach((i) => {
        const seeEpisode = clinical && (!i.episodeId || canViewEpisodeClinical(state, i.episodeId));
        items.push({
          key: i.id, label: `${i.id}: ${i.title}`, detail: seeEpisode ? i.detail : undefined, tone: "warn",
          target: seeEpisode && i.episodeId ? linkFor("episode", i.episodeId) : i.kind === "identifier" ? { page: "Results", tab: "imports", params: { batch: "BATCH-20261002-01" } } : undefined,
        });
      });
      if (!open.length) items.push({ key: "none", label: "No open data quality issues", tone: "ok" });
      const ack = state.dqIssues.filter((i) => i.status === "acknowledged").length;
      if (ack) context.push(`${plural(ack, "issue")} acknowledged and waiting for a person to resolve.`);
      if (open.some((i) => i.episodeId && !(clinical && canViewEpisodeClinical(state, i.episodeId)))) context.push("Issue details on clinical episodes are visible to the clinicians responsible for them.");
      context.push("Raises issues and points to the record. It never proposes a replacement clinical threshold or edits a result.");
      pending = open.length;
      break;
    }
  }
  const draftingOff = def.id === "drafting" && !state.settings.aiDraftingOn;
  const face: FaceState = draftingOff ? "idle" : def.id === "watchdog" && pending ? "attention" : pending ? "waiting" : todayCount ? "complete" : "idle";
  const statusLabel = def.id === "briefing" ? "Summary only" : draftingOff ? "Preview off" : pending ? `${pending} awaiting a human` : "Nothing waiting";
  const statusTone: Tone = def.id === "briefing" ? "info" : draftingOff ? "neutral" : pending ? "warn" : "ok";
  return { def, events, last, todayCount, pending, itemsTitle, items, context, face, statusLabel, statusTone };
}

export default function AgentsOverview() {
  return <StaffOnly title="Agents"><OverviewBody /></StaffOnly>;
}

function OverviewBody() {
  const state = usePhState();
  const p = usePersona();
  const nav = useNav();
  const ev = useEventParam();
  const [measure, width] = useMeasure<HTMLDivElement>();
  const wide = width === 0 || width >= WIDE_MIN;
  const clinical = isClinicalViewer(p);
  const feed = useMemo(() => agentEvents(state), [state]);
  const infos = useMemo(() => AGENT_DEFS.map((d) => agentInfo(state, d, feed, clinical)), [state, feed, clinical]);
  const param = nav.params.agent && AGENT_DEFS.some((a) => a.id === nav.params.agent) ? nav.params.agent : null;
  const selected = infos.find((i) => i.def.id === param) || (wide ? infos[0] : null);
  const select = (id: string) => nav.setParams(mergeParams(nav.params, { agent: id, event: null }));
  const totalToday = infos.reduce((n, i) => n + i.todayCount, 0);
  // Distinct items: a Data Quality identifier issue on a row that is still held is the same exception as that held row.
  const heldKeys = state.importRows.filter((r) => r.state === "quarantined").map((r) => r.specimenKey);
  const dupIssues = state.dqIssues.filter((i) => i.status === "open" && i.kind === "identifier" && heldKeys.some((k) => i.detail.includes(k))).length;
  const pendingOf = (id: string) => infos.find((i) => i.def.id === id)?.pending || 0;
  const parts = [
    { n: pendingOf("booking") + pendingOf("reporting"), one: "approval", many: "approvals" },
    { n: pendingOf("lab"), one: "held laboratory row", many: "held laboratory rows" },
    { n: pendingOf("quality") - dupIssues, one: "data quality issue", many: "data quality issues" },
    { n: pendingOf("watchdog"), one: "flagged operational item", many: "flagged operational items" },
    { n: pendingOf("drafting"), one: "drafting preview", many: "drafting previews" },
  ].filter((x) => x.n > 0);
  const awaiting = parts.reduce((n, x) => n + x.n, 0);
  const awaitingSub = parts.length ? `${parts.map((x) => `${x.n} ${x.n === 1 ? x.one : x.many}`).join(", ")}.${dupIssues ? " A held row also raised as an identifier issue is counted once." : ""}` : "Nothing is waiting for a person.";
  const on = state.settings.aiDraftingOn;

  const list = (
    <Card pad={false}>
      {infos.map((i) => (
        <button key={i.def.id} type="button" className={"phf-agent" + (wide ? "" : " narrow")} aria-current={selected?.def.id === i.def.id} onClick={() => select(i.def.id)}>
          <AgentFace shape={i.def.shape} tint={i.def.tint} state={i.face} size={36} />
          <span style={{ minWidth: 0 }}>
            <span className="ph-row-flex" style={{ gap: 8, flexWrap: "wrap" }}>
              <span className="phf-strong" style={{ fontSize: 13.5 }}>{i.def.name}</span>
              {i.def.optional ? <Tag>Optional P1 preview</Tag> : null}
            </span>
            <span className="phf-small" style={{ display: "block", marginTop: 2 }}>{jobText(i.def)}</span>
            <span className="phf-note" style={{ display: "block", marginTop: 3 }}>
              {i.last ? `Last action: ${fmtWhen(i.last.event.at, state.clock.nowUtc)}. ${i.last.text}` : "No simulated action yet."}
            </span>
          </span>
          <span className="phf-agent-side"><Pill tone={i.statusTone}>{i.statusLabel}</Pill></span>
        </button>
      ))}
    </Card>
  );

  return (
    <div className="ph-page" ref={measure}>
      <PageHeader
        eyebrow="Agents"
        title="Overview"
        sub="Seven agents prepare, check and explain. People decide. Each agent sees only its permitted data, and every action it takes is a visible, simulated preparation in the activity log."
        actions={<DemoTag>Simulated agents, no model connected</DemoTag>}
      />
      <div className="ph-stack">
        <KpiStrip>
          <Kpi label="Agents" value={AGENT_DEFS.length} icon="spark" sub={`${AGENT_DEFS.filter((a) => !a.optional).length} core agents and ${AGENT_DEFS.filter((a) => a.optional).length} optional preview`} />
          <Kpi label="Simulated actions" value={feed.length} icon="list" sub={`${totalToday} today. The same entries as Activity, Agents.`} onClick={() => nav.go({ page: "Agents", tab: "activity" })} hint="Open the agent activity feed" />
          <Kpi label="Awaiting a human" value={awaiting} tone={awaiting ? "warn" : "ok"} sub={awaitingSub} hint="Distinct items agents prepared or flagged that wait for a person. Agents never decide." />
          <Kpi label="Clinical Drafting preview" value={on ? "On" : "Off"} icon="edit" sub="Set in Settings, AI Controls. Manual workflows never depend on it." onClick={() => nav.go({ page: "Settings", tab: "ai-controls" })} hint="Open AI Controls" />
        </KpiStrip>
        {wide ? (
          <div className="ph-split">
            <div className="ph-stack">{list}</div>
            <div className="ph-stack">{selected ? <AgentDetail state={state} info={selected} onOpenEvent={ev.open} /> : null}</div>
          </div>
        ) : list}
      </div>
      {!wide && selected ? (
        <Drawer open onClose={() => nav.setParams(mergeParams(nav.params, { agent: null }))} title={selected.def.name} sub={selected.def.optional ? "Optional P1 preview" : "Agent"}>
          <AgentDetail state={state} info={selected} onOpenEvent={ev.open} bare />
        </Drawer>
      ) : null}
      {ev.id ? <EventDrawer id={ev.id} onClose={ev.close} /> : null}
    </div>
  );
}

function AgentDetail({ state, info, onOpenEvent, bare }: { state: PhState; info: AgentInfo; onOpenEvent: (id: string) => void; bare?: boolean }) {
  const nav = useNav();
  const d = info.def;
  const recent = info.events.slice(0, 3);
  const body = (
    <div className="ph-stack" style={{ gap: 14 }}>
      <div className="ph-row-flex" style={{ gap: 12, alignItems: "flex-start" }}>
        <AgentFace shape={d.shape} tint={d.tint} state={info.face} size={46} />
        <div className="ph-grow">
          <div className="ph-row-flex" style={{ gap: 8, flexWrap: "wrap" }}>
            <span className="ph-h2" style={{ fontSize: 16 }}>{d.name}</span>
            {d.optional ? <Tag>Optional P1 preview</Tag> : null}
            <Pill tone={info.statusTone}>{info.statusLabel}</Pill>
          </div>
          <div className="phf-small" style={{ marginTop: 4 }}>{jobText(d)}</div>
        </div>
      </div>
      <div>
        <div className="phf-sectiontitle">Permitted data scope</div>
        <div className="ph-wrap" style={{ gap: 6 }}>{d.scope.map((s) => <Tag key={s}>{s}</Tag>)}</div>
      </div>
      <div className="phf-cols2 narrow" style={{ gap: 10 }}>
        <div>
          <div className="phf-sectiontitle">May do</div>
          <ul className="ph-stack" style={{ gap: 5, listStyle: "none", margin: 0, padding: 0 }}>
            {d.mayDo.map((s) => <li key={s} className="ph-row-flex" style={{ gap: 7, alignItems: "flex-start", fontSize: 12.5, color: "var(--body)" }}><Icon name="check" size={13} stroke={2} style={{ color: "var(--ok)", marginTop: 2 }} />{s}</li>)}
          </ul>
        </div>
        <div>
          <div className="phf-sectiontitle">May not do</div>
          <ul className="ph-stack" style={{ gap: 5, listStyle: "none", margin: 0, padding: 0 }}>
            {d.mayNotDo.map((s) => <li key={s} className="ph-row-flex" style={{ gap: 7, alignItems: "flex-start", fontSize: 12.5, color: "var(--body)" }}><Icon name="x" size={13} stroke={2} style={{ color: "var(--bad)", marginTop: 2 }} />{s}</li>)}
          </ul>
        </div>
      </div>
      <div>
        <div className="phf-sectiontitle">{info.itemsTitle}</div>
        <ul className="phf-list">
          {info.items.map((it) => (
            <li key={it.key} className="ph-row-flex" style={{ gap: 9, alignItems: "flex-start" }}>
              <Icon name={TONE_ICON[it.tone]} size={14} stroke={2} style={{ color: TONE_COLOR[it.tone], marginTop: 2 }} />
              <span className="ph-grow" style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 12.5, color: "var(--ink)", lineHeight: 1.4 }}>{it.label}</span>
                {it.detail ? <span className="phf-note" style={{ display: "block", marginTop: 2 }}>{it.detail}</span> : null}
              </span>
              {it.target ? <Button size="sm" variant="ghost" icon="arrow" onClick={() => nav.go(it.target!)} aria-label={`Open: ${it.label}`}>Open</Button> : null}
            </li>
          ))}
        </ul>
        {info.context.map((c) => <div key={c} className="phf-note" style={{ marginTop: 8 }}>{c}</div>)}
      </div>
      <div>
        <div className="phf-sectiontitle">Recent simulated actions, {info.events.length} in total</div>
        {recent.length ? (
          <Card flat pad={false}>{recent.map((v) => <EventRow key={v.event.id} v={v} onOpen={onOpenEvent} compact />)}</Card>
        ) : <div className="phf-note">No simulated action yet.{d.id === "drafting" ? " It acts only when a clinician asks for a drafting preview." : ""}</div>}
      </div>
      <div className="ph-wrap" style={{ gap: 8 }}>
        <Button icon="sms" onClick={() => nav.go(linkFor("agent", d.id))}>Open conversation</Button>
        <Button variant="ghost" icon="list" onClick={() => nav.go({ page: "Agents", tab: "activity", params: { agent: d.id } })}>All its actions</Button>
      </div>
    </div>
  );
  if (bare) return body;
  return <Card>{body}</Card>;
}
