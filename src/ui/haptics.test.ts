import { describe, expect, it } from 'vitest';
import { createBuzz } from './haptics';

describe('haptics', () => {
  it('vibriert mit dem Muster, wenn die API da ist und nicht stumm', () => {
    const calls: unknown[] = [];
    const buzz = createBuzz({
      vibrate: (p) => {
        calls.push(p);
        return true;
      },
      muted: () => false,
    });
    buzz(10);
    buzz([30, 40, 30]);
    expect(calls).toEqual([10, [30, 40, 30]]);
  });

  it('folgt dem Mute zum Aufrufzeitpunkt', () => {
    let muted = true;
    const calls: unknown[] = [];
    const buzz = createBuzz({
      vibrate: (p) => {
        calls.push(p);
        return true;
      },
      muted: () => muted,
    });
    buzz(10);
    expect(calls).toEqual([]);
    muted = false;
    buzz(10);
    expect(calls).toEqual([10]);
  });

  it('ohne navigator.vibrate ein No-op', () => {
    const buzz = createBuzz({ vibrate: undefined, muted: () => false });
    expect(() => buzz(10)).not.toThrow();
  });

  it('schluckt Fehler der API', () => {
    const buzz = createBuzz({
      vibrate: () => {
        throw new Error('blockiert');
      },
      muted: () => false,
    });
    expect(() => buzz([10, 20])).not.toThrow();
  });

  it('createBuzz() ohne Argumente läuft auch in Node', () => {
    expect(() => createBuzz()(10)).not.toThrow();
  });
});
