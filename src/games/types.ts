import type { RawDrinks } from '../engine/drinks';
import type { After, Every } from '../engine/types';

export const GAME_IDS = ['blitz', 'hammer', 'farbfalle', 'schaetzfuchs'] as const;
export type GameId = (typeof GAME_IDS)[number];

export interface PlayerRef {
  pid: string;
  name: string;
  color: number;
}

export interface GameCtx {
  speed: number;
  drinking: boolean;
}

export interface GameDef<S, I, V> {
  id: GameId;
  title: string;
  rule: string;
  accent: 'lime' | 'hot' | 'cyan' | 'orange';
  drinkOnly?: true;
  init(players: PlayerRef[], seed: number, now: number, ctx: GameCtx): S;
  parseInput(raw: unknown): I | null;
  input(s: S, pid: string, i: I, now: number): S;
  tick(s: S, now: number, online: ReadonlySet<string>): S;
  done(s: S, now: number): boolean;
  result(s: S): Map<string, number>;
  label(s: S, pid: string): string;
  drinks?(s: S): RawDrinks;
  view(s: S, pid: string, now: number): V;
}

export type SfxKind = 'tap' | 'go' | 'ok' | 'bad' | 'tick' | 'win' | 'join' | 'start' | 'whoosh';
export type FlashKind = 'ok' | 'bad';

export interface Sfx {
  play(kind: SfxKind): void;
  buzz(pattern: number | number[]): void;
  unlock(): void;
  muted(): boolean;
  setMuted(on: boolean): void;
}

export interface Fx {
  punch(el: HTMLElement): void;
  floatText(el: HTMLElement, text: string): void;
  flash(kind: FlashKind): void;
  reducedMotion(): boolean;
}

export interface ViewCtx {
  me: string;
  toLocal(hostT: number): number;
  sfx: Sfx;
  fx: Fx;
  reducedMotion: boolean;
}

export interface Clock {
  now(): number;
  after: After;
  every: Every;
}

export interface PlayerInfo {
  pid: string;
  name: string;
  color: number;
  online: boolean;
}

export interface PlayCtx extends ViewCtx {
  clock: Clock;
  players(): readonly PlayerInfo[];
  setState(state: string, extra?: { step?: number; role?: string }): void;
  punch(): void;
}

export interface Mounted<V> {
  update(v: V): void;
  destroy(): void;
}

export type Render<V, I> = (root: HTMLElement, v: V, send: (p: I) => void, ctx: PlayCtx) => Mounted<V>;
