# EPL Tuesday stat rechecks — October 29, 2026

Owner: Sean Balsiger · State: local implementation; M-33 is not applied and this worker is not deployed.

The original worker could not check Sleeper stat corrections after opening the next matchweek. Its jobs state read only
the latest week, while `after-mwN` labels were immutable. This follow-on keeps those original records and adds a separate
`after-mwN-recheck` snapshot plus an append-only service-only `gtl_epl_stat_rechecks` audit row.

## Implemented behavior

- The snapshot job selects a due prior resolved/settled matchweek even after a later draft opens. Tuesday noon Pacific
  is the recheck target, at least one hour after the first final capture. Both JavaScript and SQL enforce the due time;
  the SQL reader filters due candidates before its limit. Late final captures catch up after that hour. A moved-out
  postponed fixture cannot move the check into a later week. Daylight-saving changes use America/Los_Angeles.
- The recheck requires Sleeper's exact next week and season, every expected owner exactly once, numeric actual season
  points-for and points-against totals, and valid optional decimal fields. Missing/malformed evidence writes nothing.
  If Sleeper has already moved beyond that interval, the run fails `scores_incomplete` rather than guessing a correction.
- The writer locks the original week and commits the separate snapshot/audit together. Retries return the stored result.
  Reordered roster rows and name/lineup changes do not count as stat corrections; normalized scoring totals do.
- Changed totals are recorded with `status=needs_review`; unchanged totals with `status=unchanged`. No original snapshot,
  player pick, queue, pick history, week status or stored draft order is modified by this path.
- Fantasy weekly readers prefer the later recheck and keep the original capture. Settlement also uses a rechecked prior
  baseline, so the same correction is not counted again as points in the next matchweek.

This is operational correction evidence. The review flag has **no commissioner-facing route/card yet**, and no order
correction is applied. Sean confirmed **preserve picks and flag for review** on October 29: keep entered picks and the
original draft order, show corrected totals separately. Do not mark the full correction workflow accepted until
commissioner actionability, release and hosted verification are complete.
MW38 seasonal behavior remains a separate acceptance item; this recheck path covers MW1–37.
The first final capture still follows the existing window-end/rollover rule. This change does not establish a live
Monday-final capture or change when the next draft first opens.

## League-position fallback

The worker now asks the pure deadline resolver to require actual league-position evidence when prices are absent or tied
at the deciding rank. Without it the run records `needs_review` before writing any automatic picks. Queue choices,
the on-clock manager's no-pick rule and a uniquely shortest available price retain their existing behavior. This is a
conservative intermediate state; it does not establish a connected standings source.

OpenFootball publishes [its dataset under CC0](https://github.com/openfootball/football.json/blob/master/LICENSE.md).
A direct October 29 fetch of its [2026/27 EPL file](https://github.com/openfootball/football.json/blob/master/2026-27/en.1.json)
returned 380 fixtures, only 45 completed, the latest completed September 20, and 35 pre-October-28 fixtures without a
full-time score. That dataset was too stale to use as current positions. Its
[README](https://github.com/openfootball/football.json/blob/master/README.md) also explains that the upstream text source
is not automatically updated. No standings were imported. OpenLigaDB's
[primary site](https://www.openligadb.de/) offers free access but identifies ODbL data terms; this lane did not adopt it.
A permitted, fresh, complete table with dated provenance and missing/stale handling remains open before claiming D-68's
position tiebreak is operational.

## Release and acceptance

1. Review M-33 (`20261029151727_gtl_epl_stat_rechecks.sql`) through Gate M and record source hashes, preservation and
   grants. It adds one table and three functions; no applied function body is replaced. It needs the hosted M-30/M-31
   foundation and is independent of M-32's moneyline functions. Keep M-33 in `NOT_HOSTED` until actual apply evidence.
2. Deploy compatible source through the protected manual release workflow before applying M-33, as Gate M requires.
   The worker recognizes only a known absent recheck entry point as optional and continues existing captures, recording
   `recheckReady=false` in its run detail. Permission, transport and general database errors remain failures. Once M-33
   is installed, the same worker uses its RPCs and records `recheckReady=true`; the API/Fantasy reader understands the new snapshot label. Disabling the existing
   snapshot schedule stops capture; preserve evidence instead of deleting it as rollback.
3. Verify due-time selection, saved source hashes, one recheck/audit row, changed/unchanged review status and unchanged
   entered picks/order through authenticated readback. Do not manufacture a real correction or future MW10 completion.
4. Complete the commissioner workflow under the confirmed preserve-picks rule, fresh standings integration and physical-phone
   acceptance. Local fixture tests do not establish those outcomes.

## Local verification

234 EPL, migration-catalog and rollback tests passed with zero skips. They exercise real migrations on local PGlite,
changed/unchanged rechecks, complete-owner and numeric-total checks, SQL due-time enforcement, next-round preservation,
replay idempotency, browser-role denial, a newer not-yet-due round, corrected weekly baselines, Fantasy selection and
the conservative deadline fallback. Typecheck, Brand QA and whitespace checks passed. These checks use fabricated
fixtures and do not perform a hosted correction, deployment or real player action.
After integrating current main (including the rollover guard) and pending M-32's worker/preflight changes, the combined
suite passed **277 tests with zero skips**. Typecheck, cloud build, bundle privacy scan and Brand QA also passed.
The compatibility follow-up passed **280 tests with zero skips**, including the actual handler and adapter against an
explicit M-30/M-31-only PGlite schema and against M-33. The former saves its daily capture and records correction
readiness false; the latter saves a due recheck and flags changed totals. Error-mapping cases keep permissions,
transport failures, generic missing tables and missing nested helper functions as failures.
