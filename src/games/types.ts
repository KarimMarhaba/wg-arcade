export const GAME_IDS = ['blitz', 'hammer', 'farbfalle', 'schaetzfuchs'] as const;
export type GameId = (typeof GAME_IDS)[number];
