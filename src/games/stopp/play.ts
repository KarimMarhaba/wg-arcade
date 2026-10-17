import { clampInt } from '../common';
import type { Clock } from '../types';
import { STOPP_CAP, type StoppInput } from './logic';

export type StoppPhase = 'ready' | 'run' | 'blind' | 'sent' | 'late';

export interface StoppEvent {
  phase: StoppPhase;
  k: number;
  dev: number | null;
}

export interface StoppRunOpts {
  k: number;
  target: number;
  start: number;
  blind: number;
  late: number;
  sent: boolean;
  clock: Clock;
  send(p: StoppInput): void;
  onPhase(e: StoppEvent): void;
}

export interface StoppRun {
  tap(at: number): 'hit' | null;
  stop(): void;
}

export function createStoppRun(o: StoppRunOpts): StoppRun {
  let phase: StoppPhase = 'ready';
  let closed = false;
  let stops: (() => void)[] = [];

  const emit = (p: StoppPhase, dev: number | null = null): void => {
    phase = p;
    o.onPhase({ phase: p, k: o.k, dev });
  };
  const halt = (): void => {
    for (const stop of stops) stop();
    stops = [];
  };

  if (o.sent) {
    closed = true;
    emit('sent');
  } else {
    const stages: [number, StoppPhase][] = [
      [o.start, 'run'],
      [o.start + o.blind, 'blind'],
      [o.start + o.target + o.late, 'late'],
    ];
    const now = o.clock.now();
    const reached = stages.filter(([at]) => at <= now).at(-1);
    emit(reached ? reached[1] : 'ready');
    for (const [at, p] of stages)
      if (at > now) stops.push(o.clock.after(at - now, () => emit(p)));
  }

  return {
    tap(at) {
      if (closed || (phase !== 'run' && phase !== 'blind') || at < o.start) return null;
      const devMs = clampInt(Math.round(at - o.start - o.target), -STOPP_CAP, STOPP_CAP);
      halt();
      closed = true;
      o.send({ k: o.k, devMs });
      emit('sent', devMs);
      return 'hit';
    },
    stop() {
      closed = true;
      halt();
    },
  };
}
