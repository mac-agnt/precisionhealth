import { useState } from "react";
import { BRAND } from "../model";

/** PH monogram, used if the public logo cannot load. */
export function Monogram({ size = 36 }: { size?: number }) {
  return (
    <span aria-label="Precision Health" style={{ width: size, height: size, flex: "none", borderRadius: "var(--cta-r, 11px)", background: "var(--accent-fill, var(--accent))", color: "var(--on-accent)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: Math.round(size * 0.36), fontWeight: 700, letterSpacing: "-.5px" }}>PH</span>
  );
}

/** The public Precision Health logo on a light plate so the dark wordmark stays legible. Proportions are kept. */
export function BrandLogo({ height = 38 }: { height?: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <Monogram size={height} />;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", height, padding: "0 9px", borderRadius: 12, background: "#f3f5f4", flex: "none" }}>
      <img src={BRAND.logoPath} alt="Precision Health" height={height - 8} style={{ height: height - 8, width: "auto", display: "block" }} onError={() => setFailed(true)} />
    </span>
  );
}
