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
| 1 | EPL manager linking (`web/src/next/epl/ClaimCard.jsx`) | New nine-state batch prepared in this change | Phone visual approval; no live claims or session setting writes |
| 2 | EPL Home and draft recovery (`EplHome.jsx`, `PickATeam.jsx`) | Generic EPL overview and approved populated draft/queue/confirmation | Native Home, unlinked/linked variations, first loading, refused/off/no-week/failed/stale reads, and existing resolution/source guidance |
| 3 | EPL moneyline (`epl/guess/EplGuess.jsx`, `GuessCard.jsx`, `EplGuessLeaderboard.jsx`) | No dedicated populated review routes | Entry/lock, permitted reference/reveal and scoring views, leaderboard, unavailable/read-only/recovery states |
| 4 | FEPL Fantasy (`epl/fantasy/EplFantasy.jsx`) | NFL Research Fantasy was reviewed; it does not cover FEPL | Matchup, Standings, Rosters, Insights and permitted source/read states |
| 5 | Other existing sport surfaces (`nba/NbaApp.jsx`, `Games.jsx`, `Bets.jsx`, `BetEditor.jsx`) | No NBA preview routes | Verify scope and existing source states, then cover the native views; do not add a new sport or infer deployed availability |

The EPL correction nine-state batch at
`d340a248cf0e6696ca83d68c46aa6398ffb27ff1` was approved in both themes by Sean:
"Looks good in both themes. Continue with the next mockups." Its actual
Community authorization, source completeness, cancellation and refresh behavior
remain separate from visual acceptance.

## Areas requiring reconciliation before declaring the first project finished

- Account History: compare the native `me/History.jsx`, changes, older records
  and bet-history views with the approved Play score/history and Bets previews.
  Their approval does not automatically cover every account-history panel.
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
