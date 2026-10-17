import { describe, expect, it, vi } from 'vitest';
import { fakeClock } from '../engine/fakeclock';
import type { View } from '../engine/view';
import { createClientSession, type ClientState } from './client';
import { createLoopbackPair } from './loopback';
import { type ClientMsg, type HostMsg, encode, parseClient } from './protocol';
import type { Conn } from './transport';

const settle = () => new Promise<void>((r) => setImmediate(r));

const PID = 'pid-anna-0001';

const view = (tag: string): View => ({
  s: 'lobby',
  me: PID,
  isHost: false,
  code: 'ABCD',
  players: [{ pid: PID, name: tag, color: 0, online: true, total: 0, host: false }],
  drinking: false,
  rounds: 5,
  canStart: false,
  min: 2,
});

class Remote {
  got: ClientMsg[] = [];
  closed = false;
  constructor(readonly host: Conn, readonly client: Conn) {
    host.onMessage((raw) => {
      const m = parseClient(raw);
      if (m) this.got.push(m);
    });
    host.onClose(() => {
      this.closed = true;
    });
  }
  send(m: HostMsg): void {
    this.host.send(encode(m));
  }
  welcome(): void {
    this.send({ v: 1, t: 'welcome', pid: PID });
  }
  view(v: View, now: number): void {
    this.send({ v: 1, t: 'view', view: v, now });
  }
  drop(): void {
    this.host.close();
  }
  count(t: ClientMsg['t']): number {
    return this.got.filter((m) => m.t === t).length;
  }
}

function setup() {
  const clock = fakeClock();
  const attempts: { resolve(c: Conn): void; reject(e: Error): void }[] = [];
  const connect = vi.fn(
    () =>
      new Promise<Conn>((resolve, reject) => {
        attempts.push({ resolve, reject });
      }),
  );
  const session = createClientSession({
    connect,
    pid: PID,
    name: 'Anna',
    now: clock.now,
    every: clock.every,
    after: clock.after,
  });
  const states: ClientState[] = [];
  session.onState((s) => states.push(s));
  const remote = (): Remote => {
    const [host, client] = createLoopbackPair();
    return new Remote(host, client);
  };
  const open = async (i = attempts.length - 1): Promise<Remote> => {
    const r = remote();
    attempts[i]?.resolve(r.client);
    await settle();
    return r;
  };
  const joined = async (): Promise<Remote> => {
    const r = await open();
    r.welcome();
    await settle();
    return r;
  };
  const advance = async (ms: number): Promise<void> => {
    clock.advance(ms);
    await settle();
  };
  const fail = async (i = attempts.length - 1): Promise<void> => {
    attempts[i]?.reject(new Error('noroom'));
    await settle();
  };
  const last = (): ClientState => states[states.length - 1] as ClientState;
  return { clock, attempts, connect, session, states, remote, open, joined, advance, fail, last };
}

describe('Client-Basis', () => {
  it('startet in connecting und verbindet sofort', () => {
    const s = setup();
    expect(s.states).toEqual([{ st: 'connecting' }]);
    expect(s.connect).toHaveBeenCalledTimes(1);
  });

  it('sendet beim Verbinden hello, danach alle 2 s ein ping', async () => {
    const s = setup();
    const r = await s.joined();
    expect(r.got).toEqual([{ v: 1, t: 'hello', pid: PID, name: 'Anna' }]);
    await s.advance(1900);
    expect(r.count('ping')).toBe(0);
    await s.advance(100);
    expect(r.count('ping')).toBe(1);
    await s.advance(2000);
    expect(r.count('ping')).toBe(2);
  });

  it('joined gilt erst ab welcome; Sichten davor werden ignoriert', async () => {
    const s = setup();
    const r = await s.open();
    expect(s.last()).toEqual({ st: 'connecting' });
    r.view(view('x'), 0);
    await settle();
    expect(s.last()).toEqual({ st: 'connecting' });
    r.welcome();
    await settle();
    expect(s.last()).toEqual({ st: 'joined' });
    r.view(view('Anna'), 0);
    await settle();
    expect(s.last()).toEqual({ st: 'joined', view: view('Anna') });
  });

  it('toLocal rechnet mit dem Offset aus view.now', async () => {
    const s = setup();
    const r = await s.joined();
    expect(s.session.toLocal(1234)).toBe(1234);
    await s.advance(1000);
    r.view(view('a'), 5000);
    await settle();
    expect(s.session.toLocal(7000)).toBe(3000);
    await s.advance(2000);
    r.view(view('b'), 8000);
    await settle();
    expect(s.session.toLocal(9000)).toBe(4000);
  });

  it('onState liefert sofort den aktuellen, gepufferten Zustand', async () => {
    const s = setup();
    const r = await s.joined();
    r.view(view('Anna'), 0);
    await settle();
    const seen: ClientState[] = [];
    const off = s.session.onState((st) => seen.push(st));
    expect(seen).toEqual([{ st: 'joined', view: view('Anna') }]);
    r.view(view('Neu'), 0);
    await settle();
    expect(seen).toHaveLength(2);
    off();
    r.view(view('Noch neuer'), 0);
    await settle();
    expect(seen).toHaveLength(2);
  });

  it('input sendet nur nach welcome', async () => {
    const s = setup();
    const r = await s.open();
    s.session.input(0, { v: 1 });
    await settle();
    expect(r.count('input')).toBe(0);
    r.welcome();
    await settle();
    s.session.input(2, { v: 5 });
    await settle();
    expect(r.got.filter((m) => m.t === 'input')).toEqual([{ v: 1, t: 'input', round: 2, payload: { v: 5 } }]);
  });

  it('kaputte Host-Nachrichten werden verworfen', async () => {
    const s = setup();
    const r = await s.joined();
    const n = s.states.length;
    r.host.send('kein json');
    r.host.send('{"v":1,"t":"view"}');
    await settle();
    expect(s.states).toHaveLength(n);
  });
});

describe('Client-Ausfall', () => {
  it('6 s Stille führen zu reconnecting mit der letzten Sicht', async () => {
    const s = setup();
    const r = await s.joined();
    r.view(view('Anna'), 0);
    await settle();
    await s.advance(5900);
    expect(s.last().st).toBe('joined');
    await s.advance(200);
    expect(s.last()).toEqual({ st: 'reconnecting', view: view('Anna') });
    expect(r.closed).toBe(true);
  });

  it('jede Host-Nachricht setzt den Watchdog zurück', async () => {
    const s = setup();
    const r = await s.joined();
    for (let i = 0; i < 5; i++) {
      await s.advance(4000);
      r.send({ v: 1, t: 'pong' });
      await settle();
    }
    expect(s.last().st).toBe('joined');
  });

  it('onClose führt sofort zu reconnecting und startet einen Versuch', async () => {
    const s = setup();
    const r = await s.joined();
    r.view(view('Anna'), 0);
    await settle();
    r.drop();
    await settle();
    expect(s.last()).toEqual({ st: 'reconnecting', view: view('Anna') });
    expect(s.connect).toHaveBeenCalledTimes(2);
  });

  it('Versuche laufen im 1-s-Takt und nie parallel; welcome führt zurück zu joined', async () => {
    const s = setup();
    const r = await s.joined();
    r.view(view('Anna'), 0);
    await settle();
    r.drop();
    await settle();
    expect(s.connect).toHaveBeenCalledTimes(2);

    await s.fail(1);
    await s.advance(999);
    expect(s.connect).toHaveBeenCalledTimes(2);
    await s.advance(1);
    expect(s.connect).toHaveBeenCalledTimes(3);

    await s.advance(5000);
    expect(s.connect).toHaveBeenCalledTimes(3);
    expect(s.last().st).toBe('reconnecting');

    const r2 = await s.open();
    expect(r2.got).toEqual([{ v: 1, t: 'hello', pid: PID, name: 'Anna' }]);
    expect(s.last().st).toBe('reconnecting');
    r2.welcome();
    await settle();
    expect(s.last()).toEqual({ st: 'joined', view: view('Anna') });
    await s.advance(5000);
    expect(s.connect).toHaveBeenCalledTimes(3);
  });

  it('ohne Erfolg nach 10 s kommt lost, danach keine Versuche mehr', async () => {
    const s = setup();
    const r = await s.joined();
    r.drop();
    await settle();
    const lostAt = s.clock.now();
    for (let i = 0; i < 9; i++) {
      await s.fail();
      await s.advance(1000);
    }
    expect(s.last().st).toBe('reconnecting');
    await s.advance(900);
    expect(s.clock.now() - lostAt).toBe(9900);
    expect(s.last().st).toBe('reconnecting');
    await s.advance(100);
    expect(s.last()).toEqual({ st: 'lost' });
    const n = s.connect.mock.calls.length;
    await s.advance(10_000);
    expect(s.connect).toHaveBeenCalledTimes(n);
    expect(s.clock.pending()).toBe(0);
  });

  it('ein hängender Versuch hindert lost nicht; eine zu spät ankommende Conn wird geschlossen', async () => {
    const s = setup();
    const r = await s.joined();
    r.drop();
    await settle();
    await s.advance(10_000);
    expect(s.last().st).toBe('lost');
    const late = s.remote();
    s.attempts.at(-1)?.resolve(late.client);
    await settle();
    expect(late.closed).toBe(true);
    expect(late.got).toEqual([]);
    expect(s.last().st).toBe('lost');
  });

  it('erste Verbindung scheitert: neuer Versuch nach 1 s, nach 10 s lost', async () => {
    const s = setup();
    await s.fail(0);
    await s.advance(1000);
    expect(s.connect).toHaveBeenCalledTimes(2);
    expect(s.last()).toEqual({ st: 'connecting' });
    for (let i = 1; i < 9; i++) {
      await s.fail();
      await s.advance(1000);
    }
    expect(s.last()).toEqual({ st: 'connecting' });
    await s.fail();
    await s.advance(1000);
    expect(s.last()).toEqual({ st: 'lost' });
  });

  it('reject führt zu rejected ohne Reconnect', async () => {
    const s = setup();
    const r = await s.open();
    r.send({ v: 1, t: 'reject', reason: 'badname' });
    await settle();
    expect(s.last()).toEqual({ st: 'rejected', reason: 'badname' });
    r.drop();
    await settle();
    await s.advance(30_000);
    expect(s.connect).toHaveBeenCalledTimes(1);
    expect(s.last()).toEqual({ st: 'rejected', reason: 'badname' });
    expect(s.clock.pending()).toBe(0);
  });

  it('close() stoppt alle Timer und schließt die Conn; Zustände kommen nicht mehr', async () => {
    const s = setup();
    const r = await s.joined();
    s.session.close();
    await settle();
    expect(r.closed).toBe(true);
    expect(s.clock.pending()).toBe(0);
    const n = s.states.length;
    await s.advance(30_000);
    expect(s.states).toHaveLength(n);
    expect(r.count('ping')).toBe(0);
    s.session.close();
  });

  it('close() während eines hängenden Versuchs: die späte Conn wird geschlossen', async () => {
    const s = setup();
    s.session.close();
    expect(s.clock.pending()).toBe(0);
    const late = s.remote();
    s.attempts[0]?.resolve(late.client);
    await settle();
    expect(late.closed).toBe(true);
    expect(s.states).toEqual([{ st: 'connecting' }]);
  });
});
