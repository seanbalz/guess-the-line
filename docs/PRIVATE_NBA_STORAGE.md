# Guess The Line — private NBA archive

Owner: Sean Balsiger · Version 1 · October 21, 2026

## Scope and authorization

Sean requested a separate private NBA area in Supabase and import of the saved
NBA ledger, separate from the NFL application and its totals. That instruction
authorizes this additive migration and the private data import. It does not
launch an NBA application, connect a results collector or change NFL records.

The migration creates `nba_private.bet_imports` and `nba_private.bets` in the
existing Supabase project. Records reference their owner's `auth.users.id`;
credentials and profile fields are not copied. Supabase Auth holds sign-in
accounts; `public.gtl_profiles` holds the app's display names.

## Privacy and accounting

- The schema and both tables deny `PUBLIC`, `anon`, `authenticated` and
  `service_role`. RLS is enabled and forced with no policies. Database
  administrators can maintain the archive; the NFL client and its service role
  cannot read or write it. No API exposure, RPC, view, cron or app route is added.
- Each import retains its complete original source, fingerprint and timestamp.
  Tickets preserve their original IDs, terms and result provenance. Clarified
  provenance is recorded separately without rewriting the source.
- Net units are generated from each ticket's odds, stake and result, rounded to
  eight decimal places. Pending tickets have no net result; a parlay has one
  stake and one result. Defaults remain labelled as defaults.
- Imports are atomic and idempotent. Reusing a receipt or ticket ID with
  different data fails instead of overwriting existing records. Account and
  receipt ownership are enforced together. Account deletion is restricted while
  archive records exist, pending an explicit retention/deletion workflow.
- Raw input, import SQL, identities, selections and private verification results
  stay outside this public repository. Git synchronization does not copy them.

## Release card

Migration: `20261021201054_gtl_private_nba_storage.sql`.
Apply independently after its reviewed PR and required CI; no prerequisite
frontend/API deployment or unapplied NFL migration is needed. Existing NFL
runtime versions remain compatible because their objects are untouched.

Before apply: verify the schema is absent, owner exists, exact migration source
and CI, and fresh hashes of social bets, ballots, scoring and Virtual Units.
Apply only this migration through the Supabase connector. Import only the
reviewed private ledger using `scripts/nba-private-import.mjs`.

After apply: compare readback to the private source, confirm generated net
units and duplicate protection, test app-role denial, verify RLS and unchanged
NFL hashes, inspect security advisors and record the actual hosted version.
The rollback file seals permissions and preserves all stored data.

Local verification: PGlite tests cover exact retries, rollback preservation,
cross-account conflicts, invalid data, generated accounting, app-role denial
and RLS defense in depth. Registry and function-header tests also apply.

## Hosted verification — October 21, 2026

[PR #163](https://github.com/seanbalz/guess-the-lines-repo/pull/163) merged at
20:51:06 UTC as `8c445a561ed60e9a98672ef70535c8e12228d4ad`, after independent
review and all five checks passed on `bad213bae11969ec1a0c76c3918989ebc0c51308`:
[Tests](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/39669196707),
[Dashboard and personas](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/39669196425),
and [Brand QA](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/39669196529).
Local checks also passed: 17 focused tests, the rollback convention, 11 rollback
regression scenarios, TypeScript, Brand QA and the cloud bundle privacy scan.

- Repository migration `20261021201054` applied through the GTL Supabase
  connection as hosted version **`20261021205118`**. Migration SHA-256:
  `db6dcaff7276900562a03405a1e24907f7b6a44d0cf65c570d4f4e925ba7b157`.
- The fresh 20:51:10 UTC preflight confirmed the schema absent and owner account
  present. The private import committed at 20:51:31 UTC. Readback matched every
  ticket field, original source record, generated net result and import receipt.
  Actual selections, identities, totals, source fingerprints and the full
  before/after receipt remain in private storage, outside this repository.
- Both tables are owned by `postgres`, with RLS enabled and forced and no
  policies. Actual queries under `anon`, `authenticated` and `service_role`
  were denied for both tables. No NBA function or realtime publication was added.
- The Data API rejects `Accept-Profile: nba_private` with HTTP 406/PGRST106;
  only `public` and `graphql_public` remain exposed.
- Social bet state, all ballots, historical scoring, NFL slates, Virtual Units
  picks/settlements and all public function bodies/grants matched their fresh
  pre-apply hashes after import. No NFL records, runtime assets or collectors
  were changed. Duplicate-import behavior was tested in disposable PostgreSQL.
- Security advisors added only two informational notices for RLS without
  policies, intentional for administrator-only archival tables. No new warning
  or error was added. See the [Supabase linter explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
- The existing default cloud boundary check passed with 262 denials. Its six
  recognized future RPCs still await the three unrelated Bets/comparison/
  preferences migrations. The strict variant stops at that existing unhosted
  Bets RPC; this is not claimed as a strict pass or resolved by applying unrelated
  migrations. The separate NBA permission and API-exposure checks passed.

The evidence PR body records its final CI, merge and synchronization receipt.
The private import is complete; an NBA application and automatic NBA settlement
remain separate future work. Supabase Auth stores account credentials (passwords
are [hashed](https://supabase.com/docs/guides/auth/password-security)); profiles
and NBA records remain separate tables linked by account ID.
