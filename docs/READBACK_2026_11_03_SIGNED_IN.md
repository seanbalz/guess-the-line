# Signed-in production readback — November 3, 2026

Owner: Sean Balsiger · Version 1 · November 3, 2026

Sean asked for the signed-in checks the truth pass left open: "go ahead using chrome browser mcp on mac mini". Read
only, from 20:40 to 20:55 UTC, in the Mac mini's Chrome. Nothing was saved, locked, placed, checked or fetched.

- **Browser:** the Mac mini Chrome: macOS, a 1920×1080 screen, signed in as the commissioner account "Fistathon".
  Of the four connected macOS browsers, two were signed out, and a signed-in 1408×881 laptop was not used.
- **Width:** the desktop window. The app is one centered column at most 520px wide. Light and Dark at 320 and 390px,
  and a real iPhone, were not checked here.
- **Build:** live bundle `index-DwWmNaHc.js`, from the frontend at `134f17c8`
  ([release record](RELEASE_2026_11_03_OVERHAUL_STEP0.md)).

## Results

| Screen | What was read | Result |
| --- | --- | --- |
| Home | Week 9; Spread and Total each 15 locked; both ranks #1; 8 active tickets; Week 8 awards | Pass |
| Play › Your guesses (D-70) | One card of 15 game tiles, "15 of 15 locked"; 71 words, 1,256px tall (the Total ballot was 9,043px before D-70) | Pass |
| Bets › My bets (D-72) | 10 collapsed Roomy previews, 32px between tickets | Pass |
| Bets › Virtual Units › Your picks (D-67) | Week 9 prices from three books, "0 of 3 bets"; no price tapped | Pass |
| Research › Games | 15 games, "Quotes updated Mon Nov 2, 2026 · 10:14 PM PT" | Pass |
| Research › Trends | 15 games, "Historical evidence ready · Nov 3, 2026" | Pass, with a wording note |
| Research › Fantasy | Week 9 PPR rankings, 390 players, "Updated Nov 3, 10:11 AM PST" | Pass |
| Menu › Commissioner tools › Odds connection | Free-quota rules, "12-hour refresh enabled", both buttons shown; neither pressed | Pass |
| D-69 step 0 tab fade | `.gx-main` carried `data-tab-enter="fade"` after a tab change | Pass |
| Bets › Research recommendations (D-73) | See the defect below | **Fails on a cold load** |

No console errors on the last load. API replies were 200 except the defect below.

## Defect: Research recommendations hits the Edge CPU limit

On a fresh page load of `#bets/research`, `POST /lines/assessments` failed twice in a row, and the screen showed
"Research is unavailable right now." with "Retry research".

- **First call:** the browser recorded 503 after about 1 second. No hosted log line exists for it.
- **Second call:** 546 after 2,050ms. The hosted logs record `POST | 546 | …/gtl-api/lines/assessments` and
  "CPU Time exceeded" at 20:53:58 UTC.
- **Earlier:** a load at 20:52 also saw two unlogged 503s.
- **Later loads:** warm loads at 20:49:49, 20:50:12 and 20:52:38 returned 200 and showed 20 assessed bets, all gray
  "Insufficient evidence".
- **Last 24 hours (all players):** `/lines/assessments` logged 15 × 200, 1 × 546 (this check) and 50 × 401 (the
  signed-out boundary probes).

It is the same failure class as the October 22 `/trends/week` release: an Edge Function is capped at about 2 seconds
of CPU per request. The route is in `cloud/lines.mjs`. The cause has not been looked into yet.

## Wording note: Trends › This Week top-trend tiles

A tile reads "NYG @ PHI · Missing the spread badly this season · PHI 388–310–14". The record is the trend's history
since 2002 (712 games, 55.6%), not PHI's season. The opened card says "since 2002"; the tile does not.

## Not verified

- Light and Dark at 320 and 390px, and a real iPhone.
- Any write path: lock-in, save, a Virtual Units bet, an odds check or fetch.
