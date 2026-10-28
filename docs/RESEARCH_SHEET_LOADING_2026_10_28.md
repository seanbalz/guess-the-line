# On-demand full Research sheet — October 28, 2026

Owner: Codex · Approved Research/chart follow-through and OPT-01

The full weekly/matchup Research sheet previously shipped in the initial new-app
bundle. Its frame, scoped title and close confirmation stay in ResearchSheet;
ResearchView now loads its existing filters, data reader, charts and source views
on opening. Shared static panels say Loading research details. Close and Escape
work while code is pending, and closing restores focus to the original control.

Download failures stay local, with explicit retry and focus in a stable details
group. The small shared Research stylesheet stays eager, so a failed game-detail
preload cannot strand the full view unstyled. Successful code is reused across
openings and a late failure cannot reopen a closed sheet. No research read starts in this
view while its code is held. Existing read failures keep their own data
retry behavior after the view loads.

MatchupResearch moves into its own module for the game sheet. Inline candidates
still load with game details; they do not require the full sheet's controls.
Shared ResearchCards code loads with whichever detail view needs it first. A
source comparison confirmed the full-view markup and inline component
body are identical to the prior implementation. Filters, periods, source times,
records, chart selection, market gates and reader scope rules remain unchanged.
The new content group preserves the original 16px gaps with shared classes.

## Local asset measurement

Compared baseline `25236cc486b81bd3b34697c635b6348c660e69fd` with this source using
`vite build --mode cloud-test --manifest`, the same frontend-test Supabase URL/key
and `VITE_GTL_OFFER_NEW_APP=1`. Counts follow NextApp's static JS/CSS dependency
graph, including entry dependencies; dynamic data/features are excluded. Gzip
is estimated per asset at level 9. These are asset counts, not page-speed metrics.

| Asset / graph | Before bytes | After bytes | Reduction |
| --- | ---: | ---: | ---: |
| NextApp JavaScript | 385,007 | 363,616 | 21,391 |
| NextApp CSS | 71,942 | 71,942 | 0 |
| Initial static graph (13 files) | 1,382,625 | 1,361,234 | 21,391 |
| Same graph, estimated gzip | 398,253 | 392,024 | 6,229 |

First full Research opening adds 2 assets, 22,755 raw bytes (8,440
estimated gzip), for a combined estimate 2,211 gzip bytes larger than the old
eager graph. First game-detail opening changes from 2 assets (27,467 raw /
9,031 estimated gzip) to 3 assets (46,592 raw / 15,857 estimated gzip),
because it now loads the shared research presentation too. Including the initial
graph, that game-first journey is 597 gzip bytes larger. The tradeoff is
less optional code at startup, with extra detail requests; no claim of a smaller
whole journey or a production speed improvement.

## Verification checkpoint

The held-download regression failed against the eager implementation. The new
loading case covers a usable frame, held/failed code, close/focus return, late
rejection, explicit retry with retained focus, no research reads while held,
successful data load, period changes and code reuse. A separate regression
reproduced an unstyled full Research view after a game-detail stylesheet failure
when both views shared deferred CSS. Keeping the small shared stylesheet eager
avoids coupling one loader's style recovery to another. The cross-view regression
checks styled filters after that failure and passes on the final build. All five
final focused cases passed, including source times, weekly/matchup filters and stale-scope suppression.
Eight 320px loading/error Light/Dark and forced-color screenshots were inspected;
axe and touch-target checks passed. All 468 Vitest tests, 56 chart/shell-state/
modal/gesture/token/brand tests and typecheck passed. All 110 broad browser
cases passed on the initial split, before retaining the shared CSS eagerly.
The final five focused cases passed after that adjustment; final game-detail
stylesheet retry and inline research integration also passed. The broader
repeat was stopped after its first 23 passing cases to finish the scoped final
checks. Final fixture privacy and Brand QA passed. This is local fixture
evidence, not hosted/device acceptance.

The earlier Fantasy batch's 37-case Node label is clarified as Fantasy-loader/
ranking/token/brand coverage; shell behavior was covered in its browser suite.
The current 56-case set explicitly includes the shell-state/modal/gesture files.

## Remaining checkpoints

Source branch: `codex/lazy-matchup-research`. PR [#306](https://github.com/seanbalz/guess-the-line/pull/306) merged as
`3387457f69d0724c3faf04a51c552fe151df4fb1` after all nine checks passed on
`25236cc486b81bd3b34697c635b6348c660e69fd`. Reviews/threads were empty; no CI repair.
This batch needs its own CI/merge, release/readback, signed-in performance and
physical-iPhone acceptance. Live/postponed/cancelled status and dependent
Bet/Challenge destinations stay open. No deployment, migration apply, new data
provider, scoring rule, collection budget or frozen v62 tracker change.
