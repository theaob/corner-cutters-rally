// Seeded random numbers (mulberry32): the same seed gives the same sequence
// on every device, so anything drawn from one (a race's start-light delay and
// its rival teams) can be played again exactly. Not for security.

/** A random-number generator for `seed`: each call gives the next number in [0, 1). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A fresh seed, for a race nobody asked to repeat. */
export const newSeed = () => Math.floor(Math.random() * 4294967296) >>> 0;
