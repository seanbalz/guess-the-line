# Prism final CI read accounting — November 7, 2026

Owner: Sean Balsiger. Status: locally reproduced and corrected; independent
review, parent integration and fresh exact-source CI remain open. No deployment.

Work started from freshly fetched `origin/main` at
`7aa93a6ffe79eafb58bd6c7d12ec230b6d77b0e9` and fast-forwarded in an owned
worktree to the frozen rollout source
`1ba236960dfb8050538ba762b35e40eb2799e071`. Branch:
`codex/prism-final-ci-read-fix-20261107`.

## Failure and root cause

Parent-observed [CI run 42443053640](https://github.com/seanbalz/guess-the-line/actions/runs/42443053640)
failed Cloud browser shard 2/4 only in the team lazy-download case, originally
`tests/cloud-browser/next-lines.spec.js:602`. Its final `/lines/game` assertion
expected at most two reads and observed three; the other 110 shard cases passed.
The parent confirmed shards 1/3/4, dashboard and personas passed. This record
does not claim a new whole-branch CI run.

The test started recording after the team opener became visible. The approved
compact `GameOverview` renders outside `GameDetailsSlot`'s lazy boundary, so
that button can paint before `GameDetails` mounts its readers. Depending on
download/dispatch timing, the old recorder includes either zero or one initial
game-detail read, followed by one read on each of two actual Back returns.
This is an observation race; the measured product did not repeat reads in a loop.

Source traced: `GameLayer.jsx` renders `GameOverview` before the lazy slot;
`GameDetails.jsx` mounts `useGameLines`, `MatchupResearch` and `GameNote`;
their existing readers dispatch `/lines/game`, `/lines/research` and
`/personal/notes`. Navigating to a team unmounts those game details. Returning
mounts them again. Team records use the existing shared cached season store.

The original unmodified case passed locally (1/1). A temporary diagnostic then
held the actual `GameDetails-*.js` download until after the old recorder attached,
released it, and observed the initial detail mount before opening TeamView.
That controlled schedule reproduced the exact CI assertion: expected <=2,
received 3. The diagnostic kept all original geometry, focus, retry, lazy asset,
no-write and no-own-team-read assertions. No synthetic API-count increment was used.

The actual request/mount timeline from that failing run, milliseconds since test
start, was:

| Time | Observed phase | Game-detail API requests |
|---|---|---|
| 3,354 | Team opener visible; game mounted, detail heading absent | None |
| 3,360 | Recorder attached; release held GameDetails download | None yet |
| 3,638–3,645 | Initial detail mount, before first team open | One research, one notes, one game |
| 3,681 | Game and detail heading mounted | No additional reads |
| 3,737–3,754 | TeamView held; team mounted, game/details absent | None |
| 3,772–3,779 | First Back mounts game details | One research, one notes, one game |
| 4,087–9,006 | Failed team download, Light/Dark and forced-color checks, explicit retry, held retry and loading checks | None |
| 9,027–9,032 | Second Back mounts game details | One research, one notes, one game |
| 9,102 | Loaded team reopened; game/details absent | None |

The first mount additionally read `/officials/read` once, using the existing
cache thereafter. TeamView JavaScript was requested three times across the held
failure/reopen/explicit-retry sequence, with no later request on loaded reopen.
TeamView requested no stylesheet. No `/lines/teams` request or mutation was
observed during the recorded game/team phases. Natural timing separately passed
when the initial detail never mounted before leaving for the team; it then read
only on the two returns. Diagnostic output and source copies remain ignored in
the owned worktree's `.local/` directory.

## Correction and retained gates

Only `tests/cloud-browser/next-lines.spec.js` changes executable behavior:

- Record API calls before initial game opening and require exactly one initial
  request on each of the three identified game-detail routes. Synchronize the
  known initial referee read too, before asserting zero-read team phases.
- Save only those verified initial route counts. The aggregate return assertion
  subtracts those counts and retains its original <=2 allowance; it does not
  discard unrelated initial calls or raise a bound.
- Require exactly one request per detail route on each actual Back and enforce
  <=1 per return for all four previously bounded routes, including `/lines/read`.
- Assert zero API requests while the team is held, through failure/retry/theme/
  forced-color checks, and on loaded-team reopen. The complete call history
  still rejects writes using the unchanged read allowlist and rejects all
  `/lines/teams` reads.
- Run the same case with natural timing and with the real initial detail
  download deliberately held until the overview is visible and the recorder is
  active. The delayed variant asserts the game read has not started before
  releasing that download. Both variants keep every existing phone/axe, focus,
  Back, late-failure, retry and lazy-request assertion.

No controller, route, effect, request contract, layout, token, font, import gate,
skip, timeout or retry allowance changed. All committed PNGs and manifests remain
untouched. The delayed-download regression is permanent; temporary timeline
instrumentation is excluded from the committed test.

## Focused local verification

Windows, Node 24.11.0, Chromium/Playwright, PGlite 0.5.8. The owned worktree uses
non-overwriting dependency junctions and an ignored config derived from
`playwright.cloud.config.js`, with exclusive port 5294 and owned build/output
directories. The config changes only local paths/port; fixture credentials and
the real app/handler/migration set stay the same.

Commands from the owned checkout:

```powershell
node node_modules/@playwright/test/cli.js test --config .local/playwright.final-read.config.js next-lines.spec.js next-data.spec.js -g 'team details load only|the team view draws styled|game details wait for opening|team season results and margin bars share selection|once this device has seen'
node node_modules/@playwright/test/cli.js test --config .local/playwright.final-read.config.js next-lines.spec.js -g 'team details load only'
node --check tests/cloud-browser/next-lines.spec.js
python -X utf8 scripts/check-brand-docs.py
git diff --check
```

The six focused cases passed, with zero failures/skips (54.3s): natural and
delayed team cases, first-opening styled team, held/failed game details, team
chart/season selection without extra reads, and bounded shared account reads
while lobby is held. After tightening aggregate subtraction to exclude only the
three proven initial requests and synchronizing the initial referee request,
both changed team cases passed again (26.0s); the four other cases were unchanged.
Syntax, Brand QA and whitespace checks passed.
The browser server's build passed, retaining its existing >500kB chunk advisory;
Node also reported the existing FORCE_COLOR/NO_COLOR warning. Plain `python`
initially hit Windows' cp1252 decoding error before running Brand QA; the explicit
UTF-8 command above passed without changing the checker.

No product or TypeScript source changed, so typecheck and strict token/import
suites were not rerun. No full suite or CI rerun was requested here. This is
local fixture evidence: fictional authenticated accounts, real handler and all
local migrations, committed historical trend inputs and fixture book values.
It does not verify live odds, production data, actual phones, source reuse
rights, deployment or hosted acceptance. No SQL was applied, no hosted writes
were made, and this work was not pushed or opened as a PR. The frozen v62 tracker
is unchanged; the completion register links this scoped record.
