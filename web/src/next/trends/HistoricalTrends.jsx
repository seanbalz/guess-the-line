import { useId, useState } from 'react';
import { Button, InfoButton } from '../ui/index.js';
import { PERIODS, ResearchCards, ResearchStatus, ResearchTime } from '../research/ResearchCards.jsx';
import { useResearch } from '../research/useResearch.js';
import { INFO } from '../info.js';
import { TrendAvailability } from '../lines/parts.jsx';
import { SavedTrendsSummary } from './SavedTrendsSummary.jsx';
import '../research/research.css';

/** The approved historical row list uses the same scoped, fail-closed research reader as the full research sheet. */
export function HistoricalTrends({ lines, market, view, onChange, onBuild }) {
  const id = useId(), [limit, setLimit] = useState(12);
  const period = Object.hasOwn(PERIODS, view?.period) ? view.period : 'season';
  const request = { ...lines, filters: { period, ...(market === 'all' ? {} : { market }) } };
  const read = useResearch(request), data = read.data;
  const ids = (data?.explore ?? data?.candidates?.map(candidate => candidate.id) ?? []).filter(id => {
    const candidate = data?.candidates.find(candidate => candidate.id === id);
    return candidate && (market === 'all' || candidate.market === market);
  });
  if (!lines.shown) return <p className="gx-t-body gx-c-2" role="status">Waiting for a published week.</p>;
  return <section className="gx-vstack gx-gap-16 gx-history-trends" aria-label="Historical trends">
    <p className="gx-t-body gx-c-2">ATS and totals, with the history behind them.</p>
    <div className="gx-r-filter"><label className="gx-t-meta" htmlFor={id}>Evidence period</label><select id={id} value={period} onChange={event => { onChange({ period: event.target.value }); setLimit(12); }}>{Object.entries(PERIODS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
    <ResearchStatus read={read}/>
    {data ? <>
      <div className="gx-r-context"><p className="gx-t-meta gx-c-2 gx-grow" role="status">{ids.length} historical situations · Win rate · W–L–P</p>
        <InfoButton title="About historical trends" body={[...INFO.researchData.body, `History: ${data.history.status}.`, data.history.source?.modified, data.history.source?.caveat].filter(Boolean)} links={data.history.source ? [{ text: data.history.source.credit, url: data.history.source.url }, { text: data.history.source.license, url: data.history.source.licenseUrl }] : INFO.researchData.links}>
          <p className="gx-t-body">Snapshot: <ResearchTime value={data.history.snapshotAsOf}/></p><p className="gx-t-body">Period anchored to <ResearchTime value={data.history.periodAnchor}/></p>
        </InfoButton>
      </div>
      {data.history.status !== 'fresh' ? <p className="gx-t-meta" role="status">History: {data.history.status}. Dated evidence remains descriptive.</p> : null}
      <h2 className="gx-sr-only">Historical situations</h2>
      <ResearchCards data={data} ids={ids} limit={limit} request={request} openFirst={false} valueMetric="winRate" historical showSample headingLevel={3}/>
      {ids.length > limit ? <Button variant="secondary" onClick={() => setLimit(value => value + 12)}>Show more situations</Button> : null}
      <p className="gx-t-meta gx-c-2">Curves show illustrative units at −110. Historical results, not a current-game recommendation.</p>
    </> : null}
    <TrendAvailability week={lines.trendsWeek}/>
    <SavedTrendsSummary lines={lines} onOpen={onBuild}/>
    <Button variant="secondary" onClick={read.reload}>Refresh historical trends</Button>
  </section>;
}
