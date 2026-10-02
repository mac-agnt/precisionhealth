/* Seeded random numbers. Every fixture is generated from these, so the demo is
   identical on every load and after Reset demo. */

export function hashSeed(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export interface Rng {
  next(): number;
  int(min: number, max: number): number; // inclusive
  pick<T>(list: readonly T[]): T;
  chance(p: number): boolean;
  shuffle<T>(list: readonly T[]): T[];
  /** Approximately normal, via the sum of uniforms. */
  normal(mean: number, sd: number): number;
  fork(label: string): Rng;
}

export function makeRng(seed: number | string): Rng {
  let a = (typeof seed === "string" ? hashSeed(seed) : seed) >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng: Rng = {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (list) => list[Math.floor(next() * list.length)],
    chance: (p) => next() < p,
    shuffle: (list) => {
      const out = list.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const t = out[i];
        out[i] = out[j];
        out[j] = t;
      }
      return out;
    },
    normal: (mean, sd) => {
      let s = 0;
      for (let i = 0; i < 6; i++) s += next();
      return mean + (s - 3) * sd * 1.4142;
    },
    fork: (label) => makeRng(hashSeed(label) ^ Math.floor(next() * 4294967296)),
  };
  return rng;
}
