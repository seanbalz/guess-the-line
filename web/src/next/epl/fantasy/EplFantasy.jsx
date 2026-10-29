// Research › Fantasy (EPL) (spec sections 5 and 8; plan 2026-10-28-epl-fantasy.md, Task 3): the FEPL league from one
// `epl/fantasy/read` (cloud/epl-fantasy-view.mjs, built from stored Sleeper snapshots), with the sub-tabs Matchup ·
// Standings · Rosters · Insights and the footer "From Sleeper · saved <time>". A refused read (a non-member's 403, the
// feature off, nothing saved yet) shows its sentence and never league data.
import './fantasy.css';
import '../../charts/charts.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Segmented, Skeleton } from '../../ui/index.js';
import { fmtWhen } from '../../format.js';
import { eplApi } from '../api.js';
import { FANTASY_COPY, fantasyProblem } from './fantasyModel.js';
import { MatchupPanel } from './Matchup.jsx';
import { StandingsPanel } from './Standings.jsx';
import { RostersPanel } from './Rosters.jsx';
import { InsightsPanel } from './Insights.jsx';

export { FANTASY_COPY, fantasyProblem };
export const FANTASY_SECTIONS = Object.freeze(['matchup', 'standings', 'rosters', 'insights']);
const PANELS = { matchup: MatchupPanel, standings: StandingsPanel, rosters: RostersPanel, insights: InsightsPanel };

export function EplFantasyView({ state, section = 'matchup', onSection, onRetry }) {
  const options = FANTASY_SECTIONS.map(value => ({ value, label: FANTASY_COPY.sections[value] }));
  const Panel = PANELS[section] ?? MatchupPanel;
  let body;
  if (!state || state.status === 'loading') body = <Skeleton label={FANTASY_COPY.loading} shape="panels" count={2}/>;
  else if (state.status === 'failed' || !state.data) {
    const problem = fantasyProblem(state.error);
    body = <section className="gx-empty">
      <p className="gx-t-body">{problem}</p>
      {problem === FANTASY_COPY.failed && onRetry ? <Button variant="secondary" onClick={onRetry}>{FANTASY_COPY.retry}</Button> : null}
    </section>;
  } else body = <>
    <Panel view={state.data}/>
    <p className="gx-t-meta gx-c-2 gx-epl-fx-footer">{FANTASY_COPY.footer(fmtWhen(state.data.capturedAt))}</p>
  </>;
  return <div className="gx-epl-fx" data-epl-fantasy={section}>
    <h2 className="gx-t-section">{FANTASY_COPY.title}</h2>
    <Segmented label={FANTASY_COPY.title} value={section} options={options} onChange={value => onSection?.(value)}/>
    {body}
  </div>;
}

/** One `epl/fantasy/read` on mount and on request; a refusal drops any earlier league data. */
export function useEplFantasy(api) {
  const [state, setState] = useState({ status: 'loading' });
  const live = useRef(null);
  const load = useCallback(() => {
    live.current?.abort();
    const controller = new AbortController();
    live.current = controller;
    setState({ status: 'loading' });
    return api('fantasy/read', {}, { signal: controller.signal }).then(
      data => { if (live.current === controller) setState({ status: 'loaded', data }); },
      error => { if (live.current === controller && error?.name !== 'AbortError') setState({ status: 'failed', error }); },
    );
  }, [api]);
  useEffect(() => { load(); return () => { live.current?.abort(); live.current = null; }; }, [load]);
  return { state, reload: load };
}

export function EplFantasy({ api = eplApi }) {
  const [section, setSection] = useState('matchup');
  const { state, reload } = useEplFantasy(api);
  return <EplFantasyView state={state} section={section} onSection={setSection} onRetry={reload}/>;
}
