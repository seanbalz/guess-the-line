import React, { lazy, Suspense, useCallback, useEffect, useId, useRef, useState } from 'react';
import { ArrowRight, Bell, BellOff, BellRing, CalendarClock, CalendarPlus, ChartSpline, Check, CircleCheck, Heart, LoaderCircle, LockKeyhole, MessageCircle, RefreshCw, Send, TriangleAlert, Users } from 'lucide-react';
import Brand from './Brand';
import LegalLinks from './LegalLinks';
import ThemeSelector from './Theme';
import ChipPicker, { CHIP_HELP } from './ChipPicker';
import TeamFacts from './TeamFacts';
import SitOutWeek from './SitOutWeek';
import GameTrends from './GameTrends';
import RefereeAssignments from './RefereeAssignments';
import { useTrendsToggle } from './trendsData';
import { communityAccess, referenceValue } from '../../shared/trends-view.mjs';
import CommunityHistory from './CommunityHistory';
import LineAtGuess from './LineAtGuess';
import { PushReminderPrompt } from './PushReminders';
import TryNewApp from './TryNewApp';
import { cloudApi, communityApi, date } from './api';
import { communityDraftScope, communityDraftEdits, communityPicksDiffer, mergeCommunityDraft, readCommunityDraft, removeCommunityDraft, writeCommunityDraft } from './communityDraft';
import { currentMarket, goScreen, setMarket, useScreen } from './screenHash';
import { MODE, lateText, pickText, shortName, show, team } from './communityFormat';
import { pacificDate, weekOpenAt } from '../../shared/nfl-schedule.mjs';
import { FINAL_LABEL, FINAL_SHORT, LOCKED_MESSAGE, ballotFinal, isBallotLocked, pickFinal, sentFinal } from './sentFinal';
import { boardRows, dueState, postPicksView } from './communityBoard';
import './community.css';

const PerGameLegacy = lazy(() => import('./next/play/PerGameLegacy.jsx'));

const DAY = 86_400_000;
// D-24: "Mon, Oct 12, 12:00 AM" — the week's Monday 00:00 Pacific open.
const opensText = (week, opensAt) => `Week ${week} opens ${date(opensAt, { weekday: 'short' })} PT`;
const dueText = deadline => `Picks due ${date(deadline, { weekday: 'short' })} PT`;
// "In 3 days" until the Monday open, judged against the handler clock the feed carries (the device clock only as a fallback).
const inDays = (opensAt, now) => { const days = Math.ceil((Date.parse(opensAt) - (now ? Date.parse(now) : Date.now())) / DAY); return days <= 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`; };
// The Monday open after a closed week (D-24).
const nextOpenAt = deadline => weekOpenAt(Date.parse(deadline) + 7 * DAY);
// Persona audit #24: "today" / "tomorrow" / "in 3 days" until the deadline, by Pacific calendar day against the handler clock.
const dueIn = (deadline, now) => { const days = Math.round((Date.parse(pacificDate(deadline).date) - Date.parse(pacificDate(now || Date.now()).date)) / DAY); return days <= 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`; };
// "Due Thu 5:15 PM PT (in 2 days)" for the sticky save bar; the header keeps the date too.
const dueShort = (deadline, now) => `Due ${date(deadline, { weekday: 'short', month: undefined, day: undefined })} PT (${dueIn(deadline, now)})`;
// Persona audit #4: the chip helper is dismissed per market, so hiding the Spread tip never hides the Total one.
const helpKey = mode => `gtl.chipHelp.${mode}`;
// Persona audit #8: a request that never reached the service (no status) reads as "offline" everywhere, never as "Failed to fetch".
const plain = (e, next = 'try again') => (e.status ? e.message : `No connection. Reconnect and ${next}.`);
const picksFor = (d, m) => Object.fromEntries(d.games.map(g => [g.id, d.ballots[m]?.picks?.[g.id] ?? '']));
// Persona audit #3: the market a bare #picks opens once the week is known. A market with unsaved picks waiting in this tab comes
// first, so they are offered back instead of sitting behind the other market's button; then the feed's first market still due,
// then the first the week itself still has open (unsubmitted, not sat out), then Spread. A closed or not-yet-open week offers no
// copy back, so it opens the first market due as before; nor does a market whose picks are all final (redesign stage 15), where
// a copy can no longer be saved.
function chooseMarket(d, { accountId, initialMode, optOuts }) {
  const modes = Object.keys(MODE), due = modes.filter(m => !d.ballots[m]?.submittedAt && !optOuts.includes(m));
  const order = [...new Set([initialMode, ...due, ...modes].filter(Boolean))];
  const open = Date.parse(d.now) < Date.parse(d.deadline) && Date.parse(d.now) >= Date.parse(weekOpenAt(d.deadline));
  const waiting = open && order.find(m => {
    if (optOuts.includes(m) || ballotFinal(d.rules, d.ballots[m], d.games.map(g => g.id))) return false;
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

// Redesign stage 17: a picks-due state this screen does not know (one a later gtl-api adds) reads as closed, so the card never
// offers "Make picks" or a reminder for a state it cannot describe (communityBoard.js).
function PicksDue({ due, all = [], push = false, onPick }) {
  const state = dueState(due);
  if (!state) return null;
  const closed = state === 'closed', notOpen = state === 'not_open';
  // Persona audit #15: a submitted market stays on the card with a check; a sat-out market is never due (D-23), so it is left off.
  const modes = all.length ? all.filter(m => !m.satOut) : due.modes;
  const stillDue = !closed && modes.some(m => m.submitted) ? ' still due' : '';
  // After the deadline only a submitted ballot scores (D-21), so the card says submitted / draft (not submitted) / not submitted rather than a count.
  const counts = modes.map(m => `${MODE[m.mode]} ${m.submitted ? '✓ submitted' : closed ? (m.filled ? 'draft (not submitted)' : 'not submitted') : `${m.filled}/${m.games}${stillDue}`}`).join(' · ');
  // #43: before the open, no counts for a ballot nobody can touch; a relative hint and the due time instead. #13: the next Monday open after a closed week.
  const detail = notOpen ? `${inDays(due.opensAt, due.now)} · ${dueText(due.deadline)}` : closed ? `${counts} · Deadline passed · ${opensText(due.week + 1, nextOpenAt(due.deadline))}` : `${counts} · Due ${date(due.deadline)} PT`;
  return <section id="picks-due" tabIndex={-1} className={`panel picks-due ${state}`} role={state === 'urgent' ? 'alert' : 'status'}>
    <Bell size={22} aria-hidden="true"/>
    <div><h2>{notOpen ? opensText(due.week, due.opensAt) : closed ? `Week ${due.week} picks closed` : `Week ${due.week} picks due`}</h2><p>{detail}</p></div>
    {!closed && !notOpen && <button className="primary" onClick={onPick}>Make picks<ArrowRight size={17}/></button>}
    {/* D-28: opt-in web push, one reminder 2 hours before the deadline; nothing is registered until the player asks.
        Stage 2 push guard: shown only when /community/read says push is configured. */}
    {!closed && <PushReminderPrompt configured={push}/>}
  </section>;
}

/**
 * The Community board (redesign stage 17; D-36, DP-1, DP-2). Spread and Total are two tables, each ranked on its own by season
 * points; their points are never added together. "—" means no submitted ballot (the server sends null, never 0); "Sat out" a final
 * weekly opt-out (D-23). The week column is the published community week's (`feed.week`), the week the feed, the reveal gate and
 * the old Virtual Units line lock (stage 20) follow. Once the per-game gate is live (`rules.revealAt` 'kickoff', M-01), a game's
 * points count from its kickoff, so the week columns grow game by game.
 */
function Leaderboard({ feed }) {
  const name = id => feed.members.find(m => m.id === id)?.displayName || 'Former member';
  const weekLabel = feed.week ? `Week ${feed.week.week}` : 'Week';
  // D-23: a sat-out week reads "Sat out", never 0.
  const cell = (s, key) => (!s ? '—' : key === 'weekPoints' && s.satOut ? 'Sat out' : show(s[key]));
  return <section className="panel community-leaderboard" aria-label="Leaderboard">
    <div className="section-title"><h2>Leaderboard · {feed.week ? `${feed.week.season} season` : 'season'}</h2></div>
    <div className="leaderboard-boards">{Object.entries(MODE).map(([mode, label]) => <div className="table-scroll" key={mode}>
      <table data-mode={mode}><caption>{label}</caption>
        <thead><tr><th scope="col">Player</th><th scope="col">{weekLabel}</th><th scope="col">Season</th></tr></thead>
        <tbody>{boardRows(feed, mode, name).map(r => <tr key={r.id} className={r.id === feed.viewer ? 'me' : ''}><th scope="row">{name(r.id)}{r.removed && <small className="muted"> · Removed</small>}</th>
          <td className="mono">{cell(r.standing, 'weekPoints')}</td><td className="mono">{cell(r.standing, 'seasonPoints')}</td></tr>)}</tbody></table></div>)}</div>
    <p className="muted small">Spread and Total are ranked separately; their points are never added together. {feed.rules?.revealAt === 'kickoff' ? "Each game's points count from its kickoff, so week totals grow game by game. " : ''}Points are fixed when each pick is saved against that moment's consensus. — means no submitted ballot; Sat out means a final weekly opt-out. Removed members keep their records. Challenge and Units records stay in each group.</p>
  </section>;
}

function PostText({ post, name }) {
  const who = <strong>{name(post.actorId)}</strong>;
  switch (post.kind) {
    case 'joined': return <p>{who} joined Guess The Line.</p>;
    case 'week_published': return <p>{who} opened <strong>Week {post.week}</strong>: {post.games} games, picks due {date(post.deadline)} PT.</p>;
    // D-30: a sent ballot's stored Late marker shows wherever its picks do (written from M-07).
    case 'ballot_submitted': return <p>{who} submitted Week {post.week} {MODE[post.mode]} picks.{post.late && <span className="late-marker"> {lateText(post.late)}</span>}</p>;
    case 'bet_posted': return <p>{who} posted a bet in Bet Tracker.</p>;
    case 'bet_settled': return <p>{who} settled a Bet Tracker bet.</p>;
    default: return null;
  }
}

/**
 * A sent ballot's picks in the feed (redesign stage 17; D-39, D-31, D-23). The server opens another member's picks game by game:
 * each game shows once that game and market is open to the viewer (their own lock-in, a sit-out, or that game's kickoff) and the
 * rest are counted, never shown. A server before the per-game gate hides a whole post (`hiddenGames` null): then the post says so.
 */
function PostPicks({ post, canSubmit = false }) {
  const view = postPicksView(post);
  if (!view) return null;
  // What opens the rest: the viewer's own submission while that market is still due, else each game's kickoff (D-39, D-31).
  const submit = `Submit your Week ${post.week} ${MODE[post.mode]} picks to see ${view.shown.length ? 'them now' : 'these'}`;
  if (view.allHidden) return <p className="muted small post-picks-hidden"><LockKeyhole size={14} aria-hidden="true"/>{!view.perGame
    ? `Submit your Week ${post.week} ${MODE[post.mode]} picks to see these.` : canSubmit ? `${submit}, or wait for each game's kickoff.` : "Hidden until each game's kickoff."}</p>;
  if (!post.picks) return null;
  return <>
    <ul className="post-picks mono">{view.shown.map(([gameId, value]) => {
      const [away, home] = gameId.split('-');
      return <li key={gameId}><span>{away} @ {home}</span><span>{pickText(post.mode, away, home, value)}</span></li>;
    })}</ul>
    {view.hidden > 0 && <p className="muted small post-picks-hidden"><LockKeyhole size={14} aria-hidden="true"/>{view.hidden} more {view.hidden === 1 ? 'game is' : 'games are'} hidden until kickoff.{canSubmit ? ` ${submit}.` : ''}</p>}
  </>;
}

function Post({ post, name, onLike, onComment, busy, canSubmit = false }) {
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
  // Persona audit #25: the receipt's "See everyone's <market> picks" lands on the first post for that market, so each post is a focus target.
  return <article ref={root} className="panel feed-post" data-post={post.id} tabIndex={-1}>
    <div className="feed-post-head"><PostText post={post} name={name}/><time className="muted small" dateTime={post.createdAt}>{date(post.createdAt)} PT</time></div>
    <PostPicks post={post} canSubmit={canSubmit}/>
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

/**
 * Persona audit #41 (D-23): a sat-out market shows the other members' revealed picks for one game as read-only chips, where the chip
 * rows the viewer can no longer use were. The community reader already exposes the numbers inside the feed's submission posts once the
 * viewer sat out, so this reads those posts and the week's submission list rather than a new route: a member with a loaded post shows
 * the pick, one whose post sits beyond the loaded feed pages reads "Submitted · in the feed" (the submission list carries submittedAt;
 * the post itself may not be loaded), a sat-out member "Sat out", the rest "Not submitted yet", or "No <Market> picks" once the deadline
 * has passed and nobody can submit (D-24). Members with picks come first. The viewer's own kept draft heads the list marked not scored: nothing is deleted.
 */
function RevealedPicks({ game, mode, season, week, feed, posts, own, closed }) {
  const spread = mode === 'guess_spread';
  const chip = (text, kind = 'number') => <span className={`chip ${kind}-chip selected revealed-chip`}><Check className="chip-check" size={14} aria-hidden="true"/>{text}</span>;
  const chips = value => (!spread ? chip(show(value)) : value === 0 ? chip("Pick'em", 'team') : <>{chip(shortName(value < 0 ? game.homeCode : game.awayCode), 'team')}{chip(`−${show(Math.abs(value))}`)}</>);
  const rows = feed.members.filter(m => m.id !== feed.viewer).map(m => {
    const status = feed.submissions.find(x => x.userId === m.id && x.mode === mode);
    const post = posts.find(p => p.kind === 'ballot_submitted' && p.actorId === m.id && p.season === season && p.week === week && p.mode === mode);
    const value = post?.picks?.[game.id];
    // Redesign stage 17 (D-39): the server opens a post game by game; a game it withheld from this viewer reads "Hidden".
    const picked = Number.isFinite(value), submitted = !!status?.submittedAt, withheld = !picked && !!post?.hiddenGames?.includes(game.id);
    return { id: m.id, name: m.displayName, removed: m.removed, value, picked, rank: picked ? 0 : status?.satOut ? 2 : submitted ? 1 : 3,
      state: withheld ? 'Hidden' : status?.satOut ? 'Sat out' : submitted ? 'Submitted · in the feed' : closed ? `No ${MODE[mode]} picks` : 'Not submitted yet' };
  }).sort((a, b) => a.rank - b.rank);
  const ownValue = own === '' || own === undefined || own === null ? null : Number(own);
  return <ul className="revealed-picks" aria-label={`${team(game.awayCode)} at ${team(game.homeCode)} ${MODE[mode]} picks`}>
    {Number.isFinite(ownValue) && <li><span className="revealed-name">You · draft (not scored)</span><span className="revealed-value">{chips(ownValue)}</span></li>}
    {rows.map(r => <li key={r.id}><span className="revealed-name">{r.name}{r.removed && <small className="muted"> · Removed</small>}</span>
      <span className="revealed-value">{r.picked ? chips(r.value) : <span className="muted">{r.state}</span>}</span></li>)}
  </ul>;
}


/** Persona audit #25: the receipt of a submitted ballot while the week is open. Its heading names the market and the count, the line
 * under it the submission time in PT (and the last change: a changed pick is re-referenced when saved, D-16), then what is still
 * due for the week with a button that opens it, the feed reveal for this market only (D-23) and "Edit picks". It is the ballot's
 * status whenever the market is shown; it takes focus only after an in-session submit (WeekPicks).
 * Redesign stage 15 (D-37, D-39): once the server's live rules say `sentFinal` (M-02), submitted picks are final. The line reads
 * "Submitted · final" and there is no "Edit picks". A change made before then (D-16) keeps its time on the line (D-23). */
function SubmitReceipt({ id, mode, count, ballot, other, deadline, busy, final = false, onOther, onReveal, onEdit }) {
  const changed = ballot.updatedAt && ballot.updatedAt !== ballot.submittedAt;
  const due = other.submitted ? 'Both ballots submitted. Nothing else is due this week.' : other.satOut ? `${MODE[other.mode]}: sat out (final). Nothing else is due this week.`
    : `${MODE[other.mode]}: ${other.filled}/${other.games} still due · ${dueText(deadline)}`;
  return <section className="panel submit-receipt" tabIndex={-1} aria-labelledby={id}>
    <CircleCheck size={22} aria-hidden="true"/>
    <div>
      <h3 id={id}>{MODE[mode]} submitted · {count} {count === 1 ? 'pick' : 'picks'}</h3>
      <p className="muted small">{final ? `${FINAL_LABEL} · ${date(ballot.submittedAt)} PT` : `Submitted ${date(ballot.submittedAt)} PT`}{changed ? ` · changed ${date(ballot.updatedAt)} PT` : ''}. {final
        ? "Each pick is scored against the line stored when you saved it (shown on each game). Submitted picks can't be changed."
        : 'Each pick is scored against the line stored when you saved it (shown on each game); a pick you change before the deadline takes the line at that save.'}</p>
      <p className="receipt-due">{due}</p>
      <div className="receipt-actions">
        {!other.submitted && !other.satOut && <button type="button" className="primary" aria-disabled={busy || undefined} onClick={onOther}>Make {MODE[other.mode]} picks<ArrowRight size={16} aria-hidden="true"/></button>}
        <button type="button" className="secondary" onClick={onReveal}>See everyone's {MODE[mode]} picks</button>
        {!final && <button type="button" className="secondary" onClick={onEdit}>Edit picks</button>}
      </div>
    </div>
  </section>;
}

// Play reuses this live ballot workflow. Its navigation adapter keeps the new shell's address and market state
// separate from the classic #picks history; omitted adapters preserve the original Community behavior.
export function WeekPicks({ accountId, onSaved, optOuts = [], onSatOut, onSignOut, onSignInAgain, onReveal, initialMode, feed, posts = [], marketNavigation, presentation }) {
  // Persona audit #3: the Picks history entry carries its market (#picks-spread, #picks-total), so a reload, Back or Forward reopens
  // the market that was open, with its unsaved picks offered back. A bare entry (the Picks tab, "Make picks") is settled by
  // chooseMarket in the same render the week arrives, so no other market's chips ever show first; the choice is written back
  // into the entry. Read once at mount: the entry is this screen's own record, nothing else changes it while the screen is open.
  const entryMarket = useRef(marketNavigation ? marketNavigation.read() : currentMarket());
  const [data, setData] = useState(null), [mode, setMode] = useState(() => entryMarket.current || initialMode || 'guess_spread'), [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false), [saving, setSaving] = useState(null), [error, setError] = useState(''), [unpublished, setUnpublished] = useState(false);
  const [notice, setNotice] = useState(''), [failure, setFailure] = useState(null), [hint, setHint] = useState(''), [recovery, setRecovery] = useState(null);
  const [dismissed, setDismissed] = useState(() => new Set(Object.keys(MODE).filter(m => { try { return localStorage.getItem(helpKey(m)) === 'off'; } catch { return false; } })));
  const request = useRef(null), root = useRef(null), refocus = useRefocus(root), hintId = useId(), receiptId = useId(), finalId = useId();
  const [showTrends, toggleTrends] = useTrendsToggle();
  // The save-bar button behind the latest request ("draft" or "submit"); a banner action hands focus back to it.
  const action = useRef('draft');
  const settled = useRef(entryMarket.current !== null), latest = useRef(null);
  latest.current = { accountId, initialMode, optOuts, marketNavigation, onSignInAgain };
  const load = useCallback(async () => {
    const result = await cloudApi('personal');
    if (!settled.current) { settled.current = true; const chosen = chooseMarket(result, latest.current); setMode(chosen); (latest.current.marketNavigation?.write ?? setMarket)(chosen); }
    setData(result);
    return result;
  }, []);
  // Persona audit #14: no published week (the handler answers 404) is a quiet state, not an error.
  const loadWeek = useCallback(() => { setError(''); setUnpublished(false); return load().catch(e => { if (e.status === 404) setUnpublished(true); else { setError(plain(e, 'tap Retry')); if (e.status === 401) latest.current.onSignInAgain?.(); } }); }, [load]);
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
  if (data.rules?.sentFinal === true && data.rules?.lateWindow === 'kickoff' && data.rules?.perGameScoring === true) return <Suspense fallback={<p role="status">Loading per-game picks…</p>}><PerGameLegacy key={`${accountId}:${data.season}:${data.week}:${mode}`} accountId={accountId} initialData={data} mode={mode} optOuts={optOuts} onMode={value => { setMode(value); (marketNavigation?.write ?? setMarket)(value); }} onSaved={() => { load(); onSaved?.(); }} onSignInAgain={onSignInAgain}/></Suspense>;
  const picks = picksOf(data, mode, draft), edits = recovery ? communityDraftEdits(recovery) : 0;
  const ballot = data.ballots[mode], submitted = !!ballot?.submittedAt, closed = Date.parse(data.now) >= Date.parse(data.deadline);
  const opensAt = weekOpenAt(data.deadline), notOpen = Date.parse(data.now) < Date.parse(opensAt);
  const satOut = optOuts.includes(mode);
  // Redesign stage 15 (D-37, D-39): once the server's live rules say `sentFinal` (M-02), each locked-in pick is final (today, a pick in
  // the submitted ballot): its chips are read-only and a ballot with every pick locked in has nothing left to save. Until then
  // `rules.sentFinal` is false and a submitted ballot stays editable until the deadline (D-16).
  const finalRule = sentFinal(data.rules), isFinal = gameId => pickFinal(data.rules, ballot, gameId);
  const allFinal = ballotFinal(data.rules, ballot, data.games.map(g => g.id));
  const open = !closed && !notOpen && !satOut, editable = open && !allFinal;
  // Redesign stage 17 (D-39): line-dependent trends unlock per game and market: this player's own lock-in, a sit-out, or that game's
  // kickoff (under today's rules also the deadline), the gate M-01 applies in SQL.
  const trendAccess = gameId => communityAccess(data, gameId, optOuts);
  const filled = Object.values(picks).filter(v => v !== '').length, remaining = data.games.length - filled;
  const dirty = data.games.some(g => String(picks[g.id]) !== String(ballot?.picks?.[g.id] ?? ''));
  // Persona audit #8: every save failure names the problem and offers the next step, beside the save bar. "Sign in again" unmounts
  // this screen and its unsaved picks, so the banner says so and puts Retry first. Since October 12, 2026 a market-refresh limit
  // never refuses a save, so no banner exists for it; the only coded refusal left (GTL_SUBMISSION_QUOTES_REQUIRED, a failed check
  // of the saved line at commit) is retried as it is. Only a bare 409 is a revision conflict with another device; a 400 cannot
  // succeed on a retry.
  function describe(e, retry) {
    if (!e.status) return { message: 'No connection. Your picks are kept on this screen; reconnect and tap Retry.', actions: [['Retry', retry]] };
    if (e.status === 401) return onSignInAgain
      ? { message: 'Your session has expired. Your picks are kept on this screen; sign in again, then retry the save.', actions: [['Sign in again', onSignInAgain], ['Retry', retry]] }
      : { message: 'Your session has expired and these picks are not saved. Retry first; if that fails, note your picks, then sign in again (it clears this screen).', actions: [['Retry', retry], ['Sign in again', () => onSignOut?.()]] };
    if (e.code) return { message: e.message, actions: [['Retry', retry]] };
    if (e.status === 409) return { message: e.message, actions: [['Load latest', loadLatest]] };
    if (e.status === 400) return { message: e.message, actions: [] };
    return { message: e.message, actions: [['Retry', retry]] };
  }
  // Persona audit #25: a submit from the save bar hands focus to the receipt (2.4.3); the save bar's status line is the announcement.
  // A save made on the way to the other market (switchMode) leaves focus on the market button instead.
  async function save(submit, focusReceipt = true) {
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
      if (submit && focusReceipt) refocus('.submit-receipt');
      return true;
    } catch (e) {
      if (isBallotLocked(e)) { await showFinal(); return false; }
      setFailure(describe(e, () => save(submit))); return false;
    } finally { setBusy(false); setSaving(null); }
  }
  // Redesign stage 18 (M-02): the server refused a change to a locked-in pick (GTL_BALLOT_LOCKED), because it was locked in on another
  // device or this tab still held the rules from before M-02. The latest saved picks come in: a final pick shows as saved, and this
  // tab's edits to picks that are still open stay on top of them. No Retry: the same save would be refused again.
  async function showFinal() {
    request.current = null;
    try {
      const latest = await load();
      setDraft(dr => {
        if (!dr) return null;
        const fresh = picksFor(latest, dr.mode), saved = latest.ballots[dr.mode];
        return { data: latest, mode: dr.mode, picks: Object.fromEntries(latest.games.map(g => [g.id, pickFinal(latest.rules, saved, g.id) ? fresh[g.id] : dr.picks[g.id] ?? fresh[g.id]])) };
      });
      setNotice(`${LOCKED_MESSAGE} Your saved picks are shown.`);
    } catch (reload) { setFailure(describe(reload, loadLatest)); }
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
      if (!(await save(submitted, false))) return;
      setNotice(`${submitted ? `${MODE[mode]} picks submitted` : 'Draft saved'}. Now showing ${MODE[next]}.`);
    }
    setMode(next); (marketNavigation?.write ?? setMarket)(next); setHint('');
  }
  // Persona audit #6: Submit stays enabled and says what is missing instead of going grey.
  function submitOrExplain() {
    if (remaining > 0) { setHint(submitted ? `${missing()} to save your ${MODE[mode]} changes. ${stands()}` : `${missing()} to submit ${MODE[mode]}. ${filled ? `Save draft keeps the ${filled} you have.` : 'Save draft keeps a partial ballot.'}`); return; }
    save(true);
  }
  const header = satOut ? "Sat out · others' picks visible" : notOpen ? `Not open yet · ${dueText(data.deadline)}`
    : `${filled}/${data.games.length} picked · ${closed ? 'Closed' : `Due ${date(data.deadline, { weekday: 'short' })} PT (${dueIn(data.deadline, data.now)})`}${submitted ? (closed ? ' · Submitted' : finalRule ? ` · ${FINAL_LABEL}` : ' · Submitted, editable until the deadline') : ''}`;
  // The receipt's "still due" line reads the other market's saved ballot and opt-out (a sat-out market is never due, D-23).
  const otherMode = mode === 'guess_spread' ? 'guess_total' : 'guess_spread';
  const other = { mode: otherMode, submitted: !!data.ballots[otherMode]?.submittedAt, satOut: optOuts.includes(otherMode), games: data.games.length,
    filled: Object.values(picksFor(data, otherMode)).filter(v => v !== '').length };
  const SaveDock = presentation?.SaveDock || 'div';
  const HelpCard = presentation?.HelpCard;
  return <section ref={root} className="week-picks">
    <div className="personal-actions" role="group" aria-label="Market">{Object.entries(MODE).map(([m, label]) =>
      <button key={m} className={mode === m ? 'primary' : 'secondary'} aria-pressed={mode === m} aria-disabled={busy || undefined} onClick={() => switchMode(m)}>
        {label}{data.ballots[m]?.submittedAt ? ' ✓' : optOuts.includes(m) ? ' · Sat out' : ''}</button>)}</div>
    {/* Situational trends (October 12, 2026 ruling): off by default so each game keeps one Tab stop per chip row; the choice is kept on this device. */}
    <div className="trends-toggle-row"><button type="button" className="secondary trends-toggle" aria-pressed={showTrends} onClick={toggleTrends}><ChartSpline size={16} aria-hidden="true"/>Show trends</button>
      <span className="muted small">Past results by game situation. Reference only; trends never change scoring.</span></div>
    <p className="muted">Week {data.week} · {header}</p>
    {notOpen && <section className="panel week-not-open" role="status"><h3>{opensText(data.week, opensAt)}</h3><p>Nobody can pick before then. The schedule is below; the chips appear when the week opens.</p></section>}
    {/* Persona audit #41: the sat-out screen keeps its promise. The other members' picks for this market are on the cards below; once the
        deadline has passed nobody can submit (D-24), so the note says so rather than "once they submit". */}
    {satOut && <p className="auth-notice week-sat-out" role="status" tabIndex={-1}>You sat out Week {data.week} {MODE[mode]}. This week's {MODE[mode]} score is recorded as sat out, not zero. {closed ? `The deadline has passed; the other members' ${MODE[mode]} picks are below.` : `The other members' ${MODE[mode]} picks show below once they submit.`}</p>}
    {/* Persona audit #13: only a submitted ballot scores, so a draft that was never submitted is told so. A sat-out market is recorded as sat
        out (the note above), so its closed line carries only the next open. */}
    {closed && <p className="auth-notice week-closed" role="status">Week {data.week} {MODE[mode]} picks are closed.{!satOut && ` ${submitted ? `Your submitted ${MODE[mode]} picks stay below.` : filled ? `Your ${MODE[mode]} draft was never submitted, so it does not score this week.` : `You made no ${MODE[mode]} picks this week.`}`} {opensText(data.week + 1, nextOpenAt(data.deadline))}.</p>}
    {error && <div className="error-banner" role="alert"><TriangleAlert size={18}/><span>{error}</span></div>}
    {notice && !editable && <p className="auth-notice" role="status">{notice}</p>}
    {/* The receipt is the submitted ballot's standing status; the recovery card below it carries this tab's unsaved edits on top of it.
        Neither moves focus on a reload or a market switch: the receipt takes focus only after an in-session submit (save), and the
        card's buttons hand focus to the first chip. */}
    {submitted && open && <SubmitReceipt id={receiptId} mode={mode} count={Object.values(picksFor(data, mode)).filter(v => v !== '').length} ballot={ballot} other={other} deadline={data.deadline} busy={busy} final={finalRule}
      onOther={() => switchMode(otherMode)} onReveal={() => onReveal?.(mode)} onEdit={() => root.current?.querySelector('.week-pick-list .chip:not(:disabled)')?.focus()}/>}
    {/* Persona audit #3: a tab copy that differs from the saved ballot is offered back, never applied silently and never called saved. */}
    {recovery && editable && <section className="panel picks-recovery" aria-label={`Unsaved ${MODE[mode]} picks`}>
      <h3>Unsaved {MODE[mode]} picks found in this tab</h3>
      <p>{edits} {edits === 1 ? 'pick' : 'picks'} from {date(recovery.updatedAt)} PT, kept on this device only: not saved to your account and not submitted. Restore puts them on top of your latest saved picks.</p>
      <div className="picks-recovery-actions"><button type="button" className="primary" aria-disabled={busy || undefined} onClick={restoreRecovery}>Restore picks</button><button type="button" className="secondary" aria-disabled={busy || undefined} onClick={discardRecovery}>Discard</button></div>
    </section>}
    {!dismissed.has(mode) && editable && (HelpCard ? <HelpCard mode={mode} help={CHIP_HELP[mode]} onDismiss={dismissHelp}/>
      : <div className="chip-help" role="note"><p>{CHIP_HELP[mode]}</p>
        <button type="button" className="text-button" aria-label="Got it, hide this tip" onClick={dismissHelp}>Got it</button></div>)}
    <div className="week-pick-list">{data.games.map(g => {
      // Only the new app supplies a presentation. The same controls, gates and writer state serve both views.
      const title = `${team(g.awayCode)} @ ${team(g.homeCode)}`, kickoff = `${date(g.kickoff)} PT`;
      const facts = <TeamFacts week={data.week} awayCode={g.awayCode} homeCode={g.homeCode}/>;
      const reference = submitted ? <LineAtGuess reference={ballot.scoringReferences?.[g.id]} pick={ballot.picks?.[g.id]} spread={mode === 'guess_spread'}/> : null;
      const picker = satOut && feed ? <RevealedPicks game={g} mode={mode} season={data.season} week={data.week} feed={feed} posts={posts} own={picks[g.id]} closed={closed}/>
        : !notOpen && <ChipPicker key={`${mode}-${g.id}-${data.weeklyRevision}`} mode={mode} value={picks[g.id]} away={shortName(g.awayCode)} home={shortName(g.homeCode)} teamLabels={presentation?.teamLabels?.(g)}
          label={`${team(g.awayCode)} at ${team(g.homeCode)} ${MODE[mode]}`} disabled={busy || !editable || isFinal(g.id)} onChange={value => { setHint(''); setRecovery(null); setDraft(dr => ({ data, mode, picks: { ...picksOf(data, mode, dr), [g.id]: value } })); }}/>;
      // The access gate still owns line-dependent trends, whether details are expanded or collapsed.
      const trends = showTrends ? <GameTrends season={data.season} week={data.week} gameId={g.id} away={g.awayCode} home={g.homeCode} level={4} access={trendAccess(g.id)} savedLabel="your saved line"
        saved={{ spread: referenceValue(data.ballots.guess_spread?.scoringReferences?.[g.id]), total: referenceValue(data.ballots.guess_total?.scoringReferences?.[g.id]) }}/> : null;
      const Card = presentation?.GameCard;
      return Card ? <Card key={g.id} game={g} title={title} kickoff={kickoff} facts={facts} reference={reference} picker={picker} trends={trends}
        picked={picks[g.id] !== ''} changed={String(picks[g.id]) !== String(ballot?.picks?.[g.id] ?? '')} submitted={submitted} satOut={satOut} notOpen={notOpen}/>
        : <article className="panel week-pick" key={g.id}><h3>{title}</h3><p className="muted small">{kickoff}</p>{facts}{reference}{picker}{trends}</article>;
    })}</div>
    {editable && <SaveDock className="save-bar">
      {failure && <div className="error-banner" role="alert"><TriangleAlert size={18}/><span>{failure.message}</span>
        {!!failure.actions.length && <div className="banner-actions">{failure.actions.map(([label, fn]) => <button key={label} type="button" className="text-button" aria-disabled={busy || undefined} onClick={() => { refocus(`[data-action="${action.current}"]`); fn(); }}>{label}</button>)}</div>}</div>}
      {notice && <p className="auth-notice save-notice" role="status">{notice}</p>}
      {/* Always mounted: a live region whose text changes is announced; one inserted with its text often is not. Submit is described by it. */}
      <p className="save-hint" id={hintId} role="status" aria-live="polite">{hint}</p>
      {/* Persona audit #24: the due time travels with the sticky bar, so the deadline is on screen wherever the player is scrolled. */}
      {/* Redesign stage 15: while lock-in is final, the rule sits beside Submit and describes it, before anything is sent. */}
      <div className="save-status"><strong>{filled}/{data.games.length} ready</strong><span className="save-due">{dueShort(data.deadline, data.now)}</span>
        {finalRule && !submitted && <span className="save-final" id={finalId}>{FINAL_SHORT}</span>}</div>
      {/* Busy and nothing-to-save states are aria-disabled, not disabled, so the pressed button keeps focus while it reads "Saving…" and after. */}
      {!submitted && <button className="secondary" data-action="draft" aria-disabled={busy || !dirty || undefined} onClick={() => { if (!busy && dirty) save(false); }}>{saving === 'draft' ? <><LoaderCircle className="spin" size={16}/>Saving…</> : 'Save draft'}</button>}
      <button className="primary" data-action="submit" aria-disabled={busy || (submitted && !dirty) || undefined} aria-describedby={finalRule && !submitted ? `${hintId} ${finalId}` : hintId} onClick={() => { if (!busy && !(submitted && !dirty)) submitOrExplain(); }}>{saving === 'submit' ? 'Submitting…' : submitted ? 'Save changes' : `Submit ${MODE[mode]}`}</button></SaveDock>}
    {/* Persona audit #40: the final opt-out is a text link below the ballot, after Save draft and Submit in the tab order, not a button beside them.
        The opt-out clears the last save notice ("Draft saved.") so it does not sit under the sat-out note. */}
    {editable && !submitted && <SitOutWeek season={data.season} week={data.week} mode={mode} busy={busy} onDone={async () => { removeCommunityDraft(scope); setNotice(''); refocus('.week-sat-out'); await load(); await onSatOut?.(); }}/>}
  </section>;
}

export default function CommunityHome({ accountId, onGroups, onSignOut, displayName, onUnavailable, welcome = '' }) {
  // Persona audit #3: the open tab is the URL hash (#feed, #picks, #history), one history entry each, so Back returns to the feed and a reload lands on the same tab.
  const screen = useScreen(), tab = ['picks', 'history'].includes(screen) ? screen : 'feed';
  const [league, setLeague] = useState('nfl'), [feed, setFeed] = useState(null), [older, setOlder] = useState([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [retryable, setRetryable] = useState(false);
  const main = useRef(null), refocus = useRefocus(main);
  // Persona audit #29: arriving from the name step, the saved-name confirmation is a status on this screen and focus moves to main
  // (2.4.3), so the newcomer sees and hears that the name stuck instead of landing on <body> with the notice left on My games.
  // PR #34 pattern: the status below is an always-mounted live region, empty on the first paint and filled here, so the text is
  // announced as a change rather than inserted with its node. GameHub hands `welcome` over once, right after the first save.
  // preventScroll: focusing a main taller than the viewport would otherwise scroll the brand and the player's name off the top.
  useEffect(() => { if (welcome) { setNotice(welcome); main.current?.focus({ preventScroll: true }); } }, [welcome]);
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
  // Redesign stage 17: a picks-due state this screen does not know reads as closed (communityBoard.js).
  const dueNow = dueState(feed?.picksDue);
  const due = ['due', 'urgent'].includes(dueNow) ? feed.picksDue.modes.length : 0;
  const picksClosed = dueNow === 'closed';
  // Persona audit #17: the skip link lands on the picks-due card when there is one, and says so (WCAG 2.4.4).
  const dueCard = tab === 'feed' && !soon && !!dueNow;
  // A post's market can still be submitted by this viewer: its week is the open week and that market is still due.
  const stillDue = post => due > 0 && post.season === feed.week?.season && post.week === feed.week?.week && feed.picksDue.modes.some(m => m.mode === post.mode);
  // The feed banner's Retry removes the banner: focus goes to main once the feed is back, or to the new banner's Retry.
  async function retryFeed() { refocus('[data-action="feed-retry"]'); if (await act(load)) { refocus(null); main.current?.focus(); } }
  // Persona audit #25: the receipt's "See everyone's Spread picks" opens the feed on its first Spread post (the reveal is per market,
  // D-23: the other market's posts stay hidden until that ballot is submitted), or on the feed itself when no post exists yet.
  // The move is a #feed history entry like a tab tap (persona audit #3), so Back returns to the Picks market the receipt was on.
  function reveal(mode) { const post = posts.find(p => p.kind === 'ballot_submitted' && p.mode === mode); refocus(post ? `[data-post="${post.id}"]` : '.community-feed'); goScreen('feed'); }
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
        {[['feed', 'Feed'], ['picks', `Picks${due ? ` (${due} due)` : picksClosed ? ' (closed)' : ''}`], ['history', 'History']].map(([key, label]) =>
          <button key={key} className={tab === key ? 'primary' : 'secondary'} aria-pressed={tab === key} onClick={() => goScreen(key)}>{label}</button>)}
        <button className="secondary" onClick={onGroups}>Groups & games<ArrowRight size={16}/></button>
      </nav>
      {error && <div className="error-banner" role="alert"><TriangleAlert size={18}/><span>{error}</span>{!feed && retryable && <button type="button" className="text-button" data-action="feed-retry" aria-disabled={busy || undefined} onClick={() => { if (!busy) retryFeed(); }}>Retry</button>}</div>}
      <p className="auth-notice" role="status" aria-live="polite">{notice}</p>
      {tab === 'picks' ? <WeekPicks accountId={accountId} feed={feed} posts={posts} optOuts={feed?.optOuts || []} initialMode={feed?.picksDue?.modes?.[0]?.mode} onSignOut={onSignOut} onReveal={reveal} onSaved={() => load().catch(() => {})} onSatOut={() => load().catch(() => {})}/>
        : tab === 'history' ? <CommunityHistory accountId={accountId}/>
        : !feed ? !error && <p role="status"><LoaderCircle className="spin"/>Loading the feed…</p> : <>
        {!feed.week && <WeekUnpublished/>}
        <PicksDue due={feed.picksDue} all={feed.due} push={feed.pushConfigured === true} onPick={() => goScreen('picks')}/>
        <Leaderboard feed={feed}/>
        {feed.admin && <PublishWeek week={feed.week} onDone={async message => { setNotice(message); await load(); }}/>}
        {feed.admin && feed.week && <RefereeAssignments season={feed.week.season} week={feed.week.week}/>}
        <section className="community-feed" aria-label="Activity feed" tabIndex={-1}>
          {posts.map(post => <Post key={post.id} post={post} name={name} busy={busy} onLike={like} onComment={comment} canSubmit={stillDue(post)}/>)}
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
        {/* Redesign stage 9 (D-38, D-39): every signed-in member can opt in to the new app on this device. */}
        <TryNewApp disabled={busy}/>
        <button className="secondary" disabled={busy} onClick={onSignOut}>Sign out</button><LegalLinks/></div>
    </main>
  </div>;
}
