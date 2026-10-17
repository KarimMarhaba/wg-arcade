import { describe, expect, it } from 'vitest';
import { createSfx, MUTE_KEY } from './sfx';
import type { SfxKind } from '../games/types';

const KINDS: SfxKind[] = ['tap', 'go', 'ok', 'bad', 'tick', 'win', 'join', 'start', 'whoosh'];

function fakeAudio(state = 'running') {
  const log = { contexts: 0, osc: 0, resumes: 0 };
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
  class Ctx {
    state = state;
    currentTime = 0;
    destination = {};
    constructor() {
      log.contexts++;
    }
    createOscillator() {
      log.osc++;
      return { type: 'square', frequency: param(), connect() {}, start() {}, stop() {} };
    }
    createGain() {
      return { gain: param(), connect() {} };
    }
    resume() {
      log.resumes++;
      return Promise.resolve();
    }
  }
  return { audio: Ctx as unknown as typeof AudioContext, log };
}

function fakeStorage(init: Record<string, string> = {}) {
  const data = new Map(Object.entries(init));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

describe('sfx', () => {
  it('ohne AudioContext ist alles ein No-op', () => {
    const sfx = createSfx({ audio: undefined, storage: fakeStorage() });
    expect(() => {
      sfx.unlock();
      for (const k of KINDS) sfx.play(k);
      sfx.setMuted(true);
    }).not.toThrow();
    expect(sfx.muted()).toBe(true);
  });

  it('erzeugt den Context erst bei unlock, und nur einmal', () => {
    const { audio, log } = fakeAudio();
    const sfx = createSfx({ audio, storage: fakeStorage() });
    sfx.play('tap');
    expect(log.contexts).toBe(0);
    expect(log.osc).toBe(0);
    sfx.unlock();
    sfx.unlock();
    expect(log.contexts).toBe(1);
  });

  it('weckt einen angehaltenen Context auf', () => {
    const { audio, log } = fakeAudio('suspended');
    const sfx = createSfx({ audio, storage: fakeStorage() });
    sfx.unlock();
    expect(log.resumes).toBe(1);
    sfx.unlock();
    expect(log.resumes).toBe(2);
  });

  it('spielt jede Art nach unlock', () => {
    const { audio, log } = fakeAudio();
    const sfx = createSfx({ audio, storage: fakeStorage() });
    sfx.unlock();
    for (const k of KINDS) {
      const before = log.osc;
      sfx.play(k);
      expect(log.osc, k).toBeGreaterThan(before);
    }
  });

  it('stumm erzeugt keinen Ton, entstummt wieder', () => {
    const { audio, log } = fakeAudio();
    const sfx = createSfx({ audio, storage: fakeStorage() });
    sfx.unlock();
    sfx.setMuted(true);
    sfx.play('win');
    expect(log.osc).toBe(0);
    sfx.setMuted(false);
    sfx.play('win');
    expect(log.osc).toBeGreaterThan(0);
  });

  it('speichert Mute unter wgarcade.mute und liest ihn beim Start', () => {
    const storage = fakeStorage();
    const a = createSfx({ audio: undefined, storage });
    expect(MUTE_KEY).toBe('wgarcade.mute');
    expect(a.muted()).toBe(false);
    a.setMuted(true);
    expect(storage.data.get('wgarcade.mute')).toBe('1');
    expect(createSfx({ audio: undefined, storage }).muted()).toBe(true);
    a.setMuted(false);
    expect(storage.data.get('wgarcade.mute')).toBe('0');
    expect(createSfx({ audio: undefined, storage }).muted()).toBe(false);
  });

  it('wirft nicht bei gesperrtem Speicher oder kaputtem Context', () => {
    const storage = {
      getItem: () => {
        throw new Error('gesperrt');
      },
      setItem: () => {
        throw new Error('gesperrt');
      },
    };
    class Broken {
      constructor() {
        throw new Error('kein Audio');
      }
    }
    const sfx = createSfx({ audio: Broken as unknown as typeof AudioContext, storage });
    expect(() => {
      sfx.unlock();
      sfx.play('ok');
      sfx.setMuted(true);
    }).not.toThrow();
    expect(sfx.muted()).toBe(true);
  });

  it('createSfx() ohne Argumente läuft auch ohne Browser', () => {
    const sfx = createSfx();
    expect(() => {
      sfx.unlock();
      sfx.play('tap');
    }).not.toThrow();
  });
});
