// The Play landing's Guess the Points tile (D-69 step 1, Sean's P1B of November 3, 2026): "2 / 5" slots locked, then the
// next lock time, "All locked" or "slots guessed". It reads the week as the landing always has (usePointsRead, the one
// /points/read), reports the Points moments from that read (an exact guess waits as NEW here and plays when the ballot
// opens), and keeps "Points is coming soon" while the read answers 404 (P-01 not hosted).
import { useAppData } from '../../data/AppData.jsx';
import { useNewCount } from '../../moments/MomentsProvider.jsx';
import { SCOPES } from '../../moments/catalog.js';
import { PlayTile } from '../PlayTile.jsx';
import { pointsTile } from './pointsModel.js';
import { usePointsMoments, usePointsRead } from './PointsBallot.jsx';
import { Button, NewPill } from '../../ui/index.js';

/** `ref` reaches the tile's button: the landing returns focus there when the reminder prompt under it leaves. */
export function PointsTile({ ref, onOpen, compact = false }) {
  const app = useAppData();
  return <PointsTileView ref={ref} read={usePointsRead(app)} onOpen={onOpen} compact={compact}/>;
}

/** One read state of the tile (tests render each one). */
export function PointsTileView({ ref, read, onOpen, compact = false }) {
  usePointsMoments(read);
  const isNew = useNewCount(SCOPES.points) > 0;
  const tile = pointsTile(read.data, read.error);
  if (compact) return <Button ref={ref} data-overview-points aria-label={isNew ? `${tile.label}, new result` : tile.label} title={tile.label} onClick={onOpen}>Points{isNew ? <NewPill/> : null}</Button>;
  return <PlayTile ref={ref} label="Guess the Points" icon="people" big={tile.big} sub={tile.sub} tone={tile.tone} isNew={isNew}
    ariaLabel={isNew ? `${tile.label}, new result` : tile.label} onClick={onOpen}/>;
}
