export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function mix32(a: number, b: number): number {
  let h = (a ^ Math.imul(b + 0x9e3779b9, 0x85ebca6b)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

export function int(r: Rng, min: number, maxIncl: number): number {
  return min + Math.floor(r() * (maxIncl - min + 1));
}

export function pick<T>(r: Rng, xs: readonly T[]): T {
  if (xs.length === 0) throw new Error('pick: leere Liste');
  return xs[int(r, 0, xs.length - 1)] as T;
}

export function shuffle<T>(r: Rng, xs: readonly T[]): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = int(r, 0, i);
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

export function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] as number;
}
