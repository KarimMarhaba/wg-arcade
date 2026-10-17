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

## 2026-10-17 — D-0: Stack und Versionen (Schritt 1)
Was: Vite 8.3, Vitest 5.0, TypeScript 7.0.2 (nativer `tsc`, kein Fallback nötig; `types: [vite/client, node]` explizit),
`@playwright/test` exakt 1.63.0, peerjs 1.5, qrcode 1.5. Zusatz-Dev-Deps: `@types/node` (^22, passend zu Node 22) und `@types/qrcode`.
Schriften als `@fontsource-variable/bricolage-grotesque` und `@fontsource-variable/space-grotesk` statt `@fontsource/*`;
von Bricolage wird `wdth.css` importiert (Achsen wght 200–800, wdth 75–100), `index.css` hätte nur wght.
Warum: Typen für Configs, variable Achsen für die kondensierte Display-Schrift; die Prüfung aus Plan §6.2 ist damit erledigt
(Breitenachse vorhanden). Lockfile enthält die x64-Bindungen (rolldown, lightningcss, typescript), damit `npm ci` in der CI läuft.

## 2026-10-17 — D-8: CI prüft vor dem Build
Was: `pages.yml` führt vor dem Build `npm run lint` und `npm run test:unit` aus; E2E läuft nicht in CI.
Warum: Kaputtes nicht deployen; E2E bräuchte dort einen Browser-Install.

## 2026-10-17 — Aktuelle Action-Hauptversionen
Was: `actions/checkout@v7`, `actions/setup-node@v7`, `actions/upload-pages-artifact@v5`, `actions/deploy-pages@v5` statt der im Plan genannten v4/v3/v4.
Warum: Die alten Hauptversionen laufen auf der Node-20-Laufzeit und sind veraltet.

## 2026-10-17 — `GAME_IDS` in `games/types.ts`
Was: `src/games/types.ts` enthält `GAME_IDS` (as const) und `GameId`; `games/index.ts` re-exportiert später nur.
Warum: `parseFlags` braucht die Ids für `only` schon in Schritt 1, ohne die Registry der Spiele zu importieren.

## 2026-10-17 — D-1: `view`-Nachricht trägt `now`
Was: `HostMsg` `view` enthält zusätzlich `now` (Host-Uhr beim Senden, endliche Zahl); `parseHost` verlangt es.
Warum: Absolute Deadlines in der Sicht halten die Sicht zwischen den Ticks stabil (Diffing per JSON-String); der Client rechnet daraus seinen Uhr-Offset.

## 2026-10-17 — D-2: GameDef-Erweiterung
Was: `GameDef` trägt zusätzlich `accent`, `parseInput` (Rohwert vom Draht → Eingabe oder `null`), `tick(s, now, online)` und `label`; `init` bekommt `ctx {speed}`. Die Engine reicht das Online-Set an `tick` weiter.
Warum: fast-Skalierung, Eingaben vom Draht werden validiert, die Runde endet früh, sobald alle Online-Spieler fertig sind (Offline blockiert nicht), und die Ergebnis-Zeile zeigt den Rohwert (z. B. „742 ms“).

## 2026-10-17 — D-5: Lobby entfernt Getrennte; „Neue Party“ = zurück in die Lobby mit neuem Seed
Was: In der Lobby entfernen `disconnect` und Timeout (> 6000 ms) den Spieler samt Farbe; außerhalb der Lobby wird er nur offline. „Neue Party“ ist `{a:'lobby', seed}` (gleicher Code, Punkte 0, Offline-Spieler entfernt, Verbindungen bleiben). Die Laufzeit übergibt `randomSeed()`. Auch `again` bekommt einen neuen Seed.
Warum: Freie Plätze und Farben in der Lobby. Ohne neuen Seed wären nach „Neue Party“ und `start` Spielreihenfolge und Runden-Seeds (Blitz-Wartezeiten, Schätzfuchs-Frage) identisch zur ersten Party.

## 2026-10-17 — D-7: fast skaliert nur Spiel- und Phasendauern; `?only=<id>`
Was: `speed` (10 mit dev + fast) teilt Phasen- und Spieldauern (`scale`), nicht Heartbeat (`PING`/`OFFLINE`/`TICK`), `GRACE` und `BLITZ_MAX`. Das dev-Flag `?only=<id>` beschränkt die Spiel-Registry auf ein Spiel; die Engine kennt es nicht, sie plant über `GAME_IDS` gefiltert nach der Registry (ein Spiel wird wiederholt).
Warum: Netztoleranz bleibt real, Wertungswerte bleiben vergleichbar; gezielte E2E-Läufe pro Spiel.

## 2026-10-17 — D-6: Farbfalle-Farben ROT/BLAU/GELB/WEISS ohne Grün; Hex nur als Tokens
Was: Farbfalle nutzt ROT, BLAU, GELB und WEISS. Die Hex-Werte (`#ff3b4e`, `#3d7bff`, `#ffe14d`, `#f4f1ea`) stehen als `--ff-rot|blau|gelb|weiss` in `tokens.css`. `games/colors.ts` enthält nur `id` (`rot|blau|gelb|weiss`, wie `data-ink`) und das Wort, keine Hex-Werte. Folge und Eingabe sind Indizes 0..3 über `FF_COLORS`.
Warum: Grün entfällt wegen Rot-Grün-Schwäche. Hex nur in `tokens.css`/`palette.ts` hält die Farbquelle einzig. Index-Paare statt Objekten halten die Sicht klein (400 Paare: ~3,6 kB statt >12 kB; `parseEnvelope` verwirft > 16 384 Zeichen still, und jede Antwort schickt die Sicht erneut).

## 2026-10-17 — D-9: Schätzfuchs-Frage pro Runde per Seed
Was: Die Frage ist `QUESTIONS[int(mulberry32(seed), 0, len-1)]` mit dem Runden-Seed. Eine Wiederholung innerhalb einer Party ist theoretisch möglich.
Warum: Die Spiellogik bleibt rein und kennt die Party nicht; bei 50+ Fragen und höchstens 8 Runden ist die Wahrscheinlichkeit gering.

## 2026-10-17 — Ohne Eingabe kein Ergebnis
Was: `result` von blitz, hammer und farbfalle enthält nur Spieler mit mindestens einer gültigen Eingabe; ohne Eingabe gilt das Label „–“. Schätzfuchs trägt ohne Tipp ebenfalls keinen Eintrag. Fehlende blitz-Versuche eines Teilnehmers zählen 1000. Früh-Ende gilt, wenn es mindestens einen Online-Teilnehmer gibt und alle Online-Teilnehmer fertig sind; Offline-Spieler blockieren nicht.
Warum: Der Client meldet immer etwas (blitz 1000 bei Kein-Tap, hammer `final`, farbfalle `done`). Ohne die Regel bekäme bei 2 Spielern ein online gemeldeter, aber nie eingreifender Spieler einen Wert und damit 3 Punkte. `rank` setzt fehlende Einträge auf den letzten Platz mit 0 Punkten.

## 2026-10-17 — D-3: Client-`render` liefert `Mounted{update,destroy}`
Was: `Render<V, I> = (root, v, send, ctx) => Mounted<V>` mit `Mounted<V> = {update(v), destroy()}` (`games/types.ts`). Die Screens (`ui/screens/*`) folgen demselben Muster; `party.ts` behält einen gemounteten Sub-Screen, solange `(s, r)` gleich bleibt, und ruft nur `update(view)`.
Warum: Lokaler Spielzustand (Timer, Fortschritt) überlebt Sicht-Updates; Listener und Timer werden in `destroy` aufgeräumt.

## 2026-10-17 — D-4: Host-Steuerung nur lokal
Was: `host.control(a)` ist nur über die Host-Laufzeit erreichbar und nicht Teil des Protokolls. `again`/`lobby` nimmt `control` ohne Seed an und füllt ihn aus dem injizierten `rand` (uint32); die UI erzeugt nie Seeds. Die UI zeigt Host-Knöpfe nur bei `view.isHost && env.control`.
Warum: Clients können die Party nicht steuern; das Protokoll bleibt wie im Design. Seeds im Host halten die UI frei von Zufall (D-5: neue Party braucht neuen Seed).

## 2026-10-17 — `connectLocal(): Conn` statt `localConn`
Was: `createHost` liefert `connectLocal()`; jeder Aufruf erzeugt ein neues Loopback-Paar, die Host-Seite wird wie eine eingehende Conn behandelt (gleicher `hello`-Pfad, gleiche Rebind-Regel). Die Host-eigene Sitzung nutzt `connect: () => Promise.resolve(host.connectLocal())` und damit den normalen Reconnect-Pfad.
Warum: Der Watchdog der Host-Sitzung schlägt an, wenn der Tab im Hintergrund war; mit einer einmaligen `localConn` stünde dann `lost` auf dem Host-Handy, obwohl die Party läuft.

## 2026-10-17 — Verbindungsfehler beim ersten Verbinden wie beim Reconnect
Was: `createClientSession` behandelt Fehlschläge beim ersten Verbinden wie einen Reconnect: Versuche laufen streng nacheinander (nie parallel) im 1-s-Takt, nach 10 s ohne `welcome` folgt `lost`. Währenddessen bleibt der Zustand `connecting`. `joined` gilt erst ab `welcome`; `reject` ist endgültig (`rejected`, kein Reconnect). Eine Conn, die nach `lost`, `close()` oder einem anderen Ergebnis ankommt, wird sofort geschlossen.
Warum: Ein falscher Raumcode landet nach höchstens 10 s auf dem Lost-Screen, statt ewig zu hängen; Local-`join` braucht 3 s bis `noroom`, parallele Versuche würden sich stauen.

## 2026-10-17 — Host bindet erst, dann schließt; geschlossene Spieler-Conns
Was: Bei gleicher `pid` auf neuer Conn wird zuerst die neue gebunden, dann die alte geschlossen; `onClose` ruft `disconnect` nur für die noch gebundene Conn. `flush` schließt gebundene Conns, deren Spieler die Engine entfernt hat (Lobby-Timeout, „Neue Party“). `stop()` schließt alle eigenen Conns selbst.
Warum: `close()` feuert `onClose` synchron; ohne diese Reihenfolge würde ein Reload den Spieler in der Lobby entfernen. Der Client verbindet nach dem Schließen neu und wird wieder aufgenommen.

## 2026-10-17 — `ViewCtx` ohne `sfx`/`fx` bis Schritt 6
Was: `ViewCtx = {me, toLocal, reducedMotion}`; `sfx` und `fx` kommen mit Schritt 6 (Design-System). `Mounted` und `Render` stehen in `games/types.ts`. Der Rejected-Screen lebt in `screens/lost.ts`; `fakeclock.ts` ist ein reiner Test-Helfer in `src/engine/`.
Warum: `Sfx`/`Fx` existieren erst in Schritt 6; Schritt 5 braucht nur Zeitumrechnung und Reduced-Motion.

## 2026-10-17 — Hex nur in tokens.css, Zusatz-Tokens, Wächter
Was: Alle Hex-Werte stehen ausschließlich in `ui/tokens.css`, auch die Spielerfarben `--p0..--p7`. `palette.ts` hält nur Name, Form-Id und SVG-Pfad (keine Hex-Werte); die Farbe kommt über `data-color` → `--pc` in `components.css`, das Konfetti liest `getComputedStyle(--pN)`. Dazu Zusatz-Tokens für Werte, die §6.5 ohne Token nennt: `--stagger` (60 ms), `--d-float` (600 ms), `--d-punch` (120 ms), `--d-flash` (220 ms), `--punch-x`/`--punch-y` (6/3 px), `--enter-y`, `--flash-alpha`, außerdem Layout-Maße (`--qr-w`, `--badge-*`, `--podium-h`, `--bar-h`, `--dot-*`, `--stripe-w`, `--logo-sh` …). `ui/tokens.test.ts` ersetzt die Hand-grep-Kontrolle: Es schlägt bei Hex- oder px-Literalen in `src/**/*.{ts,css}` außerhalb von `tokens.css` (Tests ausgenommen) und bei `var(--x)` ohne Definition fehl und prüft den Kontrast ≥ 4.5 von `--on-accent` auf allen Spieler- und Akzentfarben.
Warum: Hex in `palette.ts` und in `--p0..7` wären zwei Quellen für dieselbe Farbe (Lehre „Regel an drei Stellen“). Der Wächter hält die Regel dauerhaft, auch für spätere Schritte.

## 2026-10-17 — Zeitbalken ohne `dur`, Ausnahme vom Reduced Motion
Was: `timerBar(hostEndsAt, dur?, ctx)` nimmt `dur` optional. Ohne `dur` startet der Balken beim Mount voll und läuft linear bis `toLocal(hostEndsAt)` (Ergebnis-Screen, dessen Sicht nur `until` trägt). Mit `dur` beginnt er bei `Rest/dur`. Unter `prefers-reduced-motion` laufen alle Animationen und Transitions mit 0.01 ms, nur `.timer-fill` behält seine Dauer (`--bar-ms`).
Warum: Engine und Sicht bleiben unverändert. Der Balken ist Information (Restzeit), keine Bewegung; ihn abzuschalten würde die Restzeit verstecken.

## 2026-10-17 — Audio-Unlock bei der ersten Geste (document-Listener)
Was: `app.ts` hängt `pointerdown`, `pointerup` und `keydown` (capture, passive) an `document` und ruft jedes Mal das idempotente `sfx.unlock()` (erzeugt den Context einmal, weckt einen angehaltenen). Zusätzlich liefert ein `click`-Listener für jeden aktiven Knopf (außer `data-silent`, z. B. Mute) `sfx tap` und `buzz(10)`. Kein Unlock im Start-/Join-Klick.
Warum: Auto-Rejoin (Reload auf `#/j/CODE`) hat vor dem ersten Ton keinen eigenen Klick. iOS entsperrt erst bei `pointerup`/`click`, nicht bei `pointerdown`; daher bleiben die Listener bestehen statt „einmalig“. `buzz` läuft nur im Klick-Handler (Geste), nie beim Mount.

## 2026-10-17 — `Sfx`/`Fx` in `games/types.ts`
Was: `Sfx {play, buzz, unlock, muted, setMuted}`, `SfxKind` und `Fx {punch, floatText, flash, reducedMotion}` stehen als Interfaces in `games/types.ts`; `ViewCtx` trägt `sfx` und `fx`. Die Implementierungen leben in `ui/` (`sfx.ts`, `haptics.ts`, `fx.ts`), `app.ts` setzt sie in `envFor` zusammen (`buzz` aus `haptics.ts`, das dem Mute von `sfx` folgt). `Fx.flash(kind)` ist neu gegenüber §3.4 und dient Schritt 7 (Treffer/Fehler).
Warum: Kein Import games → ui (Spiel-Views kennen nur die Interfaces). Haptik gehört fürs Spiel zu „Feedback“; ein Objekt in `ViewCtx` genügt.

## 2026-10-17 — Rejected zeigt nur `btn-home` (Klärung zu §7.3)
Was: Der Rejected-Screen hat ausschließlich `btn-home` („ZUM START“), kein `btn-rejoin`. §7.3 nennt `btn-rejoin` unter „Lost/Rejected“; gemeint ist Lost.
Warum: Ein Beitritt, den die Party abgelehnt hat (voll, läuft schon), wird durch erneutes Beitreten nicht besser. §6.6 nennt für Rejected nur „ZUM START“.

## 2026-10-17 — Host-Lost ohne `btn-rejoin`
Was: Der Lost-Screen des Hosts (`env.control` gesetzt) zeigt nur `btn-home`; Clients behalten `btn-rejoin` und `btn-home`. `PartyProps.onRejoin` ist optional, `launchHost` übergibt es nicht mehr.
Warum: Für den Host führte „Neu beitreten“ nach `#/host` ohne Host-Absicht auf den Start (Reload-Regel), wirkte also wie „Zum Start“ und täuschte eine zweite Option vor.

## 2026-10-17 — Spiel-Views mounten in `frame.body`
Was: `mountGame` baut den Rahmen (`screenFrame` mit Header „RUNDE r/n · Titel aus `GAMES`“ und Code) und übergibt `frame.body` als `root` an die Spiel-View; `data-screen`, `data-game` und `data-state` (`play`) bleiben am Screen-Root.
Warum: Der Rahmen ist ein Grid mit Header, Inhalt und Footer; Spiel-Elemente direkt im Root würden das Grid verschieben. Schritt 7 füllt nur den Inhaltsbereich.

## 2026-10-17 — screens.spec: Rundgang ohne fast, Podium mit fast
Was: Der Rundgang in `screens.spec.ts` läuft ohne `fast` (`dev=1&only=hammer`, Intro 3 s, Spiel 8 s, Ergebnis 5 s) und schließt am Ende die Host-Seite (Lost, Timeout 45 s). Podium (B), Reduced Motion (C), Feel und Lobby-Pop laufen mit `fast`. Kein Canvas wird per MutationObserver ab Seitenstart gemessen (`addInitScript`), mit (B) als Positivkontrolle.
Warum: Mit `fast` dauern Intro (300 ms), Hammer (800 ms) und Ergebnis (500 ms) kürzer als das Poll-Intervall von `expect` nach dem Backoff (500 ms); Screenshot und Messung verpassten den Screen. Der Beobachter erkennt auch ein Canvas, das kürzer lebt als ein Poll-Intervall.

## 2026-10-17 — Spiel-Kontext: Root-`data-state` und Spielerliste (Schritt 7)
Was: `Render` bekommt einen `PlayCtx` (erweitert `ViewCtx` um `clock {now, after, every}`, `players()`, `setState(s)`, `punch()`). `ui/screens/game.ts` baut ihn, hält die Spielerliste mit jedem `update` aktuell und setzt über `setState` den `data-state` am Screen-Root (`blitz`: wait|go|show|early|done, `hammer`/`farbfalle`: play|done, `schaetzfuchs`: ask|sent|reveal). Header und Zeitbalken liegen im Rahmen; der Balken wird neu gebaut, sobald sich `endsAt` ändert (Schätzfuchs ask→reveal). Die Views bekommen nur das `game-area`-Element. Reine Lauf-Module (`<id>/play.ts`, `resume.ts`) kennen weder DOM noch `performance`, sondern nur die injizierte `clock`.
Warum: Hammer-Balken, Blitz-Fortschritt und Schätzfuchs-Auflösung brauchen Namen und Farben aus `v.players`, die die Spielsicht nicht trägt. Den Root-State kennt nur die View. Die Uhr als Parameter macht Zeitlinien mit der Fake-Uhr testbar. `app.ts`, Engine und Netz bleiben unverändert.

## 2026-10-17 — Spiel-Eingaben: `data-silent` mit eigenem Feedback, Zusatz-Test-IDs
Was: `blitz-pad`, `btn-hammer` und `ff-*` tragen `data-silent` und reagieren auf `pointerdown`; der globale Tap-Ton (`click` auf `button:not([data-silent])`) greift dort nicht. Ton, Haptik und Effekte laufen im Handler über `ctx` (`sfx`, `fx`, `punch`). Der Fehler-Buzz `[30,40,30]` steht nur in Geste-Handlern (Frühstart, falsche Farbe, ungültiger Tipp). Punch nur auf dem Screen-Root (`ctx.punch`) und nur bei Blitz-Treffern, nie pro Hammer-Tap oder Farbfalle-Antwort; Flash ist ein Overlay. Zusätzliche Test-IDs über den Vertrag hinaus: `hammer-count`, `ff-score`, `sf-answer` (plus `data-answer` an `sf-reveal`), `sf-sent`, `sf-guess`.
Warum: Ein `click` kommt erst nach dem Loslassen, der Hammer soll beim Aufsetzen zählen. Ohne `data-silent` spielte jede Eingabe zusätzlich den Tap-Ton. Die Zusatz-IDs lassen die E2E den angezeigten Endstand gegen das Host-Label prüfen.

## 2026-10-17 — Blitz: letzter Versuch geht direkt auf done; Tap vor go zählt als Frühstart
Was: Nach dem dritten Versuch wechselt `blitz-pad` ohne `show`-Phase direkt auf `done` und zeigt die letzte Zeit; ein Frühstart im letzten Versuch zeigt `early` und danach `done`. Ein Tap, dessen `event.timeStamp` vor dem lokalen go-Zeitpunkt liegt, gilt als Frühstart. Beim Wiedereinstieg endet der Lauf mit der lokalen Endzeit; bis dahin offene Versuche gehen als 1000 raus.
Warum: Der Host beendet die Runde höchstens ein Tick (100 ms) nach dem dritten Wert; eine `show`-Phase von 900 ms würde vom Ergebnis-Screen abgeschnitten, und `done` wäre nie sichtbar. Der Zeitstempel misst die Reaktion unabhängig von der Verarbeitung (`ms` = `timeStamp` − go; fällt auf `performance.now()` zurück, wenn er nicht in dessen Zeitbasis liegt).

## 2026-10-17 — Schätzfuchs: Submit per Form statt `pointerdown`; Parser
Was: `sf-submit` ist ein normaler Submit-Knopf in einem `form` (Klick und Enter), kein `pointerdown`-Handler und kein `data-silent`. `parseGuess` akzeptiert Ziffern, Leerzeichen und Tausenderpunkte; alles andere (Komma, Buchstaben, Minus, leer, > 1e12) ist ungültig und wird nicht gesendet („Bitte eine Zahl eingeben.“, Fehler-Buzz). Das Hochzählen der Antwort dauert höchstens 1,2 s und höchstens die Hälfte der Restzeit der Auflösung; unter Reduced Motion steht die Antwort sofort da.
Warum: Der Tipp ist nicht zeitkritisch; der Form-Submit liefert Enter, Tastatur-„Senden“ und Screenreader-Bedienung ohne eigenen Code (Auslegung von §4.3 „Eingaben auf pointerdown“ für zeitkritische Eingaben). „3,5“ als 35 zu lesen wäre eine stille Fehlinterpretation, die Fragen haben ganzzahlige Antworten.

## 2026-10-17 — Wiedereinstieg (§4.3) als reine Funktion
Was: `games/resume.ts` liefert je Spiel aus Sicht, Mount-Zeit und `toLocal` das lokale Ende und den Fortsetzungspunkt. Fortschritt in der Sicht (blitz: ein Wert in `mine`, hammer: `mine>0`, farbfalle: `next>0`, Schätzfuchs: `myGuess≠null`) ergibt `end = toLocal(endsAt)` und Fortsetzen ab dem Stand der Sicht; ohne Fortschritt gilt `end = Mount + dur`. `update()` überschreibt den lokalen Stand nie (Host-`mine`/`next`/`score` hinken nach); übernommen werden nur Fremdes (Balken, `progress`, `guessed/total`, Reveal).
Warum: Ein Reload darf weder Zeit schenken noch kosten. Die Regel gehört in eine getestete Funktion statt in vier Views.

## 2026-10-17 — games.spec: Auslegung
Was: (1) Hammer und Farbfalle klicken per `page.mouse` auf die einmal gemessene Mitte (so oft wie möglich bis `done`), nicht 15× per Locator-Klick; (2) die E2E prüft das Host-Label gegen den in der View angezeigten Endstand (`hammer-count`, `ff-score`, `sf-answer`) statt gegen eine Bot-Zählung; (3) Ergebniszeilen, Spiel-Roots, `data-state`-Folgen (über `oldValue`), Flash-/Punch-Zähler und die Reveal-Anzeige protokolliert ein `MutationObserver` aus `addInitScript`, der nach dem Podium ausgewertet wird; die Bots warten per `waitForFunction`, nie per `expect` auf Zustände unter einer Sekunde; (4) das Layout läuft in eigenen Tests ohne `fast` (nur der erste Spiel-Screen, bei Schätzfuchs zusätzlich die Auflösung), `audit` lebt dafür in `e2e/helpers.ts` und prüft im Spiel-Root zusätzlich vertikales Scrollen; (5) die Frühstart-Runde ist Runde 2 des Blitz-Laufs.
Warum: Mit `fast` dauert der Hammer 800 ms; `locator.click` wartet auf Stabilität (Enter-Animation 180 ms, `:active`-Transition) und verpasst das Fenster. `expect` pollt nach dem Backoff nur alle 500 ms, das Ergebnis steht 500 ms. Ein Label-Vergleich gegen die Anzeige beweist, dass jede lokal gezählte Eingabe beim Host ankam.

## 2026-10-17 — QR trägt `data-url`, Beitritt per Link im E2E
Was: Das QR-Element (`qr`) trägt die absolute Beitritts-URL als `data-url` (gleicher Origin, nur `net/dev/fast`, Hash `#/j/CODE`). `party.spec` tritt Client A über genau diese URL bei, Client B per Code-Eingabe.
Warum: Der QR-Inhalt ist als SVG nicht lesbar; das Attribut macht den Pfad prüfbar, den ein Scan nimmt.

## 2026-10-17 — Aufzeichnung statt Polling in party.spec und reconnect.spec
Was: Ein gemeinsamer `MutationObserver` (`e2e/watch.ts`, per `addInitScript`) hält je Seite Runden, Ergebniszeilen (pid, Platz, Punkte, Total, Name, Farbe), Podien und Intro-Köpfe fest; geprüft wird nach dem Lauf. Die Bots warten per `waitForFunction` (raf), nie per `expect`. Die Punkteprüfung ist je Runde fest: Punkte = `[5,3,2,1][Platz−1]`, Plätze beginnen bei 1 und sind gleich dem Vorgänger (Gleichstand) oder gleich dem Index, Total = Vorrunde + Punkte, alle Seiten sehen identische Zeilen. Fällt ein Bot ohne Ergebnis aus, schlägt die Prüfung fehl (nicht aufweichen, Bot reparieren).
Warum: Ergebnis (500 ms) und Intro (300 ms) sind mit `fast` kürzer als das Poll-Intervall von `expect`; nur eine Aufzeichnung sieht jeden Screen und prüft Reihenfolge und Werte lückenlos.

## 2026-10-17 — Kein-Duplikat-Prüfung über die Host-Aufzeichnung
Was: Dass ein Reload keinen zweiten Spieler erzeugt, beweist `reconnect.spec` über die Host-Aufzeichnung: jede Ergebnisliste und das Podium haben genau 2 Zeilen mit 2 verschiedenen pids, und pid, Name und Farbe des Clients bleiben gleich. Die Aufzeichnung der neu geladenen Seite wird nicht benutzt.
Warum: Die Test-ID `player` gibt es nur in der Lobby; ein Reload setzt `window.rec` der Seite zurück. Der Host sieht alle Spieler in jeder Runde.

## 2026-10-17 — `only=hammer` für den Offline-Test
Was: Der Test „B schließt“ läuft mit `only=hammer` und `fast`. Der Host markiert B erst über den Timeout (`OFFLINE` 6 s, der Local-Client sendet kein `fin`): 4 bis 6,1 s nach dem Schließen, gemessen als `data-online=false` an `.badge[data-pid=B]` in höchstens 8 s. Danach hat B in jeder weiteren Runde Platz 3 und 0 Punkte.
Warum: Nur der Hammer-Balken zeigt während des Spiels Badges (Farbfalle und Intro zeigen keine); 8 Runden halten die Party lange genug über dem Timeout.

## 2026-10-17 — Online-Wechsel in place auf Ergebnis und Podium
Was: `syncOnline(root, players)` (`ui/components.ts`) setzt `data-online` der vorhandenen Badges; Ergebnis- und Podium-Screen rufen es bei jedem `update` auf, bevor der Schlüssel (Zeilen, Namen, Farben) über einen Neuaufbau entscheidet. `online` bleibt bewusst aus dem Schlüssel. Der E2E-Beweis am Podium: markierte Zeile und Badge bleiben, kein Knoten kommt hinzu oder fällt weg (das Konfetti-Canvas ausgenommen, das sich selbst entfernt).
Warum: Wegen `online` im Schlüssel hätte jeder Wechsel Zeilen neu gebaut und die Einblend-Animation erneut gespielt (bzw. ohne `online` veralten die Badges, Schritt-6-MINOR).

## 2026-10-17 — `getTransport` cacht keinen Fehlschlag
Was: `lazyTransport(kind, make?)` in `net/transport.ts` baut den Transport beim ersten Aufruf, teilt das laufende Versprechen zwischen gleichzeitigen Aufrufen und verwirft es bei einer Rejection; der nächste Aufruf baut neu. `app.ts` nutzt es als `getTransport`.
Warum: Vorher blieb ein fehlgeschlagener Aufbau (z. B. Broker nicht erreichbar) dauerhaft im Cache; „Neu beitreten“ lädt die Seite nicht neu und scheiterte dann immer wieder.

## 2026-10-17 — Blitz-Ende liefert die gesendeten 1000 an die Sicht
Was: Läuft die lokale Zeit mit offenen Versuchen ab, trägt das letzte `done`-Event `filled` (die mit 1000 gesendeten Versuche); `record(results, e)` in `games/blitz/play.ts` schreibt sie in die Chips. Die Zahl der Versuche in der Sicht kommt aus `v.waits.length` statt einer Konstante.
Warum: Die Chips zeigten „–“, obwohl der Host 1000 hatte (Schritt-7-MINOR). Die Zuordnung steht in einer reinen, getesteten Funktion.

## 2026-10-17 — Schätzfuchs: Antwortgröße nach Zeichenzahl
Was: Die Auflösung zeigt die Antwort in Mega bis 5 Zeichen (inkl. Tausenderpunkte), bis 8 Zeichen in XXL, darüber in XL (`MEGA_CHARS`/`XXL_CHARS` in `schaetzfuchs/view.ts`). Abweichung von §5 „Mega-Größe“.
Warum: Antworten wie „299.792.458“ liefen in Mega über die 390 px Breite; kleiner statt abgeschnitten bleibt lesbar.


## 2026-10-17 — Spielepaket 2 + Trinkmodus
Was: 10 neue Spiele (gleichklang, werwuerde, bombe, stopp, luegenbaron, verraeter, pokerface, erklaerbaer, blindmaler,
fakefakt) und ein optionaler Trinkmodus (Lobby-Schalter, Default aus) mit 5 klassischen Trinkspielen (nochnie,
koenigskarte, busfahrer, wahrpflicht, kartoffel); Bau-Wahrheit `docs/design/paket2.md`. Rundenlänge 20–90 s. Alles ab 2 Spielern.
Warum: Karim wünscht mehr, kreativere Spiele, klassische Trinkspiele und 2-Spieler-Partys. Auswahl per Ideen-Workflow
(5 unabhängige Ideengeber, 3 Juroren, Synthese); bisher fast nur Reaktionsspiele, der Raum (Reden, Bluffen) war ungenutzt.
Trinkmodus optional mit Leitplanken (Wasser zählt, Passen okay, max. 3 Schlücke/Runde).

## 2026-10-17 — D-P2-1: Trink-Hinweis client-seitig, je Party-Code, blockiert nichts
Was: Das Overlay `drink-hint` (`role=dialog`, `aria-modal`, Knopf `btn-drink-ok`) hängt auf Wrap-Ebene in `ui/screens/party.ts` und übersteht Screen-Wechsel. Es erscheint, sobald eine Sicht `drinking: true` trägt und `sessionStorage['wgarcade.drinkhint.<code>']` fehlt; „Verstanden“ setzt den Schlüssel (zusätzlich ein In-Memory-Set, falls Storage wirft). Den Zugriff reicht `app.ts` als `store` (das geschützte `session`-Objekt) in `PartyProps`. Das Overlay trägt kein `data-screen`, damit `audit()` („genau 1 `[data-screen]`“) gilt.
Warum: Pro Party (Code) einmal je Handy, Nachzügler und Reloads verhalten sich richtig, und die Engine wartet nie auf Handys.

## 2026-10-17 — D-P2-2: `drinking` überlebt „Nochmal“ und „Neue Party“
Was: `again` und `lobby` lassen `Party.drinking` unverändert; der Schalter `{a:'drinking', on}` wirkt nur in der Lobby, ein gleicher Wert gibt dieselbe Referenz. `init` bekommt `{ speed, drinking }`.
Warum: Der Trinkmodus ist eine Entscheidung des Abends, nicht einer Partie; wieder ausschalten geht in der Lobby.

## 2026-10-17 — D-P2-3: Dev-Flags `seed` und `rounds`
Was: `seed=<uint32>` und `rounds=<1..8>` gelten nur mit `dev=1`, ungültige Werte werden ignoriert (`config.ts`). `seed` fixiert Party-Seed, `rand = mulberry32(seed + 1)` damit auch Raumcode und Nochmal-Seeds; `rounds` geht über `HostOptions` an `engine.create` (`Party.rounds` ist `number`, die Lobby bietet weiter 3/5/8, die Aktion `rounds` bleibt auf 3/5/8 beschränkt). Beide Flags stehen bewusst nicht in `JOIN_KEYS`: `party.spec` verlangt die QR-URL mit genau `dev,fast,net`.
Warum: Reproduzierbare und kurze E2E-Läufe (`only=hammer&rounds=1&seed=…`); `workers: 1` macht feste Raumcodes unproblematisch.

## 2026-10-17 — D-P2-5: Teilnahme-Regel
Was: Ein `result`-Eintrag entsteht erst mit der ersten angenommenen Eingabe (auch Rollen-Eingaben wie Karte wählen, „Fertig“, Stufe tippen); Seed-Default-Wahlen zählen nicht. Wer gar nichts tippt, ist Letzter mit 0 Punkten und Label `–`, auch wenn andere ihn gewählt haben. Die generalisierte Konformität prüft das für alle Spiele.
Warum: Das bestraft Abwesenheit, nicht Pech; `rank` behandelt „kein Eintrag“ ohnehin als letzten Platz.

## 2026-10-17 — D-P2-11: Spielakzent über `data-tint`, nicht `data-accent`
Was: Der Game-Frame trägt `data-tint=<accent>`; die vier `data-game`-Timer-Regeln in `games.css` sind vier `data-tint`-Regeln (Farben unverändert: blitz lime, hammer hot, farbfalle cyan, schaetzfuchs orange). Es bleibt bei den vier Akzenten, sie wiederholen sich über die Spiele.
Warum: `.frame[data-accent=…]` setzt `--accent-c`, und `.frame` hat `background: var(--accent-c)`; am Game-Frame würde der ganze Spiel-Screen eingefärbt (das Intro nutzt das bewusst vollflächig). Die E2E prüft Timer-Farbe gleich Akzent und Frame-Hintergrund ungleich Akzent.

## 2026-10-17 — D-P2-12: `setState(state, {step, role})` als Bot- und E2E-Vertrag
Was: `PlayCtx.setState(state, extra?)` setzt `data-state` sowie `data-step` und `data-role` am Game-Root; fehlt ein Schlüssel, wird das Attribut entfernt, damit nichts aus der Vorphase stehen bleibt. Es hat in Schritt 1 noch keinen Verbraucher, der Nachweis folgt mit dem ersten Mehrphasen-Spiel (S3).
Warum: Mehrphasen- und Rollenspiele brauchen einen stabilen DOM-Vertrag für Bots, ohne dass Texte oder Layout geparst werden.

## 2026-10-17 — D-P2-14: Trinkplan-Typ mit `cheers`, „alle gleich → Anstoßen“
Was: `DrinkPlan = { rows: Record<pid, Drink>; cheers: boolean }`; `drinks?(s)` eines Spiels darf `DrinkPlan` oder `Record<pid, Drink>` liefern (Unterscheidung: `rows` ist ein Objekt und `cheers` ein Boolean, ein Record mit der pid „rows“ bleibt ein Record). `capDrinks` entfernt Offline und Unbekannte, rundet ab, kappt `take`/`give` auf 0..3 (NaN → 0), lässt Zeilen ohne Schluck weg und behält `cheers` nur ohne `take`. Die Platz-Regel (`placeDrinks`): Stehen alle Online-Teilnehmer auf demselben Platz (egal welchem), gibt es `cheers` und niemand trinkt; n ≤ 1 liefert einen leeren Plan ohne `cheers`. Vorletzt (n ≥ 5) ist der nächstkleinere Platz unter `last`, größer als 1. `RoundRecord.drinks` und die Result-Sicht tragen den gekappten Plan (Zeilen in Ergebnis-Reihenfolge, nur mit Schluck), die Ergebnisphase dauert nur mit Trinkmodus `scale(RESULT + DRINK_EXTRA)`.
Warum: `rank` gibt Spielern ohne Eingabe den Platz `pids.length`; ein Leerlauf-Duo steht also beide auf Platz 2 und müsste nach dem bloßen Wortlaut je 1 trinken. P2 sagt aber „Zu zweit bei Gleichstand: beide stoßen an“, für 3+ ist die Regel die konsistente Fortsetzung (reversibel). Spiel-eigene `drinks` laufen durch dieselbe Kappung (Leitplanke: höchstens 3 Schlücke je Runde).

## 2026-10-17 — Paket 2, Schritt 1: Messung E2E
Was: `npm test` nach Schritt 1: 681 Unit-Tests (11 s) und 33 E2E-Tests in 4,5 min (vorher 32 Tests, 4,2 min). Neu ist `e2e/drink.spec.ts` (9 s). Ziel bleibt ≤ 9 min.
Warum: Laufzeit-Budget des Master-Plans (§4.3) mitführen, jeder Spiel-Schritt erweitert die Suite.

## 2026-10-17 — D-P2-4: Bank-Marker und `bankProblems` statt `expect`-Wrapper
Was: Bank-Einträge tragen `wg?: true` (Marker für die WG-Quoten) und bei fakefakt `src` (kurzer Belegvermerk, wird nicht angezeigt). Die Prüfung ist die reine Funktion `bankProblems(items, opts) → string[]` in `games/bankcheck.ts` (kein `vitest`-Import); Tests prüfen `expect(bankProblems(…)).toEqual([])`. Die Längengrenze gilt je String (`text: x => [[x.q, 90], [x.unit, 18]]`), nicht als ein einziges `max`. Dubletten laufen nur über `norm(key(x))` (Default: erster Text), nicht über alle Strings. Der Verbots-Lint nutzt Unicode-Wortgrenzen (`(?<!\p{L})…(?!\p{L})`, Flag `u`) mit einer festen Standardliste (u. a. `Ex`, `Sex…`, Körper/Gesundheit/Herkunft/Religion/Sexualität) und einer optionalen Zusatzliste `forbid` je Bank (für Pflichten: Geld, Euro, anfassen, küssen). Dazu `games/match.ts` (`norm`, `levenshtein`) für Rate-Spiele.
Warum: Ein `expect`-Wrapper kann seine eigene Positivkontrolle nicht testen (S1-Lehre `leaks`); `bankProblems` liefert Befunde als Liste, und `bankcheck.test.ts` zeigt je Befundart ein meldendes Fixture. JS-`\b` ist ASCII-only, Muster mit Umlaut am Rand träfen nie; ein naives `/euro/i` würde die Schätzfuchs-Frage „…Europäischen Union“ melden. Ein Gesamt-Dedupe würde „Ja“/„Nein“ über verschiedene Fragen melden. Erster Verbraucher ist die Schätzfuchs-Bank (`questions.test.ts`), sie bleibt ohne Befund.

## 2026-10-17 — D-P2-13: Neue Spiele über `duo.spec` mit `rounds=1`, `drive`-Vertrag, Bausteine erst ab S3 laufzeitgeprüft
Was: Neue Spiele bekommen keinen Einzelspieler-Test in `games.spec` (drei Runden je Spiel wären zu lang), sondern einen Test in `duo.spec.ts` mit Host + 1 Gast, `only=<id>&rounds=1&fast=1&seed=<fest>`, beide Seiten per Bot parallel. S2 deckt die vier Altspiele ab (4 Tests, gemessen in `.claude/reviews/paket2-step-2.md`). `LABEL`/`CONTRACT`/`ACCENT` stehen in `e2e/contract.ts` (Specs dürfen sich nicht gegenseitig importieren), `cssColor` in `e2e/helpers.ts`. `drive(page, act)` in `e2e/bots.ts` ruft `act` genau einmal je `(state, step, role)` (gesehen-Menge je Aufruf, Wiederkehr eines Tripels löst nichts erneut aus), endet mit dem Game-Root, schluckt Fehler in `act` nach dem Entfernen und wirft sie bei vorhandenem Root; nachgewiesen mit `page.setContent`-Fixtures in `drive.spec.ts`. `playSchaetzfuchs` läuft darüber, die anderen drei Bots (keine `step`/`role`) bleiben. Die Seed-Verdrahtung ist die reine Funktion `hostSeeds(seed, random)` in `engine/prng.ts` (unit-getestet, `seed=4294967295` wirft nicht). Die Bausteine in `ui/blocks.ts` (`namePicker`, `choicePad`, `textEntry`, `spotlight`, `counter`, `voteBars`) haben in S2 bewusst keinen Laufzeittest: Sie sind nur durch `tsc` und `tokens.test` (Styles nur Tokens) abgedeckt; die erste DOM-/Audit-Prüfung (Test-IDs, Knopfhöhe, 390×844 ohne Scrollen) ist Definition of Done von S3 mit dem ersten Verbraucher.
Warum: Laufzeitbudget der E2E (Ziel ≤ 9 min); die Rundenzahl-Flag macht Ein-Runden-Läufe möglich, Duo ist der engste Fall (2 Spieler, Gleichstand-Ränder). Ohne Verbraucher wäre ein Baustein-Test Sicht auf Fixtures statt auf echtes Verhalten und würde S3 doppelt bauen. Der Reviewer soll das fehlende Baustein-Laufzeitnetz nicht als vergessenen Test lesen.

## 2026-10-17 — Paket 2, Schritt 2: Messung E2E
Was: `npm test` nach Schritt 2: 710 Unit-Tests und 41 E2E-Tests in 4,6 min (vorher 33 Tests, 4,5 min). Neu sind `duo.spec.ts` (4 Tests, 19 s zusammen, `--repeat-each=3` in 61 s grün) und `drive.spec.ts` (4 Fixture-Tests, unter 2 s). Ziel bleibt ≤ 9 min.
Warum: Laufzeit-Budget des Master-Plans (§4.3) mitführen.
