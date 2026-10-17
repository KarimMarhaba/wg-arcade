import { describe, expect, it } from 'vitest';
import { fakeClock } from '../../engine/fakeclock';
import { HAMMER_CAP, type HammerInput } from './logic';
import { createHammerRun } from './play';

function setup(o: { from?: number; end?: number } = {}) {
  const clock = fakeClock();
  const sent: HammerInput[] = [];
  const counts: number[] = [];
  let done = 0;
  const run = createHammerRun({
    from: o.from ?? 0,
    end: o.end ?? 800,
    clock,
    send: (p) => sent.push(p),
    onCount: (n) => counts.push(n),
    onDone: () => void done++,
  });
  return { clock, sent, counts, run, done: () => done };
}

describe('Hammer-Takt', () => {
  it('zählt jeden Tap lokal und meldet den Stand', () => {
    const { run, counts } = setup();
    expect(run.tap()).toBe(true);
    expect(run.tap()).toBe(true);
    expect(counts).toEqual([1, 2]);
  });

  it('sendet höchstens alle 200 ms und nur bei Änderung', () => {
    const { clock, sent, run } = setup({ end: 10_000 });
    for (let k = 0; k < 10; k++) {
      clock.advance(19);
      run.tap();
    }
    expect(sent).toEqual([]);
    clock.advance(10);
    expect(sent).toEqual([{ n: 10, final: false }]);
    clock.advance(200);
    expect(sent).toHaveLength(1);
    run.tap();
    clock.advance(199);
    expect(sent).toHaveLength(1);
    clock.advance(1);
    expect(sent).toEqual([{ n: 10, final: false }, { n: 11, final: false }]);
  });

  it('sendet am lokalen Ende {n, final:true} genau einmal und meldet onDone', () => {
    const { clock, sent, run, done } = setup();
    clock.advance(100);
    run.tap();
    clock.advance(699);
    expect(done()).toBe(0);
    clock.advance(1);
    expect(done()).toBe(1);
    expect(sent.at(-1)).toEqual({ n: 1, final: true });
    expect(sent.filter((p) => p.final)).toHaveLength(1);
    clock.advance(10_000);
    expect(sent.filter((p) => p.final)).toHaveLength(1);
    expect(clock.pending()).toBe(0);
  });

  it('meldet final auch bei 0 Taps', () => {
    const { clock, sent } = setup();
    clock.advance(800);
    expect(sent).toEqual([{ n: 0, final: true }]);
  });

  it('final trägt den Stand seit dem letzten Takt', () => {
    const { clock, sent, run } = setup();
    clock.advance(750);
    run.tap();
    run.tap();
    clock.advance(50);
    expect(sent.at(-1)).toEqual({ n: 2, final: true });
  });

  it('ignoriert Taps nach dem Ende', () => {
    const { clock, sent, counts, run } = setup();
    clock.advance(800);
    expect(run.tap()).toBe(false);
    expect(counts).toEqual([]);
    expect(sent).toEqual([{ n: 0, final: true }]);
  });

  it('deckelt den Zähler bei HAMMER_CAP', () => {
    const { run, counts } = setup({ end: 10_000 });
    for (let k = 0; k < HAMMER_CAP + 5; k++) run.tap();
    expect(counts.at(-1)).toBe(HAMMER_CAP);
    expect(counts).toHaveLength(HAMMER_CAP);
  });

  it('Wiedereinstieg: setzt beim Stand der Sicht fort und sendet ihn nicht erneut', () => {
    const { clock, sent, counts, run } = setup({ from: 12, end: 500 });
    clock.advance(200);
    expect(sent).toEqual([]);
    run.tap();
    expect(counts).toEqual([13]);
    clock.advance(300);
    expect(sent).toEqual([{ n: 13, final: false }, { n: 13, final: true }]);
  });

  it('stop() beendet Takt und Ende ohne final', () => {
    const { clock, sent, run } = setup();
    run.tap();
    run.stop();
    expect(clock.pending()).toBe(0);
    clock.advance(5_000);
    expect(sent).toEqual([]);
    expect(run.tap()).toBe(false);
  });
});
