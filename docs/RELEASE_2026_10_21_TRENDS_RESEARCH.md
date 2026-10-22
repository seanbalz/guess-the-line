# Guess The Line — trends research release

Owner: Sean Balsiger · October 21, 2026

## Deployed connection

Sean approved the trends upgrade and instructed "get it connected". The first
dated reviewed source feed and trends UI are deployed. Automatic X collection
is off. The initial signed-in acceptance found a history-source mismatch that
correctly withholds current research leans; the API-only correction below is
reviewed locally but not yet deployed at this checkpoint.

Runtime source: `fb86a3ea55bd91db1b1937dcd40ee70063d37716`, merged in
[PR #161](https://github.com/seanbalz/guess-the-lines-repo/pull/161).
All exact-source main-push checks passed: [Tests](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/39680519501),
[Dashboard](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/39680519484)
and [Brand QA](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/39680519492).
Results: 1,515 Node tests with zero skips, 217 React tests, 30 Windows checks,
41 standard browser tests, 271 cloud browser tests, 16 persona tests,
4 performance tests, 7 accessibility tests, 9 snapshot and 158 model tests.

The protected shared workflow passed in order:

| Gate | Run | Result |
| --- | --- | --- |
| Source | [39686698251](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/39686698251) | Exact source and main CI verified |
| Readiness | [39686803738](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/39686803738) | Fresh hosted state checked at 22:30:08 UTC |
| API then frontend | [39687111092](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/39687111092) | Deployment and verification passed at 22:34:08 UTC |

API **v29**, ACTIVE, JWT verification enabled, bundle SHA-256
`de802dd78c3bb8e1b5eba843c92e8e2bd250a79a520f66634ae1d92279e8fe5b`.
Pages **`0dde8b76-54c0-47e8-a0b0-08323bd60339`**; all 97 served assets matched
the manifest at both the immutable deployment and production URLs. Frontend digest:
`73579bf8a0b748565955fbd46e19b9007e35977d7252322ad949be16447bda5e`.

The workflow reports `apiSourceVerified: false`: its bundle metadata alone does
not prove source equivalence. Independently, all **54 retrieved API source files**
matched the exact runtime commit at 22:33:57 UTC, normalizing CRLF to LF only.
This verifies the retrieved source files, not a separate reconstruction of the
provider's executable bundle.

The prior Pages rollback baseline is `1e349227-b5dc-4561-aeb6-04d6cd57da50`
from `8ca21017c8e9ff84db26d17dc29eb39734799796`; prior API is v28 with bundle
`8fe54bce2eed82a973674fc31188bba548d21ad758bdefe8689bd811af91e656`.
The release retains that independently deployed Recommended update. The workflow
control source advanced to `63ff3097d0f7e523d2fd88c7d26d403611b41c83` only for
its documentation closeout; the requested runtime source stayed pinned.

## Preservation and boundaries

Hosted history remains **46 migrations**, digest
`c571cd2de3d53ae0239a98d792cd0a1b542c2cbdda08190d2fa98ca4b126910f`.
Only M-10 (`20261015190820`) and D-53 (`20261016010000`, `20261016011000`)
remain pending. No migration was applied. The private NBA migration was already
applied independently and is not repeated by this release.

Read-only aggregate hashes at **22:30:58 UTC** and **22:33:43 UTC** match:

| Preserved data | Rows | MD5 of deterministic aggregate |
| --- | ---: | --- |
| Ballots | 23 | `8d9077ed40635df06f35c592043412da` |
| Finished Week 5 scores | 135 | `35bb9844590aed3cad7a44cc1f0d114d` |
| Finished Week 6 scores | 168 | `687772bae20b82fcce929db192cc8c64` |
| Groups | 5 | `00d115d30ae67c405c55216c821633f1` |
| GTL function definitions/configuration/grants | 126 | `3668682d0931e26a20dcc6985963a4d4` |
| Social receipts | 101 | `5bea2f11e3f6224e1a2e4e5f62fa854e` |
| Social weeks | 3 | `42b25b1a937b63faac1dfc3629f60f62` |
| Virtual Units original terms | 7 | `90a6ae0f391374479fa7c3b62257a687` |
| Virtual Units records | 7 | `1be703004564873aad48c2df5d4b64f6` |
| Private NBA imports | 3 | `85b64c7706e24590f32f490d393a77e0` |
| Private NBA bets | 10 | `9ac30fae8dcdc19cfaf5b9ae7410c962` |

No raw records or player identities were copied into this evidence. Unrelated
Edge workers remain odds v5, week-open v4, push v3 and results v2, with their
previous bundle hashes. No collector, schedule, odds budget or app-default change
was made. All 264 applicable signed-out probes denied access; six probes remain
explicitly awaiting the three pending migrations. They are not counted as denials.

## Initial signed-in acceptance and source correction

The existing signed-in account, with both Week 7 markets already locked, opened
Lines and weekly research without entering or changing any pick. The app showed
three charted shortlist candidates and Last 30 games as default. The separate
Book It With Trent section displayed the dated original-play card, source link,
capture/post times, unknown prices and source-reported label. These entries do
not vote on computed leans. Feed configuration and privacy evidence are in the
[connection card](TRENDS_RESEARCH_RELEASE.md); raw feed terms remain private.

The live history status was stale. Investigation isolated the mismatch:
`prepare-trends-research.mjs` reads the published `TRENDS_SOURCE.url` release,
but the native adapter reused the raw `NFLVERSE_SCHEDULE_URL` mirror. The two
public files had matching schedule fingerprints and different completed-history
fingerprints. The prepared artifact matched the published release; no freshness
guard was weakened and stale history did not produce a current lean.

The follow-up changes only research's loader to the same fixed public release
URL used by preparation. It follows the release asset redirect without credentials
or user data and retains the ten-second timeout. Scheduling and settlement keep
their existing source. A native-adapter regression deliberately supplies different
histories at the two URLs: it failed with `stale` before the fix and passed after.
All 52 focused research checks and typecheck passed. The actual adapter using the
live public release returned fresh history for all six periods at 22:38:23 UTC.
Independent review approved API-only compatibility with no blocking findings.
Exact-source CI and a separate protected API release remain required.

For the initial v29 acceptance request, hosted logs show HTTP 200 in 1,161 ms;
its corresponding shutdown reported 635 ms CPU and 58,647,711 bytes total memory,
with reason `EarlyDrop`. This is one observed request, not a load test, peak
memory claim or proof of corrected freshness. Physical-phone acceptance remains
separate. Screenshots could not be captured during this initial browser check;
the visible accessibility state established the results above.

Rollback remains scoped: disable `research` with `GTL_FEATURE_OFF` if required,
then restore the prior reviewed API/frontend through the shared workflow. Retain
all player data and the reviewed feed. No data rewrite or migration rollback is
needed.
