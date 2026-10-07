/* Who the demo is signed in as. Switching persona re-filters navigation, search, drawers,
   files, agents and exports. It is a frontend visibility simulation, not production security. */
import { useEffect, useRef, useState } from "react";
import { ROLE_LABEL, act } from "../model";
import { dispatch, usePersona, usePh } from "../store";
import { useNav } from "../nav-context";
import { Avatar, Button, Icon } from "../ui";
import type { GlyphName } from "../ui";

const PORTALS: Array<{ id: "participant" | "nurse" | "client"; title: string; sub: string; icon: GlyphName }> = [
  { id: "participant", title: "Participant portal", sub: "Book, consent, questionnaire and own released report.", icon: "user" },
  { id: "nurse", title: "Nurse portal", sub: "Clinic day: check in, nurse form, specimens, sign-off.", icon: "heart" },
  { id: "client", title: "Client portal", sub: "Employer view. Aggregate figures and approved reports only.", icon: "chart" },
];

export function PersonaMenu({ compact }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const p = usePersona();
  const staff = usePh((s) => s.staff);
  const nav = useNav();
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", h);
    window.addEventListener("keydown", k);
    return () => { document.removeEventListener("mousedown", h); window.removeEventListener("keydown", k); };
  }, [open]);
  return (
    <div ref={ref} style={{ position: "relative", flex: "none" }}>
      <button type="button" className="ph-btn ph-btn-ghost" onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open}
        style={{ height: 42, padding: "0 10px 0 6px", borderRadius: 999, gap: 9, color: "var(--ink)" }} title="Preview a role">
        <Avatar name={p.name} tint={p.staff?.tint} size={30} />
        {!compact ? (
          <span style={{ textAlign: "left", lineHeight: 1.2 }}>
            <span style={{ display: "block", fontSize: 12, fontWeight: 500, whiteSpace: "nowrap" }}>{p.displayName}</span>
            <span style={{ display: "block", fontSize: 10.5, color: "var(--faint)", whiteSpace: "nowrap" }}>{p.roleLabel}</span>
          </span>
        ) : null}
        <Icon name="chevronDown" size={13} style={{ color: "var(--faint)" }} />
      </button>
      {open ? (
        <div role="menu" className="ph-card" style={{ position: "absolute", top: 48, right: 0, width: 330, zIndex: 80, padding: 8, background: "var(--overlay)", boxShadow: "0 24px 70px rgba(0,0,0,.5)", animation: "popIn .22s var(--ease) both" }}>
          <div className="ph-eyebrow" style={{ padding: "8px 10px 6px" }}>Preview role</div>
          {staff.map((s) => (
            <button key={s.id} type="button" role="menuitemradio" aria-checked={p.id === s.id} className="ph-row"
              onClick={() => { dispatch(act.setPersona(s.id)); setOpen(false); }}
              style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "8px 10px", border: 0, borderRadius: 10, background: p.id === s.id ? "var(--accent-faint)" : "none", cursor: "pointer", textAlign: "left", color: "inherit", font: "inherit" }}>
              <Avatar name={s.name} tint={s.tint} size={26} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 12.5, color: "var(--ink)" }}>{s.displayName}</span>
                <span style={{ display: "block", fontSize: 11, color: "var(--faint)" }}>{ROLE_LABEL[s.role]}</span>
              </span>
              {p.id === s.id ? <Icon name="check" size={14} style={{ color: "var(--accent)" }} /> : null}
            </button>
          ))}
          <div style={{ borderTop: "1px solid var(--border)", margin: "8px 0 4px" }} />
          <div className="ph-eyebrow" style={{ padding: "4px 10px 4px" }}>Portals</div>
          {PORTALS.map((x) => {
            const launch = x.id === "participant" ? () => nav.openPortal() : x.id === "nurse" ? nav.openNursePortal : nav.openClientPortal;
            if (!launch) return null;
            return (
              <button key={x.id} type="button" className="ph-row" onClick={() => { setOpen(false); launch(); }}
                style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 10px", border: 0, borderRadius: 10, background: "none", cursor: "pointer", textAlign: "left", color: "inherit", font: "inherit" }}>
                <span style={{ width: 26, height: 26, borderRadius: 9, background: "var(--track)", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--dim)" }}><Icon name={x.icon} size={14} /></span>
                <span style={{ flex: 1 }}>
                  <span style={{ display: "block", fontSize: 12.5, color: "var(--ink)" }}>{x.title}</span>
                  <span style={{ display: "block", fontSize: 11, color: "var(--faint)" }}>{x.sub}</span>
                </span>
              </button>
            );
          })}
          <div className="ph-faint" style={{ fontSize: 11, lineHeight: 1.45, padding: "8px 10px 6px" }}>
            A frontend visibility simulation. It does not change authentication and is not production security.
          </div>
          <div style={{ padding: "0 8px 6px" }}><Button size="sm" variant="ghost" onClick={() => { setOpen(false); nav.go({ page: "Settings", tab: "permissions" }); }}>See the role matrix</Button></div>
        </div>
      ) : null}
    </div>
  );
}
