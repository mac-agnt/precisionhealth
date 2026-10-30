/* Programmes, Overview: a simple list of every programme you act on. Status, window, booked of
   invited, the next screening day and reports released, with the next thing to do. Numbers and
   KPI tiles live on the Dashboard; this page is for getting things done. */
import { useState } from "react";
import type { Programme } from "../../model";
import { fmtDate, fmtDayMonth, fmtWeekdayDate, programmeCounts, programmeList, programmeStatus, rate, today } from "../../model";
import { useNav } from "../../nav-context";
import { usePhState } from "../../store";
import { Button, Card, Chip, EmptyState, PageHeader, Pill } from "../../ui";
import { NewProgrammeDialog } from "./NewProgramme";
import { dayRequestFor } from "./ProgrammeManage";
import { windowInfo } from "./model";

type Filter = "all" | "draft" | "running" | "closed";

export default function Overview() {
  const s = usePhState();
  const nav = useNav();
  const t = today(s);
  const [filter, setFilter] = useState<Filter>("all");
  const [creating, setCreating] = useState(false);
  const all = programmeList(s).map((p) => {
    const c = programmeCounts(s, p.id);
    const win = windowInfo(s, p);
    const st = programmeStatus(p);
    const next = s.sessions.filter((x) => x.programmeId === p.id && x.status !== "cancelled" && x.date >= t).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))[0] || null;
    const day = next ? s.screeningDays.days.find((d) => d.sessionId === next.id) : undefined;
    const invited = c.invited || p.setup?.headcount || 0;
    const group: Filter = st === "draft" ? "draft" : win.status === "ended" && !next ? "closed" : "running";
    const todo = st === "draft" ? "Set it live when HR is ready" : !next && win.status !== "ended" ? "Add the first screening day" : day && day.status === "draft" ? "Publish the next screening day" : c.ready ? `${c.ready} reports to review` : null;
    return { p, c, win, st, next, day, invited, group, todo };
  });
  const rows = all.filter((r) => filter === "all" || r.group === filter);
  const count = (f: Filter) => (f === "all" ? all.length : all.filter((r) => r.group === f).length);
  const open = (p: Programme) => nav.go({ page: "Programmes", tab: "programmes", params: { programme: p.id } });

  return (
    <div className="ph-page prg-page">
      <PageHeader
        title="Programmes"
        sub="Every screening programme, what stage it is at and what to do next. Open one to edit it, put it live or add a screening day."
        actions={<><Button icon="list" onClick={() => nav.go({ page: "Programmes", tab: "programmes" })}>All programmes</Button><Button variant="primary" icon="plus" onClick={() => setCreating(true)}>New programme</Button></>}
      />
      <div className="prg-cq">
        <div className="po-filters" role="group" aria-label="Show">
          <Chip on={filter === "all"} onClick={() => setFilter("all")} count={count("all")}>All</Chip>
          <Chip on={filter === "running"} onClick={() => setFilter("running")} count={count("running")}>Live</Chip>
          <Chip on={filter === "draft"} onClick={() => setFilter("draft")} count={count("draft")}>Draft</Chip>
          <Chip on={filter === "closed"} onClick={() => setFilter("closed")} count={count("closed")}>Finished</Chip>
        </div>
        <Card pad={false}>
          {rows.length ? (
            <ul className="po-list">
              <li className="po-head" aria-hidden="true">
                <span>Programme</span><span>Window</span><span>Booked of invited</span><span>Next screening day</span><span>Released</span><span />
              </li>
              {rows.map(({ p, c, win, st, next, day, invited, todo }) => (
                <li key={p.id} className="po-row">
                  <button type="button" className="po-main" onClick={() => open(p)}>
                    <span className="po-name">{p.name}</span>
                    <span className="po-sub">
                      <Pill tone={st === "draft" ? "warn" : win.status === "ended" ? "neutral" : "ok"} icon={null}>{st === "draft" ? "Draft" : win.status === "ended" ? "Window closed" : win.status === "not_started" ? "Live, not open yet" : "Live"}</Pill>
                      <span>{p.clientName}</span>
                    </span>
                  </button>
                  <span className="po-cell"><span className="po-k">Window</span>{fmtDayMonth(p.windowStart)} to {fmtDate(p.windowEnd)}<span className="po-faint">{win.label}</span></span>
                  <span className="po-cell"><span className="po-k">Booked of invited</span><b className="ph-num">{c.booked}</b> of {invited.toLocaleString("en-IE")}<span className="po-faint">{invited ? rate(c.booked, invited) : "No invites yet"}</span></span>
                  <span className="po-cell"><span className="po-k">Next screening day</span>{next ? fmtWeekdayDate(next.date) : <span className="po-faint" style={{ display: "inline" }}>None yet</span>}
                    {next ? <span className="po-faint">{day ? (day.status === "draft" ? "Draft, not on the HR portal" : "Published") : next.siteName}</span> : null}</span>
                  <span className="po-cell"><span className="po-k">Released</span><b className="ph-num">{c.released}</b><span className="po-faint">{c.attended ? `of ${c.attended} attended` : "None attended yet"}</span></span>
                  <span className="po-act">
                    {todo ? <span className="po-todo">{todo}</span> : null}
                    {!next && win.status !== "ended"
                      ? <Button size="sm" icon="plus" onClick={() => nav.go({ page: "Clinics", tab: "days", params: { ask: dayRequestFor(p, t) } })}>Add screening day</Button>
                      : <Button size="sm" icon="arrow" onClick={() => open(p)}>Open</Button>}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Nothing here" icon="list" action={<Button variant="primary" icon="plus" onClick={() => setCreating(true)}>New programme</Button>}>No programme matches this filter.</EmptyState>
          )}
        </Card>
        <div className="ph-faint" style={{ fontSize: 11.5, lineHeight: 1.5 }}>Programme totals and trends are on the Dashboard. Sites, dates and schedules are illustrative.</div>
      </div>
      {creating ? <NewProgrammeDialog onClose={() => setCreating(false)} onDone={(id) => { setCreating(false); nav.go({ page: "Programmes", tab: "programmes", params: { programme: id } }); }} /> : null}
    </div>
  );
}
