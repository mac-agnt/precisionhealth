/* Result band colours, shared by the clinician viewer, the participant report and the nurse
   portal. They follow the clinician's current spreadsheet viewer: green normal, yellow
   borderline, orange abnormal or raised, grey not tested. Colour is never the only signal:
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
  normal: { fill: "#92D050", ink: "#16340A", label: "Normal" },
  borderline: { fill: "#FFF200", ink: "#3A3500", label: "Borderline" },
  abnormal: { fill: "#FFC000", ink: "#3D2600", label: "Outside range" },
  not_tested: { fill: "#BFBFBF", ink: "#2E2E2E", label: "Not tested" },
};

/** Softer screen variants for dense dark or glass layouts, with the same hue order. */
export const BAND_SOFT: Record<Band, { bg: string; fg: string; edge: string }> = {
  normal: { bg: "rgba(146, 208, 80, 0.22)", fg: "#9BD66A", edge: "rgba(146, 208, 80, 0.55)" },
  borderline: { bg: "rgba(255, 242, 0, 0.18)", fg: "#E9DD3A", edge: "rgba(255, 242, 0, 0.5)" },
  abnormal: { bg: "rgba(255, 192, 0, 0.22)", fg: "#FFB020", edge: "rgba(255, 192, 0, 0.6)" },
  not_tested: { bg: "rgba(191, 191, 191, 0.14)", fg: "#A6A6A6", edge: "rgba(191, 191, 191, 0.35)" },
};
