# WG·ARCADE

Partyspiele nur mit Handys: ein Handy zeigt einen QR-Code, alle anderen scannen und spielen reihum kurze Minispiele gegeneinander. Kein TV, keine App, kein Account.

## Spielen
1. Alle Handys im **gleichen WLAN**. Einer öffnet die Seite und tippt auf „Party starten“ (Host).
2. Die anderen scannen den **QR-Code** auf dem Host-Handy oder geben den Raumcode ein und wählen einen Namen.
3. Der Host wählt die Rundenzahl und startet. Das **Host-Handy bleibt an** und im Vordergrund (Bildschirm-Sperre aus), solange gespielt wird; es rechnet das Spiel für alle.
4. Zum Schluss gibt es das Podium: „Nochmal“ spielt dieselbe Runde neu, „Neue Party“ führt zurück in die Lobby.

Wer neu lädt oder kurz die Verbindung verliert, kommt mit dem alten Namen zurück in die laufende Party.

## Entwicklung
`npm ci`, dann `npm run dev` (lokal), `npm test` (Unit + E2E), `npm run lint`, `npm run build`.

Dev-Flags (Query-Parameter, ohne `dev=1` wirkungslos außer `net`):

| Flag | Wirkung |
|---|---|
| `net=local` | Transport über BroadcastChannel statt PeerJS (mehrere Tabs desselben Browsers, kein Netz) |
| `dev=1` | Dev-Modus: Start schon mit einem Spieler erlaubt, `fast` und `only` freigeschaltet |
| `fast=1` | Alle Zeiten zehnmal schneller (nur mit `dev=1`) |
| `only=<id>` | Nur dieses Spiel: `blitz`, `hammer`, `farbfalle` oder `schaetzfuchs` (nur mit `dev=1`) |

Beispiel: `http://localhost:5173/wg-arcade/?net=local&dev=1&fast=1&only=hammer`.

## Pages einrichten (einmalig)
Die Seite wird von `.github/workflows/pages.yml` bei jedem Push auf `main` gebaut und ausgeliefert.
Dafür einmalig im Repo unter Settings → Pages die Quelle „GitHub Actions“ wählen, oder per CLI:
`gh api -X POST repos/KarimMarhaba/wg-arcade/pages -f build_type=workflow`.
Danach läuft die App unter `https://karimmarhaba.github.io/wg-arcade/`.
