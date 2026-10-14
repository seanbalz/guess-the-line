# Persona specs at any time of day: the late-evening impatient and phone failures

**Session:** 2116af41-7991-4922-879d-62e6d866ffc5 · **Agent:** AI Agent (Claude Code) · **Device:** Mac mini · **Repository:** seanbalz/guess-the-lines-repo · **Branch:** claude/festive-goldwasser-505dbb (from origin/main 49caab9)
**Objective:** Sean's report: `impatient.spec.js:27` and `phone.spec.js:195` failed on main at d1f1cf6 when run at 10:39 PM PT on Tuesday, October 13, and passed earlier in the day. Make both independent of the time of day and prove it at 11:00 PM PT, without changing product behaviour (the urgent picks-due card stays `role="alert"`).
**Jira:** N/A · **GitHub:** this branch's PR

## What was found

- **impatient (line 27).** Reproduced exactly at d1f1cf6 with the whole clock moved to 10:39 PM PT (Node, PGlite and the browser): the fixture deadline was 11:59 PM PT that day, so the picks-due card was urgent and `role="alert"`, and the unscoped `getByRole('alert')` counted it. Already fixed on main after d1f1cf6 by `e065b6f` (the locator is the error banner) and `27ce5db` (#84: the fixture deadline is at least three hours away, except late on Sunday, the last day of the week).
- **phone (line 195).** Not clock-dependent: d1f1cf6 passed 6 of 6 runs at a shifted 10:39 PM PT with the urgent card. The journey adds 400 ms to every request and takes 22 to 25 s here, and at d1f1cf6 it ran under the config's 30 s default; forcing the budget down reproduced the exact report (the Community heading wait at line 195 ends in "Test timeout ... exceeded"). Main already gives it 90 s (`381067f`).
- **Why it looked like a lobby failure.** Playwright takes the failure screenshot when the test function ends (it showed "Loading your games…"), but writes `error-context.md`'s page snapshot only when the browser context closes, after the persona fixture's teardown has closed PGlite. Troy's lobby call, still in flight, then hit the closed database and the handler answered with its generic 503, "The saved data service is temporarily unavailable." The harness now finishes calls already inside the handler before closing the database and leaves later calls pending, so the snapshot shows the screen the test left.
- **Other specs.** All 16 persona tests and the 56 tests of the community-world users (community, community-history, d23, next-shell, next-switch, publish, push-reminders, trends, virtual-units, wind) pass at 11:00 PM PT on a Wednesday (deadline moves to tomorrow) and at 11:00 PM PT on a Sunday (deadline stays tonight, 59 minutes left, card urgent). No other spec carried the "today 11:59 PM PT" assumption into a failure.
- **Limit.** A run that crosses Sunday midnight PT cannot keep an open fixture week: D-24 opens a week at Monday 12:00 AM PT and the picks-due card derives the open time from the deadline's Monday.
- **Unrelated, flagged separately.** Four subtests in `tests/guess-picks-sql.test.mjs` and `tests/lines-sql.test.mjs` fail on a Mac in Pacific time and pass with `TZ=UTC` (kickoff text from PGlite is in the host zone); they also fail at 255eed2. Not part of this change.

## How to repeat the 11 PM check

```bash
GTL_TEST_NOW=2026-10-15T06:00:00Z NODE_OPTIONS="--import ./tests/cloud-browser/test-clock.mjs" npx playwright test --config playwright.cloud.config.js tests/cloud-browser/personas
```

`2026-10-19T06:00:00Z` is Sunday 11:00 PM PT. Any instant works; the clock then runs on in real time.

| Timestamp (TZ) | Commit | Changes | Validation | Status | Next | Sync |
|---|---|---|---|---|---|---|
| 2026-10-14 10:05 PDT | (this commit) | `tests/cloud-browser/test-clock.mjs` (GTL_TEST_NOW moves Date in the runner, workers and PGlite; `shiftBrowserClock(page)` moves the page), used by the persona harness, `community-world.mjs` and `community.spec.js`; persona harness teardown waits for in-flight handler calls and leaves later ones pending before closing PGlite; pointer in `fixture-deadline.mjs`; this breadcrumb | Shifted clock, Wed 11:00 PM PT: personas 16/16, community-world users 56/56. Sun 11:00 PM PT (urgent card): personas 16/16, community-world users 56/56. Real clock: `npm run test:personas` 16/16, community-world users 56/56. Forced phone timeout: error-context shows a pending screen, no 503. d1f1cf6 at a shifted 10:39 PM PT: impatient fails at line 27 as reported, phone passes 6/6. Node tests importing community-world: same 4 timezone failures as clean HEAD, none new | Complete | Push, PR | LOCAL_ONLY until pushed |
