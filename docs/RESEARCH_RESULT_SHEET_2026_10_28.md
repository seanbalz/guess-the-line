# Recorded board result in the game sheet — October 28, 2026

Owner: Codex · Approved Research/chart stages 33–34 follow-through

Opening a Final card previously lost its score and result provenance in the
game sheet. The sheet now carries the board's already permitted result into a
Recorded result section beneath the matchup. It shows the same score, source,
observed time and commissioner-reported label. The copy says **Recorded when
opened** and directs the player back to the board for updates. This is an
observation captured on opening, not a live score or a newly refreshed result.

The in-memory board context already carries the scoped paging order. It now
also carries its server time and an allowlisted final record for each completed
matchup. A shared guard requires the same account, season, week and complete
current slate. The selected game ID, both teams, started state, explicit final
and nonnegative integer scores are revalidated before rendering. Zero and ties
remain scores. Changed accounts/weeks/slates, missing records and mismatched
identity show no captured result. Direct opens without a board context keep the
existing game sheet; they do not manufacture a result.

Paging shows only the selected game's captured result. A corrected result from
a later board refresh does not silently change an open sheet's labelled
observation; reopening captures the board's newer result. Opening and paging add
no `/lines/read` request. Existing game-line/notes readers, market locks and
saved-guess behavior are unchanged. Only final scores and result provenance
travel in this context; quotes, prices and picks are not copied. The context
stays out of URL/history state and is not persisted to device storage.

The section uses the existing card, heading, reading and metadata styles. Long
source names wrap at 320px in Light, Dark and forced colors. No API, migration,
provider, asset, token or global style change.

## Verification checkpoint

The browser regression failed before implementation because the Recorded result
section was absent. The focused case passed with the final score and source,
zero preserved, paging to/from an unfinished game, no new weekly read and no
result context in history. Four 320px Light/Dark and forced-color screenshots
were inspected; axe and touch-target checks passed. The full 466-test Vitest
suite, 53 navigation/model/token/brand tests and typecheck passed. Model checks
cover account/week/slate/game mismatches, missing state, before-kickoff snapshots
and removal of injected pick/market fields. The first 72-case integrated run passed 71 cases and caught a focus-return gap:
refreshing the board recreates the opener while its sheet is open. The repaired
case now passes correction-while-open, new capture on reopening and restored
focus to the recreated card. Board cards carry opaque return keys scoped to
their current account/week generation; modal close can reconnect only the same
key. A changed scope invalidates even a reused DOM node. Unkeyed openers retain
their prior behavior. All 55 navigation/model/modal/token/brand tests and the full
466-test Vitest suite passed after repair. All 94 expanded final shell/Research/Lines/Trends/gesture browser cases passed,
along with typecheck, Brand QA and final fixture build/privacy checks.

Browser finals and server clock are fictional injections into the existing local
app/handler reply; this is UI/access regression evidence, not production final
collection, settlement or signed-in/physical-device acceptance.

## Remaining checkpoints

PR [#300](https://github.com/seanbalz/guess-the-lines-repo/pull/300) merged as
`7dda6d758a3218f1ec9286db4ce5ca901eb33444` after all nine checks passed on head
`a1ea585719d2e2361d32a0b3eff4fceec9d2623d`. Reviews and review threads were
empty; no CI repair was needed. Source branch: `codex/research-result-sheet`.
Release/readback and real iPhone acceptance remain open. PR #299’s repaired
paging head is merged; see the [recorded-final merge evidence](RESEARCH_FINAL_RESULTS_2026_10_28.md).
The next [explicit in-sheet check](RESEARCH_RESULT_CHECK_2026_10_28.md) covers
direct opens after kickoff. Live/postponed/cancelled status remains separate
work. No deployment, migration apply or frozen v62 change.
