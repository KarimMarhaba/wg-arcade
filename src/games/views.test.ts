import { describe, expect, it } from 'vitest';
import { GAME_IDS, type GameId } from './types';
import { fallbackRender, renderFor, VIEWS } from './views';

describe('VIEWS', () => {
  it('deckt alle vier Spiele ab', () => {
    expect(Object.keys(VIEWS).sort()).toEqual([...GAME_IDS].sort());
    for (const id of GAME_IDS) {
      expect(typeof VIEWS[id]).toBe('function');
      expect(renderFor(id)).toBe(VIEWS[id]);
      expect(renderFor(id)).not.toBe(fallbackRender);
    }
  });

  it('der Fallback bleibt für unbekannte IDs', () => {
    expect(renderFor('unbekannt' as GameId)).toBe(fallbackRender);
  });
});
