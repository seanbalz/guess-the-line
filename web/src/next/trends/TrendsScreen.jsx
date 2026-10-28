import { useEffect } from 'react';
import { marketRelevant as relevant, marketSituationCards } from './situations.js';
import { gameSheet, gamesOf } from '../../../../shared/lines-view.mjs';
import { allTrends, lookup, TRENDS_FOOTNOTE } from '../../../../shared/trends-view.mjs';
import { TEAM_NAMES } from '../../../../shared/nfl-schedule.mjs';
import { PLAYER_TREND_WINDOWS } from '../../../../shared/player-trends.mjs';
import { useShell } from '../shell/context.js';
import { useLinesData } from '../lines/linesData.js';
import { Button, Card, Matchup, Segmented } from '../ui/index.js';
import { LeagueFailure } from '../league/useLeagueRead.jsx';
import { ShortTrend, TrendAvailability } from '../lines/parts.jsx';
import { PlayerEvidence, Select } from './PlayerEvidence.jsx';
import { useTrendsHistory } from './useTrendsHistory.js';
import { time } from './charts.jsx';
import '../lines/lines.css';
import { TrendBuilder } from './TrendBuilder.jsx';
import { SavedTrendsSummary } from './SavedTrendsSummary.jsx';
import './trends.css';
const sections = [{ value: 'week', label: 'This Week' },{ value: 'teams', label: 'Teams' },{ value: 'players', label: 'Players' },{ value: 'build', label: 'Build' }];
const markets = [{ value: 'spread', label: 'Spread' },{ value: 'total', label: 'Total' }];
function WindowRecords({ card, week }) {
  // shortCard has already applied the independent game/market gate. Never inspect locked card payloads.
  if (card.locked) return null;
  const item = lookup(week, card.id)?.entry;
  if (!item?.windows) return <p className="gx-t-meta">Window evidence unavailable in this dated snapshot.</p>;
  const sides = item.market === 'total' ? ['Over','Under'] : item.market === 'home_ats' ? ['Home','Road'] : item.market === 'fav_ats' ? ['Favorite','Underdog'] : [card.team || 'Team with trait','Opponent'];
  return <details className="gx-tr-details"><summary className="gx-t-strong">Recent and longer evidence · {card.title}</summary><p className="gx-t-meta">Same qualifying historical situation. Registered cards keep their fixed side; two-sided rows show both. Dates are calendar dates.</p>
    <div className="gx-tr-table" role="region" aria-label={card.title + ' history windows'} tabIndex={0}><table><caption className="gx-t-meta">{item.sideLabel || sides.join(' / ')} · W-L-P and exact contributing dates</caption>
      <thead><tr><th scope="col">Window / side</th><th scope="col">W-L-P</th><th scope="col">Games</th><th scope="col">Dates</th></tr></thead>
      <tbody>{PLAYER_TREND_WINDOWS.flatMap(w => { const r = item.windows[w.id]; return !r ? [] : (r.A ? [[sides[0],r.A],[sides[1],r.B]] : [[item.sideLabel || 'Registered side',r]]).map(([label,v]) => <tr key={w.id+label}><th scope="row">{w.label} · {label}</th><td>{v.n ? v.W+'–'+v.L+'–'+v.P : 'No sample'}</td><td>{v.n}</td><td>{v.from ? time(v.from) + ' through ' + time(v.to) : '—'}</td></tr>); })}</tbody>
    </table></div>
  </details>;
}
// The Players filters belong to the account that chose them. The address restores them after a reload, but when a
// different account signs in on this page it starts from its own defaults (not the previous account's selection).
const PLAYER_FILTERS = Object.freeze({ player: undefined, team: undefined, playerMatchup: undefined, window: undefined });
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
  const teams = [...new Set(views.flatMap(v => [v.away.code,v.home.code]))].sort();
  const team = teams.includes(view.weekTeam) ? view.weekTeam : '';
  const teamGames = views.filter(v => !team || [v.away.code,v.home.code].includes(team));
  const matchup = teamGames.some(v => v.id === view.matchup) ? view.matchup : '';
  const games = teamGames.filter(v => !matchup || v.id === matchup);
  const cards = games.flatMap(v => marketSituationCards(trendsWeek,v,market).map(card => ({ card, v }))).sort((a,b) => a.card.strength[0]-b.card.strength[0] || a.card.strength[1]-b.card.strength[1]);
  return <div className="gx-screen gx-trends">
    <h1 className="gx-t-title">Trends</h1>
    <p className="gx-t-body gx-c-2">{shown ? 'Published week: ' + shown.season + ' Week ' + shown.week : 'Waiting for a published week.'} · {app.league?.name || 'Community'}</p>
    <Segmented label="Trends section" value={section} options={sections} onChange={section => onChange({ trendSection: section })}/>
    <Segmented label="Trends market" value={market} options={markets} onChange={market => onChange({ market })}/>
    {section === 'build' ? <TrendBuilder lines={data} market={market} onMarket={market => onChange({ market })}/> : section === 'players' ? <>{history.loading ? <p className="gx-t-body" role="status">Loading scoped player history…</p> : history.error ? <LeagueFailure error={history.error} onRetry={history.retry}/> : history.data && shown ? <PlayerEvidence history={history.data} published={shown} view={view} onChange={onChange} scopeName={app.league?.name || 'Community'}/> : <p className="gx-t-body">No published player history yet.</p>}<Button onClick={history.retry}>Refresh player history</Button></> : <>
      <TrendAvailability week={trendsWeek}/>
      <p className="gx-t-meta">{TRENDS_FOOTNOTE}</p>
      {trends.status === 'error' ? <Card role="alert"><p className="gx-t-body">Trends unavailable. Try again.</p><Button onClick={trends.retry}>Retry trends</Button></Card> : trends.status === 'loading' ? <p className="gx-t-body" role="status">Loading published-week trends…</p> : trends.status === 'missing' ? <p className="gx-t-body" role="status">No evidence available for this published week.</p> : null}
      <div className="gx-tr-filters gx-tr-week-filters"><Select label="Team" value={team} onChange={weekTeam => onChange({ weekTeam, matchup: '' })}><option value="">All teams</option>{teams.map(t => <option key={t}>{t}</option>)}</Select>
        <Select label="Matchup" value={matchup} onChange={matchup => onChange({ matchup })}><option value="">All matchups</option>{teamGames.map(v => <option key={v.id} value={v.id}>{v.title}</option>)}</Select></div>
      {section === 'week' && <SavedTrendsSummary lines={data} onOpen={() => onChange({ trendSection: 'build' })}/>}
      {section === 'week' && cards.length > 0 && <section className="gx-vstack gx-gap-12" aria-label="Weekly highlights"><h2 className="gx-t-section">Weekly highlights</h2><p className="gx-t-meta">At most three, ordered by existing evidence quality. Shared situations can overlap.</p><ul className="gx-l-alist">{cards.slice(0,3).map(({card,v}) => <ShortTrend key={v.id+card.key} card={card} rules={v.rules}/>)}</ul></section>}
      <section className="gx-vstack gx-gap-16" aria-label={section === 'teams' ? 'Team history comparisons' : 'Published matchups'}>
      <h2 className="gx-t-section">{section === 'teams' ? 'Team history comparisons' : 'Published matchups'}</h2>
      {games.map(v => { const eligible = section === 'teams' && v.trendsGame ? allTrends(trendsWeek, v.id, { access: v.access, saved: v.saved, names: TEAM_NAMES }).groups.flatMap(g => g.items).filter(c => relevant(c,trendsWeek,market) && (!team || !c.team || c.team === team)).slice(0,3) : marketSituationCards(trendsWeek,v,market); return <Card key={v.id} as="section" className="gx-vstack gx-gap-12">
        <h3 className="gx-t-section"><Matchup away={v.away.code} home={v.home.code} size={32}/></h3><p className="gx-t-meta">{v.when}</p>
        {!v.access[market] && <p className="gx-t-body">This game's {market === 'spread' ? 'Spread' : 'Total'} line-based records are hidden until your lock-in or kickoff. Historical public situations remain available.</p>}
        {section === 'teams' ? eligible.map(c => <div key={c.key} className="gx-vstack gx-gap-8"><ShortTrend as="div" card={c} rules={v.rules} variant="s2"/><WindowRecords card={c} week={trendsWeek}/></div>) : <details className="gx-tr-details"><summary className="gx-t-strong">Matchup evidence</summary><ul className="gx-l-alist">{eligible.map(c => <ShortTrend key={c.key} card={c} rules={v.rules}/>)}</ul>{eligible.map(c => <WindowRecords key={c.key} card={c} week={trendsWeek}/>)}</details>}
        {!eligible.length && <p className="gx-t-body">No qualifying highlight in this market. Inspect all records for coverage.</p>}
        <Button onClick={() => shell.openSheet('sh.game',{ game: v.id })}>Game details · {v.title}</Button>
      </Card>; })}
      {!games.length && <p className="gx-t-body">No games match these filters.</p>}
      </section>
      <a className="gx-l-link gx-t-meta" href="https://github.com/nflverse/nflverse-data" target="_blank" rel="noreferrer">Data: nflverse · CC BY 4.0, modified</a>
      <Button onClick={trends.retry}>Refresh trends</Button>
    </>}
  </div>;
}
