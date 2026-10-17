import type { Clock } from '../types';
import { HAMMER_CAP, type HammerInput } from './logic';

const SEND_EVERY = 200;

export interface HammerRunOpts {
  from: number;
  end: number;
  clock: Clock;
  send(p: HammerInput): void;
  onCount(n: number): void;
  onDone(): void;
}

export interface HammerRun {
  tap(): boolean;
  stop(): void;
}

export function createHammerRun(o: HammerRunOpts): HammerRun {
  let count = o.from;
  let sent = o.from;
  let over = false;
  let stopEvery: (() => void) | undefined;
  const stopEnd = o.clock.after(Math.max(0, o.end - o.clock.now()), () => {
    stopEvery?.();
    over = true;
    o.send({ n: count, final: true });
    o.onDone();
  });
  stopEvery = o.clock.every(SEND_EVERY, () => {
    if (count === sent) return;
    sent = count;
    o.send({ n: count, final: false });
  });

  return {
    tap() {
      if (over || count >= HAMMER_CAP) return false;
      count++;
      o.onCount(count);
      return true;
    },
    stop() {
      over = true;
      stopEnd();
      stopEvery?.();
    },
  };
}
