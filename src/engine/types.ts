import type { RejectReason } from '../net/protocol';
import type { GameId } from '../games/types';
import type { DrinkPlan } from './drinks';

export interface Player {
  pid: string;
  name: string;
  color: number;
  online: boolean;
  lastSeen: number;
  total: number;
}

export interface RoundRecord {
  gameId: GameId;
  places: Record<string, number>;
  points: Record<string, number>;
  labels: Record<string, string>;
  drinks: DrinkPlan | null;
}

export type Phase =
  | { k: 'lobby' }
  | { k: 'intro'; r: number; until: number }
  | { k: 'play'; r: number; started: number; state: unknown }
  | { k: 'result'; r: number; until: number }
  | { k: 'podium' };

export type Rounds = 3 | 5 | 8;

export interface Party {
  code: string;
  seed: number;
  hostPid: string;
  dev: boolean;
  speed: number;
  players: Player[];
  rounds: number;
  drinking: boolean;
  order: GameId[];
  phase: Phase;
  history: RoundRecord[];
}

export type HostAction =
  | { a: 'rounds'; n: Rounds }
  | { a: 'drinking'; on: boolean }
  | { a: 'start' }
  | { a: 'next' }
  | { a: 'again'; seed: number }
  | { a: 'lobby'; seed: number };

export type HelloResult = { ok: true; pid: string } | { ok: false; reason: RejectReason };

export type Every = (ms: number, fn: () => void) => () => void;
export type After = (ms: number, fn: () => void) => () => void;
