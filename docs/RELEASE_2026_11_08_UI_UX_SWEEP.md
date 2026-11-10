# UI, navigation and scrolling release — November 8, 2026 UTC

**Deployed and verified** from `a17f2082e5e07e95179726ac948c44c55a506d1f`.
The frontend now shares Home’s approved floating bottom navigation across existing
NFL/EPL contexts. Contextual top headers, approved body layouts, active tabs,
access rules and badges remain. [D-79](DECISIONS.md) records Sean’s explicit
**“Bottom navigation only (Recommended)”** choice.

The sweep corrected four issues:

- Mixed floating/full-width bottom bars; actual rendered height now supplies
  content, dock, toast and keyboard-focus clearance, including enlarged labels.
- Guidance topics compressed into 2px rows; intrinsic sizing restores full
  summaries, expandable text and reachable source links inside the sheet.
- A single tracked ticket labelled “1 bets”; the noun follows the existing count.
- Fresh short details retaining opener scroll; changed Nest layers start at the
  top before existing heading focus, while Back restores list position and focus.

[PR #502](https://github.com/seanbalz/guess-the-line/pull/502) merged at 18:45:52 UTC.
Reviewed head `d7d84eb2c32482d78715293872bc6625dde60946` and merged source have the
same tree `47f352ad7376a8de7597f42debc5d2567688bf69`. Task and whole-branch/delta
reviews found no Critical/Important issues. Fixture/build/color warnings remain
recorded; output is not described as pristine. The [audit](UI_UX_SWEEP_2026_11_08.md)
and [structured receipts](evidence/UI_UX_SWEEP_RELEASE_2026_11_08.json) retain
scope, attempts and limitations.

Initial PR source 9dd passed eleven checks and failed a real badge-entry case.
Reproduction showed shelf scroll 283 clamped to 45 on a new 889px detail; the old
844px baseline masked its missing top reset. RED expected 0/actual 45 became GREEN,
with exact settled Back position/opener focus and reopening at 0. All 48 covering
browser cases passed. The initial CI failure remains failed in the receipts.
All twelve corrected-head PR checks and all twelve exact-main push checks then
passed: [Tests](https://github.com/seanbalz/guess-the-line/actions/runs/42511613375),
[Dashboard](https://github.com/seanbalz/guess-the-line/actions/runs/42511613226),
[Brand](https://github.com/seanbalz/guess-the-line/actions/runs/42511613279).

[Source check 42513653064](https://github.com/seanbalz/guess-the-line/actions/runs/42513653064),
[readiness 42513782665](https://github.com/seanbalz/guess-the-line/actions/runs/42513782665)
and [frontend deployment 42514212232](https://github.com/seanbalz/guess-the-line/actions/runs/42514212232)
succeeded for the exact source. Sean’s authorized GitHub identity approved each
actual production environment request after reviewing mode, target, source, CI
and readiness. No calendar window applied. Deployment repeated fresh preflight
and used the reviewed migration-history digest.

| Evidence | Verified result |
| --- | --- |
| Checked at | `2026-11-08T19:21:34.665Z` |
| Production | [Guess The Line](https://guess-the-line.pages.dev/#home) |
| Pages | `968d3b5d-a115-42ea-8293-ce405ef42f91` |
| Immutable URL | `https://968d3b5d.guess-the-line.pages.dev`, Access-protected |
| Served bytes | All 132 production assets match the clean requested build |
| Frontend SHA-256 | `1300acebf6f0e9d5310512244410e43c2c3fc5229bce122417be7003061cc5cd` |
| Built-source SHA-256 | `768bc4fb3174dde8e85c8a7fec346d3940fe17660ff4df51a80a876a53294a74` |
| Manifest | Exact source, clean checkout, 133 artifacts including hosting metadata |
| API | v52 unchanged, ACTIVE, gateway JWT verification true |
| API bundle metadata | `76893d3a32c000669a0f11601a1454616630e6ff7ca2e55742221f63f3565ce1` unchanged |
| Migration history | 76 versions; digest `d40fdad9eb144738cdbd032e3c95ba433b4cb1606f3de3ab8079f0df1b8108f1` |

Readiness observed hosted state at 19:14:00.929 UTC; deployment preflight repeated
it at 19:19:40.408 UTC. Only M-33 `20261029151727`, M-34 `20261029161613` and M-35
`20261029162144` remain pending in this source. Each boundary pass records 457
checks: 438 expected denials plus 19 documented probes awaiting those migrations.
Awaiting probes are not denials or proof that their authenticated routes exist.
Schedule evidence is 2026 Week 9, 29 games, `timeRestrictions:false`.

No API, worker, SQL, collector or schedule deployment occurred. Tracked data,
cloud, server, shared and Supabase source trees equal the previous deployed ROI
source 1c5; Week 5 source SHA-256 remains
`a4ee8f13c4b58777767dbd94a022dbc0a721ff6ece90522e4ddf4e25d2d9f1dd`.
These source-file hashes do not establish hosted private-row preservation. API
metadata is unchanged; remote API bytes were not independently matched to source.
The verifier’s API-source limitation remains. Rollback is a protected frontend-only
redeploy of `1c5a9da0deb479c15abf390a905acd47084cb338` with fresh gates, keeping API
v52/SQL unchanged; previous Pages is `b3bd6187-adbf-4097-98e2-28417cac7d09`.

Local review covers both themes, 320/390/768/1440 widths, short/landscape views,
native controllers, charts, overlays and scroll/focus/Back paths in Chromium and
WebKit emulation. The first 645-input layout candidate remains tied to 9dd; only
Nest changed afterward, covered by the fresh 48-case navigation run and final
exact-source CI. A public postdeploy 390px Dark sign-in smoke has no page errors
or sideways document scroll. Signed-in production UI, real iPhone keyboard,
toolbar, safe-area/touch behavior, live-provider accuracy and private boards remain
separate evidence. Local HOSTED/ALL schemas and synthetic EPL/quote fixtures
establish UI behavior only.

The held FEPL top-header choice, M-41 draft/apply, parked features and frozen v62
are unchanged. Earlier local/pending sweep entries are historical. This followup
is documentation only; publishing its record does not require another app deploy.
