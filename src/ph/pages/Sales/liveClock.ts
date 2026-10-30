/* A live clock for the first-touch countdown. The store clock is fixed for the demo, so the UI adds
   the real seconds since the countdown was first shown: the presenter sees it tick. The anchor
   resets when the store clock changes or after Reset demo (no activity since the baseline). */
import { useEffect, useState } from "react";
import type { PhState } from "../../model";
import { getState } from "../../store";

let anchor: { clock: string; real: number; dirty: boolean } | null = null;

export function liveNowMs(state: PhState): number {
  const pristine = state.activity.length === (state.counters.eventBase || 0);
  if (!anchor || anchor.clock !== state.clock.nowUtc || (pristine && anchor.dirty)) anchor = { clock: state.clock.nowUtc, real: Date.now(), dirty: false };
  if (!pristine) anchor.dirty = true;
  return Date.parse(anchor.clock) + (Date.now() - anchor.real);
}
export const liveNowIso = (state: PhState) => new Date(liveNowMs(state)).toISOString();

/** Re-renders every second while active and returns the live time in milliseconds. */
export function useLiveNow(active = true): number {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [active]);
  return liveNowMs(getState());
}
