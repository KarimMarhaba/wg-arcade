import { blitz } from './blitz/logic';
import { farbfalle } from './farbfalle/logic';
import { hammer } from './hammer/logic';
import { schaetzfuchs } from './schaetzfuchs/logic';
import type { GameDef, GameId } from './types';

export { GAME_IDS } from './types';

export const GAMES: Record<GameId, GameDef<any, any, any>> = { blitz, hammer, farbfalle, schaetzfuchs };
