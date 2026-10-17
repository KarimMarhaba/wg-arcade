import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLoopbackPair } from '../net/loopback';
import { type ClientMsg, type HostMsg, encode, parseHost } from '../net/protocol';
import type { Conn, HostEndpoint, Transport } from '../net/transport';
import { GAME_IDS } from '../games/types';
import { dummyRegistry, makeDummy } from './dummygame';
import { fakeClock } from './fakeclock';
import { createHost } from './host';
import { createEngine, type Engine } from './party';
import { mix32, mulberry32 } from './prng';
import type { View } from './view';

const settle = () => new Promise<void>((r) => setImmediate(r));

const HOST_PID = 'pid-host-0001';
const pidOf = (name: string) => `pid-${name}-0001`;

type ViewMsg = Extract<HostMsg, { t: 'view' }>;

class TC {
  msgs: HostMsg[] = [];
  closed = false;
  constructor(readonly conn: Conn) {
    conn.onMessage((raw) => {
      const m = parseHost(raw);
      if (m) this.msgs.push(m);
    });
    conn.onClose(() => {
      this.closed = true;
    });
  }
  send(m: ClientMsg): void {
    this.conn.send(encode(m));
  }
  raw(s: string): void {
    this.conn.send(s);
  }
  hello(pid: string, name: string): void {
    this.send({ v: 1, t: 'hello', pid, name });
  }
  of<T extends HostMsg['t']>(t: T): Extract<HostMsg, { t: T }>[] {
    return this.msgs.filter((m): m is Extract<HostMsg, { t: T }> => m.t === t);
  }
  get views(): ViewMsg[] {
    return this.of('view');
  }
  get last(): View {
    const v = this.views.at(-1);
    if (!v) throw new Error('keine Sicht');
    return v.view;
  }
}

interface Setup {
  taken?: number;
  speed?: number;
  seed?: number;
  rand?: () => number;
  engine?: Engine;
  dev?: boolean;
}

async function setup(o: Setup = {}) {
  const clock = fakeClock();
  const engine = o.engine ?? createEngine(dummyRegistry());
  const tried: string[] = [];
  const closeEndpoint = vi.fn();
  let arrive: ((c: Conn) => void) | undefined;
  let taken = o.taken ?? 0;
  const transport: Transport = {
    host: async (code) => {
      tried.push(code);
      if (taken-- > 0) throw new Error('taken');
      const ep: HostEndpoint = {
        code,
        onConnection: (fn) => {
          arrive = fn;
          return () => {};
        },
        close: closeEndpoint,
      };
      return ep;
    },
    join: () => Promise.reject(new Error('noroom')),
  };
  const host = await createHost({
    transport,
    engine,
    now: clock.now,
    every: clock.every,
    seed: o.seed ?? 7,
    rand: o.rand ?? mulberry32(5),
    dev: o.dev ?? false,
    speed: o.speed ?? 1,
    hostPid: HOST_PID,
  });
  const connect = (): TC => {
    const [h, c] = createLoopbackPair();
    if (!arrive) throw new Error('kein Listener');
    arrive(h);
    return new TC(c);
  };
  const join = async (pid: string, name: string): Promise<TC> => {
    const tc = connect();
    tc.hello(pid, name);
    await settle();
    return tc;
  };
  const joinHost = async (): Promise<TC> => {
    const tc = new TC(host.connectLocal());
    tc.hello(HOST_PID, 'Karim');
    await settle();
    return tc;
  };
  const run = async (ms: number): Promise<void> => {
    for (let t = 0; t < ms; t += 100) {
      clock.advance(100);
      await settle();
    }
  };
  const runUntil = async (done: () => boolean, limitMs = 60_000): Promise<void> => {
    for (let t = 0; t < limitMs && !done(); t += 100) {
      clock.advance(100);
      await settle();
    }
    if (!done()) throw new Error('Bedingung nicht erreicht');
  };
  return { clock, engine, host, tried, closeEndpoint, connect, join, joinHost, run, runUntil };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Host-Join', () => {
  it('Host-Spieler über connectLocal und 2 Clients bekommen welcome und eine Lobby mit 3 Spielern', async () => {
    const s = await setup();
    const local = await s.joinHost();
    const a = await s.join(pidOf('anna'), 'Anna');
    const b = await s.join(pidOf('ben'), 'Ben');
    for (const tc of [local, a, b]) {
      expect(tc.of('welcome')).toHaveLength(1);
      expect(tc.last.s).toBe('lobby');
      expect(tc.last.players.map((p) => p.name)).toEqual(['Karim', 'Anna', 'Ben']);
    }
    expect(local.of('welcome')[0]?.pid).toBe(HOST_PID);
    expect(local.last.isHost).toBe(true);
    expect(a.last.isHost).toBe(false);
    expect(a.last.me).toBe(pidOf('anna'));
    expect(a.last.code).toBe(s.host.code);
  });

  it('der 9. Spieler bekommt reject full und die Conn wird geschlossen', async () => {
    const s = await setup();
    await s.joinHost();
    for (let i = 1; i < 8; i++) await s.join(`pid-player-${i}`, `P${i}`);
    const ninth = await s.join('pid-player-9', 'P9');
    expect(ninth.of('reject')).toEqual([{ v: 1, t: 'reject', reason: 'full' }]);
    expect(ninth.of('welcome')).toHaveLength(0);
    expect(ninth.closed).toBe(true);
  });

  it('badname (leer, nur Leerzeichen, 13 Zeichen) bekommt reject und wird geschlossen', async () => {
    const s = await setup();
    for (const name of ['', '   ', 'x'.repeat(13)]) {
      const tc = await s.join(pidOf('bad'), name);
      expect(tc.of('reject')).toEqual([{ v: 1, t: 'reject', reason: 'badname' }]);
      expect(tc.closed).toBe(true);
    }
  });

  it('eine neue pid nach dem Start bekommt reject started, eine bekannte pid darf zurück', async () => {
    const s = await setup();
    await s.joinHost();
    const a = await s.join(pidOf('anna'), 'Anna');
    s.host.control({ a: 'start' });
    await settle();
    const late = await s.join(pidOf('late'), 'Spät');
    expect(late.of('reject')).toEqual([{ v: 1, t: 'reject', reason: 'started' }]);
    expect(late.closed).toBe(true);
    const again = await s.join(pidOf('anna'), 'Anna');
    expect(again.of('welcome')).toHaveLength(1);
    expect(again.closed).toBe(false);
    expect(a.closed).toBe(true);
  });

  it('bei taken kommt ein neuer Code, höchstens 5 Versuche', async () => {
    const s = await setup({ taken: 3 });
    expect(s.tried).toHaveLength(4);
    expect(new Set(s.tried).size).toBe(4);
    expect(s.host.code).toBe(s.tried[3]);

    await expect(setup({ taken: 99 })).rejects.toThrow('taken');
  });

  it('genau 5 Versuche bei Dauer-taken, andere Fehler brechen sofort ab', async () => {
    let attempts = 0;
    const always: Transport = {
      host: async () => {
        attempts++;
        throw new Error('taken');
      },
      join: () => Promise.reject(new Error('noroom')),
    };
    const base = { engine: createEngine(dummyRegistry()), now: () => 0, every: () => () => {}, seed: 1, rand: mulberry32(1), dev: false, speed: 1, hostPid: HOST_PID };
    await expect(createHost({ ...base, transport: always })).rejects.toThrow('taken');
    expect(attempts).toBe(5);

    attempts = 0;
    const broken: Transport = {
      host: async () => {
        attempts++;
        throw new Error('timeout');
      },
      join: always.join,
    };
    await expect(createHost({ ...base, transport: broken })).rejects.toThrow('timeout');
    expect(attempts).toBe(1);
  });
});

describe('Host-Bindung', () => {
  it('gleiche pid auf neuer Conn schließt die alte, die neue bekommt sofort die volle Sicht', async () => {
    const s = await setup();
    const local = await s.joinHost();
    const first = await s.join(pidOf('anna'), 'Anna');
    const second = await s.join(pidOf('anna'), 'Anna');
    expect(first.closed).toBe(true);
    expect(second.closed).toBe(false);
    expect(second.of('welcome')).toHaveLength(1);
    expect(second.views).toHaveLength(1);
    expect(second.last.players.map((p) => p.name)).toEqual(['Karim', 'Anna']);
    expect(local.last.players.map((p) => p.name)).toEqual(['Karim', 'Anna']);
    expect(local.last.players.every((p) => p.online)).toBe(true);
  });

  it('schließt die gebundene Conn, fliegt der Spieler in der Lobby raus', async () => {
    const s = await setup();
    const local = await s.joinHost();
    const a = await s.join(pidOf('anna'), 'Anna');
    a.conn.close();
    await settle();
    expect(local.last.players.map((p) => p.name)).toEqual(['Karim']);
  });

  it('schließt die gebundene Conn im Spiel, ist der Spieler offline und bleibt gelistet', async () => {
    const s = await setup();
    const local = await s.joinHost();
    const a = await s.join(pidOf('anna'), 'Anna');
    const b = await s.join(pidOf('ben'), 'Ben');
    s.host.control({ a: 'start' });
    await s.run(3000);
    expect(local.last.s).toBe('game');
    b.conn.close();
    await settle();
    const ben = local.last.players.find((p) => p.name === 'Ben');
    expect(ben).toMatchObject({ online: false });
    expect(local.last.players).toHaveLength(3);
    expect(a.last.players.find((p) => p.name === 'Ben')?.online).toBe(false);
  });

  it('eine Conn, deren Spieler die Engine entfernt hat, wird geschlossen', async () => {
    const s = await setup();
    const a = await s.join(pidOf('anna'), 'Anna');
    const b = await s.join(pidOf('ben'), 'Ben');
    for (let i = 0; i < 8; i++) {
      s.clock.advance(1000);
      await settle();
      b.send({ v: 1, t: 'ping' });
      await settle();
    }
    expect(a.closed).toBe(true);
    expect(b.closed).toBe(false);
    expect(b.last.players.map((p) => p.name)).toEqual(['Ben']);
  });
});

describe('Host-Flush', () => {
  it('Sichten gehen nur bei Änderung raus: Leerlauf-Ticks und Pings senden keine Sicht', async () => {
    const s = await setup();
    const local = await s.joinHost();
    const a = await s.join(pidOf('anna'), 'Anna');
    const nLocal = local.views.length;
    const nA = a.views.length;
    await s.run(1000);
    a.send({ v: 1, t: 'ping' });
    await settle();
    expect(a.of('pong')).toHaveLength(1);
    expect(local.views).toHaveLength(nLocal);
    expect(a.views).toHaveLength(nA);
  });

  it('hello flusht sofort an alle, ohne dass die Uhr läuft', async () => {
    const s = await setup();
    const local = await s.joinHost();
    const before = local.views.length;
    const a = await s.join(pidOf('anna'), 'Anna');
    expect(local.views).toHaveLength(before + 1);
    expect(local.last.players).toHaveLength(2);
    expect(a.views).toHaveLength(1);
  });

  it('control flusht sofort', async () => {
    const s = await setup();
    const local = await s.joinHost();
    const a = await s.join(pidOf('anna'), 'Anna');
    s.host.control({ a: 'rounds', n: 3 });
    await settle();
    for (const tc of [local, a]) expect(tc.last).toMatchObject({ s: 'lobby', rounds: 3 });
  });

  it('disconnect flusht sofort', async () => {
    const s = await setup();
    const a = await s.join(pidOf('anna'), 'Anna');
    const b = await s.join(pidOf('ben'), 'Ben');
    expect(a.last.players).toHaveLength(2);
    b.conn.close();
    await settle();
    expect(a.last.players.map((p) => p.name)).toEqual(['Anna']);
  });

  it('input wird erst beim nächsten Tick geflusht', async () => {
    const s = await setup();
    const local = await s.joinHost();
    const a = await s.join(pidOf('anna'), 'Anna');
    s.host.control({ a: 'start' });
    await s.run(3000);
    expect(a.last).toMatchObject({ s: 'game', r: 0 });
    expect((a.last as { g: { mine: number | null } }).g.mine).toBeNull();
    const n = a.views.length;
    a.send({ v: 1, t: 'input', round: 0, payload: { v: 7 } });
    await settle();
    expect(a.views).toHaveLength(n);
    s.clock.advance(100);
    await settle();
    expect(a.views).toHaveLength(n + 1);
    expect((a.last as { g: { mine: number | null } }).g.mine).toBe(7);
    expect(local.last.s).toBe('game');
  });

  it('again und lobby bekommen einen Seed aus rand', async () => {
    const s = await setup({ speed: 10, seed: 7, rand: () => 0.25, dev: true });
    const local = await s.joinHost();
    await s.join(pidOf('anna'), 'Anna');
    s.host.control({ a: 'rounds', n: 3 });
    s.host.control({ a: 'start' });
    const gameSeed = (from: number): number | undefined => {
      const g = local.views.slice(from).find((v) => v.view.s === 'game');
      return (g?.view as { g: { seed: number } } | undefined)?.g.seed;
    };
    await s.runUntil(() => gameSeed(0) !== undefined);
    expect(gameSeed(0)).toBe(mix32(7, 0));
    const fresh = Math.floor(0.25 * 4294967296);

    await s.runUntil(() => local.last.s === 'podium');
    let k = local.views.length;
    s.host.control({ a: 'again' });
    await s.runUntil(() => gameSeed(k) !== undefined);
    expect(gameSeed(k)).toBe(mix32(fresh, 0));

    await s.runUntil(() => local.last.s === 'podium');
    s.host.control({ a: 'lobby' });
    await settle();
    expect(local.last.s).toBe('lobby');
    k = local.views.length;
    s.host.control({ a: 'start' });
    await s.runUntil(() => gameSeed(k) !== undefined);
    expect(gameSeed(k)).toBe(mix32(fresh, 0));
  });
});

describe('Host-Ablauf', () => {
  it('eine Party läuft von der Lobby bis zum Podium, alle Clients bekommen die Podium-Sicht', async () => {
    const s = await setup({ speed: 10 });
    const local = await s.joinHost();
    const a = await s.join(pidOf('anna'), 'Anna');
    const b = await s.join(pidOf('ben'), 'Ben');
    s.host.control({ a: 'rounds', n: 3 });
    s.host.control({ a: 'start' });
    await s.runUntil(() => [local, a, b].every((tc) => tc.last.s === 'podium'));
    for (const tc of [local, a, b]) {
      const seen = tc.views.map((v) => v.view.s);
      expect(seen).toContain('intro');
      expect(seen).toContain('game');
      expect(seen).toContain('result');
      expect(tc.last).toMatchObject({ s: 'podium' });
      expect((tc.last as { rows: unknown[] }).rows).toHaveLength(3);
    }
  });

  it('kaputte Nachrichten und Nachrichten vor hello halten den Host nicht an', async () => {
    const s = await setup();
    const tc = s.connect();
    tc.raw('kein json');
    tc.raw('{}');
    tc.raw(JSON.stringify({ v: 2, t: 'ping' }));
    tc.raw('x'.repeat(20_000));
    tc.send({ v: 1, t: 'ping' });
    tc.send({ v: 1, t: 'input', round: 0, payload: { v: 1 } });
    await settle();
    expect(tc.msgs).toEqual([]);
    expect(tc.closed).toBe(false);

    tc.hello(pidOf('anna'), 'Anna');
    await settle();
    expect(tc.of('welcome')).toHaveLength(1);
    tc.hello(pidOf('anna'), 'Anderer');
    tc.send({ v: 1, t: 'ping' });
    await settle();
    expect(tc.of('welcome')).toHaveLength(1);
    expect(tc.of('pong')).toHaveLength(1);
    expect(tc.last.players.map((p) => p.name)).toEqual(['Anna']);
  });

  it('eine werfende Spiellogik (input) hält den Host nicht an', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const reg = Object.fromEntries(
      GAME_IDS.map((id) => [
        id,
        {
          ...makeDummy(id),
          input: () => {
            throw new Error('boom');
          },
        },
      ]),
    );
    const s = await setup({ engine: createEngine(reg) });
    const local = await s.joinHost();
    const a = await s.join(pidOf('anna'), 'Anna');
    s.host.control({ a: 'start' });
    await s.run(3000);
    a.send({ v: 1, t: 'input', round: 0, payload: { v: 1 } });
    await settle();
    expect(err).toHaveBeenCalled();
    a.send({ v: 1, t: 'ping' });
    await settle();
    expect(a.of('pong')).toHaveLength(1);
    await s.run(200);
    expect(local.last.s).toBe('game');
  });

  it('eine werfende Spiellogik (tick) hält den Host nicht an', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const reg = Object.fromEntries(
      GAME_IDS.map((id) => [
        id,
        {
          ...makeDummy(id),
          tick: () => {
            throw new Error('boom');
          },
        },
      ]),
    );
    const s = await setup({ engine: createEngine(reg) });
    await s.joinHost();
    const a = await s.join(pidOf('anna'), 'Anna');
    s.host.control({ a: 'start' });
    await s.run(3500);
    expect(err.mock.calls.length).toBeGreaterThan(1);
    a.send({ v: 1, t: 'ping' });
    await settle();
    expect(a.of('pong')).toHaveLength(1);
    expect(() => s.host.stop()).not.toThrow();
  });

  it('nach stop() sind alle Conns zu, es wird nicht mehr getickt, neue Conns werden geschlossen', async () => {
    const engine = createEngine(dummyRegistry());
    const spied: Engine = { ...engine, tick: vi.fn(engine.tick) };
    const s = await setup({ engine: spied });
    const local = await s.joinHost();
    const a = await s.join(pidOf('anna'), 'Anna');
    const lurker = s.connect();
    await s.run(300);
    s.host.stop();
    await settle();
    for (const tc of [local, a, lurker]) expect(tc.closed).toBe(true);
    expect(s.closeEndpoint).toHaveBeenCalledTimes(1);
    expect(s.clock.pending()).toBe(0);

    const ticks = vi.mocked(spied.tick).mock.calls.length;
    await s.run(1000);
    expect(vi.mocked(spied.tick).mock.calls).toHaveLength(ticks);

    const late = s.connect();
    late.hello(pidOf('ben'), 'Ben');
    await settle();
    expect(late.of('welcome')).toHaveLength(0);
    expect(late.closed).toBe(true);
    expect(() => s.host.control({ a: 'start' })).not.toThrow();
    s.host.stop();
  });
});
