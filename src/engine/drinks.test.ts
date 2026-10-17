import { describe, expect, it } from 'vitest';
import { capDrinks, DRINK_CAP, placeDrinks, type DrinkPlan } from './drinks';

const pids = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);
const places = (xs: number[]): Record<string, number> => Object.fromEntries(xs.map((x, i) => [`p${i}`, x]));
const all = (n: number): ReadonlySet<string> => new Set(pids(n));
const take = (...xs: [number, number][]) => Object.fromEntries(xs.map(([i, k]) => [`p${i}`, { take: k, give: 0 }]));
const plan = (rows: DrinkPlan['rows'], cheers = false): DrinkPlan => ({ rows, cheers });
const place = (xs: number[], online: ReadonlySet<string> = all(xs.length)) => placeDrinks(places(xs), online);

describe('placeDrinks: zu zweit', () => {
  it('der Letzte trinkt 1, der Sieger verteilt nichts', () => {
    expect(place([1, 2])).toEqual(plan(take([1, 1])));
    expect(place([2, 1])).toEqual(plan(take([0, 1])));
  });

  it('Gleichstand auf Platz 1: Anstoßen, niemand trinkt', () => {
    expect(place([1, 1])).toEqual(plan({}, true));
  });

  it('beide auf demselben Platz (auch Leerlauf-Platz 2): Anstoßen', () => {
    expect(place([2, 2])).toEqual(plan({}, true));
  });
});

describe('placeDrinks: 3 bis 4 Spieler', () => {
  it('n=3: Letzter 2, Sieger verteilt 1, Mitte nichts', () => {
    expect(place([1, 2, 3])).toEqual(plan({ ...take([2, 2]), p0: { take: 0, give: 1 } }));
  });

  it('n=3: mehrere Sieger verteilen je 1', () => {
    expect(place([1, 1, 3])).toEqual(
      plan({ p0: { take: 0, give: 1 }, p1: { take: 0, give: 1 }, p2: { take: 2, give: 0 } }),
    );
  });

  it('n=3: Gleichstand auf dem letzten Platz, alle Betroffenen trinken', () => {
    expect(place([1, 3, 3])).toEqual(plan({ p0: { take: 0, give: 1 }, p1: { take: 2, give: 0 }, p2: { take: 2, give: 0 } }));
  });

  it('n=3: alle auf demselben Platz: Anstoßen, niemand trinkt', () => {
    expect(place([3, 3, 3])).toEqual(plan({}, true));
    expect(place([1, 1, 1])).toEqual(plan({}, true));
  });

  it('n=4: Letzte(r) 2, Vorletzter nichts', () => {
    expect(place([1, 2, 3, 4])).toEqual(plan({ ...take([3, 2]), p0: { take: 0, give: 1 } }));
  });

  it('n=4: Gleichstand auf dem letzten Platz', () => {
    expect(place([1, 2, 4, 4])).toEqual(
      plan({ p0: { take: 0, give: 1 }, p2: { take: 2, give: 0 }, p3: { take: 2, give: 0 } }),
    );
  });
});

describe('placeDrinks: 5 bis 8 Spieler', () => {
  it('n=5: Letzter 2, Vorletzter 1, Sieger verteilt 2', () => {
    expect(place([1, 2, 3, 4, 5])).toEqual(
      plan({ p0: { take: 0, give: 2 }, p3: { take: 1, give: 0 }, p4: { take: 2, give: 0 } }),
    );
  });

  it('n=5: Gleichstand auf dem letzten Platz, Vorletzt ist der nächstgrößere Platz', () => {
    expect(place([1, 2, 3, 4, 4])).toEqual(
      plan({ p0: { take: 0, give: 2 }, p2: { take: 1, give: 0 }, p3: { take: 2, give: 0 }, p4: { take: 2, give: 0 } }),
    );
  });

  it('n=5: Vorletzt-Gruppe mit mehreren Spielern, Plätze mit Lücken', () => {
    expect(place([1, 3, 3, 5, 5])).toEqual(
      plan({
        p0: { take: 0, give: 2 },
        p1: { take: 1, give: 0 },
        p2: { take: 1, give: 0 },
        p3: { take: 2, give: 0 },
        p4: { take: 2, give: 0 },
      }),
    );
  });

  it('n=5: alle außer einem siegen, es gibt keinen Vorletzten', () => {
    expect(place([1, 1, 1, 1, 5])).toEqual(
      plan({
        p0: { take: 0, give: 2 },
        p1: { take: 0, give: 2 },
        p2: { take: 0, give: 2 },
        p3: { take: 0, give: 2 },
        p4: { take: 2, give: 0 },
      }),
    );
  });

  it('n=5: Vorletzt zählt nur, wenn der Platz größer als 1 ist', () => {
    const out = place([1, 1, 1, 1, 1]);
    expect(out).toEqual(plan({}, true));
    const two = place([1, 1, 3, 3, 3]);
    expect(two.rows.p2).toEqual({ take: 2, give: 0 });
    expect(two.rows.p0).toEqual({ take: 0, give: 2 });
    expect(Object.keys(two.rows)).toEqual(['p0', 'p1', 'p2', 'p3', 'p4']);
  });

  it('n=8: Letzter 2, Vorletzter 1, Sieger verteilt 2', () => {
    expect(place([1, 2, 3, 4, 5, 6, 7, 8])).toEqual(
      plan({ p0: { take: 0, give: 2 }, p6: { take: 1, give: 0 }, p7: { take: 2, give: 0 } }),
    );
  });

  it('n=8: mehrere Sieger, Gleichstand hinten', () => {
    expect(place([1, 1, 3, 4, 5, 6, 7, 7])).toEqual(
      plan({
        p0: { take: 0, give: 2 },
        p1: { take: 0, give: 2 },
        p5: { take: 1, give: 0 },
        p6: { take: 2, give: 0 },
        p7: { take: 2, give: 0 },
      }),
    );
  });

  it('n=8: alle auf demselben Platz: Anstoßen', () => {
    expect(place([8, 8, 8, 8, 8, 8, 8, 8])).toEqual(plan({}, true));
  });
});

describe('placeDrinks: Offline und kleine Gruppen', () => {
  it('Offline-Spieler zählen nicht mit und bekommen nichts', () => {
    const out = placeDrinks(places([1, 2, 3]), new Set(['p0', 'p1']));
    expect(out).toEqual(plan(take([1, 1])));
    expect(out.rows.p2).toBeUndefined();
  });

  it('n zählt nur Online-Spieler: 4 online ergeben die Regel für 3 bis 4', () => {
    const out = placeDrinks(places([1, 2, 3, 4, 5]), new Set(['p0', 'p1', 'p2', 'p4']));
    expect(out.rows).toEqual({ p0: { take: 0, give: 1 }, p4: { take: 2, give: 0 } });
  });

  it('nach dem Offline-Abzug zählt n der Online-Spieler: 5 Plätze mit 2 online ist eine Duo-Runde', () => {
    const out = placeDrinks(places([1, 2, 3, 4, 5]), new Set(['p1', 'p4']));
    expect(out).toEqual(plan(take([4, 1])));
  });

  it('ein Online-Spieler oder keiner: leerer Plan ohne Anstoßen', () => {
    expect(placeDrinks(places([1, 2, 3]), new Set(['p1']))).toEqual(plan({}));
    expect(placeDrinks(places([1, 2, 3]), new Set())).toEqual(plan({}));
    expect(placeDrinks({}, new Set())).toEqual(plan({}));
    expect(place([1])).toEqual(plan({}));
  });

  it('Online-Pids ohne Platz werden ignoriert', () => {
    expect(placeDrinks(places([1, 2]), new Set(['p0', 'p1', 'fremd']))).toEqual(plan(take([1, 1])));
  });

  it('die Eingabe bleibt unverändert', () => {
    const input = places([1, 2, 3]);
    const before = structuredClone(input);
    place([1, 2, 3]);
    placeDrinks(input, all(3));
    expect(input).toEqual(before);
  });
});

describe('capDrinks', () => {
  const online = new Set(['a', 'b']);

  it('DRINK_CAP ist 3', () => {
    expect(DRINK_CAP).toBe(3);
  });

  it('kappt auf ganzzahlig 0..3, rundet ab, NaN wird 0, entfernt Offline und Unbekannte', () => {
    const out = capDrinks(
      {
        a: { take: 5, give: -2 },
        b: { take: 2.9, give: Number.NaN },
        off: { take: 2, give: 1 },
        ghost: { take: 1, give: 1 },
      },
      online,
    );
    expect(out).toEqual(plan({ a: { take: 3, give: 0 }, b: { take: 2, give: 0 } }));
  });

  it('Infinity wird auf die Kappung gesetzt, -Infinity auf 0', () => {
    const out = capDrinks({ a: { take: Infinity, give: -Infinity } }, online);
    expect(out.rows.a).toEqual({ take: 3, give: 0 });
  });

  it('Zeilen ohne Schluck fallen weg', () => {
    expect(capDrinks({ a: { take: 0, give: 0 }, b: { take: 0.4, give: 0 } }, online)).toEqual(plan({}));
  });

  it('Record und DrinkPlan laufen durch dieselbe Kappung', () => {
    const rows = { a: { take: 9, give: 1.5 }, b: { take: 1, give: 7 }, x: { take: 1, give: 1 } };
    const viaRecord = capDrinks(rows, online);
    const viaPlan = capDrinks({ rows, cheers: false }, online);
    expect(viaPlan).toEqual(viaRecord);
    expect(viaRecord.rows).toEqual({ a: { take: 3, give: 1 }, b: { take: 1, give: 3 } });
  });

  it('cheers bleibt nur ohne Schluck: mit take verschwindet es', () => {
    expect(capDrinks({ rows: {}, cheers: true }, online)).toEqual(plan({}, true));
    expect(capDrinks({ rows: { a: { take: 0, give: 2 } }, cheers: true }, online)).toEqual(
      plan({ a: { take: 0, give: 2 } }, true),
    );
    expect(capDrinks({ rows: { a: { take: 1, give: 0 } }, cheers: true }, online).cheers).toBe(false);
  });

  it('cheers bleibt auch dann ohne Wirkung, wenn der Schluck von Offline stammt', () => {
    expect(capDrinks({ rows: { off: { take: 2, give: 0 } }, cheers: true }, online)).toEqual(plan({}, true));
  });

  it('ein Record mit der pid "rows" wird nicht als DrinkPlan gelesen', () => {
    const out = capDrinks({ rows: { take: 2, give: 0 } }, new Set(['rows']));
    expect(out).toEqual(plan({ rows: { take: 2, give: 0 } }));
  });

  it('ein Record liefert nie cheers', () => {
    expect(capDrinks({}, online)).toEqual(plan({}));
  });

  it('die Eingabe bleibt unverändert', () => {
    const raw = { a: { take: 9, give: 9 } };
    const before = structuredClone(raw);
    capDrinks(raw, online);
    expect(raw).toEqual(before);
  });
});
