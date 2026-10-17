# mvp — Schritt 4: Spiellogik (blitz, hammer, farbfalle, schaetzfuchs), Fragenbank, Registry (Abgleich)

Master-Plan §5, §9 D-6/D-9, §10 Schritt 4. Basis `hew/mvp` @ 429584e (Schritt 3, 211 Unit-Tests grün).
Jeder Shell-Aufruf: `export PATH="$HOME/.local/share/herdr-web-ui/node/bin:$PATH"`.

## 1. Abgleich (gemessen 2026-10-17)
| Annahme | Befund | Korrektur |
|---|---|---|
| `index.ts` exportiert `GAMES`, `GAME_IDS` | `GAME_IDS`/`GameId` liegen seit Schritt 1 in `games/types.ts` (DECISIONS), Engine und `config.ts` importieren von dort | `index.ts` re-exportiert `GAME_IDS` nur. Neu ist `GAMES: Record<GameId, GameDef<any, any, any>>` |
| `GameDef`, `PlayerRef`, `GameCtx`, Dauern | stehen vollständig in `games/types.ts` bzw. `engine/durations.ts` (inkl. `scale`, `GRACE`, `BLITZ_MAX`) | nur importieren, nichts ändern. Hammer-Cap 200 ist eine Konstante im Spiel |
| `dur` / `endsAt` / `hardEnd` | §5 nennt `hardEnd` nur bei blitz, §4.3 „Annahme bis started + dur + GRACE“ | einheitlich: `endsAt = now(init) + dur` (in der Sicht), `hardEnd = endsAt + GRACE`. Annahme gilt bei `now < hardEnd`, `done` bei `now ≥ hardEnd`. blitz: `dur = Σwaits + 3·(scale(BLITZ_SHOW) + BLITZ_MAX)`. schaetzfuchs: Tipps bis `askEnd + GRACE` |
| farbfalle `seq` = 400 × `{word, ink}` in der Sicht | gemessen: `view`-Nachricht mit 8 Spielern = 12 771 Zeichen. `parseEnvelope` verwirft > 16 384 (`MAX_RAW`) **still**. Jede Antwort schickt die Sicht erneut | `seq` als Index-Paare `[word, ink]` über `FF_COLORS` (gemessen 3 571 Zeichen). Die Eingabe `c` ist ebenfalls ein Index 0..3 |
| `colors.ts` mit Hex-Werten | Schritt-6-DoD: keine Hex-Werte außerhalb `tokens.css`/`palette.ts` (grep) | `colors.ts` enthält nur `id` (`rot|blau|gelb|weiss`, wie `data-ink`) und das Wort. Die Hex-Werte aus D-6 kommen als `--ff-rot|--ff-blau|--ff-gelb|--ff-weiss` in `tokens.css` |
| hammer `final: Set` | Der State muss unveränderlich sein und per `structuredClone` vergleichbar | reversibel gewählt: nur Records und Arrays im State, kein Set und keine Map |
| farbfalle `leader` (optional) | Das Design kennt ihn nicht. Er würde bei jeder Antwort die Sicht aller ändern | weglassen |
| „keine DOM-Imports in logic.ts“ | `tsconfig` `lib` enthält DOM, `document` ginge also auch ohne Import | Reinheitstest nach dem Muster von `engine/purity.test.ts` |
| DoD „≥ 8 Tests je Spiel“ | zählt nur | ersetzt durch Verhaltenspunkte |
| Registry ohne passende Ids | Review Schritt 3 [MINOR]: `planOrder` mit `ids = []` endet nie, `start` hängt den Host-Tab | `createEngine` wirft, wenn die Registry keine `GameId` enthält (eine Zeile plus Test in `party.test.ts`) |

## 2. Entscheidungen & Fallen
- **Ohne Eingabe kein Ergebnis** (reversibel gewählt, in DECISIONS): blitz, hammer und farbfalle tragen in `result` nur Spieler ein, die mindestens eine gültige Eingabe hatten. Der Client meldet immer etwas (blitz 1000 bei Kein-Tap, hammer `final`, farbfalle `done`). Ohne die Regel bekäme bei 2 Spielern ein abwesender, aber online gemeldeter Spieler 3 Punkte. Label in dem Fall `–`. blitz: fehlende Versuche eines Teilnehmers zählen 1000.
- **Früh-Ende** (alle Spiele): Es zählen nur Teilnehmer aus `init`. Das Spiel endet früh, wenn es mindestens einen Online-Teilnehmer gibt und alle Online-Teilnehmer fertig sind (wie dummygame mit `online.size > 0`). Offline-Spieler blockieren nicht.
- **Referenzen:** Ignorierte Eingaben (unbekannte pid, zu spät, doppelt, nach dem eigenen Fertig) und ein No-op-`tick` liefern dieselbe Referenz. Die Engine verlässt sich darauf (`state === ph.state`).
- **parseInput** wirft nie. Abgelehnt werden Nicht-Objekte, Arrays, falsche Typen sowie `NaN` und `±Infinity`.
  - blitz: `i` ist eine ganze Zahl 0..2. `early === true` hat Vorrang vor `ms`, sonst muss `ms` endlich sein und wird auf [0, 1000] geklemmt.
  - hammer: `n` ist eine ganze Zahl ≥ 0, geklemmt auf 200. `final` gilt nur bei `=== true`. Das Maximum zählt, nach `final` ist der Wert eingefroren.
  - farbfalle: entweder `{i, c}` (`i` ganze Zahl ≥ 0, `c` 0..3) oder `{done: true}`. Ein Spieler ist fertig nach `done` oder bei `next === seq.length`.
  - schaetzfuchs: `guess` ist eine endliche Zahl in 0..1e12 (der String `"42"` ergibt null). Genau ein Tipp, nur in `ask`.
- **Labels:** blitz `"742 ms"` (Summe), hammer `"57 Taps"`/`"1 Tap"`, farbfalle `"+12"`/`"−3"` (U+2212)/`"0"`, schaetzfuchs `"±8 %"` (gerundete Prozent), ohne Ergebnis `"–"`. Schritt 7 prüft per Regex (`/\d+ ms/`).
- **Schätzfuchs-Geheimnis:**
  - Die Ask-Sicht hat genau die Felder aus §5. Falle: Wird das Frage-Objekt per Spread übernommen, leakt `a`.
  - `total` ist die Teilnehmerzahl aus `init`, weil `view` das Online-Set nicht kennt.
  - Reveal-Liste: nach Fehler aufsteigend, Spieler ohne Tipp hinten, bei Gleichstand Beitrittsreihenfolge.
- **Farbfolge:** deterministisch aus `mulberry32(seed)`, 400 Paare, `ink ≠ word`, kein Paar gleich dem vorigen.
- **Fragen:** nur Definitions-, Zähl- und Lehrbuchwerte, ganzzahlig, ohne „ca.“. Weglassen, sobald Quellen auseinandergehen (Flusslängen, Seeflächen, Bauwerke mit Antenne), plus die Ausschlüsse aus §5. Die Zahl steht weder in `q` noch in `unit`. Lieber 45 sichere als 60 wacklige.
- **Exports:** Jedes Spiel exportiert `export const <id>: GameDef<…>` und zusätzlich seine Sicht- und Eingabetypen. Die Views aus Schritt 7 holen sie nur per `import type`.
- **Tests:** `now` als Zahl, kein `fakeclock`, jede Schleife mit Obergrenze (wie `advance` in `party.test.ts`). Die Engine-Tests bleiben auf dummygame; Akzente prüft die Integration mit echten Spielen (Lehre aus Schritt 3).
- **Commits** (Lehren aus Schritt 2/3): Test-Commit nur `*.test.ts`, rot, Vitest-Zusammenfassung im Body; danach die Implementierung mit grüner Zusammenfassung. Testkorrekturen und Fix-Runden ebenso (erst roter Test-Commit mit Zusammenfassung, dann Fix, nie gebündelt).

## 3. Dateien (nur Nicht-Offensichtliches)
- Neu: `src/games/index.test.ts` (Registry und Engine-Integration), `src/games/purity.test.ts`.
- Geändert: `src/engine/party.ts` plus `party.test.ts` (Leer-Guard), `src/ui/tokens.css` (nur die 4 Farbfalle-Tokens), `DECISIONS.md`.

## 4. DoD
1. blitz:
   - Gleicher Seed ergibt dieselben 3 `waits` für alle, in `[scale(1500), scale(4000)]` bei speed 1 und 10. `dur`, `endsAt` und `hardEnd` folgen §1.
   - Eingaben: Frühstart zählt 1000, `ms` wird geklemmt, je `i` zählt der erste Wert. Bei `hardEnd − 1` wird angenommen, bei `hardEnd` ignoriert.
   - Früh-Ende, sobald alle Online-Teilnehmer 3 Versuche haben.
   - `result = −Σ` (fehlende Versuche = 1000), der schnellere Spieler liegt höher. Label `"742 ms"`. Sicht `{waits, show, max, mine, progress, endsAt, dur}`.
2. hammer:
   - Der Zähler ist monoton (Maximum gilt), gedeckelt auf 200 und nach `final` eingefroren.
   - `done` bei `hardEnd` oder wenn alle Online-Teilnehmer `final` gemeldet haben.
   - `bars` aller Spieler in Beitrittsreihenfolge in jeder Sicht. `result = n`, Label `"57 Taps"` bzw. `"1 Tap"`.
3. farbfalle:
   - Die Folge ist je Seed deterministisch: 400 Index-Paare, `ink ≠ word`, nie dasselbe Paar hintereinander.
   - Gezählt wird nur `i === next`: richtig +1, falsch −1. Eingaben ab `hardEnd` und nach `done` werden ignoriert.
   - `result = score`, Label `"+12"`, `"−3"` bzw. `"0"`.
4. schaetzfuchs:
   - Die Frage ist je Seed deterministisch. Nur ein Tipp, nur in `ask`. `NaN`, negativ, > 1e12, `Infinity` und String ergeben null bei `parseInput`.
   - Die Auflösung kommt früh, sobald alle Online-Teilnehmer getippt haben, sonst bei `askEnd + GRACE`. `done` ab `revealEnd`.
   - `result = −|g−a|/a`, ohne Tipp kein Eintrag. Die Reveal-Sicht zeigt die Antwort und die Tipps sortiert.
   - In `ask` enthält keine Sicht die Antwort oder einen fremden Tipp. Geprüft per JSON mit markantem Tipp-Wert und exakter Feldmenge.
5. Alle 4 Spiele:
   - `parseInput` wirft nie und lehnt Müll ab.
   - Ignorierte Eingaben und ein No-op-`tick` liefern dieselbe Referenz. Kein `input`/`tick` verändert seinen Eingangs-State (`structuredClone`).
   - `view` ist bei gleichem State und anderem `now` JSON-gleich. `view` und `label` werfen nicht für eine unbekannte pid.
   - Spieler ohne jede Eingabe haben keinen `result`-Eintrag und das Label `"–"`.
6. Die Spiel-Sicht `g` jedes Spiels ist mit 8 Teilnehmern als JSON < 6000 Zeichen, auch die Schätzfuchs-Auflösung mit 8 Tipps.
7. `questions.test.ts`: ≥ 40 Einträge, `q` endet mit `?`, `a` ist ganzzahlig > 0, `unit` ist nicht leer, keine doppelten `q` (ohne Groß/Klein).
8. Registry:
   - `GAMES[id].id === id` für alle `GAME_IDS`, mit vier verschiedenen Akzenten lime/hot/cyan/orange.
   - `createEngine` mit einer Registry ohne passende `GameId` wirft, statt bei `start` zu hängen.
9. Integration `createEngine(GAMES)` mit dev, speed 10, 5 Runden und nur Ticks:
   - Das Podium wird in begrenzter Tick-Zahl erreicht, `order` enthält alle 4 Spiele.
   - Die Intro-Sicht jeder Runde trägt Titel und Akzent des Spiels `order[r]`.
10. Integration mit 2 Spielern und Draht-Payloads über `engine.input`: In jedem der 4 Spiele bekommt der bessere Spieler Platz 1 und 5 Punkte.
11. Reinheit (Test): `src/games/*/logic.ts`, `questions.ts`, `colors.ts` und `index.ts` nutzen weder `Date`, `Math.random`, `performance`, `crypto`, `document` noch `window`, und sie importieren nichts aus `src/ui` oder `view`.
12. `DECISIONS.md` hat datierte Einträge für D-6 (Farben, Hex als `--ff-*`-Tokens, `colors.ts` ohne Hex), D-9 und „Ohne Eingabe kein Ergebnis“.
13. TDD: tests written first (separate test-commit before impl), meaningfully cover the change, red→green captured

## 5. Out-of-Scope
- Spiel-Views und `views.ts` (Schritt 7). `host.ts`, `client.ts`, `fakeclock` und der `?only=`-Filter (Schritt 5). `palette.ts` und die übrigen Tokens (Schritt 6).
- Keine Änderungen an `src/net/`, `engine/view.ts`, `durations.ts` und `dummygame.ts`.
