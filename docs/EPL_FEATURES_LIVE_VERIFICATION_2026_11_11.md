# Guess The Line — Premier League feature verification

Owner: Sean Balsiger · Version 1 · November 11, 2026 (Pacific)

Status: **implemented, merged and released; hosted capabilities checked again**.
This reconciles the November 9 feature request with subsequent releases. It records
read-only verification, not another deployment, migration apply or score import.

## Requested behavior and where to find it

| Feature | Delivered behavior | Source |
| --- | --- | --- |
| Optional three-way guessing | Premier League Play supports two-way draw-no-bet or three-way home/draw/away American prices. One outcome and price per match; market, outcome and price lock together. Both markets use the existing American-line distance leaderboard. | [PR #513](https://github.com/seanbalz/guess-the-line/pull/513) |
| Recommended bets | Premier League Bets compares the account's own locked guesses with the latest available same-market prices. Favorable gap alone ranks the recommendations. Stored price movement and concerns provide context without changing the ranking or the saved competition reference. | [PR #513](https://github.com/seanbalz/guess-the-line/pull/513) |
| Weekly fantasy scores | Menu › Commissioner tools › Premier League weekly scores reads Sleeper Matchups screenshots on the device. Review all eight managers before confirming. Lowest weekly score picks first, with lower season total breaking a tie. Confirmation opens or reorders an untouched next draft when the result prerequisites are met; existing selections remain protected. | [PR #515](https://github.com/seanbalz/guess-the-line/pull/515) |
| Pick a Team winner | Premier League Home and Pick a Team show the result after the week's required finals are verified, independently of the screenshot import. The job sends an opted-in result announcement and prevents duplicate delivery. Existing margin, tie and bonus rules remain. | [PR #512](https://github.com/seanbalz/guess-the-line/pull/512) |

Scores in an imported screenshot must already include the Pick a Team bonuses.
A confirmed import's order takes precedence over a later automatic correction
([D-83 decision](EPL_ORDER_PRECEDENCE_DECISION_2026-11-10.md)). The original user
screenshot and its scores are not included in this public verification record.

## Release evidence

The [November 10 release](RELEASE_2026_11_10_FINAL_BATCH.md) shipped the feature
code and jobs worker. The [M-41 to M-47 apply record](RELEASE_2026_11_10_MIGRATIONS_M41_M47.md)
records the three feature migrations and the later result-job enablement.
The [November 11 release](RELEASE_2026_11_11_STAT_CORRECTIONS_M33_M35.md) shipped
API v55 and the latest recorded Pages build, then applied M-33 to M-35.

These dated records supersede older statements that the feature migrations were
unapplied or the result schedule was disabled. This audit did not independently
repeat their frontend asset comparison or signed-in browser checks.

## Fresh hosted readback

Read through the GTL Supabase connection on November 12, 2026, at approximately
00:44–00:46 UTC (November 11 Pacific). Only aggregate counts, capability flags,
migration metadata and job receipts were queried; no saved picks were changed.

- The three-way capability reports `true`.
- M-42, M-43 and M-44 are present as hosted versions `20261110203759`,
  `20261110203856` and `20261110203957`, respectively. M-33 to M-35 are also
  present as `20261111171228`, `20261111171317` and `20261111171357`.
- `gtl-api` v55 and `gtl-epl-jobs` v4 are ACTIVE. API JWT verification is enabled.
  Function metadata matches the recorded release versions; metadata alone does
  not establish byte-for-byte API source verification.
- All eight existing EPL schedule rows are enabled: `dnb-check`, `fixtures`,
  `moneyline`, `nudge`, `resolve`, `results`, `settle` and `snapshot`.
- `gtl-epl-results` is active with cron `9-59/15 * * * *` (every 15 minutes).
- Its first announcement run, started November 11 at `00:09:00.020988Z`,
  succeeded for season 2026, week 10: two winners, one opted-in member,
  one push sent and zero failures. It used existing finals (`scored: 0`).
  The latest three result runs at 00:09, 00:24 and 00:39 UTC on November 12
  were safe `nothing_due` skips.
- There are zero confirmed screenshot imports. Therefore a real commissioner
  import and its resulting draft opening are not yet production acceptance evidence.

The send receipt records a successful push-service response, not proof that the
notification appeared on a physical phone. Winner publication depends on verified
final scores and bounded collection timing; it is not guaranteed at the final whistle.

## Local verification and preserved work

The fresh task worktree started from `origin/main` at
`cac63e7a0d10a38b4badc41c663a763b5301aee4`. The focused command
`node --test --test-reporter=tap tests/epl-three-way.test.mjs tests/epl-score-import.test.mjs tests/epl-results.test.mjs`
passed **38 tests, zero failures, zero skips**. These tests cover market lock
behavior, gap-only ranking, screenshot extraction/review ordering, verified-final
rules, collection limits and notification deduplication using test services.
They do not exercise a real uploaded screenshot or live account writes.

The earlier `codex/epl-features-2026-11-09` checkout has ten unpublished commits
and modified/untracked files at the inspection time. It was preserved untouched;
this audit's clean branch does not establish that the older checkout is synchronized.

Remaining acceptance: a commissioner-reviewed real screenshot import under M-35,
the resulting next draft/first-turn notice, and physical-phone presentation and
notification receipt. No additional product decision is needed to use the released features.

Sources: linked PRs and release records above; fresh hosted readback and focused
tests performed November 11, 2026 Pacific. This document changes no product rules.
