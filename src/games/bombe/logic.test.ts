import { describe, expect, it } from 'vitest';
import { BOMBE, GRACE, scale } from '../../engine/durations';
import { BOMBE_BALLOONS, BOMBE_CAP, bombe, type BombeState, type BombeView } from './logic';

const players = (n: number) => Array.from({ length: n }, (_, i) => ({ pid: `p${i}`, name: `P${i}`, color: i }));
const pidsOf = (n: number) => players(n).map((p) => p.pid);
const NOW = 500;
const SPEEDS = [1, 10];
const make = (n = 3, seed = 3, speed = 1): BombeState => bombe.init(players(n), seed, NOW, { speed, drinking: false });
const send = (s: BombeState, pid: string, raw: unknown, now = NOW): BombeState => {
  const i = bombe.parseInput(raw);
  if (i === null) throw new Error('ungueltig');
  return bombe.input(s, pid, i, now);
};
const view = (s: BombeState, pid = 'p0'): BombeView => bombe.view(s, pid, NOW);
const burst = (s: BombeState, pid: string, b: number): number => (s.burst[pid] as number[])[b] as number;
const safe = (s: BombeState, pid: string, b: number): number => burst(s, pid, b) - 1;
const everyone = (n: number) => new Set(pidsOf(n));

describe('bombe init', () => {
  it('3 Ballons je Spieler, Platzpunkte int(4..30), je Seed deterministisch', () => {
    expect(BOMBE_BALLOONS).toBe(3);
    expect(BOMBE_CAP).toBe(40);
    const seen = new Set<number>();
    for (let seed = 0; seed < 300; seed++) {
      const s = make(3, seed);
      expect(Object.keys(s.burst)).toEqual(pidsOf(3));
      for (const pid of pidsOf(3)) {
        const row = s.burst[pid] as number[];
        expect(row).toHaveLength(3);
        for (const x of row) {
          expect(Number.isInteger(x)).toBe(true);
          expect(x).toBeGreaterThanOrEqual(4);
          expect(x).toBeLessThanOrEqual(30);
          seen.add(x);
        }
      }
      expect(make(3, seed).burst).toEqual(s.burst);
    }
    expect(seen.has(4)).toBe(true);
    expect(seen.has(30)).toBe(true);
    expect(make(3, 1).burst).not.toEqual(make(3, 2).burst);
  });

  it('die Spieler haben nicht alle dieselben Platzpunkte', () => {
    const s = make(8, 5);
    expect(new Set(Object.values(s.burst).map((r) => r.join())).size).toBeGreaterThan(1);
  });

  for (const speed of SPEEDS)
    it(`dur, endsAt und Ende bei dur + GRACE (speed ${speed})`, () => {
      const s = make(3, 3, speed);
      const v = view(s);
      expect(v.dur).toBe(scale(BOMBE, speed));
      expect(v.endsAt).toBe(NOW + v.dur);
      expect(v.show).toBeGreaterThan(0);
      expect(bombe.done(s, NOW + v.dur + GRACE - 1)).toBe(false);
      expect(bombe.done(s, NOW + v.dur + GRACE)).toBe(true);
    });
});

describe('bombe parseInput', () => {
  it('kappt n auf 40, cash nur bei true', () => {
    expect(bombe.parseInput({ b: 0, n: 999, cash: false })).toEqual(expect.objectContaining({ n: 40 }));
    const yes = bombe.parseInput({ b: 0, n: 5, cash: true });
    const no = bombe.parseInput({ b: 0, n: 5, cash: 'yes' });
    expect(yes).not.toEqual(no);
    expect(no).toEqual(bombe.parseInput({ b: 0, n: 5 }));
  });

  it('lehnt Ungueltiges ab', () => {
    for (const bad of [
      { b: -1, n: 1 },
      { b: 3, n: 1 },
      { b: 0.5, n: 1 },
      { b: '0', n: 1 },
      { b: 0, n: -1 },
      { b: 0, n: 1.5 },
      { b: 0, n: '5' },
      { b: 0, n: Number.NaN },
      { b: 0, n: Infinity },
      { n: 5 },
      { b: 0 },
    ])
      expect(bombe.parseInput(bad)).toBeNull();
  });
});

describe('bombe input', () => {
  it('der Zaehler ist kumulativ: das Maximum gilt, Wiederholung und niedrigerer Wert aendern nichts', () => {
    const s = send(make(), 'p0', { b: 0, n: 2, cash: false });
    expect(view(s).mine).toEqual({ b: 0, n: 2, res: [] });
    expect(send(s, 'p0', { b: 0, n: 2, cash: false })).toBe(s);
    expect(send(s, 'p0', { b: 0, n: 1, cash: false })).toBe(s);
    expect(view(send(s, 'p0', { b: 0, n: 3, cash: false })).mine.n).toBe(3);
  });

  it('platzt bei n >= burst, mit n = burst - 1 noch nicht', () => {
    const s = make();
    const at = burst(s, 'p0', 0);
    expect(view(send(s, 'p0', { b: 0, n: at - 1, cash: false })).mine.res).toEqual([]);
    const popped = send(s, 'p0', { b: 0, n: at, cash: false });
    expect(view(popped).mine).toEqual({ b: 1, n: 0, res: [{ s: 'pop', pts: 0 }] });
    expect(bombe.result(popped).get('p0')).toBe(0);
  });

  it('ein Sprung ueber burst hinaus platzt ebenfalls', () => {
    const s = make();
    const jumped = send(send(s, 'p0', { b: 0, n: 2, cash: false }), 'p0', { b: 0, n: 40, cash: false });
    expect(view(jumped).mine.res).toEqual([{ s: 'pop', pts: 0 }]);
  });

  it('Kassieren sichert n^2, auch bei hoeherem n als zuvor gepumpt', () => {
    const s = make();
    const n = safe(s, 'p0', 0);
    const pumped = send(s, 'p0', { b: 0, n: 2, cash: false });
    const cashed = send(pumped, 'p0', { b: 0, n, cash: true });
    expect(view(cashed).mine).toEqual({ b: 1, n: 0, res: [{ s: 'cash', pts: n * n }] });
  });

  it('Kassieren nimmt das Maximum aus Pumpstand und Eingabe', () => {
    const s = make();
    const n = Math.min(3, safe(s, 'p0', 0));
    const cashed = send(send(s, 'p0', { b: 0, n, cash: false }), 'p0', { b: 0, n: 1, cash: true });
    expect(view(cashed).mine.res).toEqual([{ s: 'cash', pts: n * n }]);
  });

  it('Kassieren mit n = 0 ist erlaubt und zaehlt 0 Punkte', () => {
    const cashed = send(make(), 'p0', { b: 0, n: 0, cash: true });
    expect(view(cashed).mine).toEqual({ b: 1, n: 0, res: [{ s: 'cash', pts: 0 }] });
    expect(bombe.label(cashed, 'p0')).toBe('0 Pkt');
  });

  it('Kassieren bei n >= burst platzt', () => {
    const s = make();
    const popped = send(s, 'p0', { b: 0, n: burst(s, 'p0', 0), cash: true });
    expect(view(popped).mine.res).toEqual([{ s: 'pop', pts: 0 }]);
  });

  it('nur der aktuelle Ballon zaehlt: spaetere und erledigte werden ignoriert', () => {
    const s = make();
    expect(send(s, 'p0', { b: 1, n: 2, cash: false })).toBe(s);
    const after = send(s, 'p0', { b: 0, n: 2, cash: true });
    expect(send(after, 'p0', { b: 0, n: 3, cash: false })).toBe(after);
    expect(send(after, 'p0', { b: 0, n: 3, cash: true })).toBe(after);
    expect(send(after, 'p0', { b: 2, n: 3, cash: false })).toBe(after);
    expect(send(after, 'p0', { b: 1, n: 2, cash: false })).not.toBe(after);
  });

  it('nach dem dritten Ballon werden Eingaben ignoriert', () => {
    let s = make();
    for (let b = 0; b < 3; b++) s = send(s, 'p0', { b, n: 2, cash: true });
    expect(view(s).mine.b).toBe(3);
    expect(send(s, 'p0', { b: 2, n: 5, cash: false })).toBe(s);
    expect(send(s, 'p0', { b: 0, n: 5, cash: false })).toBe(s);
  });

  it('unbekannte pid wird ignoriert', () => {
    const s = make();
    expect(send(s, 'zz', { b: 0, n: 3, cash: false })).toBe(s);
  });

  for (const speed of SPEEDS)
    it(`bei hardEnd - 1 angenommen, bei hardEnd ignoriert (speed ${speed})`, () => {
      const s = make(3, 3, speed);
      const hardEnd = NOW + scale(BOMBE, speed) + GRACE;
      expect(view(send(s, 'p0', { b: 0, n: 2, cash: false }, hardEnd - 1)).mine.n).toBe(2);
      expect(send(s, 'p0', { b: 0, n: 2, cash: false }, hardEnd)).toBe(s);
    });
});

describe('bombe Wertung', () => {
  it('Summe n^2 der kassierten Ballons, nicht kassierte zaehlen 0', () => {
    let s = make();
    const n0 = Math.min(3, safe(s, 'p0', 0));
    const n1 = Math.min(5, safe(s, 'p0', 1));
    s = send(s, 'p0', { b: 0, n: n0, cash: true });
    s = send(s, 'p0', { b: 1, n: n1, cash: true });
    s = send(s, 'p0', { b: 2, n: Math.min(4, safe(s, 'p0', 2)), cash: false });
    expect(bombe.result(s).get('p0')).toBe(n0 * n0 + n1 * n1);
    expect(bombe.label(s, 'p0')).toBe(`${n0 * n0 + n1 * n1} Pkt`);
  });

  it('geplatzte Ballons zaehlen 0, kassierte daneben bleiben', () => {
    let s = make();
    const n0 = Math.min(3, safe(s, 'p0', 0));
    s = send(s, 'p0', { b: 0, n: n0, cash: true });
    s = send(s, 'p0', { b: 1, n: burst(s, 'p0', 1), cash: false });
    expect(bombe.result(s).get('p0')).toBe(n0 * n0);
  });

  it('result-Eintrag ab der ersten angenommenen Eingabe, vorher "–"', () => {
    const s = make();
    expect(bombe.result(s).size).toBe(0);
    expect(bombe.label(s, 'p0')).toBe('–');
    const t = send(s, 'p0', { b: 0, n: 0, cash: false });
    expect(bombe.result(t)).toEqual(new Map([['p0', 0]]));
    expect(bombe.label(t, 'p0')).toBe('0 Pkt');
    expect(bombe.label(t, 'p1')).toBe('–');
    expect(bombe.label(t, 'zz')).toBe('–');
  });

  it('abgelehnte Eingaben (falscher Ballon) erzeugen keinen Eintrag', () => {
    const s = send(make(), 'p0', { b: 2, n: 1, cash: false });
    expect(bombe.result(s).size).toBe(0);
  });
});

describe('bombe Ende', () => {
  const finish = (s: BombeState, pid: string): BombeState => {
    let q = s;
    for (let b = 0; b < 3; b++) q = send(q, pid, { b, n: 1, cash: true });
    return q;
  };

  it('endet, sobald alle Online-Teilnehmer alle Ballons erledigt haben', () => {
    const s = finish(make(), 'p0');
    const online = new Set(['p0', 'p1']);
    expect(bombe.done(bombe.tick(s, NOW + 5, online), NOW + 5)).toBe(false);
    const t = bombe.tick(finish(s, 'p1'), NOW + 6, online);
    expect(bombe.done(t, NOW + 6)).toBe(true);
  });

  it('Offline-Spieler blockieren nicht, ein leeres Online-Set beendet nie', () => {
    const s = finish(make(), 'p0');
    expect(bombe.done(bombe.tick(s, NOW + 5, new Set(['p0'])), NOW + 5)).toBe(true);
    expect(bombe.done(bombe.tick(s, NOW + 5, new Set()), NOW + 5)).toBe(false);
  });

  it('ein unfertiger Spieler haelt das Spiel bis hardEnd offen', () => {
    const s = send(finish(make(), 'p0'), 'p1', { b: 0, n: 1, cash: false });
    const t = bombe.tick(s, NOW + 5, everyone(3));
    expect(t).toBe(s);
    expect(bombe.done(t, NOW + 5)).toBe(false);
  });
});

describe('bombe view und Geheimnis', () => {
  it('live: je Spieler und Ballon nur pid, b und Status', () => {
    let s = make();
    expect(view(s).live).toEqual(pidsOf(3).map((pid) => ({ pid, b: 0, s: 'pumpt' })));
    const n = Math.min(2, safe(s, 'p0', 0));
    s = send(s, 'p0', { b: 0, n, cash: true });
    s = send(s, 'p1', { b: 0, n: burst(s, 'p1', 0), cash: false });
    const live = view(s, 'p2').live;
    expect(live).toEqual([
      { pid: 'p0', b: 0, s: 'kassiert' },
      { pid: 'p0', b: 1, s: 'pumpt' },
      { pid: 'p1', b: 0, s: 'geplatzt' },
      { pid: 'p1', b: 1, s: 'pumpt' },
      { pid: 'p2', b: 0, s: 'pumpt' },
    ]);
    for (const e of live) expect(Object.keys(e).sort()).toEqual(['b', 'pid', 's']);
  });

  it('nach dem dritten Ballon gibt es keinen pumpt-Eintrag mehr', () => {
    let s = make(2);
    for (let b = 0; b < 3; b++) s = send(s, 'p0', { b, n: 1, cash: true });
    expect(view(s).live.filter((e) => e.pid === 'p0')).toEqual([0, 1, 2].map((b) => ({ pid: 'p0', b, s: 'kassiert' })));
  });

  it('der Pumpstand eines Spielers aendert die Sicht der anderen nicht', () => {
    const s = make();
    const t = send(s, 'p0', { b: 0, n: Math.min(3, safe(s, 'p0', 0)), cash: false });
    for (const pid of ['p1', 'p2']) expect(JSON.stringify(view(t, pid))).toBe(JSON.stringify(view(s, pid)));
  });

  it('die Sicht hat genau die vorgesehenen Felder', () => {
    const v = view(make());
    expect(Object.keys(v).sort()).toEqual(['dur', 'endsAt', 'live', 'mine', 'show']);
    expect(Object.keys(v.mine).sort()).toEqual(['b', 'n', 'res']);
  });

  it('keine Sicht enthaelt burst, auch nicht die eigene und nicht nach dem Ende', () => {
    let s = make(3, 9);
    for (const pid of pidsOf(3)) for (let b = 0; b < 3; b++) s = send(s, pid, { b, n: b === 0 ? burst(s, pid, 0) : 2, cash: b > 0 });
    const ended = bombe.tick(s, NOW + 5, everyone(3));
    for (const state of [make(3, 9), s, ended])
      for (const pid of [...pidsOf(3), 'zz']) {
        const json = JSON.stringify(bombe.view(state, pid, NOW));
        expect(json).not.toContain('burst');
        expect(json).not.toContain(JSON.stringify(state.burst[pid] ?? 'x'));
      }
  });

  it('die eigene Sicht zeigt Ergebnisse, Platzer ohne Punkte', () => {
    let s = make();
    s = send(s, 'p0', { b: 0, n: burst(s, 'p0', 0), cash: false });
    s = send(s, 'p0', { b: 1, n: 3, cash: true });
    expect(view(s).mine).toEqual({ b: 2, n: 0, res: [{ s: 'pop', pts: 0 }, { s: 'cash', pts: 9 }] });
  });
});
