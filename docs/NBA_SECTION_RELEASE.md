# Guess The Line — NBA section release card

Owner: Sean Balsiger · Version 1 · October 21, 2026

Status: **code complete and locally verified; not released.** This card records
what the [approved design](superpowers/specs/2026-10-21-nba-section-design.md)
and [implementation plan](superpowers/plans/2026-10-21-nba-section.md) need
before a release. It establishes no hosted migration, secret, API or Pages
change, no provider connection and no physical-phone acceptance.

## Release prerequisites (Sean)

1. Add `BALLDONTLIE_API_KEY` to the Supabase Edge Function secrets for the
   existing project. It is read only by `gtl-api` (`Deno.env`); it never belongs
   in Git, chat, a Vite variable or the browser. Without it `/nba/games` answers
   an honest unavailable state (no provider call, no empty "successful" slate)
   and ticket tracking still works.
2. Approve applying the two additive NBA migrations below, individually and in
   order. Never run a generic `supabase db push` against this project.

## Source

Draft [PR #167](https://github.com/seanbalz/guess-the-lines-repo/pull/167),
branch `codex/nba-section-design`. Its PR comment and final CI record the exact
head commit; deploy only from that reviewed commit after it merges to `main`.

## Migrations, order and dependencies

| Order | Repository file | SHA-256 | Depends on |
|---|---|---|---|
| 1 | `20261021223000_gtl_nba_app_bets.sql` | `fdd6f8a0b4ae1fc222af90e4fe1c8c0223fc78fbc1119f9188a7662a8f0ebb30` | archive `20261021201054` (hosted `20261021205118`) |
| 2 | `20261021223100_gtl_nba_game_cache.sql` | `d4d1a97d2e129a8ff6d6e66c273e1c22dc325c0169423128faea23311aee894a` | archive `20261021201054` (hosted `20261021205118`) |

Both versions sort after every hosted migration (latest hosted: `20261021205118`,
read on October 21, 2026) and are listed in `NOT_HOSTED` in `tests/migrations.mjs`.
Neither depends on an unapplied NFL migration (M-10, D-53). Migration 1 adds
revision/update columns and an append-only `nba_private.bet_changes` receipt
table, archive-preservation triggers and the service-only RPCs
`gtl_nba_read_bets` and `gtl_nba_save_bet`. Migration 2 adds the NBA-only
`game_cache`/`game_provider` tables and the service-only RPCs
`gtl_nba_claim_games` and `gtl_nba_finish_games`. No table in `nba_private`
gains a grant; `anon` and `authenticated` cannot execute any NBA RPC.

## Deployment order

Migrations 1 and 2, then `gtl-api` (adds `/nba/read`, `/nba/save`,
`/nba/games`), then Pages (adds the NFL/NBA selector to both apps). Pages must
not ship before the API: the selector would open screens whose routes do not
exist yet. An API deploy before the migrations answers the NBA routes with
"not available right now" (feature off) and is safe.

## Preflight and preservation

- Exact source and green CI on the merged commit; fresh `list_migrations`.
- Before and after each migration, hash the archive and NFL sentinels: every
  `nba_private.bets` row (`id, owner_id, import_id, season, event_date, kind,
  label, legs, odds, stake_units, outcome, net_units, provenance, source_record`)
  and `nba_private.bet_imports` (`id, owner_id, source_sha256, source_payload,
  imported_at`), plus the existing social bets, ballots, scoring and Virtual
  Units hashes from the standard release checklist. All must match after apply.
- After apply: `anon`, `authenticated` and `service_role` still cannot select
  any `nba_private` table; `service_role` can execute only the four NBA RPCs;
  `Accept-Profile: nba_private` stays rejected; security advisors add no warning.

## Post-deploy verification

- `npm run check:cloud`, then `--strict` once the NBA entries are live; remove
  the NBA `awaitingDeploy` entries in `scripts/boundary/bets.mjs` in the change
  that records the hosted versions.
- Signed in as the archive owner: My Bets/History read back the archive exactly,
  with unchanged net units; a second account sees no tickets.
- One authenticated `/nba/games` read returns `unavailable: false` with a
  `BALLDONTLIE` observation time. Until that succeeds the real source is not
  verified; fixture results are not hosted acceptance.

## Rollback

`supabase/rollback/20261021223000_gtl_nba_app_bets.sql` and
`supabase/rollback/20261021223100_gtl_nba_game_cache.sql` revoke the RPC
capabilities and preserve every ticket, original source, revision, receipt,
cached game and provider budget. API and Pages roll back to their previous
versions; the NFL application does not depend on any NBA object.

## Local verification — October 21, 2026

Recorded in the PR #167 comment for the pushed head: `npm run check` (typecheck,
Node tests with zero skips, Vitest, build), the NBA Node/Vitest suites, the six
NBA browser scenarios (both apps), the shell/four-tab/app-switch browser specs,
the full cloud-browser suite, rollback and migration registry tests, Brand QA
and the cloud bundle privacy scan. Open: real provider readback, hosted
permission checks and physical-iPhone acceptance. The NFL/NBA selector sits
in the new app's top bar and, in the old app (default, `?app=classic` and the
new app's crash fallback), after each screen's skip link and header, so the
skip link stays the first Tab stop; it adds two Tab stops before Community
content (the keyboard persona budget moves from 13 to 15).
