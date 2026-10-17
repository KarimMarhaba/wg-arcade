import { GAME_IDS, type GameDef, type GameId } from '../games/types';
import { scale } from './durations';

export interface DummyState {
  seed: number;
  endsAt: number;
  pids: string[];
  votes: Record<string, number>;
  finished: boolean;
}

export interface DummyView {
  mine: number | null;
  seed: number;
}

export const DUMMY_MS = 1000;

export function makeDummy(id: GameId): GameDef<DummyState, { v: number }, DummyView> {
  return {
    id,
    title: `Dummy ${id}`,
    rule: `Regel ${id}`,
    accent: 'lime',
    init: (players, seed, now, ctx) => ({
      seed,
      endsAt: now + scale(DUMMY_MS, ctx.speed),
      pids: players.map((p) => p.pid),
      votes: {},
      finished: false,
    }),
    parseInput: (raw) => {
      if (typeof raw !== 'object' || raw === null) return null;
      const v = (raw as { v?: unknown }).v;
      return typeof v === 'number' && Number.isFinite(v) ? { v } : null;
    },
    input: (s, pid, i, now) =>
      !s.pids.includes(pid) || pid in s.votes || now >= s.endsAt ? s : { ...s, votes: { ...s.votes, [pid]: i.v } },
    tick: (s, _now, online) =>
      !s.finished && online.size > 0 && [...online].every((pid) => pid in s.votes) ? { ...s, finished: true } : s,
    done: (s, now) => s.finished || now >= s.endsAt,
    result: (s) => new Map(Object.entries(s.votes)),
    label: (s, pid) => (pid in s.votes ? `${s.votes[pid]} pt` : '–'),
    view: (s, pid) => ({ mine: s.votes[pid] ?? null, seed: s.seed }),
  };
}

export function dummyRegistry(): Record<string, GameDef<DummyState, { v: number }, DummyView>> {
  return Object.fromEntries(GAME_IDS.map((id) => [id, makeDummy(id)]));
}
