import { describe, expect, it } from 'vitest';
import { bankProblems } from '../bankcheck';
import { norm } from '../match';
import { MISSIONS, TOPICS } from './missions';

const ABSENT = ['\\p{L}*eltern\\p{L}*', 'mutter\\p{L}*', 'vater\\p{L}*', 'mama', 'papa', 'oma\\p{L}*', 'opa\\p{L}*'];
const NO_TOUCH_POST_PAY = [
  'anfass\\p{L}*',
  'berühr\\p{L}*',
  'umarm\\p{L}*',
  'küss\\p{L}*',
  'kuss',
  'foto\\p{L}*',
  'selfie\\p{L}*',
  'poste\\p{L}*',
  'instagram',
  'tiktok',
  'geld',
  'euro',
  'bezahl\\p{L}*',
  'kaufen',
  'drogen\\p{L}*',
  'polizei\\p{L}*',
  'waffe\\p{L}*',
];
const FORBID = [...ABSENT, ...NO_TOUCH_POST_PAY];

describe('pokerface Missionen', () => {
  it('bankProblems findet nichts (>= 50, <= 80 Zeichen, keine Dublette, nichts Verbotenes)', () => {
    expect(bankProblems(MISSIONS, { min: 50, key: (x) => x.mission, text: (x) => [[x.mission, 80]], forbid: FORBID })).toEqual([]);
  });

  it('Missionen sind getrimmt, ohne Anfuehrungszeichen und Backslash (JSON-sicher), einmalig nach norm', () => {
    for (const x of MISSIONS) {
      expect(x.mission.trim(), x.mission).toBe(x.mission);
      expect(x.mission, x.mission).not.toMatch(/["\\]/);
    }
    expect(new Set(MISSIONS.map((x) => norm(x.mission))).size).toBe(MISSIONS.length);
  });

  it('die Verbote greifen: Anfassen, Posten und Geld werden gemeldet', () => {
    const bad = [{ mission: 'Berühre unauffällig die Schulter' }, { mission: 'Poste ein Foto vom Tisch' }, { mission: 'Biete Geld für den Platz' }];
    expect(bankProblems(bad, { min: 1, text: (x) => [[x.mission, 80]], forbid: FORBID }).length).toBeGreaterThanOrEqual(3);
  });
});

describe('pokerface Gespraechsthemen', () => {
  it('bankProblems findet nichts (>= 15, <= 60 Zeichen)', () => {
    expect(bankProblems(TOPICS, { min: 15, key: (x) => x.topic, text: (x) => [[x.topic, 60]], forbid: FORBID })).toEqual([]);
  });

  it('Themen sind getrimmt, ohne Anfuehrungszeichen und Backslash', () => {
    for (const x of TOPICS) {
      expect(x.topic.trim(), x.topic).toBe(x.topic);
      expect(x.topic, x.topic).not.toMatch(/["\\]/);
    }
  });
});
