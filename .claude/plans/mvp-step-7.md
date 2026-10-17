# mvp — Schritt 7: Spiel-Views (Abgleich)

Master-Plan §4.3, §5, §7.2/§7.3, §10 Schritt 7. Basis `hew/mvp` @ f576948 (Schritt 6). Jeder Shell-Aufruf mit PATH-Export.

## 1. Abgleich (gemessen 2026-10-17)
| Annahme | Befund | Korrektur |
|---|---|---|
| `render(root, v, send, ctx)` reicht | `mountGame` übergibt nur `frame.body` und `v.g`. `data-state="play"` steht fest am Root (DECISIONS „Spiel-Views mounten in frame.body“). Hammer-Balken, Blitz-Fortschritt und SF-Auflösung brauchen Farben und Namen, die nur in `v.players` stehen | `game.ts` reicht einen erweiterten Spiel-Kontext weiter: Root-`data-state` setzen und aktuelle Spielerliste (bei `update` nachgeführt). reversibel: eigener Typ, der `ViewCtx` erweitert. `app.ts` und die Komponenten bleiben unverändert |
| Zeitbalken in `game.ts` | Die Sichten tragen `endsAt`, alle außer SF-reveal auch `dur`. SF wechselt ask→reveal in derselben Runde: Der Key `game:r` bleibt gleich, also kommt nur `update` | Balken aus `g.endsAt`/`g.dur`. Bei geändertem `endsAt` neu bauen. Eine Abweichung zum lokalen Ende bis zum Empfangsverzug (≤ 1 Tick) ist akzeptiert |
| Client-Verhalten §5 | Die Logik will: blitz `{i,ms}` bzw. `{i,early:true}`; hammer `{n,final}` (Cap 200, das Maximum gilt); farbfalle `{i,c}` nur bei `i===next`, plus `{done:true}`; SF `{guess}` genau einmal. DECISIONS „Ohne Eingabe kein Ergebnis“: Der Client meldet **immer** (blitz 1000 je verpasstem Versuch, hammer `final` auch bei 0, farbfalle `done`) | So bauen, keine Meldung „einsparen“. Die Logik bleibt unverändert |
| Globaler Tap-Ton (Lehre 6) | `app.ts` spielt bei jedem `click` auf `button:not([data-silent])` `tap` und `buzz(10)`. Spiel-Eingaben kommen per `pointerdown` | `blitz-pad`, `btn-hammer` und `ff-*` tragen `data-silent` und geben ihr Feedback im `pointerdown` selbst. `sf-submit` darf ein normaler Knopf bleiben |
| Bot `playHammer`: 15× klicken | fast: Hammer dauert 800 ms. `.btn:active` verschiebt den Knopf mit einer 90-ms-Transition, der Frame-Enter mit 180 ms translateY. Playwrights Stabilitätsprüfung bremst so jeden `locator.click` | Hammer- und Farbfalle-Bots klicken per `page.mouse` auf die Mitte der Box, so oft wie möglich bis `done`. Prüfung: Label = lokal angezeigter Endstand, mindestens 1 |
| games.spec prüft `result-row` je Runde | fast: Das Ergebnis steht 500 ms. `expect` pollt nach dem Backoff nur alle 500 ms (Lehre 6) | Ergebniszeilen, Spiel-Roots und `data-state`-Folgen per `addInitScript`-MutationObserver protokollieren und nach dem Podium prüfen. Bots warten per `waitForFunction` (raf), nie per `expect` auf Zustände unter 1 s |
| `data-points=5` | Host allein bekommt Platz 1 nur mit Ergebnis-Eintrag, sonst 0 Punkte | Gilt als Beleg, dass die Eingabe ankam. Dazu kommt das Label je Spiel |
| Spiel-Layout | screens.spec auditiert nur Hammer (bisher Fallback). Design §7: „kein Scrollen im Spiel“ | Je Spiel ein Lauf **ohne** fast (nur der erste Spiel-Screen). `audit` aus screens.spec nach `helpers.ts`, zusätzlich: Root ohne vertikales Scrollen |
| px-Wächter (Lehre 6) | `(^|[^\w.-])\d*\.?\d+px\b` übersieht `-6px` | `(^|[^\w.-])-?\d*\.?\d+px\b` plus Negativfall im Selbsttest. `--ff-*` in den Kontrasttest aufnehmen (schwarze Labels auf Farbflächen) |

## 2. Entscheidungen & Fallen
- **Lokale Zeit (§4.3):** Spieltimer nur mit `setTimeout` und `performance.now()`, rAF nur fürs Hochzählen. Erst-Mount: Ende = Mount + `dur`. Mount mit Fortschritt in der Sicht (blitz: Wert in `mine`, hammer: `mine>0`, farbfalle: `next>0`, SF: `myGuess≠null`): Ende = `toLocal(endsAt)`, Fortsetzen ab dem Stand der Sicht. Ohne Fortschritt gilt Erst-Mount. Als reine Funktion bauen, getestet mit Fake-Zeit.
- **Updates:** `update()` überschreibt nie den lokalen Fortschritt (Host-`mine`/`next`/`score` hinken nach). Übernommen wird nur Fremdes (Balken, `progress`, `guessed/total`, SF-Phase, Online-Status), in place, ohne Animationen neu abzuspielen (Lehre Ergebnis/Podium).
- **Blitz:** reversibel: `ms` = `event.timeStamp` des pointerdown minus `performance.now()` beim Umschalten auf go; sofort beim Tap senden. Ein Frühstart verbraucht den Versuch (1000, „ZU FRÜH!“, `bad`, Buzz), danach show und der nächste wait. reversibel: Root-`data-state` spiegelt den Pad-Zustand.
- **Hammer:** Jeder pointerdown zählt (mehrere Finger ok), Anzeige höchstens `HAMMER_CAP`. Gesendet wird alle 200 ms, nur bei Änderung; am lokalen Ende `{n, final:true}`.
- **Farbfalle:** Nach dem Ende Eingaben ignorieren, die Knöpfe aber nicht auf `disabled` setzen. Sonst wartet Playwright bis zum Timeout auf „enabled“.
- **Schätzfuchs:** reversibel: nur Ziffern zählen, Punkte und Leerzeichen fallen weg; leer → nicht senden. Absenden per Form-Submit (Klick oder Enter) statt pointerdown, weil nicht zeitkritisch (Auslegung von §4.3 → DECISIONS). Schrift im Feld ≥ 16 px. Das Hochzählen endet exakt auf der Antwort, `destroy` stoppt rAF.
- **Bewegung (Lehre 6):** Punch nur auf `.frame` (komponiert mit enter), nie auf Elemente mit eigener Animation (`.pop` …). Hammer und Farbfalle: kein Punch pro Tap; Flash ist ein Overlay mit `pointer-events:none` und daher ok. Keine Endlos-Animation an Klickzielen. `touch-action: manipulation` explizit an den Bedienelementen.
- **Imports:** Views dürfen `ui/dom` und `ui/components` importieren, Ton, Haptik und Effekte aber nur über `ctx` (DECISIONS „Sfx/Fx“). `buzz` nur in Geste-Handlern.
- **Bots für Schritt 8** (3 Seiten parallel): Sie enden bei `done`/`reveal` oder wenn der Spiel-Screen weg ist und blockieren nie auf verschwundenen Elementen. Keine festen `waitForTimeout`. `playRound` wartet selbst auf `[data-screen=game]`, `playBlitz` hat eine Option für einen Frühstart.
- **Specs und Commits:** `lobby.spec` und `smoke.spec` bleiben unverändert; in `screens.spec` ändert sich nur der Import von `audit`, die Assertions bleiben. Jede Teständerung nach dem Red-Commit steht im Commit-Body. Fix-Runden: Regressionstest als eigener Commit vor dem Fix. Der Red-Commit-Body enthält die Vitest- und die Playwright-Zusammenfassung.

## 3. Dateien (nur Nicht-Offensichtliches)
- Neu: reine Helfer je Spiel (z. B. `games/<id>/play.ts` plus Test), aufgenommen in `games/purity.test.ts`. Spiel-CSS als eigene Datei mit Import in `main.ts`; neue Maße als Tokens in `tokens.css`.
- Geändert: `games/types.ts` (Spiel-Kontext), `games/views.ts` (alle vier, Fallback bleibt), `e2e/helpers.ts` (`audit`), `ui/tokens.test.ts`.
- Unverändert: `engine/`, `net/`, `*/logic.ts`, `app.ts`.

## 4. DoD
1. **Spielrahmen:** `game.ts` mountet je Runde genau einen Spiel-Root, danach kommt nur `update()`. Der Root trägt `data-game` und stets den aktuellen `data-state` nach §7.3. Header „RUNDE r/n · Titel“ plus Zeitbalken, der bei neuem `endsAt` neu startet. `VIEWS` deckt alle vier Spiele ab (Unit), der Fallback bleibt.
2. **Blitz:** Je Versuch erst wait (dunkel, „WARTE …“, ohne Puls), dann go (Neon-Vollfläche, „JETZT!“, `go`). Ein Tap misst lokal ab go, sendet `{i,ms}` und zeigt die ms groß mit Punch. Tap in wait → early (`{i,early:true}`, „ZU FRÜH!“, `bad`). Kein Tap nach 1000 ms → `{i,ms:1000}`. Nach 3 Versuchen done. `blitz-pad` trägt wait|go|show|early|done. Unit-Test der Zeitlinie (Tap → Payload).
3. **Hammer:** Runder `btn-hammer` in der unteren Hälfte, Zähler in Mega-Größe. Zählt lokal je pointerdown, sendet höchstens alle 200 ms bei Änderung und am lokalen Ende `{n,final:true}`, auch bei 0. Live-Balken aller Spieler in ihren Farben, der eigene aus dem lokalen Zähler. Root play|done. Unit-Test für Takt und final mit Fake-Zeit.
4. **Farbfalle:** Wort in Mega-Größe in Tintenfarbe (`ff-word[data-ink]`), 2×2 Farbflächen `ff-rot|blau|gelb|weiss` mit schwarzem Label. Läuft lokal ohne Warten auf den Host, sendet `{i,c}` je Antwort, Flash ok/bad, am lokalen Ende `{done:true}`. Sicht-Updates setzen den lokalen Stand nie zurück. Root play|done. Unit-Test des Antwortschritts.
5. **Schätzfuchs:** Fragekarte, `sf-input` (`inputmode=numeric`), Einheit, `sf-submit` „TIPP ABGEBEN“ (auch Enter) → „Tipp gespeichert“ plus x/n. Ungültige Eingabe wird nicht gesendet. Die Auflösung kommt in derselben Runde per `update()`: `sf-reveal` mit der Antwort in Mega-Größe (Hochzählen, unter Reduced Motion sofort) und einer Liste aller Tipps mit Abweichung in Spielerfarben. Root ask|sent|reveal. Unit-Test des Parsers.
6. **Wiedereinstieg (§4.3):** Eine reine Funktion liefert je Spiel aus Sicht und lokaler Zeit das Ende und den Fortsetzungspunkt. Unit-Tests mit Fake-Zeit decken Erst-Mount und Mount mit Fortschritt ab.
7. **Feedback:** `blitz-pad`, `btn-hammer` und `ff-*` tragen `data-silent` und reagieren auf `pointerdown` (E2E: Ein `mouse.down()` ohne `up` zählt schon einen Hammer-Tap). Fehler-Buzz `[30,40,30]` nur im Geste-Handler. Reduced Motion: kein Punch, Flash oder Hochzählen.
8. **`e2e/games.spec.ts`** mit `?net=local&dev=1&fast=1&only=<id>`, Host allein, 3 Runden, Bots aus `e2e/bots.ts`. Jede Runde liefert `data-points=5` und ein Label: blitz `/^\d+ ms$/` (≥ 1000 in der Frühstart-Runde, sonst < 3000), hammer `/^\d+ Taps?$/` gleich dem angezeigten Endstand und mindestens 1, farbfalle `/^[+−]?\d+$/` gleich dem angezeigten Endstand bei mindestens einer bewusst falschen Antwort, SF `/^±\d+ %$/`. Am Ende das Podium. Die protokollierten `data-state`-Folgen enthalten alle Vertragszustände. Keine Konsolen- oder Page-Fehler.
9. **Layout ohne fast:** Je Spiel ein Screenshot `test-results/screens/game-<id>.png`, für SF zusätzlich `game-schaetzfuchs-reveal.png`. `audit` ist grün: kein horizontaler Überlauf, kein vertikales Scrollen im Spiel-Root, sichtbare Knöpfe ≥ 56 px.
10. **Wächter:** Die px-Regel erkennt negative Literale (Negativfall im Selbsttest). `--ff-*` hat mit `--on-accent` einen Kontrast ≥ 4.5.
11. **`DECISIONS.md`:** datierte Einträge zu Spiel-Kontext (`data-state`, Spieler), `data-silent` mit eigenem Feedback, SF-Submit per Form, Wiedereinstiegsregel und games.spec-Auslegung (Maus-Klicks, Label gegen Anzeige, Protokoll statt Polling).
12. TDD: tests written first (separate test-commit before impl), meaningfully cover the change, red→green captured

## 5. Out-of-Scope
- Reload-E2E mitten im Spiel, `party.spec` und Offline-Badges in Ergebnis/Podium (Schritt-6-MINOR) → Schritt 8.
- Erneutes Senden von Eingaben, die während `reconnecting` verloren gingen → Schritt 8.
- Keine Änderungen an Spiellogik, Engine und Netz, am Intro-Ton und an der Optik des Namensfehlers.
