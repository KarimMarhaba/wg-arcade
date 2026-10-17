import { PF_GUESS, PF_MISSION, PF_REVEAL, PF_TALK, scale } from '../../engine/durations';
import { int, mix32, mulberry32, shuffle } from '../../engine/prng';
import { allDone, due, enter, isInt, isRecord, pickDistinct, ringNext, turnOrder, type Phased } from '../common';
import type { GameDef } from '../types';
import { MISSIONS, TOPICS } from './missions';

export type PfPhase = 'mission' | 'talk' | 'guess' | 'reveal';

export interface PfState extends Phased<PfPhase> {
  pids: string[];
  order: string[];
  topic: number;
  missions: Record<string, number>;
  opts: Record<string, string[]>;
  answer: Record<string, number>;
  done: Record<string, true>;
  tips: Record<string, number>;
  seen: string[];
  durs: { mission: number; talk: number; guess: number; reveal: number };
}

export type PfInput = { a: 'done' } | { a: 'tip'; i: number };

export interface PfRow {
  pid: string;
  mission: string;
  done: boolean;
  by: string | null;
  cracked: boolean | null;
  tip: boolean | null;
}

interface Timed {
  endsAt: number;
  dur: number;
}

export type PfView =
  | (Timed & { phase: 'mission'; mission: string; target: string | null; topic: string })
  | (Timed & { phase: 'talk'; mission: string; target: string | null; topic: string; done: boolean })
  | (Timed & { phase: 'guess'; target: string; opts: string[]; mine: number | null; voted: number; total: number })
  | (Timed & { phase: 'reveal'; rows: PfRow[] });

export const PF_OPTIONS = 4;
const DECOYS = PF_OPTIONS - 1;
const SALT = 0x5046;

const mark = (s: PfState, pid: string): string[] => (s.seen.includes(pid) ? s.seen : [...s.seen, pid]);
const ringed = (s: PfState): boolean => s.order.length >= 2;
const textOf = (s: PfState, pid: string): string => MISSIONS[s.missions[pid] ?? -1]?.mission ?? '';
const raterOf = (s: PfState, pid: string): string | undefined => {
  const i = s.order.indexOf(pid);
  return ringed(s) && i >= 0 ? s.order[(i + s.order.length - 1) % s.order.length] : undefined;
};
const tipRight = (s: PfState, pid: string): boolean | null => {
  const t = s.tips[pid];
  return t === undefined ? null : t === s.answer[pid];
};
const cracked = (s: PfState, pid: string): boolean | null => {
  const r = raterOf(s, pid);
  return r === undefined ? null : tipRight(s, r);
};

function score(s: PfState, pid: string): number {
  const own = s.done[pid] ? (cracked(s, pid) === true ? 1 : 3) : 0;
  return own + (tipRight(s, pid) === true ? 2 : 0);
}

export const pokerface: GameDef<PfState, PfInput, PfView> = {
  id: 'pokerface',
  title: 'POKERFACE',
  rule: 'Erfülle heimlich deine Mission im Gespräch und finde heraus, welche Mission dein Nachbar hatte.',
  accent: 'lime',
  init(players, seed, now, ctx) {
    const pids = players.map((p) => p.pid);
    const n = pids.length;
    const order = turnOrder(seed, pids);
    const rng = mulberry32(mix32(seed, SALT));
    const picks = pickDistinct(rng, MISSIONS.map((_, i) => i), n + (n >= 2 ? DECOYS * n : 0));
    const topic = int(rng, 0, TOPICS.length - 1);
    const missions = Object.fromEntries(order.map((p, i) => [p, picks[i] as number]));
    const opts: Record<string, string[]> = {};
    const answer: Record<string, number> = {};
    if (n >= 2)
      order.forEach((target, j) => {
        const rater = order[(j + n - 1) % n] as string;
        const right = (MISSIONS[missions[target] as number] as { mission: string }).mission;
        const decoys = picks.slice(n + DECOYS * j, n + DECOYS * (j + 1)).map((i) => (MISSIONS[i] as { mission: string }).mission);
        opts[rater] = shuffle(rng, [right, ...decoys]);
        answer[rater] = (opts[rater] as string[]).indexOf(right);
      });
    const durs = {
      mission: scale(PF_MISSION, ctx.speed),
      talk: scale(PF_TALK, ctx.speed),
      guess: scale(PF_GUESS, ctx.speed),
      reveal: scale(PF_REVEAL, ctx.speed),
    };
    return {
      pids,
      order,
      topic,
      missions,
      opts,
      answer,
      done: {},
      tips: {},
      seen: [],
      durs,
      phase: 'mission',
      endsAt: now + durs.mission,
      dur: durs.mission,
    };
  },
  parseInput(raw) {
    if (!isRecord(raw)) return null;
    if (raw.a === 'done') return { a: 'done' };
    if (raw.a === 'tip') return isInt(raw.i) && raw.i >= 0 && raw.i < PF_OPTIONS ? { a: 'tip', i: raw.i } : null;
    return null;
  },
  input(s, pid, i) {
    if (!s.pids.includes(pid)) return s;
    if (i.a === 'done') return s.phase === 'talk' && !s.done[pid] ? { ...s, done: { ...s.done, [pid]: true }, seen: mark(s, pid) } : s;
    return s.phase === 'guess' && !(pid in s.tips) ? { ...s, tips: { ...s.tips, [pid]: i.i }, seen: mark(s, pid) } : s;
  },
  tick(s, now, online) {
    switch (s.phase) {
      case 'mission':
        return due(s, now) ? enter(s, 'talk', now, s.durs.talk) : s;
      case 'talk':
        if (!due(s, now) && !allDone(s.pids, online, (p) => s.done[p] === true)) return s;
        return ringed(s) ? enter(s, 'guess', now, s.durs.guess) : enter(s, 'reveal', now, s.durs.reveal);
      case 'guess':
        return due(s, now) || allDone(s.pids, online, (p) => p in s.tips) ? enter(s, 'reveal', now, s.durs.reveal) : s;
      case 'reveal':
        return s;
    }
  },
  done: (s, now) => s.phase === 'reveal' && due(s, now),
  result: (s) => new Map(s.seen.filter((p) => s.pids.includes(p)).map((p) => [p, score(s, p)] as [string, number])),
  label: (s, pid) => (s.seen.includes(pid) ? `${score(s, pid)} Pkt` : '–'),
  view(s, pid) {
    const t: Timed = { endsAt: s.endsAt, dur: s.dur };
    const target = ringed(s) ? (ringNext(s.order, pid) ?? null) : null;
    const topic = (TOPICS[s.topic] as { topic: string }).topic;
    switch (s.phase) {
      case 'mission':
        return { ...t, phase: 'mission', mission: textOf(s, pid), target, topic };
      case 'talk':
        return { ...t, phase: 'talk', mission: textOf(s, pid), target, topic, done: s.done[pid] === true };
      case 'guess':
        return {
          ...t,
          phase: 'guess',
          target: target ?? '',
          opts: s.opts[pid] ?? [],
          mine: s.tips[pid] ?? null,
          voted: Object.keys(s.tips).length,
          total: s.pids.length,
        };
      case 'reveal':
        return {
          ...t,
          phase: 'reveal',
          rows: s.pids.map((p) => ({
            pid: p,
            mission: textOf(s, p),
            done: s.done[p] === true,
            by: raterOf(s, p) ?? null,
            cracked: cracked(s, p),
            tip: tipRight(s, p),
          })),
        };
    }
  },
};
