import { describe, expect, it } from 'vitest';
import { levenshtein, norm } from './match';

describe('norm', () => {
  it('klein, Umlaute und ß ausgeschrieben', () => {
    expect(norm('Käse')).toBe('kaese');
    expect(norm('Öl')).toBe('oel');
    expect(norm('Müll')).toBe('muell');
    expect(norm('Straße')).toBe('strasse');
  });

  it('Großbuchstaben-Umlaute und ẞ', () => {
    expect(norm('ÄÖÜ')).toBe('aeoeue');
    expect(norm('Ä')).toBe('ae');
    expect(norm('STRAẞE')).toBe('strasse');
  });

  it('NFD-Umlaut (a + Kombizeichen) gleich NFC', () => {
    expect(norm('ä')).toBe('ae');
    expect(norm('Ö')).toBe('oe');
    expect(norm('über')).toBe(norm('über'));
  });

  it('übrige Akzente werden zum Grundbuchstaben', () => {
    expect(norm('Café')).toBe('cafe');
    expect(norm('Crème brûlée')).toBe('cremebrulee');
    expect(norm('Señor')).toBe('senor');
  });

  it('alles außer a-z0-9 fliegt raus', () => {
    expect(norm(' Hallo, Welt! 42 ')).toBe('hallowelt42');
    expect(norm('a-b_c.d')).toBe('abcd');
    expect(norm('😀')).toBe('');
    expect(norm('')).toBe('');
  });
});

describe('levenshtein', () => {
  it('klassische Fälle', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('abc', 'abc')).toBe(0);
    expect(levenshtein('abc', 'abd')).toBe(1);
  });

  it('leere Strings', () => {
    expect(levenshtein('', '')).toBe(0);
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('abc', '')).toBe(3);
  });

  it('symmetrisch', () => {
    for (const [a, b] of [['flaw', 'lawn'], ['', 'x'], ['gumbo', 'gambol'], ['ab', 'ba']] as const)
      expect(levenshtein(a, b)).toBe(levenshtein(b, a));
  });

  it('zählt Codepoints, nicht UTF-16-Einheiten', () => {
    expect(levenshtein('😀', 'a')).toBe(1);
    expect(levenshtein('😀😀', '😀')).toBe(1);
    expect(levenshtein('😀', '')).toBe(1);
  });
});
