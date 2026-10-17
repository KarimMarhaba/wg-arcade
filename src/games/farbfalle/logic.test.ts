import { describe, expect, it } from 'vitest';
import { GRACE, scale } from '../../engine/durations';
import { farbfalle, type FarbfalleState } from './logic';

const PLAYERS = [0, 1, 2].map((i) => ({ pid: `p${i}`, name: `P${i}`, color: i }));
const NOW = 2000;
const SPEEDS = [1, 10];
const make = (speed = 1, seed = 9): FarbfalleState => farbfalle.init(PLAYERS, seed, NOW, { speed });
const hit = (s: FarbfalleState, pid: string, raw: unknown, now = NOW): FarbfalleState => {
  const i = farbfalle.parseInput(raw);
  if (i === null) throw new Error('ungueltig');
  return farbfalle.input(s, pid, i, now);
};
const seqOf = (s: FarbfalleState) => farbfalle.view(s, 'p0', NOW).seq;
const answer = (s: FarbfalleState, pid: string, flags: boolean[], now = NOW): FarbfalleState => {
  const seq = seqOf(s);
  return flags.reduce((q, ok, k) => {
    const ink = (seq[farbfalle.view(q, pid, NOW).next] as [number, number])[1];
    return hit(q, pid, { i: k, c: ok ? ink : (ink + 1) % 4 }, now);
  }, s);
};

describe('farbfalle Folge', () => {
  it('ist je Seed deterministisch und fuer alle gleich', () => {
    const a = seqOf(make());
    expect(seqOf(make())).toEqual(a);
    expect(farbfalle.view(make(), 'p2', NOW).seq).toEqual(a);
    expect(seqOf(make(1, 10))).not.toEqual(a);
  });

  it('hat 400 Index-Paare mit ink != word und nie dasselbe Paar hintereinander', () => {
    for (let seed = 0; seed < 25; seed++) {
      const seq = seqOf(make(1, seed));
      expect(seq).toHaveLength(400);
      seq.forEach(([word, ink], k) => {
        expect([word, ink].every((x) => Number.isInteger(x) && x >= 0 && x <= 3)).toBe(true);
        expect(ink).not.toBe(word);
        const prev = seq[k - 1];
        if (prev) expect(prev[0] === word && prev[1] === ink).toBe(false);
      });
    }
  });

  for (const speed of SPEEDS)
    it(`dur und endsAt (speed ${speed})`, () => {
      const v = farbfalle.view(make(speed), 'p0', NOW);
      expect(v.dur).toBe(scale(20000, speed));
      expect(v.endsAt).toBe(NOW + v.dur);
      expect(v.next).toBe(0);
      expect(v.score).toBe(0);
      expect(Object.keys(v).sort()).toEqual(['dur', 'endsAt', 'next', 'score', 'seq'].sort());
    });
});

describe('farbfalle parseInput', () => {
  it('nimmt {i, c} und {done:true}', () => {
    expect(farbfalle.parseInput({ i: 0, c: 3 })).not.toBeNull();
    expect(farbfalle.parseInput({ done: true })).not.toBeNull();
  });

  it('lehnt Ungueltiges ab', () => {
    for (const bad of [
      { i: -1, c: 0 },
      { i: 1.5, c: 0 },
      { i: 0, c: 4 },
      { i: 0, c: -1 },
      { i: 0, c: 1.5 },
      { i: '0', c: 0 },
      { i: 0 },
      { c: 0 },
      { done: false },
      { done: 'true' },
      { i: Number.NaN, c: 0 },
    ])
      expect(farbfalle.parseInput(bad)).toBeNull();
  });
});

describe('farbfalle Wertung', () => {
  it('richtig +1, falsch -1, naechstes Item rueckt nach', () => {
    const s = answer(make(), 'p0', [true, false, true]);
    const v = farbfalle.view(s, 'p0', NOW);
    expect(v.score).toBe(1);
    expect(v.next).toBe(3);
    expect(farbfalle.view(s, 'p1', NOW).score).toBe(0);
  });

  it('nur i === next zaehlt, sonst dieselbe Referenz', () => {
    const s = make();
    expect(hit(s, 'p0', { i: 1, c: 0 })).toBe(s);
    const t = answer(s, 'p0', [true]);
    expect(hit(t, 'p0', { i: 0, c: 0 })).toBe(t);
    expect(hit(t, 'p0', { i: 5, c: 0 })).toBe(t);
  });

  it('unbekannte pid wird ignoriert', () => {
    const s = make();
    expect(hit(s, 'zz', { i: 0, c: 0 })).toBe(s);
  });

  for (const speed of SPEEDS)
    it(`bei hardEnd - 1 angenommen, bei hardEnd ignoriert (speed ${speed})`, () => {
      const s = make(speed);
      const hardEnd = NOW + scale(20000, speed) + GRACE;
      const ink = (seqOf(s)[0] as [number, number])[1];
      expect(farbfalle.view(hit(s, 'p0', { i: 0, c: ink }, hardEnd - 1), 'p0', NOW).score).toBe(1);
      expect(hit(s, 'p0', { i: 0, c: ink }, hardEnd)).toBe(s);
      expect(farbfalle.done(s, hardEnd - 1)).toBe(false);
      expect(farbfalle.done(s, hardEnd)).toBe(true);
    });

  it('nach done werden Eingaben ignoriert, done selbst ist doppelt wirkungslos', () => {
    const s = hit(answer(make(), 'p0', [true, true]), 'p0', { done: true });
    expect(hit(s, 'p0', { i: 2, c: 0 })).toBe(s);
    expect(hit(s, 'p0', { done: true })).toBe(s);
    expect(farbfalle.view(s, 'p0', NOW).score).toBe(2);
  });

  it('nach dem letzten Item ist der Spieler fertig', () => {
    const s = answer(make(), 'p0', Array<boolean>(400).fill(true));
    expect(farbfalle.view(s, 'p0', NOW)).toMatchObject({ next: 400, score: 400 });
    expect(hit(s, 'p0', { i: 400, c: 0 })).toBe(s);
  });

  it('Labels und result', () => {
    let s = answer(make(), 'p0', Array<boolean>(12).fill(true));
    s = answer(s, 'p1', [false, false, false]);
    s = hit(s, 'p2', { done: true });
    expect(farbfalle.result(s)).toEqual(
      new Map([
        ['p0', 12],
        ['p1', -3],
        ['p2', 0],
      ]),
    );
    expect(farbfalle.label(s, 'p0')).toBe('+12');
    expect(farbfalle.label(s, 'p1')).toBe('−3');
    expect(farbfalle.label(s, 'p2')).toBe('0');
  });

  it('ohne Eingabe kein Eintrag und Label "–"', () => {
    const s = answer(make(), 'p0', [true]);
    expect(farbfalle.result(s).has('p1')).toBe(false);
    expect(farbfalle.label(s, 'p1')).toBe('–');
    expect(farbfalle.label(s, 'zz')).toBe('–');
  });
});

describe('farbfalle Frueh-Ende', () => {
  it('endet, wenn alle Online-Teilnehmer fertig sind', () => {
    const s = hit(make(), 'p0', { done: true });
    const online = new Set(['p0', 'p1']);
    expect(farbfalle.tick(s, NOW + 5, online)).toBe(s);
    const t = farbfalle.tick(hit(s, 'p1', { done: true }), NOW + 6, online);
    expect(farbfalle.done(t, NOW + 6)).toBe(true);
  });

  it('Offline-Spieler blockieren nicht, leeres Online-Set beendet nie', () => {
    const s = hit(make(), 'p0', { done: true });
    expect(farbfalle.done(farbfalle.tick(s, NOW + 5, new Set(['p0'])), NOW + 5)).toBe(true);
    expect(farbfalle.done(farbfalle.tick(s, NOW + 5, new Set()), NOW + 5)).toBe(false);
  });
});
