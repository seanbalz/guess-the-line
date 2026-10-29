# NBA navigation and EPL release reconciliation — October 29, 2026

Owner: Sean Balsiger · Version 1

Sean requested: "hide the nba section of the app" and "deploy all epl items, projects, tasks, tools asap", confirming English Premier League.

## Change and preservation

Remove NBA from the NFL and EPL sport switch. Saved NBA deep links still open the existing private records and retain unsaved-draft guards. No table, ticket, API, migration, collector, quota or schedule changes are required. Existing GTL Segmented controls and tokens are retained. Reverting the navigation commit restores the NBA option.

## Live EPL evidence

Read-only Supabase checks on October 29 verified:

- `gtl-api` v42 ACTIVE with JWT verification; bundle SHA-256 `81c4c8087d4a5afdf8815ff06a4b0aedcfb7ab1aba6ac6cfe85ff037c6a8ce1a`.
- `gtl-epl-jobs` v1 ACTIVE; bundle SHA-256 `f98a1926615540ac5fb72243ee74924df75ff0e40c857cc9a949f30a944d13e5`.
- No EPL table is directly selectable and no EPL RPC executable by `anon` or `authenticated` at live readback. Migration history includes M-30 `20261029051846` and M-31 entries `20261029131259` / `20261029133927`; the fresh readiness digest, not an older release card, controls this release.
- All five schedule rows enabled and all five `gtl-epl-*` cron entries active.
- Eight managers, seven linked accounts, eight MW9 picks and ten fixtures. No private pick contents are published here.
- Stored snapshots `after-mw08` (October 28 17:32:37 UTC) and `daily-2026-10-29` (October 29 13:13:04 UTC).
- One successful snapshot run and one successful fixtures run. Subsequent runs skipped for `nothing_due`, `not_due` or `no_subscription`. A skipped push is not proof of notification delivery. Settlement has not run yet.

[M-30](RELEASE_2026_10_29_M30.md) and [M-31](RELEASE_2026_10_29_M31.md) are already applied. No migration or seed is replayed. Current API and EPL worker sources have no changes from their recorded deployed revisions (`43c3a84` and `6009848`, respectively), so another backend deploy would not add EPL functionality.

GitHub verifies the API/frontend release [40829236564](https://github.com/seanbalz/guess-the-line/actions/runs/40829236564), EPL worker release [40825046313](https://github.com/seanbalz/guess-the-line/actions/runs/40825046313), and latest frontend release [40887118540](https://github.com/seanbalz/guess-the-line/actions/runs/40887118540) succeeded. Hosted Edge metadata does not independently prove source-byte equivalence.

## Remaining scope

EPL moneyline (D-68 plan 3) is not implemented and cannot be deployed. Its required live three-book draw-no-bet source check remains open. Future MW9 settlement, MW10 automatic order, final manager linking, signed-in readback and physical-phone acceptance are separate from deployment. No date-dependent outcomes are fabricated.

## Local validation

Typecheck, Brand QA, nine routing tests, thirteen component tests and all five NBA browser scenarios passed (zero skips). Browser scenarios retain saved-ticket access, exact accounting, uncertainty recovery, privacy isolation and draft guards, while checking NBA is absent from the NFL switch. Component checks verify NBA is absent from EPL too.

## This frontend release

Source/CI, protected readiness, exact SHA, migration digest, release run and served-asset verification will be recorded after the release completes. Until then the NBA navigation change is local only.
