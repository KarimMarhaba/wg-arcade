export const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const CODE_RE = new RegExp(`^[${ALPHABET}]{4}$`);

export function newCode(rand: () => number): string {
  let s = '';
  for (let i = 0; i < 4; i++) s += ALPHABET[Math.floor(rand() * ALPHABET.length)];
  return s;
}

export function normalizeCode(input: string): string | null {
  const s = input.replace(/\s+/g, '').toUpperCase();
  return CODE_RE.test(s) ? s : null;
}
