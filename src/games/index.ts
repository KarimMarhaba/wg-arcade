import { blitz } from './blitz/logic';
import { farbfalle } from './farbfalle/logic';
import { gleichklang } from './gleichklang/logic';
import { hammer } from './hammer/logic';
import { schaetzfuchs } from './schaetzfuchs/logic';
import type { GameDef, GameId } from './types';
import { werwuerde } from './werwuerde/logic';

export { GAME_IDS } from './types';

export const GAMES: Record<GameId, GameDef<any, any, any>> = {
  blitz,
  hammer,
  farbfalle,
  schaetzfuchs,
  gleichklang,
  werwuerde,
};

export function gamesFor(only?: GameId): Record<string, GameDef<any, any, any>> {
  return only ? { [only]: GAMES[only] } : GAMES;
}
