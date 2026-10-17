# ROADMAP — WG·ARCADE

## Jetzt
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
