import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ loaded: 0, marker: { host: () => {}, join: () => {} } }));
vi.mock('./peer', () => {
  state.loaded++;
  return { createPeerTransport: () => state.marker };
});

import { createTransport } from './transport';

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
