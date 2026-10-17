# mvp — Schritt 2: Netz-Fundament (Abgleich)

Master-Plan §3.1, §3.2, §3.6, §7.1, §9 D-1, §10 Schritt 2. Basis `hew/mvp` @ dc42f21 (Schritt 1, 10 Unit-Tests grün).
Jeder Shell-Aufruf: `export PATH="$HOME/.local/share/herdr-web-ui/node/bin:$PATH"`.

## 1. Abgleich (gemessen 2026-10-17)
| Annahme | Befund | Korrektur |
|---|---|---|
| `GameId` „vorerst“ in `games/types.ts` anlegen | existiert schon (`GAME_IDS`, Schritt 1) | nur `import type` |
| vorläufige `src/engine/view.ts` | `src/engine/` fehlt noch | gleich vollständig nach §3.6 (nur Typen), Schritt 3 baut sie nicht um |
| Node-`BroadcastChannel` unit-testbar | stimmt: Zustellung an alle anderen Instanzen im Prozess, nicht an den Sender, Reihenfolge je Sender bleibt, asynchron über den Event-Loop (keine Microtask) | – |
| „Channel hält den Prozess offen“ | stimmt, auch ohne Listener. `postMessage` nach `close` **wirft** `InvalidStateError` | jeder Abbaupfad schließt seinen Channel; `send` nach `close` bricht vorher ab |
| Host-`pagehide` | in Node ist `globalThis.addEventListener` `undefined` | nur registrieren, wenn vorhanden; bei `close` abmelden |
| Vitest-Pool | Default `forks` (5.0.5), kein Übersprechen zwischen Dateien | trotzdem je Test eigener Code und Aufräumen in `afterEach` (ein übrig gebliebener Host antwortet sonst auf `syn`) |
| DoD „`local` lädt kein peerjs, im Build sichtbar“ | nicht prüfbar: `app.ts`/`main.ts` importieren `src/net` noch nicht, der Build enthält kein Netz | Unit-Test mit `vi.mock('./peer')`. Die Chunk-Prüfung im Build gehört in Schritt 5 (erster Import in `app.ts`) |
| Peer „nur Typprüfung“ | Design §8 verbietet nur Tests gegen den **echten** Broker | `peer.test.ts` mit gefälschtem `peerjs`-Modul (kein Netz) |
| PeerJS 1.5.5 API | `unavailable-id`, `peer-unavailable`, `reconnect()`, `destroyed`, `close({flush})` vorhanden. `reliable:true` setzt `ordered` am DataChannel | – |
| Serialisierung | Default = BinaryPack, stückelt ab 16 300 B. `json` verwirft große Nachrichten, `raw` wird Firefox→Chrome bei 16 KB abgeschnitten | nichts setzen; Strings kommen als String an |
| `dc.close()` | räumt sofort die RTCPeerConnection ab. Ein direkt davor gesendetes `reject` kann verloren gehen | `dc.close({flush:true})`, lokal sofort als geschlossen behandeln, harter `close()` nach ~1 s als Nachzügler |
| peerjs in Node | ESM-Import liefert nur `default` (CJS-Interop), Vite nimmt `bundler.mjs` | im Code `import { Peer } from 'peerjs'`; Unit-Tests laden peerjs nie echt (Mock) |

## 2. Entscheidungen & Fallen
- **Zustellung vor Abbau (alle Transporte):** Nach `send(x); close()` kommt `x` auf der Gegenseite **vor** deren `onClose` an, weil der Host `reject` schickt und sofort schließt (§3.7).
  Loopback stellt das Close-Signal über dieselbe Microtask-Kette hinter die Daten, Local schickt `fin` nach `d`. Nachrichten an eine schon geschlossene Seite werden verworfen.
- **Kein Puffer, kein Nachfeuern:** Wer eine Conn bekommt, meldet `onMessage`/`onClose` synchron an. Der Local-Host feuert `onConnection` **vor** dem `ack`, damit das erste `hello` ankommt. Nach `close` werden alle Listener verworfen. `emit` iteriert über eine Kopie.
- `close` ist idempotent, `onClose` feuert je Seite genau einmal, auch wenn beide Seiten gleichzeitig schließen. Ein empfangenes `fin` schließt lokal ohne Antwort-`fin`.
- **Local-Join:** Den Timer bei `ack` löschen. Ein später feuernder Timer darf keine bestehende Verbindung schließen. Bei Timeout den Channel schließen und mit `Error('noroom')` ablehnen.
  Doppeltes `syn` mit gleicher `cid` → erneut `ack`, aber keine zweite Conn. Ignorieren: `ack` mit fremder `cid`, `syn` bei Clients, `d` mit unbekannter `cid` oder falschem `dir`, Umschläge ohne String-`m`.
- **Peer:**
  - Host-`host()` liefert immer ein Ergebnis: `unavailable-id` → `Error('taken')`, andere Fehler vor `open` → Error mit dem PeerJS-Typ, nach 10 s → `Error('timeout')`. Bei Misserfolg `peer.destroy()`.
  - `disconnected` → `reconnect()`, nur wenn der Peer nicht `destroyed` ist.
  - Client: auf Peer-`open` warten, dann `connect(…,{reliable:true})`. 10 s gesamt, sonst `destroy()`. `close` beim Client zerstört auch den Peer.
  - `send` geht nur auf einen offenen Kanal (PeerJS meldet sonst `not-open-yet`).
- **Protokoll (reversibel festgelegt):**
  - 16 KB bedeutet `raw.length ≤ 16384`.
  - Die Parser bauen **neue** Objekte nur mit bekannten Feldern.
  - `name` darf leer sein, sonst kann die Engine nie `badname` antworten.
  - `input` braucht den Schlüssel `payload`; jeder JSON-Wert ist erlaubt, auch `null`.
  - `view.now` ist eine endliche Zahl (D-1). `view` ist ein Objekt (kein Array) mit String-`s`; der Wert von `s` wird nicht gegen eine Liste geprüft.
  - `welcome.pid` folgt der Regex von `hello.pid`. `v` ist exakt die Zahl 1.
- **Raumcode:** `normalizeCode` entfernt **alle** Whitespaces (auch innen), schreibt groß und prüft dann „genau 4 Zeichen aus ALPHABET“. `newCode` = `floor(rand()*24)`, `rand()` knapp unter 1 ergibt `Z`.
- **Tests ohne Schlafen:**
  - Local wartet auf Ereignis-Promises (z. B. auf die erste Nachricht), nie auf eine feste Zeit.
  - Negativbeweis „B sieht As Nachricht nicht“: Der Host schickt erst an A, dann an B. Die **erste** Nachricht bei B muss die eigene sein.
  - `noroom`, „Timer nach `ack` harmlos“ und die Peer-Timeouts laufen mit `vi.useFakeTimers({toFake:['setTimeout','clearTimeout']})`.
  - Fuzz ist deterministisch: ein kleiner geseedeter Generator im Test (`prng.ts` kommt erst in Schritt 3). Er erzeugt Zufallsstrings **und** gültige Nachrichten mit je einem falsch getypten Feld.
- **Commits (Lehren aus Schritt 1):**
  - Der Test-Commit enthält nur `*.test.ts`, keinen Stub und keine `view.ts`. Er ist rot, weil die Module fehlen.
  - Die rote und die grüne Vitest-Zusammenfassung stehen jeweils im Commit-Body.
  - Jeder Nicht-Test-Commit ist für sich lint- und unit-grün: entweder ein einziger Impl-Commit oder strikt Paare je Modul. Der Smoke bleibt unverändert.
- `DECISIONS.md`: D-1 datiert anhängen. Die Festlegungen oben sind Umsetzungsdetails und kommen nicht hinein.

## 3. Dateien (nur Nicht-Offensichtliches)
- Zusätzlich zur Liste im Master-Plan: `src/net/transport.test.ts` (Lazy-Load) und `src/net/peer.test.ts` (Fake-`peerjs` per `vi.mock`, Fake-Peer/-DataConnection mit `on`/`emit`).
- `src/engine/view.ts`: nur die Typen aus §3.6. `HostMsg` mit `t:'view'` ist über `View` typisiert.

## 4. DoD
1. `code.test.ts`: `newCode` gibt bei 1000 Codes mit fester `rand`-Folge nur 4 Zeichen aus dem Alphabet aus (`rand` 0 → `A`, knapp 1 → `Z`). `normalizeCode(' ab cd ')` ergibt `ABCD`; I/O, falsche Länge und fremde Zeichen ergeben `null`.
2. `protocol.test.ts`, Hin- und Rückweg: Alle 7 Nachrichtentypen (inkl. `view` mit `now`) überstehen `encode` → `parse*` unverändert, Zusatzfelder fallen weg, ein leerer Name wird angenommen.
3. `protocol.test.ts`, kaputte Eingaben → `null`, nie eine Exception:
   - Nicht-String, kein JSON, Nicht-Objekt, `v` ≠ 1, unbekanntes `t`, fehlende oder falsch getypte Felder
   - `pid` mit 7 oder 65 Zeichen (8 und 64 gültig), `round` −1 oder 1.5, unbekannter `reason`, `view` ohne String-`s`, `now` nicht endlich
   - 16385 Zeichen (16384 gültig)
   - je Parser ≥ 200 deterministische Fuzz-Eingaben
4. `loopback.test.ts`: Die Zustellung läuft in beiden Richtungen asynchron und in Reihenfolge. `close` auf einer Seite löst `onClose` auf beiden Seiten genau einmal aus, auch bei doppeltem `close`. `send` nach `close` ist ein No-op. Eine vor `close` gesendete Nachricht kommt vor dem `onClose` der Gegenseite an.
5. `local.test.ts`, mit echtem `BroadcastChannel`, Host und 2 Clients: Nachrichten sind in beiden Richtungen nach `cid` getrennt. Client-`close` → Host-Conn-`onClose`, Endpoint-`close()` → `onClose` bei allen Clients. Nach `send(x); close()` wird `x` vor dem `onClose` zugestellt.
6. `local.test.ts`, Join mit Fake-Timer: Ein unbekannter Code ergibt `Error('noroom')`, und der Client-Channel wird geschlossen. Nach erfolgreichem Join richtet der abgelaufene Timeout nichts an, die Verbindung funktioniert weiter.
7. `transport.test.ts`: `createTransport('local')` lädt `./peer` nie, `createTransport('peer')` lädt es per dynamischem Import. `transport.ts` importiert weder `./peer` noch `peerjs` statisch.
8. `peer.test.ts` (Fake-`peerjs`, kein Netz): `unavailable-id` → `taken`, `peer-unavailable` → `noroom`, nach 10 s → `timeout`, jeweils mit `destroy()`. Daten, die kein String sind, werden verworfen. Nach `disconnected` folgt `reconnect()`. `close` nutzt `flush`.
9. `src/engine/view.ts` enthält die View-Typen nach §3.6. `DECISIONS.md` hat den datierten Eintrag D-1 („`view` trägt `now`“).
10. TDD: tests written first (separate test-commit before impl), meaningfully cover the change, red→green captured

## 5. Out-of-Scope
`client.ts`, `host.ts`, `prng.ts` (Schritt 3/5). Chunk-Prüfung im Build (Schritt 5). Test gegen den echten Broker (WG-Test). UI- und E2E-Änderungen. Die `?dev`-Testlücke aus Schritt 1 darf als einzelner Testfall mitgenommen werden, gehört aber nicht zur DoD.
