import { describe, expect, it } from 'vitest';
import type { View } from '../engine/view';
import { encode, parseClient, parseHost, type ClientMsg, type HostMsg } from './protocol';

const PID = 'abcdefgh-1234';

const lobbyView: View = {
  me: PID,
  isHost: true,
  code: 'ABCD',
  players: [{ pid: PID, name: 'Karim', color: 0, online: true, total: 0, host: true }],
  s: 'lobby',
  rounds: 5,
  canStart: false,
  min: 2,
};

const clientMsgs: ClientMsg[] = [
  { v: 1, t: 'hello', pid: PID, name: 'Karim' },
  { v: 1, t: 'input', round: 3, payload: { x: [1, 2], y: null } },
  { v: 1, t: 'ping' },
];
const hostMsgs: HostMsg[] = [
  { v: 1, t: 'welcome', pid: PID },
  { v: 1, t: 'view', view: lobbyView, now: 12345.5 },
  { v: 1, t: 'reject', reason: 'full' },
  { v: 1, t: 'pong' },
];

const j = (o: unknown): string => JSON.stringify(o);

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('Hin- und Rückweg', () => {
  it.each(clientMsgs)('Client $t übersteht encode -> parseClient', (m) => {
    expect(parseClient(encode(m))).toStrictEqual(m);
  });

  it.each(hostMsgs)('Host $t übersteht encode -> parseHost', (m) => {
    expect(parseHost(encode(m))).toStrictEqual(m);
  });

  it('alle 7 Typen sind abgedeckt', () => {
    expect(clientMsgs.length + hostMsgs.length).toBe(7);
  });

  it('Zusatzfelder fallen weg', () => {
    for (const m of clientMsgs) expect(parseClient(j({ ...m, extra: 1, zzz: [1] }))).toStrictEqual(m);
    for (const m of hostMsgs) expect(parseHost(j({ ...m, extra: 1, zzz: [1] }))).toStrictEqual(m);
  });

  it('ein leerer Name wird angenommen', () => {
    const m: ClientMsg = { v: 1, t: 'hello', pid: PID, name: '' };
    expect(parseClient(encode(m))).toStrictEqual(m);
  });

  it('Name bis 64 Zeichen, 65 sind ungültig', () => {
    expect(parseClient(j({ v: 1, t: 'hello', pid: PID, name: 'n'.repeat(64) }))).not.toBeNull();
    expect(parseClient(j({ v: 1, t: 'hello', pid: PID, name: 'n'.repeat(65) }))).toBeNull();
  });

  it('input nimmt jeden JSON-Wert als payload, auch null', () => {
    for (const payload of [null, 0, 'x', [1], { a: 1 }, false]) {
      const m: ClientMsg = { v: 1, t: 'input', round: 0, payload };
      expect(parseClient(encode(m))).toStrictEqual(m);
    }
  });

  it('Nachrichten der Gegenrichtung sind ungültig', () => {
    for (const m of hostMsgs) expect(parseClient(encode(m))).toBeNull();
    for (const m of clientMsgs) expect(parseHost(encode(m))).toBeNull();
  });
});

describe('kaputte Eingaben ergeben null', () => {
  const hello = { v: 1, t: 'hello', pid: PID, name: 'A' };
  const input = { v: 1, t: 'input', round: 0, payload: 1 };
  const welcome = { v: 1, t: 'welcome', pid: PID };
  const view = { v: 1, t: 'view', view: { s: 'lobby' }, now: 1 };
  const reject = { v: 1, t: 'reject', reason: 'full' };

  const common: [string, unknown][] = [
    ['undefined', undefined],
    ['null', null],
    ['Zahl', 42],
    ['Objekt statt String', { v: 1, t: 'ping' }],
    ['Array', ['x']],
    ['kein JSON', '{nope'],
    ['leer', ''],
    ['JSON-Array', '[]'],
    ['JSON-Zahl', '5'],
    ['JSON-null', 'null'],
    ['JSON-String', '"ping"'],
    ['v fehlt', j({ t: 'ping' })],
    ['v = 2', j({ v: 2, t: 'ping' })],
    ['v als String', j({ v: '1', t: 'ping' })],
    ['t fehlt', j({ v: 1 })],
    ['unbekanntes t', j({ v: 1, t: 'boom' })],
    ['t kein String', j({ v: 1, t: 1 })],
  ];

  const client: [string, unknown][] = [
    ...common,
    ['hello ohne pid', j({ ...hello, pid: undefined })],
    ['hello ohne name', j({ ...hello, name: undefined })],
    ['hello pid Zahl', j({ ...hello, pid: 12345678 })],
    ['hello name Zahl', j({ ...hello, name: 1 })],
    ['pid mit 7 Zeichen', j({ ...hello, pid: 'a'.repeat(7) })],
    ['pid mit 65 Zeichen', j({ ...hello, pid: 'a'.repeat(65) })],
    ['pid mit Fremdzeichen', j({ ...hello, pid: 'abcdefgh!' })],
    ['input round -1', j({ ...input, round: -1 })],
    ['input round 1.5', j({ ...input, round: 1.5 })],
    ['input round String', j({ ...input, round: '1' })],
    ['input ohne round', j({ ...input, round: undefined })],
    ['input ohne payload-Schlüssel', j({ v: 1, t: 'input', round: 0 })],
    ['host-t pong', j({ v: 1, t: 'pong' })],
  ];

  const host: [string, unknown][] = [
    ...common,
    ['welcome ohne pid', j({ ...welcome, pid: undefined })],
    ['welcome pid mit 7 Zeichen', j({ ...welcome, pid: 'a'.repeat(7) })],
    ['welcome pid mit 65 Zeichen', j({ ...welcome, pid: 'a'.repeat(65) })],
    ['reject unbekannter reason', j({ ...reject, reason: 'x' })],
    ['reject reason Zahl', j({ ...reject, reason: 1 })],
    ['reject ohne reason', j({ v: 1, t: 'reject' })],
    ['view ohne view', j({ ...view, view: undefined })],
    ['view ohne String-s', j({ ...view, view: { x: 1 } })],
    ['view s Zahl', j({ ...view, view: { s: 1 } })],
    ['view als Array', j({ ...view, view: ['lobby'] })],
    ['view null', j({ ...view, view: null })],
    ['view ohne now', j({ ...view, now: undefined })],
    ['view now String', j({ ...view, now: '1' })],
    ['view now nicht endlich', '{"v":1,"t":"view","view":{"s":"lobby"},"now":1e999}'],
    ['client-t ping', j({ v: 1, t: 'ping' })],
  ];

  it.each(client)('parseClient: %s', (_n, raw) => {
    expect(() => parseClient(raw)).not.toThrow();
    expect(parseClient(raw)).toBeNull();
  });

  it.each(host)('parseHost: %s', (_n, raw) => {
    expect(() => parseHost(raw)).not.toThrow();
    expect(parseHost(raw)).toBeNull();
  });

  it('pid-Grenzen: 8 und 64 Zeichen sind gültig', () => {
    for (const n of [8, 64]) {
      expect(parseClient(j({ ...hello, pid: 'a'.repeat(n) }))).not.toBeNull();
      expect(parseHost(j({ ...welcome, pid: 'a'.repeat(n) }))).not.toBeNull();
    }
  });

  it('Größe: 16384 Zeichen sind gültig, 16385 nicht', () => {
    const base = j({ v: 1, t: 'input', round: 0, payload: '' });
    const fill = (len: number) => j({ v: 1, t: 'input', round: 0, payload: 'a'.repeat(len - base.length) });
    expect(fill(16384)).toHaveLength(16384);
    expect(parseClient(fill(16384))).not.toBeNull();
    expect(parseClient(fill(16385))).toBeNull();

    const vbase = j({ v: 1, t: 'view', view: { s: 'x', p: '' }, now: 1 });
    const vfill = (len: number) => j({ v: 1, t: 'view', view: { s: 'x', p: 'a'.repeat(len - vbase.length) }, now: 1 });
    expect(parseHost(vfill(16384))).not.toBeNull();
    expect(parseHost(vfill(16385))).toBeNull();
  });
});

describe('Fuzz (deterministisch)', () => {
  const chars = '{}[]":,.-+eE0123456789 \ntruefalsnvhlopigwcdb\\é€';

  function randomJson(r: () => number, depth: number): unknown {
    const k = Math.floor(r() * (depth > 2 ? 4 : 6));
    if (k === 0) return Math.floor(r() * 5) - 1;
    if (k === 1) return r() < 0.5 ? null : r() < 0.5;
    if (k === 2) return 'x'.repeat(Math.floor(r() * 12));
    if (k === 3) return r() * 1e6;
    if (k === 4) return Array.from({ length: Math.floor(r() * 4) }, () => randomJson(r, depth + 1));
    const o: Record<string, unknown> = { v: Math.floor(r() * 3) };
    for (const key of ['a', 'b', 'pid', 'name', 'round', 'now']) if (r() < 0.4) o[key] = randomJson(r, depth + 1);
    return o;
  }

  const randomInputs = (seed: number, n: number): string[] => {
    const r = mulberry(seed);
    const out: string[] = [];
    for (let i = 0; i < n; i++) {
      if (i % 2 === 0) {
        const len = Math.floor(r() * 60);
        let s = '';
        for (let c = 0; c < len; c++) s += chars[Math.floor(r() * chars.length)];
        out.push(s);
      } else {
        out.push(j(randomJson(r, 0)));
      }
    }
    return out;
  };

  const poison: Record<string, unknown[]> = {
    v: [0, 2, '1', null, true],
    t: [1, null, {}, 'zzz'],
    pid: [1, null, {}, 'short', 'a'.repeat(65), 'bad chars!!!'],
    name: [1, null, {}, [], 'n'.repeat(65)],
    round: [-1, 1.5, '1', null, {}],
    reason: ['x', 1, null, {}],
    now: ['1', null, {}, []],
    view: [null, 'v', [], { x: 1 }, { s: 3 }],
  };

  const mutated = (valid: object[], seed: number, n: number): string[] => {
    const r = mulberry(seed);
    const out: string[] = [];
    for (let i = 0; i < n; i++) {
      const base = { ...valid[Math.floor(r() * valid.length)] } as Record<string, unknown>;
      const keys = Object.keys(base).filter((k) => k in poison);
      const key = keys[Math.floor(r() * keys.length)] as string;
      const bad = poison[key] as unknown[];
      base[key] = bad[Math.floor(r() * bad.length)];
      out.push(j(base));
    }
    return out;
  };

  it('parseClient: >= 200 Zufallseingaben und >= 200 verfälschte Nachrichten ergeben null', () => {
    const inputs = [...randomInputs(1, 220), ...mutated(clientMsgs, 2, 220)];
    expect(inputs.length).toBeGreaterThanOrEqual(400);
    for (const raw of inputs) {
      expect(() => parseClient(raw)).not.toThrow();
      expect(parseClient(raw)).toBeNull();
    }
  });

  it('parseHost: >= 200 Zufallseingaben und >= 200 verfälschte Nachrichten ergeben null', () => {
    const inputs = [...randomInputs(3, 220), ...mutated(hostMsgs, 4, 220)];
    expect(inputs.length).toBeGreaterThanOrEqual(400);
    for (const raw of inputs) {
      expect(() => parseHost(raw)).not.toThrow();
      expect(parseHost(raw)).toBeNull();
    }
  });
});
