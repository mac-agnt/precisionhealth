/* The End of Day and Mileage form, the subsistence claim and the hotel request (RECORDING.md
   section 4), as plain forms that work inline (the nurse portal's clinic close) or in a modal
   (Clinics, End of day). Field rules come from nurseOps.ts and gaps.ts, so the screen and the
   handler give the same answers. NurseDayForms is the nurse portal card. */
import { useState } from "react";
import type { ReactNode } from "react";
import {
  EOD_COLD_CHAIN, EOD_JOB_TYPES, EOD_JOB_TYPE_LABEL, EOD_MILEAGE_RATE, EOD_RATES_NOTE, EOD_VACCINE_BATCHES, MEALS, MEAL_LABEL, MEAL_RATE, PROGRAMME_BY_ID, SUBSISTENCE_NOTE,
  eodErrors, eodExcursions, eodPayLine, expenseErrors, expenseSummary, fmtEuro, fmtWeekdayDate, jobTypeForScreening, staffName, subsistenceAmount, today,
} from "../../model";
import type { BoardRowKind, ClinicSession, EodInput, ExpenseInput, ExpenseKind, JobType, LocalDate, Meal, ProgrammeId, StaffId } from "../../model";
import { dispatch, usePersona, usePhState } from "../../store";
import { Button, Checkbox, Field, Icon, Pill, Segmented, Select, Switch, TextInput, Textarea } from "../../ui";
import { opsAct } from "./opsActions";
import { clinicOutcomes } from "../NursePortal/data";
import "./board.css";

export interface EodPrefill {
  staffId: StaffId;
  date: LocalDate;
  clientLocation: string;
  programmeId?: ProgrammeId | null;
  sessionId?: string | null;
  boardItemId?: string | null;
  jobType?: JobType;
}

const num = (v: string): number | null => (v.trim() === "" ? null : Number(v));
const NURSES = ["liz", "fiona", "anita", "aisling", "ciara", "ian", "neil"];

/* ---------------------------------------------------------------- End of Day */

export function EodFields({ prefill, chooseStaff, onDone, onCancel }: { prefill: EodPrefill; chooseStaff?: boolean; onDone: (id: string) => void; onCancel?: () => void }) {
  const state = usePhState();
  const t = today(state);
  const [staffId, setStaffId] = useState<StaffId>(prefill.staffId);
  const [date, setDate] = useState(prefill.date);
  const [clientLocation, setClientLocation] = useState(prefill.clientLocation);
  const [jobType, setJobType] = useState<JobType>(prefill.jobType || "lab_screening");
  const [dayLength, setDayLength] = useState<"full" | "half">("full");
  // A clinic session fills the counts in from the outcomes the clinician recorded on the clinic list.
  const session = prefill.sessionId ? state.sessions.find((x) => x.id === prefill.sessionId) : undefined;
  const outcomes = session ? clinicOutcomes(state, session) : null;
  const [screens, setScreens] = useState(outcomes ? String(outcomes.completed) : "");
  const [dna, setDna] = useState(outcomes ? String(outcomes.didNotArrive) : "");
  const [cancelled, setCancelled] = useState(outcomes ? String(outcomes.cancelled) : "");
  const openLeft = session && session.date === t && outcomes ? outcomes.open.length : 0;
  const [vaccines, setVaccines] = useState("");
  const [pre, setPre] = useState(""); const [mid, setMid] = useState(""); const [post, setPost] = useState("");
  const [batch, setBatch] = useState("");
  const [psa, setPsa] = useState(""); const [fit, setFit] = useState("");
  const [issues, setIssues] = useState("");
  const [outside, setOutside] = useState(false);
  const [km, setKm] = useState("");
  const [tried, setTried] = useState(false);
  const flu = jobType === "flu_vaccination";
  const input: EodInput = {
    staffId, date, clientLocation, programmeId: prefill.programmeId ?? null, sessionId: prefill.sessionId ?? null, boardItemId: prefill.boardItemId ?? null, jobType, dayLength,
    screensCompleted: num(screens), dnaCount: num(dna), cancelledCount: num(cancelled), vaccinesAdministered: num(vaccines), preVaccineTempC: num(pre), intermediateVaccineTempC: num(mid), postVaccineTempC: num(post),
    vaccineBatch: batch || null, issues, outsideDublin: outside, mileageKm: outside ? num(km) : null, psaCount: num(psa), fitKitCount: num(fit),
  };
  const errs = eodErrors(input, t);
  const show = (k: string) => (tried ? errs[k] : undefined);
  const pay = eodPayLine(input);
  const exc = eodExcursions(input);
  const submit = () => {
    setTried(true);
    if (Object.keys(errs).length || openLeft) return;
    const r = dispatch(opsAct.submitEod(input));
    if (r.ok && r.id) onDone(r.id);
  };
  const n = (label: string, v: string, set: (s: string) => void, k: string, help?: string) => (
    <Field label={label} error={show(k)} help={help}><TextInput inputMode="numeric" value={v} onChange={(e) => set(e.target.value.replace(/[^\d]/g, ""))} invalid={!!show(k)} /></Field>
  );
  const temp = (label: string, v: string, set: (s: string) => void, k: string) => (
    <Field label={label} error={show(k)}><TextInput inputMode="decimal" value={v} placeholder="°C" onChange={(e) => set(e.target.value.replace(/[^\d.-]/g, ""))} invalid={!!show(k)} /></Field>
  );
  return (
    <div className="ph-stack" style={{ gap: 12 }}>
      <div className="eod-grid">
        {chooseStaff ? (
          <Field label="Nurse"><Select value={staffId} onChange={(e) => setStaffId(e.target.value as StaffId)}>{state.staff.filter((s) => NURSES.includes(s.id)).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        ) : <Field label="Nurse"><div className="brd-static">{staffName(state, staffId)}</div></Field>}
        <Field label="Date" error={show("date")}><TextInput type="date" value={date} max={t} onChange={(e) => setDate(e.target.value)} invalid={!!show("date")} /></Field>
        <div className="span2"><Field label="Company and location" error={show("clientLocation")}><TextInput value={clientLocation} onChange={(e) => setClientLocation(e.target.value)} invalid={!!show("clientLocation")} /></Field></div>
        <Field label="Job completed" help="Pay rates differ by job."><Select value={jobType} onChange={(e) => setJobType(e.target.value as JobType)}>{EOD_JOB_TYPES.map((j) => <option key={j} value={j}>{EOD_JOB_TYPE_LABEL[j]}</option>)}</Select></Field>
        <Field label="Full or half day"><Segmented label="Day length" value={dayLength} onChange={setDayLength} options={[{ id: "full", label: "Full day" }, { id: "half", label: "Half day" }]} /></Field>
        {!flu ? n("Screens completed", screens, setScreens, "screensCompleted", outcomes ? "From the clinic list: completed." : undefined) : null}
        {n("Did not arrive (DNA)", dna, setDna, "dnaCount", outcomes ? "From the clinic list." : undefined)}
        {n("Cancelled", cancelled, setCancelled, "cancelledCount", outcomes ? "From the clinic list: cancelled on the day." : "Leave blank if none.")}
        {n("Vaccines administered", vaccines, setVaccines, "vaccinesAdministered", flu ? undefined : "Leave blank if no vaccines.")}
        {flu || num(vaccines) ? (
          <Field label="Vaccine batch number" error={show("vaccineBatch")}><Select value={batch} onChange={(e) => setBatch(e.target.value)}><option value="">Choose</option>{EOD_VACCINE_BATCHES.map((b) => <option key={b} value={b}>{b}</option>)}</Select></Field>
        ) : null}
        {flu || num(vaccines) ? <>
          {temp("Pre-vaccine temperature", pre, setPre, "preVaccineTempC")}
          {temp("Intermediate temperature", mid, setMid, "intermediateVaccineTempC")}
          {temp("Post-vaccine temperature", post, setPost, "postVaccineTempC")}
          <div className="ph-faint" style={{ fontSize: 11.5, alignSelf: "center" }}>Safe range {EOD_COLD_CHAIN.text}.</div>
        </> : null}
        {!flu ? <>{n("PSAs taken", psa, setPsa, "psaCount", "If applicable.")}{n("FIT kits given", fit, setFit, "fitKitCount", "If applicable.")}</> : null}
        <div className="span2"><Field label="Issues, comments and adverse reactions" error={show("issues")}><Textarea rows={3} value={issues} onChange={(e) => setIssues(e.target.value)} placeholder="Anything the office should know. Write None if nothing." /></Field></div>
        <label className="span2 eod-switch"><Switch on={outside} onChange={setOutside} label="Screening outside Dublin (mileage claimed)" /><span>Screening outside Dublin <span className="ph-faint">(mileage claimed)</span></span></label>
        {outside ? <Field label="Mileage claimed (km)" error={show("mileageKm")} help={`Paid at €${EOD_MILEAGE_RATE.toFixed(2)} a km.`}><TextInput inputMode="numeric" value={km} onChange={(e) => setKm(e.target.value.replace(/[^\d]/g, ""))} invalid={!!show("mileageKm")} /></Field> : null}
      </div>
      {exc.length ? <div className="brd-note warn"><Icon name="alert" size={14} /><span>{exc.map((x) => x.text).join(". ")}. Tell the nursing lead today; it shows on Flu, Cold chain.</span></div> : null}
      <div className="eod-pay"><span>Pay line</span><b>{fmtEuro(pay.total)}</b><span>{pay.label}</span><span className="ph-faint" style={{ fontSize: 11 }}>{EOD_RATES_NOTE}</span></div>
      {openLeft ? <div className="brd-note warn"><Icon name="alert" size={14} /><span>{openLeft === 1 ? "One appointment is" : `${openLeft} appointments are`} not accounted for yet. Give each one an outcome on the clinic list (Check in, Did not arrive or Cancelled) before you submit.</span></div> : null}
      {tried && Object.keys(errs).length ? <div className="brd-note warn"><Icon name="alert" size={14} />{Object.keys(errs).length === 1 ? "One thing to fix" : `${Object.keys(errs).length} things to fix`} before it can be submitted.</div> : null}
      <div className="ph-wrap" style={{ gap: 8, justifyContent: "flex-end" }}>
        {onCancel ? <Button variant="ghost" onClick={onCancel}>Cancel</Button> : null}
        <Button variant="primary" icon="check" disabled={!!openLeft} title={openLeft ? "Account for every appointment first" : undefined} onClick={submit}>Submit End of Day form</Button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- subsistence and hotel */

export interface ExpensePrefill { staffId: StaffId; date: LocalDate; clientLocation: string; area?: string; target?: { kind: BoardRowKind; id: string } | null }

export function ExpenseFields({ kind, prefill, chooseStaff, onDone, onCancel }: { kind: ExpenseKind; prefill: ExpensePrefill; chooseStaff?: boolean; onDone: (id: string) => void; onCancel?: () => void }) {
  const state = usePhState();
  const t = today(state);
  const [staffId, setStaffId] = useState<StaffId>(prefill.staffId);
  const [date, setDate] = useState(prefill.date);
  const [clientLocation, setClientLocation] = useState(prefill.clientLocation);
  const [meals, setMeals] = useState<Meal[]>(["lunch"]);
  const [nights, setNights] = useState("1");
  const [area, setArea] = useState(prefill.area || "");
  const [note, setNote] = useState("");
  const [tried, setTried] = useState(false);
  const input: ExpenseInput = { kind, staffId, date, clientLocation, target: prefill.target || null, meals, nights: Number(nights) || 0, area, note };
  const errs = expenseErrors(input, t);
  const show = (k: string) => (tried ? errs[k] : undefined);
  const submit = () => {
    setTried(true);
    if (Object.keys(errs).length) return;
    const r = dispatch(opsAct.requestExpense(input));
    if (r.ok && r.id) onDone(r.id);
  };
  const toggle = (m: Meal) => setMeals(meals.includes(m) ? meals.filter((x) => x !== m) : [...meals, m]);
  return (
    <div className="ph-stack" style={{ gap: 12 }}>
      <div className="eod-grid">
        {chooseStaff ? (
          <Field label="Nurse"><Select value={staffId} onChange={(e) => setStaffId(e.target.value as StaffId)}>{state.staff.filter((s) => NURSES.includes(s.id)).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        ) : <Field label="Nurse"><div className="brd-static">{staffName(state, staffId)}</div></Field>}
        <Field label={kind === "hotel" ? "First night" : "Clinic date"} error={show("date")}><TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} invalid={!!show("date")} {...(kind === "hotel" ? { min: t } : { max: t })} /></Field>
        <div className="span2"><Field label="Company and location" error={show("clientLocation")}><TextInput value={clientLocation} onChange={(e) => setClientLocation(e.target.value)} invalid={!!show("clientLocation")} /></Field></div>
        {kind === "subsistence" ? (
          <div className="span2"><Field label="Meals" error={show("meals")} help={SUBSISTENCE_NOTE}>
            <div className="eod-meals">{MEALS.map((m) => <Checkbox key={m} checked={meals.includes(m)} onChange={() => toggle(m)} label={`${MEAL_LABEL[m]}, €${MEAL_RATE[m]}`} />)}</div>
          </Field></div>
        ) : <>
          <Field label="Nights" error={show("nights")}><TextInput inputMode="numeric" value={nights} onChange={(e) => setNights(e.target.value.replace(/[^\d]/g, ""))} invalid={!!show("nights")} /></Field>
          <Field label="Where you need to stay" error={show("area")}><TextInput value={area} onChange={(e) => setArea(e.target.value)} placeholder="For example near the client site" invalid={!!show("area")} /></Field>
        </>}
        <div className="span2"><Field label="Note (optional)" error={show("note")}><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={kind === "hotel" ? "For example first appointment 08:00." : "For example home after 20:00."} /></Field></div>
      </div>
      {kind === "subsistence" ? <div className="eod-pay"><span>Claim</span><b>{fmtEuro(subsistenceAmount(meals))}</b><span>{meals.map((m) => MEAL_LABEL[m]).join(", ") || "No meals ticked"}</span></div> : null}
      <div className="ph-wrap" style={{ gap: 8, justifyContent: "flex-end" }}>
        {onCancel ? <Button variant="ghost" onClick={onCancel}>Cancel</Button> : null}
        <Button variant="primary" icon="send" onClick={submit}>{kind === "hotel" ? "Send hotel request" : "Send subsistence claim"}</Button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- nurse portal card */

type Open = null | "eod" | "subsistence" | "hotel";

/** Clinic close in the nurse portal: the End of Day form for today, mileage, subsistence and hotels. */
export function NurseDayForms({ session }: { session: ClinicSession }) {
  const state = usePhState();
  const p = usePersona();
  const [open, setOpen] = useState<Open>(null);
  const me = p.id as StaffId;
  const prog = PROGRAMME_BY_ID[session.programmeId];
  const clientLocation = `${prog ? prog.clientName : ""}, ${session.siteName}`.replace(/^, /, "");
  const mine = state.nurseOps.endOfDay.find((e) => e.staffId === me && e.date === session.date && (e.sessionId === session.id || e.clientLocation === clientLocation));
  const claims = state.gaps.expenses.filter((e) => e.staffId === me).sort((a, b) => (a.requestedAt < b.requestedAt ? 1 : -1)).slice(0, 4);
  const pay = mine ? eodPayLine(mine) : null;
  const upcoming = state.nurseOps.board.filter((b) => b.staffIds.includes(me) && b.dates.some((d) => d > session.date));
  const nextAway = upcoming.find((b) => !/Dublin/.test(b.logistics.address || "")) || upcoming[0];
  const awayAddress = nextAway ? (nextAway.logistics.address || "").replace(new RegExp(`^${nextAway.client.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")},\\s*`), "") : "";
  const awayTown = awayAddress.split(",").map((x) => x.trim()).filter(Boolean).slice(-2).join(", ");
  const wrap = (title: string, body: ReactNode) => (
    <div className="np-card">
      <div className="ph-row-flex" style={{ gap: 8, marginBottom: 10 }}><h2 className="ph-h2 ph-grow">{title}</h2><Button size="sm" variant="ghost" icon="x" onClick={() => setOpen(null)}>Close</Button></div>
      {body}
    </div>
  );
  if (open === "eod") return wrap("End of Day and Mileage form", <EodFields prefill={{ staffId: me, date: session.date, clientLocation, programmeId: session.programmeId, sessionId: session.id, jobType: jobTypeForScreening(session.logistics?.screeningType) }} onDone={() => setOpen(null)} onCancel={() => setOpen(null)} />);
  if (open === "subsistence") return wrap("Subsistence claim", <ExpenseFields kind="subsistence" prefill={{ staffId: me, date: session.date, clientLocation }} onDone={() => setOpen(null)} onCancel={() => setOpen(null)} />);
  if (open === "hotel") return wrap("Hotel request", <ExpenseFields kind="hotel" prefill={nextAway ? { staffId: me, date: nextAway.dates.find((d) => d > session.date)!, clientLocation: `${nextAway.client}, ${awayAddress}`.replace(/, $/, ""), area: awayTown ? `Near ${awayTown}` : "", target: { kind: "board", id: nextAway.id } } : { staffId: me, date: session.date, clientLocation }} onDone={() => setOpen(null)} onCancel={() => setOpen(null)} />);
  return (
    <div className="np-card">
      <div className="ph-row-flex" style={{ flexWrap: "wrap", gap: 8, alignItems: "flex-start" }}>
        <div className="ph-grow" style={{ minWidth: 220 }}>
          <h2 className="ph-h2">End of Day form</h2>
          <div className="ph-faint" style={{ fontSize: 11.5, marginTop: 3 }}>Mandatory on the day, with your mileage. You are not paid until it is in.</div>
        </div>
        {mine ? <Pill tone="ok" icon="check">Submitted {mine.id}</Pill> : <Pill tone="warn" icon="clock">Not submitted yet</Pill>}
      </div>
      {mine && pay ? (
        <div className="eod-pay" style={{ marginTop: 10 }}><span>{EOD_JOB_TYPE_LABEL[mine.jobType]}, {mine.dayLength} day{mine.screensCompleted !== null ? `, ${mine.screensCompleted} screens` : ""}{mine.dnaCount !== null ? `, ${mine.dnaCount} DNA` : ""}{mine.cancelledCount ? `, ${mine.cancelledCount} cancelled` : ""}{mine.mileageKm ? `, ${mine.mileageKm} km` : ""}</span><b>{fmtEuro(pay.total)}</b><span className="ph-faint" style={{ fontSize: 11 }}>Illustrative pay line</span></div>
      ) : null}
      <div className="ph-wrap" style={{ gap: 8, marginTop: 12 }}>
        {!mine ? <Button variant="primary" icon="edit" onClick={() => setOpen("eod")}>Fill in End of Day form</Button> : null}
        <Button icon="plus" onClick={() => setOpen("subsistence")}>Claim subsistence</Button>
        <Button icon="calendar" onClick={() => setOpen("hotel")}>Request a hotel</Button>
      </div>
      {claims.length ? (
        <div className="eod-list" style={{ marginTop: 12 }}>
          {claims.map((e) => (
            <div key={e.id} className="eod-item">
              <div className="eod-item-main"><div className="eod-item-title">{e.kind === "hotel" ? "Hotel" : "Subsistence"} {e.id}, {fmtWeekdayDate(e.date)}</div><div className="eod-item-sub">{e.clientLocation}. {expenseSummary(e)}{e.hotel ? `. ${e.hotel}, ref ${e.bookingRef}` : ""}{e.decisionNote ? `. ${e.decisionNote}` : ""}</div></div>
              <ExpenseStatusPill status={e.status} />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ExpenseStatusPill({ status }: { status: "pending" | "approved" | "declined" | "booked" }) {
  if (status === "pending") return <Pill tone="warn" icon="clock">Waiting for approval</Pill>;
  if (status === "approved") return <Pill tone="info" icon="check">Approved</Pill>;
  if (status === "booked") return <Pill tone="ok" icon="check">Hotel booked</Pill>;
  return <Pill tone="neutral" icon="x">Declined</Pill>;
}
