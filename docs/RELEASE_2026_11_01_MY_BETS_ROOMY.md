# Roomy My bets previews production release — November 1, 2026

Owner: Sean Balsiger · Version 1 · Deployed; signed-in phone acceptance pending

Sean's selected **01 — Roomy cards**, with **Expand in place, as shown**, is
deployed at [My bets](https://guess-the-line.pages.dev/#bets/tracked).
[PR #405](https://github.com/seanbalz/guess-the-line/pull/405) merged as
`46097802899472cdfb1bdb00c7c50248e2f24dab`. Compact previews have 20px internal
padding and 24px between tickets. Tapping opens the full selection grid in
place; the upward chevron collapses it and restores focus. Every parlay leg,
exact terms, units and existing details/history remain available after opening.

[The implementation contract](MY_BETS_ROOMY_2026_11_01.md) describes the preview,
keyboard interaction, recorded matchup marks, unknown values and pending total
return versus settled net units. The [five visual studies](../design/my-bets-previews-2026-11-01/README.md)
record the selection. This is a frontend-only release. No API, migration,
collector, budget, guessing/scoring/reveal rule or hosted bet write is included.

## Source and protected release

All twelve PR checks passed on final head
`d9ec1b0df387e769371b2cb9bc8eb1796a21aeab`. All twelve exact-main push checks
passed without skips on the deployed source:
[Tests](https://github.com/seanbalz/guess-the-line/actions/runs/41353296476),
[Dashboard, Persona and four browser shards](https://github.com/seanbalz/guess-the-line/actions/runs/41353296452),
and [Brand QA](https://github.com/seanbalz/guess-the-line/actions/runs/41353296429).

Sean approved both existing GitHub production gates. Each release run succeeded
for the exact source and frontend target:

| Gate | Successful run |
| --- | --- |
| Source and exact-commit CI | [41354327928](https://github.com/seanbalz/guess-the-line/actions/runs/41354327928) |
| Protected readiness | [41354412989](https://github.com/seanbalz/guess-the-line/actions/runs/41354412989) |
| Protected deployment | [41354776316](https://github.com/seanbalz/guess-the-line/actions/runs/41354776316) |

[Release card #406](https://github.com/seanbalz/guess-the-line/issues/406)
records compatibility, reviewed digest, approval and rollback. Readiness observed
production at 21:57:17 UTC. Deployment repeated fresh preflight at 22:06:18 UTC
and verified production at 22:07:56 UTC. Schedule evidence covered published
2026 Week 8 and 28 current/carryover games. Calendar release restrictions remain
disabled. No pending migration was applied.

| Component | Verified state | SHA-256 |
| --- | --- | --- |
| Source manifest | Clean exact-source checkout | `cca28a7e58a9e0eada116dab48c8ee1f705e0f7c574172f24c8a84c8a69ec206` |
| Pages | `90a7bf99-10b2-4390-abf2-4140c7b95d80`; 127 matching served files | `4409b184f684712bbbb4cf6ebecdb08eeb96b1a92e708bdcb4c5f91cae56862b` |
| Unchanged `gtl-api` | ACTIVE v45; JWT verification enabled | `7640627cfd1a457729382b90f09a3b094095c63da76c62a5559038e1190c675b` |

The scanned manifest has 128 artifacts, including `_headers` configuration and
127 served files. The immutable Pages URL is Access-protected; the workflow
compared every production file with its manifest. Independent Node readback at
22:28:00 UTC repeated all 127 byte-length and SHA-256 comparisons with no failures.

The frontend verifier confirmed unchanged API metadata and every other Edge
function's version, status, JWT setting and bundle digest. Server/shared code,
Supabase files, release scripts and locked dependencies match the previous
frontend source `43768a44b3cbbef2bc104b5e16f1512ab526eaaf` byte for byte. The
artifact's `apiSourceVerified: false` is retained: this frontend release did not
independently attest the entire remote API bundle against a checkout.

## Preservation and validation

Hosted migration history remains 72 rows with SHA-256
`b3b13f6f7557851b6d0f0be8893a1840aa5a7abdec1cb4ff42b68a33a9fc521d`.
M-33 `20261029151727`, M-34 `20261029161613` and M-35 `20261029162144` remain
pending. Global signed-out verification checked 444 resources: 425 denied and
19 named probes awaiting those unrelated EPL migrations. This is not 444 denials.

Read-only checks at 21:57:32 UTC before deployment and 22:28:00 UTC after it
preserved the following rows and sorted-jsonb-MD5 fingerprints:

| Protected set | Rows | Unchanged MD5 |
| --- | --- | --- |
| Finished Weeks 1–7 score rows | 359 | `1e2753375bbf6719a44d32a4d7323fc1` |
| Finished Weeks 1–7 ballots | 25 | `c097fbbce481d5124e710818d6d7a0f5` |
| Settled Virtual Units picks | 7 | `056fba89cd3e997c27b02dc3a3ee32a4` |
| Settlement records present at the before-check cutoff | 50 | `959a10fd5f28b6d177950fc45d1cf5b0` |

Settlement history grew to 52 records, aggregate MD5
`bb5854b9915619b6111f43356a7346e7`. The scheduled nflverse final-score job
appended Week 8 TEN–CIN and ARI–DAL v1 at 22:05:02 UTC, before the deployment
preflight; each settled zero picks. All earlier 50 records matched exactly.
Earlier checks also reconciled the scheduled ATL–TB record and five subsequent
finals while retaining their preceding row hashes. These legitimate current-week
appends were preserved; no record was restored or rewritten to force an old hash.

The existing public GTL function body/ACL/config aggregate remains
`1d98dd538caeb84cba770348fa6f8b15`. The bounded account-ticket check found all
seven targeted tickets with unchanged complete-entry and terms fingerprints,
including recorded units. The account revision and all-ballot fingerprint also
matched. Raw account records, receipt inputs, detailed checks and local
screenshots remain ignored under `.local`; no private selections are published
in this record. The frozen v62 tracker is unchanged.

Local validation passed 18 focused Node checks, all 620 component tests, all 30
bet/recommendation browser flows and both full phone sweeps. Checks cover closed
previews, six-leg expansion, Enter/Space, focus restoration, Light/Dark at
320/390px, enlarged fallback fonts, exact 70+ / four-decimal units, correction,
reload, ownership, uncertain-save recovery and no extra API request on expansion.
Typecheck, cloud build/private-data scan, Brand/D-18 QA and diff checks passed.
The local fixture build was separate from the protected production build.

## Acceptance and rollback

Actual signed-in production and physical-phone acceptance remain pending.
Static file hashes and local browser fixtures do not establish those checks.
Next acceptance should inspect existing previews, tap/collapse, all selections,
ticket details and exact displayed units under an authorized real session. No
production test ticket was created. Separate research-data/X-feed acceptance
remains open.

Rollback uses a separately protected frontend release of
`43768a44b3cbbef2bc104b5e16f1512ab526eaaf`, or prior Pages
`83caec6d-2da5-4f20-a53a-902a5cd7512a`. API v45 is compatible with both frontends.
Do not rewrite account records or apply pending SQL to recover this presentation.
