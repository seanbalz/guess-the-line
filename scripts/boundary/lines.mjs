// Boundary probes for lines and game facts: odds collection, market snapshots, the scheduled refresh,
// game referees, the kickoff wind forecast and the redesign's gated lines readers (M-06). Joined by
// scripts/check-cloud-boundary.mjs (see guess.mjs).
import { missingId, missingLeague } from './fixtures.mjs';

export const tables = Object.freeze(['odds_budget', 'odds_collections', 'market_snapshots', 'odds_schedule', 'odds_refresh_runs', 'research_submissions', 'research_snapshots', 'research_quote_fetches']);

export const rpcChecks = Object.freeze([
  ['gtl_submit_research_link', { p_user: missingId, p_request: missingId, p_url: 'https://x.com/rotobot_ai/status/1' }],
  ['gtl_read_research_submissions', { p_user: missingId }],
  ['gtl_publish_research_snapshot', { p_id: missingId, p_payload: {} }],
  ['gtl_read_research_snapshot', { p_season: 2026, p_week: 8 }],
  ['gtl_read_research_quotes', { p_season: 2026, p_week: 8 }],
  ['gtl_begin_research_quotes', { p_request: missingId, p_season: 2026, p_week: 8, p_game: 'SEA-DEN', p_markets: ['player_reception_yds'] }],
  ['gtl_finish_research_quotes', { p_request: missingId, p_lease: missingId, p_quota: {}, p_error: null }],
  // D-27 (20261012230000): the slate the scheduled collector reads; service-only.
  ['gtl_odds_schedule_slate', { p_season: 2026, p_week: 5, p_signature: {} }],
  // M-05 (stage 22, 20261014221500, hosted as 20261019234718): the previous week's unstarted games the collector keeps; service-only.
  ['gtl_odds_carryover_slate', { p_at: null }],
  ['gtl_odds_commissioner', { p_user: missingId }],
  ['gtl_begin_odds_collection', { p_user: missingId, p_request: missingId, p_operation: 'preflight' }],
  ['gtl_finish_odds_collection', { p_user: missingId, p_request: missingId, p_lease: missingId, p_payload: null, p_quota: {}, p_error: null }],
  ['gtl_read_market_snapshot', { p_user: missingId, p_league: missingLeague }],
  ['gtl_dispatch_odds_refresh', {}],
  ['gtl_claim_odds_refresh', { p_token: '0'.repeat(64), p_run: missingId }],
  ['gtl_complete_odds_refresh', { p_run: missingId, p_claim: missingId, p_reason: 'provider_failed' }],
  ['gtl_read_odds_schedule', { p_user: missingId, p_league: missingLeague }],
  // Game referees for situational trends (October 12, 2026 ruling): two service-only RPCs from 20261012234500_gtl_game_officials.sql,
  // hosted as 20261013050416.
  ['gtl_read_game_officials', { p_user: missingId, p_season: 2026, p_week: 6 }],
  ['gtl_set_game_official', { p_user: missingId, p_season: 2026, p_week: 6, p_game: 'AAA-BBB', p_referee: null }],
  // D-34 kickoff wind forecast: three service-only RPCs from 20261013060000_gtl_wind_forecasts.sql, hosted as 20261013072206.
  ['gtl_read_wind_forecasts', { p_user: missingId, p_season: 2026, p_week: 6 }],
  ['gtl_begin_wind_fetch', { p_user: missingId, p_request: missingId, p_season: 2026, p_week: 6, p_games: [] }],
  ['gtl_finish_wind_fetch', { p_request: missingId, p_lease: missingId, p_status: 'failed', p_error: 'WIND_UNAVAILABLE', p_http: null, p_rows: null }],
  // M-06 lines readers (20261015010000_gtl_lines_read.sql, redesign stage 23): two readers gated per game and market and
  // two helpers, all service-only. Hosted as 20261019234724.
  ['gtl_read_lines', { p_user: missingId, p_season: 2026, p_week: 6, p_now: null }],
  ['gtl_read_game_lines', { p_user: missingId, p_season: 2026, p_week: 6, p_game: 'AAA-BBB', p_now: null }],
  ['gtl_book_quotes_from_snapshot', { p_payload: {}, p_game: {}, p_market: 'spread' }],
  ['gtl_kickoff_line', { p_season: 2026, p_week: 6, p_game: 'AAA-BBB', p_market: 'spread' }],
]);

export const apiChecks = Object.freeze([
  ['lines/assessments', {}],
  ['lines/research-submit', { requestId: missingId, url: 'https://x.com/rotobot_ai/status/1' }],
  ['lines/research-links', {}],
  ['odds/preflight', { requestId: missingId }],
  ['odds/collect', { requestId: missingId }],
  // Referee routes, deployed since gtl-api v18 (October 14, 2026). gtl-api runs behind verify_jwt, so the
  // gateway normally answers these signed-out probes with 401 before the function runs, deployed or not.
  ['officials/read', {}],
  ['officials/set', {}],
  // D-34 kickoff wind route, deployed since gtl-api v18: signed-out probes prove only authentication protection.
  ['wind/read', {}],
  // M-06 lines routes: signed-out probes prove only authentication protection.
  ['lines/read', {}],
  ['lines/game', {}],
  // Weekly Trends (deployed since gtl-api v31) is authenticated even though its generated records are public history.
  ['trends/week', { season: 2026, week: 6 }],
  // Fantasy Track 1 (D-57): public nflverse-derived files, served only to signed-in players.
  ['fantasy/week', {}],
  // Trends research, deployed since gtl-api v29.
  ['lines/research', {}],
  // D-62 team records: public nflverse finals, served only to signed-in players (cloud/team-season.mjs).
  ['lines/teams', {}],
]);

export const workerChecks = Object.freeze([
  ['scheduled refresh', 'gtl-odds-refresh', { runId: missingId }],
]);

/** No Lines resources currently need a not-hosted exception. */
// Research schema 20261031131929 and API v44 verified October 31, 2026.
// These probes must now return real denials; absence is no longer accepted.
export const awaitingDeploy = Object.freeze({});
