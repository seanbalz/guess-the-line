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
| Combined acceptance | #377 merged as `e220b8d8f7663f55156e019de1d80c44493c440a` after all 12 checks; includes #370/#371 and integration repairs. | Source complete; separate release and actual hosted capture/review acceptance remain. | M-33 is not hosted; do not operate rechecks on M-33 alone without the M-35 interval protection. |
| Player names | Daily-only display enrichment and immutable snapshot scoring positions merged in #377. | Deploy compatible source and inspect a new daily capture's nonempty-name coverage. | Existing snapshots remain unchanged; fixture tests do not establish hosted name coverage. |
| Standings | Readiness merged in #377; collection/persistence/resolver source in #378. | Compatibility repair pushed at `c0c5bab8603b24196b4f6f140c7812df4b1de249`: M-34 preserves the moneyline job/disabled row. Fresh exact-head CI/review remains. | M-34 is not hosted; dated licensed source and actual use/readback remain separate. |
| Monday finalization and corrected order | #380 at `bfae421544d5fbc80a5cb2f017992c540f62bdd0`; independent review verified daily fallback and post-lock deadline repairs, 16 focused tests passed. | Fresh CI/review, then named apply and verified cutoff/manual-recovery prerequisites. | D-68 item 24 is confirmed; full live round/correction acceptance remains open. |
| Moneyline game | M-32 applied; live MW9 DNB gate passed. #381 child UI published; collector `d29c1d4` and shell `30ceb38` available for combined acceptance. | Finish API SQL/HTTP checks, compose actual API/collector/shell and run full flows. Review/apply final M-36, deploy and verify activation. | Collector job must be enabled for lock-time refresh. A closed MW9 window can legitimately yield nothing_due; never alter real windows or enter a real guess just to force acceptance. |


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
