# Virtual Units Custom entry — M-41 preparation, November 7, 2026

**Prepared locally; not applied, merged or deployed. Enablement is held for the
ROI decision below and Sean's separate named migration approval.** This document
does not authorize an apply, provider collection or schedule change.

## Scope and authority

The task worktree starts at freshly fetched `origin/main` `7aa93a6f`, then
fast-forwards to the coordinating reviewed branch's
`3a9a9cff2c9ff044faad180c0933226e29665de3`. The selected visual authority is the
read-only owner acceptance checkout at
`3ac2eb50513ba73447ef890e4a47863cde7bdd76`:

- `design/style-directions-2026-11-04/NATIVE_COVERAGE_REVIEW.md`, lines 382–391:
  Virtual Custom accepts hundredths from **0.01U through 100U**; manual tracking
  retains its own precision and 10000U screen maximum.
- `preview-unit-amounts.mjs`, `isolated-nfl-actions.jsx` and
  `populated-nfl-actions.jsx`: the Custom numeric field sits in the existing
  slip stepper, with invalid text blocking placement and busy/uncertain fields
  disabled. No new layout or control is inferred.
- Sean's subsequent quick-entry amendment keeps **0.5U as the quick/ordinary
  stepper minimum**. Ordinary taps change by 0.1U; only an explicitly edited
  Custom field can use the 0.01U floor. Selecting a quick chip returns to the
  ordinary floor. An existing saved stake below 0.5U initializes Custom mode.

The initial task inference that Virtual should inherit Tracked's four-decimal
input precision was corrected from this explicit selected-reference evidence.
That correction is an interpretation of the existing approval, not a new user
policy decision. Tracked behavior is unchanged.

## Compatibility implementation

`20261108022135_gtl_virtual_units_hundredths.sql` was created with the installed
Supabase CLI's `migration new`, after checking its help. M-41 was unused in the
fresh ledger. The timestamp is **provisional until Gate M merge**: restamp both
SQL files and references if necessary so this file follows the newest main
migration. Merge only when this work is next in the apply queue.

Only the amount predicate changes in these existing bodies:

| Entry | API | Database writer | Preserved checks |
|---|---|---|---|
| Account slip | `cloud/bets.mjs` `/bets/place` | `gtl_place_bets` | Membership, slate, per-game market gate, kickoff, saved quote, exact expected terms, atomic slip, request receipt/replay |
| Recommended Virtual | `cloud/bets.mjs` `/bets/recommendations/place` | `gtl_save_recommended_virtual_pick` | Account week, market gate, revision, kickoff, exact offered quote, add-only behavior |
| Existing group Virtual | `cloud/virtual-units.mjs` `/virtual-pick` | `gtl_save_virtual_units_pick` | Existing context/revision, kickoff, terms, audits, existing trigger enforcement and API quote/gate checks |

No RPC argument list or overload changes. Function header MD5s name the exact
previous bodies. No table, selection, result, audit, receipt, score or timestamp
is rewritten on apply. Existing positive half-unit stakes remain valid,
including values above 100U: the old server had no maximum, even though the
placing screen already capped entry at 100U. Newly supported non-half amounts
are limited to hundredths in 0.01–100U. No existing server maximum is widened.

The new service-only, invoker `gtl_virtual_unit_rules()` reports
`{version:1,hundredths:true}`. `gtl_virtual_units_supported(numeric)` centralizes
the new amount predicate for the three writers. Browser roles cannot execute
either function. Both have inert boundary probes and `awaitingDeploy` entries;
the migration remains in `NOT_HOSTED`.

The compatible API adds `unitRules` to `/bets/read`, `/virtual-units`, and
Recommended's `virtual` object. Missing capability RPC, rollback, malformed
data, unknown version and transient failure all expose `hundredths:false`.
The write routes recheck capability for non-half stakes and refuse unsupported
requests before saving. SQL rechecks its own amount predicate atomically.
Existing half-unit requests work without the new RPC. Saved cent terms remain
readable; exact expected terms are accepted for CAS even when rolling back to
a half-unit *replacement* stake.

Native `PlaceBets` shows the selected Custom field only with positive capability.
Without it, the old half-unit stepper remains. Blank, invalid or unsupported
draft text is kept in the slip and blocks placement; it is never silently rounded
or dropped. Saved terms and explicit edits retain the existing quote/CAS path.
Busy and uncertain states freeze the field and controls; retries preserve the
same request id and payload. Custom styles map the selected preview aliases to
native GTL tokens. Legacy group/Recommended controls remain their existing
half-unit controls; no unreviewed control layout was added there.

| Deployment combination | Behavior |
|---|---|
| New Pages, old API | No `unitRules`: half-unit controls only |
| New API, old SQL | Missing capability: reads work, half stakes save, custom writes refuse |
| New API/Pages, M-41 | Custom cents available on the native slip; all three server writers support cents |
| SQL rolled back, compatible API/Pages | Explicit false capability; saved cents still readable, new custom writes refuse |
| API rolled back after cents exist | Older readers keep saved terms; old validators can refuse edits to cent rows. Prefer rolling back SQL with the compatible API retained; never rewrite saved rows to fit an old client |

## Arithmetic inventory and unresolved enablement decision

The entry extension **does not change any accounting formula or historical
rank**. The following existing discrepancy remains a prerequisite to enabling
Custom, because it is more noticeable at small stakes.

| Path | Existing arithmetic / precision | M-41 action |
|---|---|---|
| Storage | JSONB numeric units; no column scale restriction | Preserve |
| D-26 settlement | Win = stake × unrounded American multiplier, rounded once to 4 places; loss = negative exact stake; push/void = zero net and stake returned | Preserve function byte for byte |
| Group Virtual SQL reader | Exact numeric totals; ROI rounded to 2 percentage places at the end | Preserve |
| Recommended summary | Raw saved stake/net sums; ROI rounded to 2 percentage places | Preserve |
| M-10 read | Saved terms and numeric qualification totals | Preserve |
| M-12 SQL board readers | Numeric sums; API ranks them | Preserve |
| `shared/bets-qual.mjs` / native week and boards | `normalizeWeek` rounds units, risk and net to 2 places **before** ROI/ranking; season processing normalizes weekly sums | Preserve; unresolved quantization finding |
| Awards `shared/game-features/awards.mjs` | Uses saved win net, four-place net totals and unrounded risk before ROI; separate comparison path | Preserve; no award policy changes |
| Native amount formatting | Stake/general format normalizes to cents; result amounts show cents | Preserve; cents entry fits |
| Legacy Virtual formatting | Result net displayed to cents; saved stake retained | Preserve |
| Social tracker | Tracked stake supports 4 places; social model's `origin:virtual` requires halves, but live `/social/create` rejects that origin without a verified receipt | Preserve; this is not a second Virtual entry path |

Authoritative rules: `docs/RULES.md` “Virtual units game” requires at least
three placed picks **or at least 3U**; it defines ROI as settled net divided by
settled risk. Its “Virtual units settlement” row and `docs/DECISIONS.md` D-26
explicitly round win profit once to four places. D-18 and redesign stage 42
specify ROI, then net units, then wins with shared ties. No explicit decision
was found authorizing cent-rounding of intermediate net/risk before ROI.
Existing tests do require ROI presentation to two places. Implementation
behavior is not evidence that a different accounting policy was approved.

Reproduced in local PGlite and the actual current model:

| Example | Saved D-26 result | Current native board | Exact saved-net ROI |
|---|---:|---:|---:|
| 0.5U win at −110 | +0.4545U | +0.45U, 90% | 90.9% |
| 0.5U win at −111 | +0.4505U | +0.45U, 90% | 90.1% |
| 0.01U win at −110 | +0.0091U, 0.0191U returned | +0.01U, 100% | 91% |

Two otherwise qualified players with the first two half-unit results currently
tie. Switching to exact saved-net ROI would split that **existing** tie, even
without any custom stakes. Do not silently make that correction inside M-41.
Four-decimal input would add separate failures: 2.9999U over two picks rounds
to 3U and wrongly qualifies; a 0.0001U loss normalizes to zero risk and null ROI.
These cases are outside the approved hundredths entry domain and are retained
as local diagnostic evidence, not failing/default tests or product contracts.

The coordinating task must resolve one explicit product choice before apply:
retain the existing cent-normalized board formula for Custom as well, acknowledging
the 0.01U example; or authorize a separately reviewed, uniform accounting
correction with a historical rank/tie impact assessment. Neither choice is
inferred here. Saved D-26 results must remain intact under either choice.

## Release card — held

- **Merge:** only when next in Gate M queue, after review and exact-source CI.
  Depends on already hosted M-11 and existing Virtual/Recommended writers;
  independent of pending M-33/M-34/M-35. Do not reapply any prior migration.
- **Before apply:** resolve the accounting choice; deploy the compatible readers,
  validation/error mapping and gated native control. Verify old-schema fallback.
- **Approval:** Sean must explicitly authorize `apply M-41`. No such approval is
  claimed. No calendar window is required; other Gate M checks remain mandatory.
- **Fresh precheck:** compare hosted `prosrc` MD5 with all three header hashes,
  verify no partial apply or overload, collect current source/CI/compatibility
  evidence, hash finished `gtl_ballot_pick_scores(...)` function output and
  settled Virtual results, plus saved selections/audits/receipts. The historical
  scoring object is a function, not a table. Keep private rows out of public logs.
- **Apply/verify:** one reviewed migration only, no `db push`; confirm new function
  bodies, service-only grants, unchanged RPC argument lists, and preservation
  hashes. Verify half and cent boundary probes, gates/CAS/replay, and required
  next collector evidence. Then update the hosted ledger and remove only M-41's
  `awaitingDeploy` entries after permission checks pass. Hosted strict checks
  and real-phone acceptance have not been performed here.
- **Rollback:** the matching `supabase/rollback/20261108022135_...sql` restores
  the three previous writer bodies byte for byte. Additive helpers remain;
  the readable service-only capability explicitly returns
  `{version:1,hundredths:false}`. This narrowly tested compatibility exception
  follows M-01's readable rollback-rules pattern. No row is dropped or rewritten.
  The existing `bets-place`/`bets` switches remain available; they do not imply
  that legacy group or Recommended routes are disabled.

## Local verification

Final focused checks: **178 Node/SQL assertions**, **28 component tests**,
**2 browser scenarios**, and the **2 targeted final rollback checks** passed,
with no skips. Typecheck, Brand QA (`python -X utf8` on Windows), production
cloud build and `check-cloud-boundary --bundle-only --strict` passed. The full
five-test rollback suite had also passed before the final explicit-false
capability adjustment; the two affected checks were rerun afterward.
The build reports the existing large-chunk warning. Bundle-only checks do not
establish hosted permissions or migration deployment.

The focused Node/SQL suites exercise three writers, old-schema fallback,
malformed/missing capability, invalid cents, exact revision/CAS, duplicate
requests, line gates, quote matching, kickoff, service-only grants, apply
idempotence, MD5 restoration and SHA-256 preservation of fixture rows/derived
scores. A separate cent settlement probe runs the real D-26 function: win
0.0091U/return 0.0191U, loss −0.01U, push/void return 0.01U, unchanged selections,
replayed finals and rollback preservation of nonempty settled results.

`virtual-units-hundredths.spec.js` passed against an isolated browser server on
5272 using local fixture accounts only: legacy controls; custom 0.01U;
ordinary 0.5U floor; 0.1U custom steps; invalid draft retention; busy/uncertain
freeze; identical retry with one stored audit. Layout/Axe checks passed at
320px Dark and 390px Light; forced-color capture was inspected. Captures remain
in ignored `.local/virtual-custom-captures`. These are browser fixtures, not
actual-phone or production acceptance. No credentials or live provider reads
were needed.
