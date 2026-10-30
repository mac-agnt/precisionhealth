/* Irish Life Health web-app intake: submissions from the booking web app Precision Health built
   for Irish Life (the "Irish Life Health booking form" and the "ILH Flu booking form") waiting to be
   accepted onto the boards. Accepting a booking form submission adds it to Bookings pending 2026
   (or the weekly Lifestyle Checkpoint group); accepting a flu submission adds it to the Irish Life
   Flu board by week. Simulated intake: nothing is read from a live web app. */
import { FLU_ILH_SAMPLES, SALES_ILH_REQUESTED_LABEL, fmtShortDateTime, fmtWeekdayDate, today } from "../../model";
import { dispatch, usePhState } from "../../store";
import { useNav } from "../../nav-context";
import { Button, Card, CardHeader, DemoTag, Icon, Pill } from "../../ui";
import { salesAct } from "./actions";
import { fluAct } from "../Flu/actions";
import { useSalesRights } from "./shared";

export function IlhIntake() {
  const state = usePhState();
  const nav = useNav();
  const rights = useSalesRights();
  const t = today(state);
  const forms = state.sales.ilhIntake.slice().sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1));
  const waiting = forms.filter((x) => x.status === "waiting");
  const fluNext = FLU_ILH_SAMPLES.slice(state.flu.intake.ilh).filter((x) => x.date >= t);
  const taken = FLU_ILH_SAMPLES.slice(0, state.flu.intake.ilh).map((x) => x.company);
  const fluTaken = state.flu.clinics.filter((c) => c.intake === "ilh_form" && c.channel === "ilh" && taken.includes(c.company)).reverse();
  return (
    <Card>
      <CardHeader title={`Web app intake (${waiting.length + fluNext.length} waiting)`}
        sub="Bookings Irish Life make through the web app, waiting to go on the boards. Accept each one into bookings."
        right={<DemoTag>Simulated intake</DemoTag>} />
      <div className="ilh-in">
        <div className="ilh-in-col">
          <div className="ilh-in-head"><Icon name="file" size={14} />Irish Life Health booking form</div>
          {forms.length ? forms.map((x) => (
            <div key={x.ref} className="ilh-in-item">
              <div className="ph-grow" style={{ minWidth: 0 }}>
                <div className="ilh-in-title">{x.company}: {SALES_ILH_REQUESTED_LABEL[x.requested]}</div>
                <div className="ilh-in-sub">{fmtWeekdayDate(x.date)} at {x.start} · {x.location}, {x.eircode}</div>
                <div className="ilh-in-sub ph-faint">{x.ref}, sent {fmtShortDateTime(x.submittedAt)}</div>
              </div>
              {x.status === "added" ? <Pill tone="ok" icon="check">In bookings</Pill>
                : rights.ilh ? <Button size="sm" variant="primary" icon="check" onClick={() => dispatch(salesAct.ilhAddFromIntake(x.ref))}>Accept into bookings</Button> : <Pill tone="warn" icon="clock">Waiting</Pill>}
            </div>
          )) : <div className="ilh-in-sub">No submissions.</div>}
        </div>
        <div className="ilh-in-col">
          <div className="ilh-in-head"><Icon name="heart" size={14} />ILH Flu booking form</div>
          {fluNext.map((x, i) => (
            <div key={x.company} className="ilh-in-item">
              <div className="ph-grow" style={{ minWidth: 0 }}>
                <div className="ilh-in-title">{x.company}: flu, {x.projected} projected</div>
                <div className="ilh-in-sub">{fmtWeekdayDate(x.date)} at {x.start} · {x.address}, {x.eircode}</div>
              </div>
              {i === 0 && rights.ilh ? <Button size="sm" variant="primary" icon="check" onClick={() => dispatch(fluAct.intakeIlh())}>Accept into bookings</Button>
                : <Pill tone="warn" icon="clock">{i === 0 ? "Waiting" : "Next in line"}</Pill>}
            </div>
          ))}
          {fluTaken.map((c) => (
            <div key={c.id} className="ilh-in-item">
              <div className="ph-grow" style={{ minWidth: 0 }}>
                <div className="ilh-in-title">{c.company}: flu, {c.projected} projected</div>
                <div className="ilh-in-sub">{c.date ? fmtWeekdayDate(c.date) : "Date to confirm"}{c.start ? ` at ${c.start}` : ""} · {c.item}</div>
              </div>
              <button type="button" className="ph-link" onClick={() => nav.go({ page: "Flu", tab: "bookings" })}><Pill tone="ok" icon="check">On the flu board</Pill></button>
            </div>
          ))}
          {!fluNext.length && !fluTaken.length ? <div className="ilh-in-sub">No flu submissions waiting.</div> : null}
        </div>
      </div>
      <style>{CSS}</style>
    </Card>
  );
}

const CSS = `
.ilh-in { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.ilh-in-col { min-width: 0; }
.ilh-in-head { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; color: var(--ink); text-transform: uppercase; letter-spacing: .04em; margin-bottom: 4px; }
.ilh-in-item { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-top: 1px solid var(--border); flex-wrap: wrap; }
.ilh-in-title { color: var(--ink); font-weight: 500; font-size: 13px; }
.ilh-in-sub { color: var(--dim); font-size: 12px; margin-top: 2px; }
@media (max-width: 900px) { .ilh-in { grid-template-columns: minmax(0, 1fr); } }
`;
