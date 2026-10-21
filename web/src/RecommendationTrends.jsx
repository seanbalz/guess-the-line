import { useEffect, useMemo, useState } from 'react';
import { gameTrends, TRENDS_CREDIT, TRENDS_LICENSE_URL, TRENDS_SOURCE_URL } from '../../shared/trends-view.mjs';
import { loadTrendWeek } from './trendsLoaders.js';

export function recommendationTrendCards(weekData, gameId, market, consensus) {
  if (!weekData) return [];
  const { all } = gameTrends(weekData, gameId, {
    access: { [market]: true },
    saved: { [market]: consensus },
  });
  return all.filter(card => {
    const cardMarket = weekData.cards?.[card.id]?.market;
    const sameMarket = market === 'spread' ? cardMarket?.endsWith('_ats') : cardMarket?.startsWith('total');
    return !card.locked && sameMarket && (!card.gate || card.gate === market) && card.games > 0;
  }).slice(0, 2);
}

// The week file is public historical data. The viewer's market is already open
// for every recommendation; the other market remains gated here.
export function useRecommendationTrends({ season, week, gameId, market, consensus }) {
  const [state, setState] = useState({ status: 'loading', weekData: null });
  useEffect(() => {
    let active = true;
    setState({ status: 'loading', weekData: null });
    loadTrendWeek(season, week).then(
      weekData => { if (active) setState({ status: weekData ? 'ready' : 'missing', weekData }); },
      () => { if (active) setState({ status: 'error', weekData: null }); },
    );
    return () => { active = false; };
  }, [season, week]);
  const cards = useMemo(() => recommendationTrendCards(state.weekData, gameId, market, consensus),
    [state.weekData, gameId, market, consensus]);
  return { status: state.status, cards, reference: state.weekData?.copy?.reference };
}

export function RecommendationTrendDetail({ trend }) {
  if (trend.status === 'loading') return <p className="recommended-source" role="status">Loading historical trends…</p>;
  if (trend.status !== 'ready') return <p className="recommended-source">Historical trends unavailable for this week.</p>;
  if (!trend.cards.length) return <p className="recommended-source">No matching historical trends with a sample for this game.</p>;
  return <section className="recommended-trends" aria-label="Historical trends">
    <h4>Historical context</h4>
    <ul>{trend.cards.map(card => <li key={card.key}>
      <strong>{card.title}</strong>
      <span>{card.record} · {card.sample} · {card.years?.join('–') || 'Period unavailable'}</span>
    </li>)}</ul>
    <p className="recommended-source">Past records are context, not forecasts. {trend.reference || TRENDS_CREDIT} · <a href={TRENDS_SOURCE_URL} target="_blank" rel="noreferrer">Source</a> · <a href={TRENDS_LICENSE_URL} target="_blank" rel="noreferrer">CC BY 4.0</a></p>
  </section>;
}
