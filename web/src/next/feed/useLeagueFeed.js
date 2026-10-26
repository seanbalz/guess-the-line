// The League feed's read (redesign build plan stage 64): POST /league/feed for the league showing, refreshed on focus,
// back online and every 5 minutes like the shared reads, with "Show older posts" paging by the server's cursor.
// `status` is 'loading', 'ready', 'error' or 'legacy': the feed reader is not on this server yet (503 while M-22 is not
// applied or GTL_FEATURE_OFF names `feed`, 404 from a gtl-api build without the route), so the screen shows the Community
// feed from /community/read exactly as before (build plan section 3.3: an existing screen never depends on a new RPC).
// Changes saved in a sheet arrive through feedActions' channel and patch the loaded posts in place.
import { useCallback, useEffect, useRef, useState } from 'react';
import { leagueApi } from '../../api.js';
import { connectRefresh } from '../data/store.js';
import { onFeedChange } from './feedActions.js';

export const LEGACY_STATUSES = Object.freeze([404, 503]);
// Whether this page has seen the server answer the feed reader: true (it has one), false (legacy) or null (not yet). Until
// it is known, the feed shows the Community feed it showed before, so a server without the reader never flashes "Loading".
let readerKnown = null;
export const feedReaderKnown = () => readerKnown;

export function useLeagueFeed({ accountId, leagueId = null, onRefused }) {
  const key = `${accountId}:${leagueId ?? 'community'}`;
  const [state, setState] = useState({ key, status: 'loading', page: null, older: [], next: null, error: null, busy: false });
  const [revision, setRevision] = useState(0);
  const refused = useRef(onRefused); refused.current = onRefused;
  const lastGood = useRef(0), running = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    running.current = true;
    setState(previous => (previous.key === key ? { ...previous, error: null } : { key, status: 'loading', page: null, older: [], next: null, error: null, busy: false }));
    leagueApi('feed', leagueId ? { leagueId } : {}, controller.signal).then(page => {
      if (controller.signal.aborted) return;
      lastGood.current = Date.now(); readerKnown = true;
      setState(previous => ({ key, status: 'ready', page, older: previous.key === key ? previous.older : [], next: previous.key === key && previous.older.length ? previous.next : page.next, error: null, busy: false }));
    }).catch(error => {
      if (controller.signal.aborted || error?.name === 'AbortError') return;
      if (LEGACY_STATUSES.includes(error?.status)) { readerKnown = false; setState({ key, status: 'legacy', page: null, older: [], next: null, error: null, busy: false }); return; }
      setState(previous => ({ ...(previous.key === key ? previous : { page: null, older: [], next: null, busy: false }), key, status: previous.key === key && previous.page ? 'ready' : 'error', error }));
      if ([401, 403].includes(error?.status)) refused.current?.(error);
    }).finally(() => { if (!controller.signal.aborted) running.current = false; });
    return () => { controller.abort(); running.current = false; };
  }, [key, leagueId, revision]);

  useEffect(() => connectRefresh(window, { refresh({ olderThan } = {}) {
    if (running.current || (olderThan !== undefined && Date.now() - lastGood.current < olderThan)) return;
    setRevision(n => n + 1);
  } }), [key]);

  useEffect(() => onFeedChange(change => {
    if (change.type === 'reload') { setRevision(n => n + 1); return; }
    const patch = post => {
      if (post.id !== change.postId) return post;
      if (change.type === 'reactions') return { ...post, reactions: change.reactions };
      if (change.type === 'comment' && !post.comments.some(c => c.id === change.comment.id)) {
        return { ...post, commentCount: post.commentCount + 1, comments: [...post.comments, change.comment].slice(-2) };
      }
      return post;
    };
    setState(previous => (previous.page ? { ...previous, page: { ...previous.page, posts: previous.page.posts.map(patch) }, older: previous.older.map(patch) } : previous));
  }), []);

  const more = useCallback(async () => {
    const current = state;
    if (current.busy || !current.next || current.key !== key) return;
    setState(previous => ({ ...previous, busy: true, error: null }));
    try {
      const page = await leagueApi('feed', { ...(leagueId ? { leagueId } : {}), before: current.next });
      setState(previous => (previous.key !== key ? previous : { ...previous, busy: false, older: [...previous.older, ...page.posts], next: page.next }));
    } catch (error) {
      setState(previous => ({ ...previous, busy: false, error }));
      if ([401, 403].includes(error?.status)) refused.current?.(error);
    }
  }, [state, key, leagueId]);

  const shown = state.key === key ? state : { status: 'loading', page: null, older: [], next: null, error: null, busy: false };
  const seen = new Set();
  const posts = [...(shown.page?.posts ?? []), ...shown.older].filter(post => (seen.has(post.id) ? false : (seen.add(post.id), true)));
  return { status: shown.status, posts, page: shown.page, next: shown.next, busy: shown.busy, error: shown.error, more, retry: () => setRevision(n => n + 1) };
}
