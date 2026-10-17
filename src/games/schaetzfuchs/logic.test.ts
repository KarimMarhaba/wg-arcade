import { describe, expect, it } from 'vitest';
import { GRACE, scale } from '../../engine/durations';
import { schaetzfuchs, type SchaetzfuchsState, type SchaetzfuchsView } from './logic';
import { QUESTIONS } from './questions';

const PLAYERS = [0, 1, 2].map((i) => ({ pid: `p${i}`, name: `P${i}`, color: i }));
const NOW = 4000;
const SPEEDS = [1, 10];
const MARK = 7654321;
const make = (speed = 1, seed = 4, players = PLAYERS): SchaetzfuchsState =>
  schaetzfuchs.init(players, seed, NOW, { speed, drinking: false });
const guess = (s: SchaetzfuchsState, pid: string, g: unknown, now = NOW): SchaetzfuchsState => {
  const i = schaetzfuchs.parseInput({ guess: g });
  if (i === null) throw new Error('ungueltig');
  return schaetzfuchs.input(s, pid, i, now);
};
const view = (s: SchaetzfuchsState, pid: string, now = NOW): SchaetzfuchsView => schaetzfuchs.view(s, pid, now);
const ask = (s: SchaetzfuchsState, pid: string, now = NOW) =>
  view(s, pid, now) as Extract<SchaetzfuchsView, { phase: 'ask' }>;
const answerOf = (s: SchaetzfuchsState): number => {
  const q = view(s, 'p0').q;
  const hit = QUESTIONS.find((x) => x.q === q);
  if (!hit) throw new Error('Frage nicht in der Bank');
  return hit.a;
};
const askEnd = (speed: number) => NOW + scale(20000, speed);
const reveal = (s: SchaetzfuchsState): SchaetzfuchsState => schaetzfuchs.tick(s, s.hardEnd, new Set());

describe('schaetzfuchs Frage', () => {
  it('ist je Seed deterministisch und fuer alle gleich', () => {
    expect(view(make(), 'p0').q).toBe(view(make(), 'p0').q);
    expect(view(make(), 'p2').q).toBe(view(make(), 'p0').q);
    const qs = new Set(Array.from({ length: 30 }, (_, seed) => view(make(1, seed), 'p0').q));
    expect(qs.size).toBeGreaterThan(5);
  });

  for (const speed of SPEEDS)
    it(`Ask-Sicht: exakt die vorgesehenen Felder (speed ${speed})`, () => {
      const s = guess(make(speed), 'p0', MARK);
      const v = view(s, 'p0');
      expect(Object.keys(v).sort()).toEqual(['dur', 'endsAt', 'guessed', 'myGuess', 'phase', 'q', 'total', 'unit'].sort());
      expect(v).toMatchObject({ phase: 'ask', dur: scale(20000, speed), endsAt: askEnd(speed), myGuess: MARK, guessed: 1, total: 3 });
    });
});

describe('schaetzfuchs parseInput', () => {
  it('nimmt endliche Zahlen in 0..1e12', () => {
    for (const g of [0, 1, 42.5, 1e12]) expect(schaetzfuchs.parseInput({ guess: g })).not.toBeNull();
  });

  it('lehnt Ungueltiges ab', () => {
    for (const g of [Number.NaN, -1, 1e12 + 1, Infinity, -Infinity, '42', null, undefined, [], {}, true])
      expect(schaetzfuchs.parseInput({ guess: g })).toBeNull();
    expect(schaetzfuchs.parseInput({})).toBeNull();
  });
});

describe('schaetzfuchs ask', () => {
  it('liefert keine Antwort und keinen fremden Tipp', () => {
    const s = guess(make(), 'p0', MARK);
    const other = JSON.stringify(view(s, 'p1'));
    expect(other).not.toContain(String(MARK));
    expect(Object.keys(view(s, 'p1'))).not.toContain('answer');
    expect(view(s, 'p1')).toMatchObject({ myGuess: null, guessed: 1, total: 3 });
    expect(view(s, 'zz')).toMatchObject({ myGuess: null, guessed: 1 });
  });

  it('nur ein Tipp, Wiederholung liefert dieselbe Referenz', () => {
    const s = guess(make(), 'p0', 10);
    expect(guess(s, 'p0', 20)).toBe(s);
    expect(ask(s, 'p0').myGuess).toBe(10);
  });

  it('unbekannte pid wird ignoriert', () => {
    const s = make();
    expect(guess(s, 'zz', 5)).toBe(s);
  });

  for (const speed of SPEEDS)
    it(`Tipps bis askEnd + GRACE - 1 (speed ${speed})`, () => {
      const s = make(speed);
      const hardEnd = askEnd(speed) + GRACE;
      expect(ask(guess(s, 'p0', 5, hardEnd - 1), 'p0').myGuess).toBe(5);
      expect(guess(s, 'p0', 5, hardEnd)).toBe(s);
    });

  it('nach der Aufloesung werden Tipps ignoriert', () => {
    const r = reveal(make());
    expect(guess(r, 'p0', 5, NOW + 20)).toBe(r);
  });
});

describe('schaetzfuchs Aufloesung', () => {
  for (const speed of SPEEDS)
    it(`Timeout bei askEnd + GRACE (speed ${speed})`, () => {
      const s = make(speed);
      const hardEnd = askEnd(speed) + GRACE;
      expect(schaetzfuchs.tick(s, hardEnd - 1, new Set())).toBe(s);
      const r = schaetzfuchs.tick(s, hardEnd, new Set());
      expect(view(r, 'p0').phase).toBe('reveal');
      expect(schaetzfuchs.done(r, hardEnd + scale(5000, speed) - 1)).toBe(false);
      expect(schaetzfuchs.done(r, hardEnd + scale(5000, speed))).toBe(true);
    });

  it('frueh, sobald alle Online-Teilnehmer getippt haben', () => {
    const s = guess(guess(make(), 'p0', 1), 'p1', 2);
    expect(schaetzfuchs.tick(s, NOW + 5, new Set(['p0', 'p1', 'p2']))).toBe(s);
    expect(view(schaetzfuchs.tick(s, NOW + 5, new Set(['p0', 'p1'])), 'p0').phase).toBe('reveal');
    expect(schaetzfuchs.tick(s, NOW + 5, new Set())).toBe(s);
  });

  it('done erst ab revealEnd, revealEnd = Tick-Zeit + skalierte Dauer', () => {
    const s = guess(make(10), 'p0', 1);
    const r = schaetzfuchs.tick(s, NOW + 5, new Set(['p0']));
    expect(view(r, 'p0').endsAt).toBe(NOW + 5 + scale(5000, 10));
    expect(schaetzfuchs.done(r, NOW + 5)).toBe(false);
    expect(schaetzfuchs.done(make(), NOW + 100)).toBe(false);
    expect(schaetzfuchs.tick(r, NOW + 6, new Set(['p0']))).toBe(r);
  });

  it('Reveal-Sicht: exakte Felder, Antwort, Tipps nach Fehler sortiert', () => {
    const a = answerOf(make());
    let s = make(1, 4, [...PLAYERS, { pid: 'p3', name: 'P3', color: 3 }]);
    s = guess(guess(guess(s, 'p0', a * 3), 'p2', a), 'p3', a * 3);
    const v = view(reveal(s), 'p1') as Extract<SchaetzfuchsView, { phase: 'reveal' }>;
    expect(Object.keys(v).sort()).toEqual(['answer', 'endsAt', 'guesses', 'phase', 'q', 'unit'].sort());
    expect(v.answer).toBe(a);
    expect(v.guesses.map((g) => g.pid)).toEqual(['p2', 'p0', 'p3', 'p1']);
    expect(v.guesses).toEqual([
      { pid: 'p2', guess: a, errPct: 0 },
      { pid: 'p0', guess: a * 3, errPct: 200 },
      { pid: 'p3', guess: a * 3, errPct: 200 },
      { pid: 'p1', guess: null, errPct: null },
    ]);
  });
});

describe('schaetzfuchs Wertung', () => {
  it('result = -relativer Fehler, ohne Tipp kein Eintrag', () => {
    const a = answerOf(make());
    const s = guess(guess(make(), 'p0', a), 'p1', a * 2);
    const r = schaetzfuchs.result(s);
    expect(r.get('p0')).toBe(0);
    expect(Object.is(r.get('p0'), 0)).toBe(true);
    expect(r.get('p1')).toBe(-1);
    expect(r.has('p2')).toBe(false);
  });

  it('Label ist der gerundete Prozentfehler', () => {
    const a = answerOf(make());
    const s = guess(guess(guess(make(), 'p0', a), 'p1', a * 2), 'p2', a * 1.08);
    expect(schaetzfuchs.label(s, 'p0')).toBe('±0 %');
    expect(schaetzfuchs.label(s, 'p1')).toBe('±100 %');
    expect(schaetzfuchs.label(s, 'p2')).toBe('±8 %');
  });

  it('ohne Tipp Label "–"', () => {
    const s = make();
    expect(schaetzfuchs.label(s, 'p0')).toBe('–');
    expect(schaetzfuchs.label(s, 'zz')).toBe('–');
  });
});
