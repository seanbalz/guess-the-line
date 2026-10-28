# On-demand Fantasy details in Research — October 28, 2026

Owner: Codex · Approved Research/OPT-01 follow-through

The existing Fantasy screen previously shipped in the initial new-app dependency
graph. Research now loads that view and its dedicated styles when visited.
Shared static panels label the wait; the existing frame, Back and four-tab
navigation remain available. Code/style failures stay inside Fantasy with an
explicit retry, using the existing stylesheet-repair helper. Only code is cached
at this boundary; existing public-snapshot loaders keep their own cache policy.

A stable Fantasy content region receives route focus, so replacing the loading
heading cannot drop keyboard focus. Entry starts at the top, and the shell keeps
its existing Back restoration. Explicit retry focuses the same persistent region.
A late failed download cannot return a player to an abandoned view; reopening a
pending style repair cannot bypass it. Loaded code is reused across visits.
The existing in-memory filters survive tab navigation. Reload restores the week
from the existing URL contract and defaults filters; this adds no new persistence.

The ranking engine, player tools, data snapshots, scoring format, source/pace
labels and classic app remain unchanged. This is delivery of an existing
Research destination, not a new Fantasy feature or integration.

## Local asset measurement

Compared baseline `2db07ae00fd251f27335c9026823e2ac3909e3dc` with this source using
`vite build --mode cloud-test --manifest`, the same frontend-test Supabase URL/key
and `VITE_GTL_OFFER_NEW_APP=1`. Counts follow NextApp's static JS/CSS dependency
graph, including entry dependencies, excluding dynamic data/features. Gzip is
estimated locally per asset at level 9; this is not a production speed metric.

| Asset / graph | Before bytes | After bytes | Reduction |
| --- | ---: | ---: | ---: |
| NextApp JavaScript | 401,635 | 385,007 | 16,628 |
| NextApp CSS | 81,408 | 71,942 | 9,466 |
| Initial static graph (13 files) | 1,408,718 | 1,382,625 | 26,093 |
| Same graph, estimated gzip | 404,520 | 398,253 | 6,267 |

First opening adds 2 assets totalling 27,600 bytes (7,578 estimated gzip).
Once opened, the combined estimate is 1,311 gzip bytes larger than the eager
graph. The benefit is deferring optional detail assets at startup, not reducing
every journey's total bytes. No new API route or collection behavior.

## Verification checkpoint

The held-download regression failed against the eager implementation. Both new
browser cases now pass no Fantasy view request before visiting, no snapshot read
while code is held, Back/navigation, late rejection, local retry/focus retention,
module reuse, navigation filter retention and week restoration on reload.
The first reload assertion assumed persisted filters; it now follows the existing
memory-only filter contract. The stylesheet case covers repeated failures and
successful repair, including leaving/reopening during repair and styled content.
Eight 320px loading/error Light/Dark and forced-color captures were inspected;
axe and touch-target checks passed. All 468 Vitest tests, 37 shell/Fantasy-loader/
ranking/token/brand tests and typecheck passed. All 108 expanded browser cases
passed, including both app versions’ Fantasy, four-tab, Research, Lines, Trends,
shell and gesture cases. Both final focused cases also passed with a calibrated
Fantasy-read counter. Final fixture privacy and Brand QA passed. Fixtures do
not establish production readback, physical-phone or measured startup speed.

## Tracker correction

Q12–Q14's branch-only wording was stale. Source commit
`3785f26e7168bb0fb28f0d08018c944cc7e627a9` is reachable from current `origin/main`;
GitHub confirms [PR #269](https://github.com/seanbalz/guess-the-line/pull/269) merged
October 27 as `a6d655ed03b375e48b5159a70dd82ecd2b0030fb`. FantasyScreen imports
those existing tools. The queue and Fantasy document now record merged source,
with feature release/readback and device acceptance kept separate. This task
has not independently repeated a hosted tools audit or implemented those tools.

## Remaining checkpoints

Source branch: `codex/lazy-research-fantasy`. PR #304 merged as
`c73f7230c8435c2770eb1f031d9595576e07b20c` after all nine checks passed on
`2db07ae00fd251f27335c9026823e2ac3909e3dc`; no CI repairs or review findings.
This batch needs its own CI/merge, release/readback, signed-in performance and
physical-iPhone acceptance. Live/postponed/cancelled status and dependent
Bet/Challenge destinations stay open. No deployment, migration apply, new Fantasy
integration, scoring rule, collection budget or frozen v62 tracker change.
