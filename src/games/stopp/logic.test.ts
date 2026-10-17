import { describe, expect, it } from 'vitest';
import { STOPP_LATE, STOPP_LEAD, STOPP_REVEAL, scale } from '../../engine/durations';
import { duoLine, fmtSec, stopp, STOPP_CAP, STOPP_MISS, STOPP_TRIES, type StoppState, type StoppView } from './logic';

type Run = Extract<StoppView, { phase: 'run' }>;
type Reveal = Extract<StoppView, { phase: 'reveal' }>;

const players = (n: number) => Array.from({ length: n }, (_, i) => ({ pid: `p${i}`, name: `P${i}`, color: i }));
const pidsOf = (n: number) => players(n).map((p) => p.pid);
const NOW = 5000;
const SPEEDS = [1, 10];
const make = (n = 3, seed = 3, speed = 1): StoppState => stopp.init(players(n), seed, NOW, { speed, drinking: false });
const send = (s: StoppState, pid: string, raw: unknown, now = NOW): StoppState => {
  const i = stopp.parseInput(raw);
  if (i === null) throw new Error('ungueltig');
  return stopp.input(s, pid, i, now);
};
const run = (s: StoppState, pid = 'p0'): Run => stopp.view(s, pid, NOW) as Run;
const reveal = (s: StoppState, pid = 'p0'): Reveal => stopp.view(s, pid, NOW) as Reveal;
const everyone = (n: number) => new Set(pidsOf(n));
const toReveal = (s: StoppState, n = 3): StoppState => stopp.tick(s, s.endsAt, everyone(n));
const nextRun = (s: StoppState, n = 3): StoppState => {
  const r = toReveal(s, n);
  return stopp.tick(r, r.endsAt, everyone(n));
};
const score = (s: StoppState, pid: string) => stopp.result(s).get(pid);

describe('stopp Konstanten', () => {
  it('3 Versuche, fehlender Versuch 5000, Kappung 10000', () => {
    expect(STOPP_TRIES).toBe(3);
    expect(STOPP_MISS).toBe(5000);
    expect(STOPP_CAP).toBe(10_000);
  });
});

describe('stopp init und Ziele', () => {
  for (const speed of SPEEDS)
    it(`Ziele 7..15 s auf 0,5 s, fuer alle gleich, je Seed deterministisch (speed ${speed})`, () => {
      const seen = new Set<number>();
      for (let seed = 0; seed < 200; seed++) {
        const s = make(3, seed, speed);
        expect(s.targets).toHaveLength(3);
        for (const t of s.targets) {
          expect(t).toBeGreaterThanOrEqual(scale(7000, speed));
          expect(t).toBeLessThanOrEqual(scale(15_000, speed));
          expect((t * speed) % 500).toBe(0);
          seen.add(t * speed);
        }
        expect(make(3, seed, speed).targets).toEqual(s.targets);
        expect(run(s, 'p0').target).toBe(run(s, 'p1').target);
      }
      expect(seen.has(7000)).toBe(true);
      expect(seen.has(15_000)).toBe(true);
    });

  for (const speed of SPEEDS)
    it(`startAt = Phasenbeginn + Vorlauf, run endet bei startAt + Ziel + Nachfrist (speed ${speed})`, () => {
      const s = make(3, 3, speed);
      const v = run(s);
      expect(v.lead).toBe(scale(STOPP_LEAD, speed));
      expect(v.startAt).toBe(NOW + scale(STOPP_LEAD, speed));
      expect(v.endsAt).toBe(v.startAt + v.target + scale(STOPP_LATE, speed));
      expect(v.dur).toBe(v.endsAt - NOW);
      expect(v.k).toBe(0);
      expect(v.of).toBe(3);
    });

  it('die Sicht der Laufphase hat genau die vorgesehenen Felder', () => {
    expect(Object.keys(run(make())).sort()).toEqual(
      ['dur', 'endsAt', 'got', 'k', 'lead', 'of', 'phase', 'sent', 'startAt', 'target', 'total'].sort(),
    );
  });
});

describe('stopp parseInput', () => {
  it('kappt devMs auf +-10000 und rundet', () => {
    expect(stopp.parseInput({ k: 0, devMs: 99_999 })).toEqual({ k: 0, devMs: 10_000 });
    expect(stopp.parseInput({ k: 1, devMs: -99_999 })).toEqual({ k: 1, devMs: -10_000 });
    expect(stopp.parseInput({ k: 2, devMs: 12.6 })).toEqual({ k: 2, devMs: 13 });
  });

  it('lehnt Ungueltiges ab', () => {
    for (const bad of [
      { k: -1, devMs: 1 },
      { k: 3, devMs: 1 },
      { k: 0.5, devMs: 1 },
      { k: '0', devMs: 1 },
      { k: 0, devMs: '5' },
      { k: 0, devMs: Number.NaN },
      { k: 0, devMs: Infinity },
      { k: 0 },
      { devMs: 1 },
    ])
      expect(stopp.parseInput(bad)).toBeNull();
  });
});

describe('stopp input', () => {
  it('gilt nur in der Laufphase des passenden Versuchs, ohne Pruefung gegen startAt', () => {
    const s = make();
    expect(NOW).toBeLessThan(run(s).startAt);
    const t = send(s, 'p0', { k: 0, devMs: -120 });
    expect(t).not.toBe(s);
    expect(send(s, 'p0', { k: 1, devMs: 5 })).toBe(s);
    expect(send(s, 'p0', { k: 2, devMs: 5 })).toBe(s);
  });

  it('eine Eingabe je Versuch: die zweite aendert nichts', () => {
    const s = send(make(), 'p0', { k: 0, devMs: -120 });
    expect(send(s, 'p0', { k: 0, devMs: 3 })).toBe(s);
    expect(send(s, 'p1', { k: 0, devMs: 3 })).not.toBe(s);
  });

  it('in der Aufloesung werden Eingaben ignoriert', () => {
    const r = toReveal(make());
    expect(r.phase).toBe('reveal');
    expect(send(r, 'p0', { k: 0, devMs: 1 })).toBe(r);
    expect(send(r, 'p0', { k: 1, devMs: 1 })).toBe(r);
  });

  it('unbekannte pid wird ignoriert', () => {
    const s = make();
    expect(send(s, 'zz', { k: 0, devMs: 1 })).toBe(s);
  });
});

describe('stopp Phasen', () => {
  for (const speed of SPEEDS)
    it(`run -> reveal -> naechster Versuch -> ... -> Ende (speed ${speed})`, () => {
      let s = make(3, 3, speed);
      const ends: number[] = [];
      for (let k = 0; k < 3; k++) {
        expect(run(s).k).toBe(k);
        expect(stopp.tick(s, s.endsAt - 1, everyone(3))).toBe(s);
        const r = stopp.tick(s, s.endsAt, everyone(3));
        expect(reveal(r).phase).toBe('reveal');
        expect(reveal(r).dur).toBe(scale(STOPP_REVEAL, speed));
        expect(reveal(r).endsAt).toBe(s.endsAt + scale(STOPP_REVEAL, speed));
        expect(stopp.tick(r, r.endsAt - 1, everyone(3))).toBe(r);
        expect(stopp.done(r, r.endsAt)).toBe(k === 2);
        ends.push(r.endsAt);
        s = stopp.tick(r, r.endsAt, everyone(3));
        if (k < 2) {
          const v = run(s);
          expect(v.startAt).toBe(r.endsAt + scale(STOPP_LEAD, speed));
          expect(v.target).toBe(make(3, 3, speed).targets[k + 1]);
          expect(v.sent).toBe(false);
        }
      }
      expect(reveal(s).k).toBe(2);
      expect(stopp.done(s, ends[2] as number)).toBe(true);
    });

  it('endet den Versuch vorzeitig, sobald alle Online-Teilnehmer gesendet haben', () => {
    const s = send(make(), 'p0', { k: 0, devMs: 10 });
    const online = new Set(['p0', 'p1']);
    expect(stopp.tick(s, NOW + 5, online)).toBe(s);
    const t = stopp.tick(send(s, 'p1', { k: 0, devMs: 20 }), NOW + 6, online);
    expect(reveal(t).phase).toBe('reveal');
  });

  it('Offline-Spieler blockieren nicht, ein leeres Online-Set beendet nie', () => {
    const s = send(make(), 'p0', { k: 0, devMs: 10 });
    expect(stopp.tick(s, NOW + 5, new Set(['p0']))).not.toBe(s);
    expect(stopp.tick(s, NOW + 5, new Set())).toBe(s);
  });

  it('ohne Eingabe haelt die Laufphase bis zum Ende, ohne GRACE je Versuch', () => {
    const s = make();
    expect(stopp.done(s, s.endsAt + 100_000)).toBe(false);
  });
});

describe('stopp Wertung', () => {
  const played = (devs: Record<string, number[]>): StoppState => {
    let s = make(2);
    for (let k = 0; k < 3; k++) {
      for (const [pid, row] of Object.entries(devs)) if (row[k] !== undefined) s = send(s, pid, { k, devMs: row[k] });
      if (k < 2) s = nextRun(s, 2);
    }
    return s;
  };

  it('Score ist -Summe |dev|, Label als Summe', () => {
    const s = played({ p0: [-400, 500, 330], p1: [10, -20, 30] });
    expect(score(s, 'p0')).toBe(-1230);
    expect(score(s, 'p1')).toBe(-60);
    expect(stopp.label(s, 'p0')).toBe('± 1,23 s');
    expect(stopp.label(s, 'p1')).toBe('± 0,06 s');
  });

  it('ein fehlender Versuch zaehlt 5000', () => {
    const s = played({ p0: [-120], p1: [0, 0, 0] });
    expect(score(s, 'p0')).toBe(-(120 + 2 * STOPP_MISS));
    expect(stopp.label(s, 'p0')).toBe('± 10,12 s');
    expect(score(s, 'p1')).toBe(0);
    expect(stopp.label(s, 'p1')).toBe('± 0,00 s');
  });

  it('ohne jede Eingabe kein Eintrag und Label "–"', () => {
    const s = played({ p0: [1, 2, 3] });
    expect(stopp.result(s).has('p1')).toBe(false);
    expect(stopp.label(s, 'p1')).toBe('–');
    expect(stopp.label(s, 'zz')).toBe('–');
    expect(stopp.result(make()).size).toBe(0);
  });

  it('der result-Eintrag entsteht mit der ersten Eingabe', () => {
    const s = send(make(), 'p0', { k: 0, devMs: 300 });
    expect(stopp.result(s)).toEqual(new Map([['p0', -(300 + 2 * STOPP_MISS)]]));
  });

  it('die Ankunftszeit aendert die Wertung nie: spaeter eingetroffen, gleicher Wert', () => {
    const a = send(make(), 'p0', { k: 0, devMs: -50 }, NOW);
    const b = send(make(), 'p0', { k: 0, devMs: -50 }, NOW + 4000);
    expect(stopp.result(a)).toEqual(stopp.result(b));
  });
});

describe('stopp Sichten und Geheimnis', () => {
  it('die Laufphase zeigt nur sent und den Zaehler, keinen dev-Wert', () => {
    let s = make();
    s = send(s, 'p0', { k: 0, devMs: 4321 });
    s = send(s, 'p1', { k: 0, devMs: -8765 });
    for (const pid of ['p0', 'p1', 'p2', 'zz']) {
      const json = JSON.stringify(stopp.view(s, pid, NOW));
      for (const x of ['4321', '8765', 'devMs', 'devs']) expect(json).not.toContain(x);
    }
    expect(run(s, 'p0').sent).toBe(true);
    expect(run(s, 'p2').sent).toBe(false);
    expect(run(s, 'zz').sent).toBe(false);
    expect(run(s, 'p2').got).toBe(2);
    expect(run(s, 'p2').total).toBe(3);
  });

  it('die Aufloesung nennt die dev-Werte aller, null ohne Tipp', () => {
    let s = make();
    s = send(s, 'p0', { k: 0, devMs: 4321 });
    s = send(s, 'p1', { k: 0, devMs: -8765 });
    const r = toReveal(s);
    const v = reveal(r, 'p1');
    expect(Object.keys(v).sort()).toEqual(['dur', 'endsAt', 'k', 'mine', 'of', 'phase', 'rows', 'target'].sort());
    expect(v.rows).toEqual([
      { pid: 'p0', dev: 4321 },
      { pid: 'p1', dev: -8765 },
      { pid: 'p2', dev: null },
    ]);
    expect(v.mine).toBe(-8765);
    expect(reveal(r, 'p2').mine).toBeNull();
    expect(reveal(r, 'zz').mine).toBeNull();
  });

  it('nach dem Wechsel in den naechsten Versuch sind die alten Werte nicht mehr in der Sicht', () => {
    const s = nextRun(send(make(), 'p0', { k: 0, devMs: 4321 }));
    expect(JSON.stringify(stopp.view(s, 'p0', NOW))).not.toContain('4321');
    expect(run(s).sent).toBe(false);
  });
});

describe('stopp fmtSec und duoLine', () => {
  it('fmtSec: zwei Nachkommastellen mit Komma', () => {
    expect(fmtSec(0)).toBe('0,00');
    expect(fmtSec(1230)).toBe('1,23');
    expect(fmtSec(10_120)).toBe('10,12');
    expect(fmtSec(60)).toBe('0,06');
    expect(fmtSec(4)).toBe('0,00');
    expect(fmtSec(1005)).toBe('1,01');
  });

  it('duoLine: der Naehere wird genannt, mit Differenz', () => {
    expect(duoLine(-100, 220, 'Anna')).toBe('Du warst 0,12 s näher dran');
    expect(duoLine(300, -100, 'Anna')).toBe('Anna war 0,20 s näher dran');
  });

  it('duoLine: gleicher Abstand (auch mit anderem Vorzeichen) behauptet keinen Sieger', () => {
    expect(duoLine(100, -100, 'Anna')).toBe('Gleich nah dran');
    expect(duoLine(0, 0, 'Anna')).toBe('Gleich nah dran');
  });

  it('duoLine: fehlender Tipp behauptet keinen Sieger', () => {
    expect(duoLine(100, null, 'Anna')).toBe('Anna hat nicht gestoppt');
    expect(duoLine(null, 100, 'Anna')).toBe('Du hast nicht gestoppt');
    expect(duoLine(null, null, 'Anna')).toBe('Niemand hat gestoppt');
    for (const line of [duoLine(100, null, 'Anna'), duoLine(null, 100, 'Anna'), duoLine(null, null, 'Anna')])
      expect(line).not.toMatch(/näher/);
  });
});
