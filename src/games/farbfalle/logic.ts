import { FARBFALLE, GRACE, scale } from '../../engine/durations';
import { mulberry32, pick } from '../../engine/prng';
import { allDone, isInt, isRecord } from '../common';
import { FF_COLORS } from '../colors';
import type { GameDef } from '../types';

export const FF_LEN = 400;

export type FfPair = [word: number, ink: number];

const PAIRS: FfPair[] = FF_COLORS.flatMap((_, word) =>
  FF_COLORS.flatMap((__, ink): FfPair[] => (ink === word ? [] : [[word, ink]])),
);

export interface FarbfalleState {
  pids: string[];
  seq: FfPair[];
  dur: number;
  endsAt: number;
  hardEnd: number;
  next: Record<string, number>;
  score: Record<string, number>;
  over: Record<string, true>;
  finished: boolean;
}

export type FarbfalleInput = { i: number; c: number } | { done: true };

export interface FarbfalleView {
  dur: number;
  endsAt: number;
  seq: FfPair[];
  next: number;
  score: number;
}

function makeSeq(seed: number): FfPair[] {
  const rng = mulberry32(seed);
  const seq: FfPair[] = [];
  while (seq.length < FF_LEN) {
    const prev = seq[seq.length - 1];
    seq.push(pick(rng, prev ? PAIRS.filter((p) => p !== prev) : PAIRS));
  }
  return seq;
}

const over = (s: FarbfalleState, pid: string): boolean => pid in s.over || (s.next[pid] ?? 0) >= FF_LEN;

export const farbfalle: GameDef<FarbfalleState, FarbfalleInput, FarbfalleView> = {
  id: 'farbfalle',
  title: 'FARBFALLE',
  rule: 'Tippe die Farbe der Tinte, nicht das Wort.',
  accent: 'cyan',
  init(players, seed, now, ctx) {
    const dur = scale(FARBFALLE, ctx.speed);
    return {
      pids: players.map((p) => p.pid),
      seq: makeSeq(seed),
      dur,
      endsAt: now + dur,
      hardEnd: now + dur + GRACE,
      next: {},
      score: {},
      over: {},
      finished: false,
    };
  },
  parseInput(raw) {
    if (!isRecord(raw)) return null;
    if (raw.done === true) return { done: true };
    if (!isInt(raw.i) || raw.i < 0 || !isInt(raw.c) || raw.c < 0 || raw.c >= FF_COLORS.length) return null;
    return { i: raw.i, c: raw.c };
  },
  input(s, pid, i, now) {
    if (!s.pids.includes(pid) || s.finished || now >= s.hardEnd || over(s, pid)) return s;
    if ('done' in i) return { ...s, score: { ...s.score, [pid]: s.score[pid] ?? 0 }, over: { ...s.over, [pid]: true } };
    const next = s.next[pid] ?? 0;
    const item = s.seq[next];
    if (i.i !== next || !item) return s;
    return {
      ...s,
      next: { ...s.next, [pid]: next + 1 },
      score: { ...s.score, [pid]: (s.score[pid] ?? 0) + (i.c === item[1] ? 1 : -1) },
    };
  },
  tick: (s, _now, online) =>
    !s.finished && allDone(s.pids, online, (pid) => over(s, pid)) ? { ...s, finished: true } : s,
  done: (s, now) => s.finished || now >= s.hardEnd,
  result: (s) => new Map(Object.entries(s.score)),
  label(s, pid) {
    const v = s.score[pid];
    if (v === undefined) return '–';
    return v > 0 ? `+${v}` : v < 0 ? `−${-v}` : '0';
  },
  view: (s, pid) => ({
    dur: s.dur,
    endsAt: s.endsAt,
    seq: s.seq,
    next: s.next[pid] ?? 0,
    score: s.score[pid] ?? 0,
  }),
};
