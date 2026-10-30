/* Result band colours, shared by the clinician viewer, the participant report and the nurse
   portal. The hues are theme tokens in src/styles/pulse.css (--band-*): green normal, amber
   borderline, orange-red abnormal or raised, grey not tested. Colour is never the only signal:
   every use also prints the flag word or status text. */
import type { Band } from "../model";

export interface BandLook {
  /** Cell fill on paper and on screen. */
  fill: string;
  /** Text colour that stays readable on the fill. */
  ink: string;
  /** Short text label shown with the colour. */
  label: string;
}

export const BAND_LOOK: Record<Band, BandLook> = {
  normal: { fill: "var(--band-normal, #4FAE7E)", ink: "var(--band-normal-ink, #062417)", label: "Normal" },
  borderline: { fill: "var(--band-borderline, #E2A83E)", ink: "var(--band-borderline-ink, #2E1C00)", label: "Borderline" },
  abnormal: { fill: "var(--band-abnormal, #E2683F)", ink: "var(--band-abnormal-ink, #2B0C02)", label: "Outside range" },
  not_tested: { fill: "var(--band-none, #8C9693)", ink: "var(--band-none-ink, #151918)", label: "Not tested" },
};

/** Softer screen variants for dense dark or glass layouts, with the same hues. */
const soft = (v: string) => ({ bg: `color-mix(in oklab, var(${v}) 22%, transparent)`, fg: `color-mix(in oklab, var(${v}) 78%, var(--ink))`, edge: `color-mix(in oklab, var(${v}) 60%, transparent)` });
export const BAND_SOFT: Record<Band, { bg: string; fg: string; edge: string }> = {
  normal: soft("--band-normal"),
  borderline: soft("--band-borderline"),
  abnormal: soft("--band-abnormal"),
  not_tested: soft("--band-none"),
};
