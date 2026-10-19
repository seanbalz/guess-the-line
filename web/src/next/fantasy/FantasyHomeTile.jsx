import { FANTASY_INITIAL, useFantasySnapshot } from '../../fantasyData.js';
import { buildRankings } from '../../../../shared/fantasy-rankings.mjs';
import { useShell } from '../shell/context.js';
import { Button, Card } from '../ui/index.js';
import { fmtFull } from '../format.js';
export function FantasyHomeTile() {
  const shell = useShell(), read = useFantasySnapshot(FANTASY_INITIAL);
  const rankings = read.snapshot ? buildRankings(read.snapshot,{ trendsOnly: true }) : null;
  const player = rankings?.rows?.[0];
  return <Card as="section" className="gx-vstack gx-gap-12" aria-label="Fantasy preview"><h2 className="gx-t-section">Fantasy football</h2>
    <p className="gx-t-body">Explore player usage, rankings and pace projections. Fantasy stays separate from Guess points and wager projections.</p>
    {read.snapshot ? <><p className="gx-t-meta">Week {read.snapshot.week} · {read.snapshot.season} snapshot · as of {fmtFull(read.snapshot.asOf)}</p>{player && <p className="gx-t-body">{player.name} · {player.team} · {player.trendHighlights[0]?.label}</p>}<p className="gx-t-meta gx-c-2">Static snapshot; pace estimates, not expert projections. No automatic refresh.</p></> : <p className="gx-t-body" role="status">{read.status === 'loading' ? 'Loading public Fantasy snapshot…' : 'Fantasy snapshot unavailable.'}</p>}
    {read.status === 'error' && <Button onClick={read.retry}>Retry Fantasy preview</Button>}<Button onClick={() => shell.go('fantasy')}>Explore Fantasy</Button>
  </Card>;
}
