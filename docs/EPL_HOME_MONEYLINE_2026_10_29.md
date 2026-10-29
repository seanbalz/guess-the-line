# EPL Home moneyline and canonical rules follow-on

Owner: EPL access/UI workflow agent · October 29, 2026.

The final audit of combined source `d8448bd377148d10a496b2b0b2e987fb2b83f010`
found two explicit plan requirements still missing: the Task 5 Home button and
Task 6 canonical EPL moneyline rules. This isolated branch implements both.

Home retains Pick a Team's existing primary hero and adds the secondary
**Guess this weekend’s moneylines · N of M** action into Play → Guess the Line.
N counts only this linked manager's locked guesses for unique current fixtures;
drafts, other managers' guesses and guesses outside the current fixtures do not
count. Pending/unscored final locks still count as locked entry progress.

The separate read pins the draft server's EPL season/week and account/manager
context. It calls only `guess/read`, with no write or provider refresh. Its
in-memory state retains counts only. A changed context creates a fresh reader;
abort/generation guards drop late replies, and mismatched season/week/manager
data fails closed. Read-only, unavailable and older-API states show an honest
navigation/status alternative without blocking Pick a Team or inventing counts.
EplApp keys Home to the authenticated account and preserves the shared shell's
existing navigation/dirty machinery.

`docs/RULES.md` now records the already approved D-68 moneyline rules separately
from NFL competitions and fantasy points. D-68 itself is unchanged. The plan's
Task 5/6 checklists now distinguish source completion from final combined Home
acceptance and production release.

Local focused checks cover own-lock-only/duplicate/foreign-fixture counting,
exact EPL read context, CTA navigation, the existing primary hero, unavailable
and read-only states, older APIs, wrong season/week/manager replies, account/week
disposal and superseded requests. The acceptance owner separately owns the new
real-service Home flow and its Axe/click-through checks; those two reserved
acceptance files are untouched here.

Focused local verification passed: **70 component tests** across Home progress,
Pick a Team/Home, EPL app wiring and moneyline entry/results; **14 token tests**;
typecheck, Brand QA, whitespace, cloud build and bundle-only privacy scan. The
nine new Home tests include the stale-context and read-only cases above. The
existing large-chunk build advisory remains. These checks do not establish the
independent tenth real-service Home flow or full combined CI.

The branch is source work only. No standalone PR/CI is dispatched from this
lane. Root folds the named source head into the final combined acceptance and
CI run. M-36 named apply/readback, collector setup/activation, protected API/
worker/frontend deployment and signed-in hosted/device acceptance remain open.
