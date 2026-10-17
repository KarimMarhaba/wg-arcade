# mvp — Schritt 1: Gerüst & Gates (Abgleich)

Master-Plan §1, §2, §4.5, §7.2, §8, §9 (D-0, D-8), §10 Schritt 1. Repo hat bisher nur Doku (3 Commits, kein `package.json`).
Jeder Shell-Aufruf: `export PATH="$HOME/.local/share/herdr-web-ui/node/bin:$PATH"`.

## 1. Abgleich (gemessen 2026-10-17)
| Annahme | Befund | Korrektur |
|---|---|---|
| Node 22, aarch64, Browser 1243, Lib-Ordner | stimmt (Node 22.23.2, npm 10.9.8). Mit `LD_LIBRARY_PATH` auf den Lib-Ordner zeigt `ldd` der Headless-Shell 0 fehlende Bibliotheken, ohne 8 | – |
| Playwright 1.63.0 braucht 1243 | stimmt: `browsers.json` von 1.63.0 = chromium + chromium-headless-shell 1243 | `executablePath`-Fallback **nicht** einbauen |
| Versionen aktuell | vite 8.3.4, vitest 5.0.5 (peer vite ^8 ok), typescript 7.0.2, peerjs 1.5.5, qrcode 1.5.4, @types/qrcode 1.5.6, fontsource-variable 5.3.0 | – |
| Actions `checkout@v4`, `setup-node@v4`, `upload-pages-artifact@v3`, `deploy-pages@v4` | **veraltet** (Node-20-Laufzeit). Aktuell: checkout v7, setup-node v7, upload-pages-artifact v5, deploy-pages v5 | aktuelle Hauptversionen nehmen, in DECISIONS festhalten |
| Bricolage hat eine Breitenachse (§6.2 „prüfen“) | `index.css` hat **nur wght**. `wdth.css` hat wght 200–800 und `font-stretch 75%–100%` | `@fontsource-variable/bricolage-grotesque/wdth.css` importieren, Space Grotesk über `index.css`. Damit ist die Prüfung aus §6.2 erledigt |
| `GameId` für `only` | gibt es erst ab Schritt 2/4 (`games/types.ts`, `GAME_IDS` in `games/index.ts`) | jetzt `src/games/types.ts` mit `GAME_IDS` (as const) + `GameId = (typeof GAME_IDS)[number]` anlegen. Spätere Schritte ergänzen die Datei, `games/index.ts` re-exportiert nur (reversibel) |
| Pages eingerichtet | Repo öffentlich, `GET …/pages` = 404, also nicht eingerichtet | README-Hinweis schreiben, Pages **nicht** selbst per API einschalten (macht Haupt-Session/Karim beim Merge) |
| README (§8) | steht nicht in der Dateiliste von Schritt 1 | README um die Pages-Einrichtung ergänzen |

## 2. Entscheidungen & Fallen
- **TS 7.0.2 ist der native `tsc`** (Binärpakete je Plattform). Seit TS 6 ist `types` standardmäßig leer: `types [vite/client, node]` explizit lassen.
  `noUncheckedSideEffectImports` ist standardmäßig an. CSS-Importe lösen über `declare module '*.css'` aus vite/client auf, das Fontsource-Wurzelpaket über `index.d.css.ts`.
  Meldet `tsc` trotzdem Fehler: zuerst den Importpfad korrigieren. Eine Prüfung abzuschalten oder auf Fallback-TS (`^5.9`/6.x) zu gehen, kommt erst danach und gehört dann mit Begründung in DECISIONS.
- **Exakt pinnen:** `npm i -D -E @playwright/test@1.63.0`, sonst schreibt npm `^1.63.0`. Nie `playwright install`/`install-deps`.
- **Lockfile für alle Plattformen** (npm-Bug bei vorhandenem `node_modules`): Das Lockfile frisch erzeugen. Danach muss es die x64-Bindungen enthalten (`@rolldown/binding-linux-x64-gnu`, `lightningcss-linux-x64-gnu`, `@typescript/typescript-linux-x64`), sonst scheitert CI auf x64. Fehlen sie, `node_modules` und Lock löschen und neu installieren.
- **Freier Port:** Den Port-Helfer mit `process.execPath` statt nacktem `node` aufrufen, weil Node nicht im Standard-PATH liegt. `process.env.E2E_PORT ??= …`, damit Haupt- und Worker-Prozess denselben Port nutzen. Dazu `--strictPort`, `reuseExistingServer: false`.
- **Lib-Env:** `launchOptions.env` ersetzt die Umgebung komplett. Deshalb `...process.env` übernehmen und ein vorhandenes `LD_LIBRARY_PATH` anhängen. Architektur über `os.arch()` → `{arm64:'aarch64', x64:'x86_64'}`. Nur setzen, wenn **beide** Pfade existieren. In CI bleibt alles unverändert.
- **Vitest-Include** nur `src/**/*.test.ts`. Das Standard-Muster würde auch `e2e/*.spec.ts` einsammeln und dort an `@playwright/test` scheitern.
- **`parseFlags`-Semantik** (reversibel festgelegt): Ein Schalter ist an, wenn der Parameter vorhanden ist und sein Wert nicht `0`/`false` ist.
  `net` ist nur bei `local` gleich `'local'`, sonst `'peer'`. `fast` im Ergebnis ist der **wirksame** Wert (`dev && fast`), `speed` ist 10 oder 1.
  `only` ist nur mit dev **und** einer bekannten Id gesetzt, sonst `undefined`. Leerer String und führendes `?` funktionieren beide.
- **Smoke prüft `pageerror` und `console`-Fehler.** 404 bei Schrift oder Favicon zeigt sich nur als Konsolenfehler, und §7.4 verlangt „keine Konsolenfehler“.
  Das Favicon in `index.html` als `/favicon.svg` referenzieren, Vite setzt beim Build `/wg-arcade/` davor (im `dist` nachprüfen).
- **„WG·ARCADE“** benutzt den Mittelpunkt U+00B7, in App und Test identisch. `index.html` mit `<meta charset="utf-8">` und `lang="de"`.
- **Token-Namen** genau aus §6.1 (Teilmenge: `--bg*`, `--ink*`, `--s1..s8`, `--font-display`/`--font-text` mit dem Namenszusatz „ Variable“). Schritt 6 ergänzt, ohne umzubenennen.
- **TDD-Reihenfolge:**
  - (a) Gerüst-Commit: Deps, Lock, tsconfig, die drei Configs, `index.html` mit leerem `#app`, Workflow.
  - (b) Test-Commit: `src/config.test.ts` + `e2e/smoke.spec.ts`. Rot festhalten: Vitest findet `./config` nicht, beim Smoke fehlt `[data-screen=start]`.
  - (c) Impl-Commit. `lint` darf nur im Test-Commit rot sein.
- Nicht pushen, nicht mergen.

## 3. Dateien (nur Nicht-Offensichtliches)
- `src/games/types.ts`: in diesem Schritt nur `GAME_IDS` + `GameId`.
- `src/main.ts`: importiert die Bricolage-`wdth.css`, Space Grotesk, `tokens.css`, `base.css`, dann `startApp(#app)`.
- `.gitignore`: `.vite/` ergänzen. `README.md`: Pages-Einrichtung (Settings → Pages → Source „GitHub Actions“ bzw. `gh api`-Einzeiler).
- `DECISIONS.md`: anhängen, mit Datum 2026-10-17. Inhalt:
  - D-0 mit den tatsächlich genutzten Versionen, auch ob TS 7 oder Fallback, plus Zusatz-Deps und `wdth.css`
  - D-8
  - die neueren Action-Hauptversionen
  - `GAME_IDS` in `games/types.ts`

## 4. DoD
1. `package.json`: `private`, `"type": "module"`, die Skripte `dev`/`build`/`preview`/`test`/`test:unit`/`test:e2e`/`lint` wortgleich nach §1, `@playwright/test` genau `"1.63.0"`, Laufzeit- und Dev-Deps nach D-0. `package-lock.json` ist committet und `npm ci` läuft lokal durch.
2. `package-lock.json` enthält `@rolldown/binding-linux-x64-gnu`, `lightningcss-linux-x64-gnu` und `@typescript/typescript-linux-x64`.
3. `npm run build` erzeugt `dist/index.html`. Skript-, Style- und Favicon-Verweise beginnen mit `/wg-arcade/`, die Schrift-`woff2` liegen in `dist/assets`, es gibt keine externe Schrift-URL.
4. `parseFlags` ist durch `src/config.test.ts` belegt: Defaults bei `''`, `net=local`, unbekanntes `net` → `peer`, `fast` ohne dev → `fast:false`/`speed:1`, `dev`+`fast` → `speed:10`, gültiges `only` mit dev → Id, unbekanntes `only` bzw. `only` ohne dev → `undefined`. Die Ids kommen aus `GAME_IDS` in `src/games/types.ts`.
5. `npm run lint` prüft `src`, `e2e`, `vite.config.ts`, `vitest.config.ts` und `playwright.config.ts` mit den tsconfig-Optionen aus Schritt 1.2 (strict, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, …).
6. `npm run test:e2e` ist auf diesem Server grün. Der Smoke läuft gegen `vite preview` des Builds auf einem frei gewählten Port unter `/wg-arcade/` und prüft: `[data-screen=start]` sichtbar, `h1` enthält „WG·ARCADE“, kein `pageerror`, kein Konsolenfehler.
7. `playwright.config.ts` folgt §7.2 (workers 1, Timeouts, 390×844, `hasTouch`, trace/screenshot nur bei Fehlern). Die Lib-Env wird nur gesetzt, wenn die Ordner existieren. Es gibt keinen `executablePath`, und es wurde kein `playwright install` ausgeführt.
8. `.github/workflows/pages.yml`: läuft bei `push` auf `main` und per `workflow_dispatch`, mit den Rechten und der `concurrency` aus §8.
   - Build-Job: `npm ci` → `lint` → `test:unit` → `build` → `upload-pages-artifact@v5` (`dist`)
   - Deploy-Job: `deploy-pages@v5`, Environment `github-pages`
   - checkout@v7, setup-node@v7 (Node 22, `cache: npm`)
9. Platzhalter-App: `index.html` hat `viewport-fit=cover`, `theme-color #0c0b10` und das Favicon. `app.ts` rendert `<main data-screen="start"><h1>WG·ARCADE</h1></main>`. `tokens.css` nutzt die Namen aus §6.1, die Schriften sind gebündelt.
10. `DECISIONS.md` hat die neuen datierten Einträge (siehe §3), die README beschreibt die Pages-Einrichtung.
11. TDD: tests written first (separate test-commit before impl), meaningfully cover the change, red→green captured

## 5. Out-of-Scope
Echte Screens, `h()`-Helfer, Netz/Engine, vollständige Tokens/Typo (Schritt 6), E2E-Helfer, Prüfung auf externe Requests (Schritt 8). Pages per API einschalten, pushen, mergen.
