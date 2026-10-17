import { describe, expect, it } from 'vitest';
import { ALPHABET, newCode, normalizeCode } from './code';

const ALLOWED = /^[ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/;

describe('newCode', () => {
  it('liefert bei 1000 Codes mit fester rand-Folge nur 4 Zeichen aus dem Alphabet', () => {
    let i = 0;
    const rand = () => ((i++ * 7919) % 1000) / 1000;
    for (let n = 0; n < 1000; n++) expect(newCode(rand)).toMatch(ALLOWED);
  });

  it('rand 0 ergibt A, rand knapp unter 1 ergibt Z', () => {
    expect(newCode(() => 0)).toBe('AAAA');
    expect(newCode(() => 0.9999999)).toBe('ZZZZ');
  });

  it('nutzt rand je Zeichen genau einmal', () => {
    let calls = 0;
    newCode(() => (calls++, 0.5));
    expect(calls).toBe(4);
  });

  it('Alphabet ohne I und O', () => {
    expect(ALPHABET).toBe('ABCDEFGHJKLMNPQRSTUVWXYZ');
  });
});

describe('normalizeCode', () => {
  it('trimmt, entfernt Leerzeichen und schreibt groß', () => {
    expect(normalizeCode(' ab cd ')).toBe('ABCD');
    expect(normalizeCode('wxyz')).toBe('WXYZ');
    expect(normalizeCode('a\tb\ncd')).toBe('ABCD');
  });

  it.each(['ABCI', 'ABCO', 'ABC', 'ABCDE', 'AB-D', 'AB1D', 'ÄBCD', '', '    '])('lehnt %j ab', (s) => {
    expect(normalizeCode(s)).toBeNull();
  });
});
