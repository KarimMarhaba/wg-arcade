import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ loaded: 0, marker: { host: () => {}, join: () => {} } }));
vi.mock('./peer', () => {
  state.loaded++;
  return { createPeerTransport: () => state.marker };
});

import { createTransport, lazyTransport, type NetKind, type Transport } from './transport';

describe('createTransport', () => {
  it("'local' lädt ./peer nie", async () => {
    const t = await createTransport('local');
    expect(typeof t.host).toBe('function');
    expect(typeof t.join).toBe('function');
    expect(state.loaded).toBe(0);
  });

  it("'peer' lädt ./peer per dynamischem Import", async () => {
    const t = await createTransport('peer');
    expect(state.loaded).toBe(1);
    expect(t).toBe(state.marker);
  });

  it('transport.ts importiert weder ./peer noch peerjs statisch', () => {
    const src = readFileSync(new URL('./transport.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/^\s*import\s[^;]*?from\s*['"](\.\/peer|peerjs)['"]/m);
    expect(src).not.toMatch(/^\s*import\s*['"](\.\/peer|peerjs)['"]/m);
    expect(src).toMatch(/import\(\s*['"]\.\/peer['"]\s*\)/);
  });
});

describe('lazyTransport', () => {
  const fake = (): Transport => ({ host: () => Promise.reject(new Error('x')), join: () => Promise.reject(new Error('x')) });

  it('baut einmal und gibt danach dieselbe Instanz zurück', async () => {
    const t = fake();
    const make = vi.fn(() => Promise.resolve(t));
    const get = lazyTransport('local', make);
    expect(make).not.toHaveBeenCalled();
    const [a, b] = await Promise.all([get(), get()]);
    expect(a).toBe(t);
    expect(b).toBe(t);
    expect(await get()).toBe(t);
    expect(make).toHaveBeenCalledTimes(1);
    expect(make).toHaveBeenCalledWith('local');
  });

  it('cacht einen fehlgeschlagenen Aufbau nicht: der nächste Aufruf baut neu', async () => {
    const t = fake();
    const make = vi.fn<(k: NetKind) => Promise<Transport>>().mockRejectedValueOnce(new Error('broker')).mockResolvedValue(t);
    const get = lazyTransport('peer', make);
    await expect(get()).rejects.toThrow('broker');
    expect(await get()).toBe(t);
    expect(await get()).toBe(t);
    expect(make).toHaveBeenCalledTimes(2);
  });

  it('gleichzeitige Aufrufe teilen sich den fehlgeschlagenen Aufbau, danach wird neu gebaut', async () => {
    const t = fake();
    const make = vi.fn<(k: NetKind) => Promise<Transport>>().mockRejectedValueOnce(new Error('broker')).mockResolvedValue(t);
    const get = lazyTransport('peer', make);
    const results = await Promise.allSettled([get(), get()]);
    expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected']);
    expect(make).toHaveBeenCalledTimes(1);
    expect(await get()).toBe(t);
    expect(make).toHaveBeenCalledTimes(2);
  });
});
