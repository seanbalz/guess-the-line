# EPL moneyline production release — October 29, 2026

Owner: Sean Balsiger · Version 1

EPL moneyline API, shared collection, Home progress, guess entry and leaderboard screens are deployed from
`d891291c8a21e2de7827826e0d194fc2e0da11a6`. Signed-in readback passed. The collector is enabled, and production
lock-ins subsequently produced ten priced captures with consistent private references and distances.
[Release card #387](https://github.com/seanbalz/guess-the-line/issues/387) records the approved scope and rollback.

Sean requested finishing the API, collection and screens and deploying after checks. He separately approved
“Apply M-36 after checks pass” and “Enable and test moneyline collection” after compatible API/worker deployment.
No player guess, window or stored prediction was written or edited by the release assistant's acceptance checks.

## Exact source and protected releases

PR #384 merged after twelve green checks on `ea1d616af47bcfe983949e951b47e4e63107694d`; PR #386 records the
verified M-36 apply. Exact-main CI on the release SHA passed: [Tests](https://github.com/seanbalz/guess-the-line/actions/runs/40934488091),
[Dashboard, Persona and all four browser shards](https://github.com/seanbalz/guess-the-line/actions/runs/40934488162),
and [Brand QA](https://github.com/seanbalz/guess-the-line/actions/runs/40934488112). Every release used the same clean
source and reviewed history digest. Production gates were approved under Sean's direct deployment request.

| Target | Source check | Protected readiness | Protected deployment |
| --- | --- | --- | --- |
| EPL worker | [40936324595](https://github.com/seanbalz/guess-the-line/actions/runs/40936324595) | [40936516479](https://github.com/seanbalz/guess-the-line/actions/runs/40936516479) | [40937265809](https://github.com/seanbalz/guess-the-line/actions/runs/40937265809) |
| API | [40937928345](https://github.com/seanbalz/guess-the-line/actions/runs/40937928345) | [40938119007](https://github.com/seanbalz/guess-the-line/actions/runs/40938119007) | [40938625664](https://github.com/seanbalz/guess-the-line/actions/runs/40938625664) |
| Frontend | [40939653623](https://github.com/seanbalz/guess-the-line/actions/runs/40939653623) | [40939997384](https://github.com/seanbalz/guess-the-line/actions/runs/40939997384) | [40940711468](https://github.com/seanbalz/guess-the-line/actions/runs/40940711468) |

All nine runs succeeded. Deployment order was worker, API, approved collector activation/test, then frontend.
Subsequent evidence-only main changes did not change this pinned source or trigger another deployment.

| Component | Verified released state | Digest |
| --- | --- | --- |
| `gtl-epl-jobs` | ACTIVE v3, JWT verification false; machine-capability authentication retained | `e1e90385539ff785d7882a9eb65e838048fb36dd54d5386aae807345100d5135` |
| `gtl-api` | ACTIVE v43, JWT verification true | `00d9bad42b45c980ac2f33588814813bb52232d9deb40728c57d912d3493a6a4` |
| Pages | `8fff6d68-7986-4f5b-a921-24a75656c86d`, checked at `2026-10-29T19:34:24.291Z` | `9a345c9feb9da5fadd71f2c23f1db41daae372e9cf226b89bdd18a72d34a706d` |

Production: [Guess The Line](https://guess-the-line.pages.dev/#epl/home). The immutable Pages URL is protected by
Cloudflare Access; the workflow matched **all 125 production asset hashes** to its build manifest. An independent
curl readback also matched all 125 byte lengths/hashes with zero failures. Edge versions/digests and the clean deploy
checkout were verified; remote API/worker bytes were not independently matched to that checkout. Later frontend-only
formatting releases have their own source pins and do not change this release's provenance.

## Migration, privacy and preservation

[M-36](RELEASE_2026_10_29_M36.md) is hosted as `20261029183135`; its file remains
`a97b29dd7355f08f033ccdd9ef81f8e28e928499d4bec3a1375ea8b439280c64`. History has **71** entries, SHA-256
`19b43dcfba2c205cac9ceb0fab5d6d487edecb86bf140d555de620df28813fab`. No migration was applied by the release workflows.
M-33/M-34/M-35 remain unapplied. Their correction/standings/operator prerequisites are separate from moneyline.

Fresh applied-ledger readback matched all 38 EPL function bodies and all 18 private RLS tables. Global boundary
verification checked 428 resources: 409 denied and 19 explicitly awaiting only those unrelated pending migrations.
At `19:41:21Z`, a strict moneyline-only check denied **14/14** probes: both tables and six RPCs returned HTTP 401/database
42501; all three API routes rejected missing and invalid sessions. No private fields appeared. All four deployed EPL
API routes now lose their source-only absence exceptions; the pending database objects retain theirs.

Deployment preservation compared `19:03:48Z` with `19:41:21Z`, before the later moneyline play described below.
Thirteen existing EPL table fingerprints, finished Weeks 1–7 scoring and settled Virtual Units were unchanged.
The schedule grew from six to seven rows as authorized; the old six schedule and six cron fingerprints stayed exactly
`476f512d854de89e06b5672799182700` and `d05cc041fe704a42eef472067a5bde68`.

A concurrent Week 8 spread ballot first audited at `19:05:02Z` grew the all-ballot score set from 35 to 36.
Filtering by first audit time verified the **original 35-row cohort unchanged**, MD5
`fc7e475fb363809b0ed083fcd94ad573`. That normal live write predates the backend updates and was preserved.
No data was erased or reverted to force the old aggregate hash. No player identities or prediction values are published.

## Enabled collection and actual production use

Only `moneyline` was added/enabled, with the intended worker endpoint and active cron `gtl-epl-moneyline`,
`*/15 * * * *`. The first dispatched run, `7c2d2f1f-41b2-4e75-b39b-2c699d2678c2`, started at
`19:22:13.453551Z` and finished at `19:22:14.076715Z`, skipped with `nothing_due`. Budget stayed 401, unpaused;
attempts/collections were zero then. Automatic 19:30 and 19:45 runs also skipped normally. The timed collection window
starts `2026-10-30T00:00Z` (October 29, 8 PM Eastern); this is a product collection rule, not a deployment restriction.

After read-only screen acceptance, production lock-ins triggered the separate post-save hook. A metadata-only audit at
`19:50:01Z` found **10 locked guesses, 10 lock-history events, 10 refreshed lock attempts and 10 immutable collections**.
All ten first-after references matched their exact capture and chosen-club median, after lock-in and before kickoff.
Every stored distance matched the normalized-distance function. Captures had two or three allowed books; the shared
budget moved from 401 to **391**, unpaused and above reserve 50. These were observed production writes, not test entries
created by the release assistant. Raw guesses, prices, clubs, event identities and player identities were not fetched
into or published by this acceptance report. Independent aggregate-only SQL at `19:51:54Z` also confirmed the ten
references' capture/time/distance consistency without retrieving predictions or making writes.

## Signed-in screens and remaining acceptance

Fresh Chrome production readback verified EPL Home's own `0 of 10` shortcut, all ten Matchweek 9 entry fixtures,
the normal even-odds field and disabled untouched save buttons, the kickoff-scoped leaderboard's honest empty state,
and return to Home with the same shared account/frame. NBA sport buttons were absent. At 390px Light, there was no
sideways overflow; the Home button measured 358×44px and console errors were zero. Viewport override was reset.
Local live captures remain private under `.local/`; no real entry was submitted during browser acceptance.
These are desktop/390px checks, separate from physical-phone moneyline acceptance.

Source acceptance also passed 534 targeted Node/SQL checks, 89 component checks, ten actual-service flows and six
full-page Axe analyses. This deployed-state follow-up passed 117 targeted route/boundary checks, zero skipped.

Still open:

- First priced **timed** checkpoint after its window opens; real multiuser shared-cache/concurrency acceptance.
- Kickoff/leaderboard settlement and a full live matchweek cycle; physical iPhone moneyline gameplay acceptance.
- Separate M-33/M-34/M-35 operation/source prerequisites and the existing EPL Bets delivery gap.
- [Formatting issue #388](https://github.com/seanbalz/guess-the-line/issues/388), delivered through separate
  [PR #389](https://github.com/seanbalz/guess-the-line/pull/389) and its own frontend/phone workflow. Its source has merged;
  this moneyline release includes no formatting fix and does not close that acceptance.

The collector off switch disables only its schedule row, preserving attempts, captures, guesses and history. M-36 is
fix-forward; do not drop stored evidence. The next #389 frontend-only release belongs to the Redraft captain after
this batch's verified handoff. Record-only merges wait for that captain's exact-main/source safe point.
