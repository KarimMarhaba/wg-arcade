import type { BlitzView } from './blitz/logic';
import type { FarbfalleView } from './farbfalle/logic';
import type { HammerView } from './hammer/logic';
import type { SchaetzfuchsView } from './schaetzfuchs/logic';

type ToLocal = (hostT: number) => number;

const endOf = (resumed: boolean, mountedAt: number, dur: number, endsAt: number, toLocal: ToLocal): number =>
  resumed ? toLocal(endsAt) : mountedAt + dur;

export function resumeBlitz(v: BlitzView, mountedAt: number, toLocal: ToLocal) {
  const open = v.mine.findIndex((x) => x === null);
  return {
    end: endOf(v.mine.some((x) => x !== null), mountedAt, v.dur, v.endsAt, toLocal),
    next: open === -1 ? v.mine.length : open,
  };
}

export function resumeHammer(v: HammerView, mountedAt: number, toLocal: ToLocal) {
  return { end: endOf(v.mine > 0, mountedAt, v.dur, v.endsAt, toLocal), count: v.mine };
}

export function resumeFarbfalle(v: FarbfalleView, mountedAt: number, toLocal: ToLocal) {
  return { end: endOf(v.next > 0, mountedAt, v.dur, v.endsAt, toLocal), next: v.next, score: v.score };
}

export function resumeSchaetzfuchs(v: Extract<SchaetzfuchsView, { phase: 'ask' }>, mountedAt: number, toLocal: ToLocal) {
  return { end: endOf(v.myGuess !== null, mountedAt, v.dur, v.endsAt, toLocal), guess: v.myGuess };
}
