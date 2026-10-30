/* The event card: a popover beside the event on desktop, a bottom sheet on a phone. It shows what the
   event is and its real actions, not only "Open": publish a draft screening day, send a scheduled
   email now, mark a task or meeting done, log a call on a lead, reschedule, cancel. Anything made
   with "+ Schedule" also shows who scheduled it and its history. */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { createPortal } from "react-dom";
import type { CalEvent, LocalDate } from "../../model";
import { CAL_GROUP_BY_ID, CAL_KIND_BY_ID, SCHED_EMAIL_KINDS, act, calKindColor, fmtDateLong, fmtShortDateTime, schedForCalId, schedStatusLabel, staffName } from "../../model";
import { dispatch, usePersona, usePhState } from "../../store";
import { useNav } from "../../nav-context";
import { Button, DemoTag, Icon, Pill, TextInput } from "../../ui";
import { schedAct } from "./schedActions";
import { daysAct } from "../Clinics/daysActions";
import { onbAct } from "../Sales/onbActions";
import { requestClientPortalProgramme } from "../ClientPortal/data";
import { ampm, overlayRoot, timeLabel } from "./util";
import { CompanyLink, ProgrammeLink } from "../links";

type Mode = "view" | "move" | "call" | "history";

export default function EventCard({ ev, anchor, onClose, narrow, canAct }: { ev: CalEvent; anchor: DOMRect | null; onClose: () => void; narrow: boolean; canAct: boolean }) {
  const state = usePhState();
  const nav = useNav();
  const p = usePersona();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<CSSProperties>({ visibility: "hidden" });
  const [mode, setMode] = useState<Mode>("view");
  const sched = schedForCalId(state, ev.id);
  const startTime = ev.due || (!ev.allDay && ev.time ? ev.time.start : "");
  const [mDate, setMDate] = useState<string>(ev.date);
  const [mTime, setMTime] = useState<string>(startTime);
  const [note, setNote] = useState("");
  const [nextOn, setNextOn] = useState<string>("");
  useEffect(() => { setMode("view"); setMDate(ev.date); setMTime(startTime); setNote(""); setNextOn(""); }, [ev.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    const c = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node) && !(e.target as HTMLElement).closest?.(".ph-toasts")) onClose(); };
    window.addEventListener("keydown", h, true);
    const tm = window.setTimeout(() => document.addEventListener("mousedown", c), 0);
    return () => { window.removeEventListener("keydown", h, true); document.removeEventListener("mousedown", c); window.clearTimeout(tm); };
  }, [onClose]);
  useLayoutEffect(() => {
    if (narrow) { setPos({}); return; }
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth, h = el.offsetHeight, vw = window.innerWidth, vh = window.innerHeight, m = 12;
    if (!anchor) { setPos({ left: Math.max(m, (vw - w) / 2), top: Math.max(m, (vh - h) / 2) }); return; }
    let left = anchor.right + 10;
    if (left + w > vw - m) left = anchor.left - w - 10;
    if (left < m) left = Math.min(vw - w - m, Math.max(m, anchor.left));
    let top = anchor.top;
    if (left === anchor.left || (left > anchor.left && left < anchor.right)) top = anchor.bottom + 8;
    top = Math.min(Math.max(m, top), vh - h - m);
    setPos({ left, top });
  }, [ev.id, anchor, narrow, mode]);

  const kind = CAL_KIND_BY_ID[ev.kind];
  const group = CAL_GROUP_BY_ID[kind?.group || ""];
  const c = calKindColor(ev.kind);
  const people = ev.staffIds.map((id) => state.staff.find((s) => s.id === id)).filter(Boolean);
  const go = (link: CalEvent["link"]) => { onClose(); nav.go(link); };
  const run = (a: { type: string; [k: string]: unknown }, close = false) => { const r = dispatch(a); if (r.ok && close) onClose(); return r; };
  const [prefix, rawId] = ev.id.split(":");
  const staff = canAct && !p.isParticipant;

  /* ---------- the actions this event offers ---------- */
  const acts: ReactNode[] = [];
  const add = (key: string, node: ReactNode) => acts.push(<span key={key}>{node}</span>);
  const reschedule = (label = "Reschedule") => add("move", <Button size="sm" icon="calendar" onClick={() => setMode("move")}>{label}</Button>);
  if (staff && sched && sched.status !== "cancelled") {
    const st = schedStatusLabel(state, sched);
    const email = SCHED_EMAIL_KINDS.includes(sched.kind);
    if (!st.done || (sched.kind === "leave" && sched.status === "scheduled")) {
      if (email) add("send", <Button size="sm" variant="primary" icon="send" onClick={() => run(schedAct.sendNow(sched.id))}>Send now</Button>);
      else if (sched.kind !== "leave" && sched.kind !== "training" && sched.kind !== "flu" && sched.kind !== "oh") add("done", <Button size="sm" variant="primary" icon="check" onClick={() => run(schedAct.done(sched.id))}>Mark done</Button>);
      if (ev.movable) reschedule();
      add("cancel", <Button size="sm" variant="ghost" icon="x" onClick={() => run(schedAct.cancel(sched.id), true)}>Cancel {sched.kind === "leave" ? "leave" : email ? "email" : sched.kind === "task" ? "task" : ""}</Button>);
    }
  } else if (staff) {
    if (prefix === "day") {
      const day = state.screeningDays.days.find((d) => d.id === rawId);
      if (day && day.status === "draft") add("pub", <Button size="sm" variant="primary" icon="send" onClick={() => run(daysAct.publish(day.id))}>Publish</Button>);
      if (day && day.status === "published" && nav.openClientPortal) add("cp", <Button size="sm" icon="users" onClick={() => { requestClientPortalProgramme(day.programmeId); onClose(); nav.openClientPortal?.(); }}>See in client portal</Button>);
    }
    if (prefix === "task" && !ev.done) add("done", <Button size="sm" variant="primary" icon="check" onClick={() => run(act.completeTask(rawId))}>Mark done</Button>);
    if (prefix === "lead" && !ev.done) {
      add("call", <Button size="sm" variant="primary" icon="phone" onClick={() => setMode("call")}>Log call</Button>);
    }
    if (prefix === "rebook" && !ev.done) add("send", <Button size="sm" variant="primary" icon="send" onClick={() => run(onbAct.sendRebooking(rawId))}>Send now</Button>);
    if (ev.movable && !ev.done) reschedule();
  }

  const saveMove = () => {
    const timed = sched ? sched.kind !== "leave" && !!startTime : !!startTime;
    const r = dispatch(schedAct.move(ev.id, mDate as LocalDate, timed && mTime ? mTime : undefined));
    if (r.ok) setMode("view");
  };
  const saveCall = () => {
    const r = dispatch(schedAct.leadLogCall(rawId, note, (nextOn || null) as LocalDate | null));
    if (r.ok) setMode("view");
  };

  return createPortal(
    <>
      {narrow ? <div className="ph-scrim" onClick={onClose} /> : null}
      <div ref={ref} className={"cal-pop" + (narrow ? " sheet" : "")} style={{ ...pos, "--c": c } as CSSProperties} role="dialog" aria-label={ev.title} tabIndex={-1}>
        <div className="cal-pop-top">
          <span className="ph-grow" />
          <button type="button" className="cal-iconbtn" onClick={() => go(ev.link)} aria-label={ev.openLabel} title={ev.openLabel}><Icon name="arrow" size={15} /></button>
          <button type="button" className="cal-iconbtn" onClick={onClose} aria-label="Close"><Icon name="x" size={15} /></button>
        </div>
        <div className="cal-pop-head">
          <span className="cal-pop-sq" />
          <div style={{ minWidth: 0 }}>
            <h3 className="cal-pop-title">{ev.title}</h3>
            <div className="cal-pop-when">{fmtDateLong(ev.date)}<span className="cal-pop-dot">·</span>{timeLabel(ev)}</div>
          </div>
        </div>
        <div className="cal-pop-rows">
          <div><Icon name="layers" size={15} /><span>{kind?.label}{group && group.label !== kind?.label ? <span className="ph-faint">{`, ${group.label}`}</span> : null}</span></div>
          {ev.location ? <div><Icon name="pin" size={15} /><span>{ev.location}</span></div> : null}
          {ev.client ? <div><Icon name="users" size={15} /><span><span onClick={onClose}><CompanyLink name={ev.client} /></span>{ev.programmeId ? <>, <span onClick={onClose}><ProgrammeLink id={ev.programmeId} /></span></> : null}</span></div> : null}
          {people.length ? <div><Icon name="user" size={15} /><span>{people.map((s) => s!.name).join(", ")}</span></div> : null}
          {ev.detail ? <div><Icon name="info" size={15} /><span>{ev.detail}</span></div> : null}
          {sched ? <div><Icon name="edit" size={15} /><span>Scheduled by {staffName(state, sched.createdBy)}, {fmtShortDateTime(sched.createdAt)}{sched.history.length > 1 ? <> <button type="button" className="cal-linkbtn" onClick={() => setMode(mode === "history" ? "view" : "history")}>{mode === "history" ? "Hide history" : `History (${sched.history.length})`}</button></> : null}</span></div> : null}
        </div>
        {ev.status ? <div style={{ marginTop: 10 }}><Pill tone={ev.tone || "neutral"} icon={null}>{ev.status}</Pill></div> : null}

        {mode === "history" && sched ? (
          <ol className="cal-hist">
            {sched.history.slice().reverse().map((h, i) => <li key={i}><b>{h.text}</b><span>{h.by}, {fmtShortDateTime(h.at)}</span></li>)}
          </ol>
        ) : null}
        {mode === "move" ? (
          <div className="cal-pop-form">
            <div className="cal-pop-form-h">Move to</div>
            <div className="cal-pop-form-row">
              <TextInput type="date" value={mDate} onChange={(e) => setMDate(e.target.value)} aria-label="New date" />
              {startTime && sched?.kind !== "leave" ? <TextInput type="time" step={900} value={mTime} onChange={(e) => setMTime(e.target.value)} aria-label="New time" /> : null}
            </div>
            <div className="cal-pop-form-act">
              <Button size="sm" variant="ghost" onClick={() => setMode("view")}>Back</Button>
              <Button size="sm" variant="primary" onClick={saveMove} disabled={!mDate}>Move{mTime && startTime && mTime !== startTime ? ` to ${ampm(mTime)}` : ""}</Button>
            </div>
            <div className="cal-pop-hint">Tip: you can also drag it in Week or Month view.</div>
          </div>
        ) : null}
        {mode === "call" ? (
          <div className="cal-pop-form">
            <div className="cal-pop-form-h">Log a call with {ev.client}</div>
            <TextInput value={note} onChange={(e) => setNote(e.target.value)} placeholder="What happened, in a few words" aria-label="Call note" autoFocus />
            <label className="cal-pop-lbl">Next step on (optional)<TextInput type="date" value={nextOn} onChange={(e) => setNextOn(e.target.value)} aria-label="Next step date" /></label>
            <div className="cal-pop-form-act">
              <Button size="sm" variant="ghost" onClick={() => setMode("view")}>Back</Button>
              <Button size="sm" variant="primary" onClick={saveCall} disabled={note.trim().length < 3}>Log call</Button>
            </div>
          </div>
        ) : null}

        {mode === "view" || mode === "history" ? (
          <div className="cal-pop-actions">
            {acts}
            <span className="ph-grow" />
            {ev.secondary ? <Button size="sm" variant="ghost" onClick={() => go(ev.secondary!.link)}>{ev.secondary.label}</Button> : null}
            <Button size="sm" icon="arrow" onClick={() => go(ev.link)}>{ev.openLabel}</Button>
          </div>
        ) : null}
      </div>
    </>,
    overlayRoot(),
  );
}
