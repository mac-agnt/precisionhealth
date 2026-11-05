/* Clinics, End of day: the End of Day and Mileage forms the nurses submit (they are not paid until
   it is in), the days still missing a form, mileage and pay totals per nurse, and subsistence
   claims and hotel requests with their approval. Approvals also show in Work, Approvals.
   Deep links: #/Clinics/end-of-day, #/Clinics/end-of-day?eod=EOD-0014, #/Clinics/end-of-day?new=eod */
import { useMemo, useState } from "react";
import {
  EOD_JOB_TYPE_LABEL, EOD_MILEAGE_RATE, addDays, EOD_RATES_NOTE, EXPENSE_APPROVERS, PROGRAMME_BY_ID, eodExcursions, eodPayLine, expenseSummary, fmtDate, fmtEuro, fmtInt, fmtShortDateTime,
  fmtWeekdayDate, jobTypeForScreening, localDateOf, staffName, today,
} from "../../model";
import type { EndOfDaySubmission, ExpenseKind, ExpenseRequest, PhState, StaffId } from "../../model";
import { dispatch, usePersona, usePhState } from "../../store";
import { useNav } from "../../nav-context";
import { Button, Card, CardHeader, DataTable, Drawer, EmptyState, Icon, Kpi, KpiStrip, Modal, PageHeader, Pill, Segmented, TextInput } from "../../ui";
import type { Column } from "../../ui";
import { EodFields, ExpenseFields, ExpenseStatusPill } from "./EodForm";
import type { EodPrefill } from "./EodForm";
import { opsAct } from "./opsActions";
import "./board.css";

/** Seeded history starts on 14 September; days before it are not expected to have a form. */
const FROM = "2026-09-14";

export interface MissingEod extends EodPrefill { key: string; label: string }
/** Past clinic days (sessions and board bookings) whose booked nurse has no End of Day form. */
export function missingEods(state: PhState): MissingEod[] {
  const t = today(state);
  const subs = state.nurseOps.endOfDay;
  const has = (staffId: string, date: string, sessionId: string | null, boardId: string | null, loc: string) =>
    subs.some((e) => e.staffId === staffId && e.date === date && ((sessionId && e.sessionId === sessionId) || (boardId && e.boardItemId === boardId) || e.clientLocation.toLowerCase().startsWith(loc.toLowerCase())));
  const out: MissingEod[] = [];
  for (const s of state.sessions) {
    if (s.status === "cancelled" || s.date >= t || s.date < FROM) continue;
    const prog = PROGRAMME_BY_ID[s.programmeId];
    const client = prog ? prog.clientName : s.programmeId;
    if (has(s.nurseId, s.date, s.id, null, client)) continue;
    out.push({ key: `${s.id}:${s.nurseId}`, staffId: s.nurseId, date: s.date, clientLocation: `${client}, ${s.siteName}`, programmeId: s.programmeId, sessionId: s.id, jobType: jobTypeForScreening(s.logistics?.screeningType), label: `${client}, ${s.siteName}` });
  }
  for (const b of state.nurseOps.board) {
    for (const d of b.dates) {
      if (d >= t || d < FROM) continue;
      for (const sid of b.staffIds) {
        if (has(sid, d, null, b.id, b.client)) continue;
        out.push({ key: `${b.id}:${d}:${sid}`, staffId: sid, date: d, clientLocation: `${b.client}, ${b.logistics.address || b.room || ""}`.replace(/, $/, ""), boardItemId: b.id, jobType: jobTypeForScreening(b.logistics.screeningType), label: b.client });
      }
    }
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : -1));
}

type NewForm = null | { kind: "eod"; prefill: EodPrefill } | { kind: ExpenseKind };

export default function EndOfDay() {
  const state = usePhState();
  const p = usePersona();
  const nav = useNav();
  const t = today(state);
  const manage = !p.isParticipant && p.perms.has("bookings.manage");
  const meNurse = ["liz", "fiona", "anita", "aisling", "ciara", "ian", "neil"].includes(p.id);
  const subs = useMemo(() => state.nurseOps.endOfDay.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.id < b.id ? 1 : -1)), [state.nurseOps.endOfDay]);
  const missing = useMemo(() => missingEods(state), [state]);
  const [form, setForm] = useState<NewForm>(nav.params.new === "eod" ? { kind: "eod", prefill: { staffId: (meNurse ? p.id : "fiona") as StaffId, date: t, clientLocation: "" } } : null);
  const viewing = subs.find((e) => e.id === nav.params.eod) || null;
  const last30 = subs.filter((e) => e.date >= addDays(t, -30));
  const km = subs.reduce((n, e) => n + (e.mileageKm || 0), 0);
  const waiting = state.gaps.expenses.filter((e) => e.status === "pending");
  const late = (e: EndOfDaySubmission) => localDateOf(e.submittedAt) > e.date;
  const canSubmitFor = (staffId: string) => manage || staffId === p.id;

  /* Pay and mileage per nurse. */
  const perNurse = useMemo(() => {
    const m = new Map<string, { staffId: string; days: number; km: number; mileage: number; day: number; total: number }>();
    for (const e of subs) {
      const pl = eodPayLine(e);
      const r = m.get(e.staffId) || { staffId: e.staffId, days: 0, km: 0, mileage: 0, day: 0, total: 0 };
      r.days += 1; r.km += e.mileageKm || 0; r.mileage += pl.mileage; r.day += pl.day; r.total += pl.total;
      m.set(e.staffId, r);
    }
    return Array.from(m.values()).sort((a, b) => b.total - a.total);
  }, [subs]);

  const cols: Column<EndOfDaySubmission>[] = [
    { key: "date", header: "Date", sort: (a, b) => a.date.localeCompare(b.date), cell: (e) => <div><div style={{ color: "var(--ink)" }}>{fmtWeekdayDate(e.date)}</div><div className="ph-faint ph-mono" style={{ fontSize: 10.5 }}>{e.id}</div></div> },
    { key: "nurse", header: "Nurse", sort: (a, b) => staffName(state, a.staffId).localeCompare(staffName(state, b.staffId)), cell: (e) => staffName(state, e.staffId) },
    { key: "where", header: "Company and location", nowrap: false, cell: (e) => <div style={{ minWidth: 180, maxWidth: 260, fontSize: 12.5 }}>{e.clientLocation}</div> },
    { key: "job", header: "Job", nowrap: false, cell: (e) => <div style={{ minWidth: 130, fontSize: 12.5 }}>{EOD_JOB_TYPE_LABEL[e.jobType]}<div className="ph-faint" style={{ fontSize: 11 }}>{e.dayLength === "full" ? "Full day" : "Half day"}</div></div> },
    { key: "counts", header: "Done", nowrap: false, cell: (e) => <span className="ph-num" style={{ fontSize: 12.5 }}>{[e.screensCompleted !== null ? `${e.screensCompleted} screens` : "", e.vaccinesAdministered !== null ? `${e.vaccinesAdministered} vaccines` : "", e.dnaCount !== null ? `${e.dnaCount} DNA` : "", e.cancelledCount ? `${e.cancelledCount} cancelled` : ""].filter(Boolean).join(", ") || "Talk or visit"}</span> },
    { key: "km", header: "Mileage", align: "right", sort: (a, b) => (a.mileageKm || 0) - (b.mileageKm || 0), cell: (e) => (e.mileageKm ? `${fmtInt(e.mileageKm)} km` : <span className="ph-faint">Dublin</span>) },
    { key: "pay", header: "Pay line", align: "right", cell: (e) => fmtEuro(eodPayLine(e).total) },
    { key: "flags", header: "", cell: (e) => <span className="ph-wrap" style={{ gap: 4 }}>{eodExcursions(e).length ? <Pill tone="bad" icon="alert">Cold chain</Pill> : null}{late(e) ? <Pill tone="warn" icon="clock">Next day</Pill> : null}{e.submittedBy ? <Pill>By {staffName(state, e.submittedBy).split(" ")[0]}</Pill> : null}</span> },
  ];

  return (
    <div className="ph-page brd">
      <PageHeader title="End of day" eyebrow="End of Day and Mileage form"
        sub="Every nurse submits the End of Day form on the day, with mileage for screening outside Dublin. Nurses are not paid until it is in. Subsistence claims and hotel requests are approved here or in Work, Approvals."
        actions={<>
          <Button icon="plus" onClick={() => setForm({ kind: "subsistence" })}>Claim subsistence</Button>
          <Button icon="calendar" onClick={() => setForm({ kind: "hotel" })}>Request a hotel</Button>
          <Button variant="primary" icon="edit" onClick={() => setForm({ kind: "eod", prefill: { staffId: (meNurse ? p.id : "fiona") as StaffId, date: t, clientLocation: "" } })}>New End of Day form</Button>
        </>} />
      <div className="ph-stack">
        <KpiStrip>
          <Kpi label="Forms submitted" value={subs.length} sub={`${last30.length} in the last 30 days`} icon="check" />
          <Kpi label="Missing forms" value={missing.length} sub="Past clinic days without one" tone={missing.length ? "warn" : "ok"} icon="alert" />
          <Kpi label="Mileage claimed" value={`${fmtInt(km)} km`} sub={`${fmtEuro(Math.round(km * EOD_MILEAGE_RATE * 100) / 100)} at €${EOD_MILEAGE_RATE.toFixed(2)} a km`} icon="pin" />
          <Kpi label="Claims waiting" value={waiting.length} sub="Subsistence and hotels to approve" tone={waiting.length ? "warn" : "ok"} icon="clock" />
        </KpiStrip>

        <Card>
          <CardHeader title="Missing End of Day forms" sub="Past clinic days where the booked nurse has not submitted the form yet." />
          {missing.length ? (
            <div className="eod-list">
              {missing.map((m) => (
                <div key={m.key} className="eod-item">
                  <span style={{ color: "var(--warn)" }}><Icon name="clock" size={15} /></span>
                  <div className="eod-item-main"><div className="eod-item-title">{staffName(state, m.staffId)}, {fmtWeekdayDate(m.date)}</div><div className="eod-item-sub">{m.label}. {EOD_JOB_TYPE_LABEL[m.jobType || "lab_screening"]}.</div></div>
                  {canSubmitFor(m.staffId) ? <Button size="sm" icon="edit" onClick={() => setForm({ kind: "eod", prefill: m })}>{m.staffId === p.id ? "Fill in mine" : `Submit for ${staffName(state, m.staffId).split(" ")[0]}`}</Button> : null}
                </div>
              ))}
            </div>
          ) : <div className="ph-dim" style={{ fontSize: 12.5 }}>Every past clinic day has its End of Day form.</div>}
        </Card>

        <Card pad={false}>
          <div style={{ padding: "16px 16px 4px" }}><CardHeader title="Submitted forms" sub="Select a row to see everything on the form." /></div>
          <DataTable rows={subs} columns={cols} rowKey={(e) => e.id} minWidth={1000} caption="End of Day forms" onRowClick={(e) => nav.setParams({ eod: e.id })} selectedKey={viewing?.id} pageSize={10}
            footerNote={EOD_RATES_NOTE} />
        </Card>

        <Card pad={false}>
          <div style={{ padding: "16px 16px 4px" }}><CardHeader title="Mileage and pay by nurse" sub={`From the submitted forms. ${EOD_RATES_NOTE}`} /></div>
          <DataTable rows={perNurse} rowKey={(r) => r.staffId} minWidth={620} caption="Mileage and pay by nurse" columns={[
            { key: "n", header: "Nurse", cell: (r) => staffName(state, r.staffId) },
            { key: "d", header: "Days", align: "right", cell: (r) => r.days },
            { key: "k", header: "Mileage", align: "right", cell: (r) => `${fmtInt(r.km)} km` },
            { key: "m", header: "Mileage pay", align: "right", cell: (r) => fmtEuro(r.mileage) },
            { key: "p", header: "Day pay", align: "right", cell: (r) => fmtEuro(r.day) },
            { key: "t", header: "Total", align: "right", cell: (r) => <b style={{ color: "var(--ink)" }}>{fmtEuro(r.total)}</b> },
          ]} />
        </Card>

        <ExpenseApprovals title="Subsistence and hotels" />
      </div>

      {form ? (
        <Modal open onClose={() => setForm(null)} width={720} title={form.kind === "eod" ? "End of Day and Mileage form" : form.kind === "hotel" ? "Hotel request" : "Subsistence claim"}>
          {form.kind === "eod"
            ? <EodFields prefill={form.prefill} chooseStaff={manage} onDone={() => setForm(null)} onCancel={() => setForm(null)} />
            : <ExpenseFields kind={form.kind} chooseStaff={manage} prefill={{ staffId: (meNurse ? p.id : "anita") as StaffId, date: form.kind === "hotel" ? addDays(t, 14) : t, clientLocation: "" }} onDone={() => setForm(null)} onCancel={() => setForm(null)} />}
        </Modal>
      ) : null}
      {viewing ? <EodDrawer e={viewing} onClose={() => nav.setParams({})} /> : null}
    </div>
  );
}

function EodDrawer({ e, onClose }: { e: EndOfDaySubmission; onClose: () => void }) {
  const state = usePhState();
  const pay = eodPayLine(e);
  const exc = eodExcursions(e);
  const temp = (v: number | null) => (v === null ? "Not recorded" : `${v.toFixed(1)} °C`);
  const rows: Array<[string, string]> = [
    ["Date", fmtWeekdayDate(e.date)], ["Company and location", e.clientLocation], ["Job completed", EOD_JOB_TYPE_LABEL[e.jobType]], ["Full or half day", e.dayLength === "full" ? "Full day" : "Half day"],
    ["Screens completed", e.screensCompleted === null ? "Not applicable" : String(e.screensCompleted)], ["Did not arrive (DNA)", e.dnaCount === null ? "Not applicable" : String(e.dnaCount)], ["Cancelled", e.cancelledCount == null ? "Not recorded" : String(e.cancelledCount)],
    ["Vaccines administered", e.vaccinesAdministered === null ? "None" : String(e.vaccinesAdministered)], ["Pre-vaccine temperature", temp(e.preVaccineTempC)], ["Intermediate temperature", temp(e.intermediateVaccineTempC)],
    ["Post-vaccine temperature", temp(e.postVaccineTempC)], ["Vaccine batch", e.vaccineBatch || "None"], ["PSAs and FIT kits", `${e.psaCount ?? "None"} PSAs, ${e.fitKitCount ?? "None"} FIT kits`],
    ["Issues and adverse reactions", e.issues || "None"], ["Screening outside Dublin", e.outsideDublin ? `Yes, ${e.mileageKm} km claimed` : "No"],
    ["Submitted", `${fmtShortDateTime(e.submittedAt)}${e.submittedBy ? ` by ${staffName(state, e.submittedBy)}` : ""}`],
  ];
  return (
    <Drawer open onClose={onClose} width={560} title={`${staffName(state, e.staffId)}, ${fmtDate(e.date)}`} sub={`End of Day form ${e.id}`}>
      <div className="ph-stack" style={{ gap: 12 }}>
        {exc.length ? <div className="brd-note warn"><Icon name="alert" size={14} />{exc.map((x) => x.text).join(". ")}.</div> : null}
        <div className="brd-brief"><dl>{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl></div>
        <div className="eod-pay"><span>Pay line</span><b>{fmtEuro(pay.total)}</b><span>{pay.label}</span><span className="ph-faint" style={{ fontSize: 11 }}>{EOD_RATES_NOTE}</span></div>
      </div>
    </Drawer>
  );
}

/* ---------------------------------------------------------------- approvals (also on Work, Approvals) */

export function ExpenseApprovals({ title, compact }: { title: string; compact?: boolean }) {
  const state = usePhState();
  const p = usePersona();
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [declining, setDeclining] = useState<ExpenseRequest | null>(null);
  const [booking, setBooking] = useState<ExpenseRequest | null>(null);
  const [text, setText] = useState("");
  const approver = !p.isParticipant && EXPENSE_APPROVERS.includes(p.id as StaffId);
  const all = state.gaps.expenses.slice().sort((a, b) => (a.requestedAt < b.requestedAt ? 1 : -1));
  const rows = filter === "pending" ? all.filter((e) => e.status === "pending" || (e.kind === "hotel" && e.status === "approved")) : all;
  return (
    <Card>
      <CardHeader title={title} sub={`Nurses claim subsistence and ask for hotels for clinic days away. ${approver ? "Approve or decline; a booked hotel is added to the day brief." : "Stephen, Martina, Brenda or Liz approve them."}`}
        right={<Segmented label="Show" value={filter} onChange={setFilter} options={[{ id: "pending", label: "To do", count: all.filter((e) => e.status === "pending" || (e.kind === "hotel" && e.status === "approved")).length }, { id: "all", label: "All", count: all.length }]} />} />
      {rows.length ? (
        <div className="eod-list">
          {rows.slice(0, compact ? 6 : 50).map((e) => {
            const own = e.staffId === p.id;
            return (
              <div key={e.id} className="eod-item">
                <span style={{ color: "var(--accent)" }}><Icon name={e.kind === "hotel" ? "calendar" : "file"} size={15} /></span>
                <div className="eod-item-main">
                  <div className="eod-item-title">{e.kind === "hotel" ? "Hotel request" : "Subsistence claim"}: {staffName(state, e.staffId)}, {fmtWeekdayDate(e.date)} <span className="ph-faint ph-mono" style={{ fontSize: 10.5 }}>{e.id}</span></div>
                  <div className="eod-item-sub">{e.clientLocation}. {expenseSummary(e)}.{e.note ? ` "${e.note}"` : ""}{e.hotel ? ` ${e.hotel}, ref ${e.bookingRef}.` : ""}{e.decidedBy ? ` ${e.status === "declined" ? "Declined" : "Approved"} by ${staffName(state, e.decidedBy).split(" ")[0]}${e.decisionNote ? `: ${e.decisionNote}` : ""}.` : ""}</div>
                </div>
                <ExpenseStatusPill status={e.status} />
                {approver && e.status === "pending" && !own ? <span className="ph-wrap" style={{ gap: 6 }}>
                  <Button size="sm" variant="primary" icon="check" onClick={() => dispatch(opsAct.decideExpense(e.id, true))}>Approve</Button>
                  <Button size="sm" variant="ghost" icon="x" onClick={() => { setText(""); setDeclining(e); }}>Decline</Button>
                </span> : null}
                {approver && e.status === "pending" && own ? <span className="ph-faint" style={{ fontSize: 11.5 }}>Your own request: another approver decides</span> : null}
                {approver && e.kind === "hotel" && e.status === "approved" ? <Button size="sm" icon="calendar" onClick={() => { setText(""); setBooking(e); }}>Book hotel</Button> : null}
              </div>
            );
          })}
        </div>
      ) : <EmptyState title="Nothing to approve" icon="check">New claims and hotel requests show here.</EmptyState>}
      {declining ? (
        <Modal open onClose={() => setDeclining(null)} title={`Decline ${declining.id}`} footer={<><Button variant="ghost" onClick={() => setDeclining(null)}>Cancel</Button><Button variant="danger" icon="x" onClick={() => { if (dispatch(opsAct.decideExpense(declining.id, false, text)).ok) setDeclining(null); }}>Decline</Button></>}>
          <TextInput autoFocus value={text} onChange={(ev) => setText(ev.target.value)} placeholder="Why, in a few words. The nurse sees it." aria-label="Reason" />
        </Modal>
      ) : null}
      {booking ? (
        <Modal open onClose={() => setBooking(null)} title={`Book a hotel for ${staffName(state, booking.staffId)}`} footer={<><Button variant="ghost" onClick={() => setBooking(null)}>Cancel</Button><Button variant="primary" icon="check" onClick={() => { if (dispatch(opsAct.bookHotel(booking.id, text)).ok) setBooking(null); }}>Mark as booked</Button></>}>
          <div className="ph-stack" style={{ gap: 10 }}>
            <div className="ph-dim" style={{ fontSize: 12.5 }}>{expenseSummary(booking)}. {booking.target ? "The hotel is added to the booking on the board, so the nurse day brief shows it." : ""} Simulated: no booking is made.</div>
            <TextInput autoFocus value={text} onChange={(ev) => setText(ev.target.value)} placeholder="Hotel name, for example Clayton Hotel Cork" aria-label="Hotel" />
          </div>
        </Modal>
      ) : null}
    </Card>
  );
}
