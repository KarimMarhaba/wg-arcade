# WG·ARCADE — Master-Plan MVP

Stand 2026-10-17 · Branch `hew/mvp` · Bau-Wahrheit: `docs/design/design.md` (im Folgenden „Design“).
Dieser Plan konkretisiert das Design. Wo er es erweitert oder auslegt, steht das in §9 und muss im jeweiligen
Schritt in `DECISIONS.md` eingetragen werden (append-only, datiert, „Was + Warum“).

Jeder Shell-Aufruf beginnt mit `export PATH="$HOME/.local/share/herdr-web-ui/node/bin:$PATH"`.
Umgebung geprüft: Node 22.23, npm 10.9, `uname -m` = `aarch64`, `~/.cache/ms-playwright/{chromium-1243,chromium_headless_shell-1243}`
vorhanden, `~/.local/share/paime-chromium-libs/{root/usr/lib/aarch64-linux-gnu,fonts.conf}` vorhanden.

---

## 0. Leitplanken

- Der Host ist autoritativ und rein: Die Engine und die Spiellogik bekommen `now` und Seeds hereingereicht und lesen nie selbst Uhr, Zufall oder DOM. Nur `src/engine/host.ts` (Laufzeit) und die UI sind „unrein“.
- Clients sind dünn. Sie rendern die Sicht, die der Host für genau diesen Spieler schickt. Zeitkritisches messen sie lokal mit `performance.now()` und melden nur Ergebnisse.
- Der Host ist selbst Spieler, aber ohne Netz: Seine Host-Seite betreibt die Host-Laufzeit und zusätzlich eine normale Client-Sitzung, verbunden über einen In-Process-Loopback-`Conn`. Es gibt genau einen UI-Codepfad für alle Spieler.
- Keine echten Timer in Unit-Tests (Fake-Uhr bzw. injizierte Scheduler). Kein `sleep`.
- Kein UI-Framework. Vanilla-DOM mit einem kleinen `h()`-Helfer. Alle Maße und Farben kommen aus `src/ui/tokens.css`.
- Gates nach jedem Schritt grün: `npm test` (= unit + e2e) und `npm run lint` (= `tsc --noEmit` über `src`, `e2e` und die Configs).

## 1. Stack & Versionen

| Paket | Rolle | Version |
|---|---|---|
| `vite` | Build/Dev/Preview | aktuell (8.x) |
| `typescript` | Lint (`tsc --noEmit`) | aktuell (7.x). Falls `tsc` dort Probleme macht: `^5.9` pinnen und in DECISIONS festhalten |
| `vitest` | Unit-Tests (Node-Umgebung) | aktuell (5.x, peer vite ^8 ok) |
| `@playwright/test` | E2E | **genau `1.63.0`** (ohne `^`) |
| `@types/node` | Typen für Configs/Tests | dev |
| `peerjs` | WebRTC-Transport | 1.5.x |
| `qrcode` + `@types/qrcode` | QR als SVG-String | 1.5.x |
| `@fontsource-variable/bricolage-grotesque` | Display-Schrift (Breitenachse für „kondensiert“) | 5.x |
| `@fontsource-variable/space-grotesk` | Text-Schrift | 5.x |

`package.json` hat `"type": "module"` und `"private": true`. Die Skripte sind Vertrag:

```json
"dev": "vite",
"build": "vite build",
"preview": "vite preview",
"test": "npm run test:unit && npm run test:e2e",
"test:unit": "vitest run",
"test:e2e": "playwright test",
"lint": "tsc --noEmit"
```

## 2. Modul- und Dateischnitt

```
index.html                     Viewport (viewport-fit=cover), theme-color #0c0b10, <div id="app">
vite.config.ts                 base '/wg-arcade/'
vitest.config.ts               include src/**/*.test.ts, environment node
playwright.config.ts           freier Port, vite preview, Chromium headless shell, Lib-Env
tsconfig.json                  strict, noUncheckedIndexedAccess, moduleResolution bundler, include src e2e *.config.ts
.github/workflows/pages.yml
public/favicon.svg
src/
  main.ts                      Schriften + CSS importieren, startApp(#app)
  app.ts                       Hash-Router, Screen-Wechsel, App-Kontext (flags, sfx, storage)
  config.ts                    parseFlags(search) -> Flags {net, dev, fast, speed, only?}
  net/
    code.ts                    ALPHABET, newCode(rand), normalizeCode(input)
    protocol.ts                Nachrichtentypen v1, parseClient/parseHost, encode
    transport.ts               Conn, HostEndpoint, Transport, createTransport(kind)
    emitter.ts                 winziger Listener-Helfer (on/emit/clear)
    loopback.ts                createLoopbackPair() -> [hostSide, clientSide]
    local.ts                   BroadcastChannel-Transport
    peer.ts                    PeerJS-Transport (nur per dynamischem import geladen)
    client.ts                  Client-Sitzung: hello, ping, Watchdog, Reconnect, Uhr-Offset
  engine/
    prng.ts                    mulberry32, mix32, int, pick, shuffle, randomSeed (einziges crypto)
    durations.ts               Basisdauern + scale(ms, speed)
    types.ts                   Party, Player, Phase, RoundRecord, HostAction
    view.ts                    View-Typen (Host<->Client geteilt, nur Typen + kleine Helfer)
    rounds.ts                  planOrder(seed, n, ids)
    scoring.ts                 rank(results, pids, online) -> places/points
    party.ts                   createEngine(registry) -> reine Reducer + viewFor
    host.ts                    Host-Laufzeit (Transport, Tick-Schleife, View-Diffing, Loopback-Host-Spieler)
  games/
    types.ts                   GameDef, PlayerRef, GameCtx, ViewCtx, Mounted, GameViewModule
    index.ts                   GAMES-Registry (Logik)
    views.ts                   VIEWS-Registry (Client-Darstellung) + Fallback
    blitz/{logic.ts,logic.test.ts,view.ts}
    hammer/{logic.ts,logic.test.ts,view.ts}
    farbfalle/{logic.ts,logic.test.ts,view.ts}
    schaetzfuchs/{logic.ts,logic.test.ts,view.ts,questions.ts,questions.test.ts}
  ui/
    tokens.css  base.css  components.css  motion.css
    dom.ts                     h(), clear(), on() (Auto-Abmeldung), qs()
    components.ts              button, panel, playerBadge, shapeSvg, codeBoxes, segmented, timerBar,
                               countdown, scoreRow, banner, muteToggle, screenFrame
    palette.ts                 8 Spielerfarben {hex, name, shape} + Spiel-Signaturfarben
    qr.ts                      qrSvg(url) via qrcode.toString({type:'svg'})
    sfx.ts                     WebAudio-Synth, mute in localStorage
    haptics.ts                 buzz(pattern) mit Feature-Check
    wakelock.ts                acquire/release + visibilitychange
    confetti.ts                Canvas-Konfetti (rAF, endet selbst, reduced-motion-aware)
    fx.ts                      punch(el), floatText(el, txt), reducedMotion()
    screens/
      start.ts  name.ts  party.ts (View-Dispatcher)  lobby.ts  intro.ts  game.ts
      result.ts  podium.ts  lost.ts
e2e/
  helpers.ts                   url(), openHost(), joinClient(), screen(), readCode()
  bots.ts                      playBlitz/Hammer/Farbfalle/Schaetzfuchs, playRound(page)
  smoke.spec.ts  lobby.spec.ts  screens.spec.ts  games.spec.ts  party.spec.ts  reconnect.spec.ts
```

Tests liegen neben dem Code (`*.test.ts`), E2E-Tests in `e2e/`.

## 3. Zentrale Typen

### 3.1 Transport / Conn (`src/net/transport.ts`)

```ts
export interface Conn {
  send(data: string): void;              // nach close: No-op
  onMessage(fn: (data: string) => void): () => void;
  onClose(fn: () => void): () => void;
  close(): void;                          // idempotent, löst onClose genau einmal aus (beide Seiten)
}
export interface HostEndpoint {
  readonly code: string;
  onConnection(fn: (c: Conn) => void): () => void;
  close(): void;
}
export interface Transport {
  host(code: string): Promise<HostEndpoint>;          // reject Error('taken') bei belegtem Code
  join(code: string, timeoutMs?: number): Promise<Conn>; // reject Error('noroom') / Error('timeout')
}
export type NetKind = 'peer' | 'local';
export async function createTransport(kind: NetKind): Promise<Transport>; // 'peer' -> await import('./peer')
```

**loopback.ts:** `createLoopbackPair(): [Conn, Conn]`. Die Zustellung läuft asynchron per `queueMicrotask`, damit sie dieselbe Semantik wie das Netz hat. `close` auf einer Seite schließt beide.

**local.ts (BroadcastChannel `wgarcade-<CODE>`):** Umschlag `{k, cid, dir?, m?}`.
- Client: `cid = crypto.randomUUID()`, sendet `{k:'syn',cid}` und wartet bis `timeoutMs` (Default 3000) auf `{k:'ack',cid}`, sonst `Error('noroom')`.
- Daten: `{k:'d',cid,dir:'c2h'|'h2c',m}`. Abbau: `{k:'fin',cid,dir}`.
- Jeder Teilnehmer filtert nach `cid` und `dir`, weil der Channel an alle anderen Kontexte sendet.
- Host: Bei `pagehide` sendet er best-effort `fin` an alle offenen `cid`s.
- Code-Kollision im Local-Modus wird ignoriert (ein Browser, 4 Zeichen).
- Läuft auch in Node 22 (`BroadcastChannel` ist global), ist also unit-testbar.

**peer.ts:**
- Host: `new Peer('wgarcade-'+code, {config:{iceServers:[{urls:'stun:stun.l.google.com:19302'}]}})`. `open` → resolve. `error.type==='unavailable-id'` → `Error('taken')`. `connection` → `Conn` beim `open` der DataConnection. Bei `disconnected` (Broker weg) folgt `peer.reconnect()`; die bestehenden DataChannels bleiben.
- Client: `new Peer({config})` → `connect('wgarcade-'+code,{reliable:true})`. `peer-unavailable` → `Error('noroom')`. Timeout 10 s.
- Daten werden als String gesendet. Was ankommt und kein String ist, wird verworfen.
- Nicht im Gate getestet (nur Typprüfung).

### 3.2 Protokoll v1 (`src/net/protocol.ts`)

```ts
export type ClientMsg =
  | { v: 1; t: 'hello'; pid: string; name: string }
  | { v: 1; t: 'input'; round: number; payload: unknown }
  | { v: 1; t: 'ping' };
export type RejectReason = 'full' | 'started' | 'badname';
export type HostMsg =
  | { v: 1; t: 'welcome'; pid: string }
  | { v: 1; t: 'view'; view: View; now: number }   // now = Host-Uhr beim Senden (siehe §4.1, D-1)
  | { v: 1; t: 'reject'; reason: RejectReason }
  | { v: 1; t: 'pong' };
export function parseClient(raw: unknown): ClientMsg | null;
export function parseHost(raw: unknown): HostMsg | null;
export function encode(m: ClientMsg | HostMsg): string;
```

Regeln: `raw` muss ein String sein, höchstens 16 KB, gültiges JSON, Objekt mit `v===1`. Alle Felder werden typgeprüft.
- `pid`: `/^[A-Za-z0-9-]{8,64}$/`.
- `name`: String bis 64 Zeichen. Trim und 1–12 prüft die Engine.
- `round`: ganze Zahl ≥ 0.
- `view`: Objekt mit String-Feld `s`.
- `reason`: aus dem Set.

Alles andere ergibt `null`. Es wird nie geworfen (`try/catch` um `JSON.parse`).

### 3.3 PRNG (`src/engine/prng.ts`)

```ts
export type Rng = () => number;                       // [0,1)
export function mulberry32(seed: number): Rng;
export function mix32(a: number, b: number): number;  // deterministischer uint32-Hash (z. B. murmur3-fmix)
export function int(r: Rng, min: number, maxIncl: number): number;
export function pick<T>(r: Rng, xs: readonly T[]): T;
export function shuffle<T>(r: Rng, xs: readonly T[]): T[]; // Fisher-Yates, Kopie
export function randomSeed(): number;                  // crypto.getRandomValues; nur Laufzeit-Grenze
```

Der Round-Seed ist `mix32(party.seed, roundIndex)`. Code-Erzeugung nutzt `newCode(rand: () => number)`, in der Laufzeit mit crypto-basiertem `rand`.

### 3.4 GameDef (`src/games/types.ts`)

Das Design wird um `color`, `ctx`, `parseInput`, `online` in `tick` und `label` erweitert (D-2):

```ts
export type GameId = 'blitz' | 'hammer' | 'farbfalle' | 'schaetzfuchs';
export interface PlayerRef { pid: string; name: string; color: number }
export interface GameCtx { speed: number }            // 1 oder 10 (fast)
export interface GameDef<S, I, V> {
  id: GameId; title: string; rule: string;
  accent: 'lime' | 'hot' | 'cyan' | 'orange';       // Signaturfarbe (Token-Name)
  init(players: PlayerRef[], seed: number, now: number, ctx: GameCtx): S;
  parseInput(raw: unknown): I | null;
  input(s: S, pid: string, i: I, now: number): S;     // unbekannte pid / zu spät -> s unverändert
  tick(s: S, now: number, online: ReadonlySet<string>): S;
  done(s: S, now: number): boolean;
  result(s: S): Map<string, number>;                  // höher = besser; fehlender Eintrag = kein Ergebnis
  label(s: S, pid: string): string;                   // Rohwert für Ergebnis-Zeile, z. B. "742 ms"
  view(s: S, pid: string, now: number): V;            // darf nicht pro Tick variieren (Diffing!)
}
// Client
export interface ViewCtx {
  me: string;
  toLocal(hostT: number): number;                     // Host-Zeit -> performance.now()-Zeit
  sfx: Sfx; fx: Fx; reducedMotion: boolean;
}
export interface Mounted<V> { update(v: V): void; destroy(): void }
export type Render<V, I> = (root: HTMLElement, v: V, send: (p: I) => void, ctx: ViewCtx) => Mounted<V>;
```

Die Zustände sind unveränderlich: `input`/`tick` geben neue Objekte zurück und verändern das alte nie (Tests prüfen das mit `structuredClone`-Vergleich).

### 3.5 Engine-State und Phasen (`src/engine/types.ts`, `party.ts`)

```ts
export interface Player {
  pid: string; name: string; color: number;           // 0..7, kleinster freier Index
  online: boolean; lastSeen: number; total: number;
}
export interface RoundRecord {
  gameId: GameId; places: Record<string, number>; points: Record<string, number>;
  labels: Record<string, string>;
}
export type Phase =
  | { k: 'lobby' }
  | { k: 'intro'; r: number; until: number }
  | { k: 'play'; r: number; started: number; state: unknown }
  | { k: 'result'; r: number; until: number }
  | { k: 'podium' };
export interface Party {
  code: string; seed: number; hostPid: string; dev: boolean; speed: number;
  players: Player[]; rounds: 3 | 5 | 8; order: GameId[]; phase: Phase; history: RoundRecord[];
}
export type HostAction =
  | { a: 'rounds'; n: 3 | 5 | 8 } | { a: 'start' } | { a: 'next' }
  | { a: 'again'; seed: number } | { a: 'lobby' };
export type HelloResult = { ok: true; pid: string } | { ok: false; reason: RejectReason };

export function createEngine(games: Record<string, GameDef<any, any, any>>): {
  create(code: string, seed: number, hostPid: string, o: { dev: boolean; speed: number }): Party;
  hello(p: Party, pid: string, name: string, now: number): { p: Party; res: HelloResult };
  seen(p: Party, pid: string, now: number): Party;
  disconnect(p: Party, pid: string, now: number): Party;
  input(p: Party, pid: string, round: number, payload: unknown, now: number): Party;
  control(p: Party, act: HostAction, now: number): Party;
  tick(p: Party, now: number): Party;
  viewFor(p: Party, pid: string, now: number): View;
  canStart(p: Party): boolean;
};
```

Übergänge (`D()` = `scale(ms, speed)`, siehe §4.5):

| von | Auslöser | nach | Effekt |
|---|---|---|---|
| lobby | `start` und `canStart` (online ≥ 2, dev ≥ 1) | intro r0 | `order = planOrder(seed, rounds, ids)`, `until = now + D(3000)` |
| intro | `now ≥ until` | play | `state = def.init(alle Spieler, mix32(seed,r), now, {speed})` |
| play | `tick` → `def.done(s, now)` | result | `rank()`, Punkte auf `total`, `history.push`, `until = now + D(5000)` |
| result | `now ≥ until` oder `next` | intro r+1 bzw. podium | |
| podium | `again{seed}` | intro r0 | neuer Seed, neue `order`, `total = 0`, `history = []` |
| podium/lobby | `lobby` | lobby | `total = 0`, offline Spieler entfernt (D-5) |

Regeln für `hello`:
- `name.trim()` muss 1–12 Zeichen haben, sonst `badname`.
- Ist die `pid` bekannt, gibt es immer `ok` (Reconnect, auch mitten im Spiel): `online = true`, Name bleibt der alte.
- Neue `pid` in einer anderen Phase als `lobby` → `started`. Bei 8 Spielern → `full`.
- Doppelter Name (Vergleich ohne Groß/Klein) → Anhang `" 2"`, `" 3"` … (kleinster freier).

Regeln für Online-Status:
- `tick` setzt `online = false`, wenn `now - lastSeen > 6000` (nicht skaliert). Der Host (`hostPid`) ist nie offline.
- `disconnect` setzt sofort offline. In der Lobby entfernen `disconnect` und Timeout den Spieler ganz (D-5).

Regeln für `input`:
- Nur in `play`, nur `round === phase.r`, nur bekannte `pid`, nur wenn `def.parseInput` nicht `null` liefert. Sonst bleibt der Zustand unverändert (gleiche Referenz).

`rounds` wirkt nur in der Lobby. `next` wirkt nur in `result`.

**rounds.ts `planOrder(seed, n, ids)`:**
- Konkateniert geseedete Shuffles von `ids`. An jeder Blockgrenze gilt: Ist das erste Element gleich dem vorigen, wird es mit dem zweiten getauscht.
- Damit gibt es nie zwei gleiche Spiele hintereinander, und bei `n ≥ 4` kommt jedes Spiel vor.
- Bei `ids.length === 1` wird wiederholt (nur für `?only=`).

**scoring.ts `rank(results: Map<pid,number>, pids: string[], online: Set<pid>)`:**
- Rangiert werden nur Spieler, die beim Rundenende online sind und ein Ergebnis haben.
- `place = 1 + #(strikt besser)`, `points = [5,3,2,1][place-1] ?? 0`.
- Wer offline ist oder kein Ergebnis hat, bekommt `place = Anzahl Spieler` (letzter) und 0 Punkte.
- Beispiel: Ergebnisse `[10,10,8,7,1]` ergeben Plätze `1,1,3,4,5` und Punkte `5,5,2,1,0`. Gleichstand teilt den besseren Platz.

### 3.6 View-Typen (`src/engine/view.ts`)

```ts
export interface PlayerView { pid: string; name: string; color: number; online: boolean; total: number; host: boolean }
interface Base { me: string; isHost: boolean; code: string; players: PlayerView[] }
export type View = Base & (
  | { s: 'lobby'; rounds: 3 | 5 | 8; canStart: boolean; min: number }
  | { s: 'intro'; r: number; n: number; game: GameId; title: string; rule: string; accent: string; until: number }
  | { s: 'game'; r: number; n: number; game: GameId; g: unknown }
  | { s: 'result'; r: number; n: number; game: GameId; until: number;
      rows: { pid: string; place: number; points: number; total: number; label: string }[] }
  | { s: 'podium'; rows: { pid: string; place: number; total: number }[] }
);
```

Alle Zeitfelder (`until`, `endsAt` in den Spiel-Sichten) sind absolute Host-Zeiten. Damit ist die Sicht zwischen den Ticks stabil, und das Diffing per JSON-String funktioniert. Es gibt keine pro Tick wechselnden Werte wie Restzeit-Countdowns. Die Sicht ist pro Spieler; geheime Daten (Schätzfuchs-Tipps vor der Auflösung) erscheinen nie in fremden Sichten.

### 3.7 Laufzeiten

**`engine/host.ts`:**

```ts
createHost(o: {
  transport: Transport; engine: Engine; now: () => number;
  every: (ms: number, fn: () => void) => () => void;   // injiziert; real: setInterval
  seed: number; rand: () => number; dev: boolean; speed: number;
  hostPid: string;
}): Promise<{ code: string; control(a: HostAction): void; localConn: Conn; stop(): void }>
```

- Erzeugt einen Code und ruft `transport.host(code)` auf. Bei `taken` kommt ein neuer Code (bis 5 Versuche).
- Erzeugt `createLoopbackPair()`, die Host-Seite wird wie eine eingehende Verbindung behandelt.
- Pro Conn: Die erste gültige Nachricht muss `hello` sein, dann folgen `welcome` oder `reject` (danach Conn schließen). Jede gültige Nachricht ruft `seen`. Auf `ping` folgt `pong`, auf `input` folgt `engine.input` und das Markieren als dirty. Bindet sich eine `pid` an eine neue Conn, wird die alte geschlossen und `last[pid]` gelöscht.
- `flush()`: Für jede gebundene Conn wird `viewFor` aufgerufen. Ist der JSON-String anders als `last[pid]`, wird `{t:'view',view,now}` gesendet.
- `hello`, `control` und `disconnect` lösen sofort `tick` + `flush` aus.
- Inputs werden nur gesammelt. Der Tick (alle 100 ms) macht `tick` + `flush`. So ist der Verkehr begrenzt, auch beim Hammer.
- `control` ist nur lokal erreichbar und nicht im Protokoll (D-4).

**`net/client.ts`:**

```ts
type ClientState =
  | { st: 'connecting' } | { st: 'joined'; view?: View } | { st: 'reconnecting'; view?: View }
  | { st: 'rejected'; reason: RejectReason } | { st: 'lost' };
createClientSession(o: {
  connect: () => Promise<Conn>; pid: string; name: string; now: () => number;
  every: (ms, fn) => () => void; after: (ms, fn) => () => void;
}): { onState(fn): () => void; input(round: number, payload: unknown): void;
      toLocal(hostT: number): number; close(): void }
```

- Beim Verbinden wird `hello` gesendet. Danach alle 2 s ein `ping`.
- `offset = msg.now - now()` bei jedem `view`. `toLocal(t) = t - offset`.
- Watchdog: 6 s ohne Nachricht oder `onClose` führen zu `reconnecting`. Dann wird alle 1 s `connect()` versucht, bis 10 s Gesamtdauer, danach `lost`.
- Für die Host-Seite liefert `connect` die Loopback-Conn genau einmal. Ein Reconnect ist dort nicht nötig.

## 4. Querschnittsentscheidungen

### 4.1 Uhr und Tick-Schleife
- Die Host-Uhr ist `performance.now()` (monoton) und wird in die Laufzeit injiziert. Engine und Logik bekommen nur Zahlen.
- Der Tick läuft alle 100 ms (`TICK_MS`) über `every()`. In Unit-Tests ist `every` ein manuell getriebener Fake (`fakeClock()` mit `advance(ms)`, das fällige Callbacks ausführt).
- `view`-Nachrichten tragen `now` (D-1). Der Client rechnet Deadlines für Countdown und Zeitbalken auf seine Uhr um.
- Die Latenz wird ignoriert (LAN ~10 ms). Fairness hängt daran nicht, weil Zeitkritisches lokal gemessen wird.

### 4.2 Host als Spieler
- Die Host-Seite (`#/host`) erzeugt `createHost(...)` und `createClientSession({connect: () => Promise.resolve(localConn)})`. Danach rendert sie exakt den Party-Screen wie jeder Client, zusätzlich mit `hostControl`.
- Die UI zeigt Host-Knöpfe (Start, Runden, Weiter, Nochmal, Neue Party) nur, wenn `view.isHost` gilt und `hostControl` existiert.
- Der Host-Spieler ist nie offline.
- Lädt der Host die Seite neu, ist die Party verloren: `#/host` ohne laufende Laufzeit leitet auf `#/` um. Die Clients gehen nach 6 s auf `lost`.

### 4.3 Fairness und lokale Zeitmessung
- Eine Spiel-Sicht trägt Dauern (`dur`, `waits`) und `endsAt` (Host-Zeit).
- Der Client startet seinen lokalen Spieltimer beim ersten Mount dieser Runde: `localStart = performance.now()` („starte nach Empfang“). Lokales Ende ist `localStart + dur`.
- Nach einem Wiedereinstieg (Remount mit vorhandenem Fortschritt in der Sicht) gilt als Ende `toLocal(endsAt)`, und der Client setzt beim Fortschritt aus der Sicht fort.
- Der Host nimmt Eingaben bis `started + dur + GRACE` (GRACE = 1500 ms, nicht skaliert) an.
- Eingaben im Spiel laufen über `pointerdown` (nicht `click`), mit `touch-action: manipulation`.

### 4.4 Heartbeat, Reconnect, Offline
- `pid` = `crypto.randomUUID()` in `sessionStorage['wgarcade.pid']`. Der Name steht in `localStorage['wgarcade.name']`.
- Nach erfolgreichem Join setzt der Client `sessionStorage['wgarcade.joined'] = CODE`. Beim Laden von `#/j/CODE` mit gleichem Code und gespeichertem Namen wird der Name-Screen übersprungen und sofort verbunden. So wird ein Reload zum Reconnect.
- Offline-Spieler werden in Listen und Rangliste grau dargestellt (Opacity-Token, Badge mit Strich-Muster).
- `lost` zeigt „Verbindung zum Host verloren“ und den Knopf „Neu beitreten“. Der lädt `#/j/CODE` mit gleicher `pid` neu, damit der Host den Spieler wiedererkennt, falls er noch lebt.

### 4.5 Flags (`src/config.ts`)
- `parseFlags(search: string): Flags` mit `net: 'local' | 'peer'` (Default peer), `dev`, `fast` (nur wirksam mit dev), `speed = dev && fast ? 10 : 1`, `only?: GameId` (nur dev, sonst ignoriert).
- `src/engine/durations.ts`:

| Konstante | Basis | skaliert? |
|---|---|---|
| INTRO | 3000 | ja |
| RESULT | 5000 | ja |
| BLITZ_WAIT_MIN/MAX | 1500/4000 | ja |
| BLITZ_SHOW (Zwischenanzeige) | 900 | ja |
| BLITZ_MAX (Wert für Frühstart bzw. kein Tap) | 1000 | **nein** (ist ein Wertungswert) |
| HAMMER | 8000 | ja |
| FARBFALLE | 20000 | ja |
| SF_ASK / SF_REVEAL | 20000 / 5000 | ja |
| GRACE | 1500 | nein |
| PING / OFFLINE | 2000 / 6000 | nein |
| TICK | 100 | nein |

`scale(ms, speed) = Math.round(ms / speed)`.

### 4.6 Routing (`src/app.ts`)
- `#/` ist der Start-Screen. Code eingeben → `#/j/<CODE>`.
- `#/host` zeigt zuerst den Name-Screen, danach Host-Laufzeit und Party-Screen. Ohne Aufruf über den Startknopf oder bei Reload → `#/`.
- `#/j/<CODE>` zeigt Name-Screen (oder Auto-Rejoin, §4.4), danach Client-Sitzung und Party-Screen. Ungültiger Code → `#/` mit Banner.
- Alles innerhalb der Party ist **zustandsgetrieben** über `view.s`, nicht über die Route.
- `party.ts` behält einen gemounteten Sub-Screen, solange `(s, r)` gleich bleiben, und ruft `update(view)`. Sonst wird der alte zerstört und der neue mit Enter-Animation gemountet.
- Die Query bleibt beim Hash-Wechsel automatisch erhalten.
- QR-URL: `location.origin + import.meta.env.BASE_URL + q + '#/j/' + CODE`. Dabei ist `q` die Teilmenge `net`/`dev`/`fast` der aktuellen Query, wenn vorhanden.
- Jeder Routenwechsel ruft `destroy()` am alten Screen auf: Listener, Timer und Sitzung werden aufgeräumt.

### 4.7 Wake Lock, Ton, Haptik
- `wakelock.ts`: `acquire()` beim Betreten des Party-Screens, erneut bei `visibilitychange → visible`, `release()` beim Verlassen. Alle Fehler werden still geschluckt (headless, iOS alt).
- `sfx.ts`: Ein `AudioContext` wird lazy beim ersten User-Gesture erzeugt (`sfx.unlock()` in Start/Join-Klick). `play(kind)` mit `tap | go | ok | bad | tick | win | join | start | whoosh`. Square- oder Triangle-Oszillator, Gain 0.08, Attack 5 ms, exponentieller Release. Mute steht in `localStorage['wgarcade.mute']`. Ohne `AudioContext` gibt es einen No-op.
- `haptics.ts`: `buzz(10)` bei Tap, `buzz([30,40,30])` bei Fehler, nur wenn `navigator.vibrate` existiert. Bei Mute ebenfalls aus.

### 4.8 Robustheit
- Jeder Parse-Pfad liefert `null` statt zu werfen. Die Host-Laufzeit fängt Exceptions aus Spiellogik pro Nachricht ab und loggt sie (`console.error`), damit die Party weiterläuft.
- Keine externen Requests außer PeerJS-Broker und STUN. Die Schriften sind gebündelt, das E2E prüft das (Schritt 8).

## 5. Spiele (Logik plus Sicht)

Alle Spiele: Beteiligt sind alle Spieler der Party bei `init`. `endsAt` und `dur` stehen in der Sicht. `done` ist wahr, wenn `now ≥ hardEnd` oder ein Spiel-Flag `finishedAll` gesetzt ist. `tick` setzt `finishedAll`, wenn alle online-Spieler fertig sind.

### blitz (Akzent lime)
- `init`: `waits = 3×int(rng, D(1500), D(4000))`, gleich für alle. `times: Record<pid,(number|null)[3]>`.
- `hardEnd = now + Σwaits + 3·(D(900)+1000) + GRACE`.
- Input: `{i:0|1|2, ms:number}` oder `{i, early:true}`. Bei Frühstart zählt 1000, sonst `ms` auf [0, 1000] geklemmt. Pro `i` gilt der erste Wert.
- Ein Spieler ist fertig, wenn alle 3 Versuche gesetzt sind.
- `result = -(Σ times)`, fehlende Versuche zählen 1000.
- `label` = `"742 ms"` (Summe). Sicht: `{waits, show, max:1000, mine, progress: Record<pid, number>, endsAt, dur}`.
- Client: Je Versuch erst `wait` (dunkel, „WARTE …“, ohne Puls, der verraten könnte), dann `go` (Neon-Vollfläche, „JETZT!“, `sfx go`). Tap ergibt `ms` mit Punch-Effekt und `ms` in Mega-Größe. Kein Tap nach 1000 ms ergibt 1000. Tap in `wait` ergibt `early` („ZU FRÜH!“, `bad`). Wiedereinstieg beim ersten `null` in `mine`.

### hammer (Akzent hot)
- `dur = D(8000)`, `counts`, `final: Set`, Cap = `ceil(8·25)` = 200 (konstant).
- Input: `{n:number, final?:true}`, monoton (Maximum gilt).
- Fertig, wenn `final` gemeldet ist. `result = n`, `label = "57 Taps"`.
- Sicht: `{dur, endsAt, mine, bars: {pid, n}[]}` in fester Beitrittsreihenfolge.
- Client: Zählt lokal und sendet alle 200 ms bei Änderung, am Ende `final`. Großer runder Knopf in der unteren Hälfte, Zähler in Mega-Größe, Live-Balken aller Spieler in ihren Farben.

### farbfalle (Akzent cyan)
- Farben (D-6, ohne Grün wegen Rot-Grün-Schwäche): `ROT #ff3b4e`, `BLAU #3d7bff`, `GELB #ffe14d`, `WEISS #f4f1ea`.
- `seq`: 400 Items `{word, ink}` aus dem Seed, `ink ≠ word`, kein Item gleich dem vorigen. Gleiche Folge für alle.
- `dur = D(20000)`. Input `{i, c}`. Gezählt wird nur `i === next[pid]`: richtig +1, falsch −1, danach `next++`. Zusätzlich `{done:true}` für fertig.
- `result = score`, `label = "+12"` bzw. `"−3"`. Sicht: `{dur, endsAt, seq, next, score}` (eigener Stand) plus `leader` optional.
- Client: Läuft lokal sofort weiter, ohne auf den Host zu warten. Wort in Mega-Größe in Tintenfarbe, 2×2-Knöpfe als Farbflächen mit schwarzem Wortlabel, Flash bei richtig/falsch, Zeitbalken.

### schaetzfuchs (Akzent orange)
- `init`: Frage `questions[int(rng,0,len-1)]`. `askEnd = now + D(20000)`.
- Input `{guess}`: endlich, 0 ≤ g ≤ 1e12, genau einmal.
- `tick`: Haben alle online-Spieler getippt oder ist `askEnd + GRACE` erreicht, gilt `phase = 'reveal'` und `revealEnd = now + D(5000)`. `done` gilt bei `now ≥ revealEnd`.
- `result = -|g-a|/a`, ohne Tipp kein Eintrag. `label = "±8 %"`.
- Sicht in `ask`: `{phase:'ask', q, unit, endsAt, dur, myGuess, guessed:number, total:number}` – **ohne** fremde Tipps.
- Sicht in `reveal`: `{phase:'reveal', q, unit, answer, endsAt, guesses:[{pid, guess|null, errPct}] sortiert}`.
- Client: Fragekarte, großes Zahlfeld (`inputmode="numeric"`), Einheit daneben, „TIPP ABGEBEN“. Danach „Tipp gespeichert“ und x/n. Bei der Auflösung die Antwort in Mega-Größe mit Hochzähl-Animation, Liste mit Abweichung.
- `questions.ts`: ≥ 40 Einträge `{q, a, unit}` auf Deutsch, ganzzahlige, stabile und gut belegte Werte.
  - Geeignet: Zugspitze 2962 m, Klaviertasten 88, Knochen des Erwachsenen 206, Felder Schachbrett 64, Länge Marathon 42195 m, Höhe Kölner Dom 157 m, Spinnenbeine 8, Bundesländer 16, Tage im Schaltjahr 366, Siedepunkt Wasser 100 °C, Karten im Skatblatt 32, Spieler einer Rugby-Union-Mannschaft 15.
  - Ausgeschlossen: Jahreszahlen (relativer Fehler degeneriert), Bevölkerungszahlen, Rekorde, Höhen mit Antennen, Everest (2020 geändert).
  - `questions.test.ts` prüft Form, Anzahl ≥ 40, `a > 0` ganzzahlig, `q` endet mit `?`, keine Dubletten, `unit` nicht leer.

## 6. Design-System „Neon-Brutalismus“

### 6.1 Tokens (`src/ui/tokens.css`, `:root`)
- **Grundfarben:** `--bg #0c0b10`, `--bg-2 #17151f` (Flächen), `--bg-3 #221f2d`, `--ink #f4f1ea`, `--ink-dim #a29eb3`, `--line #000`.
- **Akzente:** `--lime #c6ff00`, `--hot #ff2e88`, `--cyan #00e5ff`, `--orange #ff8a00`, `--ok #3dff8c`, `--bad #ff3b4e`, `--warn #ffd23d`. Text auf Akzentflächen: `--on-accent #0c0b10`.
- **Spielerfarben `--p0..--p7`** mit Form (in `palette.ts`):
  0 Lime `#c6ff00` Kreis · 1 Pink `#ff2e88` Dreieck · 2 Cyan `#00e5ff` Quadrat · 3 Orange `#ff8a00` Raute · 4 Violett `#b388ff` Stern · 5 Gelb `#ffe600` Plus · 6 Mint `#3dffb5` Sechseck · 7 Blau `#4d7cff` Kreuz.
  Alle tragen schwarzen Text (Kontrast ≥ 4.5). Ein Badge zeigt immer Form und Initiale.
- **Abstände:** `--s1 4px`, `--s2 8px`, `--s3 12px`, `--s4 16px`, `--s5 24px`, `--s6 32px`, `--s7 48px`, `--s8 64px`.
- **Radien:** `--r0 0`, `--r1 6px`, `--r2 14px`, `--rpill 999px`.
- **Kontur und Schatten:** `--bw 3px`, `--sh 6px 6px 0 #000`, `--sh-sm 3px 3px 0 #000`, `--sh-press 1px 1px 0 #000`, `--press-shift 5px`.
- **Dauern:** `--d-fast 90ms`, `--d-base 180ms`, `--d-slow 360ms`, `--d-pop 420ms`.
- **Easings:** `--ease-out cubic-bezier(.2,.8,.2,1)`, `--ease-snap cubic-bezier(.2,1.5,.35,1)`.
- **Maße:** `--tap-min 56px`, `--tap-l 64px`, `--maxw 520px`, `--dim-offline .38`.
- **Schriften:** `--font-display 'Bricolage Grotesque Variable', 'Archivo Black', system-ui, sans-serif`, `--font-text 'Space Grotesk Variable', system-ui, sans-serif`.

### 6.2 Typo-Skala
- `--fs-mega: clamp(72px, 26vw, 168px)` für Countdown, ms-Wert, Zähler und Antwort.
- `--fs-xxl: clamp(48px, 15vw, 96px)` für Spieltitel und Logo.
- `--fs-xl: clamp(34px, 9vw, 56px)` für Screen-Titel und Raumcode.
- `--fs-l 26px`, `--fs-m 20px`, `--fs-s 16px`, `--fs-xs 13px`.
- Display-Text: Bricolage mit `font-variation-settings: "wdth" 75` (kondensiert), Gewicht 800, `letter-spacing: -0.02em`, `line-height: .9`, `text-transform: uppercase`.
  Hat das Paket keine wdth-Achse (prüfen, ob `wdth.css`/`full.css` existiert und welche Achsen `metadata.json` listet), dann 800 ohne Breitenachse mit `letter-spacing: -0.04em`, Entscheidung in DECISIONS.
- Text: Space Grotesk 500/700.
- Zahlen überall `font-variant-numeric: tabular-nums`.

### 6.3 Basis (`base.css`)
- `html, body`: Höhe `100dvh`, `overflow: hidden`, `overscroll-behavior: none`, `-webkit-tap-highlight-color: transparent`, `user-select: none`, `touch-action: manipulation`.
- Padding über `env(safe-area-inset-*)`.
- Hintergrund `--bg` mit Punktraster (`radial-gradient` 1px, 24px Raster, 7 % Deckkraft).
- `:focus-visible { outline: 4px solid var(--lime); outline-offset: 3px }`.
- `input`: groß, `--bg-2`, Kontur, Schatten, `font-size ≥ 20px` (verhindert iOS-Zoom).

### 6.4 Komponenten (`components.ts` + `components.css`)
- **button(label, {variant: 'primary'|'hot'|'ghost'|'danger', size:'l'|'m', testid})**: Akzentfläche, `--bw` schwarze Kontur, `--sh`, Display-Schrift. `:active` bzw. `pointerdown`: `translate(var(--press-shift), var(--press-shift))` plus `--sh-press` in `--d-fast`. `disabled`: gestreift und gedimmt. Höhe ≥ `--tap-min` (l = `--tap-l`), volle Breite im Footer.
- **panel**: `--bg-2`, Kontur, `--r2`, `--sh`.
- **playerBadge(player, {size, me})**: Kreis- oder Pill-Fläche in Spielerfarbe, SVG-Form plus Initiale. Offline mit `--dim-offline` und diagonal durchgestrichen. `me` bekommt einen weißen Ring.
- **shapeSvg(shape)**: 8 inline-SVGs, 24er-Viewbox.
- **codeBoxes(code)**: 4 Zeichen in einzelnen Kästen (Lime, schwarze Schrift, `--fs-xl`), leicht versetzt rotiert (−2°, 1°, −1°, 2°).
- **segmented([3,5,8], value, onChange)**: Knopfgruppe, aktive Option als Lime-Fläche.
- **timerBar(hostEndsAt, dur, ctx)**: Balken, per CSS-Transition `transform: scaleX` von 1 auf 0 über die Restzeit. Nur einmal gesetzt, es gibt kein Tick-Rerender.
- **countdown(untilLocal)**: Zeigt 3-2-1 in `--fs-mega`. Jede Ziffer bekommt eine Pop-Animation (Scale 1.6 → 1, `--ease-snap`, `--d-pop`) und `sfx tick`. `aria-live="assertive"`.
- **scoreRow({place, badge, name, label, points, total})**: Platz-Ziffer groß, Badge, Name, Rohwert gedimmt, `+5` als Float-Up, Gesamt rechts, tabellarische Ziffern.
- **banner(text, kind)**: Oben fixiert, z. B. „Verbindung wird wiederhergestellt …“ (warn).
- **muteToggle**: Lautsprecher-SVG, 56×56.
- **screenFrame({header, main, footer, accent})**: Grid `auto 1fr auto`, Header mit „RUNDE 2/5“ und Code klein, Footer sticky mit Safe-Area.
- **Logo**: „WG·ARCADE“ in Display-Schrift, zweizeilig („WG·“ / „ARCADE“), Lime-Text mit `text-shadow: 4px 4px 0 var(--hot), 8px 8px 0 #000`.

### 6.5 Bewegung (`motion.css`, `fx.ts`)
- Screen-Enter: `translateY(16px)` mit Fade auf 0, `--d-base`, `--ease-out`. Exit sofort (kein Warten).
- Ergebniszeilen: gestaffelter Enter (60 ms je Zeile). Punkte-Float `+5`: nach oben und ausblenden, 600 ms.
- Punch: `.punch` mit 120 ms Keyframe (Translate ±6px/±3px und Scale 1.02) auf dem Screen-Root bei Treffer oder Tap.
- Flash: Vollflächen-Overlay `--ok` bzw. `--bad`, Deckkraft .35 → 0, 220 ms.
- Podium: Blöcke steigen gestaffelt auf (2., 1., 3.; Höhen 70 %, 100 %, 50 %; `--ease-snap`), Kronen-Emoji wird **nicht** verwendet, stattdessen „1“ in Mega-Größe. Danach Konfetti 2,5 s (Canvas, 120 Partikel, Spielerfarben, Rechtecke mit Rotation, rAF, stoppt und entfernt sich selbst).
- Lobby: Neuer Spieler-Badge kommt mit Pop plus `sfx join`.
- `@media (prefers-reduced-motion: reduce)`: Alle Animationen und Transitions auf 0.01ms, kein Punch, kein Konfetti (`fx.reducedMotion()`), Countdown ohne Pop.

### 6.6 Screens (konkret)
- **Start**:
  - Mute oben rechts, Logo im oberen Drittel, Unterzeile „Partyspiele nur mit Handys.“ (`--ink-dim`).
  - Footer: „PARTY STARTEN“ (primary, l) und „BEITRETEN“ (ghost, l).
  - „Beitreten“ klappt inline ein Codefeld auf: 1 Input, `maxlength=4`, `autocapitalize=characters`, `letter-spacing .3em`, filtert auf das Alphabet. „REIN“ ist erst bei 4 gültigen Zeichen aktiv.
- **Name**: Titel „WIE HEISST DU?“, großes Input (vorbelegt), Zähler x/12, Knopf „WEITER“. Enter-Taste sendet. Fehler (`badname`) als roter Text darunter.
- **Lobby Host**:
  - Panel mit QR (weiße Karte, schwarze Kontur, Lime-Rahmen, ~60 vw), darunter `codeBoxes`.
  - Darunter „SPIELER x/8“ und ein 2-Spalten-Raster aus Badges mit Namen. Runden-Segmented „RUNDEN 3 · 5 · 8“.
  - Footer „LOS GEHT'S“, deaktiviert mit Hinweis „Mindestens 2 Spieler“ (dev: 1).
- **Lobby Client**: Großer Farbblock in eigener Spielerfarbe mit Form, Text „DU BIST DRIN“ und eigenem Namen. Spielerliste. „Warte auf <Hostname> …“ mit 3 animierten Punkten.
- **Intro**: Vollfläche in der Spiel-Akzentfarbe, schwarzer Text. Spieltitel in `--fs-xxl`, Regelzeile `--fs-m`, „RUNDE r/n“ klein, Countdown in Mega-Größe. `whoosh` beim Eintritt.
- **Spiel**: siehe §5. Header mit Runde und Zeitbalken.
- **Ergebnis**: „RUNDE r/n · <SPIEL>“, sortierte `scoreRow`s, darunter ein dünner Auto-Weiter-Balken (timerBar). Der Host hat „WEITER“. `aria-live="polite"` auf der Liste.
- **Podium**: „SIEGER“ in `--fs-xl`, 3 Blöcke mit Badges, Namen und Punkten, Konfetti, `sfx win`. Darunter die komplette Rangliste. Host-Footer: „NOCHMAL“ (primary) und „NEUE PARTY“ (ghost). Clients sehen „Warte auf den Host …“.
- **Lost**: Durchgestrichenes WLAN-SVG in `--bad`, „VERBINDUNG ZUM HOST VERLOREN“, Knöpfe „NEU BEITRETEN“ und „ZUM START“.
- **Rejected**: `full` → „Party ist voll (8/8)“, `started` → „Party läuft schon“. Jeweils mit „ZUM START“.

## 7. Test-Strategie

### 7.1 Vitest
- Läuft in der Node-Umgebung. `vitest.config.ts`: `include: ['src/**/*.test.ts']`.
- DOM-Code wird nicht unit-getestet (keine jsdom-Abhängigkeit). Das deckt Playwright ab.
- Fake-Uhr als Helfer `src/engine/fakeclock.ts` (nur von Tests importiert): `{ now(), every(ms, fn), after(ms, fn), advance(ms) }`.
- Ziel-Abdeckung: Raumcode, Protokoll (gültige und kaputte Eingaben, Fuzz mit 200 zufälligen Strings → nie throw), Loopback, Local-Transport (echter `BroadcastChannel` in Node, `await` mit kleinen Promises, keine Timer außer dem `join`-Timeout, der mit kleinem `timeoutMs` getestet wird), PRNG-Determinismus, `planOrder`, `rank`, Engine-Reducer, jedes Spiel mit Fake-`now`, Fragenbank, Host-Laufzeit mit Loopback plus Fake-Uhr, Client-Sitzung mit Fake-Timern (`vi.useFakeTimers` bzw. injizierte Scheduler).

### 7.2 Playwright (`playwright.config.ts`)
- `testDir: 'e2e'`, `workers: 1`, `fullyParallel: false`, `timeout: 90_000`, `expect.timeout: 10_000`, `reporter: 'list'`, `retries: process.env.CI ? 1 : 0`.
- Freier Port: `process.env.E2E_PORT ??= execSync(node -e "...listen(0)... print port").toString().trim()`. Die Worker erben die env, damit gilt derselbe Port im Haupt- und Worker-Prozess.
- `webServer`: `command: 'npm run build && npx vite preview --host 127.0.0.1 --strictPort --port ' + PORT`, `url: http://127.0.0.1:PORT/wg-arcade/`, `reuseExistingServer: false`, `timeout: 120_000`.
- `use`: `baseURL` wie oben, `viewport {390, 844}`, `hasTouch: true`, `trace: 'retain-on-failure'`, `screenshot: 'only-on-failure'`.
- Projekt `chromium` (headless). Playwright 1.63.0 nutzt `chromium_headless_shell-1243` aus `~/.cache/ms-playwright`.
  Sucht es eine andere Revision, dann `launchOptions.executablePath` auf `~/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux-arm64/chrome-headless-shell` setzen, nur wenn die Datei existiert, mit DECISIONS-Eintrag.
- Lib-Env: `const arch = {arm64:'aarch64', x64:'x86_64'}[os.arch()]`, `libDir = ~/.local/share/paime-chromium-libs/root/usr/lib/${arch}-linux-gnu`, `fc = ~/.local/share/paime-chromium-libs/fonts.conf`. **Nur wenn `fs.existsSync`**: `launchOptions.env = {...process.env, LD_LIBRARY_PATH: libDir + (alt ? ':' + alt : ''), FONTCONFIG_FILE: fc}`. In CI bleibt alles unverändert.
- **Nie** `playwright install` oder `install-deps` ausführen.
- Mehrspieler: **ein** Browser-Kontext (`context`-Fixture), mehrere `context.newPage()`. `BroadcastChannel` und `localStorage` sind geteilt, `sessionStorage` (pid) ist pro Seite getrennt. URLs: `?net=local&dev=1&fast=1#/…`.
- Hintergrund-Seiten: Logik und Timer nutzen `setTimeout` und `performance.now`, **nicht** rAF. rAF nur für Konfetti und Optik, falls Seiten gedrosselt werden.

### 7.3 Test-ID-Vertrag (stabil ab Schritt 5, Schritt 1 nur `screen-start`)

Jeder Screen-Root hat `data-screen="start|name|lobby|intro|game|result|podium|lost|rejected"`.
- Start: `data-testid` = `btn-host`, `btn-join`, `input-code`, `btn-join-go`, `btn-mute`.
- Name: `input-name`, `btn-name-go`, `name-error`.
- Lobby: `room-code` (Textinhalt = Code), `qr`, `player` (je Spieler, `data-pid`, `data-online`), `rounds-3|5|8`, `btn-start`.
- Intro: Root hat `data-game=<id>`, `countdown`.
- Spiel: Root hat `data-game=<id>` und `data-state`.
  - blitz: `blitz-pad` mit `data-state=wait|go|show|early|done`.
  - hammer: `btn-hammer`, Root `data-state=play|done`.
  - farbfalle: `ff-word` mit `data-ink=rot|blau|gelb|weiss`, `ff-rot|ff-blau|ff-gelb|ff-weiss`, `data-state=play|done`.
  - schaetzfuchs: `sf-input`, `sf-submit`, `sf-reveal`, `data-state=ask|sent|reveal`.
- Ergebnis: `result-row` (`data-pid`, `data-points`), `btn-next`.
- Podium: `podium`, `podium-row` (`data-pid`, `data-total`), `btn-again`, `btn-new`.
- Lost/Rejected: `btn-rejoin`, `btn-home`.

### 7.4 E2E-Suiten (Endstand)
- `smoke.spec.ts`: Start lädt, Logo sichtbar, keine Konsolenfehler.
- `lobby.spec.ts`: Host und 2 Clients treten bei, einer per URL, einer per Code-Eingabe. Liste zeigt 3, doppelter Name bekommt „ 2“. Eine „Leerlauf-Party“ mit 3 Runden ohne Eingaben läuft bis zum Podium.
- `screens.spec.ts`: Jeder Screen bei 390×844. Kein horizontaler Überlauf (`scrollWidth ≤ innerWidth`), alle Knöpfe ≥ 56 px hoch. Screenshots nach `test-results/screens/*.png` für das Review (keine Pixel-Asserts). `reducedMotion: 'reduce'` wird einmal geprüft (kein Konfetti-Canvas).
- `games.spec.ts`: Pro Spiel `?only=<id>`, Host allein (dev erlaubt 1), 3 Runden, Bot spielt. Ergebniszeile hat einen plausiblen Label-Wert.
- `party.spec.ts`: Komplettparty (Schritt 8).
- `reconnect.spec.ts`: Client-Reload mitten im Spiel. Gleicher Platz, kein Duplikat, spielt weiter.

## 8. Deploy (`.github/workflows/pages.yml`)
- Auslöser: `push` auf `main` plus `workflow_dispatch`.
- `permissions: { contents: read, pages: write, id-token: write }`, `concurrency: { group: pages, cancel-in-progress: true }`.
- Job `build`: `actions/checkout@v4`, `actions/setup-node@v4` (node 22, `cache: npm`), `npm ci`, `npm run lint`, `npm run test:unit`, `npm run build`, `actions/upload-pages-artifact@v3` (`path: dist`).
  Lint und Unit vor dem Build sind eine Ergänzung (D-8). E2E läuft nicht in CI, weil dort ein Browser-Install nötig wäre.
- Job `deploy`: `needs: build`, `environment: github-pages`, `actions/deploy-pages@v4`.
- Einmalig manuell: Repo → Settings → Pages → Source „GitHub Actions“ (oder `gh api -X POST repos/KarimMarhaba/wg-arcade/pages -f build_type=workflow`). Steht in der README.
- `package-lock.json` wird committet (`npm ci`).

## 9. Erweiterungen und Auslegungen → DECISIONS.md (im genannten Schritt eintragen)

| ID | Schritt | Was | Warum |
|---|---|---|---|
| D-0 | 1 | Versionen (Vite 8, Vitest 5, TS 7 bzw. Fallback 5.9), Zusatz-Dev-Deps `@types/node`, `@types/qrcode`, `@fontsource-variable/*` statt `@fontsource/*` | Typen für Configs, variable Achsen für Kondensierung |
| D-1 | 2 | `view`-Nachricht trägt zusätzlich `now` (Host-Uhr) | Absolute Deadlines in der Sicht, stabiles Diffing, Client rechnet Offset |
| D-2 | 3 | GameDef-Erweiterung: `accent`, `ctx{speed}`, `parseInput`, `tick(…, online)`, `label` | fast-Skalierung, Eingaben vom Draht validieren, Früh-Ende bei allen Online-Fertigen, Rohwert-Anzeige |
| D-3 | 5 | Client-`render` liefert `Mounted{update,destroy}` | Lokaler Spielzustand (Timer) überlebt Sicht-Updates |
| D-4 | 5 | Host-Steuerung nur lokal (`control`), nicht im Protokoll | Clients können Party nicht steuern; Protokoll bleibt wie im Design |
| D-5 | 3 | In der Lobby werden getrennte Spieler entfernt; „Neue Party“ = zurück in die Lobby (gleicher Code, Punkte 0) | Freie Plätze und Farben in der Lobby; Verbindungen bleiben erhalten |
| D-6 | 4 | Farbfalle-Farben ROT/BLAU/GELB/WEISS (kein Grün) | Rot-Grün-Schwäche |
| D-7 | 3 | fast skaliert Spiel- und Phasendauern, nicht Heartbeat, GRACE, BLITZ_MAX; dev-Flag `?only=<id>` | Netztoleranz bleibt real; gezielte E2E |
| D-8 | 1 | CI führt vor dem Build zusätzlich lint und unit aus | Kaputtes nicht deployen |
| D-9 | 4 | Schätzfuchs-Frage pro Runde per Seed, Wiederholung in einer Party theoretisch möglich | Reine Logik ohne Party-Wissen; Wahrscheinlichkeit gering |

---

## 10. Schritte (Bau-Reihenfolge)

Jeder Schritt endet mit grünem `npm test` und `npm run lint`, einem Conventional Commit und den DECISIONS-Einträgen aus §9.
TDD: Zuerst die Tests der reinen Module, dann die Implementierung.

### Schritt 1 — Gerüst und Gates
**Ziel:** Ein lauffähiges Vite+TS-Projekt mit allen npm-Skripten, einem trivialen Vitest-Test, einem Playwright-Smoke über den gebauten Bundle unter `/wg-arcade/` und dem Pages-Workflow.

**Dateien:** `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `index.html`, `public/favicon.svg`, `src/main.ts`, `src/app.ts` (Platzhalter-Start), `src/config.ts`, `src/config.test.ts`, `src/ui/tokens.css` (nur Grundfarben, Abstände, Fonts-Variablen), `src/ui/base.css`, `e2e/smoke.spec.ts`, `.github/workflows/pages.yml`, `DECISIONS.md`, `.gitignore` (+ `.vite/`).

**Vorgehen:**
1. `npm init`-Äquivalent von Hand. Danach `npm i peerjs qrcode @fontsource-variable/bricolage-grotesque @fontsource-variable/space-grotesk` und `npm i -D typescript vite vitest @playwright/test@1.63.0 @types/node @types/qrcode`. In `package.json` `@playwright/test` exakt pinnen (`"1.63.0"`).
2. `tsconfig.json`:
   - `target ES2022`, `module ESNext`, `moduleResolution bundler`, `lib [ES2022, DOM, DOM.Iterable]`.
   - `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `verbatimModuleSyntax`, `isolatedModules`, `skipLibCheck`, `noEmit`.
   - `types [vite/client, node]`, `include [src, e2e, vite.config.ts, vitest.config.ts, playwright.config.ts]`.
3. `vite.config.ts` mit `base: '/wg-arcade/'`, `build.target: 'es2022'`.
4. `config.ts` mit `parseFlags` (§4.5, `only` wird schon geparst) und dazu Tests: Defaults, `net=local`, `fast` ohne `dev` → `speed` 1, `dev` + `fast` → 10, unbekanntes `only` ignoriert.
5. `app.ts`: rendert `<main data-screen="start"><h1>WG·ARCADE</h1></main>`. `main.ts` importiert die Fonts-CSS, `tokens.css`, `base.css`.
6. `playwright.config.ts` vollständig nach §7.2 (freier Port, Lib-Env, preview).
7. `smoke.spec.ts`: `goto('./?net=local#/')`, `[data-screen=start]` sichtbar, `h1` enthält „WG·ARCADE“, keine `pageerror`.
8. Pages-Workflow nach §8.
9. DECISIONS D-0 und D-8 eintragen.

**Reihenfolge:** Deps → tsconfig/vite → config + Test → App-Platzhalter → Playwright-Config → Smoke → Workflow.

**Risiken:**
- TS 7 lehnt eine Option ab: Option entfernen oder `typescript@^5.9` pinnen (DECISIONS).
- Playwright findet den Browser nicht: `executablePath`-Fallback (§7.2).
- `execSync` im Config-Kontext läuft pro Worker: `??=` sorgt für denselben Port.
- `vite preview` braucht vorher den Build: im Kommando verkettet.

**DoD (Outline):**
- `npm ci` funktioniert.
- `npm run build` erzeugt `dist/index.html`, Asset-Pfade beginnen mit `/wg-arcade/`.
- `npm run test:unit` ≥ 4 grüne Tests, `npm run test:e2e` mit grünem Smoke, `npm run lint` grün.
- Kein `playwright install` ausgeführt.
- Workflow-YAML vorhanden, mit `deploy-pages`.

### Schritt 2 — Netz-Fundament
**Ziel:** Raumcode, Protokoll v1, Transport-Schnittstelle mit Loopback, Local (BroadcastChannel) und Peer (PeerJS), vollständig unit-getestet (ohne Peer).

**Dateien:** `src/net/{code,protocol,transport,emitter,loopback,local,peer}.ts` plus `code.test.ts`, `protocol.test.ts`, `loopback.test.ts`, `local.test.ts`. Für den Typ-Import eine vorläufige `src/engine/view.ts` mit `View` (Typen nach §3.6, `GameId` vorerst in `src/games/types.ts` als String-Union).

**Vorgehen:**
1. `code.ts`: `ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'`, `newCode(rand)`, `normalizeCode(s)` (trim, uppercase, Leerzeichen entfernen, genau 4 Zeichen aus dem Alphabet, sonst `null`).
2. `protocol.ts` nach §3.2.
3. `emitter.ts`, `loopback.ts`, `local.ts`, `peer.ts` nach §3.1. Peer nur über `createTransport('peer')` per `await import`.
4. Tests:
   - Code: 1000 Codes mit fester `rand`-Folge nur aus dem Alphabet; `normalizeCode(' ab cd ')` → `ABCD`; `I`/`O` → `null`.
   - Protokoll: Alle gültigen Nachrichten laufen hin und zurück; falsches `v`, fehlende Felder, `pid` zu kurz, `round` −1, > 16 KB, kein JSON, Fuzz → `null`, nie throw.
   - Loopback: Senden in beide Richtungen ist asynchron, `close` auf einer Seite löst beide `onClose` genau einmal aus, `send` nach `close` ist No-op.
   - Local: Host und 2 Clients im selben Prozess, Nachrichten getrennt nach `cid`, `join` auf unbekannten Code → `noroom` mit `timeoutMs: 50`, `close` vom Client → Host-`onClose`.
5. DECISIONS D-1.

**Reihenfolge:** code → protocol → transport-Typen → loopback → local → peer.

**Risiken:**
- Node-`BroadcastChannel` hält den Prozess offen: in `afterEach` alle Channels schließen.
- PeerJS-Typen bei `import type` zur Laufzeit vermeiden: nur dynamisch importieren.
- PeerJS ohne Browser-Globals darf beim Typcheck nicht ausgeführt werden.

**DoD (Outline):**
- Alle genannten Tests grün. `protocol.parse*` wirft bei 200 Fuzz-Eingaben nie.
- `createTransport('local')` lädt kein `peerjs` (Bundle-Chunk getrennt, im Build sichtbar).
- Lint grün.

### Schritt 3 — Engine (rein)
**Ziel:** Ein vollständiger, deterministischer Party-Zustandsautomat mit Lobby, Rundenfolge, Phasen, Punkten, Gleichstand, Reconnect und Offline, getestet mit Fake-Uhr und einem Dummy-Spiel.

**Dateien:** `src/engine/{prng,durations,types,view,rounds,scoring,party,fakeclock}.ts`, `src/games/types.ts` (GameDef und Client-Typen nach §3.4), Tests `prng.test.ts`, `rounds.test.ts`, `scoring.test.ts`, `party.test.ts`, Test-Fixture `src/engine/dummygame.ts` (nur in Tests importiert; `dur` 1000, Input `{v:number}`, `result = v`).

**Vorgehen:**
1. `prng`: mulberry32, mix32 und Helfer. Tests: gleiche Seeds geben gleiche Folgen, `int` innerhalb der Grenzen, `shuffle` ist eine Permutation und verändert das Original nicht.
2. `durations`: Konstanten plus `scale`.
3. `rounds`: `planOrder`. Tests für 500 Seeds × n ∈ {3,5,8}: nie zwei gleiche hintereinander; bei n ≥ 4 und 4 IDs alle enthalten; deterministisch; `ids.length === 1` wiederholt.
4. `scoring`: `rank`. Tests: Gleichstand-Beispiel aus §3.5; offline oder ohne Ergebnis → 0 und letzter Platz; 1 Spieler → 5.
5. `party.ts` `createEngine` nach §3.5/§3.6.
   - Tests mit `fakeclock` und Dummy-Registry: Join ok, `badname` (leer, 13 Zeichen), Namensdubletten „ 2“/„ 3“, `full` beim 9., `started` für neue `pid`, Reconnect bekannter `pid` mitten in `play`.
   - Farben: kleinster freier Index. Freigabe in der Lobby nach `disconnect`, erhalten im Spiel.
   - `rounds` nur 3/5/8 und nur in der Lobby. `canStart` mit 1 Spieler: false, dev: true.
   - Komplette Timeline mit `speed` 1 und 10: Übergänge exakt an den Grenzen.
   - Input mit falscher Runde oder unbekannter pid gibt dieselbe Referenz zurück.
   - Offline nach 6001 ms ohne `seen`, Host nie offline. Offline am Rundenende → 0 Punkte.
   - `next` verkürzt `result`. Letzte Runde → `podium`. `again` setzt zurück, neue `order`. `lobby` setzt zurück und entfernt Offline-Spieler.
   - `viewFor` liefert `isHost` korrekt, ist zwischen zwei Ticks ohne Änderung JSON-gleich, `me` stimmt.
6. DECISIONS D-2, D-5, D-7.

**Reihenfolge:** prng → durations → types/view → rounds → scoring → party (Lobby → Phasen → Punkte → Offline → Views).

**Risiken:**
- Mutation durch die Hintertür (Arrays geteilt): Tests mit `structuredClone`-Vergleich des Eingangs.
- `noUncheckedIndexedAccess` erzeugt viel `!`: Helfer `must()` bzw. saubere Guards.
- `unknown`-State der Spiele: Casts nur in `party.ts` an einer Stelle.

**DoD (Outline):**
- Mindestens 30 Engine-Assertions grün.
- Keine Nutzung von `Date`, `Math.random`, `performance` oder `crypto` in `src/engine/{party,rounds,scoring}.ts` (prüfbar per grep).
- `randomSeed` existiert nur in `prng.ts`.

### Schritt 4 — Spiellogik (4 Spiele) und Fragenbank
**Ziel:** `blitz`, `hammer`, `farbfalle` und `schaetzfuchs` als reine `GameDef`s nach §5, dazu die Registry und ≥ 40 Schätzfragen.

**Dateien:** `src/games/{blitz,hammer,farbfalle,schaetzfuchs}/logic.ts` plus `logic.test.ts`, `src/games/schaetzfuchs/questions.ts` plus `questions.test.ts`, `src/games/index.ts` (`GAMES`, `GAME_IDS`), `src/games/colors.ts` (Farbfalle-Farben, von Logik und View geteilt).

**Vorgehen** (je Spiel TDD mit Fake-`now`, `speed` 1 und 10):
- blitz: gleiche `waits` für gleichen Seed; `waits` in den skalierten Grenzen; Frühstart = 1000; Klemmen auf [0,1000]; doppeltes `i` ignoriert; fertig nach 3; `done` bei `hardEnd`; `result = -Summe`, fehlende Versuche = 1000; `label`.
- hammer: Monotonie, Cap 200, `final`; `done` bei `dur+GRACE` oder alle online final; Live-Balken in der Sicht aller.
- farbfalle: Folge deterministisch, `ink ≠ word`, keine direkten Wiederholungen; Wertung ±1 nur bei `i === next`; Eingaben nach `hardEnd` ignoriert; `result = score`.
- schaetzfuchs: Fragewahl deterministisch; nur ein Tipp; ungültige Tipps (`NaN`, negativ, `Infinity`, String) → `parseInput` null; in `ask` enthält die Sicht des Spielers A nie den Tipp von B (JSON-String-Prüfung); Früh-Reveal wenn alle online getippt haben; `done` nach `revealEnd`; `result` = −relativer Fehler; ohne Tipp kein Eintrag.
- Alle Spiele: `view` ist bei gleichem State und anderem `now` gleich (Diffing-Garantie), Eingangs-State wird nicht verändert.
- Fragen nach §5, mit Test.
- Registry plus Engine-Integrationstest: `createEngine(GAMES)`, 5 Runden mit dev und speed 10, nur Ticks → Podium erreicht, alle 4 Spiele in `order`.
- DECISIONS D-6, D-9.

**Reihenfolge:** colors → blitz → hammer → farbfalle → questions → schaetzfuchs → registry + Integrationstest.

**Risiken:**
- Faktenqualität der Fragen: nur Lehrbuch- bzw. Definitionswerte. Im Zweifel weglassen, lieber 45 sehr sichere Fragen.
- Skalierung inkonsistent: alle Dauern nur über `scale(…, ctx.speed)`.

**DoD (Outline):**
- Je Spiel ≥ 8 Tests grün, Fragen-Test grün.
- Der Integrationstest erreicht `podium` mit allen 4 Spielen in `order`.
- Keine DOM-Imports in `logic.ts`.

### Schritt 5 — Laufzeit, Routing und funktionale Screens
**Ziel:** Echter Ablauf im Browser per `?net=local`: Host startet, Clients treten per Code bei, die Party läuft (Spiele ohne eigene Views über eine Fallback-Sicht) bis zum Podium. Zunächst funktional mit Basis-Tokens; die Gestaltung folgt in Schritt 6.

**Dateien:** `src/engine/host.ts` plus `host.test.ts`, `src/net/client.ts` plus `client.test.ts`, `src/app.ts`, `src/ui/dom.ts`, `src/ui/qr.ts`, `src/ui/screens/{start,name,party,lobby,intro,game,result,podium,lost}.ts`, `src/games/views.ts` (Registry mit Fallback-Render: Titel und „läuft …“), `e2e/helpers.ts`, `e2e/lobby.spec.ts`, Anpassung `e2e/smoke.spec.ts`.

**Vorgehen:**
1. `host.ts` nach §3.7. Unit-Integrationstest mit `createTransport('local')` oder einem In-Memory-Fake-Transport aus Loopback-Paaren, plus Fake-Uhr:
   - Host-Spieler und 2 Clients: `welcome`.
   - 9. Spieler: `reject full`.
   - `badname` → `reject` und Conn wird geschlossen.
   - Views werden nur bei Änderung gesendet (Zähler).
   - Reconnect mit gleicher `pid` schließt die alte Conn.
   - Inputs werden erst mit dem Tick geflusht.
   - Komplette Party mit Fake-Ticks bis `podium`.
2. `client.ts` nach §3.7. Tests mit Fake-Schedulern: `hello` beim Verbinden, Ping alle 2 s, Watchdog → `reconnecting` → erfolgreicher Reconnect → `joined`; 10 s erfolglos → `lost`; `reject` → `rejected`; `toLocal`-Offset.
3. `app.ts`-Router nach §4.6 inklusive sessionStorage/localStorage (§4.4) und `destroy`-Disziplin.
4. Screens funktional mit allen Test-IDs aus §7.3. Lobby-Host zeigt QR (`qr.ts`) und Code. Party-Dispatcher nach §4.6. Host-Knöpfe über `hostControl`.
5. `?only=` an `planOrder` durchreichen (Host-Laufzeit gibt `ids = only ? [only] : GAME_IDS`).
6. E2E `lobby.spec.ts`:
   - (a) Host öffnet, Name „Karim“, Lobby, Code wird gelesen.
   - (b) Client 1 per `#/j/CODE`, Name „Anna“.
   - (c) Client 2 über Start → Beitreten → Code-Eingabe, Name „Anna“ → erscheint als „Anna 2“.
   - (d) Alle drei Seiten zeigen 3 `player`.
   - (e) Runden 3, Start → alle zeigen `intro` → ohne Eingaben über `result` bis `podium` auf allen 3 Seiten.
7. DECISIONS D-3, D-4.

**Reihenfolge:** host.ts (+Test) → client.ts (+Test) → dom/qr → Router → Screens → E2E.

**Risiken:**
- Rennen beim ersten `view` vor dem Mount: Sitzung puffert den letzten Zustand, `onState` liefert sofort den aktuellen.
- Doppelter Host bei Hash-Wechsel: Laufzeit nur im Startknopf-Handler erzeugen.
- Hintergrund-Tabs drosseln `setInterval` auf ≥ 1 s. Bei Playwright-Seiten ist das nicht der Fall; falls doch, Tick-Toleranz beachten (Deadlines sind absolut).
- Listener-Lecks: `on()`-Helfer gibt Abmeldefunktionen zurück, Screens sammeln sie.

**DoD (Outline):**
- Unit-Tests für Host und Client grün.
- `lobby.spec.ts` grün (3 Seiten, Podium auf allen).
- Test-ID-Vertrag erfüllt. Keine Konsolenfehler in E2E.
- Reload auf `#/host` landet auf `#/`.

### Schritt 6 — Design-System und Screens (Qualität)
**Ziel:** Der komplette Neon-Brutalismus nach §6: Tokens, Typo, Komponenten, Bewegung, Ton, Haptik, Wake Lock, Konfetti. Alle Meta-Screens (Start, Name, Lobby Host/Client, Intro, Ergebnis, Podium, Lost, Rejected) in Endqualität.

**Dateien:** `src/ui/{tokens,base,components,motion}.css`, `src/ui/{components,palette,sfx,haptics,wakelock,confetti,fx}.ts`, alle `src/ui/screens/*.ts` (Umbau auf Komponenten), `src/main.ts` (Fonts), `e2e/screens.spec.ts`, ggf. `public/favicon.svg` (Logo-Monogramm).

**Vorgehen:**
1. Font-Paket prüfen (wdth-Achse, §6.2) und Import festlegen (DECISIONS bei Fallback).
2. Tokens vollständig nach §6.1/§6.2. Keine Rohwerte in TS oder CSS außerhalb von `tokens.css`, außer 0/100 %.
3. `components.ts` nach §6.4: kleine Funktionen, die `HTMLElement` zurückgeben, Varianten über Klassen bzw. `data-`-Attribute.
4. `palette.ts` mit 8 Farben, Formen und SVG-Pfaden. Spiel-Akzente.
5. `motion.css` und `fx.ts` nach §6.5 inklusive `prefers-reduced-motion`.
6. `sfx.ts` (§4.7), `haptics.ts`, `wakelock.ts`, `confetti.ts`. Ton-Toggle auf dem Start-Screen, `unlock` bei der ersten Geste.
7. Screens nach §6.6 umbauen. Countdown mit `aria-live`, Ergebnisliste `aria-live=polite`. Offline-Darstellung.
8. `screens.spec.ts`: Fährt mit Host und 1 Client, `dev`, `fast`, `only=hammer` durch alle Screens (Start, Code-Eingabe offen, Name, Lobby Host, Lobby Client, Intro, Spiel-Fallback, Ergebnis, Podium, Lost über Schließen der Host-Seite).
   - Je Screen: Screenshot `test-results/screens/<name>.png`, `scrollWidth ≤ innerWidth`, alle `button` mit `boundingBox().height ≥ 56`, `data-screen` korrekt.
   - Separater Kontext mit `reducedMotion: 'reduce'`: Podium hat keinen `canvas`.
   - Für Lost per `fast`: Watchdog ist 6 s, nicht skaliert, also Timeout ≥ 20 s einplanen.

**Reihenfolge:** Tokens/Typo → Basis → Komponenten → Bewegung → Feel-Module → Screens einzeln → E2E.

**Risiken:**
- Test-IDs gehen beim Umbau verloren: `lobby.spec` muss grün bleiben.
- Schrift wird nicht gebündelt: Build-Ausgabe auf `.woff2` prüfen.
- iOS-Zoom bei Inputs < 16 px.
- Konfetti-Loop läuft nach dem Unmount weiter: `destroy` stoppt rAF.

**DoD (Outline):**
- Alle Gates grün, `screens.spec` erzeugt ≥ 9 Screenshots.
- Keine Hex- oder px-Zahlen außerhalb `tokens.css`/`palette.ts` (grep-Kontrolle, Ausnahmen begründet).
- Reduced-Motion-Check grün. Wake Lock und Ton fehlertolerant (keine Konsolenfehler in headless).

### Schritt 7 — Spiel-Views
**Ziel:** Vier spielbare Client-Darstellungen nach §5 mit lokaler Zeitmessung, Wiedereinstieg, Ton, Haptik und Effekten, auf den Komponenten aus Schritt 6. Dazu E2E-Bots je Spiel.

**Dateien:** `src/games/{blitz,hammer,farbfalle,schaetzfuchs}/view.ts`, `src/games/views.ts` (Registry füllen), `src/ui/screens/game.ts` (Header, Zeitbalken, Mount/Update der Spiel-Views), ggf. `src/ui/components.ts` (z. B. `bigNumber` mit Hochzähl-Animation), `e2e/bots.ts`, `e2e/games.spec.ts`.

**Vorgehen:**
1. Gemeinsam: `render(root, v, send, ctx)` gibt `Mounted` zurück. Lokale Timer über `setTimeout` und `performance.now()`, alle in `destroy` gestoppt. `data-state` immer aktuell. Eingaben auf `pointerdown`.
2. Die Views nach §5 umsetzen, mit Wiedereinstieg aus dem Fortschritt der Sicht.
3. `bots.ts`:
   - `playBlitz`: dreimal auf `data-state=go` warten, dann `blitz-pad` klicken.
   - `playHammer`: `btn-hammer` 15× klicken.
   - `playFarbfalle`: solange `data-state=play`: `ff-word[data-ink]` lesen und `ff-<ink>` klicken, gelegentlich bewusst falsch.
   - `playSchaetzfuchs`: `sf-input` füllen und `sf-submit` klicken.
   - `playRound(page)`: liest `data-game` und verzweigt.
4. `games.spec.ts`: Für jedes Spiel `?net=local&dev=1&fast=1&only=<id>`, Host allein, Runden 3. Pro Runde Bot. Danach `result-row` mit `data-points=5` und sinnvollem Label (Regex je Spiel, z. B. `/\d+ ms/`). Am Ende Podium.
5. Fallback-View bleibt für unbekannte IDs.

**Reihenfolge:** game.ts-Rahmen → hammer (einfachster) → blitz → farbfalle → schaetzfuchs → bots → E2E.

**Risiken:**
- fast-Dauern (Farbfalle 2 s, Blitz-Wartezeit 150–400 ms) sind knapp für Bots. Locator-Polling in engen Schleifen, keine festen `waitForTimeout` außer kurzen Polls.
- Farbfalle-Bot klickt nach dem Ende: Schleife bricht bei `data-state=done` ab.
- Ein Re-Render bei jedem Sicht-Update zerstört den lokalen Zustand: nur `update()` bei gleicher Runde.

**DoD (Outline):**
- `games.spec` grün für alle 4 Spiele.
- Alle bisherigen Suiten grün.
- Jedes Spiel setzt `data-state` laut Vertrag, keine Konsolenfehler.

### Schritt 8 — Komplettparty-E2E, Reconnect und Abschluss
**Ziel:** Nachweis des MVP-Gesamtablaufs: Host und 2 Clients, alle 4 Spiele, Podium, „Nochmal“. Dazu Reconnect mitten im Spiel, keine externen Requests im Local-Modus, Doku-Abschluss.

**Dateien:** `e2e/party.spec.ts`, `e2e/reconnect.spec.ts`, ggf. Fixes in `src/**`, `README.md` (Spielen, Entwickeln, Pages einmalig aktivieren), `ROADMAP.md` (Stand), `DECISIONS.md` (Nachträge), `ARCHITECTURE.md` (Dateischnitt kurz aktualisieren).

**Vorgehen:**
1. `party.spec.ts`:
   - Ein Kontext, 3 Seiten, `?net=local&dev=1&fast=1`.
   - Host „Karim“. Client A per QR-URL (aus `qr`-Attribut `data-url` lesen; dafür trägt die QR-Komponente `data-url`), Client B per Code-Eingabe.
   - Runden 5, Start. Schleife: Auf allen Seiten auf `intro` oder `podium` warten. Bei `intro` die `data-game` sammeln, dann `Promise.all(pages.map(playRound))`, dann auf `result` warten. Prüfen, dass `result-row` 3 Zeilen hat und die Punktesumme der Runde zu den Plätzen passt.
   - Nach 5 Runden: alle 3 Seiten zeigen `podium`. Gesammelte Spiele = alle 4 IDs. Die `podium-row`-Totals sind auf allen Seiten gleich.
   - Host klickt `btn-again`: alle zeigen `intro` mit Runde 1. Dann `btn-new` nach Abschluss oder direkter Abbruch-Pfad: die Lobby zeigt 3 Spieler.
   - Während des ganzen Tests: `page.on('request')`, alle Requests haben den Origin von `baseURL` (keine externen Requests), keine `pageerror`.
2. `reconnect.spec.ts`:
   - Host und Client, `only=farbfalle` (2 s, fast). Während `game` lädt der Client neu (`page.reload()`).
   - Erwartung: Auto-Rejoin ohne Name-Screen (§4.4), weiterhin genau 2 `player` beim Host, der Client sieht `game` oder `result` und erreicht das Podium.
   - Zusätzlich Client-Seite schließen: Spieler beim Host nach ≤ 8 s `data-online=false` (grau), Party läuft weiter.
3. Doku: README (Kurzanleitung Deutsch, Pages-Einrichtung), ROADMAP „Jetzt“ → erledigt plus nächster Schritt WG-Test, ARCHITECTURE-Schnitt, DECISIONS vollständig gegen §9 abgleichen.
4. Abschluss-Check: `npm run build` und Bundle-Größe notieren; `dist` per grep frei von `fonts.googleapis`/CDN-URLs.

**Reihenfolge:** party.spec (rot) → Fixes → reconnect.spec → Fixes → Doku → Gesamtlauf `npm test` dreimal hintereinander (Flake-Check).

**Risiken:**
- Flakiness bei 3 gleichzeitig aktiven Seiten mit fast-Dauern: Bot-Schleifen tolerant gestalten (Spiel kann vor Bot-Ende enden), Ergebnis-Phase mit 500 ms nicht verpassen (auf `intro` der nächsten Runde oder `podium` warten statt auf `result`, wenn `result` schon vorbei ist).
- Reconnect während der Farbfalle: Der Client setzt bei `next` aus der Sicht fort.
- Test-Dauer: Ziel < 60 s pro Suite.

**DoD (Outline):**
- `party.spec` und `reconnect.spec` grün, gesamtes `npm test` dreimal hintereinander grün, `npm run lint` grün.
- Alle 4 Spiele in der Komplettparty gespielt, Podium auf 3 Seiten mit identischen Totals.
- Keine externen Requests, keine Konsolenfehler.
- README, ROADMAP, ARCHITECTURE und DECISIONS aktualisiert.

## 11. Globale Risiken
- **PeerJS-Broker** ist im Gate ungetestet. Erster echter Test ist der WG-Test (ROADMAP). Der Code ist defensiv (Timeouts, `noroom`, `reconnect` beim Broker-Disconnect).
- **iOS Safari:** WebAudio nur nach Geste (`unlock`), Wake Lock ab iOS 16.4, `100dvh`, Zoom bei Inputs < 16 px.
- **Host-Handy im Standby** beendet die Party. Wake Lock mildert das, der Hinweis steht in der Lobby („Host-Handy anlassen“).
- **Reihenfolge der Abhängigkeiten:** Schritt 5 setzt eine stabile Engine-API voraus. API-Änderungen danach nur mit Anpassung der Tests im selben Schritt.

---
