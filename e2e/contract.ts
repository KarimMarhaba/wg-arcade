export type Id =
  | 'blitz'
  | 'hammer'
  | 'farbfalle'
  | 'schaetzfuchs'
  | 'gleichklang'
  | 'werwuerde'
  | 'bombe'
  | 'stopp'
  | 'luegenbaron'
  | 'verraeter'
  | 'pokerface'
  | 'erklaerbaer';

export const LEGACY = ['blitz', 'hammer', 'farbfalle', 'schaetzfuchs'] as const;
export type LegacyId = (typeof LEGACY)[number];

export const LABEL: Record<Id, RegExp> = {
  blitz: /^\d+ ms$/,
  hammer: /^\d+ Taps?$/,
  farbfalle: /^[+−]?\d+$/,
  schaetzfuchs: /^±\d+ %$/,
  gleichklang: /^\d+ Treffer$/,
  werwuerde: /^\d+ Pkt$/,
  bombe: /^\d+ Pkt$/,
  stopp: /^± \d+,\d{2} s$/,
  luegenbaron: /^\d+ Pkt$/,
  verraeter: /^\d+ Pkt$/,
  pokerface: /^\d+ Pkt$/,
  erklaerbaer: /^−?\d+ Pkt$/,
};

export const CONTRACT: Record<Id, string[]> = {
  blitz: ['done', 'early', 'go', 'show', 'wait'],
  hammer: ['done', 'play'],
  farbfalle: ['done', 'play'],
  schaetzfuchs: ['ask', 'reveal', 'sent'],
  gleichklang: ['ask', 'reveal', 'sent'],
  werwuerde: ['reveal', 'sent', 'vote'],
  bombe: ['cashed', 'popped', 'pump'],
  stopp: ['blind', 'ready', 'reveal', 'run', 'sent'],
  luegenbaron: ['card', 'reveal', 'sent', 'tell', 'vote'],
  verraeter: ['reveal', 'round', 'sent', 'vote', 'word'],
  pokerface: ['guess', 'mission', 'reveal', 'sent', 'talk'],
  erklaerbaer: ['explain', 'reveal'],
};

export const ACCENT: Record<Id, 'lime' | 'hot' | 'cyan' | 'orange'> = {
  blitz: 'lime',
  hammer: 'hot',
  farbfalle: 'cyan',
  schaetzfuchs: 'orange',
  gleichklang: 'cyan',
  werwuerde: 'hot',
  bombe: 'orange',
  stopp: 'lime',
  luegenbaron: 'hot',
  verraeter: 'cyan',
  pokerface: 'lime',
  erklaerbaer: 'orange',
};
