# paket2 — Schritt 7: `blindmaler` + `strokeCanvas` (Abgleich)

Master-Plan §3.3, §4, §5 (blindmaler), §6.2, §8 Risiko 6, §9 D-P2-8, §10 S7; P2 §1.9, §4. Basis `hew/paket2` @ 44a824a (S6 + Review). Jeder Shell-Aufruf mit PATH-Export.

## 1. Abgleich (gemessen 2026-10-18)
| Master-Annahme | Befund | Korrektur |
|---|---|---|
| party.spec bleibt mit Seed 20261017 gültig | Mit 13 IDs (blindmaler am Ende) gibt `planOrder` für Lauf 1 luegenbaron, werwuerde, hammer, stopp, verraeter. Lauf 2 (Seed 1224702332, hängt nicht vom Pool ab) gibt hammer, bombe, werwuerde, pokerface, luegenbaron. **blindmaler kommt in keinem Lauf vor.** gleichklang und erklaerbaer fallen heraus. `party.spec:22–23` wird rot | `NORMAL` um blindmaler erweitern, RUN1/RUN2 genau per `toEqual` (gehört in den Rot-Commit). Seed bleibt. In DECISIONS stehen die weggefallenen Spiele (S5-MINOR) und dass der 3er-Pfad von blindmaler nur per Unit-Test geprüft ist |
| Konformität prüft die Sichtgröße (Risiko 6) | Der Harness misst nur nach `feed` (Zeichenphase) und nach dem Ende. Eine Galerie-Sicht wird nie gemessen. Er nutzt kurze pids (`p0`), echte pids sind UUIDs | Eigener Unit-Test: Worst Case in allen Phasen, mit 8 Spielern und 36-stelligen pids (DoD) |
| Ein Zeichnen-Input genügt dem Harness | `input und tick …` verlangt: Nach `finish` von p0 und p1 liefert ein Tick mit online {p0,p1} einen neuen Zustand. Das braucht ein Fertig-Signal. Dazu muss ein identisch wiederholter `first` dieselbe Referenz liefern | `fin` im Draw-Input und Knopf **FERTIG** (`btn-done`), `allDone(fin)` beendet den Slot. P2 kennt den Knopf nicht. Reversibel, DECISIONS |
| P2: einmal am Ende senden, Zwischenstand alle 5 s | Der Host schaltet am ersten Tick ≥ `endsAt` weiter, ein Ende-Paket kommt also zu spät. Der Client kennt `speed` nicht, ein 5-s-Timer feuert bei `fast` nie | Hammer-Muster: Der Host nimmt Striche bis `endsAt + GRACE` an (GRACE ungeskaliert wie bei hammer). Der Client sendet `fin` am lokalen Ende und bei FERTIG. Nach jedem Strich (pointerup) schickt er einen kumulativen Schnappschuss statt eines 5-s-Timers (DECISIONS). Idle bei speed 10 und n=8: höchstens 2 + 1,5 + 8 × 0,8 = 9,9 s < 13,5 s |
| P2 `{strokes: number[][]}` ≤ 4 KB | D-P2-8: `string[]`, 4 Hex-Zeichen je Punkt, also 600 Punkte = 2400 Zeichen je Bild. Der Umschlag `MAX_RAW` 16384 passt. Der JSON-Overhead bei 600 Einzelpunkt-Strichen liegt bei ≈ 4200 Zeichen | Keine Strichzahl-Grenze nötig, solange der Größentest grün ist. Grenzen gelten **je Bild** (zu zweit je Slot) |
| `choicePad` mit 4 Optionen | Er wählt automatisch 2 Spalten, `.choice-text` kürzt mit Ellipse | Bank-Wörter ≤ 12 Zeichen (Bank-Test). Im Layout-Test `clipped = 0` |
| Canvas in Neon, Tokens | `tokens.test` verbietet Hex- und px-Literale auch in `.ts` | Canvas-Farben per `getComputedStyle` aus den Tokens lesen (Akzent, `--bg`), Linienbreiten als Zahlen |
| Purity per Glob | `blindmaler/{logic,strokes,words}.ts` fallen automatisch darunter | `strokes.ts` ohne DOM und ohne `ui`-Import. `ui/strokeCanvas.ts` darf `strokes.ts` importieren. Liste in `purity.test` ergänzen |
| Reduced Motion | `games.spec` hat eine Tabelle (bombe/balloon, stopp/stopp-ring) | Zeile `blindmaler`/`draw`/`bm-dot` ergänzen (≈ 3 s) |

## 2. Entscheidungen & Fallen (reversibel, DECISIONS)
- **Phasen:** `draw` (n ≠ 2: ein Slot zu 20 s; zu zweit zwei Slots zu je 10 s, jeder mit eigenem Begriff) → je Bild `show(6 s)` → `reveal(2 s)` → Ende.
  - Bilder ohne Striche entfallen. Hat niemand gezeichnet, endet das Spiel nach `draw`.
  - `show` endet vorzeitig, sobald alle Online-Betrachter getippt haben. Ohne Betrachter (n = 1) geht es direkt zu `reveal`. n = 1 gibt 0 Pkt.
  - Die Galerie-Reihenfolge wird seed-gemischt beim Wechsel aus `draw` fixiert, ebenso die Optionen.
- **Eingaben:**
  - `{a:'draw', k, strokes, fin?}` ersetzt den bisherigen Stand. Gleicher Stand → dieselbe Referenz. Nach `fin` ist der Slot gesperrt, ein falsches `k` wird ignoriert.
  - `{a:'tip', j, i}` gilt nur in `show` für das aktuelle Bild `j`, einmal und nie vom Zeichner. Ein veraltetes `j` wird ignoriert (bei `fast` real).
  - `parseInput` baut neue Arrays und hält nie Referenzen auf Roh-Eingaben.
- **Begriffe/Optionen:**
  - `pickDistinct` zieht n × Slots Begriffe, alle verschieden.
  - Je Bild: der echte Begriff und 3 Köder, bevorzugt aus derselben Kategorie, sonst aufgefüllt. Ein Köder ist **nie ein Begriff dieser Runde**, sonst steckt ein späteres Bild in fremden Optionen (S6-Lehre).
  - Die Sicht zeigt Texte, keine Bankindizes.
- **Wertung/Teilnahme:**
  - Zeichner +2 je Betrachter, der richtig lag. Betrachter +1 je richtigem Tipp.
  - Ein `result`-Eintrag entsteht ab dem ersten angenommenen `draw`, `fin` oder Tipp. FERTIG auf leerer Fläche zählt (Rollen-Eingabe, §1.4).
- **Sichten:**
  - `draw`: nur eigener Slot-Begriff, `slot`/`slots`, `endsAt`/`dur` (ohne GRACE), eigenes `fin` und Fertig-Zähler. **Keine Striche**, auch nicht die eigenen (kein Echo; Reload startet neu, Out-of-Scope).
  - `show`: Striche nur des aktuellen Bildes, Optionen, Zeichner-pid, eigener Tipp, getippt/gesamt. Keine Lösung und keine fremden Tipps.
  - `reveal`: Begriff, wer richtig lag und die Bildpunkte, alles vom Host (S6-NOTE: keine Formel im Client).
  - Feldnamen in Zustand und Sicht verschieden wählen. Genaue Schlüsselmengen je Phase und Rolle prüfen.
- **strokes.ts (rein):**
  - Quantisieren relativ zur quadratischen Box auf 0..255, mit Klemmung und NaN → 0.
  - Kodieren und Dekodieren. Ausdünnen (gleiche bzw. sehr nahe Punkte verwerfen).
  - Budget 600 Punkte: danach keine Tinte mehr.
  - Die Kappung nutzen Client und `parseInput` gemeinsam. Kaputte Striche werden verworfen, Übergroßes gekürzt, nie geworfen.
- **strokeCanvas:**
  - Zeichenmodus: schwarze Fläche, Leuchtpunkt `bm-dot` als DOM-Element per `transform`, kein Strich wird gemalt. Dazu `touch-action: none`, `setPointerCapture`, nur `isPrimary`. `pointercancel` beendet den Strich.
  - Anzeigemodus: `bm-canvas` mit Strichen im Akzent mit Glühen, Einzelpunkt als Punkt, DPR beachten. **Erst malen, dann `setState('gallery')`.**
  - Die quadratische Fläche passt mit 4 Optionen in 390×844 (Safe Area).
- **Rollen/Farben:**
  - Duo und Rollen kommen aus Sichtfeldern (`slots`, `drawer`), nicht aus `ctx.players().length` (S5-NOTE).
  - Akzent cyan für Rahmen und Strich, richtig `--ok`, falsch `--bad`. Kein `--hot`-Rollenpanel.
  - „Dein Kunstwerk“ erscheint ohne `choice`.
- **CONTRACT:**
  - Zustände `draw, drawn, gallery, reveal, sent`.
  - `step` ist in `draw` der Slot, sonst das Bild `j`.
  - `role` ist in Galerie und Auflösung `drawer|viewer`.
  - Nach Rot nicht abschwächen. Teständerungen nach Rot stehen im Commit-Body oder in DECISIONS (S5-MINOR).
- **Bots (`playBlindmaler`, rollengesteuert, auch für 3 Spieler):**
  - In `draw`: Kringel per `page.mouse` (down, move mit steps, up) auf der gemessenen Box, dann FERTIG.
  - Betrachter: `choice` nach Ziel- oder Meidliste, sonst die erste Option.
  - Zeichner: festhalten, dass kein `choice` da ist. Je Bild die Tinte des Canvas festhalten (Pixel ≠ Hintergrund).
  - `bm-word` enthält nur den nackten Begriff. Der Host-Bot sammelt seine Begriffe in eine geteilte Liste, die der Gast als Ziel nutzt.
- **Layout-Test (2 Seiten, ohne fast, ≤ ~12 s):**
  - Auditiert werden `draw`, `drawn` der ersten Seite vor dem zweiten FERTIG (S5-MINOR), `gallery` als Betrachter und Zeichner, dann `reveal`.
  - `sent` wird zu zweit **nicht** auditiert: Ein einzelner Betrachter löst sofort `allDone` aus (S5-Lehre).
  - Klicks mit Timeout, nichts schlucken. Ende nach der ersten Auflösung.
- **Bank (≥ 80 `{word, cat}`):**
  - Nur konkrete Dinge, die Laien blind in 10 s zeichnen können.
  - Keine Körperteile, Waffen, Alkohol, Flaggen oder Länder, keine Religionssymbole (Kreuz), keine Marken oder Personen.
  - Der Lint fängt `Kater`, `Bier`, `Wein` u. a. Andere Wörter wählen, die Liste nicht aufweichen.
  - ≥ 10 Kategorien mit je ≥ 5 Wörtern.
- **E2E-Budget:** Stand 62 Tests, 7,7 min. Erwartet ≈ 8,0 min (Duo ≈ 6 s, Layout ≈ 10 s, RM ≈ 3 s). Messen, in Review und DECISIONS notieren.

## 3. Dateien (nur Nicht-Offensichtliches)
- `src/engine/durations.ts`: `BM_DRAW`, `BM_DUO_DRAW`, `BM_SHOW`, `BM_REVEAL`
- `src/games/blindmaler/{strokes,logic,words,view}.ts` + Tests, `src/ui/strokeCanvas.ts`, `src/ui/games.css` (`bm-*`), `src/ui/motion.css` (Punkt-Puls, unter Reduced Motion aus)
- `src/games/{types,index,views}.ts`, `index.test.ts` (13er-Liste, cyan, STAGED: Host tippt richtig, Gast falsch), `conformance.test.ts` (bmCase ohne prep), `secrets.test.ts`, `purity.test.ts`
- `e2e/{contract,bots}.ts`, `e2e/duo.spec.ts` (Duo + Layout), `e2e/games.spec.ts` (RM-Zeile), `e2e/party.spec.ts`, `DECISIONS.md`

## 4. DoD
siehe Rückgabe (`dod`).

## 5. Out-of-Scope
Reload-Wiedereinstieg mitten im Zeichnen, 3-Spieler-E2E und 8-Spieler-Layout für blindmaler, eigene `drinks` (es gilt die Platz-Regel), Radierer und Farben, Korrekturen an früheren Spielen und Banken (S6-MINORs), Doku außer DECISIONS.
