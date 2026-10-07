/* Meddbase sessions: OH clinician diaries as in Meddbase, with Pulse's readiness check per slot
   (questionnaire received or not). Meddbase stays the system of record for occupational health. */
import { act, fmtWeekdayDate, ohDiarySlots, ohDiaryStats } from "../../model";
import type { OhSlotView } from "../../model";
import { dispatch, usePhState } from "../../store";
import { useNav } from "../../nav-context";
import { Button, Card, CardHeader, Chip, DataTable, DemoTag, Kpi, KpiStrip, PageHeader } from "../../ui";
import type { Column } from "../../ui";
import { MeddbasePill, OhNote, ReceivedPill, VIEW_ONLY_TITLE, useOhAccess } from "./shared";
import { ohAct } from "./actions";

export default function Sessions() {
  const state = usePhState();
  const nav = useNav();
  const manage = useOhAccess() === "manage";
  const diaries = state.occHealth.diaries;
  const d = diaries.find((x) => x.id === nav.params.diary) || diaries[0];
  const dis = { disabled: !manage, title: manage ? undefined : VIEW_ONLY_TITLE };
  if (!d) return <div className="ph-page"><PageHeader title="Meddbase sessions" /></div>;
  const st = ohDiaryStats(state, d);
  const client = state.occHealth.clients.find((c) => c.id === d.clientId);
  const cols: Column<OhSlotView>[] = [
    { key: "t", header: "Time", cell: (v) => <span className="ph-num">{v.slot.start}</span> },
    { key: "e", header: "Employee (fictional)", cell: (v) => v.slot.employee ? <span>{v.slot.employee.name} <span className="ph-faint">{v.slot.employee.ref}</span></span> : <span className="ph-faint">{v.slot.appointmentType}</span> },
    { key: "a", header: "Appointment", cell: (v) => v.slot.kind === "booked" ? v.slot.appointmentType : "" },
    { key: "q", header: "Questionnaire received", cell: (v) => v.slot.kind === "booked" ? <ReceivedPill received={v.received} chased={!!v.slot.chasedAt} /> : null },
    { key: "m", header: "In Meddbase", cell: (v) => v.submission ? <MeddbasePill sent={v.inMeddbase} /> : null },
    { key: "x", header: <span className="ph-faint">Action</span>, align: "right", cell: (v) => {
      if (v.slot.kind !== "booked") return null;
      if (!v.received) return (
        <span className="ph-wrap" style={{ justifyContent: "flex-end" }}>
          <Button size="sm" variant="ghost" {...dis} onClick={() => dispatch(ohAct.chaseQuestionnaire(v.slot.id))}>Chase</Button>
          <Button size="sm" {...dis} onClick={() => dispatch(ohAct.simulateQuestionnaire(v.slot.id))}>Simulate receipt</Button>
        </span>
      );
      if (!v.inMeddbase && v.submission) return <Button size="sm" icon="send" {...dis} onClick={() => dispatch(ohAct.sendToMeddbase([v.submission!.id]))}>Send to Meddbase</Button>;
      return null;
    } },
  ];
  return (
    <div className="ph-page">
      <PageHeader eyebrow="Occupational health" title="Meddbase sessions"
        sub="OH clinician diaries as they appear in Meddbase, with Pulse's readiness check: is each employee's questionnaire in before they are seen. Meddbase stays the system of record."
        actions={<Button icon="link" onClick={() => dispatch(act.toast("info", `Simulated: this would open ${d.meddbaseRef} in Meddbase. Meddbase is not connected in the demo.`))}>Open in Meddbase (Simulated)</Button>} />
      <div className="ph-stack">
        <div className="oh-toolbar">
          {diaries.map((x) => <Chip key={x.id} on={x.id === d.id} onClick={() => nav.setParams({ diary: x.id })}>{x.clinicianName}, {fmtWeekdayDate(x.date)}</Chip>)}
        </div>
        <Card>
          <CardHeader title={`${d.clinicianName}, ${fmtWeekdayDate(d.date)}`} sub={`${d.clinicianRole} · ${client?.name || d.clientId} · ${d.location} · ${d.start} to ${d.end}, ${d.slotMinutes}-minute slots · ${d.meddbaseRef}`} right={<DemoTag>Fictional employees</DemoTag>} />
          <KpiStrip>
            <Kpi label="Booked" value={st.booked} sub={`of ${st.slots} slots, ${st.free} free`} />
            <Kpi label="Questionnaires in" value={st.received} sub={`of ${st.booked} booked`} tone="ok" />
            <Kpi label="Missing" value={st.missing} sub={`${st.chased} chased`} tone={st.missing ? "warn" : "ok"} />
            <Kpi label="In Meddbase" value={st.inMeddbase} sub={`of ${st.received} received, Simulated`} />
          </KpiStrip>
        </Card>
        <OhNote>Chasing and sending are Simulated: no email, SMS or Meddbase call is made. <DemoTag>Simulated</DemoTag></OhNote>
        <Card pad={false}>
          <DataTable rows={ohDiarySlots(state, d)} columns={cols} rowKey={(v) => v.slot.id} pageSize={40} caption="Diary slots" />
        </Card>
      </div>
    </div>
  );
}
