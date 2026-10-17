import { norm } from './match';

export interface Quota<T> {
  name: string;
  of: (x: T) => boolean;
  min: number;
}

export interface BankOpts<T> {
  min: number;
  text: (x: T) => readonly (readonly [string, number])[];
  key?: (x: T) => string;
  quotas?: readonly Quota<T>[];
  forbid?: readonly string[];
}

const FORBIDDEN = [
  'ex',
  'sex\\p{L}*',
  'schwul\\p{L}*',
  'lesbisch\\p{L}*',
  'krank\\p{L}*',
  'behinder\\p{L}*',
  'übergewicht\\p{L}*',
  'fettleibig\\p{L}*',
  'muslim\\p{L}*',
  'jüd\\p{L}*',
];

const lint = (patterns: readonly string[]): RegExp[] =>
  patterns.map((p) => new RegExp(`(?<!\\p{L})(?:${p})(?!\\p{L})`, 'iu'));

export function bankProblems<T>(items: readonly T[], o: BankOpts<T>): string[] {
  const out: string[] = [];
  const re = lint([...FORBIDDEN, ...(o.forbid ?? [])]);
  if (items.length < o.min) out.push(`${items.length} Einträge, mindestens ${o.min} nötig`);

  const keys = new Map<string, number>();
  items.forEach((x, i) => {
    const at = `#${i + 1}`;
    const texts = o.text(x);
    for (const [s, max] of texts) {
      if (s.trim() === '') out.push(`${at}: leeres Feld`);
      if (Array.from(s).length > max) out.push(`${at}: zu lang (${Array.from(s).length} > ${max}): "${s}"`);
      for (const r of re) {
        const m = r.exec(s);
        if (m) out.push(`${at}: Verbotenes Wort "${m[0]}" in "${s}"`);
      }
    }
    const k = norm(o.key ? o.key(x) : (texts[0]?.[0] ?? ''));
    if (k === '') return;
    const first = keys.get(k);
    if (first === undefined) keys.set(k, i + 1);
    else out.push(`${at}: Dublette von #${first}`);
  });

  for (const q of o.quotas ?? []) {
    const n = items.filter(q.of).length;
    if (n < q.min) out.push(`Quote ${q.name}: ${n} von mindestens ${q.min}`);
  }
  return out;
}
