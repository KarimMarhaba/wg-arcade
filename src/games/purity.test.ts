import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GAME_IDS } from './types';

const read = (f: string) => readFileSync(new URL(`./${f}`, import.meta.url), 'utf8');
const FILES = [
  ...GAME_IDS.map((id) => `${id}/logic.ts`),
  'schaetzfuchs/questions.ts',
  'colors.ts',
  'common.ts',
  'index.ts',
];
const BAD = [/\bDate\b/, /Math\.random/, /\bperformance\b/, /\bcrypto\b/, /\bdocument\b/, /\bwindow\b/];
const UI_IMPORT = /from\s+'[^']*\b(ui|view)\b/;

describe('Spiellogik-Reinheit', () => {
  for (const f of FILES)
    it(`${f} ist frei von Zeit, Zufall, DOM und UI-Imports`, () => {
      const src = read(f);
      for (const bad of BAD) expect(src).not.toMatch(bad);
      expect(src).not.toMatch(UI_IMPORT);
    });

  it('colors.ts enthaelt keine Hex-Farbwerte', () => {
    expect(read('colors.ts')).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
