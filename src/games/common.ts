import { mulberry32, shuffle, type Rng } from '../engine/prng';

export function allDone(pids: readonly string[], online: ReadonlySet<string>, isDone: (pid: string) => boolean): boolean {
  const here = pids.filter((pid) => online.has(pid));
  return here.length > 0 && here.every(isDone);
}

export const isRecord = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

export const isInt = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x);

export const isStr = (x: unknown, max: number): x is string =>
  typeof x === 'string' && x.trim().length >= 1 && x.trim().length <= max;

export function clampInt(x: number, lo: number, hi: number): number {
  if (typeof x !== 'number' || Number.isNaN(x)) return lo;
  return Math.min(hi, Math.max(lo, Math.floor(x)));
}

export const turnOrder = (seed: number, pids: readonly string[]): string[] => shuffle(mulberry32(seed), pids);

export function ringNext(order: readonly string[], pid: string): string | undefined {
  const i = order.indexOf(pid);
  return i < 0 ? undefined : order[(i + 1) % order.length];
}

export function pickDistinct<T>(rng: Rng, xs: readonly T[], k: number): T[] {
  const n = Number.isFinite(k) ? Math.max(0, Math.floor(k)) : 0;
  return shuffle(rng, xs).slice(0, n);
}

export function tally(votes: Readonly<Record<string, string>>): Map<string, number> {
  const out = new Map<string, number>();
  for (const v of Object.values(votes)) out.set(v, (out.get(v) ?? 0) + 1);
  return out;
}

export function leaders(counts: ReadonlyMap<string, number>): string[] {
  const top = Math.max(0, ...counts.values());
  return top === 0 ? [] : [...counts].filter(([, n]) => n === top).map(([k]) => k);
}

export interface Phased<P> {
  phase: P;
  endsAt: number;
  dur: number;
}

export const enter = <P, S extends Phased<P>>(s: S, phase: P, now: number, dur: number): S => ({
  ...s,
  phase,
  endsAt: now + dur,
  dur,
});

export const due = (s: { endsAt: number }, now: number): boolean => now >= s.endsAt;
