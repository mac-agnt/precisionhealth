/* Participant portal preview: a separate responsive preview, not a thirteenth staff module and
   not new authentication. A full-viewport overlay with a device-width toggle (Desktop,
   Tablet 768, Phone 375), a scenario switcher and a presenter-only panel of live staff-side
   counts. The shell sets the persona to participant while it is open. */
import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { act, ix, personName, programmeCounts, reminderStats, sessionStats, todaySessions, todayStats, totalCounts } from "../../model";
import type { PhState } from "../../model";
import { dispatch, usePhState } from "../../store";
import { Button, Card, CardHeader, Chip, Icon, Segmented, TextInput } from "../../ui";
import { useMeasure } from "../Participants/shared";
import { normalisePersonId, portalData } from "./data";
import type { PortalView, ReportDelivery } from "./data";
import { PortalApp } from "./PortalApp";
import "./portal.css";

type DeviceId = "desktop" | "tablet" | "phone";
const DEVICES: Array<{ id: DeviceId; label: string; width: number }> = [
  { id: "desktop", label: "Desktop", width: 0 },
  { id: "tablet", label: "Tablet 768", width: 768 },
  { id: "phone", label: "Phone 375", width: 375 },
];

export default function PortalPreview({ open, onClose }: { open: boolean; onClose: () => void }) {
  const state = usePhState();
  const personId = state.session.portalPersonId;
  const [device, setDevice] = useState<DeviceId>("phone");
  const [signed, setSigned] = useState<Record<string, boolean>>({});
  const [views, setViews] = useState<Record<string, PortalView>>({});
  // Report delivery choice per participant. Local to the preview: the model has no field for it yet.
  const [delivery, setDeliveryMap] = useState<Record<string, ReportDelivery>>({});
  const [countsPref, setCountsPref] = useState<boolean | null>(null);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [idText, setIdText] = useState("");
  const [idErr, setIdErr] = useState<string | null>(null);
  const [measureOverlay, overlayW] = useMeasure<HTMLDivElement>();
  const overlayEl = useRef<HTMLDivElement | null>(null);
  const stageEl = useRef<HTMLDivElement | null>(null);
  const setOverlay = useCallback((el: HTMLDivElement | null) => { overlayEl.current = el; measureOverlay(el); }, [measureOverlay]);

  useEffect(() => { if (open) overlayEl.current?.focus(); }, [open]);
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

  const d = portalData(state, personId);
  const signedIn = signed[personId] ?? d?.membership?.stage === "booked";
  const view = views[personId] || "overview";
  const toTop = () => { stageEl.current?.scrollTo({ top: 0 }); };
  const setView = (v: PortalView) => { setViews((x) => ({ ...x, [personId]: v })); toTop(); };
  const switchTo = (id: string) => {
    const r = dispatch(act.setPortalPerson(id), { silent: true });
    if (!r.ok) { setIdErr(`No synthetic participant has the ID ${id}.`); return false; }
    setIdErr(null);
    toTop();
    return true;
  };
  const submitId = (e: FormEvent) => {
    e.preventDefault();
    const id = normalisePersonId(idText);
    if (!id) { setIdErr("Enter a person ID such as PH-P-0803."); return; }
    if (switchTo(id)) setIdText("");
  };

  const amended = state.reportVersions.find((v) => v.status === "superseded");
  const amendedPerson = amended ? ix(state).episodeById.get(amended.episodeId)?.personId : undefined;
  const scenarios = [
    { id: "PH-P-0801", hint: "onboarding" },
    { id: "PH-P-0001", hint: "report release" },
    ...(amendedPerson ? [{ id: amendedPerson, hint: "amended report" }] : []),
  ];
  const deviceW = DEVICES.find((x) => x.id === device)!.width;
  const compact = !!overlayW && overlayW < 760;
  const tight = !!overlayW && overlayW < 480;
  const sideFits = !!overlayW && overlayW >= (device === "desktop" ? 1000 : deviceW + 290 + 18 + 40);
  const controlsVisible = !compact || optionsOpen;
  // The presenter panel shows by default when there is room beside the frame, and on request otherwise.
  const showCounts = countsPref ?? !compact;

  return (
    <div className="pp-overlay" ref={setOverlay} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Participant portal preview">
      <header className="pp-chrome">
        <div className="pp-chrome-title">
          <span style={{ width: 30, height: 30, flex: "none", borderRadius: 10, background: "var(--accent-soft)", color: "var(--accent)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="user" size={15} /></span>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: "block", fontWeight: 600, color: "var(--ink)", fontSize: 13.5 }}>Participant portal preview</span>
            <span className="ph-faint" style={{ display: "block", fontSize: 11 }}>{compact ? "Simulation, not authentication" : "Separate responsive preview. A simulation, not authentication. The demo acts as the participant while it is open."}</span>
          </span>
        </div>
        {compact ? <Button size="sm" variant="ghost" icon={optionsOpen ? "chevronDown" : "filter"} aria-expanded={optionsOpen} onClick={() => setOptionsOpen(!optionsOpen)}>Options</Button> : null}
        {compact ? <Button size="sm" variant="primary" icon="x" onClick={onClose}>Close</Button> : null}
        {controlsVisible ? (
          <>
            <div className="pp-chrome-group" role="group" aria-label="Scenario" style={compact ? { flexBasis: "100%" } : undefined}>
              <span className="ph-faint" style={{ fontSize: 11 }}>Scenario</span>
              {scenarios.map((s) => (
                <Chip key={s.id} on={personId === s.id} onClick={() => switchTo(s.id)}>
                  {personName(ix(state).personById.get(s.id))}<span className="ph-faint" style={{ fontSize: 11 }}>{s.hint}</span>
                </Chip>
              ))}
              <form onSubmit={submitId} className="pp-chrome-group" style={{ gap: 6 }}>
                <TextInput className="pp-id-input" value={idText} onChange={(e) => { setIdText(e.target.value); setIdErr(null); }} placeholder="Other ID, e.g. 0803" aria-label="Open another invitee by person ID" style={{ width: 150 }} />
                <Button size="sm" type="submit">Open</Button>
              </form>
            </div>
            <div className="pp-chrome-group" style={compact ? { flexBasis: "100%" } : { marginLeft: "auto" }}>
              <Segmented label="Device width" value={device} onChange={(v) => setDevice(v)} options={DEVICES.map((x) => ({ id: x.id, label: x.label }))} />
              <Chip on={showCounts} onClick={() => setCountsPref(!showCounts)}>Staff counts</Chip>
              {!compact ? <Button size="sm" variant="primary" icon="x" onClick={onClose}>Close preview</Button> : null}
            </div>
          </>
        ) : null}
        {idErr ? <div className="ph-err" role="alert" style={{ flexBasis: "100%", marginTop: 0 }}>{idErr}</div> : null}
      </header>
      <div className={"pp-stage" + (tight ? " tight" : "")} ref={stageEl}>
        <div className={"pp-stage-row" + (sideFits ? "" : " stacked")}>
          <div className={`pp-device pp-device-${device}`} style={deviceW ? { width: deviceW } : undefined}>
            <PortalApp
              key={personId}
              personId={personId}
              signedIn={signedIn}
              onSignIn={() => setSigned((x) => ({ ...x, [personId]: true }))}
              onSignOut={() => { setSigned((x) => ({ ...x, [personId]: false })); setViews((x) => ({ ...x, [personId]: "overview" })); toTop(); }}
              view={view}
              setView={setView}
              delivery={delivery[personId] || "portal"}
              setDelivery={(v) => setDeliveryMap((x) => ({ ...x, [personId]: v }))}
            />
          </div>
          {showCounts ? <div className="pp-side"><StaffCounts state={state} personId={personId} /></div> : null}
        </div>
      </div>
    </div>
  );
}

/** Presenter-only panel. Live counts from the shared selectors, so the effect of a booking is visible at once. */
function StaffCounts({ state, personId }: { state: PhState; personId: string }) {
  const d = portalData(state, personId);
  if (!d) return null;
  const code = d.programme.clientName;
  const pc = programmeCounts(state, d.programme.id);
  const tc = totalCounts(state);
  const ts = todayStats(state);
  const sess = todaySessions(state).find((s) => s.programmeId === d.programme.id);
  const ss = sess ? sessionStats(state, sess.id) : null;
  const rs = reminderStats(state);
  const rows: Array<[string, string]> = [
    [`${code} programme booked`, `${pc.booked} of ${pc.capacity}`],
    ["All programmes booked", `${tc.booked} of ${tc.capacity}`],
    ...(ss ? [[`Today, ${code} clinic`, `${ss.booked} of ${ss.slots}, ${ss.available} free`] as [string, string]] : []),
    ["Today, all clinics", `${ts.booked} of ${ts.capacity}, ${ts.available} free`],
    ["Questionnaires in progress", `${tc.drafts} (not bookings)`],
    ["Today's logical reminders", `${rs.logical}: ${rs.delivered} delivered, ${rs.failed} failed`],
    ["Screening episodes", `${tc.episodes}`],
  ];
  return (
    <Card>
      <CardHeader title="Staff-side counts" sub="Presenter view, live from the shared store. Participants never see this panel." />
      {rows.map(([k, v]) => (
        <div key={k} className="pp-count"><span className="pp-count-label">{k}</span><span className="pp-count-value">{v}</span></div>
      ))}
    </Card>
  );
}
