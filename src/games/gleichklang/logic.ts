import { GK_ASK, GK_REVEAL, scale } from '../../engine/durations';
import { mulberry32 } from '../../engine/prng';
import { allDone, clampInt, due, enter, isInt, isRecord, pickDistinct, type Phased } from '../common';
import type { GameDef } from '../types';
import { PROMPTS } from './prompts';

export const GK_QUESTIONS = 6;
const MAX_MS = 7000;
const MAX_OPTS = 4;

interface Pick {
  i: number;
  ms: number;
}

export interface GleichklangState extends Phased<'ask' | 'reveal'> {
  pids: string[];
  qs: number[];
  k: number;
  askDur: number;
  revealDur: number;
  picks: Record<string, (Pick | null)[]>;
}

export interface GleichklangInput {
  k: number;
  i: number;
  ms: number;
}

export interface Group {
  i: number;
  pids: string[];
}

export type GleichklangView =
  | {
      phase: 'ask';
      k: number;
      of: number;
      q: string;
      opts: readonly string[];
      endsAt: number;
      dur: number;
      mine: number | null;
      answered: number;
      total: number;
    }
  | {
      phase: 'reveal';
      k: number;
      of: number;
      q: string;
      opts: readonly string[];
      endsAt: number;
      dur: number;
      mine: number | null;
      groups: Group[];
      main: number[];
      none: string[];
      team: { hit: number; asked: number };
    };

const promptAt = (s: GleichklangState, k = s.k) => {
  const p = PROMPTS[s.qs[k] as number];
  if (!p) throw new Error(`keine Frage ${k}`);
  return p;
};
const pickOf = (s: GleichklangState, pid: string, k: number): Pick | null => s.picks[pid]?.[k] ?? null;
const answered = (s: GleichklangState, k: number): string[] => s.pids.filter((pid) => pickOf(s, pid, k) !== null);

function groupsAt(s: GleichklangState, k: number): Group[] {
  const by = new Map<number, string[]>();
  for (const pid of answered(s, k)) {
    const i = (pickOf(s, pid, k) as Pick).i;
    by.set(i, [...(by.get(i) ?? []), pid]);
  }
  return [...by].sort(([a], [b]) => a - b).map(([i, pids]) => ({ i, pids }));
}

const sameAnswer = (s: GleichklangState, pid: string, k: number): number => {
  const mine = pickOf(s, pid, k);
  return mine === null ? 0 : answered(s, k).filter((o) => o !== pid && (pickOf(s, o, k) as Pick).i === mine.i).length;
};

const ks = Array.from({ length: GK_QUESTIONS }, (_, k) => k);
const hits = (s: GleichklangState, pid: string): number => ks.filter((k) => sameAnswer(s, pid, k) > 0).length;
const answers = (s: GleichklangState, pid: string): number => ks.filter((k) => pickOf(s, pid, k) !== null).length;

function tiebreak(s: GleichklangState, pid: string): number {
  const other = s.pids.find((o) => o !== pid);
  let wins = 0;
  for (const k of ks) {
    const a = pickOf(s, pid, k);
    const b = other === undefined ? null : pickOf(s, other, k);
    if (a && b && a.i === b.i && a.ms < b.ms) wins++;
  }
  return wins;
}

function score(s: GleichklangState, pid: string): number {
  const n = s.pids.length;
  if (n <= 1) return answers(s, pid);
  if (n === 2) return 100 * hits(s, pid) + tiebreak(s, pid);
  return Math.round((100 * ks.reduce((sum, k) => sum + sameAnswer(s, pid, k), 0)) / (n - 1));
}

const unanimous = (s: GleichklangState, k: number): boolean => {
  const gs = groupsAt(s, k);
  return gs.length === 1 && (gs[0] as Group).pids.length >= 2;
};

export const gleichklang: GameDef<GleichklangState, GleichklangInput, GleichklangView> = {
  id: 'gleichklang',
  title: 'GLEICHKLANG',
  rule: 'Tippt heimlich dieselbe Antwort. Gleiche Antworten geben Punkte.',
  accent: 'cyan',
  init(players, seed, now, ctx) {
    const n = players.length;
    const pool = PROMPTS.map((p, i) => ({ p, i })).filter(({ p }) => n !== 2 || p.duo === true);
    const askDur = scale(GK_ASK, ctx.speed);
    return {
      pids: players.map((p) => p.pid),
      qs: pickDistinct(mulberry32(seed), pool, GK_QUESTIONS).map((x) => x.i),
      k: 0,
      phase: 'ask',
      endsAt: now + askDur,
      dur: askDur,
      askDur,
      revealDur: scale(GK_REVEAL, ctx.speed),
      picks: {},
    };
  },
  parseInput(raw) {
    if (!isRecord(raw) || !isInt(raw.k) || !isInt(raw.i) || typeof raw.ms !== 'number' || !Number.isFinite(raw.ms)) return null;
    if (raw.k < 0 || raw.k >= GK_QUESTIONS || raw.i < 0 || raw.i >= MAX_OPTS) return null;
    return { k: raw.k, i: raw.i, ms: clampInt(raw.ms, 0, MAX_MS) };
  },
  input(s, pid, i) {
    if (s.phase !== 'ask' || i.k !== s.k || !s.pids.includes(pid) || i.i >= promptAt(s).opts.length || pickOf(s, pid, i.k)) return s;
    const row = s.picks[pid] ?? Array.from({ length: GK_QUESTIONS }, () => null);
    return { ...s, picks: { ...s.picks, [pid]: row.map((x, k) => (k === i.k ? { i: i.i, ms: i.ms } : x)) } };
  },
  tick(s, now, online) {
    if (s.phase === 'ask')
      return due(s, now) || allDone(s.pids, online, (pid) => pickOf(s, pid, s.k) !== null)
        ? enter(s, 'reveal', now, s.revealDur)
        : s;
    return due(s, now) && s.k < GK_QUESTIONS - 1 ? { ...enter(s, 'ask', now, s.askDur), k: s.k + 1 } : s;
  },
  done: (s, now) => s.phase === 'reveal' && s.k === GK_QUESTIONS - 1 && due(s, now),
  result: (s) => new Map(s.pids.filter((pid) => pid in s.picks).map((pid) => [pid, score(s, pid)] as [string, number])),
  label: (s, pid) => (pid in s.picks ? `${s.pids.length <= 1 ? answers(s, pid) : hits(s, pid)} Treffer` : '–'),
  view(s, pid) {
    const p = promptAt(s);
    const mine = pickOf(s, pid, s.k)?.i ?? null;
    const base = { k: s.k, of: GK_QUESTIONS, q: p.q, opts: p.opts, endsAt: s.endsAt, dur: s.dur, mine };
    if (s.phase === 'ask') return { phase: 'ask', ...base, answered: answered(s, s.k).length, total: s.pids.length };
    const groups = groupsAt(s, s.k);
    const top = Math.max(0, ...groups.map((g) => g.pids.length));
    const asked = Array.from({ length: s.k + 1 }, (_, k) => k);
    return {
      phase: 'reveal',
      ...base,
      groups,
      main: top >= 2 ? groups.filter((g) => g.pids.length === top).map((g) => g.i) : [],
      none: s.pids.filter((x) => pickOf(s, x, s.k) === null),
      team: { hit: asked.filter((k) => answered(s, k).length >= 2 && unanimous(s, k)).length, asked: asked.length },
    };
  },
};
