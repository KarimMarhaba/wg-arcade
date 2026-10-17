import type { GameId } from '../games/types';

export interface PlayerView {
  pid: string;
  name: string;
  color: number;
  online: boolean;
  total: number;
  host: boolean;
}

interface Base {
  me: string;
  isHost: boolean;
  code: string;
  players: PlayerView[];
}

export type View = Base &
  (
    | { s: 'lobby'; rounds: 3 | 5 | 8; canStart: boolean; min: number }
    | { s: 'intro'; r: number; n: number; game: GameId; title: string; rule: string; accent: string; until: number }
    | { s: 'game'; r: number; n: number; game: GameId; g: unknown }
    | {
        s: 'result';
        r: number;
        n: number;
        game: GameId;
        until: number;
        rows: { pid: string; place: number; points: number; total: number; label: string }[];
      }
    | { s: 'podium'; rows: { pid: string; place: number; total: number }[] }
  );
