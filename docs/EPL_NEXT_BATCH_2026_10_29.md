# EPL next batch — October 29, 2026

Owner: Sean Balsiger · Coordinator: Codex

Sean instructed “lets continue” after the next-EPL priority list. The first
source batch is merged at `5c1b775f05a69306f20f911f4b0455c207c65ffc`.
Frontend and EPL worker v2 deployment are verified by the release owner; the
main hold is cleared. [Release-evidence PR #374](https://github.com/seanbalz/guess-the-line/pull/374)
records the hosted result. Root resumed the two deferred #370 browser jobs and
#371 Tests/Dashboard checks. This continuation does not apply migrations or
change the deployed source by itself.

## Work and ownership

| Lane | Starting evidence | Current next action | Completion boundary |
| --- | --- | --- | --- |
| Combined acceptance | #370 at `d2f712852a1f17faf5c7325d4059cab0d60b8277`; #371 at `44350af004592b99559c3099dc2104810e2dd801`; correction review flag at `b04eb83a20a3d6b0e1ab20f83239a6d63ede48bb` | Access agent combines the source in an isolated branch, resolves actual integration failures and runs focused SQL/UI/browser checks. | Reviewed exact-head CI, then merge/release. Existing #370/#371 cancelled checks are scheduling deferrals, not passing checks or source failures. |
| Player names | #371 supplies bounded daily-only display enrichment and snapshot-only scoring positions; 260 EPL Node and 17 JSX tests passed locally. | Resume deferred CI after the hold, review and release, then inspect a new daily capture's nonempty-name coverage. | An old immutable capture is never overwritten. Local fixture coverage does not close the hosted metadata gap. |
| Standings | Readiness branch at `7e25f7a9c5ed925ab94dcc5b0d03820e50c3c61a`, with 19 passing local tests and a dated community-source record. | Moneyline agent connects validated collection, private persistence and deadline resolver input, preserving provenance, licensing, freshness and old-schema compatibility. | Source readiness alone is not a connected feed. Missing/stale positions remain explicit and cannot become an alphabetical rank. |
| Monday finalization and corrected order | M-33 currently captures/audits Tuesday corrections; commissioner flag is prepared. First final capture still uses the original window/rollover rule. | Operations agent examines and fixes Monday-final scheduling with source guards, and recomputes a corrected next order only before any pick exists. | Existing picks/order stay preserved once drafting starts; commissioner review remains visible. Source evidence is required before marking scores final. |
| Moneyline game | Release owner verified M-32 applied as hosted `20261029162422`, with unchanged preservation hashes and six matching new function bodies. The authorized MW9 DNB check passed: three events priced by all three allowed books; six schedules now enabled. | Release owner records apply and live-check evidence in #374/#375. API, regular collector and player-screen work now proceeds from the verified gate; source/privacy/budget/release checks still apply. | Source, local tests, schema apply and live market availability are separate. Free sources and the existing 50-credit reserve remain mandatory. |

The earlier runner/release hold is cleared. Agents may publish tested PRs and
run CI; root reviews and merges the next batch. Preserve the release owner's
evidence updates when integrating current main. M-34 is reserved for standings if required;
M-35 is reserved for order correction if required. New migration timestamps and
dependencies must follow the canonical CLI/ledger rules, not those labels alone.

## Preserved decisions and remaining acceptance

- D-68 item 23: preserve entered picks and existing order after drafting starts;
  flag stat corrections for commissioner review. No automatic replay or deletion.
- D-68 item 24: Sean confirmed midweek rounds finalize once all results and the
  exact next Sleeper week/season are verified, with complete valid totals. No
  following-Monday wait; source guards and Tuesday correction checks remain.
- The commissioner flag is a read-only view; it does not prove that a prospective
  order was recomputed or provide an invented resolution action.
- M-32 is applied under its named approval; M-33 and later migrations still have
  separate named apply gates. “Continue”
  authorizes this implementation work, not an unrecorded hosted migration or job
  enablement.
- Full MW9 → MW10 operation, actual correction readback, push delivery and physical
  iPhone acceptance remain open. No future event is fabricated to close the list.
- Once EPL work is implemented or explicitly waiting on a live gate, return to
  the approved varied-trend, Research/chart and optimization queue. Preserve #363
  and other owners' unpublished work.

## Final-capture source prerequisite

A delayed cumulative-total capture needs evidence that the next round has not
started; exact Sleeper N+1 by itself is insufficient. Current window placeholders
and incomplete odds lists do not establish that interval. The operations lane is
preserving a pending/manual-review state where interval evidence is unavailable.
Any commissioner attestation is explicit and append-only, not invented by a job.
This remains a source prerequisite rather than completed automatic finalization.

The official FPL endpoint was considered but not called or adopted. Its
[primary terms, sections 28(d) and 29](https://fantasy.premierleague.com/help/terms)
restrict automated game-data extraction and reuse; endpoint reachability alone
does not establish the verified reuse permission this repository requires.

## Live moneyline gate — verified October 29

After Sean's explicit enable-and-test approval in the release chat, run
`776bb6ae-6ead-40f0-a1cf-3449d46d3f25` succeeded at 16:44:48 UTC for 2026 MW9.
Root independently read the hosted run: `dnbAvailable=true`, checked/priced 3/3,
book counts 3/3/3, and 404 credits remaining after the three-credit check.
[Evidence PR #375](https://github.com/seanbalz/guess-the-line/pull/375) records the
live result. No future prices or player guesses are published here.

The approved plan's previously gated moneyline tasks are active: operations agent
owns API Task 3 after its M-35 work; moneyline agent owns collector Task 4 after
M-34; access agent owns child-screen Task 5 after combined integration. Existing
SportEntry/EplApp/shared-shell/router/profile ownership stays with **Keep EPL and
NFL interface consistent**. That chat owns the confirmed shared interface and
stay-in-section switching; sport-specific game modes remain distinct.
