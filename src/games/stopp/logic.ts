import { STOPP_BLIND, STOPP_LATE, STOPP_LEAD, STOPP_REVEAL, scale } from '../../engine/durations';
import { int, mulberry32 } from '../../engine/prng';
import { allDone, clampInt, due, enter, isInt, isRecord, type Phased } from '../common';
import type { GameDef } from '../types';

export const STOPP_TRIES = 3;
export const STOPP_MISS = 5000;
export const STOPP_CAP = 10_000;
const TARGET_MIN = 14;
const TARGET_MAX = 30;
const TARGET_STEP = 500;

export interface StoppState extends Phased<'run' | 'reveal'> {
  pids: string[];
  k: number;
  targets: number[];
  lead: number;
  blind: number;
  late: number;
  revealDur: number;
  startAt: number;
  devs: Record<string, (number | null)[]>;
}

export interface StoppInput {
  k: number;
  devMs: number;
}

export type StoppView =
  | {
      phase: 'run';
      k: number;
      of: number;
      target: number;
      lead: number;
      blind: number;
      startAt: number;
      endsAt: number;
      dur: number;
      sent: boolean;
      got: number;
      total: number;
    }
  | {
      phase: 'reveal';
      k: number;
      of: number;
      target: number;
      endsAt: number;
      dur: number;
      mine: number | null;
      rows: { pid: string; dev: number | null }[];
    };

export const fmtSec = (ms: number): string => {
  const cents = Math.round(Math.abs(ms) / 10);
  return `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, '0')}`;
};

export function duoLine(mine: number | null, other: number | null, otherName: string): string {
  if (mine === null && other === null) return 'Niemand hat gestoppt';
  if (mine === null) return 'Du hast nicht gestoppt';
  if (other === null) return `${otherName} hat nicht gestoppt`;
  const a = Math.abs(mine);
  const b = Math.abs(other);
  if (a === b) return 'Gleich nah dran';
  return a < b ? `Du warst ${fmtSec(b - a)} s näher dran` : `${otherName} war ${fmtSec(a - b)} s näher dran`;
}

const devOf = (s: StoppState, pid: string, k: number): number | null => s.devs[pid]?.[k] ?? null;
const sent = (s: StoppState, k: number): string[] => s.pids.filter((pid) => devOf(s, pid, k) !== null);
const ks = Array.from({ length: STOPP_TRIES }, (_, k) => k);
const miss = (s: StoppState, pid: string): number =>
  ks.reduce((sum, k) => sum + Math.abs(devOf(s, pid, k) ?? STOPP_MISS), 0);

function attempt(s: StoppState, k: number, now: number): StoppState {
  const target = s.targets[k] as number;
  return { ...enter(s, 'run', now, s.lead + target + s.late), k, startAt: now + s.lead };
}

export const stopp: GameDef<StoppState, StoppInput, StoppView> = {
  id: 'stopp',
  title: 'BLINDE ZEIT',
  rule: 'Stoppe die Uhr möglichst genau bei der Zielzeit. Nach 3 Sekunden bist du blind.',
  accent: 'lime',
  init(players, seed, now, ctx) {
    const rng = mulberry32(seed);
    const targets = ks.map(() => scale(int(rng, TARGET_MIN, TARGET_MAX) * TARGET_STEP, ctx.speed));
    const base: StoppState = {
      pids: players.map((p) => p.pid),
      phase: 'run',
      endsAt: now,
      dur: 0,
      k: 0,
      targets,
      lead: scale(STOPP_LEAD, ctx.speed),
      blind: scale(STOPP_BLIND, ctx.speed),
      late: scale(STOPP_LATE, ctx.speed),
      revealDur: scale(STOPP_REVEAL, ctx.speed),
      startAt: now,
      devs: {},
    };
    return attempt(base, 0, now);
  },
  parseInput(raw) {
    if (!isRecord(raw) || !isInt(raw.k) || raw.k < 0 || raw.k >= STOPP_TRIES) return null;
    if (typeof raw.devMs !== 'number' || !Number.isFinite(raw.devMs)) return null;
    return { k: raw.k, devMs: clampInt(Math.round(raw.devMs), -STOPP_CAP, STOPP_CAP) + 0 };
  },
  input(s, pid, i) {
    if (s.phase !== 'run' || i.k !== s.k || !s.pids.includes(pid) || devOf(s, pid, i.k) !== null) return s;
    const row = s.devs[pid] ?? Array.from({ length: STOPP_TRIES }, () => null);
    return { ...s, devs: { ...s.devs, [pid]: row.map((x, k) => (k === i.k ? i.devMs : x)) } };
  },
  tick(s, now, online) {
    if (s.phase === 'run')
      return due(s, now) || allDone(s.pids, online, (pid) => devOf(s, pid, s.k) !== null)
        ? enter(s, 'reveal', now, s.revealDur)
        : s;
    return due(s, now) && s.k < STOPP_TRIES - 1 ? attempt(s, s.k + 1, now) : s;
  },
  done: (s, now) => s.phase === 'reveal' && s.k === STOPP_TRIES - 1 && due(s, now),
  result: (s) => new Map(s.pids.filter((pid) => pid in s.devs).map((pid) => [pid, 0 - miss(s, pid)] as [string, number])),
  label: (s, pid) => (pid in s.devs ? `± ${fmtSec(miss(s, pid))} s` : '–'),
  view(s, pid) {
    const base = { k: s.k, of: STOPP_TRIES, target: s.targets[s.k] as number, endsAt: s.endsAt, dur: s.dur };
    if (s.phase === 'run')
      return {
        phase: 'run',
        ...base,
        lead: s.lead,
        blind: s.blind,
        startAt: s.startAt,
        sent: devOf(s, pid, s.k) !== null,
        got: sent(s, s.k).length,
        total: s.pids.length,
      };
    return {
      phase: 'reveal',
      ...base,
      mine: devOf(s, pid, s.k),
      rows: s.pids.map((p) => ({ pid: p, dev: devOf(s, p, s.k) })),
    };
  },
};
