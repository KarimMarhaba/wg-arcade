# mvp — Schritt 6: Design-System & Screens (Abgleich)

Master-Plan §4.7, §6, §7.3/§7.4, §10 Schritt 6. Basis `hew/mvp` @ fecc505 (Schritt 5). Jeder Shell-Aufruf mit PATH-Export.

## 1. Abgleich (gemessen 2026-10-17)
| Annahme | Befund | Korrektur |
|---|---|---|
| Vorgehen 1: Font-Paket prüfen | In Schritt 1 erledigt (D-0): `wdth.css` importiert, Achsen wght 200–800 und wdth 75–100, Space Grotesk 300–700. `dist/assets` enthält nur gebündelte `.woff2` | Kein Arbeitspunkt mehr. Kondensieren per `font-stretch: 75%` oder `'wdth' 75` |
| Tokens §6.1/§6.2 | `tokens.css` hat nur Grundfarben, lime, bad, ff-*, s1–s8, Fonts, tap-min, maxw | Rest ergänzen. §6.5 nennt Werte ohne Token (60 ms Staffel, 600 ms Float, 120 ms Punch, 220 ms Flash, Punch-Versatz ±6/±3 px, Enter 16 px = `--s4`). Diese als Zusatz-Tokens anlegen |
| „Keine Rohwerte außerhalb tokens.css“ per grep | `base.css` hat 3px, 6px, 20px, 48px, 96px, 280px (Review-MINOR Schritt 5); TS ist sauber | Vitest-Wächter statt Hand-grep. Vorlage: `games/purity.test.ts` prüft colors.ts schon auf Hex |
| `palette.ts` hält Hex + Form | D-6: Hex nur als Tokens. Hex in palette.ts und `--p0..7` wären zwei Quellen (Lehre „Regel an drei Stellen“) | reversibel: Hex nur in tokens.css. palette.ts hat Name, Form und SVG-Pfad. Konfetti liest `getComputedStyle(--pN)`, die palette.ts-Ausnahme fällt weg. Spielerfarbe per `data-color` → CSS-Var |
| `ViewCtx{…, sfx, fx}` (§3.4) | Heute `{me,toLocal,reducedMotion}` (DECISIONS: sfx/fx kommen in Schritt 6). Kein Test baut ein ViewCtx | Ergänzen. `Sfx`/`Fx` als Interfaces in `games/types.ts` (kein Import games→ui). Implementierung in `ui/`, Verdrahtung in `app.ts envFor`. `fx` bekommt auch `flash(kind)` für Schritt 7 |
| Mute lebt in `sfx.ts` | `start.ts` hat eigenes `isMuted/setMuted` (`wgarcade.mute`; `aria-pressed=true` = stumm) | Nach `sfx.ts` umziehen. `btn-mute` und `aria-pressed` behalten ihre Bedeutung |
| `sfx.unlock()` im Start-/Join-Klick | Auto-Rejoin (Reload auf `#/j/CODE`) hat keinen Klick vor dem ersten Ton | reversibel: zusätzlich ein einmaliger `pointerdown`/`keydown`-Listener (capture) auf `document` |
| Wake Lock/Ton/Vibration headless „fehlertolerant“ | Gemessen in Chromium headless auf 127.0.0.1: `wakeLock.request` **wird mit NotAllowedError abgelehnt**, `vibrate` gibt true, `AudioContext` läuft ohne Geste, keine Konsolenmeldung | Ablehnung fangen (sonst pageerror). Unlock und Autoplay prüft headless nicht, das übernehmen Unit-Tests mit Fakes. Unter `http://192.168…` fehlt `navigator.wakeLock` (kein Secure Context), also vorher prüfen, ob die API existiert |
| `screens.spec` mit fast durch alle Screens | Mit fast: Intro 300 ms, Hammer 800 ms, Ergebnis 500 ms. `expect` pollt nach dem Backoff nur alle 500 ms (Schritt 5) → Screenshot und Messung verpassen den Screen | Aufteilen: **(A)** Rundgang **ohne fast** (`dev=1&only=hammer`; die erste Runde reicht: Intro 3 s, Spiel 8 s, Ergebnis 5 s), danach Host-Seite schließen → Lost. **(B)** Podium mit fast. **(C)** Reduced Motion mit fast, Host allein |
| `timerBar(hostEndsAt, dur)` für das Ergebnis | Die Ergebnis-Sicht hat `until`, aber kein `dur` | reversibel: Ohne `dur` startet der Balken beim Mount voll und läuft bis `toLocal(until)`. Keine Änderung an Engine oder View |
| „RUNDE r/n · <SPIEL>“ | `result.ts` und `game.ts` zeigen `game.toUpperCase()` → „SCHAETZFUCHS“ | Titel aus `GAMES[id].title` |
| Overflow-Check `scrollWidth ≤ innerWidth` | `main[data-screen]` hat `overflow-y: auto`. Ein Überlauf darin erreicht das Dokument nie | Zusätzlich `[data-screen]`: `scrollWidth ≤ clientWidth` |
| Lost durch Schließen der Host-Seite | Local-Host schließt bei `pagehide` (fin → sofort reconnecting), sonst greift der Watchdog nach 6 s. Danach 10 s bis lost | Timeout ≥ 25 s |

## 2. Entscheidungen & Fallen
- **Test-IDs:**
  - `player` nur auf den Einträgen der Lobby-Liste, nicht auf dem eigenen Farbblock.
  - `podium-row` nur in der kompletten Rangliste, nicht auf den Podest-Blöcken. `result-row` genau einmal je Spieler (sonst bricht `lobby.spec` mit der Zählung).
  - `room-code`-textContent bleibt exakt der Code: codeBoxes ohne Leerraum-Textknoten. Logo-`h1`-textContent bleibt „WG·ARCADE“: zweizeilig per Spans/`br`, ohne Leerzeichen.
  - `rounds-*` behalten `aria-pressed`, `input-name` behält `maxlength=12`.
- `playerBadge` setzt immer `data-pid` und `data-online`. Schritt 8 braucht „offline“ beim Host auch außerhalb der Lobby.
- **Klicksicherheit:**
  - Overlays (Konfetti-Canvas, Flash) bekommen `pointer-events: none`, und der Banner verdeckt keine Knöpfe. Sonst fängt Playwright den Klick auf `btn-again` (Schritt 8) oder die Farbfalle-Knöpfe (Schritt 7) ab.
  - Keine Endlos-Animation auf Knöpfen, denn Playwright wartet, bis ein Element „stabil“ steht. Die Warte-Punkte animieren nur Text.
- **Animationen nur beim Mount:**
  - `lobby.update` vergleicht per pid: Pop und `sfx join` nur für neue Spieler, nicht beim ersten Render.
  - Staffel und Float im Ergebnis laufen bei `update` nicht erneut.
- **Podium:** Blöcke für die ersten min(3, n) Zeilen. Die Ziffer ist `row.place`, bei Gleichstand also zweimal „1“. Mit einem Spieler (dev) gibt es einen Block.
- **Reduced Motion:** Alles läuft mit 0.01ms, ohne Punch, Konfetti und Pop. Ausnahme (reversibel): Der Zeitbalken ist Information, keine Bewegung, und läuft linear weiter.
- **Haptik** folgt dem Mute (§4.7). `buzz` nur in Geste-Handlern.
- **Lehren Schritt 5:**
  - Host-Lost ohne `btn-rejoin`: Dort wirkte er wie ZUM START.
  - Rejected bekommt nur `btn-home`. §6.6 gilt, §7.3 wird per DECISIONS geklärt.
  - `app.ts validName` importiert die Namensgrenze, statt `<= 12` hart zu codieren.
  - `clear()`/`qs()` in `dom.ts` nutzen oder löschen.
  - Das Podium bekommt `aria-live=polite`.
  - Den Check „Client ohne `btn-next`“ jetzt **im** Ergebnis-Screen machen; in lobby.spec war er wirkungslos.
- **Test-Regeln:**
  - Abwesenheit nur mit Positivkontrolle prüfen. „Nie ein Canvas“ (C) per MutationObserver-Flag ab Seitenstart (`addInitScript`); (B) zeigt, dass ein Canvas erscheint und wieder verschwindet.
  - Vor jedem Screenshot `document.fonts.ready` abwarten.
  - Am echten Artefakt prüfen, nichts normalisieren (Lehre Schritt 4).
  - Ein Name mit 12 breiten Zeichen (z. B. „WWWWWWWWWWWW“) im Rundgang testet den Überlauf.
- **Red-Commit:** Im Body stehen die Vitest- und die Playwright-Zusammenfassung (Lehre Schritt 5). screens.spec muss vor der Implementierung wirklich rot sein, z. B. durch Mute 56×56 quadratisch, `aria-live` am Podium und das Konfetti-Canvas.
- `game.ts` bekommt nur Frame und Header, keinen Spiel-Inhalt.

## 3. Dateien (nur Nicht-Offensichtliches)
- Neu: `src/ui/tokens.test.ts` (Wächter und Kontrast, liest Dateien per `node:fs`), Tests für sfx, haptics und wakelock mit injizierten Fakes (Node hat `EventTarget`).
- Geändert: `games/types.ts` (`Sfx`/`Fx`), `app.ts` (envFor, Unlock, Namensgrenze), `e2e/helpers.ts` (`url` ohne fast bzw. mit `only`), `main.ts` (Import von components.css und motion.css).
- Unverändert: engine, net, Spiellogik, Assertions in `lobby.spec`/`smoke.spec`.

## 4. DoD
1. `tokens.css` enthält alle Tokens aus §6.1/§6.2 plus die Zusatz-Tokens für Staffel, Float, Punch und Flash. Ein Vitest-Wächter schlägt fehl bei Hex- oder px-Literalen in `src/**/*.{ts,css}` außerhalb `tokens.css` (Tests ausgenommen) und bei `var(--x)` ohne Definition.
2. Spielerfarben `--p0..--p7` stehen nur in `tokens.css`. `palette.ts` liefert 8 verschiedene Formen und Namen, ohne Hex. Ein Unit-Test liest `tokens.css` und prüft: Schwarz bzw. `--on-accent` hat auf allen Spieler- und Akzentfarben einen Kontrast ≥ 4.5.
3. Feel-Module (Unit mit Fakes), kein Modul wirft:
   - `sfx`: ohne `AudioContext` ein No-op, Context erst bei `unlock`, Mute in `wgarcade.mute`, stumm → kein Ton.
   - `buzz`: nur mit `navigator.vibrate` und nur, wenn nicht stumm.
   - Wake Lock: schluckt fehlende API und Ablehnung, holt ihn bei `visible` neu, `release` gibt frei und meldet den Listener ab.
4. Verdrahtung:
   - `ViewCtx` hat `sfx` und `fx`.
   - Der Wake Lock ist während der Party aktiv (Host und Client) und wird beim Verlassen freigegeben.
   - Unlock bei der ersten Geste.
   - Der Mute-Toggle auf Start (Lautsprecher-SVG, 56×56, `btn-mute`) behält seinen Zustand über einen Reload.
5. Komponenten §6.4 stehen in `components.ts`/`components.css`, und alle Meta-Screens bauen darauf auf. Test-ID-Vertrag §7.3 unverändert; `lobby.spec` und `smoke.spec` laufen ohne Änderung an ihren Assertions.
6. Die Screens setzen §6.6 je Screen um, dazu:
   - Lobby-Host-Hinweis „Host-Handy anlassen“, Spieltitel aus der Registry, Host-Lost ohne `btn-rejoin`.
   - `aria-live`: assertive am Countdown, polite an Ergebnis- und Podiumsliste.
7. Bewegung §6.5: Enter, Staffel, Float, Punch, Flash und Podest-Aufstieg, Lobby-Pop plus `join` nur für neue Spieler. Bei Sicht-Updates laufen keine Animationen erneut. Reduced Motion schaltet alles außer dem Zeitbalken ab.
8. Konfetti:
   - Canvas auf dem Podium mit Spielerfarben und `pointer-events: none`. Es entfernt sich nach ~2,5 s selbst, `destroy` stoppt rAF.
   - E2E (B): Das Canvas erscheint und ist nach ≤ 5 s weg.
   - E2E (C), Kontext mit `reducedMotion: 'reduce'`: Auf dem Podium entsteht nie ein Canvas.
9. `screens.spec` (A ohne fast plus B mit fast, Host und ein Client mit 12-Zeichen-Namen):
   - Screenshots `test-results/screens/<name>.png` mindestens für start, start-join, name, lobby-host, lobby-client, intro, game, result, podium, rejected und lost.
   - Je Screen: `data-screen` stimmt, kein horizontaler Überlauf (Dokument und Screen-Root), alle sichtbaren `button` sind ≥ 56 px hoch.
   - Im Ergebnis hat nur der Host `btn-next`.
   - Keine Konsolen- oder Page-Fehler.
10. `DECISIONS.md` hat datierte Einträge zu: Hex nur in tokens.css plus Zusatz-Tokens, Zeitbalken ohne `dur` und Reduced-Motion-Ausnahme, Unlock bei der ersten Geste, `Sfx`/`Fx` in `games/types.ts`, Rejected nur `btn-home` (Klärung §7.3), Host-Lost ohne `btn-rejoin`, screens.spec-Rundgang ohne fast.
11. TDD: tests written first (separate test-commit before impl), meaningfully cover the change, red→green captured

## 5. Out-of-Scope
- Spiel-Views, `bigNumber` und Zeitbalken im Spiel (Schritt 7).
- `party.spec`/`reconnect.spec`, der Fehler-Cache von `getTransport()` und ein hello-Timeout (Schritt 8).
- Favicon-Neugestaltung ist optional. Keine Änderungen an engine, net und Spiellogik.
