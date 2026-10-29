// Boundary probes for Bets: Virtual Units picks and settlement, and the shared real-slip tracker
// (D-36 "Real slips"). Joined by scripts/check-cloud-boundary.mjs (see guess.mjs).
import { missingId, missingLeague } from './fixtures.mjs';

export const tables = Object.freeze([
  'social_weeks', 'social_commits', 'social_follows', 'social_follow_receipts', 'virtual_units_picks', 'virtual_units_settlements', 'results_refresh_schedule', 'results_refresh_runs',
]);

export const rpcChecks = Object.freeze([
  // Private NBA account capabilities, independent of NFL membership.
  ['gtl_nba_claim_games', { p_date: '2026-10-21', p_refresh: false }],
  ['gtl_nba_finish_games', { p_date: '2026-10-21', p_token: missingId, p_games: null }],
  ['gtl_nba_read_bets', { p_user_id: missingId, p_filters: {}, p_cursor: null, p_ticket_id: null }],
  ['gtl_nba_save_bet', { p_user_id: missingId, p_operation_id: missingId, p_ticket: {}, p_expected_revision: 0, p_reason: null }],
  ['gtl_dispatch_results_refresh', {}],
  ['gtl_claim_results_refresh', {p_token:'0'.repeat(64),p_run:missingId}],
  ['gtl_complete_results_refresh', {p_run:missingId,p_claim:missingId,p_reason:null}],
  ['gtl_read_social', { p_user: missingId, p_season: null, p_week: null, p_all: false }],
  ['gtl_commit_social', { p_user: missingId, p_season: 2026, p_week: 5, p_expected_revision: 0, p_request_id: missingId, p_action: 'create', p_body: {}, p_state: {} }],
  ['gtl_follow_social', { p_user: missingId, p_request_id: missingId, p_target: missingId, p_following: false }],
  ['gtl_read_virtual_units', { p_user: missingId, p_league: missingLeague }],
  ['gtl_save_virtual_units_pick', { p_user: missingId, p_league: missingLeague, p_revision: 0, p_body: {} }],
  ['gtl_save_recommended_virtual_pick', { p_user: missingId, p_season: 2026, p_week: 6, p_revision: 0, p_body: {} }],
  // D-18 save-path helper added by 20261009190000; service-only like the function that calls it.
  ['gtl_numeric_is_finite', { p_value: 1 }],
  ['gtl_settle_virtual_units', { p_season: 2026, p_week: 5, p_results: { source: 'Boundary check', games: [] } }],
  // M-19 (D-64, proposed): automatic settlement of pending shared tickets, service-only.
  ['gtl_social_auto_grade', { p_season: 2026, p_week: 5, p_entry: {}, p_now: null }],
  ['gtl_settle_social_pending', { p_season: 2026, p_week: null, p_now: null, p_dry_run: true }],
  ['gtl_bets_context', { p_user: missingId, p_season: null, p_week: null, p_league: null }],
  ['gtl_read_bets', { p_user: missingId, p_season: null, p_week: null, p_league: null, p_now: null }],
  ['gtl_read_bets_market', { p_user: missingId, p_game: 'AAA-BBB', p_market: 'spread', p_season: null, p_week: null, p_now: null }],
  // M-12 (stage 42): the weekly and season board readers and their shared week-totals helper.
  ['gtl_bets_week_rows', { p_season: 2026, p_week: 5, p_users: [missingId] }],
  ['gtl_read_bets_board', { p_user: missingId, p_season: null, p_week: null, p_league: null }],
  ['gtl_read_bets_season', { p_user: missingId, p_season: null, p_league: null, p_who: null }],
  // M-11 (stage 41): account-level placement, its quote helper and its terms helper, service-only.
  ['gtl_place_bets', { p_user: missingId, p_season: 2026, p_week: 5, p_request: missingId, p_bets: [] }],
  ['gtl_bets_newest_quote', { p_season: 2026, p_week: 5, p_sig: {}, p_game: 'AAA-BBB', p_market: 'spread', p_book: 'draftkings', p_now: null }],
  ['gtl_bets_terms', { p_selection: {} }],
]);

export const apiChecks = Object.freeze([
  ['nba/games', { date: '2026-10-21', timeZone: 'America/Los_Angeles' }],
  ['nba/read', {}], ['nba/save', {}],
  ...['read', 'create', 'tail', 'settle', 'include', 'correct', 'follow'].map(action => [`social/${action}`, {}]),
  ['virtual-units', undefined],
  ['virtual-pick', {}],
  ['virtual-units/settle', {}],
  ['bets/recommendations', {}],
  ['bets/recommendations/place', {}],
  ['bets/read', {}],
  ['bets/board', {}],
  ['bets/season', {}],
  ['bets/place', {}],
]);

export const workerChecks = Object.freeze([
  ['scheduled results refresh', 'gtl-results-refresh', {runId:missingId}],
]);

// M-10 and both NBA migrations are hosted and /bets/read and /nba/* are deployed since October 22, 2026 (RELEASE_2026_10_22_MIGRATIONS.md).
// M-12 (stage 42) is hosted as 20261027164010 since October 27, 2026 and /bets/board and /bets/season ship in gtl-api v38
// (RELEASE_2026_10_27_FEED_MIGRATIONS.md).
// M-11 (stage 41) is hosted as 20261029041843 since October 29, 2026, after /bets/place shipped in the 1998e4c gtl-api
// release (RELEASE_2026_10_29_M11.md).
export const awaitingDeploy = Object.freeze({
});
