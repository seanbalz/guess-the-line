# Approved Prism Glass Home — November 7, 2026

Released: Pages `f31193e9` from exact source
`4c6e91bba6f95cb20197c39185e91a58ce2b9b66`. Production bytes and signed-out
boundaries verified at **2026-11-07 18:25:28 UTC** (10:25 AM PT).

## Approval and scope

Sean approved the exact Dark and Light Home mockups at
`3ac2eb50513ba73447ef890e4a47863cde7bdd76` and said **“Good deploy.”** He
separately selected **“Add a Spread / Total selector (recommended)”** so Community
rank and accuracy points remain independent. Approval covers the National
Football League Home landing and its frame only. Other page layouts, PR #491's
broader foundation and the exploratory design branch are excluded.

Home now has the selected hybrid G, individual circular league/team marks,
compact progress ring and action, market-specific season stats, graphical
League/Research shortcuts, two game rows, generic Community activity and floating
navigation. Home colors/materials/font and document scroll padding are scoped to
the Home frame. Navigating away restores the existing frame and browser chrome.

## Source and preservation

- Source: `main` at `4c6e91bba6f95cb20197c39185e91a58ce2b9b66`, merge of
  [PR #492](https://github.com/seanbalz/guess-the-line/pull/492).
- Reviewed branch commit: `56d0d13e762adeb68ba9ecd81105e806240c513d` on
  `codex/approved-home-release-2026-11-07`. Its product tree equals the merge.
- Target/order: **frontend only**. No API/worker deployment, SQL apply, source
  collection, data-budget change or new credential is part of this release.
- `cloud/`, `supabase/`, `shared/` and `data/` are unchanged from the verified
  live frontend source `8737251495f8add2b6493a58ccd03c3c002ac2ca`.
- Week 5 source picks retain SHA-256
  `a4ee8f13c4b58777767dbd94a022dbc0a721ff6ece90522e4ddf4e25d2d9f1dd`.
  This is a source-file preservation check, not a hosted historical-score hash.
- Gate M historical data/function/grant checks are not applicable: no migration
  or backend change is made. Existing locks, reveal/privacy gates, drafts and
  API reply shapes are retained. Missing scores stay distinct from real zero.
- Home's Research graphic is an explicitly historical scoring subset, 2026
  weeks 1–6, with source fingerprint and exact recomputation tests. No sample
  figure or invented bookmaker quote ships.

## Verification

All 12 PR checks passed on the reviewed branch. The four cloud-browser shards
passed 376 tests in total; personas passed separately. Node passed all 2,936
tests, and Vitest passed 886 tests across 85 files. Typecheck, Windows
portability, Brand QA and dashboard checks passed.

PR runs: [Tests 42397947076](https://github.com/seanbalz/guess-the-line/actions/runs/42397947076),
[Dashboard checks 42397947092](https://github.com/seanbalz/guess-the-line/actions/runs/42397947092),
[Brand QA 42397947084](https://github.com/seanbalz/guess-the-line/actions/runs/42397947084).

Exact-main push runs are
[Tests 42399187523](https://github.com/seanbalz/guess-the-line/actions/runs/42399187523),
[Dashboard checks 42399187462](https://github.com/seanbalz/guess-the-line/actions/runs/42399187462),
[Brand QA 42399187536](https://github.com/seanbalz/guess-the-line/actions/runs/42399187536).
All three workflows and all 12 required jobs succeeded on this exact full SHA.

Read-only source review found no remaining important defects. Fixes include
Total-market navigation, expired-game counts, filter restoration, logo/control
bounds and preventing silent consumption of streak awards. The complete
all-page keyboard/scrolling matrix and injected-fault checks passed locally after
Home reserved its floating bar's full height, offset and focus clearance.

[Native Dark/Light captures and hashes](../design/approved-home-release-2026-11-07/README.md)
use fictional local accounts. The final focus-spacing fix changes scrolling,
not the captured layout. A physical iPhone visual check is not claimed.

The final full Windows Node run passed 2,935 of 2,936 tests, with one transient
temporary-file rename `EPERM` in unchanged `store.test.mjs`; all 15 store tests
passed immediately in isolation. The full exact-commit CI run above passed.

## Protected release

All three manual runs succeeded:

- [Check-only 42400561135](https://github.com/seanbalz/guess-the-line/actions/runs/42400561135).
- [Readiness 42400620539](https://github.com/seanbalz/guess-the-line/actions/runs/42400620539).
- [Deploy 42400945688](https://github.com/seanbalz/guess-the-line/actions/runs/42400945688),
  `deploy` / `frontend` / the exact source above.

The [reviewed release card](https://github.com/seanbalz/guess-the-line/pull/492)
pins source, approval, target/order, CI, migration digest, pending list,
compatibility, preservation and rollback. Both production gates were approved
through the GitHub API under Sean's direct “Good deploy” authorization after
checking each run's mode, target and full SHA. No calendar or kickoff window was
imposed. Fresh hosted preflight ran again at 18:23:51 UTC before the upload.

| Evidence | Verified result |
| --- | --- |
| Pages deployment | `f31193e9-9a0f-43c0-ac47-bb16460cb56b` |
| Production | [guess-the-line.pages.dev](https://guess-the-line.pages.dev/#home) |
| Immutable URL | `https://f31193e9.guess-the-line.pages.dev`, protected by Cloudflare Access |
| Served frontend | 127 production asset URLs matched the build manifest. The immutable URL's legitimate Access redirect was recognized; bytes behind that login were not checked. |
| Frontend SHA-256 | `11ac239eb3af44298b7c684c26d90dd702e10998bbad233e09f4e08c6c83ec3f` |
| Built source SHA-256 | `552b3e2199575e4f63035b2b7cbd4987b695b00608627cf537761c8f407bc0c7` |
| Build | Node `v22.23.4`, clean requested checkout, 128 manifest artifacts including hosting metadata `_headers` |
| API | Unchanged v50, ACTIVE, JWT verification true; bundle `c5ed571b75753c1a44abb9a017977b69daa929cdf7cac92d57a17846d3d58f48` |
| Other functions | No worker deployment or unexpected function metadata change |
| Migration history | 76 versions; unchanged SHA-256 `d40fdad9eb144738cdbd032e3c95ba433b4cb1606f3de3ab8079f0df1b8108f1` |
| Pending migrations | `20261029151727` M-33, `20261029161613` M-34, `20261029162144` M-35; none applied or required for Home |
| Published schedule | Validated 2026 Week 9; 29 games across the checked slates, `timeRestrictions:false` |
| Signed-out boundaries | 457 checked, 438 expected denials, 19 documented checks waiting only for M-33/M-34/M-35 |

Verification records API deployment metadata, not independently retrieved API
source bytes (`apiSourceVerified:false`). No API was deployed. No new signed-in
or physical-phone acceptance is claimed; the release verifies hosted frontend
bytes, metadata and signed-out boundaries. No real account data was mutated for
testing.

The Supabase app connector returned `UNAUTHORIZED` and no SQL ran through it.
The protected GitHub workflow uses its own existing credentials. Connector
access is not inferred from the workflow, and no password was requested.

## Rollback

Redeploy frontend from `8737251495f8add2b6493a58ccd03c3c002ac2ca`, the verified
Research release, Pages `a73e79f7-05ac-4e4a-915c-84e8ea5baf1d`. The backend is
unchanged and compatible with both frontends. No stored player data is removed.
