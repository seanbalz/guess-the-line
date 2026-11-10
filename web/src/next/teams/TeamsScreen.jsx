// Research › Teams (D-69 step 3): every team as a picture row (its mark, its name, the next game, the record over the
// last result) and one team as its own layer. The list stays mounted under the layer (KeptParent). Records come from
// the shared team read (teamsData.js), the bundled file standing in until it answers, so the list never waits.
import { useId, useState } from 'react';
import { researchLayerOf } from '../shell/state.js';
import { useShell } from '../shell/context.js';
import { KeptParent, MetaLine, PictureRow, TeamMark, useEntrance } from '../ui/index.js';
import { RESEARCH_NAMES, closeTeam, openTeam, teamRowId } from '../research/researchNav.js';
import { TeamLayer } from './TeamLayer.jsx';
import { teamRows, throughText, nextGame, lastFive, teamOf } from './teamModel.js';
import { TeamForm } from './TeamForm.jsx';
import { useTeamSeason } from './teamsData.js';
import './teams.css';

export function TeamsScreen() {
  const shell = useShell(), enter = useEntrance();
  const { status, data } = useTeamSeason();
  const [query, setQuery] = useState(''), searchId = useId();
  const rows = teamRows(data), shown = rows.filter(row => `${row.name} ${row.code}`.toLowerCase().includes(query.trim().toLowerCase()));
  const open = researchLayerOf('teams', shell.state.views.research);
  const layer = open ? <TeamLayer code={open.item} status={status} season={data} onClose={() => closeTeam(shell)}/> : null;
  return <KeptParent layer={layer}>
    <div className="gx-screen" data-research="teams">
      <div className="gx-vstack gx-gap-2"><h1 className="gx-t-title">{RESEARCH_NAMES.teams}</h1><MetaLine parts={[throughText(data)]}/></div>
      <div className="gx-team-search"><label htmlFor={searchId}>Find a team</label><input id={searchId} type="search" placeholder="Search all teams" value={query} onChange={event => setQuery(event.target.value)}/></div>
      <p className="gx-t-meta gx-c-2" role="status">{shown.length} of {rows.length} teams</p>
      <ol className="gx-prows gx-stagger" data-enter={enter} aria-label={RESEARCH_NAMES.teams}>
        {shown.map(row => {
          const team = teamOf(data, row.code), next = nextGame(team);
          const form = lastFive(team), ariaLabel = form.length ? `${row.ariaLabel}. Last ${form.length} completed games, oldest first: ${form.map(item => item.words).join('; ')}` : row.ariaLabel;
          return <li key={row.code}><PictureRow className="gx-card" id={teamRowId(row.code)} data-team={row.code}
            picture={<TeamMark code={row.code} name={row.name} size={32} decorative/>} title={row.name}
            meta={<span className="gx-team-list-meta">{next ? <span className="gx-team-next">Next {next.home ? 'vs' : 'at'} <TeamMark code={next.opponent} size={24} decorative/><span>{next.opponent}</span></span> : row.meta}<TeamForm items={form} name={row.name}/></span>}
            value={row.record} word={row.word} tone={row.tone} ariaLabel={ariaLabel} onClick={() => openTeam(shell, row.code)}/></li>;
        })}
      </ol>
      {!shown.length ? <p className="gx-t-body gx-c-2">No teams match this search. Try another name.</p> : null}
    </div>
  </KeptParent>;
}
