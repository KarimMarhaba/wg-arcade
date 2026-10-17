import { describe, expect, it } from 'vitest';
import { bankProblems } from '../bankcheck';
import { norm } from '../match';
import { TERMS } from './terms';

const FORBID = ['\\p{L}*eltern\\p{L}*', 'mutter\\p{L}*', 'vater\\p{L}*', 'mama', 'papa', 'polizei\\p{L}*', 'waffe\\p{L}*', 'drogen\\p{L}*'];

describe('erklaerbaer Bank', () => {
  it('bankProblems findet nichts (>= 150, >= 40 mime, Begriff und Tabus <= 18 Zeichen)', () => {
    expect(
      bankProblems(TERMS, {
        min: 150,
        key: (x) => x.term,
        text: (x) => [[x.term, 18], ...x.taboo.map((t) => [t, 18] as const)],
        quotas: [{ name: 'mime', of: (x) => x.mime === true, min: 40 }],
        forbid: FORBID,
      }),
    ).toEqual([]);
  });

  it('jeder Eintrag hat genau 3 Tabus, untereinander verschieden', () => {
    for (const x of TERMS) {
      expect(x.taboo, x.term).toHaveLength(3);
      expect(new Set(x.taboo.map(norm)).size, x.term).toBe(3);
    }
  });

  it('Tabus sind nicht der Begriff und per norm in keiner Richtung Teilwort des Begriffs', () => {
    for (const x of TERMS) {
      const t = norm(x.term);
      for (const w of x.taboo) {
        const n = norm(w);
        expect(n, `${x.term} / ${w}`).not.toBe('');
        expect(n === t, `${x.term} / ${w}: gleich`).toBe(false);
        expect(t.includes(n), `${x.term} / ${w}: Tabu steckt im Begriff`).toBe(false);
        expect(n.includes(t), `${x.term} / ${w}: Begriff steckt im Tabu`).toBe(false);
      }
    }
  });

  it('Stummfilm-Karten: mindestens 40, hoechstens 40 Prozent der Bank, Marker nur true oder fehlt', () => {
    const mime = TERMS.filter((x) => x.mime === true).length;
    expect(mime).toBeGreaterThanOrEqual(40);
    expect(mime / TERMS.length).toBeLessThanOrEqual(0.4);
    for (const x of TERMS) expect([true, undefined]).toContain(x.mime);
  });

  it('Texte sind getrimmt, ohne Anfuehrungszeichen und Backslash (JSON-sicher)', () => {
    for (const x of TERMS)
      for (const w of [x.term, ...x.taboo]) {
        expect(w.trim(), w).toBe(w);
        expect(w, w).not.toMatch(/["\\]/);
      }
  });

  it('die Pruefungen greifen: Tabu im Begriff, doppeltes Tabu, zu langer Begriff', () => {
    const bad = [
      { term: 'Apfelsaft', taboo: ['Saft', 'Frucht', 'Trinken'] },
      { term: 'Kühlschrank', taboo: ['Kalt', 'kalt', 'Essen'] },
      { term: 'Dampfschifffahrtsgesellschaft', taboo: ['Schiff', 'Meer', 'Dampf'] },
    ];
    expect(bankProblems(bad, { min: 1, text: (x) => [[x.term, 18], ...x.taboo.map((t) => [t, 18] as const)] }).some((p) => p.includes('zu lang'))).toBe(true);
    const contained = bad.filter((x) => x.taboo.some((w) => norm(x.term).includes(norm(w))));
    expect(contained.map((x) => x.term)).toEqual(["Apfelsaft", "Dampfschifffahrtsgesellschaft"]);
    expect(new Set((bad[1] as (typeof bad)[number]).taboo.map(norm)).size).toBe(2);
  });
});
