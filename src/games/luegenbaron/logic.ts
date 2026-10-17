import { LB_CARD, LB_REVEAL, LB_TELL, LB_VOTE, scale } from '../../engine/durations';
import { mix32, mulberry32 } from '../../engine/prng';
import { allDone, due, enter, isInt, isRecord, pickDistinct, turnOrder, type Phased } from '../common';
import type { GameDef } from '../types';
import { TOPICS } from './topics';

export type LbPhase = 'card' | 'tell' | 'vote' | 'reveal';

export interface LbState extends Phased<LbPhase> {
  pids: string[];
  narrators: string[];
  k: number;
  topics: [number, number][];
  swapped: boolean[];
  dflt: boolean[];
  truth: (boolean | null)[];
  tips: Record<string, (boolean | null)[]>;
  seen: string[];
  durs: { card: number; tell: number; vote: number; reveal: number };
}

export type LbInput = { a: 'mode' | 'tip'; k: number; truth: boolean } | { a: 'swap' | 'done'; k: number };

export interface LbRow {
  pid: string;
  tip: boolean | null;
  right: boolean;
}

interface Base {
  k: number;
  of: number;
  who: string;
  topic: string;
  endsAt: number;
  dur: number;
}

export type LbView =
  | (Base & { phase: 'card'; role: 'narrator'; mode: boolean | null; canSwap: boolean })
  | (Base & { phase: 'card'; role: 'listener' })
  | (Base & { phase: 'tell'; role: 'narrator'; mode: boolean })
  | (Base & { phase: 'tell'; role: 'listener' })
  | (Base & { phase: 'vote'; role: 'narrator'; mode: boolean; voted: number; total: number })
  | (Base & { phase: 'vote'; role: 'listener'; mine: boolean | null; voted: number; total: number })
  | (Base & { phase: 'reveal'; role: 'narrator' | 'listener'; truth: boolean; fooled: number; total: number; rows: LbRow[] });

const MAX_NARRATORS = 2;
const SALT = 0x4c42;

const mark = (s: LbState, pid: string): string[] => (s.seen.includes(pid) ? s.seen : [...s.seen, pid]);
const listeners = (s: LbState, k: number): string[] => s.pids.filter((p) => p !== s.narrators[k]);
const tipOf = (s: LbState, pid: string, k: number): boolean | null => s.tips[pid]?.[k] ?? null;
const put = <T>(xs: readonly T[], at: number, v: T): T[] => xs.map((x, i) => (i === at ? v : x));
const fooledAt = (s: LbState, k: number): number =>
  listeners(s, k).filter((p) => {
    const t = tipOf(s, p, k);
    return t !== null && t !== s.truth[k];
  }).length;

function score(s: LbState, pid: string): number {
  let sum = 0;
  s.narrators.forEach((nar, k) => {
    if (s.truth[k] === null) return;
    if (pid === nar) sum += fooledAt(s, k);
    else if (tipOf(s, pid, k) === s.truth[k]) sum += 1;
  });
  return sum;
}

export const luegenbaron: GameDef<LbState, LbInput, LbView> = {
  id: 'luegenbaron',
  title: 'LÜGENBARON',
  rule: 'Erzählen, bluffen, durchschauen: Wer lügt, wer sagt die Wahrheit?',
  accent: 'hot',
  init(players, seed, now, ctx) {
    const pids = players.map((p) => p.pid);
    const narrators = turnOrder(seed, pids).slice(0, MAX_NARRATORS);
    const rng = mulberry32(mix32(seed, SALT));
    const picks = pickDistinct(rng, TOPICS.map((_, i) => i), narrators.length * 2);
    const durs = {
      card: scale(LB_CARD, ctx.speed),
      tell: scale(LB_TELL, ctx.speed),
      vote: scale(LB_VOTE, ctx.speed),
      reveal: scale(LB_REVEAL, ctx.speed),
    };
    return {
      pids,
      narrators,
      k: 0,
      phase: 'card',
      endsAt: now + durs.card,
      dur: durs.card,
      topics: narrators.map((_, i) => [picks[2 * i] as number, picks[2 * i + 1] as number]),
      swapped: narrators.map(() => false),
      dflt: narrators.map(() => rng() < 0.5),
      truth: narrators.map(() => null),
      tips: {},
      seen: [],
      durs,
    };
  },
  parseInput(raw) {
    if (!isRecord(raw) || !isInt(raw.k) || raw.k < 0 || raw.k >= MAX_NARRATORS) return null;
    if ((raw.a === 'mode' || raw.a === 'tip') && typeof raw.truth === 'boolean') return { a: raw.a, k: raw.k, truth: raw.truth };
    return raw.a === 'swap' || raw.a === 'done' ? { a: raw.a, k: raw.k } : null;
  },
  input(s, pid, i, now) {
    if (!s.pids.includes(pid) || i.k !== s.k) return s;
    const isNarrator = pid === s.narrators[s.k];
    if (i.a === 'tip') {
      if (s.phase !== 'vote' || isNarrator || tipOf(s, pid, s.k) !== null) return s;
      const row = s.tips[pid] ?? s.narrators.map(() => null);
      return { ...s, tips: { ...s.tips, [pid]: put(row, s.k, i.truth) }, seen: mark(s, pid) };
    }
    if (!isNarrator) return s;
    if (i.a === 'done') return s.phase === 'tell' ? { ...enter(s, 'vote', now, s.durs.vote), seen: mark(s, pid) } : s;
    if (s.phase !== 'card' || s.truth[s.k] !== null) return s;
    if (i.a === 'mode') return { ...s, truth: put(s.truth, s.k, i.truth), seen: mark(s, pid) };
    return s.swapped[s.k] ? s : { ...s, swapped: put(s.swapped, s.k, true), seen: mark(s, pid) };
  },
  tick(s, now, online) {
    if (s.phase === 'card')
      return due(s, now) ? enter({ ...s, truth: put(s.truth, s.k, s.truth[s.k] ?? (s.dflt[s.k] as boolean)) }, 'tell', now, s.durs.tell) : s;
    if (s.phase === 'tell') return due(s, now) ? enter(s, 'vote', now, s.durs.vote) : s;
    if (s.phase === 'vote')
      return due(s, now) || allDone(listeners(s, s.k), online, (pid) => tipOf(s, pid, s.k) !== null)
        ? enter(s, 'reveal', now, s.durs.reveal)
        : s;
    return due(s, now) && s.k < s.narrators.length - 1 ? { ...enter(s, 'card', now, s.durs.card), k: s.k + 1 } : s;
  },
  done: (s, now) => s.phase === 'reveal' && s.k === s.narrators.length - 1 && due(s, now),
  result: (s) => new Map(s.seen.filter((p) => s.pids.includes(p)).map((p) => [p, score(s, p)] as [string, number])),
  label: (s, pid) => (s.seen.includes(pid) ? `${score(s, pid)} Pkt` : '–'),
  view(s, pid) {
    const k = s.k;
    const topics = s.topics[k] as [number, number];
    const base: Base = {
      k,
      of: s.narrators.length,
      who: s.narrators[k] as string,
      topic: (TOPICS[s.swapped[k] ? topics[1] : topics[0]] as { topic: string }).topic,
      endsAt: s.endsAt,
      dur: s.dur,
    };
    const role = pid === s.narrators[k] ? 'narrator' : 'listener';
    const truth = s.truth[k] as boolean | null;
    const ls = listeners(s, k);
    const count = { voted: ls.filter((p) => tipOf(s, p, k) !== null).length, total: ls.length };
    switch (s.phase) {
      case 'card':
        return role === 'narrator'
          ? { ...base, phase: 'card', role, mode: truth, canSwap: !s.swapped[k] && truth === null }
          : { ...base, phase: 'card', role };
      case 'tell':
        return role === 'narrator' ? { ...base, phase: 'tell', role, mode: truth as boolean } : { ...base, phase: 'tell', role };
      case 'vote':
        return role === 'narrator'
          ? { ...base, ...count, phase: 'vote', role, mode: truth as boolean }
          : { ...base, ...count, phase: 'vote', role, mine: tipOf(s, pid, k) };
      case 'reveal':
        return {
          ...base,
          phase: 'reveal',
          role,
          truth: truth as boolean,
          fooled: fooledAt(s, k),
          total: ls.length,
          rows: ls.map((p) => ({ pid: p, tip: tipOf(s, p, k), right: tipOf(s, p, k) === truth })),
        };
    }
  },
};
