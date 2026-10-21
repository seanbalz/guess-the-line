# Percentage ranked recommendations and compact Bets

Owner: Sean Balsiger · October 21, 2026 · Approved in conversation

## Outcome

Recommended ranks Spread and Total disagreements by relative size. Five points
against a 50-point total and one point against a 10-point spread both rank at
10%. A spread whose current consensus magnitude is below three points uses a
three-point denominator; the card explains this adjustment. The percentage is a
comparison of two lines, not a probability, predicted win rate or betting edge.
The point difference and quote age remain visible.

The Bets page keeps its three existing destinations and makes their purpose
clear: Recommended reviews discrepancies, Tracked bets records bets placed
elsewhere, and Virtual Units is play money. Recommended opens with the three
largest percentage differences. A compact, keyboard-accessible row shows
matchup, market, suggested side, percentage and point gap, quote age and one
sourced historical trend if available. Expansion shows both sides, current
consensus and book quote separately, multiple relevant historical records with
sample sizes and time coverage, and the existing Track / Virtual Units actions.
No trend is described as predictive. Unknown trend coverage is labeled as such.

## Data and presentation

The ranking uses the current accessible consensus value: absolute signed spread
or total. For spread, denominator is max(absolute consensus, 3); for total, the
positive consensus. Existing eligibility, lock, kickoff, current-week, quote
provenance and explicit betting review paths stay authoritative. The green,
yellow and red guidance uses relative 10% thresholds in both markets; every
color has a written label and the signed point comparison remains visible.

The existing same-origin nflverse trend-week loader supplies historical
records. It loads once when the recommendation list is shown, shares the Lines
cache, and only uses the matching season, week and game. The existing
`gameTrends` selector applies reveal gates and line-fit checks. A card with no
available historical record says so; no numbers are invented. The nflverse
credit and historical period accompany records. Trend data does not change
ranking or suggestion eligibility.

The current Week 7 needed a published trend file. Generate it from the verified
free nflverse schedule using a dated redacted season input, while retaining the
frozen Week 6 input and historical file. Tests reproduce each week from its own
preserved input and check that unplayed market lines remain absent.

Use existing GTL tokens and 44px touch targets. Keep labels and spacing readable
at 320 and 390px, in dark and light themes. Top-level navigation remains
visible while a recommendation is expanded. Preserve selected Virtual Units
terms and the review card when rankings refresh or kickoff closes a matchup.

## Checks

Unit tests cover equal relative gaps, total/spread ordering, pick'em and small
spreads, tie order, negative spreads, missing data and side guidance. Browser
checks cover the compact list, disclosure, historical data states, quote detail,
tracking and Virtual Units review, keyboard navigation and phone widths. Run
typecheck, automated tests, build, brand QA and sync checks. Record the branch
and PR as local or review work in the completion register; a PR is not a hosted
release.
