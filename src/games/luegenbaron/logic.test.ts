import { describe, expect, it } from 'vitest';
import { LB_CARD, LB_REVEAL, LB_TELL, LB_VOTE, scale } from '../../engine/durations';
import { turnOrder } from '../common';
import { luegenbaron, type LbState, type LbView } from './logic';
import { TOPICS } from './topics';

const NOW = 5000;
const players = (n: number) => Array.from({ length: n }, (_, i) => ({ pid: `p${i}`, name: `P${i}`, color: i }));
const pidsOf = (n: number) => players(n).map((p) => p.pid);
const make = (n = 3, seed = 3, speed = 1): LbState => luegenbaron.init(players(n), seed, NOW, { speed, drinking: false });
const everyone = (n: number) => new Set(pidsOf(n));
const send = (s: LbState, pid: string, raw: unknown, now = NOW): LbState => {
  const i = luegenbaron.parseInput(raw);
  if (i === null) throw new Error(`ungueltig: ${JSON.stringify(raw)}`);
  return luegenbaron.input(s, pid, i, now);
};
const view = (s: LbState, pid: string): LbView => luegenbaron.view(s, pid, NOW);
const keys = (v: unknown): string[] => Object.keys(v as object).sort();
const nextPhase = (s: LbState, n: number): LbState => luegenbaron.tick(s, s.endsAt, everyone(n));
const narrator = (s: LbState, k = s.k): string => s.narrators[k] as string;
const listeners = (s: LbState, k = s.k): string[] => s.pids.filter((p) => p !== narrator(s, k));
const topicOf = (i: number): string => (TOPICS[i] as { topic: string }).topic;

const tell = (s: LbState, n: number): LbState => nextPhase(s, n);
const vote = (s: LbState, n: number): LbState => nextPhase(tell(s, n), n);

describe('luegenbaron init', () => {
  it('Erzaehler sind die ersten min(2, n) aus turnOrder: n=1 einer, n=2 beide, ab 3 zwei', () => {
    for (let seed = 0; seed < 30; seed++) {
      for (const n of [1, 2, 3, 5, 8]) {
        const s = make(n, seed);
        expect(s.narrators).toEqual(turnOrder(seed, pidsOf(n)).slice(0, Math.min(2, n)));
        expect(s.narrators).toHaveLength(Math.min(2, n));
        expect(new Set(s.narrators).size).toBe(s.narrators.length);
      }
    }
    expect(new Set(make(2, 5).narrators)).toEqual(new Set(['p0', 'p1']));
  });

  it('beginnt in der Kartenphase bei k=0, je Erzaehler zwei verschiedene Themen, alle verschieden', () => {
    for (let seed = 0; seed < 40; seed++) {
      for (const n of [1, 2, 4]) {
        const s = make(n, seed);
        expect(s.phase).toBe('card');
        expect(s.k).toBe(0);
        expect(s.topics).toHaveLength(s.narrators.length);
        const all = s.topics.flat();
        expect(new Set(all).size).toBe(all.length);
        for (const i of all) expect(TOPICS[i]).toBeDefined();
        expect(make(n, seed).topics).toEqual(s.topics);
      }
    }
  });

  it('ohne Wahl setzt der Seed den Modus, ueber Seeds kommen beide Modi vor', () => {
    const seen = new Set<boolean>();
    for (let seed = 0; seed < 100; seed++) for (const b of make(3, seed).dflt) seen.add(b);
    expect(seen).toEqual(new Set([true, false]));
  });

  for (const speed of [1, 10])
    it(`Dauern laufen durch scale, keine GRACE (speed ${speed})`, () => {
      const s = make(3, 3, speed);
      expect(s.endsAt).toBe(NOW + scale(LB_CARD, speed));
      expect(s.durs).toEqual({
        card: scale(LB_CARD, speed),
        tell: scale(LB_TELL, speed),
        vote: scale(LB_VOTE, speed),
        reveal: scale(LB_REVEAL, speed),
      });
      const all = 2 * (s.durs.card + s.durs.tell + s.durs.vote + s.durs.reveal);
      let q = s;
      let t = NOW;
      for (let i = 0; i < 7; i++) {
        expect(luegenbaron.done(q, t)).toBe(false);
        t = q.endsAt;
        q = luegenbaron.tick(q, t, everyone(3));
      }
      expect(q).toMatchObject({ phase: 'reveal', k: 1 });
      expect(t - NOW).toBe(all - s.durs.reveal);
      expect(luegenbaron.done(q, t + s.durs.reveal - 1)).toBe(false);
      expect(luegenbaron.done(q, t + s.durs.reveal)).toBe(true);
    });
});

describe('luegenbaron parseInput', () => {
  it('nimmt die vier Eingaben an, truth nur als Boolean', () => {
    expect(luegenbaron.parseInput({ a: 'mode', k: 0, truth: true })).not.toBeNull();
    expect(luegenbaron.parseInput({ a: 'mode', k: 1, truth: false })).not.toBeNull();
    expect(luegenbaron.parseInput({ a: 'swap', k: 0 })).not.toBeNull();
    expect(luegenbaron.parseInput({ a: 'done', k: 1 })).not.toBeNull();
    expect(luegenbaron.parseInput({ a: 'tip', k: 0, truth: true })).not.toBeNull();
  });

  it('lehnt Ungueltiges ab', () => {
    for (const bad of [
      { a: 'mode', k: 0 },
      { a: 'mode', k: 0, truth: 'ja' },
      { a: 'tip', k: 0 },
      { a: 'tip', k: 0, truth: 1 },
      { a: 'swap', k: 2 },
      { a: 'swap', k: -1 },
      { a: 'swap', k: 0.5 },
      { a: 'done', k: '0' },
      { a: 'done' },
      { a: 'boom', k: 0 },
      { k: 0, truth: true },
    ])
      expect(luegenbaron.parseInput(bad), JSON.stringify(bad)).toBeNull();
  });
});

describe('luegenbaron Karte', () => {
  it('Erzaehler-Sicht: genaue Schluesselmenge, Modus null bis zur Wahl, Tausch moeglich', () => {
    const s = make();
    const v = view(s, narrator(s)) as Extract<LbView, { role: 'narrator'; phase: 'card' }>;
    expect(keys(v)).toEqual(['canSwap', 'dur', 'endsAt', 'k', 'mode', 'of', 'phase', 'role', 'topic', 'who']);
    expect(v).toMatchObject({ phase: 'card', role: 'narrator', k: 0, of: 2, who: narrator(s), mode: null, canSwap: true });
    expect(v.topic).toBe(topicOf((s.topics[0] as [number, number])[0]));
    expect(v.endsAt).toBe(s.endsAt);
    expect(v.dur).toBe(s.dur);
  });

  it('Zuhoerer-Sicht: genaue Schluesselmenge ohne Modus, mit demselben Thema', () => {
    const s = make();
    const nar = view(s, narrator(s)) as { topic: string };
    for (const pid of listeners(s)) {
      const v = view(s, pid);
      expect(keys(v)).toEqual(['dur', 'endsAt', 'k', 'of', 'phase', 'role', 'topic', 'who']);
      expect(v).toMatchObject({ phase: 'card', role: 'listener', who: narrator(s) });
      expect((v as { topic: string }).topic).toBe(nar.topic);
    }
  });

  it('die Wahl gilt einmal und endgueltig, danach zeigt die Sicht den Modus', () => {
    const s = make();
    const a = send(s, narrator(s), { a: 'mode', k: 0, truth: true });
    expect((view(a, narrator(a)) as { mode: boolean | null }).mode).toBe(true);
    expect(send(a, narrator(a), { a: 'mode', k: 0, truth: true })).toBe(a);
    expect(send(a, narrator(a), { a: 'mode', k: 0, truth: false })).toBe(a);
    expect(a.truth[0]).toBe(true);
  });

  it('Andere Karte: einmal je Erzaehler, nur vor der Wahl, Ersatzthema steht seit init fest', () => {
    const s = make();
    const [first, second] = s.topics[0] as [number, number];
    const a = send(s, narrator(s), { a: 'swap', k: 0 });
    const v = view(a, narrator(a)) as { topic: string; canSwap: boolean };
    expect(v.topic).toBe(topicOf(second));
    expect(v.canSwap).toBe(false);
    expect(v.topic).not.toBe(topicOf(first));
    expect((view(a, listeners(a)[0] as string) as { topic: string }).topic).toBe(topicOf(second));
    expect(send(a, narrator(a), { a: 'swap', k: 0 })).toBe(a);
    expect(a.topics).toEqual(s.topics);

    const chosen = send(s, narrator(s), { a: 'mode', k: 0, truth: false });
    expect(send(chosen, narrator(chosen), { a: 'swap', k: 0 })).toBe(chosen);
    expect((view(chosen, narrator(chosen)) as { canSwap: boolean }).canSwap).toBe(false);

    const both = send(a, narrator(a), { a: 'mode', k: 0, truth: true });
    expect(both.truth[0]).toBe(true);
  });

  it('nur der Erzaehler des aktuellen k darf waehlen oder tauschen, nur in der Kartenphase', () => {
    const s = make();
    for (const pid of listeners(s)) {
      expect(send(s, pid, { a: 'mode', k: 0, truth: true })).toBe(s);
      expect(send(s, pid, { a: 'swap', k: 0 })).toBe(s);
      expect(send(s, pid, { a: 'done', k: 0 })).toBe(s);
    }
    expect(send(s, narrator(s), { a: 'mode', k: 1, truth: true })).toBe(s);
    expect(send(s, narrator(s), { a: 'swap', k: 1 })).toBe(s);
    expect(send(s, narrator(s), { a: 'tip', k: 0, truth: true })).toBe(s);
    expect(send(s, narrator(s), { a: 'done', k: 0 })).toBe(s);
    expect(send(s, narrator(s, 1), { a: 'mode', k: 0, truth: true })).toBe(s);
    expect(send(s, 'zz', { a: 'mode', k: 0, truth: true })).toBe(s);
  });

  it('die Karte laeuft immer voll: weder Wahl noch Alle-fertig beenden sie frueher', () => {
    const base = make();
    let s = send(base, narrator(base), { a: 'mode', k: 0, truth: true });
    expect(luegenbaron.tick(s, s.endsAt - 1, everyone(3))).toBe(s);
    s = luegenbaron.tick(s, s.endsAt, everyone(3));
    expect(s.phase).toBe('tell');
    expect(s.endsAt).toBe(NOW + s.durs.card + s.durs.tell);
  });

  it('ohne Wahl setzt das Ende der Karte den Seed-Modus, eine Wahl schlaegt den Seed', () => {
    for (let seed = 0; seed < 20; seed++) {
      const s = make(3, seed);
      expect(tell(s, 3).truth[0]).toBe(s.dflt[0]);
      const other = send(s, narrator(s), { a: 'mode', k: 0, truth: !s.dflt[0] });
      expect(tell(other, 3).truth[0]).toBe(!s.dflt[0]);
    }
  });

  it('ein Seed-Default ist keine Teilnahme, die erste Eingabe schon', () => {
    const s = make();
    expect(luegenbaron.result(tell(s, 3)).size).toBe(0);
    const swapped = send(s, narrator(s), { a: 'swap', k: 0 });
    expect(luegenbaron.result(swapped).has(narrator(s))).toBe(true);
    expect(luegenbaron.label(swapped, narrator(s))).toMatch(/^\d+ Pkt$/);
    expect(luegenbaron.label(swapped, listeners(s)[0] as string)).toBe('–');
  });
});

describe('luegenbaron Erzaehlen', () => {
  it('Erzaehler sieht seinen Modus auch dann, wenn ihn der Seed gewaehlt hat', () => {
    for (let seed = 0; seed < 30; seed++) {
      const s = tell(make(3, seed), 3);
      const v = view(s, narrator(s)) as { mode: boolean };
      expect(keys(v)).toEqual(['dur', 'endsAt', 'k', 'mode', 'of', 'phase', 'role', 'topic', 'who']);
      expect(v.mode).toBe(s.truth[0]);
      expect(typeof v.mode).toBe('boolean');
    }
  });

  it('Zuhoerer-Sicht in tell: genaue Schluesselmenge ohne Wahrheit', () => {
    const base = make();
    const s = tell(send(base, narrator(base), { a: 'mode', k: 0, truth: false }), 3);
    for (const pid of listeners(s)) {
      const v = view(s, pid);
      expect(keys(v)).toEqual(['dur', 'endsAt', 'k', 'of', 'phase', 'role', 'topic', 'who']);
      expect(v).toMatchObject({ phase: 'tell', role: 'listener' });
    }
  });

  it('Fertig nur vom Erzaehler mit passendem k, es springt sofort in die Tippphase', () => {
    const s = tell(make(), 3);
    for (const pid of listeners(s)) expect(send(s, pid, { a: 'done', k: 0 }, s.endsAt - 5)).toBe(s);
    expect(send(s, narrator(s), { a: 'done', k: 1 })).toBe(s);
    const at = NOW + 10_000;
    const v = send(s, narrator(s), { a: 'done', k: 0 }, at);
    expect(v.phase).toBe('vote');
    expect(v.endsAt).toBe(at + s.durs.vote);
    expect(luegenbaron.result(v).has(narrator(s))).toBe(true);
  });

  it('Fertig des zweiten Erzaehlers im ersten Schritt zaehlt nicht', () => {
    const s = tell(make(), 3);
    expect(send(s, narrator(s, 1), { a: 'done', k: 0 })).toBe(s);
    expect(send(s, narrator(s, 1), { a: 'done', k: 1 })).toBe(s);
  });

  it('ohne Fertig endet tell nach der Zeit, Tipps und Wahl sind jetzt zu', () => {
    const s = tell(make(), 3);
    expect(luegenbaron.tick(s, s.endsAt - 1, everyone(3))).toBe(s);
    expect(send(s, narrator(s), { a: 'mode', k: 0, truth: true })).toBe(s);
    expect(send(s, listeners(s)[0] as string, { a: 'tip', k: 0, truth: true })).toBe(s);
    expect(nextPhase(s, 3).phase).toBe('vote');
  });
});

describe('luegenbaron Tippen', () => {
  const asVote = (n = 3, seed = 3): LbState => vote(make(n, seed), n);

  it('Sichten: Zuhoerer mine/voted/total ohne Wahrheit, Erzaehler mit Modus', () => {
    const s = asVote(4);
    const l = view(s, listeners(s)[0] as string);
    expect(keys(l)).toEqual(['dur', 'endsAt', 'k', 'mine', 'of', 'phase', 'role', 'topic', 'total', 'voted', 'who']);
    expect(l).toMatchObject({ phase: 'vote', role: 'listener', mine: null, voted: 0, total: 3 });
    const nar = view(s, narrator(s));
    expect(keys(nar)).toEqual(['dur', 'endsAt', 'k', 'mode', 'of', 'phase', 'role', 'topic', 'total', 'voted', 'who']);
    expect(nar).toMatchObject({ phase: 'vote', role: 'narrator', mode: s.truth[0], voted: 0, total: 3 });
  });

  it('ein Tipp wird einmal und endgueltig angenommen, die eigene Sicht zeigt ihn, fremde nur die Zahl', () => {
    const s = asVote(4);
    const [a, b] = listeners(s) as [string, string];
    const t = send(s, a, { a: 'tip', k: 0, truth: true });
    expect(view(t, a)).toMatchObject({ mine: true, voted: 1 });
    expect(view(t, b)).toMatchObject({ mine: null, voted: 1 });
    expect(JSON.stringify(view(t, b))).not.toContain('true');
    expect(send(t, a, { a: 'tip', k: 0, truth: true })).toBe(t);
    expect(send(t, a, { a: 'tip', k: 0, truth: false })).toBe(t);
    expect(luegenbaron.result(t).has(a)).toBe(true);
    expect(luegenbaron.result(t).has(b)).toBe(false);
  });

  it('der Erzaehler tippt nicht, falsches k oder falsche Phase wird ignoriert', () => {
    const s = asVote();
    expect(send(s, narrator(s), { a: 'tip', k: 0, truth: true })).toBe(s);
    expect(send(s, listeners(s)[0] as string, { a: 'tip', k: 1, truth: true })).toBe(s);
    expect(send(s, 'zz', { a: 'tip', k: 0, truth: true })).toBe(s);
    const early = make();
    expect(send(early, listeners(early)[0] as string, { a: 'tip', k: 0, truth: true })).toBe(early);
  });

  it('allDone ueber die Online-Zuhoerer beendet die Phase, Offline zaehlt nicht, ohne Tipps nur die Zeit', () => {
    const s = asVote(4);
    const [a, b, c] = listeners(s) as [string, string, string];
    const online = new Set([narrator(s), a, b]);
    let t = send(s, a, { a: 'tip', k: 0, truth: true });
    expect(luegenbaron.tick(t, NOW + 1, online)).toBe(t);
    t = send(t, b, { a: 'tip', k: 0, truth: false });
    expect(luegenbaron.tick(t, NOW + 1, online).phase).toBe('reveal');
    expect(luegenbaron.tick(t, NOW + 1, new Set([narrator(s), a, b, c])).phase).toBe('vote');
    expect(luegenbaron.tick(s, NOW + 1, new Set([narrator(s)]))).toBe(s);
    expect(luegenbaron.tick(s, NOW + 1, everyone(4))).toBe(s);
    expect(nextPhase(s, 4).phase).toBe('reveal');
  });
});

describe('luegenbaron Aufloesung und Wertung', () => {
  const lie = (s: LbState): LbState => send(s, narrator(s), { a: 'mode', k: 0, truth: false });
  const reveal = (s: LbState, tips: Record<string, boolean>, n: number): LbState => {
    let q = vote(s, n);
    for (const [pid, truth] of Object.entries(tips)) q = send(q, pid, { a: 'tip', k: 0, truth });
    return nextPhase(q, n);
  };
  const pts = (s: LbState, pid: string) => luegenbaron.result(s).get(pid);

  it('Sicht: Wahrheit, Zeilen und "reingelegt" nur aus dem Host', () => {
    const s0 = lie(make(4));
    const [a, b, c] = listeners(s0) as [string, string, string];
    const s = reveal(s0, { [a]: true, [b]: false }, 4);
    const v = view(s, c) as Extract<LbView, { phase: 'reveal' }>;
    expect(keys(v)).toEqual(['dur', 'endsAt', 'fooled', 'k', 'of', 'phase', 'role', 'rows', 'topic', 'total', 'truth', 'who']);
    expect(v).toMatchObject({ phase: 'reveal', role: 'listener', truth: false, fooled: 1, total: 3 });
    expect(v.rows).toHaveLength(3);
    for (const r of v.rows) expect(keys(r)).toEqual(['pid', 'right', 'tip']);
    expect(v.rows.find((r) => r.pid === a)).toEqual({ pid: a, tip: true, right: false });
    expect(v.rows.find((r) => r.pid === b)).toEqual({ pid: b, tip: false, right: true });
    expect(v.rows.find((r) => r.pid === c)).toEqual({ pid: c, tip: null, right: false });
    expect(view(s, narrator(s))).toMatchObject({ role: 'narrator', truth: false, fooled: 1 });
  });

  it('Zuhoerer +1 je richtigem Tipp, Erzaehler +1 je getaeuschtem Zuhoerer, Nichttipper sind nicht getaeuscht', () => {
    const s0 = lie(make(4));
    const [a, b, c] = listeners(s0) as [string, string, string];
    const s = reveal(s0, { [a]: true, [b]: false }, 4);
    expect(pts(s, a)).toBe(0);
    expect(pts(s, b)).toBe(1);
    expect(pts(s, narrator(s))).toBe(1);
    expect(pts(s, c)).toBeUndefined();
  });

  it('der Erzaehler mit eigener Eingabe bekommt seinen Punkt je Getaeuschtem, ohne Eingabe keinen Eintrag', () => {
    const base = lie(make(4));
    const [a, b] = listeners(base) as [string, string];
    const s = reveal(base, { [a]: true, [b]: true }, 4);
    expect(pts(s, narrator(s))).toBe(2);
    expect(luegenbaron.label(s, narrator(s))).toBe('2 Pkt');
    const silent = reveal(make(4), { [a]: true, [b]: true }, 4);
    expect(luegenbaron.result(silent).has(narrator(silent))).toBe(false);
    expect(luegenbaron.label(silent, narrator(silent))).toBe('–');
    expect(pts(silent, a)).toBe(silent.truth[0] === true ? 1 : 0);
  });

  it('Wahrheit: ein Tipp WAHR ist richtig, der Erzaehler hat niemanden getaeuscht', () => {
    const fresh = make(3);
    const base = send(fresh, narrator(fresh), { a: 'mode', k: 0, truth: true });
    const [a, b] = listeners(base) as [string, string];
    const s = reveal(base, { [a]: true, [b]: false }, 3);
    expect(pts(s, a)).toBe(1);
    expect(pts(s, b)).toBe(0);
    expect(pts(s, narrator(s))).toBe(1);
  });

  it('Duo: beide erzaehlen und lügen, beide tippen WAHR: beide 1 Pkt', () => {
    let s = make(2, 9);
    const [x, y] = s.narrators as [string, string];
    s = send(s, x, { a: 'mode', k: 0, truth: false });
    s = nextPhase(nextPhase(s, 2), 2);
    expect(listeners(s)).toEqual([y]);
    s = send(s, y, { a: 'tip', k: 0, truth: true });
    s = nextPhase(s, 2);
    expect(s.phase).toBe('reveal');
    s = nextPhase(s, 2);
    expect(s.phase).toBe('card');
    expect(s.k).toBe(1);
    expect(view(s, y)).toMatchObject({ role: 'narrator', who: y, k: 1 });
    expect(view(s, x)).toMatchObject({ role: 'listener', who: y });
    s = send(s, y, { a: 'mode', k: 1, truth: false });
    s = nextPhase(nextPhase(s, 2), 2);
    s = send(s, x, { a: 'tip', k: 1, truth: true });
    s = nextPhase(s, 2);
    expect(luegenbaron.result(s).get(x)).toBe(1);
    expect(luegenbaron.result(s).get(y)).toBe(1);
    expect(luegenbaron.label(s, x)).toBe('1 Pkt');
    expect(luegenbaron.label(s, y)).toBe('1 Pkt');
  });

  it('die Rolle ist je Schritt konstant (ueber alle vier Phasen), die Schrittzahl ist k', () => {
    let s = make(3);
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      seen.push(`${(view(s, 'p0') as { role: string }).role}${(view(s, 'p0') as { k: number }).k}`);
      s = nextPhase(s, 3);
    }
    expect(new Set(seen).size).toBe(1);
  });

  it('zweiter Erzaehler: eigener Schritt mit eigenem Thema, Tipps des ersten Schritts zaehlen nicht doppelt', () => {
    let s = make(3, 4);
    const [x, y] = s.narrators as [string, string];
    s = vote(s, 3);
    const l0 = listeners(s)[0] as string;
    s = send(s, l0, { a: 'tip', k: 0, truth: true });
    s = nextPhase(nextPhase(s, 3), 3);
    expect(s).toMatchObject({ phase: 'card', k: 1 });
    expect((view(s, y) as { topic: string }).topic).toBe(topicOf((s.topics[1] as [number, number])[0]));
    expect(send(s, x, { a: 'mode', k: 1, truth: true })).toBe(s);
    expect(send(s, l0, { a: 'tip', k: 0, truth: false })).toBe(s);
  });

  it('n=1: ein Erzaehler, keine Zuhoerer, die Runde endet ohne Eingaben nach der Auflösung', () => {
    let s = make(1, 2);
    expect(s.narrators).toEqual(['p0']);
    expect((view(s, 'p0') as { role: string }).role).toBe('narrator');
    s = vote(s, 1);
    expect(view(s, 'p0')).toMatchObject({ phase: 'vote', total: 0, voted: 0 });
    s = nextPhase(s, 1);
    expect(s.phase).toBe('reveal');
    expect(luegenbaron.done(s, s.endsAt)).toBe(true);
    expect(view(s, 'p0')).toMatchObject({ fooled: 0, total: 0, rows: [] });
  });

  it('result ist vor der Auflösung des zweiten Schritts nur eine Teilsumme und wirft nie', () => {
    const s = make(3);
    expect(() => luegenbaron.result(s)).not.toThrow();
    expect(luegenbaron.result(s).size).toBe(0);
  });
});
