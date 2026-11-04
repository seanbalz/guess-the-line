// Research › Teams (D-69 step 3): every team as a picture row (its mark, its name, the next game, the record over the
// last result) and one team as its own layer. The list stays mounted under the layer (KeptParent). Records come from
// the shared team read (teamsData.js), the bundled file standing in until it answers, so the list never waits.
import { researchLayerOf } from '../shell/state.js';
import { useShell } from '../shell/context.js';
import { KeptParent, MetaLine, PictureRow, TeamMark, useEntrance } from '../ui/index.js';
import { RESEARCH_NAMES, closeTeam, openTeam, teamRowId } from '../research/researchNav.js';
import { TeamLayer } from './TeamLayer.jsx';
import { teamRows, throughText } from './teamModel.js';
import { useTeamSeason } from './teamsData.js';
import './teams.css';

export function TeamsScreen() {
  const shell = useShell(), enter = useEntrance();
  const { status, data } = useTeamSeason();
  const open = researchLayerOf('teams', shell.state.views.research);
  const layer = open ? <TeamLayer code={open.item} status={status} season={data} onClose={() => closeTeam(shell)}/> : null;
  return <KeptParent layer={layer}>
    <div className="gx-screen" data-research="teams">
      <div className="gx-vstack gx-gap-2"><h1 className="gx-t-title">{RESEARCH_NAMES.teams}</h1><MetaLine parts={[throughText(data)]}/></div>
      <ol className="gx-prows gx-stagger" data-enter={enter} aria-label={RESEARCH_NAMES.teams}>
        {teamRows(data).map(row => <li key={row.code}><PictureRow id={teamRowId(row.code)} data-team={row.code}
          picture={<TeamMark code={row.code} name={row.name} size={32} decorative/>} title={row.name} meta={row.meta}
          value={row.record} word={row.word} tone={row.tone} ariaLabel={row.ariaLabel} onClick={() => openTeam(shell, row.code)}/></li>)}
      </ol>
    </div>
  </KeptParent>;
}
