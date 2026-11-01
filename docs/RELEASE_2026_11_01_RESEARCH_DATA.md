# Research data production release — November 1, 2026

Owner: Sean Balsiger · Version 1 · Deployed; signed-in acceptance pending

The missing research-data repair is deployed at
[Bets → Research recommendations](https://guess-the-line.pages.dev/#bets/research).
[PR #397](https://github.com/seanbalz/guess-the-line/pull/397) merged as
`a62d35c530e360e354c858d807937aa3aa3547db`. The release connects published free
nflverse history and observed plays to the server, exposes matchup statistics,
selects the current published account week, and retains qualifying ISO-dated
historical evidence. [Implementation and operating limits](RESEARCH_LIVE_DATA.md)
describe the data path. Guessing, scoring, locking and reveal rules are unchanged.

The October 31 deployment delivered the interface and private storage but did
not establish populated research. Sean reported the empty view and requested
further development. This record distinguishes the new public data publication,
verified application release and still-unobserved signed-in UI acceptance.

## Source, publication and protected release

All twelve PR checks passed on `d74bf8e233b33012e179894e564dd141b68a428b`.
All twelve exact-main push checks passed without skips:
[Tests](https://github.com/seanbalz/guess-the-line/actions/runs/41273350969),
[Dashboard, Persona and four browser shards](https://github.com/seanbalz/guess-the-line/actions/runs/41273351066),
and [Brand QA](https://github.com/seanbalz/guess-the-line/actions/runs/41273351065).

[Data publication 41273358275](https://github.com/seanbalz/guess-the-line/actions/runs/41273358275)
succeeded from that main source. Its November 1, 04:30:36.109 UTC build contains
108 completed games through October 29, 750 registered trends (eight historically
qualified), and 272 matchup-statistics entries. Every Week 8 matchup/28 teams
has observed plays. Six immutable compressed period assets and the index passed
public byte readback in
[research-data-2026](https://github.com/seanbalz/guess-the-line/releases/tag/research-data-2026).
The schedule source SHA-256 is
`ea5a1f2136dcab126e78ce921a90dfdc65aac39b871cb28c437822c2540303fe`;
compressed play-by-play SHA-256 is
`653bf713cb9851a8a9d37787388f27a3a339c0e3429d0e64f611402d4328fe6f`.

The main-only four-hour refresh workflow is active. At the verification time,
only its successful manual publication had been observed; an automatic scheduled
execution is not claimed. Failed refreshes retain the prior publication, and the
server still checks it against live source history before qualifying evidence.

Sean approved the existing GitHub production gates. All three release runs
succeeded for the exact main source and combined `api-and-frontend` target:

| Gate | Run |
| --- | --- |
| Source and exact-commit CI | [41274088780](https://github.com/seanbalz/guess-the-line/actions/runs/41274088780) |
| Protected readiness | [41274140014](https://github.com/seanbalz/guess-the-line/actions/runs/41274140014) |
| Protected deployment | [41316279474](https://github.com/seanbalz/guess-the-line/actions/runs/41316279474) |

Readiness completed at 14:06:15 UTC. The deploy repeated fresh preflight and
verified production at 14:56:35 UTC. [Release card #398](https://github.com/seanbalz/guess-the-line/issues/398)
records compatibility and rollback. The API was deployed before the compatible
frontend; no migration was applied and no odds-provider request, budget or
collector-cadence change was introduced.

| Component | Verified state | SHA-256 |
| --- | --- | --- |
| Reviewed source manifest | Clean exact-source checkout | `fc97e392944353ba047b8661f5217fdf77afb1a660caad75d218675348551ce7` |
| `gtl-api` | ACTIVE v45; JWT verification enabled | `7640627cfd1a457729382b90f09a3b094095c63da76c62a5559038e1190c675b` |
| Pages | `67360c27-a8f0-437f-b0c4-5734331fb163`; 127 matching production assets | `a923bdac280ed535e82acec9dcd69f2760410a6ab7e1989de64c50613e5c6bdb` |

The immutable Pages URL is Access-protected; verification read the production
URL. Separate Supabase source recovery matched nine critical deployed files
byte for byte: the API entrypoint, `cloud/lines.mjs`, `cloud/trends-research.mjs`,
`cloud/research-assessments.mjs`, `cloud/research-data.mjs`,
`shared/research-assessments.mjs`, `shared/matchup-statistics.mjs`,
`shared/research-play-statistics.mjs` and `shared/research-data.mjs`.
The workflow's `apiSourceVerified: false` is preserved: recording the remote
bundle digest and these file matches does not independently attest every bundle
byte. Other Edge functions were unchanged by the release verification.

## Data and preservation verification

At 15:00:07 UTC the real loader fetched the published URLs and checked live
nflverse history. A local projection against the account's read-only production
permissions and retained lines returned fresh history, 14 scoring-statistics
matchups, 14 play-statistics matchups, 68 assessments and eight historical
evidence entries. The retained prices in those captured inputs were stale;
assessments correctly stayed gray. This projection is not an authenticated call
to the deployed API or a signed-in production UI check. Synthetic-sign-in local
browser checks separately displayed the real public statistics and evidence.

Strict research-only HTTP probes passed 16/16 denials after deployment. Global
release verification checked 444 resources: 425 denied and 19 explicitly awaiting
only unrelated EPL migrations. Hosted migration history remains 72 rows with
SHA-256 `b3b13f6f7557851b6d0f0be8893a1840aa5a7abdec1cb4ff42b68a33a9fc521d`.
M-33/M-34/M-35 remain unapplied. The existing public GTL function body/ACL/config
aggregate remains `1d98dd538caeb84cba770348fa6f8b15`.

Before-deploy 14:26:34 UTC and after-deploy 15:01:23 UTC sorted-jsonb-MD5
preservation checks matched exactly:

| Protected set | Rows | Unchanged MD5 |
| --- | --- | --- |
| Finished Weeks 1–7 score rows | 359 | `1e2753375bbf6719a44d32a4d7323fc1` |
| Finished Weeks 1–7 ballots | 25 | `c097fbbce481d5124e710818d6d7a0f5` |
| Settled Virtual Units picks | 7 | `056fba89cd3e997c27b02dc3a3ee32a4` |
| Virtual Units settlement records | 44 | `8bf484c46a103d1d3065f874756d2b67` |

Source downloads, private read inputs, detailed release receipts and screenshots
remain ignored under `.local`. No player records are included in the public data
release or this evidence commit. The frozen v62 tracker is unchanged.

## Acceptance limits and recovery

Real signed-in production and physical-phone acceptance remain pending. The
available browser connection required reauthentication, so no browser pass is
inferred from asset hashes, local projections or access denials. Next acceptance
must check the published week, populated matchup statistics, historical evidence,
coverage states and reveal gates under a real session in Light and Dark.

The eight selected X accounts still have no verified automatic extraction feed;
submitted URLs remain pending manual extraction/checks. Public observed statistics
do not reproduce proprietary coverage/route/pressure charts or validate a green
predictive model. Fresh prices and their existing expiry rules remain mandatory
for a colored qualifying recommendation.

Rollback retains API v44 and Pages `a2e32966-cd1c-4cbd-9aad-69ef01766952`
from `89acd94cfd1f5e0ab837b0150dd28e12807ff5e8`. Existing research off switches
remain available. Restore a reviewed prior data index if necessary; immutable
superseded assets remain for 48 hours. Do not rewrite player records or drop the
private research tables to recover the application.
