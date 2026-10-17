import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (f: string) => readFileSync(new URL(`./${f}`, import.meta.url), 'utf8');
const PURE = ['party', 'rounds', 'scoring', 'durations', 'types', 'drinks'];

describe('Engine-Reinheit', () => {
  for (const f of PURE)
    it(`${f}.ts nutzt weder Date, Math.random, performance noch crypto`, () => {
      const src = read(`${f}.ts`);
      for (const bad of [/\bDate\b/, /Math\.random/, /\bperformance\b/, /\bcrypto\b/]) expect(src).not.toMatch(bad);
    });

  it('randomSeed ist die einzige crypto-Stelle in prng.ts', () => {
    const lines = read('prng.ts').split('\n').filter((l) => /\bcrypto\b/.test(l));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/getRandomValues/);
  });
});
