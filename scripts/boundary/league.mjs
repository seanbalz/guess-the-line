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
  // M-21 (20261026131000_gtl_feed_reactions.sql, redesign stage 61): every callable function it adds. Awaiting deploy (below)
  // until Sean's "apply M-21". The probes name no real member or post; the writer's reaction key is not one of the six, so it
  // would refuse before writing. Its table, gtl_feed_reaction_events, joins the table probes with the apply record.
  ['gtl_feed_reactions', { p_post: missingId }],
  ['gtl_feed_post_visible', { p_user: missingId, p_post: missingId, p_now: null }],
  ['gtl_feed_reaction_summary', { p_user: missingId, p_post: missingId }],
  ['gtl_react_feed', { p_user: missingId, p_post: missingId, p_reaction: 'boundary-check', p_now: null }],
  // M-22 (20261026132000_gtl_league_feed.sql, redesign stage 62): every callable function it adds. Awaiting deploy (below)
  // until Sean's "apply M-22". The probes name no real member, league or post; the writer's game id is not a game id, so it
  // would refuse before writing.
  ['gtl_feed_league_access', { p_user: missingId, p_league: missingLeague }],
  ['gtl_feed_in_league', { p_kind: 'joined', p_actor: missingId, p_post_league: null, p_league: missingLeague }],
  ['gtl_feed_embed', { p_user: missingId, p_post: missingId, p_league: null, p_now: null }],
  ['gtl_read_league_feed', { p_user: missingId, p_league: null, p_before_at: null, p_before_id: null, p_limit: 1, p_now: null }],
  ['gtl_read_post_comments', { p_user: missingId, p_post: missingId, p_before_at: null, p_before_id: null, p_limit: 1, p_now: null }],
  ['gtl_read_post_reactors', { p_user: missingId, p_post: missingId, p_now: null }],
  ['gtl_share_result', { p_user: missingId, p_request_id: missingId, p_league: null, p_season: 2026, p_week: 5, p_mode: 'guess_spread', p_game: 'boundary-check', p_now: null }],
  // M-23 (20261026133000_gtl_kickoff_posts.sql, redesign stage 63): its two callable functions (the trigger function is granted
  // to no role). Awaiting deploy (below) until Sean's "apply M-23". The writer's season is out of range, so it writes nothing.
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
]);

export const workerChecks = Object.freeze([]);

// /league/comparison is deployed (gtl-api v32) and its D-53 reader is hosted since October 22, 2026.
// Awaiting: the league feed pieces (redesign stages 61 to 63), each until its own apply or deploy.
const M21 = 'M-21 (20261026131000_gtl_feed_reactions.sql) applied after Sean\'s "apply M-21"';
const M22 = 'M-22 (20261026132000_gtl_league_feed.sql) applied after Sean\'s "apply M-22"';
const M23 = 'M-23 (20261026133000_gtl_kickoff_posts.sql) applied after Sean’s "apply M-23"';
const FEED_ROUTES = 'gtl-api with cloud/feed.mjs deployed (league feed routes)';
// The league feed's awaiting pieces (tests/cloud-boundary.test.mjs names each one).
const FEED_AWAITING = Object.freeze({
  ...Object.fromEntries(['gtl_feed_reactions', 'gtl_feed_post_visible', 'gtl_feed_reaction_summary', 'gtl_react_feed'].map(rpc => [`rpc/${rpc}`, M21])),
  ...Object.fromEntries(['gtl_feed_league_access', 'gtl_feed_in_league', 'gtl_feed_embed', 'gtl_read_league_feed', 'gtl_read_post_comments',
    'gtl_read_post_reactors', 'gtl_share_result'].map(rpc => [`rpc/${rpc}`, M22])),
  ...Object.fromEntries(['react', 'feed', 'comments', 'reactors', 'share-result'].map(action => [`gtl-api/league/${action}`, FEED_ROUTES])),
  ...Object.fromEntries(['gtl_kickoff_slots', 'gtl_write_kickoff_posts'].map(rpc => [`rpc/${rpc}`, M23])),
});
export const awaitingDeploy = Object.freeze({ ...FEED_AWAITING });
