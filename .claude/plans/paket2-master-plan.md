# WG·ARCADE — Master-Plan Spielepaket 2 + Trinkmodus

Stand 2026-10-17 · Branch `hew/paket2` · Bau-Wahrheit: `docs/design/paket2.md` („P2“), ergänzt `docs/design/design.md` („Design“).
Der Plan legt P2 auf den echten Code nach dem MVP-Merge (`ecf76ca`) um. Wo er P2 auslegt oder erweitert, steht das in §9. Der jeweilige Schritt trägt es in `DECISIONS.md` ein (append-only, datiert, „Was + Warum“).

Jeder Shell-Aufruf beginnt mit `export PATH="$HOME/.local/share/herdr-web-ui/node/bin:$PATH"`. Gates nach **jedem** Schritt: `npm test` (unit + e2e) und `npm run lint`.
Gemessene Basis: `npm run test:e2e` hat 32 Tests und braucht **4,2 min** (inkl. Build). Am längsten laufen party.spec (28,5 s), screens-Rundgang (26 s), reconnect-offline (26 s), reconnect-reload (17,7 s) und Leerlauf-Party (14,9 s).

---

## 0. Leitplanken (unverändert aus dem MVP, plus Paket 2)

- Host autoritativ und rein: `init/input/tick/done/result/label/view/drinks` bekommen `now` und Seed hereingereicht, nie `Date`, `Math.random`, `performance`, DOM. `purity.test.ts` erzwingt das.
- **Geheimnisse filtert nur `view(s, pid)`.** Der Host schickt jedem Spieler nur seine eigene Sicht (`host.ts` → `viewFor(party, pid)`), auch dem Host-Spieler. Also gibt es genau einen Filterpunkt.
- Zeitkritisches misst der Client lokal (Blitz-Muster). Gilt neu für `stopp`, für die Reaktionskarten von `koenigskarte` und für den Gleichklang-Tiebreak (§9, D-P2-7).
- **Jedes Spiel endet ohne jede Eingabe** über Deadlines, auch mit 1 Spieler (dev). `lobby.spec` (Leerlauf) und `screens.spec` (Podium mit 1 Spieler, Zufallsspiele) verlassen sich darauf.
- **Jedes Spiel läuft mit 1 Spieler (dev), mit 2 (Duo-Variante) und mit 3–8 Spielern**, ohne zu werfen. Bei 1 Spieler gilt eine triviale Fassung, siehe „n=1“ je Spiel.
- Dauern stehen als Konstanten in `src/engine/durations.ts` und laufen durch `scale(ms, ctx.speed)`. Mit `fast=1` wird alles durch 10 geteilt.
- UI: Vanilla-DOM über `h()`, Maße und Farben nur aus `tokens.css`. `tokens.test.ts` verbietet px- und Hex-Literale außerhalb von `tokens.css` und prüft, dass jede `var(--x)` definiert ist. Knöpfe ≥ 56 px, kein Scrollen im Spiel-Root (`audit`), `aria-live` für Ansage und Ergebnis, `prefers-reduced-motion`.
- Keine neuen Abhängigkeiten (kein jsdom). Vitest läuft in der Node-Umgebung, DOM-Bausteine werden nur per E2E getestet. Alles Rechnerische kommt in reine Module (`play.ts`, `common.ts`, `strokes.ts`, `match.ts`).

## 1. Abgleich P2 ↔ echter Code

### 1.1 Was passt ohne Umbau
- `GameDef` (Host rein, `tick(s, now, online)`, `allDone`) trägt Mehrphasen-Spiele: Phase und Deadline liegen im Zustand, `tick` schaltet weiter. Das Muster gibt es schon in Schätzfuchs (ask → reveal).
- Der Zeitbalken in `ui/screens/game.ts` (`syncBar`) baut sich neu, sobald sich `g.endsAt` ändert. **Konvention:** Jede Phasen-Sicht liefert `endsAt` und `dur` der laufenden Phase, dann läuft der Balken je Phase richtig.
- `ctx.players()` liefert Namen und Farben für `namePicker` und Abzeichen.
- `rank()` (5/3/2/1/0, Gleichstand teilt den besseren Platz, Offline und „kein result-Eintrag“ = letzter Platz und 0) bleibt.
- `planOrder(seed, n, ids)` verhindert Wiederholung direkt hintereinander und funktioniert mit jedem Pool.
- `only=<id>`, `fast=1`, `dev=1`, `net=local`: E2E-Infrastruktur, `watch.ts`-Aufzeichnung und Bots per `waitForFunction`.

### 1.2 Was Engine und Typen ändern müssen
| Stelle | Heute | Neu |
|---|---|---|
| `games/types.ts` `GameCtx` | `{ speed }` | `{ speed; drinking: boolean }` |
| `GameDef` | – | `drinkOnly?: true`; `drinks?(s: S): Record<pid, Drink>` mit `Drink = { take: number; give: number }` |
| `GameDef.accent` | 4 Werte, Registry-Test verlangt „4 verschiedene“ | bleibt bei 4 Werten (Tokens mit Kontrast-Test), Akzente wiederholen sich (Tabelle §5). Test: jeder Akzent ∈ Menge |
| `GAME_IDS` | 4 | wächst **schrittweise** (jeder Spiel-Schritt registriert seine IDs), nie alle 15 auf einmal. `views.test` und `index.test` verlangen für jede ID eine Logik und eine View |
| `engine/types.ts` `Party` | – | `drinking: boolean`; `rounds: number` (dev-Override, §1.3) |
| `HostAction` | rounds/start/next/again/lobby | `+ { a: 'drinking'; on: boolean }` (nur in der Lobby) |
| `RoundRecord` | places/points/labels | `+ drinks: DrinkPlan \| null` |
| `engine/drinks.ts` (neu, rein) | – | `placeDrinks(places, online)`, `capDrinks(raw, online)`, `DRINK_CAP = 3` |
| `party.ts` `finishRound` | – | Bei `p.drinking`: `capDrinks(d.drinks ? d.drinks(state) : placeDrinks(...), online)`. Ergebnisphase `scale(RESULT + DRINK_EXTRA)` |
| Pool | `ids` = alle registrierten | `poolOf(p) = ids.filter(id => p.drinking \|\| !def(id).drinkOnly)`. Ist das leer (nur `only=<drinkOnly-id>`), gilt `ids` |
| `init`-Aufruf | `{ speed }` | `{ speed: p.speed, drinking: p.drinking }` |
| `engine/view.ts` | – | Base `+ drinking: boolean`; result `+ drinks: { rows: {pid,take,give}[]; cheers: boolean } \| null` |
| `durations.ts` | MVP-Dauern | `+ DRINK_EXTRA = 2000` und je Spiel die Phasen-Konstanten |
| `config.ts` | `only` aus GAME_IDS | `+ seed?: number` und `+ rounds?: number` (1–8), beide nur mit `dev` (§9 D-P2-3) |
| `app.ts` | Host-Seed zufällig | `seed: flags.seed ?? randomSeed()`, `rand: mulberry32(flags.seed !== undefined ? flags.seed + 1 : randomSeed())`, `rounds` an `engine.create` |
| `PlayCtx.setState` | `(state)` | `(state, extra?: { step?: number; role?: string })` setzt `data-step` und `data-role` am Screen-Root (Bot-Vertrag, §4) |
| `ui/screens/game.ts` | `data-game` | zusätzlich `data-accent` am Game-Frame. Die Timer-Farbe kommt aus dem Akzent statt aus 4 `data-game`-Regeln in `games.css` (gleiche Farben für die Altspiele) |

### 1.3 Tests, die beim Wachsen von `GAME_IDS` brechen (in Schritt 1 entschärfen)
- `rounds.test.ts:15`: „n ≥ 4 ⇒ alle IDs enthalten“ wird zu „n ≥ ids.length ⇒ alle enthalten, sonst n verschiedene, solange n ≤ ids.length“. Dazu kommt ein Test mit Pool-Größe 14 und 19.
- `index.test.ts`: „alle 4 Spiele in order bei 5 Runden“ wird zu „order ⊆ Pool, keine Wiederholung hintereinander, 5 Intros mit Titel und Akzent“. Der Registry-Akzent-Test wird gelockert. `WIRES` wird zur Tabelle, in die jeder Spiel-Schritt seine Zeile einträgt.
- `views.test.ts` („alle vier“): Text generisch, die Logik passt schon.
- `purity.test.ts`: Die feste Liste `${id}/play.ts` wird ersetzt. Geprüft werden alle `.ts` unter `src/games/**` außer `*.test.ts`, `view.ts`, `views.ts`, `types.ts` (Glob per `readdirSync`), dazu `src/engine/drinks.ts`. Damit sind Banken, `match.ts` und `strokes.ts` automatisch drin, und ein Spiel ohne `play.ts` bricht nichts.
- `conformance.test.ts`: `init(..., { speed })` wird zu `{ speed, drinking: false }`. Mehrphasen-tauglich machen, §6.2.
- `config.test.ts`: Die Default-Gleichheit bekommt `seed: undefined, rounds: undefined`.
- `party.spec.ts:45`: `games == GAME_IDS` wird zu: Spiele ⊆ Normalpool, keine Wiederholung hintereinander. Bei 14 Spielen deckt eine 5-Runden-Party nicht mehr alle ab.
- `party.test.ts` und `host.test.ts` bauen Dummies über alle `GAME_IDS` (ohne `drinkOnly`), dort bleibt der Pool alle IDs. Unverändert grün.

### 1.4 Spiel-Vertrag „Teilnahme“ (gilt für alle neuen Spiele)
Die Konformität verlangt: Wer keine Eingabe gemacht hat, hat keinen `result`-Eintrag und das Label `–`. Für soziale Spiele heißt das: **Ein `result`-Eintrag entsteht erst mit der ersten angenommenen Eingabe.** Wer gar nichts tippt, ist Letzter mit 0 Punkten, auch wenn andere ihn gewählt haben. Das bestraft Abwesenheit, nicht Pech. Das gilt auch für Erzähler, Fahrer und Opfer: Ihre Rollen-Eingaben (Karte wählen, „Fertig“, Stufe tippen) zählen als Teilnahme. Seed-Default-Wahlen zählen nicht. (§9 D-P2-5)

## 2. Trinkmodus (Engine + UI)

### 2.1 Platz-Regel (`engine/drinks.ts`, rein, voll unit-getestet)
Eingabe: `places` aus `rank`, `online`. Teilnehmer sind nur Online-Spieler, `n = |online ∩ pids|`.
- `last` = größter Platz unter den Teilnehmern. Haben alle Platz 1, trinkt niemand (`cheers: true`).
- n = 2: `last` take 1. Gleichstand (beide Platz 1): `cheers`, niemand.
- n = 3–4: alle auf `last` take 2. Alle auf Platz 1 give 1, außer sie sind auch `last`.
- n = 5–8: `last` take 2. `vorletzt` = nächstgrößerer Platz < last, nur wenn > 1: take 1. Platz 1 give 2.
- n ≤ 1: leerer Plan.
- `capDrinks`: entfernt Offline-Spieler, kappt `take` und `give` auf 0..3 (ganzzahlig) und setzt `cheers` nur, wenn alle `take` 0 sind und das Spiel bzw. die Regel es meldet. Eigene `drinks` der Spiele laufen durch dieselbe Kappung.
- `DrinkPlan = { rows: Record<pid, Drink>; cheers: boolean }`. `drinks?(s)` eines Spiels darf `Record<pid, Drink>` liefern; die Engine verpackt es mit `cheers = false`. Ausnahme: Ein Spiel liefert `{__cheers}`? **Nein.** Dafür gibt es den optionalen Rückgabetyp `DrinkPlan | Record<pid, Drink>`, den die Engine unterscheidet (`'rows' in x`).

### 2.2 Lobby-Schalter
- Host: unter „RUNDEN“ ein Knopf `btn-drink` (ghost, `aria-pressed`, Text „🍻 TRINKMODUS“) ruft `control({a:'drinking', on: !v.drinking})`. Clients sehen `drink-status` („🍻 Trinkmodus an“, versteckt, solange aus).
- `again` und `lobby` (Neue Party) behalten `drinking` (§9 D-P2-2).

### 2.3 Einmaliger Hinweis
- Client-seitig in `ui/screens/party.ts` auf Wrap-Ebene, damit er Screen-Wechsel übersteht. Erscheint, sobald eine Sicht `drinking: true` trägt und `sessionStorage['wgarcade.drinkhint.<code>']` fehlt.
- Vollbild-Overlay `drink-hint` mit dem P2-Text, Knopf `btn-drink-ok` („VERSTANDEN“), setzt den Schlüssel. Pro Party (Code) also einmal je Handy. Nachzügler und Reloads verhalten sich richtig.
- `role="dialog"`, `aria-modal`, Fokus auf den Knopf. Es blockiert das Spiel nicht, die Engine wartet nicht (§9 D-P2-1).

### 2.4 Ansage auf dem Ergebnis-Screen
- Streifen `drink-strip` im Ergebnis-Frame unter der Liste, nur wenn `v.drinks !== null`.
- Eigene Zeile `drink-me`: `TRINK k` (rot, `--bad`), `VERTEIL k` (grün, `--ok`), beides als `TRINK 1 · VERTEIL 1`, sonst „Du bist raus aus der Nummer 😎“. Bei `cheers` steht „🍻 Anstoßen – ohne Pflicht“.
- Zeile für alle `drink-line`: „🍻 Ben 2 · Cem 1 · Anna verteilt 2“ (Reihenfolge wie die Ergebniszeilen), `aria-live="polite"`, mit `data-take`/`data-give` je Spieler (Chip `drink-chip` mit `data-pid`) für die E2E.
- Kein Schlucke-Ranking auf dem Podium (Leitplanke): Das Podium bleibt unberührt.

## 3. Gemeinsame Bausteine

### 3.1 `src/games/common.ts` (rein, unit-getestet)
- Vorhanden: `allDone`, `isRecord`, `isInt`.
- `turnOrder(seed, pids): string[]` (seed-gemischt, stabil)
- `ringNext(order, pid)`
- `pickDistinct(rng, xs, k)` (ohne Wiederholung, `k ≤ len`)
- `tally(votes: Record<pid, string>): Map<string, number>`
- `leaders(counts): string[]` (alle Spitzenreiter, leer bei 0 Stimmen)
- `Timed`-Helfer: `type Phased<P> = { phase: P; endsAt: number; dur: number }`, `enter(s, phase, now, dur)`, `due(s, now)`
- `isStr(x, max)` (getrimmt, 1..max)
- `clampInt(x, lo, hi)`
- `participated(s)`-Muster als Konvention, kein Helfer

### 3.2 `src/ui/blocks.ts` + Styles in `src/ui/games.css` (nur Tokens)
Alle Bausteine sind Fabriken `{ el, set(...), destroy() }`, tragen `data-silent` und liefern eigenes Feedback über `ctx.sfx`.
- `namePicker(players, { self: boolean, onPick, disabled? })`: Spielerliste als große Knöpfe (Abzeichen + Name). Test-ID `pick` mit `data-pid`. Das gewählte Element bekommt `aria-pressed`. Grid mit 2 Spalten bei 5 und mehr Spielern, damit 8 Namen bei 390×844 ohne Scrollen passen.
- `choicePad(options: string[], { onPick, cols? })`: 2–6 große Knöpfe, Test-ID `choice` mit `data-i`, sperrt nach der Wahl, „✓ abgegeben“-Zustand.
- `textEntry({ max, placeholder, onSubmit })`: `form` + `input` (`enterkeyhint="send"`, `autocapitalize="sentences"`, `maxlength`), Submit per Form wie Schätzfuchs. Test-IDs `text-input`, `text-submit`, Fehler `text-error` (`role="alert"`).
- `spotlight({ who: PlayerInfo, mine: boolean, onDone })`: großer Name und Abzeichen. Beim Aktiven leuchtet der Frame (`data-spot="me"`) und der Knopf `btn-done` „FERTIG“ ist da. Der Timer kommt aus dem Frame-Balken.
- `counter(text)`: „3/5 abgegeben“ (`aria-live`)
- `reveal`-Liste: `voteBars(rows)` für Balken pro Name bzw. Option, Test-ID `vote-bar`
- `strokeCanvas` erst in Schritt 7, eigene Datei `src/ui/strokeCanvas.ts`

### 3.3 Konstanten- und Geheimnis-Konventionen
- Sichten enthalten **nie** Felder anderer Spieler wie `truth`, `role`, `word`, `mission`, `burst`, `deadline` vor der Auflösung, auch nicht als Index (ein Verräter-Index würde ihn verraten).
- Auflösungs-Sichten haben `phase: 'reveal'` oder Ähnliches, ab dann ist alles offen.
- Optionen für Raten werden beim Phasenwechsel im Host-Zustand fixiert (seed-gemischt), nicht in `view` gemischt (Konformität: `view` ist bei gleichem Zustand gleich).

## 4. Test-Bots und E2E-Vertrag

### 4.1 DOM-Vertrag je Spiel
- Screen-Root `[data-screen=game][data-game=<id>]` mit `data-state` = Phase, `data-step` = Teilschritt (Frage, Ballon, Erzähler, Bild …), `data-role` = eigene Rolle in diesem Teilschritt (`narrator|listener|traitor|crew|explainer|guard|guesser|drawer|viewer|driver|bettor|victim|judge|holder|other`).
- Bausteine nutzen die Test-IDs aus §3.2. Spielspezifische IDs sind in der Tabelle §5 benannt.

### 4.2 `e2e/bots.ts`
- Neuer Helfer `drive(page, act)`: Er liest `{state, step, role}` per `waitForFunction` (raf) und ruft `act` **einmal je (state, step, role)**. Er endet, wenn der Game-Root verschwindet. Fehler, weil der Screen beim Klicken weg ist, schluckt er wie `playToPodium`.
- Klicks per `page.mouse.click` auf einmal gemessene Mitten (DECISIONS: `locator.click` ist zu langsam bei `fast`).
- Je Spiel `playX(page, o)`, eingetragen in `playRound`. Die Bots sind rollengesteuert, also unabhängig davon, ob 2 oder 3+ Spieler mitspielen. Sie wählen deterministisch (erste Option, bzw. `o.bias`), damit die Ergebnisse prüfbar sind.
- `Played` bekommt optional `picks` für spielspezifische Prüfungen.

### 4.3 Laufzeit-Budget E2E (Ziel ≤ 9 min, harte Grenze 10 min)
- Neue Datei `e2e/duo.spec.ts`: **pro Spiel ein Test mit 2 Spielern** (Host + 1 Client), `only=<id>&rounds=1&fast=1&seed=<fest>`, beide Seiten per Bot.
  - Prüft: 2 Ergebniszeilen, Punkte {5,3} oder Gleichstand {5,5}, Label-Regex je Spiel, `data-state`-Menge ⊇ Vertrag, keine Konsolenfehler.
  - Budget ~8–12 s je Spiel, 19 Spiele ≈ 3 min.
- Zusätzlich je ein 3-Spieler-Test nur für Spiele mit eigener ≥3-Logik: `verraeter` (Rollen statt Doppelgänger), `erklaerbaer` (Wächter), `nochnie` (Zahlwähler statt JA/NEIN). Budget +40 s.
- Die 4 Altspiele kommen in `duo.spec` (Schritt 2) als 2-Spieler-Absicherung.
- Komplettparty aller Spiele gibt es **nicht**. Am Ende (Schritt 12) kommen dazu:
  - (a) `party2.spec`: 2 Spieler, 8 Runden, fester Seed, Normalpool
  - (b) `drink.spec`: 3 Spieler, Trinkmodus, 5 Runden, fester Seed, so gewählt, dass ≥ 1 `drinkOnly`-Spiel und ≥ 1 Platz-Regel-Spiel vorkommen. Den Seed wählt der Builder per Unit-Hilfstest (`planOrder` mit Pool) und hält ihn als Konstante fest.
- Bestehende Suiten: `party.spec` (3 Spieler, Zufall) bekommt `seed=<fest>`. Der Lauf ist dann reproduzierbar, und die Bots müssen für alle Spiele dieses Seeds mit 3 Spielern laufen. Leerlauf (`lobby.spec`) bleibt zufällig und belegt die Idle-Terminierung.
- `games.spec` (1 Spieler, 3 Runden) bleibt nur für die 4 Altspiele. Neue Spiele bekommen dort keinen Eintrag, ihr Layout-Audit läuft in `duo.spec` mit `fast=false` nur für den ersten Screen, sofern billig. Sonst gibt es je Schritt einen Layout-Test für die eine „dichteste“ Phase mit 8 Namen? Nein, mit 2 Seiten. Ein 8-Spieler-Audit bleibt aufgeschoben (ROADMAP).
- Jeder Schritt misst `npm run test:e2e` und schreibt die Dauer ins Review. Über 9 min wird zuerst `rounds=1` geprüft und dann Layout-Tests zusammengelegt.

## 5. Spiele: Zuordnung, Akzent, Kernentscheidungen

| id | Akzent | Schritt | Bank-Datei | spez. Test-IDs | Label |
|---|---|---|---|---|---|
| gleichklang | cyan | 3 | `prompts.ts` | `choice`, `gk-groups`, `gk-team` | `n Treffer` |
| werwuerde | hot | 3 | `questions.ts` | `pick`, `vote-bar` | `n Pkt` |
| bombe | orange | 4 | – | `btn-pump`, `btn-cash`, `bombe-live` | `n Pkt` |
| stopp | lime | 4 | – | `btn-stop`, `stopp-scale` | `± x,xx s` |
| luegenbaron | hot | 5 | `topics.ts` | `btn-truth`, `btn-lie`, `btn-swap`, `btn-done`, `choice` | `n Pkt` |
| verraeter | cyan | 5 | `words.ts` | `vr-word`, `btn-done`, `pick`, `choice`, `btn-same`/`btn-diff` | `n Pkt` |
| pokerface | lime | 6 | `missions.ts` | `pf-mission`, `btn-done-mission`, `choice` | `n Pkt` |
| erklaerbaer | orange | 6 | `terms.ts` | `eb-term`, `btn-hit`, `btn-skip`, `btn-taboo`, `pick` | `n Pkt` |
| blindmaler | cyan | 7 | `words.ts` | `bm-canvas`, `choice` | `n Pkt` |
| fakefakt | lime | 8 | `cards.ts` | `text-input`, `text-submit`, `text-error`, `choice` | `n Pkt` |
| nochnie | hot | 9 | `cards.ts` | `btn-have`, `btn-never`, `nn-count`, `btn-yes`/`btn-no` | `n Pkt` |
| wahrpflicht | hot | 9 | `cards.ts` | `btn-wahrheit`, `btn-pflicht`, `btn-pass`, `btn-done`, `choice` (👍/👎) | `n Pkt` |
| busfahrer | cyan | 10 | – (Deck im Code) | `choice`, `btn-makes`/`btn-fails` | `n Pkt` |
| kartoffel | orange | 10 | `categories.ts` | `btn-pass`, `pick`, `btn-veto` | `n Knall` |
| koenigskarte | orange | 11 | `rules.ts` | `kk-card`, `btn-flip`, `btn-next`, `kk-react`, `pick`, `choice` | `n 🍺` |

Kernentscheidungen je Spiel (Auslegungen in §9):
- **gleichklang:** 6 Fragen (`pickDistinct`), Frage 7 s, Auflösung 3 s, Konformität: `allDone` beendet die Fragephase. Score = round(100 · Σ Treffer-Anteil). Duo-Tiebreak über die **lokal gemessene** Antwortzeit (`ms` ab Anzeige, gekappt 0..7000), +1 je Treffer für den Schnelleren (D-P2-7). n=1: Score = Zahl der Antworten.
- **werwuerde:** 4 Fragen à 10 s + 4 s. Konformitäts- und Titel-Punkte. Duo: Einigkeit → beide +1, Gewählter +1. Uneinigkeit → 0 für beide und `cheers` beim Trinken (D-P2-6). Eigenes `drinks`: Meistgewählter je Frage +1 take (vor der Kappung summiert). Bank `{q, duo?, wg?}`.
- **bombe:** 3 Ballons, `burst[pid][b] = int(4..30)` nur im Zustand. Eingabe `{b, n, cash}` kumulativ, `n ≤ 40`. Pop, wenn `n ≥ burst`. Live-Leiste `status: pumpt|kassiert|geplatzt` je Spieler, ohne Zahlen. Ende ≤ 45 s oder `allDone`. Score Σ n² der kassierten Ballons.
- **stopp:** 3 Versuche, Ziele 7–15 s auf 0,5 s, Blendung nach 3 s (alles `scale`). Client misst ab dem lokalen Start (`toLocal(startAt)`), sendet `{k, devMs}` (±10 000 gekappt). Ohne Tipp 5000. Auflösung 3 s je Versuch. Score = −Σ|dev|.
- **luegenbaron:** 2 Erzähler (`turnOrder`, Duo: beide einmal). Phasen `card(8) → tell(30, Fertig) → vote(8) → reveal(4)`. `truth[k]` nur in der Sicht des Erzählers. Ohne Wahl entscheidet der Seed. Eine „Andere Karte“.
- **verraeter:** n ≥ 3 `word(6) → round(5 s × n × passes) → talk(15) → vote(12) → guess(10, nur wenn enttarnt) → reveal(4)`. Verräter-pid nur im Zustand. Sicht: Verräter `{cat}`, alle anderen `{word}`. Duo „Doppelgänger“: Paar, 50 % gleich, `4 × 6 s` abwechselnd, dann `same: boolean`. n=1: nur Wort und Auflösung.
- **pokerface:** Mission 6 s, Gespräch 55 s mit `btn-done-mission`, Raten 18 s (Ziel = `ringNext`, 4 Optionen fixiert), Auflösung 6 s. Missionen pro Runde ohne Wiederholung.
- **erklaerbaer:** 2 Erklärer à 35 s, Deck seed-gemischt. Ein Treffer = eine Eingabe `{hit: pid}` (Picker lokal nach GESCHAFFT, Duo automatisch). `skip` kostet 3 s, `taboo` nur vom Wächter (ab 3 Spielern, sonst vom Erklärer selbst). Etwa 30 % Mime-Karten im Deck.
- **blindmaler:** Zeichnen 20 s (Duo 2 × 10 s), Striche als `string[]` (je Strich ein Hex-String aus Bytepaaren 0–255), ≤ 600 Punkte, ≤ 2400 Zeichen (D-P2-8). Zwischenstand alle 5 s. Galerie je Bild 6 s + 2 s, Optionen beim Phasenwechsel fixiert. Der Zeichner sieht „Dein Kunstwerk“ ohne Knöpfe.
- **fakefakt:** eine Karte (50/50 Fakt oder Wort), Schreiben 30 s (`textEntry` max 30), Wählen 20 s, Auflösung 10 s. `match.ts`: `norm` (klein, ä→ae, ö→oe, ü→ue, ß→ss, Satzzeichen und Leerzeichen weg) und `levenshtein`. Ablehnung bei ≤ 2 zur echten Antwort oder bei Dublette → `view.reject`. Bank-Fakes auffüllen bis ≥ 4 Optionen. Wer nichts schreibt, bekommt keinen Fake-Punkt.
- **nochnie:** 4 Karten à 10 s + 5 s, Eingabe `{have, guess}` (beides auf einem Schirm, separat sendbar), Score Σ(n − |g − echt|). Duo: `{have, other: bool}`. `drinks`: have → take 1, exakt → give 1.
- **wahrpflicht:** 3 Opfer (Duo 4 im Wechsel), Wahl 5 s, Ausführen ≤ 15 s (Fertig), Urteil 5 s (👍/👎 über `choicePad`). Passen einmal je Runde (take 1). Score siehe P2.
- **busfahrer:** 2 Fahrer, 32er-Deck im Zustand, 4 Stufen à 6 s + 2 s. Gleichstand bei höher/tiefer oder innen/außen = falsch (D-P2-9). Wetten je Stufe, Trinken je Fahrt.
- **kartoffel:** 2 Kartoffeln, Deadline 15–40 s nur im Zustand, `urgent` in den letzten 5 s. Weitergeben `{to}` nur vom Halter. Veto `{veto: true}` per Mehrheit der Nicht-Halter, dann zurück zum Vorgänger und +1 Veto. Duo: −10 % Restzeit je Wurf. n=1: Kartoffel bleibt, Knall nach Deadline.
- **koenigskarte:** jeder zieht einmal (Duo dreimal), Deck aus 13 Werten. Reaktionskarten nach Blitz-Muster (Wartezeit seed 1–3 s, lokale ms, Frühstart = langsamster). Raumkarten: Zieher tippt Verlierer (`pick`). Karte 9: alle mit „Hab ich“ take 1. Karte 10: Mini-Abstimmung, Meistgewählter take 1. Buddy (5): verknüpft take für den Rest der Runde. König: `cheers` (D-P2-10). Score = −raw·10 000 − min(9999, Σ Reaktions-ms). Label zeigt die rohen Schlücke.

## 6. Querschnitt Tests

### 6.1 Inhaltsbanken
- **Format:** `src/games/<id>/<bank>.ts` mit `export interface X {...}; export const X_BANK: readonly X[] = [...]` wie `questions.ts`. Reine Daten, unter dem Purity-Glob.
- **Zusatzfelder** (D-P2-4): `wg?: true` als Marker für die WG-Quoten; bei `fakefakt` zusätzlich `src: string` (kurzer Belegvermerk, z. B. „Duden: Quisquilien“, „Wikipedia: Schnabeltier“), wird nicht angezeigt.
- **Gemeinsame Formprüfung** `src/games/bankcheck.ts` (nur von Tests importiert, rein):
  - `expectBank(items, { min, text: (x) => string[], max: number, quotas?: {name, pred, min}[] })`
  - prüft Mindestzahl, Pflichtfelder nicht leer, keine Duplikate (normalisiert über `match.norm`), jede Zeichenkette ≤ max (Richtwerte: Frage/Satz ≤ 90, Option/Wort/Tabu ≤ 18, Mission ≤ 80), Quoten
  - Verbots-Lint: Regex-Liste der verbotenen Themen (u. a. `\bEx\b`, Mutter/Vater/Eltern, Gewicht, dick, Krankheit, Drogen, Alkoholsucht, Religion, Sex, Waffe, Polizei-Aufforderung, Posten/Foto/Instagram/TikTok, Geld/Euro bei Pflichten, anfassen/küssen bei Pflichten) als Sicherheitsnetz; der Reviewer liest zusätzlich jede Bank.
- **Spezifisch:**
  - Köder ≠ Lösung und Köder untereinander verschieden (verraeter, fakefakt, blindmaler).
  - Tabuwörter ≠ Begriff und nicht als Teilwort im Begriff (erklaerbaer).
  - `opts.length ∈ 2..4` (gleichklang).
  - fakefakt: `levenshtein(norm(fake), norm(a)) > 2`, `a` ≤ 30 Zeichen.
  - koenigskarte: genau 13 Werte × 2 Varianten.
- **Qualitätsregeln** (in der Datei als Kopf-Kommentar verboten, gilt als Review-Kriterium):
  - Ton: frech-liebevoll.
  - Nichts über Abwesende, Aussehen, Körper, Gesundheit, Herkunft, Religion, Sexualität als Pointe.
  - Pflichten nur im Raum, ohne Anfassen, ohne Posten oder Geld.
  - **fakefakt:** nur Lehrbuch-Fakten mit stabiler Antwort (Biologie, Geografie, Physik, Etymologie). Keine Rekorde, Superlative mit „derzeit“, Statistiken, Preise oder Personen der Gegenwart. Wörter nur aus dem Duden mit eindeutiger Bedeutung. Im Zweifel streichen statt raten. Lieber 45 sichere als 70 wackelige Karten.
  - Der Review-Schritt prüft jede Fakt-Karte gegen das eigene Wissen und markiert Zweifelsfälle; die werden gestrichen.

### 6.2 Konformität (`conformance.test.ts`, Schritt 1 umgebaut)
- `Case = { def, first(s, pid): unknown | null; finish(s, pid): unknown[]; prep?(s, now): {s, now} }`. `first`/`finish` dürfen den Zustand lesen (Rolle, Phase), `prep` spult Phasen per `tick` vor.
- Bestehende Prüfungen bleiben: Müll → null, Referenzgleichheit, Unveränderlichkeit, `view` unabhängig von `now`, unbekannte pid, Teilnahme → result, < 6000 Zeichen bei 8 Spielern (vor und nach der Auflösung).
- Neu:
  - (a) **Idle-Ende:** Ohne Eingaben ist `done` spätestens bei `NOW + maxMs(speed)` mit `maxMs = 120 000/speed + GRACE`, für n = 1, 2, 3, 8, nur per Tick-Schleife (100 ms).
  - (b) `init` wirft nicht für n = 1..8.
  - (c) `drinks` (falls vorhanden) liefert nur bekannte pids, ganzzahlig ≥ 0.
  - (d) **Geheimnis-Test** (eigene Datei `secrets.test.ts`): Tabelle `{def, setup(n) → S (vor der Auflösung, nach typischen Eingaben), secrets(s, owner) → string[]}`. Für alle owner und alle x ≠ owner gilt: `JSON.stringify(view(s, x))` enthält keinen dieser Strings. Die Strings sind unverwechselbar gewählt (Geheimwort in Großbuchstaben, Missionstext, JSON-Fragmente wie `"truth":`, `"burst`, `"deadline`, `"traitor`). Schritt 1 legt die Datei mit einem Fixture-Spiel im Test an (Positivkontrolle: ein absichtlich lecken­des Fixture fällt durch).

### 6.3 Engine-Tests (Schritt 1)
- `drinks.test.ts`: alle Tabellenzeilen n = 2, 3, 4, 5, 8; Gleichstände auf dem letzten Platz, auf Platz 1 und alle gleich; Offline ohne Schluck; Kappung bei 3; `cheers`.
- `party.test.ts`:
  - Schalter nur in der Lobby
  - Pool mit und ohne Trinkmodus über 200 Seeds (ohne Trinkmodus nie ein `drinkOnly`)
  - Fallback bei `only` auf ein drinkOnly-Spiel
  - `ctx.drinking` erreicht `init`
  - Ergebnis +2 s nur bei Trinkmodus
  - `drinks` im RoundRecord und in der Result-Sicht
  - `again` und `lobby` behalten `drinking`
  - Dev-Override `rounds`
- `config.test.ts`: `seed` und `rounds` nur mit `dev`, Grenzen (rounds 1..8, seed uint32).

## 7. Design-Konsistenz (Neon-Brutalismus)
- Alles in `screenFrame` und `.panel` mit 3 px Kontur (`--bw`) und Versatz-Schatten (`--sh`), Display-Schrift für Schlüsselwörter (Rolle, Begriff, TRINK k), Zahlen tabellarisch. Spielerabzeichen immer über `playerBadge` (Form + Initiale, rot-grün-sicher).
- Farbsemantik: `--ok` für richtig/WAHR/VERTEIL, `--bad` für falsch/GELOGEN/TRINK/geplatzt, `--warn` für Wächter/Tabu, Spielakzent für Rahmen und Timer. Rollenkarten (Verräter, Erzähler) als vollflächiges Panel in `--hot` mit `--on-accent`.
- Geheimes erscheint nur hinter „gedrückt halten zum Zeigen“? **Nein**: P2 verlangt das nicht, und es kostet Tests. Geheimes steht offen auf dem eigenen Handy, Hinweiszeile „Handy nicht zeigen“.
- Neue Tokens nur in `tokens.css` (z. B. `--glow-spot`, `--d-pulse`, `--canvas-stroke`) und, falls Pflicht-Tokens betroffen sind, in `tokens.test.ts` EXTRA nachziehen. Animationen in `motion.css`, alle unter `prefers-reduced-motion` aus (Ballon-Wachsen, Puls, Kartoffel-Glühen, Karten-Flip werden zu sofortigen Zustandswechseln).
- Ton und Haptik über `ctx.sfx`: `tick` für Kartoffel und Countdown, `bad` + Buzz für Platzen und Knall, `ok` für Treffer. Keine neuen Audiodateien (WebAudio-Synth). Neue `SfxKind`-Werte nur, wenn nötig (`boom`), dann `sfx.test.ts` erweitern.
- Layout-Ziel 390×844, Inhalte fürs Spiel ohne Scrollen. Lange Bank-Texte sind über die Längengrenzen der Banken abgesichert.

## 8. Risiken (übergreifend)
1. **E2E-Laufzeit und Flakes bei `fast`:** Phasen von 300–800 ms. Gegenmittel: `drive` per raf-`waitForFunction`, Aufzeichnung statt `expect`-Polling, `rounds=1`, feste Seeds.
2. **Bots in `party.spec` (3 Spieler, Zufallsspiele):** Jeder neue Spiel-Schritt muss seinen Bot für 2 **und** 3 Spieler rollengesteuert bauen, sonst fällt party.spec erst später. Mit festem Seed ist der Ausfall reproduzierbar.
3. **Konformität vs. Mehrphasen:** Generalisiertes Harness in Schritt 1. Ohne das blockiert jeder Spiel-Schritt.
4. **Geheimnis-Lecks über Indizes oder Reihenfolgen** (z. B. Optionen in Lösungs-Reihenfolge). Gegenmittel: Fixieren mit Seed-Mischung beim Phasenwechsel, Secret-Test.
5. **Faktentreue fakefakt:** konservative Bank, `src`-Feld, Review streicht Zweifelsfälle.
6. **Sichtgröße < 6000:** Blindmaler-Striche als Hex-Strings, Verräter-/Erklär-Sichten ohne ganze Decks.
7. **Host-Latenz-Vorteil:** Kartoffel (akzeptiert in P2). Gleichklang-Tiebreak über lokale Messung entschärft.
8. **Lobby-Höhe** mit QR, 8 Spielern, Runden und Trink-Schalter: Lobby darf scrollen (kein Game-Root), aber `screens.spec`-Audit (horizontaler Überlauf, Knopfgrößen) muss grün bleiben.

## 9. Auslegungen → DECISIONS.md (im genannten Schritt eintragen)
- **D-P2-1 (S1):** Trink-Hinweis client-seitig je Party-Code in `sessionStorage`, Overlay auf Party-Ebene, blockiert die Engine nicht.
- **D-P2-2 (S1):** `drinking` überlebt „Nochmal“ und „Neue Party“.
- **D-P2-3 (S1):** Dev-Flags `seed=<uint32>` und `rounds=<1..8>` (nur mit `dev=1`) für reproduzierbare und kurze E2E-Läufe. `Party.rounds` wird `number`, die Lobby bietet weiter 3/5/8.
- **D-P2-4 (S2):** Bank-Marker `wg?: true` und bei fakefakt `src`. Gemeinsamer `bankcheck.ts` mit Verbots-Lint.
- **D-P2-5 (S1):** Teilnahme-Regel: `result`-Eintrag erst ab der ersten angenommenen Eingabe.
- **D-P2-6 (S3):** werwuerde zu zweit bei Uneinigkeit 0 Punkte und Anstoßen.
- **D-P2-7 (S3):** Gleichklang-Tiebreak über lokal gemessene Antwortzeit statt Host-Zeitstempel (Design §3: Latenz entscheidet nie).
- **D-P2-8 (S7):** Blindmaler-Striche als Hex-String je Strich (≤ 2400 Zeichen), statt `number[][]`.
- **D-P2-9 (S10):** Busfahrer: Gleichstand = falsch.
- **D-P2-10 (S11):** Königskarte: König = Anstoßen ohne Pflicht, Score über rohe Schlücke plus Reaktionszeit.
- **D-P2-11 (S1):** Akzente bleiben 4, Timer-Farbe über `data-accent` am Game-Frame.
- **D-P2-12 (S1):** `PlayCtx.setState(state, {step, role})` als Bot- und E2E-Vertrag.
- **D-P2-13 (S2):** Neue Spiele ohne Einzelspieler-`games.spec`, stattdessen `duo.spec` mit `rounds=1`.
- **D-P2-14 (S1):** Trinkplan-Typ mit `cheers`. Eigene `drinks` dürfen `DrinkPlan` liefern.

## 10. Schritte (Bau-Reihenfolge)

### Schritt 1: Engine-Erweiterung, `common.ts`, Trinkmodus-Grundgerüst
- **Ziel:** Engine und Typen für Paket 2 bereit, Trinkmodus durchgängig mit Schalter, Hinweis und Ansage, mit den 4 Altspielen (Platz-Regel). Kein neues Spiel.
- **Dateien:**
  - Typen und Engine: `src/games/types.ts`, `src/engine/{types,party,view,durations,drinks(neu)}.ts`, `src/engine/drinks.test.ts`, `src/engine/party.test.ts`, `src/engine/rounds.test.ts`
  - Konfiguration und App: `src/config.ts(+test)`, `src/app.ts`
  - Gemeinsame Bausteine: `src/games/common.ts` + `common.test.ts`
  - Tests der Spielebene: `conformance.test.ts`, `secrets.test.ts`(neu), `purity.test.ts`, `index.test.ts`, `views.test.ts`
  - UI: `src/ui/screens/{lobby,result,party,game}.ts`, `src/ui/components.css`/`games.css`/`tokens.css`
  - E2E: `e2e/party.spec.ts` (Spielmengen-Prüfung, `seed`), `e2e/helpers.ts` (`Run` um `seed`, `rounds`, `drink` erweitern)
  - Doku: `DECISIONS.md`
- **Vorgehen:**
  1. Zuerst die Tests für `drinks.ts` schreiben und umsetzen (TDD).
  2. Typen und Engine: `drinking`, Aktion, Pool, `init`-ctx, `finishRound` mit Plan, Ergebnis +2 s, Sichten.
  3. Flags `seed`/`rounds`.
  4. `common.ts`-Helfer mit Tests.
  5. Test-Harnesse umbauen (§1.3, §6.2) inkl. Secret-Fixture.
  6. UI: Lobby-Schalter, Hinweis-Overlay, Ergebnis-Streifen, `data-accent` am Game-Frame, `setState`-Erweiterung.
  7. E2E: In `screens.spec` oder neuem `drink.spec` einen Test „Trinkmodus mit `only=hammer`, 2 Spieler, `rounds=1`“. Er prüft: Hinweis auf beiden, Verstanden, kein zweites Mal nach „Nochmal“; `drink-me` beim Verlierer „TRINK 1“, beim Sieger „Du bist raus …“; `drink-line`.
- **Risiken:** Viele Testdateien gleichzeitig. Die Reihenfolge Engine → Tests → UI einhalten. `View`-Erweiterung bricht `toEqual`-Erwartungen in `party.test` (anpassen, nicht aufweichen).
- **Outline-DoD:**
  - `GameCtx.drinking`, `drinkOnly`, `drinks` typisiert
  - `placeDrinks` deckt die P2-Tabelle inkl. Gleichstände, Offline und Kappung ab (Unit)
  - Pool ohne Trinkmodus nie `drinkOnly`, mit Trinkmodus gleich gewichtet (Unit, 200 Seeds); Fallback bei `only`
  - Schalter nur in der Lobby, `again`/`lobby` behalten ihn
  - Ergebnisphase +2 s nur bei Trinkmodus
  - Hinweis einmal je Party-Code und Handy (E2E)
  - Ansage-Texte und `drink-line` (E2E)
  - generalisiertes Konformitäts-Harness grün für die 4 Altspiele, Idle-Ende und n = 1..8
  - Secret-Harness mit Positiv- und Negativkontrolle
  - Purity per Glob
  - `seed`/`rounds` nur mit dev
  - party.spec mit festem Seed grün
  - DECISIONS D-P2-1/2/3/5/11/12/14
  - E2E-Dauer im Review notiert

### Schritt 2: UI-Bausteine, Bot-Gerüst, Duo-Absicherung der Altspiele, Bank-Prüfung
- **Ziel:** `namePicker`, `choicePad`, `textEntry`, `spotlight`, `counter`, `voteBars` stehen. `drive()` in den Bots. `duo.spec.ts` sichert die 4 Altspiele zu zweit ab. `bankcheck.ts` ist bereit.
- **Dateien:** `src/ui/blocks.ts`, `src/ui/games.css`, `src/ui/tokens.css`(+`tokens.test.ts` falls neue Pflicht-Tokens), `src/games/bankcheck.ts` + `bankcheck.test.ts` (prüft den Prüfer mit Fixtures), `src/games/match.ts` + `match.test.ts` (`norm`, `levenshtein`, früh, weil auch die Bank-Dedupe es nutzt), `e2e/bots.ts`, `e2e/duo.spec.ts`(neu), `DECISIONS.md`.
- **Vorgehen:**
  1. Die Bausteine als Fabriken bauen. Sie werden in diesem Schritt nur über eine Dev-Vorschau getestet? **Nein**, ohne Vorschau. Sie bekommen ihren ersten Verbraucher in Schritt 3; hier wird nur gebaut und typgeprüft. Deshalb wird in Schritt 3 die Darstellung in `audit` geprüft.
  2. `drive`.
  3. `duo.spec` für blitz/hammer/farbfalle/schaetzfuchs mit 2 Seiten, `rounds=1`, festem Seed. Bots beider Seiten parallel, 2 Zeilen, Punkte, Labels.
- **Risiken:** Bausteine ohne Verbraucher (YAGNI-Gefahr). Die API knapp halten und in Schritt 3 nachschärfen erlauben. Die Duo-Bots bei Schätzfuchs brauchen verschiedene Tipps.
- **Outline-DoD:** Bausteine mit den Test-IDs aus §3.2; `match`- und `bankcheck`-Unit grün; `drive` einmal je (state, step, role); `duo.spec` 4 Tests grün in ≤ 50 s gesamt; DECISIONS D-P2-4/13.

### Schritt 3: `gleichklang` + `werwuerde`
- **Ziel:** die ersten zwei sozialen Spiele inkl. Banken, werwuerde mit eigenem `drinks`.
- **Dateien:** `src/games/gleichklang/{logic,play?,view,prompts}.ts` + Tests, `src/games/werwuerde/{logic,view,questions}.ts` + Tests, `src/games/{types,index,views}.ts`, `src/engine/durations.ts`, `conformance.test.ts`/`secrets.test.ts`/`index.test.ts` (WIRES), `e2e/bots.ts`, `e2e/duo.spec.ts`, `DECISIONS.md`.
- **Vorgehen:**
  1. TDD-Logik (Phasen, Wertung, Duo, n=1, Tiebreak lokal).
  2. Banken (≥ 60 Fragen, davon ≥ 20 duo; ≥ 70 Fragen, davon ≥ 20 WG und ≥ 20 duo) mit `expectBank`.
  3. Views mit `choicePad`/`namePicker`/`voteBars`.
  4. Bots, Duo-E2E, Layout-Audit der Fragephase und der Auflösung ohne `fast`.
- **Risiken:** werwuerde mit 2 Spielern (Duo-Text „Wer von uns beiden“ aus `duo`-Fragen ziehen). Gleichklang darf vor der Auflösung nur den Zähler zeigen (Secret-Test).
- **Outline-DoD:** Wertung laut P2 + D-P2-6/7 (Unit); Banken mit Quoten; Secret-Test (Picks); `drinks` werwuerde inkl. Gleichstand und Duo; Duo-E2E beider Spiele; party.spec grün; Layout ohne Überlauf, Knöpfe ≥ 56 px.

### Schritt 4: `bombe` + `stopp`
- **Ziel:** zwei Skill-Spiele ohne Bank, eins mit lokaler Zeitmessung.
- **Dateien:** `src/games/bombe/{logic,play,view}.ts` + Tests, `src/games/stopp/{logic,play,view}.ts` + Tests, `src/games/resume.ts` (Wiedereinstieg für beide), Registry, Konformität und Secrets (`burst`), Bots, `duo.spec`, CSS (Ballon, Ring), `motion.css`.
- **Vorgehen:** `bombe/play.ts` (Pump- und Kassier-Lauf mit injizierter Uhr, kumulatives Senden) und `stopp/play.ts` (Start, Blendung und Messung nach Blitz-Muster), beide mit Fake-Uhr getestet. Danach Views, Bots (bombe: zweimal pumpen und kassieren, einmal bis zum Platzen; stopp: Stopp bei ±Ziel via `page.clock`? **Nein**, einfach nach der lokalen Zeit klicken).
- **Risiken:** Bei `fast` sind die stopp-Ziele 0,7–1,5 s, der Bot muss zuverlässig vor Ziel + 0,5 s klicken. Bombe-Platzer-Latenz: Der Client zeigt erst nach der Sicht.
- **Outline-DoD:** `burst` taucht nie in Sichten auf (Secret-Test); `n ≤ 40`, Kappung ±10 000, 5000 ohne Tipp (Unit); Live-Leiste ohne Zahlen; Reload-Wiedereinstieg je eine Unit-Zeile in `resume`; Duo-E2E; Reduced Motion ohne Ballon-Animation.

### Schritt 5: `luegenbaron` + `verraeter`
- **Ziel:** Bluff-Spiele mit Rollen und `spotlight`.
- **Dateien:** `src/games/luegenbaron/{logic,view,topics}.ts`, `src/games/verraeter/{logic,view,words}.ts` + Tests, Registry, Secrets (`truth`, Verräter, Wort), Bots (rollengesteuert), `duo.spec` (+ 3-Spieler-Fall verraeter), Banken (≥ 60 Themen/≥ 20 WG; ≥ 80 Wörter/≥ 15 WG mit `pair`, `decoys[5]`).
- **Vorgehen:** TDD der Phasenmaschinen (Fertig verkürzt, Seed-Default, „Andere Karte“ einmal; Verräter: Durchgänge 2 bei 3–4 Spielern, Gleichstand = nicht enttarnt, Raten aus 6 fixierten Optionen; Doppelgänger 50 %).
- **Risiken:** Zustand wächst; Sicht des Verräters darf keinen Hinweis auf das Wort enthalten (auch nicht `pair`). Bei 3 Spielern Ablauf ≈ 60 s → `fast` 6 s.
- **Outline-DoD:** Wertungen laut P2 (Unit, inkl. Duo und n=1); Secret-Tests für Wahrheit/Rolle/Wort vor Auflösung; Duo-E2E beider, 3-Spieler-E2E verraeter; Banken mit Formtests.

### Schritt 6: `pokerface` + `erklaerbaer`
- **Ziel:** Missions- und Erklärspiel.
- **Dateien:** `src/games/pokerface/{logic,view,missions}.ts`, `src/games/erklaerbaer/{logic,view,terms}.ts` + Tests, Registry, Secrets (Missionen, Begriff für Nicht-Erklärer/Nicht-Wächter), Bots, `duo.spec` (+ 3 Spieler erklaerbaer), Banken (≥ 50 Missionen + ≥ 15 Themen; ≥ 150 Begriffe/≥ 40 mime, Tabu ≠ Begriff).
- **Vorgehen:** Pokerface-Ring über `ringNext`, Optionen fixiert. Erklärbär-Uhr mit Skip-Abzug, `{hit: pid}`, Wächter-Tabu, Duo automatisch.
- **Risiken:** Erklärbär-Sicht muss das Deck verbergen (nur den aktuellen Begriff, nur für Berechtigte). 150 Begriffe Bank-Qualität (Tabuwörter sinnvoll).
- **Outline-DoD:** Wertungen (Unit); Missionen ohne Wiederholung; Secret-Tests; 3-Spieler-E2E mit Wächter; Banken-Quoten.

### Schritt 7: `blindmaler` + `strokeCanvas`
- **Ziel:** Zeichenspiel mit blinder Fläche und Galerie.
- **Dateien:** `src/games/blindmaler/{logic,strokes,view,words}.ts` + Tests (`strokes.ts`: quantisieren, kodieren, kappen, rein), `src/ui/strokeCanvas.ts` (Pointer-Events, Leuchtpunkt, kein Live-Strich; Galerie-Render in Neon), Registry, Konformität (Sichtgröße!), Secrets (Begriff des Zeichners vor der Galerie), Bots (Maus-Kringel per `page.mouse.move`), `duo.spec`, `DECISIONS.md` D-P2-8.
- **Vorgehen:** Kodierung zuerst (TDD), dann Logik (Duo 2 × 10 s, Galerie-Reihenfolge seed-gemischt, Köder aus gleicher Kategorie), dann Canvas und View.
- **Risiken:** `parseInput` muss kaputte und übergroße Striche kappen statt zu werfen. Canvas-Größe bei Safe-Area. Reduced Motion.
- **Outline-DoD:** ≤ 600 Punkte/≤ 2400 Zeichen erzwungen (Unit); Sicht < 6000 bei 8 Spielern; Zeichner kann nicht tippen; Wertung (Unit); Duo-E2E mit echten Strichen (Galerie zeigt ein nicht leeres Canvas).

### Schritt 8: `fakefakt`
- **Ziel:** Bluff mit Freitext und Ablehnung, die heikelste Bank.
- **Dateien:** `src/games/fakefakt/{logic,view,cards}.ts` + Tests, nutzt `match.ts` und `textEntry`, Registry, Secrets (echte Antwort vor Auflösung nicht in der Schreibphase, Autoren der Fakes vor Auflösung), Bots (Fake schreiben, ein zu-nah-Versuch zum Prüfen von `text-error`), `duo.spec`.
- **Vorgehen:** TDD für die Ablehnung, das Auffüllen auf ≥ 4 Optionen, das Ausblenden der eigenen Antwort und die Wertung. Bank ≥ 40 Fakten + ≥ 30 Wörter nach §6.1 mit `src`.
- **Risiken:** Faktentreue (Review streicht). Unicode-Normalisierung. Die echte Antwort darf in der Wählphase nicht an ihrer Position erkennbar sein (Seed-Mischung beim Phasenwechsel).
- **Outline-DoD:** Levenshtein- und Duplikat-Ablehnung als `view.reject` (Unit + E2E `text-error`); Optionen fixiert und gemischt; Wertung; Bank mit `src`, Formtests, Köder > 2 Edits; Duo-E2E.

### Schritt 9: `nochnie` + `wahrpflicht` (drinkOnly)
- **Ziel:** die ersten Trinkspiele mit eigenem `drinks`.
- **Dateien:** `src/games/nochnie/{logic,view,cards}.ts`, `src/games/wahrpflicht/{logic,view,cards}.ts` + Tests, Registry (`drinkOnly: true`), Secrets (Antworten vor Auflösung), Bots, `duo.spec` mit `only=<id>&drink=1`? Der Trinkmodus wird im Test über `btn-drink` eingeschaltet, damit die Ansage geprüft wird. 3-Spieler-E2E für nochnie.
- **Vorgehen:** TDD für Wertung und `drinks` inkl. Kappung durch die Engine. Banken (≥ 80 Sätze/≥ 30 duo/≥ 20 WG; ≥ 50 + 50/≥ 30 duo) mit Verbots-Lint für Pflichten.
- **Risiken:** Inhalts-Leitplanken bei Pflichten. Wahrpflicht-Platzhalterpunkte für Zuschauer.
- **Outline-DoD:** Pool-Test: beide nie ohne Trinkmodus; `drinks` laut P2 (Unit); Ansage im E2E zeigt die Spiel-Schlücke statt der Platz-Regel; Banken-Quoten und Verbote; Duo-E2E und 3er nochnie.

### Schritt 10: `busfahrer` + `kartoffel` (drinkOnly)
- **Ziel:** Kartenduell und Hot-Potato.
- **Dateien:** `src/games/busfahrer/{logic,deck,view}.ts`, `src/games/kartoffel/{logic,view,categories}.ts` + Tests, Registry, Secrets (Deck-Rest, Deadline), Bots, `duo.spec`, CSS (Karten, Glühen), `DECISIONS.md` D-P2-9.
- **Vorgehen:** Das Deck als reine Funktion (32 Karten, Farbe/Wert/Symbol). Stufen-Auswertung mit Gleichstand = falsch. Kartoffel: Deadline nur im Zustand, `urgent`, Veto per Mehrheit, Duo −10 %.
- **Risiken:** Bei `fast` ist die Kartoffel-Deadline 1,5–4 s, der Bot gibt sofort weiter. Busfahrer-Sicht darf nur aufgedeckte Karten tragen.
- **Outline-DoD:** Wertung und `drinks` beider Spiele (Unit); Secret-Tests (keine Deadline-Zahl, kein Deck-Rest); Duo-E2E beider im Trinkmodus.

### Schritt 11: `koenigskarte` (drinkOnly)
- **Ziel:** das komplexeste Trinkspiel allein.
- **Dateien:** `src/games/koenigskarte/{logic,play,view,rules}.ts` + Tests (Reaktions-Lauf nach Blitz-Muster in `play.ts`), Registry, Secrets (nächste Karten), Bots (Flip, Reagieren, Verlierer wählen), `duo.spec`, `DECISIONS.md` D-P2-10.
- **Vorgehen:** Kartentypen als Tabelle (13 Werte × Regel-Handler). Reaktionskarten mit Seed-Wartezeit, lokalen ms und Frühstart. Raumkarten mit `pick` durch den Zieher. Buddy-Verknüpfung, Karte 9/10 als Mini-Phasen. Score und Label.
- **Risiken:** Umfang. Die Handler klein halten (eine Funktion je Kartentyp, gemeinsam getestet), sonst diesen Schritt in Reaktions- und Raumkarten teilen.
- **Outline-DoD:** alle 13 Karten mit Effekt auf `drinks` (Unit je Karte); Reaktionsauswertung inkl. Frühstart; Duo 3 Karten je Spieler; Bank 26 Regeln + ≥ 30 Kategorien; Duo-E2E im Trinkmodus.

### Schritt 12: Komplettparty zu zweit, Trinkmodus-Party, Doku
- **Ziel:** Ende-zu-Ende-Abschluss und Doku.
- **Dateien:** `e2e/party2.spec.ts` (2 Spieler, 8 Runden, fester Seed, Normalpool), `e2e/drink.spec.ts` erweitern (3 Spieler, Trinkmodus, 5 Runden, Seed mit ≥ 1 drinkOnly- und ≥ 1 Platz-Regel-Runde; prüft je Runde `drink-strip`, take ≤ 3, kein drinkOnly ohne Modus in party2), `README.md` (Spieleliste, Trinkmodus und Leitplanken, Flags `seed`/`rounds`, `only`-IDs), `ROADMAP.md` (Paket 2 erledigt; aufgeschoben: `ctx.history`, Level-Feld, 8-Spieler-Layout-Audit, Paket-3-Kandidaten), `ARCHITECTURE.md` (Trinkplan, Pool, Geheimnis-Regel), `design.md` §1 Rundenlänge 20–90 s mit Verweis auf P2.
- **Vorgehen:** Den Seed per kleinem Unit-Hilfstest suchen und als Konstante festhalten. Die Prüfung nutzt die `watch.ts`-Aufzeichnung (`drink`-Zeilen zusätzlich aufzeichnen). Gesamtlaufzeit messen, Ziel ≤ 9 min.
- **Risiken:** Ein Bot-Ausfall in Zufallsspielen. Wegen des festen Seeds ist er reproduzierbar, dann wird der Bot repariert, nicht die Prüfung aufgeweicht.
- **Outline-DoD:** party2 und drink grün; Punkteprüfung je Runde wie party.spec; Trinkplan auf allen Seiten gleich; README/ROADMAP/ARCHITECTURE aktuell; `npm test` gesamt ≤ 9 min (gemessen und notiert); `npm run lint` grün.

---

### Critical Files for Implementation
- /home/karim/projects/wg-arcade/.claude/worktrees/paket2/src/engine/party.ts
- /home/karim/projects/wg-arcade/.claude/worktrees/paket2/src/games/types.ts
- /home/karim/projects/wg-arcade/.claude/worktrees/paket2/src/games/conformance.test.ts
- /home/karim/projects/wg-arcade/.claude/worktrees/paket2/src/ui/screens/result.ts (und lobby.ts, party.ts)
- /home/karim/projects/wg-arcade/.claude/worktrees/paket2/e2e/bots.ts
