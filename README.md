# WG·ARCADE

Partyspiele nur mit Handys: ein Handy zeigt einen QR-Code, alle anderen scannen und spielen reihum kurze Minispiele gegeneinander. Kein TV, keine App, kein Account.

## Entwicklung
`npm ci`, dann `npm run dev` (lokal), `npm test` (Unit + E2E), `npm run lint`, `npm run build`.

## Pages einrichten (einmalig)
Die Seite wird von `.github/workflows/pages.yml` bei jedem Push auf `main` gebaut und ausgeliefert.
Dafür einmalig im Repo unter Settings → Pages die Quelle „GitHub Actions“ wählen, oder per CLI:
`gh api -X POST repos/KarimMarhaba/wg-arcade/pages -f build_type=workflow`.
Danach läuft die App unter `https://karimmarhaba.github.io/wg-arcade/`.
