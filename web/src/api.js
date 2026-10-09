import { cloudEnabled, configurationError, publishableKey, supabase, supabaseUrl } from './auth';

export class ApiError extends Error {
  constructor(message, status, code = null) { super(message); this.name = 'ApiError'; this.status = status;
    this.code = typeof code === 'string' && /^GTL_SUBMISSION_[A-Z_]+$/.test(code) ? code : null;
  }
}

export async function cloudApi(route, body, { signal, mode, league } = {}) {
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
  const response = await fetch(url, { signal, headers, referrerPolicy: 'no-referrer', ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}) });
  return readResponse(response, ['ballot', 'bet'].includes(route));
}

async function readResponse(response, isGameSave = false) {
  let data;
  try { data = await response.json(); }
  catch { throw new ApiError('The game service returned an unreadable response. Please try again.', response.status); }
  if (!response.ok) throw new ApiError(response.status === 409 && isGameSave && /changed|revision/i.test(data.error || '')
    ? 'Saved data changed in another group or on another device. Refresh the saved data, review your unsaved changes, then save again.'
    : data.error || 'The game service is unavailable. Please try again.', response.status, data.code);
  return data;
}

export async function api(route, player, mode, body, signal, revision, league) {
  if (configurationError) throw new ApiError(configurationError, 503);
  if (cloudEnabled) {
    if (body && (!Number.isSafeInteger(revision) || revision < 0)) throw new ApiError('Refresh your saved data before making changes.', 409);
    return cloudApi(route, body ? { ...body, revision } : undefined, { signal, mode, league });
  }
  const response = await fetch(`/api/${route}?player=${encodeURIComponent(player)}&mode=${encodeURIComponent(mode)}`, {
    signal, ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
  return readResponse(response);
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
  if (!['read', 'like', 'comment', 'member', 'publish-preview', 'publish', 'interest'].includes(action)) throw new ApiError('Unknown community action.', 400);
  return cloudApi(`community/${action}`, body, { signal });
}
