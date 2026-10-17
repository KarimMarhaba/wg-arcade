import { describe, expect, it } from 'vitest';
import { fakeClock } from '../../engine/fakeclock';
import { STOPP_CAP, type StoppInput } from './logic';
import { createStoppRun, type StoppEvent } from './play';

const TARGET = 7000;
const BLIND = 3000;
const LATE = 5000;
const START = 1500;

function setup(o: { start?: number; sent?: boolean; k?: number; advance?: number } = {}) {
  const clock = fakeClock();
  if (o.advance) clock.advance(o.advance);
  const sent: StoppInput[] = [];
  const events: StoppEvent[] = [];
  const run = createStoppRun({
    k: o.k ?? 0,
    target: TARGET,
    start: o.start ?? START,
    blind: BLIND,
    late: LATE,
    sent: o.sent ?? false,
    clock,
    send: (p) => sent.push(p),
    onPhase: (e) => events.push(e),
  });
  return { clock, sent, events, run };
}

const phases = (events: StoppEvent[]): string[] => events.map((e) => e.phase);

describe('Stopp-Zeitlinie', () => {
  it('ready bis zum Start, dann run, nach blind blind', () => {
    const { clock, events } = setup();
    expect(phases(events)).toEqual(['ready']);
    clock.advance(START - 1);
    expect(phases(events)).toEqual(['ready']);
    clock.advance(1);
    expect(phases(events)).toEqual(['ready', 'run']);
    clock.advance(BLIND - 1);
    expect(phases(events)).toEqual(['ready', 'run']);
    clock.advance(1);
    expect(phases(events)).toEqual(['ready', 'run', 'blind']);
  });

  it('die Ereignisse tragen den Versuch', () => {
    const { events } = setup({ k: 2 });
    expect(events).toEqual([{ phase: 'ready', k: 2, dev: null }]);
  });

  it('ohne Tipp: late nach Start + Ziel + Nachfrist, nichts wird gesendet, keine Timer bleiben', () => {
    const { clock, events, sent } = setup();
    clock.advance(START + TARGET + LATE - 1);
    expect(events.at(-1)?.phase).toBe('blind');
    clock.advance(1);
    expect(events.at(-1)).toEqual({ phase: 'late', k: 0, dev: null });
    clock.advance(100_000);
    expect(sent).toEqual([]);
    expect(clock.pending()).toBe(0);
  });
});

describe('Stopp-Messung', () => {
  it('Tipp im Vorlauf wird ignoriert', () => {
    const { clock, run, sent, events } = setup();
    clock.advance(START - 200);
    expect(run.tap(clock.now())).toBeNull();
    expect(sent).toEqual([]);
    expect(phases(events)).toEqual(['ready']);
  });

  it('ein Zeitstempel vor dem Start zaehlt als Vorlauf, auch wenn die Phase schon run ist', () => {
    const { clock, run, sent } = setup();
    clock.advance(START);
    expect(run.tap(START - 3)).toBeNull();
    expect(sent).toEqual([]);
  });

  it('devMs = Tipp - lokaler Start - Ziel, gesendet wird {k, devMs}, danach sent', () => {
    const { clock, run, sent, events } = setup({ k: 1 });
    clock.advance(START + TARGET + 123);
    expect(run.tap(clock.now())).toBe('hit');
    expect(sent).toEqual([{ k: 1, devMs: 123 }]);
    expect(events.at(-1)).toEqual({ phase: 'sent', k: 1, dev: 123 });
  });

  it('ein Tipp vor dem Ziel hat ein negatives Vorzeichen, auch in der Blendung', () => {
    const { clock, run, sent } = setup();
    clock.advance(START + BLIND + 1);
    expect(run.tap(clock.now())).toBe('hit');
    expect(sent).toEqual([{ k: 0, devMs: BLIND + 1 - TARGET }]);
  });

  it('Tipp in der sichtbaren Laufphase zaehlt ebenfalls', () => {
    const { clock, run, sent } = setup();
    clock.advance(START + 100);
    expect(run.tap(clock.now())).toBe('hit');
    expect(sent).toEqual([{ k: 0, devMs: 100 - TARGET }]);
  });

  it('die Messung haengt nur vom lokalen Start und dem Zeitstempel ab, nicht vom Uhrstand', () => {
    const { clock, run, sent } = setup();
    clock.advance(START + 50);
    run.tap(START + TARGET + 40);
    expect(sent).toEqual([{ k: 0, devMs: 40 }]);
  });

  it('kappt auf +10000', () => {
    const { clock, run, sent } = setup();
    clock.advance(START + 100);
    run.tap(START + TARGET + 99_999);
    expect(sent).toEqual([{ k: 0, devMs: STOPP_CAP }]);
  });

  it('genau ein Senden je Versuch: weitere Tipps und das Ende senden nichts', () => {
    const { clock, run, sent } = setup();
    clock.advance(START + 4000);
    expect(run.tap(clock.now())).toBe('hit');
    expect(run.tap(clock.now())).toBeNull();
    expect(run.tap(clock.now() + 5)).toBeNull();
    clock.advance(100_000);
    expect(sent).toHaveLength(1);
    expect(clock.pending()).toBe(0);
  });

  it('nach late ist kein Tipp mehr moeglich', () => {
    const { clock, run, sent } = setup();
    clock.advance(START + TARGET + LATE);
    expect(run.tap(clock.now())).toBeNull();
    expect(sent).toEqual([]);
  });
});

describe('Stopp-Wiedereinstieg und stop()', () => {
  it('Start in der Vergangenheit in der Blendung: beginnt in blind, kein ready und run', () => {
    const { events, run, sent, clock } = setup({ start: 0, advance: BLIND + 500 });
    expect(phases(events)).toEqual(['blind']);
    expect(run.tap(clock.now())).toBe('hit');
    expect(sent).toEqual([{ k: 0, devMs: BLIND + 500 - TARGET }]);
  });

  it('Start in der Vergangenheit in der sichtbaren Laufphase: run, dann blind zur rechten Zeit', () => {
    const { events, clock } = setup({ start: 0, advance: 1000 });
    expect(phases(events)).toEqual(['run']);
    clock.advance(BLIND - 1000);
    expect(phases(events)).toEqual(['run', 'blind']);
  });

  it('Start in der Vergangenheit hinter der Nachfrist: late, ohne Timer', () => {
    const { events, clock } = setup({ start: 0, advance: TARGET + LATE });
    expect(phases(events)).toEqual(['late']);
    expect(clock.pending()).toBe(0);
  });

  it('bereits gesendeter Versuch: sent, kein Timer, kein weiteres Senden', () => {
    const { events, clock, run, sent } = setup({ sent: true });
    expect(events).toEqual([{ phase: 'sent', k: 0, dev: null }]);
    expect(clock.pending()).toBe(0);
    clock.advance(START + 1);
    expect(run.tap(clock.now())).toBeNull();
    expect(sent).toEqual([]);
  });

  it('stop() raeumt alle Timer ab, danach kein Ereignis und kein Senden', () => {
    const { clock, run, events, sent } = setup();
    clock.advance(START + 10);
    expect(clock.pending()).toBeGreaterThan(0);
    run.stop();
    expect(clock.pending()).toBe(0);
    const n = events.length;
    clock.advance(100_000);
    expect(events).toHaveLength(n);
    expect(run.tap(clock.now())).toBeNull();
    expect(sent).toEqual([]);
  });

  it('stop() im Vorlauf raeumt ebenfalls ab', () => {
    const { clock, run } = setup();
    run.stop();
    expect(clock.pending()).toBe(0);
  });
});
