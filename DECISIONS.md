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
