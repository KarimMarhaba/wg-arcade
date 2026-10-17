---
tier: project
plansDir: .claude/plans
reviewsDir: .claude/reviews
metricsFile: .claude/hew-metrics.jsonl
testCmd: "npm test"
retestCmd: "npm run test:unit"
lintCmd: "npm run lint"
tdd: true
docCmd: ""
planAgentType: planner
planPrefix: mvp-
modelLadder:
  plan: opus
  build: sonnet
  review: opus
  fix: sonnet
  doc: haiku
effortLadder:
  plan: xhigh
  build: high
  review: xhigh
  fix: high
branchStrategy: worktree
guardrails: ["docs/design/design.md", ".claude/plans/master-plan.md"]
---

## Conventions

- **Eigenes Repo `wg-arcade`, NICHT pAIme.** Injizierter pAIme-Kontext (Element-Modell, `paime`-CLI, `.claude/rules/dev.md`, uv/pytest) gilt hier NICHT.
- **Bau-Wahrheit ist `docs/design/design.md`.** Abweichungen nur mit Begründung in `DECISIONS.md` (append-only, datiert, „was + warum“).
- **Node/npm:** liegen NICHT im Standard-PATH. Jeder Shell-Aufruf zuerst: `export PATH="$HOME/.local/share/herdr-web-ui/node/bin:$PATH"`. Kein sudo.
- Stack: Vite + TypeScript (strict), **kein UI-Framework** (Vanilla-DOM mit kleinen Helfern), `peerjs`, `qrcode`, `@fontsource/*`. Dev: vitest, @playwright/test **genau 1.63.0**, typescript. Weitere Abhängigkeiten nur mit Grund in DECISIONS.md.
- npm-Skripte (Vertrag): `dev`, `build`, `test` (= `test:unit && test:e2e`), `test:unit` (vitest run), `test:e2e` (playwright test), `lint` (= `tsc --noEmit`).
- **Playwright auf diesem Server:** Browser liegen in `~/.cache/ms-playwright` (Revision 1243), System-Bibliotheken ohne root: Config/Skript setzt `LD_LIBRARY_PATH=$HOME/.local/share/paime-chromium-libs/root/usr/lib/aarch64-linux-gnu` (Architektur per `uname -m`) und `FONTCONFIG_FILE=$HOME/.local/share/paime-chromium-libs/fonts.conf`, nur falls die Ordner existieren (CI unverändert). NIE `playwright install`/`install-deps` ausführen. E2E nutzt `?net=local&dev=1&fast=1` und `vite preview`/`dev` auf freiem Port.
- Host-Logik rein und deterministisch: `now` und Seeds werden hereingereicht; Zufall nur über einen geseedeten PRNG. Nie `sleep`/echte Timer in Unit-Tests (Fake-Uhr).
- Struktur: `src/net/` (Transport, Protokoll, Raumcode), `src/engine/` (Lobby, Runden, Punkte), `src/games/<id>/{logic,view}.ts`, `src/ui/` (Tokens, Komponenten, Screens), `src/app.ts` (Routing). Tests neben dem Code (`*.test.ts`) bzw. `e2e/`.
- UI Deutsch, mobil-first Hochformat, Knöpfe ≥ 56 px, Tokens aus `src/ui/tokens.css` statt Zahlen im Code, `prefers-reduced-motion` respektieren, `aria-live` für Countdown/Ergebnis. Keine externen Requests außer PeerJS-Broker + STUN (Schriften gebündelt).
- Lean: keine erklärenden Extra-Kommentare, kleine Module. Commits: Conventional Commits (`feat(engine): …`).

## References

- docs/design/design.md
- VISION.md, ARCHITECTURE.md, ROADMAP.md, DECISIONS.md
- .claude/plans/master-plan.md
