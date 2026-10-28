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
locks retained, narrow-theme accessibility and refresh failure. Further
integrated checks are in progress. 105 Lines/team/Research/chart/Trends component
tests, 41 board/model/token/brand tests and typecheck passed. Final narrow visual
and source-publication results will be recorded before handoff.

The browser uses the real local app/handler with fictional data; its recorded
finals and server clock are injected at the reader boundary. This verifies the
presentation and existing access gates, not real settlement, live provider
coverage or production acceptance.

## Remaining checkpoints

Source branch: `codex/research-final-results`. CI/merge, frontend release,
signed-in readback and physical-iPhone acceptance remain open. Live scores,
verified live/postponed/cancelled status and their source/freshness behavior still
need a supported data path. The existing reader must not be described as a live
score feed. Bet/Challenge destinations and the remaining Play skip flow stay
open. This task performs no deployment, migration apply or frozen v62 change.
