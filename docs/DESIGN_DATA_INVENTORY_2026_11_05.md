# Existing research and charts: redesign source of truth

Owner: Sean Balsiger · November 5, 2026

Sean challenged the empty states in the standalone design mockup: GTL already
has substantial research data and developed charts. The mockup is disconnected
from the real app readers and uses a fictional matchup; its absent fixture
history is not evidence that production has no data. The two-tab layout was
accepted in principle, but its sparse content is unrepresentative and needs
replacement using the existing app's populated screens and components.

## Verified source and publication

- Task checkout: `codex/owner-acceptance-2026-11-04`, starting head
  `9d7e1ce1153f9aa337e77be01853326a97cba75f`.
- Fetched main: `7604cee25f4182d7c5262217c05f20d84b2994e3`.
- The [public research index](https://github.com/seanbalz/guess-the-line/releases/download/research-data-2026/index.json)
  reports build `2026-11-05T22:43:15.728Z` (November 5, 2:43 PM Pacific), latest
  completed source date November 2, and six periods: recent30, recent25, season,
  previousSeason, rolling12 and all.
- The current season asset contains 750 registered candidates and 272 public
  matchup-statistics entries. These are catalogue/precomputed counts, not claims
  that every entry is applicable, accessible or qualifying for the current user.
- The actual shared index/snapshot validators passed against downloaded public
  files, and the compressed season asset matched its index SHA-256:
  `579f59616c4e51b678fe3f180fea3730995cc2aac73a76c59cf7ad2a8f3dda41`.
- The last four inspected refresh runs succeeded. Latest:
  [42123840825](https://github.com/seanbalz/guess-the-line/actions/runs/42123840825).
  The workflow schedules hourly opportunities; actual runs can be delayed.
- [November 2 signed-in acceptance](RESEARCH_ACCEPTANCE_2026_11_02.md) records
  populated current-build research, statistics links and qualitative evidence.
  This audit did not perform a new signed-in production read or verify every
  current quote, feed, account or physical-device state.

## Existing capabilities to preserve

| Area | Existing implementation |
| --- | --- |
| Game markets | Independent Spread/Total access, current/latest stored consensus, named-book comparisons, observation times, recorded movement charts and matching tables, kickoff markers, pointer/keyboard selection. `web/src/next/lines/MarketDetails.jsx`, `useGameLines.js`; [market details](RESEARCH_MARKET_DETAILS_2026_10_26.md). |
| Historical trends | ATS and over/under records, hit rates, sample sizes, multiple evidence periods, cumulative charts, season stems, selectable seasons, linked tables, touch/keyboard tooltips. `web/src/next/charts/TrendDetail.jsx`, `TrendLine.jsx`, `SeasonStems.jsx`, `SeasonTable.jsx`; `shared/trends*.mjs`. |
| Team performance | Overall/home/road records, points scored and allowed per game, last-five results, margins and season game lists. `web/src/next/teams/teamModel.js`, `TeamView.jsx`, `MarginChart.jsx`. |
| Matchup evidence and assessments | Weekly shortlists, situational research, consistent/emerging patterns, supporting/opposing evidence, source dates, coverage and qualification. `web/src/next/research/ResearchView.jsx`, `ResearchCards.jsx`, `Assessments.jsx`. |
| Play statistics | Observed pass/run success, passing yards per attempt, rushing yards per carry and sacks, with sample/definition/source context. `shared/research-play-statistics.mjs`; free nflverse completed plays. |
| Player guess analysis | Saved-reference accuracy, bias, team splits and differing result definitions, with account/reveal scoping. `web/src/next/trends/PlayersNest.jsx`, `PlayerEvidence.jsx`. |
| Fantasy | Player usage, points, season/recent comparisons, player comparisons and weekly estimate report cards against recorded results/baselines. `web/src/next/fantasy/FantasyTools.jsx`, `FantasyReport.jsx`, `fantasyReport.js`. |

## Corrected design direction

Keep the approved colors, G, glass finish, individual logo tiles, compact headers,
icons and Appearance design. Restyle the existing information architecture and
chart components rather than replacing them with generic charts, unrelated
historical examples or default empty cards. Use real, permitted populated app
states or verified public fixtures representative of those readers. Never copy
unrevealed/private picks or gated sportsbook values into public mockup assets.

Distinguish real access locks, stale data, failed reads, source-specific gaps and
missing fixtures; they are not the same as an empty application. Preserve the
existing freshness/qualification and reveal gates. A current quote feed is
separate from the free completed-game research publication; success of the
public research workflow does not prove every current-market observation.

The sparse game research mockup is not approved as a content inventory. Next
mockups must show the existing richer research/chart capabilities using the
approved visual language. This audit changed no production code, data, secrets,
refresh schedule, odds budget, release or parked Signal files.
