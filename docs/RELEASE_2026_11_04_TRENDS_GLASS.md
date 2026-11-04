# Trends glass tiles frontend release (D-75) — November 4, 2026 (UTC)

Owner: Sean Balsiger · Version 1

- **When:** released November 4, 2026 at 01:06 UTC (November 3, 5:06 PM PST).
- **What:** **frontend only**, from `main` at `472acf89486e7ebc5d80e7667c26a349ca342220`. That is the merge of PR #463
  (`b608d521`) plus #467, a docs record. #467 landing cancelled the Dashboard run for `b608d521`, so the release used
  the newest green main.
- **Approvals, all on November 3:**
  - Sean said "Looks good, release" on the 390px Light and Dark captures of the built screens.
  - He said "Yes, include them" for the two smaller frontend changes below.
  - He approved both `production` gates in GitHub himself.
- **Release card:** [issue #469](https://github.com/seanbalz/guess-the-line/issues/469).
- **Not changed:** no API, SQL, migration, Edge Function or worker.

## What shipped (frontend changes since live source `4cf149e7`)

- **D-75 Trends tiles and chart (PR #463).**
  - Every trend tile is glass, with one win rate (W/(W+L), one decimal) and "N games · since YYYY".
  - This Week leads with the strongest trend as a hero, then two tiles and "All N trends this week" (`weekList=all`).
  - A team shows its two strongest trends with the rest folded in place.
  - The Teams landing tiles are glass.
  - An opened trend is one glass chart card; its tier, sentence and conditions sit behind ⓘ.
  - See the [decision](DECISIONS.md) and the [spec](superpowers/specs/2026-11-03-trends-glass-tiles-design.md).
- **D-74 book label (PR #452):** "BetRivers" in the book names, and "Standing in for FanDuel" under BetRivers in a
  game's book lines. The server half went out earlier in `gtl-api` v50.
- **EPL bonus wording (PR #421):** the draft label, the review note and the Standings note now say the Pick a Team
  bonuses are added in Sleeper. That matches the v50 scoring, which no longer adds them again.

## Gates

| Gate | Run | Result |
| --- | --- | --- |
| Exact-source CI on `472acf89` | Tests [41746981790](https://github.com/seanbalz/guess-the-line/actions/runs/41746981790), Dashboard with Persona and 4 browser shards [41746981697](https://github.com/seanbalz/guess-the-line/actions/runs/41746981697), Brand QA [41746981729](https://github.com/seanbalz/guess-the-line/actions/runs/41746981729) | All passed |
| Check-only | [41748602402](https://github.com/seanbalz/guess-the-line/actions/runs/41748602402) | Passed |
| Readiness | [41748653297](https://github.com/seanbalz/guess-the-line/actions/runs/41748653297) | Passed |
| Deploy | [41749126731](https://github.com/seanbalz/guess-the-line/actions/runs/41749126731) | Frontend deployed; verify passed at 01:06:24 UTC |

Readiness reported:
- **Migrations:** 76 hosted rows, digest `d40fdad9eb144738cdbd032e3c95ba433b4cb1606f3de3ab8079f0df1b8108f1`. Only M-33,
  M-34 and M-35 (`20261029151727`, `20261029161613`, `20261029162144`) are pending.
- **Schedule:** no time restrictions.
- **Boundaries:** 457 checked, 438 denied, 19 awaiting the EPL migrations.

## What is live

- **Frontend:** Pages **`5fe72e52-9211-4734-96f3-f67d47ce88dd`**. All 129 assets at the production URL matched the build
  (frontend SHA-256 `1d6875283cf5411294f19e6b51915a8065bbbf18822f74d4cc04868d01d5617e`). The previous Pages was
  `06129739-8c5c-4186-b270-bc739637c9d4`, from `4cf149e7`.
- **API:** `gtl-api` v50, unchanged.
- **Migrations:** 76 hosted rows, digest `d40fdad9…`, unchanged.

## Signed-in readback (Mac mini Chrome, 01:07–01:10 UTC, read only)

The served bundle was `index-BRL9B_ie.js`. Nothing was saved, locked or placed.

- **This Week:**
  - The hero showed "NYG @ PHI · Missing the spread badly this season · PHI", 55.6%, "win rate · 712 games · since
    2002", with its line.
  - Two tiles followed: HOU @ LAC 55.6% and JAX @ BAL 54.8%.
  - Then came "All 12 trends this week" and 15 glass game tiles, with no meters.
  - The trends took about 14 seconds to appear after a fresh reload; before that, the loading placeholders showed.
- **All trends:** the address was `weekList=all`, the heading "All trends", with the lip "Back to This week", the meta
  "12 trends · strongest first" and 12 glass tiles.
- **One trend:**
  - Lips "Back to This week" and "Back to NYG @ PHI".
  - The chart card showed 55.6%, "win rate since 2002", 388–310–14 and "+42.7 U at −110".
  - The line's label was "Cumulative units at −110: +42.7 after 712 games since 2002".
  - No pills; the ⓘ was present.
- **Teams:** 30 glass team tiles (for example "ARI · Road · 51.3% · 204 games") under "Covers at this week's venue ·
  since 2002", with no meters.
- **Carolina Panthers:**
  - The two strongest trends showed: "Underdog the market re-rated down · CAR" 52.8% and "CAR as the favorite: ATS"
    45.6%.
  - "11 more CAR trends" opened 13 tiles in place: `aria-expanded` went to true and its `aria-controls` target exists.
  - No sideways scroll and no console errors.
- **Hosted logs since 01:04 UTC:**
  - `gtl-api` returned 7 signed-in 200s and 324 signed-out 401s (the deploy's boundary probes).
  - No 5xx, and no "CPU Time exceeded" in `function_logs`.

## Not verified

- A real iPhone check, the 320px width in production, and Light mode in production. Light and 320px were covered
  locally by the browser specs and captures.
- The D-74 "Standing in for FanDuel" label in production. It shows only when a selected book is missing from a game.
- The EPL wording in production. It wasn't opened in this readback.

## Small finding

After a layer closes, the address can keep an empty `weekList=` (or `teamsTrend=`). It is harmless, because an empty
value opens no layer, but it is untidy.

## Rollback

Redeploy the frontend from `4cf149e7c4361547647db3573651fcd57204e36d` (Pages `06129739`) through the protected workflow.
No data needs restoring.
