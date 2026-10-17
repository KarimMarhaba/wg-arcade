import { describe, expect, it } from 'vitest';
import { bankProblems } from '../bankcheck';
import { norm } from '../match';
import { WORDS } from './words';

const WORD_MAX = 12;
const CAT_MAX = 18;

describe('blindmaler Bank', () => {
  it('bankProblems findet nichts (>= 80, Wort <= 12 Zeichen, Kategorie <= 18)', () => {
    expect(
      bankProblems(WORDS, {
        min: 80,
        key: (x) => x.word,
        text: (x) => [[x.word, WORD_MAX], [x.cat, CAT_MAX]],
        forbid: ['kreuz', 'flagge\\p{L}*', 'waffe\\p{L}*', 'pistole', 'gewehr', 'messer', 'schwert', 'bombe', 'panzer'],
      }),
    ).toEqual([]);
  });

  it('mindestens 10 Kategorien mit je mindestens 5 Woertern', () => {
    const byCat = new Map<string, number>();
    for (const w of WORDS) byCat.set(w.cat, (byCat.get(w.cat) ?? 0) + 1);
    expect(byCat.size).toBeGreaterThanOrEqual(10);
    for (const [cat, n] of byCat) expect(n, cat).toBeGreaterThanOrEqual(5);
  });

  it('jeder Eintrag hat genau Wort und Kategorie, getrimmt, ohne Leerzeichen im Wort', () => {
    for (const w of WORDS) {
      expect(Object.keys(w).sort(), w.word).toEqual(['cat', 'word']);
      expect(w.word, w.word).toBe(w.word.trim());
      expect(w.word, w.word).toMatch(/^[\p{L}-]+$/u);
      expect(w.cat, w.cat).toBe(w.cat.trim());
    }
  });

  it('kein Wort doppelt, auch nicht ueber Gross-/Kleinschreibung und Umlaute', () => {
    const keys = WORDS.map((w) => norm(w.word));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('kein Wort steht in zwei Kategorien, kein Wort ist ein Kategoriename', () => {
    const cats = new Set(WORDS.map((w) => norm(w.cat)));
    for (const w of WORDS) expect(cats.has(norm(w.word)), w.word).toBe(false);
  });

  it('die Pruefung greift: zu langes Wort, Verbotenes und Dublette fallen auf', () => {
    const text = (x: { word: string; cat: string }) => [[x.word, WORD_MAX], [x.cat, CAT_MAX]] as const;
    const long = [{ word: 'Dampfschifffahrt', cat: 'X' }];
    expect(bankProblems(long, { min: 1, text }).some((p) => p.includes('zu lang'))).toBe(true);
    const bier = [{ word: 'Bier', cat: 'X' }];
    expect(bankProblems(bier, { min: 1, text }).some((p) => p.includes('Verbotenes'))).toBe(true);
    const dup = [{ word: 'Hund', cat: 'X' }, { word: 'hund', cat: 'Y' }];
    expect(bankProblems(dup, { min: 1, text }).some((p) => p.includes('Dublette'))).toBe(true);
    expect(bankProblems([], { min: 80, text })).toHaveLength(1);
  });
});
