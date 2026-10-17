import { GAME_IDS, type GameId } from './games/types';

export interface Flags {
  net: 'local' | 'peer';
  dev: boolean;
  fast: boolean;
  speed: number;
  only: GameId | undefined;
}

const isOn = (v: string | null): boolean => v !== null && v !== '0' && v !== 'false';

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
  };
}
