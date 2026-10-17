import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PALETTE, paletteAt } from './palette';

describe('palette', () => {
  it('liefert 8 verschiedene Formen und Namen', () => {
    expect(PALETTE).toHaveLength(8);
    expect(new Set(PALETTE.map((p) => p.shape)).size).toBe(8);
    expect(new Set(PALETTE.map((p) => p.name)).size).toBe(8);
    for (const p of PALETTE) expect(p.path.length).toBeGreaterThan(10);
  });

  it('enthält keine Hex-Farben', () => {
    expect(JSON.stringify(PALETTE)).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(readFileSync(new URL('./palette.ts', import.meta.url), 'utf8')).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('paletteAt rechnet modulo 8', () => {
    expect(paletteAt(3)).toBe(PALETTE[3]);
    expect(paletteAt(11)).toBe(PALETTE[3]);
    expect(paletteAt(-1)).toBe(PALETTE[7]);
  });
});
