import { newCode } from '../net/code';
import { createLoopbackPair } from '../net/loopback';
import { encode, parseClient } from '../net/protocol';
import type { Conn, HostEndpoint, Transport } from '../net/transport';
import { TICK } from './durations';
import type { Engine } from './party';
import type { Every, HostAction } from './types';

const ATTEMPTS = 5;

export type HostControl = Exclude<HostAction, { a: 'again' | 'lobby' }> | { a: 'again' } | { a: 'lobby' };

export interface HostOptions {
  transport: Transport;
  engine: Engine;
  now: () => number;
  every: Every;
  seed: number;
  rand: () => number;
  dev: boolean;
  speed: number;
  hostPid: string;
  rounds?: number;
}

export interface Host {
  code: string;
  control(a: HostControl): void;
  connectLocal(): Conn;
  stop(): void;
}

async function openEndpoint(transport: Transport, rand: () => number): Promise<HostEndpoint> {
  for (let i = 1; ; i++) {
    try {
      return await transport.host(newCode(rand));
    } catch (e) {
      if (i >= ATTEMPTS || !(e instanceof Error && e.message === 'taken')) throw e;
    }
  }
}

export async function createHost(o: HostOptions): Promise<Host> {
  const { engine } = o;
  const endpoint = await openEndpoint(o.transport, o.rand);
  let party = engine.create(endpoint.code, o.seed, o.hostPid, { dev: o.dev, speed: o.speed, rounds: o.rounds });
  let stopped = false;
  const conns = new Set<Conn>();
  const pidOf = new Map<Conn, string>();
  const connOf = new Map<string, Conn>();
  const last = new Map<string, string>();

  const safe = (fn: () => void): void => {
    if (stopped) return;
    try {
      fn();
    } catch (e) {
      console.error(e);
    }
  };

  function flush(): void {
    const t = o.now();
    for (const [pid, conn] of [...connOf]) {
      if (!party.players.some((x) => x.pid === pid)) {
        connOf.delete(pid);
        pidOf.delete(conn);
        last.delete(pid);
        conn.close();
        continue;
      }
      try {
        const view = engine.viewFor(party, pid, t);
        const json = JSON.stringify(view);
        if (last.get(pid) === json) continue;
        last.set(pid, json);
        conn.send(encode({ v: 1, t: 'view', view, now: t }));
      } catch (e) {
        console.error(e);
      }
    }
  }

  function cycle(): void {
    party = engine.tick(party, o.now());
    flush();
  }

  function bind(conn: Conn, pid: string): void {
    const old = connOf.get(pid);
    if (old) pidOf.delete(old);
    connOf.set(pid, conn);
    pidOf.set(conn, pid);
    last.delete(pid);
    old?.close();
  }

  function onMessage(conn: Conn, raw: string): void {
    safe(() => {
      const msg = parseClient(raw);
      if (!msg) return;
      const t = o.now();
      const bound = pidOf.get(conn);
      if (bound === undefined) {
        if (msg.t !== 'hello') return;
        const { p, res } = engine.hello(party, msg.pid, msg.name, t);
        party = p;
        if (!res.ok) {
          conn.send(encode({ v: 1, t: 'reject', reason: res.reason }));
          conn.close();
          return;
        }
        bind(conn, msg.pid);
        conn.send(encode({ v: 1, t: 'welcome', pid: msg.pid }));
        cycle();
        return;
      }
      if (msg.t === 'hello') return;
      party = engine.seen(party, bound, t);
      if (msg.t === 'ping') conn.send(encode({ v: 1, t: 'pong' }));
      else party = engine.input(party, bound, msg.round, msg.payload, t);
    });
  }

  function onClose(conn: Conn): void {
    conns.delete(conn);
    const pid = pidOf.get(conn);
    if (pid === undefined) return;
    pidOf.delete(conn);
    connOf.delete(pid);
    last.delete(pid);
    safe(() => {
      party = engine.disconnect(party, pid, o.now());
      cycle();
    });
  }

  function accept(conn: Conn): void {
    if (stopped) {
      conn.close();
      return;
    }
    conns.add(conn);
    conn.onMessage((raw) => onMessage(conn, raw));
    conn.onClose(() => onClose(conn));
  }

  endpoint.onConnection(accept);
  const stopTick = o.every(TICK, () => safe(cycle));
  const seed = (): number => Math.floor(o.rand() * 4294967296);

  return {
    code: endpoint.code,
    control(a) {
      safe(() => {
        const act: HostAction = a.a === 'again' || a.a === 'lobby' ? { a: a.a, seed: seed() } : a;
        party = engine.control(party, act, o.now());
        cycle();
      });
    },
    connectLocal() {
      const [hostSide, clientSide] = createLoopbackPair();
      accept(hostSide);
      return clientSide;
    },
    stop() {
      if (stopped) return;
      stopped = true;
      stopTick();
      for (const c of [...conns]) c.close();
      conns.clear();
      pidOf.clear();
      connOf.clear();
      last.clear();
      endpoint.close();
    },
  };
}
