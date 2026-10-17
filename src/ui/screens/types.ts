import type { HostControl } from '../../engine/host';
import type { ViewCtx } from '../../games/types';

export interface Store {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

export interface Env {
  ctx: ViewCtx;
  send(round: number, payload: unknown): void;
  control?: (a: HostControl) => void;
  joinUrl(code: string): string;
}

export interface Unmount {
  destroy(): void;
}
