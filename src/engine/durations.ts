export const INTRO = 3000;
export const RESULT = 5000;
export const DRINK_EXTRA = 2000;
export const BLITZ_WAIT_MIN = 1500;
export const BLITZ_WAIT_MAX = 4000;
export const BLITZ_SHOW = 900;
export const HAMMER = 8000;
export const FARBFALLE = 20000;
export const SF_ASK = 20000;
export const SF_REVEAL = 5000;
export const GK_ASK = 7000;
export const GK_REVEAL = 3000;
export const WW_VOTE = 10000;
export const WW_REVEAL = 4000;

export const BLITZ_MAX = 1000;
export const GRACE = 1500;
export const PING = 2000;
export const OFFLINE = 6000;
export const TICK = 100;

export const scale = (ms: number, speed: number): number => Math.round(ms / speed);
