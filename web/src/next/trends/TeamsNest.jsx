// D-66 Trends › Teams as nesting cards (docs/superpowers/specs/2026-10-28-research-nesting-cards-design.md):
// Teams › one team › one trend. Each layer is a heading, one meta line and tappable tiles with one picture and one
// big number; sentences, conditions and credits sit behind the layer's ⓘ, and the sample and tier stay as tags.
import { lockedRecordsText, lockedTrendText } from '../../../../shared/lines-view.mjs';
import { trendAvailabilityText } from '../../trendsAvailability.js';
import { useShell } from '../shell/context.js';
import { Button, Icon, InfoButton, Nest, NestMeter, Pill, TeamMark } from '../ui/index.js';
import { TrendDetail } from '../charts/TrendDetail.jsx';
import { tierPill, trendDetailProps, trendInfoBody } from '../lines/parts.jsx';
import { INFO } from '../info.js';
import { nestTeams, nestTeamTrends, trendShare } from './teamNest.js';
import { WindowRecords } from './WindowRecords.jsx';

/** A short, stable address for a trend (its key can carry a line band, so the address never holds the key itself). */
export function trendSlug(key) {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193) >>> 0;
  return 't' + h.toString(36);
}

const shareWords = share => `${Math.round(share * 100)}% of decided games went this way; the tick is the 52.4% break-even`;

function TrendTile({ card, rules, onOpen }) {
  if (card.locked) {
    return <li><div className="gx-nest-tile" data-trend="locked">
      <span className="gx-nest-tile-top"><span className="gx-nest-tile-label">{card.title}</span><Icon icon="lock" size={16}/></span>
      <span className="gx-t-meta">{lockedTrendText(card.gate, rules)}</span>
    </div></li>;
  }
  const share = card.share;
  return <li><button type="button" className="gx-nest-tile" data-trend={card.kind} onClick={onOpen}>
    <span className="gx-nest-tile-label">{card.title}</span>
    <span className="gx-n-m gx-nest-num">{card.record}</span>
    <NestMeter share={share} label={shareWords(share)}/>
  </button></li>;
}

export function TeamsNest({ week, views, market, view, onChange }) {
  const shell = useShell();
  const teams = nestTeams(week, views, market);
  const team = teams.find(t => t.code === view.teamsTeam) ?? null;
  const { cards, locks } = team ? nestTeamTrends(week, team, market) : { cards: [], locks: [] };
  const shown = cards.map(card => ({ ...card, share: trendShare(week, card) }));
  const card = team && view.teamsTrend ? shown.find(c => !c.locked && trendSlug(c.key) === view.teamsTrend) ?? null : null;
  const toTeams = { key: 'teams', label: 'Teams', onOpen: () => onChange({ teamsTeam: null, teamsTrend: null }) };
  const gameButton = v => <Button variant="secondary" onClick={() => shell.openSheet('sh.game', { game: v.id })}>Game details · {v.title}</Button>;

  if (team && card) {
    const v = team.view, chart = card.chart?.spark ? card.chart : null;
    const info = <InfoButton title="About this trend" body={trendInfoBody(card)} links={INFO.trends.links}/>;
    return <Nest label="Team trends" layer={'trend:' + view.teamsTrend} title={card.title} info={chart ? null : info}
      lips={[toTeams, { key: 'team', label: team.name, onOpen: () => onChange({ teamsTrend: null }) }]}>
      {chart ? <TrendDetail title={card.title} pill={tierPill(card.tier)} info={info} {...trendDetailProps(card)}/> : <>
        <p className="gx-nest-big"><span className="gx-n-xl">{card.record}</span></p>
        <NestMeter share={card.share} label={shareWords(card.share)}/>
        <div className="gx-nest-tags"><Pill>{card.sample}</Pill><Pill>{card.tierLabel}</Pill></div>
      </>}
      <WindowRecords card={card} week={week} summary="Windows and dates"/>
      {gameButton(v)}
    </Nest>;
  }

  if (team) {
    const v = team.view;
    return <Nest label="Team trends" layer={'team:' + team.code} title={team.name} lips={[toTeams]}>
      <p className="gx-t-meta">{v.title} · {v.when}</p>
      {shown.length || locks.length ? <ul className="gx-nest-list" aria-label={team.name + ' trends'}>
        {locks.map(gate => <li key={'lock:' + gate}><div className="gx-nest-tile" data-trend="locked">
          <span className="gx-nest-tile-top"><span className="gx-nest-tile-label">Line-based records</span><Icon icon="lock" size={16}/></span>
          <span className="gx-t-meta">{lockedRecordsText(gate, v.rules)}</span>
        </div></li>)}
        {shown.map(c => <TrendTile key={c.key} card={c} rules={v.rules} onOpen={() => onChange({ teamsTrend: trendSlug(c.key) })}/>)}
      </ul> : <p className="gx-t-body">No team trend in this market.</p>}
      {gameButton(v)}
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
