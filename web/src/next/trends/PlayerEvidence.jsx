import { playerObservations, buildPlayerTrends, buildSentiment, PLAYER_TREND_WINDOWS, PLAYER_TREND_LABELS } from '../../../../shared/player-trends.mjs';
import { pickText } from '../../communityFormat.js';
import { Avatar, Card, Matchup } from '../ui/index.js';
import { BiasChart, number, signed, time } from './charts.jsx';
const mode = market => 'guess_' + market;
const record = r => r.n ? r.W + ' W · ' + r.L + ' L · ' + r.P + ' P' : 'No decided or pushed games';
const bounds = value => value.from ? value.from.season + ' Week ' + value.from.week + ' through ' + value.to.season + ' Week ' + value.to.week : 'No contributing dates';
export function Select({ label, value, onChange, children }) {
  return <label className="gx-field gx-t-body">{label}<select className="gx-input" value={value} onChange={e => onChange(e.target.value)}>{children}</select></label>;
}
function Outcome({ label, value }) {
  return <div className="gx-vstack gx-gap-4"><h4 className="gx-t-strong">{label}</h4><p className="gx-t-body">{record(value)} · {value.n} games; {value.decided} decisions</p>
    <p className="gx-t-meta">{value.hitRate == null ? 'Hit rate unavailable without decisions' : 'Hit rate ' + number(value.hitRate*100) + '% · Wilson 95% interval ' + number(value.wilson95[0]*100) + '%–' + number(value.wilson95[1]*100) + '%'} · pushes excluded from rate</p></div>;
}
export function EvidenceGames({ games, market, team = null, title = 'Contributing games' }) {
  return <details className="gx-tr-details"><summary className="gx-t-strong">{title} · {games.length}</summary>
    <div className="gx-vstack gx-gap-16">{games.map(row => <article key={row.key} className="gx-tr-game gx-vstack gx-gap-8">
      <h4 className="gx-t-strong">{row.season} Week {row.week} · <Matchup away={row.game.awayCode} home={row.game.homeCode}/></h4>
      <p className="gx-t-meta">Kickoff {time(row.game.kickoff)}</p>
      <dl className="gx-tr-facts">
        <dt>Guess</dt><dd>{pickText(mode(market), row.game.awayCode, row.game.homeCode, row.guess)}</dd>
        <dt>Saved reference</dt><dd>{pickText(mode(market), row.game.awayCode, row.game.homeCode, row.reference.value)}</dd>
        <dt>Signed gap</dt><dd>{signed(row.strengthGap)} · {row.direction}</dd>
        <dt>Absolute market error</dt><dd>{number(row.absoluteMarketError)}</dd>
        <dt>Official points</dt><dd>{number(row.points)}</dd>
        <dt>At saved reference</dt><dd>{row.marketResult || 'Pending / no direction'}</dd>
        <dt>At guessed line</dt><dd>{row.guessedResult || 'Pending / no direction'}</dd>
        {market === 'spread' && <><dt>Straight-up implied team</dt><dd>{row.straightUpResult || 'Pending / no direction'}</dd><dt>{team || row.game.homeCode} at saved reference / guess</dt><dd>{row.teamMarketResult || '—'} / {row.teamGuessedResult || '—'}</dd><dt>{team || row.game.homeCode} straight-up</dt><dd>{row.teamStraightUpResult || 'Pending'}</dd></>}
        <dt>Absolute final-result error</dt><dd>{number(row.absoluteRealizedError)}</dd>
      </dl>
      {row.result?.status === 'final' ? <p className="gx-t-body">Final: {row.game.awayCode} {row.result.away}, {row.game.homeCode} {row.result.home} · {row.result.source || row.result.origin || 'Result source unavailable'}</p> : <p className="gx-t-body">Result pending</p>}
      <p className="gx-t-meta">{row.reference.source || 'Reference source unavailable'} · {row.reference.basis} · {time(row.sourceTime)}</p>
    </article>)}</div>
  </details>;
}
export function PlayerEvidence({ history, published, view, onChange, scopeName }) {
  const market = view.market === 'total' ? 'total' : 'spread', members = history.members || [];
  const player = members.find(m => m.id === view.player) || members.find(m => m.id === history.viewer) || members[0];
  const window = PLAYER_TREND_WINDOWS.some(w => w.id === view.window) ? view.window : 'season';
  const observations = playerObservations(history, market);
  const teams = [...new Set(observations.flatMap(r => [r.game.awayCode, r.game.homeCode]))].sort();
  const team = teams.includes(view.team) ? view.team : '';
  const matchups = [...new Map(observations.map(row => [row.game.id, row.game])).values()];
  const matchup = matchups.some(g => g.id === view.playerMatchup) ? view.playerMatchup : '';
  const result = buildPlayerTrends({ observations: matchup ? observations.filter(row => row.game.id === matchup) : observations, playerId: player?.id, market, team, window, season: published.season, week: published.week });
  const bias = market === 'total' ? PLAYER_TREND_LABELS.totalBias : team ? team + ' strength gap' : PLAYER_TREND_LABELS.spreadBias;
  return <section className="gx-vstack gx-gap-16" aria-label="Player trends">
    <p className="gx-t-body gx-c-2">{scopeName} · {history.requestedSeasons?.join(', ') || history.season} history. Each observation keeps its original competition week.</p>
    <div className="gx-tr-filters">
      <Select label="Player" value={player?.id || ''} onChange={player => onChange({ player })}>{members.map(m => <option key={m.id} value={m.id}>{m.displayName}{m.removed ? ' · former member' : ''}</option>)}</Select>
      <Select label="Player team" value={team} onChange={team => onChange({ team })}><option value="">All teams</option>{teams.map(t => <option key={t}>{t}</option>)}</Select>
      <Select label="Player matchup" value={matchup} onChange={playerMatchup => onChange({ playerMatchup })}><option value="">All matchups</option>{matchups.map(g => <option key={g.id} value={g.id}>{g.awayCode} at {g.homeCode}</option>)}</Select>
      <Select label="History window" value={window} onChange={window => onChange({ window })}>{PLAYER_TREND_WINDOWS.map(w => <option key={w.id} value={w.id}>{w.label}</option>)}</Select>
    </div>
    {player && <div className="gx-tr-person"><Avatar id={player.id} name={player.displayName} size={32}/><h2 className="gx-t-section">{player.displayName}</h2></div>}
    <p className="gx-t-meta">{PLAYER_TREND_LABELS.limitation} Positive gap means {market === 'total' ? 'Over' : team ? 'stronger for ' + team : 'stronger for the home team'} relative to the saved reference. It is not a latest-market comparison.</p>
    {!result.sample ? <p className="gx-t-body" role="status">No eligible locked guesses in this window. Try another player, team or window.</p> : <>
      <Card className="gx-vstack gx-gap-12"><h3 className="gx-t-section">Market accuracy</h3><p className="gx-t-meta">{bounds(result)} · {result.sample} eligible games · {result.pending} pending results</p>
        <dl className="gx-tr-facts"><dt>{bias}</dt><dd>{signed(result.metrics.meanSignedBias)}</dd>
          <dt>{PLAYER_TREND_LABELS.marketError}</dt><dd>{number(result.metrics.meanAbsoluteMarketError)}</dd>
          <dt>Mean official points</dt><dd>{number(result.metrics.meanPoints)}</dd></dl>
        <p className="gx-t-meta">Official points use each saved reference, including eligible games with pending results. Official standings are separate.</p>
      </Card>
      <details className="gx-tr-details"><summary className="gx-t-strong">Outcome records · separate from market accuracy</summary><div className="gx-vstack gx-gap-16">
        <p className="gx-t-meta">{result.finalized} final results · final-result absolute error {number(result.metrics.meanAbsoluteRealizedError)} across {result.metrics.realizedSample} games</p>
        <Outcome label="At saved reference · each guess's implied side" value={result.record}/>
        <Outcome label="Opposing each implied side at saved reference" value={result.againstRecord}/>
        <Outcome label="At guessed line · each guess's implied side" value={result.guessedRecord}/>
        {market === 'spread' && <p className="gx-t-body">Straight-up: {result.straightUpRecord.W} W · {result.straightUpRecord.L} L · {result.straightUpRecord.T} T. Ties are distinct from spread pushes.</p>}
        <p className="gx-t-meta">Mixed directions do not mean always backing one team. Hypothetical outcomes, not recorded wagers or profit.</p>
      </div></details>
      <BiasChart title={bias + ' by competition week'} rows={result.weekly.map(w => ({ label: w.season + ' Week ' + w.week, value: w.metrics.meanSignedBias, sample: w.sample }))}/>
      <BiasChart title="Market absolute error by competition week" signedValues={false} rows={result.weekly.map(w => ({ label: w.season + ' Week ' + w.week, value: w.metrics.meanAbsoluteMarketError, sample: w.sample }))}/>
      <BiasChart title="Cover performance by competition week" signedValues={false} unit="percent" rows={result.weekly.map(w => ({ label: w.season + ' Week ' + w.week, value: w.record.hitRate === null ? null : w.record.hitRate*100, sample: w.record.n, decided: w.record.decided, pushes: w.record.P }))}/>
      <p className="gx-t-meta">Implied side at its own saved reference · decisions only in hit rate; pushes listed separately. No decisions means no plotted value. Hypothetical outcomes.</p>
      <EvidenceGames games={result.games} market={market} team={team}/>
      <details className="gx-tr-details"><summary className="gx-t-strong">Compare history windows</summary><div className="gx-vstack gx-gap-16">{Object.values(result.windows).map(w => <section key={w.id} className="gx-vstack gx-gap-8"><h3 className="gx-t-section">{w.label}</h3><p className="gx-t-meta">{bounds(w)} · {w.sample} games · market error {number(w.metrics.meanAbsoluteMarketError)} · signed gap {signed(w.metrics.meanSignedBias)}</p><Outcome label="Implied side at saved reference" value={w.record}/><EvidenceGames games={w.games} market={market} team={team}/></section>)}</div></details>
      <section className="gx-vstack gx-gap-12" aria-label="Directional history"><h3 className="gx-t-section">Directional history</h3>{result.callouts.map(c => <Card key={c.team + c.direction} className="gx-vstack gx-gap-8">
        <h4 className="gx-t-strong">{c.status === 'recurring' ? 'Recurring pattern' : 'Small sample'} · {c.team} · {c.direction}</h4>
        <p className="gx-t-body">{c.text}</p><p className="gx-t-meta">{bounds(c)} · {c.sample} directional finals · {c.competitionWeeks} competition weeks. Recurring requires five decisions across three weeks; it is descriptive.</p>
        <details className="gx-tr-details"><summary className="gx-t-strong">Inspect this direction</summary><div className="gx-vstack gx-gap-12">
          <Outcome label="At saved reference" value={c.record}/><Outcome label="Opposing this direction" value={c.againstRecord}/>
          <p className="gx-t-meta">{c.conflictingWindows ? 'Recent and earlier results conflict.' : 'Recent and earlier samples are shown separately.'} Recent is the last five eligible team games before direction filtering; earlier does not overlap.</p>
          <EvidenceGames games={c.games} market={market} team={c.team}/><EvidenceGames games={c.recent.games} market={market} team={c.team} title="Recent contributing games"/><EvidenceGames games={c.earlier.games} market={market} team={c.team} title="Earlier contributing games"/>
        </div></details>
        {c.current.length > 0 && <details className="gx-tr-details"><summary className="gx-t-strong">Current-week saved-reference context · same direction</summary><p className="gx-t-meta">Unresolved, permitted locked guesses only. Guess, immutable reference, signed gap and source time; not a current sportsbook line.</p><EvidenceGames games={c.current} market={market} team={c.team} title="Current context"/></details>}
      </Card>)}</section>
    </>}
    <Sentiment history={history} market={market} published={published}/>
  </section>;
}
function Sentiment({ history, market, published }) {
  const value = buildSentiment({ history, market, season: published.season, week: published.week });
  return <section className="gx-vstack gx-gap-12" aria-label="GTL sentiment"><h3 className="gx-t-section">GTL sentiment</h3>
    <p className="gx-t-body gx-c-2">{value.referenceNote} GTL guesses are not sportsbook ticket or money splits.</p>
    {!value.games.length ? <p className="gx-t-body">No permitted current-week observations to show.</p> : value.games.map(row => <details key={row.game.id} className="gx-tr-details"><summary className="gx-t-strong"><Matchup away={row.game.awayCode} home={row.game.homeCode}/> · {row.count} permitted guesses</summary><p className="gx-t-body">Median GTL {market === 'spread' ? 'spread guess' : 'total guess'} {pickText(mode(market),row.game.awayCode,row.game.homeCode,row.median)}</p>
      <p className="gx-t-meta">Numeric guess versus each saved reference: {row.savedReferenceCounts.above} above · {row.savedReferenceCounts.equal} equal · {row.savedReferenceCounts.below} below. Spread numeric above is not team strength.</p>
      <p className="gx-t-meta">Source times: {row.sourceTimes.known} known · {row.sourceTimes.missing} unavailable · {time(row.sourceTimes.from)} through {time(row.sourceTimes.to)}</p>
      {market === 'spread' && <p className="gx-t-meta">Distribution uses signed home spreads: negative favors {row.game.homeCode}; positive favors {row.game.awayCode}.</p>}
      <BiasChart title={row.game.awayCode + ' at ' + row.game.homeCode + (market === 'spread' ? ' signed home spread distribution' : ' GTL total distribution')} rows={row.guesses.map((r,i) => ({ label: (history.members.find(m => m.id === r.userId)?.displayName || 'Member') + ' · ' + (i+1), value: r.guess, sample: 1 }))}/>
    </details>)}
  </section>;
}
