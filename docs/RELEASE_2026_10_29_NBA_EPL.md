# NBA navigation and EPL release reconciliation — October 29, 2026

Owner: Sean Balsiger · Version 2

Sean requested: "hide the nba section of the app" and "deploy all epl items, projects, tasks, tools asap", confirming English Premier League.

## Change and preservation

Remove NBA from the NFL and EPL sport switch. Normalize EPL tab destinations before storing route state: Home/Research → Play now opens Pick a Team instead of a blank Coming next card, and section clicks and browser history stay consistent. Saved NBA deep links still open the existing private records and retain unsaved-draft guards. No table, ticket, API, migration, collector, quota or schedule changes are required. Existing GTL Segmented controls and tokens are retained. Reverting the navigation commit restores the NBA option.

## Live EPL evidence

Read-only Supabase checks on October 29 verified:

- `gtl-api` v42 ACTIVE with JWT verification; bundle SHA-256 `81c4c8087d4a5afdf8815ff06a4b0aedcfb7ab1aba6ac6cfe85ff037c6a8ce1a`.
- `gtl-epl-jobs` v1 ACTIVE; bundle SHA-256 `f98a1926615540ac5fb72243ee74924df75ff0e40c857cc9a949f30a944d13e5`.
- No EPL table is directly selectable and no EPL RPC executable by `anon` or `authenticated` at live readback. Migration history includes M-30 `20261029051846` and M-31 entries `20261029131259` / `20261029133927`; the fresh readiness digest, not an older release card, controls this release.
- All five schedule rows enabled and all five `gtl-epl-*` cron entries active.
- Eight managers, seven linked accounts, eight MW9 picks and ten fixtures. No private pick contents are published here.
- Stored snapshots `after-mw08` (October 28 17:32:37 UTC) and `daily-2026-10-29` (October 29 13:13:04 UTC).
- One successful snapshot run and one successful fixtures run. Subsequent runs skipped for `nothing_due`, `not_due` or `no_subscription`. A skipped push is not proof of notification delivery. Settlement has not run yet.

[M-30](RELEASE_2026_10_29_M30.md) and [M-31](RELEASE_2026_10_29_M31.md) are already applied. No migration or seed is replayed. At the initial readback, the API and worker matched their recorded source revisions (`43c3a84` and `6009848`). The coordinated batch subsequently added worker rollover validation and disabled DNB-check source; the API remains v42.

GitHub verifies the API/frontend release [40829236564](https://github.com/seanbalz/guess-the-line/actions/runs/40829236564), EPL worker release [40825046313](https://github.com/seanbalz/guess-the-line/actions/runs/40825046313), and latest frontend release [40887118540](https://github.com/seanbalz/guess-the-line/actions/runs/40887118540) succeeded. Hosted Edge metadata does not independently prove source-byte equivalence.

## Remaining scope

EPL moneyline (D-68 plan 3) has tested rules, private schema source and a bounded DNB check, but its API routes, regular collector and playable UI remain unfinished behind the live odds-source gate. M-32 `20261029150000_gtl_epl_moneyline.sql` remains pending and no DNB schedule is created or enabled. M-33 correction work, player metadata enrichment and commissioner review follow-ons are outside this pinned release. Future MW9 settlement, MW10 automatic order, final manager linking and physical-phone acceptance remain separate. No date-dependent outcomes are fabricated. See the [workflow control record](EPL_WORKFLOW_CONTROL_2026_10_29.md).

## Signed-in desktop readback

The existing signed-in Chrome session showed all eight MW9 picks and loaded Fantasy Matchup, Standings, Rosters and Insights. Matchup correctly reports unavailable until a full repeated schedule can be inferred; Insights says weekly detail starts MW9. Some roster entries display Unknown player; this remains a snapshot/player-directory quality follow-up, not a completed acceptance check. A live navigation defect (Research → Play rendered an incomplete route and ignored Pick a Team) was reproduced and fixed in this batch.

## Local validation

Typecheck, Brand QA, nine routing tests, thirteen component tests and all five NBA browser scenarios passed (zero skips). An additional EPL browser regression passed: Home → Play, Research → Play, explicit sections, Back/Forward, no writes and NBA hidden. Browser scenarios retain saved-ticket access, exact accounting, uncertainty recovery, privacy isolation and draft guards, while checking NBA is absent from the NFL switch. Component checks verify NBA is absent from EPL too.

## Pinned batch and frontend release

Source: `5c1b775f05a69306f20f911f4b0455c207c65ffc`, containing PRs #364–#369. Exact-main [Tests](https://github.com/seanbalz/guess-the-line/actions/runs/40905373932), [Dashboard checks](https://github.com/seanbalz/guess-the-line/actions/runs/40905374061) and [Brand QA](https://github.com/seanbalz/guess-the-line/actions/runs/40905373849) passed, including every browser shard and Persona suite. [Release card #372](https://github.com/seanbalz/guess-the-line/issues/372) records compatibility, preservation baseline, order and rollback.

Sean explicitly assigned the frontend/logo deployment to the “Redraft logo and favicon” chat. Its [readiness run 40907278407](https://github.com/seanbalz/guess-the-line/actions/runs/40907278407) and [deployment run 40907820747](https://github.com/seanbalz/guess-the-line/actions/runs/40907820747) succeeded for the same pinned source. This session canceled its duplicate queued readiness run `40907309496` and independently inspected the successful deployment evidence:

- Pages `72eb400b-77df-4ef0-944f-8ceb7b04c38f`; production [guess-the-line.pages.dev](https://guess-the-line.pages.dev).
- All 124 production assets matched; frontend SHA-256 `f9136a1c18197900baf1aae368069e4213cb2768207bedaa66139f8ab4169719`.
- Readback at `2026-10-29T16:06:47.498Z`: all 385 boundary probes denied, none awaiting. Immutable deployment URL remains protected by Cloudflare Access.
- Migration history remained 69 entries, SHA-256 `2e1f74cbc66123554f6b0e4addc6d8743fa500e352583f906bce46cb91c50b25`; only M-32 pending in this source. API v42/hash unchanged.
- Independent signed-in Chrome reload showed NFL/EPL only, no NBA button. Research → Play selected Pick a Team and loaded the MW9 draft. No claims, picks or queues were changed. Screenshot is retained locally, outside the public repository.

The release also includes the selected balanced logo and #369's EPL account-switch and phone-label fixes. Physical-phone acceptance is not inferred from desktop or automated browser checks.

## EPL worker release

Worker source-only verification [40908417519](https://github.com/seanbalz/guess-the-line/actions/runs/40908417519), protected readiness [40909220872](https://github.com/seanbalz/guess-the-line/actions/runs/40909220872) and deployment [40909688078](https://github.com/seanbalz/guess-the-line/actions/runs/40909688078) all succeeded. Sean's direct deployment request authorized both protected approvals in this session; the normal production gates remained enabled.

- Readback `2026-10-29T16:17:52.103Z`: `gtl-epl-jobs` v2 ACTIVE, `verify_jwt=false` as configured for the private per-run capability endpoint; bundle SHA-256 `66da916b63fb3749c43ff02ca2bf476a33c8af965561f35f4040db3a26af6074`.
- All 385 boundary probes denied, none awaiting; migration history and API v42/hash unchanged. A direct unsigned worker request returned 401.
- Operational readback `2026-10-29T16:18:55.540333Z`: all 26 expected hosted function bodies match, all 14 tables retain RLS and browser-role denial, and the existing five jobs/cron entries remain enabled. Budget remains 407/unpaused. The 16:18 UTC scheduled nudge completed as `skipped/nothing_due`; that confirms a post-deploy invocation, not notification delivery or a completed matchweek cycle.
- At `2026-10-29T16:17:37.962992Z`, all five pre-release preservation digests matched the 15:42:47 UTC baseline: picks 8, pick history 8, managers 8, queues 0 and bonus 0. No player records were rewritten.

The workflow deployed the clean pinned checkout and verified remote version/status/hash, but did not independently match the remote worker bundle bytes to source. No migration, seed, claim, queue, DNB schedule, provider configuration or kickoff lock was changed. The worker run did not redeploy the frontend.

Rollback remains a reviewed code revert followed by the exact-source release process; preserve all hosted data and migration history. M-32 is fix-forward and remains unapplied. The separate [M-32 workflow record](EPL_MONEYLINE_WORKFLOW_2026_10_29.md) describes its next gates.
