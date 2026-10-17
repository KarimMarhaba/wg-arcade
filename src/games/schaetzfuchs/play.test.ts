import { describe, expect, it } from 'vitest';
import { countAt, parseGuess } from './play';

describe('parseGuess', () => {
  it('liest Ziffern', () => {
    expect(parseGuess('2962')).toBe(2962);
    expect(parseGuess('0')).toBe(0);
    expect(parseGuess('007')).toBe(7);
  });

  it('ignoriert Leerzeichen und Tausenderpunkte', () => {
    expect(parseGuess('2.962')).toBe(2962);
    expect(parseGuess(' 42 195 ')).toBe(42195);
    expect(parseGuess('299.792.458')).toBe(299792458);
  });

  it('leer oder ohne Ziffern: null', () => {
    expect(parseGuess('')).toBeNull();
    expect(parseGuess('   ')).toBeNull();
    expect(parseGuess('...')).toBeNull();
  });

  it('andere Zeichen machen die Eingabe ungültig', () => {
    expect(parseGuess('abc')).toBeNull();
    expect(parseGuess('12a')).toBeNull();
    expect(parseGuess('-5')).toBeNull();
    expect(parseGuess('3,5')).toBeNull();
    expect(parseGuess('1e3')).toBeNull();
  });

  it('über 1e12 ist ungültig, genau 1e12 gilt', () => {
    expect(parseGuess('1000000000000')).toBe(1e12);
    expect(parseGuess('1000000000001')).toBeNull();
    expect(parseGuess('99999999999999999999')).toBeNull();
  });
});

describe('countAt', () => {
  it('startet bei 0 und endet exakt auf dem Ziel', () => {
    expect(countAt(2962, 0)).toBe(0);
    expect(countAt(2962, 1)).toBe(2962);
    expect(countAt(2962, 7)).toBe(2962);
    expect(countAt(2962, -1)).toBe(0);
  });

  it('wächst monoton in ganzen Zahlen', () => {
    let prev = -1;
    for (let k = 0; k <= 20; k++) {
      const v = countAt(299792458, k / 20);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it('bremst am Ende ab (ease-out)', () => {
    expect(countAt(100, 0.5)).toBeGreaterThan(50);
  });
});
