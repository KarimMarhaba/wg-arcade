import { describe, expect, it } from 'vitest';
import { CONFETTI_MS, PARTICLES, spawn, startConfetti, type ConfettiDeps } from './confetti';
import { mulberry32 } from '../engine/prng';

const COLORS = ['c1', 'c2', 'c3'];

function fakes() {
  const log = { raf: [] as ((t: number) => void)[], caf: [] as number[], after: [] as { fn: () => void; ms: number }[], cancelled: 0, removed: 0, draws: 0, appended: 0 };
  const ctx = {
    fillStyle: '' as string | CanvasGradient | CanvasPattern,
    clearRect() {},
    save() {},
    restore() {},
    translate() {},
    rotate() {},
    fillRect() {
      log.draws++;
    },
  };
  const canvas = {
    width: 0,
    height: 0,
    className: '',
    remove() {
      log.removed++;
    },
    getContext: () => ctx,
  };
  const deps: ConfettiDeps = {
    createCanvas: () => canvas,
    raf: (fn) => log.raf.push(fn),
    caf: (id) => void log.caf.push(id),
    after: (fn, ms) => log.after.push({ fn, ms }),
    cancelAfter: () => void log.cancelled++,
    rand: mulberry32(7),
    size: () => ({ w: 390, h: 844 }),
  };
  const host = { append: () => void log.appended++ };
  return { log, deps, host, canvas };
}

describe('confetti', () => {
  it('spawn liefert 120 deterministische Partikel in Spielerfarben', () => {
    const a = spawn(PARTICLES, 390, 844, COLORS, mulberry32(1));
    const b = spawn(PARTICLES, 390, 844, COLORS, mulberry32(1));
    expect(PARTICLES).toBe(120);
    expect(a).toHaveLength(120);
    expect(a).toEqual(b);
    for (const p of a) {
      expect(COLORS).toContain(p.color);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(390);
    }
  });

  it('hängt ein Canvas an, zeichnet Frames und plant die Selbstentfernung', () => {
    const { log, deps, host, canvas } = fakes();
    startConfetti(host, COLORS, deps);
    expect(log.appended).toBe(1);
    expect(canvas.className).toContain('confetti');
    expect(log.after).toHaveLength(1);
    expect(log.after[0]?.ms).toBe(CONFETTI_MS);
    expect(CONFETTI_MS).toBe(2500);
    log.raf[0]?.(16);
    log.raf[1]?.(32);
    expect(log.draws).toBeGreaterThan(0);
    expect(log.raf.length).toBeGreaterThanOrEqual(3);
  });

  it('destroy stoppt rAF, entfernt das Canvas und ist idempotent', () => {
    const { log, deps, host } = fakes();
    const c = startConfetti(host, COLORS, deps);
    c.destroy();
    expect(log.caf).toHaveLength(1);
    expect(log.removed).toBe(1);
    expect(log.cancelled).toBe(1);
    const n = log.raf.length;
    log.raf[0]?.(16);
    expect(log.raf.length).toBe(n);
    expect(() => c.destroy()).not.toThrow();
    expect(log.removed).toBe(1);
  });

  it('entfernt sich nach Ablauf selbst', () => {
    const { log, deps, host } = fakes();
    startConfetti(host, COLORS, deps);
    log.after[0]?.fn();
    expect(log.removed).toBe(1);
    expect(log.caf).toHaveLength(1);
  });
});
