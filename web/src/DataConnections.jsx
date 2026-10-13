import React, { useId } from 'react';
import DecisionAnalysis from './DecisionAnalysis.jsx';
import { ChevronDown, Radio } from 'lucide-react';
import { date } from './api';
import { refreshLabel, scheduleDetails } from './marketStatus';
import { TRENDS_CREDIT, TRENDS_LICENSE_URL, TRENDS_LINE_SOURCE, TRENDS_SOURCE_URL } from '../../shared/trends-view.mjs';

export default function DataConnections({ data }) {
  const trendsTitle = useId();
  const total = data.mode === 'guess_total';
  const available = data.revealed && (data.marketFeed?.collectedAt || data.scoringBenchmark?.capturedAt || data.snapshot);
  const unavailable = [
    ['Outside model projection', `An independently sourced ${total ? 'total-points' : 'spread'} projection is required.`],
    [total ? 'Over / Under tickets %' : 'Public bets / tickets %', `Share of tickets ${total ? 'on Over and Under' : 'on each spread side'} within a provider’s reported sample, not the entire market. Coverage and sample period are unavailable.`],
    [total ? 'Over / Under money %' : 'Public money / handle %', `Share of money ${total ? 'on Over and Under' : 'on each spread side'} within a provider’s reported sample, not the entire market. Coverage and sample period are unavailable.`],
    ['Reported ticket count', 'Absolute tickets in the provider’s sample. No verified count, bookmaker coverage, or period is connected.'],
    ['Sharp action signals', 'No verified source or methodology is connected. Guess gaps and public percentages alone do not establish sharp action.'],
  ];
  return <details className="panel data-connections">
    <summary><Radio size={20}/><span><strong>Data connections</strong><small>{available ? 'Market reference available' : data.revealed ? 'Market reference pending' : 'Market hidden until submission'} · Models & betting activity unavailable</small></span><ChevronDown size={18}/></summary>
    <div className="connection-details"><div className="connection-status"><strong>{refreshLabel(data)}</strong><p>{scheduleDetails(data)}</p>{available && <p>Latest source: {data.scoringBenchmark?.source || data.marketFeed?.source || data.snapshot?.source}. Collected {date(data.scoringBenchmark?.capturedAt || data.marketFeed?.collectedAt || data.snapshot?.capturedAt)} PT.</p>}</div>
      <DecisionAnalysis data={data}/>
      <section className="analysis-sources" aria-label={`${total ? 'Total' : 'Spread'} analysis source availability`}>{unavailable.map(([title, detail]) => <article className="analysis-source" key={title}><div><h3>{title}</h3><span className="badge">Unavailable</span></div><p>{detail}</p><span className="muted">Not connected · No sourced update</span></article>)}</section>
      {data.statuses?.guess_spread?.submittedAt && data.statuses?.guess_total?.submittedAt && <section className="external-research" aria-label="External research directories"><h3>Research at the source</h3><p>These directories may cover both markets. Coverage and publication dates are shown by the publisher. They are external resources, not connected feeds or Guess The Line recommendations.</p><ul><li><a href="https://www.actionnetwork.com/nfl/picks" target="_blank" rel="noreferrer">Action Network · NFL pick directory</a></li><li><a href="https://www.actionnetwork.com/nfl/injury-report" target="_blank" rel="noreferrer">Action Network · NFL injury report</a></li><li><a href="https://www.nfl.com/stats/team-stats/" target="_blank" rel="noreferrer">NFL · Team statistics</a></li></ul></section>}
      {/* Situational trends are a connected weekly source, so they sit apart from the unavailable model and betting-activity sources above. */}
      <section className="trends-data-source" aria-labelledby={trendsTitle}><h3 id={trendsTitle}>Situational trends · nflverse (CC BY 4.0)</h3>
        <p>Past results by game situation, built once a week after Monday night’s final from the free <a href={TRENDS_SOURCE_URL} target="_blank" rel="noreferrer">nflverse schedule release</a>. {TRENDS_CREDIT}; <a href={TRENDS_LICENSE_URL} target="_blank" rel="noreferrer">license</a>. Line source: {TRENDS_LINE_SOURCE}. Forecast weather is not connected, so observed-weather trends apply to played games only.</p>
        <p className="muted">Weekly file · Reference only · Never changes scoring</p></section>
      <p className="connection-caution">Betting suggestions are not connected. A guess-to-market gap measures disagreement, not positive expected value.</p>
    </div>
  </details>;
}
