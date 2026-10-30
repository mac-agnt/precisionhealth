/* Control panel, Neil's dashboard (Dashboard, tab id "operations"). Everything waiting across
   Screening, Flu, Occupational health and the Team, grouped by service, with the action on the row:
   no row is a dead end. Every button dispatches the owning module's existing action, so the counts
   change straight away and the work is kept after a refresh. Filters live in the URL:
   #/Dashboard/operations?service=flu&client=IBM&urgent=1 */
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ONB_DOC_TITLE, OH_AGREEMENTS_STAGE_LABEL, act, fmtDate, fmtWeekdayDate, linkFor, startOfWeek, today } from "../../../model";
import type { NavTarget } from "../../../model";
import { useNav } from "../../../nav-context";
import { dispatch, usePhState } from "../../../store";
import { Button, Card, CardHeader, Chip, Pill, Segmented, Select } from "../../../ui";
import ScheduleDialog from "../../Calendar/ScheduleDialog";
import { fluAct } from "../../Flu/actions";
import { daysAct } from "../../Clinics/daysActions";
import { opsAct } from "../../Clinics/opsActions";
import { ohAct } from "../../OccHealth/actions";
import { onbAct } from "../../Sales/onbActions";
import { labAct } from "../../../model/labCsvActions";
import { KpiBand } from "../KpiBand";
import type { BandKpi } from "../KpiBand";
import { AsOf, DASH_CSS } from "../shared";
import { DeliveryCard, TodayCard } from "../OpsCards";
import { controlAct } from "./actions";
import { DateRequestReview } from "../../DateRequests/ReviewDialog";
import { AskDatesDialog } from "../../DateRequests/AskDialog";
import { ControlDialog } from "./dialogs";
import type { CtlDialog } from "./dialogs";
import { CTL_CSS, CtlGroup, CtlLine } from "./parts";
import { GROUPS, SERVICES, SERVICE_LABEL, clientOptions, controlRows, filterRows, isOpen, isServiceFilter, serviceCounts } from "./select";
import type { CtlRow, Service, ServiceFilter } from "./select";

const SERVICE_ICON = { screening: "flask", flu: "shield", oh: "heart", team: "users" } as const;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export default function ControlPanel() {
  const s = usePhState();
  const nav = useNav();
  const [dialog, setDialog] = useState<CtlDialog>(null);
  const [scheduling, setScheduling] = useState(false);
  const P = nav.params;
  const service: ServiceFilter = isServiceFilter(P.service) ? P.service : "all";
  const urgent = P.urgent === "1";
  const client = P.client || "";
  const setF = (patch: Record<string, string | null>) => {
    const next: Record<string, string> = { ...P };
    for (const [k, v] of Object.entries(patch)) { if (!v) delete next[k]; else next[k] = v; }
    nav.setParams(next);
  };

  const all = useMemo(() => controlRows(s), [s]);
  const counts = serviceCounts(all);
  const inService = filterRows(all, { service, client: "", urgent: false });
  const rows = filterRows(all, { service, client, urgent });
  const clients = clientOptions(inService);
  const total = SERVICES.reduce((n, x) => n + counts[x].open, 0);
  const urgentTotal = SERVICES.reduce((n, x) => n + counts[x].urgent, 0);

  const items: BandKpi[] = SERVICES.map((x) => ({
    key: x, label: SERVICE_LABEL[x], value: counts[x].open, icon: SERVICE_ICON[x], tone: counts[x].urgent ? "warn" : "ok",
    status: counts[x].urgent ? `${counts[x].urgent} urgent` : "Nothing urgent", sub: "Things waiting for an action", hint: `Show ${SERVICE_LABEL[x].toLowerCase()}`,
    onClick: () => setF({ service: x, client: null }),
  }));
  const shown = service === "all" ? SERVICES : [service];

  return (
    <div className="ph-page">
      <style>{DASH_CSS + CTL_CSS}</style>
      <KpiBand eyebrow="Control panel · Every service" title={`${plural(total, "thing")} to do, ${urgentTotal} urgent`} right={<AsOf nowUtc={s.clock.nowUtc} />} items={items} />
      <div className="ph-stack" style={{ marginTop: 14 }}>
        <Card pad="sm">
          <div className="ctl-quick" role="toolbar" aria-label="Do it now">
            <span className="ctl-quick-label">Do it now</span>
            <Button size="sm" variant="primary" icon="plus" onClick={() => nav.go({ page: "Screening", tab: "new" })}>New screening</Button>
            <Button size="sm" icon="edit" onClick={() => nav.go({ page: "Screening", tab: "check", params: { show: "awaiting" } })}>Enter results</Button>
            <Button size="sm" icon="flask" onClick={() => nav.go({ page: "Results", tab: "imports" })}>Import lab file</Button>
            <Button size="sm" icon="calendar" onClick={() => nav.go({ page: "Clinics", tab: "days" })}>Set up screening day</Button>
            <Button size="sm" icon="send" onClick={() => setF({ askdates: "1" })}>Ask a client for dates</Button>
            <Button size="sm" icon="shield" onClick={() => nav.go({ page: "Flu", tab: "bookings" })}>Add flu clinic</Button>
            <Button size="sm" icon="layers" onClick={() => nav.go({ page: "Programmes", tab: "programmes", params: { new: "1" } })}>New programme</Button>
            <Button size="sm" icon="clock" onClick={() => setScheduling(true)}>Schedule something</Button>
            <Button size="sm" icon="spark" onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "j", ctrlKey: true }))}>Ask Pulse</Button>
          </div>
        </Card>

        <div className="ctl-filters">
          <div className="ctl-seg"><Segmented<ServiceFilter> label="Service" value={service} onChange={(v) => setF({ service: v === "all" ? null : v, client: null })}
            options={[{ id: "all", label: "All", count: total }, ...SERVICES.map((x) => ({ id: x as ServiceFilter, label: SERVICE_LABEL[x], count: counts[x].open }))]} /></div>
          <Select aria-label="Client" style={{ width: "auto" }} value={client} onChange={(e) => setF({ client: e.target.value || null })}>
            <option value="">Every client</option>
            {clients.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
          <Chip on={urgent} onClick={() => setF({ urgent: urgent ? null : "1" })}>Urgent only</Chip>
          {client || urgent ? <Button size="sm" variant="ghost" icon="x" onClick={() => setF({ client: null, urgent: null })}>Clear</Button> : null}
        </div>

        <div className={`ctl-grid${shown.length === 1 ? " one" : ""}`}>
          {shown.map((x) => (
            <ServiceCard key={x} service={x} rows={rows.filter((r) => r.service === x)} filtered={!!client || urgent} open={setDialog} />
          ))}
        </div>

        {service === "all" && !client && !urgent ? (
          <div className="dsh-grid32">
            <TodayCard />
            <DeliveryCard />
          </div>
        ) : null}
      </div>
      <ControlDialog d={dialog} onClose={() => setDialog(null)} />
      <DateRequestReview id={P.request} onClose={() => setF({ request: null })} />
      <AskDatesDialog open={!!P.askdates} onClose={() => setF({ askdates: null })} />
      {scheduling ? (
        <ScheduleDialog date={today(s)} time={null} onClose={() => setScheduling(false)}
          onCreated={(calId, d) => { setScheduling(false); nav.go({ page: "Calendar", tab: "all", params: { date: d, ev: calId } }); }} />
      ) : null}
    </div>
  );
}

/* ---- one service ---- */
function ServiceCard({ service, rows, filtered, open }: { service: Service; rows: CtlRow[]; filtered: boolean; open: (d: CtlDialog) => void }) {
  const nav = useNav();
  const subs: Record<Service, string> = {
    screening: "From the lab to the participant, the days ahead and the range questions.",
    flu: "Clinics, vaccine stock, the cold chain and Irish Life bookings.",
    oh: "MediBase sessions, agreements and clients onboarding.",
    team: "The nurse rota, approvals and End of Day forms.",
  };
  const home: Record<Service, NavTarget> = {
    screening: { page: "Results", tab: "inbox" }, flu: { page: "Flu", tab: "overview" }, oh: { page: "OccHealth", tab: "clients" }, team: { page: "Clinics", tab: "team-resources" },
  };
  return (
    <Card>
      <CardHeader title={SERVICE_LABEL[service]} sub={subs[service]} right={<Button size="sm" variant="ghost" icon="arrow" onClick={() => nav.go(home[service])}>Open</Button>} />
      {GROUPS[service].map((g) => {
        const list = rows.filter((r) => r.group === g.id);
        if (filtered && !list.length) return null;
        const openN = list.filter(isOpen).length;
        return (
          <CtlGroup key={g.id} title={g.title} count={g.id === "stock" ? openN : list.length} warn={list.some((r) => r.urgent)} empty={g.empty}>
            {list.map((r) => <Row key={r.id} r={r} open={open} />)}
          </CtlGroup>
        );
      })}
    </Card>
  );
}

/* ---- one row: what it is and its buttons ---- */
function Row({ r, open }: { r: CtlRow; open: (d: CtlDialog) => void }) {
  const s = usePhState();
  const nav = useNav();
  const go = (t: NavTarget) => () => nav.go(t);
  const b = (label: string, onClick: () => void, opts: { primary?: boolean; icon?: Parameters<typeof Button>[0]["icon"]; danger?: boolean } = {}) => (
    <Button key={label} size="sm" variant={opts.primary ? "primary" : opts.danger ? "danger" : "secondary"} icon={opts.icon} onClick={onClick}>{label}</Button>
  );
  const line = (title: ReactNode, sub: ReactNode, acts: ReactNode[], openTo?: NavTarget, tags?: ReactNode) => (
    <CtlLine title={title} sub={sub} tags={tags} acts={<>{acts}</>} urgent={r.urgent} onOpen={openTo ? () => nav.go(openTo) : undefined} label={typeof title === "string" ? `Open ${title}` : undefined} />
  );
  const t = today(s);

  switch (r.kind) {
    case "lab": {
      const q = r.item;
      const differs = [q.diff.name ? "name" : null, q.diff.dob ? "date of birth" : null, q.diff.id ? "Unique ID" : null].filter(Boolean).join(", ");
      const queue: NavTarget = { page: "Results", tab: "imports", params: { view: "queue" } };
      const who = q.candidate ? s.persons.find((p) => p.id === q.candidate!.personId) : null;
      return line(`${q.file.surname}${q.file.given ? `, ${q.file.given}` : ""}`,
        who ? `Closest: ${who.given} ${who.family}. Differs on ${differs}.` : "No patient in Pulse is close to this row.",
        [
          q.candidate ? b("Match", () => open({ kind: "match", row: r }), { primary: true, icon: "check" }) : null,
          q.source === "csv" ? b("Reject", () => dispatch(labAct.reject(q.record!.id))) : null,
          b("Open queue", go(queue), { icon: "arrow" }),
        ].filter(Boolean) as ReactNode[], queue);
    }
    case "review": {
      const to = linkFor("episode", r.episode.id);
      const age = r.hours >= 48 ? `${Math.floor(r.hours / 24)} days waiting` : r.hours >= 1 ? `${r.hours} hours waiting` : "Just arrived";
      return line(r.name, `${r.client} · ${age}${r.routine ? " · Routine, nothing flagged" : " · Needs your review"}`,
        [
          r.routine ? b("Release", () => dispatch(act.releaseRoutine(r.episode.id)), { primary: true, icon: "send" }) : b("Review and release", go(to), { primary: true, icon: "eye" }),
          r.routine ? b("Review", go(to), { icon: "eye" }) : null,
        ].filter(Boolean) as ReactNode[], to);
    }
    case "followup": {
      const f = r.fu;
      const due = f.overdue ? "Overdue" : f.dueInHours <= 24 ? `Due in ${Math.max(1, Math.round(f.dueInHours))} hours` : `Due ${fmtDate(f.followUp.dueAt)}`;
      return line(`${f.person.given} ${f.person.family}`, `${due} · ${plural(f.attempts, "call")} logged${f.followUp.escalations.length ? ` · escalated ${f.followUp.escalations.length}x` : ""}`,
        [b("Log call", () => open({ kind: "call", fu: f }), { primary: true, icon: "phone" }), b("Escalate", () => open({ kind: "escalate", fu: f }), { icon: "flag" })],
        linkFor("followup", f.followUp.id), f.overdue ? <Pill tone="bad" icon="alert">Overdue</Pill> : null);
    }
    case "enter":
      return line(r.name, `${r.client} · Bloods taken ${fmtDate(r.episode.collectedAt)}, results not back from the lab`,
        [b("Enter results", go({ page: "Screening", tab: "check", params: { episode: r.episode.id } }), { primary: true, icon: "edit" })],
        linkFor("person", r.episode.personId));
    case "day": {
      const d = r.day;
      const to: NavTarget = r.screeningDay ? { page: "Clinics", tab: "days", params: { day: r.screeningDay.id } } : linkFor("session", d.session.id);
      return line(`${fmtWeekdayDate(d.session.date)} · ${d.st.programme.clientName}`,
        `${d.poc ? "Point of care" : "Lab bloods"} · ${d.nurse} · ${d.st.booked} of ${d.st.slots} booked`,
        [
          d.status === "draft" && r.screeningDay ? (r.blocked ? b("Confirm room", go(to), { primary: true, icon: "pin" }) : b("Publish", () => dispatch(daysAct.publish(r.screeningDay!.id)), { primary: true, icon: "send" })) : null,
          r.rota && !r.rota.locked ? b(d.session.nurseId ? "Change nurse" : "Assign nurse", () => open({ kind: "assign", item: r.rota! }), { icon: "user", primary: !d.session.nurseId }) : null,
          b("Open", go(to), { icon: "arrow" }),
        ].filter(Boolean) as ReactNode[], to,
        <>{d.status === "draft" ? <Pill tone="neutral" icon="edit">Draft</Pill> : <Pill tone="ok" icon="check">Published</Pill>}{d.nurseClash ? <Pill tone="bad" icon="alert">Nurse double-booked</Pill> : null}{d.roomTbc ? <Pill tone="warn" icon="pin">Room to confirm</Pill> : null}</>);
    }
    case "datereq": {
      const q = r.req;
      const review = () => nav.setParams({ ...nav.params, request: q.id });
      return line(`${r.client} · ${q.daysNeeded} ${q.daysNeeded === 1 ? "day" : "days"} needed`,
        `${q.contactName} suggested ${q.picks.map((x) => fmtWeekdayDate(x.date)).join(", ")}${q.room ? ` · ${q.room}` : ""}`,
        [b("Review and approve", review, { primary: true, icon: "check" })], { page: "Clinics", tab: "days", params: { request: q.id } },
        <Pill tone="warn" icon="clock">From the client portal</Pill>);
    }
    case "rrq":
      return line(r.q.topic, r.q.question, [b("Answer", () => open({ kind: "answer", q: r.q }), { primary: true, icon: "check" })], { page: "Screening", tab: "questions" });
    case "flu": {
      const c = r.clinic;
      const staff = c.staffIds.map((id) => s.staff.find((x) => x.id === id)?.name.split(" ")[0] || id);
      const who = staff.length ? staff.join(", ") + (c.rotaNurses ? ` + ${c.rotaNurses} rota` : "") : c.rotaNurses ? `${c.rotaNurses} rota nurses` : "No nurse yet";
      const to: NavTarget = { page: "Flu", tab: "bookings", params: { clinic: c.id } };
      return line(`${fmtWeekdayDate(c.date!)} · ${c.company}`, `${c.projected} projected · ${who}${c.start ? ` · ${c.start}` : ""}`,
        [
          r.canRecord ? b("Record actuals", () => open({ kind: "actuals", clinic: c }), { primary: true, icon: "edit" }) : null,
          r.rota && !r.rota.locked ? b(staff.length ? "Change nurse" : "Assign nurse", () => open({ kind: "assign", item: r.rota! }), { icon: "user", primary: !staff.length && !r.canRecord }) : null,
        ].filter(Boolean) as ReactNode[], to,
        !r.canRecord ? <span className="ph-faint" style={{ fontSize: 11 }}>Actual numbers open on the day</span> : <Pill tone="warn" icon="clock">Actuals due</Pill>);
    }
    case "stock": {
      const st = r.stock;
      const next = r.nextOrderId ? s.flu.orders.find((o) => o.id === r.nextOrderId)! : null;
      const deliver = () => {
        const code = next!.sampleBatch?.code || `CP${String(Date.parse(s.clock.nowUtc)).slice(-5)}`;
        dispatch(fluAct.recordDelivery(next!.id, t, code, next!.sampleBatch?.expiry || "06/27"));
      };
      return (
        <div key="stock" className={`ctl-row${r.urgent ? " urgent" : ""}`} style={{ display: "block" }}>
          <div className="ctl-stock">
            <div><b>{st.onHand.toLocaleString("en-IE")}</b><span>Doses on hand</span></div>
            <div><b>{st.allocated.toLocaleString("en-IE")}</b><span>Allocated to clinics</span></div>
            <div><b>{st.onOrder.toLocaleString("en-IE")}</b><span>On order</span></div>
            <div><b style={{ color: st.freeIncludingOrders < 0 ? "var(--bad)" : st.free < 0 ? "var(--warn)" : undefined }}>{st.freeIncludingOrders.toLocaleString("en-IE")}</b><span>Spare once orders land</span></div>
          </div>
          <div className="ctl-row" style={{ borderTop: 0, paddingTop: 4 }}>
            <div className="ctl-main">
              {st.free < 0 ? <Pill tone="warn" icon="alert">Low stock: {(-st.free).toLocaleString("en-IE")} more allocated than on hand</Pill> : <Pill tone="ok" icon="check">Stock covers every booked clinic</Pill>}
              {r.short ? <span className="ctl-sub">Including {st.requestedCount} waiting requests, {r.short.toLocaleString("en-IE")} doses short even after every order.</span> : null}
              {next ? <span className="ctl-sub">Next delivery: {next.quantity.toLocaleString("en-IE")} doses, expected {fmtWeekdayDate(next.expectedOn)} ({next.id}).</span> : null}
            </div>
            <div className="ctl-acts">
              <Button size="sm" variant={r.short ? "primary" : "secondary"} icon="plus" onClick={() => open({ kind: "order", short: r.short })}>Order vaccines</Button>
              {next ? <Button size="sm" icon="check" onClick={deliver}>Record delivery</Button> : null}
              <Button size="sm" variant="ghost" icon="arrow" onClick={go({ page: "Flu", tab: "stock" })}>Order records</Button>
            </div>
          </div>
        </div>
      );
    }
    case "cold": {
      const x = r.row;
      return line(`${x.company.split(",")[0]}, ${fmtWeekdayDate(x.date)}`, `${x.excursions.map((e) => `${e.reading === "pre" ? "Pre-vaccine" : e.reading === "post" ? "Post-vaccine" : "Intermediate"} ${e.value.toFixed(1)} °C`).join(", ")}, outside 2 to 8 °C`,
        [b("Acknowledge", () => open({ kind: "cold", row: x }), { primary: true, icon: "check" })], { page: "Flu", tab: "cold-chain" },
        <Pill tone="bad" icon="alert">{x.excursions.some((e) => e.kind === "high") ? "Too warm" : "Too cold"}</Pill>);
    }
    case "ilh":
      return line(r.sample.company, `ILH Flu booking form: ${r.sample.projected} projected on ${fmtWeekdayDate(r.sample.date)} at ${r.sample.start}`,
        [b("Accept booking", () => dispatch(fluAct.intakeIlh()), { primary: true, icon: "check" })], { page: "Flu", tab: "bookings" },
        r.remaining > 1 ? <span className="ph-faint" style={{ fontSize: 11 }}>{r.remaining - 1} more after this one</span> : null);
    case "ohSession": {
      const d = r.diary;
      const to: NavTarget = { page: "OccHealth", tab: "sessions", params: { diary: d.id } };
      const chaseable = d.slots.filter((x) => r.missing.includes(x.id) && !x.chasedAt).map((x) => x.id);
      const chaseAll = () => {
        let n = 0;
        for (const id of chaseable) if (dispatch(ohAct.chaseQuestionnaire(id), { silent: true }).ok) n++;
        dispatch(act.toast(n ? "ok" : "warn", n ? `${plural(n, "reminder")} sent (Simulated).` : "Nothing left to chase."));
      };
      return line(`${fmtWeekdayDate(d.date)} · ${r.client}`, `${d.clinicianName} · ${r.booked} booked · ${r.missing.length} questionnaires not in · ${r.toSend.length} not in MediBase`,
        [
          r.toSend.length ? b(`Send ${r.toSend.length} to MediBase`, () => dispatch(ohAct.sendToMeddbase(r.toSend)), { primary: true, icon: "send" }) : null,
          chaseable.length ? b(`Chase ${chaseable.length}`, chaseAll, { icon: "mail" }) : null,
          b("Open session", go(to), { icon: "arrow" }),
        ].filter(Boolean) as ReactNode[], to);
    }
    case "ohAgreement": {
      const c = r.oh;
      const to: NavTarget = { page: "OccHealth", tab: "agreements", params: { client: c.id } };
      const acts = r.stage === "not_started" ? [b("Generate", () => dispatch(ohAct.generateAgreement(c.id, "both")), { primary: true, icon: "file" })]
        : r.stage === "generated" ? [b("Send for signature", () => dispatch(ohAct.sendAgreement(c.id, "both")), { primary: true, icon: "send" })]
        : [b("Mark signed", () => dispatch(ohAct.markSigned(c.id, "both")), { primary: true, icon: "check" })];
      return line(c.name, `SLA and DSA · ${OH_AGREEMENTS_STAGE_LABEL[r.stage]}`, [...acts, b("Open", go(to), { icon: "arrow" })], to);
    }
    case "onbDoc": {
      const to: NavTarget = { page: "Sales", tab: "onboarding", params: { onb: r.onb.id } };
      return line(r.client, `${ONB_DOC_TITLE[r.doc]} · ${r.status === "draft" ? "Ready to send" : "Sent, waiting for the signature"}`,
        [r.status === "draft" ? b("Send for signature", () => dispatch(onbAct.sendDoc(r.onb.id, r.doc)), { primary: true, icon: "send" }) : b("Mark signed", () => dispatch(onbAct.signDoc(r.onb.id, r.doc)), { primary: true, icon: "check" }), b("Open", go(to), { icon: "arrow" })], to);
    }
    case "ohClient": {
      const to: NavTarget = r.onbId ? { page: "Sales", tab: "onboarding", params: { onb: r.onbId } } : { page: "OccHealth", tab: "clients", params: { client: r.ohClientId! } };
      return line(r.name, r.onbId ? `Next: ${r.step}` : `Next: ${r.step} · ${r.done} of ${r.total} steps done`, [b("Open", go(to), { icon: "arrow" })], to);
    }
    case "conflict": {
      const week = startOfWeek(r.conflict.date);
      const to: NavTarget = { page: "Clinics", tab: "team-resources", params: { week } };
      return line(`${r.staffName}, ${fmtWeekdayDate(r.conflict.date)}`, r.conflict.text, [b("Fix", go(to), { primary: true, icon: "edit" })], to,
        <Pill tone="bad" icon="alert">{r.conflict.kind === "leave" ? "On leave" : "Double-booked"}</Pill>);
    }
    case "unstaffed":
      return line(`${r.item.title}`, `${fmtWeekdayDate(r.item.date)} · ${r.item.where || r.item.client}`,
        [b("Assign", () => open({ kind: "assign", item: r.item }), { primary: true, icon: "user" })], r.item.link);
    case "expense": {
      const e = r.expense;
      const what = e.kind === "hotel" ? `Hotel, ${plural(e.nights, "night")}, ${e.area || e.clientLocation}` : `Subsistence €${e.amount}, ${e.clientLocation}`;
      return line(`${r.staffName}, ${fmtWeekdayDate(e.date)}`, what,
        [b("Approve", () => dispatch(opsAct.decideExpense(e.id, true)), { primary: true, icon: "check" }), b("Decline", () => open({ kind: "decline", expense: e, staffName: r.staffName }), { icon: "x" })],
        { page: "Clinics", tab: "end-of-day" });
    }
    case "eod":
      return line(`${r.staffName}, ${fmtWeekdayDate(r.eod.date)}`, `${r.eod.label}${r.chasedAt ? ` · Reminded ${fmtDate(r.chasedAt)}` : ""}`,
        [
          b(r.chasedAt && r.chasedAt.slice(0, 10) === s.clock.nowUtc.slice(0, 10) ? "Chased" : "Chase", () => dispatch(controlAct.chaseEod(r.eod.key, r.eod.staffId, r.eod.date, r.eod.label)), { icon: "mail", primary: !r.chasedAt }),
          b("Fill in", go({ page: "Clinics", tab: "end-of-day" }), { icon: "edit" }),
        ], { page: "Clinics", tab: "end-of-day" });
  }
}
