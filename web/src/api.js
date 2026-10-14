import { cloudEnabled, configurationError, publishableKey, supabase, supabaseUrl } from './auth';
import { ApiError, readResponse, requestResponse } from './apiResponse';
export { ApiError } from './apiResponse';

/** `save: true` marks a write whose lost or unreadable reply must surface as SaveUncertainError; writes never retry by themselves. */
export async function cloudApi(route, body, { signal, mode, league, save = false } = {}) {
  if (configurationError) throw new ApiError(configurationError, 503);
  if (!supabase) throw new ApiError('Sign-in is required for online games.', 401);
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session) throw new ApiError('Your sign-in has expired. Sign out and sign in again to continue.', 401);
  const query = new URLSearchParams();
  if (mode && ['state', 'ballot'].includes(route)) query.set('mode', mode);
  if (league) query.set('league', league);
  const url = `${supabaseUrl}/functions/v1/gtl-api/${route}${query.size ? `?${query}` : ''}`;
  const headers = { Authorization: `Bearer ${session.access_token}`, apikey: publishableKey };
  if (body) headers['Content-Type'] = 'application/json';
  return requestResponse(() => fetch(url, { signal, headers, referrerPolicy: 'no-referrer', ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}) }), Boolean(body) && (save === true || ['ballot', 'bet', 'personal/ballot'].includes(route)));
}

export async function api(route, player, mode, body, signal, revision, league) {
  if (configurationError) throw new ApiError(configurationError, 503);
  if (cloudEnabled) {
    if (body && (!Number.isSafeInteger(revision) || revision < 0)) throw new ApiError('Refresh your saved data before making changes.', 409);
    return cloudApi(route, body ? { ...body, revision } : undefined, { signal, mode, league });
  }
  return requestResponse(() => fetch(`/api/${route}?player=${encodeURIComponent(player)}&mode=${encodeURIComponent(mode)}`, {
    signal, ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  }), Boolean(body) && ['ballot', 'bet'].includes(route));
}
export async function socialApi(action, body = {}, player = 'sean', signal) {
  if (!['read', 'create', 'tail', 'settle', 'include', 'correct', 'follow'].includes(action)) throw new ApiError('Unknown bet tracker action.', 400);
  if (configurationError) throw new ApiError(configurationError, 503);
  if (cloudEnabled) return cloudApi(`social/${action}`, body, { signal });
  return readResponse(await fetch(`/api/social/${action}?player=${encodeURIComponent(player)}`, {
    method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }));
}
export const fmt = value => value === null || value === undefined ? '—' : Number.isInteger(value) ? String(value) : value.toFixed(1);
export const signed = value => value === null || value === undefined ? '—' : value === 0 ? 'PK' : value > 0 ? `+${fmt(value)}` : `−${fmt(Math.abs(value))}`;
export const date = (value, options={}) => value ? new Date(value).toLocaleString('en-US',{timeZone:'America/Los_Angeles',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',...options}) : 'Not available';
export const shortTeam = team => team.split(' ').at(-1);
export async function communityApi(action, body = {}, signal) {
  if (!['read', 'history', 'like', 'comment', 'member', 'publish-preview', 'publish', 'interest', 'sit-out', 'week-open'].includes(action)) throw new ApiError('Unknown community action.', 400);
  return cloudApi(`community/${action}`, body, { signal });
}
/** Game referees for situational trends: any member reads a week's assignments; only the commissioner sets one. */
export async function officialsApi(action, body = {}, signal) {
  if (!['read', 'set'].includes(action)) throw new ApiError('Unknown referee action.', 400);
  return cloudApi(`officials/${action}`, body, { signal });
}
/** Kickoff wind forecasts (D-34): any community member reads a week's stored Open-Meteo snapshots; the hosted service refreshes due games. */
export async function windApi(action, body = {}, signal) {
  if (!['read'].includes(action)) throw new ApiError('Unknown wind forecast action.', 400);
  return cloudApi(`wind/${action}`, body, { signal });
}

/**
 * The redesign's route groups (build plan, section 3.3): one thin wrapper per gtl-api group in
 * cloud/{lines,bets,league,me}.mjs. Each lists the actions its module serves: reads, and writes, which are
 * sent as saves (an unconfirmed reply is a SaveUncertainError, never a silent retry). Empty until the stage
 * that adds the route; until then every action is refused here, before any request.
 */
export const GROUP_ACTIONS = Object.freeze({
  // Stage 23 (M-06): the gated lines readers, POST /lines/read (a week's board) and /lines/game (one game in full).
  lines: Object.freeze({ reads: Object.freeze(['read', 'game']), writes: Object.freeze([]) }),
  bets: Object.freeze({ reads: Object.freeze([]), writes: Object.freeze([]) }),
  league: Object.freeze({ reads: Object.freeze([]), writes: Object.freeze([]) }),
  me: Object.freeze({ reads: Object.freeze([]), writes: Object.freeze([]) }),
});
const GROUP_LABELS = Object.freeze({ lines: 'lines', bets: 'bets', league: 'league', me: 'Me' });
async function groupApi(group, action, body, signal) {
  const { reads, writes } = GROUP_ACTIONS[group];
  const save = writes.includes(action);
  if (!save && !reads.includes(action)) throw new ApiError(`Unknown ${GROUP_LABELS[group]} action.`, 400);
  return cloudApi(`${group}/${action}`, body, { signal, save });
}
export const linesApi = (action, body = {}, signal) => groupApi('lines', action, body, signal);
export const betsApi = (action, body = {}, signal) => groupApi('bets', action, body, signal);
export const leagueApi = (action, body = {}, signal) => groupApi('league', action, body, signal);
export const meApi = (action, body = {}, signal) => groupApi('me', action, body, signal);
