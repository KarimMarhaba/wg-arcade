import { afterEach, describe, expect, it, vi } from 'vitest';
import { int, mix32, mulberry32, pick, randomSeed, shuffle } from './prng';

const isUint32 = (n: number) => Number.isInteger(n) && n >= 0 && n <= 0xffffffff;

describe('mulberry32', () => {
  it('liefert bei gleichem Seed dieselbe Folge, alle Werte in [0,1)', () => {
    const a = mulberry32(123);
    const b = mulberry32(123);
    for (let i = 0; i < 1000; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it('verschiedene Seeds geben verschiedene Folgen', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });
});

describe('mix32', () => {
  it('ist deterministisch und liefert uint32', () => {
    for (const [a, b] of [[0, 0], [1, 2], [0xffffffff, 7], [12345, 99]] as const) {
      expect(mix32(a, b)).toBe(mix32(a, b));
      expect(isUint32(mix32(a, b))).toBe(true);
    }
  });

  it('unterscheidet benachbarte b', () => {
    for (const a of [0, 1, 42, 0xdeadbeef]) {
      const seen = new Set<number>();
      for (let b = 0; b < 100; b++) seen.add(mix32(a, b));
      expect(seen.size).toBe(100);
    }
  });
});

describe('int', () => {
  it('bleibt in den inklusiven Grenzen und trifft beide Enden', () => {
    const r = mulberry32(7);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const x = int(r, 3, 6);
      expect(x).toBeGreaterThanOrEqual(3);
      expect(x).toBeLessThanOrEqual(6);
      expect(Number.isInteger(x)).toBe(true);
      seen.add(x);
    }
    expect([...seen].sort()).toEqual([3, 4, 5, 6]);
  });

  it('min = max gibt genau diesen Wert', () => {
    expect(int(mulberry32(1), 5, 5)).toBe(5);
  });
});

describe('shuffle / pick', () => {
  it('shuffle ist eine Permutation, verändert das Original nicht und ist deterministisch', () => {
    const xs = [1, 2, 3, 4, 5, 6, 7, 8];
    const copy = [...xs];
    const out = shuffle(mulberry32(9), xs);
    expect(xs).toEqual(copy);
    expect(out).not.toBe(xs);
    expect([...out].sort()).toEqual(copy);
    expect(shuffle(mulberry32(9), xs)).toEqual(out);
  });

  it('shuffle ändert für irgendeinen Seed die Reihenfolge', () => {
    const xs = [1, 2, 3, 4, 5, 6];
    expect([1, 2, 3, 4, 5].some((s) => shuffle(mulberry32(s), xs).join() !== xs.join())).toBe(true);
  });

  it('pick ist deterministisch und liefert ein Element', () => {
    const xs = ['a', 'b', 'c', 'd'];
    for (let s = 0; s < 20; s++) {
      const x = pick(mulberry32(s), xs);
      expect(xs).toContain(x);
      expect(pick(mulberry32(s), xs)).toBe(x);
    }
  });

  it('pick auf leerer Liste wirft', () => {
    expect(() => pick(mulberry32(1), [])).toThrow();
  });
});

describe('randomSeed', () => {
  afterEach(() => vi.restoreAllMocks());

  it('liefert uint32', () => {
    for (let i = 0; i < 50; i++) expect(isUint32(randomSeed())).toBe(true);
  });

  it('nutzt crypto.getRandomValues', () => {
    const spy = vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation(((a: Uint32Array) => {
      a[0] = 0xdeadbeef;
      return a;
    }) as never);
    expect(randomSeed()).toBe(0xdeadbeef);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
