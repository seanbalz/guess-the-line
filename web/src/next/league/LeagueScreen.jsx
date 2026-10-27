// League uses the existing hosted readers. Community is global; a private group's
// roster and standings always come from that group's authenticated /state reply.
import { useEffect, useRef, useState } from 'react';
import { cloudApi, communityApi, date } from '../../api.js';
import { MODE, lateText, pickText, pointsPostText } from '../../communityFormat.js';
import { postPicksView } from '../../communityBoard.js';
import { nextDraftKey } from '../../nextDrafts.js';
import { useAppData } from '../data/AppData.jsx';
import { COMMUNITY } from '../data/league.js';
import { useShell } from '../shell/context.js';
import { Avatar, Button, Card, Segmented } from '../ui/index.js';
import { LeagueHistory } from './LeagueHistory.jsx';
import { PointsBoard } from '../play/points/PointsBoard.jsx';
import { LeagueEmpty, LeagueFailure, LeagueLoading, useLeagueRead } from './useLeagueRead.jsx';
// Stage 71 and the design lane: the features read gives the board its "Won Week 7" facts and week badges, and the feed
// its recap post.
import { useFeatures } from '../features/useFeatures.js';
import { RecapPost } from '../features/RecapPost.jsx';
import { BoardCard, CommunityBoard } from './LeagueBoard.jsx';
// The new feed (stages 64 and 65) draws CommunityFeed below, unchanged, while the server has no feed reader (M-22).
import { Feed, useNewPostsDot } from '../feed/Feed.jsx';
import './league.css';

// D-56: the board switcher is Spread / Total / Points. Points is its own board and never adds to Spread or Total.
const MARKETS = [...Object.entries(MODE).map(([value, label]) => ({ value, label })), { value: 'guess_points', label: 'Points' }];
const message = error => error?.status ? error.message : 'No connection. Reconnect and try again.';

const draftKey = (account, post) => nextDraftKey(account, `c-${post}`);
function readDraft(key) {
  try { const value = JSON.parse(sessionStorage.getItem(key) || 'null'); return value && typeof value.body === 'string' ? { body: value.body, requestId: value.requestId || null } : { body: '', requestId: null }; }
  catch { return { body: '', requestId: null }; }
}
function saveDraft(key, value) { try { value.body ? sessionStorage.setItem(key, JSON.stringify(value)) : sessionStorage.removeItem(key); } catch { /* In-memory copy stays editable. */ } }

function postText(post) {
  if (post.kind === 'joined') return 'joined Guess The Line.';
  if (post.kind === 'week_published') return `opened Week ${post.week}: ${post.games} games.`;
  if (post.kind === 'ballot_submitted') return `submitted Week ${post.week} ${MODE[post.mode] || ''} picks.${post.late ? ` ${lateText(post.late)}` : ''}`;
  if (post.kind === 'bet_posted') return 'posted a real slip in Bet Tracker.';
  if (post.kind === 'bet_settled') return 'settled a real slip in Bet Tracker.';
  if (post.kind === 'points_played' || post.kind === 'points_final') return pointsPostText(post);
  return 'posted an update.';
}

function FeedPost({ post, feed, app, onSaved }) {
  const key = draftKey(app.accountId, post.id), [draft, setDraft] = useState(() => readDraft(key));
  const [replyOpen, setReplyOpen] = useState(() => Boolean(readDraft(key).body));
  const [busy, setBusy] = useState(false), [problem, setProblem] = useState(''), [notice, setNotice] = useState('');
  const pending = useRef(false), current = useRef(draft);
  const name = id => feed.members?.find(member => member.id === id)?.displayName || 'Former member';
  const picks = postPicksView(post);
  function change(value) { const next = { body: value, requestId: null }; current.current = next; setDraft(next); saveDraft(key, next); }
  async function mutate(action, body) {
    if (pending.current) return false;
    pending.current = true; setBusy(true); setProblem(''); setNotice('');
    try {
      const result = await app.mutateCommunity(action, body);
      if (!result.ok) { setProblem(result.kind === 'uncertain' ? 'We could not confirm the save. Your comment is kept. Check the feed before trying again.' : result.message || 'The change was not saved. Try again.'); return false; }
      onSaved?.(action, body, result.data);
      setNotice(action === 'comment' ? 'Comment posted.' : 'Like updated.');
      return true;
    } catch (error) { setProblem(message(error)); return false; }
    finally { pending.current = false; setBusy(false); }
  }
  async function comment(event) {
    event.preventDefault();
    if (pending.current || !current.current.body.trim()) return;
    const sent = { ...current.current, requestId: current.current.requestId || crypto.randomUUID() };
    current.current = sent; setDraft(sent); saveDraft(key, sent);
    if (await mutate('comment', { postId: post.id, body: sent.body.trim(), requestId: sent.requestId })) change('');
  }
  return <Card as="article" className="gx-vstack gx-gap-12 gx-league-post" data-post={post.id} aria-label={`${name(post.actorId)} activity`}>
    <div className="gx-league-post-head"><Avatar id={post.actorId} name={name(post.actorId)} size={40}/><div className="gx-grow"><p className="gx-t-strong">{name(post.actorId)}</p><p className="gx-t-body gx-c-2">{postText(post)}</p><p className="gx-t-meta gx-c-3"><time dateTime={post.createdAt}>{date(post.createdAt)} PT</time></p></div></div>
    {picks?.shown.length > 0 && <ul className="gx-league-picks gx-t-body">{picks.shown.map(([id, value]) => { const [away, home] = id.split('-'); return <li key={id}><span>{away} at {home}</span><span className="gx-n-s">{pickText(post.mode, away, home, value)}</span></li>; })}</ul>}
    {picks && (picks.allHidden || picks.hidden > 0) && <p className="gx-t-body gx-c-2">{picks.hidden ? `${picks.hidden} games hidden` : 'Picks hidden'}. Your submission or each game's kickoff opens the permitted picks.</p>}
    <div className="gx-league-post-actions">
      <Button variant="ghost" aria-pressed={post.likedByMe === true} aria-disabled={busy || undefined} onClick={() => mutate('like', { postId: post.id, like: !post.likedByMe })}>{post.likedByMe ? 'Unlike' : 'Like'} · {post.likes || 0}</Button>
      <Button variant="ghost-2" icon="message" aria-expanded={replyOpen} aria-controls={`gx-reply-${post.id}`} onClick={() => setReplyOpen(value => !value)}>{replyOpen ? 'Close reply' : 'Write a comment'}</Button>
    </div>
    {(post.comments || []).length > 0 && <ul className="gx-league-comments gx-vstack gx-gap-12" aria-label="Comments">{post.comments.map(comment => <li key={comment.id} className="gx-league-comment"><Avatar id={comment.userId} name={name(comment.userId)} size={24}/><div className="gx-t-body"><strong>{name(comment.userId)}</strong> {comment.body}</div></li>)}</ul>}
    <form id={`gx-reply-${post.id}`} className="gx-league-reply gx-vstack gx-gap-8" onSubmit={comment} hidden={!replyOpen}>
      <label className="gx-t-body" htmlFor={`gx-comment-${post.id}`}>Comment</label>
      <textarea className="gx-input" id={`gx-comment-${post.id}`} maxLength={500} value={draft.body} readOnly={busy} onChange={event => change(event.target.value)}/>
      <Button type="submit" aria-disabled={busy || !draft.body.trim() || undefined}>{busy ? 'Saving…' : 'Post comment'}</Button>
    </form>
    {problem && <p className="gx-t-body gx-c-loss" role="alert">{problem}</p>}
    <p className="gx-t-meta gx-c-2" role="status">{notice}</p>
  </Card>;
}

function CommunityFeed({ feed, app }) {
  const [older, setOlder] = useState([]), [busy, setBusy] = useState(false), [error, setError] = useState(null), [ended, setEnded] = useState(false);
  const alive = useRef(true), control = useRef(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; control.current?.abort(); }; }, []);
  const latest = feed.posts || [], seen = new Set(latest.map(post => post.id));
  const posts = [...latest, ...older.filter(post => { if (seen.has(post.id)) return false; seen.add(post.id); return true; })];
  async function more() {
    if (busy || ended || !posts.length) return;
    setBusy(true); setError(null); control.current = new AbortController();
    try {
      const result = await communityApi('read', { before: posts.at(-1).createdAt }, control.current.signal);
      if (!alive.current) return;
      setOlder(previous => [...previous, ...(result.posts || [])]); setEnded((result.posts || []).length < 30);
    } catch (failure) { if (alive.current && failure.name !== 'AbortError') { setError(failure); if ([403, 404].includes(failure.status)) { setOlder([]); app.refresh({ only: ['community'] }); } if (failure.status === 401) app.requestSignIn?.(); } }
    finally { if (alive.current) setBusy(false); }
  }
  // The shared first page is refreshed by AppData. Keep every already loaded older post in place,
  // updating only the fields acknowledged by the server; a new comment uses its returned id.
  function saveOlder(action, body, result) {
    setOlder(previous => previous.map(post => {
      if (post.id !== body.postId) return post;
      if (action === 'like') return { ...post, likes: result.likes, likedByMe: result.likedByMe };
      if (action === 'comment' && result.id && !(post.comments || []).some(comment => comment.id === result.id)) {
        return { ...post, comments: [...(post.comments || []), { id: result.id, userId: app.accountId, body: body.body }] };
      }
      return post;
    }));
  }
  if ([403, 404].includes(error?.status)) return <LeagueFailure error={error} onRetry={async () => {
    const results = await app.refresh({ only: ['community'] });
    if (alive.current && results?.some(result => result.data && !result.error)) { setError(null); setEnded(false); }
  }}/>;
  return <section className="gx-vstack gx-gap-16" aria-label="Community activity feed">
    <p className="gx-t-body gx-c-2">Shared with every Community member.</p>
    {posts.map(post => <FeedPost key={`${app.accountId}:${post.id}`} post={post} feed={feed} app={app} onSaved={saveOlder}/>)}
    {!posts.length && <LeagueEmpty text="No activity yet." actionLabel="Refresh" onAction={() => app.refresh({ only: ['community'] })}/>}
    {error && <p className="gx-t-body gx-c-loss" role="alert">{message(error)}</p>}
    {!ended && (feed.posts || []).length >= 30 && <Button aria-disabled={busy || undefined} onClick={more}>{busy ? 'Loading…' : 'Older activity'}</Button>}
  </section>;
}

function PrivateLeague({ app, shell, mode, features }) {
  const id = app.league.id;
  const read = useLeagueRead(`${app.accountId}:${id}:${mode}`, signal => cloudApi('state', undefined, { league: id, mode, signal }), error => {
    if (error.status === 401) app.requestSignIn?.(); else app.refresh({ only: ['lobby'] });
  });
  if (read.loading) return <LeagueLoading label="Loading this league…"/>;
  if (read.error) return <LeagueFailure error={read.error} onRetry={read.retry}/>;
  const data = read.data;
  if (data?.league?.id !== id) return <LeagueFailure error={{ status: 403, message: 'This league is not available to this account.' }} onRetry={read.retry}/>;
  const hasScore = row => Number.isFinite(row.points) && Number(row.scoredGames) > 0;
  const standings = data.standings || [], scored = standings.filter(hasScore);
  // The group's own ranking from its /state reply (competition ranks, ties shared): ranked rows first, then the rest.
  const rows = standings.map(row => ({ id: row.id, name: row.name, you: row.id === data.playerId, source: row,
    points: hasScore(row) ? row.points : null,
    rank: hasScore(row) ? 1 + scored.filter(other => other.points > row.points).length : null,
    tied: hasScore(row) && scored.filter(other => other.points === row.points).length > 1 }))
    .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));
  return <section className="gx-vstack gx-gap-12" aria-label="Private league standings">
    <h2 className="gx-t-section">{MODE[mode]} standings</h2>
    <p className="gx-t-body gx-c-2">Week {data.league.week} · {data.league.name}. Only this group's members appear here.</p>
    <BoardCard app={app} shell={shell} league={id} mode={mode} rows={rows} label="Private group members" features={features}
      rowProps={row => ({ figure: `${id}.${mode}.points.${row.id}`, before: `${row.source.satOut ? 'Sat out' : row.source.submitted ? 'Submitted' : 'Not submitted'} · `, after: row.points === null ? '' : ' pts', missing: 'Not scored yet' })}/>
    <p className="gx-t-meta gx-c-2">{data.league.practice ? 'Practice results · unofficial. ' : ''}— means no scored result. Weekly guesses are reused across groups; each group keeps its own roster.</p>
    <Button onClick={read.retry}>Refresh group</Button>
    <RecapPost model={features}/>
    <Feed key={`${app.accountId}:${id}`} app={app} leagueId={id} leagueName={data.league.name} legacy={null}/>
    <Button variant="ghost" onClick={() => app.chooseLeague(COMMUNITY)}>Open Community feed and history</Button>
  </section>;
}

export function LeagueScreen() {
  const app = useAppData(), shell = useShell(), view = shell.state.views.league || {};
  const mode = view.market === 'total' || view.market === 'guess_total' ? 'guess_total' : view.market === 'points' || view.market === 'guess_points' ? 'guess_points' : 'guess_spread';
  const section = ['board', 'history', 'feed'].includes(view.view) ? view.view : 'feed';
  const community = app.league.community === true, feed = app.community.data;
  const features = useFeatures(app, shell);
  const dot = useNewPostsDot(app) && section !== 'feed';
  const feedLabel = dot ? <>Feed<span className="gx-feed-dot" aria-hidden="true"></span><span className="gx-sr-only">, new posts</span></> : 'Feed';
  return <div className="gx-screen gx-league">
    <div className="gx-league-heading"><div className="gx-hstack gx-between gx-wrap gx-gap-8"><h1 className="gx-t-title">League</h1><Button variant="ghost" onClick={() => shell.openSheet('sh.switcher')}>Your leagues</Button></div>
      <p className="gx-t-body gx-c-2">{app.league.name}</p></div>
    <Button onClick={() => shell.go('play', { section: 'compare', season: feed?.week?.season ?? null, week: feed?.week?.week ?? null, period: 'week', comparisonKind: 'all', players: [], team: '', matchup: '' })}>Compare players in {app.league.name}</Button>
    {community && <Segmented label="League sections" options={[{ value: 'feed', label: feedLabel }, { value: 'board', label: 'Boards' }, { value: 'history', label: 'History' }]} value={section} onChange={value => shell.setView('league', { view: value })}/>}
    {(!community || section === 'board') && <Segmented label="Standings market" options={MARKETS} value={mode} onChange={value => shell.setView('league', { market: value })}/>}
    {!community ? mode === 'guess_points' ? <PointsBoard key={`${app.accountId}:${app.league.id}`} app={app} groupId={app.league.id}/> : <PrivateLeague key={`${app.accountId}:${app.league.id}`} app={app} shell={shell} mode={mode} features={features.model}/>
      : !feed ? app.community.error ? <LeagueFailure error={app.community.error} onRetry={() => app.refresh({ only: ['community'] })}/> : <LeagueLoading label="Loading the Community…"/>
      : section === 'board' ? mode === 'guess_points' ? <PointsBoard key={app.accountId} app={app}/> : <CommunityBoard feed={feed} mode={mode} features={features.model} app={app} shell={shell}/>
      : section === 'history' ? <LeagueHistory key={app.accountId} app={app}/>
      : <>
        <RecapPost model={features.model}/>
        <Feed key={app.accountId} app={app} leagueName={app.league.name} legacy={<CommunityFeed key={app.accountId} feed={feed} app={app}/>}
          onRefused={error => { if (error.status === 401) app.requestSignIn?.(); else app.refresh({ only: ['community'] }); }}/>
      </>}
    {community && <Button variant="ghost" onClick={() => app.refresh({ only: ['community'] })}>Refresh Community</Button>}
  </div>;
}
