# paket2 — Schritt 1: Engine-Erweiterung, `common.ts`, Trinkmodus-Grundgerüst (Abgleich)

Master-Plan §1.2–1.4, §2, §3.1, §6.2–6.3, §9, §10 S1. Basis `hew/paket2` @ f196000 (nur Doku über MVP `ecf76ca`). Jeder Shell-Aufruf mit PATH-Export.

## 1. Abgleich (gemessen 2026-10-17)
| Master-Annahme | Befund | Korrektur |
|---|---|---|
| `data-accent` am Game-Frame färbt den Timer | `.frame[data-accent=…]` setzt `--accent-c`, und `.frame` hat `background: var(--accent-c)`. Das Intro nutzt das für den **vollflächigen** Akzent. Am Game-Frame würde der ganze Spiel-Screen eingefärbt | Eigenes Attribut, z. B. `data-tint=<accent>` am Game-Root (reversibel: Name frei). Die 4 `data-game`-Timer-Regeln in `games.css` werden 4 `data-tint`-Regeln. Die Farben bleiben gleich (blitz lime, hammer hot, farbfalle cyan, schaetzfuchs orange, gemessen). D-P2-11 entsprechend formulieren |
| `rounds` „an `engine.create`“ aus `app.ts` | `app.ts` ruft `createHost`. `engine.create` steckt in `host.ts` (`{dev, speed}`) | `HostOptions.rounds?` → `engine.create(..., {dev, speed, rounds?})`. Default bleibt 5. Die `rounds`-Aktion bleibt auf 3/5/8 beschränkt, nur `Party.rounds`/Lobby-View werden `number` (die Lobby zeigt bei 1 keinen Knopf gedrückt, ok) |
| Purity: `src/engine/drinks.ts` in den Spiele-Glob | Die Engine hat ein eigenes `src/engine/purity.test.ts` mit Liste `PURE` | `drinks` dort in `PURE` aufnehmen. Der Spiele-Glob (`readdirSync(…, {recursive:true})`, Node 22) deckt nur `src/games/**` ab. Positivkontrolle: Der Glob findet nachweislich u. a. `blitz/logic.ts`, `common.ts`, `schaetzfuchs/questions.ts` (sonst ginge eine leere Liste still grün durch) |
| `WIRES` „wird zur Tabelle“ | ist schon `Record<GameId, Wire>`. tsc erzwingt je neuer ID eine Zeile | nichts ändern |
| `Run` um `drink` erweitern | Es gibt kein `drink`-URL-Flag (P2/§10 S9: Schalter per `btn-drink`) | `Run` nur um `seed`/`rounds`. Die Drink-E2E klickt `btn-drink` |
| „Haben alle Platz 1 → cheers“ | `rank` gibt Spielern ohne Eingabe den Platz `pids.length`. Bei einem Leerlauf-Duo stehen beide auf Platz 2 und würden nach Master-Wortlaut je 1 trinken. P2 sagt aber: „Zu zweit bei Gleichstand: beide stoßen an“ | Regel: **Stehen alle Online-Teilnehmer auf demselben Platz (egal welchem), gibt es `cheers` und niemand trinkt.** Für 3+ ist das die konsistente Fortsetzung (reversibel, in D-P2-14 notieren) |
| `GameCtx.drinking` Pflichtfeld bricht nur Conformance | tsc prüft auch die Tests. `{ speed }` steht in den 4 `*/logic.test.ts`. `View`-Literale stehen in `net/protocol.test.ts` und `net/client.test.ts` | dort `drinking: false` ergänzen (mechanisch, `npm run lint` zeigt alle Stellen) |
| `party.test`-Erwartungen | `history` `toEqual` (~Z. 362) braucht `drinks: null`. Die Tabelle `allowed: Record<HostAction['a'], …>` (~Z. 233) braucht eine Zeile `drinking: ['lobby']` | anpassen, nicht aufweichen. Damit ist „Schalter nur in der Lobby“ über die vorhandene Tabelle getestet |
| Pool-Test mit `drinkOnly`-Dummies | `createEngine` nutzt nur `GAME_IDS.filter(id in games)`. Fremde IDs fallen still weg | Dummies auf vorhandene IDs legen, z. B. `{...makeDummy('hammer'), drinkOnly: true}`. `planOrder` für Pools mit 14/19 IDs generisch machen (`<T extends string>`) statt mit `as GameId[]` zu casten |
| `only=<id>` | `gamesFor(only)` baut eine Ein-Spiel-Registry, also gilt `ids = [only]` | Fallback „Pool leer → `ids`“ greift genau dort. Unit-Test über `createEngine({hammer: drinkOnly-Dummy})` ohne Trinkmodus |

Passt: `finishRound`/`viewFor`-Struktur, `rank`, `planOrder` (n ≤ Pool ⇒ n verschiedene, gilt schon), `syncBar`, Bots/`watch.ts`. `workers: 1` → feste Seeds erzeugen keine Raumcode-Kollision.

## 2. Entscheidungen & Fallen
- **Platz-Regel** (`engine/drinks.ts`, rein): `n` = Online-Spieler, `last` = größter Platz unter ihnen. „Vorletzt“ (n ≥ 5) = nächstgrößerer Platz < last und > 1. Bei mehreren Siegern verteilt jeder. n ≤ 1 → leerer Plan ohne `cheers`. `capDrinks` entfernt Offline und Unbekannte, rundet ab und kappt `take`/`give` auf 0..3 (NaN → 0). Eigene `drinks` (`Record` oder `DrinkPlan`, Unterscheidung `'rows' in x`) laufen durch dieselbe Kappung.
- **Result-Sicht `drinks.rows`:** nur Spieler mit `take > 0` oder `give > 0`, in der Reihenfolge der Ergebniszeilen. Ohne eigene Zeile zeigt `drink-me` „Du bist raus aus der Nummer 😎“, bei `cheers` „🍻 Anstoßen – ohne Pflicht“. Ein gleicher Wert bei `{a:'drinking'}` liefert dieselbe Referenz.
- **Hinweis-Overlay:** auf `wrap`-Ebene in `party.ts` (übersteht Screen-Wechsel). Den Storage-Zugriff injizieren (z. B. über `PartyProps`): das geschützte `session`-Objekt aus `app.ts`, kein rohes `sessionStorage`. **Kein `data-screen`** am Overlay, sonst schlägt `audit()` fehl („genau 1 `[data-screen]`“). Knöpfe ≥ 56 px, nur Tokens. Das Overlay fängt Klicks ab: In der E2E vor `btn-start` beide `btn-drink-ok` klicken.
- **`btn-drink`** in der Host-Lobby. Dadurch läuft der vorhandene Lobby-Audit in `screens.spec` gegen die 56-px-Grenze, die Lobby darf scrollen.
- **`setState(state, {step, role})`** (D-P2-12): nur Typ + `game.ts`. Fehlt ein Schlüssel, wird das Attribut **entfernt**, damit nichts aus der Vorphase stehen bleibt. Es hat noch keinen Verbraucher, darum kein DoD-Punkt. Der Nachweis kommt in S3.
- **Flags:** `seed` = `/^\d+$/` ≤ 4294967295, `rounds` = Ganzzahl 1..8, beide nur mit `dev`. **Nicht** in `JOIN_KEYS` aufnehmen: `party.spec` prüft, dass die QR-URL genau `dev,fast,net` trägt. `rand = mulberry32(seed + 1)` macht Raumcode und Nochmal-Seeds reproduzierbar.
- **Konformität:** `Case = {def, first(s,pid), finish(s,pid), prep?}`. Der bisherige 150-s-Einzelsprung „nach der Auflösung“ wird zu einer 100-ms-Tick-Schleife bis `done`, weil Mehrphasen-Spiele je Tick nur eine Phase weiterschalten. Prüfung (c) `drinks` wird angelegt, greift aber erst ab S3.
- **Secret-Harness:** `leaks(case, n)` als reine Funktion, die Funde zurückgibt. Kein `expect` darin, sonst lässt sich die Positivkontrolle (Leck-Fixture → Funde ≠ []) nicht ausdrücken. Fixtures im Test unter einer vorhandenen `GameId`.
- **Drink-E2E** (`e2e/drink.spec.ts`, neu, S12 erweitert sie): 2 Seiten, `only=hammer&rounds=1&fast=1&seed=<fest>`. Der Host hämmert, der Client bleibt untätig: Er hat dann keinen result-Eintrag und landet deterministisch auf Platz 2 → `TRINK 1`. Ergebnis (700 ms) und Hinweis-Zähler nimmt `watch.ts` auf (`rec.drinks` je Ergebnis-Screen, `rec.hints`), nie per `expect`-Polling. Den Streifen im ersten synchronen Mount bauen, sonst verpasst der Observer ihn. Danach `btn-again` → zweites Ergebnis mit Streifen, Hinweis weiterhin genau 1×.
- **party.spec:** `seed` fest, die Prüfung „alle 4 IDs“ wird zu „keine Wiederholung hintereinander, jedes Spiel ∈ lokale `NORMAL`-Liste“ (e2e importiert nichts aus `src`; jeder Spiel-Schritt erweitert die Liste).
- **TDD:** `drinks.test`, Engine-, Config-, `common`- und Harness-Tests als eigener Red-Commit vor der Umsetzung, Vitest-Zusammenfassung im Body. Bei der E2E ebenso (Red: Test-IDs fehlen).

## 3. Dateien (nur Nicht-Offensichtliches)
`src/engine/host.ts` (`rounds` durchreichen), `src/engine/purity.test.ts` (`drinks`), `src/games/*/logic.test.ts` + `src/net/{protocol,client}.test.ts` (Typ-Nachzug), `src/ui/screens/lobby.ts` (`Segmented` vs. `number`), `e2e/watch.ts` (Drink-/Hint-Aufzeichnung), `e2e/drink.spec.ts` (neu).

## 4. DoD
siehe Rückgabe (`dod`).

## 5. Out-of-Scope
Neue Spiele, `blocks.ts`, `drive()`, `duo.spec`, `bankcheck`/`match` (S2). Echte Secret-Fälle der Altspiele. 8-Spieler-Layout der Ansage. Reload-E2E des Hinweises. README/ARCHITECTURE (S12).
