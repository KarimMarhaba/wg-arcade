export type Id = 'blitz' | 'hammer' | 'farbfalle' | 'schaetzfuchs';

export const LABEL: Record<Id, RegExp> = {
  blitz: /^\d+ ms$/,
  hammer: /^\d+ Taps?$/,
  farbfalle: /^[+−]?\d+$/,
  schaetzfuchs: /^±\d+ %$/,
};

export const CONTRACT: Record<Id, string[]> = {
  blitz: ['done', 'early', 'go', 'show', 'wait'],
  hammer: ['done', 'play'],
  farbfalle: ['done', 'play'],
  schaetzfuchs: ['ask', 'reveal', 'sent'],
};

export const ACCENT: Record<Id, 'lime' | 'hot' | 'cyan' | 'orange'> = {
  blitz: 'lime',
  hammer: 'hot',
  farbfalle: 'cyan',
  schaetzfuchs: 'orange',
};
