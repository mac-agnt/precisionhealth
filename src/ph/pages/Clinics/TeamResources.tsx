/* Clinics, Nurse rota (tab id team-resources). Nurses down the side, the days of the week across.
   Each cell shows that nurse's screening days, clinic sessions, client bookings, flu clinics,
   Meddbase sessions, leave and training. Red means a conflict: double-booked, or working while on
   leave or at training. The Unstaffed row lists work with nobody on it. Click a cell to put the
   nurse on something or book leave; click an assignment to change the nurse, remove them or open
   the record. Rooms and label printers from the old Team and resources screen sit under a toggle. */
import "./rota.css";
import { useState } from "react";
import type { LocalDate, Resource, RotaItem, Staff } from "../../model";
import {
  ROLE_LABEL, ROTA_KIND_LABEL, addDays, fmtDate, fmtDateLong, fmtWeekdayDate, plural, rotaCandidates, rotaCellItems, rotaConflictKeys, rotaConflicts,
  rotaConflictsBetween, rotaItemsOn, rotaNurses, rotaOpenWork, rotaTimeText, rotaUnstaffed, rotaWeek, sessionStats, today,
} from "../../model";
import { dispatch, usePhState } from "../../store";
import { useNav } from "../../nav-context";
import { Avatar, Button, Card, CardHeader, DemoTag, EntityLink, Field, Icon, Modal, Pill, Segmented, TextInput } from "../../ui";
import { requestNursePortalNurse } from "../NursePortal";
import { schedAct } from "../Calendar/schedActions";
import { rotaAct } from "./rotaActions";
import { clinicAccess, sortSessions } from "./selectors";
import { ClxDrawer, slotCount, useWidth } from "./shared";

const WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const short = (d: LocalDate) => { const [, m, dd] = d.split("-").map(Number); return `${dd} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]}`; };
const firstName = (s: Staff | undefined) => (s ? s.name.split(" ")[0] : "");
const KIND_SHORT: Record<RotaItem["kind"], string> = { screening_day: "Screening day", clinic: "Clinic", booking: "Booking", flu: "Flu", oh: "Meddbase", leave: "Leave", training: "Training" };

type Sel = { kind: "item"; key: string; date: LocalDate; staffId: string | null } | { kind: "cell"; staffId: string; date: LocalDate } | null;

export default function TeamResources() {
  const state = usePhState();
  const nav = useNav();
  const t = today(state);
  const view = nav.params.view === "resources" ? "resources" : "rota";
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(nav.params.week || "") ? (nav.params.week as LocalDate) : t;
  const week = rotaWeek(anchor);
  const set = (p: Record<string, string>) => nav.setParams(Object.fromEntries(Object.entries({ ...nav.params, ...p }).filter(([, v]) => v !== "")));
  const [sel, setSel] = useState<Sel>(null);
  const [leaveFor, setLeaveFor] = useState<{ staffId: string; date: LocalDate } | null>(null);
  const [profile, setProfile] = useState<string | null>(null);
  const unstaffed = rotaUnstaffed(state, week[0], week[6]);
  const conflicts = rotaConflictsBetween(state, week[0], week[6]).filter((c) => c.date >= t);

  return (
    <div className="ph-page">
      <div className="clx rt">
        <PageHeader2
          title="Nurse rota"
          sub="Who is working where each day: screening days, clinics, client bookings, flu clinics, Meddbase sessions, leave and training. Change a nurse here and the calendar, the nurse portal and the screening day all follow."
          right={<Segmented<"rota" | "resources"> label="Show" value={view} onChange={(v) => set({ view: v === "rota" ? "" : v })}
            options={[{ id: "rota", label: "Rota" }, { id: "resources", label: "Rooms and printers" }]} />}
        />
        {view === "resources" ? <Resources /> : (
          <>
            <div className="rt-bar">
              <div className="rt-week">
                <Button size="sm" variant="ghost" icon="chevronLeft" aria-label="Previous week" onClick={() => set({ week: addDays(week[0], -7) })} />
                <span className="rt-week-l">Week of {fmtDate(week[0])}</span>
                <Button size="sm" variant="ghost" icon="chevronRight" aria-label="Next week" onClick={() => set({ week: addDays(week[0], 7) })} />
                {!week.includes(t) ? <Button size="sm" onClick={() => set({ week: "" })}>This week</Button> : null}
              </div>
              <div className="rt-sum">
                <span className={"rt-sum-i" + (unstaffed.length ? " warn" : "")}><Icon name={unstaffed.length ? "alert" : "check"} size={13} />{unstaffed.length ? `${plural(unstaffed.length, "thing")} need a nurse` : "Everything has a nurse"}</span>
                <span className={"rt-sum-i" + (conflicts.length ? " bad" : "")}><Icon name={conflicts.length ? "flag" : "check"} size={13} />{conflicts.length ? plural(conflicts.length, "conflict") : "No conflicts"}</span>
                <Button size="sm" icon="calendar" onClick={() => nav.go({ page: "Calendar", tab: "all", params: { view: "week", date: week[0] } })}>Open in Calendar</Button>
              </div>
            </div>
            <RotaGrid week={week} onItem={(it, staffId) => setSel({ kind: "item", key: it.key, date: it.date, staffId })} onCell={(staffId, date) => setSel({ kind: "cell", staffId, date })} onNurse={setProfile} />
            <div className="rt-legend" aria-label="Key">
              {(["screening_day", "clinic", "booking", "flu", "oh", "leave", "training"] as const).map((k) => <span key={k}><i className={`rt-dot k-${k}`} />{ROTA_KIND_LABEL[k]}</span>)}
              <span><i className="rt-dot k-bad" />Conflict</span>
            </div>
            {conflicts.length ? (
              <Card>
                <CardHeader title="Conflicts to sort out" sub="Change the nurse on one of them, or move the leave in the Calendar." />
                <ul className="rt-cf">
                  {conflicts.map((c) => {
                    const st = state.staff.find((x) => x.id === c.staffId);
                    const work = rotaItemsOn(state, c.date).find((x) => c.keys.includes(x.key) && !x.absence);
                    return (
                      <li key={c.staffId + c.date + c.keys.join()}>
                        <Icon name="flag" size={13} />
                        <span className="ph-grow"><b>{st?.name}</b>, {fmtWeekdayDate(c.date)}: {c.text}.</span>
                        {work ? <Button size="sm" onClick={() => setSel({ kind: "item", key: work.key, date: work.date, staffId: c.staffId })}>Change nurse</Button> : null}
                      </li>
                    );
                  })}
                </ul>
              </Card>
            ) : null}
          </>
        )}
      </div>
      {sel?.kind === "item" ? <ItemDialog sel={sel} onClose={() => setSel(null)} /> : null}
      {sel?.kind === "cell" ? <CellDialog staffId={sel.staffId} date={sel.date} onClose={() => setSel(null)} onLeave={() => { setLeaveFor({ staffId: sel.staffId, date: sel.date }); setSel(null); }} /> : null}
      {leaveFor ? <LeaveDialog staffId={leaveFor.staffId} date={leaveFor.date} onClose={() => setLeaveFor(null)} /> : null}
      <StaffDrawer staff={state.staff.find((x) => x.id === profile)} onClose={() => setProfile(null)} />
    </div>
  );
}

function PageHeader2({ title, sub, right }: { title: string; sub: string; right: React.ReactNode }) {
  return (
    <div className="rt-head">
      <div className="ph-grow" style={{ minWidth: 240 }}>
        <h1 className="ph-h1">{title}</h1>
        <p className="rt-head-sub">{sub}</p>
      </div>
      {right}
    </div>
  );
}

/* ---------------------------------------------------------------- the grid */

function Chip({ it, bad, onClick, showWho }: { it: RotaItem; bad: boolean; onClick: () => void; showWho?: string }) {
  return (
    <button type="button" className={`rt-chip k-${it.kind}${bad ? " bad" : ""}${it.locked ? " past" : ""}`} onClick={onClick}
      title={`${it.title}. ${rotaTimeText(it)}${it.where ? `. ${it.where}` : ""}${bad ? ". Conflict" : ""}`}>
      <span className="rt-chip-t">{bad ? <Icon name="alert" size={11} /> : null}{it.absence ? it.title : it.client || it.title}</span>
      <span className="rt-chip-s">{showWho ? showWho : it.absence ? rotaTimeText(it) : `${KIND_SHORT[it.kind]}${it.start ? `, ${it.start}` : ""}`}</span>
    </button>
  );
}

function RotaGrid({ week, onItem, onCell, onNurse }: { week: LocalDate[]; onItem: (it: RotaItem, staffId: string | null) => void; onCell: (staffId: string, date: LocalDate) => void; onNurse: (id: string) => void }) {
  const state = usePhState();
  const t = today(state);
  const nurses = rotaNurses(state);
  const [ref, width] = useWidth<HTMLDivElement>();
  const narrow = width > 0 && width < 720;
  const [dayIdx, setDayIdx] = useState(() => Math.max(0, week.indexOf(t)));
  const days = narrow ? [week[Math.min(dayIdx, 6)]] : week;
  const unstaffedOn = (d: LocalDate) => rotaItemsOn(state, d).filter((x) => x.unstaffed && !x.locked);
  return (
    <div ref={ref}>
      {narrow ? (
        <div className="rt-days" role="tablist" aria-label="Day">
          {week.map((d, i) => (
            <button key={d} type="button" role="tab" aria-selected={i === dayIdx} className={"rt-dtab" + (i === dayIdx ? " on" : "") + (d === t ? " today" : "")} onClick={() => setDayIdx(i)}>
              <span>{WD[i]}</span><b>{Number(d.slice(8))}</b>{unstaffedOn(d).length || nurses.some((n) => rotaConflicts(state, n.id, d).length) ? <i aria-label="Needs attention" /> : null}
            </button>
          ))}
        </div>
      ) : null}
      <div className="rt-scroll">
        <table className={"rt-grid" + (narrow ? " one" : "")} aria-label="Nurse rota">
          <thead>
            <tr>
              <th className="rt-who-h">Nurse</th>
              {days.map((d) => (
                <th key={d} className={d === t ? "today" : d < t ? "past" : ""} aria-current={d === t ? "date" : undefined}>
                  <span className="rt-dh">{WD[week.indexOf(d)]} {short(d)}</span>{d === t ? <span className="rt-today">Today</span> : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="rt-unrow">
              <th className="rt-who"><span className="rt-un-h"><Icon name="alert" size={13} /> Unstaffed</span><span className="rt-who-s">Needs a nurse</span></th>
              {days.map((d) => {
                const list = unstaffedOn(d);
                return (
                  <td key={d} className={d === t ? "today" : ""}>
                    {list.map((it) => <Chip key={it.key} it={it} bad={false} onClick={() => onItem(it, null)} showWho="Needs a nurse" />)}
                  </td>
                );
              })}
            </tr>
            {nurses.map((n) => (
              <tr key={n.id}>
                <th className="rt-who">
                  <button type="button" className="rt-who-b" onClick={() => onNurse(n.id)} title="Profile and every assignment">
                    <Avatar name={n.name} tint={n.tint} size={26} />
                    <span style={{ minWidth: 0 }}><span className="rt-who-n">{n.name}</span><span className="rt-who-s">{n.role === "nursing_lead" ? "Director of Nursing" : n.role === "wellness_support" ? "Wellness support" : "Nurse"}</span></span>
                  </button>
                </th>
                {days.map((d) => {
                  const items = rotaCellItems(state, n.id, d);
                  const bad = rotaConflictKeys(state, n.id, d);
                  const past = d < t;
                  return (
                    <td key={d} className={(d === t ? "today" : "") + (bad.size ? " hasbad" : "")}>
                      {items.map((it) => <Chip key={it.key} it={it} bad={bad.has(it.key)} onClick={() => onItem(it, n.id)} showWho={it.supportIds.includes(n.id) ? `Support${it.start ? `, ${it.start}` : ""}` : undefined} />)}
                      {!past ? (
                        <button type="button" className="rt-add" onClick={() => onCell(n.id, d)} aria-label={`Add for ${n.name} on ${fmtWeekdayDate(d)}`}>
                          <Icon name="plus" size={12} />{items.length ? "" : <span>Add</span>}
                        </button>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- click an assignment */

function ItemDialog({ sel, onClose }: { sel: { key: string; date: LocalDate; staffId: string | null }; onClose: () => void }) {
  const state = usePhState();
  const nav = useNav();
  const t = today(state);
  const it = rotaItemsOn(state, sel.date).find((x) => x.key === sel.key);
  const [changing, setChanging] = useState<{ from: string | null; as: "lead" | "support" } | null>(sel.staffId ? null : { from: null, as: "lead" });
  if (!it) return null;
  const nameOf = (id: string) => state.staff.find((x) => x.id === id);
  const cands = rotaCandidates(state, it);
  const conflicts = it.staffIds.flatMap((id) => rotaConflicts(state, id, it.date).filter((c) => c.keys.includes(it.key)));
  const pick = (to: string) => {
    if (!changing) return;
    const r = dispatch(changing.from ? rotaAct.swap(it.ref, it.date, changing.from, to) : rotaAct.assign(it.ref, it.date, to, changing.as));
    if (r.ok) setChanging(null);
  };
  const lead = it.leadId;
  const todayLead = it.ref.kind === "session" && it.date === t && lead;
  return (
    <Modal open onClose={onClose} title={it.title} width={560}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Close</Button>
        {todayLead ? <Button icon="eye" onClick={() => { requestNursePortalNurse(lead as never); nav.openNursePortal?.(); onClose(); }}>Nurse portal as {firstName(nameOf(lead!))}</Button> : null}
        <Button variant="primary" icon="arrow" onClick={() => { onClose(); nav.go(it.link); }}>{it.absence ? "Open in Calendar" : it.kind === "screening_day" ? "Open screening day" : "Open the record"}</Button>
      </>}>
      <div className="rt-dlg">
        <div className="rt-facts">
          <span className={`rt-dot k-${it.kind}`} />
          <span><b>{ROTA_KIND_LABEL[it.kind]}</b>, {fmtDateLong(it.date)}, {rotaTimeText(it).toLowerCase()}{it.where ? `. ${it.where}` : ""}</span>
          {it.status && !it.absence ? <Pill tone={it.status === "Draft" ? "warn" : "neutral"} icon={null}>{it.status}</Pill> : null}
        </div>
        {conflicts.length ? conflicts.map((c) => <div key={c.staffId + c.keys.join()} className="rt-alert"><Icon name="flag" size={13} /> {nameOf(c.staffId)?.name}: {c.text}.</div>) : null}
        {it.locked ? <div className="rt-note">This has already happened, so the team stays as it was.</div> : null}
        {it.absence ? (
          <div className="rt-note">{it.staffIds.map((id) => nameOf(id)?.name).join(", ")}. Leave and training are changed in the Calendar.</div>
        ) : (
          <>
            <div className="rt-k">Who is on it</div>
            <ul className="rt-people">
              {!it.staffIds.length ? <li className="rt-none"><Icon name="alert" size={13} /> Nobody yet. Choose a nurse below.</li> : null}
              {it.staffIds.map((id) => {
                const st = nameOf(id);
                return (
                  <li key={id}>
                    <Avatar name={st?.name || id} tint={st?.tint} size={24} />
                    <span className="ph-grow"><b>{st?.name || id}</b><span className="rt-who-s">{id === lead ? (it.ref.kind === "session" ? "Booked nurse" : "Nurse") : "Support"}</span></span>
                    {!it.locked ? <>
                      <Button size="sm" onClick={() => setChanging({ from: id, as: id === lead ? "lead" : "support" })}>Change</Button>
                      <Button size="sm" variant="ghost" onClick={() => dispatch(rotaAct.remove(it.ref, it.date, id))}>Remove</Button>
                    </> : null}
                  </li>
                );
              })}
            </ul>
            {!it.locked && !changing ? (
              <div className="ph-wrap">
                {!lead ? <Button size="sm" variant="primary" icon="plus" onClick={() => setChanging({ from: null, as: "lead" })}>Choose a nurse</Button> : null}
                {lead && it.ref.kind !== "oh" ? <Button size="sm" icon="plus" onClick={() => setChanging({ from: null, as: "support" })}>Add support</Button> : null}
              </div>
            ) : null}
            {changing && !it.locked ? (
              <div className="rt-pickbox">
                <div className="rt-k">{changing.from ? `Instead of ${firstName(nameOf(changing.from))}` : changing.as === "support" ? "Add as support" : "Choose the nurse"}: free nurses first</div>
                <ul className="rt-pick">
                  {cands.filter((c) => !c.on).map((c) => (
                    <li key={c.staff.id}>
                      <button type="button" disabled={!!c.busy} onClick={() => pick(c.staff.id)}>
                        <Avatar name={c.staff.name} tint={c.staff.tint} size={22} />
                        <span className="ph-grow"><b>{c.staff.name}</b><span className="rt-who-s">{c.busy || "Free"}</span></span>
                        {!c.busy ? <Pill tone="ok" icon="check">Free</Pill> : <Pill tone="neutral" icon={null}>Busy</Pill>}
                      </button>
                    </li>
                  ))}
                </ul>
                <Button size="sm" variant="ghost" onClick={() => setChanging(null)}>Cancel</Button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- click an empty cell */

function CellDialog({ staffId, date, onClose, onLeave }: { staffId: string; date: LocalDate; onClose: () => void; onLeave: () => void }) {
  const state = usePhState();
  const st = state.staff.find((x) => x.id === staffId);
  const open = rotaOpenWork(state, staffId, date);
  const mine = rotaCellItems(state, staffId, date);
  const put = (it: RotaItem, as: "lead" | "support") => { const r = dispatch(rotaAct.assign(it.ref, it.date, staffId, as)); if (r.ok) onClose(); };
  return (
    <Modal open onClose={onClose} title={`${st?.name || "Nurse"}, ${fmtWeekdayDate(date)}`} width={540}
      footer={<><Button variant="ghost" onClick={onClose}>Close</Button><Button icon="calendar" onClick={onLeave}>Add leave or training</Button></>}>
      <div className="rt-dlg">
        {mine.length ? <div className="rt-note">Already on: {mine.map((x) => `${x.title} (${rotaTimeText(x).toLowerCase()})`).join("; ")}.</div> : <div className="rt-note">Nothing booked for {firstName(st)} this day.</div>}
        <div className="rt-k">Put {firstName(st)} on</div>
        {open.length ? (
          <ul className="rt-pick">
            {open.map(({ item, busy, as }) => (
              <li key={item.key}>
                <button type="button" disabled={!!busy} onClick={() => put(item, as)}>
                  <span className={`rt-dot k-${item.kind}`} />
                  <span className="ph-grow"><b>{item.title}</b><span className="rt-who-s">{busy || `${rotaTimeText(item)}${item.where ? `, ${item.where}` : ""}`}</span></span>
                  {busy ? <Pill tone="neutral" icon={null}>Clashes</Pill> : as === "lead" ? <Pill tone="warn" icon={null}>Needs a nurse</Pill> : <Pill tone="neutral" icon={null}>As support</Pill>}
                </button>
              </li>
            ))}
          </ul>
        ) : <div className="rt-note">No screening day, flu clinic or Meddbase session that day needs anyone. Add one in Screening days, Flu or the Calendar.</div>}
      </div>
    </Modal>
  );
}

function LeaveDialog({ staffId, date, onClose }: { staffId: string; date: LocalDate; onClose: () => void }) {
  const state = usePhState();
  const st = state.staff.find((x) => x.id === staffId);
  const [kind, setKind] = useState<"leave" | "training">("leave");
  const [from, setFrom] = useState<string>(date);
  const [to, setTo] = useState<string>(date);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("13:00");
  const [title, setTitle] = useState("");
  const save = () => {
    const r = dispatch(schedAct.create(kind === "leave"
      ? { kind, date: from as LocalDate, endDate: to > from ? (to as LocalDate) : null, staffIds: [staffId as never], title: title || "Annual leave" }
      : { kind, date: from as LocalDate, start: start as never, end: end as never, staffIds: [staffId as never], title: title || "Staff training" }));
    if (r.ok) onClose();
  };
  return (
    <Modal open onClose={onClose} title={`Leave or training for ${st?.name || "nurse"}`} width={480}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" icon="check" onClick={save}>Add to the rota</Button></>}>
      <div className="rt-dlg">
        <Segmented<"leave" | "training"> label="Type" value={kind} onChange={setKind} options={[{ id: "leave", label: "Leave" }, { id: "training", label: "Training" }]} />
        <Field label="What"><TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === "leave" ? "Annual leave" : "e.g. Phlebotomy refresher"} /></Field>
        {kind === "leave" ? (
          <div className="rt-two">
            <Field label="First day"><TextInput type="date" value={from} onChange={(e) => { setFrom(e.target.value); if (to < e.target.value) setTo(e.target.value); }} /></Field>
            <Field label="Last day"><TextInput type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field>
          </div>
        ) : (
          <div className="rt-three">
            <Field label="Day"><TextInput type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label="From"><TextInput type="time" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
            <Field label="To"><TextInput type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
          </div>
        )}
        <div className="rt-note">It goes on the Calendar too. Anything {firstName(st)} is booked on in that time turns red here so you can swap the nurse.</div>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- rooms and printers */

function Resources() {
  const state = usePhState();
  const rooms = state.resources.filter((r) => r.kind === "room");
  const printers = state.resources.filter((r) => r.kind === "printer");
  return (
    <div className="clx-split-even">
      <ResourceList title="Clinic rooms" sub="Rooms used by clinic sessions. Screening days record their own room as well." items={rooms} />
      <ResourceList title="Label printers" sub="Fictional devices. Demo specimen labels only, not for laboratory use." items={printers} />
    </div>
  );
}

function ResourceList({ title, sub, items }: { title: string; sub: string; items: Resource[] }) {
  const state = usePhState();
  const nav = useNav();
  const t = today(state);
  return (
    <Card>
      <CardHeader title={title} sub={sub} right={<DemoTag>Fictional</DemoTag>} />
      <ul className="clx-list" style={{ gap: 12 }}>
        {items.map((r) => {
          const ss = state.sessions.filter((s) => s.status !== "cancelled" && (r.kind === "room" ? s.room === r.name : s.printerId === r.id)).sort(sortSessions);
          const past = ss.filter((s) => s.date < t).length;
          const todayS = ss.filter((s) => s.date === t);
          const upcoming = ss.filter((s) => s.date > t);
          const slotSet = Array.from(new Set(ss.map((s) => slotCount(s))));
          return (
            <li key={r.id} className="clx-li" style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
              <span className="clx-li-body">
                <span className="ph-row-flex" style={{ gap: 8 }}>
                  <span className="ph-grow" style={{ color: "var(--ink)" }}>{r.name}</span>
                  {todayS.length ? <Pill tone="info" icon="calendar">In use today</Pill> : ss.length ? <Pill tone="neutral" icon="clock">Not today</Pill> : <Pill tone="neutral" icon="dot">Spare</Pill>}
                </span>
                <span className="clx-li-sub">{r.location}. {ss.length ? `${plural(ss.length, "session")}: ${past} completed, ${todayS.length} today, ${upcoming.length} upcoming. ${slotSet.length ? `${slotSet.join(" or ")} slots per session.` : ""}` : "No sessions assigned."}</span>
                {todayS.map((s) => {
                  const st = sessionStats(state, s.id);
                  return (
                    <span key={s.id} className="clx-li-sub" style={{ marginTop: 3 }}>
                      Today: <button type="button" className="ph-link" style={{ fontSize: 11.5 }} onClick={() => nav.go({ page: "Clinics", tab: "schedule", params: { session: s.id, date: s.date } })}>{st.programme.code} {s.start} to {s.end}</button>, {st.booked} of {st.slots} booked
                    </span>
                  );
                })}
                {upcoming[0] ? <span className="clx-li-sub">Next: {fmtWeekdayDate(upcoming[0].date)}, {sessionStats(state, upcoming[0].id).programme.code}</span> : null}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/* ---------------------------------------------------------------- a nurse's profile */

function StaffDrawer({ staff, onClose }: { staff: Staff | undefined; onClose: () => void }) {
  const state = usePhState();
  const nav = useNav();
  const t = today(state);
  const upcoming: RotaItem[] = [];
  if (staff) for (let d = t; d <= addDays(t, 27); d = addDays(d, 1)) upcoming.push(...rotaCellItems(state, staff.id, d));
  return (
    <ClxDrawer open={!!staff} onClose={onClose} width={520} title={staff ? staff.name : "Staff"} sub={staff ? `${staff.title}. ${ROLE_LABEL[staff.role]}` : undefined}
      footer={staff ? <><Button variant="ghost" onClick={onClose}>Close</Button><Button icon="user" onClick={() => nav.go({ page: "Records", tab: "staff", params: { staff: staff.id } })}>Open in Records</Button></> : undefined}>
      {staff ? (
        <div className="ph-stack" style={{ gap: 16 }}>
          <dl className="clx-kv" style={{ margin: 0 }}>
            <div><dt>Team</dt><dd>{state.teams.find((x) => x.id === staff.team)?.name}</dd></div>
            <div><dt>In clinics</dt><dd>{clinicAccess(staff.role)}</dd></div>
            <div><dt>Email</dt><dd>{staff.email}</dd></div>
          </dl>
          <div>
            <div className="ph-eyebrow" style={{ marginBottom: 8 }}>Next four weeks ({upcoming.length})</div>
            {upcoming.length ? (
              <ul className="rt-pick">
                {upcoming.map((x) => (
                  <li key={x.key}>
                    <button type="button" onClick={() => { onClose(); nav.go(x.link); }}>
                      <span className={`rt-dot k-${x.kind}`} />
                      <span className="ph-grow"><b>{fmtWeekdayDate(x.date)}</b><span className="rt-who-s">{x.title}, {rotaTimeText(x).toLowerCase()}</span></span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : <div className="ph-faint" style={{ fontSize: 12.5 }}>Nothing booked in the next four weeks.</div>}
          </div>
          <div className="ph-faint" style={{ fontSize: 11.5 }}>Profile records live in Records, Staff: <EntityLink kind="staff" id={staff.id}>{staff.name}</EntityLink>.</div>
        </div>
      ) : null}
    </ClxDrawer>
  );
}
