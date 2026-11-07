# Approved Prism Play, Points and Score â€” native port

Owner: Sean Balsiger Â· November 7, 2026 Â· Local implementation evidence

This handoff adapts the confirmed Play/Points/Score arrangements to the real
native readers, writers and navigation. It is not a hosted release record.
Source started at freshly fetched main
`42a5ad9930a5712c6b357564701fbb5628b12b43` in the exclusively owned
`codex/confirmed-prism-play-score-2026-11-07` worktree. Shared foundation
`1e104fdf1266660a84c98971ddae91d9c153be68` was cherry-picked locally for QA;
its parent handoff owns global palette/type/materials/identity changes.

## Approval mapping

Read-only authority is `design/style-directions-2026-11-04` in owner acceptance
commit `3ac2eb50513ba73447ef890e4a47863cde7bdd76`, particularly
`selected-system-review.json`, `SELECTED_DESIGN_HANDOFF.md` and the following
scoped records. No preview bundle, adapter, fixture or no-op controller enters
production code.

| Confirmed reference | Native implementation |
| --- | --- |
| `overviewCloseoutReview`, reviewed `6bfcfdbe787bdc2d44019aa3e3c85530cf009ebd`; `overview-closeout-play-{dark,light}-phone.png` | Your picks group, Spread/Total/Points entry controls, two market-specific real next-game cards; full-width personal season score/history card; League/Badges support cards. Existing How to play and reminder behavior remain available. |
| `playDraftLockIn`, reviewed `383cdf0825ed54aa811b8649c4631ae53eb2e97d`; supplied Spread/Total draft and confirmation captures | Separate matchup and entry cards, native favorite/chip/keyboard input, independent market control, explicit finality, outlined lock action and confirmation summary. Existing confirmed receipts/retries remain native. |
| `pointsDraftPreview`, reviewed `881167ad49b8df946cddae35626466b721c6041a`; supplied week, draft, confirmation and usage profiles | Published five-slot overview, progress labels, team marks, observed-production sparks when available, player matchup/stepper/confirmation, context and usage-profile route. |
| `scoreHistoryPreview`, reviewed `9bd5d6c96adc253afecaf333bc886a076011f3d3`; supplied weekly/game/history captures | Personal accuracy ring, first six/show all rows, saved-line/guess pairs, fixed 0â€“10 points/game history bars, separate markets and original signed game axis. |

Each team still uses the shared circled TeamMark. Native Nest continues to own
routes, navigation lips, focus, Back and draft preservation. These area views
remove its redundant outer floating frame/inset so the confirmed content cards
stand on the canvas and long favorite labels retain enough room. Shell header,
sports selector and dock placement remain outside this task.

## Real data and state behavior

The Play overview reads the existing shared owner `/personal` reply, only for the
Community week's matching season/week. Its two cards independently choose the
next unlocked upcoming game for Spread and Total; the same game can correctly
appear in both. They show saved own draft/lock/closed/sit-out state, never a
bookmaker line or another member's guess. Historical non-per-game rules retain
their read-only presentation. The compact Points control keeps the original
Points reader, exact-score moment reporting and missing/coming-soon accessible
status. Actual empty/error/stale states are retained.

The season figure and chart use only one market's eligible authoritative
personal week totals. Spread and Total are never summed. A real zero remains
zero. A missing week suppresses the continuous graph and receives explicit
unscored wording. These are personal totals, separate from kickoff-gated shared
standings. Weekly points still come from the authoritative saved scoring rows;
the UI does not recalculate them against a new quote. Filtered subsets receive
no rank. Pending, hidden, draft, ineligible and missing rows receive no false
zero. Saved-line sources, observation times and rules remain behind native Info.

Points graphs use the actual published slot's existing Fantasy snapshot and
`playerProfile` completed-game production. Their labels name recorded weeks and
point values. They never plot a House estimate, forecast or member guesses.
Missing snapshots/players/games keep explicit unavailable or empty states. The
existing House/reveal gate, whole-point limits, stepper, retry and save behavior
are unchanged.

## Verification and limits

- Existing isolated browser suite: 28 passed, covering native lock/final/save,
  lost-response readback, same-request retry, authentication recovery, sit-out,
  source refresh, hidden guesses, exact-score moments, Points/House gates,
  keyboard/reduced motion, and 44px targets down to 320px.
- 112 affected Vitest checks and 47 model/token/motion contracts passed;
  typecheck, cloud build and bundle-only privacy scan passed. The hosted boundary
  check was not run because this owned checkout has no `.env.cloud`. Two
  unrelated shared EPL label assertions from the broad Vitest run were passed
  to the parent foundation stream; no full-suite green claim is made here.
- Final focused browser run: four cases passed after card-width/spacing QA,
  followed by the observed Points context/profile case (one passed). The original
  keyboard-only/reduced-motion case at `next-points.spec.js:228` also passed
  unchanged in a separate final run, with no retries or weakened assertions.
  This is not a claim that area styling fixes the parent-reported intermittent
  shell focus-restoration race; that source review was sent to the parent.
- Added focused native tests verify independent overview game selection,
  observed-only Points charts, null versus zero rings and single-market season
  totals/gaps. Original layout assertions were updated for approved added marks,
  ring semantics and overview entry destinations.
- A focused score browser case checks authoritative points, real zero, pending,
  hidden sentinel exclusion, separate markets, first-six/show-all, history bars,
  the original signed axis and 320/390/768/1440 widths in both themes.
- Native fixture captures are in `design/prism-play-score-native-2026-11-07/`.
  Their account/read/quote examples are fictional test data, not real-account,
  source-provider or physical-iPhone acceptance. Shared shell positions visible
  in captures are the retained native frame and remain a separate parent task.

The broader whole-app rollout, hosted source/CI/asset verification, real-account
and physical-phone acceptance remain separate. Compare and unseen receipt/error
variants retain their native meaningful arrangements; this handoff does not
claim new visual approval of those variants. No API, SQL, migration, collector,
provider budget, permission or reveal policy changed. No push, PR, merge or
deployment was performed by this subtask.
