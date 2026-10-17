# Final branch check vs main

Verdict: **PASS_WITH_FINDINGS**

Gates:

cd /home/karim/projects/wg-arcade/.claude/worktrees/mvp; export PATH="$HOME/.local/share/herdr-web-ui/node/bin:$PATH"
- npm test -> test:unit: "Test Files 34 passed (34) / Tests 526 passed (526)" ; test:e2e: "32 passed (3.8m)"
- npm run lint (tsc --noEmit) -> exit=0, no diagnostics
- npm run build -> "✓ 123 modules transformed ... ✓ built in 127ms"
- npx vite (dev) on free port -> GET /wg-arcade/ 200, /wg-arcade/src/main.ts 200
- vite preview :43485 + 7 inline Playwright scenarios (peer + local) -> all completed, errors: []
- git status --short -> clean

## Findings
- [NOTE] Base has no runtime code, so a regression check is trivial — main (02cf12c) contains only README.md and .gitignore. The branch only appends to README (Spielen/Entwicklung/Pages sections) and adds `.vite/` to .gitignore. No behaviour existed on the base that the diff could break, so no base worktree was needed.
- [NOTE] Unknown room code ends on the 'VERBINDUNG ZUM HOST VERLOREN' screen — With both local and peer transport, joining a room that does not exist (e.g. #/j/QQQQ) shows the lost screen after about 10.6 s. This matches the DECISIONS entry 'Verbindungsfehler beim ersten Verbinden wie beim Reconnect'. The wording says the connection was lost, though this player was never connected. It is a UX wording point only.
- [NOTE] With real PeerJS, clients take about 16 s to notice the host is gone — I closed the host's browser context in peer mode. Both clients reached the lost screen after 16.3 s: WebRTC close detection plus the 10 s LOST_AFTER search. The design gives no time limit, so this is acceptable, but it is noticeably slower than local mode.
- [NOTE] Black-box run closes the gap left by the step-8 MINOR (reconnect points check) — The step-8 review said the reconnect.spec 'points > 0' check could pass on the reload round alone. In my peer run, Ben answered Farbfalle 3 times (+3), reloaded mid-game, answered 2 more (+5), and the host result showed Ben +5 with no duplicate row. So inputs sent after the reload do reach the host. The weak assertion in the spec itself is still there.

## DoD
- [x] Full test command green on the branch (run it yourself) — npm test: vitest 34 files / 526 tests passed; playwright 32/32 passed (3.8 min) on chromium with the local LD_LIBRARY_PATH/FONTCONFIG setup.
- [x] Lint/other gates green — npm run lint (tsc --noEmit) exit 0 with no output. npm run build OK (vite 8.3.4, 123 modules, peer chunk lazy-split). npm run dev serves /wg-arcade/ and src/main.ts with HTTP 200. git status clean afterwards.
- [x] Every user-facing behaviour the branch changes works end-to-end when exercised from outside (CLI/HTTP/script), not just in unit tests — Driven against vite preview on 127.0.0.1:43485 with inline Playwright scripts (temporary browser contexts only). Real PeerJS/WebRTC, default transport, separate contexts: host comes up in 1.6 s; join via the QR data-url and via a lowercase code; 3 Hammer rounds ranked correctly (5/3/2 points, totals add up); podium Host-only Nochmal/Neue Party; Neue Party goes back to the lobby with the same code; host close leads clients to lost. Blitz over peer: false start counts 1000 ms, no tap counts 3000 ms. Farbfalle reload mid-game: rejoin with the same score and no duplicate; a late joiner is rejected with 'Party läuft schon'. Closed players are removed from the lobby after about 6 s (D-5), and LOS GEHT'S is disabled again when only 1 player is left (non-dev). Offline players show data-online=false on result and podium. Local mode: 8 players with colors 0-7, duplicate names get ' 2' ('Anna 2', 'Karim 2'), the 9th player is rejected with 'Party ist voll (8/8)', start is disabled below 2 players without dev, the rounds-3 toggle works, clients have no host buttons. Raw BroadcastChannel fuzz: junk, bad pid, oversized and v:2 messages are ignored, empty or 13-character names are rejected as badname, and the host stays up. An HTML name renders as text. The name is pre-filled from localStorage and capped at 12 characters. #/host goes to start, invalid code shows the banner, btn-home goes to #/. The only external host contacted was 0.peerjs.com. No page or console errors.
- [x] No regression: behaviour that exists on the base and is touched by the diff still works the same unless the plan changes it on purpose — The base has only README.md and .gitignore, with no runtime behaviour. The README is only extended, and .gitignore keeps all existing entries and adds .vite/. Nothing to regress.
