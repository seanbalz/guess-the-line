// D-69 step 3 (spec 6, "the Team sheet becomes a layer, with the mark, record and margin chart"): Research › Teams › one
// team as a nesting card under the Teams lip, with its own address (`#research/teams?layer=team&item=SEA`). Its body is
// the team sheet's view (TeamViewSlot: the lazy TeamView chunk, its retry). Play's pick cards keep the sheet.
import { useRef } from 'react';
import { Nest, teamName, useLayerFocus } from '../ui/index.js';
import { RESEARCH_NAMES } from '../research/researchNav.js';
import { TeamViewSlot } from './TeamViewSlot.jsx';

export function TeamLayer({ code, status, season, onClose }) {
  const root = useRef(null);
  useLayerFocus(root);
  const name = teamName(code);
  return <div ref={root} className="gx-screen" data-research="team" data-team={code}>
    <h1 className="gx-t-title">{RESEARCH_NAMES.teams}</h1>
    <Nest label={name} lips={[{ key: 'teams', label: RESEARCH_NAMES.teams, onOpen: onClose }]} layer={`team:${code}`} title={name}>
      <TeamViewSlot status={status} season={season} code={code}/>
    </Nest>
  </div>;
}
