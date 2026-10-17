import { describe, expect, it } from 'vitest';
import { bankProblems } from '../bankcheck';
import { TOPICS } from './topics';

const ABSENT = ['\\p{L}*eltern\\p{L}*', 'mutter\\p{L}*', 'vater\\p{L}*', 'mama', 'papa', 'oma\\p{L}*', 'opa\\p{L}*'];
const RISKY = ['drogen\\p{L}*', 'polizei\\p{L}*', 'polizist\\p{L}*', 'waffe\\p{L}*'];

describe('luegenbaron Bank', () => {
  it('bankProblems findet nichts (>= 60, >= 20 WG, <= 60 Zeichen, Abwesende und Heikles verboten)', () => {
    expect(
      bankProblems(TOPICS, {
        min: 60,
        key: (x) => x.topic,
        text: (x) => [[x.topic, 60]],
        quotas: [{ name: 'wg', of: (x) => x.wg === true, min: 20 }],
        forbid: [...ABSENT, ...RISKY],
      }),
    ).toEqual([]);
  });

  it('Themen sind Stichworte: getrimmt, ohne Fragezeichen und ohne Punkt am Ende', () => {
    for (const x of TOPICS) {
      expect(x.topic.trim(), x.topic).toBe(x.topic);
      expect(x.topic.endsWith('?'), x.topic).toBe(false);
      expect(x.topic.endsWith('.'), x.topic).toBe(false);
    }
  });

  it('Marker ist nur true oder fehlt', () => {
    for (const x of TOPICS) expect([true, undefined]).toContain(x.wg);
  });

  it('die Verbote greifen: ein Thema mit Mutter, Oma oder Polizei wird gemeldet', () => {
    const bad = [{ topic: 'Als deine Mutter anrief' }, { topic: 'Dein Besuch bei Oma' }, { topic: 'Eine Nacht mit der Polizei' }];
    const found = bankProblems(bad, { min: 1, text: (x) => [[x.topic, 60]], forbid: [...ABSENT, ...RISKY] });
    expect(found).toHaveLength(3);
  });
});
