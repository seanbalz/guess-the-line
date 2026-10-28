import { Fragment } from 'react';
import { Icon } from '../ui/Icon.jsx';
import { Matchup } from '../ui/Matchup.jsx';
import { Pill } from '../ui/Pill.jsx';
import './tracked-bets.css';

const amount = (value, net) => Number.isFinite(value)
  ? `${net && value > 0 ? '+' : ''}${Number(value.toFixed(3)).toLocaleString('en-US').replace('-', '−')}u`
  : 'Unknown';

// The owner's compact list discloses the existing audited card. Other players'
// gated cards still use the server-controlled full presentation.
export function TrackedBetRow({ entry, games, children }) {
  const leg = entry.legs[0], game = games.find(item => item.id === leg?.gameId);
  const source = typeof entry.source === 'string' ? entry.source : entry.source?.name;
  const pending = entry.outcome === 'pending';
  const status = { pending: 'Pending', win: 'Won', loss: 'Lost', push: 'Push', void: 'Void' }[entry.outcome] || 'Pending';
  const tone = ['win', 'loss', 'pending'].includes(entry.outcome) ? entry.outcome : 'neutral';
  const title = entry.kind === 'parlay' ? `${entry.legs.length}-leg parlay` : leg?.selection || 'Tracked selection';
  // D-62: each game as marks (away, "@", home); a leg whose game is not in this week's list keeps its id as text.
  const legGames = entry.kind === 'parlay' ? entry.legs.map(item => games.find(match => match.id === item.gameId)).filter(Boolean) : game ? [game] : [];
  const matchup = legGames.length
    ? legGames.map((item, index) => <Fragment key={`${item.id}:${index}`}>{index ? ' · ' : null}<Matchup away={item.away} home={item.home}/></Fragment>)
    : entry.kind === 'parlay' ? null : leg?.gameId;
  return <details className="gx-tracked-row">
    <summary>
      <span className="gx-tracked-mark"><Icon icon="ticket" size={20}/></span>
      <span className="gx-tracked-selection">
        <strong>{title}</strong>
        <span>{matchup}</span>
        <small>{source || 'Book unknown'} · Week {entry.week}{entry.countsForRecord === false ? ' · Excluded' : ''}</small>
      </span>
      <span className="gx-tracked-result">
        <Pill tone={tone}>{status}</Pill>
        <strong className={!pending && entry.netUnits > 0 ? 'gx-c-win' : !pending && entry.netUnits < 0 ? 'gx-c-loss' : undefined}>{amount(pending ? entry.stakeUnits : entry.netUnits, !pending)}</strong>
        <small>{pending ? 'Risked' : 'Net units'}</small>
      </span>
      <Icon icon="chevronDown" size={16} className="gx-tracked-chevron"/>
    </summary>
    <div className="gx-tracked-detail">{children}</div>
  </details>;
}
