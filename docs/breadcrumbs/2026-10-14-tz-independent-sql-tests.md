# SQL tests independent of the host time zone

**Session:** 2116af41-7991-4922-879d-62e6d866ffc5 · **Agent:** AI Agent (Claude Code) · **Device:** Mac mini · **Repository:** seanbalz/guess-the-lines-repo · **Branch:** claude/tz-independent-sql-tests (from origin/main ba42b8c)
**Objective:** Sean's request: fix the four node subtests that failed on a Mac in Pacific time and passed with `TZ=UTC` (flagged in [2026-10-14-persona-time-of-day.md](2026-10-14-persona-time-of-day.md)).
**Jira:** N/A · **GitHub:** this branch's PR

## What was found

- The failures were `tests/guess-picks-sql.test.mjs` ("before any kickoff …", line 134: `deadline` read `2026-10-14T22:59:00-08:00`, expected `2026-10-15T06:59:00+00:00`) and `tests/lines-sql.test.mjs` ("no value key before a lock-in …", line 162: kickoff text), plus their two parent tests. They were the only host-time-zone failures in the 1,176 node tests.
- The cause is the test database, not the tests or the SQL: PGlite starts its session in a fixed offset taken from the host (`current_setting('TimeZone')` is `Etc/GMT+8` on this Mac, not even Pacific daylight time), so a `timestamptz` inside a jsonb reply is written with that offset. Supabase databases run in UTC and CI runs in UTC, where the same tests pass. Line 134 deliberately asserts the hosted string form (`+00:00`), so loosening it to an instant comparison would have weakened a real check.
- Not verified on the hosted project directly: no GTL project is linked on this Mac (the Supabase MCP here belongs to another organization). The basis is Supabase's UTC default, CI and the test's own hosted form.

## Fix

`PRELUDE` in `tests/migrations.mjs`, which every shared PGlite world runs first (community-world, the persona harness, the cloud browser fixtures and the SQL suites that build on them), now starts with `set timezone to 'UTC'`. Product code and migrations are unchanged.

| Timestamp (TZ) | Commit | Changes | Validation | Status | Next | Sync |
|---|---|---|---|---|---|---|
| 2026-10-14 16:40 PDT | (this commit) | `tests/migrations.mjs`: PRELUDE sets the PGlite session to UTC, with the reason; this breadcrumb | Mac in Pacific time: `guess-picks-sql` + `lines-sql` 32/32 (were 4 failures); `npm test` node 1,176/1,176 and vitest 147/147; `TZ=UTC` node 1,176/1,176; full cloud browser suite on the Mac's time zone (result in the PR) | Complete | Push, PR | LOCAL_ONLY until pushed |
