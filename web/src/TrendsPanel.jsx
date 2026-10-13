import React from 'react';
import { LoaderCircle, RefreshCw, TriangleAlert } from 'lucide-react';
import TrendsView from './TrendsView.jsx';
import { firstTrendWeek, useOfficials, useTrendWeek } from './trendsData.js';

/** Loads the week file (a lazy chunk) and the hosted referee assignments, then renders the panel. */
export default function TrendsPanel({ season, week, gameId, ...view }) {
  const data = useTrendWeek(season, week);
  const officials = useOfficials(season, week, data.status === 'ready');
  if (data.status === 'loading' || data.status === 'idle') return <p className="trends-status" role="status"><LoaderCircle className="spin" size={16} aria-hidden="true"/>Loading trends…</p>;
  if (data.status === 'error') return <div className="error-banner" role="alert"><TriangleAlert size={18} aria-hidden="true"/><span>Trends could not load. Check your connection and try again.</span>
    <button type="button" className="text-button" onClick={data.retry}><RefreshCw size={16} aria-hidden="true"/>Retry</button></div>;
  if (data.status === 'missing') {
    const first = firstTrendWeek(season);
    return <p className="trends-empty" role="status">{first !== null && week < first ? `Situational trends start with Week ${first} of the ${season} season; Week ${week} has none.` : `Trends for Week ${week} publish after Monday night’s final.`}</p>;
  }
  return <TrendsView week={data.week} gameId={gameId} officials={officials} {...view}/>;
}
