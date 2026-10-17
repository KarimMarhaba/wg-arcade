import { describe, expect, it } from 'vitest';
import { QUESTIONS } from './questions';

describe('Fragenbank', () => {
  it('hat mindestens 40 Eintraege', () => {
    expect(QUESTIONS.length).toBeGreaterThanOrEqual(40);
  });

  it('jede Frage endet mit ?, a ist ganzzahlig > 0, unit nicht leer', () => {
    for (const x of QUESTIONS) {
      expect(x.q.trim().endsWith('?')).toBe(true);
      expect(Number.isInteger(x.a) && x.a > 0).toBe(true);
      expect(x.unit.trim()).not.toBe('');
    }
  });

  it('keine doppelten Fragen (ohne Gross/Klein)', () => {
    const qs = QUESTIONS.map((x) => x.q.trim().toLowerCase());
    expect(new Set(qs).size).toBe(qs.length);
  });

  it('die Antwort steht weder in q noch in unit', () => {
    for (const x of QUESTIONS) {
      expect(x.q).not.toContain(String(x.a));
      expect(x.unit).not.toContain(String(x.a));
    }
  });
});
