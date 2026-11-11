# Approved Home spacing release — November 7, 2026

Released frontend source **`70c2b85ea7466ca308c8e69006b4ec09888267a7`** as
Pages **`6a847959-7b70-4c21-bcb3-fc2af1403621`**. Production asset verification
completed **2026-11-07 23:47:36 UTC** (3:47 PM Pacific).

## Approval and scope

Sean approved the exact Dark/Light spacing mockups at
`5faead67b9a66091c595168d89bfe21556dec01f` with **“That looks better. Continue
to deploy.”** See the [paired review and original evidence](../design/home-spacing-review-2026-11-07/README.md).
His additional instruction to deploy the remaining confirmed visuals is a
separate ongoing rollout; it does not make that implementation complete.

This release changes National Football League Home spacing only: consistent
gutters/gaps, the progress ring beside action text, aligned stat/shortcut icons,
compact matchup rows and activity spacing. The same fictional 390px fixture
is 1,279px instead of 1,561px tall (18.1% shorter). The selected glass finish,
palette, typography, chart height, team circles and Spread/Total separation stay.
Live readers, draft/lock rules, privacy gates and all other page layouts remain.

Source [PR #494](https://github.com/seanbalz/guess-the-line/pull/494) merged at
the release SHA. Reviewed implementation `1da64dd602e1ddb4b27ef205c5a79c721217744a`
plus loading repair `2d96c5d7589df3ccfa7b840c0fae299a5e1de074` form the final
branch head; that final head has the same tree as the merge. The first full CI
caught the old 212px loading
placeholder against the new 194px card and a stale 18px padding assertion.
The repair matches the 194px/16px placeholder to the approved ready state,
preserving the existing no-jump assertions; it does not change the approved
ready-state layout. Independent review approved both changes.

## Verification and preservation

Local evidence: initial 54 Home/model/token checks and 53 Home component tests;
the final repair passed 40 token/model/brand checks and all 17 Home/layers/
scrolling browser cases, with retries disabled and no skips. The placeholder's
children fit at 320/390/1440px. Typecheck, Brand QA and the cloud-test build passed.
The original mockup sweep covered 30 layout cases, 24 keyboard observations,
both themes and wider fonts. Axe reported zero violations with translucent
contrast evaluation incomplete; full accessibility conformance is not claimed.

All **12 exact-main push jobs** passed for the full source SHA:
[Tests 42425122252](https://github.com/seanbalz/guess-the-line/actions/runs/42425122252),
[Dashboard 42425122504](https://github.com/seanbalz/guess-the-line/actions/runs/42425122504),
[Brand QA 42425122257](https://github.com/seanbalz/guess-the-line/actions/runs/42425122257).
This includes the four full cloud-browser shards, personas, Windows portability,
typecheck and test shards; a PR-only check was not substituted.

No `cloud/`, `shared/`, `supabase/` or `data/` file differs from the prior verified
Home source `4c6e91bba6f95cb20197c39185e91a58ce2b9b66`. Week 5 source picks
retain SHA-256 `a4ee8f13c4b58777767dbd94a022dbc0a721ff6ece90522e4ddf4e25d2d9f1dd`.
This checks the source file, not hosted player-table contents. No API, worker,
SQL, provider collection, budget or stored player data was changed.

## Protected frontend release

All manual runs succeeded for the exact source and **frontend-only** target:

- [Source check 42426305844](https://github.com/seanbalz/guess-the-line/actions/runs/42426305844).
- [Readiness 42426308072](https://github.com/seanbalz/guess-the-line/actions/runs/42426308072).
- [Deploy 42426632652](https://github.com/seanbalz/guess-the-line/actions/runs/42426632652).

The [release card](https://github.com/seanbalz/guess-the-line/pull/494) records
approval, source/CI, target, compatibility, preservation, reviewed migration
digest and rollback. Both production environment gates were approved through
the GitHub API under Sean's direct deployment instruction in this session,
after checking each run's exact mode/target/SHA. Fresh hosted readiness observed
23:42:08 UTC; deploy repeated it at 23:46:05 UTC. No timing window was imposed.

| Evidence | Verified result |
| --- | --- |
| Production | [guess-the-line.pages.dev/#home](https://guess-the-line.pages.dev/#home) |
| Pages ID | `6a847959-7b70-4c21-bcb3-fc2af1403621` |
| Immutable URL | `https://6a847959.guess-the-line.pages.dev`, Cloudflare Access-protected |
| Served assets | All 127 production asset URLs matched the exact build; protected immutable bytes were not fetched |
| Frontend SHA-256 | `6c628464f1c0743167ea31792a3e2abff708e78d76a2d2f04dd394c1afca5eb9` |
| Built source SHA-256 | `590c415b1ee84c6e7fb738cb79dcfcbcdccb59abb687ed81e3dc944b2d40cbe2` |
| Build | Clean requested checkout, Node `v22.23.4`, 128 manifest artifacts including hosting metadata `_headers` |
| API | Unchanged v50, ACTIVE, JWT verification true; bundle `c5ed571b75753c1a44abb9a017977b69daa929cdf7cac92d57a17846d3d58f48` |
| Workers | All recorded function metadata unchanged; none deployed |
| Migration history | 76 versions; unchanged digest `d40fdad9eb144738cdbd032e3c95ba433b4cb1606f3de3ab8079f0df1b8108f1` |
| Pending | M-33 `20261029151727`, M-34 `20261029161613`, M-35 `20261029162144`; none applied or required for Home |
| Published schedule | 2026 Week 9; 29 games across checked slates; `timeRestrictions:false` |
| Signed-out boundaries | 457 checked; 438 expected denials; 19 documented checks await only the three pending migrations |

The allowlisted release artifact contains source, before/verified reports and
the frontend manifest. API metadata was verified; remote API source bytes were
not independently fetched (`apiSourceVerified:false`). No API was deployed.
No new signed-in or physical-iPhone acceptance is inferred from these checks.
The Supabase app connector's earlier unauthorized status is not changed by the
protected workflow's separate credentials; no SQL ran through it.

## Rollback

Redeploy frontend source `4c6e91bba6f95cb20197c39185e91a58ce2b9b66`, the
verified previous Home release, Pages `f31193e9-9a0f-43c0-ac47-bb16460cb56b`.
It remains compatible with the unchanged backend. No saved data is removed.
