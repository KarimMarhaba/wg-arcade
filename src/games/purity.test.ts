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

function stripLiterals(src: string): string {
  let out = '';
  let i = 0;
  const literal = (q: string): number => {
    for (let j = i + 1; j < src.length && src[j] !== '\n'; j++) {
      if (src[j] === '\\') j++;
      else if (src[j] === q) return j;
    }
    return -1;
  };
  const template = (): void => {
    out += src[i++];
    while (i < src.length && src[i] !== '`') {
      if (src[i] === '\\') out += src[i++];
      else if (src[i] === '$' && src[i + 1] === '{') {
        out += '${';
        i += 2;
        for (let depth = 1; i < src.length && depth > 0; ) {
          const c = src[i] as string;
          if (c === '`') template();
          else if (c === "'" || c === '"') {
            const end = literal(c);
            out += end < 0 ? c : c + c;
            i = end < 0 ? i + 1 : end + 1;
          } else {
            depth += c === '{' ? 1 : c === '}' ? -1 : 0;
            out += c;
            i++;
          }
        }
        continue;
      }
      out += src[i++] ?? '';
    }
    out += src[i++] ?? '';
  };
  while (i < src.length) {
    const c = src[i] as string;
    if (c === '/' && src[i + 1] === '/') {
      const end = src.indexOf('\n', i);
      const to = end < 0 ? src.length : end;
      out += src.slice(i, to);
      i = to;
    } else if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      const to = end < 0 ? src.length : end + 2;
      out += src.slice(i, to);
      i = to;
    } else if (c === '`') template();
    else if (c === "'" || c === '"') {
      const end = literal(c);
      out += end < 0 ? c : c + c;
      i = end < 0 ? i + 1 : end + 1;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

const violations = (src: string): string[] => BAD.filter((bad) => bad.test(stripLiterals(src))).map(String);

describe('Spiellogik-Reinheit (Glob über src/games)', () => {
  it('findet bekannte Dateien und überspringt View-Dateien und Tests', () => {
    for (const known of [
      'blitz/logic.ts',
      'blitz/play.ts',
      'hammer/logic.ts',
      'farbfalle/play.ts',
      'schaetzfuchs/logic.ts',
      'schaetzfuchs/questions.ts',
      'gleichklang/logic.ts',
      'gleichklang/prompts.ts',
      'werwuerde/logic.ts',
      'werwuerde/questions.ts',
      'bombe/logic.ts',
      'bombe/play.ts',
      'stopp/logic.ts',
      'stopp/play.ts',
      'common.ts',
      'colors.ts',
      'resume.ts',
      'index.ts',
    ])
      expect(FILES, known).toContain(known);
    for (const skipped of ['bombe/view.ts', 'stopp/view.ts', 'blitz/view.ts', 'views.ts', 'types.ts', 'blitz/logic.test.ts', 'purity.test.ts'])
      expect(FILES, skipped).not.toContain(skipped);
    expect(FILES.length).toBeGreaterThanOrEqual(13);
  });

  for (const f of FILES)
    it(`${f} ist frei von Zeit, Zufall, DOM und UI-Imports`, () => {
      const src = read(f);
      expect(violations(src)).toEqual([]);
      expect(src).not.toMatch(UI_IMPORT);
    });

  it('Selbsttest: Inhalt von Zeichenketten zaehlt nicht, Code und Template-Ausdruecke schon', () => {
    expect(violations("const q = 'erstes Date';")).toEqual([]);
    expect(violations('const q = "erstes Date und window";')).toEqual([]);
    expect(violations("const q = 'it\\'s a Date';")).toEqual([]);
    expect(violations("const t = Date.now();")).toHaveLength(1);
    expect(violations("const t = new Date(0);")).toHaveLength(1);
    expect(violations('const t = `${Date.now()}`;')).toHaveLength(1);
    expect(violations("const t = `${'a'} ${Date.now()}`;")).toHaveLength(1);
    expect(violations("const t = `'${Date.now()}'`;")).toHaveLength(1);
    expect(violations("const t = `${'erstes Date'}`;")).toEqual([]);
    expect(violations("const a = 'x'; const t = Date.now();")).toHaveLength(1);
    expect(violations("const t = Math.random(); // 'x'")).toHaveLength(1);
  });

  it('colors.ts enthaelt keine Hex-Farbwerte', () => {
    expect(read('colors.ts')).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
