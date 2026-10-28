import { useShell } from '../shell/context.js';
import { Button } from '../ui/index.js';
import { ResearchCards, researchSelection } from './ResearchCards.jsx';
import { useResearch } from './useResearch.js';
import './research.css';

/**
 * The game sheet's trends: the weekly `trends` always stay; this game's research joins below them only when the read
 * has candidates for it (closed, so the weekly trend stays the one opened chart, D-55). Loading, a failed read or an
 * empty answer adds nothing; the full research sheet keeps its own status and empty-state lines.
 */
export function MatchupResearch({ lines, gameId, trends }) {
  const shell = useShell(), request = { ...lines, gameId };
  const read = useResearch(request);
  return <div className="gx-vstack gx-gap-12" data-research={read.status}>
    {trends}
    {researchSelection(read.data).length ? <div className="gx-vstack gx-gap-8"><p className="gx-t-label gx-c-2">Matchup research</p>
      <ResearchCards data={read.data} limit={3} request={request} gameId={gameId} openFirst={false}/></div> : null}
    <Button variant="secondary" onClick={() => shell.openSheet('sh.research', { game: gameId })}>Open matchup research</Button>
  </div>;
}
