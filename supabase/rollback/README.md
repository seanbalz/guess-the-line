# Rollbacks

Gate M step 9 of [the redesign build plan](../../docs/REDESIGN_BUILD_PLAN.md): before a migration that replaces a
function is applied to the hosted project, its rollback sits here and has passed on PGlite.

## The convention

- **One file per migration, with the migration's exact filename:** `supabase/rollback/<timestamp>_gtl_<name>.sql`.
  When the migration is stamped at merge, rename its rollback with it.
- **Previous bodies only.** The file holds `create or replace function` statements that put back the bodies the
  migration replaces, byte for byte as the newest earlier migration wrote them (the test compares md5s), plus
  `grant` or `revoke` lines when the migration changed a grant. Nothing else: never a `drop`, `delete`, `truncate`,
  `alter`, `insert` or `update`.
- **New things stay.** Tables and functions the migration added are not removed. The code's off switch
  (`GTL_FEATURE_OFF`) stops their use, and every row a player wrote stays (D-23). A new function that a deployed
  route already reads through `cloud/optional-rpc.mjs` (M-01's `gtl_live_rules`) is switched off by revoking the
  grant the migration gave the service role: the read fails and the route answers its fallback.
- **Fix-forward migrations have no rollback.** M-13, M-21 and M-23 add their version to `FIX_FORWARD` in
  `tests/migrations.mjs` instead.
- A migration newer than the stage 3 cut-off that replaces a function needs either a file here or a `FIX_FORWARD`
  entry; `tests/rollback.test.mjs` fails otherwise.

## Drafting one

```sh
node scripts/migration-functions.mjs --rollback supabase/migrations/<file>.sql > supabase/rollback/<file>.sql
```

It copies, for every function the migration replaces, the newest earlier definition. Review it before committing.
The same script prints the `-- replaces public.<name> md5 <hash>` header lines the migration itself needs
(`--headers`).

A header proves only which body its author meant to replace, not that the migration's body was rebuilt on it. When
a stale-copy failure tells you to update a header, copy the newest body first (`--function <name>` shows it), reapply
your change to it, and only then paste the new md5: pasting the `--headers` output alone passes the check and silently
reverts the change the other PR made. Reviewers diff the replaced body against `--function <name>` for the same reason.

## What the test checks

`tests/rollback.test.mjs`, for every file here:

1. The name matches a migration, the statements are only the allowed ones, every function the migration replaces
   is restored, and each restored body's md5 is the previous body's md5.
2. On PGlite: `HOSTED`, then the migration, then the rollback. Every replaced function's `md5(prosrc)` is back to
   the previous body, and what the migration added is still there. A migration that must follow a repo file the hosted
   project does not have yet (its ledger "Apply after", such as M-03 after M-01) lists it in `REQUIRES` in
   `tests/migrations.mjs`, and the check builds that file first, both here and for the suites in step 3.
3. The old-app SQL suites rerun on that database (`GTL_ROLLBACK_CHECK`, read by `tests/migrations.mjs`).

The same test runs a generated fixture (a migration that breaks `gtl_pick_points`, and its drafted rollback) to
show the suites fail without the rollback and pass with it.

## Applying one

A rollback is a hosted change like any migration: Sean's explicit OK, then the Supabase MCP `apply_migration` or the
SQL editor, then the Gate M step 7 checks (each restored function's `md5(prosrc)`, grants, one `pg_proc` row per
RPC, the score hash). Never `db push`.
