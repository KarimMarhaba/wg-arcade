import type { Clock } from '../types';
import type { BlitzInput } from './logic';

export type BlitzPhase = 'wait' | 'go' | 'show' | 'early' | 'done';
export type BlitzSend = BlitzInput | { i: number; early: true };

export interface BlitzEvent {
  phase: BlitzPhase;
  i: number;
  ms: number | null;
  filled?: readonly { i: number; ms: number }[];
}

export function record(results: (number | null)[], e: BlitzEvent): void {
  if (e.ms !== null) results[e.i] = e.ms;
  for (const f of e.filled ?? []) results[f.i] = f.ms;
}

export interface BlitzRunOpts {
  waits: readonly number[];
  show: number;
  max: number;
  next: number;
  end: number;
  clock: Clock;
  send(p: BlitzSend): void;
  onPhase(e: BlitzEvent): void;
}

export interface BlitzRun {
  tap(at: number): 'hit' | 'early' | null;
  stop(): void;
}

export function createBlitzRun(o: BlitzRunOpts): BlitzRun {
  const { clock, waits, max } = o;
  const last = waits.length - 1;
  let i = Math.min(o.next, last);
  let reported = o.next;
  let phase: BlitzPhase = 'wait';
  let goAt = 0;
  let stopPhase: (() => void) | undefined;
  let stopEnd: (() => void) | undefined;

  const emit = (p: BlitzPhase, ms: number | null = null, filled?: readonly { i: number; ms: number }[]): void => {
    phase = p;
    o.onPhase({ phase: p, i, ms, filled });
  };
  const later = (ms: number, fn: () => void): void => {
    stopPhase?.();
    stopPhase = clock.after(ms, fn);
  };
  const halt = (): void => {
    stopPhase?.();
    stopEnd?.();
    stopPhase = stopEnd = undefined;
  };
  const finish = (ms: number | null, filled?: readonly { i: number; ms: number }[]): void => {
    halt();
    emit('done', ms, filled);
  };

  function wait(): void {
    emit('wait');
    later(waits[i] ?? 0, () => {
      goAt = clock.now();
      emit('go');
      later(max, () => report(max, false));
    });
  }

  function report(ms: number, early: boolean): void {
    o.send(early ? { i, early: true } : { i, ms });
    reported = i + 1;
    if (i === last && !early) return finish(ms);
    emit(early ? 'early' : 'show', ms);
    later(o.show, () => {
      if (i === last) return finish(ms);
      i++;
      wait();
    });
  }

  if (o.next > last) finish(null);
  else {
    stopEnd = clock.after(Math.max(0, o.end - clock.now()), () => {
      const filled: { i: number; ms: number }[] = [];
      for (let k = reported; k <= last; k++) {
        o.send({ i: k, ms: max });
        filled.push({ i: k, ms: max });
      }
      i = last;
      finish(null, filled);
    });
    wait();
  }

  return {
    tap(at) {
      if (phase === 'wait' || (phase === 'go' && at < goAt)) {
        report(max, true);
        return 'early';
      }
      if (phase !== 'go') return null;
      report(Math.min(max, Math.max(0, Math.round(at - goAt))), false);
      return 'hit';
    },
    stop() {
      halt();
      phase = 'done';
    },
  };
}
