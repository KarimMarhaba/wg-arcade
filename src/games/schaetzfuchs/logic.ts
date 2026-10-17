import { GRACE, SF_ASK, SF_REVEAL, scale } from '../../engine/durations';
import { int, mulberry32 } from '../../engine/prng';
import { allDone, isRecord } from '../common';
import type { GameDef } from '../types';
import { QUESTIONS } from './questions';

const MAX_GUESS = 1e12;

export interface SchaetzfuchsState {
  pids: string[];
  qi: number;
  dur: number;
  askEnd: number;
  hardEnd: number;
  revealDur: number;
  revealEnd: number | null;
  guesses: Record<string, number>;
}

export interface SchaetzfuchsInput {
  guess: number;
}

export interface RevealRow {
  pid: string;
  guess: number | null;
  errPct: number | null;
}

export type SchaetzfuchsView =
  | {
      phase: 'ask';
      q: string;
      unit: string;
      endsAt: number;
      dur: number;
      myGuess: number | null;
      guessed: number;
      total: number;
    }
  | { phase: 'reveal'; q: string; unit: string; answer: number; endsAt: number; guesses: RevealRow[] };

const question = (s: SchaetzfuchsState) => {
  const q = QUESTIONS[s.qi];
  if (!q) throw new Error(`keine Frage ${s.qi}`);
  return q;
};
const relErr = (s: SchaetzfuchsState, pid: string): number | null => {
  const g = s.guesses[pid];
  return g === undefined ? null : Math.abs(g - question(s).a) / question(s).a;
};

export const schaetzfuchs: GameDef<SchaetzfuchsState, SchaetzfuchsInput, SchaetzfuchsView> = {
  id: 'schaetzfuchs',
  title: 'SCHÄTZFUCHS',
  rule: 'Schätze die Zahl. Wer am nächsten dran ist, gewinnt.',
  accent: 'orange',
  init(players, seed, now, ctx) {
    const dur = scale(SF_ASK, ctx.speed);
    return {
      pids: players.map((p) => p.pid),
      qi: int(mulberry32(seed), 0, QUESTIONS.length - 1),
      dur,
      askEnd: now + dur,
      hardEnd: now + dur + GRACE,
      revealDur: scale(SF_REVEAL, ctx.speed),
      revealEnd: null,
      guesses: {},
    };
  },
  parseInput(raw) {
    if (!isRecord(raw)) return null;
    const g = raw.guess;
    return typeof g === 'number' && Number.isFinite(g) && g >= 0 && g <= MAX_GUESS ? { guess: g } : null;
  },
  input: (s, pid, i, now) =>
    s.revealEnd !== null || !s.pids.includes(pid) || pid in s.guesses || now >= s.hardEnd
      ? s
      : { ...s, guesses: { ...s.guesses, [pid]: i.guess } },
  tick: (s, now, online) =>
    s.revealEnd === null && (now >= s.hardEnd || allDone(s.pids, online, (pid) => pid in s.guesses))
      ? { ...s, revealEnd: now + s.revealDur }
      : s,
  done: (s, now) => s.revealEnd !== null && now >= s.revealEnd,
  result: (s) => new Map(s.pids.flatMap((pid) => {
    const e = relErr(s, pid);
    return e === null ? [] : [[pid, 0 - e] as [string, number]];
  })),
  label(s, pid) {
    const e = relErr(s, pid);
    return e === null ? '–' : `±${Math.round(e * 100)} %`;
  },
  view(s, pid) {
    const { q, unit, a } = question(s);
    if (s.revealEnd === null)
      return {
        phase: 'ask',
        q,
        unit,
        endsAt: s.askEnd,
        dur: s.dur,
        myGuess: s.guesses[pid] ?? null,
        guessed: Object.keys(s.guesses).length,
        total: s.pids.length,
      };
    const rows = s.pids
      .map((p, k) => ({ p, k, e: relErr(s, p) }))
      .sort((x, y) => (x.e ?? Infinity) - (y.e ?? Infinity) || x.k - y.k);
    return {
      phase: 'reveal',
      q,
      unit,
      answer: a,
      endsAt: s.revealEnd,
      guesses: rows.map(({ p, e }) => ({
        pid: p,
        guess: s.guesses[p] ?? null,
        errPct: e === null ? null : Math.round(e * 100),
      })),
    };
  },
};
