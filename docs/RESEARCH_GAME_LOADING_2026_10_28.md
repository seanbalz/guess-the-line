# On-demand game details — October 28, 2026

Owner: Codex · Approved Research/chart follow-through and OPT-01

Game details previously shipped in the initial new-app dependency graph. The
sheet frame, scoped title, pager, action slots and personal-week model stay in
`GameSheet.jsx`. The existing result, market, research, weather, referee and
private-note content now loads through `GameDetails.jsx` when the sheet opens.
The shared static skeleton says Loading game details; Close, Escape, Back and
the pager work while downloading. No sample scores or charts fill the wait.

A failed code or stylesheet load stays inside the same sheet with an explicit
retry. Retry focuses the details group and replaces only its loader; it does not
reload the app or refresh the personal-week model. The existing stylesheet
repair helper prevents an unstyled retry. Successful code is shared across
openings. A late rejected download cannot reopen a closed sheet. Only code is
cached here; existing readers retain their account/week/game guards. The
selected game's detail readers start once its content can mount, without extra
API routes or duplicate requests. Existing notes, guesses, result observations,
charts and reveal gates retain their behavior. The content group preserves the
sheet's original 16px gaps with existing tokens.

## Local asset measurement

Compared baseline `c5573f099b120901df3f4112067fe8eaf73e04cf` and this source using
`vite build --mode cloud-test --manifest`, with the same local environment.
Counts follow NextApp's static JS/CSS imports, including entry dependencies;
dynamic data/features are excluded. Gzip is a local level-9 estimate per asset,
not production transfer bytes or a measured page-speed improvement.

| Asset / graph | Before bytes | After bytes | Reduction |
| --- | ---: | ---: | ---: |
| NextApp JavaScript | 421,792 | 401,187 | 20,605 |
| NextApp CSS | 86,426 | 81,408 | 5,018 |
| Initial static dependency graph (13 files) | 1,433,821 | 1,408,199 | 25,622 |
| Same graph, estimated gzip | 410,641 | 404,372 | 6,269 |

First game opening adds two assets totalling 27,431 bytes (9,007 estimated gzip).
After opening, the combined estimate is 2,738 gzip bytes larger than the eager
graph because of the recovery boundary and chunk overhead. The benefit is
keeping optional details out of startup; no claim of a smaller total journey.

## Verification checkpoint

The new download regression failed against the eager implementation. Both
focused browser cases passed after splitting the view: no detail JS/CSS before
opening, a usable frame and pager while held, close/focus return, late rejection,
inline error/retry, retained retry focus, successful load and module reuse.
The stylesheet case covers two failures before successful repair and styled
market content. Eight loading/error 320px Light/Dark and forced-color captures
were inspected; axe and touch-target checks passed.
The full 466-test Vitest suite, 59 model/navigation/modal/token/brand tests and
typecheck passed. One first-run unit case timed out under concurrent builds;
the full suite passed with two workers. The expanded shell/Research/Lines/
Trends/gesture run passed 96 of 97 cases; the remaining Trends case inspected
section ordering as soon as the frame appeared. It now awaits the actual weather
and trends sections before comparing their DOM order. All five final focused
cases passed: that corrected case, both download/style cases and both result-
check flows. No production behavior changed for this test repair. Brand QA and
the final fixture build/privacy scan passed.
SSR tests render the actual detail view eagerly; browser cases exercise the
production lazy boundary. Fixtures are not signed-in production evidence.

## Remaining checkpoints

Source branch: `codex/lazy-game-details`. PR #301 merged as
`327b8e83409c3b564bd652697ed54261fd8ac741` after all nine checks passed on
`c5573f099b120901df3f4112067fe8eaf73e04cf`; no CI repairs or review findings.
This batch still needs CI/merge, release/readback, signed-in performance and
physical-iPhone acceptance. Live/postponed/cancelled status and dependent
Bet/Challenge destinations stay open. Source readback confirms the Bets slot
currently exports League bets only; Bet and Challenge depend on stages 44 and 54. No deployment, migration apply, scoring
rule, collection budget or frozen v62 tracker change.
