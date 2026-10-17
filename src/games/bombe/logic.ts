import { BOMBE, BOMBE_SHOW, GRACE, scale } from '../../engine/durations';
import { int, mulberry32 } from '../../engine/prng';
import { allDone, isInt, isRecord } from '../common';
import type { GameDef } from '../types';

export const BOMBE_BALLOONS = 3;
export const BOMBE_CAP = 40;
const BURST_MIN = 4;
const BURST_MAX = 30;

export interface BombeRes {
  s: 'cash' | 'pop';
  pts: number;
}

export interface BombeState {
  pids: string[];
  dur: number;
  endsAt: number;
  hardEnd: number;
  show: number;
  burst: Record<string, number[]>;
  pump: Record<string, number>;
  res: Record<string, BombeRes[]>;
  finished: boolean;
}

export interface BombeInput {
  b: number;
  n: number;
  cash: boolean;
}

export interface BombeLive {
  pid: string;
  b: number;
  s: 'pumpt' | 'kassiert' | 'geplatzt';
}

export interface BombeView {
  dur: number;
  endsAt: number;
  show: number;
  mine: { b: number; n: number; res: BombeRes[] };
  live: BombeLive[];
}

const done = (s: BombeState, pid: string): number => s.res[pid]?.length ?? 0;
const score = (s: BombeState, pid: string): number => (s.res[pid] ?? []).reduce((a, r) => a + r.pts, 0);
const ballons = Array.from({ length: BOMBE_BALLOONS }, (_, b) => b);

function liveOf(s: BombeState, pid: string): BombeLive[] {
  const res = s.res[pid] ?? [];
  return ballons.flatMap((b): BombeLive[] => {
    const r = res[b];
    if (r) return [{ pid, b, s: r.s === 'cash' ? 'kassiert' : 'geplatzt' }];
    return b === res.length ? [{ pid, b, s: 'pumpt' }] : [];
  });
}

export const bombe: GameDef<BombeState, BombeInput, BombeView> = {
  id: 'bombe',
  title: 'BOMBE',
  rule: 'Pumpe den Ballon auf und kassiere, bevor er platzt. Punkte: gepumpt zum Quadrat.',
  accent: 'orange',
  init(players, seed, now, ctx) {
    const rng = mulberry32(seed);
    const dur = scale(BOMBE, ctx.speed);
    return {
      pids: players.map((p) => p.pid),
      dur,
      endsAt: now + dur,
      hardEnd: now + dur + GRACE,
      show: scale(BOMBE_SHOW, ctx.speed),
      burst: Object.fromEntries(players.map((p) => [p.pid, ballons.map(() => int(rng, BURST_MIN, BURST_MAX))])),
      pump: {},
      res: {},
      finished: false,
    };
  },
  parseInput(raw) {
    if (!isRecord(raw) || !isInt(raw.b) || raw.b < 0 || raw.b >= BOMBE_BALLOONS) return null;
    if (!isInt(raw.n) || raw.n < 0) return null;
    return { b: raw.b, n: Math.min(BOMBE_CAP, raw.n), cash: raw.cash === true };
  },
  input(s, pid, i, now) {
    if (!s.pids.includes(pid) || s.finished || now >= s.hardEnd || i.b !== done(s, pid)) return s;
    const known = pid in s.res;
    const n = Math.max(s.pump[pid] ?? 0, i.n);
    const popped = n >= ((s.burst[pid] as number[])[i.b] as number);
    if (!popped && !i.cash && known && n === s.pump[pid]) return s;
    const res = s.res[pid] ?? [];
    if (!popped && !i.cash) return { ...s, pump: { ...s.pump, [pid]: n }, res: { ...s.res, [pid]: res } };
    const verdict: BombeRes = popped ? { s: 'pop', pts: 0 } : { s: 'cash', pts: n * n };
    return { ...s, pump: { ...s.pump, [pid]: 0 }, res: { ...s.res, [pid]: [...res, verdict] } };
  },
  tick: (s, _now, online) =>
    !s.finished && allDone(s.pids, online, (pid) => done(s, pid) >= BOMBE_BALLOONS) ? { ...s, finished: true } : s,
  done: (s, now) => s.finished || now >= s.hardEnd,
  result: (s) => new Map(s.pids.filter((pid) => pid in s.res).map((pid) => [pid, score(s, pid)] as [string, number])),
  label: (s, pid) => (pid in s.res ? `${score(s, pid)} Pkt` : '–'),
  view: (s, pid) => ({
    dur: s.dur,
    endsAt: s.endsAt,
    show: s.show,
    mine: { b: done(s, pid), n: s.pump[pid] ?? 0, res: s.res[pid] ?? [] },
    live: s.pids.flatMap((p) => liveOf(s, p)),
  }),
};
