export const GAME_IDS = ['blitz', 'hammer', 'farbfalle', 'schaetzfuchs'] as const;
export type GameId = (typeof GAME_IDS)[number];

export interface PlayerRef {
  pid: string;
  name: string;
  color: number;
}

export interface GameCtx {
  speed: number;
}

export interface GameDef<S, I, V> {
  id: GameId;
  title: string;
  rule: string;
  accent: 'lime' | 'hot' | 'cyan' | 'orange';
  init(players: PlayerRef[], seed: number, now: number, ctx: GameCtx): S;
  parseInput(raw: unknown): I | null;
  input(s: S, pid: string, i: I, now: number): S;
  tick(s: S, now: number, online: ReadonlySet<string>): S;
  done(s: S, now: number): boolean;
  result(s: S): Map<string, number>;
  label(s: S, pid: string): string;
  view(s: S, pid: string, now: number): V;
}

export interface ViewCtx {
  me: string;
  toLocal(hostT: number): number;
  reducedMotion: boolean;
}

export interface Mounted<V> {
  update(v: V): void;
  destroy(): void;
}

export type Render<V, I> = (root: HTMLElement, v: V, send: (p: I) => void, ctx: ViewCtx) => Mounted<V>;
