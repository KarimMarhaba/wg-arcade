import { describe, expect, it } from 'vitest';
import { createEngine } from '../engine/party';
import type { Party } from '../engine/types';
import { GAMES } from './index';
import { QUESTIONS } from './schaetzfuchs/questions';
import { GAME_IDS, type GameId } from './types';

describe('Registry', () => {
  it('GAMES[id].id === id mit vier verschiedenen Akzenten', () => {
    for (const id of GAME_IDS) expect(GAMES[id].id).toBe(id);
    expect(GAME_IDS.map((id) => GAMES[id].accent).sort()).toEqual(['cyan', 'hot', 'lime', 'orange']);
    for (const id of GAME_IDS) {
      expect(GAMES[id].title).not.toBe('');
      expect(GAMES[id].rule).not.toBe('');
    }
  });
});

const HOST = 'h';
const GUEST = 'g';
const eng = createEngine(GAMES);

function lobby(engine: ReturnType<typeof createEngine>, o: { speed: number; guest: boolean; rounds: 3 | 5 | 8 }): Party {
  let p = engine.create('ABCD', 31, HOST, { dev: true, speed: o.speed });
  p = engine.hello(p, HOST, 'Host', 0).p;
  if (o.guest) p = engine.hello(p, GUEST, 'Gast', 0).p;
  return engine.control(engine.control(p, { a: 'rounds', n: o.rounds }, 0), { a: 'start' }, 0);
}

const step = (engine: ReturnType<typeof createEngine>, p: Party, t: number): Party =>
  engine.tick(p.players.reduce((q, x) => engine.seen(q, x.pid, t), p), t);

function until(engine: ReturnType<typeof createEngine>, p: Party, t0: number, k: Party['phase']['k']) {
  let t = t0;
  let q = p;
  for (let n = 0; q.phase.k !== k; n++) {
    if (n > 3000) throw new Error(`${k} nicht erreicht`);
    t += 100;
    q = step(engine, q, t);
  }
  return { p: q, t };
}

describe('Integration: ganze Party nur mit Ticks', () => {
  it('erreicht das Podium, alle 4 Spiele in order, Intro traegt Titel und Akzent', () => {
    let p = lobby(eng, { speed: 10, guest: false, rounds: 5 });
    expect(new Set(p.order)).toEqual(new Set(GAME_IDS));
    const intros = new Map<number, ReturnType<typeof eng.viewFor>>();
    let t = 0;
    for (let n = 0; p.phase.k !== 'podium'; n++) {
      if (n > 1500) throw new Error('Podium nicht erreicht');
      if (p.phase.k === 'intro' && !intros.has(p.phase.r)) intros.set(p.phase.r, eng.viewFor(p, HOST, t));
      t += 100;
      p = step(eng, p, t);
    }
    expect(intros.size).toBe(5);
    p.order.forEach((id, r) => {
      expect(intros.get(r)).toMatchObject({ s: 'intro', r, game: id, title: GAMES[id].title, accent: GAMES[id].accent });
    });
    expect(p.history).toHaveLength(5);
  });
});

type Wire = (p: Party, t: number) => { host: unknown[]; guest: unknown[] };

const gview = (e: typeof eng, p: Party, t: number): any => {
  const v = e.viewFor(p, HOST, t);
  if (v.s !== 'game') throw new Error('keine Spielsicht');
  return v.g;
};

const WIRES: Record<GameId, Wire> = {
  blitz: () => ({
    host: [0, 1, 2].map((i) => ({ i, ms: 200 })),
    guest: [0, 1, 2].map((i) => ({ i, ms: 600 })),
  }),
  hammer: () => ({ host: [{ n: 50, final: true }], guest: [{ n: 20, final: true }] }),
  farbfalle: (p, t) => {
    const seq: [number, number][] = gview(eng, p, t).seq;
    return {
      host: [...[0, 1, 2, 3, 4].map((i) => ({ i, c: (seq[i] as [number, number])[1] })), { done: true }],
      guest: [{ i: 0, c: ((seq[0] as [number, number])[1] + 1) % 4 }, { done: true }],
    };
  },
  schaetzfuchs: (p, t) => {
    const q = gview(eng, p, t).q as string;
    const a = (QUESTIONS.find((x) => x.q === q) as { a: number }).a;
    return { host: [{ guess: a }], guest: [{ guess: a * 3 }] };
  },
};

describe('Integration: Draht-Payloads, besserer Spieler gewinnt', () => {
  for (const id of GAME_IDS)
    it(`${id}: Platz 1 und 5 Punkte`, () => {
      const one = createEngine({ [id]: GAMES[id] });
      const start = until(one, lobby(one, { speed: 10, guest: true, rounds: 3 }), 0, 'play');
      let p = start.p;
      const t = start.t;
      const wire = WIRES[id](p, t);
      const send = (pid: string, payloads: unknown[]) => {
        for (const raw of payloads) p = one.input(p, pid, 0, JSON.parse(JSON.stringify(raw)), t);
      };
      send(HOST, wire.host);
      send(GUEST, wire.guest);
      p = until(one, p, t, 'result').p;
      const rec = p.history[0];
      expect(rec?.places).toEqual({ [HOST]: 1, [GUEST]: 2 });
      expect(rec?.points[HOST]).toBe(5);
    });
});
