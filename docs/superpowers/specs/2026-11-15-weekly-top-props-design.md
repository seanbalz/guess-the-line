# Weekly top props

Sean's direction: replace the confusing Parlay Lab combinations and three-leg
limit with the top 20 individual props for the week. PR565's same-game release
request is stopped; its changes are not part of this branch.

Use one numbered, outlined list. Each place is one player/stat: identity and
matchup first, then separate Line and Price columns, the book and observed/expiry
times, a short sourced case and risk, expandable sources/book comparison and a
full-research action. Keep existing GTL Prism tokens and system type. Use
accent ink for the meaningful rank and individual price; no confidence badges,
portraits, win probabilities, model-edge scores or ticket decoration.

The ranked list is the implementation choice matching the request. Category
sections would fragment the weekly order. Prebuilt combinations were rejected
by Sean and are removed from this view. Category filters narrow the same twenty
and retain their weekly ranks. Projections and Matchups stay separate.

Rank already reveal-gated server assessments only. Require identified player
props, pregame quotes less than one hour old, sourced eligible support and no
opposing evidence/conflict. Order by supporting dataset count, sample coverage
(up to eight observations per dataset, forty total; duplicate dataset claims
count once), then quote recency and stable ID. This is research priority, not
win probability or expected profit. Collapse alternate lines, sides and books
by game/player/stat/unit. Choose the best current individual price for the
selected line. Stop at twenty; never pad missing data.

Preserve API, migration, flag and quota boundaries. No new collection: the
one-time six credits were consumed by run 43741373546. Keep the existing route
for old links, but call the user-facing destination Weekly props. Test ranking,
expiry, deduplication, conflict refusal and responsive source/filter interactions
at 320/390/1440 px in light and dark. Hosted release requires its own passing
exact-SHA CI and protected check-only/readiness/deploy sequence.
