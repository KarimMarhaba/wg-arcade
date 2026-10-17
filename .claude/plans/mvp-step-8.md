# mvp — Schritt 8: Komplettparty-E2E, Reconnect, Abschluss (Abgleich)

Master-Plan §4.4, §4.8, §7.4, §10 Schritt 8, §11. Basis `hew/mvp` @ cd254d5 (Schritt 7). Jeder Shell-Aufruf mit PATH-Export.

## 1. Abgleich (gemessen 2026-10-17)
| Annahme | Befund | Korrektur |
|---|---|---|
| QR trägt `data-url` | `lobby.ts` setzt nur `testid=qr`, kein `data-url` | `data-url` = `env.joinUrl(code)` am QR-Element (absolut, nur net/dev/fast, `#/j/CODE`) |
| Schleife „auf intro oder podium warten“ | fast: Intro 300 ms, Ergebnis 500 ms. `expect` pollt zu grob (Lehre 6/7) | Feste 5 Iterationen: je Seite `playRound` → `gameGone`, alles per raf-`waitForFunction`. Ergebnis-, Intro- und Podiumsdaten per `addInitScript`-MutationObserver aufzeichnen und am Ende prüfen |
| „genau 2 `player` beim Host“ (Reconnect) | `player`-Testid gibt es nur in der Lobby | „Kein Duplikat“ über die Host-Aufzeichnung: jede Ergebnisliste und das Podium haben genau 2 Zeilen mit 2 verschiedenen pids |
| Offline beim Host „nach ≤ 8 s grau“ | Offline erst über den Timeout (Local-Client sendet kein `fin`): 4–6,1 s nach dem Schließen. Farbfalle-Spiel und Intro zeigen keine Badges. Ergebnis und Podium übernehmen `online` nicht (Schritt-6-MINOR offen: Key ohne `online`) | Schließ-Test mit `only=hammer` (Balken mit Badges). Ergebnis und Podium setzen `data-online` der Badges **in place**, ohne Neuaufbau und ohne Enter-/Podium-Animation erneut abzuspielen |
| Reload „sieht game oder result“ | fast-Farbfalle: 2 s + GRACE. Der Reload kann die Runde verpassen | Der fast-Test prüft Rejoin, kein Duplikat und Weiterspielen. Den Wiedereinstieg in derselben Runde beweist ein zweiter Test **ohne fast** mit `only=schaetzfuchs`: Er wartet auf Tipps und ist damit deterministisch |
| DECISIONS „vollständig gegen §9 abgleichen“ | D-0 bis D-9 sind alle schon eingetragen | Nur noch Einträge aus Schritt 8 plus die Schätzfuchs-Antwortgröße (Schritt-7-MINOR) |
| `dist` ohne CDN | gemessen: nur `w3.org`-Namespace, `0.peerjs.com` (Broker), `stun:stun.l.google.com` (STUN). Kein TURN (`peer.ts` überschreibt `iceServers`) | Gezielt nach `fonts.googleapis`, `fonts.gstatic`, `jsdelivr`, `unpkg`, `cdn` greppen, nicht nach „google“ (STUN ist erlaubt) |
| Laufzeit | `lobby.spec` Leerlauf (3 Seiten, 3 Runden) hat 13,4 s gedauert | Ziel für party.spec unter 60 s, aber keine harte Grenze. `test.setTimeout(120_000)` ist ok |

Offene Punkte aus früheren Schritten: Schritt-6-MINOR „Offline-Badges veralten“ (oben), Schritt-5/6 „`getTransport()` cacht einen fehlgeschlagenen Aufbau“ (echter Fehler: „Neu beitreten“ lädt die Seite nicht neu und scheitert dann dauerhaft) → **in Scope**. Hello-Timeout und Eingaben-Puffer während `reconnecting` → **nicht in Scope**, nach dem WG-Test entscheiden (ROADMAP).

## 2. Entscheidungen & Fallen
- **Ein Kontext, mehrere Seiten** (§7.2). Den Request-Wächter mit `context.on('request')` vor der ersten Seite anmelden. Erlaubt sind nur der Origin der `baseURL` plus `data:`/`blob:`. `watchErrors` an **jeder** Seite, auch an der QR-Seite (`page.goto(dataUrl)` braucht einen eigenen Join-Helfer).
- **Aufzeichnung:** Einen gemeinsamen Watcher (aus `games.spec`) nach `e2e/` auslagern und um pid, Platz (`.place`), Total und Intro-Kopf („RUNDE r/n“, `data-game`) erweitern. `declare global { rec }` darf es nur **einmal** geben, sonst schlägt `tsc` fehl. Die Assertions in `games.spec` bleiben, nur der Import ändert sich. Achtung: Ein Reload setzt `window.rec` der Seite zurück. Reconnect-Prüfungen laufen deshalb über die Host-Aufzeichnung.
- **Punkteprüfung je Runde:** Punkte = `[5,3,2,1][Platz−1]`. Die sortierten Plätze beginnen bei 1, jeder ist gleich dem vorigen oder gleich seinem Index (Gleichstand teilt). Total = Vorrunden-Total + Punkte. Damit SF nicht immer Gleichstand liefert, geben die drei Bots verschiedene Tipps (`guess`). Fällt ein Bot ohne Ergebnis aus (Platz 3, 0 Punkte), schlägt die Prüfung fehl. Das ist gewollt; die Prüfung nicht aufweichen, sondern den Bot reparieren.
- **Bots unter Last** (Review-NOTEs 7): Den Blitz-Frühstart erst klicken, wenn `wait` bestätigt ist (raf). `playSchaetzfuchs` darf nicht auf einem verschwundenen `sf-submit` hängen bleiben, wenn die Auflösung schon da ist. Beim Blitz `TRIES` aus `v.waits.length` ableiten. In party.spec kein Frühstart nötig.
- **Reload-Seite:** Ein Bot, der während `page.reload()` läuft, wirft „Execution context was destroyed“. Deshalb vor dem Reload nur 1–2 Antworten per Maus geben und keinen Bot in `Promise.all` mit dem Reload laufen lassen. Danach in einer Schleife bis zum Podium spielen (game oder podium per raf abwarten), nicht mit fester Rundenzahl. `sawName`-Observer per `page.addInitScript` **vor** dem Reload (wie in `lobby.spec`). `localStorage`-Name ist im Kontext geteilt: Der Rejoin kann einen fremden Namen senden, der Host muss den alten behalten → Name und Farbe nach dem Reload prüfen.
- **Schließen:** Das 8-s-Fenster ab der Rückkehr von `page.close()` mit raf-`waitForFunction` (timeout 8000) auf `.badge[data-pid=B][data-online=false]` im Host-DOM messen. Für den In-place-Beweis am Podium vor dem Schließen einen Marker an Zeile bzw. Badge setzen; er muss danach noch da sein.
- **`getTransport`:** reversibel: kleiner Helfer in `net/transport.ts`, der eine Rejection nicht cacht, mit Unit-Test. `app.ts` nutzt ihn. Keine weitere Änderung an Netz und Engine.
- **Blitz-Ende (Schritt-7-MINOR):** Läuft das Ende mit offenen Versuchen ab, müssen die Chips die gesendeten 1000 zeigen. Die Zeitlinie meldet diese Werte über `onPhase`/Events. Unit-Test in `blitz/play.test.ts`.
- **TDD/Commits:** Red-Commit(s) vor dem jeweiligen Fix. Im Body Vitest- und Playwright-Zusammenfassung, und welche neuen Tests schon grün sind (Charakterisierung, z. B. Reload-Rejoin). Ändert sich ein Test nach dem Red-Commit, gehört das in den Commit-Body. Fix-Runden: zuerst der Regressionstest als eigener Commit.

## 3. Dateien (nur Nicht-Offensichtliches)
- Neu: `e2e/party.spec.ts`, `e2e/reconnect.spec.ts`, gemeinsamer Watcher (z. B. `e2e/watch.ts`).
- Geändert: `ui/screens/lobby.ts` (`data-url`), `ui/screens/{result,podium}.ts` (Online in place), `net/transport.ts` + `app.ts` (`getTransport`), `games/blitz/{play,view}.ts`, `e2e/{bots,helpers,games.spec}.ts` (nur Import/Bots), Doku-Dateien.
- Unverändert: `engine/`, `*/logic.ts`, `net/{client,local,peer,loopback,protocol}.ts`.

## 4. DoD
1. **QR-Beitritt:** Das QR-Element trägt `data-url` (absolut, gleicher Origin, nur net/dev/fast, endet auf `#/j/CODE`). In party.spec tritt Client A über diese URL bei, Client B per Code-Eingabe.
2. **Komplettparty (`party.spec`):** Host „Karim“ + 2 Clients, `?net=local&dev=1&fast=1`, 5 Runden, Bots auf allen 3 Seiten parallel. Alle 4 Spiel-IDs werden gespielt. In jeder Runde hat jede Seite 3 `result-row` mit 3 verschiedenen pids, Punkte passend zum Platz, konsistente Plätze und fortgeschriebene Totals. Am Ende zeigen alle 3 Seiten das Podium mit 3 `podium-row`, die Totals sind überall gleich und entsprechen der Summe der Rundenpunkte.
3. **Nochmal + Neue Party:** Nach `btn-again` zeigen alle 3 Seiten das Intro „RUNDE 1/5“. Nach dem nächsten Podium führt `btn-new` alle 3 Seiten in die Lobby mit 3 `player` und gleichem Raumcode.
4. **Sauber:** Im ganzen party.spec gehen Requests nur an den Origin der `baseURL` (`data:`/`blob:` ausgenommen). Auf keiner Seite gibt es `pageerror` oder Konsolenfehler.
5. **Reload mitten im Spiel (`reconnect.spec`):**
   - (a) fast, `only=farbfalle`: Der Client lädt während `game` neu, sieht keinen Name-Screen und ist zurück in der laufenden Party. Beim Host hat jede weitere Ergebnisliste und das Podium genau 2 Zeilen mit 2 verschiedenen pids; pid, Name und Farbe des Clients sind wie vor dem Reload. Nach dem Reload bekommt der Client in mindestens einer Runde Punkte > 0 und erreicht das Podium.
   - (b) ohne fast, `only=schaetzfuchs`: Der Client tippt und lädt neu. Danach zeigt er den Spiel-Root mit `data-state=sent` und seinem Tipp. Nach dem Host-Tipp zeigen beide `sf-reveal` mit 2 Tipps.
6. **Offline und Weiterlaufen:** Host + 2 Clients mit `only=hammer`.
   - B schließt während `game`. Beim Host ist B höchstens 8 s danach mit `data-online=false` markiert. Die Party läuft bis zum Podium, B hat in den Runden nach dem Offline-Werden Platz 3 und 0 Punkte.
   - Schließt danach A am Podium, wird A's Badge beim Host in place grau: dieselben Knoten, keine neue Animation. Ergebnis- und Podium-Screen übernehmen Online-Wechsel also ohne Neuaufbau.
   - `btn-new` führt zu einer Lobby nur mit „Karim“ (D-5).
7. **`getTransport`:** Ein fehlgeschlagener Transport-Aufbau wird nicht gecacht; der nächste Aufruf baut neu (Unit mit gefaktem Fehlschlag, danach Erfolg).
8. **Blitz-Ende:** Läuft die lokale Zeit mit offenen Versuchen ab, liefert die Zeitlinie die gesendeten 1000 an die Sicht. Die Chips zeigen dann „1000“ statt „–“ (Unit).
9. **Doku:**
   - README: „Spielen“-Kurzanleitung auf Deutsch (gleiches WLAN, QR, Host-Handy anlassen), Dev-Flags `net/dev/fast/only`, Pages einmalig.
   - ROADMAP: „Jetzt“ → MVP erledigt, nächster Schritt WG-Test. Aufgeschoben: Eingaben-Puffer bei Reconnect, Hello-Timeout, Layout bei 8 Spielern, Tastatur für Blitz/Hammer.
   - ARCHITECTURE: Dateischnitt inklusive `net/client`, Loopback-Host-Spieler und `e2e/`.
   - DECISIONS: datierte Einträge zu den Auslegungen dieses Schritts (Aufzeichnung statt Polling, Kein-Duplikat-Prüfung, `only=hammer` für Offline, Online in place, `getTransport`) und zur Schätzfuchs-Antwortgröße.
10. **Abschluss-Check:** Im Commit-Body stehen die Bundle-Größe (gzip, aus `npm run build`), der grep-Beleg, dass `dist` keine Schrift- oder CDN-URLs enthält, und drei aufeinanderfolgende grüne `npm test`-Läufe.
11. TDD: tests written first (separate test-commit before impl), meaningfully cover the change, red→green captured

## 5. Out-of-Scope
- Eingaben-Puffer oder erneutes Senden während `reconnecting`, Hello-Timeout am Host, Layout-Audit mit bis zu 8 Spielern, Tastaturbedienung für Blitz und Hammer → ROADMAP.
- Keine Änderungen an Engine, Spiellogik, Protokoll und Transporten (außer dem `getTransport`-Helfer). Kein Push, kein Merge, kein Pages-Aktivieren.
