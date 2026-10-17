interface Timer {
  at: number;
  every: number | undefined;
  fn: () => void;
}

const MAX_RUNS = 100_000;

export function fakeClock() {
  let t = 0;
  let seq = 0;
  const timers = new Map<number, Timer>();
  const add = (ms: number, every: number | undefined, fn: () => void): (() => void) => {
    const id = ++seq;
    timers.set(id, { at: t + ms, every, fn });
    return () => void timers.delete(id);
  };
  return {
    now: (): number => t,
    every: (ms: number, fn: () => void) => add(ms, ms, fn),
    after: (ms: number, fn: () => void) => add(ms, undefined, fn),
    pending: (): number => timers.size,
    advance(ms: number): void {
      const target = t + ms;
      for (let runs = 0; ; runs++) {
        if (runs > MAX_RUNS) throw new Error('fakeClock: zu viele Läufe');
        let next: [number, Timer] | undefined;
        for (const e of timers) if (e[1].at <= target && (!next || e[1].at < next[1].at)) next = e;
        if (!next) break;
        const [id, timer] = next;
        t = timer.at;
        if (timer.every === undefined) timers.delete(id);
        else timer.at += timer.every;
        timer.fn();
      }
      t = target;
    },
  };
}

export type FakeClock = ReturnType<typeof fakeClock>;
