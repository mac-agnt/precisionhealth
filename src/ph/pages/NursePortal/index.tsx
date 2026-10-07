/* Nurse portal preview: a separate, tablet-first clinic-day app, like the participant portal
   preview. A full-viewport overlay with a device-width toggle (Desktop, Tablet 1024, Tablet 768,
   Phone 375). A demo nurse picker stands in for sign-in. While a nurse is chosen the demo acts
   as that nurse, and the previous persona comes back when the preview closes.
   Inside: My clinic today, the participant (check-in, identity, the nurse form, completion) and
   Clinic close with the specimen manifest. Every action writes to the shared store. */
import { useCallback, useEffect, useRef, useState } from "react";
import type { PersonaId, StaffId } from "../../model";
import { act, fmtWeekdayDate, ix, linkFor } from "../../model";
import { dispatch, getState, usePhState } from "../../store";
import { useNav } from "../../nav-context";
import { BrandLogo } from "../../shell/Brand";
import { Avatar, Button, DemoTag, Icon, Pill, Segmented } from "../../ui";
import { useMeasure } from "../Participants/shared";
import { AutomationReceipt } from "../Clinics/NurseForm";
import { ClinicDay } from "./ClinicDay";
import { ClinicClose } from "./ClinicClose";
import { ParticipantView } from "./Participant";
import { PORTAL_NURSES, clinicCounts, clinicRows, nextOpen, nurseSessionToday, takeRequestedNurse } from "./data";
import "./nurse.css";

export { requestNursePortalNurse } from "./data";

type DeviceId = "desktop" | "tablet1024" | "tablet768" | "phone";
const DEVICES: Array<{ id: DeviceId; label: string; width: number }> = [
  { id: "desktop", label: "Desktop", width: 0 },
  { id: "tablet1024", label: "Tablet 1024", width: 1024 },
  { id: "tablet768", label: "Tablet 768", width: 768 },
  { id: "phone", label: "Phone 375", width: 375 },
];
type View = "clinic" | "participant" | "close";

const isPortalNurse = (id: PersonaId | null | undefined): id is StaffId => !!id && (PORTAL_NURSES as string[]).includes(id);

export function NursePortalPreview({ open, onClose }: { open: boolean; onClose: () => void }) {
  const state = usePhState();
  const nav = useNav();
  const [device, setDevice] = useState<DeviceId>("tablet1024");
  const [nurseId, setNurseId] = useState<StaffId | null>(null);
  const [view, setView] = useState<View>("clinic");
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [receiptFor, setReceiptFor] = useState<string | null>(null);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [measureOverlay, overlayW] = useMeasure<HTMLDivElement>();
  const overlayEl = useRef<HTMLDivElement | null>(null);
  const stageEl = useRef<HTMLDivElement | null>(null);
  const prevPersona = useRef<PersonaId | null>(null);
  const requested = useRef<StaffId | null>(null);
  const setOverlay = useCallback((el: HTMLDivElement | null) => { overlayEl.current = el; measureOverlay(el); }, [measureOverlay]);

  /* Remember who the demo was acting as, pick up a requested or current nurse, and restore the persona on close. */
  useEffect(() => {
    if (!open) { requested.current = null; return; }
    const cur = getState().session.personaId;
    prevPersona.current = cur;
    const req = takeRequestedNurse() || requested.current;
    requested.current = req;
    const start = req && isPortalNurse(req) ? req : isPortalNurse(cur) ? cur : null;
    setNurseId(start);
    setView("clinic"); setBookingId(null); setReceiptFor(null);
    if (start && start !== cur) dispatch(act.setPersona(start), { silent: true });
    overlayEl.current?.focus();
    return () => {
      const prev = prevPersona.current;
      if (prev && getState().session.personaId !== prev) dispatch(act.setPersona(prev), { silent: true });
      prevPersona.current = null;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  if (!open) return null;

  const toTop = () => { stageEl.current?.scrollTo({ top: 0 }); };
  const pickNurse = (id: StaffId | null) => {
    setNurseId(id);
    setView("clinic"); setBookingId(null); setReceiptFor(null);
    if (id) dispatch(act.setPersona(id), { silent: true });
    else if (prevPersona.current) dispatch(act.setPersona(prevPersona.current), { silent: true });
    toTop();
  };
  const openTask = (taskId: string) => { onClose(); nav.go(linkFor("task", taskId)); };
  const deviceW = DEVICES.find((x) => x.id === device)!.width;
  const compact = !!overlayW && overlayW < 760;
  const tight = !!overlayW && overlayW < 480;
  const controlsVisible = !compact || optionsOpen;
  const nurse = nurseId ? ix(state).staffById.get(nurseId) : undefined;

  return (
    <div className="np-overlay" ref={setOverlay} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Nurse portal preview">
      <header className="np-chrome">
        <div className="np-chrome-title">
          <span style={{ width: 30, height: 30, flex: "none", borderRadius: 10, background: "var(--accent-soft)", color: "var(--accent)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="heart" size={15} /></span>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: "block", fontWeight: 600, color: "var(--ink)", fontSize: 13.5 }}>Nurse portal preview</span>
            <span className="ph-faint" style={{ display: "block", fontSize: 11 }}>{compact ? "Simulation, not authentication" : "Tablet-first clinic app. A simulation, not authentication. The demo acts as the chosen nurse while it is open."}</span>
          </span>
        </div>
        {compact ? <Button size="sm" variant="ghost" icon={optionsOpen ? "chevronDown" : "filter"} aria-expanded={optionsOpen} onClick={() => setOptionsOpen(!optionsOpen)}>Options</Button> : null}
        {compact ? <Button size="sm" variant="primary" icon="x" onClick={onClose}>Close</Button> : null}
        {controlsVisible ? (
          <div className="np-chrome-group" style={compact ? { flexBasis: "100%" } : { marginLeft: "auto" }}>
            <Segmented label="Device width" value={device} onChange={(v) => setDevice(v)} options={DEVICES.map((x) => ({ id: x.id, label: x.label }))} />
            {!compact ? <Button size="sm" variant="primary" icon="x" onClick={onClose}>Close preview</Button> : null}
          </div>
        ) : null}
      </header>
      <div className={"np-stage" + (tight ? " tight" : "")} ref={stageEl}>
        <div className={`np-device np-device-${device === "phone" ? "phone" : device === "desktop" ? "desktop" : "tablet"}`} style={deviceW ? { width: deviceW } : undefined}>
          <NurseApp nurseId={nurseId} nurseName={nurse?.name} nurseTitle={nurse?.title} nurseTint={nurse?.tint} onPick={pickNurse}
            view={view} setView={(v) => { setView(v); toTop(); }} bookingId={bookingId} setBookingId={(id) => { setBookingId(id); setView("participant"); toTop(); }}
            receiptFor={receiptFor} setReceiptFor={setReceiptFor} onOpenTask={openTask} />
        </div>
      </div>
    </div>
  );
}

type Bp = "phone" | "tablet" | "desktop";

function NurseApp({ nurseId, nurseName, nurseTitle, nurseTint, onPick, view, setView, bookingId, setBookingId, receiptFor, setReceiptFor, onOpenTask }: {
  nurseId: StaffId | null; nurseName?: string; nurseTitle?: string; nurseTint?: string; onPick: (id: StaffId | null) => void;
  view: View; setView: (v: View) => void; bookingId: string | null; setBookingId: (id: string) => void;
  receiptFor: string | null; setReceiptFor: (id: string | null) => void; onOpenTask: (taskId: string) => void;
}) {
  const state = usePhState();
  const [ref, width] = useMeasure<HTMLDivElement>();
  const bp: Bp = !width || width < 560 ? "phone" : width < 900 ? "tablet" : "desktop";
  const session = nurseId ? nurseSessionToday(state, nurseId) : null;
  const rows = session ? clinicRows(state, session) : [];
  const row = bookingId ? rows.find((r) => r.booking.id === bookingId) || null : null;
  const receiptEp = receiptFor ? ix(state).episodeById.get(ix(state).bookingById.get(receiptFor)?.episodeId || "") : undefined;
  const receipt = receiptEp && receiptFor !== bookingId ? (
    <div style={{ position: "relative" }}>
      <AutomationReceipt episode={receiptEp} onOpenTask={onOpenTask} />
      <button type="button" className="ph-btn ph-btn-ghost ph-btn-icon ph-btn-sm" style={{ position: "absolute", top: 10, right: 10 }} aria-label="Dismiss" onClick={() => setReceiptFor(null)}><Icon name="x" size={14} /></button>
    </div>
  ) : null;

  const completed = (id: string) => {
    setReceiptFor(id);
    const fresh = session ? clinicRows(getStateSafe(), session) : [];
    const nxt = nextOpen(fresh, id);
    if (nxt) setBookingId(nxt.booking.id);
    else setView("close");
  };

  return (
    <div ref={ref} className={`np-app np-bp-${bp}`} data-bp={bp}>
      <header className="np-head">
        <BrandLogo height={bp === "phone" ? 28 : 32} />
        <div style={{ minWidth: 0 }}>
          <div style={{ color: "var(--ink)", fontWeight: 600, fontSize: 14, lineHeight: 1.2 }}>Nurse portal</div>
          <div className="ph-faint np-hide-phone" style={{ fontSize: 11.5 }}>{session ? `${session.siteName}, ${fmtWeekdayDate(session.date)}` : "Clinic day"}</div>
        </div>
        {nurseId ? (
          <div className="np-head-who">
            <Avatar name={nurseName || nurseId} tint={nurseTint} size={30} />
            <span style={{ minWidth: 0, lineHeight: 1.2 }} className="np-hide-phone">
              <span style={{ display: "block", color: "var(--ink)", fontSize: 13 }}>{nurseName}</span>
              <span className="ph-faint" style={{ display: "block", fontSize: 11 }}>{nurseTitle}</span>
            </span>
            <Button size="sm" variant="ghost" onClick={() => onPick(null)}>Switch nurse</Button>
          </div>
        ) : <span style={{ marginLeft: "auto" }}><DemoTag>Preview</DemoTag></span>}
      </header>
      {!nurseId ? (
        <main className="np-main"><Picker onPick={onPick} /></main>
      ) : !session ? (
        <main className="np-main">
          <div className="np-card">
            <h1 className="np-title">No clinic today</h1>
            <p className="np-lead">{nurseName} is not assigned to a clinic on {fmtWeekdayDate(state.clock.nowUtc)}. Choose another nurse.</p>
            <div style={{ marginTop: 12 }}><Button onClick={() => onPick(null)}>Choose a nurse</Button></div>
          </div>
        </main>
      ) : (
        <>
          <nav className="np-nav" aria-label="Nurse portal sections">
            <button type="button" className="np-nav-btn" aria-current={view === "clinic" ? "page" : undefined} onClick={() => setView("clinic")}><Icon name="list" size={14} /><span>My clinic</span></button>
            <button type="button" className="np-nav-btn" aria-current={view === "participant" ? "page" : undefined} disabled={!row}
              onClick={() => row && setView("participant")}><Icon name="user" size={14} /><span>{row ? `${row.booking.slotStart} ${row.person.given} ${row.person.family}` : "Participant"}</span></button>
            <button type="button" className="np-nav-btn" aria-current={view === "close" ? "page" : undefined} onClick={() => setView("close")}><Icon name="flask" size={14} /><span>Clinic close</span></button>
            <span className="ph-grow" />
            <CountsPill sessionId={session.id} />
          </nav>
          <main className="np-main">
            {view === "participant" && row ? (
              <ParticipantView row={row} rows={rows} onSelect={setBookingId} onBack={() => setView("clinic")} onCompleted={completed} onOpenTask={onOpenTask} receipt={receipt} />
            ) : view === "close" ? (
              <ClinicClose session={session} onOpen={setBookingId} onOpenTask={onOpenTask} receipt={receipt} />
            ) : (
              <ClinicDay session={session} onOpen={setBookingId} receipt={receipt} />
            )}
          </main>
        </>
      )}
      <footer className="np-foot">
        Precision Health nurse portal preview. Fictional participants and synthetic data. Messages, the clinical channel and the courier handover are simulated. In production each nurse signs in with their own account.
      </footer>
    </div>
  );
}

/* The store snapshot right after an action, for choosing the next participant. */
const getStateSafe = () => getState();

function CountsPill({ sessionId }: { sessionId: string }) {
  const state = usePhState();
  const s = ix(state).sessionById.get(sessionId);
  if (!s) return null;
  const c = clinicCounts(state, s);
  return <Pill tone={c.completed === c.booked && c.booked ? "ok" : "neutral"} icon="check" title="Completed of booked in this clinic">{c.completed} of {c.booked} done</Pill>;
}

function Picker({ onPick }: { onPick: (id: StaffId) => void }) {
  const state = usePhState();
  return (
    <>
      <div>
        <div className="ph-eyebrow">{fmtWeekdayDate(state.clock.nowUtc)}</div>
        <h1 className="np-title" style={{ marginTop: 4 }}>Who is working today?</h1>
        <p className="np-lead">Choose the nurse to open their clinic. This demo has no sign-in; in production each nurse signs in with their own account and a second factor.</p>
      </div>
      <div className="np-pick">
        {PORTAL_NURSES.map((id) => {
          const st = ix(state).staffById.get(id);
          const s = nurseSessionToday(state, id);
          const c = s ? clinicCounts(state, s) : null;
          const programme = s ? ix(state).programmeById.get(s.programmeId) : undefined;
          return (
            <button key={id} type="button" className="np-pick-btn" disabled={!s} onClick={() => onPick(id)}>
              <span className="ph-row-flex" style={{ gap: 10 }}>
                <Avatar name={st ? st.name : id} tint={st?.tint} size={38} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", color: "var(--ink)", fontWeight: 600, fontSize: 15 }}>{st ? st.name : id}</span>
                  <span className="ph-faint" style={{ display: "block", fontSize: 11.5 }}>{st?.title}</span>
                </span>
              </span>
              {s ? (
                <span style={{ fontSize: 12.5, color: "var(--body)", lineHeight: 1.5 }}>
                  <span style={{ display: "block", color: "var(--ink)" }}>{programme ? programme.name : s.programmeId}</span>
                  <span style={{ display: "block" }}>{s.room}, {s.siteName.replace(/, Demo .*$/, "")}</span>
                  <span style={{ display: "block" }}>{s.start} to {s.end}. {c ? `${c.booked} booked, ${c.completed} done` : ""}</span>
                </span>
              ) : <span className="ph-faint" style={{ fontSize: 12.5 }}>No clinic today</span>}
              <span className="ph-row-flex" style={{ marginTop: "auto", gap: 6, color: "var(--accent)", fontSize: 12.5, fontWeight: 600 }}>Open my clinic <Icon name="arrow" size={13} /></span>
            </button>
          );
        })}
      </div>
    </>
  );
}
