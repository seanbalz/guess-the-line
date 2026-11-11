# Saved-precision Virtual Units ROI release — November 8, 2026 UTC

**Deployed and verified** from `1c5a9da0deb479c15abf390a905acd47084cb338`.
The API and frontend now retain saved four-place unit amounts through week and
season summaries before calculating the existing two-place ROI percentage.
A 0.5U win saved as +0.4545U gives 90.9%, and a 0.01U/+0.0091U read gives 91%.
These examples describe arithmetic, not newly enabled stake entry or actual
player results. Qualification, ranking order, exact shared ties and amount
formatting retain their existing rules. Historical ties can split where saved
results differ. No stored result or settlement formula was rewritten.

Sean answered **“Move forward with rec”** to the saved-precision recommendation;
[D-78](DECISIONS.md) records that choice. [PR #500](https://github.com/seanbalz/guess-the-line/pull/500)
merged November 8 at 15:14:42 UTC. Its tree `2fd1033304d22f642b0a351a333fbbe6a9ed6053`
equals reviewed head `54c9a1fefa94c318533c225832e8b7d1d3502f43`.
Independent task and whole-branch source reviews approved spec and quality with
no findings. [Implementation and impact scope](VIRTUAL_ROI_SAVED_PRECISION_2026_11_08.md)
and [structured release receipt](evidence/VIRTUAL_ROI_RELEASE_2026_11_08.json)
retain the evidence and limits.

## Verification and release

Regressions first reproduced the cent-rounding failure. Focused checks then
passed 104 Node/SQL tests, 52 native component tests and 15 token contracts,
plus typecheck, Brand QA and whitespace, with zero skips. Real PGlite/API reads
cover fractional week/season parity, roster restrictions, no-term projections,
legacy stakes and unchanged complete fixture rows. This is local evidence.
All twelve PR checks and all twelve exact-main push checks passed on their
first attempts: [Tests](https://github.com/seanbalz/guess-the-line/actions/runs/42493816185),
[Dashboard](https://github.com/seanbalz/guess-the-line/actions/runs/42493816247),
and [Brand](https://github.com/seanbalz/guess-the-line/actions/runs/42493816244).

[Source check 42495528469](https://github.com/seanbalz/guess-the-line/actions/runs/42495528469),
[protected readiness 42495675724](https://github.com/seanbalz/guess-the-line/actions/runs/42495675724),
and [deployment 42496125746](https://github.com/seanbalz/guess-the-line/actions/runs/42496125746)
all succeeded for the exact source and `api-and-frontend` target. The same
fields/types remain compatible; old and new calculations may briefly disagree
during transition. The combined run deployed the API, then the frontend.
Production approvals used Sean's authorized GitHub identity after checking
actual mode, target, source and pending environment. No calendar window applied.
The build retains its existing large-chunk warning.

| Evidence | Verified result |
| --- | --- |
| Checked at | `2026-11-08T15:47:16.550Z` |
| Production | [Guess The Line](https://guess-the-line.pages.dev/#home) |
| Pages | `b3bd6187-adbf-4097-98e2-28417cac7d09` |
| Immutable URL | `https://b3bd6187.guess-the-line.pages.dev`, Access-protected |
| Production bytes | All 132 served assets match the clean requested build |
| Frontend SHA-256 | `6caa0aa077b4114b6f80a318e9ce5781122b63b633010d51d46924983f90d3a4` |
| Built-source SHA-256 | `af4ac31a3e259034b1f73827f77d3883434a63cae5f12b93c11bd3f34ae6669d` |
| Build | Clean exact checkout; 133 manifest artifacts including hosting metadata |
| API | v51 to v52 exactly; ACTIVE; gateway JWT verification true |
| API bundle SHA-256 | `76893d3a32c000669a0f11601a1454616630e6ff7ca2e55742221f63f3565ce1` |

The protected immutable URL's bytes were not fetched; production byte checks
are the independent frontend comparison. API deployment metadata is verified,
but remote API bytes were not independently matched to the source
(`apiSourceVerified:false`, `apiBundleMatchesCheckout:not-independently-verified`).
Manual source acceptance uses the clean exact checkout, successful pinned-CLI
deployment, expected version increment and recorded bundle metadata. No stronger
remote-source or signed-in behavior claim is made.

## Preservation and remaining work

Fresh readiness observed `2026-11-08T15:39:11.699Z`; the deployment repeated
preflight at `2026-11-08T15:44:44.918Z`. Both recorded 76 migrations with digest
`d40fdad9eb144738cdbd032e3c95ba433b4cb1606f3de3ab8079f0df1b8108f1`.
Only M-33 `20261029151727`, M-34 `20261029161613` and M-35 `20261029162144`
are pending in this source. No migration or worker was deployed. Other function
metadata and migration history passed the workflow's unchanged-state checks.
Schedule evidence is 2026 Week 9, 29 games, `timeRestrictions:false`.
Every boundary pass reports 457 checks: 438 expected denials and 19 documented
probes awaiting the existing migrations. Awaiting probes are not denials or
proof that an authenticated route exists.

Data, SQL, frozen design and v62 source are unchanged. Week 5 source retains
SHA-256 `a4ee8f13c4b58777767dbd94a022dbc0a721ff6ece90522e4ddf4e25d2d9f1dd`.
The Supabase connector required reauthentication, so actual hosted affected-rank
counts and private score/result-row preservation hashes were not obtained.
Synthetic impact examples and local row preservation do not prove those facts.
No new physical-phone or signed-in production acceptance is claimed. Existing
navigation acceptance remains under Sean's standing instruction.

Rollback is the last verified compatible pair at
`e3f078b9e831dda46412487251b191ebdd5637c4`: API v51 and Pages
`31417a19-3cea-47fc-bc0a-9b776df4724b`. It restores prior displayed ROI/ties
without reconstructing results or applying a SQL rollback.

M-41 Custom entry remains separate draft [PR #497](https://github.com/seanbalz/guess-the-line/pull/497).
Its named apply, Gate M queue, fresh hosted permissions/body/preservation checks
and compatible release remain required. This ROI release does not enable it.
The FEPL frame question is now presented with both approved references and
awaits Sean's choice. Parked avatars, awards, NBA and Signal remain deferred.
