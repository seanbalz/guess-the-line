# Research reveal confirmation — October 27, 2026

Owner: Codex · Approved redesign stages 31 and 33, following D-36/D-39/D-41.

[PR #246](https://github.com/seanbalz/guess-the-lines-repo/pull/246), branch
`codex/research-reveal`: published for CI/review; merge and release pending.

**See picks now** now opens one shared confirmation from the Lines gate banner
and the closed Community guesses section in a game or Your pick sheet. The
existing Play entry stays available for players who want to keep guessing.

The warning names the season/week and explains that this is a final sit-out for
all remaining unlocked guesses in the affected markets, across the week, not
just this matchup. Each market lists its current status and locked-in count.
Locked guesses retain their points, drafts remain saved and private, and a
sit-out breaks the Pick streak. Keep playing is the first focused action.

## Existing contract and recovery

- The fresh M-03 `forfeit` field from `POST /community/read` supplies the markets,
  eligibility and stored receipt. The UI never infers permission from a hidden
  line or from a cached draft. Missing/disabled, malformed, mismatched-account
  and mismatched-week replies cannot enable confirmation.
- The explicit confirmation calls `POST /community/forfeit` with only season,
  week and reason `reveal`, using the existing save-aware request wrapper.
  The server owns identity, time, eligible markets and its immutable one-per-week
  record. There is no SQL, API, permission, scoring or collection change.
- Before sending, a per-account/week session-storage marker records an uncertain
  attempt. There is no automatic write retry. An error offers Check sit-out
  status; only a fresh read without a saved forfeit enables another explicit
  confirmation. A stored receipt clears the marker and refreshes the shared
  personal and Community reads. Closing and reopening recovers through that
  same read; entered guesses are never copied into the marker or altered.
- The dialog is limited to the account and current personal week it opened for.
  Changed context and abandoned reads cannot restore confirmation. Server time
  plus monotonic elapsed time removes confirmation at the last kickoff. Focus,
  reconnect and visibility recheck while open; a closed dialog stops its reads.
- The shell's native dialog retains focus return and safe cancel behavior. A
  pending/uncertain operation uses the existing navigation guard. If browser
  storage is unavailable, the dialog asks the player to keep it open and check.
- The existing reader exposes the current week only. Older-week reveal controls
  are not enabled by this batch.

## Validation

- All 49 integrated Research/Lines/Trends/Bets browser cases passed, plus five
  final focused cases after the cancel behavior refinement.
- 24 component tests, 47 model/contract/shell/token tests and 23 database
  preservation/gate tests passed, with zero skipped database cases.
- Typecheck, Brand QA, fixture production build, bundle privacy scan and
  `git diff --check` passed.
- Inspected Light/Dark 320px screenshots. Browser coverage includes explicit
  confirmation, cancel/focus return, preserved unsaved game notes, unchanged saved
  drafts/locked scores,
  hidden guesses before confirmation, lost-response readback without replay,
  rejected/mismatched reads, explicit retry, last-kickoff expiry, closed-dialog
  behavior and recovery after reopening an uncertain attempt.

These are local fixture and emulation checks. All write tests use fictional
accounts and local PGlite, never hosted player records. CI/merge, hosted release
and physical-device acceptance remain separate checkpoints.

The focused tests found and fixed two integration details: `picksDue.now` is
absent after a week is done, so a stored forfeit receipt needs no clock; and the
shell keeps its last dialog mounted, so the component must honor its `open`
prop and stop work when closed. Cancel closes only the reveal dialog, preserving
the underlying unsaved game note; an uncertain attempt gets a specific warning.

## Remaining work

This supplies the direct Research confirmation required by stages 31 and 33.
It does not claim the whole Play stage-30 skip flow, remaining verified live-game
status, stage-34 Bet/Challenge placement actions, production release/readback or
physical-iPhone acceptance. The frozen v62 tracker and Sean's corrected report
that the app has no scroll bug are preserved. No deployment or migration apply
was performed.

Prerequisite PR #245 merged October 27 as `1db1c44062e2b63b7b945c6b0478a1ca6d72c8b6` after
all nine checks passed on `58f4d14240308e999cbede1aec1de13dd65d4362`, with no CI fixes or
review findings. The updated main also contains separate release-lane evidence;
this task has not independently repeated that hosted verification.

## Merge verification

[PR #246](https://github.com/seanbalz/guess-the-lines-repo/pull/246) merged October 27
as `6494a629e567d54aa05520ac339472322ee062bb` after all nine checks passed on
`c191ec8a8e56a71f4023002a1e2df18296331096`: Brand QA, Typecheck/test,
Windows portability, dashboard, personas and all four browser shards. There were
no CI failures or review findings to fix. Hosted release and phone acceptance
remain separate; this task performed neither a deployment nor a migration apply.
