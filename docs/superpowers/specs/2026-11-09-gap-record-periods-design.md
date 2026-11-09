# Gap record periods — approved design

Sean approved the dark/light mockup on November 9, 2026 after requesting the
recommended All time, This season and Custom range filters. The existing Week
view remains the default. This approval covers the record controls, not a new
recommendation layout or scoring rule.

The Gap record gets a Record period selector with Week, This season, All time
and Custom range. Custom exposes From/To published season-week choices and an
Apply range button. It includes both endpoints and can cross seasons. This season
means the latest published season. All time means all retained published weeks
advertised by the signed-in account reader. The recommendation Week selector
continues to control recommendations independently.

Use the existing authenticated lines/read API for the selected weeks, at most
three requests concurrently, with cancellation on scope/account changes. Reuse
the already loaded displayed-week board. Do not add provider calls, endpoints,
migrations, writers or permissions. Do not persist private records in browser
storage. A failed week must produce an error and Retry, never a partial total
labelled All time. Preserve missing closing-line/final states as ungraded counts.

Combine game rows with season/week-qualified identities, sort by kickoff and run
the existing D-77 gapRecord function over that combined board. Wins divided by
wins plus losses defines win rate. Pushes remain in W–L–P and paper ROI, outside
the win-rate denominator. Even guesses, drafts and sit-outs retain existing
exclusions. Market and 10%+ filters apply to the entire chosen period. Every game
detail identifies its own season/week; repeated matchup IDs cannot collide.

Use approved Prism tokens, native labelled selects, 44px controls and the existing
ring/card/chart. Preserve navigation, scroll restoration and recommendation writes.
Loading/error states replace old-period numbers. Invalid/reversed ranges show a
clear validation message without fetching. A period with no eligible weeks/gaps
has an explicit empty state. No actual-phone acceptance is inferred from emulation.

Verification covers weighted arithmetic, pushes, duplicate matchup IDs across
weeks/seasons, range bounds, market/tier filters, errors/cancellation/account
changes and mobile controls in both themes. Publish exact source/CI and protected
frontend-only release evidence separately from local implementation.
