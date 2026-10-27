// Week progress (design upgrade, item 2): the top of Play's guesses. "5 of 14 locked" with the kit Meter, then a strip
// with one tile per game in kickoff order (locked, draft, open, kicked off; sat out and not open when they apply),
// each tile with its own icon and fill so no state is color alone, a legend that says each count in words, and one
// button to the next game still to lock. It draws what the editor passes; the server's locks decide every state.
import { CalendarClock, Circle, Clock, Lock, Minus, Pencil } from 'lucide-react';
import { Button, Card, Icon, Meter, cx } from '../ui/index.js';
import { progressLegend } from './moments.js';

export const STATE_ICONS = Object.freeze({ locked: Lock, draft: Pencil, open: Circle, kicked: Clock, skipped: Minus, notopen: CalendarClock });

/** `progress` is weekProgress(); `market` is "Spread" or "Total"; `onNext(gameId)` moves to that game's card. */
export function WeekProgress({ progress, market, week, onNext }) {
  if (!progress.total) return null;
  const legend = progressLegend(progress), next = progress.next;
  return <Card as="section" className="gx-play-progress" aria-label={`Week ${week} ${market} progress`} data-play="progress">
    <div className="gx-play-progress-head">
      <p className="gx-play-progress-count"><span className="gx-n-l">{progress.locked}</span><span className="gx-t-body"> of {progress.total} locked</span></p>
      <span className="gx-t-label gx-c-2">{market}</span>
    </div>
    <Meter value={progress.locked} max={progress.total}/>
    {/* The tiles are a picture of the legend below (hidden from assistive technology); each card also says its state. */}
    <ol className="gx-play-states" aria-hidden="true">
      {progress.games.map(row => <li key={row.id} className={cx('gx-play-state', `gx-play-state--${row.state}`)} data-state={row.state}><Icon icon={STATE_ICONS[row.state]} size={12}/></li>)}
    </ol>
    <ul className="gx-play-legend" aria-label="Games by state">
      {legend.map(item => <li key={item.state} className={cx('gx-play-legend-item', `gx-play-legend-item--${item.state}`)}><Icon icon={STATE_ICONS[item.state]} size={16}/><span className="gx-n-xs">{item.count}</span><span className="gx-t-meta">{item.word}</span></li>)}
    </ul>
    {next ? <Button variant="ghost" iconEnd="chevronRight" className="gx-play-next" onClick={() => onNext?.(next.id)}>Next to lock · {next.game.awayCode} at {next.game.homeCode}</Button>
      : <p className="gx-t-meta gx-c-2">{progress.locked === progress.total ? 'Every game is locked in.' : 'Nothing left to lock this week.'}</p>}
  </Card>;
}
