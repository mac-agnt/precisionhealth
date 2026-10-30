/* Two cards from the earlier Operations dashboard, shown under the Control panel on its All view:
   today's clinics and programme delivery per client. Every row opens the record behind it. */
import { linkFor } from "../../model";
import { useNav } from "../../nav-context";
import { usePhState } from "../../store";
import { Button, Card, CardHeader, Icon, PALETTE, Pill } from "../../ui";
import { ActRow, Empty, PROGRAMME_COLOR } from "./shared";
import { opsStats } from "./select";

/* ---- today's clinics ---- */
export function TodayCard() {
  const s = usePhState();
  const nav = useNav();
  const O = opsStats(s);
  return (
    <Card>
      <CardHeader title="Today's clinics" sub={`${O.todayLab} lab bloods, ${O.todayPoc} point of care. Point of care results can go out the same day.`}
        right={<Button size="sm" variant="ghost" icon="arrow" onClick={() => nav.go({ page: "Clinics", tab: "overview" })}>Clinics</Button>} />
      {O.today.length ? O.today.map((r) => (
        <ActRow key={r.session.id} onClick={() => nav.go({ page: "Clinics", tab: "appointments", params: { session: r.session.id, date: r.session.date } })}
          label={`Open ${r.st.programme.clientName} appointments`}
          title={<><span aria-hidden="true" style={{ display: "inline-block", width: 8, height: 8, borderRadius: 3, background: PROGRAMME_COLOR[r.session.programmeId] || PALETTE[3], marginRight: 8, verticalAlign: 1 }} />{r.st.programme.clientName}</>}
          sub={`${r.nurse} · ${r.roomTbc ? "Room to be confirmed" : r.session.room} · ${r.session.start} to ${r.session.end}`}
          right={<>
            <Pill tone={r.poc ? "info" : "neutral"} icon={r.poc ? "heart" : "flask"}>{r.poc ? "Point of care" : "Lab"}</Pill>
            <span className="ph-num" style={{ fontSize: 12, color: "var(--body)", whiteSpace: "nowrap" }}>{r.st.booked} booked · {r.st.checkedIn + r.st.inProgress} in · {r.st.completed} done</span>
          </>} />
      )) : <Empty>No clinics today.</Empty>}
    </Card>
  );
}

/* ---- programme delivery per client ---- */
export function DeliveryCard() {
  const s = usePhState();
  const nav = useNav();
  const O = opsStats(s);
  return (
    <Card>
      <CardHeader title="Programme delivery" sub="For each client: people invited, booked, attended and with their report released. Bars are out of everyone invited."
        right={<Button size="sm" variant="ghost" icon="arrow" onClick={() => nav.go({ page: "Programmes", tab: "overview" })}>Programmes</Button>} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 }}>
        {O.programmes.map((pr) => {
          const color = PROGRAMME_COLOR[pr.id] || PALETTE[0];
          const cells: Array<[string, number]> = [["Invited", pr.invited], ["Booked", pr.booked], ["Attended", pr.attended], ["Released", pr.released]];
          return (
            <button key={pr.id} type="button" className="dsh-stat" onClick={() => nav.go(linkFor("programme", pr.id))} aria-label={`Open ${pr.name}`}>
              <div className="ph-row-flex" style={{ gap: 8 }}>
                <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: 3, background: color, flex: "none" }} />
                <span className="ph-grow ph-trunc" style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{pr.client}</span>
                <Icon name="arrow" size={13} style={{ color: "var(--faint)" }} />
              </div>
              <div className="ph-faint ph-trunc" style={{ fontSize: 11.5, marginTop: 2 }}>{pr.name}</div>
              <div className="dsh-prog">
                {cells.map(([label, v]) => (
                  <div key={label} className="dsh-prog-cell">
                    <div className="ph-track" role="img" aria-label={`${label}: ${v} of ${pr.invited} invited`}><div className="ph-fill" style={{ width: `${pr.invited ? Math.min(100, (v / pr.invited) * 100) : 0}%`, background: color }} /></div>
                    <div className="dsh-prog-label">{label} <b>{v}</b></div>
                  </div>
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
