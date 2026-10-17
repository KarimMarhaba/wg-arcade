import { describe, expect, it } from 'vitest';
import { capStrokes, decode, encode, MAX_CHARS, MAX_POINTS, MIN_STEP, pack, pointCount, quantize, thin, type Pt } from './strokes';

const hex2 = (n: number): string => n.toString(16).padStart(2, '0');
const one = (x: number, y: number): string => `${hex2(x)}${hex2(y)}`;
const pts = (n: number, step = 10): Pt[] => Array.from({ length: n }, (_, i) => [(i * step) % 256, ((i * step) >> 8) * 10] as Pt);
const chars = (strokes: readonly string[]): number => strokes.reduce((a, s) => a + s.length, 0);

describe('Konstanten', () => {
  it('600 Punkte zu je 4 Hex-Zeichen, also hoechstens 2400 Zeichen je Bild', () => {
    expect(MAX_POINTS).toBe(600);
    expect(MAX_CHARS).toBe(2400);
    expect(MIN_STEP).toBeGreaterThanOrEqual(2);
  });
});

describe('quantize', () => {
  it('bildet 0..size auf 0..255 ab, gerundet', () => {
    expect(quantize(0, 100)).toBe(0);
    expect(quantize(100, 100)).toBe(255);
    expect(quantize(50, 100)).toBe(128);
    expect(quantize(25, 100)).toBe(64);
    expect(quantize(1, 255)).toBe(1);
  });

  it('klemmt ausserhalb auf 0 bzw. 255', () => {
    expect(quantize(-40, 100)).toBe(0);
    expect(quantize(1e9, 100)).toBe(255);
    expect(quantize(Infinity, 100)).toBe(255);
    expect(quantize(-Infinity, 100)).toBe(0);
  });

  it('NaN und eine Flaeche ohne Groesse geben 0', () => {
    expect(quantize(Number.NaN, 100)).toBe(0);
    expect(quantize(10, 0)).toBe(0);
    expect(quantize(10, -5)).toBe(0);
    expect(quantize(10, Number.NaN)).toBe(0);
  });
});

describe('encode und decode', () => {
  it('4 Hex-Zeichen je Punkt, klein geschrieben, mit fuehrenden Nullen', () => {
    expect(encode([[0, 0]])).toBe('0000');
    expect(encode([[10, 11], [255, 16]])).toBe('0a0bff10');
    expect(encode([])).toBe('');
  });

  it('klemmt und rundet Eingaben, NaN wird 0', () => {
    expect(encode([[-5, 300]])).toBe('00ff');
    expect(encode([[1.6, 2.4]])).toBe('0202');
    expect(encode([[Number.NaN, Number.NaN]])).toBe('0000');
  });

  it('decode kehrt encode um', () => {
    const p: Pt[] = [[0, 0], [1, 2], [128, 200], [255, 255]];
    expect(decode(encode(p))).toEqual(p);
  });

  it('decode wirft nie: ein Rest unter 4 Zeichen entfaellt, Nicht-Hex gibt nichts', () => {
    expect(decode('0a0b1')).toEqual([[10, 11]]);
    expect(decode('zzzz')).toEqual([]);
    expect(decode('0a0')).toEqual([]);
    expect(decode('')).toEqual([]);
    expect(decode('0A0B')).toEqual([[10, 11]]);
  });
});

describe('thin', () => {
  it('behaelt Anfang und Ende, wirft gleiche und sehr nahe Punkte weg', () => {
    expect(thin([[5, 5], [5, 5], [5, 5]])).toEqual([[5, 5]]);
    expect(thin([[5, 5], [6, 5], [5, 6]])).toEqual([[5, 5], [5, 6]]);
    const long: Pt[] = [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0]];
    const out = thin(long);
    expect(out[0]).toEqual([0, 0]);
    expect(out.at(-1)).toEqual([5, 0]);
    expect(out.length).toBeLessThan(long.length);
  });

  it('weit auseinander liegende Punkte bleiben alle', () => {
    const p: Pt[] = [[0, 0], [20, 0], [40, 0], [60, 10]];
    expect(thin(p)).toEqual(p);
  });

  it('ein Einzelpunkt und eine leere Liste bleiben', () => {
    expect(thin([[9, 9]])).toEqual([[9, 9]]);
    expect(thin([])).toEqual([]);
  });

  it('kein zwei benachbarte Punkte naeher als MIN_STEP, ausser dem letzten', () => {
    const wiggly: Pt[] = Array.from({ length: 200 }, (_, i) => [i % 7, (i * 3) % 5] as Pt);
    const out = thin(wiggly);
    for (let i = 1; i < out.length - 1; i++) {
      const a = out[i - 1] as Pt;
      const b = out[i] as Pt;
      expect(Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]))).toBeGreaterThanOrEqual(MIN_STEP);
    }
  });
});

describe('pack: Budget je Bild', () => {
  it('kodiert, verwirft leere Striche und behaelt die Reihenfolge', () => {
    expect(pack([[[10, 10], [40, 40]], [], [[200, 200]]])).toEqual(['0a0a2828', 'c8c8']);
  });

  it('dünnt jeden Strich aus', () => {
    expect(pack([[[5, 5], [5, 5], [5, 5]]])).toEqual(['0505']);
  });

  it('hoechstens 600 Punkte und 2400 Zeichen, auch mit einem riesigen Strich', () => {
    const out = pack([pts(2000, 7)]);
    expect(pointCount(out)).toBeLessThanOrEqual(MAX_POINTS);
    expect(chars(out)).toBeLessThanOrEqual(MAX_CHARS);
    expect(pointCount(out)).toBe(MAX_POINTS);
  });

  it('kappt mitten im Strich und danach keine Tinte mehr: auch viele Einzelpunkte', () => {
    const dots: Pt[][] = Array.from({ length: 700 }, (_, i) => [[(i * 3) % 256, (i >> 8) * 40]] as Pt[]);
    const out = pack(dots);
    expect(out).toHaveLength(MAX_POINTS);
    expect(out).toEqual(pack(dots.slice(0, MAX_POINTS)));
  });

  it('unter dem Budget bleibt alles', () => {
    const p = [pts(30, 8), pts(20, 9)];
    const out = pack(p);
    expect(out).toHaveLength(2);
    expect(decode(out[0] as string).length).toBeGreaterThan(20);
  });
});

describe('capStrokes (Host-Seite, wirft nie)', () => {
  it('Muell gibt eine leere Liste', () => {
    for (const g of [null, undefined, 0, 'x', true, {}, [], [1, 2], { length: 3 }]) {
      expect(() => capStrokes(g)).not.toThrow();
      expect(capStrokes(g)).toEqual([]);
    }
  });

  it('gueltige Striche bleiben unveraendert, Gross- wird Kleinschreibung', () => {
    expect(capStrokes(['0a0b1c1d', 'FF00'])).toEqual(['0a0b1c1d', 'ff00']);
  });

  it('verwirft kaputte Striche: kein String, kein Hex, leer, unter einem Punkt', () => {
    expect(capStrokes([1, null, {}, [], 'xyz!', '', 'abc', 'zzzzzzzz', '0a0b'])).toEqual(['0a0b']);
  });

  it('ein Rest unter 4 Zeichen am Strichende entfaellt', () => {
    expect(capStrokes(['0a0b1'])).toEqual(['0a0b']);
  });

  it('kuerzt einen 10000-Zeichen-String auf 2400 Zeichen', () => {
    const out = capStrokes(['a'.repeat(10_000)]);
    expect(out).toEqual(['a'.repeat(MAX_CHARS)]);
  });

  it('kuerzt 5000 Striche auf 600 Punkte', () => {
    const out = capStrokes(Array.from({ length: 5000 }, () => '0a0b'));
    expect(out).toHaveLength(MAX_POINTS);
    expect(chars(out)).toBe(MAX_CHARS);
  });

  it('das Budget zaehlt ueber alle Striche, kaputte kosten nichts', () => {
    const raw = ['a'.repeat(2000), 'zz', 'b'.repeat(1000), 'c'.repeat(400)];
    const out = capStrokes(raw);
    expect(out).toEqual(['a'.repeat(2000), 'b'.repeat(400)]);
    expect(chars(out)).toBe(MAX_CHARS);
  });

  it('ist idempotent und unabhaengig vom Roh-Array (neue Arrays)', () => {
    const raw = ['0a0b', '1c1d'];
    const out = capStrokes(raw);
    expect(out).not.toBe(raw);
    expect(capStrokes(out)).toEqual(out);
    raw[0] = 'ffff';
    expect(out[0]).toBe('0a0b');
  });

  it('ein dünn besetztes und ein riesiges Array werfen nicht', () => {
    const sparse = new Array(100_000);
    sparse[5] = '0a0b';
    expect(() => capStrokes(sparse)).not.toThrow();
    expect(capStrokes(sparse)).toEqual(['0a0b']);
  });
});

describe('pointCount', () => {
  it('zaehlt Punkte, nicht Striche', () => {
    expect(pointCount([])).toBe(0);
    expect(pointCount(['0a0b', '0a0b1c1d'])).toBe(3);
    expect(one(1, 2)).toBe('0102');
  });
});
