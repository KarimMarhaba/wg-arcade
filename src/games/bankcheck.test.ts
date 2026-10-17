import { describe, expect, it } from 'vitest';
import { bankProblems, type BankOpts } from './bankcheck';

interface Item {
  q: string;
  u?: string;
  wg?: true;
}

const opts = (over: Partial<BankOpts<Item>> = {}): BankOpts<Item> => ({
  min: 1,
  text: (x) => [[x.q, 40], ...(x.u === undefined ? [] : ([[x.u, 10]] as [string, number][]))],
  ...over,
});

const some = (probs: string[], needle: string): boolean => probs.some((p) => p.includes(needle));

describe('bankProblems: Befunde', () => {
  it('Mindestzahl', () => {
    expect(some(bankProblems([{ q: 'Eins' }], opts({ min: 3 })), 'mindestens 3')).toBe(true);
    expect(bankProblems([{ q: 'Eins' }], opts({ min: 1 }))).toEqual([]);
  });

  it('leere Pflichtfelder', () => {
    expect(some(bankProblems([{ q: '   ' }], opts()), 'leer')).toBe(true);
    expect(some(bankProblems([{ q: 'Frage', u: '' }], opts()), 'leer')).toBe(true);
    expect(bankProblems([{ q: 'Frage' }], opts())).toEqual([]);
  });

  it('Dubletten über norm(key(x))', () => {
    const p = bankProblems([{ q: 'Käse?' }, { q: 'KAESE' }], opts());
    expect(some(p, 'Dublette')).toBe(true);
    expect(bankProblems([{ q: 'Käse' }, { q: 'Brot' }], opts())).toEqual([]);
  });

  it('key wählt das Dubletten-Feld; gleiche Optionen über verschiedene Fragen sind keine Dublette', () => {
    const items = [{ q: 'A?', u: 'Ja' }, { q: 'B?', u: 'Ja' }];
    expect(bankProblems(items, opts({ key: (x) => x.q }))).toEqual([]);
    expect(some(bankProblems(items, opts({ key: (x) => x.u ?? '' })), 'Dublette')).toBe(true);
  });

  it('Längengrenze je String', () => {
    const p = bankProblems([{ q: 'x'.repeat(41) }, { q: 'ok', u: 'y'.repeat(11) }], opts());
    expect(p.filter((m) => m.includes('zu lang'))).toHaveLength(2);
    expect(bankProblems([{ q: 'x'.repeat(40), u: 'y'.repeat(10) }], opts())).toEqual([]);
  });

  it('verfehlte Quoten', () => {
    const quotas = [{ name: 'wg', of: (x: Item) => x.wg === true, min: 2 }];
    const items = [{ q: 'a', wg: true as const }, { q: 'b' }];
    expect(some(bankProblems(items, opts({ quotas })), 'Quote wg')).toBe(true);
    expect(bankProblems([...items, { q: 'c', wg: true as const }], opts({ quotas }))).toEqual([]);
  });
});

describe('bankProblems: Verbots-Lint', () => {
  it('meldet „Ex“ als ganzes Wort, auch groß und mit Satzzeichen', () => {
    expect(some(bankProblems([{ q: 'Dein Ex ruft an' }], opts()), 'Ex')).toBe(true);
    expect(some(bankProblems([{ q: 'ex.' }], opts()), 'Verbot')).toBe(true);
  });

  it('meldet „Sexualität“ über den Stamm', () => {
    expect(some(bankProblems([{ q: 'Über Sexualität reden' }], opts()), 'Verbot')).toBe(true);
  });

  it('Muster mit Umlaut am Rand treffen (Unicode-Wortgrenze)', () => {
    expect(some(bankProblems([{ q: 'Das ist Übergewicht' }], opts()), 'Verbot')).toBe(true);
    expect(some(bankProblems([{ q: 'Wer ist jüdisch?' }], opts()), 'Verbot')).toBe(true);
    expect(some(bankProblems([{ q: 'Der Schlö' }], opts({ forbid: ['schlö'] })), 'Verbot')).toBe(true);
    expect(some(bankProblems([{ q: 'Ärger gibt es' }], opts({ forbid: ['ärger'] })), 'Verbot')).toBe(true);
  });

  it('Zusatzliste greift nur mit forbid', () => {
    const items = [{ q: 'Wer zahlt das Geld?' }, { q: 'Küssen verboten' }];
    expect(bankProblems(items, opts())).toEqual([]);
    const p = bankProblems(items, opts({ forbid: ['geld', 'küss\\p{L}*'] }));
    expect(p.filter((m) => m.includes('Verbot'))).toHaveLength(2);
  });

  it('meldet je Feld, nicht nur die Frage', () => {
    expect(some(bankProblems([{ q: 'Frage', u: 'Sex' }], opts()), 'Verbot')).toBe(true);
  });
});

const CATEGORIES: Record<string, { hits: string[]; clean: string[] }> = {
  Aussehen: {
    hits: ['Wer ist hübscher?', 'Dein Aussehen', 'Wer ist dick?', 'Wer ist fett?', 'Eine neue Frisur', 'Wer ist attraktiver?', 'Dein Körper'],
    clean: ['Ein Fettnäpfchen', 'Dicke Luft im Flur', 'Ein dicker Pullover', 'Die Fettpfanne'],
  },
  Herkunft: {
    hits: ['Deine Herkunft', 'Ein Ausländer', 'Dein Akzent', 'Welche Nationalität?', 'Ein Migrant'],
    clean: ['Woher kommt der Käse?', 'Die Wurzel des Wortes'],
  },
  Religion: {
    hits: ['Deine Religion', 'Jeden Sonntag in die Kirche', 'Oh Gott', 'Ein Atheist', 'Der Islam', 'Die Bibel'],
    clean: ['Götterspeise zum Nachtisch', 'Er ist ein Christbaum-Fan'],
  },
  Sexualität: {
    hits: ['Deine Sexualität', 'Ist er hetero?', 'Ein Pornofilm', 'Nackt baden', 'Queer sein'],
    clean: ['Homeoffice am Montag', 'Das erste Date', 'Ein Fettnäpfchen beim ersten Date'],
  },
  Alkohol: {
    hits: ['Ein Glas Wein', 'Zu viel Alkohol', 'Der Kater am Morgen', 'Ein Shot Tequila', 'Wer ist betrunken?', 'Bier oder Wein?', 'Ein Cocktail', 'Ein Glühwein'],
    clean: ['Weinen beim Film', 'Insekten im Bad', 'Eine Biene im Zimmer', 'Die Katze der WG', 'Der Sektor Nord'],
  },
};

describe('bankProblems: erweiterte Standard-Verbotsliste', () => {
  for (const [name, c] of Object.entries(CATEGORIES)) {
    it(`${name}: jedes meldende Fixture wird gefunden`, () => {
      for (const q of c.hits) expect(some(bankProblems([{ q }], opts()), 'Verbot'), q).toBe(true);
    });

    it(`${name}: saubere Fixtures bleiben ohne Befund`, () => {
      for (const q of c.clean) expect(bankProblems([{ q }], opts()), q).toEqual([]);
    });
  }
});

describe('bankProblems: sauberes Fixture', () => {
  it('kein Fehlalarm bei Experiment, Extrawurst, Europäische Union, erstes Date', () => {
    const items = [
      { q: 'Ein Experiment' },
      { q: 'Eine Extrawurst' },
      { q: 'Die Europäische Union' },
      { q: 'Das erste Date' },
      { q: 'Exakt so' },
      { q: 'Wer tritt in jedes Fettnäpfchen?' },
      { q: 'Wo herrscht dicke Luft?' },
      { q: 'Ein erstes Date im Kino' },
    ];
    expect(bankProblems(items, opts({ min: 5, forbid: ['geld', 'euro'] }))).toEqual([]);
  });
});
