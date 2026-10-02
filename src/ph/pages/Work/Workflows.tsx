/* Work, Workflows: Invite, Consent and questionnaire, Booking and Screening in the scheduling lane;
   Expected results, Clinical review and Released report in the clinical report lane, with branches
   to identity resolution, source unit confirmation and follow-up. The two lanes are separate state.
   Named people sit wherever their records are now, so they move when anything changes elsewhere. */
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  HOLD_CATEGORY, HOLD_LABEL, PROGRAMME_BY_ID, PROGRAMME_ORDER, canViewEpisodeClinical, currentReleased, episodeFlags, fmtDayMonth, fmtWeekdayDate, holdQueue, ix, linkFor,
  openFollowUps, programmeCounts, rate, reviewQueue, sessionStats, todaySessions,
} from "../../model";
import type { EntityKind, PhState, ProgrammeId, StoryId } from "../../model";
import { usePersona, usePhState } from "../../store";
import { useNav } from "../../nav-context";
import { Card, CardHeader, DataTable, EntityLink, Icon, PageHeader, Pill, Segmented } from "../../ui";
import type { Column, Tone } from "../../ui";
import { ProgTag, Tag, WIDE_MIN, isClinicalViewer, useMeasure } from "./shared";

type SchedStep = "invite" | "questionnaire" | "booking" | "screening";
type ReportStep = "awaiting" | "review" | "released" | "identity" | "data_quality" | "followup";
type ProgFilter = "all" | ProgrammeId;

interface Journey {
  personId: string;
  name: string;
  programmeId: ProgrammeId;
  story: StoryId | null;
  caseLabel: string;
  sched: { step: SchedStep; label: string };
  report: { step: ReportStep; label: string; episodeId: string } | null;
  /** Held laboratory row for identity cases, resolved or not. */
  rowId: string | null;
  rowResolved: boolean;
}

/* Named cases from the brief. Their position is always derived from current state. */
const NAMED: Array<{ personId: string; story: StoryId | null; caseLabel: string; clinicalOnly: boolean }> = [
  { personId: "PH-P-0801", story: "ST-03", caseLabel: "Portal onboarding example", clinicalOnly: false },
  { personId: "PH-P-0001", story: "ST-02", caseLabel: "Routine release example", clinicalOnly: true },
  { personId: "PH-P-0501", story: "ST-02", caseLabel: "Review required example", clinicalOnly: true },
  { personId: "PH-P-0002", story: "ST-01", caseLabel: "Date of birth mismatch", clinicalOnly: false },
  { personId: "PH-P-0502", story: "ST-01", caseLabel: "Unknown specimen identifier", clinicalOnly: false },
  { personId: "PH-P-0701", story: "ST-01", caseLabel: "Two candidate episodes", clinicalOnly: false },
  { personId: "PH-P-0003", story: "ST-04", caseLabel: "Clinician-assigned follow-up", clinicalOnly: true },
  { personId: "PH-P-0004", story: null, caseLabel: "Source unit discrepancy", clinicalOnly: true },
];

const SCHED_LABEL: Record<SchedStep, string> = { invite: "Invite", questionnaire: "Consent and questionnaire", booking: "Booking", screening: "Screening" };
const REPORT_LABEL: Record<ReportStep, string> = {
  awaiting: "Expected results", review: "Clinical review", released: "Released report", identity: "Identity resolution", data_quality: "Source unit confirmation", followup: "Follow-up",
};
const REPORT_TONE: Record<ReportStep, Tone> = { awaiting: "neutral", review: "info", released: "ok", identity: "warn", data_quality: "warn", followup: "bad" };

function journeyOf(state: PhState, personId: string, clinical: boolean, story: StoryId | null, caseLabel: string): Journey | null {
  const I = ix(state);
  const person = I.personById.get(personId);
  if (!person) return null;
  const m = (I.membershipsByPerson.get(personId) || [])[0];
  const confirmed = (I.bookingsByPerson.get(personId) || []).filter((b) => b.status === "confirmed");
  const dateOf = (sessionId: string) => I.sessionById.get(sessionId)?.date || "";
  const upcoming = confirmed.filter((b) => b.attendance !== "completed" && b.attendance !== "no_show")
    .sort((a, b) => (dateOf(a.sessionId) === dateOf(b.sessionId) ? (a.slotStart < b.slotStart ? -1 : 1) : dateOf(a.sessionId) < dateOf(b.sessionId) ? -1 : 1))[0];
  const attended = confirmed.filter((b) => b.attendance === "completed");

  let sched: Journey["sched"];
  if (upcoming) {
    const inClinic = upcoming.attendance === "checked_in" || upcoming.attendance === "in_progress";
    const rem = state.messages.find((x) => x.kind === "reminder" && x.bookingId === upcoming.id);
    const remText = !rem ? "" : rem.status === "failed" ? ", reminder failed" : rem.attempts.some((a) => a.outcome === "failed") ? ", reminder delivered on retry" : "";
    sched = inClinic
      ? { step: "screening", label: `In clinic today, ${upcoming.slotStart}` }
      : { step: "booking", label: `Booked ${fmtWeekdayDate(dateOf(upcoming.sessionId))}, ${upcoming.slotStart}${remText}` };
  } else if (attended.length) {
    sched = { step: "screening", label: `Attended ${fmtDayMonth(dateOf(attended[attended.length - 1].sessionId))}` };
  } else if (m && m.stage === "onboarding") {
    sched = {
      step: "questionnaire",
      label: m.questionnaire === "complete" ? "Questionnaire and consent complete, ready to book" : m.draft ? `Questionnaire ${m.draft.sectionsDone} of ${m.draft.sectionsTotal} sections saved` : "Questionnaire started",
    };
  } else {
    sched = { step: "invite", label: "Invited, not started" };
  }

  const eps = (I.episodesByPerson.get(personId) || []).slice().sort((a, b) => (a.collectedAt < b.collectedAt ? -1 : 1));
  const ep = eps[eps.length - 1];
  let report: Journey["report"] = null;
  let rowId: string | null = null;
  let rowResolved = false;
  if (ep) {
    // Capture roles see clinical labels only for their own sessions, as everywhere else in the model.
    const seeClinical = clinical && canViewEpisodeClinical(state, ep.id);
    const row = state.importRows.find((r) => (r.state === "quarantined" && ep.hold?.rowId === r.id) || (r.resolution && r.resolution.chosenEpisodeId === ep.id));
    rowId = row ? row.id : null;
    const resolved = !!row && row.state === "resolved";
    rowResolved = resolved;
    switch (ep.reportState) {
      case "on_hold": {
        const kind = ep.hold?.kind;
        const cat = kind ? HOLD_CATEGORY[kind] : "identity";
        if (cat === "identity") report = { step: "identity", label: kind ? HOLD_LABEL[kind] : "On hold for identity", episodeId: ep.id };
        else if (cat === "data_quality") report = { step: "data_quality", label: seeClinical && kind ? HOLD_LABEL[kind] : "On hold for a data quality check", episodeId: ep.id };
        else report = { step: "followup", label: seeClinical && kind ? HOLD_LABEL[kind] : "Clinical action assigned", episodeId: ep.id };
        break;
      }
      case "awaiting_results":
        report = { step: "awaiting", label: resolved ? "Identity resolved, awaiting remaining results" : "Awaiting expected results", episodeId: ep.id };
        break;
      case "ready_for_review": {
        const flagged = episodeFlags(state, ep).length > 0;
        const lead = resolved ? "Identity resolved, " : "";
        report = { step: "review", label: seeClinical ? `${lead}${resolved ? "ready" : "Ready"} for review, ${flagged ? "review required" : "routine"}` : `${lead}${resolved ? "with" : "With"} the clinician`, episodeId: ep.id };
        break;
      }
      case "released": {
        const v = currentReleased(state, ep.id);
        const fu = (I.followUpsByEpisode.get(ep.id) || []).find((f) => f.status === "open");
        report = seeClinical
          ? { step: fu ? "followup" : "released", label: `Released v${v ? v.version : 1}${fu ? `, follow-up ${fu.id} open` : ""}`, episodeId: ep.id }
          : { step: "released", label: "Report released", episodeId: ep.id };
        break;
      }
    }
  }
  return { personId, name: `${person.given} ${person.family}`, programmeId: person.programmeId, story, caseLabel, sched, report, rowId, rowResolved };
}

export default function Workflows() {
  const state = usePhState();
  const p = usePersona();
  const nav = useNav();
  const [measure, width] = useMeasure<HTMLDivElement>();
  const wide = width === 0 || width >= WIDE_MIN;
  const clinical = isClinicalViewer(p);
  const [prog, setProg] = useState<ProgFilter>("all");
  const pid = prog === "all" ? undefined : prog;

  const c = programmeCounts(state, pid);
  const holds = holdQueue(state).filter((h) => !pid || h.episode.programmeId === pid);
  const idHolds = holds.filter((h) => h.category === "identity").length;
  const dqHolds = holds.filter((h) => h.category === "data_quality").length;
  const caHolds = holds.filter((h) => h.category === "clinical_action").length;
  const rq = reviewQueue(state).filter((i) => !pid || i.programme.id === pid);
  const fus = openFollowUps(state).filter((f) => !pid || f.followUp.programmeId === pid);
  const heldRows = state.importRows.filter((r) => r.state === "quarantined" && (!pid || state.episodes.find((e) => e.hold?.rowId === r.id)?.programmeId === pid)).length;
  const todayS = todaySessions(state).filter((s) => !pid || s.programmeId === pid).map((s) => sessionStats(state, s.id));
  const tBooked = todayS.reduce((n, s) => n + s.booked, 0);
  const tIn = todayS.reduce((n, s) => n + s.checkedIn + s.inProgress, 0);
  const tDone = todayS.reduce((n, s) => n + s.completed, 0);

  const journeys = useMemo(() => {
    const out: Journey[] = [];
    for (const n of NAMED) {
      if (n.clinicalOnly && !clinical) continue;
      const j = journeyOf(state, n.personId, clinical, n.story, n.caseLabel);
      if (j) out.push(j);
    }
    // Today's failed reminders, including any already retried: their bookings stay the same.
    const reminderPeople = state.messages
      .filter((m) => m.kind === "reminder" && m.attempts.some((a) => a.outcome === "failed") && m.bookingId)
      .map((m) => m.personId);
    for (const id of Array.from(new Set(reminderPeople))) {
      const j = journeyOf(state, id, clinical, "ST-05", "Reminder delivery failure");
      if (j) out.push(j);
    }
    return out;
  }, [state, clinical]);
  const shown = journeys.filter((j) => !pid || j.programmeId === pid);

  const go = (kind: EntityKind, id: string) => nav.go(linkFor(kind, id));
  const sched = (step: SchedStep) => shown.filter((j) => j.sched.step === step && !(step === "screening" && j.report)).map((j) => ({ key: j.personId, name: j.name, onClick: () => go("person", j.personId) }));
  const report = (step: ReportStep) => shown.filter((j) => j.report?.step === step).map((j) => ({
    key: j.personId, name: j.name, onClick: () => (clinical ? go("episode", j.report!.episodeId) : j.rowId ? go("row", j.rowId) : go("person", j.personId)),
  }));

  const columns: Column<Journey>[] = [
    {
      key: "person", header: "Person", nowrap: false,
      cell: (j) => (
        <div style={{ minWidth: 150 }}>
          <EntityLink kind="person" id={j.personId}>{j.name}</EntityLink>
          <div className="ph-wrap" style={{ gap: 5, marginTop: 3 }}><span className="phf-id">{j.personId}</span><ProgTag id={j.programmeId} /></div>
        </div>
      ),
    },
    { key: "case", header: "Why named", nowrap: false, cell: (j) => <div style={{ minWidth: 130 }}><div className="phf-small" style={{ color: "var(--body)" }}>{j.caseLabel}</div>{j.story ? <Tag mono>{j.story}</Tag> : null}</div> },
    {
      key: "sched", header: "Scheduling state", nowrap: false,
      cell: (j) => <div style={{ minWidth: 170 }}><Pill tone="brand" icon="calendar">{SCHED_LABEL[j.sched.step]}</Pill><div className="phf-small" style={{ marginTop: 4 }}>{j.sched.label}</div></div>,
    },
    {
      key: "report", header: "Clinical report state", nowrap: false,
      cell: (j) => j.report ? (
        <div style={{ minWidth: 170 }}>
          <Pill tone={REPORT_TONE[j.report.step]} icon={j.report.step === "released" ? "check" : j.report.step === "review" ? "eye" : j.report.step === "awaiting" ? "clock" : "alert"}>{REPORT_LABEL[j.report.step]}</Pill>
          <div className="phf-small" style={{ marginTop: 4 }}>{j.report.label}</div>
        </div>
      ) : <span className="phf-small">No episode yet. Starts at screening.</span>,
    },
    {
      key: "open", header: <span className="ph-faint">Record</span>, align: "right",
      cell: (j) => clinical && j.report ? <EntityLink kind="episode" id={j.report.episodeId}>{j.report.episodeId}</EntityLink>
        : j.rowId ? <EntityLink kind="row" id={j.rowId}>{j.rowResolved ? "Resolved row" : "Held row"}</EntityLink>
          : <EntityLink kind="person" id={j.personId}>Directory</EntityLink>,
    },
  ];
  /* Narrow containers: one column for the person and one for where they are now in both lanes. */
  const narrowColumns: Column<Journey>[] = [
    {
      key: "person", header: "Person", nowrap: false,
      cell: (j) => (
        <div style={{ minWidth: 130 }}>
          {columns[0].cell(j)}
          <div className="phf-note" style={{ marginTop: 4 }}>{j.caseLabel}{j.story ? `, ${j.story}` : ""}</div>
          <div style={{ marginTop: 2 }}>{columns[4].cell(j)}</div>
        </div>
      ),
    },
    {
      key: "now", header: "Where they are now", nowrap: false,
      cell: (j) => (
        <div className="ph-stack" style={{ gap: 8, minWidth: 160 }}>
          {columns[2].cell(j)}
          {columns[3].cell(j)}
        </div>
      ),
    },
  ];

  return (
    <div className="ph-page" ref={measure}>
      <PageHeader
        eyebrow="Work"
        title="Workflows"
        sub="Live counts from the shared store. Scheduling and the clinical report are separate lanes: a booking never changes a report and a report never changes a booking."
        actions={
          <Segmented label="Programme" value={prog} onChange={setProg}
            options={[{ id: "all", label: "All programmes" }, ...PROGRAMME_ORDER.map((id) => ({ id, label: PROGRAMME_BY_ID[id].clientName }))]} />
        }
      />
      <div className="ph-stack">
        <Card>
          <CardHeader title="Scheduling lane" sub={`People and bookings for ${pid ? PROGRAMME_BY_ID[pid].name : "all three programmes"}. ${c.invited} invited: ${c.notStarted} not started, ${c.drafts} with a questionnaire in progress, ${c.booked} confirmed bookings.`} />
          <div className={"phf-flow" + (wide ? "" : " vertical")}>
            <Step n={1} label="Invite" count={c.notStarted} unit="not started" sub={`of ${c.invited} invited`} people={sched("invite")} />
            <Arrow />
            <Step n={2} label="Consent and questionnaire" count={c.drafts} unit="in progress" sub="A draft is not a booking. Confirmation waits for a complete questionnaire and consent." people={sched("questionnaire")} />
            <Arrow />
            <Step n={3} label="Booking" count={c.upcoming} unit="upcoming" sub={`${c.booked} confirmed bookings: ${c.attended} attended, ${c.upcoming} still to come`} people={sched("booking")} />
            <Arrow />
            <Step n={4} label="Screening" count={c.attended} unit="attended" sub={`Today: ${tIn} in clinic and ${tDone} completed of ${tBooked} booked. Completing an appointment never releases a report.`} people={sched("screening")} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Clinical report lane" sub={`${c.episodes} screening episodes, one per attended appointment: ${c.released} released, ${c.ready} ready for review, ${c.awaiting} awaiting results, ${c.onHold} on hold.`} />
          <div className={"phf-flow" + (wide ? "" : " vertical")}>
            <Step n={5} label="Expected results" count={c.awaiting} unit="awaiting" sub="Expected laboratory results not all received or accounted for." people={clinical ? report("awaiting") : []} />
            <Arrow />
            <Step n={6} label="Clinical review" count={c.ready} unit="ready" sub={`${rq.filter((i) => i.routine).length} routine, ${rq.filter((i) => i.flagged).length} individually flagged. ${rq.filter((i) => i.aged).length} waiting over 48 hours, within the ${rq.length}.`} people={clinical ? report("review") : []} />
            <Arrow />
            <Step n={7} label="Released report" count={c.released} unit="released" sub={`${rate(c.released, c.attended)} of ${c.attended} attended. Released versions are kept when corrected.`} people={clinical ? report("released") : []} />
          </div>
          <div className="phf-sectiontitle" style={{ marginTop: 14 }}>Branches, each returning to Clinical review once resolved by a person</div>
          <div className={"phf-branches" + (wide ? "" : " narrow")}>
            <Branch label="Identity resolution" count={idHolds} unit={idHolds === 1 ? "episode on hold" : "episodes on hold"}
              sub={`${heldRows} laboratory row${heldRows === 1 ? "" : "s"} held. Resolved with a two-identifier check, never a fuzzy match.`} people={report("identity")} />
            <Branch label="Source unit confirmation" count={dqHolds} unit={dqHolds === 1 ? "episode on hold" : "episodes on hold"}
              sub="The laboratory confirms the unit. The received value is kept, with no silent conversion." people={clinical ? report("data_quality") : []} />
            <Branch label="Follow-up" count={fus.length} unit={fus.length === 1 ? "open follow-up" : "open follow-ups"}
              sub={clinical ? `${caHolds} ${caHolds === 1 ? "report" : "reports"} on hold for clinician-assigned follow-up. Closes only with a documented outcome and acknowledgement.` : "Clinical action assigned. Owned by a clinician. No clinical detail is shown to this role."}
              people={clinical ? report("followup") : []} />
          </div>
          {!clinical ? <div className="phf-note" style={{ marginTop: 10 }}><Icon name="lock" size={11} style={{ verticalAlign: "-1px", marginRight: 5 }} />Names in clinical review, follow-up and data quality holds are visible to clinical roles only.</div> : null}
        </Card>

        <Card pad={false}>
          <div style={{ padding: "16px 18px 4px" }}>
            <CardHeader title="Named people in this workflow" sub="Fictional demo participants. Each row reads the same records as Results, Clinics and Participants, so it moves as soon as an action is taken there." />
          </div>
          <DataTable rows={shown} columns={wide ? columns : narrowColumns} rowKey={(j) => j.personId} caption="Named people in this workflow" minWidth={wide ? 760 : undefined}
            empty={<div className="phf-note" style={{ padding: 16 }}>No named people in this programme.</div>} />
        </Card>
      </div>
    </div>
  );
}

function Arrow() {
  return <span className="phf-arrow" aria-hidden="true"><Icon name="chevronRight" size={16} /></span>;
}

interface PersonChip { key: string; name: string; onClick: () => void }
function People({ people }: { people: PersonChip[] }) {
  if (!people.length) return null;
  return (
    <div className="phf-people">
      {people.map((x) => (
        <button key={x.key} type="button" className="phf-person" onClick={x.onClick} title={`Open ${x.name}`}>
          <Icon name="user" size={11} />{x.name}
        </button>
      ))}
    </div>
  );
}

function Step({ n, label, count, unit, sub, people }: { n: number; label: string; count: number; unit: string; sub: ReactNode; people: PersonChip[] }) {
  return (
    <div className="phf-step">
      <span className="phf-step-num">STEP {n}</span>
      <span style={{ fontSize: 13, color: "var(--ink)", fontWeight: 500 }}>{label}</span>
      <span className="ph-row-flex" style={{ gap: 6, alignItems: "baseline" }}>
        <span className="phf-step-count">{count}</span>
        <span className="phf-small">{unit}</span>
      </span>
      <span className="phf-note">{sub}</span>
      <People people={people} />
    </div>
  );
}

function Branch({ label, count, unit, sub, people }: { label: string; count: number; unit: string; sub: ReactNode; people: PersonChip[] }) {
  return (
    <div className="phf-branch">
      <span className="ph-row-flex" style={{ gap: 6 }}>
        <Icon name="arrow" size={13} style={{ color: "var(--faint)", transform: "rotate(45deg)" }} />
        <span style={{ fontSize: 13, color: "var(--ink)", fontWeight: 500 }}>{label}</span>
      </span>
      <span className="ph-row-flex" style={{ gap: 6, alignItems: "baseline" }}>
        <span className="phf-step-count" style={{ fontSize: 20 }}>{count}</span>
        <span className="phf-small">{unit}</span>
      </span>
      <span className="phf-note">{sub}</span>
      <People people={people} />
    </div>
  );
}
