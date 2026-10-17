# WG·ARCADE — Design (Bau-Wahrheit)

Stand 2026-10-17. Abweichungen nur mit Eintrag in `DECISIONS.md`.

## 1. Produkt in einem Satz
Ein Handy startet eine Party und zeigt einen QR-Code, 1–7 weitere Leute scannen ihn mit dem eigenen Handy und
spielen reihum kurze Minispiele (20–45 s) gegeneinander; Gesamtpunktestand, Siegertreppchen, „Nochmal“.
Kein TV, keine App, kein Account. Das Design ist das Produkt.

## 2. Netz (lokales WLAN, Host-Handy = Server)
- Statische Seite (GitHub Pages, `https://karimmarhaba.github.io/wg-arcade/`), Hash-Routing.
- **Das Host-Handy ist der Spielserver** (autoritativ, hält den ganzen Zustand). Clients sind dünn: zeigen
  die Sicht, die der Host schickt, und senden Eingaben.
- Verbindung per **WebRTC-DataChannel** (`peerjs`, öffentlicher PeerJS-Broker nur fürs Verbinden,
  STUN `stun:stun.l.google.com:19302`). Im selben WLAN fließen die Spieldaten direkt Handy↔Handy.
- Transport hinter einer Schnittstelle (`src/net/transport.ts`), zwei Implementierungen:
  - `peer` (Standard): PeerJS, Peer-ID `wgarcade-<CODE>`.
  - `local`: `BroadcastChannel` (Tabs im selben Browser) — für Entwicklung und E2E-Tests. Wahl per `?net=local`.
- Raumcode: 4 Zeichen aus `ABCDEFGHJKLMNPQRSTUVWXYZ` (ohne I, O). QR enthält `<origin><base>#/j/<CODE>`
  (bei `?net=local` den Query-Parameter mit).
- Protokoll JSON, jede Nachricht `{ v: 1, t: <typ>, ... }`:
  - Client→Host: `hello {pid, name}`, `input {round, payload}`, `ping`.
  - Host→Client: `welcome {pid}`, `view {view}` (vollständige Sicht für genau diesen Spieler), `reject {reason}`
    (`full` | `started` | `badname`), `pong`.
  - Unbekannte/kaputte Nachrichten werden verworfen, nie geworfen.
- `pid` (zufällig, `crypto.randomUUID`) liegt in `sessionStorage`; Reconnect mit gleicher `pid` übernimmt den
  Platz wieder (auch mitten im Spiel). Heartbeat alle 2 s, nach 6 s ohne Nachricht gilt ein Spieler als offline
  (bleibt im Punktestand, grau). Host weg = Party vorbei (Client zeigt „Verbindung zum Host verloren“ + Neu
  beitreten).
- Max. 8 Spieler inkl. Host. Name 1–12 Zeichen (getrimmt), doppelte Namen bekommen „ 2“ angehängt.

## 3. Zeit & Fairness
Netz-Latenz darf nie über Sieg entscheiden: **Zeitkritisches misst der Client lokal** (`performance.now()`)
und meldet nur Ergebnisse/Zwischenstände. Der Host gibt Start-Signale als „starte in X ms nach Empfang“ und
Seeds für Zufall (gleiche Wortfolge/Wartezeit für alle). Host-Logik ist rein und bekommt `now` hereingereicht
(Fake-Uhr in Tests, nie `sleep`).

## 4. Ablauf (Screens)
1. **Start `#/`**: Logo, „Party starten“, „Beitreten“ (Code-Eingabe), Ton an/aus.
2. **Name**: Name eingeben (vorbelegt aus `localStorage`), Farbe automatisch (8er-Palette, Reihenfolge Beitritt).
3. **Lobby Host**: großer QR + Code + Spielerliste (live), Rundenzahl 3/5/8 (Default 5), „Los geht’s“ ab
   2 Spielern (mit `?dev=1` ab 1). **Lobby Client**: „Du bist drin“, eigene Farbe, Spielerliste, wartet.
4. **Spiel-Intro** (3 s): Spielname groß, eine Regelzeile, Countdown 3-2-1.
5. **Spiel**.
6. **Runden-Ergebnis** (5 s oder Host tippt „Weiter“): Platzierung dieser Runde + Punkte, Gesamtstand.
7. Nach letzter Runde **Podium** (Top 3, Konfetti), Rangliste, Host: „Nochmal“ (gleiche Spieler, neue Reihenfolge)
   / „Neue Party“.

Rundenfolge: aus allen Spielen gemischt (Seed), nie dasselbe Spiel zweimal hintereinander.
Punkte je Runde nach Platz: 5, 3, 2, 1, dann 0; Gleichstand teilt den besseren Platz.

## 5. Spiel-Schnittstelle
Host-seitig rein und deterministisch (`src/games/<id>/logic.ts`), Client-Darstellung getrennt
(`src/games/<id>/view.ts`):
```
GameDef<S, I> { id, title, rule, init(players, seed, now) → S, input(S, pid, I, now) → S,
                tick(S, now) → S, done(S, now) → bool, result(S) → Map<pid, number> (höher = besser),
                view(S, pid, now) → JSON-Sicht }
render(root, view, send(payload))   // client
```
Die Engine (`src/engine/`) macht Lobby, Rundenfolge, Intro/Ergebnis-Phasen, Platzierung→Punkte, Offline-Spieler
(offline = Ergebnis 0/ letzter Platz in laufender Runde). `fast=1` (nur mit `dev=1`) teilt alle Dauern durch 10.

## 6. Spiele (MVP, alle latenz-tolerant)
| id | Name | Dauer | Regel | Wertung |
|---|---|---|---|---|
| `blitz` | BLITZ | 3 Versuche | Bildschirm wird nach 1,5–4 s (Seed) neon → so schnell wie möglich tippen | Summe der 3 Zeiten, Frühstart = 1000 ms; kleiner = besser |
| `hammer` | HAMMER | 8 s | So oft wie möglich auf den Knopf hämmern; Live-Balken aller | Anzahl Taps |
| `farbfalle` | FARBFALLE | 20 s | Farbwort in anderer Tintenfarbe, tippe die **Tinte** (4 Knöpfe) | +1 richtig, −1 falsch; gleiche Folge für alle |
| `schaetzfuchs` | SCHÄTZFUCHS | 20 s | Schätzfrage mit Zahlantwort, Zahl eingeben | kleinster relativer Fehler; Auflösung zeigt alle Tipps |

Schätzfragen: ≥ 40 deutschsprachige Fragen mit gut belegter, stabiler Zahl (z. B. Höhe Zugspitze in m), je
Frage `{q, a, unit}`, in `src/games/schaetzfuchs/questions.ts`. Keine Fragen mit strittiger oder schnell
veraltender Antwort.

## 7. Design-System
- „Neon-Brutalismus“: fast schwarzer Grund `#0c0b10`, knallige Flächen mit 3 px schwarzer Kontur und harten
  Versatz-Schatten (`6px 6px 0 #000`), große kondensierte Display-Schrift, Zahlen tabellarisch.
- Schriften lokal gebündelt über `@fontsource` (keine externen CDNs): Display `Bricolage Grotesque` oder
  `Archivo Black`, Text `Space Grotesk`.
- 8 Spielerfarben (neon, untereinander unterscheidbar, auch für Rot-Grün-Schwäche mit Form/Initiale ergänzt).
- Tokens in `src/ui/tokens.css` (Farben, Abstände, Radien, Schatten, Dauern); Komponenten in `src/ui/`.
- Hochformat, Safe-Area-Insets, Knöpfe ≥ 56 px, `touch-action: manipulation`, kein Doppeltipp-Zoom, kein
  Scrollen im Spiel, `user-select: none`.
- Bewegung: kurze CSS-Transforms, Bildschirm-„Punch“ bei Treffern, Konfetti auf dem Podium (Canvas);
  `prefers-reduced-motion` schaltet ab.
- Ton: WebAudio-Synth-Bleeps (keine Audiodateien), Stummschalter gemerkt. Vibration (`navigator.vibrate`) wo
  vorhanden. Screen Wake Lock während der Party.
- Sprache UI: Deutsch.

## 8. Tests
- Vitest: Raumcode, Protokoll-Parser, Engine (Lobby, Rundenfolge, Punkte, Gleichstand, Reconnect, Offline),
  jede Spiellogik mit Fake-Uhr, Fragenbank-Form.
- Playwright (Chromium headless shell, Revision 1243, `@playwright/test` 1.63.0): Host + 2 Clients als Seiten
  mit `?net=local&dev=1&fast=1`, Beitritt per Code, eine ganze Party mit allen 4 Spielen bis zum Podium.
- Keine Tests gegen den echten PeerJS-Broker im Standard-Gate.

## 9. Deploy
GitHub Actions: bei Push auf `main` → `npm ci && npm run build` → GitHub Pages. Vite `base: '/wg-arcade/'`.

## 10. Nicht im MVP
Eigene Spiele hochladen, Accounts, Online über das Internet ohne gemeinsames WLAN zuverlässig (geht oft, ist
aber kein Ziel; kein TURN-Server), TV-Modus, Neige-/Gyro-Spiele (iOS-Berechtigungsdialog), Chat.
