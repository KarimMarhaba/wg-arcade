# paket2 — Schritt 5: `luegenbaron` + `verraeter` (Abgleich)

Master-Plan §3.3, §4.3, §5, §10 S5; P2 §1.5/§1.6. Basis `hew/paket2` @ cb44cbe (S4 + Review). Jeder Shell-Aufruf mit PATH-Export.

## 1. Abgleich (gemessen 2026-10-17)
| Master-Annahme | Befund | Korrektur |
|---|---|---|
| GAME_IDS wächst, party.spec bleibt gültig | Nachgerechnet mit `planOrder` und 10 IDs (Reihenfolge luegenbaron, verraeter): Seed 20261017 ergibt bombe, **luegenbaron, verraeter**, stopp, werwuerde. „Nochmal“ (Seed 1224702332) ergibt schaetzfuchs, werwuerde, **verraeter**, stopp, blitz. **gleichklang kommt in keinem Lauf mehr vor**. `party.spec.ts:83` (`arrayContaining([... 'gleichklang' ...])`) wird rot | `NORMAL` um beide IDs erweitern. Die played-Prüfung wird zu bombe, luegenbaron, stopp, verraeter, werwuerde, Lauf 2 prüft zusätzlich verraeter. Den Wegfall von gleichklang in DECISIONS festhalten (Folge des Pools, keine Abschwächung). Die Änderung gehört in den Red-Commit |
| `index.test` exakte Liste | Verlangt genau die 8er-Liste (`index.test.ts:22`) | Auf die 10er-Liste umstellen: Akzente hot/cyan, `drinks` undefined für beide |
| WIRES-Zeile je Spiel | Alle Payloads gehen beim selben `t` raus, wenn `play` beginnt. Bei verraeter ist dann (Phase `word`) gar keine Eingabe möglich. Bei luegenbaron kann nur der erste Erzähler etwas eingeben | Den Draht-Runner erweitern: optional gestaffelte Zeilen, die je Tick aus `p.phase.state` Payloads liefern, je Phasenschlüssel einmal. Die 8 bestehenden Zeilen bleiben unverändert. luegenbaron: Host lügt, Gast tippt WAHR, Host tippt richtig. verraeter (Duo): Host tippt nach `state` richtig, Gast falsch |
| Konformität: `first`/`finish` aus p0 bei NOW | Bei Rollenspielen kann p0 in der ersten Phase nichts eingeben. Der Test „ticked ≠ done“ braucht eine Phase, die p0 und p1 gemeinsam beenden | `prep` spult per TICK vor. luegenbaron: bis zur ersten `vote`-Phase, deren Erzähler weder p0 noch p1 ist. Gemessen: `turnOrder(77, p0..p2)` = p2, p0, p1, also k=0. verraeter: bis `vote`. Gibt es keine passende Phase (n ≤ 2 bzw. n = 1), bleibt der Zustand unverändert. Für n=3 prüft der Test, dass die Phase gefunden wurde |
| `spotlight` steht bereit (S2) | Gebaut, aber bisher ohne Verbraucher. Der FERTIG-Knopf sperrt nach dem Tipp nicht. `onDone` ist beim Anlegen fest verdrahtet | Fertig-Eingaben tragen den Zug- bzw. Erzählerindex, der Host ignoriert veraltete. Ein „gesendet“-Zustand im Baustein ist erlaubt (reversibel) |
| Secret-Harness `secrets(s, owner)` gegen **alle** x ≠ owner | Das Crew-Wort sehen die anderen Crew-Mitglieder zu Recht, verborgen ist es nur vor dem Verräter. Im Doppelgänger ist bei gleichem Wort das Wort kein Geheimnis | `SecretCase` bekommt optional `from(s, owner)` (Default: alle anderen), dazu eine eigene Fixture-Kontrolle. Bei n=2 kommt das Wort nur bei verschiedenen Wörtern in die Liste. Der Fall mit verschiedenen Wörtern muss vorkommen (Zustand prüfen, sonst ein anderer Seed) |
| Verbots-Lint deckt „Abwesende“ ab | `FORBIDDEN` hat `ex`, aber weder Eltern/Mutter/Vater noch Drogen/Polizei/Waffe | Für topics über `forbid` ergänzen (eltern, mutter, vater, oma, opa, drogen…, polizei…, waffe…). Die globale Liste bleibt unverändert |
| Idle ≤ maxMs | luegenbaron 2 × (8+30+8+4) = 100 s, verraeter n=4/8: 6+40+15+12+10+4 = 87 s, Duo: 6+24+12+4 = 46 s. Bei v=10 alle < 13,5 s | Wie S4 **keine GRACE je Phase** (bei 8+ Phasen läge v=10 sonst über maxMs) |

Das passt schon: `turnOrder`, `pickDistinct`, `tally`/`leaders` (leer bei 0 Stimmen ⇒ nicht enttarnt), `enter`/`due`, `namePicker(self:false)`, `choicePad`, `counter`, `voteBars`, `drive` (einmal je state/step/role), Purity-Glob, die Tokens `--hot` und `--on-accent`. Die Flush-Schleife des Hosts (`host.ts:62`) schickt jede Phase mindestens einmal.

## 2. Entscheidungen & Fallen
- **luegenbaron (reversibel, in DECISIONS):**
  - Erzähler sind die ersten min(2, n) aus `turnOrder`. Duo: beide, n=1: einer.
  - `card` läuft immer volle 8 s (Denkzeit). Die Wahl WAHR/ERFINDEN gilt einmal und endgültig. „Andere Karte“ geht einmal je Erzähler und nur vor der Wahl, das Ersatzthema ist bei `init` aus dem Seed fixiert. Fehlt die Wahl, setzt das Ende von `card` den Seed-Default.
  - **Der Erzähler sieht in `tell` und `vote` immer seinen Modus, auch den vom Seed gewählten.**
  - Tipps geben nur Zuhörer ab, nur in `vote`, einmal. `allDone` gilt über die Online-Zuhörer.
  - Wer nicht tippt, gilt nicht als getäuscht. Ein Erzähler ohne eigene Eingabe bekommt keinen result-Eintrag, auch wenn er Zuhörer getäuscht hat (§1.4).
- **verraeter (reversibel, in DECISIONS):**
  - Verräter und Sprechreihenfolge kommen aus unabhängigen Zügen desselben RNG. **Der Verräter darf nicht an einer festen Stelle der Reihenfolge stehen** (Unit: über Seeds variiert seine Position).
  - `data-role` bleibt die ganze Runde `traitor|crew`, `data-step` = Zugindex in `round`.
  - Enttarnt ist der Verräter nur, wenn er allein die meisten Stimmen hat. Die 6 Optionen (Wort und 5 Köder) werden beim Wechsel nach `guess` seed-gemischt im Zustand fixiert, die Eingabe ist ein Index.
  - Doppelgänger: Die Tipp-Phase heißt ebenfalls `vote` (12 s, `btn-same`/`btn-diff`), danach `sent`. So passt ein CONTRACT für das Duo, und der 3er-Test ergänzt nur `talk` und `guess`.
  - Offline-Sprecher werden nicht übersprungen, die Deadline reicht.
- **Geheimnisse (S3-NOTE):** Die Secret-Fälle nennen rohe Zustandsfragmente, z. B. den Schlüssel des Wahrheitsfelds mit Doppelpunkt, die pid-Map der Tipps, den Verräter-Schlüssel, `"same`, das Wort in Großbuchstaben. Dazu kommen Logik-Tests mit **genauen Schlüsselmengen** der Zuhörer-, Crew- und Verräter-Sichten **je Phase vor der Auflösung**.
  - Verräter-Sicht vor `guess`: kein Wort, kein `pair`, keine Köder.
  - Feldnamen so wählen, dass Fragmente eindeutig sind: Ein Tippwert `"truth"` darf nicht mit dem Zustandsschlüssel `"truth":` kollidieren.
- **Anzeige = Host (S4-MINOR):** Punkte und Urteile („richtig“, „enttarnt“, „gleich/verschieden“) kommen nur aus der Sicht. Es gibt keine lokale Ableitung und keinen lokalen Endzustand, der späte Sichten ignoriert.
- **CONTRACT nicht nach Rot abschwächen (S4-MINOR):** luegenbaron `card, reveal, sent, tell, vote`, verraeter (Duo) `reveal, round, sent, vote, word`, 3er zusätzlich `guess, talk`. Alle sind bei fast auf beiden Seiten sicher erreichbar. Muss sich doch etwas ändern: DECISIONS-Eintrag, und es zählt als Finding.
- **Bots:** Ohne `data-step` = k würde `drive` beim zweiten Erzähler nicht mehr handeln.
  - playLuegenbaron: Erzähler `btn-lie` in `card`, `btn-done` in `tell`. Zuhörer `choice[0]` (WAHR).
  - playVerraeter: `btn-done`, wenn er sichtbar ist. In `vote` `pick[0]` oder `o.accuse`. In `guess` `choice[0]`. Doppelgänger nach `o.bias` (0 = gleich, 1 = verschieden).
  - Der Duo-Bot tauscht nicht, „Andere Karte“ prüft der Layout-Test ohne fast.
- **3er-Test:** Der Test liest vor dem Bot-Start `data-role` aller Seiten und gibt den Crew-Bots den Namen des Verräters mit. So ist `guess` sicher erreicht und hängt nicht vom Seed-Glück ab.
- **Banken:** Der Verbots-Lint meldet `Kater`, `Wein`, `Bier`. Solche Wörter meiden statt die Liste aufzuweichen (S3-NOTE).
  - topics ≤ 60 Zeichen, damit die Kartenphase mit drei Knöpfen passt.
  - Wörter, `pair`, Köder und `cat` ≤ 18 Zeichen.
- **E2E-Budget:** Stand 52 Tests, 6,0 min. Die Layout-Tests enden nach der ersten Auflösung und warten keine zweite Runde ab. Die Dauer ins Review und in DECISIONS.
- **TDD:** ein Red-Commit mit Logik-, Bank-, Konformitäts-, Secret-, Index-/WIRES-, party.spec- und E2E-Änderungen, der rote Stand im Commit-Body.

## 3. Dateien (nur Nicht-Offensichtliches)
- `src/engine/durations.ts`: `LB_CARD/TELL/VOTE/REVEAL`, `VR_WORD/TURN/TALK/VOTE/GUESS/REVEAL/DUO_TURN`
- `src/games/secrets.test.ts`: `from`
- `src/games/index.test.ts`: gestaffelte Wires
- `e2e/contract.ts`, `e2e/bots.ts`: `RoundOpts.bias`/`accuse`
- `e2e/duo.spec.ts`: Duo kommt automatisch über `LABEL`, dazu der 3er-Test und 2 Layout-Tests
- `e2e/party.spec.ts`
- `src/ui/games.css`: Rollenkarte vollflächig `--hot` mit Hinweis „Handy nicht zeigen“, Themenkarte

## 4. DoD
siehe Rückgabe (`dod`).

## 5. Out-of-Scope
Reconnect-E2E für die neuen Spiele, 8-Spieler-Layout, Überspringen von Offline-Sprechern, eigene `drinks` (es gilt die Platz-Regel), `isPlan`-Export, Korrekturen an bombe/stopp, Doku außer DECISIONS.
