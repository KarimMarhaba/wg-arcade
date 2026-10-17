import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('..', import.meta.url));

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
}

const rel = (f: string): string => f.slice(SRC.length);
const FILES = walk(SRC).filter((f) => /\.(ts|css)$/.test(f) && !f.endsWith('.test.ts'));
const OTHER = FILES.filter((f) => rel(f) !== 'ui/tokens.css');
const TOKENS_CSS = readFileSync(join(SRC, 'ui/tokens.css'), 'utf8');

const tokens = new Map<string, string>();
for (const m of TOKENS_CSS.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) tokens.set(m[1] as string, (m[2] as string).trim());

function offenders(files: string[], re: RegExp): string[] {
  const out: string[] = [];
  for (const f of files)
    readFileSync(f, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (re.test(line)) out.push(`${rel(f)}:${i + 1}: ${line.trim()}`);
      });
  return out;
}

const BASE = [
  '--bg', '--bg-2', '--bg-3', '--ink', '--ink-dim', '--line',
  '--lime', '--hot', '--cyan', '--orange', '--ok', '--bad', '--warn', '--on-accent',
  '--p0', '--p1', '--p2', '--p3', '--p4', '--p5', '--p6', '--p7',
  '--s1', '--s2', '--s3', '--s4', '--s5', '--s6', '--s7', '--s8',
  '--r0', '--r1', '--r2', '--rpill',
  '--bw', '--sh', '--sh-sm', '--sh-press', '--press-shift',
  '--d-fast', '--d-base', '--d-slow', '--d-pop', '--ease-out', '--ease-snap',
  '--tap-min', '--tap-l', '--maxw', '--dim-offline', '--font-display', '--font-text',
  '--fs-mega', '--fs-xxl', '--fs-xl', '--fs-l', '--fs-m', '--fs-s', '--fs-xs',
];
const EXTRA = ['--stagger', '--d-float', '--d-punch', '--d-flash', '--punch-x', '--punch-y', '--enter-y', '--flash-alpha'];

describe('tokens.css', () => {
  it('enthält alle Tokens aus 6.1/6.2', () => {
    expect(BASE.filter((t) => !tokens.has(t))).toEqual([]);
  });

  it('enthält Zusatz-Tokens für Staffel, Float, Punch und Flash', () => {
    expect(EXTRA.filter((t) => !tokens.has(t))).toEqual([]);
  });

  it('Spielerfarben stehen nur in tokens.css', () => {
    expect(offenders(OTHER, /--p[0-7]\s*:/)).toEqual([]);
  });
});

describe('Wächter: Rohwerte', () => {
  it('kein Hex-Literal außerhalb von tokens.css', () => {
    expect(offenders(OTHER, /#[0-9a-fA-F]{3,8}\b/)).toEqual([]);
  });

  it('kein px-Literal außerhalb von tokens.css', () => {
    expect(offenders(OTHER, /(^|[^\w.-])\d*\.?\d+px\b/)).toEqual([]);
  });

  it('jede var(--x) ist definiert', () => {
    const declared = new Set<string>(tokens.keys());
    for (const f of OTHER) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/(--[\w-]+)\s*:/g)) declared.add(m[1] as string);
      for (const m of src.matchAll(/['"`](--[\w-]+)['"`]/g)) declared.add(m[1] as string);
    }
    const missing: string[] = [];
    for (const f of FILES)
      for (const m of readFileSync(f, 'utf8').matchAll(/var\(\s*(--[\w-]+)/g))
        if (!declared.has(m[1] as string)) missing.push(`${rel(f)}: ${m[1]}`);
    expect(missing).toEqual([]);
  });

  it('der Wächter erkennt Verstöße', () => {
    const re = /(^|[^\w.-])\d*\.?\d+px\b/;
    expect(re.test('margin: 3px')).toBe(true);
    expect(re.test('translate(var(--s4))')).toBe(false);
    expect(/#[0-9a-fA-F]{3,8}\b/.test('color: #c6ff00')).toBe(true);
    expect(/#[0-9a-fA-F]{3,8}\b/.test("'#/j/'")).toBe(false);
  });
});

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  return 0.2126 * channel(r as number) + 0.7152 * channel(g as number) + 0.0722 * channel(b as number);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi as number) + 0.05) / ((lo as number) + 0.05);
}

describe('Kontrast', () => {
  const onAccent = tokens.get('--on-accent') ?? '';
  const names = [...Array.from({ length: 8 }, (_, i) => `--p${i}`), '--lime', '--hot', '--cyan', '--orange', '--ok', '--warn', '--bad'];

  it('--on-accent ist ein Hex-Wert', () => {
    expect(onAccent).toMatch(/^#[0-9a-f]{3,6}$/i);
  });

  for (const n of names)
    it(`${n} trägt --on-accent mit Kontrast >= 4.5`, () => {
      const v = tokens.get(n) ?? '';
      expect(v).toMatch(/^#[0-9a-f]{3,6}$/i);
      expect(contrast(v, onAccent)).toBeGreaterThanOrEqual(4.5);
    });

  it('die 8 Spielerfarben sind verschieden', () => {
    const vals = Array.from({ length: 8 }, (_, i) => tokens.get(`--p${i}`));
    expect(new Set(vals).size).toBe(8);
  });
});
