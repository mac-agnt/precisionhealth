/* Sidebar account chip. Click the name to switch between the two demo accounts
   (Neil and Stephen). Uses the same persona store as the top-bar menu, so the
   name, role, navigation and visibility all follow the switch. */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { act } from "../model";
import { dispatch, usePersona, usePh } from "../store";
import { Avatar, Icon } from "../ui";

const ACCOUNT_IDS = ["neil", "stephen"];

export function SidebarAccount({ collapsed }: { collapsed?: boolean }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; bottom: number }>({ left: 0, bottom: 0 });
  const [host, setHost] = useState<HTMLElement | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const p = usePersona();
  const staff = usePh((s) => s.staff);
  const accounts = staff.filter((s) => ACCOUNT_IDS.includes(s.id));

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current && !ref.current.contains(t) && menuRef.current && !menuRef.current.contains(t)) setOpen(false);
    };
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", h);
    window.addEventListener("keydown", k);
    return () => { document.removeEventListener("mousedown", h); window.removeEventListener("keydown", k); };
  }, [open]);

  /* The rail clips overflow, so the menu is portalled to the themed app root (so CSS vars apply) and fixed above the chip. */
  const toggle = () => {
    if (!open && ref.current) {
      const r = ref.current.getBoundingClientRect();
      setHost((ref.current.closest("[data-theme]") as HTMLElement | null) || document.body);
      setPos({ left: Math.max(8, r.left), bottom: window.innerHeight - r.top + 10 });
    }
    setOpen(!open);
  };

  return (
    <div ref={ref} style={{ position: "relative", minWidth: 0 }}>
      <button type="button" onClick={toggle} aria-haspopup="menu" aria-expanded={open} title="Switch account"
        style={{ display: "flex", alignItems: "center", gap: 11, width: collapsed ? "auto" : "100%", padding: 0, border: 0, background: "none", cursor: "pointer", textAlign: "left", color: "inherit", font: "inherit" }}>
        <span style={{ width: 40, height: 40, flex: "none", borderRadius: collapsed ? 12 : 999, background: collapsed ? "var(--surface-2)" : "var(--accent-soft)", border: collapsed ? "1px solid var(--border)" : 0, color: collapsed ? "var(--body)" : "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: collapsed ? 12 : 13, fontWeight: 600 }}>
          {p.initials}
        </span>
        {!collapsed ? (
          <>
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{ display: "block", fontSize: 15, fontWeight: 600, letterSpacing: "-.2px", color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.displayName}</span>
              <span style={{ display: "block", fontSize: 12.5, color: "var(--faint)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.title}</span>
            </span>
            <Icon name="chevronDown" size={14} style={{ color: "var(--faint)", flex: "none", transform: open ? "rotate(180deg)" : undefined }} />
          </>
        ) : null}
      </button>
      {open && host ? createPortal(
        <div ref={menuRef} role="menu" className="ph-card" style={{ position: "fixed", bottom: pos.bottom, left: pos.left, width: 260, zIndex: 80, padding: 8, background: "var(--overlay)", boxShadow: "0 24px 70px rgba(0,0,0,.5)", animation: "popIn .22s var(--ease) both" }}>
          <div className="ph-eyebrow" style={{ padding: "8px 10px 6px" }}>Switch account</div>
          {accounts.map((s) => (
            <button key={s.id} type="button" role="menuitemradio" aria-checked={p.id === s.id} className="ph-row"
              onClick={() => { dispatch(act.setPersona(s.id)); setOpen(false); }}
              style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "8px 10px", border: 0, borderRadius: 10, background: p.id === s.id ? "var(--accent-faint)" : "none", cursor: "pointer", textAlign: "left", color: "inherit", font: "inherit" }}>
              <Avatar name={s.name} tint={s.tint} size={28} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 13, color: "var(--ink)" }}>{s.displayName}</span>
                <span style={{ display: "block", fontSize: 11.5, color: "var(--faint)" }}>{s.title}</span>
              </span>
              {p.id === s.id ? <Icon name="check" size={14} style={{ color: "var(--accent)" }} /> : null}
            </button>
          ))}
        </div>,
        host,
      ) : null}
    </div>
  );
}
