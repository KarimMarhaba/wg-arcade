import type { Sfx, SfxKind } from '../games/types';

export const MUTE_KEY = 'wgarcade.mute';

interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

export interface SfxDeps {
  audio?: typeof AudioContext;
  storage?: StorageLike;
}

export type Sound = Omit<Sfx, 'buzz'>;

interface Note {
  f: number;
  at: number;
  len: number;
  type?: OscillatorType;
  to?: number;
}

const RECIPES: Record<SfxKind, Note[]> = {
  tap: [{ f: 660, at: 0, len: 0.05 }],
  go: [{ f: 880, at: 0, len: 0.14 }],
  ok: [
    { f: 660, at: 0, len: 0.08 },
    { f: 990, at: 0.08, len: 0.14 },
  ],
  bad: [
    { f: 220, at: 0, len: 0.12, type: 'triangle' },
    { f: 165, at: 0.1, len: 0.2, type: 'triangle' },
  ],
  tick: [{ f: 440, at: 0, len: 0.05 }],
  win: [
    { f: 523, at: 0, len: 0.1 },
    { f: 659, at: 0.1, len: 0.1 },
    { f: 784, at: 0.2, len: 0.1 },
    { f: 1047, at: 0.3, len: 0.3 },
  ],
  join: [
    { f: 520, at: 0, len: 0.07, type: 'triangle' },
    { f: 780, at: 0.07, len: 0.1, type: 'triangle' },
  ],
  start: [
    { f: 392, at: 0, len: 0.1 },
    { f: 587, at: 0.1, len: 0.1 },
    { f: 784, at: 0.2, len: 0.2 },
  ],
  whoosh: [{ f: 200, at: 0, len: 0.25, type: 'triangle', to: 900 }],
};

const GAIN = 0.08;
const ATTACK = 0.005;
const FLOOR = 0.0001;
const TAIL = 0.02;

function browserDeps(): SfxDeps {
  const g = globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  let storage: StorageLike | undefined;
  try {
    storage = globalThis.localStorage;
  } catch {
    storage = undefined;
  }
  return { audio: g.AudioContext ?? g.webkitAudioContext, storage };
}

export function createSfx(deps: SfxDeps = browserDeps()): Sound {
  let ctx: AudioContext | undefined;
  let muted = false;
  try {
    muted = deps.storage?.getItem(MUTE_KEY) === '1';
  } catch {
    muted = false;
  }

  return {
    unlock() {
      if (!deps.audio) return;
      try {
        ctx ??= new deps.audio();
        if (ctx.state !== 'running') void Promise.resolve(ctx.resume()).catch(() => {});
      } catch {
        /* kein Audio */
      }
    },
    play(kind) {
      if (muted || !ctx) return;
      try {
        const t0 = ctx.currentTime;
        for (const n of RECIPES[kind]) {
          const t = t0 + n.at;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = n.type ?? 'square';
          osc.frequency.setValueAtTime(n.f, t);
          if (n.to) osc.frequency.exponentialRampToValueAtTime(n.to, t + n.len);
          gain.gain.setValueAtTime(FLOOR, t);
          gain.gain.linearRampToValueAtTime(GAIN, t + ATTACK);
          gain.gain.exponentialRampToValueAtTime(FLOOR, t + n.len);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(t);
          osc.stop(t + n.len + TAIL);
        }
      } catch {
        /* Ton ist nie kritisch */
      }
    },
    muted: () => muted,
    setMuted(on) {
      muted = on;
      try {
        deps.storage?.setItem(MUTE_KEY, on ? '1' : '0');
      } catch {
        /* Speicher gesperrt */
      }
    },
  };
}
