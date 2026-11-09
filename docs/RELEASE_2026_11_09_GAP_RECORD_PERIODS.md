# Gap record period filters — November 9, 2026 UTC

**Deployed and verified** from `9a34f9e47d5fb7dd32eecd6fdc697cef53340ed9`.
Gap win rate now has Week, This season, All time and inclusive Custom range.
The record period is independent of Recommendation week; market and 10%+ gap
filters still apply. Combined win rate uses wins divided by wins plus losses,
not an average of weekly percentages. Pushes retain their existing treatment.

Sean approved the dark/light mockup and directly instructed **“Deploy”** for this
named frontend batch. [D-80](DECISIONS.md), the
[implementation record](GAP_RECORD_PERIODS_2026_11_09.md) and
[structured evidence](evidence/GAP_RECORD_PERIODS_RELEASE_2026_11_09.json) retain
scope, checks and limitations. No Player Props guessing mode is included here.

[PR #505](https://github.com/seanbalz/guess-the-line/pull/505) merged at 16:41:01 UTC.
Reviewed head `dff97d290ce29c19b2db9ecdcf54e46564135049` and merged source have
the same tree `695452798ac7b51bc1726abc283bcf5f9cd427b3`, with an empty complete
diff. Independent source and documentation review found no outstanding issues.
All twelve exact-head PR checks and all twelve exact-main push checks passed.
The PR's three test shards passed 2,970 Node and 930 Vitest tests, with zero skips.

| Evidence | Verified result |
| --- | --- |
| Source-only check | [42660781964](https://github.com/seanbalz/guess-the-line/actions/runs/42660781964), success; production job intentionally skipped |
| Fresh protected readiness | [42664733908](https://github.com/seanbalz/guess-the-line/actions/runs/42664733908), success |
| Frontend-only deploy | [42665392227](https://github.com/seanbalz/guess-the-line/actions/runs/42665392227), success |
| Verified time | 2026-11-09T17:35:54.506Z |
| Pages | `3e81d5b5-5ad5-4f62-9014-c728f047e070` |
| Production | https://guess-the-line.pages.dev |
| Immutable URL | https://3e81d5b5.guess-the-line.pages.dev, Access-protected |
| Served bytes | All 132 production assets match the clean requested build |
| Frontend SHA-256 | `bd997845651d912889019ffa4837a1e211c193967a2ef3e42f15edf3ac1e7a01` |
| Built-source SHA-256 | `bf5c56765d45a7fba618ececb85c2f2412bcf690831f316e93566d08a8f46b91` |
| Manifest | Exact source, clean checkout, 133 artifacts including hosting metadata |
| API | v52 unchanged, ACTIVE, gateway JWT verification true |
| API bundle metadata | `76893d3a32c000669a0f11601a1454616630e6ff7ca2e55742221f63f3565ce1` unchanged |
| Migration history | 76 versions; digest `d40fdad9eb144738cdbd032e3c95ba433b4cb1606f3de3ab8079f0df1b8108f1` |

Readiness observed hosted state at 17:29:19.376 UTC. Deploy preflight repeated it
at 17:34:04.762 UTC. M-33 `20261029151727`, M-34 `20261029161613` and M-35
`20261029162144` remain pending. Each access-boundary pass records 457 checks:
438 expected denials and 19 documented pending probes. Pending probes are not
successful denials. Schedule evidence is 2026 Week 10, 29 games and
`timeRestrictions:false`; the removed release timing windows are not reinstated.
Both production approvals were verified against the exact run/mode/source,
actual production environment and authorized `seanbalz` actor before submission.

This frontend reuses the existing authenticated weekly lines reader, with at most
three concurrent reads and reuse of the displayed board. It cancels stale scopes,
retains season/week identities, and shows Retry rather than a partial-period
total. Drafts, sit-outs, even guesses, missing closing lines and missing finals
keep D-77's existing exclusions. No provider collection is added to page reads.

No API, worker, SQL, collector or schedule deployment occurred. Data, cloud,
server, shared, Supabase and design source trees equal prior app source
`a17f2082e5e07e95179726ac948c44c55a506d1f`; the evidence records source/Week 5
hashes. These do not establish hosted private-row hashes. API metadata is
unchanged, but remote API source bytes were not independently matched. The
immutable Pages URL is protected; served-byte comparisons used production.

Local Chromium and WebKit each passed 29 feature/layout/scroll assertions in
both themes at 320/390/768, including invalid/custom ranges, failure/retry,
late cancellation, detail/Back, control sizing and reachable end content.
Separate regression checks cover a filtered-out detail staying closed and
same-session React identity invalidation. The latter is not server sign-in-switch
acceptance. Multiweek lines/slates/finals are explicitly synthetic fixtures.
The initial loading-convention failure and development AbortError observations
remain in the implementation record; existing Vite chunk warnings remain.

A fresh isolated public sign-in smoke passed Dark and Light at 390x844, with no
page errors or horizontal overflow. It did not sign in to a production account.
Physical-iPhone, signed-in production, live-provider accuracy and private-board
acceptance remain separate. Source and asset checks do not establish those.

Rollback is a protected frontend-only redeploy of prior verified source
`a17f2082e5e07e95179726ac948c44c55a506d1f`, Pages
`968d3b5d-a115-42ea-8293-ce405ef42f91`, with fresh gates and API/database unchanged.
Player Props remains a separate design effort. M-41 apply, held FEPL top-header
choice, parked work and frozen v62 remain outside this release. Publishing this
documentation-only followup does not require another app deployment.
