import { renderBlindmaler } from './blindmaler/view';
import { renderBlitz } from './blitz/view';
import { renderBombe } from './bombe/view';
import { renderErklaerbaer } from './erklaerbaer/view';
import { renderFarbfalle } from './farbfalle/view';
import { renderGleichklang } from './gleichklang/view';
import { renderHammer } from './hammer/view';
import { renderLuegenbaron } from './luegenbaron/view';
import { renderPokerface } from './pokerface/view';
import { renderSchaetzfuchs } from './schaetzfuchs/view';
import { renderStopp } from './stopp/view';
import type { GameId, Mounted, Render } from './types';
import { renderVerraeter } from './verraeter/view';
import { renderWerwuerde } from './werwuerde/view';

export const VIEWS: Partial<Record<GameId, Render<any, any>>> = {
  blitz: renderBlitz,
  hammer: renderHammer,
  farbfalle: renderFarbfalle,
  schaetzfuchs: renderSchaetzfuchs,
  gleichklang: renderGleichklang,
  werwuerde: renderWerwuerde,
  bombe: renderBombe,
  stopp: renderStopp,
  luegenbaron: renderLuegenbaron,
  verraeter: renderVerraeter,
  pokerface: renderPokerface,
  erklaerbaer: renderErklaerbaer,
  blindmaler: renderBlindmaler,
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
