/* The single in-memory store behind every page. State is synthetic and never persisted.
   Components read with usePh(selector) and change it with dispatch(act.something()).
   PulseLogic subscribes too, so the older chat and agent views stay in step. */
import { useCallback, useSyncExternalStore } from "react";
import { act, can as canSel, createInitialState, persona, reduce } from "./model";
import type { Action, ActionResult, Perm, PhState } from "./model";

let state: PhState = createInitialState();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const getState = () => state;
export function subscribe(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

/**
 * Run an action. Failures leave the state untouched. A message, if any, is shown as a toast
 * unless silent is set (autosave, typing).
 */
export function dispatch(action: Action, opts: { silent?: boolean } = {}): ActionResult {
  const { state: next, result } = reduce(state, action);
  let s = next;
  if (result.message && !opts.silent && action.type !== "ui/toast") {
    s = reduce(s, act.toast(result.ok ? result.tone || "ok" : result.tone === "bad" ? "bad" : "warn", result.message)).state;
  }
  if (s !== state) { state = s; emit(); }
  return result;
}

/** Reset demo: restores the exact baseline, including the default persona and clock. */
export function resetDemo() {
  state = createInitialState();
  emit();
}

export const phStore = { getState, subscribe, dispatch, resetDemo };

/* ---- hooks ---- */
export function usePhState(): PhState {
  return useSyncExternalStore(subscribe, getState, getState);
}
/** Derive a value from the shared state. Selectors are memoised per state object. */
export function usePh<T>(selector: (s: PhState) => T): T {
  return selector(usePhState());
}
export function usePersona() {
  return persona(usePhState());
}
export function useCan(perm: Perm): boolean {
  return canSel(usePhState(), perm);
}
export function useDispatch() {
  return useCallback((a: Action, o?: { silent?: boolean }) => dispatch(a, o), []);
}
