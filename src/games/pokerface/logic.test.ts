import { describe, expect, it } from 'vitest';
import { PF_GUESS, PF_MISSION, PF_REVEAL, PF_TALK, scale } from '../../engine/durations';
import { ringNext, turnOrder } from '../common';
import { pokerface, type PfState, type PfView } from './logic';
import { MISSIONS, TOPICS } from './missions';

const NOW = 5000;
const players = (n: number) => Array.from({ length: n }, (_, i) => ({ pid: `p${i}`, name: `P${i}`, color: i }));
const pidsOf = (n: number) => players(n).map((p) => p.pid);
const make = (n = 3, seed = 3, speed = 1): PfState => pokerface.init(players(n), seed, NOW, { speed, drinking: false });
const everyone = (n: number) => new Set(pidsOf(n));
const send = (s: PfState, pid: string, raw: unknown, now = NOW): PfState => {
  const i = pokerface.parseInput(raw);
  if (i === null) throw new Error(`ungueltig: ${JSON.stringify(raw)}`);
  return pokerface.input(s, pid, i, now);
};
const view = (s: PfState, pid: string): PfView => pokerface.view(s, pid, NOW);
const keys = (v: unknown): string[] => Object.keys(v as object).sort();
const next = (s: PfState, n: number): PfState => pokerface.tick(s, s.endsAt, everyone(n));
const upTo = (s: PfState, n: number, phase: PfState['phase']): PfState => {
  let q = s;
  for (let i = 0; q.phase !== phase && i < 10; i++) q = next(q, n);
  return q;
};
const target = (s: PfState, pid: string): string => ringNext(s.order, pid) as string;
const rater = (s: PfState, pid: string): string => s.order[(s.order.indexOf(pid) + s.order.length - 1) % s.order.length] as string;
const text = (s: PfState, pid: string): string => (MISSIONS[s.missions[pid] as number] as { mission: string }).mission;
const wrong = (s: PfState, pid: string): number => ((s.answer[pid] as number) + 1) % 4;

interface Play {
  done?: string[];
  right?: string[];
  wrong?: string[];
}

function played(n: number, seed: number, o: Play): PfState {
  let s = upTo(make(n, seed), n, 'talk');
  for (const p of o.done ?? []) s = send(s, p, { a: 'done' });
  s = upTo(s, n, 'guess');
  for (const p of o.right ?? []) s = send(s, p, { a: 'tip', i: s.answer[p] });
  for (const p of o.wrong ?? []) s = send(s, p, { a: 'tip', i: wrong(s, p) });
  return upTo(s, n, 'reveal');
}

const pts = (s: PfState, pid: string) => pokerface.result(s).get(pid);

describe('pokerface init', () => {
  it('Ring = turnOrder(seed, pids), Ziel = ringNext, zu zweit gegenseitig', () => {
    for (let seed = 0; seed < 20; seed++)
      for (const n of [1, 2, 3, 5, 8]) {
        const s = make(n, seed);
        expect(s.order).toEqual(turnOrder(seed, pidsOf(n)));
        if (n === 2) {
          expect(target(s, 'p0')).toBe('p1');
          expect(target(s, 'p1')).toBe('p0');
        }
        if (n >= 2) for (const p of pidsOf(n)) expect(rater(s, target(s, p))).toBe(p);
      }
  });

  it('beginnt in der Missionsphase, Dauern laufen durch scale, keine GRACE je Phase (speed 1 und 10)', () => {
    for (const speed of [1, 10]) {
      const s = make(3, 3, speed);
      expect(s.phase).toBe('mission');
      expect(s.endsAt).toBe(NOW + scale(PF_MISSION, speed));
      expect(s.durs).toEqual({
        mission: scale(PF_MISSION, speed),
        talk: scale(PF_TALK, speed),
        guess: scale(PF_GUESS, speed),
        reveal: scale(PF_REVEAL, speed),
      });
      let q = s;
      let t = NOW;
      for (const phase of ['talk', 'guess', 'reveal'] as const) {
        expect(pokerface.done(q, t)).toBe(false);
        t = q.endsAt;
        q = pokerface.tick(q, t, everyone(3));
        expect(q.phase).toBe(phase);
        expect(q.dur).toBe(s.durs[phase]);
        expect(q.endsAt).toBe(t + s.durs[phase]);
      }
      expect(t - NOW).toBe(s.durs.mission + s.durs.talk + s.durs.guess);
      expect(pokerface.done(q, q.endsAt - 1)).toBe(false);
      expect(pokerface.done(q, q.endsAt)).toBe(true);
    }
  });

  it('Missionen einer Runde sind alle verschieden und kommen aus der Bank', () => {
    for (let seed = 0; seed < 60; seed++)
      for (const n of [1, 2, 3, 5, 8]) {
        const s = make(n, seed);
        const idx = pidsOf(n).map((p) => s.missions[p] as number);
        expect(new Set(idx).size).toBe(n);
        for (const i of idx) expect(MISSIONS[i]).toBeDefined();
        expect(TOPICS[s.topic]).toBeDefined();
      }
  });

  it('Optionen: 4 je Rater, die richtige ist die Ziel-Mission, kein Koeder ist die Mission eines Mitspielers, alle Koeder verschieden', () => {
    for (let seed = 0; seed < 60; seed++)
      for (const n of [2, 3, 5, 8]) {
        const s = make(n, seed);
        const missions = pidsOf(n).map((p) => text(s, p));
        const decoys: string[] = [];
        for (const r of pidsOf(n)) {
          const opts = s.opts[r] as string[];
          expect(opts, `${r}`).toHaveLength(4);
          expect(new Set(opts).size).toBe(4);
          expect(opts[s.answer[r] as number]).toBe(text(s, target(s, r)));
          for (const [i, o] of opts.entries()) if (i !== s.answer[r]) decoys.push(o);
        }
        for (const d of decoys) expect(missions, `Koeder ${d}`).not.toContain(d);
        expect(new Set(decoys).size).toBe(decoys.length);
        expect(decoys).toHaveLength(3 * n);
      }
  });

  it('die Position der richtigen Option variiert ueber Seeds und nutzt alle vier Plaetze', () => {
    const at = new Set<number>();
    for (let seed = 0; seed < 60; seed++) for (const a of Object.values(make(3, seed).answer)) at.add(a);
    expect(at).toEqual(new Set([0, 1, 2, 3]));
  });

  it('n=1: keine Optionen, kein Rater', () => {
    const s = make(1, 4);
    expect(s.opts).toEqual({});
    expect(s.answer).toEqual({});
    expect(s.order).toEqual(['p0']);
  });

  it('init ist deterministisch', () => {
    expect(make(5, 9)).toEqual(make(5, 9));
    expect(make(5, 9)).not.toEqual(make(5, 10));
  });
});

describe('pokerface parseInput', () => {
  it('nimmt done und tip mit Index 0 bis 3 an', () => {
    expect(pokerface.parseInput({ a: 'done' })).not.toBeNull();
    for (const i of [0, 1, 2, 3]) expect(pokerface.parseInput({ a: 'tip', i })).not.toBeNull();
  });

  it('lehnt Ungueltiges ab', () => {
    for (const bad of [
      { a: 'tip' },
      { a: 'tip', i: 4 },
      { a: 'tip', i: -1 },
      { a: 'tip', i: 1.5 },
      { a: 'tip', i: '1' },
      { a: 'boom' },
      { done: true },
      { i: 1 },
    ])
      expect(pokerface.parseInput(bad), JSON.stringify(bad)).toBeNull();
  });
});

describe('pokerface Mission', () => {
  it('Sicht: genaue Schluesselmenge, eigene Mission, eigenes Ziel, gemeinsames Thema', () => {
    const s = make(4, 6);
    for (const p of pidsOf(4)) {
      const v = view(s, p);
      expect(keys(v)).toEqual(['dur', 'endsAt', 'mission', 'phase', 'target', 'topic']);
      expect(v).toMatchObject({
        phase: 'mission',
        mission: text(s, p),
        target: target(s, p),
        topic: (TOPICS[s.topic] as { topic: string }).topic,
        endsAt: s.endsAt,
        dur: s.dur,
      });
    }
  });

  it('n=1: Ziel null; unbekannte pid wirft nicht und sieht keine Mission', () => {
    const s = make(1, 4);
    expect(view(s, 'p0')).toMatchObject({ target: null, mission: text(s, 'p0') });
    const u = make(3, 4);
    expect(() => view(u, 'zz')).not.toThrow();
    for (const p of pidsOf(3)) expect(JSON.stringify(view(u, 'zz'))).not.toContain(text(u, p));
  });

  it('ERLEDIGT gilt in der Missionsphase noch nicht', () => {
    const s = make();
    expect(send(s, 'p0', { a: 'done' })).toBe(s);
    expect(send(s, 'p0', { a: 'tip', i: 0 })).toBe(s);
  });

  it('die Missionsphase laeuft immer voll', () => {
    const s = make();
    expect(pokerface.tick(s, s.endsAt - 1, everyone(3))).toBe(s);
    expect(pokerface.tick(s, s.endsAt, everyone(3)).phase).toBe('talk');
  });
});

describe('pokerface Gespraech', () => {
  const talk = (n = 3, seed = 3) => upTo(make(n, seed), n, 'talk');

  it('Sicht: genaue Schluesselmenge, done nur fuer den Besitzer', () => {
    const s = send(talk(), 'p0', { a: 'done' });
    expect(keys(view(s, 'p0'))).toEqual(['done', 'dur', 'endsAt', 'mission', 'phase', 'target', 'topic']);
    expect(view(s, 'p0')).toMatchObject({ phase: 'talk', done: true, mission: text(s, 'p0'), target: target(s, 'p0') });
    expect(view(s, 'p1')).toMatchObject({ phase: 'talk', done: false });
    expect(view(s, 'p2')).toMatchObject({ phase: 'talk', done: false });
  });

  it('ERLEDIGT: einmal, als Boolean ohne Zeitpunkt, erzeugt einen result-Eintrag', () => {
    const s = talk();
    const a = send(s, 'p0', { a: 'done' }, s.endsAt - 7);
    expect(a.done).toEqual({ p0: true });
    expect(JSON.stringify(a)).not.toContain(String(s.endsAt - 7));
    expect(send(a, 'p0', { a: 'done' })).toBe(a);
    expect(pokerface.result(a).has('p0')).toBe(true);
    expect(pokerface.result(a).has('p1')).toBe(false);
    expect(pokerface.label(a, 'p0')).toMatch(/^\d+ Pkt$/);
    expect(pokerface.label(a, 'p1')).toBe('–');
    expect(send(s, 'zz', { a: 'done' })).toBe(s);
  });

  it('fremde Sichten aendern sich durch ERLEDIGT nicht (Status bleibt geheim)', () => {
    const s = talk(5, 8);
    for (const owner of pidsOf(5)) {
      const after = send(s, owner, { a: 'done' });
      for (const x of pidsOf(5).filter((p) => p !== owner)) expect(JSON.stringify(view(after, x)), `${owner}->${x}`).toBe(JSON.stringify(view(s, x)));
    }
  });

  it('Tipps gelten im Gespraech noch nicht', () => {
    const s = talk();
    expect(send(s, 'p0', { a: 'tip', i: 0 })).toBe(s);
  });

  it('allDone ueber die Online-Spieler beendet das Gespraech sofort, Teil-ERLEDIGT nicht', () => {
    const s = talk(3);
    const a = send(s, 'p0', { a: 'done' });
    expect(pokerface.tick(a, NOW + 1, everyone(3))).toBe(a);
    const b = send(a, 'p1', { a: 'done' });
    expect(pokerface.tick(b, NOW + 1, everyone(3))).toBe(b);
    expect(pokerface.tick(b, NOW + 1, new Set(['p0', 'p1'])).phase).toBe('guess');
    const c = send(b, 'p2', { a: 'done' });
    const g = pokerface.tick(c, NOW + 1, everyone(3));
    expect(g.phase).toBe('guess');
    expect(g.endsAt).toBe(NOW + 1 + g.durs.guess);
    expect(g.dur).toBe(g.durs.guess);
  });

  it('ohne ERLEDIGT endet das Gespraech nach der Zeit', () => {
    const s = talk();
    expect(pokerface.tick(s, s.endsAt - 1, everyone(3))).toBe(s);
    expect(next(s, 3).phase).toBe('guess');
    expect(pokerface.result(next(s, 3)).size).toBe(0);
  });

  it('n=1: ERLEDIGT beendet das Gespraech, es folgt die Aufloesung ohne Raten', () => {
    const s = talk(1, 2);
    const d = send(s, 'p0', { a: 'done' });
    const r = pokerface.tick(d, NOW + 1, everyone(1));
    expect(r.phase).toBe('reveal');
    expect(pts(r, 'p0')).toBe(3);
    expect(next(talk(1, 2), 1).phase).toBe('reveal');
  });
});

describe('pokerface Raten', () => {
  const guess = (n = 3, seed = 3) => upTo(make(n, seed), n, 'guess');

  it('Sicht des Raters: 4 Optionen des Ziels ohne Kennzeichnung, genaue Schluesselmenge', () => {
    const s = guess(4, 5);
    for (const p of pidsOf(4)) {
      const v = view(s, p) as Extract<PfView, { phase: 'guess' }>;
      expect(keys(v)).toEqual(['dur', 'endsAt', 'mine', 'opts', 'phase', 'target', 'total', 'voted']);
      expect(v).toMatchObject({ phase: 'guess', target: target(s, p), mine: null, voted: 0, total: 4, opts: s.opts[p] });
      expect(v.opts).toHaveLength(4);
      expect(v.dur).toBe(s.durs.guess);
    }
  });

  it('der Rater sieht die Ziel-Mission nur als eine von vier Optionen', () => {
    const s = guess(3, 5);
    for (const r of pidsOf(3)) {
      const json = JSON.stringify(view(s, r));
      expect(json).toContain(text(s, target(s, r)));
      expect(json).not.toContain(text(s, r));
      expect(json).not.toContain('"answer"');
    }
  });

  it('ein Tipp: einmal und endgueltig, nur in guess, Index 0..3, nur bekannte Spieler', () => {
    const s = guess();
    const a = send(s, 'p0', { a: 'tip', i: 2 });
    expect(a.tips).toEqual({ p0: 2 });
    expect(send(a, 'p0', { a: 'tip', i: 1 })).toBe(a);
    expect(send(s, 'zz', { a: 'tip', i: 0 })).toBe(s);
    expect(send(s, 'p0', { a: 'done' })).toBe(s);
    expect(pokerface.result(a).has('p0')).toBe(true);
    expect(pokerface.result(a).has('p1')).toBe(false);
  });

  it('eigene Sicht zeigt den Tipp, fremde nur die Zahl', () => {
    const s = guess(4, 5);
    const t = send(s, 'p1', { a: 'tip', i: 3 });
    expect(view(t, 'p1')).toMatchObject({ mine: 3, voted: 1 });
    expect(view(t, 'p0')).toMatchObject({ mine: null, voted: 1 });
  });

  it('fremde Sichten aendern sich durch einen Tipp nur im Zaehler', () => {
    const s = guess(5, 8);
    const strip = (v: PfView) => JSON.stringify({ ...v, voted: 0 });
    for (const owner of pidsOf(5)) {
      const after = send(s, owner, { a: 'tip', i: 2 });
      for (const x of pidsOf(5).filter((p) => p !== owner)) expect(strip(view(after, x)), `${owner}->${x}`).toBe(strip(view(s, x)));
    }
  });

  it('allDone beendet das Raten, Offline zaehlt nicht, sonst die Zeit', () => {
    let s = guess(3);
    s = send(s, 'p0', { a: 'tip', i: 0 });
    s = send(s, 'p1', { a: 'tip', i: 0 });
    expect(pokerface.tick(s, NOW + 1, everyone(3))).toBe(s);
    expect(pokerface.tick(s, NOW + 1, new Set(['p0', 'p1'])).phase).toBe('reveal');
    s = send(s, 'p2', { a: 'tip', i: 0 });
    const r = pokerface.tick(s, NOW + 1, everyone(3));
    expect(r.phase).toBe('reveal');
    expect(r.dur).toBe(r.durs.reveal);
    const idle = guess();
    expect(pokerface.tick(idle, idle.endsAt - 1, everyone(3))).toBe(idle);
    expect(next(idle, 3).phase).toBe('reveal');
  });
});

describe('pokerface Wertung', () => {
  it('zu zweit: beide erledigt, beide falsch: je 3', () => {
    const s = played(2, 4, { done: ['p0', 'p1'], wrong: ['p0', 'p1'] });
    expect([pts(s, 'p0'), pts(s, 'p1')]).toEqual([3, 3]);
    expect(pokerface.label(s, 'p0')).toBe('3 Pkt');
  });

  it('zu zweit: beide erledigt, beide richtig: je 1 + 2', () => {
    const s = played(2, 4, { done: ['p0', 'p1'], right: ['p0', 'p1'] });
    expect([pts(s, 'p0'), pts(s, 'p1')]).toEqual([3, 3]);
  });

  it('zu zweit: p0 rät richtig, p1 falsch: p0 = 3 + 2, p1 = 1', () => {
    const s = played(2, 4, { done: ['p0', 'p1'], right: ['p0'], wrong: ['p1'] });
    expect(pts(s, 'p0')).toBe(5);
    expect(pts(s, 'p1')).toBe(1);
    expect(pokerface.label(s, 'p1')).toBe('1 Pkt');
  });

  it('richtig geraten zaehlt auch, wenn das Ziel nicht erledigt hat; nicht erledigt = 0 fuer die eigene Mission', () => {
    const s = played(2, 4, { done: ['p0'], right: ['p1'], wrong: ['p0'] });
    expect(pts(s, 'p0')).toBe(1);
    expect(pts(s, 'p1')).toBe(2);
    const t = played(2, 4, { right: ['p0'] });
    expect(pts(t, 'p0')).toBe(2);
    expect(pokerface.result(t).has('p1')).toBe(false);
  });

  it('ohne Tipp des Raters gilt die Mission nicht als erraten', () => {
    const s = played(2, 4, { done: ['p0', 'p1'] });
    expect([pts(s, 'p0'), pts(s, 'p1')]).toEqual([3, 3]);
  });

  it('drei Spieler im Ring: a rät b richtig, b und c falsch, alle erledigt', () => {
    const base = make(3, 7);
    const [a, b, c] = base.order as [string, string, string];
    const s = played(3, 7, { done: [a, b, c], right: [a], wrong: [b, c] });
    expect(target(s, a)).toBe(b);
    expect(pts(s, a)).toBe(5);
    expect(pts(s, b)).toBe(1);
    expect(pts(s, c)).toBe(3);
  });

  it('result-Eintrag erst ab eigener ERLEDIGT- oder Tipp-Eingabe, Label sonst "–"', () => {
    const idle = played(3, 7, {});
    expect(pokerface.result(idle).size).toBe(0);
    expect(pokerface.label(idle, 'p0')).toBe('–');
    const tipOnly = played(3, 7, { wrong: ['p1'] });
    expect([...pokerface.result(tipOnly).keys()]).toEqual(['p1']);
    const doneOnly = played(3, 7, { done: ['p2'] });
    expect([...pokerface.result(doneOnly).keys()]).toEqual(['p2']);
  });

  it('n=1: erledigt = 3, sonst kein Eintrag', () => {
    let s = upTo(make(1, 2), 1, 'talk');
    s = send(s, 'p0', { a: 'done' });
    s = upTo(s, 1, 'reveal');
    expect(pts(s, 'p0')).toBe(3);
    expect(pokerface.label(s, 'p0')).toBe('3 Pkt');
    expect(pokerface.result(upTo(make(1, 2), 1, 'reveal')).size).toBe(0);
  });
});

describe('pokerface Aufloesung', () => {
  it('Sicht: alle Missionen, wer erledigt hat, wer erraten hat, genaue Schluesselmengen', () => {
    const s = played(3, 7, { done: ['p0', 'p1'], right: ['p0'], wrong: ['p1'] });
    for (const p of pidsOf(3)) {
      const v = view(s, p) as Extract<PfView, { phase: 'reveal' }>;
      expect(keys(v)).toEqual(['dur', 'endsAt', 'phase', 'rows']);
      expect(v.dur).toBe(s.durs.reveal);
      expect(v.rows.map((r) => r.pid).sort()).toEqual(pidsOf(3));
      for (const r of v.rows) expect(keys(r)).toEqual(['by', 'cracked', 'done', 'mission', 'pid', 'tip']);
    }
    const v = view(s, 'p2') as Extract<PfView, { phase: 'reveal' }>;
    for (const r of v.rows) {
      expect(r.mission).toBe(text(s, r.pid));
      expect(r.by).toBe(rater(s, r.pid));
    }
    const row = (pid: string) => v.rows.find((r) => r.pid === pid);
    const cracked = (pid: string) => {
      const r = rater(s, pid);
      return s.tips[r] === undefined ? null : s.tips[r] === s.answer[r];
    };
    for (const pid of pidsOf(3)) expect(row(pid)?.cracked, pid).toBe(cracked(pid));
    expect(row('p0')).toMatchObject({ done: true });
    expect(row('p2')).toMatchObject({ done: false, tip: null });
    expect(row('p0')?.tip).toBe(true);
    expect(row('p1')?.tip).toBe(false);
  });

  it('n=1: Zeile ohne Rater', () => {
    let s = upTo(make(1, 2), 1, 'talk');
    s = upTo(send(s, 'p0', { a: 'done' }), 1, 'reveal');
    const v = view(s, 'p0') as Extract<PfView, { phase: 'reveal' }>;
    expect(v.rows).toEqual([{ pid: 'p0', mission: text(s, 'p0'), done: true, by: null, cracked: null, tip: null }]);
  });

  it('done erst nach der Aufloesung: reveal ist noch nicht fertig', () => {
    const s = played(3, 7, {});
    expect(pokerface.done(s, s.endsAt - 1)).toBe(false);
    expect(pokerface.done(s, s.endsAt)).toBe(true);
    expect(pokerface.tick(s, s.endsAt + 5000, everyone(3))).toBe(s);
  });
});

describe('pokerface Geheimnisse (alle Seeds)', () => {
  it('vor der Aufloesung steht eine Mission nur beim Besitzer und beim Rater (nur in guess)', () => {
    for (let seed = 0; seed < 25; seed++)
      for (const n of [2, 3, 5, 8]) {
        let s = make(n, seed);
        for (const phase of ['mission', 'talk', 'guess'] as const) {
          s = upTo(s, n, phase);
          for (const owner of pidsOf(n))
            for (const x of pidsOf(n).filter((p) => p !== owner)) {
              const legit = phase === 'guess' && x === rater(s, owner);
              if (!legit) expect(JSON.stringify(view(s, x)), `seed ${seed} n ${n} ${phase} ${owner}->${x}`).not.toContain(text(s, owner));
            }
        }
      }
  });

  it('keine Sicht enthaelt Bankindizes oder den Zustand roh', () => {
    const s = played(4, 3, { done: ['p0'], right: ['p1'] });
    let q = make(4, 3);
    for (const phase of ['mission', 'talk', 'guess', 'reveal'] as const) {
      q = upTo(q, 4, phase);
      for (const p of pidsOf(4)) {
        const json = JSON.stringify(view(q, p));
        for (const bad of ['"missions"', '"answer"', '"topic":', '"seen"', '"order"']) {
          if (bad === '"topic":' && (phase === 'mission' || phase === 'talk')) continue;
          expect(json, `${phase} ${bad}`).not.toContain(bad);
        }
      }
    }
    expect(typeof (view(s, 'p0') as { rows: unknown }).rows).toBe('object');
    const t = view(make(4, 3), 'p0') as { topic: unknown };
    expect(typeof t.topic).toBe('string');
  });
});
