import { decode, pack, quantize, type Pt } from '../games/blindmaler/strokes';
import { h } from './dom';

const RES = 360;
const RAW_CAP = 3000;
const LINE_DIV = 40;
const PAD_LINES = 1.5;
const GLOW_LINES = 1.5;
const DOT_LINES = 0.6;
const COORD_MAX = 255;

export interface StrokePad {
  el: HTMLElement;
  strokes(): string[];
  lock(): void;
  destroy(): void;
}

export interface StrokePadOpts {
  onStroke(strokes: string[]): void;
}

export function strokePad(o: StrokePadOpts): StrokePad {
  const dot = h('span', { class: 'bm-dot', testid: 'bm-dot', 'aria-hidden': 'true' });
  const el = h('div', { class: 'bm-pad', testid: 'bm-pad', role: 'group', 'aria-label': 'Zeichenfläche, dein Strich bleibt unsichtbar' }, dot);
  const done: Pt[][] = [];
  let cur: Pt[] | null = null;
  let active: number | null = null;
  let rect = el.getBoundingClientRect();
  let raw = 0;
  let locked = false;

  const at = (e: PointerEvent): Pt => [quantize(e.clientX - rect.left, rect.width), quantize(e.clientY - rect.top, rect.height)];
  const show = (e: PointerEvent): void => {
    dot.style.transform = `translate(${e.clientX - rect.left}px, ${e.clientY - rect.top}px)`;
  };
  const commit = (): void => {
    if (cur) done.push(cur);
    cur = null;
    active = null;
    el.removeAttribute('data-on');
  };
  const end = (e: PointerEvent): void => {
    if (e.pointerId !== active) return;
    commit();
    o.onStroke(pack(done));
  };

  el.addEventListener('pointerdown', (e) => {
    if (locked || !e.isPrimary || active !== null) return;
    e.preventDefault();
    rect = el.getBoundingClientRect();
    active = e.pointerId;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      cur = null;
    }
    cur = [at(e)];
    raw++;
    el.setAttribute('data-on', 'true');
    show(e);
  });
  el.addEventListener('pointermove', (e) => {
    if (e.pointerId !== active || !cur) return;
    show(e);
    if (raw >= RAW_CAP) return;
    cur.push(at(e));
    raw++;
  });
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('lostpointercapture', end);

  return {
    el,
    strokes: () => pack(done),
    lock() {
      commit();
      locked = true;
      el.setAttribute('data-locked', 'true');
    },
    destroy: () => el.remove(),
  };
}

const token = (name: string): string => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || 'white';

export function paintStrokes(canvas: HTMLCanvasElement, strokes: readonly string[]): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const size = canvas.width;
  const line = size / LINE_DIV;
  const pad = line * PAD_LINES;
  const color = token('--cyan');
  const at = ([x, y]: Pt): [number, number] => [pad + (x / COORD_MAX) * (size - 2 * pad), pad + (y / COORD_MAX) * (size - 2 * pad)];
  ctx.clearRect(0, 0, size, size);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = line;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = line * GLOW_LINES;
  for (const s of strokes) {
    const pts = decode(s).map(at);
    const first = pts[0];
    if (!first) continue;
    ctx.beginPath();
    if (pts.length === 1) {
      ctx.arc(first[0], first[1], line * DOT_LINES, 0, 2 * Math.PI);
      ctx.fill();
      continue;
    }
    ctx.moveTo(first[0], first[1]);
    for (const [x, y] of pts.slice(1)) ctx.lineTo(x, y);
    ctx.stroke();
  }
}

export function strokeCanvas(strokes: readonly string[]): HTMLCanvasElement {
  const canvas = h('canvas', { class: 'bm-canvas', testid: 'bm-canvas', role: 'img', 'aria-label': 'Gemaltes Bild' });
  const size = RES * Math.min(2, Math.max(1, Math.ceil(window.devicePixelRatio || 1)));
  canvas.width = size;
  canvas.height = size;
  paintStrokes(canvas, strokes);
  return canvas;
}
