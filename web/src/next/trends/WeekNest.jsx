// D-66 Trends › This Week as nesting cards (docs/superpowers/specs/2026-10-28-research-nesting-cards-design.md):
// This week › one game › one trend. The first card holds the evidence freshness line, the saved-trend matches, the
// top three trends (D-75: a hero, two tiles, then All trends) and a tile per published game; the trends footnote and
// credits sit behind its ⓘ. A game whose market is closed shows a lock, never a line-based record (D-31, D-36).
import { TRENDS_FOOTNOTE } from '../../../../shared/trends-view.mjs';
import { Icon, InfoButton, Matchup, matchupWords, MetaLine, Nest } from '../ui/index.js';
import { SEP } from '../format.js';
import { TrendAvailability } from '../lines/parts.jsx';
import { INFO } from '../info.js';
import { marketSituationCards } from './situations.js';
import { trendShare } from './teamNest.js';
import { SavedTrendsSummary } from './SavedTrendsSummary.jsx';
import { GameDetailsButton, LineLockTile, trendSlug, trendLayer, TrendHero, TrendTile } from './TrendLayer.jsx';

const strongest = (a, b) => a.card.strength[0] - b.card.strength[0] || a.card.strength[1] - b.card.strength[1];
const short = v => `${v.away.code} @ ${v.home.code}`;

export function WeekNest({ week, views, market, view, onChange, lines, onBuild }) {
  const account = lines?.app?.accountId ?? null;
  const games = views.map(v => ({ v, cards: marketSituationCards(week, v, market).map(card => ({ ...card, share: trendShare(week, card) })) }));
  const game = games.find(g => g.v.id === view.weekGame) ?? null;
  const card = game && view.weekTrend ? game.cards.find(c => !c.locked && trendSlug(c.key) === view.weekTrend) ?? null : null;
  // D-75: every trend of the week, strongest first; the first card shows three and folds the rest into All trends.
  const ranked = games.flatMap(({ v, cards }) => cards.map(card => ({ card, v }))).sort(strongest);
  const toWeek = { key: 'week', label: 'This week', onOpen: () => onChange({ weekGame: null, weekTrend: null, weekList: null }) };
  const openTrend = (v, c) => onChange({ weekList: null, weekGame: v.id, weekTrend: trendSlug(c.key) });
  // A20: the game, then the trend's own parts (its title joins the situation and the side with the app's separator), so
  // a narrow tile wraps between them and never starts a line with "·". The label brings its own type.
  const titled = (c, v) => ({ ...c, title: <MetaLine as="span" className="" parts={[short(v), ...c.title.split(SEP)]}/> });

  if (!game && view.weekList === 'all') {
    return <Nest label="Week trends" layer="all" title="All trends" lips={[toWeek]}>
      <p className="gx-t-meta">{ranked.length} {ranked.length === 1 ? 'trend' : 'trends'} · strongest first</p>
      {ranked.length ? <ul className="gx-nest-grid" aria-label="All trends this week">
        {ranked.map(({ card: c, v }) => <TrendTile key={v.id + c.key} card={titled(c, v)} rules={v.rules} account={account} onOpen={() => openTrend(v, c)}/>)}
      </ul> : <p className="gx-t-body">No qualifying trend this week.</p>}
    </Nest>;
  }

  if (game && card) {
    return trendLayer({ label: 'Week trends', layer: 'trend:' + view.weekTrend, card, week, view: game.v, account,
      lips: [toWeek, { key: 'game', label: short(game.v), onOpen: () => onChange({ weekTrend: null }) }] });
  }

  if (game) {
    const { v, cards } = game;
    return <Nest label="Week trends" layer={'game:' + v.id} title={matchupWords(v.away.code, v.home.code)} lips={[toWeek]}>
      <p className="gx-t-meta">{v.when}</p>
      {cards.length || !v.access[market] ? <ul className="gx-nest-list" aria-label={short(v) + ' trends'}>
        {!v.access[market] && <LineLockTile market={market} rules={v.rules}/>}
        {cards.map(c => <TrendTile key={c.key} card={c} rules={v.rules} account={account} onOpen={() => onChange({ weekTrend: trendSlug(c.key) })}/>)}
      </ul> : null}
      {!cards.length && <p className="gx-t-body">No qualifying trend in this market.</p>}
      <GameDetailsButton view={v}/>
    </Nest>;
  }

  const [hero, ...pair] = ranked.slice(0, 3);
  const info = <InfoButton title="About this week’s trends" links={INFO.trends.links}
    body={[TRENDS_FOOTNOTE, 'Top trends: at most three, ordered by existing evidence quality. Shared situations can overlap.', ...INFO.trends.body]}/>;
  return <Nest label="Week trends" layer="week" title="This week" info={info}>
    <TrendAvailability week={week}/>
    <SavedTrendsSummary lines={lines} onOpen={onBuild}/>
    {hero && <section className="gx-vstack gx-gap-8" aria-label="Weekly highlights">
      <h3 className="gx-t-label gx-c-2">Top trends</h3>
      <ul className="gx-nest-list"><TrendHero card={titled(hero.card, hero.v)} rules={hero.v.rules} account={account} onOpen={() => openTrend(hero.v, hero.card)}/></ul>
      {pair.length ? <ul className="gx-nest-grid">{pair.map(({ card: c, v }) => <TrendTile key={v.id + c.key} card={titled(c, v)} rules={v.rules} account={account} onOpen={() => openTrend(v, c)}/>)}</ul> : null}
      {ranked.length > 3 && <button type="button" className="gx-nest-more" onClick={() => onChange({ weekList: 'all' })}>
        <span>All {ranked.length} trends this week</span><Icon icon="chevronRight" size={20}/></button>}
    </section>}
    <section className="gx-vstack gx-gap-8" aria-label="Published matchups">
      <h3 className="gx-t-label gx-c-2">Games</h3>
      {games.length ? <ul className="gx-nest-grid">{games.map(({ v, cards }) => {
        const open = cards.filter(c => !c.locked).length;
        return <li key={v.id}><button type="button" className="gx-nest-tile gx-nest-tile--glass" data-game={v.id} onClick={() => onChange({ weekGame: v.id, weekTrend: null })}>
          <span className="gx-nest-tile-label"><Matchup away={v.away.code} home={v.home.code} size={32} codes={false}/></span>
          <span className="gx-n-m gx-nest-num">{open}</span>
          <span className="gx-nest-tile-top"><span className="gx-t-meta">{open === 1 ? 'trend' : 'trends'}</span>{v.access[market] ? null : <Icon icon="lock" size={16} label={`${market === 'spread' ? 'Spread' : 'Total'} line trends locked`}/>}</span>
        </button></li>;
      })}</ul> : <p className="gx-t-body">No published games yet.</p>}
    </section>
  </Nest>;
}
