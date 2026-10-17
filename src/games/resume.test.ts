import { describe, expect, it } from 'vitest';
import type { BlitzView } from './blitz/logic';
import type { FarbfalleView } from './farbfalle/logic';
import type { HammerView } from './hammer/logic';
import { resumeBlitz, resumeFarbfalle, resumeHammer, resumeSchaetzfuchs } from './resume';
import type { SchaetzfuchsView } from './schaetzfuchs/logic';

const OFFSET = 7_000;
const toLocal = (t: number): number => t + OFFSET;
const MOUNT = 50_000;
const ENDS = 31_000;

const blitz = (mine: (number | null)[]): BlitzView => ({
  waits: [200, 300, 400],
  show: 90,
  max: 1000,
  mine,
  progress: {},
  endsAt: ENDS,
  dur: 4_000,
});
const hammer = (mine: number): HammerView => ({ dur: 800, endsAt: ENDS, mine, bars: [] });
const farbfalle = (next: number, score: number): FarbfalleView => ({ dur: 2_000, endsAt: ENDS, seq: [], next, score });
const ask = (myGuess: number | null): Extract<SchaetzfuchsView, { phase: 'ask' }> => ({
  phase: 'ask',
  q: 'Q?',
  unit: 'm',
  endsAt: ENDS,
  dur: 2_000,
  myGuess,
  guessed: 0,
  total: 1,
});

describe('Wiedereinstieg: Erst-Mount', () => {
  it('blitz: Ende = Mount + dur, Start beim ersten Versuch', () => {
    expect(resumeBlitz(blitz([null, null, null]), MOUNT, toLocal)).toEqual({ end: MOUNT + 4_000, next: 0 });
  });

  it('hammer: Ende = Mount + dur, Zähler 0', () => {
    expect(resumeHammer(hammer(0), MOUNT, toLocal)).toEqual({ end: MOUNT + 800, count: 0 });
  });

  it('farbfalle: Ende = Mount + dur, Start bei 0', () => {
    expect(resumeFarbfalle(farbfalle(0, 0), MOUNT, toLocal)).toEqual({ end: MOUNT + 2_000, next: 0, score: 0 });
  });

  it('schaetzfuchs: Ende = Mount + dur, kein Tipp', () => {
    expect(resumeSchaetzfuchs(ask(null), MOUNT, toLocal)).toEqual({ end: MOUNT + 2_000, guess: null });
  });
});

describe('Wiedereinstieg: Mount mit Fortschritt in der Sicht', () => {
  it('blitz: Ende = toLocal(endsAt), weiter beim ersten null', () => {
    expect(resumeBlitz(blitz([120, null, null]), MOUNT, toLocal)).toEqual({ end: ENDS + OFFSET, next: 1 });
    expect(resumeBlitz(blitz([120, 1000, null]), MOUNT, toLocal)).toEqual({ end: ENDS + OFFSET, next: 2 });
    expect(resumeBlitz(blitz([120, 1000, 90]), MOUNT, toLocal)).toEqual({ end: ENDS + OFFSET, next: 3 });
  });

  it('hammer: Ende = toLocal(endsAt), Zähler aus der Sicht', () => {
    expect(resumeHammer(hammer(12), MOUNT, toLocal)).toEqual({ end: ENDS + OFFSET, count: 12 });
  });

  it('farbfalle: Ende = toLocal(endsAt), Stand aus der Sicht', () => {
    expect(resumeFarbfalle(farbfalle(9, 5), MOUNT, toLocal)).toEqual({ end: ENDS + OFFSET, next: 9, score: 5 });
  });

  it('schaetzfuchs: Ende = toLocal(endsAt), Tipp aus der Sicht (auch 0)', () => {
    expect(resumeSchaetzfuchs(ask(2962), MOUNT, toLocal)).toEqual({ end: ENDS + OFFSET, guess: 2962 });
    expect(resumeSchaetzfuchs(ask(0), MOUNT, toLocal)).toEqual({ end: ENDS + OFFSET, guess: 0 });
  });
});
