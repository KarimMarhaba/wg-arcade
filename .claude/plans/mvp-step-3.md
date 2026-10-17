# mvp — Schritt 3: Engine (rein) (Abgleich)

Master-Plan §3.3–§3.6, §4.5, §9 D-2/D-5/D-7, §10 Schritt 3. Basis `hew/mvp` @ 80ee1f2 (Schritt 2, 138 Unit-Tests grün).
Jeder Shell-Aufruf: `export PATH="$HOME/.local/share/herdr-web-ui/node/bin:$PATH"`.

## 1. Abgleich (gemessen 2026-10-17)
| Annahme | Befund | Korrektur |
|---|---|---|
| `src/engine/view.ts` in Schritt 3 anlegen | existiert seit Schritt 2 wortgleich nach §3.6 | nicht anfassen, nur importieren |
| `games/types.ts` „GameDef und Client-Typen nach §3.4“ | Datei hat nur `GAME_IDS`/`GameId`. `ViewCtx` braucht `Sfx`/`Fx` (Schritt 6), `Mounted`/`Render` gehören zu D-3 (Schritt 5) | jetzt nur `PlayerRef`, `GameCtx`, `GameDef` ergänzen, `GAME_IDS` bleibt. Client-Typen in Schritt 5 |
| `fakeclock.ts` in Schritt 3 | Die Reducer bekommen `now` als Zahl. Erster Nutzer von `every`/`after` ist `host.ts`/`client.ts` (Schritt 5) | **nicht** bauen. Party-Tests treiben ein einfaches `t` (Schleife in 100-ms-Schritten) |
| `HostAction` `{a:'lobby'}` ohne Seed | Nach „Neue Party“ und `start` wären `order` und alle Runden-Seeds identisch mit der ersten Party (gleiche Blitz-Wartezeiten, gleiche Frage) | reversibel gewählt: `{a:'lobby'; seed}` wie `again`. Die Laufzeit (Schritt 5) übergibt `randomSeed()`. Kommt in D-5 |
| `create(code, seed, hostPid, o)` | Hat keinen Namen. Laut §4.2 tritt der Host per Loopback-`hello` bei | `create` liefert `players: []`, `rounds: 5` (Design-Default), `order: []`, `history: []`. Der Host bekommt seine Farbe beim `hello` nach derselben Regel |
| Spiel-IDs für `planOrder` | Die Registry ist `Record<string, GameDef>`, die Reihenfolge der Keys hängt vom Einfügen ab | reversibel: `ids = GAME_IDS.filter(id => id in games)`. `only` filtert später die Laufzeit über die Registry, die Engine kennt es nicht |
| `rank` auch für das Podium | `rank` lässt Offline-Spieler aus. Laut Design bleiben sie aber im Punktestand | Podium-Platz = 1 + #(strikt höhere `total`) über **alle** Spieler, nicht über `rank` |
| DoD „≥ 30 Assertions“ | Zählt nur, prüft kein Verhalten | entfällt zugunsten der Verhaltenspunkte |
| `crypto` | `getRandomValues` ist in Node 22 global und braucht keinen secure context (anders als `randomUUID`, Lehre Schritt 2) | `randomSeed` nutzt nur `getRandomValues`. Das zählt für den WLAN-Test über `http://` |

## 2. Entscheidungen & Fallen
- **`hello`-Reihenfolge** (reversibel gewählt):
  1. Bekannte `pid` → immer `ok`, der Name wird ignoriert, `online = true`, `lastSeen = now`.
  2. `name.trim()` hat nicht 1–12 Zeichen → `badname`.
  3. Phase ≠ `lobby` → `started`.
  4. 8 Spieler → `full`.

  Bei einer Ablehnung kommt dieselbe Referenz zurück. Gespeichert wird der getrimmte Name. Der Dubletten-Vergleich ignoriert Groß/Klein und prüft den ganzen Kandidaten („Anna 2“). Der Anhang darf 12 Zeichen überschreiten.
- **`seen`** setzt `lastSeen` und `online = true`, damit ein Spieler nach einer Funkstille ohne neues `hello` wieder online ist. Eine unbekannte `pid` liefert dieselbe Referenz.
- **Host:** `hostPid` wird nie offline und nie entfernt. `disconnect(hostPid)` und der Timeout ignorieren ihn.
- **`tick`-Ablauf:**
  1. Online-Status aktualisieren: `now - lastSeen > OFFLINE` (strikt, 6000 gilt noch als online). In der Lobby wird der Spieler entfernt, sonst offline gesetzt.
  2. Höchstens **ein** Phasenübergang pro Aufruf.
  3. In `play`: `state = def.tick(state, now, onlineSet)`, danach `def.done`. `started = now` des Übergangs-Ticks.
- **Grenzen:** Übergang bei `now ≥ until`. Dauern nur über `scale(INTRO|RESULT, p.speed)`. `ctx.speed` geht an `def.init`, der Runden-Seed ist `mix32(p.seed, r)`.
- **Rundenende:**
  - `rank(result, alle pids, onlineSet)`. `labels` kommt von `def.label` für alle pids. `RoundRecord` an `history` anhängen, Punkte auf `total` addieren.
  - Zeilen nach Platz sortieren, bei Gleichstand nach Beitrittsreihenfolge. Dasselbe gilt fürs Podium.
- **`input`:** Ändert `def.input` nichts (`s2 === s`), kommt dieselbe Party-Referenz zurück.
- **Guards in `control`:** Falsche Phase oder `rounds` ∉ {3,5,8} (per Cast getestet) → dieselbe Referenz.
  - `again` und `lobby` setzen `total = 0`, `history = []` und den neuen Seed.
  - `again` behält Offline-Spieler. `lobby` entfernt sie, ihre Farben werden frei.
  - `order` bei `again` = `planOrder(newSeed, rounds, ids)`. Der Test prüft Gleichheit mit diesem Aufruf, nicht „anders als vorher“ (sonst flaky).
- **Typen:**
  - Die Registry ist `GameDef<any, any, any>`, weil `unknown` am Input-Parameter nicht zuweisbar ist.
  - Der `unknown`-State wird nur an einer Stelle in `party.ts` gecastet.
  - `noUncheckedIndexedAccess`: ein kleiner `must()`-Helfer statt verstreuter `!`.
  - Zusätzlich `export type Engine = ReturnType<typeof createEngine>` (für `host.ts`).
  - `pick` auf einer leeren Liste wirft (Programmierfehler).
- **`viewFor`:**
  - Enthält kein `now`, kein `lastSeen` und keine Restzeit. `n = p.rounds`, `min = dev ? 1 : 2`.
  - Spieler-Sicht `g = def.view(state, pid, now)`.
  - `host.ts` fragt nur gebundene pids ab. Fremde pids müssen nicht sinnvoll aussehen, dürfen aber nicht werfen.
- **Dummy-Spiel** (`dummygame.ts`, nur von Tests importiert):
  - Dauer `scale(1000, speed)`, Input `{v:number}`, `result = v`.
  - Endet früh, sobald alle online-Spieler getippt haben. So prüft ein Test, dass die Engine das richtige `online`-Set übergibt.
  - Die Registry für Mehrspiel-Tests registriert Kopien unter echten `GameId`s, mit passender `id` und eigenem `title`.
- **Lehren aus Schritt 1/2:**
  - Jedes Enum-Mitglied testen: alle 3 Reject-Gründe, alle 3 Rundenzahlen, jede `HostAction` in einer falschen Phase.
  - Randeingaben testen: `'   '` → badname, `' Anna '` mit 12 Zeichen nach dem Trim ist gültig.
  - Doppeltes `disconnect` ist idempotent.
- **Commits:**
  - Der Test-Commit enthält nur `*.test.ts` plus die Fixture `dummygame.ts`, keine Typen und keine Stubs. Er ist rot, die rote Vitest-Zusammenfassung steht im Body.
  - Jeder Impl-Commit ist für sich lint- und unit-grün, mit der grünen Zusammenfassung im Body.
  - Fix-Runden: zuerst ein roter Test-Commit, dann der Fix, beide mit Zusammenfassung (Notiz aus Schritt 2).
  - `protocol.test.ts` (eigener mulberry) bleibt unverändert.

## 3. Dateien (nur Nicht-Offensichtliches)
- Neu: `src/engine/{prng,durations,types,rounds,scoring,party,dummygame}.ts` plus `prng|rounds|scoring|party.test.ts`.
  - `types.ts` importiert `RejectReason` per `import type` aus `net/protocol`. Es gibt keinen Laufzeit-Zyklus.
- Geändert: `src/games/types.ts` (Ergänzung) und `DECISIONS.md` (D-2, D-5 inkl. Lobby-Seed, D-7 inkl. `?only=`).

## 4. DoD
1. `prng.test.ts`:
   - `mulberry32`: gleicher Seed ergibt gleiche Folge, alle Werte liegen in [0,1).
   - `mix32` ist deterministisch, uint32 und unterscheidet benachbarte `b`.
   - `int` bleibt in den inklusiven Grenzen und trifft beide Enden.
   - `shuffle` ergibt eine Permutation und verändert das Original nicht. `pick` ist deterministisch.
   - `randomSeed` liefert uint32 über `crypto.getRandomValues`.
2. `rounds.test.ts`, 500 Seeds × n ∈ {3,5,8} mit 4 IDs: Länge n, nie zwei gleiche hintereinander, bei n ≥ 4 alle 4 enthalten, deterministisch je Seed. Mit 2 IDs wird abgewechselt, mit 1 ID wiederholt.
3. `scoring.test.ts`:
   - `[10,10,8,7,1]` ergibt Plätze 1,1,3,4,5 und Punkte 5,5,2,1,0.
   - Offline oder ohne Ergebnis: Platz = Spielerzahl, 0 Punkte, verdrängt niemanden.
   - Ein Spieler bekommt Platz 1 und 5 Punkte.
4. `hello`:
   - Neue `pid` in der Lobby → `ok` mit kleinstem freiem Farbindex.
   - `badname` bei `''`, `'   '` und 13 Zeichen. 12 Zeichen nach dem Trim sind ok.
   - Dubletten ohne Groß/Klein ergeben „ 2“/„ 3“.
   - Der 9. Spieler bekommt `full`, eine neue `pid` außerhalb der Lobby `started`.
   - Eine bekannte `pid` mitten in `play` bekommt `ok`, behält den alten Namen und ist wieder online.
5. Online-Status:
   - In der Lobby entfernen `disconnect` und der Timeout bei 6001 ms den Spieler und geben seine Farbe für den nächsten Join frei.
   - Außerhalb der Lobby wird er nur offline und behält die Farbe. Bei 6000 ms ist er noch online.
   - `seen` macht ihn wieder online. Der Host wird nie offline.
6. `control`:
   - `rounds` wirkt nur mit 3/5/8 und nur in der Lobby (Default 5).
   - `canStart`: 1 Spieler → false, mit dev → true.
   - `next` wirkt nur in `result`, `again` nur im Podium, `lobby` nur in Podium/Lobby. Jede Aktion in falscher Phase liefert dieselbe Referenz.
   - `again`: `total`/`history` auf null, `order = planOrder(neuer Seed…)`.
   - `lobby`: setzt zurück, entfernt Offline-Spieler, übernimmt den neuen Seed.
7. Komplette Timeline mit `speed` 1 und 10, von der Lobby bis zum Podium:
   - Jeder Übergang liegt exakt an der Grenze (`until − 1` noch alte Phase, `until` neue).
   - Runde r spielt `order[r]` mit Seed `mix32(seed, r)`.
   - `next` verkürzt `result`, nach der letzten Runde folgt `podium`.
8. Rundenende:
   - Ein `RoundRecord` (Plätze, Punkte, Labels) landet in `history`, und die Punkte landen auf `total`.
   - Wer am Rundenende offline ist, bekommt 0 Punkte und den letzten Platz.
   - Ein offline Spieler verhindert das Früh-Ende nicht (richtiges `online`-Set an `def.tick`).
9. `input` mit falscher Phase, falscher Runde, unbekannter `pid` oder `parseInput` = `null` liefert dieselbe Referenz. Kein Reducer verändert seine Eingabe-Party (`structuredClone`-Vergleich).
10. `viewFor`:
    - `me`, `isHost` und `PlayerView.host` stimmen.
    - Lobby (`canStart`, `min`), Intro (`title`, `rule`, `accent`, `until`), Ergebnis (sortierte Zeilen mit `points`, `total`, `label`) und Podium (Platz nach `total` mit geteiltem besserem Platz, inkl. Offline-Spieler) sind korrekt befüllt.
    - In Lobby und `play` bleibt die Sicht zwischen zwei Ticks ohne Änderung JSON-gleich.
11. `src/engine/{party,rounds,scoring,durations,types}.ts` nutzen weder `Date`, `Math.random`, `performance` noch `crypto` (grep). `randomSeed` ist die einzige `crypto`-Stelle in `src/engine`.
12. `DECISIONS.md` hat datierte Einträge D-2, D-5 (inkl. neuem Seed bei „Neue Party“) und D-7.
13. TDD: tests written first (separate test-commit before impl), meaningfully cover the change, red→green captured

## 5. Out-of-Scope
`host.ts`, `client.ts`, `fakeclock.ts` (Schritt 5). Client-Typen `ViewCtx`/`Mounted`/`Render` (Schritt 5/6). Spiellogik und Registry (Schritt 4). UI, E2E, Änderungen an `src/net/` und `view.ts`.
