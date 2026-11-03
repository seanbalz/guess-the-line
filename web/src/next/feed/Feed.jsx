// The League feed (redesign build plan stage 64; D-35, D-36, D-23; D-69 step 1). Posts newest first, friends' ballots of
// one day folded into a digest, "Show older posts" by the server's cursor. Without the server's feed reader (M-22, or
// GTL_FEATURE_OFF=feed) the feed layer draws `legacy`, the old Community feed, unchanged. LeagueScreen reads the feed
// once (useLeagueFeed) for the landing's two newest posts and the feed layer. NEW marks a post newer than this device had
// shown when League opened; a post a refresh brings rises in; once ready, the newest post counts as seen (useFeedSeen).
import { useEffect, useMemo, useRef, useState } from 'react';
import { useShell } from '../shell/context.js';
import { Button, Card, LinkRow, Skeleton } from '../ui/index.js';
import { plural } from '../format.js';
import { LeagueFailure } from '../league/useLeagueRead.jsx';
import { PREVIEW_POSTS, postArrivals } from '../league/leagueModel.js';
import { foldPosts, readSeen, seenKey, writeSeen } from './feedModel.js';
import { DigestCard } from './DigestCard.jsx';
import { PostCard } from './PostCard.jsx';
import { feedReaderKnown } from './useLeagueFeed.js';
import './feed.css';

const NONE = new Set();
const message = error => (error?.status ? error.message : 'No connection. Reconnect and try again.');

/** Once the read is ready, the newest post someone else made counts as seen here (it clears the tile's "New posts"). */
export function useFeedSeen(account, leagueId, feed) {
  const newest = feed.posts.find(post => post.actorId !== account)?.createdAt ?? null;
  useEffect(() => { if (feed.status === 'ready' && newest) writeSeen(seenKey(account, leagueId), newest); }, [feed.status, newest, account, leagueId]);
}
/** The newest post time this device had shown when League opened, read once per account and league. */
export function useSeenSince(account, leagueId) {
  const memo = useRef(null), key = seenKey(account, leagueId);
  if (memo.current?.key !== key) memo.current = { key, at: readSeen(key) };
  return memo.current.at;
}
/** Ids of first-page posts a later read brought (they rise in); nothing on the first look or for another league. */
export function usePostArrivals(page, key) {
  const known = useRef(null), [arrived, setArrived] = useState(NONE);
  useEffect(() => {
    if (!page) return;
    const next = postArrivals(known.current?.key === key ? known.current.value : null, page.posts);
    known.current = { key, value: next.known };
    if (next.arrived.size) setArrived(next.arrived);
  }, [page, key]);
  return arrived;
}

function FeedItems({ items, names, viewer, now, leagueId, fresh, arrived }) {
  return items.map(item => (item.type === 'digest'
    ? <DigestCard key={item.key} posts={item.posts} names={names} viewer={viewer} now={now} leagueId={leagueId} fresh={fresh} arrived={arrived}/>
    : <PostCard key={`${viewer}:${item.post.id}`} post={item.post} names={names} viewer={viewer} now={now} leagueId={leagueId} isNew={fresh.has(item.post.id)} arrived={arrived.has(item.post.id)}/>));
}
const useNames = feed => useMemo(() => new Map((feed.page?.members ?? []).map(member => [member.id, member])), [feed.page]);

/** The feed layer: every post, "Show older posts", and the old Community feed while the reader is not on the server. */
export function FeedView({ feed, app, leagueId = null, leagueName = 'Community', legacy = null, fresh = NONE, arrived = NONE }) {
  const shell = useShell(), names = useNames(feed);
  if (feed.status === 'legacy' || (feed.status === 'loading' && legacy && feedReaderKnown() !== true)) return legacy;
  if (feed.status === 'loading') return <Skeleton label="Loading the feed…" shape="rows" count={4}/>;
  if (feed.status === 'error' && !feed.page) return <LeagueFailure error={feed.error} onRetry={feed.retry}/>;
  const viewer = app.accountId, items = foldPosts(feed.posts, viewer);
  return <section className="gx-vstack gx-gap-16 gx-feed" aria-label={`${leagueName} feed`}>
    <FeedItems items={items} names={names} viewer={viewer} now={feed.page?.now ?? null} leagueId={leagueId} fresh={fresh} arrived={arrived}/>
    {!items.length ? <Card className="gx-vstack gx-gap-12"><p className="gx-t-body">No posts in {leagueName} yet.</p><Button onClick={() => shell.openSheet('sh.switcher')}>Invite friends</Button></Card> : null}
    {feed.error ? <p className="gx-t-body gx-c-loss" role="alert">{message(feed.error)}</p> : null}
    {feed.next ? <Button block aria-disabled={feed.busy || undefined} onClick={feed.more}>{feed.busy ? 'Loading…' : 'Show older posts'}</Button> : null}
  </section>;
}

/** The landing's two newest feed items (P6A), how many are new, and the way into the feed layer. */
export function FeedPreview({ feed, app, leagueId = null, fresh = NONE, arrived = NONE, onOpen }) {
  const names = useNames(feed), items = feed.status === 'ready' ? foldPosts(feed.posts, app.accountId).slice(0, PREVIEW_POSTS) : [];
  return <section className="gx-vstack gx-gap-12 gx-feed" aria-label="Newest posts" data-league="preview">
    <div className="gx-hstack gx-between gx-wrap gx-gap-8"><h3 className="gx-t-strong">Feed</h3>{fresh.size ? <span className="gx-t-meta gx-c-2">{plural(fresh.size, 'new post')}</span> : null}</div>
    {feed.status === 'loading' ? <Skeleton label="Loading the feed…" shape="rows" count={2}/> : null}
    <FeedItems items={items} names={names} viewer={app.accountId} now={feed.page?.now ?? null} leagueId={leagueId} fresh={fresh} arrived={arrived}/>
    <LinkRow icon="message" onClick={onOpen}>Open the feed</LinkRow>
  </section>;
}
