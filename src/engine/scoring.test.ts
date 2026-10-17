import { describe, expect, it } from 'vitest';
import { rank } from './scoring';

const pids = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);
const results = (vs: number[]) => new Map(vs.map((v, i) => [`p${i + 1}`, v]));
const all = (n: number) => new Set(pids(n));
const col = (r: Record<string, number>, n: number) => pids(n).map((p) => r[p]);

describe('rank', () => {
  it('Gleichstand teilt den besseren Platz: [10,10,8,7,1] -> 1,1,3,4,5 / 5,5,2,1,0', () => {
    const r = rank(results([10, 10, 8, 7, 1]), pids(5), all(5));
    expect(col(r.places, 5)).toEqual([1, 1, 3, 4, 5]);
    expect(col(r.points, 5)).toEqual([5, 5, 2, 1, 0]);
  });

  it('Offline-Spieler: letzter Platz, 0 Punkte, verdrängt niemanden', () => {
    const online = all(5);
    online.delete('p3');
    const r = rank(results([10, 10, 99, 7, 1]), pids(5), online);
    expect(col(r.places, 5)).toEqual([1, 1, 5, 3, 4]);
    expect(col(r.points, 5)).toEqual([5, 5, 0, 2, 1]);
  });

  it('ohne Ergebnis: letzter Platz, 0 Punkte, verdrängt niemanden', () => {
    const r = rank(new Map([['p1', 4], ['p2', 9]]), pids(3), all(3));
    expect(col(r.places, 3)).toEqual([2, 1, 3]);
    expect(col(r.points, 3)).toEqual([3, 5, 0]);
  });

  it('niemand mit Ergebnis: alle letzter Platz, 0 Punkte', () => {
    const r = rank(new Map(), pids(3), all(3));
    expect(col(r.places, 3)).toEqual([3, 3, 3]);
    expect(col(r.points, 3)).toEqual([0, 0, 0]);
  });

  it('ein Spieler: Platz 1, 5 Punkte', () => {
    const r = rank(results([3]), pids(1), all(1));
    expect(r.places).toEqual({ p1: 1 });
    expect(r.points).toEqual({ p1: 5 });
  });

  it('Punkte-Staffel 5,3,2,1 und danach 0', () => {
    const r = rank(results([6, 5, 4, 3, 2, 1]), pids(6), all(6));
    expect(col(r.points, 6)).toEqual([5, 3, 2, 1, 0, 0]);
  });
});
