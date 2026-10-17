import { describe, expect, it } from 'vitest';
import { fakeClock } from '../../engine/fakeclock';
import type { BlitzPhase, BlitzSend } from './play';
import { createBlitzRun } from './play';

const WAITS = [200, 300, 400];
const SHOW = 90;
const MAX = 1000;
const FAR = 1_000_000;

interface Ev {
  phase: BlitzPhase;
  i: number;
  ms: number | null;
}

function setup(o: { next?: number; end?: number } = {}) {
  const clock = fakeClock();
  const sent: BlitzSend[] = [];
  const events: Ev[] = [];
  const run = createBlitzRun({
    waits: WAITS,
    show: SHOW,
    max: MAX,
    next: o.next ?? 0,
    end: o.end ?? FAR,
    clock,
    send: (p) => sent.push(p),
    onPhase: (e) => events.push(e),
  });
  return { clock, sent, events, run };
}

const phases = (events: Ev[]): string[] => events.map((e) => `${e.phase}${e.i}`);

describe('Blitz-Zeitlinie', () => {
  it('startet in wait, schaltet nach der Wartezeit auf go', () => {
    const { clock, events } = setup();
    expect(phases(events)).toEqual(['wait0']);
    clock.advance(199);
    expect(phases(events)).toEqual(['wait0']);
    clock.advance(1);
    expect(phases(events)).toEqual(['wait0', 'go0']);
  });

  it('Tap in go misst ab go und sendet {i, ms}', () => {
    const { clock, sent, events, run } = setup();
    clock.advance(200 + 137);
    expect(run.tap(clock.now())).toBe('hit');
    expect(sent).toEqual([{ i: 0, ms: 137 }]);
    expect(events.at(-1)).toEqual({ phase: 'show', i: 0, ms: 137 });
  });

  it('nach show folgt wait des nächsten Versuchs mit eigener Wartezeit', () => {
    const { clock, events, run } = setup();
    clock.advance(200 + 50);
    run.tap(clock.now());
    clock.advance(SHOW - 1);
    expect(events.at(-1)?.phase).toBe('show');
    clock.advance(1);
    expect(events.at(-1)).toEqual({ phase: 'wait', i: 1, ms: null });
    clock.advance(299);
    expect(events.at(-1)?.phase).toBe('wait');
    clock.advance(1);
    expect(events.at(-1)).toEqual({ phase: 'go', i: 1, ms: null });
  });

  it('drei Taps ergeben drei Payloads und done, danach nichts mehr', () => {
    const { clock, sent, events, run } = setup();
    for (const [k, w] of WAITS.entries()) {
      clock.advance(w + 100);
      expect(run.tap(clock.now())).toBe('hit');
      if (k < 2) clock.advance(SHOW);
    }
    expect(sent).toEqual([
      { i: 0, ms: 100 },
      { i: 1, ms: 100 },
      { i: 2, ms: 100 },
    ]);
    expect(events.at(-1)).toEqual({ phase: 'done', i: 2, ms: 100 });
    expect(run.tap(clock.now())).toBeNull();
    clock.advance(10_000);
    expect(sent).toHaveLength(3);
    expect(clock.pending()).toBe(0);
  });

  it('Tap in wait ist ein Frühstart: {i, early:true}, der Versuch ist verbraucht', () => {
    const { clock, sent, events, run } = setup();
    clock.advance(50);
    expect(run.tap(clock.now())).toBe('early');
    expect(sent).toEqual([{ i: 0, early: true }]);
    expect(events.at(-1)).toEqual({ phase: 'early', i: 0, ms: MAX });
    clock.advance(10_000);
    expect(sent).toEqual([{ i: 0, early: true }, { i: 1, ms: MAX }, { i: 2, ms: MAX }]);
  });

  it('nach early kommt der nächste Versuch erst nach show, go des alten Versuchs entfällt', () => {
    const { clock, events, run } = setup();
    clock.advance(50);
    run.tap(clock.now());
    clock.advance(SHOW - 1);
    expect(phases(events)).toEqual(['wait0', 'early0']);
    clock.advance(1);
    expect(phases(events)).toEqual(['wait0', 'early0', 'wait1']);
    clock.advance(1_000);
    expect(events.some((e) => e.phase === 'go' && e.i === 0)).toBe(false);
  });

  it('ein Tap vor dem go-Zeitpunkt gilt als Frühstart', () => {
    const { clock, sent, run } = setup();
    clock.advance(200);
    expect(run.tap(clock.now() - 5)).toBe('early');
    expect(sent).toEqual([{ i: 0, early: true }]);
  });

  it('kein Tap: nach 1000 ms geht {i, ms:1000} raus und show beginnt', () => {
    const { clock, sent, events } = setup();
    clock.advance(200 + MAX - 1);
    expect(sent).toEqual([]);
    clock.advance(1);
    expect(sent).toEqual([{ i: 0, ms: MAX }]);
    expect(events.at(-1)).toEqual({ phase: 'show', i: 0, ms: MAX });
  });

  it('ohne jeden Tap melden alle drei Versuche 1000 und es folgt done', () => {
    const { clock, sent, events } = setup();
    clock.advance(10_000);
    expect(sent).toEqual([{ i: 0, ms: MAX }, { i: 1, ms: MAX }, { i: 2, ms: MAX }]);
    expect(events.at(-1)?.phase).toBe('done');
    expect(clock.pending()).toBe(0);
  });

  it('Taps in show werden ignoriert', () => {
    const { clock, sent, run } = setup();
    clock.advance(250);
    run.tap(clock.now());
    clock.advance(10);
    expect(run.tap(clock.now())).toBeNull();
    expect(sent).toHaveLength(1);
  });

  it('Wiedereinstieg: next=1 startet in wait des zweiten Versuchs', () => {
    const { clock, events, sent } = setup({ next: 1 });
    expect(phases(events)).toEqual(['wait1']);
    clock.advance(300);
    expect(phases(events)).toEqual(['wait1', 'go1']);
    expect(sent).toEqual([]);
  });

  it('Wiedereinstieg: next=3 ist sofort done, nichts wird gesendet', () => {
    const { clock, events, sent } = setup({ next: 3 });
    expect(events).toEqual([{ phase: 'done', i: 2, ms: null }]);
    clock.advance(10_000);
    expect(sent).toEqual([]);
  });

  it('am Ende der lokalen Zeit werden alle offenen Versuche mit 1000 gemeldet', () => {
    const { clock, sent, events } = setup({ end: 500 });
    clock.advance(499);
    expect(sent).toEqual([]);
    clock.advance(1);
    expect(sent).toEqual([{ i: 0, ms: MAX }, { i: 1, ms: MAX }, { i: 2, ms: MAX }]);
    expect(events.at(-1)?.phase).toBe('done');
    clock.advance(10_000);
    expect(sent).toHaveLength(3);
  });

  it('das Ende überschreibt keinen schon gemeldeten Versuch', () => {
    const { clock, sent, run } = setup({ end: 600 });
    clock.advance(250);
    run.tap(clock.now());
    clock.advance(1_000);
    expect(sent).toEqual([{ i: 0, ms: 50 }, { i: 1, ms: MAX }, { i: 2, ms: MAX }]);
  });

  it('stop() beendet alle Timer', () => {
    const { clock, sent, run } = setup();
    run.stop();
    expect(clock.pending()).toBe(0);
    clock.advance(10_000);
    expect(sent).toEqual([]);
    expect(run.tap(clock.now())).toBeNull();
  });
});
