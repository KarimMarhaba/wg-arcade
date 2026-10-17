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
