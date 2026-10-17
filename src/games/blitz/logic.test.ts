import { describe, expect, it } from 'vitest';
import { BLITZ_MAX, GRACE, scale } from '../../engine/durations';
import { blitz, type BlitzState } from './logic';

const PLAYERS = [0, 1, 2].map((i) => ({ pid: `p${i}`, name: `P${i}`, color: i }));
const NOW = 1000;
const SPEEDS = [1, 10];
const make = (speed = 1, seed = 5, players = PLAYERS, now = NOW): BlitzState =>
  blitz.init(players, seed, now, { speed, drinking: false });
const hit = (s: BlitzState, pid: string, raw: unknown, now = NOW): BlitzState => {
  const i = blitz.parseInput(raw);
  if (i === null) throw new Error('ungueltig');
  return blitz.input(s, pid, i, now);
};
const times = (s: BlitzState, pid: string, ms: number[]): BlitzState =>
  ms.reduce((q, v, i) => hit(q, pid, { i, ms: v }), s);

describe('blitz init', () => {
  it('gleicher Seed ergibt gleiche waits fuer alle Spieler', () => {
    const a = blitz.view(make(), 'p0', NOW);
    expect(blitz.view(make(), 'p0', NOW).waits).toEqual(a.waits);
    expect(blitz.view(make(), 'p2', NOW).waits).toEqual(a.waits);
    expect(blitz.view(make(1, 6), 'p0', NOW).waits).not.toEqual(a.waits);
  });

  for (const speed of SPEEDS)
    it(`waits liegen bei speed ${speed} in den skalierten Grenzen`, () => {
      for (let seed = 0; seed < 60; seed++) {
        const { waits } = blitz.view(make(speed, seed), 'p0', NOW);
        expect(waits).toHaveLength(3);
        for (const w of waits) {
          expect(w).toBeGreaterThanOrEqual(scale(1500, speed));
          expect(w).toBeLessThanOrEqual(scale(4000, speed));
        }
      }
    });

  for (const speed of SPEEDS)
    it(`dur und endsAt folgen den Wartezeiten (speed ${speed})`, () => {
      const v = blitz.view(make(speed), 'p0', NOW);
      const sum = v.waits.reduce((a, b) => a + b, 0);
      expect(v.show).toBe(scale(900, speed));
      expect(v.max).toBe(BLITZ_MAX);
      expect(v.dur).toBe(sum + 3 * (scale(900, speed) + BLITZ_MAX));
      expect(v.endsAt).toBe(NOW + v.dur);
    });

  it('Sicht hat genau die vorgesehenen Felder', () => {
    expect(Object.keys(blitz.view(make(), 'p0', NOW)).sort()).toEqual(
      ['dur', 'endsAt', 'max', 'mine', 'progress', 'show', 'waits'].sort(),
    );
  });
});

describe('blitz parseInput', () => {
  it('Fruehstart hat Vorrang vor ms', () => {
    expect(blitz.parseInput({ i: 1, early: true, ms: 5 })).toEqual(blitz.parseInput({ i: 1, early: true }));
    expect(blitz.parseInput({ i: 1, early: true })).not.toBeNull();
  });

  it('rundet ms und klemmt auf [0, 1000]', () => {
    const s = times(make(), 'p0', [5000, -20, 250.4]);
    expect(blitz.view(s, 'p0', NOW).mine).toEqual([1000, 0, 250]);
  });

  it('lehnt Ungueltiges ab', () => {
    for (const bad of [
      { i: 3, ms: 1 },
      { i: -1, ms: 1 },
      { i: 1.5, ms: 1 },
      { i: '0', ms: 1 },
      { i: 0 },
      { i: 0, ms: Number.NaN },
      { i: 0, ms: Infinity },
      { i: 0, ms: '5' },
      { i: 0, early: 1 },
    ])
      expect(blitz.parseInput(bad)).toBeNull();
  });
});

describe('blitz input', () => {
  it('Fruehstart zaehlt 1000', () => {
    expect(blitz.view(hit(make(), 'p0', { i: 0, early: true }), 'p0', NOW).mine).toEqual([1000, null, null]);
  });

  it('je i zaehlt der erste Wert, Wiederholung liefert dieselbe Referenz', () => {
    const s = hit(make(), 'p0', { i: 0, ms: 300 });
    expect(hit(s, 'p0', { i: 0, ms: 100 })).toBe(s);
    expect(blitz.view(hit(s, 'p0', { i: 2, ms: 400 }), 'p0', NOW).mine).toEqual([300, null, 400]);
  });

  it('unbekannte pid wird ignoriert', () => {
    const s = make();
    expect(hit(s, 'zz', { i: 0, ms: 1 })).toBe(s);
  });

  for (const speed of SPEEDS)
    it(`bei hardEnd - 1 angenommen, bei hardEnd ignoriert (speed ${speed})`, () => {
      const s = make(speed);
      const hardEnd = blitz.view(s, 'p0', NOW).endsAt + GRACE;
      expect(blitz.view(hit(s, 'p0', { i: 0, ms: 300 }, hardEnd - 1), 'p0', NOW).mine[0]).toBe(300);
      expect(hit(s, 'p0', { i: 0, ms: 300 }, hardEnd)).toBe(s);
    });

  it('done erst bei hardEnd', () => {
    const s = make();
    const hardEnd = blitz.view(s, 'p0', NOW).endsAt + GRACE;
    expect(blitz.done(s, hardEnd - 1)).toBe(false);
    expect(blitz.done(s, hardEnd)).toBe(true);
  });

  it('progress zaehlt gesetzte Versuche je Spieler', () => {
    const s = times(make(), 'p1', [100, 200]);
    expect(blitz.view(s, 'p0', NOW).progress).toEqual({ p0: 0, p1: 2, p2: 0 });
  });
});

describe('blitz Frueh-Ende', () => {
  it('endet, sobald alle Online-Teilnehmer 3 Versuche haben', () => {
    let s = times(make(), 'p0', [1, 2, 3]);
    s = times(s, 'p1', [1, 2]);
    const online = new Set(['p0', 'p1']);
    const t = blitz.tick(s, NOW + 5, online);
    expect(t).toBe(s);
    expect(blitz.done(t, NOW + 5)).toBe(false);
    const u = blitz.tick(hit(s, 'p1', { i: 2, ms: 9 }), NOW + 6, online);
    expect(blitz.done(u, NOW + 6)).toBe(true);
  });

  it('Offline-Spieler blockieren nicht, ohne Online-Spieler gibt es kein Frueh-Ende', () => {
    const s = times(make(), 'p0', [1, 2, 3]);
    expect(blitz.done(blitz.tick(s, NOW + 5, new Set(['p0'])), NOW + 5)).toBe(true);
    expect(blitz.done(blitz.tick(s, NOW + 5, new Set()), NOW + 5)).toBe(false);
    expect(blitz.done(blitz.tick(s, NOW + 5, new Set(['zz'])), NOW + 5)).toBe(false);
  });
});

describe('blitz Wertung', () => {
  it('result ist -Summe, fehlende Versuche zaehlen 1000, schneller liegt hoeher', () => {
    let s = times(make(), 'p0', [200, 300, 242]);
    s = times(s, 'p1', [300]);
    const r = blitz.result(s);
    expect(r.get('p0')).toBe(-742);
    expect(r.get('p1')).toBe(-2300);
    expect(r.get('p0') as number).toBeGreaterThan(r.get('p1') as number);
  });

  it('Spieler ohne Eingabe hat keinen Eintrag und das Label "–"', () => {
    const s = times(make(), 'p0', [1, 2, 3]);
    expect(blitz.result(s).has('p2')).toBe(false);
    expect(blitz.label(s, 'p2')).toBe('–');
    expect(blitz.label(s, 'zz')).toBe('–');
  });

  it('Label ist die Summe in ms', () => {
    const s = times(make(), 'p0', [200, 300, 242]);
    expect(blitz.label(s, 'p0')).toBe('742 ms');
    expect(blitz.label(times(make(), 'p1', [300]), 'p1')).toBe('2300 ms');
  });

  it('Sicht des Spielers zeigt eigene Zeiten', () => {
    const s = times(make(), 'p0', [200]);
    expect(blitz.view(s, 'p0', NOW).mine).toEqual([200, null, null]);
    expect(blitz.view(s, 'p1', NOW).mine).toEqual([null, null, null]);
  });
});
