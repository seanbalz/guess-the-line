# FEPL bonus accounting

Owner: Sean Balsiger · Version 1 · November 2, 2026

Status: implemented and checked locally; production publication pending.

## Confirmed rule and behavior

Sean adds Pick a Team bonuses in Sleeper. Its weekly and season totals are
authoritative. Previously GTL added the earned bonus again in both settlement
order and standings. It now ranks the final Sleeper weekly scores, breaking
ties by the lower Sleeper season total, and shows Sleeper's season total as-is.
The margin/winner record remains visible without a second addition.

New settlement rows retain the earned margin and club with `points: 0` (zero
additional GTL points). The API displays `margin × 5` as the earned award;
legacy records lacking a margin keep their recorded value for display only.
Existing nonzero legacy rows never change standings or ordering under the new
source. No historical row, pick or snapshot is rewritten by this source fix.

## Timing limitation

Add bonuses in Sleeper before the final weekly capture/rollover. A late manual
adjustment requires review of the next draft; preserve every entered pick.
Sleeper does not provide a verified signal that the commissioner's adjustment
is complete. This change does not add detection, faster capture, Tuesday
rechecks, or automatic post-pick reordering. The existing M-33/M-35 timing and
apply prerequisites remain binding.

## Components and compatible release

Release targets: `api`, `frontend`, `epl-jobs`. No new migration is required
for the live accounting fix: the existing bonus table already stores margins.
Publish API/frontend together before claiming the visible fix; the worker must
also be released before claiming future settlement is fixed. New worker rows
carry no additional points, so an older API cannot add a second bonus from
those rows. Updated API reads legacy rows safely. The release captain pins the
reviewed merged source and uses the existing protected release workflow.

M-35 (`20261029162144`) is still **NOT_HOSTED**; its existing source now orders
corrected Sleeper totals without a second bonus. A fresh hosted read-only check
confirmed its history entry and correction function absent. Do not apply it as
part of this API/frontend/worker release; M-33, named apply approval and verified
capture-interval evidence remain separate prerequisites.

After release, read the signed-in Fantasy standings and draft board: totals
equal Sleeper totals, bonus records remain visible, and copy has no additive
formula. Verify the EPL worker's version/source and a future real settlement
before claiming scheduled acceptance. The prior MW10 data repair needs no
replay. Do not create test picks or force another settlement in production.

Rollback: retain this accounting rule. Releasing an older additive API/worker
requires pausing settlement first; otherwise later awards can be counted twice.
Coordinate rollback with the release captain, preserve rows/audits, and use
readback rather than deleting bonus history.

## Verification

405 EPL Node/SQL tests passed with no skips, including actual M-35 SQL in
PGlite, settlement ordering, raw season tie-breaks and zero-adjustment bonus
display. All 89 EPL component tests, typecheck, cloud build, bundle privacy
scan, Brand QA and whitespace checks passed. The build retains its existing
large-chunk advisory. PGlite serialization is not a live concurrent PostgreSQL
test. All four local browser scenarios passed (EPL navigation and the real
handler's linking, Fantasy, recovery and account-switch flows), covering
320/390/1440px in both themes. Real-phone and published-source acceptance remain
separate.
