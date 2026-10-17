import { OFFLINE, PING } from '../engine/durations';
import type { After, Every } from '../engine/types';
import type { View } from '../engine/view';
import { createEmitter } from './emitter';
import { encode, parseHost, type RejectReason } from './protocol';
import type { Conn } from './transport';

const RETRY = 1000;
const LOST_AFTER = 10_000;

export type ClientState =
  | { st: 'connecting' }
  | { st: 'joined'; view?: View }
  | { st: 'reconnecting'; view?: View }
  | { st: 'rejected'; reason: RejectReason }
  | { st: 'lost' };

export interface ClientOptions {
  connect: () => Promise<Conn>;
  pid: string;
  name: string;
  now: () => number;
  every: Every;
  after: After;
}

export interface ClientSession {
  onState(fn: (s: ClientState) => void): () => void;
  input(round: number, payload: unknown): void;
  toLocal(hostT: number): number;
  close(): void;
}

export function createClientSession(o: ClientOptions): ClientSession {
  const states = createEmitter<[ClientState]>();
  let state: ClientState = { st: 'connecting' };
  let view: View | undefined;
  let offset = 0;
  let conn: Conn | undefined;
  let welcomed = false;
  let inflight = false;
  let finished = false;
  let stopPing: (() => void) | undefined;
  let stopWatch: (() => void) | undefined;
  let stopRetry: (() => void) | undefined;
  let stopLost: (() => void) | undefined;

  const set = (s: ClientState): void => {
    state = s;
    states.emit(s);
  };

  const clearTimers = (): void => {
    for (const stop of [stopPing, stopWatch, stopRetry, stopLost]) stop?.();
    stopPing = stopWatch = stopRetry = stopLost = undefined;
  };

  function finish(s: ClientState | undefined): void {
    finished = true;
    clearTimers();
    const c = conn;
    conn = undefined;
    welcomed = false;
    c?.close();
    if (s) set(s);
  }

  function search(): void {
    stopLost?.();
    stopRetry?.();
    stopLost = o.after(LOST_AFTER, () => finish({ st: 'lost' }));
    stopRetry = o.every(RETRY, attempt);
  }

  function attempt(): void {
    if (finished || conn || inflight) return;
    inflight = true;
    o.connect().then(
      (c) => {
        inflight = false;
        if (finished || conn) c.close();
        else adopt(c);
      },
      () => {
        inflight = false;
      },
    );
  }

  const armWatch = (): void => {
    stopWatch?.();
    stopWatch = o.after(OFFLINE, dropConn);
  };

  function dropConn(): void {
    if (finished) return;
    const c = conn;
    conn = undefined;
    welcomed = false;
    stopPing?.();
    stopWatch?.();
    stopPing = stopWatch = undefined;
    c?.close();
    if (state.st === 'joined') {
      set({ st: 'reconnecting', view });
      search();
    }
    attempt();
  }

  function adopt(c: Conn): void {
    conn = c;
    welcomed = false;
    c.onMessage((raw) => onRaw(c, raw));
    c.onClose(() => {
      if (conn === c) dropConn();
    });
    c.send(encode({ v: 1, t: 'hello', pid: o.pid, name: o.name }));
    armWatch();
    stopPing = o.every(PING, () => conn?.send(encode({ v: 1, t: 'ping' })));
  }

  function onRaw(c: Conn, raw: string): void {
    if (conn !== c) return;
    const m = parseHost(raw);
    if (!m) return;
    armWatch();
    switch (m.t) {
      case 'welcome':
        stopLost?.();
        stopRetry?.();
        stopLost = stopRetry = undefined;
        welcomed = true;
        set({ st: 'joined', view });
        break;
      case 'view':
        if (!welcomed) break;
        offset = m.now - o.now();
        view = m.view;
        set({ st: 'joined', view });
        break;
      case 'reject':
        finish({ st: 'rejected', reason: m.reason });
        break;
      case 'pong':
        break;
    }
  }

  search();
  attempt();

  return {
    onState(fn) {
      fn(state);
      return states.on(fn);
    },
    input(round, payload) {
      if (welcomed) conn?.send(encode({ v: 1, t: 'input', round, payload }));
    },
    toLocal: (hostT) => hostT - offset,
    close() {
      finish(undefined);
      states.clear();
    },
  };
}
