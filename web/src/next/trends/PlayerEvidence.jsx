// The Players layers' shared parts (D-66): the labelled select and a disclosure of the exact contributing games.
import { pickText } from '../../communityFormat.js';
import { Matchup } from '../ui/index.js';
import { number, signed, time } from './charts.jsx';
const mode = market => 'guess_' + market;
export function Select({ label, value, onChange, children }) {
  return <label className="gx-field gx-t-body">{label}<select className="gx-input" value={value} onChange={e => onChange(e.target.value)}>{children}</select></label>;
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
