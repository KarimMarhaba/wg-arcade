import { describe, expect, it } from 'vitest';
import { bankProblems } from '../bankcheck';
import { QUESTIONS, STEM, STEM_DUO } from './questions';

describe('werwuerde Bank', () => {
  it('bankProblems findet nichts (>= 70, >= 20 WG, >= 20 duo, angezeigter Text samt Praefix <= 90)', () => {
    expect(
      bankProblems(QUESTIONS, {
        min: 70,
        key: (x) => x.q,
        text: (x) => [[(x.duo ? STEM_DUO : STEM) + x.q, 90]],
        quotas: [
          { name: 'wg', of: (x) => x.wg === true, min: 20 },
          { name: 'duo', of: (x) => x.duo === true, min: 20 },
        ],
      }),
    ).toEqual([]);
  });

  it('der Stamm steht ohne Praefix da: endet auf ?, beginnt nicht mit "Wer"', () => {
    for (const x of QUESTIONS) {
      expect(x.q.trim().endsWith('?'), x.q).toBe(true);
      expect(/^wer\b/i.test(x.q), x.q).toBe(false);
    }
  });

  it('Marker sind nur true oder fehlen', () => {
    for (const x of QUESTIONS) {
      expect([true, undefined]).toContain(x.duo);
      expect([true, undefined]).toContain(x.wg);
    }
  });

  it('Praefixe', () => {
    expect(STEM).toBe('Wer würde eher ');
    expect(STEM_DUO).toBe('Wer von uns beiden würde eher ');
  });
});
