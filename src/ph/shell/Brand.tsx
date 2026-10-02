import { useState } from "react";
import { BRAND } from "../model";

/** PH monogram, used if the public logo cannot load. */
export function Monogram({ size = 36 }: { size?: number }) {
  return (
    <span aria-label="Precision Health" style={{ width: size, height: size, flex: "none", borderRadius: "var(--cta-r, 11px)", background: "var(--accent-fill, var(--accent))", color: "var(--on-accent)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: Math.round(size * 0.36), fontWeight: 700, letterSpacing: "-.5px" }}>PH</span>
  );
}

/** The public Precision Health logo on a transparent background: a light-wordmark copy for dark themes and the
    original colours for light themes. Proportions are kept; nothing is redrawn. */
export function BrandLogo({ height = 38 }: { height?: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <Monogram size={height} />;
  const img = (src: string, cls: string) => (
    <img className={cls} src={src} alt="Precision Health" height={height} style={{ height, width: "auto", display: "block" }} onError={() => setFailed(true)} />
  );
  return (
    <span style={{ display: "inline-flex", alignItems: "center", height, flex: "none" }}>
      {img(BRAND.logoDarkPath, "ph-logo-for-dark")}
      {img(BRAND.logoLightPath, "ph-logo-for-light")}
    </span>
  );
}
