import { describe, expect, it } from 'vitest';
import { fakeClock } from '../../engine/fakeclock';
import { BOMBE_CAP, type BombeInput, type BombeRes } from './logic';
import { createBombeRun, type BombeEvent } from './play';

const SHOW = 90;
const pop: BombeRes = { s: 'pop', pts: 0 };
const cashed = (n: number): BombeRes => ({ s: 'cash', pts: n * n });

function setup(o: { b?: number; n?: number; end?: number } = {}) {
  const clock = fakeClock();
  const sent: BombeInput[] = [];
  const events: BombeEvent[] = [];
  const run = createBombeRun({
    b: o.b ?? 0,
    n: o.n ?? 0,
    end: o.end ?? 1_000_000,
    show: SHOW,
    clock,
    send: (p) => sent.push(p),
    onPhase: (e) => events.push(e),
  });
  return { clock, sent, events, run };
}

const phases = (events: BombeEvent[]): string[] => events.map((e) => `${e.phase}${e.b}`);

describe('Bombe-Lauf: Pumpen', () => {
  it('startet in pump beim uebergebenen Ballon und Stand', () => {
    expect(setup().events).toEqual([{ phase: 'pump', b: 0, n: 0, pts: 0, locked: false }]);
    expect(setup({ b: 1, n: 2 }).events).toEqual([{ phase: 'pump', b: 1, n: 2, pts: 4, locked: false }]);
  });

  it('jeder Pump sendet sofort und kumulativ', () => {
    const { run, sent, events } = setup();
    expect(run.pump()).toBe(true);
    expect(sent).toEqual([{ b: 0, n: 1, cash: false }]);
    run.pump();
    run.pump();
    expect(sent).toEqual([
      { b: 0, n: 1, cash: false },
      { b: 0, n: 2, cash: false },
      { b: 0, n: 3, cash: false },
    ]);
    expect(events.at(-1)).toEqual({ phase: 'pump', b: 0, n: 3, pts: 9, locked: false });
  });

  it('kappt bei 40: der 41. Pump sendet nichts', () => {
    const { run, sent } = setup();
    for (let k = 0; k < BOMBE_CAP; k++) expect(run.pump()).toBe(true);
    expect(run.pump()).toBe(false);
    expect(sent).toHaveLength(BOMBE_CAP);
    expect(sent.at(-1)).toEqual({ b: 0, n: BOMBE_CAP, cash: false });
  });

  it('Wiedereinstieg: setzt beim Stand der Sicht fort und sendet ihn nicht erneut', () => {
    const { run, sent } = setup({ b: 1, n: 2 });
    expect(sent).toEqual([]);
    run.pump();
    expect(sent).toEqual([{ b: 1, n: 3, cash: false }]);
  });
});

describe('Bombe-Lauf: Kassieren und Urteil', () => {
  it('Kassieren sendet {b, n, cash:true} und sperrt Pumpen und Kassieren', () => {
    const { run, sent, events } = setup();
    run.pump();
    run.pump();
    expect(run.cash()).toBe(true);
    expect(sent.at(-1)).toEqual({ b: 0, n: 2, cash: true });
    expect(events.at(-1)).toEqual({ phase: 'pump', b: 0, n: 2, pts: 4, locked: true });
    const count = sent.length;
    expect(run.pump()).toBe(false);
    expect(run.cash()).toBe(false);
    expect(sent).toHaveLength(count);
  });

  it('Kassieren mit n = 0 ist erlaubt', () => {
    const { run, sent } = setup();
    expect(run.cash()).toBe(true);
    expect(sent).toEqual([{ b: 0, n: 0, cash: true }]);
  });

  it('die Sperre bleibt bis zum Urteil der Sicht, auch ohne Urteil nach langer Zeit', () => {
    const { run, clock, events } = setup();
    run.pump();
    run.cash();
    clock.advance(10_000);
    expect(events.at(-1)?.locked).toBe(true);
    expect(run.pump()).toBe(false);
  });

  it('Urteil cash: cashed mit Punkten, nach show der naechste Ballon bei n = 0', () => {
    const { run, clock, events, sent } = setup();
    run.pump();
    run.pump();
    run.cash();
    run.sync({ n: 2, res: [cashed(2)] });
    expect(events.at(-1)).toEqual({ phase: 'cashed', b: 0, n: 2, pts: 4, locked: true });
    expect(run.pump()).toBe(false);
    clock.advance(SHOW - 1);
    expect(events.at(-1)?.phase).toBe('cashed');
    clock.advance(1);
    expect(events.at(-1)).toEqual({ phase: 'pump', b: 1, n: 0, pts: 0, locked: false });
    run.pump();
    expect(sent.at(-1)).toEqual({ b: 1, n: 1, cash: false });
  });

  it('Urteil pop (ohne Kassieren): popped mit 0 Punkten, kein Senden mehr fuer diesen Ballon', () => {
    const { run, clock, events, sent } = setup();
    run.pump();
    run.pump();
    run.sync({ n: 0, res: [pop] });
    expect(events.at(-1)).toEqual({ phase: 'popped', b: 0, n: 2, pts: 0, locked: true });
    const count = sent.length;
    expect(run.pump()).toBe(false);
    expect(run.cash()).toBe(false);
    clock.advance(SHOW);
    expect(sent).toHaveLength(count);
    expect(phases(events)).toEqual(['pump0', 'pump0', 'pump0', 'popped0', 'pump1']);
  });

  it('wiederholte Urteile derselben Sicht erzeugen keine zweiten Ereignisse', () => {
    const { run, clock, events } = setup();
    run.pump();
    run.sync({ n: 0, res: [pop] });
    const n = events.length;
    run.sync({ n: 0, res: [pop] });
    clock.advance(SHOW - 1);
    run.sync({ n: 0, res: [pop] });
    expect(events).toHaveLength(n);
    clock.advance(1);
    run.sync({ n: 0, res: [pop] });
    expect(phases(events).slice(-1)).toEqual(['pump1']);
  });

  it('eine Sicht ohne Urteil aendert nichts', () => {
    const { run, events } = setup();
    run.pump();
    const n = events.length;
    run.sync({ n: 1, res: [] });
    expect(events).toHaveLength(n);
  });

  it('ein niedrigerer Stand der Sicht senkt den lokalen Zaehler nie, ein hoeherer hebt ihn', () => {
    const { run, sent, events } = setup();
    run.pump();
    run.pump();
    run.pump();
    run.sync({ n: 1, res: [] });
    run.pump();
    expect(sent.at(-1)).toEqual({ b: 0, n: 4, cash: false });
    run.sync({ n: 9, res: [] });
    expect(events.at(-1)).toEqual({ phase: 'pump', b: 0, n: 9, pts: 81, locked: false });
    run.pump();
    expect(sent.at(-1)).toEqual({ b: 0, n: 10, cash: false });
  });

  it('drei Urteile: nach dem letzten show kommt done, danach nichts mehr', () => {
    const { run, clock, events, sent } = setup();
    for (let b = 0; b < 3; b++) {
      run.pump();
      run.cash();
      run.sync({ n: 0, res: [...Array.from({ length: b }, () => cashed(1)), cashed(1)] });
      clock.advance(SHOW);
    }
    expect(phases(events).slice(-2)).toEqual(['cashed2', 'done2']);
    const count = sent.length;
    expect(run.pump()).toBe(false);
    expect(run.cash()).toBe(false);
    clock.advance(10_000);
    expect(sent).toHaveLength(count);
    expect(clock.pending()).toBe(0);
  });
});

describe('Bombe-Lauf: Ende und stop', () => {
  it('lokales Ende: done ohne Auto-Kassieren', () => {
    const { run, clock, sent, events } = setup({ end: 1000 });
    run.pump();
    run.pump();
    clock.advance(999);
    expect(events.at(-1)?.phase).toBe('pump');
    clock.advance(1);
    expect(events.at(-1)).toEqual({ phase: 'done', b: 0, n: 2, pts: 0, locked: true });
    expect(sent.filter((p) => p.cash)).toEqual([]);
    expect(run.pump()).toBe(false);
    expect(run.cash()).toBe(false);
    expect(clock.pending()).toBe(0);
  });

  it('das Ende unterbricht die show-Pause', () => {
    const { run, clock, events } = setup({ end: 500 });
    run.pump();
    run.cash();
    clock.advance(450);
    run.sync({ n: 1, res: [cashed(1)] });
    clock.advance(50);
    expect(events.at(-1)?.phase).toBe('done');
    clock.advance(10_000);
    expect(phases(events)).not.toContain('pump1');
    expect(clock.pending()).toBe(0);
  });

  it('Start mit abgelaufenem Ende endet sofort', () => {
    const { events, clock } = setup({ end: 0 });
    clock.advance(0);
    expect(events.at(-1)?.phase).toBe('done');
  });

  it('Start nach dem dritten Ballon ist sofort fertig', () => {
    const { events, run } = setup({ b: 3 });
    expect(events.at(-1)?.phase).toBe('done');
    expect(run.pump()).toBe(false);
  });

  it('stop() raeumt alle Timer ab und beendet das Senden, ohne Ereignis', () => {
    const { run, clock, sent, events } = setup({ end: 5000 });
    run.pump();
    run.cash();
    run.sync({ n: 1, res: [cashed(1)] });
    expect(clock.pending()).toBeGreaterThan(0);
    run.stop();
    expect(clock.pending()).toBe(0);
    const n = events.length;
    const count = sent.length;
    clock.advance(10_000);
    expect(events).toHaveLength(n);
    expect(run.pump()).toBe(false);
    expect(sent).toHaveLength(count);
  });
});
