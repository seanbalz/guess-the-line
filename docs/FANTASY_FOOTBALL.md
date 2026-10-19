# Fantasy Football rankings

Owner: Sean Balsiger. Requested October 15, 2026. Cloud release requested; deployment not yet verified.

The Fantasy tab is available in Community, the local/group sidebar, and the new
app. Community and the new app use `#fantasy`, including reload and browser Back.
It is independent of Guess scoring, player ballots, leagues and account data.

## Rankings and filters

- Weekly and rest-of-season estimated total points, with overall and position
  ranks. Overall compares fantasy points across positions; it is not draft value
  or value over replacement.
- Standard, Half PPR and PPR, independently selectable 4- or 6-point passing TDs.
- QB, RB, WR, TE, FLEX (RB/WR/TE), and K; team, player search, strong trends only,
  reset, and available season/week snapshots. D/ST explicitly remains unavailable
  because the current source does not establish fantasy defensive points allowed.
- Player details show sample size, matchup, public roster/report status and trend
  evidence. ROS shows total points, per-game pace and scheduled game count.
- Ranks are calculated before team/search/trend filters; filtering does not turn
  the fifth-ranked receiver into WR1. Ties at the displayed tenth share rank.
- Loading, missing, invalid, empty and stale states are distinct. A source older
  than seven days is labelled stale. The UI never substitutes another week.

The initial snapshot is **2026 Week 6**, using stats through Week 5. It includes
522 active-roster players: 370 have weekly estimates, 58 are on bye and 94 lack a
weekly estimate (including insufficient samples and reported unavailability).
419 have conditional ROS estimates. Week options list only generated snapshots;
there is no automatic refresh, expert feed, roster import or league integration.

## Model and scoring

For every stat, use **60% of the last three recorded appearances + 40% of the
season-to-date average**, strictly before the selected week. At least two recorded
appearances are required. These are labelled **GTL statistical pace estimates**.
The model has not been validated as a forecast. It makes no matchup, depth-chart,
rookie/prior-season, injury-recovery or playing-time adjustment. Games without a
player statistics row are not imputed as zero appearances.

Weekly estimates exclude non-active roster players, byes, unknown kickoff times,
and players reported Out or Doubtful. An active-roster designation is not proof
that a player will play. Public practice and game-status reports remain visible.
Bye teams have no weekly roster rows in nflverse; those teams use their most
recent prior roster, with the roster week displayed. Other teams require a roster
for the selected week.

ROS multiplies per-game pace by scheduled regular-season games from the selected
week through Week 18, including the selected week's game. It assumes the
active-roster player is available for every one of those games; it does not
estimate return dates or remove games already played within that same week.
Thus the UI says **Rest of season from this week**. Non-active players are omitted
rather than assigned an invented recovery date or zero projection.

Offensive scoring: 0.04 per passing yard, 4/6 per passing TD, -2 per interception,
0.1 per rushing/receiving yard, 6 per rushing/receiving/return TD, -2 per lost
fumble (including return fumbles), 2 per two-point conversion, and 0/0.5/1 per
reception. Kicker scoring: 3/4/5 per made FG at 0–39/40–49/50+ yards, +1 per PAT,
-1 per unsuccessful FG or PAT including blocked kicks. No distance/yardage bonus
or custom league rule is assumed. All weights are disclosed in the screen.
Missing required stats remain unavailable; they never become zero.

## Strong trends entering the selected week

Compare the last **two recorded appearances** with the previous **two to four**.
Both recent games must move in the same direction relative to the earlier mean.
A highlight also needs both the absolute and relative change thresholds:

| Metric | Absolute per-game change | Relative change |
| --- | ---: | ---: |
| Targets | 2 | 30% |
| Carries | 4 | 30% |
| Passing attempts | 7 | 20% |
| Fantasy points under selected scoring | 3 | 20% |

Zero baselines and incomplete samples receive no highlight. At most two
highlights are shown, preferring usage over fantasy scoring. Details show both
averages, sample sizes and last observed week. Rising/falling text and arrows
accompany color. These are observed shifts, not tested predictive advantages or
statistical-significance claims. Changing scoring can change scoring trends.

## Public sources, provenance and refresh

[nflverse data](https://github.com/nflverse/nflverse-data) is published under
[CC BY 4.0](https://github.com/nflverse/nflverse-data/blob/main/LICENSE.md).
GTL selects columns, normalizes team codes, aggregates statistics, computes pace
and ranks, and applies its disclosed scoring rules. Attribution, exact release
URLs, source update/retrieval times and SHA-256 checksums travel with each snapshot.
No photos, team marks, betting lines or private GTL data enter this pipeline.

The four sources are `stats_player/stats_player_week_2026.csv`,
`weekly_rosters/roster_weekly_2026.csv`, `injuries/injuries_2026.csv`, and
`schedules/games.csv` from the repository's release assets. See the
[nflverse update schedule](https://nflreadr.nflverse.com/articles/nflverse_data_schedule.html)
for upstream timing. No realtime update is promised.

The build verifies a complete 272-game, 32-team schedule, unique player-weeks,
both scheduled teams and opponents in every prior game's stats, selected-week
roster coverage (with bye fallback), and snapshot metadata. Source statistics must
end exactly one week before the selected week: current data cannot silently
produce historical pseudo-forecasts. A partial new week fails closed. Existing
snapshots remain unchanged on fetch, validation or checksum failure.

```sh
# Fetch public release metadata and CSVs, validate, then write snapshot + manifest.
node scripts/fantasy.mjs --season 2026 --week 6

# Verify a previously fetched cache against its manifest hashes without writes.
node scripts/fantasy.mjs --season 2026 --week 6 \
  --input-dir .local/fantasy-sources --check
```

The UI lazily imports the registered JSON from the same origin. Refreshing data
requires rerunning the command and rebuilding; no scheduled job was created.
Raw caches stay in ignored `.local/`. Committed fantasy JSON is an allowlisted
public subset under `shared/fantasy/`. Historical snapshot files stay available.

Published expert rankings were not copied: the
[FantasyPros API terms](https://www.fantasypros.com/api-data/) require suitable
access and licensing. This implementation has no paid source or account dependency.

## Local verification

Focused engine, source-normalization and UI tests cover scoring, rank stability,
ROS/bye handling, incomplete data, temporal leakage, sustained trends, CSV
normalization and source validation. Browser checks exercise filters and mobile
layouts against the committed public snapshot and isolated fictional accounts.
Verified after the final UI fixes: typecheck and the cloud-test production build
passed; 26 fantasy engine/builder tests and 8 render tests passed; 29 related
navigation tests passed. All four focused browser tests passed, including 12
app/theme/viewport combinations (classic and new app, dark/light, 320/390/1280px),
keyboard navigation, 44px controls and axe accessibility checks. Initial browser
runs exposed ambiguous nested filter labels; the final rerun passed after the
label fix. A rounding regression was also fixed and tested so displayed tenths
match ranking tie groups.

The public snapshot is a lazy chunk, approximately 53 KB gzip (781 KB before
compression); Vite reports its standard large-chunk warning. No private source
files are bundled by this feature. The live site and hosted accounts were not
validation targets, and no deployment or scheduled refresh was performed.


## Cloud release preparation — October 15, 2026

Sean requested “Add on cloud too” after the local implementation checkpoint. The release
is frontend only: no API deployment, migration, collector, cron, data budget or
app-default change. Preparation was isolated from the original active checkout.

Live Cloudflare readback identified production deployment
`ed3fb50b-388b-4330-8767-8bd08adb9255`, source
`b883c7742979d133720ed931c520821fdc4a13b5`. Fantasy was transplanted onto that exact
source, preserving its real Home/Play/Bets/Lines/League screens, game sheets,
unsaved-form navigation guard, and enabled “Try the new app” offer. The
unrelated planning edits in the original checkout were not included.

Fresh preflight on the isolated source passed typecheck, 69 focused Node checks,
8 render checks, document brand QA, the production frontend build and private
bundle scan. The live boundary probe returned 229 expected denials and 10
explicitly awaiting checks for M-02, M-03, M-05, M-06 and M-08. Those migrations
were not applied by this task. These denials do not establish signed-in behavior.

Other release work was active, so no separate Pages upload was started. The
reviewed Fantasy commit should join the serialized production release rather
than overwrite a newer deployment. Deployment ID, source SHA, served-file hashes
and post-deploy results must be recorded before this document calls it live.
Rollback is the previously selected Pages deployment; preserve hosted data.


### Integrated release candidate

[PR #143](https://github.com/seanbalz/guess-the-lines-repo/pull/143) integrates
current main through `bb4f20a` and preserves its capability-gated legacy scoring
flow. The Fantasy diff remains 29 files with no API or migration change. At
implementation SHA `4211847c5fcb09dd47600bfbc0c2a5da26d18163`, the branch matched
its remote with zero ahead, behind or changed files.

The integrated candidate passed typecheck, 69 focused Node checks, eight render
checks, brand QA, production build/bundle scan, and all five scoped browser tests
(four Fantasy suites and six-tab navigation/history). Browser coverage includes
320/390/1280px, dark/light themes, keyboard focus, axe, scoring/filter/ROS/trend
behavior and 44px source links. These are local synthetic-account tests, not
production sign-in or physical-phone acceptance.

Its clean-source manifest records source SHA-256
`0e77db217c905094c834654209c27daefbabb3d1bab304dc16b75953b654ee21`
and frontend SHA-256
`1a006b90947a0ce15498cf9de327e18c26459550f637f73acacd75c33c1c2586`
(96 build artifacts). This manifest is a prepared build, not deployment evidence.
GitHub PR checks were still running when this entry was written.

At 1:38 PM Pacific on October 15, the Gate D Thursday freeze was active. The
shared production workflow also checks the published game's broader quiet
window; it has no bypass input. The active release task was already awaiting a
one-time timing decision. No competing upload, API deploy or migration apply was
started by this task. Merge/green CI alone must not be described as the Fantasy
tab being available on the production site.

The separate HOSTED-migration Play suite passed all four local browser cases:
legacy full-market submission/editing, no `lockIn` writes, recoverable drafts and
retry requests, independent sit-outs and the Thursday deadline. CI then found
that the classic app's keyboard navigation budget still counted three Community
tabs. The new fourth tab adds one expected stop; the budget and explanatory text
were updated from 12 to 13, with all focus and ballot-entry assertions retained.
That complete keyboard-only journey passed locally. The final PR includes this
additional test file (30 files total); fresh CI remains required.
