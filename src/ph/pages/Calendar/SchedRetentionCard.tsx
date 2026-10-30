/* Sales, Retention: results out emails and rebooking reminders scheduled from the Calendar with
   "+ Schedule". Hidden when there are none. Deep link: #/Sales/recall?sched=SA-0003 highlights one. */
import { useEffect } from "react";
import { fmtWeekdayDate, schedItems, schedStatusLabel } from "../../model";
import { dispatch, usePersona, usePhState } from "../../store";
import { useNav } from "../../nav-context";
import { Button, Card, CardHeader, DemoTag, Icon, Pill } from "../../ui";
import { schedAct } from "./schedActions";
import { ampm } from "./util";

export default function SchedRetentionCard() {
  const state = usePhState();
  const nav = useNav();
  const p = usePersona();
  const items = schedItems(state).filter((x) => (x.kind === "results_out" || x.kind === "rebooking") && x.status !== "cancelled")
    .sort((a, b) => (a.date + (a.start || "") < b.date + (b.start || "") ? -1 : 1));
  const hi = nav.params.sched;
  useEffect(() => { if (hi) window.setTimeout(() => document.getElementById(`rt-sched-${hi}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 80); }, [hi]);
  if (!items.length) return null;
  return (
    <Card>
      <CardHeader title={<>Scheduled from the calendar <DemoTag>Simulated sending</DemoTag></>} sub="Results out emails and rebooking reminders someone put in the Calendar. Each one sends at its time, or now with Send now." />
      <div className="rt-list">
        {items.map((x) => {
          const st = schedStatusLabel(state, x);
          return (
            <div key={x.id} id={`rt-sched-${x.id}`} className="rt-item" style={hi === x.id ? { background: "var(--accent-soft, var(--track))", borderRadius: 12 } : undefined}>
              <span className="rt-item-icon"><Icon name={x.kind === "rebooking" ? "refresh" : "mail"} size={16} /></span>
              <div className="ph-grow">
                <div className="rt-item-title">{x.title} <Pill tone={st.tone} icon={null}>{st.label}</Pill></div>
                <div className="rt-item-sub">{fmtWeekdayDate(x.date)}{x.start ? ` at ${ampm(x.start)}` : ""} · To {x.contact ? <b>{x.contact}</b> : "the HR contact"}</div>
              </div>
              <div className="rt-item-act">
                <Button size="sm" icon="calendar" onClick={() => nav.go({ page: "Calendar", tab: "all", params: { view: "week", date: x.date, ev: `sched:${x.id}` } })}>Show in calendar</Button>
                {!st.done && !p.isParticipant ? <>
                  <Button size="sm" variant="ghost" onClick={() => dispatch(schedAct.cancel(x.id))}>Cancel</Button>
                  <Button size="sm" variant="primary" icon="send" onClick={() => dispatch(schedAct.sendNow(x.id))}>Send now</Button>
                </> : null}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
