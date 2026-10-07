/* Discreet persistent label: the demo is synthetic and the clock is fixed. Beside it, quick links
   that open each portal preview on its example: a participant with a released report, the nurse
   clinic day and the employer view. */
import { BRAND, fmtDateLong, fmtTime } from "../model";
import { useNav } from "../nav-context";
import { usePersona, usePh } from "../store";
import { Icon } from "../ui";
import type { GlyphName } from "../ui";

/** The participant example opens on a released report, so My results shows the digital report. */
export const PORTAL_EXAMPLE_PERSON = "PH-P-0095";

const tag = { background: "var(--surface-strong)", backdropFilter: "blur(10px)" };

export function DemoBadge() {
  const now = usePh((s) => s.clock.nowUtc);
  const p = usePersona();
  const baseline = usePh((s) => s.clock.preset === "baseline");
  const nav = useNav();
  const links: Array<{ id: string; label: string; icon: GlyphName; open: (() => void) | undefined }> = [
    { id: "participant", label: "Participant portal", icon: "user", open: () => nav.openPortal(PORTAL_EXAMPLE_PERSON) },
    { id: "nurse", label: "Nurse portal", icon: "heart", open: nav.openNursePortal },
    { id: "client", label: "Client portal", icon: "users", open: nav.openClientPortal },
  ];
  return (
    <div aria-label="Demo status" style={{ position: "absolute", left: 20, bottom: 12, zIndex: 6, pointerEvents: "none", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", maxWidth: "calc(100% - 100px)" }}>
      <span className="ph-demo-tag" style={tag}>{BRAND.demoLabel}</span>
      <span className="ph-demo-tag" style={tag}>
        {fmtDateLong(now).replace(/^(\w{3})\w*/, "$1")} {fmtTime(now)} Dublin{baseline ? "" : " (clock moved)"}
      </span>
      {p.id !== "neil" && !p.isParticipant ? <span className="ph-demo-tag" style={{ ...tag, color: "var(--ink)" }}>Previewing {p.roleLabel}</span> : null}
      <span role="group" aria-label="Open a portal example" style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", pointerEvents: "auto" }}>
        {links.map((l) => l.open ? (
          <button key={l.id} type="button" className="ph-demo-tag ph-portal-link" onClick={l.open} title={`Open the ${l.label.toLowerCase()} example`}
            style={{ ...tag, cursor: "pointer", color: "var(--accent)", borderColor: "var(--accent-line)", gap: 5, fontSize: 11.5 }}>
            <Icon name={l.icon} size={11} /> {l.label}
          </button>
        ) : null)}
      </span>
    </div>
  );
}
