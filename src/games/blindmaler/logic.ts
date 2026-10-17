import { BM_DRAW, BM_DUO_DRAW, BM_REVEAL, BM_SHOW, GRACE, scale } from '../../engine/durations';
import { mix32, mulberry32, shuffle } from '../../engine/prng';
import { allDone, due, enter, isInt, isRecord, pickDistinct, type Phased } from '../common';
import type { GameDef } from '../types';
import { capStrokes } from './strokes';
import { WORDS } from './words';

export type BmPhase = 'draw' | 'show' | 'reveal' | 'end';

export interface BmPic {
  who: string;
  k: number;
  options: string[];
  ans: number;
}

export interface BmState extends Phased<BmPhase> {
  seed: number;
  pids: string[];
  slots: number;
  slot: number;
  words: Record<string, number[]>;
  ink: Record<string, string[]>[];
  fin: Record<string, true>[];
  imgs: BmPic[];
  j: number;
  tips: Record<string, number>[];
  seen: string[];
  durs: { draw: number; show: number; reveal: number };
}

export type BmInput = { a: 'draw'; k: number; strokes: string[]; fin: boolean } | { a: 'tip'; j: number; i: number };

interface Timed {
  endsAt: number;
  dur: number;
}

interface Shown extends Timed {
  j: number;
  of: number;
  drawer: string;
  strokes: string[];
}

export type BmView =
  | (Timed & { phase: 'draw'; slot: number; slots: number; word: string; fin: boolean; ready: number; total: number })
  | (Shown & { phase: 'show'; role: 'drawer'; tipped: number; viewers: number })
  | (Shown & { phase: 'show'; role: 'viewer'; tipped: number; viewers: number; opts: string[]; mine: number | null })
  | (Shown & { phase: 'reveal'; role: 'drawer' | 'viewer'; word: string; winners: string[]; gain: number; hit: boolean | null })
  | (Timed & { phase: 'end' });

export const BM_OPTIONS = 4;
export const BM_SLOTS = 2;
export const BM_IMAGES = 8;
const DECOYS = BM_OPTIONS - 1;
const DRAWER_GAIN = 2;
const SALT_PICK = 0x424d;
const SALT_GALLERY = 0x4247;

const same = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((x, i) => x === b[i]);
const mark = (s: BmState, pid: string): string[] => (s.seen.includes(pid) ? s.seen : [...s.seen, pid]);
const put = <T>(maps: readonly Record<string, T>[], at: number, pid: string, v: T): Record<string, T>[] =>
  maps.map((m, k) => (k === at ? { ...m, [pid]: v } : m));
const has = (m: Record<string, unknown> | undefined, pid: string): boolean => m !== undefined && Object.hasOwn(m, pid);
const wordAt = (s: BmState, pid: string, k: number): string => WORDS[s.words[pid]?.[k] ?? -1]?.word ?? '';

function winnersOf(s: BmState, j: number): string[] {
  const img = s.imgs[j];
  const tips = s.tips[j];
  if (!img || !tips) return [];
  return s.pids.filter((p) => p !== img.who && has(tips, p) && tips[p] === img.ans);
}

function score(s: BmState, pid: string): number {
  return s.imgs.reduce((sum, img, j) => {
    const right = winnersOf(s, j);
    return sum + (img.who === pid ? DRAWER_GAIN * right.length : right.includes(pid) ? 1 : 0);
  }, 0);
}

function startImage(s: BmState, j: number, now: number): BmState {
  const who = (s.imgs[j] as BmPic).who;
  return s.pids.some((p) => p !== who)
    ? { ...enter(s, 'show', now, s.durs.show), j }
    : { ...enter(s, 'reveal', now, s.durs.reveal), j };
}

function gallery(s: BmState, now: number): BmState {
  const drawn = Array.from({ length: s.slots }, (_, k) =>
    s.pids.filter((p) => (s.ink[k]?.[p]?.length ?? 0) > 0).map((who) => ({ who, k })),
  ).flat();
  if (drawn.length === 0) return { ...s, phase: 'end' };
  const rng = mulberry32(mix32(s.seed, SALT_GALLERY));
  const used = new Set(Object.values(s.words).flat());
  const pool = WORDS.map((_, i) => i).filter((i) => !used.has(i));
  const imgs = shuffle(rng, drawn).map(({ who, k }): BmPic => {
    const truth = (s.words[who] as number[])[k] as number;
    const cat = (WORDS[truth] as { cat: string }).cat;
    const near = shuffle(rng, pool.filter((i) => (WORDS[i] as { cat: string }).cat === cat));
    const far = shuffle(rng, pool.filter((i) => (WORDS[i] as { cat: string }).cat !== cat));
    const options = shuffle(rng, [truth, ...[...near, ...far].slice(0, DECOYS)]).map((i) => (WORDS[i] as { word: string }).word);
    return { who, k, options, ans: options.indexOf((WORDS[truth] as { word: string }).word) };
  });
  return startImage({ ...s, imgs, tips: imgs.map(() => ({})) }, 0, now);
}

export const blindmaler: GameDef<BmState, BmInput, BmView> = {
  id: 'blindmaler',
  title: 'BLINDMALER',
  rule: 'Zeichne deinen Begriff, ohne deinen Strich zu sehen. Danach rätst du, was die anderen gemalt haben.',
  accent: 'cyan',
  init(players, seed, now, ctx) {
    const pids = players.map((p) => p.pid);
    const slots = pids.length === 2 ? BM_SLOTS : 1;
    const picks = pickDistinct(mulberry32(mix32(seed, SALT_PICK)), WORDS.map((_, i) => i), pids.length * slots);
    const draw = scale(slots === BM_SLOTS ? BM_DUO_DRAW : BM_DRAW, ctx.speed);
    return {
      seed,
      pids,
      slots,
      slot: 0,
      words: Object.fromEntries(pids.map((p, i) => [p, picks.slice(i * slots, (i + 1) * slots)])),
      ink: Array.from({ length: slots }, () => ({})),
      fin: Array.from({ length: slots }, () => ({})),
      imgs: [],
      j: 0,
      tips: [],
      seen: [],
      durs: { draw, show: scale(BM_SHOW, ctx.speed), reveal: scale(BM_REVEAL, ctx.speed) },
      phase: 'draw',
      endsAt: now + draw,
      dur: draw,
    };
  },
  parseInput(raw) {
    if (!isRecord(raw)) return null;
    if (raw.a === 'draw') {
      if (!isInt(raw.k) || raw.k < 0 || raw.k >= BM_SLOTS || !Array.isArray(raw.strokes)) return null;
      return { a: 'draw', k: raw.k, strokes: capStrokes(raw.strokes), fin: raw.fin === true };
    }
    if (raw.a !== 'tip') return null;
    const ok = isInt(raw.j) && raw.j >= 0 && raw.j < BM_IMAGES && isInt(raw.i) && raw.i >= 0 && raw.i < BM_OPTIONS;
    return ok ? { a: 'tip', j: raw.j as number, i: raw.i as number } : null;
  },
  input(s, pid, i, now) {
    if (!s.pids.includes(pid)) return s;
    if (i.a === 'draw') {
      if (s.phase !== 'draw' || i.k !== s.slot || now >= s.endsAt + GRACE || has(s.fin[s.slot], pid)) return s;
      const unchanged = same(s.ink[s.slot]?.[pid] ?? [], i.strokes);
      if (unchanged && !i.fin) return s;
      return {
        ...s,
        ink: unchanged ? s.ink : put(s.ink, s.slot, pid, i.strokes),
        fin: i.fin ? put(s.fin, s.slot, pid, true as const) : s.fin,
        seen: mark(s, pid),
      };
    }
    const img = s.imgs[s.j];
    if (s.phase !== 'show' || i.j !== s.j || !img || img.who === pid || has(s.tips[s.j], pid)) return s;
    return { ...s, tips: put(s.tips, s.j, pid, i.i), seen: mark(s, pid) };
  },
  tick(s, now, online) {
    switch (s.phase) {
      case 'draw': {
        if (now < s.endsAt + GRACE && !allDone(s.pids, online, (p) => has(s.fin[s.slot], p))) return s;
        return s.slot + 1 < s.slots ? { ...enter(s, 'draw', now, s.durs.draw), slot: s.slot + 1 } : gallery(s, now);
      }
      case 'show': {
        const who = (s.imgs[s.j] as BmPic).who;
        const tips = s.tips[s.j];
        const early = allDone(
          s.pids.filter((p) => p !== who),
          online,
          (p) => has(tips, p),
        );
        return due(s, now) || early ? enter(s, 'reveal', now, s.durs.reveal) : s;
      }
      case 'reveal':
        return due(s, now) && s.j + 1 < s.imgs.length ? startImage(s, s.j + 1, now) : s;
      case 'end':
        return s;
    }
  },
  done: (s, now) => s.phase === 'end' || (s.phase === 'reveal' && s.j === s.imgs.length - 1 && due(s, now)),
  result: (s) => new Map(s.seen.filter((p) => s.pids.includes(p)).map((p) => [p, score(s, p)] as [string, number])),
  label: (s, pid) => (s.seen.includes(pid) ? `${score(s, pid)} Pkt` : '–'),
  view(s, pid) {
    const t: Timed = { endsAt: s.endsAt, dur: s.dur };
    if (s.phase === 'end') return { ...t, phase: 'end' };
    if (s.phase === 'draw')
      return {
        ...t,
        phase: 'draw',
        slot: s.slot,
        slots: s.slots,
        word: wordAt(s, pid, s.slot),
        fin: has(s.fin[s.slot], pid),
        ready: Object.keys(s.fin[s.slot] ?? {}).length,
        total: s.pids.length,
      };
    const img = s.imgs[s.j] as BmPic;
    const tips = s.tips[s.j] ?? {};
    const shown: Shown = { ...t, j: s.j, of: s.imgs.length, drawer: img.who, strokes: s.ink[img.k]?.[img.who] ?? [] };
    const drawer = pid === img.who;
    if (s.phase === 'show') {
      const count = { tipped: Object.keys(tips).length, viewers: s.pids.length - 1 };
      return drawer
        ? { ...shown, phase: 'show', role: 'drawer', ...count }
        : { ...shown, phase: 'show', role: 'viewer', ...count, opts: img.options, mine: has(tips, pid) ? (tips[pid] as number) : null };
    }
    const winners = winnersOf(s, s.j);
    return {
      ...shown,
      phase: 'reveal',
      role: drawer ? 'drawer' : 'viewer',
      word: img.options[img.ans] as string,
      winners,
      gain: drawer ? DRAWER_GAIN * winners.length : winners.includes(pid) ? 1 : 0,
      hit: drawer || !has(tips, pid) ? null : winners.includes(pid),
    };
  },
};
