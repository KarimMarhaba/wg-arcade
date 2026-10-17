import { Peer } from 'peerjs';
import type { DataConnection } from 'peerjs';
import { createConn } from './conn';
import { createEmitter } from './emitter';
import type { Conn, HostEndpoint, Transport } from './transport';

const PREFIX = 'wgarcade-';
const OPTIONS = { config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] } };
const CONNECT_TIMEOUT = 10_000;
const HARD_CLOSE = 1000;

function wrap(dc: DataConnection, onGone: () => void): Conn {
  let hard: ReturnType<typeof setTimeout> | undefined;
  const core = createConn({
    write: (data) => {
      if (dc.open) dc.send(data);
    },
    shut: () => {
      dc.close({ flush: true });
      hard = setTimeout(() => {
        dc.close();
        onGone();
      }, HARD_CLOSE);
    },
  });
  dc.on('data', (d) => {
    if (typeof d === 'string') core.receive(d);
  });
  dc.on('close', () => {
    clearTimeout(hard);
    core.ended();
    onGone();
  });
  return core.conn;
}

function host(code: string): Promise<HostEndpoint> {
  return new Promise((resolve, reject) => {
    const peer = new Peer(PREFIX + code, OPTIONS);
    const arrivals = createEmitter<[Conn]>();
    let settled = false;
    const fail = (e: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      peer.destroy();
      reject(e);
    };
    const timer = setTimeout(() => fail(new Error('timeout')), CONNECT_TIMEOUT);

    peer.on('open', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, onConnection: arrivals.on, close: () => peer.destroy() });
    });
    peer.on('error', (err) => fail(new Error(err.type === 'unavailable-id' ? 'taken' : err.type)));
    peer.on('disconnected', () => {
      if (!peer.destroyed) peer.reconnect();
    });
    peer.on('connection', (dc) => {
      dc.on('open', () => arrivals.emit(wrap(dc, () => {})));
    });
  });
}

function join(code: string, timeoutMs: number = CONNECT_TIMEOUT): Promise<Conn> {
  return new Promise((resolve, reject) => {
    const peer = new Peer(OPTIONS);
    let settled = false;
    const fail = (e: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      peer.destroy();
      reject(e);
    };
    const timer = setTimeout(() => fail(new Error('timeout')), timeoutMs);

    peer.on('error', (err) => fail(new Error(err.type === 'peer-unavailable' ? 'noroom' : err.type)));
    peer.on('open', () => {
      const dc = peer.connect(PREFIX + code, { reliable: true });
      dc.on('open', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(wrap(dc, () => peer.destroy()));
      });
    });
  });
}

export function createPeerTransport(): Transport {
  return { host, join };
}
