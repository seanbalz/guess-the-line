# EPL operations workflow — October 29, 2026

Owner: Sean Balsiger · Evidence scope: source review, local fixtures and the root workflow's authenticated hosted readback.

The EPL worker is deployed and its five schedules are enabled. That establishes operational setup. The first
MW9 → MW10 automatic draft/bonus/order cycle has not happened yet. Two approved D-68 behaviors also need source work:
Tuesday stat-correction processing and the league-position fallback for automatic club selection.

## Verified state

The root workflow ran the generated read-only preflight against the intended Supabase project at
**2026-10-29 15:12:19.435092 UTC** and reported:

| Check | Evidence at readback |
| --- | --- |
| Function bodies | All 26 latest `gtl_epl_*` bodies match repository `prosrc` MD5s. M-31's replacement of `gtl_epl_link_manager` is the expected current body. This closes M-30's omitted body readback at this later point in time. |
| Privacy and grants | All 14 EPL tables have RLS enabled and deny browser SELECT. No function security or grant exceptions. The dispatcher intentionally denies service-role execution. |
| Jobs and cron | Five schedule rows enabled and five cron jobs active. This is configuration evidence, not a full matchweek acceptance run. |
| Matchweek | MW9 is seeded/open; window October 30–November 4, first kickoff October 31 at 12:30 UTC. |
| Captures | `after-mw08`, October 28 at 17:32:37 UTC; `daily-2026-10-29`, October 29 at 13:13:04 UTC. Snapshot payloads were not printed. |
| Last seven days' runs | Fixtures succeeded once; snapshot succeeded once. Nudge skipped 20 times (`no_subscription`) and three (`nothing_due`); resolve skipped 24 (`not_due`); snapshot skipped eight (`nothing_due`). No failed run. No settlement run. |
| Shared Odds API budget | 407 credits remaining, unpaused. This is shared with NFL, with the existing 50-credit reserve. |

The same root workflow read hosted Edge Function metadata at 15:08:57 UTC: `gtl-epl-jobs` active v1, SHA-256
`f98a1926615540ac5fb72243ee74924df75ff0e40c857cc9a949f30a944d13e5`; `gtl-api` active v42, SHA-256
`81c4c8087d4a5afdf8815ff06a4b0aedcfb7ab1aba6ac6cfe85ff037c6a8ce1a`. These are delegated authenticated
readbacks, distinct from this lane's local test results and the earlier [M-30](RELEASE_2026_10_29_M30.md) and
[M-31](RELEASE_2026_10_29_M31.md) release records. No deployment was performed by this lane.

## Source fix and repeatable readback

The worker previously accepted an `after-mwN` snapshot when Sleeper returned a successful response without a valid
integer `state.week`. That skipped the N+1 rollover check and could permanently label unknown season totals as a
completed matchweek: snapshot labels are immutable. For MW1–37, the worker now fails with `scores_incomplete` before
any snapshot write when the week is missing, malformed or outside 1–38. A still-current week continues to wait; the
expected next week saves; a later valid response can retry the same label. The existing MW38 end-of-season handling
is unchanged and still needs explicit seasonal acceptance.

Generate the administrator's read-only query from the current checkout:

```sh
node scripts/epl-operations-preflight.mjs
```

The utility prints one SELECT and makes no network connection. Its expected hashes come from the newest definition
of each EPL function across the local migration catalog, so a superseded M-30 body is not mistaken for drift after
M-31. Run it on the intended project through the authenticated database connector. Review missing/duplicate function
signatures, `source_matches`, invoker/search-path configuration and grants; compare returned schedules and captures
with expected lifecycle events. A missing expected function is reported as a mismatch. An unapplied local migration
will also report mismatches until its separate release gate is completed.

Output includes hashes, configuration and aggregate run reasons. It omits snapshot payloads, picks, private queues,
account IDs, push endpoints, capabilities and cron commands. Do not publish raw snapshots or private local exports.

## Open work and exit criteria

| Priority | Work | Current evidence / gap | Completion evidence required |
| --- | --- | --- | --- |
| P0 | Publish and deploy malformed-rollover guard | Local source fix; hosted v1 predates it. | Green exact-source CI, protected `epl-jobs` release and fresh function metadata/readback. |
| P1 | Tuesday correction processing | `after-mwN` is immutable; settlement inserts N+1; jobs state reads only the latest week. No Tuesday comparison or safe order-correction path exists. Daily captures alone do not satisfy D-68. | Append-only corrected snapshots, explicit prior-week recheck selection, corrected fantasy totals/order with preserved picks and audit, retry tests, migration/worker release and a real correction readback. If the next draft has started, preserve entered picks and resolve how an order change applies. |
| P1 | League-position auto-pick fallback | Pure rules accept `position`; the worker never supplies it and explicitly falls back to club code. | Verified permitted free standings source, dated persisted positions, missing/stale states, worker integration and tests for tied/missing prices. No invented standings. |
| P1 | MW9 → MW10 full cycle | MW9 remains open; only fixtures and one daily snapshot have succeeded. | Due before-kickoff capture, deadline queue/auto/no-pick resolution, first-match-only final results, bonus, after-MW9 capture, stored MW10 order and window, and retry/idempotency readback. Capture timestamps and source hashes; preserve exact entered picks. |
| P1 | Physical-phone acceptance | Not exercised by this operational lane. | The linked-manager and open-access flows, queue/pick errors, push opt-in and Fantasy/chart controls on the actual phone. Coordinate with the access/UI lane. |
| P2 | Failure recovery and seasonal edge cases | Fixture tests cover source outages, empty/unmapped results, quota guard, expiring results and needs-review recovery. MW38 is not a live accepted cycle. | Operational evidence for a real failure/retry when it occurs, read-only verification of preserved rows and documented end-of-season handling. |

Local checks in this change: **78 tests passed, zero skipped**, covering worker jobs, source parsing, draft rules,
Sleeper deltas, the real SQL run queue on PGlite and the preflight query. The query test uses the real migration catalog,
detects a deliberately altered local function body and verifies that snapshot payloads and cron commands stay out of
the result. Regression cases reject missing/null/string/fractional/out-of-range Sleeper weeks and allow a valid retry.
These are local fixture results; they do not establish future MW10 completion, notification delivery or deployment.

No hosted writes, migration applies, schedule changes, real draft picks or account claims were performed in this lane.
Global completion/queue reconciliation is owned by the root workflow; the frozen v62 tracker remains untouched.
