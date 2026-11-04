// League, a Play layer, board first (D-69 step 1, Sean's P6A). The landing is the board for the market showing, the recap, the
// two newest posts and "Open the feed", then History. The feed and History are layers with their own addresses (leagueModel
// `leagueLayer`). League uses the existing hosted readers: Community is global; a private group's roster and standings
// always come from that group's authenticated /state reply.
import { useEffect, useRef, useState } from 'react';
import { cloudApi, communityApi, date } from '../../api.js';
import { MODE, lateText, pickText, pointsPostText } from '../../communityFormat.js';
import { postPicksView } from '../../communityBoard.js';
import { nextDraftKey } from '../../nextDrafts.js';
import { useAppData } from '../data/AppData.jsx';
import { COMMUNITY, communityPlayers } from '../data/league.js';
import { useShell } from '../shell/context.js';
import { Avatar, Button, Card, InfoButton, LinkRow, Matchup, Segmented } from '../ui/index.js';
import { LeagueHistory } from './LeagueHistory.jsx';
import { PointsBoard } from '../play/points/PointsBoard.jsx';
import { LeagueEmpty, LeagueFailure, LeagueLoading, useLeagueRead } from './useLeagueRead.jsx';
// Stage 71 and the design lane: the features read gives the board its "Won Week 7" facts and week badges, and the feed
// its recap post.
import { useFeatures } from '../features/useFeatures.js';
import { RecapPost } from '../features/RecapPost.jsx';
import { BOARD_NOTES, BoardCard, CommunityBoard } from './LeagueBoard.jsx';
// The new feed (stages 64 and 65) draws CommunityFeed below, unchanged, while the server has no feed reader (M-22).
import { PlayLayer } from '../play/PlayLayer.jsx';
import { FeedPreview, FeedView, useFeedSeen, usePostArrivals, useSeenSince } from '../feed/Feed.jsx';
import { useLeagueFeed } from '../feed/useLeagueFeed.js';
import { leagueLayer, leagueMode, lipIsBack, newPostIds } from './leagueModel.js';
import { SCOPES } from '../moments/catalog.js';
import './league.css';
import { useMomentScope } from '../moments/MomentsProvider.jsx';

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
    {picks?.shown.length > 0 && <ul className="gx-league-picks gx-t-body">{picks.shown.map(([id, value]) => { const [away, home] = id.split('-'); return <li key={id}><Matchup away={away} home={home}/><span className="gx-n-s">{pickText(post.mode, away, home, value)}</span></li>; })}</ul>}
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

function PrivateLeague({ app, shell, mode, features, onRead }) {
  const id = app.league.id;
  const read = useLeagueRead(`${app.accountId}:${id}:${mode}`, signal => cloudApi('state', undefined, { league: id, mode, signal }), error => {
    onRead?.(error);
    if (error.status === 401) app.requestSignIn?.(); else app.refresh({ only: ['lobby'] });
  });
  const answered = read.data !== null && read.data !== undefined;
  useEffect(() => { if (answered) onRead?.(null); }, [answered]); // eslint-disable-line react-hooks/exhaustive-deps
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
    <p className="gx-t-meta gx-c-2">Week {data.league.week}{data.league.practice ? ' · Practice results · unofficial' : ''}</p>
    <BoardCard app={app} shell={shell} league={id} mode={mode} rows={rows} label="Private group members" features={features} read={data} fresh
      rowProps={row => ({ figure: `${id}.${mode}.points.${row.id}`, sub: `${row.source.satOut ? 'Sat out' : row.source.submitted ? 'Submitted' : 'Not submitted'}${row.points === null ? ' · Not scored yet' : ''}` })}/>
  </section>;
}

export const LEAGUE_COPY = Object.freeze({
  heading: 'League', switcher: 'Your leagues', feed: 'Feed', history: 'History', seasons: 'Seasons and weeks',
  communityHistory: 'Community history', about: 'About the board', loading: 'Loading the Community…', members: n => `${n} member${n === 1 ? '' : 's'}`,
});

/** The landing (P6A): the board for the market showing, the recap, the two newest posts, then History. */
function BoardLanding({ app, shell, mode, features, feed, fresh, arrived, waiting, set, gone, onRead }) {
  const community = app.league.community === true, data = app.community.data;
  const players = community ? communityPlayers(data) : app.leagues?.find(row => row.on)?.players ?? null;
  const meta = [Number.isInteger(players) ? LEAGUE_COPY.members(players) : null, community && data?.week ? `Week ${data.week.week}` : null].filter(Boolean).join(' · ');
  const board = waiting ?? (mode === 'guess_points' ? <PointsBoard key={`${app.accountId}:${app.league.id}`} app={app} groupId={community ? null : app.league.id}/>
    : community ? <CommunityBoard feed={data} mode={mode} features={features} app={app} shell={shell} fresh={app.community.status === 'ready' && !app.community.error}/>
    : <PrivateLeague key={`${app.accountId}:${app.league.id}`} app={app} shell={shell} mode={mode} features={features} onRead={onRead}/>);
  // History is Community-wide: from a group it switches to the Community, as today's "Open Community feed and history" did.
  const history = () => { if (!community) app.chooseLeague(COMMUNITY); set({ view: 'history', week: null }); };
  return <PlayLayer label="League board" layer="league" title={app.league.name} info={<InfoButton title={LEAGUE_COPY.about} body={community ? BOARD_NOTES.community : BOARD_NOTES.group}/>}>
    {meta ? <p className="gx-t-meta gx-c-2">{meta}</p> : null}
    <Segmented label="Standings market" options={MARKETS} value={mode} onChange={value => set({ market: value })}/>
    {board}
    <RecapPost model={features}/>
    {gone ? null : <FeedPreview feed={feed} app={app} leagueId={community ? null : app.league.id} fresh={fresh} arrived={arrived} onOpen={() => set({ view: 'feed' })}/>}
    <LinkRow icon="clock" onClick={history}>{community ? <>{LEAGUE_COPY.history}<span className="gx-t-meta gx-c-2"> · {LEAGUE_COPY.seasons}</span></> : LEAGUE_COPY.communityHistory}</LinkRow>
  </PlayLayer>;
}

export function LeagueScreen() {
  useMomentScope(SCOPES.league);
  const app = useAppData(), shell = useShell(), view = shell.state.views.league || {};
  const place = leagueLayer(view), mode = leagueMode(view.market);
  const community = app.league.community === true, leagueId = community ? null : app.league.id;
  const features = useFeatures(app, shell);
  const feed = useLeagueFeed({ accountId: app.accountId, leagueId, onRefused: error => { if (error.status === 401) app.requestSignIn?.(); else app.refresh({ only: [community ? 'community' : 'lobby'] }); } });
  // A private group that refused its read shows none of its posts: not in the landing's preview, not in the feed layer.
  const [refusal, setRefusal] = useState(null), groupKey = `${app.accountId}:${app.league.id}`;
  const onRead = error => setRefusal(error ? { key: groupKey, error } : null);
  const gone = !community && refusal?.key === groupKey ? refusal.error : null;
  useFeedSeen(app.accountId, leagueId, feed);
  const since = useSeenSince(app.accountId, leagueId), arrived = usePostArrivals(feed.page, `${app.accountId}:${leagueId ?? 'community'}`);
  const fresh = newPostIds(feed.posts, app.accountId, since);
  const set = patch => shell.setView('league', patch);
  // A lip is Back when its layer is the place underneath (D-66), else a step to it.
  const lip = (key, label, layer, patch) => ({ key, label, open: () => (lipIsBack(shell.state.trail, layer) ? shell.back() : set(patch)) });
  const toBoard = lip('league', LEAGUE_COPY.heading, 'board', { view: 'board', week: null });
  const waiting = community && !app.community.data ? app.community.error ? <LeagueFailure error={app.community.error} onRetry={() => app.refresh({ only: ['community'] })}/> : <LeagueLoading label={LEAGUE_COPY.loading}/> : null;
  let body;
  if (place.layer === 'feed') {
    body = <PlayLayer label="League feed" parents={[toBoard]} layer="league:feed" title={LEAGUE_COPY.feed}>
      {gone ? <LeagueFailure error={gone} onRetry={() => { setRefusal(null); app.refresh({ only: ['lobby'] }); feed.retry(); }}/> : waiting ?? <FeedView feed={feed} app={app} leagueId={leagueId} leagueName={app.league.name} fresh={fresh} arrived={arrived}
        legacy={community ? <CommunityFeed key={app.accountId} feed={app.community.data} app={app}/> : null}/>}
    </PlayLayer>;
  } else if (community && place.layer !== 'board') {
    body = <LeagueHistory key={app.accountId} app={app} place={place} mode={mode} parents={[toBoard]} onPlace={set}
      historyLip={lip('history', LEAGUE_COPY.history, 'history', { week: null })}
      onScore={(season, week, market) => shell.go('play', { section: 'score', season, week, market: market === 'guess_total' ? 'total' : 'spread' })}/>;
  } else {
    body = <BoardLanding app={app} shell={shell} mode={mode} features={features.model} feed={feed} fresh={fresh} arrived={arrived} waiting={waiting} set={set} gone={Boolean(gone)} onRead={onRead}/>;
  }
  return <div className="gx-screen gx-league">
    <div className="gx-league-heading"><div className="gx-hstack gx-between gx-wrap gx-gap-8"><h1 className="gx-t-title">{LEAGUE_COPY.heading}</h1><Button variant="ghost" onClick={() => shell.openSheet('sh.switcher')}>{LEAGUE_COPY.switcher}</Button></div></div>
    {body}
  </div>;
}
