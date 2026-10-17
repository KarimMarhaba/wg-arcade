import { mulberry32, randomSeed } from '../engine/prng';

export const CONFETTI_MS = 2500;
export const PARTICLES = 120;

const GRAVITY = 900;
const MAX_DT = 0.05;
const FIRST_DT = 0.016;

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  rot: number;
  vr: number;
  color: string;
}

type Ctx2D = Pick<CanvasRenderingContext2D, 'clearRect' | 'save' | 'restore' | 'translate' | 'rotate' | 'fillRect' | 'fillStyle'>;
type CanvasLike = Pick<HTMLCanvasElement, 'width' | 'height' | 'className' | 'remove'> & {
  getContext(id: '2d'): Ctx2D | null;
};

export interface ConfettiDeps {
  createCanvas(): CanvasLike;
  raf(fn: (t: number) => void): number;
  caf(id: number): void;
  after(fn: () => void, ms: number): number;
  cancelAfter(id: number): void;
  rand(): number;
  size(): { w: number; h: number };
}

export function spawn(n: number, w: number, h: number, colors: readonly string[], rand: () => number): Particle[] {
  return Array.from({ length: n }, () => ({
    x: rand() * w,
    y: -rand() * h * 0.3,
    vx: (rand() - 0.5) * w * 0.6,
    vy: rand() * h * 0.5,
    w: 6 + rand() * 6,
    h: 10 + rand() * 8,
    rot: rand() * Math.PI * 2,
    vr: (rand() - 0.5) * 12,
    color: colors[Math.floor(rand() * colors.length)] ?? '',
  }));
}

function browserDeps(): ConfettiDeps {
  const rand = mulberry32(randomSeed());
  return {
    createCanvas: () => document.createElement('canvas'),
    raf: (fn) => requestAnimationFrame(fn),
    caf: (id) => cancelAnimationFrame(id),
    after: (fn, ms) => window.setTimeout(fn, ms),
    cancelAfter: (id) => clearTimeout(id),
    rand,
    size: () => ({ w: window.innerWidth, h: window.innerHeight }),
  };
}

export function startConfetti(
  host: Pick<HTMLElement, 'append'>,
  colors: readonly string[],
  deps: ConfettiDeps = browserDeps(),
): { destroy(): void } {
  const { w, h } = deps.size();
  const canvas = deps.createCanvas();
  canvas.className = 'confetti';
  canvas.width = w;
  canvas.height = h;
  host.append(canvas as unknown as Node);
  const ctx = canvas.getContext('2d');
  const parts = spawn(PARTICLES, w, h, colors, deps.rand);
  let dead = false;
  let last = 0;
  let frameId = 0;
  let timerId = 0;

  const frame = (t: number): void => {
    if (dead) return;
    const dt = last ? Math.min((t - last) / 1000, MAX_DT) : FIRST_DT;
    last = t;
    ctx?.clearRect(0, 0, w, h);
    for (const p of parts) {
      p.vy += GRAVITY * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (!ctx) continue;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    frameId = deps.raf(frame);
  };

  const destroy = (): void => {
    if (dead) return;
    dead = true;
    deps.caf(frameId);
    deps.cancelAfter(timerId);
    canvas.remove();
  };

  frameId = deps.raf(frame);
  timerId = deps.after(destroy, CONFETTI_MS);
  return { destroy };
}
