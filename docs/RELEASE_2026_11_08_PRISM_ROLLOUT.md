# Confirmed Prism rollout — November 8, 2026 UTC

**Deployed and verified:** confirmed frontend layouts and compatible Research API,
with the separately held FEPL frame and M-41 decisions unchanged.

Sean authorized deployment of the remaining confirmed visual updates and asked
for the full page's formatting and spacing to be optimized. This release uses
the selected-system authority at `3ac2eb50513ba73447ef890e4a47863cde7bdd76`.
The same-route FEPL frame overlap and separate M-41/ROI decision stay held.
Navigation is accepted under Sean's standing instruction unless he reports an
issue; automated regression checks remain part of release verification.

## Source, review and CI

[PR #495](https://github.com/seanbalz/guess-the-line/pull/495) merged at
`e3f078b9e831dda46412487251b191ebdd5637c4`, November 8 at 07:16:39 UTC.
The PR head was `b9d6ce0e53fbc00a8daa0d4708f5efe4823a4d7b`; its Git tree
matches the main merge. Final whole-branch review approved spec and quality
without Critical or Important findings. [Source review](PRISM_FINAL_REVIEW_2026_11_07.md)
and [CI closeout](PRISM_EXPANDED_CI_CLOSEOUT_2026_11_07.md) retain exact limits.

All twelve PR checks passed. The first Tests attempt had one unchanged Points
summary test fail at exactly 07:00 UTC with schedule authorization rejection;
its one-hour capability guard and failure timestamp support a boundary-expiry
explanation. The unchanged targeted test passed, then failed-job rerun attempt 2
passed. No source, test or authorization rule was changed for that rerun.

All twelve exact-main push checks passed on the first attempt:
[Tests 42458127540](https://github.com/seanbalz/guess-the-line/actions/runs/42458127540),
[Dashboard 42458127500](https://github.com/seanbalz/guess-the-line/actions/runs/42458127500),
and [Brand QA 42458127571](https://github.com/seanbalz/guess-the-line/actions/runs/42458127571).
Local combined verification passed 923 component tests in 92 files, 89 Node
contracts, 11 browser flows, typecheck, Brand QA, build, privacy and whitespace.
All 1,759 design-file raw hashes remained unchanged. Existing fixture-key and
chunk-size warnings remain disclosed.

## Confirmed scope

The app now carries the reviewed Prism materials, type, individual team/league
circles, compact approved frames and native contexts across Play/Points/Score,
Bets, Research/Fantasy, League/actions, Account/access/recovery, History,
Premier League/FEPL bodies and Commissioner tools. The G has no circle.
Page/card gaps, actual bottom-dock clearance and narrow EPL labels are verified.
Back restores the saved reading position through the reviewed history lifecycle
fix. Existing drafts, locks, reveal rules, rosters, saved references and private
records retain their controllers and guards. No new layout or FEPL frame choice
is inferred from this release.

## Public Research publication

The [manual refresh 42458244319](https://github.com/seanbalz/guess-the-line/actions/runs/42458244319)
built, published and verified completed-game assets from exact source
`e3f078b9e831dda46412487251b191ebdd5637c4`. It ran after merge and before
app deployment, as the reviewed optional-field compatibility permits.

The previous index hash was
`33f3060a356d6961e226a353b96bbea766c195a874024898e7dcd0a1df7c12b1`, generated
01:32:45.008 UTC; all 750 selected season samples lacked the new nested fields.
The new index was generated at 2026-11-08T07:18:44.893Z, verified at
2026-11-08T07:23:49.182471+00:00, SHA-256 `ed841e0fffadef4d1d15ccf77570625ff1fb4a7025f39f808d1eeaa20cd58f94`.
All six compressed asset sizes and hashes match the published index. Each has
750 samples with both season rows and compact chart series, with at most 12 row
points. Maximum size is 1,050,820 compressed / 14,984,731 decoded bytes.
The public receipt records 122 completed/PBP games, latest completed November 5,
750 candidates, six qualifying trends and 272 statistic matchups. Existing free
nflverse data only; no odds collection or provider budget change.

The frontend, old/new API and rollback readers tolerate the optional fields.
Local payload timings are not new hosted Edge CPU measurements. Publication
and asset checks do not establish signed-in production chart acceptance.

## Protected frontend release

[Source check 42459700660](https://github.com/seanbalz/guess-the-line/actions/runs/42459700660),
[readiness 42459829748](https://github.com/seanbalz/guess-the-line/actions/runs/42459829748),
and [deploy 42460321962](https://github.com/seanbalz/guess-the-line/actions/runs/42460321962)
all succeeded for exact source and frontend-only target. Production environment
approvals used Sean's authorized GitHub identity after each run's mode, target,
source and approval gate were checked. No timing window restriction was added.

| Evidence | Verified result |
| --- | --- |
| Production | [guess-the-line.pages.dev](https://guess-the-line.pages.dev/#home) |
| Pages | `31417a19-3cea-47fc-bc0a-9b776df4724b` |
| Verified at | `2026-11-08T07:52:55.096Z` |
| Immutable URL | `https://31417a19.guess-the-line.pages.dev`, Access-protected |
| Served bytes | All 132 production URLs matched; protected immutable bytes were not fetched |
| Frontend SHA-256 | `a7ee1eeef2c2e2ba4fe6e4798fbb132606333decbd16eeb99ec48da9b956dc90` |
| Built-source SHA-256 | `c7b6fc5568e5d6ce560193b39e7d4d067813dccac41397ad7a951aab6c0a5383` |
| Build | Clean exact checkout; 133 manifest artifacts including hosting metadata |
| API during frontend phase | Unchanged v50, ACTIVE, JWT verification true |

Fresh frontend readiness observed 07:44:40.959 UTC. API and worker metadata,
migration history and signed-out boundaries were verified after upload.

## Separate API release

[API readiness 42460762268](https://github.com/seanbalz/guess-the-line/actions/runs/42460762268)
succeeded with fresh observation 07:58:23.618 UTC. API baseline was v50, ACTIVE,
JWT verification true, bundle
`c5ed571b75753c1a44abb9a017977b69daa929cdf7cac92d57a17846d3d58f48`.
[API deployment 42461089798](https://github.com/seanbalz/guess-the-line/actions/runs/42461089798)
succeeded after the tolerant frontend was verified.

API verification completed at `2026-11-08T08:04:54.389Z`. The API advanced exactly
from v50 to v51, remains ACTIVE with gateway JWT verification
true, and reports bundle SHA-256
`969c38c673a4bb4d891ffa0325db7910bdcd84031f4e8f6f0a0dd40204311644`. Other function metadata and migration history
remained unchanged; no worker was deployed. The API-only target did not upload
or recheck Pages. Frontend byte verification is the separate result above.

API deployment metadata is verified. Remote API bytes were not independently
matched to the checkout (`apiSourceVerified:false`,
`apiBundleMatchesCheckout:not-independently-verified`). Source acceptance here
uses the clean requested checkout, successful pinned-CLI deployment, expected
version increment and recorded bundle metadata. It does not claim an independent
remote-source comparison. Both protected approvals followed the exact mode,
target and source checks under Sean's standing deployment instruction.

## Preservation, compatibility and remaining work

Both readiness runs report 76 migration versions with reviewed history digest
`d40fdad9eb144738cdbd032e3c95ba433b4cb1606f3de3ab8079f0df1b8108f1`.
Only M-33 `20261029151727`, M-34 `20261029161613` and M-35 `20261029162144`
remain pending. No migration was applied. Schedule evidence covers 2026 Week 9
and 29 games with `timeRestrictions:false`. Every boundary pass records 457
checks: 438 expected denials and 19 documented probes awaiting those migrations.
They are not counted as denied or as proof of authenticated route existence.

No `data/` or `supabase/` source differs from the review base. Week 5 source
picks retain SHA-256
`a4ee8f13c4b58777767dbd94a022dbc0a721ff6ece90522e4ddf4e25d2d9f1dd`.
Source and migration-history preservation are separate from a fresh hosted
score-row reconciliation. No score-row hash or signed-in/physical-phone readback
is claimed. Browser control was disabled in Work settings.

Rollback frontend is source `70c2b85ea7466ca308c8e69006b4ec09888267a7`, verified
Pages `6a847959-7b70-4c21-bcb3-fc2af1403621`. API rollback is verified v50
source `49f60718565f9bef45045fd20dc2b9535263f716`, release 41741408404 / issue 465.
The new frontend tolerates that API and both readers tolerate the public assets.
Rollback removes no saved data.

FEPL's frame choice remains queued after the pending ROI question. Custom
Virtual Units precision stays in separate draft PR #497 and requires its own
accounting decision, named M-41 approval and Gate M checks. No avatars, new
awards/popups, NBA or parked Signal work was started. Frozen v62 is unchanged.
