// Read the existing Community history endpoint; hidden guesses and references remain hidden.
import { useState } from 'react';
import { communityApi, date } from '../../api.js';
import { HistoryLine } from '../../CommunityHistory.jsx';
import { MODE, lateText, pickText, show } from '../../communityFormat.js';
import { Button, Card, Segmented } from '../ui/index.js';
import { useShell } from '../shell/context.js';
import { LeagueEmpty, LeagueFailure, LeagueLoading, useLeagueRead } from './useLeagueRead.jsx';

export function LeagueHistory({ app }) {
  const shell = useShell();
  const [season, setSeason] = useState(null), [player, setPlayer] = useState(app.accountId), [mode, setMode] = useState('guess_spread');
  const read = useLeagueRead(`${app.accountId}:history:${season || 'latest'}`, signal => communityApi('history', season ? { season } : {}, signal), error => {
    if (error.status === 401) app.requestSignIn?.(); else app.refresh({ only: ['community'] });
  });
  if (read.loading) return <LeagueLoading label="Loading history…"/>;
  if (read.error) return <LeagueFailure error={read.error} onRetry={read.retry}/>;
  const data = read.data, members = data.members || [], selected = members.find(member => member.id === player) || members.find(member => member.id === data.viewer) || members[0];
  return <section className="gx-vstack gx-gap-16" aria-label="Community history">
    <h2 className="gx-t-section">Community history</h2>
    <Button variant="ghost" onClick={() => shell.go('play', { section: 'score', season: data.season, week: null })}>Your weekly score</Button>
    <p className="gx-t-body gx-c-2">Saved guesses and their original references. Games the server withholds stay hidden.</p>
    {(data.seasons || []).length > 1 && <label className="gx-vstack gx-gap-8 gx-t-body">Season<select className="gx-input" value={data.season} onChange={event => setSeason(Number(event.target.value))}>{data.seasons.map(value => <option key={value} value={value}>{value}</option>)}</select></label>}
    {selected && <label className="gx-vstack gx-gap-8 gx-t-body">Player<select className="gx-input" value={selected.id} onChange={event => setPlayer(event.target.value)}>{members.map(member => <option key={member.id} value={member.id}>{member.displayName}{member.removed ? ' · Removed' : ''}</option>)}</select></label>}
    <Segmented label="History market" options={Object.entries(MODE).map(([value, label]) => ({ value, label }))} value={mode} onChange={setMode}/>
    {(data.weeks || []).map(week => {
      const entries = (week.entries || []).filter(entry => entry.userId === selected?.id && entry.mode === mode), entry = entries.find(item => item.status === 'sat_out') || entries[0];
      return <Card as="section" key={`${week.season}:${week.week}`} className="gx-vstack gx-gap-12" aria-label={`Week ${week.week} ${MODE[mode]} history`}>
        <h3 className="gx-t-strong">Week {week.week} · {MODE[mode]}</h3>
        <p className="gx-t-body gx-c-2">{!entry ? 'No ballot.' : entry.status === 'sat_out' ? 'Sat out. Recorded as sat out, not zero.' : entry.status === 'draft' ? 'Draft · not submitted' : `Submitted${entry.submittedAt ? ` · ${date(entry.submittedAt)} PT` : ''}${entry.late ? ` · ${lateText(entry.late)}` : ''}`}</p>
        {entry?.submittedAtKnown === false && <p className="gx-t-meta gx-c-2">Original submission time was not recorded; the stored time is shown.</p>}
        {entry?.ruling && <p className="gx-t-meta gx-c-2">Commissioner ruling · {entry.ruling.decision || 'recorded'}</p>}
        {entry?.status === 'submitted' && <p className="gx-t-body">{entry.eligible === false ? 'Not eligible for scoring' : entry.weekScored ? `${show(entry.weekPoints)} pts · ${entry.weekScored} games scored` : 'No scored result yet'}</p>}
        {entry?.picksHidden && !entry.picks && <p className="gx-t-body gx-c-2">Picks hidden until your submission or each game's kickoff.</p>}
        {entry && Array.isArray(entry.picks) && (week.games || []).map(game => {
          const pick = entry.picks.find(item => item.gameId === game.id), hidden = pick?.hidden === true || (entry.picksHidden && !pick), reference = hidden ? null : pick?.reference;
          const result = week.results?.[game.id];
          return <details key={game.id} className="gx-league-history-game">
            <summary className="gx-t-body">{game.awayCode} at {game.homeCode} · {hidden ? 'Hidden' : pickText(mode, game.awayCode, game.homeCode, pick?.guess)}</summary>
            <div className="gx-vstack gx-gap-8"><p className="gx-t-meta gx-c-2">Kickoff {date(game.kickoff)} PT</p>
              <p className="gx-t-body">Guess: {hidden ? 'Hidden' : pickText(mode, game.awayCode, game.homeCode, pick?.guess)}</p>
              <div className="gx-live-workflow gx-league-reference gx-vstack gx-gap-8"><span className="gx-t-body">Line at guess</span>{hidden ? <span className="gx-t-body">Hidden</span> : <HistoryLine reference={reference} mode={mode} game={game}/>}</div>
              <p className="gx-t-body">Points: {hidden ? 'Hidden' : entry.eligible === false ? 'Not scored' : show(pick?.points)}</p>
              {result && <p className="gx-t-meta gx-c-2">{result.status === 'final' ? `Final · ${game.awayCode} ${show(result.away)}, ${game.homeCode} ${show(result.home)}` : result.status}{result.origin === 'commissioner_reported' ? ' · Commissioner-reported final' : result.source ? ` · ${result.source}` : ''}</p>}
            </div>
          </details>;
        })}
        {entry?.updatedAt && <p className="gx-t-meta gx-c-2">Last saved {date(entry.updatedAt)} PT{entry.revisions ? ` · ${entry.revisions} revisions` : ''}</p>}
      </Card>;
    })}
    {!(data.weeks || []).length && <LeagueEmpty text="No history yet." actionLabel="Refresh" onAction={read.retry}/>}
  </section>;
}
