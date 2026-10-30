/* Sales dashboard, Stephen's view. Four headline numbers for the period, then the lists he acts on:
   who needs a reply now, proposals out, onboarding, retention, revenue and the screening days still
   to come this month. Every number appears once and every row opens the record behind it. */
import { useState } from "react";
import { SALES_SERVICE_LABEL, SALES_STAGE_LABEL, fmtDayMonth, fmtWeekdayDate, today } from "../../model";
import type { NavTarget, SalesStage } from "../../model";
import { useNav } from "../../nav-context";
import { usePersona, usePhState } from "../../store";
import { Button, Card, CardHeader, PALETTE, Pill, Segmented } from "../../ui";
import { TouchTimer } from "../Sales/LeadFlow";
import { KpiBand } from "./KpiBand";
import type { BandKpi } from "./KpiBand";
import {
  DASH_PERIOD_LABEL, ONB_STUCK_DAYS, eur, fmtSecs, onboardingRows, pipelineByStage, retentionStats, revenueStats, salesNeeds, salesPeriodStats, salesUpcomingDays,
} from "./select";
import type { DashPeriod } from "./select";
import { ActRow, AsOf, BarRow, DASH_CSS, DayLine, Dots, Empty, Group, Stat } from "./shared";

/** Next steps shown before "and N more", to keep the list short. */
const NEXT_SHOWN = 5;
const lead = (id: string): NavTarget => ({ page: "Sales", tab: "pipeline", params: { lead: id } });

export default function SalesDashboard() {
  const s = usePhState();
  const nav = useNav();
  const [period, setPeriod] = useState<DashPeriod>("30d");
  const P = salesPeriodStats(s, period);
  const pending = salesNeeds(s).inbound;

  const items: BandKpi[] = [
    { key: "leads", label: "New leads", value: P.leads.length, icon: "user",
      sub: `${P.meetings} ${P.meetings === 1 ? "meeting" : "meetings"} held in the same period`, hint: "Open the pipeline", onClick: () => nav.go({ page: "Sales", tab: "pipeline" }) },
    { key: "touch", label: "First touch in 10 minutes", value: P.touchPct === null ? "None yet" : `${P.touchPct}%`, icon: "clock",
      tone: P.waiting ? "warn" : P.touchPct !== null && P.touchPct < 80 ? "warn" : "ok", status: P.waiting ? `${P.waiting} waiting now` : "Nobody waiting",
      sub: P.touched ? `${P.withinTarget} of ${P.touched} answered in time. Average ${fmtSecs(P.avgTouchSec || 0)}` : "No first replies in this period",
      hint: pending.length ? "Open the lead that is waiting" : "Open the pipeline",
      onClick: () => nav.go(pending.length ? lead(pending[0].lead.id) : { page: "Sales", tab: "pipeline" }) },
    { key: "proposals", label: "Proposals sent", value: P.proposalsSent.length, icon: "send",
      sub: P.proposalsSent.length ? `${eur(P.proposalsValue)} in value, upper estimate` : "None sent in this period", hint: "Open proposals",
      onClick: () => nav.go({ page: "Sales", tab: "proposals" }) },
    { key: "won", label: "Won", value: eur(P.wonValue), icon: "check",
      sub: `${P.won.length} won${P.winRate === null ? ", no decisions yet" : `. Win rate ${P.winRate}% (${P.won.length} of ${P.won.length + P.lost} decided)`}`, hint: "Open won leads",
      onClick: () => nav.go({ page: "Sales", tab: "pipeline", params: { stage: "won" } }) },
  ];

  return (
    <div className="ph-page">
      <style>{DASH_CSS}</style>
      <KpiBand eyebrow={`Sales dashboard · ${DASH_PERIOD_LABEL[period]}`} title="Sales at a glance"
        right={<>
          <Segmented value={period} onChange={setPeriod} label="Period" options={[{ id: "30d", label: DASH_PERIOD_LABEL["30d"] }, { id: "month", label: DASH_PERIOD_LABEL.month }]} />
          <AsOf nowUtc={s.clock.nowUtc} />
        </>}
        items={items} />
      <div className="dsh-grid32" style={{ marginTop: 14 }}>
        <div className="ph-stack dsh-col">
          <NeedsCard />
          <OnboardingCard />
        </div>
        <div className="ph-stack dsh-col">
          <PipelineCard />
          <RevenueCard />
          <RetentionCard />
          <DaysCard />
        </div>
      </div>
    </div>
  );
}

/* ---- needs Stephen now ---- */
function NeedsCard() {
  const s = usePhState();
  const nav = useNav();
  const me = usePersona();
  const N = salesNeeds(s);
  const t = today(s);
  return (
    <Card>
      <CardHeader title={me.id === "stephen" ? "Needs you now" : "Needs Stephen now"} sub="Most urgent first. Click any row to open it." />
      <Group title="Reply within 10 minutes" right={N.inbound.length ? <Pill tone="warn" icon={null}>{N.inbound.length} waiting</Pill> : null}>
        {N.inbound.length ? N.inbound.map(({ inb, lead: l }) => (
          <ActRow key={l.id} onClick={() => nav.go(lead(l.id))} title={l.company} label={`Open ${l.company}`}
            sub={`${l.contact.name}. ${l.services.map((x) => SALES_SERVICE_LABEL[x]).join(" and ")}${l.qualifier.headcount ? `, about ${l.qualifier.headcount} staff` : ""}`}
            right={<TouchTimer inb={inb} />} />
        )) : <Empty>No new enquiries waiting for a first reply.</Empty>}
      </Group>
      <Group title="Proposals waiting for a reply" right={N.followUpsThisWeek ? <Pill tone="info" icon="mail">{N.followUpsThisWeek} {N.followUpsThisWeek === 1 ? "follow-up" : "follow-ups"} due this week</Pill> : null}>
        {N.proposals.length ? N.proposals.map((w) => {
          const overdue = !!w.followDue && w.followDue < t;
          return (
            <ActRow key={w.lead.id} onClick={() => nav.go(lead(w.lead.id))} title={w.lead.company} label={`Open ${w.lead.company}`}
              sub={`${w.proposal.id} sent ${fmtDayMonth(w.sentOn)}, ${w.daysOut} ${w.daysOut === 1 ? "day" : "days"} ago. ${eur(w.value)}`}
              right={w.followDue ? (
                <Pill tone={overdue ? "bad" : w.followDueThisWeek ? "warn" : "neutral"} icon="mail">
                  {overdue ? `Follow-up ${w.followN} overdue` : `Follow-up ${w.followN} ${fmtWeekdayDate(w.followDue)}`}
                </Pill>) : <Pill tone="neutral" icon={null}>Follow-ups finished</Pill>} />
          );
        }) : <Empty>No proposals waiting for a reply.</Empty>}
      </Group>
      <Group title="Next steps due this week">
        {N.actions.length ? N.actions.slice(0, NEXT_SHOWN).map((a) => (
          <ActRow key={a.lead.id} onClick={() => nav.go(lead(a.lead.id))} title={a.lead.company} sub={a.text} label={`Open ${a.lead.company}`}
            right={<Pill tone={a.overdue ? "bad" : "neutral"} icon={a.overdue ? "alert" : "calendar"}>{a.overdue ? `Overdue, ${fmtDayMonth(a.due)}` : fmtWeekdayDate(a.due)}</Pill>} />
        )) : <Empty>Nothing else due this week.</Empty>}
        {N.actions.length > NEXT_SHOWN ? (
          <button type="button" className="ph-link" style={{ fontSize: 12, marginTop: 8 }} onClick={() => nav.go({ page: "Sales", tab: "pipeline" })}>
            And {N.actions.length - NEXT_SHOWN} more in the pipeline
          </button>) : null}
      </Group>
      <Group title={`Onboarding stuck for more than ${ONB_STUCK_DAYS} days`}>
        {N.stuck.length ? N.stuck.map((x) => (
          <ActRow key={x.o.id} onClick={() => nav.go({ page: "Sales", tab: "onboarding", params: { onb: x.o.id } })} label={`Open onboarding for ${x.o.details.companyName}`}
            title={x.o.details.companyName.replace(/\s*\(fictional\)/, "")} sub={x.what}
            right={<Pill tone="warn" icon="clock">{x.days} days</Pill>} />
        )) : <Empty>Every onboarding is moving.</Empty>}
      </Group>
    </Card>
  );
}

/* ---- pipeline by stage ---- */
const STAGE_COLOR: Record<SalesStage, string> = { new: PALETTE[2], proposal_sent: PALETTE[0], won: PALETTE[1], lost: "var(--faint)" };
function PipelineCard() {
  const s = usePhState();
  const nav = useNav();
  const rows = pipelineByStage(s);
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <Card>
      <CardHeader title="Pipeline by stage" sub="Leads in each stage. Open stages show the value of their latest proposal after any discount (upper estimate). Click a stage to see its leads." />
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {rows.map((r) => (
          <BarRow key={r.stage} label={SALES_STAGE_LABEL[r.stage]} value={r.count} max={max} color={STAGE_COLOR[r.stage]}
            aria={`${SALES_STAGE_LABEL[r.stage]}: ${r.count} leads. Open in the pipeline`}
            onClick={() => nav.go({ page: "Sales", tab: "pipeline", params: { stage: r.stage } })}
            right={<>{r.count} {r.count === 1 ? "lead" : "leads"}<small>{r.stage === "won" || r.stage === "lost" ? "Closed" : r.value ? eur(r.value) : "No proposal yet"}</small></>} />
        ))}
      </div>
    </Card>
  );
}

/* ---- onboarding in progress ---- */
function OnboardingCard() {
  const s = usePhState();
  const nav = useNav();
  const R = onboardingRows(s);
  const section = (title: string, rows: typeof R.oh) => (
    <Group title={title} right={<span className="ph-num ph-faint">{rows.length}</span>}>
      {rows.length ? rows.map((r) => (
        <ActRow key={r.id} onClick={() => nav.go(r.link)} title={r.name} sub={`Now at: ${r.stepLabel}`} label={`Open onboarding for ${r.name}`}
          right={<><Dots done={r.done} total={r.total} label={`${r.done} of ${r.total} steps done`} /><span className="ph-num ph-faint" style={{ fontSize: 11.5 }}>{r.done} of {r.total}</span></>} />
      )) : <Empty>None in progress.</Empty>}
    </Group>
  );
  return (
    <Card>
      <CardHeader title="Onboarding in progress" sub="From the yes to the first invoice. Occupational Health includes clients set up from the OH onboarding form."
        right={<Button size="sm" variant="ghost" icon="arrow" onClick={() => nav.go({ page: "Sales", tab: "onboarding" })}>All onboarding</Button>} />
      {section("Occupational Health", R.oh)}
      {section("Wellness", R.wellness)}
    </Card>
  );
}

/* ---- screening days still to come this month ---- */
function DaysCard() {
  const s = usePhState();
  const nav = useNav();
  const rows = salesUpcomingDays(s);
  return (
    <Card>
      <CardHeader title="Screening days this month" sub="Still to come, with appointments booked against those offered."
        right={<Button size="sm" variant="ghost" icon="calendar" onClick={() => nav.go({ page: "Calendar", tab: "all" })}>Calendar</Button>} />
      {rows.length ? rows.map((r) => <DayLine key={r.session.id} r={r} />) : <Empty>No more screening days this month.</Empty>}
    </Card>
  );
}
/* ---- retention ---- */
function RetentionCard() {
  const s = usePhState();
  const nav = useNav();
  const R = retentionStats(s);
  const go = () => nav.go({ page: "Sales", tab: "recall" });
  const unreplaced = R.left.filter((x) => !x.replaced).length;
  const actions = [
    ...R.resultsOut.map((x) => ({ key: `ro-${x.programmeId}`, title: x.company, sub: `${x.newReports} new ${x.newReports === 1 ? "report" : "reports"} released. Send the results-out email.`, pill: <Pill tone="info" icon="mail">Results out</Pill> })),
    ...R.remindersDue.filter((r) => r.state !== "scheduled").map((r) => ({ key: `rm-${r.recall.id}`, title: r.recall.company, sub: r.state === "no_contact" ? "Contact left. Find the new HR contact first." : `Screened ${fmtDayMonth(r.recall.screenedOn)}. Rebooking reminder due ${fmtDayMonth(r.dueOn)}.`, pill: <Pill tone={r.state === "no_contact" ? "bad" : "warn"} icon={r.state === "no_contact" ? "user" : "calendar"}>{r.state === "no_contact" ? "No contact" : "Reminder due"}</Pill> })),
  ].slice(0, 5);
  return (
    <Card>
      <CardHeader title="Retention" sub="Keeping clients year after year." right={<Button size="sm" variant="ghost" icon="arrow" onClick={go}>Retention</Button>} />
      <div className="dsh-stats dsh-stats-2">
        <Stat label="Rebooking rate" value={R.rate.base ? `${R.rate.pct}%` : "n/a"} sub={`${R.rate.rebooked} of ${R.rate.base} clients from ${R.rate.year} booked again`} onClick={go} />
        <Stat label="Reminders, next 3 months" value={R.remindersDue.length} sub="Rebooking reminders not sent yet" onClick={go} />
        <Stat label="Results-out emails" value={R.resultsOut.length} sub="Waiting to go to HR" onClick={go} tone={R.resultsOut.length ? "warn" : undefined} />
        <Stat label="Contacts who left" value={R.left.length} sub={unreplaced ? `${unreplaced} still need a new contact` : "All replaced"} onClick={go} />
      </div>
      {actions.length ? (
        <Group title="To do">
          {actions.map((a) => <ActRow key={a.key} onClick={go} title={a.title} sub={a.sub} right={a.pill} />)}
        </Group>
      ) : null}
    </Card>
  );
}

/* ---- revenue ---- */
function RevenueCard() {
  const s = usePhState();
  const nav = useNav();
  const V = revenueStats(s);
  return (
    <Card>
      <CardHeader title="Revenue" sub={`Won value from accepted proposals in ${V.year}, recurring Occupational Health fees and Irish Life invoices.`} />
      <div className="dsh-stats dsh-stats-2">
        <Stat label={`Won in ${V.year}`} value={eur(V.wonYear)}
          sub={`${V.wonCount} deals${V.wonOther ? `. Screening programmes ${eur(V.wonScreening)}, other services ${eur(V.wonOther)}` : ", all screening programmes"}${V.wonNoPrice ? `. ${V.wonNoPrice} ${V.wonNoPrice === 1 ? "has" : "have"} no price in Pulse` : ""}`}
          onClick={() => nav.go({ page: "Sales", tab: "pipeline", params: { stage: "won" } })} />
        <Stat label="OH recurring fees" value={`${eur(V.ohActive)} a year`} sub={`${V.ohActiveClients} OH clients. ${eur(V.ohPending)} more once ${V.ohPendingClients} finish onboarding`}
          onClick={() => nav.go({ page: "OccHealth", tab: "clients" })} />
        <Stat label="Irish Life awaiting payment" value={eur(V.ilhAwaiting)} sub={`${V.ilhAwaitingCount} ${V.ilhAwaitingCount === 1 ? "invoice" : "invoices"} sent, not yet paid`}
          onClick={() => nav.go({ page: "Sales", tab: "partners" })} tone={V.ilhAwaitingCount ? "warn" : undefined} />
      </div>
    </Card>
  );
}
