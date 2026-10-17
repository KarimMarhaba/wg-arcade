import { VR_DUO_TURN, VR_GUESS, VR_REVEAL, VR_TALK, VR_TURN, VR_VOTE, VR_WORD, scale } from '../../engine/durations';
import { int, mix32, mulberry32, shuffle } from '../../engine/prng';
import { allDone, due, enter, isInt, isRecord, leaders, tally, type Phased } from '../common';
import type { GameDef } from '../types';
import { WORDS, type Word } from './words';

export type VrPhase = 'word' | 'round' | 'talk' | 'vote' | 'guess' | 'reveal';
export type VrMode = 'solo' | 'duo' | 'crew';

export interface VrState extends Phased<VrPhase> {
  pids: string[];
  seed: number;
  mode: VrMode;
  entry: number;
  order: string[];
  turns: number;
  turn: number;
  traitor: string | null;
  words: Record<string, string>;
  same: boolean | null;
  votes: Record<string, string>;
  tips: Record<string, boolean>;
  exposed: boolean | null;
  opts: string[] | null;
  guess: number | null;
  seen: string[];
  durs: { word: number; turn: number; duoTurn: number; talk: number; vote: number; guess: number; reveal: number };
}

export type VrInput =
  | { a: 'done'; turn: number }
  | { a: 'vote'; to: string }
  | { a: 'tip'; same: boolean }
  | { a: 'guess'; i: number };

export interface VrRow {
  pid: string;
  to: string | null;
  count: number;
}

export interface VrDuoRow {
  pid: string;
  word: string;
  tip: boolean | null;
  right: boolean;
}

interface Timed {
  endsAt: number;
  dur: number;
}

type Hint = { word: string } | { traitor: true; cat: string };

export type VrView =
  | (Timed & Hint & { phase: 'word' })
  | (Timed & Hint & { phase: 'round'; turn: number; of: number; who: string })
  | (Timed & Hint & { phase: 'talk' })
  | (Timed & Hint & { phase: 'vote'; mine: string | null; voted: number; total: number })
  | (Timed & Hint & { phase: 'vote'; mine: boolean | null })
  | (Timed & { phase: 'guess'; traitor: true; cat: string; opts: string[]; mine: number | null })
  | (Timed & { phase: 'guess'; word: string; accused: string })
  | (Timed & {
      phase: 'reveal';
      word: string;
      cat: string;
      culprit: string;
      exposed: boolean;
      guessed: string | null;
      right: boolean | null;
      rows: VrRow[];
    })
  | (Timed & { phase: 'reveal'; same: boolean; rows: VrDuoRow[] })
  | (Timed & { phase: 'reveal'; word: string; cat: string });

export const VR_OPTIONS = 6;
const GUESS_SALT = 5;
const TWO_PASS_MAX = 4;
const CREW_MIN = 3;

const entryOf = (s: VrState): Word => WORDS[s.entry] as Word;
const mark = (s: VrState, pid: string): string[] => (s.seen.includes(pid) ? s.seen : [...s.seen, pid]);
const turnDur = (s: VrState): number => (s.mode === 'duo' ? s.durs.duoTurn : s.durs.turn);
const speaker = (s: VrState): string => s.order[s.turn % s.order.length] as string;

function advance(s: VrState, now: number): VrState {
  const turn = s.turn + 1;
  if (turn < s.turns) return { ...enter(s, 'round', now, turnDur(s)), turn };
  return s.mode === 'duo' ? enter(s, 'vote', now, s.durs.vote) : enter(s, 'talk', now, s.durs.talk);
}

function resolve(s: VrState, now: number): VrState {
  if (s.mode === 'duo') return enter(s, 'reveal', now, s.durs.reveal);
  const top = leaders(tally(s.votes));
  const exposed = top.length === 1 && top[0] === s.traitor;
  if (!exposed) return enter({ ...s, exposed }, 'reveal', now, s.durs.reveal);
  const e = entryOf(s);
  const opts = shuffle(mulberry32(mix32(s.seed, GUESS_SALT)), [e.word, ...e.decoys]);
  return enter({ ...s, exposed, opts }, 'guess', now, s.durs.guess);
}

function score(s: VrState, pid: string): number {
  if (s.mode === 'duo') return s.tips[pid] === s.same ? 2 : 0;
  if (s.mode === 'solo') return 0;
  if (pid !== s.traitor) return s.votes[pid] === s.traitor ? 2 : 0;
  if (s.exposed === null) return 0;
  if (!s.exposed) return 5;
  return s.guess !== null && s.opts?.[s.guess] === entryOf(s).word ? 2 : 0;
}

export const verraeter: GameDef<VrState, VrInput, VrView> = {
  id: 'verraeter',
  title: 'DER VERRÄTER',
  rule: 'Alle kennen das Wort, nur einer nicht. Sagt je ein Wort dazu und findet den Verräter.',
  accent: 'cyan',
  init(players, seed, now, ctx) {
    const pids = players.map((p) => p.pid);
    const n = pids.length;
    const rng = mulberry32(seed);
    const entry = int(rng, 0, WORDS.length - 1);
    const e = WORDS[entry] as Word;
    const order = shuffle(rng, pids);
    const durs = {
      word: scale(VR_WORD, ctx.speed),
      turn: scale(VR_TURN, ctx.speed),
      duoTurn: scale(VR_DUO_TURN, ctx.speed),
      talk: scale(VR_TALK, ctx.speed),
      vote: scale(VR_VOTE, ctx.speed),
      guess: scale(VR_GUESS, ctx.speed),
      reveal: scale(VR_REVEAL, ctx.speed),
    };
    const base = {
      pids,
      seed,
      entry,
      order,
      turn: 0,
      votes: {},
      tips: {},
      exposed: null,
      opts: null,
      guess: null,
      seen: [],
      durs,
      phase: 'word' as const,
      endsAt: now + durs.word,
      dur: durs.word,
    };
    if (n >= CREW_MIN) {
      const traitor = pids[int(rng, 0, n - 1)] as string;
      const passes = n <= TWO_PASS_MAX ? 2 : 1;
      return {
        ...base,
        mode: 'crew',
        turns: n * passes,
        traitor,
        words: Object.fromEntries(pids.filter((p) => p !== traitor).map((p) => [p, e.word])),
        same: null,
      };
    }
    if (n === 2) {
      const same = rng() < 0.5;
      const flip = rng() < 0.5;
      const [a, b] = same ? [e.word, e.word] : flip ? [e.pair, e.word] : [e.word, e.pair];
      return { ...base, mode: 'duo', turns: 4, traitor: null, words: { [pids[0] as string]: a, [pids[1] as string]: b }, same };
    }
    return { ...base, mode: 'solo', turns: 0, traitor: null, words: Object.fromEntries(pids.map((p) => [p, e.word])), same: null };
  },
  parseInput(raw) {
    if (!isRecord(raw)) return null;
    if (raw.a === 'done') return isInt(raw.turn) && raw.turn >= 0 ? { a: 'done', turn: raw.turn } : null;
    if (raw.a === 'vote') return typeof raw.to === 'string' && raw.to !== '' ? { a: 'vote', to: raw.to } : null;
    if (raw.a === 'tip') return typeof raw.same === 'boolean' ? { a: 'tip', same: raw.same } : null;
    if (raw.a === 'guess') return isInt(raw.i) && raw.i >= 0 && raw.i < VR_OPTIONS ? { a: 'guess', i: raw.i } : null;
    return null;
  },
  input(s, pid, i, now) {
    if (!s.pids.includes(pid)) return s;
    if (i.a === 'done')
      return s.phase === 'round' && i.turn === s.turn && speaker(s) === pid ? { ...advance(s, now), seen: mark(s, pid) } : s;
    if (i.a === 'vote') {
      const ok = s.mode === 'crew' && s.phase === 'vote' && i.to !== pid && s.pids.includes(i.to) && !(pid in s.votes);
      return ok ? { ...s, votes: { ...s.votes, [pid]: i.to }, seen: mark(s, pid) } : s;
    }
    if (i.a === 'tip') {
      const ok = s.mode === 'duo' && s.phase === 'vote' && !(pid in s.tips);
      return ok ? { ...s, tips: { ...s.tips, [pid]: i.same }, seen: mark(s, pid) } : s;
    }
    return s.phase === 'guess' && pid === s.traitor && s.guess === null ? { ...s, guess: i.i, seen: mark(s, pid) } : s;
  },
  tick(s, now, online) {
    switch (s.phase) {
      case 'word':
        if (!due(s, now)) return s;
        return s.mode === 'solo' ? enter(s, 'reveal', now, s.durs.reveal) : { ...enter(s, 'round', now, turnDur(s)), turn: 0 };
      case 'round':
        return due(s, now) ? advance(s, now) : s;
      case 'talk':
        return due(s, now) ? enter(s, 'vote', now, s.durs.vote) : s;
      case 'vote': {
        const voted = (pid: string): boolean => (s.mode === 'duo' ? pid in s.tips : pid in s.votes);
        return due(s, now) || allDone(s.pids, online, voted) ? resolve(s, now) : s;
      }
      case 'guess':
        return due(s, now) || allDone([s.traitor as string], online, () => s.guess !== null) ? enter(s, 'reveal', now, s.durs.reveal) : s;
      case 'reveal':
        return s;
    }
  },
  done: (s, now) => s.phase === 'reveal' && due(s, now),
  result: (s) => new Map(s.seen.filter((p) => s.pids.includes(p)).map((p) => [p, score(s, p)] as [string, number])),
  label: (s, pid) => (s.seen.includes(pid) ? `${score(s, pid)} Pkt` : '–'),
  view(s, pid) {
    const t: Timed = { endsAt: s.endsAt, dur: s.dur };
    const e = entryOf(s);
    const traitor = s.mode === 'crew' && pid === s.traitor;
    const hint: Hint = traitor ? { traitor: true, cat: e.cat } : { word: s.words[pid] ?? '' };
    switch (s.phase) {
      case 'word':
        return { ...t, ...hint, phase: 'word' };
      case 'talk':
        return { ...t, ...hint, phase: 'talk' };
      case 'round':
        return { ...t, ...hint, phase: 'round', turn: s.turn, of: s.turns, who: speaker(s) };
      case 'vote':
        return s.mode === 'duo'
          ? { ...t, ...hint, phase: 'vote', mine: s.tips[pid] ?? null }
          : { ...t, ...hint, phase: 'vote', mine: s.votes[pid] ?? null, voted: Object.keys(s.votes).length, total: s.pids.length };
      case 'guess':
        return traitor
          ? { ...t, phase: 'guess', traitor: true, cat: e.cat, opts: s.opts as string[], mine: s.guess }
          : { ...t, phase: 'guess', word: s.words[pid] ?? '', accused: s.traitor as string };
      case 'reveal': {
        if (s.mode === 'solo') return { ...t, phase: 'reveal', word: e.word, cat: e.cat };
        if (s.mode === 'duo')
          return {
            ...t,
            phase: 'reveal',
            same: s.same as boolean,
            rows: s.pids.map((p) => ({ pid: p, word: s.words[p] as string, tip: s.tips[p] ?? null, right: s.tips[p] === s.same })),
          };
        const counts = tally(s.votes);
        const guessed = s.guess === null ? null : (s.opts?.[s.guess] ?? null);
        return {
          ...t,
          phase: 'reveal',
          word: e.word,
          cat: e.cat,
          culprit: s.traitor as string,
          exposed: s.exposed === true,
          guessed,
          right: s.exposed === true ? guessed === e.word : null,
          rows: s.pids.map((p) => ({ pid: p, to: s.votes[p] ?? null, count: counts.get(p) ?? 0 })),
        };
      }
    }
  },
};
