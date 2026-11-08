# Registered titles and computed condition wording — November 7, 2026

Status: local scoped correction; independent re-review and integration pending.
Branch `codex/identity-wording-boundaries-2026-11-07` was created from freshly
fetched `origin/main` at `7aa93a6ffe79eafb58bd6c7d12ec230b6d77b0e9`, then
fast-forwarded to `049875b5557c6fef887f429d8c5ad26744b4379c`.
The read-only source checkout is `prism-shell-identity/betting-repo`.
The exact approved reference checkout remains
`3ac2eb50513ba73447ef890e4a47863cde7bdd76` at
`C:/Users/sbals/betting-repo-worktrees/owner-acceptance-2026-11-04`.
Its `selected-league-wording.js` and `LEAGUE_WORDING_REVIEW.md` establish
full league names in explanations and logos in navigation.

The original Node probe reproduced both registered short-card titles remaining
unexpanded: `team_ats|t:t_rookie_hc` and `total|any:t_rookie_hc`. The former
helper recognized only the atom `t_rookie_hc`. Expansion now requires the exact
registered composite ID and authored title, allowing the projection's initial
capitalization and its explicitly bound team suffix. A different/custom title,
an arbitrary ID, or a source-reported title stays literal. A regression runs the
real registry through `generateWeek`, `shortCard` and the native `TrendList`
renderer for both markets and with/without a team; it also checks raw IDs/keys
and the original projected objects.

Research's historical row caption and Why-it-applies dialog now use the same
source-reported exemption already used by its Conditions disclosure. The real
computed `t_rookie_hc` description expands in these two display surfaces.
The component regression renders both computed and source-reported descriptions
and verifies literal source titles, unchanged candidate objects and the raw-title
chart fingerprint. Its InfoButton body is exposed only in the SSR test; this is
not called a native source-reported capture.

The affected native title surfaces have no free-text title search. A focused
inspection of `TrendList`, `TrendLayer`, `WindowRecords`, `HistoricalTrends`,
`ResearchView`, `TrendsScreen` and `TrendBuilder` confirmed structured market,
team, family, period, condition and ID controls. Native Teams/Fantasy text search
uses unrelated team/player labels. No title-search haystack or server predicate
needed a change.

The new native browser case uses the actual snapshot builder, research provider,
reader, HistoricalTrends, chart and InfoButton controllers over local PGlite.
It limits the registry to the two existing rookie-coach presets and supplies
fictional future coaches/accounts. The real market gate exposes two Total
candidates; 1,424 committed public history rows determine their records. Both
themes show the expanded opened title, historical caption and Why dialog.
Selecting the baseline, opening/closing Why and selecting a historical table row
preserves the chart relationship and raw candidate ID. The four captures and
their source receipt are in
[the scoped manifest](../design/prism-identity-wording-boundaries-2026-11-07/evidence.json).
Expanded captures are full-page browser captures; global header/dock positions
remain native and held, without a new positional acceptance claim.

The earlier 114 capture files, 48 reference files and 38 identity assets retain
their exact hashes. The original 43-source receipt refreshes only the two changed
product files, the follow-up link in its document and the completion register. No old capture is relabeled
as fresh wording evidence. The cumulative reconciliation remains **38 paired,
zero unverified, five held**. Games PPG's bounded 78px full-name column,
Menu/saved-scope controllers, native 16px reading/actions/inputs, 13px metadata,
12px uppercase counters and 44px targets are unchanged. No layout, global frame,
avatar, NBA, award, API, SQL, reveal, scoring, data source or migration changes.

Verification commands and exact results are recorded in the scoped manifest:
85 focused component tests; 67 focused Node contracts including strict token and
import checks; native Menu/account and Research selection regressions; typecheck;
Brand document QA; cloud build; bundle privacy boundary; whitespace. The initial
three regression failures reproduced the two defects and the too-broad bare atom
boundary. The first browser run skipped because the new worktree lacked local
PGlite; after attaching that existing local dependency, all selected cases ran.
The new fixture initially expected four candidates; the actual market gate
correctly returned two Total rows, and its expectation was corrected. Existing
BiasChart key warnings and the build chunk-size warning remain. No full-suite,
hosted, physical-phone, push, PR, merge, apply or deployment claim is made here.
