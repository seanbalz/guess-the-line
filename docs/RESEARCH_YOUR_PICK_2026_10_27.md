# Research Your pick sheet — October 27, 2026

Owner: Codex · Source batch for approved redesign stage 31.

Each Spread or Total row under **You on this game** opens a dedicated Your pick
sheet over the game details. It shows the selected game's saved guess, recorded
Late label and lock-in time, the saved scoring reference and observation time,
and the same game's Community guesses for that market. Back/Escape returns to
the original row. The existing Play destination retains all editing and lock-in
confirmations; navigation does not write, reveal or forfeit anything.

## Evidence boundaries in the screen

- Drafts, including preserved drafts after kickoff or sit-out, never display a
  scoring reference. A forged reference under a draft is ignored.
- Locked guesses distinguish **Line at your guess**, **First line after
  submission**, **Commissioner-ruled line**, **Line pending** and **Scoring line
  unavailable**. Missing values are an em dash; a genuine zero remains Pick'em.
- Only the personal ballot's saved reference is used. Current market quotes and
  Community-read failures cannot replace it. A failed personal refresh retains
  the last loaded receipt with a warning; account/week changes hide it.
- The Community list reuses the existing M-08 reader and its validation/gates,
  fixed to the sheet's selected market. Other players' drafts remain private.
- Fine print lives behind About your saved pick and in Guidance and sources.
  The shared GTL sheet, buttons and tokens supply layout, focus and safe areas.

## Validation

- 37 integrated Research/Lines/Trends browser tests passed, plus both focused
  Your pick cases rerun after the final accessible-name change.
- 28 component tests and 36 model/guess-gate/shell/token tests passed.
- Typecheck, Brand QA, fixture production build, bundle privacy scan and
  `git diff --check` passed.
- Inspected Light/Dark 320px screenshots. Browser coverage includes draft versus
  locked references, network/DOM secrecy, focus return, the correct Play target,
  no browsing writes, pending/first-after/Late labels, and independent personal
  and Community read failures. Component checks cover mismatched account/week.
- The first failure-recovery test identified that the shared store reports a
  refresh failure in `error` while keeping `status: ready` for its cached record.
  The sheet now uses that error field and preserves the saved reference visibly.

These are local fixture and emulation checks, not hosted or physical-device
acceptance.

## Remaining work

This supplies stage 31's dedicated Your pick destination. Direct See picks now
and sit-out confirmation from Research remain open; the existing confirmed Play
flow remains available. Stage 33's direct confirmation/live-status work and
stage 34's Bet/Challenge slots and League bets also remain open.

CI/merge, hosted release/readback and physical iPhone Safari/Home Screen
acceptance remain separate checkpoints. No API/schema/scoring/collection change,
deployment, migration apply or real player write occurred in this batch.
The frozen v62 tracker and Sean's corrected no-scroll-bug report are preserved.
