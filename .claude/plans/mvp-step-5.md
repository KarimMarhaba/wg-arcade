# mvp — Schritt 5: Host-Laufzeit, Client-Sitzung, Routing, funktionale Screens, Lobby-E2E (Abgleich)

Master-Plan §3.7, §4.1–§4.4, §4.6, §7.3, §9 D-3/D-4, §10 Schritt 5. Basis `hew/mvp` @ f6dbeb6 (Schritt 4).
Jeder Shell-Aufruf: `export PATH="$HOME/.local/share/herdr-web-ui/node/bin:$PATH"`.

## 1. Abgleich (gemessen 2026-10-17)
| Annahme | Befund | Korrektur |
|---|---|---|
| `?only=`: Laufzeit gibt `ids` an `planOrder` (Schritt 5, Punkt 5) | Die Engine hat keinen `ids`-Parameter, sie filtert `GAME_IDS` nach der Registry (D-7). Ein-Spiel-Registry ist getestet (`games/index.test.ts:95`) | reiner Helfer `gamesFor(only?)` in `games/index.ts` → `createEngine(gamesFor(flags.only))` |
| `HostAction` `again`/`lobby` ohne Seed (§3.5) | `engine/types.ts`: beide verlangen `seed` (D-5) | `host.control` nimmt sie ohne Seed an und füllt ihn aus dem injizierten `rand` (uint32). Die UI erzeugt nie Seeds |
| `localConn: Conn`, „connect liefert genau einmal“ | Der Watchdog der Host-eigenen Sitzung schlägt an, wenn der Tab im Hintergrund war. Dann stünde auf dem Host-Handy `lost`, obwohl die Party läuft | reversibel: `connectLocal(): Conn` erzeugt pro Aufruf ein neues Loopback-Paar, die Host-Seite gilt als eingehende Conn. Die Host-Sitzung nutzt den normalen Reconnect-Pfad |
| Alte Conn schließen beim Rebind (§3.7) | `conn.ts`: `close()` feuert `onClose` **synchron**. In der Lobby entfernt `disconnect` den Spieler (D-5, Review-Note Schritt 3) | erst `pid` an die neue Conn binden, dann die alte schließen. `onClose` ruft `disconnect` nur, wenn die Conn noch die gebundene ist |
| Gebundene Conn = Spieler in der Party | `refresh` entfernt Lobby-Spieler nach 6 s Stille, `lobby` entfernt Offline-Spieler. Ihre Conn bliebe gebunden und bekäme Sichten ohne sich selbst | `flush` schließt Conns, deren `pid` nicht mehr in `players` steht. Der Client verbindet neu und wird wieder aufgenommen |
| `fakeclock.ts` existiert | fehlt | neu `src/engine/fakeclock.ts` nach §7.1 (`now/every/after/advance`, Schleifen mit Obergrenze) |
| `ViewCtx{me,toLocal,sfx,fx,reducedMotion}` in `games/types.ts` | `ViewCtx`, `Mounted` und `Render` fehlen. `Sfx`/`Fx` gibt es erst in Schritt 6 | Schritt 5: `ViewCtx = {me, toLocal, reducedMotion}`. `sfx`/`fx` ergänzt Schritt 6 |
| Unit-Test über `createTransport('local')` | braucht echte Event-Loop-Runden, `join` hat einen 3000-ms-Timeout | In-Memory-Fake-Transport aus `createLoopbackPair` (nur Microtasks), dazu ein begrenzter `settle()`-Helfer. `taken` simuliert der Fake |
| Hintergrund-Drosselung in Playwright (Risiko) | gemessen, 3 Seiten in einem Kontext: alle `visible`+`focus`, `setInterval(100)` = 20/2 s, rAF 60 fps | kein Thema. **Aber:** `expect`/`locator.waitFor` pollen mit dem Backoff 0/20/50/100/100 ms, danach **konstant 500 ms** (`retryWithProgressAndBackoff`). Bei fast dauert Intro 300 ms und Ergebnis 500 ms → kann verpasst werden |
| `qrSvg` synchron | `qrcode` → `lib/browser.js`, `toString` ist immer SVG und gibt ein Promise zurück | asynchron einsetzen. Nicht mehr einsetzen, wenn der Screen schon zerstört ist |
| E2E-Speicher | `localStorage` ist im Kontext geteilt (Name vorbelegt = zuletzt gespeicherter), `sessionStorage` pro Seite | E2E setzt Namen per `fill`, nie über die Vorbelegung |
| Smoke | prüft `h1` mit „WG·ARCADE“ | Start-Screen behält das `h1`-Logo |

## 2. Entscheidungen & Fallen
- **Verbindungsfehler beim ersten Verbinden** (reversibel gewählt): gleicher Pfad wie beim Reconnect. Neuer Versuch 1 s nach dem Fehlschlag, nach 10 s `lost`. Ein falscher Code landet damit nach ≤ 10 s auf Lost.
- **Reconnect:** Versuche laufen streng nacheinander, nie parallel (Local-`join` braucht 3 s bis `noroom`). `lost` kommt über ein eigenes `after(10000)`, auch wenn ein Versuch noch hängt. Eine Conn, die nach `lost`/`close`/`joined` noch ankommt, wird sofort geschlossen. `reconnecting` behält die letzte Sicht. `joined` gilt erst ab `welcome`.
- **`reject` ist endgültig:** Das folgende `onClose` startet keinen Reconnect. `badname` führt zurück zum Name-Screen mit `name-error`. `full`/`started` führen zum Rejected-Screen.
- **Name lokal prüfen** (trim 1–12, `maxlength=12`). Das zählt UTF-16-Einheiten wie die Engine (Lehre Schritt 3). Geprüft wird, bevor Host-Laufzeit oder Sitzung entstehen: Das Host-eigene `hello` darf nie abgelehnt werden.
- **Host pro Conn:**
  - Die erste gültige Nachricht muss `hello` sein. Andere Nachrichten davor werden ignoriert (kein `seen`), weitere `hello` auf einer gebundenen Conn ebenfalls.
  - Fehler aus Spiellogik und Engine werden pro Nachricht und pro Tick gefangen (`console.error`), die Party läuft weiter.
  - `stop()`: Danach ist jeder Handler ein No-op. `stop` schließt alle eigenen Conns selbst (das Peer-Endpoint-`close` tut das nicht), dann den Endpoint und den Tick.
- **Injektion:** `host.ts`/`client.ts` benutzen keine globalen Timer, Uhren oder Zufall. `app.ts` verdrahtet `performance.now`, `setInterval`/`setTimeout` und `randomSeed`. Die `pid` kommt aus `crypto.randomUUID` mit Fallback auf `getRandomValues`, denn `randomUUID` fehlt ohne Secure Context (WLAN-Test über `http://192.168…`).
- **Router:**
  - Die Host-Absicht ist ein Flag im Speicher. Nur `btn-host` setzt es, die Route `#/host` verbraucht es. Die Laufzeit entsteht erst im Absenden-Handler des Name-Screens; schlägt `createHost` fehl → `#/` mit Banner.
  - „Neu beitreten“ landet auf demselben Hash. `hashchange` feuert dann nicht → direkt neu routen.
  - `wgarcade.joined` erst nach `welcome` setzen.
- **Party-Dispatcher:** Schlüssel ist `(s, r)`. `reconnecting` zeigt weiter den alten Sub-Screen plus Banner. `connecting` zeigt einen neutralen Platzhalter (kein neuer `data-screen`-Wert). Host-Knöpfe nur bei `view.isHost && hostControl`.
- **QR-URL** als reiner Helfer `joinUrl(origin, base, search, code)` in `config.ts`. Er übernimmt nur `net`/`dev`/`fast`, nicht `only`.
- **E2E-Übergänge:** `page.waitForFunction` (Default raf) **vor** der auslösenden Aktion registrieren, parallel über alle Seiten (`Promise.all`). Für Intro und Ergebnis nicht `expect().toBeVisible()` verwenden.
- **Lehren:**
  - Test-pids müssen `PID_RE` erfüllen (8–64 Zeichen), sonst verwirft `parseClient` das `hello` still.
  - Jede Test-Schleife hat eine Obergrenze.
  - Testkorrekturen kommen als eigener roter Commit mit Vitest-Zusammenfassung.
  - Ist nur ein Fall falsch, werden die Assertions nicht pauschal abgeschwächt.
- Gestaltung nur mit Basis-Tokens; keine px- oder Hex-Werte in TS (Schritt-6-grep). Knopfhöhe über einen Token.

## 3. Dateien (nur Nicht-Offensichtliches)
- Neu: `src/engine/fakeclock.ts`. Der Rejected-Screen lebt in `screens/lost.ts` (reversibel).
- Geändert: `games/types.ts` (`ViewCtx`, `Mounted`, `Render`), `games/index.ts` (`gamesFor`), `config.ts` plus Test (`joinUrl`), `e2e/smoke.spec.ts`, `DECISIONS.md`.

## 4. DoD
1. Host-Join (Unit): Host-Spieler über `connectLocal` und 2 Clients bekommen `welcome` und eine Lobby-Sicht mit 3 Spielern. Der 9. Spieler bekommt `reject full`. `badname` und eine neue pid nach dem Start bekommen `reject`, danach wird die Conn geschlossen. Bei `taken` kommt ein neuer Code, höchstens 5 Versuche.
2. Host-Bindung (Unit): Gleiche pid auf einer neuen Conn schließt die alte. Die neue bekommt sofort die volle Sicht, und in der Lobby bleibt der Spieler drin. Schließt die gebundene Conn, wird der Spieler in der Lobby entfernt bzw. im Spiel offline. Eine Conn, deren Spieler die Engine entfernt hat, wird geschlossen.
3. Host-Flush (Unit):
   - Sichten gehen nur bei JSON-Änderung raus (Zähler: Leerlauf-Ticks und Pings senden keine Sicht).
   - `hello`, `control` und `disconnect` flushen sofort, `input` erst beim nächsten Tick.
   - `again`/`lobby` bekommen einen Seed aus `rand`.
4. Host-Ablauf (Unit, Fake-Uhr): Eine Party läuft von der Lobby bis zum Podium, und alle Clients bekommen die Podium-Sicht. Kaputte Nachrichten, Nachrichten vor `hello` und eine werfende Spiellogik halten den Host nicht an. Nach `stop()` sind alle Conns zu, und es wird nicht mehr getickt.
5. Client-Basis (Unit): Beim Verbinden geht `hello` raus, danach alle 2 s ein `ping`. `toLocal` rechnet mit dem Offset aus `view.now`. `onState` liefert sofort den aktuellen, gepufferten Zustand.
6. Client-Ausfall (Unit):
   - 6 s Stille oder `onClose` → `reconnecting` mit der letzten Sicht. Danach Versuche im 1-s-Takt, nie parallel; bei `welcome` → `joined`, ohne Erfolg nach 10 s → `lost`.
   - `reject` → `rejected`, ohne Reconnect.
   - `close()` stoppt alle Timer. Eine Conn, die zu spät ankommt, wird geschlossen.
7. `gamesFor(only)` liefert eine Registry mit genau dem einen Spiel bzw. alle 4. `joinUrl` übernimmt nur `net`/`dev`/`fast` und hängt `#/j/CODE` an (Unit).
8. Routing (E2E): `#/host` direkt aufgerufen und ein Reload der Host-Lobby landen auf `screen-start`. Ein ungültiger Code `#/j/xx` landet auf Start mit Banner.
9. `lobby.spec` Beitritt:
   - Host „Karim“ (Code wird gelesen), Client 1 per `#/j/CODE` als „Anna“, Client 2 über Start → Beitreten → Code als „Anna“ → „Anna 2“. Alle 3 Seiten zeigen 3 `player`.
   - Ein Reload von Client 1 führt ohne Name-Screen zurück in die Lobby, weiterhin 3 Spieler überall.
10. `lobby.spec` Leerlauf-Party: Runden 3 und Start. Alle 3 Seiten zeigen `intro`, `result` und am Ende `podium`. Die Client-Seiten haben keine Host-Knöpfe. Auf keiner Seite gibt es Konsolen- oder Page-Fehler.
11. Der Test-ID-Vertrag §7.3 ist auf allen Screens dieses Schritts erfüllt (start, name, lobby, intro, game-Fallback mit `data-game`, result, podium, lost, rejected). `badname` zeigt `name-error`.
12. `DECISIONS.md` hat datierte Einträge D-3, D-4, `connectLocal` statt `localConn`, die Erstverbindungs-Regel und `ViewCtx` ohne `sfx`/`fx` bis Schritt 6.
13. TDD: tests written first (separate test-commit before impl), meaningfully cover the change, red→green captured

## 5. Out-of-Scope
- Design-System, Ton, Haptik, Wake Lock, Konfetti und `screens.spec` (Schritt 6). Spiel-Views (Schritt 7). Reconnect mitten im Spiel, Lost-E2E und `party.spec` (Schritt 8).
- Ein dupliziertes Tab mit gleicher pid (beide verdrängen sich gegenseitig) wird nicht behandelt.
- Keine Änderungen an `src/net/{local,peer,loopback,conn,protocol}.ts` und an der Engine-Logik.
