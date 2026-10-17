# ARCHITECTURE — WG·ARCADE

```
 Host-Handy (Browser)                         Spieler-Handys (Browser)
 ┌───────────────────────────┐   WebRTC     ┌──────────────────────┐
 │ engine (autoritativ)      │◄────────────►│ client: view-render  │
 │  lobby · runden · punkte  │  DataChannel │  + eingaben senden   │
 │ games/<id>/logic (rein)   │   (WLAN)     └──────────────────────┘
 │ + eigener client          │
 └───────────────────────────┘
          │ nur Verbindungsaufbau
          ▼
   PeerJS-Broker + STUN (öffentlich)      Seite: GitHub Pages (statisch)
```

- `src/net/` Transport-Schnittstelle (`peer` | `local` BroadcastChannel; `lazyTransport` baut lazy und cacht keinen Fehlschlag), Protokoll v1, Raumcode. `net/client.ts` = Client-Sitzung (Hello, Ping, Reconnect, Zeitabgleich `toLocal`); `net/loopback.ts` = In-Memory-Paar für den Host-Spieler.
- `src/engine/` reiner Zustandsautomat: Lobby → Intro → Spiel → Ergebnis → … → Podium.
- `src/games/<id>/` je Spiel `logic.ts` (rein, Host), `play.ts` (reine lokale Zeitlinie, Uhr injiziert) und `view.ts` (DOM, Client); `src/games/resume.ts` = Wiedereinstieg (§4.3).
- `src/engine/host.ts` Host-Laufzeit (Transport, Tick, Sicht je Spieler). Der Host spielt über ein **Loopback-Paar** (`host.connectLocal()`) als gewöhnlicher Client mit; es gibt keinen Sonderweg für den Host-Spieler.
- `src/ui/` Design-Tokens, Komponenten, Screens; `src/app.ts` Hash-Routing.
- `e2e/` Playwright (Chromium, ein Kontext, mehrere Seiten, `?net=local&dev=1&fast=1`): `bots.ts` (Spiel-Bots), `watch.ts` (MutationObserver-Aufzeichnung von Runden, Ergebnissen, Podien, Intros), `helpers.ts`; Specs `party` (Komplettparty), `reconnect` (Reload, Offline), `games`, `lobby`, `screens`, `smoke`.
- Details: `docs/design/design.md`.
