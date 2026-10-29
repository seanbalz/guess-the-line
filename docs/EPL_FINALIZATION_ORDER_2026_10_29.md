# EPL final captures and corrected draft order

Owner: EPL operations workflow · Version 1 · October 29, 2026

Status: source implementation and local fixtures only. M-35 (`20261029162144`) is **NOT_HOSTED** and requires M-33. M-32's separately verified applied status is preserved. This record does not establish deployment, actual correction, or a completed MW9 → MW10 cycle.

## Timing and source evidence

The original `window_end` is fixture membership, not score finality: the MW9 seed runs October 30–November 4 UTC, settlement advances seven days, and round splitting can use the last kickoff plus 24 hours. Waiting only for that end postpones an ordinary weekend final beyond Monday. The new eligibility helper targets Monday 00:00 Pacific or the last kickoff plus 150 minutes, whichever is later. Under Sean's confirmed D-68 item 24, a midweek round becomes eligible after its last kickoff plus 150 minutes, without waiting for the following Monday. Timing alone never proves completion.

After M-35, automatic final capture requires every stored fixture to be positively final with valid goals or positively postponed, exact Sleeper season/week N+1, complete actual numeric points for/against for every expected owner, and capture completion before a verified next-round cutoff. A paid result reply must match fixture identity; missing, unmapped and empty replies do not imply postponement. Stored valid finals spend no additional credits.

Sleeper's cumulative totals may already include N+1 points while its state still says N+1. Neither a heuristic window nor an event appearing in an odds feed independently proves complete next-round membership or its earliest kickoff. M-35 therefore provides an **explicit service-only commissioner attestation contract**, storing a bounded HTTPS source reference, source hash, source verification time, actual admission time, next-week identity and full-coverage assertion. Admission is not automated, seeded, connected to a new provider or exposed as a player flow. The earliest admitted bound wins; a later record cannot silently extend it. A public endpoint does not establish reuse permission; no FPL data source was adopted.

The same interval guard applies to Tuesday rechecks. For some midweek rounds Tuesday is already after the next round began: the check honestly reports unavailable rather than saving contaminated totals. An authoritative week-specific score source or explicit manual recovery is still needed for such cases. Existing imported snapshots/history are retained and are not retroactively invalidated.

## Apply prerequisite and compatibility

**Before named M-35 apply approval, the operator must review that missing interval evidence intentionally stops automatic final captures and can prevent the next week opening. Have verified complete interval evidence or an explicit manual recovery plan.** No such real interval evidence was admitted by this source work. The service-only attestation RPC is not in the API or scheduled worker's allowlist; the release owner must separately review the evidence and authorized admission operation. Source collection/admission remains an operator prerequisite, not completed automation.

Before M-35 exists, exact missing-function responses retain the previous window-end final path and label interval/order readiness false. They introduce no new snapshot result buys. Other SQL, permission, nested missing-helper and network failures remain errors. After M-35 exists, absent/expired interval evidence fails closed. Daily/before captures continue independently, including the once-daily player-directory enrichment while finals await evidence/results/rollover. A fetch that crosses the cutoff cannot anchor a final or correction.

## Corrected order

M-35 appends outcomes without rewriting M-33's correction audit or original snapshots. It uses corrected season totals, the prior round's latest eligible original/corrected baseline, verified bonus, and the same weekly score/season-total tiebreak semantics as settlement. Missing settlement/baseline/interval remains retryable without adding a terminal outcome every tick.

Only an open next draft before its stored deadline and verified cutoff, with **zero picks**, can receive a recomputed order. The function locks the same next-week row as the pick writer: the first accepted operation determines which order the other observes. Any entered pick or closed deadline preserves every pick and the original order under D-68 item 23. The commissioner review reader retains those unresolved/preserved flags; completed `applied`/`same_order` outcomes disappear from the pending list. No acknowledgement writer or new resolution operation is introduced.

## Result collection envelope

Snapshot and settlement jobs share a durable per-matchweek reservation table and the same week lock: **12 hours between attempts, maximum eight reservations × two credits = 16 credits per matchweek**, with the existing atomic shared-budget check and reserve of 50. Reservations occur before the provider call; failures and unknown outcomes still consume a slot. Same-run replay never authorizes another buy. This hard cap replaces a timing estimate; it does not authorize paid data or increase the free-plan allocation. Urgent expiry may make a check eligible earlier, but cannot bypass cooldown, cap or reserve. Outages, cooldown or the provider's three-day result horizon may leave finalization pending/manual review. Existing final-result cache costs zero.

## Verification and remaining release work

Local tests exercise actual migration SQL with PGlite, both serialized first-pick/recompute orderings, score/bonus/tiebreak agreement, delayed prerequisites and replay, private-table/function grants, actual adapter missing-function mapping, repeated eligible/outage ticks, shared cooldown/cap/reserve, zero-cost cache, daily fallback, next-round contamination and Tuesday rejection. Serialized PGlite actors are **not a concurrent PostgreSQL test**. HTTP boundary fixtures distinguish denial, exact absence, grants and private material; they are not hosted probes.

Before release: exact combined source/CI, M-33 then M-35 named apply approval, reviewed interval/manual-recovery prerequisite, fresh preservation hashes/grants/readback, deployed worker/API identity and actual hosted compatibility/acceptance. Keep full-cycle automation and Tuesday correction acceptance open until observed with real source evidence. No hosted writes, real picks, paid source requests, migration applies or deployments occurred in this lane.
