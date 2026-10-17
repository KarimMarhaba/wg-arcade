import { blindmaler } from './blindmaler/logic';
import { blitz } from './blitz/logic';
import { bombe } from './bombe/logic';
import { erklaerbaer } from './erklaerbaer/logic';
import { farbfalle } from './farbfalle/logic';
import { gleichklang } from './gleichklang/logic';
import { hammer } from './hammer/logic';
import { luegenbaron } from './luegenbaron/logic';
import { pokerface } from './pokerface/logic';
import { schaetzfuchs } from './schaetzfuchs/logic';
import { stopp } from './stopp/logic';
import type { GameDef, GameId } from './types';
import { verraeter } from './verraeter/logic';
import { werwuerde } from './werwuerde/logic';

export { GAME_IDS } from './types';

export const GAMES: Record<GameId, GameDef<any, any, any>> = {
  blitz,
  hammer,
  farbfalle,
  schaetzfuchs,
  gleichklang,
  werwuerde,
  bombe,
  stopp,
  luegenbaron,
  verraeter,
  pokerface,
  erklaerbaer,
  blindmaler,
};

export function gamesFor(only?: GameId): Record<string, GameDef<any, any, any>> {
  return only ? { [only]: GAMES[only] } : GAMES;
}
