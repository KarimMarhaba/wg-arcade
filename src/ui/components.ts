import type { Sfx, ViewCtx } from '../games/types';
import { h, type Child } from './dom';
import { PALETTE, paletteAt, type ShapeId } from './palette';

const SVG_NS = 'http://www.w3.org/2000/svg';

function svg(cls: string, viewBox: string, ...kids: SVGElement[]): SVGSVGElement {
  const el = document.createElementNS(SVG_NS, 'svg');
  el.setAttribute('class', cls);
  el.setAttribute('viewBox', viewBox);
  el.setAttribute('aria-hidden', 'true');
  el.append(...kids);
  return el;
}

function path(d: string, attrs: Record<string, string> = {}): SVGPathElement {
  const p = document.createElementNS(SVG_NS, 'path');
  p.setAttribute('d', d);
  for (const [k, v] of Object.entries(attrs)) p.setAttribute(k, v);
  return p;
}

const stroke = { fill: 'none', stroke: 'currentColor', 'stroke-width': '2.5', 'stroke-linecap': 'round' };

export function shapeSvg(shape: ShapeId): SVGSVGElement {
  const d = PALETTE.find((p) => p.shape === shape)?.path ?? '';
  return svg('shape', '0 0 24 24', path(d, { fill: 'currentColor' }));
}

export function logo(): HTMLElement {
  return h('h1', { class: 'logo' }, h('span', {}, 'WG·'), h('br'), h('span', {}, 'ARCADE'));
}

export interface ButtonOpts {
  variant?: 'primary' | 'hot' | 'ghost' | 'danger';
  size?: 'l' | 'm';
  testid?: string;
  type?: 'button' | 'submit';
  disabled?: boolean;
}

export function button(label: string, o: ButtonOpts = {}): HTMLButtonElement {
  return h(
    'button',
    {
      class: 'btn',
      type: o.type ?? 'button',
      'data-variant': o.variant ?? 'primary',
      'data-size': o.size ?? 'm',
      testid: o.testid,
      disabled: o.disabled,
    },
    label,
  );
}

export function panel(...kids: Child[]): HTMLElement {
  return h('div', { class: 'panel' }, ...kids);
}

export interface BadgePlayer {
  pid?: string;
  name: string;
  color: number;
  online?: boolean;
}

export function playerBadge(p: BadgePlayer, o: { size?: 's' | 'm' | 'l'; me?: boolean } = {}): HTMLElement {
  const entry = paletteAt(p.color);
  const initial = [...p.name.trim()][0]?.toUpperCase() ?? '?';
  return h(
    'span',
    {
      class: 'badge',
      'data-size': o.size ?? 'm',
      'data-color': ((p.color % 8) + 8) % 8,
      'data-pid': p.pid ?? '',
      'data-online': String(p.online ?? true),
      'data-me': o.me ? 'true' : null,
      title: entry.name,
    },
    shapeSvg(entry.shape),
    h('span', { class: 'initial' }, initial),
  );
}

export function codeBoxes(code: string): HTMLElement {
  return h(
    'p',
    { class: 'code-boxes', testid: 'room-code', 'aria-label': 'Raumcode' },
    ...[...code].map((c) => h('span', { class: 'code-box' }, c)),
  );
}

export interface Segmented<T> {
  el: HTMLElement;
  set(value: T): void;
}

export function segmented<T extends number | string>(
  options: readonly T[],
  value: T,
  onChange: (v: T) => void,
  o: { label: string; testid: (v: T) => string },
): Segmented<T> {
  const btns = new Map<T, HTMLButtonElement>();
  const el = h('div', { class: 'seg', role: 'group', 'aria-label': o.label });
  for (const opt of options) {
    const b = button(String(opt), { variant: 'ghost', testid: o.testid(opt) });
    b.addEventListener('click', () => onChange(opt));
    btns.set(opt, b);
    el.append(b);
  }
  const set = (v: T): void => {
    for (const [k, b] of btns) b.setAttribute('aria-pressed', String(k === v));
  };
  set(value);
  return { el, set };
}

export function timerBar(hostEndsAt: number, dur: number | undefined, ctx: Pick<ViewCtx, 'toLocal'>): HTMLElement {
  const left = Math.max(0, ctx.toLocal(hostEndsAt) - performance.now());
  const from = dur && dur > 0 ? Math.min(1, left / dur) : 1;
  const fill = h('div', { class: 'timer-fill' });
  fill.style.setProperty('--bar-from', String(from));
  fill.style.setProperty('--bar-ms', `${Math.round(left)}ms`);
  requestAnimationFrame(() => requestAnimationFrame(() => fill.setAttribute('data-run', '')));
  return h('div', { class: 'timer-bar', role: 'presentation' }, fill);
}

export interface Countdown {
  el: HTMLElement;
  set(hostUntil: number): void;
  destroy(): void;
}

const COUNT_TICK_MS = 100;
const MS_PER_S = 1000;

export function countdown(ctx: ViewCtx, hostUntil: number): Countdown {
  const el = h('p', { class: 'countdown', testid: 'countdown', 'aria-live': 'assertive', 'aria-atomic': 'true' });
  let until = hostUntil;
  const tick = (): void => {
    const left = Math.max(0, Math.ceil((ctx.toLocal(until) - performance.now()) / MS_PER_S));
    const text = String(left);
    if (el.textContent === text) return;
    el.textContent = text;
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
    if (left > 0) ctx.sfx.play('tick');
  };
  tick();
  const id = setInterval(tick, COUNT_TICK_MS);
  return {
    el,
    set(next) {
      until = next;
      tick();
    },
    destroy: () => clearInterval(id),
  };
}

export interface ScoreRowOpts {
  pid: string;
  place: number;
  badge: HTMLElement;
  name: string;
  me: boolean;
  total: number;
  label?: string;
  points?: number;
  index: number;
  testid: string;
  enter: boolean;
}

export function scoreRow(o: ScoreRowOpts): HTMLElement {
  const who = h('span', { class: 'who' }, h('span', { class: 'name' }, o.name, o.me ? h('span', { class: 'tag' }, 'DU') : null));
  if (o.label !== undefined) who.append(h('span', { class: 'label' }, o.label));
  const row = h(
    'li',
    {
      class: o.enter ? 'score-row enter' : 'score-row',
      testid: o.testid,
      'data-pid': o.pid,
      'data-points': o.points,
      'data-total': o.points === undefined ? o.total : null,
      'data-me': o.me ? 'true' : null,
    },
    h('span', { class: 'place' }, String(o.place)),
    o.badge,
    who,
    o.points === undefined ? null : h('span', { class: 'pts' }, `+${o.points}`),
    h('span', { class: 'total' }, String(o.total)),
  );
  row.style.setProperty('--i', String(o.index));
  return row;
}

export type BannerKind = 'warn' | 'bad';

export function banner(
  text: string,
  kind: BannerKind = 'warn',
  o: { testid?: string; role?: 'alert' | 'status'; fixed?: boolean } = {},
): HTMLElement {
  return h('p', { class: 'banner', 'data-kind': kind, 'data-fixed': o.fixed ? 'true' : null, role: o.role ?? 'status', testid: o.testid }, text);
}

export function muteToggle(sfx: Pick<Sfx, 'muted' | 'setMuted'>): HTMLButtonElement {
  const speaker = path('M3 9v6h4l5 4V5L7 9H3z', { fill: 'currentColor' });
  const waves = path('M15.5 9a4 4 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11', stroke);
  const slash = path('M4 4L20 20', { ...stroke, class: 'slash' });
  const b = h('button', {
    class: 'btn mute',
    type: 'button',
    'data-variant': 'ghost',
    'data-silent': 'true',
    testid: 'btn-mute',
    'aria-label': 'Stumm',
    'aria-pressed': String(sfx.muted()),
  });
  b.append(svg('icon', '0 0 24 24', speaker, waves, slash));
  b.addEventListener('click', () => {
    const on = b.getAttribute('aria-pressed') !== 'true';
    sfx.setMuted(on);
    b.setAttribute('aria-pressed', String(on));
  });
  return b;
}

export function wifiOffIcon(): SVGSVGElement {
  return svg(
    'icon-l',
    '0 0 24 24',
    path('M2 8.5a15 15 0 0 1 20 0M5 12a10.5 10.5 0 0 1 14 0M8.5 15.5a5.5 5.5 0 0 1 7 0', stroke),
    path('M12 19.5h.01', stroke),
    path('M3 3L21 21', stroke),
  );
}

export function waitDots(): HTMLElement {
  return h('span', { class: 'dots', 'aria-hidden': 'true' }, ...[0, 1, 2].map((i) => {
    const d = h('i');
    d.style.setProperty('--i', String(i));
    return d;
  }));
}

export interface FrameOpts {
  screen?: string;
  accent?: string;
  attrs?: Record<string, string | number | null | undefined>;
  head?: Child[];
  main: Child[];
  foot?: Child[];
}

export interface Frame {
  root: HTMLElement;
  head: HTMLElement;
  body: HTMLElement;
  foot: HTMLElement;
}

export function screenFrame(o: FrameOpts): Frame {
  const head = h('header', { class: 'frame-head' }, ...(o.head ?? []));
  const body = h('div', { class: 'frame-body' }, ...o.main);
  const foot = h('footer', { class: 'frame-foot' }, ...(o.foot ?? []));
  const root = h(
    'main',
    { class: 'frame', 'data-screen': o.screen, 'data-accent': o.accent, ...o.attrs },
    o.head ? head : null,
    body,
    o.foot ? foot : null,
  );
  return { root, head, body, foot };
}

export function neutralScreen(text: string): HTMLElement {
  return screenFrame({ main: [h('p', { class: 'neutral-text', role: 'status' }, text, waitDots())] }).root;
}
