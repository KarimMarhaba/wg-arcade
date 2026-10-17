# paket2 — Schritt 6: `pokerface` + `erklaerbaer` (Abgleich)

Master-Plan §1.4, §3.3, §4, §5, §6.1, §10 S6; P2 §1.7/§1.8. Basis `hew/paket2` @ 913399d (S5 + Review). Jeder Shell-Aufruf mit PATH-Export.

## 1. Abgleich (gemessen 2026-10-17)
| Master-Annahme | Befund | Korrektur |
|---|---|---|
| party.spec bleibt mit Seed 20261017 gültig | Mit 12 IDs (pokerface, erklaerbaer am Ende) liefert `planOrder` für Lauf 1 hammer, **pokerface**, bombe, luegenbaron, stopp. Für Lauf 2 („Nochmal“, Seed 1224702332) kommt werwuerde, gleichklang, luegenbaron, **erklaerbaer**, hammer. **verraeter kommt in keinem Lauf mehr vor.** `party.spec.ts:83` und `:116` werden rot | `NORMAL` um beide IDs erweitern. Beide Läufe prüfen die **genaue** Spielliste per `toEqual` (S5-MINOR: keine Prüfung ersetzen). Beide neuen Spiele laufen dann mit 3 Spielern. Wegfall von verraeter in DECISIONS (Pool-Folge). Gehört in den Red-Commit |
| §1.4 Teilnahme gilt unverändert | Rater bei erklaerbaer geben laut P2 **nichts** ein. Ab 4 Spielern gibt es Spieler, die weder erklären noch wachen. Sie hätten nie einen result-Eintrag und immer 0 Punkte, egal wie viel sie erraten | **Entscheidung (reversibel, DECISIONS als Ausnahme zu D-P2-5):** Wer als Treffer gutgeschrieben wird, bekommt einen result-Eintrag. Die Gutschrift ist eine Menschen-Eingabe des Erklärers, kein Seed-Default. Sonst gilt §1.4 |
| Konformität `ticked ≠ done` | erklaerbaer hat in `explain` kein `allDone` | Kein Umbau am Harness. Weg: SKIP zieht 3 s von `endsAt` ab. `finish(p0)` sind 12 Skips mit fortlaufendem Kartenindex, die die 35 s aufbrauchen. So endet der Zug beim nächsten Tick. Gemessen: `turnOrder(77, p0..p2)` = p2, p0, p1, also erklärt p0 bei k=1, Wächter p1. `prep` spult dorthin, für n=3 prüft ein Test, dass die Phase gefunden wurde. pokerface: `prep` bis `talk`, `first`/`finish` = ERLEDIGT, `allDone` beendet `talk` |
| `ringNext`, `pickDistinct`, `enter`/`due`, `namePicker`, `choicePad` sind da | Stimmt. `choicePad` setzt bei 4 Optionen automatisch 2 Spalten (`opts.length > 3`) | pokerface: `cols: 1`, damit die Missionstexte (≤ 80 Zeichen) lesbar umbrechen |
| Zeitbalken bei SKIP | `timerBar` rechnet `from = Rest / dur` | Bei SKIP nur `endsAt` verschieben, `dur` bleibt (nicht `enter()`). Dann wird der Balken richtig kürzer |
| Idle ≤ maxMs | pokerface 6+55+18+6 = 85 s. erklaerbaer 2 × (35+4) = 78 s. Bei v=10 beide < 13,5 s | Wie S4/S5 **keine GRACE je Phase** |

## 2. Entscheidungen & Fallen
- **pokerface (reversibel, DECISIONS):**
  - Ring = `turnOrder`, Ziel = `ringNext`. Die Sicht nennt in `mission` und `talk` nur das **eigene Ziel**, nicht den eigenen Rater und nicht den Ring.
  - `mission(6) → talk(55) → guess(18) → reveal(6)`:
    - ERLEDIGT geht nur in `talk` und einmal. Gespeichert wird nur ein Boolean ohne Zeitpunkt („ohne die Zeit“). `allDone` beendet `talk`.
    - In `guess` tippt jeder einmal einen Index aus 4 Optionen. `allDone` beendet `guess`.
    - n=1: kein `guess`, erledigt = 3.
  - Pro Runde zieht `pickDistinct` n Missionen und 3n Köder, **alle verschieden**. Ein Köder darf nie die Mission eines Mitspielers sein, sonst steckt sie in fremden Optionen.
  - Die Optionen werden seed-gemischt im Zustand fixiert. Die Position der richtigen Option variiert über Seeds (Unit).
  - Wertung: erledigt und nicht erraten 3, erledigt und erraten 1, richtig geraten +2. Die +2 gibt es auch, wenn das Ziel nicht erledigt hat.
- **erklaerbaer (reversibel, DECISIONS):**
  - Erklärer sind die ersten min(2, n) aus `turnOrder`. Wächter = `ringNext`, nur ab n ≥ 3. Je Erklärer `explain(35) → reveal(4)`. `reveal` zeigt die Begriffe dieses Zugs.
  - Das Deck ist der seed-gemischte Index der ganzen Bank. Der zweite Erklärer macht dort weiter, wo der erste aufgehört hat. Ist das Deck leer, endet der Zug, ohne zu werfen.
  - Eingaben `hit`/`skip`/`taboo` tragen `k` und die Kartenposition. Veraltete Eingaben (Wächter und Erklärer auf derselben Karte) werden ignoriert.
  - `hit` nennt einen Rater (≠ Erklärer, ≠ Wächter): Erklärer +2, Rater +1. Zu zweit sendet der Client ihn automatisch. n=1: Treffer ohne Rater, nur +2.
  - `taboo` gibt −1 und überspringt die Karte. Ab 3 Spielern kommt es nur vom Wächter, zu zweit nur vom Erklärer.
  - Picker erst ab n=3, wie in P2 (zu zweit automatisch). Bei n=3 zeigt er genau einen Namen und deckt `pick` im 3er-E2E ab.
  - Label `−n Pkt` mit echtem Minus wie farbfalle. LABEL-Regex `/^−?\d+ Pkt$/`.
  - Mime-Karten haben auch `taboo[3]` (P2-Pflichtfeld). Die Sicht zeigt statt der Tabuwörter „🤫 NUR PANTOMIME“.
- **Geheimnisse:**
  - Die Bank liegt im Client-Bundle. Ein **Bankindex** in einer Sicht ist so gut wie der Text selbst: weder `deck[idx]` noch Missionsindizes, auch nicht beim Erklärer für Folgekarten.
  - Feldnamen in Zustand und Sicht verschieden wählen, damit Fragmente eindeutig sind (S5).
  - Logik-Tests mit **genauen Schlüsselmengen** je Rolle und Phase vor der Auflösung.
  - pokerface braucht zwei Secret-Fälle:
    - Missionstext: In `guess` ist der Rater des Besitzers über `from` ausgenommen.
    - ERLEDIGT-Status und Tipps: geprüft gegen alle anderen.
  - erklaerbaer: Begriff und Tabus mit `from` = Rater. Unit-Test: Keine Sicht enthält die nächste Karte.
- **Anzeige = Host (S4-MINOR):**
  - Treffer, Tabus und Punkte kommen nur aus der Sicht.
  - Der lokale Picker schließt, sobald sich Kartenposition oder Phase der Sicht ändern.
  - Auto-Modus und Rollen kommen aus Sichtfeldern, nicht aus `ctx.players().length` (S5-NOTE).
- **Texte (S4-NOTEs):** „1 Treffer“/„0 Treffer“ und Minuspunkte sauber formulieren. aria-Labels müssen genau stimmen. Tabuwörter in `--bad` (P2 „rot“), Wächter-Markierung und TABU! in `--warn` (§7). Die Missionskarte bleibt neutral gefärbt (S5-NOTE Rollenfarben).
- **Bots (rollengesteuert, auch für 3 Spieler in party.spec):**
  - Zwischen zwei Aktionen auf ein Sicht-Attribut warten (Kartenposition, Trefferzahl), kein Sleep.
  - playPokerface: ERLEDIGT in `talk`, in `guess` die Option nach `o.aim`, sonst die erste ≠ `o.avoid`, sonst `choice[0]`.
  - playErklaerbaer:
    - Erklärer: 1 Treffer. Zu zweit danach bias 0 → zweiter Treffer, bias 1 → TABU.
    - Wächter: wartet auf Treffer = 1, dann TABU.
    - `pf-mission` enthält nur den nackten Text, damit der Test vergleichen kann.
- **Tests nach Rot (S5-MINOR):** Jede Teständerung im Impl-Commit steht im Commit-Body oder in DECISIONS. CONTRACT (pokerface `guess, mission, reveal, sent, talk`, erklaerbaer `explain, reveal`) nicht abschwächen.
- **Layout-Tests (S5-MINOR/NOTE):**
  - `sent` auditieren, bevor die zweite Seite tippt.
  - Keine Klickfehler schlucken.
  - Phasen abkürzen statt abwarten: ERLEDIGT bzw. `allDone`, erklaerbaer per Skip-Drain bis `reveal`. Ende nach der ersten Auflösung.
- **Banken:**
  - Der Lint meldet `krank…`, `dick`, `fett`, `Kater`, `Bier`, `Gott` auch in Tabuwörtern. Andere Wörter wählen, die Liste nicht aufweichen.
  - Tabus: 3 verschieden, ≠ Begriff, per `norm` in keiner Richtung Teilwort.
  - Mime ≥ 40 und Anteil ≤ 40 %.
  - Missionen: hör- oder sichtbar im Gespräch, zu jedem Thema machbar, ohne Anfassen und ohne Bloßstellen, nicht trivial auffällig.
  - Themen: für jede Gruppe tauglich, keine vorausgesetzte Erfahrung (S5-MINOR).
- **E2E-Budget:** Stand 57 Tests, 6,8 min. Erwartet ≈ 7,6 min. Hochgerechnet liegen die Schritte 7–12 sonst über 9 min. Deshalb neue Layout-Tests je ≤ ~12 s. Dauer in Review und DECISIONS.

## 3. Dateien (nur Nicht-Offensichtliches)
- `src/engine/durations.ts`: `PF_MISSION/TALK/GUESS/REVEAL`, `EB_TURN/SKIP/REVEAL`
- `src/games/conformance.test.ts`: pfCase/ebCase mit prep, Rollenspiel-Block erweitern
- `src/games/index.test.ts`: genaue 12er-Liste, Akzente lime/orange, `STAGED` (pokerface: Host rät richtig, Gast falsch; erklaerbaer: Host 2 Treffer, Gast 1 Tabu)
- `e2e/contract.ts`, `e2e/bots.ts` (`RoundOpts.aim/avoid`), `e2e/duo.spec.ts`, `e2e/party.spec.ts`
- `src/ui/games.css`: `pf-*`, `eb-*`

## 4. DoD
siehe Rückgabe (`dod`).

## 5. Out-of-Scope
Reconnect-E2E und 8-Spieler-Layout der neuen Spiele, eigene `drinks` (Platz-Regel gilt), Rundengedächtnis für Erklärer, Korrekturen an früheren Spielen und Banken, Doku außer DECISIONS.
