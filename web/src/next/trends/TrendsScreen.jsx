import { useEffect } from 'react';
import { gameSheet, gamesOf } from '../../../../shared/lines-view.mjs';
import { useShell } from '../shell/context.js';
import { useLinesData } from '../lines/linesData.js';
import { Button, Card, Segmented } from '../ui/index.js';
import { LeagueFailure } from '../league/useLeagueRead.jsx';
import { PlayersNest } from './PlayersNest.jsx';
import { useTrendsHistory } from './useTrendsHistory.js';
import { TeamsNest } from './TeamsNest.jsx';
import { WeekNest } from './WeekNest.jsx';
import '../lines/lines.css';
import { TrendBuilder } from './TrendBuilder.jsx';
import './trends.css';
const sections = [{ value: 'week', label: 'This Week' },{ value: 'teams', label: 'Teams' },{ value: 'players', label: 'Players' },{ value: 'build', label: 'Build' }];
const markets = [{ value: 'spread', label: 'Spread' },{ value: 'total', label: 'Total' }];

// The Players filters belong to the account that chose them. The address restores them after a reload, but when a
// different account signs in on this page it starts from its own defaults (not the previous account's selection).
const PLAYER_FILTERS = Object.freeze({ player: undefined, playerLayer: undefined, playerItem: undefined, team: undefined, playerMatchup: undefined, window: undefined });
let filtersAccount = null;
export function TrendsScreen() {
  const shell = useShell(), data = useLinesData(), { app, personal, community, shown, trends, trendsWeek } = data;
  const carried = Boolean(app.accountId && filtersAccount && filtersAccount !== app.accountId);
  const view = carried ? { ...shell.state.views.trends, ...PLAYER_FILTERS } : shell.state.views.trends;
  useEffect(() => {
    if (!app.accountId) return;
    if (filtersAccount && filtersAccount !== app.accountId) shell.setView('trends', PLAYER_FILTERS);
    filtersAccount = app.accountId;
  }, [app.accountId]); // The shell's actions are stable for its lifetime.
  const section = sections.some(s => s.value === view.trendSection) ? view.trendSection : 'week', market = view.market === 'total' ? 'total' : 'spread';
  const onChange = patch => shell.setView('trends', patch);
  const history = useTrendsHistory(app, shown, view.window || 'season', section === 'players' && Boolean(shown));
  const views = personal.data ? gamesOf(personal.data).map(g => gameSheet({ personal: personal.data, community, trends: trendsWeek, trendsStatus: trends.status, gameId: g.id })).filter(Boolean) : [];
  const evidence = trends.status === 'error' ? <Card role="alert"><p className="gx-t-body">Trends unavailable. Try again.</p><Button onClick={trends.retry}>Retry trends</Button></Card> : trends.status === 'loading' ? <p className="gx-t-body" role="status">Loading published-week trends…</p> : trends.status === 'missing' ? <p className="gx-t-body" role="status">No evidence available for this published week.</p> : null;
  return <div className="gx-screen gx-trends">
    <h1 className="gx-t-title">Trends</h1>
    <p className="gx-t-body gx-c-2">{shown ? 'Published week: ' + shown.season + ' Week ' + shown.week : 'Waiting for a published week.'} · {app.league?.name || 'Community'}</p>
    <Segmented label="Trends section" value={section} options={sections} onChange={section => onChange({ trendSection: section })}/>
    <Segmented label="Trends market" value={market} options={markets} onChange={market => onChange({ market })}/>
    {section === 'build' ? <TrendBuilder lines={data} market={market} onMarket={market => onChange({ market })}/> : section === 'players' ? <>{history.loading ? <p className="gx-t-body" role="status">Loading scoped player history…</p> : history.error ? <LeagueFailure error={history.error} onRetry={history.retry}/> : history.data && shown ? <PlayersNest history={history.data} published={shown} view={view} onChange={onChange} scopeName={app.league?.name || 'Community'}/> : <p className="gx-t-body">No published player history yet.</p>}<Button onClick={history.retry}>Refresh player history</Button></> : section === 'teams' ? <>
      {evidence ?? <TeamsNest week={trendsWeek} views={views} market={market} view={view} onChange={onChange}/>}
    </> : <>
      {evidence ?? <WeekNest week={trendsWeek} views={views} market={market} view={view} onChange={onChange} lines={data} onBuild={() => onChange({ trendSection: 'build' })}/>}
      <Button variant="secondary" onClick={trends.retry}>Refresh trends</Button>
    </>}
  </div>;
}

export default TrendsScreen;
