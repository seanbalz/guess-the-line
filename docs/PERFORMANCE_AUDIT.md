# Guess The Line performance audit

Owner: performance_audit worker · October 8, 2026 Pacific · Version 1

Status: local implementation and bounded browser verification. This is not a production release or a physical-phone performance acceptance.

## What changed

Sign-in now loads authentication and the shared shell first. The lobby loads after authentication; the league dashboard loads when a game opens. Solo, Bet Tracker and Design Lab load their code and associated extracted styles when selected. Spread and Total entry remain in the opened league bundle, so switching into the primary pick flow does not require another screen chunk.

Each deferred screen has a named loading status and an error boundary. A failed optional chunk leaves navigation usable. Recovery requires an explicit **Reload page** action; there is no automatic reload, automatic resubmission or background optional-screen request. Account-specific component keys remain in place. This follows [React's lazy component contract](https://react.dev/reference/react/lazy) and uses [Vite's asynchronous chunk loading](https://vite.dev/guide/features.html#async-chunk-loading-optimization).

## Measured build evidence

The baseline is the production build captured before this pass at `.local/performance-before`; the candidate is `.local/performance-after`. Both used cloud mode, a Vite manifest and the same production configuration. Counts include each entry's transitive static imports and styles. Deferred imports are excluded until their screen opens. Gzip figures are local compression estimates, not observed CDN transfer sizes.

| Signed-out first load | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| JavaScript | 744,252 bytes | 466,950 bytes | 37.26% |
| JavaScript, local gzip estimate | 212,530 bytes | 135,632 bytes | 36.18% |
| CSS | 150,249 bytes | 80,489 bytes | 46.43% |

Opening all screens eventually loads 762,171 JavaScript bytes, versus 744,252 in the baseline. This change defers optional work; it does not claim to reduce the total application size. The candidate also includes concurrent draft-recovery fixes from this implementation pass, so the full-build byte difference is not solely splitting overhead. Opening a league after the lobby brings the total JavaScript closure to 686,058 bytes. Asset names, byte counts and SHA-256 hashes are in [the machine-readable audit](../planning/audits/frontend-bundle.json).

No chunk exceeds Vite's default 500 kB warning threshold in this measured build. This is a build observation, not a performance score.

## Behavior verification

`node node_modules/@playwright/test/cli.js test --config playwright.performance.config.js`

Three isolated tests use the actual compiled chunks and a synthetic account with every external request intercepted:

1. Signed-out pages do not request lobby, league, Solo, Bet Tracker or Design Lab chunks, or make game API requests. Sign-in loads the lobby, opening a game loads the league, and opening optional screens loads their matching chunks. The league still exposes all 15 prediction fields.
2. A deliberately delayed Design Lab chunk displays **Loading design lab…**; the user can navigate to picks while it waits. Releasing the chunk allows the screen to open.
3. A deliberately failed Design Lab chunk displays a contained error. Picks remain usable, and the screen recovers after the user explicitly reloads. No write request is issued by either recovery scenario.

These tests do not submit real picks, contact the hosted project, use the odds provider or replace account/privacy acceptance. Existing integrated authentication, Solo, full-slate and mobile suites remain required for release.

## Limits and outstanding acceptance

The `web-perf` skill was read. Its Chrome DevTools prerequisites, `navigate_page` and `performance_start_trace`, are not present in the available tool catalog. The skill says: “If unavailable, STOP—the chrome-devtools MCP server isn't configured.” The DevTools trace workflow therefore was not run; the independent repository/build and deterministic browser work above continued within the authorized scope.

| Requirement | Evidence status |
| --- | --- |
| Defer optional panels | Implemented and verified with real compiled chunk requests |
| Loading and chunk-failure recovery | Verified in synthetic browser tests |
| LCP, INP, CLS, FCP, TBT, Speed Index | Not measured; no rating assigned |
| Hosted CDN transfer/caching behavior | Not audited by this pass |
| Actual iPhone load, interaction, zoom and assistive technology | Not performed |
| Same-account phone/desktop state consistency | Not performed; requires authenticated device acceptance |
| UX-03 complete contrast and screen-reader acceptance | Still open; unchanged by bundle evidence |
| OPS-05 physical-phone performance exit | Still open; bundle evidence is only partial progress |

Trace measurement needs the Chrome DevTools integration configured, followed by a bounded authenticated cold-load and interaction trace. Physical-device acceptance still needs an actual target phone. Neither prerequisite justifies inventing metrics or calling those tracker items complete.

## Repeatable audit

Build separate outputs before and after a candidate change with `--manifest` and `--mode cloud`; never point the public static server at the repository root. Then run:

```sh
node scripts/audit-frontend-bundle.mjs .local/performance-before .local/performance-after planning/audits/frontend-bundle.json
node node_modules/@playwright/test/cli.js test --config playwright.performance.config.js
```

The dedicated test server uses port 5188 and `.local/performance-test-dist`, leaving the current production-matching preview on port 4173 untouched. This worker made no hosted migrations, deployments, provider calls, real-player writes or Git publication.

Source/date: repository source, generated Vite manifests and isolated browser request checks; October 8, 2026 Pacific. Canonical visual guidance: `docs/BRAND_GUIDE.md` and `design/tokens.json`.
