import { afterEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  type Fn = (...a: unknown[]) => void;
  class Ev {
    handlers: Record<string, Fn[]> = {};
    on(e: string, fn: Fn): this {
      (this.handlers[e] ??= []).push(fn);
      return this;
    }
    emit(e: string, ...a: unknown[]): void {
      for (const fn of [...(this.handlers[e] ?? [])]) fn(...a);
    }
  }
  class FakeDC extends Ev {
    open = false;
    sent: unknown[] = [];
    closeCalls: unknown[][] = [];
    send(d: unknown): void {
      this.sent.push(d);
    }
    close(...a: unknown[]): void {
      this.closeCalls.push(a);
    }
    opened(): void {
      this.open = true;
      this.emit('open');
    }
  }
  class FakePeer extends Ev {
    static all: FakePeer[] = [];
    args: unknown[];
    destroyed = false;
    reconnects = 0;
    conns: { id: string; opts: unknown; dc: FakeDC }[] = [];
    constructor(...args: unknown[]) {
      super();
      this.args = args;
      FakePeer.all.push(this);
    }
    destroy(): void {
      this.destroyed = true;
    }
    reconnect(): void {
      this.reconnects++;
    }
    connect(id: string, opts: unknown): FakeDC {
      const dc = new FakeDC();
      this.conns.push({ id, opts, dc });
      return dc;
    }
  }
  return { FakePeer, FakeDC };
});
vi.mock('peerjs', () => ({ Peer: h.FakePeer }));

import { createPeerTransport } from './peer';

const last = () => h.FakePeer.all[h.FakePeer.all.length - 1]!;

afterEach(() => {
  vi.useRealTimers();
  h.FakePeer.all.length = 0;
});

describe('peer: host', () => {
  it('registriert wgarcade-<CODE> mit STUN und löst bei open auf', async () => {
    const p = createPeerTransport().host('ABCD');
    const peer = last();
    expect(peer.args[0]).toBe('wgarcade-ABCD');
    expect(JSON.stringify(peer.args[1])).toContain('stun:stun.l.google.com:19302');
    peer.emit('open', 'wgarcade-ABCD');
    const ep = await p;
    expect(ep.code).toBe('ABCD');
    ep.close();
    expect(peer.destroyed).toBe(true);
  });

  it("unavailable-id ergibt Error('taken') und destroy()", async () => {
    const p = createPeerTransport().host('ABCD');
    last().emit('error', { type: 'unavailable-id' });
    await expect(p).rejects.toMatchObject({ message: 'taken' });
    expect(last().destroyed).toBe(true);
  });

  it('anderer Fehler vor open ergibt Error mit dem PeerJS-Typ und destroy()', async () => {
    const p = createPeerTransport().host('ABCD');
    last().emit('error', { type: 'network' });
    await expect(p).rejects.toMatchObject({ message: 'network' });
    expect(last().destroyed).toBe(true);
  });

  it("nach 10 s ergibt Error('timeout') und destroy()", async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const p = createPeerTransport().host('ABCD');
    const rejected = expect(p).rejects.toMatchObject({ message: 'timeout' });
    vi.advanceTimersByTime(9_999);
    expect(last().destroyed).toBe(false);
    vi.advanceTimersByTime(1);
    await rejected;
    expect(last().destroyed).toBe(true);
  });

  it('nach open richtet der Timeout nichts mehr an', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const p = createPeerTransport().host('ABCD');
    last().emit('open', 'x');
    await p;
    vi.advanceTimersByTime(60_000);
    expect(last().destroyed).toBe(false);
  });

  it('disconnected löst reconnect() aus, außer der Peer ist zerstört', async () => {
    const p = createPeerTransport().host('ABCD');
    const peer = last();
    peer.emit('open', 'x');
    await p;
    peer.emit('disconnected');
    expect(peer.reconnects).toBe(1);
    peer.destroyed = true;
    peer.emit('disconnected');
    expect(peer.reconnects).toBe(1);
  });

  it('meldet eine Conn erst beim open der DataConnection, verwirft Nicht-Strings', async () => {
    const p = createPeerTransport().host('ABCD');
    const peer = last();
    peer.emit('open', 'x');
    const ep = await p;
    const got: unknown[] = [];
    let closes = 0;
    let seen = 0;
    ep.onConnection((c) => {
      seen++;
      c.onMessage((m) => got.push(m));
      c.onClose(() => closes++);
    });
    const dc = new h.FakeDC();
    peer.emit('connection', dc);
    expect(seen).toBe(0);
    dc.opened();
    expect(seen).toBe(1);

    dc.emit('data', 'hallo');
    dc.emit('data', 42);
    dc.emit('data', new Uint8Array([1]));
    dc.emit('data', { a: 1 });
    dc.emit('data', 'zwei');
    expect(got).toEqual(['hallo', 'zwei']);

    dc.emit('close');
    dc.emit('close');
    expect(closes).toBe(1);
  });

  it('Conn.send geht auf den Kanal, close nutzt flush, danach ist send ein No-op', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const p = createPeerTransport().host('ABCD');
    const peer = last();
    peer.emit('open', 'x');
    const ep = await p;
    let conn!: Parameters<Parameters<typeof ep.onConnection>[0]>[0];
    let closes = 0;
    ep.onConnection((c) => {
      conn = c;
      c.onClose(() => closes++);
    });
    const dc = new h.FakeDC();
    peer.emit('connection', dc);
    dc.opened();

    conn.send('a');
    expect(dc.sent).toEqual(['a']);

    conn.close();
    expect(dc.closeCalls[0]).toEqual([{ flush: true }]);
    expect(closes).toBe(1);
    conn.send('b');
    expect(dc.sent).toEqual(['a']);

    vi.advanceTimersByTime(1000);
    expect(dc.closeCalls[1]).toEqual([]);
    dc.emit('close');
    expect(closes).toBe(1);
  });

  it('send auf einen nicht offenen Kanal wird verworfen', async () => {
    const p = createPeerTransport().host('ABCD');
    const peer = last();
    peer.emit('open', 'x');
    const ep = await p;
    let conn!: Parameters<Parameters<typeof ep.onConnection>[0]>[0];
    ep.onConnection((c) => (conn = c));
    const dc = new h.FakeDC();
    peer.emit('connection', dc);
    dc.opened();
    dc.open = false;
    conn.send('a');
    expect(dc.sent).toEqual([]);
  });
});

describe('peer: join', () => {
  it('wartet auf Peer-open, verbindet reliable und löst beim open des Kanals auf', async () => {
    const p = createPeerTransport().join('ABCD');
    const peer = last();
    expect(typeof peer.args[0]).toBe('object');
    expect(JSON.stringify(peer.args[0])).toContain('stun:');
    expect(peer.conns).toHaveLength(0);
    peer.emit('open', 'me');
    expect(peer.conns).toHaveLength(1);
    expect(peer.conns[0]!.id).toBe('wgarcade-ABCD');
    expect(peer.conns[0]!.opts).toEqual({ reliable: true });
    peer.conns[0]!.dc.opened();
    const conn = await p;

    const got: unknown[] = [];
    conn.onMessage((m) => got.push(m));
    peer.conns[0]!.dc.emit('data', 7);
    peer.conns[0]!.dc.emit('data', 'ok');
    expect(got).toEqual(['ok']);
  });

  it("peer-unavailable ergibt Error('noroom') und destroy()", async () => {
    const p = createPeerTransport().join('ABCD');
    last().emit('error', { type: 'peer-unavailable' });
    await expect(p).rejects.toMatchObject({ message: 'noroom' });
    expect(last().destroyed).toBe(true);
  });

  it("nach 10 s ergibt Error('timeout') und destroy()", async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const p = createPeerTransport().join('ABCD');
    last().emit('open', 'me');
    const rejected = expect(p).rejects.toMatchObject({ message: 'timeout' });
    vi.advanceTimersByTime(10_000);
    await rejected;
    expect(last().destroyed).toBe(true);
  });

  it('close nutzt flush und zerstört den Peer nach dem Abbau', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const p = createPeerTransport().join('ABCD');
    const peer = last();
    peer.emit('open', 'me');
    const dc = peer.conns[0]!.dc;
    dc.opened();
    const conn = await p;
    let closes = 0;
    conn.onClose(() => closes++);
    vi.advanceTimersByTime(60_000);
    expect(peer.destroyed).toBe(false);

    conn.close();
    expect(dc.closeCalls[0]).toEqual([{ flush: true }]);
    expect(closes).toBe(1);
    vi.advanceTimersByTime(1000);
    expect(peer.destroyed).toBe(true);
  });

  it('close vom Host zerstört den Client-Peer sofort', async () => {
    const p = createPeerTransport().join('ABCD');
    const peer = last();
    peer.emit('open', 'me');
    const dc = peer.conns[0]!.dc;
    dc.opened();
    const conn = await p;
    let closes = 0;
    conn.onClose(() => closes++);
    dc.emit('close');
    expect(closes).toBe(1);
    expect(peer.destroyed).toBe(true);
  });
});
