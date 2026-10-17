import { mulberry32, shuffle } from './prng';

export function planOrder<T extends string>(seed: number, n: number, ids: readonly T[]): T[] {
  const rng = mulberry32(seed);
  const out: T[] = [];
  while (out.length < n) {
    const block = shuffle(rng, ids);
    const [first, second] = block;
    if (second !== undefined && first === out[out.length - 1]) [block[0], block[1]] = [second, first as T];
    out.push(...block);
  }
  return out.slice(0, n);
}
