import { BLITZ_MAX, BLITZ_SHOW, BLITZ_WAIT_MAX, BLITZ_WAIT_MIN, GRACE, scale } from '../../engine/durations';
import { int, mulberry32 } from '../../engine/prng';
import { allDone, isInt, isRecord } from '../common';
import type { GameDef } from '../types';

const TRIES = 3;

export interface BlitzState {
  pids: string[];
  waits: number[];
  show: number;
  dur: number;
  endsAt: number;
  hardEnd: number;
  times: Record<string, (number | null)[]>;
  finished: boolean;
}

export interface BlitzInput {
  i: number;
  ms: number;
}

export interface BlitzView {
  waits: number[];
  show: number;
  max: number;
  mine: (number | null)[];
  progress: Record<string, number>;
  endsAt: number;
  dur: number;
}

const taken = (s: BlitzState, pid: string): number => (s.times[pid] ?? []).filter((x) => x !== null).length;
const sum = (s: BlitzState, pid: string): number =>
  (s.times[pid] ?? []).reduce<number>((a, x) => a + (x ?? BLITZ_MAX), 0);

export const blitz: GameDef<BlitzState, BlitzInput, BlitzView> = {
  id: 'blitz',
  title: 'BLITZ',
  rule: 'Sobald der Bildschirm leuchtet: so schnell wie möglich tippen. Zu früh zählt 1000 ms.',
  accent: 'lime',
  init(players, seed, now, ctx) {
    const rng = mulberry32(seed);
    const waits = Array.from({ length: TRIES }, () =>
      int(rng, scale(BLITZ_WAIT_MIN, ctx.speed), scale(BLITZ_WAIT_MAX, ctx.speed)),
    );
    const show = scale(BLITZ_SHOW, ctx.speed);
    const dur = waits.reduce((a, b) => a + b, 0) + TRIES * (show + BLITZ_MAX);
    return {
      pids: players.map((p) => p.pid),
      waits,
      show,
      dur,
      endsAt: now + dur,
      hardEnd: now + dur + GRACE,
      times: Object.fromEntries(players.map((p) => [p.pid, Array<number | null>(TRIES).fill(null)])),
      finished: false,
    };
  },
  parseInput(raw) {
    if (!isRecord(raw) || !isInt(raw.i) || raw.i < 0 || raw.i >= TRIES) return null;
    if (raw.early === true) return { i: raw.i, ms: BLITZ_MAX };
    if (typeof raw.ms !== 'number' || !Number.isFinite(raw.ms)) return null;
    return { i: raw.i, ms: Math.min(BLITZ_MAX, Math.max(0, Math.round(raw.ms))) };
  },
  input(s, pid, i, now) {
    const mine = s.times[pid];
    if (!mine || s.finished || now >= s.hardEnd || mine[i.i] !== null) return s;
    return { ...s, times: { ...s.times, [pid]: mine.map((x, k) => (k === i.i ? i.ms : x)) } };
  },
  tick: (s, _now, online) =>
    !s.finished && allDone(s.pids, online, (pid) => taken(s, pid) === TRIES) ? { ...s, finished: true } : s,
  done: (s, now) => s.finished || now >= s.hardEnd,
  result: (s) => new Map(s.pids.filter((pid) => taken(s, pid) > 0).map((pid) => [pid, -sum(s, pid)])),
  label: (s, pid) => (taken(s, pid) > 0 ? `${sum(s, pid)} ms` : '–'),
  view: (s, pid) => ({
    waits: s.waits,
    show: s.show,
    max: BLITZ_MAX,
    mine: s.times[pid] ?? Array<number | null>(TRIES).fill(null),
    progress: Object.fromEntries(s.pids.map((p) => [p, taken(s, p)])),
    endsAt: s.endsAt,
    dur: s.dur,
  }),
};
