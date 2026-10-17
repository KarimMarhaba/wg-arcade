import { describe, expect, it } from 'vitest';
import { fakeClock } from '../../engine/fakeclock';
import type { FarbfalleInput, FfPair } from './logic';
import { answerStep, createFarbfalleRun, fmtScore } from './play';

const SEQ: FfPair[] = [
  [0, 1],
  [2, 3],
  [1, 0],
  [3, 2],
];

describe('answerStep', () => {
  it('richtig: +1, next+1, Payload {i, c}', () => {
    expect(answerStep(SEQ, { next: 0, score: 0 }, 1)).toEqual({
      s: { next: 1, score: 1 },
      send: { i: 0, c: 1 },
      ok: true,
    });
  });

  it('falsch (auch die Wortfarbe): -1', () => {
    expect(answerStep(SEQ, { next: 0, score: 0 }, 0)).toEqual({
      s: { next: 1, score: -1 },
      send: { i: 0, c: 0 },
      ok: false,
    });
  });

  it('nutzt den Stand und kann negativ werden', () => {
    expect(answerStep(SEQ, { next: 1, score: 0 }, 0)?.s).toEqual({ next: 2, score: -1 });
    expect(answerStep(SEQ, { next: 2, score: 5 }, 0)?.send).toEqual({ i: 2, c: 0 });
  });

  it('am Ende der Folge: null', () => {
    expect(answerStep(SEQ, { next: 4, score: 2 }, 1)).toBeNull();
  });
});

describe('fmtScore', () => {
  it('formatiert wie das Label des Hosts', () => {
    expect(fmtScore(12)).toBe('+12');
    expect(fmtScore(-3)).toBe('−3');
    expect(fmtScore(0)).toBe('0');
  });
});

function setup(o: { next?: number; score?: number; end?: number } = {}) {
  const clock = fakeClock();
  const sent: FarbfalleInput[] = [];
  const steps: { next: number; score: number; ok: boolean }[] = [];
  let done = 0;
  const run = createFarbfalleRun({
    seq: SEQ,
    from: { next: o.next ?? 0, score: o.score ?? 0 },
    end: o.end ?? 2_000,
    clock,
    send: (p) => sent.push(p),
    onStep: (r) => steps.push({ ...r.s, ok: r.ok }),
    onDone: () => void done++,
  });
  return { clock, sent, steps, run, done: () => done };
}

describe('Farbfalle-Lauf', () => {
  it('läuft lokal weiter, sendet je Antwort {i, c} und meldet den Schritt', () => {
    const { run, sent, steps } = setup();
    expect(run.answer(1)).toBe(true);
    expect(run.answer(0)).toBe(false);
    expect(sent).toEqual([{ i: 0, c: 1 }, { i: 1, c: 0 }]);
    expect(steps).toEqual([
      { next: 1, score: 1, ok: true },
      { next: 2, score: 0, ok: false },
    ]);
  });

  it('sendet am lokalen Ende {done:true} genau einmal und ignoriert danach Antworten', () => {
    const { clock, sent, run, done } = setup();
    run.answer(1);
    clock.advance(1_999);
    expect(done()).toBe(0);
    clock.advance(1);
    expect(done()).toBe(1);
    expect(sent).toEqual([{ i: 0, c: 1 }, { done: true }]);
    expect(run.answer(3)).toBeNull();
    clock.advance(10_000);
    expect(sent).toHaveLength(2);
    expect(clock.pending()).toBe(0);
  });

  it('meldet done auch ohne jede Antwort', () => {
    const { clock, sent } = setup();
    clock.advance(2_000);
    expect(sent).toEqual([{ done: true }]);
  });

  it('endet sofort mit done, wenn die Folge aufgebraucht ist', () => {
    const { sent, run, done } = setup();
    for (const [, ink] of SEQ) run.answer(ink);
    expect(done()).toBe(1);
    expect(sent.at(-1)).toEqual({ done: true });
    expect(run.answer(0)).toBeNull();
  });

  it('Wiedereinstieg: setzt beim Stand der Sicht fort', () => {
    const { run, sent, steps } = setup({ next: 2, score: 1 });
    run.answer(0);
    expect(sent).toEqual([{ i: 2, c: 0 }]);
    expect(steps).toEqual([{ next: 3, score: 2, ok: true }]);
  });

  it('stop() beendet das Ende ohne done', () => {
    const { clock, sent, run } = setup();
    run.stop();
    expect(clock.pending()).toBe(0);
    clock.advance(5_000);
    expect(sent).toEqual([]);
    expect(run.answer(1)).toBeNull();
  });
});
