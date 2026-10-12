import React, { useCallback, useEffect, useId, useState } from 'react';
import { CalendarClock, LoaderCircle, RefreshCw, TriangleAlert } from 'lucide-react';
import { communityApi, date } from './api';
import { TeamMatchup } from './TeamIdentity';
import { MODE, pickText, shortName, show } from './communityFormat';

/**
 * Community history (Sean's ruling, October 12, 2026): every member's Spread and Total guesses for every week, with the line
 * saved when they guessed (D-16) and the points that line gives, the final when one is recorded, and nothing deleted or hidden
 * (D-23). One player at a time, weeks newest first, both markets per week. Another member's open-week guesses stay hidden
 * until the viewer submits that market or sits out (the same reveal gate as the feed); the week's points total is shared as it
 * is on the leaderboard. A migrated ballot that carries no saved line shows the nearest snapshot at its submission for
 * reference only, labelled, and stays unscored rather than being scored against a later line. Points come from the server.
 */
const MODES = Object.keys(MODE);
// Persona audit #8: a request that never reached the service (no status) reads as "offline", never as "Failed to fetch".
const plain = (e, next = 'try again') => (e.status ? e.message : `No connection. Reconnect and ${next}.`);
const ballotNoun = mode => (mode === 'guess_total' ? 'totals' : 'spreads');
const PROVENANCE = { 'community-import': 'Commissioner-ruled import', solo: 'Solo workspace', 'migrated-league': 'Migrated from the group league', group: 'Group ballot', unknown: '' };
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
/** "2h 10m" between the nearest snapshot's observation and the guess. */
function gapText(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '';
  const minutes = Math.round(seconds / 60), hours = Math.floor(minutes / 60), days = Math.floor(hours / 24);
  if (days >= 1) return `${days}d ${hours % 24}h`;
  if (hours >= 1) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

/** The line a guess is compared against: saved (D-16), commissioner-ruled (D-25), the nearest snapshot for reference only, or none. */
function LineAtGuess({ reference, mode, game }) {
  if (!reference) return <><strong className="mono">—</strong><small>No line saved · draft</small></>;
  const value = reference.value === null ? '—' : pickText(mode, game.awayCode, game.homeCode, reference.value, { even: 'Even' });
  const source = reference.source && <small>{reference.source}</small>;
  const observed = reference.observedAt && <small>Observed {date(reference.observedAt)} PT</small>;
  if (reference.basis === 'saved' && reference.value === null) {
    return <><strong className="mono">—</strong><small>Unscored · {reference.status === 'stale' ? 'the saved line was stale at submission' : reference.reason || 'no eligible line was saved'}</small>{observed}</>;
  }
  if (reference.basis === 'saved') return <><strong className="mono">{value}</strong><small>Line saved with guess</small>{source}{reference.savedAt && <small>Saved {date(reference.savedAt)} PT</small>}{observed}</>;
  if (reference.basis === 'commissioner-ruled') return <><strong className="mono">{value}</strong><small>Commissioner-ruled line{reference.decision ? ` (${reference.decision})` : ''}</small>{source}{observed}</>;
  if (reference.basis === 'nearest-snapshot') {
    const gap = gapText(reference.gapSeconds);
    return <><strong className="mono">{value}</strong><small className="history-informational">Nearest snapshot at submission · not used for points</small>{source}
      {reference.observedAt && <small>Observed {date(reference.observedAt)} PT{gap ? ` · ${gap} before the guess` : ''}</small>}</>;
  }
  return <><strong className="mono">—</strong><small>No line stored</small>
    <small>{reference.nextSnapshotAt ? `No snapshot before this submission; the first came ${date(reference.nextSnapshotAt)} PT` : 'No snapshot was collected for this week'}</small></>;
}

function Result({ result, game, mode }) {
  if (!result) return <><strong className="mono">—</strong><small>No final recorded</small></>;
  if (result.status !== 'final') return <><strong>{result.status === 'postponed' ? 'Postponed' : 'Cancelled'}</strong>{result.source && <small>{result.source}</small>}</>;
  const margin = result.home - result.away;
  const detail = mode === 'guess_total' ? `${result.home + result.away} total points` : margin === 0 ? 'Tie' : `${shortName(margin > 0 ? game.homeCode : game.awayCode)} by ${Math.abs(margin)}`;
  return <><strong className="mono">{game.awayCode} {result.away}–{result.home} {game.homeCode}</strong><small>Final · {detail}</small>
    <small>{result.origin === 'commissioner_reported' ? 'Commissioner-reported final' : result.source}</small></>;
}

const Points = ({ pick }) => (pick?.points === null || pick?.points === undefined ? <><strong className="mono">—</strong><small>Unscored</small></> : <><strong className="mono">{show(pick.points)}</strong><small>of 10</small></>);

function MarketHistory({ week, mode, entry, player, viewer }) {
  const label = MODE[mode], games = week.games, max = games.length * 10, you = player.id === viewer;
  const heading = useId();
  let body;
  if (!entry) body = <p className="history-state muted">No {ballotNoun(mode)} ballot{week.closed ? '' : ' yet'}.</p>;
  else if (entry.status === 'sat_out') body = <p className="history-state muted">Sat out{entry.satOutAt ? ` · ${date(entry.satOutAt)} PT` : ''}. Recorded as sat out, not zero.</p>;
  else {
    const changed = entry.updatedAt && entry.submittedAt && Date.parse(entry.updatedAt) !== Date.parse(entry.submittedAt);
    const status = entry.status === 'draft' ? `Draft (not submitted)${week.closed ? ' · does not score' : ''}`
      : `Submitted ${date(entry.submittedAt)} PT${changed ? ` · changed ${date(entry.updatedAt)} PT` : ''}${entry.revisions ? ` · ${plural(entry.revisions, 'revision')}` : ''}`;
    const basis = entry.ruling ? `Commissioner-ruled (${entry.ruling.decision})` : entry.scoringPolicy === 'submission-time' ? 'Scored against the line saved with each guess (D-16)'
      : entry.status === 'submitted' ? 'No line was saved with these guesses; the nearest snapshot is shown for reference only and does not score' : '';
    const origin = [PROVENANCE[entry.provenance] || '', basis].filter(Boolean).join(' · ');
    const summary = entry.status === 'draft' ? null : entry.weekScored ? <p className="history-points"><strong className="mono">{show(entry.weekPoints)} / {max} pts</strong><span className="muted small">{entry.weekScored} of {games.length} scored</span></p>
      : <p className="history-points"><strong>Unscored</strong><span className="muted small">no saved line for this ballot</span></p>;
    body = <>
      <p className="history-status">{status}</p>
      {origin && <p className="history-status muted">{origin}</p>}
      {summary}
      {entry.picksHidden ? <p className="history-state muted">Hidden until you submit your Week {week.week} {label} picks or sit out.</p> : <>
        <div className="table-scroll comparison-table history-table" role="region" tabIndex={0} aria-labelledby={heading}>
          <table><caption className="sr-only">{player.displayName}'s Week {week.week} {label} guesses, the line at each guess, the final and the points</caption>
            <thead><tr><th scope="col">MATCHUP</th><th scope="col">GUESS</th><th scope="col">LINE AT GUESS</th><th scope="col">RESULT</th><th scope="col">POINTS</th></tr></thead>
            <tbody>{games.map(g => { const pick = entry.picks?.find(p => p.gameId === g.id); return <tr key={g.id}>
              <th scope="row"><TeamMatchup game={g} compact/><small>{date(g.kickoff)} PT</small></th>
              <td><strong className="mono">{pickText(mode, g.awayCode, g.homeCode, pick?.guess)}</strong></td>
              <td><LineAtGuess reference={pick?.reference} mode={mode} game={g}/></td>
              <td><Result result={week.results[g.id]} game={g} mode={mode}/></td>
              <td><Points pick={pick}/></td></tr>; })}</tbody></table>
        </div>
        <div className="comparison-mobile history-cards">{games.map(g => { const pick = entry.picks?.find(p => p.gameId === g.id); return <article key={g.id} aria-label={`${g.awayCode} at ${g.homeCode} ${label}`}>
          <TeamMatchup game={g}/><small>{date(g.kickoff)} PT</small>
          <dl>
            <div><dt>Guess</dt><dd className="mono">{pickText(mode, g.awayCode, g.homeCode, pick?.guess)}</dd></div>
            <div><dt>Line at guess</dt><dd><LineAtGuess reference={pick?.reference} mode={mode} game={g}/></dd></div>
            <div><dt>Result</dt><dd><Result result={week.results[g.id]} game={g} mode={mode}/></dd></div>
            <div><dt>Points</dt><dd><Points pick={pick}/></dd></div>
          </dl></article>; })}</div>
      </>}
    </>;
  }
  return <section className="history-market" aria-labelledby={heading}>
    <h3 id={heading}>{label}{you ? '' : ` · ${player.displayName}`}</h3>
    {body}
  </section>;
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
    <p className="muted">Every submitted Spread and Total ballot, every week, scored against the line saved with each guess. Nothing is deleted or hidden.</p>
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
      {MODES.map(mode => <MarketHistory key={mode} week={week} mode={mode} player={chosen} viewer={data.viewer} entry={week.entries.find(e => e.userId === chosen.id && e.mode === mode)}/>)}
    </section>)}
    <p className="muted small">Points are fixed when each pick is saved against that moment's consensus. A ballot saved before a line was collected shows the nearest snapshot for reference only and stays unscored rather than being scored against a later line. Sat out is recorded as sat out, never 0.</p>
  </section>;
}
