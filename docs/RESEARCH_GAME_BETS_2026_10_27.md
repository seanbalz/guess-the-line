# Research League bets sheet — October 27, 2026

Owner: Codex · Source batch for approved redesign stage 34.

[PR #245](https://github.com/seanbalz/guess-the-lines-repo/pull/245), branch
`codex/research-game-bets`: published for CI/review; merge and release pending.

The game action bar now includes **League bets**, supplied by the Bets slot.
It opens the selected matchup's Virtual Units picks for the Community or the
private league selected in the header. The shared Bets rows show each person's
side and units, with the viewer's own picks in full. Friends' saved lines,
prices, books and results remain behind the existing per-game, per-market gate.
The sheet uses existing GTL tokens, sheet navigation and focus return.

## Reader and privacy boundaries

- Uses the existing M-10 `POST /bets/read`, with explicit season/week and the
  selected private league ID. This endpoint returns the week; the sheet projects
  only the selected game and returned roster. It adds no endpoint or migration.
- Reads start when the sheet opens, never from the game action bar or board.
  Pending private-league resolution makes no Community fallback request.
- Changing account, game, week, league or personal access data invalidates the
  reply. Abort and generation guards discard old requests. Refresh clears old
  rows immediately; failures and mismatched replies show Retry without old terms.
- Focus, visibility, reconnect and the selected game's next kickoff trigger a
  fresh read. There is no interval polling or cross-scope cache.
- Server gates remain authoritative. Even a malformed reply carrying friends'
  closed-market terms cannot display them. Roster filtering applies to picks
  and avatars; an unavailable private league never falls back to Community.
- The sheet links a closed market to the existing Play ballot for this game and
  week. Opening or browsing it never places a bet, submits a guess or sits out.
  Saved terms are not labeled as current sportsbook offers.

## Validation

- 43 integrated Research/Lines/Trends/Bets browser tests passed, plus four final
  focused League bets cases, including delayed replies across an account switch.
- 24 component tests and 42 model/Everyone/shell/token tests passed.
- Typecheck, Brand QA, fixture production build, bundle privacy scan and
  `git diff --check` passed.
- Inspected Light/Dark 320px screenshots. Browser checks cover on-demand reads,
  explicit week/league, game filtering, private-roster membership, friend-term
  secrecy, own-pick visibility, failure/retry, wrong-week replies, abandoned
  requests, empty states, focus return, the Play target and no browsing writes.
- An initial test used the visible button label instead of its full accessible
  name; the test now targets the existing game-specific accessible name.

All fixtures use local PGlite and fictional accounts. These checks do not
establish hosted or real-phone acceptance. CI/merge and release remain separate.

## Remaining work

This supplies stage 34's League bets destination through the existing M-10
reader. Bet placement and Challenge slots still depend on their own approved
stages (44 and 54). Stage 31's direct reveal/sit-out confirmation, stage 33's
direct confirmation and remaining live-status evidence, hosted readback and
physical-iPhone acceptance remain open. The task register and platform queue
keep those checkpoints separate from source implementation.

No API/schema, scoring, data-collection, production deployment, migration apply
or real-player write is part of this batch. The frozen v62 tracker is unchanged.

Prerequisite PR #243 merged October 27 as `f5a9551bd2c7d5e9a1d617dee54445c3da499f11` after
all nine checks passed on `4dfb665a259ba98220d2ad6be48a708b468507b2`, with no CI fixes or
review findings. This follow-up has its own CI/merge and release checkpoints.
