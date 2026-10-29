# EPL moneyline combined acceptance — October 29, 2026

Owner: Sean Balsiger · Version 1

Sean requested finishing the EPL moneyline API, collection and screens, then deploying once checks pass.
This integration combines the API, durable collector and shared-shell screen wiring with independent acceptance.
The live MW9 source gate and M-32 apply are already recorded; **M-36 and this playable batch are not deployed by this record**.

## Reviewed composition

| Area | Source input |
| --- | --- |
| API, structured errors, server week and post-save readback | `91d1ae9cc7ea0fe767be6ec0e93ac8d2b1b2fd3d` |
| Collector, private lease/evidence, safe writer and readiness | `88897f0d586edba2e6fdbf657ae1d97dd4d0435c` |
| Moneyline child and shell wiring | `cfb15a1d9521cc1613b926fc34b886f16f755fbb` |
| Full-page landmark correction | `abe751a717be04c7b877cf61b7abb25b4c151784` |
| UI action-list reconciliation | `0821d5aaff6c63409efa995d286111621308765e` |

The API action-list conflict was resolved by preserving both commissioner correction reads and moneyline actions;
all explicit reads retain read retries and writes never replay automatically. No other behavior was invented in
merge resolution. The actual shared-interface PR #379 review/merge remains coordinated with its frontend owner.

## Local verification

- 534 Node/SQL/migration/rollback/route/data/boundary tests passed, zero skipped.
- 80 component tests and typecheck passed. Brand/document QA and diff checks passed.
- Nine combined flows passed through actual local M-32/M-36 SQL, service-role RPCs, the production handler,
  collector and provider parser. HTTP prices, accounts, fixtures and quota headers are synthetic; no hosted
  account, provider credit or player record is touched by these tests.
- Four full-page Axe analyses passed, including 390px dark and 320px light layouts. No rules were suppressed.
  The original sport-switch landmark failure was reproduced and fixed in the shared-shell source.
  Tests explicitly set the saved `gtl.theme` preference and assert the applied `html[data-theme]`; OS emulation
  alone does not override this app's default Dark preference. Final Light/Dark captures were visually inspected.

The flows verify safe numeric input before writes; pending-to-first-after scoring; immutable references across
later captures; two concurrent accepted locks sharing one request/lease/credit; kickoff-late exclusion from
averages; one final lock despite a lost response; persisted and unsaved draft preservation after kickoff;
cross-account clearing/nonmember denial; authoritative EPL week and per-game D-31 reveal. Browser readback must
confirm an uncertain save before another write. The source clock is sampled after obtaining the fixture lock.

Phone captures remain local in `.local/epl-moneyline-flow-390-dark.png` and
`.local/epl-moneyline-flow-320-light.png`. These are emulated local acceptance, not real-device or production proof.

## Migration and release boundary

M-36 file `20261029165947_gtl_epl_moneyline_collector.sql` SHA-256 is
`a97b29dd7355f08f033ccdd9ef81f8e28e928499d4bec3a1375ea8b439280c64`.
It adds two private tables and six service-only functions, including the post-lock safe save wrapper and
effect-free readiness reader. Applied M-32 remains byte-identical. Dependencies are hosted M-30/M-32;
pending correction/standings migrations must not be mistaken for prerequisites or applied implicitly.

SELECT-only metadata and preservation queries were validated in local read-only transactions: six matching
function bodies, two private tables, fourteen existing EPL table fingerprints and three scoring sets. Fresh
hosted preflight, Sean's named M-36 approval, exact-source CI, migration apply/readback, protected deployment,
separately authorized moneyline schedule setup/enablement and signed-in hosted verification remain required.
No source merge is evidence that those effects occurred.

The moneyline job must be enabled before launch for both timed collection and API post-save refresh. Its
off switch stops new collection while preserving attempts, private capture provenance and player history.
The current week window can legitimately make an early scheduled test return nothing due; never move a saved
window or create a real manager guess to manufacture acceptance.
