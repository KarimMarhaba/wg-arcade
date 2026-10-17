import { describe, expect, it } from 'vitest';
import { GAME_IDS } from '../games/types';
import { planOrder } from './rounds';

const noRepeat = (xs: readonly string[]) => xs.every((x, i) => i === 0 || x !== xs[i - 1]);

describe('planOrder mit 4 Spielen', () => {
  for (const n of [3, 5, 8]) {
    it(`n=${n}: Länge, nie zwei gleiche hintereinander, alle enthalten (n ≥ 4), deterministisch (500 Seeds)`, () => {
      for (let seed = 0; seed < 500; seed++) {
        const o = planOrder(seed, n, GAME_IDS);
        expect(o).toHaveLength(n);
        expect(noRepeat(o)).toBe(true);
        for (const id of o) expect(GAME_IDS).toContain(id);
        if (n >= 4) for (const id of GAME_IDS) expect(o).toContain(id);
        expect(planOrder(seed, n, GAME_IDS)).toEqual(o);
      }
    });
  }

  it('verschiedene Seeds ergeben verschiedene Reihenfolgen', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 50; seed++) seen.add(planOrder(seed, 5, GAME_IDS).join());
    expect(seen.size).toBeGreaterThan(5);
  });
});

describe('planOrder mit wenigen Spielen', () => {
  it('2 IDs wechseln sich ab', () => {
    for (let seed = 0; seed < 200; seed++) {
      const o = planOrder(seed, 8, ['blitz', 'hammer']);
      expect(o).toHaveLength(8);
      expect(noRepeat(o)).toBe(true);
    }
  });

  it('1 ID wird wiederholt', () => {
    expect(planOrder(1, 5, ['hammer'])).toEqual(['hammer', 'hammer', 'hammer', 'hammer', 'hammer']);
  });
});
