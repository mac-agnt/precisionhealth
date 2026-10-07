/* Navigation for PH pages. PulseLogic owns the current page, tab and params and provides this
   context from AppShell. Pages call go({ page, tab, params }) to move, and read params to
   open a drawer or select a row. */
import { createContext, useContext } from "react";
import type { NavTarget, PageId } from "./model";

export interface PhShell {
  theme: string;
  setTheme: (id: string) => void;
  themes: Array<{ id: string; label: string; group: string; accent: string }>;
  density: "comfortable" | "compact";
  setDensity: (d: "comfortable" | "compact") => void;
  reduceMotion: boolean;
  setReduceMotion: (on: boolean) => void;
  openBackgrounds: () => void;
}

export interface PhNav {
  page: PageId;
  tab: string;
  params: Record<string, string>;
  /** Move to a page, tab and optional deep-link params. */
  go: (t: NavTarget) => void;
  /** Change tab within the current page, clearing params. */
  setTab: (tab: string) => void;
  /** Change or clear params on the current screen without changing tab. */
  setParams: (p: Record<string, string>) => void;
  openPortal: (personId?: string) => void;
  /** Nurse portal preview: clinic-day capture for the assigned nurse. */
  openNursePortal?: () => void;
  /** Client (employer) portal preview: aggregate programme view only. */
  openClientPortal?: () => void;
  /** Theme, density and accessibility controls owned by the app shell. */
  shell?: PhShell;
}

const fallback: PhNav = { page: "Home", tab: "", params: {}, go: () => {}, setTab: () => {}, setParams: () => {}, openPortal: () => {} };
export const NavContext = createContext<PhNav>(fallback);
export const useNav = () => useContext(NavContext);
