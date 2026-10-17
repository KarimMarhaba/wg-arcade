import type { Clock } from '../types';
import type { BlitzInput } from './logic';

export type BlitzPhase = 'wait' | 'go' | 'show' | 'early' | 'done';
export type BlitzSend = BlitzInput | { i: number; early: true };

export interface BlitzEvent {
  phase: BlitzPhase;
  i: number;
  ms: number | null;
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

  const emit = (p: BlitzPhase, ms: number | null = null): void => {
    phase = p;
    o.onPhase({ phase: p, i, ms });
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
  const finish = (ms: number | null): void => {
    halt();
    emit('done', ms);
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
      for (let k = reported; k <= last; k++) o.send({ i: k, ms: max });
      i = last;
      finish(null);
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
