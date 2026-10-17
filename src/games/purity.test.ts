import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ROOT = new URL('./', import.meta.url);
const read = (f: string) => readFileSync(new URL(f, ROOT), 'utf8');
const SKIP = new Set(['view.ts', 'views.ts', 'types.ts']);
const base = (f: string) => f.slice(f.lastIndexOf('/') + 1);
const FILES = readdirSync(ROOT, { recursive: true, encoding: 'utf8' })
  .map((f) => f.replaceAll('\\', '/'))
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !SKIP.has(base(f)))
  .sort();
const BAD = [/\bDate\b/, /Math\.random/, /\bperformance\b/, /\bcrypto\b/, /\bdocument\b/, /\bwindow\b/];
const UI_IMPORT = /from\s+'[^']*\b(ui|view)\b/;

describe('Spiellogik-Reinheit (Glob über src/games)', () => {
  it('findet bekannte Dateien und überspringt View-Dateien und Tests', () => {
    for (const known of [
      'blitz/logic.ts',
      'blitz/play.ts',
      'hammer/logic.ts',
      'farbfalle/play.ts',
      'schaetzfuchs/logic.ts',
      'schaetzfuchs/questions.ts',
      'common.ts',
      'colors.ts',
      'resume.ts',
      'index.ts',
    ])
      expect(FILES, known).toContain(known);
    for (const skipped of ['blitz/view.ts', 'views.ts', 'types.ts', 'blitz/logic.test.ts', 'purity.test.ts'])
      expect(FILES, skipped).not.toContain(skipped);
    expect(FILES.length).toBeGreaterThanOrEqual(13);
  });

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
