import { createConn, type ConnCore } from './conn';
import { createEmitter } from './emitter';
import type { Conn, HostEndpoint, Transport } from './transport';

type Dir = 'c2h' | 'h2c';
interface Env {
  k: 'syn' | 'ack' | 'd' | 'fin';
  cid: string;
  dir?: Dir;
  m?: string;
}

const JOIN_TIMEOUT = 3000;
const channelName = (code: string): string => `wgarcade-${code}`;

function parseEnv(x: unknown): Env | null {
  if (typeof x !== 'object' || x === null) return null;
  const e = x as Record<string, unknown>;
  if (e.k !== 'syn' && e.k !== 'ack' && e.k !== 'd' && e.k !== 'fin') return null;
  if (typeof e.cid !== 'string') return null;
  if (e.dir !== undefined && e.dir !== 'c2h' && e.dir !== 'h2c') return null;
  if (e.m !== undefined && typeof e.m !== 'string') return null;
  return { k: e.k, cid: e.cid, dir: e.dir, m: e.m };
}

function host(code: string): Promise<HostEndpoint> {
  const ch = new BroadcastChannel(channelName(code));
  const conns = new Map<string, ConnCore>();
  const arrivals = createEmitter<[Conn]>();
  let closed = false;

  const close = (): void => {
    if (closed) return;
    closed = true;
    if (typeof globalThis.removeEventListener === 'function') globalThis.removeEventListener('pagehide', close);
    for (const c of [...conns.values()]) c.conn.close();
    conns.clear();
    arrivals.clear();
    ch.close();
  };

  ch.onmessage = (e: MessageEvent) => {
    const env = parseEnv(e.data);
    if (!env || closed) return;
    const known = conns.get(env.cid);
    if (env.k === 'syn') {
      if (!known) {
        const core = createConn({
          write: (m) => ch.postMessage({ k: 'd', cid: env.cid, dir: 'h2c', m }),
          shut: () => ch.postMessage({ k: 'fin', cid: env.cid, dir: 'h2c' }),
        });
        core.conn.onClose(() => conns.delete(env.cid));
        conns.set(env.cid, core);
        arrivals.emit(core.conn);
      }
      ch.postMessage({ k: 'ack', cid: env.cid });
    } else if (known && env.dir === 'c2h') {
      if (env.k === 'd' && env.m !== undefined) known.receive(env.m);
      else if (env.k === 'fin') known.ended();
    }
  };

  if (typeof globalThis.addEventListener === 'function') globalThis.addEventListener('pagehide', close);

  return Promise.resolve({ code, onConnection: arrivals.on, close });
}

function join(code: string, timeoutMs: number = JOIN_TIMEOUT): Promise<Conn> {
  return new Promise((resolve, reject) => {
    const ch = new BroadcastChannel(channelName(code));
    const cid = crypto.randomUUID();
    let core: ConnCore | undefined;
    const timer = setTimeout(() => {
      ch.close();
      reject(new Error('noroom'));
    }, timeoutMs);

    ch.onmessage = (e: MessageEvent) => {
      const env = parseEnv(e.data);
      if (!env || env.cid !== cid) return;
      if (!core) {
        if (env.k !== 'ack') return;
        clearTimeout(timer);
        core = createConn({
          write: (m) => ch.postMessage({ k: 'd', cid, dir: 'c2h', m }),
          shut: () => ch.postMessage({ k: 'fin', cid, dir: 'c2h' }),
        });
        core.conn.onClose(() => ch.close());
        resolve(core.conn);
      } else if (env.dir === 'h2c') {
        if (env.k === 'd' && env.m !== undefined) core.receive(env.m);
        else if (env.k === 'fin') core.ended();
      }
    };
    ch.postMessage({ k: 'syn', cid });
  });
}

export function createLocalTransport(): Transport {
  return { host, join };
}
