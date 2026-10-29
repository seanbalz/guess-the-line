# EPL moneyline combined acceptance — October 29, 2026

Owner: Sean Balsiger · Version 3

Sean requested finishing the EPL moneyline API, collection and screens, then deploying once checks pass.
This integration combines the API, durable collector and shared-shell screen wiring with independent acceptance.
The live MW9 source gate, M-32 apply and [verified M-36 apply](RELEASE_2026_10_29_M36.md) are recorded.
The API/worker/frontend batch is [deployed and live-verified](RELEASE_2026_10_29_EPL_MONEYLINE.md), including enabled collection
and subsequently observed natural lock-triggered capture/reference-distance acceptance. Local source checks below retain their own scope.

## Reviewed composition

| Area | Source input |
| --- | --- |
| API, structured errors, server week and post-save readback | `91d1ae9cc7ea0fe767be6ec0e93ac8d2b1b2fd3d` |
| Collector, private lease/evidence, safe writer and readiness | `88897f0d586edba2e6fdbf657ae1d97dd4d0435c` |
| Moneyline child and shell wiring | `cfb15a1d9521cc1613b926fc34b886f16f755fbb` |
| Full-page landmark correction | `abe751a717be04c7b877cf61b7abb25b4c151784` |
| UI action-list reconciliation | `0821d5aaff6c63409efa995d286111621308765e` |
| Home progress, canonical rules and saved-value bubbles | `9f8378b90f3a53f8e29fc1025ceee4bff126b912` |

The API action-list conflict was resolved by preserving both commissioner correction reads and moneyline actions;
all explicit reads retain read retries and writes never replay automatically. No other behavior was invented in
merge resolution. Shared-interface PR #379 merged as `a41f68362acb5165b17ef6f20673d23d1a2c9ec8`;
its detailed frontend/device evidence remains separate from moneyline gameplay acceptance.

## Local verification

- 534 Node/SQL/migration/rollback/route/data/boundary tests passed, zero skipped.
- 89 component tests and typecheck passed. Brand/document QA and diff checks passed.
- Ten combined flows passed through actual local M-32/M-36 SQL, service-role RPCs, the production handler,
  collector and provider parser. HTTP prices, accounts, fixtures and quota headers are synthetic; no hosted
  account, provider credit or player record is touched by these tests.
- Six full-page Axe analyses passed, including moneyline entry and Home at 390px dark and 320px light. No rules were suppressed.
  The original sport-switch landmark failure was reproduced and fixed in the shared-shell source.
  Tests explicitly set the saved `gtl.theme` preference and assert the applied `html[data-theme]`; OS emulation
  alone does not override this app's default Dark preference. Final Light/Dark captures were visually inspected.

The flows verify safe numeric input before writes; pending-to-first-after scoring; immutable references across
later captures; two concurrent accepted locks sharing one request/lease/credit; kickoff-late exclusion from
averages; one final lock despite a lost response; persisted and unsaved draft preservation after kickoff;
cross-account clearing/nonmember denial; authoritative EPL week and per-game D-31 reveal. Browser readback must
confirm an uncertain save before another write. The source clock is sampled after obtaining the fixture lock.
The Home shortcut counts only unique own locked matches in the current EPL week; own drafts and other managers'
locks are excluded. The actual API-backed shortcut opens the guess board. Its 320px layout has no sideways overflow
and its button meets the 44px target. A missing Home shortcut was reproduced before the fix. Saved/reference values
use the existing glass tokens; the final ten-flow/six-Axe run passed after this styling change.

Phone captures remain local in `.local/epl-moneyline-flow-390-dark.png` and
`.local/epl-moneyline-flow-320-light.png`. These are emulated local acceptance, not real-device or production proof.
Home captures `.local/epl-moneyline-home-390-dark.png` and `.local/epl-moneyline-home-320-light.png` were also visually reviewed.

## Migration and release boundary

M-36 file `20261029165947_gtl_epl_moneyline_collector.sql` SHA-256 is
`a97b29dd7355f08f033ccdd9ef81f8e28e928499d4bec3a1375ea8b439280c64`.
It adds two private tables and six service-only functions, including the post-lock safe save wrapper and
effect-free readiness reader. Applied M-32 remains byte-identical. Dependencies are hosted M-30/M-32;
pending correction/standings migrations must not be mistaken for prerequisites or applied implicitly.

After all twelve checks passed on `ea1d616af47bcfe983949e951b47e4e63107694d`, PR #384 merged as
`d04e5c951d3e53fe2b5502b226c3da964955119f`. Sean's named M-36 approval was followed by fresh hosted preflight,
apply and readback: six exact private invoker functions, two empty private RLS tables, 32 preserved EPL functions,
fourteen unchanged EPL table fingerprints and three unchanged scoring sets. All eight new live privacy probes
were denied. [Actual hosted version, hashes and limits](RELEASE_2026_10_29_M36.md).
Sean separately approved enabling/testing moneyline collection after compatible API/worker deployment.
All protected releases, approved schedule setup/enablement/test and signed-in hosted reads have now passed;
the production release record supplies actual versions, runs, served hashes and aggregate-only natural capture checks.
Timed priced checkpoints, live multiuser/concurrency, kickoff/full-cycle and physical-moneyline acceptance remain open.

The moneyline job must be enabled before launch for both timed collection and API post-save refresh. Its
off switch stops new collection while preserving attempts, private capture provenance and player history.
The current week window can legitimately make an early scheduled test return nothing due; never move a saved
window or create a real manager guess to manufacture acceptance.


## Combined CI integration follow-up

Browser shard 4 exposed an old shared-interface fixture assertion that allowed only lobby/draft reads on EPL Home. The approved Home shortcut now also reads moneyline progress. Its fixture supplies the explicit unavailable-board shape and permits only that additional read, asserting POST plus the authoritative EPL season/week; unrelated NFL reads and writes remain rejected. All four shared-interface browser cases passed locally, and the originally failing profile/sport-switch case passed again with semantic request-body assertions. No product or migration code changed in this repair. All twelve final exact-head checks then passed before merge.
