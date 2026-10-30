/* Neil's review of a client date request: the client's suggested days side by side with who is free
   on the nurse rota, then Approve (creates the screening days with the client's room and contact),
   Propose another date (back to the client portal) or Decline with a reason. Only Dr Neil Reddy can
   decide; anyone else sees the request and its history. */
import { useState } from "react";
import {
  DAY_SCREEN_LABEL, DR_PART_LABEL, drAddMonths, DR_STARTS, DR_STATUS_LABEL, DR_STATUS_TONE, PROGRAMME_BY_ID, drDayInfo, drHours, drNurses, drPickText, fmtDate, fmtDateTime,
  fmtWeekdayDate, monthOf, today,
} from "../../model";
import type { DateRequest, DrCounterPick, DrPart, LocalDate, StaffId } from "../../model";
import { dispatch, usePersona, usePhState } from "../../store";
import { useNav } from "../../nav-context";
import { Button, DemoTag, Field, Icon, Modal, Pill, Segmented, Select, Switch, Textarea } from "../../ui";
import { requestClientPortalProgramme } from "../ClientPortal/data";
import { MonthPicker } from "./MonthPicker";
import { drAct } from "./actions";
import "./dq.css";

type Mode = "approve" | "counter" | "decline";
const first = (n: string) => n.split(" ")[0];

export function DateRequestReview({ id, onClose }: { id: string | null | undefined; onClose: () => void }) {
  const s = usePhState();
  const r = id ? s.dateRequests.requests.find((x) => x.id === id) : undefined;
  if (!id) return null;
  if (!r) return <Modal open onClose={onClose} title="Request not found"><p className="dq-hint">This date request no longer exists.</p></Modal>;
  return <ReviewBody key={r.id + r.status} r={r} onClose={onClose} />;
}

function ReviewBody({ r, onClose }: { r: DateRequest; onClose: () => void }) {
  const s = usePhState();
  const p = usePersona();
  const nav = useNav();
  const prog = PROGRAMME_BY_ID[r.programmeId];
  const neil = !p.isParticipant && p.role === "clinical_review";
  const deciding = r.status === "suggested" || r.status === "asked";
  const [mode, setMode] = useState<Mode>(r.status === "asked" ? "counter" : "approve");
  /* Approve: the first N suggestions with a free nurse are ticked, each with the first free nurse. */
  const [ticks, setTicks] = useState<Record<string, StaffId | "">>(() => {
    const out: Record<string, StaffId | ""> = {};
    let n = 0;
    for (const x of r.picks) {
      const h = drHours(x);
      const free = drNurses(s, x.date, h.start, h.end).filter((y) => y.free);
      if (free.length && n < r.daysNeeded) { out[x.date] = free[0].staff.id; n++; }
    }
    return out;
  });
  const [publish, setPublish] = useState(true);
  const [reason, setReason] = useState("");
  /* Counter-proposal. */
  const [month, setMonth] = useState(monthOf(r.picks[0]?.date || r.from));
  const [cPicks, setCPicks] = useState<DrCounterPick[]>([]);
  const [note, setNote] = useState("");

  const chosen = Object.entries(ticks).filter(([, v]) => v !== undefined);
  const approve = () => {
    const res = dispatch(drAct.approve(r.id, chosen.map(([date, nurseId]) => ({ date, nurseId })), publish));
    if (res.ok) onClose();
  };
  const sendCounter = () => { if (dispatch(drAct.counter(r.id, cPicks, note)).ok) onClose(); };
  const decline = () => { if (dispatch(drAct.decline(r.id, reason)).ok) onClose(); };
  const toggleCounter = (d: LocalDate) => {
    setCPicks((xs) => {
      if (xs.some((x) => x.date === d)) return xs.filter((x) => x.date !== d);
      const free = drNurses(s, d, "09:00", "16:30").filter((y) => y.free);
      return [...xs, { date: d, part: "full" as DrPart, start: "09:00", nurseId: free[0]?.staff.id || ("" as StaffId) }].sort((a, b) => a.date.localeCompare(b.date));
    });
  };
  const t = today(s);
  const minMonth = monthOf(t > r.from ? t : r.from);
  const maxMonth = monthOf(r.to) > minMonth ? monthOf(r.to) : minMonth;

  const footer = !deciding || !neil ? <Button variant="ghost" onClick={onClose}>Close</Button>
    : mode === "approve" ? (
      <>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" icon="check" disabled={!chosen.length || chosen.some(([, v]) => !v)} onClick={approve}>
          {chosen.length ? `Approve ${chosen.length} ${chosen.length === 1 ? "day" : "days"}` : "Tick a day to approve"}
        </Button>
      </>
    ) : mode === "counter" ? (
      <>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" icon="send" disabled={!cPicks.length || cPicks.some((x) => !x.nurseId)} onClick={sendCounter}>Send to the client</Button>
      </>
    ) : (
      <>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="danger" icon="x" disabled={reason.trim().length < 8} onClick={decline}>Decline the request</Button>
      </>
    );

  return (
    <Modal open onClose={onClose} width={940} title={`${prog.clientName}: date request ${r.id}`} footer={footer}>
      <div className="dq-review">
        <div className="ph-wrap" style={{ gap: 8, alignItems: "center" }}>
          <Pill tone={DR_STATUS_TONE[r.status]} icon={r.status === "approved" ? "check" : r.status === "declined" ? "x" : "clock"}>{DR_STATUS_LABEL[r.status]}</Pill>
          <span className="dq-hint">Asked by {r.askedBy}, {fmtDateTime(r.askedAt)}. {r.contactName} answers in the client portal.</span>
        </div>
        <div className="dq-facts">
          <div><small>Days needed</small><b>{r.daysNeeded}</b></div>
          <div><small>Window</small><b>{fmtDate(r.from)} to {fmtDate(r.to)}</b></div>
          <div><small>Screen</small><b>{DAY_SCREEN_LABEL[r.screen]}</b></div>
          <div><small>Programme</small><b>{prog.name}</b></div>
        </div>
        {r.status !== "asked" && r.room ? (
          <div className="dq-facts">
            <div style={{ gridColumn: "span 2" }}><small>Room and location</small><b>{r.room}</b></div>
            <div><small>Contact on the day</small><b>{r.siteContactName || "Not given"}</b></div>
            <div><small>Phone</small><b>{r.siteContactPhone || "Not given"}</b></div>
          </div>
        ) : null}
        {r.notes ? <div className="dq-note"><strong style={{ color: "var(--ink)" }}>Note from {first(r.contactName)}:</strong> {r.notes}</div> : null}

        {r.status === "asked" ? <div className="dq-note">{r.contactName} has not suggested dates yet. {neil ? "You can propose dates yourself below, or wait for the client." : ""}</div> : null}

        {r.status === "suggested" ? (
          <>
            <h3 className="dq-sub">Suggested days and who is free</h3>
            <div className="dq-sugg">
              {r.picks.map((x) => {
                const h = drHours(x);
                const ns = drNurses(s, x.date, h.start, h.end);
                const on = ticks[x.date] !== undefined;
                const free = ns.filter((y) => y.free);
                const canTick = neil && mode === "approve";
                return (
                  <div key={x.date} className={`dq-sugg-card${on ? " on" : ""}${free.length ? "" : " off"}`}>
                    <label className="dq-sugg-top">
                      {canTick ? <input type="checkbox" checked={on} disabled={!free.length} aria-label={`Approve ${fmtWeekdayDate(x.date)}`}
                        onChange={() => setTicks((tk) => { const n = { ...tk }; if (on) delete n[x.date]; else n[x.date] = free[0]?.staff.id || ""; return n; })} /> : null}
                      <span><b>{fmtWeekdayDate(x.date)}</b><span>{drPickText(x)}</span></span>
                    </label>
                    <div className="ph-faint" style={{ fontSize: 11.5 }}>{free.length ? `${free.length} of ${ns.length} nurses free` : "No nurse is free at these times"}</div>
                    <ul className="dq-nurses">
                      {ns.map((n) => (
                        <li key={n.staff.id}>
                          {n.free && canTick && on ? (
                            <label className={`dq-nurse free${ticks[x.date] === n.staff.id ? " pick" : ""}`}>
                              <input type="radio" name={`nurse-${x.date}`} checked={ticks[x.date] === n.staff.id} onChange={() => setTicks((tk) => ({ ...tk, [x.date]: n.staff.id }))} />
                              {n.staff.name}
                            </label>
                          ) : (
                            <span className={`dq-nurse ${n.free ? "free" : "busy"}`} title={n.reason || "Free"}>
                              <span className="dq-dot" />{n.staff.name}{n.reason ? <span className="why">{n.reason.replace(/^\S+ is /, "").replace(/\.$/, "")}</span> : null}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </>
        ) : null}

        {r.status === "countered" && r.counter ? (
          <div className="dq-note">
            <strong style={{ color: "var(--ink)" }}>{r.counter.by} proposed:</strong> {r.counter.picks.map((x) => `${fmtWeekdayDate(x.date)} (${drPickText(x).toLowerCase()}, ${s.staff.find((n) => n.id === x.nurseId)?.name || x.nurseId})`).join("; ")}.
            {r.counter.note ? ` "${r.counter.note}"` : ""} Waiting for {r.contactName} to accept in the client portal.
          </div>
        ) : null}

        {r.status === "approved" ? (
          <div className="dq-note">
            <strong style={{ color: "var(--ink)" }}>Screening days created:</strong>{" "}
            {r.dayIds.map((d, i) => {
              const day = s.screeningDays.days.find((x) => x.id === d);
              return <span key={d}>{i ? ", " : ""}<button type="button" className="ph-link" onClick={() => { onClose(); nav.go({ page: "Clinics", tab: "days", params: { day: d } }); }}>{day ? `${fmtWeekdayDate(day.date)} (${day.status === "published" ? "published" : "draft"})` : d}</button></span>;
            })}
          </div>
        ) : null}
        {r.status === "declined" ? <div className="dq-note"><strong style={{ color: "var(--ink)" }}>Declined by {r.decidedBy}:</strong> {r.declineReason}</div> : null}

        {deciding && neil ? (
          <>
            <div className="dq-modes" role="group" aria-label="Decision">
              {r.status === "suggested" ? <Button size="sm" variant={mode === "approve" ? "primary" : "secondary"} icon="check" onClick={() => setMode("approve")}>Approve</Button> : null}
              <Button size="sm" variant={mode === "counter" ? "primary" : "secondary"} icon="calendar" onClick={() => setMode("counter")}>Propose another date</Button>
              <Button size="sm" variant={mode === "decline" ? "danger" : "secondary"} icon="x" onClick={() => setMode("decline")}>Decline</Button>
            </div>
            {mode === "approve" && r.status === "suggested" ? (
              <div className="ph-wrap" style={{ gap: 10, alignItems: "center" }}>
                <Switch on={publish} onChange={setPublish} label="Publish straight to the client portal" />
                <span className="dq-hint"><strong style={{ color: "var(--ink)" }}>{publish ? "Publish straight to the client portal." : "Save as drafts."}</strong> {publish ? "HR sees the confirmed days with the room straight away." : "They wait on Screening days until you publish them."}</span>
              </div>
            ) : null}
            {mode === "counter" ? (
              <div className="dq-counter">
                <MonthPicker month={month} setMonth={setMonth} minMonth={minMonth} maxMonth={drAddMonths(maxMonth, 1)}
                  info={(d) => drDayInfo(s, d, null)} selected={cPicks.map((x) => x.date)} onPick={toggleCounter} full={cPicks.length >= r.daysNeeded}
                  freeText={(x) => `${x.free} free`} legend={false} />
                <div className="dq-fields">
                  <p className="dq-hint">Pick up to {r.daysNeeded} {r.daysNeeded === 1 ? "date" : "dates"}. The client accepts with one click and the {r.daysNeeded === 1 ? "day is" : "days are"} created and published.</p>
                  {cPicks.length ? (
                    <ul className="dq-picked">
                      {cPicks.map((x, i) => {
                        const h = drHours(x);
                        const ns = drNurses(s, x.date, h.start, h.end).filter((y) => y.free);
                        const set = (patch: Partial<DrCounterPick>) => setCPicks((xs) => xs.map((y, j) => (j === i ? { ...y, ...patch } : y)));
                        return (
                          <li key={x.date}>
                            <div className="dq-picked-top"><b>{fmtWeekdayDate(x.date)}</b><button type="button" className="dq-x" aria-label={`Remove ${fmtWeekdayDate(x.date)}`} onClick={() => toggleCounter(x.date)}><Icon name="x" size={14} /></button></div>
                            <div className="dq-picked-row">
                              <Segmented label="Part of the day" value={x.part} onChange={(v) => set({ part: v })} options={(["full", "morning"] as DrPart[]).map((k) => ({ id: k, label: DR_PART_LABEL[k] }))} />
                              <Select aria-label="Start time" value={x.start} onChange={(e) => set({ start: e.target.value })}>{DR_STARTS.map((v) => <option key={v} value={v}>From {v.replace(/^0/, "")}</option>)}</Select>
                            </div>
                            <Select aria-label="Nurse" value={ns.some((n) => n.staff.id === x.nurseId) ? x.nurseId : ""} onChange={(e) => set({ nurseId: e.target.value as StaffId })}>
                              <option value="">{ns.length ? "Choose the nurse" : "No nurse free at these times"}</option>
                              {ns.map((n) => <option key={n.staff.id} value={n.staff.id}>{n.staff.name}</option>)}
                            </Select>
                          </li>
                        );
                      })}
                    </ul>
                  ) : <p className="dq-hint" style={{ color: "var(--ink)" }}>Tap a free day on the calendar.</p>}
                  <Field label="Message to the client (optional)" htmlFor="dq-cnote">
                    <Textarea id="dq-cnote" rows={2} value={note} placeholder="For example: The 17th is fully booked, but we can do the following Tuesday." onChange={(e) => setNote(e.target.value)} />
                  </Field>
                </div>
              </div>
            ) : null}
            {mode === "decline" ? (
              <Field label="Reason the client will see" htmlFor="dq-reason" help="Plain and kind. For example: We are fully booked in November. We will be in touch about January.">
                <Textarea id="dq-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
              </Field>
            ) : null}
          </>
        ) : null}
        {deciding && !neil ? <div className="dq-note"><Icon name="lock" size={13} style={{ verticalAlign: -2 }} /> Only Dr Neil Reddy approves client dates. {p.name} can follow the request here. Agents never approve.</div> : null}

        <div>
          <h3 className="dq-sub" style={{ marginBottom: 8 }}>History</h3>
          <ol className="dq-log">
            {r.log.slice().reverse().map((e, i) => <li key={i}><small>{fmtDateTime(e.at)} · {e.by}{e.side === "client" ? ` (${prog.clientName} HR)` : ""}</small>{e.text}</li>)}
          </ol>
        </div>
        <div className="ph-wrap" style={{ gap: 8, alignItems: "center" }}>
          <Button size="sm" variant="ghost" icon="users" onClick={() => { requestClientPortalProgramme(r.programmeId); onClose(); nav.openClientPortal?.(); }}>See it in the client portal</Button>
          <DemoTag>Simulated email</DemoTag>
        </div>
      </div>
    </Modal>
  );
}
