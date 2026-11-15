# Parlay Lab — functional research baseline (2026-11-15)

Bets → Research includes an NFL player-prop board, an experimental projection
center, descriptive position-versus-defense rankings, and bounded 2–3-leg research
ideas. It never places wagers. The approved concept's sample values, ranks,
portraits and probabilities are not production data.

## Actual data and method

The existing hourly research-data build additionally downloads the current
nflverse player-week stats, weekly rosters and schedule through the existing
free-source reader. It checks published SHA-256 and byte length; receipts retain
source URLs, update/retrieval times and a canonical schedule fingerprint. The
public summary contains no account data or sportsbook quotes. Five initial
statistics: passing yards, rushing yards, receiving yards, receptions and carries.

An active, explicitly identified weekly roster player can receive a baseline
from at least five prior recorded appearances. The estimate is the mean of the
last eight (or available five to seven). Historical MAE/bias use rolling-origin
holdouts trained only on earlier available appearances. Missing games are never
zeros. Current final data can contain later stat revisions: this is retrospective
chronological evaluation, not point-in-time live validation. It is not injury-,
role-, opponent- or price-adjusted. No calibrated win probability or model edge
is claimed. Empirical signed-residual ranges are withheld below20 holdouts;
even when available, they are not advertised as calibrated coverage.

Matchup rankings sum a position's recorded stat per defense-game, then rank mean
allowance highest first (ties share rank). Season and last-five calendar-game
views require at least three covered games. A covered position-game requires
both team stat rows, known identities/positions and explicit valid stat rows for
all source-listed ACT roster teammates at that position. Missing or conflicting
rows/finals remain gaps, not zeros or replaced with older games. This certifies
the source-listed roster sample, not absolute publisher completeness. Rankings
are descriptive, not opponent/pace-adjusted or a claim of favorable betting value.

Both game reveal gates, exact week/kickoff identity, fresh existing research
history and matching canonical schedule are required at the API boundary. Source
receipts must have been checked within one hour before summary generation;
summaries expire after24h or at kickoff. The browser also clears them at those
boundaries. Current stats/roster hashes are not independently refetched on every
page read. Quotes retain their separate existing one-hour expiry. Baseline-market
gaps are not promoted into green assessments or automated parlay recommendations.

## Ideas and UI

The research board shows supporting evidence, sample and counterevidence, quote
time and source details. Category filters also scope combinations. Forecasts have
position filtering and six-card pagination; other sections show up to six cards.
Rank denominator, covered/selected games and missing-game counts stay visible.

Ideas require sourced eligible support, current pregame individual quotes, no
eligible opposing claim/conflict, the same book and different games/players.
They use only retained best quotes, so coverage is incomplete. Combined ticket
availability, combined odds, payout, probability and expected value are not
invented. No combination persistence or automated wagering is implemented.

## Verification and release scope

Live verified2026 source inputs produced14 upcoming targets,337 players,
971 player-stat entries,752 available baselines,756 season-ranked and452 last-five
ranked entries. No empirical intervals qualified. A complete research-release
build succeeded; the final gated current-week artifact returned13 games with
752 baselines and756 ranked entries, compressed season file531,532 bytes.
These counts are a dated build check, not a promise of persistent live coverage.

Pure model, aggregation, CSV integration, source/reveal/expiry boundary and UI
render tests cover the new flow. Typecheck, cloud build, bundle privacy scan and
Brand QA passed during development. Required hosted CI on the final commit is
still the merge gate. Local full Node suite was not green (SQL worker failures);
local Chromium cannot start due denied sockets, and the alternate headless-shell
archive download failed. Mobile/interactive acceptance therefore awaits hosted
browser tests, not a claimed local screenshot review.

Release needs the existing research data refresh plus backward-compatible API
and frontend. No migration, paid provider, provider quota increase or secrets
change. Follow the protected release-captain workflow and verify final production
assets. A PR merge is not deployment. Earlier PR scaffolding was superseded by
this functional baseline; model limitations above remain intentional.
