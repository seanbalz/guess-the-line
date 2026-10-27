# Recorded movement selection — October 27, 2026

Owner: Sean Balsiger · Approved Research/chart follow-through · Source work

The game sheet's Line movement table now links collected-time buttons to the
matching plotted observations. Scrubbing or using the keyboard slider selects
the corresponding table row. Selection uses a check and tint, plus an outline
in forced colors. Buttons retain keyboard focus and 44px touch targets.

Missing lines or timestamps remain readable, nonselectable rows; they never
become invented chart points. Plot indices map back to original row indices,
so missing rows cannot shift the selected evidence. Duplicate timestamps have
distinct observation names. A single observation stays a static readout.
The elapsed-time axis, gaps, kickoff marker and original values are unchanged.
Changed evidence resets to the last plotted observation; equivalent rerenders
and closing/reopening the disclosure preserve selection. No new collection,
reader requests or writes result from selecting a row or chart point.

The missing-control browser regression failed before implementation and passed
afterward. It covers three valid observations among five rows, duplicate times,
missing values/times, pointer and keyboard selection, focus, disclosure state,
refresh, locked-market isolation and no additional detail reads. Local component
checks passed 57 tests; geometry/token/brand checks passed 30 tests. Typecheck,
Brand QA and fixture build/privacy checks passed.

The first integrated run passed 59 cases and exposed an existing Research-to-Play
focus race: Play focused the requested game before the shell's delayed navigation
frame focused the title. A deterministic held-frame regression failed before
the repair and passed after it. The shell now preserves an explicitly focused
destination on forward navigation; normal heading focus and Back restoration
retain their existing behavior. This is separate from Sean's corrected report
that the app does not have the scrolling bug.

Four 320px Light/Dark and forced-color movement screenshots were inspected.
All 85 final integrated browser cases passed across Research, Lines, Trends,
League bets, shell/navigation and per-game scoring. Source is in
[PR #265](https://github.com/seanbalz/guess-the-lines-repo/pull/265) on
`codex/market-movement-selection`. PR #265 merged October 27 as `63dbdaa3b5ebc39b89841f153f1f82682fc11689` after all nine checks passed on `0c0f2cd5fc3e7d36c1fe02a7767421c14693ece3`, with no CI code fixes or review findings.
Hosted release/readback and physical-phone acceptance remain open. No deployment, migration apply
or frozen v62 tracker changes are included.
