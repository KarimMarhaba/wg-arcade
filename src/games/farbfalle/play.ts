import type { Clock } from '../types';
import type { FarbfalleInput, FfPair } from './logic';

export interface FfStep {
  next: number;
  score: number;
}

export function answerStep(seq: readonly FfPair[], s: FfStep, c: number) {
  const item = seq[s.next];
  if (!item) return null;
  const ok = c === item[1];
  return { s: { next: s.next + 1, score: s.score + (ok ? 1 : -1) }, send: { i: s.next, c }, ok };
}

export const fmtScore = (n: number): string => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');

export interface FfRunOpts {
  seq: readonly FfPair[];
  from: FfStep;
  end: number;
  clock: Clock;
  send(p: FarbfalleInput): void;
  onStep(r: { s: FfStep; ok: boolean }): void;
  onDone(): void;
}

export interface FfRun {
  answer(c: number): boolean | null;
  stop(): void;
}

export function createFarbfalleRun(o: FfRunOpts): FfRun {
  let step = o.from;
  let over = false;
  let stopEnd: (() => void) | undefined;

  const finish = (): void => {
    if (over) return;
    over = true;
    stopEnd?.();
    o.send({ done: true });
    o.onDone();
  };
  stopEnd = o.clock.after(Math.max(0, o.end - o.clock.now()), finish);

  return {
    answer(c) {
      const r = over ? null : answerStep(o.seq, step, c);
      if (!r) return null;
      step = r.s;
      o.send(r.send);
      o.onStep({ s: r.s, ok: r.ok });
      if (step.next >= o.seq.length) finish();
      return r.ok;
    },
    stop() {
      over = true;
      stopEnd?.();
    },
  };
}
