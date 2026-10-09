import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Bell, BellOff, BellRing, CalendarClock, CalendarPlus, Heart, LoaderCircle, MessageCircle, RefreshCw, Send, TriangleAlert, Users } from 'lucide-react';
import Brand from './Brand';
import ThemeSelector from './Theme';
import ChipPicker from './ChipPicker';
import TeamFacts from './TeamFacts';
import SitOutWeek from './SitOutWeek';
import { cloudApi, communityApi, date } from './api';
import { TEAM_NAMES, weekOpenAt } from '../../shared/nfl-schedule.mjs';
import './community.css';

const MODE = { guess_spread: 'Spread', guess_total: 'Total' };
const DAY = 86_400_000;
const show = n => (Number.isInteger(n) ? String(n) : Number(n).toFixed(1));
const team = code => TEAM_NAMES[code] || code;
const shortName = code => team(code).split(' ').at(-1);
// D-24: "Mon, Oct 12, 12:00 AM" — the week's Monday 00:00 Pacific open.
const opensText = (week, opensAt) => `Week ${week} opens ${date(opensAt, { weekday: 'short' })} PT`;
const dueText = deadline => `Picks due ${date(deadline, { weekday: 'short' })} PT`;
// "In 3 days" until the Monday open, judged against the handler clock the feed carries (the device clock only as a fallback).
const inDays = (opensAt, now) => { const days = Math.ceil((Date.parse(opensAt) - (now ? Date.parse(now) : Date.now())) / DAY); return days <= 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`; };
// The Monday open after a closed week (D-24).
const nextOpenAt = deadline => weekOpenAt(Date.parse(deadline) + 7 * DAY);
const HELP_KEY = 'gtl.chipHelp';

// D-22: NFL is the only live league; the rest are "Coming soon" with no games, picks, schedules or odds.
// Windows are typical season timing, not dates for a specific season.
const LEAGUES = [
  { key: 'nfl', label: 'NFL', live: true },
  { key: 'nba', label: 'NBA', name: 'NBA', window: 'Regular season typically runs late October to mid-April.' },
  { key: 'mlb', label: 'MLB', name: 'MLB', window: 'Regular season typically runs late March to late September.' },
  { key: 'nhl', label: 'NHL', name: 'NHL', window: 'Regular season typically runs early October to mid-April.' },
  { key: 'cfb', label: 'CFB', name: 'College Football', window: 'Season typically runs late August to early January.' },
  { key: 'cbb', label: 'CBB', name: 'College Basketball', window: 'Season typically runs early November to early April.' },
];
const COMING_SOON = LEAGUES.filter(l => !l.live);

function LeagueSwitcher({ league, onSelect }) {
  return <div className="league-switcher" role="group" aria-label="League">
    {LEAGUES.map(l => <button key={l.key} className={`league-chip ${league === l.key ? 'selected' : ''}`} aria-pressed={league === l.key} onClick={() => onSelect(l.key)}>
      <span className="league-chip-name">{l.name || l.label}</span>
      <span className={`league-chip-state ${l.live ? 'live' : 'soon'}`}>{l.live ? 'Live' : 'Coming soon'}</span>
    </button>)}
  </div>;
}

function ComingSoonCard({ league, feed, busy, onNotify }) {
  const on = !!feed?.interests?.includes(league.key), count = feed?.interestCounts?.[league.key] ?? 0;
  return <article className="panel coming-soon-card" data-league={league.key} aria-label={`${league.name} coming soon`}>
    <div className="coming-soon-head"><span className="league-badge" aria-hidden="true">{league.label}</span>
      <div><h3>{league.name}</h3><p className="coming-soon-tag"><CalendarClock size={15} aria-hidden="true"/>Coming soon</p></div></div>
    <p className="muted small">Typical season window: {league.window}</p>
    <div className="coming-soon-actions">
      <button className={on ? 'primary' : 'secondary'} aria-pressed={on} disabled={busy || !feed} onClick={() => onNotify(league.key, !on)}>
        {on ? <BellRing size={16} aria-hidden="true"/> : <BellOff size={16} aria-hidden="true"/>}Notify me<span className="sr-only"> when {league.name} opens</span></button>
      <span className="muted small">{on ? "On · we'll post here when it opens" : 'Off'} · {count} {count === 1 ? 'member' : 'members'} waiting</span>
    </div>
  </article>;
}

function ComingSoon({ feed, busy, onNotify }) {
  return <section className="coming-soon" aria-labelledby="coming-soon-title">
    <div className="section-title"><h2 id="coming-soon-title">Coming soon</h2></div>
    <p className="muted small">NFL is the only live league. These leagues have no games, picks or odds yet.</p>
    <div className="coming-soon-grid">{COMING_SOON.map(l => <ComingSoonCard key={l.key} league={l} feed={feed} busy={busy} onNotify={onNotify}/>)}</div>
  </section>;
}

/** No published week: a quiet state on the feed and the Picks tab, never an error (persona audit #14). */
function WeekUnpublished() {
  return <section className="panel week-unpublished" role="status"><CalendarClock size={22} aria-hidden="true"/>
    <p>No week is open yet. Weeks open automatically Monday 12:00 AM PT once the schedule is published; picks due will show here.</p></section>;
}

function PicksDue({ due, all = [], onPick }) {
  if (!due || ['none', 'done'].includes(due.state)) return null;
  const closed = due.state === 'closed', notOpen = due.state === 'not_open';
  // Persona audit #15: a submitted market stays on the card with a check; a sat-out market is never due (D-23), so it is left off.
  const modes = all.length ? all.filter(m => !m.satOut) : due.modes;
  const stillDue = !closed && modes.some(m => m.submitted) ? ' still due' : '';
  const counts = modes.map(m => (m.submitted ? `${MODE[m.mode]} ✓ submitted` : `${MODE[m.mode]} ${m.filled}/${m.games}${stillDue}`)).join(' · ');
  // #43: before the open, no counts for a ballot nobody can touch; a relative hint and the due time instead. #13: the next Monday open after a closed week.
  const detail = notOpen ? `${inDays(due.opensAt, due.now)} · ${dueText(due.deadline)}` : closed ? `${counts} · Deadline passed · ${opensText(due.week + 1, nextOpenAt(due.deadline))}` : `${counts} · Due ${date(due.deadline)} PT`;
  return <section id="picks-due" tabIndex={-1} className={`panel picks-due ${due.state}`} role={due.state === 'urgent' ? 'alert' : 'status'}>
    <Bell size={22} aria-hidden="true"/>
    <div><h2>{notOpen ? opensText(due.week, due.opensAt) : closed ? `Week ${due.week} picks closed` : `Week ${due.week} picks due`}</h2><p>{detail}</p></div>
    {!closed && !notOpen && <button className="primary" onClick={onPick}>Make picks<ArrowRight size={17}/></button>}
  </section>;
}

function Leaderboard({ feed }) {
  const name = id => feed.members.find(m => m.id === id)?.displayName || 'Former member';
  const rows = feed.members.map(m => {
    const get = mode => feed.standings.find(s => s.userId === m.id && s.mode === mode);
    const spread = get('guess_spread'), total = get('guess_total');
    return { id: m.id, removed: m.removed, spread, total, season: (spread?.seasonPoints || 0) + (total?.seasonPoints || 0) };
  }).sort((a, b) => b.season - a.season || name(a.id).localeCompare(name(b.id)));
  // D-23: a sat-out week reads "Sat out", never 0.
  const cell = (s, key) => (!s ? '—' : key === 'weekPoints' && s.satOut ? 'Sat out' : show(s[key]));
  return <section className="panel community-leaderboard" aria-label="Leaderboard">
    <div className="section-title"><h2>Leaderboard · {feed.week ? `${feed.week.season} season` : 'season'}</h2></div>
    <div className="table-scroll"><table><caption className="sr-only">Spread and Total points by member</caption>
      <thead><tr><th scope="col">Player</th><th scope="col">Spread wk</th><th scope="col">Spread season</th><th scope="col">Total wk</th><th scope="col">Total season</th></tr></thead>
      <tbody>{rows.map(r => <tr key={r.id} className={r.id === feed.viewer ? 'me' : ''}><th scope="row">{name(r.id)}{r.removed && <small className="muted"> · Removed</small>}</th>
        <td className="mono">{cell(r.spread, 'weekPoints')}</td><td className="mono">{cell(r.spread, 'seasonPoints')}</td>
        <td className="mono">{cell(r.total, 'weekPoints')}</td><td className="mono">{cell(r.total, 'seasonPoints')}</td></tr>)}</tbody></table></div>
    <p className="muted small">Points are fixed when each pick is saved against that moment's consensus. — means no submitted ballot; Sat out means a final weekly opt-out. Removed members keep their records. Challenge and Units records stay in each group.</p>
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
    const text = post.mode === 'guess_total' ? `${show(value)}` : value === 0 ? "Even (pick'em)" : `${shortName(value < 0 ? home : away)} −${show(Math.abs(value))}`;
    return <li key={gameId}><span>{away} @ {home}</span><span>{text}</span></li>;
  })}</ul>;
}

function Post({ post, name, onLike, onComment, busy }) {
  const [draft, setDraft] = useState(''), [failure, setFailure] = useState(null), request = useRef(null);
  // Persona audit #26: an action error sits under the control that was tapped, with a Retry, instead of at the top of the feed.
  async function run(action) { setFailure(null); const message = await action(); if (message) setFailure({ message, retry: () => run(action) }); return !message; }
  async function submit(event) {
    event.preventDefault();
    const body = draft.trim(); if (!body) return;
    request.current ||= crypto.randomUUID();
    if (await run(() => onComment(post.id, body, request.current))) { setDraft(''); request.current = null; }
  }
  return <article className="panel feed-post">
    <div className="feed-post-head"><PostText post={post} name={name}/><time className="muted small" dateTime={post.createdAt}>{date(post.createdAt)} PT</time></div>
    <PostPicks post={post}/>
    <div className="feed-actions">
      <button className={`text-button ${post.likedByMe ? 'liked' : ''}`} aria-pressed={post.likedByMe} disabled={busy} onClick={() => run(() => onLike(post.id, !post.likedByMe))}><Heart size={17} fill={post.likedByMe ? 'currentColor' : 'none'}/>{post.likes}<span className="sr-only"> likes</span></button>
      <span className="muted small"><MessageCircle size={16}/>{post.comments.length}</span>
    </div>
    {failure && <div className="error-banner" role="alert"><TriangleAlert size={18}/><span>{failure.message}</span><button type="button" className="text-button" disabled={busy} onClick={failure.retry}>Retry</button></div>}
    {!!post.comments.length && <ul className="feed-comments">{post.comments.map(c => <li key={c.id}><strong>{name(c.userId)}</strong> {c.body}</li>)}</ul>}
    <form className="feed-comment-form" onSubmit={submit}>
      <label className="sr-only" htmlFor={`comment-${post.id}`}>Comment</label>
      <input id={`comment-${post.id}`} maxLength={500} placeholder="Add a comment" value={draft} disabled={busy} onChange={e => { setDraft(e.target.value); request.current = null; }}/>
      <button className="secondary" aria-label="Post comment" disabled={busy || !draft.trim()}><Send size={16}/></button>
    </form>
  </article>;
}

function SchedulerStatus() {
  const [status, setStatus] = useState(null), [failed, setFailed] = useState(false);
  useEffect(() => { communityApi('week-open').then(setStatus).catch(() => setFailed(true)); }, []);
  if (failed) return <p className="muted small scheduler-status">Automatic opening status unavailable.</p>;
  if (!status) return null;
  const last = status.lastRunAt ? `Last run ${date(status.lastRunAt)} PT · ${status.lastStatus}${status.lastReason ? ` (${status.lastReason.replaceAll('_', ' ')})` : ''}` : 'No runs yet';
  return <p className="muted small scheduler-status" role="status">Automatic opening: <strong>{status.enabled ? 'enabled' : status.configured ? 'disabled' : 'not configured'}</strong> · Mondays 12:00 AM PT · {last}</p>;
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
    <div className="section-title"><h2><CalendarPlus size={18}/>Preview / publish early (fallback)</h2></div>
    <p className="muted small">Commissioner only. Weeks open automatically Monday 12:00 AM PT; use this to review the public NFL schedule or publish early if the scheduler fails. Nothing changes until you publish.</p>
    <SchedulerStatus/>
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

function WeekPicks({ onSaved, optOuts = [], onSatOut, onSignOut, initialMode }) {
  const [data, setData] = useState(null), [mode, setMode] = useState(initialMode || 'guess_spread'), [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false), [saving, setSaving] = useState(null), [error, setError] = useState(''), [unpublished, setUnpublished] = useState(false);
  const [notice, setNotice] = useState(''), [failure, setFailure] = useState(null), [hint, setHint] = useState('');
  const [help, setHelp] = useState(() => { try { return localStorage.getItem(HELP_KEY) !== 'off'; } catch { return true; } });
  const request = useRef(null);
  const load = useCallback(async () => { const result = await cloudApi('personal'); setData(result); return result; }, []);
  // Persona audit #14: no published week (the handler answers 404) is a quiet state, not an error.
  const loadWeek = useCallback(() => { setError(''); setUnpublished(false); return load().catch(e => { if (e.status === 404) setUnpublished(true); else setError(e.message); }); }, [load]);
  useEffect(() => { loadWeek(); }, [loadWeek]);
  const picksFor = (d, m) => Object.fromEntries(d.games.map(g => [g.id, d.ballots[m]?.picks?.[g.id] ?? '']));
  // Picks derive from the loaded week and the market in the same render, never one render late: a draft counts only for the data and mode it was entered against,
  // so a market switch or a reload can never show one market's values in the other's chips.
  const picksOf = (d, m, dr) => (dr && dr.data === d && dr.mode === m ? dr.picks : picksFor(d, m));
  function dismissHelp() { setHelp(false); try { localStorage.setItem(HELP_KEY, 'off'); } catch { /* Hidden for this visit only. */ } }
  if (!data) return unpublished ? <WeekUnpublished/>
    : error ? <div className="error-banner" role="alert"><TriangleAlert size={18}/><span>{error}</span><button type="button" className="text-button" onClick={loadWeek}>Retry</button></div>
    : <p role="status"><LoaderCircle className="spin"/>Loading this week…</p>;
  const picks = picksOf(data, mode, draft);
  const ballot = data.ballots[mode], submitted = !!ballot?.submittedAt, closed = Date.parse(data.now) >= Date.parse(data.deadline);
  const opensAt = weekOpenAt(data.deadline), notOpen = Date.parse(data.now) < Date.parse(opensAt);
  const satOut = optOuts.includes(mode);
  const editable = !closed && !notOpen && !satOut;
  const filled = Object.values(picks).filter(v => v !== '').length, remaining = data.games.length - filled;
  const dirty = data.games.some(g => String(picks[g.id]) !== String(ballot?.picks?.[g.id] ?? ''));
  // Persona audit #8: every save failure names the problem and offers the next step, beside the save bar.
  function describe(e, retry) {
    if (!e.status) return { message: 'No connection. Your picks are kept on this screen; reconnect and tap Retry.', actions: [['Retry', retry]] };
    if (e.status === 401) return { message: 'Your session has expired. The picks on this screen are not saved yet; sign in again to continue.', actions: [['Sign in again', () => onSignOut?.()], ['Retry', retry]] };
    if (e.status === 409) return { message: e.message, actions: [['Load latest', loadLatest]] };
    return { message: e.message, actions: [['Retry', retry]] };
  }
  async function save(submit) {
    setBusy(true); setSaving(submit ? 'submit' : 'draft'); setFailure(null); setNotice(''); setHint('');
    const body = { season: data.season, week: data.week, mode, weeklyRevision: data.weeklyRevision, submit,
      picks: Object.fromEntries(Object.entries(picks).filter(([, v]) => v !== '').map(([k, v]) => [k, Number(v)])) };
    const serialized = JSON.stringify({ body, revision: data.revision });
    if (request.current?.serialized !== serialized) request.current = { serialized, requestId: crypto.randomUUID() };
    try {
      await cloudApi('personal/ballot', { ...body, requestId: request.current.requestId, revision: data.revision });
      request.current = null; await load();
      setNotice(submit || submitted ? `${MODE[mode]} picks submitted.` : 'Draft saved.'); onSaved?.();
      return true;
    } catch (e) { setFailure(describe(e, () => save(submit))); return false; } finally { setBusy(false); setSaving(null); }
  }
  // "Load latest" after a conflict: the other device's ballot comes in and this screen's unsaved edits stay on top of it.
  async function loadLatest() {
    setBusy(true); setFailure(null);
    try {
      const latest = await load();
      setDraft(dr => {
        if (!dr) return null;
        const base = picksFor(dr.data, dr.mode), fresh = picksFor(latest, dr.mode);
        return { data: latest, mode: dr.mode, picks: Object.fromEntries(latest.games.map(g => [g.id, dr.picks[g.id] !== base[g.id] ? dr.picks[g.id] : fresh[g.id]])) };
      });
      setNotice('Latest saved picks loaded. Your unsaved edits are kept on top of them; save again when ready.');
    } catch (e) { setFailure(describe(e, loadLatest)); } finally { setBusy(false); }
  }
  // Persona audit #5: switching markets saves the open draft first instead of greying the other market out.
  async function switchMode(next) {
    if (next === mode || busy) return;
    if (dirty && editable) { if (!(await save(submitted))) return; setNotice(`${submitted ? `${MODE[mode]} picks submitted` : 'Draft saved'}. Now showing ${MODE[next]}.`); }
    setMode(next); setHint('');
  }
  // Persona audit #6: Submit stays enabled and says what is missing instead of going grey.
  function submitOrExplain() {
    if (remaining > 0) { setHint(`Pick the remaining ${remaining} ${remaining === 1 ? 'game' : 'games'} to submit ${MODE[mode]}. ${filled ? `Save draft keeps the ${filled} you have.` : 'Save draft keeps a partial ballot.'}`); return; }
    save(true);
  }
  const header = satOut ? "Sat out · others' picks visible" : notOpen ? `Not open yet · ${dueText(data.deadline)}`
    : `${filled}/${data.games.length} picked · ${closed ? 'Closed' : `Due ${date(data.deadline)} PT`}${submitted ? ' · Submitted, editable until the deadline' : ''}`;
  return <section className="week-picks">
    <div className="personal-actions" role="group" aria-label="Market">{Object.entries(MODE).map(([m, label]) =>
      <button key={m} className={mode === m ? 'primary' : 'secondary'} aria-pressed={mode === m} disabled={busy} onClick={() => switchMode(m)}>
        {label}{data.ballots[m]?.submittedAt ? ' ✓' : optOuts.includes(m) ? ' · Sat out' : ''}</button>)}</div>
    <p className="muted">Week {data.week} · {header}</p>
    {notOpen && <section className="panel week-not-open" role="status"><h3>{opensText(data.week, opensAt)}</h3><p>Nobody can pick before then. The schedule is below; the chips appear when the week opens.</p></section>}
    {closed && !satOut && <p className="auth-notice week-closed" role="status">Week {data.week} {MODE[mode]} picks are closed. {filled ? `Your saved ${MODE[mode]} picks stay below.` : `You made no ${MODE[mode]} picks this week.`} {opensText(data.week + 1, nextOpenAt(data.deadline))}.</p>}
    {error && <div className="error-banner" role="alert"><TriangleAlert size={18}/><span>{error}</span></div>}
    {notice && !editable && <p className="auth-notice" role="status">{notice}</p>}
    {help && editable && <div className="chip-help" role="note"><p>{mode === 'guess_spread'
      ? 'Tap the team you think wins (the favorite), then how many points they win by. Pick’em means an even game with no favorite. The chips use the sportsbook sign: −3 means the favorite wins by 3.'
      : 'Total = both teams’ points combined. Tap the number you expect, then fine-tune by half a point with − and +.'}</p>
      <button type="button" className="text-button" aria-label="Got it, hide this tip" onClick={dismissHelp}>Got it</button></div>}
    <div className="week-pick-list">{data.games.map(g => <article className="panel week-pick" key={g.id}>
      <h3>{team(g.awayCode)} @ {team(g.homeCode)}</h3>
      <p className="muted small">{date(g.kickoff)} PT</p>
      <TeamFacts week={data.week} awayCode={g.awayCode} homeCode={g.homeCode}/>
      {!notOpen && <ChipPicker key={`${mode}-${g.id}-${data.weeklyRevision}`} mode={mode} value={picks[g.id]} away={shortName(g.awayCode)} home={shortName(g.homeCode)}
        label={`${team(g.awayCode)} at ${team(g.homeCode)} ${MODE[mode]}`} disabled={busy || !editable} onChange={value => { setHint(''); setDraft(dr => ({ data, mode, picks: { ...picksOf(data, mode, dr), [g.id]: value } })); }}/>}
    </article>)}</div>
    {editable && <div className="save-bar">
      {failure && <div className="error-banner" role="alert"><TriangleAlert size={18}/><span>{failure.message}</span>
        <div className="banner-actions">{failure.actions.map(([label, fn]) => <button key={label} type="button" className="text-button" disabled={busy} onClick={fn}>{label}</button>)}</div></div>}
      {notice && <p className="auth-notice save-notice" role="status">{notice}</p>}
      {hint && <p className="save-hint" role="status">{hint}</p>}
      <strong>{filled}/{data.games.length} ready</strong>
      {!submitted && <SitOutWeek season={data.season} week={data.week} mode={mode} disabled={busy} onDone={async () => { await load(); await onSatOut?.(); }}/>}
      {!submitted && <button className="secondary" disabled={busy || !dirty} onClick={() => save(false)}>{saving === 'draft' ? <><LoaderCircle className="spin" size={16}/>Saving…</> : 'Save draft'}</button>}
      <button className="primary" disabled={busy || (submitted && !dirty)} onClick={submitOrExplain}>{saving === 'submit' ? 'Submitting…' : submitted ? 'Save changes' : `Submit ${MODE[mode]}`}</button></div>}
  </section>;
}

export default function CommunityHome({ onGroups, onSignOut, displayName, onUnavailable }) {
  const [tab, setTab] = useState('feed'), [league, setLeague] = useState('nfl'), [feed, setFeed] = useState(null), [older, setOlder] = useState([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [retryable, setRetryable] = useState(false);
  const load = useCallback(async () => { const result = await communityApi('read', {}); setFeed(result); setOlder([]); return result; }, []);
  // Persona audit #7: only a 404 (the community function is not deployed) falls back to the groups screen; any other failure keeps
  // the Community shell with the error, plus a Retry when the failure was the network or the service (not a 4xx refusal).
  useEffect(() => { load().catch(e => { if (onUnavailable && e.status === 404) onUnavailable(); else { setError(e.message); setRetryable(!e.status || e.status >= 500); } }); }, [load, onUnavailable]);
  const name = id => feed?.members.find(m => m.id === id)?.displayName || 'Former member';
  async function act(fn) { setBusy(true); setError(''); try { return await fn(); } catch (e) { setError(e.message); return false; } finally { setBusy(false); } }
  // Errors that belong beside the control (likes, comments) come back as the message instead of the shared banner.
  async function attempt(fn) { setBusy(true); try { await fn(); return null; } catch (e) { return e.message; } finally { setBusy(false); } }
  const like = (postId, value) => attempt(async () => { await communityApi('like', { postId, like: value }); await load(); });
  const comment = (postId, body, requestId) => attempt(async () => { await communityApi('comment', { postId, body, requestId }); await load(); });
  // The toggle changes only after the server confirms the saved value.
  const notify = (key, value) => act(async () => {
    const result = await communityApi('interest', { league: key, notify: value });
    setFeed(f => f && { ...f, interests: result.notify ? [...new Set([...f.interests, key])] : f.interests.filter(k => k !== key),
      interestCounts: { ...f.interestCounts, [key]: result.count } });
  });
  const soon = COMING_SOON.find(l => l.key === league);
  const more = () => act(async () => {
    const posts = [...feed.posts, ...older]; const result = await communityApi('read', { before: posts.at(-1).createdAt });
    setOlder(o => [...o, ...result.posts]);
  });
  const posts = feed ? [...feed.posts, ...older] : [];
  const due = feed?.picksDue && ['due', 'urgent'].includes(feed.picksDue.state) ? feed.picksDue.modes.length : 0;
  const picksClosed = feed?.picksDue?.state === 'closed';
  // Persona audit #17: the skip link lands on the picks-due card when there is one.
  const dueCard = tab === 'feed' && !soon && feed?.picksDue && !['none', 'done'].includes(feed.picksDue.state);
  return <div className="hub-shell community-home">
    <a className="skip-link" href={dueCard ? '#picks-due' : '#main'}>Skip to main content</a>
    <header className="hub-header"><Brand/><div className="hub-account"><span>{displayName}</span></div></header>
    <main className="hub-main" id="main" tabIndex={-1}>
      <div className="hub-heading"><div><p className="eyebrow">CALL THE NUMBER. OWN THE BOARD.</p><h1>Community</h1><p>Everyone's calls, scores and bets in one place.</p></div><Users size={28} aria-hidden="true"/></div>
      <LeagueSwitcher league={league} onSelect={setLeague}/>
      {soon ? <>
        {error && <div className="error-banner" role="alert"><TriangleAlert size={18}/><span>{error}</span></div>}
        <ComingSoonCard league={soon} feed={feed} busy={busy} onNotify={notify}/>
        <button className="secondary back-to-nfl" onClick={() => setLeague('nfl')}>Back to NFL</button>
      </> : <>
      <nav className="community-tabs" aria-label="Community sections">
        {[['feed', 'Feed'], ['picks', `Picks${due ? ` (${due} due)` : picksClosed ? ' (closed)' : ''}`]].map(([key, label]) =>
          <button key={key} className={tab === key ? 'primary' : 'secondary'} aria-pressed={tab === key} onClick={() => setTab(key)}>{label}</button>)}
        <button className="secondary" onClick={onGroups}>Groups & games<ArrowRight size={16}/></button>
      </nav>
      {error && <div className="error-banner" role="alert"><TriangleAlert size={18}/><span>{error}</span>{!feed && retryable && <button type="button" className="text-button" disabled={busy} onClick={() => act(load)}>Retry</button>}</div>}
      {notice && <p className="auth-notice" role="status">{notice}</p>}
      {tab === 'picks' ? <WeekPicks optOuts={feed?.optOuts || []} initialMode={feed?.picksDue?.modes?.[0]?.mode} onSignOut={onSignOut} onSaved={() => load().catch(() => {})} onSatOut={() => load().catch(() => {})}/> : !feed ? !error && <p role="status"><LoaderCircle className="spin"/>Loading the feed…</p> : <>
        {!feed.week && <WeekUnpublished/>}
        <PicksDue due={feed.picksDue} all={feed.due} onPick={() => setTab('picks')}/>
        <Leaderboard feed={feed}/>
        {feed.admin && <PublishWeek week={feed.week} onDone={async message => { setNotice(message); await load(); }}/>}
        <section className="community-feed" aria-label="Activity feed">
          {posts.map(post => <Post key={post.id} post={post} name={name} busy={busy} onLike={like} onComment={comment}/>)}
          {!posts.length && <p className="panel">No activity yet.</p>}
          {feed.posts.length >= 30 && <button className="secondary" disabled={busy} onClick={more}>Older activity</button>}
        </section>
        <ComingSoon feed={feed} busy={busy} onNotify={notify}/>
      </>}
      </>}
      {/* Persona audit #17: Appearance lives with the account controls at the foot of the page, not above the title. */}
      <ThemeSelector/>
      <div className="hub-bottom"><span>Signed in as {displayName}. Everything here is shared with every member.</span>
        <button className="text-button" disabled={busy} onClick={() => act(load)}><RefreshCw size={16}/>Refresh</button>
        <button className="secondary" disabled={busy} onClick={onSignOut}>Sign out</button></div>
    </main>
  </div>;
}
