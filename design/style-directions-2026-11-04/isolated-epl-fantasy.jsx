// Native presentation wrapper only. Four panels and WeeklyLine are unchanged direct pure imports.
// Preview adaptations: retry haptics off; synthetic-data footer instead of a claimed saved Sleeper time.
import React from 'react';
import {Button,Segmented,Skeleton} from '../../web/src/next/ui/index.js';
import {FANTASY_COPY,fantasyProblem} from '../../web/src/next/epl/fantasy/fantasyModel.js';
import {MatchupPanel} from '../../web/src/next/epl/fantasy/Matchup.jsx';
import {StandingsPanel} from '../../web/src/next/epl/fantasy/Standings.jsx';
import {RostersPanel} from '../../web/src/next/epl/fantasy/Rosters.jsx';
import {InsightsPanel} from '../../web/src/next/epl/fantasy/Insights.jsx';
export const FANTASY_SECTIONS = Object.freeze(['matchup', 'standings', 'rosters', 'insights']);
const PANELS = { matchup: MatchupPanel, standings: StandingsPanel, rosters: RostersPanel, insights: InsightsPanel };

export function IsolatedEplFantasyView({ state, section = 'matchup', onSection, onRetry }) {
  const options = FANTASY_SECTIONS.map(value => ({ value, label: FANTASY_COPY.sections[value] }));
  const Panel = PANELS[section] ?? MatchupPanel;
  let body;
  if (!state || state.status === 'loading') body = <Skeleton label={FANTASY_COPY.loading} shape="panels" count={2}/>;
  else if (state.status === 'failed' || !state.data) {
    const problem = fantasyProblem(state.error);
    body = <section className="gx-empty">
      <p className="gx-t-body">{problem}</p>
      {problem === FANTASY_COPY.failed && onRetry ? <Button haptic={false} variant="secondary" onClick={onRetry}>{FANTASY_COPY.retry}</Button> : null}
    </section>;
  } else body = <>
    <Panel view={state.data}/>
    <p className="gx-t-meta gx-c-2 gx-epl-fx-footer">Illustrative FEPL data · no Sleeper snapshot or capture time</p>
  </>;
  return <div className="gx-epl-fx" data-epl-fantasy={section}>
    <h2 className="gx-t-section">{FANTASY_COPY.title}</h2>
    <Segmented label={FANTASY_COPY.title} value={section} options={options} onChange={value => onSection?.(value)}/>
    {body}
  </div>;
}
