import { describe, expect, it } from 'vitest';
import { bankProblems } from '../bankcheck';
import { WORDS } from './words';

describe('verraeter Bank', () => {
  it('bankProblems findet nichts (>= 80, >= 15 WG, alle Texte <= 18 Zeichen)', () => {
    expect(
      bankProblems(WORDS, {
        min: 80,
        key: (x) => x.word,
        text: (x) => [[x.word, 18], [x.cat, 18], [x.pair, 18], ...x.decoys.map((d) => [d, 18] as const)],
        quotas: [{ name: 'wg', of: (x) => x.wg === true, min: 15 }],
      }),
    ).toEqual([]);
  });

  it('jeder Eintrag hat genau 5 verschiedene Koeder, keiner gleich dem Wort, pair ungleich Wort', () => {
    for (const x of WORDS) {
      expect(x.decoys, x.word).toHaveLength(5);
      expect(new Set(x.decoys.map((d) => d.toLowerCase())).size, x.word).toBe(5);
      expect(x.decoys.map((d) => d.toLowerCase()), x.word).not.toContain(x.word.toLowerCase());
      expect(x.pair.toLowerCase(), x.word).not.toBe(x.word.toLowerCase());
      expect(x.decoys.map((d) => d.toLowerCase()), x.word).not.toContain(x.pair.toLowerCase());
    }
  });

  it('Marker ist nur true oder fehlt, Kategorien gibt es mehrere', () => {
    for (const x of WORDS) expect([true, undefined]).toContain(x.wg);
    expect(new Set(WORDS.map((x) => x.cat)).size).toBeGreaterThanOrEqual(8);
  });

  it('die Pruefung greift: ein Koeder gleich dem Wort oder zu lang faellt auf', () => {
    const bad = [{ word: 'Hund', cat: 'Tiere', pair: 'Wolf', decoys: ['Hund', 'Katze', 'Pferd', 'Esel', 'Schwein'] }];
    const long = [{ word: 'Hund', cat: 'Tiere', pair: 'Wolf', decoys: ['Katze', 'Pferd', 'Esel', 'Schwein', 'Dampfschifffahrtsgesellschaft'] }];
    const unique = (x: (typeof bad)[number]) => new Set(x.decoys).size === 5 && !x.decoys.includes(x.word);
    expect(unique(bad[0] as (typeof bad)[number])).toBe(false);
    expect(
      bankProblems(long, { min: 1, text: (x) => [[x.word, 18], ...x.decoys.map((d) => [d, 18] as const)] }).some((p) => p.includes('zu lang')),
    ).toBe(true);
  });
});
