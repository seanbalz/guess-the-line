# Research game actions — October 27, 2026

Owner: Codex · Source batch for approved redesign stage 34.

The Research game sheet now has an action bar in the shared sheet footer. The
Play tab owns its Spread and Total slots; the sheet discovers them through the
existing slot registry. Each action opens the explicit season/week/market and
focuses that matchup in the complete Play ballot. Drafts and locked receipts
remain available, and opening an action makes no save, lock-in or sit-out call.
Actions appear only with the existing per-game scoring capability and a game
in the loaded personal week. No API, schema, odds collection or scoring change.

The footer uses shared buttons, GTL spacing and the sheet's existing safe area.
It stays visible while details scroll. Unsaved game notes use the shell's
existing leave guard. Focus is applied once for that destination, without smooth
motion; timer ticks and saves do not move focus. A missing/unknown game id leaves
the full ballot usable. The allowlisted address carries navigation metadata only.
Back restores the original focus target; opening general Play clears it.

## Validation

- 49 browser cases passed across integrated and focused runs of
  `next-lines`, `next-per-game-scoring` and `next-shell`. The integrated run
  passed 48/49; its sole failure classified the existing `POST /personal/read`
  reader as a write. After correcting that allowlist, both action-bar cases
  passed against the final source, including the added unsaved-note cancel test.
- 44 Node slot/routing/shell/token tests and 16 component tests passed.
- Typecheck, Brand QA, fixture production build, bundle privacy scan and
  `git diff --check` passed.
- Light/Dark 320px screenshots were inspected. Browser checks cover footer
  visibility while scrolling, accessibility, selected draft and locked receipt,
  reload, unknown game fallback, retained other drafts and no navigation writes.
  These are local fixture/emulation checks, not physical-device acceptance.

## Task boundaries

PR #230 was already merged at the start of this batch. Its exact head passed all
nine checks, and its review lists were empty. This batch starts from freshly
fetched main `8ada72b` and preserves the other lanes' changes.

The action-bar container and Guess slots are implemented. Bet (stage 44),
Challenge (stage 54), League bets, stage 31's dedicated Your pick sheet and direct
reveal/sit-out confirmation, and stage 33's remaining direct confirmation/live
status work stay open. Existing Play remains the destination for the approved
confirmation flows. This does not close all of stages 31, 33 or 34.

Hosted release/readback and physical iPhone Safari/Home Screen
acceptance are separate pending checkpoints for this batch. No deployment or
migration apply was performed. Sean's corrected no-scroll-bug report is retained.

## Merge verified October 27, 2026

[PR #242](https://github.com/seanbalz/guess-the-lines-repo/pull/242) merged as
`ec5c0358c70aee273edcfea70c6b39799a14f443` after all nine checks succeeded on
`b163ceaaf1ebe41802b36f79e6f3301d3d22f852`. The review and review-thread lists were empty;
no CI fixes were needed. The next source batch supplies the dedicated
[Your pick sheet](RESEARCH_YOUR_PICK_2026_10_27.md).
