# Weekly-trend recovery in game sheets — October 28, 2026

Owner: Codex · Approved Research/chart follow-through

The game and All trends sheets could explain a failed weekly-evidence read but
provided no local way to retry it. They now expose **Refresh weekly trends**,
or **Retry weekly trends** after an error, through the existing shared reader’s
retry function. It refreshes the displayed week’s historical context. Market
quotes, matchup research, recorded finals and personal notes keep their existing
independent readers and controls.

The secondary button remains mounted and focusable while the existing loading
status/skeleton is shown; `aria-disabled` and `aria-busy` communicate the wait,
and the handler ignores activation while loading. The shared reader deduplicates
pending requests and retains its account/week guards. The same button keeps
focus after recovery, a stale fallback or an access refusal. No app reload,
navigation, scoring write or automatic extra refresh is introduced.

Existing data rules govern replies: ordinary outages can keep the last loaded
week, with stale/refresh-unavailable wording and provenance; access refusals
hide the active sheet’s old groups. Missing evidence remains missing, and locked
Spread/Total records stay behind their independent market gates. Source times,
records and chart values are unchanged. This adds no endpoint or provider
collection behavior and does not establish live-game status.

## Verification checkpoint

The browser regression failed against the prior source because the retry control
was absent. It now passes initial refusal, in-sheet retry, held loading,
duplicate activation, successful recovery, stale fallback, a later refusal that
removes old groups, recovery in All trends, retained button focus and the locked-
market leak scan. After the initial game setup, only `/trends/week` is requested
by these actions. Eight 320px Light/Dark and forced-color error screenshots were
inspected; axe and touch-target checks passed.

The full 466-test Vitest suite, 35 shared weekly-loader/state/token/brand tests
and typecheck passed. All 98 expanded shell/Research/Lines/Trends/gesture
browser cases passed, along with final fixture privacy and Brand QA checks. All failure responses and player data here are local fixtures, not
hosted readback or actual-phone acceptance.

## Remaining checkpoints

Source branch: `codex/research-weekly-trend-retry`. PR #302 merged as
`97c45a23e594e2490d3993c3266c8aa068012ab1` after all nine checks passed on
`bb96fa182bd1978640027ac18f535f0ec8cbeee2`; no CI repairs or review findings.
This batch needs its own CI/merge, release/readback and real iPhone acceptance.
Live/postponed/cancelled status and the dependent Bet/Challenge destinations stay
open. No deployment, migration apply, scoring rule, collection budget or frozen
v62 tracker change.
