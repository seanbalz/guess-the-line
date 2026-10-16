// Boundary probes for Bets: Virtual Units picks and settlement, and the shared real-slip tracker
// (D-36 "Real slips"). Joined by scripts/check-cloud-boundary.mjs (see guess.mjs).
import { missingId, missingLeague } from './fixtures.mjs';

export const tables = Object.freeze([
  'social_weeks', 'social_commits', 'social_follows', 'social_follow_receipts', 'virtual_units_picks', 'virtual_units_settlements',
]);

export const rpcChecks = Object.freeze([
  ['gtl_read_social', { p_user: missingId, p_season: null, p_week: null, p_all: false }],
  ['gtl_commit_social', { p_user: missingId, p_season: 2026, p_week: 5, p_expected_revision: 0, p_request_id: missingId, p_action: 'create', p_body: {}, p_state: {} }],
  ['gtl_follow_social', { p_user: missingId, p_request_id: missingId, p_target: missingId, p_following: false }],
  ['gtl_read_virtual_units', { p_user: missingId, p_league: missingLeague }],
  ['gtl_save_virtual_units_pick', { p_user: missingId, p_league: missingLeague, p_revision: 0, p_body: {} }],
  ['gtl_save_recommended_virtual_pick', { p_user: missingId, p_season: 2026, p_week: 6, p_revision: 0, p_body: {} }],
  // D-18 save-path helper added by 20261009190000; service-only like the function that calls it.
  ['gtl_numeric_is_finite', { p_value: 1 }],
  ['gtl_settle_virtual_units', { p_season: 2026, p_week: 5, p_results: { source: 'Boundary check', games: [] } }],
]);

export const apiChecks = Object.freeze([
  ...['read', 'create', 'tail', 'settle', 'include', 'correct', 'follow'].map(action => [`social/${action}`, {}]),
  ['virtual-units', undefined],
  ['virtual-pick', {}],
  ['virtual-units/settle', {}],
  ['bets/recommendations', {}],
  ['bets/recommendations/place', {}],
]);

export const workerChecks = Object.freeze([]);

export const awaitingDeploy = Object.freeze({
});
