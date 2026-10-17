export type Pattern = number | number[];

export interface BuzzDeps {
  vibrate?: (p: Pattern) => boolean | void;
  muted: () => boolean;
}

export function browserVibrate(): BuzzDeps['vibrate'] {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
    ? (p) => navigator.vibrate(p)
    : undefined;
}

export function createBuzz(deps: BuzzDeps = { vibrate: browserVibrate(), muted: () => false }): (p: Pattern) => void {
  return (p) => {
    if (!deps.vibrate || deps.muted()) return;
    try {
      deps.vibrate(p);
    } catch {
      /* Vibration ist nie kritisch */
    }
  };
}
