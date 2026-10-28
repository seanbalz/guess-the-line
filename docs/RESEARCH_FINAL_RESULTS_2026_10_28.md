# Recorded final results — October 28, 2026

Owner: Codex · Approved Research/chart stage 33 follow-through

The board already received final scores through its existing gated `/lines/read`
response and displayed a compact Final label. Its base schedule model carries
only kickoff, but `marketBoard()` adds the reader's final. The previous queue's
statement that the board lacked a verified final path was too broad; this batch
corrects that statement and completes a focused presentation step.

Recorded finals now have a separate Final section, with each matchup appearing
once. The final score uses the existing strong reading style, followed by its
result source and observed time in Pacific time. Commissioner-reported results
say so explicitly. Kickoff time is labelled separately from result observation.
All existing matchup actions, own-pick tags, team records and market gates stay
available. The shared card and metadata styles handle long sources at 320px;
no new tokens, assets or API requests are introduced.

A final requires a ready, scoped reply, matching game/team identity, a passed
kickoff in the base model, the reader's started flag, explicit final status and
two nonnegative integer scores. Zero and ties remain real scores. Missing,
negative, fractional or non-final scores stay out of Final. Missing or future
observation times are explicitly unverified; missing sources remain unavailable.
The remaining started group says **Kickoff passed**: elapsed schedule time does
not prove that a game is currently live. Loading/error states remove old final
scores and source metadata while keeping the full slate and saved guesses.

## Verification checkpoint

The new browser regression failed before implementation because the Final
section did not exist. The focused implementation case passed with zero score,
commissioner provenance, an incomplete final and a non-final result, all market
locks retained, narrow-theme accessibility and refresh failure. All 70 integrated
Lines/Research/Trends/gesture browser cases passed before integrating the
on-demand Trends source. After integrating Trends and main through #297, all
seven final board/Trends/dock/keyboard cases passed, including final/refresh behavior and code/stylesheet
recovery. All 116 focused component tests (including the viewport suite), the full
466-test Vitest suite, 41 board/model/token/brand tests, typecheck, Brand QA and
final fixture build/bundle privacy checks passed. Four final 320px Light/Dark and forced-color
screenshots were inspected; long source labels wrap, axe and touch-target checks
pass, and opening/closing the game sheet restores focus to the final card.

The browser uses the real local app/handler with fictional data; its recorded
finals and server clock are injected at the reader boundary. This verifies the
presentation and existing access gates, not real settlement, live provider
coverage or production acceptance.

## Paging correction before merge

Review found that moving a final card changed the visible board order while
the game sheet still used kickoff order. A regression reproduced the last
visible card opening as game 1 of 4. Opening now captures the complete displayed
slate order in memory, scoped to account/season/week. The sheet uses current
game labels and accepts only a complete permutation of its current slate;
missing, duplicated, unknown or cross-scope IDs fall back to kickoff order.
The order stays stable while paging and is excluded from URL/history state.
The final card now opens as game 4 of 4, pages to the actual preceding card and
returns focus to its opener. All three focused final/pointer/touch cases,
36 navigation/model/token/brand tests, the full 466-test Vitest suite and
typecheck passed after this repair. The fresh CI head is required before merge.

## Remaining checkpoints

Source branch: `codex/research-final-results`. CI/merge, frontend release,
signed-in readback and physical-iPhone acceptance remain open. Live scores,
verified live/postponed/cancelled status and their source/freshness behavior still
need a supported data path. The existing reader must not be described as a live
score feed. Bet/Challenge destinations and the remaining Play skip flow stay
open. This task performs no deployment, migration apply or frozen v62 change.
