import { renderBlitz } from './blitz/view';
import { renderFarbfalle } from './farbfalle/view';
import { renderHammer } from './hammer/view';
import { renderSchaetzfuchs } from './schaetzfuchs/view';
import type { GameId, Mounted, Render } from './types';

export const VIEWS: Partial<Record<GameId, Render<any, any>>> = {
  blitz: renderBlitz,
  hammer: renderHammer,
  farbfalle: renderFarbfalle,
  schaetzfuchs: renderSchaetzfuchs,
};

export const fallbackRender: Render<unknown, unknown> = (root) => {
  const note = document.createElement('p');
  note.textContent = 'läuft …';
  root.append(note);
  return {
    update() {},
    destroy: () => note.remove(),
  } satisfies Mounted<unknown>;
};

export const renderFor = (id: GameId): Render<any, any> => VIEWS[id] ?? fallbackRender;
