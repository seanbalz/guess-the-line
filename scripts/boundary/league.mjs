// Boundary probes for leagues: the lobby, profiles, private groups and invites, memberships and the
// community feed. Joined by scripts/check-cloud-boundary.mjs (see guess.mjs).
import { actor, fixtureEmail, missingId, missingLeague } from './fixtures.mjs';

export const tables = Object.freeze([
  'leagues', 'memberships', 'profiles', 'schedule_templates', 'invites', 'access_audit', 'feed_posts', 'feed_likes', 'feed_comments', 'community_removals',
]);

export const rpcChecks = Object.freeze([
  ['gtl_read_score_comparison', { p_user: missingId, p_season: 2026, p_league: null, p_now: null }],
  ['gtl_save_profile', { ...actor, p_display_name: 'Boundary check' }],
  ['gtl_lobby', { ...actor, p_email: fixtureEmail }],
  ['gtl_create_league', { ...actor, p_name: 'Boundary check', p_format: 'duel', p_practice: true, p_request_id: missingId }],
  ['gtl_create_invite', { ...actor, p_actor_email: fixtureEmail, p_league_id: missingLeague, p_email: fixtureEmail, p_token_hash: '0'.repeat(64), p_request_id: missingId }],
  ['gtl_list_invites', { ...actor, p_league_id: missingLeague }],
  ['gtl_accept_invite', { ...actor, p_email: fixtureEmail, p_token_hash: null, p_invite_id: missingId }],
  ['gtl_revoke_invite', { ...actor, p_league_id: missingLeague, p_invite_id: missingId }],
  // M-25 league_features (redesign stage 69): the features job's inputs, its writer, the feed post helper and the reader, all
  // service-only. Awaiting deploy (below) until M-25 is applied. Its four tables (feature_runs, badge_events, weekly_awards,
  // player_streaks) join the table probes with the apply record, as a missing table cannot pass as a denial.
  ['gtl_feature_results', { p_season: 2026, p_week: 5 }],
  ['gtl_read_feature_inputs', { p_season: 2026, p_now: null }],
  ['gtl_feature_post', { p_actor: missingId, p_kind: 'badge_earned', p_season: 2026, p_week: 5, p_payload: {}, p_dedupe: 'boundary-check', p_at: null }],
  ['gtl_record_feature_results', { p_run: missingId, p_trigger: 'manual', p_actor: missingId, p_results: {} }],
  ['gtl_read_features', { p_user: missingId, p_league: null, p_season: null, p_now: null }],
  // M-26 features_schedule (redesign stage 70): the cron-only dispatcher and the worker's claim and completion. Awaiting deploy
  // until M-26 is applied; its two tables join the table probes and gtl-league-features the worker probes with the apply record.
  ['gtl_dispatch_league_features', {}],
  ['gtl_claim_league_features', { p_token: '0'.repeat(64), p_run: missingId }],
  ['gtl_complete_league_features', { p_run: missingId, p_claim: missingId, p_reason: null }],
]);

export const apiChecks = Object.freeze([
  ['league/comparison', {}],
  ['lobby', undefined],
  ['profile', { displayName: 'Boundary check' }],
  ['leagues', { name: 'Boundary check', format: 'duel', practice: true, requestId: missingId }],
  [`invites?league=${missingLeague}`, undefined],
  [`invites?league=${missingLeague}`, { email: fixtureEmail, requestId: missingId }],
  ['invite/accept', { inviteId: missingId }],
  [`invite/revoke?league=${missingLeague}`, { inviteId: missingId }],
  // M-25 routes (redesign stage 69): signed-out probes prove only authentication protection.
  ['league/features', {}],
  ['league/features/run', {}],
]);

export const workerChecks = Object.freeze([]);

// /league/comparison is deployed (gtl-api v32) and its D-53 reader is hosted since October 22, 2026.
// M-25 (redesign stage 69) is written and not applied, and no gtl-api deploy carries /league/features yet.
const M25 = 'migration 20261026230000_gtl_league_features.sql';
export const awaitingDeploy = Object.freeze({
  'rpc/gtl_feature_results': M25,
  'rpc/gtl_read_feature_inputs': M25,
  'rpc/gtl_feature_post': M25,
  'rpc/gtl_record_feature_results': M25,
  'rpc/gtl_read_features': M25,
  'gtl-api/league/features': 'the gtl-api deploy with /league/features',
  'gtl-api/league/features/run': 'the gtl-api deploy with /league/features/run',
  // M-26 (redesign stage 70) is written and not applied either.
  'rpc/gtl_dispatch_league_features': 'migration 20261026233000_gtl_features_schedule.sql',
  'rpc/gtl_claim_league_features': 'migration 20261026233000_gtl_features_schedule.sql',
  'rpc/gtl_complete_league_features': 'migration 20261026233000_gtl_features_schedule.sql',
});
