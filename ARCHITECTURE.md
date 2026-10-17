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

- `src/net/` Transport-Schnittstelle (`peer` | `local` BroadcastChannel), Protokoll v1, Raumcode.
- `src/engine/` reiner Zustandsautomat: Lobby → Intro → Spiel → Ergebnis → … → Podium.
- `src/games/<id>/` je Spiel `logic.ts` (rein, Host), `play.ts` (reine lokale Zeitlinie, Uhr injiziert) und `view.ts` (DOM, Client); `src/games/resume.ts` = Wiedereinstieg (§4.3).
- `src/ui/` Design-Tokens, Komponenten, Screens; `src/app.ts` Hash-Routing.
- Details: `docs/design/design.md`.
