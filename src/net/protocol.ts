import type { View } from '../engine/view';

export type ClientMsg =
  | { v: 1; t: 'hello'; pid: string; name: string }
  | { v: 1; t: 'input'; round: number; payload: unknown }
  | { v: 1; t: 'ping' };

export type RejectReason = 'full' | 'started' | 'badname';

export type HostMsg =
  | { v: 1; t: 'welcome'; pid: string }
  | { v: 1; t: 'view'; view: View; now: number }
  | { v: 1; t: 'reject'; reason: RejectReason }
  | { v: 1; t: 'pong' };

const MAX_RAW = 16384;
const MAX_NAME = 64;
const PID_RE = /^[A-Za-z0-9-]{8,64}$/;
const REASONS: readonly unknown[] = ['full', 'started', 'badname'];

type Obj = Record<string, unknown>;

const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);
const isPid = (x: unknown): x is string => typeof x === 'string' && PID_RE.test(x);

function parseEnvelope(raw: unknown): Obj | null {
  if (typeof raw !== 'string' || raw.length > MAX_RAW) return null;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  return isObj(json) && json.v === 1 ? json : null;
}

export function parseClient(raw: unknown): ClientMsg | null {
  const o = parseEnvelope(raw);
  if (!o) return null;
  switch (o.t) {
    case 'hello':
      return isPid(o.pid) && typeof o.name === 'string' && o.name.length <= MAX_NAME
        ? { v: 1, t: 'hello', pid: o.pid, name: o.name }
        : null;
    case 'input':
      return typeof o.round === 'number' && Number.isInteger(o.round) && o.round >= 0 && Object.hasOwn(o, 'payload')
        ? { v: 1, t: 'input', round: o.round, payload: o.payload }
        : null;
    case 'ping':
      return { v: 1, t: 'ping' };
    default:
      return null;
  }
}

export function parseHost(raw: unknown): HostMsg | null {
  const o = parseEnvelope(raw);
  if (!o) return null;
  switch (o.t) {
    case 'welcome':
      return isPid(o.pid) ? { v: 1, t: 'welcome', pid: o.pid } : null;
    case 'view':
      return isObj(o.view) && typeof o.view.s === 'string' && typeof o.now === 'number' && Number.isFinite(o.now)
        ? { v: 1, t: 'view', view: o.view as unknown as View, now: o.now }
        : null;
    case 'reject':
      return REASONS.includes(o.reason) ? { v: 1, t: 'reject', reason: o.reason as RejectReason } : null;
    case 'pong':
      return { v: 1, t: 'pong' };
    default:
      return null;
  }
}

export function encode(m: ClientMsg | HostMsg): string {
  return JSON.stringify(m);
}
