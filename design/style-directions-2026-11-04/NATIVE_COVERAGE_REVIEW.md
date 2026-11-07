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

- Account History: nineteen Guess states and expanded/source/rules views were
  approved at `e585b0afa23deb49996f4b044010d5b41656d5ce` (44 captures). Bets weeks
  and all seven Older sections now have 24 states plus expanded/Info variants
  approved in both themes at `5c4210863f486bf77b1fec251073b26a55d5d89e` (60 captures). Earlier Play
  scores/Bets corrections are not substituted for this account-history evidence.
- NFL action layers: the scoped batch below now covers native forfeit/reveal,
  personal/everyone picks, game bets, Virtual entry, feed picks/reactors and
  recovery/guard states. Owner visual approval is pending for 106 captures.
- Shared shell: native Menu, header, sports and four-tab placement plus layer
  failure are supplied below. Existing switcher/invite/general recovery and
  Menu destinations retain scoped approvals. EPL league/History/Bets states are
  now prepared below (eight captures), pending visual approval. Retained NBA
  route visuals remain a separate reconciliation item.
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
themes (44 captures), approved at `e585b0afa23deb49996f4b044010d5b41656d5ce`. Native five-block presentation
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
Older records are now prepared below; NFL layers/shared shell and retained-route coverage
remain explicit. No whole-project completion, production integration or release.

## Current Bets weeks / Older records delivery

24 states plus four expanded views and source/rules Info are supplied in both
themes (60 captures), approved at `5c4210863f486bf77b1fec251073b26a55d5d89e`. Both native feature files are
isolated/source-compared; all seven sections remain. Native record/outcome,
qualification, Challenge grading, note/forecast changes, archived-journal
accounting, slips, comparison snapshots and benchmark visibility are retained.
All data is fictional/math. Quote/source/save/archive/freeze timestamps are not
invented; 36 fields remain null. Illustrative metadata avoids provenance claims.
Closed terms are absent from fixtures; hidden comparisons remain withheld.

Sixteen native history/journal tests, 192 layouts, 48 flows, fourteen section
opens, 88 loaded marks, sixteen Info checks, six prior mounts and source/fixture/
brand/syntax/diff checks passed. No reads/writes, imports/freezes, storage changes,
bundle intervals, browser popup/dialog or page error observed. Independent slips
still opens while records is unavailable. Actual server permissions/history/
source/settlement/import/freeze/device acceptance stays separate. Remaining NFL
sheets, shared-shell and retained-route reconciliation follows; whole-app work
is not complete. Avatars/photos and awards stay held.

## Current NFL actions / shared frame delivery

## NFL actions and shared navigation mockups prepared — November 6, 2026

[Phone review index: all 106 captures](NFL_ACTIONS_NAVIGATION_REVIEW.md).

Sean approved the prior 60 Bets weeks / Older records captures at
`5c4210863f486bf77b1fec251073b26a55d5d89e`: “Looks good in both themes.
Continue with the remaining NFL action and shared-navigation mockups.”
That approval is recorded at its exact capture scope.

This batch adds 43 core states in both themes: whole-week sit-out/reveal and
its uncertain-close warning, saved Spread/Total/draft/pending/stale/scope states,
one-game league bets, feed pick sharing and reaction lists, Virtual Units and
its slip, native Menu gates/busy sign-out, NFL/EPL/native four-tab frame, and a
layer-open-failure toast. Existing switcher/invite/reaction-chooser/general
recovery and Menu-destination approvals are retained rather than duplicated.
Native navigation bodies are labelled context specimens, not replacement
features. Empty tab slots avoid invented counters; NBA stays hidden.

Sean then requested units down to **0.01U** and selected **0.1U per +/− tap**.
The Virtual and manual tracking preview controls now include the quick minimum
and custom entry. The Virtual field blocks invalid amounts, accepts hundredths,
keeps the 100U maximum, and freezes editing in busy/uncertain states. Manual
tracking preserves Unknown, existing precision and 10000U maximum. Existing
saved records and qualification thresholds stay intact. Native production
Virtual code still has its 0.5U floor; implementation/API/database compatibility
and deployment are separate unfinished work.

Ten native presentation files are source-compared after explicit adapters:
injected contexts/read/write states, no-op notices, haptics off, selected logo,
mark-only matchups, omitted real metadata times and the requested unit controls.
Native formatting/gameGuesses/everyoneBoard/accuracy, initial avatars, reaction
glyphs, Menu gates and Sheet/Dialog/Info behavior remain. Native API/auth/read/
write/polling/storage/timer controllers are excluded. New annotation Info stops
nested cancel/close from dismissing its parent. The unconfirmed close warning
uses existing words in a native Dialog storyboard, without an OS prompt or a
recovery marker. No preview action fabricates saved/revealed/shared success.

All identities, picks, terms, outcomes/counts and fixed recovery/confirmed states
are fictional. Math examples give 8 accuracy points for one-point error and a
normalized +0.91U entered-price result. Hidden guesses lack pick/error/points/
rank; closed bets lack terms/results. No real fixture, quote, kickoff,
observation, save receipt, post, reaction or transaction is supplied. Offer
timestamps remain null; example terms cannot qualify as live prices.

61 existing native tests passed (25 Node, 36 Vitest). Browser checks include
336 baseline responsive layouts, 56 revised Virtual and 8 revised tracking
layouts, 48 revised saved-pick layouts/12 flows, 84 baseline flows, 16 decimal-entry flows, 68 loaded separate marks,
10 modal keyboard/focus checks, 10 Info checks and six prior mounts. Source,
fixture, unit clamp/step, UTF-8, bundle exclusion, Brand, syntax and diff checks
passed. Instrumented core/modal passes observed no provider/auth reads, writes,
storage changes, bundle intervals, popup/OS dialog or page error; revised entry
checks observed no page errors or non-GET requests. Build: 1810 inputs,
927553-byte JS. 106 inspected captures include five scrolled sheet pairs and
four rule/example Info pairs, plus revised tracking. Current owner approval is
pending; navigation retains Sean’s standing pass-unless-reported instruction.

Only preview assets/evidence change. No production controller, scoring,
collector, migration, frozen v62, account data, merge or deploy change.
Retained-route reconciliation and whole-app implementation/acceptance remain
unfinished. New avatars/photos/awards stay held; parked Signal files are
untouched and unpublished.

## Unit quick choices and Custom clarified — November 6, 2026

Sean confirmed “Yes” to the distinction: **0.5U is the smallest quick-select
option**, while **Custom may enter smaller values, including 0.25U or 0.01U**.
The previously selected **0.1U per +/− tap** remains. This confirms these
controls only, not the entire 106-capture batch or whole-app visual approval.

Both Virtual and manual tracking previews remove the 0.01U quick chip. Virtual
labels its amount field “Custom units”; it retains 0.01U–100U and hundredths
precision. Tracking retains its Custom toggle, 0.01U floor, existing field
precision/Unknown option and 10000U maximum. Buttons may adjust an entered
custom amount below 0.5U; quick options still start at 0.5U. No saved amount,
qualification threshold, production API/database rule or native writer changes.

The revised Virtual states and tracking unit placement are refreshed in both
themes in [the phone review index](NFL_ACTIONS_NAVIGATION_REVIEW.md). Source-excerpt comparison, build,
Brand/syntax/diff checks, 56 Virtual responsive checks/eight entry flows and
eight tracking responsive/entry checks cover the correction. Checks verify
the absence of a sub-0.5U preset, the 0.5U shortcut, Custom 0.01U acceptance,
0.1U stepping, bounds/validation and busy/uncertain guards. No page errors or
non-GET requests are observed in the focused Virtual check. Native production
Virtual remains limited to its existing half-unit stakes; implementation and
release are separate work. Parked Signal files remain untouched/unpublished.

## EPL league, History handoff and Bets notices prepared — November 6, 2026

[Phone review: eight captures in both themes](EPL_SHELL_REVIEW.md).

Sean’s “Good continue” records approval of the revised Virtual unit-entry
placement shown in the preceding final reply, at
`62a64773b544fbb8ffe679d8f6a8dc1fae552b9f`. The two reviewed Virtual captures
are named in the selection record. The confirmed unit behavior remains 0.5U
smallest quick choice, Custom down to 0.01U and 0.1U per +/− tap. This scoped
approval does not silently accept the entire 106-capture NFL batch or unseen
tracking placements.

The next three native EPL shell gaps now have selected dark/Porcelain mockups:
the single selected FEPL league row, History’s existing unavailable notice with
View NFL history, and Bets’ existing unavailable notice. Exact native copy and
actions remain. Native EplLeagues/EplHistory/EplBets/EPL_COPY presentation from
two files is extracted/source-compared after local shell/navigation injection,
export naming, haptics off and the existing clock/ticket notice glyphs. The
shared header and four tabs use FEPL with no invented NFL counter badges.

FEPL is a fixed native identity; Alex Lane is fictional. The league sheet’s
blurred Home underlay is labelled review context, not live Home data. The
source-defined unavailable states are not failed/empty reads or evidence of
missing/deleted records. No EPL create/join/invite or wagering form, historical
record, standings value, quote, feature status or permission is invented. The
already-reviewed account Menu is referenced, not duplicated; its real shared
community guard read is excluded. New avatars/photos/awards remain held.

Selected-row/Close/Escape and History Back work locally and return focus.
View NFL history reports its native #history handoff without changing the URL;
shared destination controls only show no-read notices. The review reopen button
is hidden while History is open. No API/auth/provider read, write, URL/device
storage change, polling or interval controller runs.

48 native tests, 24 responsive checks, six flow checks, two league-sheet
keyboard/focus checks, eight Info checks and four prior mounts passed. Source,
controller exclusions, Brand/syntax/diff and capture hash checks passed. Build:
1813 inputs, 934020-byte JS. No page error, provider/auth read, non-GET request,
storage write, bundle interval or OS dialog observed. Eight phone captures,
including source/scope Info, were inspected; owner visual approval is pending.

Only preview assets/evidence change. Production behavior/data, actual guarded
navigation, device acceptance, retained-route reconciliation and whole-app
completion remain separate. NBA navigation remains hidden and retained links
unchanged. Parked Signal files are untouched/unpublished. No merge/deploy/apply.
