/* Operations dashboard, Neil's view. Four headline numbers, then today's clinics, results from the
   lab to release, the next 14 days, quality and programme delivery per client. Every number
   appears once and every row opens the queue or record behind it. Lab row names show only to roles
   that can match lab results; everyone else sees the counts. */
import { ix, linkFor } from "../../model";
import type { NavTarget } from "../../model";
import { useNav } from "../../nav-context";
import { usePersona, usePhState } from "../../store";
import { Button, Card, CardHeader, Icon, PALETTE, Pill } from "../../ui";
import { KpiBand } from "./KpiBand";
import type { BandKpi } from "./KpiBand";
import { opsStats } from "./select";
import { ActRow, AsOf, DASH_CSS, DayLine, Empty, Group, PROGRAMME_COLOR, Stat } from "./shared";

const QUEUE: NavTarget = { page: "Results", tab: "imports", params: { view: "queue" } };

export default function OperationsDashboard() {
  const s = usePhState();
  const nav = useNav();
  const O = opsStats(s);
  const items: BandKpi[] = [
    { key: "clinics", label: "Clinics today", value: O.today.length, icon: "calendar",
      sub: `${O.todayBooked} of ${O.todayCapacity} appointments booked`, hint: "Open today's clinics", onClick: () => nav.go({ page: "Clinics", tab: "overview" }) },
    { key: "lab", label: "Lab rows to match", value: O.labRows.length, icon: "flask", tone: O.labRows.length ? "warn" : "ok", status: O.labRows.length ? "Top priority" : "All matched",
      sub: "Results not on any record yet", hint: "Open the matching queue", onClick: () => nav.go(QUEUE) },
    { key: "ready", label: "Ready for review", value: O.ready, icon: "file",
      sub: "Reports waiting for a doctor to check and release", hint: "Open the review queue", onClick: () => nav.go({ page: "Results", tab: "review" }) },
    { key: "released", label: "Released, last 7 days", value: O.releasedWeek, icon: "send",
      sub: "Reports participants can now see", hint: "Open the results inbox", onClick: () => nav.go({ page: "Results", tab: "inbox" }) },
  ];
  return (
    <div className="ph-page">
      <style>{DASH_CSS}</style>
      <KpiBand eyebrow="Operations dashboard · Today" title="Operations at a glance" right={<AsOf nowUtc={s.clock.nowUtc} />} items={items} />
      <div className="ph-stack" style={{ marginTop: 14 }}>
        <div className="dsh-grid32">
          <div className="ph-stack dsh-col">
            <TodayCard />
            <NextDaysCard />
          </div>
          <div className="ph-stack dsh-col">
            <ResultsCard />
            <QualityCard />
          </div>
        </div>
        <DeliveryCard />
      </div>
    </div>
  );
}

/* ---- today's clinics ---- */
function TodayCard() {
  const s = usePhState();
  const nav = useNav();
  const O = opsStats(s);
  return (
    <Card>
      <CardHeader title="Today's clinics" sub={`${O.todayLab} lab bloods, ${O.todayPoc} point of care. Point of care results can go out the same day.`}
        right={<Button size="sm" variant="ghost" icon="arrow" onClick={() => nav.go({ page: "Clinics", tab: "overview" })}>Clinics</Button>} />
      {O.today.length ? O.today.map((r) => (
        <ActRow key={r.session.id} onClick={() => nav.go({ page: "Clinics", tab: "appointments", params: { session: r.session.id, date: r.session.date } })}
          label={`Open ${r.st.programme.clientName} appointments`}
          title={<><span aria-hidden="true" style={{ display: "inline-block", width: 8, height: 8, borderRadius: 3, background: PROGRAMME_COLOR[r.session.programmeId] || PALETTE[3], marginRight: 8, verticalAlign: 1 }} />{r.st.programme.clientName}</>}
          sub={`${r.nurse} · ${r.roomTbc ? "Room to be confirmed" : r.session.room} · ${r.session.start} to ${r.session.end}`}
          right={<>
            <Pill tone={r.poc ? "info" : "neutral"} icon={r.poc ? "heart" : "flask"}>{r.poc ? "Point of care" : "Lab"}</Pill>
            <span className="ph-num" style={{ fontSize: 12, color: "var(--body)", whiteSpace: "nowrap" }}>{r.st.booked} booked · {r.st.checkedIn + r.st.inProgress} in · {r.st.completed} done</span>
          </>} />
      )) : <Empty>No clinics today.</Empty>}
    </Card>
  );
}

/* ---- results ---- */
function ResultsCard() {
  const s = usePhState();
  const nav = useNav();
  const p = usePersona();
  const O = opsStats(s);
  const I = ix(s);
  const canSee = p.perms.has("imports.view");
  const word = (d: { name: boolean; dob: boolean; id: boolean }) => [d.name ? "name" : null, d.dob ? "date of birth" : null, d.id ? "Unique ID" : null].filter(Boolean).join(", ");
  return (
    <Card>
      <CardHeader title="Results" sub="From the lab to the participant. Nothing attaches to a record until name, date of birth and Unique ID all agree." />
      <Group title="Lab rows to match" right={O.labRows.length ? <Pill tone="warn" icon="alert">Top priority</Pill> : null}>
        {O.labRows.length ? O.labRows.slice(0, 3).map((q) => {
          const who = q.candidate ? I.personById.get(q.candidate.personId) : null;
          return (
            <ActRow key={q.key} onClick={() => nav.go(QUEUE)} label="Open the matching queue"
              title={canSee ? `${q.file.surname}${q.file.given ? `, ${q.file.given}` : ""}` : `Row from ${q.filename}`}
              sub={canSee ? (who ? `Closest: ${who.given} ${who.family}. Differs on ${word(q.diff)}` : "No patient found in Pulse") : "Names shown to staff who match lab results"} />
          );
        }) : <Empty>Every lab row is matched.</Empty>}
        {O.labRows.length > 3 ? <div className="ph-faint" style={{ fontSize: 11.5, paddingTop: 6 }}>And {O.labRows.length - 3} more in the queue.</div> : null}
      </Group>
      <div className="dsh-stats" style={{ marginTop: 14 }}>
        <Stat label="Awaiting lab" value={O.awaitingLab} sub="Bloods taken, results not back" onClick={() => nav.go({ page: "Results", tab: "inbox", params: { queue: "awaiting" } })} />
        <Stat label="Over 48 hours" value={O.over48} sub="Ready, still not released" tone={O.over48 ? "warn" : undefined} onClick={() => nav.go({ page: "Results", tab: "review", params: { filter: "aged" } })} />
        <Stat label="Same day, point of care" value={O.sameDayPoc} sub="Released on the clinic day, last 7 days" onClick={() => nav.go({ page: "Results", tab: "inbox" })} />
      </div>
    </Card>
  );
}

/* ---- next 14 days ---- */
function NextDaysCard() {
  const s = usePhState();
  const nav = useNav();
  const O = opsStats(s);
  return (
    <Card>
      <CardHeader title="Next 14 days" sub={`${O.next14.length} screening ${O.next14.length === 1 ? "day" : "days"}, ${O.next14Booked} of ${O.next14Capacity} appointments booked.`}
        right={<Button size="sm" variant="ghost" icon="arrow" onClick={() => nav.go({ page: "Clinics", tab: "days" })}>Screening days</Button>} />
      <div className="ph-wrap" style={{ gap: 6, marginTop: -4, marginBottom: 8 }}>
        {O.next14CoverGaps ? <Pill tone="bad" icon="user">{O.next14CoverGaps} nurse cover {O.next14CoverGaps === 1 ? "gap" : "gaps"}</Pill> : <Pill tone="ok" icon="user">Nurse cover in place for every day</Pill>}
        {O.next14Drafts ? <Pill tone="neutral" icon="edit">{O.next14Drafts} still in draft</Pill> : null}
      </div>
      {O.next14.length ? O.next14.map((r) => <DayLine key={r.session.id} r={r} showNurse />) : <Empty>No screening days in the next 14 days.</Empty>}
    </Card>
  );
}

/* ---- quality ---- */
function QualityCard() {
  const s = usePhState();
  const nav = useNav();
  const O = opsStats(s);
  const n = (v: number, tone: "warn" | "bad" = "warn") => <Pill tone={v ? tone : "ok"} icon={null}><span className="ph-num">{v}</span></Pill>;
  return (
    <Card>
      <CardHeader title="Quality" sub="Things to put right so every report is safe to release." />
      <ActRow onClick={() => nav.go({ page: "Results", tab: "inbox", params: { queue: "held" } })} title="Data quality holds" sub="Results held for a unit or value check" right={n(O.dataQuality)} />
      <ActRow onClick={() => nav.go({ page: "Results", tab: "corrections" })} title="Corrections in progress" sub="Released reports being corrected" right={n(O.corrections)} />
      <ActRow onClick={() => nav.go({ page: "Results", tab: "follow-up" })} title="Urgent result follow-ups" sub={O.followUpsOverdue ? `${O.followUpsOverdue} overdue` : "Calls to participants about urgent results"} right={n(O.followUps, O.followUpsOverdue ? "bad" : "warn")} />
      <ActRow onClick={() => nav.go({ page: "Screening", tab: "questions" })} title="Reference range questions" sub="Open in Health Screening, To confirm" right={n(O.rangeQuestions)} />
    </Card>
  );
}

/* ---- programme delivery per client ---- */
function DeliveryCard() {
  const s = usePhState();
  const nav = useNav();
  const O = opsStats(s);
  return (
    <Card>
      <CardHeader title="Programme delivery" sub="For each client: people invited, booked, attended and with their report released. Bars are out of everyone invited."
        right={<Button size="sm" variant="ghost" icon="arrow" onClick={() => nav.go({ page: "Programmes", tab: "overview" })}>Programmes</Button>} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 }}>
        {O.programmes.map((pr) => {
          const color = PROGRAMME_COLOR[pr.id] || PALETTE[0];
          const cells: Array<[string, number]> = [["Invited", pr.invited], ["Booked", pr.booked], ["Attended", pr.attended], ["Released", pr.released]];
          return (
            <button key={pr.id} type="button" className="dsh-stat" onClick={() => nav.go(linkFor("programme", pr.id))} aria-label={`Open ${pr.name}`}>
              <div className="ph-row-flex" style={{ gap: 8 }}>
                <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: 3, background: color, flex: "none" }} />
                <span className="ph-grow ph-trunc" style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{pr.client}</span>
                <Icon name="arrow" size={13} style={{ color: "var(--faint)" }} />
              </div>
              <div className="ph-faint ph-trunc" style={{ fontSize: 11.5, marginTop: 2 }}>{pr.name}</div>
              <div className="dsh-prog">
                {cells.map(([label, v]) => (
                  <div key={label} className="dsh-prog-cell">
                    <div className="ph-track" role="img" aria-label={`${label}: ${v} of ${pr.invited} invited`}><div className="ph-fill" style={{ width: `${pr.invited ? Math.min(100, (v / pr.invited) * 100) : 0}%`, background: color }} /></div>
                    <div className="dsh-prog-label">{label} <b>{v}</b></div>
                  </div>
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
