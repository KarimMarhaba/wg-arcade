import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../engine/prng';
import {
  allDone,
  clampInt,
  due,
  enter,
  isInt,
  isRecord,
  isStr,
  leaders,
  pickDistinct,
  ringNext,
  tally,
  turnOrder,
  type Phased,
} from './common';

const pids = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);

describe('allDone, isRecord, isInt (unverändert)', () => {
  it('allDone verlangt mindestens einen Online-Spieler und dass alle Online-Spieler fertig sind', () => {
    const on = new Set(['a', 'b']);
    expect(allDone(['a', 'b', 'c'], on, (p) => p === 'a')).toBe(false);
    expect(allDone(['a', 'b', 'c'], on, () => true)).toBe(true);
    expect(allDone(['a'], new Set(), () => true)).toBe(false);
  });

  it('isRecord und isInt', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord([])).toBe(false);
    expect(isRecord(null)).toBe(false);
    expect(isInt(3)).toBe(true);
    expect(isInt(3.5)).toBe(false);
    expect(isInt('3')).toBe(false);
  });
});

describe('turnOrder', () => {
  it('ist eine Permutation und ändert die Eingabe nicht', () => {
    const input = pids(6);
    const out = turnOrder(5, input);
    expect([...out].sort()).toEqual([...input].sort());
    expect(input).toEqual(pids(6));
  });

  it('ist je Seed deterministisch und hängt vom Seed ab', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 40; seed++) {
      expect(turnOrder(seed, pids(8))).toEqual(turnOrder(seed, pids(8)));
      seen.add(turnOrder(seed, pids(8)).join());
    }
    expect(seen.size).toBeGreaterThan(20);
  });

  it('Randfälle: leer und ein Spieler', () => {
    expect(turnOrder(1, [])).toEqual([]);
    expect(turnOrder(1, ['a'])).toEqual(['a']);
  });
});

describe('ringNext', () => {
  const order = ['a', 'b', 'c'];

  it('geht reihum und schließt den Ring', () => {
    expect(ringNext(order, 'a')).toBe('b');
    expect(ringNext(order, 'b')).toBe('c');
    expect(ringNext(order, 'c')).toBe('a');
  });

  it('ein Einzelner ist sein eigener Nachbar, zwei sind gegenseitig Nachbarn', () => {
    expect(ringNext(['a'], 'a')).toBe('a');
    expect(ringNext(['a', 'b'], 'a')).toBe('b');
    expect(ringNext(['a', 'b'], 'b')).toBe('a');
  });

  it('eine unbekannte pid oder ein leerer Ring liefert undefined und wirft nicht', () => {
    expect(ringNext(order, 'zz')).toBeUndefined();
    expect(ringNext([], 'a')).toBeUndefined();
  });
});

describe('pickDistinct', () => {
  const xs = Array.from({ length: 20 }, (_, i) => i);

  it('liefert k verschiedene Elemente aus xs ohne die Eingabe zu ändern', () => {
    const copy = [...xs];
    const out = pickDistinct(mulberry32(3), xs, 7);
    expect(out).toHaveLength(7);
    expect(new Set(out).size).toBe(7);
    for (const x of out) expect(xs).toContain(x);
    expect(xs).toEqual(copy);
  });

  it('ist je Seed deterministisch', () => {
    expect(pickDistinct(mulberry32(9), xs, 5)).toEqual(pickDistinct(mulberry32(9), xs, 5));
    const seen = new Set<string>();
    for (let seed = 0; seed < 30; seed++) seen.add(pickDistinct(mulberry32(seed), xs, 5).join());
    expect(seen.size).toBeGreaterThan(15);
  });

  it('k größer als die Länge wirft nicht und liefert alle; k=0, negativ, NaN, Bruch', () => {
    expect([...pickDistinct(mulberry32(1), [1, 2, 3], 10)].sort()).toEqual([1, 2, 3]);
    expect(pickDistinct(mulberry32(1), xs, 0)).toEqual([]);
    expect(pickDistinct(mulberry32(1), xs, -2)).toEqual([]);
    expect(pickDistinct(mulberry32(1), xs, Number.NaN)).toEqual([]);
    expect(pickDistinct(mulberry32(1), xs, 2.9)).toHaveLength(2);
    expect(pickDistinct(mulberry32(1), [], 3)).toEqual([]);
  });
});

describe('tally und leaders', () => {
  it('tally zählt die Werte, nicht die Schlüssel', () => {
    const t = tally({ a: 'x', b: 'y', c: 'x' });
    expect(t.get('x')).toBe(2);
    expect(t.get('y')).toBe(1);
    expect(t.size).toBe(2);
    expect(tally({}).size).toBe(0);
  });

  it('leaders liefert alle Spitzenreiter', () => {
    expect(leaders(tally({ a: 'x', b: 'y', c: 'x' }))).toEqual(['x']);
    expect([...leaders(tally({ a: 'x', b: 'y', c: 'z' }))].sort()).toEqual(['x', 'y', 'z']);
    expect([...leaders(tally({ a: 'x', b: 'y', c: 'x', d: 'y', e: 'z' }))].sort()).toEqual(['x', 'y']);
  });

  it('leere Stimmen ergeben keine Leader', () => {
    expect(leaders(tally({}))).toEqual([]);
    expect(leaders(new Map())).toEqual([]);
  });

  it('Einträge mit 0 Stimmen führen nie', () => {
    expect(leaders(new Map([['x', 0], ['y', 0]]))).toEqual([]);
    expect(leaders(new Map([['x', 0], ['y', 2]]))).toEqual(['y']);
  });
});

describe('Phased: enter und due', () => {
  type P = 'a' | 'b';
  const s0: Phased<P> & { extra: number } = { phase: 'a', endsAt: 100, dur: 50, extra: 7 };

  it('enter setzt Phase, endsAt = now + dur und dur und lässt den Rest unberührt', () => {
    const s1 = enter(s0, 'b', 1000, 300);
    expect(s1).toEqual({ phase: 'b', endsAt: 1300, dur: 300, extra: 7 });
    expect(s0).toEqual({ phase: 'a', endsAt: 100, dur: 50, extra: 7 });
    expect(s1).not.toBe(s0);
  });

  it('due ist an der Grenze wahr und davor falsch', () => {
    expect(due(s0, 99)).toBe(false);
    expect(due(s0, 100)).toBe(true);
    expect(due(s0, 101)).toBe(true);
  });
});

describe('isStr', () => {
  it('trimmt und verlangt 1..max Zeichen', () => {
    expect(isStr('a', 5)).toBe(true);
    expect(isStr('  ab  ', 2)).toBe(true);
    expect(isStr('abcde', 5)).toBe(true);
    expect(isStr('abcdef', 5)).toBe(false);
  });

  it('leer, nur Leerzeichen, Überlänge und Nicht-Strings', () => {
    for (const bad of ['', '   ', '\n\t', null, undefined, 5, {}, [], ['a']]) expect(isStr(bad, 5), String(bad)).toBe(false);
    expect(isStr('x'.repeat(31), 30)).toBe(false);
    expect(isStr('x'.repeat(30), 30)).toBe(true);
  });
});

describe('clampInt', () => {
  it('klemmt ganzzahlig in lo..hi', () => {
    expect(clampInt(5, 0, 3)).toBe(3);
    expect(clampInt(-5, 0, 3)).toBe(0);
    expect(clampInt(2, 0, 3)).toBe(2);
  });

  it('Brüche werden abgerundet, NaN wird lo, Unendlich wird zur Grenze', () => {
    expect(clampInt(2.9, 0, 3)).toBe(2);
    expect(clampInt(0.9, 0, 3)).toBe(0);
    expect(clampInt(Number.NaN, 1, 3)).toBe(1);
    expect(clampInt(Infinity, 0, 3)).toBe(3);
    expect(clampInt(-Infinity, 0, 3)).toBe(0);
  });

  it('Nicht-Zahlen werden lo und werfen nicht', () => {
    expect(clampInt('5' as unknown as number, 2, 9)).toBe(2);
    expect(clampInt(undefined as unknown as number, 2, 9)).toBe(2);
  });
});
