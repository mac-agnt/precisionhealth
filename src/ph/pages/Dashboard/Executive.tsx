/* Executive dashboard: an overview of both sides of the business for whoever runs it. Four headline
   numbers (two sales, two delivery), the programme funnel and the open story threads. The detail
   lives on the Sales and Operations tabs; nothing here repeats a number shown twice on this page. */
import {
  PROGRAMME_BY_ID, PROGRAMME_ORDER, fmtWhen, holdCounts, programmeCounts, rate, reminderStats, storyViews, todayStats,
} from "../../model";
import type { Counts, ProgrammeId, StoryView } from "../../model";
import { useNav } from "../../nav-context";
import { usePersona, usePhState } from "../../store";
import { Button, Card, CardHeader, Chip, EntityLink, Icon, PALETTE, Pill, Split } from "../../ui";
import type { Tone } from "../../ui";
import { KpiBand } from "./KpiBand";
import type { BandKpi } from "./KpiBand";
import { eur, pipelineByStage, revenueStats } from "./select";
import { AsOf, BarRow, DASH_CSS, GoButton, Note, PROGRAMME_COLOR } from "./shared";

export default function Executive() {
  const s = usePhState();
  const nav = useNav();
  const T = programmeCounts(s);
  const D = todayStats(s);
  const open = pipelineByStage(s).find((r) => r.stage === "proposal_sent")!;
  const V = revenueStats(s);
  const items: BandKpi[] = [
    { key: "pipeline", label: "Open pipeline", value: eur(open.value), icon: "send", hint: "Open the Sales dashboard", onClick: () => nav.setTab("sales"),
      sub: `${open.count} ${open.count === 1 ? "proposal" : "proposals"} waiting for a reply, upper estimate` },
    { key: "won", label: `Won in ${V.year}`, value: eur(V.wonYear), icon: "check", hint: "Open won leads", onClick: () => nav.go({ page: "Sales", tab: "pipeline", params: { stage: "won" } }),
      sub: `${V.wonCount} deals from accepted proposals` },
    { key: "capacity", label: "Programme capacity booked", value: rate(T.booked, T.capacity, 0), icon: "calendar", hint: "Open Programmes", onClick: () => nav.go({ page: "Programmes", tab: "overview" }),
      sub: `Of the ${T.capacity} appointment slots across ${PROGRAMME_ORDER.length} programmes` },
    { key: "today", label: "Clinics today", value: D.sessions, icon: "clock", hint: "Open the Operations dashboard", onClick: () => nav.setTab("operations"),
      sub: `${D.booked} of ${D.capacity} appointments booked today` },
  ];
  return (
    <div className="ph-page">
      <KpiBand eyebrow="Executive overview" title="The business at a glance" right={<AsOf nowUtc={s.clock.nowUtc} />} items={items} />
      <div className="ph-stack" style={{ marginTop: 14 }}>
        <Split even main={<FunnelCard total={T} />} side={<ExceptionsCard />} />
        <div className="ph-wrap" style={{ gap: 10 }}>
          <Button icon="chart" onClick={() => nav.setTab("sales")}>Sales dashboard</Button>
          <Button icon="calendar" onClick={() => nav.setTab("operations")}>Operations dashboard</Button>
        </div>
      </div>
    </div>
  );
}

/* ---- programme funnel ---- */
function FunnelCard({ total }: { total: Counts }) {
  const s = usePhState();
  const nav = useNav();
  const param = nav.params.programme as ProgrammeId | undefined;
  const sel: ProgrammeId | "all" = param && PROGRAMME_ORDER.includes(param) ? param : "all";
  const F = sel === "all" ? total : programmeCounts(s, sel);
  const scope = sel === "all" ? "all three programmes" : PROGRAMME_BY_ID[sel].name;
  const steps = [
    { key: "invited", label: "Invited", n: F.invited, rateLabel: "100%", denominatorLabel: sel === "all" ? "unique eligible people" : "eligible on the roster" },
    { key: "booked", label: "Booked", n: F.booked, rateLabel: rate(F.booked, F.invited), denominatorLabel: `of ${F.invited} invited` },
    { key: "attended", label: "Attended", n: F.attended, rateLabel: rate(F.attended, F.booked), denominatorLabel: `of ${F.booked} booked` },
    { key: "released", label: "Report released", n: F.released, rateLabel: rate(F.released, F.attended), denominatorLabel: `of ${F.attended} attended` },
  ];
  const pick = (id: ProgrammeId | "all") => nav.setParams(id === "all" ? {} : { programme: id });
  return (
    <Card>
      <CardHeader title="Programme funnel" sub={`Invited to released for ${scope}. Each rate uses the step before it as its denominator.`}
        right={sel === "all" ? <GoButton to={{ page: "Programmes", tab: "overview" }}>Programmes</GoButton> : <EntityLink kind="programme" id={sel}>Open programme</EntityLink>} />
      <div className="ph-wrap" style={{ marginBottom: 14 }} role="group" aria-label="Programme filter">
        <Chip on={sel === "all"} onClick={() => pick("all")}>All programmes</Chip>
        {PROGRAMME_ORDER.map((id) => <Chip key={id} on={sel === id} onClick={() => pick(id)}>{PROGRAMME_BY_ID[id].clientName}</Chip>)}
      </div>
      <style>{DASH_CSS}</style>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {steps.map((st, i) => (
          <BarRow key={st.key} label={st.label} value={st.n} max={Math.max(1, steps[0].n)} color={PROGRAMME_COLOR[sel] || PALETTE[0]}
            aria={`${st.label}: ${st.n}, ${st.rateLabel} ${st.denominatorLabel}. Open the people`}
            onClick={() => nav.go(i === 3 ? { page: "Results", tab: "inbox" } : { page: "Participants", tab: "directory", params: { ...(sel === "all" ? {} : { programme: sel }), ...(i === 1 ? { stage: "upcoming" } : i === 2 ? { stage: "attended" } : {}) } })}
            right={<>{st.n}<small>{st.rateLabel} {st.denominatorLabel}</small></>} />
        ))}
      </div>
      <Note>Booked counts every confirmed booking, including appointments already completed. A questionnaire in progress is not a booking.</Note>
    </Card>
  );
}

/* ---- operational exceptions: the open stories, role-filtered by the model ---- */
function ExceptionsCard() {
  const s = usePhState();
  const views = storyViews(s);
  const H = holdCounts(s);
  const R = reminderStats(s);
  const p = usePersona();
  const clinical = p.perms.has("clinical.view") || p.perms.has("followup.view");
  const open = views.filter((v) => v.open).length;
  return (
    <Card>
      <CardHeader title="Operational exceptions" sub={`${open} of ${views.length} story threads open. Holds, failed reminders and clinical actions are separate categories.`} />
      <div className="ph-wrap" style={{ marginBottom: 6 }}>
        <Pill tone={H.identity ? "warn" : "ok"} icon="user">{H.identity} identity {H.identity === 1 ? "hold" : "holds"}</Pill>
        <Pill tone={H.dataQuality ? "warn" : "ok"} icon="flask">{H.dataQuality} data quality {H.dataQuality === 1 ? "hold" : "holds"}</Pill>
        {clinical
          ? <Pill tone={H.clinicalAction ? "bad" : "ok"} icon="heart">{H.clinicalAction} clinical action {H.clinicalAction === 1 ? "hold" : "holds"}</Pill>
          : <Pill tone="neutral" icon="lock">{H.clinicalAction ? "Clinical action assigned" : "No clinical action"}</Pill>}
        <Pill tone={R.failed ? "bad" : "ok"} icon="sms">{R.failed} of {R.logical} reminders failed</Pill>
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {views.map((v, i) => <StoryRow key={v.def.id} v={v} first={i === 0} nowUtc={s.clock.nowUtc} />)}
      </ul>
    </Card>
  );
}

function StoryRow({ v, first, nowUtc }: { v: StoryView; first: boolean; nowUtc: string }) {
  const nav = useNav();
  const overdue = v.open && !!v.dueAt && Date.parse(v.dueAt) < Date.parse(nowUtc);
  const tone: Tone = !v.open ? "ok" : overdue ? "bad" : "warn";
  const label = !v.open ? "Resolved" : overdue ? "Overdue" : "Open";
  return (
    <li className="ph-row-flex" style={{ alignItems: "flex-start", gap: 10, padding: "10px 0", borderTop: "1px solid var(--border)", marginTop: first ? 8 : 0 }}>
      <span className="ph-mono ph-faint" style={{ fontSize: 10.5, width: 40, flex: "none", paddingTop: 3 }}>{v.def.id}</span>
      <div className="ph-grow">
        <div style={{ fontSize: 12.5, color: "var(--ink)", fontWeight: 500, lineHeight: 1.4 }}>{v.headline}</div>
        <div className="ph-faint" style={{ fontSize: 11.5, marginTop: 2, lineHeight: 1.4 }}>
          {/* Restricted (clinical) stories show no title or detail to this role, only the owner and due time. */}
          {v.restricted ? "" : `${v.def.title}. `}Owner {v.ownerName}{v.dueAt ? `, due ${fmtWhen(v.dueAt, nowUtc)}` : ""}.
        </div>
      </div>
      <div className="ph-wrap" style={{ flex: "none", justifyContent: "flex-end", gap: 6 }}>
        <Pill tone={tone}>{label}</Pill>
        {v.restricted
          ? <span className="ph-row-flex ph-faint" style={{ gap: 5, fontSize: 11 }}><Icon name="lock" size={12} />Clinical roles</span>
          : <button type="button" className="ph-link" style={{ fontSize: 12 }} onClick={() => nav.go(v.target)} aria-label={`View ${v.def.id}: ${v.headline}`}>View</button>}
      </div>
    </li>
  );
}
