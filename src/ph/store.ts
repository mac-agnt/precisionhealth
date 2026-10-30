/* The single store behind every page. Components read with usePh(selector) and change it with
   dispatch(act.something()). PulseLogic subscribes too, so the older chat and agent views stay in step.

   Work is kept between visits: every successful action is appended to a log in this browser's
   localStorage and replayed over the seed data on load, so what Neil enters, approves or releases
   is still there after a refresh. The log is tied to a fingerprint of the seed data, so a release
   that changes the seed starts clean. "Start fresh" (resetDemo) clears it. */
import { useCallback, useSyncExternalStore } from "react";
import { act, can as canSel, createInitialState, persona, reduce } from "./model";
import type { Action, ActionResult, Perm, PhState } from "./model";

const LOG_KEY = "pulse-ph-actions";
const NO_LOG = new Set(["ui/toast", "ui/dismissToast"]);
let log: Action[] = [];
let fingerprint = "";

function storage(): Storage | null {
  try { return typeof window !== "undefined" && window.localStorage ? window.localStorage : null; } catch { return null; }
}
function boot(): PhState {
  let s = createInitialState();
  try {
    fingerprint = `${Object.keys(s).join(",")}:${s.persons.length}:${s.episodes.length}:${s.observations.length}:${s.sessions.length}:${s.programmes.length}`;
    const raw = storage()?.getItem(LOG_KEY);
    if (!raw) return s;
    const saved = JSON.parse(raw) as { fp: string; actions: Action[] };
    if (saved.fp !== fingerprint || !Array.isArray(saved.actions)) { storage()?.removeItem(LOG_KEY); return s; }
    for (const a of saved.actions) {
      const r = reduce(s, a);
      if (r.result.ok !== false) { s = r.state; log.push(a); }
    }
    s = { ...s, toasts: [] };
  } catch {
    log = [];
    s = createInitialState();
  }
  return s;
}
let saveTimer: ReturnType<typeof setTimeout> | null = null;
function save() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { storage()?.setItem(LOG_KEY, JSON.stringify({ fp: fingerprint, actions: log })); } catch { /* storage full or blocked: keep working in memory */ }
  }, 300);
}

let state: PhState = boot();
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
  if (result.ok !== false && next !== state && !NO_LOG.has(action.type)) { log.push(action); save(); }
  let s = next;
  if (result.message && !opts.silent && action.type !== "ui/toast") {
    s = reduce(s, act.toast(result.ok ? result.tone || "ok" : result.tone === "bad" ? "bad" : "warn", result.message)).state;
  }
  if (s !== state) { state = s; emit(); }
  return result;
}

/** Reset demo: restores the exact baseline, including the default persona and clock. */
export function resetDemo() {
  log = [];
  try { storage()?.removeItem(LOG_KEY); } catch { /* ignore */ }
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
