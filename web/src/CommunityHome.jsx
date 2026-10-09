import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ArrowRight, Bell, BellOff, BellRing, CalendarClock, CalendarPlus, Heart, LoaderCircle, MessageCircle, RefreshCw, Send, TriangleAlert, Users } from 'lucide-react';
import Brand from './Brand';
import ThemeSelector from './Theme';
import ChipPicker from './ChipPicker';
import TeamFacts from './TeamFacts';
import SitOutWeek from './SitOutWeek';
import { cloudApi, communityApi, date } from './api';
import { communityDraftScope, communityDraftEdits, communityPicksDiffer, mergeCommunityDraft, readCommunityDraft, removeCommunityDraft, writeCommunityDraft } from './communityDraft';
import { currentMarket, goScreen, setMarket, useScreen } from './screenHash';
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
// Persona audit #4: the chip helper is dismissed per market, so hiding the Spread tip never hides the Total one.
const helpKey = mode => `gtl.chipHelp.${mode}`;
// Persona audit #8: a request that never reached the service (no status) reads as "offline" everywhere, never as "Failed to fetch".
const plain = (e, next = 'try again') => (e.status ? e.message : `No connection. Reconnect and ${next}.`);
const picksFor = (d, m) => Object.fromEntries(d.games.map(g => [g.id, d.ballots[m]?.picks?.[g.id] ?? '']));
// Persona audit #3: the market a bare #picks opens once the week is known. A market with unsaved picks waiting in this tab comes
// first, so they are offered back instead of sitting behind the other market's button; then the feed's first market still due,
// then the first the week itself still has open (unsubmitted, not sat out), then Spread. A closed or not-yet-open week offers no
// copy back, so it opens the first market due as before.
function chooseMarket(d, { accountId, initialMode, optOuts }) {
  const modes = Object.keys(MODE), due = modes.filter(m => !d.ballots[m]?.submittedAt && !optOuts.includes(m));
  const order = [...new Set([initialMode, ...due, ...modes].filter(Boolean))];
  const open = Date.parse(d.now) < Date.parse(d.deadline) && Date.parse(d.now) >= Date.parse(weekOpenAt(d.deadline));
  const waiting = open && order.find(m => {
    if (optOuts.includes(m)) return false;
    const copy = readCommunityDraft(communityDraftScope({ accountId, season: d.season, week: d.week, mode: m }), d.games);
    return copy && communityPicksDiffer(copy.draft, picksFor(d, m));
  });
  return waiting || order[0];
}

/** Focus never strands on <body>: when a control that had focus is removed (a banner's Retry, "Got it"), the next render that
 * can focus the named control does so (WCAG 2.4.3). Busy controls stay focusable because they are aria-disabled, not disabled. */
function useRefocus(root) {
  const pending = useRef(null);
  useEffect(() => { const selector = pending.current; if (!selector) return; const el = root.current?.querySelector(selector); if (!el || el.disabled) return; pending.current = null; el.focus(); });
  return selector => { pending.current = selector; };
}

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
  // After the deadline only a submitted ballot scores (D-21), so the card says submitted / draft (not submitted) / not submitted rather than a count.
  const counts = modes.map(m => `${MODE[m.mode]} ${m.submitted ? '✓ submitted' : closed ? (m.filled ? 'draft (not submitted)' : 'not submitted') : `${m.filled}/${m.games}${stillDue}`}`).join(' · ');
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
  const [draft, setDraft] = useState(''), [failure, setFailure] = useState(null), request = useRef(null), root = useRef(null), refocus = useRefocus(root);
  // Persona audit #26: an action error sits under the control that was tapped, with a Retry, instead of at the top of the feed.
  // Retry removes the banner it sits in, so focus returns to the control being retried.
  async function run(action, control) { if (busy) return false; setFailure(null); const message = await action(); if (message) setFailure({ message, retry: () => { refocus(control); return run(action, control); } }); return !message; }
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    const body = draft.trim(); if (!body) return;
    request.current ||= crypto.randomUUID();
    if (await run(() => onComment(post.id, body, request.current), '[data-action="comment"]')) { setDraft(''); request.current = null; }
  }
  return <article ref={root} className="panel feed-post">
    <div className="feed-post-head"><PostText post={post} name={name}/><time className="muted small" dateTime={post.createdAt}>{date(post.createdAt)} PT</time></div>
    <PostPicks post={post}/>
    <div className="feed-actions">
      <button className={`text-button ${post.likedByMe ? 'liked' : ''}`} data-action="like" aria-pressed={post.likedByMe} aria-disabled={busy || undefined} onClick={() => run(() => onLike(post.id, !post.likedByMe), '[data-action="like"]')}><Heart size={17} fill={post.likedByMe ? 'currentColor' : 'none'}/>{post.likes}<span className="sr-only"> likes</span></button>
      <span className="muted small"><MessageCircle size={16}/>{post.comments.length}</span>
    </div>
    {failure && <div className="error-banner" role="alert"><TriangleAlert size={18}/><span>{failure.message}</span><button type="button" className="text-button" aria-disabled={busy || undefined} onClick={failure.retry}>Retry</button></div>}
    {!!post.comments.length && <ul className="feed-comments">{post.comments.map(c => <li key={c.id}><strong>{name(c.userId)}</strong> {c.body}</li>)}</ul>}
    <form className="feed-comment-form" onSubmit={submit}>
      <label className="sr-only" htmlFor={`comment-${post.id}`}>Comment</label>
      <input id={`comment-${post.id}`} maxLength={500} placeholder="Add a comment" value={draft} readOnly={busy} onChange={e => { setDraft(e.target.value); request.current = null; }}/>
      <button className="secondary" data-action="comment" aria-label="Post comment" aria-disabled={busy || !draft.trim() || undefined}><Send size={16}/></button>
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
    } catch (e) { setError(plain(e)); } finally { setBusy(false); }
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

function WeekPicks({ accountId, onSaved, optOuts = [], onSatOut, onSignOut, initialMode }) {
  // Persona audit #3: the Picks history entry carries its market (#picks-spread, #picks-total), so a reload, Back or Forward reopens
  // the market that was open, with its unsaved picks offered back. A bare entry (the Picks tab, "Make picks") is settled by
  // chooseMarket in the same render the week arrives, so no other market's chips ever show first; the choice is written back
  // into the entry. Read once at mount: the entry is this screen's own record, nothing else changes it while the screen is open.
  const [data, setData] = useState(null), [mode, setMode] = useState(() => currentMarket() || initialMode || 'guess_spread'), [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false), [saving, setSaving] = useState(null), [error, setError] = useState(''), [unpublished, setUnpublished] = useState(false);
  const [notice, setNotice] = useState(''), [failure, setFailure] = useState(null), [hint, setHint] = useState(''), [recovery, setRecovery] = useState(null);
  const [dismissed, setDismissed] = useState(() => new Set(Object.keys(MODE).filter(m => { try { return localStorage.getItem(helpKey(m)) === 'off'; } catch { return false; } })));
  const request = useRef(null), root = useRef(null), refocus = useRefocus(root), hintId = useId();
  // The save-bar button behind the latest request ("draft" or "submit"); a banner action hands focus back to it.
  const action = useRef('draft');
  const settled = useRef(currentMarket() !== null), latest = useRef(null);
  latest.current = { accountId, initialMode, optOuts };
  const load = useCallback(async () => {
    const result = await cloudApi('personal');
    if (!settled.current) { settled.current = true; const chosen = chooseMarket(result, latest.current); setMode(chosen); setMarket(chosen); }
    setData(result);
    return result;
  }, []);
  // Persona audit #14: no published week (the handler answers 404) is a quiet state, not an error.
  const loadWeek = useCallback(() => { setError(''); setUnpublished(false); return load().catch(e => { if (e.status === 404) setUnpublished(true); else setError(plain(e, 'tap Retry')); }); }, [load]);
  useEffect(() => { loadWeek(); }, [loadWeek]);
  // Picks derive from the loaded week and the market in the same render, never one render late: a draft counts only for the data and mode it was entered against,
  // so a market switch or a reload can never show one market's values in the other's chips.
  const picksOf = (d, m, dr) => (dr && dr.data === d && dr.mode === m ? dr.picks : picksFor(d, m));
  // Persona audit #3: unsaved picks are copied to this tab on every change (sessionStorage, this account, season, week and market only,
  // never sent anywhere) and the copy is dropped once nothing differs from the saved ballot.
  const scope = data ? communityDraftScope({ accountId, season: data.season, week: data.week, mode }) : null;
  useEffect(() => {
    if (!draft) return;
    const own = communityDraftScope({ accountId, season: draft.data.season, week: draft.data.week, mode: draft.mode }), base = picksFor(draft.data, draft.mode);
    if (communityPicksDiffer(draft.picks, base)) writeCommunityDraft(own, draft.picks, base); else removeCommunityDraft(own);
  }, [draft, accountId]);
  // On return to this market (tab switch, Back, reload) a copy that still differs from the saved picks is offered back explicitly, the way
  // the group ballot and Solo do it; a copy that matches the saved ballot is dropped. The draft being edited right now is not a recovery copy.
  useEffect(() => {
    if (!data || !scope || (draft && draft.data === data && draft.mode === mode)) { setRecovery(null); return; }
    const copy = readCommunityDraft(scope, data.games);
    if (copy && !communityPicksDiffer(copy.draft, picksFor(data, mode))) { removeCommunityDraft(scope); setRecovery(null); return; }
    setRecovery(copy);
  }, [data, mode, scope]);
  // "Got it" removes its own container, so focus moves on to the first chip.
  function dismissHelp() { setDismissed(s => new Set([...s, mode])); refocus('.week-pick-list .chip:not(:disabled)'); try { localStorage.setItem(helpKey(mode), 'off'); } catch { /* Hidden for this visit only. */ } }
  // Restore puts the tab's edits on top of the latest saved picks (the "Load latest" rule); the card's buttons remove the card, so focus
  // moves on to the first chip as "Got it" does. A chip tapped instead starts a fresh copy, as on the group ballot.
  function restoreRecovery() {
    if (busy || !recovery) return;
    setDraft({ data, mode, picks: mergeCommunityDraft(recovery.base, recovery.draft, picksFor(data, mode)) });
    setRecovery(null); setHint(''); setNotice('Unsaved picks restored. Save or submit to keep them.'); refocus('.week-pick-list .chip:not(:disabled)');
  }
  function discardRecovery() { if (busy) return; removeCommunityDraft(scope); setRecovery(null); refocus('.week-pick-list .chip:not(:disabled)'); }
  if (!data) return unpublished ? <WeekUnpublished/>
    : error ? <div className="error-banner" role="alert"><TriangleAlert size={18}/><span>{error}</span><button type="button" className="text-button" onClick={loadWeek}>Retry</button></div>
    : <p role="status"><LoaderCircle className="spin"/>Loading this week…</p>;
  const picks = picksOf(data, mode, draft), edits = recovery ? communityDraftEdits(recovery) : 0;
  const ballot = data.ballots[mode], submitted = !!ballot?.submittedAt, closed = Date.parse(data.now) >= Date.parse(data.deadline);
  const opensAt = weekOpenAt(data.deadline), notOpen = Date.parse(data.now) < Date.parse(opensAt);
  const satOut = optOuts.includes(mode);
  const editable = !closed && !notOpen && !satOut;
  const filled = Object.values(picks).filter(v => v !== '').length, remaining = data.games.length - filled;
  const dirty = data.games.some(g => String(picks[g.id]) !== String(ballot?.picks?.[g.id] ?? ''));
  // Persona audit #8: every save failure names the problem and offers the next step, beside the save bar. "Sign in again" unmounts
  // this screen and its unsaved picks, so the banner says so and puts Retry first. A D-17 submission refusal carries a code (fresh
  // quotes unavailable, refresh busy) and is retried as it is, whatever its status; only a bare 409 is a revision conflict with
  // another device; a 400 cannot succeed on a retry.
  function describe(e, retry) {
    if (!e.status) return { message: 'No connection. Your picks are kept on this screen; reconnect and tap Retry.', actions: [['Retry', retry]] };
    if (e.status === 401) return { message: 'Your session has expired and these picks are not saved. Retry first; if that fails, note your picks, then sign in again (it clears this screen).', actions: [['Retry', retry], ['Sign in again', () => onSignOut?.()]] };
    if (e.code) return { message: e.message, actions: [['Retry', retry]] };
    if (e.status === 409) return { message: e.message, actions: [['Load latest', loadLatest]] };
    if (e.status === 400) return { message: e.message, actions: [] };
    return { message: e.message, actions: [['Retry', retry]] };
  }
  async function save(submit) {
    if (busy) return false;
    action.current = submit ? 'submit' : 'draft';
    setBusy(true); setSaving(submit ? 'submit' : 'draft'); setFailure(null); setNotice(''); setHint('');
    const body = { season: data.season, week: data.week, mode, weeklyRevision: data.weeklyRevision, submit,
      picks: Object.fromEntries(Object.entries(picks).filter(([, v]) => v !== '').map(([k, v]) => [k, Number(v)])) };
    const serialized = JSON.stringify({ body, revision: data.revision });
    if (request.current?.serialized !== serialized) request.current = { serialized, requestId: crypto.randomUUID() };
    try {
      await cloudApi('personal/ballot', { ...body, requestId: request.current.requestId, revision: data.revision });
      request.current = null; removeCommunityDraft(scope); await load();
      setNotice(submit || submitted ? `${MODE[mode]} picks submitted.` : 'Draft saved.'); onSaved?.();
      return true;
    } catch (e) { setFailure(describe(e, () => save(submit))); return false; } finally { setBusy(false); setSaving(null); }
  }
  // "Load latest" after a conflict: the other device's ballot comes in and this screen's unsaved edits stay on top of it.
  async function loadLatest() {
    if (busy) return;
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
  const missing = () => `Pick the remaining ${remaining} ${remaining === 1 ? 'game' : 'games'}`;
  // A submitted ballot has no Save draft and can only be saved complete: the saved picks stand until the edit is finished.
  const stands = () => `Your submitted ${MODE[mode]} picks stay as they were until you do.`;
  // Persona audit #5: switching markets saves the open draft first instead of greying the other market out. An edit that left a
  // submitted ballot incomplete is explained and the market stays put; nothing partial is posted.
  async function switchMode(next) {
    if (next === mode || busy) return;
    if (dirty && editable) {
      if (submitted && remaining > 0) { setHint(`${missing()} to save your ${MODE[mode]} changes before switching to ${MODE[next]}. ${stands()}`); return; }
      if (!(await save(submitted))) return;
      setNotice(`${submitted ? `${MODE[mode]} picks submitted` : 'Draft saved'}. Now showing ${MODE[next]}.`);
    }
    setMode(next); setMarket(next); setHint('');
  }
  // Persona audit #6: Submit stays enabled and says what is missing instead of going grey.
  function submitOrExplain() {
    if (remaining > 0) { setHint(submitted ? `${missing()} to save your ${MODE[mode]} changes. ${stands()}` : `${missing()} to submit ${MODE[mode]}. ${filled ? `Save draft keeps the ${filled} you have.` : 'Save draft keeps a partial ballot.'}`); return; }
    save(true);
  }
  const header = satOut ? "Sat out · others' picks visible" : notOpen ? `Not open yet · ${dueText(data.deadline)}`
    : `${filled}/${data.games.length} picked · ${closed ? 'Closed' : `Due ${date(data.deadline)} PT`}${submitted ? (closed ? ' · Submitted' : ' · Submitted, editable until the deadline') : ''}`;
  return <section ref={root} className="week-picks">
    <div className="personal-actions" role="group" aria-label="Market">{Object.entries(MODE).map(([m, label]) =>
      <button key={m} className={mode === m ? 'primary' : 'secondary'} aria-pressed={mode === m} aria-disabled={busy || undefined} onClick={() => switchMode(m)}>
        {label}{data.ballots[m]?.submittedAt ? ' ✓' : optOuts.includes(m) ? ' · Sat out' : ''}</button>)}</div>
    <p className="muted">Week {data.week} · {header}</p>
    {notOpen && <section className="panel week-not-open" role="status"><h3>{opensText(data.week, opensAt)}</h3><p>Nobody can pick before then. The schedule is below; the chips appear when the week opens.</p></section>}
    {/* Persona audit #13: only a submitted ballot scores, so a draft that was never submitted is told so. */}
    {closed && !satOut && <p className="auth-notice week-closed" role="status">Week {data.week} {MODE[mode]} picks are closed. {submitted ? `Your submitted ${MODE[mode]} picks stay below.` : filled ? `Your ${MODE[mode]} draft was never submitted, so it does not score this week.` : `You made no ${MODE[mode]} picks this week.`} {opensText(data.week + 1, nextOpenAt(data.deadline))}.</p>}
    {error && <div className="error-banner" role="alert"><TriangleAlert size={18}/><span>{error}</span></div>}
    {notice && !editable && <p className="auth-notice" role="status">{notice}</p>}
    {/* Persona audit #3: a tab copy that differs from the saved ballot is offered back, never applied silently and never called saved. */}
    {recovery && editable && <section className="panel picks-recovery" aria-label={`Unsaved ${MODE[mode]} picks`}>
      <h3>Unsaved {MODE[mode]} picks found in this tab</h3>
      <p>{edits} {edits === 1 ? 'pick' : 'picks'} from {date(recovery.updatedAt)} PT, kept on this device only: not saved to your account and not submitted. Restore puts them on top of your latest saved picks.</p>
      <div className="picks-recovery-actions"><button type="button" className="primary" aria-disabled={busy || undefined} onClick={restoreRecovery}>Restore picks</button><button type="button" className="secondary" aria-disabled={busy || undefined} onClick={discardRecovery}>Discard</button></div>
    </section>}
    {!dismissed.has(mode) && editable && <div className="chip-help" role="note"><p>{mode === 'guess_spread'
      ? 'Tap the team you think wins (the favorite), then how many points they win by. Pick’em means an even game with no favorite. The chips use the sportsbook sign: −3 means the favorite wins by 3.'
      : 'Total = both teams’ points combined. Tap the number you expect, then fine-tune by half a point with − and +.'}</p>
      <button type="button" className="text-button" aria-label="Got it, hide this tip" onClick={dismissHelp}>Got it</button></div>}
    <div className="week-pick-list">{data.games.map(g => <article className="panel week-pick" key={g.id}>
      <h3>{team(g.awayCode)} @ {team(g.homeCode)}</h3>
      <p className="muted small">{date(g.kickoff)} PT</p>
      <TeamFacts week={data.week} awayCode={g.awayCode} homeCode={g.homeCode}/>
      {!notOpen && <ChipPicker key={`${mode}-${g.id}-${data.weeklyRevision}`} mode={mode} value={picks[g.id]} away={shortName(g.awayCode)} home={shortName(g.homeCode)}
        label={`${team(g.awayCode)} at ${team(g.homeCode)} ${MODE[mode]}`} disabled={busy || !editable} onChange={value => { setHint(''); setRecovery(null); setDraft(dr => ({ data, mode, picks: { ...picksOf(data, mode, dr), [g.id]: value } })); }}/>}
    </article>)}</div>
    {editable && <div className="save-bar">
      {failure && <div className="error-banner" role="alert"><TriangleAlert size={18}/><span>{failure.message}</span>
        {!!failure.actions.length && <div className="banner-actions">{failure.actions.map(([label, fn]) => <button key={label} type="button" className="text-button" aria-disabled={busy || undefined} onClick={() => { refocus(`[data-action="${action.current}"]`); fn(); }}>{label}</button>)}</div>}</div>}
      {notice && <p className="auth-notice save-notice" role="status">{notice}</p>}
      {/* Always mounted: a live region whose text changes is announced; one inserted with its text often is not. Submit is described by it. */}
      <p className="save-hint" id={hintId} role="status" aria-live="polite">{hint}</p>
      <strong>{filled}/{data.games.length} ready</strong>
      {!submitted && <SitOutWeek season={data.season} week={data.week} mode={mode} busy={busy} onDone={async () => { removeCommunityDraft(scope); await load(); await onSatOut?.(); }}/>}
      {/* Busy and nothing-to-save states are aria-disabled, not disabled, so the pressed button keeps focus while it reads "Saving…" and after. */}
      {!submitted && <button className="secondary" data-action="draft" aria-disabled={busy || !dirty || undefined} onClick={() => { if (!busy && dirty) save(false); }}>{saving === 'draft' ? <><LoaderCircle className="spin" size={16}/>Saving…</> : 'Save draft'}</button>}
      <button className="primary" data-action="submit" aria-disabled={busy || (submitted && !dirty) || undefined} aria-describedby={hintId} onClick={() => { if (!busy && !(submitted && !dirty)) submitOrExplain(); }}>{saving === 'submit' ? 'Submitting…' : submitted ? 'Save changes' : `Submit ${MODE[mode]}`}</button></div>}
  </section>;
}

export default function CommunityHome({ accountId, onGroups, onSignOut, displayName, onUnavailable }) {
  // Persona audit #3: the open tab is the URL hash (#feed, #picks), one history entry each, so Back returns to the feed and a reload lands on the same tab.
  const screen = useScreen(), tab = screen === 'picks' ? 'picks' : 'feed';
  const [league, setLeague] = useState('nfl'), [feed, setFeed] = useState(null), [older, setOlder] = useState([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [retryable, setRetryable] = useState(false);
  const main = useRef(null), refocus = useRefocus(main);
  const load = useCallback(async () => { const result = await communityApi('read', {}); setFeed(result); setOlder([]); return result; }, []);
  // Persona audit #7: only a 404 (the community function is not deployed) falls back to the groups screen; any other failure keeps
  // the Community shell with the error, plus a Retry when the failure was the network or the service (not a 4xx refusal).
  useEffect(() => { load().catch(e => { if (onUnavailable && e.status === 404) onUnavailable(); else { setError(plain(e, 'tap Retry')); setRetryable(!e.status || e.status >= 500); } }); }, [load, onUnavailable]);
  const name = id => feed?.members.find(m => m.id === id)?.displayName || 'Former member';
  async function act(fn) { setBusy(true); setError(''); try { return await fn(); } catch (e) { setError(plain(e)); return false; } finally { setBusy(false); } }
  // Errors that belong beside the control (likes, comments) come back as the message instead of the shared banner.
  async function attempt(fn) { setBusy(true); try { await fn(); return null; } catch (e) { return plain(e, 'tap Retry'); } finally { setBusy(false); } }
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
  // Persona audit #17: the skip link lands on the picks-due card when there is one, and says so (WCAG 2.4.4).
  const dueCard = tab === 'feed' && !soon && feed?.picksDue && !['none', 'done'].includes(feed.picksDue.state);
  // The feed banner's Retry removes the banner: focus goes to main once the feed is back, or to the new banner's Retry.
  async function retryFeed() { refocus('[data-action="feed-retry"]'); if (await act(load)) { refocus(null); main.current?.focus(); } }
  return <div className="hub-shell community-home">
    <a className="skip-link" href={dueCard ? '#picks-due' : '#main'}>{dueCard ? 'Skip to picks due' : 'Skip to main content'}</a>
    <header className="hub-header"><Brand/><div className="hub-account"><span>{displayName}</span></div></header>
    <main ref={main} className="hub-main" id="main" tabIndex={-1}>
      <div className="hub-heading"><div><p className="eyebrow">CALL THE NUMBER. OWN THE BOARD.</p><h1>Community</h1><p>Everyone's calls, scores and bets in one place.</p></div><Users size={28} aria-hidden="true"/></div>
      <LeagueSwitcher league={league} onSelect={setLeague}/>
      {soon ? <>
        {error && <div className="error-banner" role="alert"><TriangleAlert size={18}/><span>{error}</span></div>}
        <ComingSoonCard league={soon} feed={feed} busy={busy} onNotify={notify}/>
        <button className="secondary back-to-nfl" onClick={() => setLeague('nfl')}>Back to NFL</button>
      </> : <>
      <nav className="community-tabs" aria-label="Community sections">
        {[['feed', 'Feed'], ['picks', `Picks${due ? ` (${due} due)` : picksClosed ? ' (closed)' : ''}`]].map(([key, label]) =>
          <button key={key} className={tab === key ? 'primary' : 'secondary'} aria-pressed={tab === key} onClick={() => goScreen(key)}>{label}</button>)}
        <button className="secondary" onClick={onGroups}>Groups & games<ArrowRight size={16}/></button>
      </nav>
      {error && <div className="error-banner" role="alert"><TriangleAlert size={18}/><span>{error}</span>{!feed && retryable && <button type="button" className="text-button" data-action="feed-retry" aria-disabled={busy || undefined} onClick={() => { if (!busy) retryFeed(); }}>Retry</button>}</div>}
      {notice && <p className="auth-notice" role="status">{notice}</p>}
      {tab === 'picks' ? <WeekPicks accountId={accountId} optOuts={feed?.optOuts || []} initialMode={feed?.picksDue?.modes?.[0]?.mode} onSignOut={onSignOut} onSaved={() => load().catch(() => {})} onSatOut={() => load().catch(() => {})}/> : !feed ? !error && <p role="status"><LoaderCircle className="spin"/>Loading the feed…</p> : <>
        {!feed.week && <WeekUnpublished/>}
        <PicksDue due={feed.picksDue} all={feed.due} onPick={() => goScreen('picks')}/>
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
