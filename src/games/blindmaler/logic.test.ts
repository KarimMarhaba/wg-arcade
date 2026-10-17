import { describe, expect, it } from 'vitest';
import { BM_DRAW, BM_DUO_DRAW, BM_REVEAL, BM_SHOW, GRACE, scale } from '../../engine/durations';
import { blindmaler, type BmState, type BmView } from './logic';
import { MAX_CHARS, MAX_POINTS } from './strokes';
import { WORDS } from './words';

const NOW = 5000;
const uuid = (i: number): string => `3f2a9c4e-7b1d-4e8a-9c3f-${String(i).padStart(12, '0')}`;
const players = (ids: readonly string[]) => ids.map((pid, i) => ({ pid, name: `P${i}`, color: i }));
const pidsOf = (n: number): string[] => Array.from({ length: n }, (_, i) => `p${i}`);
const make = (n = 3, seed = 3, speed = 1, ids: readonly string[] = pidsOf(n)): BmState =>
  blindmaler.init(players(ids), seed, NOW, { speed, drinking: false });
const everyone = (s: BmState): Set<string> => new Set(s.pids);
const send = (s: BmState, pid: string, raw: unknown, now = NOW): BmState => {
  const i = blindmaler.parseInput(raw);
  if (i === null) throw new Error(`ungueltig: ${JSON.stringify(raw)}`);
  return blindmaler.input(s, pid, i, now);
};
const view = (s: BmState, pid: string): BmView => blindmaler.view(s, pid, NOW);
const keys = (v: unknown): string[] => Object.keys(v as object).sort();
const tick = (s: BmState, at: number, online: ReadonlySet<string> = everyone(s)): BmState => blindmaler.tick(s, at, online);
const hex2 = (n: number): string => n.toString(16).padStart(2, '0');
const inkOf = (i: number, k = 0): string[] => [`${hex2(10 + i)}${hex2(20 + k)}${hex2(40 + i)}${hex2(60 + k)}`];
const wordOf = (s: BmState, pid: string, k = 0): string => (WORDS[(s.words[pid] as number[])[k] as number] as { word: string }).word;

function drawAll(s0: BmState, who: readonly string[] = s0.pids, at = NOW + 1): BmState {
  let s = s0;
  for (let k = 0; k < s0.slots; k++) {
    who.forEach((p) => {
      s = send(s, p, { a: 'draw', k, strokes: inkOf(s0.pids.indexOf(p), k), fin: true }, at);
    });
    s = tick(s, at, new Set(who));
  }
  return s;
}

const viewers = (s: BmState): string[] => s.pids.filter((p) => p !== (s.imgs[s.j] as { who: string }).who);
const drawerOf = (s: BmState): string => (s.imgs[s.j] as { who: string }).who;
const rightTip = (s: BmState): number => (s.imgs[s.j] as { ans: number }).ans;
const wrongTip = (s: BmState): number => (rightTip(s) + 1) % 4;

function tipAll(s0: BmState, right: (viewer: string, j: number) => boolean, at = NOW + 2): BmState {
  let s = s0;
  for (const v of viewers(s0)) s = send(s, v, { a: 'tip', j: s0.j, i: right(v, s0.j) ? rightTip(s0) : wrongTip(s0) }, at);
  return s;
}

function toEnd(s0: BmState, right: (viewer: string, j: number) => boolean): BmState {
  let s = s0;
  for (let n = 0; n < 40 && !blindmaler.done(s, s.endsAt); n++) {
    if (s.phase === 'show') s = tipAll(s, right, s.endsAt - 1);
    s = tick(s, s.endsAt);
  }
  return s;
}

describe('init', () => {
  it('ein Slot zu 20 s fuer n = 1 und 3 bis 8, ein eigener Begriff je Spieler', () => {
    for (const n of [1, 3, 4, 8])
      for (const speed of [1, 10]) {
        const s = make(n, 3, speed);
        expect(s.phase).toBe('draw');
        expect(s.slots).toBe(1);
        expect(s.slot).toBe(0);
        expect(s.dur).toBe(scale(BM_DRAW, speed));
        expect(s.endsAt).toBe(NOW + scale(BM_DRAW, speed));
        expect(Object.values(s.words).every((w) => w.length === 1)).toBe(true);
        expect(new Set(Object.values(s.words).flat()).size).toBe(n);
      }
    expect(BM_DRAW).toBe(20_000);
  });

  it('zu zweit zwei Slots zu je 10 s, je Spieler zwei Begriffe, alle vier verschieden', () => {
    for (const speed of [1, 10]) {
      const s = make(2, 3, speed);
      expect(s.slots).toBe(2);
      expect(s.dur).toBe(scale(BM_DUO_DRAW, speed));
      expect(s.endsAt).toBe(NOW + scale(BM_DUO_DRAW, speed));
      expect(Object.values(s.words).every((w) => w.length === 2)).toBe(true);
      expect(new Set(Object.values(s.words).flat()).size).toBe(4);
    }
    expect(BM_DUO_DRAW).toBe(10_000);
    expect(BM_SHOW).toBe(6000);
    expect(BM_REVEAL).toBe(2000);
  });

  it('Begriffe sind ueber Seeds verschieden verteilt und stehen nur im Zustand', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 30; seed++) seen.add(wordOf(make(3, seed), 'p0'));
    expect(seen.size).toBeGreaterThan(10);
  });
});

describe('Zeichnen: Slot-Ende', () => {
  it('ohne Eingaben endet der Slot erst bei endsAt + GRACE (ungeskaliert), davor No-op', () => {
    for (const speed of [1, 10]) {
      const s = make(3, 3, speed);
      expect(tick(s, s.endsAt + GRACE - 1)).toBe(s);
      const end = tick(s, s.endsAt + GRACE);
      expect(end.phase).toBe('end');
      expect(blindmaler.done(end, s.endsAt + GRACE)).toBe(true);
    }
  });

  it('endet vorzeitig, sobald alle Online-Spieler fin gesendet haben', () => {
    const s = drawAllPartial(make(3), ['p0', 'p1']);
    expect(tick(s, NOW + 1, new Set(['p0', 'p1', 'p2']))).toBe(s);
    expect(tick(s, NOW + 1, new Set(['p0', 'p1'])).phase).toBe('show');
  });

  it('ohne Spieler online (leere Menge) endet nichts vorzeitig', () => {
    const s = drawAllPartial(make(3), ['p0', 'p1', 'p2']);
    expect(tick(s, NOW + 1, new Set())).toBe(s);
  });

  it('zu zweit folgt auf Slot 0 der Slot 1 mit frischer Uhr und anderem Begriff', () => {
    const s = make(2, 3);
    const t = NOW + 4000;
    let q = send(s, 'p0', { a: 'draw', k: 0, strokes: inkOf(0), fin: true }, t);
    q = send(q, 'p1', { a: 'draw', k: 0, strokes: inkOf(1), fin: true }, t);
    q = tick(q, t);
    expect(q.phase).toBe('draw');
    expect(q.slot).toBe(1);
    expect(q.endsAt).toBe(t + scale(BM_DUO_DRAW, 1));
    expect(q.dur).toBe(scale(BM_DUO_DRAW, 1));
    const v0 = view(s, 'p0') as { word: string; slot: number };
    const v1 = view(q, 'p0') as { word: string; slot: number };
    expect([v0.slot, v1.slot]).toEqual([0, 1]);
    expect(v1.word).not.toBe(v0.word);
    expect(v0.word).toBe(wordOf(s, 'p0', 0));
    expect(v1.word).toBe(wordOf(s, 'p0', 1));
  });

  it('zu zweit ohne Eingaben: Slot 1 endet erst nach endsAt + GRACE des zweiten Slots', () => {
    const s = make(2, 3);
    const q = tick(s, s.endsAt + GRACE);
    expect(q.phase).toBe('draw');
    expect(q.slot).toBe(1);
    expect(tick(q, q.endsAt + GRACE - 1)).toBe(q);
    expect(tick(q, q.endsAt + GRACE).phase).toBe('end');
  });
});

function drawAllPartial(s0: BmState, who: readonly string[]): BmState {
  return who.reduce((s, p) => send(s, p, { a: 'draw', k: 0, strokes: inkOf(s0.pids.indexOf(p)), fin: true }), s0);
}

describe('Zeichnen: Eingaben', () => {
  it('ein gleicher Schnappschuss liefert dieselbe Referenz, ein neuer ersetzt den Stand', () => {
    const s0 = make(3);
    const s1 = send(s0, 'p0', { a: 'draw', k: 0, strokes: ['0a0b'] });
    expect(s1).not.toBe(s0);
    expect(send(s1, 'p0', { a: 'draw', k: 0, strokes: ['0a0b'] })).toBe(s1);
    const s2 = send(s1, 'p0', { a: 'draw', k: 0, strokes: ['0a0b', '1c1d'] });
    expect(s2).not.toBe(s1);
    expect(s2.ink[0]?.p0).toEqual(['0a0b', '1c1d']);
    expect(s1.ink[0]?.p0).toEqual(['0a0b']);
  });

  it('fin mit gleichem Stand setzt nur fin; danach liefert jede Eingabe dieselbe Referenz', () => {
    const s1 = send(make(3), 'p0', { a: 'draw', k: 0, strokes: ['0a0b'] });
    const s2 = send(s1, 'p0', { a: 'draw', k: 0, strokes: ['0a0b'], fin: true });
    expect(s2).not.toBe(s1);
    expect(s2.ink[0]?.p0).toEqual(['0a0b']);
    expect(send(s2, 'p0', { a: 'draw', k: 0, strokes: ['0a0b'], fin: true })).toBe(s2);
    expect(send(s2, 'p0', { a: 'draw', k: 0, strokes: ['ffff'] })).toBe(s2);
    expect(send(s2, 'p0', { a: 'draw', k: 0, strokes: ['ffff'], fin: true })).toBe(s2);
  });

  it('ein falscher Slot k, ein fremder Spieler und eine andere Phase werden ignoriert', () => {
    const s = make(3);
    expect(send(s, 'p0', { a: 'draw', k: 1, strokes: ['0a0b'] })).toBe(s);
    expect(send(s, 'zz', { a: 'draw', k: 0, strokes: ['0a0b'] })).toBe(s);
    const duo = make(2);
    expect(send(duo, 'p0', { a: 'draw', k: 1, strokes: ['0a0b'] })).toBe(duo);
    const next = tick(duo, duo.endsAt + GRACE);
    expect(next.slot).toBe(1);
    expect(send(next, 'p0', { a: 'draw', k: 0, strokes: ['0a0b'] })).toBe(next);
    expect(send(next, 'p0', { a: 'draw', k: 1, strokes: ['0a0b'] })).not.toBe(next);
  });

  it('nimmt Striche bis endsAt + GRACE an, danach nicht mehr', () => {
    const s = make(3);
    expect(send(s, 'p0', { a: 'draw', k: 0, strokes: ['0a0b'] }, s.endsAt + GRACE - 1)).not.toBe(s);
    expect(send(s, 'p0', { a: 'draw', k: 0, strokes: ['0a0b'] }, s.endsAt + GRACE)).toBe(s);
  });

  it('eine leere Flaeche ohne fin aendert nichts; FERTIG auf leerer Flaeche zaehlt', () => {
    const s = make(3);
    expect(send(s, 'p0', { a: 'draw', k: 0, strokes: [] })).toBe(s);
    expect(blindmaler.result(s).size).toBe(0);
    const f = send(s, 'p0', { a: 'draw', k: 0, strokes: [], fin: true });
    expect(f).not.toBe(s);
    expect(blindmaler.result(f).has('p0')).toBe(true);
    expect(blindmaler.label(f, 'p0')).toBe('0 Pkt');
  });

  it('parseInput kappt Uebergrosses: 10000 Zeichen, 5000 Striche, Muell darin', () => {
    const long = blindmaler.parseInput({ a: 'draw', k: 0, strokes: ['a'.repeat(10_000)] });
    expect(long).toEqual({ a: 'draw', k: 0, strokes: ['a'.repeat(MAX_CHARS)], fin: false });
    const many = blindmaler.parseInput({ a: 'draw', k: 0, strokes: Array.from({ length: 5000 }, () => '0a0b'), fin: true });
    expect(many).toMatchObject({ a: 'draw', fin: true });
    if (many?.a === 'draw') expect(many.strokes).toHaveLength(MAX_POINTS);
    expect(blindmaler.parseInput({ a: 'draw', k: 0, strokes: ['x', 7, null, '0a0b'] })).toEqual({
      a: 'draw',
      k: 0,
      strokes: ['0a0b'],
      fin: false,
    });
  });

  it('parseInput lehnt Unpassendes ab und wirft nie', () => {
    const bad: unknown[] = [
      { a: 'draw' },
      { a: 'draw', k: 0 },
      { a: 'draw', k: 0, strokes: 'abcd' },
      { a: 'draw', k: -1, strokes: [] },
      { a: 'draw', k: 2, strokes: [] },
      { a: 'draw', k: 0.5, strokes: [] },
      { a: 'draw', k: '0', strokes: [] },
      { a: 'tip', j: 0 },
      { a: 'tip', i: 0 },
      { a: 'tip', j: 0, i: 4 },
      { a: 'tip', j: 0, i: -1 },
      { a: 'tip', j: -1, i: 0 },
      { a: 'tip', j: 99, i: 0 },
      { a: 'tip', j: 0.5, i: 0 },
      { a: 'tap', j: 0, i: 0 },
      { strokes: [] },
    ];
    for (const raw of bad) {
      expect(() => blindmaler.parseInput(raw)).not.toThrow();
      expect(blindmaler.parseInput(raw), JSON.stringify(raw)).toBeNull();
    }
    expect(blindmaler.parseInput({ a: 'tip', j: 3, i: 2 })).toEqual({ a: 'tip', j: 3, i: 2 });
  });

  it('parseInput haelt keine Referenz auf die Roh-Eingabe', () => {
    const raw = { a: 'draw', k: 0, strokes: ['0a0b'], fin: true };
    const i = blindmaler.parseInput(raw);
    raw.strokes[0] = 'ffff';
    expect(i).toMatchObject({ strokes: ['0a0b'] });
  });
});

describe('Galerie', () => {
  it('zeigt nur nicht leere Bilder; leere Flaechen werden uebersprungen', () => {
    const s = drawAll(make(5, 4), ['p0', 'p2', 'p3']);
    expect(s.phase).toBe('show');
    expect(s.imgs.map((i) => i.who).sort()).toEqual(['p0', 'p2', 'p3']);
    const mixed = send(send(make(4, 4), 'p0', { a: 'draw', k: 0, strokes: [], fin: true }), 'p1', { a: 'draw', k: 0, strokes: inkOf(1), fin: true });
    expect(tick(mixed, mixed.endsAt + GRACE).imgs.map((i) => i.who)).toEqual(['p1']);
  });

  it('die Reihenfolge ist seed-gemischt, beim Phasenwechsel fixiert und enthaelt jedes Bild genau einmal', () => {
    const orders = new Set<string>();
    for (let seed = 0; seed < 40; seed++) {
      const s = drawAll(make(5, seed));
      orders.add(s.imgs.map((i) => i.who).join());
      expect([...s.imgs.map((i) => i.who)].sort()).toEqual(pidsOf(5));
      expect(drawAll(make(5, seed)).imgs).toEqual(s.imgs);
    }
    expect(orders.size).toBeGreaterThan(10);
    const s = drawAll(make(5, 7));
    const later = tick(tipAll(s, () => true), s.endsAt);
    expect(later.imgs).toBe(s.imgs);
    const duo = drawAll(make(2, 7));
    expect(duo.imgs).toHaveLength(4);
    expect(duo.imgs.map((i) => `${i.who}${i.k}`).sort()).toEqual(['p00', 'p01', 'p10', 'p11']);
  });

  it('hat niemand gezeichnet, endet das Spiel nach dem Zeichnen', () => {
    const s = make(4);
    const end = tick(s, s.endsAt + GRACE);
    expect(end.phase).toBe('end');
    expect(end.imgs).toEqual([]);
    expect(blindmaler.done(end, s.endsAt + GRACE)).toBe(true);
    expect(blindmaler.result(end).size).toBe(0);
    expect(() => blindmaler.view(end, 'p0', NOW)).not.toThrow();
  });

  it('ein Bild: 6 s Tippen, 2 s Aufloesung, durch scale; zu Ende nach dem letzten Bild', () => {
    for (const speed of [1, 10]) {
      const s = drawAll(make(3, 3, speed));
      expect(s.phase).toBe('show');
      expect(s.j).toBe(0);
      expect(s.dur).toBe(scale(BM_SHOW, speed));
      expect(s.endsAt).toBe(NOW + 1 + scale(BM_SHOW, speed));
      expect(tick(s, s.endsAt - 1)).toBe(s);
      const r = tick(s, s.endsAt);
      expect(r.phase).toBe('reveal');
      expect(r.dur).toBe(scale(BM_REVEAL, speed));
      expect(blindmaler.done(r, r.endsAt - 1)).toBe(false);
      expect(tick(r, r.endsAt - 1)).toBe(r);
      const n1 = tick(r, r.endsAt);
      expect([n1.phase, n1.j]).toEqual(['show', 1]);
      expect(n1.endsAt).toBe(r.endsAt + scale(BM_SHOW, speed));
    }
  });

  it('endet das Bild vorzeitig, wenn alle Online-Betrachter getippt haben', () => {
    const s = drawAll(make(4, 3));
    const some = send(s, viewers(s)[0] as string, { a: 'tip', j: 0, i: 1 });
    expect(tick(some, NOW + 3)).toBe(some);
    const all = tipAll(s, () => true);
    expect(tick(all, NOW + 3).phase).toBe('reveal');
    const offline = new Set(viewers(s).slice(0, 2));
    const two = [...offline].reduce((q, v) => send(q, v, { a: 'tip', j: 0, i: 1 }), s);
    expect(tick(two, NOW + 3, offline).phase).toBe('reveal');
    expect(tick(two, NOW + 3)).toBe(two);
  });

  it('der letzte Bild-Aufloesung folgt done', () => {
    const s = toEnd(drawAll(make(3, 3)), () => true);
    expect(s.phase).toBe('reveal');
    expect(s.j).toBe(2);
    expect(blindmaler.done(s, s.endsAt - 1)).toBe(false);
    expect(blindmaler.done(s, s.endsAt)).toBe(true);
    expect(tick(s, s.endsAt)).toBe(s);
  });

  it('n = 1 hat kein Tippen: das Bild geht direkt in die Aufloesung, 0 Pkt', () => {
    const s = drawAll(make(1, 3));
    expect(s.phase).toBe('reveal');
    expect(s.imgs).toHaveLength(1);
    expect(blindmaler.done(s, s.endsAt)).toBe(true);
    expect(blindmaler.result(s)).toEqual(new Map([['p0', 0]]));
    expect(blindmaler.label(s, 'p0')).toBe('0 Pkt');
    const v = view(s, 'p0') as { role: string };
    expect(v.role).toBe('drawer');
  });

  it('ohne Betrachter online wartet das Bild die 6 s ab', () => {
    const s = drawAll(make(3, 3));
    expect(tick(s, NOW + 3, new Set())).toBe(s);
  });
});

describe('Tippen', () => {
  it('der Zeichner kann sein eigenes Bild nicht betippen', () => {
    const s = drawAll(make(3, 3));
    expect(send(s, drawerOf(s), { a: 'tip', j: 0, i: 0 })).toBe(s);
  });

  it('jeder Betrachter tippt je Bild genau einmal; ein spaeterer Tipp aendert nichts', () => {
    const s = drawAll(make(4, 3));
    const v = viewers(s)[0] as string;
    const a = send(s, v, { a: 'tip', j: 0, i: 2 });
    expect(a).not.toBe(s);
    expect(send(a, v, { a: 'tip', j: 0, i: 3 })).toBe(a);
    expect(send(a, v, { a: 'tip', j: 0, i: 2 })).toBe(a);
  });

  it('ein veraltetes oder kuenftiges Bild j wird ignoriert, ebenso Tipps ausserhalb von show', () => {
    const s = drawAll(make(4, 3));
    const v = viewers(s)[0] as string;
    expect(send(s, v, { a: 'tip', j: 1, i: 0 })).toBe(s);
    const r = tick(s, s.endsAt);
    expect(r.phase).toBe('reveal');
    expect(send(r, v, { a: 'tip', j: 0, i: 0 })).toBe(r);
    const n = tick(r, r.endsAt);
    expect(send(n, v, { a: 'tip', j: 0, i: 0 })).toBe(n);
    const draw = make(4, 3);
    expect(send(draw, 'p0', { a: 'tip', j: 0, i: 0 })).toBe(draw);
  });

  it('ein unbekannter Spieler tippt nicht', () => {
    const s = drawAll(make(3, 3));
    expect(send(s, 'zz', { a: 'tip', j: 0, i: 0 })).toBe(s);
  });
});

describe('Optionen und Koeder', () => {
  const roundWords = (s: BmState): string[] => Object.values(s.words).flat().map((i) => (WORDS[i] as { word: string }).word);
  const catOf = (w: string): string => (WORDS.find((x) => x.word === w) as { cat: string }).cat;

  it('je Bild 4 verschiedene Optionen: der echte Begriff und 3 Koeder, nie ein Begriff dieser Runde', () => {
    for (let seed = 0; seed < 40; seed++)
      for (const n of [2, 3, 5, 8]) {
        const s = drawAll(make(n, seed));
        const round = new Set(roundWords(s));
        for (const img of s.imgs) {
          expect(img.options).toHaveLength(4);
          expect(new Set(img.options).size).toBe(4);
          const truth = wordOf(s, img.who, img.k);
          expect(img.options[img.ans]).toBe(truth);
          for (const o of img.options) if (o !== truth) expect(round.has(o), `${o} ist ein Begriff dieser Runde`).toBe(false);
        }
      }
  });

  it('Koeder stammen bevorzugt aus derselben Kategorie', () => {
    for (let seed = 0; seed < 40; seed++) {
      const s = drawAll(make(8, seed));
      const round = new Set(roundWords(s));
      for (const img of s.imgs) {
        const truth = wordOf(s, img.who, img.k);
        const same = WORDS.filter((w) => w.cat === catOf(truth) && w.word !== truth && !round.has(w.word)).length;
        const inCat = img.options.filter((o) => o !== truth && catOf(o) === catOf(truth)).length;
        expect(inCat).toBe(Math.min(3, same));
      }
    }
  });

  it('die Position der richtigen Option wechselt ueber die Seeds', () => {
    const seen = new Set<number>();
    for (let seed = 0; seed < 60; seed++) for (const img of drawAll(make(3, seed)).imgs) seen.add(img.ans);
    expect([...seen].sort()).toEqual([0, 1, 2, 3]);
  });

  it('die Optionen stehen im Zustand fest: spaetere Ticks aendern sie nicht', () => {
    const s = drawAll(make(3, 5));
    const r = tick(tipAll(s, () => true), NOW + 3);
    expect(r.imgs).toBe(s.imgs);
    expect(view(s, viewers(s)[0] as string)).toEqual(view(s, viewers(s)[0] as string));
  });
});

describe('Wertung', () => {
  it('Zeichner +2 je Betrachter, der richtig lag, Betrachter +1 je richtigem Tipp', () => {
    const s = toEnd(drawAll(make(3, 3)), () => true);
    for (const p of s.pids) expect(blindmaler.result(s).get(p)).toBe(2 * 2 + 1 * 2);
    expect(blindmaler.label(s, 'p0')).toBe('6 Pkt');
  });

  it('falsche Tipps zaehlen nicht, gemischte Tipps zaehlen einzeln', () => {
    const all = toEnd(drawAll(make(4, 3)), () => false);
    for (const p of all.pids) expect(blindmaler.result(all).get(p)).toBe(0);
    const s0 = drawAll(make(4, 3));
    const first = s0.pids.filter((p) => p !== drawerOf(s0))[0] as string;
    const s = toEnd(s0, (v, j) => j === 0 && v === first);
    expect(blindmaler.result(s).get(first)).toBe(1);
    expect(blindmaler.result(s).get(drawerOf(s0))).toBe(2);
    const sum = [...blindmaler.result(s).values()].reduce((a, b) => a + b, 0);
    expect(sum).toBe(3);
  });

  it('zu zweit: jeder bekommt 2 Punkte je Bild, das der andere erkennt, und 1 je eigenem Treffer', () => {
    const s = toEnd(drawAll(make(2, 3)), (v) => v === 'p0');
    expect(s.imgs).toHaveLength(4);
    expect(blindmaler.result(s).get('p0')).toBe(2);
    expect(blindmaler.result(s).get('p1')).toBe(4);
    expect(blindmaler.label(s, 'p1')).toBe('4 Pkt');
  });

  it('ein result-Eintrag entsteht erst mit der ersten angenommenen draw-, fin- oder Tipp-Eingabe', () => {
    const s0 = make(4, 3);
    expect(blindmaler.result(s0).size).toBe(0);
    expect(blindmaler.label(s0, 'p0')).toBe('–');
    expect(send(s0, 'p0', { a: 'draw', k: 1, strokes: ['0a0b'] })).toBe(s0);
    const d = send(s0, 'p0', { a: 'draw', k: 0, strokes: ['0a0b'] });
    expect([...blindmaler.result(d).keys()]).toEqual(['p0']);
    const f = send(s0, 'p1', { a: 'draw', k: 0, strokes: [], fin: true });
    expect([...blindmaler.result(f).keys()]).toEqual(['p1']);
    const g = drawAll(make(4, 3), ['p0']);
    const tipper = g.pids.find((p) => p !== 'p0') as string;
    expect(blindmaler.result(g).has(tipper)).toBe(false);
    const t = send(g, tipper, { a: 'tip', j: 0, i: 1 });
    expect(blindmaler.result(t).has(tipper)).toBe(true);
    expect(blindmaler.label(t, tipper)).toBe('0 Pkt');
    expect(blindmaler.label(t, 'zz')).toBe('–');
  });
});

describe('Sichten: genaue Schluesselmengen', () => {
  const sorted = (...a: string[]): string[] => a.sort();
  const DRAW = sorted('dur', 'endsAt', 'fin', 'phase', 'ready', 'slot', 'slots', 'total', 'word');
  const TIMED = ['dur', 'endsAt'];
  const SHOW_DRAWER = sorted(...TIMED, 'drawer', 'j', 'of', 'phase', 'role', 'strokes', 'tipped', 'viewers');
  const SHOW_VIEWER = sorted(...SHOW_DRAWER, 'mine', 'opts');
  const REVEAL = sorted(...TIMED, 'drawer', 'gain', 'hit', 'j', 'of', 'phase', 'role', 'strokes', 'winners', 'word');

  it('draw: nur der eigene Begriff des Slots, Zaehler, kein Strich', () => {
    const s = send(make(3, 3), 'p0', { a: 'draw', k: 0, strokes: ['0a0b'] });
    for (const p of s.pids) {
      const v = view(s, p) as BmView & Record<string, unknown>;
      expect(keys(v)).toEqual(DRAW);
      expect(v).toMatchObject({ phase: 'draw', slot: 0, slots: 1, word: wordOf(s, p), fin: false, ready: 0, total: 3 });
      expect(JSON.stringify(v)).not.toContain('0a0b');
    }
    const f = send(s, 'p1', { a: 'draw', k: 0, strokes: [], fin: true });
    expect(view(f, 'p1')).toMatchObject({ fin: true, ready: 1 });
    expect(view(f, 'p0')).toMatchObject({ fin: false, ready: 1 });
  });

  it('draw: endsAt und dur ohne GRACE; zu zweit zeigt jede Sicht nur den Begriff des laufenden Slots', () => {
    const s = make(2, 3);
    const v = view(s, 'p0') as { endsAt: number; dur: number; word: string; slots: number };
    expect(v.endsAt).toBe(s.endsAt);
    expect(v.dur).toBe(s.dur);
    expect(v.slots).toBe(2);
    expect(JSON.stringify(view(s, 'p0'))).not.toContain(wordOf(s, 'p0', 1));
    expect(JSON.stringify(view(s, 'p1'))).not.toContain(wordOf(s, 'p0', 0));
  });

  it('show: Betrachter und Zeichner haben je eine feste Schluesselmenge', () => {
    const s = drawAll(make(4, 3));
    const d = drawerOf(s);
    expect(keys(view(s, d))).toEqual(SHOW_DRAWER);
    expect(view(s, d)).toMatchObject({ phase: 'show', role: 'drawer', drawer: d, j: 0, of: 4, tipped: 0, viewers: 3 });
    for (const v of viewers(s)) {
      expect(keys(view(s, v))).toEqual(SHOW_VIEWER);
      expect(view(s, v)).toMatchObject({ phase: 'show', role: 'viewer', drawer: d, mine: null });
    }
  });

  it('show: Striche nur des aktuellen Bildes, der Zeichner sieht weder Optionen noch Tipp', () => {
    const s = drawAll(make(4, 3));
    const cur = s.imgs[0] as { who: string; k: number };
    const own = inkOf(s.pids.indexOf(cur.who), cur.k);
    const v = view(s, viewers(s)[0] as string) as unknown as { strokes: string[] };
    expect(v.strokes).toEqual(own);
    const json = JSON.stringify(view(s, 'p0'));
    for (const img of s.imgs.slice(1)) {
      expect(json).not.toContain(inkOf(s.pids.indexOf(img.who), img.k)[0] as string);
      expect(json).not.toContain(`"${wordOf(s, img.who, img.k)}"`);
    }
    expect(JSON.stringify(view(s, cur.who))).not.toContain('opts');
  });

  it('show: Tipps und die richtige Position stehen in keiner fremden Sicht', () => {
    const s = drawAll(make(5, 3));
    const [a, b] = viewers(s) as [string, string];
    const withTip = send(s, a, { a: 'tip', j: 0, i: 2 });
    expect(view(withTip, a)).toMatchObject({ mine: 2, tipped: 1 });
    expect(view(withTip, b)).toMatchObject({ mine: null, tipped: 1 });
    const flipped: BmState = { ...withTip, imgs: withTip.imgs.map((i) => ({ ...i, ans: (i.ans + 1) % 4 })) };
    for (const p of s.pids) expect(JSON.stringify(view(flipped, p))).toBe(JSON.stringify(view(withTip, p)));
    const other = { ...withTip, tips: [{ [a]: 3 }, ...withTip.tips.slice(1)] };
    for (const p of s.pids.filter((x) => x !== a)) expect(JSON.stringify(view(other, p))).toBe(JSON.stringify(view(withTip, p)));
  });

  it('reveal: Begriff, wer richtig lag und Punkte kommen vom Host', () => {
    const s0 = drawAll(make(4, 3));
    const [a, b, c] = viewers(s0) as [string, string, string];
    let s = send(s0, a, { a: 'tip', j: 0, i: rightTip(s0) });
    s = send(s, b, { a: 'tip', j: 0, i: wrongTip(s0) });
    s = tick(s, s.endsAt);
    const d = drawerOf(s0);
    const truth = wordOf(s0, d, (s0.imgs[0] as { k: number }).k);
    expect(keys(view(s, d))).toEqual(REVEAL);
    expect(view(s, d)).toMatchObject({ phase: 'reveal', role: 'drawer', word: truth, winners: [a], gain: 2, hit: null });
    expect(view(s, a)).toMatchObject({ role: 'viewer', winners: [a], gain: 1, hit: true });
    expect(view(s, b)).toMatchObject({ gain: 0, hit: false });
    expect(view(s, c)).toMatchObject({ gain: 0, hit: null });
  });

  it('end und unbekannte Spieler: kein Wurf, stabile Form', () => {
    const e = tick(make(3), NOW + 30_000);
    expect(keys(view(e, 'p0'))).toEqual([...TIMED, 'phase']);
    expect(() => view(make(3), 'zz')).not.toThrow();
    expect(() => view(drawAll(make(3)), 'zz')).not.toThrow();
    expect(() => view(tick(drawAll(make(3)), NOW + 10_000), 'zz')).not.toThrow();
  });

  it('in keiner Sicht stehen Bankindizes oder Feldnamen des Rohzustands', () => {
    const states: BmState[] = [make(3, 3), drawAll(make(3, 3)), tick(drawAll(make(3, 3)), NOW + 20_000)];
    for (const s of states)
      for (const p of s.pids) {
        const json = JSON.stringify(view(s, p));
        for (const raw of ['"words"', '"ink"', '"imgs"', '"ans"', '"tips"', '"options"', '"seed"', '"seen"', '"durs"', '"pids"'])
          expect(json).not.toContain(raw);
      }
  });

  it('view ist bei gleichem Zustand unabhaengig von now', () => {
    const s = drawAll(make(3, 3));
    for (const p of ['p0', 'p1', 'zz']) expect(JSON.stringify(blindmaler.view(s, p, NOW))).toBe(JSON.stringify(blindmaler.view(s, p, NOW + 999)));
  });
});

describe('Sichtgroesse: Worst Case in jeder Phase', () => {
  const worst = (i: number): string[] =>
    Array.from({ length: MAX_POINTS }, (_, k) => `${hex2((k + i) % 256)}${hex2((k * 7 + i) % 256)}`);

  it('8 Spieler mit UUID-pids und 600 Einzelpunkt-Strichen je Bild: jede Sicht unter 6000 Zeichen', () => {
    for (const n of [1, 2, 3, 8]) {
      const ids = Array.from({ length: n }, (_, i) => uuid(i));
      let s = make(n, 5, 1, ids);
      const check = (): void => {
        for (const p of [...ids, uuid(99)]) {
          const len = JSON.stringify(view(s, p)).length;
          expect(len, `n=${n} Phase ${s.phase} j=${s.j} slot=${s.slot} ${p.slice(-2)}`).toBeLessThan(6000);
        }
      };
      let at = NOW + 1;
      check();
      for (let slot = 0; slot < s.slots; slot++) {
        ids.forEach((p, i) => {
          s = send(s, p, { a: 'draw', k: slot, strokes: worst(i + slot), fin: true }, at);
          check();
        });
        s = tick(s, at);
        check();
      }
      for (let guard = 0; guard < 60 && !blindmaler.done(s, at); guard++) {
        if (s.phase === 'show')
          for (const v of s.pids.filter((p) => p !== drawerOf(s))) {
            s = send(s, v, { a: 'tip', j: s.j, i: 1 }, at);
            check();
          }
        at = s.endsAt;
        s = tick(s, at);
        check();
      }
      expect(blindmaler.done(s, at), `n=${n} fertig`).toBe(true);
    }
  });

  it('der Worst-Case-Strich besteht ueber parseInput: 600 Punkte, 2400 Zeichen', () => {
    const i = blindmaler.parseInput({ a: 'draw', k: 0, strokes: worst(0), fin: true });
    expect(i).not.toBeNull();
    if (i?.a === 'draw') {
      expect(i.strokes).toHaveLength(MAX_POINTS);
      expect(i.strokes.join('').length).toBe(MAX_CHARS);
    }
  });
});

describe('Spiel-Metadaten', () => {
  it('Kennung, Titel, Regel, Akzent cyan, keine eigenen drinks', () => {
    expect(blindmaler.id).toBe('blindmaler');
    expect(blindmaler.title).toBe('BLINDMALER');
    expect(blindmaler.rule).not.toBe('');
    expect(blindmaler.accent).toBe('cyan');
    expect(blindmaler.drinks).toBeUndefined();
    expect(blindmaler.drinkOnly).toBeUndefined();
  });

  it('ohne jede Eingabe endet jede Spielerzahl, wenn zwei Slots abgelaufen sind', () => {
    for (const n of [1, 2, 3, 8]) {
      let s = make(n, 9, 10);
      let t = NOW;
      while (!blindmaler.done(s, t) && t < NOW + 60_000) {
        t += 100;
        s = tick(s, t);
      }
      expect(blindmaler.done(s, t), `n=${n}`).toBe(true);
      expect(blindmaler.result(s).size).toBe(0);
    }
  });
});
