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
