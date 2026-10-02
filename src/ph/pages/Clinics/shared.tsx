/* Shared pieces for the Clinics module: overlays that escape the page transform, status
   metadata, the slot timeline and small formatting helpers. */
import { useLayoutEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { createPortal } from "react-dom";
import type { ClinicSession, PhState, SlotView } from "../../model";
import { hhmmToMinutes, ix, sessionSlots, slotGrid } from "../../model";
import { usePhState } from "../../store";
import { Drawer, Icon, Modal, Pill } from "../../ui";
import type { GlyphName, Tone } from "../../ui";
import type { ApptStatus, ReadyItem } from "./selectors";

/* ---- overlays ----
   The kit's Drawer and Modal portal themselves to the theme root. Portal is kept for the print
   copy of the lab request, which must sit outside the page so print styles can place it. */
function themeRoot(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return (document.querySelector("[data-theme]") as HTMLElement | null) || document.body;
}
export function Portal({ children }: { children: ReactNode }) {
  const [target] = useState(themeRoot);
  return target ? createPortal(children, target) : null;
}
export const ClxDrawer = Drawer;
export const ClxModal = Modal;

/** Width of an element, kept up to date. 0 until measured. */
export function useWidth<T extends HTMLElement>(): [RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.getBoundingClientRect().width);
    const ro = new ResizeObserver((entries) => { for (const e of entries) setW(e.contentRect.width); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/* ---- status metadata: text, icon and colour together ---- */
export const APPT_META: Record<ApptStatus, { label: string; tone: Tone; icon: GlyphName; help: string }> = {
  upcoming: { label: "Booked", tone: "neutral", icon: "calendar", help: "Confirmed booking for a later day." },
  not_arrived: { label: "Not arrived", tone: "neutral", icon: "clock", help: "Confirmed booking today. Not checked in yet." },
  checked_in: { label: "Checked in", tone: "info", icon: "user", help: "Checked in. Identity not confirmed and nothing captured yet." },
  in_progress: { label: "In progress", tone: "brand", icon: "edit", help: "Clinical capture under way." },
  completed: { label: "Completed", tone: "ok", icon: "check", help: "Appointment completed. An episode exists. Completing never releases a report." },
  no_show: { label: "Did not attend", tone: "warn", icon: "alert", help: "Recorded as not attended." },
  cancelled: { label: "Cancelled", tone: "neutral", icon: "x", help: "Cancelled or rescheduled. The slot is free again." },
};
export function ApptPill({ status, rescheduled }: { status: ApptStatus; rescheduled?: boolean }) {
  const m = APPT_META[status];
  return <Pill tone={m.tone} icon={m.icon} title={m.help}>{status === "cancelled" && rescheduled ? "Rescheduled" : m.label}</Pill>;
}

export const READY_ICON: Record<ReadyItem["state"], { icon: GlyphName; fg: string; bg: string; label: string }> = {
  done: { icon: "check", fg: "var(--ok)", bg: "var(--ok-soft)", label: "Done" },
  open: { icon: "clock", fg: "var(--faint)", bg: "var(--track)", label: "Open" },
  warn: { icon: "alert", fg: "var(--warn)", bg: "var(--warn-soft)", label: "Needs attention" },
  info: { icon: "info", fg: "var(--accent)", bg: "var(--accent-soft)", label: "Information" },
};
export function StateIcon({ state }: { state: ReadyItem["state"] }) {
  const r = READY_ICON[state];
  return (
    <span className="clx-li-ico" style={{ background: r.bg, color: r.fg }} role="img" aria-label={r.label} title={r.label}>
      <Icon name={r.icon} size={12} stroke={2.2} />
    </span>
  );
}

export function ProgTag({ code }: { code: string }) {
  return <Pill tone="brand" icon={null} style={{ fontWeight: 600, letterSpacing: ".02em" }}>{code}</Pill>;
}

/* ---- slot timeline ---- */
type Seg = { kind: "slot"; v: SlotView } | { kind: "gap"; start: string; end: string; isBreak: boolean };

export function sessionSegments(state: PhState, s: ClinicSession): Seg[] {
  const grid = slotGrid(state, s.id);
  const segs: Seg[] = [];
  let cursor = hhmmToMinutes(s.start);
  const isBreak = (a: number, b: number) => s.breaks.some((x) => hhmmToMinutes(x.start) < b && a < hhmmToMinutes(x.end));
  const fmt = (n: number) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
  for (const v of grid) {
    const st = hhmmToMinutes(v.start);
    if (st > cursor) segs.push({ kind: "gap", start: fmt(cursor), end: v.start, isBreak: isBreak(cursor, st) });
    segs.push({ kind: "slot", v });
    cursor = hhmmToMinutes(v.end);
  }
  const end = hhmmToMinutes(s.end);
  if (end > cursor) segs.push({ kind: "gap", start: fmt(cursor), end: s.end, isBreak: isBreak(cursor, end) });
  return segs;
}

export function slotClass(v: SlotView): string {
  const b = v.booking;
  let c = "clx-seg-free";
  if (b) c = b.attendance === "completed" ? "clx-seg-done" : b.attendance === "checked_in" || b.attendance === "in_progress" ? "clx-seg-active" : "clx-seg-booked";
  return c + (v.isPast ? " clx-seg-past" : "");
}
export function slotText(v: SlotView): string {
  const b = v.booking;
  const who = v.person ? `${v.person.given} ${v.person.family}` : "";
  if (!b) return `${v.start} to ${v.end}: free${v.isPast ? " (time passed)" : ""}`;
  const st = b.attendance === "completed" ? "completed" : b.attendance === "checked_in" || b.attendance === "in_progress" ? "checked in" : "booked";
  return `${v.start} to ${v.end}: ${st}, ${who} (${b.id})`;
}

export function SlotTimeline({ session, onSlot, ticks = true, height = 24 }: { session: ClinicSession; onSlot?: (bookingId: string) => void; ticks?: boolean; height?: number }) {
  const state = usePhState();
  const segs = sessionSegments(state, session);
  const start = hhmmToMinutes(session.start), end = hhmmToMinutes(session.end);
  const span = Math.max(1, end - start);
  const tickTimes = [session.start, ...session.breaks.filter((b) => b.start > session.start && b.end <= session.end).map((b) => b.start), session.end];
  return (
    <div>
      <div className="clx-tl" style={{ height }} role="group" aria-label={`Slots for ${session.id}`}>
        {segs.map((g) => {
          if (g.kind === "gap") {
            const mins = hhmmToMinutes(g.end) - hhmmToMinutes(g.start);
            return <span key={"g" + g.start} className="clx-seg clx-seg-break" style={{ flexGrow: mins }} title={`${g.start} to ${g.end}: ${g.isBreak ? "break, not bookable" : "not bookable"}`} />;
          }
          const v = g.v;
          const mins = hhmmToMinutes(v.end) - hhmmToMinutes(v.start);
          const label = slotText(v);
          if (v.booking && onSlot) {
            const id = v.booking.id;
            return <button key={v.start} type="button" className={"clx-seg " + slotClass(v)} style={{ flexGrow: mins }} title={label} aria-label={label} onClick={() => onSlot(id)} />;
          }
          return <span key={v.start} className={"clx-seg " + slotClass(v)} style={{ flexGrow: mins }} title={label} />;
        })}
      </div>
      {ticks ? (
        <div className="clx-ticks" aria-hidden="true">
          {tickTimes.map((t, i) => <span key={t + i} style={{ left: `${((hhmmToMinutes(t) - start) / span) * 100}%` }}>{t}</span>)}
        </div>
      ) : null}
    </div>
  );
}

export function SlotLegend() {
  const items: Array<{ cls: string; label: string }> = [
    { cls: "clx-seg-booked", label: "Booked" },
    { cls: "clx-seg-active", label: "Checked in or in progress" },
    { cls: "clx-seg-done", label: "Completed" },
    { cls: "clx-seg-free", label: "Free" },
    { cls: "clx-seg-break", label: "Break, not bookable" },
  ];
  return (
    <div className="clx-legend">
      {items.map((i) => <span key={i.label}><span className={"clx-swatch " + i.cls} />{i.label}</span>)}
      <span><span className="clx-swatch clx-seg-free clx-seg-past" />Faded: time passed</span>
    </div>
  );
}

/** Slot count derived from a session's own day configuration. */
export const slotCount = (s: ClinicSession) => sessionSlots(s).length;
export const sessionById = (state: PhState, id: string) => ix(state).sessionById.get(id);
