import { describe, expect, it } from 'vitest';
import { scale, VR_DUO_TURN, VR_GUESS, VR_REVEAL, VR_TALK, VR_TURN, VR_VOTE, VR_WORD } from '../../engine/durations';
import { verraeter, type VrState, type VrView } from './logic';
import { WORDS } from './words';

const NOW = 5000;
const players = (n: number) => Array.from({ length: n }, (_, i) => ({ pid: `p${i}`, name: `P${i}`, color: i }));
const pidsOf = (n: number) => players(n).map((p) => p.pid);
const make = (n = 4, seed = 3, speed = 1): VrState => verraeter.init(players(n), seed, NOW, { speed, drinking: false });
const everyone = (n: number) => new Set(pidsOf(n));
const send = (s: VrState, pid: string, raw: unknown, now = NOW): VrState => {
  const i = verraeter.parseInput(raw);
  if (i === null) throw new Error(`ungueltig: ${JSON.stringify(raw)}`);
  return verraeter.input(s, pid, i, now);
};
const view = (s: VrState, pid: string): VrView => verraeter.view(s, pid, NOW);
const keys = (v: unknown): string[] => Object.keys(v as object).sort();
const next = (s: VrState, n: number): VrState => verraeter.tick(s, s.endsAt, everyone(n));
const upTo = (s: VrState, n: number, phase: VrState['phase']): VrState => {
  let q = s;
  for (let i = 0; q.phase !== phase; i++) {
    if (i > 100) throw new Error(`${phase} nicht erreicht`);
    q = next(q, n);
  }
  return q;
};
const traitorOf = (s: VrState): string => s.traitor as string;
const crewOf = (s: VrState): string[] => s.pids.filter((p) => p !== s.traitor);
const entryOf = (s: VrState) => WORDS[s.entry] as (typeof WORDS)[number];
const pts = (s: VrState, pid: string) => verraeter.result(s).get(pid);

function votes(s: VrState, n: number, v: Record<string, string>): VrState {
  let q = upTo(s, n, 'vote');
  for (const [pid, to] of Object.entries(v)) q = send(q, pid, { a: 'vote', to });
  return q;
}

function exposeAll(s: VrState, n: number): VrState {
  const t = traitorOf(s);
  const c = crewOf(s);
  return votes(s, n, { ...Object.fromEntries(c.map((p) => [p, t])), [t]: c[0] as string });
}

describe('verraeter parseInput', () => {
  it('nimmt done, vote, tip und guess an', () => {
    for (const ok of [
      { a: 'done', turn: 0 },
      { a: 'done', turn: 7 },
      { a: 'vote', to: 'p1' },
      { a: 'tip', same: true },
      { a: 'tip', same: false },
      { a: 'guess', i: 0 },
      { a: 'guess', i: 5 },
    ])
      expect(verraeter.parseInput(ok), JSON.stringify(ok)).not.toBeNull();
  });

  it('lehnt Ungueltiges ab', () => {
    for (const bad of [
      { a: 'done' },
      { a: 'done', turn: -1 },
      { a: 'done', turn: 1.5 },
      { a: 'done', turn: '1' },
      { a: 'vote' },
      { a: 'vote', to: '' },
      { a: 'vote', to: 3 },
      { a: 'tip' },
      { a: 'tip', same: 'ja' },
      { a: 'guess' },
      { a: 'guess', i: 6 },
      { a: 'guess', i: -1 },
      { a: 'guess', i: 2.5 },
      { a: 'boom' },
      { turn: 0 },
    ])
      expect(verraeter.parseInput(bad), JSON.stringify(bad)).toBeNull();
  });
});

describe('verraeter init (ab 3 Spielern)', () => {
  it('Modus, Wort, Verraeter und Reihenfolge', () => {
    for (let seed = 0; seed < 40; seed++) {
      for (const n of [3, 4, 5, 8]) {
        const s = make(n, seed);
        expect(s.mode).toBe('crew');
        expect(s.phase).toBe('word');
        expect(s.pids).toEqual(pidsOf(n));
        expect(s.pids).toContain(traitorOf(s));
        expect([...s.order].sort()).toEqual(pidsOf(n));
        expect(Object.keys(s.words).sort()).toEqual(crewOf(s).sort());
        for (const w of Object.values(s.words)) expect(w).toBe(entryOf(s).word);
        expect(s.turns).toBe(n <= 4 ? 2 * n : n);
        expect(s.turn).toBe(0);
        expect(make(n, seed)).toEqual(s);
      }
    }
  });

  it('Verraeter und Sprechreihenfolge sind unabhaengig: seine Position variiert ueber Seeds', () => {
    const pos = new Map<number, number>();
    const who = new Map<string, number>();
    for (let seed = 0; seed < 400; seed++) {
      const s = make(5, seed);
      const at = s.order.indexOf(traitorOf(s));
      pos.set(at, (pos.get(at) ?? 0) + 1);
      who.set(traitorOf(s), (who.get(traitorOf(s)) ?? 0) + 1);
    }
    expect([...pos.keys()].sort()).toEqual([0, 1, 2, 3, 4]);
    for (const n of pos.values()) expect(n).toBeGreaterThanOrEqual(40);
    expect(who.size).toBe(5);
  });

  for (const speed of [1, 10])
    it(`Dauern laufen durch scale, keine GRACE: 3 Spieler im Leerlauf (speed ${speed})`, () => {
      const s = make(3, 5, speed);
      const total = scale(VR_WORD, speed) + 6 * scale(VR_TURN, speed) + scale(VR_TALK, speed) + scale(VR_VOTE, speed) + scale(VR_REVEAL, speed);
      expect(s.endsAt).toBe(NOW + scale(VR_WORD, speed));
      let q = s;
      let t = NOW;
      while (!verraeter.done(q, t)) {
        t = q.endsAt;
        q = verraeter.tick(q, t, everyone(3));
        if (t - NOW > total + 1) throw new Error('zu lang');
      }
      expect(t - NOW).toBe(total);
      expect(verraeter.done(q, t - 1)).toBe(false);
    });
});

describe('verraeter Wortphase', () => {
  it('Crew sieht das Wort, Verraeter nur die Kategorie, jeweils genaue Schluesselmengen', () => {
    const s = make(5, 7);
    const t = traitorOf(s);
    for (const pid of crewOf(s)) {
      const v = view(s, pid);
      expect(keys(v)).toEqual(['dur', 'endsAt', 'phase', 'word']);
      expect(v).toMatchObject({ phase: 'word', word: entryOf(s).word });
    }
    const tv = view(s, t);
    expect(keys(tv)).toEqual(['cat', 'dur', 'endsAt', 'phase', 'traitor']);
    expect(tv).toMatchObject({ phase: 'word', traitor: true, cat: entryOf(s).cat });
  });

  it('Verraeter-Sicht vor guess enthaelt weder Wort noch pair noch Koeder', () => {
    for (let seed = 0; seed < 40; seed++) {
      const n = 3 + (seed % 4);
      let s = make(n, seed);
      const e = entryOf(s);
      const hidden = [e.word, e.pair, ...e.decoys].map((x) => JSON.stringify(x));
      const seen: string[] = [];
      for (const phase of ['word', 'round', 'talk', 'vote'] as const) {
        s = upTo(s, n, phase);
        seen.push(JSON.stringify(view(s, traitorOf(s))));
      }
      for (const json of seen) for (const x of hidden) expect(json, `seed ${seed} ${x}`).not.toContain(x);
    }
  });

  it('Crew-Sichten tragen keinen Rollen- oder Verraeter-Hinweis, in keiner Phase vor der Aufloesung', () => {
    const n = 4;
    let s = make(n, 11);
    for (const phase of ['word', 'round', 'talk', 'vote'] as const) {
      s = upTo(s, n, phase);
      for (const pid of crewOf(s)) {
        const json = JSON.stringify(view(s, pid));
        expect(json).not.toContain('traitor');
        expect(json).not.toContain('role');
        expect(json).not.toContain('cat');
        expect(json).not.toContain('Verräter');
      }
    }
  });

  it('eine unbekannte pid sieht kein Wort', () => {
    const s = make(4, 2);
    expect(JSON.stringify(view(s, 'zz'))).not.toContain(entryOf(s).word);
  });
});

describe('verraeter Reihum', () => {
  it('2 Durchgaenge bei 3-4 Spielern, sonst 1; der Sprecher folgt der Reihenfolge', () => {
    for (const n of [3, 4, 5, 8]) {
      let s = upTo(make(n, 9), n, 'round');
      const expected = n <= 4 ? 2 * n : n;
      const who: string[] = [];
      while (s.phase === 'round') {
        const v = view(s, 'p0') as unknown as { of: number; turn: number; who: string };
        expect(v.of).toBe(expected);
        expect(v.turn).toBe(s.turn);
        who.push(v.who);
        s = next(s, n);
      }
      expect(who).toHaveLength(expected);
      expect(who).toEqual(Array.from({ length: expected }, (_, t) => s.order[t % n]));
      expect(s.phase).toBe('talk');
    }
  });

  it('Sichten in round und talk: genaue Schluesselmengen je Rolle', () => {
    const n = 4;
    const s = upTo(make(n, 9), n, 'round');
    expect(keys(view(s, crewOf(s)[0] as string))).toEqual(['dur', 'endsAt', 'of', 'phase', 'turn', 'who', 'word']);
    expect(keys(view(s, traitorOf(s)))).toEqual(['cat', 'dur', 'endsAt', 'of', 'phase', 'traitor', 'turn', 'who']);
    const t = upTo(s, n, 'talk');
    expect(keys(view(t, crewOf(t)[0] as string))).toEqual(['dur', 'endsAt', 'phase', 'word']);
    expect(keys(view(t, traitorOf(t)))).toEqual(['cat', 'dur', 'endsAt', 'phase', 'traitor']);
  });

  it('Fertig nur vom aktiven Sprecher mit dem Zugindex; es schaltet sofort weiter', () => {
    const n = 4;
    const s = upTo(make(n, 9), n, 'round');
    const speaker = s.order[0] as string;
    const other = s.order[1] as string;
    expect(send(s, other, { a: 'done', turn: 0 })).toBe(s);
    expect(send(s, speaker, { a: 'done', turn: 1 })).toBe(s);
    expect(send(s, 'zz', { a: 'done', turn: 0 })).toBe(s);
    const at = s.endsAt - 1000;
    const t = send(s, speaker, { a: 'done', turn: 0 }, at);
    expect(t.turn).toBe(1);
    expect(t.phase).toBe('round');
    expect(t.endsAt).toBe(at + s.durs.turn);
    expect(send(t, speaker, { a: 'done', turn: 0 })).toBe(t);
    expect((view(t, 'p0') as { who: string }).who).toBe(other);
    expect(verraeter.result(t).has(speaker)).toBe(true);
    expect(verraeter.result(t).has(other)).toBe(false);
  });

  it('der letzte Zug fuehrt in die Diskussion, danach in die Abstimmung', () => {
    const n = 5;
    let s = upTo(make(n, 4), n, 'round');
    for (let t = 0; t < n; t++) s = send(s, s.order[t] as string, { a: 'done', turn: t }, s.endsAt - 1);
    expect(s.phase).toBe('talk');
    expect(s.dur).toBe(s.durs.talk);
    const v = next(s, n);
    expect(v.phase).toBe('vote');
    expect(v.dur).toBe(v.durs.vote);
  });

  it('Fertig ausserhalb von round wird ignoriert', () => {
    const w = make(4, 1);
    expect(send(w, w.order[0] as string, { a: 'done', turn: 0 })).toBe(w);
    const talk = upTo(w, 4, 'talk');
    expect(send(talk, talk.order[0] as string, { a: 'done', turn: 0 })).toBe(talk);
  });
});

describe('verraeter Abstimmung', () => {
  it('Sichten: genaue Schluesselmengen, mine/voted/total', () => {
    const n = 4;
    const s = upTo(make(n, 6), n, 'vote');
    const c = crewOf(s)[0] as string;
    expect(keys(view(s, c))).toEqual(['dur', 'endsAt', 'mine', 'phase', 'total', 'voted', 'word']);
    expect(keys(view(s, traitorOf(s)))).toEqual(['cat', 'dur', 'endsAt', 'mine', 'phase', 'total', 'traitor', 'voted']);
    expect(view(s, c)).toMatchObject({ mine: null, voted: 0, total: 4 });
    const t = send(s, c, { a: 'vote', to: traitorOf(s) });
    expect(view(t, c)).toMatchObject({ mine: traitorOf(s), voted: 1 });
    expect(view(t, crewOf(s)[1] as string)).toMatchObject({ mine: null, voted: 1 });
  });

  it('nicht sich selbst, nur Mitspieler, einmal und endgueltig, nur in vote', () => {
    const n = 4;
    const w = make(n, 6);
    expect(send(w, 'p0', { a: 'vote', to: 'p1' })).toBe(w);
    const s = upTo(w, n, 'vote');
    expect(send(s, 'p0', { a: 'vote', to: 'p0' })).toBe(s);
    expect(send(s, 'p0', { a: 'vote', to: 'zz' })).toBe(s);
    expect(send(s, 'zz', { a: 'vote', to: 'p0' })).toBe(s);
    const t = send(s, 'p0', { a: 'vote', to: 'p1' });
    expect(send(t, 'p0', { a: 'vote', to: 'p1' })).toBe(t);
    expect(send(t, 'p0', { a: 'vote', to: 'p2' })).toBe(t);
    expect(verraeter.result(t).has('p0')).toBe(true);
  });

  it('allDone ueber die Online-Spieler beendet die Abstimmung, Offline zaehlt nicht', () => {
    const n = 4;
    const s = upTo(make(n, 6), n, 'vote');
    const on = new Set(['p0', 'p1', 'p2']);
    let t = send(s, 'p0', { a: 'vote', to: 'p1' });
    t = send(t, 'p1', { a: 'vote', to: 'p0' });
    expect(verraeter.tick(t, NOW + 1, on)).toBe(t);
    t = send(t, 'p2', { a: 'vote', to: 'p0' });
    expect(verraeter.tick(t, NOW + 1, on).phase).not.toBe('vote');
    expect(verraeter.tick(t, NOW + 1, everyone(4))).toBe(t);
    expect(verraeter.tick(s, NOW + 1, everyone(4))).toBe(s);
    expect(next(s, n).phase).toBe('reveal');
  });

  it('nur wenn der Verraeter allein die meisten Stimmen hat, gibt es guess', () => {
    const n = 4;
    const base = make(n, 6);
    const t = traitorOf(base);
    const [c1, c2, c3] = crewOf(base) as [string, string, string];
    const run = (v: Record<string, string>) => verraeter.tick(votes(base, n, v), NOW + 1, everyone(n));
    expect(run({ [c1]: t, [c2]: t, [c3]: t, [t]: c1 }).phase).toBe('guess');
    expect(run({ [c1]: t, [c2]: t, [c3]: c1, [t]: c1 }).phase).toBe('reveal');
    expect(run({ [c1]: t, [c2]: t, [c3]: c1, [t]: c2 }).phase).toBe('guess');
    expect(run({ [c1]: t, [c2]: c1, [c3]: c1, [t]: c1 }).phase).toBe('reveal');
    expect(next(upTo(base, n, 'vote'), n).phase).toBe('reveal');
  });

  it('Gleichstand an der Spitze gilt als nicht enttarnt, auch mit dem Verraeter dabei', () => {
    const n = 4;
    const base = make(n, 6);
    const t = traitorOf(base);
    const [c1, c2, c3] = crewOf(base) as [string, string, string];
    const s = verraeter.tick(votes(base, n, { [c1]: t, [c2]: t, [c3]: c1, [t]: c1 }), NOW + 1, everyone(n));
    expect(view(s, c1)).toMatchObject({ phase: 'reveal', exposed: false, right: null });
    expect(pts(s, t)).toBe(5);
  });
});

describe('verraeter guess', () => {
  const guessState = (n = 4, seed = 6): VrState => verraeter.tick(exposeAll(make(n, seed), n), NOW + 1, everyone(n));

  it('6 Optionen: das Wort und 5 Koeder, im Zustand fixiert und stabil', () => {
    const s = guessState();
    const e = entryOf(s);
    expect(s.phase).toBe('guess');
    expect(s.opts).toHaveLength(6);
    expect([...(s.opts as string[])].sort()).toEqual([e.word, ...e.decoys].sort());
    expect(s.dur).toBe(s.durs.guess);
    const later = verraeter.tick(s, NOW + 2, everyone(4));
    expect(later).toBe(s);
    expect(view(s, traitorOf(s))).toEqual(view(s, traitorOf(s)));
  });

  it('die Wortposition variiert ueber Seeds', () => {
    const at = new Set<number>();
    for (let seed = 0; seed < 60; seed++) {
      const s = guessState(4, seed);
      at.add((s.opts as string[]).indexOf(entryOf(s).word));
    }
    expect(at.size).toBeGreaterThanOrEqual(5);
  });

  it('Sichten: Verraeter mit Optionen, Crew mit dem Enttarnten, jeweils genaue Schluesselmengen', () => {
    const s = guessState();
    const tv = view(s, traitorOf(s));
    expect(keys(tv)).toEqual(['cat', 'dur', 'endsAt', 'mine', 'opts', 'phase', 'traitor']);
    expect(tv).toMatchObject({ phase: 'guess', mine: null, opts: s.opts });
    const cv = view(s, crewOf(s)[0] as string);
    expect(keys(cv)).toEqual(['accused', 'dur', 'endsAt', 'phase', 'word']);
    expect(cv).toMatchObject({ accused: traitorOf(s) });
    expect(JSON.stringify(cv)).not.toContain('opts');
  });

  it('nur der Verraeter raet, einmal, nur ein gueltiger Index', () => {
    const s = guessState();
    const t = traitorOf(s);
    for (const c of crewOf(s)) expect(send(s, c, { a: 'guess', i: 0 })).toBe(s);
    const g = send(s, t, { a: 'guess', i: 2 });
    expect(view(g, t)).toMatchObject({ mine: 2 });
    expect(send(g, t, { a: 'guess', i: 3 })).toBe(g);
    expect(verraeter.result(g).has(t)).toBe(true);
  });

  it('ein Tipp beendet die Phase ueber allDone, ohne Tipp laeuft die Zeit', () => {
    const s = guessState();
    const t = traitorOf(s);
    const g = send(s, t, { a: 'guess', i: 0 });
    expect(verraeter.tick(g, NOW + 1, everyone(4)).phase).toBe('reveal');
    expect(verraeter.tick(s, NOW + 1, everyone(4))).toBe(s);
    expect(verraeter.tick(g, NOW + 1, new Set(crewOf(s)))).toBe(g);
    expect(next(s, 4).phase).toBe('reveal');
  });

  it('Wertung: Verraeter enttarnt, Wort erraten 2, falsch 0, kein Tipp 0; Crew +2 je Stimme gegen ihn', () => {
    const s = guessState();
    const t = traitorOf(s);
    const right = (s.opts as string[]).indexOf(entryOf(s).word);
    const wrong = (right + 1) % 6;
    const done = (i: number) => next(send(s, t, { a: 'guess', i }), 4);
    expect(pts(done(right), t)).toBe(2);
    expect(pts(done(wrong), t)).toBe(0);
    for (const c of crewOf(s)) expect(pts(done(right), c)).toBe(2);
    const silent = next(s, 4);
    expect(pts(silent, t)).toBe(0);
    expect(verraeter.label(done(right), t)).toBe('2 Pkt');
    expect(verraeter.label(done(wrong), t)).toBe('0 Pkt');
  });

  it('Aufloesung: genaue Schluesselmenge und Inhalt', () => {
    const s = guessState();
    const t = traitorOf(s);
    const right = (s.opts as string[]).indexOf(entryOf(s).word);
    const r = next(send(s, t, { a: 'guess', i: (right + 2) % 6 }), 4);
    const v = view(r, crewOf(r)[0] as string) as unknown as {
      guessed: string;
      rows: { pid: string; count: number; to: string | null }[];
    };
    expect(keys(v)).toEqual(['cat', 'culprit', 'dur', 'endsAt', 'exposed', 'guessed', 'phase', 'right', 'rows', 'word']);
    expect(v).toMatchObject({ culprit: t, exposed: true, right: false, word: entryOf(r).word, cat: entryOf(r).cat });
    expect(v.guessed).toBe((r.opts as string[])[(right + 2) % 6]);
    expect(v.rows).toHaveLength(4);
    for (const row of v.rows) expect(keys(row)).toEqual(['count', 'pid', 'to']);
    expect(v.rows.find((x) => x.pid === t)).toMatchObject({ count: 3 });
    expect(r.phase).toBe('reveal');
    expect(verraeter.done(r, r.endsAt)).toBe(true);
    expect(verraeter.done(r, r.endsAt - 1)).toBe(false);
  });
});

describe('verraeter Wertung ohne Enttarnung', () => {
  it('Verraeter 5, nur Stimmen gegen ihn geben der Crew 2; kein Eintrag ohne Eingabe', () => {
    const n = 4;
    const base = make(n, 6);
    const t = traitorOf(base);
    const [c1, c2, c3] = crewOf(base) as [string, string, string];
    const s = next(votes(base, n, { [c1]: c2, [c2]: c1, [c3]: t, [t]: c1 }), n);
    expect(s.phase).toBe('reveal');
    expect(pts(s, t)).toBe(5);
    expect(pts(s, c3)).toBe(2);
    expect(pts(s, c1)).toBe(0);
    expect(pts(s, c2)).toBe(0);
    expect(verraeter.label(s, t)).toBe('5 Pkt');
    const quiet = next(votes(base, n, { [c1]: c2 }), n);
    expect(pts(quiet, t)).toBeUndefined();
    expect(verraeter.label(quiet, t)).toBe('–');
    expect(verraeter.label(quiet, c1)).toBe('0 Pkt');
    expect(verraeter.result(next(make(n, 6), n)).size).toBe(0);
  });

  it('0 Stimmen: nicht enttarnt, nur Aufloesung', () => {
    const n = 3;
    const s = upTo(make(n, 2), n, 'vote');
    const r = next(s, n);
    expect(r.phase).toBe('reveal');
    expect(r.exposed).toBe(false);
    expect(view(r, 'p0')).toMatchObject({ exposed: false, right: null, guessed: null });
  });
});

describe('verraeter zu zweit (Doppelgaenger)', () => {
  it('Wortpaar aus der Bank, gleiches Wort in etwa der Haelfte der Seeds, Zuweisung seedbestimmt', () => {
    let same = 0;
    const p0Word = new Set<boolean>();
    for (let seed = 0; seed < 300; seed++) {
      const s = make(2, seed);
      expect(s.mode).toBe('duo');
      const e = entryOf(s);
      const [a, b] = [s.words.p0, s.words.p1] as [string, string];
      expect([e.word, e.pair]).toContain(a);
      expect([e.word, e.pair]).toContain(b);
      expect(s.same).toBe(a === b);
      if (s.same) same++;
      else p0Word.add(a === e.word);
      expect(make(2, seed)).toEqual(s);
      expect(s.traitor).toBeNull();
    }
    expect(same).toBeGreaterThan(90);
    expect(same).toBeLessThan(210);
    expect(p0Word).toEqual(new Set([true, false]));
  });

  it('Ablauf: Wort 6 s, 4 Zuege a 6 s abwechselnd, Tipp 12 s, Aufloesung 4 s', () => {
    const s = make(2, 5);
    expect(s.dur).toBe(s.durs.word);
    expect(s.turns).toBe(4);
    const who: string[] = [];
    let q = upTo(s, 2, 'round');
    expect(q.durs.duoTurn).toBe(scale(VR_DUO_TURN, 1));
    while (q.phase === 'round') {
      expect(q.dur).toBe(q.durs.duoTurn);
      who.push((view(q, 'p0') as { who: string }).who);
      q = next(q, 2);
    }
    expect(who).toEqual([q.order[0], q.order[1], q.order[0], q.order[1]]);
    expect(q.phase).toBe('vote');
    expect(q.dur).toBe(q.durs.vote);
    const r = next(q, 2);
    expect(r.phase).toBe('reveal');
    expect(verraeter.done(r, r.endsAt)).toBe(true);
    expect(r.endsAt - NOW).toBe(scale(VR_WORD + 4 * VR_DUO_TURN + VR_VOTE + VR_REVEAL, 1));
  });

  it('Sichten: eigenes Wort, nie das des Partners und nie same vor der Aufloesung', () => {
    let seeds = 0;
    for (let seed = 0; seed < 80 && seeds < 10; seed++) {
      const s0 = make(2, seed);
      if (s0.same) continue;
      seeds++;
      let s = s0;
      for (const phase of ['word', 'round', 'vote'] as const) {
        s = upTo(s, 2, phase);
        for (const [me, other] of [['p0', 'p1'], ['p1', 'p0']] as const) {
          const json = JSON.stringify(view(s, me));
          expect(json).toContain(JSON.stringify(s.words[me]));
          expect(json).not.toContain(JSON.stringify(s.words[other]));
          expect(json).not.toContain('same');
        }
      }
    }
    expect(seeds).toBe(10);
  });

  it('Schluesselmengen je Phase', () => {
    const s = make(2, 5);
    expect(keys(view(s, 'p0'))).toEqual(['dur', 'endsAt', 'phase', 'word']);
    const r = upTo(s, 2, 'round');
    expect(keys(view(r, 'p0'))).toEqual(['dur', 'endsAt', 'of', 'phase', 'turn', 'who', 'word']);
    const v = upTo(r, 2, 'vote');
    expect(keys(view(v, 'p0'))).toEqual(['dur', 'endsAt', 'mine', 'phase', 'word']);
    const rev = next(v, 2);
    const rv = view(rev, 'p0') as unknown as { rows: object[] };
    expect(keys(rv)).toEqual(['dur', 'endsAt', 'phase', 'rows', 'same']);
    for (const row of rv.rows) expect(keys(row)).toEqual(['pid', 'right', 'tip', 'word']);
  });

  it('Fertig nur vom Sprecher des Zuges; Tipp einmal, nur in vote; allDone beendet die Phase', () => {
    const s = upTo(make(2, 5), 2, 'round');
    const sp = s.order[0] as string;
    const other = s.order[1] as string;
    expect(send(s, other, { a: 'done', turn: 0 })).toBe(s);
    expect(send(s, sp, { a: 'tip', same: true })).toBe(s);
    const t = send(s, sp, { a: 'done', turn: 0 }, s.endsAt - 1);
    expect(t.turn).toBe(1);
    const v = upTo(t, 2, 'vote');
    const a = send(v, 'p0', { a: 'tip', same: true });
    expect(view(a, 'p0')).toMatchObject({ mine: true });
    expect(send(a, 'p0', { a: 'tip', same: false })).toBe(a);
    expect(verraeter.tick(a, NOW + 1, everyone(2))).toBe(a);
    const b = send(a, 'p1', { a: 'tip', same: false });
    expect(verraeter.tick(b, NOW + 1, everyone(2)).phase).toBe('reveal');
    expect(send(v, 'p0', { a: 'vote', to: 'p1' })).toBe(v);
  });

  it('Wertung: richtige Antwort 2 Punkte, falsche 0, Label n Pkt', () => {
    for (let seed = 0; seed < 20; seed++) {
      const v = upTo(make(2, seed), 2, 'vote');
      const s = next(send(send(v, 'p0', { a: 'tip', same: true }), 'p1', { a: 'tip', same: false }), 2);
      expect(verraeter.tick(s, NOW, everyone(2))).toBe(s);
      expect(pts(s, 'p0')).toBe(v.same ? 2 : 0);
      expect(pts(s, 'p1')).toBe(v.same ? 0 : 2);
      expect(verraeter.label(s, 'p0')).toBe(v.same ? '2 Pkt' : '0 Pkt');
      const rv = view(s, 'p0') as { same: boolean; rows: { pid: string; right: boolean; tip: boolean | null; word: string }[] };
      expect(rv.same).toBe(v.same);
      expect(rv.rows.find((x) => x.pid === 'p0')).toMatchObject({ right: v.same, tip: true, word: v.words.p0 });
    }
  });

  it('Teilnahme: nur die erste Eingabe erzeugt einen Eintrag; ohne Eingaben gibt es keinen', () => {
    const v = upTo(make(2, 3), 2, 'vote');
    const s = send(v, 'p0', { a: 'tip', same: true });
    expect(verraeter.result(s).has('p0')).toBe(true);
    expect(verraeter.result(s).has('p1')).toBe(false);
    expect(verraeter.label(s, 'p1')).toBe('–');
    expect(verraeter.result(next(next(v, 2), 2)).size).toBe(0);
  });
});

describe('verraeter allein (dev)', () => {
  it('nur Wort und Aufloesung, ohne Wurf; Eingaben werden ignoriert', () => {
    const s = make(1, 5);
    expect(s.mode).toBe('solo');
    expect(keys(view(s, 'p0'))).toEqual(['dur', 'endsAt', 'phase', 'word']);
    expect(view(s, 'p0')).toMatchObject({ word: entryOf(s).word });
    for (const raw of [{ a: 'done', turn: 0 }, { a: 'vote', to: 'p0' }, { a: 'tip', same: true }, { a: 'guess', i: 0 }])
      expect(send(s, 'p0', raw)).toBe(s);
    const r = next(s, 1);
    expect(r.phase).toBe('reveal');
    expect(keys(view(r, 'p0'))).toEqual(['cat', 'dur', 'endsAt', 'phase', 'word']);
    expect(verraeter.done(r, r.endsAt)).toBe(true);
    expect(r.endsAt - NOW).toBe(scale(VR_WORD + VR_REVEAL, 1));
    expect(verraeter.result(r).size).toBe(0);
    expect(verraeter.label(r, 'p0')).toBe('–');
  });
});

describe('verraeter Zeiten', () => {
  it('Konstanten', () => {
    expect([VR_WORD, VR_TURN, VR_TALK, VR_VOTE, VR_GUESS, VR_REVEAL, VR_DUO_TURN]).toEqual([6000, 5000, 15000, 12000, 10000, 4000, 6000]);
  });

  it('8 Spieler im Leerlauf: Wort, 8 Zuege, Diskussion, Abstimmung, Aufloesung', () => {
    const s = make(8, 1);
    const total = scale(VR_WORD + 8 * VR_TURN + VR_TALK + VR_VOTE + VR_REVEAL, 1);
    let q = s;
    let t = NOW;
    while (!verraeter.done(q, t)) {
      t = q.endsAt;
      q = verraeter.tick(q, t, everyone(8));
    }
    expect(t - NOW).toBe(total);
  });
});
