# Private weeks and automatic final results — October 20, 2026

Status: activated and verified October 20 at 22:02–22:05 UTC; release source merged and synchronized on all three machines. This closeout records hosted evidence.

Sean authorized fixing private groups stuck on Week 5 and connecting automatic
results, testing, deployment and synchronization before further additions.

## Scope and preservation

Private group context follows the newest published, opened schedule. Membership,
roster and practice flags remain enforced. Stored league JSON, historical ballots,
saved sportsbook references and selections are not rewritten. Upcoming unpublished
or unopened weeks cannot advance a group. Prior weeks remain in account history.

The results worker downloads the existing free nflverse games.csv once per run,
validates all selected published weeks before writes, and calls the existing
D-26 append-only settlement function. Identical finals are idempotent; corrected
finals create versions and regrade from saved terms. Missing scores stay pending.
This is final-result refresh, not an in-progress live score feed. Guess accuracy
points remain based on saved sportsbook references, not final scores.

This is a scoped operational repair using the deployed Virtual Units ledger.
It does not apply M-15/M-18 or enable unbuilt friend challenges. The broader
stage-56/M-19 dependency chain remains for those future features. The user's
October 20 instruction authorizes this separate scheduler and its enablement.

## Release order

1. Review source, pass exact-source CI, verify fresh hosted function bodies/grants,
   active runtime versions, published schedule and historical data hashes.
2. Deploy compatible gtl-api with settlement provenance support; keep JWT enabled.
   Existing Pages is compatible and must not be replaced by an old build.
3. Apply `20261020211626_gtl_private_current_week.sql` (existing weekly-context and
   schedule tables), then `20261020211656_gtl_results_refresh_schedule.sql` (existing
   D-26 ledger and week-open administrator), then
   `20261020211737_gtl_group_settlement_results.sql` (existing reviewed-results read).
   Check preservation and permission boundaries after each apply.
4. Deploy gtl-results-refresh with JWT disabled only on this machine endpoint;
   SQL verifies its expiring single-run capability before any data download.
5. Install disabled configuration using `supabase/admin/results_refresh_cron.sql`.
   Dry-run the source against Weeks 5/6/7; then enable the cron and verify actual
   ledger writes and group/member reads through the first scheduled 30-minute cron run.
6. Verify an actual scheduled run, privacy boundaries and unchanged historical
   Guess scores/ballots, record hosted versions and merge/sync evidence here.

Rollback: disable the results schedule; retain all recorded rows. Restore the
previous API bundle if needed and use the two named rollback SQL files for reader
behavior. Do not delete finals or reset players' picks. A bad final is corrected
through the versioned settlement function.

## Local evidence

Regression checks cover the stale Week 5 context, future-week refusal, unchanged
stored league state and roster, nonmember denial, final-result projection,
malformed feed refusal before writes, claim/replay/permission behavior and the
existing D-26 grading/idempotence/correction tests. The post-apply migration registry and rollover/collector regression checks passed (20 tests).

Brand QA: documentation uses the existing GTL document conventions; no new visual
assets or tokens are introduced.

## Production evidence — October 20, 2026

Reviewed source: `e8a2b4ab088850af82e0fafc34962eb71ca4747f`. All five PR #153
checks passed: Brand QA, Persona suite, Windows portability, Typecheck and test,
and dashboard (31m58s, including browser, performance, accessibility and model checks).
PR #153 merged at 22:02:37 UTC as `f9b89664dd15261bec454fa2378fc7f55ff4fcbd`;
the merged tree matched the tested source. No unrelated migrations were applied.

The backward-compatible API was deployed first, then these SQL files individually:

| Repository migration | Actual hosted version |
| --- | --- |
| 20261020211626 private current week | 20261020220305 |
| 20261020211656 results refresh schedule | 20261020220311 |
| 20261020211737 group settlement results | 20261020220318 |

API v26 is ACTIVE with JWT verification enabled, bundle SHA-256
`67d6c155a3b607187b0cf21c109fa2301317fe6f57da80f6bc93e05974231c94`.
All 46 hosted files matched the tested source. Results worker v1 is ACTIVE, bundle
`a7c66c4df8b65a8c898c87d96090bc43efd659e18d291b5f98edf6e845cc5dbd`;
all seven files matched source. Its own expiring capability authentication replaces
gateway JWT verification only for this machine endpoint. Missing and invalid
capabilities both returned 401. Existing Pages `0933a030-ff36-4a22-8cd7-fb2b7675863c`
and odds collector v4 were retained. The public live sign-in page loaded; no new
frontend build or human signed-in browser acceptance is claimed here.

The disabled dispatcher returned disabled before enablement. Fresh free nflverse
source at 22:03:39 UTC had SHA-256
`5341a67f44d3df5f7e87cc3b4fbdc3adf829e97a7ec7fdbf30d0c2fe6f16a087`: 15 Week 5
finals, 14 Week 6 finals and 14 pending Week 7 games. All matchup IDs matched
the published slates. No extra odds-provider request was made.

Cron job 5 uses `5,35 * * * *` UTC (every 30 minutes). Its first actual scheduled
execution, cron run 616 at 22:05:00 UTC, succeeded. Worker run
`ad611614-22f8-486b-9cc7-47607658be0c` finished successfully at 22:05:01.781891 UTC.
It recorded 29 version-1 finals and settled the two existing Virtual Units picks
(one win, one loss). Week 7 has no fabricated finals. No manual dispatch or test
pick was used to manufacture this scheduled evidence.

All five private groups and all nine active membership reads resolved to Week 7
with 14 games. A nonmember read was denied. New functions matched their source
body hashes and grants; dispatch is administrator-only, claim/complete and the
readers are service-only, security invoker, with empty search paths. New tables
have RLS. Boundary verification returned 262 denials from 268 probes; the six
remaining allowances are only the pre-existing unhosted Bets/comparison/preferences
RPCs. The full strict checker stops at the known unhosted gtl_bets_context (404);
no new results probe remains missing. This is not a claim that the unrelated full strict rollout is complete.

Before/after preservation (MD5 over identically ordered rows):

| Data | Count | Unchanged MD5 |
| --- | --- | --- |
| Stored private groups | 5 | a1f06fa4c7aadced4df70a33d57437fb |
| Complete ballots | 23 | a45bf0bf9c59e4543407f544e86d6987 |
| Week 5 Guess game scores | 135 | f641f11becc1748f7daf321fac8b5d38 |
| Week 6 Guess game scores | 168 | c2a4fc18a2d80c204e6b086f7b23987a |
| Original Virtual Units terms/timestamps | 2 | e21047bc9efc40ae093ca266a438c79f |

Bet status, result and audit intentionally changed through the existing D-26
settlement writer; saved terms and timestamps did not. No raw player data or
credentials are included in this record. The two reader rollback tests passed.

Windows main, Mini shared-sync and Neo main each passed sync:pull and sync:check
at f9b89664dd15261bec454fa2378fc7f55ff4fcbd, with zero ahead/behind/changed files.
The closeout PR records the subsequent evidence-commit CI/merge and sync outcome.
The two unrelated dirty Mini worktrees listed in the queue were preserved. Real-phone acceptance, a full future live
week and an in-progress live-score feed remain separate.
