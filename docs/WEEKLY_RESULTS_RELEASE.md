# Private weeks and automatic final results — October 20, 2026

Status: implemented locally; production activation and three-machine synchronization pending.

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
2. Apply `20261020211626_gtl_private_current_week.sql` (existing weekly-context and
   schedule tables), then `20261020211656_gtl_results_refresh_schedule.sql` (existing
   D-26 ledger and week-open administrator), then
   `20261020211737_gtl_group_settlement_results.sql` (existing reviewed-results read).
   Check preservation and permission boundaries after each apply.
3. Deploy compatible gtl-api with settlement provenance support; keep JWT enabled.
   Existing Pages is compatible and must not be replaced by an old build.
4. Deploy gtl-results-refresh with JWT disabled only on this machine endpoint;
   SQL verifies its expiring single-run capability before any data download.
5. Install disabled configuration using `supabase/admin/results_refresh_cron.sql`.
   Dry-run the source against Weeks 5/6/7; then enable, dispatch, verify actual
   ledger writes and group/member reads, and register the 30-minute cron.
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
existing D-26 grading/idempotence/correction tests. Production results are pending.

Brand QA: documentation uses the existing GTL document conventions; no new visual
assets or tokens are introduced.
