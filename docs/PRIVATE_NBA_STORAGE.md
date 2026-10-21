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

Hosted status: pending; no production mutation at this source-review checkpoint.
The completion register and this record will be updated after verified apply.
