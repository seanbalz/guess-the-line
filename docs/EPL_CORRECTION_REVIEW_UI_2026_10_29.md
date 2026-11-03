# EPL correction review flag — October 29, 2026

Owner: Sean Balsiger · State: implemented and checked locally; not merged or deployed. The PR is deferred during the
first release batch's runner hold. No hosted mutation or release dispatch was performed by this lane.

Sean confirmed **preserve existing picks and draft order; flag the correction for review**. The new read-only view is
under **Menu → Commissioner tools → EPL stat corrections**. It shows a stat-correction flag, original and corrected
Sleeper season totals, both capture times and how many picks are recorded in the next draft. This reports changed scores;
it does not claim to calculate a changed order. No acknowledgement, resolution, reorder or delete operation was added.

## Read contract and privacy

`POST /epl/admin/corrections/read` requires the existing signed-in Community commissioner guard before reading any
correction metadata. The request accepts only an optional validated season. The component and endpoint read load only
when that specific commissioner tool opens; normal app startup, EPL draft reads and the tools hub incur no new read.
Refresh is an idempotent read (`save=false`), and closing the tool aborts its in-flight read.

No new migration is required: M-33 already grants service-role SELECT. Its existing pure due-time function is probed with
null arguments to detect its known absent entry point before table access. Before M-33 is installed the endpoint returns
`available=false`; the UI says checks are unavailable. Permission, transport and database errors remain failures, distinct
from an empty review list. A transient refresh failure retains the last loaded review with an explicit stale message;
401/403 clears cached review evidence and shows the access refusal.

The server uses fixed selects: at most 38 season audit rows, at most 76 referenced snapshots, and at most 304 next-week
pick rows selecting **week only**. No private queue is read. Raw snapshot/roster payloads, player arrays, account IDs and
pick details are not returned. The response contains canonical manager names, normalized points-for/against and changes,
source labels/timestamps, validated roster hashes and next-week pick counts. Missing, duplicate or nonnumeric source
totals remain null and display **—**, never a manufactured zero. Optional missing decimal fields retain Sleeper's zero
decimal convention. Capture timestamps are displayed in Pacific time with daylight-saving conversion.

## Verification

| Scope | Result |
| --- | --- |
| Node | 375 tests passed, zero skipped: EPL, migration/rollback, route modules, cloud boundary and token checks. New adapter tests cover commissioner denial before source reads, M-33 absence versus a real error, fixed-field bounds, normalized/missing totals, no queues and source timestamps. |
| JSX | 20 tests passed: existing commissioner/EPL UI plus correction states, accessible markup and the read-only API action. |
| Browser | One local Chrome fixture scenario passed at 390 px dark and 320 px light. It verifies no review chunk/request before opening the tool, flag/totals/timestamps, refresh/error/empty/unavailable states and clearing cached evidence after a 403. Both themes have zero Axe violations and no horizontal overflow. Screenshots were visually inspected. |
| Build and static checks | Typecheck, cloud build, bundle privacy scan, Brand QA and whitespace checks passed. Uses the existing D-38 Card/Button/type/token system, with no new palette or raw CSS dimensions. |

The browser uses local PGlite for existing authentication/navigation and fabricated normalized correction replies. It is
not a hosted correction, a physical iPhone Safari acceptance run or a real future MW10 cycle. Local screenshots live
under `.local/epl-review-browser-results/`; no private production snapshot was copied into the repository.

## Still open

- Source/CI review, a PR after the runner hold, M-33 apply through Gate M, compatible API/frontend/worker release and
  authenticated commissioner readback. The first release batch does not include this follow-on.
- Automatic corrected-score order recomputation for an **already-open next draft with no picks yet**. This view asks
  the commissioner to review that order rather than claiming it was recalculated. Existing entered picks/order remain
  unchanged under Sean's confirmed rule.
- A permitted current standings feed and dated position persistence, first Monday-final capture scheduling, real
  MW9 → MW10/correction acceptance and physical-phone acceptance. See
  [M-33 source evidence](EPL_STAT_RECHECKS_2026_10_29.md) and
  [operations readback](EPL_OPERATIONS_WORKFLOW_2026_10_29.md).
