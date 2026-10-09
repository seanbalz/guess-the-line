import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Bell, CalendarPlus, Heart, LoaderCircle, MessageCircle, RefreshCw, Send, TriangleAlert, Users } from 'lucide-react';
import Brand from './Brand';
import ThemeSelector from './Theme';
import ChipPicker from './ChipPicker';
import TeamFacts from './TeamFacts';
import { cloudApi, communityApi, date } from './api';
import { TEAM_NAMES } from '../../shared/nfl-schedule.mjs';
import './community.css';

const MODE = { guess_spread: 'Spread', guess_total: 'Total' };
const show = n => (Number.isInteger(n) ? String(n) : Number(n).toFixed(1));
const team = code => TEAM_NAMES[code] || code;
const shortName = code => team(code).split(' ').at(-1);

function PicksDue({ due, onPick }) {
  if (!due || ['none', 'done'].includes(due.state)) return null;
  const closed = due.state === 'closed';
  return <section className={`panel picks-due ${due.state}`} role={due.state === 'urgent' ? 'alert' : 'status'}>
    <Bell size={22} aria-hidden="true"/>
    <div><h2>{closed ? `Week ${due.week} picks closed` : `Week ${due.week} picks due`}</h2>
      <p>{due.modes.map(m => `${MODE[m.mode]} ${m.filled}/${m.games}`).join(' · ')} · {closed ? 'Deadline passed' : `Due ${date(due.deadline)} PT`}</p></div>
    {!closed && <button className="primary" onClick={onPick}>Make picks<ArrowRight size={17}/></button>}
  </section>;
}

function Leaderboard({ feed }) {
  const name = id => feed.members.find(m => m.id === id)?.displayName || 'Former member';
  const rows = feed.members.map(m => {
    const get = mode => feed.standings.find(s => s.userId === m.id && s.mode === mode);
    const spread = get('guess_spread'), total = get('guess_total');
    return { id: m.id, spread, total, season: (spread?.seasonPoints || 0) + (total?.seasonPoints || 0) };
  }).sort((a, b) => b.season - a.season || name(a.id).localeCompare(name(b.id)));
  const cell = (s, key) => (s ? show(s[key]) : '—');
  return <section className="panel community-leaderboard" aria-label="Leaderboard">
    <div className="section-title"><h2>Leaderboard · {feed.week ? `${feed.week.season} season` : 'season'}</h2></div>
    <div className="table-scroll"><table><caption className="sr-only">Spread and Total points by member</caption>
      <thead><tr><th scope="col">Player</th><th scope="col">Spread wk</th><th scope="col">Spread season</th><th scope="col">Total wk</th><th scope="col">Total season</th></tr></thead>
      <tbody>{rows.map(r => <tr key={r.id} className={r.id === feed.viewer ? 'me' : ''}><th scope="row">{name(r.id)}</th>
        <td className="mono">{cell(r.spread, 'weekPoints')}</td><td className="mono">{cell(r.spread, 'seasonPoints')}</td>
        <td className="mono">{cell(r.total, 'weekPoints')}</td><td className="mono">{cell(r.total, 'seasonPoints')}</td></tr>)}</tbody></table></div>
    <p className="muted small">Points are fixed when each pick is saved against that moment's consensus. — means no submitted ballot. Challenge and Units records stay in each group.</p>
  </section>;
}

function PostText({ post, name }) {
  const who = <strong>{name(post.actorId)}</strong>;
  switch (post.kind) {
    case 'joined': return <p>{who} joined Guess The Line.</p>;
    case 'week_published': return <p>{who} opened <strong>Week {post.week}</strong>: {post.games} games, picks due {date(post.deadline)} PT.</p>;
    case 'ballot_submitted': return <p>{who} submitted Week {post.week} {MODE[post.mode]} picks.</p>;
    case 'bet_posted': return <p>{who} posted a bet in Bet Tracker.</p>;
    case 'bet_settled': return <p>{who} settled a Bet Tracker bet.</p>;
    default: return null;
  }
}

function PostPicks({ post }) {
  if (post.kind !== 'ballot_submitted') return null;
  if (post.picksHidden) return <p className="muted small">Submit your Week {post.week} {MODE[post.mode]} picks to see these.</p>;
  if (!post.picks) return null;
  const entries = Object.entries(post.picks);
  return <ul className="post-picks mono">{entries.map(([gameId, value]) => {
    const [away, home] = gameId.split('-');
    const text = post.mode === 'guess_total' ? `${show(value)}` : value === 0 ? "PK" : `${shortName(value < 0 ? home : away)} −${show(Math.abs(value))}`;
    return <li key={gameId}><span>{away} @ {home}</span><span>{text}</span></li>;
  })}</ul>;
}

function Post({ post, name, onLike, onComment, busy }) {
  const [draft, setDraft] = useState(''), request = useRef(null);
  async function submit(event) {
    event.preventDefault();
    const body = draft.trim(); if (!body) return;
    request.current ||= crypto.randomUUID();
    if (await onComment(post.id, body, request.current)) { setDraft(''); request.current = null; }
  }
  return <article className="panel feed-post">
    <div className="feed-post-head"><PostText post={post} name={name}/><time className="muted small" dateTime={post.createdAt}>{date(post.createdAt)} PT</time></div>
    <PostPicks post={post}/>
    <div className="feed-actions">
      <button className={`text-button ${post.likedByMe ? 'liked' : ''}`} aria-pressed={post.likedByMe} disabled={busy} onClick={() => onLike(post.id, !post.likedByMe)}><Heart size={17} fill={post.likedByMe ? 'currentColor' : 'none'}/>{post.likes}<span className="sr-only"> likes</span></button>
      <span className="muted small"><MessageCircle size={16}/>{post.comments.length}</span>
    </div>
    {!!post.comments.length && <ul className="feed-comments">{post.comments.map(c => <li key={c.id}><strong>{name(c.userId)}</strong> {c.body}</li>)}</ul>}
    <form className="feed-comment-form" onSubmit={submit}>
      <label className="sr-only" htmlFor={`comment-${post.id}`}>Comment</label>
      <input id={`comment-${post.id}`} maxLength={500} placeholder="Add a comment" value={draft} disabled={busy} onChange={e => { setDraft(e.target.value); request.current = null; }}/>
      <button className="secondary" aria-label="Post comment" disabled={busy || !draft.trim()}><Send size={16}/></button>
    </form>
  </article>;
}

function PublishWeek({ week, onDone }) {
  const [season, setSeason] = useState(week?.season || new Date().getFullYear()), [number, setNumber] = useState((week?.week || 0) + 1);
  const [preview, setPreview] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function run(action) {
    setBusy(true); setError('');
    try {
      const result = await communityApi(action, { season: Number(season), week: Number(number) });
      if (action === 'publish-preview') setPreview(result); else { setPreview(null); await onDone(result.published ? `Week ${result.week} is open.` : `Week ${result.week} was already open.`); }
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <section className="panel publish-week" aria-label="Publish week">
    <div className="section-title"><h2><CalendarPlus size={18}/>Publish a week</h2></div>
    <p className="muted small">Commissioner only. Loads the public NFL schedule for review; nothing changes until you publish.</p>
    <div className="publish-fields"><label>Season<input type="number" value={season} min={2000} max={2200} onChange={e => { setSeason(e.target.value); setPreview(null); }} disabled={busy}/></label>
      <label>Week<input type="number" value={number} min={1} max={25} onChange={e => { setNumber(e.target.value); setPreview(null); }} disabled={busy}/></label>
      <button className="secondary" disabled={busy} onClick={() => run('publish-preview')}>Review schedule</button></div>
    {error && <div className="error-banner" role="alert"><TriangleAlert size={18}/><span>{error}</span></div>}
    {preview && <>
      <ul className="publish-preview mono">{preview.games.map(g => <li key={g.id}><span>{g.matchup}{g.neutral ? ' (neutral)' : ''}</span><span>{date(g.kickoff)} PT</span></li>)}</ul>
      <p>Picks lock {date(preview.deadline)} PT · {preview.games.length} games</p>
      <button className="primary" disabled={busy} onClick={() => run('publish')}>Publish Week {preview.week}</button>
    </>}
  </section>;
}

function WeekPicks({ onSaved }) {
  const [data, setData] = useState(null), [mode, setMode] = useState('guess_spread'), [picks, setPicks] = useState({});
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const request = useRef(null);
  const load = useCallback(async () => { const result = await cloudApi('personal'); setData(result); return result; }, []);
  useEffect(() => { load().catch(e => setError(e.message)); }, [load]);
  useEffect(() => { if (data) setPicks(Object.fromEntries(data.games.map(g => [g.id, data.ballots[mode]?.picks?.[g.id] ?? '']))); }, [data, mode]);
  if (!data) return error ? <div className="error-banner" role="alert">{error}</div> : <p role="status"><LoaderCircle className="spin"/>Loading this week…</p>;
  const ballot = data.ballots[mode], submitted = !!ballot?.submittedAt, closed = Date.parse(data.now) >= Date.parse(data.deadline);
  const filled = Object.values(picks).filter(v => v !== '').length;
  const dirty = data.games.some(g => String(picks[g.id]) !== String(ballot?.picks?.[g.id] ?? ''));
  async function save(submit) {
    setBusy(true); setError(''); setNotice('');
    const body = { season: data.season, week: data.week, mode, weeklyRevision: data.weeklyRevision, submit,
      picks: Object.fromEntries(Object.entries(picks).filter(([, v]) => v !== '').map(([k, v]) => [k, Number(v)])) };
    const serialized = JSON.stringify({ body, revision: data.revision });
    if (request.current?.serialized !== serialized) request.current = { serialized, requestId: crypto.randomUUID() };
    try {
      await cloudApi('personal/ballot', { ...body, requestId: request.current.requestId, revision: data.revision });
      request.current = null; await load();
      setNotice(submit || submitted ? `${MODE[mode]} picks submitted.` : 'Draft saved.'); onSaved?.();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <section className="week-picks">
    <div className="personal-actions" role="group" aria-label="Market">{Object.entries(MODE).map(([m, label]) =>
      <button key={m} className={mode === m ? 'primary' : 'secondary'} aria-pressed={mode === m} disabled={busy || (dirty && mode !== m)} onClick={() => setMode(m)}>
        {label}{data.ballots[m]?.submittedAt ? ' ✓' : ''}</button>)}</div>
    <p className="muted">Week {data.week} · {filled}/{data.games.length} picked · {closed ? 'Closed' : `Due ${date(data.deadline)} PT`}{submitted ? ' · Submitted, editable until the deadline' : ''}</p>
    {error && <div className="error-banner" role="alert"><TriangleAlert size={18}/><span>{error}</span></div>}
    {notice && <p className="auth-notice" role="status">{notice}</p>}
    <div className="week-pick-list">{data.games.map(g => <article className="panel week-pick" key={g.id}>
      <h3>{team(g.awayCode)} @ {team(g.homeCode)}</h3>
      <p className="muted small">{date(g.kickoff)} PT</p>
      <TeamFacts week={data.week} awayCode={g.awayCode} homeCode={g.homeCode}/>
      <ChipPicker key={`${mode}-${g.id}-${data.weeklyRevision}`} mode={mode} value={picks[g.id]} away={shortName(g.awayCode)} home={shortName(g.homeCode)}
        label={`${team(g.awayCode)} at ${team(g.homeCode)} ${MODE[mode]}`} disabled={busy || closed} onChange={value => setPicks(p => ({ ...p, [g.id]: value }))}/>
    </article>)}</div>
    {!closed && <div className="save-bar"><strong>{filled}/{data.games.length} ready</strong>
      {!submitted && <button className="secondary" disabled={busy || !dirty} onClick={() => save(false)}>Save draft</button>}
      <button className="primary" disabled={busy || filled !== data.games.length || (submitted && !dirty)} onClick={() => save(true)}>{submitted ? 'Save changes' : `Submit ${MODE[mode]}`}</button></div>}
  </section>;
}

export default function CommunityHome({ onGroups, onSignOut, displayName, onUnavailable }) {
  const [tab, setTab] = useState('feed'), [feed, setFeed] = useState(null), [older, setOlder] = useState([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const load = useCallback(async () => { const result = await communityApi('read', {}); setFeed(result); setOlder([]); return result; }, []);
  // Until the community service is deployed (or during an outage), fall back to the groups screen.
  useEffect(() => { load().catch(e => { if (onUnavailable && (!e.status || [404, 503].includes(e.status))) onUnavailable(); else setError(e.message); }); }, [load, onUnavailable]);
  const name = id => feed?.members.find(m => m.id === id)?.displayName || 'Former member';
  async function act(fn) { setBusy(true); setError(''); try { return await fn(); } catch (e) { setError(e.message); return false; } finally { setBusy(false); } }
  const like = (postId, value) => act(async () => { await communityApi('like', { postId, like: value }); await load(); });
  const comment = (postId, body, requestId) => act(async () => { await communityApi('comment', { postId, body, requestId }); await load(); return true; });
  const more = () => act(async () => {
    const posts = [...feed.posts, ...older]; const result = await communityApi('read', { before: posts.at(-1).createdAt });
    setOlder(o => [...o, ...result.posts]);
  });
  const posts = feed ? [...feed.posts, ...older] : [];
  const due = feed?.picksDue && feed.picksDue.state !== 'none' && feed.picksDue.state !== 'done' ? feed.picksDue.modes.length : 0;
  return <div className="hub-shell community-home">
    <a className="skip-link" href="#main">Skip to main content</a>
    <header className="hub-header"><Brand/><div className="hub-account"><span>{displayName}</span></div></header>
    <main className="hub-main" id="main"><ThemeSelector/>
      <div className="hub-heading"><div><p className="eyebrow">CALL THE NUMBER. OWN THE BOARD.</p><h1>Community</h1><p>Everyone's calls, scores and bets in one place.</p></div><Users size={28} aria-hidden="true"/></div>
      <nav className="community-tabs" aria-label="Community sections">
        {[['feed', 'Feed'], ['picks', `Picks${due ? ` (${due} due)` : ''}`]].map(([key, label]) =>
          <button key={key} className={tab === key ? 'primary' : 'secondary'} aria-pressed={tab === key} onClick={() => setTab(key)}>{label}</button>)}
        <button className="secondary" onClick={onGroups}>Groups & games<ArrowRight size={16}/></button>
      </nav>
      {error && <div className="error-banner" role="alert"><TriangleAlert size={18}/><span>{error}</span></div>}
      {notice && <p className="auth-notice" role="status">{notice}</p>}
      {tab === 'picks' ? <WeekPicks onSaved={() => load().catch(() => {})}/> : !feed ? !error && <p role="status"><LoaderCircle className="spin"/>Loading the feed…</p> : <>
        <PicksDue due={feed.picksDue} onPick={() => setTab('picks')}/>
        <Leaderboard feed={feed}/>
        {feed.admin && <PublishWeek week={feed.week} onDone={async message => { setNotice(message); await load(); }}/>}
        <section className="community-feed" aria-label="Activity feed">
          {posts.map(post => <Post key={post.id} post={post} name={name} busy={busy} onLike={like} onComment={comment}/>)}
          {!posts.length && <p className="panel">No activity yet.</p>}
          {feed.posts.length >= 30 && <button className="secondary" disabled={busy} onClick={more}>Older activity</button>}
        </section>
      </>}
      <div className="hub-bottom"><span>Signed in as {displayName}. Everything here is shared with every member.</span>
        <button className="text-button" disabled={busy} onClick={() => act(load)}><RefreshCw size={16}/>Refresh</button>
        <button className="secondary" disabled={busy} onClick={onSignOut}>Sign out</button></div>
    </main>
  </div>;
}
