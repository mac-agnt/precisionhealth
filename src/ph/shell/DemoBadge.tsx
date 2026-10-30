/* The footer bar at the bottom of the main panel. It is part of the layout flow (not floating), so
   it never covers the last thing on a page. It carries a discreet "synthetic data" label, the
   fixed demo clock and quick links that open each portal preview on its example: a participant
   with a released report, the nurse clinic day and the employer view. Below 700px it folds into
   one compact Portals button with a small menu. */
import { useEffect, useRef, useState } from "react";
import { BRAND, fmtDateLong, fmtTime } from "../model";
import { useNav } from "../nav-context";
import { usePh } from "../store";
import { Icon } from "../ui";
import type { GlyphName } from "../ui";

/** The participant example opens on a released report, so My results shows the digital report. */
export const PORTAL_EXAMPLE_PERSON = "PH-P-0095";

/** Height of the footer bar, so floating furniture can line up with it. */
export const FOOTBAR_H = 48;

function useNarrow(max = 700) {
  const q = `(max-width: ${max - 0.02}px)`;
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setNarrow(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [q]);
  return narrow;
}

export function DemoBadge() {
  const now = usePh((s) => s.clock.nowUtc);
  const baseline = usePh((s) => s.clock.preset === "baseline");
  const nav = useNav();
  const narrow = useNarrow();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", h);
    window.addEventListener("keydown", k);
    return () => { document.removeEventListener("mousedown", h); window.removeEventListener("keydown", k); };
  }, [open]);
  useEffect(() => { if (!narrow) setOpen(false); }, [narrow]);

  const links: Array<{ id: string; label: string; sub: string; icon: GlyphName; open: (() => void) | undefined }> = [
    { id: "participant", label: "Participant portal", sub: "Booking, questionnaire and own report", icon: "user", open: () => nav.openPortal(PORTAL_EXAMPLE_PERSON) },
    { id: "nurse", label: "Nurse portal", sub: "The clinic day on a tablet", icon: "heart", open: nav.openNursePortal },
    { id: "client", label: "Client portal", sub: "The employer's view", icon: "users", open: nav.openClientPortal },
  ];
  const clock = `${fmtDateLong(now).replace(/^(\w{3})\w*/, "$1")} ${fmtTime(now)} Dublin${baseline ? "" : " (clock moved)"}`;

  return (
    <footer aria-label="Demo status and portals" className="ph-footbar" style={{ height: FOOTBAR_H }}>
      <span className="ph-demo-tag">{narrow ? "Demo" : BRAND.demoLabel}</span>
      {!narrow ? <span className="ph-demo-tag">{clock}</span> : null}
      {narrow ? (
        <div ref={ref} style={{ position: "relative" }}>
          <button type="button" className="ph-demo-tag ph-portal-link" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
            <Icon name="users" size={11} /> Portals <Icon name="chevronDown" size={10} style={{ transform: open ? "rotate(180deg)" : undefined }} />
          </button>
          {open ? (
            <div role="menu" className="ph-card ph-footbar-menu">
              {links.map((l) => l.open ? (
                <button key={l.id} type="button" role="menuitem" className="ph-row" onClick={() => { setOpen(false); l.open!(); }}>
                  <span className="ph-footbar-ic"><Icon name={l.icon} size={13} /></span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 12.5, color: "var(--ink)" }}>{l.label}</span>
                    <span style={{ display: "block", fontSize: 11, color: "var(--faint)" }}>{l.sub}</span>
                  </span>
                </button>
              ) : null)}
            </div>
          ) : null}
        </div>
      ) : (
        <span role="group" aria-label="Open a portal example" style={{ display: "inline-flex", gap: 6, flexWrap: "nowrap" }}>
          {links.map((l) => l.open ? (
            <button key={l.id} type="button" className="ph-demo-tag ph-portal-link" onClick={l.open} title={`Open the ${l.label.toLowerCase()} example`}>
              <Icon name={l.icon} size={11} /> {l.label}
            </button>
          ) : null)}
        </span>
      )}
    </footer>
  );
}
