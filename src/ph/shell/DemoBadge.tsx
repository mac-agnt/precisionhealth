/* Discreet persistent label: the demo is synthetic and the clock is fixed. */
import { BRAND, fmtDateLong, fmtTime } from "../model";
import { usePersona, usePh } from "../store";

export function DemoBadge() {
  const now = usePh((s) => s.clock.nowUtc);
  const p = usePersona();
  const baseline = usePh((s) => s.clock.preset === "baseline");
  return (
    <div aria-label="Demo status" style={{ position: "absolute", left: 20, bottom: 12, zIndex: 6, pointerEvents: "none", display: "flex", gap: 8, flexWrap: "wrap", maxWidth: "calc(100% - 100px)" }}>
      <span className="ph-demo-tag" style={{ background: "var(--surface-strong)", backdropFilter: "blur(10px)" }}>{BRAND.demoLabel}</span>
      <span className="ph-demo-tag" style={{ background: "var(--surface-strong)", backdropFilter: "blur(10px)" }}>
        {fmtDateLong(now).replace(/^(\w{3})\w*/, "$1")} {fmtTime(now)} Dublin{baseline ? "" : " (clock moved)"}
      </span>
      {p.id !== "neil" ? <span className="ph-demo-tag" style={{ background: "var(--surface-strong)", backdropFilter: "blur(10px)", color: "var(--ink)" }}>Previewing {p.roleLabel}</span> : null}
    </div>
  );
}
