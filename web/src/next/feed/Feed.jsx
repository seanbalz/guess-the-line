// The League feed (redesign build plan stage 64; prototype league feed; D-35, D-36, D-23). Posts newest first, friends'
// ballots of one day folded into a digest, "Show older posts" by the server's cursor. While the feed reader is not on
// the server (M-22 not applied, or GTL_FEATURE_OFF=feed), it draws `legacy`, the Community feed the app showed before,
// unchanged. Seeing the newest post clears the new-posts dot on this device.
import { useEffect, useMemo } from 'react';
import { useShell } from '../shell/context.js';
import { Button, Card } from '../ui/index.js';
import { LeagueFailure } from '../league/useLeagueRead.jsx';
import { foldPosts, hasNewPosts, readSeen, seenKey, writeSeen } from './feedModel.js';
import { DigestCard } from './DigestCard.jsx';
import { PostCard } from './PostCard.jsx';
import { feedReaderKnown, useLeagueFeed } from './useLeagueFeed.js';
import './feed.css';

const message = error => (error?.status ? error.message : 'No connection. Reconnect and try again.');

/** True when the Community has a post by someone else newer than the newest one this device showed in the feed. */
export function useNewPostsDot(app) {
  const posts = app.community.data?.posts;
  return useMemo(() => hasNewPosts(posts, app.accountId, readSeen(seenKey(app.accountId, null))), [posts, app.accountId]);
}

export function Feed({ app, leagueId = null, leagueName = 'Community', legacy = null, onRefused }) {
  const shell = useShell();
  const feed = useLeagueFeed({ accountId: app.accountId, leagueId, onRefused });
  const newest = feed.posts.find(post => post.actorId !== app.accountId)?.createdAt ?? null;
  useEffect(() => { if (feed.status === 'ready' && newest) writeSeen(seenKey(app.accountId, leagueId), newest); }, [feed.status, newest, app.accountId, leagueId]);
  const names = useMemo(() => new Map((feed.page?.members ?? []).map(member => [member.id, member])), [feed.page]);
  if (feed.status === 'legacy' || (feed.status === 'loading' && legacy && feedReaderKnown() !== true)) return legacy;
  if (feed.status === 'loading') return <p className="gx-t-body gx-c-2" role="status">Loading the feed…</p>;
  if (feed.status === 'error' && !feed.page) return <LeagueFailure error={feed.error} onRetry={feed.retry}/>;
  const now = feed.page?.now ?? null, viewer = app.accountId;
  const items = foldPosts(feed.posts, viewer);
  return <section className="gx-vstack gx-gap-16 gx-feed" aria-label={`${leagueName} feed`}>
    {items.map(item => (item.type === 'digest'
      ? <DigestCard key={item.key} posts={item.posts} names={names} viewer={viewer} now={now} leagueId={leagueId}/>
      : <PostCard key={`${viewer}:${item.post.id}`} post={item.post} names={names} viewer={viewer} now={now} leagueId={leagueId}/>))}
    {!items.length ? <Card className="gx-vstack gx-gap-12"><p className="gx-t-body">No posts in {leagueName} yet.</p><Button onClick={() => shell.openSheet('sh.switcher')}>Invite friends</Button></Card> : null}
    {feed.error ? <p className="gx-t-body gx-c-loss" role="alert">{message(feed.error)}</p> : null}
    {feed.next ? <Button block aria-disabled={feed.busy || undefined} onClick={feed.more}>{feed.busy ? 'Loading…' : 'Show older posts'}</Button> : null}
  </section>;
}
