# Weekly and player Trends design

Owner: Sean Balsiger · Approved in chat October 21, 2026 · Status: implementation authorized; no hosted release claimed.

## Approved experience

A top-level Trends tab contains This Week, Teams and Players. Trends are available when the published week opens for guesses, including Monday before the preceding Monday game has finished. Pending facts are labelled and refreshed. Every game sheet places weather immediately before two or three trend highlights and All trends. Recent and longer histories are shown together: last 5 / last 10 qualifying games, current season, last 3 / last 5 seasons and all available history. Date range, sample size, coverage and source times accompany results. Existing quality tiers determine matchup highlights; a hot streak does not establish an edge.

Players separates guessing the market accurately from the result of disagreeing with it. Spread and Total are independent. Filters include player, team, season/window and matchup. Charts show signed bias, accuracy over weeks, guess distributions and cover performance. Every insight expands to the actual contributing games. Community sentiment means only permitted GTL guesses; it is not a sportsbook money/ticket split or proof of sharp support.

## Meaning of player observations

Use each eligible locked guess and its immutable saved scoring reference. Do not replace references with closing or newer lines. Own unlocked drafts are not observations; a locked game remains eligible even when the rest of its ballot is still a draft. Missing/pending/ineligible/hidden entries are not zero. Deduplicate by user, season, week, game and market. For spreads the stored line is signed home: home strength gap = market home spread minus guessed home spread; away strength gap reverses that sign. A positive strength gap favors that team relative to the reference. For totals, guess minus reference above zero favors Over; below zero favors Under. Zero has no directional pick.

With Panthers -7 versus saved Panthers -3.5, the implied Carolina gap is +3.5. A five-point win is a straight-up win and market cover but a miss at the guessed spread. A seven-point win pushes the guessed spread. Keep market cover, cover at guessed line, straight-up result and absolute error to the realized margin/total distinct. Hypothetical directional records are not recorded wagers or profit; no ROI without actual price/stake evidence. Points and official standings are untouched.

Insights are descriptive. A recurring label requires at least five decided directional games over at least three competition weeks; fewer remain visible as a small sample. Show exact W-L-P and a Wilson interval, not an invented confidence or prediction. Separate recent/earlier evidence and qualify conflicting windows. No claim that a market has failed to adjust, that a player has predictive skill, or that fading is profitable is inferred from a selected historical slice. Both agreeing and opposing the guess can be inspected symmetrically. Proposed thresholds are transparent implementation defaults, not validated statistical significance thresholds.

## Privacy and scope

Historical public matchup facts can show before a guess. Current market-line-dependent cards and other players' current guesses follow D-39 independently by game and market. Aggregates, distributions, rankings, text, chart metadata and exports must not reveal hidden contributions. Use server-authorized history, then enforce its gate again before calculation. All selection data stays in authenticated responses, never generated assets. Account/league changes clear previous data synchronously. Private-league views use the existing roster-scoped comparison reader and fail closed when unavailable; never substitute Community data.

## Data and availability

Reuse the pure situational engine, frozen registry, corrections, venues and public historical records. An authenticated read route can assemble a published week's trends on demand, with allowPending, a bounded cache and single-flight refresh; no migration or odds collection is required. Generate an importable server-only seed from existing public data for Deno's API deployment path (avoid requiring Docker/static-file deployment). Fetch only the existing permitted nflverse schedule URL with bounded timeout/size and strict validation. Retain original registry calibration; no promotions or new hypothesis search. Frozen committed week files remain unchanged. Refresh uses current-season finals only; upcoming lines/weather/officials are redacted before calculation. A seed fallback is dated and explicitly stale. Do not claim a forecast exists before the approved weather window.

The player view uses /community/history in Community and /league/comparison in a private league. Available seasons, not guessed years, bound multi-season reads; failed historical reads fail the requested view rather than silently reducing its sample. Missing private comparison RPC is a visible unavailable state until the separately documented migration is released.

## Presentation and acceptance

Use BRAND_GUIDE D-38 and tokens-next, semantic labelled charts with accessible tables, touch targets >=44px, 320px minimum viewport, light/dark themes and reduced motion. Navigation must keep all seven destinations reachable without shrinking targets. Preserve legacy records and old routes. Check Monday readiness, missing source, expired cache, errors/retry, both spread orientations, pushes/ties, totals, repeated observations, cross-season filters, hidden sentinels, private scope, account switching and focus/back behavior. Run brand, engine, API, UI and cloud-browser tests plus build and source-boundary audit. Commit named files, push, open PR and sync-check. Deployment and live acceptance need separate evidence.
