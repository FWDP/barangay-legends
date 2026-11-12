// Seeded randomness (mulberry32). The engine never uses unseeded randomness: the seed lives in
// GameState, so the same seed and the same commands always give the same game.

export const DEFAULT_SEED = 0x5eed1234;

/** One step of mulberry32: returns a number in [0, 1) and the next seed. */
export function nextRandom(seed: number): [number, number] {
  const next = (seed + 0x6d2b79f5) >>> 0;
  let r = Math.imul(next ^ (next >>> 15), next | 1);
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
  return [((r ^ (r >>> 14)) >>> 0) / 4294967296, next];
}

/** A small mutable wrapper for code that rolls several times in a row. */
export class Rng {
  constructor(public seed: number) {}
  next(): number {
    const [value, seed] = nextRandom(this.seed);
    this.seed = seed;
    return value;
  }
  /** Whole number in [min, max]. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }
}
