import React, { useCallback, useEffect, useId, useState } from 'react';
import { CalendarClock, LoaderCircle, LockKeyhole, RefreshCw, TriangleAlert } from 'lucide-react';
import { communityApi, date } from './api';
import { TeamMatchup } from './TeamIdentity';
import { MODE, lateText, pickText, shortName, show } from './communityFormat';

/**
 * Community history (Sean's rulings, October 12, 2026): every member's Spread and Total guesses for every week, each with the
 * line at the guess and the points that line gives, the final when one is recorded, and nothing deleted or hidden (D-23). The
 * line is the one saved with the guess (D-16/D-27) or ruled for it (D-25); a guess saved without one (the Week 5 ballots
 * migrated from the group leagues) is compared with the line at the guess, resolved by the server: the newest stored line
 * observed at or before it, else the first line stored after it and before kickoff, with its source, observation time and
 * how long before or after the guess it was observed. A ballot whose original submission time was not recorded is compared at
 * the submission time it stores, labelled as such. One player at a time, weeks newest first, both markets per week.
 * Another member's open-week guesses stay hidden game by game until that game and market is open to the viewer (redesign stage
 * 17, D-39: the viewer's own lock-in, a sit-out, or that game's kickoff; the same gate as the feed), and before the per-game gate
 * (M-01) until the viewer submits that market or sits out; the week's points total is shared as it is on the leaderboard. Once
 * the per-game gate is live a game's points count from its kickoff, so a sent guess reads "Scores at kickoff" until then. The
 * last change, the number of revisions after submitting and where a ballot came from are the owner's alone, so another
 * player's section shows the submission time only.
 * A practice ballot without an eligible commissioner ruling (D-08) is listed with its guesses and lines, labelled, and never
 * scored. Points come from the server.
 */
const MODES = Object.keys(MODE);
// Persona audit #8: a request that never reached the service (no status) reads as "offline", never as "Failed to fetch".
const plain = (e, next = 'try again') => (e.status ? e.message : `No connection. Reconnect and ${next}.`);
const ballotNoun = mode => (mode === 'guess_total' ? 'totals' : 'spreads');
const PROVENANCE = { 'community-import': 'Commissioner-ruled import', solo: 'Solo workspace', 'migrated-league': 'Migrated from the group league', group: 'Group ballot', unknown: '' };
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
/** How long before or after the guess a line was observed: "4h 40m before the guess", "31m after the guess", "at the guess". */
function gapPhrase(seconds, anchor = 'the guess') {
  if (!Number.isFinite(seconds)) return '';
  if (seconds === 0) return `at ${anchor}`;
  const minutes = Math.round(Math.abs(seconds) / 60), hours = Math.floor(minutes / 60), days = Math.floor(hours / 24);
  const span = days >= 1 ? `${days}d ${hours % 24}h` : hours >= 1 ? `${hours}h ${minutes % 60}m` : minutes >= 1 ? `${minutes}m` : 'under a minute';
  return `${span} ${seconds > 0 ? 'before' : 'after'} ${anchor}`;
}
const fileName = path => path.split('/').pop();
const NONE_REASONS = {
  'submission-time-unavailable': 'No readable submission time is stored, so no line at the guess can be chosen',
  'guess-at-or-after-kickoff': 'Guessed at or after kickoff',
  'no-schedule-template': 'No schedule entry for this game',
};

/** The line a guess is compared against: saved (D-16/D-27), commissioner-ruled (D-25), the line at the guess, the nearest snapshot (older providers), or none. */
export function HistoryLine({ reference, mode, game }) {
  if (!reference) return <><strong className="mono">—</strong><small>No line saved · draft</small></>;
  const value = reference.value === null ? '—' : pickText(mode, game.awayCode, game.homeCode, reference.value, { even: 'Even' });
  const source = reference.source && <small>{reference.source}</small>;
  const observed = reference.observedAt && <small>Observed {date(reference.observedAt)} PT</small>;
  if (reference.basis === 'saved' && reference.status === 'pending') {
    return <><strong className="mono">—</strong><small>Pending · the first line after submission becomes this guess's reference</small>{reference.savedAt && <small>Saved {date(reference.savedAt)} PT</small>}</>;
  }
  if (reference.basis === 'saved' && reference.value === null) {
    return <><strong className="mono">—</strong><small>Unscored · {reference.status === 'stale' ? 'the saved line was stale at submission' : reference.reason || 'no eligible line was saved'}</small>{observed}</>;
  }
  if (reference.basis === 'saved') {
    return <><strong className="mono">{value}</strong><small>{reference.rule === 'first_line_after_submission' ? 'First line after submission' : 'Line saved with guess'}</small>{source}
      {reference.savedAt && <small>Saved {date(reference.savedAt)} PT</small>}{observed}</>;
  }
  if (reference.basis === 'commissioner-ruled') return <><strong className="mono">{value}</strong><small>Commissioner-ruled line{reference.decision ? ` (${reference.decision})` : ''}</small>{source}{observed}</>;
  if (reference.basis === 'line-at-guess') {
    // The original submission time was not recorded: the line is the one at the submission time the ballot stores.
    const stored = reference.guessedAtKnown === false;
    const gap = gapPhrase(reference.gapSeconds, stored ? 'the stored submission time' : 'the guess'), imported = reference.origin === 'imported-reference';
    return <><strong className="mono">{value}</strong>
      <small>{reference.rule === 'first-after-submission' ? 'Line at guess · first line after it' : 'Line at guess'}</small>
      {stored && <small className="history-informational">Original guess time not recorded · compared at the stored submission time</small>}
      {reference.source && <small>{reference.source}{imported && reference.sourceFile ? ` · ${fileName(reference.sourceFile)}` : ''}</small>}
      {imported && <small className="history-informational">Provisional · page time as published by the source{reference.capturedAt ? `; captured ${date(reference.capturedAt)} PT` : '; capture time not recorded'}{reference.decision ? ` (${reference.decision})` : ''}</small>}
      {reference.observedAt && <small>Observed {date(reference.observedAt)} PT{gap ? ` · ${gap}` : ''}</small>}</>;
  }
  if (reference.basis === 'nearest-snapshot') {
    const gap = gapPhrase(reference.gapSeconds);
    return <><strong className="mono">{value}</strong><small className="history-informational">Nearest snapshot at submission · not used for points</small>{source}
      {reference.observedAt && <small>Observed {date(reference.observedAt)} PT{gap ? ` · ${gap}` : ''}</small>}</>;
  }
  if (NONE_REASONS[reference.reason]) {
    return <><strong className="mono">—</strong><small>{reference.reason === 'submission-time-unavailable' ? 'Submission time unavailable' : 'No line stored'}</small><small>{NONE_REASONS[reference.reason]}</small></>;
  }
  return <><strong className="mono">—</strong><small>No line stored</small>
    <small>{reference.reason === 'snapshot-not-qualifying'
      ? `The snapshot before this submission (${date(reference.priorSnapshotAt)} PT) had no usable line for this game${reference.detail ? ` (${reference.detail})` : ''}`
      : reference.nextSnapshotAt ? `No snapshot before this submission; the first came ${date(reference.nextSnapshotAt)} PT` : 'No snapshot was collected for this week'}</small></>;
}

function Result({ result, game, mode }) {
  if (!result) return <><strong className="mono">—</strong><small>No final recorded</small></>;
  if (result.status !== 'final') return <><strong>{result.status === 'postponed' ? 'Postponed' : 'Cancelled'}</strong>{result.source && <small>{result.source}</small>}</>;
  const margin = result.home - result.away;
  const detail = mode === 'guess_total' ? `${result.home + result.away} total points` : margin === 0 ? 'Tie' : `${shortName(margin > 0 ? game.homeCode : game.awayCode)} by ${Math.abs(margin)}`;
  return <><strong className="mono">{game.awayCode} {result.away}–{result.home} {game.homeCode}</strong><small>Final · {detail}</small>
    <small>{result.origin === 'commissioner_reported' ? 'Commissioner-reported final' : result.source}</small></>;
}

const NOT_SCORED = { practice: 'Not scored · practice', 'ruled-ineligible': 'Not scored · not eligible' };
// Redesign stage 17: a sent guess whose game has not kicked off has a line but no points yet (points count from kickoff once the
// per-game gate is live, M-01); it reads "Scores at kickoff", not "Unscored".
const Points = ({ pick, entry, pending = false }) => (pick?.hidden ? <><strong className="mono">—</strong><small>Hidden</small></>
  : entry && !entry.eligible ? <><strong className="mono">—</strong><small>{NOT_SCORED[entry.eligibility] || NOT_SCORED.practice}</small></>
  : pick?.points === null || pick?.points === undefined ? <><strong className="mono">—</strong><small>{pending ? 'Scores at kickoff' : 'Unscored'}</small></> : <><strong className="mono">{show(pick.points)}</strong><small>of 10</small></>);
// A game withheld from this viewer (redesign stage 17, D-39): a lock and the word, never a number.
const Withheld = () => <span className="history-hidden"><LockKeyhole size={14} aria-hidden="true"/>Hidden</span>;
const ELIGIBILITY = { practice: 'Practice ballot · listed, never scored', 'ruled-ineligible': 'Not eligible by commissioner ruling · listed, never scored', 'ruled-eligible': 'Counts by commissioner ruling' };

function MarketHistory({ week, mode, entry, player, viewer, now }) {
  const label = MODE[mode], games = week.games, max = games.length * 10, you = player.id === viewer;
  // The per-game gate (M-01) is live when the server sends this viewer's gate for the week; then each game scores from its kickoff.
  const perGame = !!week.gate, at = Date.parse(now);
  const before = g => perGame && Number.isFinite(at) && !(Date.parse(g.kickoff) <= at);
  const pending = (pick, g) => !!pick && !pick.hidden && entry?.status === 'submitted' && Number.isFinite(pick.reference?.value) && before(g);
  const heading = useId();
  let body;
  if (!entry) body = <p className="history-state muted">No {ballotNoun(mode)} ballot{week.closed ? '' : ' yet'}.</p>;
  else if (entry.status === 'sat_out') body = <p className="history-state muted">Sat out{entry.satOutAt ? ` · ${date(entry.satOutAt)} PT` : ''}. Recorded as sat out, not zero.</p>;
  else {
    const changed = entry.updatedAt && entry.submittedAt && Date.parse(entry.updatedAt) !== Date.parse(entry.submittedAt);
    const submitted = entry.submittedAtKnown === false ? `Submitted · original time not recorded (stored as ${date(entry.submittedAt)} PT)` : `Submitted ${date(entry.submittedAt)} PT`;
    const status = entry.status === 'draft' ? `Draft (not submitted)${week.closed ? ' · does not score' : ''}`
      : `${submitted}${changed ? ` · changed ${date(entry.updatedAt)} PT` : ''}${entry.revisions ? ` · ${plural(entry.revisions, 'revision')} after submitting` : ''}`;
    // D-30: the stored Late marker shows wherever the picks do (written from M-07).
    const late = entry.status === 'submitted' && entry.late ? lateText(entry.late) : '';
    const basis = entry.ruling ? `Commissioner-ruled (${entry.ruling.decision})` : entry.scoringPolicy === 'submission-time' ? 'Scored against the line saved with each guess (D-16)'
      : entry.status !== 'submitted' ? ''
      : entry.submittedAtKnown === false ? `No line was saved with these guesses and the original submission time was not recorded; each is ${entry.eligible ? 'scored against' : 'shown with'} the line at the stored submission time (the newest stored line observed at or before it, else the first line after it and before kickoff)`
      : `No line was saved with these guesses; each is ${entry.eligible ? 'scored against' : 'shown with'} the line at the guess (the newest stored line observed at or before it, else the first line after it and before kickoff)`;
    const origin = [PROVENANCE[entry.provenance] || '', ELIGIBILITY[entry.eligibility] || '', basis].filter(Boolean).join(' · ');
    const summary = entry.status === 'draft' ? null
      : !entry.eligible ? <p className="history-points"><strong>{entry.eligibility === 'ruled-ineligible' ? 'Not eligible' : 'Practice'}</strong><span className="muted small">listed, not scored</span></p>
      : entry.weekScored ? <p className="history-points"><strong className="mono">{show(entry.weekPoints)} / {max} pts</strong><span className="muted small">{entry.weekScored} of {games.length} scored</span></p>
      : games.length && games.every(before) ? <p className="history-points"><strong>No points yet</strong><span className="muted small">each game scores from its kickoff</span></p>
      : <p className="history-points"><strong>Unscored</strong><span className="muted small">no line stored for these guesses</span></p>;
    body = <>
      <p className="history-status">{status}{late && <span className="late-marker"> · {late}</span>}</p>
      {origin && <p className="history-status muted">{origin}</p>}
      {summary}
      {entry.picksHidden && !entry.picks ? <p className="history-state muted">{!perGame ? `Hidden until you submit your Week ${week.week} ${label} picks or sit out.`
        : week.closed ? "Hidden until each game's kickoff." : `Hidden until you submit your Week ${week.week} ${label} picks or sit out, or each game's kickoff.`}</p> : <>
        {entry.picksHidden && <p className="history-state muted">{week.closed ? 'Games marked Hidden open at their kickoff.' : `Games marked Hidden open at their kickoff, or when you submit your Week ${week.week} ${label} picks or sit out.`}</p>}
        <div className="table-scroll comparison-table history-table" role="region" tabIndex={0} aria-labelledby={heading}>
          <table><caption className="sr-only">{player.displayName}'s Week {week.week} {label} guesses, the line at each guess, the final and the points</caption>
            <thead><tr><th scope="col">MATCHUP</th><th scope="col">GUESS</th><th scope="col">LINE AT GUESS</th><th scope="col">RESULT</th><th scope="col">POINTS</th></tr></thead>
            <tbody>{games.map(g => { const pick = entry.picks?.find(p => p.gameId === g.id); return <tr key={g.id}>
              <th scope="row"><TeamMatchup game={g} compact/><small>{date(g.kickoff)} PT</small></th>
              <td>{pick?.hidden ? <Withheld/> : <strong className="mono">{pickText(mode, g.awayCode, g.homeCode, pick?.guess)}</strong>}</td>
              <td>{pick?.hidden ? <strong className="mono">—</strong> : <HistoryLine reference={pick?.reference} mode={mode} game={g}/>}</td>
              <td><Result result={week.results[g.id]} game={g} mode={mode}/></td>
              <td><Points pick={pick} entry={entry} pending={pending(pick, g)}/></td></tr>; })}</tbody></table>
        </div>
        <div className="comparison-mobile history-cards">{games.map(g => { const pick = entry.picks?.find(p => p.gameId === g.id); return <article key={g.id} aria-label={`${g.awayCode} at ${g.homeCode} ${label}`}>
          <TeamMatchup game={g}/><small>{date(g.kickoff)} PT</small>
          <dl>
            <div><dt>Guess</dt><dd className="mono">{pick?.hidden ? <Withheld/> : pickText(mode, g.awayCode, g.homeCode, pick?.guess)}</dd></div>
            <div><dt>Line at guess</dt><dd>{pick?.hidden ? <strong className="mono">—</strong> : <HistoryLine reference={pick?.reference} mode={mode} game={g}/>}</dd></div>
            <div><dt>Result</dt><dd><Result result={week.results[g.id]} game={g} mode={mode}/></dd></div>
            <div><dt>Points</dt><dd><Points pick={pick} entry={entry} pending={pending(pick, g)}/></dd></div>
          </dl></article>; })}</div>
      </>}
    </>;
  }
  return <section className="history-market" aria-labelledby={heading}>
    <h3 id={heading}>{label}{you ? '' : ` · ${player.displayName}`}</h3>
    {body}
  </section>;
}

/** The one entry for a player and market; a final sit-out wins over a draft saved before it (the server lists one, this keeps the screen honest if both arrive). */
function entryFor(week, userId, mode) {
  const entries = week.entries.filter(e => e.userId === userId && e.mode === mode);
  return entries.find(e => e.status === 'sat_out') || entries[0];
}

export default function CommunityHistory({ accountId }) {
  const [data, setData] = useState(null), [player, setPlayer] = useState(accountId), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const load = useCallback(async (season) => {
    setBusy(true); setError('');
    try { setData(await communityApi('history', season ? { season } : {})); }
    catch (e) { setError(plain(e, 'tap Retry')); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  if (!data) return error ? <div className="error-banner" role="alert"><TriangleAlert size={18}/><span>{error}</span><button type="button" className="text-button" onClick={() => load()}>Retry</button></div>
    : <p role="status"><LoaderCircle className="spin"/>Loading history…</p>;
  // The viewer first, then everyone else by name; removed members keep their records (D-23).
  const members = [...data.members].sort((a, b) => (a.id === data.viewer ? -1 : b.id === data.viewer ? 1 : a.displayName.localeCompare(b.displayName)));
  const chosen = members.find(m => m.id === player) || members[0];
  return <section className="community-history" aria-label="History">
    <p className="muted">Every submitted Spread and Total ballot, every week, scored against the line at each guess. Nothing is deleted or hidden.</p>
    {error && <div className="error-banner" role="alert"><TriangleAlert size={18}/><span>{error}</span><button type="button" className="text-button" onClick={() => load()}>Retry</button></div>}
    <div className="history-toolbar">
      {data.seasons.length > 1 && <label>Season<select value={data.season ?? ''} disabled={busy} onChange={e => load(Number(e.target.value))}>{data.seasons.map(s => <option key={s} value={s}>{s}</option>)}</select></label>}
      <button type="button" className="text-button" aria-disabled={busy || undefined} onClick={() => { if (!busy) load(data.season); }}><RefreshCw size={16}/>Refresh</button>
    </div>
    {chosen && <div className="history-players" role="group" aria-label="Player">{members.map(m =>
      <button key={m.id} type="button" className={chosen.id === m.id ? 'primary' : 'secondary'} aria-pressed={chosen.id === m.id} onClick={() => setPlayer(m.id)}>
        {m.displayName}{m.id === data.viewer ? ' · You' : ''}{m.removed ? ' · Removed' : ''}</button>)}</div>}
    {!data.weeks.length && <section className="panel week-unpublished" role="status"><CalendarClock size={22} aria-hidden="true"/><p>No weeks have been published yet. History fills in as weeks open.</p></section>}
    {chosen && data.weeks.map(week => <section key={`${week.season}-${week.week}`} className="panel history-week" aria-label={`Week ${week.week} history`}>
      <h2>Week {week.week} · {week.season}</h2>
      <p className="muted small">Picks due {date(week.deadline, { weekday: 'short' })} PT · {week.closed ? 'Closed' : 'Open'} · {plural(week.games.length, 'game')}</p>
      {MODES.map(mode => <MarketHistory key={mode} week={week} mode={mode} player={chosen} viewer={data.viewer} now={data.now} entry={entryFor(week, chosen.id, mode)}/>)}
    </section>)}
    <p className="muted small">Points are fixed when each pick is saved against that moment's consensus. A guess with no saved line is scored against the line at the guess: the newest stored line observed at or before it, else the first line after it and before kickoff. Practice ballots are listed, never scored. Sat out is recorded as sat out, never 0.</p>
  </section>;
}
