# EPL next-batch integration — October 29, 2026

State: combined source checked locally. PR/CI, source merge, named migration applies, deployment and hosted acceptance are separate gates. No hosted or provider request was made by this integration lane.

## Source scope

Fresh task base: `5c1b775f05a69306f20f911f4b0455c207c65ffc`. Worktree/branch: `epl-next-batch-integration` / `codex/epl-next-batch-integration`. The source owners' branches are preserved.

| Imported source | Exact owner commit | Scope |
| --- | --- | --- |
| Correction review and M-33 compatibility | `b04eb83a20a3d6b0e1ab20f83239a6d63ede48bb` | Includes `d2f712852a1f17faf5c7325d4059cab0d60b8277`: existing captures work before M-33; Tuesday rechecks, strict missing-position behavior and a commissioner-only read-only review tool |
| Roster display directory | `44350af004592b99559c3099dc2104810e2dd801` | Daily-only minimal display metadata, bounded optional fetch, source hashes, separate key/name coverage and snapshot-only scoring positions |
| Standings readiness | `7e25f7a9c5ed925ab94dcc5b0d03820e50c3c61a` | Bounded optional community-source adapter, licensed dated record and strict readiness validation; no collector, persistence or resolver wiring |
| Coordinator continuation | `15e23bc5fb5723f99b3fa2c2973c822cc62e5b3b`, followed by `05d73c9c8dfbe5f64d7f377e39acdef6bd8b5367` | Continuation record and D-68 item 24: midweek finalization once results, exact next week/season and scoring totals are verified |
| Authoritative release/apply evidence | `25f01f5f03eb19d244bb6d7be473c2bc5e9f9c1c` (final #374), plus coordinator status `a0cf547865b5ace3b50371854f33f0108f43fdd0` | Preserves first-release evidence, canonical M-32 APPLIED/hosted `20261029162422`, six-function/two-table boundaries and the owner's 393-probe live baseline. Includes the durable feed-kind ledger test repair |

The three source batches merged without conflicts. Current-main logo release evidence from `e9bf525` was also integrated. The first release is not evidence that these follow-on sources or migrations are hosted; its separate record remains authoritative.

The later authoritative M-32 ledger merge conflicted only in `NOT_HOSTED`: the resolution retains the owner's M-32 APPLIED transition and the integration's still-pending M-33 entry. Release-owner documents remain intact, with continuation links added only after their authoritative version was integrated.

## Integration checks and repair

The initial combined EPL run exposed one test-fixture mismatch: the directory job test double expected only the old state/save RPCs and rejected M-33's new readiness probe, reporting `job_failed`. No production-path defect was found. The test now covers both recognized M-33 absence (`GTL_EPL_RECHECK_OFF`) and an installed, not-due recheck. In each schema state an optional directory outage still saves the valid base capture, records readiness accurately and makes no second directory request after that daily label is saved.

Two explicit cross-batch regressions were added:

- A fixed dated standings record can supply positions to the strict resolver in a local composition test. Expired data supplies no positions and leaves the fallback unavailable. The on-clock manager's existing no-queue/no-pick rule remains unchanged. No production consumer was connected.
- Corrected weekly totals, future daily display names and immutable original snapshots coexist. A later F position cannot score an earlier display-only lineup; a captured M position scores 9 rather than the later F's 100. Current display-only projection metadata stays unscored. Corrected team totals are used without changing the original capture or entered picks/order.

Real handler/adapter SQL compatibility now covers M-30/M-31, the newly applied M-32 schema before M-33, and the future M-33 schema. No source-owner branch was changed by this repair.

## Pending boundary coverage

M-33's private stat-recheck table, three service-only RPCs and commissioner read route are registered with explicit `20261029151727` absence markers. They add six candidate probes; the release owner's **393 hosted-probe baseline is preserved**, while these new probes remain pending deployment/apply. No live result is claimed for them.

Generic pending-table handling comes from `7f8900eda5fd02944726f953650322d93ae1f068`; generic area/ledger assertions are isolated in `31d58dea8be6206705277eb6ef697995d9867b36` for reuse by later standings work. Only exact 404/PGRST205 table, 404/PGRST202 RPC or exact route-not-found replies can be reported awaiting in ordinary mode; strict mode still rejects them. Granted access, business-rule errors and malformed missing replies fail. Commissioner requests are tested both without a session and with an invalid session, with no raw roster or review evidence allowed in denial/missing replies. Apply-record owners must remove absence exceptions once real strict denials are established.

## CI follow-up

The first CI run found the new generic `changes` privacy marker also rejected Open-Meteo's public attribution string. The marker now rejects structured correction changes (arrays/objects) while allowing the provider's license/change notice. Existing private correction keys remain protected. A regression covers both shapes, and all 107 targeted weather/boundary cases passed with zero skips. Fresh CI is required for this repair.

## Verification

| Check | Result |
| --- | --- |
| EPL, migration/rollback, feed-kind SQL, route, optional-RPC, cloud boundary and token Node tests | 425 passed, zero failed/skipped |
| EPL/Fantasy/Pick a Team, commissioner and correction-review JSX | 60 passed |
| Browser | 10 passed: correction-review tool, EPL navigation, all three access/Fantasy scenarios and all five retained NBA scenarios |
| Accessibility/layout | Browser Axe assertions passed; phone-width overflow checks passed. Correction screenshots at 390px dark and 320px light were visually inspected |
| Static/build | Typecheck, Brand/document QA, cloud build with synthetic public test configuration, frontend bundle privacy scan and whitespace checks passed |

Commands:

```sh
node --test tests/epl-*.test.mjs tests/migrations.test.mjs tests/migration-functions.test.mjs tests/rollback.test.mjs tests/route-modules.test.mjs tests/optional-rpc.test.mjs tests/cloud-boundary.test.mjs tests/cloud-boundary-pending-tables.test.mjs tests/boundary-areas.test.mjs tests/next-tokens.test.mjs tests/feed-kinds-sql.test.mjs
node node_modules/vitest/vitest.mjs run tests/epl-app.test.jsx tests/epl-pick.test.jsx tests/epl-fantasy.test.jsx tests/epl-correction-reviews.test.jsx tests/next-commissioner-ui.test.jsx
npm run test:cloud-browser -- tests/cloud-browser/epl.spec.js tests/cloud-browser/epl-navigation.spec.js tests/cloud-browser/epl-correction-reviews.spec.js tests/cloud-browser/nba.spec.js
npm run typecheck
python3 scripts/check-brand-docs.py
npm run build:cloud
node scripts/check-cloud-boundary.mjs --bundle-only
```

Browser execution used an ignored local configuration equivalent to `playwright.cloud.config.js`, with port 5208 and a separate build/results directory. Auth/database cases use disposable local PGlite and synthetic accounts. The new correction UI browser reply is fabricated normalized data; separate Node/SQL tests verify its server permission boundary. Standings integration uses the committed record with a fixed fixture clock, not an assertion of current live standings.

## Remaining gates

Root owns source review, CI orchestration, main merges, the current queue/register and release evidence. M-32 is applied per the integrated owner record; M-33 still requires a named apply. Coordinator commit `ce479d1f5c01ea9eddda05fa599102040eaee8f2` records root's independently verified live MW9 DNB success at 16:44:48 UTC and activates the approved API/collector/child-screen tasks; those implementations are separate from this combined source packet. Standings persistence/wiring, Monday-final and no-picks order correction are separate subsequent work; midweek policy is confirmed in D-68 item 24, not an unanswered question.

A new hosted daily capture and nonempty-name readback are needed to close roster metadata acceptance. A real future-matchweek/correction cycle, push delivery and physical iPhone acceptance remain open. No fixture result is promoted into those live claims.
