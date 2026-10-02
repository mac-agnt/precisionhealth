/* The widget rail on Home. Briefings, queues and to-dos live here, never in the centre column.
   Every card reads the shared store and links to the filtered operational page. */
import type { ReactNode } from "react";
import { PROGRAMME_BY_ID, activityFeed, batchStats, episodeHeldByRow, fmtAge, fmtWhen, persona, personName, programmeCounts, reminderStats, reviewQueue, reviewStats, sessionStats, todaySessions, todayStats, today, visibleTasks, staffName, ix } from "../model";
import type { PhState } from "../model";
import { useNav } from "../nav-context";
import { usePhState } from "../store";
import { Icon, Pill, ProgressBar } from "../ui";

const REASON: Record<string, string> = { dob_mismatch: "Date of birth mismatch", unknown_specimen: "Unknown specimen ID", multiple_candidates: "Two candidate episodes" };

function Card({ title, count, tone, edit, onRemove, children, footer }: { title: string; count?: ReactNode; tone?: "ok" | "warn" | "bad" | "info"; edit: boolean; onRemove: () => void; children: ReactNode; footer?: ReactNode }) {
  return (
    <section className="ph-card" style={{ padding: "14px 16px 12px" }}>
      <div className="ph-row-flex" style={{ marginBottom: 6 }}>
        <div className="ph-grow" style={{ fontSize: 13.5, fontWeight: 500 }}>{title}</div>
        {count !== undefined ? <Pill tone={tone || "neutral"} icon={null}>{count}</Pill> : null}
        {edit ? <button type="button" className="ph-btn ph-btn-ghost ph-btn-icon ph-btn-sm" style={{ width: 24, height: 24 }} onClick={onRemove} aria-label={`Remove ${title}`}><Icon name="x" size={12} /></button> : null}
      </div>
      <div>{children}</div>
      {footer ? <div className="ph-faint" style={{ fontSize: 11.5, marginTop: 8, lineHeight: 1.45 }}>{footer}</div> : null}
    </section>
  );
}

function Row({ onClick, children }: { onClick?: () => void; children: ReactNode }) {
  return (
    <button type="button" className="ph-row" onClick={onClick} style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 6px", margin: "0 -6px", borderRadius: 10, border: 0, borderTop: "1px solid var(--border)", background: "none", cursor: onClick ? "pointer" : "default", font: "inherit", color: "inherit" }}>
      {children}
    </button>
  );
}

function ClinicsCard({ state, edit, remove }: { state: PhState; edit: boolean; remove: () => void }) {
  const nav = useNav();
  const D = todayStats(state);
  const rows = todaySessions(state).map((s) => sessionStats(state, s.id));
  return (
    <Card title="Today's clinics" count={`${D.booked} booked`} edit={edit} onRemove={remove}
      footer={<>{D.booked} of {D.capacity} slots booked ({D.pct.toFixed(0)}%), {D.available} available. <button type="button" className="ph-link" onClick={() => nav.go({ page: "Clinics", tab: "overview" })}>Open clinics</button></>}>
      {rows.map((st) => (
        <Row key={st.session.id} onClick={() => nav.go({ page: "Clinics", tab: "appointments", params: { session: st.session.id, date: st.session.date } })}>
          <div className="ph-row-flex" style={{ fontSize: 12.5 }}>
            <span className="ph-grow ph-trunc" style={{ color: "var(--ink)" }}>{st.programme.name}</span>
            <span className="ph-num" style={{ color: "var(--dim)" }}>{st.booked}/{st.slots}</span>
          </div>
          <div className="ph-faint ph-trunc" style={{ fontSize: 11, margin: "2px 0 6px" }}>{st.session.siteName}, {staffName(state, st.session.nurseId)}</div>
          <ProgressBar value={st.booked} max={st.slots} label={`${st.programme.name} booked slots`} />
        </Row>
      ))}
    </Card>
  );
}

function ImportsCard({ state, edit, remove }: { state: PhState; edit: boolean; remove: () => void }) {
  const nav = useNav();
  const b = batchStats(state, "BATCH-20261002-01");
  const held = state.importRows.filter((r) => r.state === "quarantined");
  const I = ix(state);
  return (
    <Card title="Eurofins import exceptions" count={`${b.quarantined} held`} tone={b.quarantined ? "warn" : "ok"} edit={edit} onRemove={remove}
      footer={<>{b.imported} imported, {b.duplicates} duplicates skipped, {b.quarantined} quarantined. These are rows, not people. <button type="button" className="ph-link" onClick={() => nav.go({ page: "Results", tab: "imports", params: { batch: b.batch.id } })}>Open the batch</button></>}>
      {held.length === 0 ? <div className="ph-dim" style={{ fontSize: 12.5, padding: "8px 0" }}>No rows are held. Every exception was resolved by a person.</div> : null}
      {held.map((r) => {
        const ep = episodeHeldByRow(state, r.id);
        return (
          <Row key={r.id} onClick={() => nav.go({ page: "Results", tab: "imports", params: { batch: r.batchId, row: r.id } })}>
            <div className="ph-row-flex" style={{ fontSize: 12.5 }}>
              <span className="ph-grow ph-trunc" style={{ color: "var(--ink)" }}>{REASON[r.quarantine!.reason]}</span>
              <span className="ph-faint ph-num" style={{ fontSize: 11 }}>{r.id.replace("BATCH-20261002-01-", "")}</span>
            </div>
            <div className="ph-faint ph-trunc" style={{ fontSize: 11, marginTop: 2 }}>{ep ? `${ep.id}, ${personName(I.personById.get(ep.personId))}` : "No episode matched"}</div>
          </Row>
        );
      })}
    </Card>
  );
}

function ReviewCard({ state, edit, remove }: { state: PhState; edit: boolean; remove: () => void }) {
  const nav = useNav();
  const p = persona(state);
  const rv = reviewStats(state);
  const clinical = p.perms.has("clinical.view") && p.perms.has("clinical.review");
  const top = clinical ? reviewQueue(state).slice(0, 3) : [];
  return (
    <Card title="Reports awaiting review" count={`${rv.ready} ready`} tone={rv.aged ? "warn" : "info"} edit={edit} onRemove={remove}
      footer={<>{rv.routine} routine and {rv.flagged} need individual review. The {rv.aged} over 48 hours are part of the {rv.ready}. {clinical ? <button type="button" className="ph-link" onClick={() => nav.go({ page: "Results", tab: "review" })}>Open the queue</button> : "Individual reports are limited to clinical roles."}</>}>
      {top.map((i) => (
        <Row key={i.episode.id} onClick={() => nav.go({ page: "Results", tab: "review", params: { episode: i.episode.id } })}>
          <div className="ph-row-flex" style={{ fontSize: 12.5 }}>
            <span className="ph-grow ph-trunc" style={{ color: "var(--ink)" }}>{personName(i.person)}</span>
            <span className="ph-faint ph-num" style={{ fontSize: 11 }}>{fmtAge(i.ageHours)}</span>
          </div>
          <div className="ph-row-flex" style={{ marginTop: 3 }}>
            <span className="ph-faint ph-trunc" style={{ fontSize: 11 }}>{i.episode.id}, {i.programme.code}</span>
            {i.flagged ? <Pill tone="warn">Review required</Pill> : <Pill tone="neutral" icon="check">Routine</Pill>}
          </div>
        </Row>
      ))}
      {!clinical ? <div className="ph-dim" style={{ fontSize: 12.5, padding: "8px 0 2px", lineHeight: 1.5 }}>{rv.ready} reports are with the clinical reviewer. Counts only for {p.roleLabel.toLowerCase()}.</div> : null}
    </Card>
  );
}

function CapacityCard({ state, edit, remove }: { state: PhState; edit: boolean; remove: () => void }) {
  const nav = useNav();
  const ibm = state.sessions.find((s) => s.programmeId === "PRG-IBM-26" && s.date === today(state));
  const st = ibm ? sessionStats(state, ibm.id) : null;
  const drafts = programmeCounts(state, "PRG-IBM-26").drafts;
  const rem = reminderStats(state);
  const draft = state.invitationDrafts.find((d) => d.programmeId === "PRG-IBM-26");
  return (
    <Card title="Capacity and reminders" count={st ? `${st.available} free` : undefined} tone="info" edit={edit} onRemove={remove}>
      {st ? (
        <Row onClick={() => nav.go({ page: "Programmes", tab: "invitations", params: { draft: "INV-IBM-01" } })}>
          <div style={{ fontSize: 12.5, color: "var(--ink)" }}>IBM has {st.available} available slots today</div>
          <div className="ph-faint" style={{ fontSize: 11, marginTop: 3, lineHeight: 1.45 }}>{st.booked} of {st.slots} booked ({st.pct.toFixed(0)}%). {drafts} {drafts === 1 ? "invitee has" : "invitees have"} an in-progress questionnaire and no confirmed booking. {draft && draft.status === "pending_approval" ? "Draft list awaiting approval." : ""}</div>
        </Row>
      ) : null}
      <Row onClick={() => nav.go({ page: "Participants", tab: "communications", params: { filter: "failed" } })}>
        <div className="ph-row-flex" style={{ fontSize: 12.5 }}>
          <span className="ph-grow" style={{ color: "var(--ink)" }}>Reminders for today</span>
          {rem.failed ? <Pill tone="bad">{rem.failed} failed</Pill> : <Pill tone="ok">All delivered</Pill>}
        </div>
        <div className="ph-faint ph-num" style={{ fontSize: 11, marginTop: 3 }}>{rem.delivered} of {rem.logical} logical reminders delivered. {rem.attempts} provider attempts, counted separately.</div>
      </Row>
    </Card>
  );
}

function WorkCard({ state, edit, remove }: { state: PhState; edit: boolean; remove: () => void }) {
  const nav = useNav();
  const p = persona(state);
  const mine = visibleTasks(state).filter((t) => t.status !== "done" && t.task.ownerId === p.id).sort((a, b) => ((a.task.dueAt || "9") < (b.task.dueAt || "9") ? -1 : 1));
  const shown = (mine.length ? mine : visibleTasks(state).filter((t) => t.status !== "done")).slice(0, 4);
  return (
    <Card title="My work" count={`${mine.length} open`} edit={edit} onRemove={remove}
      footer={<button type="button" className="ph-link" onClick={() => nav.go({ page: "Work", tab: "tasks" })}>Open tasks</button>}>
      {shown.length === 0 ? <div className="ph-dim" style={{ fontSize: 12.5, padding: "8px 0" }}>Nothing assigned to you.</div> : null}
      {shown.map((t) => (
        <Row key={t.task.id} onClick={() => nav.go({ page: "Work", tab: "tasks", params: { task: t.task.id } })}>
          <div style={{ fontSize: 12.5, color: "var(--ink)", lineHeight: 1.4 }}>{t.title}</div>
          <div className="ph-row-flex" style={{ marginTop: 3 }}>
            <span className="ph-faint ph-grow" style={{ fontSize: 11 }}>{t.task.dueAt ? fmtWhen(t.task.dueAt, state.clock.nowUtc) : "No due time"}, {t.ownerName}</span>
            {t.status === "blocked" ? <Pill tone="neutral" icon="lock">Blocked</Pill> : t.overdue ? <Pill tone="bad">Overdue</Pill> : null}
          </div>
        </Row>
      ))}
    </Card>
  );
}

function ActivityCard({ state, edit, remove }: { state: PhState; edit: boolean; remove: () => void }) {
  const nav = useNav();
  const feed = activityFeed(state, {}).slice(0, 5);
  return (
    <Card title="Recent activity" edit={edit} onRemove={remove} footer={<button type="button" className="ph-link" onClick={() => nav.go({ page: "Activity", tab: "everything" })}>Open the activity log</button>}>
      {feed.map((a) => (
        <Row key={a.event.id} onClick={() => nav.go({ page: "Activity", tab: "everything", params: { event: a.event.id } })}>
          <div style={{ fontSize: 12.5, color: "var(--ink)", lineHeight: 1.4 }}>{a.text}</div>
          <div className="ph-faint" style={{ fontSize: 11, marginTop: 3 }}>{fmtWhen(a.event.at, state.clock.nowUtc)}, {a.event.actor.label}{a.event.simulated ? ", simulated" : ""}</div>
        </Row>
      ))}
    </Card>
  );
}

export default function HomeBoard({ v }: { v: { show?: Record<string, boolean>; widgetEdit?: boolean; removeWidget?: (id: string) => void } }) {
  const state = usePhState();
  const p = persona(state);
  const show = v.show || {};
  const edit = !!v.widgetEdit;
  const rm = (id: string) => () => v.removeWidget && v.removeWidget(id);
  void PROGRAMME_BY_ID;
  return (
    <>
      {show.clinics && <ClinicsCard state={state} edit={edit} remove={rm("clinics")} />}
      {show.imports && p.perms.has("imports.view") && <ImportsCard state={state} edit={edit} remove={rm("imports")} />}
      {show.review && <ReviewCard state={state} edit={edit} remove={rm("review")} />}
      {show.capacity && <CapacityCard state={state} edit={edit} remove={rm("capacity")} />}
      {show.work && <WorkCard state={state} edit={edit} remove={rm("work")} />}
      {show.activity && <ActivityCard state={state} edit={edit} remove={rm("activity")} />}
    </>
  );
}
