# Research table recovery — October 27, 2026

Owner: Sean Balsiger · Approved Research/chart follow-through · Source work

A failed historical-table download previously reached the sheet boundary,
which dismissed Research. The table now has a local boundary using the shared
error-boundary component. Its error message and Try table again action stay in
the evidence section, preserving the chart point, period, evidence summary and
sheet controls.

Retry creates a fresh lazy table instance; it does not reload Research data,
change selection, write anything or reload the app. Keyboard focus moves to
the named historical-table group while the retry button is replaced, so it
stays within the evidence on either success or another failure. Repeated
failures retain the local action. Normal table loading keeps the static
skeleton from PR #272.

The browser regression failed before the change and passed after it: a blocked
table download can recover without another Research request or a lost chart
selection. Extended checks cover repeated failure, focus, linked table/plot
selection and narrow Light/Dark and forced-color error views. All 14 Research
browser cases and 53 integrated Lines/Trends/Bets Everyone/gesture cases passed
(67 total), as did 86 component tests, 19 token/brand tests and typecheck. Four
320px screenshots were inspected. Brand QA and fixture build/privacy checks
passed.

Source branch: `codex/research-table-recovery`. CI/merge, hosted release/readback
and physical-iPhone acceptance remain separate checkpoints. Verified live-game
status, dependent Bet/Challenge actions and the broader acceptance work remain
open. No deployment, migration apply or frozen v62 tracker change is included.
