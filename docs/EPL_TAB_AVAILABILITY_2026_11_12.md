# EPL Play, Bets and Research availability — November 12, 2026

Owner: Sean Balsiger · Version 1 · Status: MW11 data repaired live; frontend changes awaiting release

Sean reported that **Bets, Research and Play** looked closed or empty. This is a
follow-up to the shipped three-way guesses, recommendations, score import and
weekly winner features, not a replacement for them.

## Findings

- **Play:** MW11 opened with an empty November 11–18 UTC fixture window and a
  placeholder deadline at its end. The international break put the next round
  outside that window. The fixture collector could not load any matches; the
  verified-price gate correctly stayed closed. The signed-in Home showed
  “Moneyline guessing isn’t available this week.” This was reproduced before repair.
- **Bets:** the read endpoint succeeded, but recommendations require the viewer's
  locked guesses on upcoming fixtures and a favorable market gap. An empty current
  week cannot produce those recommendations. Trends remain supporting context;
  the gap remains the leading indicator.
- **Research:** the saved snapshot at `2026-11-12T00:04:03Z` contained eight rosters,
  all eight with starters and season totals, plus 147 players and a projections
  array. Matchup was the default section even though there was insufficient saved
  repeating-schedule evidence to verify an opponent. Successful reads do not imply
  that every historical statistic or opponent is available.

The [Premier League's November schedule](https://www.premierleague.com/en/news/4725574)
places this round on November 21–23, with the first kickoff November 21 at
12:30 UTC (4:30 AM Pacific). Its
[international-break notice](https://www.premierleague.com/en/news/4689113/when-are-the-international-breaks-for-202627)
identifies the November 9–17 break. Both were checked November 12 UTC.

## Live data correction

The guarded [one-time SQL](../supabase/admin/epl_mw11_international_break_2026_11_11.sql)
ran through the existing `gtl_epl_set_week_window` writer. Before writing, it required
the exact untouched, open, unseeded MW11, no fixtures/picks/guesses in that week, a
future deadline and the expected preservation hash. It changed only:

| Field | Before | After (UTC) |
| --- | --- | --- |
| `window_end` | November 18, 00:00 | November 25, 00:00 |
| `first_kickoff` | November 18, 00:00 (placeholder) | November 21, 12:30 |

The November 11 start and Wednesday boundary convention remain. This is an applied
data repair, not a schema migration; do not replay it. Its preconditions now fail.

The SHA-256 covering all picks/history, guesses/history, queues, bonuses and weeks
(excluding only these two MW11 fields) matched before and after the transaction,
and again after fixture collection:
`6e3418768633ea1c64282ce160fda9150c16c985248480ba0639781db6b9bfb5`.
This also covers the stored draft order. No raw player rows are published here.

Existing enabled jobs were dispatched through their normal capability and budget guards:

| Job | Run ID | Verified result |
| --- | --- | --- |
| `fixtures` | `6f7b954f-604d-483b-aed1-4f1e63a7d570` | Success; 10 fixtures, 20 prices, no unknown teams or postponements |
| `dnb-check` | `8f0be627-5929-4129-bb92-818062e15c33` | Success at 01:10:28 UTC; 3 events; `dnbAvailable: true` |

The two runs used four free-tier credits in total; 348 remained, above the existing
50-credit reserve. Readback confirmed `gtl_epl_moneyline_gate(2026,11) = true` and
10 fixtures, including a fresh recheck on November 12 Pacific. No price gate,
deadline enforcement, permissions, cron or collection budget was weakened. API
logs showed successful EPL reads and no 5xx in the inspected interval. Health
advisors returned no findings; existing unrelated security/performance advisories
were left unchanged.

## Frontend follow-up

Play and Home distinguish missing fixtures from prices awaiting verification.
Play omits meaningless “0 of 0” progress. Bets distinguishes unpriced locked
guesses from checked guesses with no favorable gap, and offers a route to guessing
or manager linking. Research initially opens populated Standings when Matchup lacks
a verified opponent; explicit section choices still work, including Matchup.
These changes reuse the current Prism components and do not alter betting/scoring rules.

Verification and release status are recorded in the completion register. The live
data correction does not require a frontend deployment. The new copy, shortcuts and
Research landing behavior require the separate frontend release workflow. No new
API, worker or migration is required. Future break-window corrections still use
the existing commissioner workflow; this change does not implement automatic
calendar repair. Physical-iPhone acceptance and a post-repair signed-in UI check
remain outstanding.
