# My bets selection grid production release — November 1, 2026

Owner: Sean Balsiger · Version 1 · Deployed; signed-in phone acceptance pending

Sean's selected **04 — Selection grid** is deployed at
[My bets](https://guess-the-line.pages.dev/#bets/tracked).
[PR #401](https://github.com/seanbalz/guess-the-line/pull/401) merged as
`43768a44b3cbbef2bc104b5e16f1512ab526eaaf`. Every parlay leg stays visible in
two columns. Straight tickets lead with the player and exact pick; notes,
corrections and history open from the ticket menu. Comparison and performance
controls remain available inside Filters.

[The implementation contract](MY_BETS_GRID_2026_11_01.md) covers guided manual
player props, exact cash/unit conversion and eight additional manual sportsbook
names. Milestones retain their exact meaning, including 70+ and anytime TD.
Saved units keep four-decimal precision. The account's optional device conversion
does not rewrite saved stakes. Manual sportsbook names do not establish new
provider integrations. No API, migration, collector or production-data write was
part of this frontend release. Guessing, scoring, locking and reveal rules remain
unchanged.

## Source and protected deployment

All twelve PR checks passed on final head
`96de151dcf2a755ab67489b89e28a02e77c0c60a`. All twelve exact-main push checks
passed without skips on the deployed source:
[Tests](https://github.com/seanbalz/guess-the-line/actions/runs/41338728253),
[Dashboard, Persona and four browser shards](https://github.com/seanbalz/guess-the-line/actions/runs/41338728302),
and [Brand QA](https://github.com/seanbalz/guess-the-line/actions/runs/41338728264).

Sean approved both existing GitHub production gates. The exact source and
frontend-only target passed each release step:

| Gate | Successful run |
| --- | --- |
| Source and exact-commit CI | [41339814099](https://github.com/seanbalz/guess-the-line/actions/runs/41339814099) |
| Protected readiness | [41340018970](https://github.com/seanbalz/guess-the-line/actions/runs/41340018970) |
| Protected deployment | [41344546549](https://github.com/seanbalz/guess-the-line/actions/runs/41344546549) |

[Release card #402](https://github.com/seanbalz/guess-the-line/issues/402)
records the reviewed digest, compatibility, approval and rollback. Readiness
observed production at 19:32:00 UTC. Deployment repeated preflight at 20:02:04
UTC and verified production at 20:03:49 UTC. Both observed published 2026 Week 8
with 28 current/carryover games; calendar release restrictions remain disabled.
No pending migration was applied.

| Component | Verified state | SHA-256 |
| --- | --- | --- |
| Source manifest | Clean exact-source checkout | `a56e27d2fbbb0c2247626110a9ff16e44cabab59f1cbcece4f02f7b677e27c5d` |
| Pages | `83caec6d-2da5-4f20-a53a-902a5cd7512a`; 127 matching production assets | `cb8f3893e67473bbbc00b1fb903edf6ce95d587a41b7e44a01fe336d8c9b6f8c` |
| Unchanged `gtl-api` | ACTIVE v45; JWT verification enabled | `7640627cfd1a457729382b90f09a3b094095c63da76c62a5559038e1190c675b` |

The scanned manifest contains 128 artifacts; `_headers` is deployment
configuration, leaving 127 served files. The immutable Pages URL is
Access-protected, so the workflow compared every served production file with its
manifest. An independent Node readback repeated all 127 byte-length and SHA-256
comparisons at 20:04:20 UTC, with no mismatches. An earlier Python HTTP attempt
received 403 responses; that attempt is not counted as verification.

The frontend-only verifier confirmed unchanged API metadata and all other Edge
function versions, status, JWT settings and bundle digests. Backend/shared server
code, Supabase files, release scripts and locked dependencies match the deployed
API source `a62d35c530e360e354c858d807937aa3aa3547db` byte for byte. The UI still
saves only the existing five leg fields. The artifact's `apiSourceVerified: false`
remains accurate: this release did not independently attest the entire remote
API bundle against a checkout.

## Preservation and validation

Hosted migration history remains 72 rows with SHA-256
`b3b13f6f7557851b6d0f0be8893a1840aa5a7abdec1cb4ff42b68a33a9fc521d`.
Pending versions remain M-33 `20261029151727`, M-34 `20261029161613` and M-35
`20261029162144`. Signed-out checks covered 444 resources: 425 denials and 19
explicitly awaiting those unrelated EPL migrations. This is not 444 denials.

Read-only preservation before deployment at 19:59:33 UTC and after deployment at
20:04:34 UTC matched exactly:

| Protected set | Rows | Unchanged MD5 |
| --- | --- | --- |
| Finished Weeks 1–7 score rows | 359 | `1e2753375bbf6719a44d32a4d7323fc1` |
| Finished Weeks 1–7 ballots | 25 | `c097fbbce481d5124e710818d6d7a0f5` |
| Settled Virtual Units picks | 7 | `056fba89cd3e997c27b02dc3a3ee32a4` |
| Virtual Units settlement records | 44 | `8bf484c46a103d1d3065f874756d2b67` |

The existing public GTL function body/ACL/config aggregate remains
`1d98dd538caeb84cba770348fa6f8b15`. A separate bounded account-ticket comparison
also matched the reviewed saved records exactly. Its inputs and detailed
receipts remain private under ignored `.local` paths; no raw account records
are published here. No records were reimported or corrected during deployment.
The frozen v62 tracker is unchanged.

Local validation passed 27 focused Node checks, 620 component tests, 30 tracked/
recommendation browser flows, two final guided-entry flows and both complete
phone-sweep tests. Typecheck, cloud build/private-data scan, Brand QA and diff
checks passed. The phone sweeps covered 320/390 px, Light/Dark and enlarged font
conditions. These fixtures do not establish real-device production acceptance.

## Acceptance and rollback

Real signed-in production and physical-phone acceptance remain pending. Next
acceptance should check existing tickets, every parlay leg, the ticket menu,
Filters, guided props, exact cash conversion, save/reload and account isolation
under an authorized real session. No production test wager was created. This
release does not close the separate research-data or automatic-X-feed work.

Rollback uses a separately approved frontend release of
`a62d35c530e360e354c858d807937aa3aa3547db`, or prior Pages deployment
`67360c27-a8f0-437f-b0c4-5734331fb163`. API v45 is compatible with both frontends.
Do not rewrite account records or apply pending migrations to recover this UI.
