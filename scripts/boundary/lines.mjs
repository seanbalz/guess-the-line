// Boundary probes for lines and game facts: odds collection, market snapshots, the scheduled refresh,
// game referees, the kickoff wind forecast and the redesign's gated lines readers (M-06). Joined by
// scripts/check-cloud-boundary.mjs (see guess.mjs).
import { missingId, missingLeague } from './fixtures.mjs';

export const tables = Object.freeze(['odds_budget', 'odds_collections', 'market_snapshots', 'odds_schedule', 'odds_refresh_runs']);

export const rpcChecks = Object.freeze([
  // D-27 (20261012230000): the slate the scheduled collector reads; service-only.
  ['gtl_odds_schedule_slate', { p_season: 2026, p_week: 5, p_signature: {} }],
  // M-05 (stage 22, 20261014221500): the previous week's unstarted games the collector keeps; service-only, awaiting the apply.
  ['gtl_odds_carryover_slate', { p_at: null }],
  ['gtl_odds_commissioner', { p_user: missingId }],
  ['gtl_begin_odds_collection', { p_user: missingId, p_request: missingId, p_operation: 'preflight' }],
  ['gtl_finish_odds_collection', { p_user: missingId, p_request: missingId, p_lease: missingId, p_payload: null, p_quota: {}, p_error: null }],
  ['gtl_read_market_snapshot', { p_user: missingId, p_league: missingLeague }],
  ['gtl_dispatch_odds_refresh', {}],
  ['gtl_claim_odds_refresh', { p_token: '0'.repeat(64), p_run: missingId }],
  ['gtl_complete_odds_refresh', { p_run: missingId, p_claim: missingId, p_reason: 'provider_failed' }],
  ['gtl_read_odds_schedule', { p_user: missingId, p_league: missingLeague }],
  // Game referees for situational trends (October 12, 2026 ruling): two service-only RPCs from 20261012234500_gtl_game_officials.sql.
  // Awaiting deploy (see awaitingDeploy below), so they alone do not fail check:cloud for a Pages-only deploy of the trend panels.
  ['gtl_read_game_officials', { p_user: missingId, p_season: 2026, p_week: 6 }],
  ['gtl_set_game_official', { p_user: missingId, p_season: 2026, p_week: 6, p_game: 'AAA-BBB', p_referee: null }],
  // D-34 kickoff wind forecast: three service-only RPCs from 20261013060000_gtl_wind_forecasts.sql, awaiting deploy like the referee pieces.
  ['gtl_read_wind_forecasts', { p_user: missingId, p_season: 2026, p_week: 6 }],
  ['gtl_begin_wind_fetch', { p_user: missingId, p_request: missingId, p_season: 2026, p_week: 6, p_games: [] }],
  ['gtl_finish_wind_fetch', { p_request: missingId, p_lease: missingId, p_status: 'failed', p_error: 'WIND_UNAVAILABLE', p_http: null, p_rows: null }],
  // M-06 lines readers (20261015010000_gtl_lines_read.sql, redesign stage 23): two readers gated per game and market and
  // two helpers, all service-only. Awaiting deploy (below) until the migration is applied to the hosted project.
  ['gtl_read_lines', { p_user: missingId, p_season: 2026, p_week: 6, p_now: null }],
  ['gtl_read_game_lines', { p_user: missingId, p_season: 2026, p_week: 6, p_game: 'AAA-BBB', p_now: null }],
  ['gtl_book_quotes_from_snapshot', { p_payload: {}, p_game: {}, p_market: 'spread' }],
  ['gtl_kickoff_line', { p_season: 2026, p_week: 6, p_game: 'AAA-BBB', p_market: 'spread' }],
]);

export const apiChecks = Object.freeze([
  ['odds/preflight', { requestId: missingId }],
  ['odds/collect', { requestId: missingId }],
  // Referee routes ship with the next gtl-api deploy (awaitingDeploy). gtl-api runs behind verify_jwt, so the
  // gateway normally answers these signed-out probes with 401 before the function runs, deployed or not.
  ['officials/read', {}],
  ['officials/set', {}],
  // D-34 kickoff wind route (awaitingDeploy): signed-out probes prove only authentication protection.
  ['wind/read', {}],
  // M-06 lines routes (awaitingDeploy): signed-out probes prove only authentication protection.
  ['lines/read', {}],
  ['lines/game', {}],
]);

export const workerChecks = Object.freeze([
  ['scheduled refresh', 'gtl-odds-refresh', { runId: missingId }],
]);

export const awaitingDeploy = Object.freeze({
  'rpc/gtl_read_game_officials': 'migration 20261012234500_gtl_game_officials.sql',
  'rpc/gtl_set_game_official': 'migration 20261012234500_gtl_game_officials.sql',
  'gtl-api/officials/read': 'the gtl-api deploy with /officials/read',
  'gtl-api/officials/set': 'the gtl-api deploy with /officials/set',
  // D-34 (see docs/DECISIONS.md): remove these four with the release record of the hosted apply and deploy.
  'rpc/gtl_read_wind_forecasts': 'migration 20261013060000_gtl_wind_forecasts.sql',
  'rpc/gtl_begin_wind_fetch': 'migration 20261013060000_gtl_wind_forecasts.sql',
  'rpc/gtl_finish_wind_fetch': 'migration 20261013060000_gtl_wind_forecasts.sql',
  'gtl-api/wind/read': 'the gtl-api deploy with /wind/read',
  // M-05 (stage 22): remove with the release record of the hosted apply (Gate M step 8).
  'rpc/gtl_odds_carryover_slate': 'migration 20261014221500_gtl_odds_open_weeks.sql',
  // M-06 (stage 23): the routes ship with the gtl-api deploy that maps the codes (before the apply); remove the routes with
  // that deploy's release record and the RPCs with the apply's (Gate M step 8).
  'rpc/gtl_read_lines': 'migration 20261015010000_gtl_lines_read.sql',
  'rpc/gtl_read_game_lines': 'migration 20261015010000_gtl_lines_read.sql',
  'rpc/gtl_book_quotes_from_snapshot': 'migration 20261015010000_gtl_lines_read.sql',
  'rpc/gtl_kickoff_line': 'migration 20261015010000_gtl_lines_read.sql',
  'gtl-api/lines/read': 'the gtl-api deploy with /lines/read',
  'gtl-api/lines/game': 'the gtl-api deploy with /lines/game',
});
