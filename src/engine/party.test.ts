import { describe, expect, it } from 'vitest';
import { GAME_IDS } from '../games/types';
import { DRINK_EXTRA, INTRO, RESULT, scale } from './durations';
import { type DummyState, DUMMY_MS, dummyRegistry, makeDummy } from './dummygame';
import { createEngine } from './party';
import { mix32 } from './prng';
import { planOrder } from './rounds';
import type { HostAction, Party, Phase } from './types';

const eng = createEngine(dummyRegistry());
const HOST = 'host';

const mk = (o: { dev?: boolean; speed?: number; seed?: number; rounds?: number } = {}): Party =>
  eng.create('ABCD', o.seed ?? 42, HOST, { dev: o.dev ?? false, speed: o.speed ?? 1, rounds: o.rounds });
const join = (p: Party, pid: string, name = pid, now = 0): Party => eng.hello(p, pid, name, now).p;
const lobby = (others: string[] = ['a', 'b'], o: Parameters<typeof mk>[0] = {}): Party =>
  others.reduce((p, n) => join(p, n), join(mk(o), HOST, 'Host'));
const names = (p: Party) => p.players.map((x) => x.name);
const pl = (p: Party, pid: string) => {
  const x = p.players.find((q) => q.pid === pid);
  if (!x) throw new Error(`kein Spieler ${pid}`);
  return x;
};

const stepAll = (p: Party, now: number, who?: string[], e = eng): Party =>
  e.tick((who ?? p.players.map((x) => x.pid)).reduce((q, pid) => e.seen(q, pid, now), p), now);

function advance(p: Party, now: number, k: Phase['k'], who?: string[], e = eng): { p: Party; t: number } {
  let t = now;
  let q = p;
  while (q.phase.k !== k) {
    t += 100;
    q = stepAll(q, t, who, e);
    if (t > now + 500_000) throw new Error(`${k} nicht erreicht`);
  }
  return { p: q, t };
}

const state = (p: Party): DummyState => {
  if (p.phase.k !== 'play') throw new Error('nicht in play');
  return p.phase.state as DummyState;
};

function reachAll(drinking = false): Record<Phase['k'], { p: Party; t: number }> {
  const base = eng.control(lobby(['a'], { speed: 10 }), { a: 'rounds', n: 3 }, 0);
  const l = drinking ? eng.control(base, { a: 'drinking', on: true }, 0) : base;
  const intro = { p: eng.control(l, { a: 'start' }, 0), t: 0 };
  const play = advance(intro.p, 0, 'play');
  const result = advance(play.p, play.t, 'result');
  const podium = advance(result.p, result.t, 'podium');
  return { lobby: { p: l, t: 0 }, intro, play, result, podium };
}

describe('create', () => {
  it('liefert leere Lobby mit Default 5 Runden', () => {
    const p = mk({ dev: true, speed: 10, seed: 7 });
    expect(p).toMatchObject({
      code: 'ABCD',
      seed: 7,
      hostPid: HOST,
      dev: true,
      speed: 10,
      players: [],
      rounds: 5,
      drinking: false,
      order: [],
      history: [],
      phase: { k: 'lobby' },
    });
  });

  it('rounds aus den Optionen ersetzt den Default (Dev-Override), auch außerhalb von 3/5/8', () => {
    for (const n of [1, 2, 7]) expect(mk({ rounds: n }).rounds).toBe(n);
    expect(mk({ rounds: undefined }).rounds).toBe(5);
  });

  it('mit rounds=1 besteht die Party aus genau einer Runde', () => {
    const p = eng.control(lobby(['a'], { rounds: 1, speed: 10 }), { a: 'start' }, 0);
    expect(p.order).toHaveLength(1);
    const end = advance(p, 0, 'podium');
    expect(end.p.history).toHaveLength(1);
  });
});

describe('hello', () => {
  it('neue pid in der Lobby: ok, kleinster freier Farbindex, getrimmter Name', () => {
    let p = mk();
    const r1 = eng.hello(p, HOST, '  Host ', 100);
    expect(r1.res).toEqual({ ok: true, pid: HOST });
    p = r1.p;
    p = join(p, 'a');
    p = join(p, 'b');
    expect(p.players.map((x) => x.color)).toEqual([0, 1, 2]);
    expect(pl(p, HOST)).toMatchObject({ name: 'Host', online: true, lastSeen: 100, total: 0 });
  });

  it('badname bei leer, nur Leerzeichen und 13 Zeichen; 12 nach dem Trim ist ok; gleiche Referenz', () => {
    const p = lobby();
    for (const bad of ['', '   ', 'abcdefghijklm', ' abcdefghijklm ']) {
      const r = eng.hello(p, 'neu', bad, 1);
      expect(r.res).toEqual({ ok: false, reason: 'badname' });
      expect(r.p).toBe(p);
    }
    const ok = eng.hello(p, 'neu', ' abcdefghijkl ', 1);
    expect(ok.res).toEqual({ ok: true, pid: 'neu' });
    expect(names(ok.p).at(-1)).toBe('abcdefghijkl');
  });

  it('Dubletten ohne Groß/Klein bekommen " 2", " 3"', () => {
    let p = mk();
    p = join(p, 'p1', 'Anna');
    p = join(p, 'p2', 'anna');
    p = join(p, 'p3', 'ANNA');
    expect(names(p)).toEqual(['Anna', 'anna 2', 'ANNA 3']);
  });

  it('der Anhang darf 12 Zeichen überschreiten', () => {
    let p = join(mk(), 'p1', 'abcdefghijkl');
    p = join(p, 'p2', 'abcdefghijkl');
    expect(names(p)).toEqual(['abcdefghijkl', 'abcdefghijkl 2']);
  });

  it('der 9. Spieler bekommt full, 8 passen', () => {
    let p = mk();
    for (let i = 0; i < 8; i++) p = join(p, `p${i}`);
    expect(p.players).toHaveLength(8);
    expect(p.players.map((x) => x.color)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    const r = eng.hello(p, 'p9', 'neun', 1);
    expect(r.res).toEqual({ ok: false, reason: 'full' });
    expect(r.p).toBe(p);
  });

  it('neue pid außerhalb der Lobby: started; badname hat Vorrang', () => {
    const { p } = reachAll().intro;
    const r = eng.hello(p, 'zed', 'Zed', 1);
    expect(r.res).toEqual({ ok: false, reason: 'started' });
    expect(r.p).toBe(p);
    expect(eng.hello(p, 'zed', '', 1).res).toEqual({ ok: false, reason: 'badname' });
  });

  it('bekannte pid mitten in play: ok, alter Name, wieder online', () => {
    const { p, t } = reachAll().play;
    const off = eng.disconnect(p, 'a', t);
    expect(pl(off, 'a').online).toBe(false);
    const r = eng.hello(off, 'a', 'Neuer Name', t + 500);
    expect(r.res).toEqual({ ok: true, pid: 'a' });
    expect(pl(r.p, 'a')).toMatchObject({ name: 'a', online: true, lastSeen: t + 500 });
    expect(r.p.players).toHaveLength(p.players.length);
  });

  it('bekannte pid in der Lobby: ok ohne neuen Eintrag', () => {
    const p = lobby();
    const r = eng.hello(p, 'a', 'Anderer', 50);
    expect(r.res).toEqual({ ok: true, pid: 'a' });
    expect(r.p.players).toHaveLength(3);
    expect(pl(r.p, 'a').name).toBe('a');
  });
});

describe('Online-Status', () => {
  it('Lobby: disconnect entfernt und gibt die Farbe für den nächsten Join frei', () => {
    let p = lobby();
    p = eng.disconnect(p, 'a', 10);
    expect(p.players.map((x) => x.pid)).toEqual([HOST, 'b']);
    p = join(p, 'c');
    expect(pl(p, 'c').color).toBe(1);
  });

  it('Lobby: 6000 ms noch da, 6001 ms entfernt; Farbe frei', () => {
    let p = lobby();
    expect(eng.tick(p, 6000).players).toHaveLength(3);
    p = eng.tick(p, 6001);
    expect(p.players.map((x) => x.pid)).toEqual([HOST]);
    p = join(p, 'c', 'c', 6001);
    expect(pl(p, 'c').color).toBe(1);
  });

  it('außerhalb der Lobby: nur offline, Farbe bleibt; 6000 ms noch online', () => {
    const p = eng.control(lobby(['a']), { a: 'start' }, 0);
    const at6000 = eng.tick(p, 6000);
    expect(pl(at6000, 'a').online).toBe(true);
    const at6001 = eng.tick(p, 6001);
    expect(pl(at6001, 'a')).toMatchObject({ online: false, color: 1 });
    expect(at6001.players).toHaveLength(2);
    expect(eng.disconnect(p, 'a', 5).players).toHaveLength(2);
    expect(pl(eng.disconnect(p, 'a', 5), 'a')).toMatchObject({ online: false, color: 1 });
  });

  it('seen macht wieder online, unbekannte pid ändert nichts', () => {
    const p = eng.control(lobby(['a']), { a: 'start' }, 0);
    const off = eng.tick(p, 6001);
    const back = eng.seen(off, 'a', 7000);
    expect(pl(back, 'a')).toMatchObject({ online: true, lastSeen: 7000 });
    expect(pl(eng.tick(back, 12000), 'a').online).toBe(true);
    expect(pl(eng.tick(back, 13001), 'a').online).toBe(false);
    expect(eng.seen(p, 'niemand', 5)).toBe(p);
    expect(eng.disconnect(p, 'niemand', 5)).toBe(p);
  });

  it('der Host wird nie offline und nie entfernt', () => {
    const l = lobby();
    expect(eng.tick(l, 100_000).players.map((x) => x.pid)).toEqual([HOST]);
    expect(eng.disconnect(l, HOST, 5)).toBe(l);
    const p = eng.control(l, { a: 'start' }, 0);
    const later = eng.tick(p, 100_000);
    expect(pl(later, HOST).online).toBe(true);
    expect(pl(eng.disconnect(p, HOST, 5), HOST).online).toBe(true);
  });

  it('doppeltes disconnect ist idempotent', () => {
    const p = eng.control(lobby(['a']), { a: 'start' }, 0);
    const once = eng.disconnect(p, 'a', 5);
    expect(eng.disconnect(once, 'a', 6)).toEqual(once);
  });
});

describe('control', () => {
  it('rounds: nur 3/5/8, nur in der Lobby, Default 5', () => {
    const p = lobby();
    expect(p.rounds).toBe(5);
    for (const n of [3, 5, 8] as const) expect(eng.control(p, { a: 'rounds', n }, 0).rounds).toBe(n);
    for (const n of [0, 1, 4, 9]) expect(eng.control(p, { a: 'rounds', n } as unknown as HostAction, 0)).toBe(p);
    const intro = reachAll().intro.p;
    expect(eng.control(intro, { a: 'rounds', n: 8 }, 0)).toBe(intro);
  });

  it('canStart: 1 Spieler false, mit dev true, 2 online true', () => {
    expect(eng.canStart(join(mk(), HOST))).toBe(false);
    expect(eng.canStart(join(mk({ dev: true }), HOST))).toBe(true);
    expect(eng.canStart(lobby(['a']))).toBe(true);
    expect(eng.canStart(mk())).toBe(false);
  });

  it('start ohne canStart gibt dieselbe Referenz', () => {
    const solo = join(mk(), HOST);
    expect(eng.control(solo, { a: 'start' }, 0)).toBe(solo);
    expect(eng.control(join(mk({ dev: true }), HOST), { a: 'start' }, 0).phase.k).toBe('intro');
  });

  it('start: intro r0 mit order = planOrder(seed, rounds, ids) und until = now + INTRO', () => {
    const p = eng.control(lobby(['a'], { seed: 99 }), { a: 'start' }, 1000);
    expect(p.order).toEqual(planOrder(99, 5, GAME_IDS));
    expect(p.phase).toEqual({ k: 'intro', r: 0, until: 1000 + INTRO });
  });

  it('jede Aktion in falscher Phase gibt dieselbe Referenz', () => {
    const allowed: Record<HostAction['a'], Phase['k'][]> = {
      rounds: ['lobby'],
      start: ['lobby'],
      next: ['result'],
      again: ['podium'],
      lobby: ['podium', 'lobby'],
      drinking: ['lobby'],
    };
    const acts: HostAction[] = [
      { a: 'rounds', n: 8 },
      { a: 'start' },
      { a: 'next' },
      { a: 'again', seed: 5 },
      { a: 'lobby', seed: 5 },
      { a: 'drinking', on: true },
    ];
    const reached = reachAll();
    for (const act of acts)
      for (const [k, { p, t }] of Object.entries(reached) as [Phase['k'], { p: Party; t: number }][]) {
        const out = eng.control(p, act, t);
        if (allowed[act.a].includes(k)) expect(out, `${act.a} in ${k}`).not.toBe(p);
        else expect(out, `${act.a} in ${k}`).toBe(p);
      }
  });

  it('again: Punkte und Historie zurück, order = planOrder(neuer Seed), Offline bleibt', () => {
    let { p, t } = reachAll().podium;
    p = eng.disconnect(p, 'a', t);
    const out = eng.control(p, { a: 'again', seed: 777 }, t);
    expect(out.seed).toBe(777);
    expect(out.order).toEqual(planOrder(777, 3, GAME_IDS));
    expect(out.history).toEqual([]);
    expect(out.players.map((x) => x.total)).toEqual([0, 0]);
    expect(pl(out, 'a').online).toBe(false);
    expect(out.phase).toEqual({ k: 'intro', r: 0, until: t + scale(INTRO, 10) });
  });

  it('lobby: setzt zurück, entfernt Offline-Spieler, übernimmt den neuen Seed', () => {
    let { p, t } = reachAll().podium;
    p = eng.disconnect(p, 'a', t);
    const out = eng.control(p, { a: 'lobby', seed: 4242 }, t);
    expect(out.phase).toEqual({ k: 'lobby' });
    expect(out.seed).toBe(4242);
    expect(out.history).toEqual([]);
    expect(out.order).toEqual([]);
    expect(out.players.map((x) => x.pid)).toEqual([HOST]);
    expect(out.players[0]?.total).toBe(0);
    expect(out.rounds).toBe(3);
    const again = join(out, 'c');
    expect(pl(again, 'c').color).toBe(1);
  });

  it('lobby in der Lobby übernimmt ebenfalls den Seed', () => {
    const out = eng.control(lobby(), { a: 'lobby', seed: 11 }, 0);
    expect(out.seed).toBe(11);
    expect(out.players).toHaveLength(3);
  });
});

describe('Timeline', () => {
  for (const speed of [1, 10]) {
    it(`speed ${speed}: Lobby bis Podium, jeder Übergang exakt an der Grenze`, () => {
      const seed = 31337;
      let p = lobby(['a'], { speed, seed });
      const n = p.rounds;
      let t = 1000;
      p = eng.control(p, { a: 'start' }, t);
      expect(p.order).toHaveLength(n);
      for (let r = 0; r < n; r++) {
        if (p.phase.k !== 'intro') throw new Error('intro erwartet');
        const introUntil = p.phase.until;
        expect(p.phase).toMatchObject({ r, until: t + scale(INTRO, speed) });
        expect(stepAll(p, introUntil - 1).phase.k).toBe('intro');
        p = stepAll(p, introUntil);
        expect(p.phase).toMatchObject({ k: 'play', r, started: introUntil });
        expect(state(p).seed).toBe(mix32(seed, r));
        expect(eng.viewFor(p, HOST, introUntil)).toMatchObject({ s: 'game', game: p.order[r], r, n });
        const endsAt = introUntil + scale(DUMMY_MS, speed);
        expect(stepAll(p, endsAt - 1).phase.k).toBe('play');
        p = stepAll(p, endsAt);
        const resultUntil = endsAt + scale(RESULT, speed);
        expect(p.phase).toEqual({ k: 'result', r, until: resultUntil });
        expect(p.history).toHaveLength(r + 1);
        expect(stepAll(p, resultUntil - 1).phase.k).toBe('result');
        p = stepAll(p, resultUntil);
        t = resultUntil;
        if (r < n - 1) expect(p.phase.k).toBe('intro');
      }
      expect(p.phase).toEqual({ k: 'podium' });
    });
  }

  it('höchstens ein Übergang pro tick', () => {
    const p = eng.control(lobby(['a']), { a: 'start' }, 0);
    expect(stepAll(p, 1_000_000).phase.k).toBe('play');
  });

  it('next verkürzt result; nach der letzten Runde podium', () => {
    let p = eng.control(lobby(['a'], { speed: 10 }), { a: 'rounds', n: 3 }, 0);
    p = eng.control(p, { a: 'start' }, 0);
    let t = 0;
    for (let r = 0; r < 3; r++) {
      ({ p, t } = advance(p, t, 'result'));
      const out = eng.control(p, { a: 'next' }, t + 10);
      if (r < 2) expect(out.phase).toEqual({ k: 'intro', r: r + 1, until: t + 10 + scale(INTRO, 10) });
      else expect(out.phase).toEqual({ k: 'podium' });
      p = out;
      t += 10;
      if (r < 2) ({ p, t } = advance(p, t, 'play'));
    }
  });
});

describe('Rundenende', () => {
  function toPlay(others = ['a', 'b']) {
    const p = eng.control(lobby(others), { a: 'start' }, 0);
    return advance(p, 0, 'play');
  }
  const vote = (p: Party, pid: string, v: number, t: number) => eng.input(p, pid, 0, { v }, t);

  it('RoundRecord in history, Punkte auf total, früh beendet wenn alle online getippt haben', () => {
    let { p } = toPlay();
    expect(p.phase).toMatchObject({ k: 'play', started: 3000 });
    p = vote(p, HOST, 3, 3100);
    p = vote(p, 'a', 9, 3100);
    expect(stepAll(p, 3100).phase.k).toBe('play');
    p = vote(p, 'b', 9, 3100);
    p = stepAll(p, 3100);
    expect(p.phase).toEqual({ k: 'result', r: 0, until: 3100 + RESULT });
    expect(p.history).toEqual([
      {
        gameId: p.order[0],
        places: { host: 3, a: 1, b: 1 },
        points: { host: 2, a: 5, b: 5 },
        labels: { host: '3 pt', a: '9 pt', b: '9 pt' },
        drinks: null,
      },
    ]);
    expect(p.players.map((x) => x.total)).toEqual([2, 5, 5]);
  });

  it('ohne Eingaben endet die Runde zur Frist: alle letzter Platz, 0 Punkte', () => {
    const { p, t } = toPlay();
    const out = stepAll(p, t + 1000);
    expect(out.phase.k).toBe('result');
    expect(out.history[0]?.places).toEqual({ host: 3, a: 3, b: 3 });
    expect(out.history[0]?.points).toEqual({ host: 0, a: 0, b: 0 });
    expect(out.history[0]?.labels).toEqual({ host: '–', a: '–', b: '–' });
  });

  it('wer am Rundenende offline ist, bekommt 0 Punkte und den letzten Platz', () => {
    let { p } = toPlay();
    p = vote(p, 'b', 99, 3050);
    p = eng.disconnect(p, 'b', 3060);
    p = vote(p, 'a', 7, 3100);
    p = vote(p, HOST, 5, 3100);
    p = stepAll(p, 3100, [HOST, 'a']);
    expect(p.phase.k).toBe('result');
    expect(p.history[0]).toMatchObject({
      places: { host: 2, a: 1, b: 3 },
      points: { host: 3, a: 5, b: 0 },
      labels: { b: '99 pt' },
    });
    expect(pl(p, 'b').total).toBe(0);
  });

  it('ein offline Spieler verhindert das Früh-Ende nicht, ein online Spieler schon', () => {
    let { p } = toPlay();
    p = vote(p, HOST, 1, 3100);
    p = vote(p, 'a', 2, 3100);
    expect(stepAll(p, 3100).phase.k).toBe('play');
    const off = eng.disconnect(p, 'b', 3100);
    expect(stepAll(off, 3100, [HOST, 'a']).phase.k).toBe('result');
  });
});

describe('input', () => {
  const play = () => reachAll().play;

  it('gültige Eingabe in play wirkt', () => {
    const { p, t } = play();
    const out = eng.input(p, 'a', 0, { v: 4 }, t);
    expect(out).not.toBe(p);
    expect(state(out).votes).toEqual({ a: 4 });
  });

  it('falsche Phase, falsche Runde, unbekannte pid, parseInput null: dieselbe Referenz', () => {
    const { p, t } = play();
    expect(eng.input(p, 'a', 1, { v: 1 }, t)).toBe(p);
    expect(eng.input(p, 'niemand', 0, { v: 1 }, t)).toBe(p);
    for (const bad of [null, 5, 'x', {}, { v: 'x' }, { v: NaN }]) expect(eng.input(p, 'a', 0, bad, t)).toBe(p);
    const reached = reachAll();
    for (const k of ['lobby', 'intro', 'result', 'podium'] as const) {
      const o = reached[k];
      expect(eng.input(o.p, 'a', 0, { v: 1 }, o.t), k).toBe(o.p);
    }
  });

  it('def.input ändert nichts (zweite Eingabe): dieselbe Referenz', () => {
    const { p, t } = play();
    const once = eng.input(p, 'a', 0, { v: 4 }, t);
    expect(eng.input(once, 'a', 0, { v: 9 }, t)).toBe(once);
  });
});

describe('Reducer verändern ihre Eingabe nicht', () => {
  it('structuredClone-Vergleich über alle Phasen und Reducer', () => {
    for (const [k, { p, t }] of Object.entries(reachAll())) {
      const before = structuredClone(p);
      const calls: (() => unknown)[] = [
        () => eng.hello(p, 'neu', 'Neu', t),
        () => eng.hello(p, 'a', 'a', t),
        () => eng.seen(p, 'a', t),
        () => eng.disconnect(p, 'a', t),
        () => eng.input(p, 'a', 0, { v: 1 }, t),
        () => eng.control(p, { a: 'rounds', n: 8 }, t),
        () => eng.control(p, { a: 'start' }, t),
        () => eng.control(p, { a: 'next' }, t),
        () => eng.control(p, { a: 'again', seed: 3 }, t),
        () => eng.control(p, { a: 'lobby', seed: 3 }, t),
        () => eng.control(p, { a: 'drinking', on: true }, t),
        () => eng.tick(p, t + 100),
        () => eng.tick(p, t + 100_000),
        () => eng.viewFor(p, 'a', t),
      ];
      for (const c of calls) {
        c();
        expect(p, k).toEqual(before);
      }
    }
  });
});

describe('viewFor', () => {
  it('me, isHost und PlayerView.host stimmen; unbekannte pid wirft nicht', () => {
    const p = lobby();
    const h = eng.viewFor(p, HOST, 0);
    const a = eng.viewFor(p, 'a', 0);
    expect(h).toMatchObject({ me: HOST, isHost: true, code: 'ABCD' });
    expect(a).toMatchObject({ me: 'a', isHost: false });
    expect(a.players.map((x) => [x.pid, x.host])).toEqual([[HOST, true], ['a', false], ['b', false]]);
    expect(a.players[1]).toEqual({ pid: 'a', name: 'a', color: 1, online: true, total: 0, host: false });
    expect(eng.viewFor(p, 'fremd', 0)).toMatchObject({ me: 'fremd', isHost: false });
  });

  it('Lobby: rounds, canStart, min', () => {
    expect(eng.viewFor(lobby(['a']), HOST, 0)).toMatchObject({ s: 'lobby', rounds: 5, canStart: true, min: 2 });
    expect(eng.viewFor(join(mk(), HOST), HOST, 0)).toMatchObject({ canStart: false, min: 2 });
    expect(eng.viewFor(join(mk({ dev: true }), HOST), HOST, 0)).toMatchObject({ canStart: true, min: 1 });
  });

  it('Intro: title, rule, accent, until, n', () => {
    const { p } = reachAll().intro;
    const id = p.order[0] ?? 'blitz';
    expect(eng.viewFor(p, 'a', 0)).toMatchObject({
      s: 'intro',
      r: 0,
      n: 3,
      game: id,
      title: `Dummy ${id}`,
      rule: `Regel ${id}`,
      accent: 'lime',
      until: scale(INTRO, 10),
    });
  });

  it('Game: g kommt aus def.view mit der pid', () => {
    const { p, t } = reachAll().play;
    const q = eng.input(p, 'a', 0, { v: 4 }, t);
    expect(eng.viewFor(q, 'a', t)).toMatchObject({ s: 'game', r: 0, n: 3, g: { mine: 4 } });
    expect(eng.viewFor(q, HOST, t)).toMatchObject({ s: 'game', g: { mine: null } });
  });

  it('Ergebnis: nach Platz sortierte Zeilen mit points, total, label (Gleichstand: Beitrittsreihenfolge)', () => {
    let { p } = advance(eng.control(lobby(), { a: 'start' }, 0), 0, 'play');
    p = eng.input(p, HOST, 0, { v: 3 }, 3100);
    p = eng.input(p, 'a', 0, { v: 9 }, 3100);
    p = eng.input(p, 'b', 0, { v: 9 }, 3100);
    p = stepAll(p, 3100);
    const v = eng.viewFor(p, 'b', 3100);
    expect(v).toMatchObject({ s: 'result', r: 0, n: 5, game: p.order[0], until: 3100 + RESULT });
    if (v.s !== 'result') throw new Error('result erwartet');
    expect(v.rows).toEqual([
      { pid: 'a', place: 1, points: 5, total: 5, label: '9 pt' },
      { pid: 'b', place: 1, points: 5, total: 5, label: '9 pt' },
      { pid: HOST, place: 3, points: 2, total: 2, label: '3 pt' },
    ]);
  });

  it('Podium: Platz nach total mit geteiltem besserem Platz, inkl. Offline-Spieler', () => {
    const base = lobby(['a', 'b', 'c']);
    const totals = [10, 4, 10, 0];
    const p: Party = {
      ...base,
      phase: { k: 'podium' },
      players: base.players.map((x, i) => ({ ...x, total: totals[i] ?? 0, online: i !== 3 })),
    };
    const v = eng.viewFor(p, HOST, 0);
    if (v.s !== 'podium') throw new Error('podium erwartet');
    expect(v.rows).toEqual([
      { pid: HOST, place: 1, total: 10 },
      { pid: 'b', place: 1, total: 10 },
      { pid: 'a', place: 3, total: 4 },
      { pid: 'c', place: 4, total: 0 },
    ]);
    expect(v.players.find((x) => x.pid === 'c')?.online).toBe(false);
  });

  it('Lobby und play: zwischen zwei Ticks ohne Änderung JSON-gleich', () => {
    const l = lobby();
    expect(JSON.stringify(eng.viewFor(eng.tick(l, 100), 'a', 100))).toBe(JSON.stringify(eng.viewFor(l, 'a', 0)));
    const { p, t } = reachAll().play;
    const q = eng.input(p, 'a', 0, { v: 2 }, t);
    const later = eng.tick(q, t + 50);
    expect(later.phase.k).toBe('play');
    expect(JSON.stringify(eng.viewFor(later, 'a', t + 50))).toBe(JSON.stringify(eng.viewFor(q, 'a', t)));
    expect(JSON.stringify(eng.viewFor(later, HOST, t + 50))).toBe(JSON.stringify(eng.viewFor(q, HOST, t)));
  });

  it('enthält keine Zeitstempel der Spieler', () => {
    const json = JSON.stringify(eng.viewFor(lobby(), HOST, 0));
    expect(json).not.toContain('lastSeen');
  });
});

describe('Trinkmodus: Schalter', () => {
  it('wirkt nur in der Lobby; ein gleicher Wert gibt dieselbe Referenz', () => {
    const l = lobby();
    const on = eng.control(l, { a: 'drinking', on: true }, 0);
    expect(on).not.toBe(l);
    expect(on.drinking).toBe(true);
    expect(eng.control(on, { a: 'drinking', on: true }, 0)).toBe(on);
    expect(eng.control(l, { a: 'drinking', on: false }, 0)).toBe(l);
    expect(eng.control(on, { a: 'drinking', on: false }, 0).drinking).toBe(false);
    expect(eng.control(l, { a: 'drinking', on: 'ja' } as unknown as HostAction, 0)).toBe(l);
    const started = eng.control(on, { a: 'start' }, 0);
    expect(eng.control(started, { a: 'drinking', on: false }, 0)).toBe(started);
  });

  it('drinking überlebt Nochmal und Neue Party', () => {
    const { p, t } = reachAll(true).podium;
    expect(p.drinking).toBe(true);
    expect(eng.control(p, { a: 'again', seed: 5 }, t).drinking).toBe(true);
    expect(eng.control(p, { a: 'lobby', seed: 5 }, t).drinking).toBe(true);
    const off = reachAll(false).podium;
    expect(eng.control(off.p, { a: 'again', seed: 5 }, off.t).drinking).toBe(false);
    expect(eng.control(off.p, { a: 'lobby', seed: 5 }, off.t).drinking).toBe(false);
  });

  it('init bekommt { speed, drinking }', () => {
    expect(state(reachAll(true).play.p).drinking).toBe(true);
    expect(state(reachAll(false).play.p).drinking).toBe(false);
  });

  it('jede Sicht trägt drinking, in der Lobby auch für Clients', () => {
    for (const on of [true, false])
      for (const [k, { p, t }] of Object.entries(reachAll(on)))
        for (const pid of [HOST, 'a']) expect(eng.viewFor(p, pid, t), `${k} ${pid}`).toMatchObject({ drinking: on });
  });
});

describe('Trinkmodus: Pool', () => {
  const only = (...ids: ('hammer' | 'farbfalle')[]) =>
    Object.fromEntries(ids.map((id) => [id, makeDummy(id, { drinkOnly: true })]));
  const pool = createEngine({ ...dummyRegistry(), ...only('hammer', 'farbfalle') });
  const started = (e: typeof eng, seed: number, drinking: boolean, rounds: 3 | 5 | 8 = 8): Party => {
    let p = e.create('ABCD', seed, HOST, { dev: true, speed: 10 });
    p = e.hello(p, HOST, 'Host', 0).p;
    p = e.control(p, { a: 'rounds', n: rounds }, 0);
    p = e.control(p, { a: 'drinking', on: drinking }, 0);
    return e.control(p, { a: 'start' }, 0);
  };
  const noRepeat = (xs: readonly string[]) => xs.every((x, i) => i === 0 || x !== xs[i - 1]);

  it('ohne Trinkmodus kommt über 200 Seeds nie ein drinkOnly-Spiel in order', () => {
    for (let seed = 0; seed < 200; seed++) {
      const { order } = started(pool, seed, false);
      expect(order).toHaveLength(8);
      expect(order.some((id) => id === 'hammer' || id === 'farbfalle')).toBe(false);
      expect(noRepeat(order)).toBe(true);
    }
  });

  it('mit Trinkmodus kommen alle Pool-Spiele etwa gleich oft vor und nie zweimal hintereinander', () => {
    const counts = new Map<string, number>();
    for (let seed = 0; seed < 200; seed++) {
      const { order } = started(pool, seed, true);
      expect(noRepeat(order)).toBe(true);
      for (const id of order) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    expect([...counts.keys()].sort()).toEqual([...GAME_IDS].sort());
    const mean = (200 * 8) / GAME_IDS.length;
    for (const [id, n] of counts) expect(Math.abs(n - mean), id).toBeLessThan(mean * 0.15);
  });

  it('der Pool gilt auch für Nochmal', () => {
    let p = started(pool, 9, false, 3);
    p = { ...p, phase: { k: 'podium' } };
    for (let seed = 0; seed < 50; seed++)
      expect(pool.control(p, { a: 'again', seed }, 0).order.some((id) => id === 'hammer' || id === 'farbfalle')).toBe(false);
  });

  it('eine Registry nur aus einem drinkOnly-Spiel startet trotzdem (only)', () => {
    const solo = createEngine(only('hammer'));
    const p = started(solo, 3, false, 5);
    expect(p.phase.k).toBe('intro');
    expect(p.order).toEqual(['hammer', 'hammer', 'hammer', 'hammer', 'hammer']);
    const withDrink = started(solo, 3, true, 3);
    expect(withDrink.order).toEqual(['hammer', 'hammer', 'hammer']);
  });
});

describe('Trinkmodus: Rundenende', () => {
  const play = (e: typeof eng, drinking: boolean, speed = 1) => {
    let p = e.hello(e.hello(e.hello(e.create('ABCD', 42, HOST, { dev: false, speed }), HOST, 'Host', 0).p, 'a', 'a', 0).p, 'b', 'b', 0).p;
    p = e.control(p, { a: 'drinking', on: drinking }, 0);
    return advance(e.control(p, { a: 'start' }, 0), 0, 'play', undefined, e);
  };
  const finish = (e: typeof eng, p0: Party, votes: Record<string, number>, t: number): Party => {
    let p = p0;
    for (const [pid, v] of Object.entries(votes)) p = e.input(p, pid, 0, { v }, t);
    return stepAll(p, t, undefined, e);
  };
  const rowsOf = (p: Party, pid = HOST) => {
    const v = eng.viewFor(p, pid, 0);
    if (v.s !== 'result') throw new Error('result erwartet');
    return v;
  };

  it('Platz-Regel im RoundRecord und in der Result-Sicht, Zeilen in Ergebnis-Reihenfolge', () => {
    const { p: p0, t } = play(eng, true);
    const p = finish(eng, p0, { [HOST]: 3, a: 9, b: 9 }, t + 100);
    expect(p.history[0]?.drinks).toEqual({
      rows: { [HOST]: { take: 2, give: 0 }, a: { take: 0, give: 1 }, b: { take: 0, give: 1 } },
      cheers: false,
    });
    const v = rowsOf(p);
    expect(v.drinks).toEqual({
      rows: [
        { pid: 'a', take: 0, give: 1 },
        { pid: 'b', take: 0, give: 1 },
        { pid: HOST, take: 2, give: 0 },
      ],
      cheers: false,
    });
    expect(v.drinking).toBe(true);
  });

  it('ohne Eingaben stehen alle auf demselben Platz: Anstoßen, keine Zeilen', () => {
    const { p: p0, t } = play(eng, true);
    const p = stepAll(p0, t + 1000);
    expect(p.history[0]?.drinks).toEqual({ rows: {}, cheers: true });
    expect(rowsOf(p).drinks).toEqual({ rows: [], cheers: true });
  });

  it('ohne Trinkmodus ist drinks null (Record und Sicht)', () => {
    const { p: p0, t } = play(eng, false);
    const p = finish(eng, p0, { [HOST]: 3, a: 9, b: 9 }, t + 100);
    expect(p.history[0]?.drinks).toBeNull();
    expect(rowsOf(p).drinks).toBeNull();
    expect(rowsOf(p).drinking).toBe(false);
  });

  it('die Ergebnisphase dauert nur mit Trinkmodus scale(RESULT + DRINK_EXTRA)', () => {
    expect(DRINK_EXTRA).toBe(2000);
    for (const speed of [1, 10]) {
      for (const [on, extra] of [[true, DRINK_EXTRA], [false, 0]] as const) {
        const { p: p0, t } = play(eng, on, speed);
        const p = finish(eng, p0, { [HOST]: 1, a: 2, b: 3 }, t + 10);
        expect(p.phase, `speed ${speed} ${on}`).toEqual({ k: 'result', r: 0, until: t + 10 + scale(RESULT + extra, speed) });
      }
    }
  });

  it('Offline-Spieler am Rundenende bekommen keinen Schluck', () => {
    const { p: p0, t } = play(eng, true);
    let p = eng.disconnect(p0, 'b', t + 50);
    p = eng.input(p, HOST, 0, { v: 5 }, t + 100);
    p = eng.input(p, 'a', 0, { v: 1 }, t + 100);
    p = stepAll(p, t + 100, [HOST, 'a']);
    expect(p.history[0]?.drinks).toEqual({ rows: { a: { take: 1, give: 0 } }, cheers: false });
  });

  it('eigene drinks des Spiels laufen durch die Kappung: Record und DrinkPlan', () => {
    const own = createEngine({
      ...dummyRegistry(),
      ...Object.fromEntries(
        GAME_IDS.map((id) => [
          id,
          makeDummy(id, { drinks: () => ({ a: { take: 9, give: 0 }, [HOST]: { take: 1, give: 2.7 }, fremd: { take: 2, give: 2 } }) }),
        ]),
      ),
    });
    const { p: p0, t } = play(own, true);
    const p = finish(own, p0, { [HOST]: 3, a: 9, b: 9 }, t + 100);
    expect(p.history[0]?.drinks).toEqual({
      rows: { a: { take: 3, give: 0 }, [HOST]: { take: 1, give: 2 } },
      cheers: false,
    });

    const plan = createEngine({
      ...dummyRegistry(),
      ...Object.fromEntries(GAME_IDS.map((id) => [id, makeDummy(id, { drinks: () => ({ rows: {}, cheers: true }) })])),
    });
    const q0 = play(plan, true);
    const q = finish(plan, q0.p, { [HOST]: 3, a: 9, b: 9 }, q0.t + 100);
    expect(q.history[0]?.drinks).toEqual({ rows: {}, cheers: true });
    const v = plan.viewFor(q, 'a', 0);
    expect(v.s === 'result' && v.drinks).toEqual({ rows: [], cheers: true });
  });

  it('eigene drinks werden ohne Trinkmodus nicht aufgerufen', () => {
    let calls = 0;
    const own = createEngine(
      Object.fromEntries(GAME_IDS.map((id) => [id, makeDummy(id, { drinks: () => (calls++, {}) })])),
    );
    const { p: p0, t } = play(own, false);
    finish(own, p0, { [HOST]: 3 }, t + 100);
    expect(calls).toBe(0);
  });
});

describe('createEngine', () => {
  it('wirft, wenn die Registry keine GameId enthält', () => {
    expect(() => createEngine({})).toThrow();
    expect(() => createEngine({ unbekannt: makeDummy('blitz') })).toThrow();
  });
});
