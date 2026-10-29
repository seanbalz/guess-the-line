// Boundary probes for leagues: the lobby, profiles, private groups and invites, memberships and the
// community feed. Joined by scripts/check-cloud-boundary.mjs (see guess.mjs).
import { actor, fixtureEmail, missingId, missingLeague } from './fixtures.mjs';

export const tables = Object.freeze([
  'leagues', 'memberships', 'profiles', 'schedule_templates', 'invites', 'access_audit', 'feed_posts', 'feed_likes', 'feed_comments', 'community_removals',
  // M-21 (hosted since October 27, 2026, RELEASE_2026_10_27_FEED_MIGRATIONS.md): the append-only reaction events.
  'feed_reaction_events',
  // M-25 and M-26 (hosted since October 27, 2026): the features job's records and its schedule.
  'feature_runs', 'badge_events', 'weekly_awards', 'player_streaks', 'features_schedule', 'features_schedule_runs',
  // M-34: pending private dated standings and immutable deadline references.
  'epl_standings', 'epl_standings_usage',
]);

export const rpcChecks = Object.freeze([
  // M-34: inert claim IDs/null source only; no real run, snapshot or pick can be written.
  ['gtl_epl_standings_valid', { p_record: null, p_season: 2026, p_round: 8, p_now: null }],
  ['gtl_epl_standings_state', { p_run: missingId, p_claim: missingId, p_season: 2026, p_week: 9, p_now: null }],
  ['gtl_epl_save_standings', { p_run: missingId, p_claim: missingId, p_season: 2026, p_week: 9, p_record: null, p_now: null }],
  ['gtl_epl_resolve_with_standings', { p_run: missingId, p_claim: missingId, p_season: 2026, p_week: 9, p_rows: null, p_standings: missingId, p_now: null }],
  ['gtl_epl_standings_provenance', { p_season: 2026, p_week: 9 }],
  ['gtl_read_score_comparison', { p_user: missingId, p_season: 2026, p_league: null, p_now: null }],
  ['gtl_save_profile', { ...actor, p_display_name: 'Boundary check' }],
  ['gtl_lobby', { ...actor, p_email: fixtureEmail }],
  ['gtl_create_league', { ...actor, p_name: 'Boundary check', p_format: 'duel', p_practice: true, p_request_id: missingId }],
  ['gtl_create_invite', { ...actor, p_actor_email: fixtureEmail, p_league_id: missingLeague, p_email: fixtureEmail, p_token_hash: '0'.repeat(64), p_request_id: missingId }],
  ['gtl_list_invites', { ...actor, p_league_id: missingLeague }],
  ['gtl_accept_invite', { ...actor, p_email: fixtureEmail, p_token_hash: null, p_invite_id: missingId }],
  ['gtl_revoke_invite', { ...actor, p_league_id: missingLeague, p_invite_id: missingId }],
  // M-21 (20261026131000_gtl_feed_reactions.sql, redesign stage 61): every callable function it adds, hosted as
  // 20261027145634 since October 27, 2026. The probes name no real member or post; the writer's reaction key is not one of the
  // six, so it would refuse before writing. Its table, gtl_feed_reaction_events, is in the table probes.
  ['gtl_feed_reactions', { p_post: missingId }],
  ['gtl_feed_post_visible', { p_user: missingId, p_post: missingId, p_now: null }],
  ['gtl_feed_reaction_summary', { p_user: missingId, p_post: missingId }],
  ['gtl_react_feed', { p_user: missingId, p_post: missingId, p_reaction: 'boundary-check', p_now: null }],
  // M-22 (20261026132000_gtl_league_feed.sql, redesign stage 62): every callable function it adds, hosted as 20261027145711
  // since October 27, 2026. The probes name no real member, league or post; the writer's game id is not a game id, so it
  // would refuse before writing.
  ['gtl_feed_league_access', { p_user: missingId, p_league: missingLeague }],
  ['gtl_feed_in_league', { p_kind: 'joined', p_actor: missingId, p_post_league: null, p_league: missingLeague }],
  ['gtl_feed_embed', { p_user: missingId, p_post: missingId, p_league: null, p_now: null }],
  ['gtl_read_league_feed', { p_user: missingId, p_league: null, p_before_at: null, p_before_id: null, p_limit: 1, p_now: null }],
  ['gtl_read_post_comments', { p_user: missingId, p_post: missingId, p_before_at: null, p_before_id: null, p_limit: 1, p_now: null }],
  ['gtl_read_post_reactors', { p_user: missingId, p_post: missingId, p_now: null }],
  ['gtl_share_result', { p_user: missingId, p_request_id: missingId, p_league: null, p_season: 2026, p_week: 5, p_mode: 'guess_spread', p_game: 'boundary-check', p_now: null }],
  // M-25 league_features (redesign stage 69): the features job's inputs, its writer, the feed post helper and the reader, all
  // service-only. Hosted as 20261027153602 since October 27, 2026; its four tables (feature_runs, badge_events, weekly_awards,
  // player_streaks) are in the table probes.
  ['gtl_feature_results', { p_season: 2026, p_week: 5 }],
  ['gtl_read_feature_inputs', { p_season: 2026, p_now: null }],
  ['gtl_feature_post', { p_actor: missingId, p_kind: 'badge_earned', p_season: 2026, p_week: 5, p_payload: {}, p_dedupe: 'boundary-check', p_at: null }],
  ['gtl_record_feature_results', { p_run: missingId, p_trigger: 'manual', p_actor: missingId, p_results: {} }],
  ['gtl_read_features', { p_user: missingId, p_league: null, p_season: null, p_now: null }],
  // M-26 features_schedule (redesign stage 70): the cron-only dispatcher and the worker's claim and completion. Hosted as
  // 20261027153637 since October 27, 2026; its two tables are in the table probes and the gtl-league-features worker (deployed
  // October 27, 2026) in workerChecks.
  ['gtl_dispatch_league_features', {}],
  ['gtl_claim_league_features', { p_token: '0'.repeat(64), p_run: missingId }],
  ['gtl_complete_league_features', { p_run: missingId, p_claim: missingId, p_reason: null }],
  // M-23 (20261026133000_gtl_kickoff_posts.sql, redesign stage 63): its two callable functions, hosted as 20261027145740 since
  // October 27, 2026 (the trigger function returns a trigger, so it is never an RPC). The writer's season is out of range, so
  // it writes nothing.
  ['gtl_kickoff_slots', { p_season: 1999, p_week: 1 }],
  ['gtl_write_kickoff_posts', { p_season: 1999, p_week: 1, p_actor: missingId }],
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
  // The league feed routes (cloud/feed.mjs): signed-out probes prove only authentication protection. A gtl-api build without
  // cloud/feed.mjs answers them 404 "Not found."; awaiting deploy (below) until then.
  ['league/react', { postId: missingId, reaction: null }],
  ['league/feed', {}],
  ['league/comments', { postId: missingId }],
  ['league/reactors', { postId: missingId }],
  ['league/share-result', { requestId: missingId, season: 2026, week: 5, mode: 'guess_spread', gameId: 'AAA-BBB' }],
  // M-25 routes (redesign stage 69): signed-out probes prove only authentication protection.
  ['league/features', {}],
  ['league/features/run', {}],
]);

export const workerChecks = Object.freeze([
  // M-26 (redesign stage 70): the badges, awards and streaks worker, deployed as gtl-league-features v1 on October 27, 2026.
  ['scheduled league features', 'gtl-league-features', { runId: missingId }],
]);

// /league/comparison is deployed (gtl-api v32) and its D-53 reader is hosted since October 22, 2026. The league feed
// (redesign stages 61 to 63) is hosted and deployed since October 27, 2026: M-21, M-22 and M-23 applied, and the five
// /league/* feed routes in gtl-api v38 (RELEASE_2026_10_27_FEED_MIGRATIONS.md), so none of its pieces awaits deploy. So are
// M-25 and M-26 (redesign stages 69 and 70) with /league/features and /league/features/run (the same record).
export const awaitingDeploy = Object.freeze({
  'table/epl_standings': '20261029161613 (M-34 standings apply / compatible worker and API deploy)',
  'table/epl_standings_usage': '20261029161613 (M-34 standings apply / compatible worker and API deploy)',
  'rpc/gtl_epl_standings_valid': '20261029161613 (M-34 standings apply / compatible worker and API deploy)',
  'rpc/gtl_epl_standings_state': '20261029161613 (M-34 standings apply / compatible worker and API deploy)',
  'rpc/gtl_epl_save_standings': '20261029161613 (M-34 standings apply / compatible worker and API deploy)',
  'rpc/gtl_epl_resolve_with_standings': '20261029161613 (M-34 standings apply / compatible worker and API deploy)',
  'rpc/gtl_epl_standings_provenance': '20261029161613 (M-34 standings apply / compatible worker and API deploy)',
});
