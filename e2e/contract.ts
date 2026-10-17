export type Id = 'blitz' | 'hammer' | 'farbfalle' | 'schaetzfuchs' | 'gleichklang' | 'werwuerde';

export const LEGACY = ['blitz', 'hammer', 'farbfalle', 'schaetzfuchs'] as const;
export type LegacyId = (typeof LEGACY)[number];

export const LABEL: Record<Id, RegExp> = {
  blitz: /^\d+ ms$/,
  hammer: /^\d+ Taps?$/,
  farbfalle: /^[+−]?\d+$/,
  schaetzfuchs: /^±\d+ %$/,
  gleichklang: /^\d+ Treffer$/,
  werwuerde: /^\d+ Pkt$/,
};

export const CONTRACT: Record<Id, string[]> = {
  blitz: ['done', 'early', 'go', 'show', 'wait'],
  hammer: ['done', 'play'],
  farbfalle: ['done', 'play'],
  schaetzfuchs: ['ask', 'reveal', 'sent'],
  gleichklang: ['ask', 'reveal', 'sent'],
  werwuerde: ['reveal', 'sent', 'vote'],
};

export const ACCENT: Record<Id, 'lime' | 'hot' | 'cyan' | 'orange'> = {
  blitz: 'lime',
  hammer: 'hot',
  farbfalle: 'cyan',
  schaetzfuchs: 'orange',
  gleichklang: 'cyan',
  werwuerde: 'hot',
};
