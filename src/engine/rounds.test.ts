import { describe, expect, it } from 'vitest';
import { GAME_IDS } from '../games/types';
import { planOrder } from './rounds';

const noRepeat = (xs: readonly string[]) => xs.every((x, i) => i === 0 || x !== xs[i - 1]);

const poolOf = (n: number): string[] => Array.from({ length: n }, (_, i) => `g${i}`);

describe('planOrder mit dem Spielpool', () => {
  for (const n of [3, 5, 8]) {
    it(`n=${n}: Länge, nie zwei gleiche hintereinander, aus dem Pool, deterministisch (500 Seeds)`, () => {
      for (let seed = 0; seed < 500; seed++) {
        const o = planOrder(seed, n, GAME_IDS);
        expect(o).toHaveLength(n);
        expect(noRepeat(o)).toBe(true);
        for (const id of o) expect(GAME_IDS).toContain(id);
        expect(new Set(o).size).toBe(Math.min(n, GAME_IDS.length));
        if (n >= GAME_IDS.length) for (const id of GAME_IDS) expect(o).toContain(id);
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

describe('planOrder mit großen Pools (14 und 19 IDs)', () => {
  for (const size of [14, 19]) {
    const pool = poolOf(size);
    for (const n of [3, 5, 8, size - 1, size, size + 1, 2 * size + 3])
      it(`Pool ${size}, n=${n}: ${n >= size ? 'alle enthalten' : 'n verschiedene'}, keine Wiederholung hintereinander`, () => {
        for (let seed = 0; seed < 200; seed++) {
          const o = planOrder(seed, n, pool);
          expect(o).toHaveLength(n);
          expect(noRepeat(o)).toBe(true);
          for (const id of o) expect(pool).toContain(id);
          if (n >= size) for (const id of pool) expect(o).toContain(id);
          else expect(new Set(o).size).toBe(n);
          expect(planOrder(seed, n, pool)).toEqual(o);
        }
      });
  }

  it('im ersten Block kommt jede ID vor, bevor eine zweimal drankommt', () => {
    const pool = poolOf(14);
    for (let seed = 0; seed < 100; seed++) expect(new Set(planOrder(seed, 14, pool)).size).toBe(14);
  });

  it('gleiche Gewichtung: über viele Seeds ist jede ID ähnlich oft in 8 Runden', () => {
    const pool = poolOf(14);
    const counts = new Map<string, number>();
    for (let seed = 0; seed < 1400; seed++) for (const id of planOrder(seed, 8, pool)) counts.set(id, (counts.get(id) ?? 0) + 1);
    const mean = (1400 * 8) / 14;
    for (const [id, n] of counts) expect(Math.abs(n - mean), id).toBeLessThan(mean * 0.2);
    expect(counts.size).toBe(14);
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
