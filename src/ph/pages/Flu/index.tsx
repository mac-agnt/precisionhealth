/* Flu: Overview, Bookings by week, Vaccine stock and Cold chain (RECORDING.md section 8).
   Stephen, Martina and Brenda manage; Neil and Liz view everything; nurses see their own clinics;
   the participant preview sees nothing. Handlers are registered by ./actions at import time. */
import "./flu.css";
import "./actions";
import { useState } from "react";
import {
  FLU_SEASON_ARCHIVE, FLU_SEASON_CURRENT, FLU_SUPPLY_OWNER, FLU_WEEKS_2025, fluAccessFor, fluBatchLabel, fluColdChainRows, fluRunningTotal, fluStock,
  fluWeekGroups, fmtDayMonth, fmtInt, fmtWeekdayDate, plural, staffName, today,
} from "../../model";
import type { FluClinic, FluColdChainRow, PhState } from "../../model";
import { dispatch, usePersona, usePhState } from "../../store";
import { Button, Card, CardHeader, DataTable, DemoTag, EmptyState, Kpi, KpiStrip, PageHeader, Pill, RestrictedNotice, Segmented, Switch } from "../../ui";
import type { Column } from "../../ui";
import { fluAct } from "./actions";
import { ColdChainChart, GroupedColumns, LinesChart, Legend, ShapeKey, TipRow } from "./charts";

const temp = (v: number | null) => (v === null ? "Not recorded" : `${v.toFixed(1)} °C`);

function useFluView() {
  const state = usePhState();
  const p = usePersona();
  const access = p.isParticipant ? "none" : fluAccessFor(p.id);
  const own = (c: { staffIds: string[] }) => access !== "own" || c.staffIds.includes(p.id);
  return { state, p, access, own, flu: state.flu, t: today(state) };
}

function staffText(state: PhState, c: FluClinic): string {
  const parts = c.staffIds.map((id) => staffName(state, id));
  if (c.rotaNurses) parts.push(plural(c.rotaNurses, "rota nurse"));
  return parts.join(", ");
}

function StatusPill({ c, live }: { c: FluClinic; live: boolean }) {
  if (c.status === "requested") return live ? <Pill tone="info">To slot</Pill> : <Pill tone="warn" icon="clock">Waiting for vaccine supply</Pill>;
  if (c.status === "completed") return <Pill tone="ok">Actuals recorded</Pill>;
  if (c.status === "cancelled") return <Pill>Cancelled</Pill>;
  if (!c.staffIds.length && !c.rotaNurses) return <Pill tone="warn">Nurse to assign</Pill>;
  return <Pill tone="brand" icon="calendar">Booked</Pill>;
}

export default function Flu({ tab }: { tab: string }) {
  const { access } = useFluView();
  if (access === "none") {
    return <div className="ph-page"><PageHeader title="Flu" /><RestrictedNotice>Flu clinics, vaccine stock and the cold chain are staff screens. The participant preview has no access.</RestrictedNotice></div>;
  }
  return (
    <div className="ph-page flu">
      {tab === "bookings" ? <Bookings /> : tab === "stock" ? <Stock /> : tab === "cold-chain" ? <ColdChain /> : <Overview />}
    </div>
  );
}

/* ---------- Overview ---------- */
function Overview() {
  const { state, p, flu, own } = useFluView();
  const st = fluStock(flu, FLU_SEASON_CURRENT);
  const cur = flu.clinics.filter((c) => c.season === FLU_SEASON_CURRENT);
  const booked = cur.filter((c) => c.status === "scheduled" || c.status === "completed");
  const ran = cur.filter((c) => c.status === "completed");
  const ilh = booked.filter((c) => c.channel === "ilh");
  const prec = cur.filter((c) => c.channel === "precision" && c.status !== "cancelled");
  const first = booked.filter((c) => c.date).sort((a, b) => a.date!.localeCompare(b.date!))[0];
  const g25 = fluWeekGroups(flu.clinics, FLU_SEASON_ARCHIVE);
  const canToggle = p.id === FLU_SUPPLY_OWNER;
  const mine = cur.filter((c) => c.date && own(c) && c.staffIds.length && !p.isParticipant).filter((c) => c.staffIds.includes(p.id as never));
  return (
    <>
      <PageHeader eyebrow="2026 season" title="Flu clinics and vaccine supply"
        sub="The Irish Life Flu board by week, Precision's own flu bookings, vaccine stock against allocations and the cold chain. Clients, addresses, suppliers and batch numbers are fictional." />
      <Card>
        <div className="flu-supply">
          <div>
            <CardHeader title="Precision flu bookings" sub="Precision's own clients book through booking links, which stay closed until flu vaccines arrive in the country. Irish Life Health bookings come through the ILH Flu booking form." right={<DemoTag />} />
            <div className="flu-switchrow">
              {flu.precisionLive ? <Pill tone="ok">Live: booking links open</Pill> : <Pill tone="warn" icon="clock">Waiting for vaccine supply</Pill>}
              <span className="ph-grow" />
              <Switch on={flu.precisionLive} label="Precision flu bookings live" disabled={!canToggle} onChange={(v) => dispatch(fluAct.setPrecisionLive(v))} />
            </div>
            <div className="ph-faint" style={{ fontSize: 11.5, marginTop: 8 }}>
              {canToggle ? "Flip this when stock arrives. Simulated: no booking link outside this demo changes." : "Only Stephen Kelly opens Precision flu bookings."}
              {flu.liveChange ? ` Last changed by ${staffName(state, flu.liveChange.by)}.` : ""}
            </div>
          </div>
          <div>
            <CardHeader title="Channel split" sub="Projected vaccinations this season" />
            <ul className="flu-list">
              <li><span className="flu-li-main"><span className="flu-li-title">Irish Life Health</span><br /><span className="ph-dim">{plural(ilh.length, "clinic")} booked</span></span><b className="ph-num">{fmtInt(ilh.reduce((n, c) => n + c.projected, 0))}</b></li>
              <li><span className="flu-li-main"><span className="flu-li-title">Precision clients</span><br /><span className="ph-dim">{plural(prec.length, "request")}, {flu.precisionLive ? "bookings live" : "waiting for supply"}</span></span><b className="ph-num">{fmtInt(prec.reduce((n, c) => n + c.projected, 0))}</b></li>
            </ul>
          </div>
        </div>
      </Card>
      <div style={{ height: 14 }} />
      <KpiStrip>
        <Kpi label="Booked clinics" value={booked.length} sub={`${ilh.length} Irish Life Health, ${booked.length - ilh.length} Precision`} />
        <Kpi label="Projected vaccinations" value={fmtInt(booked.reduce((n, c) => n + c.projected, 0))} sub={`Plus ${fmtInt(st.requested)} in ${plural(st.requestedCount, "Precision request")} not yet slotted`} />
        <Kpi label="Actual so far" value={fmtInt(st.administered)} sub={ran.length ? `${plural(ran.length, "clinic")} run` : `No 2026 clinics have run yet.${first ? ` First clinic ${fmtWeekdayDate(first.date!)}.` : ""}`} />
        <Kpi label="In stock vs allocated" value={`${fmtInt(st.onHand)} of ${fmtInt(st.allocated)}`} tone={st.free < 0 ? "warn" : "ok"} sub={st.free < 0 ? `Allocated exceeds stock by ${fmtInt(-st.free)}. ${fmtInt(st.onOrder)} on order.` : `${fmtInt(st.free)} free after allocations`} />
      </KpiStrip>
      <div style={{ height: 14 }} />
      <Card>
        <CardHeader title="2025 projected versus actual, by week" sub="Irish Life Flu 2025. Weeks to 10 Nov are Stephen's figures; later weeks are sample figures." />
        <GroupedColumns caption="2025 projected and actual vaccinations by week"
          series={[{ label: "Projected", color: "var(--flu-s2)" }, { label: "Actual", color: "var(--flu-s1)" }]}
          groups={g25.map((g) => ({ key: g.week, label: fmtDayMonth(g.week), sub: FLU_WEEKS_2025.find((d) => d.week === g.week)?.source === "sample" ? "Sample" : undefined, values: [g.projected, g.actual] }))}
          tip={(i) => (
            <>
              <div className="flu-tip-title">Week beginning {fmtWeekdayDate(g25[i].week)}</div>
              <TipRow color="var(--flu-s2)" name="Projected" value={fmtInt(g25[i].projected)} />
              <TipRow color="var(--flu-s1)" name="Actual" value={fmtInt(g25[i].actual)} />
              <div className="flu-tip-note">{Math.round((g25[i].actual / Math.max(1, g25[i].projected)) * 100)}% of projected</div>
            </>
          )} />
      </Card>
      {mine.length ? (
        <>
          <div style={{ height: 14 }} />
          <Card><CardHeader title="Your flu clinics" /><ul className="flu-list">{mine.map((c) => <li key={c.id}><span className="flu-li-main"><span className="flu-li-title">{c.company}</span><br /><span className="ph-dim">{fmtWeekdayDate(c.date!)} at {c.start}, {fmtInt(c.projected)} projected</span></span></li>)}</ul></Card>
        </>
      ) : null}
    </>
  );
}

/* ---------- Bookings by week ---------- */
function Bookings() {
  const { state, flu, own, access } = useFluView();
  const [season, setSeason] = useState<string>(String(FLU_SEASON_CURRENT));
  const s = Number(season);
  const groups = fluWeekGroups(flu.clinics.filter(own), s);
  const requests = flu.clinics.filter((c) => c.season === s && c.status === "requested" && own(c));
  const manage = access === "manage";
  const cols: Column<FluClinic>[] = [
    { key: "item", header: "Item", cell: (c) => c.item },
    { key: "company", header: "Company", cell: (c) => c.company },
    { key: "proj", header: "Projected", align: "right", cell: (c) => fmtInt(c.projected) },
    { key: "date", header: "Date", cell: (c) => (c.date ? fmtWeekdayDate(c.date) : "") },
    { key: "act", header: "Actual", align: "right", cell: (c) => (c.actual === null ? "" : fmtInt(c.actual)) },
    { key: "start", header: "Start", cell: (c) => c.start || "" },
    { key: "staff", header: "Staff onsite", cell: (c) => staffText(state, c) || <span className="ph-faint">None yet</span> },
    { key: "addr", header: "Client address", nowrap: false, cell: (c) => `${c.address}${c.eircode ? `, ${c.eircode}` : ""}` },
    { key: "status", header: "Status", cell: (c) => <StatusPill c={c} live={flu.precisionLive} /> },
  ];
  return (
    <>
      <PageHeader title="Bookings by week" sub="The Irish Life Flu board grouped by week beginning, with projected and actual group sums, plus Precision's own flu requests."
        actions={<Segmented label="Season" value={season} onChange={setSeason} options={[{ id: String(FLU_SEASON_CURRENT), label: "2026 season" }, { id: String(FLU_SEASON_ARCHIVE), label: "2025 archive" }]} />} />
      {s === FLU_SEASON_CURRENT ? (
        <div className="flu-grid-2" style={{ marginBottom: 14 }}>
          <Card>
            <CardHeader title="ILH Flu booking form" sub="Irish Life Health books its clients' projected numbers through the form Precision built." right={<DemoTag />} />
            <Button icon="plus" disabled={!manage} onClick={() => dispatch(fluAct.intakeIlh())}>Receive sample submission</Button>
          </Card>
          <Card>
            <CardHeader title="Precision flu requests" sub={flu.precisionLive ? "Booking links are open." : "Blocked: waiting for vaccine supply. Stephen opens bookings on the Overview."} right={<DemoTag />} />
            <ul className="flu-list">
              {requests.map((c) => <li key={c.id}><span className="flu-li-main"><span className="flu-li-title">{c.company}</span><br /><span className="ph-dim">{fmtInt(c.projected)} projected{c.preferredWeek ? `, asked for week beginning ${fmtWeekdayDate(c.preferredWeek)}` : ""}</span></span><StatusPill c={c} live={flu.precisionLive} /></li>)}
            </ul>
            <div style={{ marginTop: 10 }}><Button icon="plus" disabled={!manage || !flu.precisionLive} onClick={() => dispatch(fluAct.intakePrecision())}>Receive sample request</Button></div>
          </Card>
        </div>
      ) : null}
      <div className="ph-stack">
        {groups.map((g) => (
          <Card key={g.week} pad={false}>
            <div className="flu-week-head">
              <h3 className="ph-h2 ph-grow">Week beginning {fmtWeekdayDate(g.week)}</h3>
              <div className="flu-sums"><span>Projected <b>{fmtInt(g.projected)}</b></span><span>Actual <b>{fmtInt(g.actual)}</b> ({g.recorded} of {g.active} recorded)</span>{g.def?.source === "sample" ? <DemoTag>Sample figures</DemoTag> : null}</div>
            </div>
            <DataTable rows={g.clinics} columns={cols} rowKey={(c) => c.id} pageSize={50} minWidth={1100} empty={<EmptyState title="No clinics this week" />} />
          </Card>
        ))}
      </div>
    </>
  );
}

/* ---------- Vaccine stock ---------- */
function Stock() {
  const { flu, access, t } = useFluView();
  const [season, setSeason] = useState<string>(String(FLU_SEASON_CURRENT));
  const s = Number(season);
  const st = fluStock(flu, s);
  const run = fluRunningTotal(flu, s);
  const orders = flu.orders.filter((o) => o.season === s);
  const cols: Column<(typeof orders)[number]>[] = [
    { key: "id", header: "Order", cell: (o) => o.id },
    { key: "sup", header: "Supplier", cell: (o) => o.supplier },
    { key: "qty", header: "Quantity", align: "right", cell: (o) => fmtInt(o.quantity) },
    { key: "exp", header: "Expected", cell: (o) => fmtWeekdayDate(o.expectedOn) },
    { key: "batch", header: "Batch", cell: (o) => flu.batches.filter((b) => b.orderId === o.id).map(fluBatchLabel).join(", ") || <span className="ph-faint">On delivery</span> },
    { key: "st", header: "Status", cell: (o) => (o.status === "delivered" ? <Pill tone="ok">Delivered {fmtDayMonth(o.deliveredOn!)}</Pill> : <Pill tone="info" icon="clock">On order</Pill>) },
    { key: "do", header: "", cell: (o) => (o.status === "on_order" && access === "manage" && o.sampleBatch ? <Button size="sm" onClick={() => dispatch(fluAct.recordDelivery(o.id, t, o.sampleBatch!.code, o.sampleBatch!.expiry))}>Record delivery</Button> : null) },
  ];
  return (
    <>
      <PageHeader title="Vaccine stock" sub="Flu Vaccine Order Records, stock on hand and the running total of vaccines in stock versus allocated to booked clinics."
        actions={<Segmented label="Season" value={season} onChange={setSeason} options={[{ id: String(FLU_SEASON_CURRENT), label: "2026 season" }, { id: String(FLU_SEASON_ARCHIVE), label: "2025 archive" }]} />} />
      {st.free < 0 ? <div className="flu-callout warn" style={{ marginBottom: 14 }}><strong>Allocated exceeds stock on hand by {fmtInt(-st.free)}.</strong> {fmtInt(st.onOrder)} doses on order{st.nextDelivery ? `, next delivery due ${fmtWeekdayDate(st.nextDelivery.expectedOn)}` : ""}.</div> : null}
      <KpiStrip>
        <Kpi label="Received" value={fmtInt(st.received)} sub="Doses delivered this season" />
        <Kpi label="On hand" value={fmtInt(st.onHand)} sub="Received minus administered and wastage" />
        <Kpi label="Allocated" value={fmtInt(st.allocated)} tone={st.free < 0 ? "warn" : undefined} sub="Projected numbers of booked clinics not yet run" />
        <Kpi label="Administered" value={fmtInt(st.administered)} sub={`Wastage ${fmtInt(st.wastage)}`} />
        <Kpi label="On order" value={fmtInt(st.onOrder)} sub="Not yet delivered" />
      </KpiStrip>
      <div style={{ height: 14 }} />
      <Card>
        <CardHeader title="Running total by week" sub="Cumulative stock (delivered, or due on its expected date) against cumulative demand: actuals for clinics that ran, projected for booked clinics, plus wastage. A week is short if stock runs out on any day." />
        <LinesChart caption="Cumulative vaccine stock against cumulative demand by week"
          series={[{ label: "Stock in (cumulative)", color: "var(--flu-s3)" }, { label: "Demand (cumulative)", color: "var(--flu-s2)" }]}
          points={run.map((r) => ({ key: r.week, label: fmtDayMonth(r.week), values: [r.cumStock, r.cumDemand] }))}
          flags={run.map((r, i) => ({ index: i, text: `Short by ${fmtInt(r.short)}`, short: r.short })).filter((f) => f.short > 0)}
          tip={(i) => (
            <>
              <div className="flu-tip-title">Week beginning {fmtWeekdayDate(run[i].week)}</div>
              <TipRow line color="var(--flu-s3)" name="Stock in" value={fmtInt(run[i].cumStock)} />
              <TipRow line color="var(--flu-s2)" name="Demand" value={fmtInt(run[i].cumDemand)} />
              <div className="flu-tip-note">{run[i].short ? `Short by ${fmtInt(run[i].short)} on ${fmtWeekdayDate(run[i].minOn!)}` : `Covered, balance ${fmtInt(run[i].balance)}`}</div>
            </>
          )} />
      </Card>
      <div style={{ height: 14 }} />
      <Card pad={false}>
        <div style={{ padding: "16px 16px 0" }}><CardHeader title="Flu Vaccine Order Records" sub="Recording a delivery uses the sample batch label (Simulated)." right={<DemoTag />} /></div>
        <DataTable rows={orders} columns={cols} rowKey={(o) => o.id} minWidth={860} empty={<EmptyState title="No orders this season" />} />
      </Card>
    </>
  );
}

/* ---------- Cold chain ---------- */
function ColdChain() {
  const { state, flu, own } = useFluView();
  const rows = fluColdChainRows(flu, state.nurseOps?.endOfDay || []).filter((r) => own(r));
  const exc = rows.filter((r) => r.excursions.length);
  const cols: Column<FluColdChainRow>[] = [
    { key: "date", header: "Date", cell: (r) => fmtWeekdayDate(r.date) + " " + String(r.date).slice(0, 4) },
    { key: "co", header: "Clinic", cell: (r) => r.company },
    { key: "b", header: "Batch", cell: (r) => r.batchLabel || <span className="ph-faint">Not recorded</span> },
    { key: "pre", header: "Pre", align: "right", cell: (r) => temp(r.readings.preC) },
    { key: "int", header: "Intermediate", align: "right", cell: (r) => temp(r.readings.intermediateC) },
    { key: "post", header: "Post", align: "right", cell: (r) => temp(r.readings.postC) },
    { key: "st", header: "Status", cell: (r) => (r.excursions.length ? <Pill tone="bad">Out of range</Pill> : r.missing.length ? <Pill tone="warn">Reading missing</Pill> : <Pill tone="ok">In range</Pill>) },
    { key: "fu", header: "Follow-up", cell: (r) => (!r.excursions.length ? "" : r.followUps.length ? <Pill tone="ok">Logged by {staffName(state, r.followUps[r.followUps.length - 1].by)}</Pill> : <Pill tone="warn">Follow-up needed</Pill>) },
    { key: "src", header: "Source", cell: (r) => (r.eodId ? `End of Day form ${r.eodId}` : r.source === "archive" ? "End of Day form, 2025 archive (seeded)" : "Recorded with actuals") },
  ];
  return (
    <>
      <PageHeader title="Cold chain" sub="Pre-vaccine, intermediate and post-vaccine temperatures from each clinic's End of Day form. Safe range 2 to 8 °C." />
      <KpiStrip>
        <Kpi label="Clinics with readings" value={rows.length} sub="Across the 2025 archive and this season" />
        <Kpi label="Excursions" value={exc.length} tone={exc.length ? "bad" : "ok"} sub="Clinics with a reading outside 2 to 8 °C" />
        <Kpi label="Follow-up needed" value={exc.filter((r) => !r.followUps.length).length} tone={exc.some((r) => !r.followUps.length) ? "warn" : "ok"} sub={`${exc.filter((r) => r.followUps.length).length} followed up`} />
      </KpiStrip>
      <div style={{ height: 14 }} />
      <Card>
        <CardHeader title="Readings by clinic" sub="Each column is one clinic, in date order. Out-of-range readings are labelled." />
        <Legend items={[
          { kind: "node", node: <ShapeKey reading="pre" color="var(--flu-s1)" />, label: "Pre-vaccine" },
          { kind: "node", node: <ShapeKey reading="intermediate" color="var(--flu-s1)" />, label: "Intermediate" },
          { kind: "node", node: <ShapeKey reading="post" color="var(--flu-s1)" />, label: "Post-vaccine" },
          { kind: "node", node: <ShapeKey reading="pre" color="var(--bad)" />, label: "Out of range (labelled)" },
        ]} />
        <ColdChainChart rows={rows} caption="Cold chain readings by clinic against the 2 to 8 degree safe range" tickLabel={(r) => fmtDayMonth(r.date)}
          tip={(r) => (
            <>
              <div className="flu-tip-title">{r.company}, {fmtWeekdayDate(r.date)}</div>
              <TipRow name="Pre-vaccine" value={temp(r.readings.preC)} />
              <TipRow name="Intermediate" value={temp(r.readings.intermediateC)} />
              <TipRow name="Post-vaccine" value={temp(r.readings.postC)} />
              <div className="flu-tip-note">{r.excursions.length ? "Out of range" : "In range"}{r.batchLabel ? `, batch ${r.batchLabel}` : ""}</div>
            </>
          )} />
      </Card>
      <div style={{ height: 14 }} />
      <Card pad={false}>
        <DataTable rows={rows.slice().reverse()} columns={cols} rowKey={(r) => r.key} minWidth={1000} empty={<EmptyState title="No cold chain readings yet" />} />
      </Card>
    </>
  );
}
