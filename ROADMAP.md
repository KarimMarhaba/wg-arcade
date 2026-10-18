# ROADMAP — WG·ARCADE

## Jetzt
- **Paket 2 unterbrochen (Session-Limit 2026-10-18):** Branch `hew/paket2`, Worktree `.claude/worktrees/paket2`.
  Schritte 1–6 fertig und reviewt (Trinkmodus-Grundgerüst, Bausteine/Duo-E2E, gleichklang, werwuerde, bombe, stopp,
  luegenbaron, verraeter, pokerface, erklaerbaer). Schritt 7 (blindmaler) halb: Plan + rote Tests committet, Umsetzung WIP.
  **Weiter:** in diesem Worktree `/hew:run` mit den Schritten 7–12 aus `.claude/plans/paket2-master-plan.md` §10
  (Schritt 7 = Umsetzung auf die vorhandenen roten Tests + WIP-Commit aufsetzen), danach Final-Check, PR, Merge, Pages prüfen.
- Spielepaket 2 + Trinkmodus nach `docs/design/paket2.md` (hew-Run `paket2`), pAIme-Projekt #350.
- MVP erledigt (hew-Run `mvp`, Schritte 1–8): vier Spiele, Lobby, QR-Beitritt, Reconnect, Podium, Design-System, E2E-Komplettparty.
- Nächster Schritt: **WG-Test** zu dritt mit echten Handys (iOS + Android) über GitHub Pages; Lag, Verbindungsabbrüche und Lesbarkeit notieren.

## Danach
- Mehr Spiele (Kandidaten: Zeichnen-Raten, Bluff-Abstimmung, Rhythmus-Tippen).

## Aufgeschoben (nach dem WG-Test entscheiden)
- Eingaben-Puffer bzw. erneutes Senden, solange der Client `reconnecting` ist.
- Hello-Timeout am Host (hängende Verbindung ohne `hello`).
- Layout-Audit mit bis zu 8 Spielern (Schätzfuchs-Auflösung, Hammer-Balken, Blitz-Fortschritt bei 390x844).
- Tastaturbedienung für Blitz und Hammer.

## Offene Fragen
- Reicht der öffentliche PeerJS-Broker auf Dauer, oder eigener Broker?
