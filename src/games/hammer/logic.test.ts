import { describe, expect, it } from 'vitest';
import { GRACE, scale } from '../../engine/durations';
import { hammer, type HammerState } from './logic';

const PLAYERS = [0, 1, 2].map((i) => ({ pid: `p${i}`, name: `P${i}`, color: i }));
const NOW = 500;
const SPEEDS = [1, 10];
const make = (speed = 1): HammerState => hammer.init(PLAYERS, 3, NOW, { speed });
const hit = (s: HammerState, pid: string, raw: unknown, now = NOW): HammerState => {
  const i = hammer.parseInput(raw);
  if (i === null) throw new Error('ungueltig');
  return hammer.input(s, pid, i, now);
};

describe('hammer init', () => {
  for (const speed of SPEEDS)
    it(`dur und endsAt (speed ${speed})`, () => {
      const v = hammer.view(make(speed), 'p0', NOW);
      expect(v.dur).toBe(scale(8000, speed));
      expect(v.endsAt).toBe(NOW + v.dur);
    });

  it('Sicht hat genau die vorgesehenen Felder, bars in Beitrittsreihenfolge', () => {
    const v = hammer.view(make(), 'p1', NOW);
    expect(Object.keys(v).sort()).toEqual(['bars', 'dur', 'endsAt', 'mine'].sort());
    expect(v.bars).toEqual([
      { pid: 'p0', n: 0 },
      { pid: 'p1', n: 0 },
      { pid: 'p2', n: 0 },
    ]);
    expect(v.mine).toBe(0);
  });
});

describe('hammer parseInput', () => {
  it('klemmt n auf 200, final nur bei true', () => {
    expect(hammer.parseInput({ n: 999 })).toEqual(expect.objectContaining({ n: 200 }));
    const yes = hammer.parseInput({ n: 5, final: true });
    const no = hammer.parseInput({ n: 5, final: 'yes' });
    expect(yes).not.toEqual(no);
    expect(no).toEqual(hammer.parseInput({ n: 5 }));
  });

  it('lehnt Ungueltiges ab', () => {
    for (const bad of [{ n: -1 }, { n: 1.5 }, { n: '5' }, { n: Number.NaN }, { n: Infinity }, { final: true }])
      expect(hammer.parseInput(bad)).toBeNull();
  });
});

describe('hammer input', () => {
  it('Zaehler ist monoton: das Maximum gilt', () => {
    const s = hit(make(), 'p0', { n: 30 });
    expect(hit(s, 'p0', { n: 20 })).toBe(s);
    expect(hammer.view(hit(s, 'p0', { n: 40 }), 'p0', NOW).mine).toBe(40);
  });

  it('ist auf 200 gedeckelt', () => {
    expect(hammer.view(hit(make(), 'p0', { n: 5000 }), 'p0', NOW).mine).toBe(200);
  });

  it('nach final ist der Zaehler eingefroren', () => {
    const s = hit(make(), 'p0', { n: 60, final: true });
    expect(hammer.view(s, 'p0', NOW).mine).toBe(60);
    expect(hit(s, 'p0', { n: 80 }, NOW + 1)).toBe(s);
    expect(hit(s, 'p0', { n: 80, final: true }, NOW + 1)).toBe(s);
  });

  it('final ohne hoeheren Wert friert den aktuellen Stand ein', () => {
    const s = hit(hit(make(), 'p0', { n: 30 }), 'p0', { n: 10, final: true });
    expect(hammer.view(s, 'p0', NOW).mine).toBe(30);
    expect(hit(s, 'p0', { n: 99 })).toBe(s);
  });

  it('unbekannte pid wird ignoriert', () => {
    const s = make();
    expect(hit(s, 'zz', { n: 3 })).toBe(s);
  });

  for (const speed of SPEEDS)
    it(`bei hardEnd - 1 angenommen, bei hardEnd ignoriert (speed ${speed})`, () => {
      const s = make(speed);
      const hardEnd = NOW + scale(8000, speed) + GRACE;
      expect(hammer.view(hit(s, 'p0', { n: 7 }, hardEnd - 1), 'p0', NOW).mine).toBe(7);
      expect(hit(s, 'p0', { n: 7 }, hardEnd)).toBe(s);
      expect(hammer.done(s, hardEnd - 1)).toBe(false);
      expect(hammer.done(s, hardEnd)).toBe(true);
    });

  it('bars sind in jeder Sicht gleich und in Beitrittsreihenfolge', () => {
    const s = hit(hit(make(), 'p2', { n: 9 }), 'p1', { n: 4 });
    const bars = [
      { pid: 'p0', n: 0 },
      { pid: 'p1', n: 4 },
      { pid: 'p2', n: 9 },
    ];
    for (const pid of ['p0', 'p1', 'p2', 'zz']) expect(hammer.view(s, pid, NOW).bars).toEqual(bars);
  });
});

describe('hammer Frueh-Ende', () => {
  it('endet, sobald alle Online-Teilnehmer final gemeldet haben', () => {
    const s = hit(hit(make(), 'p0', { n: 5, final: true }), 'p1', { n: 4 });
    const online = new Set(['p0', 'p1']);
    expect(hammer.tick(s, NOW + 5, online)).toBe(s);
    const t = hammer.tick(hit(s, 'p1', { n: 4, final: true }), NOW + 6, online);
    expect(hammer.done(t, NOW + 6)).toBe(true);
  });

  it('Offline-Spieler blockieren nicht, leeres Online-Set beendet nie', () => {
    const s = hit(make(), 'p0', { n: 5, final: true });
    expect(hammer.done(hammer.tick(s, NOW + 5, new Set(['p0'])), NOW + 5)).toBe(true);
    expect(hammer.done(hammer.tick(s, NOW + 5, new Set()), NOW + 5)).toBe(false);
  });
});

describe('hammer Wertung', () => {
  it('result ist n, Label mit Singular', () => {
    const s = hit(hit(hit(make(), 'p0', { n: 57 }), 'p1', { n: 1 }), 'p2', { n: 0, final: true });
    expect(hammer.result(s)).toEqual(
      new Map([
        ['p0', 57],
        ['p1', 1],
        ['p2', 0],
      ]),
    );
    expect(hammer.label(s, 'p0')).toBe('57 Taps');
    expect(hammer.label(s, 'p1')).toBe('1 Tap');
    expect(hammer.label(s, 'p2')).toBe('0 Taps');
  });

  it('ohne Eingabe kein Eintrag und Label "–"', () => {
    const s = hit(make(), 'p0', { n: 3 });
    expect(hammer.result(s).has('p1')).toBe(false);
    expect(hammer.label(s, 'p1')).toBe('–');
    expect(hammer.label(s, 'zz')).toBe('–');
  });
});
