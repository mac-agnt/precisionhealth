/* The phone shell (below 900px). The side rail goes away and a slim app bar takes its place:
   menu button, page title, search, Pulse and the account. The menu button slides in a drawer
   from the left holding exactly the signed-in person's rail (same order and section headings,
   Agents under Home), the account card with the Neil and Stephen switch, Settings and the
   portal shortcuts. Under the app bar the page's tabs sit in one sideways-scrolling pill row.
   Desktop never renders any of this. */
import { Fragment, useEffect, useLayoutEffect, useRef } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { act, BRAND } from "../model";
import { useNav } from "../nav-context";
import { dispatch, usePersona, usePh } from "../store";
import { Avatar, Icon } from "../ui";
import type { GlyphName } from "../ui";
import { BrandLogo } from "./Brand";
import { PersonaMenu } from "./PersonaMenu";
import { PORTAL_EXAMPLE_PERSON } from "./DemoBadge";
import { PulseGlyph, openPulse } from "./PulseAssistant";
import "./mobile.css";

type V = any; // the flat render object from PulseLogic

/** App bar plus the page's tab row. */
export function MobileTopBar({ v }: { v: V }) {
  const tabs: any[] = Array.isArray(v.contextNav) ? v.contextNav : [];
  const showTabs = v.showPillNav && tabs.length > 1;
  return (
    <header className="ph-mbar-wrap">
      <div className="ph-mbar">
        <button type="button" className="ph-mbar-btn" onClick={v.openDrawer} aria-label="Open menu" aria-expanded={!!v.drawerOpen} aria-controls="ph-mdrawer" data-mbar-menu="1">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16 M4 12h16 M4 17h10" /></svg>
        </button>
        <h1 className="ph-mbar-title">{v.pageTitle}</h1>
        <button type="button" className="ph-mbar-btn" onClick={v.openPalette} aria-label="Search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true"><path d="m21 21-4.3-4.3 M17 11a6 6 0 1 1-12 0 6 6 0 0 1 12 0" /></svg>
        </button>
        <button type="button" className="ph-mbar-btn ph-mbar-pulse" onClick={openPulse} aria-label="Ask Pulse">
          <PulseGlyph size={20} />
        </button>
        <span className="ph-mbar-persona"><PersonaMenu compact /></span>
      </div>
      {showTabs ? <MobileTabs tabs={tabs} /> : null}
    </header>
  );
}

function MobileTabs({ tabs }: { tabs: any[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const activeKey = tabs.findIndex((t) => t.active) + ":" + tabs.map((t) => t.label).join("|");
  /* Keep the active tab in view: centre it in the row without moving the page. */
  useLayoutEffect(() => {
    const row = ref.current;
    const on = row?.querySelector<HTMLElement>("[aria-current='page']");
    if (!row || !on) return;
    const target = on.offsetLeft - (row.clientWidth - on.offsetWidth) / 2;
    row.scrollTo({ left: Math.max(0, target), behavior: "auto" });
  }, [activeKey]);
  return (
    <nav className="ph-mtabs" ref={ref} aria-label="Sections of this page">
      {tabs.map((t, i) => (
        <button key={i} type="button" className={"ph-mtab" + (t.active ? " on" : "")} aria-current={t.active ? "page" : undefined} onClick={t.go}>
          {t.label}
          {t.showCount ? <span className="ph-mtab-n">{t.count}</span> : null}
        </button>
      ))}
    </nav>
  );
}

const PORTALS: Array<{ id: string; label: string; icon: GlyphName }> = [
  { id: "nurse", label: "Nurse", icon: "heart" },
  { id: "client", label: "Client (HR)", icon: "users" },
  { id: "participant", label: "Employee", icon: "user" },
  { id: "all", label: "All portals", icon: "layers" },
];

/** The sliding menu. Stays mounted so it can slide out as well as in. */
export function MobileDrawer({ v }: { v: V }) {
  const open = !!v.drawerOpen;
  const nav = useNav();
  const panel = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; dx: number; on: boolean } | null>(null);

  /* Focus moves into the drawer on open and back to the menu button on close. Escape closes. */
  useEffect(() => {
    if (!open) return;
    const back = document.activeElement as HTMLElement | null;
    /* Open at the top of the list with the current page in view. */
    const body = panel.current?.querySelector<HTMLElement>(".ph-mdrawer-body");
    const on = body?.querySelector<HTMLElement>(".ph-mdrawer-item.on");
    if (body) body.scrollTop = on ? Math.max(0, on.offsetTop - body.clientHeight + on.offsetHeight + 16) : 0;
    const t = window.setTimeout(() => panel.current?.querySelector<HTMLElement>("[data-drawer-close]")?.focus(), 20);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); v.closeDrawer(); } };
    window.addEventListener("keydown", onKey, true);
    /* Body scroll lock: the page behind does not move while the drawer is open. */
    const main = document.querySelector<HTMLElement>("[data-scroll-main]");
    const prevMain = main?.style.overflowY, prevBody = document.body.style.overflow;
    if (main) main.style.overflowY = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKey, true);
      if (main) main.style.overflowY = prevMain || "auto";
      document.body.style.overflow = prevBody;
      const menuBtn = document.querySelector<HTMLElement>("[data-mbar-menu]");
      (menuBtn || back)?.focus?.();
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Focus trap: Tab and Shift+Tab cycle inside the drawer. */
  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key !== "Tab" || !panel.current) return;
    const f = Array.from(panel.current.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])"));
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  /* Swipe left to close: the panel follows the finger, then either closes or springs back. */
  const down = (e: ReactPointerEvent) => { if (e.pointerType !== "mouse") drag.current = { x: e.clientX, y: e.clientY, dx: 0, on: false }; };
  const move = (e: ReactPointerEvent) => {
    const d = drag.current; const el = panel.current;
    if (!d || !el) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.on) { if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) d.on = true; else return; }
    d.dx = Math.min(0, dx);
    el.style.transition = "none";
    el.style.transform = `translateX(${d.dx}px)`;
  };
  const up = () => {
    const d = drag.current; const el = panel.current;
    drag.current = null;
    if (!d || !el) return;
    el.style.transition = ""; el.style.transform = "";
    if (d.on && d.dx < -70) v.closeDrawer();
  };

  const go = (fn?: () => void) => () => { v.closeDrawer(); fn?.(); };
  const openPortal = (id: string) => {
    if (id === "nurse") return nav.openNursePortal?.();
    if (id === "client") return nav.openClientPortal?.();
    if (id === "participant") return nav.openPortal(PORTAL_EXAMPLE_PERSON);
    return nav.go({ page: "Portals", tab: "all" });
  };

  return (
    <div className={"ph-mdrawer-root" + (open ? " open" : "")} aria-hidden={!open}>
      <div className="ph-mdrawer-scrim" onClick={v.closeDrawer} />
      <div id="ph-mdrawer" ref={panel} className="ph-mdrawer" role="dialog" aria-modal="true" aria-label="Menu"
        onKeyDown={onKeyDown} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <div className="ph-mdrawer-head">
          <BrandLogo height={44} />
          <button type="button" className="ph-mbar-btn" onClick={v.closeDrawer} aria-label="Close menu" data-drawer-close="1" tabIndex={open ? 0 : -1}>
            <Icon name="x" size={18} />
          </button>
        </div>
        <div className="ph-mdrawer-body">
          <nav aria-label="Main">
            {(v.drawerNav || []).map((n: any, i: number) => (
              <Fragment key={i}>
                {n.isDivider ? (n.label ? <div className="ph-mdrawer-sec">{n.label}</div> : <div className="ph-mdrawer-rule" />) : (
                  <button type="button" className={"ph-mdrawer-item" + (n.active ? " on" : "")} aria-current={n.active ? "page" : undefined} onClick={n.go} tabIndex={open ? 0 : -1}>
                    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={n.d} /></svg>
                    <span className="ph-mdrawer-label">{n.label}</span>
                    {n.dot ? <span className="ph-mdrawer-dot" aria-label="Needs attention" /> : null}
                  </button>
                )}
              </Fragment>
            ))}
            <div className="ph-mdrawer-rule" />
            <button type="button" className={"ph-mdrawer-item ph-mdrawer-settings" + (v.settingsActive ? " on" : "")} aria-current={v.settingsActive ? "page" : undefined} onClick={v.goSettingsFromDrawer} tabIndex={open ? 0 : -1}>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5.5 20v-5.5 M5.5 9.5V4 M12 20v-7.5 M12 7.5V4 M18.5 20v-4 M18.5 11V4 M3 12.5h5 M9.5 5.5h5 M16 14h5" /></svg>
              <span className="ph-mdrawer-label">Settings</span>
            </button>
          </nav>
          <div className="ph-mdrawer-sec">Portals</div>
          <div className="ph-mdrawer-portals">
            {PORTALS.map((p) => (
              <button key={p.id} type="button" className="ph-mdrawer-portal" onClick={go(() => openPortal(p.id))} tabIndex={open ? 0 : -1} aria-label={p.id === "all" ? "All portals" : `Open the ${p.label.replace(" (HR)", "").toLowerCase()} portal`}>
                <Icon name={p.icon} size={15} /> {p.label}
              </button>
            ))}
          </div>
          <div className="ph-mdrawer-demo"><span className="ph-demo-tag">{BRAND.demoLabel}</span></div>
        </div>
        <div className="ph-mdrawer-foot">
          <AccountCard tab={open ? 0 : -1} />
        </div>
      </div>
    </div>
  );
}

/** Who is signed in, with a two-way switch between the demo accounts. */
function AccountCard({ tab }: { tab: number }) {
  const p = usePersona();
  const staff = usePh((s) => s.staff).filter((s) => s.id === "neil" || s.id === "stephen");
  return (
    <div className="ph-mdrawer-account">
      <div className="ph-mdrawer-who">
        <Avatar name={p.name} tint={p.staff?.tint} size={40} />
        <span style={{ minWidth: 0, flex: 1 }}>
          <span className="ph-mdrawer-name">{p.displayName}</span>
          <span className="ph-mdrawer-role">{p.title}</span>
        </span>
      </div>
      <div className="ph-mdrawer-switch" role="radiogroup" aria-label="Signed in as">
        {staff.map((s) => (
          <button key={s.id} type="button" role="radio" aria-checked={p.id === s.id} className={p.id === s.id ? "on" : ""} tabIndex={tab}
            onClick={() => { if (p.id !== s.id) dispatch(act.setPersona(s.id)); }}>
            {s.displayName.replace(/^Dr\s+/, "").split(" ")[0]}
          </button>
        ))}
      </div>
    </div>
  );
}
