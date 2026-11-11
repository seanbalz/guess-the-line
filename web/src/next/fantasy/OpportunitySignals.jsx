// Opportunity signals in the new app (shared/fantasy-signals.mjs): a section in the usage profile and the Buy / Sell
// board layer under Research › Fantasy. Everything comes from the loaded public snapshot's recorded games, in the
// viewer's scoring. A signal is always written out in words; tone only repeats it.
import { useMemo, useState } from 'react';
import { formatFantasyNumber as number } from '../../../../shared/fantasy-rankings.mjs';
import { SIGNALS, SIGNAL_SETTINGS, signalBoard, snapshotSignals } from '../../../../shared/fantasy-signals.mjs';
import { Card, Pill, Segmented } from '../ui/index.js';
import './fantasyTools.css';

const TONES = { buy: 'win', sell: 'loss', hold: 'neutral', insufficient: 'pending' };
const POSITIONS = [{ value: 'ALL', label: 'All' }, { value: 'QB', label: 'QB' }, { value: 'RB', label: 'RB' }, { value: 'WR', label: 'WR' }, { value: 'TE', label: 'TE' }];
const signed = value => (number(value) === '—' ? '—' : `${value > 0 ? '+' : value < 0 ? '−' : ''}${number(Math.abs(value))}`);
const pct = value => (Number.isFinite(value) ? `${Math.round(value)}` : '—');
export const SIGNAL_NOTE = `Expected points are each recorded game's targets, carries and passing attempts times the position's league rate per opportunity, in this scoring. Role and production are percentiles within the position among players with at least ${SIGNAL_SETTINGS.minGames} recorded games; a gap of ${SIGNAL_SETTINGS.gap} or more reads Buy or Sell. No air yards, red-zone, injury or depth-chart input. Descriptive, not a projection.`;
export const SIGNAL_EVIDENCE = 'Checked on 2024 and 2025 (weeks 3–15, Full PPR, next three weeks): Buy players scored 2.6 more points per game than before, Hold 0.4 more, and Sell players 1.8 fewer.';

export function SignalPill({ signal }) {
  return <Pill tone={TONES[signal] ?? 'neutral'}>{SIGNALS[signal]?.label ?? SIGNALS.insufficient.label}</Pill>;
}

/** The profile section: this player's read, expected and actual points per game, and the two percentiles. */
export function OpportunitySignalSection({ snapshot, playerId, settings }) {
  const signals = useMemo(() => snapshotSignals(snapshot, settings), [snapshot, settings.scoring, settings.passingTds]);
  const read = signals.get(playerId);
  if (!read) return null;
  return <section className="gx-vstack gx-gap-8" aria-labelledby={`${playerId}-signal`}>
    <h3 className="gx-t-section" id={`${playerId}-signal`}>Opportunity signal</h3>
    <p className="gx-t-body"><SignalPill signal={read.signal}/> {SIGNALS[read.signal].description}</p>
    {read.games > 0 && <dl className="gx-fantasy-facts">
      <div><dt>Expected / game</dt><dd>{number(read.expected)}</dd><dd className="gx-fantasy-n">from usage</dd></div>
      <div><dt>Actual / game</dt><dd>{number(read.actual)}</dd><dd className="gx-fantasy-n">{read.games} {read.games === 1 ? 'game' : 'games'}</dd></div>
      <div><dt>Over expected</dt><dd>{signed(read.overExpected)}</dd><dd className="gx-fantasy-n">per game</dd></div>
      <div><dt>Role / production</dt><dd>{pct(read.rolePercentile)} / {pct(read.productionPercentile)}</dd><dd className="gx-fantasy-n">{read.position} percentile</dd></div>
    </dl>}
    <p className="gx-t-meta">{SIGNAL_NOTE}</p>
  </section>;
}

function BoardTable({ title, rows, onProfile }) {
  return <section className="gx-vstack gx-gap-8" aria-label={title}>
    <h3 className="gx-t-section">{title}</h3>
    {rows.length ? <div className="gx-fantasy-table-wrap" role="region" aria-label={`${title} data`} tabIndex={0}><table className="gx-fantasy-table">
      <caption className="gx-sr-only">{title}: expected and actual points per game, and the role minus production percentile gap</caption>
      <thead><tr><th scope="col">Player</th><th scope="col"><abbr title="Expected points per game">Exp</abbr></th><th scope="col"><abbr title="Actual points per game">Act</abbr></th><th scope="col">Gap</th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.player.id}>
        <th scope="row"><button type="button" className="gx-fantasy-chosen-name" data-player={row.player.id} onClick={() => onProfile(row.player.id)}>{row.player.name} <span className="gx-t-meta">{row.player.team} {row.player.position}</span><span className="gx-sr-only">, usage and production</span></button></th>
        <td>{number(row.expected)}</td><td>{number(row.actual)}</td><td className="gx-fantasy-pts">{signed(row.gap)}</td>
      </tr>)}</tbody>
    </table></div> : <p className="gx-t-body">None at this position.</p>}
  </section>;
}

/** The board layer: Buy and Sell lists for one position, strongest first. */
export function SignalBoard({ snapshot, settings, scoringLabel, onProfile }) {
  const [position, setPosition] = useState('ALL');
  const signals = useMemo(() => snapshotSignals(snapshot, settings), [snapshot, settings.scoring, settings.passingTds]);
  const board = signalBoard(snapshot, signals, { position, limit: 12 });
  return <Card as="section" className="gx-vstack gx-gap-12" aria-labelledby="gx-fantasy-signals-title">
    <h2 className="gx-t-section" id="gx-fantasy-signals-title">Buy / sell signals</h2>
    <p className="gx-t-meta" role="status">{scoringLabel} · {settings.passingTds}-point passing TDs · Stats through Week {snapshot.statsThroughWeek} · {board.qualified} qualified players</p>
    <Segmented label="Signal position" className="gx-fantasy-signal-seg" options={POSITIONS} value={position} onChange={setPosition}/>
    <BoardTable title="Buy: role ahead of production" rows={board.buy} onProfile={onProfile}/>
    <BoardTable title="Sell: production ahead of role" rows={board.sell} onProfile={onProfile}/>
    <p className="gx-t-meta">{SIGNAL_NOTE}</p>
    <p className="gx-t-meta">{SIGNAL_EVIDENCE}</p>
  </Card>;
}

/** The tile count on the Fantasy card: how many Buy and Sell reads this snapshot has under the viewer's scoring. */
export function signalCounts(snapshot, settings) {
  let buy = 0, sell = 0;
  for (const read of snapshotSignals(snapshot, settings).values()) { if (read.signal === 'buy') buy++; else if (read.signal === 'sell') sell++; }
  return { buy, sell };
}
