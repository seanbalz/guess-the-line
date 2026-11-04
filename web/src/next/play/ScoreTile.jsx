// D-69 Play landing (P1B): the Your score tile. It reads the season history Home's score tile reads (the shared
// read, useHomeScoreRead), reports the score moments from each fresh answer, and shows NEW while one waits for the score
// scope. One number: the latest scored week's points for one market (Spread and Total are never summed, D-36).
import { useAppData } from '../data/AppData.jsx';
import { useShell } from '../shell/context.js';
import { useNewCount } from '../moments/MomentsProvider.jsx';
import { SCOPES } from '../moments/catalog.js';
import { PlayTile } from './PlayTile.jsx';
import { modeOf } from './scoring.js';
import { useScoreMoments, useSeasonRanks } from './scoreHooks.js';
import { scoreTile } from './yourScore.js';
import { useHomeScoreRead } from './useHomeScoreRead.js';

/** `onOpen(patch)`: `patch` is `{ season, week, market }` (or `{ market }`), the week the tile shows. */
export function ScoreTile({ onOpen }) {
  const app = useAppData(), shell = useShell();
  const read = useHomeScoreRead(app);
  useScoreMoments(read);
  const fresh = useNewCount(SCOPES.score) > 0;
  const ranks = useSeasonRanks(app);
  const tile = scoreTile({ data: read.data, mode: modeOf(shell.state.views.play.market), ranks, loading: read.loading, error: read.error });
  return <PlayTile label="Your score" icon="chart" big={tile.big} sub={tile.sub} tone={tile.tone} isNew={fresh}
    ariaLabel={fresh ? `${tile.said}, new result` : tile.said} onClick={() => onOpen?.(tile.open)}/>;
}
