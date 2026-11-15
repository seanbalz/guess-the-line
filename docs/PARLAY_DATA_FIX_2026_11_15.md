# Parlay data repair: local implementation, not deployment

- Read retained current NFL per-book captures for revealed, unstarted games independently of imported editorial candidates. No page-triggered provider requests, paid subscriptions, new permissions, migrations or feature-flag changes.
- Successful empty latest captures withdraw older offers; one-hour prop freshness and exact player/stat/unit/event matching remain enforced. Both game reveal gates are required. Bounded capture reads fail closed rather than returning a partial older capture.
- Preserve all current same-selection bookmaker offers; retain best individual quote for compatibility. A parlay may use a shared book even when that book is not each leg's individual best price.
- Join verified baseline research to offer-driven candidates using stable identity, not player name. Research-lean rationale describes the historical appearance mean relative to this line, never a calibrated edge or forecast. Missing baseline or exact sample-period provenance leaves a priced offer visible but unendorsed.
- Add exact training-period provenance to freshly generated baseline snapshots. **A research refresh from this source is required before older snapshots can produce these new baseline leans.**
- Ticket ideas include per-leg source-backed statements and material risks. Research completeness orders the shortlist; it is not a win-probability or value ranking. Same-game/same-player legs are excluded. No multiplication of single-leg odds or probabilities.
- Candidate capacity is 500 total, shared with other assessment markets. Round-robin game selection avoids filling capacity with only the first game; coverage reports truncation. This is a bounded shortlist, not all-market inventory.

## Acceptance still required

Fresh retained bookmaker captures must be independently verified in production. The current collector's operational state and remaining free budget are not established by code changes. Do not report live lines or populated recommendations until a signed-in revealed-game read confirms current named-book offers and a source-backed ticket. Existing manual release gates and migration exclusions remain in force.

## Local checks

Targeted research/prop suite: 240 tests, 212 passed, 28 skipped, zero failed (before final coverage additions). New offer pipeline and parlay tests pass. Typecheck passes. Integration owner must rerun final aggregate checks and UI acceptance after merging this branch.
