# Spielepaket 2 + Trinkmodus (Bau-Wahrheit, ergänzt design.md)

Stand 2026-10-17. Dieser Abschnitt ergänzt `docs/design/design.md` §6. Abweichungen vom bisherigen Design gehören in `DECISIONS.md`:
- Die Rundenlänge steigt von 20–45 s auf **20–90 s**.
- Die Engine wird um den Trinkmodus erweitert (siehe 0 und 2).

## 0. Was sich an der Engine ändert (kurz)

- **`GAME_IDS`** bekommt 15 neue Spiele: 10 normale und 5 Trinkspiele.
- **`GameCtx`** wird zu `{ speed, drinking: boolean }`.
- **`GameDef` bekommt optionale Felder:**
  - `drinkOnly?: true`: das Spiel kommt nur bei aktivem Trinkmodus in die Rotation.
  - `drinks?(s): Record<pid, { take: number; give: number }>`: das Spiel sagt die Schlücke selbst an. Fehlt die Funktion, gilt die Platz-Regel aus 2.
- **Geheimnisse:** Was einzelnen Spielern gehört (Wahrheit, Rolle, Wort, Platzpunkt, Mission), filtert ausschließlich `view(s, pid)`. Neuer Konformitätstest: `JSON.stringify(view(s, x))` darf die Geheimnisse anderer Spieler vor der Auflösung nicht enthalten.
- **Neue gemeinsame Bausteine** in `src/games/common.ts` und `src/ui/`:
  - `turnOrder(seed, pids)`: reihum-Reihenfolge.
  - `spotlight`: wer gerade dran ist, Timer, Knopf „Fertig".
  - `namePicker`: Spielerliste als große Knöpfe, mit oder ohne sich selbst.
  - `choicePad`: 2–6 große Antwortknöpfe.
  - `textEntry`: max. N Zeichen, iOS-Tastatur, Enter = senden.
  - `strokeCanvas` (nur für Blindmaler).
- **Rundenablauf:** Phasen laufen über `tick(now)` und Deadlines im Zustand. Jede Phase endet vorzeitig, wenn alle Online-Spieler fertig sind (`allDone`).
- **Bekannte Grenze:** Es gibt kein Gedächtnis über Runden hinweg. Erzähler, Erklärer usw. wählt der Seed, über eine Party ist das ungefähr fair. Ein späteres `ctx.history` ist additiv nachrüstbar (reversibel).
- **Lobby:** Neuer Schalter „Trinkmodus" (Default aus). Der Rest der Lobby bleibt.

## 1. Neue Spiele (immer in der Rotation)

Alle Spiele laufen mit 2–8 Spielern. Für das Ergebnis gilt: höherer Wert = besser. Die Engine verteilt danach Punkte nach Platz (5/3/2/1/0).

| id | NAME | Art | Dauer | Komplexität |
|---|---|---|---|---|
| `gleichklang` | GLEICHKLANG | social | ~60 s | S |
| `werwuerde` | WER WÜRDE EHER | social | ~55 s | S |
| `bombe` | BOMBE | skill/Nerven | ≤45 s | S |
| `stopp` | BLINDE ZEIT | skill | ~45 s | S |
| `luegenbaron` | LÜGENBARON | bluff | ~90 s | M |
| `verraeter` | DER VERRÄTER | bluff | 60–85 s | M |
| `pokerface` | POKERFACE | bluff | ~85 s | M |
| `erklaerbaer` | ERKLÄRBÄR | social | ~75 s | M |
| `blindmaler` | BLINDMALER | creative | 45–75 s | M |
| `fakefakt` | FAKE FAKT | bluff/creative | ~65 s | L |

### 1.1 `gleichklang` — GLEICHKLANG

- **Pitch:** Gedankenlesen. Alle tippen heimlich eine von 2–4 Antworten, und Punkte gibt es fürs Übereinstimmen.
- **Ablauf:** 6 Fragen aus der Bank, gezogen per Seed („Pizza oder Döner?", „Strand / Berge / Stadt / Sofa"). Pro Frage:
  - **Fragephase (7 s):** Frage und große Knöpfe. Nach dem Tippen erscheint „✓ abgegeben" und ein Zähler „3/5".
  - **Auflösung (3 s):** Jede Antwort ist eine Gruppe mit den Spielerabzeichen darin. Die größte Gruppe ist als „Hauptstrom" markiert.
  - **Am Ende:** Teamzeile „Ihr wart 4/6 im Gleichklang".
- **Dauer:** 6 × 10 s ≈ 60 s.
- **Wertung:** Pro Frage zählt `(Mitspieler mit gleicher Antwort) / (n−1)`. Das Ergebnis ist die Summe × 100, gerundet. Keine Antwort = 0.
- **Zu zweit:** Gleiche Antwort = 1 Punkt für beide. Beide bekommen also immer dasselbe Ergebnis, es geht um den Paar-Test. Damit die Rotation trotzdem einen Sieger hat, gibt es einen Tiebreak: Wer schneller geantwortet hat (Host-Zeitstempel), bekommt +1 pro Treffer.
- **Inhaltsbank:** ≥ 60 Fragen `{q, opts[2..4], duo?: true}`, davon ≥ 20 paartauglich.
- **Umsetzung:**
  - Zustand: `{qi[], k, phaseEnd, picks: Record<pid, Record<k, opt>>}`.
  - `view` zeigt vor der Auflösung nur den Zähler, nicht wer was gewählt hat.
  - Nichts ist zeitkritisch, der Client misst nichts.

### 1.2 `werwuerde` — WER WÜRDE EHER
Hier gehen auf: `werwuerde`, `wgquiz`, `wahrheitstrinken`, `wahrheit`.

- **Pitch:** „Wer würde eher den eigenen Geburtstag verschlafen?" Alle tippen heimlich einen Namen, dann wird gelacht und gestritten.
- **Ablauf:** 4 Fragen pro Runde. Pro Frage:
  - **Abstimmung (10 s):** Frage und `namePicker` mit allen Spielern, sich selbst wählen ist erlaubt.
  - **Auflösung (4 s):** Balken pro Name, der Spitzenname pulsiert. Die Stimmen bleiben anonym.
- **Dauer:** 4 × 14 s ≈ 55 s.
- **Wertung (Konformitätsspiel):**
  - +1, wenn die eigene Stimme auf den Meistgewählten fiel (bei Gleichstand zählen alle Spitzenreiter).
  - +1, wenn man selbst Meistgewählter war. Das ist der „Titel".
- **Zu zweit:** Die Fragen lauten „Wer von uns beiden …". Beide wählen, und bei Einigkeit bekommen beide +1. Wer zum „Titelträger" gewählt wird, bekommt +1, auch wenn beide sich einig sind.
- **Trinkmodus (eigene Regel, `drinks`):**
  - Der Meistgewählte jeder Frage trinkt 1 Schluck (bei Gleichstand alle Spitzenreiter).
  - Zu zweit trinkt bei Einigkeit der Gewählte, bei Uneinigkeit stoßen beide an (0).
- **Inhaltsbank:** ≥ 70 Fragen `{q, duo?: true}`, davon ≥ 20 WG-Alltag (Müll, Bad, Kühlschrank, Lärm) und ≥ 20 paartauglich. Nie über Aussehen oder Körper.
- **Umsetzung:** Wie Gleichklang, aber mit Namen als Optionen. Der Client misst nichts.

### 1.3 `bombe` — BOMBE
`roulette` geht hier auf.

- **Pitch:** Push your luck. Pumpe den Ballon auf und kassiere, bevor er platzt. Jeder Ballon platzt an einer anderen, geheimen Stelle.
- **Ablauf:**
  - 3 Ballons nacheinander, alle spielen parallel im eigenen Tempo.
  - Auf dem Handy: großer Ballon, Knopf **PUMPEN** (Ballon wächst, Punktestand `n²` steigt) und **KASSIEREN**.
  - Platzt der Ballon, gibt es Knall, Vibration und 0 Punkte für diesen Ballon.
  - Die Live-Leiste zeigt bei allen „Anna 💰 kassiert / Ben 💥 geplatzt / Cem pumpt …", aber nie die Zahl. Das erzeugt Gruppendruck („KASSIER!").
- **Dauer:** ≤ 45 s, oder Ende, sobald alle fertig sind.
- **Wertung:** Summe aus `n²` der kassierten Ballons.
- **Zu zweit:** Funktioniert 1:1 als reines Nervenduell. Die Leiste zeigt, wer schon kassiert hat.
- **Inhaltsbank:** keine.
- **Umsetzung:**
  - Platzpunkte pro (Spieler, Ballon): `int(seed, 4..30)`. Sie liegen nur im Host-Zustand und erscheinen nie in `view`.
  - Der Client sendet `{b, n, cash}` kumulativ (wie bei Hammer). Der Host prüft `n ≥ burst`: dann geplatzt, sonst bei `cash` gesichert.
  - Der Client zeigt den Platzer, sobald die Sicht zurückkommt. Im WLAN dauert das ~50 ms, das ist hinnehmbar.
  - Kappung `n ≤ 40`.

### 1.4 `stopp` — BLINDE ZEIT
`stoppuhr` geht hier auf.

- **Pitch:** Stoppe die Uhr möglichst genau bei der Zielzeit. Nach 3 s wird der Bildschirm blind, und die anderen dürfen dich laut ablenken.
- **Ablauf:**
  - 3 Versuche mit Zielzeiten aus dem Seed (7–15 s, auf 0,5 s gerundet).
  - Das Handy zeigt das Ziel „13,0 s". Startsignal als „starte in X ms nach Empfang".
  - Die Uhr läuft 3 s sichtbar, danach bleibt nur ein pulsierender Ring und der Knopf **STOPP**.
  - Danach steht nur „abgegeben" auf dem Schirm.
  - Hinweis auf dem Schirm: „Ablenken erlaubt, Anfassen nicht."
  - Auflösung nach jedem Versuch (3 s): Skala mit Punkten aller Spieler.
- **Dauer:** ~45 s.
- **Wertung:** `−Σ|Abweichung in ms|`. Kein Tipp bis Ziel + 5 s = 5000 ms Strafe.
- **Zu zweit:** 1:1. Die Auflösung zeigt „Du warst 0,12 s näher dran".
- **Inhaltsbank:** keine.
- **Umsetzung:**
  - Der Client misst lokal mit `performance.now()` ab dem lokalen Start und sendet `{k, devMs}`.
  - Der Host kappt Werte auf ±10 000.
  - Muster wie bei Blitz.

### 1.5 `luegenbaron` — LÜGENBARON
Hier gehen auf: `luegner`, `luegenbaron`, `lauschangriff`.

- **Pitch:** Eine Person erzählt eine Geschichte über sich. Alle anderen tippen heimlich: wahr oder gelogen?
- **Ablauf:** 2 Erzähler pro Runde (Seed, `turnOrder`). Pro Erzähler:
  1. **Karte (8 s):**
     - Erzähler-Handy: Thema („Dein skurrilster Nebenjob") und zwei Knöpfe **WAHR ERZÄHLEN** / **ERFINDEN**, einmal „Andere Karte".
     - Alle anderen sehen „Anna denkt sich was aus …" und das Thema.
  2. **Erzählen (30 s):** Der Erzähler redet laut, die anderen dürfen nachbohren. Der Erzähler kann mit „Fertig" abkürzen. Die anderen sehen Timer und Thema.
  3. **Tipp (8 s):** Zwei große Knöpfe **WAHR** / **GELOGEN**. Der Erzähler sieht „Pokerface halten".
  4. **Auflösung (4 s):** Die Wahrheit und wer richtig lag. Balken „3 von 4 reingelegt".
- **Dauer:** 2 × ~45 s ≈ 90 s. Ohne Wahl in der Karten-Phase wählt der Seed.
- **Wertung:** Zuhörer +1 je richtigem Tipp. Erzähler +1 je getäuschtem Zuhörer. Summe.
- **Zu zweit:** Beide erzählen einmal und raten einmal, ein Pokerface-Duell.
- **Inhaltsbank:** ≥ 60 Erzählthemen, davon ≥ 20 WG-/Alltagsthemen. Jedes Thema muss für Wahr und Erfunden taugen.
- **Umsetzung:**
  - Zustand: `{order, k, phase, phaseEnd, truth: Record<k, bool>, votes}`.
  - `truth` steht in `view` nur beim Erzähler und erst ab der Auflösung bei allen.
  - Der Client misst nichts.

### 1.6 `verraeter` — DER VERRÄTER
`imposter` geht hier auf.

- **Pitch:** Alle bekommen dasselbe Geheimwort, nur einer nicht. Wer ist der Verräter?
- **Ablauf (ab 3 Spielern):**
  1. **Wort (6 s):**
     - Alle sehen „Dein Wort: PINGUIN".
     - Der Verräter sieht „Kategorie: Tiere – DU BIST DER VERRÄTER".
  2. **Reihum (`spotlight`, 5 s je Spieler):** Jeder sagt laut EIN passendes Wort. Das aktive Handy leuchtet, „Fertig" schaltet weiter. Bei 3–4 Spielern 2 Durchgänge, sonst einer.
  3. **Diskussion (15 s):** Freies Reden, auf dem Schirm nur ein Timer.
  4. **Abstimmung (12 s):** `namePicker` ohne sich selbst.
  5. **Enttarnt?** Bekommt der Verräter die meisten Stimmen (Gleichstand gilt als nicht enttarnt), hat er 10 s, um das Wort aus 6 Optionen zu raten.
  6. **Auflösung (4 s):** Wort, Rolle und Stimmen.
- **Dauer:** 3 Spieler ≈ 60 s, 8 Spieler ≈ 85 s.
- **Wertung:**
  - Verräter: unentdeckt 5 · enttarnt, aber Wort erraten 2 · enttarnt 0.
  - Alle anderen: +2 bei Stimme gegen den Verräter.
- **Zu zweit („Doppelgänger"):**
  - Beide bekommen ein Wort aus einem Paar (Hund/Wolf). Mit 50 % (Seed) ist es dasselbe Wort.
  - Abwechselnd je 2 Beschreibungen laut (4 × 6 s).
  - Dann tippt jeder: „Gleiches Wort?" JA/NEIN. Richtig = 2 Punkte.
- **Inhaltsbank:** ≥ 80 Einträge `{word, cat, pair, decoys[5]}`, davon ≥ 15 WG-Dinge.
- **Umsetzung:**
  - Der Index des Verräters steht nur im Host-Zustand.
  - `view(s, pid)` gibt dem Verräter `{cat}`, allen anderen `{word}`.
  - Die Wort-Optionen sind seed-gemischt.

### 1.7 `pokerface` — POKERFACE

- **Pitch:** Jeder bekommt eine geheime Mini-Mission für das Gespräch. Wer erfüllt sie unbemerkt, und wer durchschaut den Nachbarn?
- **Ablauf:**
  1. **Mission (6 s):** Jedes Handy zeigt die eigene Mission, z. B. „Sag 3× ‚Banane' in normalen Sätzen" oder „Stell zwei Gegenfragen". Auf allen Handys steht dasselbe Gesprächsthema: „Plant gemeinsam den WG-Urlaub".
  2. **Gespräch (55 s):** Großer Knopf **ERLEDIGT**. Danach steht „✓ erledigt" auf dem Schirm, ohne die Zeit.
  3. **Raten (18 s):** Jeder rät die Mission genau EINES Ziels, des rechten Nachbarn im Seed-Ring, aus 4 Optionen: die echte und 3 Köder.
  4. **Auflösung (6 s):** Alle Missionen und wer was erfüllt bzw. erraten hat.
- **Dauer:** ~85 s.
- **Wertung:**
  - Mission erledigt und vom Rater nicht erraten: 3. Erledigt, aber erraten: 1.
  - Richtig geraten: +2.
  - „Erledigt" ist ehrenbasiert, es gibt kein Veto.
- **Zu zweit:** Funktioniert ohne Änderung, ein Ring aus 2 Spielern bedeutet: jeder rät den anderen.
- **Inhaltsbank:** ≥ 50 Missionen (nur hör- oder sichtbar im Gespräch, **kein Anfassen, nichts Peinlich-Übergriffiges**) und ≥ 15 Gesprächsthemen.
- **Umsetzung:**
  - Missionen ohne Wiederholung pro Runde.
  - Die Mission des Ziels ist bis zur Auflösung nur beim Besitzer in der Sicht. Beim Rater erscheinen nur die 4 Optionen, gemischt.

### 1.8 `erklaerbaer` — ERKLÄRBÄR
`pantomime` (Stummfilm) geht hier als Kartentyp auf.

- **Pitch:** Erkläre Begriffe, ohne die Tabuwörter zu sagen, oder spiele sie stumm vor. Die anderen raten laut.
- **Ablauf:** 2 Erklärer pro Runde (Seed), je 35 s.
  - **Erklärer-Handy:** Begriff groß, 3 Tabuwörter rot (bei Stummfilm-Karten „🤫 NUR PANTOMIME"). Knöpfe:
    - **GESCHAFFT:** danach Rater per `namePicker` antippen, zu zweit automatisch.
    - **SKIP:** kostet 3 s.
  - **Wächter** (nächster Spieler in der Reihenfolge, nur ab 3 Spielern): sieht Begriff und Tabuwörter und hat den Knopf **TABU!** (−1, Begriff wird übersprungen).
  - **Alle anderen:** „Max erklärt, ruft laut!", Timer und Trefferzähler, kein Begriff.
  - Etwa 30 % der Karten sind Stummfilm-Karten.
- **Dauer:** ~75 s.
- **Wertung:** Erklärer +2 je Treffer, −1 je Tabu. Rater +1 je Begriff, den er erraten hat.
- **Zu zweit:** Beide erklären einmal je 35 s, der andere rät. Ohne Wächter sagt der Erklärer ehrlich selbst „Tabu".
- **Inhaltsbank:** ≥ 150 Begriffe `{term, taboo[3], mime?: true}`, davon ≥ 40 pantomimetauglich.
- **Umsetzung:**
  - Die Uhr läuft auf dem Host über `now`. Latenz ist unkritisch, weil der Erklärer selbst tippt.
  - Zustand: `{order, k, deck, idx, endsAt, hits[], taboos}`.
  - `view` zeigt den Begriff nur dem Erklärer und dem Wächter.

### 1.9 `blindmaler` — BLINDMALER

- **Pitch:** Zeichne einen Begriff, ohne deinen Strich zu sehen. Danach rätselt die Runde, was das sein soll.
- **Ablauf:**
  1. **Zeichnen (20 s):** Jeder bekommt einen eigenen Begriff. Die Fläche bleibt schwarz, nur ein Leuchtpunkt zeigt die Fingerposition. Kein Radiergummi.
  2. **Galerie (je 6 s pro Bild, Reihenfolge per Seed):** Alle sehen dasselbe Bild in Neon-Strich und 4 Optionen (echter Begriff und 3 Köder). Der Zeichner sieht „Dein Kunstwerk" und darf nicht tippen.
  3. **Kurze Auflösung je Bild (2 s):** Der echte Begriff leuchtet auf, dazu wer richtig lag.
- **Dauer:** 20 s + n × 8 s, also 2 Spieler ≈ 50 s, 8 Spieler ≈ 85 s.
- **Wertung:** Zeichner +2 pro Spieler, der sein Bild erkannt hat. Rater +1 je richtigem Tipp.
- **Zu zweit:** 2 Begriffe pro Spieler (2 × 10 s Zeichnen), jeder rät die 2 Bilder des anderen.
- **Inhaltsbank:** ≥ 80 einfache, zeichenbare Begriffe und Köder aus derselben Bank (Seed, gleiche Kategorie bevorzugt).
- **Umsetzung:**
  - Der Client zeichnet lokal, ohne Live-Abgleich.
  - Gesendet wird einmal am Ende und als Zwischenstand alle 5 s gegen Abbruch: `{strokes: number[][]}`. Koordinaten auf 0–255 quantisiert, ≤ 600 Punkte gesamt, ≤ 4 KB.
  - `parseInput` kappt.
  - `view` liefert in der Galerie die Striche des aktuellen Bildes.

### 1.10 `fakefakt` — FAKE FAKT
`wortschmied` geht hier als Kartentyp auf.

- **Pitch:** Ein wahrer, absurder Fakt mit Lücke oder ein echtes seltsames Wort. Jeder erfindet eine glaubhafte Antwort, dann raten alle die echte.
- **Ablauf:** Eine Karte pro Runde, 50/50 Fakt („___ ist das einzige Säugetier, das …") oder Wort („Was bedeutet ‚Quisquilien'?").
  1. **Schreiben (30 s):** `textEntry`, max. 30 Zeichen. Ist die Eingabe zu nah an der echten Antwort, kommt sofort „Zu nah dran, versuch was anderes".
  2. **Wählen (20 s):** Liste aus echter Antwort, den Fakes aller Spieler und, falls nötig, Bank-Fakes bis zu mindestens 4 Optionen, gemischt. Die eigene Antwort ist ausgeblendet.
  3. **Auflösung (10 s):** Die echte Antwort leuchtet grün, dazu wer auf wessen Fake reingefallen ist.
- **Dauer:** ~65 s.
- **Wertung:**
  - +2 für die echte Antwort.
  - +1 je Spieler, der auf die eigene Fälschung reinfiel.
  - Wer nichts schreibt, wird durch einen Bank-Fake ersetzt und bekommt dafür keine Punkte.
- **Zu zweit:** Echt, der Fake des Gegners und 2 Bank-Fakes, also 4 Optionen.
- **Inhaltsbank:** ≥ 40 Fakten und ≥ 30 Wörter, je `{q, a, fakes[3]}`. Belegbar, stabil, keine Meinungsfragen.
- **Umsetzung:**
  - Normalisierung: klein schreiben, Umlaute auflösen, Satzzeichen weg. Ablehnen bei Levenshtein ≤ 2 zur echten Antwort und bei Duplikaten unter den Fakes.
  - Die Ablehnung kommt als `view.reject`.
  - Die Optionen fixiert der Host beim Phasenwechsel, gemischt per Seed.

## 2. Trinkmodus

- **Schalter:** In der Host-Lobby „🍻 Trinkmodus", Default **aus**. Clients sehen den Status in der Lobby.
- **Einmaliger Hinweis**, beim ersten Aktivieren pro Party als Vollbild auf allen Handys mit „Verstanden":
  > Schluck = irgendein Getränk. **Wasser zählt.** Passen ist immer okay, ohne Kommentar. Niemand muss trinken. Mehr als 3 Schlücke pro Runde gibt es nicht.
- **Verteilen nach jeder Runde** (Platz-Regel, gilt, wenn das Spiel kein eigenes `drinks` hat):

  | Spieler | Letzter Platz | Vorletzter | Sieger |
  |---|---|---|---|
  | 2 | 1 Schluck | – | – |
  | 3–4 | 2 Schlücke | – | verteilt 1 |
  | 5–8 | 2 Schlücke | 1 Schluck | verteilt 2 |

  - Gleichstand auf dem letzten Platz: alle Betroffenen trinken.
  - Zu zweit bei Gleichstand: beide stoßen an, ohne Pflicht.
  - Offline-Spieler bekommen nichts.
  - Pro Spieler werden pro Runde höchstens 3 Schlücke angesagt (`take` kappen).
- **Ansage-Screen:** Ein Streifen auf dem Runden-Ergebnis, die Ergebnisphase dauert bei aktivem Modus +2 s.
  - Auf dem eigenen Handy groß und rot: **„TRINK 2"** bzw. grün **„VERTEIL 2"**. Das Verteilen passiert mündlich, ohne Eingabe.
  - Darunter eine Zeile für alle: „🍻 Ben 2 · Cem 1 · Anna verteilt 2".
  - Ohne Schluck steht dort „Du bist raus aus der Nummer 😎".
- **Rotation:** Mit Trinkmodus kommen die `drinkOnly`-Spiele in den Pool, gleich gewichtet. Es bleibt bei: nie dasselbe Spiel zweimal hintereinander. Ohne Trinkmodus kommen sie nie dran.
- **Leitplanken:**
  - Kein „Exen", keine Mischregeln, keine Strafen fürs Passen.
  - Kein Schlucke-Ranking auf dem Podium. Es bleibt bei Punkten.
  - Spiele mit eigenem `drinks` halten sich an die gleiche Kappung.

## 3. Klassische Trinkspiele (`drinkOnly: true`, eigenes `drinks`)

### 3.1 `nochnie` — ICH HAB NOCH NIE
`nie` (Schätz-Twist) und `lugner` gehen hier auf.

- **Pitch:** Der Klassiker. Jeder tippt heimlich und schätzt dazu, wie viele es schon getan haben.
- **Ablauf:** 4 Karten pro Runde. Pro Karte:
  - **Eingabe (10 s):** „Ich hab noch nie … bei einem Date geweint." Zwei Knöpfe **HAB ICH** / **NOCH NIE** und darunter ein Zahlwähler „Wie viele haben schon?" (0…n). Beides auf einem Schirm.
  - **Auflösung (5 s):** Anzahl groß, darunter die Namen der „Hab ich"-Sager als Chips.
- **Dauer:** 4 × 15 s = 60 s.
- **Wertung:**
  - Ergebnis = Σ (n − |Schätzung − echte Anzahl|) je Karte, also Schätzgenauigkeit.
  - Ehrlichkeit wird nie bestraft, Erfahrung bringt keinen Punkt.
- **Trinken:** „Hab ich" = 1 Schluck. Wer die Anzahl exakt schätzt, verteilt 1.
- **Zu zweit:** Statt der Zahl die Frage „Hat [Name] schon?" JA/NEIN. Treffer = 1 Punkt und 1 Schluck verteilen. Die Auflösung lautet „Ihr beide!", „Nur du" oder „Keiner".
- **Inhaltsbank:** ≥ 80 Sätze, davon ≥ 30 paartauglich und ≥ 20 WG-Alltag.
- **Umsetzung:** Antworten sind bis zur Auflösung nur in der eigenen Sicht. Der Client misst nichts.

### 3.2 `koenigskarte` — KÖNIGSKARTE (Ring of Fire)

- **Pitch:** Reihum Karte ziehen, jede Karte ist eine Regel für den ganzen Raum. Bei Reaktionskarten ist das Handy der Schiedsrichter.
- **Ablauf:**
  - Jeder Spieler zieht einmal (Seed-Reihenfolge, Deck aus 13 Werten). Zu zweit zieht jeder dreimal.
  - Der Zieher tippt auf seine Karte, sie dreht sich um, und alle Handys zeigen Karte und Regel (~10 s). Das Weiterschalten macht der Zieher mit „Weiter" oder die Zeit.
  - **Reaktionskarten** (4 „Boden", 6 „Himmel", Dame „Daumen"): Alle Handys zeigen gleichzeitig nach einer Zufallswartezeit (Seed, 1–3 s) einen Riesenknopf. Wer zuletzt tippt, trinkt. Der Client misst lokal die Reaktion ab dem Aufleuchten, wie bei Blitz.
  - **Raumkarten** (Kategorie, Reim, Wasserfall, Regel): Das Handy zeigt die Ansage und ggf. „Wer hat verkackt?" per `namePicker`, den Ausgang tippt der Zieher.
- **Dauer:** ~60–85 s.
- **Wertung:** Ergebnis = −(eigene Schlücke). Bei Gleichstand gewinnt die bessere Reaktionszeit. Der Titel lautet „Nüchternste/r".
- **Trinken:** Die Karte bestimmt, kappen bei 3. Kartenauswahl:

  | Karte | Regel |
  |---|---|
  | Ass | Wasserfall: alle trinken, bis der Zieher absetzt, Gnade nach 1 Schluck |
  | 2 | Du: verteile 2 |
  | 3 | Ich: trink 1 |
  | 4 | Boden: Letzter Tipp trinkt |
  | 5 | Trinkbuddy: der Gewählte trinkt in dieser Runde immer mit |
  | 6 | Himmel: Letzter Tipp trinkt |
  | 7 | Kategorie: wer stockt, trinkt |
  | 8 | Reim: wer stockt, trinkt |
  | 9 | Noch nie: der Zieher sagt einen Satz, alle mit „Hab ich" tippen |
  | 10 | Wer würde eher: Mini-Abstimmung |
  | Bube | Regelkarte, gilt für den Rest der Runde |
  | Dame | Daumen: Letzter Tipp trinkt |
  | König | Alle stoßen an |

- **Zu zweit:** 3 Karten je Spieler. „Letzter" ist der Langsamere, „verteile" heißt „der andere trinkt".
- **Inhaltsbank:** 13 Werte × 2 Regelvarianten (26 Texte) sowie ≥ 30 Kategorie- und Reimaufgaben.
- **Umsetzung:**
  - Zustand: `{order, k, card, phase, react: Record<pid, ms>, drinks}`.
  - Der Reaktions-Teil verwendet die Bausteine von Blitz (`starte in X ms`, Frühstart = langsamster).

### 3.3 `busfahrer` — BUSFAHRER

- **Pitch:** Ein Fahrer rät vier Stufen am Kartendeck, und alle anderen wetten gegen ihn.
- **Ablauf:**
  - 2 Fahrer pro Runde (Seed), 32-Karten-Deck per Seed gemischt.
  - Die Stufen: 1) Rot/Schwarz · 2) Höher/Tiefer · 3) Innerhalb/Außerhalb · 4) Symbol (4).
  - Pro Stufe (6 s): Der Fahrer sieht seine bisherigen Karten und die Knöpfe. Alle anderen sehen dieselben Karten und tippen **SCHAFFT ER** / **SCHAFFT ER NICHT**.
  - Aufdecken (2 s, alle sehen die Karte). Liegt der Fahrer falsch, endet seine Fahrt.
- **Dauer:** 2 × (4 × 8 s) ≈ 65 s.
- **Wertung:** Fahrer + Stufe für jede geschaffte Stufe (1+2+3+4 maximal). Zuschauer +1 je richtiger Wette.
- **Trinken:**
  - Der Fahrer scheitert auf Stufe k: er trinkt min(k, 3).
  - Wer auf „schafft er nicht" gesetzt hat und falsch lag: 1 Schluck pro Fahrt, nicht pro Stufe.
  - Kommt er durch alle 4 Stufen, verteilt der Fahrer 3.
- **Zu zweit:** Abwechselnd fahren und wetten. Dasselbe Prinzip, ein reines Duell.
- **Inhaltsbank:** keine (Deck im Code).
- **Umsetzung:** Das Deck liegt im Host-Zustand. `view` zeigt nur die aufgedeckten Karten. Der Client misst nichts.

### 3.4 `wahrpflicht` — WAHRHEIT ODER PFLICHT

- **Pitch:** Der Seed wählt das Opfer, das Opfer wählt Wahrheit oder Pflicht, und der Raum urteilt per Daumen.
- **Ablauf:**
  - 3 Durchgänge mit verschiedenen Opfern (Seed). Zu zweit 4 Durchgänge im Wechsel.
  - **Opfer-Handy (5 s):** **WAHRHEIT** / **PFLICHT**, dann die Karte. Einmal pro Runde „Passen", das kostet 1 Schluck.
  - **Die anderen:** dieselbe Karte mit „Anna muss …".
  - **Ausführen (bis 15 s):** Das Opfer tippt „Fertig".
  - **Urteil (5 s):** Die anderen tippen 👍 / 👎 („durchgezogen?").
- **Dauer:** 3 × ~25 s ≈ 75 s.
- **Wertung:** Ergebnis = 👍 erhalten, plus 1 fürs Wählen von Pflicht. Zuschauer bekommen Platzhalter-Punkte, nämlich 1 pro abgegebenem Urteil, damit niemand leer ausgeht.
- **Trinken:** Passen = 1. Mehrheit 👎 = 1. Pflicht mit Mehrheit 👍 = verteile 1.
- **Zu zweit:** Das Urteil fällt der Partner. Karten mit „alle im Raum" werden zu „dein Gegenüber" (Marker `duo`).
- **Inhaltsbank:** ≥ 50 Wahrheiten und ≥ 50 Pflichten, davon ≥ 30 paartauglich. Pflichten nur im Raum ausführbar, **nichts Körperliches an anderen**, nichts mit Handy- oder Social-Media-Posten.
- **Umsetzung:** `spotlight`-Baustein und Daumen über `choicePad`.

### 3.5 `kartoffel` — HEISSE KARTOFFEL (virtuell)

- **Pitch:** Eine Bombe springt von Handy zu Handy. Wer dran ist, nennt laut etwas zur Kategorie und wirft weiter, bis es knallt.
- **Ablauf:**
  - Kategorie auf allen Handys („Biermarken").
  - Das Handy mit der Kartoffel glüht orange, tickt und vibriert. Der Halter ruft laut eine Antwort und tippt **WEITER** + `namePicker` (zu zweit automatisch).
  - Die anderen sehen „Kartoffel bei Ben" und den Knopf **ZÄHLT NICHT!**: Mehrheitsveto bei Wiederholung oder Unsinn, dann geht die Kartoffel zurück.
  - Der Timer ist geheim (Seed, 15–40 s) und nur auf dem Host. In den letzten 5 s wird das Ticken schneller, das ist bei allen sichtbar und gewollt.
  - Knall: „BUMM – Ben!"
  - 2 Kartoffeln pro Runde.
- **Dauer:** ~60–80 s.
- **Wertung:** Ergebnis = −(Knaller beim Halter × 2) − Vetos.
- **Trinken:** Halter beim Knall 2, erfolgreiches Veto gegen dich 1.
- **Zu zweit:** Pingpong. Nach jedem Weiterwerfen verkürzt sich die Restzeit um 10 % (Eskalation).
- **Inhaltsbank:** ≥ 60 Kategorien mit vielen Antworten.
- **Umsetzung:**
  - Die Deadline steht nur im Host-Zustand, `view` liefert `{holder, urgent: bool}`.
  - Wahr ist die Host-Ankunftszeit. Im WLAN liegt die Latenz im zweistelligen ms-Bereich, das ist akzeptiert, weil nur der Halter weitergeben kann.
  - Es wird kein echtes Handy weitergereicht. Damit bleibt das Host-Modell intakt.

## 4. Inhaltsbanken

| Bank | Datei | Mindestanzahl | Pflichtfelder |
|---|---|---|---|
| Gleichklang-Fragen | `gleichklang/prompts.ts` | 60 (≥ 20 duo) | `q, opts[2..4], duo?` |
| Wer würde eher | `werwuerde/questions.ts` | 70 (≥ 20 WG, ≥ 20 duo) | `q, duo?` |
| Erzählthemen | `luegenbaron/topics.ts` | 60 (≥ 20 WG) | `topic` |
| Verräter-Wörter | `verraeter/words.ts` | 80 (≥ 15 WG) | `word, cat, pair, decoys[5]` |
| Missionen und Themen | `pokerface/missions.ts` | 50 + 15 | `mission`, `topic` |
| Erklärbegriffe | `erklaerbaer/terms.ts` | 150 (≥ 40 mime) | `term, taboo[3], mime?` |
| Zeichenbegriffe | `blindmaler/words.ts` | 80 | `word, cat` |
| Fakten und Wörter | `fakefakt/cards.ts` | 40 + 30 | `kind, q, a, fakes[3]` |
| Noch nie | `nochnie/cards.ts` | 80 (≥ 30 duo, ≥ 20 WG) | `s, duo?` |
| Königskarte | `koenigskarte/rules.ts` | 26 Regeln + 30 Kategorien | `value, variant, text` |
| Wahrheit/Pflicht | `wahrpflicht/cards.ts` | 50 + 50 (≥ 30 duo) | `kind, text, duo?` |
| Kartoffel-Kategorien | `kartoffel/categories.ts` | 60 | `cat` |

- **Ton:** WG-tauglich, frech-liebevoll, Selbstironie statt Bloßstellen.
- **Verboten:**
  - Inhalte über Dritte, die nicht im Raum sind (Ex, Eltern, Mitbewohner beim Namen).
  - Alles über Minderjährige.
  - Aussehen, Körper, Gewicht, Gesundheit, Krankheit, Gewalt, Sucht, Herkunft, Religion, Sexualität als Pointe.
  - Illegales als Aufforderung.
  - Pflichten mit Anfassen anderer, mit Posten oder Fotos oder mit Geldausgaben.
- **„Frech"** heißt peinliche Alltagsmomente: Dates, Verschlafen, WG-Sünden. Es gibt nur eine Stufe, ohne Stufenwahl (reversibel, nachrüstbar über ein Feld `level`).
- **Bank-Tests** (wie `questions.test.ts`): Mindestanzahl, Pflichtfelder, keine Duplikate, Länge passt auf 360 px. Bei Verräter, Fake Fakt und Blindmaler sind Köder ≠ Lösung.

## 5. Verworfen (mit Grund)

| Idee | Grund |
|---|---|
| `werwolfmini` | Erst ab 5 Spielern gut, zu zweit sinnlos, rollenspezifische Sichten aufwendig. Der Verräter deckt Social Deduction ab. |
| `zeichenraten` (Kritzelkönig) | Live-Abgleich der Zeichnung über den Host ist lag-anfällig. Blindmaler liefert die Zeichen-Comedy ohne Live-Abgleich. |
| `stille` (Stille Post Zeichnen) | Lachgarant, aber Bild-Weitergabe, Ketten und Mehrphasen-Zustand sprengen 90 s, zu zweit schwach. Später als „Langes Spiel" denkbar. |
| `quipsch` | Zu zweit dünn, Duell-Logik plus Promptbank ohne klaren Vorsprung vor Fake Fakt. |
| `wortschmied`, `pantomime`, `roulette`, `luegner`, `lugner`, `nie`, `imposter`, `wgquiz`, `wahrheit`, `wahrheitstrinken`, `stoppuhr`, `lauschangriff` | In Fake Fakt, Erklärbär, Bombe, Lügenbaron, Noch nie, Verräter, Wer würde eher bzw. Blinde Zeit zusammengelegt. |
| `prost` (Kartenmix) | Ersetzt durch Trinkmodus und eigenständige Trinkspiele. Das ist kein Mischmodul. |
| `busfahrer` (Skill-Fassung) | Reines Glück ohne Interaktion. Die Fahrer-und-Wetten-Fassung ist besser. |
| `handywanderer` (echtes Handy weiterreichen) | Bricht das Host-Modell (Sperrbildschirm, Verbindung). Wird als virtuelle `kartoffel` umgesetzt. |
| `echo`, `wisch`, `takt` | Wieder Reaktions- und Gedächtnistests, wenig Raum-Interaktion. Takt hat zusätzlich Audio-Latenz auf iOS. |
| `pong` (Kugelbahn) | Physik und Leveldesign sind teuer, wenig Party-Gefühl. |
| `sieben` | Das Handy hat kaum eine Rolle, die Regeln sind diffus. |
| `assoziationskette` | Veto-Abstimmung bei Zügen von 6–8 s ist lag- und streitanfällig. Kandidat für Paket 3. |