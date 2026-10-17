# DECISIONS — WG·ARCADE (append-only)

## 2026-10-16 — Eigenes Repo, öffentlich, GitHub Pages
Was: eigenständiges Repo `wg-arcade` (nicht pAIme), öffentlich, Auslieferung als statische Seite über GitHub Pages.
Warum: Mitbewohner sind nicht im Tailnet und der pAIme-Server bleibt privat (D8); Pages ist kostenlos und ohne
Einrichtung bei Karim deploybar (Karims Wahl). Keine Secrets, keine Nutzerdaten im Repo.

## 2026-10-16 — Host-Handy als Server, WebRTC im WLAN
Was: Das Host-Handy hält den Spielzustand; Verbindung per WebRTC-DataChannel (PeerJS), Broker nur zum Verbinden.
Warum: Karims Wunsch „übers lokale WLAN“ ohne Laptop/Server in der WG; Handys können keinen HTTP-Server
betreiben, WebRTC liefert direkte Verbindungen im WLAN. Transport austauschbar (`local` für Tests).

## 2026-10-16 — Zeitkritisches misst der Client
Was: Reaktionszeiten/Taps werden lokal gemessen, nur Ergebnisse gemeldet.
Warum: Recherche zeigte Lag als Hauptkritik bei Handy-Partyspielen (Gaming Couch); so entscheidet Netz-Latenz nie.

## 2026-10-17 — D-0: Stack und Versionen (Schritt 1)
Was: Vite 8.3, Vitest 5.0, TypeScript 7.0.2 (nativer `tsc`, kein Fallback nötig; `types: [vite/client, node]` explizit),
`@playwright/test` exakt 1.63.0, peerjs 1.5, qrcode 1.5. Zusatz-Dev-Deps: `@types/node` (^22, passend zu Node 22) und `@types/qrcode`.
Schriften als `@fontsource-variable/bricolage-grotesque` und `@fontsource-variable/space-grotesk` statt `@fontsource/*`;
von Bricolage wird `wdth.css` importiert (Achsen wght 200–800, wdth 75–100), `index.css` hätte nur wght.
Warum: Typen für Configs, variable Achsen für die kondensierte Display-Schrift; die Prüfung aus Plan §6.2 ist damit erledigt
(Breitenachse vorhanden). Lockfile enthält die x64-Bindungen (rolldown, lightningcss, typescript), damit `npm ci` in der CI läuft.

## 2026-10-17 — D-8: CI prüft vor dem Build
Was: `pages.yml` führt vor dem Build `npm run lint` und `npm run test:unit` aus; E2E läuft nicht in CI.
Warum: Kaputtes nicht deployen; E2E bräuchte dort einen Browser-Install.

## 2026-10-17 — Aktuelle Action-Hauptversionen
Was: `actions/checkout@v7`, `actions/setup-node@v7`, `actions/upload-pages-artifact@v5`, `actions/deploy-pages@v5` statt der im Plan genannten v4/v3/v4.
Warum: Die alten Hauptversionen laufen auf der Node-20-Laufzeit und sind veraltet.

## 2026-10-17 — `GAME_IDS` in `games/types.ts`
Was: `src/games/types.ts` enthält `GAME_IDS` (as const) und `GameId`; `games/index.ts` re-exportiert später nur.
Warum: `parseFlags` braucht die Ids für `only` schon in Schritt 1, ohne die Registry der Spiele zu importieren.

## 2026-10-17 — D-1: `view`-Nachricht trägt `now`
Was: `HostMsg` `view` enthält zusätzlich `now` (Host-Uhr beim Senden, endliche Zahl); `parseHost` verlangt es.
Warum: Absolute Deadlines in der Sicht halten die Sicht zwischen den Ticks stabil (Diffing per JSON-String); der Client rechnet daraus seinen Uhr-Offset.

## 2026-10-17 — D-2: GameDef-Erweiterung
Was: `GameDef` trägt zusätzlich `accent`, `parseInput` (Rohwert vom Draht → Eingabe oder `null`), `tick(s, now, online)` und `label`; `init` bekommt `ctx {speed}`. Die Engine reicht das Online-Set an `tick` weiter.
Warum: fast-Skalierung, Eingaben vom Draht werden validiert, die Runde endet früh, sobald alle Online-Spieler fertig sind (Offline blockiert nicht), und die Ergebnis-Zeile zeigt den Rohwert (z. B. „742 ms“).

## 2026-10-17 — D-5: Lobby entfernt Getrennte; „Neue Party“ = zurück in die Lobby mit neuem Seed
Was: In der Lobby entfernen `disconnect` und Timeout (> 6000 ms) den Spieler samt Farbe; außerhalb der Lobby wird er nur offline. „Neue Party“ ist `{a:'lobby', seed}` (gleicher Code, Punkte 0, Offline-Spieler entfernt, Verbindungen bleiben). Die Laufzeit übergibt `randomSeed()`. Auch `again` bekommt einen neuen Seed.
Warum: Freie Plätze und Farben in der Lobby. Ohne neuen Seed wären nach „Neue Party“ und `start` Spielreihenfolge und Runden-Seeds (Blitz-Wartezeiten, Schätzfuchs-Frage) identisch zur ersten Party.

## 2026-10-17 — D-7: fast skaliert nur Spiel- und Phasendauern; `?only=<id>`
Was: `speed` (10 mit dev + fast) teilt Phasen- und Spieldauern (`scale`), nicht Heartbeat (`PING`/`OFFLINE`/`TICK`), `GRACE` und `BLITZ_MAX`. Das dev-Flag `?only=<id>` beschränkt die Spiel-Registry auf ein Spiel; die Engine kennt es nicht, sie plant über `GAME_IDS` gefiltert nach der Registry (ein Spiel wird wiederholt).
Warum: Netztoleranz bleibt real, Wertungswerte bleiben vergleichbar; gezielte E2E-Läufe pro Spiel.

## 2026-10-17 — D-6: Farbfalle-Farben ROT/BLAU/GELB/WEISS ohne Grün; Hex nur als Tokens
Was: Farbfalle nutzt ROT, BLAU, GELB und WEISS. Die Hex-Werte (`#ff3b4e`, `#3d7bff`, `#ffe14d`, `#f4f1ea`) stehen als `--ff-rot|blau|gelb|weiss` in `tokens.css`. `games/colors.ts` enthält nur `id` (`rot|blau|gelb|weiss`, wie `data-ink`) und das Wort, keine Hex-Werte. Folge und Eingabe sind Indizes 0..3 über `FF_COLORS`.
Warum: Grün entfällt wegen Rot-Grün-Schwäche. Hex nur in `tokens.css`/`palette.ts` hält die Farbquelle einzig. Index-Paare statt Objekten halten die Sicht klein (400 Paare: ~3,6 kB statt >12 kB; `parseEnvelope` verwirft > 16 384 Zeichen still, und jede Antwort schickt die Sicht erneut).

## 2026-10-17 — D-9: Schätzfuchs-Frage pro Runde per Seed
Was: Die Frage ist `QUESTIONS[int(mulberry32(seed), 0, len-1)]` mit dem Runden-Seed. Eine Wiederholung innerhalb einer Party ist theoretisch möglich.
Warum: Die Spiellogik bleibt rein und kennt die Party nicht; bei 50+ Fragen und höchstens 8 Runden ist die Wahrscheinlichkeit gering.

## 2026-10-17 — Ohne Eingabe kein Ergebnis
Was: `result` von blitz, hammer und farbfalle enthält nur Spieler mit mindestens einer gültigen Eingabe; ohne Eingabe gilt das Label „–“. Schätzfuchs trägt ohne Tipp ebenfalls keinen Eintrag. Fehlende blitz-Versuche eines Teilnehmers zählen 1000. Früh-Ende gilt, wenn es mindestens einen Online-Teilnehmer gibt und alle Online-Teilnehmer fertig sind; Offline-Spieler blockieren nicht.
Warum: Der Client meldet immer etwas (blitz 1000 bei Kein-Tap, hammer `final`, farbfalle `done`). Ohne die Regel bekäme bei 2 Spielern ein online gemeldeter, aber nie eingreifender Spieler einen Wert und damit 3 Punkte. `rank` setzt fehlende Einträge auf den letzten Platz mit 0 Punkten.

## 2026-10-17 — D-3: Client-`render` liefert `Mounted{update,destroy}`
Was: `Render<V, I> = (root, v, send, ctx) => Mounted<V>` mit `Mounted<V> = {update(v), destroy()}` (`games/types.ts`). Die Screens (`ui/screens/*`) folgen demselben Muster; `party.ts` behält einen gemounteten Sub-Screen, solange `(s, r)` gleich bleibt, und ruft nur `update(view)`.
Warum: Lokaler Spielzustand (Timer, Fortschritt) überlebt Sicht-Updates; Listener und Timer werden in `destroy` aufgeräumt.

## 2026-10-17 — D-4: Host-Steuerung nur lokal
Was: `host.control(a)` ist nur über die Host-Laufzeit erreichbar und nicht Teil des Protokolls. `again`/`lobby` nimmt `control` ohne Seed an und füllt ihn aus dem injizierten `rand` (uint32); die UI erzeugt nie Seeds. Die UI zeigt Host-Knöpfe nur bei `view.isHost && env.control`.
Warum: Clients können die Party nicht steuern; das Protokoll bleibt wie im Design. Seeds im Host halten die UI frei von Zufall (D-5: neue Party braucht neuen Seed).

## 2026-10-17 — `connectLocal(): Conn` statt `localConn`
Was: `createHost` liefert `connectLocal()`; jeder Aufruf erzeugt ein neues Loopback-Paar, die Host-Seite wird wie eine eingehende Conn behandelt (gleicher `hello`-Pfad, gleiche Rebind-Regel). Die Host-eigene Sitzung nutzt `connect: () => Promise.resolve(host.connectLocal())` und damit den normalen Reconnect-Pfad.
Warum: Der Watchdog der Host-Sitzung schlägt an, wenn der Tab im Hintergrund war; mit einer einmaligen `localConn` stünde dann `lost` auf dem Host-Handy, obwohl die Party läuft.

## 2026-10-17 — Verbindungsfehler beim ersten Verbinden wie beim Reconnect
Was: `createClientSession` behandelt Fehlschläge beim ersten Verbinden wie einen Reconnect: Versuche laufen streng nacheinander (nie parallel) im 1-s-Takt, nach 10 s ohne `welcome` folgt `lost`. Währenddessen bleibt der Zustand `connecting`. `joined` gilt erst ab `welcome`; `reject` ist endgültig (`rejected`, kein Reconnect). Eine Conn, die nach `lost`, `close()` oder einem anderen Ergebnis ankommt, wird sofort geschlossen.
Warum: Ein falscher Raumcode landet nach höchstens 10 s auf dem Lost-Screen, statt ewig zu hängen; Local-`join` braucht 3 s bis `noroom`, parallele Versuche würden sich stauen.

## 2026-10-17 — Host bindet erst, dann schließt; geschlossene Spieler-Conns
Was: Bei gleicher `pid` auf neuer Conn wird zuerst die neue gebunden, dann die alte geschlossen; `onClose` ruft `disconnect` nur für die noch gebundene Conn. `flush` schließt gebundene Conns, deren Spieler die Engine entfernt hat (Lobby-Timeout, „Neue Party“). `stop()` schließt alle eigenen Conns selbst.
Warum: `close()` feuert `onClose` synchron; ohne diese Reihenfolge würde ein Reload den Spieler in der Lobby entfernen. Der Client verbindet nach dem Schließen neu und wird wieder aufgenommen.

## 2026-10-17 — `ViewCtx` ohne `sfx`/`fx` bis Schritt 6
Was: `ViewCtx = {me, toLocal, reducedMotion}`; `sfx` und `fx` kommen mit Schritt 6 (Design-System). `Mounted` und `Render` stehen in `games/types.ts`. Der Rejected-Screen lebt in `screens/lost.ts`; `fakeclock.ts` ist ein reiner Test-Helfer in `src/engine/`.
Warum: `Sfx`/`Fx` existieren erst in Schritt 6; Schritt 5 braucht nur Zeitumrechnung und Reduced-Motion.
