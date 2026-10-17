import { EB_REVEAL, EB_SKIP, EB_TURN, scale } from '../../engine/durations';
import { mix32, mulberry32, shuffle } from '../../engine/prng';
import { due, enter, isInt, isRecord, isStr, ringNext, turnOrder, type Phased } from '../common';
import type { GameDef } from '../types';
import { TERMS, type Term } from './terms';

export type EbPhase = 'explain' | 'reveal';
export type EbRes = 'hit' | 'skip' | 'taboo' | 'open';
export type EbRole = 'explainer' | 'guard' | 'guesser';

export interface EbLog {
  c: number;
  res: EbRes;
}

export interface EbState extends Phased<EbPhase> {
  pids: string[];
  order: string[];
  explainers: string[];
  k: number;
  deck: number[];
  pos: number;
  log: EbLog[];
  pts: Record<string, number>;
  seen: string[];
  durs: { turn: number; skip: number; reveal: number };
}

export type EbInput =
  | { a: 'hit'; k: number; c: number; to?: string }
  | { a: 'skip'; k: number; c: number }
  | { a: 'taboo'; k: number; c: number };

interface Base {
  k: number;
  of: number;
  who: string;
  hits: number;
  taboos: number;
  endsAt: number;
  dur: number;
}

interface Card {
  c: number;
  term: string;
  taboo: string[];
  mime: boolean;
}

export interface EbEntry {
  term: string;
  res: EbRes;
}

export type EbView =
  | (Base & Card & { phase: 'explain'; role: 'explainer'; guard: string | null; raters: string[] })
  | (Base & Card & { phase: 'explain'; role: 'guard' })
  | (Base & { phase: 'explain'; role: 'guesser' })
  | (Base & { phase: 'reveal'; role: EbRole; log: EbEntry[] });

const MAX_TURNS = 2;
const MAX_POS = 10_000;
const GUARD_MIN = 3;
const SALT = 0x4542;

const explainerOf = (s: EbState): string => s.explainers[s.k] as string;
const guardOf = (s: EbState): string | null => (s.pids.length >= GUARD_MIN ? (ringNext(s.order, explainerOf(s)) ?? null) : null);
const ratersOf = (s: EbState): string[] => s.pids.filter((p) => p !== explainerOf(s) && p !== guardOf(s));
const cardAt = (s: EbState, at: number): Term | undefined => TERMS[s.deck[at] ?? -1];
const count = (s: EbState, res: EbRes): number => s.log.filter((e) => e.res === res).length;
const withSeen = (s: EbState, ...pids: string[]): string[] => [...s.seen, ...pids.filter((p) => !s.seen.includes(p))];
const fmt = (n: number): string => `${n < 0 ? '−' : ''}${Math.abs(n)} Pkt`;

function advance(s: EbState, res: EbRes, gains: readonly (readonly [string, number])[]): EbState {
  const pts = { ...s.pts };
  for (const [p, d] of gains) pts[p] = (pts[p] ?? 0) + d;
  return {
    ...s,
    pos: s.pos + 1,
    log: [...s.log, { c: s.pos, res }],
    pts,
    seen: withSeen(s, ...gains.map(([p]) => p)),
  };
}

function conclude(s: EbState, now: number): EbState {
  const burnt = cardAt(s, s.pos) === undefined ? s : { ...s, pos: s.pos + 1, log: [...s.log, { c: s.pos, res: 'open' as const }] };
  return enter(burnt, 'reveal', now, s.durs.reveal);
}

export const erklaerbaer: GameDef<EbState, EbInput, EbView> = {
  id: 'erklaerbaer',
  title: 'ERKLÄRBÄR',
  rule: 'Erkläre Begriffe, ohne die Tabuwörter zu sagen, oder spiele sie stumm vor. Die anderen raten laut.',
  accent: 'orange',
  init(players, seed, now, ctx) {
    const pids = players.map((p) => p.pid);
    const order = turnOrder(seed, pids);
    const durs = { turn: scale(EB_TURN, ctx.speed), skip: scale(EB_SKIP, ctx.speed), reveal: scale(EB_REVEAL, ctx.speed) };
    return {
      pids,
      order,
      explainers: order.slice(0, Math.min(MAX_TURNS, pids.length)),
      k: 0,
      deck: shuffle(mulberry32(mix32(seed, SALT)), TERMS.map((_, i) => i)),
      pos: 0,
      log: [],
      pts: {},
      seen: [],
      durs,
      phase: 'explain',
      endsAt: now + durs.turn,
      dur: durs.turn,
    };
  },
  parseInput(raw) {
    if (!isRecord(raw) || !isInt(raw.k) || raw.k < 0 || raw.k >= MAX_TURNS || !isInt(raw.c) || raw.c < 0 || raw.c > MAX_POS) return null;
    if (raw.a === 'skip' || raw.a === 'taboo') return { a: raw.a, k: raw.k, c: raw.c };
    if (raw.a !== 'hit') return null;
    if (raw.to === undefined) return { a: 'hit', k: raw.k, c: raw.c };
    return isStr(raw.to, 64) ? { a: 'hit', k: raw.k, c: raw.c, to: raw.to } : null;
  },
  input(s, pid, i) {
    if (s.phase !== 'explain' || i.k !== s.k || i.c !== s.pos || cardAt(s, s.pos) === undefined) return s;
    const ex = explainerOf(s);
    if (i.a === 'taboo') return pid === (guardOf(s) ?? ex) ? advance(s, 'taboo', [[ex, -1], [pid, 0]]) : s;
    if (pid !== ex) return s;
    if (i.a === 'skip') return { ...advance(s, 'skip', [[ex, 0]]), endsAt: s.endsAt - s.durs.skip };
    const raters = ratersOf(s);
    if (raters.length === 0) return advance(s, 'hit', [[ex, 2]]);
    return i.to !== undefined && raters.includes(i.to) ? advance(s, 'hit', [[ex, 2], [i.to, 1]]) : s;
  },
  tick(s, now) {
    if (s.phase === 'explain') return due(s, now) || cardAt(s, s.pos) === undefined ? conclude(s, now) : s;
    return due(s, now) && s.k < s.explainers.length - 1 ? { ...enter(s, 'explain', now, s.durs.turn), k: s.k + 1, log: [] } : s;
  },
  done: (s, now) => s.phase === 'reveal' && s.k === s.explainers.length - 1 && due(s, now),
  result: (s) => new Map(s.seen.filter((p) => s.pids.includes(p)).map((p) => [p, s.pts[p] ?? 0] as [string, number])),
  label: (s, pid) => (s.seen.includes(pid) ? fmt(s.pts[pid] ?? 0) : '–'),
  view(s, pid) {
    const who = explainerOf(s);
    const guard = guardOf(s);
    const role: EbRole = pid === who ? 'explainer' : pid === guard ? 'guard' : 'guesser';
    const base: Base = {
      k: s.k,
      of: s.explainers.length,
      who,
      hits: count(s, 'hit'),
      taboos: count(s, 'taboo'),
      endsAt: s.endsAt,
      dur: s.dur,
    };
    if (s.phase === 'reveal')
      return { ...base, phase: 'reveal', role, log: s.log.map((e) => ({ term: cardAt(s, e.c)?.term ?? '', res: e.res })) };
    const t = cardAt(s, s.pos);
    const card: Card = { c: s.pos, term: t?.term ?? '', taboo: t && t.mime !== true ? [...t.taboo] : [], mime: t?.mime === true };
    if (role === 'explainer') return { ...base, ...card, phase: 'explain', role, guard, raters: ratersOf(s) };
    return role === 'guard' ? { ...base, ...card, phase: 'explain', role } : { ...base, phase: 'explain', role };
  },
};
