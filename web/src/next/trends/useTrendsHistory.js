import { useRef } from 'react';
// All requested seasons form one fail-closed, abortable view. No private-to-Community fallback.
import { communityApi, leagueApi } from '../../api.js';
import { useLeagueRead } from '../league/useLeagueRead.jsx';

export function requestedSeasons(data, season, window) {
  const available = [...new Set((data?.seasons || []).filter(Number.isInteger))].filter(s => s <= season).sort((a,b) => b-a);
  const count = window === 'years3' ? 3 : window === 'years5' ? 5 : null;
  return ['last5','last10','all','years3','years5'].includes(window) ? available.filter(s => count === null || s > season-count) : [season];
}
function mergeHistory(first, rows, seasons) {
  if (rows.some((row, i) => !row || row.viewer !== first.viewer || row.season !== seasons[i] || !Array.isArray(row.weeks))) throw new Error('Requested history is unavailable. Try again.');
  return { ...first, requestedSeasons: seasons, weeks: rows.flatMap(row => row.weeks) };
}
export async function readTrendsHistory({ api, viewerId = null, leagueId = null, season, window = 'season', signal, first = null, seasons: requested }) {
  const action = leagueId ? 'comparison' : 'history';
  const body = value => ({ season: value, ...(leagueId ? { leagueId } : {}) });
  const initial = first || await api(action, body(season), signal);
  if (!initial || (viewerId && initial.viewer !== viewerId) || (leagueId && initial.leagueId !== leagueId)) throw new Error('Requested private history is unavailable.');
  const seasons = requested || requestedSeasons(initial, season, window);
  if (!seasons.length) return { ...initial, requestedSeasons: [], weeks: [] };
  const rows = await Promise.all(seasons.map(value => value === initial.season ? initial : api(action, body(value), signal)));
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  if (leagueId && rows.some(row => row?.leagueId !== leagueId)) throw new Error('Requested private history is unavailable.');
  return mergeHistory(initial, rows, seasons);
}
export function useTrendsHistory(app, published, window = 'season', enabled = true) {
  const leagueId = app.league?.community === false ? app.league.id : null;
  const season = published?.season;
  const scope = JSON.stringify([app.accountId, leagueId || 'community', season]);
  const api = leagueId ? leagueApi : communityApi;
  const refused = error => { if (error.status === 401) app.requestSignIn?.(); };
  const first = useLeagueRead(scope + ':available:' + enabled, signal => enabled && season ? api(leagueId ? 'comparison' : 'history', { season, ...(leagueId ? { leagueId } : {}) }, signal) : null, refused);
  const seasons = first.data ? requestedSeasons(first.data, season, 'all') : [];
  const version = useRef({ data: null, n: 0 });
  if (version.current.data !== first.data) version.current = { data: first.data, n: version.current.n + 1 };
  const key = JSON.stringify([scope, enabled, seasons, version.current.n]);
  const combined = useLeagueRead(key, signal => first.data && enabled ? readTrendsHistory({ api, viewerId: app.accountId, leagueId, season, window, signal, first: first.data, seasons }) : null, refused);
  if (!enabled) return { loading: false, error: null, data: null, retry: first.retry };
  if (first.loading || first.error || !first.data) return first;
  return { ...combined, retry: () => { first.retry(); combined.retry(); } };
}
