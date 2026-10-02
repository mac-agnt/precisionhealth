/* Executive dashboard: programme funnel, programme comparison, utilisation (programme capacity
   versus today), review ageing and operational exceptions. Every figure comes from a selector and
   every rate states its denominator. Potential capacity means unfilled slots, never revenue. */
import {
  PROGRAMME_BY_ID, PROGRAMME_ORDER, fmtDayMonth, fmtWhen, holdCounts, programmeCounts, rate, reminderStats, reviewStats, sessionStats, storyViews, todaySessions, todayStats,
} from "../../model";
import type { Counts, ProgrammeId, StoryView } from "../../model";
import { useNav } from "../../nav-context";
import { usePersona, usePhState } from "../../store";
import { Card, CardHeader, Chip, Donut, EntityLink, Funnel, HBars, Icon, PALETTE, Pill, ProgressBar, Split } from "../../ui";
import type { Tone } from "../../ui";
import { KpiBand } from "./KpiBand";
import type { BandKpi } from "./KpiBand";
import { AsOf, GoButton, Note, PROGRAMME_COLOR } from "./shared";

export default function Executive() {
  const s = usePhState();
  const nav = useNav();
  const T = programmeCounts(s);
  const D = todayStats(s);
  const RS = reviewStats(s);
  const unfilled = Math.max(0, T.capacity - T.booked);

  const items: BandKpi[] = [
    { key: "capacity", label: "Programme capacity booked", value: rate(T.booked, T.capacity), icon: "calendar",
      sub: `${T.booked} of ${T.capacity} slots across all ${PROGRAMME_ORDER.length} programme windows` },
    { key: "today", label: "Today's utilisation", value: rate(D.booked, D.capacity), icon: "clock", onClick: () => nav.setTab("clinic-operations"),
      hint: "Open Clinic Operations", sub: `${D.booked} of ${D.capacity} slots at today's ${D.sessions} clinics. A separate measure.` },
    { key: "released", label: "Reports released", value: T.released, icon: "file",
      sub: `of ${T.attended} attended episodes (${rate(T.released, T.attended)})` },
    { key: "potential", label: "Potential capacity", value: unfilled, icon: "layers",
      sub: `Unfilled programme slots, not revenue. ${D.available} of them are in today's clinics.` },
  ];

  return (
    <div className="ph-page">
      <KpiBand eyebrow="Executive view" title="Programme performance" right={<AsOf nowUtc={s.clock.nowUtc} />} items={items} />
      <div className="ph-stack" style={{ marginTop: 14 }}>
        <Split main={<FunnelCard total={T} />} side={<UtilisationCard />} />
        <ComparisonCard />
        <Split even main={<AgeingCard ready={RS.ready} aged={RS.aged} buckets={RS.buckets} />} side={<ExceptionsCard />} />
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
      <Funnel steps={steps} />
      <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
        <Note>
          Booked counts every confirmed booking, including completed appointments: {F.attended} attended + {F.upcoming} upcoming{F.noShow ? ` + ${F.noShow} no-show` : ""} = {F.booked}.
        </Note>
        <Note>
          {F.drafts} {F.drafts === 1 ? "invitee has" : "invitees have"} a questionnaire in progress and {F.notStarted} have not started. A draft questionnaire is not a booking.
        </Note>
        <Note>
          Of {F.attended} attended episodes: {F.released} released, {F.ready} ready for review, {F.awaiting} awaiting results, {F.onHold} on hold.
        </Note>
      </div>
    </Card>
  );
}

/* ---- utilisation: programme capacity and today are different measures ---- */
function UtilisationCard() {
  const s = usePhState();
  const T = programmeCounts(s);
  const D = todayStats(s);
  const sessions = todaySessions(s).map((x) => sessionStats(s, x.id));
  return (
    <Card>
      <CardHeader title="Utilisation" sub="Two different measures with different denominators." />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 14 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, minWidth: 0 }}>
          <Donut size={112} center={rate(T.booked, T.capacity)} sub="booked"
            segments={[{ label: "Booked slots", value: T.booked, color: "var(--accent)" }, { label: "Unfilled slots", value: Math.max(0, T.capacity - T.booked), color: "var(--track)" }]} />
          <div style={{ textAlign: "center", fontSize: 12, lineHeight: 1.4 }}>
            <div style={{ color: "var(--ink)", fontWeight: 500 }}>Programme capacity</div>
            <div className="ph-dim ph-num">{T.booked} of {T.capacity} slots</div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, minWidth: 0 }}>
          <Donut size={112} center={rate(D.booked, D.capacity)} sub="booked"
            segments={[{ label: "Booked today", value: D.booked, color: PALETTE[1] }, { label: "Available today", value: D.available, color: "var(--track)" }]} />
          <div style={{ textAlign: "center", fontSize: 12, lineHeight: 1.4 }}>
            <div style={{ color: "var(--ink)", fontWeight: 500 }}>Today's utilisation</div>
            <div className="ph-dim ph-num">{D.booked} of {D.capacity} slots, {D.sessions} clinics</div>
          </div>
        </div>
      </div>
      <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 7 }}>
        <div className="ph-eyebrow">Today by clinic</div>
        {sessions.map((st) => (
          <div key={st.session.id} className="ph-row-flex" style={{ gap: 8, fontSize: 12 }}>
            <span className="ph-trunc" style={{ width: 74, flex: "none", color: "var(--body)" }} title={st.programme.name}>{st.programme.clientName}</span>
            <div className="ph-grow"><ProgressBar value={st.booked} max={st.slots} label={`${st.programme.clientName}: ${st.booked} of ${st.slots} slots booked today`} /></div>
            <span className="ph-num" style={{ flex: "none", color: "var(--ink)" }}>{st.booked}/{st.slots}</span>
          </div>
        ))}
      </div>
      <Note>Programme capacity counts every slot in the {s.sessions.filter((x) => x.status !== "cancelled").length} programme sessions. Today's utilisation counts only today's clinics. Potential capacity means unfilled slots ({Math.max(0, T.capacity - T.booked)} programme, {D.available} today), not revenue.</Note>
    </Card>
  );
}

/* ---- programme comparison ---- */
function ComparisonCard() {
  const s = usePhState();
  const T = programmeCounts(s);
  const rows = PROGRAMME_ORDER.map((id) => ({ id, prog: PROGRAMME_BY_ID[id], c: programmeCounts(s, id) }));
  const num = { textAlign: "right" as const };
  const share = (n: number, d: number, label: string, color?: string) => (
    <div className="ph-row-flex" style={{ gap: 7 }}>
      <span className="ph-num" style={{ width: 28, textAlign: "right", color: "var(--ink)" }}>{n}</span>
      <div style={{ width: 52, flex: "none" }}>
        <div className="ph-track" role="img" aria-label={`${n} ${label} ${d}, ${rate(n, d)}`}><div className="ph-fill" style={{ width: (d ? Math.min(100, (n / d) * 100) : 0) + "%", background: color || "var(--accent)" }} /></div>
      </div>
      <span className="ph-faint ph-num" style={{ fontSize: 11 }}>{rate(n, d)}</span>
    </div>
  );
  return (
    <Card pad={false}>
      <div style={{ padding: "16px 18px 4px" }}>
        <CardHeader title="Programme comparison" sub="Same definitions for every programme. Booked is shown as a share of capacity; released as a share of attended." />
      </div>
      <div className="ph-tablewrap">
        <table className="ph-table" style={{ minWidth: 780, whiteSpace: "nowrap" }}>
          <caption style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Programme comparison: invited, capacity, booked, attended, released and report workflow states per programme</caption>
          <thead>
            <tr>
              <th>Programme</th><th style={num}>Invited</th><th style={num}>Capacity</th><th title="Booked as a share of capacity">Booked</th>
              <th style={num}>Attended</th><th title="Released as a share of attended">Released</th><th style={num}>Ready</th><th style={num}>Awaiting</th><th style={num}>On hold</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ id, prog, c }) => (
              <tr key={id}>
                <td>
                  <span className="ph-row-flex" style={{ gap: 8, alignItems: "flex-start" }}>
                    <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 3, background: PROGRAMME_COLOR[id], flex: "none", marginTop: 5 }} />
                    <span>
                      <EntityLink kind="programme" id={id}>{prog.name}</EntityLink>
                      <span className="ph-faint" style={{ display: "block", fontSize: 11 }}>{fmtDayMonth(prog.windowStart)} to {fmtDayMonth(prog.windowEnd)}</span>
                    </span>
                  </span>
                </td>
                <td className="num">{c.invited}</td>
                <td className="num">{c.capacity}</td>
                <td>{share(c.booked, c.capacity, "booked of", PROGRAMME_COLOR[id])}</td>
                <td className="num">{c.attended}</td>
                <td>{share(c.released, c.attended, "released of", PROGRAMME_COLOR[id])}</td>
                <td className="num">{c.ready}</td>
                <td className="num">{c.awaiting}</td>
                <td className="num">{c.onHold}</td>
              </tr>
            ))}
            <tr style={{ background: "var(--surface-faint)" }}>
              <td style={{ fontWeight: 600, color: "var(--ink)" }}>All programmes</td>
              <td className="num" style={{ fontWeight: 600 }}>{T.invited}</td>
              <td className="num" style={{ fontWeight: 600 }}>{T.capacity}</td>
              <td>{share(T.booked, T.capacity, "booked of")}</td>
              <td className="num" style={{ fontWeight: 600 }}>{T.attended}</td>
              <td>{share(T.released, T.attended, "released of")}</td>
              <td className="num" style={{ fontWeight: 600 }}>{T.ready}</td>
              <td className="num" style={{ fontWeight: 600 }}>{T.awaiting}</td>
              <td className="num" style={{ fontWeight: 600 }}>{T.onHold}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div style={{ padding: "4px 18px 14px" }}>
        <Note>Invited counts unique people, so a person on two rosters counts once in the total. Ready, awaiting and on hold are attended episodes whose report is not yet released.</Note>
      </div>
    </Card>
  );
}

/* ---- review ageing (counts only, safe for every staff role) ---- */
function AgeingCard({ ready, aged, buckets }: { ready: number; aged: number; buckets: { lt24: number; h24to48: number; h48to72: number; gt72: number } }) {
  const p = usePersona();
  const clinical = p.perms.has("clinical.view");
  const rows = [
    { key: "lt24", label: "Under 24 hours", value: buckets.lt24, color: "var(--accent)" },
    { key: "h24to48", label: "24 to 48 hours", value: buckets.h24to48, color: PALETTE[1] },
    { key: "h48to72", label: "48 to 72 hours", value: buckets.h48to72, color: "var(--warn)" },
    { key: "gt72", label: "Over 72 hours", value: buckets.gt72, color: "var(--bad)" },
  ];
  return (
    <Card>
      <CardHeader title="Review ageing" sub={`Time since each of the ${ready} ready reports became ready for review.`}
        right={clinical ? <GoButton to={{ page: "Dashboard", tab: "clinical-delivery" }}>Clinical Delivery</GoButton> : null} />
      <HBars rows={rows} max={Math.max(1, ready)} valueFmt={(n) => `${n} of ${ready}`} />
      <div className="ph-row-flex" style={{ marginTop: 14, gap: 8, flexWrap: "wrap" }}>
        <Pill tone={aged ? "warn" : "ok"}>{aged ? `${aged} waiting over 48 hours` : "None over 48 hours"}</Pill>
        <span className="ph-faint" style={{ fontSize: 11.5 }}>The {aged} aged reports are part of the {ready}, not an extra queue.</span>
      </div>
      {!clinical ? <Note icon="lock">Clinical roles review and release these reports. This view shows counts only.</Note> : null}
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
