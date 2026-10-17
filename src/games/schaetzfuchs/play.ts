const MAX_GUESS = 1e12;

export function parseGuess(raw: string): number | null {
  const digits = raw.replace(/[\s.]/g, '');
  if (!/^\d+$/.test(digits)) return null;
  const n = Number(digits);
  return n <= MAX_GUESS ? n : null;
}

export function countAt(target: number, progress: number): number {
  const t = Math.min(1, Math.max(0, progress));
  return Math.round(target * (1 - (1 - t) ** 3));
}
