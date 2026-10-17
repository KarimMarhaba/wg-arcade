import type { DrinkPlan } from '../../engine/drinks';
import { WW_REVEAL, WW_VOTE, scale } from '../../engine/durations';
import { mulberry32 } from '../../engine/prng';
import { allDone, due, enter, isInt, isRecord, leaders, pickDistinct, tally, type Phased } from '../common';
import type { GameDef } from '../types';
import { QUESTIONS, STEM, STEM_DUO } from './questions';

export const WW_QUESTIONS = 4;

export interface WerwuerdeState extends Phased<'vote' | 'reveal'> {
  pids: string[];
  qs: number[];
  k: number;
  voteDur: number;
  revealDur: number;
  votes: Record<string, (string | null)[]>;
}

export interface WerwuerdeInput {
  k: number;
  to: string;
}

export interface Row {
  pid: string;
  count: number;
}

export type WerwuerdeView =
  | {
      phase: 'vote';
      k: number;
      of: number;
      text: string;
      endsAt: number;
      dur: number;
      mine: string | null;
      voted: number;
      total: number;
    }
  | {
      phase: 'reveal';
      k: number;
      of: number;
      text: string;
      endsAt: number;
      dur: number;
      mine: string | null;
      rows: Row[];
      top: string[];
      agree: boolean | null;
    };

const questionAt = (s: WerwuerdeState) => {
  const q = QUESTIONS[s.qs[s.k] as number];
  if (!q) throw new Error(`keine Frage ${s.k}`);
  return q;
};
const duo = (s: WerwuerdeState): boolean => s.pids.length === 2;
const voteOf = (s: WerwuerdeState, pid: string, k: number): string | null => s.votes[pid]?.[k] ?? null;
const voters = (s: WerwuerdeState, k: number): string[] => s.pids.filter((pid) => voteOf(s, pid, k) !== null);
const counts = (s: WerwuerdeState, k: number): Map<string, number> =>
  tally(Object.fromEntries(voters(s, k).map((pid) => [pid, voteOf(s, pid, k) as string])));
const tops = (s: WerwuerdeState, k: number): string[] => {
  const top = leaders(counts(s, k));
  return s.pids.filter((pid) => top.includes(pid));
};
const agreed = (s: WerwuerdeState, k: number): string | null => {
  const [a, b] = s.pids.map((pid) => voteOf(s, pid, k));
  return a !== null && a !== undefined && a === b ? a : null;
};
const ks = Array.from({ length: WW_QUESTIONS }, (_, k) => k);

function score(s: WerwuerdeState, pid: string): number {
  if (s.pids.length <= 1) return ks.filter((k) => voteOf(s, pid, k) !== null).length;
  let sum = 0;
  for (const k of ks) {
    if (duo(s)) {
      const to = agreed(s, k);
      sum += to === null ? 0 : 1 + (to === pid ? 1 : 0);
    } else {
      const top = tops(s, k);
      const mine = voteOf(s, pid, k);
      sum += (mine !== null && top.includes(mine) ? 1 : 0) + (top.includes(pid) ? 1 : 0);
    }
  }
  return sum;
}

export const werwuerde: GameDef<WerwuerdeState, WerwuerdeInput, WerwuerdeView> = {
  id: 'werwuerde',
  title: 'WER WÜRDE EHER',
  rule: 'Tippt heimlich einen Namen. Wer mit der Mehrheit liegt, punktet.',
  accent: 'hot',
  init(players, seed, now, ctx) {
    const pool = QUESTIONS.map((q, i) => ({ q, i })).filter(({ q }) => players.length !== 2 || q.duo === true);
    const voteDur = scale(WW_VOTE, ctx.speed);
    return {
      pids: players.map((p) => p.pid),
      qs: pickDistinct(mulberry32(seed), pool, WW_QUESTIONS).map((x) => x.i),
      k: 0,
      phase: 'vote',
      endsAt: now + voteDur,
      dur: voteDur,
      voteDur,
      revealDur: scale(WW_REVEAL, ctx.speed),
      votes: {},
    };
  },
  parseInput(raw) {
    if (!isRecord(raw) || !isInt(raw.k) || raw.k < 0 || raw.k >= WW_QUESTIONS) return null;
    return typeof raw.to === 'string' && raw.to !== '' ? { k: raw.k, to: raw.to } : null;
  },
  input(s, pid, i) {
    if (s.phase !== 'vote' || i.k !== s.k || !s.pids.includes(pid) || !s.pids.includes(i.to) || voteOf(s, pid, i.k) !== null) return s;
    const row = s.votes[pid] ?? Array.from({ length: WW_QUESTIONS }, () => null);
    return { ...s, votes: { ...s.votes, [pid]: row.map((x, k) => (k === i.k ? i.to : x)) } };
  },
  tick(s, now, online) {
    if (s.phase === 'vote')
      return due(s, now) || allDone(s.pids, online, (pid) => voteOf(s, pid, s.k) !== null)
        ? enter(s, 'reveal', now, s.revealDur)
        : s;
    return due(s, now) && s.k < WW_QUESTIONS - 1 ? { ...enter(s, 'vote', now, s.voteDur), k: s.k + 1 } : s;
  },
  done: (s, now) => s.phase === 'reveal' && s.k === WW_QUESTIONS - 1 && due(s, now),
  result: (s) => new Map(s.pids.filter((pid) => pid in s.votes).map((pid) => [pid, score(s, pid)] as [string, number])),
  label: (s, pid) => (pid in s.votes ? `${score(s, pid)} Pkt` : '–'),
  drinks(s): DrinkPlan {
    if (s.pids.length <= 1) return { rows: {}, cheers: false };
    const take: Record<string, number> = {};
    for (const k of ks) {
      const who = duo(s) ? [agreed(s, k)].filter((x): x is string => x !== null) : tops(s, k);
      for (const pid of who) take[pid] = (take[pid] ?? 0) + 1;
    }
    return {
      rows: Object.fromEntries(Object.entries(take).map(([pid, n]) => [pid, { take: n, give: 0 }])),
      cheers: Object.keys(take).length === 0,
    };
  },
  view(s, pid) {
    const text = (duo(s) ? STEM_DUO : STEM) + questionAt(s).q;
    const mine = voteOf(s, pid, s.k);
    const base = { k: s.k, of: WW_QUESTIONS, text, endsAt: s.endsAt, dur: s.dur, mine };
    if (s.phase === 'vote') return { phase: 'vote', ...base, voted: voters(s, s.k).length, total: s.pids.length };
    const c = counts(s, s.k);
    return {
      phase: 'reveal',
      ...base,
      rows: s.pids.map((p) => ({ pid: p, count: c.get(p) ?? 0 })),
      top: tops(s, s.k),
      agree: duo(s) ? agreed(s, s.k) !== null : null,
    };
  },
};
