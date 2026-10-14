// The league switcher's facts (redesign build plan stage 11; prototype spec 3.6 "Your leagues"; D-35: one app with a
// league switcher, the Community first and the default). Pure: it reads the `/lobby` reply (`profile`, `leagues`,
// `pendingInvites`) and the `/community/read` reply, and returns what the switcher, the league pill and the access
// screens draw. The server decides who belongs where: `/lobby` lists only this account's active memberships and the
// invites sent to its own email, so nobody else's leagues ever reach the switcher.
//
// The member's choice is kept per account on this device (localStorage), so it survives a reload; another account on
// the same device reads only its own. A choice that names a league this account is not in (any more, or not yet) shows
// the access-pending screen instead of a league it cannot see.

export const COMMUNITY_ID = 'community';
export const COMMUNITY_NAME = 'Community';
export const LEAGUE_CHOICE_PREFIX = 'gtl.next.league.v1.';
// The lobby's league ids: the founding league and private groups (cloud/handler.mjs accepts only these).
const LEAGUE_ID = /^(?:sean-troy-luke|g_[0-9a-f]{32})$/;
const NAME_MAX = 80;

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const deviceStorage = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };
const cleanName = (value, fallback) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, NAME_MAX) : fallback);
const count = value => (Number.isInteger(value) && value >= 0 ? value : null);

export const COMMUNITY = Object.freeze({ id: COMMUNITY_ID, name: COMMUNITY_NAME, community: true });
export const PRIVATE_LEAGUE = 'Private league';

/** The storage key for one account's league choice, or null without an account. */
export function leagueChoiceKey(accountId) {
  return typeof accountId === 'string' && accountId ? `${LEAGUE_CHOICE_PREFIX}${encodeURIComponent(accountId)}` : null;
}

/** This account's saved choice on this device, `{ id, name }`, or null (nothing saved, a bad value, blocked storage). */
export function readLeagueChoice(accountId, storage = deviceStorage()) {
  const key = leagueChoiceKey(accountId);
  if (!key || !storage) return null;
  try {
    const value = JSON.parse(storage.getItem(key) || 'null');
    if (!record(value) || (value.id !== COMMUNITY_ID && !LEAGUE_ID.test(value.id ?? ''))) return null;
    return { id: value.id, name: value.id === COMMUNITY_ID ? COMMUNITY_NAME : cleanName(value.name, PRIVATE_LEAGUE) };
  } catch { return null; }
}

/** Saves this account's choice. The Community is the default, so choosing it forgets the saved value. Never throws. */
export function saveLeagueChoice(accountId, league, storage = deviceStorage()) {
  const key = leagueChoiceKey(accountId);
  if (!key || !storage || !record(league)) return false;
  try {
    if (league.id === COMMUNITY_ID) { storage.removeItem(key); return true; }
    if (!LEAGUE_ID.test(league.id ?? '')) return false;
    storage.setItem(key, JSON.stringify({ id: league.id, name: cleanName(league.name, PRIVATE_LEAGUE) }));
    return true;
  } catch { return false; }
}

/** This account's groups from `/lobby`, by name: `{ id, name, players, host }`. */
export function groupLeagues(lobby) {
  const leagues = Array.isArray(lobby?.leagues) ? lobby.leagues : [];
  return leagues
    .filter(league => record(league) && LEAGUE_ID.test(league.id ?? ''))
    .map(league => ({ id: league.id, name: cleanName(league.name, PRIVATE_LEAGUE), players: count(league.memberCount), host: league.role === 'commissioner' }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) || a.id.localeCompare(b.id));
}

/** Community members still in it (removed members stay listed elsewhere, D-23, but are not counted as players here). */
export function communityPlayers(community) {
  const members = Array.isArray(community?.members) ? community.members : null;
  return members ? members.filter(member => record(member) && member.removed !== true).length : null;
}

/** The switcher's rows: the Community first, then this account's groups. `on` marks the league showing. */
export function leagueRows({ lobby, community, current }) {
  const rows = [{ ...COMMUNITY, players: communityPlayers(community) }, ...groupLeagues(lobby)];
  return rows.map(row => ({ ...row, on: row.id === (current?.id ?? COMMUNITY_ID) }));
}

/**
 * The league showing for a saved choice: the Community by default; a group this account is in (with its current
 * name); or, for a group it is not in, that group with `pending: true` (the access-pending screen).
 */
export function currentLeague(choice, lobby) {
  if (!record(choice) || choice.id === COMMUNITY_ID) return { ...COMMUNITY, pending: false };
  const group = groupLeagues(lobby).find(league => league.id === choice.id);
  if (group) return { ...group, community: false, pending: false };
  return { id: choice.id, name: cleanName(choice.name, PRIVATE_LEAGUE), community: false, pending: true };
}

/** Invitations sent to this account's email that it has not joined: `{ id, leagueId, leagueName, from, expiresAt }`. */
export function pendingInvites(lobby) {
  const invites = Array.isArray(lobby?.pendingInvites) ? lobby.pendingInvites : [];
  return invites
    .filter(invite => record(invite) && typeof invite.id === 'string' && invite.id)
    .map(invite => ({
      id: invite.id,
      leagueId: typeof invite.leagueId === 'string' ? invite.leagueId : null,
      leagueName: cleanName(invite.leagueName, PRIVATE_LEAGUE),
      from: cleanName(invite.inviterName, 'A league host'),
      expiresAt: typeof invite.expiresAt === 'string' ? invite.expiresAt : null,
    }));
}
