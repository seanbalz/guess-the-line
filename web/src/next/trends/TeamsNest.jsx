// D-66 Trends › Teams as nesting cards (docs/superpowers/specs/2026-10-28-research-nesting-cards-design.md):
// Teams › one team › one trend. Each layer is a heading, one meta line and tappable tiles with one picture and one
// big number; sentences, conditions and credits sit behind the layer's ⓘ, and the sample and tier stay as tags.
import { trendAvailabilityText } from '../../trendsAvailability.js';
import { InfoButton, Nest, NestMeter, TeamMark } from '../ui/index.js';
import { INFO } from '../info.js';
import { nestTeams, nestTeamTrends, trendShare } from './teamNest.js';
import { GameDetailsButton, LineLockTile, shareWords, trendSlug, trendLayer, TrendTile } from './TrendLayer.jsx';

export { trendSlug };

export function TeamsNest({ week, views, market, view, onChange }) {
  const teams = nestTeams(week, views, market);
  const team = teams.find(t => t.code === view.teamsTeam) ?? null;
  const { cards, locks } = team ? nestTeamTrends(week, team, market) : { cards: [], locks: [] };
  const shown = cards.map(card => ({ ...card, share: trendShare(week, card) }));
  const card = team && view.teamsTrend ? shown.find(c => !c.locked && trendSlug(c.key) === view.teamsTrend) ?? null : null;
  const toTeams = { key: 'teams', label: 'Teams', onOpen: () => onChange({ teamsTeam: null, teamsTrend: null }) };

  if (team && card) {
    return trendLayer({ label: 'Team trends', layer: 'trend:' + view.teamsTrend, card, week, view: team.view,
      lips: [toTeams, { key: 'team', label: team.name, onOpen: () => onChange({ teamsTrend: null }) }] });
  }

  if (team) {
    const v = team.view;
    return <Nest label="Team trends" layer={'team:' + team.code} title={team.name} lips={[toTeams]}>
      <p className="gx-t-meta">{v.title} · {v.when}</p>
      {shown.length || locks.length ? <ul className="gx-nest-list" aria-label={team.name + ' trends'}>
        {locks.map(gate => <LineLockTile key={'lock:' + gate} market={gate} rules={v.rules}/>)}
        {shown.map(c => <TrendTile key={c.key} card={c} rules={v.rules} onOpen={() => onChange({ teamsTrend: trendSlug(c.key) })}/>)}
      </ul> : <p className="gx-t-body">No team trend in this market.</p>}
      <GameDetailsButton view={v}/>
    </Nest>;
  }

  const info = <InfoButton title="About team trends" links={INFO.trends.links}
    body={['Each tile is the team’s record at this week’s venue, home or road.', trendAvailabilityText(week), ...INFO.trends.body].filter(Boolean)}/>;
  return <Nest label="Team trends" layer="teams" title="Teams" info={info}>
    <p className="gx-t-meta">{market === 'total' ? 'Overs at this venue' : 'Covers at this venue'} · white tick = break-even</p>
    {teams.length ? <ul className="gx-nest-grid" aria-label="Teams this week">
      {teams.map(t => <li key={t.code}><button type="button" className="gx-nest-tile" data-team={t.code} onClick={() => onChange({ teamsTeam: t.code, teamsTrend: null })}>
        <span className="gx-nest-tile-top"><TeamMark code={t.code} name={t.name} size={32}/><span className="gx-n-m gx-nest-num">{t.headline && !t.headline.locked ? t.headline.record : '—'}</span></span>
        <span className="gx-nest-tile-label">{t.role === 'home' ? 'Home' : 'Road'}</span>
        <NestMeter share={t.share} label={shareWords(t.share ?? 0)}/>
      </button></li>)}
    </ul> : <p className="gx-t-body">No team records for this week yet.</p>}
  </Nest>;
}
