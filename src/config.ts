import { GAME_IDS, type GameId } from './games/types';

export interface Flags {
  net: 'local' | 'peer';
  dev: boolean;
  fast: boolean;
  speed: number;
  only: GameId | undefined;
  seed: number | undefined;
  rounds: number | undefined;
}

const isOn = (v: string | null): boolean => v !== null && v !== '0' && v !== 'false';

const UINT32_MAX = 4294967295;
const MAX_ROUNDS = 8;

function uint(v: string | null, max: number, min = 0): number | undefined {
  if (v === null || !/^\d+$/.test(v)) return undefined;
  const n = Number(v);
  return n >= min && n <= max ? n : undefined;
}

export function parseFlags(search: string): Flags {
  const q = new URLSearchParams(search);
  const dev = isOn(q.get('dev'));
  const fast = dev && isOn(q.get('fast'));
  const only = q.get('only');
  return {
    net: q.get('net') === 'local' ? 'local' : 'peer',
    dev,
    fast,
    speed: fast ? 10 : 1,
    only: dev ? GAME_IDS.find((id) => id === only) : undefined,
    seed: dev ? uint(q.get('seed'), UINT32_MAX) : undefined,
    rounds: dev ? uint(q.get('rounds'), MAX_ROUNDS, 1) : undefined,
  };
}

const JOIN_KEYS = ['net', 'dev', 'fast'];

export function joinUrl(origin: string, base: string, search: string, code: string): string {
  const src = new URLSearchParams(search);
  const q = new URLSearchParams();
  for (const k of JOIN_KEYS) {
    const v = src.get(k);
    if (v !== null) q.set(k, v);
  }
  const qs = q.toString();
  return `${origin}${base}${qs ? `?${qs}` : ''}#/j/${code}`;
}
