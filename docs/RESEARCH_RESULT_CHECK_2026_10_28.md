# Check a recorded result in the game sheet — October 28, 2026

Owner: Codex · Approved Research/chart stages 33–34 follow-through

The Recorded result section previously required returning to the board for a
new observation, and direct opens from Trends had no result to carry. It now
offers **Check recorded result** in place after kickoff or when a board result
was captured. The existing stored `/lines/read` reader runs only on that action;
there is no new request on mount, focus or paging. One pending request is shared
by repeated clicks. No provider collection, API or migration change.

A successful check shows the selected game's returned final with source and
observed time, separately labelled with the server's check time. No complete
final returned is a distinct state, never zero. Zero and ties remain scores.
Missing source/future observation times retain explicit unverified wording.
The new observation updates this sheet only; the board keeps its existing
refresh policy. There is no claim that checking creates a live result feed.

Previous observations remain labelled while a check is pending or fails; retry
is explicit and keeps focus on the same button. Started games opened directly
from Trends can check without a board snapshot. Each game's completed checks
stay in the open sheet while paging, and are discarded when its account/week
or sheet lifetime changes. Pending reads abort on a game/scope change. Returning
to a game with an aborted check never leaves its button stuck disabled.

The response must match the requested season/week, selected game and team
identity, with valid server/kickoff times. Only the selected final and check time
are retained; market, price, pick and unrelated-game fields are discarded.
Delayed, wrong-week and wrong-team replies cannot replace the selected result.
The existing modal return-key protection and saved-guess/notes flows remain.
Nothing is written to URL/history, device storage or the database by this view.

## Verification checkpoint

Both focused result-sheet browser cases passed: an existing board observation
can be explicitly checked in place with one weekly read and retained focus;
a direct Trends open makes no automatic read, deduplicates pending clicks,
ignores a late reply after paging, cancels pending status on return, and recovers
error, missing-final and wrong-week states before showing a zero-score tie.
The direct-open fixture deliberately keeps a stale personal-week clock. The
existing game reader supplies current kickoff eligibility and is shared with
the market section; exactly one game read is made. Completed local observations
stay visible during that reader’s refresh. Fixture finals and times are not
production evidence.

Four checked-result 320px Light/Dark and forced-color screenshots were inspected;
axe and touch-target checks passed. Full Vitest (466), 59 result/navigation/
modal/model/token/brand tests and typecheck passed. All 95 final expanded
shell/Research/Lines/Trends/gesture cases passed after sharing the game reader,
along with Brand QA and the final fixture build/privacy scan. CI/merge results
will be recorded separately.

## Remaining checkpoints

Source branch: `codex/research-result-check`. CI/merge, release/readback and real
iPhone acceptance remain open. PR [#300](https://github.com/seanbalz/guess-the-lines-repo/pull/300)
merged as `7dda6d758a3218f1ec9286db4ce5ca901eb33444` after all nine checks passed on `a1ea585719d2e2361d32a0b3eff4fceec9d2623d`. Automatic
live/postponed/cancelled status still needs a supported source/time path. This
manual check does not complete that work. No deployment, migration apply,
scoring rule, collection budget or frozen v62 tracker change.
