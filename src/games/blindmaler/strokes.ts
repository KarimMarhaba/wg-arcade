export type Pt = readonly [x: number, y: number];

export const MAX_POINTS = 600;
export const HEX_PER_POINT = 4;
export const MAX_CHARS = MAX_POINTS * HEX_PER_POINT;
export const MIN_STEP = 2;

const COORD_MAX = 255;
const HEX = /^[0-9a-f]+$/;

export function quantize(v: number, size: number): number {
  if (Number.isNaN(v) || Number.isNaN(size) || size <= 0) return 0;
  return Math.min(COORD_MAX, Math.max(0, Math.round((v / size) * COORD_MAX)));
}

const coord = (v: number): number => (Number.isNaN(v) ? 0 : Math.min(COORD_MAX, Math.max(0, Math.round(v))));
const hex2 = (v: number): string => coord(v).toString(16).padStart(2, '0');

export const encode = (stroke: readonly Pt[]): string => stroke.map(([x, y]) => hex2(x) + hex2(y)).join('');

export function decode(stroke: string): Pt[] {
  const s = stroke.toLowerCase();
  if (!HEX.test(s)) return [];
  const out: Pt[] = [];
  for (let i = 0; i + HEX_PER_POINT <= s.length; i += HEX_PER_POINT)
    out.push([parseInt(s.slice(i, i + 2), 16), parseInt(s.slice(i + 2, i + HEX_PER_POINT), 16)]);
  return out;
}

const near = (a: Pt, b: Pt): boolean => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])) < MIN_STEP;

export function thin(stroke: readonly Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of stroke) {
    const last = out.at(-1);
    if (last === undefined || !near(last, p)) out.push(p);
  }
  const end = stroke.at(-1);
  const last = out.at(-1);
  if (end !== undefined && last !== undefined && (last[0] !== end[0] || last[1] !== end[1])) out.push(end);
  return out;
}

export const pointCount = (strokes: readonly string[]): number => Math.floor(strokes.reduce((a, s) => a + s.length, 0) / HEX_PER_POINT);

export function pack(strokes: readonly (readonly Pt[])[]): string[] {
  const out: string[] = [];
  let room = MAX_POINTS;
  for (const stroke of strokes) {
    if (room <= 0) break;
    const kept = thin(stroke).slice(0, room);
    if (kept.length === 0) continue;
    room -= kept.length;
    out.push(encode(kept));
  }
  return out;
}

export function capStrokes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  let room = MAX_CHARS;
  for (let i = 0; i < raw.length && room >= HEX_PER_POINT; i++) {
    const s: unknown = raw[i];
    if (typeof s !== 'string') continue;
    const lower = s.slice(0, room + HEX_PER_POINT).toLowerCase();
    const len = Math.min(lower.length - (lower.length % HEX_PER_POINT), room);
    if (len < HEX_PER_POINT) continue;
    const stroke = lower.slice(0, len);
    if (!HEX.test(stroke)) continue;
    out.push(stroke);
    room -= len;
  }
  return out;
}
