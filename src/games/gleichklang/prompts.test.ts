import { describe, expect, it } from 'vitest';
import { bankProblems } from '../bankcheck';
import { norm } from '../match';
import { PROMPTS } from './prompts';

describe('gleichklang Bank', () => {
  it('bankProblems findet nichts (>= 60, davon >= 20 duo, Frage <= 90, Option <= 18)', () => {
    expect(
      bankProblems(PROMPTS, {
        min: 60,
        key: (x) => x.q,
        text: (x) => [[x.q, 90], ...x.opts.map((o) => [o, 18] as const)],
        quotas: [{ name: 'duo', of: (x) => x.duo === true, min: 20 }],
      }),
    ).toEqual([]);
  });

  it('je Frage 2 bis 4 verschiedene Optionen, Frage endet auf ?', () => {
    for (const p of PROMPTS) {
      expect(p.opts.length, p.q).toBeGreaterThanOrEqual(2);
      expect(p.opts.length, p.q).toBeLessThanOrEqual(4);
      expect(new Set(p.opts.map(norm)).size, p.q).toBe(p.opts.length);
      expect(p.q.trim().endsWith('?'), p.q).toBe(true);
    }
  });

  it('duo ist nur true oder fehlt', () => {
    for (const p of PROMPTS) expect([true, undefined]).toContain(p.duo);
  });
});
