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
| Moneyline game | M-32 source is merged, NOT_HOSTED; local apply-review packet exists. No live DNB verdict. | Release owner handles named apply/enablement gates; only a real passing DNB check permits routes, regular collection and player screens to proceed. | Source, local tests, schema apply and live market availability are separate. No paid data or reserve reduction is authorized. |

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
- M-32/M-33 and any later migration remain separate named apply gates. “Continue”
  authorizes this implementation work, not an unrecorded hosted migration or job
  enablement.
- Full MW9 → MW10 operation, actual correction readback, push delivery and physical
  iPhone acceptance remain open. No future event is fabricated to close the list.
- Once EPL work is implemented or explicitly waiting on a live gate, return to
  the approved varied-trend, Research/chart and optimization queue. Preserve #363
  and other owners' unpublished work.
