# Tracked bets Overview — November 2, 2026

Sean reported that the tracked-bet graph had disappeared and requested an
Overview tab with charts, bet types, filters and options. The existing graph
was inside Filters, with additional charts collapsed below the full ticket
list. The owner view now has visible Overview / Tickets controls, and the Bets
landing has an Overview destination that opens all weeks.

Overview shows the interactive cumulative net-units graph, record, ROI, win
rate, open risk, outcome distribution, single/parlay counts, markets per ticket
and sportsbook counts. Existing chart components and approved GTL tokens are
reused. Fewer than two settled eligible tickets retain an honest empty or
single-ticket state instead of inventing a trend line.

Week, bet type, market, result, team and record-inclusion filters use the
existing reader. Sportsbook and Pacific placement-date filters apply locally
to the reader's owner-only tracked entries; a missing placement date falls back
to the recording date. Invalid ranges show an error. Filtered cumulative points
are rebased from the matching tickets' net changes. The same subset appears in
Tickets, and tapping a type, outcome or sportsbook opens matching tickets.
Filters and the selected pane survive navigation within the app.

Every parlay counts once. Mixed-market parlays have one Mixed markets category;
the existing market filter still matches any leg. Excluded tickets remain
accessible but do not count in charts or performance. The shared accounting
core retains reported-return precedence, incomplete-return exclusions, and
pending/void ROI exclusions. Unknown open stakes are disclosed. Cash display
requires an explicit unit value and never rewrites saved units.

This is frontend-only. No schema, provider, grading rule, wager, profile entry,
guess, settlement, Fantasy opening schedule or saved ticket is changed. The
32px ticket gaps and inline ticket expansion remain in place. Shared and
Virtual Units views retain their existing access and reveal rules.

## Verification and release status

Local verification is in progress. The focused helper/token checks pass (22
tests), as do typecheck, the production build and all 649 component tests.
Browser checks cover populated/empty dashboards, owner isolation, accounting,
filter drill-down, cash display, keyboard chart selection, 320/390px layouts,
both themes, accessibility and no writes while exploring. Their final outcome
and the PR/merge evidence will be recorded after completion.

Deployment is separate under the repository's single-captain release train.
No production deployment or physical-phone acceptance is claimed here.
