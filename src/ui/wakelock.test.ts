import { describe, expect, it } from 'vitest';
import { createWakeLock } from './wakelock';

const flush = async (): Promise<void> => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};

class FakeDoc extends EventTarget {
  visibilityState = 'visible';
  listeners = 0;
  override addEventListener(t: string, fn: EventListenerOrEventListenerObject | null, o?: boolean | AddEventListenerOptions): void {
    this.listeners++;
    super.addEventListener(t, fn, o);
  }
  override removeEventListener(t: string, fn: EventListenerOrEventListenerObject | null, o?: boolean | EventListenerOptions): void {
    this.listeners--;
    super.removeEventListener(t, fn, o);
  }
  show(state: 'visible' | 'hidden'): void {
    this.visibilityState = state;
    this.dispatchEvent(new Event('visibilitychange'));
  }
}

function fakeApi(mode: 'ok' | 'reject' | 'throw' = 'ok') {
  const sentinels: { released: boolean; release(): Promise<void> }[] = [];
  const api = {
    requests: 0,
    request(type: 'screen') {
      expect(type).toBe('screen');
      api.requests++;
      if (mode === 'throw') throw new Error('sync');
      if (mode === 'reject') return Promise.reject(new Error('NotAllowedError'));
      const s = {
        released: false,
        release() {
          s.released = true;
          return Promise.resolve();
        },
      };
      sentinels.push(s);
      return Promise.resolve(s);
    },
  };
  return { api, sentinels };
}

describe('wakelock', () => {
  it('schluckt eine fehlende API', async () => {
    const doc = new FakeDoc();
    const wl = createWakeLock({ api: undefined, doc });
    expect(() => wl.acquire()).not.toThrow();
    await flush();
    expect(() => wl.release()).not.toThrow();
    expect(doc.listeners).toBe(0);
  });

  it('schluckt Ablehnung und synchrone Fehler', async () => {
    for (const mode of ['reject', 'throw'] as const) {
      const doc = new FakeDoc();
      const { api } = fakeApi(mode);
      const wl = createWakeLock({ api, doc });
      expect(() => wl.acquire()).not.toThrow();
      await flush();
      expect(api.requests).toBe(1);
      wl.release();
      await flush();
    }
  });

  it('fordert genau einmal an und hört genau einmal zu', async () => {
    const doc = new FakeDoc();
    const { api } = fakeApi();
    const wl = createWakeLock({ api, doc });
    wl.acquire();
    wl.acquire();
    await flush();
    expect(api.requests).toBe(1);
    expect(doc.listeners).toBe(1);
  });

  it('holt ihn bei visible neu, nicht bei hidden und nicht bei noch gehaltenem Lock', async () => {
    const doc = new FakeDoc();
    const { api, sentinels } = fakeApi();
    createWakeLock({ api, doc }).acquire();
    await flush();
    doc.show('hidden');
    await flush();
    expect(api.requests).toBe(1);
    doc.show('visible');
    await flush();
    expect(api.requests).toBe(1);
    (sentinels[0] as { released: boolean }).released = true;
    doc.show('hidden');
    doc.show('visible');
    await flush();
    expect(api.requests).toBe(2);
  });

  it('versucht es nach einer Ablehnung bei visible erneut', async () => {
    const doc = new FakeDoc();
    const { api } = fakeApi('reject');
    createWakeLock({ api, doc }).acquire();
    await flush();
    doc.show('visible');
    await flush();
    expect(api.requests).toBe(2);
  });

  it('release gibt frei, meldet den Listener ab und stoppt weitere Anforderungen', async () => {
    const doc = new FakeDoc();
    const { api, sentinels } = fakeApi();
    const wl = createWakeLock({ api, doc });
    wl.acquire();
    await flush();
    wl.release();
    await flush();
    expect(sentinels[0]?.released).toBe(true);
    expect(doc.listeners).toBe(0);
    doc.show('visible');
    await flush();
    expect(api.requests).toBe(1);
    expect(() => wl.release()).not.toThrow();
  });

  it('release vor der Antwort gibt den spät eintreffenden Lock sofort frei', async () => {
    const doc = new FakeDoc();
    const { api, sentinels } = fakeApi();
    const wl = createWakeLock({ api, doc });
    wl.acquire();
    wl.release();
    await flush();
    expect(sentinels[0]?.released).toBe(true);
    expect(doc.listeners).toBe(0);
  });

  it('release ohne acquire wirft nicht', () => {
    expect(() => createWakeLock({ api: undefined, doc: new FakeDoc() }).release()).not.toThrow();
  });

  it('createWakeLock() ohne Argumente läuft auch in Node', async () => {
    const wl = createWakeLock();
    expect(() => wl.acquire()).not.toThrow();
    await flush();
    expect(() => wl.release()).not.toThrow();
  });
});
