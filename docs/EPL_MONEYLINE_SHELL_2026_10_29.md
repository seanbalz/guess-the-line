# EPL moneyline shell integration — October 29, 2026

Owner: EPL access/UI workflow agent. Scope: connect the reviewed shared sport
interface and moneyline child screens without changing either source branch.

The isolated `codex/epl-moneyline-shell` branch incorporates shared interface
source `f2147b8fee59d001cd016bd33acf981e08b89503` (#379) and child source
`263d9f1648ff4491d67a93e9d94caf8bb7365d15` (#381), preserving the main release
evidence through #375. This is source integration only.

| Item | Evidence/status | Exit gate |
| --- | --- | --- |
| Existing Play slots | Guess and Leaderboard placeholders now mount the reviewed children | Final combined source/CI |
| Account isolation | Shell passes its authenticated `you.id`; actual sign-out/sign-in UI fixture retained no previous-manager draft | Combined API/SQL acceptance and deployed readback |
| Draft navigation | Shell owns `epl-guess` dirty key, child cleanup clears it; one confirmation per internal/sport leave, Cancel retains typed values | Actual-device acceptance |
| EPL context | Read endpoint supplies the independent season/week; fixture MW17 rendered through shared shell, no NFL week prop passed | Actual API/collector flow |
| Numeric storage validation | Coordinating the shared technical helper with API owner; #381 remains stable | Import reviewed helper and test storage-edge input/stepping |

## Local acceptance boundaries

`tests/cloud-browser/epl-moneyline-shell.spec.js` tests the real shared shell and
children with explicit fixture replies for moneyline endpoints. The signed-in
account/profile layer uses a disposable PGlite community world. Both new cases
passed: authoritative EPL context, internal/sport draft guards, saved-draft
readback, Back navigation, dirty-key cleanup after leaving, shared profile and
account remount isolation. Light/dark 320px screenshots, two axe analyses and
horizontal overflow checks passed. Existing EPL navigation and both shared
interface browser cases also passed. Ignored artifacts are under
`.local/moneyline-shell-browser/`.

This does not exercise the real moneyline SQL/handler/collector. The release
owner's separate `epl-moneyline-flow.spec.js` and fixture helper remain untouched.
Merge is held for the actual #379 merge, API/collector source and full-flow
acceptance, exact CI and root review. No hosted claims, links, guesses,
provider requests, migrations, schedule changes or deployment occurred.
