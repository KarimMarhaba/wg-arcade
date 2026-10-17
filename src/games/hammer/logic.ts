import { GRACE, HAMMER, scale } from '../../engine/durations';
import { allDone, isInt, isRecord } from '../common';
import type { GameDef } from '../types';

export const HAMMER_CAP = 200;

export interface HammerState {
  pids: string[];
  dur: number;
  endsAt: number;
  hardEnd: number;
  counts: Record<string, number>;
  final: Record<string, true>;
  finished: boolean;
}

export interface HammerInput {
  n: number;
  final: boolean;
}

export interface HammerView {
  dur: number;
  endsAt: number;
  mine: number;
  bars: { pid: string; n: number }[];
}

export const hammer: GameDef<HammerState, HammerInput, HammerView> = {
  id: 'hammer',
  title: 'HAMMER',
  rule: 'Hämmere in der Zeit so oft wie möglich auf den Knopf.',
  accent: 'hot',
  init(players, _seed, now, ctx) {
    const dur = scale(HAMMER, ctx.speed);
    return {
      pids: players.map((p) => p.pid),
      dur,
      endsAt: now + dur,
      hardEnd: now + dur + GRACE,
      counts: {},
      final: {},
      finished: false,
    };
  },
  parseInput(raw) {
    if (!isRecord(raw) || !isInt(raw.n) || raw.n < 0) return null;
    return { n: Math.min(HAMMER_CAP, raw.n), final: raw.final === true };
  },
  input(s, pid, i, now) {
    if (!s.pids.includes(pid) || s.finished || now >= s.hardEnd || pid in s.final) return s;
    const prev = s.counts[pid];
    const n = Math.max(prev ?? 0, i.n);
    if (n === prev && !i.final) return s;
    return { ...s, counts: { ...s.counts, [pid]: n }, final: i.final ? { ...s.final, [pid]: true } : s.final };
  },
  tick: (s, _now, online) =>
    !s.finished && allDone(s.pids, online, (pid) => pid in s.final) ? { ...s, finished: true } : s,
  done: (s, now) => s.finished || now >= s.hardEnd,
  result: (s) => new Map(Object.entries(s.counts)),
  label(s, pid) {
    const n = s.counts[pid];
    return n === undefined ? '–' : `${n} ${n === 1 ? 'Tap' : 'Taps'}`;
  },
  view: (s, pid) => ({
    dur: s.dur,
    endsAt: s.endsAt,
    mine: s.counts[pid] ?? 0,
    bars: s.pids.map((p) => ({ pid: p, n: s.counts[p] ?? 0 })),
  }),
};
