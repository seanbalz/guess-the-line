// Boundary probes for leagues: the lobby, profiles, private groups and invites, memberships and the
// community feed. Joined by scripts/check-cloud-boundary.mjs (see guess.mjs).
import { actor, fixtureEmail, missingId, missingLeague } from './fixtures.mjs';

export const tables = Object.freeze([
  'leagues', 'memberships', 'profiles', 'schedule_templates', 'invites', 'access_audit', 'feed_posts', 'feed_likes', 'feed_comments', 'community_removals',
]);

export const rpcChecks = Object.freeze([
  ['gtl_save_profile', { ...actor, p_display_name: 'Boundary check' }],
  ['gtl_lobby', { ...actor, p_email: fixtureEmail }],
  ['gtl_create_league', { ...actor, p_name: 'Boundary check', p_format: 'duel', p_practice: true, p_request_id: missingId }],
  ['gtl_create_invite', { ...actor, p_actor_email: fixtureEmail, p_league_id: missingLeague, p_email: fixtureEmail, p_token_hash: '0'.repeat(64), p_request_id: missingId }],
  ['gtl_list_invites', { ...actor, p_league_id: missingLeague }],
  ['gtl_accept_invite', { ...actor, p_email: fixtureEmail, p_token_hash: null, p_invite_id: missingId }],
  ['gtl_revoke_invite', { ...actor, p_league_id: missingLeague, p_invite_id: missingId }],
]);

export const apiChecks = Object.freeze([
  ['lobby', undefined],
  ['profile', { displayName: 'Boundary check' }],
  ['leagues', { name: 'Boundary check', format: 'duel', practice: true, requestId: missingId }],
  [`invites?league=${missingLeague}`, undefined],
  [`invites?league=${missingLeague}`, { email: fixtureEmail, requestId: missingId }],
  ['invite/accept', { inviteId: missingId }],
  [`invite/revoke?league=${missingLeague}`, { inviteId: missingId }],
]);

export const workerChecks = Object.freeze([]);

export const awaitingDeploy = Object.freeze({});
