# Native screen coverage review — November 6, 2026

This reconciles the selected Prism Glass review with the native source tree.
It is a review queue, not a production availability or completion claim. Earlier
approvals remain limited to the captures and states recorded in
[selected-system-review.json](selected-system-review.json); opening a route does
not approve it. Navigation is accepted by Sean's standing direction unless he
reports an issue; technical bounds/focus checks continue separately.

## Confirmed gaps and sequence

| Order | Native area | Existing review coverage | Remaining work |
|---|---|---|---|
| 1 | EPL manager linking (`web/src/next/epl/ClaimCard.jsx`) | Nine-state batch approved in both themes at `0db5eafd47d6e6325c7cd0164ae392b42b78d4e8` | Actual claims/session setting behavior remains separate |
| 2 | EPL Home and draft recovery (`EplHome.jsx`, `PickATeam.jsx`) | Home/recovery/source Info approved in both themes at `d2ead64e55adb3d8c3b1ee7d55505236f995bc90`; earlier draft/queue/confirmation approvals retained | Real data, permission, clock/turn and device behavior remain separate |
| 3 | EPL moneyline (`epl/guess/EplGuess.jsx`, `GuessCard.jsx`, `EplGuessLeaderboard.jsx`) | Fifteen-state batch and expanded fictional reveal approved in both themes at `6c54342754972f1a31ec5b42842adae66e2cf4ba` | Real quotes, saves/locks/reveal/privacy and device behavior remain separate |
| 4 | FEPL Fantasy (`epl/fantasy/EplFantasy.jsx`) | Sixteen FEPL states, expanded own standing and two Info views approved at `ad99d39390d63295cf87995d00558fb0a500c875` (38 captures) | Actual private/source/device behavior remains separate |
| 5 | Other existing sport surfaces (`nba/NbaApp.jsx`, `Games.jsx`, `Bets.jsx`, `BetEditor.jsx`) | Scope checked: October 29 decision and current sportOptions/Frame hide NBA from navigation; retained saved links still open records. No NBA captures | Preserve hidden navigation and retained records. No new entry point or deployment claim; retained-route visuals remain a separate coverage item |

The EPL correction nine-state batch at
`d340a248cf0e6696ca83d68c46aa6398ffb27ff1` was approved in both themes by Sean:
"Looks good in both themes. Continue with the next mockups." Its actual
Community authorization, source completeness, cancellation and refresh behavior
remain separate from visual acceptance.

## Areas requiring reconciliation before declaring the first project finished

- Account History: native Guess weeks/week/game/owner-changes now have a prepared
  nineteen-state batch in both themes (44 captures). Bets weeks and Older records
  remain next; earlier Play score/history and Bets corrections do not automatically
  cover these account-history views.
- NFL game and action layers: map `shell/registry.jsx`, Play/Bets subviews and
  modal/guard branches to exact existing captures. In particular, check the
  forfeit/reveal dialog, personal/everyone pick sheets, Virtual Units entry and
  feed pick/reactor sheets before scheduling any missing visual batch. Avoid
  reopening already approved states under another label.
- Shared shell: compare the existing Menu, sport switch, league switch and
  download/recovery layers to the supplied Account/access/continuity approvals.
  EPL's native leagues and history placeholders need their own scope check.
- Review notes and exports remain visual evidence; hosted data, physical-device
  behavior, release gates and production integration require their own evidence.

These are targeted reconciliation checks, not an assertion that every listed
panel is missing. Native source existence alone does not establish exposure,
hosted support, privacy permission or deployment.

## Held follow-up project

New avatars/profile-photo choices, new awards/celebrations and the requested
popup/award exploration stay held until the first visual project is finished.
Existing initials, glyphs, source controls and native operational notices may be
represented without adding those deferred features. Parked Signal branding
files remain untouched and unpublished. No merge, deployment or migration apply
is part of this review queue.

## Current Home/recovery delivery

Thirteen states plus the table-source popup are supplied in both themes (28
captures). Source metadata is an existing test fixture; no real table was fetched
or used, and outbound fixture URLs are omitted. The information popup now uses
the selected glass treatment; its narrow long-word overflow was corrected and
16 modal layout/Escape/focus checks passed. Home retains the shared logo and tab
bar. Independent progress failures leave the draft action available. Refused,
off and no-week reads drop the board; an ordinary failed refresh retains its
native stale board and turn eligibility. These supplied visuals were approved
in both themes at `d2ead64e55adb3d8c3b1ee7d55505236f995bc90`; live-source/device
acceptance and whole-project completion remain separate. The dedicated
moneyline batch is now prepared below.

## Current moneyline/leaderboard delivery

Fifteen states plus expanded permitted fictional reveal are supplied in both
themes (32 phone captures). Sample guesses are editable in memory; no bookmaker
quotes, source/observation times, real fixture pairings/kickoffs or private rows
are fabricated. Scored comparison and standings are explicitly pure rule-math
examples. Native distance/leaderboard and input/visibility helpers are unchanged.
Five native presentation blocks were compared against their documented preview
adaptations. The 120 layouts, 30 flows, 92 loaded crest tiles, native 24 view/
controller tests and eleven pure rules tests passed. This supplied batch was approved
in both themes at `6c54342754972f1a31ec5b42842adae66e2cf4ba`; real locking/
references/privacy/device behavior remains separate. FEPL Fantasy is prepared below.

## Current FEPL Fantasy delivery

Sixteen states, expanded own standing and source/estimate Info are supplied in
both themes (38 captures), approved at `ad99d39390d63295cf87995d00558fb0a500c875`. Four tabs and WeeklyLine
use unchanged native panels. The wrapper replaces claimed saved-source time with
an illustrative-data footer and disables retry haptics. Eight fictional teams
have eleven fictional starters and three bench players each. No private roster,
real player affiliation, actual pairing inference, snapshot or capture time is
asserted. Projection arithmetic, win chance, points/bonus disclosure and chart
gaps remain native. Refused states contain no data; local retry stays failed.

128 layouts, 32 flows, 312 loaded individual crest tiles, sixteen Info layout/
scroll/Escape/focus checks, six prior mounts, eighteen native view tests and forty
domain/source tests passed. Bundle/API/hook/storage/timer exclusions, native
wrapper comparison, fixture checks, Brand QA, syntax and diff checks passed.
No writes, provider/auth reads, storage changes, bundle intervals, browser
popups/dialogs or page errors observed. Remaining existing NBA exposure/scope,
account history, NFL action layers and shell coverage need reconciliation;
none is automatically complete. Deferred avatar/photos/awards remain held.

## Current Account Guess History delivery

Nineteen states plus expanded game and source/rules Info are supplied in both
themes (44 captures), awaiting visual approval. Native five-block presentation
is compared against explicit injected-read/fixed-clock/haptic/mark-only/math
adapters; format/status/hidden/points/change helpers remain unchanged. Inputs
are fictional/math examples, never actual saved history or bookmaker quotes.
Hidden rows carry no guess/reference/points and no private owner sections. No
source/observation/save/change times are supplied. Current per-game copy,
pending/closed/active draft distinctions, sit-out, practice, late, ruled and
no-ballot labels remain.

Fourteen native tests, 152 layouts, 38 flows, 304 loaded separate marks, sixteen
Info layout/Escape/focus checks, six prior mounts, source/fixture/brand/syntax/
diff checks passed. No API/auth/provider read, writes, storage changes, polling,
bundle intervals, browser popup/dialog or page error observed. Bets weeks and
Older records are next; NFL layers/shared shell and retained-route coverage
remain explicit. No whole-project completion, production integration or release.
