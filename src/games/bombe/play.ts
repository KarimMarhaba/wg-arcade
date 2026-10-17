import type { Clock } from '../types';
import { BOMBE_BALLOONS, BOMBE_CAP, type BombeInput, type BombeRes } from './logic';

export type BombePhase = 'pump' | 'popped' | 'cashed' | 'done';

export interface BombeEvent {
  phase: BombePhase;
  b: number;
  n: number;
  pts: number;
  locked: boolean;
}

export interface BombeRunOpts {
  b: number;
  n: number;
  end: number;
  show: number;
  clock: Clock;
  send(p: BombeInput): void;
  onPhase(e: BombeEvent): void;
}

export interface BombeRun {
  pump(): boolean;
  cash(): boolean;
  sync(m: { n: number; res: readonly BombeRes[] }): void;
  stop(): void;
}

const LAST = BOMBE_BALLOONS - 1;

export function createBombeRun(o: BombeRunOpts): BombeRun {
  let b = o.b;
  let n = o.n;
  let locked = false;
  let over = false;
  let stopShow: (() => void) | undefined;
  let stopEnd: (() => void) | undefined;

  const emit = (phase: BombePhase, pts: number): void => o.onPhase({ phase, b, n, pts, locked });
  const halt = (): void => {
    stopShow?.();
    stopEnd?.();
    stopShow = stopEnd = undefined;
  };
  const finish = (): void => {
    halt();
    over = locked = true;
    emit('done', 0);
  };
  const open = (): boolean => !over && !locked;

  function judge(r: BombeRes): void {
    locked = true;
    emit(r.s === 'pop' ? 'popped' : 'cashed', r.pts);
    stopShow = o.clock.after(o.show, () => {
      stopShow = undefined;
      if (b >= LAST) return finish();
      b++;
      n = 0;
      locked = false;
      emit('pump', 0);
    });
  }

  if (b > LAST) finish();
  else {
    stopEnd = o.clock.after(Math.max(0, o.end - o.clock.now()), finish);
    emit('pump', n * n);
  }

  return {
    pump() {
      if (!open() || n >= BOMBE_CAP) return false;
      n++;
      o.send({ b, n, cash: false });
      emit('pump', n * n);
      return true;
    },
    cash() {
      if (!open()) return false;
      o.send({ b, n, cash: true });
      locked = true;
      emit('pump', n * n);
      return true;
    },
    sync(m) {
      if (over || stopShow) return;
      const verdict = m.res[b];
      if (verdict) return judge(verdict);
      if (open() && m.n > n) {
        n = Math.min(BOMBE_CAP, m.n);
        emit('pump', n * n);
      }
    },
    stop() {
      over = locked = true;
      halt();
    },
  };
}
