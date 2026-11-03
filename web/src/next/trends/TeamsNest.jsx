// D-66 Trends › Teams as nesting cards (docs/superpowers/specs/2026-10-28-research-nesting-cards-design.md):
// Teams › one team › one trend. Each layer is a heading, one meta line and tappable tiles with one picture and one
// big number; sentences, conditions and credits sit behind the layer's ⓘ. D-75: the tiles are glass with one win rate,
// and a team shows its two strongest trends with the rest folded in place.
import { useId, useState } from 'react';
import { sinceText } from '../../../../shared/trends-view.mjs';
import { trendAvailabilityText } from '../../trendsAvailability.js';
import { Icon, InfoButton, Nest, TeamMark } from '../ui/index.js';
import { INFO } from '../info.js';
import { nestTeams, nestTeamTrends, trendShare, winRateText } from './teamNest.js';
import { GameDetailsButton, LineLockTile, trendSlug, trendLayer, TrendTile } from './TrendLayer.jsx';

export { trendSlug };

/** A team layer shows this many trends before the fold (D-75). */
const SHOWN = 2;

export function TeamsNest({ week, views, market, view, onChange }) {
  const [openFor, setOpenFor] = useState(null), restId = useId();
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
    const v = team.view, more = shown.length - SHOWN, open = openFor === team.code;
    const tile = c => <TrendTile key={c.key} card={c} rules={v.rules} onOpen={() => onChange({ teamsTrend: trendSlug(c.key) })}/>;
    return <Nest label="Team trends" layer={'team:' + team.code} title={team.name} lips={[toTeams]}>
      <p className="gx-t-meta">{v.title} · {v.when}</p>
      {shown.length || locks.length ? <ul className="gx-nest-grid" aria-label={team.name + ' trends'}>
        {locks.map(gate => <LineLockTile key={'lock:' + gate} market={gate} rules={v.rules}/>)}
        {shown.slice(0, SHOWN).map(tile)}
      </ul> : <p className="gx-t-body">No team trend in this market.</p>}
      {more > 0 && <button type="button" className="gx-nest-more" aria-expanded={open} aria-controls={restId} onClick={() => setOpenFor(open ? null : team.code)}>
        <span>{more} more {team.code} {more === 1 ? 'trend' : 'trends'}</span><Icon icon="chevronDown" size={20}/></button>}
      {more > 0 && open ? <ul id={restId} className="gx-nest-grid" aria-label={`More ${team.name} trends`}>{shown.slice(SHOWN).map(tile)}</ul> : null}
      <GameDetailsButton view={v}/>
    </Nest>;
  }

  const info = <InfoButton title="About team trends" links={INFO.trends.links}
    body={['Each tile is the team’s record at this week’s venue, home or road.', trendAvailabilityText(week), ...INFO.trends.body].filter(Boolean)}/>;
  const since = sinceText(teams.find(t => t.headline && !t.headline.locked)?.headline.years);
  return <Nest label="Team trends" layer="teams" title="Teams" info={info}>
    <p className="gx-t-meta">{market === 'total' ? 'Overs' : 'Covers'} at this week’s venue · {since}</p>
    {teams.length ? <ul className="gx-nest-grid" aria-label="Teams this week">
      {teams.map(t => {
        const known = t.headline && !t.headline.locked;
        return <li key={t.code}><button type="button" className="gx-nest-tile gx-nest-tile--glass" data-team={t.code} onClick={() => onChange({ teamsTeam: t.code, teamsTrend: null })}>
          <span className="gx-nest-tile-top"><TeamMark code={t.code} name={t.name} size={32}/><span className="gx-t-meta">{t.role === 'home' ? 'Home' : 'Road'}</span></span>
          <span className="gx-n-m gx-nest-num">{known ? winRateText(t.share) : '—'}</span>
          <span className="gx-t-meta">{known ? `${(t.headline.games ?? 0).toLocaleString('en-US')} games` : 'No record'}</span>
        </button></li>;
      })}
    </ul> : <p className="gx-t-body">No team records for this week yet.</p>}
  </Nest>;
}
