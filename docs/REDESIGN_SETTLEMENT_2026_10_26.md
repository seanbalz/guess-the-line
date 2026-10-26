# Native manual Settlement — October 26, 2026

Owner: Sean Balsiger · Q17-C / redesign stage 78

## Implemented scope

Menu → Settlement gives the Community commissioner a native, on-demand screen
for the existing D-26 Virtual Units settlement operation. It reads published
weeks and stored results through `/bets/recommendations`, including result
versions and source observation times. Opening or refreshing never settles.

Review and confirmation precede `POST /virtual-units/settle`. Only season and
week are sent; the existing server permission checks and free nflverse source
supply the finals. A fresh Community permission read and selected-week read
precede every request. Changed stored versions return to review. The existing
server/RPC remains the authority; the client preflight is not a transaction lock.

An account-scoped pending check is stored before sending. Lost replies and failed
readbacks recover by reading the same week, including after reload; they never
replay settlement automatically. The UI distinguishes a completed response from
an unknown response and does not attribute a later read to a particular lost
request. Busy controls prevent duplicate requests and closing through the
screen's back/close buttons. Other browser lifecycle events can still interrupt
requests, which is why pending-check recovery is retained.

Saved bet terms, existing result history and prior correction versions remain
under the existing SQL contract. This change adds no backend route, SQL,
permissions, migration, external data provider or scheduled job.

## Still open

Stage 78 is partial: this is the manual Virtual Units portion of Settlement and
schedule status. M-18 / stage 55 friend-challenge grading and M-19 / stage 56
scheduled settlement/status reading remain unimplemented. The screen explicitly
says automatic schedule status is unavailable and challenge settlement is not
connected. It does not infer a disabled or healthy hosted job from absent source
support. No schedule is created, activated or changed here.

Next independent native commissioner page: Week opening, followed by Game
referees, Odds connection (counts only) and Final scores. Final scores and Guess
scoring remain separate from bet settlement. The remaining Q17 preservation
and history/export destinations, Q06 Bets work and OPT-01 integrated/device
performance evidence stay open. Classic remains reachable.

## Verification record

Seven dedicated browser cases pass against fictional accounts, a disposable
PGlite database and a fixture nflverse CSV through the real handler. They verify
cancel/confirm, unchanged reruns, corrected finals with prior versions and
unchanged bet terms, non-admin denial, client-final rejection, lost replies,
failed reads, duplicate prevention, refreshed permissions and older-week scope.
The screen is checked with Light/Dark axe and overflow assertions at 320px;
list and review screenshots were visually inspected. No real player record is
settled and no live schedule is fetched.

The integrated run passed all 20 Settlement, Members and existing Virtual Units
cases. After the final layout adjustment, the seven Settlement cases passed again;
all 21 existing shell cases passed. All 11 required legacy publishing, final-score
and D-23 preservation browser cases also passed. Forty-one focused token/app-boundary/settlement
Node tests, typecheck, Brand QA, the authenticated cloud build, bundle-only privacy
scan and manifest generation passed. The build uses the fixture URL/key, not a
hosted account. The four lazy-loading performance cases passed; the Settlement
chunk is requested only on opening (7.30 kB, 2.79 kB gzip in this fixture build).
This is bundle/loading evidence, not a physical-phone speed measurement.
CI, merge, approved release, signed-in hosted readback and physical-iPhone
acceptance are separate milestones. The frozen v62 tracker is unchanged.
