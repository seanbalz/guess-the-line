// D-69 Play landing (P1B): the Your score tile. It reads the season history Home's score tile reads (the shared
// read, useHomeScoreRead), reports the score moments from each fresh answer, and shows NEW while one waits for the score
// scope, or while a Community rank move waits on the Your score card of the market this tile opens (scoreScope, D-69
// step 2: rank moves play on Your score's season rank chip). One number: the latest scored week's points for one market
// (Spread and Total are never summed, D-36).
import { useAppData } from '../data/AppData.jsx';
import { useShell } from '../shell/context.js';
import { useNewCount } from '../moments/MomentsProvider.jsx';
import { SCOPES, scoreScope } from '../moments/catalog.js';
import { PlayTile } from './PlayTile.jsx';
import { modeOf } from './scoring.js';
import { useScoreMoments, useSeasonRanks } from './scoreHooks.js';
import { scoreTile } from './yourScore.js';
import { useHomeScoreRead } from './useHomeScoreRead.js';
import { Button, Card, Pill } from '../ui/index.js';
import { ownEntry, number } from './scoring.js';
import { MiniArea } from '../charts/TrendRow.jsx';
import { show } from '../../communityFormat.js';

/** `onOpen(patch)`: `patch` is `{ season, week, market }` (or `{ market }`), the week the tile shows. */
export function ScoreTile({ onOpen, expanded = false }) {
  const app = useAppData(), shell = useShell();
  const read = useHomeScoreRead(app);
  useScoreMoments(read);
  const ranks = useSeasonRanks(app);
  const tile = scoreTile({ data: read.data, mode: modeOf(shell.state.views.play.market), ranks, loading: read.loading, error: read.error });
  // The tile opens Your score on `tile.open.market` (its own market, or the other one when only that one has scored).
  const fresh = useNewCount(SCOPES.score) + useNewCount(scoreScope(modeOf(tile.open.market))) > 0;
  if (expanded) {
    const mode = modeOf(tile.open.market);
    const weeks = (read.data?.weeks || []).slice().sort((a, b) => a.week - b.week).map(week => {
      const entry = ownEntry(week, read.data.viewer, mode);
      return { week: week.week, points: entry?.eligible !== false ? number(entry?.weekPoints) : null };
    });
    const scored = weeks.filter(week => week.points !== null);
    const total = scored.length ? scored.reduce((sum, week) => sum + week.points, 0) : null;
    let running = 0;
    const cumulative = weeks.map(week => week.points === null ? null : (running += week.points));
    return <Card as="section" className="gx-play-score-card gx-vstack gx-gap-16" aria-label="Your score">
      <div className="gx-play-score-heading"><h2 className="gx-t-section">Your score</h2>{fresh ? <Pill tone="accent">New result</Pill> : null}</div>
      <p className="gx-n-xl gx-c-accent">{total === null ? '—' : show(total)}</p>
      <p className="gx-t-meta gx-c-2">{read.loading && !read.data ? 'Loading your scores…' : read.error && !read.data ? 'Your score could not load. Open to retry.' : `Personal season accuracy points · ${mode === 'guess_total' ? 'Total' : 'Spread'}`}</p>
      {cumulative.length >= 2 && cumulative.every(value => value !== null) ? <div className="gx-play-score-chart" role="img" aria-label={weeks.map((week, index) => `Week ${week.week}: ${show(cumulative[index])} cumulative personal points`).join(', ')}><MiniArea values={cumulative}/><span className="gx-t-meta gx-c-2">Week {weeks[0].week}<span>Week {weeks.at(-1).week}</span></span></div> : scored.length ? <p className="gx-t-meta gx-c-2">{scored.map(week => `Week ${week.week}: ${show(week.points)} points`).join(' · ')}{scored.length < weeks.length ? ' · Unscored weeks have no value.' : ''}</p> : !read.loading && !read.error ? <p className="gx-t-meta gx-c-2">No scored games yet.</p> : null}
      {read.error && read.data ? <p className="gx-t-meta gx-c-2" role="status">Your score could not refresh. Showing the last loaded copy.</p> : null}
      <Button iconEnd="chevronRight" onClick={() => onOpen?.({ ...tile.open, market: mode })}>Open score &amp; history</Button>
    </Card>;
  }
  return <PlayTile label="Your score" icon="chart" big={tile.big} sub={tile.sub} tone={tile.tone} isNew={fresh}
    ariaLabel={fresh ? `${tile.said}, new result` : tile.said} onClick={() => onOpen?.(tile.open)}/>;
}
