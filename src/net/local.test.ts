import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLocalTransport } from './local';
import type { Conn } from './transport';

const RealChannel = BroadcastChannel;
let channels: BroadcastChannel[] = [];
let n = 0;
const nextCode = (): string => 'AB' + String.fromCharCode(65 + Math.floor(n / 24)) + String.fromCharCode(65 + (n++ % 24));

interface Tap {
  msgs: string[];
  events: string[];
  closes: number;
  until(pred: () => boolean): Promise<void>;
}

function tap(c: Conn): Tap {
  const waiters: (() => void)[] = [];
  const t: Tap = {
    msgs: [],
    events: [],
    closes: 0,
    until: (pred) =>
      new Promise<void>((resolve) => {
        const check = (): void => (pred() ? resolve() : void waiters.push(check));
        check();
      }),
  };
  const poke = (): void => waiters.splice(0).forEach((w) => w());
  c.onMessage((m) => {
    t.msgs.push(m);
    t.events.push(`msg:${m}`);
    poke();
  });
  c.onClose(() => {
    t.closes++;
    t.events.push('close');
    poke();
  });
  return t;
}

async function room() {
  const code = nextCode();
  const transport = createLocalTransport();
  const ep = await transport.host(code);
  const hostSide: Tap[] = [];
  const hostConns: Conn[] = [];
  ep.onConnection((c) => {
    hostConns.push(c);
    hostSide.push(tap(c));
  });
  const join = async () => {
    const conn = await transport.join(code, 3000);
    return { conn, tap: tap(conn) };
  };
  return { code, transport, ep, hostSide, hostConns, join };
}

beforeEach(() => {
  channels = [];
  vi.stubGlobal(
    'BroadcastChannel',
    class extends RealChannel {
      constructor(name: string) {
        super(name);
        channels.push(this);
      }
    },
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  for (const c of channels) c.close();
});

describe('local: Nachrichten', () => {
  it('trennt Nachrichten in beide Richtungen nach cid', async () => {
    const r = await room();
    const a = await r.join();
    const b = await r.join();
    expect(r.hostSide).toHaveLength(2);

    r.hostConns[0]!.send('an-A');
    r.hostConns[1]!.send('an-B');
    await a.tap.until(() => a.tap.msgs.length >= 1);
    await b.tap.until(() => b.tap.msgs.length >= 1);
    expect(a.tap.msgs[0]).toBe('an-A');
    expect(b.tap.msgs[0]).toBe('an-B');

    a.conn.send('von-A');
    b.conn.send('von-B');
    await r.hostSide[0]!.until(() => r.hostSide[0]!.msgs.length >= 1);
    await r.hostSide[1]!.until(() => r.hostSide[1]!.msgs.length >= 1);
    expect(r.hostSide[0]!.msgs[0]).toBe('von-A');
    expect(r.hostSide[1]!.msgs[0]).toBe('von-B');
  });

  it('Client-close löst onClose der Host-Conn aus, die andere bleibt offen', async () => {
    const r = await room();
    const a = await r.join();
    const b = await r.join();
    a.conn.close();
    await r.hostSide[0]!.until(() => r.hostSide[0]!.closes >= 1);
    expect(r.hostSide[0]!.closes).toBe(1);
    expect(a.tap.closes).toBe(1);
    expect(r.hostSide[1]!.closes).toBe(0);

    r.hostConns[1]!.send('noch da');
    await b.tap.until(() => b.tap.msgs.length >= 1);
    expect(b.tap.msgs).toEqual(['noch da']);
  });

  it('Endpoint-close() löst onClose bei allen Clients aus', async () => {
    const r = await room();
    const a = await r.join();
    const b = await r.join();
    r.ep.close();
    await a.tap.until(() => a.tap.closes >= 1);
    await b.tap.until(() => b.tap.closes >= 1);
    expect(a.tap.closes).toBe(1);
    expect(b.tap.closes).toBe(1);
    expect(r.hostSide.map((h) => h.closes)).toEqual([1, 1]);
  });

  it('send(x); close() stellt x vor dem onClose zu (Host -> Client)', async () => {
    const r = await room();
    const a = await r.join();
    r.hostConns[0]!.send('x');
    r.hostConns[0]!.close();
    await a.tap.until(() => a.tap.closes >= 1);
    expect(a.tap.events).toEqual(['msg:x', 'close']);
  });

  it('send(x); close() stellt x vor dem onClose zu (Client -> Host)', async () => {
    const r = await room();
    const a = await r.join();
    a.conn.send('x');
    a.conn.close();
    await r.hostSide[0]!.until(() => r.hostSide[0]!.closes >= 1);
    expect(r.hostSide[0]!.events).toEqual(['msg:x', 'close']);
  });

  it('send nach close ist ein No-op, doppeltes close meldet einmal', async () => {
    const r = await room();
    const a = await r.join();
    a.conn.close();
    a.conn.close();
    expect(() => a.conn.send('spät')).not.toThrow();
    await r.hostSide[0]!.until(() => r.hostSide[0]!.closes >= 1);
    expect(r.hostSide[0]!.msgs).toEqual([]);
    expect(a.tap.closes).toBe(1);
  });

  it('doppeltes syn mit gleicher cid antwortet erneut, erzeugt aber keine zweite Conn', async () => {
    const code = nextCode();
    const ep = await createLocalTransport().host(code);
    let conns = 0;
    ep.onConnection(() => conns++);
    const raw = new BroadcastChannel(`wgarcade-${code}`);
    let acks = 0;
    const second = new Promise<void>((resolve) => {
      raw.onmessage = (e: MessageEvent) => {
        if (e.data?.k === 'ack' && e.data.cid === 'dup' && ++acks === 2) resolve();
      };
    });
    raw.postMessage({ k: 'syn', cid: 'dup' });
    raw.postMessage({ k: 'syn', cid: 'dup' });
    await second;
    expect(conns).toBe(1);
  });

  it('pagehide des Hosts sendet fin an alle Clients und wird bei close abgemeldet', async () => {
    const add = vi.fn();
    const remove = vi.fn();
    vi.stubGlobal('addEventListener', add);
    vi.stubGlobal('removeEventListener', remove);
    const r = await room();
    const a = await r.join();
    expect(add).toHaveBeenCalledWith('pagehide', expect.any(Function));
    const handler = add.mock.calls.find((c) => c[0] === 'pagehide')![1] as () => void;
    handler();
    await a.tap.until(() => a.tap.closes >= 1);
    r.ep.close();
    expect(remove).toHaveBeenCalledWith('pagehide', handler);
  });

  it('läuft auch ohne globales addEventListener', async () => {
    vi.stubGlobal('addEventListener', undefined);
    const r = await room();
    r.ep.close();
  });
});

describe('local: Join', () => {
  it("unbekannter Code ergibt Error('noroom') und schließt den Client-Channel", async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const p = createLocalTransport().join('ZZZZ', 3000);
    const rejected = expect(p).rejects.toMatchObject({ message: 'noroom' });
    vi.advanceTimersByTime(3000);
    await rejected;
    expect(channels).toHaveLength(1);
    expect(() => channels[0]!.postMessage('x')).toThrow();
  });

  it('nach erfolgreichem Join richtet der abgelaufene Timeout nichts an', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const r = await room();
    const a = await r.join();
    vi.advanceTimersByTime(60_000);
    expect(a.tap.closes).toBe(0);
    a.conn.send('lebt');
    r.hostConns[0]!.send('auch');
    await r.hostSide[0]!.until(() => r.hostSide[0]!.msgs.length >= 1);
    await a.tap.until(() => a.tap.msgs.length >= 1);
    expect(r.hostSide[0]!.msgs).toEqual(['lebt']);
    expect(a.tap.msgs).toEqual(['auch']);
    expect(a.tap.closes).toBe(0);
  });
});
