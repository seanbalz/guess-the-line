export const LOBBY_METHODS = {
  '/lobby': ['GET'], '/profile': ['POST'], '/leagues': ['POST'],
  '/invites': ['GET', 'POST'], '/invite/accept': ['POST'], '/invite/revoke': ['POST'],
};
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ERROR_MESSAGES = {
  GTL_FORBIDDEN: [403, 'Only this game’s commissioner can manage invitations.'],
  GTL_FIXED_ROSTER: [400, 'Triple Threat has a fixed roster. Its remaining player accounts require individual roster setup.'],
  GTL_INVALID_NAME: [400, 'Enter a display name between 1 and 60 characters.'],
  GTL_INVALID_GAME: [400, 'Enter a game name and choose Duel or Private Group.'],
  GTL_PROFILE_REQUIRED: [400, 'Save your display name before creating or joining a game.'],
  GTL_SCHEDULE_UNAVAILABLE: [503, 'A verified schedule is not available yet.'],
  GTL_INVALID_INVITE: [400, 'Enter a valid email address or invitation.'],
  GTL_SELF_INVITE: [400, 'You already belong to this game.'],
  GTL_INVITE_RETRY: [409, 'This invitation was already created. Use its original link, or revoke it and create a new invitation.'],
  GTL_PENDING_INVITE: [409, 'An invitation for this email is already pending. Revoke it before creating a new link.'],
  GTL_GAME_FULL: [409, 'All places in this game are filled or reserved by pending invitations.'],
  GTL_INVITE_UNAVAILABLE: [404, 'This invitation is unavailable, expired, or belongs to another email address.'],
  GTL_ALREADY_MEMBER: [409, 'This account already has a membership in the game.'],
  GTL_INVITE_ACCEPTED: [409, 'An accepted invitation cannot be revoked.'],
  GTL_REQUEST_CONFLICT: [409, 'This request was already used for a different game. Start a new creation request.'],
  GTL_GAME_LIMIT: [409, 'You can create up to 10 private games.'],
};
export class LobbyError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export function providerLobbyError(message) {
  const known = ERROR_MESSAGES[message];
  return known ? new LobbyError(...known) : new Error('Private game service unavailable.');
}
const reject = (status, message) => { throw new LobbyError(status, message); };
const fields = (body, allowed) => {
  if (Object.keys(body).some(key => !allowed.includes(key))) reject(400, 'Unexpected request field. Account identity comes from sign-in.');
};
const validName = (name, max) => typeof name === 'string' && name.trim().length >= 1 && name.trim().length <= max && !/[\x00-\x1f\x7f]/.test(name);
export function normalizeEmail(email) {
  if (typeof email !== 'string') return null;
  const value = email.trim().toLowerCase();
  return value.length <= 254 && EMAIL_PATTERN.test(value) ? value : null;
}
export async function hashInviteToken(token) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
const randomToken = () => [...crypto.getRandomValues(new Uint8Array(32))].map(byte => byte.toString(16).padStart(2, '0')).join('');

// User and confirmed email are supplied only by the verified Auth adapter.
export async function handleLobby({ route, method, body = {}, user, leagueId, service, siteUrl = 'https://guess-the-line.pages.dev' }) {
  const email = normalizeEmail(user.email);
  if (!user.emailConfirmed || !email) reject(403, 'Confirm your email address before using private games.');
  if (!service) throw new Error('Private game service not configured.');
  const actor = { p_user_id: user.id };
  if (route === '/lobby') return service.rpc('gtl_lobby', { ...actor, p_email: email });
  if (route === '/profile') {
    fields(body, ['displayName']);
    if (!validName(body.displayName, 60)) throw providerLobbyError('GTL_INVALID_NAME');
    return service.rpc('gtl_save_profile', { ...actor, p_display_name: body.displayName.trim() });
  }
  if (route === '/leagues') {
    fields(body, ['name', 'format', 'practice', 'requestId']);
    if (!validName(body.name, 80) || !['duel', 'group'].includes(body.format) || typeof body.practice !== 'boolean' || !UUID_PATTERN.test(body.requestId || '')) throw providerLobbyError('GTL_INVALID_GAME');
    return service.rpc('gtl_create_league', { ...actor, p_name: body.name.trim(), p_format: body.format, p_practice: body.practice, p_request_id: body.requestId });
  }
  if (route === '/invites' && method === 'GET') return service.rpc('gtl_list_invites', { ...actor, p_league_id: leagueId });
  if (route === '/invites') {
    fields(body, ['email', 'requestId']);
    const recipient = normalizeEmail(body.email);
    if (!recipient || !UUID_PATTERN.test(body.requestId || '')) throw providerLobbyError('GTL_INVALID_INVITE');
    if (recipient === email) throw providerLobbyError('GTL_SELF_INVITE');
    const origin = new URL(siteUrl);
    if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('Invalid invitation origin.');
    const token = randomToken();
    const result = await service.rpc('gtl_create_invite', { ...actor, p_actor_email: email, p_league_id: leagueId, p_email: recipient, p_token_hash: await hashInviteToken(token), p_request_id: body.requestId });
    return { ...result, inviteUrl: `${origin.origin}/#invite=${token}`, delivery: 'link_only' };
  }
  if (route === '/invite/accept') {
    fields(body, ['token', 'inviteId']);
    if (Object.hasOwn(body, 'token') === Object.hasOwn(body, 'inviteId') || (Object.hasOwn(body, 'token') && !/^[0-9a-f]{64}$/.test(body.token || '')) || (Object.hasOwn(body, 'inviteId') && !UUID_PATTERN.test(body.inviteId || ''))) throw providerLobbyError('GTL_INVALID_INVITE');
    return service.rpc('gtl_accept_invite', { ...actor, p_email: email, p_token_hash: body.token ? await hashInviteToken(body.token) : null, p_invite_id: body.inviteId || null });
  }
  if (route === '/invite/revoke') {
    fields(body, ['inviteId']);
    if (!UUID_PATTERN.test(body.inviteId || '')) throw providerLobbyError('GTL_INVALID_INVITE');
    return service.rpc('gtl_revoke_invite', { ...actor, p_league_id: leagueId, p_invite_id: body.inviteId });
  }
  throw new Error('Unknown private game route.');
}
