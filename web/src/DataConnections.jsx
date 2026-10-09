import React from 'react';
import DecisionAnalysis from './DecisionAnalysis.jsx';
import { ChevronDown, Radio } from 'lucide-react';
import { date } from './api';
import { refreshLabel, scheduleDetails } from './marketStatus';

export default function DataConnections({ data }) {
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
      <p className="connection-caution">Betting suggestions are not connected. A guess-to-market gap measures disagreement, not positive expected value.</p>
    </div>
  </details>;
}
