/* Programmes live in state (state.programmes). The three seeded programmes are identical to the
   PROGRAMMES constant, and programmes created in Programmes (+ New programme) are added to state.

   Many older screens look a programme up with PROGRAMME_BY_ID[id] or list PROGRAMME_ORDER. Both are
   kept in step with the current state here: the reducer calls syncProgrammeRegistry after every
   action and createInitialState resets it, the same way the active reference ranges are kept in step
   (setActiveRangeVersions). New code should prefer the selectors below, which read state directly.

   Pure module: no React, no dispatch. Handlers live in src/ph/pages/Programmes/progActions.ts. */
import type { Iso, LocalDate } from "./time";
import type { PhState, Programme, ProgrammeId } from "./types";
import { PROGRAMMES, PROGRAMME_BY_ID, PROGRAMME_ORDER } from "./constants";

export type ProgrammeStatus = "draft" | "live";
export type ProgrammeMethod = "lab" | "poc";

/** What a programme created in Pulse records beyond the seeded fields. */
export interface ProgrammeSetup {
  status: ProgrammeStatus;
  /** Sales price list item id (e.g. poc3, gold1) or "lab" for the standard lab bloods screen. */
  serviceId: string;
  serviceLabel: string;
  method: ProgrammeMethod;
  /** Flu vaccination add-on agreed with the client. */
  flu: boolean;
  /** Headcount the client expects to invite. */
  headcount: number;
  hrName: string;
  hrEmail: string;
  onboardingId: string | null;
  /** Client (HR) portal record on the Portals page, when one was created for this programme. */
  portalId: string | null;
  createdAt: Iso;
  createdBy: string;
  history: Array<{ at: Iso; by: string; text: string }>;
}

export const SEEDED_PROGRAMME_IDS: ProgrammeId[] = PROGRAMMES.map((p) => p.id);
export const PROGRAMME_STATUS_LABEL: Record<ProgrammeStatus, string> = { draft: "Draft", live: "Live" };
export const PROGRAMME_METHOD_LABEL: Record<ProgrammeMethod, string> = { lab: "Lab bloods", poc: "Point of care" };

/** Keep PROGRAMME_BY_ID and PROGRAMME_ORDER equal to the programmes in the current state. */
export function syncProgrammeRegistry(list: Programme[]): void {
  const ids = new Set(list.map((p) => p.id));
  for (const k of Object.keys(PROGRAMME_BY_ID)) if (!ids.has(k)) delete (PROGRAMME_BY_ID as Record<string, Programme>)[k];
  for (const p of list) (PROGRAMME_BY_ID as Record<string, Programme>)[p.id] = p;
  const order = [...SEEDED_PROGRAMME_IDS.filter((id) => ids.has(id)), ...list.filter((p) => !SEEDED_PROGRAMME_IDS.includes(p.id)).map((p) => p.id)];
  PROGRAMME_ORDER.splice(0, PROGRAMME_ORDER.length, ...order);
}
/** Back to the seeded three, before the baseline state is built. */
export const resetProgrammeRegistry = () => syncProgrammeRegistry(PROGRAMMES);

/* ---------------------------------------------------------------- selectors (read state) */

/** Every programme in state: the seeded three first, then created ones, newest last. */
export function programmeList(s: Pick<PhState, "programmes">): Programme[] {
  const seeded = SEEDED_PROGRAMME_IDS.map((id) => s.programmes.find((p) => p.id === id)).filter((p): p is Programme => !!p);
  return [...seeded, ...s.programmes.filter((p) => !SEEDED_PROGRAMME_IDS.includes(p.id))];
}
export const programmeIdsOf = (s: Pick<PhState, "programmes">): ProgrammeId[] => programmeList(s).map((p) => p.id);
export const programmeOf = (s: Pick<PhState, "programmes">, id: string | null | undefined): Programme | undefined =>
  id ? s.programmes.find((p) => p.id === id) : undefined;
export const programmeStatus = (p: Programme): ProgrammeStatus => p.setup?.status || "live";
/** Lab or point of care: from the setup, else from the programme's appointment type. */
export const programmeMethod = (p: Programme): ProgrammeMethod => p.setup?.method || "lab";
/** Client names the screening days agent can recognise, in programme order. */
export function programmeClientNames(s: Pick<PhState, "programmes">): string[] {
  return [...new Set(programmeList(s).map((p) => p.clientName))];
}
/** "IBM, Sisk or Salesforce" for prompts. */
export function orList(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}
export const isLocalDate = (v: unknown): v is LocalDate => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + "T12:00:00Z"));
