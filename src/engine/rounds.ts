import type { GameId } from '../games/types';
import { mulberry32, shuffle } from './prng';

export function planOrder(seed: number, n: number, ids: readonly GameId[]): GameId[] {
  const rng = mulberry32(seed);
  const out: GameId[] = [];
  while (out.length < n) {
    const block = shuffle(rng, ids);
    const [first, second] = block;
    if (second !== undefined && first === out[out.length - 1]) [block[0], block[1]] = [second, first as GameId];
    out.push(...block);
  }
  return out.slice(0, n);
}
