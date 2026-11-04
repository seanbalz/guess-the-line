// One gap's historical trends (D-69 step 4; the old RecommendationTrends.jsx in the new app): the published week's public
// trends file through the shared loader (trendsLoaders.js, the cache every trends screen shares), and the market's own
// first two trends with a sample (gapModel.js gapTrendCards). Past records are context, not forecasts; the credit and the
// licence stay in view.
import { useEffect, useMemo, useState } from 'react';
import { TRENDS_CREDIT, TRENDS_LICENSE_URL, TRENDS_SOURCE_URL } from '../../../../../shared/trends-view.mjs';
import { loadTrendWeek } from '../../../trendsLoaders.js';
import { Skeleton } from '../../ui/index.js';
import { gapTrendCards } from './gapModel.js';
import '../../research/assessments.css';

export function useGapTrends({ season, week, gameId, market, consensus }) {
  const [state, setState] = useState({ status: 'loading', weekData: null });
  useEffect(() => {
    let active = true;
    setState({ status: 'loading', weekData: null });
    loadTrendWeek(season, week).then(weekData => { if (active) setState({ status: weekData ? 'ready' : 'missing', weekData }); },
      () => { if (active) setState({ status: 'error', weekData: null }); });
    return () => { active = false; };
  }, [season, week]);
  const cards = useMemo(() => gapTrendCards(state.weekData, gameId, market, consensus), [state.weekData, gameId, market, consensus]);
  return { status: state.status, cards, reference: state.weekData?.copy?.reference };
}

export function GapTrendsView({ trend }) {
  // D-69 4.5: while the week's trends load, two rows in their final shape; the Skeleton keeps the words for screen readers.
  if (trend.status === 'loading') return <Skeleton label="Loading historical trends…" shape="rows" count={2}/>;
  if (trend.status !== 'ready') return <p className="gx-t-meta">Historical trends unavailable for this week.</p>;
  if (!trend.cards.length) return <p className="gx-t-meta">No matching historical trends with a sample for this game.</p>;
  return <section className="gx-vstack gx-gap-8" aria-label="Historical trends">
    <h3 className="gx-t-label gx-c-2">Historical context</h3>
    <ul className="gx-prows">{trend.cards.map(card => <li key={card.key}><div className="gx-prow gx-prow--nopic gx-prow--static">
      <span className="gx-prow-main"><span className="gx-t-strong gx-prow-title">{card.title}</span><span className="gx-t-meta gx-prow-meta">{`${card.sample} · ${card.years?.join('–') || 'Period unavailable'}`}</span></span>
      <span className="gx-prow-end"><span className="gx-n-s gx-prow-value">{card.record}</span></span></div></li>)}</ul>
    <p className="gx-t-meta">Past records are context, not forecasts. {trend.reference || TRENDS_CREDIT} · <a className="gx-ra-link" href={TRENDS_SOURCE_URL} target="_blank" rel="noreferrer">Source</a> · <a className="gx-ra-link" href={TRENDS_LICENSE_URL} target="_blank" rel="noreferrer">CC BY 4.0</a></p>
  </section>;
}

export function GapTrends(props) { return <GapTrendsView trend={useGapTrends(props)}/>; }
